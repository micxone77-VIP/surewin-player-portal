export const LEADERBOARD_METRICS = {
  turnover: { label: 'Turnover', rankingLabel: 'Turnover ranking', fields: ['turnover'] },
  deposit: { label: 'Deposit', rankingLabel: 'Deposit ranking', fields: ['deposit'] },
  turnover_deposit: { label: 'Turnover + Deposit', rankingLabel: 'Turnover ranking', fields: ['turnover', 'deposit'] },
}

export function normalizeLeaderboardMetric(value) {
  return Object.prototype.hasOwnProperty.call(LEADERBOARD_METRICS, value) ? value : 'turnover'
}

export function getLeaderboardMetricConfig(value) {
  return LEADERBOARD_METRICS[normalizeLeaderboardMetric(value)]
}

export function formatLeaderboardAmount(value) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return 'RM0'
  return `RM${amount.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`
}

export function splitLeaderboardRows(rows = [], topN = 10) {
  const ranked = [...rows]
    .filter(row => Number.isFinite(Number(row?.rank_position)))
    .sort((a, b) => Number(a.rank_position) - Number(b.rank_position))

  const limit = Math.max(3, Number(topN) || 10)
  const podium = ranked.filter(row => Number(row.rank_position) <= 3)
  const table = ranked.filter(row => Number(row.rank_position) > 3 && Number(row.rank_position) <= limit)
  const me = rows.find(row => row?.is_me) ?? null
  return { podium, table, me }
}

export function getLeaderboardDisplayValues(row, metric) {
  const mode = normalizeLeaderboardMetric(metric)
  if (mode === 'deposit') return [{ label: 'DEPOSIT', value: row?.deposit_value }]
  if (mode === 'turnover_deposit') {
    return [
      { label: 'TURNOVER', value: row?.turnover_value },
      { label: 'DEPOSIT', value: row?.deposit_value },
    ]
  }
  return [{ label: 'TURNOVER', value: row?.turnover_value ?? row?.metric_value }]
}
