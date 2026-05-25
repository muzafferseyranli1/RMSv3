import React, { useState, useEffect, useCallback } from 'react'
import { fetchTickets, fetchTicketDetail, assignTicket, updateTicketStatus, resolveTicket, closeTicket, addTicketComment, attachWinbackCoupon, createTaskFromTicket, createManualTicket, checkAndMarkSlaBreaches } from '@/lib/ticketService'
import { fetchTicketCategories } from '@/lib/feedbackService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/useToast'

const STATUS_MAP = {
  open: { label: 'Açık', color: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
  assigned: { label: 'Atandı', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  in_progress: { label: 'İşlemde', color: '#8b5cf6', bg: 'rgba(139,92,246,.15)' },
  waiting: { label: 'Beklemede', color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  resolved: { label: 'Çözüldü', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  closed: { label: 'Kapatıldı', color: '#64748b', bg: 'rgba(100,116,139,.15)' },
}

const PRIORITY_MAP = {
  critical: { label: 'Kritik', color: '#ef4444', icon: 'fa-circle-exclamation' },
  high: { label: 'Yüksek', color: '#f97316', icon: 'fa-arrow-up' },
  normal: { label: 'Normal', color: '#3b82f6', icon: 'fa-minus' },
  low: { label: 'Düşük', color: '#94a3b8', icon: 'fa-arrow-down' },
}

const ORIGIN_MAP = {
  feedback: { label: 'Geri Bildirim', icon: 'fa-comment-dots', color: '#f472b6' },
  inspection: { label: 'Denetim', icon: 'fa-clipboard-check', color: '#8b5cf6' },
  manual: { label: 'Manuel', icon: 'fa-hand', color: '#f59e0b' },
}

export default function TicketBoard() {
  const [tickets, setTickets] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ status: null, priority: null })
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newTicketForm, setNewTicketForm] = useState({ categoryId: '', priority: 'normal', description: '' })
  const { branchId } = useWorkspace()
  const { user } = useAuth()
  const toast = useToast()

  const loadTickets = useCallback(async () => {
    setLoading(true)
    const [ticketResult, catResult] = await Promise.all([
      fetchTickets({ branchId, status: filter.status, priority: filter.priority }),
      fetchTicketCategories(),
    ])
    if (ticketResult.error) toast('Biletler yüklenemedi', 'error')
    setTickets(ticketResult.data || [])
    setCategories(catResult.data || [])
    setLoading(false)
  }, [branchId, filter.status, filter.priority, toast])

  useEffect(() => { loadTickets() }, [loadTickets])

  const openDetail = async (ticketId) => {
    setDetailLoading(true)
    const { data, error } = await fetchTicketDetail(ticketId)
    setDetailLoading(false)
    if (error) return toast('Detay yüklenemedi', 'error')
    setSelectedTicket(data)
  }

  const handleStatusChange = async (ticketId, newStatus) => {
    if (newStatus === 'resolved') {
      const note = window.prompt('Çözüm notu:')
      if (!note) return
      await resolveTicket(ticketId, user?.id, note)
    } else if (newStatus === 'closed') {
      await closeTicket(ticketId, user?.id)
    } else {
      await updateTicketStatus(ticketId, newStatus, user?.id)
    }
    toast('Durum güncellendi', 'success')
    loadTickets()
    if (selectedTicket?.id === ticketId) openDetail(ticketId)
  }

  const handleAddComment = async () => {
    if (!commentText.trim() || !selectedTicket) return
    await addTicketComment(selectedTicket.id, user?.id || 'system', commentText)
    setCommentText('')
    toast('Yorum eklendi', 'success')
    openDetail(selectedTicket.id)
  }

  const handleCreateTask = async (ticket) => {
    const result = await createTaskFromTicket(ticket, { id: user?.id, name: user?.email })
    if (result?.error) return toast('Görev oluşturulamadı', 'error')
    toast('Görev oluşturuldu', 'success')
    loadTickets()
    if (selectedTicket?.id === ticket.id) openDetail(ticket.id)
  }

  const handleCreateManualTicket = async () => {
    if (!newTicketForm.description.trim()) return toast('Açıklama gerekli', 'warning')
    const { error } = await createManualTicket({
      branchId,
      categoryId: newTicketForm.categoryId || null,
      priority: newTicketForm.priority,
      description: newTicketForm.description,
      actorId: user?.id,
    })
    if (error) return toast('Bilet oluşturulamadı', 'error')
    toast('Bilet oluşturuldu', 'success')
    setShowCreate(false)
    setNewTicketForm({ categoryId: '', priority: 'normal', description: '' })
    loadTickets()
  }

  const handleSlaCheck = async () => {
    const { count, error } = await checkAndMarkSlaBreaches()
    if (error) return toast('SLA kontrolü başarısız', 'error')
    toast(`${count} bilet SLA ihlali olarak işaretlendi`, count > 0 ? 'warning' : 'info')
    loadTickets()
  }

  const getCategoryName = (catId) => categories.find(c => c.id === catId)?.name || '—'

  // Stats
  const openCount = tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length
  const breachedCount = tickets.filter(t => t.sla_breached).length
  const resolvedToday = tickets.filter(t => t.resolved_at && new Date(t.resolved_at).toDateString() === new Date().toDateString()).length

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-ticket" style={{ color: '#ef4444', fontSize: '1rem' }} />
            </span>
            Bilet Yönetimi
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>Şikayet, denetim ve manuel biletlerin yaşam döngüsünü yönetin.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-o" onClick={handleSlaCheck} style={{ fontSize: '.78rem' }}>
            <i className="fa-solid fa-clock" style={{ marginRight: 6 }} /> SLA Kontrol
          </button>
          <button className="btn-p" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-plus" /> Yeni Bilet
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Toplam', value: tickets.length, icon: 'fa-ticket', color: '#3b82f6' },
          { label: 'Açık / İşlemde', value: openCount, icon: 'fa-folder-open', color: '#f59e0b' },
          { label: 'SLA İhlali', value: breachedCount, icon: 'fa-triangle-exclamation', color: '#ef4444' },
          { label: 'Bugün Çözülen', value: resolvedToday, icon: 'fa-check-circle', color: '#10b981' },
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

      {/* Create Modal */}
      {showCreate && (
        <div className="card" style={{ padding: 20, marginBottom: 16, borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 12, color: 'var(--text-strong)' }}>Yeni Bilet Oluştur</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Kategori</label>
              <div className="sel-wrap">
                <select
                  value={newTicketForm.categoryId}
                  onChange={e => setNewTicketForm(p => ({ ...p, categoryId: e.target.value }))}
                  className="f-input"
                >
                  <option value="">Seçiniz</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="f-label">Öncelik</label>
              <div className="sel-wrap">
                <select
                  value={newTicketForm.priority}
                  onChange={e => setNewTicketForm(p => ({ ...p, priority: e.target.value }))}
                  className="f-input"
                >
                  {Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="f-label">Açıklama</label>
              <textarea
                value={newTicketForm.description}
                onChange={e => setNewTicketForm(p => ({ ...p, description: e.target.value }))}
                rows={3}
                placeholder="Bileti açıklayın..."
                className="f-input"
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn-o" onClick={() => setShowCreate(false)}>İptal</button>
            <button className="btn-p" onClick={handleCreateManualTicket}>Oluştur</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className="btn-o"
          onClick={() => setFilter(p => ({ ...p, status: null }))}
          style={{ fontSize: '.78rem', fontWeight: !filter.status ? 700 : 500, borderColor: !filter.status ? 'var(--accent-primary)' : undefined, background: !filter.status ? 'var(--sidebar-active-bg)' : undefined }}
        >
          Tümü
        </button>
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <button
            key={key}
            className="btn-o"
            onClick={() => setFilter(p => ({ ...p, status: key }))}
            style={{ fontSize: '.78rem', fontWeight: filter.status === key ? 700 : 500, color: filter.status === key ? val.color : undefined, borderColor: filter.status === key ? val.color : undefined, background: filter.status === key ? `${val.color}11` : undefined }}
          >
            {val.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Ticket List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
            </div>
          ) : tickets.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-ticket" style={{ fontSize: '2rem', marginBottom: 12, display: 'block', opacity: .4 }} />
              <div style={{ fontWeight: 700 }}>Bilet bulunamadı</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tickets.map(ticket => {
                const status = STATUS_MAP[ticket.status] || STATUS_MAP.open
                const priority = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.normal
                const origin = ORIGIN_MAP[ticket.origin_type] || ORIGIN_MAP.manual
                const isBreached = ticket.sla_breached
                const isSelected = selectedTicket?.id === ticket.id
                return (
                  <div
                    key={ticket.id}
                    className="card"
                    style={{
                      padding: 14, cursor: 'pointer',
                      borderColor: isSelected ? '#6366f1' : isBreached ? 'rgba(239,68,68,.3)' : undefined,
                      background: isSelected ? 'rgba(99,102,241,.06)' : isBreached ? 'rgba(239,68,68,.03)' : undefined,
                    }}
                    onClick={() => openDetail(ticket.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: origin.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fa-solid ${origin.icon}`} style={{ color: origin.color, fontSize: '.75rem' }} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-strong)' }}>
                            #{String(ticket.id).slice(0, 8)}
                          </span>
                          <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: status.bg, color: status.color }}>
                            {status.label}
                          </span>
                          <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${priority.color}15`, color: priority.color }}>
                            <i className={`fa-solid ${priority.icon}`} style={{ marginRight: 3, fontSize: '.55rem' }} />{priority.label}
                          </span>
                          {isBreached && (
                            <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,.15)', color: '#ef4444' }}>
                              SLA İhlali
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                          {getCategoryName(ticket.category_id)} • {origin.label} • {new Date(ticket.created_at).toLocaleDateString('tr-TR')}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedTicket && (
          <div className="card" style={{ width: 380, padding: 20, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
            {detailLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor...
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                    #{String(selectedTicket.id).slice(0, 8)}
                  </div>
                  <button className="btn-g" onClick={() => setSelectedTicket(null)} style={{ padding: '4px 8px' }}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>

                {/* Status Actions */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                    <button className="btn-o" onClick={() => handleStatusChange(selectedTicket.id, 'resolved')} style={{ fontSize: '.72rem', color: '#10b981' }}>
                      <i className="fa-solid fa-check" style={{ marginRight: 4 }} /> Çözüldü
                    </button>
                  )}
                  {selectedTicket.status === 'resolved' && (
                    <button className="btn-o" onClick={() => handleStatusChange(selectedTicket.id, 'closed')} style={{ fontSize: '.72rem', color: '#64748b' }}>
                      <i className="fa-solid fa-lock" style={{ marginRight: 4 }} /> Kapat
                    </button>
                  )}
                  {!selectedTicket.task_id && selectedTicket.status !== 'closed' && (
                    <button className="btn-o" onClick={() => handleCreateTask(selectedTicket)} style={{ fontSize: '.72rem', color: '#3b82f6' }}>
                      <i className="fa-solid fa-list-check" style={{ marginRight: 4 }} /> Görev Oluştur
                    </button>
                  )}
                </div>

                {/* Detail fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                  <div><strong style={{ color: 'var(--text-strong)' }}>Durum:</strong> {(STATUS_MAP[selectedTicket.status] || STATUS_MAP.open).label}</div>
                  <div><strong style={{ color: 'var(--text-strong)' }}>Öncelik:</strong> {(PRIORITY_MAP[selectedTicket.priority] || PRIORITY_MAP.normal).label}</div>
                  <div><strong style={{ color: 'var(--text-strong)' }}>Kategori:</strong> {getCategoryName(selectedTicket.category_id)}</div>
                  <div><strong style={{ color: 'var(--text-strong)' }}>Kaynak:</strong> {(ORIGIN_MAP[selectedTicket.origin_type] || ORIGIN_MAP.manual).label}</div>
                  <div><strong style={{ color: 'var(--text-strong)' }}>SLA:</strong> {selectedTicket.sla_level} {selectedTicket.sla_breached && <span style={{ color: '#ef4444', fontWeight: 700 }}>• İHLAL</span>}</div>
                  {selectedTicket.sla_deadline_at && <div><strong style={{ color: 'var(--text-strong)' }}>Son Tarih:</strong> {new Date(selectedTicket.sla_deadline_at).toLocaleString('tr-TR')}</div>}
                  {selectedTicket.resolution_note && <div><strong style={{ color: 'var(--text-strong)' }}>Çözüm:</strong> {selectedTicket.resolution_note}</div>}
                  {selectedTicket.task_id && <div><strong style={{ color: 'var(--text-strong)' }}>Görev:</strong> #{String(selectedTicket.task_id).slice(0, 8)}</div>}
                </div>

                {/* Related Feedback */}
                {selectedTicket.feedback && (
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(244,114,182,.06)', border: '1px solid rgba(244,114,182,.15)', marginBottom: 12 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#f472b6', marginBottom: 4 }}>Bağlı Geri Bildirim</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-strong)' }}>
                      ⭐ {selectedTicket.feedback.rating}/5 — {selectedTicket.feedback.comment || 'Yorum yok'}
                    </div>
                  </div>
                )}

                {/* Comments */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>
                    Yorumlar ({selectedTicket.comments?.length || 0})
                  </div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(selectedTicket.comments || []).map(c => (
                      <div key={c.id} style={{ padding: 8, borderRadius: 6, background: 'var(--surface-2)', fontSize: '.75rem' }}>
                        <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>
                          <strong>{c.author_id}</strong> • {new Date(c.created_at).toLocaleString('tr-TR')}
                        </div>
                        <div style={{ color: 'var(--text-strong)' }}>{c.body}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Yorum ekle..."
                      onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                      className="f-input"
                      style={{ flex: 1 }}
                    />
                    <button className="btn-p" onClick={handleAddComment} style={{ padding: '6px 12px', fontSize: '.75rem' }}>
                      <i className="fa-solid fa-paper-plane" />
                    </button>
                  </div>
                </div>

                {/* Audit Log */}
                {selectedTicket.auditLog?.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Geçmiş</div>
                    <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {selectedTicket.auditLog.map(log => (
                        <div key={log.id} style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleString('tr-TR')}</span>
                          <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{log.action}</span>
                          {log.new_value && <span>→ {log.new_value}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
