// player-forgot-password — direct in-page password recovery.
// Flow: verify username + registered email -> directly set new password.
// The service-role key is used only inside this Edge Function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const MIN_PASSWORD_LENGTH = 8

const ALLOWED_ORIGINS = new Set([
  'https://portal.surewin.app',
  'https://surewin-player-portal.pages.dev',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

async function checkRateLimit(adminDb: ReturnType<typeof createClient>, key: string) {
  try {
    const { data, error } = await adminDb.rpc('check_rate_limit', {
      p_key: key,
      p_max_attempts: 20,
      p_window_secs: 900,
    })
    if (error) {
      console.error('[player-forgot-password] rate limit RPC:', error)
      return true
    }
    return data !== false
  } catch (error) {
    console.error('[player-forgot-password] rate limit exception:', error)
    return true
  }
}

function getClientIp(req: Request) {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req)

  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, cors)

  const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const body = await req.json()
    const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : ''
    const action = typeof body?.action === 'string' ? body.action : (newPassword ? 'reset_direct' : 'verify')

    if (!username || !email) {
      return json({ error: 'Username and email are required.' }, 400, cors)
    }

    const clientIp = getClientIp(req)

    if (!(await checkRateLimit(adminDb, `forgot-${action}:${clientIp}`))) {
      return json({ error: 'Too many attempts. Please try again later.' }, 429, cors)
    }

    if (action !== 'verify' && action !== 'reset_direct') {
      return json({ error: 'Invalid action.' }, 400, cors)
    }

    // Match the player record in one query. Service-role access bypasses RLS.
    const { data: account, error: accountErr } = await adminDb
      .from('player_accounts')
      .select('internal_email, username, email, is_active')
      .eq('username', username)
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle()

    if (accountErr) {
      console.error('[player-forgot-password] account lookup:', accountErr)
      return json({ error: 'Unable to verify account. Please try again.' }, 500, cors)
    }

    if (!account) {
      return json({ error: 'The username and registered email do not match.' }, 401, cors)
    }

    if (action === 'verify') {
      return json({ verified: true, ok: true }, 200, cors)
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400, cors)
    }

    // internal_email is the UUID-backed auth identity used for player accounts.
    // We deliberately do not call generateLink(): this flow changes the password
    // directly and therefore does not depend on Auth redirect URL configuration.
    const userId = String(account.internal_email || '').split('@')[0]
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      console.error('[player-forgot-password] invalid internal auth user id')
      return json({ error: 'Unable to change password. Please contact support.' }, 500, cors)
    }

    const { data: authUser, error: authLookupErr } = await adminDb.auth.admin.getUserById(userId)
    if (authLookupErr || !authUser?.user) {
      console.error('[player-forgot-password] auth user lookup:', authLookupErr)
      return json({ error: 'Unable to change password. Please try again.' }, 500, cors)
    }

    const { error: updateErr } = await adminDb.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (updateErr) {
      console.error('[player-forgot-password] password update:', updateErr)
      return json({ error: 'Unable to change password. Please try again.' }, 500, cors)
    }

    return json({ ok: true, success: true, message: 'Password changed successfully.' }, 200, cors)
  } catch (error) {
    console.error('[player-forgot-password] unhandled:', error)
    return json({ error: 'Unable to process password reset.' }, 500, cors)
  }
})
