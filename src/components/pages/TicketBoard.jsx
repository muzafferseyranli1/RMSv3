import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchTickets, checkAndMarkSlaBreaches, createManualTicket } from '@/lib/ticketService'
import { fetchTicketCategories } from '@/lib/feedbackService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'

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
  quality: { label: 'Standart Dışı Ürün', icon: 'fa-utensils', color: '#ef4444' },
  social_media: { label: 'Sosyal Medya', icon: 'fa-share-nodes', color: '#06b6d4' },
  google_review: { label: 'Google Yorumu', icon: 'fa-google', color: '#ea4335' },
}

export default function TicketBoard() {
  const navigate = useNavigate()
  const toast = useToast()
  const { branchId, branchName, branches, scope } = useWorkspace()

  const [tickets, setTickets] = useState([])
  const [categories, setCategories] = useState([])
  const [allNodes, setAllNodes] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Tabs: 'all' | 'my_tickets' | 'unassigned'
  const [activeTab, setActiveTab] = useState('all')
  const [statusFilter, setStatusFilter] = useState(null)
  const [priorityFilter, setPriorityFilter] = useState(null)
  
  const [showCreate, setShowCreate] = useState(false)
  const [newTicketForm, setNewTicketForm] = useState({ categoryId: '', priority: 'normal', description: '', branchId: '' })

  const getActiveUser = () => {
    try {
      return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')
    } catch {
      return null
    }
  }

  const getBranchName = (bId) => {
    if (!bId) return 'Genel Merkez'
    return allNodes.find(n => n.id === bId)?.name || branches.find(b => b.id === bId)?.name || bId
  }

  const loadTickets = useCallback(async () => {
    setLoading(true)
    const activeStaff = getActiveUser()
    const isHQUser = scope === 'center' || scope === 'admin'
    
    // Fetch query params
    const params = {
      branchId: !isHQUser ? (branchId || 'UNAUTHORIZED_EMPTY_BRANCH') : null,
      status: statusFilter,
      priority: priorityFilter,
    }

    if (activeTab === 'my_tickets' && activeStaff?.id) {
      params.assignedTo = activeStaff.id
    }

    try {
      const [ticketResult, catResult, nodesResult] = await Promise.all([
        fetchTickets(params),
        fetchTicketCategories(),
        db.from('company_nodes').select('id,name')
      ])

      if (ticketResult.error) toast('Geribildirimler yüklenemedi', 'error')
      
      let loadedTickets = ticketResult.data || []
      
      // Unassigned client side filter
      if (activeTab === 'unassigned') {
        loadedTickets = loadedTickets.filter(t => !t.assigned_to)
      }

      setTickets(loadedTickets)
      setCategories(catResult.data || [])
      setAllNodes(nodesResult.data || [])
    } catch (err) {
      console.error(err)
      toast('Veriler yüklenirken hata oluştu', 'error')
    } finally {
      setLoading(false)
    }
  }, [branchId, scope, statusFilter, priorityFilter, activeTab, toast])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  const handleCreateManualTicket = async () => {
    if (!newTicketForm.description.trim()) return toast('Açıklama gerekli', 'warning')
    const activeStaff = getActiveUser()
    const isHQUser = scope === 'center' || scope === 'admin'
    const targetBranch = !isHQUser ? branchId : (newTicketForm.branchId || null)
    
    const { error } = await createManualTicket({
      branchId: targetBranch,
      categoryId: newTicketForm.categoryId || null,
      priority: newTicketForm.priority,
      description: newTicketForm.description,
      actorId: activeStaff?.id || 'system',
    })
    
    if (error) return toast('Geribildirim oluşturulamadı', 'error')
    toast('Geribildirim oluşturuldu', 'success')
    setShowCreate(false)
    setNewTicketForm({ categoryId: '', priority: 'normal', description: '', branchId: '' })
    loadTickets()
  }

  const handleSlaCheck = async () => {
    const { count, error } = await checkAndMarkSlaBreaches()
    if (error) return toast('SLA kontrolü başarısız', 'error')
    toast(`${count} geribildirim SLA ihlali olarak işaretlendi`, count > 0 ? 'warning' : 'info')
    loadTickets()
  }

  const getCategoryName = (catId) => categories.find(c => c.id === catId)?.name || '—'

  // Stats (based on loaded tickets)
  const openCount = tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length
  const breachedCount = tickets.filter(t => t.sla_breached).length
  const resolvedToday = tickets.filter(t => t.resolved_at && new Date(t.resolved_at).toDateString() === new Date().toDateString()).length

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(239,68,68,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-comments" style={{ color: '#ef4444', fontSize: '1rem' }} />
            </span>
            Geribildirim Yönetimi
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>Şikayet, denetim, kalite ve manuel geribildirimlerin yaşam döngüsünü yönetin.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-o" onClick={handleSlaCheck} style={{ fontSize: '.78rem' }}>
            <i className="fa-solid fa-clock" style={{ marginRight: 6 }} /> SLA Kontrol
          </button>
          <button className="btn-p" onClick={() => setShowCreate(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-plus" /> Yeni Geribildirim
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Gösterilen Geribildirimler', value: tickets.length, icon: 'fa-comments', color: '#3b82f6' },
          { label: 'Açık / İşlemde', value: openCount, icon: 'fa-folder-open', color: '#f59e0b' },
          { label: 'SLA İhlali', value: breachedCount, icon: 'fa-triangle-exclamation', color: '#ef4444' },
          { label: 'Bugün Çözülen', value: resolvedToday, icon: 'fa-check-circle', color: '#10b981' },
        ].map(stat => (
          <div key={stat.label} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: `${stat.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className={`fa-solid ${stat.icon}`} style={{ color: stat.color, fontSize: '.95rem' }} />
            </span>
            <div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-strong)' }}>{stat.value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="card" style={{ padding: 24, marginBottom: 20, borderLeft: '4px solid #6366f1' }}>
          <div style={{ fontWeight: 800, fontSize: '.9rem', marginBottom: 16, color: 'var(--text-strong)' }}>Yeni Geribildirim Oluştur</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label className="f-label">Şube / Alan</label>
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
                    value={newTicketForm.branchId}
                    onChange={e => setNewTicketForm(p => ({ ...p, branchId: e.target.value }))}
                    className="f-input"
                  >
                    <option value="">Genel Merkez</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>
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
                placeholder="Geribildirimi açıklayın..."
                className="f-input"
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn-o" onClick={() => setShowCreate(false)}>İptal</button>
            <button className="btn-p" onClick={handleCreateManualTicket}>Oluştur</button>
          </div>
        </div>
      )}

      {/* Tabs Menu */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { key: 'all', label: 'Tüm Geribildirimler', icon: 'fa-list' },
          { key: 'my_tickets', label: 'Bana Atananlar', icon: 'fa-user-check' },
          { key: 'unassigned', label: 'Atanmamış Geribildirimler', icon: 'fa-user-slash' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent',
              background: 'none',
              color: activeTab === tab.key ? '#6366f1' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 800 : 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
            }}
          >
            <i className={`fa-solid ${tab.icon}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters & Search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className="btn-o"
          onClick={() => setStatusFilter(null)}
          style={{ fontSize: '.78rem', fontWeight: !statusFilter ? 700 : 500, borderColor: !statusFilter ? 'var(--accent-primary)' : undefined, background: !statusFilter ? 'var(--sidebar-active-bg)' : undefined }}
        >
          Tüm Durumlar
        </button>
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <button
            key={key}
            className="btn-o"
            onClick={() => setStatusFilter(key)}
            style={{ fontSize: '.78rem', fontWeight: statusFilter === key ? 700 : 500, color: statusFilter === key ? val.color : undefined, borderColor: statusFilter === key ? val.color : undefined, background: statusFilter === key ? `${val.color}11` : undefined }}
          >
            {val.label}
          </button>
        ))}
      </div>

      {/* Ticket List View (Full Width) */}
      <div>
        {loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12 }} />
            <div>Yükleniyor...</div>
          </div>
        ) : tickets.length === 0 ? (
          <div className="card" style={{ padding: 64, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-comments fa-3x" style={{ marginBottom: 16, opacity: .3 }} />
            <div style={{ fontWeight: 700, fontSize: '.95rem' }}>Geribildirim Bulunmamaktadır</div>
            <p style={{ margin: '8px 0 0', fontSize: '.8rem' }}>Seçilen filtreler ve sekmeye uygun herhangi bir geribildirim bulunmuyor.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tickets.map(ticket => {
              const status = STATUS_MAP[ticket.status] || STATUS_MAP.open
              const priority = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.normal
              const origin = ORIGIN_MAP[ticket.origin_type] || ORIGIN_MAP.manual
              
              return (
                <div
                  key={ticket.id}
                  className="card"
                  onClick={() => navigate(`/geribildirimler/${ticket.id}`)}
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    borderColor: ticket.sla_breached ? 'rgba(239,68,68,.35)' : undefined,
                    background: ticket.sla_breached ? 'rgba(239,68,68,.02)' : undefined,
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.05)'
                    e.currentTarget.style.borderColor = '#6366f1'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'none'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.borderColor = ticket.sla_breached ? 'rgba(239,68,68,.35)' : 'var(--border)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
                      
                      {/* Icon */}
                      <span style={{ width: 40, height: 40, borderRadius: 10, background: origin.bg || 'rgba(100,116,139,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fa-solid ${origin.icon}`} style={{ color: origin.color, fontSize: '1rem' }} />
                      </span>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                            #{String(ticket.id).slice(0, 8)}
                          </span>
                          <span style={{ fontSize: '.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: status.bg, color: status.color }}>
                            {status.label}
                          </span>
                          <span style={{ fontSize: '.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: `${priority.color}15`, color: priority.color }}>
                            <i className={`fa-solid ${priority.icon}`} style={{ marginRight: 3, fontSize: '.55rem' }} />
                            {priority.label}
                          </span>
                          {ticket.sla_breached && (
                            <span style={{ fontSize: '.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,.15)', color: '#ef4444' }}>
                              SLA Aşıldı
                            </span>
                          )}
                          {ticket.escalated && (
                            <span style={{ fontSize: '.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99, background: 'rgba(220,38,38,.15)', color: '#dc2626' }}>
                              Eskale (HQ)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
                          <strong style={{ color: 'var(--text-strong)' }}>{getBranchName(ticket.branch_id)}</strong>
                          {' • '}{getCategoryName(ticket.category_id)}
                          {ticket.assigned_to_name && (
                            <span> • Görevli: <strong style={{ color: '#f59e0b' }}>{ticket.assigned_to_name}</strong></span>
                          )}
                          <span> • Oluşturulma: {new Date(ticket.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                      </div>

                    </div>
                    
                    {/* Action Link Arrow */}
                    <div style={{ color: 'var(--text-muted)', fontSize: '1rem', paddingLeft: 12 }}>
                      <i className="fa-solid fa-chevron-right" />
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
