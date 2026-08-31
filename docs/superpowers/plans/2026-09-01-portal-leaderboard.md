# Portal Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-safe Leaderboard view inside the existing SureWin Player Portal, backed by the existing campaign data and fixed final results for ended campaigns.

**Architecture:** Add one player-safe Supabase RPC for leaderboard reads, one portal page, one reusable masking/format helper, a Leaderboard navigation item, and a Campaign Detail CTA. Active campaigns are recalculated from campaign-period snapshots on each RPC call and refreshed by the UI every 15 seconds; ended campaigns use the already-settled `campaign_players.rank_position`.

**Tech Stack:** React 18, React Router, Supabase JS client, PostgreSQL/Supabase RPC, Vite.

**Spec:** `docs/superpowers/specs/2026-09-01-portal-leaderboard-design.md`

## Global Constraints

- Portal 内新增 **Leaderboard**.
- 跟现有 Campaign 共用数据.
- Active Campaign → 自动更新排名.
- Ended Campaign → 固定最终排名.
- Top 3 podium + Top N.
- My Position.
- Username masking.
- Campaign Detail → View Leaderboard.
- 不建立另一个 leaderboard website.
- 不让玩家手动输入数据.
- 不暴露 CRM 内部资料.
- Browser code must not directly query `campaign_players` for leaderboard data.
- The player-safe RPC must pin `search_path` and expose only `authenticated` execution.

---

### Task 1: Add database leaderboard read contract

**Files:**
- Create: `swcrm3/supabase/migrations/20260901_portal_leaderboard.sql`
- Test: `swcrm3/tests/portal-leaderboard.sql` (or equivalent database assertions available in the repository)

**Interfaces:**
- Produces `public.get_portal_campaign_leaderboard(p_campaign_id uuid)` returning player-safe leaderboard rows.
- Returns: `campaign_id`, `campaign_name`, `status`, `start_date`, `end_date`, `top_n`, `rank_position`, `username_masked`, `tier`, `metric_value`, `deposit_value`, `withdrawal_value`, `is_me`, `reward_amount`, `last_updated_at`.

- [ ] **Step 1: Write failing database assertions**

Assert the new function exists only after the migration and that its result contract contains no raw username or CRM-only fields. Also assert active ranking uses effective turnover and ended ranking uses settled `rank_position`.

```sql
select has_function('public.get_portal_campaign_leaderboard(uuid)');

select function_returns('public.get_portal_campaign_leaderboard(uuid)',
  'TABLE(campaign_id uuid, campaign_name text, status text, start_date date, end_date date, top_n integer, rank_position bigint, username_masked text, tier public.vip_tier, metric_value numeric, deposit_value numeric, withdrawal_value numeric, is_me boolean, reward_amount numeric, last_updated_at timestamp with time zone)');
```

- [ ] **Step 2: Run the database assertions and verify RED**

Run the repository's database test command if available. The new function assertion must fail because the function does not yet exist.

- [ ] **Step 3: Implement the RPC**

Use `SECURITY DEFINER SET search_path = ''`. Reject unauthenticated callers and non-enrolled campaign IDs. For active campaigns, aggregate `vip_daily_snapshots` across the campaign date range for all enrolled players in one query, then use `manual_turnover_override`, `manual_deposit_override`, and `manual_withdrawal_override` when present. Rank by effective valid bet descending and username ascending. For ended campaigns, read the settled `rank_position` and do not recalculate it.

Mask usernames in SQL so the raw username never crosses the Data API boundary. Grant execution only to `authenticated` and revoke it from `anon` and `public`.

- [ ] **Step 4: Apply the migration to the Supabase project**

Use the Supabase migration action against project `utopskwciorvooronpwg`.

- [ ] **Step 5: Re-run database assertions and verify GREEN**

Verify the function contract, enrollment isolation, masking, active ranking, and ended snapshot behavior.

- [ ] **Step 6: Commit the database migration**

```bash
git add supabase/migrations/20260901_portal_leaderboard.sql tests/portal-leaderboard.sql
git commit -m "feat: add player-safe leaderboard rpc"
```

---

### Task 2: Add reusable portal leaderboard helpers and tests

**Files:**
- Create: `surewin-player-portal/lib/leaderboard.js`
- Create: `surewin-player-portal/leaderboard.test.mjs`

**Interfaces:**
- `maskUsername(username)` returns a masked display username.
- `formatLeaderboardAmount(value)` returns compact RM display text.
- `splitLeaderboardRows(rows, topN)` returns `{ podium, table, me }` without mutating input.

- [ ] **Step 1: Write failing helper tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { maskUsername, splitLeaderboardRows } from './lib/leaderboard.js'

test('maskUsername keeps the first two and last character', () => {
  assert.equal(maskUsername('miller14'), 'mi*****4')
})

test('splitLeaderboardRows creates podium and keeps My Position outside Top N', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ rank_position: i + 1, is_me: i === 10 }))
  const result = splitLeaderboardRows(rows, 10)
  assert.equal(result.podium.length, 3)
  assert.equal(result.table.length, 7)
  assert.equal(result.me.rank_position, 11)
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run `node --test leaderboard.test.mjs`. It must fail because the helper module does not exist yet.

- [ ] **Step 3: Implement minimal helpers**

Mask according to the approved convention and split the sorted backend rows into podium, ranks 4..Top N, and the current player row.

- [ ] **Step 4: Run the helper test and verify GREEN**

Run `node --test leaderboard.test.mjs` and confirm PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/leaderboard.js leaderboard.test.mjs
git commit -m "feat: add leaderboard display helpers"
```

---

### Task 3: Build the `/leaderboard` portal page

**Files:**
- Create: `surewin-player-portal/pages/Leaderboard.jsx`
- Modify: `surewin-player-portal/App.jsx`

**Interfaces:**
- Route: `/leaderboard`
- Optional query: `?campaign=<uuid>` to preselect a campaign from Campaign Detail.
- Calls `supabase.rpc('get_portal_campaign_leaderboard', { p_campaign_id: campaignId })`.

- [ ] **Step 1: Write failing route regression test**

Extend the existing portal regression test pattern to assert the application source contains the `/leaderboard` route and the player-safe RPC name.

- [ ] **Step 2: Run the regression test and verify RED**

Run the portal test. It must fail because the route and page are missing.

- [ ] **Step 3: Implement the page**

Render only leaderboard campaigns from the existing campaign list RPC/table data. Provide campaign selector, campaign period/status, Top 3 podium, Top N list, My Position, and last-updated status. Poll active campaigns every 15 seconds and refresh on `visibilitychange`/window focus. Stop polling for ended campaigns. Never render an input for deposit/turnover/withdrawal.

- [ ] **Step 4: Implement route registration**

Add the authenticated `/leaderboard` route in `App.jsx`.

- [ ] **Step 5: Run the regression test and verify GREEN**

Run the portal tests and confirm the new route contract passes.

- [ ] **Step 6: Commit**

```bash
git add App.jsx pages/Leaderboard.jsx leaderboard-regression.test.mjs
git commit -m "feat: add player portal leaderboard page"
```

---

### Task 4: Add Leaderboard to portal navigation

**Files:**
- Modify: `surewin-player-portal/components/PortalLayout.jsx`

**Interfaces:**
- Adds `/leaderboard` to authenticated bottom navigation.

- [ ] **Step 1: Add navigation regression assertion**

Assert `PortalLayout.jsx` contains the `/leaderboard` destination and visible `Leaderboard` label.

- [ ] **Step 2: Run and verify RED**

The assertion must fail before the navigation item is added.

- [ ] **Step 3: Add the navigation item and icon**

Keep the existing mobile-first layout and reduce label/icon spacing only if needed to fit six items without horizontal scrolling.

- [ ] **Step 4: Run and verify GREEN**

Run the navigation regression test.

- [ ] **Step 5: Commit**

```bash
git add components/PortalLayout.jsx portal-navigation-regression.test.mjs
git commit -m "feat: add leaderboard portal navigation"
```

---

### Task 5: Add Campaign Detail → View Leaderboard

**Files:**
- Modify: `surewin-player-portal/pages/CampaignDetail.jsx`
- Modify: `surewin-player-portal/campaign-detail-regression.test.mjs`

**Interfaces:**
- For `campaign_type === 'leaderboard'`, render a `View Leaderboard` CTA that navigates to `/leaderboard?campaign=<campaign-id>`.
- For other campaign types, do not render the CTA.

- [ ] **Step 1: Add the failing regression assertion**

Assert the campaign detail source contains the leaderboard-only CTA and query-string navigation.

- [ ] **Step 2: Run and verify RED**

Run `node --test campaign-detail-regression.test.mjs` and confirm the assertion fails before the CTA is added.

- [ ] **Step 3: Implement the CTA**

Place it near the campaign header/progress area. Keep it view-only and do not add any enrollment or data-entry behavior.

- [ ] **Step 4: Run and verify GREEN**

Run the campaign-detail regression test.

- [ ] **Step 5: Commit**

```bash
git add pages/CampaignDetail.jsx campaign-detail-regression.test.mjs
git commit -m "feat: link leaderboard from campaign detail"
```

---

### Task 6: Full verification and delivery

**Files:**
- No new production files.
- Verify both `surewin-player-portal` and `swcrm3` branches.

- [ ] **Step 1: Run all portal regression tests**

Run `npm test` if configured, otherwise run every `node --test *.test.mjs` regression test in the portal repository.

- [ ] **Step 2: Verify build**

Run `npm run build` in the portal repository.

- [ ] **Step 3: Verify database security**

Confirm the leaderboard function has `SECURITY DEFINER`, `search_path = ''`, no `anon` execute grant, and only returns the documented player-safe projection.

- [ ] **Step 4: Verify ended campaign immutability**

Use an ended leaderboard campaign and confirm its returned rank remains the settled `campaign_players.rank_position` even when source snapshot rows are changed after campaign end.

- [ ] **Step 5: Verify active auto-refresh path**

Use an active leaderboard campaign, update campaign-period source data, call the RPC again, and confirm the returned ranking changes without modifying campaign configuration or requiring player input.

- [ ] **Step 6: Create pull requests**

Create one PR from `feat/portal-leaderboard-db` into `main` in `swcrm3` and one PR from `feat/portal-leaderboard` into `main` in `surewin-player-portal`, with the security and behavior verification results in each PR body.
