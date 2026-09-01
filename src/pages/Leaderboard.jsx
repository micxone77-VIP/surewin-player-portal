import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatLeaderboardAmount, splitLeaderboardRows } from '../lib/leaderboard'

const REFRESH_MS = 15000

function maskUsername(value) {
  const username = String(value ?? '').trim()
  if (!username) return 'Player'
  if (username.length <= 2) return `${username[0]}*`
  if (username.length === 3) return `${username[0]}*${username.at(-1)}`
  if (username.length === 4) return `${username[0]}**${username.at(-1)}`
  return `${username.slice(0, 2)}${'*'.repeat(Math.max(username.length - 3, 1))}${username.at(-1)}`
}

function dateLabel(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
}

function timeLabel(value) {
  if (!value) return '—'
  return value.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
}

export default function Leaderboard() {
  const [params, setParams] = useSearchParams()
  const requestedId = params.get('campaign')
  const [campaigns, setCampaigns] = useState([])
  const [campaignId, setCampaignId] = useState(requestedId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadCampaigns = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_portal_campaigns')
      if (rpcError) throw rpcError
      const available = (data ?? []).filter(c =>
        c.enrolled === true && String(c.campaign_type ?? '').toLowerCase() === 'leaderboard'
      )
      setCampaigns(available)
      setCampaignId(current => {
        if (requestedId && available.some(c => String(c.id) === String(requestedId))) return requestedId
        const active = available.find(c => String(c.status).toLowerCase() === 'active')
        return active?.id ?? available[0]?.id ?? current ?? null
      })
    } catch (err) {
      console.error('[Leaderboard] campaign load:', err)
      setError('Unable to load leaderboard campaigns.')
    } finally {
      setLoading(false)
    }
  }, [requestedId])

  const loadBoard = useCallback(async (silent = false) => {
    if (!campaignId) return
    silent ? setRefreshing(true) : setLoadingBoard(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('get_portal_campaign_leaderboard', {
        p_campaign_id: campaignId,
      })
      if (rpcError) throw rpcError
      setRows(data ?? [])
      setLastUpdated(new Date())
    } catch (err) {
      console.error('[Leaderboard] board load:', err)
      setError('Unable to load this leaderboard.')
    } finally {
      setLoadingBoard(false)
      setRefreshing(false)
    }
  }, [campaignId])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  useEffect(() => {
    if (campaignId && String(campaignId) !== String(requestedId)) {
      setParams({ campaign: campaignId }, { replace: true })
    }
  }, [campaignId, requestedId, setParams])

  useEffect(() => { loadBoard(false) }, [loadBoard])

  const meta = rows[0] ?? null
  const active = String(meta?.status ?? '').toLowerCase() === 'active'

  useEffect(() => {
    if (!active || !campaignId) return undefined
    const refresh = () => loadBoard(true)
    const interval = window.setInterval(refresh, REFRESH_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [active, campaignId, loadBoard])

  const selected = useMemo(() => campaigns.find(c => String(c.id) === String(campaignId)) ?? null, [campaigns, campaignId])
  const { podium, table, me } = useMemo(() => splitLeaderboardRows(rows, Number(meta?.top_n ?? 10)), [rows, meta?.top_n])

  if (loading) return <Page><Skeleton /></Page>

  return (
    <Page>
      <header>
        <div style={styles.eyebrow}>LIVE VIP RANKINGS</div>
        <h1 style={styles.title}>Leaderboard</h1>
        <p style={styles.subtitle}>Follow your campaign position using live system data.</p>
      </header>

      {campaigns.length > 0 && (
        <div style={styles.card}>
          <label style={styles.label}>CAMPAIGN</label>
          <select value={campaignId ?? ''} onChange={e => setCampaignId(e.target.value)} style={styles.select}>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}
          </select>
          {selected && <div style={styles.period}>{dateLabel(selected.start_date)} — {dateLabel(selected.end_date)} <Status active={String(selected.status).toLowerCase() === 'active'} /></div>}
        </div>
      )}

      {error ? <ErrorState message={error} onRetry={() => loadBoard(false)} /> : !selected ? <EmptyState /> : loadingBoard ? <Skeleton /> : rows.length === 0 ? <EmptyState message="No leaderboard results are available yet." /> : (
        <>
          <div style={styles.liveBar}>
            <span><i style={{ ...styles.dot, background: active ? '#22c55e' : 'var(--dim)' }} />{active ? 'Live ranking' : 'Final ranking'}</span>
            <small>{refreshing ? 'Updating…' : `Updated ${timeLabel(lastUpdated)}`}</small>
          </div>

          <section>
            <SectionTitle title="TOP 3" hint={`Top ${meta?.top_n ?? 10} reward positions`} />
            <div style={styles.podium}>
              {[2, 1, 3].map(rank => {
                const row = podium.find(item => Number(item.rank_position) === rank)
                return <PodiumCard key={rank} rank={rank} row={row} />
              })}
            </div>
          </section>

          {table.length > 0 && <section style={{ marginTop: 20 }}>
            <SectionTitle title={`TOP ${meta?.top_n ?? 10}`} hint="Turnover ranking" />
            <div style={styles.list}>{table.map(row => <RankRow key={row.rank_position} row={row} />)}</div>
          </section>}

          {me && <MyPosition row={me} />}
        </>
      )}
    </Page>
  )
}

function Page({ children }) { return <div style={styles.page}>{children}</div> }
function SectionTitle({ title, hint }) { return <div style={styles.sectionTitle}><b>{title}</b><span>{hint}</span></div> }
function Status({ active }) { return <span style={{ ...styles.status, color: active ? '#22c55e' : 'var(--dim)' }}>{active ? 'LIVE' : 'ENDED'}</span> }
function PodiumCard({ rank, row }) {
  return <div style={{ ...styles.podiumCard, ...(rank === 1 ? styles.winner : {}) }}>
    <div style={styles.medal}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</div>
    <strong>{rank === 1 ? '1ST' : rank === 2 ? '2ND' : '3RD'}</strong>
    {row ? <><div style={styles.user}>{row.username_masked || maskUsername(row.username)}</div><div style={styles.tier}>{row.tier ?? 'VIP'}</div><div style={styles.metric}>{formatLeaderboardAmount(row.metric_value)}</div></> : <div style={styles.empty}>—</div>}
  </div>
}
function RankRow({ row }) { return <div style={styles.row}><b>#{row.rank_position}</b><div style={{ flex: 1 }}><strong>{row.username_masked || maskUsername(row.username)}</strong><small>{row.tier ?? 'VIP'}</small></div><div style={{ textAlign: 'right' }}><strong>{formatLeaderboardAmount(row.metric_value)}</strong><small>Deposit {formatLeaderboardAmount(row.deposit_value)}</small></div></div> }
function MyPosition({ row }) { return <div style={styles.myCard}><div style={styles.eyebrow}>MY POSITION</div><div style={styles.myTop}><div><strong>{row.username_masked || maskUsername(row.username)}</strong><small>{row.tier ?? 'VIP'}</small></div><div><small>RANK</small><b>{row.rank_position ? `#${row.rank_position}` : '—'}</b></div></div><div style={styles.myStats}><span>Turnover <b>{formatLeaderboardAmount(row.metric_value)}</b></span><span>Deposit <b>{formatLeaderboardAmount(row.deposit_value)}</b></span></div></div> }
function EmptyState({ message = 'No leaderboard campaigns are available for your account.' }) { return <div style={styles.emptyState}><div>🏆</div><strong>Leaderboard</strong><span>{message}</span></div> }
function ErrorState({ message, onRetry }) { return <div style={styles.emptyState}><strong>{message}</strong><button onClick={onRetry} style={styles.button}>Try Again</button></div> }
function Skeleton() { return <div><div style={styles.skeleton} /><div style={styles.skeleton} /><div style={styles.skeleton} /></div> }

const styles = {
  page: { minHeight: '100%', maxWidth: 560, margin: '0 auto', padding: '1.5rem 1rem 5.5rem', color: 'var(--text)' },
  eyebrow: { fontSize: '.68rem', fontWeight: 800, letterSpacing: '.14em', color: 'var(--gold)' },
  title: { margin: '.3rem 0', fontSize: '1.6rem' },
  subtitle: { margin: 0, color: 'var(--muted)', fontSize: '.8rem' },
  card: { marginTop: '1rem', padding: '1rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 },
  label: { display: 'block', marginBottom: '.4rem', fontSize: '.65rem', color: 'var(--dim)', fontWeight: 800 },
  select: { width: '100%', minHeight: 44, padding: '0 .75rem', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 700 },
  period: { marginTop: '.65rem', display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--muted)', fontSize: '.72rem' },
  status: { fontWeight: 800, fontSize: '.62rem' },
  liveBar: { margin: '.75rem 0', padding: '.65rem .8rem', display: 'flex', justifyContent: 'space-between', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '.75rem' },
  dot: { display: 'inline-block', width: 7, height: 7, borderRadius: '50%', marginRight: 7 },
  sectionTitle: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '1rem 0 .6rem', color: 'var(--gold)', fontSize: '.72rem', letterSpacing: '.08em' },
  sectionTitle: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '1rem 0 .6rem', color: 'var(--gold)', fontSize: '.72rem', letterSpacing: '.08em' },
  podium: { display: 'grid', gridTemplateColumns: '1fr 1.12fr 1fr', gap: 7, alignItems: 'end' },
  podiumCard: { minHeight: 145, padding: '.7rem .35rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '.68rem' },
  winner: { minHeight: 170, borderColor: 'rgba(201,166,72,.55)' },
  medal: { fontSize: '1.35rem', marginBottom: '.2rem' },
  user: { marginTop: '.45rem', fontWeight: 800, wordBreak: 'break-all' },
  tier: { marginTop: '.15rem', color: 'var(--muted)', fontSize: '.62rem' },
  metric: { marginTop: '.5rem', color: 'var(--gold)', fontWeight: 900, fontSize: '.85rem' },
  list: { overflow: 'hidden', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '.8rem .75rem', borderBottom: '1px solid var(--border)' },
  myCard: { marginTop: 16, padding: '1rem', background: 'var(--card)', border: '1px solid rgba(201,166,72,.35)', borderRadius: 12 },
  myTop: { display: 'flex', justifyContent: 'space-between', marginTop: '.45rem' },
  myStats: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: '.8rem', fontSize: '.7rem', color: 'var(--muted)' },
  emptyState: { marginTop: 16, padding: '2rem 1rem', textAlign: 'center', display: 'grid', gap: 8, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--muted)' },
  button: { margin: '0 auto', padding: '.55rem .9rem', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' },
  skeleton: { height: 130, marginBottom: 10, borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)' },
  empty: { color: 'var(--dim)' },
}
