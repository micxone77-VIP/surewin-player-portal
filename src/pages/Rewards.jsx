// Rewards — STEP 6
// VIP Reward Wallet — real Supabase data, two-query code-security pattern.
//
// Security contract (same pattern as CampaignDetail STEP 5):
//   ✓ level_code fetched ONLY for level IDs where campaign_player_levels.status is unlocked
//   ✗ Locked codes never appear in any network response or state
//   ✗ Codes never written to localStorage / sessionStorage / URL / console / analytics
//   ✗ No CRM-only fields: approved_by, notes excluded from all selects
//   ✗ No forbidden tables: vip_members, vip_daily_snapshots, player_accounts, profiles, auth.users
//   ✗ No get_campaigns_crm()
//
// Event logging:
//   portal_view_rewards — now in log_portal_event allowlist ✅

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate }      from 'react-router-dom'
import { supabase }         from '../lib/supabase'
import { fireAndForget } from '../lib/fireAndForget'
import { buildRewardView } from '../lib/rewardViewModel'

// ── Backend status sets ───────────────────────────────────────────────────────
// UNLOCKED_STATUSES: campaign_player_levels.status values that mean code is safe to show
const UNLOCKED_STATUSES = new Set(['unlocked', 'claimed', 'issued', 'paid', 'approved'])

// PAYOUT_PENDING: campaign_rewards.status values meaning payout not yet complete
const PAYOUT_PENDING = new Set(['pending', 'approved'])

// ── Player-safe column selects ────────────────────────────────────────────────
// approved_by (CRM UUID) and notes (CRM staff text) intentionally excluded
const REWARD_SELECT   = 'id, campaign_level_id, campaign_player_id, reward_amount, status, paid_at, created_at, updated_at'
// level_code intentionally excluded — fetched separately ONLY for unlocked levels
const LEVEL_SELECT    = 'id, campaign_id, level_order, level_name, reward_type, description'
const CPL_SELECT      = 'campaign_level_id, status, unlocked_at'
const CAMPAIGN_SELECT = 'id, campaign_name, festival, start_date, end_date, status'

const FILTERS = ['All', 'Unlocked', 'Pending', 'Paid']

// ── Skeleton animation ────────────────────────────────────────────────────────
;(function injectSkelAnim() {
  if (document.getElementById('rwd-anim')) return
  const s = document.createElement('style')
  s.id = 'rwd-anim'
  s.textContent = `
    @keyframes rwdSkel { 0%,100%{opacity:.35} 50%{opacity:.7} }
    @keyframes rwdPulse { 0%,100%{opacity:1} 50%{opacity:.55} }
    @keyframes rwdSlideIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
    @keyframes rwdCopied { 0%{opacity:0;transform:scale(.92)} 15%{opacity:1;transform:scale(1)} 85%{opacity:1} 100%{opacity:0} }
  `
  document.head.appendChild(s)
})()

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return null }
}
function fmtAmt(n) {
  const v = Number(n ?? 0)
  return `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function calcDaysLeft(endDate) {
  if (!endDate) return null
  const diff = Math.ceil((new Date(endDate) - Date.now()) / 86400000)
  return diff
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Rewards() {
  const navigate          = useNavigate()
  const [data, setData]   = useState(null)   // reward view model + unlocked code map
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('All')
  const loggedRef             = useRef(false)

  const loadRewards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Step 1: reward rows are RLS-scoped to the signed-in player.
      const { data: rewards, error: rwErr } = await supabase
        .from('campaign_rewards')
        .select(REWARD_SELECT)
        .order('created_at', { ascending: false })

      if (rwErr) throw rwErr

      if (!rewards || rewards.length === 0) {
        setData({ rewards: [], levelMap: {}, playerLevelMap: {}, playerLevelByCampaignLevel: {}, campaignMap: {}, codeMap: {}, filtered: { All: [], Unlocked: [], Pending: [], Paid: [] }, counts: { All: 0, Unlocked: 0, Pending: 0, Paid: 0 }, groups: [] })
        setLoading(false)
        return
      }

      // Direct campaign_levels REST access is not authoritative for the portal.
      // Use the same SECURITY DEFINER level RPC as CampaignDetail, per enrolled campaign.
      const { data: campaigns, error: campErr } = await supabase
        .from('campaigns')
        .select(CAMPAIGN_SELECT)
        .order('created_at', { ascending: false })
      if (campErr) throw campErr

      const campaignIds = [...new Set((campaigns ?? []).map(c => c.id).filter(Boolean))]
      const levelResults = await Promise.all(
        campaignIds.map(campaignId => supabase.rpc('get_portal_campaign_levels', { p_campaign_id: campaignId }))
      )
      for (const result of levelResults) {
        if (result.error) throw result.error
      }
      const levels = levelResults.flatMap(result => result.data ?? [])

      const levelIds = [...new Set(levels.map(l => l.id).filter(Boolean))]
      let playerLevels = []
      if (levelIds.length > 0) {
        const { data: plRows, error: plErr } = await supabase
          .from('campaign_player_levels')
          .select('id, campaign_level_id, status, unlocked_at')
          .in('campaign_level_id', levelIds)
        if (plErr) throw plErr
        playerLevels = plRows ?? []
      }

      const view = buildRewardView({ rewards, levels, playerLevels, campaigns: campaigns ?? [] })

      // level_code is fetched separately via SECURITY DEFINER RPC and only unlocked codes are returned.
      // The RPC is campaign-scoped; do not call it without p_campaign_id.
      const codeMap = {}
      const codeResults = await Promise.all(
        campaignIds.map(campaignId => supabase.rpc('get_my_unlocked_level_codes', { p_campaign_id: campaignId }))
      )
      for (const result of codeResults) {
        if (result.error) throw result.error
        for (const row of result.data ?? []) {
          if (row.level_code) codeMap[row.level_id] = row.level_code
        }
      }

      setData({ ...view, codeMap })
    } catch (err) {
      setError('Unable to load your rewards.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRewards() }, [loadRewards])

  // Event logging — portal_view_rewards is now in the backend allowlist.
  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    fireAndForget(
      supabase.rpc('log_portal_event', { p_event_type: 'portal_view_rewards' })
    )
  }, [])

  if (loading) return <SkeletonRewards />
  if (error)   return <ErrorState message={error} onRetry={loadRewards} />

  const { rewards, levelMap, playerLevelByCampaignLevel, campaignMap, codeMap, filtered, counts } = data
  const plMap = playerLevelByCampaignLevel

  const selectedRewards = filtered[filter] ?? []
  const groups = []
  const groupMap = {}
  for (const reward of selectedRewards) {
    const level = levelMap[reward.campaign_level_id]
    const campaign = level ? campaignMap[level.campaign_id] : null
    if (!campaign) continue
    if (!groupMap[campaign.id]) {
      groupMap[campaign.id] = { campaign, items: [] }
      groups.push(groupMap[campaign.id])
    }
    groupMap[campaign.id].items.push(reward)
  }
  const total = rewards.length

  return (
    <div style={styles.page}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerTop}>
            <div>
              <div style={styles.headerEyebrow}>VIP MEMBER</div>
              <h1 style={styles.headerTitle}>Your Rewards</h1>
            </div>
            <div style={styles.trophyWrap}>
              <TrophyIcon />
            </div>
          </div>
          {total > 0 && (
            <div style={styles.headerMeta}>
              <span style={styles.headerMetaNum}>{total}</span>
              <span style={styles.headerMetaLabel}> reward{total !== 1 ? 's' : ''} total</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div style={styles.filterRow}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ ...styles.filterBtn, ...(filter === f ? styles.filterBtnActive : {}) }}
          >
            {f}
            {f !== 'All' && (() => {
              const count = counts[f] ?? 0
              return count > 0 ? <span style={styles.filterBadge}>{count}</span> : null
            })()}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={styles.content}>
        {groups.length === 0 ? (
          <EmptyState filter={filter} hasRewards={total > 0} />
        ) : (
          groups.map(({ campaign, items }) => (
            <CampaignGroup
              key={campaign.id}
              campaign={campaign}
              rewards={items}
              levelMap={levelMap}
              playerLevelMap={plMap}
              codeMap={codeMap}
              navigate={navigate}
            />
          ))
        )}
      </div>
    </div>
  )
}

// -- CampaignGroup ------------------------------------------------------------
function CampaignGroup({ campaign, rewards, levelMap, playerLevelMap, codeMap, navigate }) {
  return (
    <section style={styles.group}>
      <div style={styles.groupHeader}>
        <div>
          {campaign.festival && <div style={styles.festival}>{campaign.festival}</div>}
          <h2 style={styles.groupTitle}>{campaign.campaign_name}</h2>
        </div>
        <span style={styles.statusChip}>{campaign.status}</span>
      </div>
      <div style={styles.rewardList}>
        {rewards.map(reward => (
          <RewardRow
            key={reward.id}
            reward={reward}
            level={levelMap[reward.campaign_level_id]}
            playerLevel={playerLevelMap[reward.campaign_level_id]}
            code={codeMap[reward.campaign_level_id]}
            onCampaign={() => navigate(`/campaigns/${campaign.id}`)}
          />
        ))}
      </div>
    </section>
  )
}
