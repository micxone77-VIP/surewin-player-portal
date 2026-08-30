# SureWin Player Portal Design

**Date:** 2026-08-31
**Repository:** `micxone77-VIP/surewin-player-portal`

## Goal
Complete the player-facing campaign experience on top of the existing isolated player authentication and Supabase security model, with Campaign Management in CRM remaining the single source of truth.

## Current State Verified
- Routing already separates `/login`, `/forgot-password`, `/set-password` from authenticated player routes.
- `PlayerAuthContext` uses a player-specific authentication flow and verifies the session with `is_player_auth` before loading the portal profile.
- The Supabase client uses the portal-specific storage key `surewin-portal-auth` and the anon key only.
- First-time password activation is already implemented through a recovery session and `supabase.auth.updateUser({ password })`.
- Campaign list is player-scoped and reads only player-safe campaign columns.
- Campaign detail already uses player-scoped RPCs for campaign, levels, and progress, and deliberately fetches `level_code` only for unlocked level IDs.
- Portal campaign detail explicitly treats backend state as authoritative for unlock/eligibility/claim behavior.

## Player Campaign Experience
### Campaign list
Show only campaigns available to the authenticated player. Existing filters remain `Active`, `Upcoming`, `Ended`, and `All`. Campaign list data must stay limited to player-safe columns.

### Campaign detail
Show campaign identity, dates, offer description, progress, rules, milestones, level journey, and reward state available to that player. The frontend may calculate display-only percentages but must never make eligibility or payout decisions.

### Multi-level campaigns
Use `campaign_levels` metadata plus player-scoped `campaign_player_levels` state. Current/next level is derived from backend unlock state, not from client-side threshold checks. Locked level codes remain inaccessible. Unlocked codes are fetched through the existing dedicated RPC.

### Rewards
Show only the authenticated player's reward records. CRM-only approval fields and internal notes remain excluded. Reward amounts are displayed exactly, without compact K/M formatting.

## Authentication and Security Invariants
- Player authentication remains separate from CRM authentication.
- Player JWT/session remains isolated from CRM session storage.
- Portal uses anon-key access only; no service-role key in browser code.
- Player data is accessed through RLS and/or player-scoped SECURITY DEFINER RPCs.
- Never query `vip_members`, `player_accounts`, `auth.users`, internal CRM profiles, internal email fields, or CRM role functions from Portal code.
- Campaign access must not reveal whether a campaign exists for another player when access is denied.
- Eligibility, unlock, claim, and payout state are backend-authoritative.

## Portal Navigation
Keep the existing authenticated routes: Dashboard, Campaigns, Campaign Detail, Rewards, Notifications, and Profile. The work should complete missing integration behavior within these existing boundaries rather than creating parallel pages.

## Error Handling
- Authentication failures return generic player-facing errors.
- Invalid/expired activation links are rejected and do not leave a usable session behind.
- Campaign access failures redirect to the campaign list without exposing cross-player existence.
- Campaign load errors provide retry behavior without leaking internal database details.
- Event logging remains best-effort and must not block the player UI.

## Testing Requirements
Tests must cover player-only authentication, activation link validation, campaign list scoping, campaign detail scoping, locked versus unlocked level-code access, reward visibility, and regression cases preventing CRM-only data exposure. Existing portal security-hardening coverage must remain passing.

## Non-Goals
- Do not create a second campaign data store.
- Do not move campaign eligibility logic into React.
- Do not expose CRM administration fields to players.
- Do not merge Portal authentication with CRM authentication.
- Do not replace the current activation flow unless a verified defect requires it.
