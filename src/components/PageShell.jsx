// PageShell ? Temporary placeholder component for STEP 1.
// Replaced screen-by-screen in Steps 4?9.
import React from 'react'

export default function PageShell({ title, icon, step, subtitle }) {
  return (
    <div style={{
      padding: '2rem 1.25rem',
      maxWidth: 480,
      margin: '0 auto',
    }}>
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        padding: '2rem',
        textAlign: 'center',
        marginTop: '2rem',
      }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '.75rem' }}>{icon}</div>
        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--text)',
          letterSpacing: '-.02em',
        }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ color: 'var(--muted)', fontSize: '.8rem', marginTop: '.25rem', fontFamily: 'monospace' }}>
            {subtitle}
          </p>
        )}
        <div style={{
          display: 'inline-block',
          marginTop: '1rem',
          padding: '.3rem .8rem',
          background: 'var(--gold-dim)',
          color: 'var(--gold)',
          border: '1px solid var(--gold)',
          borderRadius: 99,
          fontSize: '.75rem',
          fontWeight: 600,
          letterSpacing: '.05em',
        }}>
          Implemented in Step {step}
        </div>
      </div>
    </div>
  )
}
