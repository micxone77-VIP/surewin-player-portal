import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

async function collectJsx(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await collectJsx(path))
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(path)
  }
  return files
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
}

test('CampaignDetail uses player-safe campaign RPCs and never direct campaign lookup', async () => {
  const source = stripComments(await readFile('./src/pages/CampaignDetail.jsx', 'utf8'))
  assert.match(source, /supabase\.rpc\(['"]get_portal_campaign['"]/) 
  assert.match(source, /supabase\.rpc\(['"]get_portal_campaign_levels['"]/) 
  assert.doesNotMatch(source, /supabase\.from\(['"]campaigns['"]\)\.select\(CAMPAIGN_SELECT\)/)
})

test('Portal source contains no forbidden CRM table access or service-role key', async () => {
  const files = await collectJsx('./src')
  const sources = await Promise.all(files.map(path => readFile(path, 'utf8')))
  const source = stripComments(sources.join('\n'))
  for (const table of ['vip_members', 'vip_daily_snapshots', 'player_accounts', 'auth.users']) {
    assert.doesNotMatch(source, new RegExp(`\\.from\\(['"]${table.replace('.', '\\.') }['"]\\)`))
  }
  assert.doesNotMatch(source, /service_role/i)
  assert.doesNotMatch(source, /get_campaigns_crm\s*\(/)
})

test('Portal Supabase client is configured only from Vite public environment values', async () => {
  const source = stripComments(await readFile('./src/lib/supabase.js', 'utf8'))
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_URL/)
  assert.match(source, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/)
  assert.doesNotMatch(source, /SERVICE_ROLE/i)
})
