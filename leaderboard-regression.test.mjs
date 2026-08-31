import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile('./src/App.jsx', 'utf8')
const layoutSource = await readFile('./src/components/PortalLayout.jsx', 'utf8')
const detailSource = await readFile('./src/pages/CampaignDetail.jsx', 'utf8')
const helperSource = await readFile('./src/lib/leaderboardViewModel.js', 'utf8')
const pageSource = await readFile('./src/pages/Leaderboard.jsx', 'utf8')

test('Portal exposes an authenticated leaderboard route', () => {
  assert.match(appSource, /import Leaderboard from ['"]\.\/pages\/Leaderboard['"]/) 
  assert.match(appSource, /path=["']\/leaderboard["'][^>]*element={<Leaderboard \/>}/)
})

test('Portal bottom navigation exposes Leaderboard', () => {
  assert.match(layoutSource, /to:\s*['"]\/leaderboard['"][\s\S]*label:\s*['"]Leaderboard['"]/) 
})

test('Campaign detail links leaderboard using the campaign id', () => {
  assert.match(detailSource, /View Leaderboard/)
  assert.match(detailSource, /navigate\(\s*`\/leaderboard\?campaign=\$\{[^}]+\}`\s*\)/)
})

test('Leaderboard view model masks usernames without exposing raw usernames', () => {
  assert.match(helperSource, /export function maskUsername/)
  assert.match(helperSource, /export function buildLeaderboardRows/)
  assert.match(pageSource, /username_masked/)
  assert.doesNotMatch(pageSource, /\.from\(['"]vip_members['"]\)/)
  assert.doesNotMatch(pageSource, /\.from\(['"]player_accounts['"]\)/)
})

test('Leaderboard page renders Top 3, Top N and My Position states', () => {
  assert.match(pageSource, /Top 3/)
  assert.match(pageSource, /Top N/)
  assert.match(pageSource, /My Position/)
})
