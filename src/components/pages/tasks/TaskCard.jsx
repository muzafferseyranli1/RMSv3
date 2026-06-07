function statusMeta(status) {
  const map = {
    open: { label: 'Acik', bg: '#dbeafe', color: '#1d4ed8' },
    in_progress: { label: 'Devam Ediyor', bg: '#fef3c7', color: '#b45309' },
    pending_approval: { label: 'Onay Bekliyor', bg: '#ede9fe', color: '#6d28d9' },
    pending_completion_approval: { label: 'Kapanis Onayi', bg: '#ede9fe', color: '#6d28d9' },
    completed: { label: 'Tamamlandi', bg: '#dcfce7', color: '#15803d' },
    rejected: { label: 'Reddedildi', bg: '#fee2e2', color: '#b91c1c' },
    overdue: { label: 'Gecikti', bg: '#fee2e2', color: '#b91c1c' },
    not_completed: { label: 'Tamamlanmadi', bg: '#fecaca', color: '#991b1b' },
    soft_deleted: { label: 'Pasif', bg: '#e2e8f0', color: '#475569' },
  }
  return map[status] || { label: status || '-', bg: '#e2e8f0', color: '#475569' }
}

function formatDueLabel(task) {
  if (!task?.due_at) return 'Vade yok'
  const dueDate = new Date(task.due_at)
  if (Number.isNaN(dueDate.getTime())) return 'Vade yok'
  const diffMs = dueDate.getTime() - Date.now()
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000))
  if (diffDays < 0) return `${Math.abs(diffDays)} gun gecikti`
  if (diffDays === 0) return 'Bugun'
  return `${diffDays} gun kaldi`
}

export default function TaskCard({ task, peopleById, onOpen }) {
  const status = statusMeta(task.display_status || task.status)
  const assignees = (task.participants || []).filter(item => item.participant_type === 'assignee')
  const checklistTotal = Array.isArray(task.checklist) ? task.checklist.length : Number(task.checklist_count || 0)
  const checklistDone = Array.isArray(task.checklist)
    ? task.checklist.filter(item => item.is_done).length
    : Number(task.checklist_done_count || 0)

  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="card"
      style={{
        width: '100%',
        textAlign: 'left',
        padding: 16,
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        background: '#fff',
        cursor: 'pointer',
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: '.96rem', fontWeight: 800, color: '#0f172a' }}>{task.title || 'Adsiz gorev'}</div>
          <div style={{ marginTop: 4, fontSize: '.79rem', color: '#64748b', lineHeight: 1.5 }}>
            {(task.description || 'Aciklama girilmedi.').replace(/\[Form ID:\s*[a-fA-F0-9-]{36}\]/g, '').trim()}
          </div>
        </div>
        <span style={{
          padding: '6px 10px',
          borderRadius: 999,
          background: status.bg,
          color: status.color,
          fontSize: '.7rem',
          fontWeight: 800,
          whiteSpace: 'nowrap',
        }}>
          {status.label}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: '.74rem', color: '#475569', fontWeight: 700 }}>
          <i className="fa-solid fa-calendar-day" style={{ marginRight: 6 }} />
          {formatDueLabel(task)}
        </span>
        <span style={{ fontSize: '.74rem', color: '#475569', fontWeight: 700 }}>
          <i className="fa-solid fa-user" style={{ marginRight: 6 }} />
          Görevi Veren: {peopleById.get(String(task.created_by_personnel_id || ''))?.firstName || 'Olusturan bilinmiyor'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: '.74rem', color: '#475569', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <i className="fa-solid fa-users" />
          Görevliler:
        </span>
        {assignees.length > 1 && (
          <span style={{ 
            fontSize: '.7rem', 
            fontWeight: 800, 
            background: 'rgba(59,130,246,0.1)', 
            color: '#2563eb', 
            padding: '2px 6px', 
            borderRadius: 4, 
          }}>
            {assignees.filter(a => a.is_completed).length}/{assignees.length} Tamamlandı
          </span>
        )}
        {assignees.length ? assignees.map((item, idx) => {
          const person = peopleById.get(String(item.personnel_id))
          const fullName = [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.username || 'Personel'
          return (
            <span 
              key={item.id || idx} 
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: 4, 
                padding: '2px 8px', 
                borderRadius: 6, 
                fontSize: '.72rem', 
                fontWeight: 600,
                background: item.is_completed ? 'rgba(22,163,74,0.06)' : 'rgba(217,119,6,0.06)', 
                color: item.is_completed ? '#16a34a' : '#d97706',
                border: `1px solid ${item.is_completed ? 'rgba(22,163,74,0.15)' : 'rgba(217,119,6,0.15)'}`
              }}
            >
              <i className={`fa-solid ${item.is_completed ? 'fa-circle-check' : 'fa-circle-dot'}`} style={{ fontSize: '.65rem' }} />
              {fullName}
            </span>
          )
        }) : <span style={{ fontSize: '.74rem', color: '#94a3b8' }}>Atanan yok</span>}
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.72rem', color: '#64748b', fontWeight: 700 }}>
          <span>Checklist</span>
          <span>{checklistDone}/{checklistTotal || 0}</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${checklistTotal ? Math.round((checklistDone / checklistTotal) * 100) : 0}%`,
            background: '#38bdf8',
          }} />
        </div>
      </div>
    </button>
  )
}
