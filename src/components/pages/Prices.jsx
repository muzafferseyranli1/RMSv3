import { useEffect, useState, useCallback, useRef } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'

function getAllBranches(tree) {
  const r = []
  function walk(n) { for (const x of n||[]) { if(x.type==='sube') r.push({id:x.id,name:x.name}); walk(x.children||[]) } }
  walk(tree); return r
}

const ICON_MAP = {
  'Hızlı Satış':'fa-bolt','Masa':'fa-chair','QR':'fa-qrcode','Kiosk':'fa-desktop',
  'Suitable Yemek':'fa-utensils','Yemek Sepeti':'fa-basket-shopping','Getir':'fa-motorcycle',
  'Trendyol':'fa-bag-shopping','Migros':'fa-cart-shopping','Tıkla Gelsin':'fa-truck-fast'
}

export default function Prices() {
  const toast = useToast()
  const [saleItems, setSaleItems]     = useState([])
  const [categories, setCategories]   = useState([])
  const [channels, setChannels]       = useState([])
  const [branches, setBranches]       = useState([])
  const [branchTpls, setBranchTpls]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [catFilter, setCatFilter]     = useState('')
  const [branchFilter, setBranchFilter] = useState('') // '' = tümü, template:id veya branch:id
  const [collapsedPorts, setCollapsedPorts] = useState({}) // portId → bool
  const [prices, setPrices]           = useState({})
  const [decimalPlaces, setDecimalPlaces] = useState(2)
  const [useDate, setUseDate]         = useState(false)
  const [effectiveDate, setEffectiveDate] = useState('')
  const listRef = useRef()

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: si }, { data: ca }, { data: ch }, { data: bt }, { data: ct }] = await Promise.all([
      db.from('sale_items').select('id,name,sku,channel_prices,portions,standard_price,location,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5').order('name'),
      db.from('sale_categories').select('*').order('name'),
      db.from('sales_channels').select('*').is('deleted_at',null).eq('active',true).order('sort_order'),
      db.from('branch_templates').select('*').order('name'),
      db.from('settings').select('value').eq('key','company_tree').single(),
    ])
    setSaleItems((si||[]).filter(x=>!x.deleted_at))
    setCategories(ca||[])
    setChannels(ch||[])
    setBranchTpls(bt||[])
    setBranches(getAllBranches(ct?.value||[]))
    function findDecimal(n) { for(const x of n||[]){if(x.type==='sirket'&&x.decimalPlaces!==undefined)return x.decimalPlaces;const r=findDecimal(x.children||[]);if(r!==null)return r}return null }
    const dp = findDecimal(ct?.value||[]); if(dp!==null) setDecimalPlaces(parseInt(dp)||2)
    setLoading(false)
  },[])

  useEffect(()=>{load()},[load])

  // Seçili ürün değişince fiyat matrisini kur
  useEffect(()=>{
    if(!selectedItem){setPrices({});return}
    const item = saleItems.find(x=>x.id===selectedItem)
    if(!item) return
    const rows = buildRows(item, null) // null = tüm şubeler için
    const cp = item.channel_prices||[]
    const np = {}
    rows.forEach(row=>{
      np[row.key]={}
      channels.forEach(ch=>{
        const entry = cp.find(x=>x.channel_id===ch.id)
        const val = entry ? (parseFloat(entry.price)||0).toFixed(decimalPlaces) : ''
        np[row.key][ch.id] = {value:val, original:val, changed:false}
      })
    })
    setPrices(np)
    setCollapsedPorts({})
  },[selectedItem, saleItems, channels, decimalPlaces])

  // ── Filtered items ───────────────────────────────────────
  const filteredItems = saleItems.filter(item=>{
    if(!catFilter) return true
    const catCols = [item.sale_cat_l1, item.sale_cat_l2, item.sale_cat_l3, item.sale_cat_l4, item.sale_cat_l5]
    return catCols.some(c=>c===catFilter)
  })

  // ── Branch filter ───────────────────────────────────────
  function getActiveBranchIds() {
    if(!branchFilter) return null // tümü
    if(branchFilter.startsWith('template:')) {
      const tplId = branchFilter.replace('template:','')
      const tpl = branchTpls.find(t=>t.id===tplId)
      return new Set(tpl?.branch_ids||[])
    }
    if(branchFilter.startsWith('branch:')) {
      return new Set([branchFilter.replace('branch:','')])
    }
    return null
  }

  // ── Build rows ───────────────────────────────────────────
  function getItemBranches(item) {
    let locs = []; try { locs = JSON.parse(item.location||'[]') } catch {}
    const ids = new Set()
    locs.forEach(l=>{
      if(l.type==='branch') ids.add(l.id)
      if(l.type==='template') (l.branchIds||[]).forEach(id=>ids.add(id))
    })
    let brs = branches.filter(b=>ids.has(b.id))
    const activeBrIds = getActiveBranchIds()
    if(activeBrIds) brs = brs.filter(b=>activeBrIds.has(b.id))
    return brs
  }

  function buildRows(item, activeBrIds) {
    const portions = (item.portions||[]).filter(p=>p.name)
    let itemBranches = getItemBranches(item)
    const allPorts = [{id:'__standart__', name:'Standart'}, ...portions]

    const rows = []
    allPorts.forEach((port,pi)=>{
      if(itemBranches.length===0){
        rows.push({key:`${item.id}__${port.id}`, portId:port.id, portName:port.name,
          branchId:null, branchName:'', isPortFirst:true, isItemFirst:pi===0})
      } else {
        itemBranches.forEach((br,bi)=>{
          rows.push({key:`${item.id}__${port.id}__${br.id}`, portId:port.id, portName:port.name,
            branchId:br.id, branchName:br.name, isPortFirst:bi===0, isItemFirst:pi===0&&bi===0})
        })
      }
    })
    return rows
  }

  function setPrice(rowKey, chId, val) {
    setPrices(prev=>{
      const row=prev[rowKey]||{}; const cur=row[chId]||{}
      return {...prev,[rowKey]:{...row,[chId]:{...cur,value:val,changed:val!==cur.original}}}
    })
  }

  // ── Copy helpers ─────────────────────────────────────────
  // Bir satırın ilk aktif kanalını o satırın tüm aktif kanallarına kopyala
  function copyRowToAllCols(rowKey) {
    if(!channels.length) return
    const firstActiveCh = channels.find(ch=>activeChannelIds.has(ch.id))
    if(!firstActiveCh) return
    const firstVal = prices[rowKey]?.[firstActiveCh.id]?.value||''
    setPrices(prev=>{
      const row={...prev[rowKey]||{}}
      channels.forEach(ch=>{
        if(!activeChannelIds.has(ch.id)) return // pasif kanalı atla
        const cur=row[ch.id]||{}
        row[ch.id]={...cur,value:firstVal,changed:firstVal!==cur.original}
      })
      return {...prev,[rowKey]:row}
    })
  }

  // Bir kanalın seçili ürünün tüm satırlarına aynı değeri kopyala
  function copyColToAllRows(chId, value) {
    const item = saleItems.find(x=>x.id===selectedItem)
    if(!item) return
    if(!activeChannelIds.has(chId)) { toast('Bu kanal bu ürün için aktif değil','error'); return }
    const rows = buildRows(item, null)
    setPrices(prev=>{
      const next={...prev}
      rows.forEach(row=>{
        const cur=next[row.key]?.[chId]||{}
        next[row.key]={...(next[row.key]||{}),[chId]:{...cur,value,changed:value!==cur.original}}
      })
      return next
    })
  }

  async function save() {
    if(!selectedItem) return
    const item = saleItems.find(x=>x.id===selectedItem)
    const rows = buildRows(item, null)
    const existing = item.channel_prices||[]

    // Değişen fiyatları kaydet (price_changes için)
    const changesList = []
    rows.forEach(row => {
      channels.forEach(ch => {
        const cell = prices[row.key]?.[ch.id]
        if (!cell || !cell.changed) return
        changesList.push({
          channel_id:   ch.id,
          channel_name: ch.name,
          port_id:      row.portId,
          port_name:    row.portName,
          branch_id:    row.branchId,
          branch_name:  row.branchName,
          old_price:    parseFloat(cell.original) || null,
          new_price:    parseFloat(cell.value) || null,
        })
      })
    })

    const newCp = channels.map(ch=>{
      const old = existing.find(x=>x.channel_id===ch.id)||{}
      const firstRow = rows[0]
      const val = prices[firstRow?.key]?.[ch.id]?.value
      return {...old, channel_id:ch.id, price:parseFloat(val)||null, active:!!parseFloat(val)}
    })

    const {error} = await db.from('sale_items').update({channel_prices:newCp}).eq('id',selectedItem)
    if(error){toast('Hata: '+error.message,'error');return}

    // Değişiklik kaydı oluştur
    if (changesList.length > 0) {
      await db.from('price_changes').insert({
        sale_item_id:   item.id,
        sale_item_name: item.name,
        sale_item_sku:  item.sku,
        effective_date: useDate && effectiveDate ? effectiveDate : null,
        changes:        changesList,
      })
    }

    setPrices(prev=>{
      const next={...prev}
      Object.keys(next).forEach(rk=>Object.keys(next[rk]).forEach(ci=>{next[rk][ci]={...next[rk][ci],original:next[rk][ci].value,changed:false}}))
      return next
    })
    await load(); toast('Fiyatlar kaydedildi','success')
  }

  function exportCSV() {
    if(!selectedItem) return
    const item = saleItems.find(x=>x.id===selectedItem)
    const rows = buildRows(item, null)
    const headers = ['Satış Malı','SKU','Boyut','Şube',...channels.map(ch=>ch.name)]
    const csvRows = rows.map(row=>{
      const chP = channels.map(ch=>prices[row.key]?.[ch.id]?.value||'')
      return [item.name, item.sku, row.portName, row.branchName, ...chP]
    })
    const csv = [headers,...csvRows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n')
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv)
    a.download=`fiyatlar_${item.name}.csv`; a.click(); toast('CSV indiriliyor…','info')
  }

  const item = selectedItem ? saleItems.find(x=>x.id===selectedItem) : null

  // Aktif kanallar — channel_prices içindeki active:true olanlar
  const activeChannelIds = new Set(
    (item?.channel_prices||[]).filter(cp=>cp.active).map(cp=>cp.channel_id)
  )
  function isChActive(chId) { return activeChannelIds.has(chId) }
  const rows = item ? buildRows(item, null) : []
  const hasChanges = Object.values(prices).some(row=>Object.values(row).some(c=>c.changed))

  // Keyboard nav on list
  function handleListKey(e, itemId, idx) {
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault()
      const newIdx = e.key==='ArrowDown' ? Math.min(idx+1,filteredItems.length-1) : Math.max(idx-1,0)
      setSelectedItem(filteredItems[newIdx].id)
      listRef.current?.querySelectorAll('[data-item]')[newIdx]?.focus()
    }
  }

  return (
    <div className="page-enter" style={{display:'flex',flexDirection:'column',height:'calc(100vh - 64px)'}}>
      <Header title="Fiyat Yönetimi" subtitle="Satış mallarının kanal bazlı fiyatlarını düzenleyin"
        actions={<>
          {selectedItem&&<button className="btn-o" onClick={exportCSV} style={{fontSize:'.83rem'}}>
            <i className="fa-solid fa-file-export"/> CSV
          </button>}
          {selectedItem&&<button className={hasChanges?'btn-p':'btn-o'} onClick={save} disabled={!hasChanges}>
            <i className="fa-solid fa-check"/> Kaydet
          </button>}
        </>}/>

      {/* Filtre çubuğu */}
      <div className="card" style={{padding:'10px 14px',marginBottom:10,display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <div className="sel-wrap" style={{minWidth:180}}>
          <select className="f-input" value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
            <option value="">Tüm Kategoriler</option>
            {categories.filter(c=>!c.deleted_at).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="sel-wrap" style={{minWidth:200}}>
          <select className="f-input" value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}>
            <option value="">Tüm Şubeler</option>
            {branchTpls.map(t=>(
              <option key={t.id} value={`template:${t.id}`}>📋 {t.name}</option>
            ))}
            {branches.map(b=>(
              <option key={b.id} value={`branch:${b.id}`}>🏪 {b.name}</option>
            ))}
          </select>
        </div>
        <span style={{fontSize:'.78rem',color:'#94a3b8',marginLeft:'auto'}}>
          {filteredItems.length} satış malı
        </span>
        {/* Geçerlilik tarihi */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:8}}>
          <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',
            fontSize:'.83rem',color:'#475569',whiteSpace:'nowrap'}}>
            <input type="checkbox" checked={useDate} onChange={e=>setUseDate(e.target.checked)}
              style={{accentColor:'#fbbf24'}}/>
            <i className="fa-solid fa-calendar" style={{color:'#fbbf24',fontSize:'.8rem'}}/>
            Tarihten itibaren
          </label>
          {useDate && (
            <input type="date" className="f-input" value={effectiveDate}
              onChange={e=>setEffectiveDate(e.target.value)}
              style={{width:150,fontSize:'.83rem'}}/>
          )}
        </div>
      </div>

      {/* Ana 2-kolon layout */}
      <div style={{display:'grid',gridTemplateColumns:'260px 1fr',gap:10,flex:1,minHeight:0}}>

        {/* Sol: Satış malı listesi */}
        <div className="card" style={{padding:0,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          <div style={{padding:'10px 12px',borderBottom:'1px solid #f1f5f9',
            fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em'}}>
            Satış Malları
          </div>
          {loading ? (
            <div style={{padding:24,textAlign:'center',color:'#94a3b8'}}>
              <i className="fa-solid fa-spinner fa-spin"/>
            </div>
          ) : (
            <div ref={listRef} style={{overflowY:'auto',flex:1}}>
              {filteredItems.length===0 ? (
                <div style={{padding:20,textAlign:'center',color:'#94a3b8',fontSize:'.82rem'}}>Satış malı bulunamadı</div>
              ) : filteredItems.map((si, idx)=>{
                const isSelected = si.id===selectedItem
                return (
                  <div key={si.id} data-item tabIndex={0}
                    onKeyDown={e=>handleListKey(e,si.id,idx)}
                    onClick={()=>setSelectedItem(si.id)}
                    style={{padding:'10px 14px',cursor:'pointer',
                      background: isSelected?'#fef3c7':'transparent',
                      borderLeft: isSelected?'3px solid #fbbf24':'3px solid transparent',
                      borderBottom:'1px solid #f8fafc',
                      transition:'background .1s', outline:'none'}}
                    onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background='#fffbeb'}}
                    onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background='transparent'}}>
                    <div style={{fontWeight:isSelected?700:500,fontSize:'.855rem',color:isSelected?'#92400e':'#334155'}}>
                      {si.name}
                    </div>
                    <div style={{fontSize:'.72rem',color:'#94a3b8',fontFamily:'monospace',marginTop:2}}>
                      {si.sku}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Sağ: Fiyat matrisi */}
        <div className="card" style={{padding:0,overflow:'hidden',display:'flex',flexDirection:'column'}}>
          {!selectedItem ? (
            <div className="empty">
              <i className="fa-solid fa-tag"/>
              <p>Soldan bir satış malı seçin</p>
              <p style={{fontSize:'.78rem',color:'#94a3b8'}}>↑ ↓ ok tuşlarıyla da hareket edebilirsiniz</p>
            </div>
          ) : (
            <>
              {/* Tek scroll container — header sticky, body scroll */}
              <div style={{overflowX:'auto',overflowY:'auto',flex:1}}>
                <table style={{width:'100%',borderCollapse:'collapse',tableLayout:'fixed'}}>
                  <colgroup>
                    <col style={{width:44}}/>
                    <col style={{width:80}}/>
                    <col style={{width:90}}/>
                    {channels.map(()=><col key="c" style={{width:130}}/>)}
                  </colgroup>
                  <thead style={{position:'sticky',top:0,zIndex:3}}>
                    <tr style={{background:'#f8fafc',borderBottom:'2px solid #e2e8f0'}}>
                      <th style={{padding:'8px 6px',background:'#f8fafc'}}/>
                      <th style={{padding:'8px 10px',textAlign:'left',fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',background:'#f8fafc'}}>Boyut</th>
                      <th style={{padding:'8px 10px',textAlign:'left',fontSize:'.72rem',fontWeight:800,color:'#64748b',textTransform:'uppercase',background:'#f8fafc'}}>Şube</th>
                      {channels.map(ch=>(
                        <th key={ch.id} style={{padding:'8px 10px',textAlign:'center',background:'#e0f2fe'}}>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                            <i className={`fa-solid ${ch.icon||ICON_MAP[ch.name]||'fa-store'}`}
                              style={{color:'#0369a1',fontSize:'.85rem'}}/>
                            <span style={{fontSize:'.7rem',fontWeight:700,color:'#0369a1'}}>{ch.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Gruplandır: portId bazında */}
                    {(() => {
                      const allPorts = [{id:'__standart__',name:'Standart'}, ...(item.portions||[]).filter(p=>p.name)]
                      return allPorts.map(port=>{
                        const portRows = rows.filter(r=>r.portId===port.id)
                        if(!portRows.length) return null
                        const isCollapsed = !!collapsedPorts[port.id]
                        const portChanged = portRows.some(r=>channels.some(ch=>prices[r.key]?.[ch.id]?.changed))

                        return [
                          // Porsiyon başlık satırı
                          <tr key={`hdr-${port.id}`}
                            style={{background: port.id==='__standart__'?'#ecfdf5':'#f5f3ff',
                              borderTop:'2px solid #e2e8f0', cursor:'pointer'}}
                            onClick={()=>setCollapsedPorts(p=>({...p,[port.id]:!p[port.id]}))}>
                            <td style={{padding:'8px 6px',textAlign:'center'}}>
                              <i className={`fa-solid fa-chevron-${isCollapsed?'right':'down'}`}
                                style={{fontSize:'.65rem',color:'#94a3b8'}}/>
                            </td>
                            <td colSpan={2} style={{padding:'8px 10px',fontWeight:800,
                              color: port.id==='__standart__'?'#065f46':'#5b21b6',fontSize:'.83rem'}}>
                              {port.name}
                              {portChanged && <span style={{marginLeft:8,fontSize:'.68rem',background:'#fef3c7',
                                color:'#92400e',padding:'1px 5px',borderRadius:99,fontWeight:700}}>●</span>}
                            </td>
                            {/* Satıra kopyala butonu (portun ilk satırını tüm kanallara) */}
                            {channels.map(ch=>(
                              <td key={ch.id} style={{padding:'6px',textAlign:'center'}}>
                                {portRows.length>0 && (
                                  <button
                                    title={`Bu boyutun tüm şubelerine kopyala`}
                                    onClick={e=>{
                                      e.stopPropagation()
                                      const firstRow = portRows[0]
                                      if(!isChActive(ch.id)){toast('Bu kanal aktif değil','error');return}
                                      const val = prices[firstRow?.key]?.[ch.id]?.value||''
                                      portRows.forEach(row=>{
                                        setPrices(prev=>{
                                          const r={...prev[row.key]||{}}; const cur=r[ch.id]||{}
                                          return {...prev,[row.key]:{...r,[ch.id]:{...cur,value:val,changed:val!==cur.original}}}
                                        })
                                      })
                                      toast('İlk şube fiyatı kopyalandı','info')
                                    }}
                                    style={{background:'#fef3c7',border:'none',borderRadius:5,
                                      width:22,height:22,cursor:'pointer',fontSize:'.6rem',
                                      color:'#d97706',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                                    <i className="fa-solid fa-arrows-up-down"/>
                                  </button>
                                )}
                              </td>
                            ))}
                          </tr>,
                          // Şube satırları
                          !isCollapsed && portRows.map((row,ri)=>{
                            const bg = ri%2===0?'#fff':'#fafafa'
                            const anyChanged = channels.some(ch=>prices[row.key]?.[ch.id]?.changed)
                            return (
                              <tr key={row.key}
                                style={{borderBottom:'1px solid #f1f5f9',
                                  background:anyChanged?'#fffde7':bg}}>
                                <td style={{padding:'6px',textAlign:'center'}}>
                                  {/* Satır → tüm kanallara kopyala */}
                                  <button
                                    title="Bu satırın ilk kanalını diğer kanallara kopyala"
                                    onClick={()=>copyRowToAllCols(row.key)}
                                    style={{background:'#f1f5f9',border:'none',borderRadius:5,
                                      width:22,height:22,cursor:'pointer',fontSize:'.6rem',
                                      color:'#475569',display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                                    <i className="fa-solid fa-arrows-left-right"/>
                                  </button>
                                </td>
                                <td style={{padding:'6px 10px',fontSize:'.75rem',color:'#94a3b8'}}/>
                                <td style={{padding:'6px 10px',fontSize:'.78rem',color:'#475569',fontWeight:500}}>
                                  {row.branchName||<span style={{color:'#cbd5e1'}}>—</span>}
                                </td>
                                {channels.map(ch=>{
                                  const cell = prices[row.key]?.[ch.id]||{value:'',original:'',changed:false}
                                  return (
                                    <td key={ch.id} style={{padding:'4px 6px'}}>
                                      <div style={{position:'relative'}}>
                                        <span style={{position:'absolute',left:8,top:'50%',
                                          transform:'translateY(-50%)',fontSize:'.78rem',
                                          color:'#94a3b8',pointerEvents:'none'}}>₺</span>
                                        <input type="text" className="price-input"

                                          value={isChActive(ch.id)?cell.value:''}
                                          disabled={!isChActive(ch.id)}
                                          inputMode="decimal"
                                          onChange={e=>isChActive(ch.id)&&setPrice(row.key,ch.id,e.target.value)}
                                          onBlur={e=>{if(!isChActive(ch.id))return;const v=e.target.value;setPrice(row.key,ch.id,v&&!isNaN(parseFloat(v))?parseFloat(v).toFixed(decimalPlaces):'')}}
                                          onKeyDown={e=>{
                                            if(!isChActive(ch.id))return
                                            const allInputs=Array.from(document.querySelectorAll('.price-input:not(:disabled)'))
                                            const idx=allInputs.indexOf(e.target)
                                            if(e.key==='Enter'||e.key==='ArrowDown'){e.preventDefault();allInputs[idx+1]?.focus()}
                                            else if(e.key==='ArrowUp'){e.preventDefault();allInputs[idx-1]?.focus()}
                                            else if(e.key==='ArrowRight'){e.preventDefault();allInputs[idx+channels.length]?.focus()}
                                            else if(e.key==='ArrowLeft'){e.preventDefault();allInputs[idx-channels.length]?.focus()}
                                          }}
                                          style={{width:'100%',border:`1.5px solid ${!isChActive(ch.id)?'#f1f5f9':cell.changed?'#fbbf24':'#e2e8f0'}`,
                                            borderRadius:8,padding:`6px 8px 6px 22px`,
                                            fontSize:'.83rem',fontWeight:cell.changed?700:400,
                                            background:!isChActive(ch.id)?'#f8fafc':cell.changed?'#fef3c7':'#fff',
                                            color:!isChActive(ch.id)?'#cbd5e1':cell.changed?'#92400e':'#0f172a',
                                            outline:'none',cursor:isChActive(ch.id)?'text':'not-allowed'}}
                                          onFocus={e=>isChActive(ch.id)&&(e.target.style.borderColor='#fbbf24')}
                                          onBlurCapture={e=>!prices[row.key]?.[ch.id]?.changed&&(e.target.style.borderColor=isChActive(ch.id)?'#e2e8f0':'#f1f5f9')}
                                        />
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })
                        ]
                      })
                    })()}
                  </tbody>
                </table>
              </div>

              {/* Kaydet çubuğu */}
              {hasChanges && (
                <div style={{padding:'10px 16px',background:'#fffbeb',borderTop:'1px solid #fde68a',
                  display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontSize:'.82rem',color:'#92400e',fontWeight:600}}>
                    <i className="fa-solid fa-circle-exclamation" style={{marginRight:6}}/>
                    Kaydedilmemiş değişiklikler var
                  </span>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn-g" style={{fontSize:'.83rem'}}
                      onClick={()=>{const id=selectedItem;setSelectedItem(null);setTimeout(()=>setSelectedItem(id),10)}}>
                      Geri Al
                    </button>
                    <button className="btn-p" style={{fontSize:'.83rem'}} onClick={save}>
                      <i className="fa-solid fa-check"/> Kaydet
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  )
}
