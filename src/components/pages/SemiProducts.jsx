import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddButton from '@/components/ui/AddButton'
import StockSearchSelect from '@/components/ui/StockSearchSelect'
import SearchableSelect from '@/components/ui/SearchableSelect'
import RecipeRowsGrid from '@/components/ui/RecipeRowsGrid'
import { ensureDefaultLocationSelection, getAllBranchesLocationSelection, withDefaultLocationSelection } from '@/lib/locationDefaults'

// ── Helpers ──────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

function getSemiProductUnitCost(semiId, semiItemsList, stockItemsList, visited = new Set()) {
  if (visited.has(semiId)) return 0
  visited.add(semiId)

  const semi = semiItemsList.find(x => x.id === semiId)
  if (!semi) return 0

  let recipeRows = []
  if (semi.recipe_rows) {
    if (typeof semi.recipe_rows === 'string') {
      try {
        recipeRows = JSON.parse(semi.recipe_rows || '[]')
      } catch (e) {
        recipeRows = []
      }
    } else if (Array.isArray(semi.recipe_rows)) {
      recipeRows = semi.recipe_rows
    }
  }

  if (!recipeRows || recipeRows.length === 0) return 0

  let totalCost = 0
  for (const row of recipeRows) {
    const qty = parseFloat(row.qty) || 0
    const waste = parseFloat(row.waste_pct) || 0
    const usedQty = qty * (1 + waste / 100)

    const itemId = row.stock_item_id || row.semi_item_id || row.ingredient_id
    if (!itemId) continue

    const stockItem = stockItemsList.find(x => x.id === itemId)
    let itemUnitCost = 0
    if (stockItem) {
      itemUnitCost = parseFloat(stockItem.purchase_price) || 0
    } else {
      const nestedSemi = semiItemsList.find(x => x.id === itemId)
      if (nestedSemi) {
        itemUnitCost = getSemiProductUnitCost(itemId, semiItemsList, stockItemsList, visited)
      }
    }
    totalCost += itemUnitCost * usedQty
  }

  const outputQty = parseFloat(semi.recipe_output_qty) || 1
  return totalCost / (outputQty || 1)
}

function resolveRecipeRowsWithCosts(rowsInput, stockItems, semiItems) {
  let rows = []
  if (rowsInput) {
    if (typeof rowsInput === 'string') {
      try {
        rows = JSON.parse(rowsInput || '[]')
      } catch (e) {
        rows = []
      }
    } else if (Array.isArray(rowsInput)) {
      rows = rowsInput
    }
  }

  return rows.map(row => {
    const itemId = row.stock_item_id || row.semi_item_id || row.ingredient_id
    if (!itemId) return row

    const currentCost = parseFloat(row.cost) || 0
    if (currentCost > 0) return row

    const stockItem = stockItems.find(x => x.id === itemId)
    if (stockItem) {
      return {
        ...row,
        cost: (parseFloat(stockItem.purchase_price) || 0).toFixed(4)
      }
    }

    const semiItem = semiItems.find(x => x.id === itemId)
    if (semiItem) {
      return {
        ...row,
        cost: (getSemiProductUnitCost(itemId, semiItems, stockItems) || 0).toFixed(4)
      }
    }

    return row
  })
}

function getAllBranches(tree) {
  const r = []
  function walk(n) { for (const x of n||[]) { if(x.type==='sube' || x.type === 'anadepo' || x.type === 'mutfak') r.push({id:x.id,name:x.name}); walk(x.children||[]) } }
  walk(tree); return r
}

function resolveMask(mask) {
  if (!mask) return ''
  const now = new Date()
  const yyyy = String(now.getFullYear())
  return mask.toUpperCase()
    .replace(/YYYY/g, yyyy).replace(/YY/g, yyyy.slice(2))
    .replace(/AA/g, String(now.getMonth()+1).padStart(2,'0'))
    .replace(/GG/g, String(now.getDate()).padStart(2,'0'))
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

function parseArrayValue(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
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

  function selectAllVisible() {
    const visibleTemplates = filtTpl.map(t => ({
      type: 'template',
      id: t.id,
      name: t.name,
      branchIds: t.branch_ids || [],
    }))
    const coveredVisibleBranchIds = new Set(visibleTemplates.flatMap(item => item.branchIds || []))
    const visibleBranches = filtBr
      .filter(b => !coveredVisibleBranchIds.has(b.id))
      .map(b => ({
        type: 'branch',
        id: b.id,
        name: b.name,
        branchIds: null,
      }))

    const next = [...selected]
    for (const item of [...visibleTemplates, ...visibleBranches]) {
      const exists = next.some(entry => entry.type === item.type && entry.id === item.id)
      if (!exists) next.push(item)
    }
    onChange(next)
    setTimeout(()=>setOpen(true), 0)
  }

  const filtTpl = branchTemplates.filter(t=>!search||t.name.toLowerCase().includes(search.toLowerCase()))
  const filtBr  = branches.filter(b=>!search||b.name.toLowerCase().includes(search.toLowerCase()))

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
              onChange={e=>setSearch(e.target.value)} onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}}/>
            {(filtTpl.length>0 || filtBr.length>0) && (
              <button onClick={e=>{e.stopPropagation();selectAllVisible()}}
                style={{fontSize:'.72rem',color:'#64748b',background:'none',border:'none',cursor:'pointer'}}>
                <i className="fa-solid fa-check-double"/> Tumunu Sec
              </button>
            )}
            <button onClick={e=>{e.stopPropagation();onChange([]);setSearch('')}}
              style={{fontSize:'.72rem',color:'#94a3b8',background:'none',border:'none',cursor:'pointer'}}>
              <i className="fa-solid fa-xmark"/> Temizle
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
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
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
  channel_prices: [],
  // Tab 2 - Seçenekler
  portions: [],
  option_groups: [],
  // Tab 5 - Reçete
  recipe_rows: [],       // [{id, stock_item_id, sku, unit, qty, cost, waste_pct, channels, portions}]
  recipe_output_qty: 1,
  recipe_output_unit: '',
  recipe_is_template: false,
  // Tab 4 - Ayarlar
  setting_active: true, sale_status: true, is_favorite: false,
  split_payment: false, print_note: false, hide_kitchen: false,
  substitute_id: '',
  // Tab 3 - Görsel
  pos_image:'', pos_color:'#1e293b', pos_text_color:'#ffffff',
  channel_image:'', channel_description:'',
}

const TABS = [
  { label:'Temel Bilgiler', icon:'fa-circle-info' },
  { label:'Ayarlar',        icon:'fa-gear'        },
  { label:'Reçete',         icon:'fa-book-open'   },
]

// ── Main component ────────────────────────────────────────────
export default function SemiProducts() {
  const toast = useToast()
  const [items, setItems]       = useState([])
  const [cats, setCats]         = useState([])  // sale_categories
  const [units, setUnits]       = useState([])
  const [channels, setChannels] = useState([])
  const [taxes, setTaxes]       = useState([])
  const [stockItems, setStockItems] = useState([])
  const [semiItems, setSemiItems]   = useState([])
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [branches, setBranches] = useState([])
  const [branchTpls, setBranchTpls] = useState([])
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
  const locationDefaultAppliedRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: si }, { data: ca }, { data: un }, { data: ch }, { data: tx },
           { data: sk }, { data: smi }, { data: ct }, { data: bt }] = await Promise.all([
      db.from('semi_items').select('*').is('deleted_at',null).order('name'),
      db.from('semi_categories').select('*').order('name'),
      db.from('units').select('*').order('is_system',{ascending:false}).order('sort_order').order('label'),
      db.from('sales_channels').select('*').is('deleted_at',null).eq('active',true).order('sort_order'),
      db.from('taxes').select('*').is('deleted_at',null).order('rate'),
      db.from('stock_items').select('id,name,sku,unit,purchase_price').is('deleted_at',null).order('name'),
      db.from('semi_items').select('id,name,sku,recipe_output_unit,recipe_rows,recipe_output_qty').is('deleted_at',null).order('name'),
      db.from('settings').select('value').eq('key','company_tree').single(),
      db.from('branch_templates').select('*').order('name'),
    ])
    setItems(si||[])
    setCats(ca||[])
    setUnits(un||[])
    setChannels(ch||[])
    setTaxes(tx||[])
    setStockItems(sk||[])
    setSemiItems((smi||[]).map(item => ({ ...item, unit: item.recipe_output_unit || '' })))
    setBranches(getAllBranches(ct?.value||[]))
    setBranchTpls(bt||[])
    setExistingSkus(new Set((si||[]).map(x=>x.sku).filter(Boolean)))
    // Şirketten ondalık basamak
    function findDecimal(nodes) {
      for (const n of nodes||[]) {
        if (n.type==='sirket' && n.decimalPlaces!==undefined) return n.decimalPlaces
        const r = findDecimal(n.children||[])
        if (r!==null) return r
      }
      return null
    }
    const dp = findDecimal(ct?.value||[])
    if (dp!==null) setDecimalPlaces(parseInt(dp)||2)
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

  // ── SKU ───────────────────────────────────────────────────
  async function resolveAutoSku(catId, excludeId) {
    const editSku = excludeId ? items.find(x=>x.id===excludeId)?.sku : null
    const allSkus = new Set([...existingSkus].filter(s=>s!==editSku))

    const cat = catId ? cats.find(c=>c.id===catId) : null
    const hasCatMask = cat && !!(cat.sku_mask || (cat.append_type && cat.append_len))

    let mask='', appendType='', appendLen=4, hasMask=false
    if (hasCatMask) {
      mask=cat.sku_mask||''; appendType=cat.append_type||''; appendLen=cat.append_len||4; hasMask=true
    } else {
      const { data } = await db.from('settings').select('value').eq('key','default_sale_sku_mask').single()
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
    const editSku = editId ? items.find(x=>x.id===editId)?.sku : null
    const dup = existingSkus.has(val) && val !== editSku
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
    setForm({
      sku: item.sku||'', auto_sku: item.auto_sku||false,
      name: item.name||'', short_name: item.short_name||'',
      location: ensureDefaultLocationSelection(parseLocationValue(item.location), branchTpls),
      cat_id: item.sale_cat_l5||item.sale_cat_l4||item.sale_cat_l3||item.sale_cat_l2||item.sale_cat_l1||null,
      acc_cat: item.acc_cat||'', acc_code: item.acc_code||'',
      channel_prices: parseArrayValue(item.channel_prices),
      portions: parseArrayValue(item.portions),
      option_groups: parseArrayValue(item.option_groups),
      recipe_rows: resolveRecipeRowsWithCosts(item.recipe_rows, stockItems, semiItems),
      recipe_output_qty: item.recipe_output_qty||1,
      recipe_output_unit: item.recipe_output_unit||'',
      recipe_is_template: item.recipe_is_template||false,
      setting_active: item.setting_active!==false,
      sale_status: item.sale_status!==false, is_favorite: item.is_favorite||false,
      split_payment: item.split_payment||false, print_note: item.print_note||false,
      hide_kitchen: item.hide_kitchen||false, substitute_id: item.substitute_id||'',
      pos_image: item.pos_image||'', pos_color: item.pos_color||'#1e293b', pos_text_color: item.pos_text_color||'#ffffff',
      channel_image: item.channel_image||'', channel_description: item.channel_description||'',
    })
    setEditId(item.id); setTab(0)
    setSkuStatus(item.auto_sku ? {type:'auto',msg:'Otomatik üretildi.'} : {type:'idle',msg:''})
    setModal(true)
  }
  function closeModal() { setModal(false); setForm(EMPTY); setEditId(null) }

  // ── Save ─────────────────────────────────────────────────
  async function save() {
    if (!form.name.trim()) { setTab(0); toast('Yarımamul ismi zorunludur','error'); return }
    if (!form.location?.length) { setTab(0); toast('En az bir lokasyon seçmelisiniz','error'); return }
    if (!form.sku) { setTab(0); toast('SKU kodu zorunludur','error'); return }

    // Reçete: aynı stok malı + aynı porsiyon çakışma kontrolü
    const recipeRows = form.recipe_rows||[]
    const portConflicts = []
    recipeRows.forEach((row, i) => {
      if (!row.stock_item_id) return
      const rowPorts = row.portions||[]
      rowPorts.forEach(portId => {
        const clash = recipeRows.find((r,j) =>
          j !== i &&
          r.stock_item_id === row.stock_item_id &&
          (r.portions||[]).includes(portId)
        )
        if (clash) {
          const stockName = stockItems.find(x=>x.id===row.stock_item_id)?.name || row.stock_item_id
          const portName = portId === '__standart__' ? 'Standart' : (form.portions||[]).find(p=>p.id===portId)?.name || portId
          portConflicts.push(`"${stockName}" → ${portName}`)
        }
      })
    })
    if (portConflicts.length > 0) {
      setTab(2)
      toast(`Reçete hatası: Aynı stok malı aynı boyuta atanamaz — ${[...new Set(portConflicts)].join(', ')}`, 'error')
      return
    }

    const editSku = editId ? items.find(x=>x.id===editId)?.sku : null
    if (existingSkus.has(form.sku) && form.sku !== editSku) {
      setTab(0); setSkuStatus({type:'error',msg:`"${form.sku}" SKU kodu zaten kullanılıyor.`})
      toast('SKU kodu çakışıyor','error'); return
    }

    const chain = form.cat_id ? catAncestry(cats, form.cat_id) : []
    const payload = {
      sku: form.sku, auto_sku: form.auto_sku,
      name: form.name.trim(), short_name: form.short_name.trim()||null,
      location: form.location || [],
      acc_cat: form.acc_cat||null, acc_code: form.acc_code||null,
      sale_cat_l1: chain[0]?.id||null, sale_cat_l2: chain[1]?.id||null,
      sale_cat_l3: chain[2]?.id||null, sale_cat_l4: chain[3]?.id||null, sale_cat_l5: chain[4]?.id||null,
      channel_prices: form.channel_prices,
      portions: form.portions||[],
      option_groups: form.option_groups||[],
      recipe_rows: form.recipe_rows||[],
      recipe_output_qty: parseFloat(form.recipe_output_qty)||1,
      recipe_output_unit: form.recipe_output_unit||null,
      recipe_is_template: form.recipe_is_template||false,
      same_price: form.same_price,
      setting_active: form.setting_active, sale_status: form.sale_status,
      is_favorite: form.is_favorite, split_payment: form.split_payment,
      print_note: form.print_note, hide_kitchen: form.hide_kitchen,
      substitute_id: form.substitute_id||null,
      pos_image: form.pos_image||null, pos_color: form.pos_color||'#1e293b', pos_text_color: form.pos_text_color||'#ffffff',
      channel_image: form.channel_image||null, channel_description: form.channel_description||null,
    }

    if (editId) {
      const { error } = await db.from('semi_items').update(payload).eq('id', editId)
      if (error) { toast('Hata: '+error.message,'error'); return }
      toast(`"${payload.name}" güncellendi`,'success')
    } else {
      const { error } = await db.from('semi_items').insert(payload)
      if (error) { toast('Hata: '+error.message,'error'); return }
      toast(`"${payload.name}" eklendi`,'success')
    }
    closeModal(); load()
  }

  async function remove(item) {
    const { error } = await db.from('semi_items').update({deleted_at: new Date().toISOString()}).eq('id', item.id)
    if (error) toast('Silinemedi: '+error.message,'error')
    else { toast(`"${item.name}" silindi`,'info'); load() }
    setConfirm(null)
  }

  async function restoreItem(item) {
    const { error } = await db.from('semi_items').update({deleted_at: null}).eq('id', item.id)
    if (error) toast('Geri alınamadı: '+error.message,'error')
    else { toast(`"${item.name}" geri alındı`,'success'); load() }
  }

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function itemCat(item) {
    const id = item.sale_cat_l5||item.sale_cat_l4||item.sale_cat_l3||item.sale_cat_l2||item.sale_cat_l1
    return id ? cats.find(c=>c.id===id) : null
  }

  return (
    <div className="page-enter">
      <Header
        title="Yarımamul"
        subtitle={`${filtered.length} yarımamul`}
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
          <AddButton onClick={openAdd} label="Yarımamul Ekle" />
        </>}
      />

      {/* Search */}
      <div className="card" style={{padding:14,marginBottom:14}}>
        <div style={{position:'relative'}}>
          <i className="fa-solid fa-search" style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',fontSize:'.75rem'}}/>
          <input className="f-input" placeholder="Satış malı ara…" style={{paddingLeft:30}}
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
              <th>SKU</th><th>Satış Malı</th><th>Kategori</th><th>Durum</th><th>İşlem</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={5}><div className="empty"><i className="fa-solid fa-utensils"/><p>Satış malı bulunamadı</p></div></td></tr>
              ) : filtered.map(item=>{
                  const cat = itemCat(item)
                  return <tr key={item.id} className={item.deleted_at?'deleted':''}>
                    <td><span style={{fontFamily:'monospace',fontSize:'.8rem',fontWeight:700,color:'#475569'}}>{item.sku||'—'}</span></td>
                    <td style={{fontWeight:600,color:'#0f172a'}}>
                      <span className={item.deleted_at?'row-deleted':''}>{item.name}</span>
                      {item.short_name&&<div style={{fontSize:'.74rem',color:'#94a3b8'}}>{item.short_name}</div>}
                    </td>
                    <td>{cat?<span className="badge" style={{background:cat.bg,color:cat.text_color}}>{cat.name}</span>:<span style={{color:'#cbd5e1'}}>—</span>}</td>
                    <td><span className={`badge ${item.active!==false?'bg':'br'}`}>{item.active!==false?'Aktif':'Pasif'}</span></td>
                    <td><div style={{display:'flex',gap:3}}>
                      {item.deleted_at ? (
                        <button className="ico-btn" title="Geri Al" onClick={()=>restoreItem(item)}
                          style={{color:'#16a34a',background:'#d1fae5'}}>
                          <i className="fa-solid fa-rotate-left"/>
                        </button>
                      ) : (
                        <>
                          <button className="ico-btn edit" onClick={()=>openEdit(item)}><i className="fa-solid fa-pen"/></button>
                          <button className="ico-btn del" onClick={()=>setConfirm(item)}><i className="fa-solid fa-trash"/></button>
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
      <Modal
        open={modal}
        onClose={closeModal}
        width='min(96vw, 860px)'
        flex
        title={editId ? (
          <span>
            Yarımamul Düzenle
            {form.name && <span style={{fontWeight:400,color:'#64748b',fontSize:'.9rem'}}> — {form.name}</span>}
          </span>
        ) : 'Yarımamul Ekle'}
        tabs={
          <div style={{display:'flex',gap:2,background:'#dde3ec',borderRadius:10,padding:3}}>
            {TABS.map((t,i)=>(
              <button key={i} onClick={()=>setTab(i)} style={{flex:1,padding:'8px 4px',border:'none',
                borderRadius:8,fontSize:'.78rem',fontWeight:700,cursor:'pointer',transition:'.15s',
                background:tab===i?'linear-gradient(135deg,#f59e0b,#fbbf24)':'transparent',
                color:tab===i?'#0f172a':'#64748b'}}>
                <i className={`fa-solid ${t.icon}`} style={{marginRight:4}}/>{t.label}
              </button>
            ))}
          </div>
        }
        footer={
          <div style={{display:'flex',justifyContent:'space-between',width:'100%'}}>
            <div style={{display:'flex',gap:6}}>
              {tab>0 && <button className="btn-o" onClick={()=>setTab(t=>t-1)} style={{fontSize:'.83rem'}}>
                <i className="fa-solid fa-chevron-left"/> Geri
              </button>}
              {tab<TABS.length-1 && <button className="btn-o" onClick={()=>setTab(t=>t+1)} style={{fontSize:'.83rem'}}>
                İleri <i className="fa-solid fa-chevron-right"/>
              </button>}
            </div>
            <div style={{display:'flex',gap:8}}>
              <button className="btn-g" onClick={closeModal}>İptal</button>
              <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
            </div>
          </div>
        }
      >

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

                {/* Name */}
                <div>
                  <label className="f-label">Yarımamul İsmi <span style={{color:'#ef4444'}}>*</span></label>
                  <input className="f-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Satış malı ismi girin"/>
                </div>

                {/* Short name */}
                <div>
                  <label className="f-label">Kısa İsim <span style={{fontSize:'.7rem',color:'#94a3b8',fontWeight:400}}>(opsiyonel)</span></label>
                  <input className="f-input" value={form.short_name} onChange={e=>set('short_name',e.target.value)} placeholder="Ör: Su 500 ml"/>
                  <p className="f-hint">Boş bırakılırsa tam isim kullanılır.</p>
                </div>

                {/* Location */}
                <div>
                  <label className="f-label">Lokasyon <span style={{color:'#ef4444'}}>*</span></label>
                  <LocationPicker value={form.location} onChange={v=>set('location',v)}
                    branches={branches} branchTemplates={branchTpls}/>
                  <p className="f-hint">Birden fazla şube veya hazır grup seçebilirsiniz.</p>
                </div>

                {/* Category — sale_categories */}
                <div>
                  <label className="f-label"><i className="fa-solid fa-tags" style={{color:'#fbbf24',marginRight:4}}/>Kategori</label>
                  <CatPicker cats={cats} value={form.cat_id} onChange={handleCatChange}/>
                </div>

                {/* Accounting */}
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

              {/* ── Tab 1-5: Boş (ileride geliştirilecek) ── */}
              {/* ── Tab 1: Satış & Fiyat ── */}
              {tab===99 && <div>
                <div style={{marginBottom:14,display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}>
                  <div>
                    <p style={{fontSize:'.9rem',fontWeight:700,color:'#0f172a',margin:'0 0 4px'}}>Satış Kanalları Fiyatlandırma</p>
                    <p style={{fontSize:'.78rem',color:'#94a3b8',margin:0}}>Her satış kanalında farklı fiyat ve KDV oranı tanımlayabilirsiniz.</p>
                  </div>
                  {/* Tüm fiyatlar aynı toggle */}
                  <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',
                    background: form.same_price?'#fef3c7':'#f1f5f9',
                    border:`1.5px solid ${form.same_price?'#fbbf24':'#e2e8f0'}`,
                    borderRadius:10,padding:'7px 12px',userSelect:'none',whiteSpace:'nowrap',flexShrink:0}}>
                    <label className="tog" onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={form.same_price}
                        onChange={e=>set('same_price',e.target.checked)}/>
                      <span className="tog-sl"/>
                    </label>
                    <span style={{fontSize:'.82rem',fontWeight:700,color:form.same_price?'#92400e':'#64748b'}}>
                      <i className="fa-solid fa-clone" style={{marginRight:5}}/>Tüm Fiyatlar Aynı
                    </span>
                  </label>
                </div>

                {channels.length===0 ? (
                  <div style={{padding:32,textAlign:'center',color:'#94a3b8',background:'#f8fafc',borderRadius:12}}>
                    <i className="fa-solid fa-store" style={{fontSize:'1.5rem',marginBottom:8,display:'block'}}/>
                    <p style={{fontSize:'.83rem'}}>Henüz satış kanalı tanımlanmamış.</p>
                    <p style={{fontSize:'.78rem'}}>Ayarlar → Satış Kanalı Yönetimi sayfasından ekleyebilirsiniz.</p>
                  </div>
                ) : (
                  <div style={{border:'1px solid #e2e8f0',borderRadius:12,overflow:'hidden'}}>
                    {/* Header */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 100px 1fr 160px',
                      padding:'10px 16px',background:'#f8fafc',
                      borderBottom:'1px solid #e2e8f0',gap:12}}>
                      <span style={{fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em'}}>Satış Kanalı</span>
                      <span style={{fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em',textAlign:'center'}}>Durum</span>
                      <span style={{fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em'}}>Satış Fiyatı</span>
                      <span style={{fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em'}}>KDV Oranı</span>
                    </div>
                    {/* Rows */}
                    {channels.map((ch, idx) => {
                      const cp = form.channel_prices.find(x=>x.channel_id===ch.id) || {channel_id:ch.id,active:false,price:'',tax_id:''}
                      const isActive = cp.active

                      function updateCp(field, val) {
                        const updated = {...cp, [field]: val}
                        if (form.same_price && (field==='price' || field==='tax_id')) {
                          const newList = channels.map(c => {
                            const existing = form.channel_prices.find(x=>x.channel_id===c.id) || {channel_id:c.id,active:false,price:'',tax_id:''}
                            return existing.active ? {...existing, [field]: val} : existing
                          })
                          const otherPrices = form.channel_prices.filter(x=>!channels.find(c=>c.id===x.channel_id))
                          set('channel_prices', [...newList, ...otherPrices])
                        } else {
                          set('channel_prices', [...form.channel_prices.filter(x=>x.channel_id!==ch.id), updated])
                        }
                      }

                      const ICON_MAP = {
                        'Hızlı Satış':'fa-bolt','Masa':'fa-chair','QR':'fa-qrcode',
                        'Kiosk':'fa-desktop','Suitable Yemek':'fa-utensils',
                        'Yemek Sepeti':'fa-basket-shopping','Getir':'fa-motorcycle',
                        'Trendyol':'fa-bag-shopping','Migros':'fa-cart-shopping','Tıkla Gelsin':'fa-truck-fast',
                      }
                      const icon = ch.icon || ICON_MAP[ch.name] || 'fa-store'

                      return (
                        <div key={ch.id} style={{display:'grid',gridTemplateColumns:'1fr 100px 1fr 160px',
                          padding:'12px 16px',gap:12,alignItems:'center',
                          borderBottom: idx<channels.length-1?'1px solid #f1f5f9':'none',
                          background: isActive?'#fffbeb':'#fff',
                          transition:'background .12s'}}>

                          {/* Kanal adı */}
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{width:32,height:32,borderRadius:8,
                              background:isActive?'#fef3c7':'#f1f5f9',
                              display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                              <i className={`fa-solid ${icon}`} style={{color:isActive?'#d97706':'#94a3b8',fontSize:'.8rem'}}/>
                            </div>
                            <span style={{fontWeight:isActive?700:500,fontSize:'.875rem',
                              color:isActive?'#0f172a':'#64748b'}}>{ch.name}</span>
                          </div>

                          {/* Toggle */}
                          <div style={{display:'flex',justifyContent:'center'}}>
                            <label className="tog">
                              <input type="checkbox" checked={isActive}
                                onChange={e=>updateCp('active',e.target.checked)}/>
                              <span className="tog-sl"/>
                            </label>
                          </div>

                          {/* Fiyat */}
                          <div style={{position:'relative'}}>
                            <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',
                              color:'#94a3b8',fontSize:'.82rem',fontWeight:600,pointerEvents:'none'}}>₺</span>
                            <input className="f-input" type="number" min="0" step="0.01"
                              value={cp.price||''}
                              onChange={e=>updateCp('price',e.target.value)}
                              disabled={!isActive}
                              placeholder={(0).toFixed(decimalPlaces)}
                              style={{paddingLeft:26,background:!isActive?'#f8fafc':'',color:!isActive?'#94a3b8':''}}/>
                          </div>

                          {/* KDV */}
                          <SearchableSelect
                            value={cp.tax_id||''}
                            onChange={v=>updateCp('tax_id',v)}
                            options={taxes.map(t=>({value:t.id,label:`${t.name} (%${t.rate})`}))}
                            placeholder="KDV"
                            disabled={!isActive}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>}
              {/* ── Tab 2: Seçenekler ── */}
              {tab===99 && <div style={{display:'grid',gap:24}}>

                {/* ── Porsiyon / Boyut Tanımları ── */}
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <i className="fa-solid fa-ruler-combined" style={{color:'#6366f1',fontSize:'.85rem'}}/>
                      <span style={{fontWeight:800,fontSize:'.9rem',color:'#0f172a'}}>Porsiyon / Boyut Tanımları</span>
                      {(form.portions||[]).length>0 && (
                        <span style={{background:'#6366f1',color:'#fff',borderRadius:99,fontSize:'.7rem',
                          fontWeight:700,padding:'1px 7px'}}>{form.portions.length}</span>
                      )}
                    </div>
                    <button className="btn-o" style={{fontSize:'.83rem'}}
                      onClick={()=>set('portions',[...(form.portions||[]),{id:uid(),name:''}])}>
                      <i className="fa-solid fa-plus"/> Porsiyon Ekle
                    </button>
                  </div>

                  {!(form.portions||[]).length ? (
                    <div style={{padding:20,textAlign:'center',color:'#94a3b8',background:'#f8fafc',
                      borderRadius:10,border:'1.5px dashed #e2e8f0',fontSize:'.83rem'}}>
                      Henüz porsiyon tanımı yok. "Porsiyon Ekle" ile ekleyin.
                    </div>
                  ) : (
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                      {(form.portions||[]).map((p,i)=>(
                        <div key={p.id} style={{display:'flex',alignItems:'center',gap:6}}>
                          <input className="f-input" value={p.name}
                            onChange={e=>{
                              const arr=[...(form.portions||[])]
                              arr[i]={...arr[i],name:e.target.value}
                              set('portions',arr)
                            }}
                            placeholder="Porsiyon Adı"/>
                          <button className="ico-btn del"
                            onClick={()=>set('portions',(form.portions||[]).filter((_,j)=>j!==i))}>
                            <i className="fa-solid fa-trash"/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ayraç */}
                <div style={{borderTop:'1.5px dashed #e2e8f0'}}/>

                {/* ── Seçenek Tanımları ── */}
                <div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <i className="fa-solid fa-sliders" style={{color:'#f59e0b',fontSize:'.85rem'}}/>
                      <span style={{fontWeight:800,fontSize:'.9rem',color:'#0f172a'}}>Seçenek Tanımları</span>
                      {(form.option_groups||[]).length>0 && (
                        <span style={{background:'#f59e0b',color:'#fff',borderRadius:99,fontSize:'.7rem',
                          fontWeight:700,padding:'1px 7px'}}>{form.option_groups.length}</span>
                      )}
                    </div>
                    <button className="btn-o" style={{fontSize:'.83rem'}}
                      onClick={()=>set('option_groups',[...(form.option_groups||[]),
                        {id:uid(),group_ref:'',group_name:'',required:true,min_select:0,max_select:1,options:[]}])}>
                      <i className="fa-solid fa-plus"/> Seçenek Grubu Ekle
                    </button>
                  </div>

                  {!(form.option_groups||[]).length ? (
                    <div style={{padding:20,textAlign:'center',color:'#94a3b8',background:'#f8fafc',
                      borderRadius:10,border:'1.5px dashed #e2e8f0',fontSize:'.83rem'}}>
                      Henüz seçenek grubu yok. "Seçenek Grubu Ekle" ile ekleyin.
                    </div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      {(form.option_groups||[]).map((grp,gi)=>(
                        <div key={grp.id} style={{border:'1.5px solid #e2e8f0',borderRadius:12,
                          overflow:'hidden',background:'#fff'}}>

                          {/* Grup header */}
                          <div style={{padding:'14px 16px',borderBottom:'1px solid #f1f5f9',
                            display:'grid',gap:12}}>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:12,alignItems:'start'}}>
                              {/* Grup referansı — ileride tabloya bağlanacak, şimdilik text */}
                              <div>
                                <label className="f-label" style={{marginBottom:4}}>Seçenek Grubu</label>
                                <SearchableSelect
                                  value={grp.group_ref||''}
                                  onChange={v=>{
                                    const arr=[...(form.option_groups||[])]
                                    arr[gi]={...arr[gi],group_ref:v}
                                    set('option_groups',arr)
                                  }}
                                  options={[]}
                                  placeholder="Grup seçin veya manuel girin"
                                />
                              </div>
                              {/* Grup adı */}
                              <div>
                                <label className="f-label" style={{marginBottom:4}}>Seçenek Grubu Adı</label>
                                <input className="f-input" value={grp.group_name}
                                  onChange={e=>{
                                    const arr=[...(form.option_groups||[])]
                                    arr[gi]={...arr[gi],group_name:e.target.value}
                                    set('option_groups',arr)
                                  }}
                                  placeholder="Seçenek Adı"/>
                              </div>
                              {/* Zorunlu toggle */}
                              <div style={{paddingTop:22,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                                <label className="tog">
                                  <input type="checkbox" checked={grp.required!==false}
                                    onChange={e=>{
                                      const arr=[...(form.option_groups||[])]
                                      arr[gi]={...arr[gi],required:e.target.checked}
                                      set('option_groups',arr)
                                    }}/>
                                  <span className="tog-sl"/>
                                </label>
                                <span style={{fontSize:'.68rem',fontWeight:700,textAlign:'center',
                                  color:grp.required!==false?'#dc2626':'#64748b',lineHeight:1.2}}>
                                  {grp.required!==false?'Zorunlu':'İsteğe Bağlı'}
                                </span>
                              </div>
                            </div>

                            {/* Min / Max */}
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,alignItems:'end'}}>
                              <div>
                                <label className="f-label">Min. Seçim Adedi</label>
                                <input className="f-input" type="number" min="0" value={grp.min_select||0}
                                  onChange={e=>{
                                    const arr=[...(form.option_groups||[])]
                                    arr[gi]={...arr[gi],min_select:parseInt(e.target.value)||0}
                                    set('option_groups',arr)
                                  }}/>
                              </div>
                              <div>
                                <label className="f-label">Max. Seçim Adedi</label>
                                <input className="f-input" type="number" min="0" value={grp.max_select||1}
                                  onChange={e=>{
                                    const arr=[...(form.option_groups||[])]
                                    arr[gi]={...arr[gi],max_select:parseInt(e.target.value)||1}
                                    set('option_groups',arr)
                                  }}/>
                              </div>
                              <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                                <button className="btn-o" style={{fontSize:'.78rem',color:'#16a34a',borderColor:'#bbf7d0'}}
                                  onClick={()=>{
                                    const arr=[...(form.option_groups||[])]
                                    arr[gi]={...arr[gi],options:[...(arr[gi].options||[]),
                                      {id:uid(),name:'',price:'',hide_kitchen:false}]}
                                    set('option_groups',arr)
                                  }}>
                                  <i className="fa-solid fa-plus"/> Seçenek Ekle
                                </button>
                                <button className="btn-o" style={{fontSize:'.78rem',color:'#dc2626',borderColor:'#fecaca'}}
                                  onClick={()=>set('option_groups',(form.option_groups||[]).filter((_,j)=>j!==gi))}>
                                  <i className="fa-solid fa-trash"/> Grubu Sil
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Seçenekler listesi */}
                          {(grp.options||[]).length>0 && (
                            <div style={{padding:'10px 16px',display:'flex',flexDirection:'column',gap:8,
                              background:'#fafafa'}}>
                              {(grp.options||[]).map((opt,oi)=>(
                                <div key={opt.id} style={{display:'grid',
                                  gridTemplateColumns:'1fr 180px auto auto',gap:8,alignItems:'center',
                                  background:'#fff',borderRadius:8,padding:'10px 12px',
                                  border:'1px solid #e2e8f0'}}>
                                  <div>
                                    <label className="f-label" style={{fontSize:'.7rem',marginBottom:3}}>Seçenek Adı</label>
                                    <input className="f-input" value={opt.name}
                                      onChange={e=>{
                                        const arr=[...(form.option_groups||[])]
                                        arr[gi].options[oi]={...arr[gi].options[oi],name:e.target.value}
                                        set('option_groups',arr)
                                      }}
                                      placeholder="Seçenek Adı"/>
                                  </div>
                                  <div>
                                    <label className="f-label" style={{fontSize:'.7rem',marginBottom:3}}>Eklenecek Fiyat</label>
                                    <input className="f-input" type="number" min="0" step="0.01"
                                      value={opt.price||''}
                                      onChange={e=>{
                                        const arr=[...(form.option_groups||[])]
                                        arr[gi].options[oi]={...arr[gi].options[oi],price:e.target.value}
                                        set('option_groups',arr)
                                      }}
                                      placeholder="Fiyat İsteğe Bağlı"/>
                                  </div>
                                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3,paddingTop:16}}>
                                    <label className="tog">
                                      <input type="checkbox" checked={opt.hide_kitchen||false}
                                        onChange={e=>{
                                          const arr=[...(form.option_groups||[])]
                                          arr[gi].options[oi]={...arr[gi].options[oi],hide_kitchen:e.target.checked}
                                          set('option_groups',arr)
                                        }}/>
                                      <span className="tog-sl"/>
                                    </label>
                                    <span style={{fontSize:'.66rem',color:'#64748b',textAlign:'center',lineHeight:1.2}}>Mutfakta<br/>Gizle</span>
                                  </div>
                                  <button className="btn-o" style={{fontSize:'.78rem',color:'#dc2626',borderColor:'#fecaca',paddingTop:18,alignSelf:'end'}}
                                    onClick={()=>{
                                      const arr=[...(form.option_groups||[])]
                                      arr[gi].options=arr[gi].options.filter((_,j)=>j!==oi)
                                      set('option_groups',arr)
                                    }}>
                                    <i className="fa-solid fa-minus"/> Seçenek Sil
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>}
              {/* ── Tab 3: Görsel ── */}
              {tab===99 && <div style={{display:'grid',gap:24}}>

                {/* POS / Hızlı Satış Görseli */}
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <i className="fa-solid fa-bolt" style={{color:'#d97706',fontSize:'.85rem'}}/>
                    <span style={{fontWeight:800,fontSize:'.9rem',color:'#0f172a'}}>POS / Hızlı Satış Görseli</span>
                  </div>
                  <p style={{fontSize:'.78rem',color:'#94a3b8',marginBottom:14}}>
                    POS ekranındaki buton için renk veya resim seçin. Kısa isim butonun üzerinde görüntülenir.
                  </p>

                  <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:24,alignItems:'start'}}>
                    {/* Preview */}
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                      <div style={{
                        width:120,height:120,borderRadius:16,overflow:'hidden',
                        background: form.pos_color,
                        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                        border:'2px solid #e2e8f0',flexShrink:0,position:'relative',
                        boxShadow:'0 4px 16px rgba(0,0,0,.12)',padding:6
                      }}>
                        {form.pos_image ? (
                          <>
                            <div style={{flex:1,width:'100%',display:'flex',alignItems:'center',justifyContent:'center',minHeight:0}}>
                              <img src={form.pos_image} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:6}} alt=""/>
                            </div>
                            <div style={{width:'100%',textAlign:'center',paddingTop:4}}>
                              <span style={{fontSize:'.65rem',fontWeight:700,color:form.pos_text_color,lineHeight:1.2,display:'block',wordBreak:'break-word'}}>
                                {form.short_name||form.name||'Ürün Adı'}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div style={{width:'100%',textAlign:'center',padding:'4px 6px'}}>
                            <span style={{fontSize:'.72rem',fontWeight:700,color:form.pos_text_color,lineHeight:1.3,display:'block',wordBreak:'break-word'}}>
                              {form.short_name||form.name||'Ürün Adı'}
                            </span>
                          </div>
                        )}
                      </div>
                      <span style={{fontSize:'.72rem',color:'#94a3b8'}}>Önizleme</span>
                    </div>

                    {/* Controls */}
                    <div style={{display:'grid',gap:14}}>
                      <div>
                        <label className="f-label">Renk veya Resim</label>
                        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                          <label style={{cursor:'pointer'}}>
                            <span className="btn-o" style={{fontSize:'.8rem',padding:'7px 14px'}}>
                              <i className="fa-solid fa-cloud-arrow-up"/> Resim Yükle
                            </span>
                            <input type="file" accept="image/*" style={{display:'none'}}
                              onChange={e=>{
                                const file=e.target.files[0]; if(!file) return
                                const r=new FileReader(); r.onload=ev=>set('pos_image',ev.target.result); r.readAsDataURL(file)
                              }}/>
                          </label>
                          {form.pos_image && (
                            <button className="btn-g" onClick={()=>set('pos_image','')} style={{fontSize:'.78rem'}}>
                              <i className="fa-solid fa-xmark"/> Resmi Kaldır
                            </button>
                          )}
                        </div>
                        {!form.pos_image && <p style={{fontSize:'.72rem',color:'#94a3b8',marginTop:4}}>
                          <i className="fa-solid fa-palette" style={{color:'#6366f1',marginRight:4}}/>Renk seçili
                        </p>}
                      </div>

                      <div>
                        <label className="f-label">Buton Rengi</label>
                        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                          <input type="color" value={form.pos_color}
                            onChange={e=>set('pos_color',e.target.value)}
                            style={{width:44,height:36,border:'1.5px solid #c4cdd9',borderRadius:8,cursor:'pointer',padding:2,background:'none'}}/>
                          <input className="f-input" value={form.pos_color}
                            onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&set('pos_color',e.target.value)}
                            style={{flex:1,fontFamily:'monospace',fontSize:'.85rem'}}/>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(10,1fr)',gap:4}}>
                          {['#000000','#1e293b','#374151','#6b7280','#9ca3af','#d1d5db','#e5e7eb','#f3f4f6','#f9fafb','#ffffff',
                            '#dc2626','#ea580c','#d97706','#ca8a04','#65a30d','#16a34a','#059669','#0d9488','#0891b2','#0284c7',
                            '#2563eb','#4f46e5','#7c3aed','#9333ea','#c026d3','#db2777','#e11d48','#be123c','#9f1239','#7f1d1d',
                            '#fca5a5','#fdba74','#fde68a','#d9f99d','#a7f3d0','#a5f3fc','#bfdbfe','#c4b5fd','#f5d0fe','#fecdd3',
                            '#fef2f2','#fff7ed','#fffbeb','#f7fee7','#f0fdf4','#ecfdf5','#ecfeff','#eff6ff','#f5f3ff','#fdf4ff',
                          ].map(c=>(
                            <div key={c} onClick={()=>set('pos_color',c)}
                              style={{aspectRatio:'1',borderRadius:4,background:c,cursor:'pointer',
                                border:form.pos_color===c?'2.5px solid #6366f1':'1px solid #e2e8f0'}}/>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="f-label">Metin Rengi</label>
                        <div style={{display:'flex',gap:8,alignItems:'center'}}>
                          <input type="color" value={form.pos_text_color}
                            onChange={e=>set('pos_text_color',e.target.value)}
                            style={{width:44,height:36,border:'1.5px solid #c4cdd9',borderRadius:8,cursor:'pointer',padding:2,background:'none'}}/>
                          <input className="f-input" value={form.pos_text_color}
                            onChange={e=>/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)&&set('pos_text_color',e.target.value)}
                            style={{flex:1,fontFamily:'monospace',fontSize:'.85rem'}}/>
                          <button onClick={()=>set('pos_text_color','#ffffff')} title="Beyaz metin"
                            style={{width:36,height:36,borderRadius:8,background:'#fff',
                              border:form.pos_text_color==='#ffffff'?'2.5px solid #6366f1':'1.5px solid #e2e8f0',
                              cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <span style={{fontSize:'.75rem',fontWeight:900,color:'#0f172a'}}>A</span>
                          </button>
                          <button onClick={()=>set('pos_text_color','#0f172a')} title="Siyah metin"
                            style={{width:36,height:36,borderRadius:8,background:'#0f172a',
                              border:form.pos_text_color==='#0f172a'?'2.5px solid #6366f1':'1.5px solid #e2e8f0',
                              cursor:'pointer',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <span style={{fontSize:'.75rem',fontWeight:900,color:'#fff'}}>A</span>
                          </button>
                        </div>
                      </div>

                      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 14px',
                        display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 10px',fontSize:'.78rem'}}>
                        <i className="fa-solid fa-circle-info" style={{color:'#059669',marginTop:1}}/>
                        <span><strong>Öneri:</strong> Kare boyutlu resim kullanın</span>
                        <i className="fa-solid fa-wand-magic-sparkles" style={{color:'#d97706',marginTop:1}}/>
                        <span><strong>Otomatik:</strong> Resimler kare şeklinde ortalanır</span>
                        <i className="fa-solid fa-compress-arrows-alt" style={{color:'#dc2626',marginTop:1}}/>
                        <span><strong>Optimizasyon:</strong> Otomatik sıkıştırma</span>
                        <span style={{color:'#94a3b8',gridColumn:'span 2'}}>PNG, JPG, JPEG (Max. 5MB) &nbsp;·&nbsp; Önerilen: 400×400px veya üzeri</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Ayraç */}
                <div style={{borderTop:'1.5px dashed #e2e8f0'}}/>

                {/* Diğer Kanallar Görseli */}
                <div>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <i className="fa-solid fa-globe" style={{color:'#6366f1',fontSize:'.85rem'}}/>
                    <span style={{fontWeight:800,fontSize:'.9rem',color:'#0f172a'}}>Satış Kanalı Görseli</span>
                  </div>
                  <p style={{fontSize:'.78rem',color:'#94a3b8',marginBottom:14}}>
                    Müşterinin gördüğü satış kanallarında (QR, uygulama, marketplace vb.) kullanılır. Resim yüklenmezse varsayılan ikon gösterilir.
                  </p>

                  <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:24,alignItems:'start'}}>
                    {/* Preview */}
                    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                      <div style={{width:120,height:120,borderRadius:16,overflow:'hidden',
                        background:'#1e293b',display:'flex',alignItems:'center',justifyContent:'center',
                        border:'2px solid #e2e8f0',boxShadow:'0 4px 16px rgba(0,0,0,.12)'}}>
                        {form.channel_image
                          ? <img src={form.channel_image} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/>
                          : <div style={{width:'80%',height:'80%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                              <svg viewBox="0 0 100 100" style={{width:'100%',height:'100%'}}>
                                <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="5"/>
                                <line x1="35" y1="30" x2="35" y2="70" stroke="white" strokeWidth="5" strokeLinecap="round"/>
                                <line x1="35" y1="30" x2="32" y2="42" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                                <line x1="35" y1="30" x2="38" y2="42" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                                <line x1="62" y1="30" x2="62" y2="48" stroke="white" strokeWidth="5" strokeLinecap="round"/>
                                <path d="M58 30 Q55 40 60 46 Q65 40 66 30" fill="none" stroke="white" strokeWidth="4"/>
                                <line x1="62" y1="48" x2="62" y2="70" stroke="white" strokeWidth="5" strokeLinecap="round"/>
                              </svg>
                            </div>}
                      </div>
                      <span style={{fontSize:'.72rem',color:'#94a3b8'}}>Önizleme</span>
                    </div>

                    {/* Controls */}
                    <div style={{display:'grid',gap:14}}>
                      <div>
                        <label className="f-label">Ürün Görseli</label>
                        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
                          <label style={{cursor:'pointer'}}>
                            <span className="btn-o" style={{fontSize:'.8rem',padding:'7px 14px'}}>
                              <i className="fa-solid fa-cloud-arrow-up"/> Resim Yükle
                            </span>
                            <input type="file" accept="image/*" style={{display:'none'}}
                              onChange={e=>{
                                const file=e.target.files[0]; if(!file) return
                                const r=new FileReader(); r.onload=ev=>set('channel_image',ev.target.result); r.readAsDataURL(file)
                              }}/>
                          </label>
                          {form.channel_image && (
                            <button className="btn-g" onClick={()=>set('channel_image','')} style={{fontSize:'.78rem'}}>
                              <i className="fa-solid fa-xmark"/> Resmi Kaldır
                            </button>
                          )}
                        </div>
                        {!form.channel_image && <p style={{fontSize:'.72rem',color:'#94a3b8',marginTop:4}}>
                          Resim yüklenmezse varsayılan ikon kullanılır.
                        </p>}
                      </div>
                      <div>
                        <label className="f-label">Açıklama</label>
                        <textarea className="f-input" rows={3} value={form.channel_description}
                          onChange={e=>set('channel_description',e.target.value)}
                          placeholder="Satış kanalında görüntülenecek ürün açıklaması…"
                          style={{resize:'vertical'}}/>
                      </div>
                      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 14px',
                        display:'grid',gridTemplateColumns:'auto 1fr',gap:'6px 10px',fontSize:'.78rem'}}>
                        <i className="fa-solid fa-circle-info" style={{color:'#059669',marginTop:1}}/>
                        <span><strong>Öneri:</strong> Kare boyutlu resim kullanın</span>
                        <i className="fa-solid fa-wand-magic-sparkles" style={{color:'#d97706',marginTop:1}}/>
                        <span><strong>Otomatik:</strong> Resimler kare şeklinde ortalanır</span>
                        <i className="fa-solid fa-compress-arrows-alt" style={{color:'#dc2626',marginTop:1}}/>
                        <span><strong>Optimizasyon:</strong> Otomatik sıkıştırma</span>
                        <span style={{color:'#94a3b8',gridColumn:'span 2'}}>PNG, JPG, JPEG (Max. 5MB) &nbsp;·&nbsp; Önerilen: 400×400px veya üzeri</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>}
              {/* ── Tab 4: Ayarlar ── */}
              {tab===1 && <div style={{display:'grid',gap:12}}>

                {/* Stok Takibi toggle */}
                {(() => {
                  const tracked = form.setting_active !== false
                  return (
                    <div>
                      <div style={{background:'linear-gradient(135deg,#7c3aed,#6366f1)',borderRadius:12,
                        padding:'14px 16px',display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                        <label className="tog" onClick={e=>e.stopPropagation()}>
                          <input type="checkbox" checked={tracked}
                            onChange={e=>set('setting_active',e.target.checked)}/>
                          <span className="tog-sl"/>
                        </label>
                        <div>
                          <div style={{fontWeight:800,fontSize:'.95rem',color:'#fff'}}>
                            <i className="fa-solid fa-warehouse" style={{marginRight:8}}/>
                            Yarımamul stok takibi yapılacak mı?
                          </div>
                          <div style={{fontSize:'.73rem',color:'rgba(255,255,255,.7)',marginTop:2}}>
                            Bu seçeneği etkinleştirerek stok takibini yönetin
                          </div>
                        </div>
                      </div>

                      {/* Açıklama kutusu */}
                      <div style={{
                        background: tracked ? '#f0fdf4' : '#fffbeb',
                        border: `1.5px solid ${tracked ? '#bbf7d0' : '#fde68a'}`,
                        borderRadius:10, padding:'14px 16px',
                        display:'flex', gap:12, alignItems:'flex-start'
                      }}>
                        <i className={`fa-solid ${tracked ? 'fa-circle-check' : 'fa-circle-info'}`}
                          style={{color: tracked ? '#16a34a' : '#d97706', fontSize:'1rem', marginTop:2, flexShrink:0}}/>
                        <div style={{fontSize:'.83rem', lineHeight:1.6,
                          color: tracked ? '#166534' : '#92400e'}}>
                          {tracked
                            ? <><strong>Stok takibi aktif.</strong> Bu yarımamulün stoğunu takip edebilmek için üretim kaydı oluşturmalısınız. Üretim kaydı, reçetede tanımlı hammaddelerin stoktan düşülmesini ve yarımamul stoğunun artmasını sağlar.</>
                            : <><strong>Stok takibi pasif.</strong> Bu yarımamülün bağlı olduğu satış malına bağlı ve tanımlı reçeteye göre stok düşümü gerçekleşir. Yarımamul stoğu ayrıca takip edilmez.</>
                          }
                        </div>
                      </div>
                    </div>
                  )
                })()}

              </div>}
              {/* ── Tab 5: Reçete ── */}
              {tab===2 && (() => {
                const activeChannels = channels.filter(ch => {
                  const cp = form.channel_prices.find(x=>x.channel_id===ch.id)
                  return cp?.active
                })
                const activePorts = (form.portions||[]).filter(p=>p.name)
                const rows = form.recipe_rows||[]

                // Porsiyon çakışma kontrolü: aynı stok malı farklı satırlarda → porsiyon farklı olmalı
                function portionConflict(rowIdx, portId) {
                  const row = rows[rowIdx]
                  if (!row.stock_item_id) return false
                  return rows.some((r,i)=>
                    i!==rowIdx &&
                    r.stock_item_id===row.stock_item_id &&
                    (r.portions||[]).includes(portId)
                  )
                }

                function addRow() {
                  set('recipe_rows', [...rows, {
                    id: uid(), stock_item_id:'', sku:'', unit:'',
                    qty:'0.0000', cost:'0.0000', waste_pct:'0',
                    channels: activeChannels.map(c=>c.id),
                    portions: ['__standart__', ...activePorts.map(p=>p.id)],
                  }])
                }

                function updateRow(i, k, v) {
                  const arr = [...rows]; arr[i]={...arr[i],[k]:v}; set('recipe_rows',arr)
                }
                function removeRow(i) { set('recipe_rows', rows.filter((_,j)=>j!==i)) }

                function handleStockSelect(i, itemId) {
                  const stockItem = stockItems.find(x=>x.id===itemId) || null
                  const semiItem = semiItems.find(x=>x.id===itemId) || null
                  const arr = [...rows]
                  if (stockItem) {
                    arr[i] = {
                      ...arr[i],
                      stock_item_id: itemId,
                      sku: stockItem.sku || '',
                      unit: stockItem.unit || '',
                      cost: (parseFloat(stockItem.purchase_price) || 0).toFixed(4),
                    }
                  } else if (semiItem) {
                    arr[i] = {
                      ...arr[i],
                      stock_item_id: itemId,
                      sku: semiItem.sku || '',
                      unit: semiItem.unit || '',
                      cost: (getSemiProductUnitCost(itemId, semiItems, stockItems) || 0).toFixed(4),
                    }
                  } else {
                    arr[i] = {
                      ...arr[i],
                      stock_item_id: itemId,
                      sku: '',
                      unit: '',
                      cost: '0.0000',
                    }
                  }
                  set('recipe_rows', arr)
                }

                function toggleRowArr(i, key, val) {
                  const arr=[...rows]
                  const cur=arr[i][key]||[]
                  arr[i]={...arr[i],[key]: cur.includes(val)?cur.filter(x=>x!==val):[...cur,val]}
                  set('recipe_rows',arr)
                }

                function calcUsed(qty,waste) { return ((parseFloat(qty)||0)*(1+(parseFloat(waste)||0)/100)).toFixed(4) }
                function calcCost(cost,used)  { return ((parseFloat(cost)||0)*(parseFloat(used)||0)).toFixed(4) }

                // Kanal fiyatı al (Tab1'den)
                function chPrice(chId) {
                  const cp = form.channel_prices.find(x=>x.channel_id===chId)
                  return parseFloat(cp?.price)||0
                }

                // Her kanal+porsiyon kombinasyonu için toplam maliyet ve oran hesapla
                function matrixCost(chId, portId) {
                  const total = rows.reduce((sum,row)=>{
                    const inCh   = !chId   || (row.channels||[]).includes(chId)
                    const inPort = !portId || (row.portions||[]).includes(portId)
                    if (!inCh || !inPort) return sum
                    const used = calcUsed(row.qty, row.waste_pct)
                    return sum + parseFloat(calcCost(row.cost, used))
                  },0)
                  return total
                }

                const ICON_MAP = {'Hızlı Satış':'fa-bolt','Masa':'fa-chair','QR':'fa-qrcode',
                  'Kiosk':'fa-desktop','Suitable Yemek':'fa-utensils','Yemek Sepeti':'fa-basket-shopping',
                  'Getir':'fa-motorcycle','Trendyol':'fa-bag-shopping','Migros':'fa-cart-shopping','Tıkla Gelsin':'fa-truck-fast'}

                const UNIT_SHORT = { 'adet':'ad', 'gram':'gr', 'kilogram':'kg', 'mililitre':'ml', 'litre':'lt', 'santilitre':'cl', 'porsiyon':'por' }

                return <div>
                  <RecipeRowsGrid
                    title="Recete Satirlari"
                    itemLabel="Stok Mali"
                    rows={rows}
                    activeChannels={activeChannels}
                    activePorts={activePorts}
                    stockItems={stockItems}
                    semiItems={semiItems}
                    onAddRow={addRow}
                    onRemoveRow={removeRow}
                    onUpdateRow={updateRow}
                    onToggleRowArray={toggleRowArr}
                    onSelectItem={handleStockSelect}
                    getRowItemValue={row => row.stock_item_id || ''}
                    calcUsed={calcUsed}
                    calcCost={calcCost}
                  />
                  {/* Maliyet / Fiyat / Oran matrisi */}
                  {rows.length>0 && (activeChannels.length>0||activePorts.length>0) && (
                    <div style={{marginTop:12,overflowX:'auto'}}>
                      <div style={{fontSize:'.72rem',fontWeight:800,color:'#6366f1',textTransform:'uppercase',
                        letterSpacing:'.08em',marginBottom:6}}>
                        <i className="fa-solid fa-calculator" style={{marginRight:5}}/>
                        Her Satış Kanalı ve Boyut için Maliyet / Fiyat / Oran
                      </div>
                      <table style={{borderCollapse:'collapse',fontSize:'.76rem',minWidth:'100%'}}>
                        <thead>
                          <tr style={{background:'#f1f5f9'}}>
                            <th style={{padding:'6px 10px',textAlign:'left',color:'#64748b',fontWeight:700,
                              borderBottom:'2px solid #e2e8f0',minWidth:110}}>Kanal</th>
                            {activePorts.length>0 ? <>
                              {activePorts.map(p=>(
                                <th key={p.id} colSpan={3} style={{padding:'6px 10px',textAlign:'center',
                                  color:'#7c3aed',fontWeight:700,borderBottom:'2px solid #e2e8f0',
                                  borderLeft:'2px solid #e2e8f0',background:'#ede9fe'}}>
                                  {p.name}
                                </th>
                              ))}
                            </> : (
                              <>
                                <th style={{padding:'6px 10px',textAlign:'right',color:'#475569',fontWeight:700,borderBottom:'2px solid #e2e8f0',borderLeft:'1px solid #e2e8f0'}}>Maliyet</th>
                                <th style={{padding:'6px 10px',textAlign:'right',color:'#475569',fontWeight:700,borderBottom:'2px solid #e2e8f0',borderLeft:'1px solid #e2e8f0'}}>Fiyat</th>
                                <th style={{padding:'6px 10px',textAlign:'right',color:'#475569',fontWeight:700,borderBottom:'2px solid #e2e8f0',borderLeft:'1px solid #e2e8f0'}}>Oran %</th>
                              </>
                            )}
                          </tr>
                          {activePorts.length>0 && (
                            <tr style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
                              <td/>
                              <td style={{padding:'4px 8px',textAlign:'right',fontSize:'.7rem',color:'#059669',fontWeight:700,borderLeft:'2px solid #e2e8f0'}}>Maliyet</td>
                              <td style={{padding:'4px 8px',textAlign:'right',fontSize:'.7rem',color:'#059669',fontWeight:700}}>Fiyat</td>
                              <td style={{padding:'4px 8px',textAlign:'right',fontSize:'.7rem',color:'#059669',fontWeight:700}}>Oran %</td>
                              {activePorts.map(p=>(
                                <>
                                  <td key={p.id+'m'} style={{padding:'4px 8px',textAlign:'right',fontSize:'.7rem',
                                    color:'#64748b',fontWeight:700,borderLeft:'2px solid #e2e8f0'}}>Maliyet</td>
                                  <td key={p.id+'f'} style={{padding:'4px 8px',textAlign:'right',fontSize:'.7rem',color:'#64748b',fontWeight:700}}>Fiyat</td>
                                  <td key={p.id+'r'} style={{padding:'4px 8px',textAlign:'right',fontSize:'.7rem',color:'#64748b',fontWeight:700}}>Oran %</td>
                                </>
                              ))}
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {activeChannels.map((ch,ci)=>{
                            const price = chPrice(ch.id)
                            return (
                              <tr key={ch.id} style={{borderBottom:'1px solid #f1f5f9',
                                background:ci%2===0?'#fff':'#fafafa'}}>
                                <td style={{padding:'6px 10px',fontWeight:600,color:'#334155',
                                  display:'flex',alignItems:'center',gap:6}}>
                                  <i className={`fa-solid ${ch.icon||ICON_MAP[ch.name]||'fa-store'}`}
                                    style={{color:'#6366f1',fontSize:'.75rem'}}/>
                                  {ch.name}
                                </td>
                                {activePorts.length>0 ? <>
                                  {(()=>{
                                    const cost = matrixCost(ch.id, '__standart__')
                                    const ratio = price>0?(cost/price*100).toFixed(1):'—'
                                    const ratioNum = price>0?cost/price*100:0
                                    return (
                                      <>
                                        <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',
                                          fontWeight:700,color:'#2563eb',borderLeft:'2px solid #e2e8f0'}}>
                                          {cost.toFixed(decimalPlaces)}
                                        </td>
                                        <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontWeight:700,color:'#16a34a'}}>
                                          {price>0?price.toFixed(decimalPlaces):'—'}
                                        </td>
                                        <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',fontWeight:700,
                                          color:ratioNum>80?'#dc2626':ratioNum>50?'#d97706':'#16a34a'}}>
                                          {price>0?`%${ratio}`:'—'}
                                        </td>
                                      </>
                                    )
                                  })()}
                                  {activePorts.map(p=>{
                                  const cost  = matrixCost(ch.id, p.id)
                                  const ratio = price>0 ? (cost/price*100).toFixed(1) : '—'
                                  const ratioNum = price>0 ? cost/price*100 : 0
                                  return (
                                    <>
                                      <td key={p.id+'m'} style={{padding:'6px 8px',textAlign:'right',
                                        fontFamily:'monospace',fontWeight:700,color:'#2563eb',
                                        borderLeft:'2px solid #e2e8f0'}}>
                                        {cost.toFixed(decimalPlaces)}
                                      </td>
                                      <td key={p.id+'f'} style={{padding:'6px 8px',textAlign:'right',
                                        fontFamily:'monospace',fontWeight:700,color:'#16a34a'}}>
                                        {price>0?price.toFixed(decimalPlaces):'—'}
                                      </td>
                                      <td key={p.id+'r'} style={{padding:'6px 8px',textAlign:'right',
                                        fontFamily:'monospace',fontWeight:700,
                                        color:ratioNum>80?'#dc2626':ratioNum>50?'#d97706':'#16a34a'}}>
                                        {price>0?`%${ratio}`:'—'}
                                      </td>
                                    </>
                                  )
                                })} </> : (()=>{
                                  const cost = matrixCost(ch.id, null)
                                  const ratio = price>0?(cost/price*100).toFixed(1):'—'
                                  const ratioNum = price>0?cost/price*100:0
                                  return (
                                    <>
                                      <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',
                                        fontWeight:700,color:'#2563eb',borderLeft:'1px solid #e2e8f0'}}>
                                        {cost.toFixed(decimalPlaces)}
                                      </td>
                                      <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',
                                        fontWeight:700,color:'#16a34a',borderLeft:'1px solid #e2e8f0'}}>
                                        {price>0?price.toFixed(decimalPlaces):'—'}
                                      </td>
                                      <td style={{padding:'6px 8px',textAlign:'right',fontFamily:'monospace',
                                        fontWeight:700,borderLeft:'1px solid #e2e8f0',
                                        color:ratioNum>80?'#dc2626':ratioNum>50?'#d97706':'#16a34a'}}>
                                        {price>0?`%${ratio}`:'—'}
                                      </td>
                                    </>
                                  )
                                })()}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                      <p style={{fontSize:'.71rem',color:'#94a3b8',marginTop:6}}>
                        <i className="fa-solid fa-circle-info" style={{marginRight:4}}/>
                        Maliyet rengi: <span style={{color:'#16a34a'}}>yeşil</span> iyi, <span style={{color:'#d97706'}}>sarı</span> dikkat, <span style={{color:'#dc2626'}}>kırmızı</span> yüksek (%50 ve %80 eşikleri)
                      </p>
                    </div>
                  )}


                {/* ── Üretim Çıktı Miktarı & Şablon (sadece yarımamul reçetesine özgü) ── */}
                <div style={{background:'#fdf4ff',border:'1.5px solid #e9d5ff',borderRadius:12,padding:'16px 18px',marginTop:4}}>
                  <div style={{fontWeight:800,fontSize:'.88rem',color:'#7c3aed',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
                    <i className="fa-solid fa-flask-vial"/>
                    Üretim Tanımları
                  </div>

                  {/* Üretim Çıktı Miktarı */}
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <div style={{flex:'0 0 200px'}}>
                      <label className="f-label" style={{color:'#7c3aed'}}>Üretim Çıktı Miktarı</label>
                      <input className="f-input" type="number" min="0.001" step="any"
                        value={form.recipe_output_qty||1}
                        onChange={e=>set('recipe_output_qty',e.target.value)}
                        style={{borderColor:'#d8b4fe'}}/>
                    </div>
                    <div style={{flex:1, marginTop:20}}>
                      <SearchableSelect
                        value={form.recipe_output_unit||''}
                        onChange={v=>set('recipe_output_unit',v)}
                        options={units.map(u=>({value:u.symbol,label:`${u.name} (${u.symbol})`}))}
                        placeholder="Birim seçin…"
                      />
                    </div>
                  </div>
                  <div style={{fontSize:'.73rem',color:'#7c3aed',marginBottom:14,fontStyle:'italic'}}>
                    Reçetedeki malzemeler kullanıldığında ne kadar yarımamul elde edilir? ör: 2 kg mercimek + 1 kg patates + 50g yağ → 10 litre çorba
                  </div>

                  {/* Reçeteyi şablon olarak kullan */}
                  <div style={{
                    background: form.recipe_is_template ? '#ede9fe' : '#fff',
                    border:`1.5px solid ${form.recipe_is_template ? '#a78bfa' : '#e2e8f0'}`,
                    borderRadius:10, padding:'12px 14px',
                    display:'flex',alignItems:'flex-start',gap:12,transition:'all .2s'
                  }}>
                    <label className="tog" style={{marginTop:2}} onClick={e=>e.stopPropagation()}>
                      <input type="checkbox" checked={!!form.recipe_is_template}
                        onChange={e=>set('recipe_is_template',e.target.checked)}/>
                      <span className="tog-sl"/>
                    </label>
                    <div>
                      <div style={{fontWeight:700,fontSize:'.85rem',color: form.recipe_is_template ? '#5b21b6' : '#334155'}}>
                        Reçeteyi şablon olarak kullan
                      </div>
                      <div style={{fontSize:'.75rem',color: form.recipe_is_template ? '#7c3aed' : '#94a3b8',marginTop:4,lineHeight:1.6}}>
                        {form.recipe_is_template
                          ? <>Bu reçete <strong>doğrudan kullanılmaz</strong>, sadece şablon olarak kullanılır. Başka reçeteler bu şablona bağlanarak oransal stok düşümü gerçekleştirir. Örn: 10 litre çorba şablonuna bağlı 250 ml'lik kase çorba reçetesi satıldığında mercimek, patates ve yağ stoğu oransal olarak düşer.</>
                          : <>Bu reçete <strong>doğrudan kullanılır</strong>. Satış gerçekleştiğinde reçetedeki malzemeler stoktan düşer.</>
                        }
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              })()}

      </Modal>

      <ConfirmDialog open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        onConfirm={()=>remove(confirm)}
        onCancel={()=>setConfirm(null)}/>
    </div>
  )
}
