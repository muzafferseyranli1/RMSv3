import React, { useState, useEffect, useCallback } from 'react'
import { fetchFeedbackList, triageFeedbackToTicket, shouldAutoCreateTicket, detectCategorySuggestion } from '@/lib/feedbackService'
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

export default function FeedbackManagement() {
  const [feedbackList, setFeedbackList] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ rating: null })
  const [selectedFb, setSelectedFb] = useState(null)
  const [ticketCreating, setTicketCreating] = useState(false)
  const { branchId } = useWorkspace()
  const { user } = useAuth()
  const toast = useToast()

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
    if (result?.error) return toast('Bilet oluşturulamadı', 'error')
    if (result?.data) {
      toast('Bilet oluşturuldu', 'success')
      loadFeedback()
    } else {
      toast('Bu geri bildirim bilet eşiğinde değil', 'info')
    }
  }

  // Stats
  const totalCount = feedbackList.length
  const avgRating = totalCount > 0 ? (feedbackList.reduce((s, f) => s + (Number(f.rating) || 0), 0) / totalCount).toFixed(1) : '—'
  const lowRatingCount = feedbackList.filter(f => (Number(f.rating) || 5) <= 2).length
  const withTicketCount = feedbackList.filter(f => f.ticket_id).length

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(244,114,182,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-comment-dots" style={{ color: '#f472b6', fontSize: '1rem' }} />
            </span>
            Geri Bildirimler
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>QR menü, çağrı merkezi ve diğer kanallardan gelen müşteri geri bildirimleri.</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Toplam', value: totalCount, icon: 'fa-inbox', color: '#3b82f6' },
          { label: 'Ortalama Puan', value: avgRating, icon: 'fa-star', color: '#f59e0b' },
          { label: 'Düşük Puan (≤2)', value: lowRatingCount, icon: 'fa-triangle-exclamation', color: '#ef4444' },
          { label: 'Bilet Bağlı', value: withTicketCount, icon: 'fa-ticket', color: '#8b5cf6' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: `${stat.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fa-solid ${stat.icon}`} style={{ color: stat.color, fontSize: '.9rem' }} />
            </span>
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-strong)' }}>{stat.value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

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
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
        </div>
      ) : feedbackList.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-inbox" style={{ fontSize: '2rem', marginBottom: 12, display: 'block', opacity: .4 }} />
          <div style={{ fontWeight: 700 }}>Geri bildirim bulunamadı</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {feedbackList.map(fb => {
            const rating = Number(fb.rating) || 0
            const isRisky = shouldAutoCreateTicket(fb)
            const categorySuggestion = detectCategorySuggestion(fb.comment)
            return (
              <div key={fb.id} className="card" style={{ padding: 16, cursor: 'pointer', borderColor: isRisky ? 'rgba(239,68,68,.3)' : undefined, background: isRisky ? 'rgba(239,68,68,.03)' : undefined }}
                onClick={() => setSelectedFb(selectedFb?.id === fb.id ? null : fb)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* Rating Badge */}
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, background: `${RATING_COLORS[rating] || '#64748b'}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    flexDirection: 'column', gap: 2,
                  }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: RATING_COLORS[rating] || '#64748b' }}>{rating}</div>
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                        {SOURCE_LABELS[fb.source] || fb.source}
                      </span>
                      <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>•</span>
                      <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        {new Date(fb.created_at).toLocaleDateString('tr-TR')} {new Date(fb.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {fb.ticket_id && (
                        <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(139,92,246,.15)', color: '#a78bfa', fontWeight: 700 }}>
                          <i className="fa-solid fa-ticket" style={{ marginRight: 3 }} /> Bilet Bağlı
                        </span>
                      )}
                      {isRisky && !fb.ticket_id && (
                        <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,.15)', color: '#ef4444', fontWeight: 700, animation: 'pulse 2s infinite' }}>
                          <i className="fa-solid fa-exclamation-triangle" style={{ marginRight: 3 }} /> Risk
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
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <strong>Masa:</strong> {fb.table_id || '—'}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <strong>Müşteri:</strong> {fb.customer_phone || fb.customer_id || '—'}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                      <strong>Kategori Önerisi:</strong> {categorySuggestion}
                    </div>
                    <div style={{ flex: 1 }} />
                    {!fb.ticket_id && (
                      <button
                        className="btn-p"
                        onClick={e => { e.stopPropagation(); handleCreateTicket(fb) }}
                        disabled={ticketCreating}
                        style={{ fontSize: '.78rem', padding: '6px 14px' }}
                      >
                        <i className="fa-solid fa-ticket" style={{ marginRight: 6 }} />
                        {ticketCreating ? 'Oluşturuluyor...' : 'Bilet Oluştur'}
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
