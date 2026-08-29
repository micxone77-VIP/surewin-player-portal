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
        campaignIds.map(campaignId => supabase.rpc('get_my_campaign_levels', { p_campaign_id: campaignId }))
      )
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
      const codeMap = {}
      const { data: codeRows } = await supabase.rpc('get_my_unlocked_level_codes')
      for (const row of codeRows ?? []) {
        if (row.level_code) codeMap[row.level_id] = row.level_code
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
              plMap={plMap}
              playerLevelMap={data.playerLevelMap}
              codeMap={codeMap}
              onViewCampaign={() => navigate(`/campaigns/${campaign.id}`)}
            />
          ))
        )}
      </div>

      <div style={styles.bottomPad} />
    </div>
  )
}

// ── CampaignGroup ──────────────────────────────────────────────────────────────
function CampaignGroup({ campaign, rewards, levelMap, plMap, playerLevelMap, codeMap, onViewCampaign }) {
  const s        = (campaign.status ?? '').toLowerCase()
  const festival = campaign.festival
  const daysLeft = calcDaysLeft(campaign.end_date)

  const statusCfg = {
    active:   { color: 'var(--success)', label: 'Active' },
    upcoming: { color: 'var(--info)',    label: 'Upcoming' },
    ended:    { color: 'var(--muted)',   label: 'Ended' },
  }[s] ?? { color: 'var(--muted)', label: s || 'Campaign' }

  return (
    <div style={styles.group}>
      {/* Campaign header */}
      <div style={styles.groupHeader}>
        <div style={styles.groupHeaderLeft}>
          {festival && <span style={styles.festivalTag}>{festival}</span>}
          <h2 style={styles.groupName}>{campaign.campaign_name}</h2>
          <div style={styles.groupMeta}>
            <span style={{ ...styles.groupStatus, color: statusCfg.color }}>
              {s === 'active' && <span style={{ ...styles.statusDot, background: statusCfg.color }} />}
              {statusCfg.label}
            </span>
            {campaign.start_date && campaign.end_date && (
              <span style={styles.groupDate}>
                {fmtDate(campaign.start_date)} – {fmtDate(campaign.end_date)}
              </span>
            )}
            {daysLeft !== null && daysLeft > 0 && s === 'active' && (
              <span style={styles.daysChip}>{daysLeft}d left</span>
            )}
          </div>
        </div>
        <button onClick={onViewCampaign} style={styles.viewCampBtn} title="View Campaign">
          <ChevronRightIcon />
        </button>
      </div>

      {/* Reward cards */}
      <div style={styles.cardList}>
        {rewards.map(reward => {
          const lid         = reward.campaign_level_id
          const level       = levelMap[lid]
          const pl          = reward.campaign_player_level_id
            ? playerLevelMap[reward.campaign_player_level_id]
            : plMap[lid]
          const plStatus    = pl?.status ?? null
          const isUnlocked  = pl && UNLOCKED_STATUSES.has(plStatus)
          // Code only available if level is unlocked (two-query security)
          const code        = isUnlocked ? (codeMap[lid] ?? null) : null

          return (
            <RewardCard
              key={reward.id}
              reward={reward}
              level={level}
              plStatus={plStatus}
              isUnlocked={isUnlocked}
              code={code}
              playerLevel={pl}
              campaignId={campaign.id}
            />
          )
        })}
      </div>
    </div>
  )
}

// ── RewardCard ─────────────────────────────────────────────────────────────────
function RewardCard({ reward, level, plStatus, isUnlocked, code, playerLevel }) {
  const [copied, setCopied] = useState(false)

  // Copy code — transient state only, never logged or stored
  function handleCopy() {
    if (!code) return  // guard: only callable when code is present
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    }).catch(() => {})
  }

  const payoutCfg = {
    pending:  { label: 'Pending Payout',  color: 'var(--warn)',    bg: 'var(--warn-bg)' },
    approved: { label: 'Approved',        color: 'var(--info)',    bg: 'var(--info-bg)' },
    paid:     { label: 'Paid',            color: 'var(--success)', bg: 'var(--success-bg)' },
    rejected: { label: 'Rejected',        color: 'var(--danger)',  bg: 'var(--danger-bg)' },
    issued:   { label: 'Issued',          color: 'var(--info)',    bg: 'var(--info-bg)' },
    claimed:  { label: 'Claimed',         color: 'var(--success)', bg: 'var(--success-bg)' },
  }
  const payout    = payoutCfg[reward.status] ?? { label: reward.status ?? '—', color: 'var(--muted)', bg: 'var(--surface2)' }
  const unlockCfg = isUnlocked
    ? { label: 'Unlocked', color: 'var(--success)', bg: 'var(--success-bg)' }
    : { label: 'Locked',   color: 'var(--muted)',   bg: 'var(--surface2)' }

  const isGold    = isUnlocked  // gold glow on unlocked cards

  return (
    <div style={{ ...styles.card, ...(isGold ? styles.cardGold : {}) }}>
      {/* Top accent line for unlocked */}
      {isGold && <div style={styles.cardGoldLine} />}

      {/* Level badge + unlock status */}
      <div style={styles.cardTop}>
        <div style={styles.levelBadge}>
          {level?.level_order != null && (
            <span style={styles.levelNum}>L{level.level_order}</span>
          )}
          <span style={styles.levelName}>{level?.level_name ?? 'Level'}</span>
        </div>
        <span style={{ ...styles.unlockChip, color: unlockCfg.color, background: unlockCfg.bg }}>
          {isUnlocked ? <CheckCircleIcon size={13} /> : <LockIcon size={13} />}
          {unlockCfg.label}
        </span>
      </div>

      {/* Reward amount — visual centrepiece */}
      <div style={{ ...styles.amountWrap, ...(isGold ? styles.amountWrapGold : {}) }}>
        <GiftIcon size={isGold ? 20 : 16} style={{ color: isGold ? 'var(--gold)' : 'var(--muted)', flexShrink: 0 }} />
        <span style={{ ...styles.amount, ...(isGold ? styles.amountGold : {}) }}>
          {fmtAmt(reward.reward_amount)}
        </span>
        {level?.reward_type && (
          <span style={styles.rewardType}>{level.reward_type}</span>
        )}
      </div>

      {/* Code block */}
      <div style={styles.codeBlock}>
        {isUnlocked && code ? (
          /* ── Unlocked: show code + copy ── */
          <div style={styles.codeUnlocked}>
            <div style={styles.codeUnlockedLabel}>
              <CheckCircleIcon size={12} style={{ color: 'var(--success)' }} />
              REWARD CODE
            </div>
            <div style={styles.codeRow}>
              <span style={styles.codeText}>{code}</span>
              <button
                onClick={handleCopy}
                style={{ ...styles.copyBtn, ...(copied ? styles.copyBtnDone : {}) }}
                aria-label={copied ? 'Copied' : 'Copy code'}
              >
                {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {copied && (
              <div style={styles.copiedToast}>Code copied to clipboard</div>
            )}
          </div>
        ) : isUnlocked && !code ? (
          /* ── Unlocked but no code (e.g. cash payout type) ── */
          <div style={styles.codeNoCode}>
            <CheckCircleIcon size={13} style={{ color: 'var(--success)' }} />
            <span>Reward unlocked — payout via cashback</span>
          </div>
        ) : (
          /* ── Locked: placeholder only ── */
          <div style={styles.codeLocked}>
            <LockIcon size={14} style={{ color: 'var(--muted)' }} />
            <div>
              <div style={styles.codeLockedTitle}>Code Locked</div>
              <div style={styles.codeLockedSub}>Unlock this reward to reveal your code.</div>
            </div>
          </div>
        )}
      </div>

      {/* Payout status + dates */}
      <div style={styles.cardFooter}>
        <span style={{ ...styles.payoutChip, color: payout.color, background: payout.bg }}>
          {payout.label}
        </span>
        <div style={styles.footerDates}>
          {reward.paid_at && (
            <span style={styles.dateChip}>Paid {fmtDate(reward.paid_at)}</span>
          )}
          {!reward.paid_at && playerLevel?.unlocked_at && (
            <span style={styles.dateChip}>Unlocked {fmtDate(playerLevel.unlocked_at)}</span>
          )}
          {!reward.paid_at && !playerLevel?.unlocked_at && reward.created_at && (
            <span style={styles.dateChip}>{fmtDate(reward.created_at)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SkeletonRewards ───────────────────────────────────────────────────────────
function SkeletonRewards() {
  const sk = { background: 'var(--surface2)', borderRadius: 6, animation: 'rwdSkel 1.6s ease-in-out infinite' }
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerTop}>
            <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
              <div style={{ ...sk, width: 80, height: 11 }} />
              <div style={{ ...sk, width: 160, height: 26 }} />
            </div>
            <div style={{ ...sk, width: 42, height: 42, borderRadius: 10 }} />
          </div>
        </div>
      </div>
      <div style={styles.filterRow}>
        {[80,72,72,60].map((w, i) => (
          <div key={i} style={{ ...sk, width: w, height: 32, borderRadius: 20 }} />
        ))}
      </div>
      <div style={styles.content}>
        {[1,2].map(i => (
          <div key={i} style={{ ...styles.group, gap: 12 }}>
            <div style={{ ...sk, width: '60%', height: 18 }} />
            {[1,2].map(j => (
              <div key={j} style={{ ...styles.card, gap: 14, padding: '1.25rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <div style={{ ...sk, width: '45%', height: 14 }} />
                  <div style={{ ...sk, width: '25%', height: 20, borderRadius: 20 }} />
                </div>
                <div style={{ ...sk, width: '55%', height: 28 }} />
                <div style={{ ...sk, width: '100%', height: 58, borderRadius: 10 }} />
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                  <div style={{ ...sk, width: '35%', height: 22, borderRadius: 20 }} />
                  <div style={{ ...sk, width: '30%', height: 14 }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── ErrorState ────────────────────────────────────────────────────────────────
function ErrorState({ message, onRetry }) {
  return (
    <div style={styles.centred}>
      <div style={styles.errorIcon}><AlertIcon /></div>
      <div style={styles.errorTitle}>Unable to load your rewards.</div>
      <div style={styles.errorSub}>Please check your connection and try again.</div>
      <button onClick={onRetry} style={styles.retryBtn}>Try Again</button>
    </div>
  )
}

// ── EmptyState ────────────────────────────────────────────────────────────────
function EmptyState({ filter, hasRewards }) {
  if (hasRewards) {
    // Has rewards but none match the current filter
    return (
      <div style={styles.centred}>
        <div style={styles.emptyIcon}><TrophyIcon dim /></div>
        <div style={styles.emptyTitle}>No {filter.toLowerCase()} rewards</div>
        <div style={styles.emptySub}>Switch to "All" to see your full reward history.</div>
      </div>
    )
  }
  return (
    <div style={styles.centred}>
      <div style={styles.emptyIconLarge}><TrophyIcon dim /></div>
      <div style={styles.emptyTitle}>No rewards yet</div>
      <div style={styles.emptySub}>
        Complete your campaign milestones to unlock VIP rewards.
      </div>
    </div>
  )
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────
function TrophyIcon({ dim }) {
  return (
    <svg width={dim ? 36 : 28} height={dim ? 36 : 28} viewBox="0 0 24 24" fill="none"
      stroke={dim ? 'var(--dim)' : 'var(--gold)'} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H3V5h3M18 9h3V5h-3M6 5h12v7a6 6 0 01-12 0V5z" />
      <path d="M12 18v3M8 21h8" />
    </svg>
  )
}
function LockIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  )
}
function CheckCircleIcon({ size = 16, style: s }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={s?.color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
    </svg>
  )
}
function GiftIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  )
}
function ChevronRightIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    paddingBottom: 80,
  },

  // Header
  header: {
    background: 'linear-gradient(180deg, var(--surface) 0%, transparent 100%)',
    borderBottom: '1px solid var(--border-s)',
    paddingTop: 'max(env(safe-area-inset-top,0px), 12px)',
  },
  headerInner: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '1rem 1.25rem 1.25rem',
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerEyebrow: {
    fontSize: '.65rem',
    fontWeight: 700,
    letterSpacing: '.12em',
    color: 'var(--gold)',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-.02em',
  },
  trophyWrap: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.2)',
    borderRadius: 12,
    width: 46,
    height: 46,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerMeta: {
    marginTop: 8,
    fontSize: '.8rem',
    color: 'var(--muted)',
  },
  headerMetaNum: { color: 'var(--text-2)', fontWeight: 600 },
  headerMetaLabel: {},

  // Filter tabs
  filterRow: {
    display: 'flex',
    gap: 8,
    padding: '1rem 1.25rem .5rem',
    maxWidth: 640,
    margin: '0 auto',
    overflowX: 'auto',
    msOverflowStyle: 'none',
    scrollbarWidth: 'none',
  },
  filterBtn: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '.42rem .9rem',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--muted)',
    fontSize: '.78rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all .15s',
    whiteSpace: 'nowrap',
  },
  filterBtnActive: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.3)',
    color: 'var(--gold)',
    fontWeight: 600,
  },
  filterBadge: {
    background: 'rgba(201,166,72,.2)',
    color: 'var(--gold)',
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: '.7rem',
    fontWeight: 700,
  },

  // Content
  content: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '1rem 1.25rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },

  // Campaign group
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    animation: 'rwdSlideIn .3s ease-out',
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 4,
    borderBottom: '1px solid var(--border-s)',
  },
  groupHeaderLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  festivalTag: {
    display: 'inline-block',
    fontSize: '.65rem',
    fontWeight: 700,
    letterSpacing: '.1em',
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.2)',
    borderRadius: 4,
    padding: '.15rem .45rem',
    alignSelf: 'flex-start',
  },
  groupName: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-.01em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  groupMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupStatus: {
    fontSize: '.72rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'rwdPulse 1.8s ease-in-out infinite',
  },
  groupDate: {
    fontSize: '.7rem',
    color: 'var(--muted)',
  },
  daysChip: {
    fontSize: '.68rem',
    fontWeight: 600,
    color: 'var(--info)',
    background: 'var(--info-bg)',
    borderRadius: 10,
    padding: '.1rem .4rem',
  },
  viewCampBtn: {
    color: 'var(--muted)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    transition: 'color .15s',
  },

  // Reward card
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--rl)',
    padding: '1.1rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  cardGold: {
    border: '1px solid rgba(201,166,72,.22)',
    background: 'linear-gradient(160deg, #1e2a3d 0%, #1a2336 100%)',
    boxShadow: '0 0 0 0 transparent, inset 0 1px 0 rgba(201,166,72,.08)',
  },
  cardGoldLine: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
    background: 'linear-gradient(90deg, transparent, var(--gold), var(--gold-2), var(--gold), transparent)',
  },

  cardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  levelBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  levelNum: {
    background: 'var(--surface2)',
    color: 'var(--gold)',
    fontSize: '.65rem',
    fontWeight: 800,
    letterSpacing: '.06em',
    padding: '.15rem .45rem',
    borderRadius: 4,
    border: '1px solid var(--border)',
  },
  levelName: {
    fontSize: '.82rem',
    fontWeight: 600,
    color: 'var(--text-2)',
  },
  unlockChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '.7rem',
    fontWeight: 600,
    padding: '.25rem .6rem',
    borderRadius: 20,
    flexShrink: 0,
  },

  // Amount
  amountWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  amountWrapGold: {},
  amount: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-.02em',
    lineHeight: 1,
  },
  amountGold: {
    color: 'var(--gold-2)',
    textShadow: '0 0 20px rgba(201,166,72,.25)',
  },
  rewardType: {
    fontSize: '.7rem',
    fontWeight: 500,
    color: 'var(--muted)',
    background: 'var(--surface2)',
    borderRadius: 6,
    padding: '.2rem .5rem',
    border: '1px solid var(--border)',
    textTransform: 'uppercase',
    letterSpacing: '.04em',
  },

  // Code block
  codeBlock: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  codeUnlocked: {
    background: 'rgba(34,197,94,.06)',
    border: '1px solid rgba(34,197,94,.2)',
    borderRadius: 10,
    padding: '.75rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  codeUnlockedLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: '.65rem',
    fontWeight: 700,
    letterSpacing: '.1em',
    color: 'var(--success)',
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  codeText: {
    fontSize: '1.15rem',
    fontWeight: 800,
    letterSpacing: '.12em',
    color: 'var(--text)',
    fontVariantNumeric: 'tabular-nums',
    wordBreak: 'break-all',
  },
  copyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '.35rem .8rem',
    borderRadius: 8,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    fontSize: '.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all .15s',
  },
  copyBtnDone: {
    background: 'var(--success-bg)',
    border: '1px solid rgba(34,197,94,.3)',
    color: 'var(--success)',
  },
  copiedToast: {
    fontSize: '.7rem',
    color: 'var(--success)',
    animation: 'rwdCopied 2.2s ease-out forwards',
  },
  codeNoCode: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--success-bg)',
    border: '1px solid rgba(34,197,94,.15)',
    borderRadius: 10,
    padding: '.65rem .9rem',
    fontSize: '.8rem',
    color: 'var(--success)',
    fontWeight: 500,
  },
  codeLocked: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '.75rem 1rem',
  },
  codeLockedTitle: {
    fontSize: '.78rem',
    fontWeight: 600,
    color: 'var(--muted)',
    marginBottom: 2,
  },
  codeLockedSub: {
    fontSize: '.72rem',
    color: 'var(--dim)',
  },

  // Card footer
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  payoutChip: {
    fontSize: '.72rem',
    fontWeight: 600,
    padding: '.25rem .65rem',
    borderRadius: 20,
    flexShrink: 0,
  },
  footerDates: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  dateChip: {
    fontSize: '.7rem',
    color: 'var(--muted)',
  },

  // Empty / error
  centred: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '4rem 2rem',
    gap: 12,
  },
  emptyIcon: {},
  emptyIconLarge: { marginBottom: 8 },
  emptyTitle: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: 'var(--text-2)',
  },
  emptySub: {
    fontSize: '.85rem',
    color: 'var(--muted)',
    maxWidth: 280,
    lineHeight: 1.55,
  },
  errorIcon: { marginBottom: 4 },
  errorTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text-2)',
  },
  errorSub: {
    fontSize: '.83rem',
    color: 'var(--muted)',
  },
  retryBtn: {
    marginTop: 8,
    padding: '.6rem 1.5rem',
    borderRadius: 10,
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.25)',
    color: 'var(--gold)',
    fontWeight: 600,
    fontSize: '.85rem',
    cursor: 'pointer',
  },

  bottomPad: { height: 32 },
}
