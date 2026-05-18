import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const EMPTY = { name: '', label: '', symbol: '' }

export default function Units() {
  const toast = useToast()
  const [units, setUnits]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [modal, setModal]     = useState(false)
  const [form, setForm]       = useState(EMPTY)
  const [editId, setEditId]   = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch]   = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await db
      .from('units')
      .select('*')
      .order('is_system', { ascending: false })
      .order('sort_order')
      .order('label')
    if (error) toast('Yüklenemedi: ' + error.message, 'error')
    else setUnits(data || [])
    setLoading(false)
  }

  const filtered = units.filter(u => {
    if (!showDeleted && u.deleted_at) return false
    return !search || u.label.toLowerCase().includes(search.toLowerCase()) ||
      u.name.toLowerCase().includes(search.toLowerCase())
  })
  const systemUnits = filtered.filter(u => u.is_system)
  const customUnits = filtered.filter(u => !u.is_system)

  function openAdd()  { setForm(EMPTY); setEditId(null); setModal(true) }
  function openEdit(u){ setForm({ name: u.name, label: u.label, symbol: u.symbol || '' }); setEditId(u.id); setModal(true) }
  function closeModal(){ setModal(false); setForm(EMPTY); setEditId(null) }

  async function save() {
    if (!form.label.trim()) { toast('Birim adı zorunludur', 'error'); return }
    if (!form.name.trim())  { toast('Kısa kod zorunludur', 'error'); return }

    const payload = {
      name:   form.name.trim().toLowerCase().replace(/\s+/g, '_'),
      label:  form.label.trim(),
      symbol: form.symbol.trim() || null,
      is_system: false,
    }

    if (editId) {
      const { error } = await db.from('units').update(payload).eq('id', editId)
      if (error) { toast('Hata: ' + error.message, 'error'); return }
      toast('Birim güncellendi', 'success')
    } else {
      const { error } = await db.from('units').insert(payload)
      if (error) {
        if (error.code === '23505') toast(`"${payload.name}" kodu zaten mevcut`, 'error')
        else toast('Hata: ' + error.message, 'error')
        return
      }
      toast('Birim eklendi', 'success')
    }
    closeModal(); load()
  }

  async function remove(unit) {
    const { error } = await db.from('units').update({deleted_at: new Date().toISOString()}).eq('id', unit.id)
    if (error) toast('Silinemedi: ' + error.message, 'error')
    else { toast(`"${unit.label}" silindi`, 'info'); load() }
    setConfirm(null)
  }

  async function restoreItem(item){
    const {error} = await db.from('units').update({deleted_at: null}).eq('id', item.id)
    if(error) toast('Geri alınamadı: '+error.message,'error')
    else { toast(`"${item.name||item.label}" geri alındı`,'success'); load() }
  }


  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const UnitRow = ({ u }) => (
    <tr className={u.deleted_at ? 'deleted' : ''}>
      <td>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:32, height:32, borderRadius:8, background: u.is_system ? '#dbeafe' : '#f0fdf4',
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <i className="fa-solid fa-weight-hanging" style={{ fontSize:'.72rem', color: u.is_system ? '#1e40af' : '#16a34a' }}/>
          </div>
          <div>
            <div className={u.deleted_at?'row-deleted':''} style={{ fontWeight:700, color:'#0f172a', fontSize:'.855rem' }}>{u.label}</div>
            {u.is_system && <div style={{ fontSize:'.7rem', color:'#94a3b8' }}>Sistem birimi</div>}
          </div>
        </div>
      </td>
      <td><span style={{ fontFamily:'monospace', fontSize:'.82rem', fontWeight:700, color:'#475569',
        background:'#f1f5f9', padding:'2px 8px', borderRadius:6 }}>{u.name}</span></td>
      <td>{u.symbol
        ? <span style={{ fontFamily:'monospace', fontSize:'.82rem', color:'#64748b' }}>{u.symbol}</span>
        : <span style={{ color:'#cbd5e1' }}>—</span>}
      </td>
      <td>
        <span className={`badge ${u.is_system ? 'bb' : 'bg'}`}>
          <i className={`fa-solid ${u.is_system ? 'fa-lock' : 'fa-user'}`} style={{ fontSize:'.65rem' }}/>
          {u.is_system ? 'Sistem' : 'Özel'}
        </span>
      </td>
      <td>
        <div style={{ display:'flex', gap:3 }}>
          {u.deleted_at ? (
            <button className="ico-btn" title="Geri Al" onClick={() => restoreItem(u)}
              style={{color:'#16a34a', background:'#d1fae5'}}>
              <i className="fa-solid fa-rotate-left"/>
            </button>
          ) : !u.is_system ? (
            <>
              <button className="ico-btn edit" onClick={() => openEdit(u)}><i className="fa-solid fa-pen"/></button>
              <button className="ico-btn del"  onClick={() => setConfirm(u)}><i className="fa-solid fa-trash"/></button>
            </>
          ) : <span style={{ color:'#cbd5e1', fontSize:'.75rem', padding:'0 6px' }}>—</span>}
        </div>
      </td>
    </tr>
  )

  return (
    <div className="page-enter">
      <Header
        title="Birim Tanımları"
        subtitle={`${units.filter(u=>!u.deleted_at||showDeleted).length} birim`}
        actions={<>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',
            fontSize:'.83rem',fontWeight:600,color:showDeleted?'#dc2626':'#64748b',
            background:showDeleted?'#fee2e2':'#f1f5f9',padding:'7px 14px',borderRadius:10,userSelect:'none'}}>
            <label className="tog" onClick={e=>e.stopPropagation()}>
              <input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/>
              <span className="tog-sl"/>
            </label>
            Silinmişleri göster
          </label>
          <AddButton onClick={openAdd} label="Birim Ekle" />
        </>}
      />

      {/* Info banner */}
      <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:12, padding:'12px 16px',
        marginBottom:16, display:'flex', alignItems:'center', gap:10, fontSize:'.83rem', color:'#1e40af' }}>
        <i className="fa-solid fa-circle-info"/>
        <span>Sistem birimleri silinemez ve düzenlenemez. Kendi biriminizi ekleyebilir, daha sonra Stok Malı formunda seçebilirsiniz.</span>
      </div>

      {/* Search */}
      <div className="card" style={{ padding:14, marginBottom:14 }}>
        <div style={{ position:'relative' }}>
          <i className="fa-solid fa-search" style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:'.75rem' }}/>
          <input className="f-input" placeholder="Birim ara…" style={{ paddingLeft:30 }}
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin"/> Yükleniyor…
        </div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="tbl">
            <thead><tr>
              <th>Birim Adı</th>
              <th>Kısa Kod</th>
              <th>Sembol</th>
              <th>Tür</th>
              <th>İşlem</th>
            </tr></thead>
            <tbody>
              {/* Sistem birimleri */}
              {systemUnits.length > 0 && <>
                <tr><td colSpan={5} style={{ background:'#f8fafc', padding:'6px 16px',
                  fontSize:'.68rem', fontWeight:800, color:'#94a3b8', letterSpacing:'.1em', textTransform:'uppercase' }}>
                  Sistem Birimleri
                </td></tr>
                {systemUnits.map(u => <UnitRow key={u.id} u={u}/>)}
              </>}
              {/* Özel birimler */}
              {customUnits.length > 0 && <>
                <tr><td colSpan={5} style={{ background:'#f8fafc', padding:'6px 16px',
                  fontSize:'.68rem', fontWeight:800, color:'#94a3b8', letterSpacing:'.1em', textTransform:'uppercase' }}>
                  Özel Birimler
                </td></tr>
                {customUnits.map(u => <UnitRow key={u.id} u={u}/>)}
              </>}
              {filtered.length === 0 && (
                <tr><td colSpan={5}>
                  <div className="empty"><i className="fa-solid fa-ruler"/><p>Birim bulunamadı</p></div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Modal open={modal} onClose={closeModal} width={440}
        title={editId ? 'Birimi Düzenle' : 'Yeni Birim Ekle'}
        footer={<>
          <button className="btn-g" onClick={closeModal}>İptal</button>
          <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
        </>}>
        <div style={{ display:'grid', gap:14 }}>
          <div>
            <label className="f-label">Birim Adı <span style={{ color:'#ef4444' }}>*</span></label>
            <input className="f-input" value={form.label} onChange={e => set('label', e.target.value)}
              placeholder="ör. Sepet, Varil, Torba"/>
            <p className="f-hint">Kullanıcıya gösterilecek isim</p>
          </div>
          <div>
            <label className="f-label">Kısa Kod <span style={{ color:'#ef4444' }}>*</span></label>
            <input className="f-input" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="ör. sepet, varil, torba" style={{ fontFamily:'monospace' }}/>
            <p className="f-hint">Benzersiz, küçük harf, boşluksuz. Sistem içinde bu kod kullanılır.</p>
          </div>
          <div>
            <label className="f-label">Sembol <span style={{ fontSize:'.7rem', color:'#94a3b8', fontWeight:400 }}>(opsiyonel)</span></label>
            <input className="f-input" value={form.symbol} onChange={e => set('symbol', e.target.value)}
              placeholder="ör. spt, vrl" style={{ fontFamily:'monospace' }}/>
            <p className="f-hint">Kısa gösterim için ör: kg, lt, ad.</p>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!confirm}
        title={`"${confirm?.label}" birimi silinsin mi?`}
        desc="Bu birimi kullanan stok malları etkilenebilir."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}/>
    </div>
  )
}
