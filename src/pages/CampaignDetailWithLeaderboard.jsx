import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import CampaignDetail from './CampaignDetail'

export default function CampaignDetailWithLeaderboard() {
  const navigate = useNavigate()
  const { id } = useParams()

  return (
    <div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '10px 16px 0' }}>
        <button
          type="button"
          onClick={() => navigate(`/leaderboard?campaign=${encodeURIComponent(id)}`)}
          style={{
            width: '100%',
            minHeight: 44,
            borderRadius: 10,
            border: '1px solid rgba(201,166,72,.45)',
            background: 'var(--surface2)',
            color: 'var(--gold)',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          🏆 View Leaderboard
        </button>
      </div>
      <CampaignDetail />
    </div>
  )
}
