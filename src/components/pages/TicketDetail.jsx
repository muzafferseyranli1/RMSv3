import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchTicketDetail, assignTicket, updateTicketStatus, addTicketComment, attachWinbackCoupon, createLinkedTaskFromTicket, escalateTicket } from '@/lib/ticketService'
import { readSettingArray, PERSONNEL_SETTINGS_KEYS, normalizeEmployeeRecord, normalizePositionRecord } from '@/lib/personnelConfig'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import SearchableSelect from '@/components/ui/SearchableSelect'

const STATUS_MAP = {
  open:        { label: 'Açık',       color: '#3b82f6', bg: 'rgba(59,130,246,.15)' },
  assigned:    { label: 'Atandı',     color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  in_progress: { label: 'İşlemde',   color: '#8b5cf6', bg: 'rgba(139,92,246,.15)' },
  waiting:     { label: 'Beklemede', color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  resolved:    { label: 'Çözüldü',   color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  closed:      { label: 'Kapatıldı', color: '#64748b', bg: 'rgba(100,116,139,.15)' },
}

const TASK_STATUS_CHIP = {
  completed:   { label: 'Tamamlandı',   color: '#10b981', bg: 'rgba(16,185,129,.12)', icon: 'fa-circle-check' },
  open:        { label: 'Devam Ediyor', color: '#3b82f6', bg: 'rgba(59,130,246,.12)', icon: 'fa-circle-half-stroke' },
  in_progress: { label: 'Devam Ediyor', color: '#8b5cf6', bg: 'rgba(139,92,246,.12)', icon: 'fa-circle-half-stroke' },
  not_completed: { label: 'Tamamlanmadı', color: '#ef4444', bg: 'rgba(239,68,68,.12)', icon: 'fa-circle-xmark' },
  pending_approval: { label: 'Onay Bekliyor', color: '#f97316', bg: 'rgba(249,115,22,.12)', icon: 'fa-clock' },
}

const PRIORITY_MAP = {
  critical: { label: 'Kritik',  color: '#ef4444', icon: 'fa-circle-exclamation' },
  high:     { label: 'Yüksek', color: '#f97316', icon: 'fa-arrow-up' },
  normal:   { label: 'Normal', color: '#3b82f6', icon: 'fa-minus' },
  low:      { label: 'Düşük',  color: '#94a3b8', icon: 'fa-arrow-down' },
}

const ORIGIN_MAP = {
  feedback:     { label: 'Geri Bildirim',      icon: 'fa-comment-dots',   color: '#f472b6', bg: 'rgba(244,114,182,.1)' },
  inspection:   { label: 'Denetim',            icon: 'fa-clipboard-check',color: '#8b5cf6', bg: 'rgba(139,92,246,.1)' },
  manual:       { label: 'Manuel',             icon: 'fa-hand',           color: '#f59e0b', bg: 'rgba(245,158,11,.1)' },
  quality:      { label: 'Standart Dışı Ürün', icon: 'fa-utensils',       color: '#ef4444', bg: 'rgba(239,68,68,.1)' },
  social_media: { label: 'Sosyal Medya',        icon: 'fa-share-nodes',    color: '#06b6d4', bg: 'rgba(6,182,212,.1)' },
  google_review:{ label: 'Google Yorumu',       icon: 'fa-google',         color: '#ea4335', bg: 'rgba(234,67,53,.1)' },
}

// ── Yeni Görev Modalı ────────────────────────────────────────

function CreateTaskModal({ ticket, employeeOptions, branchName, onClose, onCreated }) {
  const now = new Date()
  const due24 = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const toLocalDatetimeValue = (d) => {
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const [form, setForm] = useState({
    title: `Geribildirim Düzeltici Görev / #${String(ticket.id).slice(0, 8)}`,
    description: ticket.feedback?.comment || ticket.resolution_note || `Geribildirim #${String(ticket.id).slice(0, 8)} için düzeltici görev.`,
    responsibleId: ticket.assigned_to || '',
    priority: ticket.priority || 'normal',
    dueAt: toLocalDatetimeValue(due24),
    delegation_allowed: true,
    approval_required: false,
    closure_summary_required: true,
    closure_file_required: false,
    closure_image_required: false,
    edit_due_date_allowed: false,
    edit_schedule_allowed: false,
    incomplete_if_late: true,
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.title.trim()) { alert('Görev adı zorunludur.'); return }
    setSaving(true)
    try {
      const actor = (() => { try { return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null') } catch { return null } })()
      const result = await createLinkedTaskFromTicket(ticket.id, {
        ...form,
        locationId: ticket.branch_id,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined,
        collaboratorIds: [],
        observerIds: [],
      }, actor)
      if (result.error) throw new Error(result.error.message || 'Görev oluşturulamadı')
      onCreated(result.data)
    } catch (e) {
      alert('Görev oluşturulamadı: ' + e.message)
    } finally {
      setSaving(false)
    }
  }


  const Rule = ({ label, field }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${form[field] ? '#3b82f6' : '#e2e8f0'}`, background: form[field] ? 'rgba(59,130,246,.04)' : '#fff', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, color: form[field] ? '#1d4ed8' : '#475569', transition: 'all .15s', userSelect: 'none' }}>
      <input type="checkbox" checked={!!form[field]} onChange={e => set(field, e.target.checked)} style={{ accentColor: '#3b82f6', width: 16, height: 16 }} />
      {label}
    </label>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(15,23,42,.25)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, background: '#fff', borderRadius: '20px 20px 0 0', zIndex: 2 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
            <i className="fa-solid fa-list-check" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: '1rem', color: '#0f172a' }}>Düzeltici Görev Oluştur</div>
            <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 2 }}>Geribildirim #{String(ticket.id).slice(0, 8)} · {branchName}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: '1rem' }}>×</button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'grid', gap: 16 }}>
          {/* Görev Adı */}
          <div>
            <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Görev Adı *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '.85rem', fontWeight: 600, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Açıklama */}
          <div>
            <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Açıklama</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '.82rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
          </div>

          {/* Atanan Kişi + Öncelik */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Atanan Kişi</label>
              <SearchableSelect
                value={form.responsibleId}
                onChange={v => set('responsibleId', v)}
                options={employeeOptions}
                placeholder="— Kişi Seç —"
                searchPlaceholder="Ara..."
                allowClear
                clearLabel="Seçimi Kaldır"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Öncelik</label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '.82rem', background: '#fff', outline: 'none', fontWeight: 600 }}
              >
                <option value="low">Düşük</option>
                <option value="normal">Normal</option>
                <option value="high">Yüksek</option>
                <option value="critical">Kritik</option>
              </select>
            </div>
          </div>

          {/* Bitiş Tarihi */}
          <div>
            <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Bitiş Tarihi / Saati</label>
            <input
              type="datetime-local"
              value={form.dueAt}
              onChange={e => set('dueAt', e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '.82rem', outline: 'none', boxSizing: 'border-box', fontWeight: 600 }}
            />
          </div>

          {/* Kurallar */}
          <div>
            <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 10 }}>Kurallar</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
              <Rule label="Delege Etmeye İzin Ver"    field="delegation_allowed" />
              <Rule label="Kapanış Onayı Gerekli"     field="approval_required" />
              <Rule label="Kapanış Özeti Zorunlu"     field="closure_summary_required" />
              <Rule label="Kapanış Dosyası Zorunlu"   field="closure_file_required" />
              <Rule label="Kapanış Fotoğrafı Zorunlu" field="closure_image_required" />
              <Rule label="Atanan Vade Değiştirebilir" field="edit_due_date_allowed" />
              <Rule label="Atanan Takvim Değiştirebilir" field="edit_schedule_allowed" />
              <Rule label="Süresinde Bitmezse Tamamlanmadı" field="incomplete_if_late" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 10, justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: '#fff', borderRadius: '0 0 20px 20px' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}>
            İptal
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: saving ? '#93c5fd' : '#3b82f6', color: '#fff', fontWeight: 800, fontSize: '.84rem', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-plus" />}
            {saving ? 'Oluşturuluyor...' : 'Görevi Oluştur'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ana Bileşen ──────────────────────────────────────────────

export default function TicketDetail() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { branchId: workspaceBranchId, scope, branches } = useWorkspace()

  const [ticket, setTicket] = useState(null)
  const [employees, setEmployees] = useState([])
  const [positions, setPositions] = useState([])
  const [allNodes, setAllNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentText, setCommentText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedPhotos, setUploadedPhotos] = useState([])
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [escalateModalOpen, setEscalateModalOpen] = useState(false)
  const [escalateReason, setEscalateReason] = useState('')

  const getActiveUser = () => {
    try { return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null') } catch { return null }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const [ticketRes, empRes, posRes, nodesRes] = await Promise.all([
        fetchTicketDetail(ticketId),
        readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
        readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord),
        db.from('company_nodes').select('id,name'),
      ])
      if (ticketRes.error) { toast('Geribildirim yüklenemedi', 'error'); navigate('/geribildirimler'); return }
      const isHQUser = scope === 'center' || scope === 'admin'
      if (!isHQUser && ticketRes.data.branch_id !== workspaceBranchId) {
        toast('Bu geribildirimi görüntüleme yetkiniz yok.', 'error'); navigate('/geribildirimler'); return
      }
      setTicket(ticketRes.data)
      setEmployees(empRes || [])
      setPositions(posRes || [])
      setAllNodes(nodesRes.data || [])
    } catch (e) {
      console.error(e); toast('Veri yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [ticketId])

  const handleStatusChange = async (newStatus) => {
    const actorId = getActiveUser()?.id || 'system'
    try {
      if (newStatus === 'resolved') {
        const note = window.prompt('Geribildirim çözüm notunu girin:')
        if (note === null) return
        if (!note.trim()) { toast('Çözüm notu zorunludur', 'warning'); return }
        await updateTicketStatus(ticket.id, 'resolved', actorId, note)
      } else {
        await updateTicketStatus(ticket.id, newStatus, actorId)
      }
      toast('Durum güncellendi', 'success'); loadData()
    } catch { toast('Durum güncellenemedi', 'error') }
  }

  const handleAssignChange = async (pId) => {
    const actor = getActiveUser()
    try {
      await assignTicket(ticket.id, pId || null, actor?.id || 'system')
      toast(pId ? 'Geribildirim başarıyla atandı' : 'Geribildirim ataması kaldırıldı', 'success')
      loadData()
    } catch { toast('Geribildirim ataması başarısız', 'error') }
  }

  const handleEscalate = async () => {
    if (!escalateReason.trim()) { toast('Eskalasyon nedeni zorunludur', 'warning'); return }
    const actor = getActiveUser()
    try {
      await escalateTicket(ticket.id, escalateReason, actor?.id || 'system')
      toast("Geribildirim Genel Merkez'e eskale edildi", 'warning')
      setEscalateModalOpen(false); setEscalateReason(''); loadData()
    } catch { toast('Eskalasyon işlemi başarısız', 'error') }
  }

  const handleAddComment = async () => {
    if (!commentText.trim() && uploadedPhotos.length === 0) return
    const actor = getActiveUser()
    let body = commentText
    if (uploadedPhotos.length > 0) body += '\n\n📎 Ekli Dosyalar:\n' + uploadedPhotos.map(u => `[Dosyayı Görüntüle](${u})`).join('\n')
    try {
      await addTicketComment(ticket.id, actor?.id || 'system', body)
      setCommentText(''); setUploadedPhotos([])
      toast('Yorum eklendi', 'success'); loadData()
    } catch { toast('Yorum eklenemedi', 'error') }
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const data = await uploadApiFile(fd)
      if (data?.file_url) { setUploadedPhotos(prev => [...prev, data.file_url]); toast('Fotoğraf yüklendi', 'success') }
    } catch (err) { toast('Fotoğraf yüklenemedi: ' + err.message, 'error') }
    finally { setUploading(false) }
  }

  const getBranchName = (bId) => {
    if (!bId) return 'Genel Merkez'
    return allNodes.find(n => n.id === bId)?.name || branches?.find(b => b.id === bId)?.name || bId
  }

  const getEmployeeDisplay = (empId) => {
    const emp = employees.find(e => e.id === empId); if (!emp) return empId
    const pos = positions.find(p => p.id === emp.positionId)
    return `${emp.firstName} ${emp.lastName} (${pos?.name || 'Personel'})`
  }

  if (loading) return (
    <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
      <i className="fa-solid fa-spinner fa-spin fa-2x" style={{ marginBottom: 12 }} />
      <div>Detaylar yükleniyor...</div>
    </div>
  )

  if (!ticket) return null

  const targetBranchId = ticket.branch_id
  const filteredEmployees = employees.filter(emp => {
    if (emp.deletedAt) return false
    if (!targetBranchId) return true
    return emp.defaultBranchId === targetBranchId || emp.workingBranchIds?.includes(targetBranchId) || emp.managedBranchIds?.includes(targetBranchId)
  })

  const employeeOptions = filteredEmployees.map(emp => {
    const pos = positions.find(p => p.id === emp.positionId)
    return { value: emp.id, label: `${emp.firstName} ${emp.lastName}`, meta: pos?.name || 'Personel', description: emp.email || '' }
  })

  const status = STATUS_MAP[ticket.status] || STATUS_MAP.open
  const priority = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.normal
  const origin = ORIGIN_MAP[ticket.origin_type] || ORIGIN_MAP.manual
  const linkedTasks = Array.isArray(ticket.linkedTasks) ? ticket.linkedTasks : []
  const branchName = getBranchName(ticket.branch_id)

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Üst Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate('/geribildirimler')} className="btn-o" style={{ padding: '8px 12px' }}>
          <i className="fa-solid fa-arrow-left" /> Geri Dön
        </button>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>
              Geribildirim #{String(ticket.id).slice(0, 8)}
            </h1>
            <span style={{ fontSize: '.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: status.bg, color: status.color }}>{status.label}</span>
            <span style={{ fontSize: '.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: `${priority.color}15`, color: priority.color }}>
              <i className={`fa-solid ${priority.icon}`} style={{ marginRight: 4 }} />{priority.label} Öncelik
            </span>
            {ticket.sla_breached && (
              <span style={{ fontSize: '.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: 'rgba(239,68,68,.15)', color: '#ef4444' }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />SLA İhlali
              </span>
            )}
            {ticket.escalated && (
              <span style={{ fontSize: '.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: 'rgba(220,38,38,.15)', color: '#dc2626' }}>
                <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 4 }} />Eskale Edildi (HQ)
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '.8rem', color: 'var(--text-muted)' }}>
            Oluşturulma: {new Date(ticket.created_at).toLocaleString('tr-TR')}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 20 }}>
        {/* Sol: Detaylar + Bağlı görevler + Geçmiş */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Ana Bilgiler */}
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 0, marginBottom: 16 }}>Geribildirim Detayları</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: '.85rem' }}>
              <div><div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Şube</div><div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{branchName}</div></div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Kaynak Kanal</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: origin.color }}>
                  <i className={`fa-solid ${origin.icon}`} /> {origin.label}
                </div>
              </div>
              <div><div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>SLA Limit / Seviye</div><div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{ticket.sla_level}</div></div>
              <div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>SLA Son Zaman</div>
                <div style={{ fontWeight: 700, color: ticket.sla_breached ? '#ef4444' : 'var(--text-strong)' }}>
                  {ticket.sla_deadline_at ? new Date(ticket.sla_deadline_at).toLocaleString('tr-TR') : '—'}
                </div>
              </div>
            </div>
            {ticket.escalation_reason && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(220,38,38,.05)', border: '1px solid rgba(220,38,38,.15)' }}>
                <strong style={{ color: '#dc2626', fontSize: '.8rem', display: 'block', marginBottom: 4 }}>HQ Eskalasyon Nedeni:</strong>
                <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--text-strong)' }}>{ticket.escalation_reason}</p>
              </div>
            )}
            {ticket.resolution_note && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(16,185,129,.05)', border: '1px solid rgba(16,185,129,.15)' }}>
                <strong style={{ color: '#10b981', fontSize: '.8rem', display: 'block', marginBottom: 4 }}>Çözüm Notu:</strong>
                <p style={{ margin: 0, fontSize: '.82rem', color: 'var(--text-strong)' }}>{ticket.resolution_note}</p>
              </div>
            )}
          </div>

          {/* Bağlı Görevler */}
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                <i className="fa-solid fa-list-check" style={{ color: '#3b82f6', marginRight: 8 }} />
                Düzeltici Görevler
                {linkedTasks.length > 0 && (
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 99, background: '#eff6ff', color: '#3b82f6', fontSize: '.72rem', fontWeight: 800 }}>{linkedTasks.length}</span>
                )}
              </h3>
              {ticket.status !== 'closed' && (
                <button
                  onClick={() => setTaskModalOpen(true)}
                  style={{ padding: '7px 14px', borderRadius: 10, border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 800, fontSize: '.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="fa-solid fa-plus" /> Yeni Görev Ekle
                </button>
              )}
            </div>

            {linkedTasks.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: '.82rem' }}>
                <i className="fa-regular fa-circle-check" style={{ fontSize: '1.6rem', marginBottom: 8, display: 'block', opacity: .4 }} />
                Henüz düzeltici görev eklenmemiş.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {linkedTasks.map(task => {
                  const chip = TASK_STATUS_CHIP[task.status] || TASK_STATUS_CHIP.open
                  const taskPriority = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal
                  return (
                    <div
                      key={task.id}
                      style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 12 }}
                    >
                      {/* Durum ikonu */}
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: chip.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <i className={`fa-solid ${chip.icon}`} style={{ color: chip.color, fontSize: '.95rem' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '.84rem', color: '#0f172a', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          {/* Durum chip */}
                          <span style={{ padding: '2px 8px', borderRadius: 99, background: chip.bg, color: chip.color, fontSize: '.64rem', fontWeight: 800 }}>
                            <i className={`fa-solid ${chip.icon}`} style={{ marginRight: 4 }} />{chip.label}
                          </span>
                          {/* Öncelik */}
                          <span style={{ padding: '2px 8px', borderRadius: 99, background: `${taskPriority.color}12`, color: taskPriority.color, fontSize: '.62rem', fontWeight: 700 }}>
                            {taskPriority.label}
                          </span>
                          {/* Vade */}
                          {task.due_at && (
                            <span style={{ fontSize: '.62rem', color: '#94a3b8' }}>
                              <i className="fa-regular fa-clock" style={{ marginRight: 3 }} />
                              {new Date(task.due_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Göreve Git */}
                      <button
                        onClick={() => navigate(`/gorevler?taskId=${task.id}`)}
                        style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#3b82f6', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                      >
                        <i className="fa-solid fa-arrow-up-right-from-square" />Göreve Git
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bağlı Müşteri Geri Bildirimi */}
          {ticket.feedback && (
            <div className="card" style={{ padding: 24, borderLeft: '4px solid #f472b6' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#f472b6', marginTop: 0, marginBottom: 12 }}>Bağlı Müşteri Geri Bildirimi</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.82rem' }}>
                <div><strong>Değerlendirme:</strong> {'⭐'.repeat(ticket.feedback.rating)} ({ticket.feedback.rating}/5)</div>
                {ticket.feedback.comment && (
                  <div>
                    <strong>Müşteri Yorumu:</strong>
                    <blockquote style={{ margin: '6px 0 0', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 6, fontStyle: 'italic', color: 'var(--text-strong)' }}>"{ticket.feedback.comment}"</blockquote>
                  </div>
                )}
                {ticket.feedback.customer_phone && <div><strong>Müşteri Telefonu:</strong> {ticket.feedback.customer_phone}</div>}
              </div>
            </div>
          )}

          {/* Kalite Raporu */}
          {ticket.qualityReport && (
            <div className="card" style={{ padding: 24, borderLeft: '4px solid #ef4444' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ef4444', marginTop: 0, marginBottom: 12 }}>Bağlı Standart Dışı Ürün Bildirimi</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '.82rem' }}>
                <div><strong>Ürün Adı:</strong> <span style={{ fontWeight: 700 }}>{ticket.qualityReport.product_name}</span></div>
                {ticket.qualityReport.supplier_name && <div><strong>Tedarikçi:</strong> {ticket.qualityReport.supplier_name}</div>}
                <div>
                  <strong>Hata Detayı:</strong>
                  <div style={{ margin: '6px 0 0', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>{ticket.qualityReport.description}</div>
                </div>
                {Array.isArray(ticket.qualityReport.photo_urls) && ticket.qualityReport.photo_urls.length > 0 && (
                  <div>
                    <strong>Bildirim Fotoğrafları:</strong>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {ticket.qualityReport.photo_urls.map((p, i) => (
                        <a key={i} href={buildApiUrl(p)} target="_blank" rel="noopener noreferrer">
                          <img src={buildApiUrl(p)} alt={`Kalite ${i+1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* İşlem Geçmişi */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 0, marginBottom: 16 }}>Geribildirim Geçmişi ve İşlem Günlüğü</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(ticket.auditLog || []).map((log, i) => (
                <div key={log.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                  {i < ticket.auditLog.length - 1 && (
                    <span style={{ position: 'absolute', left: 17, top: 26, bottom: -20, width: 1, background: 'var(--border)' }} />
                  )}
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                    <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '.75rem' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)' }}>
                      {log.action === 'created' && 'Geribildirim Oluşturuldu'}
                      {log.action === 'assigned' && 'Atama Yapıldı'}
                      {log.action === 'auto_assigned' && 'Otomatik Atandı'}
                      {log.action === 'status_changed' && `Durum Değişti: ${STATUS_MAP[log.new_value]?.label || log.new_value}`}
                      {log.action === 'escalated' && "Genel Merkez'e Eskale Edildi"}
                      {log.action === 'task_created' && `Düzeltici Görev Oluşturuldu${log.metadata?.task_title ? ` — "${log.metadata.task_title}"` : ''}`}
                      {log.action === 'coupon_sent' && 'Kupon Gönderildi'}
                      {!['created','assigned','auto_assigned','status_changed','escalated','task_created','coupon_sent'].includes(log.action) && log.action}
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {log.performed_by ? `${getEmployeeDisplay(log.performed_by)} • ` : ''}{new Date(log.created_at).toLocaleString('tr-TR')}
                    </div>
                    {log.metadata?.reason && <div style={{ fontSize: '.75rem', color: 'var(--text-strong)', marginTop: 4, fontStyle: 'italic' }}>Neden: "{log.metadata.reason}"</div>}
                    {log.metadata?.note && <div style={{ fontSize: '.75rem', color: 'var(--text-strong)', marginTop: 4, fontStyle: 'italic' }}>Not: "{log.metadata.note}"</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sağ: İşlemler + Yorumlar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* İşlemler ve Yönetim */}
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 0, marginBottom: 16 }}>İşlemler ve Yönetim</h2>

            {/* Atama */}
            <div style={{ marginBottom: 20 }}>
              <label className="f-label" style={{ fontWeight: 700 }}>Görevli Ataması (Assignee)</label>
              <div style={{ fontSize: '.82rem', color: 'var(--text-strong)', marginBottom: 8 }}>
                Şu anki görevli: <strong style={{ color: '#f59e0b' }}>{ticket.assigned_to_name || 'Atanmamış'}</strong>
              </div>
              <SearchableSelect
                value={ticket.assigned_to || ''}
                onChange={handleAssignChange}
                options={employeeOptions}
                placeholder="— Görevli Seçip Ata —"
                searchPlaceholder="Görevli ara..."
                allowClear
                clearLabel="Atamayı Kaldır"
              />
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            {/* Durum değiştir */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label className="f-label" style={{ fontWeight: 700, marginBottom: 4 }}>Geribildirim Durumunu Değiştir</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ticket.status === 'open' && (
                  <button onClick={() => handleStatusChange('in_progress')} className="btn-p" style={{ fontSize: '.78rem', flex: 1 }}>
                    <i className="fa-solid fa-play" style={{ marginRight: 6 }} />İşleme Al
                  </button>
                )}
                {ticket.status === 'assigned' && (
                  <button onClick={() => handleStatusChange('in_progress')} className="btn-p" style={{ fontSize: '.78rem', flex: 1 }}>
                    <i className="fa-solid fa-play" style={{ marginRight: 6 }} />Çalışmayı Başlat
                  </button>
                )}
                {['open','assigned','in_progress','waiting'].includes(ticket.status) && (
                  <button onClick={() => handleStatusChange('resolved')} className="btn-o" style={{ fontSize: '.78rem', color: '#10b981', borderColor: '#10b981', flex: 1 }}>
                    <i className="fa-solid fa-check" style={{ marginRight: 6 }} />Çözüldü İşaretle
                  </button>
                )}
                {ticket.status === 'resolved' && (
                  <button onClick={() => handleStatusChange('closed')} className="btn-p" style={{ fontSize: '.78rem', background: '#4b5563', flex: 1 }}>
                    <i className="fa-solid fa-lock" style={{ marginRight: 6 }} />Geribildirimi Kapat
                  </button>
                )}
                {ticket.status === 'closed' && (
                  <button onClick={() => handleStatusChange('open')} className="btn-o" style={{ fontSize: '.78rem', flex: 1 }}>
                    <i className="fa-solid fa-rotate-left" style={{ marginRight: 6 }} />Tekrar Aç
                  </button>
                )}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

            {/* İleri Düzey */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="f-label" style={{ fontWeight: 700, marginBottom: 2 }}>İleri Düzey Aksiyonlar</label>

              {!ticket.escalated && ticket.status !== 'closed' && ticket.status !== 'resolved' && (
                <button onClick={() => setEscalateModalOpen(true)} className="btn-o" style={{ fontSize: '.78rem', color: '#dc2626', borderColor: '#dc2626', width: '100%', textAlign: 'left' }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 8 }} />Genel Merkez'e Eskale Et (HQ)
                </button>
              )}

              {ticket.status !== 'closed' && (
                <button onClick={() => setTaskModalOpen(true)} className="btn-o" style={{ fontSize: '.78rem', color: '#3b82f6', borderColor: '#3b82f6', width: '100%', textAlign: 'left' }}>
                  <i className="fa-solid fa-list-check" style={{ marginRight: 8 }} />Düzeltici Görev Oluştur (Task)
                </button>
              )}
            </div>
          </div>

          {/* Yorumlar */}
          <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-strong)', marginTop: 0, marginBottom: 0 }}>
              Yorumlar ve Güncellemeler ({ticket.comments?.length || 0})
            </h3>
            <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {(ticket.comments || []).map(comment => (
                <div key={comment.id} style={{ padding: 12, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: '.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 6, fontSize: '.72rem' }}>
                    <strong>{getEmployeeDisplay(comment.author_id)}</strong>
                    <span>{new Date(comment.created_at).toLocaleString('tr-TR')}</span>
                  </div>
                  <div style={{ color: 'var(--text-strong)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{comment.body}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Yorumunuzu veya ilerleme notunuzu yazın..."
                rows={3}
                className="f-input"
                style={{ fontSize: '.8rem', resize: 'vertical' }}
              />
              {uploadedPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {uploadedPhotos.map((url, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img src={buildApiUrl(url)} alt="Ek" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6 }} />
                      <button type="button" onClick={() => setUploadedPhotos(prev => prev.filter((_, idx) => idx !== i))} style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', cursor: 'pointer' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.75rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 600 }}>
                  <i className="fa-solid fa-paperclip" />
                  {uploading ? 'Yükleniyor...' : 'Fotoğraf/Dosya Ekle'}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} style={{ display: 'none' }} />
                </label>
                <button onClick={handleAddComment} className="btn-p" style={{ padding: '8px 16px', fontSize: '.8rem' }}>
                  <i className="fa-solid fa-paper-plane" style={{ marginRight: 6 }} />Yorum Gönder
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Görev Oluştur Modalı */}
      {taskModalOpen && (
        <CreateTaskModal
          ticket={ticket}
          employeeOptions={employeeOptions}
          branchName={branchName}
          onClose={() => setTaskModalOpen(false)}
          onCreated={(task) => {
            toast(`Görev oluşturuldu: "${task.title}"`, 'success')
            setTaskModalOpen(false)
            loadData()
          }}
        />
      )}

      {/* Eskalasyon Modalı */}
      {escalateModalOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, boxShadow: '0 24px 64px rgba(15,23,42,.25)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
                <i className="fa-solid fa-circle-exclamation" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: '1rem', color: '#0f172a' }}>Genel Merkez'e Eskale Et</div>
                <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 2 }}>Tüm GM yetkilileri bildirim alacak</div>
              </div>
              <button onClick={() => { setEscalateModalOpen(false); setEscalateReason('') }} style={{ width: 32, height: 32, border: 'none', background: '#f1f5f9', borderRadius: 8, cursor: 'pointer', color: '#64748b', fontSize: '1rem' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <label style={{ display: 'block', fontSize: '.78rem', fontWeight: 700, color: '#374151', marginBottom: 6 }}>Eskalasyon Nedeni *</label>
              <textarea
                value={escalateReason}
                onChange={e => setEscalateReason(e.target.value)}
                placeholder="Neden Genel Merkez müdahil olmalı?"
                rows={4}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '.84rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ padding: '0 24px 20px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setEscalateModalOpen(false); setEscalateReason('') }} style={{ padding: '10px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: '.84rem', cursor: 'pointer' }}>İptal</button>
              <button onClick={handleEscalate} style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: '.84rem', cursor: 'pointer' }}>
                <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />Eskale Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
