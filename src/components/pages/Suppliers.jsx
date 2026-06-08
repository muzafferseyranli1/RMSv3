import { useEffect, useState, useCallback } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import SearchableSelect from '@/components/ui/SearchableSelect'

function MultiEntry({ label, hint, values, onChange, placeholder, type = 'text' }) {
  function add()    { onChange([...values, '']) }
  function remove(i){ onChange(values.filter((_,idx)=>idx!==i)) }
  function update(i,v){ onChange(values.map((x,idx)=>idx===i?v:x)) }
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <label className="f-label" style={{margin:0}}>{label}</label>
        <button onClick={add} style={{fontSize:'.72rem',color:'#d97706',background:'#fef3c7',
          border:'1px solid #fbbf24',borderRadius:6,padding:'2px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
          <i className="fa-solid fa-plus" style={{fontSize:'.6rem'}}/> Ekle
        </button>
      </div>
      {hint && <p className="f-hint" style={{marginBottom:6}}>{hint}</p>}
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {values.length === 0
          ? <div style={{fontSize:'.78rem',color:'#94a3b8',fontStyle:'italic',padding:'4px 0'}}>Henüz eklenmedi</div>
          : values.map((v,i)=>(
            <div key={i} style={{display:'flex',gap:6,alignItems:'center'}}>
              <input className="f-input" type={type} value={v} onChange={e=>update(i,e.target.value)} placeholder={placeholder}/>
              <button className="ico-btn del" onClick={()=>remove(i)}><i className="fa-solid fa-xmark"/></button>
            </div>
          ))}
      </div>
    </div>
  )
}

function YetkiliList({ values, onChange }) {
  function add()    { onChange([...values, {ad:'',mail:'',telefon:''}]) }
  function remove(i){ onChange(values.filter((_,idx)=>idx!==i)) }
  function update(i,k,v){ onChange(values.map((x,idx)=>idx===i?{...x,[k]:v}:x)) }
  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
        <label className="f-label" style={{margin:0}}>Yetkili Kişiler</label>
        <button onClick={add} style={{fontSize:'.72rem',color:'#d97706',background:'#fef3c7',
          border:'1px solid #fbbf24',borderRadius:6,padding:'2px 8px',cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
          <i className="fa-solid fa-plus" style={{fontSize:'.6rem'}}/> Yetkili Ekle
        </button>
      </div>
      <p className="f-hint" style={{marginBottom:8}}>Birden fazla yetkili eklenebilir</p>
      {values.length === 0
        ? <div style={{fontSize:'.78rem',color:'#94a3b8',fontStyle:'italic'}}>Henüz yetkili eklenmedi</div>
        : values.map((y,i)=>(
          <div key={i} style={{background:'#f8fafc',borderRadius:10,padding:'12px',marginBottom:8,border:'1px solid #e2e8f0'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:'.78rem',fontWeight:700,color:'#64748b'}}>Yetkili {i+1}</span>
              <button className="ico-btn del" onClick={()=>remove(i)}><i className="fa-solid fa-xmark"/></button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
              <div><label className="f-label">Ad Soyad</label>
                <input className="f-input" value={y.ad} onChange={e=>update(i,'ad',e.target.value)} placeholder="Ad Soyad"/></div>
              <div><label className="f-label">E-posta</label>
                <input className="f-input" type="email" value={y.mail} onChange={e=>update(i,'mail',e.target.value)} placeholder="mail@firma.com"/></div>
              <div><label className="f-label">Telefon</label>
                <input className="f-input" value={y.telefon} onChange={e=>update(i,'telefon',e.target.value)} placeholder="05xx xxx xx xx"/></div>
            </div>
          </div>
        ))}
    </div>
  )
}

const FATURA_OPTS = [
  {value:'e-fatura',label:'E-Fatura'},{value:'e-arsiv',label:'E-Arşiv'},
  {value:'kagit',label:'Kağıt Fatura'},{value:'fis',label:'Parakende Satış Fişi'},
]
const SIPARIS_OPTS = [
  {value:'email',label:'E-Mail'},{value:'telefon',label:'Telefon'},
  {value:'whatsapp',label:'Whatsapp'},{value:'entegrasyon',label:'Entegrasyon'},
  {value:'portal',label:'Suitable Tedarikçi Arayüzü'},
]
const TABS = [
  {label:'Genel Bilgiler',icon:'fa-building'},
  {label:'Yetkili & İletişim',icon:'fa-users'},
  {label:'Sipariş Ayarları',icon:'fa-cart-shopping'},
]
const EMPTY = {
  cari_kodu:'',muhasebe_kodu:'',karsi_taraf_kodu:'',
  name:'',marka_kisa_adi:'',yetkililer:[],
  sirket_tipi:'tuzel',vergi_dairesi:'',vergi_no:'',tc_no:'',
  fatura_tipi:'e-arsiv',pay_term:30,banka:'',iban:'',
  siparis_yontemi:'email',siparis_mailleri:[],siparis_telefonlari:[],siparis_wa_no:'',
  logo_url:'',cat:'',address:'',notes:'',active:true,
  supplier_kind:'external',
}

export default function Suppliers() {
  const toast = useToast()
  const [items,setItems] = useState([])
  const [loading,setLoading] = useState(true)
  const [search,setSearch] = useState('')
  const [statusFilter,setStatusFilter] = useState('')
  const [showDeleted,setShowDeleted] = useState(false)
  const [modal,setModal] = useState(false)
  const [tab,setTab] = useState(0)
  const [form,setForm] = useState(EMPTY)
  const [editId,setEditId] = useState(null)
  const [confirm,setConfirm] = useState(null)

  const load = useCallback(async()=>{
    setLoading(true)
    const {data,error} = await db.from('suppliers').select('*').order('name')
    if(error) toast('Yüklenemedi: '+error.message,'error')
    else setItems(data||[])
    setLoading(false)
  },[])
  useEffect(()=>{load()},[load])

  const filtered = items.filter(i=>{
    if (!showDeleted && i.deleted_at) return false
    const q=search.toLowerCase()
    return (!q||i.name?.toLowerCase().includes(q)||i.cari_kodu?.toLowerCase().includes(q)||i.marka_kisa_adi?.toLowerCase().includes(q))
      && (!statusFilter||String(i.active)===statusFilter)
  })

  function openAdd(){setForm(EMPTY);setEditId(null);setTab(0);setModal(true)}
  function openEdit(s){
    setForm({
      cari_kodu:s.cari_kodu||'',muhasebe_kodu:s.muhasebe_kodu||'',karsi_taraf_kodu:s.karsi_taraf_kodu||'',
      name:s.name||'',marka_kisa_adi:s.marka_kisa_adi||'',yetkililer:s.yetkililer||[],
      sirket_tipi:s.sirket_tipi||'tuzel',vergi_dairesi:s.vergi_dairesi||'',vergi_no:s.vergi_no||'',tc_no:s.tc_no||'',
      fatura_tipi:s.fatura_tipi||'e-arsiv',pay_term:s.pay_term||30,banka:s.banka||'',iban:s.iban||'',
      siparis_yontemi:s.siparis_yontemi||'email',siparis_mailleri:s.siparis_mailleri||[],
      siparis_telefonlari:s.siparis_telefonlari||[],siparis_wa_no:s.siparis_wa_no||'',
      logo_url:s.logo_url||'',cat:s.cat||'',address:s.address||'',notes:s.notes||'',active:s.active!==false,
      supplier_kind:s.supplier_kind||'external',
    })
    setEditId(s.id);setTab(0);setModal(true)
  }
  function closeModal(){setModal(false);setForm(EMPTY);setEditId(null)}

  async function save(){
    if(!form.name.trim()){toast('Tedarikçi adı zorunludur','error');setTab(0);return}
    const payload={
      cari_kodu:form.cari_kodu.trim()||null,muhasebe_kodu:form.muhasebe_kodu.trim()||null,
      karsi_taraf_kodu:form.karsi_taraf_kodu.trim()||null,name:form.name.trim(),
      marka_kisa_adi:form.marka_kisa_adi.trim()||null,
      yetkililer:form.yetkililer.filter(y=>y.ad||y.mail||y.telefon),
      sirket_tipi:form.sirket_tipi,vergi_dairesi:form.vergi_dairesi.trim()||null,
      vergi_no:form.vergi_no.trim()||null,tc_no:form.tc_no.trim()||null,
      fatura_tipi:form.fatura_tipi,pay_term:parseInt(form.pay_term)||30,
      banka:form.banka.trim()||null,iban:form.iban.trim()||null,
      siparis_yontemi:form.siparis_yontemi,
      siparis_mailleri:form.siparis_mailleri.filter(Boolean),
      siparis_telefonlari:form.siparis_telefonlari.filter(Boolean),
      siparis_wa_no:form.siparis_wa_no.trim()||null,
      logo_url:form.logo_url||null,cat:form.cat.trim()||null,
      address:form.address.trim()||null,notes:form.notes.trim()||null,active:form.active,
      supplier_kind:form.supplier_kind||'external',
    }
    if(editId){
      const {error}=await db.from('suppliers').update(payload).eq('id',editId)
      if(error){toast('Hata: '+error.message,'error');return}
      toast(`"${payload.name}" güncellendi`,'success')
    } else {
      const {error}=await db.from('suppliers').insert(payload)
      if(error){toast('Hata: '+error.message,'error');return}
      toast(`"${payload.name}" eklendi`,'success')
    }
    closeModal();load()
  }

  async function remove(item){
    if (item.supplier_kind && item.supplier_kind !== 'external') {
      toast('İç tedarikçiler silinemez; Şirket Kuruluşu ekranından yönetilmelidir.', 'error')
      return
    }
    const {error}=await db.from('suppliers').update({deleted_at: new Date().toISOString()}).eq('id',item.id)
    if(error) toast('Silinemedi: '+error.message,'error')
    else{toast(`"${item.name}" silindi — geri alınabilir`,'info');load()}
    setConfirm(null)
  }

  async function restoreItem(item){
    if (item.supplier_kind && item.supplier_kind !== 'external') {
      toast('İç tedarikçiler geri yüklenemez; Şirket Kuruluşu ekranından yönetilmelidir.', 'error')
      return
    }
    const {error}=await db.from('suppliers').update({deleted_at: null}).eq('id',item.id)
    if(error) toast('Geri alınamadı: '+error.message,'error')
    else{toast(`"${item.name}" geri alındı`,'success');load()}
  }

  const set=(k,v)=>setForm(f=>({...f,[k]:v}))

  function handleLogo(e){
    const file=e.target.files[0];if(!file) return
    const reader=new FileReader()
    reader.onload=ev=>set('logo_url',ev.target.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className="page-enter">
      <Header title="Tedarikçiler" subtitle={`${filtered.length} tedarikçi`}
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
          <AddButton onClick={openAdd} label="Tedarikçi Ekle" />
        </>}/>

      <div className="card" style={{padding:14,display:'flex',gap:10,marginBottom:14}}>
        <div style={{position:'relative',flex:1}}>
          <i className="fa-solid fa-search" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',fontSize:'.75rem'}}/>
          <input className="f-input" placeholder="Ad, cari kodu veya marka ara…" style={{paddingLeft:30}}
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div style={{minWidth:140}}>
          <SearchableSelect
            value={statusFilter}
            onChange={v=>setStatusFilter(v)}
            options={[
              {value:'',label:'Tüm Durumlar'},
              {value:'true',label:'Aktif'},
              {value:'false',label:'Pasif'},
            ]}
            allowClear={false}
          />
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}><i className="fa-solid fa-spinner fa-spin"/> Yükleniyor…</div> : (
          <table className="tbl">
            <thead><tr><th>Tedarikçi</th><th>Cari Kodu</th><th>Şirket Tipi</th><th>Vade</th><th>Fatura</th><th>Durum</th><th>İşlem</th></tr></thead>
            <tbody>
              {filtered.length===0
                ? <tr><td colSpan={7}><div className="empty"><i className="fa-solid fa-truck"/><p>Tedarikçi bulunamadı</p></div></td></tr>
                : filtered.map(item=>(
                  <tr key={item.id} className={item.deleted_at?'deleted':''}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        {item.logo_url && <img src={item.logo_url} style={{width:28,height:28,borderRadius:6,objectFit:'contain',border:'1px solid #e2e8f0'}} alt=""/>}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <div className={`row-name ${item.deleted_at?'row-deleted':''}`} style={{fontWeight:700,color:'#0f172a'}}>{item.name}</div>
                            {item.supplier_kind === 'internal_warehouse' && (
                              <span className="badge" style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.65rem', padding: '1px 6px' }}>İç Depo</span>
                            )}
                            {item.supplier_kind === 'internal_kitchen' && (
                              <span className="badge" style={{ background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe', fontSize: '0.65rem', padding: '1px 6px' }}>Merkez Mutfak</span>
                            )}
                          </div>
                          {item.marka_kisa_adi && <div style={{fontSize:'.74rem',color:'#94a3b8'}}>{item.marka_kisa_adi}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span style={{fontFamily:'monospace',fontSize:'.82rem'}}>{item.cari_kodu||'—'}</span></td>
                    <td><span className={`badge ${item.sirket_tipi==='tuzel'?'bb':'by'}`}>{item.sirket_tipi==='tuzel'?'Tüzel':'Şahıs'}</span></td>
                    <td><span className="badge bgr">{item.pay_term||'—'} gün</span></td>
                    <td style={{fontSize:'.8rem',color:'#64748b'}}>{FATURA_OPTS.find(f=>f.value===item.fatura_tipi)?.label||'—'}</td>
                    <td><span className={`badge ${item.active?'bg':'br'}`}>{item.active?'Aktif':'Pasif'}</span></td>
                    <td><div style={{display:'flex',gap:3}}>
                      {item.deleted_at ? (
                        !(item.supplier_kind && item.supplier_kind !== 'external') && (
                          <button className="ico-btn" title="Geri Al" onClick={()=>restoreItem(item)}
                            style={{color:'#16a34a',background:'#d1fae5'}}>
                            <i className="fa-solid fa-rotate-left"/>
                          </button>
                        )
                      ) : (
                        <>
                          <button className="ico-btn edit" onClick={()=>openEdit(item)}><i className="fa-solid fa-pen"/></button>
                          {!(item.supplier_kind && item.supplier_kind !== 'external') && (
                            <button className="ico-btn del" onClick={()=>setConfirm(item)}><i className="fa-solid fa-trash"/></button>
                          )}
                        </>
                      )}
                    </div></td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modal}
        onClose={closeModal}
        width={680}
        flex
        title={editId ? 'Tedarikçi Düzenle' : 'Tedarikçi Ekle'}
        tabs={
          <div style={{display:'flex',gap:2,background:'#dde3ec',borderRadius:10,padding:3}}>
            {TABS.map((t,i)=>(
              <button key={i} onClick={()=>setTab(i)} style={{flex:1,padding:'7px 4px',border:'none',borderRadius:8,
                fontSize:'.78rem',fontWeight:700,cursor:'pointer',transition:'.15s',
                background:tab===i?'linear-gradient(135deg,#f59e0b,#fbbf24)':'transparent',color:tab===i?'#0f172a':'#64748b'}}>
                <i className={`fa-solid ${t.icon}`} style={{marginRight:4}}/>{t.label}
              </button>
            ))}
          </div>
        }
        footer={
          <div style={{display:'flex',justifyContent:'space-between',width:'100%'}}>
            <div style={{display:'flex',gap:6}}>
              {tab>0 && <button className="btn-o" onClick={()=>setTab(t=>t-1)} style={{fontSize:'.83rem'}}><i className="fa-solid fa-chevron-left"/> Geri</button>}
              {tab<TABS.length-1 && <button className="btn-o" onClick={()=>setTab(t=>t+1)} style={{fontSize:'.83rem'}}>İleri <i className="fa-solid fa-chevron-right"/></button>}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn-g" onClick={closeModal}>İptal</button>
              <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
            </div>
          </div>
        }
      >
        {tab===0 && (
          (() => {
            const isInternal = form.supplier_kind && form.supplier_kind !== 'external';
            return (
              <div style={{display:'grid',gap:14}}>
                {isInternal && (
                  <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,
                    padding:'8px 12px',display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    <i className="fa-solid fa-circle-info" style={{color:'#16a34a'}}/>
                    <span style={{fontSize:'.78rem',color:'#15803d',fontWeight:600}}>
                      Bu tedarikçi sistem tarafından otomatik olarak yönetilmektedir. Ünvan ve durum alanı Şirket Kuruluşu sayfasıyla senkronizedir.
                    </span>
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div><label className="f-label">Cari Kodu</label>
                    <input className="f-input" value={form.cari_kodu} onChange={e=>set('cari_kodu',e.target.value)} placeholder="CARİ-001"/></div>
                  <div><label className="f-label">Muhasebe Kodu</label>
                    <input className="f-input" value={form.muhasebe_kodu} onChange={e=>set('muhasebe_kodu',e.target.value)} placeholder="320.001"/></div>
                  <div><label className="f-label">Karşı Taraf Cari Kodu</label>
                    <input className="f-input" value={form.karsi_taraf_kodu} onChange={e=>set('karsi_taraf_kodu',e.target.value)} placeholder="Karşı tarafın kodu"/>
                    <p className="f-hint">Sipariş ve entegrasyonlarda kullanılır</p></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div><label className="f-label">Tedarikçi Adı (Ünvanı) <span style={{color:'#ef4444'}}>*</span></label>
                    <input className="f-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Şirket ünvanı" disabled={isInternal} style={{background:isInternal?'#f1f5f9':''}}/></div>
                  <div><label className="f-label">Marka / Kısa Adı</label>
                    <input className="f-input" value={form.marka_kisa_adi} onChange={e=>set('marka_kisa_adi',e.target.value)} placeholder="Bilinen kısa isim"/></div>
                </div>
                <div>
                  <label className="f-label">Şirket Tipi</label>
                  <div style={{display:'flex',gap:10}}>
                    {[{value:'tuzel',label:'Tüzel Kişilik'},{value:'sahis',label:'Şahıs Şirketi'}].map(o=>(
                      <label key={o.value} style={{display:'flex',alignItems:'center',gap:6,cursor:isInternal?'not-allowed':'pointer',
                        padding:'8px 16px',borderRadius:10,border:`1.5px solid ${form.sirket_tipi===o.value?'#fbbf24':'#c4cdd9'}`,
                        background:form.sirket_tipi===o.value?'#fffbeb':'#fff',fontWeight:600,fontSize:'.855rem',opacity:isInternal?0.7:1}}>
                        <input type="radio" name="sirket_tipi" value={o.value} checked={form.sirket_tipi===o.value}
                          disabled={isInternal}
                          onChange={()=>set('sirket_tipi',o.value)} style={{accentColor:'#fbbf24'}}/>
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div><label className="f-label">Vergi Dairesi</label>
                    <input className="f-input" value={form.vergi_dairesi} onChange={e=>set('vergi_dairesi',e.target.value)} placeholder="Vergi dairesi"/></div>
                  <div><label className="f-label">Vergi No</label>
                    <input className="f-input" value={form.vergi_no} onChange={e=>set('vergi_no',e.target.value)} placeholder="1234567890"/></div>
                  <div><label className="f-label">TC No <span style={{fontSize:'.68rem',color:'#94a3b8',fontWeight:400}}>(şahıs için)</span></label>
                    <input className="f-input" value={form.tc_no} onChange={e=>set('tc_no',e.target.value)} placeholder="11 haneli TC"
                      disabled={form.sirket_tipi==='tuzel' || isInternal} style={{background:(form.sirket_tipi==='tuzel' || isInternal)?'#f1f5f9':''}}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
                  <div><label className="f-label">Fatura Tipi</label>
                    <SearchableSelect value={form.fatura_tipi} onChange={v=>set('fatura_tipi',v)} options={FATURA_OPTS} allowClear={false} disabled={isInternal}/>
                  </div>
                  <div><label className="f-label">Ödeme Vadesi (gün)</label>
                    <input className="f-input" type="number" min="0" value={form.pay_term} onChange={e=>set('pay_term',e.target.value)}/></div>
                  <div style={{display:'flex',alignItems:'center',gap:8,paddingTop:22}}>
                    <label className="tog" style={{cursor:isInternal?'not-allowed':'pointer'}}><input type="checkbox" checked={form.active} onChange={e=>set('active',e.target.checked)} disabled={isInternal}/><span className="tog-sl" style={{opacity:isInternal?0.5:1}}/></label>
                    <span style={{fontSize:'.855rem',fontWeight:600,color:isInternal?'#94a3b8':'#334155'}}>Aktif</span>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div><label className="f-label">Banka</label>
                    <input className="f-input" value={form.banka} onChange={e=>set('banka',e.target.value)} placeholder="Banka adı"/></div>
                  <div><label className="f-label">IBAN</label>
                    <input className="f-input" value={form.iban} onChange={e=>set('iban',e.target.value)} placeholder="TR00 0000 0000..." style={{fontFamily:'monospace'}}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div><label className="f-label">Adres</label>
                    <textarea className="f-input" rows={2} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Adres…" style={{resize:'vertical'}}/></div>
                  <div><label className="f-label">Notlar</label>
                    <textarea className="f-input" rows={2} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Notlar…" style={{resize:'vertical'}}/></div>
                </div>
                <div><label className="f-label">Marka Logosu</label>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <label style={{cursor:'pointer'}}>
                      <span className="btn-o" style={{fontSize:'.8rem',padding:'7px 14px'}}><i className="fa-solid fa-upload"/> Yükle</span>
                      <input type="file" accept="image/*" style={{display:'none'}} onChange={handleLogo}/>
                    </label>
                    {form.logo_url && <>
                      <img src={form.logo_url} style={{height:32,borderRadius:6,border:'1px solid #e2e8f0'}} alt="logo"/>
                      <button className="btn-g" onClick={()=>set('logo_url','')} style={{fontSize:'.75rem'}}>Kaldır</button>
                    </>}
                  </div>
                </div>
              </div>
            );
          })()
        )}

        {tab===1 && <div style={{display:'grid',gap:16}}>
          <YetkiliList values={form.yetkililer} onChange={v=>set('yetkililer',v)}/>
        </div>}

        {tab===2 && <div style={{display:'grid',gap:16}}>
          <div><label className="f-label">Sipariş İletme Yöntemi</label>
            <SearchableSelect value={form.siparis_yontemi} onChange={v=>set('siparis_yontemi',v)} options={SIPARIS_OPTS} allowClear={false}/>
          </div>
          <MultiEntry label="Sipariş Maili" hint="Birden fazla olabilir"
            values={form.siparis_mailleri} onChange={v=>set('siparis_mailleri',v)}
            placeholder="siparis@firma.com" type="email"/>
          <MultiEntry label="Sipariş Telefonu" hint="Birden fazla olabilir"
            values={form.siparis_telefonlari} onChange={v=>set('siparis_telefonlari',v)}
            placeholder="05xx xxx xx xx"/>
          <div><label className="f-label">Sipariş WhatsApp No</label>
            <input className="f-input" value={form.siparis_wa_no} onChange={e=>set('siparis_wa_no',e.target.value)} placeholder="905xxxxxxxxx"/></div>
        </div>}
      </Modal>

      <ConfirmDialog open={!!confirm} title={`"${confirm?.name}" silinsin mi?`}
        desc="Silinen kayıt geri alınabilir. Yetkili kişi 'Silinmişleri göster' seçeneğinden geri yükleyebilir."
        onConfirm={()=>remove(confirm)} onCancel={()=>setConfirm(null)}/>
    </div>
  )
}
