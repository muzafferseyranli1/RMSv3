import React, { useState, useEffect, useCallback, useRef } from 'react'
import { fetchFormTemplates, createFormTemplate, updateFormTemplate, softDeleteFormTemplate } from '@/lib/formService'
import { readSettingArray, PERSONNEL_SETTINGS_KEYS } from '@/lib/personnelConfig'
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
  { value: 'stock_item_select', label: 'Stok Malı Seçimi', icon: 'fa-box' },
  { value: 'sale_item_select', label: 'Satış Malı Seçimi', icon: 'fa-cart-shopping' },
  { value: 'semi_product_select', label: 'Yarı Mamul Seçimi', icon: 'fa-cubes' },
  { value: 'branch_select', label: 'Şube Seçimi', icon: 'fa-store' },
  { value: 'date', label: 'Tarih Seçimi', icon: 'fa-calendar' },
  { value: 'financial_input', label: 'Finansal Girdi', icon: 'fa-money-bill-wave' },
  { value: 'equipment_select', label: 'Ekipman Seçimi', icon: 'fa-screwdriver-wrench' },
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

const TargetSelector = ({ title, description, value, onChange, positions, personnelList, hidePositions = false }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!dropdownOpen) {
      setSearch('')
    }
  }, [dropdownOpen])

  const safePositions = hidePositions ? [] : (value?.positions || [])
  const safePersonnel = value?.personnel || []

  const handleTogglePosition = (id) => {
    if (hidePositions) return
    const list = [...safePositions]
    const idx = list.indexOf(id)
    if (idx > -1) list.splice(idx, 1)
    else list.push(id)
    onChange({ ...value, positions: list })
  }

  const handleTogglePersonnel = (id) => {
    const list = [...safePersonnel]
    const idx = list.indexOf(id)
    if (idx > -1) list.splice(idx, 1)
    else list.push(id)
    onChange({ ...value, personnel: list })
  }

  const filteredPos = hidePositions ? [] : positions.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()))
  const filteredEmp = personnelList
    .filter(e => e.authorityLevel === 'Genel Merkez' && !e.deletedAt && !e.terminationDate)
    .filter(e => `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label className="f-label">{title}</label>
      {description && <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '0 0 4px 0', lineHeight: 1.3 }}>{description}</p>}
      
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <div 
          onClick={() => setDropdownOpen(prev => !prev)}
          style={{ 
            minHeight: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px',
            display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', background: 'var(--surface)',
            cursor: 'pointer', position: 'relative', paddingRight: '30px', transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
        >
          {safePositions.length === 0 && safePersonnel.length === 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{hidePositions ? "Kişi seçin..." : "Pozisyon veya kişi seçin..."}</span>
          )}
          {!hidePositions && safePositions.map(posId => {
            const pos = positions.find(p => p.id === posId)
            if (!pos) return null
            return (
              <span key={`pos-${posId}`} style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 12, fontSize: '.74rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="fa-solid fa-briefcase" style={{ fontSize: '.65rem' }} />
                {pos.name}
                <i className="fa-solid fa-xmark" style={{ cursor: 'pointer', opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); handleTogglePosition(posId) }} />
              </span>
            )
          })}
          {safePersonnel.map(empId => {
            const emp = personnelList.find(e => e.id === empId)
            if (!emp) return null
            return (
              <span key={`emp-${empId}`} style={{ background: '#ecfdf5', color: '#065f46', padding: '2px 8px', borderRadius: 12, fontSize: '.74rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="fa-solid fa-user" style={{ fontSize: '.65rem' }} />
                {emp.firstName} {emp.lastName}
                <i className="fa-solid fa-xmark" style={{ cursor: 'pointer', opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); handleTogglePersonnel(empId) }} />
              </span>
            )
          })}
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.75rem', pointerEvents: 'none' }}>
            <i className={`fa-solid fa-chevron-${dropdownOpen ? 'up' : 'down'}`} />
          </div>
        </div>

        {dropdownOpen && (
          <div style={{ 
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, 
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, 
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', 
            zIndex: 1000, display: 'flex', flexDirection: 'column', maxHeight: 250
          }}>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(0,0,0,0.015)' }}>
              <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--text-muted)', fontSize: '.75rem' }} />
              <input 
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={hidePositions ? "Merkez çalışanı ara..." : "Pozisyon veya merkez çalışanı ara..."} 
                style={{ 
                  border: 'none', outline: 'none', background: 'transparent', flex: 1, 
                  fontSize: '.82rem', color: 'var(--text-strong)', padding: '2px 0'
                }} 
                autoFocus 
              />
              {search && (
                <i 
                  className="fa-solid fa-circle-xmark" 
                  style={{ color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.85rem', opacity: 0.7 }} 
                  onClick={() => setSearch('')} 
                />
              )}
            </div>
            
            <div style={{ overflowY: 'auto', padding: 6, flex: 1 }}>
              {!hidePositions && filteredPos.length > 0 && <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', padding: '4px 6px 2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Pozisyonlar</div>}
              {!hidePositions && filteredPos.map(pos => {
                const isSelected = safePositions.includes(pos.id)
                return (
                  <div 
                    key={pos.id} 
                    onClick={() => handleTogglePosition(pos.id)}
                    style={{ padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: isSelected ? 'rgba(99,102,241,0.05)' : 'transparent', transition: 'background 0.15s', fontSize: '.78rem' }}
                  >
                    <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none', accentColor: '#8b5cf6' }} />
                    <span style={{ color: isSelected ? 'var(--text-strong)' : 'var(--text-main)', fontWeight: isSelected ? 600 : 400 }}>{pos.name}</span>
                  </div>
                )
              })}
              
              {filteredEmp.length > 0 && <div style={{ fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', padding: '4px 6px 2px', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.05em', borderTop: hidePositions ? 'none' : '1px solid var(--border)' }}>Personeller (Merkez)</div>}
              {filteredEmp.map(emp => {
                const isSelected = safePersonnel.includes(emp.id)
                return (
                  <div 
                    key={emp.id} 
                    onClick={() => handleTogglePersonnel(emp.id)}
                    style={{ padding: '6px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: isSelected ? 'rgba(16,185,129,0.05)' : 'transparent', transition: 'background 0.15s', fontSize: '.78rem' }}
                  >
                    <input type="checkbox" checked={isSelected} readOnly style={{ pointerEvents: 'none', accentColor: '#8b5cf6' }} />
                    <span style={{ color: isSelected ? 'var(--text-strong)' : 'var(--text-main)', fontWeight: isSelected ? 600 : 400 }}>{emp.firstName} {emp.lastName}</span>
                  </div>
                )
              })}

              {hidePositions ? (
                filteredEmp.length === 0 && <div style={{ padding: 12, textAlign: 'center', fontSize: '.78rem', color: 'var(--text-muted)' }}>Sonuç bulunamadı</div>
              ) : (
                filteredPos.length === 0 && filteredEmp.length === 0 && <div style={{ padding: 12, textAlign: 'center', fontSize: '.78rem', color: 'var(--text-muted)' }}>Sonuç bulunamadı</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FormTemplates() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null = list view, object = editor
  const [schemaJson, setSchemaJson] = useState({ sections: [], task_config: { targets: [], rules: {} } })
  const [personnelList, setPersonnelList] = useState([])
  const [positions, setPositions] = useState([])
  const [targetSearch, setTargetSearch] = useState('')
  const [targetDropdownOpen, setTargetDropdownOpen] = useState(false)
  const targetDropdownRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (targetDropdownRef.current && !targetDropdownRef.current.contains(e.target)) {
        setTargetDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  const { user } = useAuth()
  const toast = useToast()

  const loadPersonnelData = useCallback(async () => {
    try {
      const [empData, posData] = await Promise.all([
        readSettingArray(PERSONNEL_SETTINGS_KEYS.employees),
        readSettingArray(PERSONNEL_SETTINGS_KEYS.positions)
      ])
      setPersonnelList(empData || [])
      setPositions(posData || [])
    } catch (err) {
      console.error('Personnel load error', err)
    }
  }, [])

  useEffect(() => { loadPersonnelData() }, [loadPersonnelData])

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
      requires_cost_input: false,
      linked_entity_table: null,
    })
    setSchemaJson({ 
      sections: [EMPTY_SECTION()], 
      task_config: { 
        enabled: false,
        assignee: { positions: [], personnel: [] },
        collaborators: { positions: [], personnel: [] },
        watchers: { positions: [], personnel: [], responsibles: false },
        completion_hours: 72,
        priority: 'normal',
        rules: {} 
      } 
    })
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
      requires_cost_input: template.requires_cost_input || false,
      linked_entity_table: template.linked_entity_table || null,
    })
    
    // Normalize max_points for select fields to be the sum of option points
    const schema = template.schema_json ? JSON.parse(JSON.stringify(template.schema_json)) : { sections: [EMPTY_SECTION()] }
    if (!schema.task_config) {
      schema.task_config = { 
        enabled: false,
        assignee: { positions: [], personnel: [] },
        collaborators: { positions: [], personnel: [] },
        watchers: { positions: [], personnel: [], responsibles: false },
        completion_hours: 72,
        priority: 'normal',
        rules: {} 
      }
    } else {
      // Normalize legacy target and properties structures to structured structures
      if (schema.task_config.enabled === undefined) {
        schema.task_config.enabled = false
      }
      if (!schema.task_config.assignee) {
        schema.task_config.assignee = { positions: [], personnel: [] }
      } else {
        if (!schema.task_config.assignee.positions) schema.task_config.assignee.positions = []
        if (!schema.task_config.assignee.personnel) schema.task_config.assignee.personnel = []
      }
      if (!schema.task_config.collaborators) {
        schema.task_config.collaborators = { positions: [], personnel: [] }
      } else {
        if (!schema.task_config.collaborators.positions) schema.task_config.collaborators.positions = []
        if (!schema.task_config.collaborators.personnel) schema.task_config.collaborators.personnel = []
      }
      if (!schema.task_config.watchers) {
        schema.task_config.watchers = { positions: [], personnel: [], responsibles: false }
      } else {
        if (!schema.task_config.watchers.positions) schema.task_config.watchers.positions = []
        if (!schema.task_config.watchers.personnel) schema.task_config.watchers.personnel = []
        if (schema.task_config.watchers.responsibles === undefined) schema.task_config.watchers.responsibles = false
      }
      if (schema.task_config.completion_hours === undefined) {
        schema.task_config.completion_hours = 72
      }
      if (schema.task_config.priority === undefined) {
        schema.task_config.priority = 'normal'
      }
      if (!schema.task_config.rules) {
        schema.task_config.rules = {}
      }
    }
    
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
      requiresCostInput: editing.requires_cost_input || false,
      linkedEntityTable: editing.linked_entity_table || null,
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
        requires_cost_input: payload.requiresCostInput,
        linked_entity_table: payload.linkedEntityTable,
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
          {editing.form_type === 'inspection' && (
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
          {editing.form_type !== 'customer_survey' && editing.form_type !== 'personnel_survey' && editing.form_type !== 'notification_form' && (
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
          {editing.form_type !== 'customer_survey' && editing.form_type !== 'personnel_survey' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={editing.require_geo} onChange={e => setEditing(p => ({ ...p, require_geo: e.target.checked }))} id="require-geo" />
              <label htmlFor="require-geo" style={{ fontSize: '.78rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>GPS Zorunlu</label>
            </div>
          </div>
          )}


          {editing.form_type === 'notification_form' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="linked-maintenance"
              checked={editing.linked_entity_table === 'maintenance_tickets'}
              onChange={e => setEditing(p => ({ ...p, linked_entity_table: e.target.checked ? 'maintenance_tickets' : null }))}
            />
            <label htmlFor="linked-maintenance" style={{ fontSize: '.78rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>
              Bakım / Tamirat
              <span style={{ marginLeft: 6, fontSize: '.7rem', color: '#94a3b8', fontWeight: 400 }}>
                (Bu bildirim, ekipman arıza/bakım kaydına bağlanır)
              </span>
            </label>
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

          <div style={{ gridColumn: '1 / -1', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem', fontWeight: 700, color: 'var(--text-strong)', cursor: 'pointer' }}>
              <input 
                type="checkbox"
                checked={!!schemaJson.task_config?.enabled}
                onChange={e => {
                  const val = e.target.checked
                  setSchemaJson(prev => {
                    const task_config = prev.task_config || {}
                    return {
                      ...prev,
                      task_config: {
                        ...task_config,
                        enabled: val,
                        assignee: task_config.assignee || { positions: [], personnel: [] },
                        collaborators: task_config.collaborators || { positions: [], personnel: [] },
                        watchers: task_config.watchers || { positions: [], personnel: [], responsibles: false },
                        completion_hours: task_config.completion_hours || 72,
                        priority: task_config.priority || 'normal',
                        rules: task_config.rules || {}
                      }
                    }
                  })
                }}
                style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#8b5cf6' }}
              />
              <span>Form Gönderildiğinde Otomatik Görev Oluştur</span>
            </label>
          </div>

          {schemaJson.task_config?.enabled && (
            <div style={{ gridColumn: '1 / -1', marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 12, color: 'var(--text-strong)' }}>
                <i className="fa-solid fa-bullseye" style={{ marginRight: 8, color: '#3b82f6' }} />
                Görev Kuralları ve Katılımcılar
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* Sol Taraf: Sorumlular ve Süre */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {editing.form_type === 'checklist' && !schemaJson.require_branch_selection ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label className="f-label">Birincil Sorumlu (Atanan)</label>
                      <div style={{ minHeight: 40, border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', background: 'var(--surface-2)', color: 'var(--text-main)', fontSize: '.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fa-solid fa-user-gear" style={{ color: '#8b5cf6' }} />
                        <span>Formu Dolduran Kişi (Otomatik Sorumlu Olur)</span>
                      </div>
                      <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.3 }}>
                        Şube seçimi gerekli olmadığı için formu dolduran kişi otomatik olarak görevin birincil sorumlusu atanır.
                      </p>
                    </div>
                  ) : (
                    <TargetSelector
                      title="Birincil Sorumlu (Atanan)"
                      description="Form tamamlandığında oluşturulacak görev bu hedeflere atanacaktır. Seçilen pozisyonlar denetim yapılan şube çalışanlarına göre filtrelenerek atanır. Listede sadece merkez çalışanları isimle seçilebilir."
                      value={schemaJson.task_config?.assignee}
                      onChange={val => setSchemaJson(p => ({ ...p, task_config: { ...p.task_config, assignee: val } }))}
                      positions={positions}
                      personnelList={personnelList}
                    />
                  )}

                  <TargetSelector
                    title="Ek Sorumlular (İşbirlikçiler)"
                    description="Görevi birlikte yürütecek ve tamamlayabilecek ek personel veya pozisyonlar. Seçilen pozisyonlar şube çalışanlarına göre filtrelenir. Listede sadece merkez çalışanları bulunur."
                    value={schemaJson.task_config?.collaborators}
                    onChange={val => setSchemaJson(p => ({ ...p, task_config: { ...p.task_config, collaborators: val } }))}
                    positions={positions}
                    personnelList={personnelList}
                    hidePositions={editing.form_type === 'checklist'}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <TargetSelector
                      title="Gözlemciler (Takip Edenler)"
                      description="Görevin durumunu izleyebilecek, ancak üzerinde işlem yapmayacak personel. Seçilen pozisyonlar şube çalışanlarına göre filtrelenir. Listede sadece merkez çalışanları bulunur."
                      value={schemaJson.task_config?.watchers}
                      onChange={val => setSchemaJson(p => ({ ...p, task_config: { ...p.task_config, watchers: val } }))}
                      positions={positions}
                      personnelList={personnelList}
                      hidePositions={editing.form_type === 'checklist'}
                    />
                    {editing.form_type !== 'checklist' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', cursor: 'pointer', marginTop: 4 }}>
                        <input
                          type="checkbox"
                          checked={!!schemaJson.task_config?.watchers?.responsibles}
                          onChange={e => {
                            const val = e.target.checked
                            setSchemaJson(p => {
                              const task_config = p.task_config || {}
                              const watchers = task_config.watchers || { positions: [], personnel: [], responsibles: false }
                              return {
                                ...p,
                                task_config: {
                                  ...task_config,
                                  watchers: { ...watchers, responsibles: val }
                                }
                              }
                            })
                          }}
                          style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#8b5cf6' }}
                        />
                        <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>Şube Sorumlularını Otomatik Gözlemci Ekle</span>
                      </label>
                    )}
                  </div>

                  <div>
                    <label className="f-label">Görevin Tamamlanma Süresi (Saat)</label>
                    <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.3 }}>
                      Görevin açılışından itibaren kaç saat içinde tamamlanması gerektiğini belirtin.
                    </p>
                    <input
                      type="number"
                      className="f-input"
                      value={schemaJson.task_config?.completion_hours || 72}
                      onChange={e => {
                        const val = Number(e.target.value) || 72
                        setSchemaJson(p => ({
                          ...p,
                          task_config: { ...p.task_config, completion_hours: val }
                        }))
                      }}
                      placeholder="72"
                      min="1"
                      style={{ width: '100%', padding: '8px 12px' }}
                    />
                  </div>

                  <div>
                    <label className="f-label">Görevin Önceliği</label>
                    <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.3 }}>
                      Oluşturulacak görevin öncelik derecesini seçin.
                    </p>
                    <select
                      className="f-input"
                      value={schemaJson.task_config?.priority || 'normal'}
                      onChange={e => {
                        const val = e.target.value
                        setSchemaJson(p => ({
                          ...p,
                          task_config: { ...p.task_config, priority: val }
                        }))
                      }}
                      style={{ width: '100%', padding: '8px 12px', height: 38 }}
                    >
                      <option value="low">Düşük</option>
                      <option value="normal">Normal</option>
                      <option value="high">Yüksek</option>
                      <option value="urgent">Kritik</option>
                    </select>
                  </div>
                </div>

                {/* Sağ Taraf: Kurallar */}
                <div>
                  <label className="f-label">Görev Kuralları</label>
                  <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.3 }}>
                    Oluşturulacak görev için geçerli olacak kuralları seçin.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {[
                      { key: 'delegation_allowed', label: 'Delege Etmeye İzin Ver' },
                      { key: 'approval_required', label: 'Kapanış Onayı Gerekli' },
                      { key: 'closure_summary_required', label: 'Kapanış Özeti Zorunlu' },
                      { key: 'closure_file_required', label: 'Kapanış Dosyası Zorunlu' },
                      { key: 'closure_image_required', label: 'Kapanış Fotoğrafı Zorunlu' },
                      { key: 'requires_cost_input', label: 'Kapatmada Maliyet Girişi Zorunlu 💰' },
                      { key: 'edit_due_date_allowed', label: 'Atanan Vade Değiştirebilir' },
                      { key: 'edit_schedule_allowed', label: 'Atanan Takvim Değiştirebilir' },
                      { key: 'incomplete_if_late', label: 'Süresinde Bitmezse Tamamlanmadı Say' }
                    ].map(rule => {
                      const isChecked = !!schemaJson.task_config?.rules?.[rule.key]
                      return (
                        <label key={rule.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={e => {
                              const rls = schemaJson.task_config?.rules || {}
                              setSchemaJson(p => ({ 
                                ...p, 
                                task_config: { ...p.task_config, rules: { ...rls, [rule.key]: e.target.checked } }
                              }))
                            }}
                          />
                          <span>{rule.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Form Doldurma Önizlemesi (Üst Bilgiler) */}
      {editing.form_type === 'inspection' && (
        <div className="card" style={{ padding: 22, marginBottom: 16, borderLeft: '4px solid #06b6d4', background: 'var(--surface-2)', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: '.95rem', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-eye" style={{ fontSize: '1rem' }} />
              Form Doldurma Ekranı Önizlemesi (Üst Bilgiler)
            </div>
            <span style={{ fontSize: '.7rem', padding: '3px 8px', borderRadius: 99, background: 'rgba(6,182,212,.15)', color: '#06b6d4', fontWeight: 700 }}>Denetim Modu</span>
          </div>

          <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
            Bu şablonla bir denetici form doldurmaya başladığında, soruların hemen öncesinde aşağıdaki üst bilgiler kartı görüntülenecektir:
          </p>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
            <div>
              <label className="f-label" style={{ opacity: 0.85 }}>Denetimi Yapan</label>
              <input type="text" className="f-input" disabled value="[Aktif Denetçi Kullanıcı]" style={{ cursor: 'not-allowed', background: 'var(--surface-2)' }} />
            </div>
            <div>
              <label className="f-label" style={{ opacity: 0.85 }}>Denetim Noktası (Şube)</label>
              <div className="sel-wrap">
                <select className="f-input" disabled style={{ cursor: 'not-allowed', background: 'var(--surface-2)' }}>
                  <option>[Şube Listesinden Seçilir]</option>
                </select>
              </div>
            </div>
            <div>
              <label className="f-label" style={{ opacity: 0.85 }}>Denetim Tarihi</label>
              <input type="date" className="f-input" disabled style={{ cursor: 'not-allowed', background: 'var(--surface-2)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <label className="f-label" style={{ opacity: 0.85 }}>Başlangıç</label>
                <input type="time" className="f-input" disabled style={{ cursor: 'not-allowed', background: 'var(--surface-2)' }} />
              </div>
              <div>
                <label className="f-label" style={{ opacity: 0.85 }}>Bitiş</label>
                <input type="time" className="f-input" disabled style={{ cursor: 'not-allowed', background: 'var(--surface-2)' }} />
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
              <label className="f-label" style={{ fontWeight: 700, opacity: 0.85 }}>Denetim Sırasındaki Yetkili</label>
              <div className="sel-wrap">
                <select className="f-input" disabled style={{ cursor: 'not-allowed', background: 'var(--surface-2)' }}>
                  <option>[Seçiniz...]</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ padding: 12, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <i className="fa-solid fa-circle-info" style={{ color: '#8b5cf6', marginTop: 3 }} />
            <div style={{ fontSize: '.78rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
              <strong>Otomatik Görev Akışı Bilgilendirmesi:</strong><br />
              {schemaJson.task_config?.enabled ? (
                <span style={{ color: 'var(--text-strong)' }}>
                  ✓ <strong>Otomatik Görev Aktif:</strong> Denetim gönderildiğinde, başarısız olunan (maksimum puandan düşük alan) tüm sorular otomatik olarak bir takip görevi olarak açılacaktır. Bu görev, yukarıda seçilecek olan <strong>Denetim Sırasındaki Yetkili</strong>'ye atanacaktır.
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>
                  ✗ <strong>Otomatik Görev Kapalı:</strong> Denetim sonucunda otomatik bir görev açılmayacaktır. Etkinleştirmek için yukarıdaki "Form Gönderildiğinde Otomatik Görev Oluştur" seçeneğini işaretleyin.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

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
                {editing.form_type === 'inspection' && (
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
                {editing.form_type === 'inspection' && (
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
                    <i className="fa-solid fa-list" style={{ marginRight: 6 }} /> Seçenekler Listesi{editing.form_type === 'inspection' ? ' ve Puan Ağırlıkları' : ''}
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
                          {editing.form_type === 'inspection' && (
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
