function toSafeText(value) {
  return String(value || '').trim()
}

export function buildPosTableQrPayload({ branchId, tableId, tableToken, version = 1, baseUrl = '' }) {
  const safeBranchId = toSafeText(branchId)
  const safeTableId = toSafeText(tableId)
  const safeTableToken = toSafeText(tableToken)
  const safeVersion = Number(version) || 1
  const safeBaseUrl = toSafeText(baseUrl)

  const params = new URLSearchParams()
  if (safeVersion !== 1) params.set('v', String(safeVersion))
  if (safeBranchId) params.set('b', safeBranchId)
  if (safeTableToken) params.set('t', safeTableToken)
  else if (safeTableId) params.set('table', safeTableId)

  if (safeBaseUrl) {
    // Mobil okumayı kolaylaştırmak için çok kısa link üretilir: /q/TOKEN
    const base = safeBaseUrl.replace(/\/mobil-app\/qr-menu\/?$/, '').replace(/\/$/, '')
    // Eğer branchId'ye gerçekten ihtiyaç varsa query param eklenebilir, ancak kısa token unique olduğu için genelde gerekmez
    // Güvence için b parametresini ekliyoruz ama link genel olarak yine kısa kalır: http://localhost:5173/q/TOKEN?b=xxx
    const query = params.toString()
    if (safeTableToken && !safeTableId) {
      return `${base}/q/${safeTableToken}${query ? `?${query}` : ''}`
    }
    return `${base}/mobil-app/qr-menu?${query}`
  }

  return `v=${safeVersion};branch=${safeBranchId};${safeTableToken ? `tableToken=${safeTableToken}` : `table=${safeTableId}`}`
}

export function getQrMenuBaseUrl() {
  if (typeof window === 'undefined') return '/mobil-app/qr-menu'
  return `${window.location.origin}/mobil-app/qr-menu`
}

export function createPosTableQrToken() {
  // Çok daha kısa (8 karakter) ve kolay okunabilir, global unique token (örn. X7K9A2M4)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
