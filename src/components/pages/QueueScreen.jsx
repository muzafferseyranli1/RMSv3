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

function maskName(name) {
  if (!name || name.length < 3) return name || ''
  const parts = name.trim().split(' ')
  return parts.map(part => {
    if (part.length <= 2) return `${part[0]}*`
    return part[0] + part[1] + '*'.repeat(Math.max(1, part.length - 2))
  }).join(' ')
}

function playReadySound(ctx) {
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    const now = ctx.currentTime
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1320, now + 0.15)
    osc.frequency.setValueAtTime(880, now + 0.30)
    gain.gain.setValueAtTime(0.3, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
    osc.start(now)
    osc.stop(now + 0.5)
  } catch {}
}

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('does not exist') && message.includes(String(columnName || '').toLowerCase())
}

export default function QueueScreen() {
  const { branchId, branchName } = useWorkspace()
  const [preparing, setPreparing] = useState([])
  const [ready, setReady] = useState([])
  const [settings, setSettings] = useState({ queue_bg_color: '#0f172a', queue_logo_url: '', queue_sound_enabled: true })
  const [loading, setLoading] = useState(true)
  const [supportsPickupCalled, setSupportsPickupCalled] = useState(true)
  const prevReadyIdsRef = useRef(new Set())
  const audioCtxRef = useRef(null)
  const subRef = useRef(null)
  const loadInFlightRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const refreshTimerRef = useRef(null)

  useEffect(() => {
    loadKioskSettings().then(next => setSettings(next)).catch(() => {})
  }, [])

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
        .select('id,kds_status,pickup_called,kiosk_display_no,customer_name,sale_datetime,kiosk_service_type,kiosk_table_number,branch_name,sales_channel_id')
        .in('kds_status', ['pending', 'in_progress', 'ready'])
        .is('deleted_at', null)
        .lte('sale_datetime', new Date().toISOString())
        .order('sale_datetime', { ascending: true })
        .limit(30)

      query = applyKioskBranchFilter(query, branchId, branchName)
      let { data, error } = await query
      let pickupCalledSupported = true

      if (error && isMissingColumnError(error, 'pickup_called')) {
        let legacyQuery = db
          .from('sales')
          .select('id,kds_status,kiosk_display_no,customer_name,sale_datetime,kiosk_service_type,kiosk_table_number,branch_name,sales_channel_id')
          .in('kds_status', ['pending', 'in_progress', 'ready'])
          .is('deleted_at', null)
          .lte('sale_datetime', new Date().toISOString())
          .order('sale_datetime', { ascending: true })
          .limit(30)
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
      const nextReady = visibleOrders.filter(order => order.kds_status === 'ready' && (!pickupCalledSupported || order.pickup_called === true))
      const nextPreparing = visibleOrders.filter(order => !nextReady.some(readyOrder => readyOrder.id === order.id))

      const nextReadyIds = new Set(nextReady.map(order => order.id))
      const hasNewReady = nextReady.some(order => !prevReadyIdsRef.current.has(order.id))
      if (hasNewReady && prevReadyIdsRef.current.size > 0 && settings.queue_sound_enabled) {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
        playReadySound(audioCtxRef.current)
      }
      prevReadyIdsRef.current = nextReadyIds

      setPreparing(nextPreparing)
      setReady(nextReady)
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
  }, [branchId, branchName, settings.queue_sound_enabled])

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
    if (!branchId) return undefined

    subRef.current = db
      .channel(`queue-${branchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, scheduleRefresh)
      .subscribe()

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      if (subRef.current) db.removeChannel(subRef.current)
    }
  }, [branchId, scheduleRefresh])

  useEffect(() => {
    if (!branchId) return undefined

    const timer = window.setInterval(() => {
      loadOrders({ silent: true })
    }, BACKGROUND_REFRESH_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [branchId, loadOrders])

  function displayNo(order) {
    return order.kiosk_display_no ? String(order.kiosk_display_no).padStart(3, '0') : order.id?.slice(-4).toUpperCase()
  }

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 20 }}>
        Yukleniyor...
      </div>
    )
  }

  const bgColor = settings.queue_bg_color || '#0f172a'
  const mediaImage = settings.queue_media_type === 'image' ? settings.queue_media_url : ''
  const mediaVideo = settings.queue_media_type === 'video' ? settings.queue_media_url : ''
  const portrait = settings.queue_orientation === 'portrait'

  return (
    <div style={{ width: '100vw', height: '100vh', background: bgColor, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'inherit', position: 'relative' }}>
      {mediaVideo && (
        <video src={mediaVideo} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.22 }} />
      )}
      {mediaImage && (
        <img src={mediaImage} alt="Queue zemin" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', opacity: 0.18 }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,.45)' }} />

      <div style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 20, background: 'rgba(0,0,0,.2)', flexShrink: 0, position: 'relative' }}>
        {settings.queue_logo_url && (
          <img src={settings.queue_logo_url} alt="logo" style={{ height: 48, objectFit: 'contain' }} />
        )}
        <span style={{ color: '#f1f5f9', fontSize: 26, fontWeight: 900, flex: 1 }}>
          Siparis Takip Ekrani
        </span>
        <span style={{ color: '#94a3b8', fontSize: 14 }}>
          {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', flexDirection: portrait ? 'column' : 'row', position: 'relative' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '2px solid rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 28px', background: 'rgba(245,158,11,.15)', flexShrink: 0, textAlign: 'center' }}>
            <span style={{ color: '#f59e0b', fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>HAZIRLANIYOR</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {preparing.map(order => (
              <div key={order.id} style={{ background: 'rgba(255,255,255,.05)', borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: '#f59e0b', minWidth: 80, textAlign: 'center' }}>
                  #{displayNo(order)}
                </div>
                <div style={{ flex: 1 }}>
                  {order.customer_name && (
                    <div style={{ color: '#94a3b8', fontSize: 14 }}>{maskName(order.customer_name)}</div>
                  )}
                  {order.kiosk_service_type === 'table_service' && order.kiosk_table_number && (
                    <div style={{ color: '#38bdf8', fontSize: 13, marginTop: 4 }}>Masa: {order.kiosk_table_number}</div>
                  )}
                </div>
              </div>
            ))}
            {preparing.length === 0 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.2)', padding: 60, fontSize: 18 }}>
                Hazirlanan siparis yok
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px 28px', background: 'rgba(34,197,94,.2)', flexShrink: 0, textAlign: 'center' }}>
            <span style={{ color: '#22c55e', fontSize: 20, fontWeight: 900, letterSpacing: 2 }}>HAZIR - ALINABİLİR</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ready.map(order => (
              <div key={order.id} style={{
                background: 'rgba(34,197,94,.15)',
                borderRadius: 14,
                padding: '18px 20px',
                border: '2px solid rgba(34,197,94,.5)',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                animation: 'readyPulse 1.5s ease-in-out infinite',
              }}>
                <div style={{ fontSize: 42, fontWeight: 900, color: '#22c55e', minWidth: 88, textAlign: 'center' }}>
                  #{displayNo(order)}
                </div>
                <div>
                  {order.kiosk_service_type === 'table_service' && order.kiosk_table_number && (
                    <div style={{ color: '#86efac', fontSize: 14, fontWeight: 700 }}>Masa: {order.kiosk_table_number}</div>
                  )}
                  {order.customer_name && (
                    <div style={{ color: '#94a3b8', fontSize: 13 }}>{maskName(order.customer_name)}</div>
                  )}
                </div>
              </div>
            ))}
            {ready.length === 0 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.2)', padding: 60, fontSize: 18 }}>
                Bekleyen siparis yok
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes readyPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(34,197,94,.3); }
          50% { box-shadow: 0 0 0 12px rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  )
}
