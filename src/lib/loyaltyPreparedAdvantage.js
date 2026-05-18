function normalizeText(value) {
  return String(value || '').trim()
}

function resolveCampaignName(campaign = {}) {
  return normalizeText(
    campaign?.name
      || campaign?.campaignName
      || campaign?.title
      || campaign?.label,
  )
}

export function resolvePreparedLoyaltyAdvantage(linkedCustomer, campaignCatalog = []) {
  const selectedCampaignId = normalizeText(linkedCustomer?.selectedCampaignId)
  const selectedCampaignName = normalizeText(linkedCustomer?.selectedCampaignName)
  const selectedCouponCode = normalizeText(linkedCustomer?.selectedCouponCode).toUpperCase()
  const selectedCouponLabel = normalizeText(linkedCustomer?.selectedCouponLabel)
  const matchedCampaign = selectedCampaignId
    ? (campaignCatalog || []).find(campaign => normalizeText(campaign?.id) === selectedCampaignId) || null
    : null
  const resolvedSelectedCampaignName = selectedCampaignName || resolveCampaignName(matchedCampaign)
  const resolvedSelectedCouponLabel = selectedCouponLabel || selectedCouponCode

  return {
    selectedCampaignId,
    selectedCouponCode,
    resolvedSelectedCampaignName,
    resolvedSelectedCouponLabel,
    hasPreparedCampaign: Boolean(resolvedSelectedCampaignName),
    hasPreparedCoupon: Boolean(resolvedSelectedCouponLabel),
    hasPreparedAdvantage: Boolean(resolvedSelectedCampaignName || resolvedSelectedCouponLabel),
  }
}
