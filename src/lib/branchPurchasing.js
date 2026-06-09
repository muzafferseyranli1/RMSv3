export const POS_BRANCH_KEY = 'suitable_pos_branch_id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const ORDER_TAB_DEFS = [
  { key: 'pending', label: 'Islem Bekleniyor', statuses: ['pending_action', 'draft'] },
  { key: 'approval', label: 'Onay Bekleniyor', statuses: ['awaiting_approval'] },
  { key: 'submitted', label: 'Siparis Verildi', statuses: ['submitted', 'partially_received', 'received'] },
]

export const ORDER_STATUS_META = {
  draft: { label: 'Taslak', color: '#64748b', bg: '#f1f5f9' },
  pending_action: { label: 'Islem Bekleniyor', color: '#0f766e', bg: '#ccfbf1' },
  awaiting_approval: { label: 'Onay Bekleniyor', color: '#92400e', bg: '#fef3c7' },
  submitted: { label: 'Siparis Verildi', color: '#1d4ed8', bg: '#dbeafe' },
  partially_received: { label: 'Kismi Kabul', color: '#7c2d12', bg: '#fed7aa' },
  received: { label: 'Kabul Tamam', color: '#166534', bg: '#dcfce7' },
  cancelled: { label: 'Iptal', color: '#b91c1c', bg: '#fee2e2' },
}

export const DOC_KIND_OPTIONS = [
  { value: 'irsaliye', label: 'Irsaliye' },
  { value: 'irsaliyeli_fatura', label: 'Irsaliyeli Fatura' },
  { value: 'belgesiz', label: 'Belgesiz' },
]

export const DAY_NAMES = ['Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi', 'Pazar']
const DAY_ALIASES = {
  pazartesi: 'Pazartesi',
  sali: 'Sali',
  'sali ': 'Sali',
  salı: 'Sali',
  carsamba: 'Carsamba',
  çarsamba: 'Carsamba',
  çarşamba: 'Carsamba',
  persembe: 'Persembe',
  perşembe: 'Persembe',
  cuma: 'Cuma',
  cumartesi: 'Cumartesi',
  pazar: 'Pazar',
}

export function parseJsonValue(value, fallback = []) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

export function asUuidOrNull(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return UUID_PATTERN.test(text) ? text : null
}

function normalizeBranchName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
}

function escapePostgrestValue(value) {
  return `"${String(value || '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function getStoredBranchId() {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(POS_BRANCH_KEY) || ''
  } catch {
    return ''
  }
}

export function getAllBranches(treeValue) {
  const tree = parseJsonValue(treeValue, [])
  const result = []
  function walk(nodes) {
    for (const node of nodes || []) {
      if (node?.type === 'sube' || node?.type === 'anadepo' || node?.type === 'mutfak' || node?.type === 'uretim') {
        result.push({ id: node.id, name: node.name, type: node.type })
      }
      walk(node?.children || [])
    }
  }
  walk(Array.isArray(tree) ? tree : [tree])
  return result
}

export function findBranchById(branches, branchId) {
  const target = String(branchId || '').trim()
  if (!target) return null
  return (branches || []).find(branch => String(branch?.id || '').trim() === target) || null
}

export function branchMatchesRecord(record, branch) {
  if (!record || !branch) return false

  const recordBranchId = String(record?.branch_id || '').trim()
  const branchId = String(branch?.id || branch?.branchId || '').trim()
  if (recordBranchId && branchId && recordBranchId === branchId) return true

  const recordUuid = asUuidOrNull(record?.branch_id)
  const branchUuid = asUuidOrNull(branchId)
  if (recordUuid && branchUuid && recordUuid === branchUuid) return true

  const recordName = normalizeBranchName(record?.branch_name)
  const branchName = normalizeBranchName(branch?.name || branch?.branchName)
  return !!recordName && !!branchName && recordName === branchName
}

export function applyBranchFilter(query, branch) {
  const branchId = String(branch?.id || branch?.branchId || '').trim()
  const branchName = String(branch?.name || branch?.branchName || '').trim()
  const branchUuid = asUuidOrNull(branchId)
  if (branchUuid && branchName) {
    return query.or(`branch_id.eq.${escapePostgrestValue(branchUuid)},branch_name.eq.${escapePostgrestValue(branchName)}`)
  }
  if (branchUuid) return query.eq('branch_id', branchUuid)
  if (branchName) return query.eq('branch_name', branchName)

  return query
}

export function buildInventoryBalanceRows(movementRows) {
  // 1. Group movements by stock_item_id to calculate aggregates
  const aggregates = new Map()

  for (const row of movementRows || []) {
    const stockItemId = row?.stock_item_id
    if (!stockItemId) continue

    const qty = Number(row.quantity || 0)
    const direction = row.direction || 'in'
    const signedQty = direction === 'in' ? qty : -qty

    const meta = typeof row.meta === 'string' ? parseJsonValue(row.meta, {}) : (row.meta || {})
    const status = meta.availability_status || 'available'

    if (!aggregates.has(stockItemId)) {
      aggregates.set(stockItemId, {
        quarantine: 0,
        putaway_pending: 0,
      })
    }

    const agg = aggregates.get(stockItemId)
    if (status === 'quarantine') {
      agg.quarantine += signedQty
    } else if (status === 'putaway_pending') {
      agg.putaway_pending += signedQty
    }
  }

  // 2. Build rows using the latest movement row for WAC/total balance
  const rows = []
  const seen = new Set()

  for (const row of movementRows || []) {
    const stockItemId = row?.stock_item_id
    if (!stockItemId || seen.has(stockItemId)) continue
    seen.add(stockItemId)

    const agg = aggregates.get(stockItemId) || { quarantine: 0, putaway_pending: 0 }
    const totalQty = Number(row?.balance_qty_after || 0)
    // Available (usable) stock = total physical stock minus quarantine and putaway pending
    const availableQty = Math.max(totalQty - agg.quarantine - agg.putaway_pending, 0)

    rows.push({
      stock_item_id: stockItemId,
      branch_id: row?.branch_id || null,
      branch_name: row?.branch_name || null,
      balance_qty_after: totalQty, // Keep balance_qty_after as total physical stock for ledger/cost calculations
      balance_total_cost_after: Number(row?.balance_total_cost_after || 0),
      avg_unit_cost_after: Number(row?.avg_unit_cost_after || 0),
      last_movement_at: row?.movement_at || null,
      available_qty: availableQty, // Available/usable stock
      quarantine_qty: agg.quarantine,
      putaway_pending_qty: agg.putaway_pending,
    })
  }

  return rows
}

export function getCompanyDefaults(treeValue, taxes = []) {
  const tree = parseJsonValue(treeValue, [])
  let companyNode = null

  function walk(nodes) {
    for (const node of nodes || []) {
      if (!companyNode && node?.type === 'sirket') companyNode = node
      walk(node?.children || [])
    }
  }
  walk(Array.isArray(tree) ? tree : [tree])

  const purchaseTaxId = companyNode?.purchaseTax || ''
  const purchaseTax = taxes.find(tax => tax.id === purchaseTaxId)

  return {
    decimalPlaces: Number(companyNode?.decimalPlaces) || 2,
    purchaseVatRate: Number(purchaseTax?.rate) > 0 ? Number(purchaseTax.rate) / 100 : 0.1,
  }
}

export function resolveSelectionIds(selectionsValue) {
  const parsed = parseJsonValue(selectionsValue, [])
  const selections = Array.isArray(parsed) ? parsed : []
  const ids = new Set()
  for (const row of selections) {
    if (row?.type === 'branch' && row.id) ids.add(row.id)
    if (row?.type === 'template') {
      const branchIds = Array.isArray(row.branchIds) ? row.branchIds : []
      for (const id of branchIds) {
        if (id) ids.add(id)
      }
    }
  }
  return Array.from(ids)
}

export function isBranchIncluded(selectionsValue, branchId) {
  if (!branchId) return false
  return resolveSelectionIds(selectionsValue).includes(branchId)
}

export function normalizeDayName(value) {
  if (!value) return ''
  return DAY_ALIASES[String(value).trim().toLowerCase()] || String(value).trim()
}

function dateOnly(dateLike) {
  if (!dateLike) return ''
  if (typeof dateLike === 'string') {
    if (dateLike.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) {
      return dateLike
    }
  }
  const copy = new Date(dateLike)
  if (Number.isNaN(copy.getTime())) return ''
  const year = copy.getFullYear()
  const month = String(copy.getMonth() + 1).padStart(2, '0')
  const day = String(copy.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayStr() {
  return dateOnly(new Date())
}

export function addDays(dateValue, amount) {
  const base = new Date(`${dateOnly(dateValue)}T00:00:00`)
  base.setDate(base.getDate() + Number(amount || 0))
  return dateOnly(base)
}

export function diffDays(fromDate, toDate) {
  const from = new Date(`${dateOnly(fromDate)}T00:00:00`)
  const to = new Date(`${dateOnly(toDate)}T00:00:00`)
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / 86400000)
}

export function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function formatDate(dateValue) {
  const safe = dateOnly(dateValue)
  if (!safe) return '—'
  return new Date(`${safe}T00:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatTime(timeValue) {
  if (!timeValue) return '—'
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(String(timeValue))) return String(timeValue).slice(0, 5)
  const asDate = new Date(timeValue)
  if (Number.isNaN(asDate.getTime())) return String(timeValue)
  return asDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export function formatQty(value) {
  const num = Number(value || 0)
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}

export function formatMoney(value, fractionDigits = 2) {
  const num = Number(value || 0)
  return num.toLocaleString('tr-TR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: Math.max(fractionDigits, 4),
  })
}

export function formatDateTime(dateValue, timeValue = '') {
  const dateText = formatDate(dateValue)
  if (!timeValue || timeValue === '—') return dateText
  return `${dateText} ${formatTime(timeValue)}`
}

function dayIndex(dateValue) {
  const date = new Date(`${dateOnly(dateValue)}T00:00:00`)
  return (date.getDay() + 6) % 7
}

export function dayNameForDate(dateValue) {
  return DAY_NAMES[dayIndex(dateValue)] || ''
}

export function isFlowDueOnDate(flow, dateValue) {
  if (!flow?.active) return false
  if (flow.flow_type !== 'otomatik') return false
  if (flow.no_calendar) return false

  const safeDate = dateOnly(dateValue)
  const frequency = flow.siparis_sikligi || 'haftalik'

  if (frequency === 'gunluk') return true

  if (frequency === 'haftalik') {
    const selectedDays = parseJsonValue(flow.order_days, []).map(normalizeDayName)
    return selectedDays.includes(dayNameForDate(safeDate))
  }

  if (frequency === 'aylik') {
    const monthlyMode = flow.aylik_mod || 'gun'
    const date = new Date(`${safeDate}T00:00:00`)
    if (monthlyMode === 'gun') {
      const selected = parseJsonValue(flow.aylik_gunler, []).map(v => Number(v))
      return selected.includes(date.getDate())
    }

    const weekDay = normalizeDayName(flow.aylik_haftagun_gun)
    const orderIndex = ['1.', '2.', '3.', '4.', 'Son'].includes(flow.aylik_haftagun_sira) ? flow.aylik_haftagun_sira : ''
    if (!weekDay || !orderIndex) return false

    const sameDays = []
    const cursor = new Date(date.getFullYear(), date.getMonth(), 1)
    while (cursor.getMonth() === date.getMonth()) {
      if (dayNameForDate(cursor) === weekDay) sameDays.push(dateOnly(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }
    if (!sameDays.length) return false
    const expected = orderIndex === 'Son'
      ? sameDays[sameDays.length - 1]
      : sameDays[Math.max(Number(orderIndex.replace('.', '')) - 1, 0)]
    return expected === safeDate
  }

  return false
}

export function getNextScheduledDate(flow, afterDate, maxDays = 62) {
  const start = dateOnly(afterDate)
  for (let offset = 1; offset <= maxDays; offset += 1) {
    const candidate = addDays(start, offset)
    if (isFlowDueOnDate(flow, candidate)) return candidate
  }
  return ''
}

export function getDeliveryDate(flow, orderDate) {
  return addDays(orderDate, Number(flow?.lead_days || 0))
}

export function getFlowDates(flow, orderDate) {
  const safeOrderDate = dateOnly(orderDate)
  const deliveryDate = getDeliveryDate(flow, safeOrderDate)
  const nextOrderDate = getNextScheduledDate(flow, safeOrderDate)
  const nextDeliveryDate = nextOrderDate ? getDeliveryDate(flow, nextOrderDate) : ''
  return {
    orderDate: safeOrderDate,
    deliveryDate,
    deliveryTime: String(flow?.delivery_hour || '').slice(0, 5),
    nextOrderDate,
    nextDeliveryDate,
    cutoffTime: String(flow?.cutoff_hour || '').slice(0, 5),
  }
}

export function computeCoverageDays(flow, orderDate) {
  const { deliveryDate, nextDeliveryDate } = getFlowDates(flow, orderDate)
  if (!deliveryDate || !nextDeliveryDate) return Math.max(Number(flow?.lead_days || 1), 1)
  return Math.max(diffDays(deliveryDate, nextDeliveryDate), 1)
}

function collectSameWeekdayRows(dailySalesRows, targetDate, lookbackWeeks) {
  const maxLookbackDays = Math.max(Number(lookbackWeeks || 0), 1) * 7
  const minDate = addDays(targetDate, -(maxLookbackDays + 1))
  const targetDay = dayNameForDate(targetDate)

  return (dailySalesRows || [])
    .filter(row => {
      const saleDate = dateOnly(row?.sale_date)
      if (!saleDate) return false
      return saleDate < targetDate && saleDate >= minDate && dayNameForDate(saleDate) === targetDay
    })
    .sort((left, right) => String(left.sale_date || '').localeCompare(String(right.sale_date || '')))
}

function computeWeightedReceiptBaseline(samples) {
  if (!samples.length) return null

  let weightedTotal = 0
  let weightTotal = 0

  for (let index = 0; index < samples.length; index += 1) {
    const receipts = safeNumber(samples[index]?.receipt_count, null)
    if (receipts == null) continue
    const weight = index + 1
    weightedTotal += receipts * weight
    weightTotal += weight
  }

  return weightTotal > 0 ? weightedTotal / weightTotal : null
}

export function buildForecastCoverageSummary({
  dailySalesRows,
  savedForecastRows,
  coverageStartDate,
  coverageDays,
  lookbackWeeks = 6,
}) {
  const totalCoverageDays = Math.max(Number(coverageDays || 0), 0)
  const startDate = dateOnly(coverageStartDate)
  if (!startDate || totalCoverageDays <= 0) {
    return {
      forecastRatio: 1,
      baselineReceipts: 0,
      forecastReceipts: 0,
      coverageDays: totalCoverageDays,
      forecastDaysUsed: 0,
      sourceLabel: 'Stok karti ortalamasi',
      applied: false,
    }
  }

  const forecastMap = new Map(
    (savedForecastRows || [])
      .filter(row => row?.forecast_date)
      .map(row => [dateOnly(row.forecast_date), row]),
  )

  let baselineReceipts = 0
  let forecastReceipts = 0
  let baselineDaysUsed = 0
  let forecastDaysUsed = 0

  for (let offset = 0; offset < totalCoverageDays; offset += 1) {
    const targetDate = addDays(startDate, offset)
    const baseline = computeWeightedReceiptBaseline(
      collectSameWeekdayRows(dailySalesRows, targetDate, lookbackWeeks),
    )
    const saved = forecastMap.get(targetDate)
    const effectiveForecast = saved?.adj_receipt_count != null
      ? safeNumber(saved.adj_receipt_count, null)
      : saved?.calc_receipt_count != null
        ? safeNumber(saved.calc_receipt_count, null)
        : baseline

    if (baseline != null && baseline > 0) {
      baselineReceipts += baseline
      baselineDaysUsed += 1
    }
    if (effectiveForecast != null && effectiveForecast >= 0) {
      forecastReceipts += effectiveForecast
      if (saved?.adj_receipt_count != null || saved?.calc_receipt_count != null) {
        forecastDaysUsed += 1
      }
    } else if (baseline != null && baseline >= 0) {
      forecastReceipts += baseline
    }
  }

  const rawRatio = baselineReceipts > 0 ? forecastReceipts / baselineReceipts : 1
  const forecastRatio = clamp(rawRatio || 1, 0.35, 3)
  const applied = baselineDaysUsed > 0 && Math.abs(forecastRatio - 1) >= 0.03

  return {
    forecastRatio,
    baselineReceipts,
    forecastReceipts,
    coverageDays: totalCoverageDays,
    forecastDaysUsed,
    sourceLabel: forecastDaysUsed > 0
      ? 'Kayitli fis tahmini'
      : baselineDaysUsed > 0
        ? 'Ayni gun gecmis ortalamasi'
        : 'Stok karti ortalamasi',
    applied,
  }
}

function parseSupplierLinks(item) {
  return parseJsonValue(item?.suppliers_list, []).filter(Boolean)
}

export function stockItemMatchesSupplier(item, supplierId) {
  if (!item || !supplierId) return false
  if (item.supp_id === supplierId) return true
  return parseSupplierLinks(item).some(link => link?.supp_id === supplierId)
}

export function resolveFlowItems(flow, stockItems, stockTemplates, contracts) {
  if (!flow) return []
  const supplierItems = (stockItems || []).filter(item => stockItemMatchesSupplier(item, flow.supplier_id))
  const flowType = flow.urun_tipi || 'all'

  if (flowType === 'sec') {
    const selectedIds = new Set(parseJsonValue(flow.selected_stocks, []).filter(Boolean))
    return supplierItems.filter(item => selectedIds.has(item.id))
  }

  if (flowType === 'sablon') {
    const template = (stockTemplates || []).find(row => row.id === flow.stock_template_id)
    const stockIds = new Set(parseJsonValue(template?.stock_ids, []).filter(Boolean))
    return supplierItems.filter(item => stockIds.has(item.id))
  }

  if (flowType === 'kontrat') {
    const onContract = new Set()
    for (const contract of contracts || []) {
      if (contract?.supplier_id !== flow.supplier_id) continue
      for (const row of parseJsonValue(contract?.rows, [])) {
        if (row?.stock_item_id) onContract.add(row.stock_item_id)
      }
    }
    return supplierItems.filter(item => onContract.has(item.id))
  }

  return supplierItems
}

export function getOrderUnitFactor(item) {
  if (!item || !item.order_unit || item.order_unit === 'ana') return 1
  const units = parseJsonValue(item.packaging_units, [])
  const row = units.find(unit => unit?.unit === item.order_unit)
  const factor = Number(row?.qty || 0)
  return factor > 0 ? factor : 1
}

export function getOrderConstraints(item) {
  const factor = getOrderUnitFactor(item)
  const minOrderUnits = Number(item?.min_order || 0)
  const maxOrderUnits = Number(item?.max_order || 0)
  return {
    factor,
    minBaseQty: minOrderUnits > 0 ? minOrderUnits * factor : 0,
    maxBaseQty: maxOrderUnits > 0 ? maxOrderUnits * factor : 0,
  }
}

export function roundOrderQuantity(item, rawQty, flow) {
  const qty = Number(rawQty || 0)
  if (qty <= 0) return 0

  const { factor, minBaseQty } = getOrderConstraints(item)
  let rounded = qty

  if (flow?.round_box_qty && factor > 1) {
    const threshold = Number(flow.round_box_threshold || 0.25)
    const packageCount = qty / factor
    const whole = Math.floor(packageCount)
    const fraction = packageCount - whole
    const nextPackages = whole + (fraction >= threshold ? 1 : 0)
    rounded = Math.max(nextPackages, 1) * factor
  }

  if (flow?.round_min_qty && minBaseQty > 0) {
    if (factor > 1) {
      const minimumPackages = Math.ceil(minBaseQty / factor)
      const currentPackages = Math.ceil(rounded / factor)
      rounded = Math.max(currentPackages, minimumPackages) * factor
    } else {
      rounded = Math.max(rounded, minBaseQty)
    }
  }

  if (factor <= 1) return Math.ceil(rounded)
  return Number(rounded.toFixed(4))
}

export function getOrderWarnings(item, orderedQty) {
  const qty = Number(orderedQty || 0)
  const warnings = []
  const { minBaseQty, maxBaseQty } = getOrderConstraints(item)

  if (qty > 0 && minBaseQty > 0 && qty < minBaseQty) {
    warnings.push(`Min siparis seviyesi ${formatQty(minBaseQty)} ${item?.unit || ''}`)
  }
  if (qty > 0 && maxBaseQty > 0 && qty > maxBaseQty) {
    warnings.push(`Max siparis seviyesi ${formatQty(maxBaseQty)} ${item?.unit || ''}`)
  }
  return warnings
}

export function buildBalanceMap(balanceRows) {
  const map = new Map()
  for (const row of balanceRows || []) {
    if (row?.stock_item_id) map.set(row.stock_item_id, row)
  }
  return map
}

export function buildLatestPurchasePriceMap(movementRows, preferredBranchId = '') {
  const map = new Map()
  const ordered = [...(movementRows || [])].sort((a, b) => {
    const branchBoostA = a?.branch_id === preferredBranchId ? 1 : 0
    const branchBoostB = b?.branch_id === preferredBranchId ? 1 : 0
    if (branchBoostA !== branchBoostB) return branchBoostB - branchBoostA
    return String(b?.movement_at || '').localeCompare(String(a?.movement_at || ''))
  })
  for (const row of ordered) {
    if (row?.stock_item_id && !map.has(row.stock_item_id)) {
      map.set(row.stock_item_id, Number(row.unit_cost || 0))
    }
  }
  return map
}

function isContractActive(contract, dateValue) {
  const safeDate = dateOnly(dateValue)
  if (!safeDate) return false
  if (contract?.start_date && safeDate < dateOnly(contract.start_date)) return false
  if (contract?.end_date && safeDate > dateOnly(contract.end_date)) return false
  return !contract?.deleted_at
}

export function buildContractPriceMap(contracts, supplierId, branchId, dateValue) {
  const map = new Map()
  for (const contract of contracts || []) {
    if (contract?.supplier_id !== supplierId) continue
    if (!isContractActive(contract, dateValue)) continue
    const branches = resolveSelectionIds(contract?.branches)
    if (branches.length > 0 && branchId && !branches.includes(branchId)) continue

    for (const row of parseJsonValue(contract?.rows, [])) {
      if (!row?.stock_item_id || map.has(row.stock_item_id)) continue
      map.set(row.stock_item_id, {
        contractId: contract.id,
        contractNo: contract.contract_no || '',
        price: Number(row.price || 0),
        qty: Number(row.qty || 0),
      })
    }
  }
  return map
}

export function computeSuggestedQuantity({
  item,
  flow,
  currentQty,
  coverageDays,
  lastOrderQty,
  forecastRatio = 1,
}) {
  const stockTarget = Number(item?.reorder || item?.max_stock || item?.min_stock || 0)
  const completionTarget = Number(item?.reorder || 0)
  const dailyUsage = Number(item?.daily_usage || 0)
  const effectiveForecastRatio = flow?.qty_mode === 'tahmin'
    ? clamp(safeNumber(forecastRatio, 1), 0.35, 3)
    : 1
  const adjustedDailyUsage = dailyUsage * effectiveForecastRatio
  const defaultNeedQty = adjustedDailyUsage > 0 ? adjustedDailyUsage * Math.max(Number(coverageDays || 1), 1) : 0
  const repeatedQty = Math.max(Number(lastOrderQty || 0), 0)
  const stockGapQty = Math.max(completionTarget - Number(currentQty || 0), 0)
  let needQty = defaultNeedQty
  let suggestedQty = 0

  switch (flow?.qty_mode) {
    case 'son':
      needQty = repeatedQty
      suggestedQty = repeatedQty
      break
    case 'manuel':
      suggestedQty = 0
      break
    case 'stok':
      needQty = stockGapQty
      suggestedQty = stockGapQty
      break
    case 'tahmin':
    default:
      if (stockTarget > 0) suggestedQty = Math.max(stockTarget - Number(currentQty || 0), 0)
      else suggestedQty = Math.max(needQty - Number(currentQty || 0), 0)
      break
  }

  const roundedSuggestedQty = roundOrderQuantity(item, suggestedQty, flow)

  return {
    calculatedNeed: Number(needQty.toFixed(4)),
    suggestedQty: Number(roundedSuggestedQty.toFixed(4)),
    forecastRatio: effectiveForecastRatio,
  }
}

export function describeCutoffBehavior(flow) {
  if (flow?.auto_send) return 'Siparis otomatik iletilecek'
  if (flow?.auto_cancel) return 'Siparis otomatik iptal edilecek'
  return 'Manuel islem beklenecek'
}

export function nextDocumentNo(prefix, dateValue, existingNumbers = []) {
  const safeDate = dateOnly(dateValue || todayStr()).replaceAll('-', '')
  const base = `${prefix}-${safeDate}-`
  const next = existingNumbers
    .filter(number => String(number || '').startsWith(base))
    .map(number => Number(String(number).slice(base.length)) || 0)
    .reduce((max, value) => Math.max(max, value), 0) + 1
  return `${base}${String(next).padStart(3, '0')}`
}

export function safeDocNo(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
}

export function summarizeLines(lines, vatRate = 0.1) {
  return (lines || []).reduce((acc, line) => {
    const qty = Number(line?.ordered_qty ?? line?.received_qty ?? 0)
    const lineTotal = Number(line?.line_total || (qty * Number(line?.unit_price || 0)))
    const lineVatTotal = Number(line?.line_total_vat_inc || (lineTotal * (1 + Number(line?.vat_rate ?? vatRate))))
    acc.totalQty += qty
    acc.subtotal += lineTotal
    acc.totalVatIncluded += lineVatTotal
    return acc
  }, { totalQty: 0, subtotal: 0, totalVatIncluded: 0 })
}

export function resolveLineSupplierId(item, flowSupplierId, allSuppliers = []) {
  if (!item) return flowSupplierId
  const list = parseJsonValue(item.suppliers_list, [])

  // 1. Eşleşen akış tedarikçisi ürünün tedarikçi listesinde (suppliers_list) varsa en öncelikli olarak seçilir
  if (flowSupplierId && list.some(s => String(s.supp_id).toLowerCase() === String(flowSupplierId).toLowerCase())) {
    if (allSuppliers.some(s => String(s.id).toLowerCase() === String(flowSupplierId).toLowerCase())) {
      return flowSupplierId
    }
  }

  // 2. default tedarikçi
  const def = list.find(s => s.is_default || s.is_default === true)?.supp_id
  if (def && allSuppliers.some(s => String(s.id).toLowerCase() === String(def).toLowerCase())) return def

  // 3. stok kartındaki birincil supp_id
  if (item.supp_id && allSuppliers.some(s => String(s.id).toLowerCase() === String(item.supp_id).toLowerCase())) return item.supp_id

  // 4. listedeki ilk geçerli aktif tedarikçi
  const firstValid = list.find(s => allSuppliers.some(x => String(x.id).toLowerCase() === String(s.supp_id).toLowerCase()))?.supp_id
  if (firstValid) return firstValid

  return item.supp_id || flowSupplierId
}


