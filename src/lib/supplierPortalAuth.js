const SUPPLIER_PORTAL_SESSION_KEY = 'suitable_supplier_portal_session_v1'

function safeParse(value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getSupplierPortalSession() {
  if (!canUseStorage()) return null
  try {
    return safeParse(window.localStorage.getItem(SUPPLIER_PORTAL_SESSION_KEY), null)
  } catch {
    return null
  }
}

export function setSupplierPortalSession(session) {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(SUPPLIER_PORTAL_SESSION_KEY, JSON.stringify(session || null))
  } catch {
    // no-op
  }
}

export function clearSupplierPortalSession() {
  if (!canUseStorage()) return
  try {
    window.localStorage.removeItem(SUPPLIER_PORTAL_SESSION_KEY)
  } catch {
    // no-op
  }
}

export function createBypassSupplierSession(supplier) {
  const supplierId = String(supplier?.id || '')
  return {
    supplier_id: supplierId,
    supplier_name: supplier?.name || '',
    auth_mode: 'bypass',
    auth_provider: 'supplier_password_v1',
    auth_ready: true,
    login_required: true,
    created_at: new Date().toISOString(),
  }
}

export function bootstrapSupplierPortalSession(suppliers, preferredSupplierId = '') {
  const list = Array.isArray(suppliers) ? suppliers.filter(Boolean) : []
  if (!list.length) return null

  const current = getSupplierPortalSession()
  const currentSupplierId = String(current?.supplier_id || '')
  if (currentSupplierId && list.some(item => String(item.id) === currentSupplierId)) {
    return current
  }

  const preferred = list.find(item => String(item.id) === String(preferredSupplierId || ''))
  const fallback = preferred || list[0]
  const session = createBypassSupplierSession(fallback)
  setSupplierPortalSession(session)
  return session
}
