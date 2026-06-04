import React, { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import TaskChatPanel from '@/components/pages/tasks/TaskChatPanel'
import TaskHistory from '@/components/pages/tasks/TaskHistory'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/context/WorkspaceContext'

import { buildApiUrl } from '@/lib/db'
import FormSubmissionDetailModal from '@/components/ui/FormSubmissionDetailModal'

export default function TaskDrawer({
  open,
  task,
  peopleById,
  formTemplates = [],
  onFillForm,
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
  isAssignee,
  isWatcher,
  canRejectCreator,
  onChangeDates,
}) {
  const navigate = useNavigate()
  const { scope } = useWorkspace()
  const [viewSubmissionId, setViewSubmissionId] = useState(null)

  useEffect(() => {
    setViewSubmissionId(null)
  }, [task?.id, open])

  if (!task) return null

  const getTemplateTitle = (id) => {
    const tpl = formTemplates.find(item => item.id === id)
    return tpl ? tpl.title : 'Şablon'
  }

  const getSubmissionsRoute = () => {
    if (scope === 'warehouse') return '/merkez-depo-formlar'
    if (scope === 'branch') return '/sube-formlar'
    return '/formlar'
  }

  const desc = task.description || ''
  const formIdMatch = desc.match(/\[Form ID:\s*([a-fA-F0-9-]{36})\]/)
  const formSubmissionId = formIdMatch ? formIdMatch[1] : null
  const displayDescription = desc.replace(/\[Form ID:\s*[a-fA-F0-9-]{36}\]/g, '').trim()

  const assignees = (task.participants || []).filter(item => item.participant_type === 'assignee')
  const watchers = (task.participants || []).filter(item => item.participant_type === 'watcher')
  const latestAssignmentApproval = (task.approvals || []).find(item => item.request_type === 'assignment' && item.status === 'pending')
  const latestClosureApproval = (task.approvals || []).find(item => item.request_type === 'closure_approval' && item.status === 'pending')

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={task.title || 'Gorev detayi'}
        subtitle={(task.display_status || task.status || '').replaceAll('_', ' ')}
        width={980}
        flex
        footer={(
          <>
            {task.status === 'pending_approval' && latestAssignmentApproval && !isWatcher && (
              <>
                {canRejectCreator && (
                  <button type="button" className="btn-o" onClick={() => onReject(latestAssignmentApproval.id)}>Reddet</button>
                )}
                <button type="button" className="btn-p" onClick={() => onAccept(latestAssignmentApproval.id)}>Kabul Et</button>
              </>
            )}
            {task.status === 'open' && isAssignee && !isWatcher && (
              <button type="button" className="btn-p" onClick={onStart}>Goreve Basla</button>
            )}
            {task.status === 'in_progress' && !isWatcher && (
              <>
                {isAssignee && canRejectCreator && (
                  <button type="button" className="btn-o" onClick={onOpenSendBack}>Geri Gonder</button>
                )}
                {task.delegation_allowed && isAssignee && (
                  <button type="button" className="btn-o" onClick={onOpenDelegate}>Delege Et</button>
                )}
                {isAssignee && (
                  <button type="button" className="btn-p" onClick={onOpenClosure}>Tamamla</button>
                )}
              </>
            )}
            {task.status === 'pending_completion_approval' && latestClosureApproval && !isWatcher && (
              <>
                <button type="button" className="btn-o" onClick={() => onRejectCompletion(latestClosureApproval.id)}>Iade Et</button>
                <button type="button" className="btn-p" onClick={() => onApproveCompletion(latestClosureApproval.id)}>Onayla</button>
              </>
            )}
            {!isWatcher && (
              task.status === 'soft_deleted' ? (
                <button type="button" className="btn-p" onClick={onRestore}>Geri Al</button>
              ) : (
                <button type="button" className="btn-o" onClick={onSoftDelete}>Pasife Al</button>
              )
            )}
          </>
        )}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 20 }}>
          <div style={{ display: 'grid', gap: 18 }}>
            <section className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Aciklama</div>
              <div style={{ marginTop: 10, fontSize: '.88rem', color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{displayDescription || 'Aciklama girilmedi.'}</div>
              
              {formSubmissionId && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setViewSubmissionId(formSubmissionId)
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      fontSize: '.82rem',
                      fontWeight: 700,
                      borderRadius: 8,
                      background: 'rgba(139,92,246,0.1)',
                      color: '#8b5cf6',
                      border: '1px solid rgba(139,92,246,0.2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={e => {
                      e.currentTarget.style.background = 'rgba(139,92,246,0.15)'
                      e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'
                    }}
                    onMouseOut={e => {
                      e.currentTarget.style.background = 'rgba(139,92,246,0.1)'
                      e.currentTarget.style.borderColor = 'rgba(139,92,246,0.2)'
                    }}
                  >
                    <i className="fa-solid fa-file-invoice" />
                    İlişkili Form Yanıtını Aç
                  </button>
                </div>
              )}
            </section>

            {task.form_template_id && (
              <section className="card" style={{ padding: 16, borderLeft: '4px solid #3b82f6' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Görev Formu</div>
                <div style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn-p"
                    onClick={() => onFillForm(task.form_template_id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 16px',
                      fontSize: '.88rem',
                      fontWeight: 700,
                      borderRadius: 10,
                      background: '#3b82f6',
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#2563eb'}
                    onMouseOut={e => e.currentTarget.style.background = '#3b82f6'}
                  >
                    <i className="fa-solid fa-file-signature" />
                    Form Doldur: {getTemplateTitle(task.form_template_id)}
                  </button>
                </div>
              </section>
            )}

            <section className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Katilimcilar</div>
              <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                <div>
                  <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#0f172a' }}>Atananlar</div>
                  <div style={{ marginTop: 4, fontSize: '.8rem', color: '#475569' }}>
                    {assignees.length ? assignees.map((item, idx) => {
                      const person = peopleById.get(String(item.personnel_id))
                      const fullName = [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.username || 'Personel'
                      return (
                        <span key={item.id || idx}>
                          {fullName}
                          {item.is_completed && <span style={{ color: '#16a34a', marginLeft: 4, fontWeight: 'bold' }} title="Tamamladı">✓</span>}
                          {idx < assignees.length - 1 ? ', ' : ''}
                        </span>
                      )
                    }) : 'Atanan yok'}
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
              <div style={{ marginTop: 12, display: 'grid', gap: 12, fontSize: '.82rem', color: '#475569' }}>
                <div>
                  <label className="f-label" style={{ marginBottom: 4, display: 'block' }}>Başlangıç Tarihi</label>
                  <input
                    type="datetime-local"
                    className="f-input"
                    value={task.start_at ? new Date(new Date(task.start_at).getTime() - new Date(task.start_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                    disabled={!task.edit_schedule_allowed || isWatcher}
                    onChange={e => {
                      const val = e.target.value ? new Date(e.target.value).toISOString() : null
                      onChangeDates({ startAt: val, dueAt: task.due_at })
                    }}
                    style={{ height: 36, padding: '4px 8px', marginTop: 4 }}
                  />
                </div>
                <div>
                  <label className="f-label" style={{ marginBottom: 4, display: 'block' }}>Vade Tarihi</label>
                  <input
                    type="datetime-local"
                    className="f-input"
                    value={task.due_at ? new Date(new Date(task.due_at).getTime() - new Date(task.due_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                    disabled={!task.edit_due_date_allowed || isWatcher}
                    onChange={e => {
                      const val = e.target.value ? new Date(e.target.value).toISOString() : null
                      onChangeDates({ startAt: task.start_at, dueAt: val })
                    }}
                    style={{ height: 36, padding: '4px 8px', marginTop: 4 }}
                  />
                </div>
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
                  <a key={item.id} href={buildApiUrl(item.file_url)} target="_blank" rel="noreferrer" style={{ fontSize: '.82rem', color: '#2563eb' }}>
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
      {viewSubmissionId && (
        <FormSubmissionDetailModal
          submissionId={viewSubmissionId}
          templates={formTemplates}
          onClose={() => setViewSubmissionId(null)}
        />
      )}
    </>
  )
}
