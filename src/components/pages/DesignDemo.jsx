import { useState, useRef, useEffect } from 'react'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import Modal from '@/components/ui/Modal'

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'colors',     label: 'Renk Paleti' },
  { id: 'typography', label: 'Tipografi' },
  { id: 'buttons',    label: 'Butonlar' },
  { id: 'forms',      label: 'Formlar' },
  { id: 'selects',    label: 'Select / Dropdown' },
  { id: 'toggles',    label: 'Toggle / Checkbox / Radio' },
  { id: 'table',      label: 'Tablo' },
  { id: 'badges',     label: 'Badges / Chips' },
  { id: 'modal',      label: 'Modal' },
  { id: 'toast',      label: 'Toast Bildirimleri' },
  { id: 'sidenav',    label: 'Sidebar Nav' },
  { id: 'search',     label: 'Arama & Filtre' },
  { id: 'cards',      label: 'Kart Bileşenleri' },
  { id: 'progress',   label: 'Progress / Loading' },
  { id: 'empty',      label: 'Boş Durumlar' },
  { id: 'softdelete', label: 'Soft Delete' },
  { id: 'tree',       label: 'Ağaç Yapısı' },
]

const PALETTE = [
  { name: 'accent-primary', value: '#f5a623', label: 'Accent' },
  { name: 'text-strong',    value: '#111111', label: 'Text Strong' },
  { name: 'text-muted',     value: '#888888', label: 'Text Muted' },
  { name: 'surface',        value: '#ffffff', label: 'Surface' },
  { name: 'surface-2',      value: '#efefef', label: 'Surface 2' },
  { name: 'border',         value: '#e5e5e5', label: 'Border' },
  { name: 'success',        value: '#15803d', label: 'Success' },
  { name: 'success-bg',     value: '#f0fdf4', label: 'Success Bg' },
  { name: 'warning',        value: '#b45309', label: 'Warning' },
  { name: 'warning-bg',     value: '#fffbeb', label: 'Warning Bg' },
  { name: 'danger',         value: '#dc2626', label: 'Danger' },
  { name: 'danger-bg',      value: '#fef2f2', label: 'Danger Bg' },
  { name: 'brand-orange',   value: '#e8521a', label: 'Brand Orange' },
  { name: 'brand-green',    value: '#8dc63f', label: 'Brand Green' },
  { name: 'brand-navy',     value: '#00003a', label: 'Brand Navy' },
]

const FA_ICONS = [
  'fa-house', 'fa-user', 'fa-users', 'fa-gear', 'fa-chart-bar', 'fa-chart-line',
  'fa-store', 'fa-box', 'fa-box-open', 'fa-receipt', 'fa-truck', 'fa-tag',
  'fa-check', 'fa-xmark', 'fa-plus', 'fa-pen', 'fa-trash', 'fa-copy',
  'fa-eye', 'fa-search', 'fa-filter', 'fa-sort', 'fa-bars', 'fa-bell',
  'fa-star', 'fa-heart', 'fa-bolt', 'fa-circle-check', 'fa-circle-exclamation',
  'fa-circle-info', 'fa-spinner', 'fa-rotate', 'fa-location-dot', 'fa-calendar',
  'fa-clock', 'fa-arrow-up', 'fa-arrow-down', 'fa-arrow-right', 'fa-download',
  'fa-lock', 'fa-window-maximize', 'fa-magnifying-glass', 'fa-rotate-left',
  'fa-triangle-exclamation', 'fa-chevron-up', 'fa-chevron-down', 'fa-ellipsis',
]

const TABLE_ROWS = [
  { id: 1,  name: 'Margherita Pizza', category: 'Pizza',       price: 120, stock: 45,  status: 'Aktif' },
  { id: 2,  name: 'Karışık Pizza',    category: 'Pizza',       price: 150, stock: 32,  status: 'Aktif' },
  { id: 3,  name: 'Caesar Salad',     category: 'Salata',      price: 85,  stock: 0,   status: 'Pasif' },
  { id: 4,  name: 'Çorba',            category: 'Çorbalar',    price: 55,  stock: 120, status: 'Aktif' },
  { id: 5,  name: 'Hamburger Menü',   category: 'Burger',      price: 180, stock: 28,  status: 'Aktif' },
  { id: 6,  name: 'Vegan Burger',     category: 'Burger',      price: 165, stock: 15,  status: 'Aktif' },
  { id: 7,  name: 'Somon Izgara',     category: 'Ana Yemek',   price: 220, stock: 8,   status: 'Aktif' },
  { id: 8,  name: 'Köfte',            category: 'Ana Yemek',   price: 135, stock: 0,   status: 'Pasif' },
  { id: 9,  name: 'Tiramisu',         category: 'Tatlı',       price: 75,  stock: 20,  status: 'Aktif' },
  { id: 10, name: 'Cheesecake',       category: 'Tatlı',       price: 80,  stock: 18,  status: 'Aktif' },
  { id: 11, name: 'Limonata',         category: 'İçecek',      price: 35,  stock: 200, status: 'Aktif' },
  { id: 12, name: 'Ayran',            category: 'İçecek',      price: 20,  stock: 300, status: 'Aktif' },
  { id: 13, name: 'Çay',              category: 'Sıcak İçecek',price: 15,  stock: 500, status: 'Aktif' },
  { id: 14, name: 'Americano',        category: 'Kahve',       price: 45,  stock: 150, status: 'Aktif' },
  { id: 15, name: 'Latte',            category: 'Kahve',       price: 55,  stock: 140, status: 'Aktif' },
]

const TREE_DATA = [
  {
    id: 't1', label: 'Satış Yönetimi', icon: 'fa-cash-register',
    children: [
      {
        id: 't1-1', label: 'Satış Malı', icon: 'fa-utensils',
        children: [
          { id: 't1-1-1', label: 'Combo Menu', icon: 'fa-burger' },
          { id: 't1-1-2', label: 'Seçenek Grupları', icon: 'fa-layer-group' },
        ],
      },
      { id: 't1-2', label: 'Yarı Mamul', icon: 'fa-layer-group' },
      {
        id: 't1-3', label: 'Fiyatlar', icon: 'fa-tag',
        children: [
          { id: 't1-3-1', label: 'Fiyat Değişiklikleri', icon: 'fa-clock-rotate-left', disabled: true },
        ],
      },
    ],
  },
  {
    id: 't2', label: 'Stok Yönetimi', icon: 'fa-box-open',
    children: [
      { id: 't2-1', label: 'Stok Malı', icon: 'fa-cube' },
      { id: 't2-2', label: 'Stok Hareketleri', icon: 'fa-arrow-right-arrow-left' },
      { id: 't2-3', label: 'Sayım', icon: 'fa-clipboard-check' },
    ],
  },
  {
    id: 't3', label: 'Raporlar', icon: 'fa-chart-pie',
    children: [
      { id: 't3-1', label: 'Satış Raporu', icon: 'fa-chart-line' },
      { id: 't3-2', label: 'Stok Raporu', icon: 'fa-chart-bar' },
    ],
  },
]

const SOFT_DELETE_INITIAL = [
  { id: 1, name: 'Ürün A', category: 'Kategori 1', price: 100, deleted: false },
  { id: 2, name: 'Ürün B', category: 'Kategori 2', price: 200, deleted: true  },
  { id: 3, name: 'Ürün C', category: 'Kategori 1', price: 150, deleted: false },
  { id: 4, name: 'Ürün D', category: 'Kategori 3', price: 300, deleted: true  },
  { id: 5, name: 'Ürün E', category: 'Kategori 2', price: 75,  deleted: false },
]

const SEARCHABLE_OPTIONS = [
  'Margherita Pizza', 'Karışık Pizza', 'Caesar Salad', 'Hamburger Menü',
  'Vegan Burger', 'Somon Izgara', 'Cheesecake', 'Tiramisu', 'Americano', 'Latte',
]

const PAGE_SIZE = 5

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDisplayMode() {
  const [mode, setMode] = useState(
    () => document.documentElement.getAttribute('data-display-mode') || 'auto'
  )
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setMode(document.documentElement.getAttribute('data-display-mode') || 'auto')
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-display-mode'] })
    return () => obs.disconnect()
  }, [])
  return mode
}

function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0].id)
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
  }, [])
  return active
}

// ─── Small shared pieces ──────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: '.65rem', fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase',
      color: 'var(--text-muted)', margin: '0 0 14px', paddingBottom: 8,
      borderBottom: '1.5px solid var(--border)',
    }}>
      {children}
    </h2>
  )
}

function Sub({ children }) {
  return (
    <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {children}
    </div>
  )
}

function Group({ label, children, style }) {
  return (
    <div style={style}>
      {label && <Sub>{label}</Sub>}
      {children}
    </div>
  )
}

function SkeletonLine({ width = '100%', height = 13 }) {
  return (
    <div style={{
      width, height, borderRadius: 6,
      background: 'linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'dd-shimmer 1.5s infinite',
    }} />
  )
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <i className="fa-solid fa-sort" style={{ opacity: .28, fontSize: '.58rem', marginLeft: 3 }} />
  return (
    <i
      className={`fa-solid fa-sort-${sortDir === 'asc' ? 'up' : 'down'}`}
      style={{ fontSize: '.58rem', marginLeft: 3, color: 'var(--accent-primary)' }}
    />
  )
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, selectedId, onSelect, expandedIds, toggleExpand }) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedId === node.id

  return (
    <div>
      <div
        onClick={() => {
          if (node.disabled) return
          if (hasChildren) toggleExpand(node.id)
          onSelect(node.id)
        }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: `6px 12px 6px ${12 + depth * 20}px`,
          borderRadius: 8,
          cursor: node.disabled ? 'not-allowed' : 'pointer',
          opacity: node.disabled ? 0.38 : 1,
          background: isSelected ? 'var(--warning-bg)' : 'transparent',
          color: isSelected ? 'var(--accent-primary)' : 'var(--text-strong)',
          transition: 'background .12s, color .12s',
          userSelect: 'none',
        }}
      >
        <i
          className={`fa-solid ${hasChildren ? (isExpanded ? 'fa-chevron-down' : 'fa-chevron-right') : 'fa-minus'}`}
          style={{
            fontSize: '.55rem', width: 10, flexShrink: 0,
            color: 'var(--text-muted)', opacity: hasChildren ? 1 : 0.2,
          }}
        />
        <div style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: isSelected ? 'rgba(245,166,35,.2)' : 'var(--surface-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i
            className={`fa-solid ${node.icon}`}
            style={{ fontSize: '.65rem', color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          />
        </div>
        <span style={{ fontSize: '.845rem', fontWeight: isSelected ? 700 : 500, flex: 1 }}>
          {node.label}
        </span>
        {node.disabled && (
          <span className="badge bgr" style={{ fontSize: '.6rem' }}>Pasif</span>
        )}
      </div>
      {hasChildren && isExpanded && (
        <div style={{
          marginLeft: `${12 + depth * 20 + 17}px`,
          paddingLeft: 10,
          borderLeft: '1.5px solid var(--border)',
        }}>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SearchableSelect demo ─────────────────────────────────────────────────────

function SearchableSelectDemo() {
  const [query,    setQuery]    = useState('')
  const [selected, setSelected] = useState(null)
  const [open,     setOpen]     = useState(false)
  const wrapRef = useRef(null)

  const filtered = SEARCHABLE_OPTIONS.filter(o =>
    o.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    function outside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div
        className="f-input"
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
      >
        <span style={{ color: selected ? 'var(--text-strong)' : 'var(--text-muted)', fontSize: '.855rem' }}>
          {selected ?? 'Ürün seçin…'}
        </span>
        <i className="fa-solid fa-chevron-down" style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginLeft: 8, flexShrink: 0 }} />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10,
          boxShadow: '0 8px 28px rgba(0,0,0,.12)', overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--border)' }}>
            <input
              className="f-input"
              autoFocus
              type="text"
              placeholder="Ara…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ padding: '6px 10px', fontSize: '.78rem' }}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Sonuç bulunamadı
              </div>
            ) : filtered.map(opt => (
              <div
                key={opt}
                onMouseDown={() => { setSelected(opt); setOpen(false); setQuery('') }}
                style={{
                  padding: '9px 14px', fontSize: '.855rem', cursor: 'pointer',
                  color: selected === opt ? 'var(--accent-primary)' : 'var(--text-strong)',
                  background: selected === opt ? 'var(--warning-bg)' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {selected === opt && <i className="fa-solid fa-check" style={{ fontSize: '.7rem' }} />}
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DesignDemo() {
  const toast       = useToast()
  const displayMode = useDisplayMode()
  const active      = useActiveSection()

  // Buttons
  const [loadingBtn, setLoadingBtn] = useState(false)

  // Forms
  const [formToggle, setFormToggle] = useState(true)
  const [formRadio,  setFormRadio]  = useState('a')

  // Table
  const [tSearch,  setTSearch]  = useState('')
  const [tSortKey, setTSortKey] = useState('name')
  const [tSortDir, setTSortDir] = useState('asc')
  const [tPage,    setTPage]    = useState(0)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)

  // Search & filter (icon grid)
  const [iconQuery, setIconQuery] = useState('')

  // Progress
  const [progress, setProgress] = useState(65)

  // Soft delete
  const [sdRows, setSdRows] = useState(SOFT_DELETE_INITIAL)

  // Tree
  const [treeExp, setTreeExp] = useState(() => new Set(['t1', 't1-1']))
  const [treeSel, setTreeSel] = useState('t1-1-1')
  const toggleTreeExp = id => setTreeExp(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  // ── Table logic ──────────────────────────────────────────────────────────────
  const filtered = TABLE_ROWS.filter(r =>
    r.name.toLowerCase().includes(tSearch.toLowerCase()) ||
    r.category.toLowerCase().includes(tSearch.toLowerCase())
  )
  const sorted = [...filtered].sort((a, b) => {
    const dir = tSortDir === 'asc' ? 1 : -1
    if (a[tSortKey] < b[tSortKey]) return -dir
    if (a[tSortKey] > b[tSortKey]) return dir
    return 0
  })
  const pageRows  = sorted.slice(tPage * PAGE_SIZE, (tPage + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  function toggleSort(key) {
    if (tSortKey === key) setTSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setTSortKey(key); setTSortDir('asc') }
    setTPage(0)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function copyText(text) {
    navigator.clipboard.writeText(text).catch(() => {})
    toast(`Kopyalandı: ${text}`, 'success')
  }

  function simulateLoad() {
    setLoadingBtn(true)
    setTimeout(() => { setLoadingBtn(false); toast('İşlem tamamlandı!', 'success') }, 1800)
  }

  function toggleSdRow(id) {
    setSdRows(rows => rows.map(r => r.id === id ? { ...r, deleted: !r.deleted } : r))
  }

  // ── Layout ───────────────────────────────────────────────────────────────────
  const isWide = displayMode === 'wide'
  const isSafe = displayMode === '4:3-safe'

  const gridStyle = isWide
    ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 36px', alignItems: 'start' }
    : {}

  const filteredIcons = FA_ICONS.filter(ic => ic.includes(iconQuery.toLowerCase()))

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page-enter">
      <style>{`
        @keyframes dd-shimmer {
          0%   { background-position:  200% 0; }
          100% { background-position: -200% 0; }
        }
        .dd-toc-link:hover { color: var(--text-strong) !important; }
        .dd-icon-btn:hover { background: var(--surface-2) !important; }
        .dd-color-swatch:hover > div:first-child { transform: scale(1.08); box-shadow: 0 4px 16px rgba(0,0,0,.18) !important; }
        .dd-sd-row-hover:hover td { background: #fffbeb !important; }
        .dd-opt-row:hover { background: var(--surface-2) !important; }
      `}</style>

      <Header title="Design Demo" subtitle="UI bileşen kütüphanesi · geliştirme ve tasarım referansı" />

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* ── Sticky TOC ── */}
        {!isSafe && (
          <div style={{
            width: 176, flexShrink: 0,
            position: 'sticky', top: 20,
            maxHeight: 'calc(100vh - 72px)', overflowY: 'auto',
          }}>
            <div className="card" style={{ padding: '10px 0' }}>
              <div style={{
                padding: '0 13px 8px',
                fontSize: '.6rem', fontWeight: 700, letterSpacing: '.12em',
                textTransform: 'uppercase', color: 'var(--text-muted)',
              }}>
                İçindekiler
              </div>
              {SECTIONS.map(s => (
                <a
                  key={s.id}
                  className="dd-toc-link"
                  href={`#${s.id}`}
                  onClick={e => {
                    e.preventDefault()
                    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  style={{
                    display: 'block', padding: '5px 13px',
                    fontSize: '.76rem', lineHeight: 1.5, textDecoration: 'none',
                    fontWeight: active === s.id ? 700 : 500,
                    color: active === s.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                    borderLeft: `2px solid ${active === s.id ? 'var(--accent-primary)' : 'transparent'}`,
                    transition: '.12s',
                  }}
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={gridStyle}>

            {/* ════════════════════════════════════════════════════════════════
                1. RENK PALETİ
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="colors" style={{ marginBottom: 36 }}>
              <SectionTitle>Renk Paleti</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                  {PALETTE.map(c => (
                    <button
                      key={c.name}
                      type="button"
                      className="dd-color-swatch"
                      onClick={() => copyText(c.value)}
                      title={`Kopyala: ${c.value}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}
                    >
                      <div style={{
                        width: 64, height: 64, borderRadius: 12,
                        background: c.value, border: '1px solid var(--border)',
                        boxShadow: '0 2px 8px rgba(0,0,0,.08)',
                        transition: 'transform .15s, box-shadow .15s',
                      }} />
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-strong)' }}>{c.label}</div>
                        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.value}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 12, marginBottom: 0 }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: 4 }} />
                  Renk kutucuğuna tıklayarak hex değerini panoya kopyalayabilirsiniz.
                </p>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                2. TİPOGRAFİ
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="typography" style={{ marginBottom: 36 }}>
              <SectionTitle>Tipografi</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>H1 — 1.8rem / 800</h1>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>H2 — 1.35rem / 800</h2>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>H3 — 1.05rem / 700</h3>
                  <h4 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-strong)', margin: 0 }}>H4 — .9rem / 700</h4>
                  <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                  <span style={{ fontSize: '1rem', color: 'var(--text-strong)' }}>Gövde — 1rem, text-strong</span>
                  <span style={{ fontSize: '.855rem', color: 'var(--text-strong)' }}>Gövde küçük — .855rem, text-strong</span>
                  <span style={{ fontSize: '.8rem',   color: 'var(--text-muted)' }}>Yardımcı — .8rem, text-muted</span>
                  <span style={{ fontSize: '.72rem',  color: 'var(--text-muted)' }}>Etiket — .72rem, text-muted</span>
                  <span style={{ fontSize: '.65rem', fontWeight: 700, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    BÖLÜM BAŞLIĞI — uppercase + tracked
                  </span>
                  <code style={{ fontSize: '.82rem', background: 'var(--surface-2)', padding: '3px 8px', borderRadius: 6, width: 'fit-content', color: 'var(--text-strong)', fontFamily: 'monospace' }}>
                    monospace kod bloğu
                  </code>
                </div>

                <Sub>İkonlar (Font Awesome) — tıkla → kopyala</Sub>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {FA_ICONS.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      className="dd-icon-btn"
                      title={`fa-solid ${ic}`}
                      onClick={() => copyText(`fa-solid ${ic}`)}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        border: '1.5px solid var(--border)',
                        background: 'var(--surface)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-strong)', fontSize: '.88rem', transition: '.12s',
                      }}
                    >
                      <i className={`fa-solid ${ic}`} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                3. BUTONLAR
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="buttons" style={{ marginBottom: 36 }}>
              <SectionTitle>Butonlar</SectionTitle>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>

                <Group label="Primary (.btn-p)">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn-p" type="button" onClick={() => toast('Kaydedildi!', 'success')}>
                      <i className="fa-solid fa-check" /> Kaydet
                    </button>
                    <button className="btn-p" type="button" onClick={simulateLoad} style={{ minWidth: 130 }}>
                      {loadingBtn
                        ? <><i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…</>
                        : <><i className="fa-solid fa-bolt" /> Yükle (simüle)</>
                      }
                    </button>
                    <button className="btn-p" type="button" disabled style={{ opacity: .5, cursor: 'not-allowed' }}>
                      <i className="fa-solid fa-lock" /> Devre Dışı
                    </button>
                  </div>
                </Group>

                <Group label="Outlined (.btn-o)">
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn-o" type="button" onClick={() => toast('Düzenleme moduna geçildi', 'info')}>
                      <i className="fa-solid fa-pen" /> Düzenle
                    </button>
                    <button className="btn-o" type="button">
                      <i className="fa-solid fa-download" /> İndir
                    </button>
                    <button className="btn-o" type="button" disabled style={{ opacity: .5, cursor: 'not-allowed' }}>
                      <i className="fa-solid fa-lock" /> Devre Dışı
                    </button>
                  </div>
                </Group>

                <Group label="Ghost (.btn-g)">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button className="btn-g" type="button">
                      <i className="fa-solid fa-ellipsis" /> Daha Fazla
                    </button>
                    <button className="btn-g" type="button">
                      <i className="fa-solid fa-arrow-left" /> Geri
                    </button>
                  </div>
                </Group>

                <Group label="İkon Butonları (.ico-btn)">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="ico-btn" type="button" title="Görüntüle" onClick={() => toast('Görüntüle', 'info')}>
                      <i className="fa-solid fa-eye" />
                    </button>
                    <button className="ico-btn edit" type="button" title="Düzenle" onClick={() => toast('Düzenle', 'info')}>
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button className="ico-btn del" type="button" title="Sil" onClick={() => toast('Silindi', 'error')}>
                      <i className="fa-solid fa-trash" />
                    </button>
                    <button className="ico-btn" type="button" title="Kopyala" onClick={() => toast('Kopyalandı!', 'success')}>
                      <i className="fa-solid fa-copy" />
                    </button>
                  </div>
                </Group>

                <Group label="Tehlike Butonu">
                  <button
                    type="button"
                    onClick={() => toast('Kalıcı silme işlemi gerçekleşti!', 'error')}
                    style={{
                      background: 'var(--danger)', color: '#fff', fontWeight: 700,
                      borderRadius: 10, padding: '9px 18px', fontSize: '.855rem',
                      cursor: 'pointer', border: 'none',
                      display: 'inline-flex', alignItems: 'center', gap: 7, transition: '.15s',
                    }}
                  >
                    <i className="fa-solid fa-trash" /> Kalıcı Sil
                  </button>
                </Group>

              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                4. FORMLAR
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="forms" style={{ marginBottom: 36 }}>
              <SectionTitle>Formlar</SectionTitle>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="f-label">Normal Input</label>
                  <input className="f-input" type="text" placeholder="Bir şey yazın…" />
                  <span className="f-hint">Yardımcı açıklama metni buraya gelir.</span>
                </div>
                <div>
                  <label className="f-label">Disabled</label>
                  <input className="f-input" type="text" value="Değiştirilemez" disabled readOnly />
                </div>
                <div>
                  <label className="f-label">Readonly</label>
                  <input className="f-input" type="text" value="Salt okunur değer" readOnly />
                </div>
                <div>
                  <label className="f-label">Hatalı Input</label>
                  <input
                    className="f-input"
                    type="text"
                    placeholder="Bu alan zorunludur"
                    style={{ borderColor: 'var(--danger)', boxShadow: '0 0 0 3px rgba(220,38,38,.12)' }}
                  />
                  <span style={{ fontSize: '.7rem', color: 'var(--danger)', marginTop: 4, display: 'block' }}>
                    <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 4 }} />
                    Bu alan boş bırakılamaz.
                  </span>
                </div>
                <div>
                  <label className="f-label">Textarea</label>
                  <textarea className="f-input" rows={3} placeholder="Açıklama girin…" style={{ resize: 'vertical' }} />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label className="f-label">Sayı</label>
                    <input className="f-input" type="number" placeholder="0" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="f-label">Tarih</label>
                    <input className="f-input" type="date" />
                  </div>
                </div>
                <div>
                  <label className="f-label">İkon ile Input</label>
                  <div style={{ position: 'relative' }}>
                    <i className="fa-solid fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.78rem', pointerEvents: 'none' }} />
                    <input className="f-input" type="text" placeholder="Ara…" style={{ paddingLeft: 32 }} />
                  </div>
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                5. SELECT / DROPDOWN
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="selects" style={{ marginBottom: 36 }}>
              <SectionTitle>Select / Dropdown</SectionTitle>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="f-label">Standart Select</label>
                  <div className="sel-wrap">
                    <select className="f-input">
                      <option value="">Seçiniz…</option>
                      <option>Pizza</option>
                      <option>Burger</option>
                      <option>Salata</option>
                      <option>Tatlı</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="f-label">Disabled Select</label>
                  <div className="sel-wrap">
                    <select className="f-input" disabled>
                      <option>Devre dışı</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="f-label">Aranabilir Select — ismi kopyalanır, filtre içerir, FA ikon</label>
                  <SearchableSelectDemo />
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                6. TOGGLE / CHECKBOX / RADIO
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="toggles" style={{ marginBottom: 36 }}>
              <SectionTitle>Toggle / Checkbox / Radio</SectionTitle>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>

                <Group label="Toggle (.tog)">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { label: 'Kapalı',       checked: false,       onChange: undefined },
                      { label: 'Açık',         checked: true,        onChange: undefined },
                      { label: 'Bağlı durum',  checked: formToggle,  onChange: () => setFormToggle(v => !v) },
                    ].map(({ label, checked, onChange }, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <label className="tog">
                          <input type="checkbox" checked={checked} onChange={onChange ?? (() => {})} readOnly={!onChange} />
                          <span className="tog-sl" />
                        </label>
                        <span style={{ fontSize: '.855rem', color: 'var(--text-strong)' }}>{label}</span>
                      </label>
                    ))}
                  </div>
                </Group>

                <Group label="Checkbox">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {['Seçenek A', 'Seçenek B (seçili)', 'Seçenek C (devre dışı)'].map((opt, i) => (
                      <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: i === 2 ? 'not-allowed' : 'pointer', opacity: i === 2 ? .45 : 1 }}>
                        <input
                          type="checkbox"
                          defaultChecked={i === 1}
                          disabled={i === 2}
                          style={{ width: 15, height: 15, accentColor: 'var(--accent-primary)', cursor: 'inherit' }}
                        />
                        <span style={{ fontSize: '.855rem', color: 'var(--text-strong)' }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                </Group>

                <Group label="Radio">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[
                      { value: 'a', label: 'Seçenek A' },
                      { value: 'b', label: 'Seçenek B' },
                      { value: 'c', label: 'Seçenek C (devre dışı)', disabled: true },
                    ].map(opt => (
                      <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: opt.disabled ? 'not-allowed' : 'pointer', opacity: opt.disabled ? .45 : 1 }}>
                        <input
                          type="radio"
                          name="dd-radio"
                          value={opt.value}
                          checked={formRadio === opt.value}
                          onChange={() => !opt.disabled && setFormRadio(opt.value)}
                          disabled={opt.disabled}
                          style={{ width: 15, height: 15, accentColor: 'var(--accent-primary)', cursor: 'inherit' }}
                        />
                        <span style={{ fontSize: '.855rem', color: 'var(--text-strong)' }}>{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </Group>

              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                7. TABLO
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="table" style={{ marginBottom: 36 }}>
              <SectionTitle>Tablo</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                {/* Toolbar */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.75rem', pointerEvents: 'none' }} />
                    <input
                      className="f-input"
                      type="text"
                      placeholder="Ürün veya kategori ara…"
                      value={tSearch}
                      onChange={e => { setTSearch(e.target.value); setTPage(0) }}
                      style={{ paddingLeft: 30, paddingTop: 7, paddingBottom: 7 }}
                    />
                  </div>
                  <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {filtered.length} kayıt
                  </span>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl data-table">
                    <thead>
                      <tr>
                        {[
                          { key: 'name',     label: 'Ürün Adı'  },
                          { key: 'category', label: 'Kategori'  },
                          { key: 'price',    label: 'Fiyat'     },
                          { key: 'stock',    label: 'Stok'      },
                          { key: 'status',   label: 'Durum'     },
                        ].map(col => (
                          <th
                            key={col.key}
                            onClick={() => toggleSort(col.key)}
                            style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                          >
                            {col.label}
                            <SortIcon col={col.key} sortKey={tSortKey} sortDir={tSortDir} />
                          </th>
                        ))}
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
                            <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '1.4rem', display: 'block', marginBottom: 8 }} />
                            Arama sonucu bulunamadı.
                          </td>
                        </tr>
                      ) : pageRows.map(row => (
                        <tr key={row.id}>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td>{row.category}</td>
                          <td>₺{row.price.toLocaleString('tr-TR')}</td>
                          <td>
                            {row.stock === 0
                              ? <span className="badge br"><i className="fa-solid fa-circle-xmark" /> Tükendi</span>
                              : row.stock
                            }
                          </td>
                          <td>
                            <span className={`badge ${row.status === 'Aktif' ? 'bg' : 'bgr'}`}>
                              {row.status}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="ico-btn edit" type="button" title="Düzenle" onClick={() => toast(`${row.name} düzenleniyor`, 'info')}>
                                <i className="fa-solid fa-pen" />
                              </button>
                              <button className="ico-btn del" type="button" title="Sil" onClick={() => toast(`${row.name} silindi`, 'error')}>
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                    <button
                      className="btn-o"
                      type="button"
                      style={{ padding: '6px 12px', fontSize: '.78rem' }}
                      disabled={tPage === 0}
                      onClick={() => setTPage(p => p - 1)}
                    >
                      <i className="fa-solid fa-chevron-left" /> Önceki
                    </button>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                      {tPage + 1} / {totalPages}
                    </span>
                    <button
                      className="btn-o"
                      type="button"
                      style={{ padding: '6px 12px', fontSize: '.78rem' }}
                      disabled={tPage >= totalPages - 1}
                      onClick={() => setTPage(p => p + 1)}
                    >
                      Sonraki <i className="fa-solid fa-chevron-right" />
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                8. BADGES / CHIPS
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="badges" style={{ marginBottom: 36 }}>
              <SectionTitle>Badges / Chips</SectionTitle>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>

                <Group label="Durum rozetleri (.badge)">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge bg"><i className="fa-solid fa-check-circle" /> Aktif</span>
                    <span className="badge br"><i className="fa-solid fa-circle-xmark" /> Pasif</span>
                    <span className="badge by"><i className="fa-solid fa-clock" /> Beklemede</span>
                    <span className="badge bb"><i className="fa-solid fa-circle-info" /> Bilgi</span>
                    <span className="badge bgr"><i className="fa-solid fa-ban" /> Arşiv</span>
                  </div>
                </Group>

                <Group label="Kategori chip'leri">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['Pizza', 'Burger', 'Salata', 'Tatlı', 'İçecek', 'Kahve'].map(cat => (
                      <span key={cat} style={{
                        padding: '4px 12px', borderRadius: 999,
                        background: 'var(--surface-2)', border: '1.5px solid var(--border)',
                        fontSize: '.72rem', fontWeight: 600, color: 'var(--text-strong)',
                        cursor: 'pointer',
                      }}>
                        {cat}
                      </span>
                    ))}
                  </div>
                </Group>

                <Group label="Sayaç rozetleri">
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { label: 'Siparişler', count: 12, cls: 'bb' },
                      { label: 'Bekleyen',   count: 5,  cls: 'by' },
                      { label: 'Hata',       count: 3,  cls: 'br' },
                      { label: 'Başarılı',   count: 48, cls: 'bg' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{item.label}</span>
                        <span className={`badge ${item.cls}`}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </Group>

              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                9. MODAL
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="modal" style={{ marginBottom: 36 }}>
              <SectionTitle>Modal</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <p style={{ fontSize: '.855rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                  <code style={{ background: 'var(--surface-2)', padding: '1px 7px', borderRadius: 5, fontSize: '.78rem' }}>{'<Modal>'}</code> bileşeni başlık, alt başlık, içerik ve footer slot'larına sahiptir.
                  Backdrop bulanık efekt ile belirir.
                </p>
                <button className="btn-p" type="button" onClick={() => setModalOpen(true)}>
                  <i className="fa-solid fa-window-maximize" /> Modal Aç
                </button>

                <Modal
                  open={modalOpen}
                  onClose={() => setModalOpen(false)}
                  title="Örnek Modal"
                  subtitle="Bu bir tasarım demo modalidir"
                  footer={
                    <>
                      <button className="btn-o" type="button" onClick={() => setModalOpen(false)}>İptal</button>
                      <button
                        className="btn-p"
                        type="button"
                        onClick={() => { setModalOpen(false); toast('Kaydedildi!', 'success') }}
                      >
                        Kaydet
                      </button>
                    </>
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label className="f-label">Ürün Adı</label>
                      <input className="f-input" type="text" placeholder="Ürün adı girin" />
                    </div>
                    <div>
                      <label className="f-label">Kategori</label>
                      <div className="sel-wrap">
                        <select className="f-input">
                          <option value="">Seçiniz…</option>
                          <option>Pizza</option>
                          <option>Burger</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="f-label">Açıklama</label>
                      <textarea className="f-input" rows={3} placeholder="Açıklama…" />
                    </div>
                  </div>
                </Modal>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                10. TOAST BİLDİRİMLERİ
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="toast" style={{ marginBottom: 36 }}>
              <SectionTitle>Toast Bildirimleri</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
                  Sağ alt köşede 3.2 saniye görünür; üç türü vardır.
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
                  <button className="btn-p" type="button" onClick={() => toast('İşlem başarıyla tamamlandı!', 'success')}>
                    <i className="fa-solid fa-check-circle" /> Success
                  </button>
                  <button
                    className="btn-o"
                    type="button"
                    style={{ borderColor: '#fca5a5', color: 'var(--danger)' }}
                    onClick={() => toast('Bir hata oluştu. Lütfen tekrar deneyin.', 'error')}
                  >
                    <i className="fa-solid fa-circle-exclamation" /> Error
                  </button>
                  <button className="btn-o" type="button" onClick={() => toast('Bilgilendirme mesajı.', 'info')}>
                    <i className="fa-solid fa-circle-info" /> Info
                  </button>
                </div>
                <Sub>Statik önizleme</Sub>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="toast success" style={{ position: 'static', animation: 'none', minWidth: 0, width: 'fit-content' }}>
                    <i className="fa-solid fa-check-circle" /> İşlem başarıyla tamamlandı!
                  </div>
                  <div className="toast error" style={{ position: 'static', animation: 'none', minWidth: 0, width: 'fit-content' }}>
                    <i className="fa-solid fa-circle-exclamation" /> Bir hata oluştu.
                  </div>
                  <div className="toast info" style={{ position: 'static', animation: 'none', minWidth: 0, width: 'fit-content' }}>
                    <i className="fa-solid fa-circle-info" /> Bilgilendirme mesajı.
                  </div>
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                11. SIDEBAR NAV
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="sidenav" style={{ marginBottom: 36 }}>
              <SectionTitle>Sidebar Nav</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ background: 'var(--sidebar-bg)', borderRadius: 12, padding: '8px 0', maxWidth: 230 }}>
                  <div className="sec-lbl">
                    <span>Ana Menü</span>
                    <span className="sec-lbl-line" />
                  </div>
                  {[
                    { icon: 'fa-house',    label: 'Dashboard', active: true  },
                    { icon: 'fa-box',      label: 'Ürünler',   active: false },
                    { icon: 'fa-chart-bar',label: 'Raporlar',  active: false },
                    { icon: 'fa-users',    label: 'Personel',  active: false },
                  ].map(item => (
                    <div key={item.label} className={`nav-item ${item.active ? 'on' : ''}`}>
                      <div className="nav-icon-box">
                        <i className={`fa-solid ${item.icon}`} />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  ))}
                  <div className="sec-lbl" style={{ marginTop: 4 }}>
                    <span>Sistem</span>
                    <span className="sec-lbl-line" />
                  </div>
                  {[
                    { icon: 'fa-gear',                       label: 'Ayarlar' },
                    { icon: 'fa-arrow-right-from-bracket',   label: 'Çıkış'   },
                  ].map(item => (
                    <div key={item.label} className="nav-item">
                      <div className="nav-icon-box">
                        <i className={`fa-solid ${item.icon}`} />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                12. ARAMA & FİLTRE
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="search" style={{ marginBottom: 36 }}>
              <SectionTitle>Arama & Filtre</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ position: 'relative' }}>
                    <i className="fa-solid fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.78rem', pointerEvents: 'none' }} />
                    <input
                      className="f-input"
                      type="text"
                      placeholder="İkon adıyla filtrele…"
                      value={iconQuery}
                      onChange={e => setIconQuery(e.target.value)}
                      style={{ paddingLeft: 32 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {filteredIcons.length === 0 ? (
                    <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Sonuç bulunamadı.</span>
                  ) : filteredIcons.map(ic => (
                    <button
                      key={ic}
                      type="button"
                      className="dd-icon-btn"
                      title={`fa-solid ${ic} — kopyala`}
                      onClick={() => copyText(`fa-solid ${ic}`)}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        border: '1.5px solid var(--border)',
                        background: 'var(--surface)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-strong)', fontSize: '.88rem', transition: '.12s',
                      }}
                    >
                      <i className={`fa-solid ${ic}`} />
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
                  {filteredIcons.length} sonuç · üzerine tıklayarak class adını kopyalayın
                </p>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                13. KART BİLEŞENLERİ
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="cards" style={{ marginBottom: 36 }}>
              <SectionTitle>Kart Bileşenleri</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Stat kartları */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Toplam Sipariş', value: '1.248',   icon: 'fa-receipt',   color: '#6366f1', bg: '#eef2ff' },
                    { label: 'Günlük Ciro',    value: '₺24.500', icon: 'fa-chart-line', color: '#10b981', bg: '#f0fdf4' },
                    { label: 'Aktif Ürün',     value: '142',     icon: 'fa-box',        color: 'var(--accent-primary)', bg: 'var(--warning-bg)' },
                    { label: 'Bekleyen',       value: '7',       icon: 'fa-clock',      color: 'var(--danger)',         bg: 'var(--danger-bg)'  },
                  ].map(stat => (
                    <div key={stat.label} className="card" style={{ flex: '1 1 140px', padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <span style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                          {stat.label}
                        </span>
                        <div style={{ width: 30, height: 30, borderRadius: 7, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color, fontSize: '.82rem' }}>
                          <i className={`fa-solid ${stat.icon}`} />
                        </div>
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-strong)' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                {/* İçerik kartı */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '.9rem', color: 'var(--text-strong)' }}>İçerik Kartı</div>
                      <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', marginTop: 2 }}>Alt başlık ya da kısa açıklama</div>
                    </div>
                    <span className="badge bg">Aktif</span>
                  </div>
                  <p style={{ fontSize: '.855rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
                    Bu kart bileşeni içerik yerleştirmek için kullanılır. Başlık, içerik ve alt eylemler eklenerek zenginleştirilebilir.
                  </p>
                  <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                    <button className="btn-p" type="button" style={{ fontSize: '.78rem', padding: '7px 14px' }}>
                      <i className="fa-solid fa-pen" /> Düzenle
                    </button>
                    <button className="btn-o" type="button" style={{ fontSize: '.78rem', padding: '6px 14px' }}>
                      <i className="fa-solid fa-eye" /> Görüntüle
                    </button>
                  </div>
                </div>

                {/* Aksiyon kartı */}
                <div className="card" style={{ padding: 18, borderLeft: '4px solid var(--accent-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--warning-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)', fontSize: '1rem', flexShrink: 0 }}>
                      <i className="fa-solid fa-bolt" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-strong)', fontSize: '.9rem' }}>Aksiyon Kartı</div>
                      <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>Hızlı erişim ve eylem başlatma için kullanılır</div>
                    </div>
                    <button className="ico-btn" type="button">
                      <i className="fa-solid fa-arrow-right" />
                    </button>
                  </div>
                </div>

              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                14. PROGRESS / LOADING
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="progress" style={{ marginBottom: 36 }}>
              <SectionTitle>Progress / Loading</SectionTitle>
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

                <Group label="Spinner">
                  <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.4rem', color: 'var(--accent-primary)' }} />
                    <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '1.4rem', color: '#6366f1' }} />
                    <i className="fa-solid fa-rotate fa-spin" style={{ fontSize: '1.4rem', color: 'var(--success)' }} />
                    <span style={{ fontSize: '.855rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor…
                    </span>
                  </div>
                </Group>

                <Group label="Progress Bar">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {[
                      { label: 'Kırmızı — %30', cls: 'p-red',   pct: 30 },
                      { label: 'Sarı — %65',    cls: 'p-amber', pct: 65 },
                      { label: 'Yeşil — %90',   cls: 'p-green', pct: 90 },
                    ].map(bar => (
                      <div key={bar.label}>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>{bar.label}</div>
                        <div className={`prog ${bar.cls}`}>
                          <div className="prog-fill" style={{ width: `${bar.pct}%` }} />
                        </div>
                      </div>
                    ))}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Dinamik — %{progress}</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-g" type="button" style={{ padding: '2px 8px', fontSize: '.72rem' }} onClick={() => setProgress(p => Math.max(0, p - 10))}>−</button>
                          <button className="btn-g" type="button" style={{ padding: '2px 8px', fontSize: '.72rem' }} onClick={() => setProgress(p => Math.min(100, p + 10))}>+</button>
                        </div>
                      </div>
                      <div className={`prog ${progress < 40 ? 'p-red' : progress < 70 ? 'p-amber' : 'p-green'}`}>
                        <div className="prog-fill" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  </div>
                </Group>

                <Group label="Skeleton Loader">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: '#e2e8f0', flexShrink: 0 }} />
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <SkeletonLine width="55%" />
                        <SkeletonLine width="38%" height={10} />
                      </div>
                    </div>
                    <SkeletonLine />
                    <SkeletonLine width="78%" />
                    <SkeletonLine width="52%" />
                  </div>
                </Group>

              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                15. BOŞ DURUMLAR
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="empty" style={{ marginBottom: 36 }}>
              <SectionTitle>Boş Durumlar</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div className="card" style={{ padding: 20 }}>
                  <Sub>Veri Yok</Sub>
                  <div className="empty">
                    <i className="fa-solid fa-box-open" />
                    <p>Henüz hiç kayıt eklenmemiş.</p>
                    <button className="btn-p" type="button" style={{ fontSize: '.8rem' }}>
                      <i className="fa-solid fa-plus" /> İlk Kaydı Ekle
                    </button>
                  </div>
                </div>

                <div className="card" style={{ padding: 20 }}>
                  <Sub>Arama Sonucu Yok</Sub>
                  <div className="empty">
                    <i className="fa-solid fa-magnifying-glass" />
                    <p>"örnek arama" için sonuç bulunamadı.</p>
                    <button className="btn-o" type="button" style={{ fontSize: '.8rem' }}>
                      <i className="fa-solid fa-rotate" /> Filtreleri Temizle
                    </button>
                  </div>
                </div>

                <div className="card" style={{ padding: 20, borderColor: '#fecaca', background: 'var(--danger-bg)' }}>
                  <Sub>Hata Durumu</Sub>
                  <div className="empty" style={{ color: 'var(--danger)' }}>
                    <i className="fa-solid fa-triangle-exclamation" />
                    <p>Veriler yüklenirken bir hata oluştu.</p>
                    <button
                      type="button"
                      onClick={() => toast('Yeniden deneniyor…', 'info')}
                      style={{
                        background: 'var(--danger)', color: '#fff', border: 'none',
                        borderRadius: 10, padding: '8px 16px', fontWeight: 700,
                        fontSize: '.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <i className="fa-solid fa-rotate" /> Tekrar Dene
                    </button>
                  </div>
                </div>

              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                16. SOFT DELETE
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="softdelete" style={{ marginBottom: 36 }}>
              <SectionTitle>Soft Delete Örneği</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
                  Silinmiş satırlar .deleted sınıfıyla soluklaşır ve üstü çizilir. "Geri Yükle" butonu ile restore edilebilir.
                </p>
                <div style={{ overflowX: 'auto' }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Ürün Adı</th>
                        <th>Kategori</th>
                        <th>Fiyat</th>
                        <th>Durum</th>
                        <th>İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sdRows.map(row => (
                        <tr key={row.id} className={row.deleted ? 'deleted' : ''}>
                          <td className={row.deleted ? 'row-deleted' : ''} style={{ fontWeight: 600 }}>
                            {row.name}
                          </td>
                          <td>{row.category}</td>
                          <td>₺{row.price}</td>
                          <td>
                            {row.deleted
                              ? <span className="badge bgr"><i className="fa-solid fa-trash" /> Silinmiş</span>
                              : <span className="badge bg"><i className="fa-solid fa-check-circle" /> Aktif</span>
                            }
                          </td>
                          <td>
                            {row.deleted ? (
                              <button
                                className="btn-o"
                                type="button"
                                style={{ fontSize: '.72rem', padding: '4px 10px', borderColor: '#a3e635', color: '#65a30d' }}
                                onClick={() => { toggleSdRow(row.id); toast(`${row.name} geri yüklendi`, 'success') }}
                              >
                                <i className="fa-solid fa-rotate-left" /> Geri Yükle
                              </button>
                            ) : (
                              <button
                                className="ico-btn del"
                                type="button"
                                title="Sil"
                                onClick={() => { toggleSdRow(row.id); toast(`${row.name} silindi`, 'error') }}
                              >
                                <i className="fa-solid fa-trash" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ════════════════════════════════════════════════════════════════
                17. AĞAÇ YAPISI
            ═══════════════════════════════════════════════════════════════════ */}
            <section id="tree" style={{ marginBottom: 36 }}>
              <SectionTitle>Ağaç Yapısı</SectionTitle>
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                  <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                    Tıkla → genişlet/daralt ve seç. Çocuğu olan düğümlere tıklayınca hem grup toggle hem seçim olur.
                    Devre dışı düğümler tıklanamaz.
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button
                      className="btn-o"
                      type="button"
                      style={{ fontSize: '.72rem', padding: '5px 12px' }}
                      onClick={() => setTreeExp(new Set(['t1', 't1-1', 't1-3', 't2', 't3']))}
                    >
                      <i className="fa-solid fa-expand" /> Tümünü Aç
                    </button>
                    <button
                      className="btn-o"
                      type="button"
                      style={{ fontSize: '.72rem', padding: '5px 12px' }}
                      onClick={() => setTreeExp(new Set())}
                    >
                      <i className="fa-solid fa-compress" /> Tümünü Kapat
                    </button>
                  </div>
                </div>

                <div style={{ border: '1.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 4px' }}>
                    {TREE_DATA.map(node => (
                      <TreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        selectedId={treeSel}
                        onSelect={setTreeSel}
                        expandedIds={treeExp}
                        toggleExpand={toggleTreeExp}
                      />
                    ))}
                  </div>
                </div>

                {treeSel && (
                  <div style={{
                    marginTop: 12, padding: '9px 14px',
                    background: 'var(--warning-bg)', borderRadius: 8,
                    fontSize: '.78rem', color: 'var(--warning)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <i className="fa-solid fa-circle-check" />
                    Seçili düğüm: <strong>{treeSel}</strong>
                  </div>
                )}
              </div>
            </section>

          </div>{/* grid */}
        </div>{/* content */}
      </div>{/* flex row */}
    </div>
  )
}
