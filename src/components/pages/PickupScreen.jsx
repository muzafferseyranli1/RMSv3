import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import {
  applyKioskBranchFilter,
  buildSalesChannelVisibilityMap,
  isOrderVisibleForScreen,
  loadKioskSettings,
} from '@/lib/kioskSettings'

const BACKGROUND_REFRESH_MS = 1200

function fmt(value) {
  return (parseFloat(value) || 0).toFixed(2)
}

function formatOrderTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
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

function WaitBadge({ dateStr }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const diff = Math.max(0, Math.floor((now - new Date(dateStr).getTime()) / 1000))
  const minutes = Math.floor(diff / 60)
  const seconds = diff % 60

  return (
    <span style={{
      padding: '4px 10px',
      borderRadius: 999,
      background: 'rgba(148,163,184,.12)',
      color: '#cbd5e1',
      fontSize: 12,
      fontWeight: 700,
    }}>
      {minutes}dk {String(seconds).padStart(2, '0')}sn bekliyor
    </span>
  )
}

function SoundPlayer({ play }) {
  const ctxRef = useRef(null)

  useEffect(() => {
    if (!play) return
    try {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = ctxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      osc.start()
      osc.stop(ctx.currentTime + 0.5)
    } catch {}
  }, [play])

  return null
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

function PickupOrderCard({ order, lines, mode, combinedMode, supportsPickupCalled, onCallCustomer, onDeliver }) {
  const called = supportsPickupCalled ? order.pickup_called === true : mode === 'ready'
  const completedCount = lines.filter(line => line.kds_completed).length
  const serviceText = order.kiosk_service_type === 'table_service' && order.kiosk_table_number
    ? `Masa ${order.kiosk_table_number}`
    : order.source_channel_type === 'kiosk'
      ? 'Gel-Al'
      : order.source_channel_type

  return (
    <div style={{
      background: mode === 'ready' ? 'rgba(34,197,94,.08)' : '#1e293b',
      borderRadius: 16,
      padding: 16,
      border: mode === 'ready'
        ? '2px solid rgba(34,197,94,.35)'
        : '1px solid rgba(245,158,11,.24)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: mode === 'ready' ? '#22c55e' : '#f59e0b', minWidth: 72 }}>
          #{order.kiosk_display_no ? String(order.kiosk_display_no).padStart(3, '0') : order.id?.slice(-4).toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 800 }}>{serviceText}</div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
            Siparis saati: {formatOrderTime(order.sale_datetime)}
          </div>
        </div>
        <WaitBadge dateStr={order.sale_datetime} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(59,130,246,.14)', color: '#bfdbfe', fontSize: 12, fontWeight: 700 }}>
          {lines.length} kalem
        </span>
        {mode === 'preparing' && lines.length > 0 && completedCount > 0 && (
          <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(34,197,94,.16)', color: '#86efac', fontSize: 12, fontWeight: 700 }}>
            {completedCount}/{lines.length} hazir
          </span>
        )}
        {called && (
          <span style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(34,197,94,.16)', color: '#86efac', fontSize: 12, fontWeight: 700 }}>
            Musteri cagrildi
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {lines.map(line => {
          const optionNames = normalizeOptionNames(line.options_json)
          return (
            <div
              key={line.id}
              style={{
                borderRadius: 12,
                background: line.kds_completed ? 'rgba(15,23,42,.42)' : 'rgba(15,23,42,.65)',
                border: `1px solid ${line.kds_completed ? 'rgba(34,197,94,.24)' : 'transparent'}`,
                padding: '10px 12px',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: 10,
                alignItems: 'start',
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 8,
                  background: line.kds_completed ? '#22c55e' : '#334155',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 12,
                  marginTop: 1,
                }}
              >
                {line.kds_completed ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-fire-burner" />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: line.kds_completed ? '#94a3b8' : '#f8fafc', fontWeight: 700, fontSize: 14, textDecoration: line.kds_completed ? 'line-through' : 'none' }}>{line.qty}x {line.product_name}</div>
              {line.portion_name && <div style={{ color: '#38bdf8', fontSize: 11, marginTop: 4 }}>Porsiyon: {line.portion_name}</div>}
              {optionNames.length > 0 && <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 4 }}>Opsiyon: {optionNames.join(', ')}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {order.order_note && (
        <div style={{ borderRadius: 12, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.18)', padding: '10px 12px', color: '#fde68a', fontSize: 12 }}>
          Not: {order.order_note}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#94a3b8', fontSize: 12, flex: 1 }}>TL {fmt(order.gross_total_after_discount)}</div>
        {mode === 'ready' && !combinedMode && !called && (
          <button
            type="button"
            onClick={() => onCallCustomer(order.id)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#16a34a',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Hazir / Musteriyi Cagir
          </button>
        )}
        {mode === 'ready' && !combinedMode && called && (
          <button
            type="button"
            onClick={() => onDeliver(order.id)}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#7c3aed',
              color: '#fff',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Teslim Edildi
          </button>
        )}
        {mode === 'ready' && combinedMode && (
          <button
            type="button"
            disabled
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: '#334155',
              color: '#cbd5e1',
              fontSize: 13,
              fontWeight: 800,
              cursor: 'not-allowed',
            }}
          >
            KDS
          </button>
        )}
      </div>
    </div>
  )
}

export default function PickupScreen() {
  const { branchId, branchName } = useWorkspace()
  const [preparing, setPreparing] = useState([])
  const [ready, setReady] = useState([])
  const [lines, setLines] = useState({})
  const [loading, setLoading] = useState(true)
  const [soundTrigger, setSoundTrigger] = useState(0)
  const [combinedMode, setCombinedMode] = useState(false)
  const [supportsPickupCalled, setSupportsPickupCalled] = useState(true)
  const [supportsLineCompletion, setSupportsLineCompletion] = useState(true)
  const prevReadyIdsRef = useRef(new Set())
  const subRef = useRef(null)
  const loadInFlightRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const refreshTimerRef = useRef(null)
  const preparingRef = useRef([])
  const readyRef = useRef([])
  const supportsPickupCalledRef = useRef(true)

  useEffect(() => {
    preparingRef.current = preparing
  }, [preparing])

  useEffect(() => {
    readyRef.current = ready
  }, [ready])

  useEffect(() => {
    supportsPickupCalledRef.current = supportsPickupCalled
  }, [supportsPickupCalled])

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!branchId) return
    if (loadInFlightRef.current) {
      pendingRefreshRef.current = true
      return
    }

    loadInFlightRef.current = true
    if (!silent) setLoading(true)

    try {
      let query = db
        .from('sales')
        .select('id,kds_status,pickup_called,kiosk_display_no,kiosk_service_type,kiosk_table_number,sale_datetime,gross_total_after_discount,source_channel_type,branch_name,sales_channel_id,order_note')
        .in('kds_status', ['pending', 'in_progress', 'ready'])
        .is('deleted_at', null)
        .lte('sale_datetime', new Date().toISOString())
        .order('sale_datetime', { ascending: true })
        .limit(50)

      query = applyKioskBranchFilter(query, branchId, branchName)
      let { data, error } = await query
      let pickupCalledSupported = true

      if (error && isMissingColumnError(error, 'pickup_called')) {
        let legacyQuery = db
          .from('sales')
          .select('id,kds_status,kiosk_display_no,kiosk_service_type,kiosk_table_number,sale_datetime,gross_total_after_discount,source_channel_type,branch_name,sales_channel_id,order_note')
          .in('kds_status', ['pending', 'in_progress', 'ready'])
          .is('deleted_at', null)
          .lte('sale_datetime', new Date().toISOString())
          .order('sale_datetime', { ascending: true })
          .limit(50)
        legacyQuery = applyKioskBranchFilter(legacyQuery, branchId, branchName)
        const legacyResult = await legacyQuery
        data = (legacyResult.data || []).map(order => ({ ...order, pickup_called: false }))
        error = legacyResult.error || null
        pickupCalledSupported = false
      }

      setSupportsPickupCalled(pickupCalledSupported)

      if (error) {
        setPreparing([])
        setReady([])
        setLines({})
        return
      }

      let { data: salesChannelsData, error: salesChannelsError } = await db
        .from('sales_channels')
        .select('id,show_in_queue')
        .is('deleted_at', null)

      if (salesChannelsError && isMissingColumnError(salesChannelsError, 'show_in_queue')) {
        const legacySalesChannelsResult = await db
          .from('sales_channels')
          .select('id')
          .is('deleted_at', null)
        salesChannelsData = legacySalesChannelsResult.data || []
      }

      const visibilityMap = buildSalesChannelVisibilityMap(salesChannelsData || [])
      const visibleOrders = (data || []).filter(order => isOrderVisibleForScreen(order, visibilityMap, 'show_in_queue'))
      const saleIds = visibleOrders.map(order => order.id)

      let lineRows = []
      if (saleIds.length > 0) {
        let saleLinesData = null
        let saleLinesError = null

        const primaryResult = await db
          .from('sale_lines')
          .select('id,sale_id,line_no,product_name,qty,portion_name,options_json,kds_completed')
          .in('sale_id', saleIds)
          .order('line_no', { ascending: true })

        if (primaryResult.error && isMissingColumnError(primaryResult.error, 'kds_completed')) {
          const legacyResult = await db
            .from('sale_lines')
            .select('id,sale_id,line_no,product_name,qty,portion_name,options_json')
            .in('sale_id', saleIds)
            .order('line_no', { ascending: true })
          saleLinesData = (legacyResult.data || []).map(line => ({ ...line, kds_completed: false }))
          saleLinesError = legacyResult.error || null
          setSupportsLineCompletion(false)
        } else {
          saleLinesData = primaryResult.data || []
          saleLinesError = primaryResult.error || null
          setSupportsLineCompletion(true)
        }

        if (!saleLinesError) lineRows = saleLinesData || []
      }

      const lineMap = {}
      lineRows.forEach(line => {
        if (!lineMap[line.sale_id]) lineMap[line.sale_id] = []
        lineMap[line.sale_id].push(line)
      })

      const nextPreparing = visibleOrders.filter(order => order.kds_status === 'pending' || order.kds_status === 'in_progress')
      const nextReady = visibleOrders.filter(order => order.kds_status === 'ready')

      const calledReadyIds = new Set(nextReady.filter(order => !pickupCalledSupported || order.pickup_called === true).map(order => order.id))
      const hasNewCalled = nextReady.some(order => (!pickupCalledSupported || order.pickup_called === true) && !prevReadyIdsRef.current.has(order.id))
      if (hasNewCalled && prevReadyIdsRef.current.size > 0) setSoundTrigger(count => count + 1)
      prevReadyIdsRef.current = calledReadyIds

      setPreparing(nextPreparing)
      setReady(nextReady)
      setLines(lineMap)
    } finally {
      setLoading(false)
      loadInFlightRef.current = false

      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false
        window.setTimeout(() => {
          loadOrders({ silent: true })
        }, 60)
      }
    }
  }, [branchId, branchName])

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
        if (!ignore) setCombinedMode(settings.kds_pickup_combined === true)
      } catch {}
    })()
    return () => { ignore = true }
  }, [])


  async function callCustomer(saleId) {
    if (!supportsPickupCalledRef.current) {
      scheduleRefresh()
      return
    }

    const previousReady = readyRef.current
    setReady(current => updateOrderCollection(current, saleId, {
      pickup_called: true,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await db
      .from('sales')
      .update({ pickup_called: true, updated_at: new Date().toISOString() })
      .eq('id', saleId)

    if (error) {
      setReady(previousReady)
      return
    }

    scheduleRefresh()
  }

  async function deliver(saleId) {
    const previousPreparing = preparingRef.current
    const previousReady = readyRef.current

    setPreparing(current => current.filter(order => order.id !== saleId))
    setReady(current => current.filter(order => order.id !== saleId))

    const { error } = await db
      .from('sales')
      .update({
        kds_status: 'delivered',
        updated_at: new Date().toISOString(),
        ...(supportsPickupCalledRef.current ? { pickup_called: true } : {}),
      })
      .eq('id', saleId)

    if (error) {
      setPreparing(previousPreparing)
      setReady(previousReady)
      return
    }

    scheduleRefresh()
  }

  if (loading) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yukleniyor...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'inherit' }}>
      <SoundPlayer play={soundTrigger} />

      <div style={{ padding: '14px 24px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <i className="fa-solid fa-hand-holding-box" style={{ color: '#7c3aed', fontSize: 22 }} />
        <span style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 20, flex: 1 }}>Teslim Ekrani</span>
        <button onClick={() => loadOrders({ silent: true })} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#334155', color: '#94a3b8', cursor: 'pointer' }}>
          <i className="fa-solid fa-rotate" />
        </button>
      </div>

      {combinedMode && (
        <div style={{ margin: '12px 24px 0', borderRadius: 16, padding: '12px 16px', background: 'rgba(59,130,246,.12)', border: '1px solid rgba(59,130,246,.22)', color: '#bfdbfe', fontSize: 14, fontWeight: 700 }}>
          Birlesik mod aktif. Teslim islemleri esas olarak KDS tarafindan yonetiliyor; bu ekran bilgilendirme amacli acik tutuluyor.
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '2px solid #1e293b', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', background: 'rgba(245,158,11,.1)', borderBottom: '1px solid rgba(245,158,11,.2)', flexShrink: 0 }}>
            <span style={{ color: '#f59e0b', fontWeight: 800, fontSize: 16 }}>
              <i className="fa-solid fa-clock" style={{ marginRight: 8 }} />
              Hazirlaniyor ({preparing.length})
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {preparing.map(order => (
              <PickupOrderCard
                key={order.id}
                order={order}
                lines={lines[order.id] || []}
                mode="preparing"
                combinedMode={combinedMode}
                supportsPickupCalled={supportsPickupCalled}
                onCallCustomer={callCustomer}
                onDeliver={deliver}
              />
            ))}
            {preparing.length === 0 && (
              <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: 14 }}>Hazirlanan siparis yok</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', background: 'rgba(34,197,94,.1)', borderBottom: '1px solid rgba(34,197,94,.2)', flexShrink: 0 }}>
            <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 16 }}>
              <i className="fa-solid fa-check-circle" style={{ marginRight: 8 }} />
              Hazir ({ready.length})
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ready.map(order => (
              <PickupOrderCard
                key={order.id}
                order={order}
                lines={lines[order.id] || []}
                mode="ready"
                combinedMode={combinedMode}
                supportsPickupCalled={supportsPickupCalled}
                onCallCustomer={callCustomer}
                onDeliver={deliver}
              />
            ))}
            {ready.length === 0 && (
              <div style={{ textAlign: 'center', color: '#475569', padding: 40, fontSize: 14 }}>Hazir siparis yok</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
