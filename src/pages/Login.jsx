// Login ? Player Portal login screen.
// Premium SureWin VIP design: midnight navy + royal gold.
// Uses player-auth Edge Function. Never calls signInWithPassword directly.
// Enumeration-safe error handling matching backend contract.
import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { usePlayerAuth } from '../context/PlayerAuthContext'

export default function Login() {
  const { login, isAuthenticated, loading } = usePlayerAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname ?? '/dashboard'

  const [username,    setUsername]    = useState('')
  const [password,    setPassword]    = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')

  // Already authenticated ? go straight to dashboard
  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, loading, navigate, from])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError('')
    setSubmitting(true)
    const { error: err } = await login(username, password)
    if (err) {
      setError(err)
      setSubmitting(false)
    }
    // On success, useEffect above redirects
  }

  return (
    <div style={styles.page}>
      {/* Background decorative circles */}
      <div style={styles.bgCircle1} />
      <div style={styles.bgCircle2} />

      <div style={styles.container}>
        {/* Logo */}
        <div style={styles.logoWrap}>
          <div style={styles.logoMark}>
            <StarIcon />
          </div>
          <div>
            <div style={styles.logoName}>SUREWIN</div>
            <div style={styles.logoSub}>VIP Member Portal</div>
          </div>
        </div>

        {/* Card */}
        <div style={styles.card}>
          {/* Gold top bar */}
          <div style={styles.cardBar} />

          <div style={styles.cardBody}>
            <h1 style={styles.heading}>Welcome back</h1>
            <p style={styles.subheading}>Sign in to your VIP account</p>

            <form onSubmit={handleSubmit} style={styles.form} noValidate>
              {/* Username */}
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="username">Username</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}>
                    <UserIcon />
                  </span>
                  <input
                    id="username"
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    placeholder="Your username"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setError('') }}
                    disabled={submitting}
                    style={styles.input}
                    onFocus={e => Object.assign(e.target.style, styles.inputFocused)}
                    onBlur={e  => Object.assign(e.target.style, styles.input)}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={styles.fieldGroup}>
                <label style={styles.label} htmlFor="password">Password</label>
                <div style={styles.inputWrap}>
                  <span style={styles.inputIcon}>
                    <LockIcon />
                  </span>
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    disabled={submitting}
                    style={{ ...styles.input, paddingRight: '3rem' }}
                    onFocus={e => Object.assign(e.target.style, { ...styles.inputFocused, paddingRight: '3rem' })}
                    onBlur={e  => Object.assign(e.target.style, { ...styles.input, paddingRight: '3rem' })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={styles.eyeBtn}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div style={styles.errorBox} role="alert">
                  <span style={styles.errorDot}>?</span>
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !username.trim() || !password}
                style={{
                  ...styles.btn,
                  ...(submitting || !username.trim() || !password ? styles.btnDisabled : {}),
                }}
              >
                {submitting
                  ? <span style={styles.btnSpinner} />
                  : 'LOGIN'}
              </button>

              {/* Forgot password */}
              <div style={styles.forgotRow}>
                <Link to="/forgot-password" style={styles.forgotLink}>
                  Forgot password?
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <p style={styles.footer}>
          ? {new Date().getFullYear()} SureWin &nbsp;?&nbsp; Secure VIP Member Portal
        </p>
      </div>
    </div>
  )
}

// -- Styles -----------------------------------------------------------------
const styles = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.25rem',
    position: 'relative',
    overflow: 'hidden',
  },
  bgCircle1: {
    position: 'absolute',
    top: '-120px',
    right: '-80px',
    width: '360px',
    height: '360px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(201,166,72,.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  bgCircle2: {
    position: 'absolute',
    bottom: '-100px',
    left: '-60px',
    width: '280px',
    height: '280px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(59,130,246,.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  container: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.5rem',
    position: 'relative',
    zIndex: 1,
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: '12px',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--gold)',
  },
  logoName: {
    fontSize: '1.4rem',
    fontWeight: 800,
    letterSpacing: '.12em',
    color: 'var(--gold)',
    lineHeight: 1,
  },
  logoSub: {
    fontSize: '.7rem',
    color: 'var(--muted)',
    letterSpacing: '.08em',
    marginTop: '.25rem',
    textTransform: 'uppercase',
  },
  card: {
    width: '100%',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--rl)',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,.4), 0 0 0 1px rgba(201,166,72,.08)',
  },
  cardBar: {
    height: '3px',
    background: 'linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold-2) 60%, transparent 100%)',
  },
  cardBody: {
    padding: '2rem 1.75rem 2rem',
  },
  heading: {
    fontSize: '1.35rem',
    fontWeight: 700,
    letterSpacing: '-.02em',
    color: 'var(--text)',
    marginBottom: '.25rem',
  },
  subheading: {
    fontSize: '.875rem',
    color: 'var(--muted)',
    marginBottom: '1.75rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.1rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '.45rem',
  },
  label: {
    fontSize: '.78rem',
    fontWeight: 600,
    color: 'var(--text-2)',
    letterSpacing: '.04em',
    textTransform: 'uppercase',
  },
  inputWrap: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '.875rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--dim)',
    pointerEvents: 'none',
    display: 'flex',
  },
  input: {
    width: '100%',
    paddingLeft: '2.75rem',
    paddingRight: '1rem',
    paddingTop: '.8rem',
    paddingBottom: '.8rem',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r)',
    color: 'var(--text)',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color .15s, box-shadow .15s',
  },
  inputFocused: {
    width: '100%',
    paddingLeft: '2.75rem',
    paddingRight: '1rem',
    paddingTop: '.8rem',
    paddingBottom: '.8rem',
    background: 'var(--surface2)',
    border: '1px solid var(--gold)',
    borderRadius: 'var(--r)',
    color: 'var(--text)',
    fontSize: '1rem',
    outline: 'none',
    boxShadow: '0 0 0 3px var(--gold-dim)',
    transition: 'border-color .15s, box-shadow .15s',
  },
  eyeBtn: {
    position: 'absolute',
    right: '.875rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--muted)',
    padding: '.25rem',
    display: 'flex',
    alignItems: 'center',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    padding: '.75rem 1rem',
    background: 'var(--danger-bg)',
    border: '1px solid var(--danger)',
    borderRadius: 'var(--r)',
    color: 'var(--danger)',
    fontSize: '.875rem',
    fontWeight: 500,
  },
  errorDot: {
    flexShrink: 0,
    fontSize: '1rem',
  },
  btn: {
    width: '100%',
    padding: '.95rem',
    background: 'var(--gold)',
    color: '#0b0f1a',
    border: 'none',
    borderRadius: 'var(--r)',
    fontSize: '.9rem',
    fontWeight: 800,
    letterSpacing: '.1em',
    cursor: 'pointer',
    transition: 'opacity .15s, transform .1s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '48px',
  },
  btnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  btnSpinner: {
    display: 'inline-block',
    width: '18px',
    height: '18px',
    border: '2px solid rgba(11,15,26,.3)',
    borderTopColor: '#0b0f1a',
    borderRadius: '50%',
    animation: 'loginSpin .6s linear infinite',
  },
  forgotRow: {
    textAlign: 'center',
    marginTop: '.25rem',
  },
  forgotLink: {
    fontSize: '.875rem',
    color: 'var(--gold)',
    textDecoration: 'none',
    opacity: 0.85,
  },
  footer: {
    fontSize: '.75rem',
    color: 'var(--dim)',
    textAlign: 'center',
    letterSpacing: '.04em',
  },
}

// Inject spinner keyframe globally once
const SPINNER_STYLE = `@keyframes loginSpin { to { transform: rotate(360deg); } }`
if (typeof document !== 'undefined' && !document.getElementById('login-spinner-style')) {
  const s = document.createElement('style')
  s.id = 'login-spinner-style'
  s.textContent = SPINNER_STYLE
  document.head.appendChild(s)
}

// -- SVG icons ---------------------------------------------------------------
function StarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  )
}
function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  )
}
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}
