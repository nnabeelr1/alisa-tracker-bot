'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, Log } from '@/lib/supabase'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Trash2, Pencil, Check, X, Plus, TrendingUp, Flame, Wallet, UtensilsCrossed } from 'lucide-react'

const TARGET_PROTEIN = 100
const TARGET_KALORI = 2000
const TARGET_BUDGET = 40000

const MEAL_COLORS: Record<string, string> = {
  breakfast: '#F59E0B',
  lunch: '#10B981',
  dinner: '#6366F1',
  snack: '#F43F5E',
}

function getTodayWIB() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
    .toISOString().split('T')[0]
}

function getWeekDates() {
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (6 - i))
    return d.toISOString().split('T')[0]
  })
}

function RingProgress({ value, max, color, size = 80 }: { value: number, max: number, color: string, size?: number }) {
  const pct = Math.min(value / max, 1)
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const dash = pct * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(.4,0,.2,1)' }} />
    </svg>
  )
}

export default function Dashboard() {
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<Log>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newLog, setNewLog] = useState({ item: '', meal_type: 'snack', protein_g: 0, kalori_kcal: 0, harga: 0 })
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'weekly'>('today')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('logs').select('*').order('waktu', { ascending: false })
    setLogs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const today = getTodayWIB()
  const todayLogs = logs.filter(l => l.waktu.startsWith(today))
  const totalProtein = todayLogs.reduce((s, l) => s + (l.protein_g || 0), 0)
  const totalKalori = todayLogs.reduce((s, l) => s + (l.kalori_kcal || 0), 0)
  const totalBudget = todayLogs.reduce((s, l) => s + (l.harga || 0), 0)

  // Weekly chart data
  const weekDates = getWeekDates()
  const weeklyData = weekDates.map(date => {
    const dayLogs = logs.filter(l => l.waktu.startsWith(date))
    return {
      date: date.slice(5),
      protein: Math.round(dayLogs.reduce((s, l) => s + (l.protein_g || 0), 0)),
      kalori: Math.round(dayLogs.reduce((s, l) => s + (l.kalori_kcal || 0), 0)),
      budget: dayLogs.reduce((s, l) => s + (l.harga || 0), 0),
    }
  })

  const handleDelete = async (id: string) => {
    await supabase.from('logs').delete().eq('id', id)
    fetchLogs()
  }

  const handleEdit = (log: Log) => {
    setEditId(log.id)
    setEditData({ item: log.item, meal_type: log.meal_type, protein_g: log.protein_g, kalori_kcal: log.kalori_kcal, harga: log.harga })
  }

  const handleSaveEdit = async () => {
    await supabase.from('logs').update(editData).eq('id', editId)
    setEditId(null)
    fetchLogs()
  }

  const handleAdd = async () => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toISOString()
    await supabase.from('logs').insert([{
      ...newLog,
      waktu: now,
      transaction_id: crypto.randomUUID(),
      is_estimated: true,
    }])
    setShowAdd(false)
    setNewLog({ item: '', meal_type: 'snack', protein_g: 0, kalori_kcal: 0, harga: 0 })
    fetchLogs()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a', color: '#e2e8f0', fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <header style={{ borderBottom: '1px solid #1e293b', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>
            🤖 Alisa <span style={{ color: '#38bdf8' }}>Dashboard</span>
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          background: '#38bdf8', color: '#0a0f1a', border: 'none', borderRadius: 8,
          padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <Plus size={15} /> Log Makanan
        </button>
      </header>

      {/* Tabs */}
      <div style={{ padding: '0 32px', borderBottom: '1px solid #1e293b', display: 'flex', gap: 0 }}>
        {(['today', 'weekly', 'history'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: 'none', border: 'none', color: activeTab === tab ? '#38bdf8' : '#475569',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 13,
            padding: '14px 20px', cursor: 'pointer', borderBottom: activeTab === tab ? '2px solid #38bdf8' : '2px solid transparent',
            transition: 'all 0.2s'
          }}>
            {tab === 'today' ? 'Hari Ini' : tab === 'weekly' ? 'Mingguan' : 'History'}
          </button>
        ))}
      </div>

      <main style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
        {loading && <p style={{ color: '#475569', fontSize: 13 }}>Memuat data...</p>}

        {/* TODAY TAB */}
        {activeTab === 'today' && !loading && (
          <>
            {/* Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
              {[
                { label: 'Protein', value: totalProtein, max: TARGET_PROTEIN, unit: 'g', color: '#38bdf8', icon: <TrendingUp size={16} /> },
                { label: 'Kalori', value: totalKalori, max: TARGET_KALORI, unit: 'kcal', color: '#f97316', icon: <Flame size={16} /> },
                { label: 'Budget', value: totalBudget, max: TARGET_BUDGET, unit: 'IDR', color: '#a78bfa', icon: <Wallet size={16} /> },
              ].map(stat => (
                <div key={stat.label} style={{
                  background: '#0f172a', borderRadius: 14, padding: '20px 24px',
                  border: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 20
                }}>
                  <RingProgress value={stat.value} max={stat.max} color={stat.color} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                      {stat.icon} {stat.label}
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600, fontFamily: "'Syne', sans-serif", color: stat.color }}>
                      {stat.unit === 'IDR' ? `Rp ${stat.value.toLocaleString('id')}` : `${Math.round(stat.value)}${stat.unit}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                      dari {stat.unit === 'IDR' ? `Rp ${stat.max.toLocaleString('id')}` : `${stat.max}${stat.unit}`} · {Math.round(stat.value / stat.max * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Today logs */}
            <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                <UtensilsCrossed size={15} color="#38bdf8" />
                <span style={{ fontSize: 13, fontWeight: 500 }}>Log Hari Ini</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>{todayLogs.length} item</span>
              </div>
              {todayLogs.length === 0 && (
                <p style={{ padding: '24px 20px', color: '#475569', fontSize: 13, margin: 0 }}>Belum ada log hari ini.</p>
              )}
              {todayLogs.map(log => (
                <div key={log.id} style={{
                  padding: '12px 20px', borderBottom: '1px solid #1e293b',
                  display: 'flex', alignItems: 'center', gap: 12
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                    background: MEAL_COLORS[log.meal_type] + '22',
                    color: MEAL_COLORS[log.meal_type], whiteSpace: 'nowrap'
                  }}>{log.meal_type}</span>

                  {editId === log.id ? (
                    <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                      <input value={editData.item || ''} onChange={e => setEditData({ ...editData, item: e.target.value })}
                        style={inputStyle} placeholder="Item" />
                      <input type="number" value={editData.protein_g || 0} onChange={e => setEditData({ ...editData, protein_g: +e.target.value })}
                        style={{ ...inputStyle, width: 80 }} placeholder="Protein" />
                      <input type="number" value={editData.kalori_kcal || 0} onChange={e => setEditData({ ...editData, kalori_kcal: +e.target.value })}
                        style={{ ...inputStyle, width: 80 }} placeholder="Kalori" />
                      <input type="number" value={editData.harga || 0} onChange={e => setEditData({ ...editData, harga: +e.target.value })}
                        style={{ ...inputStyle, width: 100 }} placeholder="Harga" />
                      <button onClick={handleSaveEdit} style={btnStyle('#10b981')}><Check size={13} /></button>
                      <button onClick={() => setEditId(null)} style={btnStyle('#ef4444')}><X size={13} /></button>
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13 }}>{log.item}{log.is_estimated ? ' ~' : ''}</span>
                      <span style={{ fontSize: 12, color: '#38bdf8', whiteSpace: 'nowrap' }}>{log.protein_g}g</span>
                      <span style={{ fontSize: 12, color: '#f97316', whiteSpace: 'nowrap' }}>{log.kalori_kcal} kcal</span>
                      {log.harga && <span style={{ fontSize: 12, color: '#a78bfa', whiteSpace: 'nowrap' }}>Rp {log.harga.toLocaleString('id')}</span>}
                      <button onClick={() => handleEdit(log)} style={iconBtn}><Pencil size={13} /></button>
                      <button onClick={() => handleDelete(log.id)} style={iconBtn}><Trash2 size={13} color="#ef4444" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* WEEKLY TAB */}
        {activeTab === 'weekly' && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { key: 'protein', label: 'Protein (g)', color: '#38bdf8', target: TARGET_PROTEIN },
              { key: 'kalori', label: 'Kalori (kcal)', color: '#f97316', target: TARGET_KALORI },
              { key: 'budget', label: 'Budget (IDR)', color: '#a78bfa', target: TARGET_BUDGET },
            ].map(chart => (
              <div key={chart.key} style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', padding: '20px 24px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16, color: chart.color }}>{chart.label}</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={weeklyData}>
                    <defs>
                      <linearGradient id={`grad-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chart.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#475569' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey={chart.key} stroke={chart.color} strokeWidth={2}
                      fill={`url(#grad-${chart.key})`} dot={{ fill: chart.color, r: 4 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}

        {/* HISTORY TAB */}
        {activeTab === 'history' && !loading && (
          <div style={{ background: '#0f172a', borderRadius: 14, border: '1px solid #1e293b', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b' }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Semua Log</span>
              <span style={{ marginLeft: 12, fontSize: 11, color: '#475569' }}>{logs.length} total</span>
            </div>
            {logs.map(log => (
              <div key={log.id} style={{
                padding: '12px 20px', borderBottom: '1px solid #1e293b',
                display: 'flex', alignItems: 'center', gap: 12
              }}>
                <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap', minWidth: 110 }}>
                  {log.waktu.slice(0, 16).replace('T', ' ')}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4,
                  background: MEAL_COLORS[log.meal_type] + '22', color: MEAL_COLORS[log.meal_type], whiteSpace: 'nowrap'
                }}>{log.meal_type}</span>

                {editId === log.id ? (
                  <div style={{ display: 'flex', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    <input value={editData.item || ''} onChange={e => setEditData({ ...editData, item: e.target.value })}
                      style={inputStyle} placeholder="Item" />
                    <input type="number" value={editData.protein_g || 0} onChange={e => setEditData({ ...editData, protein_g: +e.target.value })}
                      style={{ ...inputStyle, width: 80 }} placeholder="Protein" />
                    <input type="number" value={editData.kalori_kcal || 0} onChange={e => setEditData({ ...editData, kalori_kcal: +e.target.value })}
                      style={{ ...inputStyle, width: 80 }} placeholder="Kalori" />
                    <button onClick={handleSaveEdit} style={btnStyle('#10b981')}><Check size={13} /></button>
                    <button onClick={() => setEditId(null)} style={btnStyle('#ef4444')}><X size={13} /></button>
                  </div>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13 }}>{log.item}</span>
                    <span style={{ fontSize: 12, color: '#38bdf8', whiteSpace: 'nowrap' }}>{log.protein_g}g</span>
                    <span style={{ fontSize: 12, color: '#f97316', whiteSpace: 'nowrap' }}>{log.kalori_kcal} kcal</span>
                    <button onClick={() => handleEdit(log)} style={iconBtn}><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(log.id)} style={iconBtn}><Trash2 size={13} color="#ef4444" /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add Log Modal */}
      {showAdd && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
          <div style={{ background: '#0f172a', borderRadius: 16, border: '1px solid #1e293b', padding: 28, width: 360 }}>
            <h3 style={{ fontFamily: "'Syne', sans-serif", margin: '0 0 20px', fontSize: 16 }}>Log Makanan Manual</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Nama makanan" value={newLog.item}
                onChange={e => setNewLog({ ...newLog, item: e.target.value })}
                style={{ ...inputStyle, width: '100%' }} />
              <select value={newLog.meal_type} onChange={e => setNewLog({ ...newLog, meal_type: e.target.value })}
                style={{ ...inputStyle, width: '100%' }}>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <input type="number" placeholder="Protein (g)" value={newLog.protein_g}
                  onChange={e => setNewLog({ ...newLog, protein_g: +e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Kalori" value={newLog.kalori_kcal}
                  onChange={e => setNewLog({ ...newLog, kalori_kcal: +e.target.value })} style={inputStyle} />
                <input type="number" placeholder="Harga" value={newLog.harga}
                  onChange={e => setNewLog({ ...newLog, harga: +e.target.value })} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={handleAdd} style={{ ...btnStyle('#38bdf8'), flex: 1, justifyContent: 'center' }}>Simpan</button>
              <button onClick={() => setShowAdd(false)} style={{ ...btnStyle('#1e293b'), flex: 1, justifyContent: 'center' }}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: '#1e293b', border: '1px solid #334155', borderRadius: 7,
  color: '#e2e8f0', padding: '7px 10px', fontSize: 12, outline: 'none', width: '100%'
}

const iconBtn: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: '#475569',
  padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center'
}

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg, border: 'none', borderRadius: 7, color: bg === '#1e293b' ? '#94a3b8' : '#0a0f1a',
  padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: 4
})