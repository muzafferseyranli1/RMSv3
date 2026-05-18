import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { Fragment } from 'react'
import { useRef } from 'react'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import {
  PERSONNEL_SETTINGS_KEYS,
  extractBranchNodes,
  normalizeEmployeeRecord,
  readCompanyTree,
  readSettingArray,
  writeSettingArray,
} from '@/lib/personnelConfig'
import {
  SHIFT_PLANNER_VIEW_KEY,
  DEFAULT_SHIFT_DAY_START,
  DEFAULT_SHIFT_DAY_END,
  OPERATING_HOURS_TEMPLATE_KEYS,
  addDays,
  buildEntryBarLayout,
  buildHourSlots,
  buildWindowRange,
  calculateSlotCoverage,
  computeEntryNetMinutes,
  formatHourValue,
  getPersonnelDisplayName,
  getOperatingHoursTemplateDate,
  getShiftKindTone,
  getWeekdayTemplateIndex,
  parseDateKey,
  resolveBreakTimes,
  startOfWeek,
  toDateKey,
} from '@/lib/shiftPlanning'
import { readForecastSettings } from '@/lib/forecastSettings'

const PRESET_TABLE = 'branch_shift_presets'
const DAY_TABLE = 'branch_shift_schedule_days'
const ENTRY_TABLE = 'branch_shift_schedule_entries'
const SCHEMA_GUIDE = 'shift-schedule.sql'
const LABEL_COLUMN_WIDTH = 240
const TIMELINE_HOUR_WIDTH = 88
const EXTRA_PERSONNEL_SETTINGS_KEY_PREFIX = 'branch_shift_extra_personnel'
const FORECAST_PAGE_SIZE = 1000
const LABOR_HOURLY_RATE = 180

function getExtraPersonnelSettingKey(branchId) {
  return `${EXTRA_PERSONNEL_SETTINGS_KEY_PREFIX}:${branchId}`
}

function isSchemaMissingError(error) {
  const combinedText = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    combinedText.includes('does not exist') ||
    combinedText.includes('could not find') ||
    combinedText.includes('not found') ||
    combinedText.includes('42p01') ||
    combinedText.includes(DAY_TABLE) ||
    combinedText.includes(ENTRY_TABLE) ||
    combinedText.includes(PRESET_TABLE)
  )
}

function formatWeekLabel(startDate) {
  const endDate = addDays(startDate, 6)
  const rangeFormatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long' })
  return `${rangeFormatter.format(startDate)} - ${rangeFormatter.format(endDate)}`
}

function formatDayTitle(dateKey) {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(parseDateKey(dateKey))
}

function formatDayChip(dateKey) {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'short',
    day: '2-digit',
  }).format(parseDateKey(dateKey))
}

function formatMetricNumber(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatMetricCurrency(value, digits = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `₺${Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function safeForecastNumber(value, fallback = 0) {
  if (value == null || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeBranchAlias(value) {
  return String(value || '')
    .normalize('NFKC')
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

function toDateOnly(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function diffDays(left, right) {
  if (!left || !right) return 0
  return Math.round((parseDateKey(right) - parseDateKey(left)) / (1000 * 60 * 60 * 24))
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

    current.total_sales += safeForecastNumber(
      row.total_sales,
      row.payment_total ?? row.gross_total_after_discount ?? row.net_total_after_discount ?? 0,
    )
    current.receipt_count += Math.max(0, Math.round(safeForecastNumber(row.receipt_count, row.sale_date ? 0 : 1)))
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

function normalizeEntryRecord(entry) {
  return {
    ...entry,
    shift_start_time: entry.shift_start_time ? String(entry.shift_start_time).slice(0, 5) : null,
    shift_end_time: entry.shift_end_time ? String(entry.shift_end_time).slice(0, 5) : null,
    break_start_time: entry.break_start_time ? String(entry.break_start_time).slice(0, 5) : null,
    break_end_time: entry.break_end_time ? String(entry.break_end_time).slice(0, 5) : null,
  }
}

function sortScheduleEntries(rows) {
  return [...rows].sort((left, right) => {
    const dateCompare = String(left.schedule_date || '').localeCompare(String(right.schedule_date || ''))
    if (dateCompare !== 0) return dateCompare

    const sortCompare = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
    if (sortCompare !== 0) return sortCompare

    return String(left.personnel_name || '').localeCompare(String(right.personnel_name || ''), 'tr')
  })
}

function upsertEntryRecord(rows, nextEntry) {
  const filteredRows = rows.filter(row => (
    row.id !== nextEntry.id &&
    !(row.schedule_date === nextEntry.schedule_date && row.personnel_id === nextEntry.personnel_id)
  ))

  return sortScheduleEntries([...filteredRows, nextEntry])
}

async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + FORECAST_PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) throw error
    const chunk = data || []
    rows.push(...chunk)
    if (chunk.length < FORECAST_PAGE_SIZE) break
    from += FORECAST_PAGE_SIZE
  }

  return rows
}

function collectSameWeekdayRows(dailyRows, targetDate, lookbackWeeks) {
  const minDate = toDateKey(addDays(parseDateKey(targetDate), -(lookbackWeeks * 7 + 1)))
  const targetWeekday = getWeekdayTemplateIndex(targetDate)

  return dailyRows
    .filter(row =>
      row.sale_date < targetDate &&
      row.sale_date >= minDate &&
      getWeekdayTemplateIndex(row.sale_date) === targetWeekday
    )
    .sort((left, right) => left.sale_date.localeCompare(right.sale_date))
}

function computeReceiptForecast(samples, targetDate) {
  if (!samples.length) return null

  const weights = samples.map((_, index) => index + 1)
  const receiptValues = samples.map(row => safeForecastNumber(row.receipt_count))
  const avgTicketValues = samples.map(row => {
    const receiptCount = safeForecastNumber(row.receipt_count)
    if (receiptCount <= 0) return 0
    return safeForecastNumber(row.total_sales) / receiptCount
  })

  const weightedReceipts = weightedAverage(receiptValues, weights)
  const weightedAvgTicket = weightedAverage(avgTicketValues, weights)
  const firstSample = samples[0]
  const lastSample = samples[samples.length - 1]
  const trendPerWeek = samples.length > 1
    ? (safeForecastNumber(lastSample.receipt_count) - safeForecastNumber(firstSample.receipt_count)) / (samples.length - 1)
    : 0
  const weeksAhead = Math.max(1, Math.round(diffDays(lastSample.sale_date, targetDate) / 7))
  const trendAdjustment = Math.min(
    weightedReceipts * 0.18,
    Math.max(-weightedReceipts * 0.18, trendPerWeek * weeksAhead * 0.35),
  )
  const calcReceiptCount = Math.max(0, Math.round(weightedReceipts + trendAdjustment))

  return {
    calcReceiptCount,
    weightedAvgTicket,
  }
}

function buildActualMixByDate(lineRows) {
  const byDate = new Map()

  for (const row of lineRows) {
    const saleDate = toDateOnly(row.sale_datetime)
    if (!saleDate) continue

    const productId = row.product_id || row.product_name
    const productName = row.product_name || 'Ürün'
    const quantity = safeForecastNumber(row.qty)
    const lineSales = safeForecastNumber(row.line_gross_after_discount)
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
      [...productMap.values()].map(item => ({
        ...item,
        unitPrice: item.qty > 0 ? item.sales / item.qty : 0,
      })),
    )
  }

  return normalized
}

function resolveConfiguredPrice(item) {
  const directPrice = safeForecastNumber(item?.sale_price, null)
  if (directPrice != null && directPrice > 0) return directPrice

  const standardPrice = safeForecastNumber(item?.standard_price, null)
  if (standardPrice != null && standardPrice > 0) return standardPrice

  if (!Array.isArray(item?.channel_prices)) return null
  const prices = item.channel_prices
    .filter(entry => entry?.active !== false)
    .map(entry => safeForecastNumber(entry?.price, null))
    .filter(price => price != null && price > 0)

  if (!prices.length) return null
  return prices.reduce((sum, price) => sum + price, 0) / prices.length
}

function buildPriceCatalog(saleItems, actualMixByDate) {
  const catalog = new Map()
  const fallback = new Map()

  for (const item of saleItems) {
    const estimatedProductivity = safeForecastNumber(item?.substitute_id, null)
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
    return { totalSales: 0, mixSource: 'avg-ticket' }
  }

  const aggregated = new Map()
  let receiptsWithMix = 0

  for (const sample of samples) {
    const sampleMix = actualMixByDate.get(sample.sale_date) || []
    if (!sampleMix.length) continue

    const sampleReceipts = safeForecastNumber(sample.receipt_count)
    if (sampleReceipts <= 0) continue

    receiptsWithMix += sampleReceipts

    for (const item of sampleMix) {
      const current = aggregated.get(item.productId) || {
        productId: item.productId,
        productName: item.productName,
        qty: 0,
        sales: 0,
      }
      current.qty += safeForecastNumber(item.qty)
      current.sales += safeForecastNumber(item.sales)
      aggregated.set(item.productId, current)
    }
  }

  if (receiptsWithMix <= 0 && ![...priceCatalog.values()].some(item => item?.estimatedProductivity > 0)) {
    return { totalSales: 0, mixSource: 'avg-ticket' }
  }

  const totalSales = [...aggregated.values()]
    .map(item => {
      const priceMeta = priceCatalog.get(item.productId)
      const currentPrice = priceMeta?.configuredPrice ?? priceMeta?.historicalPrice ?? (item.qty > 0 ? item.sales / item.qty : 0)
      const productivityPerReceipt = item.qty / receiptsWithMix
      const forecastQty = productivityPerReceipt * receiptCount
      return forecastQty * currentPrice
    })
    .concat(
      [...priceCatalog.values()]
        .filter(item => item?.estimatedProductivity > 0 && !aggregated.has(item.productId))
        .map(item => {
          const currentPrice = item.configuredPrice ?? item.historicalPrice ?? 0
          const forecastQty = (item.estimatedProductivity / 1000) * receiptCount
          return forecastQty * currentPrice
        }),
    )
    .filter(value => value > 0)
    .reduce((sum, value) => sum + value, 0)

  return { totalSales, mixSource: totalSales > 0 ? 'product-mix' : 'avg-ticket' }
}

function buildLiveForecastSummaryMap({ weekDays, dailyRows, lineRows, saleItems, lookbackWeeks, savedForecastRows }) {
  const actualMixByDate = buildActualMixByDate(lineRows)
  const priceCatalog = buildPriceCatalog(saleItems, actualMixByDate)
  const actualByDate = new Map((dailyRows || []).map(row => [row.sale_date, row]))
  const savedForecastMap = new Map((savedForecastRows || []).map(row => [row.forecast_date, row]))

  return Object.fromEntries(weekDays.map(dateKey => {
    const actual = actualByDate.get(dateKey) || null
    const saved = savedForecastMap.get(dateKey) || null
    const samples = collectSameWeekdayRows(dailyRows, dateKey, lookbackWeeks)
    const receiptModel = computeReceiptForecast(samples, dateKey)
    const calcReceiptCount = receiptModel?.calcReceiptCount ?? safeForecastNumber(saved?.calc_receipt_count, null)
    const effectiveReceiptCount = saved?.adj_receipt_count != null
      ? safeForecastNumber(saved.adj_receipt_count, null)
      : calcReceiptCount
    const fallbackAvgTicket = receiptModel?.weightedAvgTicket
      ?? (actual?.receipt_count ? safeForecastNumber(actual.total_sales) / safeForecastNumber(actual.receipt_count) : 0)
    const mixProjection = effectiveReceiptCount != null
      ? buildMixProjection(samples, actualMixByDate, priceCatalog, effectiveReceiptCount)
      : null
    const effectiveTotalSales = effectiveReceiptCount == null
      ? null
      : mixProjection?.mixSource === 'product-mix'
        ? mixProjection.totalSales
        : effectiveReceiptCount * fallbackAvgTicket

    return [dateKey, {
      forecastDate: dateKey,
      effectiveReceiptCount,
      effectiveTotalSales: Number.isFinite(effectiveTotalSales) ? effectiveTotalSales : null,
    }]
  }))
}

function formatMetricPercent(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return `%${Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`
}

function getDayDraftMap(days, weekDays) {
  const dayMap = Object.fromEntries((days || []).map(day => [day.schedule_date, day]))
  return Object.fromEntries(weekDays.map(dayKey => {
    const templateKey = getOperatingHoursTemplateDate(getWeekdayTemplateIndex(dayKey))
    const row = dayMap[templateKey] || dayMap[dayKey]
    return [dayKey, {
      day_start_time: String(row?.day_start_time || DEFAULT_SHIFT_DAY_START).slice(0, 5),
      day_end_time: String(row?.day_end_time || DEFAULT_SHIFT_DAY_END).slice(0, 5),
      notes: row?.notes || '',
    }]
  }))
}

function createEditForm(entry, preset) {
  return {
    presetId: preset?.id || '',
    shiftStartTime: String(entry?.shift_start_time || preset?.start_time || DEFAULT_SHIFT_DAY_START).slice(0, 5),
    shiftEndTime: String(entry?.shift_end_time || preset?.end_time || DEFAULT_SHIFT_DAY_END).slice(0, 5),
    breakMinutes: Number(entry?.break_minutes ?? preset?.break_minutes ?? 0) || 0,
    breakStartTime: String(entry?.break_start_time || '').slice(0, 5),
    notes: entry?.notes || '',
  }
}

function SummaryCard({ icon, label, value, tone }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 180 }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, background: tone.bg, color: tone.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`fa-solid ${icon}`} />
      </span>
      <div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function PlannerTabs({ weekDays, activeDayKey, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {weekDays.map(dayKey => {
        const active = dayKey === activeDayKey
        return (
          <button
            key={dayKey}
            type="button"
            onClick={() => onChange(dayKey)}
            style={{
              borderRadius: 999,
              border: `1.5px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
              background: active ? '#fff7ed' : '#fff',
              color: active ? '#c2410c' : '#475569',
              fontWeight: 800,
              fontSize: '.78rem',
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            {formatDayChip(dayKey)}
          </button>
        )
      })}
    </div>
  )
}

function PresetPalette({ presets, dragPresetId, onDragStart, onDragEnd }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {presets.map(preset => {
        const tone = getShiftKindTone(preset.kind)
        const active = dragPresetId === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            draggable
            onDragStart={event => onDragStart(event, preset.id)}
            onDragEnd={onDragEnd}
            style={{
              borderRadius: 12,
              border: `1.5px solid ${active ? '#0f172a' : 'rgba(15,23,42,.08)'}`,
              background: preset.color_hex || tone.bar,
              color: '#fff',
              minWidth: 78,
              padding: '10px 14px',
              cursor: 'grab',
              boxShadow: active ? '0 10px 20px rgba(15,23,42,.22)' : 'inset 0 1px 0 rgba(255,255,255,.18)',
            }}
          >
            <div style={{ fontSize: '.98rem', fontWeight: 900, lineHeight: 1 }}>{preset.short_code || preset.name}</div>
            <div style={{ fontSize: '.68rem', opacity: 0.92, marginTop: 5 }}>
              {preset.kind === 'working' ? `${preset.start_time?.slice(0, 5)} - ${preset.end_time?.slice(0, 5)}` : tone.label}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PlannerInsightsTable({ draft, plannedHours, forecastSummary }) {
  const forecastReceipts = forecastSummary?.effectiveReceiptCount ?? null
  const forecastSales = forecastSummary?.effectiveTotalSales ?? null
  const receiptProductivity = plannedHours > 0 && forecastReceipts != null
    ? forecastReceipts / plannedHours
    : null
  const salesProductivity = plannedHours > 0 && forecastSales != null
    ? forecastSales / plannedHours
    : null
  const laborCost = plannedHours * LABOR_HOURLY_RATE
  const laborPercent = forecastSales > 0 ? (laborCost / forecastSales) * 100 : null

  const gridRows = [
    [
      { label: 'Tahmini Satış', value: formatMetricCurrency(forecastSales) },
      {
        label: 'Personel Verimliliği - Satış',
        value: salesProductivity == null ? '—' : formatMetricCurrency(salesProductivity, 1),
      },
      { label: 'Toplam İşçilik Maliyeti', value: formatMetricCurrency(laborCost) },
    ],
    [
      { label: 'Tahmini Fiş sayısı', value: formatMetricNumber(forecastReceipts) },
      {
        label: 'Personel Verimliliği - Fiş Sayısı',
        value: receiptProductivity == null ? '—' : formatMetricNumber(receiptProductivity, 1),
      },
      { label: 'Toplam İşçilik %', value: formatMetricPercent(laborPercent) },
    ],
  ]

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#475569' }}>Gün özeti</div>
          <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 3 }}>Tahmin ve verimlilik metrikleri yatay tabloda izlenir.</div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: '.78rem', fontWeight: 800 }}>
          <i className="fa-solid fa-store" />
          {`${draft.day_start_time} - ${draft.day_end_time}`}
        </div>
      </div>

      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #d7dee8' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <tbody>
            {gridRows.map((row, rowIndex) => (
              <tr key={`insight-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <Fragment key={`${cell.label}-${rowIndex}`}>
                    <td
                      style={{
                        width: '22%',
                        padding: '9px 10px',
                        background: '#f8fafc',
                        borderBottom: rowIndex === gridRows.length - 1 ? 'none' : '1px solid #d7dee8',
                        borderRight: '1px solid #d7dee8',
                        fontSize: '.75rem',
                        fontWeight: 700,
                        color: '#334155',
                      }}
                    >
                      {cell.label}
                    </td>
                    <td
                      style={{
                        width: '11.333%',
                        padding: '9px 10px',
                        background: '#fff',
                        borderBottom: rowIndex === gridRows.length - 1 ? 'none' : '1px solid #d7dee8',
                        borderRight: cellIndex === row.length - 1 ? 'none' : '1px solid #d7dee8',
                        textAlign: 'right',
                      }}
                    >
                      <div style={{ fontSize: '.84rem', fontWeight: 800, color: '#0f172a' }}>{cell.value}</div>
                    </td>
                  </Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ForecastBackgroundNotice({ loading, error, onRetry }) {
  if (!loading && !error) return null

  const warning = Boolean(error)

  return (
    <div
      className="card"
      style={{
        padding: '12px 16px',
        marginBottom: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
        borderColor: warning ? '#fdba74' : '#bfdbfe',
        background: warning ? '#fff7ed' : '#eff6ff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <i
          className={`fa-solid ${warning ? 'fa-triangle-exclamation' : 'fa-spinner fa-spin'}`}
          style={{ color: warning ? '#c2410c' : '#2563eb', flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 800, color: warning ? '#9a3412' : '#1d4ed8' }}>
            {warning ? 'Tahmin verisi şu an alınamadı' : 'Tahmin verisi arka planda hazırlanıyor'}
          </div>
          <div style={{ fontSize: '.76rem', color: warning ? '#9a3412' : '#1e40af', marginTop: 2 }}>
            {warning
              ? 'Vardiya planlamaya devam edebilirsiniz. İsterseniz tahmini yeniden deneyebilirsiniz.'
              : 'Siz plan yaparken tahmin ve verimlilik alanları kendini arka planda güncelleyecek.'}
          </div>
        </div>
      </div>

      {warning ? (
        <button type="button" className="btn-o" onClick={onRetry}>
          Tahmini Yeniden Dene
        </button>
      ) : null}
    </div>
  )
}

function PersonnelAddPicker({ options, selectedIds, saving, onToggle }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
    if (!normalizedQuery) return options
    return options.filter(option => (
      [option.label, option.description, option.searchText]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase('tr-TR').includes(normalizedQuery))
    ))
  }, [options, query])

  const selectedCount = selectedIds.length
  const disabled = saving || options.length === 0

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => {
          if (disabled) return
          setOpen(current => !current)
          setQuery('')
        }}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 36,
          borderRadius: 10,
          border: `1px solid ${open ? '#f59e0b' : '#d7dee8'}`,
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#0f172a',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '.8rem',
          fontWeight: 800,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-user-plus'}`} />
          Personel Ekle
        </span>
        {selectedCount > 0 ? (
          <span style={{ padding: '2px 8px', borderRadius: 999, background: '#fffbeb', color: '#b45309', fontSize: '.7rem', fontWeight: 900 }}>
            {selectedCount}
          </span>
        ) : (
          <i className="fa-solid fa-chevron-up" style={{ color: '#94a3b8', fontSize: '.65rem', transform: `rotate(${open ? 0 : 180}deg)`, transition: 'transform .15s' }} />
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 'calc(100% + 6px)',
            width: 'min(340px, calc(100vw - 56px))',
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            boxShadow: '0 14px 32px rgba(15,23,42,.16)',
            overflow: 'hidden',
            zIndex: 30,
          }}
        >
          <div style={{ padding: '9px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', fontSize: '.75rem' }} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Personel ara..."
              style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: '.8rem', color: '#0f172a' }}
              autoFocus
            />
          </div>

          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '.78rem' }}>
                Bu şubede çalışabilecek ek personel bulunamadı.
              </div>
            ) : filteredOptions.map(option => {
              const selected = selectedIds.includes(option.value)
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void onToggle(option.value)}
                  style={{
                    width: '100%',
                    border: `1px solid ${selected ? '#fcd34d' : '#e2e8f0'}`,
                    background: selected ? '#fffbeb' : '#fff',
                    borderRadius: 12,
                    padding: '10px 12px',
                    marginBottom: 8,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>
                    <span style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>{option.label}</span>
                    {option.description ? (
                      <span style={{ display: 'block', marginTop: 3, fontSize: '.72rem', color: '#64748b' }}>{option.description}</span>
                    ) : null}
                  </span>
                  <span style={{ flexShrink: 0, color: selected ? '#d97706' : '#cbd5e1', fontSize: '.8rem', paddingTop: 2 }}>
                    <i className={`fa-solid ${selected ? 'fa-check' : 'fa-plus'}`} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function ShiftBar({ entry, windowRange, actionsVisible, onEdit, onDelete }) {
  const tone = getShiftKindTone(entry.shift_kind)
  const layout = buildEntryBarLayout(entry, windowRange)
  if (!layout.visible) {
    return (
      <div style={{ position: 'absolute', inset: '10px 12px', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700 }}>
        {'Saat aral\u0131\u011f\u0131n\u0131n d\u0131\u015f\u0131nda'}
      </div>
    )
  }

  const shiftLabel = entry.shift_kind === 'working'
    ? `${entry.shift_short_code}  ${entry.shift_start_time?.slice(0, 5)} - ${entry.shift_end_time?.slice(0, 5)}`
    : `${entry.shift_short_code}  ${entry.shift_name}`
  const hasActions = typeof onEdit === 'function' || typeof onDelete === 'function'

  return (
    <div
      style={{
        position: 'absolute',
        left: `${layout.leftPercent}%`,
        width: `${layout.widthPercent}%`,
        top: 6,
        bottom: 6,
        minWidth: 88,
        borderRadius: 12,
        background: entry.color_hex || tone.bar,
        color: '#fff',
        padding: '0 9px 0 7px',
        display: 'flex',
        alignItems: 'center',
        boxShadow: '0 8px 14px rgba(15,23,42,.16)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', zIndex: 1, minWidth: 0, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, fontSize: '.74rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {shiftLabel}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {entry.shift_kind === 'working' && (
            <span style={{ fontSize: '.68rem', fontWeight: 700, opacity: hasActions && actionsVisible ? 0.96 : 0.9, flexShrink: 0 }}>
              {formatHourValue(computeEntryNetMinutes(entry) / 60)} sa
            </span>
          )}
          {hasActions && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                opacity: actionsVisible ? 1 : 0.24,
                pointerEvents: actionsVisible ? 'auto' : 'none',
                transition: 'opacity .18s ease, transform .18s ease',
                transform: actionsVisible ? 'translateX(0)' : 'translateX(2px)',
              }}
            >
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onEdit?.()
                }}
                aria-label="Vardiyayı düzenle"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#fff',
                  padding: 0,
                  width: 18,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-pen" />
              </button>
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onDelete?.()
                }}
                aria-label="Vardiyayı sil"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#fff',
                  padding: 0,
                  width: 18,
                  height: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-trash" />
              </button>
            </span>
          )}
        </div>
      </div>
      {layout.breakWidthPercent > 0 && (
        <div
          style={{
            position: 'absolute',
            left: `${layout.breakLeftPercent}%`,
            width: `${layout.breakWidthPercent}%`,
            top: 0,
            bottom: 0,
            background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.15) 0, rgba(255,255,255,.15) 6px, rgba(255,255,255,.3) 6px, rgba(255,255,255,.3) 12px)',
            borderInline: '1px dashed rgba(255,255,255,.6)',
          }}
        />
      )}
    </div>
  )
}

function DayBoard({
  dateKey,
  draft,
  entries,
  forecastSummary,
  personnelRows,
  presets,
  dragPresetId,
  dragTargetKey,
  onDragStart,
  onDragEnd,
  onAssignPreset,
  onTrackEnter,
  onTrackLeave,
  onOpenEdit,
  onRequestDelete,
  extraPersonnelOptions,
  selectedAdditionalPersonnelIds,
  personnelRosterSaving,
  onToggleAdditionalPersonnel,
  copySaving,
  onCopyPreviousDay,
}) {
  const [hoveredTrackKey, setHoveredTrackKey] = useState('')
  const { windowRange, slots } = useMemo(() => buildHourSlots(draft.day_start_time, draft.day_end_time), [draft.day_end_time, draft.day_start_time])
  const timelineGrid = useMemo(() => {
    const safeDuration = windowRange.duration || 1
    return slots.map(slot => `${(((slot.end - slot.start) / safeDuration) * 100).toFixed(6)}%`).join(' ')
  }, [slots, windowRange.duration])
  const timelineMinWidth = useMemo(() => {
    const totalWidth = slots.reduce((sum, slot) => sum + (((slot.end - slot.start) / 60) * TIMELINE_HOUR_WIDTH), 0)
    return `${Math.max(totalWidth, TIMELINE_HOUR_WIDTH)}px`
  }, [slots])
  const boardGridColumns = `${LABEL_COLUMN_WIDTH}px minmax(${timelineMinWidth}, 1fr)`
  const coverage = useMemo(() => slots.map(slot => calculateSlotCoverage(entries, slot, windowRange.start)), [entries, slots, windowRange.start])
  const plannedHours = useMemo(() => entries.reduce((sum, entry) => sum + computeEntryNetMinutes(entry), 0) / 60, [entries])

  return (
    <section className="card" style={{ padding: 18, display: 'grid', gap: 18 }}>
      <div>
        <div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{formatDayTitle(dateKey)}</div>
          <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
            {'\u00d6n tan\u0131mdan s\u00fcr\u00fckleyip ilgili personele b\u0131rak\u0131n. Ayn\u0131 g\u00fcn i\u00e7inde her personel i\u00e7in tek vardiya kayd\u0131 tutulur.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(520px, 1.35fr) minmax(320px, 1fr)', gap: 16 }}>
        <PlannerInsightsTable draft={draft} plannedHours={plannedHours} forecastSummary={forecastSummary} />

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '.8rem', fontWeight: 800, color: '#475569' }}>{'Vardiya \u00f6n tan\u0131mlar\u0131'}</div>
              <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 3 }}>{'\u00c7al\u0131\u015fma, izin ve rapor kodlar\u0131n\u0131 personel sat\u0131r\u0131na s\u00fcr\u00fckleyin.'}</div>
            </div>
            <button type="button" className="btn-o" onClick={() => onCopyPreviousDay?.(dateKey)} disabled={copySaving}>
              <i className={`fa-solid ${copySaving ? 'fa-spinner fa-spin' : 'fa-copy'}`} />
              Önceki Günden Kopyala
            </button>
          </div>
          <PresetPalette presets={presets} dragPresetId={dragPresetId} onDragStart={onDragStart} onDragEnd={onDragEnd} />
        </div>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflowX: 'auto', overflowY: 'hidden', background: '#fff' }}>
        <div style={{ display: 'grid', gridTemplateColumns: boardGridColumns, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ padding: '8px 16px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 800, whiteSpace: 'nowrap' }}>{'Planlanan \u0131\u015f\u00e7ilik saati'}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', lineHeight: 1, flexShrink: 0 }}>{formatHourValue(plannedHours)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: timelineGrid }}>
            {coverage.map((value, index) => (
              <div key={`coverage-${slots[index].key}`} style={{ padding: '8px 4px 5px', textAlign: 'center', fontWeight: 900, color: '#0f172a', borderLeft: index === 0 ? 'none' : '1px solid #e2e8f0', background: '#fffdf8' }}>
                {formatHourValue(value)}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: boardGridColumns, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', fontSize: '.74rem', fontWeight: 800, color: '#475569' }}>
            Saatler
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: timelineGrid, background: '#fff' }}>
            {slots.map((slot, index) => (
              <div key={`header-${slot.key}`} style={{ position: 'relative', borderLeft: index === 0 ? 'none' : '1px solid #e2e8f0', padding: '8px 8px 9px', display: 'flex', alignItems: 'baseline', justifyContent: 'flex-start', gap: 4, whiteSpace: 'nowrap', background: '#fff' }}>
                <span style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: '1px dashed rgba(148,163,184,.7)', pointerEvents: 'none' }} />
                <span style={{ fontSize: '.78rem', color: '#0f172a', fontWeight: 700 }}>
                  {slot.startLabel}
                </span>
                <span style={{ fontSize: '.7rem', color: '#94a3b8', fontWeight: 500 }}>
                  {slot.midpointLabel}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'none' }}>
          <div style={{ padding: '10px 16px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', fontSize: '.74rem', fontWeight: 800, color: '#475569' }}>
            {'Zaman aks\u0131'}
          </div>
          <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: timelineGrid, background: '#fff7ed', minHeight: 36 }}>
            {slots.map(slot => (
              <div key={`boundary-${slot.key}`} style={{ borderLeft: '1px solid rgba(248,113,113,.55)', fontSize: '.76rem', color: '#ef4444', fontWeight: 700, padding: '8px 0 8px 6px' }}>
                {slot.startLabel}
              </div>
            ))}
            <span style={{ position: 'absolute', top: 8, right: 8, color: '#ef4444', fontSize: '.76rem', fontWeight: 700 }}>
              {draft.day_end_time}
            </span>
          </div>
        </div>

        {personnelRows.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
            {extraPersonnelOptions.length > 0
              ? 'Bu şubeye varsayılan olarak atanmış aktif personel bulunamadı. Alttaki personel ekle alanından bu şubede çalışabilecek personelleri ekleyebilirsiniz.'
              : 'Bu şubeye varsayılan veya çalıştığı şubeler arasında tanımlı aktif personel bulunamadı.'}
          </div>
        ) : personnelRows.map((personnel, rowIndex) => {
          const entry = entries.find(item => item.personnel_id === personnel.id) || null
          const trackKey = `${dateKey}:${personnel.id}`
          const trackActive = dragTargetKey === trackKey
          const trackHovered = hoveredTrackKey === trackKey
          const shiftTone = entry ? getShiftKindTone(entry.shift_kind) : null

          return (
            <div key={trackKey} style={{ display: 'grid', gridTemplateColumns: boardGridColumns, minHeight: 42, borderTop: rowIndex === 0 ? 'none' : '1px solid #f1f5f9' }}>
              <div style={{ padding: '4px 14px', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.96rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{personnel.name}</div>
                </div>
              </div>

              <div
                onMouseEnter={() => setHoveredTrackKey(trackKey)}
                onMouseLeave={() => setHoveredTrackKey(current => (current === trackKey ? '' : current))}
                onDragOver={event => {
                  event.preventDefault()
                  onTrackEnter(trackKey)
                }}
                onDragEnter={() => onTrackEnter(trackKey)}
                onDragLeave={onTrackLeave}
                onDrop={event => {
                  event.preventDefault()
                  onAssignPreset({
                    dateKey,
                    personnel,
                    presetId: event.dataTransfer.getData('text/plain') || dragPresetId,
                    sortOrder: rowIndex,
                  })
                }}
                style={{
                  position: 'relative',
                  background: trackActive ? '#fff7ed' : '#fff',
                  transition: 'background .15s',
                }}
              >
                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: timelineGrid, pointerEvents: 'none' }}>
                  {slots.map((slot, index) => (
                    <div key={`grid-${trackKey}-${slot.key}`} style={{ position: 'relative', borderLeft: '1px solid rgba(248,113,113,.55)', borderRight: index === slots.length - 1 ? '1px solid rgba(248,113,113,.55)' : 'none', background: index % 2 === 0 ? 'rgba(248,250,252,.55)' : 'rgba(255,255,255,.96)' }}>
                      <span style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', borderLeft: '1px dashed rgba(148,163,184,.6)' }} />
                    </div>
                  ))}
                </div>

                {entry ? (
                  <ShiftBar
                    entry={entry}
                    windowRange={windowRange}
                    actionsVisible={trackHovered}
                    onEdit={() => onOpenEdit(dateKey, personnel, entry)}
                    onDelete={() => onRequestDelete(dateKey, personnel, entry)}
                  />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: dragPresetId ? '#c2410c' : '#94a3b8', fontSize: '.76rem', fontWeight: dragPresetId ? 800 : 600 }}>
                    {dragPresetId ? 'Vardiyay\u0131 bu sat\u0131ra b\u0131rak\u0131n' : 'Bo\u015f sat\u0131r'}
                  </div>
                )}

              </div>
            </div>
          )
        })}

        <div style={{ display: 'grid', gridTemplateColumns: boardGridColumns, minHeight: 48, borderTop: '1px solid #f1f5f9' }}>
          <div style={{ padding: '6px 14px', background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
            <PersonnelAddPicker
              options={extraPersonnelOptions}
              selectedIds={selectedAdditionalPersonnelIds}
              saving={personnelRosterSaving}
              onToggle={onToggleAdditionalPersonnel}
            />
          </div>
          <div style={{ background: '#fff' }} />
        </div>
      </div>
    </section>
  )
}

export default function ShiftPlanner() {
  const toast = useToast()
  const { branchId, branchName } = useWorkspace()
  const requestSequenceRef = useRef(0)
  const forecastSettings = readForecastSettings()
  const [weekStartDate, setWeekStartDate] = useState(() => startOfWeek(new Date()))
  const [viewMode, setViewMode] = useState(() => {
    try {
      return window.localStorage.getItem(SHIFT_PLANNER_VIEW_KEY) || 'tabs'
    } catch {
      return 'tabs'
    }
  })
  const [activeDayKey, setActiveDayKey] = useState(() => toDateKey(startOfWeek(new Date())))
  const [presets, setPresets] = useState([])
  const [entries, setEntries] = useState([])
  const [forecastSummaries, setForecastSummaries] = useState({})
  const [forecastLoading, setForecastLoading] = useState(false)
  const [forecastError, setForecastError] = useState('')
  const [dayDrafts, setDayDrafts] = useState({})
  const [personnel, setPersonnel] = useState([])
  const [branches, setBranches] = useState([])
  const [extraPersonnelIds, setExtraPersonnelIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [databaseError, setDatabaseError] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [personnelRosterSaving, setPersonnelRosterSaving] = useState(false)
  const [dragPresetId, setDragPresetId] = useState('')
  const [dragTargetKey, setDragTargetKey] = useState('')
  const [editState, setEditState] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [conflictState, setConflictState] = useState(null)
  const [copyConfirmState, setCopyConfirmState] = useState(null)

  const weekDays = useMemo(() => (
    Array.from({ length: 7 }, (_, index) => toDateKey(addDays(weekStartDate, index)))
  ), [weekStartDate])

  const operatingHourReadKeys = useMemo(() => (
    Array.from(new Set([...OPERATING_HOURS_TEMPLATE_KEYS, ...weekDays]))
  ), [weekDays])

  useEffect(() => {
    try {
      window.localStorage.setItem(SHIFT_PLANNER_VIEW_KEY, viewMode)
    } catch {
      // no-op
    }
  }, [viewMode])

  useEffect(() => {
    if (!weekDays.includes(activeDayKey)) {
      setActiveDayKey(weekDays[0])
    }
  }, [activeDayKey, weekDays])

  const loadForecastSummaries = useCallback(async ({
    activeBranchId,
    activeBranchName,
    activeWeekDays,
    requestId,
  }) => {
    if (!activeBranchId) {
      if (requestId === requestSequenceRef.current) {
        setForecastSummaries({})
        setForecastError('')
        setForecastLoading(false)
      }
      return
    }

    setForecastLoading(true)
    setForecastError('')

    try {
      const historyStartDate = toDateKey(addDays(parseDateKey(activeWeekDays[0]), -(forecastSettings.lookbackWeeks * 7 + 7)))
      const historyEndDate = toDateKey(addDays(parseDateKey(activeWeekDays[6]), -1))
      const todayDateKey = toDateKey(new Date())
      const forecastQueryEndDate = historyEndDate < todayDateKey ? historyEndDate : todayDateKey
      const branchNameAliases = buildBranchNameAliases(activeBranchName)

      const [
        preAggregatedDailyRows,
        rawSalesRows,
        saleItems,
        savedForecastRows,
      ] = await Promise.all([
        branchNameAliases.length
          ? fetchAllRows((from, to) =>
              db
                .from('daily_sales')
                .select('id,sale_date,branch_id,branch_name,total_sales,receipt_count')
                .in('branch_name', branchNameAliases)
                .gte('sale_date', historyStartDate)
                .lte('sale_date', forecastQueryEndDate)
                .order('sale_date', { ascending: true })
                .range(from, to)
            )
          : [],
        branchNameAliases.length
          ? fetchAllRows((from, to) =>
              db
                .from('sales')
                .select('sale_datetime,branch_name,payment_total,gross_total_after_discount,net_total_after_discount')
                .eq('status', 'completed')
                .in('branch_name', branchNameAliases)
                .gte('sale_datetime', `${historyStartDate}T00:00:00`)
                .lte('sale_datetime', `${forecastQueryEndDate}T23:59:59`)
                .order('sale_datetime', { ascending: true })
                .range(from, to)
            )
          : [],
        db
          .from('sale_items')
          .select('id,name,short_name,sale_price,standard_price,channel_prices,active,substitute_id')
          .eq('active', true)
          .order('name', { ascending: true }),
        db
          .from('sales_forecasts')
          .select('forecast_date,calc_receipt_count,adj_receipt_count')
          .eq('branch_id', activeBranchId)
          .gte('forecast_date', activeWeekDays[0])
          .lte('forecast_date', activeWeekDays[6])
          .order('forecast_date', { ascending: true }),
      ])

      if (saleItems.error) {
        throw saleItems.error
      }

      const dailyRows = mergeDailySalesRows(preAggregatedDailyRows || [], rawSalesRows || [], activeBranchId, activeBranchName)
      const lineWindowStartDate = dailyRows[0]?.sale_date || historyStartDate
      const lineWindowStart = lineWindowStartDate > historyStartDate ? lineWindowStartDate : historyStartDate
      const lineRows = branchNameAliases.length && lineWindowStart <= forecastQueryEndDate
        ? await fetchAllRows((from, to) =>
            db
              .from('sale_lines')
              .select('sale_datetime,branch_name,product_id,product_name,qty,line_gross_after_discount')
              .in('branch_name', branchNameAliases)
              .gte('sale_datetime', `${lineWindowStart}T00:00:00`)
              .lte('sale_datetime', `${forecastQueryEndDate}T23:59:59`)
              .order('sale_datetime', { ascending: true })
              .range(from, to)
          )
        : []

      if (requestId !== requestSequenceRef.current) return

      setForecastSummaries(buildLiveForecastSummaryMap({
        weekDays: activeWeekDays,
        dailyRows,
        lineRows,
        saleItems: saleItems.data || [],
        lookbackWeeks: forecastSettings.lookbackWeeks,
        savedForecastRows: savedForecastRows.error ? [] : (savedForecastRows.data || []),
      }))
    } catch (error) {
      if (requestId !== requestSequenceRef.current) return
      setForecastSummaries({})
      setForecastError(error.message || 'Tahmin verisi arka planda alınamadı.')
    } finally {
      if (requestId === requestSequenceRef.current) {
        setForecastLoading(false)
      }
    }
  }, [forecastSettings.lookbackWeeks])

  const load = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1
    requestSequenceRef.current = requestId

    if (!branchId) {
      setPresets([])
      setEntries([])
      setForecastSummaries({})
      setForecastLoading(false)
      setForecastError('')
      setPersonnel([])
      setBranches([])
      setExtraPersonnelIds([])
      setDayDrafts({})
      setLoading(false)
      setDatabaseError('')
      setSchemaMissing(false)
      return
    }

    setLoading(true)
    setDatabaseError('')
    setSchemaMissing(false)
    setForecastSummaries({})
    setForecastLoading(false)
    setForecastError('')

    try {
      const [
        presetResult,
        dayResult,
        entryResult,
        employeeRecords,
        extraPersonnelRecordIds,
        companyTree,
      ] = await Promise.all([
        db
          .from(PRESET_TABLE)
          .select('*')
          .eq('branch_id', branchId)
          .is('deleted_at', null)
          .order('sort_order')
          .order('name'),
        db
          .from(DAY_TABLE)
          .select('*')
          .eq('branch_id', branchId)
          .in('schedule_date', operatingHourReadKeys)
          .order('schedule_date'),
        db
          .from(ENTRY_TABLE)
          .select('*')
          .eq('branch_id', branchId)
          .gte('schedule_date', weekDays[0])
          .lte('schedule_date', weekDays[6])
          .order('schedule_date')
          .order('sort_order')
          .order('personnel_name'),
        readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
        readSettingArray(getExtraPersonnelSettingKey(branchId), value => String(value)),
        readCompanyTree(),
      ])

      if (requestId !== requestSequenceRef.current) return

      const scheduleError = presetResult.error || dayResult.error || entryResult.error
      if (scheduleError) {
        throw scheduleError
      }

      setPresets(presetResult.data || [])
      setEntries(sortScheduleEntries((entryResult.data || []).map(normalizeEntryRecord)))
      setDayDrafts(getDayDraftMap(dayResult.data || [], weekDays))
      setPersonnel(employeeRecords || [])
      setBranches(extractBranchNodes(companyTree || []))
      setExtraPersonnelIds(Array.isArray(extraPersonnelRecordIds) ? extraPersonnelRecordIds.map(value => String(value)) : [])
      window.setTimeout(() => {
        if (requestId !== requestSequenceRef.current) return
        void loadForecastSummaries({
          activeBranchId: branchId,
          activeBranchName: branchName,
          activeWeekDays: weekDays,
          requestId,
        })
      }, 0)
    } catch (error) {
      if (requestId !== requestSequenceRef.current) return
      setPresets([])
      setEntries([])
      setForecastSummaries({})
      setForecastLoading(false)
      setForecastError('')
      setPersonnel([])
      setBranches([])
      setExtraPersonnelIds([])
      setDayDrafts(getDayDraftMap([], weekDays))
      setDatabaseError(error.message || 'Vardiya plan\u0131 veritaban\u0131ndan okunamad\u0131.')
      setSchemaMissing(isSchemaMissingError(error))
    } finally {
      if (requestId === requestSequenceRef.current) {
        setLoading(false)
      }
    }
  }, [branchId, branchName, loadForecastSummaries, operatingHourReadKeys, weekDays])

  useEffect(() => {
    void load()
  }, [load])

  const activePresets = useMemo(() => (
    presets
      .filter(preset => preset.active !== false)
      .map(preset => ({
        ...preset,
        start_time: preset.start_time ? String(preset.start_time).slice(0, 5) : null,
        end_time: preset.end_time ? String(preset.end_time).slice(0, 5) : null,
      }))
  ), [presets])

  const presetMap = useMemo(() => Object.fromEntries(activePresets.map(preset => [preset.id, preset])), [activePresets])
  const branchMap = useMemo(() => Object.fromEntries(branches.map(branch => [branch.id, branch])), [branches])

  const activePersonnelRows = useMemo(() => (
    personnel
      .filter(person => !person.deletedAt && !String(person.terminationDate || '').trim())
      .map(person => ({
        ...person,
        name: getPersonnelDisplayName(person),
      }))
      .filter(person => person.name)
  ), [personnel])

  const defaultPersonnelRows = useMemo(() => (
    activePersonnelRows
      .filter(person => person.defaultBranchId === branchId)
      .sort((first, second) => first.name.localeCompare(second.name, 'tr'))
  ), [activePersonnelRows, branchId])

  const eligibleExtraPersonnelMap = useMemo(() => (
    Object.fromEntries(
      activePersonnelRows
        .filter(person => person.defaultBranchId !== branchId)
        .filter(person => Array.isArray(person.workingBranchIds) && person.workingBranchIds.includes(branchId))
        .sort((first, second) => first.name.localeCompare(second.name, 'tr'))
        .map(person => [person.id, person])
    )
  ), [activePersonnelRows, branchId])

  const selectedAdditionalPersonnelIds = useMemo(() => (
    Array.from(new Set(extraPersonnelIds.filter(personId => !!eligibleExtraPersonnelMap[personId])))
  ), [eligibleExtraPersonnelMap, extraPersonnelIds])

  const additionalPersonnelRows = useMemo(() => (
    selectedAdditionalPersonnelIds
      .map(personId => eligibleExtraPersonnelMap[personId])
      .filter(Boolean)
  ), [eligibleExtraPersonnelMap, selectedAdditionalPersonnelIds])

  const extraPersonnelOptions = useMemo(() => (
    Object.values(eligibleExtraPersonnelMap).map(person => ({
      value: person.id,
      label: person.name,
      description: `${branchMap[person.defaultBranchId]?.name || 'Tanımsız'} şubesi personelidir.`,
      searchText: `${person.name} ${person.registryNumber || ''} ${person.mobilePhone || ''}`,
    }))
  ), [branchMap, eligibleExtraPersonnelMap])

  const personnelRows = useMemo(() => (
    [...defaultPersonnelRows, ...additionalPersonnelRows]
  ), [additionalPersonnelRows, defaultPersonnelRows])

  const personnelById = useMemo(() => (
    Object.fromEntries(activePersonnelRows.map(person => [person.id, person]))
  ), [activePersonnelRows])

  const entriesByDay = useMemo(() => (
    Object.fromEntries(weekDays.map(dayKey => [dayKey, entries.filter(entry => entry.schedule_date === dayKey)]))
  ), [entries, weekDays])

  const weekPlannedHours = useMemo(() => entries.reduce((sum, entry) => sum + computeEntryNetMinutes(entry), 0) / 60, [entries])

  const presetSelectOptions = useMemo(() => activePresets.map(preset => {
    const tone = getShiftKindTone(preset.kind)
    return {
      value: preset.id,
      label: `${preset.short_code || preset.name} \u2022 ${preset.name}`,
      selectedLabel: `${preset.short_code || preset.name} \u2022 ${tone.label}`,
      description: preset.kind === 'working'
        ? `${preset.start_time} - ${preset.end_time} \u2022 Mola ${formatHourValue((Number(preset.break_minutes) || 0) / 60)} saat`
        : tone.label,
      meta: tone.label,
      searchText: `${preset.name} ${preset.short_code} ${tone.label}`,
    }
  }), [activePresets])

  async function toggleAdditionalPersonnel(personId) {
    if (!branchId || !eligibleExtraPersonnelMap[personId]) return

    const selected = selectedAdditionalPersonnelIds.includes(personId)
    const nextIds = selected
      ? selectedAdditionalPersonnelIds.filter(currentId => currentId !== personId)
      : [...selectedAdditionalPersonnelIds, personId]
    const personName = eligibleExtraPersonnelMap[personId]?.name || 'Personel'

    setPersonnelRosterSaving(true)
    try {
      await writeSettingArray(getExtraPersonnelSettingKey(branchId), nextIds)
      setExtraPersonnelIds(nextIds)
      toast(
        selected
          ? `${personName} planner listesinden çıkarıldı.`
          : `${personName} planner listesine eklendi.`,
        selected ? 'info' : 'success',
      )
    } catch (error) {
      toast(error.message || 'Planner personel listesi kaydedilemedi.', 'error')
    } finally {
      setPersonnelRosterSaving(false)
    }
  }

  function formatConflictBranchNames(conflicts) {
    const labels = Array.from(new Set(conflicts.map(conflict => branchMap[conflict.branch_id]?.name || conflict.branch_id)))
    if (labels.length <= 1) return labels[0] || 'başka bir şube'
    if (labels.length === 2) return `${labels[0]} ve ${labels[1]}`
    return `${labels.slice(0, -1).join(', ')} ve ${labels.at(-1)}`
  }

  async function findCrossBranchConflicts({ dateKey, personnelRow }) {
    const { data, error } = await db
      .from(ENTRY_TABLE)
      .select('id,branch_id,schedule_date,shift_name,shift_short_code')
      .eq('personnel_id', personnelRow.id)
      .eq('schedule_date', dateKey)
      .neq('branch_id', branchId)

    if (error) throw error
    return data || []
  }

  async function findBulkCrossBranchConflicts({ dateKey, personnelIds }) {
    const uniquePersonnelIds = Array.from(new Set((personnelIds || []).filter(Boolean)))
    if (!uniquePersonnelIds.length) return []

    const { data, error } = await db
      .from(ENTRY_TABLE)
      .select('id,branch_id,personnel_id,schedule_date,shift_name,shift_short_code')
      .in('personnel_id', uniquePersonnelIds)
      .eq('schedule_date', dateKey)
      .neq('branch_id', branchId)

    if (error) throw error
    return data || []
  }

  async function fetchBranchDayEntries(dateKey) {
    const { data, error } = await db
      .from(ENTRY_TABLE)
      .select('*')
      .eq('branch_id', branchId)
      .eq('schedule_date', dateKey)
      .order('sort_order')
      .order('personnel_name')

    if (error) throw error
    return sortScheduleEntries((data || []).map(normalizeEntryRecord))
  }

  async function saveEntryRecord({ payload, existingEntry, silent = false }) {
    const query = existingEntry
      ? db.from(ENTRY_TABLE).update(payload).eq('id', existingEntry.id).select('*').single()
      : db.from(ENTRY_TABLE).insert(payload).select('*').single()

    const { data, error } = await query
    if (error) {
      if (!silent) {
        toast(error.message || 'Vardiya kaydı kaydedilemedi.', 'error')
      }
      return { saved: false, entry: null }
    }

    const normalizedEntry = normalizeEntryRecord(data)
    setEntries(current => upsertEntryRecord(current, normalizedEntry))
    return { saved: true, entry: normalizedEntry }
  }

  async function attemptPersistEntry(params, options = {}) {
    const result = buildEntryPayload(params)
    if (result.error) {
      toast(result.error, 'error')
      return { saved: false }
    }

    let conflicts = []
    try {
      conflicts = await findCrossBranchConflicts(params)
    } catch (error) {
      toast(error.message || 'Diğer şube vardiyaları kontrol edilemedi.', 'error')
      return { saved: false }
    }

    if (conflicts.length > 0 && !options.skipConflictCheck) {
      const personnelName = params.personnelRow.name
      const otherBranchNames = formatConflictBranchNames(conflicts)
      const isDefaultBranchManager = params.personnelRow.defaultBranchId === branchId

      if (!isDefaultBranchManager) {
        toast(`${personnelName} kişisinin ${otherBranchNames} şubesinde planlı vardiyası var, plan yapılamaz.`, 'error')
        return { saved: false, blocked: true }
      }

      setConflictState({
        conflicts,
        params,
        payload: result.payload,
        otherBranchNames,
        personnelName,
      })
      return { saved: false, blocked: true }
    }

    const saveResult = await saveEntryRecord({ payload: result.payload, existingEntry: params.existingEntry })
    return saveResult
  }

  function buildEntryPayload({ dateKey, personnelRow, preset, existingEntry, overrides, sortOrder }) {
    const isWorking = preset.kind === 'working'
    const shiftStartTime = isWorking ? String(overrides?.shiftStartTime || existingEntry?.shift_start_time || preset.start_time || DEFAULT_SHIFT_DAY_START).slice(0, 5) : null
    const shiftEndTime = isWorking ? String(overrides?.shiftEndTime || existingEntry?.shift_end_time || preset.end_time || DEFAULT_SHIFT_DAY_END).slice(0, 5) : null
    const breakMinutes = isWorking ? Math.max(0, Number(overrides?.breakMinutes ?? existingEntry?.break_minutes ?? preset.break_minutes ?? 0) || 0) : 0
    const explicitBreakStartTime = isWorking ? String(overrides?.breakStartTime ?? existingEntry?.break_start_time ?? '').slice(0, 5) : ''
    const breakInfo = isWorking
      ? resolveBreakTimes({
        shiftStartTime,
        shiftEndTime,
        breakMinutes,
        breakStartTime: explicitBreakStartTime,
        autoPlaceWhenMissing: false,
      })
      : { breakStartTime: '', breakEndTime: '', breakMinutes: 0 }

    if (breakInfo.error) {
      return { error: breakInfo.error }
    }

    return {
      payload: {
        branch_id: branchId,
        schedule_date: dateKey,
        personnel_id: personnelRow.id,
        personnel_name: personnelRow.name,
        source_shift_preset_id: preset.id,
        shift_name: preset.name,
        shift_short_code: preset.short_code,
        shift_kind: preset.kind,
        shift_start_time: isWorking ? shiftStartTime : null,
        shift_end_time: isWorking ? shiftEndTime : null,
        break_start_time: isWorking && breakInfo.breakStartTime ? breakInfo.breakStartTime : null,
        break_end_time: isWorking && breakInfo.breakEndTime ? breakInfo.breakEndTime : null,
        break_minutes: isWorking ? breakInfo.breakMinutes : 0,
        color_hex: preset.color_hex || getShiftKindTone(preset.kind).bar,
        sort_order: Number(sortOrder) || 0,
        notes: String(overrides?.notes ?? existingEntry?.notes ?? '').trim() || null,
      },
    }
  }

  async function handleAssignPreset({ dateKey, personnel, presetId, sortOrder }) {
    const preset = presetMap[presetId]
    if (!preset) return

    const existingEntry = (entriesByDay[dateKey] || []).find(entry => entry.personnel_id === personnel.id) || null
    setSavingKey(`entry:${dateKey}:${personnel.id}`)
    const result = await attemptPersistEntry({
      dateKey,
      personnelRow: personnel,
      preset,
      existingEntry,
      sortOrder,
    })
    setSavingKey('')
    setDragPresetId('')
    setDragTargetKey('')

    if (result.saved) {
      toast(`${personnel.name} i\u00e7in ${preset.short_code || preset.name} atand\u0131.`, 'success')
    }
  }

  async function executeCopyFromPreviousDay({ dateKey, previousDayKey, sourceEntries }) {
    if (!branchId) return

    setSavingKey(`copy:${dateKey}`)

    try {
      const skippedInactiveNames = []
      const candidateEntries = []
      const nextExtraPersonnelIds = new Set(extraPersonnelIds)

      for (const sourceEntry of sourceEntries) {
        const personnelRow = personnelById[sourceEntry.personnel_id]
        if (!personnelRow) {
          skippedInactiveNames.push(sourceEntry.personnel_name || 'Personel')
          continue
        }

        candidateEntries.push({ sourceEntry, personnelRow })

        if (eligibleExtraPersonnelMap[sourceEntry.personnel_id]) {
          nextExtraPersonnelIds.add(sourceEntry.personnel_id)
        }
      }

      if (!candidateEntries.length) {
        toast('Önceki günden aktarılabilecek aktif personel vardiyası bulunamadı.', 'info')
        return
      }

      const conflicts = await findBulkCrossBranchConflicts({
        dateKey,
        personnelIds: candidateEntries.map(item => item.personnelRow.id),
      })

      const conflictsByPersonnelId = new Map()
      for (const conflict of conflicts) {
        const bucket = conflictsByPersonnelId.get(conflict.personnel_id) || []
        bucket.push(conflict)
        conflictsByPersonnelId.set(conflict.personnel_id, bucket)
      }

      const copyableEntries = candidateEntries.filter(item => !conflictsByPersonnelId.has(item.personnelRow.id))
      const blockedEntries = candidateEntries.filter(item => conflictsByPersonnelId.has(item.personnelRow.id))

      if (!copyableEntries.length) {
        const blockedNames = blockedEntries.map(item => item.personnelRow.name)
        toast(`${blockedNames.join(', ')} için başka şubede aynı gün vardiya var. Kopyalama yapılmadı.`, 'error')
        return
      }

      let nextTargetEntries = [...(entriesByDay[dateKey] || [])]
      const failedNames = []

      for (const { sourceEntry, personnelRow } of copyableEntries) {
        const existingEntry = nextTargetEntries.find(entry => entry.personnel_id === personnelRow.id) || null
        const payload = {
          branch_id: branchId,
          schedule_date: dateKey,
          personnel_id: personnelRow.id,
          personnel_name: personnelRow.name,
          source_shift_preset_id: sourceEntry.source_shift_preset_id,
          shift_name: sourceEntry.shift_name,
          shift_short_code: sourceEntry.shift_short_code,
          shift_kind: sourceEntry.shift_kind,
          shift_start_time: sourceEntry.shift_start_time || null,
          shift_end_time: sourceEntry.shift_end_time || null,
          break_start_time: sourceEntry.break_start_time || null,
          break_end_time: sourceEntry.break_end_time || null,
          break_minutes: Number(sourceEntry.break_minutes) || 0,
          color_hex: sourceEntry.color_hex || getShiftKindTone(sourceEntry.shift_kind).bar,
          sort_order: Number(sourceEntry.sort_order) || 0,
          notes: sourceEntry.notes || null,
        }

        const saveResult = await saveEntryRecord({ payload, existingEntry, silent: true })
        if (!saveResult.saved || !saveResult.entry) {
          failedNames.push(personnelRow.name)
          continue
        }

        nextTargetEntries = upsertEntryRecord(nextTargetEntries, saveResult.entry)
      }

      const nextExtraIds = Array.from(nextExtraPersonnelIds)
      const extraPersonnelChanged = nextExtraIds.length !== extraPersonnelIds.length || nextExtraIds.some((id, index) => id !== extraPersonnelIds[index])
      if (extraPersonnelChanged) {
        setExtraPersonnelIds(nextExtraIds)
        try {
          await writeSettingArray(getExtraPersonnelSettingKey(branchId), nextExtraIds)
        } catch (error) {
          toast(error.message || 'Ek personel listesi kalıcı olarak güncellenemedi.', 'error')
        }
      }

      const copiedCount = copyableEntries.length - failedNames.length
      if (copiedCount > 0) {
        toast(`${formatDayTitle(previousDayKey)} planından ${copiedCount} vardiya kopyalandı.`, 'success')
      }
      if (blockedEntries.length > 0) {
        toast(`${blockedEntries.map(item => item.personnelRow.name).join(', ')} için başka şubede aynı gün vardiya var. Bu personeller atlandı.`, 'error')
      }
      if (skippedInactiveNames.length > 0) {
        toast(`${skippedInactiveNames.join(', ')} aktif listede olmadığı için kopyalanmadı.`, 'info')
      }
      if (failedNames.length > 0) {
        toast(`${failedNames.join(', ')} için kopyalama kaydı tamamlanamadı.`, 'error')
      }
    } catch (error) {
      toast(error.message || 'Önceki gün planı kopyalanamadı.', 'error')
    } finally {
      setSavingKey('')
      setCopyConfirmState(null)
    }
  }

  async function requestCopyPreviousDay(dateKey) {
    if (!branchId) return

    const previousDayKey = toDateKey(addDays(parseDateKey(dateKey), -1))
    setSavingKey(`copy-prepare:${dateKey}`)

    try {
      const sourceEntries = await fetchBranchDayEntries(previousDayKey)

      if (!sourceEntries.length) {
        toast(`${formatDayTitle(previousDayKey)} için kopyalanacak vardiya bulunamadı.`, 'info')
        return
      }

      if (!(entriesByDay[dateKey] || []).length) {
        await executeCopyFromPreviousDay({
          dateKey,
          previousDayKey,
          sourceEntries,
        })
        return
      }

      setCopyConfirmState({
        dateKey,
        previousDayKey,
        sourceEntries,
      })
    } catch (error) {
      toast(error.message || 'Önceki gün planı okunamadı.', 'error')
    } finally {
      setSavingKey(current => (current === `copy-prepare:${dateKey}` ? '' : current))
    }
  }

  function openEdit(dateKey, personnelRow, entry) {
    const preset = presetMap[entry.source_shift_preset_id] || activePresets.find(item => item.short_code === entry.shift_short_code) || null
    if (!preset) {
      toast('Bu kayd\u0131n ba\u011fl\u0131 vardiya \u00f6n tan\u0131m\u0131 bulunamad\u0131.', 'error')
      return
    }

    setEditState({
      dateKey,
      personnelRow,
      entry,
    })
    setEditForm(createEditForm(entry, preset))
  }

  function closeEdit() {
    setEditState(null)
    setEditForm(null)
  }

  function handleEditPresetChange(presetId) {
    const preset = presetMap[presetId]
    if (!preset) return
    setEditForm(current => {
      const nextForm = createEditForm(null, preset)
      return {
        ...nextForm,
        notes: current?.notes || '',
      }
    })
  }

  async function saveEdit() {
    if (!editState || !editForm) return

    const preset = presetMap[editForm.presetId]
    if (!preset) {
      toast('Vardiya \u00f6n tan\u0131m\u0131 se\u00e7in.', 'error')
      return
    }

    setSavingKey(`edit:${editState.entry.id}`)
    const result = await attemptPersistEntry({
      dateKey: editState.dateKey,
      personnelRow: editState.personnelRow,
      preset,
      existingEntry: editState.entry,
      sortOrder: editState.entry.sort_order,
      overrides: {
        shiftStartTime: editForm.shiftStartTime,
        shiftEndTime: editForm.shiftEndTime,
        breakMinutes: editForm.breakMinutes,
        breakStartTime: editForm.breakStartTime,
        notes: editForm.notes,
      },
    })
    setSavingKey('')

    if (result.saved) {
      toast('Vardiya kayd\u0131 g\u00fcncellendi.', 'success')
      closeEdit()
    }
  }

  async function deleteEntry() {
    if (!confirmDelete) return
    setSavingKey(`delete:${confirmDelete.entry.id}`)
    const { error } = await db.from(ENTRY_TABLE).delete().eq('id', confirmDelete.entry.id)
    setSavingKey('')
    if (error) {
      toast(error.message || 'Vardiya kayd\u0131 silinemedi.', 'error')
      return
    }

    setConfirmDelete(null)
    setEntries(current => current.filter(entry => entry.id !== confirmDelete.entry.id))
    toast('Vardiya kayd\u0131 silindi.', 'info')
  }

  function closeConflictModal() {
    setConflictState(null)
  }

  async function overrideConflictAndSave() {
    if (!conflictState) return

    setSavingKey('conflict-resolution')
    const conflictIds = conflictState.conflicts.map(conflict => conflict.id).filter(Boolean)

    if (conflictIds.length > 0) {
      const { error } = await db
        .from(ENTRY_TABLE)
        .delete()
        .in('id', conflictIds)

      if (error) {
        setSavingKey('')
        toast(error.message || 'Diğer şubedeki vardiya silinemedi.', 'error')
        return
      }
    }

    const saveResult = await saveEntryRecord({
      payload: conflictState.payload,
      existingEntry: conflictState.params.existingEntry,
    })
    setSavingKey('')

    if (!saveResult.saved) return

    const deletedBranchNames = formatConflictBranchNames(conflictState.conflicts)
    toast(`${deletedBranchNames} şubesindeki çakışan vardiya silinip kayıt tamamlandı.`, 'success')
    setConflictState(null)
    if (editState) {
      closeEdit()
    }
  }

  const activeEditPreset = editForm?.presetId ? presetMap[editForm.presetId] : null
  const activeEditTone = activeEditPreset ? getShiftKindTone(activeEditPreset.kind) : null
  const activeEditBreak = activeEditPreset && editForm && String(editForm.breakStartTime || '').trim()
    ? resolveBreakTimes({
      shiftStartTime: editForm.shiftStartTime,
      shiftEndTime: editForm.shiftEndTime,
      breakMinutes: editForm.breakMinutes,
      breakStartTime: editForm.breakStartTime,
      autoPlaceWhenMissing: false,
    })
    : null
  const activeEditRange = editForm ? buildWindowRange(editForm.shiftStartTime, editForm.shiftEndTime) : null
  const activeEditNetHours = activeEditRange ? Math.max(activeEditRange.duration - (Number(editForm?.breakMinutes) || 0), 0) / 60 : 0

  return (
    <>
      <Header
        title={'Vardiya Plan\u0131'}
        subtitle={branchName ? `${branchName} i\u00e7in haftal\u0131k vardiya \u00e7izelgesi` : 'Haftal\u0131k vardiya \u00e7izelgesi'}
        actions={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-o" onClick={() => setWeekStartDate(previous => addDays(previous, -7))}>
              <i className="fa-solid fa-chevron-left" />
            </button>
            <div style={{ padding: '9px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 800, color: '#0f172a' }}>
              {formatWeekLabel(weekStartDate)}
            </div>
            <button type="button" className="btn-o" onClick={() => setWeekStartDate(startOfWeek(new Date()))}>
              Bu Hafta
            </button>
            <button type="button" className="btn-o" onClick={() => setWeekStartDate(previous => addDays(previous, 7))}>
              <i className="fa-solid fa-chevron-right" />
            </button>
          </div>
        )}
      />

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <SummaryCard icon="fa-users" label={'Plan personeli'} value={personnelRows.length} tone={{ bg: '#eff6ff', color: '#2563eb' }} />
        <SummaryCard icon="fa-grip" label={'Aktif vardiya \u00f6n tan\u0131m\u0131'} value={activePresets.length} tone={{ bg: '#ecfdf5', color: '#059669' }} />
        <SummaryCard icon="fa-clock" label={'Haftal\u0131k planlanan i\u015f\u00e7ilik'} value={`${formatHourValue(weekPlannedHours)} saat`} tone={{ bg: '#fff7ed', color: '#c2410c' }} />
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#0f172a' }}>{'Hafta g\u00f6r\u00fcn\u00fcm\u00fc'}</div>
            <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
              {'G\u00fcnleri sekmeli g\u00f6sterebilir veya t\u00fcm haftay\u0131 alt alta a\u00e7abilirsiniz.'}
            </div>
          </div>

          <div style={{ display: 'inline-flex', padding: 4, borderRadius: 999, border: '1px solid #e2e8f0', background: '#f8fafc' }}>
            {[
              { value: 'tabs', label: 'Sekmeli', icon: 'fa-table-cells-large' },
              { value: 'stacked', label: 'Alt alta', icon: 'fa-grip-lines' },
            ].map(option => {
              const active = viewMode === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setViewMode(option.value)}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    background: active ? '#fff' : 'transparent',
                    color: active ? '#0f172a' : '#64748b',
                    padding: '8px 12px',
                    fontSize: '.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: active ? '0 1px 2px rgba(15,23,42,.08)' : 'none',
                  }}
                >
                  <i className={`fa-solid ${option.icon}`} style={{ marginRight: 6 }} />
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        {viewMode === 'tabs' && (
          <PlannerTabs weekDays={weekDays} activeDayKey={activeDayKey} onChange={setActiveDayKey} />
        )}
      </div>

      <ForecastBackgroundNotice
        loading={forecastLoading}
        error={forecastError}
        onRetry={() => {
          const requestId = requestSequenceRef.current
          void loadForecastSummaries({
            activeBranchId: branchId,
            activeBranchName: branchName,
            activeWeekDays: weekDays,
            requestId,
          })
        }}
      />

      {schemaMissing ? (
        <div className="card" style={{ padding: 22, borderColor: '#fecaca', background: '#fff7f7' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>{'Veritaban\u0131 eri\u015filemiyor'}</div>
          <div style={{ fontSize: '.83rem', color: '#7f1d1d', lineHeight: 1.6 }}>
            {`branch_shift_schedule_days veya branch_shift_schedule_entries tablosu okunamad\u0131. \u00d6nce ${SCHEMA_GUIDE} uygulanmal\u0131; planlay\u0131c\u0131 yerel fallback ile devam etmez.`}
          </div>
        </div>
      ) : loading ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
          {'Vardiya plan\u0131 y\u00fckleniyor...'}
        </div>
      ) : databaseError ? (
        <div className="card" style={{ padding: 22, borderColor: '#fecaca', background: '#fff7f7', color: '#7f1d1d' }}>
          {databaseError}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {(viewMode === 'tabs' ? [activeDayKey] : weekDays).map(dayKey => (
            <DayBoard
              key={dayKey}
              dateKey={dayKey}
              draft={dayDrafts[dayKey] || { day_start_time: DEFAULT_SHIFT_DAY_START, day_end_time: DEFAULT_SHIFT_DAY_END, notes: '' }}
              entries={entriesByDay[dayKey] || []}
              forecastSummary={forecastSummaries[dayKey] || null}
              personnelRows={personnelRows}
              presets={activePresets}
              dragPresetId={dragPresetId}
              dragTargetKey={dragTargetKey}
              onDragStart={(event, presetId) => {
                event.dataTransfer.setData('text/plain', presetId)
                event.dataTransfer.effectAllowed = 'move'
                setDragPresetId(presetId)
              }}
              onDragEnd={() => {
                setDragPresetId('')
                setDragTargetKey('')
              }}
              onAssignPreset={handleAssignPreset}
              onTrackEnter={setDragTargetKey}
              onTrackLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDragTargetKey('')
                }
              }}
              onOpenEdit={openEdit}
              onRequestDelete={(dateValue, personnelRow, entry) => setConfirmDelete({ dateKey: dateValue, personnelRow, entry })}
              extraPersonnelOptions={extraPersonnelOptions}
              selectedAdditionalPersonnelIds={selectedAdditionalPersonnelIds}
              personnelRosterSaving={personnelRosterSaving}
              onToggleAdditionalPersonnel={toggleAdditionalPersonnel}
              copySaving={savingKey === `copy:${dayKey}` || savingKey === `copy-prepare:${dayKey}`}
              onCopyPreviousDay={requestCopyPreviousDay}
            />
          ))}
        </div>
      )}

      <Modal
        open={!!copyConfirmState}
        onClose={() => {
          if (!savingKey.startsWith('copy:')) {
            setCopyConfirmState(null)
          }
        }}
        title="Önceki gün planı kopyalansın mı?"
        subtitle={copyConfirmState ? `${formatDayTitle(copyConfirmState.previousDayKey)} → ${formatDayTitle(copyConfirmState.dateKey)}` : ''}
        width={560}
        footer={(
          <>
            <button className="btn-o" onClick={() => setCopyConfirmState(null)} disabled={savingKey.startsWith('copy:')}>
              Vazgeç
            </button>
            <button
              className="btn-p"
              onClick={() => {
                if (!copyConfirmState) return
                void executeCopyFromPreviousDay(copyConfirmState)
              }}
              disabled={savingKey.startsWith('copy:')}
            >
              <i className={`fa-solid ${savingKey.startsWith('copy:') ? 'fa-spinner fa-spin' : 'fa-copy'}`} />
              Planı Kopyala
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: '.84rem', lineHeight: 1.6 }}>
            {copyConfirmState
              ? `${formatDayTitle(copyConfirmState.previousDayKey)} günündeki vardiyalar bu güne personel bazında kopyalanacak. Aynı personelin bugünkü kaydı varsa onun üzerine yazılır, diğer bugünkü kayıtlar korunur.`
              : ''}
          </div>
          <div style={{ fontSize: '.8rem', color: '#475569', lineHeight: 1.6 }}>
            Toplu kopyada çapraz şube çakışması olan personeller otomatik silinmez; bu personeller güvenli tarafta bırakılır ve sana ayrıca bildirilir.
          </div>
        </div>
      </Modal>

      <Modal
        open={!!conflictState}
        onClose={closeConflictModal}
        title="Şube vardiya çakışması"
        subtitle={conflictState ? `${conflictState.personnelName} • ${formatDayTitle(conflictState.params.dateKey)}` : ''}
        width={560}
        footer={(
          <>
            <button className="btn-o" onClick={closeConflictModal} disabled={savingKey === 'conflict-resolution'}>
              Düzenle
            </button>
            <button className="btn-p" onClick={overrideConflictAndSave} disabled={savingKey === 'conflict-resolution'}>
              <i className={`fa-solid ${savingKey === 'conflict-resolution' ? 'fa-spinner fa-spin' : 'fa-trash-can'}`} />
              Diğer Şubedeki Vardiyayı Sil ve Kaydet
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: '12px 14px', borderRadius: 14, background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', fontSize: '.86rem', lineHeight: 1.6 }}>
            {conflictState
              ? `${conflictState.personnelName} kişisinin ${conflictState.otherBranchNames} şubesinde vardiya planı var.`
              : ''}
          </div>
          <div style={{ fontSize: '.83rem', color: '#475569', lineHeight: 1.6 }}>
            Varsayılan şube planı önceliklidir. Devam ederseniz diğer şubedeki aynı gün vardiyası silinir ve bu şube kaydı kaydedilir.
          </div>
          {conflictState?.conflicts?.length ? (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              {conflictState.conflicts.map(conflict => (
                <div
                  key={conflict.id}
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: conflict.id === conflictState.conflicts[0].id ? 'none' : '1px solid #f1f5f9' }}
                >
                  <div>
                    <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>{branchMap[conflict.branch_id]?.name || conflict.branch_id}</div>
                    <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 2 }}>
                      {conflict.shift_short_code || conflict.shift_name || 'Planlı vardiya'}
                    </div>
                  </div>
                  <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#ef4444' }}>Silinecek</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={!!editState && !!editForm}
        onClose={closeEdit}
        title={'Vardiya kayd\u0131n\u0131 d\u00fczenle'}
        subtitle={editState ? `${editState.personnelRow.name} \u2022 ${formatDayTitle(editState.dateKey)}` : ''}
        width={720}
        footer={(
          <>
            <button className="btn-o" onClick={closeEdit}>{'Vazge\u00e7'}</button>
            <button className="btn-p" onClick={saveEdit} disabled={savingKey.startsWith('edit:')}>
              <i className={`fa-solid ${savingKey.startsWith('edit:') ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
              Kaydet
            </button>
          </>
        )}
      >
        {editForm && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 14 }}>
              <div>
                <label className="f-label">{'Vardiya \u00f6n tan\u0131m\u0131'}</label>
                <SearchableSelect
                  value={editForm.presetId}
                  onChange={handleEditPresetChange}
                  options={presetSelectOptions}
                  placeholder={'\u00d6n tan\u0131m se\u00e7in...'}
                  searchPlaceholder="Vardiya ara..."
                  allowClear={false}
                />
              </div>

              <div>
                <label className="f-label">Aktif tip</label>
                <div style={{ minHeight: 36, border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {activeEditTone && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, background: activeEditTone.background, color: activeEditTone.color, fontSize: '.72rem', fontWeight: 800 }}>
                      {activeEditTone.label}
                    </span>
                  )}
                  <span style={{ color: '#475569', fontSize: '.8rem' }}>{activeEditPreset?.short_code || activeEditPreset?.name}</span>
                </div>
              </div>
            </div>

            {activeEditPreset?.kind === 'working' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
                  <div>
                    <label className="f-label">{'Ba\u015flang\u0131\u00e7 saati'}</label>
                    <input className="f-input" type="time" step="300" value={editForm.shiftStartTime} onChange={event => setEditForm(current => ({ ...current, shiftStartTime: event.target.value }))} />
                  </div>
                  <div>
                    <label className="f-label">{'Biti\u015f saati'}</label>
                    <input className="f-input" type="time" step="300" value={editForm.shiftEndTime} onChange={event => setEditForm(current => ({ ...current, shiftEndTime: event.target.value }))} />
                  </div>
                  <div>
                    <label className="f-label">{'Mola s\u00fcresi (dk)'}</label>
                    <input className="f-input" type="number" min="0" step="5" value={editForm.breakMinutes} onChange={event => setEditForm(current => ({ ...current, breakMinutes: event.target.value }))} />
                  </div>
                  <div>
                    <label className="f-label">{'Mola ba\u015flang\u0131c\u0131'}</label>
                    <input className="f-input" type="time" step="300" value={editForm.breakStartTime} onChange={event => setEditForm(current => ({ ...current, breakStartTime: event.target.value }))} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span className="badge">{`Mola biti\u015fi ${activeEditBreak?.breakEndTime || '-'}`}</span>
                  <span className="badge">{`Net s\u00fcre ${formatHourValue(activeEditNetHours)} saat`}</span>
                  {activeEditBreak?.error && <span className="badge bgr">{activeEditBreak.error}</span>}
                </div>
              </>
            )}

            <div>
              <label className="f-label">Not</label>
              <textarea className="f-input" rows="4" value={editForm.notes} onChange={event => setEditForm(current => ({ ...current, notes: event.target.value }))} placeholder={'\u0130ste\u011fe ba\u011fl\u0131 not...'} />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={'Vardiya kayd\u0131 silinsin mi?'}
        desc={confirmDelete ? `${confirmDelete.personnelRow.name} i\u00e7in atanm\u0131\u015f vardiya kayd\u0131 bu g\u00fcnden kald\u0131r\u0131lacak.` : ''}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={deleteEntry}
      />
    </>
  )
}
