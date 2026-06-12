import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import { Client } from 'pg'

const root = process.cwd()
const envPath = path.join(root, 'server', '.env')
const apiBase = process.env.API_BASE || 'https://rms-api-production-219d.up.railway.app'

function loadDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(envPath, 'utf8')
  for (const raw of env.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (key !== 'DATABASE_URL') continue
    let value = line.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    return value
  }
  throw new Error('DATABASE_URL not found')
}

function kb(n) {
  return Number(n || 0) / 1024
}

function mb(n) {
  return Number(n || 0) / 1024 / 1024
}

function fmtBytes(n) {
  const value = Number(n || 0)
  if (value >= 1024 * 1024) return `${mb(value).toFixed(2)} MB`
  return `${kb(value).toFixed(2)} KB`
}

function requestBytes(pathname, body, acceptEncoding = 'gzip, br') {
  const payload = body ? Buffer.from(JSON.stringify(body)) : null
  const url = new URL(pathname, apiBase)
  return new Promise((resolve, reject) => {
    const req = https.request({
      method: payload ? 'POST' : 'GET',
      hostname: url.hostname,
      path: `${url.pathname}${url.search}`,
      headers: {
        'content-type': 'application/json',
        'accept-encoding': acceptEncoding,
        ...(payload ? { 'content-length': String(payload.length) } : {}),
      },
    }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        resolve({
          status: res.statusCode,
          encoding: res.headers['content-encoding'] || 'identity',
          wireBytes: buffer.length,
          contentLength: res.headers['content-length'] || null,
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function main() {
  const dbUrl = loadDbUrl()
  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('rlwy.net') ? { rejectUnauthorized: false } : false,
  })
  await client.connect()
  await client.query(`SET statement_timeout = '8s'`)

  console.log('=== DB SIZE SNAPSHOT ===')
  const dbSize = await client.query('SELECT pg_database_size(current_database()) AS bytes')
  console.log(`database_size=${fmtBytes(dbSize.rows[0].bytes)}`)

  console.log('\n=== TOP TABLES BY TOTAL RELATION SIZE ===')
  const topTables = await client.query(`
    SELECT schemaname, relname, pg_total_relation_size(format('%I.%I', schemaname, relname)) AS bytes
    FROM pg_stat_user_tables
    ORDER BY bytes DESC
    LIMIT 15
  `)
  for (const row of topTables.rows) {
    console.log(`${row.relname.padEnd(38)} ${fmtBytes(row.bytes).padStart(10)}`)
  }

  console.log('\n=== SETTINGS JSON SIZES ===')
  const settings = await client.query(`
    SELECT key, octet_length(value::text) AS bytes
    FROM settings
    ORDER BY bytes DESC
  `)
  for (const row of settings.rows) {
    console.log(`${row.key.padEnd(38)} ${fmtBytes(row.bytes).padStart(10)}`)
  }

  console.log('\n=== LARGEST JSON/JSONB COLUMNS BY ESTIMATED TOTAL TEXT SIZE ===')
  const jsonCols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('json', 'jsonb')
      AND table_name = ANY($1)
    ORDER BY table_name, column_name
  `, [[
    'settings',
    'customer_app_config',
    'stock_items',
    'semi_items',
    'sale_items',
    'sale_options',
    'option_groups',
    'purchase_orders',
    'purchase_order_lines',
    'inventory_movements',
    'warehouse_task_events',
    'tickets',
    'pos_terminals',
    'sales',
    'sale_lines',
    'form_templates',
    'form_submissions',
  ]])
  const jsonStats = []
  for (const col of jsonCols.rows) {
    const identTable = `"${col.table_name.replaceAll('"', '""')}"`
    const identCol = `"${col.column_name.replaceAll('"', '""')}"`
    try {
      const stat = await client.query(`
        SELECT
          count(*)::int AS rows,
          coalesce(sum(octet_length(${identCol}::text)), 0)::bigint AS total_bytes,
          coalesce(max(octet_length(${identCol}::text)), 0)::bigint AS max_bytes
        FROM ${identTable}
        WHERE ${identCol} IS NOT NULL
      `)
      jsonStats.push({ ...col, ...stat.rows[0] })
    } catch {
      // Ignore columns that cannot be inspected due to permissions or transient DDL changes.
    }
  }
  jsonStats
    .sort((a, b) => Number(b.total_bytes) - Number(a.total_bytes))
    .slice(0, 20)
    .forEach(row => {
      console.log(`${`${row.table_name}.${row.column_name}`.padEnd(48)} total=${fmtBytes(row.total_bytes).padStart(10)} max=${fmtBytes(row.max_bytes).padStart(10)} rows=${row.rows}`)
    })

  console.log('\n=== API RESPONSE WIRE BYTES (compressed and identity over https) ===')
  const probes = [
    ['health', '/health', null],
    ['settings:company_tree', '/api/query', { table: 'settings', operation: 'select', select: 'key,value', filters: [{ type: 'eq', col: 'key', val: 'company_tree' }] }],
    ['settings:personnel_records', '/api/query', { table: 'settings', operation: 'select', select: 'key,value', filters: [{ type: 'eq', col: 'key', val: 'personnel_records' }] }],
    ['settings:kiosk_settings_v2', '/api/query', { table: 'settings', operation: 'select', select: 'key,value', filters: [{ type: 'eq', col: 'key', val: 'kiosk_settings_v2' }] }],
    ['customer_app_config:active', '/api/query', { table: 'customer_app_config', operation: 'select', select: 'id,config_key,branding,home_buttons,active', filters: [{ type: 'eq', col: 'active', val: true }, { type: 'limit', val: 10 }] }],
    ['sale_items:catalog500', '/api/query', { table: 'sale_items', operation: 'select', select: 'id,name,short_name,sku,channel_prices,portions,option_groups,location,pos_image,channel_image,sale_status', filters: [{ type: 'is', col: 'deleted_at', val: null }, { type: 'limit', val: 500 }] }],
    ['stock_items:all1000', '/api/query', { table: 'stock_items', operation: 'select', select: '*', filters: [{ type: 'limit', val: 1000 }] }],
    ['inventory_movements:recent1000', '/api/query', { table: 'inventory_movements', operation: 'select', select: '*', filters: [{ type: 'order', col: 'movement_at', ascending: false }, { type: 'limit', val: 1000 }] }],
  ]
  for (const [label, pathname, body] of probes) {
    try {
      const compressed = await requestBytes(pathname, body, 'gzip, br')
      const identity = await requestBytes(pathname, body, 'identity')
      console.log(`${label.padEnd(32)} status=${compressed.status} compressed=${fmtBytes(compressed.wireBytes).padStart(10)}(${compressed.encoding}) identity=${fmtBytes(identity.wireBytes).padStart(10)}(${identity.encoding})`)
    } catch (err) {
      console.log(`${label.padEnd(32)} ERROR ${err.message}`)
    }
  }

  await client.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
