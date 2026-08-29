// Dashboard.jsx — Player Portal main dashboard (STEP 3)
// Data sources:
//   profile           → PlayerAuthContext (get_my_portal_profile via context)
//   campaigns         → supabase.from('campaigns') — player RLS filters to enrolled only
//   campaign progress → get_my_campaign_progress(campaign_id) RPC (SECURITY DEFINER)
//   campaign levels   → get_my_campaign_levels(campaign_id) RPC — player-scoped metadata
//   player levels     → supabase.from('campaign_player_levels') — player RLS
//   notifications     → supabase.from('player_notifications') — count only
//   event logging     → log_portal_event('portal_view_dashboard')
//
// Security invariants:
//   ✗ No vip_members query        ✗ No player_accounts query
//   ✗ No internal_email           ✗ No auth.users query
//   ✗ No get_my_role()            ✗ No get_campaigns_crm()
//   ✗ No service_role key         ✗ No hardcoded thresholds/rewards
//   ✗ No eligibility logic        ✗ No vip_daily_snapshots query
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayerAuth } from '../context/PlayerAuthContext'
import { supabase } from '../lib/supabase'
import { fireAndForget } from '../lib/fireAndForget'

// ── Tier config ──────────────────────────────────────────────────────────────
const TIER_CONFIG = {
  diamond:  { emoji: '💎', color: '#a78bfa', label: 'DIAMOND VIP' },
  platinum: { emoji: '🏆', color: '#60a5fa', label: 'PLATINUM VIP' },
  gold:     { emoji: '⭐', color: '#f59e0b', label: 'GOLD VIP' },
  silver:   { emoji: '🥈', color: '#94a3b8', label: 'SILVER VIP' },
  bronze:   { emoji: '🥉', color: '#cd7f32', label: 'BRONZE VIP' },
  black:    { emoji: '♠', color: '#e5e7eb', label: 'BLACK VIP' },
}

function getTierCfg(tier) {
  if (!tier) return null
  return TIER_CONFIG[tier.toLowerCase()] ?? {
    emoji: '🌟', color: 'var(--gold)', label: `${tier.toUpperCase()} VIP`,
  }
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtRM(n) {
  const v = Number(n ?? 0)
  if (v >= 1_000_000) return `RM ${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `RM ${(v / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0 })}`
}

// Rewards must always show the exact configured amount.
// Do not use compact K/M formatting for reward values.
function fmtRMFull(n) {
  const v = Number(n ?? 0)
  return `RM ${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

const UNLOCKED_LEVEL_STATUSES = new Set(['unlocked', 'claimed', 'issued', 'paid', 'approved'])

function calcPct(current, target) {
  if (!target || Number(target) <= 0) return 0
  return Math.min(100, Math.max(0, (Number(current) / Number(target)) * 100))
}

// ── Main component ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { profile } = usePlayerAuth()
  const navigate = useNavigate()

  const [campaigns,   setCampaigns]   = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const loggedRef = useRef(false)

  // ── Data loader ────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // 1. Player's enrolled campaigns (RLS policy: is_player_enrolled_in_campaign)
      //    returns ONLY campaigns the player is enrolled in.
      const { data: rawCampaigns, error: campErr } = await supabase
        .from('campaigns')
        .select('id, campaign_name, status, start_date, end_date, is_multi_level, offer_desc, campaign_type')
        .order('created_at', { ascending: false })

      if (campErr) throw campErr

      // 2. Unread notification count (player_notifications RLS: own rows only)
      const { count: unread } = await supabase
        .from('player_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false)

      setUnreadCount(unread ?? 0)

      const list = rawCampaigns ?? []
      if (list.length === 0) {
        setCampaigns([])
        return
      }

      const ids = list.map(c => c.id)

      // 3. Parallel: progress per campaign + player-scoped level metadata + player unlock state
      const [progressArr, levelResults, plRes] = await Promise.all([
        // get_my_campaign_progress: SECURITY DEFINER — backend is authoritative
        Promise.all(
          list.map(c =>
            supabase
              .rpc('get_my_campaign_progress', { p_campaign_id: c.id })
              .then(r => r.data)
          )
        ),
        // get_my_campaign_levels: SECURITY DEFINER — authoritative, player-scoped metadata
        Promise.all(
          ids.map(campaignId =>
            supabase
              .rpc('get_my_campaign_levels', { p_campaign_id: campaignId })
              .then(r => r.data ?? [])
          )
        ),
        // campaign_player_levels: which levels player has unlocked (player RLS)
        supabase
          .from('campaign_player_levels')
          .select('campaign_level_id, status, unlocked_at'),
      ])

      const allLevels  = levelResults.flat()
      const plLevels   = plRes.data ?? []
      // Set of campaign_level IDs the player has actually unlocked.
      // `in_progress` is NOT completed; backend status is authoritative.
      const unlockedIds = new Set(plLevels.filter(pl => UNLOCKED_LEVEL_STATUSES.has(pl.status)).map(pl => pl.campaign_level_id))

      // 4. Enrich each campaign with computed display data
      const enriched = list.map((c, i) => {
        const prog  = progressArr[i] ?? {}
        const lvls  = allLevels
          .filter(l => l.campaign_id === c.id)
          .sort((a, b) => a.level_order - b.level_order)

        const totalDeposit  = Number(prog.total_deposit  ?? 0)
        const depositTarget = Number(prog.deposit_target ?? 0)

        let nextLevel      = null
        let completedCount = 0

        if (c.is_multi_level && lvls.length > 0) {
          for (const lvl of lvls) {
            if (unlockedIds.has(lvl.id)) {
              completedCount++
            } else if (!nextLevel) {
              nextLevel = lvl
            }
          }
        }

        return {
          ...c,
          prog,
          lvls,
          totalDeposit,
          depositTarget,
          nextLevel,
          completedCount,
        }
      })

      setCampaigns(enriched)
    } catch (err) {
      console.error('[Dashboard] load error:', err?.message ?? err)
      setError('Unable to load your campaigns.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Log event once per dashboard mount.
  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    fireAndForget(
      supabase.rpc('log_portal_event', { p_event_type: 'portal_view_dashboard' })
    )
  }, [])

  const tier = getTierCfg(profile?.tier)

  return (
    <div style={styles.page}>

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <p style={styles.greeting}>Welcome back</p>
            <h1 style={styles.playerName}>
              {profile?.full_name ?? profile?.username ?? '—'}
            </h1>
          </div>

          <div style={styles.headerActions}>
            {/* Notification bell */}
            {unreadCount > 0 && (
              <button
                style={styles.bellBtn}
                onClick={() => navigate('/notifications')}
                aria-label={`${unreadCount} unread notifications`}
              >
                <BellIcon />
                <span style={styles.bellBadge}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              </button>
            )}

            {/* Tier badge */}
            {tier && (
              <div
                style={{
                  ...styles.tierBadge,
                  color:       tier.color,
                  borderColor: tier.color + '55',
                  background:  tier.color + '12',
                }}
              >
                <span>{tier.emoji}</span>
                <span style={styles.tierLabel}>{tier.label}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── VIP SUMMARY CARD ───────────────────────────────────────── */}
      <section style={styles.section}>
        {loading ? (
          <Skeleton height={76} radius={12} />
        ) : (
          <div style={styles.vipCard}>
            <div style={{
              ...styles.vipCardAccent,
              background: tier
                ? `linear-gradient(90deg, transparent, ${tier.color}55, ${tier.color}99, ${tier.color}55, transparent)`
                : 'linear-gradient(90deg, transparent, var(--gold), var(--gold-2), var(--gold), transparent)',
            }} />
            <div style={styles.vipCardBody}>
              <div style={styles.vipRow}>
                <VipStat label="Username" value={profile?.username ?? '—'} />
                <VipStat label="Account" value={<AccountStatus active={profile?.is_active} />} />
                <VipStat
                  label="VIP Tier"
                  value={
                    <span style={{ color: tier?.color ?? 'var(--gold)', fontWeight: 700 }}>
                      {profile?.tier
                        ? profile.tier.charAt(0).toUpperCase() + profile.tier.slice(1)
                        : '—'}
                    </span>
                  }
                  align="right"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── ACTIVE CAMPAIGNS ───────────────────────────────────────── */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>
          <CampaignIcon size={16} />
          Active Campaigns
        </h2>

        {loading ? (
          <>
            <Skeleton height={240} radius={14} />
          </>
        ) : error ? (
          <div style={styles.errorBox}>
            <span style={styles.errorIcon}>⚠</span>
            <p style={styles.errorMsg}>{error}</p>
            <button style={styles.retryBtn} onClick={loadDashboard}>
              Retry
            </button>
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState />
        ) : (
          campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)
        )}
      </section>

      {/* ── QUICK ACTIONS ──────────────────────────────────────────── */}
      {!loading && (
        <section style={{ ...styles.section, paddingBottom: '2rem' }}>
          <h2 style={styles.sectionTitle}>
            <GridIcon size={16} />
            Quick Access
          </h2>
          <div style={styles.actionsGrid}>
            <ActionTile
              icon={<CampaignIcon size={22} />}
              label="Campaigns"
              onClick={() => navigate('/campaigns')}
            />
            <ActionTile
              icon={<GiftIcon size={22} />}
              label="Rewards"
              onClick={() => navigate('/rewards')}
            />
            <ActionTile
              icon={<BellIcon size={22} />}
              label="Alerts"
              onClick={() => navigate('/notifications')}
              badge={unreadCount}
            />
          </div>
        </section>
      )}

    </div>
  )
}

// ── CampaignCard ─────────────────────────────────────────────────────────────
function CampaignCard({ campaign }) {
  const {
    campaign_name, status, start_date, end_date,
    is_multi_level, offer_desc,
    totalDeposit, depositTarget, nextLevel, completedCount, lvls, prog,
  } = campaign

  const isMulti   = is_multi_level && lvls.length > 0
  const allDone   = isMulti && !nextLevel && completedCount > 0
  const nextThreshold = nextLevel ? Number(nextLevel.deposit_threshold) : null
  const pct           = nextThreshold ? calcPct(totalDeposit, nextThreshold) : 0
  const remaining     = nextThreshold ? Math.max(0, nextThreshold - totalDeposit) : 0

  return (
    <div style={styles.campaignCard}>
      <div style={styles.campaignCardBar} />
      <div style={styles.campaignCardBody}>

        {/* Campaign header row */}
        <div style={styles.campHeader}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={styles.campName}>{campaign_name}</h3>
            {(start_date || end_date) && (
              <p style={styles.campPeriod}>
                📅&nbsp;
                {start_date ? fmtDate(start_date) : '?'}
                {' – '}
                {end_date   ? fmtDate(end_date)   : 'Ongoing'}
              </p>
            )}
          </div>
          <CampStatusChip status={status} />
        </div>

        {/* Optional description */}
        {offer_desc && (
          <p style={styles.campDesc}>{offer_desc}</p>
        )}

        {/* Multi-level progress */}
        {isMulti && (
          allDone ? (
            <div style={styles.allDoneBox}>
              <span style={{ fontSize: '2rem' }}>🏆</span>
              <p style={styles.allDoneText}>All levels completed!</p>
              <p style={styles.allDoneSub}>Congratulations on completing all milestones.</p>
            </div>
          ) : nextLevel ? (
            <>
              {/* Progress */}
              <div style={styles.progressBlock}>
                <div style={styles.amountRow}>
                  <span style={styles.amtCurrent}>{fmtRM(totalDeposit)}</span>
                  <span style={styles.amtTarget}>{fmtRM(nextLevel.deposit_threshold)}</span>
                </div>
                <ProgressBar pct={pct} />
                <p style={styles.remainingTxt}>
                  {fmtRM(remaining)} more to unlock
                </p>
              </div>

              {/* Next milestone card */}
              <div style={styles.milestoneBox}>
                <p style={styles.milestoneLabel}>NEXT MILESTONE</p>
                <p style={styles.milestoneName}>{nextLevel.level_name}</p>
                <div style={styles.milestoneRewards}>
                  <span style={styles.rewardChip}>
                    🎁&nbsp;{fmtRMFull(nextLevel.reward_amount)}
                    {nextLevel.reward_type ? ` ${nextLevel.reward_type}` : ''}
                  </span>
                  {/* Locked milestone codes are intentionally never fetched or displayed. */}
                </div>
              </div>
            </>
          ) : null
        )}

        {/* Single-level progress */}
        {!isMulti && depositTarget > 0 && (
          <div style={styles.progressBlock}>
            <div style={styles.amountRow}>
              <span style={styles.amtCurrent}>{fmtRM(totalDeposit)}</span>
              <span style={styles.amtTarget}>{fmtRM(depositTarget)}</span>
            </div>
            <ProgressBar pct={calcPct(totalDeposit, depositTarget)} />
            {totalDeposit < depositTarget && (
              <p style={styles.remainingTxt}>
                {fmtRM(Math.max(0, depositTarget - totalDeposit))} more to goal
              </p>
            )}
            {Number(prog?.reward_amount) > 0 && (
              <div style={styles.milestoneBox}>
                <span style={styles.rewardChip}>
                  🎁&nbsp;{fmtRMFull(prog.reward_amount)} reward
                </span>
              </div>
            )}
          </div>
        )}

        {/* Level stepper (multi-level only) */}
        {isMulti && lvls.length > 0 && (
          <div style={styles.levelStepper}>
            {lvls.map((l, i) => {
              const done = i < completedCount
              const next = !done && i === completedCount
              return (
                <React.Fragment key={l.id}>
                  <div
                    style={{
                      ...styles.stepDot,
                      ...(done ? styles.stepDotDone : next ? styles.stepDotNext : styles.stepDotLocked),
                    }}
                    title={l.level_name}
                  >
                    {done ? '✓' : next ? '▶' : i + 1}
                  </div>
                  {i < lvls.length - 1 && (
                    <div style={{ ...styles.stepLine, ...(done ? styles.stepLineDone : {}) }} />
                  )}
                </React.Fragment>
              )
            })}
          </div>
        )}

        {/* Level count */}
        {isMulti && (
          <p style={styles.levelCount}>
            {completedCount} / {lvls.length} levels completed
          </p>
        )}
      </div>
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
function ProgressBar({ pct }) {
  return (
    <div style={styles.progressTrack} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        style={{
          ...styles.progressFill,
          width: `${pct}%`,
        }}
      />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function VipStat({ label, value, align }) {
  return (
    <div style={{ textAlign: align ?? 'left' }}>
      <p style={styles.vipStatLabel}>{label}</p>
      <div style={styles.vipStatValue}>{value}</div>
    </div>
  )
}

function AccountStatus({ active }) {
  return (
    <span style={{ ...styles.statusDot, color: active ? 'var(--success)' : 'var(--danger)' }}>
      {active ? '● Active' : '● Inactive'}
    </span>
  )
}

function CampStatusChip({ status }) {
  const map = {
    active:     { bg: 'rgba(34,197,94,.15)',  color: 'var(--success)',  label: 'Active'    },
    completed:  { bg: 'rgba(59,130,246,.15)', color: 'var(--info)',     label: 'Completed' },
    ended:      { bg: 'rgba(100,116,139,.15)',color: 'var(--muted)',    label: 'Ended'     },
    paused:     { bg: 'rgba(245,158,11,.15)', color: 'var(--warn)',     label: 'Paused'    },
    draft:      { bg: 'rgba(100,116,139,.15)',color: 'var(--muted)',    label: 'Draft'     },
  }
  const cfg = map[status?.toLowerCase()] ?? map.draft
  return (
    <span style={{ ...styles.statusChip, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function EmptyState() {
  return (
    <div style={styles.emptyBox}>
      <div style={styles.emptyIcon}>🎪</div>
      <p style={styles.emptyTitle}>No active campaigns</p>
      <p style={styles.emptySub}>
        You don't have any active VIP campaigns right now.
        Check back soon — your host may enroll you in an upcoming promotion.
      </p>
    </div>
  )
}

function Skeleton({ height, radius = 8 }) {
  return (
    <div
      style={{
        height,
        borderRadius: radius,
        background: 'var(--surface2)',
        animation: 'skelPulse 1.4s ease-in-out infinite',
      }}
    />
  )
}

function ActionTile({ icon, label, onClick, badge }) {
  return (
    <button style={styles.actionTile} onClick={onClick}>
      <span style={styles.actionIcon}>{icon}</span>
      <span style={styles.actionLabel}>{label}</span>
      {badge > 0 && (
        <span style={styles.actionBadge}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  )
}

// ── Icons (inline SVG) ────────────────────────────────────────────────────────
function BellIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  )
}
function CampaignIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="16"/>
      <line x1="10" y1="14" x2="14" y2="14"/>
    </svg>
  )
}
function GiftIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <polyline points="20 12 20 22 4 22 4 12"/>
      <rect x="2" y="7" width="20" height="5"/>
      <line x1="12" y1="22" x2="12" y2="7"/>
      <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/>
      <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
    </svg>
  )
}
function GridIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}

// ── Inject keyframes once ─────────────────────────────────────────────────────
const DASH_STYLES = `
  @keyframes skelPulse {
    0%, 100% { opacity: .5; }
    50%       { opacity: 1; }
  }
  @keyframes dashProgressGrow {
    from { width: 0%; }
  }
`
if (typeof document !== 'undefined' && !document.getElementById('dash-keyframes')) {
  const s = document.createElement('style')
  s.id = 'dash-keyframes'
  s.textContent = DASH_STYLES
  document.head.appendChild(s)
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100%',
    background: 'var(--bg)',
    paddingBottom: '2rem',
  },

  // Header
  header: {
    padding: '1.5rem 1.25rem 1rem',
    background: 'linear-gradient(180deg, var(--surface) 0%, transparent 100%)',
    borderBottom: '1px solid var(--border)',
  },
  headerInner: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
    maxWidth: 560,
    margin: '0 auto',
  },
  greeting: {
    fontSize: '.75rem',
    color: 'var(--muted)',
    letterSpacing: '.06em',
    textTransform: 'uppercase',
    marginBottom: '.2rem',
  },
  playerName: {
    fontSize: '1.4rem',
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-.02em',
  },
  headerActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '.5rem',
  },
  tierBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '.35rem',
    padding: '.3rem .7rem',
    borderRadius: 20,
    border: '1px solid',
    fontSize: '.7rem',
    fontWeight: 700,
    letterSpacing: '.06em',
    whiteSpace: 'nowrap',
  },
  tierLabel: {
    letterSpacing: '.06em',
  },
  bellBtn: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '.35rem .7rem',
    color: 'var(--text-2)',
    cursor: 'pointer',
    gap: '.3rem',
  },
  bellBadge: {
    fontSize: '.7rem',
    fontWeight: 700,
    color: 'var(--gold)',
    lineHeight: 1,
  },

  // Sections
  section: {
    padding: '1.25rem 1.25rem 0',
    maxWidth: 560,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    fontSize: '.75rem',
    fontWeight: 700,
    color: 'var(--muted)',
    letterSpacing: '.1em',
    textTransform: 'uppercase',
  },

  // VIP card
  vipCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,.25)',
  },
  vipCardAccent: {
    height: 2,
  },
  vipCardBody: {
    padding: '1rem 1.25rem',
  },
  vipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vipStatLabel: {
    fontSize: '.68rem',
    color: 'var(--muted)',
    letterSpacing: '.05em',
    textTransform: 'uppercase',
    marginBottom: '.2rem',
  },
  vipStatValue: {
    fontSize: '.95rem',
    fontWeight: 600,
    color: 'var(--text)',
  },
  statusDot: {
    fontSize: '.8rem',
    fontWeight: 600,
  },

  // Campaign card
  campaignCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
    boxShadow: '0 8px 30px rgba(0,0,0,.3), 0 0 0 1px rgba(201,166,72,.06)',
  },
  campaignCardBar: {
    height: 3,
    background: 'linear-gradient(90deg, transparent, var(--gold) 35%, var(--gold-2) 65%, transparent)',
  },
  campaignCardBody: {
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  campHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  campName: {
    fontSize: '1.05rem',
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-.01em',
  },
  campPeriod: {
    fontSize: '.75rem',
    color: 'var(--muted)',
    marginTop: '.3rem',
  },
  campDesc: {
    fontSize: '.82rem',
    color: 'var(--text-2)',
    lineHeight: 1.5,
    borderLeft: '2px solid var(--gold-dim)',
    paddingLeft: '.75rem',
    marginTop: '-.25rem',
  },
  statusChip: {
    display: 'inline-block',
    padding: '.25rem .65rem',
    borderRadius: 20,
    fontSize: '.68rem',
    fontWeight: 700,
    letterSpacing: '.05em',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  // Progress
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '.6rem',
  },
  amountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  amtCurrent: {
    fontSize: '1.15rem',
    fontWeight: 800,
    color: 'var(--gold)',
    letterSpacing: '-.02em',
  },
  amtTarget: {
    fontSize: '.85rem',
    color: 'var(--muted)',
    fontWeight: 600,
  },
  progressTrack: {
    height: 10,
    background: 'var(--surface2)',
    borderRadius: 999,
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--gold-dim), var(--gold), var(--gold-2))',
    borderRadius: 999,
    transition: 'width 1s cubic-bezier(.4,0,.2,1)',
    animation: 'dashProgressGrow 1s cubic-bezier(.4,0,.2,1)',
    minWidth: 4,
  },
  remainingTxt: {
    fontSize: '.78rem',
    color: 'var(--muted)',
    textAlign: 'right',
  },

  // Milestone
  milestoneBox: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '.875rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '.4rem',
  },
  milestoneLabel: {
    fontSize: '.65rem',
    fontWeight: 700,
    color: 'var(--muted)',
    letterSpacing: '.1em',
  },
  milestoneName: {
    fontSize: '.9rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  milestoneRewards: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '.5rem',
    marginTop: '.2rem',
  },
  rewardChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.25rem',
    padding: '.3rem .7rem',
    borderRadius: 20,
    background: 'rgba(34,197,94,.12)',
    border: '1px solid rgba(34,197,94,.2)',
    color: 'var(--success)',
    fontSize: '.78rem',
    fontWeight: 600,
  },
  codeChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.25rem',
    padding: '.3rem .7rem',
    borderRadius: 20,
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.25)',
    color: 'var(--gold)',
    fontSize: '.78rem',
    fontWeight: 700,
    letterSpacing: '.05em',
  },

  // Level stepper
  levelStepper: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
    marginTop: '.25rem',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '.7rem',
    fontWeight: 700,
    flexShrink: 0,
    border: '2px solid',
  },
  stepDotDone: {
    background: 'rgba(34,197,94,.2)',
    borderColor: 'var(--success)',
    color: 'var(--success)',
  },
  stepDotNext: {
    background: 'var(--gold-dim)',
    borderColor: 'var(--gold)',
    color: 'var(--gold)',
  },
  stepDotLocked: {
    background: 'var(--surface2)',
    borderColor: 'var(--border)',
    color: 'var(--dim)',
  },
  stepLine: {
    flex: 1,
    height: 2,
    background: 'var(--border)',
    minWidth: 8,
  },
  stepLineDone: {
    background: 'var(--success)',
  },
  levelCount: {
    fontSize: '.72rem',
    color: 'var(--muted)',
    textAlign: 'center',
    marginTop: '-.25rem',
  },

  // All done
  allDoneBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '.4rem',
    padding: '1.25rem',
    background: 'var(--surface2)',
    borderRadius: 10,
    textAlign: 'center',
  },
  allDoneText: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--gold)',
  },
  allDoneSub: {
    fontSize: '.8rem',
    color: 'var(--muted)',
  },

  // Empty state
  emptyBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '.75rem',
    padding: '2.5rem 1.5rem',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
  },
  emptyIcon: {
    fontSize: '2.5rem',
    marginBottom: '.25rem',
  },
  emptyTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
  },
  emptySub: {
    fontSize: '.85rem',
    color: 'var(--muted)',
    lineHeight: 1.6,
    maxWidth: 280,
  },

  // Error
  errorBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '.75rem',
    padding: '1.5rem',
    background: 'var(--card)',
    border: '1px solid var(--danger)',
    borderRadius: 14,
    textAlign: 'center',
  },
  errorIcon: {
    fontSize: '1.5rem',
    color: 'var(--danger)',
  },
  errorMsg: {
    fontSize: '.875rem',
    color: 'var(--text-2)',
  },
  retryBtn: {
    padding: '.6rem 1.5rem',
    background: 'var(--gold)',
    color: '#0b0f1a',
    border: 'none',
    borderRadius: 8,
    fontSize: '.85rem',
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '.05em',
  },

  // Quick actions
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '.75rem',
  },
  actionTile: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '.5rem',
    padding: '1rem .75rem',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    color: 'var(--text-2)',
    cursor: 'pointer',
    transition: 'border-color .15s, color .15s',
  },
  actionIcon: {
    color: 'var(--gold)',
  },
  actionLabel: {
    fontSize: '.72rem',
    fontWeight: 600,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
  },
  actionBadge: {
    position: 'absolute',
    top: '.5rem',
    right: '.5rem',
    background: 'var(--danger)',
    color: '#fff',
    fontSize: '.6rem',
    fontWeight: 700,
    borderRadius: 999,
    padding: '.1rem .35rem',
    lineHeight: 1.4,
    minWidth: 16,
    textAlign: 'center',
  },
}
