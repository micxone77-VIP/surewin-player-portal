// Campaigns — Player Portal campaign list page.
// Data source: public.campaigns (RLS campaigns_player_select — enrolled only).
// Player-safe columns ONLY. No CRM-only fields.
// ? No get_campaigns_crm()   ? No budget_rm / notes / campaign_code / target_tier
// ? No reward_pct/fixed/cap  ? No rank_rewards / reward_tiers / created_by
// ? No vip_members / player_accounts / internal_email / get_my_role()
// ? No hardcoded campaign IDs, thresholds, or reward codes
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FILTERS = ['Active', 'Upcoming', 'Ended', 'All']

// Player-safe columns only — no CRM-internal fields
const CAMPAIGN_SELECT =
  'id, campaign_name, festival, start_date, end_date, offer_desc, status, campaign_type, campaign_category, is_multi_level, max_levels, created_at'

export default function Campaigns() {
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState([])
  const [filter, setFilter]       = useState('Active')
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const loggedRef = useRef(false)

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('campaigns')
        .select(CAMPAIGN_SELECT)
        .in('status', ['active', 'upcoming', 'ended', 'paused'])
        .order('created_at', { ascending: false })
      if (err) throw err
      setCampaigns(data ?? [])
    } catch (err) {
      console.error('[Campaigns] load error:', err?.message ?? err)
      setError('Unable to load campaigns.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  // Event logging — portal_view_campaign is the closest valid allowlisted type.
  // Used once per mount to record list-view activity.
  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    supabase.rpc('log_portal_event', { p_event_type: 'portal_view_campaign' }).then(() => {}, () => {})
  }, [])

  // Filter — use backend `status` field directly (no frontend eligibility logic)
  const filtered = filter === 'All'
    ? campaigns
    : campaigns.filter(c => (c.status ?? '').toLowerCase() === filter.toLowerCase())

  // Count per filter for smart empty-state messaging
  const counts = {
    Active:   campaigns.filter(c => (c.status ?? '').toLowerCase() === 'active').length,
    Upcoming: campaigns.filter(c => (c.status ?? '').toLowerCase() === 'upcoming').length,
    Ended:    campaigns.filter(c => (c.status ?? '').toLowerCase() === 'ended').length,
    All:      campaigns.length,
  }

  return (
    <div style={styles.page}>
      {/* -- Page header -- */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <CampaignIcon />
          <h1 style={styles.pageTitle}>My Campaigns</h1>
        </div>
        <p style={styles.pageSubtitle}>Your enrolled VIP campaigns</p>
      </div>

      {/* -- Filter tabs -- */}
      <div style={styles.filterRow}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              ...styles.filterBtn,
              ...(filter === f ? styles.filterBtnActive : {}),
            }}
          >
            {f}
            {!loading && (
              <span style={{
                ...styles.filterBadge,
                ...(filter === f ? styles.filterBadgeActive : {}),
              }}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* -- Content -- */}
      {loading ? (
        <div style={styles.list}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={loadCampaigns} />
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} counts={counts} onSwitchFilter={setFilter} />
      ) : (
        <div style={styles.list}>
          {filtered.map(c => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onClick={() => navigate(`/campaigns/${c.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// -- Campaign Card ------------------------------------------------------------
function CampaignCard({ campaign: c, onClick }) {
  const s = (c.status ?? 'unknown').toLowerCase()
  const cfg = STATUS_CFG[s] ?? STATUS_CFG.unknown

  const [hovered, setHovered] = useState(false)

  const fmtDate = d => {
    if (!d) return '—'
    return new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  const typeLabel = TYPE_LABELS[c.campaign_type] ?? c.campaign_type ?? null
  const catLabel  = c.campaign_category ?? null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        ...(s === 'active' ? styles.cardActive : {}),
        ...(s === 'ended'  ? styles.cardEnded  : {}),
        ...(hovered ? styles.cardHovered : {}),
      }}
      aria-label={`View ${c.campaign_name} campaign`}
    >
      {/* Gold bar — active only */}
      {s === 'active' && <div style={styles.cardBar} />}

      <div style={styles.cardBody}>
        {/* -- Row 1: name + status chip -- */}
        <div style={styles.cardRow1}>
          <div style={styles.campaignNameWrap}>
            {c.festival && (
              <span style={styles.festivalLabel}>{c.festival}</span>
            )}
            <h2 style={{
              ...styles.campaignName,
              ...(s === 'ended' ? styles.campaignNameEnded : {}),
            }}>
              {c.campaign_name}
            </h2>
          </div>
          <span style={{ ...styles.statusChip, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            {cfg.dot && <span style={{ ...styles.statusDot, background: cfg.color }} />}
            {cfg.label}
          </span>
        </div>

        {/* -- Row 2: type + category badges -- */}
        {(typeLabel || catLabel || c.is_multi_level) && (
          <div style={styles.badgeRow}>
            {typeLabel && (
              <span style={styles.badge}>{typeLabel}</span>
            )}
            {catLabel && (
              <span style={styles.badge}>{catLabel}</span>
            )}
            {c.is_multi_level && (
              <span style={styles.badgeLevels}>
                <TierIcon />
                {c.max_levels ? `${c.max_levels} Levels` : 'Multi-Level'}
              </span>
            )}
          </div>
        )}

        {/* -- Row 3: date range -- */}
        <div style={styles.dateRow}>
          <CalendarIcon />
          <span style={styles.dateText}>
            {fmtDate(c.start_date)}
            {c.end_date && ` — ${fmtDate(c.end_date)}`}
          </span>
        </div>

        {/* -- Row 4: offer description -- */}
        {c.offer_desc && (
          <p style={{
            ...styles.offerDesc,
            ...(s === 'ended' ? styles.offerDescEnded : {}),
          }}>
            {c.offer_desc}
          </p>
        )}

        {/* -- CTA row -- */}
        <div style={styles.ctaRow}>
          {s === 'upcoming' && (
            <span style={styles.comingSoonPill}>Coming Soon</span>
          )}
          <button
            style={{
              ...styles.ctaBtn,
              ...(s === 'ended'    ? styles.ctaBtnEnded    : {}),
              ...(s === 'upcoming' ? styles.ctaBtnUpcoming : {}),
            }}
            tabIndex={-1}
          >
            View Campaign
            <ChevronIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

// -- Skeleton Card -------------------------------------------------------------
function SkeletonCard() {
  return (
    <div style={styles.card}>
      <div style={styles.cardBody}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...styles.skel, width: '40%', height: 12, marginBottom: 8 }} />
            <div style={{ ...styles.skel, width: '75%', height: 20 }} />
          </div>
          <div style={{ ...styles.skel, width: 72, height: 24, borderRadius: 20, marginLeft: 12 }} />
        </div>
        <div style={{ ...styles.skel, width: '55%', height: 14, marginBottom: 12 }} />
        <div style={{ ...styles.skel, width: '90%', height: 14, marginBottom: 6 }} />
        <div style={{ ...styles.skel, width: '70%', height: 14, marginBottom: 20 }} />
        <div style={{ ...styles.skel, width: '40%', height: 40, borderRadius: 8, marginLeft: 'auto' }} />
      </div>
      <style>{skelAnim}</style>
    </div>
  )
}

// -- Error State ---------------------------------------------------------------
function ErrorState({ message, onRetry }) {
  return (
    <div style={styles.stateWrap}>
      <div style={styles.stateIcon}><AlertIcon /></div>
      <p style={styles.stateTitle}>{message}</p>
      <button onClick={onRetry} style={styles.retryBtn}>
        Try Again
      </button>
    </div>
  )
}

// -- Empty State ---------------------------------------------------------------
function EmptyState({ filter, counts, onSwitchFilter }) {
  const messages = {
    Active:   'No active campaigns right now.',
    Upcoming: 'No upcoming campaigns at the moment.',
    Ended:    'No ended campaigns to display.',
    All:      'No campaigns available.',
  }

  // Suggest switching to another non-empty filter
  const suggestions = FILTERS.filter(f => f !== filter && f !== 'All' && counts[f] > 0)
  const allSuggestion = filter !== 'All' && counts.All > 0

  return (
    <div style={styles.stateWrap}>
      <div style={styles.stateIconGold}><EmptyIcon /></div>
      <p style={styles.stateTitle}>{messages[filter] ?? 'No campaigns found.'}</p>
      {(suggestions.length > 0 || allSuggestion) && (
        <div style={styles.suggestionRow}>
          {suggestions.map(s => (
            <button key={s} onClick={() => onSwitchFilter(s)} style={styles.suggestionBtn}>
              View {s} ({counts[s]})
            </button>
          ))}
          {allSuggestion && (
            <button onClick={() => onSwitchFilter('All')} style={styles.suggestionBtn}>
              View All ({counts.All})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// -- Config --------------------------------------------------------------------
const STATUS_CFG = {
  active: {
    label: 'Active',
    dot: true,
    color: '#22c55e',
    bg: 'rgba(34,197,94,.12)',
    border: 'rgba(34,197,94,.25)',
  },
  upcoming: {
    label: 'Upcoming',
    dot: false,
    color: '#60a5fa',
    bg: 'rgba(96,165,250,.12)',
    border: 'rgba(96,165,250,.25)',
  },
  ended: {
    label: 'Ended',
    dot: false,
    color: 'var(--dim)',
    bg: 'rgba(255,255,255,.04)',
    border: 'rgba(255,255,255,.08)',
  },
  unknown: {
    label: 'Unknown',
    dot: false,
    color: 'var(--dim)',
    bg: 'rgba(255,255,255,.04)',
    border: 'rgba(255,255,255,.08)',
  },
}

const TYPE_LABELS = {
  deposit:     'Deposit',
  leaderboard: 'Leaderboard',
  bet:         'Bet',
  referral:    'Referral',
  cashback:    'Cashback',
  bonus:       'Bonus',
}

// -- Styles --------------------------------------------------------------------
const styles = {
  page: {
    minHeight: '100%',
    padding: '1.5rem 1rem 5rem',
    maxWidth: 480,
    margin: '0 auto',
  },
  header: {
    marginBottom: '1.5rem',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '.65rem',
    color: 'var(--gold)',
    marginBottom: '.25rem',
  },
  pageTitle: {
    fontSize: '1.35rem',
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-.02em',
    margin: 0,
  },
  pageSubtitle: {
    fontSize: '.8rem',
    color: 'var(--muted)',
    letterSpacing: '.04em',
    margin: 0,
  },

  // Filter tabs
  filterRow: {
    display: 'flex',
    gap: '.5rem',
    marginBottom: '1.25rem',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    paddingBottom: '2px',
  },
  filterBtn: {
    flexShrink: 0,
    padding: '.45rem .85rem',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    color: 'var(--muted)',
    fontSize: '.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '.35rem',
    letterSpacing: '.02em',
    transition: 'all .15s',
    minHeight: 36,
  },
  filterBtnActive: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.4)',
    color: 'var(--gold)',
  },
  filterBadge: {
    fontSize: '.7rem',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,.08)',
    color: 'var(--dim)',
  },
  filterBadgeActive: {
    background: 'rgba(201,166,72,.2)',
    color: 'var(--gold)',
  },

  // List
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  // Card
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--rl)',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,.25)',
    cursor: 'pointer',
    transition: 'transform .15s, box-shadow .15s, border-color .15s',
  },
  cardActive: {
    border: '1px solid rgba(201,166,72,.2)',
    boxShadow: '0 4px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(201,166,72,.08)',
  },
  cardEnded: {
    opacity: 0.7,
  },
  cardHovered: {
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 32px rgba(0,0,0,.35)',
    borderColor: 'rgba(201,166,72,.35)',
  },
  cardBar: {
    height: '3px',
    background: 'linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold-2) 60%, transparent 100%)',
  },
  cardBody: {
    padding: '1.25rem',
  },

  // Card inner
  cardRow1: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  campaignNameWrap: {
    flex: 1,
    minWidth: 0,
  },
  festivalLabel: {
    display: 'block',
    fontSize: '.68rem',
    fontWeight: 700,
    letterSpacing: '.08em',
    color: 'var(--gold)',
    textTransform: 'uppercase',
    marginBottom: '.25rem',
    opacity: 0.85,
  },
  campaignName: {
    fontSize: '1rem',
    fontWeight: 700,
    color: 'var(--text)',
    margin: 0,
    lineHeight: 1.3,
    wordBreak: 'break-word',
  },
  campaignNameEnded: {
    color: 'var(--muted)',
  },

  // Status chip
  statusChip: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '.3rem',
    padding: '.25rem .65rem',
    borderRadius: '20px',
    fontSize: '.72rem',
    fontWeight: 700,
    letterSpacing: '.04em',
    whiteSpace: 'nowrap',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    animation: 'campPulse 2s ease-in-out infinite',
  },

  // Badges
  badgeRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '.35rem',
    marginBottom: '.75rem',
  },
  badge: {
    fontSize: '.7rem',
    fontWeight: 600,
    padding: '.2rem .55rem',
    borderRadius: '6px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    letterSpacing: '.02em',
  },
  badgeLevels: {
    fontSize: '.7rem',
    fontWeight: 600,
    padding: '.2rem .55rem',
    borderRadius: '6px',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.2)',
    color: 'var(--gold)',
    letterSpacing: '.02em',
    display: 'flex',
    alignItems: 'center',
    gap: '.25rem',
  },

  // Date
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '.4rem',
    marginBottom: '.75rem',
    color: 'var(--dim)',
  },
  dateText: {
    fontSize: '.78rem',
    color: 'var(--muted)',
    letterSpacing: '.01em',
  },

  // Offer
  offerDesc: {
    fontSize: '.85rem',
    color: 'var(--text-2)',
    lineHeight: 1.5,
    margin: '0 0 1rem',
  },
  offerDescEnded: {
    color: 'var(--dim)',
  },

  // CTA
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '.65rem',
  },
  comingSoonPill: {
    fontSize: '.72rem',
    fontWeight: 700,
    letterSpacing: '.06em',
    color: '#60a5fa',
    background: 'rgba(96,165,250,.1)',
    border: '1px solid rgba(96,165,250,.2)',
    padding: '.2rem .65rem',
    borderRadius: '20px',
  },
  ctaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '.35rem',
    padding: '.55rem 1rem',
    background: 'var(--gold)',
    color: '#0b0f1a',
    border: 'none',
    borderRadius: '8px',
    fontSize: '.8rem',
    fontWeight: 800,
    letterSpacing: '.05em',
    cursor: 'pointer',
    transition: 'opacity .15s',
    minHeight: 44,
  },
  ctaBtnEnded: {
    background: 'var(--surface2)',
    color: 'var(--muted)',
    border: '1px solid var(--border)',
  },
  ctaBtnUpcoming: {
    background: 'rgba(96,165,250,.12)',
    color: '#60a5fa',
    border: '1px solid rgba(96,165,250,.25)',
  },

  // Skeleton
  skel: {
    background: 'linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%)',
    backgroundSize: '200% 100%',
    animation: 'campSkel 1.4s ease infinite',
    borderRadius: 6,
  },

  // State wrappers
  stateWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    padding: '3rem 1.5rem',
    gap: '1rem',
  },
  stateIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'rgba(239,68,68,.1)',
    border: '1px solid rgba(239,68,68,.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ef4444',
  },
  stateIconGold: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--gold)',
    opacity: 0.7,
  },
  stateTitle: {
    fontSize: '.95rem',
    color: 'var(--muted)',
    margin: 0,
    lineHeight: 1.5,
  },
  retryBtn: {
    padding: '.65rem 1.5rem',
    background: 'var(--gold)',
    color: '#0b0f1a',
    border: 'none',
    borderRadius: '8px',
    fontSize: '.85rem',
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: '.05em',
    minHeight: 44,
  },
  suggestionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '.5rem',
    justifyContent: 'center',
  },
  suggestionBtn: {
    padding: '.5rem 1rem',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text-2)',
    fontSize: '.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
  },
}

// -- Animations ----------------------------------------------------------------
const skelAnim = `
@keyframes campSkel {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes campPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .4; }
}
`
// Inject once
if (typeof document !== 'undefined' && !document.getElementById('camp-anim-style')) {
  const s = document.createElement('style')
  s.id = 'camp-anim-style'
  s.textContent = skelAnim
  document.head.appendChild(s)
}

// -- Icons ---------------------------------------------------------------------
function CampaignIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function TierIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}
function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
function EmptyIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  )
}

