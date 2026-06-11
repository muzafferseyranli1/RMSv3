import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import { readForecastSettings } from '@/lib/forecastSettings'
import { useToast } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import { isBranchScopedScope } from '@/lib/workspace'
import {
  ORDER_STATUS_META,
  ORDER_TAB_DEFS,
  addDays,
  applyBranchFilter,
  asUuidOrNull,
  branchMatchesRecord,
  buildForecastCoverageSummary,
  buildBalanceMap,
  buildContractPriceMap,
  buildInventoryBalanceRows,
  buildLatestPurchasePriceMap,
  computeCoverageDays,
  computeSuggestedQuantity,
  describeCutoffBehavior,
  findBranchById,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  getAllBranches,
  getFlowDates,
  getOrderWarnings,
  getStoredBranchId,
  isBranchIncluded,
  isFlowDueOnDate,
  nextDocumentNo,
  parseJsonValue,
  resolveWarehouseTransferPrice,
  roundOrderQuantity,
  resolveBranchLineSupplierId,
  resolveFlowItems,
  stockItemHasInternalWarehouseSupplier,
  summarizeLines,
  todayStr,
  resolveSelectionIds,
} from '@/lib/branchPurchasing'
import { calculateWarehouseDemand } from '@/lib/warehouseDemandPlanning'

function OrderTabBar({ activeTab, onChange, counts }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {ORDER_TAB_DEFS.map(tab => {
        const active = activeTab === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{
              border: `1.5px solid ${active ? '#6366f1' : '#e2e8f0'}`,
              background: active ? '#eef2ff' : '#fff',
              color: active ? '#4338ca' : '#475569',
              borderRadius: 999,
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: '.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {tab.label}
            <span style={{
              minWidth: 22,
              height: 22,
              padding: '0 6px',
              borderRadius: 999,
              background: active ? '#6366f1' : '#f1f5f9',
              color: active ? '#fff' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '.72rem',
            }}>
              {counts[tab.key] || 0}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SummaryCard({ label, value, hint, color, bg }) {
  return (
    <div style={{ padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', background: bg || '#fff' }}>
      <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.18rem', fontWeight: 800, color: color || '#0f172a', marginTop: 6 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: '.76rem', color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Badge({ meta }) {
  const safe = meta || ORDER_STATUS_META.pending_action
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '3px 10px',
      borderRadius: 999,
      background: safe.bg,
      color: safe.color,
      fontSize: '.74rem',
      fontWeight: 700,
    }}>
      {safe.label}
    </span>
  )
}

function getSupplierNotes(order) {
  const meta = parseJsonValue(order?.meta, {})
  const list = Array.isArray(meta?.supplier_notes) ? meta.supplier_notes.filter(Boolean) : []
  return list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')))
}

const DEMAND_METHOD_LABELS = {
  recipe_forecast: 'Recete tahmini',
  usage_average: 'Kullanim ortalamasi',
  stock_topup: 'Stok tamamlama',
  repeat_last_order: 'Son siparis',
  manual: 'Manuel',
}

function getDemandMethodLabel(method) {
  return DEMAND_METHOD_LABELS[method] || method || '-'
}

function buildReceivedQtyByOrderLine(receiptLines = []) {
  return receiptLines.reduce((map, line) => {
    if (!line?.order_line_id) return map
    map.set(line.order_line_id, (map.get(line.order_line_id) || 0) + Number(line.received_qty || 0))
    return map
  }, new Map())
}

function buildLastOrderQtyMap(allOrders, allLines, flowId, branch, excludeOrderId = '') {
  const candidateIds = allOrders
    .filter(order =>
      order.id !== excludeOrderId &&
      order.flow_id === flowId &&
      branchMatchesRecord(order, branch) &&
      order.status !== 'cancelled'
    )
    .sort((a, b) => {
      const dateDiff = String(b.order_date || '').localeCompare(String(a.order_date || ''))
      if (dateDiff !== 0) return dateDiff
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
    .map(order => order.id)

  const result = new Map()
  for (const orderId of candidateIds) {
    for (const line of allLines.filter(row => row.order_id === orderId)) {
      if (line.stock_item_id && !result.has(line.stock_item_id)) {
        result.set(line.stock_item_id, Number(line.ordered_qty || 0))
      }
    }
  }
  return result
}

function stockVisibleInBranch(item, branchId) {
  const locations = parseJsonValue(item?.location, [])
  if (!locations.length) return true
  return isBranchIncluded(locations, branchId)
}

const PAGE_SIZE = 1000
const STANDARD_PORTION_ID = '__standart__'
const PRODUCTIVITY_DISPLAY_RECEIPT_BASE = 1000
const COUNT_MOVEMENT_TYPES = new Set(['stock_count_gain', 'stock_count_loss'])
const STOCK_DAILY_USAGE_MOVEMENT_TYPES = new Set([
  'sale_consumption',
  'waste_consumption',
  'production_consumption',
  'manual_adjustment_out',
])

function normalizeBranchAlias(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildBranchNameAliases(...values) {
  const aliases = new Set()

  for (const value of values.flat()) {
    const normalized = normalizeBranchAlias(value)
    if (!normalized) continue

    aliases.add(normalized)

    const withoutSuffix = normalized.replace(/\s+Şubesi$/i, '').trim()
    if (withoutSuffix && withoutSuffix !== normalized) {
      aliases.add(withoutSuffix)

      const parts = withoutSuffix.split(/\s+/)
      if (parts.length > 1) aliases.add(parts.slice(1).join(' '))
    }
  }

  return [...aliases].filter(Boolean)
}

async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) throw error
    const chunk = data || []
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

function toDateOnly(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    if (value.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value
    }
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentLocalHour() {
  return new Date().getHours()
}

function getDayIndex(dateStr) {
  const safe = toDateOnly(dateStr)
  if (!safe) return -1
  const day = new Date(`${safe}T00:00:00`).getDay()
  return (day + 6) % 7
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeLookupKey(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePortionValue(value, fallback = STANDARD_PORTION_ID) {
  const normalized = value == null ? '' : String(value).trim()
  return normalized || fallback
}

function resolvePortionMeta(item, portionId, fallbackName = '') {
  const normalizedPortionId = normalizePortionValue(portionId, STANDARD_PORTION_ID)
  const portions = parseJsonValue(item?.portions, []).filter(Boolean)
  const matchedPortion = portions.find(entry => String(entry?.id || '').trim() === normalizedPortionId) || null

  if (normalizedPortionId === STANDARD_PORTION_ID) {
    return {
      portionId: normalizedPortionId,
      portionName: fallbackName || 'Standart',
    }
  }

  return {
    portionId: normalizedPortionId,
    portionName: matchedPortion?.name || fallbackName || normalizedPortionId,
  }
}

function buildPortionMatchCandidates(item, portionId, portionName = '') {
  const candidates = new Set()
  const addCandidate = value => {
    if (value == null) return
    const normalized = String(value).trim()
    if (!normalized) return
    candidates.add(normalizePortionValue(normalized, STANDARD_PORTION_ID))
  }

  addCandidate(portionId)
  addCandidate(portionName)

  const portions = parseJsonValue(item?.portions, []).filter(Boolean)
  const normalizedPortionId = normalizePortionValue(portionId, STANDARD_PORTION_ID)
  const normalizedPortionName = portionName == null ? '' : String(portionName).trim()
  const matchedById = portions.find(entry => normalizePortionValue(entry?.id, STANDARD_PORTION_ID) === normalizedPortionId) || null
  const matchedByName = portions.find(entry => String(entry?.name || '').trim() === normalizedPortionName) || null

  addCandidate(matchedById?.name)
  addCandidate(matchedByName?.id)

  return candidates
}

function recipeRowMatchesPortion(recipeRow, portionId, portionName = '', item = null) {
  const selectedCandidates = buildPortionMatchCandidates(item, portionId, portionName)
  const rowPortions = Array.isArray(recipeRow?.portions)
    ? recipeRow.portions.map(value => normalizePortionValue(value, STANDARD_PORTION_ID)).filter(Boolean)
    : []

  if (rowPortions.length > 0) {
    return rowPortions.some(value => selectedCandidates.has(value))
  }

  const rawPortion = recipeRow?.portion_id ?? recipeRow?.portionId ?? recipeRow?.sale_item_portion_id ?? recipeRow?.portion_code ?? recipeRow?.portion_name ?? recipeRow?.portionName
  if (!rawPortion) return true

  return selectedCandidates.has(normalizePortionValue(rawPortion, STANDARD_PORTION_ID))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function weightedAverage(values, weights) {
  if (!values.length || values.length !== weights.length) return null

  let weightedTotal = 0
  let weightTotal = 0

  for (let index = 0; index < values.length; index += 1) {
    const value = safeNumber(values[index], null)
    const weight = safeNumber(weights[index], null)
    if (value == null || weight == null || weight <= 0) continue
    weightedTotal += value * weight
    weightTotal += weight
  }

  return weightTotal > 0 ? weightedTotal / weightTotal : null
}

function diffDaysLocal(fromDate, toDate) {
  const from = toDateOnly(fromDate)
  const to = toDateOnly(toDate)
  if (!from || !to) return 0
  const ms = new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()
  return Math.round(ms / 86400000)
}

function resolveOutMovementQty(row) {
  const signedQty = safeNumber(row?.quantity_signed, null)
  if (signedQty != null && signedQty < 0) return Math.abs(signedQty)

  const direction = String(row?.direction || '').trim().toLowerCase()
  if (direction === 'out') return Math.max(safeNumber(row?.quantity), 0)

  return 0
}

function buildInclusiveDates(startDate, endDate) {
  const safeStart = toDateOnly(startDate)
  const safeEnd = toDateOnly(endDate)
  if (!safeStart || !safeEnd || safeEnd < safeStart) return []

  const totalDays = diffDaysLocal(safeStart, safeEnd)
  return Array.from({ length: totalDays + 1 }, (_, index) => addDays(safeStart, index))
}

function collectSameWeekdayDailyRows(dailyRows, targetDate, lookbackWeeks) {
  const minDate = addDays(targetDate, -(Math.max(lookbackWeeks, 1) * 7 + 1))
  return (dailyRows || [])
    .filter(row => {
      const saleDate = toDateOnly(row.sale_date)
      return saleDate && saleDate < targetDate && saleDate >= minDate && getDayIndex(saleDate) === getDayIndex(targetDate)
    })
    .sort((left, right) => String(left.sale_date || '').localeCompare(String(right.sale_date || '')))
}

function computeReceiptForecast(samples, targetDate) {
  if (!samples.length) return null

  const weights = samples.map((_, index) => index + 1)
  const receiptValues = samples.map(row => safeNumber(row.receipt_count))
  const weightedReceipts = weightedAverage(receiptValues, weights)
  if (weightedReceipts == null) return null

  const firstSample = samples[0]
  const lastSample = samples[samples.length - 1]
  const trendPerWeek = samples.length > 1
    ? (safeNumber(lastSample.receipt_count) - safeNumber(firstSample.receipt_count)) / (samples.length - 1)
    : 0
  const weeksAhead = Math.max(1, Math.round(diffDaysLocal(lastSample.sale_date, targetDate) / 7))
  const trendAdjustment = clamp(
    trendPerWeek * weeksAhead * 0.35,
    -weightedReceipts * 0.18,
    weightedReceipts * 0.18,
  )

  return Math.max(0, Math.round(weightedReceipts + trendAdjustment))
}

function buildActualMixByDate(lineRows) {
  const byDate = new Map()

  for (const row of lineRows || []) {
    const saleDate = toDateOnly(row.sale_datetime)
    if (!saleDate) continue

    const productId = row.product_id || row.product_name
    if (!productId) continue
    const portionId = normalizePortionValue(row.portion_id, STANDARD_PORTION_ID)
    const productKey = `${productId}::${portionId}`

    const currentDateMap = byDate.get(saleDate) || new Map()
    const current = currentDateMap.get(productKey) || {
      productId,
      portionId,
      portionName: row.portion_name || (portionId === STANDARD_PORTION_ID ? 'Standart' : portionId),
      productName: row.product_name || 'Urun',
      qty: 0,
    }

    current.qty += safeNumber(row.qty)
    currentDateMap.set(productKey, current)
    byDate.set(saleDate, currentDateMap)
  }

  const normalized = new Map()
  for (const [saleDate, productMap] of byDate.entries()) {
    normalized.set(saleDate, [...productMap.values()])
  }
  return normalized
}

function buildProductivityCatalog(saleItems, actualMixByDate) {
  const byId = new Map()
  const byName = new Map()
  const fallback = new Map()
  const items = []

  for (const item of saleItems || []) {
    const estimatedProductivity = safeNumber(item?.substitute_id, null)
    const meta = {
      productId: item.id,
      productName: item.short_name || item.name || 'Urun',
      estimatedProductivity: estimatedProductivity != null && estimatedProductivity > 0 ? estimatedProductivity : null,
      saleItem: item,
    }
    items.push(meta)
    if (item?.id) byId.set(String(item.id), meta)
    const nameKey = normalizeLookupKey(item?.short_name || item?.name)
    if (nameKey && !byName.has(nameKey)) byName.set(nameKey, meta)
  }

  for (const items of actualMixByDate.values()) {
    for (const item of items) {
      const current = fallback.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        qty: 0,
      }
      current.qty += safeNumber(item.qty)
      fallback.set(item.productId, current)
    }
  }

  for (const [productId, item] of fallback.entries()) {
    const current = byId.get(String(productId))
      || byName.get(normalizeLookupKey(item.productName))
      || {
        productId,
        productName: item.productName,
        estimatedProductivity: null,
        saleItem: null,
      }
    current.productName = current.productName || item.productName
    if (!byId.has(String(productId))) byId.set(String(productId), current)
  }

  return { byId, byName, items }
}

function buildDirectStockCatalog(stockItems) {
  const byId = new Map()
  const byName = new Map()
  const items = []

  for (const item of stockItems || []) {
    if (!item?.id) continue
    items.push(item)
    byId.set(String(item.id), item)

    const keys = [
      normalizeLookupKey(item.name),
      normalizeLookupKey(item.short_name),
      normalizeLookupKey(item.sku),
    ].filter(Boolean)

    for (const key of keys) {
      if (!byName.has(key)) byName.set(key, item)
    }
  }

  return { byId, byName, items }
}

function resolveProductivityMeta(catalog, productId, productName) {
  if (!catalog) return null
  return catalog.byId.get(String(productId || ''))
    || catalog.byName.get(normalizeLookupKey(productName))
    || null
}

function buildMixProjection(samples, actualMixByDate, productivityCatalog, receiptCount) {
  if (receiptCount <= 0) return []

  const aggregated = new Map()
  let receiptsWithMix = 0

  for (const sample of samples) {
    const sampleMix = actualMixByDate.get(sample.sale_date) || []
    const sampleReceipts = safeNumber(sample.receipt_count)
    if (!sampleMix.length || sampleReceipts <= 0) continue

    receiptsWithMix += sampleReceipts
    for (const item of sampleMix) {
      const current = aggregated.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        qty: 0,
        portions: new Map(),
      }
      current.qty += safeNumber(item.qty)
      const portionId = normalizePortionValue(item.portionId, STANDARD_PORTION_ID)
      const currentPortion = current.portions.get(portionId) || {
        portionId,
        portionName: item.portionName || (portionId === STANDARD_PORTION_ID ? 'Standart' : portionId),
        qty: 0,
      }
      currentPortion.qty += safeNumber(item.qty)
      current.portions.set(portionId, currentPortion)
      aggregated.set(item.productId, current)
    }
  }

  const items = [...aggregated.values()].map(item => {
    const meta = resolveProductivityMeta(productivityCatalog, item.productId, item.productName)
    const productivityPerReceipt = receiptsWithMix > 0 ? item.qty / receiptsWithMix : 0
    const forecastQty = productivityPerReceipt * receiptCount
    const portionMix = [...item.portions.values()]
      .filter(portion => portion.qty > 0)
      .map(portion => ({
        portionId: portion.portionId,
        portionName: portion.portionName,
        share: item.qty > 0 ? portion.qty / item.qty : 0,
        forecastQty: item.qty > 0 ? (portion.qty / item.qty) * forecastQty : 0,
      }))

    return {
      productId: item.productId,
      productName: meta?.productName || item.productName,
      forecastQty,
      portionMix: portionMix.length
        ? portionMix
        : [{
            portionId: STANDARD_PORTION_ID,
            portionName: 'Standart',
            share: 1,
            forecastQty,
          }],
      saleItem: meta?.saleItem || null,
    }
  })

  for (const meta of productivityCatalog.items) {
    if (!meta?.estimatedProductivity || items.some(item => item.productId === meta.productId)) continue
    items.push({
      productId: meta.productId,
      productName: meta.productName,
      forecastQty: (meta.estimatedProductivity / 1000) * receiptCount,
      portionMix: [{
        portionId: STANDARD_PORTION_ID,
        portionName: 'Standart',
        share: 1,
        forecastQty: (meta.estimatedProductivity / 1000) * receiptCount,
      }],
      saleItem: meta.saleItem || null,
    })
  }

  return items.filter(item => item.forecastQty > 0.0001)
}

function createSaleItemMixKey(productId, portionId = STANDARD_PORTION_ID) {
  return `sale_item:${String(productId || '').trim()}:${normalizePortionValue(portionId)}`
}

function createOptionMixKey(optionId, optionName = '') {
  const normalizedId = String(optionId || '').trim()
  if (normalizedId) return `sale_option:${normalizedId}`

  const nameKey = normalizeLookupKey(optionName)
  return nameKey ? `sale_option_name:${nameKey}` : ''
}

function buildDetailedActualMixByDate(lineRows) {
  const byDate = new Map()

  for (const row of lineRows || []) {
    const saleDate = toDateOnly(row.sale_datetime)
    if (!saleDate) continue

    const quantity = safeNumber(row.qty)
    if (quantity <= 0) continue

    if (!byDate.has(saleDate)) byDate.set(saleDate, new Map())
    const currentDateMap = byDate.get(saleDate)

    const productId = row.product_id || row.product_name
    if (productId) {
      const portionId = normalizePortionValue(row.portion_id, STANDARD_PORTION_ID)
      const itemKey = createSaleItemMixKey(productId, portionId)
      const current = currentDateMap.get(itemKey) || {
        itemKey,
        itemType: 'sale_item',
        productId,
        optionId: null,
        portionId,
        portionName: row.portion_name || (portionId === STANDARD_PORTION_ID ? 'Standart' : portionId),
        productName: row.product_name || 'Urun',
        qty: 0,
      }

      current.qty += quantity
      currentDateMap.set(itemKey, current)
    }

    const parsedOptions = parseJsonValue(row.options_json, [])
    const selectedOptions = Array.isArray(parsedOptions) ? parsedOptions : []
    for (const option of selectedOptions) {
      const itemKey = createOptionMixKey(option?.id, option?.name)
      if (!itemKey) continue

      const current = currentDateMap.get(itemKey) || {
        itemKey,
        itemType: 'sale_option',
        productId: null,
        optionId: option?.id || null,
        portionId: null,
        portionName: null,
        productName: option?.name || 'Secenek',
        qty: 0,
      }

      current.qty += quantity
      currentDateMap.set(itemKey, current)
    }

    byDate.set(saleDate, currentDateMap)
  }

  const normalized = new Map()
  for (const [saleDate, itemMap] of byDate.entries()) {
    normalized.set(saleDate, [...itemMap.values()])
  }
  return normalized
}

function buildForecastEntityCatalog(saleItems, saleOptions, actualMixByDate) {
  const byKey = new Map()
  const entries = []
  const entryKeys = new Set()

  function registerEntry(itemKey, entry, aliases = []) {
    if (!itemKey) return

    const safeEntry = {
      ...entry,
      itemKey: entry.itemKey || itemKey,
    }

    if (!entryKeys.has(safeEntry.itemKey)) {
      entries.push(safeEntry)
      entryKeys.add(safeEntry.itemKey)
    }

    for (const alias of [itemKey, ...aliases]) {
      if (alias) byKey.set(alias, safeEntry)
    }
  }

  for (const item of saleItems || []) {
    const baseName = item?.short_name || item?.name || 'Urun'
    const estimatedProductivity = safeNumber(item?.substitute_id, null)
    const portionMap = new Map()

    for (const portion of parseJsonValue(item?.portions, []).filter(Boolean)) {
      const portionMeta = resolvePortionMeta(item, portion?.id, portion?.name)
      const portionId = portionMeta.portionId
      if (!portionId || portionId === STANDARD_PORTION_ID) continue
      portionMap.set(portionId, portionMeta.portionName)
    }

    for (const recipeRow of parseJsonValue(item?.recipe_rows, []).filter(Boolean)) {
      const rowPortions = Array.isArray(recipeRow?.portions) && recipeRow.portions.length
        ? recipeRow.portions
        : [recipeRow?.portion_id ?? recipeRow?.portionId ?? recipeRow?.sale_item_portion_id ?? recipeRow?.portion_code ?? recipeRow?.portion_name ?? recipeRow?.portionName]

      for (const rawPortion of rowPortions) {
        const portionMeta = resolvePortionMeta(item, rawPortion, recipeRow?.portion_name || recipeRow?.portionName)
        const portionId = portionMeta.portionId
        if (!portionId || portionId === STANDARD_PORTION_ID) continue
        const portionName = portionMap.get(portionId) || portionMeta.portionName
        portionMap.set(portionId, portionName)
      }
    }

    registerEntry(createSaleItemMixKey(item?.id, STANDARD_PORTION_ID), {
      itemType: 'sale_item',
      productId: item?.id || null,
      optionId: null,
      portionId: STANDARD_PORTION_ID,
      portionName: 'Standart',
      productName: baseName,
      estimatedProductivity: estimatedProductivity != null && estimatedProductivity > 0 ? estimatedProductivity : null,
      entity: item,
    })

    for (const [portionId, portionName] of portionMap.entries()) {
      registerEntry(createSaleItemMixKey(item?.id, portionId), {
        itemType: 'sale_item',
        productId: item?.id || null,
        optionId: null,
        portionId,
        portionName,
        productName: baseName,
        estimatedProductivity: null,
        entity: item,
      }, portionName && normalizePortionValue(portionName, STANDARD_PORTION_ID) !== portionId
        ? [createSaleItemMixKey(item?.id, portionName)]
        : [])
    }
  }

  for (const option of saleOptions || []) {
    const estimatedProductivity = safeNumber(option?.substitute_id, null)
    registerEntry(createOptionMixKey(option?.id, option?.name), {
      itemType: 'sale_option',
      productId: null,
      optionId: option?.id || null,
      portionId: null,
      portionName: null,
      productName: option?.short_name || option?.name || 'Secenek',
      estimatedProductivity: estimatedProductivity != null && estimatedProductivity > 0 ? estimatedProductivity : null,
      entity: option,
    }, [createOptionMixKey(null, option?.name)])
  }

  for (const items of actualMixByDate.values()) {
    for (const item of items) {
      if (byKey.has(item.itemKey)) continue

      registerEntry(item.itemKey, {
        itemType: item.itemType,
        productId: item.productId || null,
        optionId: item.optionId || null,
        portionId: item.portionId || null,
        portionName: item.portionName || null,
        productName: item.productName || 'Urun',
        estimatedProductivity: null,
        entity: null,
      })
    }
  }

  return { byKey, entries }
}

function buildDetailedMixProjection(samples, actualMixByDate, entityCatalog, receiptCount) {
  if (receiptCount <= 0) return []

  const aggregated = new Map()
  let receiptsWithMix = 0

  for (const sample of samples) {
    const sampleMix = actualMixByDate.get(sample.sale_date) || []
    const sampleReceipts = safeNumber(sample.receipt_count)
    if (!sampleMix.length || sampleReceipts <= 0) continue

    receiptsWithMix += sampleReceipts
    for (const item of sampleMix) {
      const current = aggregated.get(item.itemKey) || {
        ...item,
        qty: 0,
      }
      current.qty += safeNumber(item.qty)
      aggregated.set(item.itemKey, current)
    }
  }

  const items = [...aggregated.values()].map(item => {
    const meta = entityCatalog?.byKey?.get(item.itemKey) || {}
    const productivityPerReceipt = receiptsWithMix > 0 ? item.qty / receiptsWithMix : 0
    const forecastQty = productivityPerReceipt * receiptCount

    return {
      ...meta,
      ...item,
      forecastQty,
      productivityPer1000Receipts: productivityPerReceipt * PRODUCTIVITY_DISPLAY_RECEIPT_BASE,
    }
  })

  for (const meta of entityCatalog?.entries || []) {
    if (!meta?.estimatedProductivity || items.some(item => item.itemKey === meta.itemKey)) continue
    items.push({
      ...meta,
      forecastQty: (meta.estimatedProductivity / PRODUCTIVITY_DISPLAY_RECEIPT_BASE) * receiptCount,
      productivityPer1000Receipts: meta.estimatedProductivity,
    })
  }

  return items.filter(item => item.forecastQty > 0.0001)
}

function buildForecastRecipeUsage({
  horizonDates,
  dailySalesRows,
  savedForecastRows,
  saleLineRows,
  saleItems,
  saleOptions,
  stockItems,
  lookbackWeeks,
  forecastRatio,
}) {
  const actualMixByDate = buildDetailedActualMixByDate(saleLineRows)
  const entityCatalog = buildForecastEntityCatalog(saleItems, saleOptions, actualMixByDate)
  const directStockCatalog = buildDirectStockCatalog(stockItems)
  const savedForecastMap = new Map(
    (savedForecastRows || [])
      .filter(row => row?.forecast_date)
      .map(row => [toDateOnly(row.forecast_date), row]),
  )
  const usageByStockId = new Map()
  const detailsByStockId = new Map()
  let usedForecastDays = 0
  let usedRecipeRows = false
  let usedDirectMatch = false
  let mixDaysWithItems = 0
  let projectedEntityCount = 0
  let usedOptionRows = false

  function pushUsageDetail(stockItemId, detail) {
    const key = String(stockItemId || '').trim()
    if (!key) return
    const current = detailsByStockId.get(key) || []
    current.push(detail)
    detailsByStockId.set(key, current)
  }

  for (const dateStr of horizonDates) {
    const samples = collectSameWeekdayDailyRows(dailySalesRows, dateStr, lookbackWeeks)
    const saved = savedForecastMap.get(dateStr)
    const effectiveReceiptCount = saved?.adj_receipt_count != null
      ? safeNumber(saved.adj_receipt_count)
      : saved?.calc_receipt_count != null
        ? safeNumber(saved.calc_receipt_count)
        : computeReceiptForecast(samples, dateStr)

    if (!effectiveReceiptCount || effectiveReceiptCount <= 0) continue
    usedForecastDays += 1

    const mixItems = buildDetailedMixProjection(samples, actualMixByDate, entityCatalog, effectiveReceiptCount)
    if (mixItems.length > 0) {
      mixDaysWithItems += 1
      projectedEntityCount += mixItems.length
    }
    for (const mixItem of mixItems) {
      const sourceEntity = mixItem.entity || null
      const recipeRows = parseJsonValue(sourceEntity?.recipe_rows, [])
      const outputQty = safeNumber(sourceEntity?.recipe_output_qty, 1)
      const effectivePortions = mixItem.itemType === 'sale_item'
        ? [{
            portionId: normalizePortionValue(mixItem.portionId, STANDARD_PORTION_ID),
            forecastQty: mixItem.forecastQty,
          }]
        : [{
            portionId: STANDARD_PORTION_ID,
            forecastQty: mixItem.forecastQty,
          }]

      if (recipeRows.length && outputQty > 0) {
        for (const portion of effectivePortions) {
          const portionForecastQty = safeNumber(portion.forecastQty)
          if (portionForecastQty <= 0) continue

          const matchedRows = recipeRows.filter(recipeRow => recipeRowMatchesPortion(
            recipeRow,
            portion.portionId,
            mixItem.portionName,
            sourceEntity,
          ))
          for (const recipeRow of matchedRows) {
            if (!recipeRow?.stock_item_id) continue
            const baseQty = safeNumber(recipeRow.qty)
            const wastePct = safeNumber(recipeRow.waste_pct)
            const usedQtyPerUnit = baseQty * (1 + wastePct / 100)
            const movementQty = (usedQtyPerUnit / outputQty) * portionForecastQty * forecastRatio
            if (movementQty <= 0) continue

            usageByStockId.set(
              String(recipeRow.stock_item_id),
              safeNumber(usageByStockId.get(String(recipeRow.stock_item_id))) + movementQty,
            )
            pushUsageDetail(recipeRow.stock_item_id, {
              date: dateStr,
              item_type: mixItem.itemType,
              source_name: mixItem.productName || 'Urun',
              portion_name: mixItem.portionName || null,
              forecast_qty: portionForecastQty,
              recipe_qty: baseQty,
              recipe_output_qty: outputQty,
              waste_pct: wastePct,
              movement_qty: movementQty,
              receipt_count: effectiveReceiptCount,
              mode: 'recipe',
            })
            usedRecipeRows = true
            if (mixItem.itemType === 'sale_option') usedOptionRows = true
          }
        }
        continue
      }

      const directStockItem = directStockCatalog.byName.get(normalizeLookupKey(mixItem.productName))
      if (!directStockItem) continue

      usageByStockId.set(
        String(directStockItem.id),
        safeNumber(usageByStockId.get(String(directStockItem.id))) + (mixItem.forecastQty * forecastRatio),
      )
      pushUsageDetail(directStockItem.id, {
        date: dateStr,
        item_type: mixItem.itemType,
        source_name: mixItem.productName || 'Urun',
        portion_name: mixItem.portionName || null,
        forecast_qty: mixItem.forecastQty,
        recipe_qty: null,
        recipe_output_qty: null,
        waste_pct: null,
        movement_qty: mixItem.forecastQty * forecastRatio,
        receipt_count: effectiveReceiptCount,
        mode: 'direct',
      })
      usedDirectMatch = true
      if (mixItem.itemType === 'sale_option') usedOptionRows = true
    }
  }

  for (const [stockItemId, details] of detailsByStockId.entries()) {
    details.sort((left, right) => {
      const dateDiff = String(left.date || '').localeCompare(String(right.date || ''))
      if (dateDiff !== 0) return dateDiff
      const qtyDiff = safeNumber(right.movement_qty) - safeNumber(left.movement_qty)
      if (qtyDiff !== 0) return qtyDiff
      return String(left.source_name || '').localeCompare(String(right.source_name || ''), 'tr')
    })
    detailsByStockId.set(stockItemId, details)
  }

  const sourcePrefix = usedOptionRows ? 'Urun/secenek tahmini' : 'Urun tahmini'
  const sourceLabel = usedRecipeRows && usedDirectMatch
    ? `${sourcePrefix} + recete/esleme`
    : usedRecipeRows
      ? `${sourcePrefix} + recete`
      : usedDirectMatch
        ? `${sourcePrefix} + stok esleme`
        : 'Stok karti ortalamasi'

  return {
    usageByStockId,
    detailsByStockId,
    usedForecastDays,
    applied: usageByStockId.size > 0,
    sourceLabel,
    debug: {
      horizon_days: horizonDates.length,
      sale_line_count: saleLineRows?.length || 0,
      mix_history_days: actualMixByDate.size,
      mix_days_with_projection: mixDaysWithItems,
      projected_entity_count: projectedEntityCount,
      usage_stock_count: usageByStockId.size,
      used_recipe_rows: usedRecipeRows,
      used_direct_match: usedDirectMatch,
      used_option_rows: usedOptionRows,
    },
  }
}

function buildAssumedInboundSummary({
  allOrders,
  allLines,
  branch,
  excludeOrderId = '',
  orderDate,
  horizonEndDate,
  assumedOrderIds = null,
}) {
  const safeOrderDate = toDateOnly(orderDate)
  const safeHorizonEnd = toDateOnly(horizonEndDate)
  const allowedStatuses = new Set(['submitted'])

  const candidateOrders = (allOrders || [])
    .filter(order => {
      if (!order || order.id === excludeOrderId) return false
      if (!branchMatchesRecord(order, branch)) return false
      if (!allowedStatuses.has(order.status)) return false
      const deliveryDate = toDateOnly(order.delivery_date)
      if (!deliveryDate || !safeOrderDate || !safeHorizonEnd) return false
      return deliveryDate >= safeOrderDate && deliveryDate <= safeHorizonEnd
    })
    .sort((left, right) => {
      const dateDiff = String(left.delivery_date || '').localeCompare(String(right.delivery_date || ''))
      if (dateDiff !== 0) return dateDiff
      return String(left.order_no || '').localeCompare(String(right.order_no || ''))
    })

  const selectedIds = assumedOrderIds == null
    ? new Set(candidateOrders.map(order => order.id))
    : new Set(assumedOrderIds)

  const qtyByStockId = new Map()
  const selectedOrders = []

  for (const order of candidateOrders) {
    const assumed = selectedIds.has(order.id)
    selectedOrders.push({
      order_id: order.id,
      order_no: order.order_no || '',
      delivery_date: toDateOnly(order.delivery_date),
      assumed,
    })

    if (!assumed) continue

    for (const line of (allLines || []).filter(row => row.order_id === order.id)) {
      if (!line?.stock_item_id) continue
      qtyByStockId.set(
        line.stock_item_id,
        safeNumber(qtyByStockId.get(line.stock_item_id)) + safeNumber(line.ordered_qty),
      )
    }
  }

  return {
    orders: selectedOrders,
    qtyByStockId,
  }
}

function resolveOrderFlowItemsForScope(flow, stockItems, stockTemplates, contracts, suppliers) {
  const items = resolveFlowItems(flow, stockItems, stockTemplates, contracts)
  const receiverScope = flow?.receiver_scope || 'branch'
  if (receiverScope !== 'branch') return items

  const flowSupplier = (suppliers || []).find(
    supplier => String(supplier?.id || '').toLowerCase() === String(flow?.supplier_id || '').toLowerCase(),
  )
  if (flowSupplier?.supplier_kind === 'internal_warehouse') return items

  return items.filter(item => !stockItemHasInternalWarehouseSupplier(item, suppliers))
}

function collectMissingDueFlows({ flows, orders, branch, branchId, targetDate, stockItems, suppliers, stockTemplates, contracts }) {
  return (flows || []).filter(flow => {
    if (!isFlowDueOnDate(flow, targetDate)) return false
    if (!isBranchIncluded(flow.branches, branchId)) return false

    // Bu akışta olması beklenen tüm tedarikçileri tespit et
    const expectedSupplierIds = new Set()
    if (flow.supplier_id) expectedSupplierIds.add(String(flow.supplier_id).toLowerCase())

    const matchedItems = resolveOrderFlowItemsForScope(flow, stockItems, stockTemplates, contracts, suppliers)
    if (matchedItems.length === 0) return false

    for (const item of matchedItems) {
      const supId = flow.receiver_scope === 'warehouse'
        ? flow.supplier_id
        : resolveBranchLineSupplierId(item, flow.supplier_id, suppliers)
      if (supId) expectedSupplierIds.add(String(supId).toLowerCase())
    }

    // Her bir beklenen tedarikçi için sipariş oluşturulup oluşturulmadığını kontrol et
    for (const supId of expectedSupplierIds) {
      const existing = (orders || []).find(order =>
        order.flow_id === flow.id &&
        branchMatchesRecord(order, branch) &&
        toDateOnly(order.order_date) === toDateOnly(targetDate) &&
        String(order.supplier_id).toLowerCase() === String(supId).toLowerCase() &&
        order.status !== 'cancelled'
      )
      // Eğer en az bir beklenen tedarikçi grubu için sipariş yoksa, bu akışı tetikle
      if (!existing) return true
    }

    return false
  })
}

function buildStockDailyUsageCatalog(movementRows, referenceDate) {
  const safeReferenceDate = toDateOnly(referenceDate) || todayStr()
  const rollingWindowStart = addDays(safeReferenceDate, -59)
  const byStockId = new Map()

  for (const row of movementRows || []) {
    if (!row?.stock_item_id) continue
    const stockId = String(row.stock_item_id)
    const current = byStockId.get(stockId) || []
    current.push(row)
    byStockId.set(stockId, current)
  }

  const result = new Map()

  for (const [stockId, rows] of byStockId.entries()) {
    const sortedRows = [...rows].sort((left, right) => {
      const dateDiff = String(left?.movement_at || '').localeCompare(String(right?.movement_at || ''))
      if (dateDiff !== 0) return dateDiff
      return safeNumber(left?.ledger_seq) - safeNumber(right?.ledger_seq)
    })

    const firstCountRow = sortedRows.find(row => COUNT_MOVEMENT_TYPES.has(String(row?.movement_type || '')))
    if (!firstCountRow) continue

    const firstCountDate = toDateOnly(firstCountRow.movement_at)
    if (!firstCountDate) continue

    const effectiveStartDate = firstCountDate > rollingWindowStart ? firstCountDate : rollingWindowStart
    if (effectiveStartDate > safeReferenceDate) continue

    const daysUsed = Math.max(diffDaysLocal(effectiveStartDate, safeReferenceDate) + 1, 1)
    let totalUsage = 0

    for (const row of sortedRows) {
      const movementDate = toDateOnly(row?.movement_at)
      if (!movementDate || movementDate < effectiveStartDate || movementDate > safeReferenceDate) continue
      if (!STOCK_DAILY_USAGE_MOVEMENT_TYPES.has(String(row?.movement_type || ''))) continue
      totalUsage += resolveOutMovementQty(row)
    }

    result.set(stockId, {
      firstCountDate,
      effectiveStartDate,
      daysUsed,
      totalUsage,
      dailyUsage: daysUsed > 0 ? totalUsage / daysUsed : 0,
    })
  }

  return result
}

function resolveNonRecipeDailyUsage(item, dailyUsageCatalog) {
  const manualDailyUsage = safeNumber(item?.daily_usage, null)
  const hasManualDailyUsage = manualDailyUsage != null && manualDailyUsage > 0
  const autoPreferred = !!item?.auto_usage
  const autoMeta = dailyUsageCatalog.get(String(item?.id || '')) || null

  if (autoPreferred && autoMeta) {
    return {
      dailyUsage: safeNumber(autoMeta.dailyUsage),
      sourceKey: 'auto',
      sourceLabel: 'Gunluk kullanim (otomatik)',
      debug: {
        auto_days_used: autoMeta.daysUsed,
        auto_total_usage: Number(safeNumber(autoMeta.totalUsage).toFixed(4)),
        auto_window_start: autoMeta.effectiveStartDate,
        first_count_date: autoMeta.firstCountDate,
      },
    }
  }

  if (hasManualDailyUsage) {
    return {
      dailyUsage: manualDailyUsage,
      sourceKey: 'manual',
      sourceLabel: 'Gunluk kullanim (manuel)',
      debug: {
        manual_daily_usage: manualDailyUsage,
      },
    }
  }

  return {
    dailyUsage: 1,
    sourceKey: 'default',
    sourceLabel: 'Gunluk kullanim (varsayilan 1)',
    debug: {
      manual_daily_usage: hasManualDailyUsage ? manualDailyUsage : null,
    },
  }
}

function createDraftLines({
  order,
  flow,
  branch,
  stockItems,
  stockTemplates,
  contracts,
  allOrders,
  allLines,
  balanceRows,
  inventoryMovementRows,
  purchaseMovementRows,
  dailySalesRows,
  savedForecastRows,
  saleItems,
  saleOptions,
  saleLineRows,
  forecastLookbackWeeks,
  assumedInboundOrderIds,
  targetSupplierId,
  allSuppliers = [],
  allReceiptLines = [],
  allWarehouseSettings = [],
  // WMS parameters
  isDepoSiparis = false,
  connectedBranches = [],
  wmsWarehouseSettings = [],
  wmsMultiBranchBalances = new Map(),
  wmsMultiBranchDailyUsageMap = new Map(),
  wmsMultiBranchDailySales = new Map(),
  wmsMultiBranchForecasts = new Map(),
  wmsMultiBranchSaleLines = new Map(),
}) {
  if (!flow || !branch) return []

  let items = resolveOrderFlowItemsForScope(flow, stockItems, stockTemplates, contracts, allSuppliers)
    .filter(item => stockVisibleInBranch(item, branch.id))

  if (targetSupplierId) {
    items = items.filter(item => {
      const resolvedSuppId = flow.receiver_scope === 'warehouse'
        ? flow.supplier_id
        : resolveBranchLineSupplierId(item, flow.supplier_id, allSuppliers)
      return String(resolvedSuppId).toLowerCase() === String(targetSupplierId).toLowerCase()
    })
  }

  const balanceMap = buildBalanceMap(balanceRows)
  const priceMap = buildLatestPurchasePriceMap(purchaseMovementRows, asUuidOrNull(branch.id) || '')
  const supplierMap = new Map((allSuppliers || []).map(supplier => [String(supplier?.id || '').toLowerCase(), supplier]))
  const warehouseSettingsMapForPricing = new Map()
  for (const setting of [...(allWarehouseSettings || []), ...(wmsWarehouseSettings || [])]) {
    if (!setting?.stock_item_id || !setting?.branch_id) continue
    warehouseSettingsMapForPricing.set(`${setting.stock_item_id}:${setting.branch_id}`, setting)
  }
  
  const contractPriceMaps = new Map()
  const getContractPrice = (supplierId, itemId) => {
    if (!supplierId) return null
    const key = String(supplierId).toLowerCase()
    if (!contractPriceMaps.has(key)) {
      contractPriceMaps.set(key, buildContractPriceMap(contracts, supplierId, branch.id, order.order_date))
    }
    return contractPriceMaps.get(key).get(itemId)
  }

  const dates = getFlowDates(flow, order.order_date)
  const planningEndDate = dates.nextDeliveryDate || dates.deliveryDate || order.order_date
  const planningDates = buildInclusiveDates(order.order_date, planningEndDate)
  const resolveLinePrice = (item, supplierId) => {
    const supplier = supplierMap.get(String(supplierId || '').toLowerCase())
    const contractPrice = getContractPrice(supplierId, item.id)
    const cardPrice = Number(item?.purchase_price || 0)
    const fallbackPrice = priceMap.get(item.id)
    const defaultPrice = Number(contractPrice?.price || fallbackPrice || cardPrice || 0)

    if (supplier?.supplier_kind === 'internal_warehouse' && supplier?.source_branch_id) {
      const setting = warehouseSettingsMapForPricing.get(`${item.id}:${supplier.source_branch_id}`)
      const transferPrice = resolveWarehouseTransferPrice(cardPrice || defaultPrice, setting)
      if (transferPrice.applied) {
        return {
          unitPrice: transferPrice.unit_price,
          priceSource: 'warehouse_transfer_price',
          contractPrice: null,
          meta: {
            warehouse_transfer_price: {
              base_price: transferPrice.base_price,
              type: transferPrice.type,
              value: transferPrice.value,
              warehouse_branch_id: supplier.source_branch_id,
              supplier_id: supplier.id,
            },
          },
        }
      }
    }

    return {
      unitPrice: defaultPrice,
      priceSource: contractPrice ? 'contract' : (fallbackPrice ? 'last_receipt' : 'stock_card'),
      contractPrice,
      meta: {},
    }
  }

  if (flow.receiver_scope === 'warehouse') {
    const receivedByOrderLine = buildReceivedQtyByOrderLine(allReceiptLines)
    const planningEnd = toDateOnly(planningEndDate)
    const connectedBranchIds = new Set(connectedBranches.map(item => item.id))
    const warehouseSupplier = allSuppliers.find(
      supplier => supplier?.supplier_kind === 'internal_warehouse' && supplier?.source_branch_id === branch.id
    )

    // 1. Calculate connected branches' recipe forecasts dynamically using the grouped maps
    const wmsMultiBranchRecipeForecastMap = new Map()
    for (const b of connectedBranches) {
      const bId = b.id
      const branchDailySales = wmsMultiBranchDailySales.get(bId) || []
      const branchForecasts = wmsMultiBranchForecasts.get(bId) || []
      const branchSaleLines = wmsMultiBranchSaleLines.get(bId) || []

      const branchRecipeForecastUsage = buildForecastRecipeUsage({
        horizonDates: planningDates,
        dailySalesRows: branchDailySales,
        savedForecastRows: branchForecasts,
        saleLineRows: branchSaleLines,
        saleItems,
        saleOptions,
        stockItems: items,
        lookbackWeeks: forecastLookbackWeeks,
        forecastRatio: safeNumber(flow?.forecast_ratio, 1),
      })

      for (const [stockId, qty] of branchRecipeForecastUsage.usageByStockId.entries()) {
        wmsMultiBranchRecipeForecastMap.set(`${bId}:${stockId}`, qty)
      }
    }

    // 2. Build remaining Maps required by calculateWarehouseDemand:
    // warehouseBalances: Map: stockItemId -> availableQty
    const warehouseBalances = new Map()
    for (const row of balanceRows) {
      const avail = Number(row.available_qty ?? row.balance_qty_after ?? 0)
      warehouseBalances.set(row.stock_item_id, avail)
    }

    // inboundWarehouseQtyMap: Map: stockItemId -> inboundQty (external purchase orders to warehouse)
    const inboundWarehouseQtyMap = new Map()
    for (const ord of allOrders) {
      const deliveryDate = toDateOnly(ord.delivery_date)
      if (
        ord.branch_id === branch.id &&
        ord.flow_channel === 'external_purchase' &&
        ['submitted', 'partially_received'].includes(ord.status) &&
        ord.id !== order.id &&
        (!deliveryDate || !planningEnd || deliveryDate <= planningEnd)
      ) {
        const lines = allLines.filter(l => l.order_id === ord.id)
        for (const line of lines) {
          if (line.stock_item_id) {
            const remainingQty = Math.max(Number(line.ordered_qty || 0) - Number(receivedByOrderLine.get(line.id) || 0), 0)
            if (remainingQty <= 0) continue
            const current = inboundWarehouseQtyMap.get(line.stock_item_id) || 0
            inboundWarehouseQtyMap.set(line.stock_item_id, current + remainingQty)
          }
        }
      }
    }

    // outboundReplenishingQtyMap: Map: `${branchId}:${stockItemId}` -> inTransitQty (warehouse to branch)
    const outboundReplenishingQtyMap = new Map()
    for (const ord of allOrders) {
      const deliveryDate = toDateOnly(ord.delivery_date)
      if (
        ord.flow_channel === 'warehouse_replenishment' &&
        ['submitted', 'partially_received'].includes(ord.status) &&
        parseJsonValue(ord.meta, {}).supplier_marked_sent &&
        (!warehouseSupplier || ord.supplier_id === warehouseSupplier.id) &&
        connectedBranchIds.has(ord.branch_id) &&
        (!deliveryDate || !planningEnd || deliveryDate <= planningEnd)
      ) {
        const bId = ord.branch_id
        const lines = allLines.filter(l => l.order_id === ord.id)
        for (const line of lines) {
          if (line.stock_item_id) {
            const remainingQty = Math.max(Number(line.ordered_qty || 0) - Number(receivedByOrderLine.get(line.id) || 0), 0)
            if (remainingQty <= 0) continue
            const key = `${bId}:${line.stock_item_id}`
            const current = outboundReplenishingQtyMap.get(key) || 0
            outboundReplenishingQtyMap.set(key, current + remainingQty)
          }
        }
      }
    }

    // lastOrderQtyMap: Map: `${branchId}:${stockItemId}` -> lastOrderQty
    const lastOrderQtyMap = new Map()
    for (const b of connectedBranches) {
      const bId = b.id
      const branchLastOrderMap = buildLastOrderQtyMap(allOrders, allLines, flow.id, b, order.id)
      for (const [stockId, qty] of branchLastOrderMap.entries()) {
        lastOrderQtyMap.set(`${bId}:${stockId}`, qty)
      }
    }
    const warehouseLastOrderQtyMap = buildLastOrderQtyMap(allOrders, allLines, flow.id, branch, order.id)

    // warehouseSettingsMap: Map: stockItemId -> { min_stock, safety_stock, min_order, max_order, order_unit }
    const warehouseSettingsMap = new Map()
    for (const setting of wmsWarehouseSettings || []) {
      warehouseSettingsMap.set(setting.stock_item_id, setting)
    }

    // 3. Call calculateWarehouseDemand
    const planningDays = planningDates.length
    const demandLines = calculateWarehouseDemand({
      warehouseBranchId: branch.id,
      flow,
      stockItems: items,
      connectedBranches,
      planningDays,
      multiBranchBalances: wmsMultiBranchBalances,
      warehouseBalances,
      inboundWarehouseQtyMap,
      outboundReplenishingQtyMap,
      multiBranchDailyUsageMap: wmsMultiBranchDailyUsageMap,
      multiBranchRecipeForecastMap: wmsMultiBranchRecipeForecastMap,
      lastOrderQtyMap,
      warehouseLastOrderQtyMap,
      warehouseSettingsMap,
    })

    return demandLines.map((line, idx) => {
      const item = items.find(it => it.id === line.stock_item_id)
      const itemSupplierId = flow.supplier_id
      const itemForPrice = item || { ...line, id: line.stock_item_id, purchase_price: line.unit_price }
      const { unitPrice, contractPrice, priceSource, meta: priceMeta } = resolveLinePrice(itemForPrice, itemSupplierId)
      const orderedQty = Number(line.suggested_qty || 0)

      return {
        ...line,
        line_no: idx + 1,
        min_order: item?.min_order || null,
        max_order: item?.max_order || null,
        packaging_units: item?.packaging_units || [],
        planned_delivery_date: dates.deliveryDate || null,
        next_order_date: dates.nextOrderDate || null,
        next_delivery_date: dates.nextDeliveryDate || null,
        unit_price: unitPrice,
        line_total: Number((orderedQty * unitPrice).toFixed(4)),
        contract_id: asUuidOrNull(contractPrice?.contractId),
        price_source: priceSource,
        notes: null,
        meta: {
          ...line.meta,
          ...priceMeta,
          contract_no: contractPrice?.contractNo || null,
          warnings: getOrderWarnings(item || line, orderedQty),
          assumed_inbound_orders: [],
        }
      }
    })
  }

  // Branch calculation path (original code below):
  const lastOrderMap = buildLastOrderQtyMap(allOrders, allLines, flow.id, branch, order.id)
  const coverageDays = computeCoverageDays(flow, order.order_date)
  const inboundSummary = buildAssumedInboundSummary({
    allOrders,
    allLines,
    branch,
    excludeOrderId: order.id,
    orderDate: order.order_date,
    horizonEndDate: planningEndDate,
    assumedOrderIds: assumedInboundOrderIds,
  })
  const recipeForecastUsage = buildForecastRecipeUsage({
    horizonDates: planningDates,
    dailySalesRows,
    savedForecastRows,
    saleLineRows,
    saleItems,
    saleOptions,
    stockItems: items,
    lookbackWeeks: forecastLookbackWeeks,
    forecastRatio: safeNumber(flow?.forecast_ratio, 1),
  })
  const forecastSummary = buildForecastCoverageSummary({
    dailySalesRows,
    savedForecastRows,
    coverageStartDate: dates.deliveryDate || order.order_date,
    coverageDays,
    lookbackWeeks: forecastLookbackWeeks,
  })

  return items.map((item, index) => {
    const rawCurrentStock = Number(balanceMap.get(item.id)?.available_qty ?? balanceMap.get(item.id)?.balance_qty_after ?? 0)
    const assumedInboundQty = safeNumber(inboundSummary.qtyByStockId.get(item.id))
    const effectiveCurrentStock = rawCurrentStock + assumedInboundQty
    let calculatedNeed = 0
    let suggestedQty = 0
    let forecastRatio = forecastSummary.forecastRatio
    const rawRecipeUsage = safeNumber(recipeForecastUsage.usageByStockId.get(String(item.id)))
    const recipeUsageDetails = recipeForecastUsage.detailsByStockId.get(String(item.id)) || []
    const forecastSourceLabel = recipeForecastUsage.applied
      ? recipeForecastUsage.sourceLabel
      : 'Tahmin sonucu 0'
    const hasForecastUsageForItem = rawRecipeUsage > 0.0001
    const useForecastMode = flow?.qty_mode === 'tahmin'
    const useForecastUsageForItem = useForecastMode && hasForecastUsageForItem

    if (useForecastMode) {
      calculatedNeed = useForecastUsageForItem
        ? Math.max(rawRecipeUsage - effectiveCurrentStock, 0)
        : 0
      suggestedQty = roundOrderQuantity(item, calculatedNeed, flow)
      forecastRatio = safeNumber(flow?.forecast_ratio, 1)
    } else {
      const suggestion = computeSuggestedQuantity({
        item,
        flow,
        currentQty: effectiveCurrentStock,
        coverageDays,
        lastOrderQty: lastOrderMap.get(item.id) || 0,
        forecastRatio: forecastSummary.forecastRatio,
      })
      calculatedNeed = suggestion.calculatedNeed
      suggestedQty = suggestion.suggestedQty
      forecastRatio = suggestion.forecastRatio
    }

    const itemSupplierId = resolveBranchLineSupplierId(item, flow.supplier_id, allSuppliers)
    const { unitPrice, contractPrice, priceSource, meta: priceMeta } = resolveLinePrice(item, itemSupplierId)
    const orderedQty = Number(suggestedQty || 0)

    return {
      line_no: index + 1,
      stock_item_id: asUuidOrNull(item.id),
      item_name: item.name,
      item_sku: item.sku || '',
      unit: item.unit || '',
      order_unit: item.order_unit || 'ana',
      min_order: item.min_order || null,
      max_order: item.max_order || null,
      packaging_units: item.packaging_units || [],
      current_stock: effectiveCurrentStock,
      planned_delivery_date: dates.deliveryDate || null,
      next_order_date: dates.nextOrderDate || null,
      next_delivery_date: dates.nextDeliveryDate || null,
      calculated_need: calculatedNeed,
      suggested_qty: suggestedQty,
      ordered_qty: orderedQty,
      price_source: priceSource,
      unit_price: unitPrice,
      line_total: Number((orderedQty * unitPrice).toFixed(4)),
      contract_id: asUuidOrNull(contractPrice?.contractId),
      notes: null,
      meta: {
        ...priceMeta,
        contract_no: contractPrice?.contractNo || null,
        warnings: getOrderWarnings(item, orderedQty),
        forecast: flow.qty_mode === 'tahmin'
          ? {
              ratio: forecastRatio,
              coverage_days: useForecastUsageForItem
                  ? planningDates.length
                  : forecastSummary.coverageDays,
              baseline_receipts: Number(forecastSummary.baselineReceipts.toFixed(2)),
              forecast_receipts: Number(forecastSummary.forecastReceipts.toFixed(2)),
              forecast_days_used: useForecastUsageForItem
                  ? recipeForecastUsage.usedForecastDays
                  : forecastSummary.forecastDaysUsed,
              source_label: useForecastUsageForItem
                  ? recipeForecastUsage.sourceLabel
                  : forecastSourceLabel,
              applied: useForecastUsageForItem || recipeForecastUsage.applied,
              actual_stock: rawCurrentStock,
              assumed_inbound_qty: assumedInboundQty,
              recipe_usage_qty: useForecastUsageForItem ? rawRecipeUsage : null,
              detail_rows: recipeUsageDetails,
              debug: recipeForecastUsage.debug,
            }
          : null,
        assumed_inbound_orders: inboundSummary.orders,
      },
    }
  })
}

function toPurchaseOrderLinePayload(line, orderId) {
  return {
    order_id: orderId,
    line_no: Number(line.line_no || 1),
    stock_item_id: asUuidOrNull(line.stock_item_id),
    item_name: line.item_name || '',
    item_sku: line.item_sku || '',
    unit: line.unit || '',
    current_stock: Number(line.current_stock || 0),
    planned_delivery_date: line.planned_delivery_date || null,
    next_order_date: line.next_order_date || null,
    next_delivery_date: line.next_delivery_date || null,
    calculated_need: Number(line.calculated_need || 0),
    suggested_qty: Number(line.suggested_qty || 0),
    ordered_qty: Number(line.ordered_qty || 0),
    price_source: line.price_source || null,
    unit_price: Number(line.unit_price || 0),
    line_total: Number(line.line_total || 0),
    contract_id: asUuidOrNull(line.contract_id),
    notes: line.notes?.trim?.() || null,
    meta: line.meta || {},
  }
}

function OrderDetailModal({
  open,
  order,
  lines,
  flow,
  supplier,
  onClose,
  onRefresh,
  onSaveAction,
  onCancelOrder,
}) {
  const toast = useToast()
  const [draftLines, setDraftLines] = useState([])
  const [actionNote, setActionNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [assumedInboundOrderIds, setAssumedInboundOrderIds] = useState([])
  const [expandedForecastLineIds, setExpandedForecastLineIds] = useState([])

  function formatForecastRatio(value) {
    return Number(value || 1).toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  function getDescriptionHint(mode, isReplenishment) {
    switch (mode) {
      case 'son':
        return isReplenishment ? 'Son talep tekraridir' : 'Son siparis tekraridir'
      case 'stok':
        return isReplenishment ? 'Stoklar belirlenen seviyeye tamamlanir' : 'Stoklar belirlenen seviyeye tamamlanir'
      case 'manuel':
        return isReplenishment ? 'Talep miktarlari manuel girilecektir' : 'Siparis miktarlari manuel girilecektir.'
      case 'tahmin':
      default:
        return isReplenishment ? 'Oneriler tahmini taleplere gore uretilmistir' : 'Oneriler tahmini satislara gore uretilmistir'
    }
  }

  useEffect(() => {
    if (!open) return
    setDraftLines((lines || []).map(line => ({ ...line })))
    setActionNote(order?.notes || '')
    const inboundOrders = (lines || [])[0]?.meta?.assumed_inbound_orders || []
    setAssumedInboundOrderIds(inboundOrders.filter(item => item?.assumed).map(item => item.order_id))
    setExpandedForecastLineIds([])
  }, [open, lines, order])

  if (!open || !order) return null

  const editable = ['draft', 'pending_action', 'awaiting_approval'].includes(order.status)
  const summary = summarizeLines(draftLines)
  const details = getFlowDates(flow, order.order_date)
  const needsApproval = !!order.needs_manager_approval
  const assumedInboundOrders = draftLines[0]?.meta?.assumed_inbound_orders || []
  const supplierNotes = getSupplierNotes(order)

  function updateLine(lineId, key, value) {
    setDraftLines(prev => prev.map(line => {
      if (line.id !== lineId && line.line_no !== lineId) return line
      const next = { ...line, [key]: value }
      const qty = Number(next.ordered_qty || 0)
      const price = Number(next.unit_price || 0)
      next.line_total = Number((qty * price).toFixed(4))
      next.meta = { ...(next.meta || {}), warnings: getOrderWarnings(next, qty) }
      return next
    }))
  }

  function toggleForecastDetails(lineId) {
    setExpandedForecastLineIds(prev => (
      prev.includes(lineId)
        ? prev.filter(id => id !== lineId)
        : [...prev, lineId]
    ))
  }

  async function runAction(action) {
    setSaving(true)
    try {
      await onSaveAction({
        order,
        action,
        lines: draftLines,
        actionNote,
      })
      onClose()
    } catch (error) {
      toast(error?.message || 'Siparis kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleRefresh() {
    setSaving(true)
    try {
      const refreshed = await onRefresh(order, { assumedInboundOrderIds })
      setDraftLines(refreshed)
    } catch (error) {
      toast(error?.message || 'Siparis onerisi guncellenemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function toggleInboundAssumption(orderId) {
    const nextIds = assumedInboundOrderIds.includes(orderId)
      ? assumedInboundOrderIds.filter(id => id !== orderId)
      : [...assumedInboundOrderIds, orderId]

    setAssumedInboundOrderIds(nextIds)
    setSaving(true)
    try {
      const refreshed = await onRefresh(order, { assumedInboundOrderIds: nextIds })
      setDraftLines(refreshed)
    } catch (error) {
      toast(error?.message || 'Teslim varsayimi guncellenemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  const isReplenishment = order.flow_channel === 'warehouse_replenishment' || order.flow_channel === 'kitchen_replenishment'

  const footer = (
    <>
      <button className="btn-o" onClick={onClose} disabled={saving}>Kapat</button>
      {editable && (
        <>
          <button className="btn-o" onClick={() => runAction('draft')} disabled={saving}>
            Taslak Olarak Kaydet
          </button>
          <button className="btn-p" onClick={() => runAction(order.status === 'awaiting_approval' ? 'approve' : 'submit')} disabled={saving}>
            {saving
              ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor...</>
              : order.status === 'awaiting_approval'
                ? <><i className="fa-solid fa-check" style={{ marginRight: 6 }} />{isReplenishment ? "Onayla ve WMS'e İlet" : "Onayla ve Gonder"}</>
                : needsApproval
                  ? <><i className="fa-solid fa-paper-plane" style={{ marginRight: 6 }} />Kaydet ve Onaya Gonder</>
                  : <><i className="fa-solid fa-paper-plane" style={{ marginRight: 6 }} />{isReplenishment ? "Kaydet ve WMS'e İlet" : "Kaydet ve Gonder"}</>}
          </button>
        </>
      )}
    </>
  )

  const supplierLabel = order.flow_channel === 'warehouse_replenishment'
    ? 'İkmal Deposu'
    : order.flow_channel === 'kitchen_replenishment'
      ? 'Merkez Mutfak'
      : 'Tedarikçi'

  const titleSuffix = order.flow_channel === 'warehouse_replenishment'
    ? '(İç Depo İkmal Talebi)'
    : order.flow_channel === 'kitchen_replenishment'
      ? '(Merkez Mutfak İkmal Talebi)'
      : '(Dış Satın Alma Siparişi)'

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={1180}
      flex
      title={`${order.order_no} ${titleSuffix}`}
      subtitle={`${order.branch_name || 'Sube'} • ${supplierLabel}: ${supplier?.name || order.supplier_name || '—'} • ${flow?.name || order.flow_name || 'Siparis Akisi'}`}
      footer={footer}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <Badge meta={ORDER_STATUS_META[order.status]} />
          {order.needs_manager_approval && (
            <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: '.74rem', fontWeight: 700 }}>
              Yonetici onayi gerekiyor
            </span>
          )}
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', fontSize: '.74rem', fontWeight: 700 }}>
            Son siparis saati: {details.cutoffTime || '—'}
          </span>
          <span style={{ padding: '3px 10px', borderRadius: 999, background: '#ecfeff', color: '#0f766e', fontSize: '.74rem', fontWeight: 700 }}>
            {describeCutoffBehavior(flow)}
          </span>
          {editable && (
            <button className="btn-o" onClick={handleRefresh} disabled={saving}>
              <i className="fa-solid fa-arrows-rotate" /> Guncelle
            </button>
          )}
          {editable && (
            <button
              className="btn-o"
              onClick={() => onCancelOrder({ order, reason: actionNote })}
              disabled={saving}
              style={{ color: '#b91c1c', borderColor: '#fecaca' }}
            >
              <i className="fa-solid fa-ban" /> Iptal Et
            </button>
          )}
        </div>

        {flow?.qty_mode === 'tahmin' && assumedInboundOrders.length > 0 && (
          <div style={{ border: '1px solid #dbeafe', borderRadius: 14, background: '#f8fbff', padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Teslim Varsayimi
            </div>
            {assumedInboundOrders.map(item => (
              <label key={item.order_id} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#334155', fontSize: '.86rem', cursor: saving ? 'wait' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={assumedInboundOrderIds.includes(item.order_id)}
                  disabled={saving}
                  onChange={() => toggleInboundAssumption(item.order_id)}
                />
                <span>
                  {item.order_no || 'Siparis'} siparisinin teslim edildigi varsayilmistir
                  {item.delivery_date ? ` (${formatDate(item.delivery_date)})` : ''}
                </span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
          <SummaryCard label={isReplenishment ? "Talep Toplami" : "Siparis Toplami"} value={`₺${formatMoney(summary.subtotal)}`} hint={`${formatQty(summary.totalQty)} toplam miktar`} />
          <SummaryCard label="Teslim Tarihi" value={formatDate(details.deliveryDate)} hint={details.deliveryTime ? `${details.deliveryTime} planli` : 'Saat tanimi yok'} bg="#eff6ff" color="#1d4ed8" />
          <SummaryCard label={isReplenishment ? "Sonraki Talep" : "Sonraki Siparis"} value={details.nextOrderDate ? formatDate(details.nextOrderDate) : 'Yok'} hint={details.nextDeliveryDate ? `Sonraki teslim: ${formatDate(details.nextDeliveryDate)}` : 'Tekrarsiz akis'} bg="#f8fafc" />
          <SummaryCard label="Aciklama" value={order.description || '—'} hint={getDescriptionHint(flow?.qty_mode || order?.qty_mode, isReplenishment)} bg="#fffbeb" color="#92400e" />
        </div>

        {supplierNotes.length > 0 && (
          <div style={{ border: '1px solid #dbeafe', borderRadius: 14, background: '#f8fbff', padding: 14, display: 'grid', gap: 10 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Tedarikci Notlari
            </div>
            {supplierNotes.slice(0, 5).map(note => (
              <div key={note.id || note.created_at} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: 10 }}>
                <div style={{ fontSize: '.7rem', color: '#64748b', marginBottom: 4 }}>
                  {note.supplier_name || supplier?.name || 'Tedarikci'} • {note.created_at ? new Date(note.created_at).toLocaleString('tr-TR') : 'Tarih yok'}
                </div>
                <div style={{ fontSize: '.82rem', color: '#0f172a' }}>{note.message || note.note || 'â€”'}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Stok Mali Adi', 'SKU', 'Birim', 'Mevcut Stok', 'Teslim Tarihi', 'Sonraki Siparis', 'Sonraki Teslim', 'Hesaplanan Ihtiyac', 'Siparis Onerisi', 'Siparis', 'Birim Fiyati', 'Tutar'].map(label => (
                    <th key={label} style={{ padding: '10px 12px', textAlign: label === 'Stok Mali Adi' ? 'left' : 'right', borderBottom: '1px solid #e2e8f0', color: '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draftLines.map(line => {
                  const warnings = parseJsonValue(line.meta?.warnings, line.meta?.warnings || [])
                  const priceLocked = line.price_source === 'contract' || line.price_source === 'warehouse_transfer_price'
                  const lineId = line.id || line.line_no
                  const forecastDetails = line.meta?.forecast?.detail_rows || []
                  const hasForecastDetails = flow?.receiver_scope === 'warehouse'
                    ? !!line.meta?.forecast
                    : (flow?.qty_mode === 'tahmin' && forecastDetails.length > 0)
                  const forecastDetailsExpanded = expandedForecastLineIds.includes(lineId)
                  return (
                    <tr key={lineId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px', minWidth: 220 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{line.item_name}</div>
                        {warnings.length > 0 && (
                          <div style={{ fontSize: '.68rem', color: '#b45309', marginTop: 4 }}>
                            {warnings.join(' • ')}
                          </div>
                        )}
                        {hasForecastDetails && (
                          <button
                            type="button"
                            onClick={() => toggleForecastDetails(lineId)}
                            style={{ marginTop: 6, border: 'none', background: 'transparent', color: '#7c3aed', fontSize: '.7rem', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                          >
                            {forecastDetailsExpanded ? 'Tahmin detayi gizle' : 'Tahmin detayini goster'}
                          </button>
                        )}
                        {hasForecastDetails && forecastDetailsExpanded && (
                          <div style={{ marginTop: 10, border: '1px solid #e9d5ff', borderRadius: 10, background: '#faf5ff', padding: 10, display: 'grid', gap: 8 }}>
                            {flow?.receiver_scope === 'warehouse' ? (
                              <>
                                <div style={{ fontSize: '.7rem', fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                  Ana Depo Planlama Detayları
                                </div>
                                <div style={{ fontSize: '.72rem', color: '#475569', display: 'grid', gap: 4 }}>
                                  <div><strong>Talep Yontemi:</strong> {getDemandMethodLabel(line.demand_method || line.meta?.forecast?.demand_method)}</div>
                                  <div><strong>Hesaplama:</strong> {line.meta?.forecast?.qty_mode_explanation}</div>
                                  <div><strong>Yuvarlama:</strong> {line.meta?.forecast?.rounding_reason}</div>
                                  <div><strong>Depo Envanter Durumu:</strong> Mevcut: {formatQty(line.meta?.forecast?.warehouse_avail)} + Tedarikçiden Yolda: {formatQty(line.meta?.forecast?.inbound_yolda)}</div>
                                </div>
                                <div style={{ borderTop: '1px solid #e9d5ff', paddingTop: 8 }}>
                                  <div style={{ fontSize: '.68rem', fontWeight: 900, color: '#7c3aed', marginBottom: 6 }}>
                                    Bağlı Şube Talepleri
                                  </div>
                                  <div style={{ display: 'grid', gap: 6 }}>
                                    {(line.meta?.forecast?.branch_details || []).map((bDetail, bIdx) => (
                                      <div key={`${lineId}-branch-${bIdx}`} style={{ borderRadius: 8, background: '#fff', border: '1px solid #f3e8ff', padding: '8px 10px', fontSize: '.72rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#0f172a' }}>
                                          <span>{bDetail.branchName}</span>
                                          <span style={{ color: '#1d4ed8' }}>Net İhtiyaç: {formatQty(bDetail.netBranch)}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4, color: '#64748b', fontSize: '.68rem' }}>
                                          <span>Brüt Talep: {formatQty(bDetail.gross)} ({bDetail.source === 'recipe_forecast' ? 'reçete tahmini' : bDetail.source === 'usage_average' ? 'kullanım ortalaması' : bDetail.source === 'stock_topup' ? 'stok tamamlama' : bDetail.source === 'repeat_last_order' ? 'son sipariş' : 'manuel'})</span>
                                          <span>Şube Stoğu: {formatQty(bDetail.available)}</span>
                                          <span>Şubeye Yolda: {formatQty(bDetail.outboundYolda)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                  <span style={{ fontSize: '.68rem', fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                                    Tahmin Aciklamasi
                                  </span>
                                  <span style={{ fontSize: '.68rem', color: '#475569' }}>
                                    {forecastDetails.length} katki satiri
                                  </span>
                                  <span style={{ fontSize: '.68rem', color: '#1d4ed8', fontWeight: 800 }}>
                                    Toplam: {formatQty(forecastDetails.reduce((sum, row) => sum + safeNumber(row.movement_qty), 0))}
                                  </span>
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                  {forecastDetails.map((detail, index) => (
                                    <div key={`${lineId}-detail-${index}`} style={{ borderRadius: 8, background: '#fff', border: '1px solid #f3e8ff', padding: '8px 10px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                                        <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#0f172a' }}>
                                          {detail.source_name}
                                          {detail.portion_name ? ` - ${detail.portion_name}` : ''}
                                        </div>
                                        <div style={{ fontSize: '.68rem', color: '#64748b' }}>{formatDate(detail.date)}</div>
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4, fontSize: '.67rem', color: '#64748b' }}>
                                        <span>Fis: {formatQty(detail.receipt_count)}</span>
                                        <span>Tahmin adet: {formatQty(detail.forecast_qty)}</span>
                                        <span>{detail.mode === 'recipe' ? `Recete: ${formatQty(detail.recipe_qty)} / ${formatQty(detail.recipe_output_qty || 1)}` : 'Direkt esleme'}</span>
                                        <span style={{ color: '#0f766e', fontWeight: 800 }}>Stok katkisi: {formatQty(detail.movement_qty)}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.item_sku || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.unit || '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(line.current_stock)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{formatDate(line.planned_delivery_date)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.next_order_date ? formatDate(line.next_order_date) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{line.next_delivery_date ? formatDate(line.next_delivery_date) : '—'}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>
                        {formatQty(line.calculated_need)}
                        {flow?.qty_mode === 'son' && (
                          <div style={{ fontSize: '.65rem', color: '#64748b', marginTop: 4 }}>
                            Son verilen siparis
                          </div>
                        )}
                        {flow?.qty_mode === 'tahmin' && line.meta?.forecast?.applied && (
                          <div style={{ fontSize: '.65rem', color: '#7c3aed', marginTop: 4 }}>
                            Tahmin x{formatForecastRatio(line.meta.forecast.ratio)}
                          </div>
                        )}
                        {flow?.qty_mode === 'tahmin' && !line.meta?.forecast?.applied && line.meta?.forecast?.debug && (
                          <div style={{ fontSize: '.65rem', color: '#b45309', marginTop: 4 }}>
                            Mix gunu: {line.meta.forecast.debug.mix_days_with_projection || 0} / {line.meta.forecast.debug.horizon_days || 0}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>
                        {formatQty(line.suggested_qty)}
                        {flow?.qty_mode === 'son' && (
                          <div style={{ fontSize: '.65rem', color: '#64748b', marginTop: 4 }}>
                            Son siparis miktari
                          </div>
                        )}
                        {flow?.qty_mode === 'tahmin' && line.meta?.forecast?.applied && (
                          <div style={{ fontSize: '.65rem', color: '#64748b', marginTop: 4 }}>
                            {line.meta.forecast.source_label}
                          </div>
                        )}
                        {flow?.qty_mode === 'tahmin' && !line.meta?.forecast?.applied && line.meta?.forecast?.debug && (
                          <div style={{ fontSize: '.65rem', color: '#64748b', marginTop: 4 }}>
                            Kaynak: {line.meta.forecast.source_label}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <input
                          className="f-input"
                          type="number"
                          step="any"
                          min="0"
                          value={line.ordered_qty}
                          disabled={!editable}
                          onChange={e => updateLine(lineId, 'ordered_qty', e.target.value)}
                          style={{ width: 120, marginLeft: 'auto', textAlign: 'right', fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <input
                          className="f-input"
                          type="number"
                          step="any"
                          min="0"
                          value={line.unit_price}
                          disabled={!editable || priceLocked}
                          onChange={e => updateLine(lineId, 'unit_price', e.target.value)}
                          style={{ width: 120, marginLeft: 'auto', textAlign: 'right', fontWeight: 700 }}
                        />
                        <div style={{ fontSize: '.65rem', color: priceLocked ? '#7c3aed' : '#94a3b8', marginTop: 4 }}>
                          {line.price_source === 'contract'
                            ? `Kontrat: ${line.meta?.contract_no || 'aktif'}`
                            : line.price_source === 'warehouse_transfer_price'
                              ? `Ana depo sevk fiyati (${line.meta?.warehouse_transfer_price?.type === 'percent' ? `%${line.meta?.warehouse_transfer_price?.value}` : `+${formatMoney(line.meta?.warehouse_transfer_price?.value || 0)}`})`
                              : line.price_source === 'last_receipt'
                                ? 'Son mal kabul fiyati'
                                : 'Stok karti fiyati'}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                        ₺{formatMoney(line.line_total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>
          <div>
            <label className="f-label">Islem Notu</label>
            <textarea
              className="f-input"
              rows={4}
              value={actionNote}
              onChange={e => setActionNote(e.target.value)}
              placeholder="Duzenleme veya iptal nedeni gerekiyorsa burada belirtin"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, background: '#f8fafc' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Ozet
            </div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14, fontSize: '.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Toplam miktar</span>
                <strong>{formatQty(summary.totalQty)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Toplam tutar</span>
                <strong>₺{formatMoney(summary.subtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Onay akisi</span>
                <strong>{needsApproval ? 'Gerekli' : 'Dogrudan gonderim'}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Orders() {
  const toast = useToast()
  const { user } = useAuth()
  const { scope, branchId: workspaceBranchId } = useWorkspace()
  const isDepoSiparis = scope === 'anadepo'
  const isMutfakSiparis = scope === 'merkezmutfak'
  const branchLocked = isBranchScopedScope(scope) && !!workspaceBranchId
  const forecastSettings = readForecastSettings()
  const [loading, setLoading] = useState(true)
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [orders, setOrders] = useState([])
  const [orderLines, setOrderLines] = useState([])
  const [receiptLines, setReceiptLines] = useState([])
  const [flows, setFlows] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [saleOptions, setSaleOptions] = useState([])
  const [stockTemplates, setStockTemplates] = useState([])
  const [contracts, setContracts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [balanceRows, setBalanceRows] = useState([])
  const [inventoryMovementRows, setInventoryMovementRows] = useState([])
  const [purchaseMovementRows, setPurchaseMovementRows] = useState([])
  const [dailySalesRows, setDailySalesRows] = useState([])
  const [savedForecastRows, setSavedForecastRows] = useState([])
  const [saleLineRows, setSaleLineRows] = useState([])

  // WMS multi-branch planning state variables
  const [allCompanyBranches, setAllCompanyBranches] = useState([])
  const [wmsMultiBranchBalances, setWmsMultiBranchBalances] = useState(new Map())
  const [wmsMultiBranchDailyUsageMap, setWmsMultiBranchDailyUsageMap] = useState(new Map())
  const [wmsMultiBranchDailySales, setWmsMultiBranchDailySales] = useState(new Map())
  const [wmsMultiBranchForecasts, setWmsMultiBranchForecasts] = useState(new Map())
  const [wmsMultiBranchSaleLines, setWmsMultiBranchSaleLines] = useState(new Map())
  const [wmsWarehouseSettings, setWmsWarehouseSettings] = useState([])
  const [allWarehouseSettings, setAllWarehouseSettings] = useState([])

  const [activeTab, setActiveTab] = useState('pending')
  const [search, setSearch] = useState('')
  const [detailOrderId, setDetailOrderId] = useState('')
  const [confirmCancel, setConfirmCancel] = useState(null)
  const [currentClockHour, setCurrentClockHour] = useState(() => getCurrentLocalHour())
  const generationRef = useRef('')

  const getConnectedBranches = useCallback((whBranchId) => {
    if (!whBranchId) return []
    const warehouseSupplier = suppliers.find(
      s => s.supplier_kind === 'internal_warehouse' && s.source_branch_id === whBranchId
    )
    const allSubeBranches = allCompanyBranches.filter(b => b.type === 'sube')
    if (!warehouseSupplier) return []

    const warehouseFlows = flows.filter(
      f => f.supplier_id === warehouseSupplier.id && f.flow_channel === 'warehouse_replenishment'
    )
    const connectedBranchIds = new Set()
    for (const flow of warehouseFlows) {
      const branchIds = resolveSelectionIds(flow.branches)
      for (const id of branchIds) {
        connectedBranchIds.add(id)
      }
    }
    const connected = allSubeBranches.filter(b => connectedBranchIds.has(b.id))
    return connected
  }, [suppliers, allCompanyBranches, flows])

  const fetchWmsSnapshot = useCallback(async (branchId, connectedBranches) => {
    const connectedBranchIds = connectedBranches.map(b => b.id)
    if (connectedBranchIds.length === 0) {
      return {
        wmsWarehouseSettings: [],
        wmsMultiBranchBalances: new Map(),
        wmsMultiBranchDailyUsageMap: new Map(),
        wmsMultiBranchDailySales: new Map(),
        wmsMultiBranchForecasts: new Map(),
        wmsMultiBranchSaleLines: new Map(),
      }
    }

    const today = todayStr()
    const forecastEndDate = addDays(today, 62)
    const historyStartDate = addDays(today, -(Math.max(forecastSettings.lookbackWeeks * 7 + 56, 90)))

    const [whSettingsRes, multiMovementsRes, multiDailySalesRes, multiForecastsRes] = await Promise.all([
      db.from('stock_item_warehouse_settings').select('*').eq('branch_id', branchId),
      db
        .from('inventory_movements')
        .select('stock_item_id,unit_cost,quantity,direction,quantity_signed,movement_at,ledger_seq,branch_id,branch_name,movement_type,balance_qty_after,meta')
        .eq('item_type', 'stock_item')
        .in('branch_id', connectedBranchIds)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .order('ledger_seq', { ascending: false })
        .limit(20000),
      db
        .from('daily_sales')
        .select('sale_date,branch_id,branch_name,total_sales,receipt_count')
        .in('branch_id', connectedBranchIds)
        .gte('sale_date', addDays(today, -(Math.max(forecastSettings.lookbackWeeks * 7, 28) + 14)))
        .lte('sale_date', today)
        .order('sale_date', { ascending: true }),
      db
        .from('sales_forecasts')
        .select('forecast_date,branch_id,calc_receipt_count,adj_receipt_count')
        .in('branch_id', connectedBranchIds)
        .gte('forecast_date', today)
        .lte('forecast_date', forecastEndDate)
        .order('forecast_date', { ascending: true }),
    ])

    if (whSettingsRes.error) throw whSettingsRes.error
    if (multiMovementsRes.error) throw multiMovementsRes.error
    if (multiDailySalesRes.error) throw multiDailySalesRes.error
    if (multiForecastsRes.error) throw multiForecastsRes.error

    const multiSaleLines = await fetchAllRows((from, to) =>
      db
        .from('sale_lines')
        .select('product_id,product_name,portion_id,portion_name,options_json,qty,line_gross_after_discount,sale_datetime,branch_id,branch_name')
        .in('branch_id', connectedBranchIds)
        .gte('sale_datetime', `${historyStartDate}T00:00:00`)
        .lte('sale_datetime', `${today}T23:59:59`)
        .order('sale_datetime', { ascending: true })
        .range(from, to),
    )

    // Group movements by branch
    const movementsByBranch = new Map()
    for (const m of multiMovementsRes.data || []) {
      const bId = m.branch_id
      if (!movementsByBranch.has(bId)) movementsByBranch.set(bId, [])
      movementsByBranch.get(bId).push(m)
    }

    const tempBalances = new Map()
    const tempDailyUsage = new Map()

    for (const bId of connectedBranchIds) {
      const branchMovs = movementsByBranch.get(bId) || []
      const branchBalances = buildInventoryBalanceRows(branchMovs)
      const branchUsageCatalog = buildStockDailyUsageCatalog(branchMovs, today)

      for (const row of branchBalances) {
        const avail = Number(row.available_qty ?? row.balance_qty_after ?? 0)
        tempBalances.set(`${bId}:${row.stock_item_id}`, avail)
      }

      for (const item of stockItems) {
        const usageMeta = resolveNonRecipeDailyUsage(item, branchUsageCatalog)
        tempDailyUsage.set(`${bId}:${item.id}`, usageMeta.dailyUsage)
      }
    }

    // Group sales, forecasts, and sale lines by branch
    const salesByBranch = new Map()
    for (const s of multiDailySalesRes.data || []) {
      const bId = s.branch_id
      if (!salesByBranch.has(bId)) salesByBranch.set(bId, [])
      salesByBranch.get(bId).push(s)
    }

    const forecastsByBranch = new Map()
    for (const f of multiForecastsRes.data || []) {
      const bId = f.branch_id
      if (!forecastsByBranch.has(bId)) forecastsByBranch.set(bId, [])
      forecastsByBranch.get(bId).push(f)
    }

    const saleLinesByBranch = new Map()
    for (const sl of multiSaleLines || []) {
      const bId = sl.branch_id
      if (!saleLinesByBranch.has(bId)) saleLinesByBranch.set(bId, [])
      saleLinesByBranch.get(bId).push(sl)
    }

    return {
      wmsWarehouseSettings: whSettingsRes.data || [],
      wmsMultiBranchBalances: tempBalances,
      wmsMultiBranchDailyUsageMap: tempDailyUsage,
      wmsMultiBranchDailySales: salesByBranch,
      wmsMultiBranchForecasts: forecastsByBranch,
      wmsMultiBranchSaleLines: saleLinesByBranch,
    }
  }, [stockItems, forecastSettings.lookbackWeeks])
  const selectedBranchRecord = useMemo(
    () => findBranchById(branches, selectedBranch),
    [branches, selectedBranch],
  )

  const loadLatestStockItems = useCallback(async () => {
    const { data, error } = await db
      .from('stock_items')
      .select('id,sku,name,unit,reorder,min_stock,max_stock,order_unit,min_order,max_order,purchase_price,supp_id,suppliers_list,packaging_units,daily_usage,auto_usage,recipe_linked,location')
      .is('deleted_at', null)
      .order('name')
    if (error) throw error
    return data || []
  }, [])

  const fetchBranchInventorySnapshot = useCallback(async branch => {
    if (!branch) {
      return {
        balanceRows: [],
        inventoryMovementRows: [],
        purchaseMovementRows: [],
        dailySalesRows: [],
        savedForecastRows: [],
        saleLineRows: [],
      }
    }

    const today = todayStr()
    const forecastEndDate = addDays(today, 62)
    const historyStartDate = addDays(today, -(Math.max(forecastSettings.lookbackWeeks * 7 + 56, 90)))
    const movementQuery = applyBranchFilter(
      db
        .from('inventory_movements')
        .select('stock_item_id,unit_cost,quantity,direction,quantity_signed,movement_at,ledger_seq,branch_id,branch_name,movement_type,balance_qty_after,balance_total_cost_after,avg_unit_cost_after,meta')
        .eq('item_type', 'stock_item')
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .order('ledger_seq', { ascending: false })
        .limit(5000),
      branch,
    )

    const dailySalesQuery = applyBranchFilter(
      db
        .from('daily_sales')
        .select('sale_date,branch_id,branch_name,total_sales,receipt_count')
        .gte('sale_date', addDays(today, -(Math.max(forecastSettings.lookbackWeeks * 7, 28) + 14)))
        .lte('sale_date', today)
        .order('sale_date', { ascending: true }),
      branch,
    )

    const savedForecastQuery = applyBranchFilter(
      db
        .from('sales_forecasts')
        .select('forecast_date,calc_receipt_count,adj_receipt_count')
        .gte('forecast_date', today)
        .lte('forecast_date', forecastEndDate)
        .order('forecast_date', { ascending: true }),
      branch,
    )

    const [movementResult, dailySalesResult, savedForecastResult] = await Promise.all([
      movementQuery,
      dailySalesQuery,
      savedForecastQuery,
    ])
    if (movementResult.error) throw movementResult.error

    const branchAliases = buildBranchNameAliases(
      branch.name,
      ...(dailySalesResult.data || []).map(row => row.branch_name).filter(Boolean),
    )
    const branchUuid = asUuidOrNull(branch.id)
    let saleLineRows = []

    if (branchUuid || branchAliases.length) {
      if (branchUuid) {
        saleLineRows = await fetchAllRows((from, to) =>
          db
            .from('sale_lines')
            .select('product_id,product_name,portion_id,portion_name,options_json,qty,line_gross_after_discount,sale_datetime,branch_id,branch_name')
            .eq('branch_id', branchUuid)
            .gte('sale_datetime', `${historyStartDate}T00:00:00`)
            .lte('sale_datetime', `${today}T23:59:59`)
            .order('sale_datetime', { ascending: true })
            .range(from, to),
        )
      }

      if (!saleLineRows.length && branchAliases.length) {
        saleLineRows = await fetchAllRows((from, to) =>
          db
            .from('sale_lines')
            .select('product_id,product_name,portion_id,portion_name,options_json,qty,line_gross_after_discount,sale_datetime,branch_id,branch_name')
            .in('branch_name', branchAliases)
            .gte('sale_datetime', `${historyStartDate}T00:00:00`)
            .lte('sale_datetime', `${today}T23:59:59`)
            .order('sale_datetime', { ascending: true })
            .range(from, to),
        )
      }
    }

    return {
      balanceRows: buildInventoryBalanceRows(movementResult.data || []),
      inventoryMovementRows: movementResult.data || [],
      purchaseMovementRows: (movementResult.data || []).filter(row => row.movement_type === 'purchase_receipt'),
      dailySalesRows: dailySalesResult.error ? [] : (dailySalesResult.data || []),
      savedForecastRows: savedForecastResult.error ? [] : (savedForecastResult.data || []),
      saleLineRows,
      errors: {
        dailySalesError: dailySalesResult.error || null,
        savedForecastError: savedForecastResult.error || null,
      },
    }
  }, [forecastSettings.lookbackWeeks])

  const loadBase = useCallback(async () => {
    setLoading(true)
    try {
      const [
        ordersResult,
        linesResult,
        receiptLinesResult,
        flowsResult,
        stockItemsResult,
        saleItemsResult,
        saleOptionsResult,
        stockTemplatesResult,
        contractsResult,
        suppliersResult,
        warehouseSettingsResult,
        settingsResult,
      ] = await Promise.all([
        db.from('purchase_orders').select('*').is('deleted_at', null).order('order_date', { ascending: false }).order('created_at', { ascending: false }),
        db.from('purchase_order_lines').select('*').is('deleted_at', null).order('line_no'),
        db.from('purchase_receipt_lines').select('order_line_id,received_qty').is('deleted_at', null),
        db.from('order_flows').select('*').is('deleted_at', null).order('name'),
        loadLatestStockItems(),
        db.from('sale_items').select('id,name,short_name,portions,recipe_rows,recipe_output_qty,substitute_id,active').eq('active', true).order('name'),
        db.from('sale_options').select('id,name,short_name,recipe_rows,sale_status').eq('sale_status', true).is('deleted_at', null).order('name'),
        db.from('stock_templates').select('*').order('name'),
        db.from('contracts').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
        db.from('suppliers').select('id,name,supplier_kind,source_branch_id').eq('active', true).order('name'),
        db.from('stock_item_warehouse_settings').select('*'),
        db.from('settings').select('value').eq('key', 'company_tree').single(),
      ])

      if (ordersResult.error) throw ordersResult.error
      if (linesResult.error) throw linesResult.error
      if (receiptLinesResult.error) throw receiptLinesResult.error
      if (flowsResult.error) throw flowsResult.error
      if (!Array.isArray(stockItemsResult)) throw new Error('Stok kartlari okunamadi')
      if (saleItemsResult.error) throw saleItemsResult.error
      if (saleOptionsResult.error) throw saleOptionsResult.error
      if (stockTemplatesResult.error) throw stockTemplatesResult.error
      if (contractsResult.error) throw contractsResult.error
      if (suppliersResult.error) throw suppliersResult.error
      if (warehouseSettingsResult.error) throw warehouseSettingsResult.error
      if (settingsResult.error) throw settingsResult.error

      const allTreeNodes = getAllBranches(settingsResult.data?.value)
      const nextBranches = allTreeNodes.filter(branch => {
        if (scope === 'anadepo') return branch.type === 'anadepo'
        if (scope === 'merkezmutfak') return branch.type === 'mutfak'
        return branch.type === 'sube'
      })
      const rememberedBranch = branchLocked ? workspaceBranchId : getStoredBranchId()
      const initialBranch = nextBranches.find(branch => branch.id === rememberedBranch)?.id || ''

      setOrders(ordersResult.data || [])
      setOrderLines(linesResult.data || [])
      setReceiptLines(receiptLinesResult.data || [])
      setAllCompanyBranches(allTreeNodes)
      setFlows((flowsResult.data || []).filter(flow => {
        if (scope === 'anadepo') return flow.receiver_scope === 'warehouse'
        if (scope === 'merkezmutfak') return flow.receiver_scope === 'kitchen'
        return flow.receiver_scope === 'branch' || !flow.receiver_scope
      }))
      setStockItems(stockItemsResult || [])
      setSaleItems(saleItemsResult.data || [])
      setSaleOptions(saleOptionsResult.data || [])
      setStockTemplates(stockTemplatesResult.data || [])
      setContracts(contractsResult.data || [])
      setSuppliers(suppliersResult.data || [])
      setAllWarehouseSettings(warehouseSettingsResult.data || [])
      setBranches(nextBranches)
      setSelectedBranch(prev => (
        branchLocked
          ? (nextBranches.find(branch => branch.id === workspaceBranchId)?.id || '')
          : (nextBranches.find(branch => branch.id === prev)?.id || initialBranch)
      ))
    } catch (error) {
      toast(`Siparisler yuklenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [branchLocked, loadLatestStockItems, scope, toast, workspaceBranchId])

  const loadInventory = useCallback(async branchId => {
    const branch = findBranchById(branches, branchId)
    if (!branch) {
      setBalanceRows([])
      setInventoryMovementRows([])
      setPurchaseMovementRows([])
      setDailySalesRows([])
      setSavedForecastRows([])
      setSaleLineRows([])
      setWmsMultiBranchBalances(new Map())
      setWmsMultiBranchDailyUsageMap(new Map())
      setWmsMultiBranchDailySales(new Map())
      setWmsMultiBranchForecasts(new Map())
      setWmsMultiBranchSaleLines(new Map())
      setWmsWarehouseSettings([])
      return
    }
    setInventoryLoading(true)
    try {
      const snapshot = await fetchBranchInventorySnapshot(branch)
      setBalanceRows(snapshot.balanceRows)
      setInventoryMovementRows(snapshot.inventoryMovementRows)
      setPurchaseMovementRows(snapshot.purchaseMovementRows)
      setDailySalesRows(snapshot.dailySalesRows)
      setSavedForecastRows(snapshot.savedForecastRows)
      setSaleLineRows(snapshot.saleLineRows)

      if (snapshot.errors?.dailySalesError) {
        toast(`Tahmin gecmisi okunamadi: ${snapshot.errors.dailySalesError.message}`, 'warning')
      }
      if (snapshot.errors?.savedForecastError) {
        toast(`Kayitli tahminler okunamadi: ${snapshot.errors.savedForecastError.message}`, 'warning')
      }

      if (isDepoSiparis) {
        const connected = getConnectedBranches(branchId)
        const wmsSnapshot = await fetchWmsSnapshot(branchId, connected)
        setWmsWarehouseSettings(wmsSnapshot.wmsWarehouseSettings)
        setWmsMultiBranchBalances(wmsSnapshot.wmsMultiBranchBalances)
        setWmsMultiBranchDailyUsageMap(wmsSnapshot.wmsMultiBranchDailyUsageMap)
        setWmsMultiBranchDailySales(wmsSnapshot.wmsMultiBranchDailySales)
        setWmsMultiBranchForecasts(wmsSnapshot.wmsMultiBranchForecasts)
        setWmsMultiBranchSaleLines(wmsSnapshot.wmsMultiBranchSaleLines)
      }
    } catch (error) {
      toast(`Stok verileri okunamadi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setInventoryLoading(false)
    }
  }, [branches, fetchBranchInventorySnapshot, toast, isDepoSiparis, getConnectedBranches, fetchWmsSnapshot])

  useEffect(() => {
    loadBase()
  }, [loadBase])

  useEffect(() => {
    if (!branchLocked || !workspaceBranchId) return
    setSelectedBranch(current => (current === workspaceBranchId ? current : workspaceBranchId))
  }, [branchLocked, workspaceBranchId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentClockHour(getCurrentLocalHour())
    }, 60000)
    return () => window.clearInterval(timer)
  }, [])

  const createOrdersForToday = useCallback(async ({ force = false } = {}) => {
    if (!selectedBranch) return 0
    const branch = findBranchById(branches, selectedBranch)
    if (!branch) return 0

    const today = todayStr()
    const generationHour = Number(forecastSettings.orderForecastGenerationHour ?? 6)
    const currentHour = getCurrentLocalHour()
    if (!force && currentHour < generationHour) return 0

    const missingFlows = collectMissingDueFlows({
      flows,
      orders,
      branch,
      branchId: selectedBranch,
      targetDate: today,
      stockItems,
      suppliers,
      stockTemplates,
      contracts,
    })
    if (!missingFlows.length) return 0

    const branchSnapshot = await fetchBranchInventorySnapshot(branch)
    const existingOrderNumbers = orders.map(order => order.order_no)
    let created = 0

    for (const flow of missingFlows) {
      const flowDates = getFlowDates(flow, today)
      
      let wmsData = {}
      if (flow.receiver_scope === 'warehouse') {
        const connected = getConnectedBranches(branch.id)
        wmsData = await fetchWmsSnapshot(branch.id, connected)
      }

      const allDraftLines = createDraftLines({
        order: { order_date: today },
        flow,
        branch,
        stockItems,
        saleItems,
        saleOptions,
        stockTemplates,
        contracts,
        allOrders: orders,
        allLines: orderLines,
        allReceiptLines: receiptLines,
        balanceRows: branchSnapshot.balanceRows,
        inventoryMovementRows: branchSnapshot.inventoryMovementRows,
        purchaseMovementRows: branchSnapshot.purchaseMovementRows,
        dailySalesRows: branchSnapshot.dailySalesRows,
        savedForecastRows: branchSnapshot.savedForecastRows,
        saleLineRows: branchSnapshot.saleLineRows,
        forecastLookbackWeeks: forecastSettings.lookbackWeeks,
        allSuppliers: suppliers,
        allWarehouseSettings,
        isDepoSiparis: flow.receiver_scope === 'warehouse',
        connectedBranches: flow.receiver_scope === 'warehouse' ? getConnectedBranches(branch.id) : [],
        ...wmsData,
      })

      // Group draft lines by their resolved supplier
      const linesBySupplier = {}
      for (const line of allDraftLines) {
        const item = stockItems.find(x => x.id === line.stock_item_id)
        const resolvedSupId = flow.receiver_scope === 'warehouse'
          ? flow.supplier_id
          : resolveBranchLineSupplierId(item, flow.supplier_id, suppliers)
        if (!linesBySupplier[resolvedSupId]) {
          linesBySupplier[resolvedSupId] = []
        }
        linesBySupplier[resolvedSupId].push(line)
      }

      for (const [supId, supLines] of Object.entries(linesBySupplier)) {
        if (!supLines.length) continue

        const existingOrder = orders.find(order =>
          order.flow_id === flow.id &&
          branchMatchesRecord(order, branch) &&
          toDateOnly(order.order_date) === toDateOnly(today) &&
          String(order.supplier_id).toLowerCase() === String(supId).toLowerCase() &&
          order.status !== 'cancelled'
        )
        if (existingOrder) continue

        const targetSupplier = suppliers.find(row => row.id === supId)
        const supplierKind = targetSupplier?.supplier_kind || 'external'
        if (flow.receiver_scope === 'warehouse' && supplierKind !== 'external') {
          toast('Ana depo satinalma akisi yalnizca dis tedarikci ile siparis olusturabilir.', 'error')
          continue
        }
        
        let flowChannel = 'external_purchase'
        if (supplierKind === 'internal_warehouse') flowChannel = 'warehouse_replenishment'
        else if (supplierKind === 'internal_kitchen') flowChannel = 'kitchen_replenishment'

        // Re-index lines sequentially for the split order
        const seqLines = supLines.map((line, index) => ({
          ...line,
          line_no: index + 1,
        }))

        const summary = summarizeLines(seqLines)
        const orderNo = nextDocumentNo('SP', today, existingOrderNumbers)
        existingOrderNumbers.push(orderNo)

        const orderPayload = {
          order_no: orderNo,
          branch_id: asUuidOrNull(branch.id),
          branch_name: branch.name,
          flow_id: asUuidOrNull(flow.id),
          flow_name: flow.name,
          flow_channel: flowChannel,
          supplier_id: asUuidOrNull(supId),
          supplier_name: targetSupplier?.name || '',
          description: flow.description || '',
          order_source: 'flow',
          status: 'pending_action',
          order_date: today,
          cutoff_at: flowDates.cutoffTime ? `${today}T${flowDates.cutoffTime}:00` : null,
          delivery_date: flowDates.deliveryDate || null,
          delivery_time: flowDates.deliveryTime || null,
          next_order_date: flowDates.nextOrderDate || null,
          next_delivery_date: flowDates.nextDeliveryDate || null,
          qty_mode: flow.qty_mode || 'tahmin',
          auto_send_mode: describeCutoffBehavior(flow),
          branch_approval: !!flow.branch_approval,
          hq_approval: !!flow.hq_approval,
          needs_manager_approval: !!(flow.branch_approval || flow.hq_approval),
          manager_approval_status: 'not_required',
          total_qty: summary.totalQty,
          subtotal: summary.subtotal,
          total_amount: summary.subtotal,
          suggestion_refreshed_at: new Date().toISOString(),
          submitted_at: null,
          cancelled_at: null,
          cancelled_reason: null,
          notes: null,
          meta: flow.receiver_scope && flow.receiver_scope !== 'branch' ? { receiver_scope: flow.receiver_scope } : {},
        }

        const { data: insertedOrder, error: insertOrderError } = await db
          .from('purchase_orders')
          .insert(orderPayload)
          .select('*')
          .single()
        if (insertOrderError) throw insertOrderError

        const { error: insertLinesError } = await db
          .from('purchase_order_lines')
          .insert(seqLines.map(line => toPurchaseOrderLinePayload(line, insertedOrder.id)))
        if (insertLinesError) throw insertLinesError

        await logActivity({
          user,
          actionType: 'purchase_order_create',
          route: flow.receiver_scope === 'warehouse' ? '/depo-satinalma' : '/orders',
          entityType: 'purchase_order',
          entityId: insertedOrder.id,
          metadata: {
            branch_id: branch.id,
            flow_id: flow.id,
            order_no: insertedOrder.order_no,
            status: insertedOrder.status,
          },
        })

        created += 1
      }
    }

    return created
  }, [
    selectedBranch,
    branches,
    orders,
    flows,
    suppliers,
    stockItems,
    saleItems,
    saleOptions,
    stockTemplates,
    contracts,
    allWarehouseSettings,
    orderLines,
    receiptLines,
    balanceRows,
    inventoryMovementRows,
    purchaseMovementRows,
    dailySalesRows,
    savedForecastRows,
    saleLineRows,
    fetchBranchInventorySnapshot,
    fetchWmsSnapshot,
    forecastSettings.lookbackWeeks,
    forecastSettings.orderForecastGenerationHour,
    getConnectedBranches,
    toast,
    user,
  ])

  useEffect(() => {
    if (loading || !selectedBranch) return
    const signature = [
      selectedBranch,
      todayStr(),
      currentClockHour,
      forecastSettings.orderForecastGenerationHour,
      flows.length,
      orders.length,
      orderLines.length,
    ].join(':')
    if (generationRef.current === signature) return
    generationRef.current = signature

    let cancelled = false
    ;(async () => {
      try {
        const created = await createOrdersForToday()
        if (!cancelled && created > 0) {
          toast(`${created} siparis otomatik olusturuldu`, 'success')
          await loadBase()
        }
      } catch (error) {
        if (!cancelled) toast(`Otomatik siparis olusturulamadi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
      }
    })()
    return () => { cancelled = true }
  }, [loading, selectedBranch, currentClockHour, forecastSettings.orderForecastGenerationHour, flows.length, orders.length, orderLines.length, createOrdersForToday, loadBase, toast])

  const branchOrders = useMemo(() => (
    orders.filter(order => {
      if (!selectedBranchRecord) return false
      if (selectedBranchRecord && !branchMatchesRecord(order, selectedBranchRecord)) return false

      const orderMeta = parseJsonValue(order.meta, {})
      const orderReceiverScope = orderMeta.receiver_scope

      if (scope === 'anadepo') {
        return (orderReceiverScope === 'warehouse' || (!orderReceiverScope && selectedBranchRecord?.type === 'anadepo')) && order.flow_channel === 'external_purchase'
      }
      if (scope === 'merkezmutfak') {
        return (orderReceiverScope === 'kitchen' || (!orderReceiverScope && selectedBranchRecord?.type === 'mutfak')) && order.flow_channel === 'external_purchase'
      }
      return (!orderReceiverScope || orderReceiverScope === 'branch')
    })
  ), [orders, selectedBranchRecord, scope])

  const filteredOrders = useMemo(() => {
    const text = search.trim().toLowerCase()
    return branchOrders.filter(order => {
      const inTab = ORDER_TAB_DEFS.find(tab => tab.key === activeTab)?.statuses.includes(order.status)
      if (!inTab) return false
      if (!text) return true
      const supplier = suppliers.find(row => row.id === order.supplier_id)?.name || order.supplier_name || ''
      const haystack = [
        order.order_no,
        order.flow_name,
        order.description,
        supplier,
        order.branch_name,
      ].join(' ').toLowerCase()
      return haystack.includes(text)
    })
  }, [branchOrders, activeTab, search, suppliers])

  const tabCounts = useMemo(() => {
    return branchOrders.reduce((acc, order) => {
      const key = ORDER_TAB_DEFS.find(tab => tab.statuses.includes(order.status))?.key
      if (key) acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
  }, [branchOrders])

  const selectedOrder = useMemo(
    () => orders.find(order => order.id === detailOrderId) || null,
    [orders, detailOrderId],
  )

  const selectedOrderLines = useMemo(
    () => orderLines.filter(line => line.order_id === detailOrderId).sort((a, b) => Number(a.line_no || 0) - Number(b.line_no || 0)),
    [orderLines, detailOrderId],
  )

  const summary = useMemo(() => {
    return filteredOrders.reduce((acc, order) => {
      acc.count += 1
      acc.total += Number(order.total_amount || 0)
      acc.qty += Number(order.total_qty || 0)
      return acc
    }, { count: 0, total: 0, qty: 0 })
  }, [filteredOrders])

  async function refreshSingleOrder(order, options = {}) {
    const flow = flows.find(item => item.id === order.flow_id)
    const branch = branches.find(item => branchMatchesRecord(order, item)) || selectedBranchRecord
    if (!flow || !branch) return selectedOrderLines

    const latestStockItems = await loadLatestStockItems()
    const branchSnapshot = await fetchBranchInventorySnapshot(branch)
    setStockItems(latestStockItems)

    let wmsData = {}
    if (flow.receiver_scope === 'warehouse') {
      const connected = getConnectedBranches(branch.id)
      wmsData = await fetchWmsSnapshot(branch.id, connected)
    }

    return createDraftLines({
      order,
      flow,
      branch,
      stockItems: latestStockItems,
      saleItems,
      saleOptions,
      stockTemplates,
      contracts,
        allOrders: orders,
        allLines: orderLines,
        allReceiptLines: receiptLines,
        balanceRows: branchSnapshot.balanceRows,
      inventoryMovementRows: branchSnapshot.inventoryMovementRows,
      purchaseMovementRows: branchSnapshot.purchaseMovementRows,
      dailySalesRows: branchSnapshot.dailySalesRows,
      savedForecastRows: branchSnapshot.savedForecastRows,
      saleLineRows: branchSnapshot.saleLineRows,
      forecastLookbackWeeks: forecastSettings.lookbackWeeks,
      assumedInboundOrderIds: options.assumedInboundOrderIds,
      targetSupplierId: order.supplier_id,
      allSuppliers: suppliers,
      allWarehouseSettings,
      isDepoSiparis: flow.receiver_scope === 'warehouse',
      connectedBranches: flow.receiver_scope === 'warehouse' ? getConnectedBranches(branch.id) : [],
      ...wmsData,
    })
  }

  async function persistOrder({ order, action, lines, actionNote }) {
    const cleanedLines = (lines || []).map((line, index) => {
      const qty = Number(line.ordered_qty || 0)
      const unitPrice = Number(line.unit_price || 0)
      return {
        ...line,
        line_no: index + 1,
        ordered_qty: qty,
        unit_price: unitPrice,
        line_total: Number((qty * unitPrice).toFixed(4)),
        meta: {
          ...(line.meta || {}),
          warnings: getOrderWarnings(stockItems.find(item => item.id === line.stock_item_id) || line, qty),
        },
      }
    })

    const totals = summarizeLines(cleanedLines)
    let nextStatus = order.status
    let managerApprovalStatus = order.manager_approval_status || 'not_required'
    let submittedAt = order.submitted_at || null

    if (action === 'draft') {
      nextStatus = 'draft'
      managerApprovalStatus = order.needs_manager_approval ? 'pending' : 'not_required'
    }
    if (action === 'submit') {
      if (order.needs_manager_approval) {
        nextStatus = 'awaiting_approval'
        managerApprovalStatus = 'pending'
      } else {
        nextStatus = 'submitted'
        managerApprovalStatus = 'not_required'
        submittedAt = new Date().toISOString()
      }
    }
    if (action === 'approve') {
      nextStatus = 'submitted'
      managerApprovalStatus = 'approved'
      submittedAt = new Date().toISOString()
    }

    const payload = {
      status: nextStatus,
      manager_approval_status: managerApprovalStatus,
      total_qty: totals.totalQty,
      subtotal: totals.subtotal,
      total_amount: totals.subtotal,
      notes: actionNote?.trim() || null,
      submitted_at: submittedAt,
      suggestion_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const previousOrderPayload = {
      status: order.status,
      manager_approval_status: order.manager_approval_status || 'not_required',
      total_qty: Number(order.total_qty || 0),
      subtotal: Number(order.subtotal || 0),
      total_amount: Number(order.total_amount || 0),
      notes: order.notes || null,
      submitted_at: order.submitted_at || null,
      suggestion_refreshed_at: order.suggestion_refreshed_at || null,
      updated_at: order.updated_at || null,
    }

    const { data: previousLines = [], error: previousLinesError } = await db
      .from('purchase_order_lines')
      .select('*')
      .eq('order_id', order.id)
      .order('line_no')
    if (previousLinesError) throw previousLinesError

    try {
      const { error: orderError } = await db.from('purchase_orders').update(payload).eq('id', order.id)
      if (orderError) throw orderError

      const { error: deleteLinesError } = await db.from('purchase_order_lines').delete().eq('order_id', order.id)
      if (deleteLinesError) throw deleteLinesError

      if (cleanedLines.length > 0) {
        const { error: insertLinesError } = await db
          .from('purchase_order_lines')
          .insert(cleanedLines.map(line => toPurchaseOrderLinePayload(line, order.id)))
        if (insertLinesError) throw insertLinesError
      }
    } catch (error) {
      await db.from('purchase_orders').update(previousOrderPayload).eq('id', order.id)

      if (previousLines.length > 0) {
        await db
          .from('purchase_order_lines')
          .insert(previousLines.map(({ id, created_at, updated_at, ...line }) => line))
      }

      throw error
    }

    const isRep = order.flow_channel === 'warehouse_replenishment' || order.flow_channel === 'kitchen_replenishment'
    toast(
      action === 'approve'
        ? (isRep ? 'İkmal talebi onaylandı ve WMS\'e iletildi' : 'Siparis onaylandi ve gonderildi')
        : action === 'submit'
          ? (order.needs_manager_approval 
              ? (isRep ? 'İkmal talebi onaya gonderildi' : 'Siparis onaya gonderildi')
              : (isRep ? 'İkmal talebi WMS konsoluna gönderildi' : 'Siparis tedarikciye gonderildi'))
          : (isRep ? 'İkmal talebi taslak olarak kaydedildi' : 'Siparis taslak olarak kaydedildi'),
      'success',
    )
    await logActivity({
      user,
      actionType: 'purchase_order_update',
      route: '/orders',
      entityType: 'purchase_order',
      entityId: order.id,
      metadata: {
        action,
        status: nextStatus,
        manager_approval_status: managerApprovalStatus,
        total_qty: totals.totalQty,
        total_amount: totals.subtotal,
      },
    })
    await loadBase()
  }

  async function cancelOrder({ order, reason }) {
    if (!reason?.trim()) {
      toast('Iptal nedeni zorunludur', 'error')
      return
    }
    try {
      const { error } = await db
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason.trim(),
          notes: reason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id)
      if (error) throw error
      await logActivity({
        user,
        actionType: 'purchase_order_delete',
        route: '/orders',
        entityType: 'purchase_order',
        entityId: order.id,
        metadata: {
          action: 'cancel',
          reason: reason.trim(),
        },
      })
      toast('Siparis iptal edildi', 'success')
      setDetailOrderId('')
      await loadBase()
    } catch (error) {
      toast(`Siparis iptal edilemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    }
  }

  const branchName = selectedBranchRecord?.name || (isDepoSiparis ? 'Depo secin' : isMutfakSiparis ? 'Mutfak secin' : 'Sube secin')
  const pageTitle = isDepoSiparis ? 'Depo Satinalma Siparisleri' : isMutfakSiparis ? 'Mutfak Satinalma Siparisleri' : 'Siparisler'
  const pageSubtitle = selectedBranchRecord
    ? (isDepoSiparis ? `${branchName} ihtiyaci` : isMutfakSiparis ? `${branchName} ihtiyaci` : `${branchName} subesi`)
    : (isDepoSiparis ? 'Ana depo secimi bekleniyor' : isMutfakSiparis ? 'Mutfak secimi bekleniyor' : 'Sube secimi bekleniyor')

  return (
    <div>
      <Header
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              className="f-input"
              value={selectedBranch}
              onChange={e => setSelectedBranch(e.target.value)}
              style={{ minWidth: 220 }}
              disabled={branchLocked}
            >
              <option value="">{isDepoSiparis ? 'Depo secin' : isMutfakSiparis ? 'Mutfak secin' : 'Sube secin'}</option>
              {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <button className="btn-o" onClick={() => { loadBase() }}>
              <i className="fa-solid fa-rotate-right" /> Yenile
            </button>
            <button className="btn-p" onClick={async () => {
              try {
                const created = await createOrdersForToday({ force: true })
                if (created > 0) {
                  toast(`${created} siparis olusturuldu`, 'success')
                  await loadBase()
                } else {
                  toast('Olusturulacak yeni siparis bulunmuyor', 'info')
                }
              } catch (error) {
                toast(`Siparisler olusturulamadi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
              }
            }}>
              <i className="fa-solid fa-bolt" /> Bugunun Siparislerini Olustur
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Gorunen Siparis" value={summary.count} />
        <SummaryCard label="Toplam Miktar" value={formatQty(summary.qty)} bg="#ecfeff" color="#0f766e" />
        <SummaryCard label="Toplam Tutar" value={`₺${formatMoney(summary.total)}`} bg="#eef2ff" color="#4338ca" />
        <SummaryCard
          label="Stok Verisi"
          value={inventoryLoading ? 'Yukleniyor' : (balanceRows.length > 0 ? `${balanceRows.length} bakiye` : 'Talep uzerine')}
          hint={balanceRows.length > 0 ? 'Stok hareketlerinden okunur' : 'Siparis olusturma / guncellemede okunur'}
          bg="#fffbeb"
          color="#92400e"
        />
      </div>

      <OrderTabBar activeTab={activeTab} onChange={setActiveTab} counts={tabCounts} />

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ position: 'relative', maxWidth: 420 }}>
          <i className="fa-solid fa-magnifying-glass" style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            fontSize: '.82rem',
          }} />
          <input
            className="f-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Siparis no, akis, aciklama veya tedarikci ara..."
            style={{ paddingLeft: 34 }}
          />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.4rem' }} />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#f8fafc',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}>
              <i className="fa-solid fa-receipt" style={{ color: '#94a3b8', fontSize: '1.4rem' }} />
            </div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem' }}>Goruntulenecek siparis yok</div>
            <p style={{ color: '#94a3b8', marginTop: 6 }}>Secili sekme ve sube icin henuz kayit olusmadi.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Siparis No', 'Is Akisi Tanimi', 'Aciklama', 'Son Siparis Saati', 'Sonrasi', 'Toplam Adet', 'Toplam Tutar', 'Yonetici Onayi', 'Durum', ''].map(label => (
                    <th key={label} style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', textAlign: label === 'Aciklama' || label === 'Is Akisi Tanimi' ? 'left' : 'right', color: '#475569', whiteSpace: 'nowrap' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const meta = ORDER_STATUS_META[order.status] || ORDER_STATUS_META.pending_action
                  const supplierNotes = getSupplierNotes(order)
                  const lastSupplierNote = supplierNotes[0]
                  return (
                    <tr key={order.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{order.order_no}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#334155' }}>
                        <div>{order.flow_name || '—'}</div>
                        {order.flow_channel === 'warehouse_replenishment' && (
                          <span style={{ display: 'inline-block', fontSize: '.68rem', padding: '1px 6px', borderRadius: 4, background: '#f3e8ff', color: '#6b21a8', marginTop: 4, fontWeight: 800 }}>
                            WMS İkmal
                          </span>
                        )}
                        {order.flow_channel === 'kitchen_replenishment' && (
                          <span style={{ display: 'inline-block', fontSize: '.68rem', padding: '1px 6px', borderRadius: 4, background: '#ffedd5', color: '#c2410c', marginTop: 4, fontWeight: 800 }}>
                            Mutfak İkmal
                          </span>
                        )}
                        {order.flow_channel === 'external_purchase' && (
                          <span style={{ display: 'inline-block', fontSize: '.68rem', padding: '1px 6px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1', marginTop: 4, fontWeight: 800 }}>
                            Dış Satın Alma
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'left', color: '#64748b' }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span>{order.description || '—'}</span>
                          {lastSupplierNote && (
                            <span style={{ fontSize: '.72rem', color: '#1d4ed8' }}>
                              Tedarikci notu: {lastSupplierNote.message || lastSupplierNote.note || '—'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#334155' }}>{formatDateTime(order.order_date, order.cutoff_at)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: '#64748b' }}>{order.auto_send_mode || '—'}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>{formatQty(order.total_qty)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>₺{formatMoney(order.total_amount)}</td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: order.needs_manager_approval ? '#92400e' : '#94a3b8', fontWeight: 700 }}>
                        {order.needs_manager_approval ? 'Gerekli' : 'Yok'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <Badge meta={meta} />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <button className="btn-o" onClick={() => setDetailOrderId(order.id)}>
                          Islem Yap
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OrderDetailModal
        open={!!selectedOrder}
        order={selectedOrder}
        lines={selectedOrderLines}
        flow={flows.find(flow => flow.id === selectedOrder?.flow_id)}
        supplier={suppliers.find(supplier => supplier.id === selectedOrder?.supplier_id)}
        onClose={() => setDetailOrderId('')}
        onRefresh={refreshSingleOrder}
        onSaveAction={persistOrder}
        onCancelOrder={payload => setConfirmCancel(payload)}
      />

      <ConfirmDialog
        open={!!confirmCancel}
        title="Siparis iptal edilsin mi?"
        desc="Siparis iptal edildiginde Mal Kabul ekranina dusmez. Iptal nedeni zorunludur ve siparis kartina not olarak yazilir."
        onCancel={() => setConfirmCancel(null)}
        onConfirm={async () => {
          const payload = confirmCancel
          setConfirmCancel(null)
          await cancelOrder(payload)
        }}
      />
    </div>
  )
}
