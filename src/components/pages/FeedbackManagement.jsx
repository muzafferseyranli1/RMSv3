import React, { useState, useEffect, useCallback } from 'react'
import { fetchFeedbackList, triageFeedbackToTicket, shouldAutoCreateTicket, detectCategorySuggestion, createManualFeedback } from '@/lib/feedbackService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/useToast'

const RATING_COLORS = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#22c55e',
  5: '#10b981',
}

const RATING_LABELS = {
  1: 'Çok Kötü',
  2: 'Kötü',
  3: 'Orta',
  4: 'İyi',
  5: 'Çok İyi',
}

const SOURCE_LABELS = {
  qr_menu: 'QR Menü',
  call_center: 'Çağrı Merkezi',
  social_media: 'Sosyal Medya',
  google_review: 'Google Yorum',
  digital_receipt: 'Dijital Fiş',
  tablet: 'Tablet',
  manual: 'Manuel',
}

const SOURCE_ICONS = {
  qr_menu: 'fa-qrcode',
  call_center: 'fa-headset',
  social_media: 'fa-share-nodes',
  google_review: 'fa-google',
  digital_receipt: 'fa-receipt',
  tablet: 'fa-tablet-screen-button',
  manual: 'fa-hand',
}

export default function FeedbackManagement() {
  const [feedbackList, setFeedbackList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ rating: null })
  const [selectedFb, setSelectedFb] = useState(null)
  const [ticketCreating, setTicketCreating] = useState(false)
  const { branchId, branches } = useWorkspace()
  const { user } = useAuth()
  const toast = useToast()

  // Import State
  const [showImport, setShowImport] = useState(false)
  const [importForm, setImportForm] = useState({
    branchId: branchId || '',
    source: 'google_review',
    rating: 3,
    comment: '',
    url: '',
  })

  const loadFeedback = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchFeedbackList({ branchId, ratingFilter: filter.rating })
    if (error) toast('Geri bildirimler yüklenemedi', 'error')
    else setFeedbackList(data || [])
    setLoading(false)
  }, [branchId, filter.rating, toast])

  useEffect(() => { loadFeedback() }, [loadFeedback])

  const handleCreateTicket = async (feedback) => {
    setTicketCreating(true)
    const result = await triageFeedbackToTicket(feedback, { actorId: user?.id })
    setTicketCreating(false)
    if (result?.error) return toast('Geribildirim oluşturulamadı', 'error')
    if (result?.data) {
      toast('Geribildirim oluşturuldu ve otomatik atandı', 'success')
      loadFeedback()
    } else {
      toast('Bu müşteri yorumu geribildirim eşiğinde değil', 'info')
    }
  }

  const handleImportFeedback = async () => {
    const targetBranch = branchId || importForm.branchId || null
    if (!importForm.comment.trim()) return toast('Yorum içeriği gereklidir', 'warning')
    if (!importForm.url.trim()) return toast('Kaynak bağlantısı (URL) gereklidir', 'warning')

    try {
      const { data, error } = await createManualFeedback({
        branchId: targetBranch,
        source: importForm.source,
        rating: Number(importForm.rating),
        comment: importForm.comment,
        metadata: { url: importForm.url },
        staffId: user?.id,
      })

      if (error) throw error

      toast('Geri bildirim başarıyla içe aktarıldı ve triage edildi', 'success')
      setShowImport(false)
      setImportForm({
        branchId: branchId || '',
        source: 'google_review',
        rating: 3,
        comment: '',
        url: '',
      })
      loadFeedback()
    } catch (e) {
      toast('İçe aktarma başarısız: ' + e.message, 'error')
    }
  }

  // Stats
  const totalCount = feedbackList.length
  const avgRating = totalCount > 0 ? (feedbackList.reduce((s, f) => s + (Number(f.rating) || 0), 0) / totalCount).toFixed(1) : '—'
  const lowRatingCount = feedbackList.filter(f => (Number(f.rating) || 5) <= 2).length
  const withTicketCount = feedbackList.filter(f => f.ticket_id).length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(244,114,182,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-comment-dots" style={{ color: '#f472b6', fontSize: '1rem' }} />
            </span>
            Geri Bildirimler
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>
            QR menü, çağrı merkezi, Google yorumları ve sosyal medyadan gelen müşteri bildirimleri.
          </p>
        </div>
        <button className="btn-p" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-file-import" /> Harici Kaynaktan Aktar
        </button>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Toplam Geri Bildirim', value: totalCount, icon: 'fa-inbox', color: '#3b82f6' },
          { label: 'Ortalama Puan', value: avgRating, icon: 'fa-star', color: '#f59e0b' },
          { label: 'Düşük Puan (≤2)', value: lowRatingCount, icon: 'fa-triangle-exclamation', color: '#ef4444' },
          { label: 'Geribildirim Bağlı', value: withTicketCount, icon: 'fa-comments', color: '#8b5cf6' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: `${stat.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fa-solid ${stat.icon}`} style={{ color: stat.color, fontSize: '.9rem' }} />
            </span>
            <div>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--text-strong)' }}>{stat.value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="card" style={{ padding: 24, marginBottom: 20, borderLeft: '4px solid #f472b6', background: 'var(--surface-1)' }}>
          <div style={{ fontWeight: 800, fontSize: '.95rem', marginBottom: 16, color: 'var(--text-strong)' }}>
            Harici Müşteri Yorumu İçe Aktar (Google / Sosyal Medya)
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label className="f-label">İlgili Şube</label>
              {branchId ? (
                <input
                  type="text"
                  value={branches.find(b => b.id === branchId)?.name || 'Şube'}
                  className="f-input"
                  disabled
                  style={{ background: 'var(--surface-2)', opacity: 0.8 }}
                />
              ) : (
                <div className="sel-wrap">
                  <select
                    value={importForm.branchId}
                    onChange={e => setImportForm(p => ({ ...p, branchId: e.target.value }))}
                    className="f-input"
                  >
                    <option value="">Genel Merkez</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="f-label">Kaynak Kanal</label>
              <div className="sel-wrap">
                <select
                  value={importForm.source}
                  onChange={e => setImportForm(p => ({ ...p, source: e.target.value }))}
                  className="f-input"
                >
                  <option value="google_review">Google Yorumu</option>
                  <option value="social_media">Sosyal Medya (Instagram/X/FB)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="f-label">Yıldız Puanı (1-5)</label>
              <div className="sel-wrap">
                <select
                  value={importForm.rating}
                  onChange={e => setImportForm(p => ({ ...p, rating: e.target.value }))}
                  className="f-input"
                >
                  {[5, 4, 3, 2, 1].map(r => (
                    <option key={r} value={r}>{'⭐'.repeat(r)} ({r} Yıldız)</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="f-label">Gönderi / Yorum Bağlantısı (URL)</label>
              <input
                type="text"
                placeholder="Google Yorumu bağlantısı veya sosyal medya gönderi linki..."
                value={importForm.url}
                onChange={e => setImportForm(p => ({ ...p, url: e.target.value }))}
                className="f-input"
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label className="f-label">Yorum İçeriği</label>
              <textarea
                placeholder="Müşterinin yazdığı yorumu aynen yapıştırın..."
                value={importForm.comment}
                onChange={e => setImportForm(p => ({ ...p, comment: e.target.value }))}
                rows={3}
                className="f-input"
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Developer Note */}
          <div style={{
            padding: 12, borderRadius: 8, background: 'rgba(245,158,11,.05)',
            border: '1px solid rgba(245,158,11,.2)', fontSize: '.78rem', color: 'var(--text-strong)',
            marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start'
          }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ color: '#f59e0b', marginTop: 3 }} />
            <div>
              <strong>⚠️ API Entegrasyon Notu:</strong> Bu alana daha sonra Google Business Profile API ve Sosyal Medya Webhook / API entegrasyonu kurularak yorumların otomatik çekilmesi sağlanmalıdır.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-o" onClick={() => setShowImport(false)}>İptal</button>
            <button className="btn-p" onClick={handleImportFeedback}>İçe Aktar ve Kaydet</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className="btn-o"
          onClick={() => setFilter(p => ({ ...p, rating: null }))}
          style={{ fontSize: '.78rem', fontWeight: filter.rating === null ? 700 : 500, borderColor: filter.rating === null ? 'var(--accent-primary)' : undefined, background: filter.rating === null ? 'var(--sidebar-active-bg)' : undefined }}
        >
          Tümü
        </button>
        {[1, 2, 3, 4, 5].map(r => (
          <button
            key={r}
            className="btn-o"
            onClick={() => setFilter(p => ({ ...p, rating: r }))}
            style={{ fontSize: '.78rem', fontWeight: filter.rating === r ? 700 : 500, borderColor: filter.rating === r ? RATING_COLORS[r] : undefined, color: filter.rating === r ? RATING_COLORS[r] : undefined, background: filter.rating === r ? `${RATING_COLORS[r]}11` : undefined }}
          >
            {'⭐'.repeat(r)} {RATING_LABELS[r]}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-inbox fa-3x" style={{ marginBottom: 16, opacity: .3 }} />
          <div style={{ fontWeight: 700 }}>Geri bildirim bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {feedbackList.map(fb => {
            const rating = Number(fb.rating) || 0
            const isRisky = shouldAutoCreateTicket(fb)
            const categorySuggestion = detectCategorySuggestion(fb.comment)
            const sourceIcon = SOURCE_ICONS[fb.source] || 'fa-comment'
            return (
              <div key={fb.id} className="card" style={{ padding: 16, cursor: 'pointer', borderColor: isRisky ? 'rgba(239,68,68,.3)' : undefined, background: isRisky ? 'rgba(239,68,68,.02)' : undefined }}
                onClick={() => setSelectedFb(selectedFb?.id === fb.id ? null : fb)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Rating Badge */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, background: `${RATING_COLORS[rating] || '#64748b'}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    flexDirection: 'column',
                  }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: RATING_COLORS[rating] || '#64748b' }}>{rating}</div>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className={`fa-solid ${sourceIcon}`} style={{ fontSize: '.7rem', opacity: 0.7 }} />
                        {SOURCE_LABELS[fb.source] || fb.source}
                      </span>
                      <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>•</span>
                      <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        {new Date(fb.created_at).toLocaleString('tr-TR')}
                      </span>
                      {fb.ticket_id && (
                        <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,.12)', color: '#8b5cf6', fontWeight: 700 }}>
                          <i className="fa-solid fa-comments" style={{ marginRight: 3 }} /> Geribildirim Bağlı
                        </span>
                      )}
                      {isRisky && !fb.ticket_id && (
                        <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,.12)', color: '#ef4444', fontWeight: 700 }}>
                          <i className="fa-solid fa-exclamation-triangle" style={{ marginRight: 3 }} /> Triage Gerekiyor
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '.88rem', color: 'var(--text-strong)', lineHeight: 1.5 }}>
                      {fb.comment || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Yorum yok</span>}
                    </div>
                  </div>
                </div>

                {/* Expanded Detail */}
                {selectedFb?.id === fb.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <strong>Masa:</strong> {fb.table_id || '—'}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <strong>Müşteri:</strong> {fb.customer_phone || fb.customer_id || '—'}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <strong>Kategori Önerisi:</strong> {categorySuggestion}
                    </div>
                    {fb.metadata?.url && (
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                        <strong>Kaynak Link:</strong> <a href={fb.metadata.url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'underline' }}>Yorumu Gör</a>
                      </div>
                    )}
                    <div style={{ flex: 1 }} />
                    {!fb.ticket_id && (
                      <button
                        className="btn-p"
                        onClick={e => { e.stopPropagation(); handleCreateTicket(fb) }}
                        disabled={ticketCreating}
                        style={{ fontSize: '.78rem', padding: '6px 14px' }}
                      >
                        <i className="fa-solid fa-comments" style={{ marginRight: 6 }} />
                        {ticketCreating ? 'Oluşturuluyor...' : 'Geribildirim Oluştur ve Triage Et'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
