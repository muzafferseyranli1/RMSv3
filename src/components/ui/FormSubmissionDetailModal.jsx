import React, { useState, useEffect } from 'react'
import { fetchFormSubmissionDetail, fetchFormTemplates } from '@/lib/formService'
import { buildApiUrl } from '@/lib/db'

const FORM_TYPE_MAP = {
  inspection: { label: 'Denetim Formu', icon: 'fa-file-shield' },
  checklist: { label: 'Checklist', icon: 'fa-list-check' },
  customer_survey: { label: 'Müşteri Anketi', icon: 'fa-comments' },
  personnel_survey: { label: 'Personel Anketi', icon: 'fa-users' },
  notification_form: { label: 'Bildirim Formu', icon: 'fa-bell' },
}

const parseDynamicValue = (val) => {
  if (Array.isArray(val)) return val.filter(Boolean)
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed.filter(Boolean)
      return [parsed].filter(Boolean)
    } catch (e) {
      if (val.trim()) {
        return val.split(',').map(s => s.trim()).filter(Boolean).map(s => ({ id: s, name: s }))
      }
      return []
    }
  }
  if (val && typeof val === 'object') return [val]
  return []
}

const getDynamicFieldItems = (val) => {
  const arr = parseDynamicValue(val)
  return arr.map(item => {
    if (typeof item === 'object' && item !== null) {
      return { id: item.id || item.name || '', name: item.name || item.id || '' }
    }
    return { id: String(item), name: String(item) }
  }).filter(item => item.id || item.name)
}

function calculateFieldScore(field, value) {
  if (value === null || value === undefined || value === '') return null
  const maxPoints = Number(field.max_points) || 0
  if (maxPoints <= 0) return 0

  if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
    const val = Number(value) || 0
    const divisor = field.type === 'rating' ? 5 : 10
    return Math.min((val / divisor) * maxPoints, maxPoints)
  }
  if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
    return getDynamicFieldItems(value).length > 0 ? maxPoints : 0
  }
  if (field.type === 'emoji_rating') {
    if (value === 'happy') return maxPoints
    if (value === 'neutral') return maxPoints / 2
    return 0
  }
  if (field.type === 'yes_no' || field.type === 'checkbox') {
    return (value === true || value === 'yes') ? maxPoints : 0
  }
  if (field.type === 'temperature') {
    const temp = Number(value)
    const minVal = Number(field.min_value)
    const maxVal = Number(field.max_value)
    if (!isNaN(temp) && !isNaN(minVal) && !isNaN(maxVal)) {
      return (temp >= minVal && temp <= maxVal) ? maxPoints : 0
    }
    return 0
  }
  if (field.type === 'number') {
    return value != null ? maxPoints : 0
  }
  if (field.type === 'select') {
    const options = Array.isArray(field.options) ? field.options : []
    const opt = options.find(o => String(typeof o === 'object' ? o.label : o) === String(value))
    if (opt && typeof opt === 'object' && 'points' in opt) return Number(opt.points) || 0
    return maxPoints
  }
  return value ? maxPoints : 0
}

export default function FormSubmissionDetailModal({ submissionId, submission: initialSubmission, templates: initialTemplates = [], onClose }) {
  const [submission, setSubmission] = useState(initialSubmission || null)
  const [templates, setTemplates] = useState(initialTemplates || [])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        let currentSub = submission
        if (!currentSub && submissionId) {
          const { data, error } = await fetchFormSubmissionDetail(submissionId)
          if (!error && data) {
            currentSub = data
            setSubmission(data)
          }
        }
        if (templates.length === 0 || !templates.some(t => t.schema_json)) {
          const { data, error } = await fetchFormTemplates({ activeOnly: false })
          if (!error && data) {
            setTemplates(data)
          }
        }
      } catch (err) {
        console.error('Failed to load form submission detail:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [submissionId, initialSubmission, initialTemplates])

  if (loading) {
    return (
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(8,15,35,0.65)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        onClick={onClose}
      >
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '1px solid var(--border)', boxShadow: '0 32px 80px rgba(0,0,0,0.4)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.6rem', color: '#8b5cf6' }} />
          <span style={{ fontSize: '.9rem', fontWeight: 600 }}>Yükleniyor...</span>
        </div>
      </div>
    )
  }

  if (!submission) return null

  const template = templates.find(t => t.id === submission.template_id)
  const hasScoring = template?.form_type === 'inspection'
  const isCritical = hasScoring && !!submission.metadata?.failed_critical
  const scoreNum = Number(submission.score_percentage) || 0
  const isGood = hasScoring && !isCritical && scoreNum >= 70
  const hasAnomaly = hasScoring && (submission.metadata?.anomalies?.length || 0) > 0
  const accentColor = !hasScoring ? '#8b5cf6' : (isCritical ? '#ef4444' : (isGood ? '#10b981' : '#f59e0b'))
  const gradientBg = !hasScoring
    ? 'linear-gradient(135deg, #120c1f 0%, #1e1336 50%, #120c1f 100%)'
    : isCritical
      ? 'linear-gradient(135deg, #1a0808 0%, #2d0f0f 50%, #1e0a0a 100%)'
      : isGood
        ? 'linear-gradient(135deg, #071a12 0%, #0d2e1e 50%, #091a12 100%)'
        : 'linear-gradient(135deg, #1a1208 0%, #2d2010 50%, #1a1208 100%)'

  const getTemplateName = (id) => templates.find(t => t.id === id)?.title || '—'

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(8,15,35,0.65)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: '100%', maxWidth: 920, maxHeight: '94vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 20, overflow: 'hidden',
        background: 'var(--surface)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.08)'
      }}>
        {/* ── HERO HEADER ── */}
        <div style={{ background: gradientBg, padding: '28px 32px 24px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          {/* Decorative orb */}
          <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: accentColor, opacity: 0.07, filter: 'blur(60px)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -30, left: '30%', width: 120, height: 120, borderRadius: '50%', background: '#8b5cf6', opacity: 0.05, filter: 'blur(40px)', pointerEvents: 'none' }} />

          {/* Close button */}
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 18, right: 20, width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', transition: 'all 0.2s' }}
          >
            <i className="fa-solid fa-xmark" />
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            {/* Score Ring / Checklist Icon */}
            {(() => {
              const typeInfo = FORM_TYPE_MAP[template?.form_type] || { label: 'Form', icon: 'fa-file' }
              return !hasScoring ? (
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{
                    width: 88, height: 88, borderRadius: '50%',
                    border: `4px solid #8b5cf6`,
                    boxShadow: `0 0 24px rgba(139,92,246,0.35), inset 0 0 24px rgba(139,92,246,0.11)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `rgba(139,92,246,0.11)`
                  }}>
                    <i className={`fa-solid ${typeInfo.icon}`} style={{ color: '#8b5cf6', fontSize: '2rem' }} />
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                    {typeInfo.label}
                  </div>
                </div>
              ) : (
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{
                    width: 88, height: 88, borderRadius: '50%',
                    border: `4px solid ${accentColor}`,
                    boxShadow: `0 0 24px ${accentColor}55, inset 0 0 24px ${accentColor}11`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: `${accentColor}11`
                  }}>
                    <div style={{ fontSize: '1.7rem', fontWeight: 900, color: accentColor, lineHeight: 1 }}>
                      {submission.score_percentage != null ? Math.round(submission.score_percentage) : '—'}
                    </div>
                    <div style={{ fontSize: '.65rem', color: accentColor, fontWeight: 700, opacity: 0.8 }}>PUAN%</div>
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                    {submission.total_score ?? '—'}/{submission.max_possible_score ?? '—'} p
                  </div>
                </div>
              )
            })()}

            {/* Title area */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.7rem', fontWeight: 700, color: `${accentColor}cc`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {getTemplateName(submission.template_id)}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 10 }}>
                {submission.metadata?.branch_name || submission.metadata?.inspector_name || 'Denetim Detayı'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {/* Status badge */}
                {hasScoring && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700, background: `${accentColor}22`, color: accentColor, border: `1px solid ${accentColor}44` }}>
                    <i className={`fa-solid ${isCritical ? 'fa-circle-xmark' : isGood ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />
                    {isCritical ? 'KABUL EDİLEMEZ' : isGood ? 'BAŞARILI' : 'ANOMALİ'}
                  </span>
                )}
                {/* Date badge */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <i className="fa-regular fa-calendar" />
                  {submission.metadata?.form_date
                    ? new Date(submission.metadata.form_date).toLocaleDateString('tr-TR')
                    : new Date(submission.created_at).toLocaleDateString('tr-TR')}
                </span>
                {/* Time badge */}
                {submission.metadata?.start_time && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <i className="fa-regular fa-clock" />
                    {submission.metadata.start_time} – {submission.metadata.end_time || '?'}
                  </span>
                )}
                {/* Duration */}
                {submission.completion_time_seconds && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <i className="fa-solid fa-stopwatch" />
                    {Math.round(submission.completion_time_seconds / 60)} dk
                  </span>
                )}
                {submission.is_offline_submission && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <i className="fa-solid fa-wifi" style={{ opacity: 0.5 }} /> Offline
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Critical Failure Alert */}
          {hasScoring && isCritical && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
              <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#ef4444', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-circle-xmark" style={{ fontSize: '1rem' }} /> KABUL EDİLEMEZ – KRİTİK SORU BAŞARISIZ
              </div>
              {submission.metadata?.failed_critical_fields?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
                  {submission.metadata.failed_critical_fields.map((f, fi) => (
                    <div key={fi} style={{ fontSize: '.76rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fa-solid fa-xmark" style={{ width: 14, flexShrink: 0 }} /> {f.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Anomaly Alert */}
          {hasScoring && !isCritical && hasAnomaly && (
            <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
              <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#f59e0b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: '1rem' }} /> ANOMALİ TESPİT EDİLDİ
              </div>
              {submission.metadata.anomalies.map((a, i) => (
                <div key={i} style={{ fontSize: '.76rem', color: '#f59e0b', marginTop: 4 }}>• {a.message}</div>
              ))}
            </div>
          )}

          {/* Metadata Grid */}
          {submission.metadata?.inspector_name && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {[
                { icon: 'fa-user-shield', label: 'Denetleyen', value: submission.metadata.inspector_name, color: '#8b5cf6' },
                { icon: 'fa-building', label: 'Şube', value: submission.metadata.branch_name || '—', color: '#22d3ee' },
                { icon: 'fa-user-tie', label: 'Şube Yetkilisi', value: submission.metadata.branch_authorized_name || '—', color: '#10b981', extra: submission.metadata.branch_authorized_name ? (submission.metadata.send_to_authorized ? '✓ Gönderildi' : '✗ Gönderilmedi') : null, extraColor: submission.metadata.send_to_authorized ? '#10b981' : '#ef4444' },
                { icon: 'fa-id-badge', label: 'Vardiya Görevlisi', value: submission.metadata.shift_officer_name || '—', color: '#f59e0b', extra: submission.metadata.shift_officer_name ? (submission.metadata.send_to_shift_officer ? '✓ Gönderildi' : '✗ Gönderilmedi') : null, extraColor: submission.metadata.send_to_shift_officer ? '#10b981' : '#ef4444' },
                { icon: 'fa-user', label: 'Gönderen (ID)', value: submission.submitted_by, color: '#94a3b8' },
              ].map((item, idx) => (
                <div key={idx} style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${item.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className={`fa-solid ${item.icon}`} style={{ color: item.color, fontSize: '.8rem' }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                    {item.extra && (
                      <div style={{ fontSize: '.68rem', fontWeight: 700, color: item.extraColor, marginTop: 2 }}>{item.extra}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Responsibles */}
          {submission.metadata?.branch_responsibles?.length > 0 && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                <i className="fa-solid fa-users" style={{ marginRight: 6 }} /> Şube Sorumluları
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {submission.metadata.branch_responsibles.map((r, ri) => (
                  <div key={ri} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fa-solid fa-user" style={{ color: '#8b5cf6', fontSize: '.7rem' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-strong)' }}>{r.name}</div>
                      <div style={{ fontSize: '.64rem', fontWeight: 700, color: r.send_result ? '#10b981' : '#ef4444' }}>
                        {r.send_result ? '✓ Sonuç Gönderildi' : '✗ Gönderilmedi'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {submission.photos?.length > 0 && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                <i className="fa-solid fa-camera" style={{ marginRight: 6 }} /> Fotoğraflar ({submission.photos.length})
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {submission.photos.map(p => (
                  <a key={p.id} href={buildApiUrl(p.file_url)} target="_blank" rel="noopener noreferrer"
                    style={{ width: 90, height: 90, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--border)', display: 'block', transition: 'transform 0.2s, box-shadow 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.3)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
                  >
                    <img src={buildApiUrl(p.file_url)} alt="Kanıt" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Answers Section */}
          {submission.answers_json && (
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fa-solid fa-list-check" /> Soru & Yanıt Detayları
              </div>
              {template?.schema_json?.sections ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {template.schema_json.sections.map((section, sIdx) => {
                    const sectionAnswers = (Array.isArray(submission.answers_json) ? submission.answers_json : []).filter(ans =>
                      ans.section_id === section.id || section.fields?.some(f => f.id === ans.field_id)
                    )
                    if (sectionAnswers.length === 0) return null

                    let sectionScoredPoints = 0
                    let sectionMaxPoints = 0
                    for (const field of (section.fields || [])) {
                      const fMax = Number(field.max_points) || 0
                      if (fMax > 0) {
                        sectionMaxPoints += fMax
                        const ans = sectionAnswers.find(a => a.field_id === field.id)
                        if (ans) {
                          sectionScoredPoints += calculateFieldScore(field, ans.value) || 0
                        }
                      }
                    }
                    const sectionPercentage = sectionMaxPoints > 0 ? Math.round((sectionScoredPoints / sectionMaxPoints) * 100) : 0

                    return (
                      <div key={section.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                        <div style={{ padding: '10px 16px', background: 'linear-gradient(90deg, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#8b5cf6' }}>
                            <i className="fa-solid fa-layer-group" style={{ marginRight: 6, opacity: 0.7 }} />{sIdx + 1}. {section.title}
                          </span>
                          {hasScoring && sectionMaxPoints > 0 && (
                            <span style={{ fontSize: '.72rem', fontWeight: 800, color: sectionPercentage >= 70 ? '#10b981' : '#ef4444', background: sectionPercentage >= 70 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)', padding: '3px 10px', borderRadius: 99 }}>
                              {sectionScoredPoints}/{sectionMaxPoints} — %{sectionPercentage}
                            </span>
                          )}
                        </div>
                        {/* Section Rows */}
                        <div style={{ background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
                          {(section.fields || []).map((field, fIdx) => {
                            const ans = sectionAnswers.find(a => a.field_id === field.id)
                            if (!ans) return null

                            let displayValue = String(ans.value ?? '—')
                            if (ans.value === true) displayValue = 'Evet'
                            if (ans.value === false) displayValue = 'Hayır'
                            if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
                              const items = getDynamicFieldItems(ans.value)
                              displayValue = items.map(item => item.name).join(', ') || '—'
                            }
                            if (field.type === 'date' && ans.value) {
                              const parts = String(ans.value).split('-')
                              if (parts.length === 3) {
                                displayValue = `${parts[2]}.${parts[1]}.${parts[0]}`
                              }
                            }

                            const isAnsNegative = submission.metadata?.failed_critical_fields?.some(f => f.id === field.id)
                            const score = calculateFieldScore(field, ans.value)
                            const scoreText = score !== null ? `${score}/${field.max_points}p` : null

                            return (
                              <div key={field.id} style={{
                                padding: '10px 16px',
                                borderTop: fIdx > 0 ? '1px solid var(--border)' : undefined,
                                background: isAnsNegative ? 'rgba(239,68,68,0.04)' : 'transparent',
                                display: 'flex', flexDirection: 'column', gap: 4
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {field.is_critical && (
                                      <span style={{ fontSize: '.62rem', fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>KRİTİK</span>
                                    )}
                                    <span style={{ fontSize: '.78rem', color: 'var(--text-strong)', fontWeight: 600 }}>{field.label}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                    {field.type === 'photo' && ans.value ? (
                                      <a href={buildApiUrl(ans.value)} target="_blank" rel="noopener noreferrer"
                                        style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', border: '2px solid var(--border)', display: 'block' }}>
                                        <img src={buildApiUrl(ans.value)} alt="Fotoğraf" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      </a>
                                    ) : field.type === 'rating' && ans.value ? (
                                      <div style={{ display: 'flex', gap: 2, fontSize: '.9rem' }}>
                                        {[1, 2, 3, 4, 5].map(r => (
                                          <i key={r} className="fa-solid fa-star" style={{ color: Number(ans.value) >= r ? '#ffb300' : 'var(--border)' }} />
                                        ))}
                                      </div>
                                    ) : field.type === 'rating_10' && ans.value ? (
                                      <div style={{ display: 'flex', gap: 2, fontSize: '.85rem' }}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                                          <i key={r} className="fa-solid fa-star" style={{ color: Number(ans.value) >= r ? '#ffb300' : 'var(--border)' }} />
                                        ))}
                                      </div>
                                    ) : field.type === 'emoji_rating' && ans.value ? (
                                      (() => {
                                        const emojiMap = {
                                          sad: { icon: 'fa-face-frown', color: '#ef4444', label: 'Memnun Değilim' },
                                          neutral: { icon: 'fa-face-meh', color: '#f59e0b', label: 'Kararsızım' },
                                          happy: { icon: 'fa-face-smile', color: '#10b981', label: 'Memnunum' }
                                        }
                                        const info = emojiMap[ans.value]
                                        if (!info) return <span>{displayValue}</span>
                                        return (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.78rem', fontWeight: 700, color: info.color }}>
                                            <i className={`fa-solid ${info.icon}`} /> {info.label}
                                          </span>
                                        )
                                      })()
                                    ) : field.type === 'slider' && ans.value ? (
                                      <span style={{ fontSize: '.78rem', fontWeight: 800, color: '#8b5cf6', background: 'rgba(139,92,246,0.1)', padding: '2px 8px', borderRadius: 6 }}>
                                        {ans.value} / 10
                                      </span>
                                    ) : field.type === 'nps' && ans.value !== undefined ? (
                                      (() => {
                                        const val = Number(ans.value)
                                        const color = val <= 6 ? '#ef4444' : (val <= 8 ? '#f59e0b' : '#10b981')
                                        return (
                                          <span style={{ fontSize: '.78rem', fontWeight: 800, color, background: `${color}15`, padding: '2px 8px', borderRadius: 6, border: `1px solid ${color}33` }}>
                                            NPS: {val}
                                          </span>
                                        )
                                      })()
                                    ) : (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') ? (
                                      (() => {
                                        const items = getDynamicFieldItems(ans.value)
                                        if (items.length === 0) return <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>—</span>
                                        return (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', maxWidth: 300 }}>
                                            {items.map(item => (
                                              <span key={item.id} style={{
                                                background: 'rgba(139,92,246,0.08)',
                                                color: '#8b5cf6',
                                                border: '1px solid rgba(139,92,246,0.15)',
                                                borderRadius: 6,
                                                padding: '2px 6px',
                                                fontSize: '.72rem',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap'
                                              }}>
                                                {item.name}
                                              </span>
                                            ))}
                                          </div>
                                        )
                                      })()
                                    ) : (
                                      <span style={{
                                        fontSize: '.8rem', fontWeight: 800,
                                        color: isAnsNegative ? '#ef4444' : (ans.value === true ? '#10b981' : ans.value === false ? '#ef4444' : 'var(--text-strong)')
                                      }}>{displayValue}</span>
                                    )}
                                    {hasScoring && scoreText && (
                                      <span style={{ fontSize: '.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: score === 0 ? 'rgba(239,68,68,0.1)' : score < field.max_points ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)', color: score === 0 ? '#ef4444' : score < field.max_points ? '#f59e0b' : '#10b981' }}>
                                        {scoreText}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {ans.note && (
                                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 6, borderLeft: '3px solid #8b5cf6', marginTop: 2, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                    <i className="fa-regular fa-comment-dots" style={{ marginTop: 2, color: '#8b5cf6' }} />
                                    <div style={{ flex: 1 }}>{ans.note}</div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(Array.isArray(submission.answers_json) ? submission.answers_json : []).map((ans, i) => {
                    const field = template?.schema_json?.sections?.flatMap(s => s.fields || [])?.find(f => f.id === ans.field_id)
                    let displayValue = String(ans.value ?? '—')
                    if (ans.value === true) displayValue = 'Evet'
                    if (ans.value === false) displayValue = 'Hayır'
                    if (field && (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select')) {
                      const items = getDynamicFieldItems(ans.value)
                      displayValue = items.map(item => item.name).join(', ') || '—'
                    }
                    if (field && field.type === 'date' && ans.value) {
                      const parts = String(ans.value).split('-')
                      if (parts.length === 3) {
                        displayValue = `${parts[2]}.${parts[1]}.${parts[0]}`
                      }
                    }
                    const isAnsNegative = submission.metadata?.failed_critical_fields?.some(f => f.id === ans.field_id)
                    return (
                      <div key={i} style={{ padding: '10px 14px', borderRadius: 10, background: isAnsNegative ? 'rgba(239,68,68,0.06)' : 'var(--surface-2)', border: '1px solid', borderColor: isAnsNegative ? 'rgba(239,68,68,0.2)' : 'var(--border)', fontSize: '.78rem', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span style={{ color: 'var(--text-strong)', fontWeight: 600 }}>{ans.field_id}</span>
                        <span style={{ color: isAnsNegative ? '#ef4444' : 'var(--text-strong)', fontWeight: 700 }}>{displayValue}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <div style={{ padding: '14px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.8rem', padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  )
}
