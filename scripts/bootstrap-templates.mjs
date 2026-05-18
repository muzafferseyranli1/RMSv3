import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Client } = pg

const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')
const DATABASE_URL = process.env.DATABASE_URL || ''
const DATABASE_SSL = process.env.DATABASE_SSL === 'true'

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
const schemaPath = path.resolve(__dirname, '..', 'sql', 'template-bootstrap.sql')

const LEGAL_ENTITY_NAMES = {
  anadoluBurger: 'Anadolu Burger Restoranları Limited Şirketi',
  egeAkdeniz: 'Ege Akdeniz Yeme İçme Limited Şirketi',
  franchise: 'Franchise İşletmeleri Limited Şirketi',
  muzaffer: 'Muzaffer Hamburgeri Limited Şirketi',
}

const ISTANBUL_BRANCH_NAMES = new Set([
  'İstanbul Ataşehir Şubesi',
  'İstanbul Beylikdüzü Şubesi',
  'İstanbul Kartal Şubesi',
  'İstanbul Sarıyer Şubesi',
  'Bakırköy Şubesi',
  'Beşiktaş Şubesi',
  'Kadıköy Şubesi',
  'Pendik Şubesi',
  'Şişli Şubesi',
  'Üsküdar Şubesi',
])

const CAMPAIGN_BRANCH_NAMES = new Set([
  ...ISTANBUL_BRANCH_NAMES,
  'Ankara Etimesgut Şubesi',
  'Ankara Pursaklar Şubesi',
  'Ankara Çankaya Şubesi',
  'Ankara Keçiören Şubesi',
  'Antalya Alanya Şubesi',
  'Antalya Kepez Şubesi',
  'Antalya Muratpaşa Şubesi',
  'Antalya Lara Şubesi',
  'İzmir Konak Şubesi',
  'İzmir Buca Şubesi',
  'İzmir Bornova Şubesi',
  'İzmir Karşıyaka Şubesi',
])

function logStep(message) {
  console.log(`\n[template-bootstrap] ${message}`)
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

async function selectTable(table, columns = '*', filters = []) {
  return queryApi({ table, operation: 'select', select: columns, filters })
}

async function selectTemplateByName(table, name) {
  const selectMap = {
    branch_templates: 'id,name,description,branch_ids,deleted_at',
    stock_templates: 'id,name,description,stock_ids,deleted_at',
    sale_templates: 'id,name,description,sale_ids,deleted_at',
  }

  const rows = await selectTable(table, selectMap[table] || '*', [
    { type: 'eq', col: 'name', val: name },
    { type: 'limit', val: 1 },
  ])
  return Array.isArray(rows) ? rows[0] || null : null
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

function flattenBranches(treeValue = []) {
  const branches = []

  function walk(nodes, ctx = {}) {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const nextCtx = { ...ctx }
      if (node.type === 'tuzel') nextCtx.legalEntityName = node.name
      if (node.type === 'sube') {
        branches.push({
          id: String(node.id),
          name: String(node.name),
          legalEntityName: nextCtx.legalEntityName || null,
        })
      }
      walk(node.children || [], nextCtx)
    }
  }

  walk(treeValue, {})
  return branches
}

async function loadBranchesFromCompanyTree() {
  const rows = await selectTable('settings', 'key,value', [
    { type: 'eq', col: 'key', val: 'company_tree' },
    { type: 'limit', val: 1 },
  ])

  const row = Array.isArray(rows) ? rows[0] || null : null
  const treeValue = Array.isArray(row?.value) ? row.value : []
  const branches = flattenBranches(treeValue)
  if (branches.length === 0) {
    throw new Error('company_tree icinde sube bulunamadi. Branch template seed durduruldu.')
  }
  return branches
}

function buildBranchTemplates(branches) {
  const byName = new Map(branches.map(branch => [branch.name, branch]))

  function branchIdsFromNames(names) {
    return names
      .map(name => byName.get(name)?.id || null)
      .filter(Boolean)
  }

  function branchIdsByLegalEntity(legalEntityName) {
    return branches
      .filter(branch => branch.legalEntityName === legalEntityName)
      .map(branch => branch.id)
      .sort()
  }

  const allBranchIds = branches.map(branch => branch.id).sort()
  const istanbulBranchIds = branchIdsFromNames([...ISTANBUL_BRANCH_NAMES])
  const campaignBranchIds = branchIdsFromNames([...CAMPAIGN_BRANCH_NAMES])

  return [
    {
      name: 'Tüm Şubeler',
      description: 'Stok kartlari ve satis tanimlarinda tum aktif subeleri tek secimde kapsar.',
      branch_ids: allBranchIds,
    },
    {
      name: 'İstanbul Şubeleri',
      description: 'Istanbul lokasyonlarinin tamamini tek sablonda toplar.',
      branch_ids: istanbulBranchIds,
    },
    {
      name: 'Ege Akdeniz Şubeleri',
      description: 'Ege Akdeniz Yeme Icme Limited Sirketi altindaki subeleri kapsar.',
      branch_ids: branchIdsByLegalEntity(LEGAL_ENTITY_NAMES.egeAkdeniz),
    },
    {
      name: 'Franchise Şubeleri',
      description: 'Franchise Isletmeleri Limited Sirketi altindaki subeleri kapsar.',
      branch_ids: branchIdsByLegalEntity(LEGAL_ENTITY_NAMES.franchise),
    },
    {
      name: 'Anadolu Burger Şubeleri',
      description: 'Anadolu Burger Restoranlari Limited Sirketi altindaki subeleri kapsar.',
      branch_ids: branchIdsByLegalEntity(LEGAL_ENTITY_NAMES.anadoluBurger),
    },
    {
      name: 'Muzaffer Şubeleri',
      description: 'Muzaffer Hamburgeri Limited Sirketi altindaki subeleri kapsar.',
      branch_ids: branchIdsByLegalEntity(LEGAL_ENTITY_NAMES.muzaffer),
    },
    {
      name: 'Kampanya Şubeleri',
      description: 'Yuksek gorunurlukte kampanya akislari icin Istanbul, Ankara, Izmir ve Antalya subelerini toplar.',
      branch_ids: campaignBranchIds,
    },
  ]
}

async function normalizeBranchTemplates(templates) {
  let attempted = 0
  let succeeded = 0

  for (const template of templates) {
    attempted += 1
    const existing = await selectTemplateByName('branch_templates', template.name)
    const payload = {
      name: template.name,
      description: template.description,
      branch_ids: template.branch_ids,
      deleted_at: null,
    }

    if (existing) {
      await updateRow('branch_templates', existing.id, payload)
    } else {
      await insertRow('branch_templates', payload)
    }

    const readBack = await selectTemplateByName('branch_templates', template.name)
    if (!readBack) {
      throw new Error(`branch_templates icin readback basarisiz: ${template.name}`)
    }
    succeeded += 1
  }

  return { attempted, succeeded }
}

async function verifyTemplateTables(expectedBranchTemplateNames) {
  const [branchTemplates, stockTemplates, saleTemplates] = await Promise.all([
    selectTable('branch_templates', 'id,name,description,branch_ids,deleted_at', [
      { type: 'is', col: 'deleted_at', val: null },
      { type: 'order', col: 'name', ascending: true },
    ]),
    selectTable('stock_templates', 'id,name,stock_ids,deleted_at', [
      { type: 'is', col: 'deleted_at', val: null },
      { type: 'order', col: 'name', ascending: true },
    ]),
    selectTable('sale_templates', 'id,name,sale_ids,deleted_at', [
      { type: 'is', col: 'deleted_at', val: null },
      { type: 'order', col: 'name', ascending: true },
    ]),
  ])

  for (const name of expectedBranchTemplateNames) {
    const row = (branchTemplates || []).find(template => template.name === name)
    if (!row) {
      throw new Error(`Beklenen branch template bulunamadi: ${name}`)
    }
  }

  return {
    branch_templates: Array.isArray(branchTemplates) ? branchTemplates.length : 0,
    stock_templates: Array.isArray(stockTemplates) ? stockTemplates.length : 0,
    sale_templates: Array.isArray(saleTemplates) ? saleTemplates.length : 0,
  }
}

async function main() {
  logStep(`API health kontrolu: ${API_URL}`)
  await ensureApiHealth()

  if (!seedOnly) {
    logStep(`Schema uygulaniyor: ${schemaPath}`)
    await applySchema()
  }

  const branches = await loadBranchesFromCompanyTree()
  const branchTemplates = buildBranchTemplates(branches)

  if (!schemaOnly) {
    logStep('Seed asamasi basliyor: branch_templates')
    const branchBatch = await normalizeBranchTemplates(branchTemplates)
    console.log(JSON.stringify({ table: 'branch_templates', ...branchBatch }))
  }

  const summary = await verifyTemplateTables(branchTemplates.map(template => template.name))
  logStep(`Dogrulama tamam: ${JSON.stringify(summary)}`)
}

main().catch(error => {
  console.error(`\n[template-bootstrap] Hata: ${error.message}`)
  process.exit(1)
})
