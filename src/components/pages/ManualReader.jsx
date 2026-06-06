import React, { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/hooks/useToast'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db, resolveImageUrl, buildApiUrl } from '@/lib/db'

export default function ManualReader() {
  const toast = useToast()
  const { branchId } = useWorkspace()

  // States
  const [categories, setCategories] = useState([])
  const [pages, setPages] = useState([])
  const [expandedCategories, setExpandedCategories] = useState({}) // { [catId]: boolean }
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [pageDetails, setPageDetails] = useState(null)
  const [recipeContext, setRecipeContext] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Fault Modal States
  const [showModal, setShowModal] = useState(false)
  const [selectedEquipmentDef, setSelectedEquipmentDef] = useState(null) // selected equipment_definitions record
  const [branchEquipments, setBranchEquipments] = useState([])
  const [selectedEquipmentInstanceId, setSelectedEquipmentInstanceId] = useState('')
  const [faultDescription, setFaultDescription] = useState('')
  const [submittingFault, setSubmittingFault] = useState(false)

  // Load Categories & Pages
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

      // Auto expand the first category if exists
      if (catsRes.data?.length > 0) {
        setExpandedCategories({ [catsRes.data[0].id]: true })
      }
    } catch (err) {
      console.error('Sidebar verileri yüklenemedi:', err)
      toast('Menü yüklenirken hata oluştu: ' + err.message, 'error')
    } finally {
      setLoadingList(false)
    }
  }

  // Load Selected Page Details
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
      console.error('Sayfa detayları yüklenemedi:', err)
      toast('Sayfa detayları yüklenirken hata oluştu: ' + err.message, 'error')
    } finally {
      setLoadingDetails(false)
    }
  }, [toast])

  useEffect(() => {
    loadSidebarData()
  }, [])

  useEffect(() => {
    if (selectedPageId) {
      loadPageDetails(selectedPageId)
    } else {
      setPageDetails(null)
    }
  }, [selectedPageId, loadPageDetails])

  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }))
  }

  // Handle Equipment Click to Report Fault
  const handleOpenFaultModal = async (eqDef) => {
    setSelectedEquipmentDef(eqDef)
    setFaultDescription('')
    setSelectedEquipmentInstanceId('')
    setShowModal(true)

    // Load actual physical branch equipments matching the active branchId
    if (!branchId) {
      toast('Şube bağlamı bulunamadı. Lütfen önce şube seçin.', 'warning')
      return
    }

    try {
      const res = await db.from('equipments')
        .select('id,name,code,active')
        .eq('branch_id', branchId)
        .eq('active', true)
        .order('name')

      if (res.error) throw new Error(res.error.message)
      
      const instances = res.data || []
      setBranchEquipments(instances)
      
      // Try to pre-select an instance that matches the global definition name
      const matched = instances.find(inst => inst.name?.toLowerCase().includes(eqDef.name?.toLowerCase()))
      if (matched) {
        setSelectedEquipmentInstanceId(matched.id)
      } else if (instances.length > 0) {
        setSelectedEquipmentInstanceId(instances[0].id)
      }
    } catch (err) {
      toast('Şube ekipmanları yüklenemedi: ' + err.message, 'error')
    }
  }

  const handleCloseFaultModal = () => {
    setShowModal(false)
    setSelectedEquipmentDef(null)
    setBranchEquipments([])
    setSelectedEquipmentInstanceId('')
    setFaultDescription('')
  }

  const handleSubmitFault = async (e) => {
    e.preventDefault()
    if (!selectedEquipmentInstanceId) {
      return toast('Lütfen arıza bildirmek istediğiniz cihazı seçin.', 'warning')
    }
    if (!faultDescription.trim()) {
      return toast('Arıza açıklaması girmek zorunludur.', 'warning')
    }

    setSubmittingFault(true)
    try {
      // Direct insert using our dynamic db client
      const res = await db.from('maintenance_tickets').insert({
        branch_id: branchId,
        equipment_id: selectedEquipmentInstanceId,
        description: faultDescription,
        status: 'open'
      })

      if (res.error) throw new Error(res.error.message)

      toast('Arıza kaydı başarıyla oluşturulmuştur.', 'success')
      handleCloseFaultModal()
    } catch (err) {
      toast('Arıza kaydı oluşturulamadı: ' + err.message, 'error')
    } finally {
      setSubmittingFault(false)
    }
  }

  // Lightweight Regex-based Markdown Parser
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

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-strong);">$1</strong>')
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Code blocks / inline code
    html = html.replace(/`(.*?)`/g, '<code style="font-family: monospace; background: var(--surface-2); padding: 2px 5px; borderRadius: 4px; fontSize: .85rem;">$1</code>')

    // Bullet Lists (unordered)
    html = html.replace(/^- (.*?)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc;">$1</li>')
    html = html.replace(/^\* (.*?)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc;">$1</li>')

    // Ordered Lists
    html = html.replace(/^\d+\.\s(.*)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: decimal;">$1</li>')

    // Break lines
    html = html.replace(/\n/g, '<br />')

    return <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: '1.65', color: 'var(--text-strong)', fontSize: '.92rem' }} />
  }

  return (
    <div className="page-enter" style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 24, maxWidth: 1300, margin: '0 auto' }}>
      
      {/* Left Sidebar Menu */}
      <div className="card hide-scrollbar" style={{ padding: '16px 12px', height: 'calc(100vh - 80px)', overflowY: 'auto', position: 'sticky', top: 24 }}>
        <h3 className="text-primary" style={{ fontSize: '.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 14px 6px', color: 'var(--text-strong)' }}>
          Kategoriler
        </h3>

        {loadingList ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Menü yükleniyor...
          </div>
        ) : categories.length === 0 ? (
          <div style={{ padding: 12, fontSize: '.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
            Kategori bulunamadı.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {categories.map(cat => {
              const catPages = pages.filter(p => p.category_id === cat.id)
              const isExpanded = !!expandedCategories[cat.id]

              return (
                <div key={cat.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '.82rem',
                      fontWeight: 700,
                      color: isExpanded ? 'var(--accent-primary)' : 'var(--text-strong)',
                      transition: '.15s'
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                  >
                    <i className={`fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: '.6rem', width: 10, opacity: 0.5 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                    <span className="badge bb" style={{ fontSize: '.6rem', padding: '1px 6px' }}>{catPages.length}</span>
                  </button>

                  {/* Category Pages */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 18, marginTop: 2, gap: 2 }}>
                      {catPages.length === 0 ? (
                        <span style={{ fontSize: '.75rem', color: 'var(--text-muted)', padding: '6px 12px' }}>Henüz sayfa yok</span>
                      ) : (
                        catPages.map(page => (
                          <button
                            key={page.id}
                            onClick={() => setSelectedPageId(page.id)}
                            style={{
                              background: selectedPageId === page.id ? 'var(--sidebar-active-bg)' : 'none',
                              border: 'none',
                              borderLeft: selectedPageId === page.id ? '2px solid var(--sidebar-active)' : '2px solid transparent',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontSize: '.78rem',
                              fontWeight: selectedPageId === page.id ? 700 : 500,
                              color: selectedPageId === page.id ? 'var(--sidebar-active)' : 'var(--text-strong)',
                              transition: '.15s'
                            }}
                            onMouseEnter={e => { if (selectedPageId !== page.id) e.currentTarget.style.background = 'var(--surface-2)' }}
                            onMouseLeave={e => { if (selectedPageId !== page.id) e.currentTarget.style.background = 'none' }}
                          >
                            <i className="fa-regular fa-file-lines" style={{ fontSize: '.7rem', opacity: 0.7 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right Content Area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {loadingDetails ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12, color: 'var(--accent-primary)' }} />
            <p style={{ margin: 0, fontSize: '.9rem' }}>İçerik yükleniyor, lütfen bekleyin...</p>
          </div>
        ) : !pageDetails ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-book-open fa-3x" style={{ marginBottom: 16, color: 'var(--border)' }} />
            <h2 className="text-primary" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
              Operasyon El Kitabı
            </h2>
            <p style={{ fontSize: '.82rem', margin: '8px 0 0' }}>
              Sol menüden okumak istediğiniz kılavuzu veya operasyon prosedürünü seçin.
            </p>
          </div>
        ) : (
          <>
            {/* Procedure Content Card */}
            <div className="card animate-fade-in" style={{ padding: 28 }}>
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: 16, marginBottom: 20 }}>
                <div>
                  <h1 className="text-primary" style={{ fontSize: '1.6rem', fontWeight: 900, margin: 0 }}>
                    {pageDetails.title}
                  </h1>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                    <span className="badge bb" style={{ fontSize: '.68rem' }}>
                      Sürüm: v{pageDetails.version}
                    </span>
                    <span style={{ fontSize: '.73rem', color: 'var(--text-muted)' }}>
                      Son Güncelleme: {new Date(pageDetails.updated_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>
                {pageDetails.last_updated_by_pin && (
                  <div style={{ background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 8, textAlign: 'right' }}>
                    <div style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Güncelleyen</div>
                    <div style={{ fontSize: '.78rem', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--text-strong)' }}>
                      PIN: {pageDetails.last_updated_by_pin}
                    </div>
                  </div>
                )}
              </div>

              {/* Recipe / Ingredients Widget */}
              {recipeContext.length > 0 && (
                <div style={{ background: 'var(--surface-2)', padding: '16px 20px', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 24 }}>
                  <h3 className="text-primary" style={{ margin: '0 0 12px', fontSize: '.95rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-list-ul" style={{ color: 'var(--accent-primary)' }}/>
                    İçindekiler / Reçete (Otomatik Sistem Bağlantısı)
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                    {recipeContext.map((r, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{r.name}</span>
                          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{r.qty} {r.unit}</span>
                        </div>
                        {r.linked_page_id && (
                          <button 
                            className="btn-p" 
                            style={{ padding: '4px 8px', fontSize: '.7rem', background: 'var(--accent-primary)', color: '#fff', border: 'none' }}
                            onClick={() => {
                              setSelectedPageId(r.linked_page_id)
                              // Otomatik scroll yukarı
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                            title={`${r.name} El Kitabına Git`}
                          >
                            <i className="fa-solid fa-link" style={{ marginRight: 4 }} /> Git
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Renders Content HTML */}
              <div style={{ minHeight: 180 }}>
                {renderMarkdown(pageDetails.content)}
              </div>
            </div>

            {/* Related Equipments Widget */}
            {pageDetails.equipments && pageDetails.equipments.length > 0 && (
              <div className="card" style={{ padding: 24 }}>
                <h3 className="text-primary" style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa-solid fa-screwdriver-wrench" style={{ color: 'var(--accent-primary)' }} />
                  Bu Prosedürde Kullanılan Ekipmanlar
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
                  {pageDetails.equipments.map(eq => (
                    <div
                      key={eq.id}
                      className="bg-surface-2 border-default"
                      style={{
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderStyle: 'solid',
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        transition: '.2s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          borderRadius: 8,
                          background: 'var(--surface)',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          border: '1px solid var(--border)'
                        }}>
                          {eq.image_url ? (
                            <img src={resolveImageUrl(eq.image_url)} alt={eq.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <i className="fa-solid fa-cube" style={{ color: 'var(--text-muted)' }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {eq.name}
                          </div>
                          {eq.maintenance_period_days && (
                            <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Bakım: {eq.maintenance_period_days} gün
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenFaultModal(eq)}
                        className="btn-o"
                        style={{
                          width: '100%',
                          justifyContent: 'center',
                          fontSize: '.75rem',
                          padding: '6px 12px',
                          borderRadius: 8
                        }}
                      >
                        <i className="fa-solid fa-triangle-exclamation" /> Arıza Bildir
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fault Logging Modal */}
      {showModal && selectedEquipmentDef && (
        <div className="modal-bg open" onClick={handleCloseFaultModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="text-primary" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                {selectedEquipmentDef.name} - Arıza Bildirimi
              </h3>
            </div>
            
            <form onSubmit={handleSubmitFault}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ background: 'var(--warning-bg)', color: 'var(--warning)', borderRadius: 10, padding: 12, fontSize: '.78rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ marginTop: 2 }} />
                  <span>Şubenizde kayıtlı olan fiziksel cihazı seçip arıza detaylarını girin. Bu bildirim teknik ekibe aktarılacaktır.</span>
                </div>

                <div>
                  <label className="f-label">Cihaz Seçimi</label>
                  {branchEquipments.length === 0 ? (
                    <div style={{
                      background: 'var(--danger-bg)',
                      color: 'var(--danger)',
                      padding: 10,
                      borderRadius: 8,
                      fontSize: '.78rem'
                    }}>
                      Bu şube için kayıtlı faal **{selectedEquipmentDef.name}** veya başka bir ekipman bulunamadı. Lütfen önce cihaz yöneticisinden şubenize cihaz ekleyin.
                    </div>
                  ) : (
                    <div className="sel-wrap">
                      <select
                        className="f-input"
                        value={selectedEquipmentInstanceId}
                        onChange={e => setSelectedEquipmentInstanceId(e.target.value)}
                      >
                        <option value="">-- Cihaz Seçin --</option>
                        {branchEquipments.map(inst => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name} {inst.code ? `(${inst.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="f-label">Arıza Açıklaması</label>
                  <textarea
                    className="f-input"
                    rows={4}
                    placeholder="Lütfen arızayı detaylı açıklayın. Cihaz çalışıyor mu? Sızıntı, koku veya anormal ses var mı?"
                    value={faultDescription}
                    onChange={e => setFaultDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-foot">
                <button type="button" className="btn-o" onClick={handleCloseFaultModal}>
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="btn-p"
                  disabled={submittingFault || branchEquipments.length === 0}
                  style={{ opacity: submittingFault ? 0.7 : 1 }}
                >
                  {submittingFault ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" /> Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-check" /> Bildirimi Kaydet
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
