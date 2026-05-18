import { db } from '@/lib/db'
import { createPosTableQrToken } from '@/lib/posQrService'

export const POS_TABLE_HALLS_TABLE = 'pos_table_halls'
export const POS_TABLE_SECTIONS_TABLE = 'pos_table_sections'
export const POS_TABLES_TABLE = 'pos_tables'

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

function safeText(value) {
  return String(value || '').trim()
}

function toNullableText(value) {
  const text = safeText(value)
  return text || null
}

function toSafeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeTableType(value) {
  const safeValue = safeText(value || 'round')
  return ['round', 'square'].includes(safeValue) ? safeValue : 'round'
}

function normalizeTableStatus(value) {
  const safeValue = safeText(value || 'active')
  return ['active', 'inactive', 'archived'].includes(safeValue) ? safeValue : 'active'
}

function ensureBranchId(branchId) {
  const safeBranchId = safeText(branchId)
  if (!safeBranchId) throw new Error('Sube baglami bulunamadi.')
  return safeBranchId
}

function ensureId(id, label = 'Kayit') {
  const safeId = safeText(id)
  if (!safeId) throw new Error(`${label} kimligi bulunamadi.`)
  return safeId
}

function compareSortOrder(left, right) {
  const leftOrder = Number.isFinite(Number(left?.sort_order)) ? Number(left.sort_order) : 0
  const rightOrder = Number.isFinite(Number(right?.sort_order)) ? Number(right.sort_order) : 0
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return String(left?.name || left?.table_name || '').localeCompare(String(right?.name || right?.table_name || ''), 'tr')
}

function firstRow(result) {
  if (result?.error) throw result.error
  if (Array.isArray(result?.data)) return result.data[0] || null
  return result?.data || null
}

function normalizeHall(record = {}) {
  return {
    id: String(record.id || ''),
    branch_id: record.branch_id || null,
    name: safeText(record.name),
    code: safeText(record.code),
    sort_order: Number(record.sort_order) || 0,
    is_active: record.is_active !== false,
    deleted_at: record.deleted_at || null,
  }
}

function normalizeSection(record = {}) {
  return {
    id: String(record.id || ''),
    branch_id: record.branch_id || null,
    hall_id: String(record.hall_id || ''),
    name: safeText(record.name),
    sort_order: Number(record.sort_order) || 0,
    is_active: record.is_active !== false,
    deleted_at: record.deleted_at || null,
  }
}

function normalizeTable(record = {}) {
  return {
    id: String(record.id || ''),
    branch_id: record.branch_id || null,
    hall_id: String(record.hall_id || ''),
    section_id: String(record.section_id || ''),
    table_code: safeText(record.table_code),
    table_name: safeText(record.table_name),
    table_number: safeText(record.table_number),
    table_type: normalizeTableType(record.table_type),
    capacity: Number(record.capacity) || null,
    sort_order: Number(record.sort_order) || 0,
    status: normalizeTableStatus(record.status),
    qr_token: safeText(record.qr_token),
    qr_payload_version: Number(record.qr_payload_version) || 1,
    last_qr_generated_at: record.last_qr_generated_at || null,
    is_active: record.is_active !== false,
    deleted_at: record.deleted_at || null,
  }
}

function normalizeRows(result, mapper) {
  return Array.isArray(result?.data) ? result.data.map(mapper) : []
}

function activeBadge(label, color) {
  return { label, color, bg: 'rgba(15,23,42,.08)' }
}

export function buildTableManagementTree({ halls = [], sections = [], tables = [] }) {
  const hallMap = new Map()

  halls
    .map(normalizeHall)
    .sort(compareSortOrder)
    .forEach(hall => {
      hallMap.set(hall.id, {
        id: `hall:${hall.id}`,
        entityType: 'hall',
        entityId: hall.id,
        label: hall.name || 'Salon',
        hall,
        badges: hall.code ? [activeBadge(hall.code, '#38bdf8')] : [],
        children: [],
      })
    })

  const sectionMap = new Map()

  sections
    .map(normalizeSection)
    .sort(compareSortOrder)
    .forEach(section => {
      const node = {
        id: `section:${section.id}`,
        entityType: 'section',
        entityId: section.id,
        label: section.name || 'Bolum',
        section,
        children: [],
      }
      sectionMap.set(section.id, node)
      const hallNode = hallMap.get(section.hall_id)
      if (hallNode) hallNode.children.push(node)
    })

  tables
    .map(normalizeTable)
    .sort(compareSortOrder)
    .forEach(table => {
      const tableNode = {
        id: `table:${table.id}`,
        entityType: 'table',
        entityId: table.id,
        label: table.table_name || table.table_number || 'Masa',
        table,
        badges: [
          table.table_number ? activeBadge(`No ${table.table_number}`, '#f59e0b') : null,
          table.table_type ? activeBadge(table.table_type === 'square' ? 'Kare' : 'Yuvarlak', '#38bdf8') : null,
          table.capacity ? activeBadge(`${table.capacity} kisi`, '#94a3b8') : null,
        ].filter(Boolean),
        children: [],
      }

      const sectionNode = sectionMap.get(table.section_id)
      if (sectionNode) {
        sectionNode.children.push(tableNode)
        return
      }

      const hallNode = hallMap.get(table.hall_id)
      if (hallNode) {
        hallNode.children.push(tableNode)
      }
    })

  return Array.from(hallMap.values())
}

async function loadHalls(branchId) {
  const result = await db.from(POS_TABLE_HALLS_TABLE)
    .select('*')
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')
  if (result.error) throw result.error
  return normalizeRows(result, normalizeHall)
}

async function loadSections(branchId) {
  const result = await db.from(POS_TABLE_SECTIONS_TABLE)
    .select('*')
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')
  if (result.error) throw result.error
  return normalizeRows(result, normalizeSection)
}

async function loadTables(branchId) {
  const result = await db.from(POS_TABLES_TABLE)
    .select('*')
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('table_number')
  if (result.error) throw result.error
  return normalizeRows(result, normalizeTable)
}

export async function loadTableManagementCatalog(branchId) {
  const safeBranchId = ensureBranchId(branchId)
  const [halls, sections, tables] = await Promise.all([
    loadHalls(safeBranchId),
    loadSections(safeBranchId),
    loadTables(safeBranchId),
  ])

  return {
    halls,
    sections,
    tables,
    tree: buildTableManagementTree({ halls, sections, tables }),
  }
}

export async function loadTableByQrToken({ branchId, tableToken }) {
  const safeBranchId = ensureBranchId(branchId)
  const safeToken = ensureId(tableToken, 'QR token')

  const tableResult = await db.from(POS_TABLES_TABLE)
    .select('*')
    .eq('branch_id', safeBranchId)
    .eq('qr_token', safeToken)
    .is('deleted_at', null)
    .maybeSingle()
  if (tableResult.error) throw tableResult.error
  const table = tableResult.data ? normalizeTable(tableResult.data) : null
  if (!table || table.status !== 'active' || table.is_active === false) return null

  const [hallResult, sectionResult] = await Promise.all([
    db.from(POS_TABLE_HALLS_TABLE)
      .select('*')
      .eq('id', table.hall_id)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null)
      .maybeSingle(),
    db.from(POS_TABLE_SECTIONS_TABLE)
      .select('*')
      .eq('id', table.section_id)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null)
      .maybeSingle(),
  ])
  if (hallResult.error) throw hallResult.error
  if (sectionResult.error) throw sectionResult.error

  return {
    table,
    hall: hallResult.data ? normalizeHall(hallResult.data) : null,
    section: sectionResult.data ? normalizeSection(sectionResult.data) : null,
  }
}

export async function createHall(input = {}) {
  const branchId = ensureBranchId(input.branchId)
  const payload = {
    id: createId(),
    branch_id: branchId,
    name: safeText(input.name),
    code: toNullableText(input.code),
    sort_order: toSafeInteger(input.sortOrder, 0),
    is_active: true,
  }
  if (!payload.name) throw new Error('Salon adi zorunlu.')

  const result = await db.from(POS_TABLE_HALLS_TABLE).insert(payload).select('*')
  return normalizeHall(firstRow(result))
}

export async function updateHall(id, patch = {}) {
  const hallId = ensureId(id, 'Salon')
  const branchId = ensureBranchId(patch.branchId)
  const payload = {
    updated_at: new Date().toISOString(),
  }
  if ('name' in patch) payload.name = safeText(patch.name)
  if ('code' in patch) payload.code = toNullableText(patch.code)
  if ('sortOrder' in patch) payload.sort_order = toSafeInteger(patch.sortOrder, 0)
  if (!payload.name && 'name' in patch) throw new Error('Salon adi zorunlu.')

  const result = await db.from(POS_TABLE_HALLS_TABLE)
    .update(payload)
    .eq('id', hallId)
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .select('*')
  return normalizeHall(firstRow(result))
}

export async function archiveHall(id, branchId) {
  const hallId = ensureId(id, 'Salon')
  const safeBranchId = ensureBranchId(branchId)
  const deletedAt = new Date().toISOString()

  const [hallResult, sectionsResult, tablesResult] = await Promise.all([
    db.from(POS_TABLE_HALLS_TABLE)
      .update({ deleted_at: deletedAt, is_active: false, updated_at: deletedAt })
      .eq('id', hallId)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
    db.from(POS_TABLE_SECTIONS_TABLE)
      .update({ deleted_at: deletedAt, is_active: false, updated_at: deletedAt })
      .eq('hall_id', hallId)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
    db.from(POS_TABLES_TABLE)
      .update({ deleted_at: deletedAt, is_active: false, status: 'archived', updated_at: deletedAt })
      .eq('hall_id', hallId)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
  ])

  if (hallResult.error) throw hallResult.error
  if (sectionsResult.error) throw sectionsResult.error
  if (tablesResult.error) throw tablesResult.error
}

export async function createSection(input = {}) {
  const branchId = ensureBranchId(input.branchId)
  const hallId = ensureId(input.hallId, 'Salon')
  const payload = {
    id: createId(),
    branch_id: branchId,
    hall_id: hallId,
    name: safeText(input.name),
    sort_order: toSafeInteger(input.sortOrder, 0),
    is_active: true,
  }
  if (!payload.name) throw new Error('Bolum adi zorunlu.')

  const result = await db.from(POS_TABLE_SECTIONS_TABLE).insert(payload).select('*')
  return normalizeSection(firstRow(result))
}

export async function updateSection(id, patch = {}) {
  const sectionId = ensureId(id, 'Bolum')
  const branchId = ensureBranchId(patch.branchId)
  const payload = {
    updated_at: new Date().toISOString(),
  }
  if ('name' in patch) payload.name = safeText(patch.name)
  if ('sortOrder' in patch) payload.sort_order = toSafeInteger(patch.sortOrder, 0)
  if (!payload.name && 'name' in patch) throw new Error('Bolum adi zorunlu.')

  const result = await db.from(POS_TABLE_SECTIONS_TABLE)
    .update(payload)
    .eq('id', sectionId)
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .select('*')
  return normalizeSection(firstRow(result))
}

export async function archiveSection(id, branchId) {
  const sectionId = ensureId(id, 'Bolum')
  const safeBranchId = ensureBranchId(branchId)
  const deletedAt = new Date().toISOString()

  const [sectionResult, tablesResult] = await Promise.all([
    db.from(POS_TABLE_SECTIONS_TABLE)
      .update({ deleted_at: deletedAt, is_active: false, updated_at: deletedAt })
      .eq('id', sectionId)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
    db.from(POS_TABLES_TABLE)
      .update({ deleted_at: deletedAt, is_active: false, status: 'archived', updated_at: deletedAt })
      .eq('section_id', sectionId)
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
  ])

  if (sectionResult.error) throw sectionResult.error
  if (tablesResult.error) throw tablesResult.error
}

export async function createTable(input = {}) {
  const branchId = ensureBranchId(input.branchId)
  const hallId = ensureId(input.hallId, 'Salon')
  const sectionId = ensureId(input.sectionId, 'Bolum')
  const payload = {
    id: createId(),
    branch_id: branchId,
    hall_id: hallId,
    section_id: sectionId,
    table_code: toNullableText(input.tableCode),
    table_name: safeText(input.tableName),
    table_number: safeText(input.tableNumber),
    table_type: normalizeTableType(input.tableType),
    capacity: input.capacity == null || input.capacity === '' ? null : toSafeInteger(input.capacity, 0),
    sort_order: toSafeInteger(input.sortOrder, 0),
    status: normalizeTableStatus(input.status),
    is_active: normalizeTableStatus(input.status) !== 'inactive',
    qr_token: createPosTableQrToken(),
    qr_payload_version: 1,
    last_qr_generated_at: new Date().toISOString(),
  }
  if (!payload.table_name) throw new Error('Masa adi zorunlu.')
  if (!payload.table_number) throw new Error('Masa numarasi zorunlu.')

  const result = await db.from(POS_TABLES_TABLE).insert(payload).select('*')
  return normalizeTable(firstRow(result))
}

export async function updateTable(id, patch = {}) {
  const tableId = ensureId(id, 'Masa')
  const branchId = ensureBranchId(patch.branchId)
  const payload = {
    updated_at: new Date().toISOString(),
  }
  if ('tableCode' in patch) payload.table_code = toNullableText(patch.tableCode)
  if ('tableName' in patch) payload.table_name = safeText(patch.tableName)
  if ('tableNumber' in patch) payload.table_number = safeText(patch.tableNumber)
  if ('tableType' in patch) payload.table_type = normalizeTableType(patch.tableType)
  if ('capacity' in patch) payload.capacity = patch.capacity == null || patch.capacity === '' ? null : toSafeInteger(patch.capacity, 0)
  if ('sortOrder' in patch) payload.sort_order = toSafeInteger(patch.sortOrder, 0)
  if ('status' in patch) {
    payload.status = normalizeTableStatus(patch.status)
    payload.is_active = payload.status === 'active'
  }
  if (!payload.table_name && 'tableName' in patch) throw new Error('Masa adi zorunlu.')
  if (!payload.table_number && 'tableNumber' in patch) throw new Error('Masa numarasi zorunlu.')

  const result = await db.from(POS_TABLES_TABLE)
    .update(payload)
    .eq('id', tableId)
    .eq('branch_id', branchId)
    .is('deleted_at', null)
    .select('*')
  return normalizeTable(firstRow(result))
}

export async function archiveTable(id, branchId) {
  const tableId = ensureId(id, 'Masa')
  const safeBranchId = ensureBranchId(branchId)
  const deletedAt = new Date().toISOString()
  const result = await db.from(POS_TABLES_TABLE)
    .update({ deleted_at: deletedAt, is_active: false, status: 'archived', updated_at: deletedAt })
    .eq('id', tableId)
    .eq('branch_id', safeBranchId)
    .is('deleted_at', null)
  if (result.error) throw result.error
}

export async function regenerateTableQr(id, branchId) {
  const tableId = ensureId(id, 'Masa')
  const safeBranchId = ensureBranchId(branchId)
  const payload = {
    qr_token: createPosTableQrToken(),
    qr_payload_version: 1,
    last_qr_generated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const result = await db.from(POS_TABLES_TABLE)
    .update(payload)
    .eq('id', tableId)
    .eq('branch_id', safeBranchId)
    .is('deleted_at', null)
    .select('*')
  return normalizeTable(firstRow(result))
}
