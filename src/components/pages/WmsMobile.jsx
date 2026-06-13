import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { WORKSPACE_SECTION } from '@/context/WorkspaceContext'

// Predefined simulation barcode data
const PREDEFINED_BARCODES = [
  { value: 'HE-01', label: 'Hamburger Ekmeği (Ürün)' },
  { value: 'KB-02', label: 'Karton Bardak (Ürün)' },
  { value: 'DE-03', label: 'Dana Eti (Ürün)' },
  { value: 'LP-000001', label: 'LPN-000001 (Palet)' },
  { value: 'LP-000002', label: 'LPN-000002 (Palet)' },
  { value: 'LP-000003', label: 'LPN-000003 (Palet)' },
  { value: 'LOC-A-01-01-01', label: 'Lokasyon A-01-01-01 (Kabul)' },
  { value: 'LOC-A-01-02-01', label: 'Lokasyon A-01-02-01 (Raf)' },
  { value: 'LOC-B-02-01-01', label: 'Lokasyon B-02-01-01 (Soğuk Hava)' },
]

export default function WmsMobile() {
  const toast = useToast()
  const { branchId: workspaceBranchId, branchName: workspaceBranchName, logoutSection } = useWorkspace()

  // Video Ref for WebRTC
  const videoRef = useRef(null)
  const barcodeInputRef = useRef(null)

  // Local state
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('tasks') // 'tasks', 'action', 'lookup'
  const [filterType, setFilterType] = useState('all') // 'all', 'putaway', 'pick', 'pack/load', 'count'
  const [selectedTask, setSelectedTask] = useState(null)

  // References
  const [stockItems, setStockItems] = useState(new Map())
  const [locations, setLocations] = useState(new Map())
  const [lpns, setLpns] = useState(new Map())
  const [personnel, setPersonnel] = useState(new Map())

  // Camera & Scanner state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [scanValue, setScanValue] = useState('')
  const [simSelected, setSimSelected] = useState('HE-01')
  const [flashActive, setFlashActive] = useState(false)

  // Active Task variables
  const [pickedQty, setPickedQty] = useState(1)
  const [targetLocationId, setTargetLocationId] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  
  // Lookup state
  const [lookupResult, setLookupResult] = useState(null)
  const [lookupType, setLookupType] = useState('') // 'product', 'lpn', 'location', 'unknown'

  // Fetch active user
  const activeUser = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')
    } catch {
      return null
    }
  }, [])

  const staffName = activeUser ? `${activeUser.firstName || ''} ${activeUser.lastName || ''}`.trim() || activeUser.username : 'Personel'

  // Load WMS tasks and resolve references
  const load = useCallback(async () => {
    if (!workspaceBranchId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data: tasksData, error: tasksError } = await db
        .from('warehouse_tasks')
        .select('*')
        .eq('branch_id', workspaceBranchId)
        .is('deleted_at', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (tasksError) throw tasksError

      const resolvedTasks = tasksData || []
      setTasks(resolvedTasks)

      // Collect reference IDs to query in batch
      const stockItemIds = new Set()
      const locationIds = new Set()
      const lpnIds = new Set()
      const personnelIds = new Set()

      resolvedTasks.forEach(t => {
        if (t.assigned_personnel_id) personnelIds.add(t.assigned_personnel_id)
        if (t.meta) {
          if (t.meta.stock_item_id) stockItemIds.add(t.meta.stock_item_id)
          if (t.meta.from_location_id) locationIds.add(t.meta.from_location_id)
          if (t.meta.target_location_id) locationIds.add(t.meta.target_location_id)
          if (t.meta.location_id) locationIds.add(t.meta.location_id)
          if (t.meta.lpn_id) lpnIds.add(t.meta.lpn_id)
        }
      })

      // Query references in parallel
      const promises = []

      if (stockItemIds.size > 0) {
        promises.push(
          db.from('stock_items')
            .select('id, name, sku, unit, image_url')
            .in('id', Array.from(stockItemIds))
            .then(({ data }) => {
              const map = new Map()
              data?.forEach(x => map.set(String(x.id), x))
              setStockItems(map)
            })
        )
      }

      if (locationIds.size > 0) {
        promises.push(
          db.from('warehouse_locations')
            .select('id, zone_code, aisle, rack, level, bin')
            .in('id', Array.from(locationIds))
            .then(({ data }) => {
              const map = new Map()
              data?.forEach(x => map.set(String(x.id), x))
              setLocations(map)
            })
        )
      }

      if (lpnIds.size > 0) {
        promises.push(
          db.from('warehouse_lpns')
            .select('id, lpn_code')
            .in('id', Array.from(lpnIds))
            .then(({ data }) => {
              const map = new Map()
              data?.forEach(x => map.set(String(x.id), x))
              setLpns(map)
            })
        )
      }

      if (personnelIds.size > 0) {
        promises.push(
          db.from('personnel')
            .select('id, firstName, lastName, username')
            .in('id', Array.from(personnelIds))
            .then(({ data }) => {
              const map = new Map()
              data?.forEach(x => map.set(String(x.id), x))
              setPersonnel(map)
            })
        )
      }

      await Promise.all(promises)
    } catch (err) {
      toast('Görevler yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [workspaceBranchId, toast])

  useEffect(() => {
    load()
  }, [load])

  // Camera Management
  const startCamera = async () => {
    try {
      setCameraError('')
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraActive(true)
        }
      } else {
        setCameraError('WebRTC desteklenmiyor.')
      }
    } catch (err) {
      console.warn('Camera initiation failed:', err)
      setCameraError('Kamera izni engellendi veya kamera bulunamadı.')
    }
  }

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject
      stream.getTracks().forEach(track => track.stop())
      videoRef.current.srcObject = null
      setCameraActive(false)
    }
  }

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [])

  // Auto-focus barcode input
  const focusBarcodeInput = () => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus()
    }
  }

  useEffect(() => {
    focusBarcodeInput()
    const interval = setInterval(focusBarcodeInput, 3000)
    return () => clearInterval(interval)
  }, [])

  // Format location address
  const formatAddress = (locId) => {
    const loc = locations.get(String(locId))
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

  // Handle scanned value
  const handleBarcodeScanned = async (barcode) => {
    if (!barcode.trim()) return

    // Trigger visual flash
    setFlashActive(true)
    setTimeout(() => setFlashActive(false), 200)

    toast(`Barkod Okundu: ${barcode}`, 'success')

    // 1. If an active task is selected, try to match it
    if (selectedTask) {
      const taskMeta = selectedTask.meta || {}
      const item = stockItems.get(String(taskMeta.stock_item_id))
      const lpn = lpns.get(String(taskMeta.lpn_id))
      
      // Match checks
      if (selectedTask.task_type === 'putaway') {
        // Scanning location or LPN
        if (barcode === lpn?.lpn_code) {
          toast('LPN/Palet doğrulandı.', 'success')
          setActiveTab('action')
        } else if (barcode.startsWith('LOC-')) {
          // It's a location code
          toast(`Hedef lokasyon barkodu girildi: ${barcode}`, 'success')
          // Auto fill or resolve location ID from local database match
          const matchedLoc = Array.from(locations.values()).find(
            loc => `LOC-${loc.zone_code}-${loc.aisle || 0}-${loc.rack || 0}-${loc.level || 0}`.toLowerCase().includes(barcode.toLowerCase()) || 
            `LOC-${loc.zone_code}`.toLowerCase() === barcode.toLowerCase()
          )
          if (matchedLoc) {
            setTargetLocationId(matchedLoc.id)
          }
          setActiveTab('action')
        }
      } else if (selectedTask.task_type === 'pick') {
        if (barcode === item?.sku || barcode === item?.name) {
          toast('Ürün SKU doğrulandı.', 'success')
          setActiveTab('action')
        } else if (barcode.startsWith('LOC-')) {
          toast(`Lokasyon doğrulandı: ${barcode}`, 'success')
          setActiveTab('action')
        }
      }
    } else {
      // 2. Perform general inventory lookup
      setLoading(true)
      try {
        // Find by SKU or Name in stockItems
        const matchedItem = Array.from(stockItems.values()).find(
          x => x.sku === barcode || x.name?.toLowerCase().includes(barcode.toLowerCase())
        )
        // Find by LPN code
        const matchedLpn = Array.from(lpns.values()).find(
          x => x.lpn_code === barcode
        )
        // Find by Location string
        const matchedLoc = Array.from(locations.values()).find(
          loc => `LOC-${loc.zone_code}-${loc.aisle || 0}-${loc.rack || 0}-${loc.level || 0}`.toLowerCase().includes(barcode.toLowerCase()) || 
          `LOC-${loc.zone_code}`.toLowerCase() === barcode.toLowerCase()
        )

        if (matchedItem) {
          setLookupType('product')
          setLookupResult(matchedItem)
          setActiveTab('lookup')
        } else if (matchedLpn) {
          setLookupType('lpn')
          setLookupResult(matchedLpn)
          setActiveTab('lookup')
        } else if (matchedLoc) {
          setLookupType('location')
          setLookupResult(matchedLoc)
          setActiveTab('lookup')
        } else {
          setLookupType('unknown')
          setLookupResult({ barcode })
          setActiveTab('lookup')
        }
      } finally {
        setLoading(false)
      }
    }

    setScanValue('')
  }

  // Complete Putaway Task handler
  const handleCompletePutaway = async () => {
    if (!selectedTask || selectedTask.task_type !== 'putaway') return
    if (!targetLocationId) {
      toast('Lütfen hedef lokasyon seçin veya okutun.', 'error')
      return
    }

    setActionLoading(true)
    try {
      const userIdent = activeUser?.id || activeUser?.username || 'System'
      const { data, error } = await db.rpc('complete_warehouse_putaway_task', {
        p_task_id: selectedTask.id,
        p_personnel_id: userIdent,
        p_target_location_id: targetLocationId,
      })

      if (error) throw error

      toast('Putaway görevi başarıyla tamamlandı.', 'success')
      setSelectedTask(null)
      setTargetLocationId('')
      setActiveTab('tasks')
      load()
    } catch (err) {
      toast('Hata: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Complete Pick Task handler
  const handleCompletePick = async () => {
    if (!selectedTask || selectedTask.task_type !== 'pick') return

    setActionLoading(true)
    try {
      const userIdent = activeUser?.id || activeUser?.username || 'System'
      const { data, error } = await db.rpc('complete_warehouse_shipment_task', {
        p_task_id: selectedTask.id,
        p_personnel_id: userIdent,
        p_picked_qty: Number(pickedQty),
      })

      if (error) throw error

      toast('Toplama (Pick) görevi tamamlandı.', 'success')
      setSelectedTask(null)
      setActiveTab('tasks')
      load()
    } catch (err) {
      toast('Hata: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Complete general task handler
  const handleCompleteGeneralTask = async () => {
    if (!selectedTask) return

    setActionLoading(true)
    try {
      const userIdent = activeUser?.id || activeUser?.username || 'System'
      
      // If pack or load task
      if (selectedTask.task_type === 'pack' || selectedTask.task_type === 'load') {
        const { error } = await db.rpc('complete_warehouse_shipment_task', {
          p_task_id: selectedTask.id,
          p_personnel_id: userIdent,
          p_picked_qty: 0,
        })
        if (error) throw error
      } else {
        // Just update status to done
        const { error } = await db
          .from('warehouse_tasks')
          .update({
            status: 'done',
            completed_at: new Date().toISOString(),
          })
          .eq('id', selectedTask.id)

        if (error) throw error

        // Log event
        await db.from('warehouse_task_events').insert({
          task_id: selectedTask.id,
          event_type: 'status_change',
          payload: { status: 'done', resolved_by: userIdent },
          created_by: userIdent,
        })
      }

      toast('Görev tamamlandı.', 'success')
      setSelectedTask(null)
      setActiveTab('tasks')
      load()
    } catch (err) {
      toast('Hata: ' + err.message, 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Filter tasks list
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterType === 'all') return true
      if (filterType === 'pack/load') return t.task_type === 'pack' || t.task_type === 'load'
      return t.task_type === filterType
    })
  }, [tasks, filterType])

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#0f172a',
      color: '#e2e8f0',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden',
    }} className="flex flex-col h-screen">
      
      {/* Dynamic CSS injecting for pulsing laser line and scanner target grid */}
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
        .laser-line {
          position: absolute;
          left: 0;
          width: 100%;
          height: 3px;
          background: rgba(16, 185, 129, 0.85);
          box-shadow: 0 0 12px 3px rgba(16, 185, 129, 0.8);
          animation: scan 3s linear infinite;
        }
        .scanner-grid {
          background-size: 30px 30px;
          background-image: 
            linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px);
        }
      `}</style>

      {/* 1. Header (50px) */}
      <header style={{
        height: 50,
        minHeight: 50,
        padding: '0 16px',
        borderBottom: '1px solid #1e293b',
        background: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa-solid fa-mobile-screen-button text-emerald-500" style={{ color: '#10b981' }} />
          <span style={{ fontWeight: 800, fontSize: '.9rem' }}>WMS Mobil Panel</span>
          <span style={{ fontSize: '.75rem', opacity: 0.7, background: '#1e293b', padding: '2px 8px', borderRadius: 20 }}>
            {workspaceBranchName || 'Ana Depo'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '.78rem', opacity: 0.85 }} className="hidden sm:inline">
            {staffName}
          </span>
          <button
            onClick={() => logoutSection(WORKSPACE_SECTION.warehouse)}
            style={{
              padding: '4px 10px',
              borderRadius: 8,
              border: '1px solid #ef4444',
              background: 'rgba(239,68,68,.15)',
              color: '#fca5a5',
              fontSize: '.72rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Çıkış
          </button>
        </div>
      </header>

      {/* 2. Split Screen Top Section: Barcode Scanner / Simulation (35vh) */}
      <section style={{
        height: '35vh',
        position: 'relative',
        background: '#020617',
        borderBottom: '2px solid #334155',
        overflow: 'hidden',
      }} className="relative flex flex-col justify-end">
        {/* Flash Effect on Scan */}
        {flashActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(16, 185, 129, 0.4)',
            zIndex: 5,
            transition: 'opacity 0.2s',
          }} />
        )}

        {/* Video stream container */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          {cameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#090d16',
              flexDirection: 'column',
              gap: 8,
            }} className="scanner-grid">
              <i className="fa-solid fa-qrcode fa-3x" style={{ color: '#475569', opacity: 0.5 }} />
              <span style={{ fontSize: '.75rem', color: '#64748b' }}>
                {cameraError || 'Kamera görüntüsü simüle ediliyor'}
              </span>
            </div>
          )}
        </div>

        {/* Scanner Target Frame & Laser line Overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {/* Neon Scanner Targeting Box */}
          <div style={{
            width: 160,
            height: 160,
            border: '2px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 16,
            position: 'relative',
            boxShadow: '0 0 20px rgba(0,0,0,0.8) inset',
          }}>
            {/* Corners */}
            <div style={{ position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '4px 0 0 0' }} />
            <div style={{ position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 4px 0 0' }} />
            <div style={{ position: 'absolute', bottom: -2, left: -2, width: 20, height: 20, borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '0 0 0 4px' }} />
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 0 4px 0' }} />
            
            {/* Moving Laser line inside box */}
            <div className="laser-line" />
          </div>
        </div>

        {/* Hidden inputs to capture physical scanner keyboard emulation */}
        <input
          ref={barcodeInputRef}
          type="text"
          value={scanValue}
          onChange={e => setScanValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleBarcodeScanned(scanValue)
            }
          }}
          style={{
            position: 'absolute',
            top: -100,
            left: -100,
            opacity: 0,
          }}
        />

        {/* Simulation Controls Panel at the bottom of scanner screen */}
        <div style={{
          position: 'relative',
          zIndex: 4,
          padding: 8,
          background: 'linear-gradient(to top, rgba(15,23,42,0.95), rgba(15,23,42,0.5))',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
        }}>
          <select
            value={simSelected}
            onChange={e => setSimSelected(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#f1f5f9',
              fontSize: '.78rem',
              fontWeight: 600,
            }}
          >
            {PREDEFINED_BARCODES.map(bc => (
              <option key={bc.value} value={bc.value}>
                {bc.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => handleBarcodeScanned(simSelected)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: '#10b981',
              color: '#fff',
              fontSize: '.75rem',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.4)',
            }}
          >
            <i className="fa-solid fa-bolt" /> Simüle Oku
          </button>
        </div>
      </section>

      {/* 3. Split Screen Bottom Section: Scrollable Content & Tabs (65vh) */}
      <section style={{
        height: '65vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#0f172a',
        overflow: 'hidden',
      }} className="flex-1 flex flex-col overflow-hidden">
        
        {/* Navigation Tabs (Navbar) */}
        <nav style={{
          display: 'flex',
          borderBottom: '1px solid #1e293b',
          background: '#090d16',
        }}>
          {[
            { id: 'tasks', label: 'Görevlerim', icon: 'fa-list-check' },
            { id: 'action', label: 'Aktif İşlem', icon: 'fa-spinner fa-spin-pulse', badge: selectedTask ? 1 : 0 },
            { id: 'lookup', label: 'Stok Sorgu', icon: 'fa-magnifying-glass' }
          ].map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '.72rem',
                  fontWeight: 700,
                  color: active ? '#10b981' : '#64748b',
                  borderBottom: `2.5px solid ${active ? '#10b981' : 'transparent'}`,
                  background: active ? 'rgba(16,185,129,.04)' : 'transparent',
                  borderLeft: 'none',
                  borderRight: 'none',
                  borderTop: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative',
                }}
              >
                <i className={`fa-solid ${tab.icon}`} style={{ fontSize: '1rem' }} />
                {tab.label}
                {!!tab.badge && (
                  <span style={{
                    position: 'absolute',
                    top: 6,
                    right: '25%',
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: 10,
                    width: 14,
                    height: 14,
                    fontSize: '.58rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Tab Content Areas */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 12,
        }} className="flex-1 overflow-y-auto">

          {/* ─── TAB: TASKS LIST ────────────────────────────────────────────── */}
          {activeTab === 'tasks' && (
            <div>
              {/* Type Filter Segment */}
              <div style={{
                display: 'flex',
                gap: 4,
                overflowX: 'auto',
                paddingBottom: 8,
                marginBottom: 8,
                borderBottom: '1px solid #1e293b',
              }} className="scrollbar-none">
                {[
                  { id: 'all', label: 'Hepsi' },
                  { id: 'putaway', label: 'Yerleştirme' },
                  { id: 'pick', label: 'Toplama' },
                  { id: 'pack/load', label: 'Paket/Yükle' },
                  { id: 'count', label: 'Sayım' },
                ].map(opt => {
                  const active = filterType === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setFilterType(opt.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 20,
                        border: 'none',
                        background: active ? '#10b981' : '#1e293b',
                        color: active ? '#fff' : '#94a3b8',
                        fontSize: '.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              {/* Tasks List */}
              {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-spinner fa-spin fa-lg" style={{ marginRight: 6 }} /> Yükleniyor...
                </div>
              ) : filteredTasks.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-clipboard-question fa-2x" style={{ marginBottom: 8 }} />
                  <div>Aktif görev bulunmuyor.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {filteredTasks.map(t => {
                    const item = stockItems.get(String(t.meta?.stock_item_id))
                    const qty = Number(t.meta?.quantity || 0)
                    const statusText = t.status === 'assigned' ? 'Atandı' : t.status === 'in_progress' ? 'İşlemde' : 'Bekliyor'
                    
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTask(t)
                          setPickedQty(qty)
                          setTargetLocationId(t.meta?.target_location_id || '')
                          setActiveTab('action')
                        }}
                        style={{
                          background: '#1e293b',
                          borderRadius: 14,
                          padding: 12,
                          border: `1.5px solid ${selectedTask?.id === t.id ? '#10b981' : 'transparent'}`,
                          boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{
                            fontSize: '.62rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: t.task_type === 'putaway' ? 'rgba(16,185,129,.15)' : 'rgba(59,130,246,.15)',
                            color: t.task_type === 'putaway' ? '#10b981' : '#3b82f6',
                            textTransform: 'uppercase',
                          }}>
                            {t.task_type}
                          </span>
                          <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>{statusText}</span>
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '.84rem', color: '#f8fafc', marginBottom: 4 }}>
                          {item?.name || 'Bilinmeyen Malzeme'}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#94a3b8' }}>
                          <span>Miktar: <strong style={{ color: '#f1f5f9' }}>{qty} {item?.unit || ''}</strong></span>
                          <span>Konum: <strong style={{ color: '#f1f5f9' }}>{formatAddress(t.meta?.location_id || t.meta?.from_location_id)}</strong></span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── TAB: ACTIVE ACTION ─────────────────────────────────────────── */}
          {activeTab === 'action' && (
            <div>
              {!selectedTask ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-circle-info fa-2x" style={{ marginBottom: 8, color: '#38bdf8' }} />
                  <div>Lütfen Görevlerim listesinden işlem yapmak için bir görev seçin veya barkod okutun.</div>
                </div>
              ) : (
                <div style={{
                  background: '#1e293b',
                  borderRadius: 16,
                  padding: 16,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
                }}>
                  {/* Task Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{
                      fontSize: '.68rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 8,
                      background: 'rgba(16,185,129,.15)',
                      color: '#10b981',
                      textTransform: 'uppercase',
                    }}>
                      {selectedTask.task_type}
                    </span>
                    <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>
                      Öncelik: <strong style={{ color: '#fb923c' }}>{selectedTask.priority}</strong>
                    </span>
                  </div>

                  {/* Task product detail */}
                  {(() => {
                    const taskMeta = selectedTask.meta || {}
                    const item = stockItems.get(String(taskMeta.stock_item_id))
                    const lpn = lpns.get(String(taskMeta.lpn_id))
                    const reqQty = Number(taskMeta.quantity || 0)

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {item?.image_url && (
                          <img 
                            src={item.image_url} 
                            alt={item.name} 
                            style={{ width: '100%', height: 120, objectFit: 'contain', borderRadius: 12, background: '#0f172a', padding: 8 }}
                          />
                        )}
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                          {item?.name || 'Bilinmeyen Malzeme'}
                        </div>
                        <div style={{ fontSize: '.78rem', color: '#cbd5e1' }}>
                          SKU / Kod: <strong style={{ color: '#f1f5f9' }}>{item?.sku || '—'}</strong>
                        </div>

                        {/* Location Details */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 12,
                          background: '#0f172a',
                          padding: 10,
                          borderRadius: 12,
                          fontSize: '.74rem',
                        }}>
                          <div>
                            <div style={{ color: '#64748b', fontSize: '.68rem', fontWeight: 700 }}>KAYNAK KONUM</div>
                            <div style={{ fontWeight: 800, color: '#e2e8f0', marginTop: 2 }}>
                              {formatAddress(taskMeta.location_id || taskMeta.from_location_id)}
                            </div>
                          </div>
                          <div>
                            <div style={{ color: '#64748b', fontSize: '.68rem', fontWeight: 700 }}>HEDEF KONUM</div>
                            <div style={{ fontWeight: 800, color: '#e2e8f0', marginTop: 2 }}>
                              {formatAddress(taskMeta.target_location_id)}
                            </div>
                          </div>
                        </div>

                        {/* Quantity controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                          <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>İşlem Miktarı ({item?.unit || ''})</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                              disabled={pickedQty <= 1}
                              onClick={() => setPickedQty(q => Math.max(q - 1, 1))}
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                border: 'none',
                                background: '#334155',
                                color: '#f1f5f9',
                                fontSize: '1.2rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              -
                            </button>
                            <span style={{ fontSize: '1.4rem', fontWeight: 800, width: 60, textAlign: 'center' }}>
                              {pickedQty}
                            </span>
                            <button
                              onClick={() => setPickedQty(q => q + 1)}
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                border: 'none',
                                background: '#334155',
                                color: '#f1f5f9',
                                fontSize: '1.2rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Action buttons based on task type */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                          {selectedTask.task_type === 'putaway' ? (
                            <button
                              disabled={actionLoading}
                              onClick={handleCompletePutaway}
                              style={{
                                padding: '12px',
                                borderRadius: 12,
                                background: '#10b981',
                                color: '#fff',
                                fontWeight: 800,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '.84rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}
                            >
                              <i className="fa-solid fa-circle-check" /> Putaway Tamamla
                            </button>
                          ) : selectedTask.task_type === 'pick' ? (
                            <button
                              disabled={actionLoading}
                              onClick={handleCompletePick}
                              style={{
                                padding: '12px',
                                borderRadius: 12,
                                background: '#3b82f6',
                                color: '#fff',
                                fontWeight: 800,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '.84rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}
                            >
                              <i className="fa-solid fa-hand-pointer" /> Toplamayı Onayla
                            </button>
                          ) : (
                            <button
                              disabled={actionLoading}
                              onClick={handleCompleteGeneralTask}
                              style={{
                                padding: '12px',
                                borderRadius: 12,
                                background: '#10b981',
                                color: '#fff',
                                fontWeight: 800,
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '.84rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                              }}
                            >
                              <i className="fa-solid fa-circle-check" /> Görevi Kapat
                            </button>
                          )}

                          {/* Reset / Deselect */}
                          <button
                            onClick={() => setSelectedTask(null)}
                            style={{
                              padding: '10px',
                              borderRadius: 12,
                              background: '#334155',
                              color: '#cbd5e1',
                              fontWeight: 700,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '.78rem',
                            }}
                          >
                            Vazgeç
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ─── TAB: INVENTORY LOOKUP ──────────────────────────────────────── */}
          {activeTab === 'lookup' && (
            <div>
              {lookupResult ? (
                <div style={{
                  background: '#1e293b',
                  borderRadius: 16,
                  padding: 16,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase' }}>
                      Sorgulama Türü: {lookupType}
                    </span>
                    <button
                      onClick={() => setLookupResult(null)}
                      style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer' }}
                    >
                      Temizle
                    </button>
                  </div>

                  {lookupType === 'product' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="flex flex-col gap-2">
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                        {lookupResult.name}
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#cbd5e1' }}>
                        SKU: <strong style={{ color: '#f1f5f9' }}>{lookupResult.sku || '—'}</strong>
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#cbd5e1' }}>
                        Birim: <strong style={{ color: '#f1f5f9' }}>{lookupResult.unit || '—'}</strong>
                      </div>
                    </div>
                  )}

                  {lookupType === 'lpn' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="flex flex-col gap-2">
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                        Palet / LPN Kod: {lookupResult.lpn_code}
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#cbd5e1' }}>
                        ID: <strong style={{ color: '#f1f5f9' }}>{lookupResult.id}</strong>
                      </div>
                    </div>
                  )}

                  {lookupType === 'location' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} className="flex flex-col gap-2">
                      <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>
                        Lokasyon: {`Zone: ${lookupResult.zone_code} - Koridor: ${lookupResult.aisle || 0}`}
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#cbd5e1' }}>
                        Adres Detayı: <strong style={{ color: '#f1f5f9' }}>{formatAddress(lookupResult.id)}</strong>
                      </div>
                    </div>
                  )}

                  {lookupType === 'unknown' && (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                      <i className="fa-solid fa-triangle-exclamation fa-2x text-amber-500" style={{ color: '#f59e0b', marginBottom: 8 }} />
                      <div style={{ fontSize: '.84rem', fontWeight: 700 }}>Eşleşme Bulunamadı</div>
                      <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 4 }}>
                        Taranan Barkod: {lookupResult.barcode}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                  <i className="fa-solid fa-barcode fa-2x" style={{ marginBottom: 8, color: '#10b981' }} />
                  <div>Sorgulamak istediğiniz Palet (LPN), Lokasyon veya Ürün barkodunu tarayın.</div>
                </div>
              )}
            </div>
          )}

        </div>
      </section>

    </div>
  )
}
