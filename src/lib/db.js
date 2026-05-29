import { getTerminalRole, getSlaveConfig, getTerminalId, getBranchId, isDesktopMode, injectTerminalFields } from './terminalIdentity.js'

const DEFAULT_API_URL = 'https://rms-api-production-219d.up.railway.app'
const LOCAL_API_URLS = ['http://127.0.0.1:3001', 'http://localhost:3001']
const API_URL_CACHE_KEY = 'suitable_rms_api_base_url_v1'

let resolvedApiBaseUrl = ''

function normalizeApiBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '')
}

function isLocalBrowserHost() {
  if (typeof window === 'undefined') return false
  const host = String(window.location?.hostname || '').trim().toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

function readCachedApiBaseUrl() {
  if (typeof window === 'undefined') return ''
  try {
    return normalizeApiBaseUrl(window.localStorage.getItem(API_URL_CACHE_KEY))
  } catch {
    return ''
  }
}

function writeCachedApiBaseUrl(value) {
  if (typeof window === 'undefined') return
  try {
    const normalized = normalizeApiBaseUrl(value)
    if (normalized) window.localStorage.setItem(API_URL_CACHE_KEY, normalized)
  } catch {
    // Best-effort cache only.
  }
}

function collectApiBaseUrls() {
  const explicitApiUrl = normalizeApiBaseUrl(
    (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) ||
    (import.meta.env && import.meta.env.VITE_API_URL) ||
    ''
  )
  const cachedApiUrl = normalizeApiBaseUrl(resolvedApiBaseUrl || readCachedApiBaseUrl())
  const fallbackUrls = []

  if (isLocalBrowserHost()) {
    fallbackUrls.push(...LOCAL_API_URLS)
  }

  fallbackUrls.push(explicitApiUrl || DEFAULT_API_URL)
  if (explicitApiUrl && explicitApiUrl !== DEFAULT_API_URL) {
    fallbackUrls.push(DEFAULT_API_URL)
  }

  return [...new Set([cachedApiUrl, ...fallbackUrls].filter(Boolean))]
}

async function requestApi(path, init = {}) {
  const candidates = collectApiBaseUrls()
  let lastError = null

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, init)
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        lastError = new Error(text || `HTTP ${response.status} @ ${baseUrl}`)
        continue
      }
      resolvedApiBaseUrl = baseUrl
      writeCachedApiBaseUrl(baseUrl)
      return { response, baseUrl }
    } catch (error) {
      lastError = new Error(`${baseUrl}: ${error?.message || 'Failed to fetch'}`)
    }
  }

  throw lastError || new Error(`API erisilemedi. Denenen adresler: ${candidates.join(', ')}`)
}

async function queryApi(body) {
  try {
    const { response } = await requestApi('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return await response.json()
  } catch (err) {
    return { data: null, error: { message: err.message } }
  }
}

async function routedQueryApi(body) {
  if (!isDesktopMode()) {
    // Web/dev ortamı → mevcut Railway yolu (hiç değişmez)
    return queryApi(body)
  }

  const role = getTerminalRole()

  if (role === 'slave') {
    // YAN KASA → Ana Kasanın LAN HTTP sunucusuna gönder
    const { masterIp, masterPort } = getSlaveConfig()
    const response = await fetch(`http://${masterIp}:${masterPort}/lan/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Terminal-Id': getTerminalId() ?? '',
        'X-Branch-Id': getBranchId() ?? '',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`LAN query failed: ${response.status}`)
    return response.json()
  }

  if (role === 'master') {
    // ANA KASA → Kendi LAN sunucusuna istek atmadan doğrudan IPC ile
    // (main process'te executeQuery çağrılır — FAZ 6'da IPC handler eklenir)
    // Şimdilik fallback: normal Railway yolu
    return queryApi(body)
  }

  // Pairing yapılmamış → normal Railway yolu
  return queryApi(body)
}

export function getApiBaseUrl() {
  const explicitApiUrl = (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) ||
    (import.meta.env && import.meta.env.VITE_API_URL) ||
    '';
  return collectApiBaseUrls()[0] || normalizeApiBaseUrl(explicitApiUrl || DEFAULT_API_URL)
}

export function buildApiUrl(path = '') {
  const normalizedPath = String(path || '')
  if (!normalizedPath) return getApiBaseUrl()
  return `${getApiBaseUrl()}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`
}

export async function uploadApiFile(formData) {
  const { response } = await requestApi('/api/upload', {
    method: 'POST',
    body: formData,
  })
  const result = await response.json().catch(() => ({ data: null, error: { message: `HTTP ${response.status}` } }))
  if (result?.error) {
    throw new Error(result.error.message || `HTTP ${response.status}`)
  }
  return result.data
}

class QueryBuilder {
  constructor(table) {
    this._table = table
    this._operation = 'select'
    this._select = '*'
    this._filters = []
    this._data = null
    this._options = {}
  }

  select(cols = '*') {
    this._select = cols
    if (!['insert', 'update', 'delete', 'upsert'].includes(this._operation)) {
      this._operation = 'select'
    }
    return this
  }

  insert(data) {
    this._operation = 'insert'
    this._data = data
    return this
  }

  update(data) {
    this._operation = 'update'
    this._data = data
    return this
  }

  delete() {
    this._operation = 'delete'
    return this
  }

  upsert(data, opts = {}) {
    this._operation = 'upsert'
    this._data = data
    this._options = { ...this._options, ...opts }
    return this
  }

  eq(col, val)           { this._filters.push({ type: 'eq', col, val }); return this }
  neq(col, val)          { this._filters.push({ type: 'neq', col, val }); return this }
  is(col, val)           { this._filters.push({ type: 'is', col, val }); return this }
  not(col, op, val)      { this._filters.push({ type: 'not', col, op, val }); return this }
  in(col, val)           { this._filters.push({ type: 'in', col, val }); return this }
  gt(col, val)           { this._filters.push({ type: 'gt', col, val }); return this }
  gte(col, val)          { this._filters.push({ type: 'gte', col, val }); return this }
  lt(col, val)           { this._filters.push({ type: 'lt', col, val }); return this }
  lte(col, val)          { this._filters.push({ type: 'lte', col, val }); return this }
  like(col, val)         { this._filters.push({ type: 'like', col, val }); return this }
  ilike(col, val)        { this._filters.push({ type: 'ilike', col, val }); return this }
  contains(col, val)     { this._filters.push({ type: 'contains', col, val }); return this }
  overlaps(col, val)     { this._filters.push({ type: 'overlaps', col, val }); return this }
  or(val)                { this._filters.push({ type: 'or', val }); return this }


  order(col, opts = {}) {
    this._filters.push({ type: 'order', col, ascending: opts.ascending !== false })
    return this
  }

  limit(n) {
    this._filters.push({ type: 'limit', val: n })
    return this
  }

  range(from, to) {
    this._filters.push({ type: 'range', from, to })
    return this
  }

  async maybeSingle() {
    this._filters.push({ type: 'limit', val: 1 })
    const result = await this._execute()
    if (result.error) return result
    const arr = Array.isArray(result.data) ? result.data : (result.data != null ? [result.data] : [])
    return { data: arr[0] ?? null, error: null }
  }

  async single() {
    this._filters.push({ type: 'limit', val: 1 })
    const result = await this._execute()
    if (result.error) return result
    const arr = Array.isArray(result.data) ? result.data : (result.data != null ? [result.data] : [])
    return { data: arr[0] ?? null, error: arr[0] ? null : { message: 'No rows found', code: 'PGRST116' } }
  }

  _execute() {
    let finalData = this._data
    if (isDesktopMode() && this._operation !== 'select') {
      finalData = injectTerminalFields(this._table, this._data)
    }

    return routedQueryApi({
      table: this._table,
      operation: this._operation,
      select: this._select,
      filters: this._filters,
      data: finalData,
      options: this._options,
    })
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject)
  }
}

export const db = {
  from: (table) => new QueryBuilder(table),

  rpc: (name, params = {}) => routedQueryApi({ rpc: name, params }),

  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  },
}
