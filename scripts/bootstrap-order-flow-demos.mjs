import { createHash } from 'node:crypto'

const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

function stableUuid(scope, value) {
  const hash = createHash('sha1').update(`${scope}:${value}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-')
}

async function apiQuery(body) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`)
  }
  return payload.data
}

function eq(col, val) {
  return { type: 'eq', col, val }
}

function inFilter(col, val) {
  return { type: 'in', col, val }
}

async function apiSelect(table, filters = [], select = '*') {
  return apiQuery({ table, operation: 'select', select, filters })
}

async function apiSelectSingle(table, filters = [], select = '*') {
  const rows = await apiSelect(table, [...filters, { type: 'limit', val: 1 }], select)
  return rows?.[0] || null
}

async function apiUpsert(table, data, onConflict = 'id') {
  return apiQuery({ table, operation: 'upsert', data, options: { onConflict } })
}

function collectBranches(treeValue) {
  const branches = []
  const tree = Array.isArray(treeValue) ? treeValue : []
  function walk(nodes) {
    for (const node of nodes || []) {
      if (node?.type === 'sube') branches.push({ id: node.id, name: node.name })
      walk(node?.children || [])
    }
  }
  walk(tree)
  return branches
}

function requireByName(rows, name, type) {
  const found = (rows || []).find((row) => row?.name === name)
  if (!found) {
    throw new Error(`${type} bulunamadi: ${name}`)
  }
  return found
}

function stringify(value) {
  return JSON.stringify(value)
}

function orderLine({
  order,
  stock,
  lineNo,
  currentStock,
  calculatedNeed,
  suggestedQty,
  orderedQty,
  unitPrice,
  plannedDeliveryDate,
  nextOrderDate,
  nextDeliveryDate,
  priceSource,
  contractId = null,
  notes = null,
  meta = {},
}) {
  return {
    id: stableUuid('purchase-order-line-demo', `${order.id}:${lineNo}:${stock.id}`),
    order_id: order.id,
    line_no: lineNo,
    stock_item_id: stock.id,
    item_name: stock.name,
    item_sku: stock.sku || '',
    unit: stock.unit || '',
    current_stock: currentStock,
    planned_delivery_date: plannedDeliveryDate,
    next_order_date: nextOrderDate,
    next_delivery_date: nextDeliveryDate,
    calculated_need: calculatedNeed,
    suggested_qty: suggestedQty,
    ordered_qty: orderedQty,
    price_source: priceSource,
    unit_price: unitPrice,
    line_total: Number((orderedQty * unitPrice).toFixed(4)),
    contract_id: contractId,
    notes,
    meta: stringify(meta),
  }
}

async function main() {
  const [settingsRow, suppliers, stockTemplates, contracts, stockItems, branchTemplates] = await Promise.all([
    apiSelectSingle('settings', [eq('key', 'company_tree')], 'key,value'),
    apiSelect('suppliers', [eq('active', true)], 'id,name'),
    apiSelect('stock_templates', [{ type: 'is', col: 'deleted_at', val: null }], 'id,name,stock_ids'),
    apiSelect('contracts', [{ type: 'is', col: 'deleted_at', val: null }], 'id,contract_no,supplier_id,rows'),
    apiSelect('stock_items', [{ type: 'is', col: 'deleted_at', val: null }], 'id,sku,name,unit,purchase_price,supp_id'),
    apiSelect('branch_templates', [{ type: 'is', col: 'deleted_at', val: null }], 'id,name,branch_ids'),
  ])

  const branches = collectBranches(settingsRow?.value || [])
  const supplierTat = requireByName(suppliers, 'Tat Sos Horeca Dağıtım Ltd.', 'Tedarikçi')
  const supplierEt = requireByName(suppliers, 'Marmara Et Ürünleri Ltd. Şti.', 'Tedarikçi')
  const supplierIcecek = requireByName(suppliers, 'Metro İçecek Dağıtım A.Ş.', 'Tedarikçi')

  const templateSos = requireByName(stockTemplates, 'Sos ve Yardımcı Ürünler', 'Stok şablonu')
  const branchTplIstanbul = requireByName(branchTemplates, 'İstanbul Şubeleri', 'Şube şablonu')
  const branchTplAnadolu = requireByName(branchTemplates, 'Anadolu Burger Şubeleri', 'Şube şablonu')
  const branchTplEge = requireByName(branchTemplates, 'Ege Akdeniz Şubeleri', 'Şube şablonu')

  const contractTat = contracts.find((row) => row.supplier_id === supplierTat.id)
  const contractEt = contracts.find((row) => row.supplier_id === supplierEt.id)
  const contractIcecek = contracts.find((row) => row.supplier_id === supplierIcecek.id)
  if (!contractTat || !contractEt || !contractIcecek) {
    throw new Error('Demo siparis akislari icin gereken kontratlar eksik.')
  }

  const stockByName = new Map(stockItems.map((item) => [item.name, item]))
  const branchByName = new Map(branches.map((branch) => [branch.name, branch]))

  const flowRows = [
    {
      id: stableUuid('order-flow-demo', 'istanbul-sos'),
      active: true,
      flow_type: 'otomatik',
      name: 'Demo İstanbul Sos Tamamlama',
      description: 'İstanbul şubeleri için sos ve yardımcı ürün tamamlama akışı.',
      supplier_id: supplierTat.id,
      branches: stringify([{ type: 'template', id: branchTplIstanbul.id, name: branchTplIstanbul.name, branchIds: branchTplIstanbul.branch_ids || [] }]),
      no_calendar: false,
      siparis_sikligi: 'haftalik',
      order_days: stringify(['Pazartesi', 'Perşembe']),
      aylik_mod: 'gun',
      aylik_gunler: stringify([]),
      aylik_haftagun_sira: null,
      aylik_haftagun_gun: null,
      delivery_hour: '15:00',
      lead_days: 1,
      cutoff_hour: '11:00',
      auto_cancel: false,
      auto_send: false,
      urun_tipi: 'sablon',
      selected_stocks: stringify([]),
      stock_template_id: templateSos.id,
      allow_extra_product: true,
      qty_mode: 'stok',
      forecast_ratio: 1.1,
      round_min_qty: false,
      round_box_qty: false,
      round_box_threshold: 0.25,
      allow_edit: true,
      edit_cutoff_hour: '13:00',
      allow_cancel: true,
      cancel_cutoff_hour: '14:00',
      branch_approval: false,
      hq_approval: false,
      hq_approval_threshold: null,
      allow_date_change: true,
      check_credit_limit: false,
    },
    {
      id: stableUuid('order-flow-demo', 'anadolu-et-kontrat'),
      active: true,
      flow_type: 'otomatik',
      name: 'Demo Anadolu Et Kontrat Akışı',
      description: 'Anadolu Burger şubeleri için kontratlı et ve donuk ürün sipariş akışı.',
      supplier_id: supplierEt.id,
      branches: stringify([{ type: 'template', id: branchTplAnadolu.id, name: branchTplAnadolu.name, branchIds: branchTplAnadolu.branch_ids || [] }]),
      no_calendar: false,
      siparis_sikligi: 'haftalik',
      order_days: stringify(['Salı', 'Cuma']),
      aylik_mod: 'gun',
      aylik_gunler: stringify([]),
      aylik_haftagun_sira: null,
      aylik_haftagun_gun: null,
      delivery_hour: '12:00',
      lead_days: 1,
      cutoff_hour: '09:30',
      auto_cancel: false,
      auto_send: true,
      urun_tipi: 'kontrat',
      selected_stocks: stringify([]),
      stock_template_id: null,
      allow_extra_product: false,
      qty_mode: 'stok',
      forecast_ratio: 1.0,
      round_min_qty: true,
      round_box_qty: false,
      round_box_threshold: 0.25,
      allow_edit: false,
      edit_cutoff_hour: '08:30',
      allow_cancel: false,
      cancel_cutoff_hour: '09:00',
      branch_approval: false,
      hq_approval: true,
      hq_approval_threshold: 5000,
      allow_date_change: false,
      check_credit_limit: true,
    },
    {
      id: stableUuid('order-flow-demo', 'ege-icecek-manuel'),
      active: true,
      flow_type: 'manuel',
      name: 'Demo Ege İçecek Yenileme',
      description: 'Ege Akdeniz şubeleri için manuel içecek yenileme akışı.',
      supplier_id: supplierIcecek.id,
      branches: stringify([{ type: 'template', id: branchTplEge.id, name: branchTplEge.name, branchIds: branchTplEge.branch_ids || [] }]),
      no_calendar: true,
      siparis_sikligi: 'haftalik',
      order_days: stringify([]),
      aylik_mod: 'gun',
      aylik_gunler: stringify([]),
      aylik_haftagun_sira: null,
      aylik_haftagun_gun: null,
      delivery_hour: '10:30',
      lead_days: 1,
      cutoff_hour: '08:00',
      auto_cancel: false,
      auto_send: false,
      urun_tipi: 'kontrat',
      selected_stocks: stringify([]),
      stock_template_id: null,
      allow_extra_product: true,
      qty_mode: 'manuel',
      forecast_ratio: 1.0,
      round_min_qty: false,
      round_box_qty: false,
      round_box_threshold: 0.25,
      allow_edit: true,
      edit_cutoff_hour: '10:00',
      allow_cancel: true,
      cancel_cutoff_hour: '10:15',
      branch_approval: false,
      hq_approval: false,
      hq_approval_threshold: null,
      allow_date_change: true,
      check_credit_limit: false,
    },
  ]

  await apiUpsert('order_flows', flowRows, 'id')
  const verifiedFlows = await apiSelect('order_flows', [inFilter('id', flowRows.map((row) => row.id))], 'id,name,supplier_id')
  if (verifiedFlows.length !== flowRows.length) {
    throw new Error(`order_flows verify basarisiz. Beklenen=${flowRows.length} bulunan=${verifiedFlows.length}`)
  }

  const orderRows = [
    {
      id: stableUuid('purchase-order-demo', 'istanbul-sos-pending'),
      order_no: 'SP-20260512-DMO-001',
      branch_id: branchByName.get('Beşiktaş Şubesi')?.id || null,
      branch_name: 'Beşiktaş Şubesi',
      flow_id: flowRows[0].id,
      flow_name: flowRows[0].name,
      supplier_id: supplierTat.id,
      supplier_name: supplierTat.name,
      description: 'İstanbul şubeleri sos tamamlama demo siparişi',
      order_source: 'flow',
      status: 'pending_action',
      order_date: '2026-05-12',
      cutoff_at: '2026-05-12T11:00:00+03:00',
      delivery_date: '2026-05-13',
      delivery_time: '15:00',
      next_order_date: '2026-05-14',
      next_delivery_date: '2026-05-15',
      qty_mode: 'stok',
      auto_send_mode: 'manual_review',
      branch_approval: false,
      hq_approval: false,
      needs_manager_approval: false,
      manager_approval_status: 'not_required',
      total_qty: 0,
      subtotal: 0,
      total_amount: 0,
      suggestion_refreshed_at: '2026-05-12T09:05:00+03:00',
      submitted_at: null,
      cancelled_at: null,
      cancelled_reason: null,
      notes: 'Demo pending action siparişi',
      meta: stringify({ source: 'demo', demo_key: 'istanbul-sos-pending', chain: 'order-flow' }),
    },
    {
      id: stableUuid('purchase-order-demo', 'anadolu-et-approval'),
      order_no: 'SP-20260512-DMO-002',
      branch_id: branchByName.get('Ankara Etimesgut Şubesi')?.id || null,
      branch_name: 'Ankara Etimesgut Şubesi',
      flow_id: flowRows[1].id,
      flow_name: flowRows[1].name,
      supplier_id: supplierEt.id,
      supplier_name: supplierEt.name,
      description: 'Kontratlı et siparişi demo onay bekliyor',
      order_source: 'flow',
      status: 'awaiting_approval',
      order_date: '2026-05-12',
      cutoff_at: '2026-05-12T09:30:00+03:00',
      delivery_date: '2026-05-13',
      delivery_time: '12:00',
      next_order_date: '2026-05-15',
      next_delivery_date: '2026-05-16',
      qty_mode: 'stok',
      auto_send_mode: 'hq_approval',
      branch_approval: false,
      hq_approval: true,
      needs_manager_approval: true,
      manager_approval_status: 'pending',
      total_qty: 0,
      subtotal: 0,
      total_amount: 0,
      suggestion_refreshed_at: '2026-05-12T08:20:00+03:00',
      submitted_at: null,
      cancelled_at: null,
      cancelled_reason: null,
      notes: 'Demo approval kuyruğu siparişi',
      meta: stringify({ source: 'demo', demo_key: 'anadolu-et-approval', chain: 'order-flow', approval_reason: 'hq_threshold' }),
    },
    {
      id: stableUuid('purchase-order-demo', 'ege-icecek-submitted'),
      order_no: 'SP-20260512-DMO-003',
      branch_id: branchByName.get('İzmir Buca Şubesi')?.id || null,
      branch_name: 'İzmir Buca Şubesi',
      flow_id: flowRows[2].id,
      flow_name: flowRows[2].name,
      supplier_id: supplierIcecek.id,
      supplier_name: supplierIcecek.name,
      description: 'İçecek yenileme demo siparişi tedarikçiye gönderildi',
      order_source: 'flow',
      status: 'submitted',
      order_date: '2026-05-12',
      cutoff_at: '2026-05-12T08:00:00+03:00',
      delivery_date: '2026-05-13',
      delivery_time: '10:30',
      next_order_date: null,
      next_delivery_date: null,
      qty_mode: 'manuel',
      auto_send_mode: 'manual_send',
      branch_approval: false,
      hq_approval: false,
      needs_manager_approval: false,
      manager_approval_status: 'not_required',
      total_qty: 0,
      subtotal: 0,
      total_amount: 0,
      suggestion_refreshed_at: '2026-05-12T07:50:00+03:00',
      submitted_at: '2026-05-12T08:05:00+03:00',
      cancelled_at: null,
      cancelled_reason: null,
      notes: 'Demo submitted siparişi',
      meta: stringify({ source: 'demo', demo_key: 'ege-icecek-submitted', chain: 'order-flow' }),
    },
  ]

  const lines = [
    orderLine({
      order: orderRows[0],
      stock: stockByName.get('Ketçap'),
      lineNo: 1,
      currentStock: 4200,
      calculatedNeed: 9000,
      suggestedQty: 4800,
      orderedQty: 5000,
      unitPrice: 0.11,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: '2026-05-14',
      nextDeliveryDate: '2026-05-15',
      priceSource: 'contract',
      contractId: contractTat.id,
      notes: 'Kampanya haftası emniyet stoğu',
      meta: { source: 'demo', scenario: 'pending_action' },
    }),
    orderLine({
      order: orderRows[0],
      stock: stockByName.get('Mayonez'),
      lineNo: 2,
      currentStock: 3600,
      calculatedNeed: 7000,
      suggestedQty: 3400,
      orderedQty: 3500,
      unitPrice: 0.17,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: '2026-05-14',
      nextDeliveryDate: '2026-05-15',
      priceSource: 'contract',
      contractId: contractTat.id,
      notes: null,
      meta: { source: 'demo', scenario: 'pending_action' },
    }),
    orderLine({
      order: orderRows[0],
      stock: stockByName.get('BBQ Sos'),
      lineNo: 3,
      currentStock: 1800,
      calculatedNeed: 5200,
      suggestedQty: 3400,
      orderedQty: 3200,
      unitPrice: 0.21,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: '2026-05-14',
      nextDeliveryDate: '2026-05-15',
      priceSource: 'contract',
      contractId: contractTat.id,
      notes: null,
      meta: { source: 'demo', scenario: 'pending_action' },
    }),
    orderLine({
      order: orderRows[1],
      stock: stockByName.get('Hamburger Köftesi'),
      lineNo: 1,
      currentStock: 95,
      calculatedNeed: 180,
      suggestedQty: 110,
      orderedQty: 120,
      unitPrice: 36.5,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: '2026-05-15',
      nextDeliveryDate: '2026-05-16',
      priceSource: 'contract',
      contractId: contractEt.id,
      notes: 'Kontratlı ürün',
      meta: { source: 'demo', scenario: 'awaiting_approval' },
    }),
    orderLine({
      order: orderRows[1],
      stock: stockByName.get('Tavuk Köftesi'),
      lineNo: 2,
      currentStock: 42,
      calculatedNeed: 88,
      suggestedQty: 58,
      orderedQty: 60,
      unitPrice: 27,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: '2026-05-15',
      nextDeliveryDate: '2026-05-16',
      priceSource: 'contract',
      contractId: contractEt.id,
      notes: null,
      meta: { source: 'demo', scenario: 'awaiting_approval' },
    }),
    orderLine({
      order: orderRows[1],
      stock: stockByName.get('Patates (dondurulmuş)'),
      lineNo: 3,
      currentStock: 12000,
      calculatedNeed: 28500,
      suggestedQty: 16500,
      orderedQty: 18000,
      unitPrice: 0.27,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: '2026-05-15',
      nextDeliveryDate: '2026-05-16',
      priceSource: 'contract',
      contractId: contractEt.id,
      notes: 'Hafta sonu hacmi için yukarı yuvarlandı',
      meta: { source: 'demo', scenario: 'awaiting_approval' },
    }),
    orderLine({
      order: orderRows[2],
      stock: stockByName.get('Kola 330ml'),
      lineNo: 1,
      currentStock: 48,
      calculatedNeed: 130,
      suggestedQty: 72,
      orderedQty: 72,
      unitPrice: 17.5,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: null,
      nextDeliveryDate: null,
      priceSource: 'contract',
      contractId: contractIcecek.id,
      notes: null,
      meta: { source: 'demo', scenario: 'submitted' },
    }),
    orderLine({
      order: orderRows[2],
      stock: stockByName.get('Su 500ml'),
      lineNo: 2,
      currentStock: 110,
      calculatedNeed: 220,
      suggestedQty: 110,
      orderedQty: 120,
      unitPrice: 4.75,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: null,
      nextDeliveryDate: null,
      priceSource: 'contract',
      contractId: contractIcecek.id,
      notes: null,
      meta: { source: 'demo', scenario: 'submitted' },
    }),
    orderLine({
      order: orderRows[2],
      stock: stockByName.get('Limonata Konsantrat'),
      lineNo: 3,
      currentStock: 900,
      calculatedNeed: 2600,
      suggestedQty: 1700,
      orderedQty: 1800,
      unitPrice: 0.33,
      plannedDeliveryDate: '2026-05-13',
      nextOrderDate: null,
      nextDeliveryDate: null,
      priceSource: 'contract',
      contractId: contractIcecek.id,
      notes: 'Yaz sezonu öncesi yenileme',
      meta: { source: 'demo', scenario: 'submitted' },
    }),
  ]

  for (const order of orderRows) {
    const ownLines = lines.filter((line) => line.order_id === order.id)
    const totalQty = ownLines.reduce((sum, line) => sum + Number(line.ordered_qty || 0), 0)
    const subtotal = ownLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0)
    order.total_qty = Number(totalQty.toFixed(4))
    order.subtotal = Number(subtotal.toFixed(4))
    order.total_amount = Number(subtotal.toFixed(4))
  }

  await apiUpsert('purchase_orders', orderRows, 'id')
  const verifiedOrders = await apiSelect('purchase_orders', [inFilter('id', orderRows.map((row) => row.id))], 'id,order_no,status')
  if (verifiedOrders.length !== orderRows.length) {
    throw new Error(`purchase_orders verify basarisiz. Beklenen=${orderRows.length} bulunan=${verifiedOrders.length}`)
  }

  for (let index = 0; index < lines.length; index += 3) {
    const batch = lines.slice(index, index + 3)
    await apiUpsert('purchase_order_lines', batch, 'id')
    const verifiedLines = await apiSelect('purchase_order_lines', [inFilter('id', batch.map((row) => row.id))], 'id,order_id,line_no')
    if (verifiedLines.length !== batch.length) {
      throw new Error(`purchase_order_lines verify basarisiz. batch=${index} beklenen=${batch.length} bulunan=${verifiedLines.length}`)
    }
    console.log(JSON.stringify({ table: 'purchase_order_lines', batchStart: index, attempted: batch.length, succeeded: verifiedLines.length }))
  }

  const summary = await apiSelect('purchase_orders', [inFilter('id', orderRows.map((row) => row.id))], 'id,order_no,status,total_amount,branch_name,supplier_name')
  console.log(JSON.stringify({
    order_flows: verifiedFlows.length,
    purchase_orders: verifiedOrders.length,
    purchase_order_lines: lines.length,
    orders: summary,
  }, null, 2))
}

main().catch((error) => {
  console.error(`[bootstrap-order-flow-demos] ${error.message}`)
  process.exit(1)
})
