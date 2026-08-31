import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import CampaignDetail from '../pages/CampaignDetail'

export default function LeaderboardCampaignRoute() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [isLeaderboard, setIsLeaderboard] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_portal_campaign', { p_campaign_id: id }).then(({ data, error }) => {
      if (cancelled || error) return
      const campaign = Array.isArray(data) ? data[0] : data
      setIsLeaderboard(String(campaign?.campaign_type ?? '').toLowerCase() === 'leaderboard')
    })
    return () => { cancelled = true }
  }, [id])

  return (
    <>
      <CampaignDetail />
      {isLeaderboard && (
        <div style={styles.bar}>
          <button type="button" onClick={() => navigate(`/leaderboard?campaign=${encodeURIComponent(id)}`)} style={styles.button}>
            <span style={styles.icon}>🏆</span>
            <span>View Leaderboard</span>
          </button>
        </div>
      )}
    </>
  )
}

const styles = {
  bar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 'calc(var(--nav-height) + env(safe-area-inset-bottom, 0px))',
    zIndex: 90,
    display: 'flex',
    justifyContent: 'center',
    padding: '.5rem 1rem',
    pointerEvents: 'none',
  },
  button: {
    pointerEvents: 'auto',
    width: 'min(560px, 100%)',
    minHeight: 46,
    border: '1px solid rgba(201,166,72,.45)',
    borderRadius: 10,
    background: 'rgba(201,166,72,.96)',
    color: '#0b0f1a',
    fontSize: '.82rem',
    fontWeight: 800,
    letterSpacing: '.04em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '.45rem',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0,0,0,.35)',
  },
  icon: { fontSize: '1rem' },
}
