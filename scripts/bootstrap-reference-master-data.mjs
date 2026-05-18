import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')
const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

const TAXES = [
  { name: 'KDV Temel Gıda', rate: 1 },
  { name: 'KDV Gıda', rate: 10 },
  { name: 'KDV Hizmet', rate: 20 },
  { name: 'KDV Genel', rate: 20 },
]

const UNITS = [
  { name: 'adet', label: 'Adet', symbol: 'ad', sort_order: 10, is_system: false },
  { name: 'gram', label: 'Gram', symbol: 'g', sort_order: 20, is_system: false },
  { name: 'kilogram', label: 'Kilogram', symbol: 'kg', sort_order: 30, is_system: false },
  { name: 'santilitre', label: 'Santilitre', symbol: 'cl', sort_order: 40, is_system: false },
  { name: 'mililitre', label: 'Mililitre', symbol: 'ml', sort_order: 50, is_system: false },
  { name: 'litre', label: 'Litre', symbol: 'L', sort_order: 60, is_system: false },
  { name: 'koli', label: 'Koli', symbol: 'koli', sort_order: 70, is_system: false },
  { name: 'paket', label: 'Paket', symbol: 'pkt', sort_order: 80, is_system: false },
  { name: 'kasa', label: 'Kasa', symbol: 'kasa', sort_order: 90, is_system: false },
  { name: 'duzine', label: 'Düzine', symbol: 'dz', sort_order: 100, is_system: false },
]

const CHANNELS = [
  { name: 'Hızlı Satış', icon: 'fa-bolt', sort_order: 10, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
  { name: 'Gel Al', icon: 'fa-bag-shopping', sort_order: 20, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
  { name: 'Masa', icon: 'fa-chair', sort_order: 30, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
  { name: 'QR Menü', icon: 'fa-qrcode', sort_order: 40, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
  { name: 'Kiosk', icon: 'fa-desktop', sort_order: 50, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
  { name: 'Suitable Yemek', icon: 'fa-utensils', sort_order: 60, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
  { name: 'Online Yemek', icon: 'fa-motorcycle', sort_order: 70, active: true, show_in_kds: true, show_in_queue: true, deleted_at: null },
]

function createContractTerms({
  fixedSalary = true,
  hourly = false,
  partTime = false,
} = {}) {
  return {
    fixed_salary: { enabled: fixedSalary, amount: '' },
    hourly: { enabled: hourly, amount: '' },
    part_time: { enabled: partTime, amount: '' },
  }
}

const POSITION_SEED_TIMESTAMP = '2026-05-10T00:00:00.000Z'

const POSITIONS = [
  {
    id: 'seed_pos_sube_muduru',
    name: 'Şube Müdürü',
    shortCode: 'SBM',
    lateToleranceMinutes: 10,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: false, partTime: false }),
    notes: 'Şube operasyonundan ve ekip koordinasyonundan sorumludur.',
  },
  {
    id: 'seed_pos_vardiya_muduru',
    name: 'Vardiya Müdürü',
    shortCode: 'VRD',
    lateToleranceMinutes: 10,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: false }),
    notes: 'Vardiya açılış, kapanış ve operasyon akışını yönetir.',
  },
  {
    id: 'seed_pos_garson',
    name: 'Garson',
    shortCode: 'GRS',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Masa servisi ve misafir deneyiminden sorumludur.',
  },
  {
    id: 'seed_pos_komi',
    name: 'Komi',
    shortCode: 'KOM',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Servis ekibine destek verir, mise-en-place surecini tasir.',
  },
  {
    id: 'seed_pos_kasiyer',
    name: 'Kasiyer',
    shortCode: 'KSR',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Tahsilat, kasa acilis-kapanis ve siparis gecisini yonetir.',
  },
  {
    id: 'seed_pos_paket_servis',
    name: 'Paket Servis Personeli',
    shortCode: 'PKT',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Gel-al ve paket siparis operasyonunu destekler.',
  },
  {
    id: 'seed_pos_mutfak_sefi',
    name: 'Mutfak Şefi',
    shortCode: 'MTS',
    lateToleranceMinutes: 10,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: false, partTime: false }),
    notes: 'Mutfak standardi, kalite ve urun cikisini yonetir.',
  },
  {
    id: 'seed_pos_usta_asci',
    name: 'Usta Aşçı',
    shortCode: 'UAS',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: false }),
    notes: 'Recete uygulamasi ve ana urun hazirliginda gorevlidir.',
  },
  {
    id: 'seed_pos_hazirlik_personeli',
    name: 'Hazırlık Personeli',
    shortCode: 'HZR',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Gun ici prep, porsiyonlama ve destek islerini yapar.',
  },
  {
    id: 'seed_pos_izgara_ustasi',
    name: 'Izgara Ustası',
    shortCode: 'IZG',
    lateToleranceMinutes: 5,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: false }),
    notes: 'Izgara hattinda urun standardini korur.',
  },
  {
    id: 'seed_pos_bulasik_personeli',
    name: 'Bulaşık Personeli',
    shortCode: 'BLS',
    lateToleranceMinutes: 10,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Bulasik, ekipman hijyeni ve arka alan duzeninden sorumludur.',
  },
  {
    id: 'seed_pos_depo_sorumlusu',
    name: 'Depo Sorumlusu',
    shortCode: 'DPS',
    lateToleranceMinutes: 10,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: false }),
    notes: 'Mal kabul, stok duzeni ve depo transferlerini takip eder.',
  },
  {
    id: 'seed_pos_temizlik_personeli',
    name: 'Temizlik Personeli',
    shortCode: 'TMZ',
    lateToleranceMinutes: 10,
    contractTerms: createContractTerms({ fixedSalary: true, hourly: true, partTime: true }),
    notes: 'Salon, mutfak ve ortak alan temizlik sureclerinde gorevlidir.',
  },
]

const argv = new Set(process.argv.slice(2))
const schemaOnly = argv.has('--schema-only')
const seedOnly = argv.has('--seed-only')

if (schemaOnly && seedOnly) {
  console.error('Ayni anda hem --schema-only hem --seed-only kullanilamaz.')
  process.exit(1)
}

if (!DATABASE_URL && !seedOnly) {
  console.error('DATABASE_URL zorunludur. Schema uygulamasi icin Railway Postgres baglantisini env ile verin.')
  process.exit(1)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const schemaPath = path.resolve(__dirname, '..', 'sql', 'reference-master-bootstrap.sql')

function logStep(message) {
  console.log(`\n[reference-bootstrap] ${message}`)
}

async function queryApi(body) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (payload?.error) {
    throw new Error(payload.error.message || 'Bilinmeyen API hatasi')
  }
  return payload.data
}

async function ensureApiHealth() {
  const response = await fetch(`${API_URL}/health`)
  if (!response.ok) {
    throw new Error(`API health hatasi: HTTP ${response.status}`)
  }
  const payload = await response.json()
  if (!payload?.ok) {
    throw new Error('API health sonucu beklenen sekilde donmedi.')
  }
}

async function applySchema() {
  const sql = await fs.readFile(schemaPath, 'utf8')
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: DATABASE_SSL ? { rejectUnauthorized: false } : false,
  })

  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

async function selectByName(table, name, columns = '*') {
  const rows = await queryApi({
    table,
    operation: 'select',
    select: columns,
    filters: [
      { type: 'eq', col: 'name', val: name },
      { type: 'limit', val: 1 },
    ],
  })
  return Array.isArray(rows) ? (rows[0] || null) : null
}

async function insertRow(table, data) {
  return queryApi({ table, operation: 'insert', data })
}

async function updateRow(table, id, data) {
  return queryApi({
    table,
    operation: 'update',
    data,
    filters: [{ type: 'eq', col: 'id', val: id }],
  })
}

async function selectTable(table, columns = '*', filters = []) {
  return queryApi({ table, operation: 'select', select: columns, filters })
}

async function readSettingValue(key) {
  const rows = await queryApi({
    table: 'settings',
    operation: 'select',
    select: 'key,value',
    filters: [
      { type: 'eq', col: 'key', val: key },
      { type: 'limit', val: 1 },
    ],
  })
  return Array.isArray(rows) ? (rows[0] || null) : null
}

async function upsertSettingValue(key, value) {
  return queryApi({
    table: 'settings',
    operation: 'upsert',
    data: { key, value },
    options: { onConflict: 'key' },
  })
}

function normalizeTableContractTerms(input = {}, fallback = createContractTerms()) {
  const output = {}
  for (const [key, defaults] of Object.entries(fallback)) {
    const source = input?.[key] || {}
    output[key] = {
      enabled: source.enabled ?? defaults.enabled,
      amount: source.amount ?? defaults.amount,
    }
  }
  return output
}

function normalizeExistingPosition(input = {}) {
  return {
    ...input,
    id: String(input?.id || ''),
    name: String(input?.name || ''),
    shortCode: String(input?.shortCode || input?.short_code || '').trim().toUpperCase(),
    lateToleranceMinutes: Number(input?.lateToleranceMinutes) || 0,
    contractTerms: normalizeTableContractTerms(input?.contractTerms, createContractTerms()),
    notes: String(input?.notes || ''),
    createdAt: String(input?.createdAt || ''),
    updatedAt: String(input?.updatedAt || ''),
    deletedAt: input?.deletedAt || null,
  }
}

function buildPositionSeedArray(existingRows = []) {
  const existingPositions = Array.isArray(existingRows) ? existingRows.map(normalizeExistingPosition) : []
  const seedCodes = new Set(POSITIONS.map(position => position.shortCode.toUpperCase()))
  const existingByCode = new Map(existingPositions.map(position => [position.shortCode, position]))
  const timestamp = new Date().toISOString()

  const seededPositions = POSITIONS.map(seed => {
    const existing = existingByCode.get(seed.shortCode.toUpperCase())
    const seededContractTerms = normalizeTableContractTerms(seed.contractTerms, seed.contractTerms)
    const existingContractTerms = normalizeTableContractTerms(existing?.contractTerms, seed.contractTerms)

    return {
      ...existing,
      id: existing?.id || seed.id,
      name: seed.name,
      shortCode: seed.shortCode.toUpperCase(),
      lateToleranceMinutes: seed.lateToleranceMinutes,
      contractTerms: {
        fixed_salary: {
          enabled: seededContractTerms.fixed_salary.enabled,
          amount: existingContractTerms.fixed_salary.amount ?? seededContractTerms.fixed_salary.amount,
        },
        hourly: {
          enabled: seededContractTerms.hourly.enabled,
          amount: existingContractTerms.hourly.amount ?? seededContractTerms.hourly.amount,
        },
        part_time: {
          enabled: seededContractTerms.part_time.enabled,
          amount: existingContractTerms.part_time.amount ?? seededContractTerms.part_time.amount,
        },
      },
      notes: existing?.notes || seed.notes,
      createdAt: existing?.createdAt || POSITION_SEED_TIMESTAMP,
      updatedAt: timestamp,
      deletedAt: null,
    }
  })

  const untouchedPositions = existingPositions.filter(position => !seedCodes.has(position.shortCode))
  return [...untouchedPositions, ...seededPositions]
}

async function normalizePositionsSetting() {
  const existing = await readSettingValue('personnel_positions')
  const nextValue = buildPositionSeedArray(existing?.value)

  await upsertSettingValue('personnel_positions', nextValue)

  const readBack = await readSettingValue('personnel_positions')
  const readBackValue = Array.isArray(readBack?.value) ? readBack.value.map(normalizeExistingPosition) : []

  for (const seed of POSITIONS) {
    const matched = readBackValue.find(position => position.shortCode === seed.shortCode.toUpperCase())
    if (!matched || matched.deletedAt) {
      throw new Error(`personnel_positions icin readback basarisiz: ${seed.shortCode}`)
    }
  }

  return {
    attempted: POSITIONS.length,
    succeeded: POSITIONS.length,
    total: readBackValue.length,
  }
}

async function normalizeTable({ table, rows, key = 'name', columns = '*' }) {
  let attempted = 0
  let succeeded = 0

  for (const row of rows) {
    attempted += 1
    const existing = await selectByName(table, row[key], columns)
    if (existing) {
      await updateRow(table, existing.id, row)
    } else {
      await insertRow(table, row)
    }
    const readBack = await selectByName(table, row[key], columns)
    if (!readBack) {
      throw new Error(`${table} icin readback basarisiz: ${row[key]}`)
    }
    succeeded += 1
  }

  return { attempted, succeeded }
}

async function verifyCounts() {
  const [taxes, units, channels, positionsSetting] = await Promise.all([
    selectTable('taxes', 'id,name,rate,deleted_at'),
    selectTable('units', 'id,name,label,symbol,sort_order,is_system,deleted_at'),
    selectTable('sales_channels', 'id,name,icon,sort_order,active,show_in_kds,show_in_queue,deleted_at'),
    readSettingValue('personnel_positions'),
  ])

  const positions = Array.isArray(positionsSetting?.value)
    ? positionsSetting.value.map(normalizeExistingPosition)
    : []

  const activeSeededPositions = POSITIONS.filter(seed => (
    positions.some(position => position.shortCode === seed.shortCode.toUpperCase() && !position.deletedAt)
  )).length

  const summary = {
    taxes: Array.isArray(taxes) ? taxes.length : 0,
    units: Array.isArray(units) ? units.length : 0,
    sales_channels: Array.isArray(channels) ? channels.length : 0,
    seeded_positions: activeSeededPositions,
    positions_total: positions.length,
  }

  if (summary.taxes !== 4 || summary.units !== 10 || summary.sales_channels !== 7 || summary.seeded_positions !== POSITIONS.length) {
    throw new Error(`Beklenmeyen sayim ozeti: ${JSON.stringify(summary)}`)
  }

  return summary
}

async function main() {
  logStep(`API health kontrolu: ${API_URL}`)
  await ensureApiHealth()

  if (!seedOnly) {
    logStep(`Schema uygulaniyor: ${schemaPath}`)
    await applySchema()
  }

  if (!schemaOnly) {
    logStep('Seed asamasi basliyor: taxes')
    const taxBatch = await normalizeTable({
      table: 'taxes',
      rows: TAXES,
      columns: 'id,name,rate,deleted_at,created_at',
    })
    console.log(JSON.stringify({ table: 'taxes', ...taxBatch }))

    logStep('Seed asamasi basliyor: units')
    const unitBatch = await normalizeTable({
      table: 'units',
      rows: UNITS,
      columns: 'id,name,label,symbol,sort_order,is_system,deleted_at,created_at',
    })
    console.log(JSON.stringify({ table: 'units', ...unitBatch }))

    logStep('Seed asamasi basliyor: sales_channels')
    const channelBatch = await normalizeTable({
      table: 'sales_channels',
      rows: CHANNELS,
      columns: 'id,name,icon,sort_order,active,show_in_kds,show_in_queue,deleted_at',
    })
    console.log(JSON.stringify({ table: 'sales_channels', ...channelBatch }))

    logStep('Seed asamasi basliyor: personnel_positions')
    const positionsBatch = await normalizePositionsSetting()
    console.log(JSON.stringify({ setting: 'personnel_positions', ...positionsBatch }))
  }

  const summary = await verifyCounts()
  logStep(`Dogrulama tamam: ${JSON.stringify(summary)}`)
}

main().catch((error) => {
  console.error(`\n[reference-bootstrap] Hata: ${error.message}`)
  process.exit(1)
})
