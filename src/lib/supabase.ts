import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Fail loud in dev so a missing .env is obvious, not a silent 401 later.
  throw new Error(
    'Supabase env ไม่ครบ — ตั้ง VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ใน .env (ดู .env.example)',
  )
}

/**
 * Single shared Supabase client for the whole app.
 * Reads config from Vite env only — no secrets are hardcoded, and the anon key
 * is safe on the client because every table enforces RLS (auth.uid() = user_id).
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
