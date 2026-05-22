import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import {
  applyKioskBranchFilter,
  buildSalesChannelVisibilityMap,
  isOrderVisibleForScreen,
  loadKioskSettings,
} from '@/lib/kioskSettings'
import {
  formatCallCenterDateTime,
  getCallCenterAddressSummary,
  getCallCenterFulfillmentLabel,
  isMissingCallCenterScheduleColumn,
  normalizeLegacyCallCenterOrders,
} from '@/lib/callCenterOrders'

const STATUS_META = {
  pending: { label: 'Bekliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  in_progress: { label: 'Hazirlaniyor', color: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
  ready: { label: 'Hazir', color: '#22c55e', bg: 'rgba(34,197,94,.15)' },
  delivered: { label: 'Teslim Edildi', color: '#64748b', bg: 'rgba(100,116,139,.15)' },
}

const SORT_OPTIONS = [
  { value: 'time_asc', label: 'Eski once' },
  { value: 'time_desc', label: 'Yeni once' },
  { value: 'prep_desc', label: 'Hazirlama suresi' },
  { value: 'display_no', label: 'Siparis no' },
  { value: 'total_asc', label: 'Dusuk tutar' },
]
const BACKGROUND_REFRESH_MS = 1200

function fmt(value) {
  return (parseFloat(value) || 0).toFixed(2)
}

function ElapsedBadge({ dateStr, prepSec }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const diff = Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 1000))
  const over = prepSec > 0 && diff > prepSec
  const minutes = Math.floor(diff / 60)
  const seconds = diff % 60

  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 8,
      background: over ? 'rgba(239,68,68,.2)' : 'rgba(100,116,139,.2)',
      color: over ? '#ef4444' : '#94a3b8',
    }}>
      {minutes}:{String(seconds).padStart(2, '0')}
    </span>
  )
}

function normalizeOptionNames(value) {
  if (!Array.isArray(value)) return []
  return value.map(option => {
    if (typeof option === 'string') return option
    if (option && typeof option === 'object') return option.name || option.label || ''
    return ''
  }).filter(Boolean)
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('does not exist') && message.includes(String(columnName || '').toLowerCase())
}

function getNextStatusForLines(order, lines) {
  if (order?.kds_status === 'delivered') return 'delivered'
  if (!lines.length) return 'pending'
  if (lines.every(line => line.kds_completed)) return 'ready'
  if (lines.some(line => line.kds_completed)) return 'in_progress'
  return 'pending'
}

function updateOrderCollection(collection, saleId, updater) {
  return collection.map(order => (
    order.id === saleId
      ? {
          ...order,
          ...(typeof updater === 'function' ? updater(order) : updater),
        }
      : order
  ))
}

function OrderCard({ order, lines, onStatusChange, onLineComplete, combined, lineCompletionEnabled, productTotals, showProductTotals }) {
  const meta = STATUS_META[order.kds_status] || STATUS_META.pending
  const completedCount = lines.filter(line => line.kds_completed).length
  const allLinesComplete = lines.length > 0 && completedCount === lines.length
  const totalPrepSec = lines.reduce((sum, line) => sum + ((line.prep_time_minutes || 0) * 60 * (line.qty || 1)), 0)
  const isCallCenterOrder = order.source_channel_type === 'call_center'
  const callCenterAddress = isCallCenterOrder ? getCallCenterAddressSummary(order) : ''

  return (
    <div style={{
      background: '#1e293b',
      borderRadius: 16,
      padding: 16,
      border: `2px solid ${meta.color}33`,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      boxShadow: '0 10px 24px rgba(2,6,23,.18)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          background: meta.bg,
          color: meta.color,
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 13,
          fontWeight: 800,
        }}>
          #{order.kiosk_display_no ? String(order.kiosk_display_no).padStart(3, '0') : order.id?.slice(-4).toUpperCase()}
        </div>
        <div style={{ flex: 1, color: '#94a3b8', fontSize: 12 }}>
          {order.kiosk_service_type === 'table_service' && order.kiosk_table_number && (
            <span style={{ color: '#38bdf8' }}>Masa: {order.kiosk_table_number} | </span>
          )}
          {isCallCenterOrder
            ? `${getCallCenterFulfillmentLabel(order)} | Hedef: ${formatCallCenterDateTime(order.promised_at || order.sale_datetime)}`
            : order.source_channel_type === 'kiosk' ? 'Kiosk' : order.source_channel_type}
        </div>
        <ElapsedBadge dateStr={order.sale_datetime} prepSec={totalPrepSec} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 800 }}>
          Siparis Icerigi
          <span style={{ color: '#64748b', fontWeight: 600 }}> ({lines.length} kalem)</span>
        </div>
        <div style={{ color: allLinesComplete ? '#22c55e' : '#94a3b8', fontSize: 12, fontWeight: 700 }}>
          {completedCount}/{lines.length} hazir
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map(line => {
          const optionNames = normalizeOptionNames(line.options_json)
          return (
            <div
              key={line.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: 10,
                alignItems: 'start',
                padding: 10,
                borderRadius: 12,
                background: line.kds_completed ? 'rgba(15,23,42,.42)' : 'rgba(15,23,42,.88)',
                border: `1px solid ${line.kds_completed ? 'rgba(34,197,94,.24)' : 'rgba(148,163,184,.14)'}`,
              }}
            >
              <button
                type="button"
                onClick={() => onLineComplete(order.id, line.id, !line.kds_completed)}
                disabled={!lineCompletionEnabled}
                title={!lineCompletionEnabled
                  ? 'Satir bazli hazirlama icin sale_lines.kds_completed migration gerekir'
                  : line.kds_completed
                    ? 'Hazir isaretini kaldir'
                    : 'Urunu hazir isle'}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  border: 'none',
                  background: line.kds_completed ? '#22c55e' : '#334155',
                  color: '#fff',
                  fontSize: 13,
                  cursor: lineCompletionEnabled ? 'pointer' : 'not-allowed',
                  opacity: lineCompletionEnabled ? 1 : .45,
                  flexShrink: 0,
                }}
              >
                {line.kds_completed ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-fire-burner" />}
              </button>

              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: line.kds_completed ? '#94a3b8' : '#f8fafc',
                  textDecoration: line.kds_completed ? 'line-through' : 'none',
                  lineHeight: 1.35,
                }}>
                  {line.qty}x {line.product_name}
                </div>

                {line.portion_name && (
                  <div style={{ color: '#38bdf8', fontSize: 11, marginTop: 4 }}>
                    Porsiyon: {line.portion_name}
                  </div>
                )}

                {optionNames.length > 0 && (
                  <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                    Opsiyon: {optionNames.join(', ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
                {line.prep_time_minutes > 0 && (
                  <span style={{ fontSize: 11, color: '#64748b' }}>{line.prep_time_minutes}dk</span>
                )}
                {showProductTotals && !line.kds_completed && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 38, height: 24, padding: '0 10px',
                    borderRadius: 999,
                    background: 'rgba(245,158,11,.18)',
                    border: '1px solid rgba(251,191,36,.30)',
                    color: '#fbbf24',
                    fontSize: 13, fontWeight: 900,
                    whiteSpace: 'nowrap',
                  }}>
                    {productTotals?.get(line.product_name) ?? (line.qty || 1)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
        {order.order_note && (
          <div style={{
            borderRadius: 12,
            background: 'rgba(245,158,11,.10)',
            border: '1px solid rgba(245,158,11,.20)',
            padding: '10px 12px',
            color: '#fde68a',
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            Not: {order.order_note}
          </div>
        )}
        {callCenterAddress && (
          <div style={{
            borderRadius: 12,
            background: 'rgba(56,189,248,.10)',
            border: '1px solid rgba(56,189,248,.20)',
            padding: '10px 12px',
            color: '#bae6fd',
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            Teslimat: {callCenterAddress}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {order.kds_status === 'pending' && (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, 'in_progress')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: '#3b82f6',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Basla
            </button>
          )}

          {order.kds_status === 'in_progress' && (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, 'ready')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: '#22c55e',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Hazir
            </button>
          )}

          {order.kds_status === 'ready' && combined && (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, 'delivered')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: '#7c3aed',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Teslim Et
            </button>
          )}

          {allLinesComplete && order.kds_status !== 'ready' && order.kds_status !== 'delivered' && (
            <button
              type="button"
              onClick={() => onStatusChange(order.id, 'ready')}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                background: '#22c55e22',
                color: '#22c55e',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Hazira Al
            </button>
          )}

          <button
            type="button"
            onClick={() => onStatusChange(order.id, 'delivered')}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#334155',
              color: '#94a3b8',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Teslim
          </button>
        </div>

        <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
          TL {fmt(order.gross_total_after_discount)}
        </div>
      </div>
    </div>
  )
}

export default function KDS() {
  const { branchId, branchName } = useWorkspace()
  const [orders, setOrders] = useState([])
  const [lines, setLines] = useState({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [schemaWarnings, setSchemaWarnings] = useState([])
  const [sortBy, setSortBy] = useState('time_asc')
  const [combined, setCombined] = useState(false)
  const [filter, setFilter] = useState('active')
  const [supportsPickupCalled, setSupportsPickupCalled] = useState(true)
  const [supportsLineCompletion, setSupportsLineCompletion] = useState(true)
  const [showProductTotals, setShowProductTotals] = useState(() => {
    try { return localStorage.getItem('kds_product_totals') === '1' } catch { return false }
  })
  const subRef = useRef(null)
  const hasLoadedOnceRef = useRef(false)
  const loadInFlightRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const refreshTimerRef = useRef(null)
  const ordersRef = useRef([])
  const linesRef = useRef({})
  const supportsPickupCalledRef = useRef(true)
  const supportsLineCompletionRef = useRef(true)

  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  useEffect(() => {
    linesRef.current = lines
  }, [lines])

  useEffect(() => {
    supportsPickupCalledRef.current = supportsPickupCalled
  }, [supportsPickupCalled])

  useEffect(() => {
    supportsLineCompletionRef.current = supportsLineCompletion
  }, [supportsLineCompletion])

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!branchId) return
    if (loadInFlightRef.current) {
      pendingRefreshRef.current = true
      return
    }

    loadInFlightRef.current = true

    setLoadError(null)
    setSchemaWarnings([])
    const shouldShowBlockingLoader = !silent && !hasLoadedOnceRef.current
    if (shouldShowBlockingLoader) setLoading(true)
    else setRefreshing(true)

    try {
      const statuses = filter === 'active'
        ? ['pending', 'in_progress']
        : filter === 'ready'
          ? ['ready']
          : ['pending', 'in_progress', 'ready']
      const nowIso = new Date().toISOString()

      let salesQuery = db
        .from('sales')
        .select('id,status,kds_status,kiosk_display_no,kiosk_service_type,kiosk_table_number,sale_datetime,gross_total_after_discount,source_channel_type,order_note,branch_name,sales_channel_id,pickup_called,fulfillment_type,promised_at,kds_release_at,delivery_address_snapshot')
        .eq('status', 'completed')
        .in('kds_status', statuses)
        .is('deleted_at', null)
        .or(`kds_release_at.is.null,kds_release_at.lte.${nowIso}`)
        .order('sale_datetime', { ascending: true })
        .limit(100)

      salesQuery = applyKioskBranchFilter(salesQuery, branchId, branchName)
      let { data: salesData, error: salesError } = await salesQuery

      if (salesError && (isMissingColumnError(salesError, 'pickup_called') || isMissingCallCenterScheduleColumn(salesError))) {
        let legacySalesQuery = db
          .from('sales')
          .select('id,status,kds_status,kiosk_display_no,kiosk_service_type,kiosk_table_number,sale_datetime,gross_total_after_discount,source_channel_type,order_note,branch_name,sales_channel_id')
          .eq('status', 'completed')
          .in('kds_status', statuses)
          .is('deleted_at', null)
          .lte('sale_datetime', nowIso)
          .order('sale_datetime', { ascending: true })
          .limit(100)

        legacySalesQuery = applyKioskBranchFilter(legacySalesQuery, branchId, branchName)
        const legacyResult = await legacySalesQuery
        salesData = normalizeLegacyCallCenterOrders(legacyResult.data || []).map(order => ({ ...order, pickup_called: false }))
        salesError = legacyResult.error || null
        setSupportsPickupCalled(false)
        setSchemaWarnings(current => [...current, 'KDS uyum modu aktif: yeni call center planlama kolonlari veya pickup_called kolonu bulunamadi.'])
      } else {
        salesData = normalizeLegacyCallCenterOrders(salesData || [])
        setSupportsPickupCalled(true)
      }

      if (salesError) {
        setLoadError(salesError.message)
        setOrders([])
        setLines({})
        return
      }

      let { data: salesChannelsData, error: salesChannelsError } = await db
        .from('sales_channels')
        .select('id,show_in_kds')
        .is('deleted_at', null)

      if (salesChannelsError && isMissingColumnError(salesChannelsError, 'show_in_kds')) {
        const legacySalesChannelsResult = await db
          .from('sales_channels')
          .select('id')
          .is('deleted_at', null)
        salesChannelsData = legacySalesChannelsResult.data || []
      }

      const visibilityMap = buildSalesChannelVisibilityMap(salesChannelsData || [])
      const visibleSales = (salesData || []).filter(order => isOrderVisibleForScreen(order, visibilityMap, 'show_in_kds'))

      const saleIds = visibleSales.map(order => order.id)
      let lineRows = []

      if (saleIds.length > 0) {
        const saleLineSelectAttempts = [
          {
            query: 'id,sale_id,line_no,product_id,product_name,qty,kds_completed,prep_time_minutes,portion_name,options_json',
            normalize: line => line,
            supportsLineCompletion: true,
            warnings: [],
          },
          {
            query: 'id,sale_id,line_no,product_id,product_name,qty,prep_time_minutes,portion_name,options_json',
            normalize: line => ({ ...line, kds_completed: false }),
            supportsLineCompletion: false,
            warnings: ['sale_lines.kds_completed kolonu bulunamadi. Urun bazli hazir isaretleme pasif kalacak.'],
          },
          {
            query: 'id,sale_id,line_no,product_id,product_name,qty,kds_completed,portion_name,options_json',
            normalize: line => ({ ...line, prep_time_minutes: 0 }),
            supportsLineCompletion: true,
            warnings: ['sale_lines.prep_time_minutes kolonu bulunamadi. Hazirlama suresi gostergesi uyum modunda 0 dk kabul edilecek.'],
          },
          {
            query: 'id,sale_id,line_no,product_id,product_name,qty,portion_name,options_json',
            normalize: line => ({ ...line, kds_completed: false, prep_time_minutes: 0 }),
            supportsLineCompletion: false,
            warnings: [
              'sale_lines.kds_completed kolonu bulunamadi. Urun bazli hazir isaretleme pasif kalacak.',
              'sale_lines.prep_time_minutes kolonu bulunamadi. Hazirlama suresi gostergesi uyum modunda 0 dk kabul edilecek.',
            ],
          },
        ]

        let saleLinesData = null
        let saleLinesError = null
        let resolvedAttempt = null

        for (const attempt of saleLineSelectAttempts) {
          const result = await db
            .from('sale_lines')
            .select(attempt.query)
            .in('sale_id', saleIds)
            .order('line_no', { ascending: true })

          if (result.error) {
            const missingKdsCompleted = isMissingColumnError(result.error, 'kds_completed')
            const missingPrepTime = isMissingColumnError(result.error, 'prep_time_minutes')
            if (missingKdsCompleted || missingPrepTime) {
              saleLinesError = result.error
              continue
            }
          }

          saleLinesData = result.data || []
          saleLinesError = result.error || null
          resolvedAttempt = attempt
          break
        }

        if (saleLinesError && !resolvedAttempt) {
          setLoadError(saleLinesError.message)
          setOrders([])
          setLines({})
          return
        }

        setSupportsLineCompletion(resolvedAttempt?.supportsLineCompletion !== false)
        if (resolvedAttempt?.warnings?.length) {
          setSchemaWarnings(current => [...current, ...resolvedAttempt.warnings])
        }

        const normalizedLines = (saleLinesData || []).map(line => resolvedAttempt.normalize(line))
        const productIds = [...new Set(normalizedLines.map(line => line.product_id).filter(Boolean))]
        let productPrepMap = new Map()

        if (productIds.length > 0) {
          const { data: saleItemsData, error: saleItemsError } = await db
            .from('sale_items')
            .select('id,prep_time_minutes')
            .in('id', productIds)

          if (!saleItemsError) {
            productPrepMap = new Map((saleItemsData || []).map(item => [item.id, Math.max(0, parseInt(item.prep_time_minutes, 10) || 0)]))
          }
        }

        const useProductPrepFallback = resolvedAttempt?.warnings?.some(warning => warning.includes('sale_lines.prep_time_minutes'))

        lineRows = normalizedLines.map(line => ({
          ...line,
          prep_time_minutes: useProductPrepFallback
            ? (productPrepMap.get(line.product_id) ?? 0)
            : (line.prep_time_minutes ?? productPrepMap.get(line.product_id) ?? 0),
        }))
      }

      const lineMap = {}
      lineRows.forEach(line => {
        if (!lineMap[line.sale_id]) lineMap[line.sale_id] = []
        lineMap[line.sale_id].push(line)
      })

      setOrders(visibleSales)
      setLines(lineMap)
      hasLoadedOnceRef.current = true
    } finally {
      setLoading(false)
      setRefreshing(false)
      loadInFlightRef.current = false

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        window.setTimeout(() => {
          loadOrders({ silent: true })
        }, 60)
      }
    }
  }, [branchId, branchName, filter])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      loadOrders({ silent: true })
    }, 80)
  }, [loadOrders])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  useEffect(() => {
    let ignore = false

    ;(async () => {
      try {
        const settings = await loadKioskSettings()
        if (!ignore) setCombined(settings.kds_pickup_combined === true)
      } catch {
        if (!ignore) setCombined(false)
      }
    })()

    return () => {
      ignore = true
    }
  }, [])


  async function onStatusChange(saleId, newStatus) {
    const previousOrders = ordersRef.current
    const currentOrder = previousOrders.find(order => order.id === saleId)
    const payload = {
      kds_status: newStatus,
      updated_at: new Date().toISOString(),
    }
    if (supportsPickupCalledRef.current) {
      if (newStatus === 'delivered') payload.pickup_called = true
      if (newStatus === 'pending' || newStatus === 'in_progress') payload.pickup_called = false
    }

    setOrders(current => updateOrderCollection(current, saleId, currentItem => ({
      ...currentItem,
      ...payload,
      pickup_called: payload.pickup_called ?? currentItem.pickup_called ?? currentOrder?.pickup_called ?? false,
    })))

    const { error } = await db
      .from('sales')
      .update(payload)
      .eq('id', saleId)

    if (error) {
      setOrders(previousOrders)
      setLoadError(error.message)
      return
    }

    scheduleRefresh()
  }

  async function onLineComplete(saleId, lineId, completed) {
    if (!supportsLineCompletionRef.current) return

    const previousOrders = ordersRef.current
    const previousLinesMap = linesRef.current
    const currentOrder = previousOrders.find(order => order.id === saleId)
    const previousLines = previousLinesMap[saleId] || []
    const nextLines = previousLines.map(line => (
      line.id === lineId ? { ...line, kds_completed: completed } : line
    ))
    const nextStatus = getNextStatusForLines(currentOrder, nextLines)
    const nextPickupCalled = supportsPickupCalledRef.current
      ? (nextStatus === 'pending' || nextStatus === 'in_progress' ? false : currentOrder?.pickup_called === true)
      : currentOrder?.pickup_called

    setLines(current => ({
      ...current,
      [saleId]: nextLines,
    }))
    setOrders(current => updateOrderCollection(current, saleId, {
      kds_status: nextStatus,
      updated_at: new Date().toISOString(),
      ...(supportsPickupCalledRef.current ? { pickup_called: nextPickupCalled } : {}),
    }))

    const lineResult = await db
      .from('sale_lines')
      .update({ kds_completed: completed })
      .eq('id', lineId)

    if (lineResult.error) {
      setLines(previousLinesMap)
      setOrders(previousOrders)
      setLoadError(lineResult.error.message)
      return
    }

    const saleResult = await db
      .from('sales')
      .update({
        kds_status: nextStatus,
        updated_at: new Date().toISOString(),
        ...(supportsPickupCalledRef.current
          ? { pickup_called: nextPickupCalled }
          : {}),
      })
      .eq('id', saleId)

    if (saleResult.error) {
      setLines(previousLinesMap)
      setOrders(previousOrders)
      setLoadError(saleResult.error.message)
      return
    }

    scheduleRefresh()
  }

  const prepTotal = order => (lines[order.id] || []).reduce((sum, line) => (
    sum + ((line.prep_time_minutes || 0) * (line.qty || 1))
  ), 0)

  const productTotals = useMemo(() => {
    const map = new Map()
    orders.forEach(order => {
      ;(lines[order.id] || []).forEach(line => {
        if (line.kds_completed) return
        const name = line.product_name || ''
        map.set(name, (map.get(name) || 0) + (line.qty || 1))
      })
    })
    return map
  }, [orders, lines])

  const sorted = [...orders].sort((left, right) => {
    if (sortBy === 'time_desc') return new Date(right.sale_datetime) - new Date(left.sale_datetime)
    if (sortBy === 'prep_desc') return prepTotal(right) - prepTotal(left)
    if (sortBy === 'display_no') return (left.kiosk_display_no || 0) - (right.kiosk_display_no || 0)
    if (sortBy === 'total_asc') return (left.gross_total_after_discount || 0) - (right.gross_total_after_discount || 0)
    return new Date(left.sale_datetime) - new Date(right.sale_datetime)
  })

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <i className="fa-solid fa-kitchen-set" style={{ color: '#f59e0b', fontSize: 20 }} />
        <span style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 18, flex: 1 }}>KDS - Mutfak Ekrani</span>

        <div style={{ display: 'flex', gap: 4 }}>
          {[['active', 'Aktif'], ['ready', 'Hazir'], ['all', 'Tumu']].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: filter === value ? '#7c3aed' : '#334155',
                color: filter === value ? '#fff' : '#94a3b8',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setShowProductTotals(v => {
            const next = !v
            try { localStorage.setItem('kds_product_totals', next ? '1' : '0') } catch {}
            return next
          })}
          style={{
            minHeight: 44,
            padding: '0 16px',
            borderRadius: 10,
            border: `1px solid ${showProductTotals ? 'rgba(251,191,36,.40)' : 'rgba(51,65,85,.6)'}`,
            background: showProductTotals ? 'rgba(245,158,11,.18)' : '#334155',
            color: showProductTotals ? '#fbbf24' : '#64748b',
            fontSize: 13,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 999, flexShrink: 0,
            background: showProductTotals ? '#fbbf24' : '#475569',
            display: 'inline-block',
            transition: 'background .15s',
          }} />
          Ürün Toplamları
        </button>

        <select
          value={sortBy}
          onChange={event => setSortBy(event.target.value)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#334155',
            color: '#f1f5f9',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {SORT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div style={{ color: combined ? '#86efac' : '#94a3b8', fontSize: 13, fontWeight: 700 }}>
          {combined ? 'Birlesik mod aktif' : 'Ayrik teslim modu'}
        </div>

        <button
          type="button"
          onClick={() => loadOrders({ silent: true })}
          style={{
            padding: '6px 12px',
            borderRadius: 8,
            border: 'none',
            background: '#334155',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          <i className="fa-solid fa-rotate" />
        </button>

        <div
          title={refreshing ? 'Guncelleniyor' : 'Guncel'}
          aria-label={refreshing ? 'Guncelleniyor' : 'Guncel'}
          style={{
            width: 24,
            display: 'flex',
            justifyContent: 'center',
            color: refreshing ? '#94a3b8' : 'transparent',
            fontSize: 14,
          }}
        >
          <i className={`fa-solid fa-rotate${refreshing ? ' fa-spin' : ''}`} />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#64748b', padding: 60 }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: 32, marginBottom: 12 }} />
            <br />
            Yukleniyor...
          </div>
        )}

        {!loading && loadError && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 36, color: '#ef4444', marginBottom: 12 }} />
            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Veri yuklenemedi</div>
            <div style={{ color: '#64748b', fontSize: 13, maxWidth: 480, margin: '0 auto' }}>{loadError}</div>
            <div style={{ color: '#f59e0b', fontSize: 13, marginTop: 16 }}>
              db Studio icinde kiosk migration, sale_items ve sale_lines alanlarini kontrol edin.
            </div>
          </div>
        )}

        {!loading && !loadError && sorted.length === 0 && (
          <div style={{ textAlign: 'center', color: '#475569', padding: 80 }}>
            <i className="fa-solid fa-check-circle" style={{ fontSize: 48, marginBottom: 16, color: '#22c55e' }} />
            <br />
            <span style={{ fontSize: 18, fontWeight: 600 }}>Bekleyen siparis yok</span>
          </div>
        )}

        {!loading && !loadError && sorted.length > 0 && (
          <>
            {schemaWarnings.length > 0 && (
              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {schemaWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`} style={{ borderRadius: 12, border: '1px solid rgba(245,158,11,.2)', background: 'rgba(245,158,11,.08)', color: '#fde68a', padding: '10px 12px', fontSize: 12, lineHeight: 1.45 }}>
                    {warning}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
              {sorted.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  lines={lines[order.id] || []}
                  onStatusChange={onStatusChange}
                  onLineComplete={onLineComplete}
                  combined={combined}
                  lineCompletionEnabled={supportsLineCompletion}
                  productTotals={productTotals}
                  showProductTotals={showProductTotals}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '8px 20px', background: '#0f172a', borderTop: '1px solid #1e293b', display: 'flex', gap: 16, fontSize: 12, color: '#475569' }}>
        <span>{orders.length} siparis</span>
        <span>|</span>
        <span style={{ color: '#f59e0b' }}>{orders.filter(order => order.kds_status === 'pending').length} bekliyor</span>
        <span>|</span>
        <span style={{ color: '#3b82f6' }}>{orders.filter(order => order.kds_status === 'in_progress').length} hazirlaniyor</span>
        <span>|</span>
        <span style={{ color: '#22c55e' }}>{orders.filter(order => order.kds_status === 'ready').length} hazir</span>
      </div>
    </div>
  )
}
