import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Log = {
  id: string
  waktu: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  item: string
  harga: number | null
  total_harga: number | null
  protein_g: number
  kalori_kcal: number
  is_estimated: boolean
  transaction_id: string
}