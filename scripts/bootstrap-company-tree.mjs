import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DEFAULT_DEFINED_PATH = 'C:/RmsDrive/RMS/suitable-rms/COMPANY_TREE_DEFINED_ENTITIES_2026-05-10.md'
const DEFAULT_HANDOFF_PATH = 'C:/RmsDrive/RMS/suitable-rms/COMPANY_TREE_AGENT_COPY_HANDOFF_2026-05-10.md'
const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

const ROOT_DEFAULTS = {
  currency: 'TRY',
  showSymbol: true,
  symbolBefore: true,
  showDecimal: true,
  decimalPlaces: 2,
  invDecimal: 4,
}

const DEFAULT_LABOR_SETTINGS = {
  monthlyWorkHours: 225,
  weeklyDayOffCount: 1,
  weeklyWorkHours: 45,
  overtimeDeltaRate: 0.5,
  holidayOvertimeRate: 1,
  maxDailyWorkHours: 11,
  unpaidBreakMinutes: 60,
}

const ALLOWED_CHILDREN = {
  sirket: ['tuzel', 'org'],
  tuzel: ['org', 'sube', 'uretim', 'anadepo', 'gm'],
  org: ['org', 'sube', 'uretim', 'anadepo', 'gm'],
  sube: ['depo'],
  anadepo: ['depo', 'org'],
  uretim: ['depo', 'org'],
  gm: ['org'],
  depo: [],
}

const argv = process.argv.slice(2)
const validateOnly = argv.includes('--validate-only')

function readArg(prefix, fallback) {
  const match = argv.find(arg => arg.startsWith(`${prefix}=`))
  return match ? match.slice(prefix.length + 1) : fallback
}

const definedPath = readArg('--defined', DEFAULT_DEFINED_PATH)
const handoffPath = readArg('--handoff', DEFAULT_HANDOFF_PATH)

function logStep(message) {
  console.log(`\n[company-tree-bootstrap] ${message}`)
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

function parseSummaryCounts(markdown) {
  const summaryMatch = markdown.match(/## Summary\s+([\s\S]*?)\n## /)
  if (!summaryMatch) throw new Error('Summary bolumu bulunamadi.')
  const counts = {}
  for (const match of summaryMatch[1].matchAll(/- `([^`]+)`: `(\d+)`/g)) {
    counts[match[1]] = Number(match[2])
  }
  return counts
}

function parseCanonicalTypes(markdown) {
  const sectionMatch = markdown.match(/## 3\. Canonical Node Types\s+[\s\S]*?Kullanilan tipler:\s+([\s\S]*?)\n## 4\./)
  if (!sectionMatch) throw new Error('Canonical node types bolumu bulunamadi.')
  return Array.from(sectionMatch[1].matchAll(/- `([^`]+)`/g), match => match[1])
}

function parseHierarchy(markdown) {
  const match = markdown.match(/## Full Hierarchy\s+```text\s*([\s\S]*?)```/)
  if (!match) throw new Error('Full Hierarchy blogu bulunamadi.')
  return match[1]
    .split(/\r?\n/)
    .map(line => line.replace(/\s+$/, ''))
    .filter(Boolean)
}

function parseHierarchyLines(lines) {
  const roots = []
  const stack = []

  for (const line of lines) {
    const match = line.match(/^(\s*)- ([a-z]+): (.+)$/)
    if (!match) {
      throw new Error(`Cozulemeyen hierarchy satiri: ${line}`)
    }

    const spaces = match[1].length
    if (spaces % 2 !== 0) {
      throw new Error(`Girinti 2'nin kati degil: ${line}`)
    }

    const level = spaces / 2
    const node = {
      id: randomUUID(),
      type: match[2],
      name: match[3].trim(),
      children: [],
    }

    if (level === 0) {
      roots.push(node)
    } else {
      const parent = stack[level - 1]
      if (!parent) {
        throw new Error(`Parent bulunamadi: ${line}`)
      }
      parent.children.push(node)
    }

    stack[level] = node
    stack.length = level + 1
  }

  return roots
}

function walkTree(nodes, visit, parent = null) {
  for (const node of nodes) {
    visit(node, parent)
    walkTree(node.children || [], visit, node)
  }
}

function countNodeTypes(tree) {
  const counts = {}
  walkTree(tree, node => {
    counts[node.type] = (counts[node.type] || 0) + 1
  })
  return counts
}

function validateTreeStructure(tree, expectedCounts, canonicalTypes) {
  if (tree.length !== 1) {
    throw new Error(`Tek root bekleniyordu, bulundu: ${tree.length}`)
  }
  if (tree[0].type !== 'sirket') {
    throw new Error(`Root tipi sirket olmali, bulundu: ${tree[0].type}`)
  }

  const typeCounts = countNodeTypes(tree)
  for (const [type, count] of Object.entries(expectedCounts)) {
    if ((typeCounts[type] || 0) !== count) {
      throw new Error(`Tip sayimi uyusmuyor: ${type} beklenen=${count}, bulunan=${typeCounts[type] || 0}`)
    }
  }

  const ids = new Set()
  let totalNodes = 0
  walkTree(tree, (node, parent) => {
    totalNodes += 1

    if (!canonicalTypes.includes(node.type)) {
      throw new Error(`Desteklenmeyen node type: ${node.type}`)
    }

    if (ids.has(node.id)) {
      throw new Error(`Tekrarlanan id bulundu: ${node.id}`)
    }
    ids.add(node.id)

    if (parent) {
      const allowed = ALLOWED_CHILDREN[parent.type] || []
      if (!allowed.includes(node.type)) {
        throw new Error(`Parent-child kural ihlali: ${parent.type} -> ${node.type}`)
      }
    }

    if (node.type === 'depo' && (node.children || []).length > 0) {
      throw new Error(`Depo yaprak dugum olmali: ${node.name}`)
    }

    if (node.type === 'sube') {
      const invalidBranchChild = (node.children || []).some(child => child.type === 'sube')
      if (invalidBranchChild) {
        throw new Error(`Sube altinda sube bulunamaz: ${node.name}`)
      }
    }
  })

  const expectedTotal = Object.values(expectedCounts).reduce((sum, count) => sum + count, 0)
  if (totalNodes !== expectedTotal) {
    throw new Error(`Toplam dugum sayisi uyusmuyor: beklenen=${expectedTotal}, bulunan=${totalNodes}`)
  }
}

async function loadTaxes() {
  const rows = await queryApi({
    table: 'taxes',
    operation: 'select',
    select: 'id,name,rate',
    filters: [
      { type: 'order', col: 'rate', ascending: true },
      { type: 'order', col: 'name', ascending: true },
    ],
  })

  const purchaseTax = rows.find(row => row.name === 'KDV Temel Gıda')
  const salesTax = rows.find(row => row.name === 'KDV Gıda')

  if (!purchaseTax || !salesTax) {
    throw new Error('Gerekli vergi kayitlari bulunamadi: KDV Temel Gıda ve KDV Gıda zorunlu.')
  }

  return { purchaseTax, salesTax, allTaxes: rows }
}

function enrichTree(tree, taxIds) {
  return tree.map(node => enrichNode(node, taxIds))
}

function enrichNode(node, taxIds) {
  const base = {
    id: node.id,
    type: node.type,
    name: node.name,
    children: (node.children || []).map(child => enrichNode(child, taxIds)),
  }

  if (node.type === 'sirket') {
    return {
      ...base,
      ...ROOT_DEFAULTS,
      purchaseTax: taxIds.purchaseTax.id,
      salesTax: taxIds.salesTax.id,
    }
  }

  if (node.type === 'tuzel') {
    return {
      ...base,
      laborSettings: { ...DEFAULT_LABOR_SETTINGS },
    }
  }

  return base
}

function buildBranchContextsFromCompanyTree(treeValue) {
  const result = []

  function walk(nodes, ctx = {}) {
    for (const node of nodes) {
      const nextCtx = { ...ctx }
      if (node.type === 'sirket') nextCtx.company = { id: node.id, name: node.name }
      if (node.type === 'tuzel') nextCtx.legalEntity = { id: node.id, name: node.name }
      if (node.type === 'org') nextCtx.orgUnit = { id: node.id, name: node.name }

      if (node.type === 'sube') {
        result.push({
          branchId: String(node.id),
          branchName: String(node.name),
          companyId: nextCtx.company?.id ? String(nextCtx.company.id) : null,
          companyName: nextCtx.company?.name || null,
          legalEntityId: nextCtx.legalEntity?.id ? String(nextCtx.legalEntity.id) : null,
          legalEntityName: nextCtx.legalEntity?.name || null,
          orgUnitId: nextCtx.orgUnit?.id ? String(nextCtx.orgUnit.id) : null,
          orgUnitName: nextCtx.orgUnit?.name || null,
        })
      }

      walk(node.children || [], nextCtx)
    }
  }

  walk(treeValue, {})
  return result.sort((left, right) => String(left.branchName || '').localeCompare(String(right.branchName || ''), 'tr'))
}

function validateBranchContexts(tree) {
  const branchContexts = buildBranchContextsFromCompanyTree(tree)
  if (branchContexts.length !== 38) {
    throw new Error(`Branch context sayisi 38 olmali, bulundu: ${branchContexts.length}`)
  }

  const kayseri = branchContexts.filter(branch => branch.branchName === 'Kayseri Şubesi')
  if (kayseri.length !== 2) {
    throw new Error(`Kayseri Şubesi iki farkli branch olarak bulunmali, bulundu: ${kayseri.length}`)
  }

  const legalEntities = new Set(kayseri.map(branch => branch.legalEntityName).filter(Boolean))
  if (legalEntities.size !== 2) {
    throw new Error('Kayseri Şubesi kayitlari iki farkli tüzel kisilik altinda kalmadi.')
  }

  return branchContexts
}

async function readCompanyTreeSetting() {
  const rows = await queryApi({
    table: 'settings',
    operation: 'select',
    select: 'key,value',
    filters: [
      { type: 'eq', col: 'key', val: 'company_tree' },
      { type: 'limit', val: 1 },
    ],
  })
  return Array.isArray(rows) ? (rows[0] || null) : null
}

async function writeCompanyTree(tree) {
  const rows = await queryApi({
    table: 'settings',
    operation: 'upsert',
    data: { key: 'company_tree', value: tree },
    options: { onConflict: 'key' },
  })
  return Array.isArray(rows) ? rows[0] || null : rows
}

async function main() {
  logStep(`API health kontrolu: ${API_URL}`)
  await ensureApiHealth()

  logStep(`Kaynak dosyalar okunuyor`)
  const [definedMarkdown, handoffMarkdown] = await Promise.all([
    fs.readFile(path.resolve(definedPath), 'utf8'),
    fs.readFile(path.resolve(handoffPath), 'utf8'),
  ])

  const expectedCounts = parseSummaryCounts(definedMarkdown)
  const canonicalTypes = parseCanonicalTypes(handoffMarkdown)
  const hierarchyLines = parseHierarchy(definedMarkdown)
  const parsedTree = parseHierarchyLines(hierarchyLines)

  validateTreeStructure(parsedTree, expectedCounts, canonicalTypes)

  logStep('Vergi baglantilari cozuluyor')
  const taxes = await loadTaxes()
  const enrichedTree = enrichTree(parsedTree, taxes)
  const branchContexts = validateBranchContexts(enrichedTree)

  const existing = await readCompanyTreeSetting()
  console.log(JSON.stringify({
    existingCompanyTreePresent: Boolean(existing?.value),
    expectedCounts,
    branchContexts: branchContexts.length,
    purchaseTaxId: taxes.purchaseTax.id,
    salesTaxId: taxes.salesTax.id,
  }, null, 2))

  if (validateOnly) {
    logStep('Validate-only modu tamamlandi')
    return
  }

  logStep('company_tree Railway settings tablosuna yaziliyor')
  await writeCompanyTree(enrichedTree)

  const readBack = await readCompanyTreeSetting()
  const readBackTree = Array.isArray(readBack?.value) ? readBack.value : []
  validateTreeStructure(readBackTree, expectedCounts, canonicalTypes)
  const readBackBranchContexts = validateBranchContexts(readBackTree)

  const root = readBackTree[0] || {}
  if (root.purchaseTax !== taxes.purchaseTax.id || root.salesTax !== taxes.salesTax.id) {
    throw new Error('Root vergi baglantilari readback sonrasinda beklenen sekilde degil.')
  }

  console.log(JSON.stringify({
    totalNodes: hierarchyLines.length,
    rootName: root.name,
    branchContexts: readBackBranchContexts.length,
    companyTreeWritten: true,
  }, null, 2))
  logStep('Bootstrap tamamlandi')
}

main().catch(error => {
  console.error(`\n[company-tree-bootstrap] Hata: ${error.message}`)
  process.exit(1)
})
