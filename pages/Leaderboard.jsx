import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatLeaderboardAmount, splitLeaderboardRows } from '../lib/leaderboard'

const REFRESH_MS = 15_000

export default function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedCampaignId = searchParams.get('campaign')
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState(requestedCampaignId)
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState(null)
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true)
    try {
      const { data, error: err } = await supabase.rpc('get_portal_campaigns')
      if (err) throw err
      const leaderboardCampaigns = (data ?? []).filter(c =>
        c.enrolled === true && String(c.campaign_type ?? '').toLowerCase() === 'leaderboard'
      )
      setCampaigns(leaderboardCampaigns)
      setCampaignId(current => {
        if (requestedCampaignId && leaderboardCampaigns.some(c => c.id === requestedCampaignId)) return requestedCampaignId
        const active = leaderboardCampaigns.find(c => String(c.status).toLowerCase() === 'active')
        return active?.id ?? leaderboardCampaigns[0]?.id ?? current ?? null
      })
    } catch (err) {
      console.error('[Leaderboard] campaigns load error:', err?.message ?? err)
      setError('Unable to load leaderboard campaigns.')
    } finally {
      setLoadingCampaigns(false)
    }
  }, [requestedCampaignId])

  const loadLeaderboard = useCallback(async (silent = false) => {
    if (!campaignId) return
    if (silent) setRefreshing(true)
    else setLoadingBoard(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.rpc('get_portal_campaign_leaderboard', {
        p_campaign_id: campaignId,
      })
      if (err) throw err
      const nextRows = data ?? []
      setRows(nextRows)
      setMeta(nextRows[0] ?? null)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[Leaderboard] board load error:', err?.message ?? err)
      setError('Unable to load this leaderboard.')
    } finally {
      setLoadingBoard(false)
      setRefreshing(false)
    }
  }, [campaignId])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])
  useEffect(() => {
    if (campaignId && campaignId !== requestedCampaignId) {
      setSearchParams({ campaign: campaignId }, { replace: true })
    }
  }, [campaignId, requestedCampaignId, setSearchParams])
  useEffect(() => { loadLeaderboard(false) }, [loadLeaderboard])

  useEffect(() => {
    const active = String(meta?.status ?? '').toLowerCase() === 'active'
    if (!active || !campaignId) return undefined

    const refresh = () => loadLeaderboard(true)
    const interval = window.setInterval(refresh, REFRESH_MS)
    const onFocus = () => refresh()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [campaignId, meta?.status, loadLeaderboard])

  const selectedCampaign = useMemo(
    () => campaigns.find(c => c.id === campaignId) ?? null,
    [campaigns, campaignId]
  )

  const { podium, table, me } = useMemo(
    () => splitLeaderboardRows(rows, Number(meta?.top_n ?? 10)),
    [rows, meta?.top_n]
  )

  if (loadingCampaigns) return <LoadingState />

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>LIVE VIP RANKINGS</div>
        <h1 style={styles.title}>Leaderboard</h1>
        <p style={styles.subtitle}>Follow your position using the campaign's live system data.</p>
      </div>

      {campaigns.length > 0 && (
        <div style={styles.selectorCard}>
          <div style={styles.selectorLabel}>CAMPAIGN</div>
          <select
            value={campaignId ?? ''}
            onChange={e => setCampaignId(e.target.value)}
            style={styles.select}
          >
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.campaign_name}</option>
            ))}
          </select>
          {selectedCampaign && (
            <div style={styles.periodRow}>
              <span>{formatDate(selectedCampaign.start_date)} — {formatDate(selectedCampaign.end_date)}</span>
              <StatusPill status={selectedCampaign.status} />
            </div>
          )}
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={() => loadLeaderboard(false)} />
      ) : !campaignId || !selectedCampaign ? (
        <EmptyState />
      ) : loadingBoard ? (
        <LoadingBoard />
      ) : rows.length === 0 ? (
        <EmptyState message="No leaderboard results are available for this campaign yet." />
      ) : (
        <>
          <div style={styles.liveBar}>
            <div style={styles.liveLeft}>
              <span style={{ ...styles.liveDot, ...(String(meta?.status).toLowerCase() !== 'active' ? styles.liveDotEnded : {}) }} />
              <span>{String(meta?.status).toLowerCase() === 'active' ? 'Live ranking' : 'Final ranking'}</span>
            </div>
            <span style={styles.updatedText}>
              {refreshing ? 'Updating…' : `Updated ${formatTime(lastUpdated)}`}
            </span>
          </div>

          <section>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>TOP 3</span>
              <span style={styles.sectionHint}>Top {meta?.top_n ?? 10} reward positions</span>
            </div>
            <Podium rows={podium} />
          </section>

          <section style={styles.listSection}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>TOP {meta?.top_n ?? 10}</span>
              <span style={styles.sectionHint}>Turnover ranking</span>
            </div>
            <div style={styles.rankList}>
              {table.length === 0 ? (
                <div style={styles.noTable}>Only the podium positions are available.</div>
              ) : table.map(row => <RankRow key={`${row.rank_position}-${row.username_masked}`} row={row} />)}
            </div>
          </section>

          <MyPosition row={me} />
        </>
      )}
    </div>
  )
}

function Podium({ rows }) {
  const byRank = new Map(rows.map(row => [Number(row.rank_position), row]))
  return (
    <div style={styles.podium}>
      {[2, 1, 3].map(rank => {
        const row = byRank.get(rank)
        return (
          <div key={rank} style={{ ...styles.podiumCard, ...(rank === 1 ? styles.podiumWinner : {}) }}>
            <div style={styles.medal}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</div>
            <div style={styles.podiumRank}>{rank === 1 ? '1ST' : rank === 2 ? '2ND' : '3RD'}</div>
            {row ? (
              <>
                <div style={styles.podiumUser}>{row.username_masked}</div>
                <div style={styles.podiumTier}>{row.tier ?? 'VIP'}</div>
                <div style={styles.podiumMetric}>{formatLeaderboardAmount(row.metric_value)}</div>
              </>
            ) : (
              <div style={styles.emptyPodium}>—</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function RankRow({ row }) {
  return (
    <div style={styles.rankRow}>
      <div style={styles.rankNumber}>#{row.rank_position}</div>
      <div style={styles.rankIdentity}>
        <div style={styles.rankUser}>{row.username_masked}</div>
        <div style={styles.rankTier}>{row.tier ?? 'VIP'}</div>
      </div>
      <div style={styles.rankValues}>
        <div style={styles.rankMetric}>{formatLeaderboardAmount(row.metric_value)}</div>
        <div style={styles.rankDeposit}>Deposit {formatLeaderboardAmount(row.deposit_value)}</div>
      </div>
    </div>
  )
}

function MyPosition({ row }) {
  if (!row) return null
  const ranked = Number.isFinite(Number(row.rank_position))
  return (
    <section style={styles.myCard}>
      <div style={styles.myEyebrow}>MY POSITION</div>
      <div style={styles.myBody}>
        <div>
          <div style={styles.myUser}>{row.username_masked}</div>
          <div style={styles.myTier}>{row.tier ?? 'VIP'}</div>
        </div>
        <div style={styles.myRankWrap}>
          <span style={styles.myRankLabel}>RANK</span>
          <strong style={styles.myRank}>{ranked ? `#${row.rank_position}` : '—'}</strong>
        </div>
      </div>
      <div style={styles.myStats}>
        <div><span>Turnover</span><strong>{formatLeaderboardAmount(row.metric_value)}</strong></div>
        <div><span>Deposit</span><strong>{formatLeaderboardAmount(row.deposit_value)}</strong></div>
      </div>
      {!ranked && <div style={styles.myNote}>You have not reached the minimum qualifying turnover yet.</div>}
    </section>
  )
}

function StatusPill({ status }) {
  const active = String(status ?? '').toLowerCase() === 'active'
  return <span style={{ ...styles.status, ...(active ? styles.statusActive : styles.statusEnded) }}>{active ? 'LIVE' : 'ENDED'}</span>
}

function EmptyState({ message = 'No leaderboard campaigns are available for your account.' }) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyIcon}>🏆</div>
      <div style={styles.emptyTitle}>Leaderboard</div>
      <div style={styles.emptyText}>{message}</div>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyIcon}>!</div>
      <div style={styles.emptyTitle}>{message}</div>
      <button onClick={onRetry} style={styles.retryBtn}>Try Again</button>
    </div>
  )
}

function LoadingState() {
  return <div style={styles.page}><div style={styles.loadingTitle} /><div style={styles.loadingCard} /><div style={styles.loadingCard} /></div>
}

function LoadingBoard() {
  return <><div style={styles.loadingCard} /><div style={styles.loadingCard} /><div style={styles.loadingCard} /></>
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatTime(value) {
  if (!value) return '—'
  return value.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
}

const styles = {
  page: { minHeight: '100%', padding: '1.5rem 1rem 5rem', maxWidth: 560, margin: '0 auto' },
  header: { marginBottom: '1rem' },
  eyebrow: { fontSize: '.68rem', fontWeight: 800, letterSpacing: '.14em', color: 'var(--gold)', marginBottom: '.3rem' },
  title: { fontSize: '1.55rem', fontWeight: 800, color: 'var(--text)', margin: 0 },
  subtitle: { fontSize: '.8rem', lineHeight: 1.5, color: 'var(--muted)', margin: '.35rem 0 0' },
  selectorCard: { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem', marginBottom: '.75rem' },
  selectorLabel: { fontSize: '.65rem', fontWeight: 800, letterSpacing: '.1em', color: 'var(--dim)', marginBottom: '.4rem' },
  select: { width: '100%', minHeight: 44, padding: '0 .8rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: '.85rem', fontWeight: 700 },
  periodRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.5rem', marginTop: '.7rem', color: 'var(--muted)', fontSize: '.75rem' },
  status: { fontSize: '.65rem', fontWeight: 800, letterSpacing: '.08em', padding: '.2rem .55rem', borderRadius: 20, whiteSpace: 'nowrap' },
  statusActive: { color: '#22c55e', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)' },
  statusEnded: { color: 'var(--dim)', background: 'var(--surface2)', border: '1px solid var(--border)' },
  liveBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '.5rem 0 1rem', padding: '.65rem .8rem', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 },
  liveLeft: { display: 'flex', alignItems: 'center', gap: '.4rem', fontSize: '.75rem', fontWeight: 700, color: 'var(--text-2)' },
  liveDot: { width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 4px rgba(34,197,94,.1)' },
  liveDotEnded: { background: 'var(--dim)', boxShadow: 'none' },
  updatedText: { fontSize: '.7rem', color: 'var(--dim)' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.5rem', margin: '0 0 .6rem' },
  sectionTitle: { fontSize: '.72rem', fontWeight: 800, letterSpacing: '.1em', color: 'var(--gold)' },
  sectionHint: { fontSize: '.68rem', color: 'var(--dim)' },
  podium: { display: 'grid', gridTemplateColumns: '1fr 1.15fr 1fr', gap: '.45rem', alignItems: 'end' },
  podiumCard: { minHeight: 154, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px 12px 8px 8px', padding: '.7rem .45rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', textAlign: 'center' },
  podiumWinner: { minHeight: 178, borderColor: 'rgba(201,166,72,.45)', boxShadow: '0 0 0 1px rgba(201,166,72,.08)' },
  medal: { fontSize: '1.45rem', lineHeight: 1, marginBottom: '.3rem' },
  podiumRank: { fontSize: '.62rem', fontWeight: 800, letterSpacing: '.1em', color: 'var(--dim)' },
  podiumUser: { fontSize: '.78rem', fontWeight: 800, color: 'var(--text)', marginTop: '.45rem', wordBreak: 'break-word' },
  podiumTier: { fontSize: '.62rem', fontWeight: 700, color: 'var(--gold)', marginTop: '.15rem' },
  podiumMetric: { fontSize: '.9rem', fontWeight: 800, color: 'var(--text)', marginTop: '.55rem', fontVariantNumeric: 'tabular-nums' },
  emptyPodium: { fontSize: '1.2rem', color: 'var(--dim)', marginTop: '1.4rem' },
  listSection: { marginTop: '1.25rem' },
  rankList: { display: 'flex', flexDirection: 'column', gap: '.45rem' },
  rankRow: { display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: '.65rem', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '.7rem .75rem' },
  rankNumber: { fontSize: '.78rem', fontWeight: 800, color: 'var(--gold)' },
  rankIdentity: { minWidth: 0 },
  rankUser: { fontSize: '.8rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' },
  rankTier: { fontSize: '.62rem', fontWeight: 700, color: 'var(--dim)', marginTop: '.15rem' },
  rankValues: { textAlign: 'right' },
  rankMetric: { fontSize: '.82rem', fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  rankDeposit: { fontSize: '.62rem', color: 'var(--dim)', marginTop: '.15rem', fontVariantNumeric: 'tabular-nums' },
  noTable: { background: 'var(--card)', border: '1px dashed var(--border)', borderRadius: 10, padding: '1rem', textAlign: 'center', color: 'var(--dim)', fontSize: '.75rem' },
  myCard: { marginTop: '1.25rem', background: 'linear-gradient(180deg, var(--card), var(--surface2))', border: '1px solid rgba(201,166,72,.28)', borderRadius: 'var(--rl)', padding: '1rem', boxShadow: '0 4px 24px rgba(0,0,0,.2)' },
  myEyebrow: { fontSize: '.65rem', fontWeight: 800, letterSpacing: '.12em', color: 'var(--gold)', marginBottom: '.65rem' },
  myBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem' },
  myUser: { fontSize: '1rem', fontWeight: 800, color: 'var(--text)' },
  myTier: { fontSize: '.65rem', fontWeight: 700, color: 'var(--dim)', marginTop: '.15rem' },
  myRankWrap: { textAlign: 'right' },
  myRankLabel: { display: 'block', fontSize: '.6rem', color: 'var(--dim)', letterSpacing: '.1em' },
  myRank: { display: 'block', fontSize: '1.45rem', color: 'var(--gold)', marginTop: '.1rem' },
  myStats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '.8rem' },
  myStats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '.8rem' },
  myStats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginTop: '.8rem' },
  myNote: { marginTop: '.7rem', padding: '.55rem .65rem', background: 'rgba(201,166,72,.08)', border: '1px solid rgba(201,166,72,.15)', borderRadius: 8, color: 'var(--muted)', fontSize: '.7rem', lineHeight: 1.4 },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '3rem 1.5rem', gap: '.7rem' },
  emptyIcon: { width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--gold-dim)', border: '1px solid rgba(201,166,72,.2)', fontSize: '1.6rem' },
  emptyTitle: { fontSize: '1rem', fontWeight: 800, color: 'var(--text)' },
  emptyText: { maxWidth: 320, color: 'var(--muted)', fontSize: '.8rem', lineHeight: 1.5 },
  retryBtn: { minHeight: 44, padding: '.6rem 1.2rem', border: 0, borderRadius: 8, background: 'var(--gold)', color: '#0b0f1a', fontWeight: 800, cursor: 'pointer' },
  loadingTitle: { width: '55%', height: 28, background: 'var(--surface2)', borderRadius: 7, marginBottom: '1rem' },
  loadingCard: { height: 130, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '.75rem' },
}
