const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const fs = require('fs')
const multer = require('multer')
const path = require('path')

function loadServerEnv() {
  const envPath = path.join(__dirname, '.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadServerEnv()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

const app = express()
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

app.use(express.json({ limit: '10mb' }))

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, UPLOAD_DIR),
  filename: (_req, file, callback) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    callback(null, `${unique}${path.extname(file.originalname || '')}`)
  },
})

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const mimetype = String(file.mimetype || '').toLowerCase()
    if (IMAGE_MIME_TYPES.has(mimetype) || DOCUMENT_MIME_TYPES.has(mimetype)) {
      callback(null, true)
      return
    }
    callback(new Error(`Unsupported file type: ${file.mimetype}`))
  },
})

const CACHE_TTL_MS = 30_000
const queryCache = new Map()

function cacheKey(body) {
  return JSON.stringify(body)
}

function cacheGet(key) {
  const entry = queryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    queryCache.delete(key)
    return null
  }
  return entry.data
}

function cacheSet(key, data) {
  queryCache.set(key, { data, ts: Date.now() })
}

function cacheClearTable(table) {
  for (const key of queryCache.keys()) {
    try {
      const parsed = JSON.parse(key)
      if (parsed.table === table) queryCache.delete(key)
    } catch { /* ignore */ }
  }
}

const pkCache = {}

async function getTablePK(table) {
  if (pkCache[table]) return pkCache[table]
  const { rows } = await pool.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = $1
       AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [table]
  )
  const pk = rows.map(r => r.column_name)
  pkCache[table] = pk
  return pk
}

function validateIdentifier(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_ ]*$/.test(String(name))) {
    throw new Error(`Invalid identifier: ${name}`)
  }
  return String(name).trim()
}

function normalizeWriteValue(table, column, value) {
  const jsonbColumns = {
    settings: new Set(['value']),
    branch_templates: new Set(['branch_ids']),
    stock_templates: new Set(['stock_ids']),
    sale_templates: new Set(['sale_ids']),
    suppliers: new Set(['yetkililer', 'siparis_mailleri', 'siparis_telefonlari']),
    stock_items: new Set(['location', 'packaging_units', 'suppliers_list']),
    semi_items: new Set(['location', 'channel_prices', 'portions', 'option_groups', 'recipe_rows']),
    sale_items: new Set(['location', 'channel_prices', 'portions', 'option_groups', 'recipe_rows']),
    sale_options: new Set(['channel_prices', 'portions', 'recipe_rows']),
    option_groups: new Set(['options']),
    contracts: new Set(['branches', 'rows']),
    purchase_receipts: new Set(['meta']),
    purchase_receipt_lines: new Set(['meta']),
    inventory_movements: new Set(['meta']),
    musteriler: new Set(['adresler', 'tags', 'metadata']),
    loyalty_customer_categories: new Set(['metadata']),
    loyalty_customer_category_members: new Set(['metadata']),
    task_history: new Set(['metadata']),
    task_chat_messages: new Set(['metadata']),
  }

  // These columns accept nested arrays/objects. Stringifying here keeps the generic
  // API compatible with JSONB writes made by the frontend and bootstrap scripts.
  if (jsonbColumns[table]?.has(column) && value !== null && typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value
}

function buildConditions(filters, startIdx = 1) {
  const conditions = []
  const values = []
  const orders = []
  let limitVal = null
  let offsetVal = null
  let idx = startIdx

  for (const f of (filters || [])) {
    switch (f.type) {
      case 'order':
        orders.push(`"${f.col}" ${f.ascending !== false ? 'ASC' : 'DESC'}`)
        break
      case 'limit':
        limitVal = f.val
        break
      case 'range':
        offsetVal = f.from
        limitVal = f.to - f.from + 1
        break
      case 'eq':
        if (f.val === null) {
          conditions.push(`"${f.col}" IS NULL`)
        } else {
          conditions.push(`"${f.col}" = $${idx++}`)
          values.push(f.val)
        }
        break
      case 'neq':
        conditions.push(`"${f.col}" != $${idx++}`)
        values.push(f.val)
        break
      case 'is':
        if (f.val === null) conditions.push(`"${f.col}" IS NULL`)
        else if (f.val === true) conditions.push(`"${f.col}" IS TRUE`)
        else if (f.val === false) conditions.push(`"${f.col}" IS FALSE`)
        break
      case 'not':
        if (f.op === 'is' && f.val === null) {
          conditions.push(`"${f.col}" IS NOT NULL`)
        } else {
          conditions.push(`NOT ("${f.col}" = $${idx++})`)
          values.push(f.val)
        }
        break
      case 'in':
        conditions.push(`"${f.col}" = ANY($${idx++})`)
        values.push(f.val)
        break
      case 'gt':
        conditions.push(`"${f.col}" > $${idx++}`)
        values.push(f.val)
        break
      case 'gte':
        conditions.push(`"${f.col}" >= $${idx++}`)
        values.push(f.val)
        break
      case 'lt':
        conditions.push(`"${f.col}" < $${idx++}`)
        values.push(f.val)
        break
      case 'lte':
        conditions.push(`"${f.col}" <= $${idx++}`)
        values.push(f.val)
        break
      case 'like':
        conditions.push(`"${f.col}" LIKE $${idx++}`)
        values.push(f.val)
        break
      case 'ilike':
        conditions.push(`"${f.col}" ILIKE $${idx++}`)
        values.push(f.val)
        break
      case 'contains':
        conditions.push(`"${f.col}" @> $${idx++}::jsonb`)
        values.push(typeof f.val === 'string' ? f.val : JSON.stringify(f.val))
        break
      case 'overlaps':
        conditions.push(`"${f.col}" && $${idx++}`)
        values.push(f.val)
        break
      default:
        break
    }
  }

  return { conditions, values, orders, limitVal, offsetVal }
}

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ data: null, error: { message: 'File is required' } })
  }

  const mimetype = String(req.file.mimetype || '').toLowerCase()
  const isImage = IMAGE_MIME_TYPES.has(mimetype)
  const maxSize = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024
  if (req.file.size > maxSize) {
    try {
      fs.unlinkSync(req.file.path)
    } catch {
      // no-op
    }
    return res.status(400).json({
      data: null,
      error: { message: isImage ? 'Image size limit is 10 MB' : 'Document size limit is 25 MB' },
    })
  }

  return res.json({
    data: {
      file_url: `/api/files/${req.file.filename}`,
      file_name: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
    },
    error: null,
  })
})

app.get('/api/files/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename || '')
  const absolutePath = path.join(UPLOAD_DIR, safeFilename)
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ data: null, error: { message: 'File not found' } })
  }
  return res.sendFile(absolutePath)
})

app.all('/api/query', async (req, res) => {
  const body = req.method === 'GET' ? req.query : req.body
  const { table, operation, select, filters = [], data, options = {}, rpc, params } = body
  const isReadOnly = rpc || operation === 'select'

  if (isReadOnly) {
    const key = cacheKey(body)
    const cached = cacheGet(key)
    if (cached) return res.json(cached)
  }

  try {
    if (rpc) {
      validateIdentifier(rpc)
      const keys = Object.keys(params || {})
      const vals = Object.values(params || {})
      const argList = keys.map((k, i) => `${k} => $${i + 1}`).join(', ')
      const sql = `SELECT * FROM "${rpc}"(${argList})`
      const { rows } = await pool.query(sql, vals)
      const result = { data: rows, error: null }
      cacheSet(cacheKey(body), result)
      return res.json(result)
    }

    validateIdentifier(table)

    const { conditions, values, orders, limitVal, offsetVal } = buildConditions(filters)
    const whereStr = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderStr = orders.length ? `ORDER BY ${orders.join(', ')}` : ''
    const limitStr = limitVal != null ? `LIMIT ${Number(limitVal)}` : ''
    const offsetStr = offsetVal != null ? `OFFSET ${Number(offsetVal)}` : ''

    if (!isReadOnly) cacheClearTable(table)

    if (operation === 'select') {
      const cols = select && select !== '*'
        ? select.split(',').map(c => {
            const trimmed = c.trim()
            return trimmed === '*' ? '*' : `"${trimmed}"`
          }).join(', ')
        : '*'
      const sql = `SELECT ${cols} FROM "${table}" ${whereStr} ${orderStr} ${limitStr} ${offsetStr}`
      const { rows } = await pool.query(sql, values)
      const result = { data: rows, error: null }
      cacheSet(cacheKey(body), result)
      return res.json(result)
    }

    if (operation === 'insert') {
      const records = Array.isArray(data) ? data : [data]
      if (!records.length) return res.json({ data: [], error: null })
      const cols = Object.keys(records[0])
      cols.forEach(validateIdentifier)
      const colStr = cols.map(c => `"${c}"`).join(', ')

      if (records.length === 1) {
        const vals = cols.map(c => normalizeWriteValue(table, c, records[0][c]))
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
        const { rows } = await pool.query(
          `INSERT INTO "${table}" (${colStr}) VALUES (${placeholders}) RETURNING *`,
          vals
        )
        return res.json({ data: Array.isArray(data) ? rows : (rows[0] ?? null), error: null })
      }

      const allVals = []
      const rowPlaceholders = records.map(rec => {
        const vals = cols.map(c => normalizeWriteValue(table, c, rec[c]))
        const ph = vals.map(() => `$${allVals.length + vals.indexOf(vals[vals.indexOf(vals[0])]) + 1}`)
        // rebuild correctly:
        const start = allVals.length + 1
        allVals.push(...vals)
        return `(${vals.map((_, i) => `$${start + i}`).join(', ')})`
      })
      const { rows } = await pool.query(
        `INSERT INTO "${table}" (${colStr}) VALUES ${rowPlaceholders.join(', ')} RETURNING *`,
        allVals
      )
      return res.json({ data: rows, error: null })
    }

    if (operation === 'update') {
      const cols = Object.keys(data)
      cols.forEach(validateIdentifier)
      const dataVals = cols.map(c => normalizeWriteValue(table, c, data[c]))
      const setStr = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
      const { conditions: whereConds, values: whereVals, orders: whereOrders } = buildConditions(filters, cols.length + 1)
      const wStr = whereConds.length ? `WHERE ${whereConds.join(' AND ')}` : ''
      const oStr = whereOrders.length ? `ORDER BY ${whereOrders.join(', ')}` : ''
      const sql = `UPDATE "${table}" SET ${setStr} ${wStr} ${oStr} RETURNING *`
      const { rows } = await pool.query(sql, [...dataVals, ...whereVals])
      return res.json({ data: rows, error: null })
    }

    if (operation === 'delete') {
      const sql = `DELETE FROM "${table}" ${whereStr} ${orderStr} RETURNING *`
      const { rows } = await pool.query(sql, values)
      return res.json({ data: rows, error: null })
    }

    if (operation === 'upsert') {
      const records = Array.isArray(data) ? data : [data]
      if (!records.length) return res.json({ data: [], error: null })

      const cols = Object.keys(records[0])
      cols.forEach(validateIdentifier)
      const colStr = cols.map(c => `"${c}"`).join(', ')

      let conflictCols = options.onConflict
        ? options.onConflict.split(',').map(c => c.trim())
        : await getTablePK(table)

      if (!conflictCols.length) conflictCols = ['id']
      const conflictStr = conflictCols.map(c => `"${c}"`).join(', ')

      const updateCols = cols.filter(c => !conflictCols.includes(c))
      const updateStr = updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')
      const doUpdate = updateStr ? `DO UPDATE SET ${updateStr}` : 'DO NOTHING'

      if (records.length === 1) {
        const vals = cols.map(c => normalizeWriteValue(table, c, records[0][c]))
        const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ')
        const { rows } = await pool.query(
          `INSERT INTO "${table}" (${colStr}) VALUES (${placeholders}) ON CONFLICT (${conflictStr}) ${doUpdate} RETURNING *`,
          vals
        )
        return res.json({ data: Array.isArray(data) ? rows : (rows[0] ?? null), error: null })
      }

      const allVals = []
      const rowPlaceholders = records.map(rec => {
        const start = allVals.length + 1
        const vals = cols.map(c => normalizeWriteValue(table, c, rec[c]))
        allVals.push(...vals)
        return `(${vals.map((_, i) => `$${start + i}`).join(', ')})`
      })
      const { rows } = await pool.query(
        `INSERT INTO "${table}" (${colStr}) VALUES ${rowPlaceholders.join(', ')} ON CONFLICT (${conflictStr}) ${doUpdate} RETURNING *`,
        allVals
      )
      return res.json({ data: rows, error: null })
    }

    return res.status(400).json({ data: null, error: { message: `Unknown operation: ${operation}` } })
  } catch (err) {
    console.error('[api/query]', err.message)
    return res.json({ data: null, error: { message: err.message } })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`))
