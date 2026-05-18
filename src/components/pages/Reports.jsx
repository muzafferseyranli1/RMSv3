import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { asUuidOrNull, getAllBranches, parseJsonValue } from '@/lib/branchPurchasing'

const PAGE_SIZE = 1000
const INVENTORY_LOOKBACK_DAYS = 30
const INVENTORY_RPC_LIMIT = 1000

const TAB_OPTIONS = [
  { key: 'overview', label: 'Özet Rapor', icon: 'fa-gauge-high' },
  { key: 'sales', label: 'Satış Raporu', icon: 'fa-chart-line' },
  { key: 'product_mix', label: 'Satış malı karması', icon: 'fa-layer-group' },
  { key: 'inventory', label: 'Depo Raporu', icon: 'fa-box-open' },
  { key: 'advanced', label: 'Gelişmiş Rapor', icon: 'fa-table-list' },
]

const DATE_PRESETS = [
  { key: 'today', label: 'Bugün' },
  { key: 'yesterday', label: 'Dün' },
  { key: 'last7', label: 'Son 7 Gün' },
  { key: 'last30', label: 'Son 30 Gün' },
]

const EMPTY_TAB_STATE = {
  signature: '',
  loading: false,
  error: '',
  data: null,
}

function todayIso() {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(dateStr, amount) {
  const value = new Date(`${dateStr}T00:00:00`)
  value.setDate(value.getDate() + Number(amount || 0))
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createDateRange(presetKey) {
  const today = todayIso()
  if (presetKey === 'yesterday') {
    const yesterday = addDays(today, -1)
    return { dateFrom: yesterday, dateTo: yesterday }
  }
  if (presetKey === 'last7') {
    return { dateFrom: addDays(today, -6), dateTo: today }
  }
  if (presetKey === 'last30') {
    return { dateFrom: addDays(today, -29), dateTo: today }
  }
  return { dateFrom: today, dateTo: today }
}

function startOfDay(dateStr) {
  return `${dateStr}T00:00:00`
}

function endOfDay(dateStr) {
  return `${dateStr}T23:59:59`
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMoney(value, digits = 2) {
  const number = Number(value || 0)
  return number.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatNumber(value, digits = 0) {
  const number = Number(value || 0)
  return number.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function parseOptionsSummary(value, fallbackSummary = '') {
  const summary = String(fallbackSummary || '').trim()
  if (summary) return summary
  const parsed = Array.isArray(value) ? value : parseJsonValue(value, [])
  if (!Array.isArray(parsed)) return ''
  return parsed
    .map(option => {
      if (typeof option === 'string') return option.trim()
      return String(option?.name || option?.label || '').trim()
    })
    .filter(Boolean)
    .join(' + ')
}

function toDateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function sortByValueDesc(rows, key) {
  return [...rows].sort((left, right) => safeNumber(right?.[key]) - safeNumber(left?.[key]))
}

async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

function parseBranchIds(template) {
  const branchIds = Array.isArray(template?.branch_ids)
    ? template.branch_ids
    : parseJsonValue(template?.branch_ids, [])
  return Array.isArray(branchIds) ? branchIds : []
}

function applyBranchNameFilter(query, branchNames) {
  if (!branchNames?.length) return query
  if (branchNames.length === 1) return query.eq('branch_name', branchNames[0])
  return query.in('branch_name', branchNames)
}

function groupRows(rows, keyGetter, reducer, seedFactory = () => ({})) {
  const map = new Map()

  for (const row of rows || []) {
    const key = keyGetter(row)
    if (!key) continue
    const current = map.get(key) || seedFactory(row, key)
    reducer(current, row, key)
    map.set(key, current)
  }

  return [...map.values()]
}

function buildSelection({
  scopeVariant,
  branches,
  branchTemplates,
  branchMode,
  branchId,
  templateId,
  workspaceBranchId,
}) {
  if (!branches.length) {
    return {
      key: `${scopeVariant}:empty`,
      kind: scopeVariant === 'branch' ? 'branch' : branchMode,
      label: 'Şube bulunamadı',
      branches: [],
      branchNames: [],
    }
  }

  if (scopeVariant === 'branch') {
    const selected = branches.find(branch => branch.id === (workspaceBranchId || branchId)) || branches[0]
    return {
      key: `branch:${selected.id}`,
      kind: 'branch',
      label: selected.name,
      branches: selected ? [selected] : [],
      branchNames: selected ? [selected.name] : [],
    }
  }

  if (branchMode === 'template') {
    const selectedTemplate = branchTemplates.find(template => template.id === templateId) || null
    const branchIds = parseBranchIds(selectedTemplate)
    const selectedBranches = branches.filter(branch => branchIds.includes(branch.id))
    return {
      key: `template:${selectedTemplate?.id || 'none'}`,
      kind: 'template',
      label: selectedTemplate ? `${selectedTemplate.name} (${selectedBranches.length} Şube)` : 'Şablon seçin',
      branches: selectedBranches,
      branchNames: selectedBranches.map(branch => branch.name),
    }
  }

  if (branchMode === 'branch') {
    const selectedBranch = branches.find(branch => branch.id === branchId) || branches[0]
    return {
      key: `center-branch:${selectedBranch.id}`,
      kind: 'branch',
      label: selectedBranch.name,
      branches: selectedBranch ? [selectedBranch] : [],
      branchNames: selectedBranch ? [selectedBranch.name] : [],
    }
  }

  return {
    key: 'center:all',
    kind: 'all',
    label: `Tüm Şubeler (${branches.length})`,
    branches,
    branchNames: branches.map(branch => branch.name),
  }
}

async function fetchSalesRows({ branchNames, dateFrom, dateTo }) {
  return fetchAllRows((from, to) => {
    let query = db
      .from('sales')
      .select([
        'id',
        'sale_datetime',
        'branch_name',
        'sales_channel_name',
        'payment_total',
        'gross_total_after_discount',
        'net_total_after_discount',
        'discount_amount',
        'status',
        'cost_total',
        'cashier_name',
        'customer_name',
      ].join(','))
      .gte('sale_datetime', startOfDay(dateFrom))
      .lte('sale_datetime', endOfDay(dateTo))
      .order('sale_datetime', { ascending: true })
      .range(from, to)

    query = applyBranchNameFilter(query, branchNames)
    return query
  })
}

async function fetchSaleLineRows({ branchNames, dateFrom, dateTo }) {
  return fetchAllRows((from, to) => {
    let query = db
      .from('sale_lines')
      .select([
        'sale_id',
        'sale_datetime',
        'branch_name',
        'sales_channel_name',
        'top_category_name',
        'sub_category_name',
        'product_name',
        'product_sku',
        'portion_name',
        'options_json',
        'options_summary',
        'qty',
        'unit_gross_before_discount',
        'line_gross_before_discount',
        'discount_allocated_amount',
        'line_gross_after_discount',
        'line_net_after_discount',
        'unit_cost_snapshot',
        'line_cost_total',
      ].join(','))
      .gte('sale_datetime', startOfDay(dateFrom))
      .lte('sale_datetime', endOfDay(dateTo))
      .order('sale_datetime', { ascending: true })
      .range(from, to)

    query = applyBranchNameFilter(query, branchNames)
    return query
  })
}

async function fetchPaymentRows({ dateFrom, dateTo }) {
  return fetchAllRows((from, to) => (
    db
      .from('sale_payments')
      .select('sale_id,payment_method,payment_method_label,amount,payment_datetime')
      .gte('payment_datetime', startOfDay(dateFrom))
      .lte('payment_datetime', endOfDay(dateTo))
      .order('payment_datetime', { ascending: true })
      .range(from, to)
  ))
}

async function fetchInventoryRows({ branches, dateFrom, dateTo }) {
  const lookbackFrom = addDays(dateFrom, -INVENTORY_LOOKBACK_DAYS)
  const scopedBranches = Array.isArray(branches) ? branches : []
  const results = []

  for (let index = 0; index < scopedBranches.length; index += 4) {
    const batch = scopedBranches.slice(index, index + 4)
    const batchResults = await Promise.all(batch.map(async branch => {
      const params = {
        p_branch_uuid: asUuidOrNull(branch?.id),
        p_branch_name: String(branch?.name || '').trim() || null,
        p_date_from: startOfDay(lookbackFrom),
        p_date_to: endOfDay(dateTo),
        p_limit: INVENTORY_RPC_LIMIT,
        p_branch_key: String(branch?.id || '').trim() || null,
      }

      const { data, error } = await db.rpc('get_inventory_movements_window', params)
      if (error) {
        if (error.code === 'PGRST202') {
          throw new Error('Stok hareketleri RPC fonksiyonu eksik. `inventory-movements-window-rpc.sql` dosyasini calistirin.')
        }
        throw error
      }

      return {
        branchName: branch?.name || 'Şube',
        truncated: (data || []).length >= INVENTORY_RPC_LIMIT,
        rows: (data || []).map(row => ({
          ...row,
          stock_item_id: row.item_type === 'stock_item' ? row.item_sku || row.item_name || row.id : null,
          semi_item_id: row.item_type === 'semi_item' ? row.item_sku || row.item_name || row.id : null,
          balance_total_cost_after: safeNumber(row.balance_qty_after) * safeNumber(row.avg_unit_cost_after),
        })),
      }
    }))
    results.push(...batchResults)
  }

  return {
    rows: results.flatMap(result => result.rows),
    truncatedBranches: results.filter(result => result.truncated).map(result => result.branchName),
  }
}

function buildOverviewData(selection, salesRows, lineRows, dateFrom, dateTo) {
  const completedSales = salesRows.filter(row => row.status === 'completed')
  const refundRows = salesRows.filter(row => ['refunded', 'partially_refunded', 'cancelled'].includes(row.status))
  const totalSales = completedSales.reduce((sum, row) => sum + safeNumber(row.payment_total), 0)
  const totalReceipts = completedSales.length
  const avgTicket = totalReceipts ? totalSales / totalReceipts : 0
  const totalDiscount = completedSales.reduce((sum, row) => sum + safeNumber(row.discount_amount), 0)
  const totalVat = completedSales.reduce((sum, row) => (
    sum + safeNumber(row.gross_total_after_discount) - safeNumber(row.net_total_after_discount)
  ), 0)
  const totalCost = completedSales.reduce((sum, row) => sum + safeNumber(row.cost_total), 0)

  const dailyRows = sortByValueDesc(
    groupRows(
      completedSales,
      row => toDateOnly(row.sale_datetime),
      (current, row) => {
        current.date = toDateOnly(row.sale_datetime)
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      (_, key) => ({ date: key, sales: 0, receipts: 0 }),
    ),
    'date',
  ).reverse().map(row => ({
    ...row,
    avgTicket: row.receipts ? row.sales / row.receipts : 0,
  }))

  const branchRows = sortByValueDesc(
    groupRows(
      completedSales,
      row => row.branch_name || 'Şube yok',
      (current, row, key) => {
        current.branchName = key
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      () => ({ branchName: '', sales: 0, receipts: 0 }),
    ),
    'sales',
  )

  const channelRows = sortByValueDesc(
    groupRows(
      completedSales,
      row => row.sales_channel_name || 'Diğer',
      (current, row, key) => {
        current.channelName = key
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      () => ({ channelName: '', sales: 0, receipts: 0 }),
    ),
    'sales',
  )

  const categoryRows = sortByValueDesc(
    groupRows(
      lineRows,
      row => row.top_category_name || 'Kategorisiz',
      (current, row, key) => {
        current.categoryName = key
        current.sales += safeNumber(row.line_gross_after_discount)
        current.qty += safeNumber(row.qty)
      },
      () => ({ categoryName: '', sales: 0, qty: 0 }),
    ),
    'sales',
  )

  const topProductRows = sortByValueDesc(
    groupRows(
      lineRows,
      row => row.product_name || 'ürün yok',
      (current, row, key) => {
        current.productName = key
        current.sales += safeNumber(row.line_gross_after_discount)
        current.qty += safeNumber(row.qty)
      },
      () => ({ productName: '', sales: 0, qty: 0 }),
    ),
    'sales',
  ).slice(0, 8)

  return {
    selection,
    dateFrom,
    dateTo,
    totals: {
      totalSales,
      totalReceipts,
      avgTicket,
      totalDiscount,
      totalVat,
      totalCost,
      refundCount: refundRows.length,
    },
    dailyRows,
    branchRows,
    channelRows,
    categoryRows,
    topProductRows,
  }
}

function buildSalesData(selection, salesRows, lineRows, dateFrom, dateTo) {
  const categoryRows = sortByValueDesc(
    groupRows(
      lineRows,
      row => row.top_category_name || 'Kategorisiz',
      (current, row, key) => {
        current.categoryName = key
        current.sales += safeNumber(row.line_gross_after_discount)
        current.qty += safeNumber(row.qty)
        current.orderCount += 1
      },
      () => ({ categoryName: '', sales: 0, qty: 0, orderCount: 0 }),
    ),
    'sales',
  )

  const productRows = sortByValueDesc(
    groupRows(
      lineRows,
      row => `${row.top_category_name || 'Kategorisiz'}::${row.product_name || 'ürün yok'}`,
      (current, row, key) => {
        const [categoryName, productName] = key.split('::')
        current.categoryName = categoryName
        current.productName = productName
        current.sales += safeNumber(row.line_gross_after_discount)
        current.qty += safeNumber(row.qty)
        current.branchCount.add(row.branch_name || 'Şube yok')
      },
      () => ({ categoryName: '', productName: '', sales: 0, qty: 0, branchCount: new Set() }),
    ),
    'sales',
  ).map(row => ({
    ...row,
    branchCount: row.branchCount.size,
  }))

  const branchRows = sortByValueDesc(
    groupRows(
      salesRows.filter(row => row.status === 'completed'),
      row => row.branch_name || 'Şube yok',
      (current, row, key) => {
        current.branchName = key
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      () => ({ branchName: '', sales: 0, receipts: 0 }),
    ),
    'sales',
  )

  return {
    selection,
    dateFrom,
    dateTo,
    categoryRows,
    productRows,
    branchRows,
  }
}

function buildProductMixData(selection, salesRows, lineRows, dateFrom, dateTo) {
  const completedSales = salesRows.filter(row => row.status === 'completed')
  const completedSaleIds = new Set(completedSales.map(row => row.id))
  const completedLineRows = lineRows
    .filter(row => completedSaleIds.has(row.sale_id))
    .map(row => {
      const qty = safeNumber(row.qty)
      const grossBefore = safeNumber(row.line_gross_before_discount)
      const grossAfter = safeNumber(row.line_gross_after_discount)
      const netAfter = safeNumber(row.line_net_after_discount)
      const discountAmount = safeNumber(row.discount_allocated_amount)
      const totalCost = safeNumber(row.line_cost_total)
      const optionsSummary = parseOptionsSummary(row.options_json, row.options_summary)
      return {
        saleId: row.sale_id,
        saleDatetime: row.sale_datetime,
        branchName: row.branch_name || 'Şube yok',
        channelName: row.sales_channel_name || 'Diğer',
        topCategoryName: row.top_category_name || 'Kategorisiz',
        subCategoryName: row.sub_category_name || 'Alt kategori yok',
        productName: row.product_name || 'ürün yok',
        productSku: row.product_sku || '',
        portionName: row.portion_name || '',
        optionsSummary,
        qty,
        unitGrossBeforeDiscount: safeNumber(row.unit_gross_before_discount),
        lineGrossBeforeDiscount: grossBefore,
        discountAmount,
        lineGrossAfterDiscount: grossAfter,
        lineNetAfterDiscount: netAfter,
        unitCostSnapshot: safeNumber(row.unit_cost_snapshot),
        lineCostTotal: totalCost,
      }
    })

  const totals = completedLineRows.reduce((acc, row) => {
    acc.totalQty += row.qty
    acc.totalGrossBefore += row.lineGrossBeforeDiscount
    acc.totalGrossAfter += row.lineGrossAfterDiscount
    acc.totalNet += row.lineNetAfterDiscount
    acc.totalDiscount += row.discountAmount
    acc.totalCost += row.lineCostTotal
    return acc
  }, {
    totalQty: 0,
    totalGrossBefore: 0,
    totalGrossAfter: 0,
    totalNet: 0,
    totalDiscount: 0,
    totalCost: 0,
  })

  const categoryRows = sortByValueDesc(
    groupRows(
      completedLineRows,
      row => row.topCategoryName,
      (current, row, key) => {
        current.categoryName = key
        current.qty += row.qty
        current.grossSales += row.lineGrossAfterDiscount
        current.netSales += row.lineNetAfterDiscount
        current.discountAmount += row.discountAmount
      },
      () => ({ categoryName: '', qty: 0, grossSales: 0, netSales: 0, discountAmount: 0 }),
    ),
    'grossSales',
  )

  const subCategoryRows = sortByValueDesc(
    groupRows(
      completedLineRows,
      row => `${row.topCategoryName}::${row.subCategoryName}`,
      (current, row, key) => {
        const [topCategoryName, subCategoryName] = key.split('::')
        current.topCategoryName = topCategoryName
        current.subCategoryName = subCategoryName
        current.qty += row.qty
        current.grossSales += row.lineGrossAfterDiscount
        current.netSales += row.lineNetAfterDiscount
        current.discountAmount += row.discountAmount
      },
      () => ({ topCategoryName: '', subCategoryName: '', qty: 0, grossSales: 0, netSales: 0, discountAmount: 0 }),
    ),
    'grossSales',
  )

  const branchRows = sortByValueDesc(
    groupRows(
      completedLineRows,
      row => row.branchName,
      (current, row, key) => {
        current.branchName = key
        current.qty += row.qty
        current.grossSales += row.lineGrossAfterDiscount
        current.netSales += row.lineNetAfterDiscount
      },
      () => ({ branchName: '', qty: 0, grossSales: 0, netSales: 0 }),
    ),
    'grossSales',
  )

  const topProductRows = sortByValueDesc(
    groupRows(
      completedLineRows,
      row => `${row.topCategoryName}::${row.productName}`,
      (current, row, key) => {
        const [topCategoryName, productName] = key.split('::')
        current.topCategoryName = topCategoryName
        current.productName = productName
        current.qty += row.qty
        current.grossSales += row.lineGrossAfterDiscount
        current.netSales += row.lineNetAfterDiscount
      },
      () => ({ topCategoryName: '', productName: '', qty: 0, grossSales: 0, netSales: 0 }),
    ),
    'grossSales',
  ).slice(0, 12)

  return {
    selection,
    dateFrom,
    dateTo,
    totals: {
      ...totals,
      averageGrossUnitPrice: totals.totalQty ? totals.totalGrossAfter / totals.totalQty : 0,
      averageNetUnitPrice: totals.totalQty ? totals.totalNet / totals.totalQty : 0,
      discountRatio: totals.totalGrossBefore ? (totals.totalDiscount / totals.totalGrossBefore) * 100 : 0,
      marginValue: totals.totalNet - totals.totalCost,
      productCount: new Set(completedLineRows.map(row => row.productName)).size,
      lineCount: completedLineRows.length,
      saleCount: completedSales.length,
    },
    detailRows: completedLineRows,
    categoryRows,
    subCategoryRows,
    branchRows,
    topProductRows,
  }
}

function buildInventoryData(selection, rows, dateFrom, dateTo, options = {}) {
  const startMs = new Date(startOfDay(dateFrom)).getTime()
  const endMs = new Date(endOfDay(dateTo)).getTime()
  const snapshotMap = new Map()
  const periodRows = []
  const orderedRows = [...(rows || [])].sort((left, right) => {
    const timeCompare = String(left?.movement_at || '').localeCompare(String(right?.movement_at || ''))
    if (timeCompare !== 0) return timeCompare
    return safeNumber(left?.ledger_seq) - safeNumber(right?.ledger_seq)
  })

  for (const row of orderedRows) {
    const movementTime = new Date(row.movement_at).getTime()
    const itemKey = [
      row.branch_name || 'Şube yok',
      row.item_type || '',
      row.stock_item_id || row.semi_item_id || row.item_sku || row.item_name || row.id,
    ].join('::')

    const current = snapshotMap.get(itemKey) || {
      branchName: row.branch_name || 'Şube yok',
      itemName: row.item_name || 'Stok kalemi',
      openingRow: null,
      closingRow: null,
      firstInPeriod: null,
    }

    if (movementTime < startMs) {
      current.openingRow = row
    }

    if (movementTime >= startMs && movementTime <= endMs) {
      current.firstInPeriod = current.firstInPeriod || row
      periodRows.push(row)
    }

    if (movementTime <= endMs) {
      current.closingRow = row
    }

    snapshotMap.set(itemKey, current)
  }

  const itemSnapshots = [...snapshotMap.values()].map(item => {
    const openingValue = item.openingRow
      ? safeNumber(item.openingRow.balance_total_cost_after)
      : item.firstInPeriod
        ? safeNumber(item.firstInPeriod.balance_total_cost_after) - safeNumber(item.firstInPeriod.total_cost_signed)
        : 0

    const closingValue = item.closingRow
      ? safeNumber(item.closingRow.balance_total_cost_after)
      : openingValue

    const closingQty = item.closingRow
      ? safeNumber(item.closingRow.balance_qty_after)
      : 0

    return {
      branchName: item.branchName,
      itemName: item.itemName,
      itemType: item.closingRow?.item_type || item.openingRow?.item_type || item.firstInPeriod?.item_type || '',
      itemSku: item.closingRow?.item_sku || item.openingRow?.item_sku || item.firstInPeriod?.item_sku || '',
      openingValue,
      closingValue,
      closingQty,
      avgUnitCost: item.closingRow
        ? safeNumber(item.closingRow.avg_unit_cost_after)
        : item.openingRow
          ? safeNumber(item.openingRow.avg_unit_cost_after)
          : 0,
      lastMovementAt: item.closingRow?.movement_at || item.openingRow?.movement_at || '',
    }
  })

  const openingStockValue = itemSnapshots.reduce((sum, item) => sum + item.openingValue, 0)
  const closingStockValue = itemSnapshots.reduce((sum, item) => sum + item.closingValue, 0)
  const shortageValue = periodRows
    .filter(row => row.movement_type === 'stock_count_loss')
    .reduce((sum, row) => sum + Math.abs(safeNumber(row.total_cost_signed)), 0)
  const surplusValue = periodRows
    .filter(row => row.movement_type === 'stock_count_gain')
    .reduce((sum, row) => sum + Math.max(0, safeNumber(row.total_cost_signed)), 0)
  const purchaseValue = periodRows
    .filter(row => row.movement_type === 'purchase_receipt')
    .reduce((sum, row) => sum + Math.max(0, safeNumber(row.total_cost_signed)), 0)
  const salesConsumptionValue = periodRows
    .filter(row => row.source_doc_type === 'sale')
    .reduce((sum, row) => sum + Math.abs(Math.min(0, safeNumber(row.total_cost_signed))), 0)

  const branchRows = sortByValueDesc(
    groupRows(
      itemSnapshots,
      row => row.branchName,
      (current, row, key) => {
        current.branchName = key
        current.openingValue += row.openingValue
        current.closingValue += row.closingValue
      },
      () => ({ branchName: '', openingValue: 0, closingValue: 0 }),
    ),
    'closingValue',
  )

  const topItems = sortByValueDesc(itemSnapshots, 'closingValue').slice(0, 14)
  const latestStockRows = [...itemSnapshots]
    .sort((left, right) => {
      const branchCompare = String(left.branchName || '').localeCompare(String(right.branchName || ''), 'tr')
      if (branchCompare !== 0) return branchCompare
      return String(left.itemName || '').localeCompare(String(right.itemName || ''), 'tr')
    })
    .slice(0, 200)

  return {
    selection,
    dateFrom,
    dateTo,
    totals: {
      openingStockValue,
      closingStockValue,
      shortageValue,
      surplusValue,
      purchaseValue,
      salesConsumptionValue,
    },
    branchRows,
    topItems,
    latestStockRows,
    periodMovementCount: periodRows.length,
    lookbackDays: INVENTORY_LOOKBACK_DAYS,
    truncatedBranches: options.truncatedBranches || [],
  }
}

function buildAdvancedData(selection, salesRows, paymentRows, dateFrom, dateTo) {
  const completedSales = salesRows.filter(row => row.status === 'completed')
  const saleIdSet = new Set(completedSales.map(row => row.id))
  const filteredPayments = paymentRows.filter(row => saleIdSet.has(row.sale_id))

  const totalRevenue = completedSales.reduce((sum, row) => sum + safeNumber(row.payment_total), 0)
  const totalCost = completedSales.reduce((sum, row) => sum + safeNumber(row.cost_total), 0)
  const totalQty = completedSales.length

  const paymentRowsSummary = sortByValueDesc(
    groupRows(
      filteredPayments,
      row => row.payment_method_label || row.payment_method || 'Diğer',
      (current, row, key) => {
        current.methodName = key
        current.amount += safeNumber(row.amount)
      },
      () => ({ methodName: '', amount: 0 }),
    ),
    'amount',
  ).map(row => ({
    ...row,
    ratio: totalRevenue ? (row.amount / totalRevenue) * 100 : 0,
  }))

  const platformRows = sortByValueDesc(
    groupRows(
      completedSales,
      row => row.sales_channel_name || 'Diğer',
      (current, row, key) => {
        current.platformName = key
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      () => ({ platformName: '', sales: 0, receipts: 0 }),
    ),
    'sales',
  )

  const cashierRows = sortByValueDesc(
    groupRows(
      completedSales,
      row => row.cashier_name || 'Atanmamış?',
      (current, row, key) => {
        current.cashierName = key
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      () => ({ cashierName: '', sales: 0, receipts: 0 }),
    ),
    'sales',
  ).slice(0, 8)

  const customerRows = sortByValueDesc(
    groupRows(
      completedSales.filter(row => row.customer_name),
      row => row.customer_name || 'M??teri yok',
      (current, row, key) => {
        current.customerName = key
        current.sales += safeNumber(row.payment_total)
        current.receipts += 1
      },
      () => ({ customerName: '', sales: 0, receipts: 0 }),
    ),
    'sales',
  ).slice(0, 8)

  const detailRows = [...completedSales]
    .sort((left, right) => String(right.sale_datetime).localeCompare(String(left.sale_datetime)))
    .slice(0, 120)

  return {
    selection,
    dateFrom,
    dateTo,
    totals: {
      totalRevenue,
      totalCost,
      totalQty,
      totalPlatforms: platformRows.length,
    },
    paymentRows: paymentRowsSummary,
    platformRows,
    cashierRows,
    customerRows,
    detailRows,
  }
}

function ReportTabButton({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        borderRadius: 14,
        padding: '10px 14px',
        background: active ? 'linear-gradient(135deg,#2563eb,#1d4ed8)' : '#fff',
        color: active ? '#fff' : '#475569',
        fontWeight: 800,
        fontSize: '.82rem',
        cursor: 'pointer',
        boxShadow: active ? '0 18px 36px rgba(37,99,235,.22)' : 'inset 0 0 0 1px #dbe5f1',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <i className={`fa-solid ${icon}`} />
      {label}
    </button>
  )
}

function MetricCard({ label, value, hint, accent, soft }) {
  return (
    <div
      className="card"
      style={{
        padding: 18,
        borderRadius: 20,
        background: soft || '#fff',
        borderColor: '#e2e8f0',
      }}
    >
      <div style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: accent }}>
        {label}
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0f172a', marginTop: 10 }}>
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 6, fontSize: '.78rem', color: '#64748b' }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: 18, borderRadius: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{title}</div>
        {subtitle ? <div style={{ marginTop: 4, fontSize: '.82rem', color: '#64748b' }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  )
}

function InlineNotice({ tone = 'info', children }) {
  const palette = tone === 'warning'
    ? { bg: '#fff7ed', border: '#fed7aa', color: '#9a3412' }
    : { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' }

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 16,
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.color,
        fontSize: '.82rem',
        lineHeight: 1.55,
      }}
    >
      {children}
    </div>
  )
}

function LoadingState({ label = 'Veriler ükleniyor...' }) {
  return (
    <div className="card" style={{ padding: 40, borderRadius: 24, textAlign: 'center', color: '#64748b' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
      {label}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="card" style={{ padding: 24, borderRadius: 24, borderColor: '#fecaca', background: '#fff7f7' }}>
      <div style={{ fontWeight: 900, color: '#991b1b', marginBottom: 8 }}>Rapor yüklenemedi</div>
      <div style={{ color: '#7f1d1d', fontSize: '.84rem', lineHeight: 1.55 }}>{message}</div>
      {onRetry ? (
        <button type="button" className="btn-o" style={{ marginTop: 14 }} onClick={onRetry}>
          <i className="fa-solid fa-rotate-right" /> Tekrar Dene
        </button>
      ) : null}
    </div>
  )
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="card" style={{ padding: 34, borderRadius: 24, textAlign: 'center', color: '#64748b' }}>
      <i className="fa-solid fa-inbox" style={{ fontSize: '1.5rem', marginBottom: 12, display: 'block', color: '#94a3b8' }} />
      <div style={{ fontWeight: 900, color: '#334155' }}>{title}</div>
      {subtitle ? <div style={{ marginTop: 6, fontSize: '.84rem' }}>{subtitle}</div> : null}
    </div>
  )
}

function normalizeTableValue(value) {
  if (value == null) return ''
  if (typeof value === 'number') return value
  return String(value).trim()
}

function normalizeTableText(value) {
  return String(value ?? '').toLocaleLowerCase('tr-TR').trim()
}

function resolveColumnValue(column, row, mode = 'filter') {
  if (mode === 'sort' && typeof column.sortValue === 'function') {
    return normalizeTableValue(column.sortValue(row))
  }
  if (mode === 'filter' && typeof column.filterValue === 'function') {
    return normalizeTableValue(column.filterValue(row))
  }
  if (typeof column.value === 'function') {
    return normalizeTableValue(column.value(row))
  }
  return normalizeTableValue(row?.[column.key])
}

function isColumnFilterable(column) {
  if (typeof column.filterable === 'boolean') return column.filterable
  if (column.align === 'right') return false
  if (/(^|_)(date|datetime|time|timestamp)(_|$)/i.test(String(column.key || ''))) return false
  return true
}

function Table({ columns, rows, emptyMessage }) {
  if (!rows?.length) {
    return <EmptyState title={emptyMessage || 'Kay?t bulunamadı'} />
  }

  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'desc' })
  const [columnFilters, setColumnFilters] = useState(() => Object.fromEntries(columns.map(column => [column.key, ''])))

  const preparedRows = useMemo(() => {
    let nextRows = [...rows]

    nextRows = nextRows.filter(row => columns.every(column => {
      const filterText = normalizeTableText(columnFilters[column.key])
      if (!filterText) return true
      const cellValue = resolveColumnValue(column, row, 'filter')
      return normalizeTableText(cellValue).includes(filterText)
    }))

    if (sortConfig.key) {
      const activeColumn = columns.find(column => column.key === sortConfig.key)
      if (activeColumn) {
        const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1
        nextRows.sort((left, right) => {
          const leftValue = resolveColumnValue(activeColumn, left, 'sort')
          const rightValue = resolveColumnValue(activeColumn, right, 'sort')

          if (typeof leftValue === 'number' && typeof rightValue === 'number') {
            return (leftValue - rightValue) * directionMultiplier
          }

          return String(leftValue || '').localeCompare(String(rightValue || ''), 'tr') * directionMultiplier
        })
      }
    }

    return nextRows
  }, [rows, columns, columnFilters, sortConfig])

  function updateColumnFilter(key, value) {
    setColumnFilters(current => ({ ...current, [key]: value }))
  }

  function toggleSort(key) {
    setSortConfig(current => {
      if (current.key !== key) return { key, direction: 'desc' }
      if (current.direction === 'desc') return { key, direction: 'asc' }
      return { key, direction: 'desc' }
    })
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '.74rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {columns.map(column => (
              <th key={column.key} style={{ textAlign: column.align || 'left', padding: '12px 10px' }}>
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    margin: 0,
                    font: 'inherit',
                    textTransform: 'inherit',
                    letterSpacing: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 800,
                  }}
                >
                  {column.label}
                  <span style={{ fontSize: '.75rem', color: sortConfig.key === column.key ? '#2563eb' : '#94a3b8' }}>
                    {sortConfig.key === column.key
                      ? (sortConfig.direction === 'desc' ? '?' : '?')
                      : '?'}
                  </span>
                </button>
              </th>
            ))}
          </tr>
          <tr style={{ background: '#fff' }}>
            {columns.map(column => (
              <th key={`${column.key}-filter`} style={{ textAlign: column.align || 'left', padding: '8px 10px 10px' }}>
                {!isColumnFilterable(column) ? (
                  <div style={{ height: 34 }} />
                ) : (
                  <input
                    className="f-input"
                    value={columnFilters[column.key] || ''}
                    onChange={event => updateColumnFilter(column.key, event.target.value)}
                    placeholder={column.align === 'right' ? 'Filtre...' : 'Ara...'}
                    style={{
                      minWidth: column.align === 'right' ? 110 : 140,
                      height: 34,
                      padding: '6px 10px',
                      fontWeight: 500,
                      textAlign: column.align || 'left',
                    }}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!preparedRows.length ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: '18px 10px', textAlign: 'center', color: '#94a3b8', borderTop: '1px solid #edf2f7' }}>
                Bu filtrelerle kayıt bulunamadı.
              </td>
            </tr>
          ) : preparedRows.map((row, index) => (
            <tr key={row.id || `${index}-${columns[0]?.key || 'row'}`} style={{ borderTop: '1px solid #edf2f7' }}>
              {columns.map(column => (
                <td key={column.key} style={{ padding: '12px 10px', textAlign: column.align || 'left', color: column.color || '#334155', fontWeight: column.weight || 600 }}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MiniBars({ rows, valueKey, labelKey, color = '#2563eb', formatter = value => value, emptyMessage }) {
  if (!rows?.length) {
    return <EmptyState title={emptyMessage || 'Veri yok'} />
  }

  const maxValue = Math.max(...rows.map(row => safeNumber(row[valueKey])), 1)

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {rows.map(row => {
        const width = `${(safeNumber(row[valueKey]) / maxValue) * 100}%`
        return (
          <div key={row[labelKey]} style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: '.84rem', fontWeight: 700, color: '#0f172a' }}>{row[labelKey]}</div>
              <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#475569' }}>{formatter(row[valueKey], row)}</div>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: '#eff6ff', overflow: 'hidden' }}>
              <div style={{ width, height: '100%', borderRadius: 999, background: color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReportsFilters({
  scopeVariant,
  branches,
  branchTemplates,
  branchMode,
  branchId,
  templateId,
  dateFrom,
  dateTo,
  preset,
  selectionLabel,
  onPresetChange,
  onFilterChange,
}) {
  return (
    <div className="card" style={{ padding: 18, borderRadius: 24, marginBottom: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {scopeVariant === 'center' ? (
          <div>
            <label className="f-label">Rapor kapsamı</label>
            <select className="f-input" value={branchMode} onChange={event => onFilterChange('branchMode', event.target.value)}>
              <option value="all">Tüm Şubeler</option>
              <option value="branch">Tek Şube</option>
              <option value="template">Şube Şablonu</option>
            </select>
          </div>
        ) : null}

        {scopeVariant === 'center' && branchMode === 'branch' ? (
          <div>
            <label className="f-label">Şube</label>
            <select className="f-input" value={branchId} onChange={event => onFilterChange('branchId', event.target.value)}>
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {scopeVariant === 'center' && branchMode === 'template' ? (
          <div>
            <label className="f-label">Şube Şablonu</label>
            <select className="f-input" value={templateId} onChange={event => onFilterChange('templateId', event.target.value)}>
              <option value="">Şablon seçin</option>
              {branchTemplates.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="f-label">Başlangıç</label>
          <input className="f-input" type="date" value={dateFrom} onChange={event => onFilterChange('dateFrom', event.target.value)} />
        </div>

        <div>
          <label className="f-label">Bitiş</label>
          <input className="f-input" type="date" value={dateTo} onChange={event => onFilterChange('dateTo', event.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DATE_PRESETS.map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => onPresetChange(item.key)}
              style={{
                border: 'none',
                borderRadius: 999,
                padding: '8px 12px',
                background: preset === item.key ? '#dbeafe' : '#f8fafc',
                color: preset === item.key ? '#1d4ed8' : '#475569',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
          Kapsam: <span style={{ color: '#0f172a' }}>{selectionLabel}</span>
        </div>
      </div>
    </div>
  )
}

function OverviewTab({ data }) {
  if (!data) return null

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {false ? (
        <InlineNotice tone="warning">
          Bazı Şubelerde rapor son {formatNumber(INVENTORY_RPC_LIMIT)} hareket ile sınırlandı: {data.truncatedBranches.join(', ')}.
          Gerekirse tarih aralığını daraltın.
        </InlineNotice>
      ) : null}

      {false ? (
        <InlineNotice tone="warning">
          Bazı Şubelerde rapor son {formatNumber(INVENTORY_RPC_LIMIT)} hareket ile sınırlandı: {data.truncatedBranches.join(', ')}.
          Gerekirse tarih aralığını daraltın.
        </InlineNotice>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <MetricCard label="Toplam satış" value={`₺${formatMoney(data.totals.totalSales)}`} accent="#2563eb" soft="linear-gradient(135deg,#eff6ff,#ffffff)" />
        <MetricCard label="Hesap adedi" value={formatNumber(data.totals.totalReceipts)} accent="#0f766e" soft="linear-gradient(135deg,#ecfeff,#ffffff)" />
        <MetricCard label="Ortalama hesap" value={`₺${formatMoney(data.totals.avgTicket)}`} accent="#7c3aed" soft="linear-gradient(135deg,#f5f3ff,#ffffff)" />
        <MetricCard label="İade / iptal" value={formatNumber(data.totals.refundCount)} accent="#dc2626" soft="linear-gradient(135deg,#fff1f2,#ffffff)" />
        <MetricCard label="İndirimler" value={`₺${formatMoney(data.totals.totalDiscount)}`} accent="#c2410c" />
        <MetricCard label="KDV" value={`₺${formatMoney(data.totals.totalVat)}`} accent="#0891b2" />
      </div>

      <SectionCard
        title="Satış dinamikleri"
        subtitle={`${formatDate(data.dateFrom)} - ${formatDate(data.dateTo)} aral???ndaki g?nl?k satış ritmi`}
      >
        <MiniBars
          rows={data.dailyRows}
          valueKey="sales"
          labelKey="date"
          color="#2563eb"
          formatter={value => `₺${formatMoney(value)}`}
          emptyMessage="Se?ili aral?kta g?nl?k satış bulunamadı"
        />
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18 }}>
        <SectionCard title="Şube kırılımı" subtitle="Merkez görünümünde en y?ksek ciro ?reten Şubeler">
          <Table
            rows={data.branchRows.slice(0, 10).map(row => ({ ...row, id: row.branchName }))}
            columns={[
              { key: 'branchName', label: 'Şube' },
              { key: 'sales', label: 'Satış', align: 'right', render: row => `₺${formatMoney(row.sales)}` },
              { key: 'receipts', label: 'Fiş', align: 'right', render: row => formatNumber(row.receipts) },
            ]}
            emptyMessage="Şube kırılımı bulunamadı"
          />
        </SectionCard>

        <SectionCard title="Ödeme / kanal dengesi" subtitle="Satış kanallar?na göre cirolar">
          <MiniBars
            rows={data.channelRows.slice(0, 8)}
            valueKey="sales"
            labelKey="channelName"
            color="#7c3aed"
            formatter={value => `₺${formatMoney(value)}`}
            emptyMessage="Kanal verisi bulunamadı"
          />
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <SectionCard title="Kategorilere göre satışlar" subtitle="?st kategori baz?nda ciro ve adet">
          <Table
            rows={data.categoryRows.slice(0, 10).map(row => ({ ...row, id: row.categoryName }))}
            columns={[
              { key: 'categoryName', label: 'Kategori' },
              { key: 'qty', label: 'Adet', align: 'right', render: row => formatNumber(row.qty, 1) },
              { key: 'sales', label: 'Satış', align: 'right', render: row => `₺${formatMoney(row.sales)}` },
            ]}
            emptyMessage="Kategori verisi yok"
          />
        </SectionCard>

        <SectionCard title="Öne çıkan ürünler" subtitle="Satış değeri en y?ksek ürünler">
          <Table
            rows={data.topProductRows.map(row => ({ ...row, id: row.productName }))}
            columns={[
              { key: 'productName', label: 'ürün' },
              { key: 'qty', label: 'Adet', align: 'right', render: row => formatNumber(row.qty, 1) },
              { key: 'sales', label: 'Satış', align: 'right', render: row => `₺${formatMoney(row.sales)}` },
            ]}
            emptyMessage="ürün verisi yok"
          />
        </SectionCard>
      </div>
    </div>
  )
}

function SalesTab({ data, selectedCategory, onCategoryChange }) {
  if (!data) return null

  const filteredProducts = selectedCategory
    ? data.productRows.filter(row => row.categoryName === selectedCategory)
    : data.productRows

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 18 }}>
        <SectionCard title="Kategori görünümü" subtitle="Kategori se?iminden ürün tablosuna filtre">
          <div style={{ display: 'grid', gap: 10 }}>
            <button
              type="button"
              onClick={() => onCategoryChange('')}
              style={{
                textAlign: 'left',
                border: 'none',
                background: selectedCategory ? '#f8fafc' : '#eff6ff',
                color: selectedCategory ? '#475569' : '#1d4ed8',
                borderRadius: 14,
                padding: '12px 14px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Tüm kategoriler
            </button>
            {data.categoryRows.map(row => (
              <button
                key={row.categoryName}
                type="button"
                onClick={() => onCategoryChange(row.categoryName)}
                style={{
                  textAlign: 'left',
                  border: 'none',
                  background: selectedCategory === row.categoryName ? '#eff6ff' : '#fff',
                  boxShadow: selectedCategory === row.categoryName ? 'inset 0 0 0 1px #bfdbfe' : 'inset 0 0 0 1px #e2e8f0',
                  color: selectedCategory === row.categoryName ? '#1d4ed8' : '#334155',
                  borderRadius: 14,
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontWeight: 800 }}>{row.categoryName}</div>
                  <div style={{ fontSize: '.8rem', fontWeight: 800 }}>?{formatMoney(row.sales)}</div>
                </div>
                <div style={{ marginTop: 4, fontSize: '.76rem', color: '#64748b' }}>
                  {formatNumber(row.qty, 1)} adet
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Şube baz?nda satış" subtitle="Merkez görünümünde tekil Şube karşılaştırması">
          <MiniBars
            rows={data.branchRows.slice(0, 10)}
            valueKey="sales"
            labelKey="branchName"
            color="#fb923c"
            formatter={value => `₺${formatMoney(value)}`}
            emptyMessage="Şube satış dağılımı yok"
          />
        </SectionCard>
      </div>

      <SectionCard
        title="ürün baz?nda satış, adet"
        subtitle={selectedCategory ? `${selectedCategory} kategorisine göre filtrelendi` : 'Tüm ürünler'}
      >
        <Table
          rows={filteredProducts.slice(0, 60).map(row => ({ ...row, id: `${row.categoryName}-${row.productName}` }))}
          columns={[
            { key: 'categoryName', label: 'Kategori' },
            { key: 'productName', label: 'ürün' },
            { key: 'qty', label: 'Adet', align: 'right', render: row => formatNumber(row.qty, 1) },
            { key: 'sales', label: 'Satış', align: 'right', render: row => `₺${formatMoney(row.sales)}` },
            { key: 'branchCount', label: 'Şube', align: 'right', render: row => formatNumber(row.branchCount) },
          ]}
          emptyMessage="Se?ili kategoride ürün bulunamadı"
        />
      </SectionCard>
    </div>
  )
}

function ProductMixTab({ data }) {
  const [viewOptions, setViewOptions] = useState({
    showTopCategory: true,
    showSubCategory: true,
    showPortionDetails: false,
    showOptionDetails: false,
    showDiscountColumns: true,
    showSubCategoryTotals: true,
  })

  useEffect(() => {
    setViewOptions({
      showTopCategory: true,
      showSubCategory: true,
      showPortionDetails: false,
      showOptionDetails: false,
      showDiscountColumns: true,
      showSubCategoryTotals: true,
    })
  }, [data?.selection?.key, data?.dateFrom, data?.dateTo])

  const groupedRows = useMemo(() => {
    const rows = Array.isArray(data?.detailRows) ? data.detailRows : []
    const map = new Map()

    rows.forEach(row => {
      const key = [
        row.productName,
        row.productSku,
        viewOptions.showTopCategory ? row.topCategoryName : '',
        viewOptions.showSubCategory ? row.subCategoryName : '',
        viewOptions.showPortionDetails ? row.portionName : '',
        viewOptions.showOptionDetails ? row.optionsSummary : '',
      ].join('::')

      const current = map.get(key) || {
        key,
        topCategoryName: row.topCategoryName,
        subCategoryName: row.subCategoryName,
        productName: row.productName,
        productSku: row.productSku,
        portionName: viewOptions.showPortionDetails ? (row.portionName || 'Standart') : '',
        optionsSummary: viewOptions.showOptionDetails ? (row.optionsSummary || 'Se?eneksiz') : '',
        qty: 0,
        grossBefore: 0,
        grossAfter: 0,
        netSales: 0,
        discountAmount: 0,
        totalCost: 0,
        branchCountSet: new Set(),
      }

      current.qty += row.qty
      current.grossBefore += row.lineGrossBeforeDiscount
      current.grossAfter += row.lineGrossAfterDiscount
      current.netSales += row.lineNetAfterDiscount
      current.discountAmount += row.discountAmount
      current.totalCost += row.lineCostTotal
      current.branchCountSet.add(row.branchName)
      map.set(key, current)
    })

    return sortByValueDesc(
      [...map.values()].map(row => ({
        ...row,
        avgListedUnitPrice: row.qty ? row.grossBefore / row.qty : 0,
        avgSaleUnitPrice: row.qty ? row.grossAfter / row.qty : 0,
        avgNetUnitPrice: row.qty ? row.netSales / row.qty : 0,
        unitCost: row.qty ? row.totalCost / row.qty : 0,
        discountRatio: row.grossBefore ? (row.discountAmount / row.grossBefore) * 100 : 0,
        branchCount: row.branchCountSet.size,
      })),
      'grossAfter',
    )
  }, [data?.detailRows, viewOptions])

  const displayColumns = useMemo(() => {
    const columns = []

    if (viewOptions.showTopCategory) {
      columns.push({ key: 'topCategoryName', label: 'Ana kategori' })
    }

    if (viewOptions.showSubCategory) {
      columns.push({ key: 'subCategoryName', label: 'Alt kategori' })
    }

    columns.push(
      { key: 'productName', label: 'Satış mal? ad?' },
      { key: 'productSku', label: 'SKU', render: row => row.productSku || '-' },
    )

    if (viewOptions.showPortionDetails) {
      columns.push({ key: 'portionName', label: 'Boyut / porsiyon' })
    }

    if (viewOptions.showOptionDetails) {
      columns.push({ key: 'optionsSummary', label: 'Se?enekler', render: row => row.optionsSummary || '-' })
    }

    columns.push(
      { key: 'qty', label: 'Satış miktar?', align: 'right', render: row => formatNumber(row.qty, 2), sortValue: row => row.qty },
      { key: 'avgListedUnitPrice', label: 'Liste fiyat?', align: 'right', render: row => `₺${formatMoney(row.avgListedUnitPrice)}`, sortValue: row => row.avgListedUnitPrice },
      { key: 'avgSaleUnitPrice', label: 'Ort. satış fiyat?', align: 'right', render: row => `₺${formatMoney(row.avgSaleUnitPrice)}`, sortValue: row => row.avgSaleUnitPrice },
      { key: 'avgNetUnitPrice', label: 'Net ürün fiyat?', align: 'right', render: row => `₺${formatMoney(row.avgNetUnitPrice)}`, sortValue: row => row.avgNetUnitPrice },
      { key: 'grossAfter', label: 'Toplam satış', align: 'right', render: row => `₺${formatMoney(row.grossAfter)}`, sortValue: row => row.grossAfter },
      { key: 'netSales', label: 'Toplam net satış', align: 'right', render: row => `₺${formatMoney(row.netSales)}`, sortValue: row => row.netSales },
    )

    if (viewOptions.showDiscountColumns) {
      columns.push(
        { key: 'discountAmount', label: 'İndirim tutar?', align: 'right', render: row => `₺${formatMoney(row.discountAmount)}`, sortValue: row => row.discountAmount },
        { key: 'discountRatio', label: 'İndirim %', align: 'right', render: row => `%${formatMoney(row.discountRatio, 2)}`, sortValue: row => row.discountRatio },
      )
    }

    columns.push(
      { key: 'unitCost', label: 'Birim maliyeti', align: 'right', render: row => `₺${formatMoney(row.unitCost, 4)}`, sortValue: row => row.unitCost },
      { key: 'totalCost', label: 'Toplam maliyet', align: 'right', render: row => `₺${formatMoney(row.totalCost)}`, sortValue: row => row.totalCost },
    )

    if (data?.selection?.kind !== 'branch') {
      columns.push({ key: 'branchCount', label: 'Şube', align: 'right', render: row => formatNumber(row.branchCount), sortValue: row => row.branchCount })
    }

    return columns
  }, [data?.selection?.kind, viewOptions])

  if (!data) return null

  const optionCards = [
    { key: 'showTopCategory', label: 'Ana kategori', hint: 'Tabloda ana kategori kolonu açılsın.' },
    { key: 'showSubCategory', label: 'Alt kategori', hint: 'Alt kategori kırılımı tabloda gösterilsin.' },
    { key: 'showPortionDetails', label: 'Boyut / porsiyon', hint: 'Porsiyon bazlı karmay? ayrı satırda tut.' },
    { key: 'showOptionDetails', label: 'Se?enek detayları', hint: 'Opsiyon kombinasyonlar?n? ayrı satıra b?l.' },
    { key: 'showDiscountColumns', label: 'İndirimler', hint: 'İndirim tutar? ve oran kolonlar?n? a?.' },
    { key: 'showSubCategoryTotals', label: 'Alt kategori toplam?', hint: 'Alt kategoriler için ayr? toplam tablosu g?ster.' },
  ]

  function setViewOption(key, checked) {
    setViewOptions(current => ({ ...current, [key]: checked }))
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <InlineNotice>
        Bu rapor, Excel ?rne?indeki <strong>ürün karmas?</strong> mant???na göre satış sat?rlar?n? konsolide eder.
        Merkez görünümünde t?m Şubeler, tek Şube veya Şube Şablonu baz?nda; Şube görünümünde ise sadece se?ili Şube için ?al???r.
      </InlineNotice>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <MetricCard label="Toplam satış miktar?" value={formatNumber(data.totals.totalQty, 2)} accent="#2563eb" />
        <MetricCard label="Toplam satış" value={`₺${formatMoney(data.totals.totalGrossAfter)}`} accent="#0f766e" />
        <MetricCard label="Toplam net satış" value={`₺${formatMoney(data.totals.totalNet)}`} accent="#7c3aed" />
        <MetricCard label="Toplam indirim" value={`₺${formatMoney(data.totals.totalDiscount)}`} accent="#c2410c" />
        <MetricCard label="Ort. satış fiyat?" value={`₺${formatMoney(data.totals.averageGrossUnitPrice)}`} accent="#0891b2" />
        <MetricCard label="Tahmini maliyet" value={`₺${formatMoney(data.totals.totalCost)}`} accent="#dc2626" />
      </div>

      <SectionCard
        title="Rapor görünümü"
        subtitle="Excel ?rne?indeki detay seviyesini bu se?eneklerle a??p kapatabilirsiniz"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {optionCards.map(item => (
            <label
              key={item.key}
              style={{
                display: 'grid',
                gap: 6,
                padding: 14,
                borderRadius: 16,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={viewOptions[item.key]}
                  onChange={event => setViewOption(item.key, event.target.checked)}
                />
                <span style={{ fontSize: '.9rem', fontWeight: 800, color: '#0f172a' }}>{item.label}</span>
              </div>
              <div style={{ fontSize: '.8rem', color: '#64748b', lineHeight: 1.5 }}>{item.hint}</div>
            </label>
          ))}
        </div>
      </SectionCard>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <SectionCard title="Ana kategori Özeti" subtitle="Ciroya göre ?st kategori dağılımı">
          <Table
            rows={data.categoryRows.map(row => ({ ...row, id: row.categoryName }))}
            columns={[
              { key: 'categoryName', label: 'Ana kategori' },
              { key: 'qty', label: 'Miktar', align: 'right', render: row => formatNumber(row.qty, 2) },
              { key: 'grossSales', label: 'Toplam satış', align: 'right', render: row => `₺${formatMoney(row.grossSales)}` },
              { key: 'netSales', label: 'Net satış', align: 'right', render: row => `₺${formatMoney(row.netSales)}` },
            ]}
            emptyMessage="Kategori Özeti bulunamadı"
          />
        </SectionCard>

        <SectionCard title="Öne çıkan satış mallar?" subtitle="Satış değeri en y?ksek ürünler">
          <Table
            rows={data.topProductRows.map(row => ({ ...row, id: `${row.topCategoryName}-${row.productName}` }))}
            columns={[
              { key: 'topCategoryName', label: 'Kategori' },
              { key: 'productName', label: 'Satış mal?' },
              { key: 'qty', label: 'Miktar', align: 'right', render: row => formatNumber(row.qty, 2) },
              { key: 'grossSales', label: 'Toplam satış', align: 'right', render: row => `₺${formatMoney(row.grossSales)}` },
            ]}
            emptyMessage="ürün karmas? Özeti bulunamadı"
          />
        </SectionCard>
      </div>

      {viewOptions.showSubCategoryTotals ? (
        <SectionCard title="Alt kategori toplamlar?" subtitle="Excel'deki alt kategori toplam? se?ene?ine kar??l?k gelir">
          <Table
            rows={data.subCategoryRows.map(row => ({ ...row, id: `${row.topCategoryName}-${row.subCategoryName}` }))}
            columns={[
              { key: 'topCategoryName', label: 'Ana kategori' },
              { key: 'subCategoryName', label: 'Alt kategori' },
              { key: 'qty', label: 'Miktar', align: 'right', render: row => formatNumber(row.qty, 2) },
              { key: 'grossSales', label: 'Toplam satış', align: 'right', render: row => `₺${formatMoney(row.grossSales)}` },
              { key: 'discountAmount', label: 'İndirim', align: 'right', render: row => `₺${formatMoney(row.discountAmount)}` },
              { key: 'netSales', label: 'Net satış', align: 'right', render: row => `₺${formatMoney(row.netSales)}` },
            ]}
            emptyMessage="Alt kategori toplam? bulunamadı"
          />
        </SectionCard>
      ) : null}

      <SectionCard
        title="Satış malı karması"
        subtitle={`${formatDate(data.dateFrom)} - ${formatDate(data.dateTo)} aral???nda ${formatNumber(data.totals.saleCount)} fişten ?retildi`}
      >
        <Table
          rows={groupedRows.slice(0, 500).map(row => ({ ...row, id: row.key }))}
          columns={displayColumns}
          emptyMessage="Se?ili aral?kta satış malı karması verisi bulunamadı"
        />
      </SectionCard>
    </div>
  )
}

function InventoryTab({ data }) {
  if (!data) return null

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {data.selection?.kind === 'all' ? (
        <InlineNotice tone="warning">
          Merkez işlemleri raporla görünümünde stok Özeti t?m Şubeler konsolide edilerek g?steriliyor.
        </InlineNotice>
      ) : null}

      <InlineNotice>
        A??l?? ve kapan?? stok de?erleri, se?ili aral?ktan ?nceki son <strong>{data.lookbackDays} g?nl?k</strong> hareket penceresiyle hesapland?.
      </InlineNotice>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <MetricCard label="A??l?? stok değeri" value={`₺${formatMoney(data.totals.openingStockValue)}`} accent="#0f766e" />
        <MetricCard label="Kapan?? stok değeri" value={`₺${formatMoney(data.totals.closingStockValue)}`} accent="#2563eb" />
        <MetricCard label="Stok eksi?i" value={`₺${formatMoney(data.totals.shortageValue)}`} accent="#dc2626" />
        <MetricCard label="Stok fazlas?" value={`₺${formatMoney(data.totals.surplusValue)}`} accent="#7c3aed" />
        <MetricCard label="Sat?n alma maliyeti" value={`₺${formatMoney(data.totals.purchaseValue)}`} accent="#c2410c" />
        <MetricCard label="Satış t?ketimi" value={`₺${formatMoney(data.totals.salesConsumptionValue)}`} accent="#0891b2" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <SectionCard title="Şube baz?nda stok değeri" subtitle="Se?ili kapsam içindeki kapan?? stok toplamlar?">
          <Table
            rows={data.branchRows.map(row => ({ ...row, id: row.branchName }))}
            columns={[
              { key: 'branchName', label: 'Şube' },
              { key: 'openingValue', label: 'A??l??', align: 'right', render: row => `₺${formatMoney(row.openingValue)}` },
              { key: 'closingValue', label: 'Kapan??', align: 'right', render: row => `₺${formatMoney(row.closingValue)}` },
            ]}
            emptyMessage="Şube stok Özeti bulunamadı"
          />
        </SectionCard>

        <SectionCard title="En y?ksek kapan?? kalemleri" subtitle={`${formatNumber(data.periodMovementCount)} hareket satüründan ?retildi`}>
          <Table
            rows={data.topItems.map(row => ({ ...row, id: `${row.branchName}-${row.itemName}` }))}
            columns={[
              { key: 'branchName', label: 'Şube' },
              { key: 'itemName', label: 'Kalem' },
              { key: 'closingQty', label: 'Bakiye', align: 'right', render: row => formatNumber(row.closingQty, 2) },
              { key: 'closingValue', label: 'Kapan??', align: 'right', render: row => `₺${formatMoney(row.closingValue)}` },
            ]}
            emptyMessage="Kapan?? stoku bulunamadı"
          />
        </SectionCard>
      </div>

      <SectionCard
        title="Son Stok Durumu Raporu"
        subtitle="Se?ili kapsam içindeki güncel stok bakiyeleri ve son ortalama maliyetler"
      >
        <Table
          rows={data.latestStockRows.map(row => ({ ...row, id: `${row.branchName}-${row.itemName}-${row.itemSku}` }))}
            columns={[
              { key: 'branchName', label: 'Şube' },
              { key: 'itemName', label: 'Stok Kalemi' },
              { key: 'itemType', label: 'T?r', render: row => row.itemType === 'semi_item' ? 'Yar? Mamul' : 'Stok Mal?' },
              { key: 'itemSku', label: 'SKU', render: row => row.itemSku || '-' },
              { key: 'closingQty', label: 'Son Bakiye', align: 'right', filterable: false, render: row => formatNumber(row.closingQty, 2) },
              { key: 'avgUnitCost', label: 'Ort. Maliyet', align: 'right', filterable: false, render: row => `₺${formatMoney(row.avgUnitCost, 4)}` },
              { key: 'closingValue', label: 'Stok De?eri', align: 'right', filterable: false, render: row => `₺${formatMoney(row.closingValue)}` },
              { key: 'lastMovementAt', label: 'Son Hareket', align: 'right', filterable: false, render: row => formatDateTime(row.lastMovementAt) },
            ]}
            emptyMessage="Son stok durumu bulunamadı"
          />
      </SectionCard>
    </div>
  )
}

function AdvancedTab({ data }) {
  if (!data) return null

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        <MetricCard label="Toplam gelir" value={`₺${formatMoney(data.totals.totalRevenue)}`} accent="#2563eb" />
        <MetricCard label="Toplam maliyet" value={`₺${formatMoney(data.totals.totalCost)}`} accent="#dc2626" />
        <MetricCard label="Satış adedi" value={formatNumber(data.totals.totalQty)} accent="#0f766e" />
        <MetricCard label="Platform say?s?" value={formatNumber(data.totals.totalPlatforms)} accent="#7c3aed" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <SectionCard title="Ödeme y?ntemleri" subtitle="Finansal rapor ?rne?indeki Ödeme dağılımı">
          <Table
            rows={data.paymentRows.map(row => ({ ...row, id: row.methodName }))}
            columns={[
              { key: 'methodName', label: 'Yöntem' },
              { key: 'amount', label: 'Tutar', align: 'right', render: row => `₺${formatMoney(row.amount)}` },
              { key: 'ratio', label: 'Oran', align: 'right', render: row => `%${formatMoney(row.ratio, 2)}` },
            ]}
            emptyMessage="Ödeme y?ntemi bulunamadı"
          />
        </SectionCard>

        <SectionCard title="Platform raporu" subtitle="Kanal / platform baz?nda satışlar">
          <MiniBars
            rows={data.platformRows}
            valueKey="sales"
            labelKey="platformName"
            color="#0f766e"
            formatter={value => `₺${formatMoney(value)}`}
            emptyMessage="Platform verisi bulunamadı"
          />
        </SectionCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <SectionCard title="Kullan?c? analizi" subtitle="Kasiyer / kullan?c? bazlı hareket Özeti">
          <Table
            rows={data.cashierRows.map(row => ({ ...row, id: row.cashierName }))}
            columns={[
              { key: 'cashierName', label: 'Kullan?c?' },
              { key: 'receipts', label: 'Fiş', align: 'right', render: row => formatNumber(row.receipts) },
              { key: 'sales', label: 'Satış', align: 'right', render: row => `₺${formatMoney(row.sales)}` },
            ]}
            emptyMessage="Kullan?c? verisi bulunamadı"
          />
        </SectionCard>

        <SectionCard title="M??teri analizi" subtitle="M??teri kart? dolu işlemlerden t?retildi">
          <Table
            rows={data.customerRows.map(row => ({ ...row, id: row.customerName }))}
            columns={[
              { key: 'customerName', label: 'M??teri' },
              { key: 'receipts', label: 'Fiş', align: 'right', render: row => formatNumber(row.receipts) },
              { key: 'sales', label: 'Satış', align: 'right', render: row => `₺${formatMoney(row.sales)}` },
            ]}
            emptyMessage="M??teri bazlı kayıt bulunamadı"
          />
        </SectionCard>
      </div>

      <SectionCard title="Detay tablosu" subtitle="En güncel satış sat?rlar?">
        <Table
          rows={data.detailRows.map(row => ({ ...row, id: row.id }))}
          columns={[
            { key: 'sale_datetime', label: 'Tarih', render: row => formatDateTime(row.sale_datetime) },
            { key: 'branch_name', label: 'Şube' },
            { key: 'sales_channel_name', label: 'Platform', render: row => row.sales_channel_name || 'Diğer' },
            { key: 'payment_total', label: 'Gelir', align: 'right', render: row => `₺${formatMoney(row.payment_total)}` },
            { key: 'cost_total', label: 'Maliyet', align: 'right', render: row => `₺${formatMoney(row.cost_total)}` },
          ]}
          emptyMessage="Detay sat?r? bulunamadı"
        />
      </SectionCard>
    </div>
  )
}

export default function Reports({ scopeVariant = 'center', initialTab = 'overview' }) {
  const toast = useToast()
  const { branchId: workspaceBranchId, branches: workspaceBranches } = useWorkspace()

  const [activeTab, setActiveTab] = useState(initialTab)
  const [preset, setPreset] = useState('today')
  const [branches, setBranches] = useState([])
  const [branchTemplates, setBranchTemplates] = useState([])
  const [metaLoading, setMetaLoading] = useState(true)
  const [salesCategoryFilter, setSalesCategoryFilter] = useState('')
  const [filters, setFilters] = useState(() => {
    const range = createDateRange('today')
    return {
      ...range,
      branchMode: scopeVariant === 'branch' ? 'branch' : 'all',
      branchId: workspaceBranchId || '',
      templateId: '',
    }
  })
  const [tabStates, setTabStates] = useState({
    overview: { ...EMPTY_TAB_STATE },
    sales: { ...EMPTY_TAB_STATE },
    product_mix: { ...EMPTY_TAB_STATE },
    inventory: { ...EMPTY_TAB_STATE },
    advanced: { ...EMPTY_TAB_STATE },
  })
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    let ignore = false

    ;(async () => {
      setMetaLoading(true)

      try {
        const requests = [
          db.from('branch_templates').select('*').is('deleted_at', null).order('name'),
        ]

        if (!workspaceBranches.length) {
          requests.push(
            db.from('settings').select('value').eq('key', 'company_tree').single(),
          )
        }

        const results = await Promise.all(requests)
        const [templatesResult, settingsResult] = results

        if (templatesResult.error) throw templatesResult.error

        const resolvedBranches = workspaceBranches.length
          ? workspaceBranches
          : getAllBranches(parseJsonValue(settingsResult?.data?.value, []))

        if (ignore) return

        setBranchTemplates(templatesResult.data || [])
        setBranches(resolvedBranches)
        setFilters(current => ({
          ...current,
          branchId: current.branchId || workspaceBranchId || resolvedBranches[0]?.id || '',
        }))
      } catch (error) {
        if (!ignore) {
          toast(`Rapor se?im bilgileri üklenemedi: ${error.message}`, 'error')
          setBranchTemplates([])
          setBranches(workspaceBranches || [])
        }
      } finally {
        if (!ignore) setMetaLoading(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [toast, workspaceBranches, workspaceBranchId])

  useEffect(() => {
    if (scopeVariant !== 'branch' || !workspaceBranchId) return
    setFilters(current => (
      current.branchId === workspaceBranchId && current.branchMode === 'branch'
        ? current
        : { ...current, branchMode: 'branch', branchId: workspaceBranchId }
    ))
  }, [scopeVariant, workspaceBranchId])

  const selection = useMemo(() => buildSelection({
    scopeVariant,
    branches,
    branchTemplates,
    branchMode: filters.branchMode,
    branchId: filters.branchId,
    templateId: filters.templateId,
    workspaceBranchId,
  }), [
    branchTemplates,
    branches,
    filters.branchId,
    filters.branchMode,
    filters.templateId,
    scopeVariant,
    workspaceBranchId,
  ])

  useEffect(() => {
    setSalesCategoryFilter('')
  }, [selection.key, filters.dateFrom, filters.dateTo])

  const activeTabState = tabStates[activeTab] || EMPTY_TAB_STATE

  useEffect(() => {
    if (metaLoading) return
    if (!selection.branchNames.length) return
    if (filters.dateFrom > filters.dateTo) return

    const signature = [
      activeTab,
      selection.key,
      filters.dateFrom,
      filters.dateTo,
    ].join('|')

    if (activeTabState.signature === signature && (activeTabState.data || activeTabState.loading)) {
      return
    }

    let ignore = false

    setTabStates(current => ({
      ...current,
      [activeTab]: {
        signature,
        loading: true,
        error: '',
        data: null,
      },
    }))

    ;(async () => {
      try {
        let data = null

        if (activeTab === 'overview') {
          const [salesRows, lineRows] = await Promise.all([
            fetchSalesRows({
              branchNames: selection.branchNames,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }),
            fetchSaleLineRows({
              branchNames: selection.branchNames,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }),
          ])
          data = buildOverviewData(selection, salesRows, lineRows, filters.dateFrom, filters.dateTo)
        }

        if (activeTab === 'sales') {
          const [salesRows, lineRows] = await Promise.all([
            fetchSalesRows({
              branchNames: selection.branchNames,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }),
            fetchSaleLineRows({
              branchNames: selection.branchNames,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }),
          ])
          data = buildSalesData(selection, salesRows, lineRows, filters.dateFrom, filters.dateTo)
        }

        if (activeTab === 'product_mix') {
          const [salesRows, lineRows] = await Promise.all([
            fetchSalesRows({
              branchNames: selection.branchNames,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }),
            fetchSaleLineRows({
              branchNames: selection.branchNames,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
            }),
          ])
          data = buildProductMixData(selection, salesRows, lineRows, filters.dateFrom, filters.dateTo)
        }

        if (activeTab === 'inventory') {
          const inventoryResult = await fetchInventoryRows({
            branches: selection.branches,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          })
          data = buildInventoryData(
            selection,
            inventoryResult.rows,
            filters.dateFrom,
            filters.dateTo,
            { truncatedBranches: inventoryResult.truncatedBranches },
          )
        }

        if (activeTab === 'advanced') {
          const salesRows = await fetchSalesRows({
            branchNames: selection.branchNames,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          })
          const paymentRows = await fetchPaymentRows({
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
          })
          data = buildAdvancedData(selection, salesRows, paymentRows, filters.dateFrom, filters.dateTo)
        }

        if (ignore) return

        setTabStates(current => ({
          ...current,
          [activeTab]: {
            signature,
            loading: false,
            error: '',
            data,
          },
        }))
      } catch (error) {
        if (ignore) return

        setTabStates(current => ({
          ...current,
          [activeTab]: {
            signature,
            loading: false,
            error: error.message || 'Bilinmeyen hata',
            data: null,
          },
        }))
      }
    })()

    return () => {
      ignore = true
    }
  }, [
    activeTab,
    filters.dateFrom,
    filters.dateTo,
    metaLoading,
    reloadTick,
    scopeVariant,
    selection,
  ])

  function handlePresetChange(nextPreset) {
    const range = createDateRange(nextPreset)
    setPreset(nextPreset)
    setFilters(current => ({ ...current, ...range }))
  }

  function handleFilterChange(key, value) {
    setPreset('custom')
    setFilters(current => {
      const next = { ...current, [key]: value }

      if (key === 'branchMode') {
        if (value === 'branch') {
          next.branchId = next.branchId || branches[0]?.id || ''
        }
        if (value === 'template') {
          next.templateId = next.templateId || ''
        }
      }

      return next
    })
  }

  function retryActiveTab() {
    setTabStates(current => ({
      ...current,
      [activeTab]: { ...EMPTY_TAB_STATE },
    }))
    setReloadTick(current => current + 1)
  }

  const currentState = activeTabState
  const pageTitle = scopeVariant === 'center' ? 'Raporlar' : 'Şube Raporlar?'
  const pageSubtitle = scopeVariant === 'center'
    ? 'Tek Şube, t?m Şubeler veya Şube Şablonu baz?nda konsolide raporlar'
    : 'Şube bağlamına kilitli rapor ekran?'

  return (
    <div className="page-enter">
      <Header title={pageTitle} subtitle={pageSubtitle} />

      <ReportsFilters
        scopeVariant={scopeVariant}
        branches={branches}
        branchTemplates={branchTemplates}
        branchMode={filters.branchMode}
        branchId={filters.branchId}
        templateId={filters.templateId}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        preset={preset}
        selectionLabel={selection.label}
        onPresetChange={handlePresetChange}
        onFilterChange={handleFilterChange}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {TAB_OPTIONS.map(item => (
          <ReportTabButton
            key={item.key}
            active={activeTab === item.key}
            icon={item.icon}
            label={item.label}
            onClick={() => setActiveTab(item.key)}
          />
        ))}
      </div>

      {metaLoading ? <LoadingState label="Rapor mod?l? hazırlanıyor..." /> : null}

      {!metaLoading && !selection.branchNames.length ? (
        <EmptyState
          title="Raporlanacak Şube bulunamadı"
          subtitle="?irket kurulu?u veya Şube Şablonu kayıtlar?n? kontrol edin."
        />
      ) : null}

      {!metaLoading && selection.branchNames.length && filters.dateFrom > filters.dateTo ? (
        <InlineNotice tone="warning">
          Başlangıç tarihi, biti? tarihinden b?y?k olamaz.
        </InlineNotice>
      ) : null}

      {!metaLoading && selection.branchNames.length && filters.dateFrom <= filters.dateTo ? (
        <>
          {currentState.loading ? <LoadingState /> : null}
          {!currentState.loading && currentState.error ? (
            <ErrorState message={currentState.error} onRetry={retryActiveTab} />
          ) : null}
          {!currentState.loading && !currentState.error && activeTab === 'overview' ? (
            <OverviewTab data={currentState.data} />
          ) : null}
          {!currentState.loading && !currentState.error && activeTab === 'sales' ? (
            <SalesTab
              data={currentState.data}
              selectedCategory={salesCategoryFilter}
              onCategoryChange={setSalesCategoryFilter}
            />
          ) : null}
          {!currentState.loading && !currentState.error && activeTab === 'product_mix' ? (
            <ProductMixTab data={currentState.data} />
          ) : null}
          {!currentState.loading && !currentState.error && activeTab === 'inventory' ? (
            <InventoryTab data={currentState.data} />
          ) : null}
          {!currentState.loading && !currentState.error && activeTab === 'advanced' ? (
            <AdvancedTab data={currentState.data} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

