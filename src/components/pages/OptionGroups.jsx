import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddButton from '@/components/ui/AddButton'
import SearchableSelect from '@/components/ui/SearchableSelect'

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function catAncestry(cats, id) {
  const chain = []; let cur = cats.find(c => c.id === id)
  while (cur) { chain.unshift(cur); cur = cur.parent_id ? cats.find(c => c.id === cur.parent_id) : null }
  return chain
}

function flatCats(cats) {
  const result = []
  function walk(id, depth) {
    cats.filter(c => (c.parent_id || null) === id).forEach(c => {
      result.push({ ...c, _depth: depth })
      walk(c.id, depth + 1)
    })
  }
  walk(null, 0)
  return result
}

function OptionChip({ label, price }) {
  const formatted = price > 0 ? `+${parseFloat(price).toFixed(2)}₺` : price < 0 ? `${parseFloat(price).toFixed(2)}₺` : null
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4,
      border:'1.5px solid #e2e8f0', borderRadius:8, padding:'2px 8px',
      fontSize:'.72rem', fontWeight:600, color:'#374151', background:'#f8fafc',
      marginRight:4, marginBottom:2 }}>
      {label}
      {formatted && <span style={{ color:'#16a34a', fontWeight:700 }}>{formatted}</span>}
    </span>
  )
}

// ── Modal ────────────────────────────────────────────────────
function extractGroupRules(options) {
  const list = Array.isArray(options) ? options : []
  const meta = list.find(item => item && item.__meta_type === 'selection_rules')
  return {
    min_select: Math.max(0, parseInt(meta?.min_select, 10) || 0),
    max_select: Math.max(0, parseInt(meta?.max_select, 10) || 1),
  }
}

function stripGroupRules(options) {
  return (Array.isArray(options) ? options : []).filter(item => item?.__meta_type !== 'selection_rules')
}

function buildGroupOptionsPayload(options, minSelect, maxSelect) {
  return [
    {
      __meta_type: 'selection_rules',
      min_select: Math.max(0, parseInt(minSelect, 10) || 0),
      max_select: Math.max(0, parseInt(maxSelect, 10) || 1),
    },
    ...options,
  ]
}

function GroupModal({ open, onClose, onSave, editData, saleCategories, saleOptions, decimalPlaces }) {
  const [form, setForm] = useState({ name:'', category_id:'', min_select:0, max_select:1, options:[] })

  useEffect(() => {
    if (!open) return
    if (editData) {
      const cleanOptions = stripGroupRules(editData.options)
      const rules = extractGroupRules(editData.options)
      setForm({
        name: editData.name || '',
        category_id: editData.category_id || '',
        min_select: rules.min_select,
        max_select: rules.max_select,
        options: cleanOptions.length
          ? cleanOptions.map(o => ({ _id:uid(), option_id: o.option_id||'', name:o.name||'', price:o.price??'' }))
          : []
      })
    } else {
      setForm({ name:'', category_id:'', min_select:0, max_select:1, options:[] })
    }
  }, [open, editData])

  function setField(k, v) { setForm(f => ({ ...f, [k]:v })) }

  function addOption() {
    setForm(f => ({ ...f, options:[...f.options, { _id:uid(), option_id:'', name:'', price:'' }] }))
  }

  function setOption(idx, k, v) {
    setForm(f => {
      const opts = [...f.options]
      if (k === 'option_id') {
        // Seçenek seçilince adı ve fiyatı otomatik doldur
        const opt = saleOptions.find(o => o.id === v)
        // channel_prices — aktif olan ilk kanalın fiyatını al
        const cps = Array.isArray(opt?.channel_prices)
          ? opt.channel_prices
          : (typeof opt?.channel_prices === 'string' ? JSON.parse(opt.channel_prices||'[]') : [])
        // Önce active+fiyatlı, sonra sadece active, sonra fiyatlı olan, sonra ilk kayıt
        const activeCp = cps.find(cp => (cp.active===true||cp.active==='true') && parseFloat(cp.price)>0)
          || cps.find(cp => cp.active===true || cp.active==='true')
          || cps.find(cp => parseFloat(cp.price)>0)
          || cps[0]
        const firstPrice = activeCp ? parseFloat(activeCp.price) || 0 : 0
        opts[idx] = { ...opts[idx], option_id:v, name: opt?.name||'', price: firstPrice }
      } else {
        opts[idx] = { ...opts[idx], [k]:v }
      }
      return { ...f, options:opts }
    })
  }

  function removeOption(idx) {
    setForm(f => ({ ...f, options:f.options.filter((_,i) => i!==idx) }))
  }

  function handleSave() {
    const cleanOpts = form.options
      .filter(o => o.option_id || o.name.trim())
      .map(o => ({ option_id:o.option_id||null, name:o.name.trim(), price:parseFloat(o.price)||0 }))
    onSave({
      name:form.name.trim(),
      category_id:form.category_id||null,
      options: buildGroupOptionsPayload(cleanOpts, form.min_select, form.max_select),
    })
  }

  const flatCatList = flatCats(saleCategories)
  const categoryOptions = flatCatList.map(category => ({
    value: category.id,
    label: category.name,
    selectedLabel: catAncestry(saleCategories, category.id).map(item => item.name).join(' > '),
    searchText: catAncestry(saleCategories, category.id).map(item => item.name).join(' '),
    indent: category._depth,
    icon: category._depth > 0 ? 'fa-folder-tree' : 'fa-folder',
  }))
  const optionChoices = saleOptions.map(option => ({
    value: option.id,
    label: option.name,
    searchText: option.name,
    meta: 'Secenek',
  }))
  if (!open) return null

  return (
    <div className="modal-bg open">
      <div className="modal-box" style={{ width:'min(96vw, 600px)', maxHeight:'92vh', display:'flex', flexDirection:'column' }}>

        <div className="modal-head" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10,
              background:'linear-gradient(135deg,#6366f1,#a855f7)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <i className="fa-solid fa-layer-group" style={{ color:'#fff', fontSize:'.9rem' }}/>
            </div>
            <h2 style={{ margin:0, fontSize:'1.05rem', fontWeight:800, color:'#0f172a' }}>
              {editData ? 'Grubu Düzenle' : 'Yeni Seçenek Grubu'}
            </h2>
          </div>
          <button className="ico-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark"/>
          </button>
        </div>

        <div className="modal-body" style={{ flex:1, overflowY:'auto', display:'grid', gap:16 }}>

          {/* Grup Adı */}
          <div>
            <label className="f-label">Grup Adı <span style={{ color:'#ef4444' }}>*</span></label>
            <input className="f-input" placeholder="örn: Sos Seçimi, Pişirme Tercihi..."
              value={form.name} onChange={e => setField('name', e.target.value)} />
            <p style={{ fontSize:'.72rem', color:'#94a3b8', margin:'4px 0 0' }}>
              Bu grup adı satış malında seçenek grubu olarak görünür.
            </p>
          </div>

          {/* Kategori */}
          <div>
            <label className="f-label">Kategori</label>
            <SearchableSelect
              value={form.category_id}
              onChange={nextValue => setField('category_id', nextValue)}
              options={categoryOptions}
              placeholder="Tum kategoriler icin gecerli"
              searchPlaceholder="Kategori ara..."
              clearLabel="Kategoriyi temizle"
            />
            <p style={{ fontSize:'.72rem', color:'#94a3b8', margin:'4px 0 0' }}>
              Boş bırakırsanız tüm ürünlerde görünür.
            </p>
          </div>

          {/* Seçenekler */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="f-label">Min. Seçim</label>
              <input
                className="f-input"
                type="number"
                min="0"
                value={form.min_select}
                onChange={e => setField('min_select', Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
            <div>
              <label className="f-label">Max. Seçim</label>
              <input
                className="f-input"
                type="number"
                min="0"
                value={form.max_select}
                onChange={e => setField('max_select', Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
          </div>

          <div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
              <label className="f-label" style={{ margin:0, display:'flex', alignItems:'center', gap:7 }}>
                <i className="fa-solid fa-list-ul" style={{ color:'#6366f1' }}/>
                Seçenekler
                {form.options.length > 0 && (
                  <span style={{ background:'#6366f1', color:'#fff', borderRadius:99,
                    fontSize:'.7rem', fontWeight:700, padding:'1px 7px' }}>
                    {form.options.length}
                  </span>
                )}
              </label>
              <button onClick={addOption}
                style={{ background:'linear-gradient(135deg,#6366f1,#8b5cf6)', color:'#fff',
                  border:'none', borderRadius:9, padding:'6px 14px', fontSize:'.8rem',
                  fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                <i className="fa-solid fa-plus"/> Seçenek Ekle
              </button>
            </div>

            {form.options.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px', color:'#94a3b8', fontSize:'.82rem',
                background:'#f8fafc', borderRadius:10, border:'1.5px dashed #e2e8f0' }}>
                <i className="fa-solid fa-sliders" style={{ fontSize:'1.2rem', marginBottom:6, display:'block' }}/>
                Henüz seçenek eklenmedi. "Seçenek Ekle" butonuna tıklayın.
              </div>
            ) : (
              <div style={{ display:'grid', gap:8 }}>
                {/* Başlık satırı */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 36px', gap:8 }}>
                  <span style={{ fontSize:'.68rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em' }}>Seçenek</span>
                  <span style={{ fontSize:'.68rem', fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'.06em' }}>Fiyat (₺) <i className="fa-solid fa-lock" style={{fontSize:'.55rem',opacity:.5}}/></span>
                  <span/>
                </div>
                {form.options.map((opt, idx) => (
                  <div key={opt._id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 36px', gap:8, alignItems:'center' }}>
                    {/* Seçenek Adı — sale_options dropdown */}
                    <SearchableSelect
                      value={opt.option_id}
                      onChange={nextValue => setOption(idx, 'option_id', nextValue)}
                      options={optionChoices}
                      placeholder="Secenek secin..."
                      searchPlaceholder="Secenek ara..."
                      clearLabel="Secimi temizle"
                    />
                    {/* Fiyat farkı — salt okunur, ilk aktif kanalın fiyatı */}
                    <input className="f-input"
                      value={opt.option_id ? (parseFloat(opt.price)||0).toFixed(decimalPlaces) : ''}
                      readOnly
                      placeholder="—"
                      style={{ textAlign:'right', background:'#f1f5f9', color:'#475569',
                        cursor:'not-allowed', borderColor:'#e2e8f0', fontFamily:'monospace', fontWeight:700 }} />
                    {/* Sil */}
                    <button onClick={() => removeOption(idx)}
                      style={{ width:36, height:36, background:'#fef2f2', color:'#dc2626',
                        border:'1.5px solid #fecaca', borderRadius:8, cursor:'pointer',
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:'.85rem' }}>
                      <i className="fa-solid fa-trash"/>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot" style={{ justifyContent:'space-between' }}>
          <button className="btn-g" onClick={onClose}>İptal</button>
          <button className="btn-p" onClick={handleSave} disabled={!form.name.trim()}>
            <i className="fa-solid fa-check"/> Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────
export default function OptionGroups() {
  const toast = useToast()

  const [groups, setGroups]           = useState([])
  const [saleCategories, setSaleCats] = useState([])
  const [saleOptions, setSaleOptions] = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [filterCat, setFilterCat]     = useState('')
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [modal, setModal]             = useState(false)
  const [editData, setEditData]       = useState(null)
  const [confirm, setConfirm]         = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data:grp }, { data:cats }, { data:opts }, { data:ct }] = await Promise.all([
      db.from('option_groups').select('*').is('deleted_at',null).order('name'),
      db.from('sale_categories').select('*').order('name'),
      db.from('sale_options').select('id,name,channel_prices').is('deleted_at',null).order('name'),
      db.from('settings').select('value').eq('key','company_tree').single(),
    ])
    setGroups(grp||[])
    setSaleCats(cats||[])
    setSaleOptions(opts||[])
    // decimalPlaces şirket ağacından
    function findDecimal(nodes) {
      for (const n of nodes||[]) {
        if (n.type==='sirket' && n.decimalPlaces!==undefined) return n.decimalPlaces
        const r = findDecimal(n.children||[])
        if (r!==null) return r
      }
      return null
    }
    const dp = findDecimal(ct?.value||[])
    setDecimalPlaces(dp !== null ? dp : 2)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = groups.filter(g => {
    if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterCat && g.category_id !== filterCat) return false
    return true
  })

  async function handleSave(payload) {
    const row = { ...payload, updated_at:new Date().toISOString() }
    let err
    if (editData) {
      ({ error:err } = await db.from('option_groups').update(row).eq('id', editData.id))
    } else {
      ({ error:err } = await db.from('option_groups').insert(row))
    }
    if (err) { toast('Hata: '+err.message,'error'); return }
    toast(editData ? 'Grup güncellendi.' : 'Grup eklendi.','success')
    setModal(false); setEditData(null); fetchAll()
  }

  async function handleDelete(item) {
    const { error } = await db.from('option_groups').delete().eq('id', item.id)
    if (error) { toast('Hata: '+error.message,'error'); return }
    toast('Grup silindi.','info')
    setConfirm(null); fetchAll()
  }

  function catName(id) {
    if (!id) return null
    return catAncestry(saleCategories, id).map(c => c.name).join(' › ')
  }
  function catColor(id) {
    if (!id) return null
    const cat = saleCategories.find(c => c.id === id)
    return cat ? { bg:cat.bg||'#e0f2fe', color:cat.text_color||'#0369a1' } : null
  }

  const flatCatList = flatCats(saleCategories)
  const filterCategoryOptions = flatCatList.map(category => ({
    value: category.id,
    label: category.name,
    selectedLabel: catAncestry(saleCategories, category.id).map(item => item.name).join(' > '),
    searchText: catAncestry(saleCategories, category.id).map(item => item.name).join(' '),
    indent: category._depth,
    icon: category._depth > 0 ? 'fa-folder-tree' : 'fa-folder',
  }))

  return (
    <div>
      <Header
        title="Seçenek Grupları"
        subtitle={`${filtered.length} seçenek grubu`}
        actions={
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <AddButton onClick={() => { setEditData(null); setModal(true) }} label="Seçenek Grubu Ekle" />
          </div>
        }
      />

      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:'1 1 240px', minWidth:200 }}>
          <i className="fa-solid fa-magnifying-glass" style={{
            position:'absolute', left:11, top:'50%', transform:'translateY(-50%)',
            color:'#94a3b8', fontSize:'.85rem', pointerEvents:'none'
          }}/>
          <input className="f-input" placeholder="Seçenek grubu ara..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft:32 }} />
        </div>
        <div style={{ flex:'1 1 200px', minWidth:180 }}>
          <SearchableSelect
            value={filterCat}
            onChange={nextValue => setFilterCat(nextValue)}
            options={filterCategoryOptions}
            placeholder="Tum kategoriler"
            searchPlaceholder="Kategori ara..."
            clearLabel="Kategori filtresini temizle"
          />
        </div>
      </div>

      {/* Tablo */}
      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin"/> Yükleniyor…
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width:50 }}>#</th>
                <th>GRUP ADI</th>
                <th>KATEGORİ</th>
                <th>SEÇENEKLER</th>
                <th style={{ width:100 }}>İŞLEM</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5}>
                  <div style={{ padding:'40px 0', textAlign:'center', color:'#94a3b8' }}>
                    <i className="fa-solid fa-layer-group" style={{ fontSize:'2rem', marginBottom:10, display:'block' }}/>
                    <p style={{ margin:0 }}>Seçenek grubu bulunamadı</p>
                  </div>
                </td></tr>
              ) : filtered.map((g, idx) => {
                const cc = catColor(g.category_id)
                const cn = catName(g.category_id)
                const opts = stripGroupRules(g.options)
                return (
                  <tr key={g.id}>
                    <td style={{ color:'#94a3b8', fontWeight:600 }}>{idx+1}</td>
                    <td style={{ fontWeight:700, color:'#0f172a' }}>{g.name}</td>
                    <td>
                      {cn
                        ? <span className="badge" style={{ background:cc?.bg||'#e0f2fe', color:cc?.color||'#0369a1' }}>{cn}</span>
                        : <span style={{ color:'#cbd5e1', fontSize:'.78rem' }}>Tüm kategoriler</span>
                      }
                    </td>
                    <td>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                        {opts.length === 0
                          ? <span style={{ color:'#cbd5e1', fontSize:'.78rem' }}>—</span>
                          : opts.map((o,i) => <OptionChip key={i} label={o.name} price={o.price}/>)
                        }
                      </div>
                    </td>
                    <td>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="ico-btn edit" onClick={() => { setEditData(g); setModal(true) }}>
                          <i className="fa-solid fa-pen"/>
                        </button>
                        <button className="ico-btn del" onClick={() => setConfirm(g)}>
                          <i className="fa-solid fa-trash"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <GroupModal
        open={modal}
        onClose={() => { setModal(false); setEditData(null) }}
        onSave={handleSave}
        editData={editData}
        saleCategories={saleCategories}
        saleOptions={saleOptions}
        decimalPlaces={decimalPlaces}
      />

      <ConfirmDialog
        open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        onConfirm={() => handleDelete(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
