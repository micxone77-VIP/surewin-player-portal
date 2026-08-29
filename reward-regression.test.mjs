import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile('./src/pages/Rewards.jsx', 'utf8')

test('reward amounts preserve exact ringgit values instead of K rounding', () => {
  const helper = source.slice(source.indexOf('function fmtAmt'), source.indexOf('function calcDaysLeft'))
  assert.match(helper, /minimumFractionDigits:\s*0/)
  assert.match(helper, /maximumFractionDigits:\s*0/)
})

test('Rewards CampaignGroup receives and uses the player-level map without a free variable', () => {
  const campaignGroup = source.slice(source.indexOf('function CampaignGroup'), source.indexOf('// ── RewardCard'))
  assert.doesNotMatch(campaignGroup, /playerLevelByCampaignLevel\[lid\]/)
  assert.match(campaignGroup, /plMap\[lid\]/)
})
