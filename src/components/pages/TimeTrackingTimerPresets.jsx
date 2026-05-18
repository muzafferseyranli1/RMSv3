import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AddButton from '@/components/ui/AddButton'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const UNITS = [
  { value: 'dakika', label: 'Dakika' },
  { value: 'saat', label: 'Saat' },
  { value: 'gun', label: 'Gun' },
  { value: 'hafta', label: 'Hafta' },
  { value: 'ay', label: 'Ay' },
]

const ROW_TYPES = [
  { value: 'sale_item', label: 'Satis Mali', icon: 'fa-utensils', color: '#fb923c' },
  { value: 'stock_item', label: 'Stok Mali', icon: 'fa-cube', color: '#34d399' },
  { value: 'bakim', label: 'Bakim', icon: 'fa-wrench', color: '#a78bfa' },
  { value: 'diger', label: 'Diger', icon: 'fa-ellipsis', color: '#64748b' },
]

export default function TimeTrackingTimerPresets() {
  const navigate = useNavigate()
  const toast = useToast()

  const [types, setTypes] = useState([])
  const [defs, setDefs] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [databaseError, setDatabaseError] = useState('')

  const [typeModal, setTypeModal] = useState(false)
  const [typeForm, setTypeForm] = useState({ name: '', sort_order: 0 })
  const [editTypeId, setEditTypeId] = useState(null)
  const [confirmType, setConfirmType] = useState(null)

  const [addRowModal, setAddRowModal] = useState(false)
  const [newRow, setNewRow] = useState({ row_type: 'sale_item', sale_item_id: '', stock_item_id: '', bakim_name: '' })
  const [confirmRow, setConfirmRow] = useState(null)

  const [edits, setEdits] = useState({})
  const [hasChanges, setHasChanges] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setDatabaseError('')

    const [typesResponse, defsResponse, saleItemsResponse, stockItemsResponse] = await Promise.all([
      db.from('time_tracking_types').select('*').is('deleted_at', null).order('sort_order'),
      db.from('time_tracking_defs').select('*').is('deleted_at', null).order('created_at'),
      db.from('sale_items').select('id,name,sku').is('deleted_at', null).order('name'),
      db.from('stock_items').select('id,name,sku').is('deleted_at', null).order('name'),
    ])

    const firstError = typesResponse.error || defsResponse.error || saleItemsResponse.error || stockItemsResponse.error
    if (firstError) {
      setDatabaseError(firstError.message || 'Zaman sayaci on ayarlari okunamadi.')
    }

    setTypes(typesResponse.data || [])
    setDefs(defsResponse.data || [])
    setSaleItems(saleItemsResponse.data || [])
    setStockItems(stockItemsResponse.data || [])
    setEdits({})
    setHasChanges(false)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function getCell(defId, typeId) {
    if (edits[defId]?.[typeId] !== undefined) return edits[defId][typeId]
    const def = defs.find(row => row.id === defId)
    return def?.times?.[typeId] || { value: '', unit: 'gun' }
  }

  function setCell(defId, typeId, field, value) {
    setEdits(previousEdits => ({
      ...previousEdits,
      [defId]: {
        ...(previousEdits[defId] || {}),
        [typeId]: { ...getCell(defId, typeId), [field]: value },
      },
    }))
    setHasChanges(true)
  }

  async function saveAll() {
    setSaving(true)

    for (const [defId, typeEdits] of Object.entries(edits)) {
      const def = defs.find(row => row.id === defId)
      if (!def) continue

      const times = { ...(def.times || {}) }
      Object.entries(typeEdits).forEach(([typeId, cell]) => {
        times[typeId] = cell
      })

      const { error } = await db.from('time_tracking_defs').update({ times }).eq('id', defId)
      if (error) {
        setSaving(false)
        toast(`Hata: ${error.message}`, 'error')
        return
      }
    }

    setSaving(false)
    toast('On ayarlar kaydedildi', 'success')
    await load()
  }

  async function addRow() {
    const { row_type, sale_item_id, stock_item_id, bakim_name } = newRow

    if (row_type === 'sale_item' && !sale_item_id) {
      toast('Satis mali secin', 'error')
      return
    }
    if (row_type === 'stock_item' && !stock_item_id) {
      toast('Stok mali secin', 'error')
      return
    }
    if ((row_type === 'bakim' || row_type === 'diger') && !bakim_name.trim()) {
      toast('Tanim adi girin', 'error')
      return
    }

    const { error } = await db.from('time_tracking_defs').insert({
      row_type,
      sale_item_id: row_type === 'sale_item' ? sale_item_id : null,
      stock_item_id: row_type === 'stock_item' ? stock_item_id : null,
      bakim_name: row_type === 'bakim' || row_type === 'diger' ? bakim_name.trim() : null,
      times: {},
    })

    if (error) {
      toast(`Hata: ${error.message}`, 'error')
      return
    }

    setAddRowModal(false)
    setNewRow({ row_type: 'sale_item', sale_item_id: '', stock_item_id: '', bakim_name: '' })
    toast('Satir eklendi', 'success')
    await load()
  }

  async function deleteRow(id) {
    const { error } = await db.from('time_tracking_defs').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      toast(`Hata: ${error.message}`, 'error')
      return
    }
    toast('Satir silindi', 'info')
    setConfirmRow(null)
    await load()
  }

  async function saveType() {
    if (!typeForm.name.trim()) {
      toast('Kolon adi zorunludur', 'error')
      return
    }

    if (editTypeId) {
      const { error } = await db
        .from('time_tracking_types')
        .update({ name: typeForm.name.trim(), sort_order: parseInt(typeForm.sort_order, 10) || 0 })
        .eq('id', editTypeId)
      if (error) {
        toast(`Hata: ${error.message}`, 'error')
        return
      }
      toast('Kolon guncellendi', 'success')
    } else {
      const { error } = await db
        .from('time_tracking_types')
        .insert({ name: typeForm.name.trim(), sort_order: parseInt(typeForm.sort_order, 10) || 0 })
      if (error) {
        toast(`Hata: ${error.message}`, 'error')
        return
      }
      toast('Kolon eklendi', 'success')
    }

    setTypeModal(false)
    setTypeForm({ name: '', sort_order: 0 })
    setEditTypeId(null)
    await load()
  }

  async function deleteType(id) {
    const { error } = await db.from('time_tracking_types').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) {
      toast(`Hata: ${error.message}`, 'error')
      return
    }
    toast('Kolon silindi', 'info')
    setConfirmType(null)
    await load()
  }

  function rowLabel(def) {
    if (def.row_type === 'sale_item') {
      const saleItem = saleItems.find(item => item.id === def.sale_item_id)
      return { label: saleItem?.name || '-', sub: saleItem?.sku, rowType: ROW_TYPES[0] }
    }
    if (def.row_type === 'stock_item') {
      const stockItem = stockItems.find(item => item.id === def.stock_item_id)
      return { label: stockItem?.name || '-', sub: stockItem?.sku, rowType: ROW_TYPES[1] }
    }
    if (def.row_type === 'diger') {
      return { label: def.bakim_name || '-', sub: '', rowType: ROW_TYPES[3] }
    }
    return { label: def.bakim_name || '-', sub: '', rowType: ROW_TYPES[2] }
  }

  return (
    <div className="page-enter">
      <Header
        title="Zaman Sayaci On Ayarlari"
        subtitle="Zaman sayaclarinin kullandigi kolon ve satir on tanimlarini yonetin"
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-g" style={{ fontSize: '.83rem' }} onClick={() => navigate('/time-tracking/timers')}>
              <i className="fa-solid fa-stopwatch" /> Zaman Sayaclari
            </button>
            <AddButton onClick={() => { setTypeForm({ name: '', sort_order: types.length }); setEditTypeId(null); setTypeModal(true) }} label="Kolon Ekle" icon="fa-table-columns" />
            <AddButton onClick={() => setAddRowModal(true)} label="Satır Ekle" />
            {hasChanges && (
              <button className="btn-p" onClick={saveAll} disabled={saving}>
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`} /> Kaydet
              </button>
            )}
          </div>
        }
      />

      <div className="card" style={{ padding: '14px 16px', marginBottom: 16, border: '1px solid #dbeafe', background: 'linear-gradient(135deg, #f8fbff 0%, #eff6ff 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: '#dbeafe', color: '#2563eb', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <i className="fa-solid fa-sliders" />
          </span>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: '.92rem', fontWeight: 800, color: '#1e3a8a' }}>Bu ekran `time_tracking_types` ve `time_tracking_defs` tablolarini yonetir.</div>
            <div style={{ fontSize: '.8rem', color: '#475569', marginTop: 4, lineHeight: 1.55 }}>
              Buradaki kolon ve sureler, `Zaman Sayaclari` ekranindaki yeni sayac akisini otomatik doldurur.
            </div>
          </div>
        </div>
      </div>

      {databaseError && (
        <div className="card" style={{ padding: 16, marginBottom: 16, border: '1px solid #fecaca', background: '#fff7f7', color: '#991b1b' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>DATABASE UNAVAILABLE</div>
          <div style={{ fontSize: '.84rem', lineHeight: 1.5 }}>{databaseError}</div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.83rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', width: 110, color: '#64748b', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase' }}>Tip</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: 220, color: '#64748b', fontWeight: 700, fontSize: '.72rem', textTransform: 'uppercase', position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, borderRight: '2px solid #e2e8f0' }}>Isim</th>
                  {types.map(type => (
                    <th key={type.id} style={{ padding: '10px 14px', textAlign: 'center', minWidth: 170, background: '#eff6ff', borderLeft: '1px solid #bfdbfe' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, color: '#1e40af', fontSize: '.82rem' }}>{type.name}</span>
                        <div style={{ display: 'flex', gap: 2 }}>
                          <button className="ico-btn edit" style={{ width: 20, height: 20 }} onClick={() => { setTypeForm({ name: type.name, sort_order: type.sort_order }); setEditTypeId(type.id); setTypeModal(true) }}>
                            <i className="fa-solid fa-pen" style={{ fontSize: '.55rem' }} />
                          </button>
                          <button className="ico-btn del" style={{ width: 20, height: 20 }} onClick={() => setConfirmType(type)}>
                            <i className="fa-solid fa-trash" style={{ fontSize: '.55rem' }} />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: '.68rem', color: '#94a3b8', marginTop: 2 }}>gun · hafta · ay · saat · dakika</div>
                    </th>
                  ))}
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {defs.length === 0 ? (
                  <tr>
                    <td colSpan={types.length + 3}>
                      <div className="empty">
                        <i className="fa-solid fa-clock" />
                        <p>Henuz on ayar satiri yok. "Satir Ekle" ile baslayin.</p>
                      </div>
                    </td>
                  </tr>
                ) : defs.map((def, rowIndex) => {
                  const { label, sub, rowType } = rowLabel(def)
                  const rowBackground = rowIndex % 2 === 0 ? '#fff' : '#fafafa'
                  const isEdited = !!edits[def.id]

                  return (
                    <tr key={def.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEdited ? '#fffde7' : rowBackground }}>
                      <td style={{ padding: '8px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${rowType.color}22`, color: rowType.color, borderRadius: 99, padding: '2px 8px', fontSize: '.72rem', fontWeight: 700 }}>
                          <i className={`fa-solid ${rowType.icon}`} style={{ fontSize: '.65rem' }} />
                          {rowType.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 14px', position: 'sticky', left: 0, background: isEdited ? '#fffde7' : rowBackground, zIndex: 1, borderRight: '2px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{label}</div>
                        {sub && <div style={{ fontSize: '.72rem', fontFamily: 'monospace', color: '#94a3b8' }}>{sub}</div>}
                      </td>
                      {types.map(type => {
                        const cell = getCell(def.id, type.id)
                        const hasValue = !!cell.value

                        return (
                          <td key={type.id} style={{ padding: '6px 10px', borderLeft: '1px solid #f1f5f9', background: hasValue ? '#eff6ff' : 'transparent' }}>
                            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={cell.value}
                                onChange={event => setCell(def.id, type.id, 'value', event.target.value)}
                                placeholder="-"
                                style={{ width: 68, border: `1.5px solid ${hasValue ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 7, padding: '5px 8px', fontSize: '.82rem', background: hasValue ? '#fff' : '#f8fafc', fontWeight: hasValue ? 600 : 400, outline: 'none', color: hasValue ? '#1e40af' : '#94a3b8' }}
                                onFocus={event => { event.target.style.borderColor = '#6366f1' }}
                                onBlur={event => { event.target.style.borderColor = hasValue ? '#93c5fd' : '#e2e8f0' }}
                              />
                              <div className="sel-wrap" style={{ flex: 1 }}>
                                <select
                                  value={cell.unit || 'gun'}
                                  onChange={event => setCell(def.id, type.id, 'unit', event.target.value)}
                                  style={{ fontSize: '.75rem', padding: '5px 22px 5px 7px', color: hasValue ? '#1e40af' : '#94a3b8', background: hasValue ? '#eff6ff' : '#f8fafc', border: `1.5px solid ${hasValue ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 7 }}
                                >
                                  {UNITS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                                </select>
                              </div>
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ padding: '6px', textAlign: 'center' }}>
                        <button className="ico-btn del" style={{ width: 26, height: 26 }} onClick={() => setConfirmRow(def)}>
                          <i className="fa-solid fa-trash" style={{ fontSize: '.65rem' }} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {hasChanges && (
            <div style={{ padding: '10px 16px', background: '#fffbeb', borderTop: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.82rem', color: '#92400e', fontWeight: 600 }}>
                <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
                Kaydedilmemis degisiklikler var
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-g" style={{ fontSize: '.83rem' }} onClick={() => { setEdits({}); setHasChanges(false) }}>
                  Geri Al
                </button>
                <button className="btn-p" style={{ fontSize: '.83rem' }} onClick={saveAll} disabled={saving}>
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`} /> Kaydet
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={typeModal}
        onClose={() => setTypeModal(false)}
        width={380}
        title={editTypeId ? 'Kolon Duzenle' : 'Yeni Zaman Kolonu'}
        footer={
          <>
            <button className="btn-g" onClick={() => setTypeModal(false)}>Iptal</button>
            <button className="btn-p" onClick={saveType}><i className="fa-solid fa-check" /> Kaydet</button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label className="f-label">Kolon Adi *</label>
            <input className="f-input" value={typeForm.name} onChange={event => setTypeForm(formState => ({ ...formState, name: event.target.value }))} placeholder="Orn. SKT, Raf Omru, Tezgah Omru" />
          </div>
          <div>
            <label className="f-label">Sira</label>
            <input className="f-input" type="number" value={typeForm.sort_order} onChange={event => setTypeForm(formState => ({ ...formState, sort_order: event.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={addRowModal}
        onClose={() => setAddRowModal(false)}
        width={440}
        title="Yeni Satir Ekle"
        footer={
          <>
            <button className="btn-g" onClick={() => setAddRowModal(false)}>Iptal</button>
            <button className="btn-p" onClick={addRow}><i className="fa-solid fa-check" /> Ekle</button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label className="f-label">Satir Tipi</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ROW_TYPES.map(rowType => (
                <label key={rowType.value} style={{ flex: '1 1 140px', cursor: 'pointer' }}>
                  <input type="radio" name="row_type" value={rowType.value} checked={newRow.row_type === rowType.value} onChange={() => setNewRow(currentRow => ({ ...currentRow, row_type: rowType.value }))} style={{ display: 'none' }} />
                  <div style={{ padding: '8px 10px', borderRadius: 10, textAlign: 'center', border: `2px solid ${newRow.row_type === rowType.value ? rowType.color : '#e2e8f0'}`, background: newRow.row_type === rowType.value ? `${rowType.color}18` : '#f8fafc', fontSize: '.78rem', fontWeight: 700, color: newRow.row_type === rowType.value ? rowType.color : '#64748b' }}>
                    <i className={`fa-solid ${rowType.icon}`} style={{ display: 'block', marginBottom: 4 }} />
                    {rowType.label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {newRow.row_type === 'sale_item' && (
            <div>
              <label className="f-label">Satis Mali *</label>
              <div className="sel-wrap">
                <select className="f-input" value={newRow.sale_item_id} onChange={event => setNewRow(currentRow => ({ ...currentRow, sale_item_id: event.target.value }))}>
                  <option value="">Secin...</option>
                  {saleItems.map(item => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
                </select>
              </div>
            </div>
          )}

          {newRow.row_type === 'stock_item' && (
            <div>
              <label className="f-label">Stok Mali *</label>
              <div className="sel-wrap">
                <select className="f-input" value={newRow.stock_item_id} onChange={event => setNewRow(currentRow => ({ ...currentRow, stock_item_id: event.target.value }))}>
                  <option value="">Secin...</option>
                  {stockItems.map(item => <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>)}
                </select>
              </div>
            </div>
          )}

          {(newRow.row_type === 'bakim' || newRow.row_type === 'diger') && (
            <div>
              <label className="f-label">Tanim Adi *</label>
              <input className="f-input" value={newRow.bakim_name} onChange={event => setNewRow(currentRow => ({ ...currentRow, bakim_name: event.target.value }))} placeholder={newRow.row_type === 'bakim' ? 'Orn. Klima filtre degisimi' : 'Serbest tanim girin'} />
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmType} title={`"${confirmType?.name}" kolonu silinsin mi?`} message="Bu kolona girilen tum on ayar degerleri silinecek." onConfirm={() => deleteType(confirmType.id)} onCancel={() => setConfirmType(null)} />
      <ConfirmDialog open={!!confirmRow} title="Bu satir silinsin mi?" message="Bu satirin tum on ayar hucreleri kaldirilacak." onConfirm={() => deleteRow(confirmRow.id)} onCancel={() => setConfirmRow(null)} />
    </div>
  )
}
