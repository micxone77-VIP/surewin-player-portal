import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile('./src/pages/CampaignDetail.jsx', 'utf8')

test('CampaignDetail rejects an empty RPC array before dereferencing campaign.status', () => {
  assert.match(source, /Array\.isArray\(campRes\.data\)\s*\?\s*campRes\.data\[0\]\s*:\s*campRes\.data/)
  assert.match(source, /if\s*\(!campaign\)/)
  assert.doesNotMatch(source, /if\s*\(campRes\.error\s*\|\|\s*!campRes\.data\)/)
})
