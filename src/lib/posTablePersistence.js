import { db } from './db'
import {
  LAYOUT_EDITOR_STORAGE_KEY,
  extractLayoutTableDirectory,
  hasLayoutEditorContent,
  normalizeOpenTableTicketsState,
} from '@/lib/tableLayoutDirectory'
const POS_TABLE_HALLS_TABLE = 'pos_table_halls'
const POS_TABLE_SECTIONS_TABLE = 'pos_table_sections'
const POS_TABLES_TABLE = 'pos_tables'

export const OPEN_TABLE_TICKETS_STORAGE_KEY = 'suitable_garson_open_tickets_v1'
export const TABLE_LAYOUT_SETTING_KEY = 'pos_table_layout_v2'
export const OPEN_TABLE_TICKETS_SETTING_KEY = 'garson_open_table_tickets_v2'
export const TABLE_LAYOUT_UPDATED_EVENT = 'suitable:table-layout-updated'
export const OPEN_TABLE_TICKETS_UPDATED_EVENT = 'suitable:open-table-tickets-updated'
const PERSISTENCE_EVENT_ORIGIN = `tab-${Math.random().toString(36).slice(2, 10)}`

function readLocalJson(storageKey, fallbackValue) {
  if (typeof window === 'undefined') return fallbackValue
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return fallbackValue
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

function clearLocalKey(storageKey) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey)
  } catch {
    // Local cleanup is best-effort only.
  }
}

function dispatchWindowEvent(eventName, detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(eventName, {
    detail: {
      ...detail,
      origin: PERSISTENCE_EVENT_ORIGIN,
    },
  }))
}

function hasTicketStateContent(allTickets = {}) {
  return Object.values(allTickets || {}).some(branchTickets => (
    branchTickets && typeof branchTickets === 'object' && Object.keys(branchTickets).length > 0
  ))
}

function mergeTicketState(remoteState = {}, localState = {}) {
  const merged = {}
  const branchKeys = new Set([
    ...Object.keys(remoteState || {}),
    ...Object.keys(localState || {}),
  ])

  branchKeys.forEach(branchKey => {
    merged[branchKey] = {
      ...((remoteState || {})[branchKey] || {}),
      ...((localState || {})[branchKey] || {}),
    }
  })

  return merged
}

async function readSettingsValue(settingKey, fallbackValue) {
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', settingKey)
    .maybeSingle()

  if (error) throw error
  return data?.value ?? fallbackValue
}

async function writeSettingsValue(settingKey, value) {
  const { error } = await db
    .from('settings')
    .upsert({ key: settingKey, value })

  if (error) throw error
}

function safeText(value) {
  return String(value || '').trim()
}

function compareBySortThenName(left, right, nameKey = 'name') {
  const leftOrder = Number(left?.sort_order) || 0
  const rightOrder = Number(right?.sort_order) || 0
  if (leftOrder !== rightOrder) return leftOrder - rightOrder
  return String(left?.[nameKey] || '').localeCompare(String(right?.[nameKey] || ''), 'tr')
}

async function buildLayoutFromTableCatalog(branchId) {
  const safeBranchId = safeText(branchId)
  if (!safeBranchId) return null

  const [hallsResult, sectionsResult, tablesResult] = await Promise.all([
    db.from(POS_TABLE_HALLS_TABLE)
      .select('id,name,sort_order,is_active,deleted_at')
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
    db.from(POS_TABLE_SECTIONS_TABLE)
      .select('id,hall_id,name,sort_order,is_active,deleted_at')
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
    db.from(POS_TABLES_TABLE)
      .select('id,hall_id,section_id,table_name,table_number,sort_order,status,is_active,deleted_at')
      .eq('branch_id', safeBranchId)
      .is('deleted_at', null),
  ])

  if (hallsResult.error) throw hallsResult.error
  if (sectionsResult.error) throw sectionsResult.error
  if (tablesResult.error) throw tablesResult.error

  const halls = (hallsResult.data || [])
    .filter(item => item?.is_active !== false)
    .sort((a, b) => compareBySortThenName(a, b, 'name'))

  const sections = (sectionsResult.data || [])
    .filter(item => item?.is_active !== false)
    .sort((a, b) => compareBySortThenName(a, b, 'name'))

  const activeTables = (tablesResult.data || [])
    .filter(item => item?.is_active !== false && String(item?.status || '').trim() === 'active')
    .sort((a, b) => compareBySortThenName(a, b, 'table_name'))

  if (activeTables.length === 0) return null

  const sectionById = new Map(sections.map(item => [String(item.id), item]))
  const hallById = new Map(halls.map(item => [String(item.id), item]))

  const floorsMap = new Map()

  activeTables.forEach(table => {
    const section = sectionById.get(String(table.section_id || ''))
    const hall = hallById.get(String(table.hall_id || section?.hall_id || ''))
    const floorName = safeText(section?.name) || safeText(hall?.name) || 'Kat 1'

    if (!floorsMap.has(floorName)) floorsMap.set(floorName, [])
    floorsMap.get(floorName).push({
      id: String(table.id || ''),
      name: safeText(table.table_name) || (safeText(table.table_number) ? `Masa ${safeText(table.table_number)}` : ''),
      shape: 'round',
      seats: 0,
    })
  })

  const floors = Array.from(floorsMap.entries()).map(([name, tables]) => ({
    name,
    tables,
  }))

  return { floors }
}

export async function hydrateTableLayoutFromDb() {
  const remoteValue = await readSettingsValue(TABLE_LAYOUT_SETTING_KEY, null)
  const localValue = readLocalJson(LAYOUT_EDITOR_STORAGE_KEY, null)

  if (hasLayoutEditorContent(remoteValue)) {
    if (localValue) clearLocalKey(LAYOUT_EDITOR_STORAGE_KEY)
    return remoteValue
  }

  if (hasLayoutEditorContent(localValue)) {
    await writeSettingsValue(TABLE_LAYOUT_SETTING_KEY, localValue)
    clearLocalKey(LAYOUT_EDITOR_STORAGE_KEY)
    return localValue
  }

  const selectedBranchId = (typeof window !== 'undefined')
    ? safeText(window.localStorage.getItem('suitable_pos_branch_id'))
    : ''
  const fallbackLayout = await buildLayoutFromTableCatalog(selectedBranchId)

  if (hasLayoutEditorContent(fallbackLayout)) {
    await writeSettingsValue(TABLE_LAYOUT_SETTING_KEY, fallbackLayout)
    return fallbackLayout
  }

  return remoteValue
}

export async function persistTableLayoutToDb(layoutValue) {
  await writeSettingsValue(TABLE_LAYOUT_SETTING_KEY, layoutValue)
  clearLocalKey(LAYOUT_EDITOR_STORAGE_KEY)
  dispatchWindowEvent(TABLE_LAYOUT_UPDATED_EVENT)
  return layoutValue
}


export async function hydrateOpenTableTicketsFromDb(layoutTables = []) {
  const remoteValue = await readSettingsValue(OPEN_TABLE_TICKETS_SETTING_KEY, {})
  const localValue = readLocalJson(OPEN_TABLE_TICKETS_STORAGE_KEY, {})

  const mergedState = normalizeOpenTableTicketsState(
    mergeTicketState(remoteValue, localValue),
    layoutTables,
  )

  const shouldPersist = hasTicketStateContent(localValue)
    || JSON.stringify(mergedState) !== JSON.stringify(remoteValue || {})

  if (shouldPersist) {
    await writeSettingsValue(OPEN_TABLE_TICKETS_SETTING_KEY, mergedState)
    try {
      await syncOpenTicketsToSalesAndLines(mergedState)
    } catch (err) {
      console.error('Failed to sync open tickets on hydration:', err)
    }
  }

  if (hasTicketStateContent(localValue)) {
    clearLocalKey(OPEN_TABLE_TICKETS_STORAGE_KEY)
  }

  if (shouldPersist) {
    dispatchWindowEvent(OPEN_TABLE_TICKETS_UPDATED_EVENT)
  }

  return mergedState
}

export async function persistOpenTableTicketsToDb(ticketState = {}, layoutTables = []) {
  const normalizedState = normalizeOpenTableTicketsState(ticketState, layoutTables)
  await writeSettingsValue(OPEN_TABLE_TICKETS_SETTING_KEY, normalizedState)
  try {
    await syncOpenTicketsToSalesAndLines(normalizedState)
  } catch (err) {
    console.error('Failed to sync open tickets on persist:', err)
  }
  clearLocalKey(OPEN_TABLE_TICKETS_STORAGE_KEY)
  dispatchWindowEvent(OPEN_TABLE_TICKETS_UPDATED_EVENT)
  return normalizedState
}

export async function appendItemsToOpenTableTicket({
  branchId,
  tableKey,
  items = [],
  orderNote = '',
  customerPhone = '',
  sourceSessionId = '',
  sourceChannel = 'qr',
  sourceLabel = 'QR Siparisi',
  createdFromQr = true,
}) {
  const safeBranchId = String(branchId || '').trim()
  const safeTableKey = String(tableKey || '').trim()
  if (!safeBranchId || !safeTableKey || !Array.isArray(items) || items.length === 0) {
    return null
  }

  const remoteValue = await readSettingsValue(OPEN_TABLE_TICKETS_SETTING_KEY, {})
  const normalizedState = normalizeOpenTableTicketsState(remoteValue || {})
  const branchTickets = { ...(normalizedState[safeBranchId] || {}) }
  const currentTicket = branchTickets[safeTableKey] && typeof branchTickets[safeTableKey] === 'object'
    ? branchTickets[safeTableKey]
    : { cart: [], orderNote: '', guestCounts: { women: 0, men: 0, children: 0 } }

  const mappedItems = items.map(item => ({
    ...item,
    id: item?.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    sourceChannel: String(sourceChannel || 'qr').trim() || 'qr',
    sourceLabel: String(sourceLabel || 'QR Siparisi').trim() || 'QR Siparisi',
    sourceSessionId: String(sourceSessionId || '').trim() || null,
    customerPhone: String(customerPhone || '').replace(/\D/g, '').slice(-10) || null,
    createdFromQr: createdFromQr === true,
  }))

  const noteParts = [
    String(currentTicket.orderNote || '').trim(),
    String(orderNote || '').trim(),
  ].filter(Boolean)

  branchTickets[safeTableKey] = {
    ...currentTicket,
    id: currentTicket.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    cart: [...(Array.isArray(currentTicket.cart) ? currentTicket.cart : []), ...mappedItems],
    orderNote: noteParts.filter((value, index) => noteParts.indexOf(value) === index).join(' | '),
    updatedAt: new Date().toISOString(),
  }

  const nextState = {
    ...normalizedState,
    [safeBranchId]: branchTickets,
  }

  await writeSettingsValue(OPEN_TABLE_TICKETS_SETTING_KEY, nextState)
  try {
    await syncOpenTicketsToSalesAndLines(nextState)
  } catch (err) {
    console.error('Failed to sync open tickets on append:', err)
  }
  dispatchWindowEvent(OPEN_TABLE_TICKETS_UPDATED_EVENT)
  return nextState
}

export function readLocalLayoutSnapshot() {
  return readLocalJson(LAYOUT_EDITOR_STORAGE_KEY, null)
}

export function readLocalOpenTableTicketsSnapshot(layoutTables = []) {
  return normalizeOpenTableTicketsState(readLocalJson(OPEN_TABLE_TICKETS_STORAGE_KEY, {}), layoutTables)
}

export function extractTableDirectoryFromLayoutValue(layoutValue) {
  return extractLayoutTableDirectory(layoutValue)
}

export function isPersistenceEventFromCurrentTab(event) {
  return event?.detail?.origin === PERSISTENCE_EVENT_ORIGIN
}

async function syncOpenTicketsToSalesAndLines(ticketState = {}) {
  const branchIds = Object.keys(ticketState)
  if (branchIds.length === 0) return

  for (const branchId of branchIds) {
    const branchTickets = ticketState[branchId] || {}
    
    // Fetch branch name from company_nodes
    let branchName = 'Şube'
    try {
      const { data: nodeData } = await db
        .from('company_nodes')
        .select('name')
        .eq('id', branchId)
        .maybeSingle()
      if (nodeData?.name) branchName = nodeData.name
    } catch (e) {
      console.error('Failed to fetch branch name:', e)
    }

    // Fetch all currently 'active' sales for this branch
    const { data: activeSales, error: fetchErr } = await db
      .from('sales')
      .select('id,local_id,table_no')
      .eq('branch_id', branchId)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (fetchErr) {
      console.error('Error fetching active sales:', fetchErr)
      continue
    }

    const activeSalesMap = new Map(
      (activeSales || []).map(s => [s.table_no, s])
    )

    // Sync each open table ticket
    for (const [tableKey, ticket] of Object.entries(branchTickets)) {
      const tableNo = ticket.masaNo || tableKey
      const cart = ticket.cart || []
      const existingSale = activeSalesMap.get(tableNo)

      if (cart.length === 0) {
        // If cart is empty but an active sale exists, cancel it
        if (existingSale) {
          await db
            .from('sales')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', existingSale.id)
        }
        continue
      }

      // Calculate totals
      const grossTotal = cart.reduce((sum, item) => sum + (parseFloat(item.unitPrice) || 0) * (parseInt(item.qty) || 1), 0)
      const coverCount = (parseInt(ticket.guestCounts?.women) || 0) +
                         (parseInt(ticket.guestCounts?.men) || 0) +
                         (parseInt(ticket.guestCounts?.children) || 0)

      // Build sales header
      const saleHeader = {
        branch_id: branchId,
        branch_name: branchName,
        table_no: tableNo,
        status: 'active',
        gross_total_before_discount: grossTotal,
        gross_total_after_discount: grossTotal,
        net_total_after_discount: grossTotal,
        cost_total: 0,
        payment_total: 0,
        change_amount: 0,
        order_note: ticket.orderNote || '',
        personnel_id: ticket.ownerId || null,
        personnel_name: ticket.ownerName || null,
        cover_count: coverCount,
        female_guest_count: parseInt(ticket.guestCounts?.women) || 0,
        male_guest_count: parseInt(ticket.guestCounts?.men) || 0,
        child_guest_count: parseInt(ticket.guestCounts?.children) || 0,
        kds_status: 'pending',
        updated_at: new Date().toISOString()
      }

      let saleId = null
      const ticketLocalId = ticket.id || ticket.local_id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`

      if (existingSale) {
        saleId = existingSale.id
        await db
          .from('sales')
          .update({ ...saleHeader, local_id: ticketLocalId })
          .eq('id', saleId)
      } else {
        const { data: newSale, error: insertErr } = await db
          .from('sales')
          .insert({
            ...saleHeader,
            local_id: ticketLocalId,
            sale_datetime: new Date().toISOString(),
            created_at: new Date().toISOString()
          })
          .select('id')
          .single()

        if (insertErr) {
          console.error('Error inserting active sale:', insertErr)
          continue
        }
        saleId = newSale?.id
      }

      if (saleId) {
        // Delete existing lines
        await db.from('sale_lines').delete().eq('sale_id', saleId)

        // Insert new lines
        const linesPayload = cart.map((item, idx) => {
          const courseType = item.course_type || item.prod?.default_course || 'main_dish'
          const courseStatus = item.course_status || 'fire'

          return {
            sale_id: saleId,
            line_no: idx + 1,
            product_id: item.prod?.id || null,
            product_name: item.prod?.name || item.name || '',
            product_sku: item.prod?.sku || null,
            qty: item.qty || 1,
            unit_gross_before_discount: item.unitPrice || 0,
            line_gross_before_discount: (item.unitPrice || 0) * (item.qty || 1),
            unit_gross_after_discount: item.unitPrice || 0,
            line_gross_after_discount: (item.unitPrice || 0) * (item.qty || 1),
            line_net_after_discount: (item.unitPrice || 0) * (item.qty || 1),
            sale_datetime: new Date().toISOString(),
            created_at: new Date().toISOString(),
            course_type: courseType,
            course_status: courseStatus,
            fired_at: courseStatus === 'fire' ? new Date().toISOString() : null,
            kds_completed: false
          }
        })

        if (linesPayload.length > 0) {
          await db.from('sale_lines').insert(linesPayload)
        }
      }
    }
  }
}

