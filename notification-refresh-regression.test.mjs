import fs from 'node:fs'
import assert from 'node:assert/strict'

const notifications = fs.readFileSync('src/pages/Notifications.jsx', 'utf8')
const migrationPath = 'supabase/migrations/20260831_campaign_end_notifications.sql'
const migration = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : ''

// TDD contract: notification center must refresh without requiring a full page reload.
assert.match(notifications, /postgres_changes/)
assert.match(notifications, /player_notifications/)
assert.match(notifications, /visibilitychange/)
assert.match(notifications, /addEventListener\(['"]focus['"]/)
assert.match(notifications, /setInterval\(/)

// TDD contract: ending a campaign must create a player notification server-side.
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.notify_campaign_ended\(/i)
assert.match(migration, /OLD\.status\s+IS DISTINCT FROM\s+'ended'/i)
assert.match(migration, /NEW\.status\s*=\s*'ended'/i)
assert.match(migration, /INSERT INTO public\.player_notifications/i)
assert.match(migration, /campaign_players/i)

console.log('Notification refresh regression tests passed.')
