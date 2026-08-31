import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./pages/Leaderboard.jsx', import.meta.url), 'utf8')

test('leaderboard page uses the player-safe rpc', () => {
  assert.match(source, /get_portal_campaign_leaderboard/)
  assert.doesNotMatch(source, /from\(['"]campaign_players['"]\)/)
})

test('leaderboard page polls only active campaigns', () => {
  assert.match(source, /setInterval\(/)
  assert.match(source, /status.*active|active.*status/)
  assert.match(source, /15_?000/)
})

test('leaderboard page does not provide player performance inputs', () => {
  assert.doesNotMatch(source, /<input[^>]+(deposit|turnover|withdrawal)/i)
  assert.doesNotMatch(source, /manual_(deposit|turnover|withdrawal)_override/)
})
