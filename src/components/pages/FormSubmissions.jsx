import React, { useState, useEffect, useCallback } from 'react'
import { fetchFormSubmissions, fetchFormSubmissionDetail, fetchFormTemplates, submitFormResponse, fetchTemplatesForBranch } from '@/lib/formService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/useToast'

const STATUS_MAP = {
  draft: { label: 'Taslak', color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  syncing: { label: 'Senkronize Ediliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  completed: { label: 'Tamamlandı', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  anomaly: { label: 'Anomali', color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
}

export default function FormSubmissions() {
  const [submissions, setSubmissions] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSub, setSelectedSub] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState({ templateId: '', status: '' })
  const [showFillForm, setShowFillForm] = useState(false)
  const [fillTemplateId, setFillTemplateId] = useState('')
  const [answers, setAnswers] = useState([])
  const [formStartTime, setFormStartTime] = useState(null)
  const { branchId } = useWorkspace()
  const { user } = useAuth()
  const toast = useToast()

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    const [subResult, tplResult] = await Promise.all([
      fetchFormSubmissions({ branchId, templateId: filter.templateId || undefined, status: filter.status || undefined }),
      fetchFormTemplates({ activeOnly: false }),
    ])
    if (subResult.error) toast('Yanıtlar yüklenemedi', 'error')
    setSubmissions(subResult.data || [])
    setTemplates(tplResult.data || [])
    setLoading(false)
  }, [branchId, filter.templateId, filter.status, toast])

  useEffect(() => { loadSubmissions() }, [loadSubmissions])

  const openDetail = async (subId) => {
    setDetailLoading(true)
    const { data, error } = await fetchFormSubmissionDetail(subId)
    setDetailLoading(false)
    if (error) return toast('Detay yüklenemedi', 'error')
    setSelectedSub(data)
  }

  const getTemplateName = (tplId) => templates.find(t => t.id === tplId)?.title || '—'
  const getTemplate = (tplId) => templates.find(t => t.id === tplId)

  // ─── Fill Form Logic ───
  const startFillForm = (templateId) => {
    setFillTemplateId(templateId)
    const template = getTemplate(templateId)
    if (!template) return toast('Şablon bulunamadı', 'error')

    const initialAnswers = []
    for (const section of (template.schema_json?.sections || [])) {
      for (const field of (section.fields || [])) {
        initialAnswers.push({ field_id: field.id, value: null, section_id: section.id })
      }
    }
    setAnswers(initialAnswers)
    setFormStartTime(Date.now())
    setShowFillForm(true)
  }

  const updateAnswer = (fieldId, value) => {
    setAnswers(prev => prev.map(a => a.field_id === fieldId ? { ...a, value } : a))
  }

  const handleSubmitForm = async () => {
    const template = getTemplate(fillTemplateId)
    if (!template) return

    const completionTimeSeconds = formStartTime ? Math.round((Date.now() - formStartTime) / 1000) : null

    const { data, error } = await submitFormResponse({
      templateId: fillTemplateId,
      branchId,
      submittedBy: user?.id || 'anonymous',
      answersJson: answers,
      completionTimeSeconds,
    })

    if (error) return toast('Gönderme başarısız: ' + (error.message || ''), 'error')

    if (data?.anomalies?.length > 0) {
      toast(`Form gönderildi ama ${data.anomalies.length} anomali tespit edildi!`, 'warning')
    } else {
      toast(`Form gönderildi — Puan: ${data?.scoreResult?.scorePercentage || 0}%`, 'success')
    }

    setShowFillForm(false)
    setFillTemplateId('')
    setAnswers([])
    loadSubmissions()
  }

  // Stats
  const totalCount = submissions.length
  const completedCount = submissions.filter(s => s.status === 'completed').length
  const anomalyCount = submissions.filter(s => s.status === 'anomaly').length
  const avgScore = totalCount > 0
    ? (submissions.reduce((sum, s) => sum + (Number(s.score_percentage) || 0), 0) / totalCount).toFixed(1)
    : '—'

  // ─── Fill Form Modal ───
  if (showFillForm) {
    const template = getTemplate(fillTemplateId)
    if (!template) return null

    return (
      <div style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn-o" onClick={() => setShowFillForm(false)} style={{ padding: '6px 10px' }}>
            <i className="fa-solid fa-arrow-left" />
          </button>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-strong)' }}>{template.title}</h1>
        </div>

        {(template.schema_json?.sections || []).map((section, sIdx) => (
          <div key={section.id} className="card" style={{ padding: 18, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#8b5cf6', marginBottom: 12 }}>
              {sIdx + 1}. {section.title}
            </div>
            {(section.fields || []).map(field => {
              const answer = answers.find(a => a.field_id === field.id)
              return (
                <div key={field.id} style={{ marginBottom: 14 }}>
                  <label className="f-label">
                    {field.label}
                    {field.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
                    {field.max_points > 0 && <span style={{ color: 'var(--text-muted)', fontSize: '.7rem', marginLeft: 8 }}>{field.max_points} puan</span>}
                  </label>

                  {field.type === 'yes_no' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[true, false].map(v => (
                        <button
                          key={String(v)}
                          type="button"
                          className={answer?.value === v ? 'btn-p' : 'btn-o'}
                          onClick={() => updateAnswer(field.id, v)}
                          style={{ flex: 1, padding: '8px 16px', fontSize: '.82rem' }}
                        >
                          {v ? '✓ Evet' : '✗ Hayır'}
                        </button>
                      ))}
                    </div>
                  )}

                  {field.type === 'rating' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 2, 3, 4, 5].map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => updateAnswer(field.id, r)}
                          style={{
                            width: 40, height: 40, borderRadius: 10, border: '2px solid',
                            borderColor: (answer?.value || 0) >= r ? '#f59e0b' : 'var(--border)',
                            background: (answer?.value || 0) >= r ? 'rgba(245,158,11,.2)' : 'var(--surface-2)',
                            color: (answer?.value || 0) >= r ? '#f59e0b' : 'var(--text-muted)',
                            fontWeight: 800, fontSize: '.9rem', cursor: 'pointer',
                          }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}

                  {(field.type === 'number' || field.type === 'temperature') && (
                    <input
                      type="number"
                      value={answer?.value ?? ''}
                      onChange={e => updateAnswer(field.id, e.target.value === '' ? null : Number(e.target.value))}
                      placeholder={field.type === 'temperature' ? '°C' : 'Sayı girin'}
                      className="f-input"
                      style={{ width: 200 }}
                    />
                  )}

                  {field.type === 'text' && (
                    <textarea
                      value={answer?.value || ''}
                      onChange={e => updateAnswer(field.id, e.target.value)}
                      rows={2}
                      placeholder="Yanıtınızı yazın..."
                      className="f-input"
                      style={{ resize: 'vertical' }}
                    />
                  )}

                  {field.type === 'select' && (
                    <div className="sel-wrap">
                      <select
                        value={answer?.value || ''}
                        onChange={e => updateAnswer(field.id, e.target.value)}
                        className="f-input"
                      >
                        <option value="">Seçiniz</option>
                        {(field.options || []).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                      </select>
                    </div>
                  )}

                  {field.type === 'photo' && (
                    <div style={{ padding: 16, border: '2px dashed var(--border)', borderRadius: 8, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.78rem' }}>
                      <i className="fa-solid fa-camera" style={{ marginRight: 6 }} /> Fotoğraf çekme (yakında)
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-o" onClick={() => setShowFillForm(false)}>İptal</button>
          <button className="btn-p" onClick={handleSubmitForm} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-paper-plane" /> Gönder
          </button>
        </div>
      </div>
    )
  }

  // ─── List View ───
  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(34,211,238,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-file-lines" style={{ color: '#22d3ee', fontSize: '1rem' }} />
            </span>
            Form Yanıtları
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>Denetim ve anket form yanıtlarını inceleyin, yeni form doldurun.</p>
        </div>
      </div>

      {/* Quick Fill Buttons */}
      {templates.filter(t => t.active && !t.deleted_at).length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-pen-to-square" style={{ marginRight: 6 }} /> Form Doldur:
          </span>
          {templates.filter(t => t.active && !t.deleted_at).map(t => (
            <button key={t.id} className="btn-o" onClick={() => startFillForm(t.id)} style={{ fontSize: '.75rem' }}>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Toplam', value: totalCount, icon: 'fa-file-lines', color: '#3b82f6' },
          { label: 'Tamamlanan', value: completedCount, icon: 'fa-check-circle', color: '#10b981' },
          { label: 'Anomali', value: anomalyCount, icon: 'fa-exclamation-triangle', color: '#ef4444' },
          { label: 'Ort. Puan', value: avgScore + '%', icon: 'fa-chart-simple', color: '#f59e0b' },
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
        <div className="sel-wrap">
          <select
            value={filter.templateId}
            onChange={e => setFilter(p => ({ ...p, templateId: e.target.value }))}
            className="f-input"
            style={{ width: 'auto', minWidth: 160 }}
          >
            <option value="">Tüm Şablonlar</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>
        <div className="sel-wrap">
          <select
            value={filter.status}
            onChange={e => setFilter(p => ({ ...p, status: e.target.value }))}
            className="f-input"
            style={{ width: 'auto', minWidth: 160 }}
          >
            <option value="">Tüm Durumlar</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Submission List */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
            </div>
          ) : submissions.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-file-lines" style={{ fontSize: '2rem', marginBottom: 12, display: 'block', opacity: .4 }} />
              <div style={{ fontWeight: 700 }}>Henüz yanıt yok</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {submissions.map(sub => {
                const status = STATUS_MAP[sub.status] || STATUS_MAP.draft
                const isSelected = selectedSub?.id === sub.id
                const isAnomaly = sub.status === 'anomaly'
                return (
                  <div
                    key={sub.id}
                    className="card"
                    style={{
                      padding: 14, cursor: 'pointer',
                      borderColor: isSelected ? '#22d3ee' : isAnomaly ? 'rgba(239,68,68,.3)' : undefined,
                      background: isSelected ? 'rgba(34,211,238,.06)' : isAnomaly ? 'rgba(239,68,68,.03)' : undefined,
                    }}
                    onClick={() => openDetail(sub.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Score Circle */}
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, border: '2px solid',
                        borderColor: (Number(sub.score_percentage) || 0) >= 70 ? '#10b981' : '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, flexDirection: 'column',
                      }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 900, color: (Number(sub.score_percentage) || 0) >= 70 ? '#10b981' : '#ef4444' }}>
                          {sub.score_percentage != null ? Math.round(sub.score_percentage) : '—'}
                        </div>
                        <div style={{ fontSize: '.5rem', color: 'var(--text-muted)' }}>%</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-strong)' }}>{getTemplateName(sub.template_id)}</span>
                          <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: status.bg, color: status.color }}>
                            {status.label}
                          </span>
                          {sub.is_offline_submission && (
                            <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontWeight: 700 }}>
                              Offline
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                          {new Date(sub.created_at).toLocaleDateString('tr-TR')} {new Date(sub.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                          {sub.completion_time_seconds && ` • ${Math.round(sub.completion_time_seconds / 60)} dk`}
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
        {selectedSub && (
          <div className="card" style={{ width: 380, padding: 20, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 24 }}>
            {detailLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-spinner fa-spin" /> Yükleniyor...
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-strong)' }}>
                    {getTemplateName(selectedSub.template_id)}
                  </div>
                  <button className="btn-g" onClick={() => setSelectedSub(null)} style={{ padding: '4px 8px' }}>
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>

                {/* Score */}
                <div style={{ textAlign: 'center', padding: 16, borderRadius: 12, background: 'var(--surface-2)', marginBottom: 16 }}>
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: (Number(selectedSub.score_percentage) || 0) >= 70 ? '#10b981' : '#ef4444' }}>
                    {selectedSub.score_percentage != null ? Math.round(selectedSub.score_percentage) + '%' : '—'}
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                    {selectedSub.total_score}/{selectedSub.max_possible_score} puan
                  </div>
                </div>

                {/* Anomalies */}
                {selectedSub.metadata?.anomalies?.length > 0 && (
                  <div style={{ padding: 10, borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--border)', marginBottom: 12 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--danger)', marginBottom: 4 }}>
                      <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} /> Anomaliler
                    </div>
                    {selectedSub.metadata.anomalies.map((a, i) => (
                      <div key={i} style={{ fontSize: '.75rem', color: 'var(--danger)', marginBottom: 2 }}>{a.message}</div>
                    ))}
                  </div>
                )}

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.78rem', color: 'var(--text-muted)' }}>
                  <div><strong style={{ color: 'var(--text-strong)' }}>Gönderen:</strong> {selectedSub.submitted_by}</div>
                  <div><strong style={{ color: 'var(--text-strong)' }}>Tarih:</strong> {new Date(selectedSub.created_at).toLocaleString('tr-TR')}</div>
                  {selectedSub.completion_time_seconds && (
                    <div><strong style={{ color: 'var(--text-strong)' }}>Süre:</strong> {Math.round(selectedSub.completion_time_seconds / 60)} dakika</div>
                  )}
                  {selectedSub.is_offline_submission && (
                    <div><strong style={{ color: 'var(--text-strong)' }}>Offline:</strong> Evet {selectedSub.synced_at && `(Senkronize: ${new Date(selectedSub.synced_at).toLocaleString('tr-TR')})`}</div>
                  )}
                </div>

                {/* Answers */}
                {selectedSub.answers_json && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>Yanıtlar</div>
                    <div style={{ maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {(Array.isArray(selectedSub.answers_json) ? selectedSub.answers_json : []).map((ans, i) => (
                        <div key={i} style={{ padding: 6, borderRadius: 6, background: 'var(--surface-2)', fontSize: '.75rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{ans.field_id}:</span> <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{String(ans.value ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Photos */}
                {selectedSub.photos?.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-strong)', marginBottom: 8 }}>Fotoğraflar ({selectedSub.photos.length})</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {selectedSub.photos.map(p => (
                        <a key={p.id} href={p.file_url} target="_blank" rel="noopener noreferrer" style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <i className="fa-solid fa-image" style={{ color: 'var(--text-muted)' }} />
                        </a>
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
