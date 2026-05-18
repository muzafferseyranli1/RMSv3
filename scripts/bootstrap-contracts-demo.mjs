const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

const argv = new Set(process.argv.slice(2))
const dryRun = argv.has('--dry-run')
const verifyOnly = argv.has('--verify-only')

const CONTRACT_PREFIX = 'DEMO-KNT-202605-'
const RECEIPT_PREFIX = 'DEMO-MK-202605-'
const DEMO_DATE = '2026-05-11'

const IDS = {
  suppliers: {
    meat: 'b0d10002-0000-4000-8000-000000000002',
    dairy: 'b0d10003-0000-4000-8000-000000000003',
    sauce: 'b0d10004-0000-4000-8000-000000000004',
    metro: 'b0d10007-0000-4000-8000-000000000007',
    forno: 'b0d10006-0000-4000-8000-000000000006',
  },
  stock: {
    patty: 'b0e10003-0000-4000-8000-000000000003',
    chickenPatty: 'b0e10004-0000-4000-8000-000000000004',
    fries: 'b0e10007-0000-4000-8000-000000000007',
    cheddar: 'b0e1000a-0000-4000-8000-000000000010',
    mozzarella: 'b0e1000b-0000-4000-8000-000000000011',
    cream: 'b0e1000d-0000-4000-8000-000000000013',
    ketchup: 'b0e10013-0000-4000-8000-000000000019',
    mayo: 'b0e10015-0000-4000-8000-000000000021',
    bbq: 'b0e10016-0000-4000-8000-000000000022',
    tomatoPaste: 'b0e10012-0000-4000-8000-000000000018',
    cola: 'b0e1001d-0000-4000-8000-000000000029',
    water: 'b0e1001e-0000-4000-8000-000000000030',
    lemonade: 'b0e1001f-0000-4000-8000-000000000031',
    pizzaDough: 'b0e10002-0000-4000-8000-000000000002',
    flour: 'b0e1001b-0000-4000-8000-000000000027',
  },
}

const CONTRACTS = [
  {
    no: '001',
    id: 'd0c10001-0000-4000-8000-000000000001',
    supplierId: IDS.suppliers.meat,
    templateName: 'İstanbul Şubeleri',
    startDate: '2026-05-01',
    endDate: '2026-08-31',
    warningDays: 15,
    useRatio: 0.55,
    rows: [
      { stockId: IDS.stock.patty, price: 36.50, qty: 600 },
      { stockId: IDS.stock.chickenPatty, price: 27.00, qty: 400 },
      { stockId: IDS.stock.fries, price: 0.27, qty: 90000 },
    ],
  },
  {
    no: '002',
    id: 'd0c10002-0000-4000-8000-000000000002',
    supplierId: IDS.suppliers.dairy,
    templateName: 'Tüm Şubeler',
    startDate: '2026-05-01',
    endDate: '2026-09-30',
    warningDays: 15,
    useRatio: 0.80,
    rows: [
      { stockId: IDS.stock.cheddar, price: 0.82, qty: 60000 },
      { stockId: IDS.stock.mozzarella, price: 1.15, qty: 50000 },
      { stockId: IDS.stock.cream, price: 0.52, qty: 30000 },
    ],
  },
  {
    no: '003',
    id: 'd0c10003-0000-4000-8000-000000000003',
    supplierId: IDS.suppliers.sauce,
    templateName: 'Kampanya Şubeleri',
    startDate: '2026-04-15',
    endDate: '2026-07-31',
    warningDays: 15,
    useRatio: 1.05,
    rows: [
      { stockId: IDS.stock.ketchup, price: 0.11, qty: 25000 },
      { stockId: IDS.stock.mayo, price: 0.17, qty: 22000 },
      { stockId: IDS.stock.bbq, price: 0.21, qty: 14000 },
      { stockId: IDS.stock.tomatoPaste, price: 0.075, qty: 50000 },
    ],
  },
  {
    no: '004',
    id: 'd0c10004-0000-4000-8000-000000000004',
    supplierId: IDS.suppliers.metro,
    templateName: 'Ege Akdeniz Şubeleri',
    startDate: '2026-04-20',
    endDate: '2026-05-20',
    warningDays: 15,
    useRatio: 0.35,
    rows: [
      { stockId: IDS.stock.cola, price: 17.50, qty: 1000 },
      { stockId: IDS.stock.water, price: 4.75, qty: 1600 },
      { stockId: IDS.stock.lemonade, price: 0.33, qty: 20000 },
    ],
  },
  {
    no: '005',
    id: 'd0c10005-0000-4000-8000-000000000005',
    supplierId: IDS.suppliers.forno,
    templateName: 'Franchise Şubeleri',
    startDate: '2026-03-01',
    endDate: '2026-05-01',
    warningDays: 15,
    useRatio: 0.90,
    rows: [
      { stockId: IDS.stock.pizzaDough, price: 11.50, qty: 800 },
      { stockId: IDS.stock.flour, price: 0.019, qty: 120000 },
    ],
  },
]

function demoContractNo(spec) {
  return `${CONTRACT_PREFIX}${spec.no}`
}

function demoReceiptNo(spec) {
  return `${RECEIPT_PREFIX}${spec.no}`
}

function uuid(group, contractNo, rowNo = 0) {
  const groupHex = {
    receipt: 'd0c2',
    line: 'd0c3',
    movement: 'd0c4',
  }[group]
  return `${groupHex}${contractNo.padStart(4, '0')}-0000-4000-8000-${String(rowNo + 1).padStart(12, '0')}`
}

function parseJsonMaybe(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

function flattenBranches(nodes, result = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.type === 'sube') result.push({ id: String(node.id), name: node.name })
    if (Array.isArray(node?.children)) flattenBranches(node.children, result)
  }
  return result
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function roundQty(value) {
  return Number(Number(value).toFixed(4))
}

function contractMeta() {
  return { source: 'demo-contracts-bootstrap', generated_at: `${DEMO_DATE}T12:00:00.000Z` }
}

async function apiQuery(payload) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  const result = await response.json()
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error))
  return result.data
}

function filtersIn(col, val) {
  return { type: 'in', col, val }
}

async function selectTable(table, select = '*', filters = []) {
  return apiQuery({ table, operation: 'select', select, filters })
}

async function deleteWhere(table, filters) {
  return apiQuery({ table, operation: 'delete', filters })
}

const JSON_COLUMNS = {
  contracts: new Set(['branches', 'rows']),
  purchase_receipts: new Set(['meta']),
  purchase_receipt_lines: new Set(['meta']),
  inventory_movements: new Set(['meta']),
}

function normalizeRecordForApi(table, record) {
  const jsonColumns = JSON_COLUMNS[table]
  if (!jsonColumns) return record
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    jsonColumns.has(key) && value !== null && typeof value === 'object'
      ? JSON.stringify(value)
      : value,
  ]))
}

async function insertRows(table, data) {
  if (!data.length) return []
  return apiQuery({ table, operation: 'insert', data: data.map(record => normalizeRecordForApi(table, record)) })
}

async function updateWhere(table, data, filters) {
  return apiQuery({ table, operation: 'update', data: normalizeRecordForApi(table, data), filters })
}

async function readDependencies() {
  const [suppliers, stockItems, templates, settingsRows, inventoryRows, receipts, receiptLines, contracts] = await Promise.all([
    selectTable('suppliers', 'id,name,active,deleted_at'),
    selectTable('stock_items', 'id,name,sku,unit,supp_id,suppliers_list,purchase_price,deleted_at'),
    selectTable('branch_templates', 'id,name,branch_ids'),
    selectTable('settings', 'key,value', [{ type: 'eq', col: 'key', val: 'company_tree' }]),
    selectTable('inventory_movements', 'id,ledger_seq,stock_item_id,branch_id,branch_name,movement_at,balance_qty_after,balance_total_cost_after,avg_unit_cost_after,source_doc_no,deleted_at,is_cancelled', [{ type: 'limit', val: 5000 }]),
    selectTable('purchase_receipts', 'id,receipt_no'),
    selectTable('purchase_receipt_lines', 'id,receipt_id,inventory_movement_id'),
    selectTable('contracts', 'id,contract_no,rows,deleted_at'),
  ])

  const companyTree = settingsRows.find(row => row.key === 'company_tree')?.value || []
  const branches = flattenBranches(companyTree)
  return { suppliers, stockItems, templates, branches, inventoryRows, receipts, receiptLines, contracts }
}

function assertDependencies(deps) {
  const suppliersById = new Map(deps.suppliers.map(row => [row.id, row]))
  const stockById = new Map(deps.stockItems.map(row => [row.id, row]))
  const templatesByName = new Map(deps.templates.map(row => [row.name, row]))

  for (const spec of CONTRACTS) {
    const supplier = suppliersById.get(spec.supplierId)
    if (!supplier || supplier.active === false || supplier.deleted_at) throw new Error(`Aktif tedarikci bulunamadi: ${spec.supplierId}`)
    const template = templatesByName.get(spec.templateName)
    if (!template) throw new Error(`Sube sablonu bulunamadi: ${spec.templateName}`)
    const branchIds = parseJsonMaybe(template.branch_ids, [])
    if (!branchIds.length) throw new Error(`Sube sablonu bos: ${spec.templateName}`)
    for (const row of spec.rows) {
      const stock = stockById.get(row.stockId)
      if (!stock || stock.deleted_at) throw new Error(`Aktif stok mali bulunamadi: ${row.stockId}`)
      if (!stockMatchesSupplier(stock, spec.supplierId)) {
        throw new Error(`${stock.name} stok mali ${supplier.name} tedarikcisine bagli degil.`)
      }
    }
  }
}

function stockMatchesSupplier(stock, supplierId) {
  if (stock.supp_id === supplierId) return true
  const supplierList = parseJsonMaybe(stock.suppliers_list, [])
  return supplierList.some(item => item?.supp_id === supplierId)
}

function latestBalanceMap(inventoryRows, receiptNos) {
  const demoReceiptNos = new Set(receiptNos)
  const rows = inventoryRows
    .filter(row => !demoReceiptNos.has(row.source_doc_no))
    .filter(row => !row.deleted_at && row.is_cancelled === false)
    .sort((left, right) => {
      const time = String(right.movement_at || '').localeCompare(String(left.movement_at || ''))
      if (time !== 0) return time
      return Number(right.ledger_seq || 0) - Number(left.ledger_seq || 0)
    })
  const map = new Map()
  for (const row of rows) {
    const key = `${row.branch_id || row.branch_name || ''}|${row.stock_item_id || ''}`
    if (!map.has(key)) {
      map.set(key, {
        balance_qty_after: toNumber(row.balance_qty_after),
        balance_total_cost_after: toNumber(row.balance_total_cost_after),
        avg_unit_cost_after: toNumber(row.avg_unit_cost_after),
      })
    }
  }
  return map
}

function buildDemoRecords(deps) {
  const suppliersById = new Map(deps.suppliers.map(row => [row.id, row]))
  const stockById = new Map(deps.stockItems.map(row => [row.id, row]))
  const templatesByName = new Map(deps.templates.map(row => [row.name, row]))
  const branchById = new Map(deps.branches.map(row => [row.id, row]))
  const receiptNos = CONTRACTS.map(demoReceiptNo)
  const balances = latestBalanceMap(deps.inventoryRows, receiptNos)

  const contracts = []
  const receipts = []
  const receiptLines = []
  const movements = []

  for (const spec of CONTRACTS) {
    const contractNo = demoContractNo(spec)
    const receiptNo = demoReceiptNo(spec)
    const supplier = suppliersById.get(spec.supplierId)
    const template = templatesByName.get(spec.templateName)
    const branchIds = parseJsonMaybe(template.branch_ids, [])
    const selectedBranch = branchById.get(String(branchIds[0]))
    if (!selectedBranch) throw new Error(`${spec.templateName} icin ilk sube company_tree icinde bulunamadi.`)

    const branches = [{
      type: 'template',
      id: template.id,
      name: template.name,
      branchIds,
    }]

    const contractRows = spec.rows.map(row => {
      const stock = stockById.get(row.stockId)
      return {
        stock_item_id: stock.id,
        name: stock.name,
        sku: stock.sku || '',
        unit: stock.unit || '',
        price: row.price,
        qty: row.qty,
        warning_ratio: 0.8,
        overrun_ratio: 0.2,
        block_purchase: true,
      }
    })

    contracts.push({
      id: spec.id,
      contract_no: contractNo,
      start_date: spec.startDate,
      end_date: spec.endDate,
      warning_days: spec.warningDays,
      total_quota_active: true,
      total_quota_warning_ratio: 0.8,
      total_quota_overrun_ratio: 0.2,
      end_grace_days: 15,
      price_tolerance: 0.05,
      block_on_exceed: true,
      warn_only_on_exceed: false,
      supplier_id: spec.supplierId,
      branches,
      rows: contractRows,
    })

    const deliveredOn = spec.no === '005' ? '2026-04-20' : '2026-05-10'
    const receiptId = uuid('receipt', spec.no)
    const lineRows = []
    const movementRows = []
    let totalQty = 0
    let subtotal = 0

    spec.rows.forEach((row, index) => {
      const stock = stockById.get(row.stockId)
      const receivedQty = roundQty(row.qty * spec.useRatio)
      const lineTotal = Number((receivedQty * row.price).toFixed(4))
      const lineId = uuid('line', spec.no, index)
      const movementId = uuid('movement', spec.no, index)
      const balanceKey = `${selectedBranch.id}|${stock.id}`
      const previous = balances.get(balanceKey) || { balance_qty_after: 0, balance_total_cost_after: 0 }
      const nextQty = Number((toNumber(previous.balance_qty_after) + receivedQty).toFixed(6))
      const nextTotalCost = Number((toNumber(previous.balance_total_cost_after) + lineTotal).toFixed(6))
      const nextAvg = nextQty > 0 ? Number((nextTotalCost / nextQty).toFixed(6)) : row.price

      balances.set(balanceKey, {
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        avg_unit_cost_after: nextAvg,
      })

      lineRows.push({
        id: lineId,
        receipt_id: receiptId,
        order_id: null,
        order_line_id: null,
        line_no: index + 1,
        stock_item_id: stock.id,
        item_name: stock.name,
        item_sku: stock.sku || '',
        unit: stock.unit || '',
        suggested_qty: row.qty,
        ordered_qty: row.qty,
        calculated_need: row.qty,
        received_qty: receivedQty,
        unit_price: row.price,
        vat_rate: 0.1,
        line_total: lineTotal,
        line_total_vat_inc: Number((lineTotal * 1.1).toFixed(4)),
        inventory_movement_id: movementId,
        notes: `Demo kontrat ${contractNo} mal kabul satiri`,
        meta: contractMeta(),
      })

      movementRows.push({
        id: movementId,
        item_type: 'stock_item',
        stock_item_id: stock.id,
        semi_item_id: null,
        item_name: stock.name,
        item_sku: stock.sku || null,
        unit: stock.unit || null,
        branch_id: selectedBranch.id,
        branch_name: selectedBranch.name,
        movement_type: 'purchase_receipt',
        source_doc_type: 'purchase_receipt',
        direction: 'in',
        movement_at: `${deliveredOn}T10:00:00`,
        quantity: receivedQty,
        source_doc_id: receiptId,
        source_doc_line_id: lineId,
        source_doc_no: receiptNo,
        source_doc_ref: contractNo,
        supplier_id: spec.supplierId,
        unit_cost: row.price,
        total_cost: lineTotal,
        avg_unit_cost_after: nextAvg,
        balance_qty_after: nextQty,
        balance_total_cost_after: nextTotalCost,
        calc_status: 'calculated',
        notes: `Demo kontrat kullanim hareketi: ${contractNo}`,
        meta: { ...contractMeta(), contract_no: contractNo },
      })

      totalQty += receivedQty
      subtotal += lineTotal
    })

    receipts.push({
      id: receiptId,
      receipt_no: receiptNo,
      order_id: null,
      order_no: null,
      branch_id: selectedBranch.id,
      branch_name: selectedBranch.name,
      supplier_id: spec.supplierId,
      supplier_name: supplier.name,
      flow_name: `Demo kontrat mal kabul ${contractNo}`,
      description: `${contractNo} kapsaminda demo mal kabul`,
      planned_delivery_date: deliveredOn,
      delivered_on: deliveredOn,
      delivered_at: '10:00:00',
      doc_kind: 'irsaliye',
      doc_date: deliveredOn,
      doc_no: receiptNo,
      note: 'Demo sözleşme kullanım verisi',
      explanation: 'Sözleşmeler modülü demo kota kullanımı için oluşturuldu.',
      status: 'completed',
      total_qty: Number(totalQty.toFixed(4)),
      subtotal: Number(subtotal.toFixed(4)),
      total_amount: Number(subtotal.toFixed(4)),
      total_amount_vat_inc: Number((subtotal * 1.1).toFixed(4)),
      inventory_posted_at: `${deliveredOn}T10:00:00`,
      inventory_post_error: null,
      meta: { ...contractMeta(), contract_no: contractNo },
    })
    receiptLines.push(...lineRows)
    movements.push(...movementRows)
  }

  return { contracts, receipts, receiptLines, movements }
}

async function cleanupDemo() {
  const contractNos = CONTRACTS.map(demoContractNo)
  const receiptNos = CONTRACTS.map(demoReceiptNo)
  const existingReceipts = await selectTable('purchase_receipts', 'id,receipt_no', [filtersIn('receipt_no', receiptNos)])
  const receiptIds = existingReceipts.map(row => row.id)

  await deleteWhere('inventory_movements', [filtersIn('source_doc_no', receiptNos)])
  if (receiptIds.length) await deleteWhere('purchase_receipt_lines', [filtersIn('receipt_id', receiptIds)])
  await deleteWhere('purchase_receipts', [filtersIn('receipt_no', receiptNos)])
  await deleteWhere('contracts', [filtersIn('contract_no', contractNos)])

  return {
    deletedReceiptIds: receiptIds.length,
    contractNos,
    receiptNos,
  }
}

async function applyDemo(records) {
  const cleanup = await cleanupDemo()
  const insertedContracts = await insertRows('contracts', records.contracts)
  const insertedReceipts = []
  const insertedLines = []
  const insertedMovements = []

  for (const spec of CONTRACTS) {
    const receipt = records.receipts.find(row => row.receipt_no === demoReceiptNo(spec))
    const lines = records.receiptLines.filter(row => row.receipt_id === receipt.id)
    const movements = records.movements.filter(row => row.source_doc_id === receipt.id)
    insertedReceipts.push(...await insertRows('purchase_receipts', [receipt]))
    insertedLines.push(...await insertRows('purchase_receipt_lines', lines))
    insertedMovements.push(...await insertRows('inventory_movements', movements))
  }

  return {
    cleanup,
    insertedContracts: insertedContracts.length,
    insertedReceipts: insertedReceipts.length,
    insertedLines: insertedLines.length,
    insertedMovements: insertedMovements.length,
  }
}

async function verifyDemo() {
  const contractNos = CONTRACTS.map(demoContractNo)
  const receiptNos = CONTRACTS.map(demoReceiptNo)
  const [contracts, receipts, lines, movements] = await Promise.all([
    selectTable('contracts', 'id,contract_no,supplier_id,start_date,end_date,total_quota_active,total_quota_warning_ratio,rows,deleted_at', [filtersIn('contract_no', contractNos)]),
    selectTable('purchase_receipts', 'id,receipt_no,supplier_id,status,deleted_at', [filtersIn('receipt_no', receiptNos)]),
    selectTable('purchase_receipt_lines', 'id,receipt_id,stock_item_id,received_qty,inventory_movement_id,deleted_at'),
    selectTable('inventory_movements', 'id,source_doc_no,source_doc_line_id,stock_item_id,supplier_id,item_type,movement_type,source_doc_type,quantity,movement_at,deleted_at,is_cancelled', [filtersIn('source_doc_no', receiptNos)]),
  ])

  const receiptIds = new Set(receipts.map(row => row.id))
  const demoLines = lines.filter(row => receiptIds.has(row.receipt_id))
  const movementIds = new Set(movements.map(row => row.id))
  const contractUsage = []

  for (const contract of contracts) {
    const rows = parseJsonMaybe(contract.rows, [])
    const usageByStock = new Map()
    for (const movement of movements) {
      if (movement.supplier_id !== contract.supplier_id) continue
      if (movement.item_type !== 'stock_item') continue
      if (movement.movement_type !== 'purchase_receipt') continue
      if (movement.source_doc_type !== 'purchase_receipt') continue
      if (movement.deleted_at || movement.is_cancelled !== false) continue
      const at = String(movement.movement_at || '')
      if (at < `${contract.start_date}T00:00:00` || at > `${contract.end_date}T23:59:59`) continue
      usageByStock.set(movement.stock_item_id, (usageByStock.get(movement.stock_item_id) || 0) + toNumber(movement.quantity))
    }
    const totalQuota = rows.reduce((sum, row) => sum + toNumber(row.qty), 0)
    const totalUsed = rows.reduce((sum, row) => sum + toNumber(usageByStock.get(row.stock_item_id)), 0)
    const ratio = totalQuota > 0 ? totalUsed / totalQuota : 0
    contractUsage.push({
      contract_no: contract.contract_no,
      rowCount: rows.length,
      totalQuota: Number(totalQuota.toFixed(4)),
      totalUsed: Number(totalUsed.toFixed(4)),
      usageRatio: Number(ratio.toFixed(4)),
      warning: ratio >= toNumber(contract.total_quota_warning_ratio, 0.8),
      overrun: ratio > 1,
      expired: String(contract.end_date) < DEMO_DATE,
    })
  }

  const lineMovementLinksOk = demoLines.every(line => line.inventory_movement_id && movementIds.has(line.inventory_movement_id))
  const purchaseMovementsOk = movements.every(row => (
    row.item_type === 'stock_item' &&
    row.movement_type === 'purchase_receipt' &&
    row.source_doc_type === 'purchase_receipt' &&
    row.deleted_at === null &&
    row.is_cancelled === false
  ))

  const result = {
    contracts: contracts.length,
    activeContracts: contracts.filter(row => !row.deleted_at).length,
    contractsWithRows: contracts.filter(row => parseJsonMaybe(row.rows, []).length > 0).length,
    receipts: receipts.length,
    receiptLines: demoLines.length,
    inventoryMovements: movements.length,
    lineMovementLinksOk,
    purchaseMovementsOk,
    hasWarningContract: contractUsage.some(row => row.warning && !row.overrun),
    hasOverrunContract: contractUsage.some(row => row.overrun),
    hasExpiredContract: contractUsage.some(row => row.expired),
    contractUsage,
  }

  result.ok = (
    result.contracts === 5 &&
    result.activeContracts === 5 &&
    result.contractsWithRows === 5 &&
    result.receipts === 5 &&
    result.receiptLines === 15 &&
    result.inventoryMovements === 15 &&
    result.lineMovementLinksOk &&
    result.purchaseMovementsOk &&
    result.hasWarningContract &&
    result.hasOverrunContract &&
    result.hasExpiredContract
  )

  return result
}

async function main() {
  const deps = await readDependencies()
  assertDependencies(deps)
  const records = buildDemoRecords(deps)

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : (verifyOnly ? 'verify-only' : 'apply'),
    apiUrl: API_URL,
    planned: {
      contracts: records.contracts.length,
      receipts: records.receipts.length,
      receiptLines: records.receiptLines.length,
      inventoryMovements: records.movements.length,
      contractNos: records.contracts.map(row => row.contract_no),
      receiptNos: records.receipts.map(row => row.receipt_no),
    },
  }, null, 2))

  if (dryRun) return

  if (!verifyOnly) {
    const applyResult = await applyDemo(records)
    console.log(JSON.stringify({ mode: 'apply-result', ...applyResult }, null, 2))
  }

  const verification = await verifyDemo()
  console.log(JSON.stringify({ mode: 'readback', verification }, null, 2))
  if (!verification.ok) throw new Error('Contracts demo readback verification failed.')
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
