import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '@/lib/db'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import {
  COMBO_MENU_CATEGORY_NAME,
  ensureComboMenuCategory,
  resolveComboMenuCategory,
  sortSaleCategoriesWithComboFirst,
} from '@/lib/comboMenuCategory'
import { ensureDefaultLocationSelection, getAllBranchesLocationSelection, withDefaultLocationSelection } from '@/lib/locationDefaults'

const STEP_TABS = [
  { id: 'definition', label: 'Temel Bilgiler', icon: 'fa-circle-info', caption: 'Tanim, lokasyon ve fiyat stratejisi' },
  { id: 'groups', label: 'Grup Yapisi', icon: 'fa-layer-group', caption: 'Ana urun, alternatif ve opsiyon kurgusu' },
  { id: 'channels', label: 'Kanal Fiyatlari', icon: 'fa-cash-register', caption: 'Kanal bazli fiyat matrisi' },
  { id: 'differences', label: 'Fiyat Farklari', icon: 'fa-scale-balanced', caption: 'Alternatif urun fiyat farklari' },
  { id: 'visual', label: 'Gorsel', icon: 'fa-image', caption: 'POS ve satis kanali gorselleri' },
]

const CATEGORY_OPTIONS = [
  { value: 'menus', label: 'Menuler' },
  { value: 'featured-menus', label: 'One Cikan Menuler' },
  { value: 'family-combos', label: 'Aile Menuleri' },
]

const LOCATION_OPTIONS = [
  { value: 'all', label: 'Tum subeler' },
  { value: 'template-fastfood', label: 'Fast Food Subeleri' },
  { value: 'template-mall', label: 'AVM Subeleri' },
  { value: 'selective', label: 'Secili subeler' },
]

const STRATEGY_OPTIONS = [
  {
    value: 'percent',
    code: 'A',
    title: 'Toplam Menu Tutarina Indirim Uygula %',
    detail: 'Ilk deger tum kanallara kopyalanir, istenirse satir bazinda override edilir.',
    accent: '#7c3aed',
    bg: 'rgba(124,58,237,.08)',
    icon: 'fa-percent',
  },
  {
    value: 'fixed',
    code: 'B',
    title: 'Toplam Menu Tutarina Indirim Uygula Tutar',
    detail: 'Indirim tutari sabit girilir, son fiyat her kanal icin otomatik hesaplanir.',
    accent: '#db2777',
    bg: 'rgba(219,39,119,.08)',
    icon: 'fa-turkish-lira-sign',
  },
  {
    value: 'set-price',
    code: 'C',
    title: 'Combo Menu Satis Fiyati Belirle',
    detail: 'Kullanici net satis fiyatini yazar, sistem indirimi veya artis oranini hesaplar.',
    accent: '#ea580c',
    bg: 'rgba(234,88,12,.08)',
    icon: 'fa-tags',
  },
]

const VAT_OPTIONS = [
  { value: 'food10', label: 'Gida (%10)' },
  { value: 'food1', label: 'Gida (%1)' },
  { value: 'service20', label: 'Servis (%20)' },
]

const CHANNELS = [
  { id: 'quick-sale', label: 'Hizli Satis', icon: 'fa-bolt', offset: 0 },
  { id: 'table', label: 'Masa', icon: 'fa-bell-concierge', offset: 5 },
  { id: 'qr', label: 'QR', icon: 'fa-qrcode', offset: 10 },
  { id: 'kiosk', label: 'Kiosk', icon: 'fa-desktop', offset: 12 },
  { id: 'suitable-yemek', label: 'Suitable Yemek', icon: 'fa-utensils', offset: 15 },
  { id: 'yemek-sepeti', label: 'Yemek Sepeti', icon: 'fa-basket-shopping', offset: 18 },
  { id: 'getir', label: 'Getir', icon: 'fa-motorcycle', offset: 20 },
  { id: 'trendyol', label: 'Trendyol', icon: 'fa-bag-shopping', offset: 22 },
  { id: 'migros', label: 'Migros', icon: 'fa-cart-shopping', offset: 24 },
  { id: 'tikla-gelsin', label: 'Tikla Gelsin', icon: 'fa-truck-fast', offset: 26 },
]

const OPTION_GROUPS = [
  { id: 'sos-secimi', name: 'Sos Secimi' },
  { id: 'peynir-secimi', name: 'Peynir Secimi' },
  { id: 'icecek-buzu', name: 'Buz Tercihi' },
]

const CATEGORY_BADGES = {
  menus: { label: 'Menuler', bg: '#fef3c7', color: '#b45309' },
  'featured-menus': { label: 'One Cikan Menuler', bg: '#e0e7ff', color: '#4338ca' },
  'family-combos': { label: 'Aile Menuleri', bg: '#fee2e2', color: '#be123c' },
}

function buildChannelPrices(basePrice) {
  return CHANNELS.reduce((acc, channel) => {
    acc[channel.id] = Math.round(basePrice + channel.offset)
    return acc
  }, {})
}

const CATALOG = [
  { id: 'hamburger', name: 'Hamburger', type: 'main', prices: buildChannelPrices(160), badge: { bg: '#ffedd5', color: '#c2410c' } },
  { id: 'cheeseburger', name: 'Cheeseburger', type: 'main', prices: buildChannelPrices(170), badge: { bg: '#fef3c7', color: '#b45309' } },
  { id: 'tavuk-burger', name: 'Tavuk Burger', type: 'main', prices: buildChannelPrices(168), badge: { bg: '#dbeafe', color: '#1d4ed8' } },
  { id: 'double-burger', name: 'Double Burger', type: 'main', prices: buildChannelPrices(195), badge: { bg: '#fee2e2', color: '#be123c' } },
  { id: 'mini-burger', name: 'Mini Burger', type: 'main', prices: buildChannelPrices(145), badge: { bg: '#ede9fe', color: '#6d28d9' } },
  { id: 'small-fries', name: 'Kucuk Patates Kizartmasi', type: 'side', prices: buildChannelPrices(40), badge: { bg: '#fef3c7', color: '#a16207' } },
  { id: 'big-fries', name: 'Buyuk Patates Kizartmasi', type: 'side', prices: buildChannelPrices(50), badge: { bg: '#fde68a', color: '#92400e' } },
  { id: 'onion-rings', name: 'Sogan Halkasi', type: 'side', prices: buildChannelPrices(52), badge: { bg: '#fce7f3', color: '#9d174d' } },
  { id: 'cola', name: 'Cocacola', type: 'drink', prices: buildChannelPrices(32), badge: { bg: '#fee2e2', color: '#991b1b' } },
  { id: 'fanta', name: 'Fanta', type: 'drink', prices: buildChannelPrices(32), badge: { bg: '#ffedd5', color: '#9a3412' } },
  { id: 'lemonade', name: 'Limonata', type: 'drink', prices: buildChannelPrices(36), badge: { bg: '#ecfccb', color: '#3f6212' } },
]

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`
}

function getAllBranches(tree) {
  const result = []
  function walk(nodes) {
    for (const node of nodes || []) {
      if (node.type === 'sube') result.push({ id: String(node.id), name: node.name })
      walk(node.children || [])
    }
  }
  walk(tree)
  return result
}

function resolveMask(mask) {
  if (!mask) return ''
  const now = new Date()
  const yyyy = String(now.getFullYear())
  return mask.toUpperCase()
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g, yyyy.slice(2))
    .replace(/AA/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/GG/g, String(now.getDate()).padStart(2, '0'))
}

function genSku(mask, appendType, appendLen) {
  const len = parseInt(appendLen, 10) || 0
  if (!mask && (!appendType || !len)) return null
  const resolved = resolveMask(mask || '')
  let suffix = ''
  if (appendType && len > 0) {
    const pool = appendType === 'sayi'
      ? '0123456789'
      : appendType === 'harf'
        ? 'ABCDEFGHJKLMNPQRSTUVWXYZ'
        : '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    for (let index = 0; index < len; index += 1) suffix += pool[Math.floor(Math.random() * pool.length)]
  }
  return resolved + suffix || null
}

function catAncestry(cats, id) {
  const chain = []
  let current = cats.find(cat => String(cat.id) === String(id))
  while (current) {
    chain.unshift(current)
    current = current.parent_id ? cats.find(cat => String(cat.id) === String(current.parent_id)) : null
  }
  return chain
}

function LocationPicker({ value, onChange, branches, branchTemplates }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    function handler(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const selected = value || []
  const coveredBranchIds = new Set(
    selected.filter(item => item.type === 'template').flatMap(item => item.branchIds || [])
  )

  function toggle(type, id, name, branchIds) {
    const nextId = String(id)
    const index = selected.findIndex(item => item.type === type && String(item.id) === nextId)
    const next = index > -1
      ? selected.filter((_, itemIndex) => itemIndex !== index)
      : [...selected, { type, id: nextId, name, branchIds: branchIds || null }]
    onChange(next)
    setTimeout(() => setOpen(true), 0)
  }

  function selectAllVisible() {
    const visibleTemplates = filteredTemplates.map(template => ({
      type: 'template',
      id: String(template.id),
      name: template.name,
      branchIds: template.branch_ids || [],
    }))
    const coveredVisibleBranchIds = new Set(visibleTemplates.flatMap(item => item.branchIds || []))
    const visibleBranches = filteredBranches
      .filter(branch => !coveredVisibleBranchIds.has(String(branch.id)))
      .map(branch => ({
        type: 'branch',
        id: String(branch.id),
        name: branch.name,
        branchIds: null,
      }))

    const next = [...selected]
    for (const item of [...visibleTemplates, ...visibleBranches]) {
      const exists = next.some(entry => entry.type === item.type && String(entry.id) === String(item.id))
      if (!exists) next.push(item)
    }
    onChange(next)
    setTimeout(() => setOpen(true), 0)
  }

  const filteredTemplates = branchTemplates.filter(template => !search || template.name.toLowerCase().includes(search.toLowerCase()))
  const filteredBranches = branches.filter(branch => !search || branch.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(current => !current)}
        style={{
          border: `1.5px solid ${open ? '#fbbf24' : '#c4cdd9'}`,
          borderRadius: 10,
          padding: '9px 36px 9px 12px',
          cursor: 'pointer',
          fontSize: '.855rem',
          background: '#fff',
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 5,
          userSelect: 'none',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,.06)',
        }}
      >
        {selected.length === 0
          ? <span style={{ color: '#94a3b8' }}>Sube veya grup secin...</span>
          : selected.map(item => (
            <span
              key={`${item.type}-${item.id}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 99,
                fontSize: '.74rem',
                fontWeight: 700,
                background: item.type === 'template' ? '#ede9fe' : '#e0f2fe',
                color: item.type === 'template' ? '#5b21b6' : '#0369a1',
              }}
            >
              <i className={`fa-solid ${item.type === 'template' ? 'fa-layer-group' : 'fa-store'}`} style={{ fontSize: '.65rem' }} />
              {item.name}
              <span
                onClick={event => {
                  event.stopPropagation()
                  toggle(item.type, item.id, item.name, item.branchIds)
                }}
                style={{ cursor: 'pointer', opacity: 0.6 }}
              >
                ×
              </span>
            </span>
          ))}
      </div>
      <i className="fa-solid fa-chevron-down" style={{ position: 'absolute', right: 12, top: 14, color: '#94a3b8', fontSize: '.65rem', pointerEvents: 'none' }} />
      {open && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 'calc(100% + 4px)',
            background: '#fff',
            border: '1.5px solid #e2e8f0',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
            zIndex: 299,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 6, alignItems: 'center' }}>
            <i className="fa-solid fa-search" style={{ color: '#94a3b8', fontSize: '.75rem' }} />
            <input
              className="f-input"
              placeholder="Ara..."
              value={search}
              onChange={event => setSearch(event.target.value)}
              onClick={event => event.stopPropagation()}
              style={{ padding: '6px 10px', fontSize: '.83rem', border: 'none', outline: 'none', boxShadow: 'none', flex: 1 }}
            />
            {(filteredTemplates.length > 0 || filteredBranches.length > 0) && (
              <button
                onClick={event => {
                  event.stopPropagation()
                  selectAllVisible()
                }}
                style={{ fontSize: '.72rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-check-double" /> Tumunu Sec
              </button>
            )}
            <button
              onClick={event => {
                event.stopPropagation()
                onChange([])
                setSearch('')
              }}
              style={{ fontSize: '.72rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <i className="fa-solid fa-xmark" /> Temizle
            </button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
            {filteredTemplates.length > 0 && (
              <>
                <div style={{ padding: '6px 14px 3px', fontSize: '.68rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '.1em', textTransform: 'uppercase' }}>Sube Gruplari</div>
                {filteredTemplates.map(template => {
                  const selectedTemplate = selected.some(item => item.type === 'template' && String(item.id) === String(template.id))
                  return (
                    <div
                      key={template.id}
                      onClick={event => {
                        event.stopPropagation()
                        toggle('template', template.id, template.name, template.branch_ids || [])
                      }}
                      style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: '.84rem', background: selectedTemplate ? '#fffbeb' : 'transparent' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selectedTemplate ? '#fbbf24' : '#d1d5db'}`, background: selectedTemplate ? '#fbbf24' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selectedTemplate && <i className="fa-solid fa-check" style={{ color: '#fff', fontSize: '.6rem' }} />}
                      </div>
                      <i className="fa-solid fa-layer-group" style={{ color: '#6366f1', fontSize: '.78rem', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: selectedTemplate ? 700 : 400, color: selectedTemplate ? '#92400e' : '#334155' }}>{template.name}</span>
                      <span style={{ fontSize: '.72rem', color: '#94a3b8', background: '#f1f5f9', padding: '2px 7px', borderRadius: 99 }}>{(template.branch_ids || []).length} sube</span>
                    </div>
                  )
                })}
              </>
            )}
            {filteredBranches.length > 0 && (
              <>
                <div style={{ padding: '6px 14px 3px', fontSize: '.68rem', fontWeight: 800, color: '#94a3b8', letterSpacing: '.1em', textTransform: 'uppercase', ...(filteredTemplates.length ? { borderTop: '1px solid #f1f5f9', marginTop: 4 } : {}) }}>Subeler</div>
                {filteredBranches.map(branch => {
                  const selectedBranch = selected.some(item => item.type === 'branch' && String(item.id) === String(branch.id))
                  const covered = coveredBranchIds.has(String(branch.id))
                  if (covered) {
                    return (
                      <div key={branch.id} style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: '.83rem', opacity: 0.4, cursor: 'not-allowed' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid #e2e8f0', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i className="fa-solid fa-lock" style={{ color: '#cbd5e1', fontSize: '.55rem' }} />
                        </div>
                        <i className="fa-solid fa-store" style={{ color: '#94a3b8', fontSize: '.78rem', flexShrink: 0 }} />
                        <span style={{ flex: 1, color: '#94a3b8' }}>{branch.name}</span>
                        <span style={{ fontSize: '.68rem', color: '#cbd5e1', fontStyle: 'italic' }}>grup kapsaminda</span>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={branch.id}
                      onClick={event => {
                        event.stopPropagation()
                        toggle('branch', branch.id, branch.name, null)
                      }}
                      style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: '.84rem', background: selectedBranch ? '#fffbeb' : 'transparent' }}
                    >
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selectedBranch ? '#fbbf24' : '#d1d5db'}`, background: selectedBranch ? '#fbbf24' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selectedBranch && <i className="fa-solid fa-check" style={{ color: '#fff', fontSize: '.6rem' }} />}
                      </div>
                      <i className="fa-solid fa-store" style={{ color: '#0369a1', fontSize: '.78rem', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontWeight: selectedBranch ? 700 : 400, color: selectedBranch ? '#92400e' : '#334155' }}>{branch.name}</span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CatPicker({ cats, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef()

  useEffect(() => {
    function handler(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const selectedCat = value ? cats.find(cat => String(cat.id) === String(value)) : null
  const breadcrumb = value ? catAncestry(cats, value).map(cat => cat.name).join(' > ') : ''

  function flatten(parentId = null, depth = 0) {
    return cats
      .filter(cat => String(cat.parent_id || '') === String(parentId || ''))
      .flatMap(cat => [{ cat, depth }, ...flatten(cat.id, depth + 1)])
  }

  let items = flatten()
  if (search) {
    const matchIds = new Set(items.filter(({ cat }) => cat.name.toLowerCase().includes(search.toLowerCase())).map(({ cat }) => cat.id))
    matchIds.forEach(id => catAncestry(cats, id).forEach(cat => matchIds.add(cat.id)))
    items = items.filter(({ cat }) => matchIds.has(cat.id))
  }

  function select(catId) {
    const chain = catAncestry(cats, catId)
    let accCat = ''
    let accCode = ''
    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (!accCat && chain[index].acc_cat) accCat = chain[index].acc_cat
      if (!accCode && chain[index].acc_code) accCode = chain[index].acc_code
      if (accCat && accCode) break
    }
    onChange(catId, accCat, accCode)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div onClick={() => setOpen(current => !current)} style={{ border: `1.5px solid ${open ? '#fbbf24' : '#c4cdd9'}`, borderRadius: 10, padding: '9px 36px 9px 12px', cursor: 'pointer', fontSize: '.855rem', background: '#fff', minHeight: 40, display: 'flex', alignItems: 'center', boxShadow: 'inset 0 2px 4px rgba(0,0,0,.06)' }}>
        {selectedCat ? <span style={{ color: '#0f172a', fontWeight: 600, fontSize: '.84rem' }}>{breadcrumb}</span> : <span style={{ color: '#94a3b8' }}>Kategori secin...</span>}
      </div>
      <i className="fa-solid fa-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.65rem', pointerEvents: 'none' }} />
      {open && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 299, overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 6, alignItems: 'center' }}>
            <i className="fa-solid fa-search" style={{ color: '#94a3b8', fontSize: '.75rem' }} />
            <input className="f-input" placeholder="Kategori ara..." value={search} onChange={event => setSearch(event.target.value)} onClick={event => event.stopPropagation()} style={{ padding: '6px 10px', fontSize: '.83rem', border: 'none', outline: 'none', boxShadow: 'none', flex: 1 }} />
            <button onClick={event => { event.stopPropagation(); onChange(null, '', ''); setSearch(''); setOpen(false) }} style={{ fontSize: '.72rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
              <i className="fa-solid fa-xmark" /> Temizle
            </button>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: '6px 0' }}>
            {items.length === 0
              ? <div style={{ padding: 16, textAlign: 'center', fontSize: '.82rem', color: '#94a3b8' }}>Kategori bulunamadi</div>
              : items.map(({ cat, depth }) => {
                const isSelected = String(cat.id) === String(value)
                const hasChildren = cats.some(item => String(item.parent_id) === String(cat.id))
                return (
                  <div
                    key={cat.id}
                    onClick={event => { event.stopPropagation(); select(cat.id) }}
                    style={{ padding: `8px ${depth * 16 + 24}px 8px ${depth * 16 + 12}px`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', background: isSelected ? '#fffbeb' : 'transparent', borderLeft: `3px solid ${isSelected ? '#fbbf24' : 'transparent'}` }}
                  >
                    <i className={`fa-${hasChildren ? 'solid fa-folder' : 'regular fa-circle-dot'}`} style={{ color: hasChildren ? '#fbbf24' : '#94a3b8', fontSize: '.75rem', flexShrink: 0 }} />
                    <span style={{ flex: 1, color: isSelected ? '#b45309' : '#334155', fontWeight: isSelected ? 700 : 400 }}>{cat.name}</span>
                    {cat.acc_code && <span style={{ fontSize: '.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>{cat.acc_code}</span>}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Secim yapin...',
  searchPlaceholder = 'Ara...',
  emptyText = 'Eslesen kayit yok',
  hint,
  disabled = false,
}) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return undefined
    const handlePointer = event => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  const normalized = useMemo(
    () => (options || []).map(option => ({ ...option, id: String(option.id) })),
    [options]
  )
  const selected = normalized.find(option => option.id === String(value || '')) || null
  const filtered = normalized.filter(option => option.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label ? <label className="f-label">{label}</label> : null}
      <button
        type="button"
        className="f-input"
        disabled={disabled}
        onClick={() => !disabled && setOpen(current => !current)}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          background: disabled ? '#f8fafc' : '#fff',
          color: selected ? '#0f172a' : '#94a3b8',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.name || placeholder}
        </span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#94a3b8', fontSize: '.75rem' }} />
      </button>
      {hint ? <div className="f-hint">{hint}</div> : null}

      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 30,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            boxShadow: '0 18px 40px rgba(15,23,42,.12)',
            padding: 10,
          }}
        >
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.72rem' }} />
            <input
              className="f-input"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              style={{ paddingLeft: 30, boxShadow: 'none' }}
            />
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 4 }}>
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
                setSearch('')
              }}
              style={{
                border: 'none',
                background: '#f8fafc',
                color: '#475569',
                borderRadius: 10,
                padding: '10px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Temizle
            </button>

            {filtered.length === 0 ? (
              <div style={{ padding: '12px 10px', color: '#94a3b8', fontSize: '.8rem' }}>{emptyText}</div>
            ) : (
              filtered.map(option => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onChange(option.id)
                    setOpen(false)
                    setSearch('')
                  }}
                  style={{
                    border: option.id === selected?.id ? '1px solid #fbbf24' : '1px solid transparent',
                    background: option.id === selected?.id ? '#fffbeb' : '#fff',
                    color: '#0f172a',
                    borderRadius: 10,
                    padding: '10px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontWeight: option.id === selected?.id ? 700 : 500,
                  }}
                >
                  {option.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function formatCurrency(value) {
  const safeValue = Number.isFinite(value) ? value : 0
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(safeValue)
}

function createManualAdjustments(seedValue, channels = CHANNELS) {
  return channels.reduce((acc, channel) => {
    acc[channel.id] = seedValue
    return acc
  }, {})
}

function createAlternative(itemId, seedValue, channels = CHANNELS) {
  return {
    id: uid('alt'),
    itemId,
    manualAdjustments: createManualAdjustments(seedValue, channels),
  }
}

function createOptionLink(optionGroupId) {
  return {
    id: uid('opt'),
    optionGroupId,
  }
}

function createGroup(name, primaryItemId, alternatives = [], optionGroups = []) {
  return {
    id: uid('group'),
    name,
    primaryItemId,
    alternatives,
    optionGroups,
  }
}

function createInitialForm() {
  return {
    name: '',
    shortName: '',
    sku: '',
    autoSku: false,
    location: [],
    catId: null,
    accCat: '',
    accCode: '',
    pricingStrategy: 'set-price',
    reflectPriceDiff: false,
    defaultPercent: 20,
    defaultFixed: 25,
    defaultComboPrice: 300,
    comboOptionGroups: [],
    pos_image: '',
    pos_color: '#1e293b',
    pos_text_color: '#ffffff',
    channel_image: '',
    channel_description: '',
  }
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildInitialRecords() {
  return [
    {
      id: uid('combo'),
      sku: 'CMB-2026-0001',
      name: '2li Burger Menu',
      shortName: '2li menu',
      category: 'menus',
      active: true,
      deleted: false,
      form: createInitialForm(),
      groups: buildInitialGroups(),
      channelConfig: buildInitialChannelConfig(),
    },
    {
      id: uid('combo'),
      sku: 'CMB-2026-0002',
      name: 'Aile Burger Combo',
      shortName: 'Aile menu',
      category: 'family-combos',
      active: true,
      deleted: false,
      form: {
        ...createInitialForm(),
        name: 'Aile Burger Combo',
        shortName: 'Aile menu',
        sku: 'CMB-2026-0002',
        category: 'family-combos',
        pricingStrategy: 'percent',
        defaultPercent: 15,
      },
      groups: buildInitialGroups(),
      channelConfig: buildInitialChannelConfig(),
    },
    {
      id: uid('combo'),
      sku: 'CMB-2026-0003',
      name: 'Cocuk Menu',
      shortName: 'Mini menu',
      category: 'featured-menus',
      active: false,
      deleted: false,
      form: {
        ...createInitialForm(),
        name: 'Cocuk Menu',
        shortName: 'Mini menu',
        sku: 'CMB-2026-0003',
        category: 'featured-menus',
        pricingStrategy: 'fixed',
        defaultFixed: 20,
      },
      groups: buildInitialGroups(),
      channelConfig: buildInitialChannelConfig(),
    },
  ]
}

function buildInitialGroups() {
  return [
    createGroup(
      '1. Burger Secimi',
      'hamburger',
      [createAlternative('cheeseburger', 10), createAlternative('tavuk-burger', 0)],
      [createOptionLink('sos-secimi')]
    ),
    createGroup(
      '2. Burger Secimi',
      'hamburger',
      [createAlternative('cheeseburger', 10), createAlternative('mini-burger', 0)],
      [createOptionLink('peynir-secimi')]
    ),
    createGroup(
      'Snack Secimi',
      'small-fries',
      [createAlternative('big-fries', 10), createAlternative('onion-rings', 10)],
      []
    ),
    createGroup(
      'Icecek Secimi',
      'cola',
      [createAlternative('fanta', 0), createAlternative('lemonade', 15)],
      [createOptionLink('icecek-buzu')]
    ),
  ]
}

function buildInitialChannelConfig() {
  return CHANNELS.reduce((acc, channel) => {
    acc[channel.id] = {
      active: true,
      taxId: '',
      percent: 20,
      fixed: 25,
      comboPrice: 300,
    }
    return acc
  }, {})
}

function ModalTabButton({ tab, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 0,
        padding: '8px 4px',
        border: 'none',
        borderRadius: 8,
        fontSize: '.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        transition: '.18s ease',
        background: active ? 'linear-gradient(135deg,#f59e0b,#fbbf24)' : 'transparent',
        color: active ? '#0f172a' : '#64748b',
      }}
    >
      <i className={`fa-solid ${tab.icon}`} style={{ marginRight: 4 }} />
      {tab.label}
    </button>
  )
}

function SectionBanner({ title, hint }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 16,
        padding: '12px 16px',
        borderRadius: 12,
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        color: '#0f172a',
      }}
    >
      <div style={{ fontWeight: 800, letterSpacing: '.02em' }}>{title}</div>
      {hint ? <div style={{ fontSize: '.76rem', color: '#64748b' }}>{hint}</div> : null}
    </div>
  )
}

function MetricCard({ icon, label, value, tone = 'orange' }) {
  const tones = {
    orange: { bg: 'rgba(249,115,22,.12)', color: '#c2410c' },
    violet: { bg: 'rgba(139,92,246,.12)', color: '#6d28d9' },
    blue: { bg: 'rgba(59,130,246,.12)', color: '#1d4ed8' },
  }
  const palette = tones[tone] || tones.orange

  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 14,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: palette.bg,
          color: palette.color,
          marginBottom: 12,
        }}
      >
        <i className={`fa-solid ${icon}`} />
      </div>
      <div style={{ fontSize: '.74rem', color: '#64748b', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{value}</div>
    </div>
  )
}

function getLocationSummary(location = []) {
  if (!Array.isArray(location) || location.length === 0) return 'Lokasyon secilmedi'
  if (location.length === 1) return location[0].name || '1 lokasyon'
  return `${location.length} lokasyon`
}

function getPricingStrategyLabel(strategy) {
  if (strategy === 'percent') return 'Indirim %'
  if (strategy === 'fixed') return 'Sabit indirim'
  return 'Net fiyat'
}

export default function ComboMenu() {
  const toast = useToast()
  const notify = toast || (() => {})
  const [records, setRecords] = useState([])
  const [branches, setBranches] = useState([])
  const [branchTemplates, setBranchTemplates] = useState([])
  const [cats, setCats] = useState([])
  const [comboCategory, setComboCategory] = useState(null)
  const [saleItems, setSaleItems] = useState([])
  const [channels, setChannels] = useState([])
  const [taxes, setTaxes] = useState([])
  const [optionGroupDefs, setOptionGroupDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [defaultSalesTax, setDefaultSalesTax] = useState('')
  const [defaultSkuMask, setDefaultSkuMask] = useState(null)
  const [existingSkus, setExistingSkus] = useState(new Set())
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [showDeleted, setShowDeleted] = useState(false)
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [activeTab, setActiveTab] = useState('definition')
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [groupEditorTab, setGroupEditorTab] = useState('primary')
  const [groups, setGroups] = useState(buildInitialGroups)
  const [channelConfig, setChannelConfig] = useState(buildInitialChannelConfig)
  const [form, setForm] = useState(createInitialForm)
  const locationDefaultAppliedRef = useRef(false)

  useEffect(() => {
    if (!comboCategory?.id) return
    setForm(current => (
      current.catId === comboCategory.id
        && (current.accCat || '') === (comboCategory.acc_cat || '')
        && (current.accCode || '') === (comboCategory.acc_code || '')
        ? current
        : {
            ...current,
            catId: comboCategory.id,
            accCat: comboCategory.acc_cat || '',
            accCode: comboCategory.acc_code || '',
          }
    ))
  }, [comboCategory])

  useEffect(() => {
    if (!modal) {
      locationDefaultAppliedRef.current = false
      return
    }
    if (locationDefaultAppliedRef.current) return

    const defaultLocation = getAllBranchesLocationSelection(branchTemplates)
    if (!defaultLocation.length) return

    setForm(current => {
      if (current.location?.length) {
        locationDefaultAppliedRef.current = true
        return current
      }
      locationDefaultAppliedRef.current = true
      return { ...current, location: defaultLocation }
    })
  }, [modal, branchTemplates])

  const channelDefs = useMemo(() => {
    if (!channels.length) return CHANNELS
    const iconMap = {
      'Hızlı Satış': 'fa-bolt',
      'Hizli Satis': 'fa-bolt',
      Masa: 'fa-chair',
      QR: 'fa-qrcode',
      Kiosk: 'fa-desktop',
      'Suitable Yemek': 'fa-utensils',
      'Yemek Sepeti': 'fa-basket-shopping',
      Getir: 'fa-motorcycle',
      Trendyol: 'fa-bag-shopping',
      Migros: 'fa-cart-shopping',
      'Tıkla Gelsin': 'fa-truck-fast',
      'Tikla Gelsin': 'fa-truck-fast',
    }
    return channels.map(channel => ({
      id: String(channel.id),
      label: channel.name,
      icon: channel.icon || iconMap[channel.name] || 'fa-store',
      offset: 0,
    }))
  }, [channels])

  const saleCatalog = useMemo(() => {
    if (!saleItems.length) return CATALOG
    return saleItems.map(item => {
      const prices = {}
      for (const channel of channelDefs) {
        const match = Array.isArray(item.channel_prices)
          ? item.channel_prices.find(entry => String(entry.channel_id) === String(channel.id))
          : null
        prices[channel.id] = parseFloat(match?.price) || parseFloat(item.standard_price) || 0
      }
      const catId = item.sale_cat_l5 || item.sale_cat_l4 || item.sale_cat_l3 || item.sale_cat_l2 || item.sale_cat_l1
      const cat = cats.find(entry => String(entry.id) === String(catId))
      return {
        id: String(item.id),
        name: item.name,
        shortName: item.short_name || '',
        type: 'sale-item',
        prices,
        badge: {
          bg: cat?.bg || '#f8fafc',
          color: cat?.text_color || '#334155',
        },
      }
    })
  }, [saleItems, channelDefs, cats])

  const optionGroupsCatalog = useMemo(
    () => (optionGroupDefs.length ? optionGroupDefs.map(item => ({ id: String(item.id), name: item.name })) : OPTION_GROUPS),
    [optionGroupDefs]
  )

  const itemMap = useMemo(() => new Map(saleCatalog.map(item => [String(item.id), item])), [saleCatalog])
  const strategyMeta = STRATEGY_OPTIONS.find(option => option.value === form.pricingStrategy) || STRATEGY_OPTIONS[0]

  const buildEmptyChannelConfig = useCallback((defs = channelDefs) => {
    return defs.reduce((acc, channel) => {
      acc[String(channel.id)] = {
        active: true,
        taxId: defaultSalesTax || '',
        percent: 20,
        fixed: 25,
        comboPrice: 300,
      }
      return acc
    }, {})
  }, [channelDefs, defaultSalesTax])

  const buildSeedGroups = useCallback(() => {
    const first = saleCatalog[0]?.id || 'hamburger'
    const second = saleCatalog[1]?.id || first
    const third = saleCatalog[2]?.id || second
    const fourth = saleCatalog[3]?.id || third
    return [
      createGroup('1. Secim', first, [createAlternative(second, 0, channelDefs)], []),
      createGroup('2. Secim', second, [createAlternative(third, 0, channelDefs)], []),
      createGroup('3. Secim', third, [createAlternative(fourth, 0, channelDefs)], []),
    ]
  }, [saleCatalog, channelDefs])

  const load = useCallback(async () => {
    setLoading(true)
    const [
      comboResult,
      settingsResult,
      branchTemplatesResult,
      categoriesResult,
      saleItemsResult,
      channelsResult,
      taxesResult,
      optionGroupsResult,
      skuMaskResult,
    ] = await Promise.all([
      db.from('settings').select('value').eq('key', 'combo_menus_v1').single(),
      db.from('settings').select('value').eq('key', 'company_tree').single(),
      db.from('branch_templates').select('*').order('name'),
      db.from('sale_categories').select('*').order('name'),
      db.from('sale_items').select('id,name,short_name,sku,standard_price,channel_prices,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5').is('deleted_at', null).order('name'),
      db.from('sales_channels').select('*').is('deleted_at', null).eq('active', true).order('sort_order'),
      db.from('taxes').select('*').is('deleted_at', null).order('rate'),
      db.from('option_groups').select('id,name').is('deleted_at', null).order('name'),
      db.from('settings').select('value').eq('key', 'default_sale_sku_mask').single(),
    ])

    const companyTree = settingsResult.data?.value || []
    const fetchedChannels = (channelsResult.data || []).map(channel => ({
      id: String(channel.id),
      label: channel.name,
      icon: channel.icon || 'fa-store',
      offset: 0,
    }))

    function findSalesTax(nodes) {
      for (const node of nodes || []) {
        if (node.type === 'sirket' && node.salesTax) return node.salesTax
        const result = findSalesTax(node.children || [])
        if (result) return result
      }
      return ''
    }

    function normalizeChannelConfig(rawConfig = {}) {
      const base = (fetchedChannels.length ? fetchedChannels : CHANNELS).reduce((acc, channel) => {
        acc[String(channel.id)] = {
          active: true,
          taxId: findSalesTax(companyTree) || '',
          percent: 20,
          fixed: 25,
          comboPrice: 300,
        }
        return acc
      }, {})
      for (const key of Object.keys(rawConfig || {})) {
        base[String(key)] = {
          ...base[String(key)],
          ...rawConfig[key],
        }
      }
      return base
    }

    function normalizeGroups(rawGroups = []) {
      return (Array.isArray(rawGroups) && rawGroups.length ? rawGroups : buildInitialGroups()).map((group, groupIndex) => ({
        id: String(group.id || uid(`group-${groupIndex}`)),
        name: group.name || `Grup ${groupIndex + 1}`,
        primaryItemId: String(group.primaryItemId || saleItemsResult.data?.[0]?.id || ''),
        alternatives: (group.alternatives || []).map((alternative, alternativeIndex) => ({
          id: String(alternative.id || uid(`alt-${alternativeIndex}`)),
          itemId: String(alternative.itemId || saleItemsResult.data?.[0]?.id || ''),
          manualAdjustments: {
            ...createManualAdjustments(0, fetchedChannels.length ? fetchedChannels : CHANNELS),
            ...(alternative.manualAdjustments || {}),
          },
        })),
        optionGroups: (group.optionGroups || []).map((option, optionIndex) => ({
          id: String(option.id || uid(`opt-${optionIndex}`)),
          optionGroupId: String(option.optionGroupId || option.option_group_id || ''),
        })),
      }))
    }

    const categorySnapshot = await ensureComboMenuCategory(categoriesResult.data || [])
    const safeCats = categorySnapshot.categories || sortSaleCategoriesWithComboFirst(categoriesResult.data || [])
    const resolvedComboCategory = categorySnapshot.comboCategory || resolveComboMenuCategory(safeCats)
    const rawRecords = Array.isArray(comboResult.data?.value) ? comboResult.data.value : []
    const normalizedBranchTemplates = (branchTemplatesResult.data || []).map(item => ({ ...item, id: String(item.id) }))
    const normalizedRecords = rawRecords.map((record, index) => ({
      id: String(record.id || uid(`combo-${index}`)),
      sku: record.sku || record.form?.sku || '',
      name: record.name || record.form?.name || '',
      shortName: record.shortName || record.form?.shortName || '',
      active: record.active !== false,
      deleted: Boolean(record.deleted || record.deleted_at),
      form: {
        ...createInitialForm(),
        ...record.form,
        sku: record.form?.sku || record.sku || '',
        name: record.form?.name || record.name || '',
        shortName: record.form?.shortName || record.shortName || '',
        location: ensureDefaultLocationSelection(
          Array.isArray(record.form?.location || record.location) ? (record.form?.location || record.location) : [],
          normalizedBranchTemplates,
        ),
        catId: resolvedComboCategory?.id || record.form?.catId || record.catId || null,
        accCat: resolvedComboCategory?.acc_cat || record.form?.accCat || record.accCat || '',
        accCode: resolvedComboCategory?.acc_code || record.form?.accCode || record.accCode || '',
      },
      groups: normalizeGroups(record.groups),
      channelConfig: normalizeChannelConfig(record.channelConfig),
    }))

    setBranches(getAllBranches(companyTree))
    setBranchTemplates(normalizedBranchTemplates)
    setCats(safeCats)
    setComboCategory(resolvedComboCategory || null)
    setSaleItems((saleItemsResult.data || []).map(item => ({ ...item, id: String(item.id) })))
    setChannels(channelsResult.data || [])
    setTaxes(taxesResult.data || [])
    setOptionGroupDefs(optionGroupsResult.data || [])
    setDefaultSalesTax(findSalesTax(companyTree))
    setDefaultSkuMask(skuMaskResult.data?.value || null)
    setRecords(normalizedRecords)
    setExistingSkus(new Set([...(saleItemsResult.data || []).map(item => item.sku).filter(Boolean), ...normalizedRecords.map(item => item.sku).filter(Boolean)]))
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId(null)
      return
    }
    if (!selectedGroupId || !groups.some(group => group.id === selectedGroupId)) {
      setSelectedGroupId(groups[0].id)
    }
  }, [groups, selectedGroupId])

  const totalAlternativeCount = useMemo(
    () => groups.reduce((sum, group) => sum + group.alternatives.length, 0),
    [groups]
  )

  const quickSaleChannelId = useMemo(() => {
    const quickSaleChannel = channelDefs.find(channel => {
      const normalized = String(channel.label || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ')
        .trim()
      return normalized === 'hizli satis' || normalized === 'hızlı satış'
    })
    return quickSaleChannel?.id || channelDefs[0]?.id || 'quick-sale'
  }, [channelDefs])

  const quickSaleUndiscountedTotal = useMemo(
    () => groups.reduce((sum, group) => sum + (itemMap.get(group.primaryItemId)?.prices?.[quickSaleChannelId] || 0), 0),
    [groups, itemMap, quickSaleChannelId]
  )

  const selectedGroup = useMemo(
    () => groups.find(group => group.id === selectedGroupId) || groups[0] || null,
    [groups, selectedGroupId]
  )

  const primaryTotals = useMemo(() => {
    return channelDefs.reduce((acc, channel) => {
      acc[channel.id] = groups.reduce((sum, group) => {
        const primaryItem = itemMap.get(group.primaryItemId)
        return sum + (primaryItem?.prices?.[channel.id] || 0)
      }, 0)
      return acc
    }, {})
  }, [channelDefs, groups, itemMap])

  const pricingRows = useMemo(() => {
    return channelDefs.map(channel => {
      const config = channelConfig[channel.id] || {
        active: true,
        taxId: defaultSalesTax || '',
        percent: Number(form.defaultPercent) || 0,
        fixed: Number(form.defaultFixed) || 0,
        comboPrice: Number(form.defaultComboPrice) || 0,
      }
      const baseTotal = primaryTotals[channel.id] || 0
      const rawValue =
        form.pricingStrategy === 'percent'
          ? config.percent
          : form.pricingStrategy === 'fixed'
            ? config.fixed
            : config.comboPrice

      const safeValue = Number(rawValue) || 0
      let finalPrice = baseTotal
      if (form.pricingStrategy === 'percent') finalPrice = Math.max(baseTotal * (1 - safeValue / 100), 0)
      if (form.pricingStrategy === 'fixed') finalPrice = Math.max(baseTotal - safeValue, 0)
      if (form.pricingStrategy === 'set-price') finalPrice = safeValue

      const deltaRatio = baseTotal > 0 ? ((finalPrice - baseTotal) / baseTotal) * 100 : 0
      const directionLabel =
        deltaRatio === 0
          ? 'Ana toplamla ayni'
          : deltaRatio < 0
            ? `%${Math.abs(deltaRatio).toFixed(1)} indirim`
            : `%${deltaRatio.toFixed(1)} artis`

      return {
        channel,
        config,
        baseTotal,
        rawValue: safeValue,
        finalPrice,
        directionLabel,
      }
    })
  }, [channelConfig, channelDefs, defaultSalesTax, form.defaultComboPrice, form.defaultFixed, form.defaultPercent, form.pricingStrategy, primaryTotals])

  const visibleTabs = form.reflectPriceDiff
    ? STEP_TABS.filter(tab => tab.id !== 'differences')
    : STEP_TABS

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter(record => {
      if (!showDeleted && record.deleted) return false
      if (categoryFilter !== 'all' && String(record.form?.catId || '') !== String(categoryFilter)) return false
      if (!q) return true
      return [record.sku, record.name, record.shortName]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    })
  }, [categoryFilter, records, search, showDeleted])

  const listCategoryOptions = useMemo(() => {
    const usedIds = new Set(records.map(record => String(record.form?.catId || '')).filter(Boolean))
    return cats.filter(cat => usedIds.has(String(cat.id)))
  }, [cats, records])

  function handleExport() {
    const rows = filtered.map(record => {
      const category = cats.find(item => String(item.id) === String(record.form?.catId))
      return [
        record.sku || '',
        `"${(record.name || '').replaceAll('"', '""')}"`,
        `"${(record.shortName || '').replaceAll('"', '""')}"`,
        `"${(category?.name || '').replaceAll('"', '""')}"`,
        `"${getLocationSummary(record.form?.location).replaceAll('"', '""')}"`,
        `"${getPricingStrategyLabel(record.form?.pricingStrategy).replaceAll('"', '""')}"`,
        record.active !== false ? 'Aktif' : 'Pasif',
      ].join(',')
    })
    const csv = ['SKU,Combo Menu,Kisa Ad,Kategori,Kapsam,Fiyat Modu,Durum', ...rows].join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `combo-menu-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function addComboOptionGroup() {
    setForm(current => ({
      ...current,
      comboOptionGroups: [...(current.comboOptionGroups || []), createOptionLink('')],
    }))
  }

  function updateComboOptionGroup(optionId, optionGroupId) {
    setForm(current => ({
      ...current,
      comboOptionGroups: (current.comboOptionGroups || []).map(option =>
        option.id === optionId ? { ...option, optionGroupId } : option
      ),
    }))
  }

  function removeComboOptionGroup(optionId) {
    setForm(current => ({
      ...current,
      comboOptionGroups: (current.comboOptionGroups || []).filter(option => option.id !== optionId),
    }))
  }

  function syncDefaultValueToChannels() {
    setChannelConfig(current => {
      const next = { ...current }
      for (const channel of channelDefs) {
        next[channel.id] = { ...next[channel.id] }
        if (form.pricingStrategy === 'percent') next[channel.id].percent = Number(form.defaultPercent) || 0
        if (form.pricingStrategy === 'fixed') next[channel.id].fixed = Number(form.defaultFixed) || 0
        if (form.pricingStrategy === 'set-price') next[channel.id].comboPrice = Number(form.defaultComboPrice) || 0
      }
      return next
    })
    notify('Varsayilan strateji degeri tum kanallara kopyalandi.', 'success')
  }

  async function resolveAutoSku(catId, excludeId) {
    const currentSku = excludeId ? records.find(item => item.id === excludeId)?.sku : null
    const allSkus = new Set([...existingSkus].filter(item => item !== currentSku))
    const category = catId ? cats.find(item => String(item.id) === String(catId)) : null
    const hasCatMask = category && !!(category.sku_mask || (category.append_type && category.append_len))

    let mask = ''
    let appendType = ''
    let appendLen = 4
    if (hasCatMask) {
      mask = category.sku_mask || ''
      appendType = category.append_type || ''
      appendLen = category.append_len || 4
    } else if (defaultSkuMask) {
      mask = defaultSkuMask.mask || ''
      appendType = defaultSkuMask.appendType || ''
      appendLen = defaultSkuMask.appendLen || 4
    }

    for (let index = 0; index < 50; index += 1) {
      const sku = genSku(mask, appendType, appendLen) || `CMB-${Date.now().toString().slice(-6)}`
      if (!allSkus.has(sku)) return sku
    }
    return `CMB-${Date.now().toString().slice(-6)}`
  }

  async function toggleAutoSku(checked) {
    if (!checked) {
      setForm(current => ({ ...current, autoSku: false }))
      return
    }
    const sku = await resolveAutoSku(form.catId, editId)
    setForm(current => ({ ...current, autoSku: true, sku }))
  }

  async function handleCatChange(catId, accCat, accCode) {
    const forcedCatId = comboCategory?.id || catId
    const forcedAccCat = comboCategory?.acc_cat || accCat
    const forcedAccCode = comboCategory?.acc_code || accCode
    const next = { ...form, catId: forcedCatId, accCat: forcedAccCat, accCode: forcedAccCode }
    if (form.autoSku) next.sku = await resolveAutoSku(forcedCatId, editId)
    setForm(next)
  }

  function updateChannel(channelId, key, value) {
    setChannelConfig(current => ({
      ...current,
      [channelId]: {
        ...current[channelId],
        [key]: value,
      },
    }))
  }

  function addGroup(template) {
    const templates = {
      burger: createGroup('Yeni Burger Grubu', '', [], []),
      side: createGroup('Yeni Yan Urun Grubu', '', [], []),
      drink: createGroup('Yeni Icecek Grubu', '', [], []),
      free: createGroup('Yeni Grup', '', [], []),
    }
    const nextGroup = templates[template] || templates.free
    setGroups(current => [...current, nextGroup])
    setSelectedGroupId(nextGroup.id)
    setGroupEditorTab('primary')
    setActiveTab('groups')
  }

  function addBlankGroup() {
    addGroup('free')
  }

  function updateGroup(groupId, patch) {
    setGroups(current => current.map(group => (group.id === groupId ? { ...group, ...patch } : group)))
  }

  function removeGroup(groupId) {
    setGroups(current => current.filter(group => group.id !== groupId))
  }

  function addAlternativeToGroup(groupId) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              alternatives: [...group.alternatives, createAlternative('', 0)],
            }
          : group
      )
    )
  }

  function updateAlternative(groupId, alternativeId, patch) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              alternatives: group.alternatives.map(alternative =>
                alternative.id === alternativeId ? { ...alternative, ...patch } : alternative
              ),
            }
          : group
      )
    )
  }

  function removeAlternative(groupId, alternativeId) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              alternatives: group.alternatives.filter(alternative => alternative.id !== alternativeId),
            }
          : group
      )
    )
  }

  function addOptionGroupToGroup(groupId) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              optionGroups: [...group.optionGroups, createOptionLink('sos-secimi')],
            }
          : group
      )
    )
  }

  function updateOptionGroup(groupId, optionId, optionGroupId) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              optionGroups: group.optionGroups.map(option =>
                option.id === optionId ? { ...option, optionGroupId } : option
              ),
            }
          : group
      )
    )
  }

  function removeOptionGroup(groupId, optionId) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              optionGroups: group.optionGroups.filter(option => option.id !== optionId),
            }
          : group
      )
    )
  }

  function updateManualDifference(groupId, alternativeId, channelId, value) {
    setGroups(current =>
      current.map(group =>
        group.id === groupId
          ? {
              ...group,
              alternatives: group.alternatives.map(alternative =>
                alternative.id === alternativeId
                  ? {
                      ...alternative,
                      manualAdjustments: {
                        ...alternative.manualAdjustments,
                        [channelId]: value,
                      },
                    }
                  : alternative
              ),
            }
          : group
      )
    )
  }

  async function persistRecords(nextRecords) {
    const { error } = await db.from('settings').upsert({ key: 'combo_menus_v1', value: nextRecords })
    if (error) throw error
    setRecords(nextRecords)
  }

  async function handleSaveDraft() {
    if (!comboCategory?.id) {
      notify('Menuler kategorisi hazirlanamadi. Lutfen sayfayi yenileyip tekrar deneyin.', 'error')
      setActiveTab('definition')
      return
    }
    if (!form.name.trim()) {
      notify('Combo menu adi zorunludur.', 'error')
      setActiveTab('definition')
      return
    }
    if (!form.location?.length) {
      notify('En az bir lokasyon secmelisiniz.', 'error')
      setActiveTab('definition')
      return
    }
    if (!form.sku) {
      notify('SKU kodu zorunludur.', 'error')
      setActiveTab('definition')
      return
    }

    const payload = {
      id: editId || uid('combo'),
      sku: form.sku || `CMB-${Date.now().toString().slice(-6)}`,
      name: form.name || 'Yeni Combo Menu',
      shortName: form.shortName || '',
      active: true,
      deleted: false,
      form: cloneValue({
        ...form,
        catId: comboCategory?.id || form.catId || null,
        accCat: comboCategory?.acc_cat || form.accCat || '',
        accCode: comboCategory?.acc_code || form.accCode || '',
      }),
      groups: cloneValue(groups),
      channelConfig: cloneValue(channelConfig),
    }

    const nextRecords = (() => {
      const exists = records.some(record => record.id === payload.id)
      if (!exists) return [payload, ...records]
      return records.map(record => (record.id === payload.id ? { ...record, ...payload } : record))
    })()

    try {
      await persistRecords(nextRecords)
      setExistingSkus(new Set([...existingSkus, payload.sku].filter(Boolean)))
      setModal(false)
      notify(editId ? 'Combo menu guncellendi.' : 'Yeni combo menu listeye eklendi.', 'success')
    } catch (error) {
      notify(error.message || 'Combo menu kaydedilemedi.', 'error')
    }
  }

  function openAdd() {
    setEditId(null)
    setForm(withDefaultLocationSelection({
      ...createInitialForm(),
      catId: comboCategory?.id || null,
      accCat: comboCategory?.acc_cat || '',
      accCode: comboCategory?.acc_code || '',
    }, branchTemplates))
    setGroups([])
    setChannelConfig(buildEmptyChannelConfig())
    setSelectedGroupId(null)
    setGroupEditorTab('primary')
    setActiveTab('definition')
    setModal(true)
  }

  function openEdit(record) {
    setEditId(record.id)
    setForm(withDefaultLocationSelection(cloneValue({
      ...(record.form || createInitialForm()),
      catId: comboCategory?.id || record.form?.catId || null,
      accCat: comboCategory?.acc_cat || record.form?.accCat || '',
      accCode: comboCategory?.acc_code || record.form?.accCode || '',
    }), branchTemplates))
    setGroups(cloneValue(record.groups || buildSeedGroups()))
    setChannelConfig(cloneValue(record.channelConfig || buildEmptyChannelConfig()))
    setSelectedGroupId(record.groups?.[0]?.id || null)
    setGroupEditorTab('primary')
    setActiveTab('definition')
    setModal(true)
  }

  async function toggleDeleted(recordId) {
    const nextRecords = records.map(record =>
      record.id === recordId
        ? {
            ...record,
            deleted: !record.deleted,
          }
        : record
    )
    try {
      await persistRecords(nextRecords)
    } catch (error) {
      notify(error.message || 'Kayit guncellenemedi.', 'error')
    }
  }

  function renderDefinitionSection() {
    return (
      <>
        <SectionBanner title="Temel Bilgiler" hint="Genel tanim, lokasyon ve fiyat stratejisi" />

        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16 }}>
            <div>
              <label className="f-label">Combo Menu Adi</label>
              <input
                className="f-input"
                value={form.name}
                onChange={event => setField('name', event.target.value)}
                placeholder="Orn. 2li Burger Menu"
              />
            </div>

            <div>
              <label className="f-label">Combo Menu Kisa Adi</label>
              <input
                className="f-input"
                value={form.shortName}
                onChange={event => setField('shortName', event.target.value)}
                placeholder="Orn. 2li menu"
              />
            </div>

            <div>
              <label className="f-label">SKU</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  className="f-input"
                  value={form.sku}
                  disabled={form.autoSku}
                  onChange={event => setField('sku', event.target.value)}
                  placeholder="Serbest giris"
                  style={{ flex: 1, background: form.autoSku ? '#f8fafc' : '#fff' }}
                />
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <input type="checkbox" checked={form.autoSku} onChange={event => { void toggleAutoSku(event.target.checked) }} />
                  Otomatik
                </label>
              </div>
              <div className="f-hint">Serbest giris veya sistem tarafindan otomatik SKU maskesi ile atama.</div>
            </div>

            <div>
              <label className="f-label">Lokasyon</label>
              <LocationPicker value={form.location} onChange={value => setField('location', value)} branches={branches} branchTemplates={branchTemplates} />
              <div className="f-hint">Birden fazla sube veya sube grubu secilebilir.</div>
            </div>

            <div>
              <label className="f-label">Kategori</label>
              <div className="f-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{comboCategory?.name || COMBO_MENU_CATEGORY_NAME}</span>
                <span style={{ fontSize: '.72rem', color: '#15803d', background: 'rgba(34,197,94,.12)', padding: '4px 8px', borderRadius: 999 }}>
                  Sadece combo menuler
                </span>
              </div>
              <div className="f-hint">Tum combo menuler otomatik olarak bu kategoriye baglanir ve satis mali ekraninda bu kategori secilemez.</div>
            </div>

            <div>
              <label className="f-label">Muhasebe Kategorisi</label>
              <input className="f-input" value={form.accCat || ''} readOnly placeholder="Kategori secildiginde dolar" style={{ background: '#f8fafc', color: '#64748b' }} />
            </div>

            <div>
              <label className="f-label">Muhasebe Hesap Kodu</label>
              <input className="f-input" value={form.accCode || ''} readOnly placeholder="Kategori secildiginde dolar" style={{ background: '#f8fafc', color: '#64748b' }} />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Fiyatlandirma</div>
              <div style={{ fontSize: '.8rem', color: '#64748b' }}>
                A, B ve C kurallarindan sadece biri secilebilir. Secim, 3. sekmedeki matrisi belirler.
              </div>
            </div>
            <span
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: strategyMeta.bg,
                color: strategyMeta.accent,
                fontSize: '.75rem',
                fontWeight: 800,
              }}
            >
              Aktif kural: {strategyMeta.code}
            </span>
          </div>

          <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
            {STRATEGY_OPTIONS.map(option => (
              <label
                key={option.value}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '14px 16px',
                  borderRadius: 16,
                  cursor: 'pointer',
                  border: `1.5px solid ${form.pricingStrategy === option.value ? option.accent : '#e2e8f0'}`,
                  background: form.pricingStrategy === option.value ? option.bg : '#fff',
                }}
              >
                <input
                  type="radio"
                  name="combo-pricing-strategy"
                  checked={form.pricingStrategy === option.value}
                  onChange={() => setField('pricingStrategy', option.value)}
                  style={{ marginTop: 4 }}
                />
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: form.pricingStrategy === option.value ? option.accent : '#f8fafc',
                    color: form.pricingStrategy === option.value ? '#fff' : option.accent,
                    flexShrink: 0,
                  }}
                >
                  <i className={`fa-solid ${option.icon}`} />
                </span>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                    {option.code}. {option.title}
                  </div>
                  <div style={{ fontSize: '.8rem', color: '#64748b', lineHeight: 1.45 }}>{option.detail}</div>
                </div>
              </label>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'end' }}>
            <div>
              <label className="f-label">
                {form.pricingStrategy === 'percent'
                  ? 'Varsayilan indirim yzd.'
                  : form.pricingStrategy === 'fixed'
                    ? 'Varsayilan indirim tutari'
                    : 'Varsayilan combo satis fiyati'}
              </label>
              <input
                className="f-input"
                type="number"
                value={
                  form.pricingStrategy === 'percent'
                    ? form.defaultPercent
                    : form.pricingStrategy === 'fixed'
                      ? form.defaultFixed
                      : form.defaultComboPrice
                }
                onChange={event => {
                  const value = Number(event.target.value)
                  if (form.pricingStrategy === 'percent') setField('defaultPercent', value)
                  if (form.pricingStrategy === 'fixed') setField('defaultFixed', value)
                  if (form.pricingStrategy === 'set-price') setField('defaultComboPrice', value)
                }}
              />
              <div className="f-hint">Bu deger tek tusla tum kanal satirlarina kopyalanir.</div>
            </div>

            <button type="button" className="btn-p" onClick={syncDefaultValueToChannels}>
              <i className="fa-solid fa-arrow-right-arrow-left" /> Kanallara Kopyala
            </button>
          </div>

          <div
            style={{
              marginTop: 18,
              padding: 16,
              borderRadius: 16,
              border: '1px dashed #cbd5e1',
              background: form.reflectPriceDiff ? 'rgba(34,197,94,.08)' : 'rgba(249,115,22,.06)',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.reflectPriceDiff}
                onChange={event => {
                  const checked = event.target.checked
                  setField('reflectPriceDiff', checked)
                  if (checked && activeTab === 'differences') setActiveTab('channels')
                }}
              />
              <span style={{ fontWeight: 800, color: '#0f172a' }}>Fiyat Farkini Yansit</span>
            </label>
            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 8, lineHeight: 1.55 }}>
              Isaretliyse alternatif secimlerde ana urune gore fiyat farki otomatik yansitilir ve 4. sekme gizlenir.
              Isaretli degilse fiyat farklari kullanici tarafindan 4. sekmede manuel girilir.
            </div>
          </div>
        </div>
      </>
    )
  }

  function renderGroupsSection() {
    const group = selectedGroup
    const primaryItem = group ? itemMap.get(group.primaryItemId) : null
    const groupTabs = [
      { id: 'primary', label: 'Ana Urun' },
      { id: 'alternatives', label: 'Alternatif Urunler' },
      { id: 'options', label: 'Bagli Secenek Gruplari' },
    ]

    return (
      <>
        <SectionBanner title="Grup Yapisi" hint="Grup listesi solda, secili grup detayi sagda duzenlenir" />

        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: '.82rem', color: '#64748b' }}>
              Gruplari soldaki listeden yonetin. Her grup icin ana urun, alternatifler ve bagli secenek gruplari ayri bolumlerde duzenlenir.
            </div>
            <button type="button" className="btn-o" onClick={addComboOptionGroup}>
              <i className="fa-solid fa-layer-group" /> Combo Secenek Grubu
            </button>
            <button type="button" className="btn-p" onClick={addBlankGroup}>
              <i className="fa-solid fa-plus" /> Grup Ekle
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                  Gruplar
                </div>
                <span className="badge bgr">{groups.length} grup</span>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {groups.length === 0 ? (
                  <div style={{ padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '.82rem' }}>
                    Henuz grup eklenmedi.
                  </div>
                ) : (
                  groups.map((entry, index) => {
                    const entryPrimary = itemMap.get(entry.primaryItemId)
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedGroupId(entry.id)}
                        style={{
                          border: selectedGroupId === entry.id ? '1px solid #fbbf24' : '1px solid #e2e8f0',
                          background: selectedGroupId === entry.id ? '#fffbeb' : '#fff',
                          borderRadius: 12,
                          padding: '12px 12px',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                          {entry.name?.trim() || `Grup ${index + 1}`}
                        </div>
                        <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                          {entryPrimary?.name || 'Ana urun secilmedi'}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 14, background: '#fffbeb', borderColor: '#fde68a' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                Indirimsiz Toplam
              </div>
              <div style={{ fontSize: '.72rem', color: '#b45309', marginBottom: 10 }}>Hizli satis fiyatlari baz alinir</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(quickSaleUndiscountedTotal)}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            {!!form.comboOptionGroups?.length && (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>Combo Geneli Secenek Gruplari</div>
                    <div style={{ fontSize: '.77rem', color: '#64748b' }}>Bu secenekler tum combo menuye uygulanir ve satis akisinin sonunda sorulur.</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {form.comboOptionGroups.map(optionLink => (
                    <div key={optionLink.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
                      <SearchableSelect
                        label="Secenek Grubu"
                        value={optionLink.optionGroupId}
                        onChange={value => updateComboOptionGroup(optionLink.id, value)}
                        options={optionGroupsCatalog}
                        placeholder="Secenek grubu secin..."
                        searchPlaceholder="Secenek grubu ara..."
                      />
                      <button type="button" className="ico-btn del" onClick={() => removeComboOptionGroup(optionLink.id)} title="Secenek grubunu kaldir" style={{ marginTop: 28 }}>
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!group ? (
              <div className="card" style={{ padding: 24 }}>
                <div className="empty">
                  <i className="fa-solid fa-layer-group" />
                  <p>Detay duzenlemek icin once bir grup secin ya da yeni grup ekleyin.</p>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16, alignItems: 'start', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) auto', gap: 12, alignItems: 'end' }}>
                    <div>
                      <label className="f-label">Grup Adi</label>
                      <input
                        className="f-input"
                        value={group.name}
                        onChange={event => updateGroup(group.id, { name: event.target.value })}
                        placeholder="Orn. Icecek Secimi"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingBottom: 2 }}>
                      <span className="badge" style={{ background: '#fff7ed', color: '#c2410c' }}>{group.alternatives.length} alternatif</span>
                      <span className="badge" style={{ background: '#eff6ff', color: '#1d4ed8' }}>{group.optionGroups.length} secenek grubu</span>
                    </div>
                  </div>

                  <button type="button" className="ico-btn del" onClick={() => removeGroup(group.id)} title="Grubu kaldir">
                    <i className="fa-solid fa-trash" />
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {groupTabs.map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setGroupEditorTab(tab.id)}
                      style={{
                        border: groupEditorTab === tab.id ? '1px solid #fbbf24' : '1px solid #e2e8f0',
                        background: groupEditorTab === tab.id ? '#fffbeb' : '#fff',
                        color: groupEditorTab === tab.id ? '#92400e' : '#475569',
                        borderRadius: 10,
                        padding: '9px 12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {groupEditorTab === 'primary' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) 260px', gap: 16, alignItems: 'start' }}>
                    <div>
                      <SearchableSelect
                        label="Ana Urun"
                        value={group.primaryItemId || ''}
                        onChange={value => updateGroup(group.id, { primaryItemId: value })}
                        options={saleCatalog}
                        placeholder="Satis mali secin..."
                        searchPlaceholder="Satis mali ara..."
                        hint="Ana urun grup toplaminda referans alinir."
                      />
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
                        Secili Ana Urun
                      </div>
                      <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{primaryItem?.name || 'Urun secilmedi'}</div>
                      <div style={{ fontSize: '.78rem', color: '#64748b' }}>
                        Hizli Satis: {primaryItem ? formatCurrency(primaryItem.prices?.[quickSaleChannelId] || 0) : '—'}
                      </div>
                    </div>
                  </div>
                )}

                {groupEditorTab === 'alternatives' && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontSize: '.82rem', color: '#64748b' }}>Alternatif urunler sadece secili grup icin duzenlenir.</div>
                      <button
                        type="button"
                        className="btn-o"
                        onClick={() => addAlternativeToGroup(group.id)}
                        disabled={!group.primaryItemId}
                        style={!group.primaryItemId ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        <i className="fa-solid fa-plus" /> Alternatif Ekle
                      </button>
                    </div>

                    {!group.primaryItemId ? (
                      <div style={{ padding: 16, borderRadius: 12, border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#64748b', fontSize: '.84rem' }}>
                        Once ana urun secin.
                      </div>
                    ) : group.alternatives.length === 0 ? (
                      <div style={{ padding: 16, borderRadius: 12, border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#64748b', fontSize: '.84rem' }}>
                        Bu grupta alternatif urun yok.
                      </div>
                    ) : (
                      group.alternatives.map(alternative => {
                        const alternativeItem = itemMap.get(alternative.itemId)
                        const autoDifference = alternativeItem && primaryItem
                          ? (alternativeItem.prices[quickSaleChannelId] || 0) - (primaryItem.prices[quickSaleChannelId] || 0)
                          : 0

                        return (
                          <div key={alternative.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
                              <SearchableSelect
                                label="Alternatif Urun"
                                value={alternative.itemId || ''}
                                onChange={value => updateAlternative(group.id, alternative.id, { itemId: value })}
                                options={saleCatalog}
                                placeholder="Satis mali secin..."
                                searchPlaceholder="Satis mali ara..."
                              />
                              <button type="button" className="ico-btn del" onClick={() => removeAlternative(group.id, alternative.id)} title="Alternatifi kaldir" style={{ marginTop: 28 }}>
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                            <div style={{ marginTop: 10, fontSize: '.78rem', color: '#64748b' }}>
                              Hizli Satis farki: {autoDifference >= 0 ? '+' : ''}{formatCurrency(autoDifference)}
                              {form.reflectPriceDiff ? ' · Fark otomatik yansitilir' : ''}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}

                {groupEditorTab === 'options' && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontSize: '.82rem', color: '#64748b' }}>Bu secenek gruplari ilgili grubun seciminden sonra sorulur.</div>
                      <button type="button" className="btn-o" onClick={() => addOptionGroupToGroup(group.id)}>
                        <i className="fa-solid fa-layer-group" /> Secenek Grubu Ekle
                      </button>
                    </div>

                    {group.optionGroups.length === 0 ? (
                      <div style={{ padding: 16, borderRadius: 12, border: '1px dashed #cbd5e1', background: '#f8fafc', color: '#64748b', fontSize: '.84rem' }}>
                        Bu gruba bagli secenek grubu yok.
                      </div>
                    ) : (
                      group.optionGroups.map(optionLink => (
                        <div key={optionLink.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff' }}>
                          <SearchableSelect
                            label="Secenek Grubu"
                            value={optionLink.optionGroupId}
                            onChange={value => updateOptionGroup(group.id, optionLink.id, value)}
                            options={optionGroupsCatalog}
                            placeholder="Secenek grubu secin..."
                            searchPlaceholder="Secenek grubu ara..."
                          />
                          <button type="button" className="ico-btn del" onClick={() => removeOptionGroup(group.id, optionLink.id)} title="Secenek grubunu kaldir" style={{ marginTop: 28 }}>
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  function renderChannelsSection() {
    return (
      <>
        <SectionBanner title="Kanal Fiyatlari" hint={strategyMeta.title} />

        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(220px, 1.3fr) 92px 120px 150px 170px',
              gap: 0,
              background: '#e2e8f0',
              fontSize: '.75rem',
              fontWeight: 800,
              color: '#475569',
              letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}
          >
            <div style={{ padding: '14px 16px' }}>Satis Kanali</div>
            <div style={{ padding: '14px 16px' }}>Durum</div>
            <div style={{ padding: '14px 16px' }}>Ana Toplam</div>
            <div style={{ padding: '14px 16px' }}>
              {form.pricingStrategy === 'percent'
                ? 'Indirim %'
                : form.pricingStrategy === 'fixed'
                  ? 'Indirim Tutar'
                  : 'Menu Fiyati'}
            </div>
            <div style={{ padding: '14px 16px' }}>Sonuc</div>
          </div>

          {pricingRows.map(row => (
            <div
              key={row.channel.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 1.3fr) 92px 120px 150px 170px',
                borderTop: '1px solid #e2e8f0',
                background: row.config.active ? '#fffaf0' : '#f8fafc',
              }}
            >
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    background: 'rgba(251,191,36,.18)',
                    color: '#d97706',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className={`fa-solid ${row.channel.icon}`} />
                </span>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{row.channel.label}</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b' }}>
                    Ana secimlerin kanal bazli toplami: {formatCurrency(row.baseTotal)}
                  </div>
                </div>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center' }}>
                <label className="tog">
                  <input
                    type="checkbox"
                    checked={row.config.active}
                    onChange={event => updateChannel(row.channel.id, 'active', event.target.checked)}
                  />
                  <span className="tog-sl" />
                </label>
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', fontWeight: 800, color: '#0f172a' }}>
                {formatCurrency(row.baseTotal)}
              </div>

              <div style={{ padding: '14px 16px' }}>
                <input
                  className="f-input"
                  type="number"
                  value={row.rawValue}
                  onChange={event => {
                    const value = Number(event.target.value)
                    if (form.pricingStrategy === 'percent') updateChannel(row.channel.id, 'percent', value)
                    if (form.pricingStrategy === 'fixed') updateChannel(row.channel.id, 'fixed', value)
                    if (form.pricingStrategy === 'set-price') updateChannel(row.channel.id, 'comboPrice', value)
                  }}
                  style={{ background: row.config.active ? '#fff' : '#f8fafc' }}
                />
              </div>

              <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{formatCurrency(row.finalPrice)}</span>
                <span style={{ fontSize: '.74rem', color: row.directionLabel.includes('artis') ? '#b45309' : '#64748b' }}>
                  {row.directionLabel}
                </span>
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  function renderDifferencesSection() {
    if (form.reflectPriceDiff) {
      return (
        <>
          <SectionBanner title="Fiyat Farklari" hint="Fiyat farki otomatik yansitildigi icin bu alan gizli" />
          <div
            className="card"
            style={{
              padding: 24,
              background: 'linear-gradient(135deg,rgba(34,197,94,.08),rgba(59,130,246,.08))',
              border: '1px solid rgba(59,130,246,.15)',
            }}
          >
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Sekme 4 su an devre disi</div>
            <div style={{ color: '#475569', lineHeight: 1.6 }}>
              Fiyat Farkini Yansit secenegi acik. Alternatif urunler ana secime gore otomatik fiyat farki alip 3.
              sekmedeki kanal fiyatini bozmadan calisir.
            </div>
          </div>
        </>
      )
    }

    return (
      <>
        <SectionBanner title="Fiyat Farklari" hint="Alternatif fiyat farklarini kanal bazli manuel yonet" />

        <div className="card" style={{ padding: 18, marginBottom: 18, background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: 8 }}>Tasarlanan kural</div>
          <div style={{ fontSize: '.82rem', color: '#7c2d12', lineHeight: 1.6 }}>
            Ana secim urunlerine fiyat girilmez. Yalnizca alternatif secimlerde, kanal bazli ek fiyat veya fark tanimlanir.
            Bu alan, fiyat farki otomatik yansitilmadigi senaryo icin acilir.
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          {groups.map(group => {
            const primaryItem = itemMap.get(group.primaryItemId)
            const activeChannels = channelDefs.filter(channel => channelConfig[channel.id]?.active)
            return (
              <div key={group.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{group.name}</div>
                    <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                      Ana secim: {primaryItem?.name || 'Belirlenmedi'}
                    </div>
                  </div>
                  <span className="badge" style={{ background: '#f8fafc', color: '#475569' }}>
                    {group.alternatives.length} satir
                  </span>
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                  {group.alternatives.length === 0 && (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 14,
                        border: '1px dashed #cbd5e1',
                        color: '#64748b',
                        background: '#f8fafc',
                        fontSize: '.84rem',
                      }}
                    >
                      Alternatif urun yoksa manuel fiyat farki da tanimlanmaz.
                    </div>
                  )}

                  {group.alternatives.map(alternative => {
                    const alternativeItem = itemMap.get(alternative.itemId)
                    return (
                      <div
                        key={alternative.id}
                        style={{
                          padding: 16,
                          borderRadius: 16,
                          border: '1px solid #e2e8f0',
                          background: '#fff',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                          <span className="badge" style={{ background: alternativeItem?.badge.bg || '#f1f5f9', color: alternativeItem?.badge.color || '#334155' }}>
                            {alternativeItem?.name || 'Secilmedi'}
                          </span>
                          <span className="badge" style={{ background: '#f8fafc', color: '#475569' }}>
                            Ana urun: {primaryItem?.name || 'Secilmedi'}
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                          {activeChannels.map(channel => (
                            <div key={channel.id}>
                              <label className="f-label">{channel.label}</label>
                              <div style={{ position: 'relative' }}>
                                <input
                                  className="f-input"
                                  type="number"
                                  value={alternative.manualAdjustments[channel.id] || 0}
                                  onChange={event =>
                                    updateManualDifference(group.id, alternative.id, channel.id, Number(event.target.value))
                                  }
                                  style={{ paddingLeft: 28 }}
                                />
                                <span
                                  style={{
                                    position: 'absolute',
                                    left: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '.76rem',
                                    color: '#64748b',
                                    fontWeight: 700,
                                  }}
                                >
                                  TL
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  function renderVisualSection() {
    const posTitle = form.shortName || form.name || 'Combo Menu'
    const channelTitle = form.shortName || form.name || 'Combo Menu'
    const palette = [
      '#000000','#1e293b','#374151','#6b7280','#9ca3af','#d1d5db','#e5e7eb','#f3f4f6','#f9fafb','#ffffff',
      '#dc2626','#ea580c','#d97706','#ca8a04','#65a30d','#16a34a','#059669','#0d9488','#0891b2','#0284c7',
      '#2563eb','#4f46e5','#7c3aed','#9333ea','#c026d3','#db2777','#e11d48','#be123c','#9f1239','#7f1d1d',
      '#fca5a5','#fdba74','#fde68a','#d9f99d','#a7f3d0','#a5f3fc','#bfdbfe','#c4b5fd','#f5d0fe','#fecdd3',
      '#fef2f2','#fff7ed','#fffbeb','#f7fee7','#f0fdf4','#ecfdf5','#ecfeff','#eff6ff','#f5f3ff','#fdf4ff',
    ]

    const readImage = (key, file) => {
      if (!file) return
      const reader = new FileReader()
      reader.onload = event => setField(key, event.target?.result || '')
      reader.readAsDataURL(file)
    }

    return (
      <div style={{ display: 'grid', gap: 24 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <i className="fa-solid fa-bolt" style={{ color: '#d97706', fontSize: '.85rem' }} />
            <span style={{ fontWeight: 800, fontSize: '.9rem', color: '#0f172a' }}>POS / Hizli Satis Gorseli</span>
          </div>
          <p style={{ fontSize: '.78rem', color: '#94a3b8', marginBottom: 14 }}>
            POS ve Garson ekranindaki combo karti icin renk veya resim secin. Kisa ad kartin uzerinde goruntulenir.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 16,
                  overflow: 'hidden',
                  background: form.pos_color,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #e2e8f0',
                  flexShrink: 0,
                  position: 'relative',
                  boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                  padding: 6,
                }}
              >
                {form.pos_image ? (
                  <>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                      <img src={form.pos_image} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }} alt="" />
                    </div>
                    <div style={{ width: '100%', textAlign: 'center', paddingTop: 4 }}>
                      <span
                        style={{
                          fontSize: '.65rem',
                          fontWeight: 700,
                          color: form.pos_text_color,
                          lineHeight: 1.2,
                          display: 'block',
                          wordBreak: 'break-word',
                        }}
                      >
                        {posTitle}
                      </span>
                    </div>
                  </>
                ) : (
                  <div style={{ width: '100%', textAlign: 'center', padding: '4px 6px' }}>
                    <span
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: form.pos_text_color,
                        lineHeight: 1.3,
                        display: 'block',
                        wordBreak: 'break-word',
                      }}
                    >
                      {posTitle}
                    </span>
                  </div>
                )}
              </div>
              <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>Onizleme</span>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="f-label">Renk veya Resim</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ cursor: 'pointer' }}>
                    <span className="btn-o" style={{ fontSize: '.8rem', padding: '7px 14px' }}>
                      <i className="fa-solid fa-cloud-arrow-up" /> Resim Yukle
                    </span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={event => readImage('pos_image', event.target.files?.[0])} />
                  </label>
                  {form.pos_image && (
                    <button type="button" className="btn-g" onClick={() => setField('pos_image', '')} style={{ fontSize: '.78rem' }}>
                      <i className="fa-solid fa-xmark" /> Resmi Kaldir
                    </button>
                  )}
                </div>
                {!form.pos_image && (
                  <p style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 4 }}>
                    <i className="fa-solid fa-palette" style={{ color: '#d97706', marginRight: 4 }} />Renk secili
                  </p>
                )}
              </div>

              <div>
                <label className="f-label">Buton Rengi</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="color"
                    value={form.pos_color}
                    onChange={event => setField('pos_color', event.target.value)}
                    style={{ width: 44, height: 36, border: '1.5px solid #c4cdd9', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'none' }}
                  />
                  <input
                    className="f-input"
                    value={form.pos_color}
                    onChange={event => /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) && setField('pos_color', event.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '.85rem' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 4 }}>
                  {palette.map(color => (
                    <div
                      key={color}
                      onClick={() => setField('pos_color', color)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 4,
                        background: color,
                        cursor: 'pointer',
                        border: form.pos_color === color ? '2.5px solid #f59e0b' : '1px solid #e2e8f0',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="f-label">Metin Rengi</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={form.pos_text_color}
                    onChange={event => setField('pos_text_color', event.target.value)}
                    style={{ width: 44, height: 36, border: '1.5px solid #c4cdd9', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'none' }}
                  />
                  <input
                    className="f-input"
                    value={form.pos_text_color}
                    onChange={event => /^#[0-9a-fA-F]{0,6}$/.test(event.target.value) && setField('pos_text_color', event.target.value)}
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '.85rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setField('pos_text_color', '#ffffff')}
                    title="Beyaz metin"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#fff',
                      border: form.pos_text_color === '#ffffff' ? '2.5px solid #f59e0b' : '1.5px solid #e2e8f0',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#0f172a' }}>A</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setField('pos_text_color', '#0f172a')}
                    title="Siyah metin"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#0f172a',
                      border: form.pos_text_color === '#0f172a' ? '2.5px solid #f59e0b' : '1.5px solid #e2e8f0',
                      cursor: 'pointer',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#fff' }}>A</span>
                  </button>
                </div>
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: '.78rem' }}>
                <i className="fa-solid fa-circle-info" style={{ color: '#059669', marginTop: 1 }} />
                <span><strong>Oneri:</strong> Kare boyutlu resim kullanin</span>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#d97706', marginTop: 1 }} />
                <span><strong>Otomatik:</strong> Resimler kare seklinde ortalanir</span>
                <i className="fa-solid fa-compress-arrows-alt" style={{ color: '#dc2626', marginTop: 1 }} />
                <span><strong>Optimizasyon:</strong> Otomatik sikistirma</span>
                <span style={{ color: '#94a3b8', gridColumn: 'span 2' }}>PNG, JPG, JPEG (Max. 5MB) · Onerilen: 400x400px veya uzeri</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <i className="fa-solid fa-globe" style={{ color: '#d97706', fontSize: '.85rem' }} />
            <span style={{ fontWeight: 800, fontSize: '.9rem', color: '#0f172a' }}>Satis Kanali Gorseli</span>
          </div>
          <p style={{ fontSize: '.78rem', color: '#94a3b8', marginBottom: 14 }}>
            QR, kiosk ve diger musterinin gordugu satis kanallarinda kullanilir. Resim yuklenmezse varsayilan ikon gosterilir.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 120, height: 120, borderRadius: 16, overflow: 'hidden', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,.12)' }}>
                {form.channel_image ? (
                  <img src={form.channel_image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={channelTitle} />
                ) : (
                  <div style={{ width: '80%', height: '80%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
                      <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="5" />
                      <line x1="35" y1="30" x2="35" y2="70" stroke="white" strokeWidth="5" strokeLinecap="round" />
                      <line x1="35" y1="30" x2="32" y2="42" stroke="white" strokeWidth="4" strokeLinecap="round" />
                      <line x1="35" y1="30" x2="38" y2="42" stroke="white" strokeWidth="4" strokeLinecap="round" />
                      <line x1="62" y1="30" x2="62" y2="48" stroke="white" strokeWidth="5" strokeLinecap="round" />
                      <path d="M58 30 Q55 40 60 46 Q65 40 66 30" fill="none" stroke="white" strokeWidth="4" />
                      <line x1="62" y1="48" x2="62" y2="70" stroke="white" strokeWidth="5" strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
              <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>Onizleme</span>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="f-label">Urun Gorseli</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ cursor: 'pointer' }}>
                    <span className="btn-o" style={{ fontSize: '.8rem', padding: '7px 14px' }}>
                      <i className="fa-solid fa-cloud-arrow-up" /> Resim Yukle
                    </span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={event => readImage('channel_image', event.target.files?.[0])} />
                  </label>
                  {form.channel_image && (
                    <button type="button" className="btn-g" onClick={() => setField('channel_image', '')} style={{ fontSize: '.78rem' }}>
                      <i className="fa-solid fa-xmark" /> Resmi Kaldir
                    </button>
                  )}
                </div>
                {!form.channel_image && <p style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 4 }}>Resim yuklenmezse varsayilan ikon kullanilir.</p>}
              </div>

              <div>
                <label className="f-label">Aciklama</label>
                <textarea
                  className="f-input"
                  rows={3}
                  value={form.channel_description}
                  onChange={event => setField('channel_description', event.target.value)}
                  placeholder="Satis kanalinda goruntulenecek combo menu aciklamasi..."
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 10px', fontSize: '.78rem' }}>
                <i className="fa-solid fa-circle-info" style={{ color: '#059669', marginTop: 1 }} />
                <span><strong>Oneri:</strong> Kare boyutlu resim kullanin</span>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#d97706', marginTop: 1 }} />
                <span><strong>Otomatik:</strong> Resimler kare seklinde ortalanir</span>
                <i className="fa-solid fa-compress-arrows-alt" style={{ color: '#dc2626', marginTop: 1 }} />
                <span><strong>Optimizasyon:</strong> Otomatik sikistirma</span>
                <span style={{ color: '#94a3b8', gridColumn: 'span 2' }}>PNG, JPG, JPEG (Max. 5MB) · Onerilen: 400x400px veya uzeri</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderActiveSection() {
    if (activeTab === 'definition') return renderDefinitionSection()
    if (activeTab === 'groups') return renderGroupsSection()
    if (activeTab === 'channels') return renderChannelsSection()
    if (activeTab === 'differences') return renderDifferencesSection()
    return renderVisualSection()
  }

  return (
    <div className="page-enter">
      <Header
        title="Combo Menu"
        subtitle="Combo menu kayitlari"
        actions={
          <>
            <button type="button" className="btn-o" onClick={handleExport}>
              <i className="fa-solid fa-file-arrow-down" /> Disa Aktar
            </button>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',
              fontSize:'.83rem',fontWeight:600,color:showDeleted?'#dc2626':'#64748b',
              background:showDeleted?'#fee2e2':'#f1f5f9',padding:'7px 14px',borderRadius:10,userSelect:'none'}}>
              <label className="tog" onClick={event => event.stopPropagation()}>
                <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
                <span className="tog-sl"/>
              </label>
              Silinmisleri goster
            </label>
            <AddButton onClick={openAdd} label="Yeni Combo Menu Ekle" />
          </>
        }
      />

      <div className="card" style={{padding:14,marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'minmax(220px,2fr) minmax(190px,1fr) auto',gap:12,alignItems:'end'}}>
          <div style={{position:'relative'}}>
            <label className="f-label">Ara</label>
            <i className="fa-solid fa-search" style={{position:'absolute',left:10,bottom:13,color:'#94a3b8',fontSize:'.75rem'}}/>
            <input
              className="f-input"
              placeholder="Combo menu, kisa ad veya SKU ara..."
              style={{paddingLeft:30}}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <div>
            <label className="f-label">Kategori</label>
            <div className="sel-wrap">
              <select className="f-input" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                <option value="all">Tum kategoriler</option>
                {listCategoryOptions.map(category => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',minHeight:42,color:'#64748b',fontSize:'.82rem',fontWeight:700}}>
            {filtered.length} kayit
          </div>
        </div>
      </div>

      <div className="card" style={{overflow:'hidden'}}>
        {loading ? (
          <div style={{padding:40,textAlign:'center',color:'#94a3b8'}}>
            <i className="fa-solid fa-spinner fa-spin"/> Yukleniyor...
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th>
                <th>COMBO MENU</th>
                <th>KATEGORI</th>
                <th>KAPSAM</th>
                <th>FIYAT MODU</th>
                <th>DURUM</th>
                <th>ISLEM</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <i className="fa-solid fa-burger"/>
                      <p>Combo menu bulunamadi</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map(record => {
                  const categoryId = record.form?.catId
                  const category = cats.find(item => String(item.id) === String(categoryId))
                  const locationSummary = getLocationSummary(record.form?.location)
                  const pricingMode = getPricingStrategyLabel(record.form?.pricingStrategy)
                  return (
                    <tr key={record.id} className={record.deleted ? 'deleted' : ''}>
                      <td>
                        <span style={{fontFamily:'monospace',fontSize:'.8rem',fontWeight:700,color:'#475569'}}>
                          {record.sku || '—'}
                        </span>
                      </td>
                      <td style={{fontWeight:600,color:'#0f172a'}}>
                        <span className={record.deleted ? 'row-deleted' : ''}>{record.name}</span>
                        {record.shortName && <div style={{fontSize:'.74rem',color:'#94a3b8'}}>{record.shortName}</div>}
                      </td>
                      <td>
                        {category ? (
                          <span className="badge" style={{background:category.bg || '#f8fafc',color:category.text_color || '#334155'}}>
                            {category.name}
                          </span>
                        ) : (
                          <span style={{color:'#cbd5e1'}}>—</span>
                        )}
                      </td>
                      <td style={{color:'#475569'}}>{locationSummary}</td>
                      <td style={{color:'#475569'}}>{pricingMode}</td>
                      <td>
                        <span className={`badge ${record.active !== false ? 'bg' : 'br'}`}>
                          {record.active !== false ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td>
                        <div style={{display:'flex',gap:3}}>
                          <button className="ico-btn edit" onClick={() => openEdit(record)}>
                            <i className="fa-solid fa-pen"/>
                          </button>
                          <button
                            className="ico-btn"
                            onClick={() => { void toggleDeleted(record.id) }}
                            style={record.deleted ? {color:'#16a34a',background:'#d1fae5'} : undefined}
                            title={record.deleted ? 'Geri Al' : 'Sil'}
                          >
                            <i className={`fa-solid ${record.deleted ? 'fa-rotate-left' : 'fa-trash'}`}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-bg open">
          <div
            className="modal-box"
            style={{
              width: ['channels', 'differences'].includes(activeTab) ? 'min(95vw, 1180px)' : 'min(92vw, 1040px)',
              maxHeight:'88vh',
              display:'flex',
              flexDirection:'column',
              transition:'width .2s',
            }}
          >
            <div className="modal-head">
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:14}}>
                <div>
                  <h2 style={{fontSize:'1.05rem',fontWeight:800,color:'#0f172a',margin:0}}>
                    {editId ? (
                      <span>
                        Combo Menu Duzenle
                        {form.name && <span style={{fontWeight:400,color:'#64748b',fontSize:'.9rem'}}> - {form.name}</span>}
                      </span>
                    ) : 'Yeni Combo Menu Ekle'}
                  </h2>
                  <p style={{margin:'4px 0 0',fontSize:'.78rem',color:'#94a3b8'}}>
                    Satis Mali ekranindaki gibi kompakt sekmeli masaustu detay penceresi
                  </p>
                </div>
                <button className="ico-btn" onClick={() => setModal(false)} style={{fontSize:'1rem',color:'#64748b'}}>
                  <i className="fa-solid fa-xmark"/>
                </button>
              </div>

              <div style={{display:'flex',gap:2,background:'#dde3ec',borderRadius:10,padding:3}}>
                {visibleTabs.map(tab => (
                  <ModalTabButton
                    key={tab.id}
                    tab={tab}
                    active={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </div>
            </div>

            <div className="modal-body" style={{flex:1,overflowY:'auto'}}>
              {renderActiveSection()}
            </div>

            <div className="modal-foot" style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}>
              <div style={{fontSize:'.78rem',color:'#64748b'}}>
                {groups.length} grup, {totalAlternativeCount} alternatif
              </div>
              <div style={{display:'flex',gap:8}}>
                <button
                  type="button"
                  onClick={() => {
                    setGroups(buildInitialGroups())
                    setChannelConfig(buildInitialChannelConfig())
                    notify('Ornek combo taslagi baslangic durumuna donduruldu.', 'info')
                  }}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    color: '#334155',
                    borderRadius: 12,
                    padding: '10px 14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-rotate-left" /> Taslagi Sifirla
                </button>
                <button type="button" className="btn-p" onClick={handleSaveDraft}>
                  <i className="fa-solid fa-floppy-disk" /> Kaydet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
