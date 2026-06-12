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

// Auto schema check on startup
async function checkSchema() {
  try {
    await pool.query('ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS image_url TEXT;');
    await pool.query('ALTER TABLE public.semi_items ADD COLUMN IF NOT EXISTS image_url TEXT;');
    console.log('Database schema auto-checked and image_url columns verified.');
  } catch (err) {
    console.error('Error in database schema auto-check:', err.message);
  }
}
checkSchema();

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

const CACHE_TTL_MS = 30_000 // 30 seconds (per governance rule 6)
const CACHE_MAX_ENTRY_BYTES = Number(process.env.API_QUERY_CACHE_MAX_ENTRY_BYTES || 256 * 1024)
const CACHE_MAX_TOTAL_BYTES = Number(process.env.API_QUERY_CACHE_MAX_TOTAL_BYTES || 3 * 1024 * 1024)
const CACHE_MAX_ENTRIES = Number(process.env.API_QUERY_CACHE_MAX_ENTRIES || 150)
const queryCache = new Map()
const pendingRequests = new Map()
const rateLimitMap = new Map()
let queryCacheBytes = 0

function cacheKey(body) {
  return JSON.stringify(body)
}

function estimateJsonBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value || {}))
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function cacheDelete(key) {
  const entry = queryCache.get(key)
  if (!entry) return
  queryCacheBytes = Math.max(0, queryCacheBytes - Number(entry.bytes || 0))
  queryCache.delete(key)
}

function evictQueryCache(now = Date.now()) {
  for (const [key, entry] of queryCache.entries()) {
    if (now - entry.ts > CACHE_TTL_MS) {
      cacheDelete(key)
    }
  }

  while (
    queryCache.size > CACHE_MAX_ENTRIES ||
    queryCacheBytes > CACHE_MAX_TOTAL_BYTES
  ) {
    const oldestKey = queryCache.keys().next().value
    if (!oldestKey) break
    cacheDelete(oldestKey)
  }
}

function cacheGet(key) {
  const entry = queryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cacheDelete(key)
    return null
  }
  queryCache.delete(key)
  queryCache.set(key, entry)
  return entry.data
}

function cacheSet(key, data) {
  const bytes = estimateJsonBytes(data)
  if (!Number.isFinite(bytes) || bytes > CACHE_MAX_ENTRY_BYTES) {
    cacheDelete(key)
    return false
  }

  cacheDelete(key)
  queryCache.set(key, { data, ts: Date.now(), bytes })
  queryCacheBytes += bytes
  evictQueryCache()
  return true
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

// Cleanup interval to prevent rateLimitMap and queryCache from growing unbounded
setInterval(() => {
  const now = Date.now()

  // Rate limit map cleanup
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const active = timestamps.filter(ts => now - ts < 60_000)
    if (active.length === 0) {
      rateLimitMap.delete(ip)
    } else {
      rateLimitMap.set(ip, active)
    }
  }

  // queryCache cleanup (Garbage Collector for expired keys and oversized cache)
  evictQueryCache(now)
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
      if (parsed.table === table) cacheDelete(key)
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
    warehouse_tasks: new Set(['meta']),
    warehouse_task_events: new Set(['payload']),
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

async function resolveProductAndPackage(barcode, branch_id) {
  // 1. Try to find in product_external_barcodes
  let extRes = await pool.query(
    `SELECT
      s.id AS stock_item_id,
      s.name AS stock_item_name,
      s.sku AS stock_item_sku,
      s.unit AS stock_item_unit,
      s.image_url AS stock_item_image_url,
      p.package_unit_id
     FROM product_external_barcodes p
     JOIN stock_items s ON p.stock_item_id = s.id
     WHERE p.gtin_barcode = $1 AND p.is_approved = true`,
    [barcode]
  )

  let product = null
  let package_unit_id = null

  if (extRes.rows.length > 0) {
    const row = extRes.rows[0]
    product = {
      id: row.stock_item_id,
      name: row.stock_item_name,
      sku: row.stock_item_sku,
      unit: row.stock_item_unit,
      image_url: row.stock_item_image_url
    }
    package_unit_id = row.package_unit_id
  } else {
    // 2. Fallback to direct match on stock_items sku
    let itemRes = await pool.query(
      'SELECT id, name, sku, unit, image_url FROM stock_items WHERE sku = $1',
      [barcode]
    )
    if (itemRes.rows.length > 0) {
      const row = itemRes.rows[0]
      product = {
        id: row.id,
        name: row.name,
        sku: row.sku,
        unit: row.unit,
        image_url: row.image_url
      }
    }
  }

  if (!product) return null

  // 3. Resolve package unit
  let package_unit = null
  if (package_unit_id) {
    let unitRes = await pool.query(
      `SELECT id, unit_name, unit_symbol, base_quantity, length_cm, width_cm, height_cm, volume_m3, gross_weight_kg
       FROM stock_item_package_units WHERE id = $1`,
      [package_unit_id]
    )
    if (unitRes.rows.length > 0) {
      const u = unitRes.rows[0]
      package_unit = {
        package_unit_id: u.id,
        unit_name: u.unit_name,
        unit_symbol: u.unit_symbol,
        conversion_factor: Number(u.base_quantity),
        barcode: barcode,
        length_cm: u.length_cm ? Number(u.length_cm) : null,
        width_cm: u.width_cm ? Number(u.width_cm) : null,
        height_cm: u.height_cm ? Number(u.height_cm) : null,
        volume_m3: u.volume_m3 ? Number(u.volume_m3) : null,
        gross_weight_kg: u.gross_weight_kg ? Number(u.gross_weight_kg) : null
      }
    }
  }

  // If no package unit resolved, find default for this product
  if (!package_unit) {
    let unitRes = await pool.query(
      `SELECT id, unit_name, unit_symbol, base_quantity, length_cm, width_cm, height_cm, volume_m3, gross_weight_kg
       FROM stock_item_package_units
       WHERE stock_item_id = $1 AND active = true
       ORDER BY is_base_unit DESC, is_default_picking_unit DESC, base_quantity ASC LIMIT 1`,
      [product.id]
    )
    if (unitRes.rows.length > 0) {
      const u = unitRes.rows[0]
      package_unit = {
        package_unit_id: u.id,
        unit_name: u.unit_name,
        unit_symbol: u.unit_symbol,
        conversion_factor: Number(u.base_quantity),
        barcode: null,
        length_cm: u.length_cm ? Number(u.length_cm) : null,
        width_cm: u.width_cm ? Number(u.width_cm) : null,
        height_cm: u.height_cm ? Number(u.height_cm) : null,
        volume_m3: u.volume_m3 ? Number(u.volume_m3) : null,
        gross_weight_kg: u.gross_weight_kg ? Number(u.gross_weight_kg) : null
      }
    } else {
      // Fallback: Generate default unit from stock_item unit
      package_unit = {
        package_unit_id: null,
        unit_name: product.unit || 'Adet',
        unit_symbol: product.unit || 'AD',
        conversion_factor: 1.0,
        barcode: null,
        length_cm: null,
        width_cm: null,
        height_cm: null,
        volume_m3: null,
        gross_weight_kg: null
      }
    }
  }

  return { product, package_unit }
}

app.post('/api/wms/parse-barcode', async (req, res) => {
  const { barcode, branch_id, task_id, personnel_id, terminal_id } = req.body
  if (!barcode || !branch_id) {
    return res.status(400).json({ data: null, error: { message: 'barcode ve branch_id zorunludur' } })
  }

  try {
    let scan_type = 'unknown'
    let matched = false
    let product = null
    let package_unit = null
    let location = null
    let lpn = null
    let lot_info = null
    let is_expected = false
    let message = 'Eşleşme bulunamadı.'

    // 1. Lokasyon sorgula
    const locRes = await pool.query(
      'SELECT id, zone_code, aisle, rack, level, bin FROM warehouse_locations WHERE branch_id = $1 AND is_active = true',
      [branch_id]
    )
    for (const loc of locRes.rows) {
      const fullLocCode = `LOC-${loc.zone_code}-${loc.aisle || 0}-${loc.rack || 0}-${loc.level || 0}`
      const shortLocCode = `LOC-${loc.zone_code}`
      if (
        fullLocCode.toLowerCase() === barcode.toLowerCase() ||
        shortLocCode.toLowerCase() === barcode.toLowerCase() ||
        loc.zone_code.toLowerCase() === barcode.toLowerCase() ||
        loc.id === barcode
      ) {
        scan_type = 'location'
        matched = true
        location = loc
        message = `Lokasyon doğrulandı: Zone ${loc.zone_code}`
        break
      }
    }

    // 2. LPN sorgula (eğer lokasyon değilse)
    if (!matched) {
      const lpnRes = await pool.query(
        'SELECT id, lpn_code, location_id FROM warehouse_lpns WHERE branch_id = $1 AND lpn_code = $2',
        [branch_id, barcode]
      )
      if (lpnRes.rows.length > 0) {
        scan_type = 'lpn'
        matched = true
        lpn = lpnRes.rows[0]
        message = `LPN doğrulandı: ${lpn.lpn_code}`
      }
    }

    // 3. Ürün sorgula (eğer lokasyon veya LPN değilse)
    if (!matched) {
      const resolved = await resolveProductAndPackage(barcode, branch_id)
      if (resolved) {
        scan_type = 'product'
        matched = true
        product = resolved.product
        package_unit = resolved.package_unit
        message = `Ürün doğrulandı: ${product.name}`
      }
    }

    // 4. Lot/SKT ayrıştır (opsiyonel)
    if (barcode.includes('LOT:') || barcode.includes('EXP:')) {
      const lotMatch = barcode.match(/LOT:([^;]+)/i)
      const expMatch = barcode.match(/EXP:([^;]+)/i)
      if (lotMatch || expMatch) {
        lot_info = {
          lot_number: lotMatch ? lotMatch[1].trim() : null,
          expiration_date: expMatch ? expMatch[1].trim() : null
        }
      }
    }

    // 5. Seçili görevle eşleştir (varsa)
    let activeTask = null
    if (task_id) {
      const taskRes = await pool.query(
        `SELECT
          id,
          task_type,
          status,
          COALESCE(meta->>'product_id', meta->>'stock_item_id') AS product_id,
          meta->>'barcode' AS barcode,
          meta->>'product_code' AS product_code,
          meta->>'source_location' AS source_location,
          meta->>'target_location' AS target_location,
          COALESCE(meta->>'source_location_id', meta->>'location_id', meta->>'from_location_id') AS source_location_id,
          COALESCE(meta->>'target_location_id', meta->>'location_id') AS target_location_id,
          (meta->>'quantity')::int AS quantity,
          (meta->>'scanned_quantity')::int AS scanned_quantity
         FROM warehouse_tasks
         WHERE id = $1`,
        [task_id]
      )
      if (taskRes.rows.length > 0) {
        activeTask = taskRes.rows[0]
        if (scan_type === 'product') {
          if (
            product && (
              product.id === activeTask.product_id ||
              barcode === activeTask.barcode ||
              barcode === activeTask.product_code
            )
          ) {
            is_expected = true
            message = `Doğru ürün taranmıştır: ${product.name}`
          } else {
            is_expected = false
            message = `Hata: Bu ürün seçili görev için beklenmiyor`
          }
        } else if (scan_type === 'location') {
          if (activeTask.task_type === 'putaway') {
            if (
              location.id === activeTask.target_location_id ||
              location.zone_code === activeTask.target_location ||
              location.id === activeTask.source_location_id
            ) {
              is_expected = true
              message = `Doğru hedef lokasyon seçildi: Zone ${location.zone_code}`
            } else {
              is_expected = false
              message = `Hata: Yanlış lokasyon! Görevin hedefi: ${activeTask.target_location}`
            }
          } else if (activeTask.task_type === 'pick') {
            if (
              location.id === activeTask.source_location_id ||
              location.zone_code === activeTask.source_location
            ) {
              is_expected = true
              message = `Doğru kaynak lokasyon doğrulandı: Zone ${location.zone_code}`
            } else {
              is_expected = false
              message = `Hata: Yanlış lokasyon! Görevin kaynağı: ${activeTask.source_location}`
            }
          } else {
            is_expected = true
            message = `Lokasyon seçildi: Zone ${location.zone_code}`
          }
        } else if (scan_type === 'lpn') {
          is_expected = true
          message = `LPN seçildi: ${lpn.lpn_code}`
        }
      }
    } else {
      is_expected = matched
    }

    // 6. Log attempt in warehouse_task_events
    if (activeTask || task_id) {
      const targetTaskId = activeTask ? activeTask.id : task_id
      const eventType = is_expected ? 'scan_success' : 'scan_failed'
      await pool.query(
        'INSERT INTO warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id, terminal_id, barcode_scanned, payload) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          targetTaskId,
          eventType,
          activeTask ? activeTask.status : null,
          activeTask ? activeTask.status : null,
          personnel_id || null,
          terminal_id || null,
          barcode,
          JSON.stringify({ scan_type, matched, is_expected, lot_info, message })
        ]
      )
    }

    return res.json({
      data: {
        barcode,
        scan_type,
        matched,
        product,
        package_unit,
        location,
        lpn,
        lot_info,
        is_expected,
        message
      },
      error: null
    })
  } catch (err) {
    console.error('Error in parse-barcode endpoint', err)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

app.get('/api/wms/shipment-capacity/:shipment_id', async (req, res) => {
  const { shipment_id } = req.params
  try {
    const { rows } = await pool.query('SELECT public.get_warehouse_shipment_capacity($1) AS capacity', [shipment_id])
    if (rows.length > 0 && rows[0].capacity) {
      return res.json({ data: rows[0].capacity, error: null })
    }
    return res.status(404).json({ data: null, error: { message: 'Sevkiyat bulunamadı' } })
  } catch (err) {
    console.error('Error in shipment-capacity endpoint', err)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

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

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch JSON: status code ${res.statusCode}`))
        return
      }
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

async function getRateFromEvds(dateObj, currency, apiKey) {
  const yyyy = dateObj.getFullYear()
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0')
  const dd = String(dateObj.getDate()).padStart(2, '0')

  const startDateObj = new Date(dateObj)
  startDateObj.setDate(startDateObj.getDate() - 5)
  const s_yyyy = startDateObj.getFullYear()
  const s_mm = String(startDateObj.getMonth() + 1).padStart(2, '0')
  const s_dd = String(startDateObj.getDate()).padStart(2, '0')

  const startDateStr = `${s_dd}-${s_mm}-${s_yyyy}`
  const endDateStr = `${dd}-${mm}-${yyyy}`

  const series = `TP.DK.${currency}.A`
  const url = `https://evds2.tcmb.gov.tr/service/evds/series=${series}&startDate=${startDateStr}&endDate=${endDateStr}&type=json`

  const res = await fetchJson(url, { key: apiKey })
  if (!res.items || res.items.length === 0) {
    throw new Error('No items returned from EVDS')
  }

  for (let i = res.items.length - 1; i >= 0; i--) {
    const item = res.items[i]
    const val = item[series]
    if (val !== undefined && val !== null && val !== 'null' && String(val).trim() !== '') {
      return {
        rate: parseFloat(val),
        date: item.Tarih || `${dd}-${mm}-${yyyy}`,
        url
      }
    }
  }
  throw new Error(`Could not find EVDS rate for ${currency} in range`)
}

async function getRateFromOpenExchange(currency) {
  const url = 'https://open.er-api.com/v6/latest/TRY'
  const data = await fetchJson(url)
  if (data && data.result === 'success' && data.rates) {
    const rateInTry = data.rates[currency]
    if (rateInTry) {
      const rate = 1 / rateInTry
      return {
        rate,
        date: data.time_last_update_utc ? data.time_last_update_utc.split(' ').slice(0, 4).join(' ') : new Date().toLocaleDateString('en-CA'),
        url
      }
    }
  }
  throw new Error(`Currency ${currency} not found in Open Exchange Rates`)
}

async function getRateForDate(dateObj, currency) {
  // 1. Check if TCMB EVDS API Key is present in environment variables
  const apiKey = process.env.TCMB_EVDS_API_KEY || process.env.TCMB_API_KEY || process.env.EVDS_API_KEY
  if (apiKey) {
    try {
      console.log(`[ExchangeRate] Trying TCMB EVDS API for ${currency}`)
      const res = await getRateFromEvds(dateObj, currency, apiKey)
      return { rate: res.rate, date: res.date, url: res.url, source: 'TCMB EVDS API' }
    } catch (err) {
      console.error(`[ExchangeRate] EVDS API failed: ${err.message}. Falling back.`)
    }
  }

  // 2. Try the public TCMB XML feed
  try {
    let attempts = 0
    let currentObj = new Date(dateObj)
    while (attempts < 6) {
      const yyyy = currentObj.getFullYear()
      const mm = String(currentObj.getMonth() + 1).padStart(2, '0')
      const dd = String(currentObj.getDate()).padStart(2, '0')

      const todayStr = new Date().toLocaleDateString('en-CA')
      const targetStr = `${yyyy}-${mm}-${dd}`

      let url
      if (targetStr === todayStr) {
        url = 'https://www.tcmb.gov.tr/kurlar/today.xml'
      } else {
        url = `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`
      }

      try {
        console.log(`[ExchangeRate] Trying TCMB XML URL: ${url}`)
        const xml = await fetchTcmbXml(url)
        const regex = new RegExp(`<Currency[^>]*Kod="${currency}"[^>]*>[\\s\\S]*?<ForexBuying>([\\d.]+)<\\/ForexBuying>`, 'i')
        const match = xml.match(regex)
        if (match) {
          const rate = parseFloat(match[1])
          return { rate, date: targetStr, url, source: 'TCMB XML Feed' }
        }
        throw new Error(`Currency ${currency} not found in XML`)
      } catch (err) {
        console.log(`[ExchangeRate] Failed to fetch rate for ${targetStr}: ${err.message}. Trying previous day.`)
        currentObj.setDate(currentObj.getDate() - 1)
        attempts++
      }
    }
  } catch (err) {
    console.error(`[ExchangeRate] TCMB XML Feed failed: ${err.message}`)
  }

  // 3. Fallback to Open Exchange Rates (essential for cloud hosting without TCMB API Key)
  try {
    console.log(`[ExchangeRate] Trying Open Exchange Rates for ${currency}`)
    const res = await getRateFromOpenExchange(currency)
    return { rate: res.rate, date: res.date, url: res.url, source: 'Open Exchange Rates (Fallback)' }
  } catch (err) {
    console.error(`[ExchangeRate] Open Exchange Rates failed: ${err.message}`)
  }

  throw new Error(`Could not find exchange rate for ${currency} from any provider`)
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
        source: result.source || 'Unknown',
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

// --- EKİPMAN LİSTELEME API ---
app.get('/api/manual/equipments', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ei.id,
              COALESCE(ei.name, ed.name) || ' (' || COALESCE(ei.serial_number, 'Seri No Yok') || ')' AS name
       FROM public.equipment_instances ei
       JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
       WHERE ei.status = 'active'
       ORDER BY name ASC;`
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
              'id', ei.id,
              'name', COALESCE(ei.name, ed.name) || ' (' || COALESCE(ei.serial_number, 'Seri No Yok') || ')',
              'image_url', COALESCE(ei.image_url, ed.image_url)
            )
          ) FILTER (WHERE ei.id IS NOT NULL),
          '[]'::json
        ) as equipments
      FROM public.manual_pages p
      LEFT JOIN public.manual_page_equipments mpe ON p.id = mpe.page_id
      LEFT JOIN public.equipment_instances ei ON mpe.equipment_instance_id = ei.id
      LEFT JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
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

// AI SUPPORT CHAT ENDPOINT (RAG ENTEGRASYONU)
app.post('/api/support/chat', async (req, res) => {
  try {
    const { message, origin } = req.body
    const clientOrigin = origin || 'http://localhost:5173'
    if (!message) {
      return res.status(400).json({ data: null, error: { message: 'message is required' } })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return res.status(500).json({ data: null, error: { message: 'GEMINI_API_KEY is not configured on the server environment.' } })
    }

    // Support klasöründeki tüm .md dosyalarını oku
    const supportDir = path.join(__dirname, '../Support')
    let kbContent = ''
    if (fs.existsSync(supportDir)) {
      const files = fs.readdirSync(supportDir)
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(supportDir, file)
          const content = fs.readFileSync(filePath, 'utf8')
          kbContent += `\n=== DOKÜMAN: ${file} ===\n${content}\n`
        }
      }
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: message }]
        }],
        systemInstruction: {
          parts: [{
            text: `Sen SuitableRMS sisteminin yapay zeka destek asistanısın.
Kullanıcıların (restoran işletmecilerinin) sorularına yanıt verirken sadece sana sağlanan bilgi bankasını (Knowledge Base) referans al.

KURALLAR (BU KURALLARA UYMAMAK SİSTEMİ ÇÖKERTİR):
1. Eğer sorunun cevabı sana sağlanan bilgi bankasında KESİNLİKLE YOKSA, [UNANSWERED] yaz ve başka bir şey söyleme.
2. DOKÜMANLARDAKİ BİLGİLERİ ASLA KISA KESME VEYA ÖZETLEME. Adım adım kılavuzları, SSS bölümlerini ve "ÖNEMLİ UYARI" gibi kısımları atlamadan, detaylıca ve birebir aktar. Yüzeysel ve kısa cevaplar vermek kesinlikle yasaktır.
3. Doküman metninin içinde sayfa yönlendirmesi için '/' ile başlayan bir URL yolu (Örn: /donem-kapanis, /satislar vb.) varsa, YANITININ EN ALTINA MUTLAKA ŞU LİNKİ EKLE:
[Sayfaya Git](${clientOrigin}/o-yol)
(Örnek: [Dönem Kapanışı Sayfasına Git](${clientOrigin}/donem-kapanis))
4. Yanıtlarını akıcı ve profesyonel Türkçe ile ver. Teknik tablo isimlerini gizle.

BİLGİ BANKASI:
${kbContent}`
          }]
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1500
        }
      })
    })

    const data = await response.json()
    if (data.error) {
      return res.status(500).json({ data: null, error: { message: data.error.message } })
    }

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      return res.status(500).json({ data: null, error: { message: 'Gemini API did not return a valid response candidate.', details: data } })
    }

    const reply = data.candidates[0].content.parts[0].text
    return res.json({ data: { reply }, error: null })
  } catch (err) {
    console.error('[POST /api/support/chat]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// 3. CREATE PAGE WITH TRANSACTION
app.post('/api/manual/pages', async (req, res) => {
  const client = await pool.connect()
  try {
    const { category_id, title, content, last_updated_by_pin, equipment_ids, linked_item_id, linked_item_type, is_draft, metadata } = req.body
    if (!category_id || !title) {
      return res.status(400).json({ data: null, error: { message: 'category_id and title are required' } })
    }

    await client.query('BEGIN')

    const pageRes = await client.query(
      `INSERT INTO public.manual_pages (category_id, title, content, last_updated_by_pin, linked_item_id, linked_item_type, is_draft, metadata, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1) RETURNING *;`,
      [category_id, title, content, last_updated_by_pin, linked_item_id || null, linked_item_type || null, is_draft || false, metadata || null]
    )
    const page = pageRes.rows[0]

    if (Array.isArray(equipment_ids) && equipment_ids.length > 0) {
      const placeholders = equipment_ids.map((_, index) => `($1, $${index + 2})`).join(', ')
      await client.query(
        `INSERT INTO public.manual_page_equipments (page_id, equipment_instance_id) VALUES ${placeholders};`,
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
    const { category_id, title, content, last_updated_by_pin, equipment_ids, linked_item_id, linked_item_type, is_draft, metadata } = req.body
    if (!category_id || !title) {
      return res.status(400).json({ data: null, error: { message: 'category_id and title are required' } })
    }

    await client.query('BEGIN')

    const pageRes = await client.query(
      `UPDATE public.manual_pages
       SET category_id = $1, title = $2, content = $3, last_updated_by_pin = $4, linked_item_id = $5, linked_item_type = $6, is_draft = $7, metadata = $8, version = version + 1, updated_at = now()
       WHERE id = $9 RETURNING *;`,
      [category_id, title, content, last_updated_by_pin, linked_item_id || null, linked_item_type || null, is_draft || false, metadata || null, id]
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
        `INSERT INTO public.manual_page_equipments (page_id, equipment_instance_id) VALUES ${placeholders};`,
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

// 5. GET RECIPE CONTEXT FOR AN ITEM (For Live Preview)
app.get('/api/manual/context-by-item', async (req, res) => {
  try {
    const { linked_item_id, linked_item_type } = req.query;
    if (!linked_item_id || !linked_item_type) {
      return res.json({ data: { recipe: [], portionNames: {}, allChannels: [] }, error: null });
    }

    let recipeRows = [];
    let portionsArr = [];
    let channelPrices = [];
    if (linked_item_type === 'sale_item') {
      const itemRes = await pool.query('SELECT recipe_rows, portions, channel_prices FROM public.sale_items WHERE id = $1', [linked_item_id]);
      if (itemRes.rows.length) {
        recipeRows = itemRes.rows[0].recipe_rows || [];
        portionsArr = itemRes.rows[0].portions || [];
        channelPrices = itemRes.rows[0].channel_prices || [];
      }
    } else if (linked_item_type === 'semi_product') {
      const itemRes = await pool.query('SELECT recipe_rows, portions, channel_prices FROM public.semi_items WHERE id = $1', [linked_item_id]);
      if (itemRes.rows.length) {
        recipeRows = itemRes.rows[0].recipe_rows || [];
        portionsArr = itemRes.rows[0].portions || [];
        channelPrices = itemRes.rows[0].channel_prices || [];
      }
    }

    if (typeof recipeRows === 'string') {
      try { recipeRows = JSON.parse(recipeRows); } catch (e) { recipeRows = []; }
    }
    if (typeof portionsArr === 'string') {
      try { portionsArr = JSON.parse(portionsArr); } catch (e) { portionsArr = []; }
    }
    if (typeof channelPrices === 'string') {
      try { channelPrices = JSON.parse(channelPrices); } catch (e) { channelPrices = []; }
    }

    // Build portionNames map: id -> name from all items globally to ensure no codes are displayed
    const portionNames = { '__standart__': 'Standart' };
    try {
      const allPortionsRes = await pool.query(`
        SELECT portions FROM public.sale_items WHERE portions IS NOT NULL
        UNION ALL
        SELECT portions FROM public.semi_items WHERE portions IS NOT NULL
      `);
      for (const r of allPortionsRes.rows) {
        let ports = r.portions;
        if (typeof ports === 'string') {
          try { ports = JSON.parse(ports); } catch (e) { ports = []; }
        }
        if (Array.isArray(ports)) {
          ports.forEach(p => { if (p && p.id && p.name) portionNames[p.id] = p.name; });
        }
      }
    } catch (e) {
      console.error('Error fetching global portions:', e.message);
      if (Array.isArray(portionsArr)) {
        portionsArr.forEach(p => { if (p && p.id && p.name) portionNames[p.id] = p.name; });
      }
    }

    // Build allChannels list from public.sales_channels table to get correct names and icons
    const channelsRes = await pool.query('SELECT id, name, icon FROM public.sales_channels WHERE deleted_at IS NULL ORDER BY sort_order');
    const allChannels = channelsRes.rows;

    const enrichedRecipe = [];
    for (const row of recipeRows) {
      const isSemi = row.ingredient_type === 'semi_item' || row.semi_item_id;
      const targetId = isSemi ? row.semi_item_id : row.stock_item_id;

      if (!targetId) continue;

      let name = '';
      if (isSemi) {
        const nameRes = await pool.query('SELECT name FROM public.semi_items WHERE id = $1', [targetId]);
        if (nameRes.rows.length) name = nameRes.rows[0].name;
      } else {
        const nameRes = await pool.query('SELECT name FROM public.stock_items WHERE id = $1', [targetId]);
        if (nameRes.rows.length) name = nameRes.rows[0].name;
      }

      const manualRes = await pool.query('SELECT id, metadata FROM public.manual_pages WHERE linked_item_id = $1 LIMIT 1', [targetId]);
      const manualPageId = manualRes.rows.length ? manualRes.rows[0].id : null;
      let imageUrl = null;
      if (manualRes.rows.length) {
        let meta = manualRes.rows[0].metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
        }
        imageUrl = meta?.product_image || null;
      }

      if (!imageUrl) {
        if (isSemi) {
          const imgRes = await pool.query('SELECT image_url, pos_image, channel_image FROM public.semi_items WHERE id = $1', [targetId]);
          if (imgRes.rows.length) {
            imageUrl = imgRes.rows[0].image_url || imgRes.rows[0].pos_image || imgRes.rows[0].channel_image || null;
          }
        } else {
          const imgRes = await pool.query('SELECT image_url FROM public.stock_items WHERE id = $1', [targetId]);
          if (imgRes.rows.length) {
            imageUrl = imgRes.rows[0].image_url || null;
          }
        }
      }

      enrichedRecipe.push({
        ...row,
        name,
        linked_page_id: manualPageId,
        image_url: imageUrl
      });
    }

    return res.json({ data: { recipe: enrichedRecipe, portionNames, allChannels }, error: null });
  } catch (err) {
    console.error('[GET /api/manual/context-by-item]', err.message);
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// 6. GET RECIPE CONTEXT FOR A PAGE
app.get('/api/manual/pages/:id/context', async (req, res) => {
  try {
    const { id } = req.params;

    // First find the page to see if it's linked
    const pageRes = await pool.query('SELECT linked_item_id, linked_item_type FROM public.manual_pages WHERE id = $1', [id]);
    if (!pageRes.rows.length) return res.status(404).json({ data: null, error: { message: 'Page not found' } });

    const { linked_item_id, linked_item_type } = pageRes.rows[0];

    if (!linked_item_id || !linked_item_type) {
      return res.json({ data: { recipe: [], portionNames: {}, allChannels: [] }, error: null });
    }

    let recipeRows = [];
    let portionsArr = [];
    let channelPrices = [];
    if (linked_item_type === 'sale_item') {
      const itemRes = await pool.query('SELECT recipe_rows, portions, channel_prices FROM public.sale_items WHERE id = $1', [linked_item_id]);
      if (itemRes.rows.length) {
        recipeRows = itemRes.rows[0].recipe_rows || [];
        portionsArr = itemRes.rows[0].portions || [];
        channelPrices = itemRes.rows[0].channel_prices || [];
      }
    } else if (linked_item_type === 'semi_product') {
      const itemRes = await pool.query('SELECT recipe_rows, portions, channel_prices FROM public.semi_items WHERE id = $1', [linked_item_id]);
      if (itemRes.rows.length) {
        recipeRows = itemRes.rows[0].recipe_rows || [];
        portionsArr = itemRes.rows[0].portions || [];
        channelPrices = itemRes.rows[0].channel_prices || [];
      }
    }

    if (typeof recipeRows === 'string') {
      try { recipeRows = JSON.parse(recipeRows); } catch (e) { recipeRows = []; }
    }
    if (typeof portionsArr === 'string') {
      try { portionsArr = JSON.parse(portionsArr); } catch (e) { portionsArr = []; }
    }
    if (typeof channelPrices === 'string') {
      try { channelPrices = JSON.parse(channelPrices); } catch (e) { channelPrices = []; }
    }

    // Build portionNames map: id -> name from all items globally to ensure no codes are displayed
    const portionNames = { '__standart__': 'Standart' };
    try {
      const allPortionsRes = await pool.query(`
        SELECT portions FROM public.sale_items WHERE portions IS NOT NULL
        UNION ALL
        SELECT portions FROM public.semi_items WHERE portions IS NOT NULL
      `);
      for (const r of allPortionsRes.rows) {
        let ports = r.portions;
        if (typeof ports === 'string') {
          try { ports = JSON.parse(ports); } catch (e) { ports = []; }
        }
        if (Array.isArray(ports)) {
          ports.forEach(p => { if (p && p.id && p.name) portionNames[p.id] = p.name; });
        }
      }
    } catch (e) {
      console.error('Error fetching global portions:', e.message);
      if (Array.isArray(portionsArr)) {
        portionsArr.forEach(p => { if (p && p.id && p.name) portionNames[p.id] = p.name; });
      }
    }

    // Build allChannels list from public.sales_channels table to get correct names and icons
    const channelsRes = await pool.query('SELECT id, name, icon FROM public.sales_channels WHERE deleted_at IS NULL ORDER BY sort_order');
    const allChannels = channelsRes.rows;

    const enrichedRecipe = [];
    for (const row of recipeRows) {
      const isSemi = row.ingredient_type === 'semi_item' || row.semi_item_id;
      const targetId = isSemi ? row.semi_item_id : row.stock_item_id;

      if (!targetId) continue;

      let name = '';
      if (isSemi) {
        const nameRes = await pool.query('SELECT name FROM public.semi_items WHERE id = $1', [targetId]);
        if (nameRes.rows.length) name = nameRes.rows[0].name;
      } else {
        const nameRes = await pool.query('SELECT name FROM public.stock_items WHERE id = $1', [targetId]);
        if (nameRes.rows.length) name = nameRes.rows[0].name;
      }

      const manualRes = await pool.query('SELECT id, metadata FROM public.manual_pages WHERE linked_item_id = $1 LIMIT 1', [targetId]);
      const manualPageId = manualRes.rows.length ? manualRes.rows[0].id : null;
      let imageUrl = null;
      if (manualRes.rows.length) {
        let meta = manualRes.rows[0].metadata;
        if (typeof meta === 'string') {
          try { meta = JSON.parse(meta); } catch (e) { meta = {}; }
        }
        imageUrl = meta?.product_image || null;
      }

      if (!imageUrl) {
        if (isSemi) {
          const imgRes = await pool.query('SELECT image_url, pos_image, channel_image FROM public.semi_items WHERE id = $1', [targetId]);
          if (imgRes.rows.length) {
            imageUrl = imgRes.rows[0].image_url || imgRes.rows[0].pos_image || imgRes.rows[0].channel_image || null;
          }
        } else {
          const imgRes = await pool.query('SELECT image_url FROM public.stock_items WHERE id = $1', [targetId]);
          if (imgRes.rows.length) {
            imageUrl = imgRes.rows[0].image_url || null;
          }
        }
      }

      enrichedRecipe.push({
        ...row,
        name,
        linked_page_id: manualPageId,
        image_url: imageUrl
      });
    }

    return res.json({ data: { recipe: enrichedRecipe, portionNames, allChannels }, error: null });
  } catch (err) {
    console.error('[GET /api/manual/pages/:id/context]', err.message);
    return res.status(500).json({ data: null, error: { message: err.message } });
  }
});

// 6. DELETE PAGE
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

// ============================================================
// EQUIPMENT MANAGEMENT - FAZ 2 API ENDPOINTS
// ============================================================

// ── CSV parse yardımcısı (harici paket gerekmez) ─────────────
function parseCsvText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  return lines.slice(1).map(line => {
    const values = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { values.push(cur.trim()); cur = '' }
      else { cur += c }
    }
    values.push(cur.trim())
    const row = {}
    headers.forEach((h, i) => { row[h] = (values[i] || '').replace(/^"|"$/g, '') })
    return row
  })
}

// ── CSV multer (sadece text/csv + application/vnd.ms-excel) ──
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['text/csv', 'application/vnd.ms-excel', 'text/plain'].includes(file.mimetype)
      || file.originalname.endsWith('.csv')
    cb(null, ok)
  }
})

// ─────────────────────────────────────────────────────────────
// A. EQUIPMENT DEFINITIONS CRUD
// ─────────────────────────────────────────────────────────────

// GET /api/equipment/definitions
app.get('/api/equipment/definitions', async (req, res) => {
  try {
    const { active } = req.query
    let sql = 'SELECT * FROM public.equipment_definitions'
    const vals = []
    if (active !== undefined) {
      sql += ' WHERE active = $1'
      vals.push(active !== 'false')
    }
    sql += ' ORDER BY name ASC'
    const { rows } = await pool.query(sql, vals)
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/equipment/definitions]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// GET /api/equipment/definitions/:id
app.get('/api/equipment/definitions/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM public.equipment_definitions WHERE id = $1',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[GET /api/equipment/definitions/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// POST /api/equipment/definitions  (resim URL'si /api/upload'dan gelir)
app.post('/api/equipment/definitions', async (req, res) => {
  try {
    const { name, description, purpose, image_url, useful_life_months, active } = req.body
    if (!name) return res.status(400).json({ data: null, error: { message: 'name is required' } })
    const { rows } = await pool.query(
      `INSERT INTO public.equipment_definitions
         (name, description, purpose, image_url, useful_life_months, active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, description || null, purpose || null, image_url || null,
       useful_life_months || null,
       active !== false]
    )
    return res.status(201).json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[POST /api/equipment/definitions]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// PUT /api/equipment/definitions/:id
app.put('/api/equipment/definitions/:id', async (req, res) => {
  try {
    const { name, description, purpose, image_url, useful_life_months, active } = req.body
    const { rows } = await pool.query(
      `UPDATE public.equipment_definitions SET
         name = COALESCE($1, name),
         description = $2,
         purpose = $3,
         image_url = COALESCE($4, image_url),
         useful_life_months = $5,
         active = COALESCE($6, active)
       WHERE id = $7 RETURNING *`,
      [name, description, purpose, image_url, useful_life_months, active, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[PUT /api/equipment/definitions/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// DELETE /api/equipment/definitions/:id  (soft: active=false)
app.delete('/api/equipment/definitions/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE public.equipment_definitions SET active = false WHERE id = $1 RETURNING *',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[DELETE /api/equipment/definitions/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// ─────────────────────────────────────────────────────────────
// B. EQUIPMENT INSTANCES CRUD
// ─────────────────────────────────────────────────────────────

// GET /api/equipment/instances?location_id=&status=&definition_id=
app.get('/api/equipment/instances', async (req, res) => {
  try {
    const { location_id, status, definition_id } = req.query
    const conditions = [], vals = []
    if (location_id) { conditions.push(`ei.current_location_id = $${vals.length + 1}`); vals.push(location_id) }
    if (status)      { conditions.push(`ei.status = $${vals.length + 1}`); vals.push(status) }
    if (definition_id) { conditions.push(`ei.definition_id = $${vals.length + 1}`); vals.push(definition_id) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT ei.*,
              ed.name           AS definition_name,
              ed.image_url      AS definition_image_url,
              ed.useful_life_months,
              ed.purpose
       FROM public.equipment_instances ei
       JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
       ${where}
       ORDER BY ei.created_at DESC`,
      vals
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/equipment/instances]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// GET /api/equipment/instances/csv-template  (must be BEFORE /:id to avoid route capture)
app.get('/api/equipment/instances/csv-template', (_req, res) => {
  const headers = [
    'ekipman_tanim_adi', 'sube_adi', 'seri_numarasi', 'kurulum_tarihi',
    'alim_tarihi', 'alim_bedeli', 'doviz_cinsi', 'alim_kuru',
    'devreden_amortisman', 'garanti_bitis_tarihi'
  ]
  const example = [
    'Firn Model X', 'Merkez Sube', 'SN-2024-001', '2024-01-15',
    '2023-12-01', '45000', 'TRY', '1', '0', '2026-12-01'
  ]
  const csv = headers.join(',') + '\n' + example.join(',') + '\n'
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="ekipman_sablonu.csv"')
  return res.send('\uFEFF' + csv)
})

// GET /api/equipment/instances/:id
app.get('/api/equipment/instances/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ei.*,
              ed.name AS definition_name, ed.image_url AS definition_image_url,
              ed.useful_life_months, ed.purpose
       FROM public.equipment_instances ei
       JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
       WHERE ei.id = $1`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[GET /api/equipment/instances/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// POST /api/equipment/instances
app.post('/api/equipment/instances', async (req, res) => {
  try {
    const {
      definition_id, current_location_id, serial_number, status,
      installed_at, purchase_date, purchase_price, currency,
      purchase_exchange_rate, legacy_accumulated_depreciation,
      warranty_end_date, notes, quantity, image_url, file_url, external_url, name
    } = req.body
    if (!definition_id || !current_location_id) {
      return res.status(400).json({ data: null, error: { message: 'definition_id and current_location_id are required' } })
    }

    const qty = Math.max(1, parseInt(quantity) || 1)
    const insertedRows = []

    // Base serial number logic
    let baseSerial = serial_number ? serial_number.trim() : null
    const isAutoGenerated = !baseSerial

    if (isAutoGenerated) {
      const timestamp = Date.now().toString(36).toUpperCase()
      const randStr = Math.random().toString(36).substring(2, 5).toUpperCase()
      baseSerial = `EQ-${timestamp}-${randStr}`
    }

    for (let i = 1; i <= qty; i++) {
      // If user provided a serial number, we format as baseSerial-1, baseSerial-2 etc if qty > 1.
      // If qty is 1, keep it as baseSerial (unless it's auto-generated, where we append -1 anyway).
      let finalSerial = ''
      if (isAutoGenerated) {
        finalSerial = `${baseSerial}-${i}`
      } else {
        finalSerial = qty > 1 ? `${baseSerial}-${i}` : baseSerial
      }

      // Generate a unique qr_code for this specific instance
      const qrCodeVal = `EQ-QR-${finalSerial}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

      const { rows } = await pool.query(
        `INSERT INTO public.equipment_instances
           (definition_id, current_location_id, serial_number, status,
            installed_at, purchase_date, purchase_price, currency,
            purchase_exchange_rate, legacy_accumulated_depreciation,
            warranty_end_date, notes, image_url, file_url, external_url, qr_code, name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
        [
          definition_id, current_location_id, finalSerial,
          status || 'active', installed_at || null, purchase_date || null,
          purchase_price || null, currency || 'TRY',
          purchase_exchange_rate || 1.0,
          legacy_accumulated_depreciation || 0,
          warranty_end_date || null, notes || null,
          image_url || null, file_url || null, external_url || null,
          qrCodeVal, name || null
        ]
      )
      insertedRows.push(rows[0])
    }

    return res.status(201).json({ data: insertedRows[0], error: null })
  } catch (err) {
    console.error('[POST /api/equipment/instances]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// PUT /api/equipment/instances/:id
app.put('/api/equipment/instances/:id', async (req, res) => {
  try {
    const {
      current_location_id, serial_number, status, installed_at,
      purchase_date, purchase_price, currency, purchase_exchange_rate,
      legacy_accumulated_depreciation, warranty_end_date, notes,
      image_url, file_url, external_url, qr_code, name
    } = req.body
    const { rows } = await pool.query(
      `UPDATE public.equipment_instances SET
         current_location_id             = COALESCE($1, current_location_id),
         serial_number                   = COALESCE($2, serial_number),
         status                          = COALESCE($3, status),
         installed_at                    = $4,
         purchase_date                   = $5,
         purchase_price                  = $6,
         currency                        = COALESCE($7, currency),
         purchase_exchange_rate          = COALESCE($8, purchase_exchange_rate),
         legacy_accumulated_depreciation = COALESCE($9, legacy_accumulated_depreciation),
         warranty_end_date               = $10,
         notes                           = $11,
         image_url                       = $12,
         file_url                        = $13,
         external_url                    = $14,
         qr_code                         = COALESCE($15, qr_code),
         name                            = $16,
         updated_at                      = now()
       WHERE id = $17 RETURNING *`,
      [current_location_id, serial_number, status, installed_at,
       purchase_date, purchase_price, currency, purchase_exchange_rate,
       legacy_accumulated_depreciation, warranty_end_date, notes,
       image_url, file_url, external_url, qr_code, name, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[PUT /api/equipment/instances/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// DELETE /api/equipment/instances/:id  (status=decommissioned)
app.delete('/api/equipment/instances/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE public.equipment_instances SET status = 'decommissioned', updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[DELETE /api/equipment/instances/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// ─────────────────────────────────────────────────────────────
// C. CSV ŞABLON İNDİR  (route yukarıda /:id'den önce tanımlandı)
// ─────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────
// D. CSV TOPLU İÇE AKTARMA
// ─────────────────────────────────────────────────────────────

app.post('/api/equipment/instances/csv-import', csvUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ data: null, error: { message: 'CSV dosyası gereklidir' } })

  const text = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '')
  const rows = parseCsvText(text)
  if (!rows.length) return res.status(400).json({ data: null, error: { message: 'CSV boş veya hatalı format' } })

  const client = await pool.connect()
  const newBranches = []
  const inserted = []
  const errors = []

  try {
    await client.query('BEGIN')

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 2 // header=1

      try {
        // 1. equipment_definition bul ya da ara
        const defName = (row['ekipman_tanim_adi'] || '').trim()
        if (!defName) { errors.push(`Satır ${rowNum}: ekipman_tanim_adi boş`); continue }

        const defRes = await client.query(
          'SELECT id FROM public.equipment_definitions WHERE LOWER(name) = LOWER($1) AND active = true LIMIT 1',
          [defName]
        )
        if (!defRes.rows.length) { errors.push(`Satır ${rowNum}: "${defName}" tanımı bulunamadı`); continue }
        const definition_id = defRes.rows[0].id

        // 2. Şube bul ya da iskelet oluştur
        const subeName = (row['sube_adi'] || '').trim()
        if (!subeName) { errors.push(`Satır ${rowNum}: sube_adi boş`); continue }

        let branchId = subeName  // branch_id TEXT
        // Basit kontrol: branches tablosuna bak
        const branchRes = await client.query(
          `SELECT id FROM public.branches WHERE id = $1 OR LOWER(name) = LOWER($2) LIMIT 1`,
          [subeName, subeName]
        ).catch(() => ({ rows: [] }))  // branches tablosu yoksa hata verme

        if (branchRes.rows.length) {
          branchId = branchRes.rows[0].id
        } else {
          // iskelet şube: branch_id olarak şube adını metin olarak kullan
          // Gerçek şube tablosuna yazma — sadece new_branches listesine ekle
          if (!newBranches.includes(subeName)) newBranches.push(subeName)
          branchId = subeName
        }

        // 3. Insert
        const purchase_price = parseFloat(row['alim_bedeli']) || null
        const purchase_exchange_rate = parseFloat(row['alim_kuru']) || 1.0
        const legacy_dep = parseFloat(row['devreden_amortisman']) || 0
        const currency = (row['doviz_cinsi'] || 'TRY').trim().toUpperCase()

        const insRes = await client.query(
          `INSERT INTO public.equipment_instances
             (definition_id, current_location_id, serial_number,
              installed_at, purchase_date, purchase_price, currency,
              purchase_exchange_rate, legacy_accumulated_depreciation, warranty_end_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [
            definition_id, branchId,
            (row['seri_numarasi'] || '').trim() || null,
            row['kurulum_tarihi'] || null,
            row['alim_tarihi'] || null,
            purchase_price, currency, purchase_exchange_rate,
            legacy_dep,
            row['garanti_bitis_tarihi'] || null
          ]
        )
        inserted.push(insRes.rows[0].id)
      } catch (rowErr) {
        errors.push(`Satır ${rowNum}: ${rowErr.message}`)
      }
    }

    await client.query('COMMIT')

    const message = newBranches.length > 0
      ? `İçe aktarma başarılı. Veritabanında olmayan yeni şubeler otomatik eklendi. Lütfen bu şubelerin detaylarını tamamlayınız.`
      : `İçe aktarma başarılı.`

    return res.json({
      data: {
        message,
        inserted_count: inserted.length,
        error_count: errors.length,
        new_branches: newBranches,
        errors: errors.length > 0 ? errors : undefined
      },
      error: null
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/equipment/instances/csv-import]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// E. EQUIPMENT TRANSFERS
// ─────────────────────────────────────────────────────────────

// GET /api/equipment/transfers?instance_id=&status=
app.get('/api/equipment/transfers', async (req, res) => {
  try {
    const { instance_id, status } = req.query
    const conditions = [], vals = []
    if (instance_id) { conditions.push(`et.equipment_instance_id = $${vals.length + 1}`); vals.push(instance_id) }
    if (status)      { conditions.push(`et.status = $${vals.length + 1}`); vals.push(status) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT et.*,
              ed.name AS definition_name
       FROM public.equipment_transfers et
       JOIN public.equipment_instances ei ON et.equipment_instance_id = ei.id
       JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
       ${where}
       ORDER BY et.created_at DESC`,
      vals
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/equipment/transfers]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// POST /api/equipment/transfers  — Transfer başlat
app.post('/api/equipment/transfers', async (req, res) => {
  const client = await pool.connect()
  try {
    const { equipment_instance_id, to_location_id, notes, transferred_by_pin } = req.body
    if (!equipment_instance_id || !to_location_id) {
      return res.status(400).json({ data: null, error: { message: 'equipment_instance_id and to_location_id are required' } })
    }

    await client.query('BEGIN')

    // Mevcut konumu al
    const instRes = await client.query(
      'SELECT current_location_id, status FROM public.equipment_instances WHERE id = $1 FOR UPDATE',
      [equipment_instance_id]
    )
    if (!instRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ data: null, error: { message: 'Instance not found' } })
    }
    const { current_location_id, status } = instRes.rows[0]
    if (status === 'in_repair') {
      await client.query('ROLLBACK')
      return res.status(400).json({ data: null, error: { message: 'Arızada olan ekipman transfer edilemez' } })
    }

    // Transfer kaydı oluştur
    const trRes = await client.query(
      `INSERT INTO public.equipment_transfers
         (equipment_instance_id, from_location_id, to_location_id, status, notes, transferred_by_pin)
       VALUES ($1,$2,$3,'pending',$4,$5) RETURNING *`,
      [equipment_instance_id, current_location_id, to_location_id, notes || null, transferred_by_pin || null]
    )

    // Instance'ı transferred olarak işaretle
    await client.query(
      `UPDATE public.equipment_instances SET status = 'transferred', updated_at = now() WHERE id = $1`,
      [equipment_instance_id]
    )

    await client.query('COMMIT')
    return res.status(201).json({ data: trRes.rows[0], error: null })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/equipment/transfers]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  } finally {
    client.release()
  }
})

// PATCH /api/equipment/transfers/:id/complete  — Transfer onayla
app.patch('/api/equipment/transfers/:id/complete', async (req, res) => {
  const client = await pool.connect()
  try {
    const { transferred_by_pin } = req.body
    await client.query('BEGIN')

    const trRes = await client.query(
      `UPDATE public.equipment_transfers
       SET status = 'completed', transferred_at = now(), transferred_by_pin = COALESCE($1, transferred_by_pin), updated_at = now()
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [transferred_by_pin || null, req.params.id]
    )
    if (!trRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ data: null, error: { message: 'Transfer bulunamadı veya zaten tamamlandı' } })
    }

    const tr = trRes.rows[0]
    await client.query(
      `UPDATE public.equipment_instances
       SET current_location_id = $1, status = 'active', updated_at = now()
       WHERE id = $2`,
      [tr.to_location_id, tr.equipment_instance_id]
    )

    await client.query('COMMIT')
    return res.json({ data: tr, error: null })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /api/equipment/transfers/:id/complete]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  } finally {
    client.release()
  }
})

// PATCH /api/equipment/transfers/:id/reject  — Transfer reddet
app.patch('/api/equipment/transfers/:id/reject', async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const trRes = await client.query(
      `UPDATE public.equipment_transfers
       SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [req.params.id]
    )
    if (!trRes.rows.length) {
      await client.query('ROLLBACK')
      return res.status(404).json({ data: null, error: { message: 'Transfer bulunamadı veya zaten işleme alındı' } })
    }
    // Instance'ı tekrar active yap (from_location_id'ye geri dön)
    await client.query(
      `UPDATE public.equipment_instances
       SET status = 'active', updated_at = now()
       WHERE id = $1`,
      [trRes.rows[0].equipment_instance_id]
    )
    await client.query('COMMIT')
    return res.json({ data: trRes.rows[0], error: null })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PATCH /api/equipment/transfers/:id/reject]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  } finally {
    client.release()
  }
})

// ─────────────────────────────────────────────────────────────
// F. TCO (TOPLAM SAHİP OLMA MALİYETİ) AGREGASYonu
// ─────────────────────────────────────────────────────────────

// GET /api/equipment/instances/:id/tco?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
app.get('/api/equipment/instances/:id/tco', async (req, res) => {
  try {
    const { id } = req.params
    const { startDate, endDate } = req.query

    // Instance var mı?
    const instRes = await pool.query(
      `SELECT ei.*, ed.name AS definition_name, ed.useful_life_months,
              ed.purpose
       FROM public.equipment_instances ei
       JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
       WHERE ei.id = $1`,
      [id]
    )
    if (!instRes.rows.length) return res.status(404).json({ data: null, error: { message: 'Not found' } })
    const instance = instRes.rows[0]

    // Tarih filtreli TCO sorgusu (mühürlenmiş kur bazlı)
    const conditions = [`mt.equipment_instance_id = $1`, `mt.status IN ('resolved','closed')`]
    const vals = [id]
    if (startDate) { conditions.push(`mt.created_at >= $${vals.length + 1}`); vals.push(startDate) }
    if (endDate)   { conditions.push(`mt.created_at <= $${vals.length + 1}`); vals.push(endDate + ' 23:59:59') }

    const tcoRes = await pool.query(
      `SELECT
         COUNT(*)                                                   AS ticket_count,
         COALESCE(SUM(mt.repair_cost * COALESCE(mt.repair_exchange_rate, 1)), 0) AS total_repair_cost_try,
         COALESCE(SUM(mt.repair_cost), 0)                          AS total_repair_cost_original,
         MAX(mt.repair_currency)                                    AS currency
       FROM public.maintenance_tickets mt
       WHERE ${conditions.join(' AND ')}`,
      vals
    )
    const tco = tcoRes.rows[0]

    // Doğrusal amortisman hesabı (frontend'e hazır veri)
    let depreciation = null
    if (instance.purchase_price && instance.useful_life_months) {
      const purchaseDate = instance.purchase_date ? new Date(instance.purchase_date) : null
      if (purchaseDate) {
        const monthsElapsed = Math.max(0,
          (new Date().getFullYear() - purchaseDate.getFullYear()) * 12 +
          (new Date().getMonth() - purchaseDate.getMonth())
        )
        const monthlyDep = parseFloat(instance.purchase_price) / instance.useful_life_months
        const accumulatedDep = Math.min(
          monthlyDep * monthsElapsed + parseFloat(instance.legacy_accumulated_depreciation || 0),
          parseFloat(instance.purchase_price)
        )
        const bookValue = Math.max(0, parseFloat(instance.purchase_price) - accumulatedDep)
        const bookValueTRY = bookValue * parseFloat(instance.purchase_exchange_rate || 1)

        depreciation = {
          method: 'straight_line',
          purchase_price: parseFloat(instance.purchase_price),
          currency: instance.currency,
          purchase_exchange_rate: parseFloat(instance.purchase_exchange_rate),
          purchase_price_try: parseFloat(instance.purchase_price) * parseFloat(instance.purchase_exchange_rate),
          useful_life_months: instance.useful_life_months,
          months_elapsed: monthsElapsed,
          monthly_depreciation: parseFloat(monthlyDep.toFixed(2)),
          accumulated_depreciation: parseFloat(accumulatedDep.toFixed(2)),
          book_value: parseFloat(bookValue.toFixed(2)),
          book_value_try: parseFloat(bookValueTRY.toFixed(2))
        }
      }
    }

    return res.json({
      data: {
        instance,
        tco: {
          ticket_count: parseInt(tco.ticket_count),
          total_repair_cost_try: parseFloat(tco.total_repair_cost_try),
          total_repair_cost_original: parseFloat(tco.total_repair_cost_original),
          currency: tco.currency || instance.currency,
          date_range: { startDate: startDate || null, endDate: endDate || null }
        },
        depreciation
      },
      error: null
    })
  } catch (err) {
    console.error('[GET /api/equipment/instances/:id/tco]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// ─────────────────────────────────────────────────────────────
// G. MAINTENANCE TICKETS CRUD (genişletilmiş)
// ─────────────────────────────────────────────────────────────

// GET /api/maintenance-tickets?branch_id=&status=&instance_id=
app.get('/api/maintenance-tickets', async (req, res) => {
  try {
    const { branch_id, status, instance_id } = req.query
    const conditions = [], vals = []
    if (branch_id)   { conditions.push(`mt.branch_id = $${vals.length + 1}`); vals.push(branch_id) }
    if (status)      { conditions.push(`mt.status = $${vals.length + 1}`); vals.push(status) }
    if (instance_id) { conditions.push(`mt.equipment_instance_id = $${vals.length + 1}`); vals.push(instance_id) }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT mt.*,
              ei.serial_number,
              ei.warranty_end_date,
              ed.name AS equipment_name,
              ed.image_url AS equipment_image_url
       FROM public.maintenance_tickets mt
       LEFT JOIN public.equipment_instances ei ON mt.equipment_instance_id = ei.id
       LEFT JOIN public.equipment_definitions ed ON ei.definition_id = ed.id
       ${where}
       ORDER BY mt.created_at DESC`,
      vals
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/maintenance-tickets]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// POST /api/maintenance-tickets
app.post('/api/maintenance-tickets', async (req, res) => {
  try {
    const {
      branch_id, equipment_instance_id, issue_description,
      reported_by_pin, form_submission_id
    } = req.body
    if (!branch_id || !equipment_instance_id) {
      return res.status(400).json({ data: null, error: { message: 'branch_id and equipment_instance_id are required' } })
    }

    // Garanti kontrolü için warranty_end_date al
    const instRes = await pool.query(
      `SELECT ei.warranty_end_date FROM public.equipment_instances ei WHERE ei.id = $1`,
      [equipment_instance_id]
    )
    const warrantyEndDate = instRes.rows[0]?.warranty_end_date || null
    const isUnderWarranty = warrantyEndDate && new Date(warrantyEndDate) > new Date()

    const { rows } = await pool.query(
      `INSERT INTO public.maintenance_tickets
         (branch_id, equipment_instance_id, issue_description, reported_by_pin, form_submission_id, status)
       VALUES ($1,$2,$3,$4,$5,'open') RETURNING *`,
      [branch_id, equipment_instance_id, issue_description || null,
       reported_by_pin || null, form_submission_id || null]
    )

    return res.status(201).json({
      data: {
        ...rows[0],
        warranty_warning: isUnderWarranty
          ? 'DİKKAT: Bu cihazın garantisi devam etmektedir! Yetkisiz müdahale yaptırmayınız.'
          : null
      },
      error: null
    })
  } catch (err) {
    console.error('[POST /api/maintenance-tickets]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// PATCH /api/maintenance-tickets/:id/resolve  — Formu kapat + maliyet doğrula
app.patch('/api/maintenance-tickets/:id/resolve', async (req, res) => {
  try {
    const { repair_cost, repair_currency, repair_exchange_rate } = req.body

    // Form şablonu requires_cost_input kontrolü
    const ticketRes = await pool.query(
      `SELECT mt.*, ft.requires_cost_input
       FROM public.maintenance_tickets mt
       LEFT JOIN public.form_submissions fs ON mt.form_submission_id = fs.id
       LEFT JOIN public.form_templates ft ON fs.template_id = ft.id
       WHERE mt.id = $1`,
      [req.params.id]
    )
    if (!ticketRes.rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Ticket bulunamadı' } })
    }
    const ticket = ticketRes.rows[0]

    if (ticket.requires_cost_input) {
      if (!repair_cost || isNaN(parseFloat(repair_cost))) {
        return res.status(400).json({ data: null, error: { message: 'Bu form için geçerli bir repair_cost girilmelidir' } })
      }
      if (!repair_currency) {
        return res.status(400).json({ data: null, error: { message: 'Bu form için repair_currency girilmelidir' } })
      }
      if (!repair_exchange_rate || isNaN(parseFloat(repair_exchange_rate))) {
        return res.status(400).json({ data: null, error: { message: 'Bu form için geçerli bir repair_exchange_rate girilmelidir' } })
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.maintenance_tickets SET
         status               = 'resolved',
         repair_cost          = $1,
         repair_currency      = $2,
         repair_exchange_rate = $3,
         resolved_at          = now(),
         updated_at           = now()
       WHERE id = $4 RETURNING *`,
      [repair_cost || null, repair_currency || null, repair_exchange_rate || null, req.params.id]
    )
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[PATCH /api/maintenance-tickets/:id/resolve]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// ─────────────────────────────────────────────────────────────
// H. SURVEY QR/LINK TOKENS AND CUSTOMER SURVEY INTEGRATION APIs
// ─────────────────────────────────────────────────────────────

// GET /api/survey-tokens/:token — Herkese açık token doğrulama ve şablon getirme
app.get('/api/survey-tokens/:token', async (req, res) => {
  try {
    const { token } = req.params
    const { rows } = await pool.query(
      `SELECT st.*,
              ft.title AS template_title,
              ft.schema_json AS template_schema
       FROM public.survey_tokens st
       JOIN public.form_templates ft ON st.template_id = ft.id
       WHERE st.token = $1 AND st.active = TRUE`,
      [token]
    )
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Geçersiz veya deaktif anket linki/QR kodu.' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[GET /api/survey-tokens/:token]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// GET /api/survey-tokens?templateId=X — Şablona ait tüm token listesi
app.get('/api/survey-tokens', async (req, res) => {
  try {
    const { templateId } = req.query
    if (!templateId) {
      return res.status(400).json({ data: null, error: { message: 'templateId parametresi gereklidir' } })
    }
    const { rows } = await pool.query(
      `SELECT * FROM public.survey_tokens
       WHERE template_id = $1
       ORDER BY created_at DESC`,
      [templateId]
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/survey-tokens]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// POST /api/survey-tokens — Yeni token oluştur
app.post('/api/survey-tokens', async (req, res) => {
  try {
    const { template_id, mode, branch_id, branch_ids, label, qr_config } = req.body
    if (!template_id || !mode) {
      return res.status(400).json({ data: null, error: { message: 'template_id ve mode alanları zorunludur' } })
    }

    const token = require('crypto').randomBytes(16).toString('hex')
    const { rows } = await pool.query(
      `INSERT INTO public.survey_tokens
         (template_id, token, mode, branch_id, branch_ids, label, qr_config, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, now(), now())
       RETURNING *`,
      [
        template_id,
        token,
        mode,
        branch_id || null,
        branch_ids ? JSON.stringify(branch_ids) : null,
        label || null,
        qr_config ? JSON.stringify(qr_config) : '{}'
      ]
    )
    return res.status(201).json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[POST /api/survey-tokens]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// DELETE /api/survey-tokens/:id — Token sil
app.delete('/api/survey-tokens/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { rows } = await pool.query(
      `DELETE FROM public.survey_tokens WHERE id = $1 RETURNING *`,
      [id]
    )
    if (!rows.length) {
      return res.status(404).json({ data: null, error: { message: 'Token bulunamadı' } })
    }
    return res.json({ data: rows[0], error: null })
  } catch (err) {
    console.error('[DELETE /api/survey-tokens/:id]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// GET /api/branches/list — Herkese açık anket doldururken şube seçebilmek için aktif şube listesi
app.get('/api/branches/list', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id::text, name
       FROM public.company_nodes
       WHERE type = 'sube'
       ORDER BY name ASC`
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/branches/list]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// GET /api/customer-surveys?customerId=X — Müşteriye ait anket gönderilerini listele
app.get('/api/customer-surveys', async (req, res) => {
  try {
    const { customerId } = req.query
    if (!customerId) {
      return res.status(400).json({ data: null, error: { message: 'customerId parametresi gereklidir' } })
    }
    const { rows } = await pool.query(
      `SELECT fs.*, ft.title AS template_title
       FROM public.form_submissions fs
       JOIN public.form_templates ft ON fs.template_id = ft.id
       WHERE fs.submitted_by = $1 AND ft.form_type = 'customer_survey'
       ORDER BY fs.created_at DESC`,
      [customerId]
    )
    return res.json({ data: rows, error: null })
  } catch (err) {
    console.error('[GET /api/customer-surveys]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

// POST /api/customer-category-assign — Müşteriyi 'feedback_source' kategorisine ekle
app.post('/api/customer-category-assign', async (req, res) => {
  try {
    const { customerId } = req.body
    if (!customerId) {
      return res.status(400).json({ data: null, error: { message: 'customerId gereklidir' } })
    }
    const categoryId = 'feedback_source'

    // Kategori var mı? Yoksa oluştur
    const catCheck = await pool.query(
      `SELECT id FROM public.loyalty_customer_categories WHERE id = $1`,
      [categoryId]
    )
    if (!catCheck.rows.length) {
      await pool.query(
        `INSERT INTO public.loyalty_customer_categories
           (id, scope_type, name, code, description, color, active, sort_order, metadata, created_at, updated_at)
         VALUES
           ($1, 'global', 'Geri Bildirimden Gelen', 'FEEDBACK_SOURCE',
            'Geri bildirim oluşturan veya anket dolduran müşteriler', '#ef4444', true, 0, '{}', now(), now())
         ON CONFLICT (id) DO NOTHING`,
        [categoryId]
      )
    }

    // Müşterinin bu kategoriye üyeliği var mı?
    const memCheck = await pool.query(
      `SELECT id FROM public.loyalty_customer_category_members
       WHERE customer_id = $1 AND category_id = $2 AND deleted_at IS NULL`,
      [customerId, categoryId]
    )

    if (!memCheck.rows.length) {
      const memberId = 'member_' + require('crypto').randomUUID()
      await pool.query(
        `INSERT INTO public.loyalty_customer_category_members
           (id, customer_id, category_id, scope_type, scope_branch_id, scope_branch_name, active, metadata, created_at, updated_at, deleted_at)
         VALUES
           ($1, $2, $3, 'global', null, null, true, '{}', now(), now(), null)`,
        [memberId, customerId, categoryId]
      )
    }

    return res.json({ data: { success: true }, error: null })
  } catch (err) {
    console.error('[POST /api/customer-category-assign]', err.message)
    return res.status(500).json({ data: null, error: { message: err.message } })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`API server listening on port ${PORT}`))

