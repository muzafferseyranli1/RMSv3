import React, { useState, useEffect, useCallback } from 'react'
import { db, buildApiUrl, uploadApiFile } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/context/AuthContext'
import { fetchFormTemplates, submitFormResponse } from '@/lib/formService'
import {
  fetchWorkflowDefinitions,
  fetchWorkflowInstances,
  fetchWorkflowInstanceDetail,
  createWorkflowInstance,
  advanceWorkflow,
  loadWorkflowPersonnelContext
} from '@/lib/workflowService'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { buildExpenseAccountOptions } from '@/lib/accountChart'

// Yardımcı Fonksiyon: Şablon alanlarını düzleştirilmiş dizi olarak döndürür
function getTemplateFields(template) {
  if (!template || !template.schema_json) return []
  if (Array.isArray(template.schema_json.fields)) {
    return template.schema_json.fields
  }
  if (Array.isArray(template.schema_json.sections)) {
    const fields = []
    template.schema_json.sections.forEach(sec => {
      if (Array.isArray(sec.fields)) {
        fields.push(...sec.fields)
      }
    })
    return fields
  }
  return []
}

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

export default function WorkflowInstancesList({ onManageDefinitions }) {
  const toast = useToast()
  const [user, setUser] = useState(null)
  
  const [tab, setTab] = useState('new_request') // new_request, my_requests, my_approvals
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  // Data States
  const [definitions, setDefinitions] = useState([])
  const [instances, setInstances] = useState([])
  const [myApprovals, setMyApprovals] = useState([])
  const [personnelContext, setPersonnelContext] = useState(null)
  
  // Active Form Submission States
  const [selectedDef, setSelectedDef] = useState(null)
  const [activeTemplate, setActiveTemplate] = useState(null)
  const [formAnswers, setFormAnswers] = useState({})
  const [uploadingFields, setUploadingFields] = useState({})
  
  // Detail Modal States
  const [selectedInstance, setSelectedInstance] = useState(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [approvingInstance, setApprovingInstance] = useState(null)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [approvalModalOpen, setApprovalModalOpen] = useState(false)

  const loadData = useCallback(async () => {
    const storedUser = JSON.parse(sessionStorage.getItem('rms_active_user') || localStorage.getItem('rms_active_user') || 'null')
    if (!storedUser || !storedUser.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [defsRes, context] = await Promise.all([
        fetchWorkflowDefinitions(),
        loadWorkflowPersonnelContext()
      ])
      
      setDefinitions(defsRes.data || [])
      setPersonnelContext(context)

      const currentUser = context.employeesById.get(String(storedUser.id)) || {
        id: storedUser.id,
        firstName: storedUser.firstName || 'Bilinmeyen',
        lastName: storedUser.lastName || '',
        defaultBranchId: storedUser.defaultBranchId || null,
        authorityLevel: storedUser.role === 'admin' ? 'Genel Merkez' : 'Şube'
      }

      setUser(currentUser)

      // Giriş yapan kullanıcının başlattığı talepler
      const instRes = await fetchWorkflowInstances({ actor: currentUser, role: 'mine' })
      setInstances(instRes.data || [])

      // Giriş yapan kullanıcının onaylaması gereken görevler (linked_entity_table = 'workflow_instances' ve status = 'open')
      const { data: participantRows, error: partErr } = await db.from('task_participants')
        .select('task_id')
        .eq('personnel_id', currentUser.id)
        .eq('is_completed', false)

      if (!partErr && participantRows && participantRows.length > 0) {
        const taskIds = participantRows.map(r => r.task_id)
        const { data: openTasks, error: taskErr } = await db.from('tasks')
          .select('id, title, description, created_by_personnel_id, created_at, linked_entity_id')
          .eq('linked_entity_table', 'workflow_instances')
          .eq('status', 'open')
          .in('id', taskIds)

        if (!taskErr && openTasks) {
          // Taleplerin isimlerini ve detaylarını akış listesinden eşleştir
          const approvalsMapped = openTasks.map(t => {
            const starter = context.employeesById.get(String(t.created_by_personnel_id))
            return {
              taskId: t.id,
              instanceId: t.linked_entity_id,
              title: t.title,
              description: t.description,
              created_at: t.created_at,
              started_by_name: starter ? `${starter.firstName} ${starter.lastName}` : `Personel`,
              started_by_position: starter ? context.positionsById.get(String(starter.positionId))?.name || '-' : '-'
            }
          })
          setMyApprovals(approvalsMapped)
        } else if (taskErr) {
          console.error(taskErr)
        }
      } else {
        setMyApprovals([])
        if (partErr) {
          console.error(partErr)
        }
      }
    } catch (err) {
      console.error(err)
      toast('Talepler yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { loadData() }, [loadData])

  const handleStartRequest = async (def) => {
    setSelectedDef(def)
    
    // Akışın başlangıç form template ID'sini bul
    const startStep = (def.blueprint?.steps || []).find(s => s.type === 'start')
    if (!startStep || !startStep.form_template_id) {
      toast('Bu akışa bağlı bir başlangıç formu bulunamadı.', 'warning')
      return
    }

    // Şablon detayını çek
    const { data: tpl } = await db.from('form_templates').select('*').eq('id', startStep.form_template_id).maybeSingle()
    if (!tpl) {
      toast('Talep formu şablonu veritabanında bulunamadı.', 'error')
      return
    }

    setActiveTemplate(tpl)
    
    // Boş cevaplar nesnesini başlat
    const initAnswers = {}
    const fields = getTemplateFields(tpl)
    fields.forEach(f => {
      initAnswers[f.id] = { value: '', note: '' }
    })
    setFormAnswers(initAnswers)
  }

  const handleUpdateAnswer = (fieldId, val) => {
    setFormAnswers(prev => ({
      ...prev,
      [fieldId]: { ...prev[fieldId], value: val }
    }))
  }

  const handleFileUpload = async (fieldId, file) => {
    if (!file) return
    setUploadingFields(prev => ({ ...prev, [fieldId]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploaded = await uploadApiFile(formData)
      const url = uploaded?.url || uploaded?.publicUrl || uploaded?.public_url || uploaded?.path || uploaded?.fileUrl || uploaded?.file_url || ''
      if (url) {
        handleUpdateAnswer(fieldId, url)
        toast('Dosya başarıyla yüklendi', 'success')
      } else {
        toast('Dosya adresi alınamadı', 'error')
      }
    } catch (err) {
      console.error(err)
      toast('Yükleme başarısız: ' + err.message, 'error')
    } finally {
      setUploadingFields(prev => ({ ...prev, [fieldId]: false }))
    }
  }

  const handleSubmitRequest = async () => {
    // Zorunlu alan kontrolü
    const fields = getTemplateFields(activeTemplate)
    for (const f of fields) {
      const val = formAnswers[f.id]?.value
      let isEmpty = !val || val === ''
      if (f.type === 'financial_input') {
        const amt = val?.amount !== undefined ? val.amount : (val && typeof val === 'string' && val.startsWith('{') ? JSON.parse(val).amount : '')
        isEmpty = amt === '' || amt === undefined
      }
      if (f.required && isEmpty) {
        toast(`Lütfen "${f.label}" alanını doldurunuz.`, 'warning')
        return
      }
    }

    setSubmitting(true)

    // context_data nesnesini hazırla (basit key-value çiftleri halinde)
    const contextData = {
      branch_id: user.defaultBranchId || user.branchId || null
    }
    Object.keys(formAnswers).forEach(key => {
      contextData[key] = formAnswers[key].value
    })

    try {
      // İstemci tarafı akış oluşturma servisini çağır
      const res = await createWorkflowInstance(selectedDef.id, user, contextData)
      if (res.error) throw res.error

      toast('Talebiniz başarıyla oluşturuldu ve onay sürecine gönderildi', 'success')
      setActiveTemplate(null)
      setSelectedDef(null)
      setTab('my_requests')
      loadData()
    } catch (err) {
      console.error(err)
      toast('Talep gönderilemedi: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenInstanceDetail = async (instanceId) => {
    const detail = await fetchWorkflowInstanceDetail(instanceId)
    if (detail.data) {
      setSelectedInstance(detail.data)
      setDetailModalOpen(true)
    } else {
      toast('Talep detayları yüklenemedi', 'error')
    }
  }

  const handleOpenApprovalDialog = (appr) => {
    setApprovingInstance(appr)
    setApprovalNotes('')
    setApprovalModalOpen(true)
  }

  const handleProcessApproval = async (action) => {
    if (action === 'reject' && !approvalNotes.trim()) {
      toast('Reddetme işlemi için gerekçe girmeniz zorunludur.', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const res = await advanceWorkflow(approvingInstance.instanceId, action, user, approvalNotes, {})
      if (res.error) throw res.error

      toast(action === 'approve' ? 'Talep onaylandı.' : 'Talep reddedildi.', 'success')
      setApprovalModalOpen(false)
      setApprovingInstance(null)
      loadData()
    } catch (err) {
      console.error(err)
      toast('İşlem başarısız: ' + err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 8, color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ color: '#4f46e5', fontSize: '1.4rem' }} /> Yükleniyor...
      </div>
    )
  }

  return (
    <div style={{ padding: 12 }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>
            Talep ve İş Akışı Yönetimi
          </h1>
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            İzin, avans veya masraf taleplerinizi oluşturun ve onay rotasını izleyin.
          </p>
        </div>
        
        {/* Merkez yöneticisi ise tasarım ekranına geçebilir */}
        {user.authorityLevel === 'Genel Merkez' && (
          <button className="btn-o" onClick={onManageDefinitions} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', padding: '8px 14px' }}>
            <i className="fa-solid fa-gears" /> İş Akışı Şablonları Tasarla
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 20 }}>
        <button
          onClick={() => { setTab('new_request'); setActiveTemplate(null); setSelectedDef(null) }}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: '.85rem', fontWeight: 700, border: 'none', background: tab === 'new_request' ? '#4f46e5' : 'transparent', color: tab === 'new_request' ? '#fff' : 'var(--text-main)', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          <i className="fa-solid fa-plus-circle" style={{ marginRight: 6 }} /> Yeni Talep Oluştur
        </button>
        <button
          onClick={() => { setTab('my_requests'); setActiveTemplate(null); setSelectedDef(null) }}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: '.85rem', fontWeight: 700, border: 'none', background: tab === 'my_requests' ? '#4f46e5' : 'transparent', color: tab === 'my_requests' ? '#fff' : 'var(--text-main)', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          <i className="fa-solid fa-file-invoice" style={{ marginRight: 6 }} /> Taleplerim ({instances.length})
        </button>
        <button
          onClick={() => { setTab('my_approvals'); setActiveTemplate(null); setSelectedDef(null) }}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: '.85rem', fontWeight: 700, border: 'none', background: tab === 'my_approvals' ? '#4f46e5' : 'transparent', color: tab === 'my_approvals' ? '#fff' : 'var(--text-main)', cursor: 'pointer', transition: 'all 0.15s' }}
        >
          <i className="fa-solid fa-circle-check" style={{ marginRight: 6 }} /> Onay Bekleyenler ({myApprovals.length})
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 8, color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ color: '#4f46e5', fontSize: '1.4rem' }} /> Yükleniyor...
        </div>
      )}

      {!loading && (
        <>
          {/* Tab 1: Yeni Talep Oluştur */}
          {tab === 'new_request' && !activeTemplate && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
              {definitions.length === 0 ? (
                <div style={{ gridColumn: '1/-1', padding: 40, border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Sistemde tanımlı iş akışı talep şablonu bulunamadı.
                </div>
              ) : (
                definitions.map(def => {
                  let icon = 'fa-file-signature'
                  let color = '#4f46e5'
                  if (def.workflow_type === 'leave') { icon = 'fa-calendar-day'; color = '#10b981' }
                  if (def.workflow_type === 'advance') { icon = 'fa-money-bill-trend-up'; color = '#f59e0b' }
                  if (def.workflow_type === 'expense') { icon = 'fa-receipt'; color = '#ef4444' }
                  if (def.workflow_type === 'purchase') { icon = 'fa-cart-shopping'; color = '#8b5cf6' }

                  return (
                    <div key={def.id} className="card hover-glow" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, cursor: 'pointer' }} onClick={() => handleStartRequest(def)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
                          <i className={`fa-solid ${icon}`} style={{ fontSize: '1.2rem' }} />
                        </div>
                        <h3 style={{ margin: 0, fontSize: '.9rem', fontWeight: 800, color: 'var(--text-strong)' }}>{def.name}</h3>
                      </div>
                      <p style={{ margin: 0, fontSize: '.75rem', color: 'var(--text-muted)', lineHeight: 1.4, flex: 1 }}>
                        {def.description || 'Bu form aracılığıyla yeni bir talep oluşturabilirsiniz.'}
                      </p>
                      <button className="btn-p" style={{ width: '100%', fontSize: '.8rem', padding: '6px 12px' }}>
                        Talebi Başlat
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* Talep Formu Gönderme Arayüzü */}
          {tab === 'new_request' && activeTemplate && (
            <div className="card" style={{ maxWidth: 600, margin: '0 auto', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12, marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-strong)' }}>{selectedDef.name}</h3>
                  <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Lütfen aşağıdaki talep formunu eksiksiz doldurunuz.</span>
                </div>
                <button className="btn-o" onClick={() => { setActiveTemplate(null); setSelectedDef(null) }} style={{ padding: '4px 8px', fontSize: '.75rem' }}>İptal</button>
              </div>

              {/* Dinamik Form Alanları */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {getTemplateFields(activeTemplate).map(field => {
                  const answer = formAnswers[field.id] || { value: '' }

                  return (
                    <div key={field.id} style={{ display: 'grid', gap: 6 }}>
                      <label className="f-label">
                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>

                      {field.type === 'text' && (
                        <textarea
                          value={answer.value}
                          onChange={e => handleUpdateAnswer(field.id, e.target.value)}
                          placeholder="Açıklama giriniz..."
                          rows={2}
                          className="f-input"
                          style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8, resize: 'vertical' }}
                        />
                      )}

                      {field.type === 'number' && (
                        <input
                          type="number"
                          value={answer.value}
                          onChange={e => handleUpdateAnswer(field.id, e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Tutar / Sayı"
                          className="f-input"
                          style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8 }}
                        />
                      )}

                      {field.type === 'financial_input' && (() => {
                        const valObj = answer?.value && typeof answer.value === 'object'
                          ? answer.value
                          : (answer?.value && typeof answer.value === 'string' && answer.value.startsWith('{')
                              ? JSON.parse(answer.value)
                              : { amount: '', currency: 'TRY' })
                        return (
                          <div style={{ display: 'flex', gap: 8, maxWidth: 260 }}>
                            <input
                              type="number"
                              value={valObj.amount || ''}
                              onChange={e => {
                                const amt = e.target.value === '' ? '' : Number(e.target.value)
                                handleUpdateAnswer(field.id, { ...valObj, amount: amt })
                              }}
                              placeholder="Tutar"
                              className="f-input"
                              style={{ flex: 2, padding: '8px 12px', fontSize: '.8rem', borderRadius: 8 }}
                            />
                            <div className="sel-wrap" style={{ flex: 1.2 }}>
                              <select
                                value={valObj.currency || 'TRY'}
                                onChange={e => {
                                  handleUpdateAnswer(field.id, { ...valObj, currency: e.target.value })
                                }}
                                className="f-input"
                                style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8 }}
                              >
                                <option value="TRY">TRY</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                              </select>
                            </div>
                          </div>
                        )
                      })()}

                      {field.type === 'date' && (
                        <input
                          type="date"
                          value={answer.value}
                          onChange={e => handleUpdateAnswer(field.id, e.target.value)}
                          className="f-input"
                          style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8 }}
                        />
                      )}

                      {field.type === 'time' && (
                        <input
                          type="time"
                          value={answer.value}
                          onChange={e => handleUpdateAnswer(field.id, e.target.value)}
                          className="f-input"
                          style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8 }}
                        />
                      )}

                      {field.type === 'select' && (
                        <select
                          value={answer.value}
                          onChange={e => handleUpdateAnswer(field.id, e.target.value)}
                          className="f-input"
                          style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8 }}
                        >
                          <option value="">Seçiniz</option>
                          {(field.options || []).map((opt, i) => {
                            const val = typeof opt === 'object' ? opt.label : opt
                            return <option key={i} value={val}>{val}</option>
                          })}
                        </select>
                      )}

                      {/* Photo Upload */}
                      {field.type === 'photo' && (() => {
                        const isUploading = !!uploadingFields[field.id]
                        const photoUrl = answer.value

                        if (isUploading) {
                          return (
                            <div style={{ padding: '10px 14px', border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                              <i className="fa-solid fa-spinner fa-spin" style={{ color: '#8b5cf6' }} />
                              <span style={{ fontSize: '.75rem' }}>Fotoğraf yükleniyor...</span>
                            </div>
                          )
                        }

                        if (photoUrl) {
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
                              <img src={buildApiUrl(photoUrl)} alt="Yüklenen Görsel" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                              <button type="button" className="btn-o" onClick={() => handleUpdateAnswer(field.id, '')} style={{ borderColor: '#ef4444', color: '#ef4444', fontSize: '.7rem', padding: '4px 8px' }}>Sil</button>
                            </div>
                          )
                        }

                        return (
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', background: 'var(--surface-2)', fontSize: '.78rem', width: 'fit-content' }}>
                            <i className="fa-solid fa-camera" style={{ color: '#4f46e5' }} /> Fotoğraf Çek / Yükle
                            <input type="file" accept="image/*" onChange={e => handleFileUpload(field.id, e.target.files?.[0])} style={{ display: 'none' }} />
                          </label>
                        )
                      })()}

                      {/* File Upload */}
                      {field.type === 'file' && (() => {
                        const isUploading = !!uploadingFields[field.id]
                        const fileUrl = answer.value

                        if (isUploading) {
                          return (
                            <div style={{ padding: '10px 14px', border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                              <i className="fa-solid fa-spinner fa-spin" style={{ color: '#8b5cf6' }} />
                              <span style={{ fontSize: '.75rem' }}>Dosya yükleniyor...</span>
                            </div>
                          )
                        }

                        if (fileUrl) {
                          const name = String(fileUrl).split('/').pop() || 'dosya'
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, border: '1px solid var(--border)', borderRadius: 8, width: '100%' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                                <i className="fa-solid fa-file-pdf" style={{ color: '#ef4444' }} />
                                <span style={{ fontSize: '.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                              </div>
                              <button type="button" className="btn-o" onClick={() => handleUpdateAnswer(field.id, '')} style={{ borderColor: '#ef4444', color: '#ef4444', fontSize: '.7rem', padding: '4px 8px' }}>Sil</button>
                            </div>
                          )
                        }

                        return (
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 14px', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', background: 'var(--surface-2)', fontSize: '.78rem', width: 'fit-content' }}>
                            <i className="fa-solid fa-paperclip" style={{ color: '#4f46e5' }} /> Belge / Dosya Yükle
                            <input type="file" onChange={e => handleFileUpload(field.id, e.target.files?.[0])} style={{ display: 'none' }} />
                          </label>
                        )
                      })()}

                      {/* Gider Hesabı Seçimi */}
                      {field.type === 'expense_account_select' && (
                        <div style={{ minWidth: 200 }}>
                          <SearchableSelect
                            value={answer.value}
                            onChange={val => handleUpdateAnswer(field.id, val)}
                            options={personnelContext ? buildExpenseAccountOptions(personnelContext.accounts || []) : []}
                            placeholder="Gider Hesabı Seçiniz..."
                            searchPlaceholder="Hesap ara..."
                            noResultsLabel="Gider hesabı bulunamadı"
                            allowClear={true}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <button className="btn-o" onClick={() => { setActiveTemplate(null); setSelectedDef(null) }} disabled={submitting}>İptal</button>
                <button className="btn-p" onClick={handleSubmitRequest} disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {submitting ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />} Talebi Gönder
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Taleplerim */}
          {tab === 'my_requests' && (
            <div className="card" style={{ padding: 20 }}>
              {instances.length === 0 ? (
                <div style={{ padding: 40, textAlignCenter: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  Henüz bir talebiniz bulunmuyor.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Talep Tipi</th>
                        <th style={{ textAlign: 'left' }}>Tarih</th>
                        <th style={{ textAlign: 'left' }}>Mevcut Adım</th>
                        <th style={{ textAlign: 'left' }}>Durum</th>
                        <th style={{ width: 100, textAlign: 'right' }}>İncele</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances.map(inst => {
                        let statusColor = '#f59e0b'
                        let statusText = 'Onayda'
                        if (inst.status === 'completed') { statusColor = '#10b981'; statusText = 'Onaylandı' }
                        if (inst.status === 'rejected') { statusColor = '#ef4444'; statusText = 'Reddedildi' }

                        const blueprint = definitions.find(d => d.id === inst.definition_id)?.blueprint || { steps: [] }
                        const currentStepName = (blueprint.steps || []).find(s => s.id === inst.current_node_id)?.name || 'Tamamlandı'

                        return (
                          <tr key={inst.id}>
                            <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{inst.definition_name}</td>
                            <td>{new Date(inst.started_at).toLocaleDateString('tr-TR')} {new Date(inst.started_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td style={{ fontWeight: 600 }}>{currentStepName}</td>
                            <td>
                              <span style={{ padding: '3px 8px', borderRadius: 99, fontSize: '.7rem', fontWeight: 800, background: `${statusColor}15`, color: statusColor }}>
                                {statusText}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button className="btn-o" style={{ padding: '3px 8px', fontSize: '.72rem' }} onClick={() => handleOpenInstanceDetail(inst.id)}>
                                <i className="fa-solid fa-eye" /> İncele
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Onay Bekleyenler */}
          {tab === 'my_approvals' && (
            <div className="card" style={{ padding: 20 }}>
              {myApprovals.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  Onaylamanızı bekleyen aktif bir talep bulunmamaktadır.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ width: '100%', fontSize: '.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Talep Sahibi</th>
                        <th style={{ textAlign: 'left' }}>Görevi</th>
                        <th style={{ textAlign: 'left' }}>Talep Başlığı</th>
                        <th style={{ textAlign: 'left' }}>Geliş Tarihi</th>
                        <th style={{ width: 140, textAlign: 'right' }}>Karar Ver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myApprovals.map(appr => {
                        return (
                          <tr key={appr.taskId}>
                            <td style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{appr.started_by_name}</td>
                            <td>{appr.started_by_position}</td>
                            <td style={{ fontWeight: 600 }}>{appr.title}</td>
                            <td>{new Date(appr.created_at).toLocaleDateString('tr-TR')}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button className="btn-o" style={{ padding: '3px 8px', fontSize: '.72rem' }} onClick={() => handleOpenInstanceDetail(appr.instanceId)}>
                                  Detay
                                </button>
                                <button className="btn-p" style={{ padding: '3px 8px', fontSize: '.72rem', background: '#10b981', borderColor: '#10b981' }} onClick={() => handleOpenApprovalDialog(appr)}>
                                  Karar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedInstance && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 650, padding: 24, maxHeight: '85vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{selectedInstance.definition_name}</h3>
                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Talep Sahibi: {selectedInstance.started_by_name} ({selectedInstance.started_by_position})</span>
              </div>
              <button className="btn-o" onClick={() => { setDetailModalOpen(false); setSelectedInstance(null) }} style={{ padding: 4 }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            {/* Form Answers View */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--surface-2)', padding: 16, borderRadius: 10, border: '1px solid var(--border)' }}>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '.82rem', fontWeight: 800, textTransform: 'uppercase', color: '#4f46e5' }}>Talep Detayları</h4>
              
              {/* Başlangıç Form alanlarını listele */}
              {(() => {
                const startStep = (selectedInstance.definition?.blueprint?.steps || []).find(s => s.type === 'start')
                // Form template'i bulmak için context kullan
                const templateFields = activeTemplate?.id === startStep?.form_template_id ? getTemplateFields(activeTemplate) : []
                
                // Eğer template yüklü değilse basit JSON key-value gösterimi fallback
                const contextDataKeys = Object.keys(selectedInstance.context_data).filter(k => k !== 'branch_id')
                
                if (contextDataKeys.length === 0) {
                  return <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Bu talep formunda veri bulunmamaktadır.</span>
                }

                return (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {contextDataKeys.map(key => {
                      const val = selectedInstance.context_data[key]
                      const matchingField = templateFields.find(f => f.id === key)
                      const label = matchingField ? matchingField.label : key.replace('f_', '')
                      
                      // URL kontrolü (resim veya dosya ise)
                      const isUrl = typeof val === 'string' && val.startsWith('/api/files/')
                      const isImage = isUrl && (val.endsWith('.jpg') || val.endsWith('.png') || val.endsWith('.jpeg'))
                      
                      return (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, fontSize: '.78rem', borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: 6 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{label}:</span>
                          <span>
                            {isImage ? (
                              <a href={buildApiUrl(val)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', width: 64, height: 64, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                                <img src={buildApiUrl(val)} alt="Resim" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </a>
                            ) : isUrl ? (
                              <a href={buildApiUrl(val)} target="_blank" rel="noopener noreferrer" style={{ color: '#4f46e5', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h4 style={{ margin: 0, fontSize: '.82rem', fontWeight: 800, textTransform: 'uppercase', color: '#4f46e5' }}>Onay Süreç Geçmişi</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingLeft: 12, borderLeft: '2px solid var(--border)', position: 'relative' }}>
                {selectedInstance.history?.map((h, idx) => {
                  let actionText = 'İlerletildi'
                  let badgeColor = '#64748b'
                  if (h.action === 'submit') { actionText = 'Talep Başlatıldı'; badgeColor = '#4f46e5' }
                  if (h.action === 'approve') { actionText = 'Onaylandı'; badgeColor = '#10b981' }
                  if (h.action === 'reject') { actionText = 'Reddedildi'; badgeColor = '#ef4444' }
                  if (h.action === 'return_to_start') { actionText = 'Revizyona Gönderildi'; badgeColor = '#f59e0b' }

                  return (
                    <div key={h.id} style={{ position: 'relative', fontSize: '.78rem' }}>
                      {/* Timeline Node Icon */}
                      <div style={{ position: 'absolute', left: -20, top: 2, width: 14, height: 14, borderRadius: '50%', background: badgeColor, border: '3px solid var(--surface)' }} />
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--text-strong)' }}>
                        <span>{actionText}</span>
                        <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{new Date(h.created_at).toLocaleDateString('tr-TR')} {new Date(h.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--text-main)', marginTop: 2 }}>
                        {h.performed_by_name} ({h.performed_by_position})
                      </div>
                      {h.notes && (
                        <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', marginTop: 4, background: 'var(--surface-3)', padding: '6px 10px', borderRadius: 6 }}>
                          Not: {h.notes}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
              <button className="btn-o" onClick={() => { setDetailModalOpen(false); setSelectedInstance(null) }}>Kapat</button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Deciding Dialog Modal */}
      {approvalModalOpen && approvingInstance && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 450, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Onay Kararı Ver</h3>
              <button className="btn-o" onClick={() => { setApprovalModalOpen(false); setApprovingInstance(null) }} style={{ padding: 4 }}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div style={{ fontSize: '.8rem', color: 'var(--text-main)' }}>
              <strong>Talep Sahibi:</strong> {approvingInstance.started_by_name} ({approvingInstance.started_by_position}) <br />
              <strong>Talep Başlığı:</strong> {approvingInstance.title}
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <label className="f-label">Onay/Ret Açıklaması ve Gerekçesi</label>
              <textarea
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                placeholder="Özellikle talebi reddederken veya geri gönderirken lütfen açıklama yazınız..."
                rows={3}
                className="f-input"
                style={{ padding: '8px 12px', fontSize: '.8rem', borderRadius: 8, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <button className="btn-o" onClick={() => { setApprovalModalOpen(false); setApprovingInstance(null) }} disabled={submitting}>İptal</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-o" onClick={() => handleProcessApproval('reject')} disabled={submitting} style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                  Reddet
                </button>
                <button className="btn-p" onClick={() => handleProcessApproval('approve')} disabled={submitting} style={{ background: '#10b981', borderColor: '#10b981' }}>
                  Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
