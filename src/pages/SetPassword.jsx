// SetPassword — one-time player account activation via Supabase recovery link.
// The activation link establishes a short-lived recovery session; the player
// chooses their own password. No temporary password is shown to staff/player.
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseRecoverySession, validateNewPassword } from '../lib/playerActivation'

export default function SetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let mounted = true

    async function prepareRecoverySession() {
      const recovery = parseRecoverySession(window.location.href)

      if (recovery) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: recovery.access_token,
          refresh_token: recovery.refresh_token,
        })

        if (sessionError) {
          if (mounted) {
            setError('This activation link is invalid or has expired. Please request a new link.')
            setChecking(false)
          }
          return
        }

        // Remove the one-time tokens from the visible URL immediately.
        window.history.replaceState({}, document.title, window.location.pathname)
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!mounted) return

      if (!session) {
        setError('This activation link is invalid or has expired. Please request a new link.')
        setChecking(false)
        return
      }

      const { data: isPlayer, error: playerError } = await supabase.rpc('is_player_auth')
      if (playerError || !isPlayer) {
        await supabase.auth.signOut()
        setError('This activation link is not valid for a player account.')
        setChecking(false)
        return
      }

      setReady(true)
      setChecking(false)
    }

    prepareRecoverySession().catch(() => {
      if (!mounted) return
      setError('Unable to prepare your activation session. Please request a new link.')
      setChecking(false)
    })

    return () => { mounted = false }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    const validationError = validateNewPassword(password, confirmPassword)
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setSubmitting(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message || 'Unable to set your password. Please request a new activation link.')
      setSubmitting(false)
      return
    }

    setPassword('')
    setConfirmPassword('')
    setSuccess(true)
    setSubmitting(false)

    window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
  }

  return (
    <div style={styles.page}>
      <div style={styles.bgCircle1} />
      <div style={styles.bgCircle2} />

      <div style={styles.container}>
        <div style={styles.logoWrap}>
          <div style={styles.logoMark}><StarIcon /></div>
          <div>
            <div style={styles.logoName}>SUREWIN</div>
            <div style={styles.logoSub}>VIP Member Portal</div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardBar} />
          <div style={styles.cardBody}>
            {success ? (
              <div style={styles.successWrap}>
                <div style={styles.successIcon}><CheckIcon /></div>
                <h1 style={styles.heading}>Account activated</h1>
                <p style={styles.subheading}>Your password has been set. Taking you to your VIP dashboard…</p>
              </div>
            ) : (
              <>
                <div style={styles.iconWrap}><LockIcon /></div>
                <h1 style={styles.heading}>Set your password</h1>
                <p style={styles.subheading}>
                  Create a password for your SureWin VIP Portal account. This link can only be used once.
                </p>

                {checking ? (
                  <div style={styles.loadingWrap}>
                    <span style={styles.btnSpinner} />
                    <span>Verifying activation link…</span>
                  </div>
                ) : ready ? (
                  <form onSubmit={handleSubmit} style={styles.form} noValidate>
                    <div style={styles.fieldGroup}>
                      <label style={styles.label} htmlFor="activation-password">New password</label>
                      <div style={styles.inputWrap}>
                        <span style={styles.inputIcon}><LockIcon /></span>
                        <input
                          id="activation-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Minimum 8 characters"
                          value={password}
                          onChange={e => { setPassword(e.target.value); setError('') }}
                          disabled={submitting}
                          style={{ ...styles.input, paddingRight: '3rem' }}
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)} style={styles.eyeBtn} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>

                    <div style={styles.fieldGroup}>
                      <label style={styles.label} htmlFor="activation-confirm">Confirm password</label>
                      <div style={styles.inputWrap}>
                        <span style={styles.inputIcon}><LockIcon /></span>
                        <input
                          id="activation-confirm"
                          type={showConfirm ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Enter password again"
                          value={confirmPassword}
                          onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                          disabled={submitting}
                          style={{ ...styles.input, paddingRight: '3rem' }}
                        />
                        <button type="button" onClick={() => setShowConfirm(v => !v)} style={styles.eyeBtn} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                          {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>

                    {error && <div style={styles.errorBox} role="alert"><span style={styles.errorDot}>!</span>{error}</div>}

                    <button
                      type="submit"
                      disabled={submitting || !password || !confirmPassword}
                      style={{ ...styles.btn, ...(submitting || !password || !confirmPassword ? styles.btnDisabled : {}) }}
                    >
                      {submitting ? <span style={styles.btnSpinner} /> : 'ACTIVATE ACCOUNT'}
                    </button>
                  </form>
                ) : (
                  <>
                    <div style={styles.errorBox} role="alert"><span style={styles.errorDot}>!</span>{error}</div>
                    <Link to="/forgot-password" style={styles.backBtn}>Request help</Link>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <p style={styles.footer}>© {new Date().getFullYear()} SureWin &nbsp;•&nbsp; Secure VIP Member Portal</p>
      </div>
    </div>
  )
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.25rem', position: 'relative', overflow: 'hidden' },
  bgCircle1: { position: 'absolute', top: '-120px', right: '-80px', width: '360px', height: '360px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(201,166,72,.08) 0%, transparent 70%)', pointerEvents: 'none' },
  bgCircle2: { position: 'absolute', bottom: '-100px', left: '-60px', width: '280px', height: '280px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.06) 0%, transparent 70%)', pointerEvents: 'none' },
  container: { width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', position: 'relative', zIndex: 1 },
  logoWrap: { display: 'flex', alignItems: 'center', gap: '.875rem' },
  logoMark: { width: 44, height: 44, borderRadius: 12, background: 'var(--gold-dim)', border: '1px solid rgba(201,166,72,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)' },
  logoName: { fontSize: '1.4rem', fontWeight: 800, letterSpacing: '.12em', color: 'var(--gold)', lineHeight: 1 },
  logoSub: { fontSize: '.7rem', color: 'var(--muted)', letterSpacing: '.08em', marginTop: '.25rem', textTransform: 'uppercase' },
  card: { width: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,.3)', overflow: 'hidden' },
  cardBar: { height: 3, background: 'linear-gradient(90deg, transparent, var(--gold), transparent)' },
  cardBody: { padding: '2rem' },
  iconWrap: { width: 48, height: 48, borderRadius: 14, background: 'var(--gold-dim)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' },
  successWrap: { textAlign: 'center', padding: '.75rem 0' },
  successIcon: { width: 58, height: 58, margin: '0 auto 1rem', borderRadius: '50%', background: 'rgba(34,197,94,.12)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  heading: { margin: 0, color: 'var(--text)', fontSize: '1.5rem', fontWeight: 700 },
  subheading: { margin: '.4rem 0 1.5rem', color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '.45rem' },
  label: { color: 'var(--text)', fontSize: '.72rem', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' },
  inputWrap: { position: 'relative' },
  inputIcon: { position: 'absolute', left: '.85rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' },
  input: { width: '100%', boxSizing: 'border-box', height: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(10,20,40,.45)', color: 'var(--text)', padding: '0 2.75rem', outline: 'none' },
  eyeBtn: { position: 'absolute', right: '.45rem', top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: '.45rem' },
  btn: { width: '100%', height: 44, border: 0, borderRadius: 8, background: 'var(--gold)', color: '#101828', fontWeight: 800, letterSpacing: '.08em', cursor: 'pointer' },
  btnDisabled: { opacity: .55, cursor: 'not-allowed' },
  btnSpinner: { display: 'inline-block', width: 18, height: 18, border: '2px solid currentColor', borderRightColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  errorBox: { display: 'flex', alignItems: 'flex-start', gap: '.5rem', padding: '.75rem', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: '#fca5a5', fontSize: '.82rem', lineHeight: 1.45 },
  errorDot: { flex: '0 0 auto', width: 18, height: 18, borderRadius: '50%', background: 'rgba(239,68,68,.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 },
  loadingWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.65rem', color: 'var(--muted)', padding: '1.5rem 0' },
  backBtn: { display: 'block', textAlign: 'center', textDecoration: 'none', padding: '.75rem 1rem', borderRadius: 8, background: 'var(--gold)', color: '#101828', fontWeight: 800, letterSpacing: '.06em' },
  footer: { margin: 0, color: 'var(--muted)', fontSize: '.72rem' },
}

function Icon({ children }) { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg> }
function LockIcon() { return <Icon><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Icon> }
function StarIcon() { return <Icon><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></Icon> }
function CheckIcon() { return <Icon><path d="m5 12 4 4L19 6" /></Icon> }
function EyeIcon() { return <Icon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></Icon> }
function EyeOffIcon() { return <Icon><path d="m3 3 18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 4.2A10.6 10.6 0 0 1 12 4c6.5 0 10 6 10 6a18.4 18.4 0 0 1-3 3.5M6.2 6.2C3.5 8.1 2 10 2 10s3.5 6 10 6a10.7 10.7 0 0 0 3-.4" /></Icon> }
