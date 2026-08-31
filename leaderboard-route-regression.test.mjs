import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const app = fs.readFileSync(new URL('./App.jsx', import.meta.url), 'utf8')
const layout = fs.readFileSync(new URL('./components/PortalLayout.jsx', import.meta.url), 'utf8')

test('player portal registers the leaderboard route', () => {
  assert.match(app, /<Route path="\/leaderboard" element={<Leaderboard \/>} \/>/)
  assert.match(app, /import Leaderboard from ['"]\.\/pages\/Leaderboard['"]/) 
})

test('portal navigation exposes Leaderboard', () => {
  assert.match(layout, /to: '\/leaderboard'/)
  assert.match(layout, /label: 'Leaderboard'/)
})
