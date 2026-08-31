import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('./components/LeaderboardCampaignRoute.jsx', import.meta.url), 'utf8')
const app = fs.readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')

test('campaign detail route exposes View Leaderboard through the player-safe campaign rpc', () => {
  assert.match(route, /get_portal_campaign/)
  assert.match(route, /campaign_type.*leaderboard|leaderboard.*campaign_type/)
  assert.match(route, /View Leaderboard/)
  assert.match(route, /\/leaderboard\?campaign=/)
})

test('campaign detail route is wired through the leaderboard-aware wrapper', () => {
  assert.match(app, /path="\/campaigns\/:id" element={<LeaderboardCampaignRoute \/>} \/>/)
})
