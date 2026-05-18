import { db } from '@/lib/db'

export const TABLE_REQUEST_TYPES = {
  call_waiter: 'call_waiter',
  bill_request: 'bill_request',
  online_payment_interest: 'online_payment_interest',
}

export const TABLE_REQUEST_STATUSES = {
  pending: 'pending',
  acknowledged: 'acknowledged',
  resolved: 'resolved',
  cancelled: 'cancelled',
}

function asText(value) {
  return String(value || '').trim()
}

function asPhone(value) {
  return asText(value).replace(/\D/g, '').slice(-10)
}

function normalizeRequest(row = {}) {
  return {
    id: asText(row.id),
    branchId: asText(row.branch_id),
    tableId: asText(row.table_id),
    requestType: asText(row.request_type),
    status: asText(row.status || TABLE_REQUEST_STATUSES.pending),
    requestedPhone: asPhone(row.requested_phone),
    customerId: asText(row.customer_id),
    requestedAt: row.requested_at || row.created_at || null,
    acknowledgedAt: row.acknowledged_at || null,
    acknowledgedByStaffId: asText(row.acknowledged_by_staff_id),
    acknowledgedByStaffName: asText(row.acknowledged_by_staff_name),
    resolvedAt: row.resolved_at || null,
    source: asText(row.source || 'qr_menu'),
  }
}

function ensureBranchId(branchId) {
  const safeBranchId = asText(branchId)
  if (!safeBranchId) throw new Error('Sube baglami bulunamadi.')
  return safeBranchId
}

function ensureTableId(tableId) {
  const safeTableId = asText(tableId)
  if (!safeTableId) throw new Error('Masa kimligi bulunamadi.')
  return safeTableId
}

function ensureRequestId(requestId) {
  const safeRequestId = asText(requestId)
  if (!safeRequestId) throw new Error('Talep kimligi bulunamadi.')
  return safeRequestId
}

export async function createTableServiceRequest({
  branchId,
  tableId,
  requestType,
  requestedPhone = '',
  customerId = '',
  source = 'qr_menu',
}) {
  const safeBranchId = ensureBranchId(branchId)
  const safeTableId = ensureTableId(tableId)
  const safeRequestType = asText(requestType)
  if (!Object.values(TABLE_REQUEST_TYPES).includes(safeRequestType)) {
    throw new Error('Gecersiz masa talebi tipi.')
  }

  const payload = {
    branch_id: safeBranchId,
    table_id: safeTableId,
    request_type: safeRequestType,
    status: TABLE_REQUEST_STATUSES.pending,
    requested_phone: asPhone(requestedPhone) || null,
    customer_id: asText(customerId) || null,
    source: asText(source) || 'qr_menu',
    requested_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('table_service_requests')
    .insert(payload)
    .select('*')
    .single()

  if (error) throw error
  return normalizeRequest(data)
}

export async function loadActiveTableServiceRequests(branchId) {
  const safeBranchId = ensureBranchId(branchId)
  const { data, error } = await db
    .from('table_service_requests')
    .select('*')
    .eq('branch_id', safeBranchId)
    .in('status', [TABLE_REQUEST_STATUSES.pending, TABLE_REQUEST_STATUSES.acknowledged])
    .order('requested_at', { ascending: false })

  if (error) throw error
  return (data || []).map(normalizeRequest)
}

export async function acknowledgeTableServiceRequest(requestId, staff = {}) {
  const safeRequestId = ensureRequestId(requestId)
  const payload = {
    status: TABLE_REQUEST_STATUSES.acknowledged,
    acknowledged_at: new Date().toISOString(),
    acknowledged_by_staff_id: asText(staff?.id) || null,
    acknowledged_by_staff_name: asText(staff?.name) || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('table_service_requests')
    .update(payload)
    .eq('id', safeRequestId)
    .select('*')
    .single()

  if (error) throw error
  return normalizeRequest(data)
}

export async function resolveTableServiceRequest(requestId, staff = {}) {
  const safeRequestId = ensureRequestId(requestId)
  const payload = {
    status: TABLE_REQUEST_STATUSES.resolved,
    resolved_at: new Date().toISOString(),
    acknowledged_at: new Date().toISOString(),
    acknowledged_by_staff_id: asText(staff?.id) || null,
    acknowledged_by_staff_name: asText(staff?.name) || null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await db
    .from('table_service_requests')
    .update(payload)
    .eq('id', safeRequestId)
    .select('*')
    .single()

  if (error) throw error
  return normalizeRequest(data)
}

export function summarizeTableServiceRequests(requests = []) {
  const summary = {
    pendingCount: 0,
    acknowledgedCount: 0,
    hasCallWaiter: false,
    hasBillRequest: false,
    hasOnlinePaymentInterest: false,
    acknowledgedBy: '',
  }

  for (const request of requests || []) {
    if (request.status === TABLE_REQUEST_STATUSES.pending) summary.pendingCount += 1
    if (request.status === TABLE_REQUEST_STATUSES.acknowledged) {
      summary.acknowledgedCount += 1
      if (!summary.acknowledgedBy && request.acknowledgedByStaffName) {
        summary.acknowledgedBy = request.acknowledgedByStaffName
      }
    }
    if (request.requestType === TABLE_REQUEST_TYPES.call_waiter) summary.hasCallWaiter = true
    if (request.requestType === TABLE_REQUEST_TYPES.bill_request) summary.hasBillRequest = true
    if (request.requestType === TABLE_REQUEST_TYPES.online_payment_interest) summary.hasOnlinePaymentInterest = true
  }

  return summary
}
