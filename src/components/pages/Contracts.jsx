import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddButton from '@/components/ui/AddButton'

// ── Helpers ──────────────────────────────────────────────────
function getAllBranches(tree) {
  const r = []
  function walk(n) {
    for (const x of n||[]) {
      if (x.type==='sube' || x.type === 'anadepo' || x.type === 'mutfak' || x.type === 'uretim' || x.type === 'uretim') r.push({ id:x.id, name:x.name })
      walk(x.children||[])
    }
  }
  walk(tree); return r
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d+'T00:00:00').toLocaleDateString('tr-TR')
}

function daysLeft(endDate) {
  if (!endDate) return null
  const diff = Math.floor((new Date(endDate+'T00:00:00') - new Date().setHours(0,0,0,0)) / 86400000)
  return diff
}

const CONTRACT_USAGE_MOVEMENT_TYPE = 'purchase_receipt'
const CONTRACT_USAGE_SOURCE_DOC_TYPE = 'purchase_receipt'

function SectionHead({ label }) {
  return (
    <p style={{fontSize:'.72rem',fontWeight:800,color:'#6366f1',textTransform:'uppercase',
      letterSpacing:'.1em',margin:'0 0 12px',paddingBottom:6,borderBottom:'1px solid #e2e8f0'}}>
      {label}
    </p>
  )
}

// ── Tedarikçi Seçici (tek seçim, arama) ──────────────────────
function SupplierSelect({ value, onChange, suppliers }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = suppliers.filter(s => !q || s.name.toLowerCase().includes(q.toLowerCase()))
  const sel = suppliers.find(s => s.id === value)

  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={() => setOpen(o => !o)}
        style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,borderRadius:10,
          padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',background:'#fff',
          minHeight:40,display:'flex',alignItems:'center',userSelect:'none',
          boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {sel
          ? <span style={{fontWeight:600,color:'#1e293b'}}>{sel.name}</span>
          : <span style={{color:'#94a3b8'}}>Tedarikçi seçin…</span>}
      </div>
      <i className="fa-solid fa-chevron-down" style={{position:'absolute',right:12,top:14,
        color:'#94a3b8',fontSize:'.65rem',pointerEvents:'none'}}/>

      {open && (
        <div style={{position:'absolute',left:0,right:0,top:'calc(100% + 4px)',background:'#fff',
          border:'1.5px solid #e2e8f0',borderRadius:10,boxShadow:'0 8px 24px rgba(0,0,0,.12)',
          zIndex:399,overflow:'hidden'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Ara…" value={q} onChange={e=>setQ(e.target.value)}
              onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}}
              autoFocus/>
          </div>
          <div style={{maxHeight:240,overflowY:'auto',padding:'4px 0'}}>
            {filtered.length === 0
              ? <div style={{padding:'12px',textAlign:'center',color:'#94a3b8',fontSize:'.82rem'}}>Sonuç yok</div>
              : filtered.map(s => (
                <div key={s.id} onClick={() => { onChange(s.id); setOpen(false); setQ('') }}
                  style={{padding:'9px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:9,
                    fontSize:'.85rem',background:value===s.id?'#fffbeb':'transparent'}}
                  onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                  onMouseLeave={e=>e.currentTarget.style.background=value===s.id?'#fffbeb':'transparent'}>
                  <span style={{width:28,height:28,borderRadius:7,background:'rgba(248,113,113,.12)',
                    display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <i className="fa-solid fa-truck-fast" style={{color:'#f87171',fontSize:'.72rem'}}/>
                  </span>
                  <span style={{fontWeight:value===s.id?700:400}}>{s.name}</span>
                  {value===s.id && <i className="fa-solid fa-check" style={{marginLeft:'auto',color:'#fbbf24',fontSize:'.75rem'}}/>}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Şube/Şablon Seçici (çoklu, dropdown kapanmaz) ────────────
function BranchMultiSelect({ value, onChange, branches, branchTemplates }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    function h(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const selected = value || []

  // Şablon seçiliyse o şablonun şubeleri tek seçilemez
  const coveredBranchIds = new Set(
    selected.filter(x => x.type==='template')
      .flatMap(x => x.branchIds||[])
  )

  function parseBranchIds(tpl) {
    const ids = Array.isArray(tpl.branch_ids) ? tpl.branch_ids
      : (typeof tpl.branch_ids==='string' ? JSON.parse(tpl.branch_ids||'[]') : [])
    return ids.filter(id => branches.some(b => b.id===id))
  }

  function toggle(type, id, name, branchIds) {
    const idx = selected.findIndex(x => x.type===type && x.id===id)
    const next = idx > -1
      ? selected.filter((_, i) => i !== idx)
      : [...selected, { type, id, name, branchIds: branchIds||null }]
    onChange(next)
  }

  function selectAllVisible() {
    const visibleTemplates = filtTpl.map(t => {
      const branchIds = parseBranchIds(t)
      return { type: 'template', id: t.id, name: t.name, branchIds }
    })
    const coveredVisibleBranchIds = new Set(visibleTemplates.flatMap(item => item.branchIds || []))
    const visibleBranches = filtBr
      .filter(b => !coveredVisibleBranchIds.has(b.id))
      .map(b => ({ type: 'branch', id: b.id, name: b.name, branchIds: null }))

    const next = [...selected]
    for (const item of [...visibleTemplates, ...visibleBranches]) {
      const exists = next.some(entry => entry.type===item.type && entry.id===item.id)
      if (!exists) next.push(item)
    }
    onChange(next)
  }

  const filtTpl = branchTemplates.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()))
  const filtBr  = branches.filter(b => !q || b.name.toLowerCase().includes(q.toLowerCase()))

  return (
    <div ref={wrapRef} style={{position:'relative'}}>
      <div onClick={() => setOpen(o => !o)}
        style={{border:`1.5px solid ${open?'#fbbf24':'#c4cdd9'}`,borderRadius:10,
          padding:'9px 36px 9px 12px',cursor:'pointer',fontSize:'.855rem',background:'#fff',
          minHeight:40,display:'flex',alignItems:'center',flexWrap:'wrap',gap:5,
          userSelect:'none',boxShadow:'inset 0 2px 4px rgba(0,0,0,.06)'}}>
        {selected.length === 0
          ? <span style={{color:'#94a3b8'}}>Şube veya şablon seçin…</span>
          : selected.map(x => (
            <span key={x.id+x.type} style={{display:'inline-flex',alignItems:'center',gap:4,
              padding:'2px 8px',borderRadius:99,fontSize:'.74rem',fontWeight:700,
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
          zIndex:399,overflow:'hidden'}}>
          <div style={{padding:'8px 10px',borderBottom:'1px solid #f1f5f9',display:'flex',gap:6,alignItems:'center'}}>
            <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
            <input className="f-input" placeholder="Ara…" value={q} onChange={e=>setQ(e.target.value)}
              onClick={e=>e.stopPropagation()}
              style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',flex:1}}
              autoFocus/>
            {(filtTpl.length > 0 || filtBr.length > 0) && (
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
          <div style={{maxHeight:280,overflowY:'auto',padding:'4px 0'}}>
            {filtTpl.length > 0 && <>
              <div style={{padding:'6px 14px 3px',fontSize:'.68rem',fontWeight:800,color:'#94a3b8',
                letterSpacing:'.1em',textTransform:'uppercase'}}>Şube Şablonları</div>
              {filtTpl.map(t => {
                const sel = selected.some(x => x.type==='template' && x.id===t.id)
                const bIds = parseBranchIds(t)
                return (
                  <div key={t.id} onClick={e=>{e.stopPropagation();toggle('template',t.id,t.name,bIds)}}
                    style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,
                      fontSize:'.84rem',background:sel?'#fffbeb':'transparent'}}
                    onMouseEnter={e=>e.currentTarget.style.background=sel?'#fffbeb':'#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background=sel?'#fffbeb':'transparent'}>
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${sel?'#fbbf24':'#d1d5db'}`,
                      background:sel?'#fbbf24':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {sel && <i className="fa-solid fa-check" style={{fontSize:'.6rem',color:'#fff'}}/>}
                    </div>
                    <span style={{width:26,height:26,borderRadius:7,background:'rgba(139,92,246,.12)',
                      display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className="fa-solid fa-layer-group" style={{color:'#8b5cf6',fontSize:'.72rem'}}/>
                    </span>
                    <span style={{fontWeight:sel?700:400}}>{t.name}</span>
                    <span style={{marginLeft:'auto',fontSize:'.72rem',color:'#94a3b8'}}>{bIds.length} şube</span>
                  </div>
                )
              })}
            </>}

            {filtBr.length > 0 && <>
              <div style={{padding:'6px 14px 3px',fontSize:'.68rem',fontWeight:800,color:'#94a3b8',
                letterSpacing:'.1em',textTransform:'uppercase',borderTop:filtTpl.length>0?'1px solid #f1f5f9':'none'}}>
                Şubeler
              </div>
              {filtBr.map(b => {
                const sel = selected.some(x => x.type==='branch' && x.id===b.id)
                const covered = coveredBranchIds.has(b.id)
                return (
                  <div key={b.id}
                    onClick={e=>{e.stopPropagation();if(!covered)toggle('branch',b.id,b.name)}}
                    style={{padding:'8px 14px',cursor:covered?'not-allowed':'pointer',
                      display:'flex',alignItems:'center',gap:10,fontSize:'.84rem',
                      opacity:covered?0.45:1,
                      background:sel?'#fffbeb':'transparent'}}
                    onMouseEnter={e=>{if(!covered)e.currentTarget.style.background=sel?'#fffbeb':'#f8fafc'}}
                    onMouseLeave={e=>e.currentTarget.style.background=sel?'#fffbeb':'transparent'}>
                    <div style={{width:18,height:18,borderRadius:5,
                      border:`2px solid ${sel?'#fbbf24':covered?'#e2e8f0':'#d1d5db'}`,
                      background:sel?'#fbbf24':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      {sel && <i className="fa-solid fa-check" style={{fontSize:'.6rem',color:'#fff'}}/>}
                    </div>
                    <span style={{width:26,height:26,borderRadius:7,background:'rgba(96,165,250,.12)',
                      display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                      <i className="fa-solid fa-store" style={{color:'#60a5fa',fontSize:'.72rem'}}/>
                    </span>
                    <span style={{fontWeight:sel?700:400}}>{b.name}</span>
                    {covered && <span style={{marginLeft:'auto',fontSize:'.68rem',color:'#a78bfa'}}>
                      <i className="fa-solid fa-layer-group" style={{fontSize:'.6rem'}}/> şablonda
                    </span>}
                  </div>
                )
              })}
            </>}

            {filtTpl.length===0 && filtBr.length===0 && (
              <div style={{padding:'12px',textAlign:'center',color:'#94a3b8',fontSize:'.82rem'}}>Sonuç yok</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Stok Malı Seçici (tedarikçiye göre filtreli) ──────────────
function StockItemSelect({ supplierId, suppliers, stockItems, rows, onChange }) {
  const [q, setQ] = useState('')

  // Bu tedarikçiye bağlı stok malları
  const supplierStockIds = supplierId
    ? stockItems.filter(s => {
        const suppList = s.suppliers_list || []
        const hasSupp = suppList.some(x => x.supp_id === supplierId)
        const isDefault = s.supp_id === supplierId
        return hasSupp || isDefault
      }).map(s => s.id)
    : []

  const available = stockItems.filter(s =>
    supplierStockIds.includes(s.id) &&
    !rows.some(r => r.stock_item_id === s.id) &&
    s.deleted_at == null &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()))
  )

  function addRow(item) {
    onChange([...rows, {
      stock_item_id: item.id,
      name: item.name,
      sku: item.sku||'',
      unit: item.unit||'',
      price: '',
      qty: '',
      warning_ratio: 0.8,
      overrun_ratio: 0.2,
      block_purchase: true,
    }])
    setQ('')
  }

  if (!supplierId) return (
    <div style={{padding:'10px',background:'#fffbeb',borderRadius:8,border:'1px solid #fde68a',
      fontSize:'.82rem',color:'#92400e',display:'flex',alignItems:'center',gap:8}}>
      <i className="fa-solid fa-triangle-exclamation" style={{color:'#f59e0b'}}/>
      Önce tedarikçi seçin — seçilen tedarikçiye tanımlı stok malları buraya gelecek.
    </div>
  )

  if (supplierStockIds.length === 0) return (
    <div style={{padding:'10px',background:'#fef2f2',borderRadius:8,border:'1px solid #fecaca',
      fontSize:'.82rem',color:'#991b1b',display:'flex',alignItems:'center',gap:8}}>
      <i className="fa-solid fa-circle-info" style={{color:'#f87171'}}/>
      Bu tedarikçiye tanımlı stok malı bulunamadı. Tedarikçi ekranından stok malı tanımlayın.
    </div>
  )

  return (
    <div style={{background:'#f8fafc',borderRadius:10,border:'1px solid #e2e8f0',overflow:'hidden'}}>
      <div style={{padding:'8px 10px',borderBottom:'1px solid #e2e8f0',display:'flex',gap:6,alignItems:'center'}}>
        <i className="fa-solid fa-search" style={{color:'#94a3b8',fontSize:'.75rem'}}/>
        <input className="f-input" placeholder="Stok malı ara ve ekle…" value={q} onChange={e=>setQ(e.target.value)}
          style={{padding:'6px 10px',fontSize:'.83rem',border:'none',outline:'none',boxShadow:'none',
            flex:1,background:'transparent'}}/>
      </div>
      {q && (
        <div style={{maxHeight:200,overflowY:'auto'}}>
          {available.length === 0
            ? <div style={{padding:'10px 14px',color:'#94a3b8',fontSize:'.82rem'}}>
                {supplierStockIds.length > 0 ? 'Tüm mallar eklenmiş veya eşleşme yok' : 'Sonuç yok'}
              </div>
            : available.map(item => (
              <div key={item.id} onClick={() => addRow(item)}
                style={{padding:'8px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,
                  fontSize:'.84rem',borderBottom:'1px solid #f1f5f9'}}
                onMouseEnter={e=>e.currentTarget.style.background='#e0f2fe'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <i className="fa-solid fa-cube" style={{color:'#34d399',fontSize:'.78rem'}}/>
                <span>{item.name}</span>
                {item.sku && <span style={{fontSize:'.72rem',color:'#94a3b8'}}>#{item.sku}</span>}
                <span style={{marginLeft:'auto',fontSize:'.72rem',color:'#64748b',
                  background:'#e0f2fe',padding:'1px 7px',borderRadius:99}}>
                  {item.unit||'—'}
                </span>
              </div>
            ))
          }
        </div>
      )}
      {rows.length === 0 && !q && (
        <div style={{padding:'10px 14px',color:'#94a3b8',fontSize:'.82rem',fontStyle:'italic'}}>
          Yukarıdan arayarak stok malı ekleyin…
        </div>
      )}
    </div>
  )
}

// ── Kontrat Satır Tablosu ─────────────────────────────────────
function ContractRowsTable({ rows, onChange }) {
  function upd(i, k, v) {
    onChange(rows.map((r, j) => j===i ? {...r,[k]:v} : r))
  }
  function del(i) { onChange(rows.filter((_, j) => j!==i)) }

  if (rows.length === 0) return null

  return (
    <div style={{overflowX:'auto',marginTop:8}}>
      <table className="tbl" style={{minWidth:760}}>
        <thead>
          <tr>
            <th>Stok Malı</th>
            <th>Birim</th>
            <th style={{width:100}}>Fiyat (KDV hariç)</th>
            <th style={{width:100}}>Miktar (Kota)</th>
            <th style={{width:90}}>Uyarı Oranı</th>
            <th style={{width:90}}>Aşım Oranı</th>
            <th style={{width:32}}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.stock_item_id}>
              <td style={{fontWeight:600,color:'#1e293b'}}>{r.name}</td>
              <td style={{color:'#64748b',fontSize:'.83rem'}}>{r.unit||'—'}</td>
              <td>
                <input className="f-input" type="number" min="0" step="0.01"
                  value={r.price} onChange={e=>upd(i,'price',e.target.value)}
                  placeholder="0.00" style={{width:'100%',padding:'5px 8px'}}/>
              </td>
              <td>
                <input className="f-input" type="number" min="0"
                  value={r.qty} onChange={e=>upd(i,'qty',e.target.value)}
                  placeholder="0" style={{width:'100%',padding:'5px 8px'}}/>
              </td>
              <td>
                <input className="f-input" type="number" min="0" max="1" step="0.05"
                  value={r.warning_ratio} onChange={e=>upd(i,'warning_ratio',e.target.value)}
                  style={{width:'100%',padding:'5px 8px'}}/>
              </td>
              <td>
                <input className="f-input" type="number" min="0" max="1" step="0.05"
                  value={r.overrun_ratio} onChange={e=>upd(i,'overrun_ratio',e.target.value)}
                  style={{width:'100%',padding:'5px 8px'}}/>
              </td>
              <td>
                <button className="ico-btn del" onClick={() => del(i)}>
                  <i className="fa-solid fa-xmark"/>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Ana Bileşen ───────────────────────────────────────────────

// ── Kota Progress Bar ─────────────────────────────────────────
function QuotaBar({ used, total, warningRatio, overrunRatio }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0
  const remaining = Math.max(total - used, 0)
  const remainingPct = total > 0 ? ((remaining / total) * 100).toFixed(1) : '—'
  const isWarning  = total > 0 && (used / total) >= warningRatio
  const isOverrun  = total > 0 && (used / total) > 1
  const barColor   = isOverrun ? '#f87171' : isWarning ? '#f59e0b' : '#4ade80'

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
        <span style={{fontSize:'.78rem',color:'#64748b'}}>
          Kullanılan: <strong style={{color:'#1e293b'}}>{Number(used).toLocaleString('tr-TR')}</strong>
          {' / '}
          <span style={{color:'#94a3b8'}}>{Number(total).toLocaleString('tr-TR')}</span>
        </span>
        <span style={{fontSize:'.82rem',fontWeight:800,
          color: isOverrun ? '#f87171' : isWarning ? '#f59e0b' : '#4ade80'}}>
          Kalan %{remainingPct}
        </span>
      </div>
      <div style={{height:8,borderRadius:99,background:'#f1f5f9',overflow:'hidden',position:'relative'}}>
        <div style={{position:'absolute',left:`${warningRatio*100}%`,top:0,bottom:0,
          width:2,background:'#f59e0b',opacity:.5,zIndex:1}}/>
        <div style={{height:'100%',borderRadius:99,transition:'width .4s',
          background: isOverrun
            ? 'linear-gradient(90deg,#fbbf24,#f87171)'
            : isWarning
              ? 'linear-gradient(90deg,#4ade80,#f59e0b)'
              : 'linear-gradient(90deg,#4ade80,#34d399)',
          width:`${pct}%`}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',marginTop:3}}>
        <span style={{fontSize:'.68rem',color:'#94a3b8'}}>0</span>
        <span style={{fontSize:'.68rem',color:'#f59e0b'}}>Uyarı %{(warningRatio*100).toFixed(0)}</span>
        <span style={{fontSize:'.68rem',color:'#94a3b8'}}>{Number(total).toLocaleString('tr-TR')}</span>
      </div>
    </div>
  )
}

// ── Kontrat Detay Paneli ──────────────────────────────────────
function ContractDetail({ contract: c, suppliers, onClose }) {
  const [usage, setUsage]             = useState({})
  const [loadingUsage, setLoadingUsage] = useState(true)

  useEffect(() => {
    async function fetchUsage() {
      setLoadingUsage(true)
      const stockIds = (c.rows||[]).map(r => r.stock_item_id).filter(Boolean)
      if (stockIds.length === 0) { setUsage({}); setLoadingUsage(false); return }
      try {
        const { data } = await db
          .from('inventory_movements')
          .select('stock_item_id, quantity')
          .in('stock_item_id', stockIds)
          .eq('supplier_id', c.supplier_id)
          .eq('item_type', 'stock_item')
          .eq('movement_type', CONTRACT_USAGE_MOVEMENT_TYPE)
          .eq('source_doc_type', CONTRACT_USAGE_SOURCE_DOC_TYPE)
          .is('deleted_at', null)
          .eq('is_cancelled', false)
          .gte('movement_at', `${c.start_date}T00:00:00`)
          .lte('movement_at', `${c.end_date}T23:59:59`)
        const map = {}
        for (const row of data||[]) {
          map[row.stock_item_id] = (map[row.stock_item_id]||0) + Number(row.quantity)
        }
        setUsage(map)
      } catch { setUsage({}) }
      setLoadingUsage(false)
    }
    fetchUsage()
  }, [c])

  const rows       = c.rows || []
  const totalKota  = rows.reduce((s, r) => s + Number(r.qty||0), 0)
  const totalUsed  = rows.reduce((s, r) => s + (usage[r.stock_item_id]||0), 0)
  const totalPct   = totalKota > 0 ? ((totalUsed/totalKota)*100).toFixed(1) : null
  const supp       = suppliers.find(s => s.id === c.supplier_id)
  const left       = daysLeft(c.end_date)
  const totalWarning = c.total_quota_active && totalKota > 0 && (totalUsed/totalKota) >= (c.total_quota_warning_ratio||0.8)
  const totalOverrun = c.total_quota_active && totalKota > 0 && (totalUsed/totalKota) > 1

  return (
    <div className="card" style={{marginTop:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:'rgba(45,212,191,.15)',
            display:'flex',alignItems:'center',justifyContent:'center'}}>
            <i className="fa-solid fa-file-contract" style={{color:'#2dd4bf',fontSize:'1rem'}}/>
          </div>
          <div>
            <div style={{fontWeight:800,fontSize:'1.05rem',color:'#1e293b'}}>{c.contract_no}</div>
            <div style={{fontSize:'.82rem',color:'#64748b'}}>{supp?.name}</div>
          </div>
        </div>
        <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark"/></button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginBottom:24}}>
        {[
          { label:'Baslangic',       val: formatDate(c.start_date), icon:'fa-calendar-plus',  color:'#4ade80' },
          { label:'Bitis',           val: formatDate(c.end_date),   icon:'fa-calendar-xmark', color:'#f87171' },
          { label:'Kalan Sure',      val: left===null?'—':left<0?`${Math.abs(left)} gun gecti`:`${left} gun`,
            icon:'fa-hourglass-half',
            color: left===null?'#94a3b8':left<0?'#f87171':left<=(c.warning_days||15)?'#f59e0b':'#4ade80' },
          { label:'Uyari Esigi',     val: `${c.warning_days||15} gun`, icon:'fa-bell',       color:'#f59e0b' },
          { label:'Fiyat Toleransi', val: `%${((c.price_tolerance||0)*100).toFixed(0)}`, icon:'fa-percent', color:'#a78bfa' },
        ].map(item => (
          <div key={item.label} style={{background:'#f8fafc',borderRadius:10,padding:'12px 14px',
            border:'1px solid #e2e8f0',display:'flex',gap:10,alignItems:'center'}}>
            <div style={{width:32,height:32,borderRadius:8,background:item.color+'22',
              display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <i className={`fa-solid ${item.icon}`} style={{color:item.color,fontSize:'.8rem'}}/>
            </div>
            <div>
              <div style={{fontSize:'.65rem',color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em'}}>{item.label}</div>
              <div style={{fontWeight:800,fontSize:'.9rem',color:'#1e293b'}}>{item.val}</div>
            </div>
          </div>
        ))}
      </div>

      {c.total_quota_active && (
        <div style={{marginBottom:20,padding:'14px 16px',borderRadius:10,
          border:`1.5px solid ${totalOverrun?'#fecaca':totalWarning?'#fde68a':'#d1fae5'}`,
          background:totalOverrun?'#fef2f2':totalWarning?'#fffbeb':'#f0fdf4'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <span style={{fontWeight:800,fontSize:'.88rem',color:'#1e293b',display:'flex',alignItems:'center',gap:7}}>
              <i className="fa-solid fa-layer-group" style={{color:totalOverrun?'#f87171':totalWarning?'#f59e0b':'#4ade80'}}/>
              Toplam Kota Kullanimi
            </span>
            {loadingUsage
              ? <i className="fa-solid fa-spinner fa-spin" style={{color:'#94a3b8'}}/>
              : <span style={{fontSize:'.82rem',fontWeight:700,color:totalOverrun?'#f87171':totalWarning?'#f59e0b':'#4ade80'}}>
                  {totalPct !== null ? `%${totalPct} kullanildi` : '—'}
                </span>
            }
          </div>
          {!loadingUsage && totalKota > 0 && (
            <QuotaBar used={totalUsed} total={totalKota}
              warningRatio={c.total_quota_warning_ratio||0.8}
              overrunRatio={c.total_quota_overrun_ratio||0.2}/>
          )}
        </div>
      )}

      <SectionHead label="Kontrat Mallari — Kalem Bazli Kota Durumu"/>
      <div style={{overflowX:'auto'}}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{minWidth:160}}>Stok Mali</th>
              <th style={{width:70}}>Birim</th>
              <th style={{width:150,textAlign:'right'}}>Fiyat (KDV haric)</th>
              <th style={{width:100,textAlign:'right'}}>Kota</th>
              <th style={{width:100,textAlign:'right'}}>Kullanilan</th>
              <th style={{width:80,textAlign:'center'}}>Kalan %</th>
              <th style={{minWidth:240}}>Kota Durumu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const used      = usage[r.stock_item_id] || 0
              const quota     = Number(r.qty||0)
              const remaining = Math.max(quota - used, 0)
              const usedPct   = quota > 0 ? (used/quota)*100 : 0
              const remPct    = quota > 0 ? ((remaining/quota)*100).toFixed(1) : '—'
              const isWarn    = quota > 0 && (used/quota) >= (r.warning_ratio||0.8)
              const isOver    = quota > 0 && used > quota

              return (
                <tr key={r.stock_item_id}
                  style={{background:isOver?'#fff5f5':isWarn?'#fffbeb':'transparent'}}>
                  <td style={{fontWeight:600,color:'#1e293b'}}>{r.name}</td>
                  <td style={{color:'#64748b',fontSize:'.83rem'}}>{r.unit||'—'}</td>
                  <td style={{fontWeight:700,textAlign:'right'}}>{Number(r.price).toFixed(2)} ₺</td>
                  <td style={{color:'#64748b',textAlign:'right'}}>{quota.toLocaleString('tr-TR')}</td>
                  <td style={{textAlign:'right'}}>
                    {loadingUsage
                      ? <i className="fa-solid fa-spinner fa-spin" style={{color:'#94a3b8',fontSize:'.8rem'}}/>
                      : <span style={{fontWeight:700,color:isOver?'#f87171':isWarn?'#f59e0b':'#1e293b'}}>
                          {used.toLocaleString('tr-TR')}
                        </span>
                    }
                  </td>
                  <td style={{textAlign:'center'}}>
                    <span style={{fontWeight:800,fontSize:'.95rem',
                      color:isOver?'#f87171':isWarn?'#f59e0b':'#4ade80'}}>
                      {loadingUsage ? '…' : `%${remPct}`}
                    </span>
                  </td>
                  <td>
                    {!loadingUsage && quota > 0 && (
                      <div>
                        <div style={{height:7,borderRadius:99,background:'#f1f5f9',overflow:'hidden',
                          position:'relative',marginBottom:3}}>
                          <div style={{position:'absolute',left:`${(r.warning_ratio||0.8)*100}%`,
                            top:0,bottom:0,width:1.5,background:'#f59e0b',opacity:.6,zIndex:1}}/>
                          <div style={{height:'100%',borderRadius:99,
                            background:isOver
                              ? 'linear-gradient(90deg,#fbbf24,#f87171)'
                              : isWarn
                                ? 'linear-gradient(90deg,#4ade80,#f59e0b)'
                                : 'linear-gradient(90deg,#4ade80,#34d399)',
                            width:`${Math.min(usedPct,100)}%`,transition:'width .4s'}}/>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'.65rem',color:'#94a3b8'}}>
                          <span>0</span>
                          <span style={{color:isOver?'#f87171':isWarn?'#f59e0b':'#4ade80',fontWeight:700}}>
                            %{usedPct.toFixed(1)} kullanildi
                          </span>
                          <span>{quota.toLocaleString('tr-TR')}</span>
                        </div>
                      </div>
                    )}
                    {quota === 0 && <span style={{color:'#94a3b8',fontSize:'.78rem'}}>Kota tanimsiz</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!loadingUsage && totalUsed === 0 && (
        <div style={{marginTop:10,padding:'8px 12px',background:'#f8fafc',borderRadius:8,
          fontSize:'.78rem',color:'#94a3b8',display:'flex',alignItems:'center',gap:7}}>
          <i className="fa-solid fa-circle-info"/>
          Henuz kullanim verisi yok — Mal Kabul / envanter hareketleri islendikce otomatik dolacak.
        </div>
      )}
    </div>
  )
}

const EMPTY = {
  contract_no:'', start_date:'', end_date:'',
  warning_days: 15,
  total_quota_active: false,
  total_quota_warning_ratio: 0.8,
  total_quota_overrun_ratio: 0.2,
  end_grace_days: 15,
  price_tolerance: 0.05,
  block_on_exceed: true,
  warn_only_on_exceed: false,
  supplier_id: '',
  branches: [],          // [{type, id, name, branchIds}]
  rows: [],              // [{stock_item_id, name, sku, unit, price, qty, warning_ratio, overrun_ratio}]
}

export default function Contracts() {
  const toast = useToast()
  const [contracts, setContracts]   = useState([])
  const [suppliers, setSuppliers]   = useState([])
  const [stockItems, setStockItems] = useState([])
  const [branches, setBranches]     = useState([])
  const [templates, setTemplates]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)

  const [modalOpen, setModalOpen]   = useState(false)
  const [form, setForm]             = useState(EMPTY)
  const [editId, setEditId]         = useState(null)
  const [saving, setSaving]         = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [detailId, setDetailId]     = useState(null)

  function set(k, v) { setForm(f => ({...f, [k]: v})) }

  const load = useCallback(async () => {
    setLoading(true)
    const [
      { data: cData },
      { data: sData },
      { data: siData },
      { data: tData },
      { data: settings },
    ] = await Promise.all([
      db.from('contracts').select('*').order('created_at', {ascending:false}),
      db.from('suppliers').select('id,name').eq('active', true).order('name'),
      db.from('stock_items').select('id,name,sku,unit,supp_id,suppliers_list,deleted_at').is('deleted_at', null).order('name'),
      db.from('branch_templates').select('*').order('name'),
      db.from('settings').select('value').eq('key','company_tree').single(),
    ])
    const tree = settings?.value || []
    const allBranches = getAllBranches(Array.isArray(tree) ? tree : [tree])
    setBranches(allBranches)
    setTemplates(tData||[])
    setSuppliers(sData||[])
    setStockItems(siData||[])
    const all = cData||[]
    setContracts(showDeleted ? all : all.filter(c => !c.deleted_at))
    setLoading(false)
  }, [showDeleted])

  useEffect(() => { load() }, [load])

  function openNew() {
    // Otomatik kontrat no: YYYYMM-XXX
    const now = new Date()
    const prefix = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}-`
    const existing = contracts.filter(c => c.contract_no?.startsWith(prefix))
    const next = String(existing.length + 1).padStart(3,'0')
    setForm({...EMPTY, contract_no: `${prefix}${next}`})
    setEditId(null)
    setModalOpen(true)
  }

  function openEdit(c) {
    setForm({
      contract_no: c.contract_no||'',
      start_date: c.start_date||'',
      end_date: c.end_date||'',
      warning_days: c.warning_days??15,
      total_quota_active: c.total_quota_active||false,
      total_quota_warning_ratio: c.total_quota_warning_ratio??0.8,
      total_quota_overrun_ratio: c.total_quota_overrun_ratio??0.2,
      end_grace_days: c.end_grace_days??15,
      price_tolerance: c.price_tolerance??0.05,
      block_on_exceed: c.block_on_exceed??true,
      warn_only_on_exceed: c.warn_only_on_exceed||false,
      supplier_id: c.supplier_id||'',
      branches: c.branches||[],
      rows: c.rows||[],
    })
    setEditId(c.id)
    setModalOpen(true)
  }

  async function save() {
    if (!form.contract_no.trim()) return toast('Kontrat No zorunludur', 'error')
    if (!form.supplier_id) return toast('Tedarikçi seçmelisiniz', 'error')
    if (!form.start_date) return toast('Başlangıç tarihi zorunludur', 'error')
    if (!form.end_date) return toast('Bitiş tarihi zorunludur', 'error')
    if (form.rows.length === 0) return toast('En az bir stok malı eklemelisiniz', 'error')
    const incompleteRow = form.rows.find(r => !r.price || !r.qty)
    if (incompleteRow) return toast(`"${incompleteRow.name}" için fiyat ve miktar girilmeli`, 'error')

    setSaving(true)
    const payload = {
      contract_no: form.contract_no.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      warning_days: parseInt(form.warning_days)||15,
      total_quota_active: form.total_quota_active,
      total_quota_warning_ratio: parseFloat(form.total_quota_warning_ratio)||0.8,
      total_quota_overrun_ratio: parseFloat(form.total_quota_overrun_ratio)||0.2,
      end_grace_days: parseInt(form.end_grace_days)||15,
      price_tolerance: parseFloat(form.price_tolerance)||0.05,
      block_on_exceed: form.block_on_exceed,
      warn_only_on_exceed: form.warn_only_on_exceed,
      supplier_id: form.supplier_id,
      branches: form.branches,
      rows: form.rows.map(r => ({
        ...r,
        price: parseFloat(r.price)||0,
        qty: parseFloat(r.qty)||0,
        warning_ratio: parseFloat(r.warning_ratio)||0.8,
        overrun_ratio: parseFloat(r.overrun_ratio)||0.2,
      })),
    }

    const { error } = editId
      ? await db.from('contracts').update(payload).eq('id', editId)
      : await db.from('contracts').insert(payload)

    setSaving(false)
    if (error) {
      console.error('Contracts save error:', error)
      return toast('Kayıt hatası: ' + error.message, 'error')
    }
    toast(editId ? 'Kontrat güncellendi' : 'Kontrat oluşturuldu', 'success')
    setModalOpen(false)
    load()
  }

  async function doDelete(c) {
    const { error } = await db.from('contracts')
      .update({ deleted_at: new Date().toISOString() }).eq('id', c.id)
    if (error) return toast('Silinemedi: ' + error.message, 'error')
    toast('Kontrat silindi', 'success')
    load()
  }

  async function restore(c) {
    const { error } = await db.from('contracts').update({ deleted_at: null }).eq('id', c.id)
    if (error) return toast('Geri alınamadı', 'error')
    toast('Kontrat geri alındı', 'success')
    load()
  }

  // ── Tablo renk durumu ─────────────────────────────────────
  function contractStatus(c) {
    const left = daysLeft(c.end_date)
    if (left === null) return 'normal'
    if (left < 0) return 'expired'
    if (left <= (c.warning_days||15)) return 'warning'
    return 'active'
  }

  const statusColor = { active:'#4ade80', warning:'#f59e0b', expired:'#f87171', normal:'#94a3b8' }
  const statusLabel = { active:'Aktif', warning:'Süre Uyarısı', expired:'Süresi Doldu', normal:'—' }

  const detailContract = contracts.find(c => c.id === detailId)

  return (
    <>
      <Header
        title="Sözleşmeler"
        subtitle="Tedarikçi kontrat ve fiyat anlaşmaları"
        actions={
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <label style={{display:'flex',alignItems:'center',gap:6,fontSize:'.8rem',color:'#64748b',cursor:'pointer'}}>
              <div className="tog" onClick={()=>setShowDeleted(v=>!v)}>
                <div className={`tog-sl${showDeleted?' on':''}`}/>
              </div>
              Silinmişleri Göster
            </label>
            <AddButton onClick={openNew} label="Yeni Kontrat" />
          </div>
        }
      />

      {/* Liste */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {loading
          ? <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>
              <i className="fa-solid fa-spinner fa-spin" style={{fontSize:'1.4rem'}}/>
            </div>
          : contracts.length === 0
            ? <div style={{padding:48,textAlign:'center'}}>
                <i className="fa-solid fa-file-contract" style={{fontSize:'2.5rem',color:'#e2e8f0',marginBottom:12}}/>
                <p style={{color:'#94a3b8',fontSize:'.9rem'}}>Henüz kontrat oluşturulmadı</p>
                <button className="btn-p" style={{marginTop:12}} onClick={openNew}>
                  <i className="fa-solid fa-plus"/> İlk Kontratı Oluştur
                </button>
              </div>
            : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Kontrat No</th>
                    <th>Tedarikçi</th>
                    <th>Başlangıç</th>
                    <th>Bitiş</th>
                    <th style={{width:120}}>Kalan Gün / Kota</th>
                    <th style={{width:100}}>Mal Sayısı</th>
                    <th>Şube / Şablon</th>
                    <th>Durum</th>
                    <th style={{width:80}}></th>
                  </tr>
                </thead>
                <tbody>
                  {contracts.map(c => {
                    const status = contractStatus(c)
                    const left = daysLeft(c.end_date)
                    const supp = suppliers.find(s => s.id === c.supplier_id)
                    return (
                      <tr key={c.id} style={{opacity:c.deleted_at?0.5:1}}>
                        <td>
                          <span style={{fontWeight:700,color:'#1e293b'}}>{c.contract_no}</span>
                        </td>
                        <td>{supp?.name || <span style={{color:'#94a3b8'}}>—</span>}</td>
                        <td style={{color:'#64748b',fontSize:'.84rem'}}>{formatDate(c.start_date)}</td>
                        <td style={{color:'#64748b',fontSize:'.84rem'}}>{formatDate(c.end_date)}</td>
                        <td>
                          <div style={{display:'flex',flexDirection:'column',gap:3}}>
                            {left !== null
                              ? <span style={{fontWeight:700,
                                  color: left < 0 ? '#f87171' : left <= (c.warning_days||15) ? '#f59e0b' : '#4ade80'}}>
                                  {left < 0 ? `${Math.abs(left)} gün geçti` : `${left} gün`}
                                </span>
                              : <span style={{color:'#94a3b8'}}>—</span>}
                            {/* Kota kalan % — basit hesap, rows üzerinden */}
                            {(() => {
                              const rows = c.rows||[]
                              const totalQ = rows.reduce((s,r)=>s+Number(r.qty||0),0)
                              if (totalQ === 0) return null
                              // Kullanım verisi burada yok, sadece kota var — "Kota: X" göster
                              return (
                                <span style={{fontSize:'.72rem',color:'#94a3b8'}}>
                                  Kota: {totalQ.toLocaleString('tr-TR')}
                                </span>
                              )
                            })()}
                          </div>
                        </td>
                        <td>
                          <div style={{display:'flex',flexDirection:'column',gap:2,alignItems:'flex-start'}}>
                            <span className="badge">{(c.rows||[]).length} mal</span>
                          </div>
                        </td>
                        <td style={{fontSize:'.82rem',color:'#64748b'}}>
                          {(c.branches||[]).length === 0
                            ? <span style={{color:'#94a3b8'}}>—</span>
                            : (c.branches||[]).slice(0,2).map(b => (
                              <span key={b.id} style={{display:'inline-flex',alignItems:'center',gap:3,
                                marginRight:4,padding:'1px 7px',borderRadius:99,fontSize:'.72rem',
                                background:b.type==='template'?'#ede9fe':'#e0f2fe',
                                color:b.type==='template'?'#5b21b6':'#0369a1',fontWeight:600}}>
                                <i className={`fa-solid ${b.type==='template'?'fa-layer-group':'fa-store'}`} style={{fontSize:'.6rem'}}/>
                                {b.name}
                              </span>
                            ))}
                          {(c.branches||[]).length > 2 && (
                            <span style={{fontSize:'.72rem',color:'#94a3b8'}}>+{c.branches.length-2}</span>
                          )}
                        </td>
                        <td>
                          <span className="badge" style={{
                            background:statusColor[status]+'22',
                            color:statusColor[status],
                            border:`1px solid ${statusColor[status]}44`}}>
                            <i className="fa-solid fa-circle" style={{fontSize:'.45rem',marginRight:4}}/>
                            {statusLabel[status]}
                          </span>
                        </td>
                        <td>
                          <div style={{display:'flex',gap:4}}>
                            <button className="ico-btn" title="Detay"
                              onClick={() => setDetailId(c.id===detailId?null:c.id)}>
                              <i className="fa-solid fa-eye"/>
                            </button>
                            {!c.deleted_at
                              ? <>
                                <button className="ico-btn edit" onClick={() => openEdit(c)}>
                                  <i className="fa-solid fa-pen"/>
                                </button>
                                <button className="ico-btn del" onClick={() => setConfirmDel(c)}>
                                  <i className="fa-solid fa-trash"/>
                                </button>
                              </>
                              : <button className="ico-btn" onClick={() => restore(c)} title="Geri Al">
                                  <i className="fa-solid fa-rotate-left"/>
                                </button>
                            }
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        }
      </div>

      {/* Detay paneli */}
      {detailContract && (
        <ContractDetail
          contract={detailContract}
          suppliers={suppliers}
          onClose={() => setDetailId(null)}/>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="modal-bg open">
          <div className="modal-box" style={{maxWidth:800,width:'95%',maxHeight:'92vh',overflowY:'auto'}}>
            <div className="modal-head">
              <span>{editId ? 'Kontrat Düzenle' : 'Yeni Kontrat'}</span>
              <button className="ico-btn" onClick={() => setModalOpen(false)}>
                <i className="fa-solid fa-xmark"/>
              </button>
            </div>

            <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:20}}>

              {/* Temel Bilgiler */}
              <SectionHead label="Temel Bilgiler"/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}}>
                <div>
                  <label className="f-label">Kontrat No *</label>
                  <input className="f-input" value={form.contract_no}
                    onChange={e=>set('contract_no',e.target.value)} placeholder="202602-001"/>
                  <p className="f-hint">Benzersiz kimlik (örn: YYYYAA-XXX)</p>
                </div>
                <div>
                  <label className="f-label">Başlangıç Tarihi *</label>
                  <input className="f-input" type="date" value={form.start_date}
                    onChange={e=>set('start_date',e.target.value)}/>
                </div>
                <div>
                  <label className="f-label">Bitiş Tarihi *</label>
                  <input className="f-input" type="date" value={form.end_date}
                    onChange={e=>set('end_date',e.target.value)}/>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:14}}>
                <div>
                  <label className="f-label">Uyarı Gün Sayısı</label>
                  <input className="f-input" type="number" min="1" value={form.warning_days}
                    onChange={e=>set('warning_days',e.target.value)}/>
                  <p className="f-hint">Bitişe N gün kala uyarı</p>
                </div>
                <div>
                  <label className="f-label">Fiyat Toleransı</label>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input className="f-input" type="number" min="0" max="1" step="0.01"
                      value={form.price_tolerance}
                      onChange={e=>set('price_tolerance',e.target.value)}/>
                    <span style={{fontSize:'.82rem',color:'#64748b',whiteSpace:'nowrap'}}>
                      (%{((parseFloat(form.price_tolerance)||0)*100).toFixed(0)})
                    </span>
                  </div>
                  <p className="f-hint">İzin verilen fiyat sapması</p>
                </div>
                <div>
                  <label className="f-label">Bitiş Aşım Gün Sayısı</label>
                  <input className="f-input" type="number" min="0" value={form.end_grace_days}
                    onChange={e=>set('end_grace_days',e.target.value)}/>
                  <p className="f-hint">Süre bitimi sonrası ek süre</p>
                </div>
              </div>

              {/* Kota Ayarları */}
              <SectionHead label="Kota Ayarları"/>
              <div style={{background:'#f8fafc',borderRadius:10,padding:'14px 16px',border:'1px solid #e2e8f0'}}>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',marginBottom:form.total_quota_active?16:0}}>
                  <div className="tog" onClick={()=>set('total_quota_active',!form.total_quota_active)}>
                    <div className={`tog-sl${form.total_quota_active?' on':''}`}/>
                  </div>
                  <span style={{fontSize:'.9rem',fontWeight:600,color:'#1e293b'}}>Toplam Kota Uygula</span>
                  <span style={{fontSize:'.78rem',color:'#64748b'}}>
                    — Aktifse toplam kota takip edilir; kalem bazlı aşım olabilir
                  </span>
                </label>
                {form.total_quota_active && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
                    <div>
                      <label className="f-label">Toplam Kota Uyarı Oranı</label>
                      <input className="f-input" type="number" min="0" max="1" step="0.05"
                        value={form.total_quota_warning_ratio}
                        onChange={e=>set('total_quota_warning_ratio',e.target.value)}/>
                      <p className="f-hint">Bu oran aşılınca uyarı verilir (%{((parseFloat(form.total_quota_warning_ratio)||0)*100).toFixed(0)})</p>
                    </div>
                    <div>
                      <label className="f-label">Toplam Kota Aşım Oranı</label>
                      <input className="f-input" type="number" min="0" max="1" step="0.05"
                        value={form.total_quota_overrun_ratio}
                        onChange={e=>set('total_quota_overrun_ratio',e.target.value)}/>
                      <p className="f-hint">İzin verilen aşım (%{((parseFloat(form.total_quota_overrun_ratio)||0)*100).toFixed(0)})</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Engelleme Davranışı */}
              <SectionHead label="Süre / Kota Aşımında Davranış"/>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',
                  padding:'10px 14px',borderRadius:9,border:`1.5px solid ${form.warn_only_on_exceed?'#fbbf24':'#e2e8f0'}`,
                  background:form.warn_only_on_exceed?'#fffbeb':'#f8fafc'}}>
                  <input type="radio" checked={form.warn_only_on_exceed}
                    onChange={()=>{set('warn_only_on_exceed',true);set('block_on_exceed',false)}}
                    style={{accentColor:'#fbbf24'}}/>
                  <div>
                    <div style={{fontWeight:700,color:'#1e293b',fontSize:'.88rem'}}>Uyar, Engelleme</div>
                    <div style={{fontSize:'.76rem',color:'#64748b'}}>
                      Satınalma devam eder; ilgili ekranlarda "sözleşmesiz alım" uyarısı gösterilir
                    </div>
                  </div>
                </label>
                <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',
                  padding:'10px 14px',borderRadius:9,border:`1.5px solid ${form.block_on_exceed?'#fbbf24':'#e2e8f0'}`,
                  background:form.block_on_exceed?'#fffbeb':'#f8fafc'}}>
                  <input type="radio" checked={form.block_on_exceed}
                    onChange={()=>{set('block_on_exceed',true);set('warn_only_on_exceed',false)}}
                    style={{accentColor:'#fbbf24'}}/>
                  <div>
                    <div style={{fontWeight:700,color:'#1e293b',fontSize:'.88rem'}}>Satınalmayı Engelle</div>
                    <div style={{fontSize:'.76rem',color:'#64748b'}}>
                      İlgili ürünlerin siparişi engellenir; daha önce sevk edilmiş malın fatura girişine izin verilir
                    </div>
                  </div>
                </label>
              </div>

              {/* Tedarikçi */}
              <SectionHead label="Tedarikçi"/>
              <div>
                <label className="f-label">Tedarikçi *</label>
                <SupplierSelect
                  value={form.supplier_id}
                  onChange={v => { set('supplier_id', v); set('rows', []) }}
                  suppliers={suppliers}/>
                <p className="f-hint">Tedarikçi değiştirilirse mevcut satırlar temizlenir</p>
              </div>

              {/* Geçerli Şubeler */}
              <SectionHead label="Kontratın Geçerli Olduğu Şubeler"/>
              <div>
                <label className="f-label">Şube / Şablon Seçimi</label>
                <BranchMultiSelect
                  value={form.branches}
                  onChange={v => set('branches', v)}
                  branches={branches}
                  branchTemplates={templates}/>
                <p className="f-hint">
                  Şablon seçildiğinde o şablondaki şubeler ayrıca seçilemez.
                  Boş bırakılırsa tüm şubelerde geçerli sayılır.
                </p>
              </div>

              {/* Stok Malları */}
              <SectionHead label="Kontrat Malları (KDV Hariç Fiyatlar)"/>
              <StockItemSelect
                supplierId={form.supplier_id}
                suppliers={suppliers}
                stockItems={stockItems}
                rows={form.rows}
                onChange={rows => set('rows', rows)}/>
              {form.rows.length > 0 && (
                <ContractRowsTable
                  rows={form.rows}
                  onChange={rows => set('rows', rows)}/>
              )}

            </div>

            <div className="modal-foot">
              <button className="btn-o" onClick={() => setModalOpen(false)}>İptal</button>
              <button className="btn-p" onClick={save} disabled={saving}>
                {saving ? <i className="fa-solid fa-spinner fa-spin"/> : <i className="fa-solid fa-check"/>}
                {editId ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Kontrat Silinecek"
        message={`"${confirmDel?.contract_no}" numaralı kontrat silinsin mi?`}
        onConfirm={() => { doDelete(confirmDel); setConfirmDel(null) }}
        onCancel={() => setConfirmDel(null)}/>
    </>
  )
}
