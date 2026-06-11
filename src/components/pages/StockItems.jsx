import { useEffect, useState, useCallback, useRef } from 'react'
import { db, buildApiUrl, resolveImageUrl, uploadApiFile } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddButton from '@/components/ui/AddButton'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { ensureDefaultLocationSelection, getAllBranchesLocationSelection, withDefaultLocationSelection } from '@/lib/locationDefaults'

// ── Helpers ──────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function getAllBranches(tree) {
  const r = []
  function walk(n) { 
    for (const x of n||[]) { 
      if(x.type==='sube' || x.type==='anadepo' || x.type === 'mutfak' || x.type === 'uretim' || x.type === 'uretim') {
        const scope = x.workspace_scope || (x.type === 'anadepo' ? 'anadepo' : (x.type === 'mutfak' || x.type === 'uretim' || x.type === 'uretim' ? 'merkezmutfak' : null))
        r.push({id:x.id, name:x.name, workspace_scope:scope})
      }
      walk(x.children||[]) 
    } 
  }
  walk(tree); return r
}

function resolveMask(mask) {
  if (!mask) return ''
  const now = new Date()
  const yyyy = String(now.getFullYear())
  return mask
    .replace(/YYYY/g,yyyy).replace(/YY/g,yyyy.slice(2))
    .replace(/AA/g,String(now.getMonth()+1).padStart(2,'0'))
    .replace(/GG/g,String(now.getDate()).padStart(2,'0'))
}

function genSku(mask, appendType, appendLen) {
  const len = parseInt(appendLen)||0
  if (!mask && (!appendType||!len)) return null
  const resolved = resolveMask(mask||'')
  let suffix = ''
  if (appendType && len > 0) {
    const pool = appendType==='sayi' ? '0123456789'
               : appendType==='harf' ? 'ABCDEFGHJKLMNPQRSTUVWXYZ'
               : '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    for (let i=0;i<len;i++) suffix += pool[Math.floor(Math.random()*pool.length)]
  }
  return resolved + suffix || null
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (!value) return []
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function buildRecipeLinkedStockIdSet(sources) {
  const linkedIds = new Set()
  for (const source of sources || []) {
    for (const row of parseJsonArray(source?.recipe_rows)) {
      const stockId = row?.stock_item_id
      if (stockId) linkedIds.add(stockId)
    }
  }
  return linkedIds
}

function buildCatTree(cats, parentId=null) {
  return cats.filter(c=>(c.parent_id||null)===parentId)
    .map(c=>({...c, children: buildCatTree(cats, c.id)}))
}

function catAncestry(cats, id) {
  const chain=[]; let cur=cats.find(c=>c.id===id)
  while(cur){ chain.unshift(cur); cur=cur.parent_id?cats.find(c=>c.id===cur.parent_id):null }
  return chain
}

function parseLocationValue(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try { return JSON.parse(value || '[]') } catch { return [] }
  }
  return []
}

// ── Section heading ──────────────────────────────────────────
function SectionHead({ label }) {
  return <p style={{fontSize:'.72rem',fontWeight:800,color:'#6366f1',textTransform:'uppercase',
    letterSpacing:'.1em',margin:'0 0 12px',paddingBottom:6,borderBottom:'1px solid #e2e8f0'}}>{label}</p>
}

// ── Location picker ──────────────────────────────────────────
function LocationPicker({ value, onChange, branches, branchTemplates }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const selected = value || []
  const coveredBranchIds = new Set(
    selected.filter(x=>x.type==='template').flatMap(x=>x.branchIds||[])
  )

  function toggle(type, id, name, branchIds) {
    const idx = selected.findIndex(x=>x.type===type&&x.id===id)
    const next = idx>-1 ? selected.filter((_,i)=>i!==idx) : [...selected, {type,id,name,branchIds:branchIds||null}]
    onChange(next)
    setTimeout(()=>setOpen(true), 0)
  }

  const filtTpl = branchTemplates.filter(t=>!search||t.name.toLowerCase().includes(search.toLowerCase()))
  const filtBr  = branches.filter(b=>!search||b.name.toLowerCase().includes(search.toLowerCase()))

  function selectAllVisible() {
    const next = [...selected]
    const existingKeys = new Set(next.map(item => `${item.type}-${item.id}`))
    const visibleTemplateBranchIds = new Set(filtTpl.flatMap(template => template.branch_ids || []))

    filtTpl.forEach(template => {
      const key = `template-${template.id}`
      if (!existingKeys.has(key)) {
        next.push({ type:'template', id:template.id, name:template.name, branchIds:template.branch_ids || [] })
        existingKeys.add(key)
      }
    })

    filtBr.forEach(branch => {
      const branchId = String(branch.id)
      if (coveredBranchIds.has(branchId) || visibleTemplateBranchIds.has(branchId)) return
      const key = `branch-${branch.id}`
      if (!existingKeys.has(key)) {
        next.push({ type:'branch', id:branch.id, name:branch.name, branchIds:null })
        existingKeys.add(key)
      }
    })

    onChange(next)
  }

  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,
        borderRadius:10,padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',
        background:'#fff',minHeight:40,display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,
        userSelect:'none',boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {selected.length===0
          ? <span style={{color:'#94a3b8'}}>Şube veya grup seçin…</span>
          : selected.map(x=>(
            <span key={x.id} style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',
              borderRadius:99,fontSize:'.74rem',fontWeight:700,
              background:x.type==='template'?'#ede9fe':'#e0f2fe',
              color:x.type==='template'?'#5b21b6':'#0369a1'}}>
              <i className={`fa-solid ${x.type==='template'?'fa-layer-group':'fa-store'}`} style={{fontSize:'.65rem'}}/>
              {x.name}
              <span onClick={e=>{e.stopPropagation();toggle(x.type,x.id,x.name,x.branchIds)}}
                style={{cursor:'pointer',opacity:.6}}>×</span>
            </span>
          ))}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:14,
        color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>

      {open && (
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',
          zIndex:299,overflow:'hidden'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Ara…" value={search}
              onChange={e=>setSearch(e.target.value)}
              onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}}/>
            <button onClick={e=>{e.stopPropagation();onChange([]);setSearch('')}}
              style={{fontSize:'.72rem',color:'#94a3b8',background:'none',border:'none',cursor:'pointer'}}>
              <i className="fa-solid fa-xmark"/> Temizle
            </button>
            <button onClick={e=>{e.stopPropagation();selectAllVisible()}}
              style={{fontSize:'.72rem',color:'#d97706',background:'none',border:'none',cursor:'pointer',fontWeight:700}}>
              <i className="fa-solid fa-check-double"/> Tumunu Sec
            </button>
          </div>
          <div style={{maxHeight:260,overflowY:'auto',padding:'4px 0'}}>
            {filtTpl.length>0 && <>
              <div style={{padding:'6px 14px 3px',fontSize:'.68rem',fontWeight:800,color:'#94a3b8',letterSpacing:'.1em',textTransform:'uppercase'}}>Şube Grupları</div>
              {filtTpl.map(t=>{
                const sel=selected.some(x=>x.type==='template'&&x.id===t.id)
                return <div key={t.id} onClick={e=>{e.stopPropagation();toggle('template',t.id,t.name,t.branch_ids||[])}}
                  style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,
                    fontSize:'.84rem',background:sel?'#fffbeb':'transparent'}}>
                  <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${sel?'#fbbf24':'#d1d5db'}`,
                    background:sel?'#fbbf24':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {sel&&<i className="fa-solid fa-check" style={{color:'#fff',fontSize:'.6rem'}}/>}
                  </div>
                  <i className="fa-solid fa-layer-group" style={{color:'#6366f1',fontSize:'.78rem',flexShrink:0}}/>
                  <span style={{flex:1,fontWeight:sel?700:400,color:sel?'#92400e':'#334155'}}>{t.name}</span>
                  <span style={{fontSize:'.72rem',color:'#94a3b8',background:'#f1f5f9',padding:'2px 7px',borderRadius:99}}>
                    {(t.branch_ids||[]).length} şube
                  </span>
                </div>
              })}
            </>}
            {filtBr.length>0 && <>
              <div style={{padding:'6px 14px 3px',fontSize:'.68rem',fontWeight:800,color:'#94a3b8',
                letterSpacing:'.1em',textTransform:'uppercase',
                ...(filtTpl.length?{borderTop:'1px solid #f1f5f9',marginTop:4}:{})}}>Şubeler</div>
              {filtBr.map(b=>{
                const sel=selected.some(x=>x.type==='branch'&&x.id===b.id)
                const covered=coveredBranchIds.has(b.id)
                if (covered) return (
                  <div key={b.id} style={{padding:'7px 14px',display:'flex',alignItems:'center',gap:10,
                    fontSize:'.83rem',opacity:.4,cursor:'not-allowed'}}>
                    <div style={{width:18,height:18,borderRadius:5,border:'2px solid #e2e8f0',
                      background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className="fa-solid fa-lock" style={{color:'#cbd5e1',fontSize:'.55rem'}}/>
                    </div>
                    <i className="fa-solid fa-store" style={{color:'#94a3b8',fontSize:'.78rem',flexShrink:0}}/>
                    <span style={{flex:1,color:'#94a3b8'}}>{b.name}</span>
                    <span style={{fontSize:'.68rem',color:'#cbd5e1',fontStyle:'italic'}}>grup kapsamında</span>
                  </div>
                )
                return <div key={b.id} onClick={e=>{e.stopPropagation();toggle('branch',b.id,b.name,null)}}
                  style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,
                    fontSize:'.84rem',background:sel?'#fffbeb':'transparent'}}>
                  <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${sel?'#fbbf24':'#d1d5db'}`,
                    background:sel?'#fbbf24':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {sel&&<i className="fa-solid fa-check" style={{color:'#fff',fontSize:'.6rem'}}/>}
                  </div>
                  <i className="fa-solid fa-store" style={{color:'#0369a1',fontSize:'.78rem',flexShrink:0}}/>
                  <span style={{flex:1,fontWeight:sel?700:400,color:sel?'#92400e':'#334155'}}>{b.name}</span>
                </div>
              })}
            </>}
            {filtTpl.length===0&&filtBr.length===0&&(
              <div style={{padding:18,textAlign:'center',fontSize:'.82rem',color:'#94a3b8'}}>
                {search?'Eşleşme bulunamadı':'Henüz şube veya grup tanımlanmamış'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Category tree picker ─────────────────────────────────────
function CatPicker({ cats, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const selectedCat = value ? cats.find(c=>c.id===value) : null
  const breadcrumb  = value ? catAncestry(cats,value).map(c=>c.name).join(' › ') : ''

  function flatten(parentId=null, depth=0) {
    return cats.filter(c=>(c.parent_id||null)===parentId)
      .flatMap(c=>[{cat:c,depth},...flatten(c.id,depth+1)])
  }

  let items = flatten()
  if (search) {
    const matchIds = new Set(items.filter(({cat})=>cat.name.toLowerCase().includes(search.toLowerCase())).map(({cat})=>cat.id))
    matchIds.forEach(id=>catAncestry(cats,id).forEach(c=>matchIds.add(c.id)))
    items = items.filter(({cat})=>matchIds.has(cat.id))
  }

  function select(catId) {
    const chain = catAncestry(cats, catId)
    let accCat='', accCode=''
    for (let i=chain.length-1;i>=0;i--) {
      if (!accCat && chain[i].acc_cat) accCat=chain[i].acc_cat
      if (!accCode && chain[i].acc_code) accCode=chain[i].acc_code
      if (accCat&&accCode) break
    }
    onChange(catId, accCat, accCode)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,
        borderRadius:10,padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',
        background:'#fff',minHeight:40,display:'flex',alignItems:'center',
        boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {selectedCat
          ? <span style={{color:'#0f172a',fontWeight:600,fontSize:'.84rem'}}>{breadcrumb}</span>
          : <span style={{color:'#94a3b8'}}>Kategori seçin…</span>}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:'50%',
        transform:'translateY(-50%)',color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>
      {open && (
        <div style={{position:'absolute',left:0,right:0,top:'calc(100%+4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',zIndex:299,overflow:'hidden'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Kategori ara…" value={search}
              onChange={e=>setSearch(e.target.value)} onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}}/>
            <button onClick={e=>{e.stopPropagation();onChange(null,'','');setSearch('');setOpen(false)}}
              style={{fontSize:'.72rem',color:'#94a3b8',background:'none',border:'none',cursor:'pointer'}}>
              <i className="fa-solid fa-xmark"/> Temizle
            </button>
          </div>
          <div style={{maxHeight:240,overflowY:'auto',padding:'6px 0'}}>
            {items.length===0
              ? <div style={{padding:16,textAlign:'center',fontSize:'.82rem',color:'#94a3b8'}}>Kategori bulunamadı</div>
              : items.map(({cat,depth})=>{
                  const isSel = cat.id===value
                  const hasCh = cats.some(c=>c.parent_id===cat.id)
                  return <div key={cat.id} onClick={e=>{e.stopPropagation();select(cat.id)}}
                    style={{padding:`8px ${depth*16+24}px 8px ${depth*16+12}px`,cursor:'pointer',
                      display:'flex',alignItems:'center',gap:8,fontSize:'.84rem',
                      background:isSel?'#fffbeb':'transparent',
                      borderLeft:`3px solid ${isSel?'#fbbf24':'transparent'}`}}>
                    <i className={`fa-${hasCh?'solid fa-folder':'regular fa-circle-dot'}`}
                      style={{color:hasCh?'#fbbf24':'#94a3b8',fontSize:'.75rem',flexShrink:0}}/>
                    <span style={{flex:1,color:isSel?'#b45309':'#334155',fontWeight:isSel?700:400}}>{cat.name}</span>
                    {cat.acc_code&&<span style={{fontSize:'.7rem',color:'#94a3b8',fontFamily:'monospace'}}>{cat.acc_code}</span>}
                    {isSel&&<i className="fa-solid fa-check" style={{color:'#fbbf24',fontSize:'.72rem'}}/>}
                  </div>
                })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── EMPTY FORM ───────────────────────────────────────────────
const EMPTY = {
  sku:'', auto_sku:false, name:'', short_name:'',
  location:[], cat_id:null, acc_cat:'', acc_code:'',
  unit:'', packaging_units:[],
  min_stock:0, max_stock:1000, reorder:'',
  order_unit:'ana', min_order:'', max_order:'',
  recipe_linked:false, daily_usage:'', auto_usage:false,
  supp_id:'', purchase_price:'', suppliers_list:[],
  saleable:false, sale_name:'', sale_group:'',
  warehouse_settings: {},
  image_url: ''
}

function getSelectedWarehouseSuppliers(form, suppliers) {
  const supplierIds = new Set()
  if (form?.supp_id) supplierIds.add(String(form.supp_id).toLowerCase())
  for (const row of parseJsonArray(form?.suppliers_list)) {
    if (row?.supp_id) supplierIds.add(String(row.supp_id).toLowerCase())
  }
  return (suppliers || []).filter(supplier => (
    supplier?.supplier_kind === 'internal_warehouse' &&
    supplierIds.has(String(supplier.id).toLowerCase()) &&
    supplier.source_branch_id
  ))
}

// ── Main component ────────────────────────────────────────────
export default function StockItems() {
  const toast = useToast()
  const [items, setItems]       = useState([])
  const [cats, setCats]         = useState([])
  const [units, setUnits]       = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [branches, setBranches] = useState([])
  const [branchTpls, setBranchTpls] = useState([])
  const [wmsLocs, setWmsLocs]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [modal, setModal]       = useState(false)
  const [tab, setTab]           = useState(0)
  const [form, setForm]         = useState(EMPTY)
  const [editId, setEditId]     = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [skuStatus, setSkuStatus] = useState({ type:'idle', msg:'' })
  const [existingSkus, setExistingSkus] = useState(new Set())
  const [recipeLinkedIds, setRecipeLinkedIds] = useState(new Set())
  const locationDefaultAppliedRef = useRef(false)

  const [whSettings, setWhSettings] = useState([])
  const [uploadingImg, setUploadingImg] = useState(false)

  const cropAndResizeImage = (file, targetAspect = 4 / 3, maxWidth = 800) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()
      reader.onload = (ev) => {
        img.onload = () => {
          const srcW = img.naturalWidth
          const srcH = img.naturalHeight
          const srcAspect = srcW / srcH

          let cropW, cropH, cropX, cropY
          if (srcAspect > targetAspect) {
            cropH = srcH
            cropW = Math.round(srcH * targetAspect)
            const offscreen = document.createElement('canvas')
            offscreen.width = srcW; offscreen.height = 1
            const ctx2 = offscreen.getContext('2d')
            ctx2.drawImage(img, 0, 0, srcW, srcH, 0, 0, srcW, 1)
            const data2 = ctx2.getImageData(0, 0, srcW, 1).data
            let totalBrightness = 0, weightedX = 0
            for (let x = 0; x < srcW; x++) {
              const brightness = data2[x * 4] * 0.299 + data2[x * 4 + 1] * 0.587 + data2[x * 4 + 2] * 0.114
              totalBrightness += brightness
              weightedX += brightness * x
            }
            const focusX = totalBrightness > 0 ? weightedX / totalBrightness : srcW / 2
            cropX = Math.max(0, Math.min(srcW - cropW, Math.round(focusX - cropW / 2)))
            cropY = 0
          } else {
            cropW = srcW
            cropH = Math.round(srcW / targetAspect)
            const offscreen = document.createElement('canvas')
            offscreen.width = 1; offscreen.height = srcH
            const ctx2 = offscreen.getContext('2d')
            ctx2.drawImage(img, 0, 0, srcW, srcH, 0, 0, 1, srcH)
            const data2 = ctx2.getImageData(0, 0, 1, srcH).data
            let totalBrightness = 0, weightedY = 0
            for (let y = 0; y < srcH; y++) {
              const brightness = data2[y * 4] * 0.299 + data2[y * 4 + 1] * 0.587 + data2[y * 4 + 2] * 0.114
              totalBrightness += brightness
              weightedY += brightness * y
            }
            const focusY = totalBrightness > 0 ? weightedY / totalBrightness : srcH / 2
            cropX = 0
            cropY = Math.max(0, Math.min(srcH - cropH, Math.round(focusY - cropH / 2)))
          }

          const outW = Math.min(maxWidth, cropW)
          const outH = Math.round(outW / targetAspect)

          const canvas = document.createElement('canvas')
          canvas.width = outW; canvas.height = outH
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Kırpma başarısız'))
            resolve(blob)
          }, 'image/jpeg', 0.88)
        }
        img.onerror = reject
        img.src = ev.target.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleImageUpload = async (file) => {
    if (!file) return
    setUploadingImg(true)
    try {
      const croppedBlob = await cropAndResizeImage(file, 4 / 3, 800)
      const croppedFile = new File([croppedBlob], file.name || 'image.jpg', { type: 'image/jpeg' })

      const formData = new FormData()
      formData.append('file', croppedFile)
      const data = await uploadApiFile(formData)
      setForm(prev => ({ ...prev, image_url: data.file_url }))
      toast('Resim başarıyla yüklendi.', 'success')
    } catch (err) {
      toast('Resim yüklenemedi: ' + err.message, 'error')
    } finally {
      setUploadingImg(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: si }, { data: ca }, { data: un }, { data: su },
           { data: ct }, { data: bt }, { data: saleItems },
           { data: saleOptions }, { data: semiItems }, { data: whSet }, { data: wmsLocData }] = await Promise.all([
      db.from('stock_items').select('*').order('name'),
      db.from('categories').select('*').order('name'),
      db.from('units').select('*').order('is_system',{ascending:false}).order('sort_order').order('label'),
      db.from('suppliers').select('id,name,supplier_kind,source_branch_id').eq('active',true).order('name'),
      db.from('settings').select('value').eq('key','company_tree').single(),
      db.from('branch_templates').select('*').order('name'),
      db.from('sale_items').select('id,recipe_rows').is('deleted_at', null),
      db.from('sale_options').select('id,recipe_rows').is('deleted_at', null),
      db.from('semi_items').select('id,recipe_rows').is('deleted_at', null),
      db.from('stock_item_warehouse_settings').select('*'),
      db.from('warehouse_locations').select('id,branch_id,zone_code,aisle,rack,level,bin').eq('is_active',true).order('zone_code'),
    ])
    setItems(si||[])
    setCats(ca||[])
    setUnits(un||[])
    setSuppliers(su||[])
    setBranches(getAllBranches(ct?.value||[]))
    setBranchTpls(bt||[])
    setWmsLocs(wmsLocData||[])
    setWhSettings(whSet||[])
    setExistingSkus(new Set((si||[]).map(x=>x.sku).filter(Boolean)))
    setRecipeLinkedIds(buildRecipeLinkedStockIdSet([...(saleItems||[]), ...(saleOptions||[]), ...(semiItems||[])]))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!modal) {
      locationDefaultAppliedRef.current = false
      return
    }
    if (locationDefaultAppliedRef.current) return

    const defaultLocation = getAllBranchesLocationSelection(branchTpls)
    if (!defaultLocation.length) return

    setForm(current => {
      if (current.location?.length) {
        locationDefaultAppliedRef.current = true
        return current
      }
      locationDefaultAppliedRef.current = true
      return { ...current, location: defaultLocation }
    })
  }, [modal, branchTpls])

  const filtered = items.filter(i => {
    if (!showDeleted && i.deleted_at) return false
    const q = search.toLowerCase()
    return !q || i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q)
  })

  async function restoreItem(item) {
    const {error} = await db.from('stock_items').update({deleted_at: null}).eq('id', item.id)
    if(error) toast('Geri alınamadı: '+error.message,'error')
    else { toast(`"${item.name}" geri alındı`,'success'); load() }
  }

  async function resolveAutoSku(catId, excludeId) {
    const allSkus = new Set([...existingSkus].filter(s => s !== (editId ? items.find(x=>x.id===editId)?.sku : null)))

    // try category mask first
    const cat = catId ? cats.find(c=>c.id===catId) : null
    const hasCatMask = cat && !!(cat.sku_mask || (cat.append_type && cat.append_len))

    let mask='', appendType='', appendLen=4, hasMask=false
    if (hasCatMask) {
      mask=cat.sku_mask||''; appendType=cat.append_type||''; appendLen=cat.append_len||4; hasMask=true
    } else {
      const { data } = await db.from('settings').select('value').eq('key','default_sku_mask').single()
      if (data?.value) {
        mask=data.value.mask||''; appendType=data.value.appendType||''; appendLen=data.value.appendLen||4
        hasMask = !!(mask||(appendType&&appendLen))
      }
    }

    for (let i=0;i<50;i++) {
      let sku = hasMask ? genSku(mask, appendType, appendLen) : String(Math.floor(100000000+Math.random()*900000000))
      if (sku && !allSkus.has(sku)) return sku
    }
    return String(Date.now()).slice(-9)
  }

  async function handleAutoSkuToggle(checked) {
    const next = { ...form, auto_sku: checked }
    if (checked && !form.sku) {
      const sku = await resolveAutoSku(form.cat_id, editId)
      next.sku = sku
      setSkuStatus({ type:'auto', msg:'Otomatik üretildi — benzersiz ve kullanılabilir.' })
    } else if (!checked) {
      setSkuStatus({ type:'idle', msg:'' })
    }
    setForm(next)
  }

  async function handleCatChange(catId, accCat, accCode) {
    const next = { ...form, cat_id: catId, acc_cat: accCat, acc_code: accCode }
    if (form.auto_sku) {
      const sku = await resolveAutoSku(catId, editId)
      next.sku = sku
    }
    setForm(next)
  }

  function checkSkuManual(val) {
    if (!val) { setSkuStatus({ type:'idle', msg:'' }); return }
    const editSkip = editId ? items.find(x=>x.id===editId)?.sku : null
    const dup = [...existingSkus].includes(val) && val !== editSkip
    setSkuStatus(dup
      ? { type:'error', msg:`"${val}" kodu zaten kullanılıyor.` }
      : { type:'ok',    msg:'SKU kullanılabilir.' })
  }

  async function regenSku() {
    const sku = await resolveAutoSku(form.cat_id, editId)
    setForm(f=>({...f, sku}))
    setSkuStatus({ type:'auto', msg:'Yeni SKU üretildi.' })
  }

  // ── Modal open/close ──────────────────────────────────────
  function openAdd() { setForm(withDefaultLocationSelection(EMPTY, branchTpls)); setEditId(null); setTab(0); setSkuStatus({type:'idle',msg:''}); setModal(true) }
  function openEdit(item) {
    const derivedRecipeLinked = recipeLinkedIds.has(item.id)
    
    // Build warehouse settings map for this item
    const wset = {}
    const myWhSet = whSettings.filter(w => w.stock_item_id === item.id)
    for (const w of myWhSet) {
      wset[w.branch_id] = {
        order_unit: w.order_unit || 'ana',
        min_order: w.min_order || '',
        max_order: w.max_order || '',
        min_stock: w.min_stock || '',
        safety_stock: w.safety_stock || '',
        transfer_price_adjustment_type: w.transfer_price_adjustment_type || 'none',
        transfer_price_adjustment_value: w.transfer_price_adjustment_value || '',
        default_location_id: w.default_location_id || '',
      }
    }

    setForm({
      sku: item.sku||'', auto_sku: item.auto_sku||false,
      name: item.name||'', short_name: item.short_name||'',
      location: ensureDefaultLocationSelection(parseLocationValue(item.location), branchTpls),
      cat_id: item.cat_l5||item.cat_l4||item.cat_l3||item.cat_l2||item.cat_l1||null,
      acc_cat: item.acc_cat||'', acc_code: item.acc_code||'',
      unit: item.unit||'', packaging_units: item.packaging_units||[],
      min_stock: item.min_stock??0, max_stock: item.max_stock??1000,
      reorder: item.reorder||'', order_unit: item.order_unit||'ana',
      min_order: item.min_order||'', max_order: item.max_order||'',
      recipe_linked: item.recipe_linked || derivedRecipeLinked,
      daily_usage: item.daily_usage||'', auto_usage: item.auto_usage||false,
      supp_id: item.supp_id||'', purchase_price: item.purchase_price||'',
      suppliers_list: item.suppliers_list||[],
      saleable: item.saleable||false, sale_name: item.sale_name||'', sale_group: item.sale_group||'',
      warehouse_settings: wset,
      image_url: item.image_url||''
    })
    setEditId(item.id); setTab(0)
    setSkuStatus(item.auto_sku ? {type:'auto',msg:'Otomatik üretildi.'} : {type:'idle',msg:''})
    setModal(true)
  }
  function closeModal() { setModal(false); setForm(EMPTY); setEditId(null) }

  // ── Save ─────────────────────────────────────────────────
  async function save() {
    if (!form.name.trim()) { setTab(0); toast('Malzeme ismi zorunludur','error'); return }
    if (!form.unit)        { setTab(1); toast('Ölçü birimi zorunludur','error'); return }
    if (!form.location?.length) { setTab(0); toast('En az bir lokasyon seçmelisiniz','error'); return }
    if (!form.sku) { setTab(0); toast('SKU kodu zorunludur','error'); return }

    const editSkip = editId ? items.find(x=>x.id===editId)?.sku : null
    if (existingSkus.has(form.sku) && form.sku !== editSkip) {
      setTab(0); setSkuStatus({type:'error',msg:`"${form.sku}" SKU kodu zaten kullanılıyor.`})
      toast('SKU kodu çakışıyor','error'); return
    }

    const derivedRecipeLinked = editId ? recipeLinkedIds.has(editId) : false
    const recipeLinked = form.recipe_linked || derivedRecipeLinked

    // Resolve cat levels
    const chain = form.cat_id ? catAncestry(cats, form.cat_id) : []

    const payload = {
      sku: form.sku, auto_sku: form.auto_sku,
      name: form.name.trim(), short_name: form.short_name.trim()||null,
      location: form.location || [],
      acc_cat: form.acc_cat||null, acc_code: form.acc_code||null,
      cat_l1: chain[0]?.id||null, cat_l2: chain[1]?.id||null,
      cat_l3: chain[2]?.id||null, cat_l4: chain[3]?.id||null, cat_l5: chain[4]?.id||null,
      unit: form.unit,
      packaging_units: form.packaging_units,
      min_stock: parseFloat(form.min_stock)||0,
      max_stock: parseFloat(form.max_stock)||1000,
      reorder: parseFloat(form.reorder)||null,
      order_unit: form.order_unit,
      min_order: parseFloat(form.min_order)||null,
      max_order: parseFloat(form.max_order)||null,
      recipe_linked: recipeLinked,
      daily_usage: parseFloat(form.daily_usage)||null,
      auto_usage: form.auto_usage,
      supp_id: form.suppliers_list?.find(s=>s.is_default)?.supp_id || form.supp_id||null,
      purchase_price: parseFloat(form.suppliers_list?.find(s=>s.is_default)?.purchase_price)||parseFloat(form.purchase_price)||null,
      suppliers_list: (form.suppliers_list||[]).filter(s=>s.supp_id).map(s=>({
        supp_id: s.supp_id,
        purchase_price: parseFloat(s.purchase_price)||null,
        is_default: !!s.is_default,
      })),
      saleable: form.saleable,
      sale_name: form.saleable ? form.sale_name.trim()||null : null,
      sale_group: form.saleable ? form.sale_group||null : null,
      image_url: form.image_url || null
    }

    let finalId = editId
    if (editId) {
      const { error } = await db.from('stock_items').update(payload).eq('id', editId)
      if (error) { toast('Hata: '+error.message,'error'); return }
      toast(`"${payload.name}" güncellendi`,'success')
    } else {
      const { error, data } = await db.from('stock_items').insert(payload).select('id').single()
      if (error) { toast('Hata: '+error.message,'error'); return }
      finalId = data.id
      toast(`"${payload.name}" eklendi`,'success')
    }

    // Save warehouse settings
    if (finalId) {
      const whPayloads = []
      for (const branch of warehouseBranchesForForm) {
        const setg = form.warehouse_settings?.[branch.id]
        if (setg) {
          whPayloads.push({
            stock_item_id: finalId,
            branch_id: branch.id,
            order_unit: setg.order_unit || 'ana',
            min_order: parseFloat(setg.min_order) || null,
            max_order: parseFloat(setg.max_order) || null,
            min_stock: parseFloat(setg.min_stock) || null,
            safety_stock: parseFloat(setg.safety_stock) || null,
            transfer_price_adjustment_type: setg.transfer_price_adjustment_type || 'none',
            transfer_price_adjustment_value: parseFloat(setg.transfer_price_adjustment_value) || 0,
            default_location_id: setg.default_location_id || null,
            updated_at: new Date().toISOString(),
          })
        }
      }
      
      await db.from('stock_item_warehouse_settings').delete().eq('stock_item_id', finalId)
      if (whPayloads.length > 0) {
        await db.from('stock_item_warehouse_settings').upsert(whPayloads, { onConflict: 'stock_item_id,branch_id' })
      }
    }

    closeModal(); load()
  }

  async function remove(item) {
    const { error } = await db.from('stock_items').update({deleted_at: new Date().toISOString()}).eq('id', item.id)
    if (error) toast('Silinemedi: '+error.message,'error')
    else { toast(`"${item.name}" silindi`,'info'); load() }
    setConfirm(null)
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const recipeLinked = form.recipe_linked || (editId ? recipeLinkedIds.has(editId) : false)
  const selectedWarehouseSuppliers = getSelectedWarehouseSuppliers(form, suppliers)
  const allowedWarehouseBranchIds = new Set(selectedWarehouseSuppliers.map(supplier => String(supplier.source_branch_id)))
  const warehouseBranchesForForm = branches.filter(branch => (
    branch.workspace_scope === 'anadepo' && allowedWarehouseBranchIds.has(String(branch.id))
  ))
  const hasWarehouseSupplier = selectedWarehouseSuppliers.length > 0

  useEffect(() => {
    if (modal && tab === 3 && !hasWarehouseSupplier) setTab(2)
  }, [hasWarehouseSupplier, modal, tab])

  // Packaging units
  function addPkg()    { set('packaging_units',[...form.packaging_units,{id:uid(),unit:'',qty:1}]) }
  function removePkg(id){ set('packaging_units',form.packaging_units.filter(p=>p.id!==id)) }
  function updatePkg(id,k,v){ set('packaging_units',form.packaging_units.map(p=>p.id===id?{...p,[k]:v}:p)) }

  const tabs = [
    { label:'Temel Bilgiler',   icon:'fa-circle-info' },
    { label:'Ölçüm & Stok',    icon:'fa-ruler' },
    { label:'Tedarikçi & Satış', icon:'fa-handshake' },
    {
      label:'Depo Ayarları',
      icon:'fa-warehouse',
      disabled: !hasWarehouseSupplier,
      disabledReason: 'Depo Ayarları için Tedarikçi & Satış sekmesinde en az bir İç Depo tedarikçisi seçilmelidir.',
    },
  ]

  // Find deepest cat for display in table
  function itemCat(item) {
    const id = item.cat_l5||item.cat_l4||item.cat_l3||item.cat_l2||item.cat_l1
    return id ? cats.find(c=>c.id===id) : null
  }

  return (
    <div className="page-enter">
      <Header
        title="Stok Malı"
        subtitle={`${filtered.length} stok malı`}
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
          <AddButton onClick={openAdd} label="Stok Malı Ekle" />
        </>}
      />

      {/* Search */}
      <div className="card" style={{padding:14,marginBottom:14}}>
        <div style={{position:'relative'}}>
          <i className="fa-solid fa-search" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',fontSize:'.75rem'}}/>
          <input className="f-input" placeholder="Malzeme ara…" style={{paddingLeft:30}}
            value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{overflow:'hidden'}}>
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}><i className="fa-solid fa-spinner fa-spin"/> Yükleniyor…</div>
        ) : (
          <table className="tbl">
            <thead><tr>
              <th>SKU</th><th>Malzeme</th><th>Kategori</th>
              <th>Birim</th><th>Min Stok</th><th>Tedarikçi</th><th>Satış Malı</th><th>İşlem</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={8}><div className="empty"><i className="fa-solid fa-cube"/><p>Stok malı bulunamadı</p></div></td></tr>
              ) : filtered.map(item=>{
                  const cat  = itemCat(item)
                  return <tr key={item.id} className={item.deleted_at?'deleted':''}>
                    <td><span style={{fontFamily:'monospace',fontSize:'.8rem',fontWeight:700,color:'#475569'}}>{item.sku||'—'}</span></td>
                    <td style={{fontWeight:600,color:'#0f172a'}}>
                      <span className={item.deleted_at?'row-deleted':''}>{item.name}</span>
                      {item.short_name&&<div style={{fontSize:'.74rem',color:'#94a3b8'}}>{item.short_name}</div>}
                    </td>
                    <td>{cat?<span className="badge" style={{background:cat.bg,color:cat.text_color}}>{cat.name}</span>:<span style={{color:'#cbd5e1'}}>—</span>}</td>
                    <td><span className="badge bgr">{item.unit||'—'}</span></td>
                    <td style={{fontSize:'.83rem',color:'#475569'}}>{item.min_stock??0}</td>
                    <td style={{fontSize:'.83rem',color:'#475569'}}>
                     {(item.suppliers_list?.length > 0)
                       ? item.suppliers_list.map((s,i)=>{
                           const sp = suppliers.find(x=>x.id===s.supp_id)
                           if (!sp) return null
                           return (
                             <span key={i} style={{display:'inline-flex',alignItems:'center',gap:3,
                               marginRight:4,padding:'1px 6px',borderRadius:99,fontSize:'.73rem',
                               background:s.is_default?'#fef3c7':'#f1f5f9',
                               color:s.is_default?'#92400e':'#475569',fontWeight:s.is_default?700:400}}>
                               {s.is_default&&<i className="fa-solid fa-star" style={{fontSize:'.55rem'}}/>}
                               {sp.marka_kisa_adi||sp.name}
                               {sp.supplier_kind === 'internal_warehouse' && ' [İç Depo]'}
                               {sp.supplier_kind === 'internal_kitchen' && ' [Mutfak]'}
                             </span>
                           )
                         })
                       : (() => {
                           const sp = suppliers.find(s=>s.id===item.supp_id)
                           if (!sp) return '—'
                           return (
                             <span>
                               {sp.name}
                               {sp.supplier_kind === 'internal_warehouse' && ' [İç Depo]'}
                               {sp.supplier_kind === 'internal_kitchen' && ' [Mutfak]'}
                             </span>
                           )
                         })()}
                    </td>
                    <td>{item.saleable?<span className="badge bg"><i className="fa-solid fa-check" style={{fontSize:'.65rem'}}/> Evet</span>:<span className="badge bgr">—</span>}</td>
                    <td><div style={{display:'flex',gap:3}}>
                      {item.deleted_at ? (
                        <button className="ico-btn" title="Geri Al" onClick={()=>restoreItem(item)}
                          style={{color:'#16a34a',background:'#d1fae5'}}>
                          <i className="fa-solid fa-rotate-left"/>
                        </button>
                      ) : (
                        <>
                          <button className="ico-btn edit" onClick={()=>openEdit(item)}><i className="fa-solid fa-pen"/></button>
                          <button className="ico-btn del"  onClick={()=>setConfirm(item)}><i className="fa-solid fa-trash"/></button>
                        </>
                      )}
                    </div></td>
                  </tr>
                })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-bg open">
          <div className="modal-box" style={{width:740,maxHeight:'92vh',display:'flex',flexDirection:'column'}}>

            {/* Head + tabs */}
            <div className="modal-head">
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                <h2 style={{fontSize:'1.1rem',fontWeight:800,color:'#0f172a',margin:0}}>
                  {editId ? (
                    <span>
                      Stok Malı Düzenle
                      {form.name && <span style={{fontWeight:400,color:'#64748b',fontSize:'.9rem'}}> — {form.name}</span>}
                    </span>
                  ) : 'Stok Malı Ekle'}
                </h2>
                <button className="ico-btn" onClick={closeModal} style={{fontSize:'1rem',color:'#64748b'}}>
                  <i className="fa-solid fa-xmark"/>
                </button>
              </div>
              <div style={{display:'flex',gap:2,background:'#dde3ec',borderRadius:10,padding:3}}>
                {tabs.map((t,i)=>(
                  <button key={i} title={t.disabled ? t.disabledReason : t.label} onClick={()=>{
                    if (t.disabled) {
                      toast(t.disabledReason, 'warning')
                      setTab(2)
                      return
                    }
                    setTab(i)
                  }} style={{flex:1,padding:'8px 4px',border:'none',
                    borderRadius:8,fontSize:'.8rem',fontWeight:700,cursor:t.disabled?'not-allowed':'pointer',transition:'.15s',
                    background:tab===i?'linear-gradient(135deg,#f59e0b,#fbbf24)':t.disabled?'rgba(148,163,184,.16)':'transparent',
                    color:tab===i?'#0f172a':t.disabled?'#94a3b8':'#64748b',
                    opacity:t.disabled ? .75 : 1}}>
                    <i className={`fa-solid ${t.icon}`} style={{marginRight:5}}/>{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="modal-body" style={{flex:1,overflowY:'auto'}}>

              {/* ── Tab 0: Temel Bilgiler ── */}
              {tab===0 && <div style={{display:'grid',gap:14}}>

                {/* SKU */}
                <div>
                  <label className="f-label">SKU Kodu</label>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <div style={{position:'relative',flex:1}}>
                      <input className="f-input" placeholder="SKU kodu girin"
                        value={form.sku} readOnly={form.auto_sku}
                        onChange={e=>{ set('sku',e.target.value); checkSkuManual(e.target.value) }}
                        onBlur={e=>checkSkuManual(e.target.value)}
                        style={{paddingRight:36,
                          background:form.auto_sku?'#fffbeb':'',
                          color:form.auto_sku?'#92400e':'',
                          fontWeight:form.auto_sku?700:400,
                          fontFamily:form.auto_sku?'monospace':'inherit',
                          borderColor:skuStatus.type==='error'?'#dc2626':skuStatus.type==='ok'?'#10b981':skuStatus.type==='auto'?'#fbbf24':''}}/>
                      {form.auto_sku && (
                        <button onClick={regenSku} title="Yeni SKU Üret"
                          style={{position:'absolute',right:6,top:'50%',transform:'translateY(-50%)',
                            width:26,height:26,background:'#fef3c7',border:'1.5px solid #fbbf24',
                            borderRadius:7,cursor:'pointer',color:'#d97706',fontSize:'.7rem',
                            display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <i className="fa-solid fa-rotate-right"/>
                        </button>
                      )}
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:5,fontSize:'.82rem',color:'#475569',whiteSpace:'nowrap',cursor:'pointer'}}>
                      <input type="checkbox" checked={form.auto_sku} onChange={e=>handleAutoSkuToggle(e.target.checked)}/> Otomatik
                    </label>
                  </div>
                  {skuStatus.type!=='idle' && (
                    <p style={{fontSize:'.72rem',fontWeight:700,marginTop:4,
                      color:skuStatus.type==='error'?'#dc2626':skuStatus.type==='ok'?'#10b981':'#d97706'}}>
                      <i className={`fa-solid fa-${skuStatus.type==='error'?'circle-exclamation':skuStatus.type==='ok'?'circle-check':'wand-magic-sparkles'}`}/> {skuStatus.msg}
                    </p>
                  )}
                  {skuStatus.type==='idle' && <p className="f-hint">Otomatik işaretliyse sistem benzersiz kod atar.</p>}
                </div>

                <div>
                  <label className="f-label">Malzeme İsmi <span style={{color:'#ef4444'}}>*</span></label>
                  <input className="f-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Malzeme ismi girin"/>
                </div>

                <div>
                  <label className="f-label">Kısa İsim <span style={{fontSize:'.7rem',color:'#94a3b8',fontWeight:400}}>(opsiyonel)</span></label>
                  <input className="f-input" value={form.short_name} onChange={e=>set('short_name',e.target.value)} placeholder="Ör: Su 500 ml"/>
                  <p className="f-hint">Boş bırakılırsa tam isim kullanılır.</p>
                </div>

                {/* Malzeme Görseli */}
                <div>
                  <label className="f-label">Malzeme Görseli</label>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{
                      width: 96, height: 72, borderRadius: 12, border: '1.5px solid #e2e8f0',
                      background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', flexShrink: 0
                    }}>
                      {form.image_url ? (
                        <img src={resolveImageUrl(form.image_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Görsel" />
                      ) : (
                        <i className="fa-solid fa-image" style={{ fontSize: '1.5rem', color: '#cbd5e1' }} />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label style={{ cursor: 'pointer' }}>
                          <span className="btn-o" style={{ fontSize: '.78rem', padding: '6px 12px' }}>
                            {uploadingImg ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 5 }} /> Yükleniyor...</> : <><i className="fa-solid fa-cloud-arrow-up" style={{ marginRight: 5 }} /> Resim Yükle</>}
                          </span>
                          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingImg}
                            onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                        </label>
                        {form.image_url && (
                          <button className="btn-g" onClick={() => setForm(prev => ({ ...prev, image_url: '' }))} style={{ fontSize: '.78rem', padding: '6px 12px' }}>
                            <i className="fa-solid fa-xmark" style={{ marginRight: 5 }} /> Resmi Kaldır
                          </button>
                        )}
                      </div>
                      <p className="f-hint" style={{ margin: 0 }}>Önerilen: 4:3 oranında (örn. 800×600px), PNG veya JPG.</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="f-label">Lokasyon <span style={{color:'#ef4444'}}>*</span></label>
                  <LocationPicker value={form.location} onChange={v=>set('location',v)}
                    branches={branches} branchTemplates={branchTpls}/>
                  <p className="f-hint">Birden fazla şube veya hazır grup seçebilirsiniz.</p>
                </div>

                <div>
                  <label className="f-label"><i className="fa-solid fa-tags" style={{color:'#fbbf24',marginRight:4}}/>Kategori</label>
                  <CatPicker cats={cats} value={form.cat_id} onChange={handleCatChange}/>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <label className="f-label"><i className="fa-solid fa-calculator" style={{color:'#6366f1',marginRight:4}}/>Muhasebe Kategorisi</label>
                    <div style={{position:'relative'}}>
                      <input className="f-input" value={form.acc_cat} readOnly placeholder="Kategori seçilince otomatik dolar"
                        style={{background:'#f8fafc',color:'#64748b',cursor:'default',paddingRight:30}}/>
                      <i className="fa-solid fa-lock" style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',color:'#cbd5e1',fontSize:'.7rem'}}/>
                    </div>
                    <p className="f-hint">Seçilen kategoriden alınır.</p>
                  </div>
                  <div>
                    <label className="f-label"><i className="fa-solid fa-hashtag" style={{color:'#6366f1',marginRight:4}}/>Muhasebe Hesap Kodu</label>
                    <div style={{position:'relative'}}>
                      <input className="f-input" value={form.acc_code} readOnly placeholder="Kategori seçilince otomatik dolar"
                        style={{background:'#f8fafc',color:'#64748b',cursor:'default',paddingRight:30}}/>
                      <i className="fa-solid fa-lock" style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',color:'#cbd5e1',fontSize:'.7rem'}}/>
                    </div>
                  </div>
                </div>

              </div>}

              {/* ── Tab 1: Ölçüm & Stok ── */}
              {tab===1 && <div>
                <SectionHead label="Ölçüm & Paketleme"/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'end',marginBottom:10}}>
                  <div>
                    <label className="f-label">Ölçü Birimi <span style={{color:'#ef4444'}}>*</span></label>
                    <SearchableSelect
                      value={form.unit}
                      onChange={v=>set('unit',v)}
                      options={units.map(u=>({value:u.name,label:u.label+(u.symbol?` (${u.symbol})`:'')})) }
                      placeholder="Birim seçiniz"
                    />
                  </div>
                  <button className="btn-o" onClick={addPkg} style={{fontSize:'.83rem'}}>
                    <i className="fa-solid fa-plus"/> Paketleme Birimi Ekle
                  </button>
                </div>
                {form.packaging_units.length>0 && (
                  <div style={{marginBottom:18,display:'flex',flexDirection:'column',gap:8}}>
                    {form.packaging_units.map((p, idx)=>{
                      // Önceki birimi bul: ilk satır için ana birim, sonraki satır için bir önceki satırın birimi
                      const prevUnit = idx===0
                        ? (units.find(u=>u.name===form.unit)?.label || form.unit || 'ana birim')
                        : (units.find(u=>u.name===form.packaging_units[idx-1].unit)?.label || form.packaging_units[idx-1].unit || '?')
                      const thisUnit = units.find(u=>u.name===p.unit)?.label || p.unit
                      const hasDesc = thisUnit && p.qty

                      return (
                        <div key={p.id}>
                          <div style={{display:'flex',gap:8,alignItems:'center'}}>
                            <div style={{flex:1}}>
                              <SearchableSelect
                                value={p.unit}
                                onChange={v=>updatePkg(p.id,'unit',v)}
                                options={units.map(u=>({value:u.name,label:u.label+(u.symbol?` (${u.symbol})`:'')})) }
                                placeholder="Birim seçin…"
                              />
                            </div>
                            <input className="f-input" style={{width:100}} type="number" min="1"
                              value={p.qty} onChange={e=>updatePkg(p.id,'qty',e.target.value)} placeholder="Miktar"/>
                            <button className="ico-btn del" onClick={()=>removePkg(p.id)}><i className="fa-solid fa-xmark"/></button>
                          </div>
                          {hasDesc && (
                            <div style={{fontSize:'.78rem',color:'#6366f1',fontWeight:600,
                              paddingLeft:4,marginTop:3,display:'flex',alignItems:'center',gap:5}}>
                              <i className="fa-solid fa-circle-info" style={{fontSize:'.65rem',opacity:.7}}/>
                              1 {thisUnit} = {p.qty} {prevUnit} içerir
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <SectionHead label="Stok Seviyeleri"/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:18}}>
                  <div><label className="f-label">Minimum Stok</label>
                    <input className="f-input" type="number" min="0" value={form.min_stock} onChange={e=>set('min_stock',e.target.value)}/>
                    <p className="f-hint">Uyarı eşiği</p></div>
                  <div><label className="f-label">Maksimum Stok</label>
                    <input className="f-input" type="number" min="0" value={form.max_stock} onChange={e=>set('max_stock',e.target.value)}/>
                    <p className="f-hint">Aşırı stok uyarı eşiği</p></div>
                  <div><label className="f-label">Tamamlama Seviyesi</label>
                    <input className="f-input" type="number" min="0" value={form.reorder} onChange={e=>set('reorder',e.target.value)} placeholder="Ör: 80"/>
                    <p className="f-hint">Sipariş önerisi</p></div>
                </div>

                <SectionHead label="Sipariş Bilgileri"/>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:18}}>
                  <div><label className="f-label">Sipariş Birimi</label>
                    <SearchableSelect
                      value={form.order_unit}
                      onChange={v=>set('order_unit',v)}
                      options={[{value:'ana',label:'Ana birim'},...units.map(u=>({value:u.name,label:u.label}))]}
                      allowClear={false}
                    />
                  </div>
                  <div><label className="f-label">Min. Sipariş Miktarı</label>
                    <input className="f-input" type="number" min="0" value={form.min_order} onChange={e=>set('min_order',e.target.value)} placeholder="Ör: 5"/></div>
                  <div><label className="f-label">Max. Sipariş Miktarı</label>
                    <input className="f-input" type="number" min="0" value={form.max_order} onChange={e=>set('max_order',e.target.value)} placeholder="Ör: 20"/></div>
                </div>

                <SectionHead label="Kullanım & Reçete"/>
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'.855rem',color:'#334155',cursor:'pointer'}}>
                    <input type="checkbox" checked={recipeLinked}
                      onChange={e=>set('recipe_linked',e.target.checked)}
                      disabled={editId ? recipeLinkedIds.has(editId) : false}
                      style={{width:16,height:16,accentColor:'#fbbf24'}}/>
                    Bu malzemenin kullanımı bir reçeteye bağlı
                  </label>
                  {recipeLinked && editId && recipeLinkedIds.has(editId) && (
                    <div style={{fontSize:'.75rem',color:'#64748b',marginTop:-4}}>
                      Reçetede kullanıldığı için otomatik işaretlendi.
                    </div>
                  )}
                  {!recipeLinked && (
                    <div style={{display:'grid',gap:10}}>
                      <div style={{fontSize:'.77rem',color:'#64748b',lineHeight:1.5}}>
                        Bu alan işaretli değilse sipariş tahmini reçeteden değil, günlük kullanımdan hesaplanır.
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:14,alignItems:'end'}}>
                        <div>
                          <label className="f-label">Günlük Ort. Kullanım <span style={{fontSize:'.68rem',color:'#94a3b8'}}>(ana birim)</span></label>
                          <input className="f-input" type="number" min="0" step="0.01"
                            value={form.daily_usage} onChange={e=>set('daily_usage',e.target.value)}
                            disabled={form.auto_usage}
                            style={{background:form.auto_usage?'#f1f5f9':'',color:form.auto_usage?'#94a3b8':''}}
                            placeholder="Ör: 23"/>
                          <p className="f-hint">Değer girilmezse günlük kullanım 1 ana birim kabul edilir.</p>
                        </div>
                        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'.82rem',color:'#475569',cursor:'pointer',paddingBottom:2}}>
                          <input type="checkbox" checked={form.auto_usage}
                            onChange={e=>{set('auto_usage',e.target.checked);if(e.target.checked)set('daily_usage','')}}
                            style={{width:16,height:16,accentColor:'#fbbf24'}}/>
                          Otomatik hesapla (ilk sayımdan sonra, en fazla son 60 gün)
                        </label>
                      </div>
                      <div style={{fontSize:'.75rem',color:'#64748b',lineHeight:1.5}}>
                        Otomatik hesap açıksa günlük kullanım, ilk geçerli sayımdan itibaren ve en fazla son 60 günlük stok hareketlerinden hesaplanır.
                      </div>
                    </div>
                  )}
                </div>
              </div>}

              {/* ── Tab 2: Tedarikçi & Satış ── */}
              {tab===2 && <div>
                <SectionHead label="Tedarikçi & Fiyat"/>

                {/* Multi-supplier list */}
                <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:12}}>
                  {(form.suppliers_list||[]).map((s,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 140px auto auto',
                      gap:8,alignItems:'center',background:'#f8fafc',borderRadius:10,
                      padding:'10px 12px',border:'1px solid #e2e8f0'}}>
                      <SearchableSelect
                        value={s.supp_id}
                        onChange={v=>{
                          const l=[...form.suppliers_list]
                          l[i]={...l[i],supp_id:v}
                          set('suppliers_list',l)
                        }}
                        options={suppliers.map(sp=>({
                          value:sp.id,
                          label: sp.supplier_kind === 'internal_warehouse'
                            ? `${sp.name || sp.marka_kisa_adi} [İç Depo]`
                            : (sp.supplier_kind === 'internal_kitchen' ? `${sp.name || sp.marka_kisa_adi} [Mutfak]` : (sp.name || sp.marka_kisa_adi || String(sp.id)))
                        }))}
                        placeholder="Tedarikçi seçin…"
                      />
                      <input className="f-input" type="number" min="0" step="0.01"
                        value={s.purchase_price||''}
                        onChange={e=>{
                          const l=[...form.suppliers_list]
                          l[i]={...l[i],purchase_price:e.target.value}
                          set('suppliers_list',l)
                        }}
                        placeholder="Alış fiyatı"/>
                      {/* Varsayılan radio */}
                      <label title="Varsayılan tedarikçi" style={{display:'flex',alignItems:'center',
                        gap:4,cursor:'pointer',fontSize:'.75rem',color:s.is_default?'#d97706':'#94a3b8',
                        fontWeight:s.is_default?700:400,whiteSpace:'nowrap'}}>
                        <input type="radio" name="default_supp" checked={!!s.is_default}
                          onChange={()=>{
                            const l=form.suppliers_list.map((x,j)=>({...x,is_default:j===i}))
                            set('suppliers_list',l)
                          }}
                          style={{accentColor:'#fbbf24'}}/>
                        Varsayılan
                      </label>
                      <button className="ico-btn del" onClick={()=>{
                        const l=form.suppliers_list.filter((_,j)=>j!==i)
                        set('suppliers_list',l)
                      }}><i className="fa-solid fa-xmark"/></button>
                    </div>
                  ))}
                  <button className="btn-o" style={{fontSize:'.83rem',alignSelf:'flex-start'}}
                    onClick={()=>set('suppliers_list',[...(form.suppliers_list||[]),{supp_id:'',purchase_price:'',is_default:form.suppliers_list?.length===0}])}>
                    <i className="fa-solid fa-plus"/> Tedarikçi Ekle
                  </button>
                  <p className="f-hint">Birden fazla tedarikçi eklenebilir. Varsayılan tedarikçi sipariş oluşturmada önceliklidir.</p>
                </div>

                <SectionHead label="Satış Malı"/>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:'.855rem',color:'#334155',cursor:'pointer'}}>
                  <input type="checkbox" checked={form.saleable}
                    onChange={e=>set('saleable',e.target.checked)}
                    style={{width:16,height:16,accentColor:'#fbbf24'}}/>
                  Bu stok malı tek başına satılabilir
                </label>
                {form.saleable && (
                  <div style={{marginTop:14}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:10}}>
                      <div>
                        <label className="f-label">Satış Malı Adı</label>
                        <input className="f-input" value={form.sale_name} onChange={e=>set('sale_name',e.target.value)} placeholder="Ör: Su Pet"/>
                      </div>
                      <div>
                        <label className="f-label">Satış Malı Grubu</label>
                        <SearchableSelect
                          value={form.sale_group}
                          onChange={v=>set('sale_group',v)}
                          options={cats.filter(c=>!c.parent_id).map(c=>({value:c.id,label:c.name}))}
                          placeholder="Seçin…"
                        />
                      </div>
                    </div>
                    <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,
                      padding:'9px 12px',fontSize:'.8rem',color:'#1e40af',display:'flex',alignItems:'flex-start',gap:8}}>
                      <i className="fa-solid fa-circle-info" style={{marginTop:2,flexShrink:0}}/>
                      Kaydedildikten sonra bu stok malı için otomatik bir satış malı oluşturulacaktır.
                    </div>
                  </div>
                )}
              </div>}

              {/* ── Tab 3: Depo (WMS) Ayarları ── */}
              {tab===3 && <div>
                <div style={{padding:'10px 14px',background:'rgba(99,102,241,.06)',borderRadius:10,border:'1px solid rgba(99,102,241,.15)',marginBottom:18,display:'flex',gap:10,alignItems:'flex-start'}}>
                  <i className="fa-solid fa-circle-info" style={{color:'#6366f1',marginTop:2,flexShrink:0}}/>
                  <div style={{fontSize:'.8rem',color:'#334155',lineHeight:1.6}}>
                    <strong>Bu sekmedeki değerler, yalnızca bu stok malında tedarikçi olarak seçilen Ana Depolar için tanımlanabilir.</strong>{' '}
                    Boş bırakılan alanlar için Ölçüm &amp; Stok sekmesindeki global değerler geçerli olur.
                    <br/>Varsayılan Lokasyon ataması için Ana Depo &gt; Depo Ayarları &gt; <strong>Stok Parametreleri</strong> sayfasını kullanın.
                  </div>
                </div>
                <SectionHead label="Ana Depo Parametreleri"/>
                {warehouseBranchesForForm.length === 0 ? (
                  <div style={{padding:16,background:'#f8fafc',borderRadius:8,color:'#64748b',fontSize:'.83rem',textAlign:'center'}}>
                    Bu stok malında tedarikçi olarak seçilmiş Ana Depo bulunmuyor.
                  </div>
                ) : (
                  <div style={{display:'flex',flexDirection:'column',gap:16}}>
                    {warehouseBranchesForForm.map(branch => {
                      const wset = form.warehouse_settings?.[branch.id] || { order_unit:'ana', min_order:'', max_order:'', min_stock:'', safety_stock:'', transfer_price_adjustment_type:'none', transfer_price_adjustment_value:'' }
                      const setW = (k,v) => {
                        const newWs = { ...form.warehouse_settings, [branch.id]: { ...wset, [k]: v } }
                        set('warehouse_settings', newWs)
                      }
                      
                      return (
                        <div key={branch.id} style={{border:'1px solid #e2e8f0',borderRadius:10,padding:14,background:'#f8fafc'}}>
                          <div style={{fontWeight:700,color:'#0f172a',marginBottom:12,display:'flex',alignItems:'center',gap:6}}>
                            <i className="fa-solid fa-warehouse" style={{color:'#34d399'}}/> {branch.name}
                          </div>
                          
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                            <div>
                              <label className="f-label">Minimum Stok</label>
                              <input className="f-input" type="number" min="0" value={wset.min_stock} onChange={e=>setW('min_stock',e.target.value)} placeholder="(global default)"/>
                            </div>
                            <div>
                              <label className="f-label">Güvenlik Stoğu</label>
                              <input className="f-input" type="number" min="0" value={wset.safety_stock} onChange={e=>setW('safety_stock',e.target.value)} placeholder="(global default)"/>
                            </div>
                          </div>
                          
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
                            <div>
                              <label className="f-label">Sipariş Birimi</label>
                              <SearchableSelect
                                value={wset.order_unit}
                                onChange={v=>setW('order_unit',v)}
                                options={[{value:'ana',label:'Ana birim'},...units.map(u=>({value:u.name,label:u.label}))]}
                                allowClear={false}
                              />
                            </div>
                            <div>
                              <label className="f-label">Min. Sipariş Miktarı</label>
                              <input className="f-input" type="number" min="0" value={wset.min_order} onChange={e=>setW('min_order',e.target.value)} placeholder="(global default)"/>
                            </div>
                            <div>
                              <label className="f-label">Max. Sipariş Miktarı</label>
                              <input className="f-input" type="number" min="0" value={wset.max_order} onChange={e=>setW('max_order',e.target.value)} placeholder="(global default)"/>
                            </div>
                          </div>

                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:14}}>
                            <div>
                              <label className="f-label">Şubeye Sevk Fiyatı</label>
                              <SearchableSelect
                                value={wset.transfer_price_adjustment_type || 'none'}
                                onChange={v=>setW('transfer_price_adjustment_type',v)}
                                options={[
                                  {value:'none',label:'Alış fiyatı'},
                                  {value:'percent',label:'% marj'},
                                  {value:'amount',label:'Tutar marj'},
                                ]}
                                allowClear={false}
                              />
                            </div>
                            <div>
                              <label className="f-label">Marj Değeri</label>
                              <input
                                className="f-input"
                                type="number"
                                min="0"
                                step="any"
                                value={wset.transfer_price_adjustment_value}
                                onChange={e=>setW('transfer_price_adjustment_value',e.target.value)}
                                disabled={(wset.transfer_price_adjustment_type || 'none') === 'none'}
                                placeholder={wset.transfer_price_adjustment_type === 'percent' ? 'Ör: 10' : 'Ör: 1'}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>}

            </div>

            {/* Footer */}
            <input type="hidden" value={editId||''}/>
            <div className="modal-foot" style={{justifyContent:'space-between'}}>
              <div style={{display:'flex',gap:6}}>
                {tab>0 && <button className="btn-o" onClick={()=>setTab(t=>t-1)} style={{fontSize:'.83rem'}}>
                  <i className="fa-solid fa-chevron-left"/> Geri
                </button>}
                {tab<3 && !(tab===2 && !hasWarehouseSupplier) && <button className="btn-o" onClick={()=>setTab(t=>t+1)} style={{fontSize:'.83rem'}}>
                  <i className="fa-solid fa-chevron-right"/> İleri
                </button>}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button className="btn-g" onClick={closeModal}>İptal</button>
                <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
              </div>
            </div>

          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        desc="Bu işlem geri alınamaz."
        onConfirm={()=>remove(confirm)}
        onCancel={()=>setConfirm(null)}/>
    </div>
  )
}
