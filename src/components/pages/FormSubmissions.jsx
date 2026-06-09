import React, { useState, useEffect, useCallback, useRef } from 'react'
import { fetchFormSubmissions, fetchFormSubmissionDetail, fetchFormTemplates, submitFormResponse, fetchTemplatesForBranch } from '@/lib/formService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/useToast'
import { readSettingArray, normalizeEmployeeRecord, normalizePositionRecord, PERSONNEL_SETTINGS_KEYS } from '@/lib/personnelConfig'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { ACCOUNT_CHART_KEY, normalizeAccount, buildExpenseAccountOptions } from '@/lib/accountChart'
import { useSearchParams } from 'react-router-dom'

const STATUS_MAP = {
  draft: { label: 'Taslak', color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  syncing: { label: 'Senkronize Ediliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  completed: { label: 'Tamamlandı', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  anomaly: { label: 'Anomali', color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
}

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

const SearchableMultiSelect = ({ items, selectedList, onChange, placeholder }) => {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const safeSelectedList = getDynamicFieldItems(selectedList)
  const selectedIds = safeSelectedList.map(item => String(item.id))

  const filtered = (items || []).filter(item => {
    if (!item) return false
    const nameMatch = String(item.name || '').toLowerCase().includes(search.toLowerCase())
    const skuMatch = item.sku ? String(item.sku).toLowerCase().includes(search.toLowerCase()) : false
    return nameMatch || skuMatch
  })

  const handleToggle = (item) => {
    if (!item) return
    const list = [...safeSelectedList]
    const idx = list.findIndex(x => x && String(x.id) === String(item.id))
    if (idx > -1) {
      list.splice(idx, 1)
    } else {
      list.push({ id: item.id, name: item.name })
    }
    onChange(list)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', minWidth: 220, maxWidth: 300 }}>
      <div 
        onClick={() => setOpen(prev => !prev)}
        style={{ 
          minHeight: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px',
          display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', background: 'var(--surface)',
          cursor: 'pointer', fontSize: '.8rem', justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, flex: 1 }}>
          {safeSelectedList.length === 0 && <span style={{ color: 'var(--text-muted)' }}>{placeholder}</span>}
          {safeSelectedList.map((item) => (
            <span 
              key={item.id || item} 
              style={{ 
                background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', padding: '2px 6px', 
                borderRadius: 6, fontSize: '.72rem', display: 'inline-flex', alignItems: 'center', gap: 4,
                border: '1px solid rgba(139,92,246,0.2)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {item.name || item}
              <i 
                className="fa-solid fa-xmark" 
                style={{ cursor: 'pointer', opacity: 0.6 }}
                onClick={() => handleToggle(item)}
              />
            </span>
          ))}
        </div>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: 'var(--text-muted)', fontSize: '.75rem', marginLeft: 6 }} />
      </div>

      {open && (
        <div style={{ 
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, 
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, 
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto', zIndex: 1000 
        }}>
          <div style={{ padding: 6, position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ara..."
              className="f-input"
              style={{ padding: '4px 8px', fontSize: '.75rem', width: '100%', background: 'var(--surface-2)' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div style={{ padding: 4 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '8px 10px', fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>Sonuç bulunamadı</div>
            ) : (
              filtered.map(item => {
                const isSelected = selectedIds.includes(String(item.id))
                return (
                  <div
                    key={item.id}
                    onClick={() => handleToggle(item)}
                    style={{ 
                      padding: '6px 10px', cursor: 'pointer', borderRadius: 4, fontSize: '.78rem', 
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: isSelected ? 'rgba(139,92,246,0.05)' : 'transparent',
                      color: isSelected ? '#8b5cf6' : 'var(--text)'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={isSelected} 
                      readOnly 
                      style={{ pointerEvents: 'none', accentColor: '#8b5cf6' }} 
                    />
                    <span style={{ fontWeight: isSelected ? 700 : 500 }}>{item.name}</span>
                    {item.sku && <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>({item.sku})</span>}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FormSubmissions() {
  const [submissions, setSubmissions] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSub, setSelectedSub] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filter, setFilter] = useState({ templateId: '', status: '', startDate: '', endDate: '' })
  const [showFillForm, setShowFillForm] = useState(false)
  const [fillTemplateId, setFillTemplateId] = useState('')
  const [answers, setAnswers] = useState([])
  const [stockItems, setStockItems] = useState([])
  const [saleItems, setSaleItems] = useState([])
  const [semiItems, setSemiItems] = useState([])
  const [loadingDbItems, setLoadingDbItems] = useState(false)
  const [activeNotes, setActiveNotes] = useState({})
  const [formStartTime, setFormStartTime] = useState(null)
  const [showPrintReport, setShowPrintReport] = useState(null)
  const [uploadingFields, setUploadingFields] = useState({})
  const [showReportModal, setShowReportModal] = useState(false)
  const [branchTemplates, setBranchTemplates] = useState([])
  const [reportTemplateId, setReportTemplateId] = useState('')
  const [selectedBranchOption, setSelectedBranchOption] = useState('all')
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')
  const [reportGenerating, setReportGenerating] = useState(false)
  const [reportResults, setReportResults] = useState(null)
  const formContainerRef = useRef(null)
  const { scope, branchId, branches, branchName } = useWorkspace()
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryFillTemplateId = searchParams.get('fillTemplateId')

  // Personnel and metadata states
  const [employees, setEmployees] = useState([])
  const [positions, setPositions] = useState([])

  const [equipments, setEquipments] = useState([])
  const [linkedEntityId, setLinkedEntityId] = useState('')



  const isVardiyaMuduru = (emp) => {
    if (!positions || !emp.positionId) return false
    const pos = positions.find(p => String(p.id) === String(emp.positionId))
    if (!pos) return false
    const name = String(pos.name || '').toLowerCase()
    const code = String(pos.shortCode || '').toUpperCase()
    return name.includes('vardiya müdürü') || code === 'VRD'
  }

  const [metaBranchId, setMetaBranchId] = useState('')
  const [metaAuthorizedId, setMetaAuthorizedId] = useState('')
  const [metaSendToAuthorized, setMetaSendToAuthorized] = useState(true)
  const [metaShiftOfficerId, setMetaShiftOfficerId] = useState('')
  const [metaSendToShiftOfficer, setMetaSendToShiftOfficer] = useState(false)
  const [metaResponsibles, setMetaResponsibles] = useState([])
  const [metaFormDate, setMetaFormDate] = useState('')
  const [metaStartTime, setMetaStartTime] = useState('')
  const [metaEndTime, setMetaEndTime] = useState('')
  const [autoDateTime, setAutoDateTime] = useState(true)

  const [expenseAccountOptions, setExpenseAccountOptions] = useState([])

  useEffect(() => {
    async function loadEmployeesAndPositions() {
      try {
        const [empRecords, posRecords, eqResult, rawAccounts] = await Promise.all([
          readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
          readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord),
          fetch(buildApiUrl('/api/equipment/instances')).then(r => r.json()),
          readSettingArray(ACCOUNT_CHART_KEY, normalizeAccount).catch(() => [])
        ])
        setEmployees(empRecords || [])
        setPositions(posRecords || [])
        setEquipments(eqResult.data || [])
        setExpenseAccountOptions(buildExpenseAccountOptions(rawAccounts || []))
      } catch (err) {
        console.error('Failed to load employees, positions, equipments or accounts:', err)
      }
    }
    loadEmployeesAndPositions()
  }, [])

  const loadSubmissions = useCallback(async () => {
    setLoading(true)
    const [subResult, tplResult] = await Promise.all([
      fetchFormSubmissions({ 
        branchId, 
        templateId: filter.templateId || undefined, 
        status: filter.status || undefined,
        activeScope: scope
      }),
      fetchFormTemplates({ activeOnly: false }),
    ])
    if (subResult.error) toast('Yanıtlar yüklenemedi', 'error')
    setSubmissions(subResult.data || [])
    setTemplates(tplResult.data || [])
    setLoading(false)
  }, [branchId, filter.templateId, filter.status, scope, toast])

  useEffect(() => { loadSubmissions() }, [loadSubmissions])

  useEffect(() => {
    async function loadBranchTemplates() {
      if (scope === 'center' || scope === 'admin') {
        try {
          const { data, error } = await db.from('branch_templates').select('*').is('deleted_at', null).order('name')
          if (!error && data) {
            setBranchTemplates(data)
          }
        } catch (err) {
          console.error('Failed to load branch templates:', err)
        }
      }
    }
    loadBranchTemplates()
  }, [scope])

  const calculateReport = async () => {
    if (!reportTemplateId) {
      toast('Lütfen bir form şablonu seçin', 'error')
      return
    }
    setReportGenerating(true)
    try {
      const template = templates.find(t => t.id === reportTemplateId)
      if (!template) throw new Error('Şablon bulunamadı')

      // 1. Determine target branch IDs
      let targetBranchIds = null
      if (scope === 'branch' || scope === 'warehouse') {
        targetBranchIds = [branchId]
      } else if (selectedBranchOption !== 'all') {
        if (selectedBranchOption.startsWith('template:')) {
          const tId = selectedBranchOption.split(':')[1]
          const tpl = branchTemplates.find(t => t.id === tId)
          if (tpl && Array.isArray(tpl.branch_ids)) {
            targetBranchIds = tpl.branch_ids
          }
        } else if (selectedBranchOption.startsWith('branch:')) {
          targetBranchIds = [selectedBranchOption.split(':')[1]]
        }
      }

      // 2. Fetch submissions
      let query = db.from('form_submissions')
        .select('*')
        .eq('template_id', reportTemplateId)
        .in('status', ['completed', 'anomaly'])

      if (targetBranchIds && targetBranchIds.length > 0) {
        query = query.in('branch_id', targetBranchIds)
      }
      if (reportStartDate) {
        query = query.gte('created_at', `${reportStartDate}T00:00:00+03:00`)
      }
      if (reportEndDate) {
        query = query.lte('created_at', `${reportEndDate}T23:59:59+03:00`)
      }

      const { data: subs, error } = await query
      if (error) throw error

      if (!subs || subs.length === 0) {
        toast('Seçilen kriterlere uygun form yanıtı bulunamadı', 'warning')
        setReportResults({
          submissionsCount: 0,
          questionAverages: {},
          sectionAverages: {},
          template,
          subs: []
        })
        return
      }

      // 3. Process answers
      const fieldValues = {}
      subs.forEach(sub => {
        const answers = Array.isArray(sub.answers_json) ? sub.answers_json : []
        answers.forEach(ans => {
          if (ans.value !== undefined && ans.value !== null && ans.value !== '') {
            if (!fieldValues[ans.field_id]) fieldValues[ans.field_id] = []
            fieldValues[ans.field_id].push(ans.value)
          }
        })
      })

      // 4. Calculate averages per field
      const questionAverages = {}
      const sections = Array.isArray(template.schema_json?.sections) ? template.schema_json.sections : []
      
      sections.forEach(section => {
        const fields = Array.isArray(section.fields) ? section.fields : []
        fields.forEach(field => {
          const vals = fieldValues[field.id] || []
          if (vals.length === 0) {
            questionAverages[field.id] = { avg: null, count: 0, label: field.label, type: field.type }
            return
          }

          let sum = 0
          let count = 0
          let yesCount = 0

          if (field.type === 'yes_no' || field.type === 'checkbox') {
            vals.forEach(v => {
              const isYes = v === true || v === 'yes'
              if (isYes) yesCount++
              count++
            })
            questionAverages[field.id] = {
              avg: count > 0 ? (yesCount / count) * 100 : 0,
              count,
              label: field.label,
              type: field.type,
              format: 'percentage'
            }
          } else if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps' || field.type === 'number' || field.type === 'temperature') {
            vals.forEach(v => {
              const num = Number(v)
              if (!isNaN(num)) {
                sum += num
                count++
              }
            })
            questionAverages[field.id] = {
              avg: count > 0 ? sum / count : 0,
              count,
              label: field.label,
              type: field.type,
              format: 'numeric'
            }
          } else if (field.type === 'emoji_rating') {
            vals.forEach(v => {
              let score = 0
              if (v === 'happy') score = 3
              else if (v === 'neutral') score = 2
              else if (v === 'sad') score = 1
              if (score > 0) {
                sum += score
                count++
              }
            })
            questionAverages[field.id] = {
              avg: count > 0 ? sum / count : 0,
              count,
              label: field.label,
              type: field.type,
              format: 'emoji'
            }
          } else if (field.type === 'select') {
            const hasPointWeights = Array.isArray(field.options) && field.options.some(o => typeof o === 'object' && 'points' in o)
            if (hasPointWeights) {
              vals.forEach(v => {
                const optObj = field.options.find(o => String(typeof o === 'object' ? o.label : o) === String(v))
                if (optObj && typeof optObj === 'object' && 'points' in optObj) {
                  sum += Number(optObj.points) || 0
                  count++
                }
              })
              questionAverages[field.id] = {
                avg: count > 0 ? sum / count : 0,
                count,
                label: field.label,
                type: field.type,
                format: 'numeric_points'
              }
            } else {
              questionAverages[field.id] = {
                avg: null,
                count: vals.length,
                label: field.label,
                type: field.type,
                format: 'text'
              }
            }
          } else {
            questionAverages[field.id] = {
              avg: null,
              count: vals.length,
              label: field.label,
              type: field.type,
              format: 'text'
            }
          }
        })
      })

      // 5. Calculate section averages
      const sectionAverages = {}
      sections.forEach(section => {
        const fields = Array.isArray(section.fields) ? section.fields : []
        let sectionSum = 0
        let sectionCount = 0

        fields.forEach(field => {
          const avgInfo = questionAverages[field.id]
          if (avgInfo && avgInfo.avg !== null) {
            if (avgInfo.format === 'percentage') {
              sectionSum += avgInfo.avg
              sectionCount++
            } else if (avgInfo.format === 'numeric') {
              const maxVal = field.type === 'rating' ? 5 : 10
              const percentage = maxVal > 0 ? (avgInfo.avg / maxVal) * 100 : 0
              sectionSum += percentage
              sectionCount++
            } else if (avgInfo.format === 'emoji') {
              const percentage = (avgInfo.avg / 3) * 100
              sectionSum += percentage
              sectionCount++
            } else if (avgInfo.format === 'numeric_points') {
              const maxPoints = Number(field.max_points) || 0
              const percentage = maxPoints > 0 ? (avgInfo.avg / maxPoints) * 100 : 0
              sectionSum += percentage
              sectionCount++
            }
          }
        })

        sectionAverages[section.id] = {
          avg: sectionCount > 0 ? sectionSum / sectionCount : null,
          title: section.title
        }
      })

      setReportResults({
        submissionsCount: subs.length,
        questionAverages,
        sectionAverages,
        template,
        subs
      })
    } catch (err) {
      console.error('Failed to calculate report:', err)
      toast('Rapor hesaplanırken bir hata oluştu: ' + err.message, 'error')
    } finally {
      setReportGenerating(false)
    }
  }

  const openDetail = async (subId) => {
    setDetailLoading(true)
    const { data, error } = await fetchFormSubmissionDetail(subId)
    setDetailLoading(false)
    if (error) return toast('Detay yüklenemedi', 'error')
    setSelectedSub(data)
  }

  const querySubmissionId = searchParams.get('submissionId')
  useEffect(() => {
    if (querySubmissionId && !loading) {
      openDetail(querySubmissionId)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('submissionId')
      setSearchParams(nextParams, { replace: true })
    }
  }, [querySubmissionId, loading, searchParams, setSearchParams])

  const getTemplateName = (tplId) => templates.find(t => t.id === tplId)?.title || '—'
  const getTemplate = (tplId) => templates.find(t => t.id === tplId)

  const fetchDbItemsForForm = async (template) => {
    let hasStock = false
    let hasSale = false
    let hasSemi = false
    let hasEquipment = false

    for (const section of (template.schema_json?.sections || [])) {
      for (const field of (section.fields || [])) {
        if (field.type === 'stock_item_select') hasStock = true
        if (field.type === 'sale_item_select') hasSale = true
        if (field.type === 'semi_product_select') hasSemi = true
        if (field.type === 'equipment_select') hasEquipment = true
      }
    }

    if (!hasStock && !hasSale && !hasSemi && !hasEquipment) return

    setLoadingDbItems(true)
    try {
      const promises = []
      if (hasStock) {
        promises.push(
          db.from('stock_items')
            .select('id,name,sku')
            .is('deleted_at', null)
            .order('name')
            .then(res => setStockItems(res.data || []))
        )
      }
      if (hasSale) {
        promises.push(
          db.from('sale_items')
            .select('id,name,sku')
            .is('deleted_at', null)
            .order('name')
            .then(res => setSaleItems(res.data || []))
        )
      }
      if (hasSemi) {
        promises.push(
          db.from('semi_items')
            .select('id,name,sku')
            .is('deleted_at', null)
            .order('name')
            .then(res => setSemiItems(res.data || []))
        )
      }
      if (hasEquipment) {
        promises.push(
          fetch(buildApiUrl('/api/equipment/instances'))
            .then(r => r.json())
            .then(res => setEquipments(res.data || []))
        )
      }
      await Promise.all(promises)
    } catch (err) {
      console.error('Failed to fetch DB items for form:', err)
      toast('Öğeler yüklenirken hata oluştu', 'error')
    } finally {
      setLoadingDbItems(false)
    }
  }

  // ─── Fill Form Logic ───
  const startFillForm = (templateId) => {
    setFillTemplateId(templateId)
    const template = getTemplate(templateId)
    if (!template) return toast('Şablon bulunamadı', 'error')

    fetchDbItemsForForm(template)

    const initialAnswers = []
    for (const section of (template.schema_json?.sections || [])) {
      for (const field of (section.fields || [])) {
        initialAnswers.push({ field_id: field.id, value: null, section_id: section.id })
      }
    }
    setAnswers(initialAnswers)
    setActiveNotes({})
    setFormStartTime(Date.now())
    setShowFillForm(true)

    // Reset financial and link states
    const queryLinkedEntityId = searchParams.get('linked_entity_id') || searchParams.get('linkedEntityId')
    setLinkedEntityId(queryLinkedEntityId || '')

    // Initialize metadata states
    const allowedContexts = template.allowed_contexts || ['center', 'branch', 'warehouse']
    const isBranchAllowed = allowedContexts.includes('branch')
    
    const activeUserRaw = sessionStorage.getItem('rms_active_user')
    const activeUser = activeUserRaw ? JSON.parse(activeUserRaw) : null
    
    let activeBranch = ''
    if (isBranchAllowed && activeUser?.defaultBranchId) {
      activeBranch = activeUser.defaultBranchId
    } else {
      activeBranch = branchId || ''
    }

    setMetaBranchId(activeBranch)
    setMetaAuthorizedId('')
    setMetaSendToAuthorized(false)
    setMetaShiftOfficerId('')
    setMetaSendToShiftOfficer(false)
    setAutoDateTime(true)
    
    const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
    setMetaFormDate(todayStr)
    
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    setMetaStartTime(timeStr)
    
    const later = new Date(now.getTime() + 15 * 60 * 1000)
    const endTimeStr = `${pad(later.getHours())}:${pad(later.getMinutes())}`
    setMetaEndTime(endTimeStr)

    if (activeBranch) {
      const branchManagers = employees.filter(emp => 
        !emp.deletedAt && 
        Array.isArray(emp.managedBranchIds) && 
        emp.managedBranchIds.map(String).includes(String(activeBranch))
      )
      setMetaResponsibles(branchManagers.map(m => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`.trim(),
        sendResult: true
      })))
      
      // Auto-select "Denetim Sırasındaki Yetkili" if activeUser is a manager of this branch
      const isManager = branchManagers.some(m => String(m.id) === String(activeUser?.id))
      if (isManager) {
        setMetaAuthorizedId(activeUser.id)
        setMetaSendToAuthorized(true)
      }
    } else {
      setMetaResponsibles([])
    }
  }

  useEffect(() => {
    if (!loading && queryFillTemplateId && templates.length > 0) {
      const templateExists = templates.some(t => String(t.id) === String(queryFillTemplateId))
      if (templateExists) {
        startFillForm(queryFillTemplateId)
        
        // Clean query parameter
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('fillTemplateId')
        setSearchParams(nextParams, { replace: true })
      } else {
        toast('Seçilen form şablonu bulunamadı', 'error')
      }
    }
  }, [loading, queryFillTemplateId, templates, searchParams, setSearchParams, toast])

  const updateAnswer = (fieldId, value) => {
    setAnswers(prev => prev.map(a => a.field_id === fieldId ? { ...a, value } : a))
  }

  const toggleNote = (fieldId) => {
    setActiveNotes(prev => ({ ...prev, [fieldId]: !prev[fieldId] }))
  }

  const updateNote = (fieldId, note) => {
    setAnswers(prev => prev.map(a => a.field_id === fieldId ? { ...a, note } : a))
  }

  const handlePhotoUpload = async (fieldId, file) => {
    if (!file) return
    setUploadingFields(prev => ({ ...prev, [fieldId]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const uploaded = await uploadApiFile(formData)
      const url = uploaded?.url || uploaded?.publicUrl || uploaded?.public_url || uploaded?.path || uploaded?.fileUrl || uploaded?.file_url || ''
      if (url) {
        updateAnswer(fieldId, url)
        toast('Fotoğraf başarıyla yüklendi', 'success')
      } else {
        toast('Görsel adresi alınamadı', 'error')
      }
    } catch (err) {
      console.error('Failed to upload photo:', err)
      toast('Fotoğraf yükleme başarısız: ' + (err.message || ''), 'error')
    } finally {
      setUploadingFields(prev => ({ ...prev, [fieldId]: false }))
    }
  }

  const handleMetaBranchChange = (newBranchId) => {
    setMetaBranchId(newBranchId)
    setMetaAuthorizedId('')
    setMetaShiftOfficerId('')
    
    const branchManagers = employees.filter(emp => 
      !emp.deletedAt && 
      Array.isArray(emp.managedBranchIds) && 
      emp.managedBranchIds.map(String).includes(String(newBranchId))
    )
    setMetaResponsibles(branchManagers.map(m => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`.trim(),
      sendResult: true
    })))
  }

  const handleSubmitForm = async () => {
    const template = getTemplate(fillTemplateId)
    if (!template) return

    // Get inspector name from pin session
    const activeUserRaw = sessionStorage.getItem('rms_active_user')
    const activeUser = activeUserRaw ? JSON.parse(activeUserRaw) : null
    const inspectorName = activeUser ? `${activeUser.firstName} ${activeUser.lastName}`.trim() : 'Bilinmeyen Denetçi'

    // Validation
    if (template.form_type === 'inspection' && !metaBranchId) {
      return toast('Lütfen denetim noktasını (şubeyi) seçin', 'warning')
    }
    if (template.form_type === 'notification_form' && template.linked_entity_table !== 'maintenance_tickets' && !metaBranchId) {
      return toast('Lütfen bildirim noktasını (şubeyi) seçin', 'warning')
    }
    if (template.form_type === 'checklist' && (scope === 'center' || scope === 'admin') && template.schema_json?.require_branch_selection && !metaBranchId) {
      return toast('Lütfen şubeyi seçin', 'warning')
    }

    let submitBranchId = branchId
    if (template.form_type === 'inspection') {
      submitBranchId = metaBranchId || branchId
    } else if (template.form_type === 'notification_form') {
      if (template.linked_entity_table === 'maintenance_tickets') {
        submitBranchId = null
      } else {
        submitBranchId = metaBranchId || branchId
      }
    } else if (template.form_type === 'checklist') {
      if (scope === 'center' || scope === 'admin') {
        if (template.schema_json?.require_branch_selection) {
          submitBranchId = metaBranchId
        } else {
          submitBranchId = null
        }
      } else {
        submitBranchId = branchId || activeUser?.defaultBranchId || null
      }
    }

    const completionTimeSeconds = formStartTime ? Math.round((Date.now() - formStartTime) / 1000) : null

    // Auto date/time calculation on submit
    let finalFormDate = metaFormDate
    let finalEndTime = metaEndTime
    if (autoDateTime) {
      finalFormDate = new Date().toLocaleDateString('en-CA')
      const now = new Date()
      const pad = (n) => String(n).padStart(2, '0')
      finalEndTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    }

    // Form-specific metadata
    const metadata = {
      creator_name: inspectorName,
      branch_name: branches.find(b => b.id === submitBranchId)?.name || '',
      form_date: finalFormDate,
      start_time: metaStartTime,
      end_time: finalEndTime,
      ...((template.form_type === 'inspection' || template.form_type === 'notification_form') ? {
        inspector_name: inspectorName,
        branch_id: template.linked_entity_table === 'maintenance_tickets' ? null : (metaBranchId || null),
        ...(template.form_type === 'inspection' ? {
          branch_authorized_id: metaAuthorizedId,
          branch_authorized_name: (() => {
            const emp = employees.find(e => e.id === metaAuthorizedId)
            return emp ? `${emp.firstName} ${emp.lastName}`.trim() : ''
          })(),
          send_to_authorized: !!metaAuthorizedId,  // Şube yetkilisi seçildiyse sonuç daima gönderilir
          shift_officer_id: metaShiftOfficerId,
          shift_officer_name: (() => {
            const emp = employees.find(e => e.id === metaShiftOfficerId)
            return emp ? `${emp.firstName} ${emp.lastName}`.trim() : ''
          })(),
          send_to_shift_officer: metaSendToShiftOfficer,
          branch_responsibles: metaResponsibles.map(r => ({
            id: r.id,
            name: r.name,
            send_result: r.sendResult
          })),
        } : {})
      } : {})
    }

    // Extract photos from answers
    const submissionPhotos = []
    if (template?.schema_json?.sections) {
      for (const section of template.schema_json.sections) {
        for (const field of (section.fields || [])) {
          if (field.type === 'photo') {
            const ans = answers.find(a => a.field_id === field.id)
            if (ans && ans.value) {
              submissionPhotos.push({
                field_id: field.id,
                file_url: ans.value,
                file_name: ans.value.split('/').pop() || 'photo.jpg',
                captured_at: new Date().toISOString(),
                is_live_capture: true,
              })
            }
          }
        }
      }
    }

    const { data, error } = await submitFormResponse({
      templateId: fillTemplateId,
      branchId: submitBranchId,
      submittedBy: activeUser?.id || 'anonymous',
      answersJson: answers,
      completionTimeSeconds,
      metadata: { ...(metadata || {}), creator_scope: scope },
      photos: submissionPhotos,
      repairCost: null,
      repairCurrency: null,
      repairExchangeRate: null,
      linkedEntityId: linkedEntityId || null,
    })

    if (error) return toast('Gönderme başarısız: ' + (error.message || ''), 'error')

    if (data?.anomalies?.length > 0) {
      toast(`Form gönderildi ama ${data.anomalies.length} anomali tespit edildi!`, 'warning')
    } else {
      const isInspection = template.form_type === 'inspection'
      if (isInspection) {
        toast(`Form gönderildi — Puan: ${data?.scoreResult?.scorePercentage || 0}%`, 'success')
      } else {
        toast('Form başarıyla gönderildi.', 'success')
      }
    }

    setShowFillForm(false)
    setFillTemplateId('')
    setAnswers([])
    setActiveNotes({})
    loadSubmissions()
  }

  // Stats
  const totalCount = submissions.length
  const completedCount = submissions.filter(s => s.status === 'completed').length
  const anomalyCount = submissions.filter(s => s.status === 'anomaly').length
  const avgScore = totalCount > 0
    ? (submissions.reduce((sum, s) => sum + (Number(s.score_percentage) || 0), 0) / totalCount).toFixed(1)
    : '—'

  const filteredSubmissions = submissions.filter(sub => {
    const subDate = sub.created_at.split('T')[0]
    if (filter.startDate && subDate < filter.startDate) return false
    if (filter.endDate && subDate > filter.endDate) return false
    return true
  })

  const filteredTemplate = filter.templateId ? templates.find(t => t.id === filter.templateId) : null
  const isFilterChecklist = filteredTemplate?.form_type === 'checklist'

  // ─── Report Modal ───
  if (showReportModal) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(8,15,35,0.65)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
        onClick={e => {
          if (e.target === e.currentTarget && !reportGenerating) {
            setShowReportModal(false)
            setReportResults(null)
          }
        }}
      >
        <style dangerouslySetInnerHTML={{__html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            .print-report-container, .print-report-container * {
              visibility: visible !important;
            }
            .print-report-container {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: #fff !important;
              color: #000 !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: none !important;
            }
            .no-print {
              display: none !important;
            }
            .print-only-block {
              display: block !important;
            }
          }
        `}} />

        <div
          style={{
            width: '100%',
            maxWidth: reportResults ? 860 : 540,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 20,
            overflow: 'hidden',
            background: 'var(--surface)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          className="print-report-container"
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-2)',
            }}
            className="no-print"
          >
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-chart-pie" style={{ color: '#8b5cf6' }} />
              Form Şablon Analiz Raporu
            </h3>
            <button
              onClick={() => {
                setShowReportModal(false)
                setReportResults(null)
              }}
              disabled={reportGenerating}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.25rem',
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          {/* Modal Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {!reportResults ? (
              /* ── SEARCH FORM ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="no-print">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Form Şablonu</label>
                  <div className="sel-wrap">
                    <select
                      value={reportTemplateId}
                      onChange={e => setReportTemplateId(e.target.value)}
                      className="f-input"
                      style={{ width: '100%' }}
                    >
                      <option value="">Seçiniz...</option>
                      {templates
                        .filter(t => scope === 'admin' || (t.allowed_contexts || ['center', 'branch', 'warehouse']).includes(scope))
                        .map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Şube Kapsamı</label>
                  {scope === 'center' || scope === 'admin' ? (
                    <div className="sel-wrap">
                      <select
                        value={selectedBranchOption}
                        onChange={e => setSelectedBranchOption(e.target.value)}
                        className="f-input"
                        style={{ width: '100%' }}
                      >
                        <option value="all">Tüm Şubeler</option>
                        {branchTemplates.length > 0 && (
                          <optgroup label="Şube Şablonları">
                            {branchTemplates.map(bt => (
                              <option key={bt.id} value={`template:${bt.id}`}>{bt.name}</option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Tekil Şubeler">
                          {branches.map(b => (
                            <option key={b.id} value={`branch:${b.id}`}>{b.name}</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="f-input"
                      value={branchName || 'Şubem'}
                      disabled
                      style={{ width: '100%', background: 'var(--surface-2)', cursor: 'not-allowed' }}
                    />
                  )}
                </div>

                <div className="form-info-grid" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Başlangıç Tarihi</label>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={e => setReportStartDate(e.target.value)}
                      className="f-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Bitiş Tarihi</label>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={e => setReportEndDate(e.target.value)}
                      className="f-input"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-p"
                  onClick={calculateReport}
                  disabled={reportGenerating || !reportTemplateId}
                  style={{ width: '100%', height: 44, marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '.9rem' }}
                >
                  {reportGenerating ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin" /> Hesaplamalar Yapılıyor...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-calculator" /> Raporu Hesapla ve Göster
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* ── REPORT RESULTS SCREEN ── */
              <div>
                {/* Visual Header (Only visible on screen) */}
                <div style={{ marginBottom: 24, padding: '16px 20px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }} className="no-print">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.06em' }}>FORM ANALİZ RAPORU</span>
                      <h4 style={{ margin: '4px 0 8px 0', fontSize: '1.25rem', fontWeight: 900, color: 'var(--text-strong)' }}>{reportResults.template.title}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '.76rem', color: 'var(--text-muted)' }}>
                        <span>
                          <i className="fa-solid fa-building" style={{ marginRight: 4 }} />
                          <strong>Şube Kapsamı:</strong> {
                            scope === 'branch' || scope === 'warehouse'
                              ? (branchName || 'Kendi Şubem')
                              : (selectedBranchOption === 'all'
                                  ? 'Tüm Şubeler'
                                  : (selectedBranchOption.startsWith('template:')
                                      ? branchTemplates.find(bt => bt.id === selectedBranchOption.split(':')[1])?.name || 'Şablon'
                                      : branches.find(b => b.id === selectedBranchOption.split(':')[1])?.name || 'Şube'))
                          }
                        </span>
                        <span>
                          <i className="fa-regular fa-calendar" style={{ marginRight: 4 }} />
                          <strong>Tarih Aralığı:</strong> {reportStartDate || 'İlk Kayıt'} – {reportEndDate || 'Bugün'}
                        </span>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, padding: '8px 16px', textAlign: 'center', minWidth: 100 }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#8b5cf6' }}>{reportResults.submissionsCount}</div>
                      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Analiz Edilen Form</div>
                    </div>
                  </div>
                </div>

                {/* Print-Only Header (Only visible when printing) */}
                <div style={{ display: 'none' }} className="print-only-block">
                  <div style={{ textAlign: 'center', paddingBottom: 20, borderBottom: '2px solid #000', marginBottom: 20 }}>
                    <h2 style={{ fontSize: '1.6rem', margin: '0 0 6px 0', fontWeight: 800 }}>SUITABLE RMS - DÖNEMSEL FORM RAPORU</h2>
                    <h3 style={{ fontSize: '1.25rem', margin: '0 0 12px 0', color: '#333' }}>{reportResults.template.title}</h3>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: '.85rem' }}>
                      <span><strong>Şube Kapsamı:</strong> {
                        scope === 'branch' || scope === 'warehouse'
                          ? (branchName || 'Kendi Şubem')
                          : (selectedBranchOption === 'all'
                              ? 'Tüm Şubeler'
                              : (selectedBranchOption.startsWith('template:')
                                  ? branchTemplates.find(bt => bt.id === selectedBranchOption.split(':')[1])?.name || 'Şablon'
                                  : branches.find(b => b.id === selectedBranchOption.split(':')[1])?.name || 'Şube'))
                      }</span>
                      <span><strong>Tarih Aralığı:</strong> {reportStartDate || 'En Eski'} – {reportEndDate || 'Güncel'}</span>
                      <span><strong>Analiz Edilen Form Adedi:</strong> {reportResults.submissionsCount}</span>
                    </div>
                  </div>
                </div>

                {/* Print-Only Table (Only visible when printing) */}
                <div style={{ display: 'none' }} className="print-only-block">
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #000', textAlign: 'left', fontSize: '.85rem', fontWeight: 800 }}>
                        <th style={{ padding: '8px 4px' }}>Bölüm / Soru</th>
                        <th style={{ padding: '8px 4px', width: '25%', textAlign: 'right' }}>Ortalama Yanıt / Puan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(reportResults.template.schema_json?.sections) && reportResults.template.schema_json.sections.map((section) => {
                        const secAvg = reportResults.sectionAverages[section.id];
                        return (
                          <React.Fragment key={section.id}>
                            <tr style={{ background: '#f1f5f9', fontWeight: 800, fontSize: '.9rem', borderTop: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '8px 4px' }}>{section.title}</td>
                              <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                                {reportResults.template.form_type === 'inspection' && secAvg?.avg !== null ? `%${Math.round(secAvg.avg)}` : '—'}
                              </td>
                            </tr>
                            {Array.isArray(section.fields) && section.fields.map((field) => {
                              const avgInfo = reportResults.questionAverages[field.id];
                              let printVal = '—';
                              if (avgInfo && avgInfo.avg !== null) {
                                if (avgInfo.format === 'percentage') {
                                  printVal = `%${Math.round(avgInfo.avg)} Evet`;
                                } else if (avgInfo.format === 'numeric') {
                                  const divisor = field.type === 'rating' ? 5 : 10;
                                  printVal = `${avgInfo.avg.toFixed(1)} / ${divisor}`;
                                } else if (avgInfo.format === 'emoji') {
                                  printVal = `${avgInfo.avg.toFixed(1)} / 3.0`;
                                } else if (avgInfo.format === 'numeric_points') {
                                  printVal = `${avgInfo.avg.toFixed(1)} / ${field.max_points}`;
                                }
                              } else if (avgInfo && avgInfo.count > 0) {
                                printVal = `${avgInfo.count} Yanıt`;
                              }

                              return (
                                <tr key={field.id} style={{ borderBottom: '1px solid #cbd5e1', fontSize: '.8rem' }}>
                                  <td style={{ padding: '6px 4px 6px 16px' }}>{field.label}</td>
                                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{printVal}</td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Visual Report Listing (Only visible on screen) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }} className="no-print">
                  {Array.isArray(reportResults.template.schema_json?.sections) && reportResults.template.schema_json.sections.map((section) => {
                    const secAvg = reportResults.sectionAverages[section.id];
                    return (
                      <div key={section.id} className="card" style={{ padding: 18, border: '1px solid var(--border)' }}>
                        <h5 style={{ margin: '0 0 16px 0', fontSize: '.9rem', fontWeight: 800, color: '#8b5cf6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{section.title}</span>
                          {reportResults.template.form_type === 'inspection' && secAvg?.avg !== null && (
                            <span style={{ background: 'rgba(139,92,246,0.1)', padding: '3px 8px', borderRadius: 6, fontSize: '.75rem', fontWeight: 800 }}>
                              Ortalama Başarı: %{Math.round(secAvg.avg)}
                            </span>
                          )}
                        </h5>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {Array.isArray(section.fields) && section.fields.map((field) => {
                            const avgInfo = reportResults.questionAverages[field.id];
                            
                            // Determine percent for progress bar
                            let progressPercent = 0;
                            let scoreLabel = '—';
                            if (avgInfo && avgInfo.avg !== null) {
                              if (avgInfo.format === 'percentage') {
                                progressPercent = avgInfo.avg;
                                scoreLabel = `%${Math.round(avgInfo.avg)} Evet`;
                              } else if (avgInfo.format === 'numeric') {
                                const divisor = field.type === 'rating' ? 5 : 10;
                                progressPercent = (avgInfo.avg / divisor) * 100;
                                scoreLabel = `${avgInfo.avg.toFixed(1)} / ${divisor}`;
                              } else if (avgInfo.format === 'emoji') {
                                progressPercent = (avgInfo.avg / 3) * 100;
                                scoreLabel = `${avgInfo.avg.toFixed(1)} / 3.0`;
                              } else if (avgInfo.format === 'numeric_points') {
                                const maxPoints = Number(field.max_points) || 1;
                                progressPercent = (avgInfo.avg / maxPoints) * 100;
                                scoreLabel = `${avgInfo.avg.toFixed(1)} / ${maxPoints} p`;
                              }
                            } else if (avgInfo && avgInfo.count > 0) {
                              scoreLabel = `${avgInfo.count} Yanıt`;
                            }

                            // Progress bar color
                            const progressColor = progressPercent >= 70 ? '#10b981' : (progressPercent >= 45 ? '#f59e0b' : '#ef4444');

                            return (
                              <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                  <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-strong)' }}>{field.label}</span>
                                  <span style={{ fontSize: '.76rem', fontWeight: 800, color: progressColor, flexShrink: 0 }}>{scoreLabel}</span>
                                </div>
                                {avgInfo && avgInfo.avg !== null ? (
                                  <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    <div style={{ width: `${progressPercent}%`, height: '100%', background: progressColor, borderRadius: 99, transition: 'width 0.3s ease' }} />
                                  </div>
                                ) : (
                                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                    Veri ortalaması hesaplanamayan alan tipi (örn: serbest metin veya fotoğraf)
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
              background: 'var(--surface-2)',
            }}
            className="no-print"
          >
            <button
              type="button"
              className="btn-o"
              onClick={() => {
                setShowReportModal(false)
                setReportResults(null)
              }}
              disabled={reportGenerating}
            >
              Kapat
            </button>
            {reportResults && (
              <>
                <button
                  type="button"
                  className="btn-o"
                  onClick={() => setReportResults(null)}
                  disabled={reportGenerating}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="fa-solid fa-arrow-rotate-left" /> Yeni Arama
                </button>
                <button
                  type="button"
                  className="btn-p"
                  onClick={() => window.print()}
                  disabled={reportGenerating || reportResults.submissionsCount === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <i className="fa-solid fa-print" /> Raporu Yazdır (A4)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Fill Form Modal ───
  if (showFillForm) {
    const template = getTemplate(fillTemplateId)
    if (!template) return null;

// Calculate overall scores
let totalScoredPoints = 0;
let totalMaxPoints = 0;
(template.schema_json?.sections || []).forEach(section => {
  (section.fields || []).forEach(field => {
    const fMax = Number(field.max_points) || 0;
    if (fMax > 0) {
      totalMaxPoints += fMax;
      const answer = answers.find(a => a.field_id === field.id);
      if (answer && answer.value != null && answer.value !== '') {
        const fScore = calculateFieldScore(field, answer.value);
        totalScoredPoints += fScore != null ? fScore : 0;
      }
    }
  });
});
const overallPercentage = totalMaxPoints > 0 ? Math.round((totalScoredPoints / totalMaxPoints) * 100) : 0;

    return (
      <>
        <style dangerouslySetInnerHTML={{__html: `
          /* Form Yanıtları Mobil Düzeltmeleri */
          .form-fill-container {
            width: 100%;
            max-width: 800px;
            background: var(--surface);
            border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            padding: 24px;
            backdrop-filter: blur(8px);
          }
          .form-info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
            margin-bottom: 14px;
          }
          .form-field-row {
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
          }
          .form-field-controls {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-left: auto;
            flex-shrink: 0;
            max-width: 100%;
          }
          .rating-10-wrapper {
            display: flex;
            gap: 4px;
            font-size: 1.25rem;
            flex-wrap: wrap;
          }
          .nps-buttons-wrapper {
            display: flex;
            gap: 3px;
            flex-wrap: wrap;
            width: 100%;
          }
          .form-responsibles-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          @media (max-width: 600px) {
            .form-fill-container {
              padding: 14px !important;
              border-radius: 8px !important;
            }
            .form-info-grid {
              grid-template-columns: 1fr !important;
              gap: 10px !important;
            }
            .form-field-row {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 12px !important;
            }
            .form-field-controls {
              margin-left: 0 !important;
              width: 100% !important;
              justify-content: flex-start !important;
              flex-shrink: 1 !important;
            }
            .rating-10-wrapper {
              font-size: 1rem !important;
              gap: 4px !important;
            }
            .nps-buttons-wrapper {
              gap: 4px !important;
            }
            .nps-buttons-wrapper button {
              flex: 1 1 calc(16.6% - 4px) !important;
              min-width: 26px !important;
              height: 26px !important;
              font-size: 0.72rem !important;
            }
            .form-responsibles-grid {
              grid-template-columns: 1fr !important;
            }
          }
        `}} />
        <div ref={formContainerRef} className="form-fill-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <button className="btn-o" onClick={() => setShowFillForm(false)} style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', transition: 'background 0.2s' }}>
              <i className="fa-solid fa-arrow-left" />
            </button>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-strong)', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>{template.title}</h1>
          </div>

{/* Overall Score Summary */}
{template.form_type === 'inspection' && (
  <div className="card" style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
    <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#8b5cf6' }}>
      Toplam Puan: {totalScoredPoints}/{totalMaxPoints} <span style={{ color: '#8b5cf6', fontWeight: 800 }}> %{overallPercentage}</span>
    </div>
  </div>
)}
        {template.form_type === 'inspection' && (
          <div className="card" style={{ padding: 18, marginBottom: 16, borderLeft: '4px solid #06b6d4', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#06b6d4', marginBottom: 14 }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} /> Denetim Formu Bilgileri
            </div>

            {/* Otomatik Sistem Tarih Saat Checkbox */}
            <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoDateTime}
                  onChange={e => {
                    const checked = e.target.checked
                    setAutoDateTime(checked)
                    if (checked) {
                      const todayStr = new Date().toLocaleDateString('en-CA')
                      setMetaFormDate(todayStr)
                      const now = new Date()
                      const pad = (n) => String(n).padStart(2, '0')
                      setMetaStartTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`)
                      const later = new Date(now.getTime() + 15 * 60 * 1000)
                      setMetaEndTime(`${pad(later.getHours())}:${pad(later.getMinutes())}`)
                    }
                  }}
                  style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                />
                <span>Sistem Tarih ve Saatini Otomatik Kullan</span>
              </label>
            </div>
            
            <div className="form-info-grid">
              {/* Denetimi Yapan */}
              <div>
                <label className="f-label">Denetimi Yapan</label>
                <input
                  type="text"
                  className="f-input"
                  value={
                    (() => {
                      const activeUserRaw = sessionStorage.getItem('rms_active_user')
                      const activeUser = activeUserRaw ? JSON.parse(activeUserRaw) : null
                      return activeUser ? `${activeUser.firstName} ${activeUser.lastName}`.trim() : 'Bilinmeyen Denetçi'
                    })()
                  }
                  disabled
                  style={{ background: 'var(--surface-2)' }}
                />
              </div>

              {/* Denetim Noktası (Şube) */}
              <div>
                <label className="f-label">Denetim Noktası</label>
                <div className="sel-wrap">
                  <select
                    value={metaBranchId}
                    onChange={e => handleMetaBranchChange(e.target.value)}
                    className="f-input"
                  >
                    <option value="">Şube Seçiniz</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tarih */}
              <div>
                <label className="f-label">Denetim Tarihi</label>
                <input
                  type="date"
                  className="f-input"
                  value={metaFormDate}
                  onChange={e => setMetaFormDate(e.target.value)}
                  disabled={autoDateTime}
                  style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                />
              </div>

              {/* Süreler (Başlangıç & Bitiş) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="f-label">Başlangıç Saati</label>
                  <input
                    type="time"
                    className="f-input"
                    value={metaStartTime}
                    onChange={e => setMetaStartTime(e.target.value)}
                    disabled={autoDateTime}
                    style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                  />
                </div>
                <div>
                  <label className="f-label">Bitiş Saati</label>
                  <input
                    type="time"
                    className="f-input"
                    value={metaEndTime}
                    onChange={e => setMetaEndTime(e.target.value)}
                    disabled={autoDateTime}
                    style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                  />
                </div>
              </div>
            </div>

            <div className="form-info-grid" style={{ marginBottom: 0, gridTemplateColumns: '1fr' }}>
              {/* Denetim Sırasındaki Yetkili */}
              <div style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 10, background: 'var(--surface-2)' }}>
                <label className="f-label" style={{ fontWeight: 700 }}>Denetim Sırasındaki Yetkili</label>
                <div className="sel-wrap" style={{ marginBottom: 8 }}>
                  <select
                    value={metaShiftOfficerId}
                    onChange={e => setMetaShiftOfficerId(e.target.value)}
                    className="f-input"
                  >
                    <option value="">Seçiniz...</option>
                    {employees
                      .filter(emp => !emp.deletedAt && (emp.defaultBranchId === metaBranchId || emp.workingBranchIds?.includes(metaBranchId) || emp.managedBranchIds?.includes(metaBranchId)))
                      .map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                      ))
                    }
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    id="send-to-shift"
                    checked={metaSendToShiftOfficer}
                    onChange={e => setMetaSendToShiftOfficer(e.target.checked)}
                  />
                  <label htmlFor="send-to-shift" style={{ fontSize: '.76rem', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}>Sonucu Gönder</label>
                </div>
              </div>
            </div>
          </div>
        )}

        {template.form_type === 'checklist' && (
          <div className="card" style={{ padding: 18, marginBottom: 16, borderLeft: '4px solid #8b5cf6', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#8b5cf6', marginBottom: 14 }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} /> Checklist Bilgileri
            </div>

            {/* Otomatik Sistem Tarih Saat Checkbox */}
            <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoDateTime}
                  onChange={e => {
                    const checked = e.target.checked
                    setAutoDateTime(checked)
                    if (checked) {
                      const todayStr = new Date().toLocaleDateString('en-CA')
                      setMetaFormDate(todayStr)
                      const now = new Date()
                      const pad = (n) => String(n).padStart(2, '0')
                      setMetaStartTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`)
                      const later = new Date(now.getTime() + 15 * 60 * 1000)
                      setMetaEndTime(`${pad(later.getHours())}:${pad(later.getMinutes())}`)
                    }
                  }}
                  style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                />
                <span>Sistem Tarih ve Saatini Otomatik Kullan</span>
              </label>
            </div>

            <div className="form-info-grid">
              {/* Formu Dolduran */}
              <div>
                <label className="f-label">Formu Dolduran</label>
                <input
                  type="text"
                  className="f-input"
                  value={
                    (() => {
                      const activeUserRaw = sessionStorage.getItem('rms_active_user')
                      const activeUser = activeUserRaw ? JSON.parse(activeUserRaw) : null
                      return activeUser ? `${activeUser.firstName} ${activeUser.lastName}`.trim() : 'Bilinmeyen Kullanıcı'
                    })()
                  }
                  disabled
                  style={{ background: 'var(--surface-2)' }}
                />
              </div>

              {/* Şube Seçimi (Koşullu) */}
              {((scope === 'center' || scope === 'admin') ? template.schema_json?.require_branch_selection : true) && (
                <div>
                  <label className="f-label">Denetim Noktası (Şube)</label>
                  {(scope === 'center' || scope === 'admin') ? (
                    <div className="sel-wrap">
                      <select
                        value={metaBranchId}
                        onChange={e => handleMetaBranchChange(e.target.value)}
                        className="f-input"
                      >
                        <option value="">Şube Seçiniz</option>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="f-input"
                      value={branches.find(b => b.id === metaBranchId)?.name || branchName || 'Şubem'}
                      disabled
                      style={{ background: 'var(--surface-2)' }}
                    />
                  )}
                </div>
              )}

              {/* Tarih */}
              <div>
                <label className="f-label">Tarih</label>
                <input
                  type="date"
                  className="f-input"
                  value={metaFormDate}
                  onChange={e => setMetaFormDate(e.target.value)}
                  disabled={autoDateTime}
                  style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                />
              </div>

              {/* Saatler */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label className="f-label">Başlangıç Saati</label>
                  <input
                    type="time"
                    className="f-input"
                    value={metaStartTime}
                    onChange={e => setMetaStartTime(e.target.value)}
                    disabled={autoDateTime}
                    style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                  />
                </div>
                <div>
                  <label className="f-label">Bitiş Saati</label>
                  <input
                    type="time"
                    className="f-input"
                    value={metaEndTime}
                    onChange={e => setMetaEndTime(e.target.value)}
                    disabled={autoDateTime}
                    style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {template.form_type === 'notification_form' && (
          <div className="card" style={{ padding: 18, marginBottom: 16, borderLeft: '4px solid #f59e0b', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#f59e0b', marginBottom: 14 }}>
              <i className="fa-solid fa-circle-info" style={{ marginRight: 6 }} /> Bildirim Formu Bilgileri
            </div>

            {/* Otomatik Sistem Tarih Saat Checkbox */}
            <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', fontWeight: 600, color: 'var(--text-strong)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoDateTime}
                  onChange={e => {
                    const checked = e.target.checked
                    setAutoDateTime(checked)
                    if (checked) {
                      const todayStr = new Date().toLocaleDateString('en-CA')
                      setMetaFormDate(todayStr)
                      const now = new Date()
                      const pad = (n) => String(n).padStart(2, '0')
                      setMetaStartTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`)
                    }
                  }}
                  style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                />
                <span>Sistem Tarih ve Saatini Otomatik Kullan</span>
              </label>
            </div>

            <div className="form-info-grid">
              {/* Bildirimi Yapan */}
              <div>
                <label className="f-label">Bildirimi Yapan</label>
                <input
                  type="text"
                  className="f-input"
                  value={
                    (() => {
                      const activeUserRaw = sessionStorage.getItem('rms_active_user')
                      const activeUser = activeUserRaw ? JSON.parse(activeUserRaw) : null
                      return activeUser ? `${activeUser.firstName} ${activeUser.lastName}`.trim() : 'Bilinmeyen Kullanıcı'
                    })()
                  }
                  disabled
                  style={{ background: 'var(--surface-2)' }}
                />
              </div>

              {/* Bildirim Noktası (Şube) */}
              {template.linked_entity_table !== 'maintenance_tickets' && (
                <div>
                  <label className="f-label">Bildirim Noktası</label>
                  <div className="sel-wrap">
                    <select
                      value={metaBranchId}
                      onChange={e => handleMetaBranchChange(e.target.value)}
                      className="f-input"
                    >
                      <option value="">Şube Seçiniz</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Bildirim Tarihi */}
              <div>
                <label className="f-label">Bildirim Tarihi</label>
                <input
                  type="date"
                  className="f-input"
                  value={metaFormDate}
                  onChange={e => setMetaFormDate(e.target.value)}
                  disabled={autoDateTime}
                  style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                />
              </div>

              {/* Bildirim Saati */}
              <div>
                <label className="f-label">Bildirim Saati</label>
                <input
                  type="time"
                  className="f-input"
                  value={metaStartTime}
                  onChange={e => setMetaStartTime(e.target.value)}
                  disabled={autoDateTime}
                  style={autoDateTime ? { background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'not-allowed' } : {}}
                />
              </div>
            </div>
          </div>
        )}

        {(template.schema_json?.sections || []).map((section, sIdx) => {
          let sectionScoredPoints = 0
          let sectionMaxPoints = 0
          for (const field of (section.fields || [])) {
            const fMax = Number(field.max_points) || 0
            if (fMax > 0) {
              sectionMaxPoints += fMax
              const answer = answers.find(a => a.field_id === field.id)
              if (answer && answer.value !== undefined && answer.value !== null && answer.value !== '') {
                const fScore = calculateFieldScore(field, answer.value)
                sectionScoredPoints += fScore !== null ? fScore : 0
              }
            }
          }
          const sectionPercentage = sectionMaxPoints > 0 ? Math.round((sectionScoredPoints / sectionMaxPoints) * 100) : 0

          return (
            <div key={section.id} className="card" style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 20, marginBottom: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
              <div style={{ 
                fontWeight: 700, 
                fontSize: '.9rem', 
                color: '#8b5cf6', 
                marginBottom: 12,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <span>{sIdx + 1}. {section.title}</span>
                {template.form_type === 'inspection' && sectionMaxPoints > 0 && (
                  <span style={{ 
                    fontSize: '.75rem', 
                    color: '#fff', 
                    fontWeight: 600,
                    background: 'rgba(0,0,0,0.2)',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: 'none'
                  }}>
                    {sectionScoredPoints}/{sectionMaxPoints} <span style={{ color: '#8b5cf6', fontWeight: 800 }}>%{sectionPercentage}</span>
                  </span>
                )}
              </div>
              {(section.fields || []).map(field => {
                const answer = answers.find(a => a.field_id === field.id)
                const currentScore = calculateFieldScore(field, answer?.value)
                const scoreText = currentScore !== null ? `${currentScore} / ${field.max_points} puan` : `— / ${field.max_points} puan`
                const isFieldCritical = !!field.is_critical

                return (
                  <div key={field.id} style={{ 
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.02)',
                    padding: '12px 16px',
                    marginBottom: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}>
                    {/* Row Container (Horizontal on wide screens, wraps nicely) */}
                    <div className="form-field-row">
                      {/* Left Block: Question, Critical Badge, Points, Note Button */}
                      <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <span style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-strong)' }}>
                            {field.label}
                          </span>
                          {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                          {template.form_type === 'inspection' && field.max_points > 0 && (
                            <span style={{ 
                              fontSize: '.72rem', 
                              fontWeight: 700, 
                              color: currentScore === null ? 'var(--text-muted)' : (currentScore === 0 ? '#ef4444' : (currentScore < field.max_points ? '#f59e0b' : '#10b981')),
                              background: currentScore === null ? 'transparent' : (currentScore === 0 ? 'rgba(239,68,68,0.08)' : (currentScore < field.max_points ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)')),
                              padding: currentScore === null ? '0' : '2px 6px',
                              borderRadius: '4px',
                              border: currentScore === null ? 'none' : `1px solid ${currentScore === 0 ? 'rgba(239,68,68,0.2)' : (currentScore < field.max_points ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)')}`,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              {isFieldCritical && <span style={{ color: '#ef4444', fontWeight: 900 }}>[KRİTİK]</span>}
                              <span>{scoreText}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleNote(field.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: answer?.note ? '#8b5cf6' : 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '.72rem',
                              padding: '2px 6px',
                              borderRadius: 4,
                              transition: 'all 0.15s',
                              fontWeight: 600,
                            }}
                          >
                            <i className={answer?.note ? "fa-solid fa-comment-dots" : "fa-regular fa-comment"} />
                            <span>{answer?.note ? 'Notu Düzenle' : 'Not Ekle'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Right Block: Input Controls */}
                      <div className="form-field-controls">
                        {field.type === 'yes_no' && (
                          <div style={{ display: 'flex', gap: 6 }}>
                            {[true, false].map(v => (
                              <button
                                key={String(v)}
                                type="button"
                                className={answer?.value === v ? 'btn-p' : 'btn-o'}
                                onClick={() => updateAnswer(field.id, v)}
                                style={{ padding: '6px 14px', fontSize: '.8rem' }}
                              >
                                {v ? '✓ Evet' : '✗ Hayır'}
                              </button>
                            ))}
                          </div>
                        )}

                        {field.type === 'checkbox' && (
                          <input
                            type="checkbox"
                            checked={!!answer?.value}
                            onChange={e => updateAnswer(field.id, e.target.checked)}
                            style={{ accentColor: '#3b82f6', width: 22, height: 22, cursor: 'pointer' }}
                          />
                        )}

                        {field.type === 'rating' && (
                          <div style={{ display: 'flex', gap: 6, fontSize: '1.4rem' }}>
                            {[1, 2, 3, 4, 5].map(r => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => updateAnswer(field.id, r)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '4px',
                                  transition: 'transform 0.15s',
                                  transform: (answer?.value || 0) === r ? 'scale(1.15)' : 'none',
                                }}
                              >
                                <i
                                  className={(answer?.value || 0) >= r ? "fa-solid fa-star" : "fa-regular fa-star"}
                                  style={{ color: (answer?.value || 0) >= r ? '#ffb300' : 'var(--text-muted)' }}
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {field.type === 'rating_10' && (
                          <div className="rating-10-wrapper">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                              <button
                                key={r}
                                type="button"
                                onClick={() => updateAnswer(field.id, r)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  transition: 'transform 0.15s',
                                  transform: (answer?.value || 0) === r ? 'scale(1.15)' : 'none',
                                }}
                              >
                                <i
                                  className={(answer?.value || 0) >= r ? "fa-solid fa-star" : "fa-regular fa-star"}
                                  style={{ color: (answer?.value || 0) >= r ? '#ffb300' : 'var(--text-muted)' }}
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {field.type === 'emoji_rating' && (
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {[
                              { val: 'sad', icon: 'fa-face-frown', color: '#ef4444', label: 'Memnun Değilim' },
                              { val: 'neutral', icon: 'fa-face-meh', color: '#f59e0b', label: 'Kararsızım' },
                              { val: 'happy', icon: 'fa-face-smile', color: '#10b981', label: 'Memnunum' },
                            ].map(item => {
                              const isActive = answer?.value === item.val
                              return (
                                <button
                                  key={item.val}
                                  type="button"
                                  onClick={() => updateAnswer(field.id, item.val)}
                                  title={item.label}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 4,
                                    background: isActive ? `${item.color}15` : 'var(--surface-2)',
                                    border: '2px solid',
                                    borderColor: isActive ? item.color : 'var(--border)',
                                    borderRadius: 12,
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    transform: isActive ? 'scale(1.08)' : 'none',
                                    color: isActive ? item.color : 'var(--text-muted)',
                                    minWidth: 80,
                                  }}
                                >
                                  <i className={`fa-solid ${item.icon}`} style={{ fontSize: '1.6rem', color: isActive ? item.color : 'var(--text-muted)' }} />
                                  <span style={{ fontSize: '.68rem', fontWeight: 700 }}>{item.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {field.type === 'slider' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 280 }}>
                            <input
                              type="range"
                              min="1"
                              max="10"
                              value={answer?.value ?? 5}
                              onChange={e => updateAnswer(field.id, Number(e.target.value))}
                              style={{
                                flex: 1,
                                height: 6,
                                accentColor: '#8b5cf6',
                                borderRadius: 3,
                                cursor: 'pointer',
                              }}
                            />
                            <span style={{
                              minWidth: 44,
                              textAlign: 'center',
                              fontSize: '.85rem',
                              fontWeight: 800,
                              background: 'rgba(139,92,246,0.12)',
                              color: '#8b5cf6',
                              padding: '2px 8px',
                              borderRadius: 6,
                              border: '1px solid rgba(139,92,246,0.2)'
                            }}>
                              {answer?.value ?? 5} / 10
                            </span>
                          </div>
                        )}

                        {field.type === 'nps' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                            <div className="nps-buttons-wrapper">
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => {
                                const isActive = answer?.value === val
                                const isDetractor = val <= 6
                                const isPassive = val === 7 || val === 8
                                const activeColor = isDetractor ? '#ef4444' : (isPassive ? '#f59e0b' : '#10b981')
                                
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => updateAnswer(field.id, val)}
                                    style={{
                                      width: 28,
                                      height: 28,
                                      borderRadius: 6,
                                      border: '1.5px solid',
                                      borderColor: isActive ? activeColor : 'var(--border)',
                                      background: isActive ? `${activeColor}22` : 'var(--surface-2)',
                                      color: isActive ? activeColor : 'var(--text-strong)',
                                      fontWeight: 800,
                                      fontSize: '.75rem',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                  >
                                    {val}
                                  </button>
                                )
                              })}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.64rem', color: 'var(--text-muted)', fontWeight: 600, padding: '0 2px' }}>
                              <span>Hiç Tavsiye Etmem (0)</span>
                              <span>Kesinlikle Tavsiye Ederim (10)</span>
                            </div>
                          </div>
                        )}

                        {(field.type === 'number' || field.type === 'temperature') && (
                          <input
                            type="number"
                            value={answer?.value ?? ''}
                            onChange={e => updateAnswer(field.id, e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder={field.type === 'temperature' ? 'Sıcaklık' : 'Sayı'}
                            className="f-input"
                            style={{ width: 100, padding: '6px 10px', fontSize: '.8rem' }}
                          />
                        )}

                        {field.type === 'text' && (
                          <textarea
                            value={answer?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            placeholder="Açıklama girin..."
                            rows={1}
                            className="f-input"
                            style={{ minWidth: 200, maxWidth: 300, padding: '6px 10px', fontSize: '.8rem', resize: 'vertical' }}
                          />
                        )}

                        {field.type === 'select' && (
                          <div className="sel-wrap" style={{ width: 150 }}>
                            <select
                              value={answer?.value || ''}
                              onChange={e => updateAnswer(field.id, e.target.value)}
                              className="f-input"
                              style={{ padding: '6px 10px', fontSize: '.8rem' }}
                            >
                              <option value="">Seçiniz</option>
                              {(field.options || []).map((opt, i) => {
                                const val = typeof opt === 'object' ? opt.label : opt
                                return <option key={i} value={val}>{val}</option>
                              })}
                            </select>
                          </div>
                        )}

                        {field.type === 'date' && (
                          <input
                            type="date"
                            value={answer?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            className="f-input"
                            style={{ width: 150, padding: '6px 10px', fontSize: '.8rem' }}
                          />
                        )}

                        {field.type === 'stock_item_select' && (
                          <SearchableMultiSelect 
                            items={stockItems}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Stok Malı Seçin..."
                          />
                        )}

                        {field.type === 'sale_item_select' && (
                          <SearchableMultiSelect 
                            items={saleItems}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Satış Malı Seçin..."
                          />
                        )}

                        {field.type === 'semi_product_select' && (
                          <SearchableMultiSelect 
                            items={semiItems}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Yarı Mamul Seçin..."
                          />
                        )}

                        {field.type === 'branch_select' && (
                          <SearchableMultiSelect 
                            items={branches}
                            selectedList={answer?.value || []}
                            onChange={val => updateAnswer(field.id, val)}
                            placeholder="Şube Seçin..."
                          />
                        )}

                        {field.type === 'equipment_select' && (() => {
                          const targetBranch = metaBranchId || branchId
                          const filtered = (equipments || []).filter(eq => {
                            if (!targetBranch) return true
                            return String(eq.current_location_id) === String(targetBranch)
                          })
                          const options = filtered.map(eq => {
                            const name = eq.name || eq.definition_name || 'İsimsiz Ekipman'
                            const label = eq.serial_number ? `${name} (${eq.serial_number})` : name
                            return { value: eq.id, label }
                          })
                          return (
                            <div style={{ minWidth: 200, maxWidth: 300 }}>
                              <SearchableSelect
                                value={answer?.value || ''}
                                onChange={val => updateAnswer(field.id, val)}
                                options={options}
                                placeholder="Ekipman Seçiniz..."
                                searchPlaceholder="Ekipman ara..."
                                noResultsLabel="Bu şubede ekipman bulunamadı"
                                allowClear={true}
                              />
                            </div>
                          )
                        })()}

                        {field.type === 'financial_input' && (() => {
                          const valObj = answer?.value ? (typeof answer.value === 'object' ? answer.value : JSON.parse(answer.value)) : { amount: '', currency: 'TRY' }
                          return (
                            <div style={{ display: 'flex', gap: 6, width: 220 }}>
                              <input
                                type="number"
                                value={valObj.amount || ''}
                                onChange={e => {
                                  const amt = e.target.value === '' ? '' : Number(e.target.value)
                                  updateAnswer(field.id, { ...valObj, amount: amt })
                                }}
                                placeholder="Tutar"
                                className="f-input"
                                style={{ flex: 2, padding: '6px 10px', fontSize: '.8rem' }}
                              />
                              <div className="sel-wrap" style={{ flex: 1.2 }}>
                                <select
                                  value={valObj.currency || 'TRY'}
                                  onChange={e => {
                                    updateAnswer(field.id, { ...valObj, currency: e.target.value })
                                  }}
                                  className="f-input"
                                  style={{ padding: '6px 10px', fontSize: '.8rem' }}
                                >
                                  <option value="TRY">TRY</option>
                                  <option value="USD">USD</option>
                                  <option value="EUR">EUR</option>
                                </select>
                              </div>
                            </div>
                          )
                        })()}

                        {field.type === 'photo' && (() => {
                          const isUploading = !!uploadingFields[field.id]
                          const photoUrl = answer?.value

                          if (isUploading) {
                            return (
                              <div style={{ padding: '6px 12px', border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                                <i className="fa-solid fa-spinner fa-spin" style={{ color: '#8b5cf6' }} />
                                <span style={{ fontSize: '.75rem' }}>Yükleniyor...</span>
                              </div>
                            )
                          }

                          if (photoUrl) {
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                                <div style={{ width: 32, height: 32, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                  <img src={buildApiUrl(photoUrl)} alt="Yüklenen" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <button
                                  type="button"
                                  className="btn-danger"
                                  onClick={() => updateAnswer(field.id, '')}
                                  style={{ padding: '4px 8px', fontSize: '.72rem' }}
                                >
                                  Sil
                                </button>
                              </div>
                            )
                          }

                          return (
                            <label style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px', 
                              border: '1px dashed var(--border)', 
                              borderRadius: 8, 
                              color: 'var(--text-muted)', 
                              cursor: 'pointer',
                              background: 'var(--surface-2)',
                              fontSize: '.75rem',
                              fontWeight: 600
                            }}>
                              <i className="fa-solid fa-camera" style={{ color: '#8b5cf6' }} />
                              <span>Fotoğraf Yükle</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={e => handlePhotoUpload(field.id, e.target.files?.[0])}
                                style={{ display: 'none' }}
                              />
                            </label>
                          )
                        })()}

                        {field.type === 'file' && (() => {
                          const isUploading = !!uploadingFields[field.id]
                          const fileUrl = answer?.value

                          if (isUploading) {
                            return (
                              <div style={{ padding: '6px 12px', border: '1px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                                <i className="fa-solid fa-spinner fa-spin" style={{ color: '#8b5cf6' }} />
                                <span style={{ fontSize: '.75rem' }}>Yükleniyor...</span>
                              </div>
                            )
                          }

                          if (fileUrl) {
                            const parts = String(fileUrl).split('/')
                            const dispName = parts[parts.length - 1] || 'Dosya'
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                                <i className="fa-solid fa-file-pdf" style={{ color: '#ef4444', fontSize: '1.2rem' }} />
                                <span style={{ fontSize: '.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dispName}</span>
                                <button
                                  type="button"
                                  className="btn-danger"
                                  onClick={() => updateAnswer(field.id, '')}
                                  style={{ padding: '4px 8px', fontSize: '.72rem' }}
                                >
                                  Sil
                                </button>
                              </div>
                            )
                          }

                          return (
                            <label style={{ 
                              display: 'inline-flex', 
                              alignItems: 'center',
                              gap: 6,
                              padding: '6px 12px', 
                              border: '1px dashed var(--border)', 
                              borderRadius: 8, 
                              color: 'var(--text-muted)', 
                              cursor: 'pointer',
                              background: 'var(--surface-2)',
                              fontSize: '.75rem',
                              fontWeight: 600
                            }}>
                              <i className="fa-solid fa-paperclip" style={{ color: '#8b5cf6' }} />
                              <span>Dosya Yükle</span>
                              <input
                                type="file"
                                onChange={e => handlePhotoUpload(field.id, e.target.files?.[0])}
                                style={{ display: 'none' }}
                              />
                            </label>
                          )
                        })()}

                        {field.type === 'time' && (
                          <input
                            type="time"
                            value={answer?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            className="f-input"
                            style={{ width: 120, padding: '6px 10px', fontSize: '.8rem' }}
                          />
                        )}

                        {field.type === 'expense_account_select' && (
                          <div style={{ minWidth: 200, maxWidth: 300 }}>
                            <SearchableSelect
                              value={answer?.value || ''}
                              onChange={val => updateAnswer(field.id, val)}
                              options={expenseAccountOptions}
                              placeholder="Gider Hesabı Seçiniz..."
                              searchPlaceholder="Hesap ara..."
                              noResultsLabel="Gider hesabı bulunamadı"
                              allowClear={true}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Note input field (inside the same box border) */}
                    {(activeNotes[field.id] || answer?.note) && (
                      <div style={{ marginTop: 4 }}>
                        <textarea
                          value={answer?.note || ''}
                          onChange={e => updateNote(field.id, e.target.value)}
                          placeholder="Bu değerlendirme satırı için not giriniz..."
                          rows={2}
                          className="f-input"
                          style={{ fontSize: '.78rem', background: 'var(--surface-3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', width: '100%' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}



        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-o" onClick={() => setShowFillForm(false)}>İptal</button>
          <button className="btn-p" onClick={handleSubmitForm} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-paper-plane" /> Gönder
          </button>
        </div>
      </div>
    </>
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

      {/* Quick Fill Searchable Select */}
      {(() => {
        const queryFormType = searchParams.get('type')
        const activeTemplates = templates.filter(t => {
          if (!t.active || t.deleted_at) return false
          if (queryFormType && t.form_type !== queryFormType) return false
          if (scope === 'admin') return true
          const allowed = t.allowed_contexts || ['center', 'branch', 'warehouse']
          return allowed.includes(scope)
        })
        if (activeTemplates.length === 0) return null
        const templateOptions = activeTemplates.map(t => {
          const typeInfo = FORM_TYPE_MAP[t.form_type] || { label: 'Form', icon: 'fa-file' }
          return {
            value: t.id,
            label: t.title,
            meta: typeInfo.label,
            icon: typeInfo.icon,
          }
        })
        return (
          <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <i className="fa-solid fa-pen-to-square" /> Yeni Form Doldur:
            </span>
            <div style={{ flex: '1 1 280px', maxWidth: '100%' }}>
              <SearchableSelect
                value=""
                onChange={val => val && startFillForm(val)}
                options={templateOptions}
                placeholder="Doldurulacak form şablonunu seçin..."
                searchPlaceholder="Form şablonu ara..."
                allowClear={false}
              />
            </div>
          </div>
        )
      })()}



      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="sel-wrap">
          <select
            value={filter.templateId}
            onChange={e => setFilter(p => ({ ...p, templateId: e.target.value }))}
            className="f-input"
            style={{ width: 'auto', minWidth: 160 }}
          >
            <option value="">Tüm Şablonlar</option>
            {templates
              .filter(t => scope === 'admin' || (t.allowed_contexts || ['center', 'branch', 'warehouse']).includes(scope))
              .map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '0 10px', height: 38 }}>
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Başlangıç:</span>
          <input
            type="date"
            value={filter.startDate}
            onChange={e => setFilter(p => ({ ...p, startDate: e.target.value }))}
            style={{ border: 'none', background: 'transparent', fontSize: '.8rem', color: '#0f172a', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1.5px solid #cbd5e1', borderRadius: 8, padding: '0 10px', height: 38 }}>
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>Bitiş:</span>
          <input
            type="date"
            value={filter.endDate}
            onChange={e => setFilter(p => ({ ...p, endDate: e.target.value }))}
            style={{ border: 'none', background: 'transparent', fontSize: '.8rem', color: '#0f172a', outline: 'none' }}
          />
        </div>
        {(filter.startDate || filter.endDate) && (
          <button
            type="button"
            className="btn-o"
            onClick={() => setFilter(p => ({ ...p, startDate: '', endDate: '' }))}
            style={{ padding: '0 12px', height: 38, fontSize: '.75rem' }}
          >
            Tarihleri Temizle
          </button>
        )}
        <button
          type="button"
          className="btn-p"
          onClick={() => setShowReportModal(true)}
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 38, fontSize: '.8rem' }}
        >
          <i className="fa-solid fa-chart-line" /> Rapor Al
        </button>
      </div>

      <div>
        {/* Submission List */}
        <div style={{ width: '100%' }}>
          {loading ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-file-lines" style={{ fontSize: '2rem', marginBottom: 12, display: 'block', opacity: .4 }} />
              <div style={{ fontWeight: 700 }}>Eşleşen yanıt yok</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filteredSubmissions.map(sub => {
                const tpl = templates.find(t => t.id === sub.template_id)
                const isInspection = tpl?.form_type === 'inspection'
                const isCriticalFailed = isInspection && !!sub.metadata?.failed_critical
                const status = STATUS_MAP[sub.status] || STATUS_MAP.draft
                const isSelected = selectedSub?.id === sub.id
                const isAnomaly = isInspection && sub.status === 'anomaly'
                
                const badgeLabel = isCriticalFailed ? 'Kabul Edilemez' : status.label
                const badgeColor = isCriticalFailed ? '#ef4444' : status.color
                const badgeBg = isCriticalFailed ? 'rgba(239,68,68,.15)' : status.bg
                const scoreColor = isCriticalFailed ? '#ef4444' : ((Number(sub.score_percentage) || 0) >= 70 ? '#10b981' : '#ef4444')

                return (
                  <div
                    key={sub.id}
                    className="card"
                    style={{
                      padding: 14, cursor: 'pointer',
                      borderColor: isSelected ? '#22d3ee' : isCriticalFailed ? 'rgba(239,68,68,.5)' : isAnomaly ? 'rgba(239,68,68,.3)' : undefined,
                      background: isSelected ? 'rgba(34,211,238,.06)' : isCriticalFailed ? 'rgba(239,68,68,.03)' : isAnomaly ? 'rgba(239,68,68,.03)' : undefined,
                    }}
                    onClick={() => openDetail(sub.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Score Circle / Checklist Icon */}
                      {(() => {
                        const hasScoring = tpl?.form_type === 'inspection'
                        const typeInfo = FORM_TYPE_MAP[tpl?.form_type] || { label: 'Form', icon: 'fa-file' }
                        return (
                          <div style={{
                            width: 44, height: 44, borderRadius: 12, border: '2px solid',
                            borderColor: !hasScoring ? '#8b5cf6' : scoreColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, flexDirection: 'column',
                            background: !hasScoring ? 'rgba(139,92,246,0.06)' : undefined
                          }}>
                            {!hasScoring ? (
                              <i className={`fa-solid ${typeInfo.icon}`} style={{ color: '#8b5cf6', fontSize: '1.1rem' }} />
                            ) : (
                              <>
                                <div style={{ fontSize: '.85rem', fontWeight: 900, color: scoreColor }}>
                                  {sub.score_percentage != null ? Math.round(sub.score_percentage) : '—'}
                                </div>
                                <div style={{ fontSize: '.5rem', color: 'var(--text-muted)' }}>%</div>
                              </>
                            )}
                          </div>
                        )
                      })()}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-strong)' }}>{getTemplateName(sub.template_id)}</span>
                          <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: badgeBg, color: badgeColor }}>
                            {badgeLabel}
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
      </div>

      {/* Modal Detail Panel – Premium Redesign */}
      {selectedSub && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,15,35,0.65)', backdropFilter: 'blur(10px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setSelectedSub(null) }}
        >
          <div style={{
            width: '100%', maxWidth: 920, maxHeight: '94vh',
            display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden',
            background: 'var(--surface)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            {detailLoading ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-muted)', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.6rem', color: '#8b5cf6' }} />
                <span style={{ fontSize: '.9rem', fontWeight: 600 }}>Yükleniyor...</span>
              </div>
            ) : (() => {
              const template = templates.find(t => t.id === selectedSub.template_id)
              const hasScoring = template?.form_type === 'inspection'
              const isCritical = hasScoring && !!selectedSub.metadata?.failed_critical
              const scoreNum = Number(selectedSub.score_percentage) || 0
              const isGood = hasScoring && !isCritical && scoreNum >= 70
              const hasAnomaly = hasScoring && (selectedSub.metadata?.anomalies?.length || 0) > 0
              const accentColor = !hasScoring ? '#8b5cf6' : (isCritical ? '#ef4444' : (isGood ? '#10b981' : '#f59e0b'))
              const gradientBg = !hasScoring
                ? 'linear-gradient(135deg, #120c1f 0%, #1e1336 50%, #120c1f 100%)'
                : isCritical
                  ? 'linear-gradient(135deg, #1a0808 0%, #2d0f0f 50%, #1e0a0a 100%)'
                  : isGood
                    ? 'linear-gradient(135deg, #071a12 0%, #0d2e1e 50%, #091a12 100%)'
                    : 'linear-gradient(135deg, #1a1208 0%, #2d2010 50%, #1a1208 100%)'
              return (
                <>
                  {/* ── HERO HEADER ── */}
                  <div style={{ background: gradientBg, padding: '28px 32px 24px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                    {/* Decorative orb */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: accentColor, opacity: 0.07, filter: 'blur(60px)', pointerEvents: 'none' }} />
                    <div style={{ position: 'absolute', bottom: -30, left: '30%', width: 120, height: 120, borderRadius: '50%', background: '#8b5cf6', opacity: 0.05, filter: 'blur(40px)', pointerEvents: 'none' }} />

                    {/* Close button */}
                    <button
                      onClick={() => setSelectedSub(null)}
                      style={{ position: 'absolute', top: 18, right: 20, width: 32, height: 32, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.9rem', transition: 'all 0.2s' }}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
                      {/* Score Ring / Checklist Icon */}
                      {(() => {
                        const hasScoring = template?.form_type === 'inspection'
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
                                {selectedSub.score_percentage != null ? Math.round(selectedSub.score_percentage) : '—'}
                              </div>
                              <div style={{ fontSize: '.65rem', color: accentColor, fontWeight: 700, opacity: 0.8 }}>PUAN%</div>
                            </div>
                            <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 6, fontWeight: 600 }}>
                              {selectedSub.total_score ?? '—'}/{selectedSub.max_possible_score ?? '—'} p
                            </div>
                          </div>
                        )
                      })()}

                      {/* Title area */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.7rem', fontWeight: 700, color: `${accentColor}cc`, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                          {getTemplateName(selectedSub.template_id)}
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: 10 }}>
                          {selectedSub.metadata?.branch_name || selectedSub.metadata?.inspector_name || selectedSub.metadata?.creator_name || 'Detay Görünümü'}
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
                            {selectedSub.metadata?.form_date
                              ? new Date(selectedSub.metadata.form_date).toLocaleDateString('tr-TR')
                              : new Date(selectedSub.created_at).toLocaleDateString('tr-TR')}
                          </span>
                          {/* Time badge */}
                          {selectedSub.metadata?.start_time && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <i className="fa-regular fa-clock" />
                              {template?.form_type === 'notification_form' ? selectedSub.metadata.start_time : `${selectedSub.metadata.start_time} – ${selectedSub.metadata.end_time || '?'}`}
                            </span>
                          )}
                          {/* Duration */}
                          {selectedSub.completion_time_seconds && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 99, fontSize: '.72rem', fontWeight: 600, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <i className="fa-solid fa-stopwatch" />
                              {Math.round(selectedSub.completion_time_seconds / 60)} dk
                            </span>
                          )}
                          {selectedSub.is_offline_submission && (
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
                        {selectedSub.metadata?.failed_critical_fields?.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
                            {selectedSub.metadata.failed_critical_fields.map((f, fi) => (
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
                        {selectedSub.metadata.anomalies.map((a, i) => (
                          <div key={i} style={{ fontSize: '.76rem', color: '#f59e0b', marginTop: 4 }}>• {a.message}</div>
                        ))}
                      </div>
                    )}

                    {/* Metadata Grid */}
                    {(selectedSub.metadata?.inspector_name || selectedSub.metadata?.creator_name) && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                        {[
                          { 
                            icon: 'fa-user-shield', 
                            label: template?.form_type === 'notification_form' ? 'Bildiren' : (template?.form_type === 'checklist' ? 'Formu Dolduran' : 'Denetleyen'), 
                            value: selectedSub.metadata.inspector_name || selectedSub.metadata.creator_name, 
                            color: template?.form_type === 'notification_form' ? '#f59e0b' : '#8b5cf6' 
                          },
                          { 
                            icon: 'fa-building', 
                            label: template?.form_type === 'notification_form' ? 'Bildirim Noktası' : 'Denetim Noktası', 
                            value: selectedSub.metadata.branch_name || '—', 
                            color: '#22d3ee' 
                          },
                          ...(template?.form_type === 'inspection' ? [
                            { 
                              icon: 'fa-user-tie', 
                              label: 'Denetim Sırasındaki Yetkili', 
                              value: selectedSub.metadata.shift_officer_name || selectedSub.metadata.branch_authorized_name || '—', 
                              color: '#10b981', 
                              extra: (selectedSub.metadata.shift_officer_name || selectedSub.metadata.branch_authorized_name) 
                                ? (
                                  (selectedSub.metadata.shift_officer_name ? selectedSub.metadata.send_to_shift_officer : selectedSub.metadata.send_to_authorized)
                                    ? '✓ Gönderildi' 
                                    : '✗ Gönderilmedi'
                                ) 
                                : null, 
                              extraColor: (selectedSub.metadata.shift_officer_name ? selectedSub.metadata.send_to_shift_officer : selectedSub.metadata.send_to_authorized) 
                                ? '#10b981' 
                                : '#ef4444' 
                            }
                          ] : []),
                          { icon: 'fa-user', label: 'Gönderen (ID)', value: selectedSub.submitted_by, color: '#94a3b8' },
                          ...(selectedSub.repair_cost !== null && selectedSub.repair_cost !== undefined ? [
                            { 
                              icon: 'fa-calculator', 
                              label: 'Kapatma Maliyeti', 
                              value: `${parseFloat(selectedSub.repair_cost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${selectedSub.repair_currency || 'TRY'} (Kur: ${parseFloat(selectedSub.repair_exchange_rate || 1.0).toFixed(4)})`, 
                              color: '#f59e0b' 
                            }
                          ] : []),
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

                    {/* Photos */}
                    {selectedSub.photos?.length > 0 && (
                      <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                          <i className="fa-solid fa-camera" style={{ marginRight: 6 }} /> Fotoğraflar ({selectedSub.photos.length})
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {selectedSub.photos.map(p => (
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
                    {selectedSub.answers_json && (() => {
                      const template = templates.find(t => t.id === selectedSub.template_id)
                      return (
                        <div>
                          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa-solid fa-list-check" /> Soru & Yanıt Detayları
                          </div>
                          {template?.schema_json?.sections ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {template.schema_json.sections.map((section, sIdx) => {
                                const sectionAnswers = (Array.isArray(selectedSub.answers_json) ? selectedSub.answers_json : []).filter(ans =>
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
                                    if (ans && ans.value !== undefined && ans.value !== null && ans.value !== '') {
                                      const fScore = calculateFieldScore(field, ans.value)
                                      sectionScoredPoints += fScore !== null ? fScore : 0
                                    }
                                  }
                                }
                                const sectionPercentage = sectionMaxPoints > 0 ? Math.round((sectionScoredPoints / sectionMaxPoints) * 100) : 0

                                return (
                                  <div key={section.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                    {/* Section Header */}
                                    <div style={{ padding: '10px 16px', background: 'linear-gradient(90deg, rgba(139,92,246,0.12) 0%, rgba(139,92,246,0.04) 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                      <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#8b5cf6' }}>
                                        <i className="fa-solid fa-layer-group" style={{ marginRight: 6, opacity: 0.7 }} />{sIdx + 1}. {section.title}
                                      </span>
                                      {template?.form_type === 'inspection' && sectionMaxPoints > 0 && (
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
                                        if (field.type === 'equipment_select') {
                                          const eq = equipments.find(e => String(e.id) === String(ans.value))
                                          const name = eq ? (eq.name || eq.definition_name || 'İsimsiz Ekipman') : ''
                                          displayValue = eq ? `${name} (${eq.serial_number || 'Seri No Yok'})` : (ans.value || '—')
                                        }
                                        if (field.type === 'financial_input') {
                                          try {
                                            const valObj = ans.value ? (typeof ans.value === 'object' ? ans.value : JSON.parse(ans.value)) : null
                                            if (valObj && valObj.amount !== undefined && valObj.amount !== '') {
                                              displayValue = `${Number(valObj.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${valObj.currency || 'TRY'}`
                                            } else {
                                              displayValue = '—'
                                            }
                                          } catch (e) {
                                            displayValue = String(ans.value || '—')
                                          }
                                        }
                                        if (field.type === 'date' && ans.value) {
                                          const parts = String(ans.value).split('-')
                                          if (parts.length === 3) {
                                            displayValue = `${parts[2]}.${parts[1]}.${parts[0]}`
                                          }
                                        }

                                        const isAnsNegative = selectedSub.metadata?.failed_critical_fields?.some(f => f.id === field.id)
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
                                                ) : field.type === 'file' && ans.value ? (
                                                  <a href={buildApiUrl(ans.value)} target="_blank" rel="noopener noreferrer" className="btn-o" style={{ padding: '4px 10px', fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <i className="fa-solid fa-file-pdf" /> Dosya İndir
                                                  </a>
                                                ) : field.type === 'expense_account_select' && ans.value ? (
                                                  <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-strong)' }}>
                                                    {expenseAccountOptions.find(opt => opt.value === ans.value)?.label || ans.value}
                                                  </span>
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
                                                {template?.form_type === 'inspection' && scoreText && (
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
                              {(Array.isArray(selectedSub.answers_json) ? selectedSub.answers_json : []).map((ans, i) => {
                                const field = template?.schema_json?.sections?.flatMap(s => s.fields || [])?.find(f => f.id === ans.field_id)
                                let displayValue = String(ans.value ?? '—')
                                if (ans.value === true) displayValue = 'Evet'
                                if (ans.value === false) displayValue = 'Hayır'
                                if (field && (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select')) {
                                  const items = getDynamicFieldItems(ans.value)
                                  displayValue = items.map(item => item.name).join(', ') || '—'
                                }
                                if (field && field.type === 'equipment_select') {
                                  const eq = equipments.find(e => String(e.id) === String(ans.value))
                                  displayValue = eq ? `${eq.name} (${eq.code})` : (ans.value || '—')
                                }
                                if (field && field.type === 'financial_input') {
                                  try {
                                    const valObj = ans.value ? (typeof ans.value === 'object' ? ans.value : JSON.parse(ans.value)) : null
                                    if (valObj && valObj.amount !== undefined && valObj.amount !== '') {
                                      displayValue = `${Number(valObj.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${valObj.currency || 'TRY'}`
                                    } else {
                                      displayValue = '—'
                                    }
                                  } catch (e) {
                                    displayValue = String(ans.value || '—')
                                  }
                                }
                                if (field && field.type === 'date' && ans.value) {
                                  const parts = String(ans.value).split('-')
                                  if (parts.length === 3) {
                                    displayValue = `${parts[2]}.${parts[1]}.${parts[0]}`
                                  }
                                }
                                const isAnsNegative = selectedSub.metadata?.failed_critical_fields?.some(f => f.id === ans.field_id)
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
                      )
                    })()}

                  </div>

                  {/* ── FOOTER ── */}
                  <div style={{ padding: '14px 28px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
                    <button
                      className="btn-p"
                      onClick={() => setShowPrintReport(selectedSub.id)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.8rem', padding: '8px 18px' }}
                    >
                      <i className="fa-solid fa-print" /> Raporu Yazdır / PDF
                    </button>
                    <button
                      onClick={() => setSelectedSub(null)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: '.8rem', padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600 }}
                    >
                      Kapat
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {showPrintReport && (
        <PrintReportOverlay
          submissionId={showPrintReport}
          templates={templates}
          employees={employees}
          onClose={() => setShowPrintReport(null)}
        />
      )}
    </div>
  )
}

function PrintReportOverlay({ submissionId, templates, employees, onClose }) {
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDetail() {
      setLoading(true)
      const { data, error } = await fetchFormSubmissionDetail(submissionId)
      if (!error && data) {
        setSubmission(data)
      }
      setLoading(false)
    }
    if (submissionId) loadDetail()
  }, [submissionId])

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--surface)', padding: 24, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-strong)' }}>
          <i className="fa-solid fa-spinner fa-spin" /> Rapor yükleniyor...
        </div>
      </div>
    )
  }

  if (!submission) return null

  const template = templates.find(t => t.id === submission.template_id)
  const isCriticalFailed = !!submission.metadata?.failed_critical
  const scoreColor = isCriticalFailed ? '#ef4444' : ((Number(submission.score_percentage) || 0) >= 70 ? '#10b981' : '#ef4444')
  
  const createdDateStr = new Date(submission.created_at).toLocaleString('tr-TR')

  return (
    <div className="no-print" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 99999, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-report-area, #print-report-area * {
            visibility: visible;
          }
          #print-report-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            background: #fff !important;
            color: #000 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Control bar */}
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontWeight: 800, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa-solid fa-file-invoice" style={{ color: '#8b5cf6' }} />
          {template?.form_type === 'checklist' ? 'Kontrol Listesi Önizleme' : (template?.form_type === 'notification_form' ? 'Bildirim Formu Önizleme' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'Anket Raporu Önizleme' : 'Denetim Raporu Önizleme'))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-p" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="fa-solid fa-print" /> Yazdır / PDF Kaydet
          </button>
          <button className="btn-o" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>

      {/* A4 Report Page Container */}
      <div id="print-report-area" style={{ background: '#fff', color: '#1e293b', width: '800px', margin: '30px auto', padding: '48px', borderRadius: '8px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', fontFamily: 'Inter, sans-serif' }}>
        
        {/* Header Block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #1e293b', paddingBottom: '16px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, letterSpacing: '1px', color: '#0f172a' }}>SUITABLE RMS</div>
            <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginTop: '2px' }}>DİNAMİK DENETİM VE HİJYEN YÖNETİM SİSTEMİ</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isCriticalFailed ? '#ef4444' : '#1e293b' }}>
              {isCriticalFailed ? 'KRİTİK HATA RAPORU' : (template?.form_type === 'checklist' ? 'KONTROL LİSTESİ' : (template?.form_type === 'notification_form' ? 'BİLDİRİM FORMU RAPORU' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'ANKET RAPORU' : 'DENETİM RAPORU')))}
            </div>
            <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '4px' }}>Tarih: {createdDateStr}</div>
          </div>
        </div>

        {/* Form Title & Summary */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>{template?.title || 'Form Raporu'}</h2>
          {template?.description && (
            <p style={{ fontSize: '.85rem', color: '#475569', margin: '6px 0 0', lineHeight: 1.5 }}>{template.description}</p>
          )}
        </div>

        {/* Score & Verdict Card */}
        {template?.form_type === 'inspection' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '32px' }}>
            <div style={{ border: '2px solid #e2e8f0', borderRadius: '8px', padding: '20px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>Denetim Skoru</div>
              <div style={{ fontSize: '3rem', fontWeight: 900, color: scoreColor, lineHeight: 1 }}>
                {submission.score_percentage != null ? Math.round(submission.score_percentage) : '—'}
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>%</span>
              </div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: '8px' }}>
                {submission.total_score} / {submission.max_possible_score} Toplam Puan
              </div>
            </div>

            <div style={{ border: '2px solid #e2e8f0', borderRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Denetim Değerlendirmesi</div>
              {isCriticalFailed ? (
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-circle-xmark" /> KABUL EDİLEMEZ
                  </div>
                  <p style={{ fontSize: '.8rem', color: '#64748b', margin: '4px 0 0', lineHeight: 1.4 }}>
                    Denetimde kritik öneme sahip sorularda olumsuz sonuç alındığı için başarı oranı gözetilmeksizlik genel sonuç doğrudan <strong>KABUL EDİLEMEZ (BAŞARISIZ)</strong> olarak değerlendirilmiştir.
                  </p>
                </div>
              ) : (Number(submission.score_percentage) || 0) >= (template?.scoring?.pass_threshold || 70) ? (
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-circle-check" /> UYGUN (GEÇTİ)
                  </div>
                  <p style={{ fontSize: '.8rem', color: '#64748b', margin: '4px 0 0', lineHeight: 1.4 }}>
                    Bu denetim başarı barajını (%{template?.scoring?.pass_threshold || 70}) aşarak standartlara uygun bir şekilde tamamlanmıştır.
                  </p>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-triangle-exclamation" /> YETERSİZ (KALDI)
                  </div>
                  <p style={{ fontSize: '.8rem', color: '#64748b', margin: '4px 0 0', lineHeight: 1.4 }}>
                    Denetim sonucu başarı barajının (%{template?.scoring?.pass_threshold || 70}) altında kaldığı için yetersiz olarak değerlendirilmiştir.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inspection Details Metadata Grid */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '.9rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
            {template?.form_type === 'notification_form' ? 'BİLDİRİM BİLGİLERİ' : (template?.form_type === 'checklist' ? 'CHECKLIST BİLGİLERİ' : 'DENETİM BİLGİLERİ')}
          </h3>
          
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569', width: '25%' }}>
                  {template?.form_type === 'notification_form' ? 'Bildirim Noktası:' : 'Denetim Noktası:'}
                </td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>{submission.metadata?.branch_name || '—'}</td>
                <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569', width: '25%' }}>
                  {template?.form_type === 'notification_form' ? 'Bildiren:' : (template?.form_type === 'checklist' ? 'Formu Dolduran:' : 'Denetleyen:')}
                </td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>{submission.metadata?.creator_name || submission.metadata?.inspector_name || submission.submitted_by}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569' }}>
                  {template?.form_type === 'notification_form' ? 'Bildirim Tarihi:' : 'Denetim Tarihi:'}
                </td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>
                  {submission.metadata?.form_date ? new Date(submission.metadata.form_date).toLocaleDateString('tr-TR') : '—'}
                </td>
                <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569' }}>
                  {template?.form_type === 'notification_form' ? 'Bildirim Saati:' : 'Süre / Saat:'}
                </td>
                <td style={{ padding: '8px 0', color: '#0f172a' }}>
                  {template?.form_type === 'notification_form' ? (submission.metadata?.start_time || '—') : `${submission.metadata?.start_time || '—'} - ${submission.metadata?.end_time || '—'}`}
                  {template?.form_type !== 'notification_form' && submission.completion_time_seconds && ` (${Math.round(submission.completion_time_seconds / 60)} dk)`}
                </td>
              </tr>
              {template?.form_type === 'inspection' && (
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569' }}>Denetim Sırasındaki Yetkili:</td>
                  <td style={{ padding: '8px 0', color: '#0f172a' }}>
                    {submission.metadata?.branch_authorized_name || '—'}
                    {submission.metadata?.branch_authorized_name && (
                      <span style={{ fontSize: '.7rem', color: submission.metadata.send_to_authorized ? '#10b981' : '#64748b', fontWeight: 700, marginLeft: '6px' }}>
                        ({submission.metadata.send_to_authorized ? 'Sonuç Gönder' : 'Gönderilmedi'})
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569' }}>Vardiya Görevlisi:</td>
                  <td style={{ padding: '8px 0', color: '#0f172a' }}>
                    {submission.metadata?.shift_officer_name || '—'}
                    {submission.metadata?.shift_officer_name && (
                      <span style={{ fontSize: '.7rem', color: submission.metadata.send_to_shift_officer ? '#10b981' : '#64748b', fontWeight: 700, marginLeft: '6px' }}>
                        ({submission.metadata.send_to_shift_officer ? 'Sonuç Gönder' : 'Gönderilmedi'})
                      </span>
                    )}
                  </td>
                </tr>
              )}
              {submission.repair_cost !== null && submission.repair_cost !== undefined && (
                <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569' }}>Kapatma Maliyeti:</td>
                  <td colSpan={3} style={{ padding: '8px 0', color: '#0f172a', fontWeight: 'bold' }}>
                    {parseFloat(submission.repair_cost).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {submission.repair_currency || 'TRY'} 
                    <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 'normal', marginLeft: '12px' }}>
                      (Kur: {parseFloat(submission.repair_exchange_rate || 1.0).toFixed(4)})
                    </span>
                  </td>
                </tr>
              )}
              {submission.metadata?.branch_responsibles?.length > 0 && (
                <tr>
                  <td style={{ padding: '8px 0', fontWeight: 700, color: '#475569', verticalAlign: 'top' }}>Şube Sorumluları:</td>
                  <td colSpan={3} style={{ padding: '8px 0', color: '#0f172a' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {submission.metadata.branch_responsibles.map((r, ri) => (
                        <span key={ri} style={{ background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '.75rem' }}>
                          {r.name}
                          <span style={{ color: r.send_result ? '#10b981' : '#64748b', fontWeight: 800, marginLeft: '4px' }}>
                            ({r.send_result ? 'Gönder' : 'X'})
                          </span>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Failed Critical Questions Summary Block */}
        {isCriticalFailed && submission.metadata?.failed_critical_fields?.length > 0 && (
          <div style={{ border: '2px solid #ef4444', borderRadius: '8px', background: 'rgba(239,68,68,0.03)', padding: '16px', marginBottom: '32px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '.85rem', fontWeight: 800, color: '#ef4444', textTransform: 'uppercase' }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '6px' }} />
              BAŞARISIZ KRİTİK SORULAR
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '.8rem' }}>
              {submission.metadata.failed_critical_fields.map((f, fi) => (
                <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: 700 }}>
                  <span>•</span> {f.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Questionnaire Results Table */}
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ fontSize: '.9rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '16px' }}>
            {template?.form_type === 'checklist' ? 'KONTROL LİSTESİ SORULARI VE YANITLAR' : (template?.form_type === 'notification_form' ? 'BİLDİRİM FORMU SORULARI VE YANITLAR' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'ANKET SORULARI VE YANITLAR' : 'DENETİM SORULARI VE YANITLAR'))}
          </h3>

          {(template?.schema_json?.sections || []).map((section, sIdx) => {
            const sectionAnswers = (submission.answers_json || []).filter(ans => {
              return ans.section_id === section.id || section.fields?.some(f => f.id === ans.field_id)
            })

            if (sectionAnswers.length === 0) return null

            // Calculate section scored and max points
            let sectionScoredPoints = 0
            let sectionMaxPoints = 0
            for (const field of (section.fields || [])) {
              const fMax = Number(field.max_points) || 0
              if (fMax > 0) {
                sectionMaxPoints += fMax
                const ans = (submission.answers_json || []).find(a => a.field_id === field.id)
                if (ans && ans.value !== undefined && ans.value !== null && ans.value !== '') {
                  const fScore = calculateFieldScore(field, ans.value)
                  sectionScoredPoints += fScore !== null ? fScore : 0
                }
              }
            }
            const sectionPercentage = sectionMaxPoints > 0 ? Math.round((sectionScoredPoints / sectionMaxPoints) * 100) : 0

            return (
              <div key={section.id} style={{ marginBottom: '20px' }}>
                <h4 style={{ 
                  fontSize: '.85rem', 
                  fontWeight: 800, 
                  color: '#4f46e5', 
                  margin: '0 0 10px 0', 
                  textTransform: 'uppercase',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>{sIdx + 1}. {section.title}</span>
                  {template?.form_type === 'inspection' && sectionMaxPoints > 0 && (
                    <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 700 }}>
                      {sectionScoredPoints}/{sectionMaxPoints} <span style={{ color: '#4f46e5' }}>%{sectionPercentage}</span>
                    </span>
                  )}
                </h4>
                
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.8rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569' }}>Soru</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', width: template?.form_type !== 'inspection' ? '30%' : '20%' }}>Yanıt</th>
                      {template?.form_type === 'inspection' && (
                        <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569', width: '15%', textAlign: 'center' }}>Puan</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(section.fields || []).map((field) => {
                      const ans = (submission.answers_json || []).find(a => a.field_id === field.id)
                      if (!ans) return null

                      let displayValue = String(ans.value ?? '—')
                      if (ans.value === true) displayValue = field.type === 'checkbox' ? '☑' : 'Evet'
                      if (ans.value === false) displayValue = field.type === 'checkbox' ? '☐' : 'Hayır'
                      if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
                        const items = getDynamicFieldItems(ans.value)
                        displayValue = items.map(item => item.name).join(', ') || '—'
                      }
                      if (field.type === 'equipment_select') {
                        const eq = (equipments || []).find(e => String(e.id) === String(ans.value))
                        const name = eq ? (eq.name || eq.definition_name || 'İsimsiz Ekipman') : ''
                        displayValue = eq ? `${name} (${eq.serial_number || 'Seri No Yok'})` : (ans.value || '—')
                      }
                      if (field.type === 'financial_input') {
                        try {
                          const valObj = ans.value ? (typeof ans.value === 'object' ? ans.value : JSON.parse(ans.value)) : null
                          if (valObj && valObj.amount !== undefined && valObj.amount !== '') {
                            displayValue = `${Number(valObj.amount).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${valObj.currency || 'TRY'}`
                          } else {
                            displayValue = '—'
                          }
                        } catch (e) {
                          displayValue = String(ans.value || '—')
                        }
                      }
                      if (field.type === 'date' && ans.value) {
                        const parts = String(ans.value).split('-')
                        if (parts.length === 3) {
                          displayValue = `${parts[2]}.${parts[1]}.${parts[0]}`
                        }
                      }

                      const isNeg = submission.metadata?.failed_critical_fields?.some(f => f.id === field.id)
                      
                      let ptsAwarded = '0'
                      if (field.type === 'yes_no') {
                        ptsAwarded = (ans.value === true || ans.value === 'yes') ? String(field.max_points) : '0'
                      } else if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
                        const val = Number(ans.value) || 0
                        const divisor = field.type === 'rating' ? 5 : 10
                        ptsAwarded = String(Math.min((val / divisor) * field.max_points, field.max_points))
                      } else if (field.type === 'emoji_rating') {
                        if (ans.value === 'happy') {
                          ptsAwarded = String(field.max_points)
                        } else if (ans.value === 'neutral') {
                          ptsAwarded = String(field.max_points / 2)
                        } else {
                          ptsAwarded = '0'
                        }
                      } else if (field.type === 'temperature') {
                        const temp = Number(ans.value)
                        const inRange = temp >= Number(field.min_value) && temp <= Number(field.max_value)
                        ptsAwarded = inRange ? String(field.max_points) : '0'
                      } else if (field.type === 'select') {
                        const optionObj = (field.options || []).find(opt => (typeof opt === 'object' ? opt.label : opt) === ans.value)
                        if (optionObj && typeof optionObj === 'object' && 'points' in optionObj) {
                          ptsAwarded = String(optionObj.points)
                        } else {
                          ptsAwarded = ans.value ? String(field.max_points) : '0'
                        }
                      } else {
                        ptsAwarded = ans.value ? String(field.max_points) : '0'
                      }

                      return (
                        <tr key={field.id} style={{ borderBottom: '1px solid #e2e8f0', background: isNeg ? 'rgba(239, 68, 68, 0.02)' : 'transparent' }}>
                          <td style={{ padding: '8px 12px', color: '#0f172a', lineHeight: 1.4 }}>
                            {field.is_critical && (
                              <span style={{ color: '#ef4444', fontWeight: 800, marginRight: '6px' }}>[KRİTİK]</span>
                            )}
                            {field.label}
                            {ans.note && (
                              <div style={{ fontSize: '.72rem', color: '#475569', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', borderLeft: '2px solid #8b5cf6', marginTop: '4px', fontStyle: 'italic' }}>
                                Not: {ans.note}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 700, color: isNeg ? '#ef4444' : '#1e293b' }}>
                            {field.type === 'photo' && ans.value ? (
                              <a href={buildApiUrl(ans.value)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', width: 60, height: 60, borderRadius: 6, overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                                <img src={buildApiUrl(ans.value)} alt="Fotoğraf" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </a>
                            ) : field.type === 'file' && ans.value ? (
                              <a href={buildApiUrl(ans.value)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.75rem', color: '#4f46e5', textDecoration: 'underline' }}>
                                Belgeyi Aç
                              </a>
                            ) : field.type === 'expense_account_select' && ans.value ? (
                              <span>
                                {expenseAccountOptions.find(opt => opt.value === ans.value)?.label || ans.value}
                              </span>
                            ) : field.type === 'rating' && ans.value ? (
                              <span style={{ color: '#ffb300' }}>{'★'.repeat(Number(ans.value)) + '☆'.repeat(5 - Number(ans.value))}</span>
                            ) : field.type === 'rating_10' && ans.value ? (
                              <span style={{ color: '#ffb300' }}>{'★'.repeat(Number(ans.value)) + '☆'.repeat(10 - Number(ans.value))}</span>
                            ) : field.type === 'emoji_rating' && ans.value ? (
                              (() => {
                                const labels = { sad: '😢 Memnun Değilim', neutral: '😐 Kararsızım', happy: '😊 Memnunum' }
                                return labels[ans.value] || displayValue
                              })()
                            ) : field.type === 'slider' && ans.value ? (
                              `${ans.value} / 10`
                            ) : field.type === 'nps' && ans.value !== undefined ? (
                              `NPS: ${ans.value}`
                            ) : (
                              displayValue
                            )}
                          </td>
                          {template?.form_type === 'inspection' && (
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: isNeg ? '#ef4444' : '#475569' }}>
                              {ptsAwarded} / {field.max_points}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>

        {/* Photos section if exists */}
        {submission.photos?.length > 0 && (
          <div style={{ marginBottom: '40px', pageBreakInside: 'avoid' }}>
            <h3 style={{ fontSize: '.9rem', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '16px' }}>
              FOTOĞRAFLAR VE KANITLAR
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {submission.photos.map((p, pi) => (
                <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', background: '#f8fafc' }}>
                  <img src={buildApiUrl(p.file_url)} alt={`Kanıt ${pi+1}`} style={{ width: '150px', height: '110px', objectFit: 'cover', borderRadius: '4px', display: 'block' }} />
                  <div style={{ fontSize: '.65rem', color: '#64748b', marginTop: '4px', textAlign: 'center' }}>Soru ID: {p.field_id}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature Blocks */}
        <div style={{ marginTop: '56px', borderTop: '2px solid #e2e8f0', paddingTop: '24px', pageBreakInside: 'avoid' }}>
          <div style={{ display: 'grid', gridTemplateColumns: template?.form_type === 'inspection' ? '1fr 1fr' : '1fr', gap: '60px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '.85rem', fontWeight: 800, color: '#0f172a' }}>
                {template?.form_type === 'notification_form' ? 'BİLDİREN' : (template?.form_type === 'checklist' ? 'FORMU DOLDURAN' : 'DENETLEYEN')}
              </div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '2px' }}>{submission.metadata?.creator_name || submission.metadata?.inspector_name || submission.submitted_by}</div>
              <div style={{ borderBottom: '1px dashed #cbd5e1', height: '60px', width: '200px', margin: '10px auto' }}></div>
              <div style={{ fontSize: '.7rem', color: '#94a3b8' }}>İmza / Tarih</div>
            </div>
            
            {template?.form_type === 'inspection' && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: '#0f172a' }}>DENETİM SIRASINDAKİ YETKİLİ</div>
                <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: '2px' }}>{submission.metadata?.shift_officer_name || submission.metadata?.branch_authorized_name || 'Denetim Sırasındaki Yetkili'}</div>
                <div style={{ borderBottom: '1px dashed #cbd5e1', height: '60px', width: '200px', margin: '10px auto' }}></div>
                <div style={{ fontSize: '.7rem', color: '#94a3b8' }}>İmza / Tarih</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
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
    const optionObj = (field.options || []).find(opt => {
      const label = typeof opt === 'object' ? opt.label : opt
      return String(label) === String(value)
    })
    if (optionObj && typeof optionObj === 'object' && 'points' in optionObj) {
      return Number(optionObj.points) || 0
    }
    return maxPoints
  }
  return value ? maxPoints : 0
}
