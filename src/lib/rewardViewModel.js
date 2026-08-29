const PAYOUT_PENDING = new Set(['pending', 'approved'])
const UNLOCKED_STATUSES = new Set(['unlocked', 'claimed', 'issued', 'paid', 'approved'])

export function buildRewardView({ rewards = [], levels = [], playerLevels = [], campaigns = [] }) {
  const levelMap = Object.fromEntries(levels.map(level => [level.id, level]))
  const playerLevelMap = Object.fromEntries(playerLevels.map(row => [row.id, row]))
  const playerLevelByCampaignLevel = {}
  for (const row of playerLevels) {
    if (row.campaign_level_id) playerLevelByCampaignLevel[row.campaign_level_id] = row
  }
  const campaignMap = Object.fromEntries(campaigns.map(campaign => [campaign.id, campaign]))

  // Keep only reward rows whose level belongs to an enrolled campaign visible to this player.
  // This also prevents an incomplete metadata response from rendering a misleading empty tab.
  const visibleRewards = rewards.filter(reward => {
    const level = levelMap[reward.campaign_level_id]
    const playerLevel = reward.campaign_player_level_id
      ? playerLevelMap[reward.campaign_player_level_id]
      : playerLevelByCampaignLevel[reward.campaign_level_id]
    // A reward wallet should contain only rewards whose corresponding campaign
    // level is actually unlocked. CRM may pre-create future reward rows; those
    // rows are not payable and must not appear as player rewards yet.
    return Boolean(
      level &&
      campaignMap[level.campaign_id] &&
      playerLevel &&
      UNLOCKED_STATUSES.has(playerLevel.status)
    )
  })

  const matches = {
    All: () => true,
    Unlocked: reward => {
      const playerLevel = reward.campaign_player_level_id
        ? playerLevelMap[reward.campaign_player_level_id]
        : playerLevelByCampaignLevel[reward.campaign_level_id]
      return Boolean(playerLevel && UNLOCKED_STATUSES.has(playerLevel.status))
    },
    Pending: reward => PAYOUT_PENDING.has(String(reward.status ?? '').toLowerCase()),
    Paid: reward => String(reward.status ?? '').toLowerCase() === 'paid',
  }

  const filtered = {}
  const counts = {}
  for (const filter of Object.keys(matches)) {
    filtered[filter] = visibleRewards.filter(matches[filter])
    counts[filter] = filtered[filter].length
  }

  const groupsByCampaign = {}
  for (const reward of visibleRewards) {
    const level = levelMap[reward.campaign_level_id]
    const campaign = campaignMap[level.campaign_id]
    if (!groupsByCampaign[campaign.id]) {
      groupsByCampaign[campaign.id] = { campaign, items: [] }
    }
    groupsByCampaign[campaign.id].items.push(reward)
  }

  return {
    rewards: visibleRewards,
    levelMap,
    playerLevelMap,
    playerLevelByCampaignLevel,
    campaignMap,
    filtered,
    counts,
    groups: Object.values(groupsByCampaign),
  }
}
