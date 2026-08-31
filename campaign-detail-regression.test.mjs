import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const detailSource = await readFile('./src/pages/CampaignDetail.jsx', 'utf8')
const dashboardSource = await readFile('./src/pages/Dashboard.jsx', 'utf8')
const campaignsSource = await readFile('./src/pages/Campaigns.jsx', 'utf8')

test('CampaignDetail rejects an empty RPC array before dereferencing campaign.status', () => {
  assert.match(detailSource, /Array\.isArray\(campRes\.data\)\s*\?\s*campRes\.data\[0\]\s*:\s*campRes\.data/)
  assert.match(detailSource, /if\s*\(!campaign\)/)
  assert.doesNotMatch(detailSource, /if\s*\(campRes\.error\s*\|\|\s*!campRes\.data\)/)
})

test('Player dashboard does not query draft campaigns', () => {
  assert.match(dashboardSource, /\.in\(['"]status['"],\s*\[/)
})

test('Player campaign list does not query draft campaigns', () => {
  assert.match(campaignsSource, /\.in\(['"]status['"],\s*\[/)
})
