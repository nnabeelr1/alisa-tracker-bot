import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta

from google import genai
from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.types import Message, BufferedInputFile
from dotenv import load_dotenv
from supabase import create_client
import pandas as pd

# ── Setup ──────────────────────────────────────────────────────────────────
load_dotenv()
logging.basicConfig(level=logging.INFO)

BOT_TOKEN        = os.getenv("TELEGRAM_TOKEN")
ALLOWED_USER_ID  = int(os.getenv("TELEGRAM_USER_ID"))
GEMINI_API_KEY   = os.getenv("GEMINI_API_KEY")
SUPABASE_URL     = os.getenv("SUPABASE_URL")
SUPABASE_KEY     = os.getenv("SUPABASE_KEY")

TARGET_PROTEIN   = float(os.getenv("TARGET_PROTEIN_G", 150))
TARGET_KALORI    = float(os.getenv("TARGET_KALORI_KCAL", 2000))
TARGET_BUDGET    = int(os.getenv("TARGET_BUDGET_IDR", 100000))

WIB = timezone(timedelta(hours=7))

gemini = genai.Client(api_key=GEMINI_API_KEY)
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

bot = Bot(token=BOT_TOKEN)
dp  = Dispatcher()

# ── System prompt Gemini ───────────────────────────────────────────────────
SYSTEM_PROMPT = """Kamu adalah parser makanan & pengeluaran. Tugasmu HANYA mengembalikan JSON valid, tanpa teks lain.

Aturan:
1. Pisahkan tiap makanan jadi item berbeda di array "items"
2. Kalau total harga tidak dirinci per item → isi "harga" null, isi "total_harga" saja
3. Kalau berat disebutkan (misal "300g dada ayam") → hitung protein/kalori dari berat itu, is_estimated: false
4. Kalau berat tidak disebutkan → estimasi dari porsi normal, is_estimated: true
5. Infer meal_type dari jam yang diinject (breakfast/lunch/dinner/snack)
6. Kalau input bukan makanan/pengeluaran → return {"error": "bukan makanan", "items": []}

Schema wajib:
{
  "items": [
    {
      "item": "nama makanan",
      "harga": null,
      "protein_g": 0.0,
      "kalori_kcal": 0.0,
      "meal_type": "lunch",
      "is_estimated": true
    }
  ],
  "total_harga": null,
  "error": null
}"""

# ── Helper: ambil data hari ini ────────────────────────────────────────────
def get_today_summary():
    now_wib = datetime.now(WIB)
    today_str = now_wib.strftime("%Y-%m-%d")

    res = supabase.table("logs").select("*").execute()
    rows = [
        r for r in res.data
        if r["waktu"][:10] == today_str
    ]

    total_protein = sum(r["protein_g"] or 0 for r in rows)
    total_kalori  = sum(r["kalori_kcal"] or 0 for r in rows)
    total_budget  = sum(r["harga"] or 0 for r in rows)

    # total_harga dari transaksi (hindari double count)
    seen_tx = set()
    for r in rows:
        tx = r["transaction_id"]
        if tx not in seen_tx:
            seen_tx.add(tx)
            # ambil total_harga dari row pertama transaksi ini
            tx_rows = [x for x in rows if x["transaction_id"] == tx]
            # cek apakah ada harga per item
            has_per_item = any(x["harga"] for x in tx_rows)
            if not has_per_item:
                # pakai total_harga (simpan di field terpisah, skip untuk sekarang)
                pass

    # Budget: sum harga per item saja dulu
    total_budget = sum(r["harga"] or 0 for r in rows)

    return total_protein, total_kalori, total_budget, rows

def progress_bar(current, target, length=10):
    pct = min(current / target, 1.0) if target > 0 else 0
    filled = int(pct * length)
    bar = "▓" * filled + "░" * (length - filled)
    return f"{bar} {pct*100:.0f}%"

def format_summary(protein, kalori, budget):
    lines = [
        f"Protein : {protein:.1f}/{TARGET_PROTEIN:.0f}g {progress_bar(protein, TARGET_PROTEIN)}",
        f"Kalori  : {kalori:.0f}/{TARGET_KALORI:.0f} kcal {progress_bar(kalori, TARGET_KALORI)}",
        f"Budget  : {budget:,}/{TARGET_BUDGET:,} IDR {progress_bar(budget, TARGET_BUDGET)}",
    ]
    return "\n".join(lines)

# ── Guard: hanya user yang diizinkan ──────────────────────────────────────
def is_allowed(message: Message) -> bool:
    return message.from_user.id == ALLOWED_USER_ID

# ── Handler: pesan biasa (log makanan) ────────────────────────────────────
@dp.message(F.text & ~F.text.startswith("/"))
async def handle_food_log(message: Message):
    if not is_allowed(message): return

    now_wib = datetime.now(WIB)
    jam_str = now_wib.strftime("%H:%M")
    user_input = message.text

    prompt = f"{SYSTEM_PROMPT}\n\nSekarang jam {jam_str} WIB.\nUser: {user_input}"

    try:
        response = gemini.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        raw = response.text.strip()
        # Bersihkan markdown code block kalau ada
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        data = json.loads(raw)
    except Exception as e:
        await message.answer(f"⚠️ Gagal parse response Gemini: {e}")
        return

    if data.get("error"):
        await message.answer(f"❓ {data['error']}\n\nCoba ketik nama makanan yang kamu makan, Abeel!")
        return

    items = data.get("items", [])
    if not items:
        await message.answer("❓ Nggak nemu makanan di pesanmu. Coba lagi ya!")
        return

    tx_id = str(uuid.uuid4())
    total_harga_raw = data.get("total_harga")
    total_harga = int(round(total_harga_raw)) if total_harga_raw is not None else None

    # Insert ke Supabase
    rows_to_insert = []
    for item in items:
        harga_raw = item.get("harga")
        rows_to_insert.append({
            "transaction_id": tx_id,
            "waktu": now_wib.isoformat(),
            "meal_type": item.get("meal_type", "snack"),
            "item": item.get("item", ""),
            "harga": int(round(harga_raw)) if harga_raw is not None else None,
            "total_harga": total_harga,
            "protein_g": item.get("protein_g", 0),
            "kalori_kcal": item.get("kalori_kcal", 0),
            "is_estimated": item.get("is_estimated", True),
        })

    try:
        supabase.table("logs").insert(rows_to_insert).execute()
    except Exception as e:
        await message.answer(f"⚠️ Gagal simpan ke database: {e}")
        return

    # Balas ringkasan item
    lines = ["✅ Dicatat, Abeel!\n"]
    for item in items:
        est = " ~" if item.get("is_estimated") else ""
        lines.append(f"· {item['item']} → {item.get('protein_g',0):.1f}g protein{est}, {item.get('kalori_kcal',0):.0f} kcal")

    if total_harga:
        lines.append(f"· Total harga: Rp {total_harga:,}")

    lines.append("─" * 24)

    # Summary hari ini
    protein, kalori, budget, _ = get_today_summary()
    lines.append(format_summary(protein, kalori, budget))

    # Alert
    alerts = []
    if budget >= TARGET_BUDGET * 0.8:
        alerts.append(f"⚠️ Budget udah {budget/TARGET_BUDGET*100:.0f}% dari target!")
    if kalori >= TARGET_KALORI * 0.9:
        alerts.append(f"⚠️ Kalori udah {kalori/TARGET_KALORI*100:.0f}% dari target!")
    if alerts:
        lines.append("")
        lines.extend(alerts)

    # Motivasi protein
    sisa_protein = TARGET_PROTEIN - protein
    if sisa_protein > 0:
        lines.append(f"\n💪 Masih butuh {sisa_protein:.0f}g protein lagi hari ini.")

    await message.answer("\n".join(lines))

# ── /undo ──────────────────────────────────────────────────────────────────
@dp.message(Command("undo"))
async def handle_undo(message: Message):
    if not is_allowed(message): return

    # Ambil transaction_id terakhir hari ini
    now_wib = datetime.now(WIB)
    today_str = now_wib.strftime("%Y-%m-%d")

    res = supabase.table("logs").select("transaction_id, waktu").execute()
    today_rows = [r for r in res.data if r["waktu"][:10] == today_str]

    if not today_rows:
        await message.answer("Nggak ada log hari ini yang bisa di-undo.")
        return

    last_tx = sorted(today_rows, key=lambda x: x["waktu"], reverse=True)[0]["transaction_id"]

    # Hapus semua baris dengan transaction_id itu
    supabase.table("logs").delete().eq("transaction_id", last_tx).execute()

    await message.answer("↩️ Transaksi terakhir dihapus. Mau log ulang?")

# ── /status ────────────────────────────────────────────────────────────────
@dp.message(Command("status"))
async def handle_status(message: Message):
    if not is_allowed(message): return

    now_wib = datetime.now(WIB)
    hari = now_wib.strftime("%A, %d %b %Y %H:%M WIB")

    protein, kalori, budget, _ = get_today_summary()

    text = f"📊 Status hari ini ({hari}):\n\n{format_summary(protein, kalori, budget)}"
    await message.answer(text)

# ── /stats ─────────────────────────────────────────────────────────────────
@dp.message(Command("stats"))
async def handle_stats(message: Message):
    if not is_allowed(message): return

    _, _, _, rows = get_today_summary()

    meal_types = ["breakfast", "lunch", "dinner", "snack"]
    lines = ["📈 Breakdown hari ini:\n"]
    for mt in meal_types:
        mt_rows = [r for r in rows if r["meal_type"] == mt]
        if not mt_rows: continue
        p = sum(r["protein_g"] or 0 for r in mt_rows)
        k = sum(r["kalori_kcal"] or 0 for r in mt_rows)
        lines.append(f"*{mt.capitalize()}*: {p:.1f}g protein · {k:.0f} kcal")

    if len(lines) == 1:
        await message.answer("Belum ada log hari ini.")
        return

    await message.answer("\n".join(lines), parse_mode="Markdown")

# ── /history ───────────────────────────────────────────────────────────────
@dp.message(Command("history"))
async def handle_history(message: Message):
    if not is_allowed(message): return

    res = supabase.table("logs").select("*").order("waktu", desc=True).limit(10).execute()
    rows = res.data

    if not rows:
        await message.answer("Belum ada log sama sekali.")
        return

    lines = ["📋 10 log terakhir:\n"]
    for r in rows:
        waktu_raw = r["waktu"][:16].replace("T", " ")
        lines.append(f"· {waktu_raw} | {r['item']} | {r.get('protein_g',0):.1f}g | {r.get('kalori_kcal',0):.0f} kcal")

    await message.answer("\n".join(lines))

# ── /export ────────────────────────────────────────────────────────────────
@dp.message(Command("export"))
async def handle_export(message: Message):
    if not is_allowed(message): return

    text = message.text.lower()
    now_wib = datetime.now(WIB)

    res = supabase.table("logs").select("*").order("waktu").execute()
    rows = res.data

    if "minggu" in text:
        cutoff = (now_wib - timedelta(days=7)).strftime("%Y-%m-%d")
        rows = [r for r in rows if r["waktu"][:10] >= cutoff]
        label = "minggu_ini"
    else:
        today_str = now_wib.strftime("%Y-%m-%d")
        rows = [r for r in rows if r["waktu"][:10] == today_str]
        label = "hari_ini"

    if not rows:
        await message.answer("Nggak ada data untuk diekspor.")
        return

    df = pd.DataFrame(rows)
    filename = f"alisa_{label}_{now_wib.strftime('%Y%m%d')}.xlsx"
    filepath = f"/tmp/{filename}"
    df.to_excel(filepath, index=False)

    with open(filepath, "rb") as f:
        file_data = f.read()

    await message.answer_document(
        BufferedInputFile(file_data, filename=filename),
        caption=f"📁 Export {label} — {len(rows)} baris"
    )

# ── /help ──────────────────────────────────────────────────────────────────
@dp.message(Command("help"))
async def handle_help(message: Message):
    if not is_allowed(message): return

    text = """🤖 *Alisa Tracker Bot*

*Cara pakai:*
Ketik aja makanan yang kamu makan, contoh:
· `300g dada ayam sama nasi putih 200g`
· `nasi padang + es teh 25rb`
· `2 butir telur rebus`

*Commands:*
/status — ringkasan hari ini
/stats — breakdown per meal type
/undo — hapus log terakhir
/history — 10 log terakhir
/export — export Excel hari ini
/export minggu ini — export 7 hari terakhir
/help — bantuan ini"""

    await message.answer(text, parse_mode="Markdown")

# ── /start ─────────────────────────────────────────────────────────────────
@dp.message(Command("start"))
async def handle_start(message: Message):
    if not is_allowed(message): return
    await message.answer("Halo Abeel! 👋 Alisa siap tracking nutrisi & budget kamu.\n\nKetik /help untuk lihat cara pakai.")

# ── Main ───────────────────────────────────────────────────────────────────
async def main():
    logging.info("Alisa Bot starting...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())