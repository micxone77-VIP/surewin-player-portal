import test from 'node:test'
import assert from 'node:assert/strict'
import { isRecoveryActivationUrl, parseRecoverySession, validateNewPassword } from './src/lib/playerActivation.js'

test('parses Supabase recovery tokens from the URL hash', () => {
  const result = parseRecoverySession(
    'https://portal.surewin.app/set-password#access_token=access123&refresh_token=refresh123&type=recovery'
  )
  assert.deepEqual(result, {
    access_token: 'access123',
    refresh_token: 'refresh123',
    type: 'recovery',
  })
})

test('rejects non-recovery auth fragments', () => {
  assert.equal(
    parseRecoverySession('https://portal.surewin.app/set-password#access_token=a&refresh_token=b&type=signup'),
    null,
  )
})

test('recognizes only recovery activation URLs', () => {
  assert.equal(
    isRecoveryActivationUrl('https://portal.surewin.app/set-password#access_token=a&refresh_token=b&type=recovery'),
    true,
  )
  assert.equal(isRecoveryActivationUrl('https://portal.surewin.app/set-password'), false)
})

test('validates activation passwords', () => {
  assert.equal(validateNewPassword('short', 'short'), 'Password must be at least 8 characters.')
  assert.equal(validateNewPassword('long-enough', 'different'), 'Passwords do not match.')
  assert.equal(validateNewPassword('long-enough', 'long-enough'), null)
})
