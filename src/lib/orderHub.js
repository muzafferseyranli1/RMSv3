import {
  formatCallCenterDateTime,
  getCallCenterAddressSummary,
  getCallCenterFulfillmentLabel,
} from '@/lib/callCenterOrders'

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeNumber(value, fallback = 0) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

export const ORDER_HUB_STATUS_META = {
  waiting: { label: 'Bekliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  open: { label: 'Acik', color: '#0ea5e9', bg: 'rgba(14,165,233,.15)' },
  closed: { label: 'Kapali', color: '#16a34a', bg: 'rgba(22,163,74,.15)' },
  cancelled: { label: 'Iptal', color: '#ef4444', bg: 'rgba(239,68,68,.14)' },
}

export function getOrderHubSourceMeta(order = {}) {
  const sourceType = normalizeText(order.source_channel_type || order.sourceChannelType || '')
  const channelName = normalizeText(order.sales_channel_name || order.salesChannelName || '')
  const sourceName = normalizeText(order.source || '')

  if (order.kind === 'open_ticket') return { group: 'masa', label: 'Masa' }
  if (sourceType === 'call_center' || channelName.includes('call center') || channelName.includes('cagri')) {
    return { group: 'call_center', label: 'Call Center' }
  }
  if (sourceType === 'masa' || channelName === 'masa') return { group: 'masa', label: 'Masa' }
  if (channelName.includes('gel al') || channelName.includes('gel-al')) return { group: 'gel_al', label: 'Gel Al' }
  if (sourceType === 'kiosk' || channelName.includes('kiosk') || sourceName === 'kiosk') return { group: 'kiosk', label: 'Kiosk' }
  if (channelName.includes('suitable yemek') || channelName.includes('mobil')) return { group: 'mobile', label: 'Mobil' }
  if (channelName.includes('online')) return { group: 'online', label: 'Online' }
  if (
    channelName.includes('yemeksepeti')
    || channelName.includes('yemek sepeti')
    || channelName.includes('getir')
    || channelName.includes('trendyol')
    || channelName.includes('migros')
    || channelName.includes('tikla gelsin')
  ) {
    return { group: 'marketplace', label: 'Pazaryeri' }
  }
  if (sourceType === 'hizli_satis' || channelName.includes('hizli satis')) {
    return { group: 'hizli_satis', label: 'Hizli Satis' }
  }
  return { group: 'other', label: order.sales_channel_name || order.source_channel_type || 'Diger' }
}

export function getOrderHubUnifiedStatus(order = {}, now = new Date()) {
  if (order.kind === 'open_ticket') return 'open'
  if (order.status === 'cancelled') return 'cancelled'

  const kdsStatus = normalizeText(order.kds_status || '')
  if (kdsStatus === 'pending') return 'waiting'
  if (['in_progress', 'preparing', 'ready'].includes(kdsStatus)) return 'open'
  if (['delivered', 'completed', 'closed'].includes(kdsStatus)) return 'closed'

  const promisedAt = order.promised_at || order.kds_release_at || null
  if (promisedAt) {
    const targetDate = new Date(promisedAt)
    if (!Number.isNaN(targetDate.getTime()) && targetDate > now) return 'waiting'
  }

  if (order.status === 'completed') return 'closed'
  return 'open'
}

export function getOrderHubStatusMeta(order = {}, now = new Date()) {
  return ORDER_HUB_STATUS_META[getOrderHubUnifiedStatus(order, now)] || ORDER_HUB_STATUS_META.open
}

export function getOrderHubTimingLabel(order = {}) {
  return formatCallCenterDateTime(order.promised_at || order.updatedAt || order.sale_datetime || order.created_at)
}

export function getOrderHubSummary(order = {}) {
  if (order.kind === 'open_ticket') {
    return order.table_label || order.kiosk_table_number || order.order_note || '-'
  }
  const sourceMeta = getOrderHubSourceMeta(order)
  if (sourceMeta.group === 'call_center') {
    return getCallCenterAddressSummary(order) || order.order_note || '-'
  }
  if (sourceMeta.group === 'masa') {
    return order.kiosk_table_number || order.order_note || '-'
  }
  return order.order_note || order.kiosk_table_number || getCallCenterAddressSummary(order) || '-'
}

export function getOrderHubFlowLabel(order = {}) {
  const sourceMeta = getOrderHubSourceMeta(order)
  if (order.kind === 'open_ticket') return 'Acik Adisyon'
  if (sourceMeta.group === 'call_center') return getCallCenterFulfillmentLabel(order)
  if (sourceMeta.group === 'gel_al') return 'Gel Al'
  if (sourceMeta.group === 'masa') return 'Masa Servisi'
  return sourceMeta.label
}

export function normalizeOrderHubSale(order = {}) {
  const sourceMeta = getOrderHubSourceMeta(order)
  const summary = getOrderHubSummary(order)
  return {
    ...order,
    kind: 'sale',
    source_group: sourceMeta.group,
    source_label: sourceMeta.label,
    orderhub_status: getOrderHubUnifiedStatus(order),
    orderhub_summary: summary,
    orderhub_flow_label: getOrderHubFlowLabel(order),
    searchableText: normalizeText([
      order.sale_no,
      order.customer_name,
      order.branch_name,
      order.sales_channel_name,
      order.source_channel_type,
      summary,
      order.kiosk_table_number,
    ].filter(Boolean).join(' ')),
  }
}

export function normalizeOrderHubOpenTicket({
  branchId,
  branchName,
  tableKey,
  tableLabel,
  ticket = {},
}) {
  const cart = Array.isArray(ticket.cart) ? ticket.cart : []
  const total = cart.reduce((sum, item) => sum + (safeNumber(item?.qty, 1) * safeNumber(item?.unitPrice || item?.unit_price)), 0)
  const updatedAt = ticket.updatedAt || new Date().toISOString()
  const summary = String(ticket.orderNote || '').trim() || tableLabel || 'Acik adisyon'

  return {
    id: `open_ticket:${branchId || 'default'}:${tableKey}`,
    kind: 'open_ticket',
    source: 'open_ticket',
    source_channel_type: 'masa',
    sales_channel_name: 'Masa',
    source_group: 'masa',
    source_label: 'Masa',
    orderhub_status: 'open',
    orderhub_flow_label: 'Acik Adisyon',
    sale_no: null,
    sale_datetime: updatedAt,
    updatedAt,
    status: 'open',
    kds_status: 'open_ticket',
    customer_name: ticket.ownerName || 'Acik Masa',
    branch_id: branchId || '',
    branch_name: branchName || '',
    gross_total_after_discount: total,
    payment_total: 0,
    order_note: ticket.orderNote || '',
    kiosk_table_number: tableLabel || '',
    table_label: tableLabel || '',
    open_ticket_key: tableKey,
    cart_snapshot: cart,
    owner_name: ticket.ownerName || '',
    owner_id: ticket.ownerId || '',
    promised_at: updatedAt,
    kds_release_at: updatedAt,
    delivery_address_snapshot: null,
    orderhub_summary: summary,
    searchableText: normalizeText([
      tableLabel,
      ticket.ownerName,
      ticket.orderNote,
      branchName,
      'masa',
      'acik adisyon',
    ].filter(Boolean).join(' ')),
  }
}
