import React, { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/hooks/useToast'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db, resolveImageUrl, buildApiUrl } from '@/lib/db'

export default function ManualReader() {
  const toast = useToast()
  const { branchId } = useWorkspace()

  const [categories, setCategories] = useState([])
  const [pages, setPages] = useState([])
  const [expandedCategories, setExpandedCategories] = useState({})
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [pageDetails, setPageDetails] = useState(null)
  const [recipeContext, setRecipeContext] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [loadingDetails, setLoadingDetails] = useState(false)

  // Fault Modal
  const [showModal, setShowModal] = useState(false)
  const [selectedEquipmentDef, setSelectedEquipmentDef] = useState(null)
  const [branchEquipments, setBranchEquipments] = useState([])
  const [selectedEquipmentInstanceId, setSelectedEquipmentInstanceId] = useState('')
  const [faultDescription, setFaultDescription] = useState('')
  const [submittingFault, setSubmittingFault] = useState(false)

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
      if (catsRes.data?.length > 0) {
        setExpandedCategories({ [catsRes.data[0].id]: true })
      }
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

  const toggleCategory = (catId) =>
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }))

  const handleOpenFaultModal = async (eqDef) => {
    setSelectedEquipmentDef(eqDef)
    setFaultDescription('')
    setSelectedEquipmentInstanceId('')
    setShowModal(true)
    if (!branchId) { toast('Şube bağlamı bulunamadı.', 'warning'); return }
    try {
      const res = await db.from('equipments').select('id,name,code,active').eq('branch_id', branchId).eq('active', true).order('name')
      if (res.error) throw new Error(res.error.message)
      const instances = res.data || []
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
      const res = await db.from('maintenance_tickets').insert({ branch_id: branchId, equipment_id: selectedEquipmentInstanceId, description: faultDescription, status: 'open' })
      if (res.error) throw new Error(res.error.message)
      toast('Arıza kaydı oluşturuldu.', 'success')
      handleCloseFaultModal()
    } catch (err) {
      toast('Arıza kaydı oluşturulamadı: ' + err.message, 'error')
    } finally {
      setSubmittingFault(false)
    }
  }

  // Get category name for the selected page
  const activeCategoryName = pageDetails
    ? categories.find(c => c.id === pageDetails.category_id)?.name || ''
    : ''

  return (
    <div className="page-enter" style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr)', gap: 24, maxWidth: 1300, margin: '0 auto' }}>

      {/* ── SIDEBAR ── */}
      <div className="card hide-scrollbar" style={{ padding: '16px 12px', height: 'calc(100vh - 80px)', overflowY: 'auto', position: 'sticky', top: 24 }}>
        <h3 style={{ fontSize: '.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', margin: '0 0 14px 6px', color: 'var(--text-muted)' }}>
          El Kitabı
        </h3>
        {loadingList ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} /> Yükleniyor...
          </div>
        ) : categories.length === 0 ? (
          <div style={{ padding: 12, fontSize: '.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>Kategori bulunamadı.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categories.map(cat => {
              const catPages = pages.filter(p => p.category_id === cat.id)
              const isExpanded = !!expandedCategories[cat.id]
              return (
                <div key={cat.id}>
                  <button onClick={() => toggleCategory(cat.id)} style={{
                    background: 'none', border: 'none', display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                    textAlign: 'left', fontSize: '.82rem', fontWeight: 700,
                    color: isExpanded ? 'var(--accent-primary)' : 'var(--text-strong)', transition: '.15s'
                  }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                  >
                    <i className={`fa-solid fa-chevron-${isExpanded ? 'down' : 'right'}`} style={{ fontSize: '.58rem', width: 10, opacity: 0.45 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                    <span className="badge bb" style={{ fontSize: '.58rem', padding: '1px 5px' }}>{catPages.length}</span>
                  </button>
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 16, marginTop: 2, gap: 1 }}>
                      {catPages.length === 0 ? (
                        <span style={{ fontSize: '.73rem', color: 'var(--text-muted)', padding: '5px 12px' }}>Henüz sayfa yok</span>
                      ) : catPages.map(page => (
                        <button key={page.id} onClick={() => { setSelectedPageId(page.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                          style={{
                            background: selectedPageId === page.id ? 'var(--sidebar-active-bg)' : 'none',
                            border: 'none',
                            borderLeft: selectedPageId === page.id ? '2px solid var(--sidebar-active)' : '2px solid transparent',
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '5px 12px', cursor: 'pointer', textAlign: 'left',
                            fontSize: '.76rem', fontWeight: selectedPageId === page.id ? 700 : 500,
                            color: selectedPageId === page.id ? 'var(--sidebar-active)' : 'var(--text-strong)',
                            transition: '.12s', borderRadius: '0 6px 6px 0'
                          }}
                          onMouseEnter={e => { if (selectedPageId !== page.id) e.currentTarget.style.background = 'var(--surface-2)' }}
                          onMouseLeave={e => { if (selectedPageId !== page.id) e.currentTarget.style.background = 'none' }}
                        >
                          <i className="fa-regular fa-file-lines" style={{ fontSize: '.65rem', opacity: 0.6 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div>
        {loadingDetails ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12, color: 'var(--accent-primary)' }} />
            <p style={{ margin: 0, fontSize: '.9rem' }}>Yükleniyor...</p>
          </div>
        ) : !pageDetails ? (
          <div className="card" style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-book-open fa-3x" style={{ marginBottom: 20, color: 'var(--border)' }} />
            <h2 style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-strong)' }}>Operasyon El Kitabı</h2>
            <p style={{ fontSize: '.85rem', margin: 0 }}>Sol menüden bir prosedür veya ürün kılavuzu seçin.</p>
          </div>
        ) : (
          /* ── A4 STYLE PAGE ── */
          <div style={{ background: '#fff', color: '#222', padding: '32px 40px', borderRadius: 10, boxShadow: '0 4px 24px rgba(0,0,0,0.1)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>

            {/* Header */}
            <div style={{ borderBottom: '2.5px solid #14496b', paddingBottom: 12, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '.65rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 3 }}>İşletme ve Eğitim El Kitabı</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#14496b' }}>{pageDetails.title}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span style={{ fontSize: '.65rem', color: '#bbb' }}>v{pageDetails.version} • {new Date(pageDetails.updated_at).toLocaleDateString('tr-TR')}</span>
                {activeCategoryName && (
                  <span style={{ fontSize: '.65rem', background: '#eef4ff', color: '#14496b', padding: '2px 8px', borderRadius: 20, fontWeight: 600, border: '1px solid #c8d9f5' }}>{activeCategoryName}</span>
                )}
              </div>
            </div>

            {/* Hero Row: Product Image + Recipe */}
            {(pageDetails.metadata?.product_image || recipeContext.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: pageDetails.metadata?.product_image ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 28, alignItems: 'start' }}>
                {/* Product Image */}
                {pageDetails.metadata?.product_image && (
                  <div style={{ borderRadius: 10, overflow: 'hidden', background: '#f5f6f8', border: '1px solid #e8e8e8', aspectRatio: '4/3' }}>
                    <img src={resolveImageUrl(pageDetails.metadata.product_image)} alt={pageDetails.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                )}

                {/* Recipe */}
                {recipeContext.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2 }} />
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>Reçete</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1.5px solid #14496b' }}>
                          <th style={{ padding: '4px 6px', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase' }}>Malzeme</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase' }}>Miktar</th>
                          <th style={{ padding: '4px 6px', textAlign: 'center', color: '#666', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase' }}>Kılavuz</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipeContext.map((r, i) => {
                          const targetPageId = r.linked_page_id || pages.find(p => p.title?.toLowerCase().trim() === r.name?.toLowerCase().trim())?.id;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                              <td style={{ padding: '5px 6px' }}>
                                {targetPageId ? (
                                  <span
                                    onClick={() => { setSelectedPageId(targetPageId); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                    style={{
                                      color: '#14496b',
                                      fontWeight: '600',
                                      cursor: 'pointer',
                                      textDecoration: 'underline',
                                      textDecorationColor: 'rgba(20, 73, 107, 0.4)'
                                    }}
                                    title={`${r.name} kılavuzuna git`}
                                  >
                                    {r.name}
                                  </span>
                                ) : (
                                  <span style={{ color: '#333' }}>{r.name}</span>
                                )}
                              </td>
                              <td style={{ padding: '5px 6px', textAlign: 'right', color: '#555', fontWeight: 600 }}>{r.qty} {r.unit}</td>
                              <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                                {targetPageId ? (
                                  <button
                                    onClick={() => { setSelectedPageId(targetPageId); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                    style={{ background: '#eef4ff', color: '#14496b', border: '1px solid #c8d9f5', borderRadius: 12, padding: '2px 8px', fontSize: '.65rem', fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    <i className="fa-solid fa-arrow-right" style={{ marginRight: 3 }} />Kılavuza Git
                                  </button>
                                ) : (
                                  <span style={{ color: '#ddd', fontSize: '.65rem' }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Equipment pills */}
                    {pageDetails.equipments?.length > 0 && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2 }} />
                          <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>Ekipmanlar</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {pageDetails.equipments.map(eq => (
                            <button key={eq.id}
                              onClick={() => handleOpenFaultModal(eq)}
                              title="Arıza Bildir"
                              style={{ padding: '4px 10px', background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 20, fontSize: '.7rem', color: '#b91c1c', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                            >
                              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '.6rem' }} />
                              {eq.name}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '.62rem', color: '#bbb', marginTop: 5 }}>Ekipmana tıklayarak arıza bildiriminde bulunabilirsiniz.</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Steps — alternating layout */}
            {pageDetails.metadata?.steps?.length > 0 && (() => {
              const validSteps = pageDetails.metadata.steps.filter(s => s.description?.trim() || s.imageUrl)
              if (validSteps.length === 0) return null
              return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2 }} />
                    <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                      {validSteps.length > 1 ? 'Hazırlık Adımları' : 'Hazırlık Prosedürü'}
                    </span>
                  </div>
                  {pageDetails.metadata.steps.map((step, idx) => {
                    const isEven = idx % 2 === 0
                    const hasImg = !!step.imageUrl
                    return (
                      <div key={idx} style={{
                        display: 'flex', flexDirection: isEven ? 'row' : 'row-reverse',
                        marginBottom: 10, borderRadius: 8, overflow: 'hidden',
                        border: '1px solid #e8e8e8', background: '#fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.05)', minHeight: 80,
                      }}>
                        <div style={{
                          width: hasImg ? 150 : 44, flexShrink: 0,
                          background: hasImg ? '#f5f6f8' : '#14496b',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          {hasImg ? (
                            <>
                              <img src={resolveImageUrl(step.imageUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                              <div style={{
                                position: 'absolute', top: 6, [isEven ? 'right' : 'left']: 6,
                                width: 22, height: 22, borderRadius: '50%',
                                background: '#14496b', color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '.65rem', fontWeight: 800,
                                boxShadow: '0 1px 4px rgba(0,0,0,0.4)'
                              }}>{idx + 1}</div>
                            </>
                          ) : (
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'rgba(255,255,255,0.55)' }}>{idx + 1}</div>
                          )}
                        </div>
                        <div style={{
                          flex: 1, padding: '14px 18px', display: 'flex', alignItems: 'center',
                          fontSize: '.88rem', color: '#2d2d2d', lineHeight: 1.65,
                          borderLeft: isEven ? '3px solid #14496b' : 'none',
                          borderRight: isEven ? 'none' : '3px solid #14496b',
                        }}>
                          {step.description || <span style={{ color: '#ccc', fontStyle: 'italic' }}>Açıklama girilmedi</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Markdown Content (for non-product pages) */}
            {pageDetails.content && (
              <div style={{ marginBottom: 24, lineHeight: 1.75, fontSize: '.9rem', color: '#333' }}>
                <div dangerouslySetInnerHTML={{ __html: pageDetails.content
                  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/^# (.*)$/gm, '<h1 style="font-size:1.4rem;font-weight:800;margin:20px 0 10px;color:#14496b;border-bottom:1px solid #e8e8e8;padding-bottom:6px">$1</h1>')
                  .replace(/^## (.*)$/gm, '<h2 style="font-size:1.15rem;font-weight:700;margin:16px 0 8px;color:#1a3a50">$1</h2>')
                  .replace(/^### (.*)$/gm, '<h3 style="font-size:1rem;font-weight:700;margin:12px 0 6px;color:#2d5270">$1</h3>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  .replace(/^- (.*)$/gm, '<li style="margin-left:18px;margin-bottom:5px;list-style-type:disc">$1</li>')
                  .replace(/^\d+\.\s(.*)$/gm, '<li style="margin-left:18px;margin-bottom:5px;list-style-type:decimal">$1</li>')
                  .replace(/\n/g, '<br />')
                }} />
              </div>
            )}

            {/* Footer */}
            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 20, display: 'flex', justifyContent: 'space-between', color: '#bbb', fontSize: '.65rem' }}>
              <span>{activeCategoryName}</span>
              <span>{pageDetails.title}</span>
              <span>v{pageDetails.version}</span>
            </div>
          </div>
        )}
      </div>

      {/* Fault Modal */}
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
                    <div className="sel-wrap">
                      <select className="f-input" value={selectedEquipmentInstanceId} onChange={e => setSelectedEquipmentInstanceId(e.target.value)}>
                        <option value="">-- Cihaz Seçin --</option>
                        {branchEquipments.map(inst => (
                          <option key={inst.id} value={inst.id}>{inst.name} {inst.code ? `(${inst.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
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
