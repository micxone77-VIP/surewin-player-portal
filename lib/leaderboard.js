export function maskUsername(username) {
  const value = String(username ?? '').trim()
  if (!value) return 'Player'
  if (value.length === 1) return '*'
  if (value.length === 2) return `${value[0]}*`
  if (value.length === 3) return `${value[0]}*${value.at(-1)}`
  if (value.length === 4) return `${value[0]}**${value.at(-1)}`
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(value.length - 3, 1))}${value.at(-1)}`
}

export function formatLeaderboardAmount(value) {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return 'RM0'
  if (amount >= 1_000_000) return `RM${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `RM${(amount / 1_000).toFixed(1)}K`
  return `RM${amount.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`
}

export function splitLeaderboardRows(rows = [], topN = 10) {
  const ranked = [...rows]
    .filter(row => Number.isFinite(Number(row?.rank_position)))
    .sort((a, b) => Number(a.rank_position) - Number(b.rank_position))
  const podium = ranked.filter(row => Number(row.rank_position) <= 3)
  const table = ranked.filter(row => Number(row.rank_position) > 3 && Number(row.rank_position) <= Number(topN))
  const me = rows.find(row => row?.is_me) ?? null
  return { podium, table, me }
}
