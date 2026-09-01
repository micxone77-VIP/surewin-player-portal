import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pageSource = fs.readFileSync(new URL('./src/pages/Leaderboard.jsx', import.meta.url), 'utf8')
const helperSource = fs.readFileSync(new URL('./src/lib/leaderboard.js', import.meta.url), 'utf8')

test('leaderboard page consumes the CRM-selected metric configuration', () => {
  assert.match(pageSource, /leaderboard_metric/)
  assert.match(pageSource, /getLeaderboardMetricConfig/)
  assert.match(pageSource, /getLeaderboardDisplayValues/)
})

test('leaderboard display has explicit turnover, deposit and mixed modes', () => {
  assert.match(helperSource, /turnover/)
  assert.match(helperSource, /deposit/)
  assert.match(helperSource, /turnover_deposit/)
  assert.match(helperSource, /turnover_value/)
  assert.match(helperSource, /deposit_value/)
})

test('leaderboard does not hardcode turnover as the only displayed metric', () => {
  assert.doesNotMatch(pageSource, /<small>Deposit \{formatLeaderboardAmount\(row\.deposit_value\)\}<\/small>/)
  assert.doesNotMatch(pageSource, /hint=\"Turnover ranking\"/)
})
