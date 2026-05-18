export const LAYOUT_EDITOR_STORAGE_KEY = 'suitable_pos_layout_editor_v2'

function normalizeAlias(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
}

export function normalizeMasaNo(value) {
  const match = String(value || '').match(/(\d+)/)
  if (match?.[1]) return match[1].padStart(2, '0')
  const trimmed = String(value || '').trim()
  return trimmed || '01'
}

function buildFallbackLabel(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return 'Masa 01'
  if (/^\d+$/.test(trimmed)) return `Masa ${normalizeMasaNo(trimmed)}`
  if (/^table[_:-]/i.test(trimmed)) return `Masa ${normalizeMasaNo(trimmed)}`
  return trimmed
}

function buildTableKey(table, floorName, tableIndex) {
  const rawId = String(table?.id || '').trim()
  if (rawId) return rawId
  const label = String(table?.name || '').trim() || `Masa ${normalizeMasaNo(tableIndex + 1)}`
  return `${floorName || 'Kat'}::${label}::${tableIndex}`
}

export function extractLayoutTableDirectory(layoutValue) {
  try {
    const parsed = typeof layoutValue === 'string' ? JSON.parse(layoutValue) : layoutValue
    const floors = Array.isArray(parsed?.floors) ? parsed.floors : []

    return floors.flatMap((floor, floorIndex) => {
      const floorName = typeof floor?.name === 'string' && floor.name.trim()
        ? floor.name.trim()
        : `Kat ${floorIndex + 1}`
      const tables = Array.isArray(floor?.tables) ? floor.tables : []

      return tables.map((table, tableIndex) => {
        const masaNo = normalizeMasaNo(table?.name || tableIndex + 1)
        return {
          tableKey: buildTableKey(table, floorName, tableIndex),
          masaNo,
          label: typeof table?.name === 'string' && table.name.trim()
            ? table.name.trim()
            : `Masa ${masaNo}`,
          floorName,
        }
      })
    })
  } catch {
    return []
  }
}

export function hasLayoutEditorContent(layoutValue) {
  return extractLayoutTableDirectory(layoutValue).length > 0
}

export function readLayoutTableDirectory() {
  try {
    const raw = localStorage.getItem(LAYOUT_EDITOR_STORAGE_KEY) || 'null'
    return extractLayoutTableDirectory(raw)
  } catch {
    return []
  }
}

function buildTableIndex(layoutTables = []) {
  const byKey = new Map()
  const aliasToKey = new Map()
  const masaCounts = new Map()
  const labelCounts = new Map()

  layoutTables.forEach(table => {
    const masaNo = normalizeMasaNo(table?.masaNo || table?.label)
    masaCounts.set(masaNo, (masaCounts.get(masaNo) || 0) + 1)

    const normalizedLabel = normalizeAlias(table?.label)
    if (normalizedLabel) {
      labelCounts.set(normalizedLabel, (labelCounts.get(normalizedLabel) || 0) + 1)
    }
  })

  layoutTables.forEach(table => {
    if (!table?.tableKey) return

    const tableKey = String(table.tableKey).trim()
    const masaNo = normalizeMasaNo(table?.masaNo || table?.label)
    const label = String(table?.label || '').trim()
    const normalizedLabel = normalizeAlias(label)

    byKey.set(tableKey, table)
    aliasToKey.set(tableKey, tableKey)
    aliasToKey.set(normalizeAlias(tableKey), tableKey)

    if (masaCounts.get(masaNo) === 1) {
      aliasToKey.set(masaNo, tableKey)
    }

    if (label && labelCounts.get(normalizedLabel) === 1) {
      aliasToKey.set(label, tableKey)
      aliasToKey.set(normalizedLabel, tableKey)
    }
  })

  return { byKey, aliasToKey }
}

export function resolveTableKey(tableRef, layoutTablesOrIndex = []) {
  const index = Array.isArray(layoutTablesOrIndex)
    ? buildTableIndex(layoutTablesOrIndex)
    : (layoutTablesOrIndex || buildTableIndex())
  const rawValue = String(tableRef || '').trim()
  if (!rawValue) return ''
  if (index.byKey.has(rawValue)) return rawValue
  if (index.aliasToKey.has(rawValue)) return index.aliasToKey.get(rawValue)

  const normalizedValue = normalizeAlias(rawValue)
  if (index.aliasToKey.has(normalizedValue)) return index.aliasToKey.get(normalizedValue)

  return rawValue
}

export function resolveTableRecord(tableRef, layoutTablesOrIndex = []) {
  const index = Array.isArray(layoutTablesOrIndex)
    ? buildTableIndex(layoutTablesOrIndex)
    : (layoutTablesOrIndex || buildTableIndex())
  const tableKey = resolveTableKey(tableRef, index)
  if (tableKey && index.byKey.has(tableKey)) {
    return index.byKey.get(tableKey)
  }

  return {
    tableKey,
    masaNo: normalizeMasaNo(tableRef),
    label: buildFallbackLabel(tableRef),
    floorName: '',
  }
}

function getGuestCount(counts, key) {
  return Math.max(0, parseInt(counts?.[key], 10) || 0)
}

function getTicketGuestCounts(ticket) {
  return {
    women: getGuestCount(ticket?.guestCounts, 'women'),
    men: getGuestCount(ticket?.guestCounts, 'men'),
    children: getGuestCount(ticket?.guestCounts, 'children'),
  }
}

function getTicketContentScore(ticket) {
  const cartSize = Array.isArray(ticket?.cart) ? ticket.cart.length : 0
  const noteScore = String(ticket?.orderNote || '').trim() ? 10 : 0
  const guestCounts = getTicketGuestCounts(ticket)
  const guestScore = guestCounts.women + guestCounts.men + guestCounts.children
  const ownerScore = ticket?.ownerId || ticket?.ownerName ? 1 : 0
  return (cartSize * 100) + noteScore + guestScore + ownerScore
}

function mergeTableTickets(existingTicket, incomingTicket) {
  if (!existingTicket) return incomingTicket
  if (!incomingTicket) return existingTicket

  const existingScore = getTicketContentScore(existingTicket)
  const incomingScore = getTicketContentScore(incomingTicket)
  const existingUpdatedAt = Date.parse(existingTicket?.updatedAt || '') || 0
  const incomingUpdatedAt = Date.parse(incomingTicket?.updatedAt || '') || 0

  const shouldPreferIncoming = incomingScore > existingScore
    || (incomingScore === existingScore && incomingUpdatedAt >= existingUpdatedAt)

  const primary = shouldPreferIncoming ? incomingTicket : existingTicket
  const secondary = shouldPreferIncoming ? existingTicket : incomingTicket
  const primaryGuests = getTicketGuestCounts(primary)
  const secondaryGuests = getTicketGuestCounts(secondary)
  const primaryGuestTotal = primaryGuests.women + primaryGuests.men + primaryGuests.children

  return {
    ...secondary,
    ...primary,
    cart: Array.isArray(primary?.cart) && primary.cart.length > 0
      ? primary.cart
      : (Array.isArray(secondary?.cart) ? secondary.cart : []),
    orderNote: String(primary?.orderNote || secondary?.orderNote || ''),
    guestCounts: primaryGuestTotal > 0 ? primaryGuests : secondaryGuests,
    ownerId: primary?.ownerId || secondary?.ownerId || '',
    ownerName: primary?.ownerName || secondary?.ownerName || '',
    updatedAt: primary?.updatedAt || secondary?.updatedAt || null,
  }
}

function hasOpenTicketLikeContent(ticket) {
  const guestCounts = getTicketGuestCounts(ticket)
  return (Array.isArray(ticket?.cart) && ticket.cart.length > 0)
    || Boolean(String(ticket?.orderNote || '').trim())
    || (guestCounts.women + guestCounts.men + guestCounts.children) > 0
}

export function normalizeBranchTableTickets(branchTickets = {}, layoutTablesOrIndex = []) {
  const index = Array.isArray(layoutTablesOrIndex)
    ? buildTableIndex(layoutTablesOrIndex)
    : (layoutTablesOrIndex || buildTableIndex())
  const normalized = {}

  Object.entries(branchTickets || {}).forEach(([storedKey, ticket]) => {
    const rawKey = String(storedKey || '').trim()
    if (!rawKey) return

    const resolvedKey = resolveTableKey(rawKey, index) || rawKey
    normalized[resolvedKey] = normalized[resolvedKey]
      ? mergeTableTickets(normalized[resolvedKey], ticket)
      : ticket
  })

  return normalized
}

export function normalizeOpenTableTicketsState(allTickets = {}, layoutTablesOrIndex = []) {
  const normalizedState = {}

  Object.entries(allTickets || {}).forEach(([branchKey, branchTickets]) => {
    const normalizedBranch = normalizeBranchTableTickets(branchTickets, layoutTablesOrIndex)
    if (Object.keys(normalizedBranch).length > 0) {
      normalizedState[branchKey] = normalizedBranch
    }
  })

  return normalizedState
}

export function buildTableDirectory(layoutTables = [], branchTickets = {}, currentTableKey = '', options = {}) {
  const index = buildTableIndex(layoutTables)
  const normalizedBranchTickets = normalizeBranchTableTickets(branchTickets, index)
  const directory = new Map()
  const includeFallbackTickets = options?.includeFallbackTickets !== false
  const includeCurrentFallback = options?.includeCurrentFallback !== false

  layoutTables.forEach(table => {
    if (!table?.tableKey) return
    directory.set(table.tableKey, {
      tableKey: table.tableKey,
      masaNo: normalizeMasaNo(table?.masaNo || table?.label),
      label: table?.label || `Masa ${normalizeMasaNo(table?.masaNo || table?.label)}`,
      floorName: table?.floorName || '',
    })
  })

  if (includeFallbackTickets) {
    Object.keys(normalizedBranchTickets).forEach(ticketKey => {
      if (directory.has(ticketKey)) return
      const fallbackTable = resolveTableRecord(ticketKey, index)
      directory.set(fallbackTable.tableKey, fallbackTable)
    })
  }

  if (includeCurrentFallback && currentTableKey) {
    const fallbackTable = resolveTableRecord(currentTableKey, index)
    if (fallbackTable.tableKey && !directory.has(fallbackTable.tableKey)) {
      directory.set(fallbackTable.tableKey, fallbackTable)
    }
  }

  return Array.from(directory.values())
    .map(table => {
      const ticket = normalizedBranchTickets[table.tableKey]
      return {
        ...table,
        occupied: hasOpenTicketLikeContent(ticket),
        ownerName: typeof ticket?.ownerName === 'string' ? ticket.ownerName : '',
      }
    })
    .sort((left, right) => {
      const floorComparison = String(left.floorName || '').localeCompare(String(right.floorName || ''), 'tr')
      if (floorComparison !== 0) return floorComparison

      const leftNum = parseInt(left.masaNo, 10)
      const rightNum = parseInt(right.masaNo, 10)
      if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) {
        return leftNum - rightNum
      }

      return String(left.label || left.masaNo).localeCompare(String(right.label || right.masaNo), 'tr')
    })
}
