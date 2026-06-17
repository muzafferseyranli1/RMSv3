import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import { useWorkspace } from '@/context/WorkspaceContext'
import { readSettingValue, writeSettingValue } from '@/lib/settingsStore'
import { db } from '@/lib/db'
import { isBranchScopedScope } from '@/lib/workspace'

const DRAFTS_SETTING_KEY = 'inventory_operation_drafts_v1'
const AUTO_POST_TIME = '22:00'
const STANDARD_PORTION_ID = '__standart__'

const OPERATION_CONFIG = {
  waste: {
    title: 'Zayi Kaydi',
    branchSubtitle: 'Şube İşlemleri > İşlemler > Zayi Kaydı',
    warehouseSubtitle: 'Merkez Depo / Üretim > İşlemler > Zayi Kaydı',
    icon: 'fa-trash-can',
    iconColor: '#dc2626',
    iconBg: '#fee2e2',
    movementType: 'waste_consumption',
    sourceDocType: 'waste',
    docPrefix: 'ZY',
    successLabel: 'Zayi kaydi olusturuldu.',
    submitLabel: 'Zayi Kaydet',
    draftLabel: 'Taslak Zayi Kaydet',
  },
  freeUse: {
    title: 'Serbest Kullanım Kaydı',
    branchSubtitle: 'Şube İşlemleri > İşlemler > Serbest Kullanım Kaydı',
    warehouseSubtitle: 'Merkez Depo / Üretim > İşlemler > Serbest Kullanım Kaydı',
    icon: 'fa-hand-holding',
    iconColor: '#2563eb',
    iconBg: '#dbeafe',
    movementType: 'manual_adjustment_out',
    sourceDocType: 'manual_adjustment',
    docPrefix: 'SK',
    successLabel: 'Serbest kullanim kaydi olusturuldu.',
    submitLabel: 'Kaydi Olustur',
    draftLabel: 'Taslak Kaydet',
  },
}

const ITEM_TYPE_OPTIONS = [
  {
    value: 'stock_item',
    label: 'Stok Mali',
    selectedLabel: 'Stok Mali',
    description: 'Dogrudan stok kalemleri',
    icon: 'fa-boxes-stacked',
    meta: 'Stok',
  },
  {
    value: 'semi_item',
    label: 'Yari Mamul',
    selectedLabel: 'Yari Mamul',
    description: 'Recete ciktilari ve ara urunler',
    icon: 'fa-layer-group',
    meta: 'Yari Mamul',
  },
  {
    value: 'sale_item',
    label: 'Satis Mali',
    selectedLabel: 'Satis Mali',
    description: 'Receteden dusulecek satis urunleri',
    icon: 'fa-utensils',
    meta: 'Satis',
  },
]

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : ((random & 0x3) | 0x8)
    return value.toString(16)
  })
}

function nowDateText() {
  return new Date().toISOString().slice(0, 10)
}

function nowTimeText() {
  const value = new Date()
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function createDocNo(prefix, dateText, timeText) {
  const compactDate = String(dateText || '').replaceAll('-', '')
  const compactTime = String(timeText || '').replaceAll(':', '')
  return `${prefix}-${compactDate}${compactTime}`
}

function parseMaybeArray(value, fallback = []) {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : fallback
    } catch {
      return fallback
    }
  }

  return fallback
}

function buildBranchOptions(branches) {
  return [
    {
      value: '',
      label: 'Merkez Mutfak / Depo',
      selectedLabel: 'Merkez Mutfak / Depo',
      description: 'Kayit merkez depo / mutfak hareketi olarak tutulur.',
      icon: 'fa-warehouse',
      meta: 'Merkez',
    },
    ...branches.map(branch => ({
      value: branch.id,
      label: branch.name,
      selectedLabel: branch.name,
      description: 'Kayit secilen sube hareketi olarak tutulur.',
      icon: 'fa-store',
      meta: 'Sube',
    })),
  ]
}

function buildItemOptions(items, metaLabel, icon) {
  return (items || []).map(item => {
    const unit = item.unit || item.recipe_output_unit || ''
    const sku = item.sku || ''
    const extraBits = [sku ? `SKU: ${sku}` : '', unit ? `Birim: ${unit}` : ''].filter(Boolean)

    return {
      value: item.id,
      label: item.name,
      selectedLabel: item.name,
      description: extraBits.join(' | '),
      icon,
      meta: metaLabel,
      searchText: [item.name, sku, unit].filter(Boolean).join(' '),
    }
  })
}

function createEmptyRow() {
  return {
    id: createUuid(),
    itemType: 'stock_item',
    itemId: '',
    quantity: '',
    portionId: STANDARD_PORTION_ID,
  }
}

function createInitialForm(operation, branchId = '') {
  const movementDate = nowDateText()
  const movementTime = nowTimeText()

  return {
    draftId: '',
    savedMovementIds: [],
    branchId,
    movementDate,
    movementTime,
    documentNo: createDocNo(operation.docPrefix, movementDate, movementTime),
    note: '',
    rows: [createEmptyRow()],
  }
}

function normalizeRow(row) {
  return {
    id: row?.id || createUuid(),
    itemType: row?.itemType || 'stock_item',
    itemId: row?.itemId || '',
    quantity: row?.quantity ?? '',
    portionId: row?.portionId || STANDARD_PORTION_ID,
    location_id: row?.location_id || '',
    lpn_id: row?.lpn_id || '',
    lot_number: row?.lot_number || '',
    expiration_date: row?.expiration_date || '',
  }
}

function normalizeDraft(draft) {
  const rows = Array.isArray(draft?.rows) ? draft.rows.map(normalizeRow) : [createEmptyRow()]

  return {
    draftId: draft?.draftId || createUuid(),
    savedMovementIds: [],
    operationKey: draft?.operationKey || 'waste',
    scopeVariant: draft?.scopeVariant || 'branch',
    branchId: draft?.branchId || '',
    branchName: draft?.branchName || '',
    movementDate: draft?.movementDate || nowDateText(),
    movementTime: draft?.movementTime || nowTimeText(),
    documentNo: draft?.documentNo || createDocNo('DOC', draft?.movementDate || nowDateText(), draft?.movementTime || nowTimeText()),
    note: draft?.note || '',
    rows,
    updatedAt: draft?.updatedAt || new Date().toISOString(),
  }
}

function buildSavedDocumentSummaries(rows = []) {
  const groups = new Map()

  for (const row of rows || []) {
    const documentNo = String(row?.source_doc_no || '').trim()
    if (!documentNo) continue

    const existing = groups.get(documentNo) || {
      key: `saved:${documentNo}`,
      documentNo,
      status: 'saved',
      statusLabel: '',
      branchId: row.branch_id || '',
      branchName: row.branch_name || '',
      movementDate: String(row.movement_at || '').slice(0, 10),
      movementTime: new Date(row.movement_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      updatedAt: row.updated_at || row.created_at || row.movement_at,
      lineCount: 0,
    }

    const meta = row?.meta || {}
    const lineKey = String(meta?.document_row_id || row.id || '')
    if (!existing._lineKeys) existing._lineKeys = new Set()
    existing._lineKeys.add(lineKey)
    existing.lineCount = existing._lineKeys.size

    const candidateUpdatedAt = row.updated_at || row.created_at || row.movement_at
    if (candidateUpdatedAt && new Date(candidateUpdatedAt).getTime() > new Date(existing.updatedAt || 0).getTime()) {
      existing.updatedAt = candidateUpdatedAt
    }

    groups.set(documentNo, existing)
  }

  return Array.from(groups.values())
    .map(entry => {
      delete entry._lineKeys
      return entry
    })
    .sort((left, right) => new Date(right.updatedAt || right.movementDate).getTime() - new Date(left.updatedAt || left.movementDate).getTime())
}

function buildDraftDocumentEntries(drafts = []) {
  return drafts.map(draft => ({
    key: `draft:${draft.draftId}`,
    documentNo: draft.documentNo,
    status: 'draft',
    statusLabel: 'Taslak',
    branchId: draft.branchId || '',
    branchName: draft.branchName || '',
    movementDate: draft.movementDate,
    movementTime: draft.movementTime || '',
    updatedAt: draft.updatedAt,
    lineCount: getDraftLineCount(draft),
    draftId: draft.draftId,
  }))
}

function normalizeDrafts(value) {
  return parseMaybeArray(value, [])
    .filter(Boolean)
    .map(normalizeDraft)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

function formatDateLabel(value) {
  if (!value) return '-'
  return new Date(`${value}T00:00:00`).toLocaleDateString('tr-TR')
}

function formatDateTimeLabel(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getLocationKey(scopeVariant, branchId) {
  return `${scopeVariant}:${branchId || 'warehouse'}`
}

function getDraftLocationLabel(draft) {
  return draft?.branchId ? (draft?.branchName || 'Secili sube') : 'Merkez Mutfak / Depo'
}

function hasMeaningfulDraftContent(form) {
  if (String(form?.note || '').trim()) return true
  return (form?.rows || []).some(row => String(row?.itemId || '').trim() || String(row?.quantity || '').trim())
}

function getDraftLineCount(draft) {
  return (draft?.rows || []).filter(row => row?.itemId).length
}

function normalizePortionValue(value, fallback) {
  const normalized = value == null ? '' : String(value).trim()
  return normalized || fallback
}

function getSalePortionOptions(saleItem) {
  const portions = parseMaybeArray(saleItem?.portions, [])

  if (!portions.length) {
    return [
      {
        value: STANDARD_PORTION_ID,
        label: 'Standart',
        selectedLabel: 'Standart',
        description: 'Varsayilan porsiyon',
        icon: 'fa-bowl-food',
        meta: 'Standart',
      },
    ]
  }

  return portions.map((portion, index) => {
    const value = normalizePortionValue(
      portion?.id ?? portion?.portion_id ?? portion?.code ?? portion?.name ?? portion?.label,
      `portion-${index + 1}`,
    )
    const name = portion?.name || portion?.label || portion?.portion_name || `Porsiyon ${index + 1}`
    const multiplier = portion?.multiplier ?? portion?.factor ?? portion?.qty ?? portion?.quantity
    const description = Number.isFinite(Number(multiplier)) ? `Carpan: ${multiplier}` : 'Secilen porsiyon recetesi'

    return {
      value,
      label: name,
      selectedLabel: name,
      description,
      icon: 'fa-bowl-food',
      meta: 'Porsiyon',
      searchText: [name, portion?.code, portion?.portion_name].filter(Boolean).join(' '),
    }
  })
}

function recipeRowMatchesPortion(recipeRow, portionId) {
  const normalizedSelected = normalizePortionValue(portionId, STANDARD_PORTION_ID)
  const rawPortion = recipeRow?.portion_id ?? recipeRow?.portionId ?? recipeRow?.sale_item_portion_id ?? recipeRow?.portion_code ?? recipeRow?.portion_name ?? recipeRow?.portionName

  if (!rawPortion) return true

  const normalizedRow = normalizePortionValue(rawPortion, STANDARD_PORTION_ID)
  if (normalizedSelected === STANDARD_PORTION_ID) {
    return normalizedRow === STANDARD_PORTION_ID
  }

  return normalizedRow === normalizedSelected
}

function buildDraftPayload({ operationKey, scopeVariant, form, branchName }) {
  return normalizeDraft({
    draftId: form.draftId || createUuid(),
    operationKey,
    scopeVariant,
    branchId: form.branchId || '',
    branchName: form.branchId ? branchName || '' : '',
    movementDate: form.movementDate,
    movementTime: form.movementTime,
    documentNo: form.documentNo,
    note: form.note || '',
    rows: form.rows || [],
    updatedAt: new Date().toISOString(),
  })
}

function buildMovementPayload({
  documentLine,
  operation,
  movementAt,
  branchId,
  branchName,
  documentNo,
  note,
  previousBalance,
  lineIndex,
}) {
  const prevQty = safeNumber(previousBalance?.balance_qty_after)
  const prevTotalCost = safeNumber(previousBalance?.balance_total_cost_after)
  const avgUnitCost = safeNumber(
    previousBalance?.avg_unit_cost_after || previousBalance?.unit_cost || (prevQty > 0 ? prevTotalCost / prevQty : 0),
  )
  const quantity = safeNumber(documentLine.quantity)
  const nextQty = prevQty - quantity
  const totalCost = quantity * avgUnitCost
  const nextTotalCost = nextQty * avgUnitCost

  return {
    item_type: documentLine.itemType,
    stock_item_id: documentLine.itemType === 'stock_item' ? documentLine.itemId : null,
    semi_item_id: documentLine.itemType === 'semi_item' ? documentLine.itemId : null,
    item_name: documentLine.itemName,
    item_sku: documentLine.itemSku || null,
    unit: documentLine.unit || null,
    branch_id: branchId || null,
    branch_name: branchName || '',
    movement_type: operation.movementType,
    source_doc_type: operation.sourceDocType,
    direction: 'out',
    movement_at: movementAt,
    quantity,
    source_doc_id: null,
    source_doc_line_id: null,
    source_doc_no: documentNo,
    source_doc_ref: `${operation.sourceDocType}:${lineIndex + 1}`,
    supplier_id: null,
    unit_cost: avgUnitCost,
    total_cost: totalCost,
    avg_unit_cost_after: avgUnitCost,
    balance_qty_after: nextQty,
    balance_total_cost_after: nextTotalCost,
    calc_status: 'calculated',
    location_id: documentLine.location_id || null,
    lpn_id: documentLine.lpn_id || null,
    lot_number: documentLine.lot_number || null,
    expiration_date: documentLine.expiration_date || null,
    notes: note || null,
    meta: {
      operation_key: operation.sourceDocType,
      document_row_id: documentLine.documentRowId,
      row_item_type: documentLine.rowItemType,
      row_item_id: documentLine.rowItemId,
      row_display_name: documentLine.rowDisplayName,
      row_quantity_original: documentLine.rowQuantityOriginal ?? null,
      sale_item_id: documentLine.saleItemId || null,
      sale_item_name: documentLine.saleItemName || null,
      sale_item_portion_id: documentLine.saleItemPortionId || null,
      sale_item_portion_name: documentLine.saleItemPortionName || null,
    },
  }
}

export default function InventoryOperationRecord({ operationKey = 'waste', scopeVariant = 'branch' }) {
  const toast = useToast()
  const {
    scope,
    branchId: workspaceBranchId,
    branchName: workspaceBranchName,
    branches = [],
  } = useWorkspace()

  const isWmsMode = scope === 'anadepo' || scopeVariant === 'anadepo'
  const operation = OPERATION_CONFIG[operationKey] || OPERATION_CONFIG.waste
  const branchLocked = (isBranchScopedScope(scope) || isWmsMode) && !!workspaceBranchId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [locations, setLocations] = useState([])
  const [lpns, setLpns] = useState([])
  const [rowBalances, setRowBalances] = useState({})

  useEffect(() => {
    if (!isWmsMode || !workspaceBranchId) {
      setLocations([])
      setLpns([])
      return
    }
    async function loadWms() {
      try {
        const [{ data: locData }, { data: lpnData }] = await Promise.all([
          db.from('warehouse_locations').select('*').eq('branch_id', workspaceBranchId).eq('is_active', true).order('zone_code'),
          db.from('warehouse_lpns').select('*').eq('branch_id', workspaceBranchId)
        ])
        setLocations(locData || [])
        setLpns(lpnData || [])
      } catch (e) {
        toast('WMS verileri yüklenemedi: ' + e.message, 'error')
      }
    }
    loadWms()
  }, [isWmsMode, workspaceBranchId, toast])

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

  async function fetchItemBalances(rowId, itemId, itemType) {
    if (!isWmsMode || !workspaceBranchId || !itemId || itemType === 'sale_item') {
      setRowBalances(prev => ({ ...prev, [rowId]: [] }))
      return
    }

    try {
      const { data, error } = await db
        .from('inventory_movements')
        .select('quantity, direction, location_id, lpn_id, lot_number, expiration_date, avg_unit_cost_after, unit_cost, meta')
        .eq('branch_id', workspaceBranchId)
        .eq('item_type', itemType)
        .eq(itemType === 'stock_item' ? 'stock_item_id' : 'semi_item_id', itemId)
        .is('deleted_at', null)
        .eq('is_cancelled', false)

      if (error) throw error

      // Aggregate balances
      const balancesMap = new Map()
      for (const m of data || []) {
        const qty = Number(m.quantity || 0)
        const signed = m.direction === 'in' ? qty : -qty

        const meta = typeof m.meta === 'string' ? parseJsonValue(m.meta, {}) : (m.meta || {})
        const status = meta.availability_status || 'available'
        if (status === 'quarantine' || status === 'putaway_pending') continue

        const loc = m.location_id || ''
        const lpn = m.lpn_id || ''
        const lot = m.lot_number || ''
        const exp = m.expiration_date || ''

        const comboKey = `${loc}__${lpn}__${lot}__${exp}`
        if (!balancesMap.has(comboKey)) {
          balancesMap.set(comboKey, {
            location_id: loc || null,
            lpn_id: lpn || null,
            lot_number: lot || null,
            expiration_date: exp || null,
            qty: 0,
          })
        }
        balancesMap.get(comboKey).qty += signed
      }

      const activeBalances = Array.from(balancesMap.values())
        .filter(b => b.qty > 0.0001)

      setRowBalances(prev => ({ ...prev, [rowId]: activeBalances }))
    } catch (e) {
      toast('Bakiye yüklenemedi: ' + e.message, 'error')
    }
  }

  const [stockItems, setStockItems] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [drafts, setDrafts] = useState([])
  const [savedDocuments, setSavedDocuments] = useState([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [listBranchId, setListBranchId] = useState(branchLocked ? workspaceBranchId || '' : '')
  const [form, setForm] = useState(() => createInitialForm(operation, branchLocked ? workspaceBranchId || '' : ''))

  useEffect(() => {
    if (!editorOpen || !isWmsMode) return
    const rows = form.rows || []
    rows.forEach(row => {
      if (row.itemId && !rowBalances[row.id]) {
        fetchItemBalances(row.id, row.itemId, row.itemType)
      }
    })
  }, [editorOpen, form.rows, isWmsMode])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [
          { data: stockData, error: stockError },
          { data: semiData, error: semiError },
          { data: saleData, error: saleError },
          draftValue,
        ] = await Promise.all([
          db
            .from('stock_items')
            .select('id,name,sku,unit')
            .is('deleted_at', null)
            .order('name'),
          db
            .from('semi_items')
            .select('id,name,sku,recipe_output_unit,setting_active')
            .is('deleted_at', null)
            .order('name'),
          db
            .from('sale_items')
            .select('id,name,sku,portions,sale_status')
            .is('deleted_at', null)
            .order('name'),
          readSettingValue(DRAFTS_SETTING_KEY, []),
        ])

        const firstError = stockError || semiError || saleError
        if (firstError) throw firstError
        if (cancelled) return

        setStockItems(stockData || [])
        setSemiItems((semiData || []).filter(item => item.setting_active !== false))
        setSaleItems((saleData || []).filter(item => item.sale_status !== false))
        setDrafts(normalizeDrafts(draftValue))
      } catch (error) {
        if (!cancelled) {
          toast(`Kayit ekrani yuklenemedi: ${error.message}`, 'error')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [toast])

  useEffect(() => {
    if (!branchLocked) return

    setListBranchId(workspaceBranchId || '')
    setForm(current => {
      if (current.branchId === (workspaceBranchId || '')) return current
      return {
        ...current,
        branchId: workspaceBranchId || '',
      }
    })
  }, [branchLocked, workspaceBranchId])

  const branchOptions = useMemo(() => buildBranchOptions(branches), [branches])
  const selectedBranch = useMemo(
    () => branches.find(branch => branch.id === form.branchId) || null,
    [branches, form.branchId],
  )
  const selectedBranchName = selectedBranch?.name || (branchLocked ? workspaceBranchName || '' : '')
  const selectedLocationLabel = form.branchId ? selectedBranchName || 'Secili sube' : 'Merkez Mutfak / Depo'
  const showEditorBranchField = !branchLocked
  const locationKey = useMemo(() => getLocationKey(scopeVariant, listBranchId), [scopeVariant, listBranchId])

  const stockItemOptions = useMemo(
    () => buildItemOptions(stockItems, 'Stok', 'fa-boxes-stacked'),
    [stockItems],
  )
  const semiItemOptions = useMemo(
    () => buildItemOptions(
      semiItems.map(item => ({ ...item, unit: item.recipe_output_unit })),
      'Yari Mamul',
      'fa-layer-group',
    ),
    [semiItems],
  )
  const saleItemOptions = useMemo(
    () => buildItemOptions(saleItems, 'Satis', 'fa-utensils'),
    [saleItems],
  )

  const stockItemsById = useMemo(
    () => new Map(stockItems.map(item => [String(item.id), item])),
    [stockItems],
  )
  const semiItemsById = useMemo(
    () => new Map(semiItems.map(item => [String(item.id), item])),
    [semiItems],
  )
  const saleItemsById = useMemo(
    () => new Map(saleItems.map(item => [String(item.id), item])),
    [saleItems],
  )

  const visibleDrafts = useMemo(
    () => drafts.filter(draft => draft.operationKey === operationKey && draft.scopeVariant === scopeVariant && getLocationKey(draft.scopeVariant, draft.branchId) === locationKey),
    [drafts, operationKey, scopeVariant, locationKey],
  )

  const loadSavedDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    try {
      let query = db
        .from('inventory_movements')
        .select('id,branch_id,branch_name,source_doc_no,source_doc_type,movement_at,updated_at,created_at,meta')
        .eq('source_doc_type', operation.sourceDocType)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .order('ledger_seq', { ascending: false })
        .limit(600)

      query = listBranchId ? query.eq('branch_id', listBranchId) : query.is('branch_id', null)

      const { data, error } = await query
      if (error) throw error
      setSavedDocuments(buildSavedDocumentSummaries(data || []))
    } catch (error) {
      toast(`Belgeler yuklenemedi: ${error.message}`, 'error')
    } finally {
      setLoadingDocuments(false)
    }
  }, [listBranchId, operation.sourceDocType, toast])

  useEffect(() => {
    loadSavedDocuments()
  }, [loadSavedDocuments])

  const documentEntries = useMemo(() => {
    const draftEntries = buildDraftDocumentEntries(visibleDrafts)
    return [...draftEntries, ...savedDocuments]
      .sort((left, right) => new Date(right.updatedAt || right.movementDate).getTime() - new Date(left.updatedAt || left.movementDate).getTime())
  }, [savedDocuments, visibleDrafts])

  function updateForm(updater) {
    setForm(current => {
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
      return {
        ...next,
        documentNo: createDocNo(operation.docPrefix, next.movementDate, next.movementTime || '00:00'),
      }
    })
  }

  function addRow() {
    updateForm(current => ({
      ...current,
      rows: [...(current.rows || []), createEmptyRow()],
    }))
  }

  function removeRow(rowId) {
    updateForm(current => {
      const remainingRows = (current.rows || []).filter(row => row.id !== rowId)
      return {
        ...current,
        rows: remainingRows.length > 0 ? remainingRows : [createEmptyRow()],
      }
    })
  }

  function updateRow(rowId, field, value) {
    updateForm(current => ({
      ...current,
      rows: (current.rows || []).map(row => {
        if (row.id !== rowId) return row

        if (field === 'itemType') {
          setRowBalances(prev => {
            const next = { ...prev }
            delete next[rowId]
            return next
          })
          return {
            ...row,
            itemType: value || 'stock_item',
            itemId: '',
            quantity: '',
            portionId: STANDARD_PORTION_ID,
            location_id: '',
            lpn_id: '',
            lot_number: '',
            expiration_date: '',
          }
        }

        if (field === 'itemId') {
          setRowBalances(prev => {
            const next = { ...prev }
            delete next[rowId]
            return next
          })
          if (row.itemType === 'sale_item') {
            const saleItem = saleItemsById.get(String(value))
            const portionOptions = getSalePortionOptions(saleItem)

            return {
              ...row,
              itemId: value,
              portionId: portionOptions[0]?.value || STANDARD_PORTION_ID,
              location_id: '',
              lpn_id: '',
              lot_number: '',
              expiration_date: '',
            }
          }

          return {
            ...row,
            itemId: value,
            portionId: STANDARD_PORTION_ID,
            location_id: '',
            lpn_id: '',
            lot_number: '',
            expiration_date: '',
          }
        }

        return {
          ...row,
          [field]: value,
        }
      }),
    }))
  }

  function getRowItemOptions(row) {
    if (row.itemType === 'semi_item') return semiItemOptions
    if (row.itemType === 'sale_item') return saleItemOptions
    return stockItemOptions
  }

  function getRowSelectedItem(row) {
    if (row.itemType === 'semi_item') return semiItemsById.get(String(row.itemId)) || null
    if (row.itemType === 'sale_item') return saleItemsById.get(String(row.itemId)) || null
    return stockItemsById.get(String(row.itemId)) || null
  }

  async function persistDrafts(nextDrafts) {
    const normalizedDrafts = normalizeDrafts(nextDrafts)
    setDrafts(normalizedDrafts)
    await writeSettingValue(DRAFTS_SETTING_KEY, normalizedDrafts)
  }

  async function handleSaveDraft() {
    if (!hasMeaningfulDraftContent(form)) {
      toast('Taslak kaydetmek icin en az bir satir veya not girin.', 'info')
      return
    }

    setSavingDraft(true)
    try {
      const draftPayload = buildDraftPayload({
        operationKey,
        scopeVariant,
        form,
        branchName: selectedBranchName,
      })

      const nextDrafts = [...drafts]
      const existingIndex = nextDrafts.findIndex(draft => draft.draftId === draftPayload.draftId)

      if (existingIndex >= 0) nextDrafts[existingIndex] = draftPayload
      else nextDrafts.unshift(draftPayload)

      await persistDrafts(nextDrafts)
      setForm(current => ({ ...current, draftId: draftPayload.draftId }))
      toast(`${operation.title} taslagi kaydedildi.`, 'success')
    } catch (error) {
      toast(`Taslak kaydedilemedi: ${error.message}`, 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  function handleOpenDraft(draft) {
    setForm({
      draftId: draft.draftId,
      savedMovementIds: [],
      branchId: branchLocked ? workspaceBranchId || '' : draft.branchId || '',
      movementDate: draft.movementDate,
      movementTime: draft.movementTime,
      documentNo: draft.documentNo || createDocNo(operation.docPrefix, draft.movementDate, draft.movementTime || '00:00'),
      note: draft.note || '',
      rows: (draft.rows || []).length ? draft.rows.map(normalizeRow) : [createEmptyRow()],
    })
    if (!branchLocked) setListBranchId(draft.branchId || '')
    setEditorOpen(true)
    toast('Taslak belge acildi.', 'info')
  }

  function handleNewDocument() {
    const nextBranchId = branchLocked ? workspaceBranchId || '' : listBranchId || ''
    setForm(createInitialForm(operation, nextBranchId))
    setEditorOpen(true)
  }

  async function handleOpenSavedDocument(entry) {
    try {
      let query = db
        .from('inventory_movements')
        .select('id,branch_id,branch_name,movement_at,source_doc_no,notes,quantity,item_type,stock_item_id,semi_item_id,meta')
        .eq('source_doc_type', operation.sourceDocType)
        .eq('source_doc_no', entry.documentNo)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: true })
        .order('ledger_seq', { ascending: true })

      query = entry.branchId ? query.eq('branch_id', entry.branchId) : query.is('branch_id', null)

      const { data, error } = await query
      if (error) throw error
      if (!data?.length) throw new Error('Belge satirlari bulunamadi.')

      const groupedRows = new Map()

      for (const movement of data) {
        const meta = movement.meta || {}
        const rowKey = String(meta.document_row_id || movement.id)
        const existing = groupedRows.get(rowKey) || {
          id: rowKey,
          itemType: meta.row_item_type || movement.item_type || 'stock_item',
          itemId: String(meta.row_item_id || movement.stock_item_id || movement.semi_item_id || ''),
          quantity: meta.row_quantity_original ?? movement.quantity ?? '',
          portionId: meta.sale_item_portion_id || STANDARD_PORTION_ID,
          location_id: movement.location_id || '',
          lpn_id: movement.lpn_id || '',
          lot_number: movement.lot_number || '',
          expiration_date: movement.expiration_date || '',
        }

        if (existing.itemType === 'sale_item') {
          existing.itemId = String(meta.sale_item_id || meta.row_item_id || '')
          existing.portionId = meta.sale_item_portion_id || STANDARD_PORTION_ID
          existing.quantity = meta.row_quantity_original ?? existing.quantity
        }

        groupedRows.set(rowKey, existing)
      }

      const firstRow = data[0]
      const movementDate = String(firstRow.movement_at || '').slice(0, 10)
      const movementTime = new Date(firstRow.movement_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

      setForm({
        draftId: '',
        savedMovementIds: data.map(row => row.id),
        branchId: branchLocked ? workspaceBranchId || '' : entry.branchId || '',
        movementDate,
        movementTime,
        documentNo: entry.documentNo,
        note: firstRow.notes || '',
        rows: Array.from(groupedRows.values()).map(normalizeRow),
      })

      if (!branchLocked) setListBranchId(entry.branchId || '')
      setEditorOpen(true)
      toast('Kayitli belge duzenleme icin acildi.', 'info')
    } catch (error) {
      toast(`Belge acilamadi: ${error.message}`, 'error')
    }
  }

  function handleOpenDocument(entry) {
    if (entry.status === 'draft') {
      const draft = drafts.find(candidate => candidate.draftId === entry.draftId)
      if (draft) handleOpenDraft(draft)
      return
    }

    handleOpenSavedDocument(entry)
  }

  async function removeDraftById(draftId) {
    if (!window.confirm('Bu taslak silinsin mi?')) return

    try {
      const nextDrafts = drafts.filter(draft => draft.draftId !== draftId)
      await persistDrafts(nextDrafts)

      if (form.draftId === draftId) {
        setForm(createInitialForm(operation, branchLocked ? workspaceBranchId || '' : form.branchId || ''))
        setEditorOpen(false)
      }

      toast('Taslak silindi.', 'success')
    } catch (error) {
      toast(`Taslak silinemedi: ${error.message}`, 'error')
    }
  }

  function validateRows() {
    const rows = form.rows || []
    const meaningfulRows = rows.filter(row => row.itemId || String(row.quantity || '').trim())

    if (!meaningfulRows.length) {
      toast('En az bir satir girin.', 'error')
      return null
    }

    for (const row of meaningfulRows) {
      if (!row.itemType) {
        toast('Malzeme tipi secin.', 'error')
        return null
      }

      if (!row.itemId) {
        toast('Tum satirlarda malzeme secimi yapin.', 'error')
        return null
      }

      if (safeNumber(row.quantity) <= 0) {
        toast('Tum satirlarda miktar sifirdan buyuk olmali.', 'error')
        return null
      }

      if (isWmsMode) {
        if (!row.location_id) {
          toast('WMS modunda tüm satırlarda lokasyon seçilmesi zorunludur.', 'error')
          return null
        }
      }
    }

    return meaningfulRows
  }

  async function expandSaleItemRow(row) {
    const { data, error } = await db
      .from('sale_items')
      .select('id,name,sku,recipe_rows,recipe_output_qty,portions,sale_status')
      .eq('id', row.itemId)
      .single()

    if (error) throw error
    if (!data) throw new Error('Satis mali bulunamadi.')

    const recipeRows = parseMaybeArray(data.recipe_rows, [])
    if (!recipeRows.length) {
      throw new Error(`${data.name} icin recete satiri bulunamadi.`)
    }

    const outputQty = safeNumber(data.recipe_output_qty, 1) || 1
    const portionOptions = getSalePortionOptions(data)
    const selectedPortion = portionOptions.find(option => option.value === (row.portionId || STANDARD_PORTION_ID))
      || portionOptions[0]

    const matchedRows = recipeRows.filter(recipeRow => recipeRowMatchesPortion(recipeRow, selectedPortion?.value || STANDARD_PORTION_ID))
    if (!matchedRows.length) {
      throw new Error(`${data.name} icin secilen porsiyonda recete satiri bulunamadi.`)
    }

    return matchedRows
      .map(recipeRow => {
        const baseQty = safeNumber(recipeRow.qty ?? recipeRow.quantity, 0)
        const expandedQty = (safeNumber(row.quantity) * baseQty) / outputQty
        if (expandedQty <= 0) return null

        if (recipeRow.stock_item_id) {
          const stockItem = stockItemsById.get(String(recipeRow.stock_item_id))
          return {
            itemType: 'stock_item',
            itemId: recipeRow.stock_item_id,
            itemName: stockItem?.name || recipeRow.item_name || data.name,
            itemSku: stockItem?.sku || recipeRow.item_sku || null,
            unit: stockItem?.unit || recipeRow.unit || null,
            quantity: expandedQty,
            documentRowId: row.id,
            rowItemType: 'sale_item',
            rowItemId: row.itemId,
            rowDisplayName: data.name,
            rowQuantityOriginal: safeNumber(row.quantity),
            saleItemId: data.id,
            saleItemName: data.name,
            saleItemPortionId: selectedPortion?.value || STANDARD_PORTION_ID,
            saleItemPortionName: selectedPortion?.label || 'Standart',
          }
        }

        if (recipeRow.semi_item_id) {
          const semiItem = semiItemsById.get(String(recipeRow.semi_item_id))
          return {
            itemType: 'semi_item',
            itemId: recipeRow.semi_item_id,
            itemName: semiItem?.name || recipeRow.item_name || data.name,
            itemSku: semiItem?.sku || recipeRow.item_sku || null,
            unit: semiItem?.recipe_output_unit || recipeRow.unit || null,
            quantity: expandedQty,
            documentRowId: row.id,
            rowItemType: 'sale_item',
            rowItemId: row.itemId,
            rowDisplayName: data.name,
            rowQuantityOriginal: safeNumber(row.quantity),
            saleItemId: data.id,
            saleItemName: data.name,
            saleItemPortionId: selectedPortion?.value || STANDARD_PORTION_ID,
            saleItemPortionName: selectedPortion?.label || 'Standart',
          }
        }

        return null
      })
      .filter(Boolean)
  }

  async function loadLatestBalances(itemType, itemIds, branchId) {
    if (!itemIds.length) return new Map()

    let query = db
      .from('inventory_movements')
      .select('stock_item_id,semi_item_id,unit_cost,balance_qty_after,balance_total_cost_after,avg_unit_cost_after,movement_at,ledger_seq')
      .eq('item_type', itemType)
      .is('deleted_at', null)
      .eq('is_cancelled', false)
      .order('movement_at', { ascending: false })
      .order('ledger_seq', { ascending: false })

    query = itemType === 'stock_item'
      ? query.in('stock_item_id', itemIds)
      : query.in('semi_item_id', itemIds)

    query = branchId
      ? query.eq('branch_id', branchId)
      : query.is('branch_id', null)

    const { data, error } = await query
    if (error) throw error

    const map = new Map()
    for (const row of data || []) {
      const key = String(itemType === 'stock_item' ? row.stock_item_id : row.semi_item_id)
      if (!map.has(key)) map.set(key, row)
    }

    return map
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validatedRows = validateRows()
    if (!validatedRows) return

    setSaving(true)
    try {
      const editingSavedDocument = Array.isArray(form.savedMovementIds) && form.savedMovementIds.length > 0
      const documentLines = []

      for (const row of validatedRows) {
        if (row.itemType === 'sale_item') {
          const expandedRows = await expandSaleItemRow(row)
          const mappedExpanded = expandedRows.map(er => ({
            ...er,
            location_id: row.location_id || null,
            lpn_id: row.lpn_id || null,
            lot_number: row.lot_number || null,
            expiration_date: row.expiration_date || null,
          }))
          documentLines.push(...mappedExpanded)
          continue
        }

        const selectedItem = getRowSelectedItem(row)
        if (!selectedItem) {
          throw new Error('Satirdaki secili malzeme bulunamadi.')
        }

        documentLines.push({
          itemType: row.itemType,
          itemId: row.itemId,
          itemName: selectedItem.name,
          itemSku: selectedItem.sku || null,
          unit: selectedItem.unit || selectedItem.recipe_output_unit || null,
          quantity: safeNumber(row.quantity),
          documentRowId: row.id,
          rowItemType: row.itemType,
          rowItemId: row.itemId,
          rowDisplayName: selectedItem.name,
          rowQuantityOriginal: safeNumber(row.quantity),
          saleItemId: null,
          saleItemName: null,
          saleItemPortionId: null,
          saleItemPortionName: null,
          location_id: row.location_id || null,
          lpn_id: row.lpn_id || null,
          lot_number: row.lot_number || null,
          expiration_date: row.expiration_date || null,
        })
      }

      const uniqueStockIds = Array.from(new Set(documentLines.filter(line => line.itemType === 'stock_item').map(line => line.itemId)))
      const uniqueSemiIds = Array.from(new Set(documentLines.filter(line => line.itemType === 'semi_item').map(line => line.itemId)))

      const [stockBalanceMap, semiBalanceMap] = await Promise.all([
        loadLatestBalances('stock_item', uniqueStockIds, form.branchId),
        loadLatestBalances('semi_item', uniqueSemiIds, form.branchId),
      ])

      const movementAt = `${form.movementDate}T${form.movementTime || '00:00'}:00`
      const branchName = form.branchId ? selectedBranchName || '' : 'Merkez Mutfak / Depo'
      const balanceTracker = new Map()

      for (const [key, value] of stockBalanceMap.entries()) {
        balanceTracker.set(`stock_item:${key}`, value)
      }
      for (const [key, value] of semiBalanceMap.entries()) {
        balanceTracker.set(`semi_item:${key}`, value)
      }

      const movementRows = documentLines.map((line, index) => {
        const balanceKey = `${line.itemType}:${line.itemId}`
        const previousBalance = balanceTracker.get(balanceKey) || null
        const payload = buildMovementPayload({
          documentLine: line,
          operation,
          movementAt,
          branchId: form.branchId || null,
          branchName,
          documentNo: form.documentNo,
          note: form.note?.trim() || null,
          previousBalance,
          lineIndex: index,
        })

        balanceTracker.set(balanceKey, {
          unit_cost: payload.unit_cost,
          avg_unit_cost_after: payload.avg_unit_cost_after,
          balance_qty_after: payload.balance_qty_after,
          balance_total_cost_after: payload.balance_total_cost_after,
        })

        return payload
      })

      if (editingSavedDocument) {
        const timestamp = new Date().toISOString()
        const { error: deleteError } = await db
          .from('inventory_movements')
          .update({
            deleted_at: timestamp,
            updated_at: timestamp,
          })
          .in('id', form.savedMovementIds)

        if (deleteError) throw deleteError
      }

      const { error } = await db.from('inventory_movements').insert(movementRows)
      if (error) throw error

      if (form.draftId) {
        const nextDrafts = drafts.filter(draft => draft.draftId !== form.draftId)
        await persistDrafts(nextDrafts)
      }

      try {
        await db.rpc('process_inventory_recalc_jobs', { p_limit: 200 })
      } catch {
        // Trigger-backed queue still runs; keep save success if immediate processing is unavailable.
      }

      setForm(createInitialForm(operation, branchLocked ? workspaceBranchId || '' : form.branchId || ''))
      setEditorOpen(false)
      await loadSavedDocuments()
      toast(operation.successLabel, 'success')
    } catch (error) {
      toast(`Kayit yapilamadi: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page-enter">
      <Header
        title={operation.title}
        subtitle={scopeVariant === 'warehouse' ? operation.warehouseSubtitle : operation.branchSubtitle}
      />

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="badge" style={{ background: operation.iconBg, color: operation.iconColor }}>
              <i className={`fa-solid ${operation.icon}`} style={{ marginRight: 6 }} />
              {operation.title}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: '#fff7ed', color: '#9a3412' }}>
              <i className="fa-solid fa-folder-open" style={{ marginRight: 6 }} />
              {visibleDrafts.length} taslak
            </span>
            <span className="badge" style={{ background: '#f8fafc', color: '#475569' }}>
              <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }} />
              {documentEntries.length} belge
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          {!branchLocked ? (
            <div style={{ minWidth: 280, maxWidth: 420, flex: '1 1 320px' }}>
              <label className="f-label">Kayit yeri</label>
              <SearchableSelect
                value={listBranchId}
                onChange={value => setListBranchId(value)}
                options={branchOptions}
                placeholder="Kayit yerini secin..."
                searchPlaceholder="Sube ara..."
                noResultsLabel="Kayit yeri bulunamadi"
              />
            </div>
          ) : (
            <div style={{ fontSize: '.83rem', color: '#64748b' }}>
              Tum belgeler listelenir. Taslak belgeler sadece <strong style={{ color: '#b45309' }}>Taslak</strong> etiketiyle ayrisir.
            </div>
          )}

          <AddButton onClick={handleNewDocument} label={`Yeni ${operation.title}`} disabled={loading || saving} />
        </div>

        <div style={{ marginTop: 10, fontSize: '.79rem', color: '#64748b', lineHeight: 1.5 }}>
          Taslak olarak kaydedilen belgeler gun sonu islemine baglandiginda simdilik {AUTO_POST_TIME}'de otomatik kaydedilecek sekilde planlanir.
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>Belgeler</div>
            <div style={{ fontSize: '.79rem', color: '#64748b', marginTop: 3 }}>
              Taslak ve kaydedilmis belgeler ayni listede gorunur. Duzenle ile ayni editor acilir.
            </div>
          </div>
        </div>

        {documentEntries.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl" style={{ minWidth: branchLocked ? 760 : 900 }}>
              <thead>
                <tr>
                  <th>Belge no</th>
                  {!branchLocked ? <th>Kayit yeri</th> : null}
                  <th>Tarih</th>
                  <th>Satir</th>
                  <th>Durum</th>
                  <th>Son guncelleme</th>
                  <th>Islem</th>
                </tr>
              </thead>
              <tbody>
                {documentEntries.map(entry => (
                  <tr key={entry.key}>
                    <td style={{ fontWeight: 800, color: '#0f172a' }}>{entry.documentNo}</td>
                    {!branchLocked ? <td>{entry.branchName || 'Merkez Mutfak / Depo'}</td> : null}
                    <td>{formatDateLabel(entry.movementDate)} {entry.movementTime || ''}</td>
                    <td>{entry.lineCount}</td>
                    <td>
                      {entry.status === 'draft' ? (
                        <span className="badge" style={{ background: '#fff7ed', color: '#b45309' }}>Taslak</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>
                    <td>{formatDateTimeLabel(entry.updatedAt)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn-o" type="button" onClick={() => handleOpenDocument(entry)}>
                          <i className="fa-solid fa-pen-to-square" /> Duzenle
                        </button>
                        {entry.status === 'draft' ? (
                          <button className="btn-o" type="button" onClick={() => removeDraftById(entry.draftId)}>
                          <i className="fa-solid fa-trash" /> Sil
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '14px 16px', color: '#94a3b8', background: '#f8fafc', fontSize: '.82rem' }}>
            Henuz belge yok.
          </div>
        )}
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={form.draftId ? `${operation.title} Duzenle` : `Yeni ${operation.title}`}
        subtitle={null}
        width={1180}
        flex
      >
        <form id="inventory-operation-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 16, marginBottom: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: showEditorBranchField ? 'minmax(0, 1.1fr) repeat(3, minmax(150px, .6fr))' : 'repeat(3, minmax(180px, .7fr)) minmax(220px, .9fr)', gap: 12 }}>
              {showEditorBranchField ? (
                <div>
                  <label className="f-label">Kayit yeri</label>
                  <SearchableSelect
                    value={form.branchId}
                    onChange={value => updateForm(current => ({ ...current, branchId: value }))}
                    options={branchOptions}
                    placeholder="Kayit yerini secin..."
                    searchPlaceholder="Sube ara..."
                    noResultsLabel="Kayit yeri bulunamadi"
                  />
                </div>
              ) : null}

              <div>
                <label className="f-label">Tarih</label>
                <input className="f-input" type="date" value={form.movementDate} onChange={event => updateForm(current => ({ ...current, movementDate: event.target.value }))} />
              </div>

              <div>
                <label className="f-label">Saat</label>
                <input className="f-input" type="time" value={form.movementTime} onChange={event => updateForm(current => ({ ...current, movementTime: event.target.value }))} />
              </div>

              <div>
                <label className="f-label">Belge no</label>
                <div className="f-input" style={{ display: 'flex', alignItems: 'center', minHeight: 36, color: '#0f172a', background: '#f8fafc', fontWeight: 800 }}>
                  {form.documentNo}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Belge Satirlari</div>
                <div style={{ fontSize: '.79rem', color: '#64748b', marginTop: 3 }}>
                  Stok mali, yari mamul ve satis mali satirlarini ayni belge icinde yonetin.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-o" type="button" onClick={addRow}>
                  <i className="fa-solid fa-plus" /> Satir Ekle
                </button>
              </div>
            </div>

            <div>
              <label className="f-label">Belge notu</label>
              <input
                className="f-input"
                type="text"
                value={form.note}
                onChange={event => updateForm(current => ({ ...current, note: event.target.value }))}
                placeholder="Istege bagli belge notu..."
              />
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', overflow: 'visible' }}>
              <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
                <table className="tbl" style={{ minWidth: isWmsMode ? 1280 : 980, marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: isWmsMode ? '10%' : '19%' }}>Malzeme Tipi</th>
                      <th style={{ width: isWmsMode ? '20%' : '36%' }}>Malzeme</th>
                      {isWmsMode && (
                        <>
                          <th style={{ width: '18%' }}>Mevcut Stoklar</th>
                          <th style={{ width: '12%' }}>Lokasyon *</th>
                          <th style={{ width: '10%' }}>LPN</th>
                          <th style={{ width: '12%' }}>Lot / SKT</th>
                        </>
                      )}
                      <th style={{ width: isWmsMode ? '10%' : '18%' }}>Porsiyon</th>
                      <th style={{ width: isWmsMode ? '8%' : '15%' }}>Miktar</th>
                      <th style={{ width: isWmsMode ? '5%' : '12%' }}>Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.rows || []).map(row => {
                      const selectedItem = getRowSelectedItem(row)
                      const salePortionOptions = row.itemType === 'sale_item' ? getSalePortionOptions(selectedItem) : []
                      const balancesList = rowBalances[row.id] || []

                      return (
                        <tr key={row.id}>
                          <td style={{ verticalAlign: 'top' }}>
                            <SearchableSelect
                              value={row.itemType}
                              onChange={value => updateRow(row.id, 'itemType', value)}
                              options={ITEM_TYPE_OPTIONS}
                              placeholder="Malzeme tipi secin..."
                              searchPlaceholder="Tip ara..."
                              allowClear={false}
                              noResultsLabel="Malzeme tipi bulunamadi"
                            />
                          </td>

                          <td style={{ verticalAlign: 'top' }}>
                            <SearchableSelect
                              value={row.itemId}
                              onChange={value => updateRow(row.id, 'itemId', value)}
                              options={getRowItemOptions(row)}
                              placeholder={loading ? 'Listeler yukleniyor...' : 'Malzeme secin...'}
                              searchPlaceholder="Malzeme ara..."
                              noResultsLabel="Secilen tipe ait kayit bulunamadi"
                              disabled={loading}
                            />
                          </td>

                          {isWmsMode && (
                            <>
                              {/* Mevcut Stoklar Select */}
                              <td style={{ verticalAlign: 'top' }}>
                                <select
                                  className="f-input"
                                  style={{ padding: '6px', fontSize: '.8rem' }}
                                  value=""
                                  onChange={e => {
                                    if (!e.target.value) return
                                    const selectedBal = balancesList[Number(e.target.value)]
                                    if (selectedBal) {
                                      updateRow(row.id, 'location_id', selectedBal.location_id || '')
                                      updateRow(row.id, 'lpn_id', selectedBal.lpn_id || '')
                                      updateRow(row.id, 'lot_number', selectedBal.lot_number || '')
                                      updateRow(row.id, 'expiration_date', selectedBal.expiration_date || '')
                                    }
                                  }}
                                  disabled={balancesList.length === 0}
                                >
                                  <option value="">
                                    {balancesList.length === 0 ? 'Stok Yok' : `Seçiniz (${balancesList.length} bky)`}
                                  </option>
                                  {balancesList.map((bal, idx) => {
                                    const locName = formatAddress(locations.find(l => l.id === bal.location_id))
                                    const lpnName = lpns.find(lp => lp.id === bal.lpn_id)?.lpn_code || 'Yok'
                                    return (
                                      <option key={idx} value={idx}>
                                        {`${locName} | LPN: ${lpnName} | Lot: ${bal.lot_number || 'Yok'} | SKT: ${bal.expiration_date || 'Yok'} | Bky: ${bal.qty}`}
                                      </option>
                                    )
                                  })}
                                </select>
                              </td>

                              {/* Lokasyon Select */}
                              <td style={{ verticalAlign: 'top' }}>
                                <select
                                  className="f-input"
                                  style={{ padding: '6px', fontSize: '.8rem' }}
                                  value={row.location_id || ''}
                                  onChange={e => updateRow(row.id, 'location_id', e.target.value)}
                                >
                                  <option value="">Seçiniz *</option>
                                  {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{formatAddress(loc)}</option>
                                  ))}
                                </select>
                              </td>

                              {/* LPN Select */}
                              <td style={{ verticalAlign: 'top' }}>
                                <select
                                  className="f-input"
                                  style={{ padding: '6px', fontSize: '.8rem' }}
                                  value={row.lpn_id || ''}
                                  onChange={e => updateRow(row.id, 'lpn_id', e.target.value)}
                                >
                                  <option value="">Yok</option>
                                  {lpns.map(lpn => (
                                    <option key={lpn.id} value={lpn.id}>{lpn.lpn_code}</option>
                                  ))}
                                </select>
                              </td>

                              {/* Lot & SKT Inputs */}
                              <td style={{ verticalAlign: 'top' }}>
                                <div style={{ display: 'grid', gap: 4 }}>
                                  <input
                                    className="f-input"
                                    style={{ padding: '4px 6px', fontSize: '.78rem' }}
                                    placeholder="Lot No"
                                    value={row.lot_number || ''}
                                    onChange={e => updateRow(row.id, 'lot_number', e.target.value)}
                                  />
                                  <input
                                    type="date"
                                    className="f-input"
                                    style={{ padding: '4px 6px', fontSize: '.78rem' }}
                                    value={row.expiration_date || ''}
                                    onChange={e => updateRow(row.id, 'expiration_date', e.target.value)}
                                  />
                                </div>
                              </td>
                            </>
                          )}

                          <td style={{ verticalAlign: 'top' }}>
                            {row.itemType === 'sale_item' && salePortionOptions.length > 0 ? (
                              <SearchableSelect
                                value={row.portionId || STANDARD_PORTION_ID}
                                onChange={value => updateRow(row.id, 'portionId', value)}
                                options={salePortionOptions}
                                placeholder="Porsiyon secin..."
                                searchPlaceholder="Porsiyon ara..."
                                allowClear={false}
                                noResultsLabel="Porsiyon bulunamadi"
                              />
                            ) : (
                              <div className="f-input" style={{ display: 'flex', alignItems: 'center', minHeight: 36, color: '#94a3b8', background: '#f8fafc' }}>
                                Standart
                              </div>
                            )}
                          </td>

                          <td style={{ verticalAlign: 'top' }}>
                            <input
                              className="f-input"
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.quantity}
                              onChange={event => updateRow(row.id, 'quantity', event.target.value)}
                              placeholder="0,000"
                            />
                          </td>

                          <td style={{ verticalAlign: 'top' }}>
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="ico-btn del"
                                onClick={() => removeRow(row.id)}
                                title="Satiri kaldir"
                                disabled={(form.rows || []).length <= 1}
                              >
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.8rem', color: '#64748b' }}>
                Belge kaydedildiginde tum satirlar ayni belge no altinda tek seferde islenir.
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn-o"
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || saving || loading}
                >
                  <i className={`fa-solid ${savingDraft ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} /> {operation.draftLabel}
                </button>
                <button className="btn-o" type="button" onClick={() => setEditorOpen(false)} disabled={saving || savingDraft}>
                  Kapat
                </button>
                <button className="btn-p" type="submit" disabled={saving || loading}>
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : operation.icon}`} />
                  {operation.submitLabel}
                </button>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  )
}
