import { readSettingValue, writeSettingValue } from '@/lib/settingsStore'

export const FAVORITE_PRODUCT_IDS_STORAGE_KEY = 'suitable_pos_favorite_products_v1'
export const FAVORITE_ORDER_STORAGE_KEY = 'suitable_pos_favorite_order'
export const VOID_LOG_STORAGE_KEY = 'suitable_pos_void_logs'

export const FAVORITE_PRODUCT_IDS_SETTING_KEY = 'pos_favorite_product_ids_v1'
export const FAVORITE_ORDER_SETTING_KEY = 'pos_favorite_order_v1'
export const VOID_LOGS_SETTING_KEY = 'pos_void_logs_v1'

export const FAVORITE_PRODUCT_IDS_UPDATED_EVENT = 'suitable:favorite-product-ids-updated'
export const FAVORITE_ORDER_UPDATED_EVENT = 'suitable:favorite-order-updated'
export const VOID_LOGS_UPDATED_EVENT = 'suitable:void-logs-updated'

function readLocalJson(storageKey, fallbackValue) {
  if (typeof window === 'undefined') return fallbackValue
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallbackValue
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

function clearLocalKey(storageKey) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Local cleanup is best-effort only.
  }
}

function dispatchWindowEvent(eventName, value) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(eventName, { detail: { value } }))
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(
    value
      .map(item => String(item || '').trim())
      .filter(Boolean),
  ))
}

function buildAllowedIdSet(allowedIds = []) {
  const normalizedAllowedIds = normalizeStringList(allowedIds)
  return normalizedAllowedIds.length > 0 ? new Set(normalizedAllowedIds) : null
}

function mergeOrderedIds(primaryIds = [], secondaryIds = [], allowedIds = []) {
  const allowedIdSet = buildAllowedIdSet(allowedIds)
  const merged = []
  const seen = new Set()

  const pushId = rawValue => {
    const nextValue = String(rawValue || '').trim()
    if (!nextValue || seen.has(nextValue)) return
    if (allowedIdSet && !allowedIdSet.has(nextValue)) return
    seen.add(nextValue)
    merged.push(nextValue)
  }

  normalizeStringList(primaryIds).forEach(pushId)
  normalizeStringList(secondaryIds).forEach(pushId)

  if (allowedIdSet) {
    Array.from(allowedIdSet).forEach(pushId)
  }

  return merged
}

function normalizeVoidLogs(value) {
  if (!Array.isArray(value)) return []

  const sorted = value
    .filter(entry => entry && typeof entry === 'object')
    .map(entry => ({
      ...entry,
      id: String(entry.id || '').trim(),
      created_at: typeof entry.created_at === 'string'
        ? entry.created_at
        : new Date(0).toISOString(),
    }))
    .filter(entry => entry.id)
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))

  const seen = new Set()
  const deduped = []

  sorted.forEach(entry => {
    if (seen.has(entry.id)) return
    seen.add(entry.id)
    deduped.push(entry)
  })

  return deduped.slice(0, 100)
}

function mergeVoidLogs(primaryLogs = [], secondaryLogs = []) {
  return normalizeVoidLogs([...(primaryLogs || []), ...(secondaryLogs || [])])
}

function listChanged(left = [], right = []) {
  return JSON.stringify(left || []) !== JSON.stringify(right || [])
}

export function readLocalFavoriteProductIdsSnapshot() {
  return normalizeStringList(readLocalJson(FAVORITE_PRODUCT_IDS_STORAGE_KEY, []))
}

export function readLocalFavoriteOrderSnapshot() {
  return normalizeStringList(readLocalJson(FAVORITE_ORDER_STORAGE_KEY, []))
}

export function readLocalVoidLogsSnapshot() {
  return normalizeVoidLogs(readLocalJson(VOID_LOG_STORAGE_KEY, []))
}

export async function hydrateFavoriteProductIdsFromDb() {
  const remoteValue = normalizeStringList(await readSettingValue(FAVORITE_PRODUCT_IDS_SETTING_KEY, []))
  const localValue = readLocalFavoriteProductIdsSnapshot()
  const mergedValue = mergeOrderedIds(remoteValue, localValue)

  if (listChanged(remoteValue, mergedValue)) {
    await writeSettingValue(FAVORITE_PRODUCT_IDS_SETTING_KEY, mergedValue)
  }

  if (localValue.length > 0) {
    clearLocalKey(FAVORITE_PRODUCT_IDS_STORAGE_KEY)
  }

  if (localValue.length > 0 || listChanged(remoteValue, mergedValue)) {
    dispatchWindowEvent(FAVORITE_PRODUCT_IDS_UPDATED_EVENT, mergedValue)
  }

  return mergedValue
}

export async function persistFavoriteProductIdsToDb(productIds = []) {
  const normalizedValue = normalizeStringList(productIds)
  await writeSettingValue(FAVORITE_PRODUCT_IDS_SETTING_KEY, normalizedValue)
  clearLocalKey(FAVORITE_PRODUCT_IDS_STORAGE_KEY)
  dispatchWindowEvent(FAVORITE_PRODUCT_IDS_UPDATED_EVENT, normalizedValue)
  return normalizedValue
}

export async function hydrateFavoriteOrderFromDb(favoriteIds = []) {
  const remoteValue = normalizeStringList(await readSettingValue(FAVORITE_ORDER_SETTING_KEY, []))
  const localValue = readLocalFavoriteOrderSnapshot()
  const mergedValue = mergeOrderedIds(remoteValue, localValue, favoriteIds)

  if (listChanged(remoteValue, mergedValue)) {
    await writeSettingValue(FAVORITE_ORDER_SETTING_KEY, mergedValue)
  }

  if (localValue.length > 0) {
    clearLocalKey(FAVORITE_ORDER_STORAGE_KEY)
  }

  if (localValue.length > 0 || listChanged(remoteValue, mergedValue)) {
    dispatchWindowEvent(FAVORITE_ORDER_UPDATED_EVENT, mergedValue)
  }

  return mergedValue
}

export async function persistFavoriteOrderToDb(orderIds = [], favoriteIds = []) {
  const normalizedValue = mergeOrderedIds(orderIds, [], favoriteIds)
  await writeSettingValue(FAVORITE_ORDER_SETTING_KEY, normalizedValue)
  clearLocalKey(FAVORITE_ORDER_STORAGE_KEY)
  dispatchWindowEvent(FAVORITE_ORDER_UPDATED_EVENT, normalizedValue)
  return normalizedValue
}

export async function hydrateVoidLogsFromDb() {
  const remoteValue = normalizeVoidLogs(await readSettingValue(VOID_LOGS_SETTING_KEY, []))
  const localValue = readLocalVoidLogsSnapshot()
  const mergedValue = mergeVoidLogs(remoteValue, localValue)

  if (listChanged(remoteValue, mergedValue)) {
    await writeSettingValue(VOID_LOGS_SETTING_KEY, mergedValue)
  }

  if (localValue.length > 0) {
    clearLocalKey(VOID_LOG_STORAGE_KEY)
  }

  if (localValue.length > 0 || listChanged(remoteValue, mergedValue)) {
    dispatchWindowEvent(VOID_LOGS_UPDATED_EVENT, mergedValue)
  }

  return mergedValue
}

export async function appendVoidLogToDb(entry) {
  const remoteValue = normalizeVoidLogs(await readSettingValue(VOID_LOGS_SETTING_KEY, []))
  const localValue = readLocalVoidLogsSnapshot()
  const nextValue = mergeVoidLogs([entry], mergeVoidLogs(remoteValue, localValue))

  await writeSettingValue(VOID_LOGS_SETTING_KEY, nextValue)
  clearLocalKey(VOID_LOG_STORAGE_KEY)
  dispatchWindowEvent(VOID_LOGS_UPDATED_EVENT, nextValue)
  return nextValue
}
