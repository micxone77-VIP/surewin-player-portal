// playerAuth.js — Player Portal authentication helpers.
// All player authentication calls go through Supabase Edge Functions.
// Never exposes internal_email to the browser.

import { PLAYER_AUTH_URL, PLAYER_FORGOT_PW_URL } from './supabase'

/**
 * Login player with username + password.
 */
export async function callPlayerAuth(username, password) {
  let res

  try {
    res = await fetch(PLAYER_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        password,
      }),
    })
  } catch (err) {
    return {
      error: 'Network error. Please check your connection.',
      status: 0,
    }
  }

  let body

  try {
    body = await res.json()
  } catch {
    return {
      error: 'Unexpected response. Please try again.',
      status: res.status,
    }
  }

  if (res.status === 200 && body.session) {
    return {
      session: body.session,
      status: 200,
    }
  }

  if (res.status === 401) {
    return {
      error: 'Invalid credentials.',
      status: 401,
    }
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After')
    const mins = retryAfter
      ? Math.ceil(Number(retryAfter) / 60)
      : 15

    return {
      error: `Too many login attempts. Please try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
      status: 429,
    }
  }

  return {
    error: body?.error || 'Something went wrong. Please try again.',
    status: res.status,
  }
}

/**
 * Verify username + registered email.
 *
 * When newPassword is omitted:
 *   action = verify
 *
 * When newPassword is supplied:
 *   action = reset_direct
 *
 * No email provider or reset email is required.
 */
export async function callForgotPassword(username, email, newPassword = '') {
  let res

  try {
    res = await fetch(PLAYER_FORGOT_PW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),

        // IMPORTANT:
        // Backend expects "new_password".
        // Previously the frontend was not sending this field.
        ...(newPassword
          ? {
              action: 'reset_direct',
              new_password: newPassword,
            }
          : {
              action: 'verify',
            }),
      }),
    })
  } catch (err) {
    return {
      error: 'Network error. Please check your connection.',
      status: 0,
    }
  }

  let body = {}

  try {
    body = await res.json()
  } catch {
    // Keep body empty if response is not JSON.
  }

  if (res.status === 429) {
    return {
      error:
        body?.error ||
        'Too many requests. Please try again later.',
      status: 429,
    }
  }

  if (!res.ok) {
    return {
      error:
        body?.error ||
        'Unable to process password reset. Please try again.',
      status: res.status,
    }
  }

  // Verification step
  if (!newPassword) {
    if (body.verified || body.ok) {
      return {
        ok: true,
        verified: true,
        status: res.status,
      }
    }

    return {
      error: 'Unable to verify account. Please try again.',
      status: res.status,
    }
  }

  // Direct password change
  if (body.success || body.ok) {
    return {
      ok: true,
      success: true,
      status: res.status,
    }
  }

  return {
    error:
      body?.error ||
      'Unable to change password. Please try again.',
    status: res.status,
  }
}