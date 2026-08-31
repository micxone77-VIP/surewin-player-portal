# SureWin Player Portal Campaign Leaderboard View

**Date:** 2026-09-01
**Repository:** `micxone77-VIP/surewin-player-portal`

## Goal
Add a player-facing Leaderboard view inside the existing SureWin Player Portal. It must read the same Campaign and Campaign Player data used by CRM, update while a leaderboard campaign is active, freeze final rankings when the campaign ends, and avoid creating a second leaderboard website or data store.

## Design
- Add a `Leaderboard` item to the authenticated Portal bottom navigation.
- `/leaderboard` lists only campaigns whose `campaign_type = 'leaderboard'` and for which the authenticated player is enrolled/authorized by the backend.
- `/leaderboard/:id` displays one campaign leaderboard using the existing `campaigns` and `campaign_players` records.
- The visual treatment follows the supplied SureWin reference: dark/midnight UI, gold/orange accents, prominent podium Top 3, followed by a ranked list.
- The page shows campaign name, campaign dates, Live/Ended state, configured Top N, and the ranking metric (Valid Bet for the current leaderboard campaign model).
- Username masking is applied in the player-facing view; raw usernames are not required for presentation.
- A `My Position` card is shown when the authenticated player has a campaign-player record. It displays the player's current/final rank when qualified, otherwise the amount remaining to reach the minimum valid-bet threshold when applicable.

## Data Source and Ranking Semantics
- CRM Campaign configuration remains the single source of truth: `campaigns.top_n`, `campaigns.min_valid_bet`, `campaigns.rank_rewards`, `campaigns.start_date`, `campaigns.end_date`, and `campaigns.status`.
- Participant membership and performance remain in `campaign_players`.
- For active campaigns, ranking is calculated from the current campaign-player performance values (`valid_bet`) for enrolled players, filtered by the campaign minimum valid-bet threshold, with deterministic username tie-breaking.
- For ended campaigns, persisted `campaign_players.rank_position` and `reward_amount` are the authoritative final settlement state. Final ranking must not change because later source snapshots change.
- Existing manual override fields remain authoritative through backend sync logic; the Portal leaderboard is read-only and never changes performance values.

## Backend API
Create a player-safe `SECURITY DEFINER` RPC, `get_portal_leaderboard(p_campaign_id uuid)`. It must:
- Verify the caller is a player through the existing player identity helper.
- Return no data for non-leaderboard campaigns or campaigns the caller is not enrolled/authorized to view.
- Return safe campaign metadata: id, campaign name, dates, status, minimum valid bet, top N, and ranking metric label.
- Return player-facing ranking rows containing masked/presentable username, tier, valid bet, current/final rank, and reward amount/status only where appropriate.
- Include the caller's own row/rank for `My Position` without revealing CRM-only fields.
- Use `rank_position` as final authority for ended campaigns. For active campaigns, calculate ranking from current `valid_bet` without persisting rank positions.
- Never expose `vip_members`, `player_accounts`, `auth.users`, internal email, CRM notes, approval identities, or other CRM administration data.

## Navigation and Campaign Integration
- Add `Leaderboard` to authenticated navigation without removing Home, Campaigns, Rewards, Alerts, or Profile.
- On a leaderboard Campaign Detail page, provide a `View Leaderboard` entry point.
- Campaign list cards may show a small Leaderboard badge, but existing list behavior remains unchanged.
- Leaderboard pages and Campaign Detail reference the same campaign id; no duplicated configuration.

## Live Refresh
- While a leaderboard campaign is active, refresh from Supabase on page entry and at a target interval of 60 seconds, with manual refresh.
- Refresh must not create duplicate records or mutate campaign/player state.
- When the campaign is ended, switch to persisted final ranking and stop recomputing from later snapshots.

## Security Invariants
- Portal uses anon-key access only and keeps `surewin-portal-auth` session isolation.
- Leaderboard access is player-scoped through RLS and/or the dedicated SECURITY DEFINER RPC.
- Frontend code must not query CRM-only tables or implement eligibility/payout decisions.
- Reward payout status remains backend-authoritative.

## Error and Empty States
- No leaderboard campaigns: clean empty state with a link back to Campaigns.
- Campaign unavailable/unauthorized: do not reveal cross-player campaign existence; return to leaderboard/campaign list.
- Temporary data failure: retry control and preserve last successfully loaded view where possible.

## Testing Requirements
- Source-level regression tests verify the new page uses the player-safe RPC and does not access CRM-only data.
- Backend SQL tests verify active ranking, ended/frozen ranking, minimum-valid-bet qualification, deterministic ties, caller scoping, and no cross-player access.
- Build and existing portal regression tests continue to pass.

## Non-Goals
- Do not create a separate leaderboard website.
- Do not create a second leaderboard database/table for normal operation.
- Do not allow players to edit leaderboard performance.
- Do not move ranking eligibility or payout logic into React.
- Do not expose internal CRM administration data.
