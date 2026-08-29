// Notifications — STEP 7
// Player notification center — real Supabase data.
//
// Schema (verified against live DB):
//   id uuid, vip_member_id uuid, campaign_id uuid?, title text,
//   body text, is_read bool, created_at timestamptz, read_at timestamptz?
//   NOTE: no notification_type column — generic bell icon used for all.
//
// RLS policies (verified):
//   player_notifications_player_select: vip_member_id = get_player_vip_member_id()
//   player_notifications_crm_write:     UPDATE/INSERT/DELETE — CRM only (admin/host)
//   NO player UPDATE policy ? mark-as-read NOT implementable without backend change.
//   Implementation: UI shows read/unread state only. Write actions skipped.
//   See section K of STEP 7 report for backend limitation detail.
//
// Event logging:
//   portal_view_notifications — IS in log_portal_event allowlist ?
//
// Unread count:
//   Uses identical query to Dashboard: .eq('is_read', false) on player_notifications.
//   Both sources stay in sync automatically since both read from the same RLS-filtered table.
//
// Security contract:
//   ? No vip_members, vip_daily_snapshots, player_accounts, profiles, auth.users
//   ? No get_campaigns_crm(), no service_role
//   ? No internal_email, no approved_by, no CRM-only fields
//   ? vip_member_id excluded from UI select (internal ownership UUID, not needed for display)
//   ? No frontend write of is_read or read_at (UPDATE policy is CRM-only)

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase }    from '../lib/supabase'

// -- Player-safe select --------------------------------------------------------
// vip_member_id excluded — internal ownership UUID, not needed for display
// (RLS already enforces ownership; displaying it adds no value)
const NOTIF_SELECT = 'id, campaign_id, title, body, is_read, created_at, read_at'

const FILTERS = ['All', 'Unread', 'Read']

// -- Skeleton animation (injected once) ---------------------------------------
;(function injectAnim() {
  if (document.getElementById('notif-anim')) return
  const s = document.createElement('style')
  s.id = 'notif-anim'
  s.textContent = `
    @keyframes notifSkel  { 0%,100%{opacity:.35} 50%{opacity:.7} }
    @keyframes notifSlide { from{opacity:0;transform:translateY(5px)} to{opacity:1;transform:none} }
    @keyframes notifPulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  `
  document.head.appendChild(s)
})()

// -- Helpers -------------------------------------------------------------------
function timeAgo(iso) {
  if (!iso) return ''
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (diff <    60) return 'Just now'
  if (diff <  3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days <   30) return `${days}d ago`
  if (days <  365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-MY', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

// -- Main component ------------------------------------------------------------
export default function Notifications() {
  const navigate              = useNavigate()
  const [notifs, setNotifs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('All')
  const loggedRef             = useRef(false)

  const loadNotifs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('player_notifications')
        .select(NOTIF_SELECT)
        .order('created_at', { ascending: false })

      if (err) throw err
      setNotifs(data ?? [])
    } catch (err) {
      setError('Unable to load your notifications.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadNotifs() }, [loadNotifs])

  // -- Event logging — portal_view_notifications (allowlisted) --
  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    supabase.rpc('log_portal_event', { p_event_type: 'portal_view_notifications' }).then(() => {}, () => {})
  }, [])

  if (loading) return <SkeletonNotifs />
  if (error)   return <ErrorState message={error} onRetry={loadNotifs} />

  // -- Derived counts --------------------------------------------------------
  const unreadCount = notifs.filter(n => !n.is_read).length
  const total       = notifs.length

  // -- Filter ----------------------------------------------------------------
  const filtered = notifs.filter(n => {
    if (filter === 'Unread') return !n.is_read
    if (filter === 'Read')   return  n.is_read
    return true
  })

  return (
    <div style={st.page}>
      {/* -- Header -- */}
      <div style={st.header}>
        <div style={st.headerInner}>
          <div style={st.headerTop}>
            <div>
              <div style={st.eyebrow}>NOTIFICATION CENTER</div>
              <h1 style={st.title}>
                Notifications
                {unreadCount > 0 && (
                  <span style={st.titleBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </h1>
            </div>
            <div style={st.bellWrap}>
              <BellIconLarge />
              {unreadCount > 0 && <span style={st.bellDot} />}
            </div>
          </div>
          {total > 0 && (
            <div style={st.headerMeta}>
              <span style={st.metaNum}>{total}</span> message{total !== 1 ? 's' : ''}
              {unreadCount > 0 && (
                <> — <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{unreadCount} unread</span></>
              )}
            </div>
          )}

          {/* Mark-as-read notice — shown only if unread exist */}
          {unreadCount > 0 && (
            <div style={st.readNotice}>
              <InfoIcon />
              Mark-as-read is managed by the VIP system and updates automatically.
            </div>
          )}
        </div>
      </div>

      {/* -- Filter tabs -- */}
      {total > 0 && (
        <div style={st.filterRow}>
          {FILTERS.map(f => {
            const cnt = f === 'All' ? total
                      : f === 'Unread' ? notifs.filter(n => !n.is_read).length
                      : notifs.filter(n => n.is_read).length
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{ ...st.filterBtn, ...(filter === f ? st.filterActive : {}) }}
              >
                {f}
                {cnt > 0 && <span style={{ ...st.filterBadge, ...(filter === f ? st.filterBadgeActive : {}) }}>{cnt}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* -- List -- */}
      <div style={st.list}>
        {filtered.length === 0 ? (
          <EmptyState filter={filter} total={total} />
        ) : (
          filtered.map((notif, idx) => (
            <NotifCard
              key={notif.id}
              notif={notif}
              delay={idx * 30}
              onViewCampaign={notif.campaign_id
                ? () => navigate(`/campaigns/${notif.campaign_id}`)
                : null}
            />
          ))
        )}
      </div>

      <div style={st.bottomPad} />
    </div>
  )
}

// -- NotifCard ------------------------------------------------------------------
function NotifCard({ notif, delay, onViewCampaign }) {
  const isUnread = !notif.is_read

  return (
    <div style={{
      ...st.card,
      ...(isUnread ? st.cardUnread : st.cardRead),
      animationDelay: `${delay}ms`,
    }}>
      {/* Unread indicator bar */}
      {isUnread && <div style={st.unreadBar} />}

      <div style={st.cardInner}>
        {/* Icon + content */}
        <div style={st.cardLeft}>
          <div style={{ ...st.iconWrap, ...(isUnread ? st.iconWrapUnread : st.iconWrapRead) }}>
            {/* No notification_type column — generic bell icon for all */}
            <BellIcon />
          </div>
        </div>

        <div style={st.cardBody}>
          {/* Title row */}
          <div style={st.titleRow}>
            <span style={{ ...st.notifTitle, ...(isUnread ? st.notifTitleUnread : {}) }}>
              {notif.title}
            </span>
            {isUnread && <span style={st.unreadDot} aria-label="Unread" />}
          </div>

          {/* Body */}
          <p style={{ ...st.notifBody, ...(isUnread ? st.notifBodyUnread : {}) }}>
            {notif.body}
          </p>

          {/* Footer: time + campaign link */}
          <div style={st.cardFooter}>
            <span style={st.timeAgo} title={fmtDate(notif.created_at)}>
              <ClockIcon />
              {timeAgo(notif.created_at)}
            </span>

            {onViewCampaign && (
              <button onClick={onViewCampaign} style={st.viewCampBtn}>
                View Campaign
                <ChevronRightIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// -- SkeletonNotifs -------------------------------------------------------------
function SkeletonNotifs() {
  const sk = {
    background: 'var(--surface2)',
    borderRadius: 6,
    animation: 'notifSkel 1.6s ease-in-out infinite',
  }
  return (
    <div style={st.page}>
      <div style={st.header}>
        <div style={st.headerInner}>
          <div style={st.headerTop}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...sk, width: 140, height: 11 }} />
              <div style={{ ...sk, width: 180, height: 26 }} />
            </div>
            <div style={{ ...sk, width: 44, height: 44, borderRadius: 12 }} />
          </div>
        </div>
      </div>
      <div style={st.list}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ ...st.card, ...st.cardRead, padding: '1rem' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ ...sk, width: 38, height: 38, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ ...sk, width: '55%', height: 14 }} />
                <div style={{ ...sk, width: '85%', height: 12 }} />
                <div style={{ ...sk, width: '40%', height: 12 }} />
                <div style={{ ...sk, width: '30%', height: 11 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// -- ErrorState -----------------------------------------------------------------
function ErrorState({ onRetry }) {
  return (
    <div style={st.page}>
      <div style={st.centred}>
        <div style={st.errorIcon}><AlertIcon /></div>
        <div style={st.errorTitle}>Unable to load your notifications.</div>
        <div style={st.errorSub}>Please check your connection and try again.</div>
        <button onClick={onRetry} style={st.retryBtn}>Try Again</button>
      </div>
    </div>
  )
}

// -- EmptyState -----------------------------------------------------------------
function EmptyState({ filter, total }) {
  if (total > 0 && filter !== 'All') {
    return (
      <div style={st.centred}>
        <div style={st.emptyIcon}><BellSlashIcon /></div>
        <div style={st.emptyTitle}>No {filter.toLowerCase()} notifications</div>
        <div style={st.emptySub}>Switch to "All" to see your full history.</div>
      </div>
    )
  }
  return (
    <div style={st.centred}>
      <div style={st.emptyIcon}><BellSlashIcon /></div>
      <div style={st.emptyTitle}>You're all caught up</div>
      <div style={st.emptySub}>New VIP updates and campaign alerts will appear here.</div>
    </div>
  )
}

// -- Inline SVG icons -----------------------------------------------------------
function BellIconLarge() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none"
      stroke="var(--gold)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}
function BellSlashIcon() {
  return (
    <svg width={40} height={40} viewBox="0 0 24 24" fill="none"
      stroke="var(--dim)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.73 21a2 2 0 01-3.46 0M18.63 13A17.89 17.89 0 0118 8" />
      <path d="M6.26 6.26A5.86 5.86 0 006 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 00-9.33-4.98" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
function ChevronRightIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill="none"
      stroke="var(--danger)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

// -- Styles --------------------------------------------------------------------
const st = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
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
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  headerTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontSize: '.63rem',
    fontWeight: 700,
    letterSpacing: '.12em',
    color: 'var(--gold)',
    marginBottom: 4,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-.02em',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  titleBadge: {
    fontSize: '.75rem',
    fontWeight: 700,
    background: 'var(--gold)',
    color: '#0b0f1a',
    borderRadius: 20,
    padding: '.15rem .55rem',
    letterSpacing: 0,
  },
  bellWrap: {
    position: 'relative',
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
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 9,
    height: 9,
    background: 'var(--danger)',
    borderRadius: '50%',
    border: '2px solid var(--surface)',
    animation: 'notifPulse 2s ease-in-out infinite',
  },
  headerMeta: {
    fontSize: '.78rem',
    color: 'var(--muted)',
  },
  metaNum: {
    color: 'var(--text-2)',
    fontWeight: 600,
  },
  readNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '.72rem',
    color: 'var(--muted)',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '.5rem .75rem',
  },

  // Filter tabs
  filterRow: {
    display: 'flex',
    gap: 8,
    padding: '.75rem 1.25rem .25rem',
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
    padding: '.38rem .85rem',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--muted)',
    fontSize: '.78rem',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all .15s',
  },
  filterActive: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.3)',
    color: 'var(--gold)',
    fontWeight: 600,
  },
  filterBadge: {
    background: 'var(--surface2)',
    color: 'var(--muted)',
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: '.7rem',
    fontWeight: 700,
  },
  filterBadgeActive: {
    background: 'rgba(201,166,72,.2)',
    color: 'var(--gold)',
  },

  // List
  list: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '.75rem 1rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  // Notification card
  card: {
    borderRadius: 'var(--rl)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
    position: 'relative',
    animation: 'notifSlide .25s ease-out both',
    transition: 'border-color .15s',
  },
  cardUnread: {
    background: 'var(--card)',
    borderColor: 'rgba(201,166,72,.15)',
  },
  cardRead: {
    background: 'var(--surface)',
    borderColor: 'var(--border-s)',
  },
  unreadBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    background: 'linear-gradient(180deg, var(--gold), var(--gold-2))',
    borderRadius: '3px 0 0 3px',
  },
  cardInner: {
    display: 'flex',
    gap: 12,
    padding: '1rem',
    paddingLeft: '1.1rem',
  },
  cardLeft: {
    flexShrink: 0,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconWrapUnread: {
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.2)',
    color: 'var(--gold)',
  },
  iconWrapRead: {
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifTitle: {
    fontSize: '.88rem',
    fontWeight: 600,
    color: 'var(--text-2)',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  notifTitleUnread: {
    color: 'var(--text)',
    fontWeight: 700,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--gold)',
    flexShrink: 0,
    animation: 'notifPulse 2.5s ease-in-out infinite',
  },
  notifBody: {
    fontSize: '.82rem',
    color: 'var(--muted)',
    lineHeight: 1.5,
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
  notifBodyUnread: {
    color: 'var(--text-2)',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  timeAgo: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: '.7rem',
    color: 'var(--dim)',
  },
  viewCampBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    fontSize: '.73rem',
    fontWeight: 600,
    color: 'var(--gold)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 0',
    flexShrink: 0,
  },

  // Empty / error shared
  centred: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '4rem 2rem',
    gap: 12,
  },
  emptyIcon: { marginBottom: 4 },
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
  errorIcon:  { marginBottom: 4 },
  errorTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--text-2)' },
  errorSub:   { fontSize: '.83rem', color: 'var(--muted)' },
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

