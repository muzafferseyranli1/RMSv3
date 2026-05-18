export const CALL_CENTER_STATUS_META = {
  scheduled: { label: 'Planli', color: '#8b5cf6', bg: 'rgba(139,92,246,.14)' },
  waiting: { label: 'KDS Bekliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  preparing: { label: 'Hazirlaniyor', color: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
  ready: { label: 'Hazir', color: '#22c55e', bg: 'rgba(34,197,94,.15)' },
  delivered: { label: 'Teslim Edildi', color: '#64748b', bg: 'rgba(100,116,139,.15)' },
  cancelled: { label: 'Iptal', color: '#ef4444', bg: 'rgba(239,68,68,.14)' },
}

export function isCallCenterChannelName(value) {
  const normalized = String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized.includes('call center') || normalized.includes('cagri')
}

export function getCallCenterKdsReleaseAt(promisedAt, now = new Date()) {
  const promisedDate = new Date(promisedAt)
  const safePromised = Number.isNaN(promisedDate.getTime()) ? new Date(now) : promisedDate
  const releaseDate = new Date(safePromised.getTime() - 60 * 60 * 1000)
  return releaseDate > now ? releaseDate : new Date(now)
}

export function toDateTimeLocalValue(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = input => String(input).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function formatCallCenterDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
}

export function getCallCenterFulfillmentType(order = {}) {
  const direct = String(order.fulfillment_type || '').trim()
  if (direct === 'delivery' || direct === 'pickup') return direct
  const marker = String(order.kiosk_table_number || order.order_note || '').toLocaleLowerCase('tr-TR')
  return marker.includes('gel') || marker.includes('pickup') ? 'pickup' : 'delivery'
}

export function getCallCenterFulfillmentLabel(order = {}) {
  return getCallCenterFulfillmentType(order) === 'pickup' ? 'Gel-al' : 'Adrese teslim'
}

export function getCallCenterAddressSummary(order = {}) {
  const snapshot = order.delivery_address_snapshot
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    return snapshot.line_1
      || [
        snapshot.neighborhood_name,
        snapshot.street,
        snapshot.building_no,
        snapshot.floor_no ? `${snapshot.floor_no}. kat` : '',
        snapshot.door_no ? `Daire ${snapshot.door_no}` : '',
      ].filter(Boolean).join(', ')
  }
  return ''
}

export function isMissingCallCenterScheduleColumn(error) {
  const message = String(error?.message || '').toLowerCase()
  return [
    'fulfillment_type',
    'promised_at',
    'kds_release_at',
    'delivery_address_snapshot',
  ].some(column => message.includes(column))
}

export function normalizeLegacyCallCenterOrder(order = {}) {
  const promisedAt = order.promised_at || order.sale_datetime || null
  return {
    ...order,
    fulfillment_type: getCallCenterFulfillmentType(order),
    promised_at: promisedAt,
    kds_release_at: order.kds_release_at || promisedAt,
    delivery_address_snapshot: order.delivery_address_snapshot || null,
  }
}

export function normalizeLegacyCallCenterOrders(orders = []) {
  return (orders || []).map(order => normalizeLegacyCallCenterOrder(order))
}

export function getCallCenterOperationalStatus(order = {}, now = new Date()) {
  if (order.status === 'cancelled') return 'cancelled'
  if (order.kds_status === 'delivered') return 'delivered'
  if (order.kds_status === 'ready') return 'ready'
  if (order.kds_status === 'in_progress') return 'preparing'
  const releaseAt = order.kds_release_at || order.sale_datetime
  const releaseDate = new Date(releaseAt)
  if (!Number.isNaN(releaseDate.getTime()) && releaseDate > now) return 'scheduled'
  return 'waiting'
}

export function getCallCenterStatusMeta(order = {}, now = new Date()) {
  return CALL_CENTER_STATUS_META[getCallCenterOperationalStatus(order, now)] || CALL_CENTER_STATUS_META.waiting
}

export function buildCallCenterOrderNote({
  fulfillmentType,
  promisedAt,
  addressText = '',
  branchName = '',
  loyaltyName = '',
}) {
  const fulfillmentLabel = fulfillmentType === 'pickup' ? 'Gel-al' : 'Teslimat'
  return [
    'Cagri merkezi',
    fulfillmentLabel,
    `Teslim/alis zamani: ${formatCallCenterDateTime(promisedAt)}`,
    fulfillmentType === 'delivery' && addressText ? `Adres: ${addressText}` : '',
    fulfillmentType === 'pickup' && branchName ? `Sube teslim: ${branchName}` : '',
    loyaltyName ? `Sadakat: ${loyaltyName}` : '',
  ].filter(Boolean).join(' | ')
}
