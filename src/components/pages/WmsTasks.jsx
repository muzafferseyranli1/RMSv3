import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { db, buildApiUrl } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const TYPE_CONFIG = {
  putaway: { label: 'Yerleştirme (Putaway)', color: '#10b981', bg: 'rgba(16,185,129,.12)', icon: 'fa-truck-ramp-box' },
  pick:    { label: 'Toplama (Pick)',       color: '#3b82f6', bg: 'rgba(59,130,246,.12)', icon: 'fa-hand-pointer' },
  pack:    { label: 'Paketleme (Pack)',     color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: 'fa-box' },
  load:    { label: 'Yükleme (Load)',       color: '#f97316', bg: 'rgba(249,115,22,.12)', icon: 'fa-truck-moving' },
  count:   { label: 'Sayım (Count)',        color: '#06b6d4', bg: 'rgba(6,182,212,.12)', icon: 'fa-clipboard-check' },
  move:    { label: 'Transfer (Move)',      color: '#64748b', bg: 'rgba(100,116,139,.12)', icon: 'fa-right-left' },
  quality: { label: 'Kalite (Quality)',     color: '#ec4899', bg: 'rgba(236,72,153,.12)', icon: 'fa-shield-halved' }
}

const STATUS_CONFIG = {
  pending:     { label: 'Bekliyor',     color: '#6b7280', bg: 'rgba(107,114,128,.12)', icon: 'fa-clock' },
  assigned:    { label: 'Atandı',       color: '#6366f1', bg: 'rgba(99,102,241,.12)', icon: 'fa-user-check' },
  in_progress: { label: 'İşlemde',      color: '#3b82f6', bg: 'rgba(59,130,246,.12)', icon: 'fa-spinner fa-spin' },
  done:        { label: 'Tamamlandı',  color: '#10b981', bg: 'rgba(16,185,129,.12)', icon: 'fa-circle-check' },
  exception:   { label: 'Sorunlu',      color: '#ef4444', bg: 'rgba(239,68,68,.12)', icon: 'fa-triangle-exclamation' },
  cancelled:   { label: 'İptal Edildi', color: '#374151', bg: 'rgba(55,65,81,.12)', icon: 'fa-circle-xmark' }
}

const PRIORITY_CONFIG = {
  low:    { label: 'Düşük',  color: '#64748b' },
  normal: { label: 'Normal', color: '#10b981' },
  high:   { label: 'Yüksek', color: '#fb923c' },
  urgent: { label: 'Kritik', color: '#ef4444' }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WmsTasks() {
  const toast = useToast()
  const { branchId: workspaceBranchId } = useWorkspace()

  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')

  // In-memory resolved reference maps
  const [stockItems, setStockItems] = useState(new Map())
  const [locations, setLocations] = useState(new Map())
  const [lpns, setLpns] = useState(new Map())
  const [personnel, setPersonnel] = useState(new Map())

  // Drawer / Detail state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [events, setEvents] = useState([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [resNote, setResNote] = useState('')
  const [submittingRes, setSubmittingRes] = useState(false)

  // Cycle Count & Approvals State
  const [viewTab, setViewTab] = useState('tasks') // 'tasks' | 'approvals' | 'replenishment'
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0)
  const [approvals, setApprovals] = useState([])
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvingId, setApprovingId] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)

  // Replenishment State
  const [replenishSuggestions, setReplenishSuggestions] = useState([])
  const [replenishLoading, setReplenishLoading] = useState(false)
  const [generatingReplenishment, setGeneratingReplenishment] = useState(false)

  // Task Creation Form State
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [allLocations, setAllLocations] = useState([])
  const [allLpns, setAllLpns] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [allPersonnel, setAllPersonnel] = useState([])
  const [loadingModalData, setLoadingModalData] = useState(false)
  const [formLocationId, setFormLocationId] = useState('')
  const [formLpnId, setFormLpnId] = useState('')
  const [formProductId, setFormProductId] = useState('')
  const [formPriority, setFormPriority] = useState('normal')
  const [formDescription, setFormDescription] = useState('')
  const [formAssignedPersonnelId, setFormAssignedPersonnelId] = useState('')
  const [savingTask, setSavingTask] = useState(false)

  // Fetch active user
  const activeUser = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')
    } catch {
      return null
    }
  }, [])

  // Load WMS tasks and resolve references
  const load = useCallback(async () => {
    if (!workspaceBranchId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // 1. Fetch tasks
      const { data: tasksData, error: tasksError } = await db
        .from('warehouse_tasks')
        .select('*')
        .eq('branch_id', workspaceBranchId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (tasksError) throw tasksError

      const resolvedTasks = tasksData || []
      setTasks(resolvedTasks)

      // 2. Collect reference IDs to query in batch
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

      // 3. Query references in parallel
      const promises = []

      if (stockItemIds.size > 0) {
        promises.push(
          db.from('stock_items')
            .select('id, name, sku, unit')
            .in('id', Array.from(stockItemIds))
            .then(({ data }) => {
              const map = new Map()
              data?.forEach(x => map.set(String(x.id), x))
              setStockItems(map)
            })
        )
      } else {
        setStockItems(new Map())
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
      } else {
        setLocations(new Map())
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
      } else {
        setLpns(new Map())
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
      } else {
        setPersonnel(new Map())
      }

      await Promise.all(promises)
    } catch (err) {
      toast('Görevler yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [workspaceBranchId, toast])

  const loadApprovals = useCallback(async () => {
    if (!workspaceBranchId) return
    setApprovalsLoading(true)
    try {
      const res = await fetch(`${buildApiUrl('/api/wms/count-approvals')}?branch_id=${workspaceBranchId}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      setApprovals(json.data || [])
    } catch (err) {
      toast('Sayım onayları yüklenemedi: ' + err.message, 'error')
    } finally {
      setApprovalsLoading(false)
    }
  }, [workspaceBranchId, toast])

  const loadReplenishment = useCallback(async () => {
    if (!workspaceBranchId) return
    setReplenishLoading(true)
    try {
      const res = await fetch(`${buildApiUrl('/api/wms/replenishment/suggestions')}?branch_id=${workspaceBranchId}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      setReplenishSuggestions(json.data || [])
    } catch (err) {
      toast('İkmal önerileri yüklenemedi: ' + err.message, 'error')
    } finally {
      setReplenishLoading(false)
    }
  }, [workspaceBranchId, toast])

  async function generateReplenishmentTasks(suggestion) {
    if (!workspaceBranchId) return
    setGeneratingReplenishment(true)
    try {
      const res = await fetch(buildApiUrl('/api/wms/replenishment/create-tasks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: workspaceBranchId,
          suggestions: [suggestion]
        })
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error.message)
      toast('İkmal görevleri başarıyla oluşturuldu.', 'success')
      load()
      loadReplenishment()
    } catch (err) {
      toast('İkmal görevi oluşturulamadı: ' + err.message, 'error')
    } finally {
      setGeneratingReplenishment(false)
    }
  }

  const fetchPendingCount = useCallback(async () => {
    if (!workspaceBranchId) return
    try {
      const res = await fetch(`${buildApiUrl('/api/wms/count-approvals')}?branch_id=${workspaceBranchId}&status=pending`)
      const json = await res.json()
      if (json.data) {
        setPendingApprovalsCount(json.data.length)
      }
    } catch (err) {
      console.error(err)
    }
  }, [workspaceBranchId])

  const openCreateModal = async () => {
    setCreateModalOpen(true)
    setLoadingModalData(true)
    try {
      const [locsRes, lpnsRes, prodsRes, persRes] = await Promise.all([
        db.from('warehouse_locations').select('*').eq('branch_id', workspaceBranchId).eq('is_active', true).order('zone_code'),
        db.from('warehouse_lpns').select('*').eq('branch_id', workspaceBranchId).order('lpn_code'),
        db.from('stock_items').select('id, name, sku, unit').is('deleted_at', null).order('name'),
        db.from('personnel').select('id, firstName, lastName, username').is('deletedAt', null).order('firstName')
      ])
      setAllLocations(locsRes.data || [])
      setAllLpns(lpnsRes.data || [])
      setAllProducts(prodsRes.data || [])
      setAllPersonnel(persRes.data || [])
    } catch (err) {
      toast('Veriler yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoadingModalData(false)
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (!formLocationId || !formProductId) {
      toast('Lokasyon ve Ürün seçilmesi zorunludur.', 'error')
      return
    }

    setSavingTask(true)
    try {
      const selectedProd = allProducts.find(p => p.id === formProductId)
      const selectedLoc = allLocations.find(l => l.id === formLocationId)
      const selectedLpn = allLpns.find(l => l.id === formLpnId)

      const locName = selectedLoc ? formatAddress(selectedLoc) : ''
      const lpnCode = selectedLpn ? selectedLpn.lpn_code : null
      const prodName = selectedProd ? selectedProd.name : ''
      const prodCode = selectedProd ? selectedProd.sku : ''

      const meta = {
        location_id: formLocationId,
        source_location: locName,
        stock_item_id: formProductId,
        product_id: formProductId,
        product_name: prodName,
        product_code: prodCode,
        barcode: prodCode
      }

      if (formLpnId) {
        meta.lpn_id = formLpnId
        meta.lpn_code = lpnCode
      }

      const newTask = {
        branch_id: workspaceBranchId,
        task_type: 'count',
        status: formAssignedPersonnelId ? 'assigned' : 'pending',
        priority: formPriority,
        assigned_personnel_id: formAssignedPersonnelId || null,
        assigned_at: formAssignedPersonnelId ? new Date().toISOString() : null,
        description: formDescription || `${locName} sayım görevi`,
        meta,
        created_by: activeUser?.username || 'admin'
      }

      const { error } = await db.from('warehouse_tasks').insert(newTask)
      if (error) throw error

      toast('Sayım görevi başarıyla oluşturuldu.', 'success')
      setCreateModalOpen(false)
      // Reset form
      setFormLocationId('')
      setFormLpnId('')
      setFormProductId('')
      setFormPriority('normal')
      setFormDescription('')
      setFormAssignedPersonnelId('')
      load()
    } catch (err) {
      toast('Görev oluşturulamadı: ' + err.message, 'error')
    } finally {
      setSavingTask(false)
    }
  }

  const handleApprove = async (approvalId) => {
    setApprovingId(approvalId)
    try {
      const response = await fetch(buildApiUrl('/api/wms/count-approvals/approve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_id: approvalId,
          manager_id: activeUser?.id || activeUser?.username || 'manager'
        })
      })
      const json = await response.json()
      if (json.error) throw new Error(json.error.message)
      toast('Sayım farkı onaylandı ve stok hareketleri üretildi.', 'success')
      loadApprovals()
      fetchPendingCount()
    } catch (err) {
      toast('Onaylama hatası: ' + err.message, 'error')
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (approvalId) => {
    setRejectingId(approvalId)
    try {
      const response = await fetch(buildApiUrl('/api/wms/count-approvals/reject'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approval_id: approvalId,
          manager_id: activeUser?.id || activeUser?.username || 'manager'
        })
      })
      const json = await response.json()
      if (json.error) throw new Error(json.error.message)
      toast('Sayım farkı reddedildi. Stok güncellenmedi.', 'info')
      loadApprovals()
      fetchPendingCount()
    } catch (err) {
      toast('Reddetme hatası: ' + err.message, 'error')
    } finally {
      setRejectingId(null)
    }
  }

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    fetchPendingCount()
  }, [fetchPendingCount, tasks])

  useEffect(() => {
    if (viewTab === 'approvals') {
      loadApprovals()
    } else if (viewTab === 'replenishment') {
      loadReplenishment()
    }
  }, [viewTab, loadApprovals, loadReplenishment])

  // Fetch event history for the selected task
  const loadEvents = useCallback(async (taskId) => {
    setEventsLoading(true)
    try {
      const { data, error } = await db
        .from('warehouse_task_events')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setEvents(data || [])
    } catch (err) {
      toast('Görev geçmişi yüklenemedi: ' + err.message, 'error')
    } finally {
      setEventsLoading(false)
    }
  }, [toast])

  const handleOpenDrawer = (task) => {
    setSelectedTask(task)
    setResNote('')
    setDrawerOpen(true)
    loadEvents(task.id)
  }

  // Controlled Exception Resolution handler
  const handleResolveException = async (resolutionAction) => {
    if (!selectedTask || selectedTask.status !== 'exception') return
    if (!resNote.trim()) {
      toast('Çözüm notu girilmesi zorunludur.', 'error')
      return
    }

    setSubmittingRes(true)
    try {
      const userIdent = activeUser?.id || activeUser?.username || 'System'

      const { error } = await db.rpc('resolve_warehouse_task_exception', {
        p_task_id: selectedTask.id,
        p_action: resolutionAction,
        p_note: resNote.trim(),
        p_personnel_id: userIdent
      })

      if (error) throw error

      toast(`Görev başarıyla ${resolutionAction === 'retry' ? 'beklemeye alındı' : 'iptal edildi'}.`, 'success')
      setDrawerOpen(false)
      load()
    } catch (err) {
      toast('İşlem başarısız: ' + err.message, 'error')
    } finally {
      setSubmittingRes(false)
    }
  }

  // Filter tasks based on filters and search
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Type filter
      if (filterType !== 'all' && t.task_type !== filterType) return false
      // Status filter
      if (filterStatus !== 'all' && t.status !== filterStatus) return false

      // Search match
      if (search.trim()) {
        const q = search.toLowerCase()
        const taskNo = `#T-${t.id.slice(0, 8).toUpperCase()}`
        const desc = (t.description || '').toLowerCase()
        const item = stockItems.get(String(t.meta?.stock_item_id))
        const itemName = (item?.name || '').toLowerCase()
        const itemSku = (item?.sku || '').toLowerCase()
        const lpn = lpns.get(String(t.meta?.lpn_id))
        const lpnCode = (lpn?.lpn_code || '').toLowerCase()
        const lot = (t.meta?.lot_number || '').toLowerCase()

        if (
          !taskNo.toLowerCase().includes(q) &&
          !desc.includes(q) &&
          !itemName.includes(q) &&
          !itemSku.includes(q) &&
          !lpnCode.includes(q) &&
          !lot.includes(q)
        ) {
          return false
        }
      }

      return true
    })
  }, [tasks, filterType, filterStatus, search, stockItems, lpns])

  // Count summaries
  const stats = useMemo(() => {
    const counts = { total: 0, pending: 0, active: 0, done: 0, exception: 0, cancelled: 0 }
    tasks.forEach(t => {
      counts.total++
      if (t.status === 'pending') counts.pending++
      else if (t.status === 'assigned' || t.status === 'in_progress') counts.active++
      else if (t.status === 'done') counts.done++
      else if (t.status === 'exception') counts.exception++
      else if (t.status === 'cancelled') counts.cancelled++
    })
    return counts
  }, [tasks])

  const friendlyExceptionMessage = (task) => {
    if (task.status !== 'exception') return ''
    if (task.meta?.picked_qty !== undefined && task.meta?.quantity !== undefined) {
      return `Kısmi Toplama: ${task.meta.picked_qty} / ${task.meta.quantity} adet toplandı.`
    }
    return task.meta?.exception_reason || 'Kısmi İşlem / Sorun Bildirildi'
  }

  if (!workspaceBranchId) {
    return (
      <div className="flex-1 p-6 flex flex-col items-center justify-center bg-slate-900 text-white min-h-[500px]">
        <i className="fa-solid fa-warehouse text-6xl text-indigo-400/40 mb-4" />
        <h2 className="text-xl font-bold">WMS Depo Seçilmedi</h2>
        <p className="text-slate-400 mt-2 text-sm text-center max-w-md">
          WMS Görevlerini izlemek ve yönetmek için lütfen aktif çalışma alanı olarak bir Depo şubesi seçin.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-screen">
      <Header title="WMS Depo Görev Paneli" />

      {/* Main Content Area */}
      <div className="p-6 flex flex-col gap-6 max-w-[1600px] w-full mx-auto">
        
        {/* Title and Add Button Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800/80 p-5 rounded-xl shadow-lg shadow-black/20">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <i className="fa-solid fa-warehouse text-indigo-400" />
              Depo Operasyonları
            </h2>
            <p className="text-xs text-slate-400 mt-1">Görev atamaları, operasyonel süreç takipleri ve sayım onayları.</p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold py-2.5 px-4 rounded-lg text-sm flex items-center gap-2 transition duration-200 shadow-lg shadow-indigo-600/10"
          >
            <i className="fa-solid fa-circle-plus text-base" />
            Yeni Sayım Görevi
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1 border-b border-slate-800 pb-px">
          <button
            onClick={() => setViewTab('tasks')}
            className={`px-5 py-3 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
              viewTab === 'tasks'
                ? 'bg-slate-900/60 text-indigo-400 border-indigo-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
            }`}
          >
            <i className="fa-solid fa-list-check" />
            Görev Listesi
          </button>
          <button
            onClick={() => setViewTab('approvals')}
            className={`px-5 py-3 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 relative ${
              viewTab === 'approvals'
                ? 'bg-slate-900/60 text-indigo-400 border-indigo-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
            }`}
          >
            <i className="fa-solid fa-scale-balanced" />
            Sayım Farkı Onayları
            {pendingApprovalsCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse ml-1">
                {pendingApprovalsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewTab('replenishment')}
            className={`px-5 py-3 text-sm font-semibold rounded-t-lg transition flex items-center gap-2 border-b-2 relative ${
              viewTab === 'replenishment'
                ? 'bg-slate-900/60 text-indigo-400 border-indigo-500 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
            }`}
          >
            <i className="fa-solid fa-truck-ramp-box" />
            İkmal Önerileri
          </button>
        </div>

        {viewTab === 'replenishment' ? (
          <div className="flex flex-col gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/30">
              {replenishLoading ? (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-circle-notch fa-spin text-4xl text-indigo-500 mb-3" />
                  <span>İkmal önerileri yükleniyor...</span>
                </div>
              ) : replenishSuggestions.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-truck-ramp-box text-5xl text-slate-700 mb-3" />
                  <span className="font-semibold text-slate-300">İkmal ihtiyacı bulunmuyor.</span>
                  <p className="text-xs text-slate-500 mt-1">Tüm pick-face lokasyonlarındaki stoklar min seviyesinin üzerinde.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-950/50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-4">Ürün</th>
                        <th className="p-4">Pick-Face Konumu</th>
                        <th className="p-4">Min / Max</th>
                        <th className="p-4">Mevcut / Yolda</th>
                        <th className="p-4">İhtiyaç</th>
                        <th className="p-4">Rezerve Durumu</th>
                        <th className="p-4">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-sm text-slate-300">
                      {replenishSuggestions.map((sug, i) => (
                        <tr key={i} className="hover:bg-slate-950/20 transition-colors">
                          <td className="p-4">
                            <div className="font-semibold text-white">{sug.product_name}</div>
                            <div className="text-xs text-slate-500 font-mono">{sug.product_sku}</div>
                          </td>
                          <td className="p-4 font-mono text-xs">{sug.pick_face_location_code}</td>
                          <td className="p-4 font-mono text-xs">
                            {sug.pick_face_min_qty} / {sug.pick_face_max_qty}
                          </td>
                          <td className="p-4 font-mono text-xs">
                            {sug.current_qty} (+{sug.pending_qty} yolda)
                          </td>
                          <td className="p-4 font-bold text-indigo-400 font-mono">
                            {sug.needed_qty} {sug.product_unit}
                          </td>
                          <td className="p-4">
                            {sug.has_warning ? (
                              <span className="bg-red-950/50 text-red-400 border border-red-800/30 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 w-max">
                                <i className="fa-solid fa-circle-exclamation text-xs" />
                                Rezerve Stok Yok
                              </span>
                            ) : (
                              <div className="flex flex-col gap-1 text-xs">
                                {sug.allocations.map((alloc, idx) => (
                                  <div key={idx} className="bg-slate-800/40 border border-slate-700/30 px-2 py-1 rounded text-slate-300">
                                    <span className="font-semibold text-slate-200">LOC-{alloc.zone_code}</span>: {alloc.allocated_qty} adet
                                    {alloc.lpn_code && <span className="text-slate-500 font-mono text-[10px] block">LPN: {alloc.lpn_code}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <button
                              disabled={sug.has_warning || generatingReplenishment}
                              onClick={() => generateReplenishmentTasks(sug)}
                              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                                sug.has_warning
                                  ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/30'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/10 active:scale-95'
                              }`}
                            >
                              <i className="fa-solid fa-truck-ramp-box text-xs" />
                              Görev Oluştur
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : viewTab === 'approvals' ? (
          <div className="flex flex-col gap-6">
            {/* Approvals table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/30">
              {approvalsLoading ? (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-circle-notch fa-spin text-4xl text-indigo-500 mb-3" />
                  <span>Onay istekleri yükleniyor...</span>
                </div>
              ) : approvals.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-scale-balanced text-5xl text-slate-700 mb-3" />
                  <span className="font-semibold text-slate-300">Bekleyen onay kaydı bulunmuyor.</span>
                  <p className="text-xs text-slate-500 mt-1">Tüm sayım farkları işlenmiş veya fark bulunamamış.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/60">
                        <th className="py-4 px-5">Ürün</th>
                        <th className="py-4 px-4">Lokasyon</th>
                        <th className="py-4 px-4">LPN</th>
                        <th className="py-4 px-4 text-right">Beklenen</th>
                        <th className="py-4 px-4 text-right">Sayılan</th>
                        <th className="py-4 px-4 text-right">Fark</th>
                        <th className="py-4 px-4">Sayımı Yapan / Tarih</th>
                        <th className="py-4 px-4">Neden / Açıklama</th>
                        <th className="py-4 px-4">Durum</th>
                        <th className="py-4 px-4 text-center">İşlemler</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {approvals.map((app) => {
                        const isPending = app.status === 'pending'
                        const diff = Number(app.difference_qty)
                        const locCode = `LOC-${app.zone_code}-${app.aisle || 0}-${app.rack || 0}-${app.level || 0}`
                        return (
                          <tr key={app.id} className="hover:bg-slate-800/20 transition duration-150">
                            <td className="py-4 px-5">
                              <span className="font-bold text-slate-200 block">{app.stock_item_name}</span>
                              <span className="text-xs text-slate-400 font-mono">SKU: {app.stock_item_sku}</span>
                            </td>
                            <td className="py-4 px-4 font-semibold text-slate-350">
                              {locCode}
                            </td>
                            <td className="py-4 px-4 font-mono text-slate-350">
                              {app.lpn_code || '—'}
                            </td>
                            <td className="py-4 px-4 text-right text-slate-400">
                              {Number(app.expected_qty)}
                            </td>
                            <td className="py-4 px-4 text-right text-slate-100 font-semibold">
                              {Number(app.counted_qty)}
                            </td>
                            <td className={`py-4 px-4 text-right font-bold ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {diff > 0 ? '+' : ''}{diff}
                            </td>
                            <td className="py-4 px-4 text-xs text-slate-400">
                              <span className="block font-medium text-slate-350">{app.created_by || 'personel'}</span>
                              <span>{new Date(app.created_at).toLocaleString('tr-TR')}</span>
                            </td>
                            <td className="py-4 px-4 text-xs text-amber-400/90 italic max-w-xs truncate" title={app.reason}>
                              {app.reason ? `"${app.reason}"` : '—'}
                            </td>
                            <td className="py-4 px-4">
                              {app.status === 'pending' && (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full text-xs font-bold">
                                  Bekliyor
                                </span>
                              )}
                              {app.status === 'approved' && (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full text-xs font-bold">
                                  Onaylandı
                                </span>
                              )}
                              {app.status === 'rejected' && (
                                <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-full text-xs font-bold">
                                  Reddedildi
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-center">
                              {isPending ? (
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleApprove(app.id)}
                                    disabled={approvingId === app.id || rejectingId === app.id}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-1.5 px-3 rounded transition active:scale-95 flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {approvingId === app.id ? (
                                      <i className="fa-solid fa-circle-notch fa-spin" />
                                    ) : (
                                      <i className="fa-solid fa-check" />
                                    )}
                                    Onayla
                                  </button>
                                  <button
                                    onClick={() => handleReject(app.id)}
                                    disabled={approvingId === app.id || rejectingId === app.id}
                                    className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-1.5 px-3 rounded transition active:scale-95 flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {rejectingId === app.id ? (
                                      <i className="fa-solid fa-circle-notch fa-spin" />
                                    ) : (
                                      <i className="fa-solid fa-xmark" />
                                    )}
                                    Reddet
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500">
                                  {app.approved_by || 'yönetici'} ({new Date(app.approved_at).toLocaleDateString('tr-TR')})
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards Dashboard */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition duration-300 shadow-lg shadow-black/20">
                <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Toplam Depo İşi</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-slate-100">{stats.total}</span>
                  <span className="text-xs text-slate-500">adet</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-slate-400" style={{ width: '100%' }} />
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition duration-300 shadow-lg shadow-black/20">
                <span className="text-xs text-amber-500 font-semibold tracking-wider uppercase">Atama Bekleyen</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-amber-400">{stats.pending}</span>
                  <span className="text-xs text-amber-600/70">adet</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: stats.total ? `${(stats.pending / stats.total) * 100}%` : '0%' }} />
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition duration-300 shadow-lg shadow-black/20">
                <span className="text-xs text-blue-500 font-semibold tracking-wider uppercase">Süreçte Olanlar</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-blue-400">{stats.active}</span>
                  <span className="text-xs text-blue-600/70">adet</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-blue-500" style={{ width: stats.total ? `${(stats.active / stats.total) * 100}%` : '0%' }} />
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition duration-300 shadow-lg shadow-black/20">
                <span className="text-xs text-emerald-500 font-semibold tracking-wider uppercase">Tamamlananlar</span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-emerald-400">{stats.done}</span>
                  <span className="text-xs text-emerald-600/70">adet</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: stats.total ? `${(stats.done / stats.total) * 100}%` : '0%' }} />
                </div>
              </div>
              <div className="col-span-2 md:col-span-1 bg-red-950/40 border border-red-900/60 rounded-xl p-4 flex flex-col justify-between hover:border-red-800/80 transition duration-300 shadow-lg shadow-red-950/10">
                <span className="text-xs text-red-400 font-semibold tracking-wider uppercase flex items-center gap-1.5">
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  Sorun Bildirilenler
                </span>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl font-bold text-red-400">{stats.exception}</span>
                  <span className="text-xs text-red-500/70">adet</span>
                </div>
                <div className="h-1 bg-red-950/80 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: stats.total ? `${(stats.exception / stats.total) * 100}%` : '0%' }} />
                </div>
              </div>
            </div>

            {/* Filter and Search Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-md">
              {/* Search bar */}
              <div className="w-full md:w-1/3 relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                <input
                  type="text"
                  placeholder="Görev no, ürün adı, SKU, LPN veya lot ara..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none transition duration-200 text-slate-100"
                />
              </div>

              {/* Filtering dropdowns */}
              <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">İş Tipi:</label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none transition text-slate-100"
                  >
                    <option value="all">Tüm Görev Tipleri</option>
                    <option value="putaway">Yerleştirme (Putaway)</option>
                    <option value="pick">Toplama (Pick)</option>
                    <option value="pack">Paketleme (Pack)</option>
                    <option value="load">Yükleme (Load)</option>
                    <option value="count">Sayım (Count)</option>
                    <option value="move">İç Transfer (Move)</option>
                    <option value="quality">Kalite Kontrol (Quality)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Durum:</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm outline-none transition text-slate-100"
                  >
                    <option value="all">Tüm Durumlar</option>
                    <option value="pending">Bekliyor (Pending)</option>
                    <option value="assigned">Atandı (Assigned)</option>
                    <option value="in_progress">İşlemde (In Progress)</option>
                    <option value="exception">Sorunlu (Exception)</option>
                    <option value="done">Tamamlandı (Done)</option>
                    <option value="cancelled">İptal Edildi (Cancelled)</option>
                  </select>
                </div>

                {/* Quick Filter button to exceptions */}
                <button
                  onClick={() => setFilterStatus(filterStatus === 'exception' ? 'all' : 'exception')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border transition duration-200 ${
                    filterStatus === 'exception'
                      ? 'bg-red-500/20 text-red-400 border-red-500/40 hover:bg-red-500/30'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  <i className="fa-solid fa-triangle-exclamation" />
                  Sadece Sorunlular
                </button>
              </div>
            </div>

            {/* Data Table Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl shadow-black/30">
              {loading ? (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-circle-notch fa-spin text-4xl text-indigo-500 mb-3" />
                  <span>Depo görev listesi yükleniyor...</span>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="p-20 flex flex-col items-center justify-center text-slate-400">
                  <i className="fa-solid fa-list-check text-5xl text-slate-700 mb-3" />
                  <span className="font-semibold text-slate-300">Görev bulunamadı.</span>
                  <p className="text-xs text-slate-500 mt-1">Arama terimini değiştirin veya başka bir filtre seçin.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-400 font-semibold uppercase tracking-wider bg-slate-950/60">
                        <th className="py-4 px-5">Görev No</th>
                        <th className="py-4 px-4">Tip</th>
                        <th className="py-4 px-4">Durum</th>
                        <th className="py-4 px-4">Ürün</th>
                        <th className="py-4 px-4 text-right">Miktar</th>
                        <th className="py-4 px-4">Kaynak Konum</th>
                        <th className="py-4 px-4">Hedef Konum</th>
                        <th className="py-4 px-4">LPN</th>
                        <th className="py-4 px-4">Lot / SKT</th>
                        <th className="py-4 px-4">Atanan Personel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-sm">
                      {filteredTasks.map((t) => {
                        const taskNo = `#T-${t.id.slice(0, 8).toUpperCase()}`
                        const typeCfg = TYPE_CONFIG[t.task_type] || { label: t.task_type, color: '#94a3b8', bg: 'rgba(148,163,184,.1)', icon: 'fa-tasks' }
                        const statusCfg = STATUS_CONFIG[t.status] || { label: t.status, color: '#94a3b8', bg: 'rgba(148,163,184,.1)', icon: 'fa-circle-question' }

                        // Resolve objects in memory
                        const item = stockItems.get(String(t.meta?.stock_item_id))
                        const fromLoc = t.meta?.from_location_id || t.meta?.location_id ? locations.get(String(t.meta.from_location_id || t.meta.location_id)) : null
                        const toLoc = t.meta?.target_location_id ? locations.get(String(t.meta.target_location_id)) : null
                        const lpnObj = t.meta?.lpn_id ? lpns.get(String(t.meta.lpn_id)) : null
                        const staff = t.assigned_personnel_id ? personnel.get(String(t.assigned_personnel_id)) : null
                        const staffName = staff ? `${staff.firstName} ${staff.lastName}` : (t.assigned_personnel_id || '—')

                        return (
                          <tr
                            key={t.id}
                            onClick={() => handleOpenDrawer(t)}
                            className={`hover:bg-slate-800/40 transition duration-150 cursor-pointer ${
                              t.status === 'exception' ? 'bg-red-950/5' : ''
                            }`}
                          >
                            {/* Task No */}
                            <td className="py-4 px-5 font-mono text-indigo-400 font-semibold">
                              {taskNo}
                            </td>

                            {/* Task Type */}
                            <td className="py-4 px-4 whitespace-nowrap">
                              <span
                                style={{ color: typeCfg.color, background: typeCfg.bg }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border border-current/10"
                              >
                                <i className={`fa-solid ${typeCfg.icon}`} style={{ fontSize: '.7rem' }} />
                                {typeCfg.label}
                              </span>
                            </td>

                            {/* Task Status */}
                            <td className="py-4 px-4 whitespace-nowrap">
                              <span
                                style={{ color: statusCfg.color, background: statusCfg.bg }}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                              >
                                <i className={`fa-solid ${statusCfg.icon}`} style={{ fontSize: '.7rem' }} />
                                {statusCfg.label}
                              </span>
                            </td>

                            {/* Stock Item */}
                            <td className="py-4 px-4">
                              {item ? (
                                <div className="max-w-[200px] truncate">
                                  <span className="font-bold text-slate-200 block truncate">{item.name}</span>
                                  <span className="text-xs text-slate-400 font-mono">SKU: {item.sku}</span>
                                </div>
                              ) : t.meta?.product_name ? (
                                <div className="max-w-[200px] truncate">
                                  <span className="font-bold text-slate-250 block truncate">{t.meta.product_name}</span>
                                  <span className="text-xs text-slate-400 font-mono">Code: {t.meta.product_code || '—'}</span>
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>

                            {/* Quantity */}
                            <td className="py-4 px-4 text-right font-bold text-slate-200 font-mono">
                              {t.task_type === 'count' ? (
                                t.meta?.scanned_quantity !== undefined ? (
                                  <span>{t.meta.scanned_quantity} {item?.unit || 'Adet'}</span>
                                ) : (
                                  <span className="text-slate-500">—</span>
                                )
                              ) : (
                                <span>{t.meta?.quantity || 0} {item?.unit || 'Adet'}</span>
                              )}
                            </td>

                            {/* Source location */}
                            <td className="py-4 px-4 whitespace-nowrap font-medium text-slate-300">
                              {fromLoc ? formatAddress(fromLoc) : t.meta?.source_location || '—'}
                            </td>

                            {/* Target location */}
                            <td className="py-4 px-4 whitespace-nowrap font-medium text-slate-300">
                              {toLoc ? formatAddress(toLoc) : t.meta?.target_location || '—'}
                            </td>

                            {/* LPN */}
                            <td className="py-4 px-4 font-mono text-xs text-indigo-300">
                              {lpnObj ? lpnObj.lpn_code : t.meta?.lpn_code || '—'}
                            </td>

                            {/* Lot / SKT */}
                            <td className="py-4 px-4 text-xs text-slate-400">
                              {t.meta?.lot_number ? <span className="block font-semibold">Lot: {t.meta.lot_number}</span> : null}
                              {t.meta?.expiration_date ? <span>SKT: {t.meta.expiration_date}</span> : null}
                              {!t.meta?.lot_number && !t.meta?.expiration_date ? '—' : null}
                            </td>

                            {/* Assigned Personnel */}
                            <td className="py-4 px-4 text-slate-300 font-medium whitespace-nowrap">
                              {staffName}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* Task Details Drawer */}
      <div className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-300 ${
        drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}>
        {/* Backdrop overlay */}
        <div
          onClick={() => setDrawerOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Drawer container */}
        <div className={`relative w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl h-full flex flex-col justify-between text-slate-200 transform transition-transform duration-300 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
          {selectedTask && (
            <>
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
                <div>
                  <span className="text-xs font-mono text-indigo-400 font-bold tracking-wider">
                    #T-{selectedTask.id.slice(0, 8).toUpperCase()}
                  </span>
                  <h3 className="text-lg font-bold text-slate-100 mt-1">Görev Detay Kartı</h3>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="h-9 w-9 rounded-lg hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-200 transition"
                >
                  <i className="fa-solid fa-xmark text-lg" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
                
                {/* Status and Priority Summary */}
                <div className="flex items-center justify-between bg-slate-950/30 p-3 rounded-lg border border-slate-800/40">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Görev Durumu</span>
                    <span
                      style={{ color: (STATUS_CONFIG[selectedTask.status] || {}).color }}
                      className="inline-flex items-center gap-1.5 text-sm font-bold"
                    >
                      <i className={`fa-solid ${(STATUS_CONFIG[selectedTask.status] || {}).icon}`} />
                      {(STATUS_CONFIG[selectedTask.status] || {}).label}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Öncelik</span>
                    <span
                      style={{ color: (PRIORITY_CONFIG[selectedTask.priority] || {}).color }}
                      className="text-sm font-bold flex items-center gap-1"
                    >
                      <i className="fa-solid fa-circle text-[8px]" />
                      {(PRIORITY_CONFIG[selectedTask.priority] || {}).label}
                    </span>
                  </div>
                </div>

                {/* Discrepancy warning banner */}
                {selectedTask.task_type === 'count' && selectedTask.meta?.has_discrepancy && (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3 rounded-lg flex items-start gap-2.5 text-xs">
                    <i className="fa-solid fa-triangle-exclamation text-base mt-0.5" />
                    <div>
                      <h5 className="font-bold">Sayım Farkı Bildirildi</h5>
                      <p className="mt-0.5 text-amber-400/80">
                        Bu sayımda sistem miktarı ile fiziksel miktar arasında fark tespit edilmiştir. Onay veya ret işlemini "Sayım Farkı Onayları" sekmesinden gerçekleştirebilirsiniz.
                      </p>
                    </div>
                  </div>
                )}

                {/* Main details list */}
                <div className="grid grid-cols-2 gap-4 text-sm bg-slate-950/10 p-4 rounded-xl border border-slate-800/50">
                  <div>
                    <span className="text-xs text-slate-500 block">İş Tipi</span>
                    <span className="font-semibold text-slate-200">
                      {(TYPE_CONFIG[selectedTask.task_type] || {}).label || selectedTask.task_type}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Kaynak Belge</span>
                    <span className="font-semibold text-slate-200 uppercase font-mono text-xs">
                      {selectedTask.source_doc_type ? `${selectedTask.source_doc_type.replace('_', ' ')}` : '—'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-slate-500 block">Açıklama</span>
                    <span className="text-slate-300 font-medium">{selectedTask.description || '—'}</span>
                  </div>
                  {selectedTask.meta?.stock_item_id && (
                    <div className="col-span-2 border-t border-slate-800/60 pt-3">
                      <span className="text-xs text-slate-500 block">Ürün / SKU</span>
                      <span className="font-bold text-slate-100 block">
                        {stockItems.get(String(selectedTask.meta.stock_item_id))?.name || 'Bilinmeyen Ürün'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono block">
                        SKU: {stockItems.get(String(selectedTask.meta.stock_item_id))?.sku || '—'}
                      </span>
                    </div>
                  )}
                  {selectedTask.task_type === 'count' ? (
                    <>
                      {selectedTask.meta?.expected_quantity !== undefined && (
                        <div>
                          <span className="text-xs text-slate-500 block">Sistemde Beklenen</span>
                          <span className="font-semibold text-slate-300 text-base">
                            {Number(selectedTask.meta.expected_quantity)} {stockItems.get(String(selectedTask.meta.stock_item_id))?.unit || 'Adet'}
                          </span>
                        </div>
                      )}
                      {selectedTask.meta?.scanned_quantity !== undefined && (
                        <div>
                          <span className="text-xs text-slate-500 block">Sayılan Miktar</span>
                          <span className="font-bold text-slate-100 text-base">
                            {Number(selectedTask.meta.scanned_quantity)} {stockItems.get(String(selectedTask.meta.stock_item_id))?.unit || 'Adet'}
                          </span>
                        </div>
                      )}
                      {selectedTask.meta?.difference_qty !== undefined && (
                        <div className="col-span-2 border-t border-slate-850 pt-2">
                          <span className="text-xs text-slate-500 block">Fark Miktarı</span>
                          <span className={`font-bold text-lg ${Number(selectedTask.meta.difference_qty) > 0 ? 'text-emerald-400' : Number(selectedTask.meta.difference_qty) < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                            {Number(selectedTask.meta.difference_qty) > 0 ? '+' : ''}{Number(selectedTask.meta.difference_qty)} {stockItems.get(String(selectedTask.meta.stock_item_id))?.unit || 'Adet'}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {selectedTask.meta?.quantity && (
                        <div>
                          <span className="text-xs text-slate-500 block">İstenen Miktar</span>
                          <span className="font-bold text-slate-100 text-lg">
                            {Number(selectedTask.meta.quantity)} {stockItems.get(String(selectedTask.meta.stock_item_id))?.unit || 'Adet'}
                          </span>
                        </div>
                      )}
                      {selectedTask.meta?.picked_qty !== undefined && (
                        <div>
                          <span className="text-xs text-slate-500 block">Toplanan Miktar</span>
                          <span className="font-bold text-emerald-400 text-lg">
                            {Number(selectedTask.meta.picked_qty)} {stockItems.get(String(selectedTask.meta.stock_item_id))?.unit || 'Adet'}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {(selectedTask.meta?.from_location_id || selectedTask.meta?.location_id) && (
                    <div>
                      <span className="text-xs text-slate-500 block">Kaynak Lokasyon</span>
                      <span className="font-semibold text-slate-200">
                        {formatAddress(locations.get(String(selectedTask.meta.from_location_id || selectedTask.meta.location_id)))}
                      </span>
                    </div>
                  )}
                  {selectedTask.meta?.target_location_id && (
                    <div>
                      <span className="text-xs text-slate-500 block">Hedef Lokasyon Önerisi</span>
                      <span className="font-semibold text-slate-200">
                        {formatAddress(locations.get(String(selectedTask.meta.target_location_id)))}
                      </span>
                    </div>
                  )}
                  {selectedTask.meta?.lpn_id && (
                    <div>
                      <span className="text-xs text-slate-500 block">LPN / Palet</span>
                      <span className="font-mono text-slate-300 font-bold">
                        {lpns.get(String(selectedTask.meta.lpn_id))?.lpn_code || '—'}
                      </span>
                    </div>
                  )}
                  {(selectedTask.meta?.lot_number || selectedTask.meta?.expiration_date) && (
                    <div>
                      <span className="text-xs text-slate-500 block">Lot / SKT Bilgisi</span>
                      <span className="text-xs block text-slate-300">
                        {selectedTask.meta.lot_number ? `Lot: ${selectedTask.meta.lot_number}` : ''}
                        {selectedTask.meta.expiration_date ? ` | SKT: ${selectedTask.meta.expiration_date}` : ''}
                      </span>
                    </div>
                  )}
                </div>

                {/* Audit Timeline / Events section */}
                <div className="flex flex-col gap-3">
                  <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <i className="fa-solid fa-clock-rotate-left" />
                    Görev Hareket Günlüğü (Timeline)
                  </h4>
                  {eventsLoading ? (
                    <div className="py-4 text-center text-xs text-slate-500">
                      <i className="fa-solid fa-circle-notch fa-spin text-indigo-500 mr-2" />
                      Yükleniyor...
                    </div>
                  ) : events.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-600 bg-slate-950/20 rounded-lg">
                      Kayıtlı olay bulunamadı.
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-800 pl-4 ml-2 flex flex-col gap-5 py-2">
                      {events.map((ev) => {
                        const eventDate = new Date(ev.created_at).toLocaleString('tr-TR')
                        return (
                          <div key={ev.id} className="relative">
                            {/* Dot icon */}
                            <span className="absolute -left-[23px] top-1 bg-slate-900 border border-slate-700 h-2.5 w-2.5 rounded-full" />
                            <div className="flex justify-between items-start gap-4">
                              <span className="text-xs font-bold text-slate-200 capitalize">
                                {ev.event_type.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono whitespace-nowrap">
                                {eventDate}
                              </span>
                            </div>
                            {ev.personnel_id && (
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                İşlemi Yapan: <span className="font-medium text-slate-300">{ev.personnel_id}</span>
                              </span>
                            )}
                            {ev.payload?.note && (
                              <div className="text-xs text-amber-400/90 mt-1 bg-amber-500/5 border border-amber-500/10 p-2 rounded italic">
                                "{ev.payload.note}"
                              </div>
                            )}
                            {ev.payload?.picked_qty !== undefined && (
                              <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                                Toplanan: {ev.payload.picked_qty} / {ev.payload.requested_qty} adet
                              </span>
                            )}
                            {ev.payload?.counted_qty !== undefined && (
                              <span className="text-[10px] text-slate-405 block mt-0.5 font-mono">
                                Sayılan: {ev.payload.counted_qty} (Beklenen: {ev.payload.expected_qty || 0})
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Controlled Exception Resolution Panel (ONLY shown if status is 'exception') */}
                {selectedTask.status === 'exception' && (
                  <div className="border border-red-900/60 bg-red-950/20 rounded-xl p-4 flex flex-col gap-4 shadow-lg shadow-red-950/10 mt-2">
                    <div className="flex items-start gap-2 text-red-400">
                      <i className="fa-solid fa-triangle-exclamation text-base mt-0.5" />
                      <div>
                        <h4 className="font-bold text-sm">Görev Exception Çözüm Paneli</h4>
                        <p className="text-xs text-red-400/80 mt-0.5">
                          Aşağıda bir çözüm notu girerek görevin durumunu sıfırlayabilir veya iptal edebilirsiniz.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-400">Çözüm / Müdahale Açıklaması *</label>
                      <textarea
                        value={resNote}
                        onChange={(e) => setResNote(e.target.value)}
                        placeholder="Exception çözüm nedenini detaylıca yazın (örn: Raf eksikliği nedeniyle kalan miktar iptal edildi, veya stok doğrulandı yeniden denenecek)..."
                        className="w-full bg-slate-950 border border-slate-800 focus:border-red-500 rounded-lg p-2.5 text-xs text-slate-100 min-h-[80px] outline-none transition duration-200"
                        disabled={submittingRes}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-1">
                      <button
                        onClick={() => handleResolveException('retry')}
                        disabled={submittingRes}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      >
                        <i className="fa-solid fa-arrows-rotate" />
                        Yeniden Dene (Pending)
                      </button>
                      <button
                        onClick={() => handleResolveException('cancel')}
                        disabled={submittingRes}
                        className="bg-red-600 hover:bg-red-500 text-white rounded-lg py-2.5 px-4 text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                      >
                        <i className="fa-solid fa-ban" />
                        Görevi İptal Et
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Yeni Sayım (Cycle Count) Görevi Oluştur"
      >
        <form onSubmit={handleCreateTask} className="flex flex-col gap-4 text-slate-200">
          {loadingModalData ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-indigo-500 mb-2" />
              <span className="text-xs text-slate-400">Veritabanı bilgileri yükleniyor...</span>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hedef Sayım Lokasyonu *</label>
                <select
                  value={formLocationId}
                  onChange={(e) => setFormLocationId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-slate-100 outline-none"
                >
                  <option value="">Lokasyon Seçiniz...</option>
                  {allLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {formatAddress(loc)} ({loc.temperature_class})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">LPN (Palet/Koli) (İsteğe Bağlı)</label>
                <select
                  value={formLpnId}
                  onChange={(e) => setFormLpnId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-slate-100 outline-none"
                >
                  <option value="">LPN Olmadan Sayım (Sadece Ürün)</option>
                  {allLpns.map((lpn) => (
                    <option key={lpn.id} value={lpn.id}>
                      {lpn.lpn_code}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sayılacak Ürün *</label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-slate-100 outline-none"
                >
                  <option value="">Ürün Seçiniz...</option>
                  {allProducts.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.name} (SKU: {prod.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Öncelik</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-slate-100 outline-none"
                  >
                    <option value="low">Düşük</option>
                    <option value="normal">Normal</option>
                    <option value="high">Yüksek</option>
                    <option value="urgent">Kritik</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Görev Atanacak Personel</label>
                  <select
                    value={formAssignedPersonnelId}
                    onChange={(e) => setFormAssignedPersonnelId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-slate-100 outline-none"
                  >
                    <option value="">Atama Yapma (Havuzda Beklesin)</option>
                    {allPersonnel.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} (@{p.username})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Açıklama (İsteğe Bağlı)</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Sayım talimatı veya notu girin..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2.5 text-sm text-slate-100 min-h-[70px] outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4 border-t border-slate-800/60 pt-4">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg text-sm transition"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={savingTask}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingTask && <i className="fa-solid fa-circle-notch fa-spin" />}
                  Görev Oluştur
                </button>
              </div>
            </>
          )}
        </form>
      </Modal>

    </div>
  )
}
