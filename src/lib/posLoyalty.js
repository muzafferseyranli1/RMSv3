import {
  getLoyaltyApplicationModeLabel,
  normalizeLoyaltyApplicationMode,
} from '@/lib/checkoutLoyalty'
import { getSalesChannelConditionValues, loadLoyaltyWorkspace } from '@/lib/loyalty'
import {
  resolveLoyaltyProgramRedemptionModel,
  resolveLoyaltyWalletBalance,
} from '@/lib/loyaltyWalletReadiness'

export const RUNTIME_LOYALTY_CACHE_TTL_MS = 15 * 60 * 1000
const RUNTIME_LOYALTY_CACHE_KEY = 'suitable_runtime_loyalty_catalog_v1'
const LOCAL_RULE_CONDITION_KEYS = new Set([
  'always',
  'order_total',
  'sales_channel',
  'manual_approval',
  'period_total_order_amount',
  'period_order_count',
  'period_product_quantity',
  'period_sold_product_quantity'
])
const CUSTOMER_CONTEXT_RULE_CONDITION_KEYS = new Set(['customer_has_tag', 'customer_lacks_tag'])
const LOCAL_RULE_ACTION_TYPES = new Set(['discount_percent', 'total_order_discount_percent', 'order_discount_amount', 'free_products', 'points_earn_multiplier'])
const ASYNC_REDEMPTION_ACTION_TYPES = new Set(['points_redeem_multiplier'])

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function roundPoints(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

function truncatePoints(value) {
  return Math.floor(Math.max(0, Number(value || 0)) * 100) / 100
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

function normalizeStringList(values) {
  if (Array.isArray(values)) return values.map(value => String(value || '').trim()).filter(Boolean)
  if (typeof values === 'string') return values.split(',').map(value => value.trim()).filter(Boolean)
  return []
}

function normalizeCampaignIdSet(values) {
  return new Set(normalizeStringList(values))
}

function mergeCouponSeriesLists(...lists) {
  const merged = new Map()
  lists.flat().filter(Boolean).forEach(series => {
    const key = String(series?.id || series?.name || '').trim()
    if (!key) return
    merged.set(key, series)
  })
  return [...merged.values()]
}

function buildRuntimeCatalogCacheScopeKey({ branchId = '', branchName = '' } = {}) {
  const normalizedBranchId = String(branchId || '').trim()
  const normalizedBranchName = normalizeText(branchName)
  if (normalizedBranchId) return `branch-id:${normalizedBranchId}`
  if (normalizedBranchName) return `branch-name:${normalizedBranchName}`
  return 'global'
}

function readRuntimeCatalogCache(scopeKey) {
  if (typeof window === 'undefined') return null
  try {
    const cacheStore = parseJsonValue(window.localStorage.getItem(RUNTIME_LOYALTY_CACHE_KEY), {})
    return cacheStore && typeof cacheStore === 'object' ? cacheStore[scopeKey] || null : null
  } catch {
    return null
  }
}

function writeRuntimeCatalogCache(scopeKey, snapshot) {
  if (typeof window === 'undefined') return
  try {
    const cacheStore = parseJsonValue(window.localStorage.getItem(RUNTIME_LOYALTY_CACHE_KEY), {})
    const nextStore = cacheStore && typeof cacheStore === 'object' ? cacheStore : {}
    nextStore[scopeKey] = snapshot
    window.localStorage.setItem(RUNTIME_LOYALTY_CACHE_KEY, JSON.stringify(nextStore))
  } catch {
    // Best-effort cache only.
  }
}

function formatAmount(value) {
  return `${roundMoney(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`
}

function compareValues(operator, actual, expected) {
  const left = Number(actual || 0)
  const right = Number(expected || 0)

  switch (operator) {
    case 'gt':
      return left > right
    case 'gte':
      return left >= right
    case 'lt':
      return left < right
    case 'lte':
      return left <= right
    case 'eq':
      return left === right
    default:
      return left >= right
  }
}

export function normalizeCartLines(cartLines = []) {
  if (!Array.isArray(cartLines)) return []
  return cartLines.map(line => {
    if (!line) return null
    const productId = String(
      line.productId ||
      line.product_id ||
      line.id ||
      line.prod?.id ||
      line.prod?.productId ||
      line.product?.id ||
      ''
    ).trim()

    const qty = Number(line.qty !== undefined ? line.qty : (line.quantity !== undefined ? line.quantity : (line.prod?.qty || 1))) || 0
    
    const lineGrossAfterDiscount = Number(
      line.lineGrossAfterDiscount !== undefined ? line.lineGrossAfterDiscount :
      (line.line_gross_after_discount !== undefined ? line.line_gross_after_discount :
      (line.price !== undefined ? line.price * qty :
      (line.gross !== undefined ? line.gross :
      (line.unitPrice !== undefined ? line.unitPrice * qty :
      (line.prod?.price !== undefined ? line.prod.price * qty : 0)))))
    ) || 0

    const topCategoryId = String(
      line.topCategoryId ||
      line.top_category_id ||
      line.topCategory ||
      line.prod?.topCategoryId ||
      line.prod?.top_category_id ||
      line.prod?.category_id ||
      line.categoryId ||
      ''
    ).trim()

    const subCategoryId = String(
      line.subCategoryId ||
      line.sub_category_id ||
      line.subCategory ||
      line.prod?.subCategoryId ||
      line.prod?.sub_category_id ||
      ''
    ).trim()

    return {
      productId,
      qty,
      lineGrossAfterDiscount,
      topCategoryId,
      subCategoryId
    }
  }).filter(line => line && line.productId)
}

function getMatchingCartLinesContribution(cartLines = [], productMasks = [], saleTemplates = []) {
  let matchedTotalAmount = 0
  let matchedQuantity = 0
  
  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    return { amount: 0, qty: 0, matched: false }
  }

  const masks = Array.isArray(productMasks) ? productMasks : []
  if (masks.length === 0) {
    const amount = cartLines.reduce((sum, line) => sum + (line.lineGrossAfterDiscount || 0), 0)
    const qty = cartLines.reduce((sum, line) => sum + (line.qty || 0), 0)
    return { amount, qty, matched: true }
  }

  let isAnyLineMatched = false
  for (const line of cartLines) {
    let lineMatched = false
    for (const mask of masks) {
      const maskType = String(mask.type || '').trim().toLowerCase()
      const maskItemId = String(mask.itemId || '').trim()

      if (maskType === 'product') {
        if (String(line.productId) === maskItemId) {
          lineMatched = true
          break
        }
      } else if (maskType === 'category') {
        if (String(line.topCategoryId) === maskItemId || String(line.subCategoryId) === maskItemId) {
          lineMatched = true
          break
        }
      } else if (maskType === 'sale_template') {
        const template = saleTemplates.find(st => String(st.id) === maskItemId)
        if (template) {
          const saleIds = Array.isArray(template.sale_ids) ? template.sale_ids : parseJsonValue(template.sale_ids, [])
          if (Array.isArray(saleIds) && saleIds.map(String).includes(String(line.productId))) {
            lineMatched = true
            break
          }
        }
      }
    }

    if (lineMatched) {
      isAnyLineMatched = true
      matchedTotalAmount += (line.lineGrossAfterDiscount || 0)
      matchedQuantity += (line.qty || 0)
    }
  }

  return {
    amount: matchedTotalAmount,
    qty: matchedQuantity,
    matched: isAnyLineMatched
  }
}

function normalizeRuntimeChannelKey(channelKey) {
  const normalized = normalizeText(channelKey)
  if (!normalized) return 'pos'
  if (['call_center', 'call center', 'cagri_merkezi', 'cagri merkezi', 'çağrı merkezi'].includes(normalized)) return 'call_center'
  if (['masa', 'garson', 'waiter', 'table_service', 'table'].includes(normalized)) return 'masa'
  if (['kiosk'].includes(normalized)) return 'kiosk'
  if (['mobile', 'mobil'].includes(normalized)) return 'mobile'
  if (['online', 'web'].includes(normalized)) return 'online'
  if (['hizli_satis', 'hizli satis', 'quick', 'quick_service', 'quick service', 'pos'].includes(normalized)) return 'pos'
  return normalized
}

function normalizeChannelTargets(channelTargets = []) {
  return [...new Set(
    (Array.isArray(channelTargets) ? channelTargets : [])
      .map(normalizeRuntimeChannelKey)
      .filter(Boolean),
  )]
}

function matchesRuntimeChannel(campaign = {}, runtimeChannelKey) {
  const normalizedTargets = normalizeChannelTargets(campaign.channelTargets)
  if (normalizedTargets.length === 0) return true
  return normalizedTargets.includes(normalizeRuntimeChannelKey(runtimeChannelKey))
}

function isCampaignActiveNow(campaign = {}, now = new Date()) {
  if (campaign.active === false) return false
  const startsAt = campaign.startsAt ? new Date(campaign.startsAt) : null
  const endsAt = campaign.endsAt ? new Date(campaign.endsAt) : null

  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt > now) return false
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < now) return false
  return true
}

function getConditionPreview(rule = {}) {
  const config = rule.conditionConfig || {}

  switch (rule.conditionKey) {
    case 'always':
      return 'Her sipariste'
    case 'manual_approval':
      return 'Manuel tetikleme'
    case 'order_total':
      return `${formatAmount(config.amount || 0)} ve ${String(config.operator || rule.operator || 'gte') === 'gt' ? 'uzeri' : 'uzeri/alti kosulu'}`
    case 'sales_channel': {
      const selectedChannels = getSalesChannelConditionValues(config)
      return selectedChannels.length > 0
        ? `${selectedChannels.join(' / ')} kanalinda`
        : 'Satis kanali kosulu'
    }
    default:
      return 'Ek kosul var'
  }
}

function getRuleConditionEntries(rule = {}) {
  return [
    {
      conditionKey: rule.conditionKey,
      conditionConfig: rule.conditionConfig || {},
    },
    ...((rule.conditionConfig?.additionalConditions || []).map(condition => ({
      conditionKey: condition?.conditionKey,
      conditionConfig: condition?.config || {},
    }))),
  ]
}

function ruleHasConditionKey(rule = {}, conditionKey = '') {
  return getRuleConditionEntries(rule).some(condition => condition.conditionKey === conditionKey)
}

function ruleCanResolveLocally(rule = {}) {
  if (rule.active === false) return true
  const conditions = getRuleConditionEntries(rule)
  return (
    conditions.every(condition => (
      LOCAL_RULE_CONDITION_KEYS.has(condition.conditionKey)
      || CUSTOMER_CONTEXT_RULE_CONDITION_KEYS.has(condition.conditionKey)
    ))
    && LOCAL_RULE_ACTION_TYPES.has(rule.actionType)
  )
}

function ruleCanResolveWithAsyncRedemption(rule = {}, orderContext = {}) {
  if (ruleCanResolveLocally(rule)) return true
  if (rule.active === false) return true
  if (!ASYNC_REDEMPTION_ACTION_TYPES.has(rule.actionType)) return false

  const conditions = getRuleConditionEntries(rule)
  return conditions.every(condition => (
    LOCAL_RULE_CONDITION_KEYS.has(condition.conditionKey)
    || CUSTOMER_CONTEXT_RULE_CONDITION_KEYS.has(condition.conditionKey)
  ))
}

function normalizeRuntimeCustomerContext(customerContext = {}) {
  return {
    customerId: String(customerContext.customerId || '').trim(),
    customerName: String(customerContext.customerName || '').trim(),
    customerCategoryIds: normalizeStringList(customerContext.customerCategoryIds),
    tierPointsMultiplier: Number(customerContext.tierPointsMultiplier || customerContext.pointsMultiplier || customerContext.points_multiplier || 1) || 1,
  }
}

export function calculateCombinedEarnMultiplier(campaignOffers = [], tierPointsMultiplier = 1, strategy = 'compound') {
  const multipliers = campaignOffers
    .filter(offer => offer.actionType === 'points_earn_multiplier' && typeof offer.multiplier === 'number')
    .map(offer => offer.multiplier)

  if (strategy === 'additive') {
    let sumBonus = (tierPointsMultiplier - 1)
    for (const m of multipliers) {
      sumBonus += (m - 1)
    }
    return Math.max(0.01, 1 + sumBonus)
  } else if (strategy === 'max_wins') {
    return Math.max(tierPointsMultiplier, ...multipliers, 1)
  } else { // compound
    let product = tierPointsMultiplier
    for (const m of multipliers) {
      product *= m
    }
    return Math.max(0.01, product)
  }
}

export function calculateCombinedRedeemMultiplier(campaignOffers = [], strategy = 'compound') {
  const multipliers = campaignOffers
    .filter(offer => offer.actionType === 'points_redeem_multiplier' && typeof offer.multiplier === 'number')
    .map(offer => offer.multiplier)

  if (multipliers.length === 0) return 1

  if (strategy === 'additive') {
    let sumBonus = 0
    for (const m of multipliers) {
      sumBonus += (m - 1)
    }
    return Math.max(0.01, 1 + sumBonus)
  } else if (strategy === 'max_wins') {
    return Math.max(...multipliers, 1)
  } else { // compound
    let product = 1
    for (const m of multipliers) {
      product *= m
    }
    return Math.max(0.01, product)
  }
}

export function getRuntimeCampaignResolutionMode(campaign = {}, customerContext = {}) {
  const audienceType = String(campaign.audienceType || 'all')
  if (!['all', 'members', 'tagged_customers'].includes(audienceType)) return 'live_lookup'

  const normalizedCustomer = normalizeRuntimeCustomerContext(customerContext)
  if (audienceType === 'members' && !normalizedCustomer.customerId) return 'local'
  if (audienceType === 'tagged_customers' && !normalizedCustomer.customerId) return 'local'

  const applicableRules = (campaign.applicableRules || []).filter(rule => rule.active !== false)
  if (applicableRules.length === 0) {
    return campaign.campaignType === 'discount_percent' && Number(campaign.rewardValue || 0) > 0
      ? 'local'
      : 'live_lookup'
  }

  const hasAsyncRedemptionContext = Boolean(customerContext.runtimeWalletContext)
  if (hasAsyncRedemptionContext && applicableRules.every(rule => ruleCanResolveWithAsyncRedemption(rule, customerContext))) {
    return 'local'
  }

  return applicableRules.every(ruleCanResolveLocally) ? 'local' : 'live_lookup'
}

function buildOfferFromRule(campaign = {}, rule = {}, orderContext = {}) {
  const config = rule.actionConfig || {}
  const orderTotal = Number(orderContext.orderTotal || 0)
  const applicationMode = normalizeLoyaltyApplicationMode(campaign.applicationMode)

  // Build applied actions summary for audit/readback
  const getAppliedActionsSummary = () => {
    const actions = []
    if (rule.actionType === 'discount_percent' || rule.actionType === 'total_order_discount_percent') {
      const percent = Number(config.percent || campaign.rewardValue || 0)
      actions.push({ type: 'discount_percent', value: percent, label: `%${percent} indirim` })
    } else if (rule.actionType === 'order_discount_amount') {
      const amount = Number(config.amount || 0)
      actions.push({ type: 'order_discount_amount', value: amount, label: `${formatAmount(amount)} indirim` })
    } else if (rule.actionType === 'free_products') {
      const rawItems = Array.isArray(config.items) ? config.items : []
      if (rawItems.length > 0) {
        actions.push({ type: 'free_products', items: rawItems.length, label: `${rawItems.length} bedava ürün` })
      }
    } else if (rule.actionType === 'bonus_points') {
      actions.push({ type: 'bonus_points', value: config.points || 0, label: `${config.points || 0} bonus puan` })
    } else if (rule.actionType === 'points_percent_of_order') {
      actions.push({ type: 'points_percent_of_order', value: config.percent || 0, label: `%${config.percent || 0} puan` })
    } else if (rule.actionType === 'points_earn_multiplier') {
      actions.push({ type: 'points_earn_multiplier', value: config.multiplier || 1, label: `${config.multiplier || 1}x puan` })
    } else if (rule.actionType === 'points_redeem_multiplier') {
      const multiplier = Number(config.multiplier || campaign.rewardValue || 1)
      const context = orderContext.redemptionContext || null
      actions.push({
        type: 'points_redeem_multiplier',
        value: multiplier,
        usedPoints: context?.usedPoints || 0,
        redemptionRate: context?.redemptionRate || orderContext.runtimeWalletContext?.redemptionRate || null,
        discountAmount: context?.discountAmount || context?.computedDiscount || 0,
        label: `${multiplier}x puan harcama`,
      })
    }
    return actions.length > 0 ? actions : null
  }

  // Build decision context for audit/readback
  const getDecisionContext = () => {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      ruleId: rule.id,
      ruleActionType: rule.actionType,
      conditionKey: rule.conditionKey,
      runtimeChannel: orderContext.runtimeChannel,
      orderTotal,
      customerId: orderContext.customerId || null,
      redemptionContext: orderContext.redemptionContext || null,
      resolvedAt: new Date().toISOString(),
    }
}

  switch (rule.actionType) {
    case 'points_earn_multiplier': {
      const multiplier = Number(config.multiplier || campaign.rewardValue || 1)
      if (multiplier <= 0) return null
      return {
        campaignId: campaign.id,
        campaignName: campaign.name || 'Kampanya',
        priority: Number(campaign.priority || 0),
        discountType: 'points_earn_multiplier',
        discountValue: 0,
        discountAmount: 0,
        multiplier,
        offerLabel: `${multiplier}x puan kazanma`,
        conditionLabel: getConditionPreview(rule),
        runtimeStatus: 'eligible',
        actionType: rule.actionType,
        sourceRuleId: rule.id,
        applicationMode,
        applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
        selectedCouponCode: orderContext.selectedCouponCode || null,
        appliedActionsSummary: getAppliedActionsSummary(),
        decisionContext: getDecisionContext(),
      }
    }

    case 'discount_percent':
    case 'total_order_discount_percent': {
      const percent = Number(config.percent || campaign.rewardValue || 0)
      if (percent <= 0) return null
      return {
        campaignId: campaign.id,
        campaignName: campaign.name || 'Kampanya',
        priority: Number(campaign.priority || 0),
        discountType: 'percent',
        discountValue: percent,
        discountAmount: roundMoney(orderTotal * percent / 100),
        offerLabel: `%${percent} siparis indirimi`,
        conditionLabel: getConditionPreview(rule),
        runtimeStatus: 'eligible',
        actionType: rule.actionType,
        sourceRuleId: rule.id,
        applicationMode,
        applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
// New audit fields for snapshot/readback
        selectedCouponCode: orderContext.selectedCouponCode || null,
        appliedActionsSummary: getAppliedActionsSummary(),
        decisionContext: getDecisionContext(),
      }
    }

    case 'order_discount_amount': {
      const amount = Number(config.amount || 0)
      if (amount <= 0) return null
      return {
        campaignId: campaign.id,
        campaignName: campaign.name || 'Kampanya',
        priority: Number(campaign.priority || 0),
        discountType: 'amount',
        discountValue: amount,
        discountAmount: Math.min(roundMoney(orderTotal), roundMoney(amount)),
        offerLabel: `${formatAmount(amount)} siparis indirimi`,
        conditionLabel: getConditionPreview(rule),
        runtimeStatus: 'eligible',
        actionType: rule.actionType,
        sourceRuleId: rule.id,
        applicationMode,
        applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
        selectedCouponCode: orderContext.selectedCouponCode || null,
        appliedActionsSummary: getAppliedActionsSummary(),
        decisionContext: getDecisionContext(),
      }
    }

    case 'free_products': {
      const rawItems = Array.isArray(config.items) ? config.items : []
      if (rawItems.length === 0) return null
      const giftItems = rawItems.map(item => ({
        productId: String(
          item.product_id
          || item.productId
          || item.itemId
          || item.product_item_id
          || item.productItemId
          || item.sale_item_id
          || item.saleItemId
          || item.target_product_id
          || item.targetProductId
          || item.id
          || '',
        ),
        name: String(item.product_name || item.productName || item.name || 'Hediye Urun'),
        qty: Math.max(1, parseInt(item.qty, 10) || 1),
      })).filter(item => item.productId || item.name)
      if (giftItems.length === 0) return null
      const itemLabel = giftItems.map(item => `${item.qty}x ${item.name}`).join(', ')
      return {
        campaignId: campaign.id,
        campaignName: campaign.name || 'Kampanya',
        priority: Number(campaign.priority || 0),
        discountType: 'free_products',
        discountValue: 0,
        discountAmount: 0,
        giftItems,
        offerLabel: `Hediye: ${itemLabel}`,
        conditionLabel: getConditionPreview(rule),
        runtimeStatus: 'eligible',
        actionType: rule.actionType,
        sourceRuleId: rule.id,
        applicationMode,
        applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
        selectedCouponCode: orderContext.selectedCouponCode || null,
        appliedActionsSummary: getAppliedActionsSummary(),
        decisionContext: getDecisionContext(),
      }
    }
    case 'points_redeem_multiplier': {
      const walletContext = orderContext.runtimeWalletContext || null
      const multiplier = Number(config.multiplier || campaign.rewardValue || 1)
      const redemptionRate = Number(walletContext?.redemptionRate || walletContext?.programRedemption?.redemptionRate || 0)
      const pointsBalance = Number(walletContext?.pointsBalance || 0)
      const walletReady = Boolean(
        walletContext?.readyForAsyncRedemption
        && walletContext?.status === 'ready'
        && walletContext?.balanceKnown
        && walletContext?.walletId
      )

      if (!walletReady || orderTotal <= 0 || multiplier <= 0 || redemptionRate <= 0 || pointsBalance <= 0) return null

      const pointValue = redemptionRate * multiplier
      if (pointValue <= 0) return null

      const maxPointsForOrder = truncatePoints(orderTotal / pointValue)
      const usedPoints = roundPoints(Math.min(pointsBalance, maxPointsForOrder))
      const computedDiscount = roundMoney(Math.min(orderTotal, usedPoints * pointValue))
      if (usedPoints <= 0 || computedDiscount <= 0) return null

      const redemptionContext = {
        usedPoints,
        redemptionRate,
        multiplier,
        computedDiscount,
        discountAmount: computedDiscount,
        walletId: walletContext.walletId,
        walletStatus: walletContext.status,
        walletProgramId: walletContext.programId || null,
        walletType: walletContext.walletType || 'points',
        pointsBalance: roundPoints(pointsBalance),
        redemptionUnit: walletContext.redemptionUnit || '1 puan = redemption_rate TL',
      }
      orderContext.redemptionContext = redemptionContext

      return {
        campaignId: campaign.id,
        campaignName: campaign.name || 'Kampanya',
        priority: Number(campaign.priority || 0),
        discountType: 'amount',
        discountValue: computedDiscount,
        discountAmount: computedDiscount,
        offerLabel: `${usedPoints.toLocaleString('tr-TR')} puan ile ${formatAmount(computedDiscount)} indirim`,
        conditionLabel: getConditionPreview(rule),
        runtimeStatus: 'eligible',
        actionType: rule.actionType,
        sourceRuleId: rule.id,
        applicationMode,
        applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
        selectedCouponCode: orderContext.selectedCouponCode || null,
        usedPoints,
        redemptionRate,
        multiplier,
        redemptionContext,
        appliedActionsSummary: getAppliedActionsSummary(),
        decisionContext: getDecisionContext(),
      }
    }
    default:
      return null
  }
}

function evaluateSingleCondition(condition = {}, orderContext = {}, campaign = {}) {
  switch (condition.conditionKey) {
    case 'always':
      return { matched: true, supported: true, reason: 'Her sipariste gecerli' }
    case 'manual_approval': {
      const triggeredCampaignIds = orderContext.manualTriggeredCampaignIds instanceof Set
        ? orderContext.manualTriggeredCampaignIds
        : normalizeCampaignIdSet(orderContext.manualTriggeredCampaignIds)
      const campaignId = String(campaign.id || '').trim()
      const matched = Boolean(campaignId) && triggeredCampaignIds.has(campaignId)
      return {
        matched,
        supported: true,
        reason: matched
          ? 'Manuel tetikleme hazir'
          : 'Manuel tetikleme bekliyor',
      }
    }
    case 'order_total': {
      const config = condition.conditionConfig || {}
      const amount = Number(config.amount || 0)
      const operator = String(config.operator || 'gte')
      const matched = compareValues(operator, orderContext.orderTotal, amount)
      return {
        matched,
        supported: true,
        reason: matched
          ? `Siparis toplami kosulu saglandi (${formatAmount(orderContext.orderTotal)})`
          : `Siparis toplami kosulu bekliyor (${formatAmount(amount)})`,
      }
    }
    case 'sales_channel': {
      const selectedChannels = getSalesChannelConditionValues(condition.conditionConfig || {})
        .map(normalizeRuntimeChannelKey)
        .filter(Boolean)
      if (selectedChannels.length === 0) {
        return {
          matched: false,
          supported: true,
          reason: 'Satis kanali secilmedi',
        }
      }

      const runtimeChannel = normalizeRuntimeChannelKey(orderContext.runtimeChannel)
      const matched = selectedChannels.includes(runtimeChannel)
      return {
        matched,
        supported: true,
        reason: matched
          ? `Satis kanali eslesti (${runtimeChannel.toUpperCase()})`
          : `Satis kanali bekliyor (${selectedChannels.join(' / ').toUpperCase()})`,
      }
    }
    case 'customer_has_tag':
    case 'customer_lacks_tag': {
      const customerId = String(orderContext.customerId || '').trim()
      if (!customerId) {
        return {
          matched: false,
          supported: true,
          reason: 'Musteri tanimlanmadi',
        }
      }

      const config = condition.conditionConfig || {}
      const requiredCategoryIds = normalizeStringList(
        config.categoryIds || config.customerCategoryIds || config.tagIds,
      )
      const customerCategoryIds = normalizeStringList(orderContext.customerCategoryIds)
      const hasAnyCategory = customerCategoryIds.length > 0
      const categoryMatched = requiredCategoryIds.length === 0
        ? hasAnyCategory
        : requiredCategoryIds.some(categoryId => customerCategoryIds.includes(categoryId))
      const matched = condition.conditionKey === 'customer_lacks_tag'
        ? !categoryMatched
        : categoryMatched

      return {
        matched,
        supported: true,
        reason: matched
          ? (condition.conditionKey === 'customer_lacks_tag'
            ? 'Musteri secili kategorilerin disinda'
            : 'Musteri kategori kosulu saglandi')
          : (condition.conditionKey === 'customer_lacks_tag'
            ? 'Musteri secili kategorilerde'
            : 'Musteri kategori kosulu bekliyor'),
      }
    }
    case 'period_total_order_amount':
    case 'period_order_count':
    case 'period_product_quantity':
    case 'period_sold_product_quantity': {
      const customerId = String(orderContext.customerId || '').trim()
      if (!customerId) {
        return {
          matched: false,
          supported: true,
          reason: 'Musteri tanimlanmadi (Donem kosulu)',
        }
      }

      const config = condition.conditionConfig || {}
      const period = String(config.period || 'rolling_days')
      const periodDays = config.period === 'rolling_days' ? parseInt(config.periodDays || 30, 10) : 30
      const productMasks = Array.isArray(config.productMasks) ? config.productMasks : []

      const sortedMasks = [...productMasks].sort((a, b) => {
        const keyA = `${a.type || ''}:${a.itemId || ''}`
        const keyB = `${b.type || ''}:${b.itemId || ''}`
        return keyA.localeCompare(keyB)
      })
      const queryKey = `${period}:${periodDays}:${JSON.stringify(sortedMasks)}`

      const stats = (orderContext.customerPeriodStats && orderContext.customerPeriodStats[queryKey]) || {
        total_amount: 0,
        order_count: 0,
        product_quantity: 0
      }

      const includeCurrentOrder = config.includeCurrentOrder !== false
      let currentAmount = 0
      let currentQty = 0
      let currentOrderCount = 0

      if (includeCurrentOrder && orderContext.cartLines) {
        const contribution = getMatchingCartLinesContribution(orderContext.cartLines, productMasks, orderContext.saleTemplates || [])
        currentAmount = contribution.amount
        currentQty = contribution.qty
        if (contribution.matched) {
          currentOrderCount = 1
        }
      }

      const operator = String(config.operator || condition.operator || 'gte')
      let actual = 0
      let expected = 0
      let label = ''

      if (condition.conditionKey === 'period_total_order_amount') {
        actual = stats.total_amount + currentAmount
        expected = Number(config.amount || condition.threshold_value || 0)
        label = `Donemlik siparis tutari: ${formatAmount(actual)} (Hedef: ${operator} ${formatAmount(expected)})`
      } else if (condition.conditionKey === 'period_order_count') {
        actual = stats.order_count + currentOrderCount
        expected = Number(config.count || config.orderCount || condition.threshold_value || 0)
        label = `Donemlik siparis sayisi: ${actual} (Hedef: ${operator} ${expected})`
      } else {
        actual = stats.product_quantity + currentQty
        expected = Number(config.quantity || config.productQuantity || condition.threshold_value || 0)
        label = `Donemlik urun adedi: ${actual} (Hedef: ${operator} ${expected})`
      }

      const matched = compareValues(operator, actual, expected)
      return {
        matched,
        supported: true,
        reason: matched ? `${label} kosulu saglandi` : `${label} kosulu bekleniyor`
      }
    }
    default:
      return { matched: false, supported: false, reason: 'Bu prototipte manuel kontrol gerekir' }
  }
}

function evaluateRuleForOrder(rule = {}, orderContext = {}, campaign = {}) {
  if (rule.active === false) return { matched: false, supported: true, reason: 'Pasif kural' }

  const conditionEntries = getRuleConditionEntries(rule)
  if (conditionEntries.length === 0) {
    return { matched: false, supported: false, reason: 'Kosul bulunamadi' }
  }

  const evaluations = conditionEntries.map(condition => evaluateSingleCondition(condition, orderContext, campaign))
  const unsupportedEvaluation = evaluations.find(evaluation => !evaluation.supported)
  if (unsupportedEvaluation) return unsupportedEvaluation

  const joinerMode = rule.conditionConfig?.additionalConditionsMode === 'or' ? 'or' : 'and'
  const matched = joinerMode === 'or'
    ? evaluations.some(evaluation => evaluation.matched)
    : evaluations.every(evaluation => evaluation.matched)

  const primaryReason = matched
    ? evaluations.find(evaluation => evaluation.matched)?.reason
    : evaluations.find(evaluation => !evaluation.matched)?.reason

  return {
    matched,
    supported: true,
    reason: primaryReason || (matched ? 'Kosullar saglandi' : 'Kosullar bekliyor'),
  }
}

function buildFallbackOffer(campaign = {}, orderContext = {}) {
  if (campaign.campaignType === 'discount_percent' && Number(campaign.rewardValue || 0) > 0) {
    const percent = Number(campaign.rewardValue || 0)
    const applicationMode = normalizeLoyaltyApplicationMode(campaign.applicationMode)
    const orderTotal = Number(orderContext.orderTotal || 0)

    // Fallback offer'da da audit alanları üretilir — snapshot/readback kolonları boş kalmasın
    const appliedActionsSummary = [
      { type: 'discount_percent', value: percent, label: `%${percent} indirim` },
    ]

    const decisionContext = {
      campaignId: campaign.id,
      campaignName: campaign.name,
      actionType: 'discount_percent',
      runtimeChannel: orderContext.runtimeChannel || null,
      orderTotal,
      resolvedAt: new Date().toISOString(),
    }

    return {
      campaignId: campaign.id,
      campaignName: campaign.name || 'Kampanya',
      priority: Number(campaign.priority || 0),
      discountType: 'percent',
      discountValue: percent,
      discountAmount: roundMoney(orderTotal * percent / 100),
      offerLabel: `%${percent} siparis indirimi`,
      conditionLabel: 'Genel kampanya kurallari',
      runtimeStatus: 'eligible',
      actionType: 'discount_percent',
      sourceRuleId: '',
      applicationMode,
      applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
      // Audit/readback alanları — checkoutLoyalty.js snapshot kolonlarını doldurur
      selectedCouponCode: orderContext.selectedCouponCode || null,
      appliedActionsSummary,
      decisionContext,
    }
  }

  return null
}

function buildAudienceStatus(campaign = {}, customerContext = {}) {
  const normalizedCustomer = normalizeRuntimeCustomerContext(customerContext)
  const audienceCategoryIds = normalizeStringList(campaign.audienceCategoryIds)

  if (campaign.audienceType === 'all') {
    return {
      supported: true,
      matched: true,
      label: 'Tum musteriler',
      reason: 'Tum musterilere acik',
    }
  }

  if (campaign.audienceType === 'members') {
    if (!normalizedCustomer.customerId) {
      return {
        supported: false,
        matched: false,
        label: 'Musteri secimi gerekir',
        reason: 'Bu kampanya icin once musteri tanimlanmali',
      }
    }

    return {
      supported: true,
      matched: true,
      label: normalizedCustomer.customerName || 'Bagli musteri',
      reason: 'Bagli musteri ile kontrol edildi',
    }
  }

  if (campaign.audienceType === 'tagged_customers') {
    if (!normalizedCustomer.customerId) {
      return {
        supported: false,
        matched: false,
        label: 'Musteri kategorisi gerekir',
        reason: 'Kategori hedefli kampanyalar icin musteri tanimlanmali',
      }
    }

    const matched = audienceCategoryIds.length === 0
      ? normalizedCustomer.customerCategoryIds.length > 0
      : audienceCategoryIds.some(categoryId => normalizedCustomer.customerCategoryIds.includes(categoryId))

    return {
      supported: true,
      matched,
      label: matched ? 'Kategori eslesti' : 'Hedef kategori bekliyor',
      reason: matched
        ? 'Musteri hedef kategoride'
        : 'Musteri hedef kategorilere ait degil',
    }
  }

  return {
    supported: false,
    matched: false,
    label: 'Canli loyalty kontrolu gerekir',
    reason: 'Bu hedef kitle prototipte desteklenmiyor',
  }
}

function buildCampaignCard(campaign = {}, orderContext = {}, selectedCampaignId = '') {
  const applicationMode = normalizeLoyaltyApplicationMode(campaign.applicationMode)
  const resolutionMode = getRuntimeCampaignResolutionMode(campaign, orderContext)
  const audience = buildAudienceStatus(campaign, orderContext)
  const applicableRules = (campaign.applicableRules || []).filter(rule => rule.active !== false)
  const manualTriggerRequired = applicableRules.some(rule => ruleHasConditionKey(rule, 'manual_approval'))
  const triggeredCampaignIds = orderContext.manualTriggeredCampaignIds instanceof Set
    ? orderContext.manualTriggeredCampaignIds
    : normalizeCampaignIdSet(orderContext.manualTriggeredCampaignIds)
  const manualTriggerArmed = manualTriggerRequired && triggeredCampaignIds.has(String(campaign.id || '').trim())
  const canResolveLocally = resolutionMode === 'local' && audience.supported && audience.matched
  const ruleEvaluations = canResolveLocally
    ? applicableRules.map(rule => ({
      rule,
      evaluation: evaluateRuleForOrder(rule, orderContext, campaign),
    }))
    : []
  const matchingRuleEntry = ruleEvaluations.find(entry => entry.evaluation.supported && entry.evaluation.matched) || null
  const unsupportedRuleEntry = ruleEvaluations.find(entry => !entry.evaluation.supported) || null
  const pendingRuleEntry = ruleEvaluations.find(entry => entry.evaluation.supported && !entry.evaluation.matched) || null
  const matchingRule = matchingRuleEntry?.rule || null
  const unsupportedRule = unsupportedRuleEntry?.rule || null
  const ruleEvaluation = matchingRuleEntry?.evaluation || null
  const pendingRuleEvaluation = pendingRuleEntry?.evaluation || null
  const offer = canResolveLocally
    ? (matchingRule
      ? buildOfferFromRule(campaign, matchingRule, orderContext)
      : (applicableRules.length === 0 ? buildFallbackOffer(campaign, orderContext) : null))
    : null

  let statusTone = 'muted'
  let statusLabel = 'Aktif'
  if (resolutionMode === 'live_lookup') {
    statusTone = 'warning'
    statusLabel = 'Canli loyalty kontrolu gerekir'
  } else if (!audience.supported) {
    statusTone = 'warning'
    statusLabel = audience.label
  } else if (!audience.matched) {
    statusTone = 'muted'
    statusLabel = audience.label
  } else if (offer) {
    statusTone = 'success'
    statusLabel = 'Bu sipariste uygulanabilir'
  } else if (manualTriggerRequired && !manualTriggerArmed) {
    statusTone = 'muted'
    statusLabel = 'Manuel tetikleme bekliyor'
  } else if (unsupportedRule) {
    statusTone = 'warning'
    statusLabel = 'Manuel kontrol gerekir'
  } else if (applicableRules.length > 0) {
    statusTone = 'muted'
    statusLabel = 'Kosul bekliyor'
  }

  const isCustomerSelected = Boolean(selectedCampaignId && String(selectedCampaignId) === String(campaign.id || ''))

  return {
    ...campaign,
    applicationMode,
    applicationModeLabel: getLoyaltyApplicationModeLabel(applicationMode),
    audienceLabel: audience.label,
    audienceSupported: audience.supported,
    audienceMatched: audience.matched,
    offer,
    resolutionMode,
    orderEligible: Boolean(canResolveLocally && offer),
    isCustomerSelected,
    manualTriggerRequired,
    manualTriggerArmed,
    statusTone,
    statusLabel,
    requirementLabel: matchingRule
      ? getConditionPreview(matchingRule)
      : (pendingRuleEntry?.rule
        ? getConditionPreview(pendingRuleEntry.rule)
        : (applicableRules[0] ? getConditionPreview(applicableRules[0]) : 'Ek kosul yok')),
    runtimeReason: resolutionMode === 'live_lookup'
      ? 'Bu kampanya musteri, kupon veya gelismis kural baglaminda canli loyalty kontrolu ister.'
      : (!audience.supported || !audience.matched)
        ? audience.reason
        : (ruleEvaluation?.reason || pendingRuleEvaluation?.reason || (unsupportedRule ? 'Bu prototipte desteklenmeyen kosul var' : '')),
    channelLabel: normalizeChannelTargets(campaign.channelTargets).length > 0
      ? normalizeChannelTargets(campaign.channelTargets).join(' / ').toUpperCase()
      : 'TUM KANALLAR',
  }
}

function mergeCampaignLists(globalCampaigns = [], branchCampaigns = []) {
  const byId = new Map()
  globalCampaigns.forEach(campaign => byId.set(String(campaign.id), campaign))
  branchCampaigns.forEach(campaign => byId.set(String(campaign.id), campaign))
  return Array.from(byId.values()).sort((left, right) => {
    const priorityDiff = Number(left.priority || 0) - Number(right.priority || 0)
    if (priorityDiff !== 0) return priorityDiff
    return String(left.name || '').localeCompare(String(right.name || ''), 'tr')
  })
}

export async function loadRuntimeLoyaltyCampaignCatalog({ branchId = '', branchName = '' } = {}) {
  const hasBranchIdentity = Boolean(String(branchId || '').trim() || String(branchName || '').trim())

  const [globalWorkspace, branchWorkspace, templatesRes] = await Promise.all([
    loadLoyaltyWorkspace({ scope: 'global' }),
    hasBranchIdentity
      ? loadLoyaltyWorkspace({ scope: 'branch', branchId, branchName })
      : Promise.resolve(null),
    db.from('sale_templates').select('id,name,sale_ids').catch(() => ({ data: [], error: null }))
  ])

  const saleTemplates = templatesRes?.data || []

  return {
    schemaReady: Boolean(globalWorkspace?.schemaReady) && (branchWorkspace ? Boolean(branchWorkspace.schemaReady) : true),
    databaseUnavailable: Boolean(globalWorkspace?.databaseUnavailable) && Boolean(branchWorkspace?.databaseUnavailable),
    campaigns: mergeCampaignLists(globalWorkspace?.campaigns || [], branchWorkspace?.campaigns || []),
    couponSeries: mergeCouponSeriesLists(globalWorkspace?.couponSeries || [], branchWorkspace?.couponSeries || []),
    saleTemplates,
    issues: [
      ...(globalWorkspace?.schemaIssues || []),
      ...(branchWorkspace?.schemaIssues || []),
    ],
  }
}

export async function loadCachedRuntimeLoyaltyCampaignCatalog({
  branchId = '',
  branchName = '',
  maxAgeMs = RUNTIME_LOYALTY_CACHE_TTL_MS,
  preferFresh = false,
} = {}) {
  const scopeKey = buildRuntimeCatalogCacheScopeKey({ branchId, branchName })
  const cachedEntry = readRuntimeCatalogCache(scopeKey)
  const now = Date.now()

  if (!preferFresh && cachedEntry?.fetchedAt && (now - Number(cachedEntry.fetchedAt) < maxAgeMs)) {
    return {
      ...(cachedEntry.snapshot || {}),
      fromCache: true,
      stale: false,
      fetchedAt: cachedEntry.fetchedAt,
      expiresAt: Number(cachedEntry.fetchedAt) + maxAgeMs,
    }
  }

  try {
    const snapshot = await loadRuntimeLoyaltyCampaignCatalog({ branchId, branchName })
    writeRuntimeCatalogCache(scopeKey, {
      fetchedAt: now,
      snapshot,
    })
    return {
      ...snapshot,
      fromCache: false,
      stale: false,
      fetchedAt: now,
      expiresAt: now + maxAgeMs,
    }
  } catch (error) {
    if (!cachedEntry?.snapshot) throw error

    return {
      ...(cachedEntry.snapshot || {}),
      fromCache: true,
      stale: true,
      fetchedAt: cachedEntry.fetchedAt,
      expiresAt: Number(cachedEntry.fetchedAt || 0) + maxAgeMs,
      issues: [
        ...(cachedEntry.snapshot?.issues || []),
        'Canli loyalty baglantisi gecici olarak kullanilamadi. Son senkron katalog gosteriliyor.',
      ],
    }
  }
}

export function evaluateRuntimeOrderCampaigns(campaigns = [], {
  runtimeChannel = 'pos',
  orderTotal = 0,
  now = new Date(),
  customerContext = {},
  selectedCampaignId = '',
  manuallyTriggeredCampaignIds = [],
  runtimeWalletContext = null,
  multiplierStrategy = 'compound',
  program = null,
  cartLines = [],
  customerPeriodStats = {},
  saleTemplates = [],
} = {}) {
  const normalizedCartLines = normalizeCartLines(cartLines)
  const normalizedRuntimeChannel = normalizeRuntimeChannelKey(runtimeChannel)
  const normalizedCustomerContext = normalizeRuntimeCustomerContext(customerContext)
  const normalizedSelectedId = String(selectedCampaignId || '').trim()
  const triggeredCampaignIds = normalizeCampaignIdSet(manuallyTriggeredCampaignIds)
  const activeCampaigns = campaigns.filter(campaign => isCampaignActiveNow(campaign, now))
  const visibleCampaigns = activeCampaigns
    .filter(campaign => matchesRuntimeChannel(campaign, normalizedRuntimeChannel))
    .map(campaign => buildCampaignCard(campaign, {
      runtimeChannel: normalizedRuntimeChannel,
      orderTotal: roundMoney(orderTotal),
      manualTriggeredCampaignIds: triggeredCampaignIds,
      runtimeWalletContext,
      cartLines: normalizedCartLines,
      customerPeriodStats,
      saleTemplates,
      ...normalizedCustomerContext,
    }, normalizedSelectedId))

  const eligibleCampaigns = visibleCampaigns
    .filter(campaign => campaign.orderEligible && campaign.offer)
    .sort((left, right) => {
      const priorityDiff = Number(left.priority || 0) - Number(right.priority || 0)
      if (priorityDiff !== 0) return priorityDiff
      return String(left.name || '').localeCompare(String(right.name || ''), 'tr')
    })

  // Conflict resolution: non-stackable campaigns compete within their exclusion group.
  // stackable=true → always wins, never blocked.
  // stackable=false, exclusionGroup='' → global exclusive pool; only highest-priority survives.
  // stackable=false, exclusionGroup='X' → only one winner per group 'X'.
  const blockedCampaignIds = new Set()
  const groupWinners = new Map() // groupKey → winner campaignId

  for (const campaign of eligibleCampaigns) {
    const isMultiplierCampaign = campaign.offer && (campaign.offer.actionType === 'points_earn_multiplier' || campaign.offer.actionType === 'points_redeem_multiplier')
    if (isMultiplierCampaign) continue // Multipliers are background stackable campaigns

    if (campaign.stackable) continue
    const groupKey = String(campaign.exclusionGroup || '').trim() || '__global__'
    if (!groupWinners.has(groupKey)) {
      groupWinners.set(groupKey, campaign.id)
    } else {
      blockedCampaignIds.add(campaign.id)
    }
  }

  const finalVisibleCampaigns = visibleCampaigns.map(campaign => {
    if (!blockedCampaignIds.has(campaign.id)) return campaign
    const groupKey = String(campaign.exclusionGroup || '').trim() || '__global__'
    const winnerId = groupWinners.get(groupKey)
    const winner = visibleCampaigns.find(c => c.id === winnerId)
    return {
      ...campaign,
      orderEligible: false,
      offer: null,
      statusTone: 'muted',
      statusLabel: winner ? `${winner.name} aktif, bu devre disi` : 'Baska kampanya aktif',
      blockedByCampaignId: winnerId || '',
      blockedByCampaignName: winner?.name || '',
    }
  })

  const applicableOffers = eligibleCampaigns
    .filter(campaign => !blockedCampaignIds.has(campaign.id))
    .map(campaign => ({
      ...campaign.offer,
      stackable: campaign.stackable,
      exclusionGroup: campaign.exclusionGroup || '',
      statusLabel: campaign.statusLabel,
      runtimeReason: campaign.runtimeReason,
      description: campaign.description || '',
    }))

  const finalStrategy = multiplierStrategy 
    || program?.metadata?.multiplier_strategy 
    || program?.metadata?.multiplierStrategy 
    || 'compound'

  const combinedEarnMultiplier = calculateCombinedEarnMultiplier(applicableOffers, normalizedCustomerContext.tierPointsMultiplier, finalStrategy)
  const combinedRedeemMultiplier = calculateCombinedRedeemMultiplier(applicableOffers, finalStrategy)

  // Recalculate redeem multiplier offer values if combinedRedeemMultiplier !== 1
  if (combinedRedeemMultiplier !== 1) {
    const updateRedeemOffer = (offer) => {
      if (offer && offer.actionType === 'points_redeem_multiplier') {
        const walletContext = runtimeWalletContext || null
        const redemptionRate = Number(offer.redemptionRate || walletContext?.redemptionRate || walletContext?.programRedemption?.redemptionRate || 0)
        const pointsBalance = Number(walletContext?.pointsBalance || 0)
        const pointValue = redemptionRate * combinedRedeemMultiplier
        if (pointValue > 0 && pointsBalance > 0) {
          const maxPointsForOrder = truncatePoints(orderTotal / pointValue)
          const usedPoints = roundPoints(Math.min(pointsBalance, maxPointsForOrder))
          const computedDiscount = roundMoney(Math.min(orderTotal, usedPoints * pointValue))
          
          offer.discountValue = computedDiscount
          offer.discountAmount = computedDiscount
          offer.offerLabel = `${usedPoints.toLocaleString('tr-TR')} puan ile ${formatAmount(computedDiscount)} indirim`
          offer.usedPoints = usedPoints
          offer.multiplier = combinedRedeemMultiplier
          if (offer.redemptionContext) {
            offer.redemptionContext.usedPoints = usedPoints
            offer.redemptionContext.multiplier = combinedRedeemMultiplier
            offer.redemptionContext.computedDiscount = computedDiscount
            offer.redemptionContext.discountAmount = computedDiscount
          }
        }
      }
    }

    applicableOffers.forEach(offer => updateRedeemOffer(offer))
    finalVisibleCampaigns.forEach(c => {
      if (c.offer) {
        updateRedeemOffer(c.offer)
      }
    })
  }

  return {
    visibleCampaigns: finalVisibleCampaigns,
    applicableOffers,
    combinedEarnMultiplier,
    combinedRedeemMultiplier,
  }
}

export async function prepareRuntimeWalletContext({
  customerContext = {},
  program = null,
  programId = '',
  walletType = 'points',
} = {}) {
  const normalizedProgramId = String(programId || program?.id || program?.programId || '').trim()
  const [walletReadiness, redemptionReadiness] = await Promise.all([
    resolveLoyaltyWalletBalance({
      customer: customerContext,
      customerId: customerContext.customerId,
      programId: normalizedProgramId,
      walletType,
    }),
    resolveLoyaltyProgramRedemptionModel({
      program,
      programId: normalizedProgramId,
    }),
  ])

  return {
    ...walletReadiness,
    programContextStatus: normalizedProgramId ? 'ready' : 'missing_program_context',
    programRedemption: redemptionReadiness,
    redemptionRate: redemptionReadiness.redemptionRate,
    redemptionUnit: redemptionReadiness.unit,
    readyForAsyncRedemption: Boolean(
      walletReadiness.ok
      && walletReadiness.status === 'ready'
      && walletReadiness.balanceKnown
      && redemptionReadiness.ok
      && redemptionReadiness.supported
    ),
    program: redemptionReadiness.program || program || null,
  }
}

export async function evaluateRuntimeOrderCampaignsAsync(campaigns = [], options = {}) {
  const walletReadiness = await prepareRuntimeWalletContext({
    customerContext: options.customerContext || {},
    program: options.program || null,
    programId: options.programId || options.loyaltyProgramId || options.program?.id || '',
    walletType: 'points',
  })

  const customerId = options.customerContext?.customerId
  const periodQueries = []
  const customerPeriodStats = {}

  if (customerId) {
    const activeCampaigns = campaigns.filter(c => isCampaignActiveNow(c, options.now || new Date()))
    const seenQueries = new Set()
    const audienceContext = options.customerContext || {}

    for (const campaign of activeCampaigns) {
      if (!matchesRuntimeChannel(campaign, options.runtimeChannel)) continue
      
      const audience = buildAudienceStatus(campaign, audienceContext)
      if (!audience.supported || !audience.matched) continue

      const rules = (campaign.applicableRules || []).filter(r => r.active !== false)
      for (const rule of rules) {
        const conditionEntries = getRuleConditionEntries(rule)
        for (const cond of conditionEntries) {
          if (
            cond.conditionKey === 'period_total_order_amount' ||
            cond.conditionKey === 'period_order_count' ||
            cond.conditionKey === 'period_product_quantity' ||
            cond.conditionKey === 'period_sold_product_quantity'
          ) {
            const config = cond.conditionConfig || {}
            const period = String(config.period || 'rolling_days')
            const periodDays = config.period === 'rolling_days' ? parseInt(config.periodDays || 30, 10) : 30
            const productMasks = Array.isArray(config.productMasks) ? config.productMasks : []
            
            const sortedMasks = [...productMasks].sort((a, b) => {
              const keyA = `${a.type || ''}:${a.itemId || ''}`
              const keyB = `${b.type || ''}:${b.itemId || ''}`
              return keyA.localeCompare(keyB)
            })
            const queryKey = `${period}:${periodDays}:${JSON.stringify(sortedMasks)}`
            
            if (!seenQueries.has(queryKey)) {
              seenQueries.add(queryKey)
              periodQueries.push({
                period,
                periodDays,
                productMasks,
                key: queryKey
              })
            }
          }
        }
      }
    }

    if (periodQueries.length > 0) {
      await Promise.all(
        periodQueries.map(async (q) => {
          try {
            const res = await db.rpc('get_customer_period_stats', {
              p_customer_id: customerId,
              p_period: q.period,
              p_period_days: q.periodDays,
              p_product_masks: q.productMasks
            })
            if (res && res.data && res.data[0]) {
              customerPeriodStats[q.key] = {
                total_amount: Number(res.data[0].total_amount || 0),
                order_count: Number(res.data[0].order_count || 0),
                product_quantity: Number(res.data[0].product_quantity || 0)
              }
            } else {
              customerPeriodStats[q.key] = { total_amount: 0, order_count: 0, product_quantity: 0 }
            }
          } catch (err) {
            console.error('[evaluateRuntimeOrderCampaignsAsync] Failed to fetch period stats:', q, err)
            customerPeriodStats[q.key] = { total_amount: 0, order_count: 0, product_quantity: 0 }
          }
        })
      )
    }
  }

  let saleTemplates = options.saleTemplates
  if (!saleTemplates && customerId && periodQueries.length > 0) {
    const hasSaleTemplateMask = periodQueries.some(q => 
      q.productMasks.some(m => String(m.type).toLowerCase() === 'sale_template')
    )
    if (hasSaleTemplateMask) {
      try {
        const res = await db.from('sale_templates').select('id,name,sale_ids')
        saleTemplates = res?.data || []
      } catch (err) {
        console.error('[evaluateRuntimeOrderCampaignsAsync] Failed to fetch sale templates', err)
      }
    }
  }
  if (!saleTemplates) {
    saleTemplates = []
  }

  return {
    ...evaluateRuntimeOrderCampaigns(campaigns, {
      ...options,
      customerPeriodStats,
      saleTemplates,
      runtimeWalletContext: walletReadiness,
      program: walletReadiness.program || options.program || null,
    }),
    walletReadiness,
  }
}

export function getRuntimeChannelLabel(runtimeChannel = 'pos') {
  const normalized = normalizeRuntimeChannelKey(runtimeChannel)
  if (normalized === 'call_center') return 'Call Center'
  if (normalized === 'masa') return 'Garson / Masa'
  if (normalized === 'kiosk') return 'Kiosk'
  if (normalized === 'online') return 'Online'
  if (normalized === 'mobile') return 'Mobil'
  return 'POS'
}
