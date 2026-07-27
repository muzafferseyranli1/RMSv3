import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddButton from '@/components/ui/AddButton'

// ── Helpers ───────────────────────────────────────────────────
function getAllBranches(tree) {
  const r = []
  function walk(n) {
    for (const x of n||[]) {
      if (x.type==='sube' || x.type === 'anadepo' || x.type === 'mutfak' || x.type === 'uretim') r.push({ id:x.id, name:x.name, type:x.type })
      walk(x.children||[])
    }
  }
  walk(tree); return r
}

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10,opacity:disabled?.5:1}}>
      <div className="tog" onClick={()=>!disabled&&onChange(!checked)}
        style={{marginTop:2,flexShrink:0,cursor:disabled?'not-allowed':'pointer'}}>
        <div className={`tog-sl${checked?' on':''}`}/>
      </div>
      <div>
        <div style={{fontSize:'.855rem',fontWeight:600,color:'#1e293b',cursor:'pointer'}}
          onClick={()=>!disabled&&onChange(!checked)}>{label}</div>
        {hint&&<div style={{fontSize:'.77rem',color:'#94a3b8',marginTop:2}}>{hint}</div>}
      </div>
    </div>
  )
}

const GUNLER = ['Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi','Pazar']
const AY_GUNLERI = Array.from({length:28},(_,i)=>i+1)
const HAFTANIN_SIRASI = ['1.','2.','3.','4.','Son']

const MIKTAR_MODU = [
  { value:'tahmin', label:'Tahmin üret',             hint:'Satış tahmini algoritmasına göre öneri' },
  { value:'son',    label:'Son siparişi tekrarla',    hint:'Bir önceki sipariş miktarlarının aynısı' },
  { value:'stok',   label:'Stok seviyelerini tamamla',hint:'Stok kartındaki hedef miktara göre hesapla' },
  { value:'manuel', label:'Öneri yapma',              hint:'Kullanıcı miktarları manuel girer' },
]

const URUN_TIPI = [
  { value:'all',     label:"Tedarikçinin tüm ürünleri", icon:'fa-boxes-stacked',
    hint:'Stok malı ekranında bu tedarikçiye tanımlı tüm ürünler dahil edilir' },
  { value:'sec',     label:'Ürün seç',                  icon:'fa-hand-pointer',
    hint:'Tedarikçinin ürünleri arasından manuel seçim yapılır' },
  { value:'kontrat', label:'Kontratlı stok malları',     icon:'fa-file-contract',
    hint:'Tedarikçinin aktif sözleşmelerindeki stok malları listelenir' },
  { value:'sablon',  label:'Stok malı şablonu',          icon:'fa-table-list',
    hint:'Daha önce oluşturulan bir stok malı şablonu seçilir' },
]

const FLOW_TIPI_BADGE = {
  otomatik:{ bg:'#ede9fe',color:'#5b21b6',label:'Otomatik' },
  manuel:  { bg:'#fef3c7',color:'#92400e',label:'Manuel'   },
}

const ADIMLAR_OTOMATIK = ['Tanım','Takvim','Ürünler','Miktar','Düzenleme','Onay']
const ADIMLAR_MANUEL   = ['Tanım','Ürünler','Düzenleme','Onay']

const EMPTY_FORM = {
  active:true, flow_type:'otomatik',
  name:'', description:'', supplier_id:null, branches:[],
  no_calendar:false,
  siparis_sikligi:'haftalik',
  order_days:[],
  aylik_mod:'gun', aylik_gunler:[], aylik_haftagun_sira:'', aylik_haftagun_gun:'',
  delivery_hour:'17:00', lead_days:1, cutoff_hour:'13:00',
  auto_cancel:false, auto_send:false,
  urun_tipi:'all', selected_stocks:[], stock_template_id:null,
  allow_extra_product:false,
  qty_mode:'tahmin', forecast_ratio:110,
  round_min_qty:false, round_box_qty:false, round_box_threshold:25,
  allow_edit:false, edit_cutoff_hour:'16:00',
  allow_cancel:false, cancel_cutoff_hour:'17:00',
  branch_approval:false,
  hq_approval:false, hq_approval_threshold:'',
  allow_date_change:false, check_credit_limit:false,
  flow_channel:'external_purchase',
  receiver_scope:'branch',
}

const FLOW_CHANNEL_BADGE = {
  external_purchase: { bg: '#eff6ff', color: '#1d4ed8', label: 'Dış Satın Alma' },
  warehouse_replenishment: { bg: '#f5f3ff', color: '#6d28d9', label: 'WMS İkmal Talebi' },
  kitchen_replenishment: { bg: '#fff7ed', color: '#c2410c', label: 'Mutfak İkmal Talebi' },
}

// ── Tedarikçi Seçici ──────────────────────────────────────────
function SupplierSelect({ value, onChange, suppliers }) {
  const [open,setOpen]=useState(false); const [q,setQ]=useState(''); const wrapRef=useRef()
  useEffect(()=>{
    function h(e){if(wrapRef.current&&!wrapRef.current.contains(e.target))setOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])
  const filtered=suppliers.filter(s=>!q||s.name.toLowerCase().includes(q.toLowerCase()))
  const sel=suppliers.find(s=>s.id===value)
  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,borderRadius:10,
        padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',background:'#fff',
        minHeight:40,display:'flex',alignItems:'center',userSelect:'none',boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {sel ? (
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontWeight:600,color:'#1e293b'}}>{sel.name}</span>
            {sel.supplier_kind === 'internal_warehouse' && (
              <span style={{fontSize:'.68rem',padding:'2px 6px',borderRadius:6,fontWeight:600,background:'#ede9fe',color:'#5b21b6'}}>İç Depo</span>
            )}
            {sel.supplier_kind === 'internal_kitchen' && (
              <span style={{fontSize:'.68rem',padding:'2px 6px',borderRadius:6,fontWeight:600,background:'#ffedd5',color:'#c2410c'}}>Merkez Mutfak</span>
            )}
            {(sel.supplier_kind === 'external' || !sel.supplier_kind) && (
              <span style={{fontSize:'.68rem',padding:'2px 6px',borderRadius:6,fontWeight:600,background:'#f1f5f9',color:'#475569'}}>Dış Tedarikçi</span>
            )}
          </div>
        ) : (
          <span style={{color:'#94a3b8'}}>Tedarikçi seçin…</span>
        )}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:14,color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>
      {open&&(
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:399,overflow:'hidden'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Ara…" value={q} onChange={e=>setQ(e.target.value)}
              onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}} autoFocus/>
          </div>
          <div style={{maxHeight:240,overflowY:'auto',padding:'4px 0'}}>
            {filtered.length===0
              ?<div style={{padding:'12px',textAlign:'center',color:'#94a3b8',fontSize:'.82rem'}}>Sonuç yok</div>
              :filtered.map(s=>(
                <div key={s.id} onClick={()=>{onChange(s.id);setOpen(false);setQ('')}}
                  style={{padding:'9px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:9,
                    fontSize:'.85rem',background:value===s.id?'#fffbeb':'transparent'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e=>e.currentTarget.style.background=value===s.id?'#fffbeb':'transparent'}>
                  <span style={{width:28,height:28,borderRadius:7,background:'rgba(248,113,113,.12)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <i className="fa-solid fa-truck-fast" style={{color:'#f87171',fontSize:'.72rem'}}/>
                  </span>
                  <div style={{display:'flex',flexDirection:'column',gap:2,flex:1}}>
                    <span style={{fontWeight:value===s.id?700:400}}>{s.name}</span>
                    <div style={{display:'flex',gap:4}}>
                      {s.supplier_kind === 'internal_warehouse' && (
                        <span style={{fontSize:'.68rem',padding:'1px 5px',borderRadius:5,fontWeight:600,background:'#ede9fe',color:'#5b21b6',alignSelf:'flex-start'}}>İç Depo</span>
                      )}
                      {s.supplier_kind === 'internal_kitchen' && (
                        <span style={{fontSize:'.68rem',padding:'1px 5px',borderRadius:5,fontWeight:600,background:'#ffedd5',color:'#c2410c',alignSelf:'flex-start'}}>Merkez Mutfak</span>
                      )}
                      {(s.supplier_kind === 'external' || !s.supplier_kind) && (
                        <span style={{fontSize:'.68rem',padding:'1px 5px',borderRadius:5,fontWeight:600,background:'#f1f5f9',color:'#475569',alignSelf:'flex-start'}}>Dış Tedarikçi</span>
                      )}
                    </div>
                  </div>
                  {value===s.id&&<i className="fa-solid fa-check" style={{marginLeft:'auto',color:'#fbbf24',fontSize:'.75rem'}}/>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Alıcı Nokta / Şablon Çoklu Seçici ────────────────────────────────
function BranchMultiSelect({ value, onChange, branches, branchTemplates }) {
  const [open,setOpen]=useState(false); const [q,setQ]=useState(''); const wrapRef=useRef()
  useEffect(()=>{
    function h(e){if(wrapRef.current&&!wrapRef.current.contains(e.target))setOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])
  const selected=value||[]
  const coveredBranchIds=new Set(selected.filter(x=>x.type==='template').flatMap(x=>x.branchIds||[]))
  function parseBranchIds(tpl){
    const ids=Array.isArray(tpl.branch_ids)?tpl.branch_ids:(typeof tpl.branch_ids==='string'?JSON.parse(tpl.branch_ids||'[]'):[])
    return ids.filter(id=>branches.some(b=>b.id===id))
  }
  function toggle(type,id,name,branchIds){
    const idx=selected.findIndex(x=>x.type===type&&x.id===id)
    onChange(idx>-1?selected.filter((_,i)=>i!==idx):[...selected,{type,id,name,branchIds:branchIds||null}])
  }
  function selectAllVisible(){
    const visibleTemplates=filtTpl.map(t=>{
      const branchIds=parseBranchIds(t)
      return {type:'template',id:t.id,name:t.name,branchIds}
    })
    const coveredVisibleBranchIds=new Set(visibleTemplates.flatMap(x=>x.branchIds||[]))
    const visibleBranches=filtBr
      .filter(b=>!coveredVisibleBranchIds.has(b.id))
      .map(b=>({type:'branch',id:b.id,name:b.name,branchIds:null}))
    const next=[...selected]
    for (const item of [...visibleTemplates,...visibleBranches]) {
      const exists=next.some(x=>x.type===item.type&&x.id===item.id)
      if (!exists) next.push(item)
    }
    onChange(next)
  }
  const filtTpl=branchTemplates.filter(t=>!q||t.name.toLowerCase().includes(q.toLowerCase()))
  const filtBr=branches.filter(b=>!q||b.name.toLowerCase().includes(q.toLowerCase()))
  const totalBranches=new Set([
    ...selected.filter(x=>x.type==='branch').map(x=>x.id),
    ...selected.filter(x=>x.type==='template').flatMap(x=>x.branchIds||[])
  ]).size
  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,borderRadius:10,
        padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',background:'#fff',
        minHeight:40,display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,userSelect:'none',
        boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {selected.length===0
          ?<span style={{color:'#94a3b8'}}>Alıcı nokta veya şablon seçin…</span>
          :selected.map(x=>(
            <span key={x.id+x.type} style={{display:'inline-flex',alignItems:'center',gap:4,
              background:x.type==='template'?'#ede9fe':'#eff6ff',
              color:x.type==='template'?'#6d28d9':'#1d4ed8',
              borderRadius:6,padding:'2px 8px',fontSize:'.78rem',fontWeight:600}}>
              {x.type==='template'&&<i className="fa-solid fa-layer-group" style={{fontSize:'.6rem'}}/>}
              {x.name}
              <i className="fa-solid fa-xmark" style={{fontSize:'.6rem',cursor:'pointer',opacity:.7}}
                onClick={e=>{e.stopPropagation();toggle(x.type,x.id,x.name,x.branchIds)}}/>
            </span>
          ))}
        {selected.length>0&&<span style={{marginLeft:'auto',fontSize:'.75rem',color:'#64748b',whiteSpace:'nowrap'}}>{totalBranches} alıcı nokta</span>}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:14,color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>
      {open&&(
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',
          zIndex:399,maxHeight:320,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Ara…" value={q} onChange={e=>setQ(e.target.value)}
              onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}} autoFocus/>
            {(filtTpl.length>0 || filtBr.length>0) && (
              <button onClick={e=>{e.stopPropagation();selectAllVisible()}}
                style={{fontSize:'.72rem',color:'#64748b',background:'none',border:'none',cursor:'pointer'}}>
                <i className="fa-solid fa-check-double"/> Tumunu Sec
              </button>
            )}
            {selected.length>0 && (
              <button onClick={e=>{e.stopPropagation();onChange([]);setQ('')}}
                style={{fontSize:'.72rem',color:'#94a3b8',background:'none',border:'none',cursor:'pointer'}}>
                <i className="fa-solid fa-xmark"/> Temizle
              </button>
            )}
          </div>
          <div style={{overflowY:'auto',flex:1,padding:'4px 0'}}>
            {filtTpl.length>0&&<>
              <div style={{padding:'6px 14px 3px',fontSize:'.7rem',fontWeight:700,color:'#7c3aed',textTransform:'uppercase',letterSpacing:'.08em'}}>Alıcı Nokta Şablonları</div>
              {filtTpl.map(t=>{
                const bids=parseBranchIds(t); const sel=selected.some(x=>x.type==='template'&&x.id===t.id)
                return(
                  <div key={'t'+t.id} onClick={()=>toggle('template',t.id,t.name,bids)}
                    style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:9,
                      fontSize:'.85rem',background:sel?'#f5f3ff':'transparent'}}
                    onMouseEnter={e=>e.currentTarget.style.background=sel?'#f5f3ff':'#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background=sel?'#f5f3ff':'transparent'}>
                    <span style={{width:26,height:26,borderRadius:6,background:'rgba(109,40,217,.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className="fa-solid fa-layer-group" style={{color:'#7c3aed',fontSize:'.65rem'}}/>
                    </span>
                    <div style={{flex:1}}><div style={{fontWeight:sel?700:500}}>{t.name}</div><div style={{fontSize:'.72rem',color:'#94a3b8'}}>{bids.length} alıcı nokta</div></div>
                    {sel&&<i className="fa-solid fa-check" style={{color:'#7c3aed',fontSize:'.75rem'}}/>}
                  </div>
                )
              })}
            </>}
            {filtBr.length>0&&<>
              <div style={{padding:'6px 14px 3px',fontSize:'.7rem',fontWeight:700,color:'#1d4ed8',textTransform:'uppercase',letterSpacing:'.08em'}}>Tekil Alıcı Noktalar</div>
              {filtBr.map(b=>{
                const sel=selected.some(x=>x.type==='branch'&&x.id===b.id); const covered=coveredBranchIds.has(b.id)
                return(
                  <div key={'b'+b.id} onClick={()=>!covered&&toggle('branch',b.id,b.name,null)}
                    style={{padding:'8px 14px',cursor:covered?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:9,
                      fontSize:'.85rem',background:sel?'#eff6ff':covered?'#f8fafc':'transparent',opacity:covered?.45:1}}
                    onMouseEnter={e=>{if(!covered)e.currentTarget.style.background=sel?'#eff6ff':'#f8fafc'}}
                    onMouseLeave={e=>{if(!covered)e.currentTarget.style.background=sel?'#eff6ff':'transparent'}}>
                    <span style={{width:26,height:26,borderRadius:6,background:'rgba(29,78,216,.08)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className="fa-solid fa-store" style={{color:'#3b82f6',fontSize:'.65rem'}}/>
                    </span>
                    <span style={{flex:1,fontWeight:sel?700:400}}>{b.name}</span>
                    {covered&&<span style={{fontSize:'.7rem',color:'#94a3b8',fontStyle:'italic'}}>şablonda var</span>}
                    {sel&&<i className="fa-solid fa-check" style={{color:'#3b82f6',fontSize:'.75rem'}}/>}
                  </div>
                )
              })}
            </>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stok Malı Çoklu Seçici ────────────────────────────────────
function StockMultiSelect({ value, onChange, stockItems }) {
  const [open,setOpen]=useState(false); const [q,setQ]=useState(''); const wrapRef=useRef()
  useEffect(()=>{
    function h(e){if(wrapRef.current&&!wrapRef.current.contains(e.target))setOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])
  const selected=value||[]
  const filtered=stockItems.filter(s=>!q||s.name.toLowerCase().includes(q.toLowerCase())||(s.sku||'').toLowerCase().includes(q.toLowerCase()))
  function toggle(item){
    const idx=selected.findIndex(x=>x.id===item.id)
    onChange(idx>-1?selected.filter((_,i)=>i!==idx):[...selected,{id:item.id,name:item.name,sku:item.sku}])
  }
  function selectAllVisible(){
    const next=[...selected]
    for (const item of filtered) {
      if (!next.some(x=>x.id===item.id)) next.push({id:item.id,name:item.name,sku:item.sku})
    }
    onChange(next)
  }
  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,borderRadius:10,
        padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',background:'#fff',
        minHeight:40,display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,userSelect:'none',
        boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {selected.length===0
          ?<span style={{color:'#94a3b8'}}>Stok malı seçin…</span>
          :<>
            {selected.slice(0,3).map(x=>(
              <span key={x.id} style={{background:'#f0fdf4',color:'#166534',borderRadius:6,padding:'2px 8px',fontSize:'.78rem',fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>
                {x.name}
                <i className="fa-solid fa-xmark" style={{fontSize:'.6rem',cursor:'pointer'}}
                  onClick={e=>{e.stopPropagation();toggle(x)}}/>
              </span>
            ))}
            {selected.length>3&&<span style={{fontSize:'.78rem',color:'#64748b'}}>+{selected.length-3} daha</span>}
          </>}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:14,color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>
      {open&&(
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:399,overflow:'hidden'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Ad veya SKU ile ara…" value={q} onChange={e=>setQ(e.target.value)}
              onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}} autoFocus/>
            {filtered.length>0 && (
              <button onClick={e=>{e.stopPropagation();selectAllVisible()}}
                style={{fontSize:'.72rem',color:'#64748b',background:'none',border:'none',cursor:'pointer'}}>
                <i className="fa-solid fa-check-double"/> Tumunu Sec
              </button>
            )}
            {selected.length>0 && (
              <button onClick={e=>{e.stopPropagation();onChange([]);setQ('')}}
                style={{fontSize:'.72rem',color:'#94a3b8',background:'none',border:'none',cursor:'pointer'}}>
                <i className="fa-solid fa-xmark"/> Temizle
              </button>
            )}
          </div>
          <div style={{maxHeight:260,overflowY:'auto',padding:'4px 0'}}>
            {filtered.length===0
              ?<div style={{padding:'12px',textAlign:'center',color:'#94a3b8',fontSize:'.82rem'}}>
                {stockItems.length===0?'Tedarikçi seçilmedi veya ürün yok':'Sonuç yok'}
              </div>
              :filtered.map(s=>{
                const sel=selected.some(x=>x.id===s.id)
                return(
                  <div key={s.id} onClick={()=>toggle(s)}
                    style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:9,
                      fontSize:'.85rem',background:sel?'#f0fdf4':'transparent'}}
                    onMouseEnter={e=>e.currentTarget.style.background=sel?'#f0fdf4':'#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background=sel?'#f0fdf4':'transparent'}>
                    <span style={{width:26,height:26,borderRadius:6,background:'rgba(34,197,94,.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className="fa-solid fa-box" style={{color:'#22c55e',fontSize:'.65rem'}}/>
                    </span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:sel?700:400}}>{s.name}</div>
                      {s.sku&&<div style={{fontSize:'.72rem',color:'#94a3b8'}}>{s.sku}</div>}
                    </div>
                    {sel&&<i className="fa-solid fa-check" style={{color:'#22c55e',fontSize:'.75rem'}}/>}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stok Şablonu Seçici ───────────────────────────────────────
function StockTemplateSelect({ value, onChange, stockTemplates }) {
  const [open,setOpen]=useState(false); const wrapRef=useRef()
  useEffect(()=>{
    function h(e){if(wrapRef.current&&!wrapRef.current.contains(e.target))setOpen(false)}
    document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)
  },[])
  const sel=stockTemplates.find(t=>t.id===value)
  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,borderRadius:10,
        padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',background:'#fff',
        minHeight:40,display:'flex',alignItems:'center',userSelect:'none',boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {sel?<span style={{fontWeight:600,color:'#1e293b'}}>{sel.name}</span>
            :<span style={{color:'#94a3b8'}}>Stok malı şablonu seçin…</span>}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:14,color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>
      {open&&(
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:399,overflow:'hidden'}}>
          <div style={{maxHeight:220,overflowY:'auto',padding:'4px 0'}}>
            {stockTemplates.length===0
              ?<div style={{padding:'12px',textAlign:'center',color:'#94a3b8',fontSize:'.82rem'}}>Stok malı şablonu bulunamadı</div>
              :stockTemplates.map(t=>(
                <div key={t.id} onClick={()=>{onChange(t.id);setOpen(false)}}
                  style={{padding:'9px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:9,
                    fontSize:'.85rem',background:value===t.id?'#fefce8':'transparent'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e=>e.currentTarget.style.background=value===t.id?'#fefce8':'transparent'}>
                  <span style={{width:26,height:26,borderRadius:6,background:'rgba(234,179,8,.12)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <i className="fa-solid fa-table-list" style={{color:'#ca8a04',fontSize:'.65rem'}}/>
                  </span>
                  <span style={{fontWeight:value===t.id?700:400}}>{t.name}</span>
                  {value===t.id&&<i className="fa-solid fa-check" style={{marginLeft:'auto',color:'#ca8a04',fontSize:'.75rem'}}/>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Adım Navigasyonu ──────────────────────────────────────────
function StepNav({ steps, current, onChange, completed }) {
  return (
    <div style={{display:'flex',borderBottom:'1px solid #e2e8f0',background:'#fafafa',flexShrink:0,overflowX:'auto'}}>
      {steps.map((s,i)=>{
        const done=completed.has(i); const active=i===current
        return (
          <button key={s} onClick={()=>onChange(i)}
            style={{flex:1,minWidth:72,padding:'10px 6px',border:'none',cursor:'pointer',
              background:'transparent',borderBottom:`2.5px solid ${active?'#6366f1':'transparent'}`,
              color:active?'#4338ca':done?'#64748b':'#94a3b8',fontWeight:active?700:done?600:400,
              fontSize:'.76rem',display:'flex',flexDirection:'column',alignItems:'center',gap:3,
              transition:'all .12s',whiteSpace:'nowrap'}}>
            <span style={{width:20,height:20,borderRadius:20,display:'flex',alignItems:'center',
              justifyContent:'center',fontSize:'.68rem',fontWeight:700,
              background:active?'#6366f1':done?'#dcfce7':'#f1f5f9',
              color:active?'#fff':done?'#166534':'#94a3b8'}}>
              {done&&!active?<i className="fa-solid fa-check" style={{fontSize:'.55rem'}}/>:i+1}
            </span>
            {s}
          </button>
        )
      })}
    </div>
  )
}

// ── Form ──────────────────────────────────────────────────────
function FlowForm({ flow, suppliers, branches, branchTemplates, stockItems, stockTemplates, contracts, onSave, onClose }) {
  const isNew=!flow?.id
  const initForm = isNew ? {...EMPTY_FORM} : {
    ...EMPTY_FORM, ...flow,
    forecast_ratio: flow.forecast_ratio!=null ? Math.round(flow.forecast_ratio*100) : 110,
    round_box_threshold: flow.round_box_threshold!=null ? Math.round(flow.round_box_threshold*100) : 25,
    hq_approval_threshold: flow.hq_approval_threshold!=null ? String(flow.hq_approval_threshold) : '',
    branches: typeof flow.branches==='string'?JSON.parse(flow.branches||'[]'):(flow.branches||[]),
    order_days: typeof flow.order_days==='string'?JSON.parse(flow.order_days||'[]'):(flow.order_days||[]),
    aylik_gunler: typeof flow.aylik_gunler==='string'?JSON.parse(flow.aylik_gunler||'[]'):(flow.aylik_gunler||[]),
    selected_stocks: typeof flow.selected_stocks==='string'?JSON.parse(flow.selected_stocks||'[]'):(flow.selected_stocks||[]),
  }
  const [form,setForm]=useState(initForm)
  const [step,setStep]=useState(0)
  const [completed,setCompleted]=useState(new Set())
  const {toast}=useToast(); const [saving,setSaving]=useState(false)
  const mountedRef = useRef(true)

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  const isOtomatik=form.flow_type==='otomatik'
  const STEPS=isOtomatik?ADIMLAR_OTOMATIK:ADIMLAR_MANUEL

  function set(k,v){setForm(f=>({...f,[k]:v}))}

  // Terminoloji ve Akış Kanalı Yönetimi
  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id)
  const isInternal = selectedSupplier && (selectedSupplier.supplier_kind === 'internal_warehouse' || selectedSupplier.supplier_kind === 'internal_kitchen')
  const supplierWording = selectedSupplier?.supplier_kind === 'internal_warehouse' ? 'İkmal Deposu' : 
                         selectedSupplier?.supplier_kind === 'internal_kitchen' ? 'Merkez Mutfak' : 'Tedarikçi'
  const demandWording = isInternal ? 'WMS konsoluna düşen talep' : 'Tedarikçiye iletilen sipariş'

  const dynamicUrunTipi = URUN_TIPI.map(t => {
    let label = t.label
    let hint = t.hint
    if (isInternal) {
      label = label.replaceAll('Tedarikçi', supplierWording).replaceAll('tedarikçi', supplierWording.toLowerCase())
      hint = hint.replaceAll('Tedarikçi', supplierWording).replaceAll('tedarikçi', supplierWording.toLowerCase())
    }
    return { ...t, label, hint }
  })

  // Tedarikçiye bağlı stok malları
  const supplierStocks=stockItems.filter(s=>{
    if(!form.supplier_id) return false
    let list=[];try{list=Array.isArray(s.suppliers_list)?s.suppliers_list:JSON.parse(s.suppliers_list||'[]')}catch(e){list=[]}
    return s.supp_id===form.supplier_id||list.some(x=>x.supp_id===form.supplier_id)
  })

  // Kontratlı stok malları
  const contractStocks=(()=>{
    if(!form.supplier_id) return []
    const ids=new Set()
    contracts.filter(c=>c.supplier_id===form.supplier_id).forEach(c=>{
      const rows=typeof c.rows==='string'?JSON.parse(c.rows||'[]'):(c.rows||[])
      rows.forEach(r=>r.stock_item_id&&ids.add(r.stock_item_id))
    })
    return stockItems.filter(s=>ids.has(s.id))
  })()

  function markDone(i){setCompleted(p=>{const n=new Set(p);n.add(i);return n})}
  function goNext(){markDone(step);setStep(s=>Math.min(s+1,STEPS.length-1))}
  function goPrev(){setStep(s=>Math.max(s-1,0))}

  async function save(){
    if(!form.name.trim()){toast('Akış adı zorunlu','error');setStep(0);return}
    if(!form.supplier_id){toast('Tedarikçi seçilmeli','error');setStep(0);return}
    if(form.branches.length===0){toast('En az bir alıcı nokta seçin','error');setStep(0);return}
    
    const supplierKind = selectedSupplier?.supplier_kind || 'external'
    let flowChannel = 'external_purchase'
    if (supplierKind === 'internal_warehouse') {
      flowChannel = 'warehouse_replenishment'
    } else if (supplierKind === 'internal_kitchen') {
      flowChannel = 'kitchen_replenishment'
    }
    if (form.receiver_scope === 'warehouse' && supplierKind === 'internal_warehouse') {
      toast('Ana Depo Satınalma akışı ana deponun kendisi ile kurulamaz','error')
      setStep(0)
      return
    }
    if (form.receiver_scope === 'kitchen' && supplierKind === 'internal_kitchen') {
      toast('Merkez Mutfak Satınalma akışı merkez mutfağın kendisi ile kurulamaz','error')
      setStep(0)
      return
    }

    setSaving(true)
    try {
      const payload={
        active:form.active, flow_type:form.flow_type,
        name:form.name.trim(), description:form.description.trim(),
        supplier_id:form.supplier_id, branches:JSON.stringify(form.branches),
        no_calendar:form.no_calendar, siparis_sikligi:form.siparis_sikligi,
        order_days:JSON.stringify(form.order_days),
        aylik_mod:form.aylik_mod, aylik_gunler:JSON.stringify(form.aylik_gunler),
        aylik_haftagun_sira:form.aylik_haftagun_sira, aylik_haftagun_gun:form.aylik_haftagun_gun,
        delivery_hour:form.delivery_hour, lead_days:parseInt(form.lead_days)||1,
        cutoff_hour:form.cutoff_hour, auto_cancel:form.auto_cancel, auto_send:form.auto_send,
        urun_tipi:form.urun_tipi, selected_stocks:JSON.stringify(form.selected_stocks),
        stock_template_id:form.stock_template_id, allow_extra_product:form.allow_extra_product,
        qty_mode:form.qty_mode,
        forecast_ratio:(parseFloat(form.forecast_ratio)||110)/100,
        round_min_qty:form.round_min_qty, round_box_qty:form.round_box_qty,
        round_box_threshold:(parseFloat(form.round_box_threshold)||25)/100,
        allow_edit:form.allow_edit, edit_cutoff_hour:form.edit_cutoff_hour,
        allow_cancel:form.allow_cancel, cancel_cutoff_hour:form.cancel_cutoff_hour,
        branch_approval:form.branch_approval, hq_approval:form.hq_approval,
        hq_approval_threshold:form.hq_approval&&form.hq_approval_threshold!==''?parseFloat(form.hq_approval_threshold):null,
        allow_date_change:form.allow_date_change, check_credit_limit:form.check_credit_limit,
        flow_channel: flowChannel,
        receiver_scope: form.receiver_scope || 'branch',
      }

      const query = isNew
        ? db.from('order_flows').insert(payload).select('*')
        : db.from('order_flows').update(payload).eq('id',flow.id).select('*')
      const { data, error } = await query
      if(error){toast('Hata: '+error.message,'error');return}

      const savedFlow = Array.isArray(data) ? data[0] : data
      toast(isNew?'İş akışı oluşturuldu':'Güncellendi','success')
      await onSave(savedFlow||null)
    } catch (err) {
      const msg = err?.message || 'Kayıt sırasında beklenmeyen bir hata oluştu'
      toast('Hata: '+msg,'error')
    } finally {
      if (mountedRef.current) setSaving(false)
    }
  }

  function renderStep(){
    // ── ADIM 0: TANIM ──────────────────────────────────────────
    if(step===0) return (
      <div style={{display:'flex',flexDirection:'column',gap:11}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'#f8fafc',borderRadius:10,padding:'10px 14px'}}>
          <span style={{fontSize:'.855rem',fontWeight:600,color:'#1e293b'}}>Aktif</span>
          <div className="tog" onClick={()=>set('active',!form.active)}>
            <div className={`tog-sl${form.active?' on':''}`}/>
          </div>
        </div>
        <div>
          <label className="f-label">İş Akışı Tipi</label>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            {[{v:'otomatik',l:'Otomatik',i:'fa-robot',d:'Takvimli, tahmin bazlı'},
              {v:'manuel',  l:'Manuel',  i:'fa-hand-pointer',d:'Serbest, ihtiyaç bazlı'}].map(t=>(
              <div key={t.v} onClick={()=>{set('flow_type',t.v);setStep(0);setCompleted(new Set())}}
                style={{flex:1,border:`2px solid ${form.flow_type===t.v?'#6366f1':'#e2e8f0'}`,borderRadius:10,
                  padding:'10px 12px',cursor:'pointer',background:form.flow_type===t.v?'#f5f3ff':'#fff',transition:'all .15s'}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                  <i className={`fa-solid ${t.i}`} style={{color:form.flow_type===t.v?'#6366f1':'#94a3b8',fontSize:'.85rem'}}/>
                  <span style={{fontWeight:700,fontSize:'.855rem',color:form.flow_type===t.v?'#4338ca':'#1e293b'}}>{t.l}</span>
                </div>
                <div style={{fontSize:'.75rem',color:'#64748b'}}>{t.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="f-label">Alıcı Kapsamı</label>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            {[{v:'branch',l:'Şube Siparişi',i:'fa-store',d:'Şubeler için tahmin/sipariş'},
              {v:'warehouse',l:'Ana Depo Satınalma',i:'fa-warehouse',d:'Ana depo dış satınalma planı'},
              {v:'kitchen',l:'Merkez Mutfak Satınalma',i:'fa-kitchen-set',d:'Merkez mutfak hammadde satınalma planı'}].map(t=>(
              <div key={t.v} onClick={()=>{if(!t.disabled) set('receiver_scope',t.v)}}
                style={{flex:1,border:`2px solid ${form.receiver_scope===t.v?'#6366f1':t.disabled?'#f1f5f9':'#cbd5e1'}`,borderRadius:10,
                  padding:'10px 12px',cursor:t.disabled?'not-allowed':'pointer',background:form.receiver_scope===t.v?'#f5f3ff':t.disabled?'#fafafa':'#fff',
                  opacity:t.disabled?0.6:1,transition:'all .15s'}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
                  <i className={`fa-solid ${t.i}`} style={{color:form.receiver_scope===t.v?'#6366f1':'#94a3b8',fontSize:'.85rem'}}/>
                  <span style={{fontWeight:700,fontSize:'.855rem',color:form.receiver_scope===t.v?'#4338ca':'#1e293b'}}>{t.l}</span>
                </div>
                <div style={{fontSize:'.75rem',color:'#64748b'}}>{t.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="f-label">İş Akışı Adı <span style={{color:'#ef4444'}}>*</span></label>
          <input className="f-input" placeholder="Örn: Süt ürünleri pazartesi siparişi"
            value={form.name} onChange={e=>set('name',e.target.value)}/>
        </div>
        <div>
          <label className="f-label">Açıklama</label>
          <input className="f-input" placeholder="Kısa açıklama"
            value={form.description} onChange={e=>set('description',e.target.value)}/>
        </div>
        <div>
          <label className="f-label">{supplierWording} <span style={{color:'#ef4444'}}>*</span></label>
          <SupplierSelect value={form.supplier_id} onChange={v=>set('supplier_id',v)} suppliers={suppliers}/>
        </div>
        <div>
          <label className="f-label">Sipariş Verebilecek Alıcı Noktalar <span style={{color:'#ef4444'}}>*</span></label>
          <p className="f-hint">Şube, ana depo, mutfak, şablon veya tekil alıcı nokta seçimi yapılır.</p>
          <BranchMultiSelect value={form.branches} onChange={v=>set('branches',v)}
            branches={branches} branchTemplates={branchTemplates}/>
        </div>
      </div>
    )

    // ── ADIM 1 (oto): TAKVİM ──────────────────────────────────
    if(isOtomatik&&step===1) return (
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <Toggle checked={form.no_calendar} onChange={v=>set('no_calendar',v)}
          label="Takvim Yok"
          hint="İşaretlenirse personel istediği zaman sipariş oluşturabilir"/>

        {!form.no_calendar&&<>
          <div>
            <label className="f-label">Sipariş Sıklığı</label>
            <div style={{display:'flex',gap:8,marginTop:4}}>
              {[{v:'gunluk',l:'Günlük'},{v:'haftalik',l:'Haftalık'},{v:'aylik',l:'Aylık'}].map(o=>(
                <button key={o.v} onClick={()=>set('siparis_sikligi',o.v)}
                  style={{flex:1,padding:'8px',borderRadius:8,cursor:'pointer',fontSize:'.855rem',
                    border:`1.5px solid ${form.siparis_sikligi===o.v?'#6366f1':'#e2e8f0'}`,
                    background:form.siparis_sikligi===o.v?'#f5f3ff':'#fff',
                    color:form.siparis_sikligi===o.v?'#4338ca':'#64748b',
                    fontWeight:form.siparis_sikligi===o.v?700:400}}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {form.siparis_sikligi==='gunluk'&&(
            <div style={{background:'#f0f9ff',borderRadius:10,padding:'12px 14px',border:'1px solid #bae6fd'}}>
              <p style={{margin:0,fontSize:'.83rem',color:'#0369a1',fontWeight:600}}>
                <i className="fa-solid fa-circle-info" style={{marginRight:6}}/>
                Her gün aynı saat için uygulanır
              </p>
            </div>
          )}

          {form.siparis_sikligi==='haftalik'&&(
            <div>
              <label className="f-label">Sipariş Günleri</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
                {GUNLER.map(g=>{
                  const sel=form.order_days.includes(g)
                  return(
                    <button key={g} onClick={()=>{
                      const next=sel?form.order_days.filter(x=>x!==g):[...form.order_days,g]
                      set('order_days',next)
                    }} style={{padding:'5px 12px',borderRadius:20,fontSize:'.8rem',fontWeight:600,cursor:'pointer',
                      border:`1.5px solid ${sel?'#6366f1':'#e2e8f0'}`,
                      background:sel?'#6366f1':'#fff',color:sel?'#fff':'#64748b',transition:'all .12s'}}>
                      {g}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {form.siparis_sikligi==='aylik'&&(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div style={{display:'flex',gap:8}}>
                {[{v:'gun',l:'Belirli günler'},{v:'haftagun',l:'Haftanın günü'}].map(o=>(
                  <button key={o.v} onClick={()=>set('aylik_mod',o.v)}
                    style={{flex:1,padding:'8px',borderRadius:8,cursor:'pointer',fontSize:'.845rem',
                      border:`1.5px solid ${form.aylik_mod===o.v?'#6366f1':'#e2e8f0'}`,
                      background:form.aylik_mod===o.v?'#f5f3ff':'#fff',
                      color:form.aylik_mod===o.v?'#4338ca':'#64748b',
                      fontWeight:form.aylik_mod===o.v?700:400}}>
                    {o.l}
                  </button>
                ))}
              </div>

              {form.aylik_mod==='gun'&&(
                <div>
                  <label className="f-label">Ayın hangi günlerinde?</label>
                  <p className="f-hint">Birden fazla gün seçilebilir (örn: 15 ve 26)</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5,marginTop:6}}>
                    {AY_GUNLERI.map(g=>{
                      const sel=form.aylik_gunler.includes(g)
                      return(
                        <button key={g} onClick={()=>{
                          const next=sel?form.aylik_gunler.filter(x=>x!==g):[...form.aylik_gunler,g].sort((a,b)=>a-b)
                          set('aylik_gunler',next)
                        }} style={{width:38,height:34,borderRadius:7,fontSize:'.8rem',fontWeight:600,cursor:'pointer',
                          border:`1.5px solid ${sel?'#6366f1':'#e2e8f0'}`,
                          background:sel?'#6366f1':'#fff',color:sel?'#fff':'#64748b'}}>
                          {g}
                        </button>
                      )
                    })}
                  </div>
                  {form.aylik_gunler.length>0&&(
                    <p style={{marginTop:6,fontSize:'.82rem',color:'#6366f1',fontWeight:600}}>
                      → Ayın {form.aylik_gunler.join('. ve ')}. günlerinde
                    </p>
                  )}
                </div>
              )}

              {form.aylik_mod==='haftagun'&&(
                <div>
                  <label className="f-label">Her ayın kaçıncı hangi günü?</label>
                  <div style={{display:'flex',gap:8,marginTop:6}}>
                    <div style={{flex:1}}>
                      <label className="f-label">Sıra</label>
                      <div className="sel-wrap">
                        <select className="f-input" value={form.aylik_haftagun_sira} onChange={e=>set('aylik_haftagun_sira',e.target.value)}>
                          <option value="">Seçin</option>
                          {HAFTANIN_SIRASI.map(s=><option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{flex:2}}>
                      <label className="f-label">Gün</label>
                      <div className="sel-wrap">
                        <select className="f-input" value={form.aylik_haftagun_gun} onChange={e=>set('aylik_haftagun_gun',e.target.value)}>
                          <option value="">Seçin</option>
                          {GUNLER.map(g=><option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {form.aylik_haftagun_sira&&form.aylik_haftagun_gun&&(
                    <p style={{marginTop:8,fontSize:'.82rem',color:'#6366f1',fontWeight:600}}>
                      → Her ayın {form.aylik_haftagun_sira} {form.aylik_haftagun_gun}si
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div>
              <label className="f-label">Teslim Saati</label>
              <input className="f-input" type="time" value={form.delivery_hour} onChange={e=>set('delivery_hour',e.target.value)}/>
            </div>
            <div>
              <label className="f-label">Teslim Süresi (gün)</label>
              <input className="f-input" type="number" min={0} max={30} value={form.lead_days} onChange={e=>set('lead_days',e.target.value)}/>
              <p className="f-hint">{form.siparis_sikligi==='gunluk'?'0 = aynı gün teslim':'Sipariş + '+(form.lead_days||0)+' gün'}</p>
            </div>
            <div>
              <label className="f-label">Son Sipariş Saati</label>
              <input className="f-input" type="time" value={form.cutoff_hour} onChange={e=>set('cutoff_hour',e.target.value)}/>
            </div>
          </div>

          <div style={{background:'#fafafa',borderRadius:10,padding:'10px 14px',border:'1px solid #f1f5f9'}}>
            <p style={{margin:'0 0 8px',fontSize:'.78rem',fontWeight:700,color:'#64748b'}}>Son sipariş saatine kadar gönderilmezse:</p>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              {[{v:'cancel',l:'İptal et'},{v:'send',l:'Otomatik gönder'},{v:'nothing',l:'Hiçbir şey yapma'}].map(o=>{
                const sel=o.v==='cancel'?form.auto_cancel:o.v==='send'?form.auto_send:(!form.auto_cancel&&!form.auto_send)
                return(
                  <label key={o.v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.845rem'}}>
                    <input type="radio" checked={sel} onChange={()=>{
                      set('auto_cancel',o.v==='cancel'); set('auto_send',o.v==='send')
                    }}/>{o.l}
                  </label>
                )
              })}
            </div>
          </div>
        </>}
      </div>
    )

    // ── ADIM ÜRÜNLER (oto:2, manuel:1) ────────────────────────
    const urunStep=isOtomatik?2:1
    if(step===urunStep) return (
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div>
          <label className="f-label">Ürün Kapsamı</label>
          <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:6}}>
            {dynamicUrunTipi.map(t=>(
              <label key={t.value} onClick={()=>set('urun_tipi',t.value)}
                style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',borderRadius:9,
                  border:`1.5px solid ${form.urun_tipi===t.value?'#6366f1':'#e2e8f0'}`,
                  background:form.urun_tipi===t.value?'#f5f3ff':'#fff',cursor:'pointer'}}>
                <input type="radio" checked={form.urun_tipi===t.value} onChange={()=>set('urun_tipi',t.value)} style={{marginTop:2}}/>
                <i className={`fa-solid ${t.icon}`} style={{color:form.urun_tipi===t.value?'#6366f1':'#94a3b8',marginTop:2,width:14,flexShrink:0}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:'.855rem',color:form.urun_tipi===t.value?'#4338ca':'#1e293b'}}>{t.label}</div>
                  <div style={{fontSize:'.77rem',color:'#64748b',marginTop:1}}>{t.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {form.urun_tipi==='sec'&&(
          <div>
            <label className="f-label">Stok Malı Seçimi</label>
            {!form.supplier_id
              ?<p className="f-hint" style={{color:'#ef4444'}}>Önce 1. adımda {supplierWording.toLowerCase()} seçin</p>
              :supplierStocks.length===0
                ?<p className="f-hint" style={{color:'#ef4444'}}>Bu {supplierWording.toLowerCase()}ye tanımlı stok malı bulunamadı</p>
                :<StockMultiSelect value={form.selected_stocks} onChange={v=>set('selected_stocks',v)} stockItems={supplierStocks}/>}
          </div>
        )}

        {form.urun_tipi==='kontrat'&&(
          <div style={{background:'#fafafa',borderRadius:10,padding:'12px 14px',border:'1px solid #e2e8f0'}}>
            <div style={{fontSize:'.82rem',fontWeight:600,color:'#374151',marginBottom:6}}>Aktif Sözleşme Kalemleri</div>
            {!form.supplier_id
              ?<p style={{fontSize:'.82rem',color:'#ef4444',margin:0}}>Önce {supplierWording.toLowerCase()} seçin</p>
              :contractStocks.length===0
                ?<p style={{fontSize:'.82rem',color:'#94a3b8',margin:0}}>Bu {supplierWording.toLowerCase()}nin aktif sözleşmesinde stok malı bulunamadı</p>
                :<div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {contractStocks.map(s=>(
                    <span key={s.id} style={{background:'#eff6ff',color:'#1d4ed8',borderRadius:6,padding:'2px 9px',fontSize:'.78rem',fontWeight:600}}>
                      {s.name}
                    </span>
                  ))}
                </div>}
            <p className="f-hint" style={{marginTop:8,marginBottom:0}}>Sözleşmeler sayfasındaki aktif kontratlardan otomatik alınır</p>
          </div>
        )}

        {form.urun_tipi==='sablon'&&(
          <div>
            <label className="f-label">Stok Malı Şablonu</label>
            <StockTemplateSelect value={form.stock_template_id} onChange={v=>set('stock_template_id',v)} stockTemplates={stockTemplates}/>
          </div>
        )}

        <div style={{borderTop:'1px solid #e2e8f0',paddingTop:12,marginTop:2}}>
          <Toggle checked={form.allow_extra_product} onChange={v=>set('allow_extra_product',v)}
            label="Ekstra ürün eklenebilsin"
            hint="Yukarıdaki kapsamın dışındaki bir ürün sipariş satırına eklenebilir"/>
        </div>
      </div>
    )

    // ── ADIM MİKTAR (oto:3) ───────────────────────────────────
    if(isOtomatik&&step===3) return (
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div>
          <label className="f-label">Miktar Önerisi Modu</label>
          <div style={{display:'flex',flexDirection:'column',gap:7,marginTop:6}}>
            {MIKTAR_MODU.map(m=>(
              <label key={m.value} onClick={()=>set('qty_mode',m.value)}
                style={{display:'flex',alignItems:'flex-start',gap:10,padding:'10px 12px',borderRadius:9,
                  border:`1.5px solid ${form.qty_mode===m.value?'#6366f1':'#e2e8f0'}`,
                  background:form.qty_mode===m.value?'#f5f3ff':'#fff',cursor:'pointer'}}>
                <input type="radio" checked={form.qty_mode===m.value} onChange={()=>set('qty_mode',m.value)} style={{marginTop:2}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:'.855rem',color:form.qty_mode===m.value?'#4338ca':'#1e293b'}}>{m.label}</div>
                  <div style={{fontSize:'.77rem',color:'#64748b',marginTop:1}}>{m.hint}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {form.qty_mode==='tahmin'&&(
          <div>
            <label className="f-label">Tahmin Uygulama Oranı (%)</label>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <input className="f-input" type="number" min={50} max={300} step={5}
                value={form.forecast_ratio} onChange={e=>set('forecast_ratio',e.target.value)}
                style={{maxWidth:110}}/>
              <span style={{fontSize:'.855rem',color:'#64748b'}}>
                → Tahminin <strong style={{color:'#4338ca'}}>%{parseInt(form.forecast_ratio)||110}</strong>'i önerilir
              </span>
            </div>
            <p className="f-hint">110 girince %10 fazlası, 90 girince %10 eksiği önerilir</p>
          </div>
        )}

        <Toggle checked={form.round_min_qty} onChange={v=>set('round_min_qty',v)}
          label="Minimum sipariş miktarına yuvarla"
          hint="Hesaplanan miktar stok kartındaki minimum sipariş miktarından azsa yukarı yuvarlanır (aşağı yuvarlanmaz)"/>

        <Toggle checked={form.round_box_qty} onChange={v=>set('round_box_qty',v)}
          label="Koli içeriğine yuvarla"/>
        {form.round_box_qty&&(
          <div style={{marginLeft:36}}>
            <label className="f-label">Yuvarlama Eşiği (%)</label>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <input className="f-input" type="number" min={1} max={99} step={5}
                value={form.round_box_threshold} onChange={e=>set('round_box_threshold',e.target.value)}
                style={{maxWidth:100}}/>
              <span style={{fontSize:'.82rem',color:'#64748b'}}>
                Artık ≥ koli içeriğinin %{parseInt(form.round_box_threshold)||25}'iyse yuvarla
              </span>
            </div>
            <p className="f-hint">
              Örn: koli 10 adet, eşik %{parseInt(form.round_box_threshold)||25} →
              artık ≥ {Math.ceil((parseInt(form.round_box_threshold)||25)*10/100)} adetse yukarı yuvarlanır
            </p>
          </div>
        )}
      </div>
    )

    // ── ADIM DÜZENLEME (oto:4, manuel:2) ──────────────────────
    const duzStep=isOtomatik?4:2
    if(step===duzStep) return (
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        <Toggle checked={form.allow_edit} onChange={v=>set('allow_edit',v)}
          label={`${demandWording} düzenlenebilir`}
          hint={isInternal ? "WMS konsolunda bekleyen talep üzerinde düzenleme yapılabilir" : "Tedarikçiye 'sipariş güncellendi' maili gider; değişiklikler belirtilebilirse iyi olur"}/>
        {form.allow_edit&&(
          <div style={{marginLeft:36,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <label className="f-label" style={{margin:0,whiteSpace:'nowrap',flexShrink:0}}>Son düzenleme saati:</label>
            <input className="f-input" type="time" value={form.edit_cutoff_hour}
              onChange={e=>set('edit_cutoff_hour',e.target.value)} style={{maxWidth:130}}/>
          </div>
        )}

        <Toggle checked={form.allow_cancel} onChange={v=>set('allow_cancel',v)}
          label={`${demandWording} iptal edilebilir`}
          hint={isInternal ? "WMS konsolunda bekleyen talep iptal edilebilir" : "Tedarikçiye iptal maili gider"}/>
        {form.allow_cancel&&(
          <div style={{marginLeft:36,marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            <label className="f-label" style={{margin:0,whiteSpace:'nowrap',flexShrink:0}}>Son iptal saati:</label>
            <input className="f-input" type="time" value={form.cancel_cutoff_hour}
              onChange={e=>set('cancel_cutoff_hour',e.target.value)} style={{maxWidth:130}}/>
          </div>
        )}
      </div>
    )

    // ── ADIM ONAY (oto:5, manuel:3) ───────────────────────────
    return (
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        <Toggle checked={form.branch_approval} onChange={v=>set('branch_approval',v)}
          label={form.receiver_scope === 'warehouse' ? "Depo yöneticisi onayı gerekiyor" : "Şube yöneticisi onayı gerekiyor"}
          hint={form.receiver_scope === 'warehouse' ? "Sipariş oluşturulduğunda depoda onay yetkisi olan personelin onayı beklenir" : "Sipariş oluşturulduğunda şubede onay yetkisi olan personelin onayı beklenir"}/>

        <Toggle checked={form.hq_approval} onChange={v=>set('hq_approval',v)}
          label="Genel Merkez onayı gerekiyor"/>
        {form.hq_approval&&(
          <div style={{marginLeft:36,marginBottom:12}}>
            <label className="f-label">Onay Eşiği (₺)</label>
            <input className="f-input" type="number" min={0} step={1000}
              placeholder="Boş = tüm siparişler onay bekler"
              value={form.hq_approval_threshold}
              onChange={e=>set('hq_approval_threshold',e.target.value)}
              style={{maxWidth:220}}/>
            <p className="f-hint">
              {form.hq_approval_threshold!==''
                ?`${parseFloat(form.hq_approval_threshold||0).toLocaleString('tr-TR')} ₺ ve üzeri siparişler onay bekler`
                :'Tüm siparişler onay bekler'}
            </p>
          </div>
        )}

        <Toggle checked={form.allow_date_change} onChange={v=>set('allow_date_change',v)}
          label="Teslimat tarihi değiştirilebilsin"
          hint="Sipariş verme aşamasında teslim tarihi değiştirilebilir"/>

        <div style={{borderTop:'1px solid #e2e8f0',paddingTop:12,marginTop:8}}>
          <Toggle checked={form.allow_extra_product} onChange={v=>set('allow_extra_product',v)}
            label="Siparişe farklı ürün eklenebilsin"
            hint="Tanımlı kapsamın dışındaki bir ürün sipariş satırına eklenebilir"/>

          <Toggle checked={form.check_credit_limit} onChange={v=>set('check_credit_limit',v)}
            label="Cari hesap limitini kontrol et"
            hint={form.receiver_scope === 'warehouse' ? "Alıcı noktanın cari bakiyesi limitini aşıyorsa sipariş oluşturulmaz, ekranda uyarı verilir" : "Şubenin cari bakiyesi limitini aşıyorsa sipariş oluşturulmaz, ekranda uyarı verilir"}/>
        </div>
      </div>
    )
  }

  const isLast=step===STEPS.length-1

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'16px 22px',borderBottom:'1px solid #e2e8f0',
        display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0}}>
        <div>
          <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:700,color:'#1e293b'}}>
            {isNew?'Yeni Sipariş Akışı':'Akışı Düzenle'}
          </h2>
          {!isNew&&<p style={{margin:'2px 0 0',fontSize:'.78rem',color:'#94a3b8'}}>{flow.name}</p>}
        </div>
        <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark"/></button>
      </div>

      <StepNav steps={STEPS} current={step} onChange={setStep} completed={completed}/>

      <div style={{flex:1,overflowY:'auto',padding:'18px 22px 24px'}}>
        {renderStep()}
      </div>

      <div style={{padding:'12px 22px',borderTop:'1px solid #e2e8f0',display:'flex',
        justifyContent:'space-between',alignItems:'center',flexShrink:0,background:'#fff'}}>
        <button className="btn-o" onClick={step===0?onClose:goPrev}>
          {step===0?'İptal':<><i className="fa-solid fa-arrow-left" style={{marginRight:6}}/>Geri</>}
        </button>
        <div style={{display:'flex',gap:8}}>
          {!isLast&&<button className="btn-p" onClick={goNext}>
            İleri <i className="fa-solid fa-arrow-right" style={{marginLeft:6}}/>
          </button>}
          {isLast&&<button className="btn-p" onClick={save} disabled={saving}>
            {saving
              ?<><i className="fa-solid fa-spinner fa-spin" style={{marginRight:6}}/>Kaydediliyor…</>
              :<><i className="fa-solid fa-check" style={{marginRight:6}}/>{isNew?'Oluştur':'Kaydet'}</>}
          </button>}
        </div>
      </div>
    </div>
  )
}

// ── Detay Paneli ──────────────────────────────────────────────
function getFlowReceiverType(flow, allBranches) {
  if (flow.receiver_scope === 'warehouse') {
    return { label: 'Depo Satınalma', bg: '#ecfeff', color: '#0891b2' }
  }
  if (flow.receiver_scope === 'kitchen') {
    return { label: 'Mutfak Satınalma', bg: '#fff7ed', color: '#c2410c' }
  }

  const flowChannel = flow.flow_channel || 'external_purchase'
  if (flowChannel === 'warehouse_replenishment' || flowChannel === 'kitchen_replenishment') {
    return { label: 'İç İkmal', bg: '#f3e8ff', color: '#6b21a8' }
  }

  let flowBranchSelections = []
  try {
    flowBranchSelections = typeof flow.branches === 'string' ? JSON.parse(flow.branches || '[]') : (flow.branches || [])
  } catch {
    flowBranchSelections = []
  }

  const branchIds = new Set()
  for (const sel of flowBranchSelections) {
    if (sel?.type === 'branch' && sel.id) {
      branchIds.add(sel.id)
    } else if (sel?.type === 'template' && Array.isArray(sel.branchIds)) {
      for (const id of sel.branchIds) {
        if (id) branchIds.add(id)
      }
    }
  }

  let hasWarehouseOrKitchen = false
  for (const id of branchIds) {
    const br = (allBranches || []).find(b => b.id === id)
    if (br && (br.type === 'anadepo' || br.type === 'mutfak')) {
      hasWarehouseOrKitchen = true
      break
    }
  }

  if (hasWarehouseOrKitchen) {
    return { label: 'Depo Satınalma', bg: '#ecfeff', color: '#0891b2' }
  }
  return { label: 'Şube Satınalma', bg: '#eff6ff', color: '#1d4ed8' }
}

function FlowDetail({ flow, suppliers, onEdit, onClose, branches }) {
  const supplier=suppliers.find(s=>s.id===flow.supplier_id)
  
  // Geriye uyumlu kanal eşleşmesi (boşsa veya tanımsızsa supplier'dan türet)
  const flowChannel = flow.flow_channel || (
    supplier?.supplier_kind === 'internal_warehouse' ? 'warehouse_replenishment' :
    supplier?.supplier_kind === 'internal_kitchen' ? 'kitchen_replenishment' :
    'external_purchase'
  )
  const channelBadge = FLOW_CHANNEL_BADGE[flowChannel] || FLOW_CHANNEL_BADGE.external_purchase

  const isInternal = flowChannel === 'warehouse_replenishment' || flowChannel === 'kitchen_replenishment'
  const supplierLabel = isInternal ? (flowChannel === 'warehouse_replenishment' ? 'İkmal Deposu' : 'Merkez Mutfak') : 'Tedarikçi'
  const editLabel = isInternal ? 'WMS konsolundaki talep düzenlenebilir' : 'Tedarikçiye iletilen sipariş düzenlenebilir'
  const cancelLabel = isInternal ? 'WMS konsolundaki talep iptal edilebilir' : 'Tedarikçiye iletilen sipariş iptal edilebilir'

  const parsedBranches=typeof flow.branches==='string'?JSON.parse(flow.branches||'[]'):(flow.branches||[])
  const parsedDays=typeof flow.order_days==='string'?JSON.parse(flow.order_days||'[]'):(flow.order_days||[])
  const parsedAylik=typeof flow.aylik_gunler==='string'?JSON.parse(flow.aylik_gunler||'[]'):(flow.aylik_gunler||[])
  const isOtomatik=flow.flow_type==='otomatik'
  const ftBadge=FLOW_TIPI_BADGE[flow.flow_type]||FLOW_TIPI_BADGE.manuel
  const totalBranches=new Set([
    ...parsedBranches.filter(x=>x.type==='branch').map(x=>x.id),
    ...parsedBranches.filter(x=>x.type==='template').flatMap(x=>x.branchIds||[])
  ]).size

  function Row({icon,label,value,color}){
    return(
      <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}>
        <i className={`fa-solid ${icon}`} style={{color:color||'#94a3b8',fontSize:'.8rem',marginTop:2,width:14,flexShrink:0}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:'.72rem',color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:700}}>{label}</div>
          <div style={{fontSize:'.855rem',color:'#1e293b',fontWeight:500,marginTop:1}}>{value}</div>
        </div>
      </div>
    )
  }
  function Check({label,checked}){
    return(
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0'}}>
        <i className={`fa-solid ${checked?'fa-circle-check':'fa-circle-xmark'}`}
          style={{color:checked?'#22c55e':'#e2e8f0',fontSize:'.9rem'}}/>
        <span style={{fontSize:'.845rem',color:checked?'#1e293b':'#94a3b8'}}>{label}</span>
      </div>
    )
  }
  function takvimOzet(){
    if(flow.no_calendar) return 'Takvim yok'
    const sk=flow.siparis_sikligi||'haftalik'
    if(sk==='gunluk') return 'Her gün'
    if(sk==='haftalik') return parsedDays.join(', ')||'—'
    if(sk==='aylik'){
      if(flow.aylik_mod==='gun') return 'Ayın '+parsedAylik.join('. ve ')+'.'
      return `Her ayın ${flow.aylik_haftagun_sira||''} ${flow.aylik_haftagun_gun||''}`
    }
    return '—'
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'16px 22px',borderBottom:'1px solid #e2e8f0',
        display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>
            <h2 style={{margin:0,fontSize:'1.05rem',fontWeight:700,color:'#1e293b'}}>{flow.name}</h2>
            <span style={{padding:'2px 9px',borderRadius:20,fontSize:'.7rem',fontWeight:700,background:ftBadge.bg,color:ftBadge.color}}>{ftBadge.label}</span>
            {(() => {
              const rcv = getFlowReceiverType(flow, branches)
              return (
                <span style={{padding:'2px 9px',borderRadius:20,fontSize:'.7rem',fontWeight:700,background:rcv.bg,color:rcv.color}}>
                  {rcv.label}
                </span>
              )
            })()}
            <span style={{padding:'2px 9px',borderRadius:20,fontSize:'.7rem',fontWeight:700,
              background:flow.active?'#dcfce7':'#f1f5f9',color:flow.active?'#166534':'#64748b'}}>
              {flow.active?'Aktif':'Pasif'}
            </span>
          </div>
          {flow.description&&<p style={{margin:0,fontSize:'.8rem',color:'#64748b'}}>{flow.description}</p>}
        </div>
        <div style={{display:'flex',gap:6,flexShrink:0}}>
          <button className="ico-btn edit" onClick={onEdit}><i className="fa-solid fa-pen"/></button>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark"/></button>
        </div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'14px 22px'}}>
        <Row icon="fa-truck-fast" label={supplierLabel} value={supplier?.name||'—'} color="#f87171"/>
        <Row icon="fa-store" label="Alıcı Noktalar" value={`${parsedBranches.length} seçim · ${totalBranches} alıcı nokta`} color="#3b82f6"/>
        {parsedBranches.length>0&&(
          <div style={{display:'flex',flexWrap:'wrap',gap:5,margin:'6px 0 4px 24px'}}>
            {parsedBranches.map(x=>(
              <span key={x.id+x.type} style={{display:'inline-flex',alignItems:'center',gap:4,
                background:x.type==='template'?'#ede9fe':'#eff6ff',
                color:x.type==='template'?'#6d28d9':'#1d4ed8',
                borderRadius:6,padding:'2px 9px',fontSize:'.78rem',fontWeight:600}}>
                {x.type==='template'&&<i className="fa-solid fa-layer-group" style={{fontSize:'.6rem'}}/>}
                {x.name}
              </span>
            ))}
          </div>
        )}

        {isOtomatik&&<>
          <Row icon="fa-calendar-days" label="Takvim" value={takvimOzet()} color="#6366f1"/>
          {!flow.no_calendar&&<>
            <Row icon="fa-clock" label="Teslim" value={`${flow.delivery_hour} · +${flow.lead_days} gün`} color="#0ea5e9"/>
            <Row icon="fa-hourglass-end" label="Son sipariş" value={flow.cutoff_hour} color="#f59e0b"/>
            <Row icon="fa-circle-info" label="Saati geçince"
              value={flow.auto_send?'Otomatik gönder':flow.auto_cancel?'İptal et':'Hiçbir şey yapma'} color="#8b5cf6"/>
          </>}
          <Row icon="fa-boxes-stacked" label="Ürün kapsamı" value={URUN_TIPI.find(t=>t.value===flow.urun_tipi)?.label||flow.urun_tipi} color="#0ea5e9"/>
          <Row icon="fa-calculator" label="Miktar modu"
            value={MIKTAR_MODU.find(m=>m.value===flow.qty_mode)?.label||flow.qty_mode} color="#10b981"/>
          {flow.qty_mode==='tahmin'&&<Row icon="fa-percent" label="Tahmin oranı"
            value={`%${Math.round((parseFloat(flow.forecast_ratio)||1)*100)}`} color="#10b981"/>}
          <Check label="Min. sipariş miktarına yuvarla" checked={flow.round_min_qty}/>
          <Check label={`Koli içeriğine yuvarla (eşik %${Math.round((parseFloat(flow.round_box_threshold)||0.25)*100)})`}
            checked={flow.round_box_qty}/>
        </>}

        <div style={{margin:'10px 0 6px',fontSize:'.72rem',fontWeight:800,color:'#6366f1',
          textTransform:'uppercase',letterSpacing:'.1em',paddingBottom:4,borderBottom:'1px solid #e2e8f0'}}>
          Düzenleme / İptal
        </div>
        <Check label={`${editLabel}${flow.allow_edit?' · son: '+flow.edit_cutoff_hour:''}`} checked={flow.allow_edit}/>
        <Check label={`${cancelLabel}${flow.allow_cancel?' · son: '+flow.cancel_cutoff_hour:''}`} checked={flow.allow_cancel}/>

        <div style={{margin:'10px 0 6px',fontSize:'.72rem',fontWeight:800,color:'#6366f1',
          textTransform:'uppercase',letterSpacing:'.1em',paddingBottom:4,borderBottom:'1px solid #e2e8f0'}}>
          Onay
        </div>
        <Check label={flow.receiver_scope === 'warehouse' ? "Depo yöneticisi onayı" : "Şube yöneticisi onayı"} checked={flow.branch_approval}/>
        <Check label={`Genel Merkez${flow.hq_approval&&flow.hq_approval_threshold?' (≥'+parseFloat(flow.hq_approval_threshold).toLocaleString('tr-TR')+' ₺)':''}`}
          checked={flow.hq_approval}/>
        <Check label="Teslimat tarihi değiştirilebilir" checked={flow.allow_date_change}/>
        <Check label="Siparişe farklı ürün eklenebilsin" checked={flow.allow_extra_product}/>
        <Check label="Cari hesap limiti kontrolü" checked={flow.check_credit_limit}/>
      </div>
    </div>
  )
}

// ── Ana Bileşen ───────────────────────────────────────────────
export default function OrderFlows() {
  const [flows,setFlows]=useState([])
  const [suppliers,setSuppliers]=useState([])
  const [branches,setBranches]=useState([])
  const [branchTemplates,setBranchTemplates]=useState([])
  const [stockItems,setStockItems]=useState([])
  const [stockTemplates,setStockTemplates]=useState([])
  const [contracts,setContracts]=useState([])
  const [loading,setLoading]=useState(true)
  const [showDeleted,setShowDeleted]=useState(false)
  const [search,setSearch]=useState('')
  const [panel,setPanel]=useState(null)
  const [confirmDel,setConfirmDel]=useState(null)
  const {toast}=useToast()

  const load=useCallback(async()=>{
    setLoading(true)
    const [flowsR,suppR,settR,brTplR,stockR,stTplR,contrR]=await Promise.all([
      db.from('order_flows').select('*').order('name'),
      db.from('suppliers').select('id,name,supplier_kind').is('deleted_at',null).order('name'),
      db.from('settings').select('value').eq('key','company_tree').single(),
      db.from('branch_templates').select('*').is('deleted_at',null).order('name'),
      db.from('stock_items').select('id,name,sku,supp_id,suppliers_list').is('deleted_at',null).order('name'),
      db.from('stock_templates').select('*').is('deleted_at',null).order('name'),
      db.from('contracts').select('id,supplier_id,rows,deleted_at').is('deleted_at',null),
    ])
    setBranches(getAllBranches(settR.data?.value||[]))
    setBranchTemplates(brTplR.data||[])
    setSuppliers(suppR.data||[])
    setStockItems(stockR.data||[])
    setStockTemplates(stTplR.data||[])
    setContracts(contrR.data||[])
    const all=flowsR.data||[]
    setFlows(showDeleted?all:all.filter(f=>!f.deleted_at))
    setLoading(false)
  },[showDeleted])

  const onFormSaved = useCallback(async(savedFlow)=>{
    try {
      if(savedFlow?.id){
        setFlows(prev=>{
          const current = Array.isArray(prev) ? prev : []
          const next = current.filter(f=>f && f.id!==savedFlow.id)
          if (showDeleted || !savedFlow.deleted_at) next.push(savedFlow)
          next.sort((a,b)=>(a?.name||'').localeCompare((b?.name||''),'tr'))
          return next
        })
      }
    } catch (e) {
      console.error("Error in onFormSaved UI update:", e)
    }
    setPanel(null)
    try {
      await load()
    } catch (e) {
      console.error("Error in load after save:", e)
    }
  },[load, showDeleted])

  useEffect(()=>{load()},[load])

  async function softDelete(id){
    const nowStr = new Date().toISOString()
    setFlows(prev => prev.map(f => f.id === id ? { ...f, deleted_at: nowStr } : f).filter(f => showDeleted || !f.deleted_at))
    const {error}=await db.from('order_flows').update({deleted_at:nowStr}).eq('id',id)
    if(error){
      toast('Silinemedi: '+error.message,'error')
      load()
      return
    }
    toast('İş akışı silindi','success')
    setPanel(null)
    load()
  }
  async function restore(id){
    setFlows(prev => prev.map(f => f.id === id ? { ...f, deleted_at: null } : f))
    const {error}=await db.from('order_flows').update({deleted_at:null}).eq('id',id)
    if(error){
      toast('Geri alınamadı: '+error.message,'error')
      load()
      return
    }
    toast('Geri alındı','success')
    load()
  }

  const filtered=flows.filter(f=>!search||
    f.name?.toLowerCase().includes(search.toLowerCase())||
    suppliers.find(s=>s.id===f.supplier_id)?.name?.toLowerCase().includes(search.toLowerCase())
  )
  const ftOtomatik=filtered.filter(f=>f.flow_type==='otomatik')
  const ftManuel=filtered.filter(f=>f.flow_type==='manuel')

  function FlowCard({flow}){
    const supplier=suppliers.find(s=>s.id===flow.supplier_id)
    const ftBadge=FLOW_TIPI_BADGE[flow.flow_type]||FLOW_TIPI_BADGE.manuel
    
    // Geriye uyumlu kanal eşleşmesi (boşsa veya tanımsızsa supplier'dan türet)
    const flowChannel = flow.flow_channel || (
      supplier?.supplier_kind === 'internal_warehouse' ? 'warehouse_replenishment' :
      supplier?.supplier_kind === 'internal_kitchen' ? 'kitchen_replenishment' :
      'external_purchase'
    )
    const channelBadge = FLOW_CHANNEL_BADGE[flowChannel] || FLOW_CHANNEL_BADGE.external_purchase

    const isActive=panel?.flow?.id===flow.id; const isDeleted=!!flow.deleted_at
    const parsedDays=typeof flow.order_days==='string'?JSON.parse(flow.order_days||'[]'):(flow.order_days||[])
    const parsedBranches=typeof flow.branches==='string'?JSON.parse(flow.branches||'[]'):(flow.branches||[])
    return(
      <div onClick={()=>setPanel({mode:'detail',flow})}
        style={{background:'#fff',borderRadius:12,padding:'13px 16px',cursor:'pointer',
          border:`1.5px solid ${isActive?'#6366f1':'#e8ecf0'}`,marginBottom:8,
          boxShadow:isActive?'0 0 0 3px rgba(99,102,241,.1)':'0 1px 4px rgba(0,0,0,.04)',
          opacity:isDeleted?.55:1,transition:'all .15s',position:'relative'}}>
        {isDeleted&&<span style={{position:'absolute',top:10,right:10,fontSize:'.68rem',
          background:'#fee2e2',color:'#b91c1c',padding:'1px 7px',borderRadius:10,fontWeight:700}}>Silinmiş</span>}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:5}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <span style={{fontWeight:700,fontSize:'.9rem',color:'#1e293b'}}>{flow.name}</span>
              <span style={{padding:'1px 8px',borderRadius:20,fontSize:'.7rem',fontWeight:700,background:ftBadge.bg,color:ftBadge.color}}>{ftBadge.label}</span>
              {(() => {
                const rcv = getFlowReceiverType(flow, branches)
                return (
                  <span style={{padding:'1px 8px',borderRadius:20,fontSize:'.7rem',fontWeight:700,background:rcv.bg,color:rcv.color}}>
                    {rcv.label}
                  </span>
                )
              })()}
              <span style={{padding:'1px 8px',borderRadius:20,fontSize:'.7rem',fontWeight:700,
                background:flow.active?'#dcfce7':'#f1f5f9',color:flow.active?'#166534':'#64748b'}}>
                {flow.active?'Aktif':'Pasif'}
              </span>
            </div>
            {supplier&&<div style={{fontSize:'.78rem',color:'#64748b',marginTop:2,display:'flex',alignItems:'center',gap:4}}>
              <i className="fa-solid fa-truck-fast" style={{color:'#f87171',fontSize:'.7rem'}}/>{supplier.name}
            </div>}
          </div>
          <div style={{display:'flex',gap:4,flexShrink:0,marginLeft:8}} onClick={e=>e.stopPropagation()}>
            {isDeleted
              ?<button className="btn-o" style={{padding:'4px 10px',fontSize:'.75rem'}} onClick={()=>restore(flow.id)}>Geri Al</button>
              :<>
                <button className="ico-btn edit" onClick={e=>{e.stopPropagation();setPanel({mode:'form',flow})}}>
                  <i className="fa-solid fa-pen"/>
                </button>
                <button className="ico-btn del" onClick={e=>{e.stopPropagation();setConfirmDel(flow.id)}}>
                  <i className="fa-solid fa-trash"/>
                </button>
              </>}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12,marginTop:3,flexWrap:'wrap'}}>
          {flow.no_calendar
            ?<span style={{fontSize:'.75rem',color:'#64748b',display:'flex',alignItems:'center',gap:4}}>
              <i className="fa-solid fa-calendar-xmark" style={{color:'#94a3b8'}}/>Takvim yok
            </span>
            :parsedDays.length>0&&<span style={{fontSize:'.75rem',color:'#64748b',display:'flex',alignItems:'center',gap:4}}>
              <i className="fa-solid fa-calendar-check" style={{color:'#6366f1'}}/>
              {parsedDays.join(' · ')}
            </span>}
          {parsedBranches.length>0&&<span style={{fontSize:'.75rem',color:'#64748b',display:'flex',alignItems:'center',gap:4}}>
            <i className="fa-solid fa-store" style={{color:'#3b82f6'}}/>{parsedBranches.length} seçim
          </span>}
        </div>
      </div>
    )
  }

  return(
    <div style={{display:'flex',gap:24,alignItems:'flex-start',minHeight:'100vh'}}>
      <div style={{flex:1,minWidth:0}}>
        <Header title="Sipariş Akışları" subtitle="Tedarikçi bazlı sipariş kuralları ve takvim tanımları"
          actions={<AddButton onClick={()=>setPanel({mode:'form',flow:null})} label="Yeni Akış" />}/>

        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,flexWrap:'wrap'}}>
          <div style={{position:'relative',flex:1,minWidth:200}}>
            <i className="fa-solid fa-search" style={{position:'absolute',left:12,top:'50%',
              transform:'translateY(-50%)',color:'#94a3b8',fontSize:'.8rem'}}/>
            <input className="f-input" placeholder="Akış adı veya tedarikçi ara…"
              value={search} onChange={e=>setSearch(e.target.value)} style={{paddingLeft:34}}/>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:7,fontSize:'.845rem',cursor:'pointer',whiteSpace:'nowrap',color:'#64748b'}}>
            <div className="tog" onClick={()=>setShowDeleted(v=>!v)}>
              <div className={`tog-sl${showDeleted?' on':''}`}/>
            </div>
            Silinmişleri Göster
          </label>
        </div>

        {loading?(
          <div style={{textAlign:'center',padding:60,color:'#94a3b8'}}>
            <i className="fa-solid fa-spinner fa-spin" style={{fontSize:'1.5rem',marginBottom:12,display:'block'}}/>
            Yükleniyor…
          </div>
        ):filtered.length===0?(
          <div style={{textAlign:'center',padding:60}}>
            <i className="fa-solid fa-diagram-project" style={{fontSize:'2rem',color:'#e2e8f0',marginBottom:12,display:'block'}}/>
            <p style={{color:'#94a3b8',margin:0}}>{search?'Arama sonucu bulunamadı':'Henüz sipariş akışı tanımlanmadı'}</p>
            {!search&&<button className="btn-p" style={{marginTop:14}} onClick={()=>setPanel({mode:'form',flow:null})}>
              <i className="fa-solid fa-plus" style={{marginRight:6}}/>İlk akışı oluştur
            </button>}
          </div>
        ):<>
          {ftOtomatik.length>0&&(
            <div style={{marginBottom:20}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <i className="fa-solid fa-robot" style={{color:'#6d28d9',fontSize:'.85rem'}}/>
                <span style={{fontSize:'.78rem',fontWeight:700,color:'#6d28d9',textTransform:'uppercase',letterSpacing:'.08em'}}>
                  Otomatik — {ftOtomatik.length}
                </span>
              </div>
              {ftOtomatik.map(f=><FlowCard key={f.id} flow={f}/>)}
            </div>
          )}
          {ftManuel.length>0&&(
            <div>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <i className="fa-solid fa-hand-pointer" style={{color:'#92400e',fontSize:'.85rem'}}/>
                <span style={{fontSize:'.78rem',fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'.08em'}}>
                  Manuel — {ftManuel.length}
                </span>
              </div>
              {ftManuel.map(f=><FlowCard key={f.id} flow={f}/>)}
            </div>
          )}
        </>}
      </div>

      {panel&&(
        <div style={{width:480,flexShrink:0,background:'#fff',borderRadius:16,
          border:'1.5px solid #e2e8f0',boxShadow:'0 4px 24px rgba(0,0,0,.07)',
          height:'calc(100vh - 48px)',position:'sticky',top:24,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          {panel.mode==='form'
            ?<FlowForm flow={panel.flow} suppliers={suppliers} branches={branches}
                branchTemplates={branchTemplates} stockItems={stockItems}
                stockTemplates={stockTemplates} contracts={contracts}
                onSave={onFormSaved} onClose={()=>setPanel(null)}/>
            :<FlowDetail flow={panel.flow} suppliers={suppliers} branches={branches}
                onEdit={()=>setPanel({mode:'form',flow:panel.flow})} onClose={()=>setPanel(null)}/>}
        </div>
      )}

      <ConfirmDialog open={!!confirmDel} message="Bu sipariş akışı silinsin mi?"
        onConfirm={()=>{softDelete(confirmDel);setConfirmDel(null)}}
        onCancel={()=>setConfirmDel(null)}/>
    </div>
  )
}
