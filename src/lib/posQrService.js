function toSafeText(value) {
  return String(value || '').trim()
}

export function buildPosTableQrPayload({ branchId, tableId, tableToken, version = 1, baseUrl = '' }) {
  const safeBranchId = toSafeText(branchId)
  const safeTableId = toSafeText(tableId)
  const safeTableToken = toSafeText(tableToken)
  const safeVersion = Number(version) || 1
  const safeBaseUrl = toSafeText(baseUrl)

  const params = new URLSearchParams({ v: String(safeVersion) })
  if (safeBranchId) params.set('branch', safeBranchId)
  if (safeTableToken) params.set('tableToken', safeTableToken)
  else if (safeTableId) params.set('table', safeTableId)

  if (safeBaseUrl) return `${safeBaseUrl.replace(/\/$/, '')}?${params.toString()}`

  return `v=${safeVersion};branch=${safeBranchId};${safeTableToken ? `tableToken=${safeTableToken}` : `table=${safeTableId}`}`
}

export function getQrMenuBaseUrl() {
  if (typeof window === 'undefined') return '/mobil-app/qr-menu'
  return `${window.location.origin}/mobil-app/qr-menu`
}

export function createPosTableQrToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`
}
