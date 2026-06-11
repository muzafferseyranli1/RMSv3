import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import { stockItemMatchesSupplier } from '@/lib/branchPurchasing'

// Lokasyon adresini kısa etiket olarak formatla
function fmtLoc(loc) {
  if (!loc) return '—'
  const parts = [
    loc.zone_code,
    loc.aisle ? `K${loc.aisle}` : null,
    loc.rack   ? `R${loc.rack}`  : null,
    loc.level  ? `S${loc.level}` : null,
    loc.bin    ? `G${loc.bin}`   : null,
  ].filter(Boolean)
  return parts.join('-') || loc.id
}

export default function WmsStockParams() {
  const toast = useToast()
  const { currentBranch } = useWorkspace()
  const branchId = currentBranch?.id

  const [items,     setItems]     = useState([])
  const [locations, setLocations] = useState([])
  const [settings,  setSettings]  = useState({}) // { stock_item_id: {id, min_stock, safety_stock, default_location_id, ...} }
  const [units,     setUnits]     = useState([])
  const [warehouseSupplier, setWarehouseSupplier] = useState(null)
  const [allItemsCount, setAllItemsCount] = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [dirty,     setDirty]     = useState({}) // { stock_item_id: rowData }
  const [saving,    setSaving]    = useState(false)

  const load = useCallback(async () => {
    if (!branchId) return
    setLoading(true)
    const [
      { data: si, error: stockError },
      { data: locs, error: locError },
      { data: ws, error: settingsError },
      { data: un, error: unitError },
      { data: suppliers, error: supplierError },
    ] = await Promise.all([
      db.from('stock_items').select('id,name,sku,unit,supp_id,suppliers_list').is('deleted_at', null).order('name'),
      db.from('warehouse_locations').select('id,zone_code,aisle,rack,level,bin').eq('branch_id', branchId).eq('is_active', true).order('zone_code'),
      db.from('stock_item_warehouse_settings').select('*').eq('branch_id', branchId),
      db.from('units').select('name,label').order('label'),
      db.from('suppliers').select('id,name,supplier_kind,source_branch_id,active').eq('supplier_kind', 'internal_warehouse').eq('source_branch_id', branchId).eq('active', true).is('deleted_at', null).limit(1),
    ])

    const firstError = stockError || locError || settingsError || unitError || supplierError
    if (firstError) {
      toast('Stok parametreleri yüklenemedi: ' + firstError.message, 'error')
      setLoading(false)
      return
    }

    const supplier = (suppliers || [])[0] || null
    const scopedItems = supplier
      ? (si || []).filter(item => stockItemMatchesSupplier(item, supplier.id))
      : []
    const scopedItemIds = new Set(scopedItems.map(item => item.id))

    setWarehouseSupplier(supplier)
    setAllItemsCount((si || []).length)
    setItems(scopedItems)
    setLocations(locs || [])
    setUnits(un || [])
    const map = {}
    for (const row of (ws || [])) {
      if (scopedItemIds.has(row.stock_item_id)) map[row.stock_item_id] = row
    }
    setSettings(map)
    setDirty({})
    setLoading(false)
  }, [branchId, toast])

  useEffect(() => { load() }, [load])

  const locOpts = useMemo(() => locations.map(l => ({ value: l.id, label: fmtLoc(l) })), [locations])
  const unitOpts = useMemo(() => [{ value: 'ana', label: 'Ana birim' }, ...units.map(u => ({ value: u.name, label: u.label }))], [units])

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(i => i.name?.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q))
  }, [items, search])

  function getRow(itemId) {
    return dirty[itemId] ?? settings[itemId] ?? {}
  }

  function setField(itemId, key, val) {
    setDirty(d => ({
      ...d,
      [itemId]: { ...getRow(itemId), [key]: val }
    }))
  }

  async function saveAll() {
    if (!branchId) return
    const itemIds = Object.keys(dirty)
    if (itemIds.length === 0) { toast('Değişiklik yok', 'info'); return }
    const scopedItemIds = new Set(items.map(item => item.id))
    const outOfScope = itemIds.filter(itemId => !scopedItemIds.has(itemId))
    if (outOfScope.length > 0) {
      toast('Bu Ana Depo kapsamına girmeyen stok malları için WMS parametresi kaydedilemez.', 'error')
      return
    }
    setSaving(true)
    try {
      const payloads = itemIds.map(itemId => {
        const row = dirty[itemId]
        return {
          ...(settings[itemId]?.id ? { id: settings[itemId].id } : {}),
          stock_item_id: itemId,
          branch_id: branchId,
          order_unit: row.order_unit || 'ana',
          min_order: parseFloat(row.min_order) || null,
          max_order: parseFloat(row.max_order) || null,
          min_stock: parseFloat(row.min_stock) || null,
          safety_stock: parseFloat(row.safety_stock) || null,
          transfer_price_adjustment_type: row.transfer_price_adjustment_type || 'none',
          transfer_price_adjustment_value: parseFloat(row.transfer_price_adjustment_value) || 0,
          default_location_id: row.default_location_id || null,
          updated_at: new Date().toISOString(),
        }
      })
      const { error } = await db.from('stock_item_warehouse_settings').upsert(payloads, { onConflict: 'stock_item_id,branch_id' })
      if (error) throw error
      toast(`${itemIds.length} ürün parametresi kaydedildi`, 'success')
      load()
    } catch (e) {
      toast('Kaydedilemedi: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function resetRow(itemId) {
    setDirty(d => { const n = { ...d }; delete n[itemId]; return n })
  }

  const dirtyCount = Object.keys(dirty).length

  if (!branchId) {
    return (
      <div className="page-enter">
        <Header title="Stok Parametreleri" subtitle="Depo seçilmedi" />
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          Bu sayfa Ana Depo context'inde açılmalıdır.
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <Header
        title="Stok Parametreleri"
        subtitle={`${filtered.length} kapsam içi ürün · ${locations.length} lokasyon`}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {dirtyCount > 0 && (
              <span style={{ fontSize: '.78rem', color: '#f59e0b', fontWeight: 700 }}>
                <i className="fa-solid fa-circle-exclamation" /> {dirtyCount} ürün düzenlendi
              </span>
            )}
            <button className="btn-p" onClick={saveAll} disabled={saving || dirtyCount === 0}>
              {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
              Tümünü Kaydet
            </button>
          </div>
        }
      />

      {/* Info */}
      <div style={{ padding: '10px 16px', background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.15)', borderRadius: 10, marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <i className="fa-solid fa-circle-info" style={{ color: '#6366f1', marginTop: 3, flexShrink: 0 }} />
        <div style={{ fontSize: '.8rem', color: '#334155', lineHeight: 1.6 }}>
          Bu sayfadaki ayarlar yalnızca <strong>{currentBranch?.name}</strong> deposuna aittir.
          Sadece stok kartında tedarikçi olarak <strong>{warehouseSupplier?.name || 'bu Ana Depo'}</strong> seçilmiş stok malları yönetilebilir.
          Boş bırakılan alanlar için stok malının global değerleri kullanılır.
          {!warehouseSupplier && (
            <><br /><span style={{ color: '#ef4444' }}>Bu Ana Depo için aktif iç tedarikçi kaydı bulunamadı. Stok kartı kapsamı belirlenemediği için WMS stok parametresi yönetilemez.</span></>
          )}
          {warehouseSupplier && allItemsCount > items.length && (
            <><br /><span style={{ color: '#64748b' }}>{allItemsCount - items.length} stok malı bu deponun tedarikçi kapsamına girmediği için gizlendi.</span></>
          )}
          {locations.length === 0 && (
            <><br /><span style={{ color: '#ef4444' }}>⚠️ Bu depoya henüz lokasyon eklenmemiş. Önce <strong>Lokasyonlar</strong> sayfasından raf/göz tanımlayın.</span></>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.75rem', pointerEvents: 'none' }} />
          <input className="f-input" style={{ paddingLeft: 30 }} placeholder="Ürün adı veya SKU ara…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Ürün', 'Min Stok', 'Güvenlik Stoğu', 'Sipariş Birimi', 'Min Sipariş', 'Max Sipariş', 'Sevk Fiyatı', 'Varsayılan Lokasyon', ''].map((h, i) => (
                  <th key={i} style={{ padding: '9px 12px', textAlign: 'left', fontSize: '.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const row = getRow(item.id)
                const isDirty = !!dirty[item.id]

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', background: isDirty ? 'rgba(99,102,241,.03)' : undefined }}>
                    {/* Ürün adı */}
                    <td style={{ padding: '8px 12px', minWidth: 180 }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isDirty && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block', flexShrink: 0 }} />}
                        {item.name}
                      </div>
                      {item.sku && <div style={{ fontSize: '.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{item.sku}</div>}
                    </td>

                    {/* Min Stok */}
                    <td style={{ padding: '6px 8px', width: 90 }}>
                      <input className="f-input" type="number" min="0" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                        value={row.min_stock ?? ''}
                        onChange={e => setField(item.id, 'min_stock', e.target.value)}
                        placeholder="—" />
                    </td>

                    {/* Güvenlik Stoğu */}
                    <td style={{ padding: '6px 8px', width: 90 }}>
                      <input className="f-input" type="number" min="0" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                        value={row.safety_stock ?? ''}
                        onChange={e => setField(item.id, 'safety_stock', e.target.value)}
                        placeholder="—" />
                    </td>

                    {/* Sipariş Birimi */}
                    <td style={{ padding: '6px 8px', width: 120 }}>
                      <select className="f-input" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                        value={row.order_unit || 'ana'}
                        onChange={e => setField(item.id, 'order_unit', e.target.value)}>
                        {unitOpts.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                    </td>

                    {/* Min Sipariş */}
                    <td style={{ padding: '6px 8px', width: 80 }}>
                      <input className="f-input" type="number" min="0" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                        value={row.min_order ?? ''}
                        onChange={e => setField(item.id, 'min_order', e.target.value)}
                        placeholder="—" />
                    </td>

                    {/* Max Sipariş */}
                    <td style={{ padding: '6px 8px', width: 80 }}>
                      <input className="f-input" type="number" min="0" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                        value={row.max_order ?? ''}
                        onChange={e => setField(item.id, 'max_order', e.target.value)}
                        placeholder="—" />
                    </td>

                    {/* Sevk Fiyatı */}
                    <td style={{ padding: '6px 8px', minWidth: 210 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr .85fr', gap: 6 }}>
                        <select className="f-input" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                          value={row.transfer_price_adjustment_type || 'none'}
                          onChange={e => setField(item.id, 'transfer_price_adjustment_type', e.target.value)}>
                          <option value="none">Alış fiyatı</option>
                          <option value="percent">% marj</option>
                          <option value="amount">Tutar marj</option>
                        </select>
                        <input className="f-input" type="number" min="0" step="any" style={{ fontSize: '.78rem', padding: '5px 8px' }}
                          value={row.transfer_price_adjustment_value ?? ''}
                          onChange={e => setField(item.id, 'transfer_price_adjustment_value', e.target.value)}
                          disabled={(row.transfer_price_adjustment_type || 'none') === 'none'}
                          placeholder="0" />
                      </div>
                    </td>

                    {/* Varsayılan Lokasyon */}
                    <td style={{ padding: '6px 8px', width: 180 }}>
                      <SearchableSelect
                        value={row.default_location_id || ''}
                        onChange={v => setField(item.id, 'default_location_id', v)}
                        options={locOpts}
                        placeholder={locations.length === 0 ? 'Lokasyon yok' : 'Raf seç…'}
                      />
                    </td>

                    {/* Reset */}
                    <td style={{ padding: '6px 8px', textAlign: 'center', width: 36 }}>
                      {isDirty && (
                        <button className="ico-btn" title="Değişikliği geri al" onClick={() => resetRow(item.id)}
                          style={{ color: '#94a3b8' }}>
                          <i className="fa-solid fa-rotate-left" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: '.83rem' }}>
              {warehouseSupplier
                ? 'Bu Ana Depo tedarikçi kapsamına giren stok malı bulunamadı'
                : 'Aktif iç tedarikçi kaydı bulunmadığı için stok malı gösterilemiyor'}
            </div>
          )}
        </div>
      )}

      {/* Sticky save bar */}
      {dirtyCount > 0 && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1e293b', borderRadius: 14, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 8px 32px rgba(0,0,0,.25)', zIndex: 1000 }}>
          <span style={{ color: '#94a3b8', fontSize: '.82rem' }}>
            <span style={{ color: '#f59e0b', fontWeight: 700 }}>{dirtyCount}</span> ürün değiştirildi
          </span>
          <button onClick={() => setDirty({})} style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: '.8rem' }}>
            İptal
          </button>
          <button onClick={saveAll} disabled={saving}
            style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 18px', cursor: 'pointer', fontWeight: 700, fontSize: '.83rem', display: 'flex', alignItems: 'center', gap: 7 }}>
            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-floppy-disk" />}
            Kaydet
          </button>
        </div>
      )}
    </div>
  )
}
