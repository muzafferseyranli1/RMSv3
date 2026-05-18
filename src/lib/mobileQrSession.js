const SESSION_PREFIX = 'suitable_mobile_qr_session_v1'

function asText(value) {
  return String(value || '').trim()
}

function asPhone(value) {
  return asText(value).replace(/\D/g, '').slice(-10)
}

function asList(value) {
  return Array.isArray(value)
    ? value.map(item => asText(item)).filter(Boolean)
    : []
}

function buildKey(branchId, tableToken) {
  return `${SESSION_PREFIX}:${asText(branchId)}:${asText(tableToken)}`
}

function normalizeSession(value = {}) {
  return {
    phone: asPhone(value.phone),
    customerId: asText(value.customerId),
    customerName: asText(value.customerName),
    customerPhone: asPhone(value.customerPhone || value.phone),
    customerCategoryIds: asList(value.customerCategoryIds),
    selectedCampaignId: asText(value.selectedCampaignId),
    selectedCampaignName: asText(value.selectedCampaignName),
    selectedCouponCode: asText(value.selectedCouponCode).toUpperCase(),
    selectedCouponLabel: asText(value.selectedCouponLabel),
    advantageUpdatedAt: value.advantageUpdatedAt || null,
    updatedAt: value.updatedAt || null,
  }
}

export function readMobileQrSession({ branchId, tableToken }) {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.sessionStorage.getItem(buildKey(branchId, tableToken))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return normalizeSession(parsed)
  } catch {
    return null
  }
}

export function writeMobileQrSession({
  branchId,
  tableToken,
  phone = '',
  customerId = '',
  customerName = '',
  customerPhone = '',
  customerCategoryIds = [],
  selectedCampaignId = '',
  selectedCampaignName = '',
  selectedCouponCode = '',
  selectedCouponLabel = '',
  advantageUpdatedAt = '',
}) {
  try {
    if (typeof window === 'undefined') return null
    const previousValue = readMobileQrSession({ branchId, tableToken }) || {}
    const nextValue = normalizeSession({
      ...previousValue,
      phone: asPhone(phone),
      customerId: asText(customerId),
      customerName: asText(customerName),
      customerPhone: asPhone(customerPhone || phone),
      customerCategoryIds: customerCategoryIds.length > 0 ? customerCategoryIds : previousValue.customerCategoryIds,
      selectedCampaignId: selectedCampaignId || previousValue.selectedCampaignId,
      selectedCampaignName: selectedCampaignName || previousValue.selectedCampaignName,
      selectedCouponCode: selectedCouponCode || previousValue.selectedCouponCode,
      selectedCouponLabel: selectedCouponLabel || previousValue.selectedCouponLabel,
      advantageUpdatedAt,
      updatedAt: new Date().toISOString(),
    })
    window.sessionStorage.setItem(buildKey(branchId, tableToken), JSON.stringify(nextValue))
    return nextValue
  } catch {
    return null
  }
}

export function updateMobileQrAdvantage({ branchId, tableToken, selectedCampaignId = '', selectedCampaignName = '', selectedCouponCode = '', selectedCouponLabel = '' }) {
  try {
    if (typeof window === 'undefined') return null
    const previousValue = readMobileQrSession({ branchId, tableToken }) || {}
    const nextValue = normalizeSession({
      ...previousValue,
      selectedCampaignId,
      selectedCampaignName,
      selectedCouponCode,
      selectedCouponLabel,
      advantageUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    window.sessionStorage.setItem(buildKey(branchId, tableToken), JSON.stringify(nextValue))
    return nextValue
  } catch {
    return null
  }
}

export function clearMobileQrSession({ branchId, tableToken }) {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.removeItem(buildKey(branchId, tableToken))
  } catch {
    // Best-effort cleanup only.
  }
}
