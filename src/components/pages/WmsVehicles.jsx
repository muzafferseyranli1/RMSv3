import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import { db, buildApiUrl } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'

// ─── Constants & Configuration ───────────────────────────────────────────────

const VEHICLE_TYPES = {
  truck: { label: 'Kamyon', icon: 'fa-truck' },
  van: { label: 'Panelvan', icon: 'fa-van-shuttle' },
  pickup: { label: 'Pikap', icon: 'fa-truck-pickup' },
  container: { label: 'Konteyner', icon: 'fa-box' },
  other: { label: 'Diğer', icon: 'fa-truck-flatbed' },
}

const TEMP_CLASSES = {
  dry: { label: 'Kuru / Standart', color: '#2563eb', bg: 'rgba(37,99,235,.12)', icon: 'fa-box' },
  cold: { label: 'Soğuk (+2 / +8°C)', color: '#0d9488', bg: 'rgba(13,148,136,.12)', icon: 'fa-snowflake' },
  frozen: { label: 'Dondurulmuş (-18°C)', color: '#7c3aed', bg: 'rgba(124,58,237,.12)', icon: 'fa-icicles' },
  multi_temp: { label: 'Çoklu Sıcaklık (Multi-Temp)', color: '#ea580c', bg: 'rgba(234,88,12,.12)', icon: 'fa-arrows-split-up-and-left' },
}

const EMPTY_FORM = {
  plate_number: '',
  vehicle_code: '',
  display_name: '',
  model: '',
  vehicle_type: 'truck',
  temperature_class: 'dry',
  max_volume_m3: '',
  max_weight_kg: '',
  inner_length_cm: '',
  inner_width_cm: '',
  inner_height_cm: '',
  driver_name: '',
  driver_phone: '',
  branch_id: '',
  capacity_notes: '',
  active: true,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAllAnadepoFromTree(tree) {
  const result = []
  function walk(nodes) {
    for (const n of nodes || []) {
      if (n.type === 'anadepo' && n.id && n.name) {
        result.push({ id: String(n.id), name: n.name })
      }
      walk(n.children || [])
    }
  }
  walk(tree)
  return result
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WmsVehicles() {
  const toast = useToast()
  const { branches: workspaceBranches } = useWorkspace()

  const [vehicles, setVehicles] = useState([])
  const [depots, setDepots] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [filterDepot, setFilterDepot] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterTemp, setFilterTemp] = useState('')
  const [filterActive, setFilterActive] = useState('all') // 'all', 'active', 'inactive'
  const [search, setSearch] = useState('')

  // Modal & Form States
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  // Fetch Vehicles
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Get all vehicles
      const res = await fetch(buildApiUrl('/api/wms/vehicles'))
      const result = await res.json()
      if (result.error) throw new Error(result.error.message)
      setVehicles(result.data || [])

      // Get depots for branch selection
      const { data: ct } = await db.from('settings').select('value').eq('key', 'company_tree').single()
      setDepots(getAllAnadepoFromTree(ct?.value || []))
    } catch (err) {
      toast('Araçlar yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Get depot name
  const depotName = id => depots.find(d => d.id === id)?.name || 'Merkez Genel'

  // Calculated Volume from inner dimensions
  const calculatedVolume = useMemo(() => {
    const l = Number(form.inner_length_cm) || 0
    const w = Number(form.inner_width_cm) || 0
    const h = Number(form.inner_height_cm) || 0
    if (l > 0 && w > 0 && h > 0) {
      return Number(((l * w * h) / 1000000).toFixed(4))
    }
    return 0
  }, [form.inner_length_cm, form.inner_width_cm, form.inner_height_cm])

  // Is there a mismatch between entered volume and calculated volume?
  const hasVolumeMismatch = useMemo(() => {
    if (calculatedVolume > 0 && form.max_volume_m3 !== '') {
      const entered = Number(form.max_volume_m3) || 0
      return Math.abs(entered - calculatedVolume) > 0.01
    }
    return false
  }, [calculatedVolume, form.max_volume_m3])

  // Auto-fill volume when dimensions change
  useEffect(() => {
    if (calculatedVolume > 0) {
      setForm(prev => ({
        ...prev,
        max_volume_m3: String(calculatedVolume)
      }))
    }
  }, [calculatedVolume])

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      // Filter Depot
      if (filterDepot && v.branch_id !== filterDepot) return false
      
      // Filter Type
      if (filterType && v.vehicle_type !== filterType) return false

      // Filter Temp Class
      if (filterTemp && v.temperature_class !== filterTemp) return false

      // Filter Active Status
      if (filterActive === 'active' && !v.active) return false
      if (filterActive === 'inactive' && v.active) return false

      // Search (plate, code, display name, driver)
      if (search) {
        const q = search.toLowerCase()
        const matchPlate = (v.plate_number || '').toLowerCase().includes(q)
        const matchCode = (v.vehicle_code || '').toLowerCase().includes(q)
        const matchDisplay = (v.display_name || '').toLowerCase().includes(q)
        const matchDriver = (v.driver_name || '').toLowerCase().includes(q)
        if (!matchPlate && !matchCode && !matchDisplay && !matchDriver) return false
      }

      return true
    })
  }, [vehicles, filterDepot, filterType, filterTemp, filterActive, search])

  // Open modal for new vehicle
  function openAdd() {
    setForm({
      ...EMPTY_FORM,
      branch_id: depots[0]?.id || '',
    })
    setEditId(null)
    setModalOpen(true)
  }

  // Open modal for editing
  function openEdit(v) {
    setForm({
      plate_number: v.plate_number || '',
      vehicle_code: v.vehicle_code || '',
      display_name: v.display_name || '',
      model: v.model || '',
      vehicle_type: v.vehicle_type || 'truck',
      temperature_class: v.temperature_class || 'dry',
      max_volume_m3: v.max_volume_m3 != null ? String(v.max_volume_m3) : '',
      max_weight_kg: v.max_weight_kg != null ? String(v.max_weight_kg) : '',
      inner_length_cm: v.inner_length_cm != null ? String(v.inner_length_cm) : '',
      inner_width_cm: v.inner_width_cm != null ? String(v.inner_width_cm) : '',
      inner_height_cm: v.inner_height_cm != null ? String(v.inner_height_cm) : '',
      driver_name: v.driver_name || '',
      driver_phone: v.driver_phone || '',
      branch_id: v.branch_id || '',
      capacity_notes: v.capacity_notes || '',
      active: v.active !== false,
    })
    setEditId(v.id)
    setModalOpen(true)
  }

  // Handle Input Changes
  function set(key, val) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  // Save Vehicle
  async function save() {
    const plateClean = (form.plate_number || '').trim().replace(/\s+/g, '').toUpperCase()
    if (!plateClean) {
      toast('Plaka numarası zorunludur.', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        plate_number: plateClean,
        vehicle_code: (form.vehicle_code || '').trim() || null,
        display_name: (form.display_name || '').trim() || null,
        model: (form.model || '').trim() || null,
        driver_name: (form.driver_name || '').trim() || null,
        driver_phone: (form.driver_phone || '').trim() || null,
        capacity_notes: (form.capacity_notes || '').trim() || null,
        max_volume_m3: form.max_volume_m3 !== '' ? Number(form.max_volume_m3) : 0,
        max_weight_kg: form.max_weight_kg !== '' ? Number(form.max_weight_kg) : 0,
        inner_length_cm: form.inner_length_cm !== '' ? Number(form.inner_length_cm) : 0,
        inner_width_cm: form.inner_width_cm !== '' ? Number(form.inner_width_cm) : 0,
        inner_height_cm: form.inner_height_cm !== '' ? Number(form.inner_height_cm) : 0,
        branch_id: form.branch_id || null,
      }

      let url = buildApiUrl('/api/wms/vehicles')
      let method = 'POST'
      if (editId) {
        url = buildApiUrl(`/api/wms/vehicles/${editId}`)
        method = 'PUT'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error.message)

      toast(editId ? 'Araç güncellendi.' : 'Araç eklendi.', 'success')
      setModalOpen(false)
      loadData()
    } catch (err) {
      toast('Araç kaydedilemedi: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Toggle Active Status
  async function toggleActive(vehicle) {
    try {
      const nextActive = !vehicle.active
      const url = buildApiUrl(`/api/wms/vehicles/${vehicle.id}`)
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vehicle, active: nextActive }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error.message)

      toast(nextActive ? 'Araç aktifleştirildi.' : 'Araç pasifleştirildi.', 'success')
      loadData()
    } catch (err) {
      toast('Araç durumu güncellenemedi: ' + err.message, 'error')
    }
  }

  // Deactivate (Soft Delete)
  async function performDeactivate(vehicle) {
    try {
      const url = buildApiUrl(`/api/wms/vehicles/${vehicle.id}`)
      const res = await fetch(url, { method: 'DELETE' })
      const result = await res.json()
      if (result.error) throw new Error(result.error.message)

      toast('Araç pasifleştirildi.', 'success')
      loadData()
    } catch (err) {
      toast('Araç silinemedi: ' + err.message, 'error')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="container-fluid" style={{ paddingBottom: 60 }}>
      <Header title="Araç Tanımları" />

      {/* Action / Filter Bar */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', width: 220 }}>
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8', fontSize: '.8rem' }} />
              <input
                type="text"
                className="f-input"
                style={{ paddingLeft: 30 }}
                placeholder="Plaka, şoför veya araç ara…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {/* Depot Filter */}
            <select className="f-input" style={{ width: 160 }} value={filterDepot} onChange={e => setFilterDepot(e.target.value)}>
              <option value="">Tüm Depolar</option>
              {depots.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            {/* Type Filter */}
            <select className="f-input" style={{ width: 140 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Tüm Tipler</option>
              {Object.entries(VEHICLE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            {/* Temperature Filter */}
            <select className="f-input" style={{ width: 150 }} value={filterTemp} onChange={e => setFilterTemp(e.target.value)}>
              <option value="">Tüm Sıcaklık Sınıfları</option>
              {Object.entries(TEMP_CLASSES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            {/* Active Status Filter */}
            <select className="f-input" style={{ width: 130 }} value={filterActive} onChange={e => setFilterActive(e.target.value)}>
              <option value="all">Tüm Durumlar</option>
              <option value="active">Aktifler</option>
              <option value="inactive">Pasifler</option>
            </select>
          </div>

          <AddButton onClick={openAdd} label="Yeni Araç Ekle" />
        </div>
      </div>

      {/* Grid / List */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Araçlar yükleniyor…
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-truck" style={{ fontSize: 32, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Araç bulunamadı</div>
          <div style={{ fontSize: '.83rem' }}>Arama veya filtre kriterlerinizi değiştirin veya yeni bir araç ekleyin.</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Plaka / Kod', 'Tip / Model', 'Bağlı Depo', 'Sıcaklık Sınıfı', 'Kapasite (Hacim / Ağırlık)', 'Şoför', 'Durum', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map(v => {
                const typeCfg = VEHICLE_TYPES[v.vehicle_type] || VEHICLE_TYPES.truck
                const tempCfg = TEMP_CLASSES[v.temperature_class] || TEMP_CLASSES.dry
                const hasCapacity = v.max_volume_m3 > 0 || v.max_weight_kg > 0

                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: v.active ? 1 : 0.6, transition: 'opacity 0.2s' }}>
                    
                    {/* Plaka & Kod */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem', letterSpacing: '.02em' }}>{v.plate_number}</span>
                        {v.vehicle_code && <span style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>Kod: {v.vehicle_code}</span>}
                      </div>
                    </td>

                    {/* Tip & Model */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: '#f1f5f9', color: '#475569' }}>
                          <i className={`fa-solid ${typeCfg.icon}`} />
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>{typeCfg.label}</span>
                          {v.model && <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{v.model}</span>}
                        </div>
                      </div>
                    </td>

                    {/* Depo */}
                    <td style={{ padding: '14px 16px', fontSize: '.8rem', color: '#475569', fontWeight: 500 }}>
                      {depotName(v.branch_id)}
                    </td>

                    {/* Sıcaklık */}
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: tempCfg.bg, color: tempCfg.color,
                        borderRadius: 8, padding: '4px 10px',
                        fontSize: '.75rem', fontWeight: 700,
                      }}>
                        <i className={`fa-solid ${tempCfg.icon}`} style={{ fontSize: '.7rem' }} />
                        {tempCfg.label}
                      </span>
                    </td>

                    {/* Kapasite */}
                    <td style={{ padding: '14px 16px' }}>
                      {hasCapacity ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {v.max_volume_m3 > 0 && (
                            <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#1e293b' }}>
                              <i className="fa-solid fa-cube" style={{ color: '#94a3b8', marginRight: 4 }} />
                              {v.max_volume_m3} m³
                            </span>
                          )}
                          {v.max_weight_kg > 0 && (
                            <span style={{ fontSize: '.78rem', fontWeight: 700, color: '#1e293b' }}>
                              <i className="fa-solid fa-weight-hanging" style={{ color: '#94a3b8', marginRight: 4 }} />
                              {v.max_weight_kg} kg
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: 'rgba(245,158,11,.12)', color: '#d97706',
                          borderRadius: 8, padding: '4px 8px', fontSize: '.7rem', fontWeight: 700
                        }}>
                          <i className="fa-solid fa-triangle-exclamation" />
                          Kapasite Eksik
                        </span>
                      )}
                    </td>

                    {/* Şoför */}
                    <td style={{ padding: '14px 16px' }}>
                      {v.driver_name ? (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155' }}>{v.driver_name}</span>
                          {v.driver_phone && <span style={{ fontSize: '.72rem', color: '#64748b' }}><i className="fa-solid fa-phone" style={{ fontSize: '.6rem', marginRight: 2 }} /> {v.driver_phone}</span>}
                        </div>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: '.78rem', fontStyle: 'italic' }}>Atanmamış</span>
                      )}
                    </td>

                    {/* Durum */}
                    <td style={{ padding: '14px 16px' }}>
                      <label className="tog" title={v.active ? 'Aktif — pasifleştir' : 'Pasif — aktifleştir'} style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={v.active} onChange={() => toggleActive(v)} />
                        <span className="tog-sl" />
                      </label>
                    </td>

                    {/* Aksiyonlar */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="ico-btn" onClick={() => openEdit(v)} title="Düzenle">
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button className="ico-btn del" onClick={() => setConfirmDelete(v)} title="Pasifleştir (Sil)">
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </td>

                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Araç Tanımı Düzenle' : 'Yeni Araç Tanımla'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Row 1: Plaka & Kod */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Plaka Numarası <span style={{ color: '#ef4444' }}>*</span></label>
              <input
                type="text"
                className="f-input"
                placeholder="Örn: 34ABC123"
                value={form.plate_number}
                onChange={e => set('plate_number', e.target.value)}
              />
            </div>
            <div>
              <label className="f-label">Araç Kodu</label>
              <input
                type="text"
                className="f-input"
                placeholder="Örn: ARC-01"
                value={form.vehicle_code}
                onChange={e => set('vehicle_code', e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Tanım & Model */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Görünen Ad / Tanım</label>
              <input
                type="text"
                className="f-input"
                placeholder="Örn: Merkez Kamyon - 1"
                value={form.display_name}
                onChange={e => set('display_name', e.target.value)}
              />
            </div>
            <div>
              <label className="f-label">Marka / Model</label>
              <input
                type="text"
                className="f-input"
                placeholder="Örn: Ford Cargo"
                value={form.model}
                onChange={e => set('model', e.target.value)}
              />
            </div>
          </div>

          {/* Row 3: Tip, Sıcaklık Sınıfı & Merkez Depo */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Araç Tipi</label>
              <select className="f-input" value={form.vehicle_type} onChange={e => set('vehicle_type', e.target.value)}>
                {Object.entries(VEHICLE_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="f-label">Sıcaklık Sınıfı</label>
              <select className="f-input" value={form.temperature_class} onChange={e => set('temperature_class', e.target.value)}>
                {Object.entries(TEMP_CLASSES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="f-label">Bağlı Olduğu Depo (Şube)</label>
            <SearchableSelect
              value={form.branch_id}
              onChange={v => set('branch_id', v)}
              options={[{ value: '', label: 'Merkez / Genel' }, ...depots.map(d => ({ value: d.id, label: d.name }))]}
              placeholder="Depo seçin…"
            />
          </div>

          {/* Row 4: İç Ölçüler (Auto volume calculation) */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
              <i className="fa-solid fa-ruler-combined" style={{ marginRight: 4 }} />
              İç Kasa Ölçüleri (Cm) & Hacim
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label className="f-label" style={{ fontSize: '.68rem' }}>İç Uzunluk (cm)</label>
                <input
                  type="number"
                  className="f-input"
                  placeholder="Boy"
                  value={form.inner_length_cm}
                  onChange={e => set('inner_length_cm', e.target.value)}
                />
              </div>
              <div>
                <label className="f-label" style={{ fontSize: '.68rem' }}>İç Genişlik (cm)</label>
                <input
                  type="number"
                  className="f-input"
                  placeholder="En"
                  value={form.inner_width_cm}
                  onChange={e => set('inner_width_cm', e.target.value)}
                />
              </div>
              <div>
                <label className="f-label" style={{ fontSize: '.68rem' }}>İç Yükseklik (cm)</label>
                <input
                  type="number"
                  className="f-input"
                  placeholder="Yükseklik"
                  value={form.inner_height_cm}
                  onChange={e => set('inner_height_cm', e.target.value)}
                />
              </div>
            </div>

            {calculatedVolume > 0 && (
              <div style={{ fontSize: '.72rem', color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fa-solid fa-cube" style={{ color: '#6366f1' }} />
                Boyutlara göre hesaplanan hacim: <strong style={{ color: '#0f172a' }}>{calculatedVolume} m³</strong>
              </div>
            )}
          </div>

          {/* Row 5: Kapasite Sınırları */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Maksimum Hacim Kapasitesi (m³)</label>
              <input
                type="number"
                step="0.0001"
                className="f-input"
                placeholder="Örn: 12.5"
                value={form.max_volume_m3}
                onChange={e => set('max_volume_m3', e.target.value)}
              />
            </div>
            <div>
              <label className="f-label">Maksimum Taşıma Ağırlığı (kg)</label>
              <input
                type="number"
                className="f-input"
                placeholder="Örn: 3500"
                value={form.max_weight_kg}
                onChange={e => set('max_weight_kg', e.target.value)}
              />
            </div>
          </div>

          {/* Volume Mismatch warning alert */}
          {hasVolumeMismatch && (
            <div style={{
              background: 'rgba(245,158,11,.1)', color: '#a16207', border: '1px solid rgba(245,158,11,.22)',
              borderRadius: 8, padding: '10px 12px', fontSize: '.78rem', display: 'flex', alignItems: 'start', gap: 8
            }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginTop: 2 }} />
              <div>
                <strong>Hacim Uyuşmazlığı Uyarı:</strong> Girdiğiniz hacim ({form.max_volume_m3} m³), kasa boyutlarından hesaplanan hacimden ({calculatedVolume} m³) farklıdır. Devam edebilirsiniz ancak kapasite kontrolleri girdiğiniz hacmi esas alacaktır.
              </div>
            </div>
          )}

          {/* Row 6: Driver Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Şoför Adı Soyadı</label>
              <input
                type="text"
                className="f-input"
                placeholder="Örn: Ahmet Yılmaz"
                value={form.driver_name}
                onChange={e => set('driver_name', e.target.value)}
              />
            </div>
            <div>
              <label className="f-label">Şoför Telefonu</label>
              <input
                type="text"
                className="f-input"
                placeholder="Örn: 05551234567"
                value={form.driver_phone}
                onChange={e => set('driver_phone', e.target.value)}
              />
            </div>
          </div>

          {/* Capacity Notes */}
          <div>
            <label className="f-label">Kapasite ve Araç Notları</label>
            <textarea
              className="f-input"
              rows={2}
              placeholder="Özel yükleme notları veya kısıtlamalar…"
              value={form.capacity_notes}
              onChange={e => set('capacity_notes', e.target.value)}
            />
          </div>

          {/* Active Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="checkbox"
              id="active_cb"
              checked={form.active}
              onChange={e => set('active', e.target.checked)}
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
            <label htmlFor="active_cb" style={{ fontSize: '.8rem', fontWeight: 600, color: '#334155', cursor: 'pointer', userSelect: 'none' }}>
              Bu araç aktif ve sevkıyatlarda kullanılabilir
            </label>
          </div>

        </div>

        {/* Modal Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
          <button className="btn-s" onClick={() => setModalOpen(false)}>İptal</button>
          <button className="btn-p" onClick={save} disabled={saving}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" /> Kaydediliyor</> : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      </Modal>

      {/* Deactivate confirmation dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="Aracı Pasifleştir"
          message={`"${confirmDelete.plate_number}" plakalı aracı pasifleştirmek istediğinizden emin misiniz? Bu araç aktif sevkiyatlarda seçilemeyecektir.`}
          onConfirm={() => performDeactivate(confirmDelete)}
          onClose={() => setConfirmDelete(null)}
          confirmLabel="Pasifleştir"
          confirmClass="danger"
        />
      )}
    </div>
  )
}
