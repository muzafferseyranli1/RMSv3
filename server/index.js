const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const fs = require('fs')
const multer = require('multer')
const path = require('path')
const compression = require('compression')


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

// Handle pool errors to prevent application crash
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err)
})

const app = express()
app.use(compression())
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
app.options('*any', cors(corsOptions))


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

const CACHE_TTL_MS = 300_000 // 5 minutes
const queryCache = new Map()
const pendingRequests = new Map()
const rateLimitMap = new Map()

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

// Recursively strips empty values (null, undefined, empty arrays) from objects/arrays
function stripEmptyValues(val) {
  if (val === null || val === undefined) return undefined
  
  if (Array.isArray(val)) {
    if (val.length === 0) return undefined
    const cleanedArr = val.map(stripEmptyValues).filter(v => v !== undefined)
    return cleanedArr.length > 0 ? cleanedArr : undefined
  }
  
  if (typeof val === 'object' && val.constructor === Object) {
    const cleanedObj = {}
    for (const [k, v] of Object.entries(val)) {
      const cv = stripEmptyValues(v)
      if (cv !== undefined) {
        cleanedObj[k] = cv
      }
    }
    return cleanedObj
  }
  
  return val
}

// Cleans API responses while preserving root data array structure
function cleanApiResponse(result) {
  if (!result || !result.data) return result
  const cleanedData = result.data.map(row => {
    const cleaned = stripEmptyValues(row)
    return cleaned === undefined ? {} : cleaned
  })
  return { data: cleanedData, error: result.error ?? null }
}

// Cleanup interval to prevent rateLimitMap from growing unbounded
setInterval(() => {
  const now = Date.now()
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const active = timestamps.filter(ts => now - ts < 60_000)
    if (active.length === 0) {
      rateLimitMap.delete(ip)
    } else {
      rateLimitMap.set(ip, active)
    }
  }
}, 60_000)

function rateLimiter(req, res, next) {
  if (process.env.NODE_ENV === 'test') {
    next()
    return
  }
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  
  let timestamps = rateLimitMap.get(ip) || []
  timestamps = timestamps.filter(ts => now - ts < 60_000)
  
  if (timestamps.length >= 600) {
    return res.status(429).json({
      data: null,
      error: { message: 'Too many requests. Please try again later.' }
    })
  }
  
  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)
  next()
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
    loyalty_programs: new Set(['frequency_reward_json', 'metadata']),
    loyalty_tiers: new Set(['qualification_json', 'benefits_json']),
    loyalty_campaigns: new Set(['channel_targets', 'audience_json', 'conditions_json', 'actions_json', 'budget_json', 'limits_json', 'metadata']),
    loyalty_campaign_rules: new Set(['condition_json', 'action_json']),
    loyalty_campaign_conflict_groups: new Set(['metadata']),
    loyalty_coupon_series: new Set(['metadata']),
    loyalty_coupons: new Set(['metadata']),
    loyalty_wallets: new Set(['metadata']),
    loyalty_transactions: new Set(['metadata']),
    loyalty_card_transactions: new Set(['metadata']),
    loyalty_cards: new Set(['metadata']),
    loyalty_reward_entitlements: new Set(['target_scope_json', 'reward_payload', 'metadata']),
    loyalty_frequency_progress: new Set(['metadata']),
    loyalty_campaign_redemptions: new Set(['metadata']),
    tasks: new Set(['metadata']),
    task_approval_requests: new Set(['metadata']),
    count_flows: new Set(['branches', 'schedule', 'products', 'notes']),
    customer_addresses: new Set(['metadata']),
    customer_consent_events: new Set(['metadata']),
    customer_devices: new Set(['metadata']),
    order_flows: new Set(['branches', 'order_days', 'aylik_gunler', 'selected_stocks']),
    pos_sales: new Set(['items']),
    price_changes: new Set(['changes']),
    customer_app_config: new Set(['branding', 'home_buttons']),
    sales: new Set(['delivery_address_snapshot', 'loyalty_applied_actions_json', 'loyalty_decision_context_json']),
    sale_lines: new Set(['loyalty_applied_actions_json', 'loyalty_decision_context_json', 'options_json']),
    purchase_orders: new Set(['meta']),
    purchase_order_lines: new Set(['meta']),
    loyalty_referral_programs: new Set(['allowed_referrer_categories', 'config_json']),
    time_tracking_defs: new Set(['times']),
    table_feedback: new Set(['item_ratings', 'contact_info', 'metadata']),
    tickets: new Set(['metadata']),
    ticket_audit_log: new Set(['metadata']),
    sla_policies: new Set(['metadata']),
    form_templates: new Set(['schema_json', 'target_branches', 'scoring', 'recurrence', 'allowed_contexts']),
    form_submissions: new Set(['answers_json', 'metadata']),
    form_submission_photos: new Set(['metadata']),
    pos_terminals: new Set(['config_data']),
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

  const formatColumn = (col) => {
    if (col.includes('->>')) {
      const parts = col.split('->>');
      return `"${parts[0]}"->>'${parts[1]}'`;
    }
    return `"${col}"`;
  }

  const splitOrExpression = (expr) => {
    const parts = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];
      if ((char === '"' || char === "'") && (i === 0 || expr[i - 1] !== '\\')) {
        if (inQuotes && char === quoteChar) {
          inQuotes = false;
        } else if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        }
        current += char;
      } else if (char === ',' && !inQuotes) {
        parts.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    if (current) {
      parts.push(current);
    }
    return parts;
  }


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
      case 'or': {
        const orConditions = []
        for (const part of splitOrExpression(f.val)) {
          const trimmedPart = part.trim()
          if (!trimmedPart) continue

          const firstDot = trimmedPart.indexOf('.')
          if (firstDot === -1) continue
          const secondDot = trimmedPart.indexOf('.', firstDot + 1)
          if (secondDot === -1) continue

          const col = trimmedPart.slice(0, firstDot)
          const op = trimmedPart.slice(firstDot + 1, secondDot)
          let val = trimmedPart.slice(secondDot + 1)

          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }

          const sqlCol = formatColumn(col)

          if (op === 'is') {
            if (val.toLowerCase() === 'null') {
              orConditions.push(`${sqlCol} IS NULL`)
            } else if (val.toLowerCase() === 'true') {
              orConditions.push(`${sqlCol} IS TRUE`)
            } else if (val.toLowerCase() === 'false') {
              orConditions.push(`${sqlCol} IS FALSE`)
            }
          } else {
            const opMap = {
              eq: '=',
              neq: '!=',
              gt: '>',
              gte: '>=',
              lt: '<',
              lte: '<=',
              like: 'LIKE',
              ilike: 'ILIKE'
            }

            const sqlOp = opMap[op]
            if (sqlOp) {
              orConditions.push(`${sqlCol} ${sqlOp} $${idx++}`)
              values.push(val)
            } else if (op === 'in') {
              let cleanVal = val
              if (cleanVal.startsWith('(') && cleanVal.endsWith(')')) {
                cleanVal = cleanVal.slice(1, -1)
              }
              const arrayVals = cleanVal.split(',').map(v => {
                const trimmed = v.trim()
                if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
                  return trimmed.slice(1, -1)
                }
                return trimmed
              })
              orConditions.push(`${sqlCol} = ANY($${idx++})`)
              values.push(arrayVals)
            }
          }
        }

        if (orConditions.length > 0) {
          conditions.push(`(${orConditions.join(' OR ')})`)
        }
        break
      }

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

const https = require('https')

function fetchTcmbXml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch XML: status code ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => { resolve(data) })
    }).on('error', (err) => {
      reject(err)
    })
  })
}

async function getRateForDate(dateObj, currency) {
  let attempts = 0
  let currentObj = new Date(dateObj)
  
  while (attempts < 6) {
    const yyyy = currentObj.getFullYear()
    const mm = String(currentObj.getMonth() + 1).padStart(2, '0')
    const dd = String(currentObj.getDate()).padStart(2, '0')
    
    // Check if it is today (local date)
    const todayStr = new Date().toLocaleDateString('en-CA')
    const targetStr = `${yyyy}-${mm}-${dd}`
    
    let url
    if (targetStr === todayStr) {
      url = 'https://www.tcmb.gov.tr/kurlar/today.xml'
    } else {
      url = `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
    }
    
    try {
      console.log(`[ExchangeRate] Trying TCMB URL: ${url}`)
      const xml = await fetchTcmbXml(url)
      // parse rate from XML
      const regex = new RegExp(`<Currency[^>]*Kod="${currency}"[^>]*>[\\s\\S]*?<ForexBuying>([\\d.]+)<\\/ForexBuying>`, 'i')
      const match = xml.match(regex)
      if (match) {
        const rate = parseFloat(match[1])
        return { rate, date: targetStr, url }
      }
      throw new Error(`Currency ${currency} not found in XML`)
    } catch (err) {
      console.log(`[ExchangeRate] Failed to fetch rate for ${targetStr}: ${err.message}. Trying previous day.`)
      // Go back 1 day
      currentObj.setDate(currentObj.getDate() - 1)
      attempts++
    }
  }
  throw new Error(`Could not find exchange rate for ${currency} starting from date ${dateObj.toLocaleDateString('en-CA')}`)
}

app.get('/api/exchange-rate', async (req, res) => {
  const { date, currency } = req.query
  if (!currency) {
    return res.status(400).json({ data: null, error: { message: 'currency parameter is required' } })
  }

  const cleanCurrency = String(currency).trim().toUpperCase()
  if (cleanCurrency === 'TRY' || cleanCurrency === 'TL') {
    return res.json({ data: { rate: 1.0, date: date || new Date().toLocaleDateString('en-CA'), source: 'fixed' }, error: null })
  }

  let targetDate = new Date()
  if (date) {
    const parsed = new Date(date)
    if (!isNaN(parsed.getTime())) {
      targetDate = parsed
    }
  }

  try {
    const result = await getRateForDate(targetDate, cleanCurrency)
    return res.json({
      data: {
        rate: result.rate,
        date: result.date,
        source: 'TCMB XML Feed',
        resolvedUrl: result.url
      },
      error: null
    })
  } catch (err) {
    console.error('Exchange rate error:', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

app.get('/api/files/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename || '')
  const absolutePath = path.join(UPLOAD_DIR, safeFilename)
  if (!fs.existsSync(absolutePath)) {
    return res.status(404).json({ data: null, error: { message: 'File not found' } })
  }
  return res.sendFile(absolutePath)
})

app.all('/api/query', rateLimiter, async (req, res) => {
  const body = req.method === 'GET' ? req.query : req.body
  const { table, operation, select, filters = [], data, options = {}, rpc, params } = body
  const isReadOnly = rpc || operation === 'select'
  const key = cacheKey(body)

  const startTime = Date.now()
  const logQuery = (responseObj, errorMsg = null) => {
    try {
      const durationMs = Date.now() - startTime
      const responseBytes = Buffer.byteLength(JSON.stringify(responseObj || {}))
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'
      const userAgent = req.headers['user-agent'] || 'unknown'
      console.log(`[API_QUERY_LOG] ip=${ip} table=${table || 'rpc'} operation=${operation || 'rpc'} duration=${durationMs}ms size=${responseBytes}bytes err=${errorMsg || 'none'} select=${select || '*'} filters=${JSON.stringify(filters)} ua="${userAgent}"`)
    } catch (e) {
      // ignore logging errors
    }
  }

  if (isReadOnly && process.env.NODE_ENV !== 'test') {
    const cached = cacheGet(key)
    if (cached) {
      logQuery(cached)
      return res.json(cached)
    }

    if (pendingRequests.has(key)) {
      try {
        const result = await pendingRequests.get(key)
        logQuery(result)
        return res.json(result)
      } catch (err) {
        const errorObj = { data: null, error: { message: err.message } }
        logQuery(errorObj, err.message)
        return res.json(errorObj)
      }
    }
  }

  const executeQuery = async () => {
    if (rpc) {
      validateIdentifier(rpc)
      const keys = Object.keys(params || {})
      const vals = Object.values(params || {})
      const argList = keys.map((k, i) => `${k} => $${i + 1}`).join(', ')
      const sql = `SELECT * FROM "${rpc}"(${argList})`
      const { rows } = await pool.query(sql, vals)
      return { data: rows, error: null }
    }

    validateIdentifier(table)

    const { conditions, values, orders, limitVal, offsetVal } = buildConditions(filters)
    const whereStr = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderStr = orders.length ? `ORDER BY ${orders.join(', ')}` : ''
    let limitStr = limitVal != null ? `LIMIT ${Number(limitVal)}` : ''
    const offsetStr = offsetVal != null ? `OFFSET ${Number(offsetVal)}` : ''

    if (!isReadOnly) cacheClearTable(table)

    if (operation === 'select') {
      if (table === 'settings') {
        const hasKeyFilter = filters && filters.some(f => f.col === 'key' && (f.type === 'eq' || f.type === 'in'));
        if (!hasKeyFilter) {
          throw new Error('Filtresiz settings tablosu okuması engellendi (Egress koruması). Lütfen key kolonu ile filtreleyin.');
        }
      }
      const cols = select && select !== '*'
        ? select.split(',').map(c => {
            const trimmed = c.trim()
            return trimmed === '*' ? '*' : `"${trimmed}"`
          }).join(', ')
        : '*'

      // Enforce a hard cap of 1000 rows
      const parsedLimit = limitVal != null ? Number(limitVal) : 1000
      const finalLimit = Math.min(parsedLimit, 1000)
      limitStr = `LIMIT ${finalLimit}`

      const sql = `SELECT ${cols} FROM "${table}" ${whereStr} ${orderStr} ${limitStr} ${offsetStr}`
      const { rows } = await pool.query(sql, values)
      return { data: rows, error: null }
    }

    if (operation === 'insert') {
      const records = Array.isArray(data) ? data : [data]
      if (!records.length) return { data: [], error: null }
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
        return { data: Array.isArray(data) ? rows : (rows[0] ?? null), error: null }
      }

      const allVals = []
      const rowPlaceholders = records.map(rec => {
        const vals = cols.map(c => normalizeWriteValue(table, c, rec[c]))
        const start = allVals.length + 1
        allVals.push(...vals)
        return `(${vals.map((_, i) => `$${start + i}`).join(', ')})`
      })
      const { rows } = await pool.query(
        `INSERT INTO "${table}" (${colStr}) VALUES ${rowPlaceholders.join(', ')} RETURNING *`,
        allVals
      )
      return { data: rows, error: null }
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
      return { data: rows, error: null }
    }

    if (operation === 'delete') {
      const sql = `DELETE FROM "${table}" ${whereStr} ${orderStr} RETURNING *`
      const { rows } = await pool.query(sql, values)
      return { data: rows, error: null }
    }

    if (operation === 'upsert') {
      const records = Array.isArray(data) ? data : [data]
      if (!records.length) return { data: [], error: null }

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
        return { data: Array.isArray(data) ? rows : (rows[0] ?? null), error: null }
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
      return { data: rows, error: null }
    }

    throw new Error(`Unknown operation: ${operation}`)
  }


  if (isReadOnly) {
    const promise = executeQuery().finally(() => {
      pendingRequests.delete(key)
    })
    pendingRequests.set(key, promise)

    try {
      const result = await promise
      const cleanedResult = cleanApiResponse(result)
      if (process.env.NODE_ENV !== 'test') {
        cacheSet(key, cleanedResult)
      }
      logQuery(cleanedResult)
      return res.json(cleanedResult)
    } catch (err) {
      console.error('[api/query]', err.message)
      const errorObj = { data: null, error: { message: err.message } }
      logQuery(errorObj, err.message)
      return res.json(errorObj)
    }
  } else {
    try {
      const result = await executeQuery()
      logQuery(result)
      return res.json(result)
    } catch (err) {
      console.error('[api/query]', err.message)
      const errorObj = { data: null, error: { message: err.message } }
      logQuery(errorObj, err.message)
      return res.json(errorObj)
    }
  }
})

// ============================================================
// OPERASYON EL KİTABI (OPERATION MANUAL) API ENDPOINTS
// ============================================================

// --- KATEGORİLER (manual_categories) CRUD ---

// 1. GET ALL CATEGORIES
app.get('/api/manual/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.manual_categories ORDER BY display_order ASC, created_at DESC;'
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/manual/categories]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 2. GET SINGLE CATEGORY
app.get('/api/manual/categories/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      'SELECT * FROM public.manual_categories WHERE id = $1;',
      [id]
    )
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Category not found' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[GET /api/manual/categories/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 3. CREATE CATEGORY
app.post('/api/manual/categories', async (req, res) => {
  try {
    const { name, description, display_order } = req.body
    if (!name) {
      return res.status(400).json({ data: null, error: { message: 'Category name is required' } })
    }
    const order = display_order !== undefined ? Number(display_order) : 0
    const { rows } = await pool.query(
      'INSERT INTO public.manual_categories (name, description, display_order) VALUES ($1, $2, $3) RETURNING *;',
      [name, description, order]
    )
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[POST /api/manual/categories]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 4. UPDATE CATEGORY
app.put('/api/manual/categories/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, display_order } = req.body
    if (!name) {
      return res.status(400).json({ data: null, error: { message: 'Category name is required' } })
    }
    const order = display_order !== undefined ? Number(display_order) : 0
    const { rows } = await pool.query(
      'UPDATE public.manual_categories SET name = $1, description = $2, display_order = $3 WHERE id = $4 RETURNING *;',
      [name, description, order, id]
    )
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Category not found' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[PUT /api/manual/categories/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 5. DELETE CATEGORY
app.delete('/api/manual/categories/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      'DELETE FROM public.manual_categories WHERE id = $1 RETURNING *;',
      [id]
    )
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Category not found' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[DELETE /api/manual/categories/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// --- EKİPMAN TANIMLARI LİSTELEME API ---
app.get('/api/manual/equipments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.equipment_definitions ORDER BY name ASC;'
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/manual/equipments]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// --- SAYFALAR (manual_pages) CRUD ---

// 1. GET ALL PAGES (with optional category_id filtering)
app.get('/api/manual/pages', async (req, res) => {
  try {
    const { category_id } = req.query
    let query = 'SELECT * FROM public.manual_pages'
    const params = []
    if (category_id) {
      query += ' WHERE category_id = $1'
      params.push(category_id)
    }
    query += ' ORDER BY created_at DESC;'
    const { rows } = await pool.query(query, params)
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/manual/pages]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 2. GET SINGLE PAGE WITH JOINED EQUIPMENTS (İlişkisel Sorgu)
app.get('/api/manual/pages/:id', async (req, res) => {
  try {
    const { id } = req.params
    const query = `
      SELECT 
        p.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ed.id,
              'name', ed.name,
              'image_url', ed.image_url,
              'maintenance_period_days', ed.maintenance_period_days
            )
          ) FILTER (WHERE ed.id IS NOT NULL),
          '[]'::json
        ) as equipments
      FROM public.manual_pages p
      LEFT JOIN public.manual_page_equipments mpe ON p.id = mpe.page_id
      LEFT JOIN public.equipment_definitions ed ON mpe.equipment_definition_id = ed.id
      WHERE p.id = $1
      GROUP BY p.id;
    `
    const { rows } = await pool.query(query, [id])
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Page not found' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[GET /api/manual/pages/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 3. CREATE PAGE WITH TRANSACTION
app.post('/api/manual/pages', async (req, res) => {
  const client = await pool.connect()
  try {
    const { category_id, title, content, last_updated_by_pin, equipment_ids } = req.body
    if (!category_id || !title) {
      return res.status(400).json({ data: null, error: { message: 'category_id and title are required' } })
    }

    await client.query('BEGIN')

    const pageRes = await client.query(
      `INSERT INTO public.manual_pages (category_id, title, content, last_updated_by_pin, version) 
       VALUES ($1, $2, $3, $4, 1) RETURNING *;`,
      [category_id, title, content, last_updated_by_pin]
    )
    const page = pageRes.rows[0]

    if (Array.isArray(equipment_ids) && equipment_ids.length > 0) {
      const placeholders = equipment_ids.map((_, index) => `($1, $${index + 2})`).join(', ')
      await client.query(
        `INSERT INTO public.manual_page_equipments (page_id, equipment_definition_id) VALUES ${placeholders};`,
        [page.id, ...equipment_ids]
      )
    }

    await client.query('COMMIT')
    return res.json({ data: page, error: null })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/manual/pages]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  } finally {
    client.release()
  }
})

// 4. UPDATE PAGE WITH TRANSACTION AND AUTOMATIC VERSION INCREMENT
app.put('/api/manual/pages/:id', async (req, res) => {
  const client = await pool.connect()
  try {
    const { id } = req.params
    const { category_id, title, content, last_updated_by_pin, equipment_ids } = req.body
    if (!category_id || !title) {
      return res.status(400).json({ data: null, error: { message: 'category_id and title are required' } })
    }

    await client.query('BEGIN')

    const pageRes = await client.query(
      `UPDATE public.manual_pages 
       SET category_id = $1, title = $2, content = $3, last_updated_by_pin = $4, version = version + 1, updated_at = now() 
       WHERE id = $5 RETURNING *;`,
      [category_id, title, content, last_updated_by_pin, id]
    )

    if (!pageRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ data: null, error: { message: 'Page not found' } })
    }
    const page = pageRes.rows[0]

    // Clear old associations
    await client.query('DELETE FROM public.manual_page_equipments WHERE page_id = $1;', [id])

    // Insert new associations
    if (Array.isArray(equipment_ids) && equipment_ids.length > 0) {
      const placeholders = equipment_ids.map((_, index) => `($1, $${index + 2})`).join(', ')
      await client.query(
        `INSERT INTO public.manual_page_equipments (page_id, equipment_definition_id) VALUES ${placeholders};`,
        [id, ...equipment_ids]
      )
    }

    await client.query('COMMIT')
    return res.json({ data: page, error: null })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PUT /api/manual/pages/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  } finally {
    client.release()
  }
})

// 5. DELETE PAGE
app.delete('/api/manual/pages/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      'DELETE FROM public.manual_pages WHERE id = $1 RETURNING *;',
      [id]
    )
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Page not found' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[DELETE /api/manual/pages/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`))

