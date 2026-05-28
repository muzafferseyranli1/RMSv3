import { useMemo, useSyncExternalStore } from 'react'
import { db } from '@/lib/db'
import { normalizeDemoSalesSettings } from '@/lib/demoSalesSettings'
import {
  buildBranchDayReceipts,
  buildMovementCandidatesForSales,
  findFastSalesChannel,
  prepareDemoGeneration,
} from '@/lib/demoSalesGenerator'

const SALES_INSERT_CHUNK = 20
const LINES_INSERT_CHUNK = 40
const PAYMENTS_INSERT_CHUNK = 30
const MOVEMENTS_INSERT_CHUNK = 60
const SALE_ID_QUERY_CHUNK = 20
const SALE_ID_DELETE_CHUNK = 10
const LOOP_PAUSE_MS = 2000

const IDLE_JOB = {
  id: null,
  status: 'idle',
  totalBranchDays: 0,
  processedBranchDays: 0,
  salesCreated: 0,
  linesCreated: 0,
  paymentsCreated: 0,
  movementsCreated: 0,
  repairedBranchDays: 0,
  message: '',
  error: '',
  queue: [],
  branches: [],
  settings: null,
  startIsoDay: '',
  endIsoDay: '',
  createdAt: null,
  updatedAt: null,
}

function nowIso() {
  return new Date().toISOString()
}

function sleep(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function readStoredJob() {
  return IDLE_JOB
}

function writeStoredJob(job) {
  // Foreground only, no persistence
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function asUuidOrNull(value) {
  const str = String(value || '').trim()
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str) ? str : null
}

function chunkArray(list, size) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) {
    chunks.push(list.slice(index, index + size))
  }
  return chunks
}

function balanceKey(itemType, stockItemId, semiItemId, branchKey) {
  return `${itemType}:${stockItemId || ''}:${semiItemId || ''}:${branchKey || ''}`
}

function normalizeBranchKey(branchId, branchName) {
  const id = String(branchId || '').trim()
  if (id) return `id:${id}`
  const name = String(branchName || '').trim().toLocaleLowerCase('tr')
  return name ? `name:${name}` : ''
}

function applyMovementBalance(balanceState, candidate) {
  const branchKey = normalizeBranchKey(candidate.branchId, candidate.branchName)
  const key = balanceKey(candidate.itemType, candidate.stockItemId, candidate.semiItemId, branchKey)
  const prev = balanceState.get(key) || { qty: 0, totalCost: 0, avgCost: 0 }
  const nextQty = prev.qty - Number(candidate.quantity || 0)
  const movementUnitCost = Number(candidate.unitCost || prev.avgCost || 0)
  const movementTotalCost = movementUnitCost * Number(candidate.quantity || 0)
  const nextTotalCost = prev.totalCost - movementTotalCost
  const nextAvgCost = nextQty > 0 ? (nextTotalCost / nextQty) : movementUnitCost
  const next = { qty: nextQty, totalCost: nextTotalCost, avgCost: nextAvgCost }
  balanceState.set(key, next)
  return {
    unitCost: movementUnitCost,
    totalCost: movementTotalCost,
    balanceQtyAfter: nextQty,
    balanceTotalCostAfter: nextTotalCost,
    avgUnitCostAfter: nextAvgCost,
  }
}

function mapCandidatesToMovementRows(candidates, balanceState) {
  return (candidates || []).map(candidate => {
    const calc = applyMovementBalance(balanceState, candidate)
    return {
      company_id: candidate.companyId || null,
      legal_entity_id: candidate.legalEntityId || null,
      org_unit_id: candidate.orgUnitId || null,
      branch_id: candidate.branchId || null,
      branch_name: candidate.branchName || null,
      item_type: candidate.itemType,
      stock_item_id: candidate.stockItemId || null,
      semi_item_id: candidate.semiItemId || null,
      item_name: candidate.itemName,
      item_sku: candidate.itemSku || null,
      unit: candidate.unit || null,
      movement_type: 'sale_consumption',
      source_doc_type: 'sale',
      direction: 'out',
      movement_at: candidate.movementAt,
      quantity: candidate.quantity,
      source_doc_id: candidate.saleId,
      source_doc_line_id: candidate.saleLineId,
      sale_id: candidate.saleId,
      sale_line_id: candidate.saleLineId,
      sale_item_id: candidate.saleItemId || null,
      sales_channel_id: candidate.salesChannelId || null,
      sales_channel_name: candidate.salesChannelName || null,
      portion_id: candidate.portionId || null,
      portion_name: candidate.portionName || null,
      recipe_row_id: candidate.recipeRowId || null,
      unit_cost: calc.unitCost,
      total_cost: calc.totalCost,
      avg_unit_cost_after: calc.avgUnitCostAfter,
      balance_qty_after: calc.balanceQtyAfter,
      balance_total_cost_after: calc.balanceTotalCostAfter,
      calc_status: 'pending',
      notes: candidate.note || null,
      meta: candidate.meta || {},
    }
  })
}

async function insertRows(table, rows, chunkSize) {
  for (const chunk of chunkArray(rows, chunkSize)) {
    if (!chunk.length) continue
    const { error } = await db.from(table).insert(chunk)
    if (error) throw error
  }
}

async function fetchExistingDemoSales(branch, isoDay) {
  const startAt = `${isoDay}T00:00:00+03:00`
  const endAt = `${isoDay}T23:59:59+03:00`
  const branchUuid = asUuidOrNull(branch?.branchId)
  let query = db
    .from('sales')
    .select('id,sale_datetime,branch_id,branch_name,sales_channel_id,sales_channel_name,local_id')
    .eq('integration_ref', 'demo-sales-tool')
    .gte('sale_datetime', startAt)
    .lte('sale_datetime', endAt)
    .order('sale_datetime', { ascending: true })

  query = branchUuid
    ? query.eq('branch_id', branchUuid)
    : query.eq('branch_name', branch?.branchName || '')

  const { data, error } = await query

  if (error) throw error
  return data || []
}

async function fetchSaleLines(saleIds) {
  if (!saleIds.length) return []
  const rows = []

  for (const chunk of chunkArray(saleIds, SALE_ID_QUERY_CHUNK)) {
    const { data, error } = await db
      .from('sale_lines')
      .select('id,sale_id,product_id,product_name,portion_id,portion_name,qty,line_no')
      .in('sale_id', chunk)
      .order('line_no', { ascending: true })

    if (error) throw error
    if (data?.length) rows.push(...data)
  }

  return rows
}

async function deleteSaleMovements(saleIds) {
  if (!saleIds.length) return

  for (const chunk of chunkArray(saleIds, SALE_ID_DELETE_CHUNK)) {
    const { error } = await db
      .from('inventory_movements')
      .delete()
      .eq('source_doc_type', 'sale')
      .in('source_doc_id', chunk)

    if (error) throw error
  }
}

let jobState = readStoredJob()
const listeners = new Set()
const runtimeRef = { current: null }
let loopScheduled = false
let busy = false

function emitJobState(nextJob) {
  jobState = nextJob
  writeStoredJob(jobState)
  listeners.forEach(listener => listener())
}

function updateJob(updater) {
  const nextJob = typeof updater === 'function' ? updater(jobState) : updater
  emitJobState(nextJob)
  scheduleLoop()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return jobState
}

async function buildRuntime(currentJob) {
  if (runtimeRef.current?.jobId === currentJob.id) return runtimeRef.current

  const [
    { data: products, error: productsError },
    { data: channels, error: channelsError },
    { data: categories, error: categoriesError },
    { data: taxes, error: taxesError },
    { data: stockItems, error: stockItemsError },
    { data: semiItems, error: semiItemsError },
  ] = await Promise.all([
    db.from('sale_items').select('id,sku,name,deleted_at,sale_status,setting_active,standard_price,portions,option_groups,channel_prices,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,recipe_rows,recipe_output_qty').is('deleted_at', null).order('name'),
    db.from('sales_channels').select('*').is('deleted_at', null).eq('active', true).order('sort_order'),
    db.from('sale_categories').select('id,name,parent_id,deleted_at').is('deleted_at', null).order('name'),
    db.from('taxes').select('id,name,rate,deleted_at').is('deleted_at', null).order('rate'),
    db.from('stock_items').select('id,name,sku,unit').is('deleted_at', null).order('name'),
    db.from('semi_items').select('id,name,sku,recipe_output_unit').is('deleted_at', null).order('name'),
  ])

  if (productsError) throw productsError
  if (channelsError) throw channelsError
  if (categoriesError) throw categoriesError
  if (taxesError) throw taxesError
  if (stockItemsError) throw stockItemsError
  if (semiItemsError) throw semiItemsError

  const channel = findFastSalesChannel(channels || [])
  if (!channel) throw new Error('Aktif Hizli Satis kanali bulunamadi')

  const branches = Array.isArray(currentJob.branches) ? currentJob.branches : []
  const generator = prepareDemoGeneration({
    branches,
    products: products || [],
    categories: categories || [],
    taxes: taxes || [],
    channel,
    settings: normalizeDemoSalesSettings(currentJob.settings || {}),
    stockItems: stockItems || [],
    semiItems: semiItems || [],
  })

  const branchesById = new Map(branches.map(branch => [String(branch.branchId || '').trim(), branch]).filter(([key]) => key))
  const branchesByName = new Map(branches.map(branch => [normalizeText(branch.branchName), branch]).filter(([key]) => key))
  runtimeRef.current = {
    jobId: currentJob.id,
    branches,
    branchesById,
    branchesByName,
    generator,
  }
  return runtimeRef.current
}

function resolveBranchContext(branchItem, runtime) {
  const byId = runtime.branchesById.get(String(branchItem?.branchId || '').trim())
  if (byId) return byId
  const byName = runtime.branchesByName.get(normalizeText(branchItem?.branchName))
  if (byName) return byName
  return null
}

async function repairBranchDay(branchItem, runtime) {
  const branch = resolveBranchContext(branchItem, runtime)
  if (!branch) throw new Error(`Sube baglami bulunamadi: ${branchItem.branchName || branchItem.branchId}`)

  const existingSales = await fetchExistingDemoSales(branch, branchItem.isoDay)
  if (!existingSales.length) {
    return {
      mode: 'repair',
      salesCreated: 0,
      linesCreated: 0,
      paymentsCreated: 0,
      movementsCreated: 0,
      repairedBranchDays: 0,
      message: `${branch.branchName} / ${branchItem.isoDay} icin onarilacak demo satis bulunamadi`,
    }
  }

  const saleIds = existingSales.map(sale => sale.id)
  const saleLines = await fetchSaleLines(saleIds)
  await deleteSaleMovements(saleIds)

  const movementCandidates = buildMovementCandidatesForSales({
    sales: existingSales,
    saleLines,
    generator: runtime.generator,
    branches: runtime.branches,
  })
  const movementRows = mapCandidatesToMovementRows(movementCandidates, new Map())
  await insertRows('inventory_movements', movementRows, MOVEMENTS_INSERT_CHUNK)

  return {
    mode: 'repair',
    salesCreated: 0,
    linesCreated: 0,
    paymentsCreated: 0,
    movementsCreated: movementRows.length,
    repairedBranchDays: 1,
    message: `${branch.branchName} / ${branchItem.isoDay} stok hareketleri onarildi`,
  }
}

async function generateBranchDay(branchItem, runtime) {
  const branch = resolveBranchContext(branchItem, runtime)
  if (!branch) throw new Error(`Sube baglami bulunamadi: ${branchItem.branchName || branchItem.branchId}`)

  const existingSales = await fetchExistingDemoSales(branch, branchItem.isoDay)
  if (existingSales.length) {
    return repairBranchDay(branchItem, runtime)
  }

  const receipts = buildBranchDayReceipts({
    branch,
    isoDay: branchItem.isoDay,
    existingCount: branchItem.existingCount || 0,
    generator: runtime.generator,
  })

  const salesRows = receipts.map(receipt => receipt.header)
  const saleLineRows = receipts.flatMap(receipt => receipt.lines)
  const paymentRows = receipts.flatMap(receipt => receipt.payments)
  const movementRows = mapCandidatesToMovementRows(
    receipts.flatMap(receipt => receipt.movementCandidates || []),
    new Map()
  )

  await insertRows('sales', salesRows, SALES_INSERT_CHUNK)
  await insertRows('sale_lines', saleLineRows, LINES_INSERT_CHUNK)
  await insertRows('sale_payments', paymentRows, PAYMENTS_INSERT_CHUNK)
  await insertRows('inventory_movements', movementRows, MOVEMENTS_INSERT_CHUNK)

  return {
    mode: 'generate',
    salesCreated: salesRows.length,
    linesCreated: saleLineRows.length,
    paymentsCreated: paymentRows.length,
    movementsCreated: movementRows.length,
    repairedBranchDays: 0,
    message: `${branch.branchName} / ${branchItem.isoDay} tamamlandi`,
  }
}

async function runNextStep() {
  loopScheduled = false
  if (busy) return
  if (jobState.status !== 'running') return

  if (!jobState.queue.length) {
    updateJob(prev => ({
      ...prev,
      status: 'completed',
      message: 'Demo satis kuyrugu tamamlandi. Guncel ozet icin Tekrar Tara.',
      updatedAt: nowIso(),
    }))
    return
  }

  busy = true
  const nextItem = jobState.queue[0]

  try {
    updateJob(prev => ({
      ...prev,
      message: `${nextItem.branchName} / ${nextItem.isoDay} isleniyor`,
      error: '',
      updatedAt: nowIso(),
    }))

    const runtime = await buildRuntime(jobState)
    const result = nextItem.mode === 'repair'
      ? await repairBranchDay(nextItem, runtime)
      : await generateBranchDay(nextItem, runtime)

    updateJob(prev => {
      const [, ...restQueue] = prev.queue
      const nextJob = {
        ...prev,
        queue: restQueue,
        processedBranchDays: prev.processedBranchDays + 1,
        salesCreated: prev.salesCreated + (result.salesCreated || 0),
        linesCreated: prev.linesCreated + (result.linesCreated || 0),
        paymentsCreated: prev.paymentsCreated + (result.paymentsCreated || 0),
        movementsCreated: prev.movementsCreated + (result.movementsCreated || 0),
        repairedBranchDays: prev.repairedBranchDays + (result.repairedBranchDays || 0),
        message: result.message || prev.message,
        error: '',
        updatedAt: nowIso(),
      }

      if (!restQueue.length) {
        nextJob.status = 'completed'
        nextJob.message = 'Demo satis kuyrugu tamamlandi. Guncel ozet icin Tekrar Tara.'
      }

      return nextJob
    })

    await sleep(LOOP_PAUSE_MS)
  } catch (error) {
    runtimeRef.current = null
    updateJob(prev => ({
      ...prev,
      status: 'error',
      error: error?.message || 'Demo satis kuyrugu durdu',
      message: error?.message || 'Demo satis kuyrugu durdu',
      updatedAt: nowIso(),
    }))
  } finally {
    busy = false
    scheduleLoop()
  }
}

function scheduleLoop() {
  if (typeof window === 'undefined') return
  if (loopScheduled || busy || jobState.status !== 'running') return
  loopScheduled = true
  window.setTimeout(() => {
    runNextStep()
  }, LOOP_PAUSE_MS)
}

export function startDemoSalesJob({ summary, settings }) {
  const repairQueue = (summary?.repairBranchDays || []).map(item => ({ ...item, mode: 'repair' }))
  const generateQueue = (summary?.missingBranchDays || []).map(item => ({ ...item, mode: 'generate' }))
  const queue = [...repairQueue, ...generateQueue]
  if (!queue.length) return false

  runtimeRef.current = null
  updateJob({
    id: `demo-sales-${Date.now()}`,
    status: 'running',
    totalBranchDays: queue.length,
    processedBranchDays: 0,
    salesCreated: 0,
    linesCreated: 0,
    paymentsCreated: 0,
    movementsCreated: 0,
    repairedBranchDays: 0,
    message: 'Demo satis kuyrugu hazirlaniyor',
    error: '',
    queue,
    branches: Array.isArray(summary?.branches) ? summary.branches : [],
    settings: normalizeDemoSalesSettings(settings || {}),
    startIsoDay: summary?.startIsoDay || '',
    endIsoDay: summary?.endIsoDay || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  })
  return true
}

export function pauseDemoSalesJob() {
  updateJob(prev => {
    if (prev.status !== 'running') return prev
    return {
      ...prev,
      status: 'paused',
      message: 'Demo satis kuyrugu duraklatildi',
      updatedAt: nowIso(),
    }
  })
}

export function resumeDemoSalesJob() {
  updateJob(prev => {
    if (!prev.queue.length) return prev
    return {
      ...prev,
      status: 'running',
      message: prev.error ? 'Kuyruk yeniden baslatildi' : 'Demo satis kuyrugu devam ediyor',
      error: '',
      updatedAt: nowIso(),
    }
  })
}

export function clearDemoSalesJob() {
  runtimeRef.current = null
  updateJob(IDLE_JOB)
}

export function useDemoSalesJob() {
  const job = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return useMemo(() => ({
    job,
    startJob: startDemoSalesJob,
    pauseJob: pauseDemoSalesJob,
    resumeJob: resumeDemoSalesJob,
    clearJob: clearDemoSalesJob,
  }), [job])
}

scheduleLoop()
