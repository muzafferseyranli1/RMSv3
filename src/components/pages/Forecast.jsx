import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import { readForecastSettings } from '@/lib/forecastSettings'
import { isBranchScopedScope } from '@/lib/workspace'

const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
const PAGE_SIZE = 1000
const PRODUCTIVITY_DISPLAY_RECEIPT_BASE = 1000
const STANDARD_PORTION_ID = '__standart__'

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDateParts(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function createUtcDate(value) {
  const parts = parseIsoDateParts(value)
  if (!parts) return null
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

function formatUtcIso(date) {
  return date.toISOString().slice(0, 10)
}

function todayIso() {
  return formatLocalDate(new Date())
}

function toDateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function addDays(dateStr, days) {
  const date = createUtcDate(dateStr)
  if (!date) return ''
  date.setUTCDate(date.getUTCDate() + days)
  return formatUtcIso(date)
}

function startOfWeek(dateStr) {
  const date = createUtcDate(dateStr)
  if (!date) return ''
  const dayIndex = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayIndex)
  return formatUtcIso(date)
}

function diffDays(fromDate, toDate) {
  const start = createUtcDate(fromDate)
  const end = createUtcDate(toDate)
  if (!start || !end) return 0
  return Math.round((end - start) / 86400000)
}

function getDayIndex(dateStr) {
  const date = createUtcDate(dateStr)
  if (!date) return 0
  return (date.getUTCDay() + 6) % 7
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  return createUtcDate(dateStr)?.toLocaleDateString('tr-TR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }) || 'â€”'
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  return createUtcDate(dateStr)?.toLocaleDateString('tr-TR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
  }) || 'â€”'
}

function formatNumber(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatCurrency(value, digits = 0) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatCompactDate(value) {
  return toDateOnly(value).replaceAll('-', '')
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function parseJsonValue(value, fallback) {
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

function createSaleItemMixKey(productId, portionId = STANDARD_PORTION_ID) {
  return `sale_item:${String(productId || '').trim()}:${normalizePortionValue(portionId)}`
}

function createOptionMixKey(optionId, optionName = '') {
  const normalizedId = String(optionId || '').trim()
  if (normalizedId) return `sale_option:${normalizedId}`

  const nameKey = normalizeLookupKey(optionName)
  return nameKey ? `sale_option_name:${nameKey}` : ''
}

function buildSaleItemDisplayName(baseName, portionName, portionId) {
  return normalizePortionValue(portionId) === STANDARD_PORTION_ID
    ? baseName
    : `${baseName} - ${portionName || portionId}`
}

function buildSecondaryLabel(itemType, portionId, portionName) {
  if (itemType === 'sale_option') return 'Secenek'
  return normalizePortionValue(portionId) === STANDARD_PORTION_ID
    ? 'Standart recete'
    : `Boyut: ${portionName || portionId}`
}

function resolvePortionMeta(item, portionId, fallbackName = '') {
  const normalizedPortionId = normalizePortionValue(portionId)
  const portions = parseJsonValue(item?.portions, []).filter(Boolean)
  const matchedPortion = portions.find(entry => String(entry?.id || '').trim() === normalizedPortionId) || null

  if (normalizedPortionId === STANDARD_PORTION_ID) {
    return {
      portionId: normalizedPortionId,
      portionName: fallbackName || 'Standart',
      priceOffset: 0,
    }
  }

  return {
    portionId: normalizedPortionId,
    portionName: matchedPortion?.name || fallbackName || normalizedPortionId,
    priceOffset: safeNumber(matchedPortion?.price_offset, 0),
  }
}

function minIsoDate(...values) {
  return values.filter(Boolean).sort()[0] || ''
}

function maxIsoDate(...values) {
  const sorted = values.filter(Boolean).sort()
  return sorted[sorted.length - 1] || ''
}

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
      if (parts.length > 1) {
        aliases.add(parts.slice(1).join(' '))
      }
    }
  }

  return [...aliases].filter(Boolean)
}

function aggregateDailySalesRows(rows, selectedBranch, selectedBranchName) {
  const byDate = new Map()

  for (const row of rows || []) {
    const saleDate = toDateOnly(row.sale_date || row.sale_datetime)
    if (!saleDate) continue

    const current = byDate.get(saleDate) || {
      id: `${selectedBranch || 'branch'}:${saleDate}`,
      sale_date: saleDate,
      branch_id: selectedBranch || row.branch_id || null,
      branch_name: selectedBranchName || row.branch_name || '',
      total_sales: 0,
      receipt_count: 0,
    }

    current.total_sales += safeNumber(
      row.total_sales,
      row.payment_total ?? row.gross_total_after_discount ?? row.net_total_after_discount ?? 0,
    )
    current.receipt_count += Math.max(0, Math.round(safeNumber(row.receipt_count, row.sale_date ? 0 : 1)))
    current.branch_name = current.branch_name || row.branch_name || selectedBranchName || ''
    byDate.set(saleDate, current)
  }

  return [...byDate.values()].sort((left, right) => left.sale_date.localeCompare(right.sale_date))
}

function mergeDailySalesRows(preAggregatedRows, rawSalesRows, selectedBranch, selectedBranchName) {
  const merged = new Map()

  for (const row of aggregateDailySalesRows(preAggregatedRows, selectedBranch, selectedBranchName)) {
    merged.set(row.sale_date, row)
  }

  for (const row of aggregateDailySalesRows(rawSalesRows, selectedBranch, selectedBranchName)) {
    merged.set(row.sale_date, row)
  }

  return [...merged.values()].sort((left, right) => left.sale_date.localeCompare(right.sale_date))
}

function weightedAverage(values, weights) {
  let weightedTotal = 0
  let weightTotal = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index])
    const weight = Number(weights[index] ?? 0)
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue
    weightedTotal += value * weight
    weightTotal += weight
  }
  return weightTotal > 0 ? weightedTotal / weightTotal : 0
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

function resolveConfiguredPrice(item, portionId = null) {
  const directPrice = safeNumber(item?.sale_price, null)
  if (directPrice != null && directPrice > 0) {
    if (portionId == null) return directPrice
    return Math.max(0, directPrice + safeNumber(resolvePortionMeta(item, portionId).priceOffset, 0))
  }

  const standardPrice = safeNumber(item?.standard_price, null)
  if (standardPrice != null && standardPrice > 0) {
    if (portionId == null) return standardPrice
    return Math.max(0, standardPrice + safeNumber(resolvePortionMeta(item, portionId).priceOffset, 0))
  }

  const channelPrices = parseJsonValue(item?.channel_prices, [])
  if (!Array.isArray(channelPrices)) return null
  const prices = channelPrices
    .filter(entry => entry?.active !== false)
    .map(entry => safeNumber(entry?.price, null))
    .filter(price => price != null && price > 0)

  if (!prices.length) return null
  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length
  if (portionId == null) return averagePrice
  return Math.max(0, averagePrice + safeNumber(resolvePortionMeta(item, portionId).priceOffset, 0))
}

function getEditableState(dateStr, allowFutureManualAdjustments, cutoffHour) {
  if (!allowFutureManualAdjustments) {
    return { editable: false, reason: 'Manuel fiş düzeltmesi ayarlardan kapalı.' }
  }

  const today = todayIso()
  if (dateStr > today) return { editable: true, reason: '' }
  if (dateStr < today) return { editable: false, reason: 'Geçmiş gün fiş sayısı kilitli.' }

  const currentHour = new Date().getHours()
  if (currentHour >= cutoffHour) {
    return { editable: false, reason: `${String(cutoffHour).padStart(2, '0')}:00 sonrası bugün kilitli.` }
  }

  return { editable: true, reason: '' }
}

function collectSameWeekdayRows(dailyRows, targetDate, lookbackWeeks) {
  const minDate = addDays(targetDate, -(lookbackWeeks * 7 + 1))
  return dailyRows
    .filter(row =>
      row.sale_date < targetDate &&
      row.sale_date >= minDate &&
      getDayIndex(row.sale_date) === getDayIndex(targetDate)
    )
    .sort((left, right) => left.sale_date.localeCompare(right.sale_date))
}

function computeReceiptForecast(samples, targetDate) {
  if (!samples.length) return null

  const weights = samples.map((_, index) => index + 1)
  const receiptValues = samples.map(row => safeNumber(row.receipt_count))
  const avgTicketValues = samples.map(row => {
    const receiptCount = safeNumber(row.receipt_count)
    if (receiptCount <= 0) return 0
    return safeNumber(row.total_sales) / receiptCount
  })

  const weightedReceipts = weightedAverage(receiptValues, weights)
  const weightedAvgTicket = weightedAverage(avgTicketValues, weights)
  const firstSample = samples[0]
  const lastSample = samples[samples.length - 1]
  const trendPerWeek = samples.length > 1
    ? (safeNumber(lastSample.receipt_count) - safeNumber(firstSample.receipt_count)) / (samples.length - 1)
    : 0
  const weeksAhead = Math.max(1, Math.round(diffDays(lastSample.sale_date, targetDate) / 7))
  const trendAdjustment = clamp(
    trendPerWeek * weeksAhead * 0.35,
    -weightedReceipts * 0.18,
    weightedReceipts * 0.18,
  )
  const calcReceiptCount = Math.max(0, Math.round(weightedReceipts + trendAdjustment))

  return {
    calcReceiptCount,
    weightedAvgTicket,
    trendPerWeek,
    sampleCount: samples.length,
  }
}

function buildActualMixByDate(lineRows) {
  const byDate = new Map()

  for (const row of lineRows) {
    const saleDate = toDateOnly(row.sale_datetime)
    if (!saleDate) continue

    const productId = row.product_id || row.product_name
    const productName = row.product_name || 'Ürün'
    const quantity = safeNumber(row.qty)
    const lineSales = safeNumber(row.line_gross_after_discount)
    if (quantity <= 0 && lineSales <= 0) continue

    if (!byDate.has(saleDate)) byDate.set(saleDate, new Map())
    const byProduct = byDate.get(saleDate)
    const current = byProduct.get(productId) || { productId, productName, qty: 0, sales: 0 }
    current.qty += quantity
    current.sales += lineSales
    byProduct.set(productId, current)
  }

  const normalized = new Map()
  for (const [saleDate, productMap] of byDate.entries()) {
    normalized.set(
      saleDate,
      [...productMap.values()]
        .map(item => ({ ...item, unitPrice: item.qty > 0 ? item.sales / item.qty : 0 }))
        .sort((left, right) => right.sales - left.sales),
    )
  }

  return normalized
}

function buildPriceCatalog(saleItems, actualMixByDate) {
  const catalog = new Map()
  const fallback = new Map()

  for (const item of saleItems) {
    const estimatedProductivity = safeNumber(item?.substitute_id, null)
    catalog.set(item.id, {
      productId: item.id,
      productName: item.short_name || item.name,
      configuredPrice: resolveConfiguredPrice(item),
      estimatedProductivity: estimatedProductivity != null && estimatedProductivity > 0 ? estimatedProductivity : null,
    })
  }

  for (const items of actualMixByDate.values()) {
    for (const item of items) {
      const current = fallback.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        qty: 0,
        sales: 0,
      }
      current.qty += item.qty
      current.sales += item.sales
      fallback.set(item.productId, current)
    }
  }

  for (const [productId, item] of fallback.entries()) {
    const current = catalog.get(productId) || {
      productId,
      productName: item.productName,
      configuredPrice: null,
    }
    current.historicalPrice = item.qty > 0 ? item.sales / item.qty : null
    current.productName = current.productName || item.productName
    catalog.set(productId, current)
  }

  return catalog
}

function buildMixProjection(samples, actualMixByDate, priceCatalog, receiptCount) {
  if (receiptCount <= 0) {
    return { items: [], totalSales: 0, historyDaysUsed: 0, mixSource: 'avg-ticket' }
  }

  const aggregated = new Map()
  let receiptsWithMix = 0
  let historyDaysUsed = 0

  for (const sample of samples) {
    const sampleMix = actualMixByDate.get(sample.sale_date) || []
    if (!sampleMix.length) continue

    const sampleReceipts = safeNumber(sample.receipt_count)
    if (sampleReceipts <= 0) continue

    receiptsWithMix += sampleReceipts
    historyDaysUsed += 1

    for (const item of sampleMix) {
      const current = aggregated.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        qty: 0,
        sales: 0,
      }
      current.qty += safeNumber(item.qty)
      current.sales += safeNumber(item.sales)
      aggregated.set(item.productId, current)
    }
  }

  if (receiptsWithMix <= 0 && ![...priceCatalog.values()].some(item => item?.estimatedProductivity > 0)) {
    return { items: [], totalSales: 0, historyDaysUsed: 0, mixSource: 'avg-ticket' }
  }

  const items = [...aggregated.values()]
    .map(item => {
      const priceMeta = priceCatalog.get(item.productId)
      const currentPrice = priceMeta?.configuredPrice ?? priceMeta?.historicalPrice ?? (item.qty > 0 ? item.sales / item.qty : 0)
      const productivityPerReceipt = item.qty / receiptsWithMix
      const forecastQty = productivityPerReceipt * receiptCount
      const forecastSales = forecastQty * currentPrice

      return {
        productId: item.productId,
        productName: priceMeta?.productName || item.productName,
        productivityPer1000Receipts: productivityPerReceipt * PRODUCTIVITY_DISPLAY_RECEIPT_BASE,
        forecastQty,
        forecastSales,
        currentPrice,
        isEstimatedProductivity: false,
      }
    })
  for (const priceMeta of priceCatalog.values()) {
    if (!priceMeta?.estimatedProductivity || items.some(item => item.productId === priceMeta.productId)) continue

    const productivityPerReceipt = priceMeta.estimatedProductivity / PRODUCTIVITY_DISPLAY_RECEIPT_BASE
    const forecastQty = productivityPerReceipt * receiptCount
    const currentPrice = priceMeta.configuredPrice ?? priceMeta.historicalPrice ?? 0
    const forecastSales = forecastQty * currentPrice

    items.push({
      productId: priceMeta.productId,
      productName: priceMeta.productName,
      productivityPer1000Receipts: priceMeta.estimatedProductivity,
      forecastQty,
      forecastSales,
      currentPrice,
      isEstimatedProductivity: true,
    })
  }

  const normalizedItems = items
    .filter(item => item.forecastQty > 0.01)
    .sort((left, right) => right.forecastSales - left.forecastSales)

  return {
    items: normalizedItems,
    totalSales: normalizedItems.reduce((sum, item) => sum + item.forecastSales, 0),
    historyDaysUsed,
    mixSource: normalizedItems.length ? 'product-mix' : 'avg-ticket',
  }
}

function buildDetailedActualMixByDate(lineRows) {
  const byDate = new Map()

  for (const row of lineRows || []) {
    const saleDate = toDateOnly(row.sale_datetime)
    if (!saleDate) continue

    const quantity = safeNumber(row.qty)
    const lineSales = safeNumber(row.line_gross_after_discount)
    if (quantity <= 0 && lineSales <= 0) continue

    if (!byDate.has(saleDate)) byDate.set(saleDate, new Map())
    const byItem = byDate.get(saleDate)

    const productId = row.product_id || row.product_name
    const productName = row.product_name || 'Urun'
    if (productId) {
      const portionId = normalizePortionValue(row.portion_id)
      const portionName = row.portion_name || (portionId === STANDARD_PORTION_ID ? 'Standart' : portionId)
      const itemKey = createSaleItemMixKey(productId, portionId)
      const currentSaleItem = byItem.get(itemKey) || {
        itemKey,
        itemType: 'sale_item',
        itemId: productId,
        productId,
        optionId: null,
        baseName: productName,
        displayName: buildSaleItemDisplayName(productName, portionName, portionId),
        secondaryLabel: buildSecondaryLabel('sale_item', portionId, portionName),
        portionId,
        portionName,
        qty: 0,
        sales: 0,
        countsTowardSales: true,
      }
      currentSaleItem.qty += quantity
      currentSaleItem.sales += lineSales
      byItem.set(itemKey, currentSaleItem)
    }

    const selectedOptions = parseJsonValue(row.options_json, [])
    for (const option of selectedOptions || []) {
      const itemKey = createOptionMixKey(option?.id, option?.name)
      if (!itemKey) continue

      const optionName = option?.name || 'Secenek'
      const currentOption = byItem.get(itemKey) || {
        itemKey,
        itemType: 'sale_option',
        itemId: option?.id || null,
        productId: null,
        optionId: option?.id || null,
        baseName: optionName,
        displayName: optionName,
        secondaryLabel: buildSecondaryLabel('sale_option'),
        portionId: null,
        portionName: null,
        qty: 0,
        sales: 0,
        countsTowardSales: false,
      }
      currentOption.qty += quantity
      byItem.set(itemKey, currentOption)
    }
  }

  const normalized = new Map()
  for (const [saleDate, itemMap] of byDate.entries()) {
    normalized.set(
      saleDate,
      [...itemMap.values()]
        .map(item => ({
          ...item,
          unitPrice: item.countsTowardSales && item.qty > 0 ? item.sales / item.qty : null,
        }))
        .sort((left, right) => {
          if (left.countsTowardSales !== right.countsTowardSales) {
            return left.countsTowardSales ? -1 : 1
          }

          const leftSort = left.countsTowardSales ? left.sales : left.qty
          const rightSort = right.countsTowardSales ? right.sales : right.qty
          if (leftSort !== rightSort) return rightSort - leftSort
          return left.displayName.localeCompare(right.displayName, 'tr')
        }),
    )
  }

  return normalized
}

function buildDetailedForecastCatalog(saleItems, saleOptions, actualMixByDate) {
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
    registerEntry(createSaleItemMixKey(item?.id, STANDARD_PORTION_ID), {
      itemType: 'sale_item',
      itemId: item?.id || null,
      productId: item?.id || null,
      optionId: null,
      baseName,
      displayName: baseName,
      secondaryLabel: buildSecondaryLabel('sale_item', STANDARD_PORTION_ID, 'Standart'),
      portionId: STANDARD_PORTION_ID,
      portionName: 'Standart',
      configuredPrice: resolveConfiguredPrice(item, STANDARD_PORTION_ID),
      estimatedProductivity: estimatedProductivity != null && estimatedProductivity > 0 ? estimatedProductivity : null,
      countsTowardSales: true,
    })

    for (const portion of parseJsonValue(item?.portions, []).filter(Boolean)) {
      const portionMeta = resolvePortionMeta(item, portion?.id, portion?.name)
      registerEntry(createSaleItemMixKey(item?.id, portionMeta.portionId), {
        itemType: 'sale_item',
        itemId: item?.id || null,
        productId: item?.id || null,
        optionId: null,
        baseName,
        displayName: buildSaleItemDisplayName(baseName, portionMeta.portionName, portionMeta.portionId),
        secondaryLabel: buildSecondaryLabel('sale_item', portionMeta.portionId, portionMeta.portionName),
        portionId: portionMeta.portionId,
        portionName: portionMeta.portionName,
        configuredPrice: resolveConfiguredPrice(item, portionMeta.portionId),
        estimatedProductivity: null,
        countsTowardSales: true,
      })
    }
  }

  for (const option of saleOptions || []) {
    const baseName = option?.short_name || option?.name || 'Secenek'
    const estimatedProductivity = safeNumber(option?.substitute_id, null)
    registerEntry(createOptionMixKey(option?.id, option?.name), {
      itemType: 'sale_option',
      itemId: option?.id || null,
      productId: null,
      optionId: option?.id || null,
      baseName,
      displayName: baseName,
      secondaryLabel: buildSecondaryLabel('sale_option'),
      portionId: null,
      portionName: null,
      configuredPrice: resolveConfiguredPrice(option),
      estimatedProductivity: estimatedProductivity != null && estimatedProductivity > 0 ? estimatedProductivity : null,
      countsTowardSales: false,
    }, [createOptionMixKey(null, option?.name)])
  }

  const historical = new Map()
  for (const items of actualMixByDate.values()) {
    for (const item of items) {
      const current = historical.get(item.itemKey) || {
        ...item,
        qty: 0,
        sales: 0,
      }
      current.qty += safeNumber(item.qty)
      current.sales += safeNumber(item.sales)
      historical.set(item.itemKey, current)
    }
  }

  for (const [itemKey, item] of historical.entries()) {
    const current = byKey.get(itemKey)
    if (current) {
      if (item.countsTowardSales && item.qty > 0) {
        current.historicalPrice = item.sales / item.qty
      }
      current.displayName = current.displayName || item.displayName
      current.baseName = current.baseName || item.baseName
      current.secondaryLabel = current.secondaryLabel || item.secondaryLabel
      continue
    }

    registerEntry(itemKey, {
      itemType: item.itemType,
      itemId: item.itemId || null,
      productId: item.productId || null,
      optionId: item.optionId || null,
      baseName: item.baseName,
      displayName: item.displayName,
      secondaryLabel: item.secondaryLabel,
      portionId: item.portionId || null,
      portionName: item.portionName || null,
      configuredPrice: null,
      historicalPrice: item.countsTowardSales && item.qty > 0 ? item.sales / item.qty : null,
      estimatedProductivity: null,
      countsTowardSales: !!item.countsTowardSales,
    })
  }

  return { byKey, entries }
}

function buildDetailedMixProjection(samples, actualMixByDate, forecastCatalog, receiptCount) {
  if (receiptCount <= 0) {
    return { items: [], totalSales: 0, historyDaysUsed: 0, mixSource: 'avg-ticket' }
  }

  const aggregated = new Map()
  let receiptsWithMix = 0
  let historyDaysUsed = 0

  for (const sample of samples) {
    const sampleMix = actualMixByDate.get(sample.sale_date) || []
    if (!sampleMix.length) continue

    const sampleReceipts = safeNumber(sample.receipt_count)
    if (sampleReceipts <= 0) continue

    receiptsWithMix += sampleReceipts
    historyDaysUsed += 1

    for (const item of sampleMix) {
      const current = aggregated.get(item.itemKey) || {
        ...item,
        qty: 0,
        sales: 0,
      }
      current.qty += safeNumber(item.qty)
      current.sales += safeNumber(item.sales)
      aggregated.set(item.itemKey, current)
    }
  }

  const manualFallbackItems = (forecastCatalog?.entries || []).filter(item => item?.estimatedProductivity > 0)
  if (receiptsWithMix <= 0 && !manualFallbackItems.length) {
    return { items: [], totalSales: 0, historyDaysUsed: 0, mixSource: 'avg-ticket' }
  }

  const items = [...aggregated.values()].map(item => {
    const priceMeta = forecastCatalog?.byKey?.get(item.itemKey) || {}
    const currentPrice = item.countsTowardSales
      ? (priceMeta?.configuredPrice ?? priceMeta?.historicalPrice ?? (item.qty > 0 ? item.sales / item.qty : null))
      : (priceMeta?.configuredPrice ?? null)
    const productivityPerReceipt = item.qty / receiptsWithMix
    const forecastQty = productivityPerReceipt * receiptCount
    const forecastSales = item.countsTowardSales && currentPrice != null
      ? forecastQty * currentPrice
      : null

    return {
      ...priceMeta,
      ...item,
      productivityPer1000Receipts: productivityPerReceipt * PRODUCTIVITY_DISPLAY_RECEIPT_BASE,
      forecastQty,
      forecastSales,
      currentPrice,
      isEstimatedProductivity: false,
    }
  })

  for (const priceMeta of manualFallbackItems) {
    if (!priceMeta?.estimatedProductivity || items.some(item => item.itemKey === priceMeta.itemKey)) continue

    const productivityPerReceipt = priceMeta.estimatedProductivity / PRODUCTIVITY_DISPLAY_RECEIPT_BASE
    const forecastQty = productivityPerReceipt * receiptCount
    const currentPrice = priceMeta.countsTowardSales
      ? (priceMeta.configuredPrice ?? priceMeta.historicalPrice ?? 0)
      : (priceMeta.configuredPrice ?? null)
    const forecastSales = priceMeta.countsTowardSales
      ? forecastQty * currentPrice
      : null

    items.push({
      ...priceMeta,
      productivityPer1000Receipts: priceMeta.estimatedProductivity,
      forecastQty,
      forecastSales,
      currentPrice,
      isEstimatedProductivity: true,
    })
  }

  const normalizedItems = items
    .filter(item => item.forecastQty > 0.01)
    .sort((left, right) => {
      if (left.countsTowardSales !== right.countsTowardSales) {
        return left.countsTowardSales ? -1 : 1
      }

      const leftSort = left.countsTowardSales ? safeNumber(left.forecastSales) : safeNumber(left.forecastQty)
      const rightSort = right.countsTowardSales ? safeNumber(right.forecastSales) : safeNumber(right.forecastQty)
      if (leftSort !== rightSort) return rightSort - leftSort
      return (left.displayName || '').localeCompare(right.displayName || '', 'tr')
    })

  const hasSalesProjection = normalizedItems.some(item => item.countsTowardSales)
  return {
    items: normalizedItems,
    totalSales: normalizedItems.reduce((sum, item) => (
      sum + (item.countsTowardSales ? safeNumber(item.forecastSales) : 0)
    ), 0),
    historyDaysUsed,
    mixSource: hasSalesProjection ? 'product-mix' : 'avg-ticket',
  }
}

function buildWeeklyMixExportModel(weekDays) {
  const itemMap = new Map()

  for (const day of weekDays || []) {
    const forecastItems = day?.forecast?.mix?.items || []
    const actualItems = day?.actualMix || []
    const actualLookup = new Map(actualItems.map(item => [item.itemKey, item]))

    for (const forecastItem of forecastItems) {
      const current = itemMap.get(forecastItem.itemKey) || {
        itemKey: forecastItem.itemKey,
        displayName: forecastItem.displayName || forecastItem.baseName || 'Urun',
        itemType: forecastItem.itemType || 'sale_item',
        secondaryLabel: forecastItem.secondaryLabel || '',
        countsTowardSales: !!forecastItem.countsTowardSales,
        sortValue: 0,
        byDate: {},
      }

      current.displayName = current.displayName || forecastItem.displayName || forecastItem.baseName || 'Urun'
      current.secondaryLabel = current.secondaryLabel || forecastItem.secondaryLabel || ''
      current.sortValue += current.countsTowardSales
        ? safeNumber(forecastItem.forecastSales)
        : safeNumber(forecastItem.forecastQty)
      current.byDate[day.date] = {
        productivityPer1000Receipts: safeNumber(forecastItem.productivityPer1000Receipts, null),
        forecastQty: safeNumber(forecastItem.forecastQty, null),
        currentPrice: safeNumber(forecastItem.currentPrice, null),
        forecastSales: forecastItem.countsTowardSales ? safeNumber(forecastItem.forecastSales, null) : null,
        actualQty: safeNumber(actualLookup.get(forecastItem.itemKey)?.qty, null),
        actualSales: forecastItem.countsTowardSales ? safeNumber(actualLookup.get(forecastItem.itemKey)?.sales, null) : null,
      }
      itemMap.set(forecastItem.itemKey, current)
    }

    for (const actualItem of actualItems) {
      if (itemMap.has(actualItem.itemKey)) continue

      itemMap.set(actualItem.itemKey, {
        itemKey: actualItem.itemKey,
        displayName: actualItem.displayName || actualItem.baseName || 'Urun',
        itemType: actualItem.itemType || 'sale_item',
        secondaryLabel: actualItem.secondaryLabel || '',
        countsTowardSales: !!actualItem.countsTowardSales,
        sortValue: actualItem.countsTowardSales ? safeNumber(actualItem.sales) : safeNumber(actualItem.qty),
        byDate: {
          [day.date]: {
            productivityPer1000Receipts: null,
            forecastQty: null,
            currentPrice: null,
            forecastSales: null,
            actualQty: safeNumber(actualItem.qty, null),
            actualSales: actualItem.countsTowardSales ? safeNumber(actualItem.sales, null) : null,
          },
        },
      })
    }
  }

  return [...itemMap.values()].sort((left, right) => {
    if (left.countsTowardSales !== right.countsTowardSales) {
      return left.countsTowardSales ? -1 : 1
    }

    if (left.sortValue !== right.sortValue) return right.sortValue - left.sortValue
    return left.displayName.localeCompare(right.displayName, 'tr')
  })
}

function buildWeeklyMixExportSheet({ weekDays, branchName, weekStart }) {
  const metrics = [
    { key: 'productivityPer1000Receipts', label: 'Verimlilik / 1000 fiş' },
    { key: 'forecastQty', label: 'Tahmin Adet' },
    { key: 'currentPrice', label: 'Güncel Fiyat' },
    { key: 'forecastSales', label: 'Tahmin Satış' },
    { key: 'actualQty', label: 'Gerçek Adet' },
    { key: 'actualSales', label: 'Gerçek Satış' },
  ]
  const rows = buildWeeklyMixExportModel(weekDays)
  const aoa = [
    ['Şube', branchName || ''],
    ['Hafta', `${formatDate(weekStart)} - ${formatDate(addDays(weekStart, 6))}`],
    [],
  ]
  const merges = []
  const cols = [
    { wch: 34 },
    { wch: 12 },
    { wch: 24 },
  ]

  const headerRowIndex = aoa.length
  const dayHeaderRow = ['Satış Malı', 'Tür', 'Detay']
  const metricHeaderRow = ['', '', '']

  for (const day of weekDays || []) {
    const startColumn = dayHeaderRow.length
    const dayLabel = `${DAY_NAMES[getDayIndex(day.date)]} ${formatDateShort(day.date)}`
    dayHeaderRow.push(dayLabel)
    metricHeaderRow.push(...metrics.map(metric => metric.label))
    for (let index = 1; index < metrics.length; index += 1) dayHeaderRow.push('')
    merges.push({
      s: { r: headerRowIndex, c: startColumn },
      e: { r: headerRowIndex, c: startColumn + metrics.length - 1 },
    })
    cols.push(...metrics.map(() => ({ wch: 16 })))
  }

  merges.push(
    { s: { r: headerRowIndex, c: 0 }, e: { r: headerRowIndex + 1, c: 0 } },
    { s: { r: headerRowIndex, c: 1 }, e: { r: headerRowIndex + 1, c: 1 } },
    { s: { r: headerRowIndex, c: 2 }, e: { r: headerRowIndex + 1, c: 2 } },
  )

  aoa.push(dayHeaderRow)
  aoa.push(metricHeaderRow)

  for (const row of rows) {
    const excelRow = [
      row.displayName,
      row.itemType === 'sale_option' ? 'Seçenek' : 'Satış Malı',
      row.secondaryLabel || '',
    ]

    for (const day of weekDays || []) {
      const dayData = row.byDate?.[day.date] || {}
      excelRow.push(
        dayData.productivityPer1000Receipts ?? null,
        dayData.forecastQty ?? null,
        dayData.currentPrice ?? null,
        dayData.forecastSales ?? null,
        dayData.actualQty ?? null,
        dayData.actualSales ?? null,
      )
    }

    aoa.push(excelRow)
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  worksheet['!merges'] = merges
  worksheet['!cols'] = cols
  return worksheet
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: '.82rem', fontWeight: 700 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, display: 'inline-block' }} />
      {label}
    </div>
  )
}

function WeekChart({ days }) {
  const values = days.flatMap(day => [
    safeNumber(day.forecast?.effectiveTotalSales),
    safeNumber(day.actual?.total_sales),
  ])
  const maxValue = Math.max(...values, 1)

  return (
    <div style={{
      border: '1px solid #dbe7f5',
      borderRadius: 28,
      padding: '20px 22px 18px',
      background: 'linear-gradient(180deg,#ffffff,#f8fbff)',
      boxShadow: '0 18px 45px rgba(15,23,42,.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 18, flexWrap: 'wrap' }}>
        <LegendDot color="#3b82f6" label="Tahmin" />
        <LegendDot color="#ef4444" label="Gerçekleşen" />
      </div>

      <div style={{ position: 'relative', height: 320, padding: '10px 12px 28px' }}>
        {[0.25, 0.5, 0.75, 1].map(mark => (
          <div
            key={mark}
            style={{
              position: 'absolute',
              insetInline: 0,
              bottom: `${mark * 100}%`,
              borderTop: '1px solid rgba(148,163,184,.22)',
            }}
          />
        ))}

        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 18,
          alignItems: 'end',
          padding: '0 8px',
        }}>
          {days.map(day => {
            const forecastHeight = day.forecast ? Math.max(3, (safeNumber(day.forecast.effectiveTotalSales) / maxValue) * 100) : 0
            const actualHeight = day.actual ? Math.max(3, (safeNumber(day.actual.total_sales) / maxValue) * 100) : 0

            return (
              <div key={day.date} style={{ display: 'grid', gap: 10, alignItems: 'end', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 8, height: 248 }}>
                  <div
                    title={day.forecast ? `Tahmin: ${formatCurrency(day.forecast.effectiveTotalSales)}` : 'Tahmin yok'}
                    style={{
                      width: 40,
                      height: `${forecastHeight}%`,
                      minHeight: forecastHeight ? 18 : 0,
                      borderRadius: '12px 12px 4px 4px',
                      background: 'linear-gradient(180deg,#5a9cff,#2563eb)',
                      boxShadow: '0 12px 24px rgba(37,99,235,.18)',
                    }}
                  />
                  <div
                    title={day.actual ? `Gerçekleşen: ${formatCurrency(day.actual.total_sales)}` : 'Gerçekleşen yok'}
                    style={{
                      width: 40,
                      height: `${actualHeight}%`,
                      minHeight: actualHeight ? 18 : 0,
                      borderRadius: '12px 12px 4px 4px',
                      background: 'linear-gradient(180deg,#ff8c7a,#ef4444)',
                      boxShadow: '0 12px 24px rgba(239,68,68,.16)',
                    }}
                  />
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '.92rem', fontWeight: 800, color: '#0f172a' }}>{formatDate(day.date)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MetricLabelCell({ label, color, hint }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: '1px solid #e2e8f0',
      borderRight: '1px solid #e2e8f0',
      background: '#f8fafc',
      display: 'grid',
      gap: 4,
      alignContent: 'center',
      minWidth: 190,
      position: 'sticky',
      left: 0,
      zIndex: 1,
    }}>
      <div style={{ fontSize: '.8rem', fontWeight: 900, color }}>{label}</div>
      {hint ? <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>{hint}</div> : null}
    </div>
  )
}

function ValueCell({ children, accent = '#0f172a', soft = false }) {
  return (
    <div style={{
      padding: '12px 10px',
      borderBottom: '1px solid #e2e8f0',
      textAlign: 'center',
      fontSize: '.92rem',
      fontWeight: soft ? 700 : 800,
      color: accent,
      minWidth: 138,
      background: soft ? '#fcfdff' : '#fff',
    }}>
      {children}
    </div>
  )
}

function MixButton({ active, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        borderRadius: 12,
        padding: '10px 8px',
        fontSize: '.75rem',
        fontWeight: 800,
        border: `1px solid ${active ? '#ef4444' : '#f4c48b'}`,
        background: disabled
          ? '#f8fafc'
          : active
            ? '#fff1ef'
            : 'linear-gradient(180deg,#fff5e5,#ffe3bb)',
        color: disabled ? '#94a3b8' : '#c2410c',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      Ürün Karışımını Göster
    </button>
  )
}

function ProductMixPanel({ day, actualMix }) {
  if (!day) return null

  const forecast = day.forecast
  const actualMixLookup = new Map((actualMix || []).map(item => [item.itemKey, item]))
  const hasOptionRows = !!forecast?.mix?.items?.some(item => item.itemType === 'sale_option')

  return (
    <div className="card" style={{ padding: 18, marginTop: 18, borderRadius: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#6366f1', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            Günlük Ürün Karışımı
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>
            {DAY_NAMES[getDayIndex(day.date)]} / {formatDate(day.date)}
          </div>
          <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 4 }}>
            Önce fiş tahmini üretilir, sonra ürün adetleri ve en sonda toplam satış hesaplanır.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip soft">{forecast ? `${formatNumber(forecast.effectiveReceiptCount)} fiş` : 'Tahmin yok'}</span>
          <span className="chip soft" style={{ background: '#dbeafe', color: '#1d4ed8' }}>
            Tahmin satış: {forecast ? `₺${formatCurrency(forecast.effectiveTotalSales)}` : '—'}
          </span>
          {day.actual ? (
            <span className="chip soft" style={{ background: '#fee2e2', color: '#b91c1c' }}>
              Gerçekleşen: ₺{formatCurrency(day.actual.total_sales)}
            </span>
          ) : null}
        </div>
      </div>

      {forecast?.mix?.items?.length ? (
        <>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '.74rem', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                <th style={{ textAlign: 'left', padding: '12px 10px' }}>Satış Malı</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Verimlilik / 1000 fiş</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Tahmin Adet</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Güncel Fiyat</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Tahmin Satış</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Gerçek Adet</th>
                <th style={{ textAlign: 'right', padding: '12px 10px' }}>Gerçek Satış</th>
              </tr>
            </thead>
            <tbody>
              {forecast.mix.items.map(item => {
                const actualItem = actualMixLookup.get(item.itemKey)
                return (
                  <tr key={item.itemKey} style={{ borderTop: '1px solid #edf2f7' }}>
                    <td style={{ padding: '12px 10px' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.displayName || item.baseName}</div>
                      <div style={{ marginTop: 4, fontSize: '.72rem', color: item.itemType === 'sale_option' ? '#b45309' : '#64748b', fontWeight: 700 }}>
                        {item.secondaryLabel || (item.itemType === 'sale_option' ? 'Secenek' : 'Standart recete')}
                      </div>
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#0f766e', fontWeight: 800 }}>
                      {formatNumber(item.productivityPer1000Receipts, 1)}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#2563eb', fontWeight: 900 }}>
                      {formatNumber(item.forecastQty, item.forecastQty < 10 ? 1 : 0)}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#475569', fontWeight: 800 }}>
                      ₺{formatCurrency(item.currentPrice, 2)}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#1d4ed8', fontWeight: 900 }}>
                      ₺{formatCurrency(item.forecastSales)}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#334155', fontWeight: 800 }}>
                      {actualItem ? formatNumber(actualItem.qty, actualItem.qty < 10 ? 1 : 0) : '—'}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', color: '#b91c1c', fontWeight: 800 }}>
                      {actualItem ? `₺${formatCurrency(actualItem.sales)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hasOptionRows ? (
          <div style={{ marginTop: 12, fontSize: '.78rem', color: '#92400e', lineHeight: 1.6 }}>
            Secenek satirlari tuketim/verimlilik sinyali olarak listelenir. Toplam tahmin satis hesabi yalnizca satis mali satirlarindan gelir.
          </div>
        ) : null}
        </>
      ) : (
        <div style={{
          border: '1px dashed #cbd5e1',
          borderRadius: 18,
          padding: 18,
          color: '#64748b',
          background: '#f8fafc',
          lineHeight: 1.6,
        }}>
          Bu gün için ürün karışımı hesaplanamadı. Seçili şubede yeterli satış satırı oluşmamış olabilir;
          sistem toplam satışı şimdilik ortalama fiş tutarı üzerinden hesaplıyor.
        </div>
      )}
    </div>
  )
}

export default function Forecast() {
  const toast = useToast()
  const settings = readForecastSettings()
  const { scope, branchId: workspaceBranchId, branches: workspaceBranches } = useWorkspace()
  const branchLocked = isBranchScopedScope(scope) && !!workspaceBranchId

  const [branches, setBranches] = useState([])
  const [selectedBranch, setSelectedBranch] = useState('')
  const [lookbackWeeks, setLookbackWeeks] = useState(settings.lookbackWeeks)
  const [forecastWeeks, setForecastWeeks] = useState(settings.forecastWeeks)
  const [dailyRows, setDailyRows] = useState([])
  const [lineRows, setLineRows] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [saleOptions, setSaleOptions] = useState([])
  const [savedForecasts, setSavedForecasts] = useState([])
  const [draftAdjustments, setDraftAdjustments] = useState({})
  const [loading, setLoading] = useState(true)
  const [mixLoadError, setMixLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [weekStart, setWeekStart] = useState(startOfWeek(todayIso()))
  const [expandedMixDate, setExpandedMixDate] = useState('')

  const allowFutureManualAdjustments = settings.allowFutureManualAdjustments
  const currentDayManualCutoffHour = settings.currentDayManualCutoffHour

  useEffect(() => {
    if (!workspaceBranches.length) return
    setBranches(workspaceBranches)
  }, [workspaceBranches])

  useEffect(() => {
    if (branchLocked && workspaceBranchId) {
      setSelectedBranch(current => (current === workspaceBranchId ? current : workspaceBranchId))
      return
    }

    if (selectedBranch) return
    if (workspaceBranches.length) {
      setSelectedBranch(workspaceBranches[0].id)
    }
  }, [branchLocked, selectedBranch, workspaceBranchId, workspaceBranches])

  const loadBranchData = useCallback(async () => {
    if (!selectedBranch) return

    setLoading(true)
    setMixLoadError('')

    try {
      const selectedBranchMeta = branches.find(branch => branch.id === selectedBranch) || null
      const selectedBranchName = selectedBranchMeta?.name || ''
      const historyStartDate = addDays(todayIso(), -Math.max(lookbackWeeks * 7 + forecastWeeks * 7 + 56, 120))
      const initialNameAliases = buildBranchNameAliases(selectedBranchName)

      const [preAggregatedDailyRows, rawSalesRows] = await Promise.all([
        initialNameAliases.length
          ? fetchAllRows((from, to) =>
              db
                .from('daily_sales')
                .select('id,sale_date,branch_id,branch_name,total_sales,receipt_count')
                .in('branch_name', initialNameAliases)
                .gte('sale_date', historyStartDate)
                .order('sale_date', { ascending: true })
                .range(from, to)
            )
          : [],
        initialNameAliases.length
          ? fetchAllRows((from, to) =>
              db
                .from('sales')
                .select('sale_datetime,branch_name,payment_total,gross_total_after_discount,net_total_after_discount')
                .eq('status', 'completed')
                .in('branch_name', initialNameAliases)
                .gte('sale_datetime', `${historyStartDate}T00:00:00`)
                .lte('sale_datetime', `${todayIso()}T23:59:59`)
                .order('sale_datetime', { ascending: true })
                .range(from, to)
            )
          : [],
      ])

      const branchDailyRows = mergeDailySalesRows(
        preAggregatedDailyRows,
        rawSalesRows,
        selectedBranch,
        selectedBranchName,
      )

      const branchNameAliases = buildBranchNameAliases(
        selectedBranchName,
        ...branchDailyRows.map(row => row.branch_name).filter(Boolean),
        ...rawSalesRows.map(row => row.branch_name).filter(Boolean),
      )

      const firstSaleDate = branchDailyRows[0]?.sale_date || historyStartDate
      const lineWindowStart = maxIsoDate(firstSaleDate, addDays(weekStart, -(lookbackWeeks * 7)))
      const lineWindowEnd = minIsoDate(todayIso(), addDays(weekStart, 6))
      let lineRowsFromHistory = []
      let nextMixLoadError = ''

      if (branchNameAliases.length && lineWindowStart && lineWindowEnd && lineWindowStart <= lineWindowEnd) {
        try {
          lineRowsFromHistory = await fetchAllRows((from, to) =>
            db
              .from('sale_lines')
              .select('sale_id,product_id,product_name,qty,unit_gross_after_discount,line_gross_after_discount,sale_datetime,branch_name,portion_id,portion_name,options_json')
              .in('branch_name', branchNameAliases)
              .gte('sale_datetime', `${lineWindowStart}T00:00:00`)
              .lte('sale_datetime', `${lineWindowEnd}T23:59:59`)
              .order('sale_datetime', { ascending: true })
              .range(from, to)
          )
        } catch (mixError) {
          console.error('Forecast mix load error:', mixError)
          nextMixLoadError = mixError.message || 'Urun karisimi verileri alinamadi.'
          toast('Urun karisimi verileri gecici olarak alinamadi. Sistem ortalama fis tutari ile devam ediyor.', 'info')
        }
      }

      const [saleItemsResponse, saleOptionsResponse, forecastRows] = await Promise.all([
        db
          .from('sale_items')
          .select('id,name,short_name,sale_price,standard_price,channel_prices,active,substitute_id,portions')
          .eq('active', true)
          .order('name', { ascending: true }),
        db
          .from('sale_options')
          .select('id,name,short_name,sale_price,standard_price,channel_prices,substitute_id,sale_status')
          .is('deleted_at', null)
          .eq('sale_status', true)
          .order('name', { ascending: true }),
        fetchAllRows((from, to) =>
          db
            .from('sales_forecasts')
            .select('*')
            .eq('branch_id', selectedBranch)
            .gte('forecast_date', addDays(startOfWeek(todayIso()), -28))
            .lte('forecast_date', addDays(startOfWeek(todayIso()), forecastWeeks * 7 + 13))
            .order('forecast_date', { ascending: true })
            .range(from, to)
        ),
      ])

      setDailyRows(branchDailyRows)
      setLineRows(lineRowsFromHistory)
      setMixLoadError(nextMixLoadError)
      setSaleItems(saleItemsResponse.data || [])
      setSaleOptions(saleOptionsResponse.data || [])
      setSavedForecasts(forecastRows)

      const nextDrafts = {}
      for (const row of forecastRows) {
        if (row?.adj_receipt_count != null) {
          nextDrafts[row.forecast_date] = safeNumber(row.adj_receipt_count)
        }
      }
      setDraftAdjustments(nextDrafts)

      if (!branches.length && branchDailyRows.length) {
        const branchMap = new Map()
        branchDailyRows.forEach(row => {
          if (!branchMap.has(row.branch_id)) {
            branchMap.set(row.branch_id, row.branch_name)
          }
        })
        setBranches([...branchMap.entries()].map(([id, name]) => ({ id, name })))
      }
    } catch (error) {
      console.error('Forecast load error:', error)
      toast(`Tahmin verileri yuklenemedi: ${error.message}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [branches, forecastWeeks, lookbackWeeks, selectedBranch, toast, weekStart])

  useEffect(() => {
    loadBranchData()
  }, [loadBranchData])

  useEffect(() => {
    setWeekStart(startOfWeek(todayIso()))
  }, [selectedBranch])

  useEffect(() => {
    setExpandedMixDate('')
  }, [weekStart])

  const selectedBranchName = useMemo(() => {
    const workspaceBranch = branches.find(branch => branch.id === selectedBranch)
    return workspaceBranch?.name || dailyRows[0]?.branch_name || ''
  }, [branches, dailyRows, selectedBranch])

  const actualByDate = useMemo(() => {
    const map = new Map()
    for (const row of dailyRows) {
      map.set(row.sale_date, row)
    }
    return map
  }, [dailyRows])

  const actualMixByDate = useMemo(() => buildDetailedActualMixByDate(lineRows), [lineRows])
  const forecastCatalog = useMemo(
    () => buildDetailedForecastCatalog(saleItems, saleOptions, actualMixByDate),
    [actualMixByDate, saleItems, saleOptions],
  )
  const savedForecastMap = useMemo(() => {
    const map = new Map()
    for (const row of savedForecasts) {
      map.set(row.forecast_date, row)
    }
    return map
  }, [savedForecasts])

  const firstHistoryWeek = useMemo(() => {
    const firstDate = dailyRows[0]?.sale_date || startOfWeek(todayIso())
    return startOfWeek(firstDate)
  }, [dailyRows])

  const currentWeek = startOfWeek(todayIso())
  const lastForecastWeek = addDays(currentWeek, forecastWeeks * 7)
  const visibleDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)),
    [weekStart],
  )

  const buildDayModel = useCallback((dateStr) => {
    const actual = actualByDate.get(dateStr) || null
    const saved = savedForecastMap.get(dateStr) || null
    const samples = collectSameWeekdayRows(dailyRows, dateStr, lookbackWeeks)
    const receiptModel = computeReceiptForecast(samples, dateStr)
    const calcReceiptCount = receiptModel?.calcReceiptCount ?? safeNumber(saved?.calc_receipt_count, null)
    const storedAdjustment = draftAdjustments[dateStr]
    const hasManualAdjustment = storedAdjustment != null && storedAdjustment !== ''
    const effectiveReceiptCount = hasManualAdjustment
      ? safeNumber(storedAdjustment)
      : saved?.adj_receipt_count != null
        ? safeNumber(saved.adj_receipt_count)
        : calcReceiptCount

    const fallbackAvgTicket = receiptModel?.weightedAvgTicket
      ?? (actual?.receipt_count ? safeNumber(actual.total_sales) / safeNumber(actual.receipt_count) : 0)

    let calcMix = null
    let effectiveMix = null
    let calcTotalSales = null
    let effectiveTotalSales = null
    let mixNote = ''

    if (calcReceiptCount != null) {
      calcMix = buildDetailedMixProjection(samples, actualMixByDate, forecastCatalog, calcReceiptCount)
      calcTotalSales = calcMix.mixSource === 'product-mix'
        ? calcMix.totalSales
        : calcReceiptCount * fallbackAvgTicket
    }

    if (effectiveReceiptCount != null) {
      effectiveMix = buildDetailedMixProjection(samples, actualMixByDate, forecastCatalog, effectiveReceiptCount)
      effectiveTotalSales = effectiveMix.mixSource === 'product-mix'
        ? effectiveMix.totalSales
        : effectiveReceiptCount * fallbackAvgTicket
    }

    if (effectiveMix?.mixSource !== 'product-mix' && effectiveReceiptCount != null) {
      mixNote = 'Ürün karışımı oluşmadığı için satış, ortalama fiş tutarıyla hesaplandı.'
    }

    const actualAvgTicket = actual?.receipt_count
      ? safeNumber(actual.total_sales) / safeNumber(actual.receipt_count)
      : null
    const forecastAvgTicket = effectiveReceiptCount
      ? safeNumber(effectiveTotalSales) / effectiveReceiptCount
      : null
    const editableState = getEditableState(dateStr, allowFutureManualAdjustments, currentDayManualCutoffHour)

    return {
      date: dateStr,
      actual,
      actualAvgTicket,
      actualMix: actualMixByDate.get(dateStr) || [],
      forecast: calcReceiptCount == null
        ? null
        : {
            calcReceiptCount,
            effectiveReceiptCount,
            calcTotalSales,
            effectiveTotalSales,
            calcMix,
            mix: effectiveMix,
            forecastAvgTicket,
            mixNote,
            saved,
          },
      editableState,
    }
  }, [
    actualByDate,
    actualMixByDate,
    allowFutureManualAdjustments,
    currentDayManualCutoffHour,
    dailyRows,
    draftAdjustments,
    lookbackWeeks,
    forecastCatalog,
    savedForecastMap,
  ])

  const weekDays = useMemo(
    () => visibleDates.map(dateStr => buildDayModel(dateStr)),
    [buildDayModel, visibleDates],
  )

  const weekSummary = useMemo(() => {
    return weekDays.reduce((summary, day) => ({
      forecastSales: summary.forecastSales + safeNumber(day.forecast?.effectiveTotalSales),
      actualSales: summary.actualSales + safeNumber(day.actual?.total_sales),
      forecastReceipts: summary.forecastReceipts + safeNumber(day.forecast?.effectiveReceiptCount),
      actualReceipts: summary.actualReceipts + safeNumber(day.actual?.receipt_count),
    }), {
      forecastSales: 0,
      actualSales: 0,
      forecastReceipts: 0,
      actualReceipts: 0,
    })
  }, [weekDays])

  const canExportWeeklyMix = useMemo(
    () => weekDays.some(day => (day?.forecast?.mix?.items?.length || 0) > 0 || (day?.actualMix?.length || 0) > 0),
    [weekDays],
  )

  const mixPanelDay = useMemo(() => {
    if (!expandedMixDate) return weekDays.find(day => day.forecast?.mix?.items?.length) || weekDays[0] || null
    return weekDays.find(day => day.date === expandedMixDate) || null
  }, [expandedMixDate, weekDays])

  const handleAdjustmentChange = useCallback((dateStr, rawValue, calcReceiptCount) => {
    setDraftAdjustments(previous => {
      const next = { ...previous }
      if (rawValue === '') {
        delete next[dateStr]
        return next
      }

      const numeric = Math.max(0, Math.round(safeNumber(rawValue)))
      if (numeric === calcReceiptCount) {
        delete next[dateStr]
        return next
      }

      next[dateStr] = numeric
      return next
    })
  }, [])

  const saveForecasts = useCallback(async () => {
    const pendingDates = Object.keys(draftAdjustments)
      .filter(dateStr => draftAdjustments[dateStr] != null && draftAdjustments[dateStr] !== '')

    if (!pendingDates.length) {
      toast('Kaydedilecek manuel fiş değişikliği yok.', 'info')
      return
    }

    setSaving(true)

    try {
      for (const dateStr of pendingDates) {
        const day = buildDayModel(dateStr)
        if (!day?.forecast) continue

        const row = {
          forecast_date: dateStr,
          branch_id: selectedBranch,
          branch_name: selectedBranchName,
          lookback_weeks: lookbackWeeks,
          calc_receipt_count: day.forecast.calcReceiptCount,
          calc_total_sales: Math.round(safeNumber(day.forecast.calcTotalSales)),
          initial_receipt_count: day.forecast.saved?.initial_receipt_count ?? day.forecast.calcReceiptCount,
          initial_total_sales: day.forecast.saved?.initial_total_sales ?? Math.round(safeNumber(day.forecast.calcTotalSales)),
          adj_receipt_count: day.forecast.effectiveReceiptCount,
          adj_total_sales: Math.round(safeNumber(day.forecast.effectiveTotalSales)),
          actual_total_sales: day.actual ? safeNumber(day.actual.total_sales) : null,
          actual_receipt_count: day.actual ? safeNumber(day.actual.receipt_count) : null,
          updated_at: new Date().toISOString(),
        }

        if (day.forecast.saved?.id) {
          const { error } = await db
            .from('sales_forecasts')
            .update({
              lookback_weeks: row.lookback_weeks,
              calc_receipt_count: row.calc_receipt_count,
              calc_total_sales: row.calc_total_sales,
              adj_receipt_count: row.adj_receipt_count,
              adj_total_sales: row.adj_total_sales,
              actual_total_sales: row.actual_total_sales,
              actual_receipt_count: row.actual_receipt_count,
              updated_at: row.updated_at,
            })
            .eq('id', day.forecast.saved.id)

          if (error) throw error
        } else {
          const { error } = await db.from('sales_forecasts').insert(row)
          if (error) throw error
        }
      }

      toast(`${pendingDates.length} gun icin tahmin kaydedildi.`, 'success')
      await loadBranchData()
    } catch (error) {
      console.error('Forecast save error:', error)
      toast(`Tahmin kaydedilemedi: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [buildDayModel, draftAdjustments, loadBranchData, lookbackWeeks, selectedBranch, selectedBranchName, toast])

  const moveWeek = useCallback((direction) => {
    setWeekStart(current => addDays(current, direction * 7))
  }, [])

  const exportWeeklyMixToExcel = useCallback(() => {
    if (!canExportWeeklyMix) {
      toast('Excel\'e aktarilacak urun tablosu bulunamadi.', 'info')
      return
    }

    try {
      const worksheet = buildWeeklyMixExportSheet({
        weekDays,
        branchName: selectedBranchName,
        weekStart,
      })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Urun Tablosu')
      const branchSlug = normalizeLookupKey(selectedBranchName || 'sube')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'sube'
      XLSX.writeFile(workbook, `tahmin-urun-tablosu-${branchSlug}-${formatCompactDate(weekStart)}.xlsx`)
      toast('Haftalik urun tablosu Excel olarak indirildi.', 'success')
    } catch (error) {
      console.error('Forecast weekly mix export error:', error)
      toast(`Excel olusturulamadi: ${error.message}`, 'error')
    }
  }, [canExportWeeklyMix, selectedBranchName, toast, weekDays, weekStart])

  const canGoPrev = weekStart > firstHistoryWeek
  const canGoNext = weekStart < lastForecastWeek

  return (
    <div>
      <Header
        title="Tahmin"
        subtitle={selectedBranchName
          ? `${selectedBranchName} icin fis -> urun adedi -> satis zinciri`
          : 'Haftalik fis, urun ve satis tahmini'}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-o" onClick={loadBranchData} disabled={loading}>
              <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} />
              {' '}Yenile
            </button>
            <button className="btn-p" onClick={saveForecasts} disabled={saving || loading}>
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
              {saving ? ' Kaydediliyor...' : ' Tahminleri Kaydet'}
            </button>
          </div>
        }
      />

      <div className="card" style={{ padding: 18, marginBottom: 18, borderRadius: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          <div>
            <label className="f-label">Sube</label>
            <div className="sel-wrap">
              <select
                className="f-input"
                value={selectedBranch}
                onChange={event => setSelectedBranch(event.target.value)}
                disabled={branchLocked}
              >
                {branches.map(branch => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="f-label">Geriye Bakis (hafta)</label>
            <input
              className="f-input"
              type="number"
              min="1"
              max="12"
              value={lookbackWeeks}
              onChange={event => setLookbackWeeks(clamp(parseInt(event.target.value, 10) || 1, 1, 12))}
            />
          </div>

          <div>
            <label className="f-label">Ileri tahmin (hafta)</label>
            <input
              className="f-input"
              type="number"
              min="1"
              max="8"
              value={forecastWeeks}
              onChange={event => setForecastWeeks(clamp(parseInt(event.target.value, 10) || 1, 1, 8))}
            />
          </div>

          <div style={{
            borderRadius: 18,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(135deg,#f8fafc,#eef6ff)',
            padding: '12px 14px',
            display: 'grid',
            alignContent: 'center',
          }}>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
              Motor Mantigi
            </div>
            <div style={{ fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
              Once fis tahmini, sonra urun karisimi, en son gunluk satis hesaplanir.
            </div>
          </div>
        </div>
      </div>

      {mixLoadError ? (
        <div className="card" style={{
          padding: '14px 16px',
          marginBottom: 18,
          borderRadius: 20,
          border: '1px solid #fecaca',
          background: '#fff7ed',
          color: '#9a3412',
        }}>
          <div style={{ fontSize: '.82rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>
            Urun Karisimi Notu
          </div>
          <div style={{ fontSize: '.9rem', lineHeight: 1.6 }}>
            Urun karisimi verileri gecici olarak alinamadi. Sayfa fis ve satis tahminini ortalama fis tutari fallback'i ile gosteriyor.
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#64748b' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.6rem' }} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', borderRadius: 22, padding: '16px 18px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .82 }}>Haftalik Tahmin Satis</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 900, marginTop: 6 }}>₺{formatCurrency(weekSummary.forecastSales)}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg,#ef4444,#fb7185)', color: '#fff', borderRadius: 22, padding: '16px 18px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .82 }}>Haftalik Gerceklesen</div>
              <div style={{ fontSize: '1.55rem', fontWeight: 900, marginTop: 6 }}>₺{formatCurrency(weekSummary.actualSales)}</div>
            </div>
            <div style={{ background: 'linear-gradient(135deg,#0f766e,#14b8a6)', color: '#fff', borderRadius: 22, padding: '16px 18px' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', opacity: .82 }}>Tahmin Fis / Gercek Fis</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: 6 }}>
                {formatNumber(weekSummary.forecastReceipts)} / {formatNumber(weekSummary.actualReceipts)}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 18, borderRadius: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                  Haftalik Tahta
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#0f172a' }}>
                  {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-o" onClick={() => moveWeek(-1)} disabled={!canGoPrev}>
                  &lt;&lt; Onceki Hafta
                </button>
                <button className="btn-o" onClick={() => setWeekStart(currentWeek)}>
                  Bu Hafta
                </button>
                <button className="btn-o" onClick={() => moveWeek(1)} disabled={!canGoNext}>
                  Sonraki Hafta &gt;&gt;
                </button>
                <button className="btn-o" onClick={exportWeeklyMixToExcel} disabled={!canExportWeeklyMix}>
                  <i className="fa-solid fa-file-excel" />
                  {' '}Urun Tablosunu Excel'e Aktar
                </button>
              </div>
            </div>

            <WeekChart days={weekDays} />

            <div style={{ marginTop: 18, overflowX: 'auto' }}>
              <div style={{ minWidth: 1180 }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '220px repeat(7, minmax(138px, 1fr))',
                  border: '1px solid #e2e8f0',
                  borderRadius: 22,
                  overflow: 'hidden',
                  background: '#fff',
                }}>
                  <MetricLabelCell
                    label="Gun Bandi"
                    color="#64748b"
                    hint="Hava durumu satiri sonraki adimda bu banda baglanacak."
                  />
                  {weekDays.map(day => (
                    <ValueCell key={`meta-${day.date}`} soft>
                      <div style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: '4px 0' }}>
                        <span style={{
                          width: 42,
                          height: 42,
                          borderRadius: 14,
                          background: '#eff6ff',
                          color: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'inset 0 0 0 1px rgba(59,130,246,.12)',
                        }}>
                          <i className="fa-solid fa-cloud-sun" />
                        </span>
                        <div style={{ fontWeight: 900, color: '#0f172a' }}>{DAY_NAMES[getDayIndex(day.date)]}</div>
                        <div style={{ fontSize: '.78rem', color: '#64748b' }}>{formatDateShort(day.date)}</div>
                      </div>
                    </ValueCell>
                  ))}

                  <MetricLabelCell label="Tahmin Satis" color="#2563eb" />
                  {weekDays.map(day => (
                    <ValueCell key={`forecast-sales-${day.date}`} accent="#2563eb">
                      {day.forecast ? `₺${formatCurrency(day.forecast.effectiveTotalSales)}` : '—'}
                    </ValueCell>
                  ))}

                  <MetricLabelCell label="Gerceklesen Satis" color="#dc2626" />
                  {weekDays.map(day => (
                    <ValueCell key={`actual-sales-${day.date}`} accent="#dc2626" soft>
                      {day.actual ? `₺${formatCurrency(day.actual.total_sales)}` : '—'}
                    </ValueCell>
                  ))}

                  <MetricLabelCell label="Tahmin Fis Sayisi" color="#be123c" hint="Gelecek gunler icin duzenlenebilir." />
                  {weekDays.map(day => {
                    const forecast = day.forecast
                    if (!forecast) {
                      return <ValueCell key={`forecast-receipts-${day.date}`} accent="#be123c">—</ValueCell>
                    }

                    if (!day.editableState.editable) {
                      return (
                        <ValueCell key={`forecast-receipts-${day.date}`} accent="#be123c">
                          {formatNumber(forecast.effectiveReceiptCount)}
                        </ValueCell>
                      )
                    }

                    return (
                      <ValueCell key={`forecast-receipts-${day.date}`} accent="#be123c">
                        <input
                          type="number"
                          min="0"
                          value={draftAdjustments[day.date] ?? forecast.effectiveReceiptCount ?? ''}
                          onChange={event => handleAdjustmentChange(day.date, event.target.value, forecast.calcReceiptCount)}
                          style={{
                            width: '100%',
                            border: '1px solid #fca5a5',
                            background: '#fff5f5',
                            borderRadius: 10,
                            padding: '8px 6px',
                            textAlign: 'center',
                            color: '#be123c',
                            fontWeight: 900,
                            fontSize: '.92rem',
                            outline: 'none',
                          }}
                        />
                      </ValueCell>
                    )
                  })}

                  <MetricLabelCell label="Gerceklesen Fis Sayisi" color="#111827" />
                  {weekDays.map(day => (
                    <ValueCell key={`actual-receipts-${day.date}`} accent="#111827" soft>
                      {day.actual ? formatNumber(day.actual.receipt_count) : '—'}
                    </ValueCell>
                  ))}

                  <MetricLabelCell label="Tahmini Ortalama" color="#475569" />
                  {weekDays.map(day => (
                    <ValueCell key={`forecast-ticket-${day.date}`} accent="#475569">
                      {day.forecast ? formatCurrency(day.forecast.forecastAvgTicket, 2) : '—'}
                    </ValueCell>
                  ))}

                  <MetricLabelCell label="Gerceklesen Ortalama" color="#475569" />
                  {weekDays.map(day => (
                    <ValueCell key={`actual-ticket-${day.date}`} accent="#475569" soft>
                      {day.actualAvgTicket != null ? formatCurrency(day.actualAvgTicket, 2) : '—'}
                    </ValueCell>
                  ))}

                  <MetricLabelCell
                    label="Urun Karisimi"
                    color="#c2410c"
                    hint="Butona basinca tahmin gunundeki satis mali adetleri altta listelenir."
                  />
                  {weekDays.map(day => (
                    <ValueCell key={`mix-btn-${day.date}`} accent="#c2410c">
                      <MixButton
                        active={expandedMixDate === day.date}
                        disabled={!day.forecast}
                        onClick={() => setExpandedMixDate(current => current === day.date ? '' : day.date)}
                      />
                    </ValueCell>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: '.78rem', color: '#be123c', fontWeight: 700 }}>
              Kirmizi fis kutulari gelecek gunler ve kilidi acik bugun icin degistirilebilir tahmin alanlaridir.
            </div>

            {mixPanelDay?.forecast?.mixNote ? (
              <div style={{ marginTop: 10, fontSize: '.8rem', color: '#92400e' }}>
                {mixPanelDay.forecast.mixNote}
              </div>
            ) : null}

            <ProductMixPanel day={mixPanelDay} actualMix={mixPanelDay?.actualMix || []} />
          </div>
        </>
      )}
    </div>
  )
}
