# Portal Leaderboard Design

**Date:** 2026-09-01  
**Status:** Approved by product owner

## Goal

Add a first-class **Leaderboard** experience inside the existing SureWin Player Portal. It must reuse the existing campaign data and campaign period, update active rankings automatically, freeze ended rankings, and never expose CRM-only data or require player-entered numbers.

## Confirmed Product Scope

1. Portal 内新增 **Leaderboard**
2. 跟现有 Campaign 共用数据
3. Active Campaign → 自动更新排名
4. Ended Campaign → 固定最终排名
5. Top 3 podium + Top N
6. My Position
7. Username masking
8. Campaign Detail → View Leaderboard
9. 不建立另一个 leaderboard website
10. 不让玩家手动输入数据
11. 不暴露 CRM 内部资料

## Architecture

The player portal remains the only player-facing application. A new `/leaderboard` route consumes a single player-safe Supabase RPC, `get_portal_campaign_leaderboard(p_campaign_id)`, rather than reading CRM tables directly from the browser.

The RPC is `SECURITY DEFINER` with an empty `search_path`, validates that the authenticated player is enrolled in the requested leaderboard campaign, and returns only display-safe fields. This follows the existing portal pattern of using player-safe RPCs for campaign data and keeps CRM-only columns behind the database boundary.

For **active** leaderboard campaigns, the RPC calculates the current campaign-period performance from `vip_daily_snapshots` for all enrolled campaign players in one aggregation and applies manual overrides when present. Ranking is then calculated from the effective valid-bet value, matching the existing backend leaderboard settlement rule.

For **ended** campaigns, the RPC uses the already-settled `campaign_players.rank_position` and effective performance values. It never recomputes an ended campaign, so the final order remains fixed.

## Refresh Model

The Leaderboard page refreshes automatically while the campaign is active:

- Initial load immediately.
- Refresh on browser visibility/focus.
- Poll every 15 seconds while an active leaderboard is open.
- Stop polling for ended campaigns.
- No player action is required to update the ranking.

Polling is intentionally used instead of adding a second realtime architecture. The data source remains the existing campaign system and the UI remains deterministic even if Realtime is unavailable.

## Player-Safe RPC Contract

`get_portal_campaign_leaderboard(p_campaign_id uuid)` returns one row per enrolled campaign player with:

- `campaign_id`
- `campaign_name`
- `status`
- `start_date`
- `end_date`
- `top_n`
- `rank_position`
- `username_masked`
- `tier`
- `metric_value` — effective campaign-period valid bet used for ranking
- `deposit_value` — effective campaign-period deposit for display
- `withdrawal_value` — effective campaign-period withdrawal for display
- `is_me`
- `reward_amount` only when the rank is a configured winning rank
- `last_updated_at`

The RPC does **not** return:

- player UUIDs
- VIP UUIDs
- WhatsApp numbers
- phone numbers
- email/internal email
- addresses
- CRM notes
- host assignments
- manual override fields
- override reason/by metadata
- campaign budget
- campaign code
- internal approval data
- internal payout notes
- any `auth.users` data

## Ranking Rules

- Ranking metric: effective `valid_bet`, consistent with the existing `settle_leaderboard_campaign` implementation.
- Active: rank all enrolled players with effective valid bet at or above `campaigns.min_valid_bet`.
- Ended: use the backend-settled `rank_position` snapshot.
- Tie-breaker: username ascending, matching the existing settlement function.
- `top_n` comes from the campaign record; the UI never hardcodes 10.
- Top 3 podium shows ranks 1–3 that exist.
- The Top N table shows the complete configured winning range.
- My Position always shows the logged-in player's current/final rank, even when outside Top N.

## Username Masking

Use the existing leaderboard visual convention:

- `miller14` → `mi*****4`
- `z888` → `z**8`
- `ab` → `a*`
- Empty/invalid username → `Player`

The raw username is never returned by the player-safe RPC.

## Portal UX

### New bottom-navigation item

Add **Leaderboard** to the existing authenticated portal navigation. It is a view-only destination; players cannot create, edit, enroll, or submit campaign figures from this page.

### Leaderboard page

The page contains:

1. Header: `Leaderboard` / `Live Rankings`.
2. Campaign selector showing only enrolled campaigns whose `campaign_type = 'leaderboard'`.
3. Campaign period and Active/Ended state.
4. Top 3 podium.
5. Top N ranking list.
6. My Position card.
7. Last updated indicator.
8. Active-state auto-refresh indicator.

If there are no leaderboard campaigns, show a clean empty state and link back to Campaigns.

### Campaign detail integration

For `campaign_type = 'leaderboard'`, the existing Campaign Detail page gets a **View Leaderboard** CTA. It routes to `/leaderboard?campaign=<campaign-id>` so the same campaign is opened in the leaderboard view.

No second leaderboard site or separate campaign data store is introduced.

## Data Flow

```text
Existing Campaign
      │
      ├── campaigns (definition / dates / top_n / min_valid_bet)
      ├── campaign_players (enrollment + ended snapshot + overrides)
      └── vip_daily_snapshots (active campaign performance source)
                │
                ▼
get_portal_campaign_leaderboard()
                │
                ├── validate authenticated player is enrolled
                ├── active → aggregate current campaign-period metrics
                └── ended → use settled rank_position
                │
                ▼
Player-safe rows only
                │
                ▼
Portal Leaderboard UI
```

## Error Handling

- Unknown/non-leaderboard campaign: return no rows and let the UI show an unavailable state.
- Unauthenticated request: return no rows.
- Non-enrolled player: return no rows.
- RPC/network failure: show retry state without rendering stale/partial rows as final data.
- Active refresh failure after an already-rendered result: retain the last successful ranking and mark it as temporarily stale; the next successful poll replaces it.

## Testing Requirements

### Database

Test that:

- enrolled player can call the RPC;
- non-enrolled player receives no rows;
- active ranking follows effective valid bet;
- manual turnover override wins over system turnover;
- active data reflects campaign-period snapshots;
- ended campaign keeps settled `rank_position` even if source snapshots later change;
- raw usernames are not returned;
- CRM-only columns are not present in the RPC result.

### Portal

Test that:

- `/leaderboard` route renders;
- only leaderboard campaigns appear in the selector;
- Top 3 podium and Top N list render from `top_n` dynamically;
- My Position works both inside and outside Top N;
- username masking is deterministic;
- active campaigns poll automatically;
- ended campaigns do not poll;
- Campaign Detail shows View Leaderboard only for leaderboard campaigns;
- no player input fields exist for performance values.

## Security Principles

The browser must not query `campaign_players` for leaderboard data. The public-facing leaderboard uses a narrow RPC projection so CRM-only fields remain inaccessible. This follows Supabase's guidance that exposed `SECURITY DEFINER` functions must pin `search_path`, and that function `EXECUTE` permissions should be explicitly limited to the roles that need them. citeturn0search0turn2search2
