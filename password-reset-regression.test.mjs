import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const supabaseSource = () => readFile('./src/lib/supabase.js', 'utf8')
const authSource = () => readFile('./src/lib/playerAuth.js', 'utf8')
const edgeSource = () => readFile('./supabase/functions/player-forgot-password/index.ts', 'utf8')

test('player function URLs fall back to the current Supabase project URL', async () => {
  const source = await supabaseSource()
  assert.match(source, /VITE_PLAYER_AUTH_URL\s*\|\|\s*`\$\{url\}\/functions\/v1\/player-auth`/)
  assert.match(source, /VITE_PLAYER_FORGOT_PASSWORD_URL\s*\|\|\s*`\$\{url\}\/functions\/v1\/player-forgot-password`/)
})

test('forgot-password backend verifies the registered email and active account', async () => {
  const source = await edgeSource()
  assert.match(source, /\.from\('player_accounts'\)/)
  assert.match(source, /\.eq\('username', username\)/)
  assert.match(source, /\.eq\('email', email\)/)
  assert.match(source, /\.eq\('is_active', true\)/)
})

test('forgot-password backend updates the existing auth user without generateLink', async () => {
  const source = await edgeSource()
  assert.match(source, /auth\.admin\.getUserById\(/)
  assert.match(source, /auth\.admin\.updateUserById\(/)
  assert.doesNotMatch(source, /auth\.admin\.generateLink\(/)
})

test('player reset client reports Edge Function error codes for diagnosis', async () => {
  const source = await authSource()
  assert.match(source, /res\.headers\.get\(['"]sb-error-code['"]\)/)
})
