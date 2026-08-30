# Player Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and verify the existing SureWin Player Portal campaign experience without weakening player-session isolation or exposing CRM-only data.

**Architecture:** Keep the Portal as a separate React application using the portal-specific Supabase auth storage key and anon key. Campaign Management in CRM remains the single source of truth; Portal reads player-safe campaign metadata and player-scoped progress/reward state through RLS and SECURITY DEFINER RPCs.

**Tech Stack:** React 18, Vite 5, React Router 6, Supabase JS 2.x, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-player-portal-design.md`

## Global Constraints

- Player authentication remains separate from CRM authentication.
- Player JWT/session remains isolated from CRM session storage.
- Portal uses anon-key access only; no service-role key in browser code.
- Never query `vip_members`, `player_accounts`, `auth.users`, internal CRM profiles, internal email fields, or CRM role functions from Portal code.
- Campaign access must not reveal whether a campaign exists for another player when access is denied.
- Eligibility, unlock, claim, and payout state are backend-authoritative.
- Do not create a second campaign data store.
- Do not move campaign eligibility logic into React.
- Do not expose CRM administration fields to players.
- Do not merge Portal authentication with CRM authentication.

---

### Task 1: Protect player authentication and activation behavior

**Files:**
- Modify: `src/context/PlayerAuthContext.jsx` only if a regression is found
- Modify: `src/lib/playerAuth.js` only if a regression is found
- Modify: `src/lib/playerActivation.js` only if a regression is found
- Modify: `src/pages/SetPassword.jsx` only if a regression is found
- Create: `tests/player-auth-source.test.mjs`

**Interfaces:**
- Consumes: `PlayerAuthProvider`, `callPlayerAuth`, `callForgotPassword`, `parseRecoverySession`, `validateNewPassword`, `/set-password`.
- Produces: regression coverage proving player-only verification, generic auth errors, and recovery-link/password validation behavior.

- [ ] **Step 1: Write source-level security tests**

```js
import fs from 'node:fs'
import assert from 'node:assert/strict'

const auth = fs.readFileSync(new URL('../src/context/PlayerAuthContext.jsx', import.meta.url), 'utf8')
const client = fs.readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const activation = fs.readFileSync(new URL('../src/lib/playerActivation.js', import.meta.url), 'utf8')
const reset = fs.readFileSync(new URL('../src/lib/playerAuth.js', import.meta.url), 'utf8')

assert.match(auth, /rpc\('is_player_auth'\)/)
assert.match(auth, /rpc\('get_my_portal_profile'\)/)
assert.doesNotMatch(auth, /internal_email/)
assert.match(client, /storageKey:\s*'surewin-portal-auth'/)
assert.doesNotMatch(client, /service_role/i)
assert.match(activation, /type !== 'recovery'/)
assert.match(activation, /password\.length < 8/)
assert.match(reset, /action: 'verify'/)
assert.match(reset, /action: 'reset_direct'/)
```

- [ ] **Step 2: Run the new test**

Run: `node --test tests/player-auth-source.test.mjs`
Expected: PASS against the current security contract.

- [ ] **Step 3: Preserve the player-session guard**

`verifyAndLoad()` must call `is_player_auth` before loading the portal profile. A failed guard must sign out and clear session/user/profile/isPlayer state. Do not replace this with a frontend-only role check.

- [ ] **Step 4: Preserve isolated storage**

The Portal Supabase client must retain `storageKey: 'surewin-portal-auth'`, `autoRefreshToken: true`, `persistSession: true`, and `detectSessionInUrl: false`. No service-role key may be introduced.

- [ ] **Step 5: Preserve recovery validation**

`parseRecoverySession()` accepts only URLs containing access token, refresh token, and `type=recovery`. `validateNewPassword()` continues to require at least eight characters and matching confirmation.

- [ ] **Step 6: Run build and test**

Run: `npm run build && node --test tests/player-auth-source.test.mjs`
Expected: build succeeds and test passes.

- [ ] **Step 7: Commit**

```bash
git add src/context/PlayerAuthContext.jsx src/lib/playerAuth.js src/lib/playerActivation.js src/pages/SetPassword.jsx tests/player-auth-source.test.mjs
git commit -m "test: protect player authentication invariants"
```

---

### Task 2: Verify campaign list and access scoping

**Files:**
- Modify: `src/pages/Campaigns.jsx` only when a demonstrated access/data-leak regression exists
- Create: `tests/campaign-access-source.test.mjs`

**Interfaces:**
- Consumes: `campaigns` player RLS, `CAMPAIGN_SELECT`, existing campaign list filters and navigation.
- Produces: source-level guarantees that list data remains player-safe and filters do not introduce client-side eligibility logic.

- [ ] **Step 1: Write failing regression assertions**

```js
import fs from 'node:fs'
import assert from 'node:assert/strict'
const source = fs.readFileSync(new URL('../src/pages/Campaigns.jsx', import.meta.url), 'utf8')
assert.match(source, /CAMPAIGN_SELECT/)
assert.match(source, /from\('campaigns'\)/)
assert.doesNotMatch(source, /budget_rm/)
assert.doesNotMatch(source, /campaign_code/)
assert.doesNotMatch(source, /target_tier/)
assert.doesNotMatch(source, /internal_email/)
assert.doesNotMatch(source, /vip_members/)
assert.match(source, /Active/)
assert.match(source, /Upcoming/)
assert.match(source, /Ended/)
assert.match(source, /All/)
```

- [ ] **Step 2: Run the test**

Run: `node --test tests/campaign-access-source.test.mjs`
Expected: PASS against the current player-safe campaign list.

- [ ] **Step 3: Preserve the player-safe campaign select**

Keep the existing select list: `id, campaign_name, festival, start_date, end_date, offer_desc, status, campaign_type, campaign_category, is_multi_level, max_levels, created_at`. Do not add CRM-only fields to the Portal select.

- [ ] **Step 4: Preserve backend access scoping**

Continue relying on RLS/backend RPC for enrollment visibility. The Portal may display the resulting campaign list but must not implement an independent eligibility check based on deposit, turnover, tier, or reward thresholds.

- [ ] **Step 5: Preserve generic access failure behavior**

If a campaign cannot be loaded, navigate back to `/campaigns` without displaying whether another player's campaign exists.

- [ ] **Step 6: Run build and regression tests**

Run: `npm run build && node --test tests/player-auth-source.test.mjs tests/campaign-access-source.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Campaigns.jsx tests/campaign-access-source.test.mjs
 git commit -m "test: protect portal campaign access scoping"
```

---

### Task 3: Verify multi-level campaign detail and locked-code protection

**Files:**
- Modify: `src/pages/CampaignDetail.jsx` only if a demonstrated regression exists
- Create: `tests/campaign-detail-source.test.mjs`

**Interfaces:**
- Consumes: `get_portal_campaign`, `get_portal_campaign_levels`, `get_my_campaign_progress`, `campaign_player_levels`, `campaign_rewards`, `get_my_unlocked_level_codes`.
- Produces: player-safe campaign detail where current/next level and code visibility derive from backend state.

- [ ] **Step 1: Write source-level security tests**

```js
import fs from 'node:fs'
import assert from 'node:assert/strict'
const source = fs.readFileSync(new URL('../src/pages/CampaignDetail.jsx', import.meta.url), 'utf8')
assert.match(source, /get_portal_campaign/)
assert.match(source, /get_portal_campaign_levels/)
assert.match(source, /get_my_campaign_progress/)
assert.match(source, /get_my_unlocked_level_codes/)
assert.match(source, /UNLOCKED_STATUSES/)
assert.doesNotMatch(source, /get_campaigns_crm/)
assert.doesNotMatch(source, /vip_members/)
assert.doesNotMatch(source, /player_accounts/)
assert.doesNotMatch(source, /auth\.users/)
assert.doesNotMatch(source, /internal_email/)
assert.doesNotMatch(source, /budget_rm/)
assert.doesNotMatch(source, /campaign_code/)
```

- [ ] **Step 2: Run it**

Run: `node --test tests/campaign-detail-source.test.mjs`
Expected: PASS against the current security boundary.

- [ ] **Step 3: Preserve backend-authoritative current/next level derivation**

The detail page may inspect `campaign_player_levels.status` to render backend state, but it must not compare the player's deposit against `deposit_threshold` to decide unlock eligibility. The only display progress calculation permitted is a visual percentage.

- [ ] **Step 4: Preserve locked-code isolation**

Keep `level_code` out of the ordinary level select. Fetch codes only through `get_my_unlocked_level_codes`, and render a code only when its corresponding level is in an unlocked status set.

- [ ] **Step 5: Preserve reward-field isolation**

The reward select may expose player-safe payout state such as reward amount, status, approved_at, paid_at, and created_at as already defined, but must not expose `approved_by` or internal notes.

- [ ] **Step 6: Run build and tests**

Run: `npm run build && node --test tests/player-auth-source.test.mjs tests/campaign-access-source.test.mjs tests/campaign-detail-source.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/CampaignDetail.jsx tests/campaign-detail-source.test.mjs
 git commit -m "test: protect portal campaign detail security"
```

---

### Task 4: Verify reward wallet visibility and exact reward formatting

**Files:**
- Modify: `src/lib/rewardViewModel.js` only if a demonstrated regression exists
- Modify: `src/pages/Rewards.jsx` only if a demonstrated regression exists
- Create: `tests/reward-view-source.test.mjs`
- Create: `tests/reward-view-model.test.mjs`

**Interfaces:**
- Consumes: `buildRewardView`, player-scoped `campaign_rewards`, campaign levels, player-level unlock state, player-safe campaign metadata.
- Produces: a reward wallet containing only payable/unlocked rewards for the authenticated player, with exact configured reward amounts.

- [ ] **Step 1: Write failing view-model coverage**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRewardView } from '../src/lib/rewardViewModel.js'

test('locked future reward rows are excluded', () => {
  const view = buildRewardView({
    rewards: [
      { id: 'r1', campaign_level_id: 'l1', status: 'pending', reward_amount: 1388 },
      { id: 'r2', campaign_level_id: 'l2', status: 'pending', reward_amount: 3888 },
    ],
    levels: [
      { id: 'l1', campaign_id: 'c1', level_order: 1, level_name: 'Bronze' },
      { id: 'l2', campaign_id: 'c1', level_order: 2, level_name: 'Silver' },
    ],
    playerLevels: [
      { id: 'pl1', campaign_level_id: 'l1', status: 'unlocked' },
      { id: 'pl2', campaign_level_id: 'l2', status: 'in_progress' },
    ],
    campaigns: [{ id: 'c1', campaign_name: 'Test' }],
  })
  assert.deepEqual(view.rewards.map(r => r.id), ['r1'])
  assert.equal(view.counts.All, 1)
})
```

- [ ] **Step 2: Run it**

Run: `node --test tests/reward-view-model.test.mjs`
Expected: PASS; if the current implementation fails, fix the minimal filtering defect.

- [ ] **Step 3: Write source security assertions**

```js
import fs from 'node:fs'
import assert from 'node:assert/strict'
const page = fs.readFileSync(new URL('../src/pages/Rewards.jsx', import.meta.url), 'utf8')
const model = fs.readFileSync(new URL('../src/lib/rewardViewModel.js', import.meta.url), 'utf8')
assert.match(page, /REWARD_SELECT/)
assert.match(page, /approved_by.*excluded|approved_by.*CRM-only|notes.*excluded|notes.*CRM-only/i)
assert.match(page, /get_my_unlocked_level_codes/)
assert.match(model, /UNLOCKED_STATUSES/)
assert.doesNotMatch(page, /vip_daily_snapshots/)
assert.doesNotMatch(page, /vip_members/)
assert.doesNotMatch(page, /player_accounts/)
assert.doesNotMatch(page, /auth\.users/)
```

- [ ] **Step 4: Preserve exact reward display**

Keep the reward formatter in `Rewards.jsx` equivalent to:

```js
function fmtAmt(n) {
  const v = Number(n ?? 0)
  return `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
```

Do not use K/M compact formatting for reward commitments.

- [ ] **Step 5: Preserve unlocked-code behavior**

The reward page may render a code only when the corresponding player-level state is unlocked. Codes must not be persisted in localStorage/sessionStorage/URL or logged to analytics/console.

- [ ] **Step 6: Run build and reward tests**

Run: `npm run build && node --test tests/reward-view-model.test.mjs tests/reward-view-source.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/rewardViewModel.js src/pages/Rewards.jsx tests/reward-view-model.test.mjs tests/reward-view-source.test.mjs
git commit -m "test: protect player reward visibility"
```

---

### Task 5: Final Portal verification and security review

**Files:**
- Modify only files implicated by a failing verification
- Test: all Portal regression tests

**Interfaces:**
- Consumes: authentication, campaign list, campaign detail, reward view-model, existing Dashboard/Notifications/Profile routes.
- Produces: verified Player Portal build preserving the existing route boundaries and security invariants.

- [ ] **Step 1: Run all new Portal tests**

Run: `node --test tests/player-auth-source.test.mjs tests/campaign-access-source.test.mjs tests/campaign-detail-source.test.mjs tests/reward-view-model.test.mjs tests/reward-view-source.test.mjs`
Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: Vite reports a successful production build.

- [ ] **Step 3: Review route boundaries**

Confirm `src/App.jsx` keeps `/login`, `/forgot-password`, and `/set-password` outside the authenticated portal layout, while Dashboard, Campaigns, Campaign Detail, Rewards, Notifications, and Profile remain behind `PortalRequireAuth`.

- [ ] **Step 4: Review forbidden data access**

Search Portal source for forbidden identifiers and confirm there are no runtime queries to `vip_members`, `player_accounts`, `auth.users`, internal CRM profiles, internal email fields, or CRM role functions.

- [ ] **Step 5: Review event logging**

Confirm event logging remains best-effort and cannot block campaign/reward rendering. No sensitive reward code or internal CRM field may be included in an event payload.

- [ ] **Step 6: Commit verification-only corrections, if any**

```bash
git add src tests
git commit -m "chore: verify player portal integration"
```

