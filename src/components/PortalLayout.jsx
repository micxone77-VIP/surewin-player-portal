// PortalLayout — Mobile-first shell with bottom navigation.
// Wraps all authenticated portal screens.
import React from 'react'
import { Outlet, NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/dashboard',     label: 'Home',        icon: HomeIcon },
  { to: '/campaigns',     label: 'Campaigns',   icon: CampaignIcon },
  { to: '/leaderboard',   label: 'Leaderboard', icon: LeaderboardIcon },
  { to: '/rewards',       label: 'Rewards',     icon: RewardIcon },
  { to: '/notifications', label: 'Alerts',      icon: BellIcon },
  { to: '/profile',       label: 'Profile',     icon: ProfileIcon },
]

export default function PortalLayout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)', flexShrink: 0 }} />
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))' }}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function BottomNav() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))',
      background: 'var(--surface)', borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'flex-start', paddingTop: 8,
      paddingBottom: 'env(safe-area-inset-bottom, 0px)', zIndex: 100,
    }}>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '2px 2px', textDecoration: 'none' }}
        >
          {({ isActive }) => (
            <>
              <div style={{ color: isActive ? 'var(--gold)' : 'var(--muted)', transition: 'color .15s' }}>
                <Icon size={21} />
              </div>
              <span style={{
                fontSize: 9, fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--gold)' : 'var(--muted)',
                transition: 'color .15s', letterSpacing: '.01em', whiteSpace: 'nowrap',
              }}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

function HomeIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" /><path d="M9 21V12h6v9" /></svg>
}
function CampaignIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /><path d="M8 14h4M8 17h8" /></svg>
}
function LeaderboardIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M7 20V10h4v10M13 20V4h4v16M3 20h18" /><path d="M5 7h4M15 2h1" /></svg>
}
function RewardIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
}
function BellIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>
}
function ProfileIcon({ size = 24 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
}
