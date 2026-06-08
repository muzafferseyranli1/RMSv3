import React, { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import TaskChatPanel from '@/components/pages/tasks/TaskChatPanel'
import TaskHistory from '@/components/pages/tasks/TaskHistory'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/context/WorkspaceContext'

import { buildApiUrl } from '@/lib/db'
import FormSubmissionDetailModal from '@/components/ui/FormSubmissionDetailModal'
import { fetchWorkflowInstanceDetail, loadWorkflowPersonnelContext } from '@/lib/workflowService'

// Yardımcı Fonksiyon: Form yanıt değerlerini okunabilir hale getirir
function getDisplayValue(val, personnelContext) {
  if (val && typeof val === 'object' && val.amount !== undefined) {
    return `${val.amount} ${val.currency || 'TRY'}`
  }
  if (val && typeof val === 'string' && val.startsWith('{')) {
    try {
      const parsed = JSON.parse(val)
      if (parsed && parsed.amount !== undefined) {
        return `${parsed.amount} ${parsed.currency || 'TRY'}`
      }
    } catch (e) {}
  }
  // Gider Hesabı ise ismini çöz
  if (personnelContext && personnelContext.accounts) {
    const acc = personnelContext.accounts.find(a => String(a.id) === String(val))
    if (acc) {
      return acc.code ? `${acc.name} (${acc.code})` : acc.name
    }
  }
  return String(val)
}

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
  isCreator,
  canRejectCreator,
  onChangeDates,
  onWorkflowAction,
}) {
  const navigate = useNavigate()
  const { scope } = useWorkspace()
  const [viewSubmissionId, setViewSubmissionId] = useState(null)

  // Workflow Specific States
  const [workflowInstance, setWorkflowInstance] = useState(null)
  const [personnelContext, setPersonnelContext] = useState(null)
  const [loadingWorkflow, setLoadingWorkflow] = useState(false)

  useEffect(() => {
    setViewSubmissionId(null)
    setWorkflowInstance(null)
    setPersonnelContext(null)

    if (open && task && task.linked_entity_table === 'workflow_instances' && task.linked_entity_id) {
      setLoadingWorkflow(true)
      Promise.all([
        fetchWorkflowInstanceDetail(task.linked_entity_id),
        loadWorkflowPersonnelContext()
      ])
        .then(([res, context]) => {
          if (!res.error && res.data) {
            setWorkflowInstance(res.data)
            setPersonnelContext(context)
          }
        })
        .finally(() => setLoadingWorkflow(false))
    }
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
            {task.linked_entity_table === 'workflow_instances' ? (
              <>
                {['open', 'in_progress'].includes(task.status) && isAssignee && !isWatcher && (
                  <>
                    <button
                      type="button"
                      className="btn-o"
                      onClick={() => {
                        const reason = window.prompt('Lütfen reddetme gerekçesini giriniz:')
                        if (reason === null) return
                        if (!reason.trim()) {
                          alert('Reddetme gerekçesi girmek zorunludur.')
                          return
                        }
                        onWorkflowAction?.('reject', reason)
                      }}
                      style={{ borderColor: '#ef4444', color: '#ef4444' }}
                    >
                      Reddet
                    </button>
                    <button
                      type="button"
                      className="btn-p"
                      onClick={() => {
                        const notes = window.prompt('Onay notu yazabilirsiniz (İsteğe bağlı):')
                        if (notes === null) return
                        onWorkflowAction?.('approve', notes)
                      }}
                      style={{ background: '#10b981', borderColor: '#10b981' }}
                    >
                      Onayla
                    </button>
                  </>
                )}
              </>
            ) : (
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
                {['open', 'in_progress'].includes(task.status) && !isWatcher && (
                  <>
                    {task.status === 'in_progress' && isAssignee && canRejectCreator && !task.form_template_id && !formSubmissionId && (
                      <button type="button" className="btn-o" onClick={onOpenSendBack}>Geri Gonder</button>
                    )}
                    {task.status === 'in_progress' && task.delegation_allowed && isAssignee && (
                      <button type="button" className="btn-o" onClick={onOpenDelegate}>Delege Et</button>
                    )}
                    {(isAssignee || isCreator) && (
                      <button 
                        type="button" 
                        className="btn-p" 
                        onClick={onOpenClosure}
                        style={{ background: isCreator && !isAssignee ? '#b91c1c' : undefined, borderColor: isCreator && !isAssignee ? '#b91c1c' : undefined }}
                      >
                        {isCreator && !isAssignee ? 'Görevi Kapat (Tümü İçin)' : 'Tamamla'}
                      </button>
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

            {task.linked_entity_table === 'workflow_instances' && (
              <section className="card" style={{ padding: 16, borderLeft: '4px solid #4f46e5' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#4f46e5', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fa-solid fa-file-invoice" />
                  <span>İş Akışı Talep Formu Detayı</span>
                </div>
                
                {loadingWorkflow ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', color: '#64748b', padding: '10px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ color: '#4f46e5' }} />
                    <span>Detaylar yükleniyor...</span>
                  </div>
                ) : workflowInstance ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    
                    {/* Form Answers Grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface-2)', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
                      {(() => {
                        const contextDataKeys = Object.keys(workflowInstance.context_data || {}).filter(k => k !== 'branch_id')
                        
                        if (contextDataKeys.length === 0) {
                          return <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Bu talep formunda veri bulunmamaktadır.</span>
                        }

                        return (
                          <div style={{ display: 'grid', gap: 8 }}>
                            {contextDataKeys.map(key => {
                              const val = workflowInstance.context_data[key]
                              
                              // URL check
                              const isUrl = typeof val === 'string' && val.startsWith('/api/files/')
                              const isImage = isUrl && (val.endsWith('.jpg') || val.endsWith('.png') || val.endsWith('.jpeg'))
                              
                              return (
                                <div key={key} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 8, fontSize: '.78rem', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: 6 }}>
                                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{key.replace('f_', '')}:</span>
                                  <span style={{ color: 'var(--text-strong)' }}>
                                    {isImage ? (
                                      <a href={buildApiUrl(val)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', width: 64, height: 64, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                                        <img src={buildApiUrl(val)} alt="Resim" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      </a>
                                    ) : isUrl ? (
                                      <a href={buildApiUrl(val)} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                                        <i className="fa-solid fa-file-pdf" /> Belgeyi İndir / Görüntüle
                                      </a>
                                    ) : (
                                      getDisplayValue(val, personnelContext)
                                    )}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>

                    {/* Workflow History Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: '.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Onay Süreç Geçmişi</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingLeft: 12, borderLeft: '2px solid var(--border)', position: 'relative', marginLeft: 4 }}>
                        {(workflowInstance.history || []).map((h, idx) => {
                          let actionText = 'İlerletildi'
                          let badgeColor = '#64748b'
                          if (h.action === 'submit') { actionText = 'Talep Başlatıldı'; badgeColor = '#4f46e5' }
                          if (h.action === 'approve') { actionText = 'Onaylandı'; badgeColor = '#10b981' }
                          if (h.action === 'reject') { actionText = 'Reddedildi'; badgeColor = '#ef4444' }
                          if (h.action === 'return_to_start') { actionText = 'Revizyona Gönderildi'; badgeColor = '#f59e0b' }

                          return (
                            <div key={h.id || idx} style={{ position: 'relative', fontSize: '.76rem' }}>
                              <div style={{ position: 'absolute', left: -19, top: 3, width: 10, height: 10, borderRadius: '50%', background: badgeColor, border: '2px solid var(--surface)' }} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-strong)' }}>
                                <span>{actionText}</span>
                                <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{new Date(h.created_at).toLocaleDateString('tr-TR')} {new Date(h.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div style={{ fontSize: '.72rem', color: 'var(--text-main)', marginTop: 2 }}>
                                {h.performed_by_name} ({h.performed_by_position})
                              </div>
                              {h.notes && (
                                <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4, background: 'var(--surface-3)', padding: '4px 8px', borderRadius: 6, fontSize: '.72rem' }}>
                                  Not: {h.notes}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div style={{ fontSize: '.8rem', color: '#ef4444' }}>Talep detayları bulunamadı.</div>
                )}
              </section>
            )}

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
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#0f172a' }}>Atananlar</div>
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {assignees.length ? assignees.map((item, idx) => {
                      const person = peopleById.get(String(item.personnel_id))
                      const fullName = [person?.firstName, person?.lastName].filter(Boolean).join(' ') || person?.username || 'Personel'
                      return (
                        <span 
                          key={item.id || idx} 
                          style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: 6, 
                            padding: '4px 10px', 
                            borderRadius: 8, 
                            fontSize: '.76rem', 
                            fontWeight: 600,
                            background: item.is_completed ? 'rgba(22,163,74,0.08)' : 'rgba(217,119,6,0.08)', 
                            color: item.is_completed ? '#16a34a' : '#d97706',
                            border: `1px solid ${item.is_completed ? 'rgba(22,163,74,0.2)' : 'rgba(217,119,6,0.2)'}`
                          }}
                        >
                          <i className={`fa-solid ${item.is_completed ? 'fa-circle-check' : 'fa-circle-dot'}`} style={{ fontSize: '.7rem' }} />
                          {fullName}
                          {item.is_completed ? ' (Tamamladı)' : ' (Devam Ediyor)'}
                        </span>
                      )
                    }) : <span style={{ fontSize: '.8rem', color: '#94a3b8' }}>Atanan yok</span>}
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
