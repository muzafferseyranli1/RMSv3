import Modal from '@/components/ui/Modal'
import TaskChatPanel from '@/components/pages/tasks/TaskChatPanel'
import TaskHistory from '@/components/pages/tasks/TaskHistory'

export default function TaskDrawer({
  open,
  task,
  peopleById,
  onClose,
  onStart,
  onAccept,
  onReject,
  onSoftDelete,
  onRestore,
  onOpenClosure,
  onOpenSendBack,
  onOpenDelegate,
  onApproveCompletion,
  onRejectCompletion,
  onSendMessage,
}) {
  if (!task) return null

  const assignees = (task.participants || []).filter(item => item.participant_type === 'assignee')
  const watchers = (task.participants || []).filter(item => item.participant_type === 'watcher')
  const latestAssignmentApproval = (task.approvals || []).find(item => item.request_type === 'assignment' && item.status === 'pending')
  const latestClosureApproval = (task.approvals || []).find(item => item.request_type === 'closure_approval' && item.status === 'pending')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task.title || 'Gorev detayi'}
      subtitle={(task.display_status || task.status || '').replaceAll('_', ' ')}
      width={980}
      flex
      footer={(
        <>
          {task.status === 'pending_approval' && latestAssignmentApproval && (
            <>
              <button type="button" className="btn-o" onClick={() => onReject(latestAssignmentApproval.id)}>Reddet</button>
              <button type="button" className="btn-p" onClick={() => onAccept(latestAssignmentApproval.id)}>Kabul Et</button>
            </>
          )}
          {task.status === 'open' && <button type="button" className="btn-p" onClick={onStart}>Goreve Basla</button>}
          {task.status === 'in_progress' && (
            <>
              <button type="button" className="btn-o" onClick={onOpenSendBack}>Geri Gonder</button>
              {task.delegation_allowed && <button type="button" className="btn-o" onClick={onOpenDelegate}>Delege Et</button>}
              <button type="button" className="btn-p" onClick={onOpenClosure}>Tamamla</button>
            </>
          )}
          {task.status === 'pending_completion_approval' && latestClosureApproval && (
            <>
              <button type="button" className="btn-o" onClick={() => onRejectCompletion(latestClosureApproval.id)}>Iade Et</button>
              <button type="button" className="btn-p" onClick={() => onApproveCompletion(latestClosureApproval.id)}>Onayla</button>
            </>
          )}
          {task.status === 'soft_deleted' ? (
            <button type="button" className="btn-p" onClick={onRestore}>Geri Al</button>
          ) : (
            <button type="button" className="btn-o" onClick={onSoftDelete}>Pasife Al</button>
          )}
        </>
      )}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 20 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Aciklama</div>
            <div style={{ marginTop: 10, fontSize: '.88rem', color: '#0f172a', lineHeight: 1.6 }}>{task.description || 'Aciklama girilmedi.'}</div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Katilimcilar</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
              <div>
                <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#0f172a' }}>Atananlar</div>
                <div style={{ marginTop: 4, fontSize: '.8rem', color: '#475569' }}>
                  {assignees.length ? assignees.map(item => {
                    const person = peopleById.get(String(item.personnel_id))
                    return [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.username || 'Personel'
                  }).join(', ') : 'Atanan yok'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#0f172a' }}>Gozlemciler</div>
                <div style={{ marginTop: 4, fontSize: '.8rem', color: '#475569' }}>
                  {watchers.length ? watchers.map(item => {
                    const person = peopleById.get(String(item.personnel_id))
                    return [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.username || 'Personel'
                  }).join(', ') : 'Gozlemci yok'}
                </div>
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Checklist</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {(task.checklist || []).length === 0 ? (
                <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>Checklist yok.</div>
              ) : (task.checklist || []).map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 10, fontSize: '.84rem', color: '#0f172a' }}>
                  <i className={`fa-regular ${item.is_done ? 'fa-square-check' : 'fa-square'}`} style={{ marginTop: 2, color: item.is_done ? '#16a34a' : '#94a3b8' }} />
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Chat</div>
            <div style={{ marginTop: 12 }}>
              <TaskChatPanel messages={task.messages || []} peopleById={peopleById} onSend={onSendMessage} />
            </div>
          </section>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Tarih ve Kurallar</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: '.82rem', color: '#475569' }}>
              <div>Baslangic: {task.start_at ? new Date(task.start_at).toLocaleString('tr-TR') : '-'}</div>
              <div>Vade: {task.due_at ? new Date(task.due_at).toLocaleString('tr-TR') : '-'}</div>
              <div>Oncelik: {task.priority || 'normal'}</div>
              <div>Delege: {task.delegation_allowed ? 'Acik' : 'Kapali'}</div>
              <div>Kapanis onayi: {task.approval_required ? 'Gerekli' : 'Yok'}</div>
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Ekler</div>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {(task.attachments || []).length === 0 ? (
                <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>Ek yok.</div>
              ) : (task.attachments || []).map(item => (
                <a key={item.id} href={`${import.meta.env.VITE_API_URL}${item.file_url}`} target="_blank" rel="noreferrer" style={{ fontSize: '.82rem', color: '#2563eb' }}>
                  <i className="fa-solid fa-paperclip" style={{ marginRight: 6 }} />
                  {item.file_name}
                </a>
              ))}
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>History</div>
            <div style={{ marginTop: 12 }}>
              <TaskHistory history={task.history || []} peopleById={peopleById} />
            </div>
          </section>
        </div>
      </div>
    </Modal>
  )
}
