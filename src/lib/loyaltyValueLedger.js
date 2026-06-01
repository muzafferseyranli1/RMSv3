import { db } from '@/lib/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const POINTS_ACTIONS = new Set(['bonus_points', 'points_percent_of_order', 'points_earn_multiplier', 'points_redeem_multiplier'])
const FREQUENCY_PROGRAM_FAMILIES = new Set(['frequency', 'mixed'])

function roundPoints(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toUuidOrNull(value) {
  const text = normalizeText(value)
  return UUID_PATTERN.test(text) ? text : null
}

function parseJsonValue(value, fallback = null) {
  if (!value) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeInteger(value, fallback = 0) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getCustomerId(customer = {}, saleHeader = {}) {
  return toUuidOrNull(
    customer.id
    || customer.customerId
    || saleHeader.customer_id
    || saleHeader.customerId
  )
}

function getCustomerName(customer = {}, saleHeader = {}) {
  return normalizeText(
    customer.name
    || customer.customerName
    || saleHeader.customer_name
    || saleHeader.customerName
  )
}

function getSaleAmount(saleHeader = {}) {
  return roundPoints(
    saleHeader.gross_total_after_discount
    ?? saleHeader.payment_total
    ?? saleHeader.net_total_after_discount
    ?? 0
  )
}

function getCampaignId(loyaltyCampaign = {}, customer = {}, saleHeader = {}) {
  return normalizeText(
    loyaltyCampaign.campaignId
    || loyaltyCampaign.id
    || customer.selectedCampaignId
    || saleHeader.loyalty_campaign_id
  )
}

function getSelectedCouponCode(explicitCode, customer = {}) {
  return normalizeText(explicitCode || customer.selectedCouponCode).toUpperCase()
}

function resolveCouponCharset(charset) {
  const normalized = normalizeText(charset).toLowerCase()
  if (!normalized || normalized === 'numeric' || normalized === 'number' || normalized === 'digits') {
    return '0123456789'
  }
  if (normalized === 'alpha' || normalized === 'letters') {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  }
  if (normalized === 'alphanumeric' || normalized === 'alpha_numeric' || normalized === 'letters_digits') {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  }
  return String(charset)
}

function resolveCouponExpiresAt(series = {}) {
  const validUntil = normalizeText(series.valid_until)
  if (validUntil) return validUntil

  const expiresInDays = normalizeInteger(series.expires_in_days, 0)
  if (expiresInDays <= 0) return null

  const expiresAt = new Date()
  expiresAt.setUTCDate(expiresAt.getUTCDate() + expiresInDays)
  return expiresAt.toISOString()
}

function buildCouponCodeCandidate(series = {}) {
  const prefix = normalizeText(series.prefix).toUpperCase()
  const randomLength = Math.max(1, normalizeInteger(series.random_length, 6))
  const charset = resolveCouponCharset(series.charset || 'numeric')

  let randomPart = ''
  for (let i = 0; i < randomLength; i += 1) {
    randomPart += charset.charAt(Math.floor(Math.random() * charset.length))
  }

  return `${prefix}${randomPart}`.toUpperCase()
}

function buildStampCycleSourceRefId({ customerId, campaignId, cycleNo }) {
  return `stamp_cycle:${campaignId}:${customerId}:${cycleNo}`
}

function normalizeCycleList(value) {
  const source = Array.isArray(value) ? value : []
  return [...new Set(source.map(item => normalizeInteger(item, 0)).filter(item => item > 0))].sort((a, b) => a - b)
}

function buildActionEntries(rule = null, loyaltyCampaign = {}) {
  const entries = []
  const pushAction = (actionType, actionConfig = {}, source = 'unknown') => {
    const normalizedType = normalizeText(actionType)
    if (!normalizedType) return
    entries.push({
      actionType: normalizedType,
      actionConfig: parseJsonValue(actionConfig, {}) || {},
      source,
    })
  }

  if (rule) {
    const actionConfig = parseJsonValue(rule.action_json || rule.actionConfig, {}) || {}
    pushAction(rule.action_type || rule.actionType, actionConfig, 'rule')
    const additionalActions = Array.isArray(actionConfig.additionalActions) ? actionConfig.additionalActions : []
    additionalActions.forEach(action => {
      pushAction(action.actionType || action.action_type, action.actionConfig || action.action_json || {}, 'rule.additional')
    })
  }

  pushAction(loyaltyCampaign.actionType, {
    points: loyaltyCampaign.points,
    percent: loyaltyCampaign.discountType === 'percent' ? loyaltyCampaign.discountValue : loyaltyCampaign.percent,
    multiplier: loyaltyCampaign.multiplier,
    usedPoints: loyaltyCampaign.usedPoints || loyaltyCampaign.redemptionContext?.usedPoints,
    redemptionRate: loyaltyCampaign.redemptionRate || loyaltyCampaign.redemptionContext?.redemptionRate,
    discountAmount: loyaltyCampaign.discountAmount || loyaltyCampaign.redemptionContext?.discountAmount,
    redemptionContext: loyaltyCampaign.redemptionContext || null,
  }, 'snapshot')

  return entries
}

function resolvePointsDelta(action = {}, saleAmount = 0, campaign = {}, decisionContext = null, basePoints = 0) {
  const config = action.actionConfig || {}
  switch (action.actionType) {
    case 'bonus_points':
      return roundPoints(config.points || campaign.reward_value || campaign.rewardValue || 0)
    case 'points_percent_of_order':
      return roundPoints(saleAmount * Number(config.percent || campaign.reward_value || campaign.rewardValue || 0) / 100)
    case 'points_earn_multiplier': {
      const combinedEarnMultiplier = Number(decisionContext?.combinedEarnMultiplier || config.multiplier || 1)
      if (basePoints <= 0) return 0
      return roundPoints(basePoints * (combinedEarnMultiplier - 1))
    }
    case 'points_redeem_multiplier': {
      const combinedRedeemMultiplier = Number(decisionContext?.combinedRedeemMultiplier || config.multiplier || config.redemptionContext?.multiplier || 1)
      const explicitUsedPoints = roundPoints(config.usedPoints || config.redemptionContext?.usedPoints || 0)
      if (explicitUsedPoints > 0) return -explicitUsedPoints

      const discountAmount = Number(config.discountAmount || config.redemptionContext?.discountAmount || 0)
      const redemptionRate = Number(config.redemptionRate || config.redemptionContext?.redemptionRate || 0)
      const pointValue = redemptionRate * combinedRedeemMultiplier
      if (discountAmount > 0 && pointValue > 0) return -roundPoints(discountAmount / pointValue)
      return 0
    }
    default:
      return 0
  }
}

/**
 * Reads existing burn transaction for a sale (for idempotent backfill targeting).
 * Returns the first transaction where transaction_type = 'burn'.
 * Returns null if no burn transaction exists yet.
 */
async function readExistingSaleBurnTransaction(customerId, saleId) {
  const { data, error } = await db
    .from('loyalty_transactions')
    .select('id,source_ref_id,wallet_id,campaign_id,transaction_type,points_delta')
    .eq('customer_id', customerId)
    .eq('source_ref_id', saleId)
    .eq('transaction_type', 'burn')
    .limit(1)

  if (error) throw error
  return Array.isArray(data) && data.length > 0 ? data[0] : null
}

/**
 * Reads the most relevant points transaction for a sale (for idempotent backfill targeting).
 *
 * Selection priority:
 *   1. transaction_type = 'burn'  (redemption backfill must target this)
 *   2. transaction_type in ('earn', 'campaign_bonus')  (standard earn path)
 *
 * Intentionally EXCLUDED:
 *   - 'frequency_step'  — auxiliary wallet transaction, never the redemption anchor
 *   - Any other wallet-type transaction unrelated to the primary points action
 *
 * Returns null if no qualifying transaction exists for this sale.
 */
async function readExistingSalePointsTransaction(customerId, saleId) {
  // First, prefer burn transaction (redemption backfill must link here)
  const burnTx = await readExistingSaleBurnTransaction(customerId, saleId)
  if (burnTx) return burnTx

  // Fallback: earn or campaign_bonus (standard points earn path)
  const EARN_TYPES = ['earn', 'campaign_bonus']
  for (const txType of EARN_TYPES) {
    const { data, error } = await db
      .from('loyalty_transactions')
      .select('id,source_ref_id,wallet_id,campaign_id,transaction_type,points_delta')
      .eq('customer_id', customerId)
      .eq('source_ref_id', saleId)
      .eq('transaction_type', txType)
      .limit(1)

    if (error) throw error
    if (Array.isArray(data) && data.length > 0) return data[0]
  }

  return null
}

async function loadCampaignContext(campaignId, sourceRuleId) {
  if (!campaignId) return { campaign: null, rule: null, program: null }

  const [{ data: campaignRows, error: campaignError }, { data: ruleRows, error: ruleError }] = await Promise.all([
    db
      .from('loyalty_campaigns')
      .select('id,program_id,campaign_type,reward_type,reward_value,metadata')
      .eq('id', campaignId)
      .limit(1),
    sourceRuleId
      ? db
        .from('loyalty_campaign_rules')
        .select('id,campaign_id,rule_scope,action_type,action_json,condition_key,condition_json')
        .eq('id', sourceRuleId)
        .limit(1)
      : db
        .from('loyalty_campaign_rules')
        .select('id,campaign_id,rule_scope,action_type,action_json,condition_key,condition_json')
        .eq('campaign_id', campaignId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .limit(1),
  ])

  if (campaignError) throw campaignError
  if (ruleError) throw ruleError

  const campaign = Array.isArray(campaignRows) ? campaignRows[0] || null : campaignRows
  const rule = Array.isArray(ruleRows) ? ruleRows[0] || null : ruleRows
  let program = null

  if (campaign?.program_id) {
    const { data: programRows, error: programError } = await db
      .from('loyalty_programs')
      .select('id,program_family,program_type,frequency_goal,frequency_reward_json,active')
      .eq('id', campaign.program_id)
      .limit(1)
    if (programError) throw programError
    program = Array.isArray(programRows) ? programRows[0] || null : programRows
  }

  return { campaign, rule, program }
}

async function ensureWallet({
  customerId,
  programId = null,
  tierId = null,
  walletType = 'points',
  customerName = '',
  sourceChannel = '',
}) {
  let query = db
    .from('loyalty_wallets')
    .select('id,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points')
    .eq('customer_id', customerId)
    .eq('wallet_type', walletType)
    .limit(1)

  query = programId ? query.eq('program_id', programId) : query.is('program_id', null)

  const { data: rows, error } = await query
  if (error) throw error

  const existing = Array.isArray(rows) ? rows[0] || null : rows
  if (existing?.id) return existing

  const { data: inserted, error: insertError } = await db
    .from('loyalty_wallets')
    .insert({
      customer_id: customerId,
      program_id: programId || null,
      tier_id: tierId || null,
      wallet_type: walletType,
      current_points_balance: 0,
      lifetime_earned_points: 0,
      lifetime_burned_points: 0,
      lifetime_expired_points: 0,
      metadata: {
        createdBy: 'sale_loyalty_value_ledger',
        customerName,
        sourceChannel,
      },
    })
    .select('id,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points')
    .single()

  if (insertError) throw insertError
  return inserted
}

async function postTransaction({
  wallet,
  customerId,
  programId,
  campaignId,
  saleId,
  saleHeader,
  sourceChannel,
  transactionType,
  walletType = 'points',
  pointsDelta = 0,
  note = '',
  metadata = {},
}) {
  const before = roundPoints(wallet?.current_points_balance || 0)

  // Negatif bakiye koruması — burn işlemi mevcut bakiyeyi aşamaz
  // Bu guard, points_redeem_multiplier ve gelecekteki burn executor'lar için zorunludur.
  if (pointsDelta < 0 && Math.abs(pointsDelta) > before) {
    throw new Error(
      `Yetersiz puan bakiyesi: ${Math.abs(pointsDelta)} puan harcanmak isteniyor, mevcut bakiye ${before}. İşlem reddedildi.`
    )
  }

  const after = roundPoints(before + pointsDelta)
  const branchId = toUuidOrNull(saleHeader.branch_id || saleHeader.branchId)
  const now = new Date().toISOString()

  const { data: transaction, error: transactionError } = await db
    .from('loyalty_transactions')
    .insert({
      wallet_id: wallet.id,
      customer_id: customerId,
      program_id: programId || null,
      campaign_id: campaignId || null,
      tier_id: null,
      wallet_type: walletType,
      transaction_type: transactionType,
      status: 'posted',
      source_channel: sourceChannel || saleHeader.source_channel_type || saleHeader.source || 'sale',
      source_type: 'sale',
      source_ref_id: saleId,
      source_ref_no: saleHeader.local_id || saleHeader.receipt_no || null,
      branch_id: branchId,
      branch_name: saleHeader.branch_name || saleHeader.branchName || null,
      points_delta: pointsDelta,
      points_before: before,
      points_after: after,
      monetary_amount: getSaleAmount(saleHeader),
      occurred_at: saleHeader.sale_datetime || now,
      note,
      metadata,
    })
    .select('id')
    .single()

  if (transactionError) throw transactionError

  const walletPatch = {
    current_points_balance: after,
    last_transaction_at: now,
    updated_at: now,
  }
  if (pointsDelta > 0) {
    walletPatch.lifetime_earned_points = roundPoints((wallet.lifetime_earned_points || 0) + pointsDelta)
  } else if (pointsDelta < 0) {
    walletPatch.lifetime_burned_points = roundPoints((wallet.lifetime_burned_points || 0) + Math.abs(pointsDelta))
  }

  const { error: walletError } = await db
    .from('loyalty_wallets')
    .update(walletPatch)
    .eq('id', wallet.id)

  if (walletError) throw walletError
  return { transaction, pointsBefore: before, pointsAfter: after }
}

async function postCampaignRedemption({
  campaignId,
  customerId,
  walletId,
  transactionId,
  saleId,
  saleHeader,
  sourceChannel,
  redeemedValue,
  metadata = {},
}) {
  if (!campaignId || redeemedValue <= 0) return null

  const { data: existing, error: existingError } = await db
    .from('loyalty_campaign_redemptions')
    .select('id')
    .eq('customer_id', customerId)
    .eq('campaign_id', campaignId)
    .eq('source_ref_id', saleId)
    .limit(1)
  if (existingError) throw existingError
  if (Array.isArray(existing) && existing[0]?.id) return existing[0]

  const { data, error } = await db
    .from('loyalty_campaign_redemptions')
    .insert({
      campaign_id: campaignId,
      customer_id: customerId,
      wallet_id: walletId || null,
      transaction_id: transactionId || null,
      redemption_status: 'applied',
      source_channel: sourceChannel || saleHeader.source_channel_type || saleHeader.source || 'sale',
      source_ref_id: saleId,
      redeemed_value: redeemedValue,
      redeemed_at: saleHeader.sale_datetime || new Date().toISOString(),
      metadata,
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

async function markCouponUsed({
  couponCode,
  customerId,
  saleId,
  sourceChannel,
}) {
  if (!couponCode) return null

  const codes = String(couponCode).split(',').map(c => c.trim()).filter(Boolean)
  if (codes.length === 0) return null

  const results = []
  for (const code of codes) {
    const res = await markSingleCouponUsed({
      couponCode: code,
      customerId,
      saleId,
      sourceChannel,
    })
    if (res) results.push(res)
  }
  return results.length === 1 ? results[0] : results
}

async function markSingleCouponUsed({
  couponCode,
  customerId,
  saleId,
  sourceChannel,
}) {
  if (!couponCode) return null

  const { data: rows, error: readError } = await db
    .from('loyalty_coupons')
    .select('id,code,redemption_status,is_used')
    .eq('code', couponCode)
    .limit(1)
  if (readError) throw readError
  const coupon = Array.isArray(rows) ? rows[0] || null : rows
  if (!coupon?.id) return { skipped: true, reason: 'coupon_not_found', couponCode }
  if (coupon.is_used || coupon.redemption_status === 'used') return { skipped: true, reason: 'coupon_already_used', couponCode }

  const { error: updateError } = await db
    .from('loyalty_coupons')
    .update({
      is_used: true,
      used_at: new Date().toISOString(),
      redeemed_by_customer_id: customerId,
      redeemed_channel: sourceChannel || 'sale',
      redeemed_source_ref_id: saleId,
      redemption_status: 'used',
      updated_at: new Date().toISOString(),
    })
    .eq('id', coupon.id)

  if (updateError) throw updateError
  return { id: coupon.id, couponCode }
}

async function updateFrequencyProgress({
  customerId,
  program,
  campaignId,
  saleId,
}) {
  if (!program?.id || !FREQUENCY_PROGRAM_FAMILIES.has(String(program.program_family || '').trim())) {
    return null
  }

  const progressType = 'orders'
  const targetCount = Math.max(0, parseInt(program.frequency_goal, 10) || 0)
  const { data: rows, error: readError } = await db
    .from('loyalty_frequency_progress')
    .select('id,current_count,target_count,completed_cycles,metadata')
    .eq('customer_id', customerId)
    .eq('program_id', program.id)
    .eq('progress_type', progressType)
    .limit(1)
  if (readError) throw readError

  const current = Array.isArray(rows) ? rows[0] || null : rows
  const nextCount = Number(current?.current_count || 0) + 1
  const completedNow = targetCount > 0 && nextCount >= targetCount
  const completedCycles = Number(current?.completed_cycles || 0) + (completedNow ? 1 : 0)
  const storedCount = completedNow ? 0 : nextCount
  const metadata = {
    ...(parseJsonValue(current?.metadata, {}) || {}),
    lastSourceRefId: saleId,
  }

  if (current?.id) {
    const { error: updateError } = await db
      .from('loyalty_frequency_progress')
      .update({
        campaign_id: campaignId || null,
        current_count: storedCount,
        target_count: targetCount,
        completed_cycles: completedCycles,
        last_qualified_at: new Date().toISOString(),
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
    if (updateError) throw updateError
  } else {
    const { error: insertError } = await db
      .from('loyalty_frequency_progress')
      .insert({
        customer_id: customerId,
        program_id: program.id,
        campaign_id: campaignId || null,
        progress_type: progressType,
        current_count: storedCount,
        target_count: targetCount,
        completed_cycles: completedNow ? 1 : 0,
        last_qualified_at: new Date().toISOString(),
        metadata,
      })
    if (insertError) throw insertError
  }

  return { currentCount: storedCount, targetCount, completedNow, completedCycles }
}

async function createRewardEntitlement({
  customerId,
  programId,
  campaignId,
  walletId,
  saleId,
  sourceRefId = '',
  sourceRefNo = '',
  sourceChannel,
  title,
  entitlementType = 'bonus_points',
  rewardPayload = {},
  note = '',
  metadata = {},
}) {
  const normalizedSourceRefId = normalizeText(sourceRefId || saleId)
  const normalizedSourceRefNo = normalizeText(sourceRefNo || normalizedSourceRefId)

  const { data: existing, error: existingError } = await db
    .from('loyalty_reward_entitlements')
    .select('id')
    .eq('customer_id', customerId)
    .eq('source_ref_id', normalizedSourceRefId)
    .eq('entitlement_type', entitlementType)
    .limit(1)
  if (existingError) throw existingError
  if (Array.isArray(existing) && existing[0]?.id) return existing[0]

  let assignedCouponCode = null
  let enrichedPayload = { ...rewardPayload }

  if (entitlementType === 'coupon' || rewardPayload?.type === 'issue_coupon') {
    let seriesId = null
    if (rewardPayload?.actionConfig?.seriesIds?.length) {
      seriesId = rewardPayload.actionConfig.seriesIds[0]
    } else if (rewardPayload?.actionConfig?.seriesId) {
      seriesId = rewardPayload.actionConfig.seriesId
    } else if (rewardPayload?.seriesIds?.length) {
      seriesId = rewardPayload.seriesIds[0]
    } else if (rewardPayload?.seriesId) {
      seriesId = rewardPayload.seriesId
    } else if (rewardPayload?.value) {
      seriesId = rewardPayload.value
    }

    if (seriesId) {
      const { data: seriesRows, error: seriesError } = await db
        .from('loyalty_coupon_series')
        .select('id, name, prefix, random_length, charset, coupon_count, valid_until, expires_in_days, use_after_checkout, metadata')
        .eq('id', seriesId)
        .limit(1)

      if (seriesError) throw seriesError
      const series = seriesRows?.[0]

      let coupons = null
      const onDemandGenerationOnly = Boolean(series?.metadata?.onDemandGenerationOnly)

      if (!onDemandGenerationOnly) {
        const { data, error: couponError } = await db
          .from('loyalty_coupons')
          .select('id, code')
          .eq('series_id', seriesId)
          .is('customer_id', null)
          .eq('is_used', false)
          .eq('active', true)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .limit(1)

        if (couponError) throw couponError
        coupons = data
      }

      if (coupons && coupons.length > 0) {
        const coupon = coupons[0]
        const { error: updateError } = await db
          .from('loyalty_coupons')
          .update({
            customer_id: customerId,
            updated_at: new Date().toISOString()
          })
          .eq('id', coupon.id)

        if (updateError) throw updateError
        assignedCouponCode = coupon.code
      } else if (series) {
        let uniqueCode = buildCouponCodeCandidate(series)

        let attempts = 0
        while (attempts < 10) {
          const { data: existingCodes, error: checkError } = await db
            .from('loyalty_coupons')
            .select('id')
            .eq('code', uniqueCode)
            .limit(1)
          if (checkError) throw checkError
          if (!existingCodes?.length) break

          uniqueCode = buildCouponCodeCandidate(series)
          attempts += 1
        }

        const newCouponId = `coupon-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        const expiresAt = resolveCouponExpiresAt(series)

        const { error: insertError } = await db
          .from('loyalty_coupons')
          .insert({
            id: newCouponId,
            series_id: seriesId,
            customer_id: customerId,
            code: uniqueCode,
            is_used: false,
            use_after_checkout: Boolean(series.use_after_checkout),
            active: true,
            redemption_status: 'available',
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: {
              generatedBy: 'loyalty_value_ledger',
              seriesName: series.name
            }
          })

        if (insertError) throw insertError
        assignedCouponCode = uniqueCode

        const currentCount = Number(series.coupon_count || 0)
        const { error: seriesUpdateError } = await db
          .from('loyalty_coupon_series')
          .update({
            coupon_count: currentCount + 1,
            updated_at: new Date().toISOString()
          })
          .eq('id', seriesId)

        if (seriesUpdateError) throw seriesUpdateError
      }
    }
  }

  if (assignedCouponCode) {
    enrichedPayload.couponCode = assignedCouponCode
  }

  const { data, error } = await db
    .from('loyalty_reward_entitlements')
    .insert({
      customer_id: customerId,
      program_id: programId || null,
      campaign_id: campaignId || null,
      wallet_id: walletId || null,
      entitlement_type: entitlementType,
      entitlement_status: 'available',
      title,
      description: note,
      source_channel: sourceChannel || 'sale',
      source_ref_id: normalizedSourceRefId,
      source_ref_no: normalizedSourceRefNo,
      target_scope_type: 'any',
      target_scope_json: {},
      reward_payload: enrichedPayload,
      quantity: 1,
      earned_at: new Date().toISOString(),
      note,
      metadata: {
        createdBy: 'sale_loyalty_value_ledger',
        ...(assignedCouponCode ? { assignedCouponCode } : {}),
        ...metadata,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return data
}

async function syncCampaignStampProgress({
  customerId,
  campaignId,
  rule,
  saleId,
  options = {}
}) {
  if (!campaignId || !rule) return null
  const conditionKey = rule.condition_key
  if (conditionKey !== 'period_product_quantity' && conditionKey !== 'period_order_count') {
    return null
  }

  let config = {}
  try {
    config = typeof rule.condition_json === 'string' ? JSON.parse(rule.condition_json) : (rule.condition_json || {})
  } catch (e) {
    config = {}
  }

  const period = String(config.period || 'rolling_days')
  const periodDays = config.period === 'rolling_days' ? parseInt(config.periodDays || 30, 10) : 30
  const productMasks = Array.isArray(config.productMasks) ? config.productMasks : []
  const excludeFreeItems = Boolean(config.excludeFreeItems)
  const allowSameItemRepeat = config.allowSameItemRepeat !== false

  let actualCount = 0
  let targetCount = 0
  let progressType = 'orders'

  if (conditionKey === 'period_product_quantity') {
    progressType = 'products'
    targetCount = Math.max(0, parseInt(config.quantity || 0, 10))
  } else {
    progressType = 'orders'
    targetCount = Math.max(0, parseInt(config.count || 0, 10))
  }

  try {
    const res = await db.rpc('get_customer_period_stats', {
      p_customer_id: customerId,
      p_period: period,
      p_period_days: periodDays,
      p_product_masks: JSON.stringify(productMasks),
      p_exclude_free_items: excludeFreeItems,
      p_allow_same_item_repeat: allowSameItemRepeat,
      p_current_product_ids: [],
      p_sales_channel: options.runtimeChannel || 'pos'
    })
    
    if (res && res.data && res.data[0]) {
      actualCount = Number(
        conditionKey === 'period_product_quantity'
          ? res.data[0].product_quantity
          : res.data[0].order_count
      )
    }
  } catch (err) {
    console.error('[syncCampaignStampProgress] Failed to fetch period stats:', err)
    return null
  }

  const { data: rows, error: readError } = await db
    .from('loyalty_frequency_progress')
    .select('id,current_count,target_count,completed_cycles,last_qualified_at,metadata')
    .eq('customer_id', customerId)
    .eq('campaign_id', campaignId)
    .eq('progress_type', progressType)
    .limit(1)
  if (readError) throw readError

  const current = Array.isArray(rows) ? rows[0] || null : rows
  const completedCycles = targetCount > 0 ? Math.floor(actualCount / targetCount) : 0
  const currentCount = targetCount > 0 ? (actualCount % targetCount) : 0
  const previousMetadata = parseJsonValue(current?.metadata, {}) || {}
  const previousCompletedCycles = Math.max(0, normalizeInteger(current?.completed_cycles, 0))
  const metadataIssuedCycles = normalizeCycleList(previousMetadata.issuedCycles)
  const hasIssuedCycleMetadata = previousMetadata.lastIssuedCycle != null || metadataIssuedCycles.length > 0
  const previousIssuedCycle = hasIssuedCycleMetadata
    ? Math.max(normalizeInteger(previousMetadata.lastIssuedCycle, 0), ...metadataIssuedCycles)
    : previousCompletedCycles
  const pendingCycles = []
  for (let cycleNo = previousIssuedCycle + 1; cycleNo <= completedCycles; cycleNo += 1) {
    pendingCycles.push(cycleNo)
  }
  const completedNow = pendingCycles.length > 0

  const metadata = {
    ...previousMetadata,
    lastSourceRefId: saleId,
    period,
    periodDays,
    lastActualCount: actualCount,
    previousCompletedCycles,
    previousIssuedCycle,
  }

  if (current?.id) {
    const { error: updateError } = await db
      .from('loyalty_frequency_progress')
      .update({
        current_count: currentCount,
        target_count: targetCount,
        completed_cycles: completedCycles,
        last_qualified_at: completedNow ? new Date().toISOString() : (current.last_qualified_at || new Date().toISOString()),
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
    if (updateError) throw updateError
  } else {
    const { error: insertError } = await db
      .from('loyalty_frequency_progress')
      .insert({
        customer_id: customerId,
        program_id: rule.program_id || null,
        campaign_id: campaignId,
        progress_type: progressType,
        current_count: currentCount,
        target_count: targetCount,
        completed_cycles: completedCycles,
        last_qualified_at: new Date().toISOString(),
        metadata,
      })
    if (insertError) throw insertError
  }

  return {
    currentCount,
    targetCount,
    completedNow,
    completedCycles,
    previousCompletedCycles,
    previousIssuedCycle,
    pendingCycles,
    progressType,
    actualCount,
  }
}

async function markStampProgressCyclesIssued({
  customerId,
  campaignId,
  progressType,
  cycleNos = [],
}) {
  const normalizedCycles = normalizeCycleList(cycleNos)
  if (!customerId || !campaignId || !progressType || normalizedCycles.length === 0) return null

  const { data: rows, error: readError } = await db
    .from('loyalty_frequency_progress')
    .select('id,metadata')
    .eq('customer_id', customerId)
    .eq('campaign_id', campaignId)
    .eq('progress_type', progressType)
    .limit(1)
  if (readError) throw readError

  const current = Array.isArray(rows) ? rows[0] || null : rows
  if (!current?.id) return null

  const currentMetadata = parseJsonValue(current.metadata, {}) || {}
  const issuedCycles = normalizeCycleList([
    ...normalizeCycleList(currentMetadata.issuedCycles),
    ...normalizedCycles,
  ])
  const lastIssuedCycle = issuedCycles.length ? Math.max(...issuedCycles) : 0

  const { error: updateError } = await db
    .from('loyalty_frequency_progress')
    .update({
      metadata: {
        ...currentMetadata,
        issuedCycles,
        lastIssuedCycle,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)

  if (updateError) throw updateError
  return { issuedCycles, lastIssuedCycle }
}

async function issueStampCycleCouponEntitlements({
  customerId,
  programId,
  campaignId,
  walletId,
  saleId,
  sourceChannel,
  rule,
  pendingCycles = [],
  note = 'Damga hedefi tamamlandiginda kazanilan kupon',
}) {
  const cycles = normalizeCycleList(pendingCycles)
  if (!customerId || !campaignId || !rule || cycles.length === 0) return []

  let actionJson = {}
  try {
    actionJson = typeof rule.action_json === 'string'
      ? JSON.parse(rule.action_json)
      : (rule.action_json || {})
  } catch {
    actionJson = {}
  }

  const actionType = rule.action_type || actionJson?.type || ''
  if (actionType !== 'issue_coupon' && actionJson?.type !== 'issue_coupon') return []

  const seriesIds = Array.isArray(actionJson?.seriesIds) ? actionJson.seriesIds : []
  const seriesId = seriesIds[0] || actionJson?.seriesId || null
  if (!seriesId) return []

  const issued = []
  for (const cycleNo of cycles) {
    const sourceRefId = buildStampCycleSourceRefId({ customerId, campaignId, cycleNo })
    const entitlement = await createRewardEntitlement({
      customerId,
      programId,
      campaignId,
      walletId,
      saleId,
      sourceRefId,
      sourceRefNo: sourceRefId,
      sourceChannel,
      title: `Damga kampanyasi tamamlandi - Ucretsiz urun`,
      entitlementType: 'coupon',
      rewardPayload: {
        type: 'issue_coupon',
        seriesId,
        seriesIds,
        stampCycleNo: cycleNo,
        sourceSaleId: saleId,
        actionConfig: actionJson,
      },
      note,
      metadata: {
        stampCycleNo: cycleNo,
        stampCycleSourceRefId: sourceRefId,
        sourceSaleId: saleId,
      },
    })
    issued.push({ cycleNo, entitlementId: entitlement?.id || null, sourceRefId })
  }

  return issued
}

export async function postSaleLoyaltyValueLedger({
  saleId,
  saleHeader = {},
  saleLines = [],
  customer = null,
  loyaltyCampaign = null,
  selectedCouponCode = '',
  sourceChannel = '',
} = {}) {
  const normalizedSaleId = normalizeText(saleId || saleHeader.id)
  const customerId = getCustomerId(customer || {}, saleHeader)
  const couponCode = getSelectedCouponCode(selectedCouponCode, customer || {})

  if (!normalizedSaleId) {
    return { skipped: true, reason: 'missing_sale_id' }
  }

  if (!customerId) {
    if (couponCode) {
      const couponResult = await markCouponUsed({
        couponCode,
        customerId: null,
        saleId: normalizedSaleId,
        sourceChannel: sourceChannel || saleHeader.source_channel_type || saleHeader.source || 'sale',
      })
      return {
        skipped: true,
        reason: 'missing_customer_but_coupon_processed',
        coupon: couponResult,
      }
    }
    return { skipped: true, reason: 'missing_customer' }
  }

  const campaignId = getCampaignId(loyaltyCampaign || {}, customer || {}, saleHeader)
  const sourceRuleId = normalizeText(loyaltyCampaign?.sourceRuleId || saleHeader.loyalty_source_rule_id)
  const { campaign, rule, program } = await loadCampaignContext(campaignId, sourceRuleId)
  const programId = campaign?.program_id || loyaltyCampaign?.programId || null
  const customerName = getCustomerName(customer || {}, saleHeader)
  const saleAmount = getSaleAmount(saleHeader)
  const actionEntries = buildActionEntries(rule, loyaltyCampaign || {})
  let decisionContext = loyaltyCampaign?.decisionContext || null;
  if (!decisionContext && (saleHeader?.loyalty_decision_context_json || saleHeader?.loyaltyDecisionContextJson)) {
    try {
      const rawContext = saleHeader.loyalty_decision_context_json || saleHeader.loyaltyDecisionContextJson;
      decisionContext = typeof rawContext === 'string' ? JSON.parse(rawContext) : rawContext;
    } catch (e) {
      decisionContext = null;
    }
  }

  const basePointActions = actionEntries
    .filter(action => action.actionType === 'bonus_points' || action.actionType === 'points_percent_of_order')
    .map(action => ({
      action,
      pointsDelta: resolvePointsDelta(action, saleAmount, campaign || {}, decisionContext, 0),
    }))
  const basePoints = basePointActions.reduce((sum, entry) => sum + entry.pointsDelta, 0)

  const multiplierActions = actionEntries
    .filter(action => action.actionType === 'points_earn_multiplier')
    .map(action => ({
      action,
      pointsDelta: resolvePointsDelta(action, saleAmount, campaign || {}, decisionContext, basePoints),
    }))

  const otherPointActions = actionEntries
    .filter(action => action.actionType !== 'bonus_points' && action.actionType !== 'points_percent_of_order' && action.actionType !== 'points_earn_multiplier' && POINTS_ACTIONS.has(action.actionType))
    .map(action => ({
      action,
      pointsDelta: resolvePointsDelta(action, saleAmount, campaign || {}, decisionContext, 0),
    }))

  const resolvedPointActions = [...basePointActions, ...multiplierActions, ...otherPointActions]
  const pointsDelta = resolvedPointActions.reduce((sum, entry) => sum + entry.pointsDelta, 0)
  const resolvedPointAction = resolvedPointActions.find(entry => entry.pointsDelta !== 0) || resolvedPointActions[0] || null
  const pointsAction = resolvedPointAction?.action || null
  const redeemedValue = roundPoints(
    loyaltyCampaign?.discountAmount
    || saleHeader.loyalty_discount_allocated_amount
    || saleHeader.discount_amount
    || 0
  )

  // Idempotency check: look for an existing points transaction for this sale.
  // readExistingSalePointsTransaction() targets burn first, then earn/campaign_bonus.
  // frequency_step transactions are intentionally excluded to prevent mislink.
  const existingPointsTx = await readExistingSalePointsTransaction(customerId, normalizedSaleId)
  if (existingPointsTx?.id) {
    // Use the exact wallet_id and transaction_id from the burn/earn transaction
    // so the redemption record links to the correct anchor, not a random first row.
    const redemption = await postCampaignRedemption({
      campaignId,
      customerId,
      walletId: existingPointsTx.wallet_id || null,
      transactionId: existingPointsTx.id,
      saleId: normalizedSaleId,
      saleHeader,
      sourceChannel,
      redeemedValue,
      metadata: {
        customerName,
        offerLabel: loyaltyCampaign?.offerLabel || saleHeader.loyalty_offer_label || '',
        selectedCouponCode: couponCode || null,
        redemptionContext: loyaltyCampaign?.redemptionContext || loyaltyCampaign?.decisionContext?.redemptionContext || null,
        idempotentReadback: true,
        anchorTransactionType: existingPointsTx.transaction_type,
      },
    })
    return {
      skipped: true,
      reason: 'already_posted',
      transactionId: existingPointsTx.id,
      transactionType: existingPointsTx.transaction_type,
      redemptionId: redemption?.id || null,
    }
  }

  const wallet = await ensureWallet({
    customerId,
    programId,
    walletType: 'points',
    customerName,
    sourceChannel,
  })

  const posted = {
    walletId: wallet.id,
    transactionId: null,
    redemptionId: null,
    coupon: null,
    frequency: null,
    entitlementId: null,
    pointsDelta,
  }

  if (pointsDelta !== 0) {
    const transactionResult = await postTransaction({
      wallet,
      customerId,
      programId,
      campaignId,
      saleId: normalizedSaleId,
      saleHeader,
      sourceChannel,
      transactionType: pointsDelta < 0
        ? 'burn'
        : (pointsAction.actionType === 'bonus_points' ? 'campaign_bonus' : 'earn'),
      pointsDelta,
      note: loyaltyCampaign?.offerLabel || campaign?.campaign_type || 'Satis sadakat puani',
      metadata: {
        actionType: pointsAction.actionType,
        actionSource: pointsAction.source,
        customerName,
        saleLineCount: Array.isArray(saleLines) ? saleLines.length : 0,
        redemptionContext: loyaltyCampaign?.redemptionContext || loyaltyCampaign?.decisionContext?.redemptionContext || null,
      },
    })
    posted.transactionId = transactionResult.transaction?.id || null
  }

  posted.redemptionId = (await postCampaignRedemption({
    campaignId,
    customerId,
    walletId: wallet.id,
    transactionId: posted.transactionId,
    saleId: normalizedSaleId,
    saleHeader,
    sourceChannel,
    redeemedValue,
    metadata: {
      customerName,
      offerLabel: loyaltyCampaign?.offerLabel || saleHeader.loyalty_offer_label || '',
      selectedCouponCode: couponCode || null,
      redemptionContext: loyaltyCampaign?.redemptionContext || loyaltyCampaign?.decisionContext?.redemptionContext || null,
    },
  }))?.id || null

  posted.coupon = await markCouponUsed({
    couponCode,
    customerId,
    saleId: normalizedSaleId,
    sourceChannel,
  })

  posted.frequency = await updateFrequencyProgress({
    customerId,
    program,
    campaignId,
    saleId: normalizedSaleId,
  })

  if (campaignId && rule) {
    posted.campaignFrequency = await syncCampaignStampProgress({
      customerId,
      campaignId,
      rule,
      saleId: normalizedSaleId,
      options: { runtimeChannel: sourceChannel }
    })

    // Damga tamamlandıysa → kural action_json'dan ödül kuponunu çıkar ve entitlement oluştur
    if (posted.campaignFrequency?.pendingCycles?.length) {
      posted.stampCycleEntitlements = await issueStampCycleCouponEntitlements({
        customerId,
        programId,
        campaignId,
        walletId: wallet.id,
        saleId: normalizedSaleId,
        sourceChannel,
        rule,
        pendingCycles: posted.campaignFrequency.pendingCycles,
      })
      if (posted.stampCycleEntitlements.length > 0) {
        posted.stampCycleEntitlementId = posted.stampCycleEntitlements[0]?.entitlementId || null
        await markStampProgressCyclesIssued({
          customerId,
          campaignId,
          progressType: posted.campaignFrequency.progressType,
          cycleNos: posted.stampCycleEntitlements.map(item => item.cycleNo),
        })
        console.log(`[postSaleLoyaltyValueLedger] Stamp cycles completed -> coupon entitlements: ${posted.stampCycleEntitlements.length}`)
      }
    }
  }


  try {
    const { data: activeRules, error: rulesErr } = await db
      .from('loyalty_campaign_rules')
      .select('id, campaign_id, rule_scope, action_type, action_json, condition_key, condition_json')
      .in('condition_key', ['period_product_quantity', 'period_order_count'])
      .eq('active', true);
      
    if (!rulesErr && Array.isArray(activeRules)) {
      const otherRules = activeRules.filter(r => r.campaign_id !== campaignId);
      for (const otherRule of otherRules) {
        const syncResult = await syncCampaignStampProgress({
          customerId,
          campaignId: otherRule.campaign_id,
          rule: otherRule,
          saleId: normalizedSaleId,
          options: { runtimeChannel: sourceChannel }
        });

        // Bu kampanya da tamamlandıysa kupon entitlement çıkar
        if (syncResult?.pendingCycles?.length) {
          try {
            const issued = await issueStampCycleCouponEntitlements({
              customerId,
              programId: null,
              campaignId: otherRule.campaign_id,
              walletId: wallet.id,
              saleId: normalizedSaleId,
              sourceChannel,
              rule: otherRule,
              pendingCycles: syncResult.pendingCycles,
              note: 'Auto-sync: Damga hedefi tamamlandiginda kazanilan kupon',
            })
            if (issued.length > 0) {
              await markStampProgressCyclesIssued({
                customerId,
                campaignId: otherRule.campaign_id,
                progressType: syncResult.progressType,
                cycleNos: issued.map(item => item.cycleNo),
              })
              console.log(`[postSaleLoyaltyValueLedger] Auto-sync stamp cycles completed for campaign ${otherRule.campaign_id}: ${issued.length}`)
            }
          } catch (entErr) {
            console.error('[postSaleLoyaltyValueLedger] Auto-sync entitlement error:', entErr)
          }
        }
      }
    }
  } catch (err) {
    console.error('[postSaleLoyaltyValueLedger] Failed to auto-sync active stamp campaigns:', err);
  }

  if (posted.frequency) {
    const frequencyWallet = await ensureWallet({
      customerId,
      programId,
      walletType: 'frequency',
      customerName,
      sourceChannel,
    })
    const frequencyTransaction = await postTransaction({
      wallet: frequencyWallet,
      customerId,
      programId,
      campaignId,
      saleId: normalizedSaleId,
      saleHeader,
      sourceChannel,
      transactionType: 'frequency_step',
      walletType: 'frequency',
      pointsDelta: 0,
      note: 'Siparis kapanisi frekans adimi',
      metadata: {
        customerName,
        progress: posted.frequency,
      },
    })
    posted.frequencyTransactionId = frequencyTransaction.transaction?.id || null
  }

  const issueCouponAction = actionEntries.find(action => action.actionType === 'issue_coupon')
  if (issueCouponAction) {
    posted.entitlementId = (await createRewardEntitlement({
      customerId,
      programId,
      campaignId,
      walletId: wallet.id,
      saleId: normalizedSaleId,
      sourceChannel,
      title: loyaltyCampaign?.campaignName || campaign?.campaign_type || 'Sadakat kupon hakki',
      entitlementType: 'coupon',
      rewardPayload: {
        actionConfig: issueCouponAction.actionConfig || {},
      },
      note: 'Siparis kapanisindan kazanilan kupon hakki',
    }))?.id || null
  }

  if (posted.frequency?.completedNow) {
    const rewardJson = parseJsonValue(program?.frequency_reward_json, {}) || {}
    posted.frequencyEntitlementId = (await createRewardEntitlement({
      customerId,
      programId,
      campaignId,
      walletId: wallet.id,
      saleId: normalizedSaleId,
      sourceChannel,
      title: 'Frekans odulu',
      entitlementType: rewardJson.type === 'issue_coupon' ? 'coupon' : 'bonus_points',
      rewardPayload: rewardJson,
      note: 'Frekans hedefi tamamlandi',
    }))?.id || null
  }

  if (!posted.transactionId && !posted.redemptionId && !posted.coupon && !posted.frequency && !posted.entitlementId && !posted.campaignFrequency) {
    return {
      skipped: true,
      reason: 'no_supported_loyalty_value_action',
      walletId: wallet.id,
      campaignId,
    }
  }

  return { skipped: false, campaignId, ...posted }
}
