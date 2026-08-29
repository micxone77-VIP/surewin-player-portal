function fmtRMFull(value) {
  const amount = Number(value ?? 0)
  return `RM${amount.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export function buildCampaignGuide({ campaign = {}, levels = [] } = {}) {
  const orderedLevels = [...levels]
    .filter(level => Number(level.deposit_threshold) > 0)
    .sort((a, b) => Number(a.level_order ?? 0) - Number(b.level_order ?? 0))

  const milestoneText = orderedLevels.length
    ? orderedLevels.map(level => {
        const target = fmtRMFull(level.deposit_threshold)
        const reward = fmtRMFull(level.reward_amount)
        const description = level.description ? ` — ${level.description}` : ''
        return `${level.level_name || `Level ${level.level_order || ''}`}: reach ${target} cumulative deposit → ${reward} ${level.reward_type || 'reward'}${description}`
      }).join(' | ')
    : ''

  const steps = [
    'Join the campaign: your account must be enrolled and eligible for this campaign.',
    'Make qualifying deposits during the campaign period and track your progress here.',
  ]

  if (milestoneText) {
    steps.push(`Complete milestones: ${milestoneText}.`)
  } else {
    steps.push('Complete the campaign requirements shown in the campaign rules and progress section.')
  }

  steps.push('Reward processing: once a milestone is unlocked, the reward is subject to verification and the payout status will be updated in the Portal.')

  return {
    steps,
    rules: String(campaign.offer_desc || '').trim(),
  }
}
