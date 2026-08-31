# Campaign Leaderboard View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player-facing Leaderboard view to the existing SureWin Player Portal that reads the existing campaign/player data, updates active rankings, and freezes ended rankings.

**Architecture:** Keep CRM Campaign Management as the single source of truth. Add a player-safe SECURITY DEFINER RPC for leaderboard reads, a Leaderboard list/detail UI in the Portal, and a Campaign Detail entry point; do not create a second leaderboard store or website.

**Tech Stack:** React 18, Vite 5, React Router 6, Supabase JS 2.x, PostgreSQL, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-01-campaign-leaderboard-view-design.md`

## Global Constraints

- Player authentication remains separate from CRM authentication.
- Portal uses anon-key access only; no service-role key in browser code.
- CRM Campaign configuration and `campaign_players` remain the single source of truth.
- Active ranking is calculated from current `valid_bet`; ended ranking uses persisted `rank_position`.
- Portal never edits campaign/player performance or payout state.
- Do not expose CRM-only data or cross-player campaign existence.
- Do not create a second leaderboard website or normal-operation leaderboard table.

---

### Task 1: Add player-safe leaderboard RPC and database regression coverage

**Files:**
- Create: `supabase/migrations/20260901_portal_leaderboard.sql`
- Create: `tests/leaderboard-rpc-source.test.mjs`

**Interfaces:**
- Produces: `public.get_portal_leaderboard(p_campaign_id uuid)` returning one campaign metadata row plus player-facing ranking rows.
- Consumes: `campaigns`, `campaign_players`, `get_player_vip_member_id()` and existing player-scoped security model.

- [ ] **Step 1: Write source-level migration tests**

Assert the migration defines `get_portal_leaderboard`, uses `SECURITY DEFINER`, sets an explicit search path, checks player identity, restricts to `campaign_type = 'leaderboard'`, and does not expose CRM-only tables/fields.

- [ ] **Step 2: Implement the RPC**

Return a stable table shape such as:
`campaign_id, campaign_name, start_date, end_date, status, min_valid_bet, top_n, metric, rank_position, username, tier, valid_bet, reward_amount, payout_status, is_current_player`.

For active campaigns, calculate `row_number()` over qualifying enrolled players ordered by `valid_bet DESC, lower(username), username`. Only players meeting `min_valid_bet` receive a current rank; return the top N plus the caller's row if they are outside Top N. For ended campaigns, use persisted `rank_position` and do not recompute rank.

Ensure only the caller's enrolled campaign can be viewed. Use the existing player identity helper and avoid direct CRM identity exposure.

- [ ] **Step 3: Add SQL assertions for edge cases**

Cover minimum threshold, deterministic tie ordering, active ranking, ended/frozen ranking, caller scoping, and reward visibility. The SQL must not mutate `campaign_players`.

- [ ] **Step 4: Run source-level tests**

Run: `node --test tests/leaderboard-rpc-source.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901_portal_leaderboard.sql tests/leaderboard-rpc-source.test.mjs
git commit -m "feat: add player-safe campaign leaderboard rpc"
```

---

### Task 2: Add Leaderboard Portal route and navigation

**Files:**
- Create: `src/pages/Leaderboard.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/PortalLayout.jsx`
- Create: `tests/leaderboard-page-source.test.mjs`

**Interfaces:**
- Consumes: `supabase.rpc('get_portal_leaderboard', { p_campaign_id })`, `usePlayerAuth()`, React Router.
- Produces: `/leaderboard` campaign list and `/leaderboard/:id` campaign leaderboard view.

- [ ] **Step 1: Write source-level tests**

Assert the page uses the dedicated RPC, includes refresh behavior, has active/ended states, masks usernames, and does not query CRM-only tables or implement reward eligibility locally.

- [ ] **Step 2: Implement Leaderboard list/detail UI**

The list should show only leaderboard campaigns returned through the player-safe backend. Detail should render the supplied visual direction: dark/midnight background, gold/orange accents, campaign header, Live/Ended status, Top N, podium Top 3, ranked list, and My Position.

Show `valid_bet` as the ranking metric. Display reward amounts only as player-safe reward information. If a player is below the threshold, show progress/shortfall rather than assigning a misleading rank.

- [ ] **Step 3: Implement 60-second active refresh and manual refresh**

Refresh on page entry and while active. Stop the interval once the campaign is ended. Keep the last loaded rows during a transient refresh failure and expose a retry/manual refresh action.

- [ ] **Step 4: Add empty/error states**

No leaderboard campaigns: link to Campaigns. Unauthorized/unavailable campaign: return to leaderboard list without revealing cross-player existence. Data failure: player-safe error plus retry.

- [ ] **Step 5: Run tests**

Run: `node --test tests/leaderboard-page-source.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Leaderboard.jsx src/App.jsx src/components/PortalLayout.jsx tests/leaderboard-page-source.test.mjs
git commit -m "feat: add player leaderboard portal view"
```

---

### Task 3: Integrate leaderboard entry points into Campaign Detail and Campaigns

**Files:**
- Modify: `src/pages/CampaignDetail.jsx`
- Modify: `src/pages/Campaigns.jsx`
- Create: `tests/leaderboard-entry-source.test.mjs`

**Interfaces:**
- Consumes: existing campaign type and campaign id from current Portal campaign pages.
- Produces: `View Leaderboard` navigation for leaderboard campaigns and optional Leaderboard badge on campaign cards.

- [ ] **Step 1: Write failing source assertions**

Assert leaderboard campaigns navigate using their existing campaign id and non-leaderboard campaigns do not display a leaderboard CTA.

- [ ] **Step 2: Add Campaign Detail CTA**

For `campaign_type === 'leaderboard'`, render `View Leaderboard` linking to `/leaderboard/:id`. Do not duplicate configuration or query a second campaign record.

- [ ] **Step 3: Add optional Campaigns badge**

Add a compact Leaderboard badge using the existing campaign list data. Keep existing filters and player-safe selects unchanged.

- [ ] **Step 4: Run regression tests**

Run: `node --test tests/leaderboard-entry-source.test.mjs campaign-detail-regression.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CampaignDetail.jsx src/pages/Campaigns.jsx tests/leaderboard-entry-source.test.mjs
git commit -m "feat: link campaign pages to leaderboard"
```

---

### Task 4: Full portal verification and deployment readiness

**Files:**
- Modify only files required by failed verification.

- [ ] **Step 1: Run all existing portal regression tests**

Run: `node --test *.test.mjs`
Expected: zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: exit code 0 and production bundle generated.

- [ ] **Step 3: Verify database migration syntax and RPC availability**

Apply the migration through the normal Supabase migration path, then invoke the RPC with a valid authenticated player session in the deployed Portal. Verify an active leaderboard changes when the underlying campaign-player performance changes and an ended leaderboard remains frozen.

- [ ] **Step 4: Verify player UI manually**

Check mobile layout, podium Top 3, Top N behavior, My Position, username masking, active refresh, ended state, empty state, and Campaign Detail CTA.

- [ ] **Step 5: Review diff for security**

Confirm no service-role key, internal email, CRM role data, approval identity, or unrestricted CRM query was introduced.

- [ ] **Step 6: Commit any verification-only fixes**

Use a focused commit message describing the verified regression fix.
