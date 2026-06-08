import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useToast } from '@/hooks/useToast'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db, resolveImageUrl, buildApiUrl } from '@/lib/db'
import SearchableSelect from '@/components/ui/SearchableSelect'

/* ════════════════════════════════════════════════════════════════
   ManualReader — E-Learning Knowledge Base
   ════════════════════════════════════════════════════════════════ */

const CATEGORY_ICONS = {
  'Ürünler': 'fa-utensils',
  'Hammaddeler': 'fa-wheat-awn',
  'Ekipmanlar': 'fa-gears',
  'Operasyon': 'fa-clipboard-check',
  'Hizmet Standartları': 'fa-star',
}
const CATEGORY_COLORS = {
  'Ürünler': '#f59e0b',
  'Hammaddeler': '#10b981',
  'Ekipmanlar': '#6366f1',
  'Operasyon': '#0ea5e9',
  'Hizmet Standartları': '#ec4899',
}
const DEFAULT_ICON = 'fa-book'
const DEFAULT_COLOR = '#64748b'

function estimateReadingTime(page) {
  let words = 0
  if (page.content) words += page.content.split(/\s+/).length
  if (page.metadata?.steps) words += page.metadata.steps.reduce((s, st) => s + (st.description?.split(/\s+/).length || 0), 0)
  return Math.max(1, Math.ceil(words / 180))
}

export default function ManualReader() {
  const toast = useToast()
  const { branchId } = useWorkspace()

  /* ── Data ── */
  const [categories, setCategories] = useState([])
  const [pages, setPages] = useState([])
  const [expandedCategories, setExpandedCategories] = useState({})
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [pageDetails, setPageDetails] = useState(null)
  const [recipeContext, setRecipeContext] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  /* ── Search ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef(null)
  const globalSearchRef = useRef(null)

  /* ── Mobile sidebar ── */
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  /* ── Animation key ── */
  const [animKey, setAnimKey] = useState(0)

  /* ── Fault Modal ── */
  const [showModal, setShowModal] = useState(false)
  const [selectedEquipmentDef, setSelectedEquipmentDef] = useState(null)
  const [branchEquipments, setBranchEquipments] = useState([])
  const [selectedEquipmentInstanceId, setSelectedEquipmentInstanceId] = useState('')
  const [faultDescription, setFaultDescription] = useState('')
  const [submittingFault, setSubmittingFault] = useState(false)

  /* ════════════════════  DATA LOADING  ════════════════════ */

  const loadSidebarData = async () => {
    setLoadingList(true)
    try {
      const [catsRes, pagesRes] = await Promise.all([
        fetch(buildApiUrl('/api/manual/categories')).then(r => r.json()),
        fetch(buildApiUrl('/api/manual/pages')).then(r => r.json())
      ])
      if (catsRes.error) throw new Error(catsRes.error.message)
      if (pagesRes.error) throw new Error(pagesRes.error.message)
      setCategories(catsRes.data || [])
      setPages(pagesRes.data || [])
      // expand all categories by default for knowledge-base feel
      const expanded = {}
      ;(catsRes.data || []).forEach(c => { expanded[c.id] = true })
      setExpandedCategories(expanded)
    } catch (err) {
      toast('Menü yüklenirken hata: ' + err.message, 'error')
    } finally {
      setLoadingList(false)
    }
  }

  const loadPageDetails = useCallback(async (pageId) => {
    setLoadingDetails(true)
    try {
      const [res, ctxRes] = await Promise.all([
        fetch(buildApiUrl(`/api/manual/pages/${pageId}`)).then(r => r.json()),
        fetch(buildApiUrl(`/api/manual/pages/${pageId}/context`)).then(r => r.json())
      ])
      if (res.error) throw new Error(res.error.message)
      setPageDetails(res.data)
      setRecipeContext(ctxRes.data?.recipe || [])
    } catch (err) {
      toast('Sayfa yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoadingDetails(false)
    }
  }, [toast])

  useEffect(() => { loadSidebarData() }, [])
  useEffect(() => {
    if (selectedPageId) loadPageDetails(selectedPageId)
    else setPageDetails(null)
  }, [selectedPageId, loadPageDetails])

  /* ════════════════════  KEYBOARD SHORTCUT  ════════════════════ */

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        globalSearchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        setSearchQuery('')
        setSearchFocused(false)
        globalSearchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  /* ════════════════════  SEARCH  ════════════════════ */

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return pages
      .filter(p => p.title?.toLowerCase().includes(q))
      .map(p => ({
        ...p,
        categoryName: categories.find(c => c.id === p.category_id)?.name || ''
      }))
      .slice(0, 12)
  }, [searchQuery, pages, categories])

  /* ════════════════════  NAVIGATION  ════════════════════ */

  const flatPages = useMemo(() => {
    const ordered = []
    categories.forEach(cat => {
      pages.filter(p => p.category_id === cat.id).forEach(p => ordered.push(p))
    })
    return ordered
  }, [categories, pages])

  const currentIndex = useMemo(() =>
    flatPages.findIndex(p => p.id === selectedPageId), [flatPages, selectedPageId])

  const prevPage = currentIndex > 0 ? flatPages[currentIndex - 1] : null
  const nextPage = currentIndex < flatPages.length - 1 ? flatPages[currentIndex + 1] : null

  const navigateToPage = (pageId) => {
    setSelectedPageId(pageId)
    setAnimKey(k => k + 1)
    setSearchQuery('')
    setSearchFocused(false)
    setMobileSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleCategory = (catId) =>
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }))

  /* ════════════════════  HELPERS  ════════════════════ */

  const activeCategoryName = pageDetails
    ? categories.find(c => c.id === pageDetails.category_id)?.name || ''
    : ''
  const activeCategoryIcon = CATEGORY_ICONS[activeCategoryName] || DEFAULT_ICON
  const activeCategoryColor = CATEGORY_COLORS[activeCategoryName] || DEFAULT_COLOR

  const recentPages = useMemo(() =>
    [...pages].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 6)
  , [pages])

  /* ════════════════════  FAULT MODAL  ════════════════════ */

  const handleOpenFaultModal = async (eqDef) => {
    setSelectedEquipmentDef(eqDef)
    setFaultDescription('')
    setSelectedEquipmentInstanceId('')
    setShowModal(true)
    if (!branchId) { toast('Şube bağlamı bulunamadı.', 'warning'); return }
    try {
      const res = await fetch(buildApiUrl(`/api/equipment/instances?location_id=${branchId}&status=active`)).then(r => r.json())
      if (res.error) throw new Error(res.error.message)
      const instances = (res.data || []).map(eq => {
        const name = eq.name || eq.definition_name || 'İsimsiz Ekipman'
        const label = eq.serial_number ? `${name} (${eq.serial_number})` : name
        return { id: eq.id, name: label }
      })
      setBranchEquipments(instances)
      const matched = instances.find(inst => inst.name?.toLowerCase().includes(eqDef.name?.toLowerCase()))
      setSelectedEquipmentInstanceId(matched ? matched.id : instances[0]?.id || '')
    } catch (err) {
      toast('Şube ekipmanları yüklenemedi: ' + err.message, 'error')
    }
  }

  const handleCloseFaultModal = () => {
    setShowModal(false); setSelectedEquipmentDef(null)
    setBranchEquipments([]); setSelectedEquipmentInstanceId(''); setFaultDescription('')
  }

  const handleSubmitFault = async (e) => {
    e.preventDefault()
    if (!selectedEquipmentInstanceId) return toast('Lütfen cihazı seçin.', 'warning')
    if (!faultDescription.trim()) return toast('Arıza açıklaması zorunludur.', 'warning')
    setSubmittingFault(true)
    try {
      const res = await db.from('maintenance_tickets').insert({
        branch_id: branchId,
        equipment_instance_id: selectedEquipmentInstanceId,
        description: faultDescription,
        issue_description: faultDescription,
        status: 'open'
      })
      if (res.error) throw new Error(res.error.message)
      toast('Arıza kaydı oluşturuldu.', 'success')
      handleCloseFaultModal()
    } catch (err) {
      toast('Arıza kaydı oluşturulamadı: ' + err.message, 'error')
    } finally {
      setSubmittingFault(false)
    }
  }

  /* ════════════════════  RENDER  ════════════════════ */

  return (
    <div className="page-enter mr-root">
      <style>{`
        /* ─── LAYOUT ─── */
        .mr-root {
          display: grid;
          grid-template-columns: 280px minmax(0, 1fr);
          gap: 0;
          max-width: 1440px;
          margin: 0 auto;
          min-height: calc(100vh - 60px);
        }

        /* ─── SIDEBAR ─── */
        .mr-sidebar {
          background: var(--surface);
          border-right: 1px solid var(--border);
          height: calc(100vh - 60px);
          position: sticky;
          top: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          scrollbar-width: thin;
          scrollbar-color: var(--border) transparent;
        }
        .mr-sidebar::-webkit-scrollbar { width: 4px; }
        .mr-sidebar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

        .mr-sidebar-header {
          padding: 20px 18px 12px;
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          background: var(--surface);
          z-index: 10;
        }

        .mr-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .mr-sidebar-brand-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: .9rem;
          flex-shrink: 0;
        }
        .mr-sidebar-brand h2 {
          margin: 0;
          font-size: .88rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1.2;
        }
        .mr-sidebar-brand span {
          font-size: .62rem;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* ─── SEARCH ─── */
        .mr-search-wrap {
          position: relative;
        }
        .mr-search-input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 8px 12px 8px 34px;
          font-size: .78rem;
          color: var(--text-strong);
          background: var(--surface-2);
          outline: none;
          transition: all .2s;
          font-family: inherit;
        }
        .mr-search-input::placeholder { color: var(--text-muted); }
        .mr-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--surface);
          box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.12);
        }
        .mr-search-icon {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .7rem;
          color: var(--text-muted);
          pointer-events: none;
        }
        .mr-search-kbd {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .55rem;
          color: var(--text-muted);
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px 5px;
          font-weight: 600;
          font-family: monospace;
          pointer-events: none;
        }

        /* ─── SEARCH DROPDOWN ─── */
        .mr-search-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,.15);
          z-index: 100;
          max-height: 320px;
          overflow-y: auto;
          padding: 6px;
        }
        .mr-search-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: background .12s;
          border: none;
          background: none;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }
        .mr-search-item:hover { background: var(--surface-2); }
        .mr-search-item-title {
          font-size: .78rem;
          font-weight: 600;
          color: var(--text-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          flex: 1;
        }
        .mr-search-item-cat {
          font-size: .6rem;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--surface-2);
          padding: 2px 7px;
          border-radius: 20px;
          white-space: nowrap;
        }
        .mr-search-empty {
          padding: 18px;
          text-align: center;
          color: var(--text-muted);
          font-size: .78rem;
        }

        /* ─── SIDEBAR NAV ─── */
        .mr-nav { padding: 10px 10px 24px; flex: 1; }
        .mr-cat-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          font-size: .78rem;
          font-weight: 700;
          color: var(--text-strong);
          transition: all .15s;
          font-family: inherit;
          margin-bottom: 2px;
        }
        .mr-cat-btn:hover { background: var(--surface-2); }
        .mr-cat-btn.active { color: var(--accent-primary); }
        .mr-cat-icon {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .65rem;
          flex-shrink: 0;
        }
        .mr-cat-chevron {
          font-size: .5rem;
          opacity: .4;
          transition: transform .2s;
          margin-left: auto;
        }
        .mr-cat-chevron.open { transform: rotate(90deg); }
        .mr-cat-count {
          font-size: .55rem;
          font-weight: 700;
          color: var(--text-muted);
          background: var(--surface-2);
          padding: 1px 6px;
          border-radius: 20px;
          min-width: 18px;
          text-align: center;
        }

        .mr-page-list {
          display: flex;
          flex-direction: column;
          padding: 2px 0 6px 18px;
          border-left: 1.5px solid var(--border);
          margin-left: 22px;
          margin-bottom: 4px;
          gap: 1px;
        }
        .mr-page-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 6px 10px;
          border-radius: 7px;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          font-size: .74rem;
          font-weight: 500;
          color: var(--text-muted);
          transition: all .15s;
          font-family: inherit;
          position: relative;
          width: 100%;
        }
        .mr-page-btn:hover {
          background: var(--surface-2);
          color: var(--text-strong);
        }
        .mr-page-btn.active {
          background: rgba(245, 166, 35, 0.08);
          color: var(--accent-primary);
          font-weight: 700;
        }
        .mr-page-btn.active::before {
          content: '';
          position: absolute;
          left: -19px;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 18px;
          background: var(--accent-primary);
          border-radius: 0 3px 3px 0;
        }
        .mr-page-icon {
          font-size: .6rem;
          opacity: .5;
          width: 14px;
          text-align: center;
          flex-shrink: 0;
        }
        .mr-page-label {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        /* ─── MAIN CONTENT ─── */
        .mr-main {
          padding: 28px 36px;
          min-height: calc(100vh - 60px);
        }

        /* ─── PAGE ANIMATION ─── */
        @keyframes mrPageEnter {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .mr-page-animate {
          animation: mrPageEnter .35s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .mr-page-animate { animation: none; }
        }

        /* ─── WELCOME ─── */
        .mr-welcome { max-width: 720px; margin: 0 auto; padding-top: 40px; }
        .mr-welcome-hero {
          text-align: center;
          margin-bottom: 32px;
        }
        .mr-welcome-icon-wrap {
          width: 72px;
          height: 72px;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(245,166,35,.12), rgba(249,115,22,.12));
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 18px;
        }
        .mr-welcome-icon-wrap i {
          font-size: 1.8rem;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .mr-welcome h1 {
          margin: 0 0 8px;
          font-size: 1.6rem;
          font-weight: 800;
          color: var(--text-strong);
        }
        .mr-welcome-sub {
          font-size: .88rem;
          color: var(--text-muted);
          margin: 0 0 24px;
        }

        /* Global search in welcome */
        .mr-global-search {
          position: relative;
          max-width: 480px;
          margin: 0 auto 36px;
        }
        .mr-global-search input {
          width: 100%;
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 13px 18px 13px 44px;
          font-size: .88rem;
          color: var(--text-strong);
          background: var(--surface);
          outline: none;
          transition: all .2s;
          font-family: inherit;
          box-shadow: 0 2px 12px rgba(0,0,0,.04);
        }
        .mr-global-search input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 4px rgba(245, 166, 35, 0.1), 0 2px 12px rgba(0,0,0,.04);
        }
        .mr-global-search input::placeholder { color: var(--text-muted); }
        .mr-global-search .mr-gs-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .85rem;
          color: var(--text-muted);
          pointer-events: none;
        }
        .mr-global-search .mr-gs-kbd {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: .62rem;
          color: var(--text-muted);
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 5px;
          padding: 2px 7px;
          font-weight: 600;
          font-family: monospace;
          pointer-events: none;
        }

        /* Stats cards */
        .mr-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 14px;
          margin-bottom: 32px;
        }
        .mr-stat-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: transform .15s, box-shadow .15s;
        }
        .mr-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,.06);
        }
        .mr-stat-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .9rem;
          flex-shrink: 0;
        }
        .mr-stat-num {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1;
        }
        .mr-stat-label {
          font-size: .68rem;
          color: var(--text-muted);
          font-weight: 500;
          margin-top: 2px;
        }

        /* Recent pages */
        .mr-recent-title {
          font-size: .72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .08em;
          color: var(--text-muted);
          margin: 0 0 12px 2px;
        }
        .mr-recent-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        .mr-recent-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 14px 16px;
          cursor: pointer;
          transition: all .15s;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .mr-recent-card:hover {
          border-color: var(--accent-primary);
          box-shadow: 0 4px 16px rgba(245,166,35,.08);
          transform: translateY(-1px);
        }
        .mr-recent-card-title {
          font-size: .8rem;
          font-weight: 700;
          color: var(--text-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mr-recent-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: .62rem;
          color: var(--text-muted);
        }
        .mr-recent-card-cat {
          font-size: .58rem;
          font-weight: 600;
          padding: 1px 7px;
          border-radius: 20px;
          white-space: nowrap;
        }

        /* ─── PAGE DETAIL ─── */
        .mr-detail { max-width: 820px; }

        /* Breadcrumb */
        .mr-breadcrumb {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 16px;
          font-size: .72rem;
          flex-wrap: wrap;
        }
        .mr-breadcrumb-item {
          color: var(--text-muted);
          font-weight: 500;
          cursor: pointer;
          transition: color .12s;
          background: none;
          border: none;
          font-family: inherit;
          padding: 0;
        }
        .mr-breadcrumb-item:hover { color: var(--accent-primary); }
        .mr-breadcrumb-sep { color: var(--border); font-size: .6rem; }
        .mr-breadcrumb-current { color: var(--text-strong); font-weight: 700; }

        /* Top toolbar */
        .mr-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
        }
        .mr-toolbar-btn {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .75rem;
          transition: all .12s;
        }
        .mr-toolbar-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: rgba(245,166,35,.06);
        }

        /* Title area */
        .mr-title-area {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
        }
        .mr-title-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 10px;
        }
        .mr-title-icon {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .9rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .mr-title h1 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--text-strong);
          line-height: 1.3;
        }
        .mr-meta-row {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .mr-meta-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: .68rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        .mr-meta-item i { font-size: .6rem; opacity: .7; }
        .mr-cat-badge {
          font-size: .62rem;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 20px;
        }

        /* ─── HERO IMAGE ─── */
        .mr-hero-img {
          width: 100%;
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 24px;
          aspect-ratio: 16/7;
          background: var(--surface-2);
          border: 1px solid var(--border);
        }
        .mr-hero-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        /* ─── PRODUCT SPECS ─── */
        .mr-specs {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 18px 20px;
          margin-bottom: 24px;
        }
        .mr-specs-title {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 14px;
          font-size: .72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-strong);
        }
        .mr-specs-title i {
          font-size: .7rem;
          color: var(--accent-primary);
        }
        .mr-specs-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 10px;
        }
        .mr-spec-card {
          background: var(--surface-2);
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mr-spec-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--surface);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .7rem;
          flex-shrink: 0;
        }
        .mr-spec-label {
          font-size: .58rem;
          color: var(--text-muted);
          font-weight: 500;
        }
        .mr-spec-value {
          font-size: .78rem;
          font-weight: 700;
          color: var(--text-strong);
        }

        /* ─── SHELF LIFE ─── */
        .mr-shelf {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px dashed var(--border);
        }
        .mr-shelf-title {
          font-size: .65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--text-strong);
          margin-bottom: 10px;
        }
        .mr-shelf-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--surface-2);
          padding: 8px 12px;
          border-radius: 8px;
          margin-bottom: 6px;
          font-size: .74rem;
        }
        .mr-shelf-row-label { color: var(--text-muted); font-weight: 500; }
        .mr-shelf-row-value { font-weight: 700; color: var(--text-strong); }
        .mr-shelf-warning {
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 10px;
          padding: 12px 14px;
        }
        [data-theme="dark"] .mr-shelf-warning {
          background: rgba(245,158,11,.1);
          border-color: rgba(245,158,11,.2);
        }
        .mr-shelf-warning-title {
          font-size: .65rem;
          font-weight: 700;
          color: #92400e;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        [data-theme="dark"] .mr-shelf-warning-title { color: #fbbf24; }
        .mr-shelf-warning-row {
          display: flex;
          justify-content: space-between;
          font-size: .72rem;
          padding: 3px 0;
        }
        .mr-shelf-warning-row span:first-child { color: #78350f; }
        .mr-shelf-warning-row span:last-child { font-weight: 800; color: #78350f; }
        [data-theme="dark"] .mr-shelf-warning-row span { color: #fde68a !important; }

        /* ─── RECIPE TABLE ─── */
        .mr-section-head {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
        }
        .mr-section-bar {
          width: 4px;
          height: 18px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        .mr-section-label {
          font-size: .74rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-strong);
        }

        .mr-recipe-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: .8rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          margin-bottom: 24px;
        }
        .mr-recipe-table thead th {
          background: var(--surface-2);
          padding: 10px 14px;
          text-align: left;
          font-size: .65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .mr-recipe-table thead th:last-child { text-align: center; }
        .mr-recipe-table thead th:nth-child(2) { text-align: right; }
        .mr-recipe-table tbody tr { transition: background .12s; }
        .mr-recipe-table tbody tr:hover { background: rgba(245,166,35,.04); }
        .mr-recipe-table tbody td {
          padding: 10px 14px;
          border-bottom: 1px solid var(--border);
          color: var(--text-strong);
        }
        .mr-recipe-table tbody tr:last-child td { border-bottom: none; }
        .mr-recipe-table tbody td:nth-child(2) { text-align: right; color: var(--text-muted); font-weight: 600; }
        .mr-recipe-table tbody td:last-child { text-align: center; }
        .mr-recipe-link {
          color: var(--accent-primary);
          font-weight: 600;
          cursor: pointer;
          text-decoration: none;
          border: none;
          background: none;
          font-family: inherit;
          font-size: inherit;
          padding: 0;
        }
        .mr-recipe-link:hover { text-decoration: underline; }
        .mr-recipe-go-btn {
          font-size: .62rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--accent-primary);
          cursor: pointer;
          transition: all .12s;
          white-space: nowrap;
          font-family: inherit;
        }
        .mr-recipe-go-btn:hover {
          background: rgba(245,166,35,.08);
          border-color: var(--accent-primary);
        }

        /* ─── EQUIPMENT PILLS ─── */
        .mr-equip-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 24px;
        }
        .mr-equip-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 24px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          font-size: .72rem;
          font-weight: 600;
          cursor: pointer;
          transition: all .12s;
          font-family: inherit;
        }
        .mr-equip-pill:hover {
          background: #fee2e2;
          border-color: #f87171;
          transform: translateY(-1px);
        }
        .mr-equip-pill i { font-size: .6rem; }
        [data-theme="dark"] .mr-equip-pill {
          background: rgba(239,68,68,.1);
          border-color: rgba(239,68,68,.25);
          color: #f87171;
        }

        /* ─── STEPS TIMELINE ─── */
        .mr-steps { margin-bottom: 28px; }
        .mr-step {
          display: flex;
          gap: 16px;
          position: relative;
          padding-bottom: 18px;
        }
        .mr-step:last-child { padding-bottom: 0; }
        .mr-step:not(:last-child)::after {
          content: '';
          position: absolute;
          left: 17px;
          top: 40px;
          bottom: 0;
          width: 2px;
          background: var(--border);
        }
        .mr-step-num {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, var(--accent-primary), #f97316);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: .78rem;
          font-weight: 800;
          flex-shrink: 0;
          z-index: 1;
          box-shadow: 0 2px 8px rgba(245,166,35,.25);
        }
        .mr-step-body {
          flex: 1;
          min-width: 0;
        }
        .mr-step-text {
          font-size: .86rem;
          color: var(--text-strong);
          line-height: 1.7;
          padding-top: 6px;
        }
        .mr-step-img {
          margin-top: 10px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid var(--border);
          max-width: 360px;
        }
        .mr-step-img img {
          width: 100%;
          display: block;
        }

        /* ─── MARKDOWN CONTENT ─── */
        .mr-content {
          line-height: 1.8;
          font-size: .88rem;
          color: var(--text-strong);
          margin-bottom: 24px;
        }
        .mr-content h1 {
          font-size: 1.35rem;
          font-weight: 800;
          margin: 24px 0 10px;
          color: var(--text-strong);
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
        }
        .mr-content h2 {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 20px 0 8px;
          color: var(--text-strong);
        }
        .mr-content h3 {
          font-size: .95rem;
          font-weight: 700;
          margin: 16px 0 6px;
          color: var(--text-strong);
        }
        .mr-content strong { font-weight: 700; }
        .mr-content li {
          margin-left: 18px;
          margin-bottom: 5px;
        }

        /* ─── PREV/NEXT NAV ─── */
        .mr-page-nav {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid var(--border);
        }
        .mr-page-nav-btn {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px 18px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface);
          cursor: pointer;
          transition: all .15s;
          font-family: inherit;
          text-align: left;
        }
        .mr-page-nav-btn:hover {
          border-color: var(--accent-primary);
          background: rgba(245,166,35,.04);
          transform: translateY(-1px);
          box-shadow: 0 4px 14px rgba(0,0,0,.05);
        }
        .mr-page-nav-btn.next { text-align: right; }
        .mr-page-nav-btn .mr-nav-dir {
          font-size: .62rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--accent-primary);
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .mr-page-nav-btn.next .mr-nav-dir { justify-content: flex-end; }
        .mr-page-nav-btn .mr-nav-title {
          font-size: .82rem;
          font-weight: 700;
          color: var(--text-strong);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mr-page-nav-placeholder {
          /* empty cell for single-direction nav */
        }

        /* ─── LOADING ─── */
        .mr-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 20px;
          gap: 14px;
          color: var(--text-muted);
        }
        .mr-loading i { font-size: 1.4rem; color: var(--accent-primary); }
        .mr-loading p { font-size: .85rem; margin: 0; }

        /* ─── MOBILE ─── */
        .mr-mobile-toggle {
          display: none;
          position: fixed;
          bottom: 20px;
          left: 20px;
          z-index: 300;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: linear-gradient(135deg, #f59e0b, #f97316);
          color: #fff;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          box-shadow: 0 4px 20px rgba(245,166,35,.4);
          transition: transform .2s;
        }
        .mr-mobile-toggle:hover { transform: scale(1.08); }
        .mr-mobile-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.5);
          z-index: 290;
          backdrop-filter: blur(3px);
        }

        @media (max-width: 768px) {
          .mr-root {
            grid-template-columns: 1fr !important;
          }
          .mr-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: 300px;
            z-index: 295;
            transform: translateX(-100%);
            transition: transform .3s cubic-bezier(.4,0,.2,1);
            box-shadow: none;
          }
          .mr-sidebar.open {
            transform: translateX(0);
            box-shadow: 8px 0 30px rgba(0,0,0,.15);
          }
          .mr-mobile-toggle { display: flex; align-items: center; justify-content: center; }
          .mr-mobile-overlay.open { display: block; }
          .mr-main { padding: 20px 16px; }
          .mr-page-nav { grid-template-columns: 1fr; }
        }

        @media (max-width: 1024px) and (min-width: 769px) {
          .mr-root { grid-template-columns: 240px minmax(0, 1fr); }
        }

        /* ─── PRINT ─── */
        @media print {
          .mr-root {
            display: block !important;
            max-width: 100% !important;
            margin: 0 !important;
          }
          .mr-sidebar,
          .mr-mobile-toggle,
          .mr-mobile-overlay,
          .mr-toolbar,
          .mr-page-nav,
          .mr-breadcrumb,
          .mr-equip-pill,
          nav,
          header,
          footer,
          #sidebar-panel,
          #sidebar-overlay,
          .top-nav,
          .navbar,
          .sidebar,
          .topbar,
          .layout-sidebar,
          .layout-topbar,
          .layout-sidebar-anchor {
            display: none !important;
          }
          .mr-main {
            padding: 0 !important;
            min-height: auto !important;
          }
          .mr-detail { max-width: 100% !important; }

          @page {
            size: landscape;
            margin: 12mm 15mm;
          }

          .mr-title-area { border-bottom: 2px solid #333 !important; }
          .mr-hero-img { break-inside: avoid; }
          .mr-specs { break-inside: avoid; }
          .mr-step { break-inside: avoid; }
          .mr-recipe-table { break-inside: avoid; }
          .mr-page-animate { animation: none !important; }

          .mr-print-header {
            display: flex !important;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 8px;
            margin-bottom: 16px;
            border-bottom: 2px solid #000;
            font-size: 9pt;
            color: #666;
          }
          .mr-print-footer {
            display: block !important;
            margin-top: 24px;
            padding-top: 8px;
            border-top: 1px solid #ccc;
            text-align: center;
            font-size: 8pt;
            color: #999;
          }

          /* Make sure images print */
          img { max-width: 100% !important; }

          /* Clean backgrounds */
          .mr-spec-card, .mr-shelf-warning, .mr-step-num {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }

        /* Hidden on screen, visible on print */
        .mr-print-header, .mr-print-footer { display: none; }
      `}</style>

      {/* ══════ SIDEBAR ══════ */}
      <aside className={`mr-sidebar${mobileSidebarOpen ? ' open' : ''}`}>
        <div className="mr-sidebar-header">
          <div className="mr-sidebar-brand">
            <div className="mr-sidebar-brand-icon">
              <i className="fa-solid fa-book-open" />
            </div>
            <div>
              <h2>Operasyon El Kitabı</h2>
              <span>{categories.length} Kategori · {pages.length} Sayfa</span>
            </div>
          </div>

          {/* Sidebar search */}
          <div className="mr-search-wrap" ref={searchRef}>
            <i className="fa-solid fa-magnifying-glass mr-search-icon" />
            <input
              className="mr-search-input"
              placeholder="Sayfa ara..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            />
            {!searchFocused && !searchQuery && (
              <span className="mr-search-kbd">Ctrl+K</span>
            )}

            {searchFocused && searchQuery.trim() && (
              <div className="mr-search-dropdown">
                {searchResults.length === 0 ? (
                  <div className="mr-search-empty">
                    <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 6, opacity: .5 }} />
                    Sonuç bulunamadı
                  </div>
                ) : searchResults.map(r => (
                  <button key={r.id} className="mr-search-item"
                    onMouseDown={() => navigateToPage(r.id)}>
                    <i className={`fa-solid ${CATEGORY_ICONS[r.categoryName] || DEFAULT_ICON}`}
                       style={{ fontSize: '.7rem', color: CATEGORY_COLORS[r.categoryName] || DEFAULT_COLOR }} />
                    <span className="mr-search-item-title">{r.title}</span>
                    <span className="mr-search-item-cat">{r.categoryName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category nav */}
        <nav className="mr-nav">
          {loadingList ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Yükleniyor...
            </div>
          ) : categories.map(cat => {
            const catPages = pages.filter(p => p.category_id === cat.id)
            const isExpanded = !!expandedCategories[cat.id]
            const icon = CATEGORY_ICONS[cat.name] || DEFAULT_ICON
            const color = CATEGORY_COLORS[cat.name] || DEFAULT_COLOR
            const isActiveCat = pageDetails?.category_id === cat.id

            return (
              <div key={cat.id}>
                <button
                  className={`mr-cat-btn${isActiveCat ? ' active' : ''}`}
                  onClick={() => toggleCategory(cat.id)}
                >
                  <div className="mr-cat-icon" style={{ background: `${color}14`, color }}>
                    <i className={`fa-solid ${icon}`} />
                  </div>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cat.name}
                  </span>
                  <span className="mr-cat-count">{catPages.length}</span>
                  <i className={`fa-solid fa-chevron-right mr-cat-chevron${isExpanded ? ' open' : ''}`} />
                </button>
                {isExpanded && (
                  <div className="mr-page-list">
                    {catPages.length === 0 ? (
                      <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', padding: '6px 10px' }}>Henüz sayfa yok</span>
                    ) : catPages.map(page => (
                      <button key={page.id}
                        className={`mr-page-btn${selectedPageId === page.id ? ' active' : ''}`}
                        onClick={() => navigateToPage(page.id)}>
                        <i className={`fa-regular fa-file-lines mr-page-icon`} />
                        <span className="mr-page-label">{page.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>

      {/* ══════ MOBILE TOGGLE ══════ */}
      <button className="mr-mobile-toggle" onClick={() => setMobileSidebarOpen(v => !v)}>
        <i className={`fa-solid ${mobileSidebarOpen ? 'fa-xmark' : 'fa-bars'}`} />
      </button>
      <div className={`mr-mobile-overlay${mobileSidebarOpen ? ' open' : ''}`}
           onClick={() => setMobileSidebarOpen(false)} />

      {/* ══════ MAIN CONTENT ══════ */}
      <main className="mr-main">
        {loadingDetails ? (
          <div className="mr-loading">
            <i className="fa-solid fa-spinner fa-spin" />
            <p>Sayfa yükleniyor...</p>
          </div>
        ) : !pageDetails ? (
          /* ── WELCOME SCREEN ── */
          <div className="mr-welcome mr-page-animate">
            <div className="mr-welcome-hero">
              <div className="mr-welcome-icon-wrap">
                <i className="fa-solid fa-graduation-cap" />
              </div>
              <h1>Operasyon El Kitabı</h1>
              <p className="mr-welcome-sub">Prosedürleri, ürün kılavuzlarını ve standartları buradan inceleyebilirsiniz.</p>
            </div>

            {/* Global search */}
            <div className="mr-global-search">
              <i className="fa-solid fa-magnifying-glass mr-gs-icon" />
              <input
                ref={globalSearchRef}
                placeholder="Sayfa ara... (ör: Hamburger, Temizlik)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onFocus={() => { setSearchFocused(true); searchRef.current?.querySelector('input')?.focus() }}
              />
              <span className="mr-gs-kbd">Ctrl+K</span>
            </div>

            {/* Stats */}
            <div className="mr-stats">
              <div className="mr-stat-card">
                <div className="mr-stat-icon" style={{ background: 'rgba(245,166,35,.1)', color: '#f59e0b' }}>
                  <i className="fa-solid fa-layer-group" />
                </div>
                <div>
                  <div className="mr-stat-num">{categories.length}</div>
                  <div className="mr-stat-label">Kategori</div>
                </div>
              </div>
              <div className="mr-stat-card">
                <div className="mr-stat-icon" style={{ background: 'rgba(16,185,129,.1)', color: '#10b981' }}>
                  <i className="fa-solid fa-file-lines" />
                </div>
                <div>
                  <div className="mr-stat-num">{pages.length}</div>
                  <div className="mr-stat-label">Sayfa</div>
                </div>
              </div>
              <div className="mr-stat-card">
                <div className="mr-stat-icon" style={{ background: 'rgba(99,102,241,.1)', color: '#6366f1' }}>
                  <i className="fa-solid fa-list-check" />
                </div>
                <div>
                  <div className="mr-stat-num">{pages.reduce((s, p) => s + (p.metadata?.steps?.length || 0), 0)}</div>
                  <div className="mr-stat-label">Toplam Adım</div>
                </div>
              </div>
            </div>

            {/* Recent */}
            {recentPages.length > 0 && (
              <>
                <div className="mr-recent-title">Son Güncellenen Sayfalar</div>
                <div className="mr-recent-grid">
                  {recentPages.map(p => {
                    const catName = categories.find(c => c.id === p.category_id)?.name || ''
                    const color = CATEGORY_COLORS[catName] || DEFAULT_COLOR
                    return (
                      <div key={p.id} className="mr-recent-card" onClick={() => navigateToPage(p.id)}>
                        <div className="mr-recent-card-title">{p.title}</div>
                        <div className="mr-recent-card-meta">
                          <span className="mr-recent-card-cat" style={{ background: `${color}14`, color }}>
                            {catName}
                          </span>
                          <span>v{p.version || 1}</span>
                          <span>·</span>
                          <span>{new Date(p.updated_at || p.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        ) : (
          /* ── PAGE DETAIL ── */
          <div className="mr-detail mr-page-animate" key={animKey}>
            {/* Print header (hidden on screen) */}
            <div className="mr-print-header">
              <span>İşletme ve Eğitim El Kitabı</span>
              <span>{activeCategoryName} — {pageDetails.title}</span>
              <span>v{pageDetails.version} · {new Date(pageDetails.updated_at).toLocaleDateString('tr-TR')}</span>
            </div>

            {/* Breadcrumb */}
            <div className="mr-breadcrumb">
              <button className="mr-breadcrumb-item" onClick={() => { setSelectedPageId(null); setPageDetails(null); setAnimKey(k => k + 1) }}>
                <i className="fa-solid fa-house" style={{ fontSize: '.6rem', marginRight: 3 }} /> El Kitabı
              </button>
              <i className="fa-solid fa-chevron-right mr-breadcrumb-sep" />
              <button className="mr-breadcrumb-item" onClick={() => {
                const cat = categories.find(c => c.id === pageDetails.category_id)
                if (cat) { setExpandedCategories(prev => ({ ...prev, [cat.id]: true })) }
              }}>
                {activeCategoryName}
              </button>
              <i className="fa-solid fa-chevron-right mr-breadcrumb-sep" />
              <span className="mr-breadcrumb-current">{pageDetails.title}</span>
            </div>

            {/* Toolbar */}
            <div className="mr-toolbar">
              <div style={{ flex: 1 }} />
              <button className="mr-toolbar-btn" onClick={() => window.print()} title="Yazdır">
                <i className="fa-solid fa-print" />
              </button>
            </div>

            {/* Title area */}
            <div className="mr-title-area">
              <div className="mr-title-row">
                <div className="mr-title-icon" style={{ background: `${activeCategoryColor}14`, color: activeCategoryColor }}>
                  <i className={`fa-solid ${activeCategoryIcon}`} />
                </div>
                <div className="mr-title" style={{ flex: 1 }}>
                  <h1>{pageDetails.title}</h1>
                </div>
              </div>
              <div className="mr-meta-row">
                <span className="mr-cat-badge" style={{ background: `${activeCategoryColor}14`, color: activeCategoryColor }}>
                  {activeCategoryName}
                </span>
                <span className="mr-meta-item">
                  <i className="fa-solid fa-code-branch" /> v{pageDetails.version}
                </span>
                <span className="mr-meta-item">
                  <i className="fa-regular fa-calendar" /> {new Date(pageDetails.updated_at).toLocaleDateString('tr-TR')}
                </span>
                <span className="mr-meta-item">
                  <i className="fa-regular fa-clock" /> ~{estimateReadingTime(pageDetails)} dk okuma
                </span>
              </div>
            </div>

            {/* Hero image */}
            {pageDetails.metadata?.product_image && (
              <div className="mr-hero-img">
                <img src={resolveImageUrl(pageDetails.metadata.product_image)} alt={pageDetails.title} />
              </div>
            )}

            {/* Product specs */}
            {(pageDetails.metadata?.prep_time || pageDetails.metadata?.thaw_time || pageDetails.metadata?.cooling_time ||
              pageDetails.metadata?.portion_qty || pageDetails.metadata?.allergens || pageDetails.metadata?.storage_temp) && (
              <div className="mr-specs">
                <div className="mr-specs-title">
                  <i className="fa-solid fa-circle-info" /> Ürün Özellikleri
                </div>
                <div className="mr-specs-grid">
                  {pageDetails.metadata.prep_time && (
                    <div className="mr-spec-card">
                      <div className="mr-spec-icon" style={{ color: '#0ea5e9' }}><i className="fa-solid fa-clock" /></div>
                      <div>
                        <div className="mr-spec-label">Hazırlama</div>
                        <div className="mr-spec-value">{pageDetails.metadata.prep_time}</div>
                      </div>
                    </div>
                  )}
                  {pageDetails.metadata.thaw_time && (
                    <div className="mr-spec-card">
                      <div className="mr-spec-icon" style={{ color: '#0284c7' }}><i className="fa-solid fa-snowflake" /></div>
                      <div>
                        <div className="mr-spec-label">Çözünme</div>
                        <div className="mr-spec-value">{pageDetails.metadata.thaw_time}</div>
                      </div>
                    </div>
                  )}
                  {pageDetails.metadata.cooling_time && (
                    <div className="mr-spec-card">
                      <div className="mr-spec-icon" style={{ color: '#f59e0b' }}><i className="fa-solid fa-temperature-arrow-down" /></div>
                      <div>
                        <div className="mr-spec-label">Ilınma / Soğuma</div>
                        <div className="mr-spec-value">{pageDetails.metadata.cooling_time}</div>
                      </div>
                    </div>
                  )}
                  {pageDetails.metadata.portion_qty && (
                    <div className="mr-spec-card">
                      <div className="mr-spec-icon" style={{ color: '#10b981' }}><i className="fa-solid fa-scale-balanced" /></div>
                      <div>
                        <div className="mr-spec-label">Porsiyon</div>
                        <div className="mr-spec-value">{pageDetails.metadata.portion_qty}</div>
                      </div>
                    </div>
                  )}
                  {pageDetails.metadata.storage_temp && (
                    <div className="mr-spec-card">
                      <div className="mr-spec-icon" style={{ color: '#6366f1' }}><i className="fa-solid fa-temperature-three-quarters" /></div>
                      <div>
                        <div className="mr-spec-label">Saklama</div>
                        <div className="mr-spec-value">{pageDetails.metadata.storage_temp}</div>
                      </div>
                    </div>
                  )}
                  {pageDetails.metadata.allergens && (
                    <div className="mr-spec-card">
                      <div className="mr-spec-icon" style={{ color: '#ef4444' }}><i className="fa-solid fa-triangle-exclamation" /></div>
                      <div>
                        <div className="mr-spec-label">Alerjenler</div>
                        <div className="mr-spec-value" style={{ color: '#ef4444' }}>{pageDetails.metadata.allergens}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Shelf life */}
                {(pageDetails.metadata.primary_shelf_life || pageDetails.metadata.secondary_shelf_life_1 || pageDetails.metadata.secondary_shelf_life_2) && (
                  <div className="mr-shelf">
                    <div className="mr-shelf-title">Raf Ömrü Standartları</div>
                    {pageDetails.metadata.primary_shelf_life && (
                      <div className="mr-shelf-row">
                        <span className="mr-shelf-row-label">1. Raf Ömrü (Kapalı Ambalaj)</span>
                        <span className="mr-shelf-row-value">
                          {pageDetails.metadata.primary_shelf_life}
                          {pageDetails.metadata.primary_storage_cond ? ` (${pageDetails.metadata.primary_storage_cond})` : ''}
                        </span>
                      </div>
                    )}
                    {(pageDetails.metadata.secondary_shelf_life_1 || pageDetails.metadata.secondary_shelf_life_2) && (
                      <div className="mr-shelf-warning">
                        <div className="mr-shelf-warning-title">
                          <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 5, fontSize: '.6rem' }} />
                          2. Raf Ömrü (Açıldıktan / Çözündükten Sonra)
                        </div>
                        {pageDetails.metadata.secondary_shelf_life_1 && (
                          <div className="mr-shelf-warning-row">
                            <span>Koşul 1 {pageDetails.metadata.secondary_storage_cond_1 ? `(${pageDetails.metadata.secondary_storage_cond_1})` : ''}</span>
                            <span>{pageDetails.metadata.secondary_shelf_life_1}</span>
                          </div>
                        )}
                        {pageDetails.metadata.secondary_shelf_life_2 && (
                          <div className="mr-shelf-warning-row">
                            <span>Koşul 2 {pageDetails.metadata.secondary_storage_cond_2 ? `(${pageDetails.metadata.secondary_storage_cond_2})` : ''}</span>
                            <span>{pageDetails.metadata.secondary_shelf_life_2}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Recipe */}
            {recipeContext.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="mr-section-head">
                  <div className="mr-section-bar" style={{ background: activeCategoryColor }} />
                  <span className="mr-section-label">Reçete</span>
                </div>
                <table className="mr-recipe-table">
                  <thead>
                    <tr>
                      <th>Malzeme</th>
                      <th>Miktar</th>
                      <th>Kılavuz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipeContext.map((r, i) => {
                      const targetPageId = r.linked_page_id || pages.find(p => p.title?.toLowerCase().trim() === r.name?.toLowerCase().trim())?.id
                      return (
                        <tr key={i}>
                          <td>
                            {targetPageId ? (
                              <button className="mr-recipe-link" onClick={() => navigateToPage(targetPageId)}>
                                {r.name}
                              </button>
                            ) : (
                              <span>{r.name}</span>
                            )}
                          </td>
                          <td>{r.qty} {r.unit}</td>
                          <td>
                            {targetPageId ? (
                              <button className="mr-recipe-go-btn" onClick={() => navigateToPage(targetPageId)}>
                                <i className="fa-solid fa-arrow-right" style={{ marginRight: 3, fontSize: '.55rem' }} />
                                Kılavuza Git
                              </button>
                            ) : (
                              <span style={{ color: 'var(--border)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Equipment pills */}
            {pageDetails.equipments?.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div className="mr-section-head">
                  <div className="mr-section-bar" style={{ background: '#ef4444' }} />
                  <span className="mr-section-label">Ekipmanlar</span>
                </div>
                <div className="mr-equip-pills">
                  {pageDetails.equipments.map(eq => (
                    <button key={eq.id} className="mr-equip-pill" onClick={() => handleOpenFaultModal(eq)} title="Arıza Bildir">
                      <i className="fa-solid fa-triangle-exclamation" /> {eq.name}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: -12, marginBottom: 24 }}>
                  Ekipmana tıklayarak arıza bildiriminde bulunabilirsiniz.
                </div>
              </div>
            )}

            {/* Steps — Timeline */}
            {pageDetails.metadata?.steps?.length > 0 && (() => {
              const validSteps = pageDetails.metadata.steps.filter(s => s.description?.trim() || s.imageUrl)
              if (validSteps.length === 0) return null
              return (
                <div className="mr-steps">
                  <div className="mr-section-head">
                    <div className="mr-section-bar" style={{ background: activeCategoryColor }} />
                    <span className="mr-section-label">
                      {validSteps.length > 1 ? 'Hazırlık Adımları' : 'Hazırlık Prosedürü'}
                    </span>
                  </div>
                  {pageDetails.metadata.steps.map((step, idx) => (
                    <div key={idx} className="mr-step">
                      <div className="mr-step-num">{idx + 1}</div>
                      <div className="mr-step-body">
                        <div className="mr-step-text">
                          {step.description || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Açıklama girilmedi</span>}
                        </div>
                        {step.imageUrl && (
                          <div className="mr-step-img">
                            <img src={resolveImageUrl(step.imageUrl)} alt={`Adım ${idx + 1}`} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Markdown content */}
            {pageDetails.content && (
              <div className="mr-content" dangerouslySetInnerHTML={{ __html: pageDetails.content
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/^# (.*)$/gm, '<h1>$1</h1>')
                .replace(/^## (.*)$/gm, '<h2>$1</h2>')
                .replace(/^### (.*)$/gm, '<h3>$1</h3>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/^- (.*)$/gm, '<li style="list-style-type:disc">$1</li>')
                .replace(/^\d+\.\s(.*)$/gm, '<li style="list-style-type:decimal">$1</li>')
                .replace(/\n/g, '<br />')
              }} />
            )}

            {/* Prev/Next navigation */}
            <div className="mr-page-nav">
              {prevPage ? (
                <button className="mr-page-nav-btn" onClick={() => navigateToPage(prevPage.id)}>
                  <span className="mr-nav-dir">
                    <i className="fa-solid fa-arrow-left" style={{ fontSize: '.55rem' }} /> Önceki
                  </span>
                  <span className="mr-nav-title">{prevPage.title}</span>
                </button>
              ) : <div className="mr-page-nav-placeholder" />}
              {nextPage ? (
                <button className="mr-page-nav-btn next" onClick={() => navigateToPage(nextPage.id)}>
                  <span className="mr-nav-dir">
                    Sonraki <i className="fa-solid fa-arrow-right" style={{ fontSize: '.55rem' }} />
                  </span>
                  <span className="mr-nav-title">{nextPage.title}</span>
                </button>
              ) : <div className="mr-page-nav-placeholder" />}
            </div>

            {/* Print footer (hidden on screen) */}
            <div className="mr-print-footer">
              {activeCategoryName} — {pageDetails.title} — v{pageDetails.version} — {new Date(pageDetails.updated_at).toLocaleDateString('tr-TR')}
            </div>
          </div>
        )}
      </main>

      {/* ══════ FAULT MODAL ══════ */}
      {showModal && selectedEquipmentDef && (
        <div className="modal-bg open" onClick={handleCloseFaultModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-primary" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                {selectedEquipmentDef.name} — Arıza Bildirimi
              </h3>
            </div>
            <form onSubmit={handleSubmitFault}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 10, padding: 12, fontSize: '.78rem', display: 'flex', gap: 8 }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ marginTop: 2 }} />
                  <span>Şubenizde kayıtlı fiziksel cihazı seçip arıza detaylarını girin.</span>
                </div>
                <div>
                  <label className="f-label">Cihaz Seçimi</label>
                  {branchEquipments.length === 0 ? (
                    <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: 10, borderRadius: 8, fontSize: '.78rem' }}>
                      Bu şube için kayıtlı ekipman bulunamadı.
                    </div>
                  ) : (
                    <SearchableSelect
                      value={selectedEquipmentInstanceId}
                      onChange={setSelectedEquipmentInstanceId}
                      options={branchEquipments.map(inst => ({ value: inst.id, label: inst.name }))}
                      placeholder="Cihaz seçin..."
                      searchPlaceholder="Cihaz ara..."
                      noResultsLabel="Eşleşen cihaz bulunamadı"
                      allowClear={true}
                    />
                  )}
                </div>
                <div>
                  <label className="f-label">Arıza Açıklaması</label>
                  <textarea className="f-input" rows={4} placeholder="Lütfen arızayı detaylı açıklayın..." value={faultDescription} onChange={e => setFaultDescription(e.target.value)} />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn-o" onClick={handleCloseFaultModal}>Vazgeç</button>
                <button type="submit" className="btn-p" disabled={submittingFault || branchEquipments.length === 0}>
                  {submittingFault ? <><i className="fa-solid fa-spinner fa-spin" /> Gönderiliyor...</> : <><i className="fa-solid fa-check" /> Bildirimi Kaydet</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
