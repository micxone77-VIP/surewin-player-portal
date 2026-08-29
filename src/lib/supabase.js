// Player Portal ? Supabase client
// Uses same project as CRM (different app, same Supabase project).
// NEVER use service_role key here. Anon key only.
import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set.')
}

export const supabase = createClient(url, key, {
  auth: {
    // Persist player session in localStorage with a portal-specific key
    // so it does not collide with any CRM session on the same device.
    storageKey: 'surewin-portal-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export const PLAYER_AUTH_URL      = import.meta.env.VITE_PLAYER_AUTH_URL
export const PLAYER_FORGOT_PW_URL = import.meta.env.VITE_PLAYER_FORGOT_PASSWORD_URL
