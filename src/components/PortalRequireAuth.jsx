// PortalRequireAuth ? Guards all authenticated portal routes.
// Three states handled:
//   loading  ? gold spinner (no content flash)
//   no session ? redirect /login
//   non-player session ? signOut ? redirect /login
import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { usePlayerAuth } from '../context/PlayerAuthContext'

export default function PortalRequireAuth({ children }) {
  const { session, isAuthenticated, isPlayer, loading, logout } = usePlayerAuth()
  const location = useLocation()

  // If a non-player session slipped through (race edge case), sign out
  useEffect(() => {
    if (!loading && session && !isPlayer) {
      logout()
    }
  }, [loading, session, isPlayer, logout])

  // Still resolving session ? show spinner, never flash protected content
  if (loading || session === undefined) {
    return <LoadingScreen />
  }

  // No session at all
  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Session present but not a player (being signed out via useEffect above)
  if (!isPlayer) {
    return <LoadingScreen />
  }

  return children
}

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="17" stroke="var(--border)" strokeWidth="3" />
          <circle
            cx="20" cy="20" r="17"
            stroke="var(--gold)"
            strokeWidth="3"
            strokeDasharray="80"
            strokeDashoffset="60"
            strokeLinecap="round"
            style={{ transformOrigin: 'center', animation: 'portalSpin .8s linear infinite' }}
          />
        </svg>
        <style>{`
          @keyframes portalSpin { to { transform: rotate(360deg); } }
        `}</style>
        <span style={{ color: 'var(--muted)', fontSize: '.8rem', letterSpacing: '.08em' }}>
          VERIFYING SESSION
        </span>
      </div>
    </div>
  )
}
