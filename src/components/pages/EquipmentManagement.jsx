import React, { useState, useEffect, useRef } from 'react'
import { db } from '@/lib/db'

const API = import.meta.env.VITE_API_URL || ''

// ── Küçük yardımcılar ────────────────────────────────────────────
const fmt = (n, decimals = 2) =>
  n == null ? '—' : Number(n).toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('tr-TR')
}

const STATUS_LABELS = {
  active: 'Aktif', in_repair: 'Arızada', transferred: 'Transfer', decommissioned: 'Hizmet Dışı'
}
const STATUS_COLORS = {
  active: '#16a34a', in_repair: '#dc2626', transferred: '#d97706', decommissioned: '#6b7280'
}

function StatusBadge({ status }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700,
      background: (STATUS_COLORS[status] || '#6b7280') + '18',
      color: STATUS_COLORS[status] || '#6b7280',
      border: `1px solid ${(STATUS_COLORS[status] || '#6b7280')}40`
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[status] || '#6b7280' }} />
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
        fontWeight: active ? 700 : 500, fontSize: '.85rem',
        background: active ? 'var(--primary, #6366f1)' : 'transparent',
        color: active ? '#fff' : 'var(--text-2, #64748b)',
        transition: 'all .15s'
      }}
    >
      {children}
    </button>
  )
}

// ── TCO / Amortisman Widget ──────────────────────────────────────
function TcoWidget({ instance }) {
  const [tco, setTco] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!instance) return
    setLoading(true)
    fetch(`${API}/api/equipment/instances/${instance.id}/tco`)
      .then(r => r.json())
      .then(d => setTco(d.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [instance?.id])

  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Hesaplanıyor…</div>
  if (!tco) return null

  const dep = tco.depreciation

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* TCO */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Metric label="Toplam Bakım Maliyeti" value={`₺ ${fmt(tco.tco.total_repair_cost_try)}`} color="#ef4444" />
        <Metric label="Bakım Kaydı Sayısı" value={tco.tco.ticket_count} color="#f59e0b" />
        <Metric label="Döviz" value={tco.tco.currency || 'TRY'} color="#64748b" />
      </div>

      {/* Amortisman */}
      {dep ? (
        <div style={{ background: 'var(--card-bg, #fff)', borderRadius: 14, border: '1px solid var(--border-color, #e2e8f0)', padding: 18 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-1, #1e293b)', marginBottom: 14, fontSize: '.9rem' }}>
            📉 Doğrusal Amortisman
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <SmallRow label="Alım Bedeli" value={`${fmt(dep.purchase_price)} ${dep.currency}`} />
            <SmallRow label="Alım Bedeli (TRY)" value={`₺ ${fmt(dep.purchase_price_try)}`} />
            <SmallRow label="Faydalı Ömür" value={`${dep.useful_life_months} ay`} />
            <SmallRow label="Geçen Süre" value={`${dep.months_elapsed} ay`} />
            <SmallRow label="Aylık Amortisman" value={`${fmt(dep.monthly_depreciation)} ${dep.currency}`} />
            <SmallRow label="Birikmiş Amortisman" value={`${fmt(dep.accumulated_depreciation)} ${dep.currency}`} />
            <SmallRow label="Net Defter Değeri" value={`${fmt(dep.book_value)} ${dep.currency}`} highlight />
            <SmallRow label="Defter Değeri (TRY)" value={`₺ ${fmt(dep.book_value_try)}`} highlight />
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '.82rem', color: '#94a3b8', padding: '8px 0' }}>
          Amortisman hesabı için alım tarihi, alım bedeli ve faydalı ömür girilmelidir.
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color }) {
  return (
    <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 12, border: '1px solid var(--border-color,#e2e8f0)', padding: '14px 16px' }}>
      <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: '1.15rem', color: color || 'var(--text-1,#1e293b)' }}>{value}</div>
    </div>
  )
}

function SmallRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{label}</span>
      <span style={{ fontWeight: highlight ? 700 : 500, color: highlight ? 'var(--primary,#6366f1)' : 'var(--text-1,#1e293b)', fontSize: '.85rem' }}>{value}</span>
    </div>
  )
}

// ── Transfer Modal ───────────────────────────────────────────────
function TransferModal({ instance, onClose, onSuccess }) {
  const [branches, setBranches] = useState([])
  const [toLocation, setToLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    db.from('branches').select('id,name').order('name')
      .then(({ data }) => setBranches(data || []))
  }, [])

  const handleSubmit = async () => {
    if (!toLocation) { setErr('Hedef şube seçiniz'); return }
    setSaving(true); setErr('')
    try {
      const r = await fetch(`${API}/api/equipment/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_instance_id: instance.id, to_location_id: toLocation, notes })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message)
      onSuccess()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 18, padding: 28, width: 420, boxShadow: '0 20px 60px #0002' }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 18 }}>Ekipman Transferi</div>
        <div style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 16 }}>
          <b>{instance.definition_name}</b> — {instance.serial_number || 'Seri No Yok'}<br />
          Mevcut Konum: <b>{instance.current_location_id}</b>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Hedef Şube *</label>
          <select value={toLocation} onChange={e => setToLocation(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--input-bg,#f8fafc)' }}>
            <option value="">Şube Seçin</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: '.8rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Notlar</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--input-bg,#f8fafc)', resize: 'none' }} />
        </div>
        {err && <div style={{ color: '#ef4444', fontSize: '.8rem', marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Gönderiliyor…' : 'Transferi Başlat'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Yeni/Düzenle Instance Modal ──────────────────────────────────
function InstanceFormModal({ instance, definitions, onClose, onSuccess }) {
  const [form, setForm] = useState({
    definition_id: instance?.definition_id || '',
    current_location_id: instance?.current_location_id || '',
    serial_number: instance?.serial_number || '',
    status: instance?.status || 'active',
    installed_at: instance?.installed_at ? instance.installed_at.split('T')[0] : '',
    purchase_date: instance?.purchase_date ? instance.purchase_date.split('T')[0] : '',
    purchase_price: instance?.purchase_price || '',
    currency: instance?.currency || 'TRY',
    purchase_exchange_rate: instance?.purchase_exchange_rate || '1',
    legacy_accumulated_depreciation: instance?.legacy_accumulated_depreciation || '0',
    warranty_end_date: instance?.warranty_end_date ? instance.warranty_end_date.split('T')[0] : '',
    notes: instance?.notes || '',
  })
  const [branches, setBranches] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [exchangeLoading, setExchangeLoading] = useState(false)

  useEffect(() => {
    db.from('branches').select('id,name').order('name')
      .then(({ data }) => setBranches(data || []))
  }, [])

  const fetchRate = async () => {
    if (!form.purchase_date || !form.currency || form.currency === 'TRY') {
      setForm(f => ({ ...f, purchase_exchange_rate: '1' })); return
    }
    setExchangeLoading(true)
    try {
      const r = await fetch(`${API}/api/exchange-rate?currency=${form.currency}&date=${form.purchase_date}`)
      const d = await r.json()
      if (d.data?.rate) setForm(f => ({ ...f, purchase_exchange_rate: String(d.data.rate) }))
    } catch { }
    finally { setExchangeLoading(false) }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.definition_id || !form.current_location_id) {
      setErr('Ekipman tanımı ve konum zorunludur'); return
    }
    setSaving(true); setErr('')
    try {
      const body = {
        ...form,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        purchase_exchange_rate: parseFloat(form.purchase_exchange_rate) || 1,
        legacy_accumulated_depreciation: parseFloat(form.legacy_accumulated_depreciation) || 0,
      }
      const url = instance ? `${API}/api/equipment/instances/${instance.id}` : `${API}/api/equipment/instances`
      const r = await fetch(url, {
        method: instance ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message)
      onSuccess()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP']
  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--input-bg,#f8fafc)', fontSize: '.85rem' }
  const labelStyle = { fontSize: '.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: 24 }}>
      <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 18, padding: 28, width: 600, maxWidth: '95vw', boxShadow: '0 20px 60px #0002' }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 20 }}>
          {instance ? 'Ekipman Düzenle' : 'Yeni Ekipman Ekle'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={labelStyle}>Ekipman Tanımı *</label>
            <select value={form.definition_id} onChange={set('definition_id')} style={inputStyle}>
              <option value="">Seçin</option>
              {definitions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Konum (Şube) *</label>
            <select value={form.current_location_id} onChange={set('current_location_id')} style={inputStyle}>
              <option value="">Şube Seçin</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Seri Numarası</label>
            <input value={form.serial_number} onChange={set('serial_number')} style={inputStyle} placeholder="SN-..." />
          </div>

          <div>
            <label style={labelStyle}>Durum</label>
            <select value={form.status} onChange={set('status')} style={inputStyle}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Garanti Bitiş</label>
            <input type="date" value={form.warranty_end_date} onChange={set('warranty_end_date')} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Kurulum Tarihi</label>
            <input type="date" value={form.installed_at} onChange={set('installed_at')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Alım Tarihi</label>
            <input type="date" value={form.purchase_date} onChange={e => { setForm(f => ({ ...f, purchase_date: e.target.value })) }} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Alım Bedeli</label>
            <input type="number" value={form.purchase_price} onChange={set('purchase_price')} style={inputStyle} placeholder="0.00" />
          </div>
          <div>
            <label style={labelStyle}>Döviz Cinsi</label>
            <select value={form.currency} onChange={set('currency')} style={inputStyle}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Alım Kuru (TRY karşılığı)</label>
              <input type="number" value={form.purchase_exchange_rate} onChange={set('purchase_exchange_rate')} style={inputStyle} step="0.0001" />
            </div>
            <button onClick={fetchRate} disabled={exchangeLoading} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--card-bg,#fff)', cursor: 'pointer', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
              {exchangeLoading ? '…' : '🔄 TCMB Kur Al'}
            </button>
          </div>

          <div>
            <label style={labelStyle}>Devreden Amortisman</label>
            <input type="number" value={form.legacy_accumulated_depreciation} onChange={set('legacy_accumulated_depreciation')} style={inputStyle} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>Notlar</label>
            <input value={form.notes} onChange={set('notes')} style={inputStyle} />
          </div>
        </div>

        {err && <div style={{ color: '#ef4444', fontSize: '.8rem', marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary,#6366f1)', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Kaydediliyor…' : (instance ? 'Güncelle' : 'Ekle')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Definition Form Modal ────────────────────────────────────────
function DefinitionFormModal({ def, onClose, onSuccess }) {
  const [form, setForm] = useState({
    name: def?.name || '',
    description: def?.description || '',
    purpose: def?.purpose || '',
    maintenance_period_days: def?.maintenance_period_days || '',
    useful_life_months: def?.useful_life_months || '',
    active: def?.active !== false,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleSubmit = async () => {
    if (!form.name) { setErr('Ekipman adı zorunludur'); return }
    setSaving(true); setErr('')
    try {
      const url = def ? `${API}/api/equipment/definitions/${def.id}` : `${API}/api/equipment/definitions`
      const r = await fetch(url, {
        method: def ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          maintenance_period_days: form.maintenance_period_days ? parseInt(form.maintenance_period_days) : null,
          useful_life_months: form.useful_life_months ? parseInt(form.useful_life_months) : null,
        })
      })
      const d = await r.json()
      if (d.error) throw new Error(d.error.message)
      onSuccess()
    } catch (e) { setErr(e.message) }
    finally { setSaving(false) }
  }

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--input-bg,#f8fafc)', fontSize: '.85rem' }
  const labelStyle = { fontSize: '.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 3 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 18, padding: 28, width: 480, boxShadow: '0 20px 60px #0002' }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem', marginBottom: 20 }}>
          {def ? 'Tanım Düzenle' : 'Yeni Ekipman Tanımı'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}>Ekipman Adı *</label>
            <input value={form.name} onChange={set('name')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Açıklama</label>
            <textarea value={form.description} onChange={set('description')} rows={2} style={{ ...inputStyle, resize: 'none' }} />
          </div>
          <div>
            <label style={labelStyle}>Amaç / Kullanım</label>
            <input value={form.purpose} onChange={set('purpose')} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Bakım Periyodu (gün)</label>
              <input type="number" value={form.maintenance_period_days} onChange={set('maintenance_period_days')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Faydalı Ömür (ay)</label>
              <input type="number" value={form.useful_life_months} onChange={set('useful_life_months')} style={inputStyle} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.active} onChange={set('active')} />
            <span>Aktif</span>
          </label>
        </div>
        {err && <div style={{ color: '#ef4444', fontSize: '.8rem', marginTop: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer' }}>İptal</button>
          <button onClick={handleSubmit} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary,#6366f1)', color: '#fff', fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? '…' : (def ? 'Güncelle' : 'Ekle')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ana Sayfa ───────────────────────────────────────────────────
export default function EquipmentManagement() {
  const [tab, setTab] = useState('instances') // instances | definitions | transfers
  const [instances, setInstances] = useState([])
  const [definitions, setDefinitions] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState(null)
  const [tcoInstance, setTcoInstance] = useState(null)
  const [transferTarget, setTransferTarget] = useState(null)
  const [showInstanceForm, setShowInstanceForm] = useState(false)
  const [editInstance, setEditInstance] = useState(null)
  const [showDefForm, setShowDefForm] = useState(false)
  const [editDef, setEditDef] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvResult, setCsvResult] = useState(null)
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    try {
      const [iRes, dRes, tRes] = await Promise.all([
        fetch(`${API}/api/equipment/instances`).then(r => r.json()),
        fetch(`${API}/api/equipment/definitions`).then(r => r.json()),
        fetch(`${API}/api/equipment/transfers`).then(r => r.json()),
      ])
      setInstances(iRes.data || [])
      setDefinitions(dRes.data || [])
      setTransfers(tRes.data || [])
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filteredInstances = instances.filter(i => {
    const matchSearch = !search || i.definition_name?.toLowerCase().includes(search.toLowerCase()) || i.serial_number?.toLowerCase().includes(search.toLowerCase()) || i.current_location_id?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || i.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleCsvImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvImporting(true); setCsvResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await fetch(`${API}/api/equipment/instances/csv-import`, { method: 'POST', body: formData })
      const d = await r.json()
      setCsvResult(d.data || d.error || { error: 'Bilinmeyen hata' })
      load()
    } catch (e) { setCsvResult({ error: e.message }) }
    finally { setCsvImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handleTransferAction = async (transferId, action) => {
    await fetch(`${API}/api/equipment/transfers/${transferId}/${action}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    load()
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1,#1e293b)' }}>
            🔧 Ekipman Yönetimi
          </h1>
          <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 4 }}>
            {instances.length} kayıtlı ekipman · {definitions.length} tanım · {transfers.filter(t => t.status === 'pending').length} bekleyen transfer
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tab === 'instances' && (
            <>
              <button onClick={() => { setShowInstanceForm(true); setEditInstance(null) }} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--primary,#6366f1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.85rem' }}>
                + Ekipman Ekle
              </button>
              <button onClick={() => window.open(`${API}/api/equipment/instances/csv-template`, '_blank')} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--card-bg,#fff)', cursor: 'pointer', fontSize: '.82rem' }}>
                📥 CSV Şablon
              </button>
              <label style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border-color,#e2e8f0)', background: csvImporting ? '#f1f5f9' : 'var(--card-bg,#fff)', cursor: 'pointer', fontSize: '.82rem', userSelect: 'none' }}>
                {csvImporting ? '⏳ İçe Aktarılıyor…' : '📤 CSV İçe Aktar'}
                <input ref={fileRef} type="file" accept=".csv" hidden onChange={handleCsvImport} />
              </label>
            </>
          )}
          {tab === 'definitions' && (
            <button onClick={() => { setShowDefForm(true); setEditDef(null) }} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'var(--primary,#6366f1)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.85rem' }}>
              + Tanım Ekle
            </button>
          )}
        </div>
      </div>

      {/* CSV sonuç */}
      {csvResult && (
        <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 12, background: csvResult.error_count > 0 ? '#fff7ed' : '#f0fdf4', border: `1px solid ${csvResult.error_count > 0 ? '#fed7aa' : '#bbf7d0'}` }}>
          <div style={{ fontWeight: 700, color: csvResult.error_count > 0 ? '#c2410c' : '#15803d', marginBottom: 4 }}>
            {csvResult.error ? csvResult.error : `✅ ${csvResult.inserted_count} kayıt eklendi${csvResult.error_count > 0 ? `, ${csvResult.error_count} hata` : ''}`}
          </div>
          {csvResult.errors?.map((e, i) => <div key={i} style={{ fontSize: '.78rem', color: '#c2410c' }}>{e}</div>)}
          {csvResult.new_branches?.length > 0 && <div style={{ fontSize: '.78rem', color: '#d97706', marginTop: 4 }}>Bilinmeyen şubeler: {csvResult.new_branches.join(', ')}</div>}
          <button onClick={() => setCsvResult(null)} style={{ marginTop: 8, fontSize: '.75rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Kapat</button>
        </div>
      )}

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--card-bg,#fff)', borderRadius: 12, padding: 4, border: '1px solid var(--border-color,#e2e8f0)', width: 'fit-content' }}>
        <TabBtn active={tab === 'instances'} onClick={() => setTab('instances')}>📦 Envanter</TabBtn>
        <TabBtn active={tab === 'definitions'} onClick={() => setTab('definitions')}>📋 Katalog</TabBtn>
        <TabBtn active={tab === 'transfers'} onClick={() => setTab('transfers')}>
          🔄 Transferler
          {transfers.filter(t => t.status === 'pending').length > 0 && (
            <span style={{ marginLeft: 6, background: '#f59e0b', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: '.7rem' }}>
              {transfers.filter(t => t.status === 'pending').length}
            </span>
          )}
        </TabBtn>
      </div>

      {/* ─── ENVantER TABLOSU ─── */}
      {tab === 'instances' && (
        <div>
          {/* Filtreler */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              placeholder="Ekipman, seri no veya şube ara…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--input-bg,#f8fafc)' }}
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-color,#e2e8f0)', background: 'var(--input-bg,#f8fafc)' }}>
              <option value="">Tüm Durumlar</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Yükleniyor…</div>
          ) : (
            <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 16, border: '1px solid var(--border-color,#e2e8f0)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--table-head-bg,#f8fafc)' }}>
                    {['Ekipman', 'Seri No', 'Konum', 'Durum', 'Garanti', 'Alım', 'İşlemler'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.78rem', fontWeight: 700, color: '#64748b', borderBottom: '1px solid var(--border-color,#e2e8f0)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInstances.map((inst, idx) => {
                    const underWarranty = inst.warranty_end_date && new Date(inst.warranty_end_date) > new Date()
                    return (
                      <tr key={inst.id} style={{ borderBottom: '1px solid var(--border-color,#e2e8f0)', background: idx % 2 === 0 ? 'transparent' : 'var(--table-stripe,#fafafa)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-1,#1e293b)', fontSize: '.88rem' }}>{inst.definition_name}</div>
                          {inst.purpose && <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>{inst.purpose}</div>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>{inst.serial_number || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>{inst.current_location_id}</td>
                        <td style={{ padding: '10px 14px' }}><StatusBadge status={inst.status} /></td>
                        <td style={{ padding: '10px 14px', fontSize: '.78rem' }}>
                          {inst.warranty_end_date ? (
                            <span style={{ color: underWarranty ? '#16a34a' : '#94a3b8', fontWeight: underWarranty ? 700 : 400 }}>
                              {underWarranty ? '✅ ' : ''}{fmtDate(inst.warranty_end_date)}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '.78rem', color: '#475569' }}>
                          {inst.purchase_price ? `${fmt(inst.purchase_price)} ${inst.currency}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setTcoInstance(inst)} title="TCO / Amortisman" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer', fontSize: '.78rem' }}>📊</button>
                            <button onClick={() => setTransferTarget(inst)} title="Transfer" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer', fontSize: '.78rem' }}>🔄</button>
                            <button onClick={() => { setEditInstance(inst); setShowInstanceForm(true) }} title="Düzenle" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer', fontSize: '.78rem' }}>✏️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredInstances.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Kayıt bulunamadı</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─── KATALOG ─── */}
      {tab === 'definitions' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {definitions.map(d => (
            <div key={d.id} style={{ background: 'var(--card-bg,#fff)', borderRadius: 14, border: '1px solid var(--border-color,#e2e8f0)', padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text-1,#1e293b)' }}>{d.name}</div>
                <span style={{ fontSize: '.72rem', padding: '2px 8px', borderRadius: 8, background: d.active ? '#dcfce7' : '#fee2e2', color: d.active ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                  {d.active ? 'Aktif' : 'Pasif'}
                </span>
              </div>
              {d.description && <div style={{ fontSize: '.78rem', color: '#64748b', marginBottom: 8 }}>{d.description}</div>}
              <div style={{ display: 'flex', gap: 10, fontSize: '.75rem', color: '#94a3b8', marginBottom: 12 }}>
                {d.maintenance_period_days && <span>🔧 {d.maintenance_period_days} gün</span>}
                {d.useful_life_months && <span>📅 {d.useful_life_months} ay ömür</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '.75rem', color: '#94a3b8' }}>
                  {instances.filter(i => i.definition_id === d.id).length} cihaz
                </span>
                <button onClick={() => { setEditDef(d); setShowDefForm(true) }} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border-color,#e2e8f0)', background: 'transparent', cursor: 'pointer', fontSize: '.78rem' }}>Düzenle</button>
              </div>
            </div>
          ))}
          {definitions.length === 0 && <div style={{ padding: 32, color: '#94a3b8', fontSize: '.85rem', gridColumn: '1/-1', textAlign: 'center' }}>Henüz ekipman tanımı yok</div>}
        </div>
      )}

      {/* ─── TRANSFERLER ─── */}
      {tab === 'transfers' && (
        <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 16, border: '1px solid var(--border-color,#e2e8f0)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-head-bg,#f8fafc)' }}>
                {['Ekipman', 'Gönderen', 'Alıcı', 'Durum', 'Tarih', 'İşlem'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.78rem', fontWeight: 700, color: '#64748b', borderBottom: '1px solid var(--border-color,#e2e8f0)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transfers.map((t, idx) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color,#e2e8f0)', background: idx % 2 === 0 ? 'transparent' : 'var(--table-stripe,#fafafa)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '.85rem' }}>{t.definition_name}</td>
                  <td style={{ padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>{t.from_location_id}</td>
                  <td style={{ padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>{t.to_location_id}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 10, fontSize: '.75rem', fontWeight: 700, background: t.status === 'completed' ? '#dcfce7' : t.status === 'rejected' ? '#fee2e2' : '#fef9c3', color: t.status === 'completed' ? '#16a34a' : t.status === 'rejected' ? '#dc2626' : '#a16207' }}>
                      {t.status === 'pending' ? 'Bekliyor' : t.status === 'completed' ? 'Tamamlandı' : 'Reddedildi'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '.78rem', color: '#94a3b8' }}>{fmtDate(t.transferred_at || t.created_at)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {t.status === 'pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleTransferAction(t.id, 'complete')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '.75rem', fontWeight: 700 }}>Onayla</button>
                        <button onClick={() => handleTransferAction(t.id, 'reject')} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', fontSize: '.75rem', fontWeight: 700 }}>Reddet</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Transfer kaydı yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TCO MODAL ─── */}
      {tcoInstance && (
        <div style={{ position: 'fixed', inset: 0, background: '#0006', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: 'var(--card-bg,#fff)', borderRadius: 18, padding: 28, width: 600, maxWidth: '95vw', boxShadow: '0 20px 60px #0002', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>📊 TCO & Amortisman</div>
                <div style={{ fontSize: '.8rem', color: '#64748b' }}>{tcoInstance.definition_name} · {tcoInstance.serial_number || 'Seri Yok'}</div>
              </div>
              <button onClick={() => setTcoInstance(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>
            <TcoWidget instance={tcoInstance} />
          </div>
        </div>
      )}

      {/* Modaller */}
      {transferTarget && (
        <TransferModal instance={transferTarget} onClose={() => setTransferTarget(null)} onSuccess={() => { setTransferTarget(null); load() }} />
      )}
      {showInstanceForm && (
        <InstanceFormModal instance={editInstance} definitions={definitions} onClose={() => { setShowInstanceForm(false); setEditInstance(null) }} onSuccess={() => { setShowInstanceForm(false); setEditInstance(null); load() }} />
      )}
      {showDefForm && (
        <DefinitionFormModal def={editDef} onClose={() => { setShowDefForm(false); setEditDef(null) }} onSuccess={() => { setShowDefForm(false); setEditDef(null); load() }} />
      )}
    </div>
  )
}
