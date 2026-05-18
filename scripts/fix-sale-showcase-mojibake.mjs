import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const EXISTING_IDS = {
  saleRoot: 'a39c3971-8e16-47be-b859-0d8129178e34',
  burgers: '2f7d8c89-eb26-4dc8-9711-5d458ca4cc4e',
}

const LABELS = {
  burgers: 'Burgerler',
  chicken: 'Tavuk \u00dcr\u00fcnleri',
  snacks: 'Snackler',
  cold_drinks: 'So\u011fuk \u0130\u00e7ecekler',
  hot_drinks: 'S\u0131cak \u0130\u00e7ecekler',
  desserts: 'Tatl\u0131lar',
  icecream: 'Dondurmalar',
  salads: 'Salatalar',
  pasta: 'Makarnalar',
  pizza: 'Pizzalar',
  bowls: 'Bowllar',
  combos: 'Combo Men\u00fcler',
  klasikMenu: 'Klasik Hamburger Men\u00fc',
  klasikShort: 'Klasik Men\u00fc',
  cheeseMenu: 'Cheeseburger Men\u00fc',
  cheeseShort: 'Cheese Men\u00fc',
  doubleMenu: 'Double Burger Men\u00fc',
  doubleShort: 'Double Men\u00fc',
  tavukMenu: 'Tavuk Burger Men\u00fc',
  tavukShort: 'Tavuk Men\u00fc',
  premiumMenu: 'Premium Burger Men\u00fc',
  premiumShort: 'Premium',
  cocukMenu: '\u00c7ocuk Men\u00fc',
  cocukShort: '\u00c7ocuk',
  anaSecim: 'Ana \u00dcr\u00fcn Se\u00e7imi',
  icecekSecim: '\u0130\u00e7ecek Se\u00e7imi',
  snackSecim: 'Snack Se\u00e7imi',
  sablon: '\u015eablonu',
  demoKartlari: 'demo sat\u0131\u015f kartlar\u0131.',
  kategoriAciklamaSonek: 'ailesi demo sat\u0131\u015f katalogu i\u00e7in kullan\u0131l\u0131r.',
  comboCardSuffix: 'demo combo kart\u0131d\u0131r.',
}

function stableUuid(scope, value) {
  const hash = createHash('sha1').update(`${scope}:${value}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

function psSingleQuote(value) {
  return String(value).replace(/'/g, "''")
}

function toAsciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
}

function apiQuery(body) {
  const requestPath = path.resolve(__dirname, '..', 'tmp-fix-sale-showcase-mojibake.json')
  fs.writeFileSync(requestPath, toAsciiJson(body), 'utf8')
  const psScript = [
    `$bodyPath = '${psSingleQuote(requestPath)}'`,
    `$uri = '${psSingleQuote(`${API_URL}/api/query`)}'`,
    '$body = Get-Content -Raw -LiteralPath $bodyPath',
    "$resp = Invoke-RestMethod -Uri $uri -Method Post -ContentType 'application/json' -Body $body",
    '$resp | ConvertTo-Json -Depth 100 -Compress',
  ].join('; ')
  const result = spawnSync(
    'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-Command', psScript],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 30 },
  )
  try { fs.unlinkSync(requestPath) } catch {}
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'API query calismadi')
  }
  const payload = JSON.parse(result.stdout.trim())
  if (payload?.error) {
    throw new Error(payload.error.message || 'API query hatasi')
  }
  return payload.data
}

function apiSelect(table, filters = [], select = '*') {
  return apiQuery({ table, operation: 'select', select, filters })
}

function apiSelectSingle(table, filters = [], select = '*') {
  const rows = apiSelect(table, [...filters, { type: 'limit', val: 1 }], select)
  return rows?.[0] || null
}

function apiUpdate(table, data, filters) {
  return apiQuery({ table, operation: 'update', data, filters })
}

function apiUpsert(table, data, onConflict = 'id') {
  return apiQuery({ table, operation: 'upsert', data, options: { onConflict } })
}

function categoryDefs() {
  return [
    { key: 'burgers', id: EXISTING_IDS.burgers, name: LABELS.burgers },
    { key: 'chicken', id: stableUuid('sale-category', 'chicken'), name: LABELS.chicken },
    { key: 'snacks', id: stableUuid('sale-category', 'snacks'), name: LABELS.snacks },
    { key: 'cold_drinks', id: stableUuid('sale-category', 'cold_drinks'), name: LABELS.cold_drinks },
    { key: 'hot_drinks', id: stableUuid('sale-category', 'hot_drinks'), name: LABELS.hot_drinks },
    { key: 'desserts', id: stableUuid('sale-category', 'desserts'), name: LABELS.desserts },
    { key: 'icecream', id: stableUuid('sale-category', 'icecream'), name: LABELS.icecream },
    { key: 'salads', id: stableUuid('sale-category', 'salads'), name: LABELS.salads },
    { key: 'pasta', id: stableUuid('sale-category', 'pasta'), name: LABELS.pasta },
    { key: 'pizza', id: stableUuid('sale-category', 'pizza'), name: LABELS.pizza },
    { key: 'bowls', id: stableUuid('sale-category', 'bowls'), name: LABELS.bowls },
    { key: 'combos', id: stableUuid('sale-category', 'combos'), name: LABELS.combos },
  ]
}

function comboLabelMap() {
  return {
    'klasik-menu': { name: LABELS.klasikMenu, shortName: LABELS.klasikShort },
    'cheese-menu': { name: LABELS.cheeseMenu, shortName: LABELS.cheeseShort },
    'double-menu': { name: LABELS.doubleMenu, shortName: LABELS.doubleShort },
    'tavuk-menu': { name: LABELS.tavukMenu, shortName: LABELS.tavukShort },
    'premium-menu': { name: LABELS.premiumMenu, shortName: LABELS.premiumShort },
    'cocuk-menu': { name: LABELS.cocukMenu, shortName: LABELS.cocukShort },
  }
}

function comboIdToKey() {
  return Object.fromEntries(Object.keys(comboLabelMap()).map((key) => [stableUuid('combo-record', key), key]))
}

function patchComboRecords(records) {
  const byId = comboIdToKey()
  return (Array.isArray(records) ? records : []).map((record) => {
    const comboKey = byId[String(record?.id || '')]
    if (!comboKey) return record
    const labels = comboLabelMap()[comboKey]
    const next = {
      ...record,
      name: labels.name,
      shortName: labels.shortName,
      form: {
        ...record.form,
        name: labels.name,
        shortName: labels.shortName,
        channel_description: `${labels.name} ${LABELS.comboCardSuffix}`,
      },
    }
    if (Array.isArray(next.groups)) {
      next.groups = next.groups.map((group, index) => ({
        ...group,
        name: index === 0 ? LABELS.anaSecim : index === 1 ? LABELS.icecekSecim : LABELS.snackSecim,
      }))
    }
    return next
  })
}

function templateName(categoryName) {
  return `${categoryName} ${LABELS.sablon}`
}

function templateDescription(categoryName) {
  return `${categoryName} ${LABELS.demoKartlari}`
}

function main() {
  const categories = categoryDefs()

  for (const category of categories) {
    apiUpdate(
      'sale_categories',
      {
        name: category.name,
        description: `${category.name} ${LABELS.kategoriAciklamaSonek}`,
      },
      [{ type: 'eq', col: 'id', val: category.id }],
    )
  }

  const templateRows = apiSelect('sale_templates', [], 'id,sale_ids,deleted_at')
  const templateMap = new Map((templateRows || []).map((row) => [String(row.id), row]))
  const templatePatches = categories
    .filter((cat) => cat.key !== 'combos')
    .map((cat) => {
      const id = stableUuid('sale-template', cat.key)
      const existing = templateMap.get(id)
      return existing ? {
        id,
        name: templateName(cat.name),
        description: templateDescription(cat.name),
        sale_ids: JSON.stringify(existing.sale_ids || []),
        deleted_at: existing.deleted_at || null,
      } : null
    })
    .filter(Boolean)

  if (templatePatches.length) {
    apiUpsert('sale_templates', templatePatches, 'id')
  }

  const comboSetting = apiSelectSingle('settings', [{ type: 'eq', col: 'key', val: 'combo_menus_v1' }], 'key,value')
  const nextComboValue = JSON.stringify(patchComboRecords(comboSetting?.value))
  apiUpsert('settings', { key: 'combo_menus_v1', value: nextComboValue }, 'key')

  const verifyCategories = apiSelect(
    'sale_categories',
    [{ type: 'in', col: 'id', val: categories.map((cat) => cat.id) }],
    'id,name',
  )
  const verifyCombos = apiSelectSingle('settings', [{ type: 'eq', col: 'key', val: 'combo_menus_v1' }], 'key,value')

  console.log(JSON.stringify({
    categories: verifyCategories,
    comboPreview: (verifyCombos?.value || []).slice(0, 6).map((item) => item.name),
  }, null, 2))
}

main()
