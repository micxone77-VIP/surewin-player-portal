import test from 'node:test'
import assert from 'node:assert/strict'
import { isRecoveryActivationUrl, parseRecoverySession, validateNewPassword } from './src/lib/playerActivation.js'

const PORTAL_URL = 'https://surewin-player-portal.pages.dev'

test('parses Supabase recovery tokens from the portal URL hash', () => {
  const result = parseRecoverySession(
    `${PORTAL_URL}/set-password#access_token=access123&refresh_token=refresh123&type=recovery`
  )
  assert.deepEqual(result, {
    access_token: 'access123',
    refresh_token: 'refresh123',
    type: 'recovery',
  })
})

test('rejects non-recovery auth fragments', () => {
  assert.equal(
    parseRecoverySession(`${PORTAL_URL}/set-password#access_token=a&refresh_token=b&type=signup`),
    null,
  )
})

test('recognizes only recovery activation URLs', () => {
  assert.equal(
    isRecoveryActivationUrl(`${PORTAL_URL}/set-password#access_token=a&refresh_token=b&type=recovery`),
    true,
  )
  assert.equal(isRecoveryActivationUrl(`${PORTAL_URL}/set-password`), false)
})

test('validates activation passwords', () => {
  assert.equal(validateNewPassword('short', 'short'), 'Password must be at least 8 characters.')
  assert.equal(validateNewPassword('long-enough', 'different'), 'Passwords do not match.')
  assert.equal(validateNewPassword('long-enough', 'long-enough'), null)
})
