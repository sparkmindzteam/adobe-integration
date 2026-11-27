import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null

export const GIF_BUCKET = 'gif-booth'

export type BoothSession = {
  id: string
  created_at: string
  gif_path: string
  gif_url: string | null
  frame_count: number
  status: string
}
