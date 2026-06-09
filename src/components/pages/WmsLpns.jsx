import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:  { label: 'Aktif',      color: '#16a34a', bg: 'rgba(22,163,74,.12)',  icon: 'fa-circle-check'  },
  empty:   { label: 'Boş',        color: '#64748b', bg: 'rgba(100,116,139,.12)', icon: 'fa-circle'        },
  blocked: { label: 'Bloke',      color: '#dc2626', bg: 'rgba(220,38,38,.12)',   icon: 'fa-ban'           },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function formatAddress(loc) {
  if (!loc) return '—'
  const parts = [loc.zone_code, loc.aisle ? `K${loc.aisle}` : null, loc.rack ? `R${loc.rack}` : null, loc.level ? `S${loc.level}` : null, loc.bin ? `G${loc.bin}` : null].filter(Boolean)
  return parts.join('-') || '—'
}

/** GS1-128: "00" (SSCC AI) + 17 rakam + check digit */
function calcGs1CheckDigit(digits17) {
  const d = digits17.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 17; i++) sum += d[i] * (i % 2 === 0 ? 3 : 1)
  return (10 - (sum % 10)) % 10
}

function generateGs1Lpn(companyPrefix, sequential) {
  // SSCC = (0)(extension digit)(GS1 company prefix)(serial ref) + check digit
  const base = `0${companyPrefix}${String(sequential).padStart(17 - 1 - String(companyPrefix).length, '0')}`
  const check = calcGs1CheckDigit(base)
  return '00' + base + check  // 20 chars total
}

function generateLpnRange(mode, prefix, startNum, count, companyPrefix) {
  const result = []
  for (let i = 0; i < count; i++) {
    if (mode === 'gs1') {
      result.push(generateGs1Lpn(companyPrefix, startNum + i))
    } else {
      result.push(`${prefix}${String(startNum + i).padStart(6, '0')}`)
    }
  }
  return result
}

const EMPTY_SINGLE = { branch_id: '', lpn_code: '', status: 'active', location_id: '', notes: '' }
const EMPTY_BULK = { branch_id: '', mode: 'internal', prefix: 'LP', startNum: 1, count: 10, companyPrefix: '9999999', location_id: '', status: 'active' }

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ value }) {
  const cfg = STATUS_CONFIG[value] || STATUS_CONFIG.empty
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, borderRadius: 99, padding: '3px 10px', fontSize: '.72rem', fontWeight: 700 }}>
      <i className={`fa-solid ${cfg.icon}`} style={{ fontSize: '.6rem' }} />
      {cfg.label}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WmsLpns() {
  const toast = useToast()

  const [lpns, setLpns] = useState([])
  const [locations, setLocations] = useState([])
  const [depots, setDepots] = useState([])
  const [loading, setLoading] = useState(true)

  const [filterDepot, setFilterDepot] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  const [singleModal, setSingleModal] = useState(false)
  const [bulkModal, setBulkModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [formSingle, setFormSingle] = useState(EMPTY_SINGLE)
  const [formBulk, setFormBulk] = useState(EMPTY_BULK)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [bulkPreview, setBulkPreview] = useState([])

  // Stok Raporu
  const [stockReportModal, setStockReportModal] = useState(false)
  const [stockReportLpn, setStockReportLpn] = useState(null)
  const [stockReportRows, setStockReportRows] = useState([])
  const [stockReportLoading, setStockReportLoading] = useState(false)

  async function openStockReport(lpn) {
    setStockReportLpn(lpn)
    setStockReportModal(true)
    setStockReportLoading(true)
    setStockReportRows([])
    try {
      const { data, error } = await db
        .from('inventory_movements')
        .select('stock_item_id, item_name, item_sku, unit, quantity, direction, location_id, lot_number, expiration_date')
        .eq('lpn_id', lpn.id)
        .is('deleted_at', null)
        .eq('is_cancelled', false)
        .eq('item_type', 'stock_item')
      if (error) throw error
      const map = new Map()
      for (const m of data || []) {
        const qty = Number(m.quantity || 0)
        const signed = m.direction === 'in' ? qty : -qty
        const key = `${m.stock_item_id}__${m.location_id || ''}__${m.lot_number || ''}__${m.expiration_date || ''}`
        if (!map.has(key)) map.set(key, { item_name: m.item_name, item_sku: m.item_sku, unit: m.unit, location_id: m.location_id, lot_number: m.lot_number, expiration_date: m.expiration_date, qty: 0 })
        map.get(key).qty += signed
      }
      setStockReportRows(Array.from(map.values()).filter(r => r.qty > 0.0001).sort((a, b) => (a.item_name || '').localeCompare(b.item_name || '', 'tr')))
    } catch (e) {
      toast('Stok raporu yüklenemedi: ' + e.message, 'error')
    } finally {
      setStockReportLoading(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: lpnData }, { data: locData }, { data: ct }] = await Promise.all([
        db.from('warehouse_lpns').select('*, warehouse_locations(zone_code,aisle,rack,level,bin)').order('created_at', { ascending: false }),
        db.from('warehouse_locations').select('id,zone_code,aisle,rack,level,bin,branch_id').eq('is_active', true).order('zone_code'),
        db.from('settings').select('value').eq('key', 'company_tree').single(),
      ])
      setLpns(lpnData || [])
      setLocations(locData || [])
      setDepots(getAllAnadepoFromTree(ct?.value || []))
    } catch (e) {
      toast('LPN verileri yüklenemedi: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const depotName = id => depots.find(d => d.id === id)?.name || '—'

  const filtered = useMemo(() => lpns.filter(l => {
    if (filterDepot && l.branch_id !== filterDepot) return false
    if (filterStatus && l.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(l.lpn_code || '').toLowerCase().includes(q)) return false
    }
    return true
  }), [lpns, filterDepot, filterStatus, search])

  const locationsForDepot = branchId => locations.filter(l => !branchId || l.branch_id === branchId)

  function openAdd() { setFormSingle({ ...EMPTY_SINGLE, branch_id: depots[0]?.id || '' }); setEditId(null); setSingleModal(true) }
  function openEdit(lpn) {
    setFormSingle({ branch_id: lpn.branch_id || '', lpn_code: lpn.lpn_code || '', status: lpn.status || 'active', location_id: lpn.location_id || '', notes: lpn.notes || '' })
    setEditId(lpn.id)
    setSingleModal(true)
  }

  async function saveSingle() {
    if (!formSingle.branch_id) { toast('Ana Depo seçin', 'error'); return }
    if (!formSingle.lpn_code.trim()) { toast('LPN kodu zorunludur', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        branch_id: formSingle.branch_id,
        lpn_code: formSingle.lpn_code.trim().toUpperCase(),
        status: formSingle.status,
        location_id: formSingle.location_id || null,
        notes: formSingle.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }
      if (editId) {
        const { error } = await db.from('warehouse_lpns').update(payload).eq('id', editId)
        if (error) throw error
        toast('LPN güncellendi', 'success')
      } else {
        const { error } = await db.from('warehouse_lpns').insert(payload)
        if (error) throw error
        toast('LPN eklendi', 'success')
      }
      setSingleModal(false)
      load()
    } catch (e) {
      toast('Kaydedilemedi: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function updateBulkPreview(fb) {
    const codes = generateLpnRange(fb.mode, fb.prefix, Number(fb.startNum), Math.min(Number(fb.count), 500), fb.companyPrefix)
    setBulkPreview(codes)
  }

  function openBulk() {
    const initial = { ...EMPTY_BULK, branch_id: depots[0]?.id || '' }
    setFormBulk(initial)
    updateBulkPreview(initial)
    setBulkModal(true)
  }

  function setBulkField(k, v) {
    setFormBulk(f => {
      const next = { ...f, [k]: v }
      updateBulkPreview(next)
      return next
    })
  }

  async function saveBulk() {
    if (!formBulk.branch_id) { toast('Ana Depo seçin', 'error'); return }
    if (bulkPreview.length === 0) { toast('Oluşturulacak LPN yok', 'error'); return }
    setSaving(true)
    try {
      const payloads = bulkPreview.map(code => ({
        branch_id: formBulk.branch_id,
        lpn_code: code,
        status: formBulk.status,
        location_id: formBulk.location_id || null,
        updated_at: new Date().toISOString(),
      }))
      // Insert in chunks of 100
      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100)
        const { error } = await db.from('warehouse_lpns').insert(chunk)
        if (error) throw error
      }
      toast(`${bulkPreview.length} LPN oluşturuldu`, 'success')
      setBulkModal(false)
      load()
    } catch (e) {
      toast('Toplu kayıt hatası: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function remove(lpn) {
    const { error } = await db.from('warehouse_lpns').delete().eq('id', lpn.id)
    if (error) toast('Silinemedi: ' + error.message, 'error')
    else { toast('LPN silindi', 'info'); load() }
    setConfirm(null)
  }

  async function changeStatus(lpn, status) {
    const { error } = await db.from('warehouse_lpns').update({ status, updated_at: new Date().toISOString() }).eq('id', lpn.id)
    if (!error) load()
  }

  const setSingle = (k, v) => setFormSingle(f => ({ ...f, [k]: v }))

  return (
    <div className="page-enter">
      <Header
        title="LPN / Paletler"
        subtitle={`${filtered.length} LPN`}
        actions={
          <>
            <button className="btn-o" style={{ fontSize: '.83rem' }} onClick={openBulk}>
              <i className="fa-solid fa-layer-group" /> Toplu Oluştur
            </button>
            <AddButton onClick={openAdd} label="LPN Ekle" />
          </>
        }
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => {
          const count = lpns.filter(l => l.status === k).length
          return (
            <div key={k} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', border: filterStatus === k ? `2px solid ${v.color}` : '2px solid transparent' }}
              onClick={() => setFilterStatus(f => f === k ? '' : k)}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className={`fa-solid ${v.icon}`} style={{ color: v.color }} />
              </div>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: v.color, lineHeight: 1 }}>{count}</div>
                <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>{v.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.75rem', pointerEvents: 'none' }} />
          <input className="f-input" style={{ paddingLeft: 30 }} placeholder="LPN kodu ara…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="f-input" style={{ flex: '1 1 160px' }} value={filterDepot} onChange={e => setFilterDepot(e.target.value)}>
          <option value="">Tüm Depolar</option>
          {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="f-input" style={{ flex: '1 1 140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tüm Durumlar</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-pallet" style={{ fontSize: 32, marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
          <div style={{ fontWeight: 700, marginBottom: 6 }}>LPN bulunamadı</div>
          <div style={{ fontSize: '.83rem', marginBottom: 16 }}>Tekli veya toplu LPN oluşturun</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-o" onClick={openBulk}><i className="fa-solid fa-layer-group" /> Toplu Oluştur</button>
            <button className="btn-p" onClick={openAdd}><i className="fa-solid fa-plus" /> LPN Ekle</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['LPN Kodu', 'Depo', 'Lokasyon', 'Durum', 'Tarih', ''].map((h, i) => (
                  <th key={i} style={{ padding: '9px 14px', textAlign: 'left', fontSize: '.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(lpn => (
                <tr key={lpn.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '.9rem', color: '#0f172a', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px', letterSpacing: '.04em' }}>
                      {lpn.lpn_code}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '.82rem', color: '#475569' }}>{depotName(lpn.branch_id)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    {lpn.warehouse_locations ? (
                      <span style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#6366f1', fontWeight: 700 }}>
                        {formatAddress(lpn.warehouse_locations)}
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: '.78rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <select value={lpn.status} onChange={e => changeStatus(lpn, e.target.value)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '.78rem', color: STATUS_CONFIG[lpn.status]?.color || '#64748b' }}>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '.75rem', color: '#94a3b8' }}>
                    {lpn.created_at ? new Date(lpn.created_at).toLocaleDateString('tr-TR') : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="ico-btn" onClick={() => openStockReport(lpn)} title="Stok Raporu" style={{ color: '#0d9488' }}><i className="fa-solid fa-chart-bar" /></button>
                      <button className="ico-btn" onClick={() => openEdit(lpn)} title="Düzenle"><i className="fa-solid fa-pen" /></button>
                      <button className="ico-btn del" onClick={() => setConfirm(lpn)} title="Sil"><i className="fa-solid fa-trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Single LPN Modal */}
      <Modal open={singleModal} onClose={() => setSingleModal(false)} title={editId ? 'LPN Düzenle' : 'Yeni LPN'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="f-label">Ana Depo <span style={{ color: '#ef4444' }}>*</span></label>
              <SearchableSelect value={formSingle.branch_id} onChange={v => setSingle('branch_id', v)} options={depots.map(d => ({ value: d.id, label: d.name }))} placeholder="Depo seçin…" />
            </div>
            <div>
              <label className="f-label">LPN Kodu <span style={{ color: '#ef4444' }}>*</span></label>
              <input className="f-input" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                value={formSingle.lpn_code} onChange={e => setSingle('lpn_code', e.target.value.toUpperCase())}
                placeholder="Örn: 00999999900000000017" />
              <p className="f-hint">GS1-128 SSCC (20 karakter) veya iç kodlama kullanabilirsiniz.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="f-label">Durum</label>
                <select className="f-input" value={formSingle.status} onChange={e => setSingle('status', e.target.value)}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="f-label">Lokasyon</label>
                <SearchableSelect value={formSingle.location_id} onChange={v => setSingle('location_id', v)}
                  options={locationsForDepot(formSingle.branch_id).map(l => ({ value: l.id, label: formatAddress(l) }))}
                  placeholder="Raf/göz seçin…" />
              </div>
            </div>
            <div>
              <label className="f-label">Notlar</label>
              <textarea className="f-input" rows={2} value={formSingle.notes} onChange={e => setSingle('notes', e.target.value)} placeholder="İsteğe bağlı not…" style={{ resize: 'vertical' }} />
            </div>
            <div className="modal-foot" style={{ justifyContent: 'flex-end' }}>
              <button className="btn-g" onClick={() => setSingleModal(false)}>İptal</button>
              <button className="btn-p" onClick={saveSingle} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-check" />}
                {editId ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
      </Modal>

      {/* Bulk Modal */}
      <Modal open={bulkModal} onClose={() => setBulkModal(false)} title="Toplu LPN Oluştur" width={900}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="f-label">Ana Depo</label>
                <SearchableSelect value={formBulk.branch_id} onChange={v => setBulkField('branch_id', v)} options={depots.map(d => ({ value: d.id, label: d.name }))} placeholder="Depo seçin…" />
              </div>

              <div>
                <label className="f-label">Kodlama Modu</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ k: 'internal', label: 'İç Kodlama', sub: 'LP000001' }, { k: 'gs1', label: 'GS1-128 SSCC', sub: '00999...' }].map(opt => (
                    <label key={opt.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '10px', borderRadius: 10, border: `2px solid ${formBulk.mode === opt.k ? '#6366f1' : '#e2e8f0'}`, background: formBulk.mode === opt.k ? 'rgba(99,102,241,.06)' : '#fff' }}>
                      <input type="radio" name="bulk_mode" value={opt.k} checked={formBulk.mode === opt.k} onChange={() => setBulkField('mode', opt.k)} style={{ display: 'none' }} />
                      <span style={{ fontWeight: 700, fontSize: '.82rem', color: formBulk.mode === opt.k ? '#6366f1' : '#334155' }}>{opt.label}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: '.7rem', color: '#94a3b8' }}>{opt.sub}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formBulk.mode === 'internal' && (
                <div>
                  <label className="f-label">Ön Ek</label>
                  <input className="f-input" style={{ fontFamily: 'monospace', textTransform: 'uppercase' }} value={formBulk.prefix} onChange={e => setBulkField('prefix', e.target.value.toUpperCase())} placeholder="LP" />
                </div>
              )}

              {formBulk.mode === 'gs1' && (
                <div>
                  <label className="f-label">GS1 Şirket Prefiksi</label>
                  <input className="f-input" style={{ fontFamily: 'monospace' }} value={formBulk.companyPrefix} onChange={e => setBulkField('companyPrefix', e.target.value.replace(/\D/g, ''))} placeholder="9999999" maxLength={10} />
                  <p className="f-hint">GS1 Türkiye'den aldığınız şirket prefiks numaranız</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label className="f-label">Başlangıç No</label>
                  <input className="f-input" type="number" min={1} value={formBulk.startNum} onChange={e => setBulkField('startNum', e.target.value)} />
                </div>
                <div>
                  <label className="f-label">Adet (max 500)</label>
                  <input className="f-input" type="number" min={1} max={500} value={formBulk.count} onChange={e => setBulkField('count', Math.min(500, Number(e.target.value)))} />
                </div>
              </div>

              <div>
                <label className="f-label">Varsayılan Lokasyon</label>
                <SearchableSelect value={formBulk.location_id} onChange={v => setBulkField('location_id', v)}
                  options={locationsForDepot(formBulk.branch_id).map(l => ({ value: l.id, label: formatAddress(l) }))}
                  placeholder="İsteğe bağlı…" />
              </div>

              <div>
                <label className="f-label">Başlangıç Durumu</label>
                <select className="f-input" value={formBulk.status} onChange={e => setBulkField('status', e.target.value)}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            {/* Preview panel */}
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '.06em' }}>Önizleme</span>
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#64748b' }}>{bulkPreview.length} adet</span>
              </div>
              <div style={{ overflowY: 'auto', maxHeight: 340, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {bulkPreview.slice(0, 20).map((code, i) => (
                  <div key={i} style={{ fontFamily: 'monospace', fontSize: '.78rem', color: '#334155', background: '#fff', borderRadius: 6, padding: '4px 10px', border: '1px solid #e2e8f0', letterSpacing: '.04em' }}>
                    {code}
                  </div>
                ))}
                {bulkPreview.length > 20 && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '.75rem', padding: 8 }}>
                    … ve {bulkPreview.length - 20} adet daha
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="modal-foot" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn-g" onClick={() => setBulkModal(false)}>İptal</button>
            <button className="btn-p" onClick={saveBulk} disabled={saving || bulkPreview.length === 0}>
              {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-layer-group" />}
              {bulkPreview.length} LPN Oluştur
            </button>
          </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.lpn_code}" silinsin mi?`}
        desc="Bu LPN'e bağlı stok hareketleri etkilenebilir."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}
      />

      {/* LPN Stok Raporu */}
      <Modal
        open={stockReportModal}
        onClose={() => setStockReportModal(false)}
        title={stockReportLpn ? `Stok Raporu: ${stockReportLpn.lpn_code}` : 'Stok Raporu'}
        width={700}
      >
        {stockReportLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}><i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…</div>
        ) : stockReportRows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Bu LPN'de aktif stok bulunmuyor.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Ürün', 'SKU', 'Lokasyon', 'Lot No', 'SKT', 'Miktar', 'Birim'].map((h, i) => (
                    <th key={i} style={{ padding: '8px 12px', textAlign: i >= 5 ? 'right' : 'left', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', fontSize: '.72rem', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stockReportRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{r.item_name}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '.78rem', color: '#64748b' }}>{r.item_sku || '—'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '.78rem', color: '#6366f1' }}>
                      {r.location_id ? formatAddress(locations.find(l => l.id === r.location_id)) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '.78rem', color: '#475569' }}>{r.lot_number || '—'}</td>
                    <td style={{ padding: '8px 12px', fontSize: '.78rem', color: '#475569' }}>{r.expiration_date || '—'}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: '#166534', textAlign: 'right' }}>
                      {Number(r.qty).toLocaleString('tr-TR', { maximumFractionDigits: 4 })}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '.78rem' }}>{r.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  )
}
