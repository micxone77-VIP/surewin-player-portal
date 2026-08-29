// CampaignDetail — Player Portal /campaigns/:id
// ? No get_campaigns_crm()    ? No budget_rm/notes/campaign_code from campaigns
// ? No vip_members / player_accounts / profiles / auth.users
// ? No hardcoded campaign IDs / thresholds / reward amounts / codes
// ? Frontend NEVER determines unlock / eligibility / claim (backend is authoritative)
// ? level_code fetched ONLY for unlocked level IDs (two-query approach for network security)
// ? campaign_rewards: approved_by + notes excluded (CRM-only fields)
// ? All eligibility/unlock/payout state from backend data

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { buildCampaignGuide } from '../lib/campaignGuide'

// -- Column selects — player-safe only ----------------------------------------
const CAMPAIGN_SELECT =
  'id, campaign_name, festival, start_date, end_date, offer_desc, status, campaign_type, campaign_category, is_multi_level, max_levels, created_at'

// level_code intentionally excluded — fetched separately ONLY for unlocked levels
const LEVEL_SELECT_NO_CODE =
  'id, campaign_id, level_order, level_name, deposit_threshold, reward_amount, reward_type, description'

// approved_by (CRM UUID) and notes (CRM text) intentionally excluded
const REWARD_SELECT =
  'campaign_level_id, reward_amount, status, approved_at, paid_at, created_at'

// Backend statuses that mean a player has unlocked this level
const UNLOCKED_STATUSES = new Set(['unlocked', 'claimed', 'issued', 'paid', 'approved'])

// -- Helpers -------------------------------------------------------------------
function fmtRM(n) {
  const v = Number(n ?? 0)
  if (v >= 1_000_000) return `RM${(v / 1_000_000).toFixed(1)}M`
  return `RM${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function fmtRMFull(n) {
  const v = Number(n ?? 0)
  return `RM${v.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}
function calcPct(current, target) {
  if (!target || target <= 0) return 0
  return Math.min(100, Math.max(0, (Number(current) / Number(target)) * 100))
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}
function fmtShortDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short',
  })
}
function fmtDatetime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

// -- Main Component ------------------------------------------------------------
export default function CampaignDetail() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const [detail, setDetail]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const loggedRef = useRef(false)

  const loadDetail = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // -- Step 1: Parallel — campaign + levels (no code) + progress RPC --
      const [campRes, levelsRes, progRes] = await Promise.all([
        supabase.rpc('get_portal_campaign', { p_campaign_id: id }),
        supabase.rpc('get_portal_campaign_levels', { p_campaign_id: id }),
        supabase.rpc('get_my_campaign_progress', { p_campaign_id: id }),
      ])

      // Campaign not found or RLS blocked — do not expose whether it exists for another player
      if (campRes.error || !campRes.data) {
        navigate('/campaigns', { replace: true })
        return
      }

      const campaign = Array.isArray(campRes.data) ? campRes.data[0] : campRes.data
      const levels   = levelsRes.data ?? []
      const prog     = progRes.data   ?? {}
      const levelIds = levels.map(l => l.id)

      // -- Step 2: Player unlock state + reward records (campaign-scoped) --
      let playerLevels = []
      let rewards      = []

      if (levelIds.length > 0) {
        const [plRes, rwRes] = await Promise.all([
          supabase.from('campaign_player_levels')
            .select('campaign_level_id, status, unlocked_at')
            .in('campaign_level_id', levelIds),
          supabase.from('campaign_rewards')
            .select(REWARD_SELECT)
            .in('campaign_level_id', levelIds),
        ])
        playerLevels = plRes.data ?? []
        rewards      = rwRes.data ?? []  // empty if RLS blocks — still works
      }

      // Build lookup maps
      const plMap = {}
      for (const pl of playerLevels) plMap[pl.campaign_level_id] = pl

      const rwMap = {}
      for (const rw of rewards) rwMap[rw.campaign_level_id] = rw

      // -- Step 3: Fetch level_code via SECURITY DEFINER RPC --
      // Backend enforces unlock status — locked codes are never returned regardless of REST access.
      // The direct REST campaign_levels endpoint is not used for codes.
      const unlockedCodes = {}
      const { data: codeRows } = await supabase
        .rpc('get_my_unlocked_level_codes', { p_campaign_id: id })
      for (const row of codeRows ?? []) unlockedCodes[row.level_id] = row.level_code

      setDetail({ campaign, levels, plMap, prog, unlockedCodes, rwMap })
    } catch (err) {
      console.error('[CampaignDetail] load error:', err?.message ?? err)
      setError('Unable to load this campaign.')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => { loadDetail() }, [loadDetail])

  // Event logging — portal_view_campaign is the valid allowlisted type for campaign views
  // Logged once per mount. No sensitive data in event.
  useEffect(() => {
    if (loggedRef.current) return
    loggedRef.current = true
    supabase.rpc('log_portal_event', { p_event_type: 'portal_view_campaign' }).then(() => {}, () => {})
  }, [])

  if (loading) return <SkeletonDetail />
  if (error)   return <ErrorState message={error} onRetry={loadDetail} onBack={() => navigate('/campaigns')} />
  if (!detail) return null

  const { campaign, levels, plMap, prog, unlockedCodes, rwMap } = detail

  // Derive current / next level from backend state (never from deposit amounts)
  let currentLevel = null
  let nextLevel    = null
  for (const lvl of levels) {
    const pl = plMap[lvl.id]
    if (pl && UNLOCKED_STATUSES.has(pl.status)) {
      currentLevel = lvl
    } else if (!nextLevel) {
      nextLevel = lvl
    }
  }
  const allCompleted = levels.length > 0 && !nextLevel

  // Visual-only progress values (never used for eligibility)
  const totalDep  = Number(prog.total_deposit ?? 0)
  const nextThresh = nextLevel ? Number(nextLevel.deposit_threshold) : null
  const overallTarget = Number(prog.deposit_target ?? 0)
  const progressTarget = nextThresh ?? overallTarget
  const progressPct    = calcPct(totalDep, progressTarget)
  const remaining      = Math.max(0, progressTarget - totalDep)

  const campaignStatus = (campaign.status ?? '').toLowerCase()

  return (
    <div style={styles.page}>
      {/* -- Back button -- */}
      <button onClick={() => navigate('/campaigns')} style={styles.backBtn}>
        <BackIcon />
        <span>Campaigns</span>
      </button>

      {/* -- Campaign Header -- */}
      <CampaignHeader campaign={campaign} />

      {/* -- Progress Hero -- */}
      <ProgressHero
        campaign={campaign}
        prog={prog}
        totalDep={totalDep}
        progressTarget={progressTarget}
        progressPct={progressPct}
        remaining={remaining}
        nextLevel={nextLevel}
        currentLevel={currentLevel}
        allCompleted={allCompleted}
        campaignStatus={campaignStatus}
      />

      {/* -- How to Join & Rules -- */}
      <CampaignGuide campaign={campaign} levels={levels} />

      {/* -- Next Milestone card -- */}
      {campaign.is_multi_level && nextLevel && campaignStatus === 'active' && (
        <NextMilestoneCard nextLevel={nextLevel} remaining={remaining} />
      )}

      {/* -- Level Journey -- */}
      {campaign.is_multi_level && levels.length > 0 && (
        <LevelJourney
          levels={levels}
          plMap={plMap}
          rwMap={rwMap}
          unlockedCodes={unlockedCodes}
          currentLevel={currentLevel}
        />
      )}

      {/* -- Campaign Information -- */}
      <CampaignInfo campaign={campaign} />
    </div>
  )
}

// -- Campaign Header -----------------------------------------------------------
function CampaignHeader({ campaign }) {
  const s = (campaign.status ?? '').toLowerCase()
  const cfg = STATUS_CFG[s] ?? STATUS_CFG.unknown
  const typeLabel = TYPE_LABELS[campaign.campaign_type] ?? campaign.campaign_type
  const catLabel  = campaign.campaign_category

  return (
    <div style={styles.headerCard}>
      <div style={styles.headerCardBar} />
      <div style={styles.headerCardBody}>
        {/* Festival label */}
        {campaign.festival && (
          <span style={styles.festivalTag}>{campaign.festival}</span>
        )}

        {/* Campaign name */}
        <h1 style={styles.campaignTitle}>{campaign.campaign_name}</h1>

        {/* Status + type/cat row */}
        <div style={styles.headerMeta}>
          <span style={{
            ...styles.statusChip,
            background: cfg.bg,
            color: cfg.color,
            border: `1px solid ${cfg.border}`,
          }}>
            {cfg.dot && <span style={{ ...styles.statusDot, background: cfg.color }} />}
            {cfg.label}
          </span>
          {typeLabel && <span style={styles.metaBadge}>{typeLabel}</span>}
          {catLabel  && <span style={styles.metaBadge}>{catLabel}</span>}
        </div>

        {/* Date range */}
        {(campaign.start_date || campaign.end_date) && (
          <div style={styles.dateRow}>
            <CalendarIcon />
            <span style={styles.dateText}>
              {fmtShortDate(campaign.start_date)}
              {campaign.end_date && ` — ${fmtShortDate(campaign.end_date)}`}
            </span>
            {campaign.end_date && <DaysRemaining endDate={campaign.end_date} status={s} />}
          </div>
        )}

      </div>
    </div>
  )
}

function DaysRemaining({ endDate, status }) {
  if (status !== 'active') return null
  const diff = Math.ceil((new Date(endDate) - new Date()) / 86_400_000)
  if (diff < 0)  return <span style={styles.daysExpired}>Ended</span>
  if (diff === 0) return <span style={styles.daysUrgent}>Today</span>
  if (diff <= 3)  return <span style={styles.daysUrgent}>{diff}d left</span>
  return <span style={styles.daysLeft}>{diff}d left</span>
}

// -- Progress Hero -------------------------------------------------------------
function ProgressHero({ campaign, prog, totalDep, progressTarget, progressPct, remaining, nextLevel, currentLevel, allCompleted, campaignStatus }) {
  const pct = Math.round(progressPct)

  if (campaignStatus === 'upcoming') {
    return (
      <div style={styles.heroCard}>
        <div style={styles.heroUpcoming}>
          <span style={styles.heroUpcomingIcon}><HourglassIcon /></span>
          <div>
            <div style={styles.heroUpcomingTitle}>Campaign Starting Soon</div>
            <div style={styles.heroUpcomingDesc}>
              Progress tracking will begin on {fmtDate(campaign.start_date)}.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (allCompleted) {
    return (
      <div style={styles.heroCard}>
        <div style={styles.heroCompletedWrap}>
          <div style={styles.heroCompletedIcon}><TrophyIcon /></div>
          <div style={styles.heroCompletedTitle}>Campaign Completed!</div>
          <div style={styles.heroCompletedSub}>You have unlocked all available levels.</div>
          <div style={{ ...styles.progressBarTrack, marginTop: '1rem' }}>
            <div style={{ ...styles.progressBarFill, width: '100%', animation: 'none' }} />
          </div>
          <div style={styles.pctLabel}>100% Complete</div>
        </div>
      </div>
    )
  }

  if (campaignStatus === 'ended') {
    return (
      <div style={{ ...styles.heroCard, opacity: 0.8 }}>
        <div style={styles.heroLabel}>FINAL DEPOSIT</div>
        <div style={styles.heroAmount}>{fmtRMFull(totalDep)}</div>
        <div style={{ ...styles.progressBarTrack, margin: '1rem 0 .5rem' }}>
          <div style={{ ...styles.progressBarFill, width: `${pct}%`, animation: 'none' }} />
        </div>
        <div style={styles.heroFooter}>
          <span style={styles.heroPct}>{pct}% reached</span>
          <span style={styles.heroEndedNote}>Campaign has ended</span>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.heroCard}>
      {/* Current deposit */}
      <div style={styles.heroLabel}>
        {currentLevel ? 'CURRENT DEPOSIT' : 'YOUR DEPOSIT'}
      </div>
      <div style={styles.heroAmount}>{fmtRMFull(totalDep)}</div>

      {/* Stats row */}
      {progressTarget > 0 && (
        <div style={styles.heroStats}>
          <div style={styles.heroStat}>
            <span style={styles.heroStatLabel}>NEXT TARGET</span>
            <span style={styles.heroStatValue}>{fmtRMFull(progressTarget)}</span>
          </div>
          <div style={styles.heroStatDiv} />
          <div style={styles.heroStat}>
            <span style={styles.heroStatLabel}>REMAINING</span>
            <span style={{ ...styles.heroStatValue, color: remaining > 0 ? 'var(--gold)' : 'var(--success)' }}>
              {remaining > 0 ? fmtRMFull(remaining) : '—'}
            </span>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div style={styles.progressBarTrack}>
        <div style={{ ...styles.progressBarFill, width: `${pct}%` }} />
      </div>
      <div style={styles.heroFooter}>
        <span style={styles.heroPct}>{pct}%</span>
        {nextLevel && (
          <span style={styles.heroNextLabel}>
            toward {nextLevel.level_name ?? `Level ${nextLevel.level_order}`}
          </span>
        )}
      </div>

      {/* You are here */}
      {currentLevel ? (
        <div style={styles.youAreHere}>
          <span style={styles.youAreHerePin}>📍</span>
          <span style={styles.youAreHereText}>
            You are at <strong>{currentLevel.level_name ?? `Level ${currentLevel.level_order}`}</strong>
          </span>
        </div>
      ) : totalDep === 0 ? (
        <div style={styles.startJourney}>
          <span>🚀</span>
          <span style={styles.startJourneyText}>Start your journey — make your first deposit to unlock rewards</span>
        </div>
      ) : null}
    </div>
  )
}

// -- Next Milestone Card -------------------------------------------------------
function NextMilestoneCard({ nextLevel, remaining }) {
  return (
    <div style={styles.milestoneCard}>
      <div style={styles.milestoneHeader}>
        <span style={styles.milestoneEyebrow}>NEXT UNLOCK</span>
        <span style={styles.milestoneLevelName}>
          {nextLevel.level_name ?? `Level ${nextLevel.level_order}`}
        </span>
      </div>
      <div style={styles.milestoneBody}>
        <div style={styles.milestoneStat}>
          <span style={styles.milestoneStatLabel}>Deposit Target</span>
          <span style={styles.milestoneStatValue}>{fmtRMFull(nextLevel.deposit_threshold)}</span>
        </div>
        <div style={styles.milestoneStatDiv} />
        <div style={styles.milestoneStat}>
          <span style={styles.milestoneStatLabel}>Remaining</span>
          <span style={{ ...styles.milestoneStatValue, color: 'var(--gold)' }}>
            {fmtRMFull(remaining)}
          </span>
        </div>
        <div style={styles.milestoneStatDiv} />
        <div style={styles.milestoneStat}>
          <span style={styles.milestoneStatLabel}>Reward</span>
          <span style={styles.milestoneStatValue}>{fmtRM(nextLevel.reward_amount)}</span>
        </div>
      </div>
      <div style={styles.milestoneCodeHidden}>
        <LockSmallIcon />
        <span>Reward code hidden until unlocked</span>
      </div>
    </div>
  )
}

// -- Level Journey -------------------------------------------------------------
function LevelJourney({ levels, plMap, rwMap, unlockedCodes, currentLevel }) {
  return (
    <div style={styles.journeyWrap}>
      <div style={styles.journeyHeader}>
        <TierIcon />
        <span style={styles.journeySectionTitle}>Level Journey</span>
      </div>

      {/* START node */}
      <div style={styles.journeyStartNode}>
        <div style={styles.journeyNodeCircleStart}><StartDotIcon /></div>
        <div style={styles.journeyNodeLabel}>START</div>
        <div style={styles.journeyConnector} />
      </div>

      {/* Level nodes */}
      {levels.map((lvl, idx) => {
        const pl     = plMap[lvl.id]
        const rw     = rwMap[lvl.id]
        const isLast = idx === levels.length - 1

        // State from backend only
        const plStatus = pl?.status ?? null
        const isUnlocked = pl && UNLOCKED_STATUSES.has(plStatus)
        const isCurrent  = currentLevel?.id === lvl.id
        const code       = isUnlocked ? (unlockedCodes[lvl.id] ?? null) : null

        return (
          <LevelCard
            key={lvl.id}
            level={lvl}
            plStatus={plStatus}
            isUnlocked={isUnlocked}
            isCurrent={isCurrent}
            code={code}
            reward={rw}
            isLast={isLast}
          />
        )
      })}

      {/* COMPLETED node */}
      <div style={styles.journeyEndNode}>
        <div style={styles.journeyConnectorEnd} />
        <div style={styles.journeyNodeCircleEnd}><TrophySmallIcon /></div>
        <div style={styles.journeyNodeLabelEnd}>COMPLETED</div>
      </div>
    </div>
  )
}

function LevelCard({ level, plStatus, isUnlocked, isCurrent, code, reward, isLast }) {
  const orderLabel = `Level ${level.level_order}`
  const displayName = level.level_name ?? orderLabel

  // Visual state config (from backend status only)
  const stateCfg = isUnlocked
    ? (plStatus === 'claimed' || plStatus === 'paid' || plStatus === 'issued'
        ? LEVEL_STATE.claimed
        : LEVEL_STATE.unlocked)
    : (plStatus === 'in_progress'
        ? LEVEL_STATE.inProgress
        : LEVEL_STATE.locked)

  return (
    <div style={{ position: 'relative' }}>
      {/* Connector line from previous */}
      <div style={styles.journeyConnector} />

      <div style={{
        ...styles.levelCard,
        ...(isUnlocked ? styles.levelCardUnlocked : {}),
        ...(isCurrent  ? styles.levelCardCurrent  : {}),
      }}>
        {/* Level header row */}
        <div style={styles.levelCardHeader}>
          <div style={styles.levelCircle}>
            <div style={{
              ...styles.levelCircleInner,
              background: stateCfg.circleBg,
              border: `2px solid ${stateCfg.circleBorder}`,
              color: stateCfg.circleColor,
            }}>
              {stateCfg.icon}
            </div>
          </div>
          <div style={styles.levelMeta}>
            <div style={styles.levelOrderTag}>{orderLabel}</div>
            <div style={{ ...styles.levelName, color: isUnlocked ? 'var(--text)' : 'var(--muted)' }}>
              {displayName}
            </div>
          </div>
          <div style={{
            ...styles.levelStateBadge,
            background: stateCfg.badgeBg,
            color: stateCfg.badgeColor,
            border: `1px solid ${stateCfg.badgeBorder}`,
          }}>
            {stateCfg.label}
          </div>
        </div>

        {/* Level body */}
        <div style={styles.levelBody}>
          {/* Deposit threshold */}
          <div style={styles.levelRow}>
            <span style={styles.levelRowLabel}>Deposit Target</span>
            <span style={styles.levelRowValue}>{fmtRMFull(level.deposit_threshold)}</span>
          </div>

          {/* Reward */}
          <div style={styles.levelRow}>
            <span style={styles.levelRowLabel}>Reward</span>
            <span style={{ ...styles.levelRowValue, color: isUnlocked ? 'var(--gold)' : 'var(--text-2)' }}>
              {fmtRM(level.reward_amount)}
              {level.reward_type && (
                <span style={styles.rewardTypeTag}>{level.reward_type}</span>
              )}
            </span>
          </div>

          {level.description && (
            <div style={styles.levelDescription}>
              {level.description}
            </div>
          )}

          {/* Code — shown ONLY when backend says unlocked */}
          <div style={styles.levelRow}>
            <span style={styles.levelRowLabel}>Code</span>
            {isUnlocked && code ? (
              <span style={styles.codeChip}>
                <span style={styles.codeDot} />
                {code}
              </span>
            ) : isUnlocked && !code ? (
              <span style={styles.levelRowMuted}>—</span>
            ) : (
              <span style={styles.codeLocked}>
                <LockTinyIcon />
                Hidden until unlocked
              </span>
            )}
          </div>

          {/* Unlock date (only if unlocked) */}
          {plStatus && UNLOCKED_STATUSES.has(plStatus) && (
            <div style={styles.levelRow}>
              <span style={styles.levelRowLabel}>Unlocked</span>
              <span style={styles.levelRowValue}>{fmtDatetime(plMap_unlocked(plStatus))}</span>
            </div>
          )}

          {/* Reward payout status (from campaign_rewards) */}
          {reward && (
            <div style={styles.rewardStatusRow}>
              <span style={styles.levelRowLabel}>Payout</span>
              <span style={{
                ...styles.payoutChip,
                ...PAYOUT_CFG[reward.status]?.style ?? {},
              }}>
                {PAYOUT_CFG[reward.status]?.label ?? reward.status}
                {reward.paid_at && ` — ${fmtDatetime(reward.paid_at)}`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper: since we lost direct plMap access inside LevelCard, we show unlock date from prop-drilled data
// The LevelJourney passes plStatus; unlock date is passed through isUnlocked + reward context
// For simplicity we show the reward.approved_at or reward.paid_at if available, otherwise omit date
// This avoids prop-drilling unlocked_at all the way down
function plMap_unlocked() { return null }  // placeholder — date shown via reward.paid_at instead

// -- How to Join & Rules ---------------------------------------------------------
function CampaignGuide({ campaign, levels }) {
  const { steps, rules } = buildCampaignGuide({ campaign, levels })
  const [open, setOpen] = useState(true)

  return (
    <div style={styles.guideCard}>
      <button type="button" onClick={() => setOpen(v => !v)} style={styles.guideHeader}>
        <span style={styles.guideHeaderLeft}>
          <span style={styles.guideIcon}>ℹ</span>
          <span style={styles.guideTitle}>How to Join & Rules</span>
        </span>
        <span style={styles.guideToggle}>{open ? 'Hide' : 'View'}</span>
      </button>

      {open && (
        <div style={styles.guideBody}>
          <div style={styles.guideSectionTitle}>How it works</div>
          <div style={styles.guideSteps}>
            {steps.map((step, index) => (
              <div key={step} style={styles.guideStep}>
                <div style={styles.guideStepNumber}>{index + 1}</div>
                <div style={styles.guideStepText}>{step}</div>
              </div>
            ))}
          </div>

          <div style={styles.guideSectionTitle}>Rules & Regulations</div>
          {rules ? (
            <div style={styles.guideRules}>{rules}</div>
          ) : (
            <div style={styles.guideEmptyRules}>Campaign-specific rules will appear here when configured by the CRM.</div>
          )}
        </div>
      )}
    </div>
  )
}

// -- Campaign Information ------------------------------------------------------
function CampaignInfo({ campaign }) {
  const typeLabel = TYPE_LABELS[campaign.campaign_type] ?? campaign.campaign_type
  const catLabel  = campaign.campaign_category

  if (!typeLabel && !catLabel && !campaign.start_date && !campaign.end_date && !(campaign.is_multi_level && campaign.max_levels)) return null

  return (
    <div style={styles.infoCard}>
      <div style={styles.infoHeader}>
        <InfoIcon />
        <span style={styles.infoTitle}>Campaign Details</span>
      </div>
      <div style={styles.infoBody}>
        {(typeLabel || catLabel) && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Type</span>
            <span style={styles.infoValue}>{[typeLabel, catLabel].filter(Boolean).join(' — ')}</span>
          </div>
        )}
        {campaign.start_date && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Start</span>
            <span style={styles.infoValue}>{fmtDate(campaign.start_date)}</span>
          </div>
        )}
        {campaign.end_date && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>End</span>
            <span style={styles.infoValue}>{fmtDate(campaign.end_date)}</span>
          </div>
        )}
        {campaign.is_multi_level && campaign.max_levels && (
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Levels</span>
            <span style={styles.infoValue}>{campaign.max_levels} levels available</span>
          </div>
        )}
      </div>
    </div>
  )
}

// -- Skeleton Detail -----------------------------------------------------------
function SkeletonDetail() {
  return (
    <div style={styles.page}>
      <div style={{ ...styles.skel, width: 80, height: 32, borderRadius: 8, marginBottom: '1rem' }} />
      <div style={{ ...styles.skeletonCard, marginBottom: '1rem' }}>
        <div style={{ ...styles.skel, width: '30%', height: 14, marginBottom: 10 }} />
        <div style={{ ...styles.skel, width: '70%', height: 26, marginBottom: 12 }} />
        <div style={{ ...styles.skel, width: '50%', height: 18, marginBottom: 10 }} />
        <div style={{ ...styles.skel, width: '40%', height: 14 }} />
      </div>
      <div style={{ ...styles.skeletonCard, marginBottom: '1rem' }}>
        <div style={{ ...styles.skel, width: '25%', height: 12, marginBottom: 8 }} />
        <div style={{ ...styles.skel, width: '55%', height: 38, marginBottom: 16 }} />
        <div style={{ ...styles.skel, width: '100%', height: 12, borderRadius: 6, marginBottom: 8 }} />
        <div style={{ ...styles.skel, width: '40%', height: 12 }} />
      </div>
      <div style={styles.skeletonCard}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ marginBottom: i < 3 ? '1.25rem' : 0 }}>
            <div style={{ ...styles.skel, width: '80%', height: 16, marginBottom: 8 }} />
            <div style={{ ...styles.skel, width: '60%', height: 12 }} />
          </div>
        ))}
      </div>
      <style>{detailAnim}</style>
    </div>
  )
}

// -- Error State ---------------------------------------------------------------
function ErrorState({ message, onRetry, onBack }) {
  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.backBtn}>
        <BackIcon />
        <span>Campaigns</span>
      </button>
      <div style={styles.errorWrap}>
        <div style={styles.errorIcon}><AlertCircleIcon /></div>
        <p style={styles.errorMsg}>{message}</p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button onClick={onBack}  style={styles.secondaryBtn}>Back to Campaigns</button>
          <button onClick={onRetry} style={styles.retryBtn}>Try Again</button>
        </div>
      </div>
    </div>
  )
}

// -- Config --------------------------------------------------------------------
const STATUS_CFG = {
  active:   { label: 'Active',   dot: true,  color: '#22c55e', bg: 'rgba(34,197,94,.12)',  border: 'rgba(34,197,94,.25)'  },
  upcoming: { label: 'Upcoming', dot: false, color: '#60a5fa', bg: 'rgba(96,165,250,.12)', border: 'rgba(96,165,250,.25)' },
  ended:    { label: 'Ended',    dot: false, color: 'var(--dim)', bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.08)' },
  unknown:  { label: 'Unknown',  dot: false, color: 'var(--dim)', bg: 'rgba(255,255,255,.04)', border: 'rgba(255,255,255,.08)' },
}

const LEVEL_STATE = {
  locked:     { label: 'Locked',      circleBg: 'var(--surface2)', circleBorder: 'var(--border)',          circleColor: 'var(--dim)',     icon: <LockIcon2 />, badgeBg: 'var(--surface2)',          badgeColor: 'var(--dim)',  badgeBorder: 'var(--border)'          },
  inProgress: { label: 'In Progress', circleBg: 'var(--gold-dim)', circleBorder: 'var(--gold)',             circleColor: 'var(--gold)',    icon: <PlayIcon />,  badgeBg: 'var(--gold-dim)',          badgeColor: 'var(--gold)', badgeBorder: 'rgba(201,166,72,.4)'     },
  unlocked:   { label: 'Unlocked',    circleBg: 'rgba(34,197,94,.12)', circleBorder: 'rgba(34,197,94,.3)', circleColor: '#22c55e',        icon: <CheckIcon />, badgeBg: 'rgba(34,197,94,.1)',       badgeColor: '#22c55e',     badgeBorder: 'rgba(34,197,94,.25)'    },
  claimed:    { label: 'Issued',      circleBg: 'rgba(34,197,94,.08)', circleBorder: 'rgba(34,197,94,.2)', circleColor: '#86efac',        icon: <CheckIcon />, badgeBg: 'rgba(34,197,94,.06)',      badgeColor: '#86efac',     badgeBorder: 'rgba(34,197,94,.15)'    },
}

const PAYOUT_CFG = {
  pending:  { label: 'Pending',  style: { background: 'rgba(250,204,21,.1)', color: '#fbbf24', border: '1px solid rgba(250,204,21,.25)' } },
  approved: { label: 'Approved', style: { background: 'rgba(96,165,250,.1)', color: '#60a5fa', border: '1px solid rgba(96,165,250,.25)' } },
  paid:     { label: 'Paid',     style: { background: 'rgba(34,197,94,.1)',  color: '#22c55e', border: '1px solid rgba(34,197,94,.25)'  } },
  rejected: { label: 'Rejected', style: { background: 'rgba(239,68,68,.1)', color: '#f87171', border: '1px solid rgba(239,68,68,.25)'  } },
}

const TYPE_LABELS = {
  deposit: 'Deposit', leaderboard: 'Leaderboard', bet: 'Bet',
  referral: 'Referral', cashback: 'Cashback', bonus: 'Bonus',
}

// -- Styles --------------------------------------------------------------------
const styles = {
  page: {
    minHeight: '100%',
    padding: '1.25rem 1rem 5rem',
    maxWidth: 560,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  // Back button
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.4rem',
    background: 'none',
    border: 'none',
    color: 'var(--gold)',
    fontSize: '.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    padding: '.4rem 0',
    letterSpacing: '.02em',
    minHeight: 44,
    alignSelf: 'flex-start',
  },

  // Campaign Header Card
  headerCard: {
    background: 'var(--card)',
    border: '1px solid rgba(201,166,72,.2)',
    borderRadius: 'var(--rl)',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,.3), 0 0 0 1px rgba(201,166,72,.08)',
  },
  headerCardBar: {
    height: '3px',
    background: 'linear-gradient(90deg, transparent 0%, var(--gold) 40%, var(--gold-2) 60%, transparent 100%)',
  },
  headerCardBody: {
    padding: '1.25rem',
  },
  festivalTag: {
    display: 'inline-block',
    fontSize: '.7rem',
    fontWeight: 700,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
    color: 'var(--gold)',
    background: 'var(--gold-dim)',
    padding: '.2rem .65rem',
    borderRadius: '20px',
    border: '1px solid rgba(201,166,72,.2)',
    marginBottom: '.5rem',
  },
  campaignTitle: {
    fontSize: '1.25rem',
    fontWeight: 800,
    color: 'var(--text)',
    letterSpacing: '-.02em',
    margin: '0 0 .75rem',
    lineHeight: 1.2,
  },
  headerMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '.4rem',
    marginBottom: '.75rem',
    alignItems: 'center',
  },
  statusChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '.3rem',
    padding: '.2rem .6rem',
    borderRadius: '20px',
    fontSize: '.72rem',
    fontWeight: 700,
    letterSpacing: '.04em',
  },
  statusDot: {
    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
    animation: 'detailPulse 2s ease-in-out infinite',
  },
  metaBadge: {
    fontSize: '.7rem',
    fontWeight: 600,
    padding: '.2rem .55rem',
    borderRadius: '6px',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
  },
  dateRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '.4rem',
    marginBottom: '.75rem',
    flexWrap: 'wrap',
  },
  dateText: { fontSize: '.8rem', color: 'var(--muted)' },
  daysLeft:    { fontSize: '.72rem', fontWeight: 700, color: '#60a5fa',  background: 'rgba(96,165,250,.1)',  padding: '.15rem .5rem', borderRadius: '20px' },
  daysUrgent:  { fontSize: '.72rem', fontWeight: 700, color: '#fb923c',  background: 'rgba(251,146,60,.1)',  padding: '.15rem .5rem', borderRadius: '20px' },
  daysExpired: { fontSize: '.72rem', fontWeight: 700, color: 'var(--dim)', background: 'var(--surface2)', padding: '.15rem .5rem', borderRadius: '20px' },
  offerDesc: {
    fontSize: '.875rem',
    color: 'var(--text-2)',
    lineHeight: 1.6,
    margin: 0,
    borderTop: '1px solid var(--border)',
    paddingTop: '.75rem',
    marginTop: '.25rem',
  },

  // Hero Card
  heroCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--rl)',
    padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(0,0,0,.25)',
  },
  heroLabel: { fontSize: '.72rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--dim)', marginBottom: '.35rem' },
  heroAmount: { fontSize: '2rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-.02em', lineHeight: 1.1, marginBottom: '.75rem' },
  heroStats: {
    display: 'flex',
    gap: '.75rem',
    marginBottom: '1rem',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '.75rem',
  },
  heroStat: { flex: 1, display: 'flex', flexDirection: 'column', gap: '.25rem' },
  heroStatLabel: { fontSize: '.65rem', fontWeight: 700, letterSpacing: '.08em', color: 'var(--dim)' },
  heroStatValue: { fontSize: '.95rem', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  heroStatDiv: { width: 1, background: 'var(--border)', alignSelf: 'stretch' },

  // Progress bar
  progressBarTrack: {
    height: 8,
    background: 'var(--surface2)',
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--gold) 0%, var(--gold-2) 100%)',
    borderRadius: 4,
    transition: 'width .6s ease',
    animation: 'detailProgressGrow .8s ease forwards',
  },

  heroFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '.5rem',
  },
  heroPct: { fontSize: '.85rem', fontWeight: 700, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' },
  heroNextLabel: { fontSize: '.78rem', color: 'var(--muted)' },
  heroEndedNote: { fontSize: '.78rem', color: 'var(--dim)' },

  youAreHere: {
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    marginTop: '1rem',
    padding: '.65rem .875rem',
    background: 'var(--gold-dim)',
    border: '1px solid rgba(201,166,72,.2)',
    borderRadius: '8px',
    fontSize: '.82rem',
    color: 'var(--text-2)',
  },
  youAreHerePin: { fontSize: '1rem' },
  youAreHereText: { color: 'var(--text-2)' },

  startJourney: {
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    marginTop: '1rem',
    padding: '.65rem .875rem',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '.82rem',
  },
  startJourneyText: { color: 'var(--muted)', lineHeight: 1.4 },

  // Upcoming / Completed hero states
  heroUpcoming: { display: 'flex', alignItems: 'center', gap: '.875rem' },
  heroUpcomingIcon: { fontSize: '2rem', lineHeight: 1 },
  heroUpcomingTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.25rem' },
  heroUpcomingDesc: { fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.5 },
  heroCompletedWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '.5rem', padding: '.5rem 0' },
  heroCompletedIcon: { fontSize: '2.5rem', lineHeight: 1 },
  heroCompletedTitle: { fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' },
  heroCompletedSub: { fontSize: '.85rem', color: 'var(--muted)' },
  pctLabel: { fontSize: '.78rem', fontWeight: 700, color: 'var(--gold)', marginTop: '.5rem' },

  // Milestone card
  milestoneCard: {
    background: 'var(--card)',
    border: '1px solid rgba(201,166,72,.2)',
    borderRadius: 'var(--rl)',
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(0,0,0,.2)',
  },
  milestoneHeader: {
    padding: '.875rem 1.25rem .75rem',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  milestoneEyebrow: { fontSize: '.68rem', fontWeight: 800, letterSpacing: '.12em', color: 'var(--gold)' },
  milestoneLevelName: { fontSize: '.85rem', fontWeight: 700, color: 'var(--text)' },
  milestoneBody: { display: 'flex', padding: '1rem 1.25rem', gap: '.75rem', alignItems: 'center' },
  milestoneStat: { flex: 1, display: 'flex', flexDirection: 'column', gap: '.2rem' },
  milestoneStatLabel: { fontSize: '.65rem', fontWeight: 700, letterSpacing: '.06em', color: 'var(--dim)', textTransform: 'uppercase' },
  milestoneStatValue: { fontSize: '.95rem', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' },
  milestoneStatDiv: { width: 1, height: 36, background: 'var(--border)' },
  milestoneCodeHidden: {
    display: 'flex',
    alignItems: 'center',
    gap: '.4rem',
    padding: '.6rem 1.25rem',
    background: 'var(--surface2)',
    borderTop: '1px solid var(--border)',
    color: 'var(--dim)',
    fontSize: '.75rem',
  },

  // Level Journey
  journeyWrap: { display: 'flex', flexDirection: 'column' },
  journeyHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    color: 'var(--gold)',
    marginBottom: '.75rem',
    paddingLeft: '.25rem',
  },
  journeySectionTitle: { fontSize: '.85rem', fontWeight: 700, letterSpacing: '.04em', color: 'var(--text-2)' },

  journeyStartNode: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '.25rem', paddingLeft: '.5rem', marginBottom: 0 },
  journeyNodeCircleStart: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--surface2)', border: '2px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)',
  },
  journeyNodeLabel: { fontSize: '.65rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--dim)', paddingLeft: 2 },

  journeyConnector: {
    width: 2, height: 24,
    background: 'linear-gradient(to bottom, var(--border), var(--border))',
    marginLeft: 13,
    flexShrink: 0,
  },

  journeyEndNode: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingLeft: '.5rem' },
  journeyConnectorEnd: { width: 2, height: 24, background: 'var(--border)', marginLeft: 13 },
  journeyNodeCircleEnd: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--gold-dim)', border: '1px solid rgba(201,166,72,.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gold)',
  },
  journeyNodeLabelEnd: { fontSize: '.65rem', fontWeight: 700, letterSpacing: '.1em', color: 'var(--gold)', opacity: .7, paddingLeft: 2, marginTop: '.25rem' },

  // Level Card
  levelCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--rl)',
    overflow: 'hidden',
    marginLeft: 0,
  },
  levelCardUnlocked: {
    border: '1px solid rgba(34,197,94,.2)',
    boxShadow: '0 0 0 1px rgba(34,197,94,.06)',
  },
  levelCardCurrent: {
    border: '1px solid rgba(201,166,72,.3)',
    boxShadow: '0 0 0 1px rgba(201,166,72,.08)',
  },
  levelCardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '.75rem',
    padding: '1rem 1rem .75rem',
    borderBottom: '1px solid var(--border)',
  },
  levelCircle: { flexShrink: 0 },
  levelCircleInner: {
    width: 36, height: 36, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  levelMeta: { flex: 1, minWidth: 0 },
  levelOrderTag: { fontSize: '.65rem', fontWeight: 700, letterSpacing: '.08em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '.15rem' },
  levelName: { fontSize: '.95rem', fontWeight: 700, lineHeight: 1.2 },
  levelStateBadge: {
    flexShrink: 0,
    fontSize: '.68rem', fontWeight: 700, letterSpacing: '.04em',
    padding: '.2rem .55rem', borderRadius: '20px',
  },
  levelBody: { padding: '.875rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '.65rem' },
  levelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' },
  levelRowLabel: { fontSize: '.78rem', color: 'var(--dim)' },
  levelRowValue: { fontSize: '.85rem', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: '.4rem' },
  levelRowMuted: { fontSize: '.85rem', color: 'var(--dim)' },
  rewardTypeTag: { fontSize: '.68rem', fontWeight: 600, padding: '.1rem .4rem', borderRadius: '4px', background: 'var(--surface2)', color: 'var(--dim)', border: '1px solid var(--border)' },

  codeChip: {
    display: 'inline-flex', alignItems: 'center', gap: '.35rem',
    padding: '.2rem .7rem', borderRadius: '6px',
    background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)',
    color: '#22c55e', fontSize: '.85rem', fontWeight: 800, letterSpacing: '.06em', fontFamily: 'monospace',
  },
  codeDot: { width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0 },
  codeLocked: {
    display: 'inline-flex', alignItems: 'center', gap: '.3rem',
    fontSize: '.78rem', color: 'var(--dim)',
  },

  rewardStatusRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' },
  payoutChip: {
    fontSize: '.72rem', fontWeight: 700, letterSpacing: '.03em',
    padding: '.2rem .6rem', borderRadius: '20px',
  },

  // How to Join & Rules card
  guideCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 'var(--rl)', overflow: 'hidden', marginBottom: '1rem',
  },
  guideHeader: {
    width: '100%', border: 0, background: 'transparent', color: 'var(--text-2)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '.9rem 1.25rem', cursor: 'pointer', textAlign: 'left',
  },
  guideHeaderLeft: { display: 'flex', alignItems: 'center', gap: '.6rem' },
  guideIcon: {
    width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(255,166,0,.1)', color: 'var(--gold)', border: '1px solid rgba(255,166,0,.2)', fontWeight: 800,
  },
  guideTitle: { fontSize: '.9rem', fontWeight: 800 },
  guideToggle: { fontSize: '.72rem', color: 'var(--gold)', fontWeight: 700 },
  guideBody: { borderTop: '1px solid var(--border)', padding: '1rem 1.25rem 1.2rem' },
  guideSectionTitle: { fontSize: '.76rem', color: 'var(--gold)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.7rem' },
  guideSteps: { display: 'flex', flexDirection: 'column', gap: '.7rem', marginBottom: '1.2rem' },
  guideStep: { display: 'flex', alignItems: 'flex-start', gap: '.7rem' },
  guideStepNumber: {
    width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--gold)', fontSize: '.72rem', fontWeight: 800,
  },
  guideStepText: { color: 'var(--text-2)', fontSize: '.82rem', lineHeight: 1.55, paddingTop: '.05rem' },
  guideRules: {
    whiteSpace: 'pre-line', color: 'var(--text-2)', fontSize: '.82rem', lineHeight: 1.65,
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: '.85rem .9rem',
  },
  guideEmptyRules: {
    color: 'var(--muted)', fontSize: '.8rem', lineHeight: 1.55, background: 'var(--surface2)',
    border: '1px dashed var(--border)', borderRadius: 9, padding: '.85rem .9rem',
  },
  levelDescription: {
    margin: '.1rem 0 .8rem', padding: '.65rem .75rem', borderRadius: 8,
    background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-2)',
    fontSize: '.75rem', lineHeight: 1.5,
  },

  // Campaign Info card
  infoCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--rl)',
    overflow: 'hidden',
  },
  infoHeader: {
    display: 'flex', alignItems: 'center', gap: '.5rem',
    padding: '.875rem 1.25rem',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-2)',
  },
  infoTitle: { fontSize: '.85rem', fontWeight: 700 },
  infoBody: { padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '.75rem' },
  infoRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.75rem' },
  infoLabel: { fontSize: '.75rem', color: 'var(--dim)', flexShrink: 0, paddingTop: '.05rem' },
  infoValue: { fontSize: '.85rem', color: 'var(--text-2)', textAlign: 'right' },

  // Skeleton
  skeletonCard: {
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 'var(--rl)', padding: '1.25rem',
  },
  skel: {
    background: 'linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%)',
    backgroundSize: '200% 100%',
    animation: 'detailSkel 1.4s ease infinite',
    borderRadius: 6,
  },

  // Error
  errorWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', padding: '2.5rem 1.5rem', gap: '1rem',
  },
  errorIcon: {
    width: 56, height: 56, borderRadius: '50%',
    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444',
  },
  errorMsg: { fontSize: '.95rem', color: 'var(--muted)', margin: 0 },
  retryBtn: {
    padding: '.65rem 1.5rem', background: 'var(--gold)', color: '#0b0f1a',
    border: 'none', borderRadius: '8px', fontSize: '.85rem', fontWeight: 800,
    cursor: 'pointer', letterSpacing: '.05em', minHeight: 44,
  },
  secondaryBtn: {
    padding: '.65rem 1.25rem', background: 'var(--surface2)', color: 'var(--text-2)',
    border: '1px solid var(--border)', borderRadius: '8px', fontSize: '.85rem',
    fontWeight: 600, cursor: 'pointer', minHeight: 44,
  },
}

// -- Animations ----------------------------------------------------------------
const detailAnim = `
@keyframes detailSkel {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@keyframes detailPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: .4; }
}
@keyframes detailProgressGrow {
  from { width: 0%; }
}
`
if (typeof document !== 'undefined' && !document.getElementById('detail-anim-style')) {
  const s = document.createElement('style')
  s.id = 'detail-anim-style'
  s.textContent = detailAnim
  document.head.appendChild(s)
}

// -- Icons ---------------------------------------------------------------------
function BackIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function CalendarIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function TierIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
}
function TrophyIcon()      { return <span style={{ fontSize: '2.5rem' }}>🏆</span> }
function HourglassIcon()   { return <span>⏳</span> }
function TrophySmallIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg> }
function StartDotIcon()    { return <svg width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg> }
function LockIcon2()       { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> }
function LockSmallIcon()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> }
function LockTinyIcon()    { return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> }
function CheckIcon()       { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> }
function PlayIcon()        { return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> }
function AlertCircleIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function InfoIcon()        { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> }

