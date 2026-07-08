import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import {
  applyBranchFilter,
  asUuidOrNull,
  buildBalanceMap,
  buildInventoryBalanceRows,
  parseJsonValue,
} from '@/lib/branchPurchasing'
import {
  COUNT_FLOWS_TABLE,
  countFlowFromRow,
  mergeCountFlowLists,
  readCountFlows,
} from '@/lib/countFlowConfig'
import {
  buildCountFlowProductItems,
  describeCountSchedule,
  describeCountScope,
  resolveFlowBranchIds,
  sortCountFlows,
} from '@/lib/countFlowUtils'

const COUNT_ENTRY_STORAGE_KEY = 'suitable_count_entries_v2'
const TAB_STOCK = 'stock'
const TAB_SEMI = 'semi'

function readEntries() {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(COUNT_ENTRY_STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeEntries(entries) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COUNT_ENTRY_STORAGE_KEY, JSON.stringify(entries))
  }
}

function todayText() {
  return new Date().toISOString().slice(0, 10)
}

function entryKey(flowId, branchId, date) {
  return `${flowId}__${branchId}__${date}`
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundQty(value) {
  return Number(toNumber(value).toFixed(4))
}

function formatQty(value) {
  return toNumber(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getPackagingConfig(item) {
  const firstPackaging = parseJsonValue(item?.packaging_units, []).find(unit => toNumber(unit?.qty) > 0 && String(unit?.unit || '').trim())
  return {
    label: String(firstPackaging?.unit || ''),
    factor: toNumber(firstPackaging?.qty),
  }
}

function getStockLineTotal(line, packagingFactor) {
  const packageQty = toNumber(line?.packageQty)
  const unitQty = toNumber(line?.unitQty ?? line?.countedQty)
  if (packagingFactor > 0) return roundQty((packageQty * packagingFactor) + unitQty)
  return roundQty(unitQty)
}

function findStockLine(lines, stockItemId) {
  return (lines || []).find(line => line.stockItemId === stockItemId) || null
}

function findSemiLine(lines, semiItemId) {
  return (lines || []).find(line => line.semiItemId === semiItemId) || null
}

function buildSemiDerivedMap(semiLines, semiItems) {
  const result = new Map()
  const semiById = new Map((semiItems || []).map(item => [String(item.id), item]))

  function addStockContribution(stockItemId, qty) {
    if (!stockItemId || qty <= 0) return
    result.set(String(stockItemId), roundQty((result.get(String(stockItemId)) || 0) + qty))
  }

  function walkSemi(semiId, producedQty, ancestry = new Set()) {
    const key = String(semiId || '')
    const semi = semiById.get(key)
    if (!semi || ancestry.has(key) || producedQty <= 0) return

    const nextAncestry = new Set(ancestry)
    nextAncestry.add(key)

    const outputQty = Math.max(toNumber(semi.recipe_output_qty), 1)
    const multiplier = producedQty / outputQty

    for (const row of parseJsonValue(semi.recipe_rows, [])) {
      const ingredientId = String(row?.stock_item_id || '')
      const usedQty = (toNumber(row?.qty) * (1 + (toNumber(row?.waste_pct) / 100))) * multiplier
      if (!ingredientId || usedQty <= 0) continue

      if (semiById.has(ingredientId)) {
        walkSemi(ingredientId, usedQty, nextAncestry)
      } else {
        addStockContribution(ingredientId, usedQty)
      }
    }
  }

  for (const line of semiLines || []) {
    const countedQty = toNumber(line?.countedQty)
    if (countedQty <= 0) continue
    walkSemi(line.semiItemId, countedQty)
  }

  return result
}

function buildPrintableHtml({ flow, branchName, selectedDate, semiItems, semiLines, stockRows }) {
  const createdAt = new Date().toLocaleString('tr-TR')

  const semiRowsHtml = semiItems.length === 0
    ? '<tr><td colspan="4">Takipli yarimamul bulunmuyor.</td></tr>'
    : semiItems.map(item => {
        const line = findSemiLine(semiLines, item.id)
        return `
          <tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${escapeHtml(item.sku || '-')}</td>
            <td>${escapeHtml(item.recipe_output_unit || '-')}</td>
            <td>${escapeHtml(line?.countedQty || '')}</td>
          </tr>
        `
      }).join('')

  const stockRowsHtml = stockRows.length === 0
    ? '<tr><td colspan="8">Listelenecek stok urunu bulunmuyor.</td></tr>'
    : stockRows.map(row => `
        <tr>
          <td>${escapeHtml(row.item.name)}</td>
          <td>${escapeHtml(row.item.sku || '-')}</td>
          <td>${escapeHtml(row.currentBalanceText)}</td>
          <td>${escapeHtml(row.packagingLabel || '-')}</td>
          <td>${escapeHtml(row.packageQty || '')}</td>
          <td>${escapeHtml(row.unitQty || '')}</td>
          <td>${escapeHtml(row.derivedQtyText)}</td>
          <td>${escapeHtml(row.effectiveQtyText)}</td>
        </tr>
      `).join('')

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>Sayim Formu</title><style>@page { size: A4 portrait; margin: 14mm; } body { font-family: Arial, sans-serif; color: #0f172a; margin: 0; } .page { page-break-after: always; } .page:last-child { page-break-after: auto; } h1 { margin: 0 0 6px; font-size: 20px; } h2 { margin: 0 0 10px; font-size: 16px; } .meta { display: grid; gap: 4px; margin-bottom: 14px; font-size: 12px; color: #475569; } table { width: 100%; border-collapse: collapse; font-size: 12px; } th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; } th { background: #f8fafc; font-weight: 700; } .caption { margin: 0 0 10px; font-size: 12px; color: #475569; }</style></head><body><section class="page"><h1>Sayim Formu</h1><div class="meta"><div><strong>Akis:</strong> ${escapeHtml(flow?.name || '-')}</div><div><strong>Sube:</strong> ${escapeHtml(branchName || '-')}</div><div><strong>Tarih:</strong> ${escapeHtml(selectedDate || '-')}</div><div><strong>Olusturma:</strong> ${escapeHtml(createdAt)}</div></div><h2>1. Sekme - Yari Mamul Sayimi</h2><div class="caption">Stok takibi aktif yarimamuller burada fiziksel sayim icin listelenir.</div><table><thead><tr><th>Yari Mamul</th><th>SKU</th><th>Birim</th><th>Sayilan Miktar</th></tr></thead><tbody>${semiRowsHtml}</tbody></table></section><section class="page"><h1>Sayim Formu</h1><div class="meta"><div><strong>Akis:</strong> ${escapeHtml(flow?.name || '-')}</div><div><strong>Sube:</strong> ${escapeHtml(branchName || '-')}</div><div><strong>Tarih:</strong> ${escapeHtml(selectedDate || '-')}</div></div><h2>2. Sekme - Ana Sayim Formu</h2><div class="caption">Yarimamul sayimindan hesaplanan miktar ayri kolonda sabit olarak gosterilir.</div><table><thead><tr><th>Urun</th><th>SKU</th><th>Son Stok</th><th>Paketleme</th><th>Paket</th><th>Ana Birim</th><th>Yarimamulden Gelen</th><th>Toplam Sayim</th></tr></thead><tbody>${stockRowsHtml}</tbody></table></section></body></html>`
}

export default function Count({ scopeVariant }) {
  const toast = useToast()
  const { branchId, branchName, scope } = useWorkspace()
  const isWmsMode = scopeVariant === 'anadepo' || scope === 'anadepo'

  const inputRefs = useRef({})
  const [flows, setFlows] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [stockTemplates, setStockTemplates] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [balances, setBalances] = useState(() => new Map())
  const [loading, setLoading] = useState(true)
  const [storageMode, setStorageMode] = useState('database')
  const [selectedDate, setSelectedDate] = useState(todayText())
  const [selectedFlowId, setSelectedFlowId] = useState('')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState(TAB_STOCK)
  const [movingFilterIds, setMovingFilterIds] = useState([])
  const [savingInventory, setSavingInventory] = useState(false)
  const [entries, setEntries] = useState(() => readEntries())
  const [stockTableFilters, setStockTableFilters] = useState({ name: '', sku: '' })
  const [stockTableSort, setStockTableSort] = useState({ key: 'name', direction: 'asc' })
  const [showBalanceColumns, setShowBalanceColumns] = useState(false)

  // WMS state
  const [locations, setLocations] = useState([])
  const [lpns, setLpns] = useState([])

  // WMS shelf modal state
  const [addShelfModal, setAddShelfModal] = useState(false)
  const [addShelfItem, setAddShelfItem] = useState(null)
  const [addShelfLocation, setAddShelfLocation] = useState('')
  const [addShelfLpn, setAddShelfLpn] = useState('')
  const [addShelfLot, setAddShelfLot] = useState('')
  const [addShelfExpiration, setAddShelfExpiration] = useState('')

  const refreshBalances = useCallback(async () => {
    if (!branchId) {
      setBalances(new Map())
      return
    }

    if (isWmsMode) {
      const { data, error } = await db
        .from('inventory_movements')
        .select('stock_item_id, quantity, direction, location_id, lpn_id, lot_number, expiration_date, avg_unit_cost_after, unit_cost, movement_at, ledger_seq, meta')
        .eq('branch_id', branchId)
        .eq('item_type', 'stock_item')
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .order('ledger_seq', { ascending: false })

      if (error) {
        toast(`Son stok durumu okunamadi: ${error.message}`, 'info')
        return
      }

      // 1. Calculate latest average cost for each item
      const costMap = new Map()
      for (const m of data || []) {
        const itemId = String(m.stock_item_id)
        if (!costMap.has(itemId)) {
          costMap.set(itemId, {
            avg_unit_cost_after: Number(m.avg_unit_cost_after || 0),
            unit_cost: Number(m.unit_cost || 0),
          })
        }
      }

      // 2. Aggregate location balances
      const wmsBalancesMap = new Map()
      const keyMap = new Map()

      for (const m of data || []) {
        const itemId = String(m.stock_item_id)
        const qty = Number(m.quantity || 0)
        const signed = m.direction === 'in' ? qty : -qty

        const meta = typeof m.meta === 'string' ? parseJsonValue(m.meta, {}) : (m.meta || {})
        const status = meta.availability_status || 'available'
        if (status === 'quarantine' || status === 'putaway_pending') continue

        const loc = m.location_id || ''
        const lpn = m.lpn_id || ''
        const lot = m.lot_number || ''
        const exp = m.expiration_date || ''

        const comboKey = `${itemId}__${loc}__${lpn}__${lot}__${exp}`
        if (!keyMap.has(comboKey)) {
          const newRow = {
            stock_item_id: itemId,
            location_id: loc || null,
            lpn_id: lpn || null,
            lot_number: lot || null,
            expiration_date: exp || null,
            qty: 0,
          }
          keyMap.set(comboKey, newRow)
          if (!wmsBalancesMap.has(itemId)) {
            wmsBalancesMap.set(itemId, [])
          }
          wmsBalancesMap.get(itemId).push(newRow)
        }
        keyMap.get(comboKey).qty += signed
      }

      // Filter balances to keep only positive/non-zero balances, and attach costs
      const finalWmsBalances = new Map()
      for (const [itemId, rows] of wmsBalancesMap.entries()) {
        const costs = costMap.get(itemId) || { avg_unit_cost_after: 0, unit_cost: 0 }
        const activeRows = rows
          .map(r => ({
            ...r,
            qty: roundQty(r.qty),
            avg_unit_cost_after: costs.avg_unit_cost_after,
            unit_cost: costs.unit_cost,
          }))
          .filter(r => Math.abs(r.qty) > 0.0001)

        finalWmsBalances.set(itemId, activeRows)
      }

      const nextMap = new Map()
      nextMap.set('wms_balances', finalWmsBalances)
      nextMap.set('costs', costMap)
      setBalances(nextMap)
    } else {
      const query = applyBranchFilter(
        db
          .from('inventory_movements')
          .select('stock_item_id,branch_id,branch_name,balance_qty_after,balance_total_cost_after,avg_unit_cost_after,unit_cost,movement_at,ledger_seq')
          .eq('item_type', 'stock_item')
          .is('deleted_at', null)
          .eq('is_cancelled', false)
          .order('movement_at', { ascending: false })
          .order('ledger_seq', { ascending: false })
          .limit(5000),
        { id: branchId, name: branchName },
      )

      const { data, error } = await query
      if (error) {
        toast(`Son stok durumu okunamadi: ${error.message}`, 'info')
        return
      }

      const nextMap = buildBalanceMap(buildInventoryBalanceRows(data || []))
      setBalances(nextMap)
    }
  }, [branchId, branchName, isWmsMode, toast])

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      const localFlows = readCountFlows().filter(flow => flow.active && !flow.deletedAt)
      const [flowsResult, stockItemsResult, stockTemplatesResult, semiItemsResult] = await Promise.all([
        db.from(COUNT_FLOWS_TABLE).select('*').is('deleted_at', null).eq('active', true).order('updated_at', { ascending: false }),
        db.from('stock_items').select('id,name,sku,unit,packaging_units,cat_l1,cat_l2,cat_l3,cat_l4,cat_l5').is('deleted_at', null).order('name'),
        db.from('stock_templates').select('id,name,stock_ids').is('deleted_at', null).order('name'),
        db.from('semi_items').select('id,name,sku,setting_active,recipe_rows,recipe_output_qty,recipe_output_unit').is('deleted_at', null).order('name'),
      ])

      if (ignore) return

      setStockItems(stockItemsResult.data || [])
      setStockTemplates(stockTemplatesResult.data || [])
      setSemiItems((semiItemsResult.data || []).filter(item => item.setting_active !== false))

      if (flowsResult.error) {
        setStorageMode('local')
        setFlows(sortCountFlows(localFlows))
      } else {
        const databaseFlows = (flowsResult.data || []).map(countFlowFromRow)
        setStorageMode('database')
        setFlows(sortCountFlows(mergeCountFlowLists(databaseFlows, localFlows)))
      }

      setLoading(false)
    }

    load()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    refreshBalances()
  }, [refreshBalances])

  useEffect(() => {
    writeEntries(entries)
  }, [entries])

  useEffect(() => {
    if (!isWmsMode || !branchId) {
      setLocations([])
      setLpns([])
      return
    }
    async function loadWmsData() {
      try {
        const [{ data: locData }, { data: lpnData }] = await Promise.all([
          db.from('warehouse_locations').select('*').eq('branch_id', branchId).eq('is_active', true).order('zone_code'),
          db.from('warehouse_lpns').select('*').eq('branch_id', branchId)
        ])
        setLocations(locData || [])
        setLpns(lpnData || [])
      } catch (e) {
        toast('WMS verileri yuklenemedi: ' + e.message, 'error')
      }
    }
    loadWmsData()
  }, [isWmsMode, branchId, toast])

  const branchFlows = useMemo(() => (
    flows.filter(flow => {
      if (!branchId) return false
      const branchIds = resolveFlowBranchIds(flow, [])
      return flow.branches.allBranches || branchIds.includes(String(branchId))
    })
  ), [flows, branchId])

  useEffect(() => {
    if (selectedFlowId && branchFlows.some(flow => flow.id === selectedFlowId)) return
    setSelectedFlowId(branchFlows[0]?.id || '')
  }, [branchFlows, selectedFlowId])

  useEffect(() => {
    setMovingFilterIds([])
  }, [selectedFlowId, selectedDate])

  const selectedFlow = branchFlows.find(flow => flow.id === selectedFlowId) || null
  const baseProducts = useMemo(() => (
    selectedFlow ? buildCountFlowProductItems(selectedFlow, stockItems, stockTemplates) : []
  ), [selectedFlow, stockItems, stockTemplates])

  const currentEntryId = selectedFlow ? entryKey(selectedFlow.id, branchId, selectedDate) : ''
  const currentEntry = entries.find(entry => entry.id === currentEntryId) || {
    id: currentEntryId,
    lines: [],
    semiLines: [],
    status: 'draft',
    note: '',
    inventoryPostedAt: null,
    movementCount: 0,
  }

  useEffect(() => {
    if (!isWmsMode || !selectedFlow || !balances || balances.size === 0 || currentEntry.lines.length > 0 || currentEntry.inventoryPostedAt) return

    const wmsBalances = balances.get('wms_balances')
    if (!wmsBalances) return

    const newLines = []
    for (const item of baseProducts) {
      const activeRows = wmsBalances.get(String(item.id)) || []
      for (const row of activeRows) {
        newLines.push({
          stockItemId: item.id,
          stockItemName: item.name,
          sku: item.sku || '',
          unit: item.unit || '',
          packageQty: '',
          unitQty: '',
          countedQty: '',
          note: '',
          location_id: row.location_id,
          lpn_id: row.lpn_id,
          lot_number: row.lot_number,
          expiration_date: row.expiration_date,
        })
      }
    }
    if (newLines.length > 0) {
      updateEntry({ lines: newLines })
    }
  }, [isWmsMode, selectedFlow, balances, baseProducts, currentEntry.lines.length, currentEntry.inventoryPostedAt])

  const filteredBaseProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')
    let items = [...baseProducts]

    if (selectedFlow?.products.mode === 'moving' && movingFilterIds.length > 0) {
      const allowedIds = new Set(movingFilterIds)
      items = items.filter(item => allowedIds.has(item.id))
    }

    if (!normalizedSearch) return items
    return items.filter(item => (
      String(item.name || '').toLocaleLowerCase('tr-TR').includes(normalizedSearch) ||
      String(item.sku || '').toLocaleLowerCase('tr-TR').includes(normalizedSearch)
    ))
  }, [baseProducts, movingFilterIds, search, selectedFlow])


  const semiDerivedMap = useMemo(
    () => buildSemiDerivedMap(currentEntry.semiLines || [], semiItems),
    [currentEntry.semiLines, semiItems],
  )

  const stockRows = useMemo(() => {
    const normalizedNameFilter = stockTableFilters.name.trim().toLocaleLowerCase('tr-TR')
    const normalizedSkuFilter = stockTableFilters.sku.trim().toLocaleLowerCase('tr-TR')

    if (isWmsMode) {
      const wmsBalances = balances.get('wms_balances') || new Map()

      // We group/list by the lines in currentEntry.lines
      const rows = []
      
      // Keep track of which items have lines
      const itemsWithLines = new Set()

      for (let i = 0; i < (currentEntry.lines || []).length; i++) {
        const line = currentEntry.lines[i]
        const item = stockItems.find(si => si.id === line.stockItemId)
        if (!item) continue

        // Check if this item belongs to the selected flow
        const belongsToFlow = baseProducts.some(bp => bp.id === item.id)
        if (!belongsToFlow) continue

        itemsWithLines.add(item.id)

        const packaging = getPackagingConfig(item)
        const manualQty = getStockLineTotal(line, packaging.factor)
        const derivedQty = 0 // WMS has no semi-derived quantities inside specific shelves
        const effectiveQty = manualQty

        // Look up previous balance for this specific combo
        const itemBalances = wmsBalances.get(String(item.id)) || []
        const matchedBalance = itemBalances.find(b => 
          (b.location_id || '') === (line.location_id || '') &&
          (b.lpn_id || '') === (line.lpn_id || '') &&
          (b.lot_number || '') === (line.lot_number || '') &&
          (b.expiration_date || '') === (line.expiration_date || '')
        )
        const currentBalance = matchedBalance ? Number(matchedBalance.qty || 0) : 0

        rows.push({
          key: `${line.stockItemId}__${line.location_id || ''}__${line.lpn_id || ''}__${line.lot_number || ''}__${line.expiration_date || ''}__index_${i}`,
          lineIndex: i, // reference back to line in currentEntry.lines
          item,
          line,
          packaging,
          manualQty,
          derivedQty,
          effectiveQty,
          currentBalance,
          difference: roundQty(effectiveQty - currentBalance),
        })
      }

      // Add products in the flow that don't have any lines yet, so the user sees them and can add a shelf line
      for (const item of baseProducts) {
        if (!itemsWithLines.has(item.id)) {
          const packaging = getPackagingConfig(item)
          rows.push({
            key: `${item.id}__empty`,
            lineIndex: -1,
            item,
            line: null,
            packaging,
            manualQty: 0,
            derivedQty: 0,
            effectiveQty: 0,
            currentBalance: 0,
            difference: 0,
            isEmptyPlaceholder: true,
          })
        }
      }

      // Filter
      const filtered = rows.filter(row => {
        if (normalizedNameFilter && !String(row.item.name || '').toLocaleLowerCase('tr-TR').includes(normalizedNameFilter)) return false
        if (normalizedSkuFilter && !String(row.item.sku || '').toLocaleLowerCase('tr-TR').includes(normalizedSkuFilter)) return false
        return true
      })

      // Sort
      filtered.sort((left, right) => {
        const leftValue = stockTableSort.key === 'sku' ? String(left.item.sku || '') : String(left.item.name || '')
        const rightValue = stockTableSort.key === 'sku' ? String(right.item.sku || '') : String(right.item.name || '')
        const nameComp = leftValue.localeCompare(rightValue, 'tr')
        if (nameComp !== 0) return stockTableSort.direction === 'asc' ? nameComp : -nameComp

        // Secondary sort by location
        const leftLoc = left.line ? (left.line.location_id || '') : ''
        const rightLoc = right.line ? (right.line.location_id || '') : ''
        return leftLoc.localeCompare(rightLoc)
      })

      return filtered
    } else {
      const rows = filteredBaseProducts.map(item => {
        const line = findStockLine(currentEntry.lines, item.id)
        const packaging = getPackagingConfig(item)
        const manualQty = getStockLineTotal(line, packaging.factor)
        const derivedQty = roundQty(semiDerivedMap.get(String(item.id)) || 0)
        const effectiveQty = roundQty(manualQty + derivedQty)
        const currentBalance = roundQty(balances.get(String(item.id))?.balance_qty_after || 0)
        return {
          item,
          line,
          packaging,
          manualQty,
          derivedQty,
          effectiveQty,
          currentBalance,
          difference: roundQty(effectiveQty - currentBalance),
        }
      })
        .filter(row => {
          if (normalizedNameFilter && !String(row.item.name || '').toLocaleLowerCase('tr-TR').includes(normalizedNameFilter)) return false
          if (normalizedSkuFilter && !String(row.item.sku || '').toLocaleLowerCase('tr-TR').includes(normalizedSkuFilter)) return false
          return true
        })

      rows.sort((left, right) => {
        const leftValue = stockTableSort.key === 'sku' ? String(left.item.sku || '') : String(left.item.name || '')
        const rightValue = stockTableSort.key === 'sku' ? String(right.item.sku || '') : String(right.item.name || '')
        const result = leftValue.localeCompare(rightValue, 'tr')
        return stockTableSort.direction === 'asc' ? result : -result
      })

      return rows
    }
  }, [filteredBaseProducts, currentEntry.lines, semiDerivedMap, balances, stockTableFilters, stockTableSort, isWmsMode, stockItems, baseProducts])

  const enteredCount = stockRows.filter(row => row.manualQty > 0 || String(row.line?.note || '').trim()).length
  const currentEntryStatusLabel = currentEntry.inventoryPostedAt
    ? 'Envantere islendi'
    : (currentEntry.status === 'completed' ? 'Tamamlandi' : 'Taslak')

  function updateEntry(patch) {
    if (!selectedFlow) return
    const nextEntry = {
      ...currentEntry,
      id: currentEntryId,
      flowId: selectedFlow.id,
      flowName: selectedFlow.name,
      branchId,
      branchName,
      date: selectedDate,
      lines: currentEntry.lines || [],
      semiLines: currentEntry.semiLines || [],
      ...patch,
    }
    setEntries(prev => [...prev.filter(entry => entry.id !== currentEntryId), nextEntry])
  }

  function updateStockLine(item, patch) {
    const currentLine = findStockLine(currentEntry.lines, item.id)
    const packaging = getPackagingConfig(item)
    const nextLine = {
      stockItemId: item.id,
      stockItemName: item.name,
      sku: item.sku || '',
      unit: item.unit || '',
      packageQty: currentLine?.packageQty || '',
      unitQty: currentLine?.unitQty ?? currentLine?.countedQty ?? '',
      countedQty: currentLine?.countedQty ?? '',
      note: currentLine?.note || '',
      ...patch,
    }
    nextLine.countedQty = String(getStockLineTotal(nextLine, packaging.factor))

    updateEntry({
      lines: currentLine
        ? currentEntry.lines.map(line => line.stockItemId === item.id ? nextLine : line)
        : [...currentEntry.lines, nextLine],
    })
  }

  function updateSemiLine(item, patch) {
    const currentLine = findSemiLine(currentEntry.semiLines, item.id)
    const nextLine = {
      semiItemId: item.id,
      semiItemName: item.name,
      sku: item.sku || '',
      unit: item.recipe_output_unit || '',
      countedQty: currentLine?.countedQty || '',
      note: currentLine?.note || '',
      ...patch,
    }

    updateEntry({
      semiLines: currentLine
        ? currentEntry.semiLines.map(line => line.semiItemId === item.id ? nextLine : line)
        : [...currentEntry.semiLines, nextLine],
    })
  }

  function saveDraft() {
    updateEntry({ status: 'draft', savedAt: new Date().toISOString() })
    toast('Sayim girisleri taslak olarak kaydedildi.', 'success')
  }

  function markCompleted() {
    updateEntry({ status: 'completed', completedAt: new Date().toISOString() })
    toast('Sayim tamamlandi olarak isaretlendi.', 'success')
  }

  async function loadMovingItems() {
    if (!selectedFlow || selectedFlow.products.mode !== 'moving' || !branchId) return
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number(selectedFlow.products.movementDays || 30))

    const query = applyBranchFilter(
      db
        .from('inventory_movements')
        .select('stock_item_id,movement_at')
        .gte('movement_at', startDate.toISOString())
        .order('movement_at', { ascending: false })
        .limit(5000),
      { id: branchId, name: branchName },
    )

    const { data, error } = await query
    if (error) {
      toast('Hareket goren urunler okunamadi.', 'info')
      return
    }

    const allowedIds = [...new Set((data || []).map(row => row.stock_item_id).filter(Boolean))]
    setMovingFilterIds(allowedIds)
    toast('Hareket goren urunler filtreye uygulandi.', 'success')
  }

  function focusInput(rowIndex, cellKey) {
    requestAnimationFrame(() => {
      const target = inputRefs.current[`${rowIndex}:${cellKey}`]
      if (target) target.focus()
    })
  }

  function getEditableCellsForRow(row) {
    return row.packaging.factor > 0 ? ['packageQty', 'unitQty'] : ['unitQty']
  }

  function handleCellKeyDown(event, rowIndex, cellKey) {
    const row = stockRows[rowIndex]
    if (!row) return

    const rowCells = getEditableCellsForRow(row)
    const currentIndex = rowCells.indexOf(cellKey)
    if (currentIndex === -1) return

    function focusNextRow(direction, preferredCell) {
      for (let nextRowIndex = rowIndex + direction; nextRowIndex >= 0 && nextRowIndex < stockRows.length; nextRowIndex += direction) {
        const nextRowCells = getEditableCellsForRow(stockRows[nextRowIndex])
        if (nextRowCells.includes(preferredCell)) {
          focusInput(nextRowIndex, preferredCell)
          return true
        }
        if (nextRowCells.length > 0) {
          focusInput(nextRowIndex, nextRowCells[0])
          return true
        }
      }
      return false
    }

    if (event.key === 'Enter' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (currentIndex < rowCells.length - 1) {
        focusInput(rowIndex, rowCells[currentIndex + 1])
      } else {
        focusNextRow(1, 'packageQty')
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (currentIndex > 0) {
        focusInput(rowIndex, rowCells[currentIndex - 1])
      } else {
        focusNextRow(-1, 'unitQty')
      }
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      focusNextRow(1, cellKey)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      focusNextRow(-1, cellKey)
    }
  }

  function updateStockTableFilter(key, value) {
    setStockTableFilters(current => ({ ...current, [key]: value }))
  }

  function toggleStockTableSort(key) {
    setStockTableSort(current => (
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    ))
  }

  function formatAddress(loc) {
    if (!loc) return '—'
    const parts = [
      loc.zone_code,
      loc.aisle ? `K${loc.aisle}` : null,
      loc.rack ? `R${loc.rack}` : null,
      loc.level ? `S${loc.level}` : null,
      loc.bin ? `G${loc.bin}` : null,
    ].filter(Boolean)
    return parts.join('-') || '—'
  }

  function addWmsCountRow(item, locationId, lpnId, lotNumber, expirationDate) {
    const nextLine = {
      stockItemId: item.id,
      stockItemName: item.name,
      sku: item.sku || '',
      unit: item.unit || '',
      packageQty: '',
      unitQty: '',
      countedQty: '',
      note: '',
      location_id: locationId || null,
      lpn_id: lpnId || null,
      lot_number: lotNumber || null,
      expiration_date: expirationDate || null,
    }
    updateEntry({
      lines: [...(currentEntry.lines || []), nextLine]
    })
  }

  function updateWmsStockLine(lineIndex, patch) {
    if (lineIndex < 0 || lineIndex >= currentEntry.lines.length) return
    const currentLine = currentEntry.lines[lineIndex]
    const item = stockItems.find(si => si.id === currentLine.stockItemId)
    if (!item) return
    const packaging = getPackagingConfig(item)
    const nextLine = {
      ...currentLine,
      ...patch,
    }
    nextLine.countedQty = String(getStockLineTotal(nextLine, packaging.factor))

    updateEntry({
      lines: currentEntry.lines.map((line, idx) => idx === lineIndex ? nextLine : line)
    })
  }

  function removeWmsCountRow(lineIndex) {
    if (!window.confirm('Bu raf sayim satiri silinsin mi?')) return
    updateEntry({
      lines: currentEntry.lines.filter((_, idx) => idx !== lineIndex)
    })
  }

  async function postInventoryAdjustments() {
    if (!selectedFlow || !branchId) return
    if (currentEntry.inventoryPostedAt) {
      toast('Bu sayim zaten envantere islenmis. Tekrar kayit icin yeni tarih veya yeni sayim kullanin.', 'info')
      return
    }

    let movementRows = []

    if (isWmsMode) {
      const wmsBalances = balances.get('wms_balances') || new Map()
      const costs = balances.get('costs') || new Map()

      // Validate location choice for WMS counted rows
      const countedLines = currentEntry.lines.filter(line => {
        const qty = Number(line.countedQty || 0)
        return qty > 0 || String(line.note || '').trim() || String(line.packageQty || '').trim() || String(line.unitQty || '').trim()
      })

      for (const line of countedLines) {
        if (!line.location_id) {
          toast(`Sayim girilen "${line.stockItemName}" urunu icin lokasyon secilmesi zorunludur.`, 'error')
          return
        }
      }

      const processedCombos = new Set()

      for (let i = 0; i < currentEntry.lines.length; i++) {
        const line = currentEntry.lines[i]
        const itemId = String(line.stockItemId)
        const locId = line.location_id || null
        const lpnId = line.lpn_id || null
        const lot = line.lot_number || null
        const exp = line.expiration_date || null

        if (!locId) continue

        const comboKey = `${itemId}__${locId || ''}__${lpnId || ''}__${lot || ''}__${exp || ''}`
        processedCombos.add(comboKey)

        const itemObj = stockItems.find(si => si.id === itemId)
        const packaging = getPackagingConfig(itemObj)
        const manualQty = getStockLineTotal(line, packaging.factor)
        const effectiveQty = manualQty

        const itemBalances = wmsBalances.get(itemId) || []
        const matchedBalance = itemBalances.find(b => 
          (b.location_id || '') === (locId || '') &&
          (b.lpn_id || '') === (lpnId || '') &&
          (b.lot_number || '') === (lot || '') &&
          (b.expiration_date || '') === (exp || '')
        )
        const previousQty = matchedBalance ? Number(matchedBalance.qty || 0) : 0
        const difference = roundQty(effectiveQty - previousQty)

        if (Math.abs(difference) > 0.0001) {
          const itemCosts = costs.get(itemId) || { avg_unit_cost_after: 0, unit_cost: 0 }
          const unitCost = Number(itemCosts.avg_unit_cost_after || itemCosts.unit_cost || 0)

          movementRows.push({
            item_type: 'stock_item',
            stock_item_id: itemId,
            semi_item_id: null,
            item_name: line.stockItemName || itemObj?.name || 'Bilinmeyen Urun',
            item_sku: line.sku || itemObj?.sku || null,
            unit: line.unit || itemObj?.unit || null,
            branch_id: asUuidOrNull(branchId),
            branch_name: branchName || '',
            movement_type: difference > 0 ? 'stock_count_gain' : 'stock_count_loss',
            source_doc_type: 'stock_count',
            direction: difference > 0 ? 'in' : 'out',
            movement_at: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}`,
            quantity: Math.abs(difference),
            source_doc_id: null,
            source_doc_line_id: null,
            source_doc_no: `COUNT-${selectedDate}`,
            source_doc_ref: `${selectedFlow.name} | ${currentEntryId}`,
            supplier_id: null,
            unit_cost: unitCost,
            total_cost: Math.abs(difference) * unitCost,
            avg_unit_cost_after: unitCost,
            balance_qty_after: 0,
            balance_total_cost_after: 0,
            calc_status: 'calculated',
            location_id: locId,
            lpn_id: lpnId,
            lot_number: lot,
            expiration_date: exp,
            notes: line.note || currentEntry.note || null,
            meta: {
              flow_id: selectedFlow.id,
              flow_name: selectedFlow.name,
              count_entry_id: currentEntryId,
              count_date: selectedDate,
              manual_qty: manualQty,
              effective_qty: effectiveQty,
              balance_before: previousQty,
              availability_status: 'available'
            },
          })
        }
      }

      // Aggregate uncounted existing balances as 0 counted (stock loss)
      for (const [itemId, rows] of wmsBalances.entries()) {
        const belongsToFlow = baseProducts.some(bp => bp.id === itemId)
        if (!belongsToFlow) continue

        const item = stockItems.find(si => si.id === itemId)
        const itemName = item?.name || 'Bilinmeyen Urun'

        for (const bal of rows) {
          const comboKey = `${itemId}__${bal.location_id || ''}__${bal.lpn_id || ''}__${bal.lot_number || ''}__${bal.expiration_date || ''}`
          if (!processedCombos.has(comboKey)) {
            const difference = -bal.qty
            const itemCosts = costs.get(itemId) || { avg_unit_cost_after: 0, unit_cost: 0 }
            const unitCost = Number(itemCosts.avg_unit_cost_after || itemCosts.unit_cost || 0)

            movementRows.push({
              item_type: 'stock_item',
              stock_item_id: itemId,
              semi_item_id: null,
              item_name: itemName,
              item_sku: bal.sku || item?.sku || null,
              unit: bal.unit || item?.unit || null,
              branch_id: asUuidOrNull(branchId),
              branch_name: branchName || '',
              movement_type: 'stock_count_loss',
              source_doc_type: 'stock_count',
              direction: 'out',
              movement_at: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}`,
              quantity: Math.abs(difference),
              source_doc_id: null,
              source_doc_line_id: null,
              source_doc_no: `COUNT-${selectedDate}`,
              source_doc_ref: `${selectedFlow.name} | ${currentEntryId}`,
              supplier_id: null,
              unit_cost: unitCost,
              total_cost: Math.abs(difference) * unitCost,
              avg_unit_cost_after: unitCost,
              balance_qty_after: 0,
              balance_total_cost_after: 0,
              calc_status: 'calculated',
              location_id: bal.location_id,
              lpn_id: bal.lpn_id,
              lot_number: bal.lot_number,
              expiration_date: bal.expiration_date,
              notes: currentEntry.note || null,
              meta: {
                flow_id: selectedFlow.id,
                flow_name: selectedFlow.name,
                count_entry_id: currentEntryId,
                count_date: selectedDate,
                manual_qty: 0,
                effective_qty: 0,
                balance_before: bal.qty,
                availability_status: 'available'
              },
            })
          }
        }
      }
    } else {
      movementRows = stockRows
        .filter(row => Math.abs(row.difference) > 0.0001)
        .map(row => {
          const previous = balances.get(String(row.item.id)) || {}
          const previousQty = roundQty(previous.balance_qty_after || 0)
          const previousTotalCost = toNumber(previous.balance_total_cost_after || 0)
          const avgUnitCost = toNumber(previous.avg_unit_cost_after || previous.unit_cost || 0)
          const difference = roundQty(row.difference)
          const nextQty = roundQty(previousQty + difference)
          const unitCost = avgUnitCost
          const nextTotalCost = nextQty > 0 ? roundQty(nextQty * unitCost) : 0

          return {
            item_type: 'stock_item',
            stock_item_id: row.item.id,
            semi_item_id: null,
            item_name: row.item.name,
            item_sku: row.item.sku || null,
            unit: row.item.unit || null,
            branch_id: asUuidOrNull(branchId),
            branch_name: branchName || '',
            movement_type: difference > 0 ? 'stock_count_gain' : 'stock_count_loss',
            source_doc_type: 'stock_count',
            direction: difference > 0 ? 'in' : 'out',
            movement_at: `${selectedDate}T${new Date().toTimeString().slice(0, 8)}`,
            quantity: Math.abs(difference),
            source_doc_id: null,
            source_doc_line_id: null,
            source_doc_no: `COUNT-${selectedDate}`,
            source_doc_ref: `${selectedFlow.name} | ${currentEntryId}`,
            supplier_id: null,
            unit_cost: unitCost,
            total_cost: Math.abs(difference) * unitCost,
            avg_unit_cost_after: unitCost,
            balance_qty_after: nextQty,
            balance_total_cost_after: nextTotalCost,
            calc_status: 'calculated',
            notes: row.line?.note || currentEntry.note || null,
            meta: {
              flow_id: selectedFlow.id,
              flow_name: selectedFlow.name,
              count_entry_id: currentEntryId,
              count_date: selectedDate,
              manual_qty: row.manualQty,
              semi_derived_qty: row.derivedQty,
              effective_qty: row.effectiveQty,
              balance_before: previousQty,
              balance_before_total_cost: previousTotalCost,
            },
          }
        })
    }

    setSavingInventory(true)

    try {
      if (movementRows.length > 0) {
        const { error } = await db.from('inventory_movements').insert(movementRows)
        if (error) throw error
      }

      updateEntry({
        status: 'completed',
        completedAt: new Date().toISOString(),
        inventoryPostedAt: new Date().toISOString(),
        movementCount: movementRows.length,
      })

      toast(
        movementRows.length > 0
          ? `Sayim kaydedildi ve ${movementRows.length} stok hareketi olusturuldu.`
          : 'Fark bulunmadi. Sayim tamamlandi olarak kaydedildi.',
        'success',
      )

      await refreshBalances()
    } catch (error) {
      toast(`Envanter hareketleri yazilamadi: ${error.message}`, 'error')
    } finally {
      setSavingInventory(false)
    }
  }

  function printCountForm() {
    if (typeof window === 'undefined' || !selectedFlow) return

    const printableHtml = buildPrintableHtml({
      flow: selectedFlow,
      branchName,
      selectedDate,
      semiItems,
      semiLines: currentEntry.semiLines || [],
      stockRows: stockRows.map(row => ({
        item: row.item,
        packagingLabel: row.packaging.label ? `${row.packaging.label} x ${formatQty(row.packaging.factor)}` : '',
        packageQty: row.line?.packageQty || '',
        unitQty: row.line?.unitQty ?? row.line?.countedQty ?? '',
        currentBalanceText: formatQty(row.currentBalance),
        derivedQtyText: formatQty(row.derivedQty),
        effectiveQtyText: formatQty(row.effectiveQty),
      })),
    })

    const printWindow = window.open('', '_blank', 'width=1200,height=900')
    if (!printWindow) {
      toast('Yazdirma penceresi acilamadi.', 'error')
      return
    }

    printWindow.document.open()
    printWindow.document.write(printableHtml)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const wmsGridTemplate = showBalanceColumns
    ? 'minmax(180px,1.2fr) minmax(110px,0.7fr) minmax(110px,0.7fr) 110px 80px 80px 100px 100px minmax(120px,0.8fr) 80px'
    : 'minmax(180px,1.2fr) minmax(110px,0.7fr) minmax(110px,0.7fr) 110px 80px 80px 100px minmax(120px,0.8fr) 80px'
  const stockTableGridTemplate = showBalanceColumns
    ? 'minmax(220px,1.8fr) 120px 110px 110px 110px 120px 120px minmax(180px,1fr)'
    : 'minmax(220px,1.8fr) 120px 110px 110px 120px minmax(180px,1fr)'
  const currentGridTemplate = isWmsMode ? wmsGridTemplate : stockTableGridTemplate
  const semiTableGridTemplate = 'minmax(220px,1.8fr) 120px 120px minmax(180px,1fr)'
  const cardStyle = {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    boxShadow: '0 1px 2px rgba(15,23,42,.04)',
  }
  const chipBaseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    borderRadius: 999,
    fontSize: '.74rem',
    fontWeight: 800,
  }
  const headerActions = (
    <>
      <button className="btn-o" onClick={printCountForm} disabled={!selectedFlow}>Form Yazdir</button>
      <button className="btn-o" onClick={saveDraft} disabled={!selectedFlow}>Taslak Kaydet</button>
      <button className="btn-p" onClick={postInventoryAdjustments} disabled={!selectedFlow || savingInventory}>
        {savingInventory ? 'Kaydediliyor...' : 'Envantere Yansit'}
      </button>
    </>
  )

  function renderSortLabel(label, key) {
    const active = stockTableSort.key === key
    const iconClass = !active
      ? 'fa-solid fa-sort'
      : stockTableSort.direction === 'asc'
        ? 'fa-solid fa-sort-up'
        : 'fa-solid fa-sort-down'

    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>{label}</span>
        <i className={iconClass} />
      </span>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Header
        title="Sayim"
        subtitle="Bu subeye tanimlanan aktif sayim akislariyla fiziksel stok sayimi yapin ve farklari envantere yansitin."
        actions={headerActions}
      />

      <div style={{
        ...cardStyle,
        padding: '12px 14px',
        background: storageMode === 'database' ? '#f8fbff' : '#fffaf0',
        borderColor: storageMode === 'database' ? '#bfdbfe' : '#fde68a',
        color: storageMode === 'database' ? '#1d4ed8' : '#92400e',
        fontSize: '.8rem',
        lineHeight: 1.6,
      }}>
        {storageMode === 'database'
          ? 'Akislar veritabanindan okunuyor. Taslak kayitlar lokal saklanir; envantere yansitma dogrudan stok hareketi olusturur.'
          : 'Akislar lokal taslaktan okunuyor. Taslak kayitlar lokal saklanir.'}
      </div>

      <div style={{ ...cardStyle, padding: 16, display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label className="f-label">Sayim tarihi</label>
            <input className="f-input" type="date" value={selectedDate} onChange={event => setSelectedDate(event.target.value)} />
          </div>
          <div>
            <label className="f-label">Sayim akisi</label>
            <select className="f-input" value={selectedFlowId} onChange={event => setSelectedFlowId(event.target.value)} disabled={loading || branchFlows.length === 0}>
              {branchFlows.length === 0 ? (
                <option value="">{loading ? 'Akislar yukleniyor...' : 'Bu sube icin akis yok'}</option>
              ) : branchFlows.map(flow => (
                <option key={flow.id} value={flow.id}>{flow.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="f-label">Urun veya SKU ara</label>
            <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Arama yazin" />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', minHeight: 42 }}>
            {selectedFlow?.products.mode === 'moving' ? (
              <button className="btn-o" onClick={loadMovingItems}>Hareket Gorenler</button>
            ) : null}
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.82rem', color: '#475569' }}>
              <input type="checkbox" checked={showBalanceColumns} onChange={event => setShowBalanceColumns(event.target.checked)} />
              Son stok ve farklari goster
            </label>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {[
            ['Listelenen urun', stockRows.length, '#1d4ed8', '#eff6ff'],
            ['Giris yapilan urun', enteredCount, '#166534', '#f0fdf4'],
            ['Kalan urun', Math.max(stockRows.length - enteredCount, 0), '#92400e', '#fffbeb'],
          ].map(([label, value, color, bg]) => (
            <div key={label} style={{ borderRadius: 12, background: bg, color, padding: '10px 12px', border: '1px solid rgba(148,163,184,.12)' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, marginTop: 3 }}>{value}</div>
            </div>
          ))}
        </div>

        {!loading && branchFlows.length === 0 ? (
          <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f8fafc', color: '#64748b', fontSize: '.82rem', lineHeight: 1.6 }}>
            Bu sube icin aktif sayim akisi bulunamadi. Akislar Ayarlar &gt; Sayim Akislari ekraninda tanimlanir.
          </div>
        ) : null}
      </div>

      {!selectedFlow ? (
        <div style={{ ...cardStyle, padding: 56, textAlign: 'center', color: '#94a3b8' }}>
          Sayim girisi icin once bir akis secin.
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden' }}>
          <div style={{ padding: 18, borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>{selectedFlow.name}</div>
                <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>{selectedFlow.description || 'Aciklama girilmemis.'}</div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ ...chipBaseStyle, background: '#eff6ff', color: '#1d4ed8' }}>
                  <i className="fa-solid fa-calendar-days" />
                  {describeCountSchedule(selectedFlow.schedule)}
                </span>
                <span style={{ ...chipBaseStyle, background: '#fffbeb', color: '#92400e' }}>
                  <i className="fa-solid fa-layer-group" />
                  {describeCountScope(selectedFlow.products)}
                </span>
                <span style={{
                  ...chipBaseStyle,
                  background: currentEntry.inventoryPostedAt ? '#f0fdf4' : (currentEntry.status === 'completed' ? '#fffbeb' : '#f8fafc'),
                  color: currentEntry.inventoryPostedAt ? '#166534' : (currentEntry.status === 'completed' ? '#92400e' : '#475569'),
                }}>
                  <i className={`fa-solid ${currentEntry.inventoryPostedAt ? 'fa-check' : (currentEntry.status === 'completed' ? 'fa-flag-checkered' : 'fa-pen')}`} />
                  {currentEntryStatusLabel}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 12, alignItems: 'end' }}>
              <div>
                <label className="f-label">Sayim notu</label>
                <input className="f-input" value={currentEntry.note || ''} onChange={event => updateEntry({ note: event.target.value })} placeholder="Vardiya veya reyon notu" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className={activeTab === TAB_SEMI ? 'btn-p' : 'btn-o'} onClick={() => setActiveTab(TAB_SEMI)}>Yari Mamuller</button>
                <button type="button" className={activeTab === TAB_STOCK ? 'btn-p' : 'btn-o'} onClick={() => setActiveTab(TAB_STOCK)}>Ana Sayim Formu</button>
              </div>
            </div>
          </div>

          {activeTab === TAB_SEMI ? (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 760 }}>
                <div style={{ display: 'grid', gridTemplateColumns: semiTableGridTemplate, gap: 12, padding: '12px 16px', background: '#f8fafc', fontSize: '.75rem', fontWeight: 800, color: '#475569' }}>
                  <div>Yari mamul</div>
                  <div>SKU</div>
                  <div>Sayilan miktar</div>
                  <div>Not</div>
                </div>
                {semiItems.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '.84rem' }}>Stok takibi aktif yari mamul bulunamadi.</div>
                ) : (
                  semiItems.map(item => {
                    const line = findSemiLine(currentEntry.semiLines, item.id) || {}
                    return (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: semiTableGridTemplate, gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{item.name}</div>
                          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: 2 }}>{item.recipe_output_unit || 'Birim yok'}</div>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#475569' }}>{item.sku || '-'}</div>
                        <input className="f-input" value={line.countedQty || ''} onChange={event => updateSemiLine(item, { countedQty: event.target.value })} placeholder="0" />
                        <input className="f-input" value={line.note || ''} onChange={event => updateSemiLine(item, { note: event.target.value })} placeholder="Yari mamul notu" />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: isWmsMode ? (showBalanceColumns ? 1500 : 1350) : (showBalanceColumns ? 1190 : 1020) }}>
                <div style={{ display: 'grid', gridTemplateColumns: currentGridTemplate, gap: 12, padding: '12px 16px', background: '#f8fafc', fontSize: '.75rem', fontWeight: 800, color: '#475569', alignItems: 'center' }}>
                  <button type="button" onClick={() => toggleStockTableSort('name')} style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', fontSize: '.75rem', fontWeight: 800, color: '#475569', cursor: 'pointer' }}>
                    {renderSortLabel('Urun', 'name')}
                  </button>
                  <button type="button" onClick={() => toggleStockTableSort('sku')} style={{ border: 'none', background: 'transparent', padding: 0, textAlign: 'left', fontSize: '.75rem', fontWeight: 800, color: '#475569', cursor: 'pointer' }}>
                    {renderSortLabel('SKU', 'sku')}
                  </button>
                  {isWmsMode && (
                    <>
                      <div>Lokasyon</div>
                      <div>LPN</div>
                      <div>Lot No</div>
                      <div>SKT</div>
                    </>
                  )}
                  <div>Paket</div>
                  <div>Ana birim</div>
                  {!isWmsMode && <div>Yari mamul</div>}
                  {showBalanceColumns ? <div>Son stok</div> : null}
                  <div>{showBalanceColumns ? 'Toplam / Fark' : 'Toplam'}</div>
                  <div>Not</div>
                  {isWmsMode && <div>Islemler</div>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: currentGridTemplate, gap: 12, padding: '10px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                  <input className="f-input" value={stockTableFilters.name} onChange={event => updateStockTableFilter('name', event.target.value)} placeholder="Isme gore ara" />
                  <input className="f-input" value={stockTableFilters.sku} onChange={event => updateStockTableFilter('sku', event.target.value)} placeholder="SKU ara" />
                  {isWmsMode && (
                    <>
                      <div />
                      <div />
                      <div />
                      <div />
                    </>
                  )}
                  <div />
                  <div />
                  {!isWmsMode && <div />}
                  {showBalanceColumns ? <div /> : null}
                  <div />
                  <div />
                  {isWmsMode && <div />}
                </div>
                {stockRows.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '.84rem' }}>Bu akis icin listelenecek urun bulunamadi.</div>
                ) : (
                  stockRows.map((row, rowIndex) => {
                    if (isWmsMode) {
                      if (row.isEmptyPlaceholder) {
                        return (
                          <div key={row.key} style={{ display: 'grid', gridTemplateColumns: currentGridTemplate, gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center', background: '#fcfcfc' }}>
                            <div>
                              <div style={{ fontWeight: 700, color: '#64748b' }}>{row.item.name}</div>
                              <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: 2 }}>
                                {row.packaging.label ? `1 ${row.packaging.label} = ${formatQty(row.packaging.factor)} ${row.item.unit || 'birim'}` : (row.item.unit || 'Birim yok')}
                              </div>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#94a3b8' }}>{row.item.sku || '-'}</div>
                            <div style={{ gridColumn: 'span 4', color: '#94a3b8', fontSize: '.8rem', fontStyle: 'italic' }}>
                              Raf sayimi girilmemis.
                            </div>
                            <div />
                            <div />
                            {showBalanceColumns ? <div /> : null}
                            <div />
                            <div />
                            <div>
                              <button
                                type="button"
                                className="btn-o"
                                style={{ padding: '4px 8px', fontSize: '.75rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                onClick={() => {
                                  setAddShelfItem(row.item)
                                  setAddShelfLocation('')
                                  setAddShelfLpn('')
                                  setAddShelfLot('')
                                  setAddShelfExpiration('')
                                  setAddShelfModal(true)
                                }}
                              >
                                <i className="fa-solid fa-plus" /> Raf Ekle
                              </button>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={row.key} style={{ display: 'grid', gridTemplateColumns: currentGridTemplate, gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.item.name}</div>
                            <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 2 }}>
                              {row.packaging.label ? `1 ${row.packaging.label} = ${formatQty(row.packaging.factor)} ${row.item.unit || 'birim'}` : (row.item.unit || 'Birim yok')}
                            </div>
                          </div>
                          <div style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#475569' }}>{row.item.sku || '-'}</div>
                          
                          {/* Lokasyon select */}
                          <div>
                            <select
                              className="f-input"
                              style={{ padding: '4px 6px', fontSize: '.8rem' }}
                              value={row.line.location_id || ''}
                              onChange={e => updateWmsStockLine(row.lineIndex, { location_id: e.target.value })}
                            >
                              <option value="">Seçiniz *</option>
                              {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>{formatAddress(loc)}</option>
                              ))}
                            </select>
                          </div>

                          {/* LPN select */}
                          <div>
                            <select
                              className="f-input"
                              style={{ padding: '4px 6px', fontSize: '.8rem' }}
                              value={row.line.lpn_id || ''}
                              onChange={e => updateWmsStockLine(row.lineIndex, { lpn_id: e.target.value })}
                            >
                              <option value="">Yok</option>
                              {lpns.map(lpn => (
                                <option key={lpn.id} value={lpn.id}>{lpn.lpn_code}</option>
                              ))}
                            </select>
                          </div>

                          {/* Lot No input */}
                          <div>
                            <input
                              className="f-input"
                              style={{ padding: '4px 6px', fontSize: '.8rem' }}
                              value={row.line.lot_number || ''}
                              onChange={e => updateWmsStockLine(row.lineIndex, { lot_number: e.target.value })}
                              placeholder="Lot"
                            />
                          </div>

                          {/* SKT input */}
                          <div>
                            <input
                              type="date"
                              className="f-input"
                              style={{ padding: '4px 6px', fontSize: '.8rem' }}
                              value={row.line.expiration_date || ''}
                              onChange={e => updateWmsStockLine(row.lineIndex, { expiration_date: e.target.value })}
                            />
                          </div>

                          {/* Paket input */}
                          <input
                            ref={element => { inputRefs.current[`${row.lineIndex}:packageQty`] = element }}
                            className="f-input"
                            value={row.line.packageQty || ''}
                            onChange={event => updateWmsStockLine(row.lineIndex, { packageQty: event.target.value })}
                            onKeyDown={event => handleCellKeyDown(event, row.lineIndex, 'packageQty')}
                            placeholder={row.packaging.factor > 0 ? row.packaging.label || 'Paket' : '-'}
                            disabled={row.packaging.factor <= 0}
                          />

                          {/* Unit qty input */}
                          <input
                            ref={element => { inputRefs.current[`${row.lineIndex}:unitQty`] = element }}
                            className="f-input"
                            value={row.line.unitQty ?? row.line.countedQty ?? ''}
                            onChange={event => updateWmsStockLine(row.lineIndex, { unitQty: event.target.value })}
                            onKeyDown={event => handleCellKeyDown(event, row.lineIndex, 'unitQty')}
                            placeholder={row.item.unit || 'Ana birim'}
                          />

                          {/* Son Stok (only when showBalanceColumns is true) */}
                          {showBalanceColumns ? (
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatQty(row.currentBalance)}</div>
                          ) : null}

                          {/* Toplam & Fark / Toplam */}
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatQty(row.effectiveQty)}</div>
                            {showBalanceColumns ? (
                              <div style={{ fontSize: '.74rem', color: row.difference === 0 ? '#64748b' : (row.difference > 0 ? '#166534' : '#b91c1c'), marginTop: 2 }}>
                                Fark: {row.difference > 0 ? '+' : ''}{formatQty(row.difference)}
                              </div>
                            ) : null}
                          </div>

                          {/* Note input */}
                          <input
                            className="f-input"
                            value={row.line.note || ''}
                            onChange={event => updateWmsStockLine(row.lineIndex, { note: event.target.value })}
                            placeholder="Not"
                          />

                          {/* Islemler (Delete / Add another shelf) */}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn-o"
                              style={{ padding: '4px 8px', fontSize: '.75rem', borderColor: '#ef4444', color: '#ef4444' }}
                              title="Rafı Sil"
                              onClick={() => removeWmsCountRow(row.lineIndex)}
                            >
                              <i className="fa-solid fa-trash" />
                            </button>
                            <button
                              type="button"
                              className="btn-o"
                              style={{ padding: '4px 8px', fontSize: '.75rem' }}
                              title="Yeni Raf Ekle"
                              onClick={() => {
                                setAddShelfItem(row.item)
                                setAddShelfLocation('')
                                setAddShelfLpn('')
                                setAddShelfLot('')
                                setAddShelfExpiration('')
                                setAddShelfModal(true)
                              }}
                            >
                              <i className="fa-solid fa-plus" />
                            </button>
                          </div>
                        </div>
                      )
                    }

                    return (
                      <div key={row.item.id} style={{ display: 'grid', gridTemplateColumns: stockTableGridTemplate, gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.item.name}</div>
                          <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: 2 }}>
                            {row.packaging.label ? `1 ${row.packaging.label} = ${formatQty(row.packaging.factor)} ${row.item.unit || 'birim'}` : (row.item.unit || 'Birim yok')}
                          </div>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#475569' }}>{row.item.sku || '-'}</div>
                        <input
                          ref={element => { inputRefs.current[`${rowIndex}:packageQty`] = element }}
                          className="f-input"
                          value={row.line?.packageQty || ''}
                          onChange={event => updateStockLine(row.item, { packageQty: event.target.value })}
                          onKeyDown={event => handleCellKeyDown(event, rowIndex, 'packageQty')}
                          placeholder={row.packaging.factor > 0 ? row.packaging.label || 'Paket' : '-'}
                          disabled={row.packaging.factor <= 0}
                        />
                        <input
                          ref={element => { inputRefs.current[`${rowIndex}:unitQty`] = element }}
                          className="f-input"
                          value={row.line?.unitQty ?? row.line?.countedQty ?? ''}
                          onChange={event => updateStockLine(row.item, { unitQty: event.target.value })}
                          onKeyDown={event => handleCellKeyDown(event, rowIndex, 'unitQty')}
                          placeholder={row.item.unit || 'Ana birim'}
                        />
                        <div style={{ fontWeight: 700, color: '#1d4ed8' }}>{formatQty(row.derivedQty)}</div>
                        {showBalanceColumns ? <div style={{ fontWeight: 700, color: '#0f172a' }}>{formatQty(row.currentBalance)}</div> : null}
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatQty(row.effectiveQty)}</div>
                          {showBalanceColumns ? (
                            <div style={{ fontSize: '.74rem', color: row.difference === 0 ? '#64748b' : (row.difference > 0 ? '#166534' : '#b91c1c'), marginTop: 2 }}>
                              Fark: {row.difference > 0 ? '+' : ''}{formatQty(row.difference)}
                            </div>
                          ) : null}
                        </div>
                        <input className="f-input" value={row.line?.note || ''} onChange={event => updateStockLine(row.item, { note: event.target.value })} placeholder="Istege bagli not" />
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {addShelfModal && addShelfItem && (
        <Modal
          open={addShelfModal}
          onClose={() => setAddShelfModal(false)}
          title={`Raf Ekle: ${addShelfItem.name}`}
          width={520}
          footer={
            <div style={{ display: 'flex', justifyContent: 'end', gap: 10 }}>
              <button type="button" className="btn-o" onClick={() => setAddShelfModal(false)}>İptal</button>
              <button
                type="button"
                className="btn-p"
                onClick={() => {
                  if (!addShelfLocation) {
                    toast('Lokasyon seçilmesi zorunludur.', 'error')
                    return
                  }
                  addWmsCountRow(
                    addShelfItem,
                    addShelfLocation,
                    addShelfLpn,
                    addShelfLot,
                    addShelfExpiration
                  )
                  setAddShelfModal(false)
                }}
              >
                Ekle
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gap: 12, padding: '8px 4px' }}>
            <div>
              <label className="f-label" style={{ fontWeight: 700 }}>Lokasyon *</label>
              <select
                className="f-input"
                value={addShelfLocation}
                onChange={e => setAddShelfLocation(e.target.value)}
              >
                <option value="">Seçiniz...</option>
                {locations.map(loc => (
                  <option key={loc.id} value={loc.id}>{formatAddress(loc)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="f-label">LPN (Palet / Kutu)</label>
              <select
                className="f-input"
                value={addShelfLpn}
                onChange={e => setAddShelfLpn(e.target.value)}
              >
                <option value="">Yok</option>
                {lpns.map(lpn => (
                  <option key={lpn.id} value={lpn.id}>{lpn.lpn_code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="f-label">Lot Numarası</label>
              <input
                className="f-input"
                value={addShelfLot}
                onChange={e => setAddShelfLot(e.target.value)}
                placeholder="Lot no"
              />
            </div>
            <div>
              <label className="f-label">Son Kullanma Tarihi</label>
              <input
                type="date"
                className="f-input"
                value={addShelfExpiration}
                onChange={e => setAddShelfExpiration(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
