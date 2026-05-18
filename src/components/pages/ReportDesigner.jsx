import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { getAllBranches, parseJsonValue } from '@/lib/branchPurchasing'
import { db } from '@/lib/db'

// ═══════════════════════════════════════════════════════════════════════════
// ALAN KATALOGLARI — 3 kaynak
// ═══════════════════════════════════════════════════════════════════════════

const SOURCES = [
  { id: 'sales',     label: 'Satış Raporları',     icon: 'fa-chart-line',   color: '#fb923c', table: 'sale_lines',           dateCol: 'sale_datetime'  },
  { id: 'inventory', label: 'Envanter Raporları',  icon: 'fa-boxes-stacked', color: '#34d399', table: 'inventory_movements',  dateCol: 'movement_at'    },
  { id: 'financial', label: 'Finansal Raporlar',   icon: 'fa-file-invoice-dollar', color: '#a78bfa', table: 'expense_documents', dateCol: 'document_date' },
]

// ── Satış alanları (sale_lines) ──────────────────────────────────────────
const SALES_DIMS = [
  { id: 's_branch',        label: 'Şube',              col: 'branch_name',           kind: 'dimension', dataType: 'text' },
  { id: 's_channel',       label: 'Satış Kanalı',      col: 'sales_channel_name',    kind: 'dimension', dataType: 'text' },
  { id: 's_top_cat',       label: 'Ana Kategori',      col: 'top_category_name',     kind: 'dimension', dataType: 'text' },
  { id: 's_sub_cat',       label: 'Alt Kategori',      col: 'sub_category_name',     kind: 'dimension', dataType: 'text' },
  { id: 's_product',       label: 'Ürün Adı',          col: 'product_name',          kind: 'dimension', dataType: 'text' },
  { id: 's_sku',           label: 'Ürün SKU',          col: 'product_sku',           kind: 'dimension', dataType: 'text' },
  { id: 's_portion',       label: 'Porsiyon',          col: 'portion_name',          kind: 'dimension', dataType: 'text' },
  { id: 's_tax_name',      label: 'Vergi Tipi',        col: 'tax_name',              kind: 'dimension', dataType: 'text' },
  { id: 's_tax_rate',      label: 'Vergi Oranı',       col: 'tax_rate',              kind: 'dimension', dataType: 'number' },
  { id: 's_date_day',      label: 'Tarih (Gün)',       col: 'sale_datetime',         kind: 'dimension', dataType: 'date', transform: 'day'   },
  { id: 's_date_week',     label: 'Tarih (Hafta)',     col: 'sale_datetime',         kind: 'dimension', dataType: 'date', transform: 'week'  },
  { id: 's_date_month',    label: 'Tarih (Ay)',        col: 'sale_datetime',         kind: 'dimension', dataType: 'date', transform: 'month' },
  { id: 's_date_quarter',  label: 'Tarih (Çeyrek)',    col: 'sale_datetime',         kind: 'dimension', dataType: 'date', transform: 'quarter' },
  { id: 's_date_hour',     label: 'Saat Dilimi',       col: 'sale_datetime',         kind: 'dimension', dataType: 'date', transform: 'hour'  },
  { id: 's_date_weekday',  label: 'Haftanın Günü',     col: 'sale_datetime',         kind: 'dimension', dataType: 'date', transform: 'weekday' },
]

const SALES_MEASURES = [
  { id: 's_revenue',       label: 'Satış Tutarı',       col: 'line_gross_after_discount',  kind: 'measure', agg: 'sum',          fmt: 'currency' },
  { id: 's_net_revenue',   label: 'Net Satış Tutarı',   col: 'line_net_after_discount',    kind: 'measure', agg: 'sum',          fmt: 'currency' },
  { id: 's_qty',           label: 'Adet',               col: 'qty',                        kind: 'measure', agg: 'sum',          fmt: 'decimal'  },
  { id: 's_cost',          label: 'Maliyet',            col: 'line_cost_total',            kind: 'measure', agg: 'sum',          fmt: 'currency' },
  { id: 's_gross_margin',  label: 'Brüt Kar',           col: null,                         kind: 'measure', agg: 'gross_margin', fmt: 'currency' },
  { id: 's_margin_pct',    label: 'Kar Marjı (%)',      col: null,                         kind: 'measure', agg: 'margin',       fmt: 'percent'  },
  { id: 's_discount',      label: 'İndirim Tutarı',     col: 'discount_allocated_amount',  kind: 'measure', agg: 'sum',          fmt: 'currency' },
  { id: 's_tax_amount',    label: 'Vergi Tutarı',       col: null,                         kind: 'measure', agg: 'tax_amount',   fmt: 'currency' },
  { id: 's_sale_count',    label: 'Satış Sayısı',       col: 'sale_id',                    kind: 'measure', agg: 'countDistinct',fmt: 'integer'  },
  { id: 's_line_count',    label: 'Kalem Sayısı',       col: 'sale_id',                    kind: 'measure', agg: 'count',        fmt: 'integer'  },
  { id: 's_avg_ticket',    label: 'Ortalama Bilet',     col: null,                         kind: 'measure', agg: 'avg_ticket',   fmt: 'currency' },
  { id: 's_avg_unit_price',label: 'Ort. Birim Fiyat',   col: 'line_gross_after_discount',  kind: 'measure', agg: 'avg',          fmt: 'currency' },
  { id: 's_gross_before',  label: 'İndirim Öncesi Tutar',col:'line_gross_before_discount', kind: 'measure', agg: 'sum',          fmt: 'currency' },
]

// ── Envanter alanları (inventory_movements) ──────────────────────────────
const INV_DIMS = [
  { id: 'i_branch',        label: 'Şube',              col: 'branch_name',           kind: 'dimension', dataType: 'text' },
  { id: 'i_warehouse',     label: 'Depo',              col: 'warehouse_name',        kind: 'dimension', dataType: 'text' },
  { id: 'i_item_name',     label: 'Stok Malı Adı',     col: 'item_name',             kind: 'dimension', dataType: 'text' },
  { id: 'i_item_sku',      label: 'SKU',               col: 'item_sku',              kind: 'dimension', dataType: 'text' },
  { id: 'i_item_type',     label: 'Stok Tipi',         col: 'item_type',             kind: 'dimension', dataType: 'text' },
  { id: 'i_unit',          label: 'Birim',             col: 'unit',                  kind: 'dimension', dataType: 'text' },
  { id: 'i_mvt_type',      label: 'Hareket Türü',      col: 'movement_type',         kind: 'dimension', dataType: 'text' },
  { id: 'i_doc_type',      label: 'Belge Türü',        col: 'source_doc_type',       kind: 'dimension', dataType: 'text' },
  { id: 'i_doc_no',        label: 'Belge No',          col: 'source_doc_no',         kind: 'dimension', dataType: 'text' },
  { id: 'i_doc_ref',       label: 'Belge Referansı',   col: 'source_doc_ref',        kind: 'dimension', dataType: 'text' },
  { id: 'i_direction',     label: 'Yön (Giriş/Çıkış)', col: 'direction',            kind: 'dimension', dataType: 'text' },
  { id: 'i_channel',       label: 'Satış Kanalı',      col: 'sales_channel_name',    kind: 'dimension', dataType: 'text' },
  { id: 'i_counterparty',  label: 'Karşı Şube',        col: 'counterparty_branch_name', kind: 'dimension', dataType: 'text' },
  { id: 'i_transfer_pair', label: 'Transfer Eşleşme No', col: 'transfer_pair_id',    kind: 'dimension', dataType: 'text' },
  { id: 'i_calc_status',   label: 'Hesap Durumu',      col: 'calc_status',           kind: 'dimension', dataType: 'text' },
  { id: 'i_cancelled',     label: 'İptal Durumu',      col: 'is_cancelled',          kind: 'dimension', dataType: 'boolean' },
  { id: 'i_reversal_ref',  label: 'Ters Kayıt Bağlantısı', col: 'reversal_of_movement_id', kind: 'dimension', dataType: 'text' },
  { id: 'i_date_day',      label: 'Tarih (Gün)',       col: 'movement_at',           kind: 'dimension', dataType: 'date', transform: 'day'   },
  { id: 'i_date_week',     label: 'Tarih (Hafta)',     col: 'movement_at',           kind: 'dimension', dataType: 'date', transform: 'week'  },
  { id: 'i_date_month',    label: 'Tarih (Ay)',        col: 'movement_at',           kind: 'dimension', dataType: 'date', transform: 'month' },
  { id: 'i_date_quarter',  label: 'Tarih (Çeyrek)',    col: 'movement_at',           kind: 'dimension', dataType: 'date', transform: 'quarter' },
]

const INV_MEASURES = [
  { id: 'i_qty_total',     label: 'Hareket Miktarı',   col: 'quantity',              kind: 'measure', agg: 'sum',          fmt: 'decimal'  },
  { id: 'i_qty_in',        label: 'Giriş Miktarı',     col: null,                    kind: 'measure', agg: 'qty_in',       fmt: 'decimal'  },
  { id: 'i_qty_out',       label: 'Çıkış Miktarı',     col: null,                    kind: 'measure', agg: 'qty_out',      fmt: 'decimal'  },
  { id: 'i_net_qty',       label: 'Net Miktar',        col: 'quantity_signed',       kind: 'measure', agg: 'sum',          fmt: 'decimal'  },
  { id: 'i_total_cost',    label: 'Toplam Maliyet',    col: 'total_cost',            kind: 'measure', agg: 'sum',          fmt: 'currency' },
  { id: 'i_cost_signed',   label: 'Net Maliyet Etkisi',col: 'total_cost_signed',     kind: 'measure', agg: 'sum',          fmt: 'currency' },
  { id: 'i_avg_cost',      label: 'Birim Maliyet',     col: 'unit_cost',             kind: 'measure', agg: 'avg',          fmt: 'currency' },
  { id: 'i_avg_cost_after',label: 'Ort. Birim Maliyet',col: 'avg_unit_cost_after',   kind: 'measure', agg: 'last',         fmt: 'currency' },
  { id: 'i_balance_qty',   label: 'Son Bakiye (Adet)', col: 'balance_qty_after',     kind: 'measure', agg: 'last',         fmt: 'decimal'  },
  { id: 'i_balance_cost',  label: 'Son Bakiye (₺)',    col: 'balance_total_cost_after', kind: 'measure', agg: 'last',      fmt: 'currency' },
  { id: 'i_mvt_count',     label: 'Hareket Sayısı',    col: 'id',                    kind: 'measure', agg: 'count',        fmt: 'integer'  },
]

// ── Finansal alanları (expense_documents) ────────────────────────────────
const FIN_DIMS = [
  { id: 'f_branch',        label: 'Şube',              col: 'branch_name',           kind: 'dimension', dataType: 'text' },
  { id: 'f_doc_type',      label: 'Belge Türü',        col: 'document_type',         kind: 'dimension', dataType: 'text' },
  { id: 'f_doc_no',        label: 'Belge No',          col: 'document_no',           kind: 'dimension', dataType: 'text' },
  { id: 'f_doc_group',     label: 'Belge Grup No',     col: 'document_group_id',     kind: 'dimension', dataType: 'text' },
  { id: 'f_supplier',      label: 'Tedarikçi',         col: 'supplier_name',         kind: 'dimension', dataType: 'text' },
  { id: 'f_account_code',  label: 'Hesap Kodu',        col: 'expense_account_id',    kind: 'dimension', dataType: 'text' },
  { id: 'f_account_name',  label: 'Hesap Adı',         col: 'expense_account_name',  kind: 'dimension', dataType: 'text' },
  { id: 'f_accounting_code', label: 'Muhasebe Kodu',   col: 'accounting_code',       kind: 'dimension', dataType: 'text' },
  { id: 'f_acc_category',  label: 'Muhasebe Kategorisi', col: 'accounting_category', kind: 'dimension', dataType: 'text' },
  { id: 'f_acc_group',     label: 'Hesap Grubu',       col: 'account_group',         kind: 'dimension', dataType: 'text' },
  { id: 'f_acc_section',   label: 'Hesap Bölümü',      col: 'account_section',       kind: 'dimension', dataType: 'text' },
  { id: 'f_acc_type',      label: 'Hesap Tipi',        col: 'account_type',          kind: 'dimension', dataType: 'text' },
  { id: 'f_acc_scope',     label: 'Hesap Kapsamı',     col: 'account_scope',         kind: 'dimension', dataType: 'text' },
  { id: 'f_date_day',      label: 'Belge Tarihi (Gün)',col: 'document_date',         kind: 'dimension', dataType: 'date', transform: 'day'   },
  { id: 'f_date_month',    label: 'Belge Tarihi (Ay)', col: 'document_date',         kind: 'dimension', dataType: 'date', transform: 'month' },
  { id: 'f_date_quarter',  label: 'Belge Tarihi (Çeyrek)', col: 'document_date',     kind: 'dimension', dataType: 'date', transform: 'quarter' },
  { id: 'f_period_start',  label: 'Dönem Başlangıcı',  col: 'period_start',          kind: 'dimension', dataType: 'date' },
  { id: 'f_period_end',    label: 'Dönem Bitişi',      col: 'period_end',            kind: 'dimension', dataType: 'date' },
  { id: 'f_distribution_mode', label: 'Dağıtım Modu',  col: 'distribution_mode',     kind: 'dimension', dataType: 'text' },
  { id: 'f_distribute_by_day', label: 'Güne Yay',      col: 'distribute_by_day',     kind: 'dimension', dataType: 'boolean' },
  { id: 'f_allocation_share', label: 'Dağıtım Payı',   col: 'allocation_share',      kind: 'dimension', dataType: 'number' },
]

const FIN_MEASURES = [
  { id: 'f_amount',        label: 'Tutar',             col: 'amount',                kind: 'measure', agg: 'sum',   fmt: 'currency' },
  { id: 'f_source_amount', label: 'Kaynak Tutar',      col: 'source_amount',         kind: 'measure', agg: 'sum',   fmt: 'currency' },
  { id: 'f_doc_count',     label: 'Belge Sayısı',      col: 'id',                    kind: 'measure', agg: 'count', fmt: 'integer'  },
  { id: 'f_avg_amount',    label: 'Ortalama Tutar',    col: 'amount',                kind: 'measure', agg: 'avg',   fmt: 'currency' },
  { id: 'f_min_amount',    label: 'En Düşük Tutar',    col: 'amount',                kind: 'measure', agg: 'min',   fmt: 'currency' },
  { id: 'f_max_amount',    label: 'En Yüksek Tutar',   col: 'amount',                kind: 'measure', agg: 'max',   fmt: 'currency' },
]

const SOURCE_FIELDS = {
  sales:     { dims: SALES_DIMS, measures: SALES_MEASURES },
  inventory: { dims: INV_DIMS,   measures: INV_MEASURES   },
  financial: { dims: FIN_DIMS,   measures: FIN_MEASURES   },
}

// ═══════════════════════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════════════════════

const WEEKDAY_TR = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi']
const QUARTER_LABELS = { 1:'Q1', 2:'Q1', 3:'Q1', 4:'Q2', 5:'Q2', 6:'Q2', 7:'Q3', 8:'Q3', 9:'Q3', 10:'Q4', 11:'Q4', 12:'Q4' }

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isoWeek(dateStr) {
  const d = new Date(`${String(dateStr).slice(0,10)}T12:00:00`)
  const day = d.getDay() || 7
  d.setDate(d.getDate() + 4 - day)
  const year = d.getFullYear()
  const jan1 = new Date(year, 0, 1)
  const week = Math.ceil((((d - jan1) / 86400000) + jan1.getDay() + 1) / 7)
  return `${year}-H${String(week).padStart(2,'0')}`
}

function getDimValue(row, field) {
  const raw = row[field.col]
  if (raw === null || raw === undefined || raw === '') return '(Boş)'
  if (!field.transform) return String(raw)
  const d = new Date(raw instanceof Date ? raw : `${String(raw).slice(0,10)}T12:00:00`)
  if (field.transform === 'day')     return String(raw).slice(0, 10)
  if (field.transform === 'week')    return isoWeek(raw)
  if (field.transform === 'month')   return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  if (field.transform === 'quarter') return `${d.getFullYear()}-${QUARTER_LABELS[d.getMonth()+1]}`
  if (field.transform === 'hour')    return `${String(d.getHours()).padStart(2,'0')}:00`
  if (field.transform === 'weekday') return WEEKDAY_TR[d.getDay()]
  return String(raw)
}

function createMeasureState(mf) {
  if (mf.agg === 'count') return { count: 0 }
  if (mf.agg === 'countDistinct') return { distinct: new Set() }
  if (mf.agg === 'last') return { last: 0 }
  if (mf.agg === 'margin' || mf.agg === 'gross_margin') return { gross: 0, cost: 0 }
  if (mf.agg === 'tax_amount') return { gross: 0, net: 0 }
  if (mf.agg === 'avg_ticket') return { gross: 0, sales: new Set() }
  if (mf.agg === 'qty_in' || mf.agg === 'qty_out' || mf.agg === 'sum') return { sum: 0 }
  if (mf.agg === 'avg') return { sum: 0, count: 0 }
  if (mf.agg === 'min') return { value: Infinity, hasValue: false }
  if (mf.agg === 'max') return { value: -Infinity, hasValue: false }
  return { sum: 0 }
}

function updateMeasureState(state, mf, row) {
  if (mf.agg === 'count') {
    state.count += 1
    return
  }
  if (mf.agg === 'countDistinct') {
    state.distinct.add(row[mf.col])
    return
  }
  if (mf.agg === 'last') {
    state.last = parseFloat(row[mf.col]) || 0
    return
  }
  if (mf.agg === 'margin' || mf.agg === 'gross_margin') {
    state.gross += parseFloat(row.line_gross_after_discount) || 0
    state.cost += parseFloat(row.line_cost_total) || 0
    return
  }
  if (mf.agg === 'tax_amount') {
    state.gross += parseFloat(row.line_gross_after_discount) || 0
    state.net += parseFloat(row.line_net_after_discount) || 0
    return
  }
  if (mf.agg === 'avg_ticket') {
    state.gross += parseFloat(row.line_gross_after_discount) || 0
    state.sales.add(row.sale_id)
    return
  }
  if (mf.agg === 'qty_in') {
    if (row.direction === 'in') state.sum += parseFloat(row.quantity) || 0
    return
  }
  if (mf.agg === 'qty_out') {
    if (row.direction === 'out') state.sum += parseFloat(row.quantity) || 0
    return
  }

  const value = parseFloat(row[mf.col]) || 0
  if (mf.agg === 'sum') {
    state.sum += value
    return
  }
  if (mf.agg === 'avg') {
    state.sum += value
    state.count += 1
    return
  }
  if (mf.agg === 'min') {
    state.value = state.hasValue ? Math.min(state.value, value) : value
    state.hasValue = true
    return
  }
  if (mf.agg === 'max') {
    state.value = state.hasValue ? Math.max(state.value, value) : value
    state.hasValue = true
  }
}

function finalizeMeasureState(state, mf) {
  if (mf.agg === 'count') return state.count
  if (mf.agg === 'countDistinct') return state.distinct.size
  if (mf.agg === 'last') return state.last || 0
  if (mf.agg === 'margin') return state.gross > 0 ? ((state.gross - state.cost) / state.gross) * 100 : 0
  if (mf.agg === 'gross_margin') return state.gross - state.cost
  if (mf.agg === 'tax_amount') return state.gross - state.net
  if (mf.agg === 'avg_ticket') return state.sales.size > 0 ? state.gross / state.sales.size : 0
  if (mf.agg === 'qty_in' || mf.agg === 'qty_out' || mf.agg === 'sum') return state.sum
  if (mf.agg === 'avg') return state.count > 0 ? state.sum / state.count : 0
  if (mf.agg === 'min' || mf.agg === 'max') return state.hasValue ? state.value : 0
  return 0
}

function createCellState(measureFields) {
  return Object.fromEntries(measureFields.map(mf => [mf.id, createMeasureState(mf)]))
}

function updateCellState(cellState, measureFields, row) {
  measureFields.forEach(mf => updateMeasureState(cellState[mf.id], mf, row))
}

function finalizeCellState(cellState, measureFields) {
  const finalized = {}
  measureFields.forEach(mf => {
    finalized[mf.id] = finalizeMeasureState(cellState[mf.id], mf)
  })
  return finalized
}

function fmtVal(val, fmt) {
  const n = Number(val || 0)
  if (fmt === 'currency') return n.toLocaleString('tr-TR', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' ₺'
  if (fmt === 'percent')  return n.toLocaleString('tr-TR', { minimumFractionDigits:1, maximumFractionDigits:1 }) + '%'
  if (fmt === 'integer')  return n.toLocaleString('tr-TR', { maximumFractionDigits:0 })
  return n.toLocaleString('tr-TR', { minimumFractionDigits:3, maximumFractionDigits:3 })
}

function excelNumberFormat(fmt) {
  if (fmt === 'currency') return '#,##0.00 "₺"'
  if (fmt === 'percent') return '#,##0.0"%"'
  if (fmt === 'integer') return '#,##0'
  return '#,##0.000'
}

function sanitizeSheetName(value) {
  return String(value || 'Rapor')
    .replace(/[\\/?*[\]:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Rapor'
}

function sanitizeFilePart(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'rapor'
}

function buildExportDataset(result, rowFields, valueFields) {
  if (!result) return { columns: [], rows: [] }

  const columns = rowFields.map((field, index) => ({
    header: field.label,
    kind: 'dimension',
    value: row => row.labels[index] ?? '',
  }))

  result.displayCols.forEach(colKey => {
    valueFields.forEach(field => {
      columns.push({
        header: result.showColDim
          ? `${colKey === '__total__' ? 'Toplam' : colKey} - ${field.label}`
          : field.label,
        kind: 'measure',
        fmt: field.fmt,
        value: row => Number(row.cells[colKey]?.[field.id] ?? 0),
        totalValue: () => Number(result.grandTotal[colKey]?.[field.id] ?? 0),
      })
    })
  })

  const rows = result.resultRows.map(row => columns.map(column => column.value(row)))
  const totalRow = columns.map((column, index) => {
    if (column.kind === 'dimension') return index === 0 ? 'GENEL TOPLAM' : ''
    return column.totalValue()
  })

  return { columns, rows: [...rows, totalRow] }
}

function createPivotAccumulator(rowFields, colField, measureFields) {
  return {
    rowFields,
    colField,
    measureFields,
    rowMap: new Map(),
    colKeys: new Set(),
    grandByCol: new Map(),
    grandTotal: createCellState(measureFields),
  }
}

function updatePivotAccumulator(acc, row) {
  const { rowFields, colField, measureFields, rowMap, colKeys, grandByCol, grandTotal } = acc
  const labels = rowFields.map(field => getDimValue(row, field))
  const rowKey = labels.join('\u0000')
  const colKey = colField ? getDimValue(row, colField) : '__total__'

  colKeys.add(colKey)

  if (!rowMap.has(rowKey)) {
    rowMap.set(rowKey, {
      labels,
      cells: new Map(),
      total: createCellState(measureFields),
    })
  }

  const rowEntry = rowMap.get(rowKey)
  if (!rowEntry.cells.has(colKey)) rowEntry.cells.set(colKey, createCellState(measureFields))

  updateCellState(rowEntry.cells.get(colKey), measureFields, row)
  updateCellState(rowEntry.total, measureFields, row)

  if (colField) {
    if (!grandByCol.has(colKey)) grandByCol.set(colKey, createCellState(measureFields))
    updateCellState(grandByCol.get(colKey), measureFields, row)
  }

  updateCellState(grandTotal, measureFields, row)
}

function finalizePivot(acc) {
  const { rowMap, colKeys, colField, measureFields, grandByCol, grandTotal } = acc
  const sortedRowKeys = [...rowMap.keys()].sort()
  const sortedColKeys = colField ? [...colKeys].sort() : ['__total__']

  const resultRows = sortedRowKeys.map(rowKey => {
    const rowEntry = rowMap.get(rowKey)
    const cells = {}
    sortedColKeys.forEach(colKey => {
      const cellState = rowEntry.cells.get(colKey)
      cells[colKey] = cellState ? finalizeCellState(cellState, measureFields) : finalizeCellState(createCellState(measureFields), measureFields)
    })
    cells.__total__ = finalizeCellState(rowEntry.total, measureFields)
    return { labels: rowEntry.labels, cells }
  })

  const displayCols = colField ? [...sortedColKeys, '__total__'] : ['__total__']
  const finalizedGrandTotal = {}
  displayCols.forEach(colKey => {
    if (colKey === '__total__' || !colField) {
      finalizedGrandTotal[colKey] = finalizeCellState(grandTotal, measureFields)
    } else {
      const cellState = grandByCol.get(colKey)
      finalizedGrandTotal[colKey] = cellState
        ? finalizeCellState(cellState, measureFields)
        : finalizeCellState(createCellState(measureFields), measureFields)
    }
  })

  return {
    resultRows,
    sortedColKeys,
    displayCols,
    showColDim: !!colField,
    grandTotal: finalizedGrandTotal,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALT BİLEŞENLER
// ═══════════════════════════════════════════════════════════════════════════

function FieldChip({ field, fromZone, onRemove, onDragStart }) {
  const isDim = field.kind === 'dimension'
  return (
    <div
      draggable
      onDragStart={() => onDragStart(field, fromZone)}
      style={{
        display:'inline-flex', alignItems:'center', gap:5,
        padding:'3px 10px', borderRadius:99,
        background: isDim ? '#dbeafe' : '#dcfce7',
        border: `1px solid ${isDim ? '#93c5fd' : '#86efac'}`,
        color: isDim ? '#1d4ed8' : '#15803d',
        fontSize:'.76rem', fontWeight:700, cursor:'grab', userSelect:'none', whiteSpace:'nowrap',
      }}
    >
      <i className={`fa-solid ${isDim ? 'fa-tag' : 'fa-hashtag'}`} style={{fontSize:'.6rem'}}/>
      {field.label}
      {onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(field) }}
          style={{background:'none', border:'none', padding:'0 0 0 4px', cursor:'pointer',
            color:'rgba(15,23,42,.45)', fontSize:'.7rem', lineHeight:1}}
        >✕</button>
      )}
    </div>
  )
}

function DropZone({ id, icon, label, badge, fields, onDrop, onRemove, onDragStart }) {
  const [over, setOver] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(id) }}
      style={{
        flex:1, minHeight:72, borderRadius:12,
        border:`1.5px dashed ${over ? '#818cf8' : '#cbd5e1'}`,
        background: over ? '#eef2ff' : '#f8fafc',
        padding:'8px 10px', transition:'all .15s',
      }}
    >
      <div style={{fontSize:'.67rem', fontWeight:800, color:'#64748b',
        letterSpacing:'.07em', textTransform:'uppercase', marginBottom:7,
        display:'flex', alignItems:'center', gap:5}}>
        <i className={`fa-solid ${icon}`}/>
        {label}
        {badge && <span style={{marginLeft:4, opacity:.55}}>{badge}</span>}
      </div>
      <div style={{display:'flex', flexWrap:'wrap', gap:5}}>
        {fields.length === 0 && (
          <span style={{color:'rgba(255,255,255,.18)', fontSize:'.72rem'}}>Buraya sürükle…</span>
        )}
        {fields.map(f => (
          <FieldChip key={f.id} field={f} fromZone={id} onRemove={onRemove} onDragStart={onDragStart}/>
        ))}
      </div>
    </div>
  )
}

function PivotTable({ result, rowFields, valueFields }) {
  if (!result) return null
  const { resultRows, displayCols, showColDim, grandTotal } = result

  const tdBase = { padding:'6px 12px', fontSize:'.77rem',
    borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap', color:'#334155' }
  const thBase  = { ...tdBase, fontWeight:700, color:'#64748b',
    background:'#f8fafc', textAlign:'left' }
  const numTd   = { ...tdBase, textAlign:'right', fontVariantNumeric:'tabular-nums', color:'#0f172a' }
  const numTh   = { ...thBase, textAlign:'right' }
  const totalTd = { ...numTd, fontWeight:700, color:'#1d4ed8', background:'#eef2ff' }
  const totalTh = { ...numTh, background:'#e0e7ff', color:'#1d4ed8' }
  const grandTr = { background:'#eef2ff' }

  return (
    <div style={{overflowX:'auto', overflowY:'auto', maxHeight:520,
      borderRadius:10, border:'1px solid #e2e8f0', background:'#fff'}}>
      <table style={{borderCollapse:'collapse', width:'100%', minWidth:400}}>
        <thead style={{position:'sticky', top:0, zIndex:2}}>
          {showColDim && (
            <tr>
              {rowFields.map(rf => <th key={rf.id} style={{...thBase, minWidth:100}}></th>)}
              {displayCols.map(ck => (
                <th key={ck} colSpan={valueFields.length} style={{
                  ...thBase, textAlign:'center',
                  borderLeft:'1px solid #e2e8f0',
                  background: ck==='__total__' ? '#e0e7ff' : '#f8fafc',
                  color: ck==='__total__' ? '#1d4ed8' : '#64748b',
                }}>
                  {ck === '__total__' ? 'TOPLAM' : ck}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {rowFields.map(rf => (
              <th key={rf.id} style={{...thBase, minWidth:110}}>{rf.label}</th>
            ))}
            {displayCols.map(ck =>
              valueFields.map(mf => (
                <th key={`${ck}-${mf.id}`} style={{
                  ...(!showColDim && ck==='__total__' ? totalTh : numTh),
                  minWidth:110,
                  borderLeft: mf===valueFields[0] ? '1px solid #e2e8f0' : undefined,
                  background: ck==='__total__' ? '#e0e7ff' : '#f8fafc',
                  color: ck==='__total__' ? '#1d4ed8' : '#64748b',
                }}>
                  {!showColDim && ck==='__total__' ? `${mf.label}` : mf.label}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {resultRows.map((row, ri) => (
            <tr key={ri} style={{background: ri%2===0 ? '#ffffff' : '#f8fafc'}}>
              {row.labels.map((lbl, li) => (
                <td key={li} style={{...tdBase, color:'#0f172a', fontWeight: li===0 ? 600 : 400}}>
                  {lbl}
                </td>
              ))}
              {displayCols.map(ck =>
                valueFields.map(mf => {
                  const val = row.cells[ck]?.[mf.id] ?? 0
                  return (
                    <td key={`${ck}-${mf.id}`} style={{
                      ...(ck==='__total__' ? totalTd : numTd),
                        borderLeft: mf===valueFields[0] ? '1px solid #e2e8f0' : undefined,
                    }}>
                      {fmtVal(val, mf.fmt)}
                    </td>
                  )
                })
              )}
            </tr>
          ))}
          <tr style={grandTr}>
            <td colSpan={rowFields.length} style={{
              ...thBase, fontWeight:800, color:'#1d4ed8',
              background:'#e0e7ff', borderTop:'1px solid #c7d2fe',
            }}>
              GENEL TOPLAM
            </td>
            {displayCols.map(ck =>
              valueFields.map(mf => {
                const val = grandTotal[ck]?.[mf.id] ?? 0
                return (
                  <td key={`gt-${ck}-${mf.id}`} style={{
                    ...totalTd,
                      borderLeft: mf===valueFields[0] ? '1px solid #c7d2fe' : undefined,
                      borderTop: '1px solid #c7d2fe',
                  }}>
                    {fmtVal(val, mf.fmt)}
                  </td>
                )
              })
            )}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════════════════

const FIELD_SEARCH_PLACEHOLDER = 'Alan ara...'
const CALCULATED_MEASURES_STORAGE_KEY = 'suitable_rms_report_designer_calculated_measures_v1'
const REPORT_TEMPLATES_SETTINGS_KEY = 'report_designer_templates_v1'
const PREVIEW_GROUP_LIMIT = 20
const PREVIEW_RAW_LIMIT = 2000
const PRESET_OPTIONS = [
  { value: 'today', label: 'Bugun' },
  { value: 'yesterday', label: 'Dun' },
  { value: 'last7', label: 'Son 7 Gun' },
  { value: 'last30', label: 'Son 30 Gun' },
  { value: 'thisMonth', label: 'Bu Ay' },
  { value: 'lastMonth', label: 'Gecen Ay' },
]

function createDateRange(preset) {
  const today = todayIso()
  const current = new Date(`${today}T12:00:00`)
  const year = current.getFullYear()
  const month = current.getMonth()
  const formatLocalDate = (date) => (
    `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
  )

  if (preset === 'today') return { dateFrom: today, dateTo: today }
  if (preset === 'yesterday') {
    const day = addDays(today, -1)
    return { dateFrom: day, dateTo: day }
  }
  if (preset === 'last7') return { dateFrom: addDays(today, -6), dateTo: today }
  if (preset === 'last30') return { dateFrom: addDays(today, -29), dateTo: today }
  if (preset === 'thisMonth') {
    const start = new Date(year, month, 1)
    return { dateFrom: formatLocalDate(start), dateTo: today }
  }
  if (preset === 'lastMonth') {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0)
    return {
      dateFrom: formatLocalDate(start),
      dateTo: formatLocalDate(end),
    }
  }

  return { dateFrom: addDays(today, -29), dateTo: today }
}

function normalizeFormulaToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function getMeasureToken(field) {
  return normalizeFormulaToken(field?.token || field?.label || field?.name || field?.id)
}

function buildMeasureCatalogForSource(sourceId, calculatedMeasures) {
  const source = SOURCE_FIELDS[sourceId]
  if (!source) return []
  const baseMeasures = (source.measures || []).map(field => ({
    ...field,
    token: getMeasureToken(field),
    isCalculated: false,
  }))
  const calculatedCatalog = (calculatedMeasures || [])
    .filter(field => field.sourceId === sourceId)
    .map(field => ({
      ...field,
      label: field.name,
      kind: 'measure',
      agg: 'calculated',
      token: field.token || getMeasureToken(field),
      isCalculated: true,
    }))
  return [...baseMeasures, ...calculatedCatalog]
}

function normalizeReportTemplates(value) {
  const parsed = parseJsonValue(value, [])
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: String(item.id || `template_${Date.now()}`),
      name: String(item.name || '').trim(),
      description: String(item.description || '').trim(),
      sourceId: String(item.sourceId || item?.config?.sourceId || 'sales'),
      config: item.config && typeof item.config === 'object' ? item.config : {},
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
    }))
    .filter(item => item.name)
}

function readCalculatedMeasures() {
  if (typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CALCULATED_MEASURES_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCalculatedMeasures(items) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CALCULATED_MEASURES_STORAGE_KEY, JSON.stringify(items || []))
}

function getFormulaTokens(formula) {
  return Array.from(new Set(String(formula || '').match(/[A-Za-z_][A-Za-z0-9_]*/g) || []))
}

function buildMeasureTokenMap(fields) {
  const map = new Map()
  ;(fields || []).forEach(field => {
    const token = getMeasureToken(field)
    if (token) map.set(token, field)
    if (field?.id) map.set(field.id, field)
  })
  return map
}

function collectRequiredMeasureFields(selectedFields, allFields) {
  const tokenMap = buildMeasureTokenMap(allFields)
  const result = new Map()
  const visited = new Set()

  function visit(field) {
    if (!field?.id || visited.has(field.id)) return
    visited.add(field.id)
    if (!field.isCalculated) {
      result.set(field.id, field)
      return
    }
    getFormulaTokens(field.formula).forEach(token => {
      const nextField = tokenMap.get(token)
      if (nextField) visit(nextField)
    })
  }

  ;(selectedFields || []).forEach(visit)
  return Array.from(result.values())
}

function evaluateCalculatedFormula(formula, scope) {
  const source = String(formula || '').trim()
  if (!source) return 0
  if (!/^[A-Za-z0-9_+\-*/().\s]+$/.test(source)) return 0
  try {
    const argNames = Object.keys(scope)
    const fn = new Function(...argNames, `return (${source})`)
    const value = fn(...argNames.map(name => scope[name] ?? 0))
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function applyCalculatedMeasuresToResult(result, valueFields, measureCatalog) {
  const calculatedFields = (valueFields || []).filter(field => field.isCalculated)
  if (!calculatedFields.length) return result

  const orderedCalculated = (measureCatalog || []).filter(field =>
    field.isCalculated && calculatedFields.some(selected => selected.id === field.id),
  )

  function applyToCell(cell) {
    const scope = {}
    ;(measureCatalog || []).forEach(field => {
      if (cell[field.id] == null) return
      scope[field.id] = cell[field.id]
      const token = getMeasureToken(field)
      if (token) scope[token] = cell[field.id]
    })

    orderedCalculated.forEach(field => {
      const value = evaluateCalculatedFormula(field.formula, scope)
      cell[field.id] = value
      scope[field.id] = value
      const token = getMeasureToken(field)
      if (token) scope[token] = value
    })

    return cell
  }

  return {
    ...result,
    resultRows: result.resultRows.map(row => ({
      ...row,
      cells: Object.fromEntries(
        Object.entries(row.cells).map(([colKey, cell]) => [colKey, applyToCell({ ...cell })]),
      ),
    })),
    grandTotal: Object.fromEntries(
      Object.entries(result.grandTotal).map(([colKey, cell]) => [colKey, applyToCell({ ...cell })]),
    ),
  }
}

export default function ReportDesigner() {
  const today = todayIso()
  const initialRange = createDateRange('last30')

  const [sourceId, setSourceId] = useState('sales')
  const [rowFields, setRowFields] = useState([])
  const [colFields, setColFields] = useState([])
  const [valueFields, setValueFields] = useState([])
  const [dateFrom, setDateFrom] = useState(initialRange.dateFrom)
  const [dateTo, setDateTo] = useState(initialRange.dateTo)
  const [presetKey, setPresetKey] = useState('last30')
  const [selectedBranch, setSelectedBranch] = useState('')
  const [branches, setBranches] = useState([])
  const [loadingMode, setLoadingMode] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [rowCount, setRowCount] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [fieldSearch, setFieldSearch] = useState('')
  const [calculatedMeasures, setCalculatedMeasures] = useState(() => readCalculatedMeasures())
  const [savedTemplates, setSavedTemplates] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', description: '' })
  const [templateError, setTemplateError] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [exportingXlsx, setExportingXlsx] = useState(false)
  const [calcModalOpen, setCalcModalOpen] = useState(false)
  const [calcForm, setCalcForm] = useState({ name: '', formula: '', format: 'decimal' })
  const [calcError, setCalcError] = useState('')

  const dragRef = useRef(null)
  const requestRef = useRef(0)
  const source = SOURCES.find(item => item.id === sourceId)
  const { dims, measures: sourceMeasures } = SOURCE_FIELDS[sourceId]
  const measureCatalog = buildMeasureCatalogForSource(sourceId, calculatedMeasures)
  const sourceTemplates = savedTemplates.filter(item => item.sourceId === sourceId)

  useEffect(() => {
    writeCalculatedMeasures(calculatedMeasures)
  }, [calculatedMeasures])

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const { data, error: settingsError } = await db
          .from('settings')
          .select('value')
          .eq('key', 'company_tree')
          .single()
        if (settingsError) throw settingsError
        const resolved = getAllBranches(parseJsonValue(data?.value, []))
        if (!ignore) setBranches(resolved)
      } catch {
        if (!ignore) setBranches([])
      }
    })()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (selectedTemplateId && !savedTemplates.some(item => item.id === selectedTemplateId && item.sourceId === sourceId)) {
      setSelectedTemplateId('')
    }
  }, [sourceId, savedTemplates, selectedTemplateId])

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const { data, error: settingsError } = await db
          .from('settings')
          .select('value')
          .eq('key', REPORT_TEMPLATES_SETTINGS_KEY)
          .single()
        if (settingsError && settingsError.code !== 'PGRST116') throw settingsError
        if (!ignore) setSavedTemplates(normalizeReportTemplates(data?.value))
      } catch {
        if (!ignore) setSavedTemplates([])
      }
    })()
    return () => {
      ignore = true
    }
  }, [])

  // Kaynak değişince zone'ları sıfırla
  function changeSource(id) {
    setSourceId(id)
    setRowFields([])
    setColFields([])
    setValueFields([])
    setResult(null)
    setError('')
    setFieldSearch('')
  }

  function handleDragStart(field, fromZone) {
    dragRef.current = { field, fromZone }
  }

  function handleDrop(targetZone) {
    const { field, fromZone } = dragRef.current || {}
    if (!field) return
    dragRef.current = null

    if (fromZone === 'rows')   setRowFields(fs => fs.filter(f => f.id !== field.id))
    if (fromZone === 'cols')   setColFields(fs => fs.filter(f => f.id !== field.id))
    if (fromZone === 'values') setValueFields(fs => fs.filter(f => f.id !== field.id))

    if (targetZone === 'rows'   && field.kind === 'dimension') setRowFields(fs => fs.find(f=>f.id===field.id) ? fs : [...fs, field])
    if (targetZone === 'cols'   && field.kind === 'dimension') setColFields([field])
    if (targetZone === 'values' && field.kind === 'measure')   setValueFields(fs => fs.find(f=>f.id===field.id) ? fs : [...fs, field])
  }

  function quickAdd(field) {
    if (field.kind === 'dimension') setRowFields(fs => fs.find(f=>f.id===field.id) ? fs : [...fs, field])
    else setValueFields(fs => fs.find(f=>f.id===field.id) ? fs : [...fs, field])
  }

  function removeFromZone(zone, field) {
    if (zone === 'rows')   setRowFields(fs => fs.filter(f => f.id !== field.id))
    if (zone === 'cols')   setColFields(fs => fs.filter(f => f.id !== field.id))
    if (zone === 'values') setValueFields(fs => fs.filter(f => f.id !== field.id))
  }

  function removeCalculatedMeasure(field) {
    setCalculatedMeasures(items => items.filter(item => item.id !== field.id))
    setValueFields(fields => fields.filter(item => item.id !== field.id))
  }

  function handlePresetChange(nextPreset) {
    const range = createDateRange(nextPreset)
    setPresetKey(nextPreset)
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
  }

  async function runReport() {
    if (valueFields.length === 0) { setError('Değerler bölgesine en az bir ölçüm ekleyin.'); return }
    if (rowFields.length === 0 && !colFields[0]) { setError('En az bir satır boyutu ekleyin.'); return }
    setLoading(true); setError(''); setResult(null); setTruncated(false)

    try {
      const colField = colFields[0] || null
      const allDimFields = [...rowFields, ...(colField ? [colField] : [])]
      const PAGE_SIZE = 1000

      // Gerekli kolonları topla
      const needed = new Set()
      for (const f of allDimFields) if (f.col) needed.add(f.col)
      for (const f of valueFields)  if (f.col) needed.add(f.col)
      // Hesaplanan ölçümler için ekstra kolonlar — her zaman ekle, zarar vermez
      if (sourceId === 'sales') {
        needed.add('sale_id')
        needed.add('line_gross_after_discount')
        needed.add('line_net_after_discount')
        needed.add('line_cost_total')
      }
      if (valueFields.find(f => ['qty_in','qty_out'].includes(f.agg))) {
        needed.add('quantity'); needed.add('direction')
      }

      const dateCol = source.dateCol
      const accumulator = createPivotAccumulator(rowFields, colField, valueFields)
      let totalRows = 0
      let page = 0

      while (true) {
        const from = page * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        let query = db
          .from(source.table)
          .select([...needed].join(', '))
          .order(dateCol, { ascending: true })
          .range(from, to)

        if (source.id === 'financial') {
          query = query.gte(dateCol, dateFrom).lte(dateCol, dateTo)
        } else {
          query = query.gte(dateCol, `${dateFrom}T00:00:00`).lte(dateCol, `${dateTo}T23:59:59`)
        }
        if (source.id === 'inventory') query = query.eq('is_cancelled', false)

        const { data, error: qErr } = await query
        if (qErr) throw qErr

        const batch = data || []
        if (false && page === 0) {
          console.group('[ReportDesigner] Ham veri')
          console.log('İlk 3 satır:', batch.slice(0, 3))
          console.log('Seçilen kolonlar:', [...needed])
          console.log('Satır boyutları:', rowFields.map(f => f.col))
          console.log('Değer ölçümleri:', valueFields.map(f => ({ id: f.id, col: f.col, agg: f.agg })))
          if (batch.length > 0) {
            const sample = batch[0]
            console.log('Örnek satır anahtarları:', Object.keys(sample))
            rowFields.forEach(f => {
              console.log(`  ${f.id} (col=${f.col}) → örnek değer:`, sample[f.col])
            })
            valueFields.forEach(f => {
              console.log(`  ${f.id} (col=${f.col}) → örnek değer:`, sample[f.col])
            })
          }
          console.groupEnd()
        }

        batch.forEach(row => updatePivotAccumulator(accumulator, row))
        totalRows += batch.length

        if (batch.length < PAGE_SIZE) break
        page += 1
      }

      setRowCount(totalRows)
      setTruncated(false)
      setResult(finalizePivot(accumulator))
    } catch (e) {
      setError(e.message || 'Rapor çalıştırılamadı.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const hasFields = valueFields.length > 0 && (rowFields.length > 0 || !!colFields[0])
    if (!hasFields || dateFrom > dateTo) return
    const timer = setTimeout(() => { executeReport('preview') }, 300)
    return () => clearTimeout(timer)
  }, [sourceId, rowFields, colFields, valueFields, dateFrom, dateTo, selectedBranch, calculatedMeasures])

  async function executeReport(mode = 'full') {
    if (valueFields.length === 0 || (rowFields.length === 0 && !colFields[0])) {
      setResult(null)
      return
    }
    if (dateFrom > dateTo) {
      setError('Baslangic tarihi bitis tarihinden buyuk olamaz.')
      return
    }

    const requestId = ++requestRef.current
    setLoadingMode(mode)
    setError('')

    try {
      const colField = colFields[0] || null
      const allDimFields = [...rowFields, ...(colField ? [colField] : [])]
      const PAGE_SIZE = 1000
      const rawLimit = mode === 'preview' ? PREVIEW_RAW_LIMIT : Number.POSITIVE_INFINITY
      const requiredMeasureFields = collectRequiredMeasureFields(valueFields, measureCatalog)
      const needed = new Set()

      allDimFields.forEach(field => { if (field.col) needed.add(field.col) })
      requiredMeasureFields.forEach(field => { if (field.col) needed.add(field.col) })

      if (sourceId === 'sales') {
        needed.add('sale_id')
        needed.add('line_gross_after_discount')
        needed.add('line_net_after_discount')
        needed.add('line_cost_total')
      }
      if (requiredMeasureFields.find(field => ['qty_in', 'qty_out'].includes(field.agg))) {
        needed.add('quantity')
        needed.add('direction')
      }

      const dateCol = source.dateCol
      const accumulator = createPivotAccumulator(rowFields, colField, requiredMeasureFields)
      let totalRows = 0
      let page = 0

      while (totalRows < rawLimit) {
        const pageSize = Math.min(PAGE_SIZE, rawLimit - totalRows)
        const from = page * PAGE_SIZE
        const to = from + pageSize - 1

        let query = db
          .from(source.table)
          .select([...needed].join(', '))
          .order(dateCol, { ascending: true })
          .range(from, to)

        if (source.id === 'financial') query = query.gte(dateCol, dateFrom).lte(dateCol, dateTo)
        else query = query.gte(dateCol, `${dateFrom}T00:00:00`).lte(dateCol, `${dateTo}T23:59:59`)

        if (selectedBranch) query = query.eq('branch_name', selectedBranch)
        if (source.id === 'inventory') query = query.eq('is_cancelled', false)

        const { data, error: queryError } = await query
        if (queryError) throw queryError

        const batch = data || []
        batch.forEach(row => updatePivotAccumulator(accumulator, row))
        totalRows += batch.length

        if (batch.length < pageSize) break
        page += 1
      }

      let finalized = finalizePivot(accumulator)
      finalized = applyCalculatedMeasuresToResult(finalized, valueFields, measureCatalog)
      const totalGroupCount = finalized.resultRows.length

      if (mode === 'preview') {
        finalized = { ...finalized, resultRows: finalized.resultRows.slice(0, PREVIEW_GROUP_LIMIT) }
      }

      if (requestId !== requestRef.current) return

      setRowCount(totalRows)
      setTruncated(mode === 'preview')
      setResult({ ...finalized, mode, totalGroupCount })
    } catch (runError) {
      if (requestId !== requestRef.current) return
      setError(runError.message || 'Rapor calistirilamadi.')
    } finally {
      if (requestId === requestRef.current) setLoadingMode('')
    }
  }

  function openCalculatedModal() {
    setCalcForm({ name: '', formula: '', format: 'decimal' })
    setCalcError('')
    setCalcModalOpen(true)
  }

  function saveCalculatedMeasure() {
    const name = String(calcForm.name || '').trim()
    const formula = String(calcForm.formula || '').trim()
    const token = normalizeFormulaToken(name)
    const tokenMap = buildMeasureTokenMap(measureCatalog)

    if (!name) return setCalcError('Olcum adi gerekli.')
    if (!formula) return setCalcError('Formul gerekli.')
    if (!token) return setCalcError('Gecerli bir olcum adi girin.')
    if (measureCatalog.some(field => getMeasureToken(field) === token)) return setCalcError('Bu token zaten kullaniliyor.')

    const unknownTokens = getFormulaTokens(formula).filter(tokenName => !tokenMap.has(tokenName))
    if (unknownTokens.length > 0) return setCalcError(`Bilinmeyen token: ${unknownTokens.join(', ')}`)

    setCalculatedMeasures(items => ([...items, {
      id: `calc_${sourceId}_${Date.now()}`,
      sourceId,
      name,
      formula,
      fmt: calcForm.format,
      token,
    }]))
    setCalcModalOpen(false)
  }

  function openTemplateModal() {
    setTemplateForm({ name: '', description: '' })
    setTemplateError('')
    setTemplateModalOpen(true)
  }

  function buildTemplatePayload() {
    return {
      sourceId,
      presetKey,
      dateFrom,
      dateTo,
      selectedBranch,
      rowFieldIds: rowFields.map(field => field.id),
      colFieldIds: colFields.map(field => field.id),
      valueFieldIds: valueFields.map(field => field.id),
      calculatedMeasures: calculatedMeasures
        .filter(field => field.sourceId === sourceId)
        .map(field => ({
          id: field.id,
          sourceId: field.sourceId,
          name: field.name,
          formula: field.formula,
          fmt: field.fmt,
          token: field.token,
        })),
    }
  }

  async function saveTemplate() {
    const name = String(templateForm.name || '').trim()
    const description = String(templateForm.description || '').trim()

    if (!name) return setTemplateError('Sablon adi gerekli.')
    if (savedTemplates.some(item => item.sourceId === sourceId && item.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'))) {
      return setTemplateError('Ayni kaynak icin bu sablon adi zaten kullaniliyor.')
    }

    const nextTemplate = {
      id: `report_tpl_${Date.now()}`,
      name,
      description,
      sourceId,
      config: buildTemplatePayload(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const nextTemplates = [nextTemplate, ...savedTemplates]

    setTemplateSaving(true)
    setTemplateError('')
    try {
      const { error: saveError } = await db
        .from('settings')
        .upsert({
          key: REPORT_TEMPLATES_SETTINGS_KEY,
          value: nextTemplates,
        })
      if (saveError) throw saveError
      setSavedTemplates(nextTemplates)
      setSelectedTemplateId(nextTemplate.id)
      setTemplateModalOpen(false)
    } catch (saveError) {
      setTemplateError(saveError.message || 'Sablon kaydedilemedi.')
    } finally {
      setTemplateSaving(false)
    }
  }

  function applyTemplate(templateId) {
    const template = savedTemplates.find(item => item.id === templateId)
    if (!template) return

    const config = template.config || {}
    const nextSourceId = config.sourceId || 'sales'
    const sourceDefinition = SOURCE_FIELDS[nextSourceId]
    if (!sourceDefinition) return

    const incomingCalculatedMeasures = Array.isArray(config.calculatedMeasures)
      ? config.calculatedMeasures
          .filter(item => item && typeof item === 'object')
          .map(item => ({
            id: item.id || `calc_${nextSourceId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            sourceId: nextSourceId,
            name: item.name,
            formula: item.formula,
            fmt: item.fmt || 'decimal',
            token: item.token || normalizeFormulaToken(item.name),
          }))
      : []

    const mergedCalculatedMeasures = [
      ...calculatedMeasures.filter(item => item.sourceId !== nextSourceId),
      ...buildMeasureCatalogForSource(nextSourceId, incomingCalculatedMeasures)
        .filter(item => item.isCalculated)
        .map(item => ({
          id: item.id,
          sourceId: item.sourceId,
          name: item.name,
          formula: item.formula,
          fmt: item.fmt,
          token: item.token,
        })),
    ]
    const measureMap = new Map(buildMeasureCatalogForSource(nextSourceId, mergedCalculatedMeasures).map(field => [field.id, field]))
    const dimMap = new Map((sourceDefinition.dims || []).map(field => [field.id, field]))

    setCalculatedMeasures(previous => {
      const withoutSource = previous.filter(item => item.sourceId !== nextSourceId)
      return [
        ...withoutSource,
        ...incomingCalculatedMeasures,
      ]
    })
    setSourceId(nextSourceId)
    setPresetKey(config.presetKey || 'custom')
    setDateFrom(config.dateFrom || today)
    setDateTo(config.dateTo || today)
    setSelectedBranch(config.selectedBranch || '')
    setRowFields((config.rowFieldIds || []).map(id => dimMap.get(id)).filter(Boolean))
    setColFields((config.colFieldIds || []).map(id => dimMap.get(id)).filter(Boolean).slice(0, 1))
    setValueFields((config.valueFieldIds || []).map(id => measureMap.get(id)).filter(Boolean))
    setFieldSearch('')
    setError('')
    setResult(null)
    setSelectedTemplateId(template.id)
  }

  function exportResultAsXlsx() {
    if (!result || result.mode !== 'full') {
      setError('Excel exportu icin once tam veriyle "Raporu Calistir" kullanin.')
      return
    }

    try {
      setExportingXlsx(true)
      const dataset = buildExportDataset(result, rowFields, valueFields)
      const aoa = [
        dataset.columns.map(column => column.header),
        ...dataset.rows,
      ]
      const worksheet = XLSX.utils.aoa_to_sheet(aoa)

      dataset.columns.forEach((column, index) => {
        const columnLetter = XLSX.utils.encode_col(index)
        for (let rowIndex = 1; rowIndex < aoa.length; rowIndex += 1) {
          const cellRef = `${columnLetter}${rowIndex + 1}`
          const cell = worksheet[cellRef]
          if (!cell) continue
          if (column.kind === 'measure') {
            cell.t = 'n'
            cell.z = excelNumberFormat(column.fmt)
          }
        }
      })

      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({
          s: { c: 0, r: 0 },
          e: { c: Math.max(dataset.columns.length - 1, 0), r: Math.max(aoa.length - 1, 0) },
        }),
      }
      worksheet['!cols'] = dataset.columns.map(column => ({
        wch: Math.min(Math.max(column.header.length + 4, column.kind === 'measure' ? 16 : 14), 28),
      }))

      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(source.label))

      const branchSuffix = selectedBranch ? `-${sanitizeFilePart(selectedBranch)}` : ''
      const fileName = `rapor-tasarimci-${sanitizeFilePart(sourceId)}${branchSuffix}-${dateFrom}-${dateTo}.xlsx`
      XLSX.writeFile(workbook, fileName)
    } catch (exportError) {
      setError(exportError.message || 'Excel dosyasi olusturulamadi.')
    } finally {
      setExportingXlsx(false)
    }
  }

  const availableFormulaTokens = measureCatalog.map(field => ({
    id: field.id,
    token: getMeasureToken(field),
    label: field.label,
    isCalculated: field.isCalculated,
  }))

  const usedIds = new Set([...rowFields, ...colFields, ...valueFields].map(f => f.id))
  const filteredDims = dims.filter(f =>
    !fieldSearch || f.label.toLocaleLowerCase('tr').includes(fieldSearch.toLocaleLowerCase('tr'))
  )
  const filteredMeasures = measureCatalog.filter(f =>
    !fieldSearch || f.label.toLocaleLowerCase('tr').includes(fieldSearch.toLocaleLowerCase('tr'))
  )
  const activeTemplate = sourceTemplates.find(item => item.id === selectedTemplateId) || null

  // ── Stiller ────────────────────────────────────────────────────────────
  const S = {
    page:   { background:'#f8fafc', minHeight:'100vh', color:'#0f172a' },
    body:   { padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 },
    card:   { background:'#ffffff', borderRadius:14,
              border:'1px solid #e2e8f0', padding:14, boxShadow:'0 10px 30px rgba(15,23,42,.05)' },
    title:  { fontSize:'.67rem', fontWeight:800, color:'#64748b',
              letterSpacing:'.07em', textTransform:'uppercase', marginBottom:10,
              display:'flex', alignItems:'center', gap:6 },
    input:  { background:'#ffffff', border:'1px solid #cbd5e1',
              borderRadius:8, padding:'8px 10px', color:'#0f172a', fontSize:'.82rem', width:'100%', boxSizing:'border-box' },
    runBtn: { background:'linear-gradient(135deg,#6366f1,#8b5cf6)', border:'none',
              borderRadius:10, padding:'10px 20px', color:'#fff', fontWeight:800,
              fontSize:'.84rem', cursor:'pointer', display:'flex', alignItems:'center',
              gap:8, justifyContent:'center', minWidth:170 },
  }

  return (
    <div style={S.page}>
      <Header title="Rapor Tasarımcısı" />
      <div style={S.body}>

        {/* Kaynak seçimi */}
        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          {SOURCES.map(s => (
            <button key={s.id} onClick={() => changeSource(s.id)} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'8px 18px', borderRadius:10, cursor:'pointer', fontWeight:700,
              fontSize:'.82rem', border:'none', transition:'all .15s',
              background: sourceId===s.id
                ? `linear-gradient(135deg,${s.color}18,#ffffff)`
                : '#ffffff',
              color: sourceId===s.id ? s.color : '#64748b',
              boxShadow: sourceId===s.id ? `0 0 0 1.5px ${s.color}55` : '0 0 0 1px #e2e8f0',
            }}>
              <i className={`fa-solid ${s.icon}`} style={{fontSize:'.82rem'}}/>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{...S.card, display:'flex', flexWrap:'wrap', gap:12, alignItems:'end'}}>
          <div style={{minWidth:170, flex:'0 0 170px'}}>
            <label style={{display:'block', marginBottom:6, fontSize:'.72rem', fontWeight:700, color:'#475569'}}>
              Hazir Filtre
            </label>
            <select value={presetKey} onChange={e => handlePresetChange(e.target.value)} style={S.input}>
              {PRESET_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div style={{minWidth:230, flex:'1 1 230px'}}>
            <label style={{display:'block', marginBottom:6, fontSize:'.72rem', fontWeight:700, color:'#475569'}}>
              Sube
            </label>
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={S.input}>
              <option value="">Tum Subeler</option>
              {branches.map(branch => (
                <option key={branch.id || branch.name} value={branch.name}>{branch.name}</option>
              ))}
            </select>
          </div>

          <div style={{minWidth:250, flex:'1 1 250px'}}>
            <label style={{display:'block', marginBottom:6, fontSize:'.72rem', fontWeight:700, color:'#475569'}}>
              Hazir Sablon
            </label>
            <select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)} style={S.input}>
              <option value="">Sablon secin</option>
              {sourceTemplates.map(template => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
          </div>

          <div style={{minWidth:170, flex:'0 0 170px'}}>
            <label style={{display:'block', marginBottom:6, fontSize:'.72rem', fontWeight:700, color:'#475569'}}>
              Baslangic
            </label>
            <input type="date" value={dateFrom} onChange={e => { setPresetKey('custom'); setDateFrom(e.target.value) }} style={S.input}/>
          </div>

          <div style={{minWidth:170, flex:'0 0 170px'}}>
            <label style={{display:'block', marginBottom:6, fontSize:'.72rem', fontWeight:700, color:'#475569'}}>
              Bitis
            </label>
            <input type="date" value={dateTo} onChange={e => { setPresetKey('custom'); setDateTo(e.target.value) }} style={S.input}/>
          </div>

          <button
            type="button"
            onClick={() => applyTemplate(selectedTemplateId)}
            disabled={!activeTemplate}
            style={{
              ...S.runBtn,
              minWidth:150,
              background: activeTemplate ? '#e0e7ff' : '#f1f5f9',
              color: activeTemplate ? '#1d4ed8' : '#94a3b8',
              border:'1px solid',
              borderColor: activeTemplate ? '#c7d2fe' : '#e2e8f0',
              opacity: activeTemplate ? 1 : .5,
            }}
          >
            <i className="fa-solid fa-layer-group"/>
            Sablonu Uygula
          </button>

          <button
            type="button"
            onClick={openTemplateModal}
            style={{
              ...S.runBtn,
              minWidth:150,
              background:'linear-gradient(135deg,#0ea5e9,#2563eb)',
            }}
          >
            <i className="fa-solid fa-bookmark"/>
            Sablon Kaydet
          </button>

          <button
            onClick={() => executeReport('full')}
            disabled={loadingMode === 'full'}
            style={{...S.runBtn, opacity: loadingMode === 'full' ? .7 : 1}}
          >
            {loadingMode === 'full'
              ? <><i className="fa-solid fa-spinner fa-spin"/>Tam veri aliniyor...</>
              : <><i className="fa-solid fa-play"/>Raporu Calistir</>
            }
          </button>

          <div style={{marginLeft:'auto', fontSize:'.72rem', color:'#64748b'}}>
            {loadingMode === 'preview'
              ? 'Onizleme guncelleniyor...'
              : rowCount > 0
                ? `${rowCount.toLocaleString('tr-TR')} ham satir islendi`
                : 'Alanlari tasidikca onizleme otomatik olusur'
            }
          </div>
        </div>

        {/* Ana grid */}
        <div style={{display:'grid', gridTemplateColumns:'210px minmax(0,1fr)', gap:12, alignItems:'start'}}>

          {/* Alan kataloğu */}
          <div style={{...S.card, maxHeight:'calc(100vh - 200px)', overflowY:'auto'}}>
            <div style={S.title}><i className="fa-solid fa-list-ul"/>Alanlar</div>

            <input
              placeholder={FIELD_SEARCH_PLACEHOLDER}
              value={fieldSearch}
              onChange={e => setFieldSearch(e.target.value)}
              style={{...S.input, marginBottom:10, fontSize:'.74rem', padding:'5px 8px'}}
            />

            {/* Boyutlar */}
            {filteredDims.length > 0 && (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:'.65rem', fontWeight:800, color:'rgba(96,165,250,.7)',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6}}>
                  Boyutlar ({filteredDims.length})
                </div>
                {filteredDims.map(f => (
                  <div
                    key={f.id} draggable
                    onDragStart={() => handleDragStart(f, 'catalog')}
                    onDoubleClick={() => quickAdd(f)}
                    title="Çift tıkla veya sürükle"
                    style={{
                      display:'flex', alignItems:'center', gap:6,
                      padding:'5px 8px', borderRadius:7, cursor:'grab',
                      marginBottom:3,
                      background: usedIds.has(f.id) ? '#dbeafe' : '#f8fafc',
                      border:`1px solid ${usedIds.has(f.id) ? '#93c5fd' : '#e2e8f0'}`,
                      color: usedIds.has(f.id) ? '#1d4ed8' : '#64748b',
                      fontSize:'.74rem', fontWeight:600, userSelect:'none',
                    }}
                  >
                    <i className="fa-solid fa-tag" style={{fontSize:'.58rem', opacity:.65}}/>
                    <span style={{flex:1}}>{f.label}</span>
                    {usedIds.has(f.id)
                      ? <i className="fa-solid fa-check" style={{fontSize:'.58rem', opacity:.8}}/>
                      : <i className="fa-solid fa-plus" style={{fontSize:'.58rem', opacity:.35}}/>
                    }
                  </div>
                ))}
              </div>
            )}

            {/* Ölçümler */}
            {filteredMeasures.length > 0 && (
              <div>
                <div style={{fontSize:'.65rem', fontWeight:800, color:'#059669',
                  textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6}}>
                  Ölçümler ({filteredMeasures.length})
                </div>
                {filteredMeasures.map(f => (
                  <div
                    key={f.id} draggable
                    onDragStart={() => handleDragStart(f, 'catalog')}
                    onDoubleClick={() => quickAdd(f)}
                    title="Çift tıkla veya sürükle"
                    style={{
                      display:'flex', alignItems:'center', gap:6,
                      padding:'5px 8px', borderRadius:7, cursor:'grab',
                      marginBottom:3,
                      background: f.isCalculated
                        ? (usedIds.has(f.id) ? '#fef3c7' : '#fffbeb')
                        : (usedIds.has(f.id) ? '#dcfce7' : '#f8fafc'),
                      border:`1px solid ${f.isCalculated
                        ? (usedIds.has(f.id) ? '#f59e0b' : '#fcd34d')
                        : (usedIds.has(f.id) ? '#86efac' : '#e2e8f0')}`,
                      color: f.isCalculated ? '#b45309' : (usedIds.has(f.id) ? '#15803d' : '#64748b'),
                      fontSize:'.74rem', fontWeight:600, userSelect:'none',
                    }}
                  >
                    <i className={`fa-solid ${f.isCalculated ? 'fa-sparkles' : 'fa-hashtag'}`} style={{fontSize:'.58rem', opacity:.8}}/>
                    <span style={{flex:1}}>{f.label}</span>
                    {f.isCalculated && (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); removeCalculatedMeasure(f) }}
                        style={{border:'none', background:'transparent', color:'inherit', cursor:'pointer', padding:0, opacity:.8}}
                        title="Hesaplanmış ölçümü sil"
                      >
                        <i className="fa-solid fa-trash" style={{fontSize:'.58rem'}}/>
                      </button>
                    )}
                    {usedIds.has(f.id)
                      ? <i className="fa-solid fa-check" style={{fontSize:'.58rem', opacity:.8}}/>
                      : <i className="fa-solid fa-plus" style={{fontSize:'.58rem', opacity:.35}}/>
                    }
                  </div>
                ))}
                <button
                  type="button"
                  onClick={openCalculatedModal}
                  style={{
                    width:'100%',
                    marginTop:8,
                    padding:'8px 10px',
                    borderRadius:8,
                    border:'1px dashed rgba(251,191,36,.4)',
                    background:'rgba(251,191,36,.08)',
                    color:'#b45309',
                    fontSize:'.76rem',
                    fontWeight:800,
                    cursor:'pointer',
                  }}
                >
                  <i className="fa-solid fa-sparkles" style={{marginRight:6}}/>
                  Hesaplanmış Ekle
                </button>
              </div>
            )}

            {filteredDims.length === 0 && filteredMeasures.length === 0 && (
              <div style={{color:'#94a3b8', fontSize:'.75rem', textAlign:'center', padding:'16px 0'}}>
                Sonuç yok
              </div>
            )}

            <div style={{marginTop:10, fontSize:'.65rem', color:'#94a3b8', lineHeight:1.5}}>
              Sürükle veya çift tıkla ile ekle
            </div>
          </div>

          {/* Drop zone'lar */}
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <div style={{display:'flex', gap:8}}>
              <DropZone id="rows"   icon="fa-bars"         label="Satırlar"  badge="boyut"
                fields={rowFields}   onDrop={handleDrop} onRemove={f=>removeFromZone('rows',f)}   onDragStart={handleDragStart}/>
              <DropZone id="cols"   icon="fa-table-columns" label="Sütunlar" badge="max 1 boyut"
                fields={colFields}   onDrop={handleDrop} onRemove={f=>removeFromZone('cols',f)}   onDragStart={handleDragStart}/>
            </div>
            <DropZone   id="values" icon="fa-sigma"        label="Değerler"  badge="ölçüm"
              fields={valueFields} onDrop={handleDrop} onRemove={f=>removeFromZone('values',f)} onDragStart={handleDragStart}/>
            <div style={{fontSize:'.67rem', color:'#64748b', paddingLeft:2, display:'flex', gap:6, alignItems:'flex-start'}}>
              <i className="fa-solid fa-circle-info" style={{marginTop:1, flexShrink:0}}/>
              Boyutlar satır / sütun bölgelerine, ölçümler değerler bölgesine sürüklenebilir. Sütunlar bölgesi pivot kırılım yapar.
            </div>
            <div style={{...S.card, minHeight:'calc(100vh - 290px)', display:'flex', flexDirection:'column'}}>
              <div style={{...S.title, marginBottom:12}}>
                <i className="fa-solid fa-table"/>
                Sonuçlar
                <span style={{marginLeft:'auto', fontSize:'.68rem', color:'#94a3b8'}}>
                  {(result?.totalGroupCount ?? result?.resultRows?.length ?? 0).toLocaleString('tr-TR')} grup · {dateFrom} → {dateTo}
                </span>
              </div>

              <div style={{display:'flex', justifyContent:'flex-end', marginBottom:12}}>
                <button
                  type="button"
                  onClick={exportResultAsXlsx}
                  disabled={!result || result.mode !== 'full' || exportingXlsx}
                  title={!result || result.mode !== 'full' ? 'Excel exportu icin once tam veriyle Raporu Calistir kullanin.' : 'Mevcut sonucu Excel olarak indir'}
                  style={{
                    padding:'9px 14px',
                    borderRadius:10,
                    border:'1px solid',
                    borderColor: !result || result.mode !== 'full' || exportingXlsx ? '#cbd5e1' : '#86efac',
                    background: !result || result.mode !== 'full' || exportingXlsx ? '#f8fafc' : '#f0fdf4',
                    color: !result || result.mode !== 'full' || exportingXlsx ? '#94a3b8' : '#166534',
                    fontWeight:800,
                    fontSize:'.8rem',
                    cursor: !result || result.mode !== 'full' || exportingXlsx ? 'not-allowed' : 'pointer',
                    display:'flex',
                    alignItems:'center',
                    gap:8,
                  }}
                >
                  <i className={`fa-solid ${exportingXlsx ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}/>
                  {exportingXlsx ? 'Hazirlaniyor...' : "Excel'e Aktar"}
                </button>
              </div>

              {error && (
                <div style={{background:'#fef2f2', border:'1px solid #fecaca',
                  borderRadius:10, padding:'10px 14px', color:'#fca5a5', fontSize:'.81rem',
                  display:'flex', gap:8, alignItems:'flex-start', marginBottom:12}}>
                  <i className="fa-solid fa-triangle-exclamation" style={{marginTop:1}}/>
                  {error}
                </div>
              )}

              {result?.mode === 'preview' && !error && (
                <div style={{background:'#eff6ff', border:'1px solid #bfdbfe',
                  borderRadius:10, padding:'8px 14px', color:'#1d4ed8', fontSize:'.78rem',
                  display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
                  <i className="fa-solid fa-wand-magic-sparkles"/>
                  Önizleme modu aktif. İlk {PREVIEW_GROUP_LIMIT} grup gösteriliyor. Tam veri için "Raporu Çalıştır" kullan.
                </div>
              )}

              {result ? (
                <PivotTable result={result} rowFields={rowFields} valueFields={valueFields}/>
              ) : (
                <div style={{flex:1, display:'grid', placeItems:'center', textAlign:'center', color:'#64748b', padding:'44px 24px'}}>
                  <div>
                    <i className={`fa-solid ${source.icon}`} style={{fontSize:'2.2rem', color:`${source.color}55`, marginBottom:12, display:'block'}}/>
                    <div style={{fontSize:'.86rem', lineHeight:1.6}}>
                      <strong style={{color:`${source.color}99`}}>{source.label}</strong> kaynağından alanları bölgelere ekleyin.
                      <br/>
                      Taşıdıkça önizleme otomatik oluşur, tam veri için "Raporu Çalıştır" kullanılır.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <Modal
          open={templateModalOpen}
          onClose={() => setTemplateModalOpen(false)}
          title="Rapor Sablonu Kaydet"
          subtitle="Bu tasarimi baska kullanicilarin da sonradan uygulayabilecegi ortak bir sablon olarak saklayin."
          width={620}
          footer={(
            <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
              <button
                type="button"
                onClick={() => setTemplateModalOpen(false)}
                style={{padding:'10px 14px', borderRadius:10, border:'1px solid rgba(15,23,42,.1)', background:'#fff', color:'#334155', fontWeight:700, cursor:'pointer'}}
              >
                Vazgec
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                disabled={templateSaving}
                style={{padding:'10px 14px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#0ea5e9,#2563eb)', color:'#fff', fontWeight:800, cursor:'pointer', opacity: templateSaving ? .7 : 1}}
              >
                {templateSaving ? 'Kaydediliyor...' : 'Sablonu Kaydet'}
              </button>
            </div>
          )}
        >
          <div style={{display:'grid', gap:14}}>
            <div>
              <label style={{display:'block', marginBottom:6, fontSize:'.8rem', fontWeight:700, color:'#475569'}}>Sablon Adi</label>
              <input
                value={templateForm.name}
                onChange={e => setTemplateForm(form => ({ ...form, name: e.target.value }))}
                placeholder="Ornek: Aylik Satis Ozet"
                style={{...S.input, color:'#0f172a', background:'#fff', border:'1px solid rgba(148,163,184,.35)'}}
              />
            </div>

            <div>
              <label style={{display:'block', marginBottom:6, fontSize:'.8rem', fontWeight:700, color:'#475569'}}>Aciklama</label>
              <textarea
                value={templateForm.description}
                onChange={e => setTemplateForm(form => ({ ...form, description: e.target.value }))}
                placeholder="Bu sablonun ne icin kullanildigini yazin."
                style={{...S.input, minHeight:96, resize:'vertical', color:'#0f172a', background:'#fff', border:'1px solid rgba(148,163,184,.35)'}}
              />
            </div>

            <div style={{background:'rgba(15,23,42,.04)', border:'1px solid rgba(148,163,184,.2)', borderRadius:12, padding:'12px 14px', color:'#475569', fontSize:'.75rem', lineHeight:1.7}}>
              Kayit icine secili kaynak, alan yerlesimi, tarih araligi, sube filtresi ve bu kaynakta kullandigin hesaplanmis olcumler dahil edilir.
            </div>

            {templateError && (
              <div style={{background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.18)', borderRadius:10, padding:'10px 12px', color:'#b91c1c', fontSize:'.78rem'}}>
                {templateError}
              </div>
            )}
          </div>
        </Modal>

        <Modal
          open={calcModalOpen}
          onClose={() => setCalcModalOpen(false)}
          title="Hesaplanmış Ölçüm"
          subtitle="Mevcut ölçümlerden formül ile sanal ölçüm tanımlayın."
          width={640}
          footer={(
            <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
              <button
                type="button"
                onClick={() => setCalcModalOpen(false)}
                style={{padding:'10px 14px', borderRadius:10, border:'1px solid rgba(15,23,42,.1)', background:'#fff', color:'#334155', fontWeight:700, cursor:'pointer'}}
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={saveCalculatedMeasure}
                style={{padding:'10px 14px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#f59e0b,#f97316)', color:'#fff', fontWeight:800, cursor:'pointer'}}
              >
                Ölçümü Ekle
              </button>
            </div>
          )}
        >
          <div style={{display:'grid', gap:14}}>
            <div>
              <label style={{display:'block', marginBottom:6, fontSize:'.8rem', fontWeight:700, color:'#475569'}}>İsim</label>
              <input
                value={calcForm.name}
                onChange={e => setCalcForm(form => ({ ...form, name: e.target.value }))}
                placeholder="Örnek: İndirim Oranı"
                style={{...S.input, color:'#0f172a', background:'#fff', border:'1px solid rgba(148,163,184,.35)'}}
              />
            </div>

            <div>
              <label style={{display:'block', marginBottom:6, fontSize:'.8rem', fontWeight:700, color:'#475569'}}>Formül</label>
              <input
                value={calcForm.formula}
                onChange={e => setCalcForm(form => ({ ...form, formula: e.target.value }))}
                placeholder="Örnek: indirim_tutari / indirim_oncesi_tutar"
                style={{...S.input, color:'#0f172a', background:'#fff', border:'1px solid rgba(148,163,184,.35)'}}
              />
              <div style={{marginTop:8, fontSize:'.73rem', color:'#64748b', lineHeight:1.6}}>
                Tokenlar: {availableFormulaTokens.map(item => item.token).join(', ')}
              </div>
            </div>

            <div>
              <label style={{display:'block', marginBottom:6, fontSize:'.8rem', fontWeight:700, color:'#475569'}}>Format</label>
              <select
                value={calcForm.format}
                onChange={e => setCalcForm(form => ({ ...form, format: e.target.value }))}
                style={{...S.input, color:'#0f172a', background:'#fff', border:'1px solid rgba(148,163,184,.35)'}}
              >
                <option value="decimal">Sayı</option>
                <option value="currency">Para</option>
                <option value="percent">Yüzde</option>
              </select>
            </div>

            <div style={{background:'rgba(15,23,42,.04)', border:'1px solid rgba(148,163,184,.2)', borderRadius:12, padding:'12px 14px'}}>
              <div style={{fontSize:'.77rem', fontWeight:800, color:'#334155', marginBottom:8}}>Örnekler</div>
              <div style={{fontSize:'.74rem', color:'#64748b', lineHeight:1.7}}>
                indirim_tutari / indirim_oncesi_tutar
                <br/>
                adet * indirim_tutari
                <br/>
                adet * 5
              </div>
            </div>

            {calcError && (
              <div style={{background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.18)', borderRadius:10, padding:'10px 12px', color:'#b91c1c', fontSize:'.78rem'}}>
                {calcError}
              </div>
            )}
          </div>
        </Modal>

      </div>
    </div>
  )
}
