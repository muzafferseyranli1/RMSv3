import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { createQualityReport, fetchQualityReports, updateQualityReportStatus } from '@/lib/qualityReportService'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'

const SEVERITY_MAP = {
  low: { label: 'Düşük', color: '#94a3b8', bg: 'rgba(148,163,184,.1)' },
  normal: { label: 'Normal', color: '#3b82f6', bg: 'rgba(59,130,246,.1)' },
  high: { label: 'Yüksek', color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
  critical: { label: 'Kritik', color: '#ef4444', bg: 'rgba(239,68,68,.1)' },
}

const STATUS_MAP = {
  open: { label: 'Açık / İhbar', color: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
  under_review: { label: 'İncelemede', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  resolved: { label: 'Çözüldü', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  closed: { label: 'Kapatıldı', color: '#64748b', bg: 'rgba(100,116,139,.15)' },
}

export default function QualityReports() {
  const navigate = useNavigate()
  const toast = useToast()
  const { branchId, branchName, branches, scope } = useWorkspace()

  const [reports, setReports] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [allNodes, setAllNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('list') // 'list' | 'create'
  const [filterStatus, setFilterStatus] = useState(null)
  
  // Create Form State
  const [form, setForm] = useState({
    branchId: branchId || '',
    productName: '',
    stockItemId: '',
    supplierName: '',
    description: '',
    severity: 'normal',
    photoUrls: [],
  })
  
  const [uploading, setUploading] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  
  const getActiveUser = () => {
    try {
      return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')
    } catch {
      return null
    }
  }

  const isHQUser = scope === 'center' || scope === 'admin'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const qParams = {}
      if (!isHQUser) {
        qParams.branchId = branchId || 'UNAUTHORIZED_EMPTY_BRANCH'
      }
      if (filterStatus) {
        qParams.status = filterStatus
      }

      const [reportsRes, stockRes, nodesRes] = await Promise.all([
        fetchQualityReports(qParams),
        db.from('stock_items').select('id,name').limit(150),
        db.from('company_nodes').select('id,name')
      ])

      setReports(reportsRes.data || [])
      setStockItems(stockRes.data || [])
      setAllNodes(nodesRes.data || [])
    } catch (e) {
      console.error(e)
      toast('Veriler yüklenirken hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }, [branchId, filterStatus, isHQUser, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const data = await uploadApiFile(formData)
      if (data?.file_url) {
        setForm(prev => ({
          ...prev,
          photoUrls: [...prev.photoUrls, data.file_url]
        }))
        toast('Fotoğraf yüklendi', 'success')
      }
    } catch (err) {
      toast('Fotoğraf yüklenemedi: ' + err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleCreateReport = async () => {
    const activeStaff = getActiveUser()
    const targetBranch = !isHQUser ? branchId : (form.branchId || null)
    
    if (!targetBranch) return toast('Şube seçimi zorunludur', 'warning')
    if (!form.productName.trim() && !form.stockItemId) return toast('Ürün adı seçimi veya girişi zorunludur', 'warning')
    if (!form.description.trim()) return toast('Açıklama alanı zorunludur', 'warning')

    let resolvedProductName = form.productName
    if (form.stockItemId) {
      resolvedProductName = stockItems.find(item => item.id === form.stockItemId)?.name || form.productName
    }

    try {
      const { error } = await createQualityReport({
        branchId: targetBranch,
        reportedBy: activeStaff?.id || 'system',
        productName: resolvedProductName,
        stockItemId: form.stockItemId || null,
        supplierName: form.supplierName || null,
        description: form.description,
        severity: form.severity,
        photoUrls: form.photoUrls,
      }, activeStaff?.id)

      if (error) throw error

      toast('Kalite bildirim raporu başarıyla oluşturuldu ve geribildirim atandı', 'success')
      setForm({
        branchId: branchId || '',
        productName: '',
        stockItemId: '',
        supplierName: '',
        description: '',
        severity: 'normal',
        photoUrls: [],
      })
      setActiveTab('list')
      loadData()
    } catch (err) {
      toast('Rapor oluşturulamadı: ' + err.message, 'error')
    }
  }

  const handleStatusChange = async (reportId, newStatus) => {
    const activeStaff = getActiveUser()
    let note = null
    
    if (newStatus === 'resolved') {
      note = window.prompt('Hata çözüm veya aksiyon notu yazın:')
      if (note === null) return // cancelled
      if (!note.trim()) {
        toast('Aksiyon notu zorunludur', 'warning')
        return
      }
    }

    try {
      await updateQualityReportStatus(reportId, newStatus, note, activeStaff?.id || 'system')
      toast('Durum başarıyla güncellendi', 'success')
      
      // Update selected report view
      if (selectedReport?.id === reportId) {
        setSelectedReport(prev => ({
          ...prev,
          status: newStatus,
          resolution_note: note || prev.resolution_note
        }))
      }
      
      loadData()
    } catch (err) {
      toast('Durum güncellenemedi', 'error')
    }
  }

  const getBranchName = (bId) => {
    if (!bId) return 'Genel Merkez'
    return allNodes.find(n => n.id === bId)?.name || branches.find(b => b.id === bId)?.name || bId
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-square-poll-horizontal" style={{ color: '#ef4444', fontSize: '1.1rem' }} />
            </span>
            Standart Dışı Ürün Bildirimleri
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>
            Şubelerden kalite, porsiyonlama veya tedarikçi bazlı standart sapma ihbarlarını yönetin.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          {activeTab === 'list' ? (
            <button className="btn-p" onClick={() => setActiveTab('create')} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-plus" /> Yeni Bildirim Yap
            </button>
          ) : (
            <button className="btn-o" onClick={() => setActiveTab('list')}>
              Bildirim Listesine Dön
            </button>
          )}
        </div>
      </div>

      {activeTab === 'create' ? (
        /* Create Quality Report Form */
        <div className="card" style={{ padding: 28, maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 0, marginBottom: 20 }}>
            Yeni Kalite ve Standart Dışı Ürün Raporu
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Branch Selection */}
            <div>
              <label className="f-label">Bildirim Yapan Şube</label>
              {branchId ? (
                <input
                  type="text"
                  value={branchName || 'Şube'}
                  className="f-input"
                  disabled
                  style={{ background: 'var(--surface-2)', opacity: 0.8 }}
                />
              ) : (
                <div className="sel-wrap">
                  <select
                    value={form.branchId}
                    onChange={e => setForm(p => ({ ...p, branchId: e.target.value }))}
                    className="f-input"
                  >
                    <option value="">Şube Seçiniz</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Product Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="f-label">Stok Ürünü Seçin (Varsa)</label>
                <div className="sel-wrap">
                  <select
                    value={form.stockItemId}
                    onChange={e => setForm(p => ({ ...p, stockItemId: e.target.value }))}
                    className="f-input"
                  >
                    <option value="">Serbest Metin Girişi Yapacağım</option>
                    {stockItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="f-label">Ürün Adı (Seçmediyseniz Yazın)</label>
                <input
                  type="text"
                  placeholder="Seçmediyseniz ürün adını yazın..."
                  value={form.productName}
                  onChange={e => setForm(p => ({ ...p, productName: e.target.value }))}
                  disabled={!!form.stockItemId}
                  className="f-input"
                  style={form.stockItemId ? { background: 'var(--surface-2)', opacity: 0.6 } : {}}
                />
              </div>
            </div>

            {/* Supplier & Severity */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label className="f-label">Tedarikçi Firma / Kişi (Opsiyonel)</label>
                <input
                  type="text"
                  placeholder="Tedarikçi firma adı..."
                  value={form.supplierName}
                  onChange={e => setForm(p => ({ ...p, supplierName: e.target.value }))}
                  className="f-input"
                />
              </div>
              <div>
                <label className="f-label">Kritiklik / Hasar Derecesi</label>
                <div className="sel-wrap">
                  <select
                    value={form.severity}
                    onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}
                    className="f-input"
                  >
                    {Object.entries(SEVERITY_MAP).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="f-label">Sorun / Hata Detayı</label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={4}
                placeholder="Standart dışı ürünün hatasını, kokusunu, porsiyonlama eksiğini detaylandırın..."
                className="f-input"
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Photo upload */}
            <div>
              <label className="f-label">Kanıt Fotoğrafları Ekle</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {form.photoUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img src={buildApiUrl(url)} alt="Kanıt" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                    <button
                      type="button"
                      onClick={() => setForm(prev => ({ ...prev, photoUrls: prev.photoUrls.filter((_, idx) => idx !== i) }))}
                      style={{
                        position: 'absolute', top: -5, right: -5, background: '#ef4444', color: '#fff',
                        border: 'none', borderRadius: '50%', width: 18, height: 18, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: '11px', cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <label
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.8rem',
                  padding: '8px 14px', border: '1px dashed #3b82f6', borderRadius: 8,
                  color: '#3b82f6', cursor: 'pointer', fontWeight: 600
                }}
              >
                <i className="fa-solid fa-camera" />
                {uploading ? 'Yükleniyor...' : 'Kamera / Dosyadan Fotoğraf Ekle'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  disabled={uploading}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn-o" onClick={() => setActiveTab('list')}>İptal</button>
              <button className="btn-p" onClick={handleCreateReport}>Bildirimi Gönder</button>
            </div>
          </div>
        </div>
      ) : (
        /* Quality Report List & Details Layout */
        <div style={{ display: 'flex', gap: 20 }}>
          
          {/* List side */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Status quick filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                className="btn-o"
                onClick={() => setFilterStatus(null)}
                style={{ fontSize: '.75rem', fontWeight: !filterStatus ? 700 : 500, borderColor: !filterStatus ? '#6366f1' : undefined }}
              >
                Tümü
              </button>
              {Object.entries(STATUS_MAP).map(([key, val]) => (
                <button
                  key={key}
                  className="btn-o"
                  onClick={() => setFilterStatus(key)}
                  style={{
                    fontSize: '.75rem', fontWeight: filterStatus === key ? 700 : 500,
                    color: filterStatus === key ? val.color : undefined,
                    borderColor: filterStatus === key ? val.color : undefined,
                  }}
                >
                  {val.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-spinner fa-spin fa-2x" />
              </div>
            ) : reports.length === 0 ? (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-clipboard-question fa-2x" style={{ marginBottom: 12, opacity: 0.3 }} />
                <div>Bildirim bulunmuyor.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reports.map(report => {
                  const s = STATUS_MAP[report.status] || STATUS_MAP.open
                  const sev = SEVERITY_MAP[report.severity] || SEVERITY_MAP.normal
                  const isSelected = selectedReport?.id === report.id
                  return (
                    <div
                      key={report.id}
                      className="card"
                      onClick={() => setSelectedReport(report)}
                      style={{
                        padding: 14, cursor: 'pointer',
                        borderColor: isSelected ? '#6366f1' : undefined,
                        background: isSelected ? 'rgba(99,102,241,.05)' : undefined,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyItems: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                              {report.product_name}
                            </span>
                            <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: s.bg, color: s.color }}>
                              {s.label}
                            </span>
                            <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: sev.bg, color: sev.color }}>
                              {sev.label} Derece
                            </span>
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                            <strong>{getBranchName(report.branch_id)}</strong> • Tarih: {new Date(report.created_at).toLocaleDateString('tr-TR')}
                            {report.supplier_name ? ` • Tedarikçi: ${report.supplier_name}` : ''}
                          </div>
                        </div>
                        <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Details side (if selected) */}
          {selectedReport && (
            <div className="card" style={{ width: 400, padding: 20, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ fontWeight: 800, fontSize: '.85rem', color: 'var(--text-strong)' }}>
                  Bildirim Detayı
                </span>
                <button className="btn-g" onClick={() => setSelectedReport(null)} style={{ padding: '4px 8px' }}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              {/* Actions for HQ */}
              {isHQUser && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {selectedReport.status === 'open' && (
                    <button onClick={() => handleStatusChange(selectedReport.id, 'under_review')} className="btn-o" style={{ fontSize: '.7rem', color: '#f59e0b', borderColor: '#f59e0b', flex: 1 }}>
                      <i className="fa-solid fa-magnifying-glass" style={{ marginRight: 4 }} /> İncelemeye Al
                    </button>
                  )}
                  {['open', 'under_review'].includes(selectedReport.status) && (
                    <button onClick={() => handleStatusChange(selectedReport.id, 'resolved')} className="btn-o" style={{ fontSize: '.7rem', color: '#10b981', borderColor: '#10b981', flex: 1 }}>
                      <i className="fa-solid fa-check" style={{ marginRight: 4 }} /> Çözüldü Yap
                    </button>
                  )}
                  {selectedReport.status === 'resolved' && (
                    <button onClick={() => handleStatusChange(selectedReport.id, 'closed')} className="btn-p" style={{ fontSize: '.7rem', background: '#4b5563', flex: 1 }}>
                      <i className="fa-solid fa-lock" style={{ marginRight: 4 }} /> Kapat
                    </button>
                  )}
                </div>
              )}

              {/* Data fields */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                <div><strong style={{ color: 'var(--text-strong)' }}>Şube:</strong> {getBranchName(selectedReport.branch_id)}</div>
                <div><strong style={{ color: 'var(--text-strong)' }}>Ürün:</strong> {selectedReport.product_name}</div>
                {selectedReport.supplier_name && <div><strong style={{ color: 'var(--text-strong)' }}>Tedarikçi:</strong> {selectedReport.supplier_name}</div>}
                <div><strong style={{ color: 'var(--text-strong)' }}>Önem Seviyesi:</strong> {SEVERITY_MAP[selectedReport.severity]?.label || selectedReport.severity}</div>
                <div><strong style={{ color: 'var(--text-strong)' }}>Durum:</strong> {STATUS_MAP[selectedReport.status]?.label || selectedReport.status}</div>
                <div><strong style={{ color: 'var(--text-strong)' }}>Oluşturulma:</strong> {new Date(selectedReport.created_at).toLocaleString('tr-TR')}</div>
                
                 {/* Associated Ticket */}
                 {selectedReport.ticket_id && (
                   <div style={{ marginTop: 6 }}>
                     <strong style={{ color: 'var(--text-strong)' }}>İlişkili Geribildirim: </strong>
                     <button
                       onClick={() => navigate(`/geribildirimler/${selectedReport.ticket_id}`)}
                       className="btn-o"
                       style={{ padding: '2px 8px', fontSize: '.7rem', color: '#3b82f6', borderColor: '#3b82f6' }}
                     >
                       #{String(selectedReport.ticket_id).slice(0, 8)} Görüntüle
                     </button>
                   </div>
                 )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                  <strong style={{ color: 'var(--text-strong)', display: 'block', marginBottom: 4 }}>Açıklama:</strong>
                  <div style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 6, color: 'var(--text-strong)' }}>
                    {selectedReport.description}
                  </div>
                </div>

                {selectedReport.resolution_note && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                    <strong style={{ color: '#10b981', display: 'block', marginBottom: 4 }}>Çözüm / Aksiyon Notu:</strong>
                    <div style={{ padding: 8, background: 'rgba(16,185,129,.04)', border: '1px solid rgba(16,185,129,.15)', borderRadius: 6, color: 'var(--text-strong)' }}>
                      {selectedReport.resolution_note}
                    </div>
                  </div>
                )}
              </div>

              {/* Photos Gallery */}
              {Array.isArray(selectedReport.photo_urls) && selectedReport.photo_urls.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <strong style={{ color: 'var(--text-strong)', display: 'block', marginBottom: 6 }}>Kanıt Görselleri:</strong>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {selectedReport.photo_urls.map((photo, index) => (
                      <a key={index} href={buildApiUrl(photo)} target="_blank" rel="noopener noreferrer">
                        <img
                          src={buildApiUrl(photo)}
                          alt="Hata kanıtı"
                          style={{
                            width: 60, height: 60, objectFit: 'cover', borderRadius: 6,
                            border: '1px solid var(--border)', cursor: 'zoom-in'
                          }}
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}
