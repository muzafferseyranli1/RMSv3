import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatAddress(loc) {
  const parts = [
    loc.zone_code,
    loc.aisle ? `K${loc.aisle}` : null,
    loc.rack ? `R${loc.rack}` : null,
    loc.level ? `S${loc.level}` : null,
    loc.bin ? `G${loc.bin}` : null,
  ].filter(Boolean)
  return parts.join('-') || '—'
}

const TEMP_CONFIG = {
  Ambient:  { label: 'Kuru/Oda Sıcaklığı', color: '#2563eb', bg: 'rgba(37,99,235,.12)', icon: 'fa-box' },
  Chilled:  { label: 'Soğuk (+2/+8°C)',     color: '#0d9488', bg: 'rgba(13,148,136,.12)', icon: 'fa-snowflake' },
  Frozen:   { label: 'Dondurulmuş (-18°C)', color: '#7c3aed', bg: 'rgba(124,58,237,.12)', icon: 'fa-icicles' },
}

const USAGE_CONFIG = {
  RESERVE:   { label: 'Rezerve Alan',  color: '#64748b', icon: 'fa-warehouse' },
  PICK_FACE: { label: 'Toplama Yüzü', color: '#f97316', icon: 'fa-hand-pointer' },
}

const EMPTY_FORM = {
  branch_id: '',
  zone_code: '',
  aisle: '',
  rack: '',
  level: '',
  bin: '',
  temperature_class: 'Ambient',
  usage_type: 'RESERVE',
  is_active: true,
}

function getAllAnadepoFromTree(tree) {
  const result = []
  function walk(nodes) {
    for (const n of nodes || []) {
      if (n.type === 'anadepo' && n.id && n.name) result.push({ id: String(n.id), name: n.name })
      walk(n.children || [])
    }
  }
  walk(tree)
  return result
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TempBadge({ value }) {
  const cfg = TEMP_CONFIG[value] || TEMP_CONFIG.Ambient
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}33`,
      borderRadius: 99, padding: '2px 8px',
      fontSize: '.7rem', fontWeight: 700,
    }}>
      <i className={`fa-solid ${cfg.icon}`} style={{ fontSize: '.6rem' }} />
      {cfg.label}
    </span>
  )
}

function UsageBadge({ value }) {
  const cfg = USAGE_CONFIG[value] || USAGE_CONFIG.RESERVE
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      color: cfg.color, fontSize: '.7rem', fontWeight: 700,
    }}>
      <i className={`fa-solid ${cfg.icon}`} />
      {cfg.label}
    </span>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function WmsLocations() {
  const toast = useToast()
  const { branches: workspaceBranches } = useWorkspace()

  const [locations, setLocations] = useState([])
  const [depots, setDepots] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterDepot, setFilterDepot] = useState('')
  const [filterZone, setFilterZone] = useState('')
  const [filterTemp, setFilterTemp] = useState('')
  const [filterActive, setFilterActive] = useState(true)
  const [search, setSearch] = useState('')

  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: locs }, { data: ct }] = await Promise.all([
        db.from('warehouse_locations').select('*').order('zone_code').order('aisle').order('rack').order('level').order('bin'),
        db.from('settings').select('value').eq('key', 'company_tree').single(),
      ])
      setLocations(locs || [])
      setDepots(getAllAnadepoFromTree(ct?.value || []))
    } catch (e) {
      toast('Lokasyonlar yüklenemedi: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const zones = useMemo(() => [...new Set(locations.map(l => l.zone_code).filter(Boolean))].sort(), [locations])

  const filtered = useMemo(() => {
    return locations.filter(l => {
      if (filterActive && !l.is_active) return false
      if (!filterActive && l.is_active) return false
      if (filterDepot && l.branch_id !== filterDepot) return false
      if (filterZone && l.zone_code !== filterZone) return false
      if (filterTemp && l.temperature_class !== filterTemp) return false
      if (search) {
        const q = search.toLowerCase()
        const addr = formatAddress(l).toLowerCase()
        if (!addr.includes(q) && !(l.zone_code || '').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [locations, filterDepot, filterZone, filterTemp, filterActive, search])

  const depotName = id => depots.find(d => d.id === id)?.name || id

  function openAdd() {
    setForm({ ...EMPTY_FORM, branch_id: depots[0]?.id || '' })
    setEditId(null)
    setModal(true)
  }

  function openEdit(loc) {
    setForm({
      branch_id: loc.branch_id || '',
      zone_code: loc.zone_code || '',
      aisle: loc.aisle || '',
      rack: loc.rack || '',
      level: loc.level || '',
      bin: loc.bin || '',
      temperature_class: loc.temperature_class || 'Ambient',
      usage_type: loc.usage_type || 'RESERVE',
      is_active: loc.is_active !== false,
    })
    setEditId(loc.id)
    setModal(true)
  }

  async function save() {
    if (!form.branch_id) { toast('Ana Depo seçin', 'error'); return }
    if (!form.zone_code.trim()) { toast('Bölge kodu zorunludur', 'error'); return }

    setSaving(true)
    try {
      const payload = {
        branch_id: form.branch_id,
        zone_code: form.zone_code.trim().toUpperCase(),
        aisle: form.aisle.trim() || null,
        rack: form.rack.trim() || null,
        level: form.level.trim() || null,
        bin: form.bin.trim() || null,
        temperature_class: form.temperature_class,
        usage_type: form.usage_type,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      }

      if (editId) {
        const { error } = await db.from('warehouse_locations').update(payload).eq('id', editId)
        if (error) throw error
        toast('Lokasyon güncellendi', 'success')
      } else {
        const { error } = await db.from('warehouse_locations').insert(payload)
        if (error) throw error
        toast('Lokasyon eklendi', 'success')
      }
      setModal(false)
      load()
    } catch (e) {
      toast('Kaydedilemedi: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(loc) {
    const { error } = await db.from('warehouse_locations').delete().eq('id', loc.id)
    if (error) toast('Silinemedi: ' + error.message, 'error')
    else { toast('Lokasyon silindi', 'info'); load() }
    setConfirm(null)
  }

  async function toggleActive(loc) {
    const { error } = await db.from('warehouse_locations').update({ is_active: !loc.is_active }).eq('id', loc.id)
    if (error) toast('Güncellenemedi', 'error')
    else load()
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const groupedByZone = useMemo(() => {
    const groups = {}
    for (const loc of filtered) {
      const zone = loc.zone_code || '(Bölgesiz)'
      if (!groups[zone]) groups[zone] = []
      groups[zone].push(loc)
    }
    return groups
  }, [filtered])

  return (
    <div className="page-enter">
      <Header
        title="WMS Lokasyonlar"
        subtitle={`${filtered.length} lokasyon`}
        actions={<AddButton onClick={openAdd} label="Lokasyon Ekle" />}
      />

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.75rem', pointerEvents: 'none' }} />
          <input className="f-input" style={{ paddingLeft: 30 }} placeholder="Adres ara…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="f-input" style={{ flex: '1 1 160px', minWidth: 140 }} value={filterDepot} onChange={e => setFilterDepot(e.target.value)}>
          <option value="">Tüm Depolar</option>
          {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="f-input" style={{ flex: '1 1 130px', minWidth: 110 }} value={filterZone} onChange={e => setFilterZone(e.target.value)}>
          <option value="">Tüm Bölgeler</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <select className="f-input" style={{ flex: '1 1 160px', minWidth: 140 }} value={filterTemp} onChange={e => setFilterTemp(e.target.value)}>
          <option value="">Tüm Sıcaklık Sınıfları</option>
          {Object.entries(TEMP_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.83rem', fontWeight: 600, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={filterActive} onChange={e => setFilterActive(e.target.checked)} style={{ accentColor: '#6366f1' }} />
          Sadece Aktif
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…
        </div>
      ) : Object.keys(groupedByZone).length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-map-location-dot" style={{ fontSize: 32, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Lokasyon bulunamadı</div>
          <div style={{ fontSize: '.83rem' }}>Yeni lokasyon ekleyerek başlayın</div>
          <button className="btn-p" style={{ marginTop: 16 }} onClick={openAdd}>
            <i className="fa-solid fa-plus" /> Lokasyon Ekle
          </button>
        </div>
      ) : (
        Object.entries(groupedByZone).map(([zone, locs]) => (
          <div key={zone} className="card" style={{ marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', background: 'rgba(99,102,241,.06)', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-layer-group" style={{ color: '#6366f1', fontSize: '.8rem' }} />
              <span style={{ fontWeight: 800, color: '#334155', fontSize: '.85rem' }}>Bölge: {zone}</span>
              <span style={{ fontSize: '.72rem', color: '#94a3b8', fontWeight: 600 }}>{locs.length} lokasyon</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Adres', 'Depo', 'Sıcaklık', 'Kullanım', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {locs.map(loc => (
                  <tr key={loc.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: loc.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a', fontSize: '.88rem', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>
                        {formatAddress(loc)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>{depotName(loc.branch_id)}</td>
                    <td style={{ padding: '10px 14px' }}><TempBadge value={loc.temperature_class} /></td>
                    <td style={{ padding: '10px 14px' }}><UsageBadge value={loc.usage_type} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <label className="tog" title={loc.is_active ? 'Aktif — pasif yap' : 'Pasif — aktif yap'} style={{ cursor: 'pointer' }}>
                        <input type="checkbox" checked={loc.is_active} onChange={() => toggleActive(loc)} />
                        <span className="tog-sl" />
                      </label>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="ico-btn" onClick={() => openEdit(loc)} title="Düzenle"><i className="fa-solid fa-pen" /></button>
                        <button className="ico-btn del" onClick={() => setConfirm(loc)} title="Sil"><i className="fa-solid fa-trash" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Lokasyon Düzenle' : 'Yeni Lokasyon'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="f-label">Ana Depo <span style={{ color: '#ef4444' }}>*</span></label>
              <SearchableSelect
                value={form.branch_id}
                onChange={v => set('branch_id', v)}
                options={depots.map(d => ({ value: d.id, label: d.name }))}
                placeholder="Depo seçin…"
              />
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Adres Bilgisi</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 10 }}>
                {[
                  { key: 'zone_code', label: 'Bölge *', placeholder: 'A' },
                  { key: 'aisle', label: 'Koridor', placeholder: '01' },
                  { key: 'rack', label: 'Raf', placeholder: 'B' },
                  { key: 'level', label: 'Seviye', placeholder: '03' },
                  { key: 'bin', label: 'Göz', placeholder: '02' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="f-label">{f.label}</label>
                    <input className="f-input" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                      value={form[f.key]} onChange={e => set(f.key, e.target.value)}
                      placeholder={f.placeholder} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, padding: '7px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontFamily: 'monospace', fontWeight: 700, color: '#334155', fontSize: '.9rem' }}>
                <i className="fa-solid fa-location-dot" style={{ color: '#6366f1', marginRight: 8 }} />
                {formatAddress({ zone_code: form.zone_code, aisle: form.aisle, rack: form.rack, level: form.level, bin: form.bin })}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="f-label">Sıcaklık Sınıfı</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(TEMP_CONFIG).map(([k, v]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${form.temperature_class === k ? v.color : '#e2e8f0'}`, background: form.temperature_class === k ? v.bg : '#fff' }}>
                      <input type="radio" name="temp_class" value={k} checked={form.temperature_class === k} onChange={() => set('temperature_class', k)} style={{ accentColor: v.color }} />
                      <i className={`fa-solid ${v.icon}`} style={{ color: v.color, fontSize: '.75rem' }} />
                      <span style={{ fontSize: '.82rem', fontWeight: 600, color: form.temperature_class === k ? v.color : '#475569' }}>{v.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="f-label">Kullanım Tipi</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(USAGE_CONFIG).map(([k, v]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${form.usage_type === k ? v.color : '#e2e8f0'}`, background: form.usage_type === k ? 'rgba(0,0,0,.04)' : '#fff' }}>
                      <input type="radio" name="usage_type" value={k} checked={form.usage_type === k} onChange={() => set('usage_type', k)} style={{ accentColor: v.color }} />
                      <i className={`fa-solid ${v.icon}`} style={{ color: v.color, fontSize: '.75rem' }} />
                      <span style={{ fontSize: '.82rem', fontWeight: 600, color: form.usage_type === k ? v.color : '#475569' }}>{v.label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.83rem', color: '#475569' }}>
                    <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} style={{ width: 16, height: 16, accentColor: '#10b981' }} />
                    Aktif lokasyon
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-g" onClick={() => setModal(false)}>İptal</button>
              <button className="btn-p" onClick={save} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
                {editId ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm ? formatAddress(confirm) : ''}" silinsin mi?`}
        desc="Bu lokasyona atanmış stok hareketleri etkilenebilir. İşlem geri alınamaz."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
