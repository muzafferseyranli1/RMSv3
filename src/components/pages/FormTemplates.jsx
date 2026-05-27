import React, { useState, useEffect, useCallback, useRef } from 'react'
import { fetchFormTemplates, createFormTemplate, updateFormTemplate, softDeleteFormTemplate } from '@/lib/formService'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/useToast'

const FIELD_TYPES = [
  { value: 'yes_no', label: 'Evet/Hayır', icon: 'fa-toggle-on' },
  { value: 'checkbox', label: 'Onay Kutusu', icon: 'fa-square-check' },
  { value: 'rating', label: '5 Yıldız Değerlendirme', icon: 'fa-star' },
  { value: 'rating_10', label: '10 Yıldız Değerlendirme', icon: 'fa-star-half-stroke' },
  { value: 'emoji_rating', label: 'Emoji Değerlendirme', icon: 'fa-face-smile' },
  { value: 'slider', label: 'Slider Kaydırıcı', icon: 'fa-sliders' },
  { value: 'nps', label: 'NPS Değerlendirme (0-10)', icon: 'fa-gauge-high' },
  { value: 'number', label: 'Sayı', icon: 'fa-hashtag' },
  { value: 'temperature', label: 'Sıcaklık', icon: 'fa-temperature-half' },
  { value: 'text', label: 'Metin', icon: 'fa-font' },
  { value: 'select', label: 'Seçenekler', icon: 'fa-list' },
  { value: 'photo', label: 'Fotoğraf', icon: 'fa-camera' },
]

const FORM_TYPES = [
  { value: 'inspection', label: 'Denetim Formu' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'customer_survey', label: 'Müşteri Anketi' },
  { value: 'personnel_survey', label: 'Personel Anketi' },
  { value: 'notification_form', label: 'Bildirim Formu' },
]

function generateId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const getSelectFieldMaxPoints = (options, currentMaxPoints) => {
  const hasPointWeights = (options || []).some(opt => typeof opt === 'object' && 'points' in opt)
  if (hasPointWeights) {
    return (options || []).reduce((acc, opt) => acc + (typeof opt === 'object' ? (Number(opt.points) || 0) : 0), 0)
  }
  return Number(currentMaxPoints) || 10
}

const EMPTY_FIELD = () => ({
  id: generateId(),
  label: '',
  type: 'yes_no',
  required: true,
  max_points: 10,
  options: [],
  min_value: null,
  max_value: null,
})

const EMPTY_SECTION = () => ({
  id: generateId(),
  title: 'Yeni Bölüm',
  fields: [EMPTY_FIELD()],
})

export default function FormTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = list view, object = editor
  const [schemaJson, setSchemaJson] = useState({ sections: [] })
  const { user } = useAuth()
  const toast = useToast()

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    const { data, error } = await fetchFormTemplates({ activeOnly: false })
    if (error) toast('Şablonlar yüklenemedi', 'error')
    else setTemplates(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const startNew = () => {
    setEditing({
      title: '',
      description: '',
      form_type: 'inspection',
      require_geo: false,
      min_completion_seconds: null,
      scoring: { pass_threshold: 70 },
      allowed_contexts: ['center', 'branch', 'warehouse'],
    })
    setSchemaJson({ sections: [EMPTY_SECTION()] })
  }

  const startEdit = (template) => {
    setEditing({
      id: template.id,
      title: template.title,
      description: template.description || '',
      form_type: template.form_type,
      require_geo: template.require_geo || false,
      min_completion_seconds: template.min_completion_seconds,
      scoring: template.scoring || { pass_threshold: 70 },
      allowed_contexts: template.allowed_contexts || ['center', 'branch', 'warehouse'],
    })
    
    // Normalize max_points for select fields to be the sum of option points
    const schema = template.schema_json ? JSON.parse(JSON.stringify(template.schema_json)) : { sections: [EMPTY_SECTION()] }
    if (schema.sections) {
      schema.sections = schema.sections.map(sec => ({
        ...sec,
        fields: (sec.fields || []).map(f => {
          if (f.type === 'select') {
            return { ...f, max_points: getSelectFieldMaxPoints(f.options, f.max_points) }
          }
          return f
        })
      }))
    }
    setSchemaJson(schema)
  }

  const handleSave = async () => {
    if (!editing.title.trim()) return toast('Başlık gerekli', 'warning')
    
    // Clean and normalize sections, ensuring max_points of select fields is correct
    const sections = schemaJson.sections
      .filter(s => s.fields.length > 0)
      .map(sec => ({
        ...sec,
        fields: (sec.fields || []).map(f => {
          if (f.type === 'select') {
            return { ...f, max_points: getSelectFieldMaxPoints(f.options, f.max_points) }
          }
          return f
        })
      }))

    if (sections.length === 0) return toast('En az bir bölüm ekleyin', 'warning')

    const payload = {
      title: editing.title,
      description: editing.description,
      formType: editing.form_type,
      schemaJson: { ...schemaJson, sections },
      scoring: editing.scoring,
      requireGeo: editing.require_geo,
      minCompletionSeconds: editing.min_completion_seconds || null,
      createdBy: user?.id,
      allowedContexts: editing.allowed_contexts || ['center', 'branch', 'warehouse'],
    }

    if (editing.id) {
      const { error } = await updateFormTemplate(editing.id, {
        title: payload.title,
        description: payload.description,
        form_type: payload.formType,
        schema_json: payload.schemaJson,
        scoring: payload.scoring,
        require_geo: payload.requireGeo,
        min_completion_seconds: payload.minCompletionSeconds,
        allowed_contexts: payload.allowedContexts,
      })
      if (error) return toast('Güncelleme başarısız', 'error')
      toast('Şablon güncellendi', 'success')
    } else {
      const { error } = await createFormTemplate(payload)
      if (error) return toast('Oluşturma başarısız', 'error')
      toast('Şablon oluşturuldu', 'success')
    }

    setEditing(null)
    loadTemplates()
  }

  const handleDelete = async (templateId) => {
    if (!window.confirm('Şablonu arşivlemek istediğinize emin misiniz?')) return
    await softDeleteFormTemplate(templateId)
    toast('Şablon arşivlendi', 'success')
    loadTemplates()
  }

  // --- Schema Editor Helpers ---
  const updateSection = (sectionIdx, updates) => {
    setSchemaJson(prev => {
      const sections = [...prev.sections]
      sections[sectionIdx] = { ...sections[sectionIdx], ...updates }
      return { ...prev, sections }
    })
  }

  const addSection = () => {
    setSchemaJson(prev => ({ ...prev, sections: [...prev.sections, EMPTY_SECTION()] }))
  }

  const removeSection = (idx) => {
    setSchemaJson(prev => ({ ...prev, sections: prev.sections.filter((_, i) => i !== idx) }))
  }

  const updateField = (sectionIdx, fieldIdx, updates) => {
    setSchemaJson(prev => {
      const sections = [...prev.sections]
      const fields = [...sections[sectionIdx].fields]
      fields[fieldIdx] = { ...fields[fieldIdx], ...updates }
      sections[sectionIdx] = { ...sections[sectionIdx], fields }
      return { ...prev, sections }
    })
  }

  const addField = (sectionIdx) => {
    setSchemaJson(prev => {
      const sections = [...prev.sections]
      sections[sectionIdx] = { ...sections[sectionIdx], fields: [...sections[sectionIdx].fields, EMPTY_FIELD()] }
      return { ...prev, sections }
    })
  }

  const removeField = (sectionIdx, fieldIdx) => {
    setSchemaJson(prev => {
      const sections = [...prev.sections]
      sections[sectionIdx] = { ...sections[sectionIdx], fields: sections[sectionIdx].fields.filter((_, i) => i !== fieldIdx) }
      return { ...prev, sections }
    })
  }

  const moveSection = (idx, direction) => {
    setSchemaJson(prev => {
      const sections = [...prev.sections]
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= sections.length) return prev
      const temp = sections[idx]
      sections[idx] = sections[targetIdx]
      sections[targetIdx] = temp
      return { ...prev, sections }
    })
  }

  const moveField = (sectionIdx, fieldIdx, direction) => {
    setSchemaJson(prev => {
      const sections = [...prev.sections]
      const fields = [...sections[sectionIdx].fields]
      const targetIdx = direction === 'up' ? fieldIdx - 1 : fieldIdx + 1
      if (targetIdx < 0 || targetIdx >= fields.length) return prev
      const temp = fields[fieldIdx]
      fields[fieldIdx] = fields[targetIdx]
      fields[targetIdx] = temp
      sections[sectionIdx] = { ...sections[sectionIdx], fields }
      return { ...prev, sections }
    })
  }

  // ─── LIST VIEW ───
  if (!editing) {
    return (
      <div style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fa-solid fa-clipboard-list" style={{ color: '#8b5cf6', fontSize: '1rem' }} />
              </span>
              Form Şablonları
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '.82rem', color: 'var(--text-muted)' }}>
              Merkezden denetim, anket ve checklist formları tasarlayın. <span style={{ color: '#f59e0b' }}>Sadece merkez yöneticileri oluşturabilir.</span>
            </p>
          </div>
          <button className="btn-p" onClick={startNew} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-plus" /> Yeni Şablon
          </button>
        </div>

        {loading ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
          </div>
        ) : templates.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-clipboard-list" style={{ fontSize: '2rem', marginBottom: 12, display: 'block', opacity: .4 }} />
            <div style={{ fontWeight: 700 }}>Henüz form şablonu yok</div>
            <button className="btn-p" onClick={startNew} style={{ marginTop: 12 }}>İlk Şablonu Oluştur</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {templates.map(t => {
              const fieldCount = (t.schema_json?.sections || []).reduce((acc, s) => acc + (s.fields?.length || 0), 0)
              const isArchived = !!t.deleted_at || !t.active
              return (
                <div key={t.id} className="card" style={{ padding: 18, opacity: isArchived ? .5 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-clipboard-list" style={{ color: '#8b5cf6', fontSize: '.8rem' }} />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--text-strong)' }}>{t.title}</div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                          {FORM_TYPES.find(ft => ft.value === t.form_type)?.label || t.form_type}
                        </div>
                      </div>
                    </div>
                    {isArchived && (
                      <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,.15)', color: '#ef4444', fontWeight: 700 }}>Arşiv</span>
                    )}
                  </div>
                  {t.description && <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>{t.description}</div>}
                  <div style={{ display: 'flex', gap: 12, fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                    <span><i className="fa-solid fa-layer-group" style={{ marginRight: 4 }} />{t.schema_json?.sections?.length || 0} bölüm</span>
                    <span><i className="fa-solid fa-list" style={{ marginRight: 4 }} />{fieldCount} soru</span>
                    {t.require_geo && <span><i className="fa-solid fa-location-dot" style={{ marginRight: 4 }} />GPS</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-o" onClick={() => startEdit(t)} style={{ fontSize: '.75rem', flex: 1 }}>
                      <i className="fa-solid fa-pen" style={{ marginRight: 4 }} /> Düzenle
                    </button>
                    {!isArchived && (
                      <button className="btn-danger" onClick={() => handleDelete(t.id)} style={{ fontSize: '.75rem', padding: '6px 12px' }}>
                        <i className="fa-solid fa-archive" /> Arşivle
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── EDITOR VIEW ───
  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-o" onClick={() => setEditing(null)} style={{ padding: '6px 10px' }}>
            <i className="fa-solid fa-arrow-left" />
          </button>
          <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-strong)' }}>
            {editing.id ? 'Şablon Düzenle' : 'Yeni Şablon'}
          </h1>
        </div>
        <button className="btn-p" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-check" /> Kaydet
        </button>
      </div>

      {/* Meta */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="f-label">Başlık</label>
            <input
              value={editing.title}
              onChange={e => setEditing(p => ({ ...p, title: e.target.value }))}
              placeholder="Örn: Günlük Hijyen Denetimi"
              className="f-input"
            />
          </div>
          <div>
            <label className="f-label">Form Tipi</label>
            <div className="sel-wrap">
              <select
                value={editing.form_type}
                onChange={e => setEditing(p => ({ ...p, form_type: e.target.value }))}
                className="f-input"
              >
                {FORM_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="f-label">Açıklama</label>
            <textarea
              value={editing.description}
              onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="Opsiyonel açıklama..."
              className="f-input"
              style={{ resize: 'vertical' }}
            />
          </div>
          {editing.form_type !== 'checklist' && editing.form_type !== 'customer_survey' && (
          <div>
            <label className="f-label">Geçiş Eşiği (%)</label>
            <input
              type="number"
              value={editing.scoring?.pass_threshold || ''}
              onChange={e => setEditing(p => ({ ...p, scoring: { ...p.scoring, pass_threshold: Number(e.target.value) || 0 } }))}
              placeholder="70"
              className="f-input"
            />
          </div>
          )}
          {editing.form_type !== 'customer_survey' && (
          <div>
            <label className="f-label">Min. Süre (saniye)</label>
            <input
              type="number"
              value={editing.min_completion_seconds || ''}
              onChange={e => setEditing(p => ({ ...p, min_completion_seconds: Number(e.target.value) || null }))}
              placeholder="Opsiyonel"
              className="f-input"
            />
          </div>
          )}
          {editing.form_type !== 'customer_survey' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={editing.require_geo} onChange={e => setEditing(p => ({ ...p, require_geo: e.target.checked }))} id="require-geo" />
            <label htmlFor="require-geo" style={{ fontSize: '.78rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>GPS Zorunlu</label>
          </div>
          )}

          <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
            <label className="f-label" style={{ marginBottom: 8, display: 'block' }}>Kullanım Bağlamı / Alanı</label>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { val: 'center', label: 'Merkez' },
                { val: 'branch', label: 'Şube' },
                { val: 'warehouse', label: 'Merkez Mutfak / Depo' }
              ].map(ctx => {
                const allowedList = editing.allowed_contexts || ['center', 'branch', 'warehouse']
                const isChecked = allowedList.includes(ctx.val)
                return (
                  <label key={ctx.val} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, color: 'var(--text-strong)' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={e => {
                        let newList = [...allowedList]
                        if (e.target.checked) {
                          if (!newList.includes(ctx.val)) newList.push(ctx.val)
                        } else {
                          newList = newList.filter(item => item !== ctx.val)
                        }
                        setEditing(p => ({ ...p, allowed_contexts: newList }))
                      }}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#8b5cf6' }}
                    />
                    <span>{ctx.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sections & Fields */}
      {schemaJson.sections.map((section, sIdx) => (
        <div key={section.id} className="card" style={{ padding: 18, marginBottom: 12, borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(139,92,246,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 800, color: '#8b5cf6' }}>
              {sIdx + 1}
            </span>
            <input
              value={section.title}
              onChange={e => updateSection(sIdx, { title: e.target.value })}
              placeholder="Bölüm başlığı"
              className="f-input"
              style={{ flex: 1, fontWeight: 700 }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className="btn-o"
                onClick={() => moveSection(sIdx, 'up')}
                disabled={sIdx === 0}
                style={{ padding: '6px 10px', opacity: sIdx === 0 ? 0.35 : 1 }}
                title="Bölümü Yukarı Taşı"
              >
                <i className="fa-solid fa-chevron-up" />
              </button>
              <button
                type="button"
                className="btn-o"
                onClick={() => moveSection(sIdx, 'down')}
                disabled={sIdx === schemaJson.sections.length - 1}
                style={{ padding: '6px 10px', opacity: sIdx === schemaJson.sections.length - 1 ? 0.35 : 1 }}
                title="Bölümü Aşağı Taşı"
              >
                <i className="fa-solid fa-chevron-down" />
              </button>
            </div>
            <button className="btn-g" onClick={() => removeSection(sIdx)} style={{ padding: '6px 10px', color: 'var(--danger)' }}>
              <i className="fa-solid fa-trash" />
            </button>
          </div>

          {section.fields.map((field, fIdx) => (
            <div key={field.id} style={{ marginBottom: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 2 }}>
                  <input
                    value={field.label}
                    onChange={e => updateField(sIdx, fIdx, { label: e.target.value })}
                    placeholder="Soru metni"
                    className="f-input"
                  />
                </div>
                <div style={{ width: 140 }}>
                  <div className="sel-wrap">
                    <select
                      value={field.type}
                      onChange={e => {
                        const newType = e.target.value
                        const updates = { type: newType }
                        if (newType === 'select') {
                          updates.max_points = getSelectFieldMaxPoints(field.options, field.max_points)
                        }
                        updateField(sIdx, fIdx, updates)
                      }}
                      className="f-input"
                    >
                      {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                    </select>
                  </div>
                </div>
                {editing.form_type !== 'checklist' && (
                <div style={{ width: 80 }}>
                  <input
                    type="number"
                    value={field.max_points}
                    onChange={e => updateField(sIdx, fIdx, { max_points: Number(e.target.value) || 0 })}
                    disabled={field.type === 'select'}
                    title={field.type === 'select' ? "Seçeneklerin toplam puanıdır" : "Maks. puan"}
                    className="f-input"
                    style={{ textAlign: 'center', background: field.type === 'select' ? 'rgba(0,0,0,0.05)' : undefined }}
                  />
                </div>
                )}
                {editing.form_type !== 'checklist' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: 70, alignSelf: 'center', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={field.is_critical || false}
                    onChange={e => updateField(sIdx, fIdx, { is_critical: e.target.checked })}
                    id={`field-critical-${field.id}`}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor={`field-critical-${field.id}`} style={{ fontSize: '.72rem', color: field.is_critical ? '#ef4444' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>Kritik</label>
                </div>
                )}
                <div style={{ display: 'flex', gap: 4, alignSelf: 'center' }}>
                  <button
                    type="button"
                    className="btn-o"
                    onClick={() => moveField(sIdx, fIdx, 'up')}
                    disabled={fIdx === 0}
                    style={{ padding: '6px 8px', fontSize: '.72rem', opacity: fIdx === 0 ? 0.35 : 1 }}
                    title="Soruyu Yukarı Taşı"
                  >
                    <i className="fa-solid fa-chevron-up" />
                  </button>
                  <button
                    type="button"
                    className="btn-o"
                    onClick={() => moveField(sIdx, fIdx, 'down')}
                    disabled={fIdx === section.fields.length - 1}
                    style={{ padding: '6px 8px', fontSize: '.72rem', opacity: fIdx === section.fields.length - 1 ? 0.35 : 1 }}
                    title="Soruyu Aşağı Taşı"
                  >
                    <i className="fa-solid fa-chevron-down" />
                  </button>
                </div>
                <button
                  className="btn-g"
                  onClick={() => removeField(sIdx, fIdx)}
                  style={{ padding: '8px', color: 'var(--text-muted)', flexShrink: 0 }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>

              {/* Seçenekler Listesi (select tipi için) */}
              {field.type === 'select' && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-list" style={{ marginRight: 6 }} /> Seçenekler Listesi{editing.form_type !== 'checklist' ? ' ve Puan Ağırlıkları' : ''}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {(field.options || []).map((opt, oIdx) => {
                      const label = typeof opt === 'object' ? opt.label : opt
                      const points = typeof opt === 'object' ? (opt.points ?? 0) : 0
                      return (
                        <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', padding: '4px 8px', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <input
                            type="text"
                            value={label}
                            onChange={e => {
                              const newOpts = [...(field.options || [])]
                              newOpts[oIdx] = { label: e.target.value, points }
                              updateField(sIdx, fIdx, { options: newOpts })
                            }}
                            placeholder={`Seçenek ${oIdx + 1}`}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '.75rem', width: 90, color: 'var(--text-strong)' }}
                          />
                          {editing.form_type !== 'checklist' && (
                            <>
                              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>|</span>
                              <input
                                type="number"
                                value={points}
                                onChange={e => {
                                  const newOpts = [...(field.options || [])]
                                  newOpts[oIdx] = { label, points: Number(e.target.value) || 0 }
                                  const sum = getSelectFieldMaxPoints(newOpts, field.max_points)
                                  updateField(sIdx, fIdx, { options: newOpts, max_points: sum })
                                }}
                                placeholder="Puan"
                                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '.75rem', width: 40, color: 'var(--text-strong)', textAlign: 'center' }}
                                title="Bu seçenek seçildiğinde verilecek puan"
                              />
                              <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>puan</span>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const newOpts = (field.options || []).filter((_, oi) => oi !== oIdx)
                              const sum = getSelectFieldMaxPoints(newOpts, field.max_points)
                              updateField(sIdx, fIdx, { options: newOpts, max_points: sum })
                            }}
                            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--danger)', fontSize: '.75rem', marginLeft: 4 }}
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </div>
                      )
                    })}
                    <button
                      type="button"
                      className="btn-o"
                      onClick={() => {
                        const newOpts = [...(field.options || []), { label: '', points: 0 }]
                        const sum = getSelectFieldMaxPoints(newOpts, field.max_points)
                        updateField(sIdx, fIdx, { options: newOpts, max_points: sum })
                      }}
                      style={{ padding: '4px 8px', fontSize: '.7rem', borderRadius: 6 }}
                    >
                      <i className="fa-solid fa-plus" style={{ marginRight: 4 }} /> Seçenek Ekle
                    </button>
                  </div>
                </div>
              )}

              {/* Sıcaklık Sınırları (temperature tipi için) */}
              {field.type === 'temperature' && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-temperature-half" style={{ marginRight: 6 }} /> Sıcaklık Sınırları (°C)
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      value={field.min_value ?? ''}
                      onChange={e => updateField(sIdx, fIdx, { min_value: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="Min °C"
                      className="f-input"
                      style={{ width: 90, padding: '4px 8px', fontSize: '.75rem' }}
                    />
                    <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>-</span>
                    <input
                      type="number"
                      value={field.max_value ?? ''}
                      onChange={e => updateField(sIdx, fIdx, { max_value: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="Max °C"
                      className="f-input"
                      style={{ width: 90, padding: '4px 8px', fontSize: '.75rem' }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          <button className="btn-g" onClick={() => addField(sIdx)} style={{ fontSize: '.75rem', marginTop: 4, width: '100%', justifyContent: 'center', border: '1px dashed var(--border)' }}>
            <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Soru Ekle
          </button>
        </div>
      ))}

      <button className="btn-o" onClick={addSection} style={{ width: '100%', padding: 12, justifyContent: 'center', borderStyle: 'dashed', background: 'var(--surface)' }}>
        <i className="fa-solid fa-layer-group" style={{ marginRight: 6 }} /> Bölüm Ekle
      </button>
    </div>
  )
}
