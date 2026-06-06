import React, { useEffect, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { db, buildApiUrl } from '@/lib/db'

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
  const [pageForm, setPageForm] = useState({
    category_id: '',
    title: '',
    content: '',
    last_updated_by_pin: '',
    equipment_ids: [],
    linked_item_id: '',
    linked_item_type: '',
    is_draft: false
  })

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

    try {
      const method = editingPage ? 'PUT' : 'POST'
      const url = editingPage ? buildApiUrl(`/api/manual/pages/${editingPage.id}`) : buildApiUrl('/api/manual/pages')

      const bodyData = { ...pageForm, category_id: activeTab }

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
        is_draft: details.is_draft || false
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
      is_draft: false
    })
    setRecipeContext([])
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: 24 }}>
          {/* Page List Card */}
          <div className="card" style={{ padding: 20 }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px' }}>
              {categories.find(c => c.id === activeTab)?.name} Sayfaları
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Başlık</th>
                    <th style={{ textAlign: 'center' }}>Sürüm</th>
                    <th style={{ textAlign: 'center' }}>PIN</th>
                    <th>Tarih</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.filter(p => p.category_id === activeTab).length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 30 }}>
                        <i className="fa-solid fa-circle-info" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 8 }} />
                        Bu kategoride henüz hiç sayfa oluşturulmamış. Sağdaki formu kullanarak yeni bir sayfa ekleyin.
                      </td>
                    </tr>
                  ) : (
                    pages.filter(p => p.category_id === activeTab).map(page => {
                      return (
                        <tr key={page.id}>
                          <td style={{ fontWeight: 700 }}>{page.title}</td>
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
                              <button className="ico-btn del" onClick={() => handleDeletePage(page)} title="Sil">
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

          {/* Page Editor Form Card */}
          <div className="card" style={{ padding: 20, height: 'fit-content' }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingPage ? 'Sayfayı Düzenle' : 'Yeni Sayfa Ekle'}</span>
              {editingPage && (
                <button className="btn-g" onClick={handleCancelPageEdit} style={{ fontSize: '.75rem', padding: '2px 8px' }}>
                  İptal Et
                </button>
              )}
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
                <label className="f-label">Sistemden Ürün/Hammadde Bağla (İsteğe Bağlı)</label>
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={pageForm.linked_item_id ? `${pageForm.linked_item_type}::${pageForm.linked_item_id}` : '::'}
                    onChange={e => {
                      const val = e.target.value;
                      if (!val || val === '::') {
                        setPageForm(prev => ({ ...prev, linked_item_id: '', linked_item_type: '' }));
                      } else {
                        const [type, id] = val.split('::');
                        setPageForm(prev => ({ ...prev, linked_item_id: id, linked_item_type: type }));
                        
                        // Automatically set title if it's empty
                        const selectedItem = systemItems.find(i => i.id === id);
                        if (selectedItem && !prev.title) {
                          setPageForm(prev => ({ ...prev, title: selectedItem.name, linked_item_id: id, linked_item_type: type }));
                        }
                      }
                    }}
                  >
                    <option value="::">-- Bağımsız Sayfa (Sistem Bağlantısı Yok) --</option>
                    {systemItems.map(item => (
                      <option key={`${item.type}::${item.id}`} value={`${item.type}::${item.id}`}>
                        [{item.typeName}] {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="f-hint">Ürün bağlanırsa, reçetesi el kitabında otomatik listelenir.</p>
              </div>

              {recipeContext.length > 0 && (
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
