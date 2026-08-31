import test from 'node:test'
import assert from 'node:assert/strict'
import { maskUsername, splitLeaderboardRows } from './lib/leaderboard.js'

test('maskUsername keeps the first two and last character', () => {
  assert.equal(maskUsername('miller14'), 'mi*****4')
})

test('maskUsername keeps short usernames readable but masked', () => {
  assert.equal(maskUsername('z888'), 'z**8')
  assert.equal(maskUsername('ab'), 'a*')
})

test('splitLeaderboardRows creates podium and keeps My Position outside Top N', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ rank_position: i + 1, is_me: i === 10 }))
  const result = splitLeaderboardRows(rows, 10)
  assert.equal(result.podium.length, 3)
  assert.equal(result.table.length, 7)
  assert.equal(result.me.rank_position, 11)
})
