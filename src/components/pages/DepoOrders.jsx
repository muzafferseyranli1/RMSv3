import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import {
  DOC_KIND_OPTIONS,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQty,
  parseJsonValue,
} from '@/lib/branchPurchasing'

const TABS = [
  { key: 'pending_requests', label: 'Bekleyen Talepler' },
  { key: 'pick_list', label: 'Toplama Listesi (Konsolide)' },
  { key: 'product_branch', label: 'Ürün → Şube Dağılımı' },
  { key: 'branch_product', label: 'Şube → Ürün Dağılımı' },
  { key: 'shipments', label: 'Sevkiyatlar / Araç Yükleme' },
]

function getOrderMeta(order) {
  const parsed = parseJsonValue(order?.meta, {})
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return {}
}

function classifyWmsOrder(order) {
  const status = String(order?.status || '')
  const meta = getOrderMeta(order)
  const sent = Boolean(meta.supplier_marked_sent || meta.supplier_sent_at)
  if (status === 'cancelled') return 'cancelled'
  if (status === 'received') return 'received_full'
  if (status === 'partially_received') return 'received_partial'
  if (status === 'submitted' && sent) return 'awaiting_receipt'
  if (status === 'submitted') return 'ready'
  return 'other'
}

function StatusBadge({ bucket }) {
  const map = {
    cancelled: { label: 'İptal Edildi', color: '#991b1b', bg: '#fee2e2' },
    ready: { label: 'Sevk Bekliyor', color: '#b45309', bg: '#fffbeb' },
    awaiting_receipt: { label: 'Sevk Edildi / Yolda', color: '#1d4ed8', bg: '#dbeafe' },
    received_full: { label: 'Mal Kabul Tamamlandı', color: '#15803d', bg: '#f0fdf4' },
    received_partial: { label: 'Kısmi Kabul Edildi', color: '#92400e', bg: '#fef3c7' },
    other: { label: 'Diğer', color: '#475569', bg: '#e2e8f0' },
  }
  const safe = map[bucket] || map.other
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: 999,
      background: safe.bg,
      color: safe.color,
      fontSize: '.74rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {safe.label}
    </span>
  )
}

function ShipmentStatusBadge({ status }) {
  const map = {
    draft: { label: 'Taslak', color: '#475569', bg: '#e2e8f0' },
    ready_to_load: { label: 'Yüklemeye Hazır', color: '#b45309', bg: '#fffbeb' },
    in_transit: { label: 'Yolda / Sevk Edildi', color: '#1d4ed8', bg: '#dbeafe' },
    delivered: { label: 'Teslim Edildi', color: '#15803d', bg: '#f0fdf4' },
    cancelled: { label: 'İptal Edildi', color: '#991b1b', bg: '#fee2e2' },
  }
  const safe = map[status] || { label: status, color: '#475569', bg: '#e2e8f0' }
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: 999,
      background: safe.bg,
      color: safe.color,
      fontSize: '.74rem',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {safe.label}
    </span>
  )
}

function EmptyState({ icon, title, description, actionTip }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
      textAlign: 'center',
      background: '#f8fafc',
      borderRadius: '12px',
      border: '1px dashed #cbd5e1',
      margin: '20px auto',
      width: '100%',
      maxWidth: '600px'
    }}>
      <div style={{
        width: '54px',
        height: '54px',
        borderRadius: '50%',
        background: '#eff6ff',
        color: '#3b82f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '16px',
        fontSize: '1.4rem',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)'
      }}>
        <i className={`fa-solid ${icon}`} />
      </div>
      <h4 style={{ margin: '0 0 6px 0', fontSize: '.95rem', fontWeight: 700, color: '#1e293b' }}>
        {title}
      </h4>
      <p style={{ margin: '0 0 12px 0', fontSize: '.82rem', color: '#64748b', maxWidth: '380px', lineHeight: 1.5 }}>
        {description}
      </p>
      {actionTip && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          padding: '8px 14px',
          fontSize: '.76rem',
          color: '#15803d',
          fontWeight: 600,
          maxWidth: '420px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <i className="fa-solid fa-lightbulb" style={{ color: '#16a34a' }} />
          <span>{actionTip}</span>
        </div>
      )}
    </div>
  )
}

export default function DepoOrders() {
  const toast = useToast()
  const { user } = useAuth()
  const { branchId, branchName } = useWorkspace()

  const [loading, setLoading] = useState(true)
  const [syncedSupplier, setSyncedSupplier] = useState(null)
  const [orders, setOrders] = useState([])
  const [orderLines, setOrderLines] = useState([])
  const [warehouseLocations, setWarehouseLocations] = useState([])
  const [warehouseLpns, setWarehouseLpns] = useState([])
  const [inventoryMovements, setInventoryMovements] = useState([])

  // Phase 6 Shipments and Vehicles
  const [vehicles, setVehicles] = useState([])
  const [shipments, setShipments] = useState([])
  const [shipmentOrders, setShipmentOrders] = useState([])
  const [shipmentLines, setShipmentLines] = useState([])
  const [selectedOrderIds, setSelectedOrderIds] = useState([])

  // Filters
  const [search, setSearch] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [selectedLpnId, setSelectedLpnId] = useState('')
  const [selectedSkt, setSelectedSkt] = useState('')
  const [activeTab, setActiveTab] = useState('pending_requests')

  // Modals
  const [detailOrderId, setDetailOrderId] = useState('')
  const [dispatchOrder, setDispatchOrder] = useState(null)
  const [dispatchDraft, setDispatchDraft] = useState(null)
  const [dispatchSaving, setDispatchSaving] = useState(false)

  // Shipment Create Modal
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false)
  const [selectedVehicleId, setSelectedVehicleId] = useState('new')
  const [saveVehiclePermanently, setSaveVehiclePermanently] = useState(false)
  const [customPlateNumber, setCustomPlateNumber] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [customDriverName, setCustomDriverName] = useState('')
  const [customDriverPhone, setCustomDriverPhone] = useState('')
  const [shipmentNotes, setShipmentNotes] = useState('')
  const [shipmentLinesDraft, setShipmentLinesDraft] = useState({}) // { stock_item_id: shipped_qty }
  const [savingShipment, setSavingShipment] = useState(false)

  // Shipment Detail Modal
  const [detailShipmentId, setDetailShipmentId] = useState('')
  const [shipmentDetailOpen, setShipmentDetailOpen] = useState(false)

  // Action saving states
  const [confirmingShipmentId, setConfirmingShipmentId] = useState('')
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [cancellingShipmentId, setCancellingShipmentId] = useState('')
  const [cancellingAction, setCancellingAction] = useState(false)

  // Quantity editing (partial fulfillment)
  const [editingLines, setEditingLines] = useState({}) // { lineId: qty }
  const [savingEdit, setSavingEdit] = useState(false)

  const loadData = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    try {
      // 1. Find the synchronized internal supplier for this depot
      const { data: supplierData, error: supplierError } = await db
        .from('suppliers')
        .select('*')
        .eq('supplier_kind', 'internal_warehouse')
        .eq('source_branch_id', branchId)
        .is('deleted_at', null)
        .limit(1)

      if (supplierError) throw supplierError

      if (!supplierData || supplierData.length === 0) {
        setSyncedSupplier(null)
        setOrders([])
        setOrderLines([])
        setWarehouseLocations([])
        setWarehouseLpns([])
        setInventoryMovements([])
        setVehicles([])
        setShipments([])
        setShipmentOrders([])
        setShipmentLines([])
        return
      }

      const supplier = supplierData[0]
      setSyncedSupplier(supplier)

      // 2. Load depot orders and reference data concurrently
      const [
        ordersResult,
        locationsResult,
        lpnsResult,
        movementsResult,
        vehiclesResult,
        shipmentsResult,
        shipmentOrdersResult,
        shipmentLinesResult,
        stockItemsResult
      ] = await Promise.all([
        db
          .from('purchase_orders')
          .select('*')
          .eq('supplier_id', supplier.id)
          .eq('flow_channel', 'warehouse_replenishment')
          .is('deleted_at', null)
          .order('order_date', { ascending: false })
          .order('created_at', { ascending: false }),
        db
          .from('warehouse_locations')
          .select('*')
          .eq('branch_id', branchId)
          .eq('is_active', true)
          .order('zone_code')
          .order('aisle')
          .order('rack')
          .order('level')
          .order('bin'),
        db
          .from('warehouse_lpns')
          .select('*')
          .eq('branch_id', branchId)
          .order('lpn_code'),
        db
          .from('inventory_movements')
          .select('*')
          .eq('branch_id', branchId)
          .is('deleted_at', null)
          .order('movement_at', { ascending: false }),
        db
          .from('vehicles')
          .select('*')
          .eq('active', true)
          .is('deleted_at', null)
          .order('plate_number'),
        db
          .from('warehouse_shipments')
          .select('*')
          .eq('source_branch_id', branchId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        db
          .from('warehouse_shipment_orders')
          .select('*')
          .is('deleted_at', null),
        db
          .from('warehouse_shipment_lines')
          .select('*')
          .is('deleted_at', null),
        db
          .from('stock_items')
          .select('id, name, sku, unit')
          .is('deleted_at', null)
      ])

      if (ordersResult.error) throw ordersResult.error
      if (locationsResult.error) throw locationsResult.error
      if (lpnsResult.error) throw lpnsResult.error
      if (movementsResult.error) throw movementsResult.error
      if (vehiclesResult.error) throw vehiclesResult.error
      if (shipmentsResult.error) throw shipmentsResult.error
      if (shipmentOrdersResult.error) throw shipmentOrdersResult.error
      if (shipmentLinesResult.error) throw shipmentLinesResult.error
      if (stockItemsResult.error) throw stockItemsResult.error

      const loadedOrders = ordersResult.data || []
      setOrders(loadedOrders)
      setWarehouseLocations(locationsResult.data || [])
      setWarehouseLpns(lpnsResult.data || [])
      setInventoryMovements(movementsResult.data || [])
      setVehicles(vehiclesResult.data || [])
      setShipments(shipmentsResult.data || [])
      setShipmentOrders(shipmentOrdersResult.data || [])

      const stockItemsList = stockItemsResult.data || []
      const stockItemsMap = {}
      for (const item of stockItemsList) {
        stockItemsMap[item.id] = item
      }

      const rawLines = shipmentLinesResult.data || []
      const mappedLines = rawLines.map(line => ({
        ...line,
        stock_items: stockItemsMap[line.stock_item_id] || null
      }))
      setShipmentLines(mappedLines)

      if (loadedOrders.length > 0) {
        const orderIds = loadedOrders.map(o => o.id)
        const { data: linesData, error: linesError } = await db
          .from('purchase_order_lines')
          .select('*')
          .in('order_id', orderIds)
          .is('deleted_at', null)
          .order('line_no')

        if (linesError) throw linesError
        setOrderLines(linesData || [])
      } else {
        setOrderLines([])
      }
    } catch (error) {
      toast(`Depo sipariş verileri yüklenemedi: ${error?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [branchId, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Extract unique expiration dates for filter dropdown
  const uniqueSkts = useMemo(() => {
    const dates = new Set()
    for (const m of inventoryMovements) {
      if (m.expiration_date) {
        dates.add(m.expiration_date)
      }
    }
    return [...dates].sort()
  }, [inventoryMovements])

  // Calculate available stock map dynamically based on selected filters (Location, LPN, SKT)
  const availableStockMap = useMemo(() => {
    const physical = {}
    const nonAvailable = {}

    for (const m of inventoryMovements) {
      // Apply filters if selected
      if (selectedLocationId && m.location_id !== selectedLocationId) continue
      if (selectedLpnId && m.lpn_id !== selectedLpnId) continue
      if (selectedSkt && m.expiration_date !== selectedSkt) continue

      const qty = Number(m.quantity || 0)
      const signed = m.direction === 'in' ? qty : -qty
      const stockId = m.stock_item_id

      physical[stockId] = (physical[stockId] || 0) + signed

      const meta = typeof m.meta === 'string' ? parseJsonValue(m.meta, {}) : (m.meta || {})
      const status = meta.availability_status || 'available'
      if (status === 'quarantine' || status === 'putaway_pending') {
        nonAvailable[stockId] = (nonAvailable[stockId] || 0) + signed
      }
    }

    const result = {}
    for (const stockId of Object.keys(physical)) {
      const phys = physical[stockId] || 0
      const nonAvail = nonAvailable[stockId] || 0
      result[stockId] = Math.max(phys - nonAvail, 0)
    }
    return result
  }, [inventoryMovements, selectedLocationId, selectedLpnId, selectedSkt])

  // Filters visible orders based on text search and status
  const visibleOrders = useMemo(() => {
    const text = search.trim().toLowerCase()
    return orders.filter(order => {
      const bucket = classifyWmsOrder(order)
      if (!text) return true
      const orderNo = String(order.order_no || '').toLowerCase()
      const branch = String(order.branch_name || '').toLowerCase()
      const desc = String(order.description || '').toLowerCase()
      return orderNo.includes(text) || branch.includes(text) || desc.includes(text)
    })
  }, [orders, search])

  // Filter lines to match visible orders
  const visibleOrderIds = useMemo(() => new Set(visibleOrders.map(order => order.id)), [visibleOrders])
  const visibleLines = useMemo(() => orderLines.filter(line => visibleOrderIds.has(line.order_id)), [orderLines, visibleOrderIds])

  // Get current details modal order
  const selectedOrder = useMemo(() => orders.find(order => order.id === detailOrderId) || null, [orders, detailOrderId])
  const selectedOrderLines = useMemo(
    () => orderLines.filter(line => line.order_id === detailOrderId).sort((a, b) => Number(a.line_no || 0) - Number(b.line_no || 0)),
    [orderLines, detailOrderId],
  )

  // Initialize editing lines when detail modal opens
  useEffect(() => {
    if (detailOrderId) {
      const initialEditing = {}
      for (const line of selectedOrderLines) {
        initialEditing[line.id] = Number(line.ordered_qty)
      }
      setEditingLines(initialEditing)
    } else {
      setEditingLines({})
    }
  }, [detailOrderId, selectedOrderLines])

  // 1. Bekleyen / Sevk Bekleyen siparişler (stok yeterlilik kontrolü ve toplama listesi için baz alınır)
  const pendingOrders = useMemo(() => {
    return visibleOrders.filter(order => classifyWmsOrder(order) === 'ready')
  }, [visibleOrders])
  const pendingOrderIds = useMemo(() => new Set(pendingOrders.map(o => o.id)), [pendingOrders])
  const pendingLines = useMemo(() => orderLines.filter(line => pendingOrderIds.has(line.order_id)), [orderLines, pendingOrderIds])

  // 2. Ürün Toplam Konsolidasyon (Pick List)
  const consolidatedRows = useMemo(() => {
    const map = new Map()
    for (const line of pendingLines) {
      const stockId = line.stock_item_id
      if (!stockId) continue
      const key = stockId

      const current = map.get(key) || {
        stock_item_id: stockId,
        item_name: line.item_name || 'Bilinmeyen Ürün',
        item_sku: line.item_sku || '-',
        unit: line.unit || 'Adet',
        total_requested: 0,
      }

      current.total_requested += Number(line.ordered_qty || 0)
      map.set(key, current)
    }

    return [...map.values()].sort((a, b) => a.item_name.localeCompare(b.item_name, 'tr'))
  }, [pendingLines])

  // 3. Ürün -> Şube Dağılımı
  const productBranchRows = useMemo(() => {
    const map = new Map()
    for (const line of pendingLines) {
      const stockId = line.stock_item_id
      const order = pendingOrders.find(o => o.id === line.order_id)
      if (!stockId || !order) continue

      const key = `${stockId}__${order.branch_id}`
      const current = map.get(key) || {
        stock_item_id: stockId,
        item_name: line.item_name || 'Bilinmeyen Ürün',
        item_sku: line.item_sku || '-',
        branch_name: order.branch_name || 'Bilinmeyen Şube',
        qty: 0,
      }
      current.qty += Number(line.ordered_qty || 0)
      map.set(key, current)
    }
    return [...map.values()].sort((a, b) => a.item_name.localeCompare(b.item_name, 'tr') || a.branch_name.localeCompare(b.branch_name, 'tr'))
  }, [pendingLines, pendingOrders])

  // 4. Şube -> Ürün Dağılımı
  const branchProductRows = useMemo(() => {
    const map = new Map()
    for (const line of pendingLines) {
      const stockId = line.stock_item_id
      const order = pendingOrders.find(o => o.id === line.order_id)
      if (!stockId || !order) continue

      const key = `${order.branch_id}__${stockId}`
      const current = map.get(key) || {
        branch_name: order.branch_name || 'Bilinmeyen Şube',
        item_name: line.item_name || 'Bilinmeyen Ürün',
        item_sku: line.item_sku || '-',
        qty: 0,
      }
      current.qty += Number(line.ordered_qty || 0)
      map.set(key, current)
    }
    return [...map.values()].sort((a, b) => a.branch_name.localeCompare(b.branch_name, 'tr') || a.item_name.localeCompare(b.item_name, 'tr'))
  }, [pendingLines, pendingOrders])

  // Manual Quantity Editing Save
  async function saveQuantityEdits() {
    if (!selectedOrder) return
    setSavingEdit(true)
    try {
      const updatedLines = []
      let changedCount = 0

      for (const line of selectedOrderLines) {
        const newQty = editingLines[line.id]
        if (newQty === undefined) {
          updatedLines.push(line)
          continue
        }

        const formattedNew = Number(newQty)
        const formattedOld = Number(line.ordered_qty)

        if (formattedNew !== formattedOld) {
          changedCount++
          const lineMeta = { ...parseJsonValue(line.meta, {}) }
          // Preserve original ordered quantity for fill-rate reporting if not already set
          if (lineMeta.original_ordered_qty === undefined) {
            lineMeta.original_ordered_qty = formattedOld
          }

          const newLineTotal = formattedNew * Number(line.unit_price || 0)

          const { data: updatedLineData, error: updateLineError } = await db
            .from('purchase_order_lines')
            .update({
              ordered_qty: formattedNew,
              line_total: newLineTotal,
              meta: lineMeta,
              updated_at: new Date().toISOString(),
            })
            .eq('id', line.id)
            .select()

          if (updateLineError) throw updateLineError
          updatedLines.push(updatedLineData[0])
        } else {
          updatedLines.push(line)
        }
      }

      if (changedCount > 0) {
        // Recalculate order totals
        const nextTotalQty = updatedLines.reduce((sum, l) => sum + Number(l.ordered_qty || 0), 0)
        const nextTotalAmount = updatedLines.reduce((sum, l) => sum + Number(l.line_total || 0), 0)

        const { error: updateOrderError } = await db
          .from('purchase_orders')
          .update({
            total_qty: nextTotalQty,
            total_amount: nextTotalAmount,
            subtotal: nextTotalAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedOrder.id)

        if (updateOrderError) throw updateOrderError

        await logActivity({
          user,
          actionType: 'purchase_order_update',
          route: '/depo-orders',
          entityType: 'purchase_order',
          entityId: selectedOrder.id,
          metadata: { action: 'wms_manual_qty_adjustment', adjusted_lines_count: changedCount },
        })

        toast('Miktarlar güncellendi ve sipariş toplamları yeniden hesaplandı.', 'success')
      }

      setDetailOrderId('')
      await loadData()
    } catch (err) {
      toast(`Miktar güncelleme başarısız: ${err?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  // Open Dispatch Modal
  function openDispatchModal(order) {
    setDispatchOrder(order)
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    setDispatchDraft({
      delivered_on: today,
      delivered_at: time,
      doc_kind: 'irsaliye',
      doc_date: today,
      doc_no: '',
      plate_number: '',
      note: '',
      explanation: '',
    })
  }

  // Save Dispatch details
  async function saveDispatch() {
    if (!dispatchOrder || !dispatchDraft) return
    setDispatchSaving(true)
    try {
      const meta = getOrderMeta(dispatchOrder)
      const nextMeta = {
        ...meta,
        supplier_marked_sent: true,
        supplier_sent_at: new Date().toISOString(),
        supplier_dispatch: {
          delivered_on: dispatchDraft.delivered_on || null,
          delivered_at: dispatchDraft.delivered_at || null,
          doc_kind: dispatchDraft.doc_kind || null,
          doc_date: dispatchDraft.doc_date || null,
          doc_no: dispatchDraft.doc_no?.trim() || null,
          plate_number: dispatchDraft.plate_number?.trim() || null,
          note: dispatchDraft.note?.trim() || null,
          explanation: dispatchDraft.explanation?.trim() || null,
        },
      }

      const { error } = await db
        .from('purchase_orders')
        .update({ meta: nextMeta, updated_at: new Date().toISOString() })
        .eq('id', dispatchOrder.id)

      if (error) throw error

      await logActivity({
        user,
        actionType: 'purchase_order_update',
        route: '/depo-orders',
        entityType: 'purchase_order',
        entityId: dispatchOrder.id,
        metadata: { action: 'wms_dispatch_marked', plate_number: dispatchDraft.plate_number },
      })

      toast('Sevk bildirimi kaydedildi. Sipariş şube mal kabulü için hazır.', 'success')
      setDispatchOrder(null)
      setDispatchDraft(null)
      await loadData()
    } catch (err) {
      toast(`Sevk kaydı başarısız: ${err?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setDispatchSaving(false)
    }
  }

  // Phase 6 Helper & Action Functions
  const buildConsolidatedLines = useCallback((ids) => {
    const selectedLines = orderLines.filter(line => ids.includes(line.order_id))
    const map = {}
    for (const line of selectedLines) {
      const itemId = line.stock_item_id
      if (!map[itemId]) {
        map[itemId] = {
          stock_item_id: itemId,
          item_name: line.item_name,
          item_sku: line.item_sku,
          unit: line.unit,
          unit_price: Number(line.unit_price || 0),
          total_requested: 0,
          lines: []
        }
      }
      map[itemId].total_requested += Number(line.ordered_qty || 0)
      map[itemId].lines.push({
        line_id: line.id,
        order_id: line.order_id,
        order_no: orders.find(o => o.id === line.order_id)?.order_no || '',
        branch_name: orders.find(o => o.id === line.order_id)?.branch_name || '',
        ordered_qty: Number(line.ordered_qty || 0),
        unit_price: Number(line.unit_price || 0),
        meta: line.meta
      })
    }
    return Object.values(map)
  }, [orderLines, orders])

  const findPickingSources = useCallback((stockItemId, quantityToPick) => {
    if (quantityToPick <= 0) return [];

    const stockMap = {};

    for (const m of inventoryMovements) {
      if (m.stock_item_id !== stockItemId) continue;
      const qty = Number(m.quantity || 0);
      const signed = m.direction === 'in' ? qty : -qty;

      const meta = typeof m.meta === 'string' ? parseJsonValue(m.meta, {}) : (m.meta || {});
      const status = meta.availability_status || 'available';
      if (status === 'quarantine' || status === 'putaway_pending') continue;

      const key = `${m.location_id || ''}__${m.lpn_id || ''}__${m.lot_number || ''}__${m.expiration_date || ''}`;
      stockMap[key] = (stockMap[key] || 0) + signed;
    }

    const sources = Object.entries(stockMap)
      .map(([key, qty]) => {
        const [loc, lpn, lot, exp] = key.split('__');
        return {
          location_id: loc || null,
          lpn_id: lpn || null,
          lot_number: lot || null,
          expiration_date: exp || null,
          available: qty
        };
      })
      .filter(s => s.available > 0);

    sources.sort((a, b) => {
      if (a.expiration_date && b.expiration_date) {
        return a.expiration_date.localeCompare(b.expiration_date);
      }
      if (a.expiration_date) return -1;
      if (b.expiration_date) return 1;
      return 0;
    });

    if (selectedLocationId || selectedLpnId || selectedSkt) {
      sources.sort((a, b) => {
        const matchA = (!selectedLocationId || a.location_id === selectedLocationId) &&
                       (!selectedLpnId || a.lpn_id === selectedLpnId) &&
                       (!selectedSkt || a.expiration_date === selectedSkt);
        const matchB = (!selectedLocationId || b.location_id === selectedLocationId) &&
                       (!selectedLpnId || b.lpn_id === selectedLpnId) &&
                       (!selectedSkt || b.expiration_date === selectedSkt);
        if (matchA && !matchB) return -1;
        if (!matchA && matchB) return 1;
        return 0;
      });
    }

    const picks = [];
    let remaining = quantityToPick;
    for (const src of sources) {
      if (remaining <= 0) break;
      const pickQty = Math.min(src.available, remaining);
      picks.push({
        location_id: src.location_id,
        lpn_id: src.lpn_id,
        lot_number: src.lot_number,
        expiration_date: src.expiration_date,
        qty: pickQty
      });
      remaining -= pickQty;
    }

    return picks;
  }, [inventoryMovements, selectedLocationId, selectedLpnId, selectedSkt])

  const consolidatedLinesForShipment = useMemo(() => {
    if (selectedOrderIds.length === 0) return []
    return buildConsolidatedLines(selectedOrderIds).sort((a, b) => a.item_name.localeCompare(b.item_name, 'tr'))
  }, [selectedOrderIds, buildConsolidatedLines])

  const openCreateShipmentModalForOrders = (ids) => {
    setSelectedOrderIds(ids)
    
    // Build consolidated items list
    const consolidated = buildConsolidatedLines(ids)
    const draft = {}
    for (const item of consolidated) {
      draft[item.stock_item_id] = item.total_requested
    }
    setShipmentLinesDraft(draft)
    
    // Reset vehicle fields
    setSelectedVehicleId('new')
    setSaveVehiclePermanently(false)
    setCustomPlateNumber('')
    setCustomModel('')
    setCustomDriverName('')
    setCustomDriverPhone('')
    setShipmentNotes('')
    
    setShipmentModalOpen(true)
  }

  async function saveShipment() {
    if (selectedOrderIds.length === 0) return
    
    // Validation
    let plate = ''
    let driver = ''
    if (selectedVehicleId === 'new') {
      if (!customPlateNumber.trim()) {
        toast('Lütfen bir araç plakası girin.', 'error')
        return
      }
      plate = customPlateNumber.trim().toUpperCase()
      driver = `${customDriverName.trim()}`
      if (customDriverPhone.trim()) {
        driver += ` (${customDriverPhone.trim()})`
      }
    } else {
      const v = vehicles.find(item => item.id === selectedVehicleId)
      if (!v) {
        toast('Seçilen araç bulunamadı.', 'error')
        return
      }
      plate = v.plate_number
      driver = `${v.driver_name || ''}`
      if (v.driver_phone) {
        driver += ` (${v.driver_phone})`
      }
    }

    // 0. Validate available stock for all lines
    for (const item of consolidatedLinesForShipment) {
      const totalShipped = Number(shipmentLinesDraft[item.stock_item_id] !== undefined ? shipmentLinesDraft[item.stock_item_id] : item.total_requested)
      if (totalShipped <= 0) continue

      const picks = findPickingSources(item.stock_item_id, totalShipped)
      const totalPicked = picks.reduce((sum, p) => sum + p.qty, 0)
      
      if (totalPicked < totalShipped) {
        toast(`Stok yetersiz! "${item.item_name}" ürünü için depoda sadece ${totalPicked.toFixed(2)} ${item.unit || 'adet'} kullanılabilir stok var, fakat ${totalShipped.toFixed(2)} adet sevk edilmek isteniyor. Lütfen sevk miktarını düşürün veya depo stoğunu güncelleyin.`, 'error')
        return
      }
    }

    setSavingShipment(true)
    try {
      // 1. Generate unique shipment number
      const shipmentNo = 'SH-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8) + '-' + Math.floor(1000 + Math.random() * 9000)

      let vehicleId = null
      if (selectedVehicleId === 'new') {
        if (saveVehiclePermanently) {
          const { data: newVehicle, error: vehicleErr } = await db
            .from('vehicles')
            .insert({
              plate_number: plate,
              model: customModel.trim() || null,
              driver_name: customDriverName.trim() || null,
              driver_phone: customDriverPhone.trim() || null,
              active: true
            })
            .select()
          if (vehicleErr) throw vehicleErr
          if (newVehicle && newVehicle.length > 0) {
            vehicleId = newVehicle[0].id
          }
        }
      } else {
        vehicleId = selectedVehicleId
      }

      // 2. Insert warehouse_shipment
      const { data: newShipment, error: shipmentErr } = await db
        .from('warehouse_shipments')
        .insert({
          shipment_no: shipmentNo,
          source_branch_id: branchId,
          vehicle_id: vehicleId,
          plate_number: plate,
          driver_info: driver,
          status: 'draft',
          notes: shipmentNotes.trim() || null,
          meta: {}
        })
        .select()
      if (shipmentErr) throw shipmentErr
      const shipmentId = newShipment[0].id

      // 3. Insert warehouse_shipment_orders
      for (const orderId of selectedOrderIds) {
        const { error: poErr } = await db
          .from('warehouse_shipment_orders')
          .insert({
            shipment_id: shipmentId,
            purchase_order_id: orderId
          })
        if (poErr) throw poErr
      }

      // 4. Insert warehouse_shipment_lines and update purchase_order_lines
      for (const item of consolidatedLinesForShipment) {
        const totalShipped = Number(shipmentLinesDraft[item.stock_item_id] !== undefined ? shipmentLinesDraft[item.stock_item_id] : item.total_requested)
        if (totalShipped <= 0) continue

        // Query the picking sources once for the entire consolidated amount to prevent location over-picks
        const allPicks = findPickingSources(item.stock_item_id, totalShipped)
        let pickIndex = 0
        let pickOffset = 0
        let remaining = totalShipped

        for (const line of item.lines) {
          const lineShipped = Math.min(line.ordered_qty, remaining)
          remaining -= lineShipped
          if (lineShipped <= 0) continue

          // Distribute from the consolidated picking list
          const linePicks = []
          let lineRemaining = lineShipped

          while (lineRemaining > 0 && pickIndex < allPicks.length) {
            const currentPick = allPicks[pickIndex]
            const availableInPick = currentPick.qty - pickOffset
            const take = Math.min(availableInPick, lineRemaining)

            linePicks.push({
              location_id: currentPick.location_id,
              lpn_id: currentPick.lpn_id,
              lot_number: currentPick.lot_number,
              expiration_date: currentPick.expiration_date,
              qty: take
            })

            lineRemaining -= take
            pickOffset += take

            if (pickOffset >= currentPick.qty) {
              pickIndex++
              pickOffset = 0
            }
          }

          // Write shipment line with its specific distributed picks
          const { error: lineErr } = await db
            .from('warehouse_shipment_lines')
            .insert({
              shipment_id: shipmentId,
              purchase_order_line_id: line.line_id,
              stock_item_id: item.stock_item_id,
              shipped_qty: lineShipped,
              unit_price: line.unit_price,
              line_total: lineShipped * line.unit_price,
              meta: { picks: linePicks }
            })
          if (lineErr) throw lineErr

          // Update the original purchase order line
          const nextMeta = { ...parseJsonValue(line.meta, {}) }
          if (nextMeta.original_ordered_qty === undefined) {
            nextMeta.original_ordered_qty = line.ordered_qty
          }

          const { error: poLineUpdateErr } = await db
            .from('purchase_order_lines')
            .update({
              ordered_qty: lineShipped,
              line_total: lineShipped * line.unit_price,
              meta: nextMeta,
              updated_at: new Date().toISOString()
            })
            .eq('id', line.line_id)
          if (poLineUpdateErr) throw poLineUpdateErr
        }
      }

      // 5. Recalculate order totals for each associated order
      for (const orderId of selectedOrderIds) {
        const { data: updatedLines, error: fetchLinesErr } = await db
          .from('purchase_order_lines')
          .select('*')
          .eq('order_id', orderId)
          .is('deleted_at', null)
        if (fetchLinesErr) throw fetchLinesErr

        const nextTotalQty = updatedLines.reduce((sum, l) => sum + Number(l.ordered_qty || 0), 0)
        const nextTotalAmount = updatedLines.reduce((sum, l) => sum + Number(l.line_total || 0), 0)

        const { error: poUpdateErr } = await db
          .from('purchase_orders')
          .update({
            total_qty: nextTotalQty,
            total_amount: nextTotalAmount,
            subtotal: nextTotalAmount,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
        if (poUpdateErr) throw poUpdateErr
      }

      await logActivity({
        user,
        actionType: 'wms_shipment_create',
        route: '/depo-orders',
        entityType: 'warehouse_shipment',
        entityId: shipmentId,
        metadata: { shipment_no: shipmentNo, orders_count: selectedOrderIds.length },
      })

      toast(`Sevkiyat partisi (${shipmentNo}) başarıyla taslak olarak oluşturuldu.`, 'success')
      setShipmentModalOpen(false)
      setSelectedOrderIds([])
      await loadData()
    } catch (err) {
      toast(`Sevkiyat partisi oluşturulamadı: ${err?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setSavingShipment(false)
    }
  }

  async function confirmShipment(shipment) {
    if (!window.confirm('Bu sevkiyatı yola çıkarmak (sevk etmek) istediğinizden emin misiniz? Depodan stok çıkışı yapılacaktır.')) return
    setConfirmingShipmentId(shipment.id)
    setConfirmingAction(true)
    try {
      // Execute the atomic, idempotent RPC confirmation function on PostgreSQL
      const { error: rpcErr } = await db.rpc('confirm_warehouse_shipment', {
        p_shipment_id: shipment.id,
        p_branch_id: branchId,
        p_branch_name: branchName
      })
      if (rpcErr) throw rpcErr

      await logActivity({
        user,
        actionType: 'wms_shipment_confirm',
        route: '/depo-orders',
        entityType: 'warehouse_shipment',
        entityId: shipment.id,
        metadata: { shipment_no: shipment.shipment_no },
      })

      toast(`Sevkiyat (${shipment.shipment_no}) onaylandı ve yola çıktı. Depo stok çıkışları gerçekleştirildi.`, 'success')
      await loadData()
    } catch (err) {
      toast(`Sevkiyat onaylanamadı: ${err?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setConfirmingShipmentId('')
      setConfirmingAction(false)
    }
  }

  async function cancelShipment(shipmentId) {
    if (!window.confirm('Bu sevkiyat partisini iptal etmek istediğinizden emin misiniz?')) return
    setCancellingShipmentId(shipmentId)
    setCancellingAction(true)
    try {
      const { error } = await db
        .from('warehouse_shipments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', shipmentId)
      if (error) throw error

      // Restore PO lines original quantities
      const { data: lines } = await db.from('warehouse_shipment_lines').select('*').eq('shipment_id', shipmentId)
      if (lines) {
        for (const line of lines) {
          const { data: poLineData } = await db.from('purchase_order_lines').select('*').eq('id', line.purchase_order_line_id).limit(1)
          if (poLineData && poLineData.length > 0) {
            const poLine = poLineData[0]
            const lineMeta = parseJsonValue(poLine.meta, {})
            if (lineMeta.original_ordered_qty !== undefined) {
              const origQty = Number(lineMeta.original_ordered_qty)
              delete lineMeta.original_ordered_qty
              
              await db.from('purchase_order_lines').update({
                ordered_qty: origQty,
                line_total: origQty * Number(poLine.unit_price || 0),
                meta: lineMeta,
                updated_at: new Date().toISOString()
              }).eq('id', poLine.id)
            }
          }
        }
      }
      
      // Recalculate PO totals
      const { data: shOrders } = await db.from('warehouse_shipment_orders').select('purchase_order_id').eq('shipment_id', shipmentId)
      if (shOrders) {
        for (const sho of shOrders) {
          const { data: updatedLines } = await db.from('purchase_order_lines').select('*').eq('order_id', sho.purchase_order_id).is('deleted_at', null)
          if (updatedLines) {
            const nextTotalQty = updatedLines.reduce((sum, l) => sum + Number(l.ordered_qty || 0), 0)
            const nextTotalAmount = updatedLines.reduce((sum, l) => sum + Number(l.line_total || 0), 0)
            await db.from('purchase_orders').update({
              total_qty: nextTotalQty,
              total_amount: nextTotalAmount,
              subtotal: nextTotalAmount,
              updated_at: new Date().toISOString()
            }).eq('id', sho.purchase_order_id)
          }
        }
      }

      await logActivity({
        user,
        actionType: 'wms_shipment_cancel',
        route: '/depo-orders',
        entityType: 'warehouse_shipment',
        entityId: shipmentId,
        metadata: {},
      })

      toast('Sevkiyat başarıyla iptal edildi. Orijinal miktar talepleri geri yüklendi.', 'success')
      await loadData()
    } catch (err) {
      toast(`Sevkiyat iptal edilemedi: ${err?.message || 'Bilinmeyen hata'}`, 'error')
    } finally {
      setCancellingShipmentId('')
      setCancellingAction(false)
    }
  }

  const selectedShipment = useMemo(() => {
    return shipments.find(s => s.id === detailShipmentId) || null
  }, [shipments, detailShipmentId])

  const selectedShipmentLines = useMemo(() => {
    if (!detailShipmentId) return []
    return shipmentLines.filter(l => l.shipment_id === detailShipmentId)
  }, [shipmentLines, detailShipmentId])

  const selectedShipmentOrders = useMemo(() => {
    if (!detailShipmentId) return []
    const mapped = shipmentOrders.filter(so => so.shipment_id === detailShipmentId)
    const orderIds = new Set(mapped.map(so => so.purchase_order_id))
    return orders.filter(o => orderIds.has(o.id))
  }, [shipmentOrders, detailShipmentId, orders])

  const consolidatedShipmentLines = useMemo(() => {
    const map = {}
    for (const line of selectedShipmentLines) {
      const itemId = line.stock_item_id
      const name = line.stock_items?.name || 'Bilinmeyen Ürün'
      const sku = line.stock_items?.sku || '-'
      const unit = line.stock_items?.unit || 'Adet'
      if (!map[itemId]) {
        map[itemId] = {
          stock_item_id: itemId,
          item_name: name,
          item_sku: sku,
          unit: unit,
          shipped_qty: 0,
          unit_price: Number(line.unit_price || 0),
          line_total: 0,
          picks: []
        }
      }
      map[itemId].shipped_qty += Number(line.shipped_qty || 0)
      map[itemId].line_total += Number(line.line_total || 0)
      
      const lineMeta = parseJsonValue(line.meta, {})
      if (lineMeta.picks && Array.isArray(lineMeta.picks)) {
        map[itemId].picks.push(...lineMeta.picks)
      }
    }
    return Object.values(map).sort((a, b) => a.item_name.localeCompare(b.item_name, 'tr'))
  }, [selectedShipmentLines])

  if (!branchId) {
    return (
      <div style={{ padding: 24 }}>
        <Header title="Ana Depo Sipariş Paneli" subtitle="Lütfen aktif bir ana depo seçimi yapın." />
      </div>
    )
  }

  return (
    <div>
      <Header
        title="WMS Sipariş Konsolu"
        subtitle={`${branchName} — Şube ikmal taleplerini yönetin, stok kontrol edin, sevk edin.`}
        actions={
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {/* Ana Depo Bağlam Rozeti */}
            <div style={{
              display:'inline-flex',alignItems:'center',gap:8,
              background:'linear-gradient(135deg,#0f172a,#1e3a5f)',
              color:'#38bdf8',padding:'7px 14px',borderRadius:10,
              fontSize:'.78rem',fontWeight:800,letterSpacing:'.01em',
              border:'1px solid rgba(56,189,248,.3)',
              boxShadow:'0 2px 8px rgba(56,189,248,.15)'
            }}>
              <i className="fa-solid fa-warehouse" style={{fontSize:'.85rem'}}/>
              <span style={{color:'#e2e8f0'}}>{branchName}</span>
              <span style={{
                background:'#38bdf8',color:'#0f172a',
                borderRadius:6,padding:'1px 7px',fontSize:'.68rem',fontWeight:900
              }}>ANA DEPO</span>
            </div>
            <button className="btn-o" onClick={loadData} style={{fontSize:'.82rem'}}>
              <i className="fa-solid fa-rotate-right"/> Yenile
            </button>
          </div>
        }
      />

      {/* WMS Süreç Göstergesi */}
      {syncedSupplier && (
        <div className="card" style={{
          padding:'12px 20px',marginBottom:14,
          background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)',
          border:'1px solid rgba(56,189,248,.2)'
        }}>
          <div style={{display:'flex',alignItems:'center',gap:0}}>
            {[
              {icon:'fa-boxes-stacked',label:'Talepler',sub:`${pendingOrders.length} bekliyor`,color:'#38bdf8',active: activeTab==='pending_requests'},
              {icon:'fa-list-check',label:'Toplama',sub:'Pick listesi',color:'#a78bfa',active: activeTab==='pick_list'||activeTab==='product_branch'||activeTab==='branch_product'},
              {icon:'fa-truck-container',label:'Sevkiyat',sub:`${shipments.filter(s=>['draft','ready_to_load'].includes(s.status)).length} hazırlıkta`,color:'#fbbf24',active: activeTab==='shipments'},
              {icon:'fa-truck-ramp-box',label:'Mal Kabul',sub:'Şubeye teslim',color:'#34d399',active:false},
            ].map((step,i,arr)=>(
              <>
                <div key={step.label} onClick={()=>{
                  if(step.label==='Talepler') setActiveTab('pending_requests')
                  else if(step.label==='Toplama') setActiveTab('pick_list')
                  else if(step.label==='Sevkiyat') setActiveTab('shipments')
                }} style={{
                  display:'flex',alignItems:'center',gap:8,padding:'6px 16px',
                  borderRadius:10,cursor:'pointer',transition:'.15s',
                  background: step.active ? 'rgba(56,189,248,.12)' : 'transparent',
                  border: step.active ? `1px solid ${step.color}40` : '1px solid transparent',
                }}>
                  <div style={{
                    width:32,height:32,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                    background: step.active ? step.color : '#1e293b',
                    border:`2px solid ${step.active ? step.color : '#334155'}`,
                    flexShrink:0
                  }}>
                    <i className={`fa-solid ${step.icon}`} style={{fontSize:'.75rem',color: step.active?'#0f172a':step.color}}/>
                  </div>
                  <div>
                    <div style={{fontSize:'.78rem',fontWeight:800,color: step.active ? step.color : '#94a3b8'}}>{step.label}</div>
                    <div style={{fontSize:'.68rem',color:'#64748b'}}>{step.sub}</div>
                  </div>
                </div>
                {i < arr.length-1 && (
                  <div style={{flex:1,height:2,background:'linear-gradient(90deg,#334155,#1e293b)',minWidth:16,maxWidth:40}}/>
                )}
              </>
            ))}
          </div>
        </div>
      )}

      {!loading && !syncedSupplier && (
        <div className="card" style={{ padding: 24, borderColor: '#fca5a5', background: '#fef2f2', color: '#991b1b', marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 8 }}>
            <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 8 }} />
            İç Tedarikçi Eşleşmesi Bulunamadı
          </div>
          <div style={{ fontSize: '.85rem', lineHeight: 1.6 }}>
            Seçili <strong>{branchName}</strong> şirketi için <code>suppliers</code> tablosunda tanımlı bir iç depo tedarikçi kaydı bulunamadı.
            Lütfen şirket ağacından bu konumu depo tipinde tanımlayarak senkronize olmasını sağlayın.
          </div>
        </div>
      )}

      {syncedSupplier && (
        <>
          {/* Filters Bar */}
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <label className="f-label" style={{ fontSize: '.75rem', fontWeight: 800, color: '#475569', marginBottom: 4 }}>Arama</label>
                <input
                  className="f-input"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Sipariş no, şube ara..."
                />
              </div>

              <div>
                <label className="f-label" style={{ fontSize: '.75rem', fontWeight: 800, color: '#475569', marginBottom: 4 }}>Lokasyon / Raf</label>
                <select
                  className="f-input"
                  value={selectedLocationId}
                  onChange={e => setSelectedLocationId(e.target.value)}
                >
                  <option value="">Tüm Lokasyonlar (Depo Geneli)</option>
                  {warehouseLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {`${loc.zone_code || ''}-${loc.aisle || ''}${loc.rack || ''}-${loc.level || ''}${loc.bin || ''} (${loc.usage_type || ''})`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="f-label" style={{ fontSize: '.75rem', fontWeight: 800, color: '#475569', marginBottom: 4 }}>LPN / Palet</label>
                <select
                  className="f-input"
                  value={selectedLpnId}
                  onChange={e => setSelectedLpnId(e.target.value)}
                >
                  <option value="">Tüm LPN / Paletler</option>
                  {warehouseLpns.map(lpn => (
                    <option key={lpn.id} value={lpn.id}>
                      {lpn.lpn_code}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="f-label" style={{ fontSize: '.75rem', fontWeight: 800, color: '#475569', marginBottom: 4 }}>Son Kullanma Tarihi</label>
                <select
                  className="f-input"
                  value={selectedSkt}
                  onChange={e => setSelectedSkt(e.target.value)}
                >
                  <option value="">Tüm SKT'ler</option>
                  {uniqueSkts.map(date => (
                    <option key={date} value={date}>
                      {formatDate(date)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(selectedLocationId || selectedLpnId || selectedSkt) && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="btn-o"
                  type="button"
                  onClick={() => {
                    setSelectedLocationId('')
                    setSelectedLpnId('')
                    setSelectedSkt('')
                  }}
                  style={{ fontSize: '.75rem', padding: '4px 10px' }}
                >
                  <i className="fa-solid fa-filter-circle-xmark" /> Filtreleri Temizle
                </button>
              </div>
            )}
          </div>

          {/* Section Navigation Tabs */}
          <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e5e5e5', marginBottom: 16 }}>
            {TABS.map(tab => {
              let count = ''
              if (tab.key === 'pending_requests') {
                count = pendingOrders.length > 0 ? `${pendingOrders.length}` : ''
              } else if (tab.key === 'shipments') {
                const activeCount = shipments.filter(s => ['draft','ready_to_load','in_transit'].includes(s.status)).length
                count = activeCount > 0 ? `${activeCount}` : ''
              }
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '10px 18px',
                    fontWeight: 800,
                    fontSize: '.85rem',
                    border: 'none',
                    background: 'none',
                    color: activeTab === tab.key ? '#f5a623' : '#888888',
                    borderBottom: activeTab === tab.key ? '3px solid #f5a623' : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'all .18s ease',
                    display:'flex',alignItems:'center',gap:6
                  }}
                >
                  {tab.label}
                  {count && (
                    <span style={{
                      background: tab.key === 'shipments' ? '#fef3c7' : '#e0f2fe',
                      color: tab.key === 'shipments' ? '#b45309' : '#0369a1',
                      borderRadius:20,padding:'1px 8px',fontSize:'.68rem',fontWeight:900
                    }}>{count.trim()}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Tab Content Rendering */}
          <div className="card" style={{ padding: 16, minHeight: 320 }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#888888' }}>
                <i className="fa-solid fa-circle-notch fa-spin fa-2x" style={{ color: '#f5a623', marginBottom: 12 }} />
                <div>Veriler yükleniyor...</div>
              </div>
            ) : (
              <>
                {/* 1. BEKLEYEN TALEPLER */}
                {activeTab === 'pending_requests' && (
                  <div>
                    {selectedOrderIds.length > 0 && (
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        padding: '12px 16px',
                        borderRadius: 8,
                        marginBottom: 16,
                        animation: 'fadeIn 0.2s ease'
                      }}>
                        <span style={{ fontSize: '.84rem', fontWeight: 700, color: '#92400e' }}>
                          <i className="fa-solid fa-square-check" style={{ marginRight: 6 }} />
                          {selectedOrderIds.length} Sipariş Seçildi
                        </span>
                        <button
                          className="btn-p"
                          type="button"
                          onClick={() => openCreateShipmentModalForOrders(selectedOrderIds)}
                          style={{
                            background: '#f5a623',
                            color: '#000',
                            fontWeight: 800,
                            fontSize: '.78rem',
                            padding: '6px 14px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6
                          }}
                        >
                          <i className="fa-solid fa-truck-container" /> Sevk Partisi (Yükleme) Oluştur
                        </button>
                      </div>
                    )}
                    
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                        <thead>
                          <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                            <th style={{ padding: '12px 14px', width: 40, textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={pendingOrders.length > 0 && selectedOrderIds.length === pendingOrders.length}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setSelectedOrderIds(pendingOrders.map(o => o.id))
                                  } else {
                                    setSelectedOrderIds([])
                                  }
                                }}
                              />
                            </th>
                            <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Sipariş No</th>
                            <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Talep Eden Şube</th>
                            <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Açıklama</th>
                            <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888888' }}>Durum</th>
                            <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Sevk/Teslim Tarihi</th>
                            <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Toplam Adet</th>
                            <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Toplam Tutar</th>
                            <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888888' }}>İşlemler</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleOrders.map(order => {
                            const bucket = classifyWmsOrder(order)
                            const meta = getOrderMeta(order)
                            const dispatch = meta.supplier_dispatch || {}
                            return (
                              <tr key={order.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                                <td style={{ padding: '12px 14px', width: 40, textAlign: 'center' }}>
                                  {bucket === 'ready' && (
                                    <input
                                      type="checkbox"
                                      checked={selectedOrderIds.includes(order.id)}
                                      onChange={e => {
                                        if (e.target.checked) {
                                          setSelectedOrderIds(prev => [...prev, order.id])
                                        } else {
                                          setSelectedOrderIds(prev => prev.filter(id => id !== order.id))
                                        }
                                      }}
                                    />
                                  )}
                                </td>
                                <td style={{ padding: '12px 14px', fontWeight: 800 }}>{order.order_no}</td>
                                <td style={{ padding: '12px 14px' }}>{order.branch_name || '-'}</td>
                                <td style={{ padding: '12px 14px', color: '#888888' }}>{order.description || '-'}</td>
                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                  <StatusBadge bucket={bucket} />
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                  {dispatch?.delivered_on
                                    ? formatDateTime(dispatch.delivered_on, dispatch.delivered_at || '')
                                    : (order.delivery_date ? formatDate(order.delivery_date) : '-')}
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700 }}>
                                  {formatQty(order.total_qty)}
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>
                                  ₺{formatMoney(order.total_amount)}
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                    <button
                                      className="btn-o"
                                      type="button"
                                      onClick={() => setDetailOrderId(order.id)}
                                      style={{ padding: '4px 8px', fontSize: '.75rem' }}
                                    >
                                      <i className="fa-solid fa-eye" /> {bucket === 'ready' ? 'Düzenle / Detay' : 'Detay'}
                                    </button>
                                    {bucket === 'ready' && (
                                      <button
                                        className="btn-p"
                                        type="button"
                                        onClick={() => openCreateShipmentModalForOrders([order.id])}
                                        style={{ padding: '4px 8px', fontSize: '.75rem', background: '#f5a623', color: '#000' }}
                                      >
                                        <i className="fa-solid fa-truck-ramp-box" /> Sevk Et
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {visibleOrders.length === 0 && (
                            <tr>
                              <td colSpan={9} style={{ padding: 12 }}>
                                <EmptyState
                                  icon="fa-boxes-packing"
                                  title="Bekleyen Talep Bulunmuyor"
                                  description="Şubelerden gelen WMS ikmal talepleri veya merkez siparişleri burada listelenir."
                                  actionTip="Şube panellerinden depo transfer talebi oluşturulduğunda bu listeye otomatik düşer."
                                />
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 2. TOPLAMA LİSTESİ */}
                {activeTab === 'pick_list' && (
                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ marginBottom: 12, fontSize: '.8rem', color: '#888888' }}>
                      Sevk bekleyen siparişlerin toplam ürün konsolidasyonudur. Filtreler uygulandığında kullanılabilir stok sadece filtre şartlarına uyan raflardakine göre hesaplanır.
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>SKU</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Ürün Adı</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Birim</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Toplam Talep</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Kullanılabilir Depo Stoku</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888888' }}>Yeterlilik</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consolidatedRows.map(row => {
                          const available = availableStockMap[row.stock_item_id] || 0
                          const sufficient = available >= row.total_requested
                          return (
                            <tr key={row.stock_item_id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 700 }}>{row.item_sku}</td>
                              <td style={{ padding: '12px 14px' }}>{row.item_name}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>{row.unit}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800 }}>
                                {formatQty(row.total_requested)}
                              </td>
                              <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: available > 0 ? '#15803d' : '#dc2626' }}>
                                {formatQty(available)}
                              </td>
                              <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: '.72rem',
                                  fontWeight: 800,
                                  background: sufficient ? '#f0fdf4' : '#fef2f2',
                                  color: sufficient ? '#15803d' : '#dc2626',
                                  border: `1px solid ${sufficient ? '#bbf7d0' : '#fecaca'}`
                                }}>
                                  {sufficient ? 'Yeterli' : 'Stok Yetersiz'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                        {consolidatedRows.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ padding: 12 }}>
                              <EmptyState
                                icon="fa-list-check"
                                title="Toplama Listesi Boş"
                                description="Toplama planı oluşturulacak aktif bir sipariş seçilmedi."
                                actionTip="Bekleyen Talepler sekmesinden sevk etmek istediğiniz siparişleri seçin."
                              />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. ÜRÜN -> ŞUBE DAĞILIMI */}
                {activeTab === 'product_branch' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888888' }}>Ürün Adı</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888888' }}>SKU</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888888' }}>Talep Eden Şube</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', color: '#888888' }}>Talep Miktarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {productBranchRows.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{row.item_name}</td>
                            <td style={{ padding: '10px 12px', color: '#888888' }}>{row.item_sku}</td>
                            <td style={{ padding: '10px 12px' }}>{row.branch_name}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{formatQty(row.qty)}</td>
                          </tr>
                        ))}
                        {productBranchRows.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ padding: 12 }}>
                              <EmptyState
                                icon="fa-diagram-project"
                                title="Dağıtım Detayı Yok"
                                description="Filtre koşullarına uyan veya toplanacak aktif sipariş/ürün bulunmadığı için dağıtım kırılımı gösterilemiyor."
                              />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 4. ŞUBE -> ÜRÜN DAĞILIMI */}
                {activeTab === 'branch_product' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888888' }}>Şube Adı</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888888' }}>Ürün Adı</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', color: '#888888' }}>SKU</th>
                          <th style={{ padding: '10px 12px', textAlign: 'right', color: '#888888' }}>Talep Miktarı</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchProductRows.map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 700 }}>{row.branch_name}</td>
                            <td style={{ padding: '10px 12px' }}>{row.item_name}</td>
                            <td style={{ padding: '10px 12px', color: '#888888' }}>{row.item_sku}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>{formatQty(row.qty)}</td>
                          </tr>
                        ))}
                        {branchProductRows.length === 0 && (
                          <tr>
                            <td colSpan={4} style={{ padding: 12 }}>
                              <EmptyState
                                icon="fa-diagram-project"
                                title="Dağıtım Detayı Yok"
                                description="Filtre koşullarına uyan veya toplanacak aktif sipariş/ürün bulunmadığı için dağıtım kırılımı gösterilemiyor."
                              />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 5. SEVKİYATLAR / ARAÇ YÜKLEME */}
                {activeTab === 'shipments' && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                      <thead>
                        <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Sevkiyat No</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Durum</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Araç / Plaka</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Şoför Bilgisi</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888888' }}>Sipariş Sayısı</th>
                          <th style={{ padding: '12px 14px', textAlign: 'left', color: '#888888' }}>Notlar</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right', color: '#888888' }}>Tarih</th>
                          <th style={{ padding: '12px 14px', textAlign: 'center', color: '#888888' }}>İşlemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shipments.map(shipment => {
                          const orderCount = shipmentOrders.filter(so => so.shipment_id === shipment.id).length
                          return (
                            <tr key={shipment.id} style={{ borderBottom: '1px solid #e5e5e5' }}>
                              <td style={{ padding: '12px 14px', fontWeight: 800 }}>{shipment.shipment_no}</td>
                              <td style={{ padding: '12px 14px' }}>
                                <ShipmentStatusBadge status={shipment.status} />
                              </td>
                              <td style={{ padding: '12px 14px', fontWeight: 700 }}>{shipment.plate_number || '-'}</td>
                              <td style={{ padding: '12px 14px' }}>{shipment.driver_info || '-'}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800 }}>{orderCount}</td>
                              <td style={{ padding: '12px 14px', color: '#888888' }}>{shipment.notes || '-'}</td>
                              <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                {formatDateTime(shipment.created_at)}
                              </td>
                              <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                  <button
                                    className="btn-o"
                                    type="button"
                                    onClick={() => {
                                      setDetailShipmentId(shipment.id)
                                      setShipmentDetailOpen(true)
                                    }}
                                    style={{ padding: '4px 8px', fontSize: '.75rem' }}
                                  >
                                    <i className="fa-solid fa-circle-info" /> Detaylar
                                  </button>
                                  {shipment.status === 'draft' && (
                                    <>
                                      <button
                                        className="btn-p"
                                        type="button"
                                        disabled={confirmingShipmentId === shipment.id && confirmingAction}
                                        onClick={() => confirmShipment(shipment)}
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '.75rem',
                                          background: '#15803d',
                                          color: '#fff',
                                          border: 'none',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        {confirmingShipmentId === shipment.id && confirmingAction ? (
                                          <i className="fa-solid fa-spinner fa-spin" />
                                        ) : (
                                          <i className="fa-solid fa-circle-check" />
                                        )}{' '}
                                        Sevk Et (Onayla)
                                      </button>
                                      <button
                                        className="btn-o"
                                        type="button"
                                        disabled={cancellingShipmentId === shipment.id && cancellingAction}
                                        onClick={() => cancelShipment(shipment.id)}
                                        style={{
                                          padding: '4px 8px',
                                          fontSize: '.75rem',
                                          borderColor: '#dc2626',
                                          color: '#dc2626'
                                        }}
                                      >
                                        {cancellingShipmentId === shipment.id && cancellingAction ? (
                                          <i className="fa-solid fa-spinner fa-spin" />
                                        ) : (
                                          <i className="fa-solid fa-trash-can" />
                                        )}{' '}
                                        İptal
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {shipments.length === 0 && (
                          <tr>
                            <td colSpan={8} style={{ padding: 12 }}>
                              <EmptyState
                                icon="fa-truck-ramp-box"
                                title="Aktif Sevkiyat Bulunmuyor"
                                description="Henüz hazırlanma veya sevk aşamasında olan bir araç yükleme kaydı yok."
                                actionTip="Siparişleri seçip sağ üstteki 'Sevk Et' butonuna tıklayarak yeni bir sevkiyat başlatabilirsiniz."
                              />
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* DETAIL & PARTIAL FULFILLMENT MODAL */}
      <Modal
        open={!!selectedOrder}
        onClose={() => setDetailOrderId('')}
        title={selectedOrder ? `Sipariş Detayı - ${selectedOrder.order_no}` : 'Sipariş Detayı'}
        width={1000}
        flex
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-o" onClick={() => setDetailOrderId('')} disabled={savingEdit}>Kapat</button>
            {classifyWmsOrder(selectedOrder) === 'ready' && (
              <button
                className="btn-p"
                onClick={saveQuantityEdits}
                disabled={savingEdit}
                style={{ background: '#f5a623', color: '#000' }}
              >
                {savingEdit ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            )}
          </div>
        }
      >
        {selectedOrder && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: '.82rem', color: '#888888' }}>
              <div>
                <strong>Şube:</strong> {selectedOrder.branch_name} • <strong>Tarih:</strong> {formatDate(selectedOrder.order_date)}
              </div>
              <div>
                <strong>Akış:</strong> {selectedOrder.flow_name || '-'}
              </div>
            </div>

            {classifyWmsOrder(selectedOrder) === 'ready' && (
              <div style={{ padding: '10px 12px', border: '1px solid #fbe5c6', background: '#fffbeb', borderRadius: 8, fontSize: '.8rem', color: '#b45309' }}>
                <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} />
                Bu sipariş henüz sevk edilmemiştir. Depodaki stoka göre <strong>Talep Edilen Adet</strong> sütunundan manuel miktar düzeltmesi yapabilir ve kısmi karşılama planlayabilirsiniz.
              </div>
            )}

            <div style={{ overflowX: 'auto', border: '1px solid #e5e5e5', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e5e5', color: '#888888' }}>Ürün Adı</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e5e5', color: '#888888' }}>SKU</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e5e5e5', color: '#888888' }}>Birim Fiyat</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e5e5e5', color: '#888888' }}>Talep Edilen Adet</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e5e5e5', color: '#888888' }}>Satır Tutarı</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrderLines.map((line, index) => {
                    const isReady = classifyWmsOrder(selectedOrder) === 'ready'
                    const lineMeta = parseJsonValue(line.meta, {})
                    const hasAdjustment = lineMeta.original_ordered_qty !== undefined
                    return (
                      <tr key={line.id || index} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700 }}>{line.item_name || '-'}</td>
                        <td style={{ padding: '10px 12px', color: '#888888' }}>{line.item_sku || '-'}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>₺{formatMoney(line.unit_price)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {isReady ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <input
                                className="f-input"
                                type="number"
                                min="0"
                                step="any"
                                value={editingLines[line.id] !== undefined ? editingLines[line.id] : Number(line.ordered_qty)}
                                onChange={e => {
                                  const val = e.target.value
                                  setEditingLines(prev => ({ ...prev, [line.id]: val === '' ? '' : Number(val) }))
                                }}
                                style={{ width: 100, textAlign: 'right', padding: '4px 8px' }}
                              />
                              {hasAdjustment && (
                                <span style={{ fontSize: '.7rem', color: '#b45309', fontWeight: 800 }}>
                                  Orijinal: {formatQty(lineMeta.original_ordered_qty)} {line.unit}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div style={{ display: 'grid', justifyItems: 'end' }}>
                              <span style={{ fontWeight: 800 }}>{formatQty(line.ordered_qty)} {line.unit}</span>
                              {hasAdjustment && (
                                <span style={{ fontSize: '.7rem', color: '#b45309', fontWeight: 800 }}>
                                  Orijinal: {formatQty(lineMeta.original_ordered_qty)} {line.unit}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>
                          ₺{formatMoney(
                            (editingLines[line.id] !== undefined ? Number(editingLines[line.id]) : Number(line.ordered_qty)) * Number(line.unit_price || 0)
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* DISPATCH (SEVK ET) MODAL */}
      <Modal
        open={!!dispatchOrder}
        onClose={() => {
          if (!dispatchSaving) {
            setDispatchOrder(null)
            setDispatchDraft(null)
          }
        }}
        title={dispatchOrder ? `Siparişi Sevk Et - ${dispatchOrder.order_no}` : 'Sevk Et'}
        width={760}
        flex
        footer={
          <>
            <button className="btn-o" onClick={() => { setDispatchOrder(null); setDispatchDraft(null) }} disabled={dispatchSaving}>Vazgeç</button>
            <button
              className="btn-p"
              onClick={saveDispatch}
              disabled={dispatchSaving}
              style={{ background: '#f5a623', color: '#000' }}
            >
              {dispatchSaving ? 'Kaydediliyor...' : 'Sevk Bildirimini Kaydet'}
            </button>
          </>
        }
      >
        {dispatchDraft && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="f-label">Teslim Tarihi</label>
                <input
                  className="f-input"
                  type="date"
                  value={dispatchDraft.delivered_on}
                  onChange={e => setDispatchDraft(prev => ({ ...prev, delivered_on: e.target.value }))}
                />
              </div>
              <div>
                <label className="f-label">Teslim Saati</label>
                <input
                  className="f-input"
                  type="time"
                  value={dispatchDraft.delivered_at}
                  onChange={e => setDispatchDraft(prev => ({ ...prev, delivered_at: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="f-label">Sevk Belgesi Türü</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DOC_KIND_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDispatchDraft(prev => ({ ...prev, doc_kind: option.value }))}
                    style={{
                      border: `1.5px solid ${dispatchDraft.doc_kind === option.value ? '#f5a623' : '#e5e5e5'}`,
                      background: dispatchDraft.doc_kind === option.value ? 'rgba(245,166,35,0.08)' : '#fff',
                      color: dispatchDraft.doc_kind === option.value ? '#f5a623' : '#475569',
                      borderRadius: 12,
                      padding: '8px 10px',
                      fontWeight: 800,
                      fontSize: '.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="f-label">Belge Tarihi</label>
                <input
                  className="f-input"
                  type="date"
                  value={dispatchDraft.doc_date}
                  onChange={e => setDispatchDraft(prev => ({ ...prev, doc_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="f-label">Belge No</label>
                <input
                  className="f-input"
                  value={dispatchDraft.doc_no}
                  maxLength={16}
                  onChange={e => setDispatchDraft(prev => ({ ...prev, doc_no: e.target.value }))}
                  placeholder="En fazla 16 karakter"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
              <div>
                <label className="f-label">Notlar</label>
                <input
                  className="f-input"
                  value={dispatchDraft.note}
                  onChange={e => setDispatchDraft(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Sevk notu"
                />
              </div>
              <div>
                <label className="f-label">Araç Plaka / Şoför</label>
                <input
                  className="f-input"
                  value={dispatchDraft.plate_number}
                  onChange={e => setDispatchDraft(prev => ({ ...prev, plate_number: e.target.value }))}
                  placeholder="Örn: 34 WMS 102"
                />
              </div>
            </div>

            <div>
              <label className="f-label">Açıklama</label>
              <input
                className="f-input"
                value={dispatchDraft.explanation}
                onChange={e => setDispatchDraft(prev => ({ ...prev, explanation: e.target.value }))}
                placeholder="Genel açıklama"
              />
            </div>
          </div>
        )}
      </Modal>

      {/* NEW SHIPMENT PARTY CREATION MODAL */}
      <Modal
        open={shipmentModalOpen}
        onClose={() => {
          if (!savingShipment) {
            setShipmentModalOpen(false)
          }
        }}
        title="Yeni Sevk Partisi (Araç Yükleme) Oluştur"
        width={900}
        flex
        footer={
          <>
            <button className="btn-o" onClick={() => setShipmentModalOpen(false)} disabled={savingShipment}>İptal</button>
            <button
              className="btn-p"
              onClick={saveShipment}
              disabled={savingShipment}
              style={{ background: '#f5a623', color: '#000', fontWeight: 800 }}
            >
              {savingShipment ? 'Yükleniyor...' : 'Sevk Partisini Kaydet'}
            </button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ border: '1px solid #e2e8f0', background: '#f8fafc', padding: 14, borderRadius: 12 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '.88rem', fontWeight: 800, color: '#334155' }}>
              <i className="fa-solid fa-truck" style={{ marginRight: 6, color: '#f5a623' }} /> Araç ve Plaka Atama
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12, marginBottom: 10 }}>
              <div>
                <label className="f-label" style={{ fontSize: '.72rem', fontWeight: 800 }}>Kayıtlı Araç</label>
                <select
                  className="f-input"
                  value={selectedVehicleId}
                  onChange={e => setSelectedVehicleId(e.target.value)}
                  style={{ padding: '8px 10px' }}
                >
                  <option value="new">+ Yeni Araç / Serbest Giriş</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {`${v.plate_number} - ${v.driver_name || 'Şoför Belirtilmemiş'} (${v.model || ''})`}
                    </option>
                  ))}
                </select>
              </div>
              
              {selectedVehicleId === 'new' && (
                <div>
                  <label className="f-label" style={{ fontSize: '.72rem', fontWeight: 800 }}>Plaka *</label>
                  <input
                    className="f-input"
                    value={customPlateNumber}
                    onChange={e => setCustomPlateNumber(e.target.value)}
                    placeholder="Örn: 34 WMS 102"
                    style={{ textTransform: 'uppercase', padding: '8px 10px' }}
                  />
                </div>
              )}
            </div>

            {selectedVehicleId === 'new' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, animation: 'fadeIn 0.2s ease' }}>
                <div>
                  <label className="f-label" style={{ fontSize: '.72rem', fontWeight: 800 }}>Şoför Adı</label>
                  <input
                    className="f-input"
                    value={customDriverName}
                    onChange={e => setCustomDriverName(e.target.value)}
                    placeholder="Şoför adı soyadı"
                    style={{ padding: '8px 10px' }}
                  />
                </div>
                <div>
                  <label className="f-label" style={{ fontSize: '.72rem', fontWeight: 800 }}>Şoför Telefonu</label>
                  <input
                    className="f-input"
                    value={customDriverPhone}
                    onChange={e => setCustomDriverPhone(e.target.value)}
                    placeholder="05xx xxx xx xx"
                    style={{ padding: '8px 10px' }}
                  />
                </div>
                <div>
                  <label className="f-label" style={{ fontSize: '.72rem', fontWeight: 800 }}>Araç Model / Marka</label>
                  <input
                    className="f-input"
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                    placeholder="Ford Transit vb."
                    style={{ padding: '8px 10px' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', marginTop: 18 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.74rem', fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={saveVehiclePermanently}
                      onChange={e => setSaveVehiclePermanently(e.target.checked)}
                    />
                    Bu aracı kalıcı kaydet
                  </label>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="f-label" style={{ fontSize: '.72rem', fontWeight: 800 }}>Sevkiyat Notları / Özel Açıklamalar</label>
            <input
              className="f-input"
              value={shipmentNotes}
              onChange={e => setShipmentNotes(e.target.value)}
              placeholder="Örn: Ankara rotası, soğuk zincir teslimatı."
              style={{ padding: '8px 10px' }}
            />
          </div>

          <div style={{ border: '1px solid #e5e5e5', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#fafafa', padding: '10px 14px', borderBottom: '1px solid #e5e5e5', fontSize: '.78rem', fontWeight: 800, color: '#475569' }}>
              Konsolide Yük Listesi (Kısmi Miktar Düzenleme)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: '#fff', borderBottom: '1px solid #e5e5e5' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888888' }}>SKU</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888888' }}>Ürün Adı</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Talep Edilen</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Yüklenecek (Sevk) *</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedLinesForShipment.map(item => {
                  const val = shipmentLinesDraft[item.stock_item_id] !== undefined ? shipmentLinesDraft[item.stock_item_id] : item.total_requested
                  return (
                    <tr key={item.stock_item_id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 700 }}>{item.item_sku}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div>{item.item_name}</div>
                        <div style={{ fontSize: '.7rem', color: '#888888', marginTop: 3 }}>
                          {item.lines.map((l, idx) => (
                            <span key={idx} style={{ marginRight: 8, display: 'inline-block', background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>
                              {l.branch_name}: {formatQty(l.ordered_qty)} {item.unit} ({l.order_no})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                        {formatQty(item.total_requested)} {item.unit}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <input
                          className="f-input"
                          type="number"
                          min="0"
                          max={item.total_requested}
                          step="any"
                          value={val}
                          onChange={e => {
                            const v = e.target.value
                            setShipmentLinesDraft(prev => ({
                              ...prev,
                              [item.stock_item_id]: v === '' ? '' : Math.min(Number(v), item.total_requested)
                            }))
                          }}
                          style={{ width: 100, textAlign: 'right', padding: '4px 8px', display: 'inline-block' }}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* SHIPMENT DETAIL MODAL */}
      <Modal
        open={shipmentDetailOpen}
        onClose={() => setShipmentDetailOpen(false)}
        title={selectedShipment ? `Sevkiyat Detayı - ${selectedShipment.shipment_no}` : 'Sevkiyat Detayı'}
        width={900}
        flex
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-o" onClick={() => setShipmentDetailOpen(false)}>Kapat</button>
            {selectedShipment?.status === 'draft' && (
              <button
                className="btn-p"
                onClick={async () => {
                  setShipmentDetailOpen(false)
                  await confirmShipment(selectedShipment)
                }}
                style={{ background: '#15803d', color: '#fff', fontWeight: 800 }}
              >
                <i className="fa-solid fa-circle-check" /> Sevk Et (Onayla)
              </button>
            )}
          </div>
        }
      >
        {selectedShipment && (
          <div style={{ display: 'grid', gap: 16 }}>
            {/* Header info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, borderBottom: '1px solid #e5e5e5', paddingBottom: 16 }}>
              <div>
                <div style={{ fontSize: '.7rem', color: '#888888', fontWeight: 700 }}>DURUM</div>
                <div style={{ marginTop: 4 }}><ShipmentStatusBadge status={selectedShipment.status} /></div>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#888888', fontWeight: 700 }}>ARAÇ / PLAKA</div>
                <div style={{ fontWeight: 800, fontSize: '.9rem', marginTop: 4 }}>{selectedShipment.plate_number || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#888888', fontWeight: 700 }}>ŞOFÖR BİLGİSİ</div>
                <div style={{ fontWeight: 700, fontSize: '.9rem', marginTop: 4 }}>{selectedShipment.driver_info || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', color: '#888888', fontWeight: 700 }}>OLUŞTURULMA TARİHİ</div>
                <div style={{ fontWeight: 700, fontSize: '.9rem', marginTop: 4 }}>{formatDateTime(selectedShipment.created_at)}</div>
              </div>
            </div>

            {selectedShipment.notes && (
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: '.8rem', borderLeft: '3px solid #cbd5e1' }}>
                <strong>Notlar:</strong> {selectedShipment.notes}
              </div>
            )}

            {/* Associated Orders */}
            <div>
              <h4 style={{ fontSize: '.84rem', fontWeight: 800, color: '#334155', margin: '0 0 8px 0' }}>Bağlı Şube Talepleri</h4>
              <div style={{ overflowX: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888888' }}>Sipariş No</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888888' }}>Şube</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Toplam Miktar</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedShipmentOrders.map(o => (
                      <tr key={o.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 800 }}>{o.order_no}</td>
                        <td style={{ padding: '8px 12px' }}>{o.branch_name}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{formatQty(o.total_qty)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>₺{formatMoney(o.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Consolidated Load lines */}
            <div>
              <h4 style={{ fontSize: '.84rem', fontWeight: 800, color: '#334155', margin: '0 0 8px 0' }}>Yük Listesi (Konsolide Ürünler)</h4>
              <div style={{ overflowX: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                  <thead>
                    <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e5e5' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888888' }}>SKU</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#888888' }}>Ürün Adı</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Birim Fiyat</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Sevk Edilen</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#888888' }}>Toplam Tutar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consolidatedShipmentLines.map((l, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 700 }}>{l.item_sku}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div>{l.item_name}</div>
                          {l.picks && l.picks.length > 0 && (
                            <div style={{ fontSize: '.7rem', color: '#64748b', marginTop: 4 }}>
                              <i className="fa-solid fa-boxes-stacked" style={{ marginRight: 4 }} />
                              Yükleme Kaynakları: {l.picks.map((p, pIdx) => {
                                const locObj = warehouseLocations.find(loc => loc.id === p.location_id);
                                const locCode = locObj ? `${locObj.zone_code}-${locObj.aisle}${locObj.rack}-${locObj.level}${locObj.bin}` : '';
                                const lpnObj = warehouseLpns.find(lpn => lpn.id === p.lpn_id);
                                const lpnCode = lpnObj ? lpnObj.lpn_code : '';
                                const details = [];
                                if (locCode) details.push(`Raf: ${locCode}`);
                                if (lpnCode) details.push(`LPN: ${lpnCode}`);
                                if (p.lot_number) details.push(`Lot: ${p.lot_number}`);
                                if (p.expiration_date) details.push(`SKT: ${formatDate(p.expiration_date)}`);
                                return (
                                  <span key={pIdx} style={{ marginRight: 8, display: 'inline-block', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1px 5px', borderRadius: 4 }}>
                                    {details.join(' | ') || 'Varsayılan'} ({formatQty(p.qty)} {l.unit})
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>₺{formatMoney(l.unit_price)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{formatQty(l.shipped_qty)} {l.unit}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>₺{formatMoney(l.line_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
