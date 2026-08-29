// ForgotPassword ? Player Portal password reset request screen.
// Premium SureWin VIP design: midnight navy + royal gold.
// Uses player-forgot-password Edge Function. Enumeration-safe: always
// shows generic success message regardless of account existence.
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlayerAuth } from '../context/PlayerAuthContext'

export default function ForgotPassword() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState('verify') // verify | password | success

 async function handleVerify(e) {
  e.preventDefault()

  if (!username.trim() || !email.trim()) return

  setError('')
  setSubmitting(true)

  try {
    const { callForgotPassword } = await import('../lib/playerAuth')

    // Verify username + registered email only.
    const result = await callForgotPassword(
      username.trim(),
      email.trim()
    )

    if (result.error) {
      setError(result.error)
      return
    }

    // Account verified — continue directly to new password.
    setStep('password')
  } catch (err) {
    setError('Unable to verify account. Please try again.')
  } finally {
    setSubmitting(false)
  }
}

  async function handleReset(e) {
  e.preventDefault()

  if (password.length < 8) {
    setError('Password must be at least 8 characters.')
    return
  }

  if (password !== confirmPassword) {
    setError('Passwords do not match.')
    return
  }

  setError('')
  setSubmitting(true)

  try {
    const { callForgotPassword } = await import('../lib/playerAuth')

    // Direct password change.
    // Backend will verify username + registered email again
    // before changing the password.
    const result = await callForgotPassword(
      username.trim(),
      email.trim(),
      password
    )

    if (result.error) {
      setError(result.error)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setStep('success')
  } catch (err) {
    setError('Unable to change password. Please try again.')
  } finally {
    setSubmitting(false)
  }
}

  const resetToStart = () => {
    setStep('verify')
    setResetToken('')
    setPassword('')
    setConfirmPassword('')
    setError('')
  }

  return (
    <div style={styles.page}>
      <div style={styles.bgCircle1} />
      <div style={styles.bgCircle2} />

      <div style={styles.container}>
        <div style={styles.logoWrap}>
          <div style={styles.logoMark}>
            <StarIcon />
          </div>
          <div>
            <div style={styles.logoName}>SUREWIN</div>
            <div style={styles.logoSub}>VIP Member Portal</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardBar} />

          <div style={styles.cardBody}>
            {step === 'success' ? (
              <div style={styles.successWrap}>
                <div style={styles.successIcon}>
                  <CheckIcon />
                </div>
                <h1 style={styles.heading}>Password changed</h1>
                <p style={styles.successMsg}>
                  Your SureWin password has been changed successfully.
                  You can now sign in with your new password.
                </p>
                <Link to="/login" style={styles.backBtn}>
                  Back to Login
                </Link>
              </div>
            ) : step === 'password' ? (
              <>
                <div style={styles.iconWrap}>
                  <LockIcon />
                </div>
                <h1 style={styles.heading}>Create new password</h1>
                <p style={styles.subheading}>
                  Your account has been verified. Enter a new password below.
                </p>

                <form onSubmit={handleReset} style={styles.form} noValidate>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label} htmlFor="fp-password">New Password</label>
                    <div style={styles.inputWrap}>
                      <span style={styles.inputIcon}>
                        <LockIcon />
                      </span>
                      <input
                        id="fp-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Minimum 8 characters"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError('') }}
                        disabled={submitting}
                        style={styles.input}
                        onFocus={e => Object.assign(e.target.style, styles.inputFocused)}
                        onBlur={e => Object.assign(e.target.style, styles.input)}
                      />
                    </div>
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label} htmlFor="fp-confirm-password">Confirm Password</label>
                    <div style={styles.inputWrap}>
                      <span style={styles.inputIcon}>
                        <LockIcon />
                      </span>
                      <input
                        id="fp-confirm-password"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Enter password again"
                        value={confirmPassword}
                        onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                        disabled={submitting}
                        style={styles.input}
                        onFocus={e => Object.assign(e.target.style, styles.inputFocused)}
                        onBlur={e => Object.assign(e.target.style, styles.input)}
                      />
                    </div>
                  </div>

                  {error && (
                    <div style={styles.errorBox} role="alert">
                      <span style={styles.errorDot}>!</span>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !password || !confirmPassword}
                    style={{
                      ...styles.btn,
                      ...(submitting || !password || !confirmPassword
                        ? styles.btnDisabled
                        : {}),
                    }}
                  >
                    {submitting
                      ? <span style={styles.btnSpinner} />
                      : 'CHANGE PASSWORD'}
                  </button>

                  <div style={styles.backRow}>
                    <button
                      type="button"
                      onClick={resetToStart}
                      disabled={submitting}
                      style={styles.textButton}
                    >
                      Start over
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div style={styles.iconWrap}>
                  <KeyIcon />
                </div>
                <h1 style={styles.heading}>Reset password</h1>
                <p style={styles.subheading}>
                  Enter your username and registered email address to verify your account.
                </p>

                <form onSubmit={handleVerify} style={styles.form} noValidate>
                  <div style={styles.fieldGroup}>
                    <label style={styles.label} htmlFor="fp-username">Username</label>
                    <div style={styles.inputWrap}>
                      <span style={styles.inputIcon}>
                        <UserIcon />
                      </span>
                      <input
                        id="fp-username"
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
                        onBlur={e => Object.assign(e.target.style, styles.input)}
                      />
                    </div>
                  </div>

                  <div style={styles.fieldGroup}>
                    <label style={styles.label} htmlFor="fp-email">Email address</label>
                    <div style={styles.inputWrap}>
                      <span style={styles.inputIcon}>
                        <MailIcon />
                      </span>
                      <input
                        id="fp-email"
                        type="email"
                        autoComplete="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError('') }}
                        disabled={submitting}
                        style={styles.input}
                        onFocus={e => Object.assign(e.target.style, styles.inputFocused)}
                        onBlur={e => Object.assign(e.target.style, styles.input)}
                      />
                    </div>
                  </div>

                  {error && (
                    <div style={styles.errorBox} role="alert">
                      <span style={styles.errorDot}>!</span>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !username.trim() || !email.trim()}
                    style={{
                      ...styles.btn,
                      ...(submitting || !username.trim() || !email.trim()
                        ? styles.btnDisabled
                        : {}),
                    }}
                  >
                    {submitting
                      ? <span style={styles.btnSpinner} />
                      : 'VERIFY ACCOUNT'}
                  </button>

                  <div style={styles.backRow}>
                    <Link to="/login" style={styles.backLink}>
                      Back to Login
                    </Link>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>

        <p style={styles.footer}>
          © {new Date().getFullYear()} SureWin &nbsp;•&nbsp; Secure VIP Member Portal
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
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: '12px',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--gold)',
    marginBottom: '1.25rem',
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
    lineHeight: 1.5,
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
    animation: 'fpSpin .6s linear infinite',
  },
  backRow: {
    textAlign: 'center',
    marginTop: '.25rem',
  },
  backLink: {
    fontSize: '.875rem',
    color: 'var(--gold)',
    textDecoration: 'none',
    opacity: 0.85,
  },
  textButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--gold)',
    fontSize: '.875rem',
    cursor: 'pointer',
    padding: '.25rem .5rem',
    opacity: 0.85,
  },
  // Success state
  successWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '1rem',
    padding: '.5rem 0',
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: 'var(--success-bg)',
    border: '1px solid rgba(34,197,94,.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--success)',
    marginBottom: '.25rem',
  },
  successMsg: {
    fontSize: '.9rem',
    color: 'var(--muted)',
    lineHeight: 1.6,
    maxWidth: '300px',
  },
  backBtn: {
    marginTop: '.5rem',
    display: 'inline-block',
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
const FP_SPINNER_STYLE = `@keyframes fpSpin { to { transform: rotate(360deg); } }`
if (typeof document !== 'undefined' && !document.getElementById('fp-spinner-style')) {
  const s = document.createElement('style')
  s.id = 'fp-spinner-style'
  s.textContent = FP_SPINNER_STYLE
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
function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}
function KeyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="10" width="14" height="11" rx="2"/>
      <path d="M8 10V7a4 4 0 018 0v3"/>
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
