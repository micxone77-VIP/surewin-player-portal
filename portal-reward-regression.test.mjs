import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('Rewards fetches unlocked level codes with a campaign-scoped RPC argument', async () => {
  const source = await readFile('./src/pages/Rewards.jsx', 'utf8')
  assert.match(
    source,
    /supabase\.rpc\(['"]get_my_unlocked_level_codes['"]\s*,\s*\{\s*p_campaign_id\s*:/
  )
  assert.doesNotMatch(
    source,
    /supabase\.rpc\(['"]get_my_unlocked_level_codes['"]\s*\)/
  )
})
