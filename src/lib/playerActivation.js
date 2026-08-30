export function parseRecoverySession(url = window.location.href) {
  const hash = new URL(url).hash
  if (!hash) return null

  const params = new URLSearchParams(hash.slice(1))
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  const type = params.get('type')

  if (!accessToken || !refreshToken || type !== 'recovery') return null

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    type,
  }
}

export function isRecoveryActivationUrl(url = window.location.href) {
  return parseRecoverySession(url) !== null
}

export function validateNewPassword(password, confirmPassword) {
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirmPassword) return 'Passwords do not match.'
  return null
}
