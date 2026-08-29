// Profile.jsx — Player Portal VIEW-ONLY Profile (STEP 8)
// Data sources:
//   profile ? PlayerAuthContext (get_my_portal_profile via context — no extra RPC)
//   event   ? log_portal_event('portal_view_profile')
//
// Security invariants:
//   ? vip_id never displayed    ? CRM-only email field never displayed
//   ? auth UUID never shown     ? CRM notes never shown
//   ? No profile editing        ? No password change form
//   ? No backend changes        ? No new migrations
//   ? Logout via PlayerAuthContext.logout()
//   ? Password: link to /forgot-password only
//   ? Email from player_accounts (portal email — not vip_members CRM email)
//   ? Phone already masked by backend (****-XXXX)
import React, { useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { usePlayerAuth } from '../context/PlayerAuthContext'
import { supabase } from '../lib/supabase'

// -- Tier config (same as Dashboard) -----------------------------------------
const TIER_CONFIG = {
  diamond:  { emoji: '\u{1F48E}', color: '#a78bfa', label: 'DIAMOND VIP' },
  platinum: { emoji: '\u{1F4A0}', color: '#60a5fa', label: 'PLATINUM VIP' },
  gold:     { emoji: '\u{2B50}', color: '#f59e0b', label: 'GOLD VIP' },
  silver:   { emoji: '\u{1F948}', color: '#94a3b8', label: 'SILVER VIP' },
  bronze:   { emoji: '\u{1F949}', color: '#cd7f32', label: 'BRONZE VIP' },
  black:    { emoji: '\u{1F525}',  color: '#e5e7eb', label: 'BLACK VIP' },
}

function getTierCfg(tier) {
  if (!tier) return null
  return TIER_CONFIG[tier.toLowerCase()] ?? {
    emoji: '\u{1F48E}', color: 'var(--gold)', label: `${tier.toUpperCase()} VIP`,
  }
}

// -- Helpers ------------------------------------------------------------------
function getInitials(fullName, username) {
  const src = fullName?.trim() || username?.trim() || ''
  if (!src) return '?'
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function capitalize(str) {
  if (!str) return '—'
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// -- Sub-components -----------------------------------------------------------
function SkeletonProfile() {
  return (
    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0' }}>
        <div style={sk({ width: 80, height: 80, borderRadius: '50%' })} />
        <div style={sk({ width: 160, height: 20, borderRadius: 8 })} />
        <div style={sk({ width: 100, height: 16, borderRadius: 6 })} />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ ...styles.card, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={sk({ width: 100, height: 14, borderRadius: 6 })} />
          {[1, 2].map(j => (
            <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={sk({ width: 80, height: 13, borderRadius: 5 })} />
              <div style={sk({ width: 120, height: 13, borderRadius: 5 })} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function sk(extra) {
  return {
    background: 'var(--border)',
    animation: 'pulse 1.4s ease-in-out infinite',
    ...extra,
  }
}

function InfoRow({ label, value, valueStyle }) {
  return (
    <div style={styles.infoRow}>
      <span style={styles.infoLabel}>{label}</span>
      <span style={{ ...styles.infoValue, ...valueStyle }}>{value ?? '—'}</span>
    </div>
  )
}

function CardSection({ title, icon, children }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={styles.cardIcon}>{icon}</span>
        <span style={styles.cardTitle}>{title}</span>
      </div>
      {children}
    </div>
  )
}

// -- Main component -----------------------------------------------------------
export default function Profile() {
  const { profile, loading, logout } = usePlayerAuth()
  const navigate  = useNavigate()
  const loggedRef = useRef(false)

  // Event logging — portal_view_profile is in the backend allowlist
  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    supabase
      .rpc('log_portal_event', { p_event_type: 'portal_view_profile' })
      .then(() => {}, () => {}) // fire-and-forget; never block UI
  }, [])

  // Logout handler
  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  const tier     = getTierCfg(profile?.tier)
  const initials = getInitials(profile?.full_name, profile?.username)

  // -- Loading skeleton -------------------------------------------------------
  if (loading) {
    return (
      <div style={styles.page}>
        <SkeletonProfile />
      </div>
    )
  }

  // -- No profile (session exists but RPC returned null) ----------------------
  if (!profile) {
    return (
      <div style={styles.page}>
        <div style={styles.errorBox}>
          <span style={styles.errorIcon}>?</span>
          <p style={styles.errorMsg}>Unable to load profile. Please try again.</p>
          <button style={styles.retryBtn} onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1 }
          50%       { opacity: .45 }
        }
      `}</style>

      {/* -- AVATAR HERO ---------------------------------------------------- */}
      <div style={styles.hero}>
        {/* Avatar circle */}
        <div style={{
          ...styles.avatar,
          background: tier
            ? `linear-gradient(135deg, ${tier.color}55, ${tier.color}22)`
            : 'linear-gradient(135deg, var(--gold)55, var(--gold)22)',
          border: `2.5px solid ${tier?.color ?? 'var(--gold)'}`,
          color: tier?.color ?? 'var(--gold)',
        }}>
          {initials}
        </div>

        {/* Full name */}
        <h1 style={styles.heroName}>
          {profile.full_name ?? profile.username ?? '—'}
        </h1>

        {/* Username tag */}
        {profile.username && (
          <p style={styles.heroUsername}>@{profile.username}</p>
        )}

        {/* Tier badge */}
        {tier && (
          <div style={{
            ...styles.tierBadge,
            color:       tier.color,
            borderColor: tier.color + '55',
            background:  tier.color + '14',
          }}>
            <span>{tier.emoji}</span>
            <span style={styles.tierLabel}>{tier.label}</span>
          </div>
        )}
      </div>

      {/* -- ACCOUNT INFO --------------------------------------------------- */}
      <div style={styles.sections}>
        <CardSection title="Account Info" icon="👤">
          <div style={styles.infoList}>
            <InfoRow label="Username"  value={profile.username} />
            <InfoRow label="Full Name" value={profile.full_name} />
            <InfoRow
              label="Status"
              value={
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  color: profile.is_active ? 'var(--success)' : 'var(--danger, #ef4444)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: profile.is_active ? 'var(--success)' : 'var(--danger, #ef4444)',
                    flexShrink: 0,
                  }} />
                  {profile.is_active ? 'Active' : 'Inactive'}
                </span>
              }
            />
          </div>
        </CardSection>

        {/* -- VIP STATUS --------------------------------------------------- */}
        <CardSection title="VIP Status" icon="💎">
          <div style={styles.infoList}>
            <InfoRow
              label="VIP Tier"
              value={
                tier
                  ? <span style={{ color: tier.color, fontWeight: 700 }}>{capitalize(profile.tier)}</span>
                  : '—'
              }
            />
          </div>
        </CardSection>

        {/* -- CONTACT ------------------------------------------------------ */}
        <CardSection title="Contact" icon="📞">
          <div style={styles.infoList}>
            <InfoRow label="Email" value={profile.email} />
            <InfoRow label="Phone" value={profile.phone} />
          </div>
        </CardSection>

        {/* -- SECURITY ----------------------------------------------------- */}
        <CardSection title="Security" icon="🔒">
          <div style={styles.infoList}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Password</span>
              <Link
                to="/forgot-password"
                style={styles.changePasswordLink}
                aria-label="Reset your password"
              >
                Reset Password ?
              </Link>
            </div>
          </div>
          <p style={styles.securityNote}>
            To change your password, use the Reset Password flow. You will receive instructions at your registered email.
          </p>
        </CardSection>

        {/* -- LOGOUT ------------------------------------------------------- */}
        <button
          style={styles.logoutBtn}
          onClick={handleLogout}
          aria-label="Sign out of your account"
        >
          <LogoutIcon size={18} />
          Sign Out
        </button>

        <p style={styles.footerNote}>
          Player Portal — SureWin
        </p>
      </div>
    </div>
  )
}

// -- Styles -------------------------------------------------------------------
const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    paddingBottom: '2rem',
  },

  // Hero / avatar section
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '2rem 1.25rem 1.5rem',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.75rem',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    marginBottom: '0.25rem',
    userSelect: 'none',
  },
  heroName: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: 700,
    color: 'var(--text)',
    textAlign: 'center',
    lineHeight: 1.2,
  },
  heroUsername: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--muted)',
    letterSpacing: '0.01em',
  },
  tierBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    borderRadius: 20,
    border: '1px solid',
    marginTop: '0.25rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
  },
  tierLabel: {
    letterSpacing: '0.06em',
  },

  // Sections wrapper
  sections: {
    padding: '1rem 1rem 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.875rem',
    maxWidth: 520,
    margin: '0 auto',
  },

  // Card
  card: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0.75rem 1rem 0.625rem',
    borderBottom: '1px solid var(--border)',
  },
  cardIcon: {
    fontSize: '1rem',
  },
  cardTitle: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },

  // Info list inside card
  infoList: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.5rem 0',
  },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.5rem 1rem',
    gap: '0.75rem',
    minHeight: 38,
  },
  infoLabel: {
    fontSize: '0.8125rem',
    color: 'var(--muted)',
    flexShrink: 0,
  },
  infoValue: {
    fontSize: '0.875rem',
    color: 'var(--text)',
    fontWeight: 500,
    textAlign: 'right',
    wordBreak: 'break-all',
  },

  // Password link
  changePasswordLink: {
    fontSize: '0.8125rem',
    color: 'var(--gold)',
    fontWeight: 600,
    textDecoration: 'none',
  },
  securityNote: {
    fontSize: '0.75rem',
    color: 'var(--muted)',
    padding: '0 1rem 0.75rem',
    margin: 0,
    lineHeight: 1.5,
  },

  // Logout button
  logoutBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '0.875rem',
    borderRadius: 12,
    border: '1px solid rgba(239,68,68,0.3)',
    background: 'rgba(239,68,68,0.08)',
    color: '#ef4444',
    fontSize: '0.9375rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.25rem',
    transition: 'background 0.15s, border-color 0.15s',
  },

  // Footer note
  footerNote: {
    textAlign: 'center',
    fontSize: '0.75rem',
    color: 'var(--muted)',
    margin: '0.25rem 0 1rem',
    opacity: 0.6,
  },

  // Error state
  errorBox: {
    margin: '2rem 1.25rem',
    padding: '1.5rem',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.75rem',
  },
  errorIcon: {
    fontSize: '1.5rem',
  },
  errorMsg: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--muted)',
  },
  retryBtn: {
    padding: '0.5rem 1.25rem',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '0.8125rem',
    cursor: 'pointer',
    fontWeight: 500,
  },
}

// -- Inline SVG icons ---------------------------------------------------------
function LogoutIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

