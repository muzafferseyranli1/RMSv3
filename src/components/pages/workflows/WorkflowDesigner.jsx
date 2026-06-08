import React, { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import { fetchFormTemplates } from '@/lib/formService'
import { loadWorkflowPersonnelContext } from '@/lib/workflowService'

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

const WORKFLOW_TYPES = [
  { value: 'leave', label: 'İzin Talebi Akışı' },
  { value: 'advance', label: 'Avans Talebi Akışı' },
  { value: 'expense', label: 'Masraf Talebi Akışı' },
  { value: 'purchase', label: 'Satın Alma Talebi Akışı' },
  { value: 'custom', label: 'Özel Talep Akışı' },
]

export default function WorkflowDesigner({ onBack, editingId = null }) {
  const toast = useToast()
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formTemplates, setFormTemplates] = useState([])
  const [positions, setPositions] = useState([])
  const [personnel, setPersonnel] = useState([])
  
  // Akış Tanım State'leri
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [workflowType, setWorkflowType] = useState('leave')
  const [selectedFormTemplateId, setSelectedFormTemplateId] = useState('')
  const [steps, setSteps] = useState([])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [templatesRes, context] = await Promise.all([
          fetchFormTemplates({ activeOnly: true }),
          loadWorkflowPersonnelContext()
        ])
        
        // Sadece 'request' tipindeki form şablonlarını listele
        const reqTemplates = (templatesRes.data || []).filter(t => t.form_type === 'request')
        setFormTemplates(reqTemplates)
        setPositions(context.positions || [])
        setPersonnel(context.employees || [])

        // Eğer düzenleme modundaysak mevcut veriyi çek
        if (editingId) {
          const { data: def, error } = await db.from('workflow_definitions').select('*').eq('id', editingId).maybeSingle()
          if (!error && def) {
            setName(def.name || '')
            setDescription(def.description || '')
            setWorkflowType(def.workflow_type || 'leave')
            
            const blueprint = def.blueprint || { steps: [] }
            const startStep = blueprint.steps.find(s => s.type === 'start')
            if (startStep) {
              setSelectedFormTemplateId(startStep.form_template_id || '')
            }
            
            // Start dışındaki diğer adımları yükle
            const otherSteps = blueprint.steps.filter(s => s.type !== 'start')
            setSteps(otherSteps)
          }
        } else {
          // Yeni ekleme modunda varsayılan 1 adım ekle
          setSteps([
            {
              id: `step_${Date.now()}_1`,
              type: 'approval',
              name: 'İlk Yönetici Onayı',
              assignee_type: 'position',
              assignee_id: '',
              if_rejected: 'reject',
              condition: { field: '', operator: 'gte', value: '' }
            }
          ])
        }
      } catch (err) {
        console.error(err)
        toast('Gerekli veriler yüklenemedi', 'error')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [editingId, toast])

  const handleAddStep = () => {
    setSteps(prev => [
      ...prev,
      {
        id: `step_${Date.now()}_${prev.length + 1}`,
        type: 'approval',
        name: `Onay Adımı ${prev.length + 1}`,
        assignee_type: 'position',
        assignee_id: '',
        if_rejected: 'reject',
        condition: { field: '', operator: 'gte', value: '' }
      }
    ])
  }

  const handleRemoveStep = (index) => {
    setSteps(prev => prev.filter((_, idx) => idx !== index))
  }

  const handleUpdateStep = (index, field, value) => {
    setSteps(prev => prev.map((s, idx) => {
      if (idx === index) {
        return { ...s, [field]: value }
      }
      return s
    }))
  }

  const handleUpdateStepCondition = (index, condField, value) => {
    setSteps(prev => prev.map((s, idx) => {
      if (idx === index) {
        const nextCond = { ...(s.condition || { field: '', operator: 'gte', value: '' }), [condField]: value }
        return { ...s, condition: nextCond }
      }
      return s
    }))
  }

  const handleMoveStep = (index, direction) => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === steps.length - 1) return

    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const nextSteps = [...steps]
    const temp = nextSteps[index]
    nextSteps[index] = nextSteps[targetIndex]
    nextSteps[targetIndex] = temp
    setSteps(nextSteps)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast('Lütfen iş akışı ismi giriniz', 'warning')
      return
    }
    if (!selectedFormTemplateId) {
      toast('Lütfen başlangıç talep formu şablonunu seçiniz', 'warning')
      return
    }
    if (steps.length === 0) {
      toast('En az bir akış adımı eklemeniz gerekmektedir', 'warning')
      return
    }
    if (steps.some(s => s.type === 'approval' && !s.assignee_id)) {
      toast('Lütfen tüm onay adımları için onaylayacak kişi/pozisyonu seçiniz', 'warning')
      return
    }

    setSaving(true)

    // Blueprint JSON oluştur (Start + Diğer adımlar + End)
    const blueprintSteps = [
      {
        id: 'start_node',
        type: 'start',
        name: 'Talep Başlangıcı',
        form_template_id: selectedFormTemplateId
      },
      ...steps,
      {
        id: 'end_node',
        type: 'end',
        name: 'Süreç Tamamlandı'
      }
    ]

    const blueprint = { steps: blueprintSteps }

    try {
      let result
      if (editingId) {
        result = await db.from('workflow_definitions').update({
          name,
          description,
          workflow_type: workflowType,
          blueprint,
          updated_at: new Date().toISOString()
        }).eq('id', editingId)
      } else {
        result = await db.from('workflow_definitions').insert({
          name,
          description,
          workflow_type: workflowType,
          blueprint,
          version: 1,
          status: 'published'
        })
      }

      if (result.error) throw result.error
      
      toast('İş akışı başarıyla kaydedildi', 'success')
      onBack()
    } catch (err) {
      console.error(err)
      toast('Kaydetme işlemi başarısız: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 12, color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: '#4f46e5' }} />
        <span style={{ fontSize: '.85rem' }}>İş akışı detayları yükleniyor...</span>
      </div>
    )
  }

  // Seçilen form şablonunun alanlarını bul (koşul tanımlarken kullanmak için)
  const activeTemplate = formTemplates.find(t => t.id === selectedFormTemplateId)
  const conditionFields = []
  const templateFields = getTemplateFields(activeTemplate)
  if (templateFields.length > 0) {
    templateFields.forEach(field => {
      // Sadece sayısal veya finansal alanları koşul olarak seçmeye izin verelim
      if (['number', 'financial_input'].includes(field.type)) {
        conditionFields.push({ value: field.id, label: field.label })
      }
    })
  }

  return (
    <div style={{ maxWidth: 850, margin: '0 auto', paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-o" onClick={onBack} style={{ padding: '8px 12px', borderRadius: 8 }}>
          <i className="fa-solid fa-chevron-left" /> Geri
        </button>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>
            {editingId ? 'İş Akışını Düzenle' : 'Yeni İş Akışı Tasarla'}
          </h2>
          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Taleplerin şube müdürlerinden genel merkeze onay rotasını ve kurallarını belirleyin.
          </p>
        </div>
      </div>

      {/* Main Form */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: '0 0 4px 0', color: '#4f46e5', textTransform: 'uppercase' }}>1. Akış Genel Bilgileri</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="f-label">Akış Adı *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Örn: Yıllık İzin Onay Süreci, Kırtasiye Alım Talebi"
              className="f-input"
              style={{ padding: '10px 14px', borderRadius: 8, fontSize: '.85rem' }}
            />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <label className="f-label">Talep Türü *</label>
            <select
              value={workflowType}
              onChange={e => setWorkflowType(e.target.value)}
              className="f-input"
              style={{ padding: '10px 14px', borderRadius: 8, fontSize: '.85rem' }}
            >
              {WORKFLOW_TYPES.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="f-label">Akış Açıklaması</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Bu iş akışının kapsamını ve kurallarını açıklayın..."
            rows={2}
            className="f-input"
            style={{ padding: '10px 14px', borderRadius: 8, fontSize: '.85rem', resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label className="f-label">Başlangıç Talep Formu *</label>
          <select
            value={selectedFormTemplateId}
            onChange={e => setSelectedFormTemplateId(e.target.value)}
            className="f-input"
            style={{ padding: '10px 14px', borderRadius: 8, fontSize: '.85rem' }}
          >
            <option value="">-- Talep Formu Şablonu Seçiniz --</option>
            {formTemplates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
            Süreç, personelin bu formu doldurup göndermesiyle otomatik olarak başlayacaktır. (Sadece 'Talep Formu' tipindeki şablonlar listelenir)
          </span>
        </div>
      </div>

      {/* Steps List */}
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '.95rem', fontWeight: 800, margin: 0, color: '#4f46e5', textTransform: 'uppercase' }}>2. Onaycı Adımları</h3>
          <button className="btn-p" onClick={handleAddStep} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', padding: '6px 12px' }}>
            <i className="fa-solid fa-plus" /> Adım Ekle
          </button>
        </div>

        {steps.length === 0 ? (
          <div style={{ padding: 40, border: '2px dashed var(--border)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: '.85rem' }}>
            Henüz onay adımı eklenmedi. Akışın ilerleyebilmesi için en az bir onay adımı eklemelisiniz.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {steps.map((step, idx) => {
              return (
                <div key={step.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface-2)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
                  
                  {/* Step Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: '#4f46e5', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 800 }}>
                        {idx + 1}
                      </span>
                      <input
                        value={step.name}
                        onChange={e => handleUpdateStep(idx, 'name', e.target.value)}
                        placeholder="Adım İsmi"
                        className="f-input"
                        style={{ border: 'none', background: 'transparent', outline: 'none', padding: 0, fontWeight: 700, fontSize: '.85rem', color: 'var(--text-strong)', width: 200 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-o" onClick={() => handleMoveStep(idx, 'up')} disabled={idx === 0} style={{ padding: '2px 8px', fontSize: '.7rem' }}>
                        <i className="fa-solid fa-arrow-up" />
                      </button>
                      <button className="btn-o" onClick={() => handleMoveStep(idx, 'down')} disabled={idx === steps.length - 1} style={{ padding: '2px 8px', fontSize: '.7rem' }}>
                        <i className="fa-solid fa-arrow-down" />
                      </button>
                      <button className="btn-o" onClick={() => handleRemoveStep(idx)} style={{ padding: '2px 8px', fontSize: '.7rem', borderColor: '#ef4444', color: '#ef4444' }}>
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </div>
                  </div>

                  {/* Step Body */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr 1fr', gap: 12 }}>
                    
                    {/* Assignee Type */}
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label className="f-label" style={{ fontSize: '.75rem' }}>Atama Türü</label>
                      <select
                        value={step.assignee_type}
                        onChange={e => {
                          handleUpdateStep(idx, 'assignee_type', e.target.value)
                          handleUpdateStep(idx, 'assignee_id', '')
                        }}
                        className="f-input"
                        style={{ padding: '6px 10px', fontSize: '.8rem' }}
                      >
                        <option value="position">Pozisyon (Hiyerarşi)</option>
                        <option value="personnel">Spesifik Personel</option>
                        <option value="dynamic_manager">Yönetici (Dinamik)</option>
                      </select>
                    </div>

                    {/* Assignee Value */}
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label className="f-label" style={{ fontSize: '.75rem' }}>Kim Onaylayacak?</label>
                      {step.assignee_type === 'position' ? (
                        <select
                          value={step.assignee_id}
                          onChange={e => handleUpdateStep(idx, 'assignee_id', e.target.value)}
                          className="f-input"
                          style={{ padding: '6px 10px', fontSize: '.8rem' }}
                        >
                          <option value="">-- Pozisyon Seçin --</option>
                          {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : step.assignee_type === 'personnel' ? (
                        <select
                          value={step.assignee_id}
                          onChange={e => handleUpdateStep(idx, 'assignee_id', e.target.value)}
                          className="f-input"
                          style={{ padding: '6px 10px', fontSize: '.8rem' }}
                        >
                          <option value="">-- Personel Seçin --</option>
                          {personnel
                            .filter(e => !e.deletedAt && !e.terminationDate)
                            .map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                        </select>
                      ) : (
                        <div style={{ padding: '8px 12px', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '.75rem', color: 'var(--text-muted)' }}>
                          Talep sahibinin doğrudan hiyerarşik yöneticisi otomatik hesaplanır.
                        </div>
                      )}
                    </div>

                    {/* Action on Reject */}
                    <div style={{ display: 'grid', gap: 4 }}>
                      <label className="f-label" style={{ fontSize: '.75rem' }}>Reddedilirse</label>
                      <select
                        value={step.if_rejected}
                        onChange={e => handleUpdateStep(idx, 'if_rejected', e.target.value)}
                        className="f-input"
                        style={{ padding: '6px 10px', fontSize: '.8rem' }}
                      >
                        <option value="reject">Talebi İptal Et (Reddet)</option>
                        <option value="return_to_start">Düzeltme İçin Geri Gönder</option>
                      </select>
                    </div>

                  </div>

                  {/* Conditions Field (Limit Condition) */}
                  <div style={{ padding: '8px 12px', background: 'var(--surface-3)', borderRadius: 8, border: '1px solid var(--border)', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.75rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      <i className="fa-solid fa-filter" style={{ color: '#4f46e5' }} />
                      <span>Adım Limiti / Koşul Tanımla (İsteğe Bağlı)</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Eğer</span>
                      
                      <select
                        value={step.condition?.field || ''}
                        onChange={e => handleUpdateStepCondition(idx, 'field', e.target.value)}
                        className="f-input"
                        style={{ padding: '4px 8px', fontSize: '.74rem', width: 160 }}
                      >
                        <option value="">Her Zaman Çalıştır</option>
                        {conditionFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>

                      {step.condition?.field && (
                        <>
                          <select
                            value={step.condition?.operator || 'gte'}
                            onChange={e => handleUpdateStepCondition(idx, 'operator', e.target.value)}
                            className="f-input"
                            style={{ padding: '4px 8px', fontSize: '.74rem', width: 100 }}
                          >
                            <option value="gte">büyük eşit (&gt;=)</option>
                            <option value="gt">büyük (&gt;)</option>
                            <option value="lte">küçük eşit (&lt;=)</option>
                            <option value="lt">küçük (&lt;)</option>
                            <option value="eq">eşit (=)</option>
                          </select>

                          <input
                            type="number"
                            value={step.condition?.value || ''}
                            onChange={e => handleUpdateStepCondition(idx, 'value', e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="Değer"
                            className="f-input"
                            style={{ padding: '4px 8px', fontSize: '.74rem', width: 80 }}
                          />

                          <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>ise bu adımı çalıştır, değilse bu adımı atla.</span>
                        </>
                      )}
                    </div>
                  </div>

                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
        <button className="btn-o" onClick={onBack} disabled={saving} style={{ padding: '10px 20px', borderRadius: 8 }}>
          İptal
        </button>
        <button className="btn-p" onClick={handleSave} disabled={saving} style={{ padding: '10px 24px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Kaydediliyor...
            </>
          ) : (
            <>
              <i className="fa-solid fa-floppy-disk" /> İş Akışını Kaydet
            </>
          )}
        </button>
      </div>

    </div>
  )
}
