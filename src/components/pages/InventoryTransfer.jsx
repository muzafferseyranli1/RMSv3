import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import { useWorkspace } from '@/context/WorkspaceContext'
import { readSettingValue, writeSettingValue } from '@/lib/settingsStore'
import { db } from '@/lib/db'
import { loadBranchContextsFromDb } from '@/lib/branchContexts'

const DRAFTS_SETTING_KEY = 'inventory_transfer_drafts_v1'
const STANDARD_PORTION_ID = '__standart__'
const TRANSFER_SOURCE_DOC_TYPE = 'transfer'
const TRANSFER_PENDING = 'pending'
const TRANSFER_ACCEPTED = 'accepted'
const TRANSFER_REJECTED = 'rejected'
const WAREHOUSE_SCOPE = 'warehouse'
const WAREHOUSE_LABEL = 'Merkez Mutfak / Depo'

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
    description: 'Receteye gore component transferi',
    icon: 'fa-utensils',
    meta: 'Satis',
  },
]

const STATUS_META = {
  [TRANSFER_PENDING]: { label: 'Yolda', color: '#92400e', bg: '#fef3c7' },
  [TRANSFER_ACCEPTED]: { label: 'Kabul Edildi', color: '#166534', bg: '#dcfce7' },
  [TRANSFER_REJECTED]: { label: 'Reddedildi', color: '#b91c1c', bg: '#fee2e2' },
  draft: { label: 'Taslak', color: '#b45309', bg: '#fff7ed' },
}

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

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function normalizeUuidOrNull(value) {
  const text = String(value || '').trim()
  return isUuidLike(text) ? text : null
}

function normalizeLookupText(value) {
  return String(value || '').trim()
}

function buildBalanceLookupKey(itemType, itemId, itemName = '') {
  const uuid = normalizeUuidOrNull(itemId)
  if (uuid) return `${itemType}:id:${uuid}`
  const name = normalizeLookupText(itemName)
  return name ? `${itemType}:name:${name}` : `${itemType}:unknown`
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

function createDocNo(dateText, timeText) {
  const compactDate = String(dateText || '').replaceAll('-', '')
  const compactTime = String(timeText || '').replaceAll(':', '')
  return `TR-${compactDate}${compactTime}`
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

function getBranchLabel(branchName) {
  return branchName || WAREHOUSE_LABEL
}

function createEmptyRow() {
  return {
    id: createUuid(),
    itemType: 'stock_item',
    itemId: '',
    quantity: '',
    portionId: STANDARD_PORTION_ID,
    baseUnitCost: '',
    unitCost: '',
    useCustomPrice: false,
  }
}

function normalizeRow(row) {
  return {
    id: row?.id || createUuid(),
    itemType: row?.itemType || 'stock_item',
    itemId: row?.itemId || '',
    quantity: row?.quantity ?? '',
    portionId: row?.portionId || STANDARD_PORTION_ID,
    baseUnitCost: row?.baseUnitCost ?? '',
    unitCost: row?.unitCost ?? '',
    useCustomPrice: Boolean(row?.useCustomPrice),
  }
}

function createInitialForm(actorMeta, destinationOptions = []) {
  const movementDate = nowDateText()
  const movementTime = nowTimeText()
  const firstDestination = destinationOptions[0] || null

  return {
    draftId: '',
    savedMovementIds: [],
    documentStatus: TRANSFER_PENDING,
    movementDate,
    movementTime,
    documentNo: createDocNo(movementDate, movementTime),
    note: '',
    destinationScope: firstDestination?.scope || '',
    destinationBranchId: firstDestination?.branchId || '',
    destinationName: firstDestination?.label || '',
    rows: [createEmptyRow()],
    originSnapshot: actorMeta,
  }
}

function normalizeDraft(draft) {
  const rows = Array.isArray(draft?.rows) ? draft.rows.map(normalizeRow) : [createEmptyRow()]

  return {
    draftId: draft?.draftId || createUuid(),
    scopeVariant: draft?.scopeVariant || 'branch',
    originScope: draft?.originScope || 'branch',
    originBranchId: draft?.originBranchId || '',
    originBranchName: draft?.originBranchName || '',
    originLegalEntityId: draft?.originLegalEntityId || '',
    originLegalEntityName: draft?.originLegalEntityName || '',
    movementDate: draft?.movementDate || nowDateText(),
    movementTime: draft?.movementTime || nowTimeText(),
    documentNo: draft?.documentNo || createDocNo(draft?.movementDate || nowDateText(), draft?.movementTime || nowTimeText()),
    destinationScope: draft?.destinationScope || '',
    destinationBranchId: draft?.destinationBranchId || '',
    destinationName: draft?.destinationName || '',
    destinationLegalEntityId: draft?.destinationLegalEntityId || '',
    destinationLegalEntityName: draft?.destinationLegalEntityName || '',
    note: draft?.note || '',
    rows,
    updatedAt: draft?.updatedAt || new Date().toISOString(),
  }
}

function normalizeDrafts(value) {
  return parseMaybeArray(value, [])
    .filter(Boolean)
    .map(normalizeDraft)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
}

function hasMeaningfulDraftContent(form) {
  if (String(form?.note || '').trim()) return true
  return (form?.rows || []).some(row => String(row?.itemId || '').trim() || String(row?.quantity || '').trim())
}

function getDraftLineCount(draft) {
  return (draft?.rows || []).filter(row => row?.itemId).length
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

function normalizePortionValue(value, fallback) {
  const normalized = value == null ? '' : String(value).trim()
  return normalized || fallback
}

function getSalePortionOptions(saleItem) {
  const portions = parseMaybeArray(saleItem?.portions, [])

  if (!portions.length) {
    return [{
      value: STANDARD_PORTION_ID,
      label: 'Standart',
      selectedLabel: 'Standart',
      description: 'Varsayilan porsiyon',
      icon: 'fa-bowl-food',
      meta: 'Standart',
    }]
  }

  return portions.map((portion, index) => {
    const value = normalizePortionValue(
      portion?.id ?? portion?.portion_id ?? portion?.code ?? portion?.name ?? portion?.label,
      `portion-${index + 1}`,
    )
    const name = portion?.name || portion?.label || portion?.portion_name || `Porsiyon ${index + 1}`

    return {
      value,
      label: name,
      selectedLabel: name,
      description: 'Secilen porsiyon recetesi',
      icon: 'fa-bowl-food',
      meta: 'Porsiyon',
      searchText: [name, portion?.code, portion?.portion_name].filter(Boolean).join(' '),
    }
  })
}

function recipeRowMatchesPortion(recipeRow, portionId) {
  const normalizedSelected = normalizePortionValue(portionId, STANDARD_PORTION_ID)
  const rawPortion = recipeRow?.portion_id ?? recipeRow?.portionId ?? recipeRow?.sale_item_portion_id ?? recipeRow?.portion_code ?? recipeRow?.portion_name ?? recipeRow?.portionName

  if (!rawPortion) return normalizedSelected === STANDARD_PORTION_ID
  return normalizePortionValue(rawPortion, STANDARD_PORTION_ID) === normalizedSelected
}

function buildDraftPayload({ scopeVariant, form, actorMeta, destinationMeta }) {
  return normalizeDraft({
    draftId: form.draftId || createUuid(),
    scopeVariant,
    originScope: actorMeta.scope,
    originBranchId: actorMeta.branchId || '',
    originBranchName: actorMeta.branchName || '',
    originLegalEntityId: actorMeta.legalEntityId || '',
    originLegalEntityName: actorMeta.legalEntityName || '',
    movementDate: form.movementDate,
    movementTime: form.movementTime,
    documentNo: form.documentNo,
    destinationScope: destinationMeta?.scope || '',
    destinationBranchId: destinationMeta?.branchId || '',
    destinationName: destinationMeta?.label || '',
    destinationLegalEntityId: destinationMeta?.legalEntityId || '',
    destinationLegalEntityName: destinationMeta?.legalEntityName || '',
    note: form.note || '',
    rows: form.rows || [],
    updatedAt: new Date().toISOString(),
  })
}

function buildDestinationOptions(branchContexts = [], actorMeta) {
  const options = []

  if (actorMeta.scope !== WAREHOUSE_SCOPE) {
    options.push({
      value: 'warehouse',
      branchId: '',
      scope: WAREHOUSE_SCOPE,
      label: WAREHOUSE_LABEL,
      selectedLabel: WAREHOUSE_LABEL,
      description: 'Merkez depo / mutfak transfer hedefi',
      icon: 'fa-warehouse',
      meta: 'Merkez',
      legalEntityId: '',
      legalEntityName: '',
    })
  }

  for (const branch of branchContexts || []) {
    if (actorMeta.scope === 'branch' && String(branch.branchId) === String(actorMeta.branchId || '')) continue
    options.push({
      value: String(branch.branchId),
      branchId: String(branch.branchId),
      scope: 'branch',
      label: branch.branchName,
      selectedLabel: branch.branchName,
      description: [branch.legalEntityName, branch.companyName].filter(Boolean).join(' | '),
      icon: 'fa-store',
      meta: 'Sube',
      legalEntityId: branch.legalEntityId || '',
      legalEntityName: branch.legalEntityName || '',
    })
  }

  return options.sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'tr'))
}

function buildActorMeta(scopeVariant, workspaceBranchId, workspaceBranchName, branchContexts = []) {
  if (scopeVariant === WAREHOUSE_SCOPE) {
    return {
      scope: WAREHOUSE_SCOPE,
      branchId: '',
      branchName: WAREHOUSE_LABEL,
      legalEntityId: '',
      legalEntityName: '',
    }
  }

  const branchContext = (branchContexts || []).find(branch => String(branch.branchId) === String(workspaceBranchId || ''))
  return {
    scope: 'branch',
    branchId: workspaceBranchId || '',
    branchName: workspaceBranchName || branchContext?.branchName || '',
    legalEntityId: branchContext?.legalEntityId || '',
    legalEntityName: branchContext?.legalEntityName || '',
  }
}

function isRelevantTransferRow(row, actorMeta) {
  const meta = row?.meta || {}
  if (actorMeta.scope === WAREHOUSE_SCOPE) {
    return row?.branch_id == null || meta?.origin_scope === WAREHOUSE_SCOPE || meta?.destination_scope === WAREHOUSE_SCOPE
  }

  const actorBranchId = String(actorMeta.branchId || '')
  return (
    String(row?.branch_id || '') === actorBranchId ||
    String(meta?.origin_branch_id || '') === actorBranchId ||
    String(meta?.destination_branch_id || '') === actorBranchId
  )
}

function buildSavedDocumentSummaries(rows = [], actorMeta) {
  const groups = new Map()

  for (const row of rows || []) {
    if (!isRelevantTransferRow(row, actorMeta)) continue

    const documentNo = String(row?.source_doc_no || '').trim()
    if (!documentNo) continue
    const meta = row?.meta || {}

    const existing = groups.get(documentNo) || {
      key: `saved:${documentNo}`,
      documentNo,
      status: meta.transfer_status || TRANSFER_PENDING,
      movementDate: String(row.movement_at || '').slice(0, 10),
      movementTime: new Date(row.movement_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
      updatedAt: row.updated_at || row.created_at || row.movement_at,
      lineCount: 0,
      originScope: meta.origin_scope || '',
      originBranchId: meta.origin_branch_id || '',
      originBranchName: meta.origin_branch_name || WAREHOUSE_LABEL,
      destinationScope: meta.destination_scope || '',
      destinationBranchId: meta.destination_branch_id || '',
      destinationName: meta.destination_branch_name || WAREHOUSE_LABEL,
      originLegalEntityId: meta.origin_legal_entity_id || '',
      originLegalEntityName: meta.origin_legal_entity_name || '',
      destinationLegalEntityId: meta.destination_legal_entity_id || '',
      destinationLegalEntityName: meta.destination_legal_entity_name || '',
      note: row.notes || '',
      savedMovementIds: [],
      _lineKeys: new Set(),
    }

    existing.savedMovementIds.push(row.id)
    const lineKey = String(meta.document_row_id || row.id || '')
    if (lineKey) existing._lineKeys.add(lineKey)
    existing.lineCount = existing._lineKeys.size || existing.lineCount

    const candidateUpdatedAt = row.updated_at || row.created_at || row.movement_at
    if (candidateUpdatedAt && new Date(candidateUpdatedAt).getTime() > new Date(existing.updatedAt || 0).getTime()) {
      existing.updatedAt = candidateUpdatedAt
      existing.status = meta.transfer_status || existing.status
    }

    groups.set(documentNo, existing)
  }

  return Array.from(groups.values())
    .map(entry => {
      const actorIsOrigin = actorMeta.scope === entry.originScope && String(actorMeta.branchId || '') === String(entry.originBranchId || '')
      const actorIsDestination = actorMeta.scope === entry.destinationScope && String(actorMeta.branchId || '') === String(entry.destinationBranchId || '')
      const status = entry.status || TRANSFER_PENDING

      delete entry._lineKeys

      return {
        ...entry,
        statusLabel: STATUS_META[status]?.label || status,
        actorIsOrigin,
        actorIsDestination,
        canEdit: status !== TRANSFER_PENDING && actorIsOrigin,
        canAccept: status === TRANSFER_PENDING && actorIsDestination,
        canReject: status === TRANSFER_PENDING && actorIsDestination,
        senderLocked: status === TRANSFER_PENDING && actorIsOrigin && !actorIsDestination,
      }
    })
    .sort((left, right) => new Date(right.updatedAt || right.movementDate).getTime() - new Date(left.updatedAt || left.movementDate).getTime())
}

function buildDraftDocumentEntries(drafts = []) {
  return drafts.map(draft => ({
    key: `draft:${draft.draftId}`,
    documentNo: draft.documentNo,
    status: 'draft',
    statusLabel: STATUS_META.draft.label,
    movementDate: draft.movementDate,
    movementTime: draft.movementTime || '',
    updatedAt: draft.updatedAt,
    lineCount: getDraftLineCount(draft),
    draftId: draft.draftId,
    originScope: draft.originScope,
    originBranchId: draft.originBranchId,
    originBranchName: draft.originBranchName || WAREHOUSE_LABEL,
    destinationScope: draft.destinationScope,
    destinationBranchId: draft.destinationBranchId,
    destinationName: draft.destinationName || WAREHOUSE_LABEL,
    canEdit: true,
    canAccept: false,
    canReject: false,
    senderLocked: false,
  }))
}

function sameEntity(origin, destination) {
  if (!origin?.legalEntityId || !destination?.legalEntityId) return true
  return String(origin.legalEntityId) === String(destination.legalEntityId)
}

function buildStatusBadge(status) {
  const meta = STATUS_META[status] || STATUS_META.draft
  return (
    <span className="badge" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  )
}

async function loadLatestBalance(itemType, itemId, branchId) {
  const descriptor = typeof itemId === 'object' && itemId
    ? { itemId: itemId.itemId || itemId.id, itemName: itemId.itemName || itemId.name || '' }
    : { itemId, itemName: '' }

  const itemUuid = normalizeUuidOrNull(descriptor.itemId)
  const itemName = normalizeLookupText(descriptor.itemName)
  if (!itemUuid && !itemName) return null

  const branchMeta = typeof branchId === 'object' && branchId
    ? { branchId: branchId.branchId, branchName: branchId.branchName || '' }
    : { branchId, branchName: '' }
  const branchUuid = normalizeUuidOrNull(branchMeta.branchId)
  const branchName = normalizeLookupText(branchMeta.branchName)

  const createBaseQuery = () => {
    let query = db
      .from('inventory_movements')
      .select('id,item_name,unit_cost,avg_unit_cost_after,balance_qty_after,balance_total_cost_after,movement_at,ledger_seq')
      .eq('item_type', itemType)
      .is('deleted_at', null)
      .eq('is_cancelled', false)
      .order('movement_at', { ascending: false })
      .order('ledger_seq', { ascending: false })
      .limit(1)

    if (branchUuid) query = query.eq('branch_id', branchUuid)
    else if (branchName) query = query.eq('branch_name', branchName)
    else query = query.is('branch_id', null)

    return query
  }

  const idColumn = itemType === 'stock_item' ? 'stock_item_id' : 'semi_item_id'
  const query = itemUuid
    ? createBaseQuery().eq(idColumn, itemUuid)
    : createBaseQuery().eq('item_name', itemName)

  const { data, error } = await query
  if (error) throw error
  return data?.[0] || null
}

async function loadLatestBalances(itemType, itemIds, branchId) {
  const descriptors = (itemIds || [])
    .map(item => (typeof item === 'object' && item
      ? { itemId: item.itemId || item.id, itemName: item.itemName || item.name || '' }
      : { itemId: item, itemName: '' }))
    .map(item => ({
      itemId: String(item.itemId || '').trim(),
      itemName: normalizeLookupText(item.itemName),
    }))
    .filter(item => item.itemId || item.itemName)

  if (!descriptors.length) return new Map()

  const branchMeta = typeof branchId === 'object' && branchId
    ? { branchId: branchId.branchId, branchName: branchId.branchName || '' }
    : { branchId, branchName: '' }
  const branchUuid = normalizeUuidOrNull(branchMeta.branchId)
  const branchName = normalizeLookupText(branchMeta.branchName)
  const idColumn = itemType === 'stock_item' ? 'stock_item_id' : 'semi_item_id'

  const createBaseQuery = () => {
    let query = db
      .from('inventory_movements')
      .select(`item_name,${idColumn},unit_cost,avg_unit_cost_after,balance_qty_after,balance_total_cost_after,movement_at,ledger_seq`)
      .eq('item_type', itemType)
      .is('deleted_at', null)
      .eq('is_cancelled', false)
      .order('movement_at', { ascending: false })
      .order('ledger_seq', { ascending: false })

    if (branchUuid) query = query.eq('branch_id', branchUuid)
    else if (branchName) query = query.eq('branch_name', branchName)
    else query = query.is('branch_id', null)

    return query
  }

  const uuidIds = Array.from(new Set(descriptors.map(item => normalizeUuidOrNull(item.itemId)).filter(Boolean)))
  const itemNames = Array.from(new Set(descriptors.map(item => item.itemName).filter(Boolean)))

  const results = []
  if (uuidIds.length) {
    const { data, error } = await createBaseQuery().in(idColumn, uuidIds)
    if (error) throw error
    results.push(...(data || []))
  }
  if (itemNames.length) {
    const { data, error } = await createBaseQuery().in('item_name', itemNames)
    if (error) throw error
    results.push(...(data || []))
  }

  const map = new Map()
  for (const row of results) {
    const key = buildBalanceLookupKey(itemType, row[idColumn], row.item_name)
    if (!map.has(key)) map.set(key, row)
  }
  return map
}

function createMovementPayload({
  line,
  movementType,
  direction,
  movementAt,
  branchId,
  branchName,
  previousBalance,
  documentNo,
  note,
  meta,
}) {
  const prevQty = safeNumber(previousBalance?.balance_qty_after)
  const prevTotalCost = safeNumber(previousBalance?.balance_total_cost_after)
  const avgUnitCost = safeNumber(
    line.unitCost ?? previousBalance?.avg_unit_cost_after ?? previousBalance?.unit_cost ?? (prevQty > 0 ? prevTotalCost / prevQty : 0),
  )
  const quantity = safeNumber(line.quantity)
  const signedQty = direction === 'out' ? -quantity : quantity
  const totalCost = quantity * avgUnitCost
  const signedTotalCost = direction === 'out' ? -totalCost : totalCost
  const nextQty = prevQty + signedQty
  const nextTotalCost = prevTotalCost + signedTotalCost
  const nextAvg = nextQty > 0 ? nextTotalCost / nextQty : avgUnitCost

  return {
    item_type: line.itemType,
    stock_item_id: line.itemType === 'stock_item' ? normalizeUuidOrNull(line.itemId) : null,
    semi_item_id: line.itemType === 'semi_item' ? normalizeUuidOrNull(line.itemId) : null,
    item_name: line.itemName,
    item_sku: line.itemSku || null,
    unit: line.unit || null,
    branch_id: normalizeUuidOrNull(branchId),
    branch_name: branchName || '',
    movement_type: movementType,
    source_doc_type: TRANSFER_SOURCE_DOC_TYPE,
    direction,
    movement_at: movementAt,
    quantity,
    source_doc_id: null,
    source_doc_line_id: null,
    source_doc_no: documentNo,
    source_doc_ref: `transfer:${line.documentRowId}`,
    supplier_id: null,
    unit_cost: avgUnitCost,
    total_cost: totalCost,
    avg_unit_cost_after: nextAvg,
    balance_qty_after: nextQty,
    balance_total_cost_after: nextTotalCost,
    calc_status: 'calculated',
    notes: note || null,
    meta,
  }
}

export default function InventoryTransfer({ scopeVariant = 'branch' }) {
  const toast = useToast()
  const { branchId: workspaceBranchId, branchName: workspaceBranchName } = useWorkspace()
  const actorScope = scopeVariant === WAREHOUSE_SCOPE ? WAREHOUSE_SCOPE : 'branch'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [stockItems, setStockItems] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [drafts, setDrafts] = useState([])
  const [savedDocuments, setSavedDocuments] = useState([])
  const [branchContexts, setBranchContexts] = useState([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [formMode, setFormMode] = useState('edit')

  const actorMeta = useMemo(
    () => buildActorMeta(actorScope, workspaceBranchId, workspaceBranchName, branchContexts),
    [actorScope, workspaceBranchId, workspaceBranchName, branchContexts],
  )
  const destinationOptions = useMemo(() => buildDestinationOptions(branchContexts, actorMeta), [branchContexts, actorMeta])
  const [form, setForm] = useState(() => createInitialForm(actorMeta, destinationOptions))

  useEffect(() => {
    setForm(current => {
      if (current.originSnapshot?.scope === actorMeta.scope && String(current.originSnapshot?.branchId || '') === String(actorMeta.branchId || '')) {
        return current
      }
      return createInitialForm(actorMeta, destinationOptions)
    })
  }, [actorMeta, destinationOptions])

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
          loadedBranchContexts,
        ] = await Promise.all([
          db.from('stock_items').select('id,name,sku,unit').is('deleted_at', null).order('name'),
          db.from('semi_items').select('id,name,sku,recipe_output_unit,setting_active').is('deleted_at', null).order('name'),
          db.from('sale_items').select('id,name,sku,portions,sale_status').is('deleted_at', null).order('name'),
          readSettingValue(DRAFTS_SETTING_KEY, []),
          loadBranchContextsFromDb(),
        ])

        const firstError = stockError || semiError || saleError
        if (firstError) throw firstError
        if (cancelled) return

        setStockItems(stockData || [])
        setSemiItems((semiData || []).filter(item => item.setting_active !== false))
        setSaleItems((saleData || []).filter(item => item.sale_status !== false))
        setDrafts(normalizeDrafts(draftValue))
        setBranchContexts(loadedBranchContexts || [])
      } catch (error) {
        if (!cancelled) toast(`Transfer ekrani yuklenemedi: ${error.message}`, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [toast])

  const loadSavedDocuments = useCallback(async () => {
    setLoadingDocuments(true)
    try {
      const { data, error } = await db
        .from('inventory_movements')
        .select('id,branch_id,branch_name,source_doc_no,movement_at,updated_at,created_at,movement_type,direction,quantity,unit_cost,total_cost,notes,meta')
        .eq('source_doc_type', TRANSFER_SOURCE_DOC_TYPE)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: false })
        .order('ledger_seq', { ascending: false })
        .limit(2000)

      if (error) throw error
      setSavedDocuments(buildSavedDocumentSummaries(data || [], actorMeta))
    } catch (error) {
      toast(`Transfer belgeleri yuklenemedi: ${error.message}`, 'error')
    } finally {
      setLoadingDocuments(false)
    }
  }, [actorMeta, toast])

  useEffect(() => {
    if (!loading) loadSavedDocuments()
  }, [loadSavedDocuments, loading])

  const visibleDrafts = useMemo(
    () => drafts.filter(draft => draft.scopeVariant === scopeVariant && draft.originScope === actorMeta.scope && String(draft.originBranchId || '') === String(actorMeta.branchId || '')),
    [drafts, scopeVariant, actorMeta],
  )

  const documentEntries = useMemo(() => {
    const draftEntries = buildDraftDocumentEntries(visibleDrafts)
    return [...draftEntries, ...savedDocuments]
      .sort((left, right) => new Date(right.updatedAt || right.movementDate).getTime() - new Date(left.updatedAt || left.movementDate).getTime())
  }, [savedDocuments, visibleDrafts])

  const stockItemOptions = useMemo(() => buildItemOptions(stockItems, 'Stok', 'fa-boxes-stacked'), [stockItems])
  const semiItemOptions = useMemo(() => buildItemOptions(semiItems.map(item => ({ ...item, unit: item.recipe_output_unit })), 'Yari Mamul', 'fa-layer-group'), [semiItems])
  const saleItemOptions = useMemo(() => buildItemOptions(saleItems, 'Satis', 'fa-utensils'), [saleItems])

  const stockItemsById = useMemo(() => new Map(stockItems.map(item => [String(item.id), item])), [stockItems])
  const semiItemsById = useMemo(() => new Map(semiItems.map(item => [String(item.id), item])), [semiItems])
  const saleItemsById = useMemo(() => new Map(saleItems.map(item => [String(item.id), item])), [saleItems])

  const destinationMeta = useMemo(
    () => destinationOptions.find(option => option.branchId === form.destinationBranchId && option.scope === form.destinationScope)
      || destinationOptions.find(option => option.value === form.destinationBranchId)
      || null,
    [destinationOptions, form.destinationBranchId, form.destinationScope],
  )

  const invoiceRequired = useMemo(() => !sameEntity(actorMeta, destinationMeta), [actorMeta, destinationMeta])

  function updateForm(updater) {
    setForm(current => {
      const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater }
      return {
        ...next,
        documentNo: createDocNo(next.movementDate, next.movementTime || '00:00'),
      }
    })
  }

  async function applyRowBaseCost(rowId, nextRow) {
    try {
      if (!nextRow?.itemId) {
        updateForm(current => ({
          ...current,
          rows: current.rows.map(row => row.id === rowId ? { ...row, baseUnitCost: '', unitCost: '', useCustomPrice: false } : row),
        }))
        return
      }

      if (nextRow.itemType === 'sale_item') {
        const { data, error } = await db
          .from('sale_items')
          .select('id,name,sku,recipe_rows,recipe_output_qty,portions')
          .eq('id', nextRow.itemId)
          .single()

        if (error) throw error
        const recipeRows = parseMaybeArray(data?.recipe_rows, [])
        const portionId = nextRow.portionId || STANDARD_PORTION_ID
        const matchedRows = recipeRows.filter(recipeRow => recipeRowMatchesPortion(recipeRow, portionId))
        const outputQty = safeNumber(data?.recipe_output_qty, 1) || 1

        const stockItemsForLookup = Array.from(new Map(
          matchedRows
            .filter(recipeRow => recipeRow.stock_item_id || recipeRow.item_name)
            .map(recipeRow => {
              const stockItem = stockItemsById.get(String(recipeRow.stock_item_id))
              return [
                `${recipeRow.stock_item_id || ''}|${stockItem?.name || recipeRow.item_name || ''}`,
                { itemId: recipeRow.stock_item_id, itemName: stockItem?.name || recipeRow.item_name || '' },
              ]
            }),
        ).values())
        const semiItemsForLookup = Array.from(new Map(
          matchedRows
            .filter(recipeRow => recipeRow.semi_item_id || recipeRow.item_name)
            .map(recipeRow => {
              const semiItem = semiItemsById.get(String(recipeRow.semi_item_id))
              return [
                `${recipeRow.semi_item_id || ''}|${semiItem?.name || recipeRow.item_name || ''}`,
                { itemId: recipeRow.semi_item_id, itemName: semiItem?.name || recipeRow.item_name || '' },
              ]
            }),
        ).values())
        const [stockBalances, semiBalances] = await Promise.all([
          loadLatestBalances('stock_item', stockItemsForLookup, actorMeta),
          loadLatestBalances('semi_item', semiItemsForLookup, actorMeta),
        ])

        let baseUnitCost = 0
        for (const recipeRow of matchedRows) {
          const componentQty = safeNumber(recipeRow.qty ?? recipeRow.quantity, 0) / outputQty
          if (recipeRow.stock_item_id) {
            const stockItem = stockItemsById.get(String(recipeRow.stock_item_id))
            const balance = stockBalances.get(buildBalanceLookupKey('stock_item', recipeRow.stock_item_id, stockItem?.name || recipeRow.item_name))
            baseUnitCost += componentQty * safeNumber(balance?.avg_unit_cost_after ?? balance?.unit_cost)
          } else if (recipeRow.semi_item_id) {
            const semiItem = semiItemsById.get(String(recipeRow.semi_item_id))
            const balance = semiBalances.get(buildBalanceLookupKey('semi_item', recipeRow.semi_item_id, semiItem?.name || recipeRow.item_name))
            baseUnitCost += componentQty * safeNumber(balance?.avg_unit_cost_after ?? balance?.unit_cost)
          }
        }

        updateForm(current => ({
          ...current,
          rows: current.rows.map(row => row.id === rowId ? {
            ...row,
            baseUnitCost,
            unitCost: row.useCustomPrice ? row.unitCost : baseUnitCost,
          } : row),
        }))
        return
      }

      const selectedItem = getRowSelectedItem(nextRow)
      const balance = await loadLatestBalance(
        nextRow.itemType,
        { itemId: nextRow.itemId, itemName: selectedItem?.name || '' },
        actorMeta,
      )
      const baseUnitCost = safeNumber(balance?.avg_unit_cost_after ?? balance?.unit_cost)

      updateForm(current => ({
        ...current,
        rows: current.rows.map(row => row.id === rowId ? {
          ...row,
          baseUnitCost,
          unitCost: row.useCustomPrice ? row.unitCost : baseUnitCost,
        } : row),
      }))
    } catch (error) {
      toast(`Birim maliyet okunamadi: ${error.message}`, 'error')
    }
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

  async function updateRow(rowId, field, value) {
    let nextSnapshot = null

    updateForm(current => {
      const nextRows = current.rows.map(row => {
        if (row.id !== rowId) return row
        let nextRow = { ...row, [field]: value }

        if (field === 'itemType') {
          nextRow = {
            ...row,
            itemType: value || 'stock_item',
            itemId: '',
            quantity: '',
            portionId: STANDARD_PORTION_ID,
            baseUnitCost: '',
            unitCost: '',
            useCustomPrice: false,
          }
        }

        if (field === 'itemId') {
          nextRow = {
            ...nextRow,
            portionId: nextRow.itemType === 'sale_item'
              ? (getSalePortionOptions(saleItemsById.get(String(value)))[0]?.value || STANDARD_PORTION_ID)
              : STANDARD_PORTION_ID,
            baseUnitCost: '',
            unitCost: '',
            useCustomPrice: false,
          }
        }

        if (field === 'portionId') {
          nextRow = {
            ...nextRow,
            baseUnitCost: '',
            unitCost: '',
            useCustomPrice: false,
          }
        }

        if (field === 'useCustomPrice') {
          nextRow = {
            ...nextRow,
            useCustomPrice: Boolean(value),
            unitCost: value ? (row.unitCost || row.baseUnitCost || '') : (row.baseUnitCost || ''),
          }
        }

        if (field === 'unitCost') {
          nextRow = { ...nextRow, unitCost: value }
        }

        nextSnapshot = nextRow
        return nextRow
      })

      return {
        ...current,
        rows: nextRows,
      }
    })

    if (field === 'itemId' || field === 'itemType' || field === 'portionId') {
      await applyRowBaseCost(rowId, nextSnapshot)
    }
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
    if (!destinationMeta) {
      toast('Transfer hedefi secin.', 'error')
      return
    }

    setSavingDraft(true)
    try {
      const draftPayload = buildDraftPayload({ scopeVariant, form, actorMeta, destinationMeta })
      const nextDrafts = [...drafts]
      const existingIndex = nextDrafts.findIndex(draft => draft.draftId === draftPayload.draftId)
      if (existingIndex >= 0) nextDrafts[existingIndex] = draftPayload
      else nextDrafts.unshift(draftPayload)
      await persistDrafts(nextDrafts)
      setForm(current => ({ ...current, draftId: draftPayload.draftId }))
      toast('Transfer taslagi kaydedildi.', 'success')
    } catch (error) {
      toast(`Taslak kaydedilemedi: ${error.message}`, 'error')
    } finally {
      setSavingDraft(false)
    }
  }

  function handleNewDocument() {
    setForm(createInitialForm(actorMeta, destinationOptions))
    setFormMode('edit')
    setEditorOpen(true)
  }

  function handleOpenDraft(draft) {
    setForm({
      draftId: draft.draftId,
      savedMovementIds: [],
      documentStatus: TRANSFER_PENDING,
      movementDate: draft.movementDate,
      movementTime: draft.movementTime,
      documentNo: draft.documentNo,
      note: draft.note || '',
      destinationScope: draft.destinationScope || '',
      destinationBranchId: draft.destinationBranchId || '',
      destinationName: draft.destinationName || '',
      rows: (draft.rows || []).length ? draft.rows.map(normalizeRow) : [createEmptyRow()],
      originSnapshot: {
        scope: draft.originScope || actorMeta.scope,
        branchId: draft.originBranchId || '',
        branchName: draft.originBranchName || actorMeta.branchName || '',
        legalEntityId: draft.originLegalEntityId || '',
        legalEntityName: draft.originLegalEntityName || '',
      },
    })
    setFormMode('edit')
    setEditorOpen(true)
  }

  async function handleOpenSavedDocument(entry) {
    try {
      const { data, error } = await db
        .from('inventory_movements')
        .select('id,branch_id,branch_name,movement_at,source_doc_no,notes,quantity,unit_cost,item_type,stock_item_id,semi_item_id,meta')
        .eq('source_doc_type', TRANSFER_SOURCE_DOC_TYPE)
        .eq('source_doc_no', entry.documentNo)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: true })
        .order('ledger_seq', { ascending: true })

      if (error) throw error
      if (!data?.length) throw new Error('Transfer satirlari bulunamadi.')

      const sourceRows = data.filter(row => (row.meta || {}).transfer_side === 'source')
      const baseRows = sourceRows.length ? sourceRows : data
      const groupedRows = new Map()

      for (const movement of baseRows) {
        const meta = movement.meta || {}
        const rowKey = String(meta.document_row_id || movement.id)
        const existing = groupedRows.get(rowKey) || {
          id: rowKey,
          itemType: meta.row_item_type || movement.item_type || 'stock_item',
          itemId: String(meta.row_item_id || movement.stock_item_id || movement.semi_item_id || ''),
          quantity: meta.row_quantity_original ?? movement.quantity ?? '',
          portionId: meta.sale_item_portion_id || STANDARD_PORTION_ID,
          baseUnitCost: meta.row_base_unit_cost ?? movement.unit_cost ?? '',
          unitCost: meta.row_transfer_unit_cost ?? movement.unit_cost ?? '',
          useCustomPrice: meta.row_pricing_mode === 'custom',
        }

        if (existing.itemType === 'sale_item') {
          existing.itemId = String(meta.sale_item_id || meta.row_item_id || '')
        }
        groupedRows.set(rowKey, existing)
      }

      const firstRow = baseRows[0]
      const meta = firstRow?.meta || {}
      const movementDate = String(firstRow.movement_at || '').slice(0, 10)
      const movementTime = new Date(firstRow.movement_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

      setForm({
        draftId: '',
        savedMovementIds: data.map(row => row.id),
        documentStatus: meta.transfer_status || TRANSFER_PENDING,
        movementDate,
        movementTime,
        documentNo: entry.documentNo,
        note: firstRow.notes || '',
        destinationScope: meta.destination_scope || '',
        destinationBranchId: meta.destination_branch_id || '',
        destinationName: meta.destination_branch_name || '',
        rows: Array.from(groupedRows.values()).map(normalizeRow),
        originSnapshot: {
          scope: meta.origin_scope || actorMeta.scope,
          branchId: meta.origin_branch_id || '',
          branchName: meta.origin_branch_name || actorMeta.branchName || '',
          legalEntityId: meta.origin_legal_entity_id || '',
          legalEntityName: meta.origin_legal_entity_name || '',
        },
      })

      setFormMode(entry.canEdit ? 'edit' : 'view')
      setEditorOpen(true)
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
        setForm(createInitialForm(actorMeta, destinationOptions))
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
      if (!row.itemType || !row.itemId) {
        toast('Tum satirlarda malzeme tipi ve malzeme secimi yapin.', 'error')
        return null
      }
      if (safeNumber(row.quantity) <= 0) {
        toast('Tum satirlarda miktar sifirdan buyuk olmali.', 'error')
        return null
      }
    }
    return meaningfulRows
  }

  async function expandSaleItemRow(row) {
    const { data, error } = await db
      .from('sale_items')
      .select('id,name,sku,recipe_rows,recipe_output_qty,portions')
      .eq('id', row.itemId)
      .single()

    if (error) throw error
    if (!data) throw new Error('Satis mali bulunamadi.')

    const recipeRows = parseMaybeArray(data.recipe_rows, [])
    const portionOptions = getSalePortionOptions(data)
    const selectedPortion = portionOptions.find(option => option.value === (row.portionId || STANDARD_PORTION_ID)) || portionOptions[0]
    const matchedRows = recipeRows.filter(recipeRow => recipeRowMatchesPortion(recipeRow, selectedPortion?.value || STANDARD_PORTION_ID))
    if (!matchedRows.length) throw new Error(`${data.name} icin recete satiri bulunamadi.`)

    const outputQty = safeNumber(data.recipe_output_qty, 1) || 1
    const stockItemsForLookup = Array.from(new Map(
      matchedRows
        .filter(recipeRow => recipeRow.stock_item_id || recipeRow.item_name)
        .map(recipeRow => {
          const stockItem = stockItemsById.get(String(recipeRow.stock_item_id))
          return [
            `${recipeRow.stock_item_id || ''}|${stockItem?.name || recipeRow.item_name || ''}`,
            { itemId: recipeRow.stock_item_id, itemName: stockItem?.name || recipeRow.item_name || '' },
          ]
        }),
    ).values())
    const semiItemsForLookup = Array.from(new Map(
      matchedRows
        .filter(recipeRow => recipeRow.semi_item_id || recipeRow.item_name)
        .map(recipeRow => {
          const semiItem = semiItemsById.get(String(recipeRow.semi_item_id))
          return [
            `${recipeRow.semi_item_id || ''}|${semiItem?.name || recipeRow.item_name || ''}`,
            { itemId: recipeRow.semi_item_id, itemName: semiItem?.name || recipeRow.item_name || '' },
          ]
        }),
    ).values())
    const [stockBalances, semiBalances] = await Promise.all([
      loadLatestBalances('stock_item', stockItemsForLookup, actorMeta),
      loadLatestBalances('semi_item', semiItemsForLookup, actorMeta),
    ])

    const componentLines = []
    let baseDocumentUnitCost = 0

    for (const recipeRow of matchedRows) {
      const componentQtyPerUnit = safeNumber(recipeRow.qty ?? recipeRow.quantity, 0) / outputQty
      const quantity = safeNumber(row.quantity) * componentQtyPerUnit
      if (quantity <= 0) continue

      if (recipeRow.stock_item_id) {
        const stockItem = stockItemsById.get(String(recipeRow.stock_item_id))
        const balance = stockBalances.get(buildBalanceLookupKey('stock_item', recipeRow.stock_item_id, stockItem?.name || recipeRow.item_name))
        const componentBaseUnitCost = safeNumber(balance?.avg_unit_cost_after ?? balance?.unit_cost)
        baseDocumentUnitCost += componentQtyPerUnit * componentBaseUnitCost
        componentLines.push({
          itemType: 'stock_item',
          itemId: recipeRow.stock_item_id,
          itemName: stockItem?.name || recipeRow.item_name || data.name,
          itemSku: stockItem?.sku || recipeRow.item_sku || null,
          unit: stockItem?.unit || recipeRow.unit || null,
          quantity,
          documentRowId: row.id,
          rowItemType: 'sale_item',
          rowItemId: row.itemId,
          rowDisplayName: data.name,
          rowQuantityOriginal: safeNumber(row.quantity),
          saleItemId: data.id,
          saleItemName: data.name,
          saleItemPortionId: selectedPortion?.value || STANDARD_PORTION_ID,
          saleItemPortionName: selectedPortion?.label || 'Standart',
          componentBaseUnitCost,
        })
      } else if (recipeRow.semi_item_id) {
        const semiItem = semiItemsById.get(String(recipeRow.semi_item_id))
        const balance = semiBalances.get(buildBalanceLookupKey('semi_item', recipeRow.semi_item_id, semiItem?.name || recipeRow.item_name))
        const componentBaseUnitCost = safeNumber(balance?.avg_unit_cost_after ?? balance?.unit_cost)
        baseDocumentUnitCost += componentQtyPerUnit * componentBaseUnitCost
        componentLines.push({
          itemType: 'semi_item',
          itemId: recipeRow.semi_item_id,
          itemName: semiItem?.name || recipeRow.item_name || data.name,
          itemSku: semiItem?.sku || recipeRow.item_sku || null,
          unit: semiItem?.recipe_output_unit || recipeRow.unit || null,
          quantity,
          documentRowId: row.id,
          rowItemType: 'sale_item',
          rowItemId: row.itemId,
          rowDisplayName: data.name,
          rowQuantityOriginal: safeNumber(row.quantity),
          saleItemId: data.id,
          saleItemName: data.name,
          saleItemPortionId: selectedPortion?.value || STANDARD_PORTION_ID,
          saleItemPortionName: selectedPortion?.label || 'Standart',
          componentBaseUnitCost,
        })
      }
    }

    const requestedUnitCost = safeNumber(row.useCustomPrice ? row.unitCost : row.baseUnitCost || baseDocumentUnitCost)
    const effectiveBase = baseDocumentUnitCost > 0 ? baseDocumentUnitCost : requestedUnitCost
    const ratio = effectiveBase > 0 ? requestedUnitCost / effectiveBase : 1

    return componentLines.map(componentLine => ({
      ...componentLine,
      unitCost: componentLine.componentBaseUnitCost * ratio,
      rowTransferUnitCost: requestedUnitCost,
      rowBaseUnitCost: effectiveBase,
      rowPricingMode: row.useCustomPrice ? 'custom' : 'latest',
    }))
  }

  async function transitionDocument(entry, nextStatus) {
    const actionLabel = nextStatus === TRANSFER_ACCEPTED ? 'kabul' : 'red'
    if (!window.confirm(`Bu transfer ${actionLabel} edilsin mi?`)) return

    setSaving(true)
    try {
      const { data, error } = await db
        .from('inventory_movements')
        .select('id,branch_id,branch_name,item_type,stock_item_id,semi_item_id,item_name,item_sku,unit,quantity,unit_cost,source_doc_no,notes,meta')
        .eq('source_doc_type', TRANSFER_SOURCE_DOC_TYPE)
        .eq('source_doc_no', entry.documentNo)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .order('movement_at', { ascending: true })
        .order('ledger_seq', { ascending: true })

      if (error) throw error
      const sourceRows = (data || []).filter(row => (row.meta || {}).transfer_side === 'source')
      if (!sourceRows.length) throw new Error('Kaynak transfer satirlari bulunamadi.')

      const timestamp = new Date().toISOString()
      for (const sourceRow of sourceRows) {
        const nextMeta = {
          ...(sourceRow.meta || {}),
          transfer_status: nextStatus,
          transfer_decision_at: timestamp,
          transfer_decision_scope: actorMeta.scope,
          transfer_decision_branch_id: actorMeta.branchId || null,
          transfer_decision_branch_name: actorMeta.branchName || null,
        }

        const { error: rowUpdateError } = await db
          .from('inventory_movements')
          .update({ meta: nextMeta, updated_at: timestamp })
          .eq('id', sourceRow.id)

        if (rowUpdateError) throw rowUpdateError
      }

      const targetScope = nextStatus === TRANSFER_ACCEPTED ? sourceRows[0]?.meta?.destination_scope : sourceRows[0]?.meta?.origin_scope
      const targetBranchId = nextStatus === TRANSFER_ACCEPTED ? sourceRows[0]?.meta?.destination_branch_id : sourceRows[0]?.meta?.origin_branch_id
      const targetBranchName = nextStatus === TRANSFER_ACCEPTED ? sourceRows[0]?.meta?.destination_branch_name : sourceRows[0]?.meta?.origin_branch_name

      const stockItemsForLookup = Array.from(new Map(
        sourceRows
          .filter(row => row.item_type === 'stock_item')
          .map(row => {
            const meta = row.meta || {}
            const sourceItemId = meta.row_item_id || row.stock_item_id
            return [`${sourceItemId || ''}|${row.item_name || ''}`, { itemId: sourceItemId, itemName: row.item_name }]
          }),
      ).values())
      const semiItemsForLookup = Array.from(new Map(
        sourceRows
          .filter(row => row.item_type === 'semi_item')
          .map(row => {
            const meta = row.meta || {}
            const sourceItemId = meta.row_item_id || row.semi_item_id
            return [`${sourceItemId || ''}|${row.item_name || ''}`, { itemId: sourceItemId, itemName: row.item_name }]
          }),
      ).values())
      const [targetStockBalances, targetSemiBalances] = await Promise.all([
        loadLatestBalances('stock_item', stockItemsForLookup, { branchId: targetBranchId || '', branchName: targetBranchName }),
        loadLatestBalances('semi_item', semiItemsForLookup, { branchId: targetBranchId || '', branchName: targetBranchName }),
      ])

      const targetBalanceTracker = new Map()
      for (const [key, value] of targetStockBalances.entries()) targetBalanceTracker.set(key, value)
      for (const [key, value] of targetSemiBalances.entries()) targetBalanceTracker.set(key, value)

      const targetRows = sourceRows.map(sourceRow => {
        const meta = sourceRow.meta || {}
        const sourceItemId = meta.row_item_id || sourceRow.stock_item_id || sourceRow.semi_item_id
        const balanceKey = buildBalanceLookupKey(sourceRow.item_type, sourceItemId, sourceRow.item_name)
        const previousBalance = targetBalanceTracker.get(balanceKey) || null
        const payload = createMovementPayload({
          line: {
            itemType: sourceRow.item_type,
            itemId: sourceItemId,
            itemName: sourceRow.item_name,
            itemSku: sourceRow.item_sku,
            unit: sourceRow.unit,
            quantity: sourceRow.quantity,
            unitCost: sourceRow.unit_cost,
            documentRowId: meta.document_row_id || sourceRow.id,
          },
          movementType: 'transfer_in',
          direction: 'in',
          movementAt: timestamp,
          branchId: targetScope === WAREHOUSE_SCOPE ? null : targetBranchId || null,
          branchName: getBranchLabel(targetBranchName),
          previousBalance,
          documentNo: entry.documentNo,
          note: sourceRow.notes || null,
          meta: {
            ...meta,
            transfer_status: nextStatus,
            transfer_side: nextStatus === TRANSFER_ACCEPTED ? 'destination' : 'return',
          },
        })

        targetBalanceTracker.set(balanceKey, {
          unit_cost: payload.unit_cost,
          avg_unit_cost_after: payload.avg_unit_cost_after,
          balance_qty_after: payload.balance_qty_after,
          balance_total_cost_after: payload.balance_total_cost_after,
        })

        return payload
      })

      const { error: insertError } = await db.from('inventory_movements').insert(targetRows)
      if (insertError) throw insertError

      try {
        await db.rpc('process_inventory_recalc_jobs', { p_limit: 200 })
      } catch {
        // Best effort.
      }

      await loadSavedDocuments()
      toast(nextStatus === TRANSFER_ACCEPTED ? 'Transfer kabul edildi.' : 'Transfer reddedildi ve kaynak bakiyeye iade edildi.', 'success')
    } catch (error) {
      toast(`Transfer guncellenemedi: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const validatedRows = validateRows()
    if (!validatedRows) return
    if (!destinationMeta) {
      toast('Transfer hedefi secin.', 'error')
      return
    }

    setSaving(true)
    try {
      const editingSavedDocument = Array.isArray(form.savedMovementIds) && form.savedMovementIds.length > 0
      const persistedStatus = editingSavedDocument ? (form.documentStatus || TRANSFER_ACCEPTED) : TRANSFER_PENDING
      const originSnapshot = form.originSnapshot || actorMeta
      const documentLines = []

      for (const row of validatedRows) {
        if (row.itemType === 'sale_item') {
          const expandedRows = await expandSaleItemRow(row)
          documentLines.push(...expandedRows)
          continue
        }

        const selectedItem = getRowSelectedItem(row)
        if (!selectedItem) throw new Error('Satirdaki secili malzeme bulunamadi.')

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
          rowTransferUnitCost: safeNumber(row.useCustomPrice ? row.unitCost : row.baseUnitCost),
          rowBaseUnitCost: safeNumber(row.baseUnitCost),
          rowPricingMode: row.useCustomPrice ? 'custom' : 'latest',
          saleItemId: null,
          saleItemName: null,
          saleItemPortionId: null,
          saleItemPortionName: null,
          unitCost: safeNumber(row.useCustomPrice ? row.unitCost : row.baseUnitCost),
        })
      }

      const uniqueStockItems = Array.from(new Map(
        documentLines
          .filter(line => line.itemType === 'stock_item')
          .map(line => [`${line.itemId || ''}|${line.itemName || ''}`, { itemId: line.itemId, itemName: line.itemName }]),
      ).values())
      const uniqueSemiItems = Array.from(new Map(
        documentLines
          .filter(line => line.itemType === 'semi_item')
          .map(line => [`${line.itemId || ''}|${line.itemName || ''}`, { itemId: line.itemId, itemName: line.itemName }]),
      ).values())
      const [stockBalanceMap, semiBalanceMap] = await Promise.all([
        loadLatestBalances('stock_item', uniqueStockItems, originSnapshot),
        loadLatestBalances('semi_item', uniqueSemiItems, originSnapshot),
      ])

      const movementAt = `${form.movementDate}T${form.movementTime || '00:00'}:00`
      const balanceTracker = new Map()
      for (const [key, value] of stockBalanceMap.entries()) balanceTracker.set(key, value)
      for (const [key, value] of semiBalanceMap.entries()) balanceTracker.set(key, value)

      const sourceRows = documentLines.map(line => {
        const balanceKey = buildBalanceLookupKey(line.itemType, line.itemId, line.itemName)
        const previousBalance = balanceTracker.get(balanceKey) || null
        const payload = createMovementPayload({
          line,
          movementType: 'transfer_out',
          direction: 'out',
          movementAt,
          branchId: originSnapshot.scope === WAREHOUSE_SCOPE ? null : originSnapshot.branchId || null,
          branchName: getBranchLabel(originSnapshot.branchName),
          previousBalance,
          documentNo: form.documentNo,
          note: form.note?.trim() || null,
          meta: {
            transfer_status: persistedStatus,
            transfer_side: 'source',
            origin_scope: originSnapshot.scope,
            origin_branch_id: originSnapshot.branchId || null,
            origin_branch_name: originSnapshot.branchName || WAREHOUSE_LABEL,
            origin_legal_entity_id: originSnapshot.legalEntityId || null,
            origin_legal_entity_name: originSnapshot.legalEntityName || null,
            destination_scope: destinationMeta.scope,
            destination_branch_id: destinationMeta.branchId || null,
            destination_branch_name: destinationMeta.label || WAREHOUSE_LABEL,
            destination_legal_entity_id: destinationMeta.legalEntityId || null,
            destination_legal_entity_name: destinationMeta.legalEntityName || null,
            document_row_id: line.documentRowId,
            row_item_type: line.rowItemType,
            row_item_id: line.rowItemId,
            row_display_name: line.rowDisplayName,
            row_quantity_original: line.rowQuantityOriginal,
            row_transfer_unit_cost: line.rowTransferUnitCost,
            row_base_unit_cost: line.rowBaseUnitCost,
            row_pricing_mode: line.rowPricingMode,
            sale_item_id: line.saleItemId || null,
            sale_item_name: line.saleItemName || null,
            sale_item_portion_id: line.saleItemPortionId || null,
            sale_item_portion_name: line.saleItemPortionName || null,
          },
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
          .update({ deleted_at: timestamp, updated_at: timestamp })
          .in('id', form.savedMovementIds)

        if (deleteError) throw deleteError
      }

      const destinationRows = []
      if (persistedStatus !== TRANSFER_PENDING) {
        const targetScope = persistedStatus === TRANSFER_ACCEPTED ? destinationMeta.scope : originSnapshot.scope
        const targetBranchId = targetScope === WAREHOUSE_SCOPE
          ? ''
          : (persistedStatus === TRANSFER_ACCEPTED ? destinationMeta.branchId || '' : originSnapshot.branchId || '')
        const targetBranchName = persistedStatus === TRANSFER_ACCEPTED
          ? (destinationMeta.label || WAREHOUSE_LABEL)
          : (originSnapshot.branchName || WAREHOUSE_LABEL)
        const stockItemsForLookup = Array.from(new Map(
          sourceRows
            .filter(row => row.item_type === 'stock_item')
            .map(row => {
              const meta = row.meta || {}
              const sourceItemId = meta.row_item_id || row.stock_item_id
              return [`${sourceItemId || ''}|${row.item_name || ''}`, { itemId: sourceItemId, itemName: row.item_name }]
            }),
        ).values())
        const semiItemsForLookup = Array.from(new Map(
          sourceRows
            .filter(row => row.item_type === 'semi_item')
            .map(row => {
              const meta = row.meta || {}
              const sourceItemId = meta.row_item_id || row.semi_item_id
              return [`${sourceItemId || ''}|${row.item_name || ''}`, { itemId: sourceItemId, itemName: row.item_name }]
            }),
        ).values())
        const [targetStockBalances, targetSemiBalances] = await Promise.all([
          loadLatestBalances('stock_item', stockItemsForLookup, { branchId: targetBranchId, branchName: targetBranchName }),
          loadLatestBalances('semi_item', semiItemsForLookup, { branchId: targetBranchId, branchName: targetBranchName }),
        ])

        const targetBalanceTracker = new Map()
        for (const [key, value] of targetStockBalances.entries()) targetBalanceTracker.set(key, value)
        for (const [key, value] of targetSemiBalances.entries()) targetBalanceTracker.set(key, value)

        for (const sourceRow of sourceRows) {
          const meta = sourceRow.meta || {}
          const sourceItemId = meta.row_item_id || sourceRow.stock_item_id || sourceRow.semi_item_id
          const balanceKey = buildBalanceLookupKey(sourceRow.item_type, sourceItemId, sourceRow.item_name)
          const previousBalance = targetBalanceTracker.get(balanceKey) || null
          const payload = createMovementPayload({
            line: {
              itemType: sourceRow.item_type,
              itemId: sourceItemId,
              itemName: sourceRow.item_name,
              itemSku: sourceRow.item_sku,
              unit: sourceRow.unit,
              quantity: sourceRow.quantity,
              unitCost: sourceRow.unit_cost,
              documentRowId: meta.document_row_id || createUuid(),
            },
            movementType: 'transfer_in',
            direction: 'in',
            movementAt: new Date().toISOString(),
            branchId: targetScope === WAREHOUSE_SCOPE ? null : targetBranchId || null,
            branchName: targetBranchName,
            previousBalance,
            documentNo: form.documentNo,
            note: form.note?.trim() || null,
            meta: {
              ...meta,
              transfer_status: persistedStatus,
              transfer_side: persistedStatus === TRANSFER_ACCEPTED ? 'destination' : 'return',
            },
          })

          targetBalanceTracker.set(balanceKey, {
            unit_cost: payload.unit_cost,
            avg_unit_cost_after: payload.avg_unit_cost_after,
            balance_qty_after: payload.balance_qty_after,
            balance_total_cost_after: payload.balance_total_cost_after,
          })

          destinationRows.push(payload)
        }
      }

      const { error } = await db.from('inventory_movements').insert([...sourceRows, ...destinationRows])
      if (error) throw error

      if (form.draftId) {
        const nextDrafts = drafts.filter(draft => draft.draftId !== form.draftId)
        await persistDrafts(nextDrafts)
      }

      try {
        await db.rpc('process_inventory_recalc_jobs', { p_limit: 200 })
      } catch {
        // Best effort.
      }

      setForm(createInitialForm(actorMeta, destinationOptions))
      setEditorOpen(false)
      setFormMode('edit')
      await loadSavedDocuments()
      toast('Transfer kaydedildi.', 'success')
    } catch (error) {
      toast(`Transfer kaydedilemedi: ${error.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const subtitle = scopeVariant === WAREHOUSE_SCOPE
    ? 'Merkez Depo / Üretim > İşlemler > Transfer'
    : 'Şube İşlemleri > İşlemler > Transfer'

  const pageDescription = scopeVariant === WAREHOUSE_SCOPE
    ? 'Merkez depo / mutfak ile sirket agacindaki subeler arasindaki transferleri yonetin.'
    : 'Stoğunuzdaki stok mali, yari mamul ve satis mali recetelerini diger subelere veya merkeze transfer edin.'

  const isEditingSavedDocument = Array.isArray(form.savedMovementIds) && form.savedMovementIds.length > 0

  return (
    <>
      <Header
        title="Transfer"
        subtitle={subtitle}
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
            <span className="badge" style={{ background: '#fef3c7', color: '#b45309' }}>
              <i className="fa-solid fa-right-left" style={{ marginRight: 6 }} />
              Transfer
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge" style={{ background: '#fff7ed', color: '#9a3412' }}>
              <i className="fa-solid fa-folder-open" style={{ marginRight: 6 }} />
              {documentEntries.filter(entry => entry.status === 'draft').length} taslak
            </span>
            <span className="badge" style={{ background: '#f8fafc', color: '#475569' }}>
              <i className="fa-solid fa-file-lines" style={{ marginRight: 6 }} />
              {documentEntries.length} belge
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: '.83rem', color: '#64748b', lineHeight: 1.6, minWidth: 280, flex: '1 1 420px' }}>
            <div>{pageDescription}</div>
            <div style={{ marginTop: 6 }}>
              Taslak olarak birakilan transferler gun sonu islemine baglandiginda simdilik 22:00'de otomatik kaydedilecek sekilde planlanir.
            </div>
          </div>

          <AddButton onClick={handleNewDocument} label="Yeni Transfer" />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '.96rem', fontWeight: 800, color: '#0f172a' }}>Belgeler</div>
          <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
            Taslak ve kaydedilmis belgeler ayni listede gorunur. Duzenle ile ayni editor acilir.
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>Belge No</th>
                <th>Tarih</th>
                <th>Satir</th>
                <th>Durum</th>
                <th>Son Guncelleme</th>
                <th style={{ textAlign: 'right' }}>Islem</th>
              </tr>
            </thead>
            <tbody>
              {loadingDocuments ? (
                <tr>
                  <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    Transfer belgeleri yukleniyor...
                  </td>
                </tr>
              ) : !documentEntries.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                    Henuz transfer belgesi yok.
                  </td>
                </tr>
              ) : documentEntries.map(entry => (
                <tr key={entry.key}>
                  <td>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{entry.documentNo}</div>
                    <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 4 }}>
                      {(entry.originBranchName || WAREHOUSE_LABEL)} {' -> '} {(entry.destinationName || WAREHOUSE_LABEL)}
                    </div>
                  </td>
                  <td>{formatDateLabel(entry.movementDate)} {entry.movementTime || ''}</td>
                  <td>{entry.lineCount || 0}</td>
                  <td>{buildStatusBadge(entry.status)}</td>
                  <td>{formatDateTimeLabel(entry.updatedAt)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {(entry.status === 'draft' || entry.canEdit) && (
                        <button type="button" className="btn" onClick={() => handleOpenDocument(entry)}>
                          <i className="fa-solid fa-pen-to-square" style={{ marginRight: 8 }} />
                          Duzenle
                        </button>
                      )}
                      {entry.status === 'draft' && (
                        <button type="button" className="btn" onClick={() => removeDraftById(entry.draftId)}>
                          <i className="fa-solid fa-trash-can" style={{ marginRight: 8 }} />
                          Sil
                        </button>
                      )}
                      {entry.canAccept && (
                        <button type="button" className="btn" onClick={() => transitionDocument(entry, TRANSFER_ACCEPTED)} disabled={saving}>
                          Kabul Et
                        </button>
                      )}
                      {entry.canReject && (
                        <button type="button" className="btn" onClick={() => transitionDocument(entry, TRANSFER_REJECTED)} disabled={saving}>
                          Reddet
                        </button>
                      )}
                      {entry.senderLocked && (
                        <span style={{ fontSize: '.74rem', color: '#92400e', fontWeight: 700, alignSelf: 'center' }}>
                          Karsi taraf karari bekleniyor
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={isEditingSavedDocument ? 'Transfer Belgesi' : 'Yeni Transfer'}
        subtitle={null}
        width={1180}
        flex
      >
        <form id="inventory-transfer-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card" style={{ padding: 16, boxShadow: 'none', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.5fr) repeat(3, minmax(160px, 1fr))', gap: 12 }}>
              <div>
                <label className="f-label">Transfer hedefi</label>
                <SearchableSelect
                  value={destinationMeta?.value || ''}
                  onChange={nextValue => {
                    const selected = destinationOptions.find(option => option.value === nextValue) || null
                    updateForm(current => ({
                      ...current,
                      destinationScope: selected?.scope || '',
                      destinationBranchId: selected?.branchId || '',
                      destinationName: selected?.label || '',
                    }))
                  }}
                  options={destinationOptions}
                  placeholder="Hedef secin..."
                  searchPlaceholder="Sube veya merkez ara..."
                  disabled={formMode === 'view'}
                  allowClear={false}
                />
              </div>
              <div>
                <label className="f-label">Tarih</label>
                <input
                  className="f-input"
                  type="date"
                  value={form.movementDate}
                  onChange={event => updateForm({ movementDate: event.target.value })}
                  disabled={formMode === 'view'}
                />
              </div>
              <div>
                <label className="f-label">Saat</label>
                <input
                  className="f-input"
                  type="time"
                  value={form.movementTime}
                  onChange={event => updateForm({ movementTime: event.target.value })}
                  disabled={formMode === 'view'}
                />
              </div>
              <div>
                <label className="f-label">Belge no</label>
                <div className="f-input" style={{ display: 'flex', alignItems: 'center', minHeight: 36, color: '#0f172a', background: '#f8fafc', fontWeight: 800 }}>
                  {form.documentNo}
                </div>
              </div>
            </div>

            {invoiceRequired && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid #fed7aa',
                  background: '#fff7ed',
                  color: '#9a3412',
                  fontSize: '.76rem',
                  lineHeight: 1.55,
                }}
              >
                Bu transfer farkli tuzel kisilikler arasinda gorunuyor. Bu islem icin fatura kesilmesi gerekebilir.
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16, display: 'grid', gap: 14, boxShadow: 'none', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Belge Satirlari</div>
                <div style={{ fontSize: '.79rem', color: '#64748b', marginTop: 3 }}>
                  Transferler gonderen bakiyeden cikis yapar, hedefte ise kabul edilene kadar yolda kalir.
                </div>
              </div>
              {formMode !== 'view' && (
                <button type="button" className="btn-o" onClick={addRow}>
                  <i className="fa-solid fa-plus" /> Satir Ekle
                </button>
              )}
            </div>

            <div>
              <label className="f-label">Belge notu</label>
              <input
                className="f-input"
                value={form.note}
                onChange={event => updateForm({ note: event.target.value })}
                placeholder="Istege bagli belge notu..."
                disabled={formMode === 'view'}
              />
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', overflow: 'visible' }}>
              <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
              <table className="tbl" style={{ minWidth: 1080, marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ width: 210 }}>Malzeme tipi</th>
                    <th style={{ width: 320 }}>Malzeme</th>
                    <th style={{ width: 170 }}>Porsiyon</th>
                    <th style={{ width: 130 }}>Miktar</th>
                    <th style={{ width: 250 }}>Birim maliyet</th>
                    <th style={{ width: 72, textAlign: 'center' }}>Islem</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.rows || []).map(row => {
                    const rowItemOptions = getRowItemOptions(row)
                    const selectedItem = getRowSelectedItem(row)
                    const portionOptions = row.itemType === 'sale_item'
                      ? getSalePortionOptions(selectedItem)
                      : [{
                        value: STANDARD_PORTION_ID,
                        label: 'Standart',
                        selectedLabel: 'Standart',
                        description: 'Porsiyon secimi gerekmiyor',
                        icon: 'fa-bowl-food',
                        meta: 'Standart',
                      }]

                    return (
                      <tr key={row.id}>
                        <td style={{ verticalAlign: 'top' }}>
                          <select
                            className="f-input"
                            value={row.itemType}
                            onChange={event => updateRow(row.id, 'itemType', event.target.value)}
                            disabled={formMode === 'view'}
                            style={{ minHeight: 36 }}
                          >
                            {ITEM_TYPE_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                          <SearchableSelect
                            value={row.itemId}
                            onChange={nextValue => updateRow(row.id, 'itemId', nextValue)}
                            options={rowItemOptions}
                            placeholder="Malzeme secin..."
                            searchPlaceholder="Malzeme ara..."
                            allowClear={false}
                            disabled={formMode === 'view'}
                          />
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                          <div style={{ padding: 6, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
                            {row.itemType === 'sale_item' ? (
                              <SearchableSelect
                                value={row.portionId || STANDARD_PORTION_ID}
                                onChange={nextValue => updateRow(row.id, 'portionId', nextValue)}
                                options={portionOptions}
                                placeholder="Porsiyon secin..."
                                searchPlaceholder="Porsiyon ara..."
                                allowClear={false}
                                disabled={formMode === 'view'}
                              />
                            ) : (
                              <input className="f-input" value="Standart" readOnly style={{ background: '#fff' }} />
                            )}
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                          <div style={{ padding: 6, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
                            <input
                              className="f-input"
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.quantity}
                              onChange={event => updateRow(row.id, 'quantity', event.target.value)}
                              placeholder="0,000"
                              disabled={formMode === 'view'}
                              style={{ background: '#fff' }}
                            />
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                          <div style={{ padding: 6, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: formMode !== 'view' ? '1fr auto' : '1fr', gap: 8, alignItems: 'center' }}>
                              <input
                                className="f-input"
                                type="number"
                                min="0"
                                step="0.0001"
                                value={row.useCustomPrice ? row.unitCost : row.baseUnitCost}
                                onChange={event => updateRow(row.id, 'unitCost', event.target.value)}
                                placeholder="0,0000"
                                readOnly={!row.useCustomPrice || formMode === 'view'}
                                style={{ background: '#fff' }}
                              />
                              {formMode !== 'view' && (
                                <button
                                  type="button"
                                  className="btn-o"
                                  onClick={() => updateRow(row.id, 'useCustomPrice', !row.useCustomPrice)}
                                  style={{ whiteSpace: 'nowrap', minWidth: 116 }}
                                >
                                  {row.useCustomPrice ? 'Oto Maliyet' : 'Fiyat Belirle'}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                          {formMode !== 'view' && (
                            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 6 }}>
                              <button
                                type="button"
                                className="ico-btn del"
                                onClick={() => removeRow(row.id)}
                                title="Satiri kaldir"
                              >
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                          )}
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
                {formMode !== 'view' ? (
                  <button type="button" className="btn-o" onClick={handleSaveDraft} disabled={savingDraft || saving}>
                    <i className={`fa-solid ${savingDraft ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} /> {savingDraft ? 'Taslak kaydediliyor...' : 'Taslak Kaydet'}
                  </button>
                ) : null}
                <button type="button" className="btn-o" onClick={() => setEditorOpen(false)} disabled={saving || savingDraft}>
                  Kapat
                </button>
                {formMode !== 'view' ? (
                  <button type="submit" className="btn-p" disabled={saving}>
                    {saving ? 'Kaydediliyor...' : (isEditingSavedDocument ? 'Degisiklikleri Kaydet' : 'Transferi Kaydet')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </>
  )
}
