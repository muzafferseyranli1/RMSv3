const DEFAULT_API_URL = 'https://rms-api-production-219d.up.railway.app'
const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '')

async function queryApi(body) {
  try {
    const res = await fetch(`${API_URL}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { data: null, error: { message: text || `HTTP ${res.status}` } }
    }
    return await res.json()
  } catch (err) {
    return { data: null, error: { message: err.message } }
  }
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
    return queryApi({
      table: this._table,
      operation: this._operation,
      select: this._select,
      filters: this._filters,
      data: this._data,
      options: this._options,
    })
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject)
  }
}

export const db = {
  from: (table) => new QueryBuilder(table),

  rpc: (name, params = {}) => queryApi({ rpc: name, params }),

  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: async () => ({ error: null }),
    signOut: async () => ({ error: null }),
  },
}
