import { useEffect, useState, useCallback, useMemo } from 'react'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import CategoryHierarchyView from '@/components/ui/CategoryHierarchyView'
import { DEFAULT_ACCOUNT_CHART, normalizeAccountChart } from '@/lib/accountChart'
import {
  buildSaleCategoryAccountOptions,
  createChartAccountMap,
  resolveLegacyAccountingFields,
} from '@/lib/categoryAccounting'
import { ensureComboMenuCategory, sortSaleCategoriesWithComboFirst } from '@/lib/comboMenuCategory'
import { readSettingValue } from '@/lib/settingsStore'

// ── SKU mask helpers ─────────────────────────────────────────
function resolveMask(mask) {
  if (!mask) return ''
  const now = new Date()
  const yyyy = String(now.getFullYear())
  // Tüm token'lar büyük harf — kullanıcı küçük girse de büyük kabul edilir
  return mask.toUpperCase()
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g,   yyyy.slice(2))
    .replace(/AA/g,   String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/GG/g,   String(now.getDate()).padStart(2, '0'))
}

function genSku(mask, appendType, appendLen) {
  const len = parseInt(appendLen) || 0
  if (!mask && (!appendType || !len)) return '—'
  const resolved = resolveMask(mask || '')
  let suffix = ''
  if (appendType && len > 0) {
    const digits  = '0123456789'
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const mixed   = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    const pool = appendType === 'sayi' ? digits : appendType === 'harf' ? letters : mixed
    for (let i = 0; i < len; i++) suffix += pool[Math.floor(Math.random() * pool.length)]
  }
  return resolved + suffix
}

function appendLabel(type, len) {
  if (!type || !len) return '—'
  const t = type === 'sayi' ? 'Sayı' : type === 'harf' ? 'Harf' : 'Karışık'
  return `${len} hane ${t}`
}

// ── Build tree ───────────────────────────────────────────────
function buildTree(cats, parentId = null) {
  return cats
    .filter(c => (c.parent_id || null) === parentId)
    .map(c => ({ ...c, children: buildTree(cats, c.id) }))
}

function getDescIds(cats, id) {
  const kids = cats.filter(x => x.parent_id === id)
  return [id, ...kids.flatMap(k => getDescIds(cats, k.id))]
}

function catDepth(cats, id) {
  const p = cats.find(x => x.id === id)
  return p ? (p.parent_id ? 1 + catDepth(cats, p.parent_id) : 0) : -1
}

// ── Upload helpers ───────────────────────────────────────────
async function uploadFileAndGetUrl(file) {
  if (file?.type?.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise((resolve, reject) => {
        const nextImage = new Image()
        nextImage.onload = () => resolve(nextImage)
        nextImage.onerror = reject
        nextImage.src = objectUrl
      })

      const maxDimension = 1600
      const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1))
      const width = Math.max(1, Math.round((image.width || 1) * scale))
      const height = Math.max(1, Math.round((image.height || 1) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (context) {
        context.drawImage(image, 0, 0, width, height)
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86))
        if (blob) {
          const formData = new FormData()
          const originalName = file.name || 'image.webp'
          const newName = originalName.replace(/\.[^/.]+$/, "") + ".webp"
          formData.append('file', blob, newName)
          const uploaded = await uploadApiFile(formData)
          return buildApiUrl(uploaded.file_url)
        }
      }
    } catch {
      // Fallback
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const formData = new FormData()
  formData.append('file', file)
  const uploaded = await uploadApiFile(formData)
  return buildApiUrl(uploaded.file_url)
}

// ── Color palette ────────────────────────────────────────────
const COLORS = [
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#ede9fe', text: '#5b21b6' },
  { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#fee2e2', text: '#991b1b' },
  { bg: '#f1f5f9', text: '#475569' },
]

const EMPTY_FORM = {
  name: '', parent_id: null,
  bg: '#fef3c7', text_color: '#92400e',
  sku_mask: '', append_type: '', append_len: 4,
  description: '', acc_cat: '', acc_code: '', revenue_account_id: '',
  image_url: '',
}

// ── Default SKU mask panel ───────────────────────────────────
function DefaultMaskPanel({ onSaved }) {
  const toast = useToast()
  const [mask, setMask]         = useState('')
  const [appendType, setType]   = useState('')
  const [appendLen, setLen]     = useState(4)
  const [preview, setPreview]   = useState('—')

  useEffect(() => {
    db.from('settings').select('value').eq('key', 'default_sale_sku_mask').single()
      .then(({ data }) => {
        if (data?.value) {
          setMask(data.value.mask || '')
          setType(data.value.appendType || '')
          setLen(data.value.appendLen || 4)
        }
      })
  }, [])

  useEffect(() => {
    const sku = genSku(mask, appendType, appendLen)
    setPreview(sku && sku !== '—' ? sku : '—')
  }, [mask, appendType, appendLen])

  async function save() {
    await db.from('settings').upsert({
      key: 'default_sale_sku_mask',
      value: { mask: mask.trim(), appendType, appendLen: parseInt(appendLen) || 4 }
    })
    toast('Varsayılan SKU maskı kaydedildi', 'success')
    onSaved?.()
  }

  return (
    <div className="card" style={{ padding:'16px 20px', marginBottom:14, borderLeft:'4px solid #fbbf24' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div style={{ fontSize:'.9rem', fontWeight:800, color:'#0f172a', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:28, height:28, background:'linear-gradient(135deg,#fef3c7,#fde68a)', borderRadius:8,
              display:'inline-flex', alignItems:'center', justifyContent:'center' }}>
              <i className="fa-solid fa-shield-halved" style={{ color:'#d97706', fontSize:'.8rem' }}/>
            </span>
            Sistem Varsayılan SKU Maskı
          </div>
          <p style={{ fontSize:'.74rem', color:'#94a3b8', margin:'4px 0 0 36px' }}>
            Kategorisi olan ama SKU maskı <strong>tanımlanmamış</strong> satış malları için devreye girer.
          </p>
        </div>
        <button className="btn-p" onClick={save} style={{ whiteSpace:'nowrap' }}>
          <i className="fa-solid fa-floppy-disk"/> Kaydet
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 170px 110px auto', gap:10, alignItems:'end' }}>
        <div>
          <label className="f-label">Sabit Prefix (Mask)</label>
          <input className="f-input" placeholder="ör. STK-YYYY-AA-" value={mask} onChange={e => setMask(e.target.value.toUpperCase())}/>
        </div>
        <div>
          <label className="f-label">Sonuna Ekle</label>
          <div className="sel-wrap">
            <select className="f-input" value={appendType} onChange={e => setType(e.target.value)}>
              <option value="">— Yok —</option>
              <option value="sayi">Hane Sayı</option>
              <option value="harf">Hane Harf</option>
              <option value="karisik">Hane Karışık</option>
            </select>
          </div>
        </div>
        <div>
          <label className="f-label">Kaç Hane</label>
          <input className="f-input" type="number" min="1" max="20" value={appendLen} onChange={e => setLen(e.target.value)}/>
        </div>
        <div>
          <label className="f-label">Önizleme</label>
          <div style={{ background:'#fff8f0', border:'1.5px solid #fed7aa', borderRadius:10, padding:'9px 14px',
            display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap', minWidth:130 }}>
            <i className="fa-solid fa-barcode" style={{ color:'#f97316', fontSize:'.9rem' }}/>
            <span style={{ fontFamily:'monospace', fontSize:'.88rem', fontWeight:800, color:'#c2410c' }}>{preview}</span>
          </div>
        </div>
      </div>
      <p style={{ fontSize:'.72rem', color:'#94a3b8', margin:'8px 0 0' }}>
        <i className="fa-solid fa-circle-info" style={{ color:'#fbbf24' }}/> Tarih değişkenleri:&nbsp;
        <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>YYYY</code>&nbsp;
        <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>YY</code>&nbsp;
        <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>AA</code>&nbsp;
        <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>GG</code>
      </p>
    </div>
  )
}

// ── Category row (recursive) — kart/liste tasarımı ──────────
function CatRow({ node, depth, collapsedMap, onToggle, onEdit, onDelete, onAddChild, sysMask, isLast }) {
  const collapsed = !!collapsedMap[node.id]
  const hasChildren = node.children?.length > 0
  const hasCatMask = !!(node.sku_mask || (node.append_type && node.append_len))
  const hasSysMask = !!(sysMask?.mask || (sysMask?.appendType && sysMask?.appendLen))
  const deleted = !!node.deleted_at

  let sku, skuIsDefault = false
  if (hasCatMask) {
    sku = genSku(node.sku_mask, node.append_type, node.append_len)
  } else if (hasSysMask) {
    sku = genSku(sysMask.mask || '', sysMask.appendType || '', sysMask.appendLen || 4)
    skuIsDefault = true
  } else {
    sku = null
  }

  // Avatar: ilk iki harf, kategori rengiyle
  const initials = node.name.slice(0,2).toUpperCase()

  return (
    <div style={{ position:'relative' }}>
      {/* Sol dikey çizgi (hiyerarşi) */}
      {depth > 0 && (
        <div style={{
          position:'absolute', left: depth * 44 - 22, top:0, bottom: isLast ? '50%' : 0,
          width:1, background:'#e2e8f0', zIndex:0
        }}/>
      )}

      {/* Satır */}
      <div style={{
        display:'flex', alignItems:'center', gap:12,
        padding:'10px 14px 10px ' + (depth * 44 + 14) + 'px',
        background: deleted ? '#fff5f5' : '#fff',
        borderBottom:'1px solid #f1f5f9',
        opacity: deleted ? .6 : 1,
        transition:'background .12s',
        position:'relative',
      }}
        onMouseEnter={e => { if(!deleted) e.currentTarget.style.background='#fffbeb' }}
        onMouseLeave={e => { e.currentTarget.style.background = deleted ? '#fff5f5' : '#fff' }}>

        {/* Yatay bağlantı çizgisi */}
        {depth > 0 && (
          <div style={{
            position:'absolute', left: depth * 44 - 22, top:'50%',
            width:20, height:1, background:'#e2e8f0'
          }}/>
        )}

        {/* Collapse toggle */}
        {hasChildren ? (
          <button onClick={() => onToggle(node.id)} style={{
            width:28, height:28, borderRadius:8, border:'1.5px solid #e2e8f0',
            background: collapsed ? '#f8fafc' : '#fef3c7',
            color: collapsed ? '#94a3b8' : '#d97706',
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:'.65rem', flexShrink:0, zIndex:1
          }}>
            <i className={`fa-solid fa-chevron-${collapsed ? 'right' : 'down'}`}/>
          </button>
        ) : (
          <div style={{ width:28, height:28, flexShrink:0 }}/>
        )}

        {/* Avatar */}
        <div style={{
          width:42, height:42, borderRadius:12,
          background: node.bg || '#fef3c7',
          color: node.text_color || '#92400e',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'.9rem', fontWeight:800, flexShrink:0,
          border:`2px solid ${node.text_color || '#92400e'}22`,
          boxShadow:`0 2px 8px ${node.bg || '#fef3c7'}88`,
        }}>
          {initials}
        </div>

        {/* İsim + meta */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'.9rem', color: deleted ? '#ef4444' : '#0f172a',
            display:'flex', alignItems:'center', gap:7 }}>
            {node.name}
            {deleted && <span style={{ fontSize:'.68rem', fontWeight:700, color:'#ef4444',
              background:'#fee2e2', padding:'1px 6px', borderRadius:99 }}>Silinmiş</span>}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:2, flexWrap:'wrap' }}>
            {sku && (
              <span style={{ fontFamily:'monospace', fontSize:'.72rem', fontWeight:700,
                color: skuIsDefault ? '#d97706' : '#6366f1',
                background: skuIsDefault ? '#fef3c7' : '#ede9fe',
                padding:'1px 7px', borderRadius:5 }}>
                {sku}{skuIsDefault && <sup style={{ fontSize:'.55rem', marginLeft:2 }}>sys</sup>}
              </span>
            )}
            {node.acc_cat && (
              <span style={{ fontSize:'.72rem', color:'#64748b',
                background:'#f1f5f9', padding:'1px 7px', borderRadius:5 }}>
                {node.acc_cat}
              </span>
            )}
            {node.acc_code && (
              <span style={{ fontFamily:'monospace', fontSize:'.72rem', color:'#475569',
                background:'#f1f5f9', padding:'1px 7px', borderRadius:5 }}>
                {node.acc_code}
              </span>
            )}
            {node.revenue_account_id && (
              <span style={{ fontSize:'.72rem', color:'#0369a1', background:'#e0f2fe', padding:'1px 7px', borderRadius:5 }}>
                Bagli gelir hesabi
              </span>
            )}
            {node.description && (
              <span style={{ fontSize:'.72rem', color:'#94a3b8', fontStyle:'italic' }}>
                {node.description}
              </span>
            )}
          </div>
        </div>

        {/* İşlemler */}
        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
          {!deleted && depth < 9 && (
            <button className="ico-btn" title="Alt Kategori Ekle" onClick={() => onAddChild(node.id)}
              style={{ color:'#16a34a', width:32, height:32 }}>
              <i className="fa-solid fa-plus"/>
            </button>
          )}
          {!deleted && (
            <button className="ico-btn edit" onClick={() => onEdit(node)}
              style={{ width:32, height:32 }}>
              <i className="fa-solid fa-pen"/>
            </button>
          )}
          <button className="ico-btn del" onClick={() => onDelete(node)}
            style={{ width:32, height:32 }}>
            <i className={`fa-solid fa-${deleted ? 'rotate-left' : 'trash'}`}/>
          </button>
        </div>
      </div>

      {/* Alt kategoriler */}
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child, i) => (
            <CatRow key={child.id} node={child} depth={depth + 1}
              isLast={i === node.children.length - 1}
              collapsedMap={collapsedMap} onToggle={onToggle} onEdit={onEdit}
              onDelete={onDelete} onAddChild={onAddChild} sysMask={sysMask}/>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────
export default function SaleCategories() {
  const toast = useToast()
  const [cats, setCats]         = useState([])
  const [chartAccounts, setChartAccounts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [collapsed, setCollapsed] = useState({})
  const [sysMask, setSysMask]   = useState(null)
  const [modal, setModal]       = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [editId, setEditId]     = useState(null)
  const [preParent, setPreParent] = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [skuPreview, setSkuPreview] = useState('—')
  const [showDeleted, setShowDeleted] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: cData }, { data: sData }, accountChartValue] = await Promise.all([
      db.from('sale_categories').select('*').order('name'),
      db.from('settings').select('value').eq('key', 'default_sale_sku_mask').single(),
      readSettingValue('account_chart', DEFAULT_ACCOUNT_CHART),
    ])
    const categorySnapshot = await ensureComboMenuCategory(cData || [])
    setCats(categorySnapshot.categories || sortSaleCategoriesWithComboFirst(cData || []))
    setSysMask(sData?.value || null)
    setChartAccounts(normalizeAccountChart(accountChartValue, DEFAULT_ACCOUNT_CHART))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const accountMap = useMemo(() => createChartAccountMap(chartAccounts), [chartAccounts])
  const accountOptions = useMemo(() => buildSaleCategoryAccountOptions(chartAccounts), [chartAccounts])

  // SKU preview in modal
  useEffect(() => {
    const sku = genSku(form.sku_mask, form.append_type, form.append_len)
    setSkuPreview(sku && sku !== '—' ? sku : '—')
  }, [form.sku_mask, form.append_type, form.append_len])

  const displayCats = cats.filter(c => (!c.deleted_at || showDeleted))
  const tree = buildTree(displayCats)

  function toggleNode(id) { setCollapsed(s => ({ ...s, [id]: !s[id] })) }
  function collapseAll()  { const m = {}; cats.filter(c => c.parent_id).forEach(c => m[c.id] = true); setCollapsed(m) }
  function expandAll()    { setCollapsed({}) }

  function openAdd(parentId = null) {
    setForm({ ...EMPTY_FORM, parent_id: parentId })
    setEditId(null)
    setPreParent(parentId)
    setModal(true)
  }

  function openEdit(cat) {
    setForm({
      name: cat.name, parent_id: cat.parent_id || null,
      bg: cat.bg || '#fef3c7', text_color: cat.text_color || '#92400e',
      sku_mask: cat.sku_mask || '', append_type: cat.append_type || '',
      append_len: cat.append_len || 4,
      description: cat.description || '',
      acc_cat: cat.acc_cat || '', acc_code: cat.acc_code || '',
      revenue_account_id: cat.revenue_account_id || '',
      image_url: cat.image_url || '',
    })
    setEditId(cat.id)
    setPreParent(null)
    setModal(true)
  }

  function closeModal() { setModal(false); setForm(EMPTY_FORM); setEditId(null); setPreParent(null) }

  async function save() {
    if (!form.name.trim()) { toast('Kategori adı zorunludur', 'error'); return }

    const payload = {
      name:        form.name.trim(),
      parent_id:   form.parent_id || null,
      bg:          form.bg,
      text_color:  form.text_color,
      sku_mask:    form.sku_mask.trim() || null,
      append_type: form.append_type || null,
      append_len:  parseInt(form.append_len) || 4,
      description: form.description.trim() || null,
      acc_cat:     form.acc_cat.trim() || null,
      acc_code:    form.acc_code.trim() || null,
      revenue_account_id: form.revenue_account_id || null,
      image_url:   form.image_url || null,
    }

    if (editId) {
      const { error } = await db.from('sale_categories').update(payload).eq('id', editId)
      if (error) { toast('Hata: ' + error.message, 'error'); return }
      toast(`"${payload.name}" güncellendi`, 'success')
    } else {
      const { error } = await db.from('sale_categories').insert(payload)
      if (error) { toast('Hata: ' + error.message, 'error'); return }
      toast(`"${payload.name}" eklendi`, 'success')
    }
    closeModal(); load()
  }

  async function remove(cat) {
    const { error } = await db.from('sale_categories').update({deleted_at: new Date().toISOString()}).eq('id', cat.id)
    if (error) toast('Silinemedi: ' + error.message, 'error')
    else { toast(`"${cat.name}" silindi`, 'info'); load() }
    setConfirm(null)
  }

  async function restoreItem(cat) {
    const { error } = await db.from('sale_categories').update({deleted_at: null}).eq('id', cat.id)
    if (error) toast('Geri alınamadı: ' + error.message, 'error')
    else { toast(`"${cat.name}" geri alındı`, 'success'); load() }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleRevenueAccountChange(accountId) {
    const selectedAccount = accountMap.get(accountId) || null
    const legacy = resolveLegacyAccountingFields(selectedAccount, 'Gelirler')
    setForm(current => ({
      ...current,
      revenue_account_id: accountId,
      acc_cat: legacy.accCat,
      acc_code: legacy.accCode,
    }))
  }

  // Build parent dropdown options
  const parentOpts = (() => {
    const excludeIds = editId ? getDescIds(cats, editId) : []
    return cats
      .filter(x => !excludeIds.includes(x.id))
      .filter(x => catDepth(cats, x.id) < 9)
      .map(x => ({ id: x.id, name: x.name, depth: catDepth(cats, x.id) }))
  })()
  const selectedAccount = accountMap.get(form.revenue_account_id) || null

  return (
    <div className="page-enter">
      <Header
        title="Satış Malı Kategori Yönetimi"
        subtitle="Hiyerarşik kategori ağacı — SKU maskı ve otomatik kod üretimi (max. 10 seviye)"
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
          <button className="btn-o" onClick={collapseAll}><i className="fa-solid fa-compress"/> Kapat</button>
          <button className="btn-o" onClick={expandAll}><i className="fa-solid fa-expand"/> Aç</button>
          <AddButton onClick={() => openAdd(null)} label="Kategori Ekle" />
        </>}
      />

      <DefaultMaskPanel onSaved={load}/>

      <CategoryHierarchyView
        tree={tree}
        loading={loading}
        emptyText={showDeleted ? 'Silinmis kategori yok' : 'Henuz kategori eklenmedi'}
        sectionTitle="Hiyerarsi"
        sectionSubtitle="Satis kategorisi baglari, SKU kurali ve alt kirilimlar"
        collapsedMap={collapsed}
        onToggle={toggleNode}
        onEdit={openEdit}
        onAddChild={openAdd}
        onDelete={setConfirm}
        onRestore={restoreItem}
        genSku={genSku}
        appendLabel={appendLabel}
        systemMask={sysMask}
        accountLabel="Bagli Gelir Hesabi"
        accountChipLabel="Gelir hesabi"
        getAccountName={node => accountMap.get(node.revenue_account_id)?.name || ''}
        loadingText="Yukleniyor..."
      />

      <div className="card" style={{ overflow:'hidden', padding:0, display:'none' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin"/> Yükleniyor…
          </div>
        ) : tree.length === 0 ? (
          <div className="empty" style={{ padding:48 }}>
            <i className="fa-solid fa-tags"/>
            <p>{showDeleted ? 'Silinmiş kategori yok' : 'Henüz kategori eklenmedi'}</p>
          </div>
        ) : (
          <div>
            {tree.map((node, i) => (
              <CatRow key={node.id} node={node} depth={0}
                isLast={i === tree.length - 1}
                collapsedMap={collapsed}
                onToggle={toggleNode}
                onEdit={openEdit}
                onDelete={node.deleted_at ? restoreItem : setConfirm}
                onAddChild={openAdd}
                sysMask={sysMask}/>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modal} onClose={closeModal} width={520}
        title={editId ? 'Kategori Düzenle' : preParent ? 'Alt Kategori Ekle' : 'Kategori Ekle'}
        footer={<>
          <button className="btn-g" onClick={closeModal}>İptal</button>
          <button className="btn-p" onClick={save}><i className="fa-solid fa-check"/> Kaydet</button>
        </>}>
        <div style={{ display:'grid', gap:14 }}>

          {/* Parent */}
          <div>
            <label className="f-label">Üst Kategori</label>
            <div className="sel-wrap">
              <select className="f-input" value={form.parent_id || ''} onChange={e => set('parent_id', e.target.value || null)}>
                <option value="">— Üst kategori yok (en üst seviye) —</option>
                {parentOpts.map(o => (
                  <option key={o.id} value={o.id}>{'· '.repeat(o.depth + 1)}{o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Name + Color */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'end' }}>
            <div>
              <label className="f-label">Kategori Adı <span style={{ color:'#ef4444' }}>*</span></label>
              <input className="f-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="ör. Gıda, Donuk Ürünler…"/>
            </div>
            <div>
              <label className="f-label">Renk</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', padding:'6px 0' }}>
                {COLORS.map(c => (
                  <div key={c.bg} onClick={() => { set('bg', c.bg); set('text_color', c.text) }}
                    style={{ width:26, height:26, background:c.bg, borderRadius:7, cursor:'pointer',
                      border: form.bg === c.bg ? `2px solid ${c.text}` : '2px solid transparent' }}/>
                ))}
              </div>
            </div>
          </div>

          {/* Category Image Upload */}
          <div>
            <label className="f-label">Kategori Görseli</label>
            <div style={{
              border: '1.5px dashed #cbd5e1',
              borderRadius: 14,
              background: '#f8fafc',
              padding: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              position: 'relative',
              marginTop: 6
            }}>
              <div style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {form.image_url ? (
                  <img src={form.image_url} alt="Kategori Görseli" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <i className="fa-solid fa-image" style={{ color: '#94a3b8', fontSize: '1.5rem' }} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <span style={{ fontSize: '.78rem', fontWeight: 600, color: '#475569' }}>
                  {form.image_url ? 'Kategori görseli yüklendi.' : 'Dosya seçilmedi (PNG, JPG, WEBP).'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn-p" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '.78rem', whiteSpace: 'nowrap', margin: 0 }}>
                    <i className="fa-solid fa-upload" style={{ marginRight: 4 }} /> Resim Yükle
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        try {
                          const url = await uploadFileAndGetUrl(file)
                          set('image_url', url)
                          toast('Görsel başarıyla yüklendi', 'success')
                        } catch (err) {
                          toast('Yükleme hatası: ' + err.message, 'error')
                        }
                      }
                    }} style={{ display: 'none' }} />
                  </label>
                  {form.image_url && (
                    <button type="button" className="btn-o" onClick={() => set('image_url', '')} style={{ padding: '6px 12px', fontSize: '.78rem' }}>
                      Temizle
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* SKU Mask */}
          <div>
            <label className="f-label">SKU Mask <span style={{ fontSize:'.7rem', color:'#94a3b8', fontWeight:400 }}>(isteğe bağlı sabit ön ek)</span></label>
            <input className="f-input" value={form.sku_mask} onChange={e => set('sku_mask', e.target.value.toUpperCase())} placeholder="ör. AAGG- veya YYYY-AA-"/>
            <p className="f-hint">
              <i className="fa-solid fa-circle-info" style={{ color:'#fbbf24' }}/>&nbsp;
              Tarih değişkenleri:&nbsp;
              <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>YYYY</code>&nbsp;
              <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>YY</code>&nbsp;
              <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>AA</code>&nbsp;
              <code style={{ background:'#f1f5f9', padding:'1px 5px', borderRadius:4, fontSize:'.75rem' }}>GG</code>
            </p>
          </div>

          {/* Append */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label className="f-label">Sonuna Ekle Türü</label>
              <div className="sel-wrap">
                <select className="f-input" value={form.append_type} onChange={e => set('append_type', e.target.value)}>
                  <option value="">— Yok —</option>
                  <option value="sayi">Hane Sayı</option>
                  <option value="harf">Hane Harf</option>
                  <option value="karisik">Hane Karışık</option>
                </select>
              </div>
            </div>
            <div>
              <label className="f-label">Kaç Hane</label>
              <input className="f-input" type="number" min="1" max="20" value={form.append_len} onChange={e => set('append_len', e.target.value)}/>
            </div>
          </div>

          {/* SKU Preview */}
          <div style={{ background:'#fff8f0', border:'1.5px solid #fed7aa', borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <i className="fa-solid fa-barcode" style={{ color:'#f97316', fontSize:'1rem' }}/>
            <div>
              <div style={{ fontSize:'.7rem', fontWeight:700, color:'#9a3412', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:2 }}>SKU Örnek</div>
              <div style={{ fontFamily:'monospace', fontSize:'1rem', fontWeight:800, color:'#c2410c', letterSpacing:'.05em' }}>{skuPreview}</div>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="f-label">Açıklama</label>
            <input className="f-input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Kısa açıklama…"/>
          </div>

          {/* Accounting */}
          <div style={{ borderTop:'1px dashed #e2e8f0', paddingTop:14, display:'grid', gap:12 }}>
            <div>
              <label className="f-label"><i className="fa-solid fa-book-bookmark" style={{ color:'#6366f1', marginRight:4 }}/>Bagli Gelir Hesabi</label>
              <div className="sel-wrap">
                <select className="f-input" value={form.revenue_account_id} onChange={e => handleRevenueAccountChange(e.target.value)}>
                  <option value="">Hesap secin...</option>
                  {accountOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <p className="f-hint">Bu kategoriye bagli satislar secilen gelir hesabina akar.</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr 1fr', gap:12 }}>
              <div>
                <label className="f-label"><i className="fa-solid fa-link" style={{ color:'#6366f1', marginRight:4 }}/>Secili Hesap</label>
                <input className="f-input" value={selectedAccount?.name || ''} readOnly placeholder="Hesap secildiginde burada gorunur" style={{ background:'#f8fafc', color:'#64748b' }}/>
              </div>
              <div>
                <label className="f-label"><i className="fa-solid fa-calculator" style={{ color:'#6366f1', marginRight:4 }}/>Muhasebe Kategorisi</label>
                <input className="f-input" value={form.acc_cat} readOnly placeholder="Secilen hesaptan gelir" style={{ background:'#f8fafc', color:'#64748b' }}/>
              </div>
              <div>
                <label className="f-label"><i className="fa-solid fa-hashtag" style={{ color:'#6366f1', marginRight:4 }}/>Muhasebe Hesap Kodu</label>
                <input className="f-input" value={form.acc_code} readOnly placeholder="Secilen hesaptan gelir" style={{ background:'#f8fafc', color:'#64748b' }}/>
              </div>
            </div>
          </div>

        </div>
      </Modal>

      <ConfirmDialog open={!!confirm}
        title={`"${confirm?.name}" silinsin mi?`}
        desc="Alt kategoriler de silinecektir. Bu işlem geri alınamaz."
        onConfirm={() => remove(confirm)}
        onCancel={() => setConfirm(null)}/>
    </div>
  )
}
