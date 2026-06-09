import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import { asUuidOrNull, branchMatchesRecord } from '@/lib/branchPurchasing'
import { useToast } from '@/hooks/useToast'
import { isBranchScopedScope } from '@/lib/workspace'

const ITEM_TYPE_OPTIONS = [
  { value: '', label: 'Tum Varliklar' },
  { value: 'stock_item', label: 'Stok Mali' },
  { value: 'semi_item', label: 'Yari Mamul' },
]

const MOVEMENT_TYPE_OPTIONS = [
  { value: '', label: 'Tum Hareketler' },
  { value: 'opening_balance', label: 'Acilis Bakiyesi' },
  { value: 'purchase_receipt', label: 'Satin Alma Girisi' },
  { value: 'sale_consumption', label: 'Satisa Bagli Tuketim' },
  { value: 'waste_consumption', label: 'Zayi Tuketimi' },
  { value: 'transfer_in', label: 'Transfer Girisi' },
  { value: 'transfer_out', label: 'Transfer Cikisi' },
  { value: 'supplier_return', label: 'Tedarikci Iade' },
  { value: 'production_consumption', label: 'Uretim Tuketimi' },
  { value: 'production_output', label: 'Uretim Cikisi' },
  { value: 'stock_count_gain', label: 'Sayim Fazlasi' },
  { value: 'stock_count_loss', label: 'Sayim Eksigi' },
  { value: 'manual_adjustment_in', label: 'Manuel Giris' },
  { value: 'manual_adjustment_out', label: 'Manuel Cikis' },
]

const SOURCE_DOC_OPTIONS = [
  { value: '', label: 'Tum Belgeler' },
  { value: 'opening_balance', label: 'Acilis' },
  { value: 'purchase_receipt', label: 'Mal Kabul' },
  { value: 'sale', label: 'Satis' },
  { value: 'waste', label: 'Zayi' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'supplier_return', label: 'Tedarikci Iade' },
  { value: 'production', label: 'Uretim' },
  { value: 'stock_count', label: 'Sayim' },
  { value: 'manual_adjustment', label: 'Manuel Duzeltme' },
]

const MOVEMENT_TYPE_LABELS = Object.fromEntries(
  MOVEMENT_TYPE_OPTIONS.filter(option => option.value).map(option => [option.value, option.label]),
)

const SOURCE_DOC_LABELS = Object.fromEntries(
  SOURCE_DOC_OPTIONS.filter(option => option.value).map(option => [option.value, option.label]),
)

const DEFAULT_LOOKBACK_DAYS = 14
const DEFAULT_ROW_LIMIT = 400

function isoDateOffset(days = 0) {
  const value = new Date()
  value.setHours(0, 0, 0, 0)
  value.setDate(value.getDate() + Number(days || 0))
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createDefaultFilters(branchId = '') {
  return {
    branchId,
    itemType: '',
    movementType: '',
    sourceDocType: '',
    dateFrom: isoDateOffset(-DEFAULT_LOOKBACK_DAYS),
    dateTo: isoDateOffset(0),
    search: '',
    locationId: '',
    lpnId: '',
  }
}

const INVENTORY_MOVEMENT_SELECT = [
  'id',
  'movement_at',
  'ledger_seq',
  'branch_id',
  'branch_name',
  'item_name',
  'item_sku',
  'item_type',
  'movement_type',
  'direction',
  'source_doc_type',
  'source_doc_no',
  'source_doc_ref',
  'quantity_signed',
  'total_cost_signed',
  'unit_cost',
  'balance_qty_after',
  'avg_unit_cost_after',
  'sales_channel_name',
  'portion_name',
  'location_id',
  'lpn_id',
  'lot_number',
  'expiration_date',
  'notes',
].join(',')

function compareMovementRows(left, right) {
  const timeCompare = String(right?.movement_at || '').localeCompare(String(left?.movement_at || ''))
  if (timeCompare !== 0) return timeCompare
  return Number(right?.ledger_seq || 0) - Number(left?.ledger_seq || 0)
}

const EMPTY_FILTERS = {
  branchId: '',
  itemType: '',
  movementType: '',
  sourceDocType: '',
  dateFrom: isoDateOffset(-DEFAULT_LOOKBACK_DAYS),
  dateTo: isoDateOffset(0),
  search: '',
  locationId: '',
  lpnId: '',
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  return date.toLocaleDateString('tr-TR') + ' ' + date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function formatQty(value) {
  const num = Number(value || 0)
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMoney(value) {
  const num = Number(value || 0)
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCost(value) {
  const num = Number(value || 0)
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
}

function getMovementTypeLabel(value) {
  return MOVEMENT_TYPE_LABELS[value] || value || '—'
}

function getSourceDocLabel(value) {
  return SOURCE_DOC_LABELS[value] || value || '—'
}

function getItemTypeLabel(value) {
  return value === 'semi_item' ? 'Yari Mamul' : 'Stok Mali'
}

function normalizeText(value) {
  return String(value || '').toLocaleLowerCase('tr-TR').trim()
}

function matchesColumnFilter(value, filterValue) {
  const safeFilter = normalizeText(filterValue)
  if (!safeFilter) return true
  return normalizeText(value).includes(safeFilter)
}

function compareValues(left, right, direction = 'desc') {
  if (left === right) return 0
  const multiplier = direction === 'asc' ? 1 : -1

  if (typeof left === 'number' && typeof right === 'number') {
    return (left - right) * multiplier
  }

  return String(left || '').localeCompare(String(right || ''), 'tr') * multiplier
}

const TABLE_COLUMNS = [
  { key: 'date', label: 'TARIH', align: 'left' },
  { key: 'branch', label: 'SUBE', align: 'left' },
  { key: 'item', label: 'VARLIK', align: 'left' },
  { key: 'movement', label: 'HAREKET', align: 'left' },
  { key: 'document', label: 'BELGE', align: 'left' },
  { key: 'quantity', label: 'MIKTAR', align: 'right' },
  { key: 'unitCost', label: 'BIRIM MALIYET', align: 'right' },
  { key: 'totalCost', label: 'TOPLAM MALIYET', align: 'right' },
  { key: 'balance', label: 'SON BAKIYE', align: 'right' },
  { key: 'avgCost', label: 'SON ORT. MALIYET', align: 'right' },
]

function parseTreeSetting(value) {
  if (!value) return []
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? value : []
}

function getAllBranches(tree) {
  const result = []
  function walk(nodes) {
    for (const node of nodes || []) {
      if (node.type === 'sube' || node.type === 'anadepo' || node.type === 'mutfak' || node.type === 'uretim') result.push({ id: node.id, name: node.name })
      walk(node.children || [])
    }
  }
  walk(tree)
  return result
}

function selectStyle() {
  return { minWidth: 170 }
}

export default function InventoryMovements() {
  const toast = useToast()
  const { scope, branchId: workspaceBranchId, branches: workspaceBranches } = useWorkspace()
  const branchLocked = isBranchScopedScope(scope) && !!workspaceBranchId
  const isWmsMode = scope === 'anadepo'
  const [filters, setFilters] = useState(() => createDefaultFilters(branchLocked ? workspaceBranchId : ''))
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [branches, setBranches] = useState([])
  const [wmsLocations, setWmsLocations] = useState([])
  const [wmsLpns, setWmsLpns] = useState([])
  const [columnFilters, setColumnFilters] = useState({
    date: '',
    branch: '',
    item: '',
    movement: '',
    document: '',
    quantity: '',
    unitCost: '',
    totalCost: '',
    balance: '',
    avgCost: '',
  })
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' })

  const buildMovementParams = useCallback((currentFilters, selectedBranch = null, limit = DEFAULT_ROW_LIMIT + 1) => {
    const effectiveDateFrom = currentFilters.dateFrom || isoDateOffset(-DEFAULT_LOOKBACK_DAYS)
    const effectiveDateTo = currentFilters.dateTo || isoDateOffset(0)
    const branchUuid = asUuidOrNull(selectedBranch?.id || selectedBranch?.branchId)
    const branchName = String(selectedBranch?.name || selectedBranch?.branchName || '').trim()

    return {
      p_branch_uuid: branchUuid,
      p_branch_name: branchName || null,
      p_date_from: `${effectiveDateFrom}T00:00:00`,
      p_date_to: `${effectiveDateTo}T23:59:59`,
      p_item_type: currentFilters.itemType || null,
      p_movement_type: currentFilters.movementType || null,
      p_source_doc_type: currentFilters.sourceDocType || null,
      p_limit: limit,
      p_branch_key: String(selectedBranch?.id || selectedBranch?.branchId || '').trim() || null,
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: settingsRow, error: settingsError } = await db
        .from('settings')
        .select('value')
        .eq('key', 'company_tree')
        .single()

      if (settingsError) throw settingsError

      const resolvedBranches = workspaceBranches.length
        ? workspaceBranches
        : getAllBranches(parseTreeSetting(settingsRow?.value))

      setBranches(resolvedBranches)

      // Load WMS locations and LPNs for WMS filter dropdowns
      if (isWmsMode) {
        const [{ data: locData }, { data: lpnData }] = await Promise.all([
          db.from('warehouse_locations').select('id,zone_code,aisle,rack,level,bin,branch_id').eq('is_active', true).order('zone_code'),
          db.from('warehouse_lpns').select('id,lpn_code,branch_id').eq('status', 'active').order('lpn_code'),
        ])
        setWmsLocations(locData || [])
        setWmsLpns(lpnData || [])
      }

      if (!branchLocked && !filters.branchId) {
        setRows([])
        setLoading(false)
        return
      }

      if (filters.branchId) {
        const selectedBranch = resolvedBranches.find(branch => branch.id === filters.branchId) || { id: filters.branchId, name: '' }
        const movementsResult = await db
          .rpc('get_inventory_movements_window', buildMovementParams(filters, selectedBranch))

        if (movementsResult.error) {
          if (movementsResult.error.code === 'PGRST202') {
            throw new Error('Stok hareketleri RPC fonksiyonu eksik. `inventory-movements-window-rpc.sql` dosyasini calistirin.')
          }
          throw movementsResult.error
        }

        let batchRows = (movementsResult.data || []).filter(row => branchMatchesRecord(row, selectedBranch))

        // Client-side WMS filters (location_id / lpn_id)
        if (filters.locationId) batchRows = batchRows.filter(r => r.location_id === filters.locationId)
        if (filters.lpnId) batchRows = batchRows.filter(r => r.lpn_id === filters.lpnId)

        if (batchRows.length > DEFAULT_ROW_LIMIT) {
          toast('Gosterim son hareketlerle sinirlandi. Daha eski kayitlar icin tarih araligini daraltin.', 'info')
        }

        setRows(batchRows.sort(compareMovementRows).slice(0, DEFAULT_ROW_LIMIT))
        return
      }

      setRows([])
    } catch (error) {
      toast('Stok hareketleri yuklenemedi: ' + (error?.message || 'Bilinmeyen hata'), 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [buildMovementParams, filters, isWmsMode, toast, workspaceBranches])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!workspaceBranches.length) return
    setBranches(workspaceBranches)
  }, [workspaceBranches])

  useEffect(() => {
    if (!branchLocked || !workspaceBranchId) return
    setFilters(prev => (prev.branchId === workspaceBranchId ? prev : { ...prev, branchId: workspaceBranchId }))
  }, [branchLocked, workspaceBranchId])

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  function resetFilters() {
    setFilters(createDefaultFilters(branchLocked ? workspaceBranchId : ''))
    setColumnFilters({
      date: '',
      branch: '',
      item: '',
      movement: '',
      document: '',
      quantity: '',
      unitCost: '',
      totalCost: '',
      balance: '',
      avgCost: '',
    })
    setSortConfig({ key: 'date', direction: 'desc' })
  }

  function updateColumnFilter(key, value) {
    setColumnFilters(prev => ({ ...prev, [key]: value }))
  }

  function toggleSort(key) {
    setSortConfig(prev => {
      if (prev.key !== key) return { key, direction: 'desc' }
      if (prev.direction === 'desc') return { key, direction: 'asc' }
      return { key, direction: 'desc' }
    })
  }

  const displayRows = useMemo(() => {
    return rows.map(row => {
      const qty = Number(row.quantity_signed || 0)
      const cost = Number(row.total_cost_signed || 0)
      const unitCost = Number(row.unit_cost || 0)
      const balance = Number(row.balance_qty_after || 0)
      const avgCost = Number(row.avg_unit_cost_after || 0)
      const movementLabel = getMovementTypeLabel(row.movement_type)
      const documentLabel = getSourceDocLabel(row.source_doc_type)
      const itemTypeLabel = getItemTypeLabel(row.item_type)

      return {
        ...row,
        qty,
        cost,
        unitCost,
        balance,
        avgCost,
        movementLabel,
        documentLabel,
        itemTypeLabel,
        dateText: formatDateTime(row.movement_at),
        itemText: [row.item_name, itemTypeLabel, row.item_sku].filter(Boolean).join(' '),
        documentText: [documentLabel, row.source_doc_no, row.source_doc_ref].filter(Boolean).join(' '),
        quantityText: formatQty(qty),
        unitCostText: formatCost(unitCost),
        totalCostText: formatMoney(cost),
        balanceText: formatMoney(balance),
        avgCostText: formatCost(avgCost),
      }
    })
  }, [rows])

  const filteredRows = useMemo(() => {
    const text = filters.search.trim().toLowerCase()
    const baseRows = !text
      ? displayRows
      : displayRows.filter(row => {
      const haystack = [
        row.item_name,
        row.item_sku,
        row.branch_name,
        row.movement_type,
        row.source_doc_type,
        row.source_doc_no,
        row.source_doc_ref,
        row.sales_channel_name,
        row.portion_name,
        row.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(text)
    })

    return baseRows.filter(row => (
      matchesColumnFilter(row.dateText, columnFilters.date) &&
      matchesColumnFilter(row.branch_name, columnFilters.branch) &&
      matchesColumnFilter(row.itemText, columnFilters.item) &&
      matchesColumnFilter(`${row.movementLabel} ${row.direction === 'in' ? 'Giris' : 'Cikis'}`, columnFilters.movement) &&
      matchesColumnFilter(row.documentText, columnFilters.document) &&
      matchesColumnFilter(row.quantityText, columnFilters.quantity) &&
      matchesColumnFilter(row.unitCostText, columnFilters.unitCost) &&
      matchesColumnFilter(row.totalCostText, columnFilters.totalCost) &&
      matchesColumnFilter(row.balanceText, columnFilters.balance) &&
      matchesColumnFilter(row.avgCostText, columnFilters.avgCost)
    ))
  }, [displayRows, filters.search, columnFilters])

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows]
    sorted.sort((left, right) => {
      switch (sortConfig.key) {
        case 'branch':
          return compareValues(left.branch_name, right.branch_name, sortConfig.direction)
        case 'item':
          return compareValues(left.item_name, right.item_name, sortConfig.direction)
        case 'movement':
          return compareValues(left.movementLabel, right.movementLabel, sortConfig.direction)
        case 'document':
          return compareValues(left.documentLabel, right.documentLabel, sortConfig.direction)
        case 'quantity':
          return compareValues(left.qty, right.qty, sortConfig.direction)
        case 'unitCost':
          return compareValues(left.unitCost, right.unitCost, sortConfig.direction)
        case 'totalCost':
          return compareValues(left.cost, right.cost, sortConfig.direction)
        case 'balance':
          return compareValues(left.balance, right.balance, sortConfig.direction)
        case 'avgCost':
          return compareValues(left.avgCost, right.avgCost, sortConfig.direction)
        case 'date':
        default:
          return compareValues(
            `${left.movement_at || ''}|${String(left.ledger_seq || '').padStart(12, '0')}`,
            `${right.movement_at || ''}|${String(right.ledger_seq || '').padStart(12, '0')}`,
            sortConfig.direction,
          )
      }
    })
    return sorted
  }, [filteredRows, sortConfig])

  const requiresBranchSelection = !branchLocked && !filters.branchId

  const summary = useMemo(() => {
    return filteredRows.reduce((acc, row) => {
      acc.count += 1
      acc.quantity += Number(row.qty || 0)
      acc.totalCost += Number(row.cost || 0)
      return acc
    }, { count: 0, quantity: 0, totalCost: 0 })
  }, [filteredRows])

  return (
    <div>
      <Header
        title="Stok Hareketleri"
        subtitle={requiresBranchSelection
          ? 'Performans icin once sube secin'
          : `${filteredRows.length} hareket gosteriliyor • varsayilan gorunum son ${DEFAULT_LOOKBACK_DAYS} gun`}
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" onClick={resetFilters}>
              <i className="fa-solid fa-filter-circle-xmark" /> Filtreleri Temizle
            </button>
            <button className="btn-p" onClick={load} disabled={loading}>
              {loading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-rotate-right" />}
              {' '}Yenile
            </button>
          </div>
        )}
      />

      <div className="card" style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <div className="f-label">Arama</div>
            <input
              className="f-input"
              value={filters.search}
              onChange={e => updateFilter('search', e.target.value)}
              placeholder="Mal, sku, sube, belge no..."
            />
          </div>
          <div>
            <div className="f-label">Sube</div>
            <select
              className="f-input"
              style={selectStyle()}
              value={filters.branchId}
              onChange={e => updateFilter('branchId', e.target.value)}
              disabled={branchLocked}
            >
              <option value="">Tum Subeler</option>
              {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            {!branchLocked && !filters.branchId && (
              <div style={{ marginTop: 6, fontSize: '.76rem', color: '#b45309' }}>
                Tum subeler sorgusu bu tabloda cok agir olabiliyor. Hareketleri gormek icin bir sube secin.
              </div>
            )}
          </div>
          <div>
            <div className="f-label">Varlik Tipi</div>
            <select className="f-input" style={selectStyle()} value={filters.itemType} onChange={e => updateFilter('itemType', e.target.value)}>
              {ITEM_TYPE_OPTIONS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <div className="f-label">Hareket Turu</div>
            <select className="f-input" style={selectStyle()} value={filters.movementType} onChange={e => updateFilter('movementType', e.target.value)}>
              {MOVEMENT_TYPE_OPTIONS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <div className="f-label">Belge Turu</div>
            <select className="f-input" style={selectStyle()} value={filters.sourceDocType} onChange={e => updateFilter('sourceDocType', e.target.value)}>
              {SOURCE_DOC_OPTIONS.map(option => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div className="f-label">Tarih Baslangic</div>
              <input className="f-input" type="date" value={filters.dateFrom} onChange={e => updateFilter('dateFrom', e.target.value)} />
            </div>
            <div>
              <div className="f-label">Tarih Bitis</div>
              <input className="f-input" type="date" value={filters.dateTo} onChange={e => updateFilter('dateTo', e.target.value)} />
            </div>
          </div>
          {isWmsMode && (
            <>
              <div>
                <div className="f-label">Lokasyon</div>
                <select className="f-input" style={selectStyle()} value={filters.locationId} onChange={e => updateFilter('locationId', e.target.value)}>
                  <option value="">Tüm Lokasyonlar</option>
                  {wmsLocations
                    .filter(l => !filters.branchId || l.branch_id === filters.branchId)
                    .map(l => {
                      const parts = [l.zone_code, l.aisle ? `K${l.aisle}` : null, l.rack ? `R${l.rack}` : null, l.level ? `S${l.level}` : null, l.bin ? `G${l.bin}` : null].filter(Boolean)
                      const addr = parts.join('-') || l.id
                      return <option key={l.id} value={l.id}>{addr}</option>
                    })
                  }
                </select>
              </div>
              <div>
                <div className="f-label">LPN / Palet</div>
                <select className="f-input" style={selectStyle()} value={filters.lpnId} onChange={e => updateFilter('lpnId', e.target.value)}>
                  <option value="">Tüm LPN'ler</option>
                  {wmsLpns
                    .filter(l => !filters.branchId || l.branch_id === filters.branchId)
                    .map(l => <option key={l.id} value={l.id}>{l.lpn_code}</option>)
                  }
                </select>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc' }}>
            <div style={{ fontSize: '.76rem', color: '#64748b' }}>Gorunen Hareket</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', marginTop: 5 }}>{summary.count}</div>
          </div>
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc' }}>
            <div style={{ fontSize: '.76rem', color: '#64748b' }}>Net Miktar</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: summary.quantity >= 0 ? '#047857' : '#b91c1c', marginTop: 5 }}>
              {summary.quantity >= 0 ? '+' : ''}{formatQty(summary.quantity)}
            </div>
          </div>
          <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc' }}>
            <div style={{ fontSize: '.76rem', color: '#64748b' }}>Net Maliyet Etkisi</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: summary.totalCost >= 0 ? '#047857' : '#b91c1c', marginTop: 5 }}>
              {summary.totalCost >= 0 ? '+' : ''}{formatMoney(summary.totalCost)} TRY
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {TABLE_COLUMNS.map(column => (
                  <th key={column.key} style={{ textAlign: column.align }}>
                    <button
                      type="button"
                      onClick={() => toggleSort(column.key)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        font: 'inherit',
                        fontWeight: 800,
                        color: 'inherit',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {column.label}
                      <span style={{ fontSize: '.75rem', color: sortConfig.key === column.key ? '#2563eb' : '#94a3b8' }}>
                        {sortConfig.key === column.key
                          ? (sortConfig.direction === 'desc' ? '↓' : '↑')
                          : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
              <tr>
                {TABLE_COLUMNS.map(column => (
                  <th key={`${column.key}-filter`} style={{ textAlign: column.align, paddingTop: 6, paddingBottom: 10 }}>
                    <input
                      className="f-input"
                      value={columnFilters[column.key]}
                      onChange={e => updateColumnFilter(column.key, e.target.value)}
                      placeholder={column.align === 'right' ? 'Filtre...' : 'Ara...'}
                      style={{
                        minWidth: column.align === 'right' ? 110 : 120,
                        textAlign: column.align,
                        fontWeight: 500,
                        height: 34,
                        padding: '6px 10px',
                      }}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: 28, color: '#94a3b8' }}>
                    {requiresBranchSelection
                      ? 'Performans icin once bir sube secin.'
                      : 'Bu filtrelerle hareket bulunamadi.'}
                  </td>
                </tr>
              )}
              {sortedRows.map(row => {
                return (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{row.dateText}</td>
                    <td>{row.branch_name || '—'}</td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.item_name}</div>
                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                          {row.itemTypeLabel}
                          {row.item_sku ? ` • ${row.item_sku}` : ''}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.movementLabel}</div>
                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                          {row.direction === 'in' ? 'Giris' : 'Cikis'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ color: '#0f172a' }}>{row.documentLabel}</div>
                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                          {[row.source_doc_no, row.source_doc_ref].filter(Boolean).join(' • ') || '—'}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', color: row.qty >= 0 ? '#047857' : '#b91c1c', fontWeight: 700 }}>
                      {row.qty >= 0 ? '+' : ''}{row.quantityText}
                    </td>
                    <td style={{ textAlign: 'right' }}>{row.unitCostText}</td>
                    <td style={{ textAlign: 'right', color: row.cost >= 0 ? '#047857' : '#b91c1c', fontWeight: 700 }}>
                      {row.cost >= 0 ? '+' : ''}{row.totalCostText}
                    </td>
                    <td style={{ textAlign: 'right' }}>{row.balanceText}</td>
                    <td style={{ textAlign: 'right' }}>{row.avgCostText}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
