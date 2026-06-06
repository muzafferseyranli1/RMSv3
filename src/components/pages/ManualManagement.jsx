import React, { useEffect, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { db, buildApiUrl, resolveImageUrl } from '@/lib/db'

const SYSTEM_CATEGORIES = [
  { name: 'Ürünler', display_order: 11, description: 'Satış malları prosedürleri belirlenir' },
  { name: 'Hammaddeler', display_order: 12, description: 'Ürün ve yarı mamullerin hazırlanmasında kullanılan hammaddelerdir.' },
  { name: 'Ekipmanlar', display_order: 13, description: 'Ürünlerin hazırlanmasında, saklanmasında kullanılan tüm ekipmanlar' },
  { name: 'Operasyon', display_order: 14, description: 'Vardiya yönetimi, açılış kapanış kuralları, hijyen standartları' },
  { name: 'Hizmet Standartları', display_order: 15, description: '-' }
]
const SYSTEM_CATEGORY_NAMES = SYSTEM_CATEGORIES.map(c => c.name)

export default function ManualManagement() {
  const toast = useToast()
  
  // States
  const [activeTab, setActiveTab] = useState('categories') // UUID of category or 'categories' for management
  const [categories, setCategories] = useState([])
  const [pages, setPages] = useState([])
  const [equipments, setEquipments] = useState([])
  const [systemItems, setSystemItems] = useState([])
  const [loading, setLoading] = useState(false)

  // Category Form State
  const [editingCategory, setEditingCategory] = useState(null) // null or { id, name, description, display_order }
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', display_order: 0 })

  // Page Form State
  const [editingPage, setEditingPage] = useState(null) // null or {...}
  const [recipeContext, setRecipeContext] = useState([]) // For displaying recipe when editing
  const [showOpsDetails, setShowOpsDetails] = useState(false)
  const [pageForm, setPageForm] = useState({
    category_id: '',
    title: '',
    content: '',
    last_updated_by_pin: '',
    equipment_ids: [],
    linked_item_id: '',
    linked_item_type: '',
    is_draft: false,
    metadata: { product_image: '', steps: [] }
  })

  const uploadImage = async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(buildApiUrl('/api/upload'), { method: 'POST', body: formData })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.data.file_url
  }

  // Load Initial Data
  const loadData = async () => {
    setLoading(true)
    try {
      const [catsRes, pagesRes, equipsRes, saleRes, semiRes, stockRes] = await Promise.all([
        fetch(buildApiUrl('/api/manual/categories')).then(r => r.json()),
        fetch(buildApiUrl('/api/manual/pages')).then(r => r.json()),
        fetch(buildApiUrl('/api/manual/equipments')).then(r => r.json()),
        db.from('sale_items').select('id,name').eq('active', true),
        db.from('semi_items').select('id,name').eq('setting_active', true),
        db.from('stock_items').select('id,name').eq('setting_active', true)
      ])

      if (catsRes.error) throw new Error(catsRes.error.message)
      if (pagesRes.error) throw new Error(pagesRes.error.message)
      if (equipsRes.error) throw new Error(equipsRes.error.message)

      if (equipsRes.error) throw new Error(equipsRes.error.message)

      let fetchedCats = catsRes.data || []
      let needsReload = false
      for (const sysCat of SYSTEM_CATEGORIES) {
        const existing = fetchedCats.find(c => c.name === sysCat.name)
        if (!existing) {
          await fetch(buildApiUrl('/api/manual/categories'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sysCat)
          })
          needsReload = true
        } else if (existing.display_order !== sysCat.display_order) {
          await fetch(buildApiUrl(`/api/manual/categories/${existing.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...existing, display_order: sysCat.display_order })
          })
          needsReload = true
        }
      }

      if (needsReload) {
        const reCatsRes = await fetch(buildApiUrl('/api/manual/categories')).then(r => r.json())
        fetchedCats = reCatsRes.data || []
      }

      setCategories(fetchedCats.sort((a,b) => a.display_order - b.display_order))
      setPages(pagesRes.data || [])
      setEquipments(equipsRes.data || [])
      
      const sysItems = [
        ...(saleRes?.data || []).map(i => ({ id: i.id, name: i.name, type: 'sale_item', typeName: 'Ürün' })),
        ...(semiRes?.data || []).map(i => ({ id: i.id, name: i.name, type: 'semi_product', typeName: 'Yarı Mamul' })),
        ...(stockRes?.data || []).map(i => ({ id: i.id, name: i.name, type: 'stock_item', typeName: 'Hammadde' }))
      ]
      setSystemItems(sysItems.sort((a,b) => a.name.localeCompare(b.name)))
    } catch (err) {
      console.error('Veriler yüklenemedi:', err)
      toast('Veriler yüklenirken hata oluştu: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // CATEGORY OPERATIONS
  const handleSaveCategory = async (e) => {
    e.preventDefault()
    if (!categoryForm.name.trim()) {
      return toast('Kategori adı zorunludur', 'warning')
    }

    try {
      const method = editingCategory ? 'PUT' : 'POST'
      const url = editingCategory ? buildApiUrl(`/api/manual/categories/${editingCategory.id}`) : buildApiUrl('/api/manual/categories')
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm)
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast(editingCategory ? 'Kategori güncellendi' : 'Kategori oluşturuldu', 'success')
      setCategoryForm({ name: '', description: '', display_order: 0 })
      setEditingCategory(null)
      loadData()
    } catch (err) {
      toast('Kategori kaydedilemedi: ' + err.message, 'error')
    }
  }

  const handleEditCategory = (cat) => {
    setEditingCategory(cat)
    setCategoryForm({
      name: cat.name || '',
      description: cat.description || '',
      display_order: cat.display_order || 0
    })
  }

  const handleDeleteCategory = async (id, name) => {
    if (SYSTEM_CATEGORY_NAMES.includes(name)) {
      return toast('Bu bir sistem kategorisidir, silinemez!', 'error')
    }
    if (!window.confirm('Bu kategoriyi silmek istediğinize emin misiniz? Altındaki tüm sayfalar da silinecektir.')) return

    try {
      const response = await fetch(buildApiUrl(`/api/manual/categories/${id}`), {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast('Kategori başarıyla silindi', 'success')
      loadData()
    } catch (err) {
      toast('Kategori silinemedi: ' + err.message, 'error')
    }
  }

  // PAGE OPERATIONS
  const handleSavePage = async (e) => {
    e.preventDefault()
    if (activeTab === 'categories') return toast('Kategori sekmesinde olmalısınız', 'warning')
    if (!pageForm.title.trim()) return toast('Sayfa başlığı zorunludur', 'warning')
    if (!pageForm.last_updated_by_pin.trim()) return toast('PIN kodu zorunludur', 'warning')

    const isUrunler = categories.find(c => c.id === activeTab)?.name === 'Ürünler';
    let finalContent = pageForm.content;

    if (isUrunler) {
      if (!pageForm.linked_item_id) return toast('Lütfen bir ürün seçiniz.', 'warning')
      const { product_image, steps } = pageForm.metadata || { steps: [] };
      let md = '';
      if (product_image) md += `![Ürün Görseli](${product_image})\n\n`;
      const validSteps = steps.filter(s => s.description?.trim() || s.imageUrl);
      if (validSteps.length > 0) {
        md += `## Ürün hazırlığı ${validSteps.length > 1 ? 'Adımları' : 'prosedürleri'}\n\n`;
        validSteps.forEach((step, idx) => {
          md += `**${idx + 1}. Adım:**\n${step.description || ''}\n`;
          if (step.imageUrl) md += `\n![Adım ${idx + 1} Görseli](${step.imageUrl})\n`;
          md += `\n---\n`;
        });
      }
      finalContent = md;
    }

    try {
      const method = editingPage ? 'PUT' : 'POST'
      const url = editingPage ? buildApiUrl(`/api/manual/pages/${editingPage.id}`) : buildApiUrl('/api/manual/pages')

      const bodyData = { ...pageForm, category_id: activeTab, content: finalContent }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast(editingPage ? 'Sayfa güncellendi' : 'Sayfa oluşturuldu', 'success')
      handleCancelPageEdit()
      loadData()
    } catch (err) {
      toast('Sayfa kaydedilemedi: ' + err.message, 'error')
    }
  }

  const handleEditPage = async (page) => {
    setLoading(true)
    try {
      // Fetch details with joined equipments to pre-populate equipment links
      const [res, ctxRes] = await Promise.all([
        fetch(buildApiUrl(`/api/manual/pages/${page.id}`)).then(r => r.json()),
        fetch(buildApiUrl(`/api/manual/pages/${page.id}/context`)).then(r => r.json())
      ])
      if (res.error) throw new Error(res.error.message)
      
      const details = res.data
      setEditingPage(details)
      setRecipeContext(ctxRes.data?.recipe || [])
      setPageForm({
        category_id: details.category_id || '',
        title: details.title || '',
        content: details.content || '',
        last_updated_by_pin: details.last_updated_by_pin || '',
        equipment_ids: (details.equipments || []).map(eq => eq.id),
        linked_item_id: details.linked_item_id || '',
        linked_item_type: details.linked_item_type || '',
        is_draft: details.is_draft || false,
        metadata: details.metadata || { product_image: '', steps: [] }
      })
    } catch (err) {
      toast('Sayfa detayları yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePage = async (id) => {
    if (!window.confirm('Bu sayfayı silmek istediğinize emin misiniz?')) return

    try {
      const response = await fetch(buildApiUrl(`/api/manual/pages/${id}`), {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast('Sayfa silindi', 'success')
      loadData()
    } catch (err) {
      toast('Sayfa silinemedi: ' + err.message, 'error')
    }
  }

  const handleCancelPageEdit = () => {
    setEditingPage(null)
    setPageForm({
      category_id: '',
      title: '',
      content: '',
      last_updated_by_pin: '',
      equipment_ids: [],
      linked_item_id: '',
      linked_item_type: '',
      is_draft: false,
      metadata: { product_image: '', steps: [] }
    })
    setRecipeContext([])
  }

  // Lightweight Regex-based Markdown Parser with Image support
  const renderMarkdown = (text) => {
    if (!text) return ''
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Headers
    html = html.replace(/^# (.*?)$/gm, '<h1 style="font-size: 1.5rem; font-weight: 800; margin: 24px 0 12px; color: var(--text-strong); border-bottom: 1px solid var(--border); padding-bottom: 6px;">$1</h1>')
    html = html.replace(/^## (.*?)$/gm, '<h2 style="font-size: 1.22rem; font-weight: 700; margin: 18px 0 10px; color: var(--text-strong);">$1</h2>')
    html = html.replace(/^### (.*?)$/gm, '<h3 style="font-size: 1.1rem; font-weight: 700; margin: 14px 0 8px; color: var(--text-strong);">$1</h3>')

    // Images
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; border: 1px solid var(--border);" />')

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-strong);">$1</strong>')
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Code blocks / inline code
    html = html.replace(/`(.*?)`/g, '<code style="font-family: monospace; background: var(--surface-2); padding: 2px 5px; borderRadius: 4px; fontSize: .85rem;">$1</code>')

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;" />')

    // Bullet Lists (unordered)
    html = html.replace(/^- (.*?)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc;">$1</li>')
    html = html.replace(/^\* (.*?)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc;">$1</li>')

    // Ordered Lists
    html = html.replace(/^\d+\.\s(.*)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: decimal;">$1</li>')

    // Break lines
    html = html.replace(/\n/g, '<br />')

    return <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: '1.65', color: 'var(--text-strong)', fontSize: '.92rem' }} />
  }

  const handleEquipmentCheckboxChange = (eqId) => {
    setPageForm(prev => {
      const ids = [...prev.equipment_ids]
      const idx = ids.indexOf(eqId)
      if (idx > -1) {
        ids.splice(idx, 1)
      } else {
        ids.push(eqId)
      }
      return { ...prev, equipment_ids: ids }
    })
  }

  return (
    <div className="page-enter" style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="text-primary" style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900 }}>
            <i className="fa-solid fa-book-open-reader" style={{ marginRight: 10, color: 'var(--accent-primary)' }} />
            El Kitabı Yönetimi
          </h1>
          <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: '.85rem' }}>
            Şubeler için operasyon kılavuzlarını ve kategorileri düzenleyin.
          </p>
        </div>
        <button className="btn-o" onClick={loadData} disabled={loading}>
          <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`} /> Yenile
        </button>
      </div>

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10, overflowX: 'auto' }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={activeTab === cat.id ? 'btn-p' : 'btn-o'}
            onClick={() => {
              setActiveTab(cat.id);
              handleCancelPageEdit();
            }}
            style={{ boxShadow: activeTab === cat.id ? undefined : 'none', whiteSpace: 'nowrap' }}
          >
            <i className="fa-solid fa-folder-open" style={{ marginRight: 6 }} /> {cat.name}
          </button>
        ))}
        <button
          className={activeTab === 'categories' ? 'btn-p' : 'btn-o'}
          onClick={() => setActiveTab('categories')}
          style={{ boxShadow: activeTab === 'categories' ? undefined : 'none', marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          <i className="fa-solid fa-tags" style={{ marginRight: 6 }} /> Kategori Yönetimi
        </button>
      </div>

      {activeTab !== 'categories' ? (
        <div style={{ display: 'grid', gridTemplateColumns: categories.find(c => c.id === activeTab)?.name === 'Ürünler' && (editingPage || pageForm.title || pageForm.linked_item_id) ? '1fr 1fr' : 'minmax(0, 5fr) minmax(0, 7fr)', gap: 24 }}>
          
          {categories.find(c => c.id === activeTab)?.name === 'Ürünler' && (editingPage || pageForm.title || pageForm.linked_item_id) ? (
            <div className="card" style={{ padding: 20 }}>
              <h2 className="text-primary" style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 800 }}>
                <i className="fa-solid fa-eye" style={{ marginRight: 8 }} /> Canlı Önizleme
              </h2>
              {/* A4-like page */}
              <div style={{ background: '#fff', color: '#222', padding: '28px 32px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>

                {/* ── HEADER ── */}
                <div style={{ borderBottom: '2.5px solid #14496b', paddingBottom: 10, marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '.65rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 3 }}>İşletme ve Eğitim El Kitabı</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#14496b' }}>
                      {pageForm.title || (pageForm.linked_item_id ? systemItems.find(i => i.id === pageForm.linked_item_id)?.name : 'Sayfa Başlığı')}
                    </div>
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: 6, background: '#14496b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 700, letterSpacing: '.5px', flexShrink: 0 }}>LOGO</div>
                </div>

                {/* ── HERO ROW: Image + Recipe ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18, marginBottom: 26, alignItems: 'start' }}>
                  {/* Product Image + Details */}
                  <div>
                    <div style={{ borderRadius: 8, overflow: 'hidden', background: '#f5f6f8', border: '1px solid #e8e8e8', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {pageForm.metadata?.product_image ? (
                        <img src={resolveImageUrl(pageForm.metadata.product_image)} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#ccc', padding: 16 }}>
                          <i className="fa-solid fa-camera" style={{ fontSize: '1.6rem', display: 'block', marginBottom: 6 }} />
                          <span style={{ fontSize: '.7rem' }}>Ürün görseli</span>
                        </div>
                      )}
                    </div>

                    {/* Product Details & Shelf Life */}
                    {(pageForm.metadata?.prep_time || pageForm.metadata?.thaw_time || pageForm.metadata?.cooling_time || pageForm.metadata?.portion_qty || pageForm.metadata?.allergens || pageForm.metadata?.storage_temp || pageForm.metadata?.primary_shelf_life || pageForm.metadata?.secondary_shelf_life_1 || pageForm.metadata?.secondary_shelf_life_2) && (
                      <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <i className="fa-solid fa-circle-info" style={{ color: '#14496b', fontSize: '.8rem' }} />
                          <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Ürün Özellikleri</span>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 6, marginBottom: 10 }}>
                          {pageForm.metadata.prep_time && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fa-solid fa-clock" style={{ color: '#14496b', opacity: 0.8 }} />
                              <div>
                                <div style={{ fontSize: '.55rem', color: '#888' }}>Hazırlama</div>
                                <div style={{ fontWeight: 600, color: '#333' }}>{pageForm.metadata.prep_time}</div>
                              </div>
                            </div>
                          )}
                          {pageForm.metadata.thaw_time && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fa-solid fa-snowflake" style={{ color: '#0284c7', opacity: 0.8 }} />
                              <div>
                                <div style={{ fontSize: '.55rem', color: '#888' }}>Çözünme</div>
                                <div style={{ fontWeight: 600, color: '#333' }}>{pageForm.metadata.thaw_time}</div>
                              </div>
                            </div>
                          )}
                          {pageForm.metadata.cooling_time && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fa-solid fa-temperature-arrow-down" style={{ color: '#f59e0b', opacity: 0.8 }} />
                              <div>
                                <div style={{ fontSize: '.55rem', color: '#888' }}>Ilınma/Soğuma</div>
                                <div style={{ fontWeight: 600, color: '#333' }}>{pageForm.metadata.cooling_time}</div>
                              </div>
                            </div>
                          )}
                          {pageForm.metadata.portion_qty && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fa-solid fa-scale-balanced" style={{ color: '#10b981', opacity: 0.8 }} />
                              <div>
                                <div style={{ fontSize: '.55rem', color: '#888' }}>Porsiyon</div>
                                <div style={{ fontWeight: 600, color: '#333' }}>{pageForm.metadata.portion_qty}</div>
                              </div>
                            </div>
                          )}
                          {pageForm.metadata.storage_temp && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fa-solid fa-temperature-three-quarters" style={{ color: '#6366f1', opacity: 0.8 }} />
                              <div>
                                <div style={{ fontSize: '.55rem', color: '#888' }}>Saklama</div>
                                <div style={{ fontWeight: 600, color: '#333' }}>{pageForm.metadata.storage_temp}</div>
                              </div>
                            </div>
                          )}
                          {pageForm.metadata.allergens && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 8px', fontSize: '.7rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <i className="fa-solid fa-triangle-exclamation" style={{ color: '#ef4444', opacity: 0.8 }} />
                              <div>
                                <div style={{ fontSize: '.55rem', color: '#888' }}>Alerjenler</div>
                                <div style={{ fontWeight: 600, color: '#ef4444' }}>{pageForm.metadata.allergens}</div>
                              </div>
                            </div>
                          )}
                        </div>

                        {(pageForm.metadata.primary_shelf_life || pageForm.metadata.secondary_shelf_life_1 || pageForm.metadata.secondary_shelf_life_2) && (
                          <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 8, marginTop: 8 }}>
                            <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 6 }}>
                              Raf Ömrü Standartları
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                              {pageForm.metadata.primary_shelf_life && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                  <span style={{ color: '#666', fontWeight: 500 }}>1. Raf Ömrü (Kapalı)</span>
                                  <span style={{ fontWeight: 700, color: '#333' }}>{pageForm.metadata.primary_shelf_life} {pageForm.metadata.primary_storage_cond ? `(${pageForm.metadata.primary_storage_cond})` : ''}</span>
                                </div>
                              )}
                              
                              {(pageForm.metadata.secondary_shelf_life_1 || pageForm.metadata.secondary_shelf_life_2) && (
                                <div style={{ background: '#fef08a', padding: '6px 8px', borderRadius: 6, border: '1px solid #fde047' }}>
                                  <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#854d0e', textTransform: 'uppercase', marginBottom: 3 }}>
                                    2. Raf Ömrü (Açıldıktan Sonra)
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    {pageForm.metadata.secondary_shelf_life_1 && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: '#713f12', borderBottom: pageForm.metadata.secondary_shelf_life_2 ? '1px solid rgba(133, 77, 14, 0.08)' : 'none', paddingBottom: pageForm.metadata.secondary_shelf_life_2 ? 2 : 0 }}>
                                        <span>Koşul 1 {pageForm.metadata.secondary_storage_cond_1 ? `(${pageForm.metadata.secondary_storage_cond_1})` : ''}</span>
                                        <span style={{ fontWeight: 800 }}>{pageForm.metadata.secondary_shelf_life_1}</span>
                                      </div>
                                    )}
                                    {pageForm.metadata.secondary_shelf_life_2 && (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: '#713f12', paddingTop: pageForm.metadata.secondary_shelf_life_1 ? 2 : 0 }}>
                                        <span>Koşul 2 {pageForm.metadata.secondary_storage_cond_2 ? `(${pageForm.metadata.secondary_storage_cond_2})` : ''}</span>
                                        <span style={{ fontWeight: 800 }}>{pageForm.metadata.secondary_shelf_life_2}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recipe */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>Reçete</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1.5px solid #14496b' }}>
                          <th style={{ padding: '4px 6px', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.4px' }}>Malzeme</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.4px' }}>Miktar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeContext.length > 0 ? recipeContext.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                            <td style={{ padding: '4px 6px', color: '#333' }}>{r.name}</td>
                            <td style={{ padding: '4px 6px', textAlign: 'right', color: '#555', fontWeight: 600 }}>{r.qty} {r.unit}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan="2" style={{ padding: '10px 6px', color: '#ccc', textAlign: 'center', fontStyle: 'italic', fontSize: '.72rem' }}>Ürün seçilince buraya yüklenir</td></tr>
                        )}
                      </tbody>
                    </table>

                    {/* Ekipmanlar as pills */}
                    {pageForm.equipment_ids.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>Ekipmanlar</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {pageForm.equipment_ids.map(eqId => {
                            const eq = equipments.find(e => e.id === eqId);
                            if (!eq) return null;
                            return <span key={eqId} style={{ padding: '3px 9px', background: '#eef4ff', border: '1px solid #c8d9f5', borderRadius: 20, fontSize: '.68rem', color: '#14496b', fontWeight: 600 }}>{eq.name}</span>;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── STEPS ── */}
                {pageForm.metadata?.steps?.length > 0 && (() => {
                  const validSteps = pageForm.metadata.steps.filter(s => s.description?.trim() || s.imageUrl);
                  if (validSteps.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                        <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                          {validSteps.length > 1 ? 'Hazırlık Adımları' : 'Hazırlık Prosedürü'}
                        </span>
                      </div>
                      {pageForm.metadata.steps.map((step, idx) => {
                        const isEven = idx % 2 === 0; // even = image left; odd = image right
                        const hasImg = !!step.imageUrl;
                        return (
                          <div key={idx} style={{
                            display: 'flex',
                            flexDirection: isEven ? 'row' : 'row-reverse',
                            marginBottom: 10,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: '1px solid #e8e8e8',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            minHeight: 80,
                          }}>
                            {/* Image / Number Block */}
                            <div style={{
                              width: hasImg ? 140 : 44,
                              flexShrink: 0,
                              background: hasImg ? '#f5f6f8' : '#14496b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              overflow: 'hidden',
                            }}>
                              {hasImg ? (
                                <>
                                  <img src={resolveImageUrl(step.imageUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                                  <div style={{
                                    position: 'absolute', top: 6,
                                    [isEven ? 'right' : 'left']: 6,
                                    width: 20, height: 20, borderRadius: '50%',
                                    background: '#14496b', color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '.65rem', fontWeight: 800,
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.4)'
                                  }}>{idx + 1}</div>
                                </>
                              ) : (
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>{idx + 1}</div>
                              )}
                            </div>
                            {/* Text */}
                            <div style={{
                              flex: 1, padding: '12px 16px',
                              display: 'flex', alignItems: 'center',
                              fontSize: '.84rem', color: '#2d2d2d', lineHeight: 1.65,
                              borderLeft: isEven ? '3px solid #14496b' : 'none',
                              borderRight: isEven ? 'none' : '3px solid #14496b',
                            }}>
                              {step.description || <span style={{ color: '#ccc', fontStyle: 'italic' }}>Açıklama girilmedi...</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* ── FOOTER ── */}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 9, marginTop: 24, display: 'flex', justifyContent: 'space-between', color: '#bbb', fontSize: '.65rem' }}>
                  <span>{categories.find(c => c.id === activeTab)?.name}</span>
                  <span>{pageForm.title || (pageForm.linked_item_id ? systemItems.find(i => i.id === pageForm.linked_item_id)?.name : '')}</span>
                  <span>Sayfa 1</span>
                </div>
                            </div>
            </div>
          ) : (
          /* Page List Card */
          <div className="card" style={{ padding: 20 }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Bu Kategorideki Sayfalar</span>
              <button className="btn-o" onClick={() => handleEditPage(null)} style={{ fontSize: '.75rem', padding: '4px 8px' }}>
                <i className="fa-solid fa-plus" /> Yeni Sayfa
              </button>
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Başlık</th>
                    <th>Bağlantı</th>
                    <th style={{ textAlign: 'center' }}>Sürüm</th>
                    <th style={{ textAlign: 'center' }}>PIN</th>
                    <th>Güncelleme</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.filter(p => p.category_id === activeTab).length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                        Bu kategoride henüz bir sayfa oluşturulmamış.
                      </td>
                    </tr>
                  ) : (
                    pages.filter(p => p.category_id === activeTab).map(page => {
                      const linkedItemName = page.linked_item_id 
                        ? systemItems.find(i => i.id === page.linked_item_id)?.name || 'Bilinmiyor'
                        : '-'
                      return (
                        <tr key={page.id}>
                          <td style={{ fontWeight: 600 }}>
                            {page.is_draft && <span style={{ color: 'var(--status-draft)', marginRight: 6 }}>[TASLAK]</span>}
                            {page.title}
                          </td>
                          <td style={{ fontSize: '.8rem', color: 'var(--accent-primary)' }}>{linkedItemName}</td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>v{page.version}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{page.last_updated_by_pin || '-'}</td>
                          <td style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                            {new Date(page.updated_at).toLocaleDateString('tr-TR')}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                              <button className="ico-btn edit" onClick={() => handleEditPage(page)} title="Düzenle">
                                <i className="fa-solid fa-pen" />
                              </button>
                              <button className="ico-btn del" onClick={() => handleDeletePage(page.id)} title="Sil">
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Page Editor Form Card */}
          <div className="card" style={{ padding: 20, height: 'fit-content' }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingPage ? 'Sayfayı Düzenle' : 'Yeni Sayfa Ekle'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingPage && (
                  <button type="button" className="btn-g" onClick={handleCancelPageEdit} style={{ fontSize: '.8rem', padding: '6px 12px' }}>
                    İptal Et
                  </button>
                )}
                <button type="button" className="btn-p" onClick={handleSavePage} style={{ fontSize: '.8rem', padding: '6px 12px' }}>
                  <i className="fa-solid fa-save" /> {editingPage ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </h2>
            <form onSubmit={handleSavePage} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="f-label">Sayfa Başlığı</label>
                <input
                  type="text"
                  className="f-input"
                  placeholder="Örn: Espresso Makinesi Temizlik Talimatı"
                  value={pageForm.title}
                  onChange={e => setPageForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="f-label">{categories.find(c => c.id === activeTab)?.name === 'Ürünler' ? 'Ürün Seçiniz' : 'Sistemden Ürün/Hammadde Bağla (İsteğe Bağlı)'}</label>
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={pageForm.linked_item_id ? `${pageForm.linked_item_type}::${pageForm.linked_item_id}` : '::'}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (!val || val === '::') {
                        setPageForm(prev => ({ ...prev, linked_item_id: '', linked_item_type: '' }));
                        setRecipeContext([]);
                      } else {
                        const [type, id] = val.split('::');
                        setPageForm(prev => ({ ...prev, linked_item_id: id, linked_item_type: type }));
                        
                        // Automatically set title if it's empty
                        const selectedItem = systemItems.find(i => i.id === id);
                        if (selectedItem && !pageForm.title) {
                          setPageForm(prev => ({ ...prev, title: selectedItem.name, linked_item_id: id, linked_item_type: type }));
                        }

                        // Fetch recipe dynamically
                        try {
                          const ctxRes = await fetch(buildApiUrl(`/api/manual/context-by-item?linked_item_id=${id}&linked_item_type=${type}`)).then(r => r.json());
                          setRecipeContext(ctxRes.data?.recipe || []);
                        } catch (err) {
                          console.error('Recipe fetch error', err);
                        }
                      }
                    }}
                  >
                    <option value="::">-- {categories.find(c => c.id === activeTab)?.name === 'Ürünler' ? 'Satış Ürünü Seçiniz' : 'Bağımsız Sayfa (Sistem Bağlantısı Yok)'} --</option>
                    {systemItems
                      .filter(item => categories.find(c => c.id === activeTab)?.name === 'Ürünler' ? item.type === 'sale_item' : true)
                      .map(item => (
                      <option key={`${item.type}::${item.id}`} value={`${item.type}::${item.id}`}>
                        [{item.typeName}] {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="f-hint">Ürün bağlanırsa, reçetesi el kitabında otomatik listelenir.</p>
              </div>

              {categories.find(c => c.id === activeTab)?.name !== 'Ürünler' && recipeContext.length > 0 && (
                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <h4 className="text-primary" style={{ margin: '0 0 8px', fontSize: '.9rem' }}>
                    <i className="fa-solid fa-list-check" style={{ marginRight: 6 }}/>
                    Bu Ürünün Reçetesi (Otomatik Bağlı)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.8rem', color: 'var(--text-secondary)' }}>
                    {recipeContext.map((r, i) => (
                      <li key={i}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span> - {r.qty} {r.unit}
                        {r.linked_page_id && <span style={{ marginLeft: 8, color: 'var(--accent-primary)', fontSize: '.7rem' }}><i className="fa-solid fa-link" /> El Kitabı Var</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {categories.find(c => c.id === activeTab)?.name === 'Ürünler' ? (
                <>
                  <div>
                    <label className="f-label">Ürün Resmi Yükleyin</label>
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="f-input"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        try {
                          const url = await uploadImage(file);
                          setPageForm(prev => ({ 
                            ...prev, 
                            metadata: { ...prev.metadata, product_image: url } 
                          }));
                          toast('Ürün resmi yüklendi', 'success');
                        } catch (err) {
                          toast('Resim yüklenemedi: ' + err.message, 'error');
                        }
                      }}
                    />
                    {pageForm.metadata?.product_image && (
                      <div style={{ marginTop: 8 }}>
                        <img src={resolveImageUrl(pageForm.metadata.product_image)} alt="Preview" style={{ height: 60, borderRadius: 6, objectFit: 'cover' }} />
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="f-label" style={{ margin: 0 }}>Ürün Hazırlığı Adımları</label>
                      <button 
                        type="button" 
                        className="btn-p" 
                        style={{ padding: '4px 10px', fontSize: '.75rem' }}
                        onClick={() => {
                          setPageForm(prev => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              steps: [...(prev.metadata?.steps || []), { description: '', imageUrl: '' }]
                            }
                          }))
                        }}
                      >
                        <i className="fa-solid fa-plus" /> Adım Ekle
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {pageForm.metadata?.steps?.map((step, index) => (
                        <div key={index} style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 8, position: 'relative' }}>
                          <button 
                            type="button"
                            className="ico-btn del"
                            style={{ position: 'absolute', top: 8, right: 8 }}
                            onClick={() => {
                              const newSteps = [...pageForm.metadata.steps];
                              newSteps.splice(index, 1);
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, steps: newSteps }
                              }));
                            }}
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>

                          <h5 style={{ margin: '0 0 8px', fontSize: '.85rem' }}>{index + 1}. Adım</h5>
                          <textarea
                            className="f-input"
                            rows={2}
                            placeholder="Bu adımda ne yapılması gerektiğini açıklayın..."
                            value={step.description}
                            onChange={(e) => {
                              const newSteps = [...pageForm.metadata.steps];
                              newSteps[index].description = e.target.value;
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, steps: newSteps }
                              }));
                            }}
                            style={{ marginBottom: 8 }}
                          />
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="f-input"
                            style={{ fontSize: '.75rem', padding: '6px' }}
                            onChange={async (e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              try {
                                const url = await uploadImage(file);
                                const newSteps = [...pageForm.metadata.steps];
                                newSteps[index].imageUrl = url;
                                setPageForm(prev => ({
                                  ...prev,
                                  metadata: { ...prev.metadata, steps: newSteps }
                                }));
                                toast('Adım resmi yüklendi', 'success');
                              } catch (err) {
                                toast('Resim yüklenemedi: ' + err.message, 'error');
                              }
                            }}
                          />
                          {step.imageUrl && (
                            <img src={resolveImageUrl(step.imageUrl)} alt={`Adım ${index + 1}`} style={{ height: 60, borderRadius: 6, objectFit: 'cover', marginTop: 8 }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="f-label">Prosedür İçeriği (Markdown Desteklenir)</label>
                  <textarea
                    className="f-input"
                    rows={8}
                    placeholder="# Başlık&#10;1. Adım 1&#10;2. Adım 2&#10;&#10;**Önemli**: Güvenlik kurallarına uyun."
                    style={{ fontFamily: 'monospace', fontSize: '.8rem', resize: 'vertical' }}
                    value={pageForm.content}
                    onChange={e => setPageForm(prev => ({ ...prev, content: e.target.value }))}
                  />
                </div>
              )}

              {/* Collapsible Operations & Shelf Life Details */}
              <div style={{ border: '1.5px solid #cbd5e1', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setShowOpsDetails(!showOpsDetails)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--surface-2)',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '.85rem',
                    color: 'var(--text-strong)'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--accent-primary)' }} />
                    Mutfak Operasyon Detayları ve Raf Ömrü (İsteğe Bağlı)
                  </span>
                  <i className={`fa-solid fa-chevron-${showOpsDetails ? 'up' : 'down'}`} style={{ opacity: 0.5 }} />
                </button>
                
                {showOpsDetails && (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderTop: '1px solid var(--border)' }}>
                    {/* First Row: Prep Time, Thaw Time, Cooling Time */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="f-label" style={{ fontSize: '.75rem', marginBottom: 4 }}>Hazırlanma Süresi</label>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 5 dk"
                          value={pageForm.metadata?.prep_time || ''}
                          onChange={e => setPageForm(prev => ({
                            ...prev,
                            metadata: { ...prev.metadata, prep_time: e.target.value }
                          }))}
                        />
                      </div>
                      <div>
                        <label className="f-label" style={{ fontSize: '.75rem', marginBottom: 4 }}>Çözünme Süresi (Thawing)</label>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 4 saat"
                          value={pageForm.metadata?.thaw_time || ''}
                          onChange={e => setPageForm(prev => ({
                            ...prev,
                            metadata: { ...prev.metadata, thaw_time: e.target.value }
                          }))}
                        />
                      </div>
                      <div>
                        <label className="f-label" style={{ fontSize: '.75rem', marginBottom: 4 }}>Ilınma/Soğuma Süresi</label>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 10 dk"
                          value={pageForm.metadata?.cooling_time || ''}
                          onChange={e => setPageForm(prev => ({
                            ...prev,
                            metadata: { ...prev.metadata, cooling_time: e.target.value }
                          }))}
                        />
                      </div>
                    </div>

                    {/* Second Row: Portion Weight, Allergens, Storage Temperature */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="f-label" style={{ fontSize: '.75rem', marginBottom: 4 }}>Porsiyon Gramajı / Çıktı</label>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 150 gr"
                          value={pageForm.metadata?.portion_qty || ''}
                          onChange={e => setPageForm(prev => ({
                            ...prev,
                            metadata: { ...prev.metadata, portion_qty: e.target.value }
                          }))}
                        />
                      </div>
                      <div>
                        <label className="f-label" style={{ fontSize: '.75rem', marginBottom: 4 }}>Alerjen Bilgileri</label>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: Glüten, Soya"
                          value={pageForm.metadata?.allergens || ''}
                          onChange={e => setPageForm(prev => ({
                            ...prev,
                            metadata: { ...prev.metadata, allergens: e.target.value }
                          }))}
                        />
                      </div>
                      <div>
                        <label className="f-label" style={{ fontSize: '.75rem', marginBottom: 4 }}>Saklama Sıcaklığı</label>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: +4°C Dolap"
                          value={pageForm.metadata?.storage_temp || ''}
                          onChange={e => setPageForm(prev => ({
                            ...prev,
                            metadata: { ...prev.metadata, storage_temp: e.target.value }
                          }))}
                        />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                      <h4 style={{ margin: '0 0 10px', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)' }}>Raf Ömrü Bilgileri</h4>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Primary Shelf Life */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--surface-1)', padding: 10, borderRadius: 8 }}>
                          <div>
                            <label className="f-label" style={{ fontSize: '.72rem', margin: 0 }}>1. Raf Ömrü (Kapalı Ambalaj / Depolama)</label>
                            <input
                              type="text"
                              className="f-input"
                              placeholder="Örn: 3 ay"
                              value={pageForm.metadata?.primary_shelf_life || ''}
                              onChange={e => setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, primary_shelf_life: e.target.value }
                              }))}
                            />
                          </div>
                          <div>
                            <label className="f-label" style={{ fontSize: '.72rem', margin: 0 }}>Depolama Koşulu</label>
                            <input
                              type="text"
                              className="f-input"
                              placeholder="Örn: Oda Sıcaklığı"
                              value={pageForm.metadata?.primary_storage_cond || ''}
                              onChange={e => setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, primary_storage_cond: e.target.value }
                              }))}
                            />
                          </div>
                        </div>

                        {/* Secondary Shelf Life 1 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--surface-1)', padding: 10, borderRadius: 8 }}>
                          <div>
                            <label className="f-label" style={{ fontSize: '.72rem', margin: 0 }}>2. Raf Ömrü (Açıldıktan/Çözündükten Sonra - Durum 1)</label>
                            <input
                              type="text"
                              className="f-input"
                              placeholder="Örn: 1 hafta"
                              value={pageForm.metadata?.secondary_shelf_life_1 || ''}
                              onChange={e => setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, secondary_shelf_life_1: e.target.value }
                              }))}
                            />
                          </div>
                          <div>
                            <label className="f-label" style={{ fontSize: '.72rem', margin: 0 }}>Saklama Koşulu (Durum 1)</label>
                            <input
                              type="text"
                              className="f-input"
                              placeholder="Örn: +4°C Dolap"
                              value={pageForm.metadata?.secondary_storage_cond_1 || ''}
                              onChange={e => setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, secondary_storage_cond_1: e.target.value }
                              }))}
                            />
                          </div>
                        </div>

                        {/* Secondary Shelf Life 2 */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--surface-1)', padding: 10, borderRadius: 8 }}>
                          <div>
                            <label className="f-label" style={{ fontSize: '.72rem', margin: 0 }}>2. Raf Ömrü (Açıldıktan/Çözündükten Sonra - Durum 2)</label>
                            <input
                              type="text"
                              className="f-input"
                              placeholder="Örn: 4 saat"
                              value={pageForm.metadata?.secondary_shelf_life_2 || ''}
                              onChange={e => setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, secondary_shelf_life_2: e.target.value }
                              }))}
                            />
                          </div>
                          <div>
                            <label className="f-label" style={{ fontSize: '.72rem', margin: 0 }}>Saklama Koşulu (Durum 2)</label>
                            <input
                              type="text"
                              className="f-input"
                              placeholder="Örn: Oda Sıcaklığı"
                              value={pageForm.metadata?.secondary_storage_cond_2 || ''}
                              onChange={e => setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, secondary_storage_cond_2: e.target.value }
                              }))}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Equipment Linking */}
              <div>
                <label className="f-label">Kullanılan Ekipmanları İlişkilendir</label>
                <div style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '8px 12px',
                  maxHeight: 150,
                  overflowY: 'auto',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  {equipments.length === 0 ? (
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Sistemde kayıtlı ekipman bulunmamaktadır.</span>
                  ) : (
                    equipments.map(eq => (
                      <label key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={pageForm.equipment_ids.includes(eq.id)}
                          onChange={() => handleEquipmentCheckboxChange(eq.id)}
                        />
                        <span>{eq.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="f-hint">Sayfada bahsi geçen global ekipman türlerini işaretleyin.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="f-label">Yönetici/Düzenleyen PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="4 Haneli PIN"
                    className="f-input"
                    value={pageForm.last_updated_by_pin}
                    onChange={e => setPageForm(prev => ({ ...prev, last_updated_by_pin: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    <i className="fa-solid fa-save" /> {editingPage ? 'Güncelle' : 'Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: 24 }}>
          {/* Category List Card */}
          <div className="card" style={{ padding: 20 }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px' }}>
              El Kitabı Kategorileri
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 80, textAlign: 'center' }}>Sıra No</th>
                    <th>Kategori Adı</th>
                    <th>Açıklama</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{cat.display_order}</td>
                      <td style={{ fontWeight: 700 }}>{cat.name}</td>
                      <td style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{cat.description || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                          <button className="ico-btn edit" onClick={() => handleEditCategory(cat)} title="Düzenle">
                            <i className="fa-solid fa-pen" />
                          </button>
                          {!SYSTEM_CATEGORY_NAMES.includes(cat.name) && (
                            <button className="ico-btn del" onClick={() => handleDeleteCategory(cat.id, cat.name)} title="Sil">
                              <i className="fa-solid fa-trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Form Card */}
          <div className="card" style={{ padding: 20, height: 'fit-content' }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori Ekle'}</span>
              {editingCategory && (
                <button className="btn-g" onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', description: '', display_order: 0 }) }} style={{ fontSize: '.75rem', padding: '2px 8px' }}>
                  İptal Et
                </button>
              )}
            </h2>
            <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="f-label">Kategori Adı</label>
                <input
                  type="text"
                  className="f-input"
                  placeholder="Örn: Hijyen ve Temizlik"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  disabled={editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)}
                  style={{ opacity: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 0.6 : 1, cursor: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 'not-allowed' : 'text' }}
                />
              </div>

              <div>
                <label className="f-label">Açıklama</label>
                <textarea
                  className="f-input"
                  rows={4}
                  placeholder="Bu kategori altındaki prosedürlerin genel bağlamı..."
                  value={categoryForm.description}
                  onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="f-label">Görünüm Sıralaması (Display Order)</label>
                <input
                  type="number"
                  className="f-input"
                  value={categoryForm.display_order}
                  onChange={e => setCategoryForm(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                  disabled={editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)}
                  style={{ opacity: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 0.6 : 1, cursor: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 'not-allowed' : 'text' }}
                />
              </div>

              <button type="submit" className="btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                <i className="fa-solid fa-save" /> {editingCategory ? 'Kategoriyi Güncelle' : 'Kategoriyi Kaydet'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
