export function normalizeLoyaltyApplicationMode(value) {
  return String(value || '').trim().toLowerCase() === 'auto' ? 'auto' : 'prompt'
}

export function getLoyaltyApplicationModeLabel(value) {
  return normalizeLoyaltyApplicationMode(value) === 'auto'
    ? 'Otomatik uygula'
    : 'Kasiyere sor'
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export function buildProportionalDiscountAllocations(items = [], {
  discountAmount = 0,
  getKey = (_, index) => index,
  getLineTotal = item => item?.total || 0,
  getQty = item => item?.qty || 1,
} = {}) {
  const safeItems = Array.isArray(items) ? items : []
  const safeDiscountAmount = roundMoney(discountAmount || 0)
  const grossBefore = roundMoney(
    safeItems.reduce((sum, item) => sum + roundMoney(getLineTotal(item)), 0),
  )

  let allocatedDiscount = 0

  return safeItems.map((item, index) => {
    const lineTotalBeforeDiscount = roundMoney(getLineTotal(item))
    const isLastItem = index === safeItems.length - 1
    const lineDiscountAmount = safeDiscountAmount <= 0 || grossBefore <= 0
      ? 0
      : (
        isLastItem
          ? roundMoney(safeDiscountAmount - allocatedDiscount)
          : roundMoney((lineTotalBeforeDiscount / grossBefore) * safeDiscountAmount)
      )

    allocatedDiscount = roundMoney(allocatedDiscount + lineDiscountAmount)

    const qty = Math.max(0, Number(getQty(item)) || 0)
    const lineTotalAfterDiscount = roundMoney(Math.max(0, lineTotalBeforeDiscount - lineDiscountAmount))
    const unitPriceAfterDiscount = qty > 0
      ? roundMoney(lineTotalAfterDiscount / qty)
      : 0

    return {
      key: String(getKey(item, index)),
      lineTotalBeforeDiscount,
      lineDiscountAmount,
      lineTotalAfterDiscount,
      unitPriceAfterDiscount,
    }
  })
}

export function buildProportionalDiscountMap(items = [], options = {}) {
  return new Map(
    buildProportionalDiscountAllocations(items, options).map(item => [String(item.key), item]),
  )
}

export function buildSaleDiscountSource(loyaltyCampaign = null, discountAmount = 0) {
  if (loyaltyCampaign?.campaignId) return 'loyalty'
  return roundMoney(discountAmount) > 0 ? 'manual' : null
}

function normalizeSaleDiscountTypeValue(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (
    normalized === 'percent'
    || normalized.endsWith('_percent')
    || normalized.includes('discount_percent')
  ) {
    return 'percent'
  }
  if (
    normalized === 'amount'
    || normalized === 'fixed'
    || normalized.endsWith('_amount')
    || normalized.includes('discount_amount')
  ) {
    return 'amount'
  }
  return null
}

export function resolveSaleDiscountType(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nestedMatch = resolveSaleDiscountType(...value)
      if (nestedMatch) return nestedMatch
      continue
    }
    const normalized = normalizeSaleDiscountTypeValue(value)
    if (normalized) return normalized
  }
  return null
}

/**
 * Build loyalty fields for sales persistence.
 * Extended with coupon code, actions summary and decision context for audit/readback.
 * All new fields are nullable for backward compatibility with existing records.
 */
export function buildSaleLoyaltyFields(loyaltyCampaign = null, discountAmount = 0) {
  // Serialize applied actions summary if present
  let appliedActionsJson = null
  if (loyaltyCampaign?.appliedActionsSummary) {
    try {
      appliedActionsJson = JSON.stringify(loyaltyCampaign.appliedActionsSummary)
    } catch {
      appliedActionsJson = null
    }
  }
  
  // Serialize decision context if present
  let decisionContextJson = null
  if (loyaltyCampaign?.decisionContext) {
    try {
      decisionContextJson = JSON.stringify(loyaltyCampaign.decisionContext)
    } catch {
      decisionContextJson = null
    }
  }
  
  return {
    discount_source: buildSaleDiscountSource(loyaltyCampaign, discountAmount),
    loyalty_campaign_id: loyaltyCampaign?.campaignId || null,
    loyalty_campaign_name: loyaltyCampaign?.campaignName || null,
    loyalty_application_mode: loyaltyCampaign?.applicationMode || null,
    loyalty_action_type: loyaltyCampaign?.actionType || null,
    loyalty_offer_label: loyaltyCampaign?.offerLabel || null,
    loyalty_source_rule_id: loyaltyCampaign?.sourceRuleId || null,
    // New expanded fields for audit/readback (nullable for backward compatibility)
    loyalty_selected_coupon_code: loyaltyCampaign?.selectedCouponCode || null,
    loyalty_applied_actions_json: appliedActionsJson,
    loyalty_decision_context_json: decisionContextJson,
  }
}

export function attachLoyaltyToSaleHeader(header = {}, loyaltyCampaign = null, discountAmount = 0) {
  return {
    ...header,
    ...buildSaleLoyaltyFields(loyaltyCampaign, discountAmount),
  }
}

export function attachLoyaltyToSaleLines(lines = [], loyaltyCampaign = null, discountAmount = 0) {
  const loyaltyFields = buildSaleLoyaltyFields(loyaltyCampaign, discountAmount)

  return (lines || []).map(line => ({
    ...line,
    ...loyaltyFields,
    loyalty_discount_allocated_amount: loyaltyCampaign?.campaignId
      ? roundMoney(line.discount_allocated_amount || 0)
      : 0,
  }))
}

export function buildLegacySaleItemsSnapshot(items = [], discountAmount = 0, loyaltyCampaign = null, orderNote = '') {
  const itemDiscounts = buildProportionalDiscountAllocations(items, {
    discountAmount,
    getKey: (_, index) => index,
    getLineTotal: item => item?.total || 0,
    getQty: item => item?.qty || 1,
  })
  const loyaltyFields = buildSaleLoyaltyFields(loyaltyCampaign, discountAmount)

  return (items || []).map((item, index) => {
    const discountRow = itemDiscounts[index] || null
    return {
      product_id: item.product_id,
      product_name: item.product_name,
      portion: item.portion,
      options: item.options,
      note: item.note || '',
      order_note: orderNote || '',
      unit_price: item.unit_price,
      qty: item.qty,
      total: item.total,
      discount_allocated_amount: discountRow?.lineDiscountAmount || 0,
      loyalty_discount_allocated_amount: loyaltyCampaign?.campaignId
        ? roundMoney(discountRow?.lineDiscountAmount || 0)
        : 0,
      unit_price_after_discount: discountRow?.unitPriceAfterDiscount ?? roundMoney(item.unit_price || 0),
      line_total_after_discount: discountRow?.lineTotalAfterDiscount ?? roundMoney(item.total || 0),
      ...loyaltyFields,
    }
  })
}

export function isLoyaltyPersistenceColumnError(error) {
  const code = String(error?.code || '').trim().toLowerCase()
  const text = [
    error?.message,
    error?.details,
    error?.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (code === 'pgrst204' || code === '42703') return true

  // Original columns + new expanded audit/readback columns
  return [
    'discount_source',
    'loyalty_campaign_id',
    'loyalty_campaign_name',
    'loyalty_application_mode',
    'loyalty_action_type',
    'loyalty_offer_label',
    'loyalty_source_rule_id',
    'loyalty_discount_allocated_amount',
    // New expanded columns
    'loyalty_selected_coupon_code',
    'loyalty_applied_actions_json',
    'loyalty_decision_context_json',
  ].some(token => text.includes(token))
}

/**
 * Create loyalty snapshot object from campaign evaluation result.
 * Extended with coupon code, actions summary and decision context for audit/readback.
 * These fields are optional and will be null if not provided by the campaign evaluation.
 */
export function createSaleLoyaltySnapshot(campaign = null) {
  if (!campaign?.campaignId) return null

  return {
    campaignId: String(campaign.campaignId),
    campaignName: String(campaign.campaignName || ''),
    applicationMode: normalizeLoyaltyApplicationMode(campaign.applicationMode),
    actionType: String(campaign.actionType || ''),
    sourceRuleId: String(campaign.sourceRuleId || ''),
    offerLabel: String(campaign.offerLabel || ''),
    discountType: String(campaign.discountType || ''),
    discountValue: Number(campaign.discountValue || 0),
    discountAmount: Number(campaign.discountAmount || 0),
    // New expanded fields for audit/readback
    selectedCouponCode: String(campaign.selectedCouponCode || '') || null,
    appliedActionsSummary: campaign.appliedActionsSummary || null,
    decisionContext: campaign.decisionContext || null,
    redemptionContext: campaign.redemptionContext || campaign.decisionContext?.redemptionContext || null,
  }
}
