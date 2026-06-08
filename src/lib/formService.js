import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import { readSettingArray, PERSONNEL_SETTINGS_KEYS, normalizeEmployeeRecord } from '@/lib/personnelConfig'


// ─── Helpers ────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
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

// ─── Form Templates (Merkez-Only CRUD) ──────────────────────

export async function fetchFormTemplates({ formType, activeOnly = true } = {}) {
  let query = db.from('form_templates').select('*').is('deleted_at', null).order('created_at', { ascending: false })
  if (formType) query = query.eq('form_type', formType)
  if (activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  return { data: toArray(data), error }
}

export async function fetchFormTemplateDetail(templateId) {
  return db.from('form_templates').select('*').eq('id', templateId).maybeSingle()
}

export async function createFormTemplate({ title, description, formType = 'inspection', schemaJson, targetBranches = [], allowedContexts = ['center', 'branch', 'warehouse'], scoring = {}, recurrence, minCompletionSeconds, requireGeo = false, createdBy, requiresCostInput = false, linkedEntityTable = null }) {
  return db.from('form_templates').insert({
    title,
    description: description || null,
    form_type: formType,
    schema_json: schemaJson,
    target_branches: targetBranches,
    allowed_contexts: allowedContexts,
    scoring,
    requires_cost_input: requiresCostInput,
    linked_entity_table: linkedEntityTable,
    recurrence: recurrence || null,
    min_completion_seconds: minCompletionSeconds || null,
    require_geo: requireGeo,
    created_by: createdBy || null,
    updated_at: nowIso(),
  }).select().maybeSingle()
}

export async function updateFormTemplate(templateId, updates) {
  const payload = { ...updates, updated_at: nowIso() }
  // Prevent overwriting keys not explicitly provided
  if (!('schema_json' in updates)) delete payload.schema_json
  if (!('target_branches' in updates)) delete payload.target_branches
  if (!('allowed_contexts' in updates)) delete payload.allowed_contexts
  if (!('scoring' in updates)) delete payload.scoring
  if (!('requires_cost_input' in updates)) delete payload.requires_cost_input
  if (!('linked_entity_table' in updates)) delete payload.linked_entity_table
  return db.from('form_templates').update(payload).eq('id', templateId).select().maybeSingle()
}

export async function softDeleteFormTemplate(templateId) {
  return db.from('form_templates').update({ deleted_at: nowIso(), active: false, updated_at: nowIso() }).eq('id', templateId).select().maybeSingle()
}

// ─── Form Submissions ───────────────────────────────────────

export async function fetchFormSubmissions({ branchId, templateId, status, activeScope, limit = 100, offset = 0 } = {}) {
  let query = db.from('form_submissions').select('*').order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  if (templateId) query = query.eq('template_id', templateId)
  if (status) query = query.eq('status', status)
  
  if (activeScope === 'center' || activeScope === 'admin') {
    query = query.or('metadata->>creator_scope.is.null,metadata->>creator_scope.eq.center,metadata->>creator_scope.eq.admin')
  }

  query = query.range(offset, offset + limit - 1)
  const { data, error } = await query
  return { data: toArray(data), error }
}

export async function fetchFormSubmissionDetail(submissionId) {
  const [submissionResult, photosResult] = await Promise.all([
    db.from('form_submissions').select('*').eq('id', submissionId).maybeSingle(),
    db.from('form_submission_photos').select('*').eq('submission_id', submissionId).order('created_at'),
  ])
  if (submissionResult.error) return submissionResult

  return {
    data: {
      ...submissionResult.data,
      photos: toArray(photosResult.data),
    },
    error: null,
  }
}

// ─── Scoring Engine ─────────────────────────────────────────

export function scoreSubmission(schemaJson, answersJson) {
  const sections = toArray(schemaJson?.sections)
  const answersMap = new Map(toArray(answersJson).map(a => [a.field_id, a]))

  let totalScore = 0
  let maxPossibleScore = 0
  let failedCritical = false
  const failedCriticalFields = []

  for (const section of sections) {
    for (const field of toArray(section.fields)) {
      let maxPoints = Number(field.max_points) || 0
      if (field.type === 'select') {
        const hasPointWeights = toArray(field.options).some(opt => typeof opt === 'object' && 'points' in opt)
        if (hasPointWeights) {
          maxPoints = toArray(field.options).reduce((acc, opt) => acc + (typeof opt === 'object' ? (Number(opt.points) || 0) : 0), 0)
        }
      }
      if (maxPoints <= 0) continue
      maxPossibleScore += maxPoints

      const answer = answersMap.get(field.id)
      if (!answer) {
        if (field.is_critical) {
          failedCritical = true
          failedCriticalFields.push({ id: field.id, label: field.label || 'Bilinmeyen Soru' })
        }
        continue
      }

      let pointsAwarded = 0
      let isNegative = false

      if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
        const val = Number(answer.value) || 0
        const divisor = field.type === 'rating' ? 5 : 10
        pointsAwarded = Math.min((val / divisor) * maxPoints, maxPoints)
        const criticalThreshold = field.type === 'rating' ? 3 : 6
        if (field.is_critical && val < criticalThreshold) {
          isNegative = true
        }
      } else if (field.type === 'emoji_rating') {
        if (answer.value === 'happy') {
          pointsAwarded = maxPoints
        } else if (answer.value === 'neutral') {
          pointsAwarded = maxPoints / 2
        } else {
          pointsAwarded = 0
          if (field.is_critical) isNegative = true
        }
      } else if (field.type === 'yes_no') {
        const isYes = answer.value === true || answer.value === 'yes'
        pointsAwarded = isYes ? maxPoints : 0
        if (field.is_critical && !isYes) {
          isNegative = true
        }
      } else if (field.type === 'temperature') {
        const temp = Number(answer.value)
        const minVal = Number(field.min_value)
        const maxVal = Number(field.max_value)
        if (!isNaN(temp) && !isNaN(minVal) && !isNaN(maxVal)) {
          const inRange = temp >= minVal && temp <= maxVal
          pointsAwarded = inRange ? maxPoints : 0
          if (field.is_critical && !inRange) {
            isNegative = true
          }
        } else {
          pointsAwarded = 0
          if (field.is_critical) {
            isNegative = true
          }
        }
      } else if (field.type === 'number') {
        pointsAwarded = answer.value != null ? maxPoints : 0
        if (field.is_critical && (answer.value == null || answer.value === '')) {
          isNegative = true
        }
      } else if (field.type === 'select') {
        const selectedValue = answer.value
        if (selectedValue) {
          const optionObj = toArray(field.options).find(opt => {
            const label = typeof opt === 'object' ? opt.label : opt
            return String(label) === String(selectedValue)
          })
          if (optionObj && typeof optionObj === 'object' && 'points' in optionObj) {
            pointsAwarded = Number(optionObj.points) || 0
          } else {
            pointsAwarded = maxPoints
          }

          if (field.is_critical) {
            if (optionObj && typeof optionObj === 'object' && 'points' in optionObj) {
              if ((Number(optionObj.points) || 0) <= 0) {
                isNegative = true
              }
            } else {
              const negLabels = ['kirli', 'hayır', 'olumsuz', 'uygun değil', 'no', 'dirty', 'poor', 'bad']
              if (negLabels.includes(String(selectedValue).toLowerCase())) {
                isNegative = true
              }
            }
          }
        } else {
          pointsAwarded = 0
          if (field.is_critical) {
            isNegative = true
          }
        }
      } else if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
        const hasSelection = getDynamicFieldItems(answer.value).length > 0
        pointsAwarded = hasSelection ? maxPoints : 0
        if (field.is_critical && !hasSelection) {
          isNegative = true
        }
      } else {
        pointsAwarded = answer.value ? maxPoints : 0
        if (field.is_critical && !answer.value) {
          isNegative = true
        }
      }

      totalScore += pointsAwarded
      if (isNegative) {
        failedCritical = true
        failedCriticalFields.push({ id: field.id, label: field.label || 'Bilinmeyen Soru' })
      }
    }
  }

  const scorePercentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 10000) / 100 : 0

  return { totalScore, maxPossibleScore, scorePercentage, failedCritical, failedCriticalFields }
}

// ─── Anomaly Detection ──────────────────────────────────────

export function detectAnomalies(template, submission) {
  const anomalies = []
  if (template.form_type === 'checklist') return anomalies


  // Pencil-whipping: too fast completion
  if (template.min_completion_seconds && submission.completion_time_seconds) {
    if (submission.completion_time_seconds < template.min_completion_seconds) {
      anomalies.push({
        type: 'fast_completion',
        message: `Form ${submission.completion_time_seconds}s'de tamamlandı (minimum: ${template.min_completion_seconds}s)`,
      })
    }
  }

  // Score too low
  const passThreshold = Number(template.scoring?.pass_threshold) || 0
  if (passThreshold > 0 && submission.score_percentage != null) {
    if (submission.score_percentage < passThreshold) {
      anomalies.push({
        type: 'below_threshold',
        message: `Puan (${submission.score_percentage}%) eşiğin altında (${passThreshold}%)`,
      })
    }
  }

  return anomalies
}

// ─── Submit Form ────────────────────────────────────────────

export async function submitFormResponse({ templateId, branchId, submittedBy, answersJson, geoLatitude, geoLongitude, deviceTimestamp, completionTimeSeconds, isOffline = false, photos = [], metadata = {}, repairCost = null, repairCurrency = null, repairExchangeRate = null, linkedEntityId = null }) {
  // Load template for scoring
  const templateResult = await fetchFormTemplateDetail(templateId)
  if (templateResult.error || !templateResult.data) {
    return { data: null, error: templateResult.error || { message: 'Form şablonu bulunamadı' } }
  }
  const template = templateResult.data

  // Score the submission if it's an inspection form type
  const isInspection = template.form_type === 'inspection'
  const { totalScore, maxPossibleScore, scorePercentage, failedCritical, failedCriticalFields } = isInspection
    ? scoreSubmission(template.schema_json, answersJson)
    : { totalScore: null, maxPossibleScore: null, scorePercentage: null, failedCritical: false, failedCriticalFields: [] }

  // Determine status
  let status = 'completed'
  if (isOffline) status = 'syncing'

  // Merge failed critical flags into metadata
  const mergedMetadata = {
    ...(metadata || {}),
    failed_critical: isInspection ? (failedCritical || false) : false,
    failed_critical_fields: isInspection ? (failedCriticalFields || []) : []
  }

  // Insert submission
  const { data: submission, error } = await db.from('form_submissions').insert({
    template_id: templateId,
    branch_id: branchId,
    submitted_by: submittedBy,
    status,
    answers_json: answersJson,
    total_score: totalScore,
    max_possible_score: maxPossibleScore,
    score_percentage: scorePercentage,
    geo_latitude: geoLatitude || null,
    geo_longitude: geoLongitude || null,
    device_timestamp: deviceTimestamp || null,
    completion_time_seconds: completionTimeSeconds || null,
    is_offline_submission: isOffline,
    synced_at: isOffline ? null : nowIso(),
    linked_entity_id: linkedEntityId || null,
    repair_cost: repairCost || null,
    repair_currency: repairCurrency || null,
    repair_exchange_rate: repairExchangeRate || null,
    metadata: mergedMetadata,
  }).select().maybeSingle()

  if (error) return { data: null, error }

  // Upload photos
  if (photos.length > 0) {
    const photoRows = photos.map(photo => ({
      submission_id: submission.id,
      field_id: photo.field_id,
      file_url: photo.file_url,
      file_name: photo.file_name || null,
      captured_at: photo.captured_at || null,
      is_live_capture: photo.is_live_capture || false,
      metadata: photo.metadata || {},
    }))
    await db.from('form_submission_photos').insert(photoRows)
  }

  // Check for anomalies
  const anomalies = detectAnomalies(template, submission)
  const finalMetadata = { ...mergedMetadata, ...(anomalies.length > 0 ? { anomalies } : {}) }
  if (anomalies.length > 0 || Object.keys(finalMetadata).length > 0) {
    await db.from('form_submissions').update({
      status: anomalies.length > 0 ? 'anomaly' : status,
      metadata: finalMetadata,
    }).eq('id', submission.id)
    if (anomalies.length > 0) {
      submission.status = 'anomaly'
    }
  }
  submission.metadata = finalMetadata

  // Update linked maintenance ticket cost if applicable
  if (template.linked_entity_table === 'maintenance_tickets' && linkedEntityId) {
    try {
      await db.from('maintenance_tickets').update({
        repair_cost: repairCost || null,
        repair_currency: repairCurrency || null,
        repair_exchange_rate: repairExchangeRate || null,
        form_submission_id: submission.id,
        status: 'resolved', // auto-resolve ticket on form submission
        updated_at: nowIso()
      }).eq('id', linkedEntityId)
      console.log(`[formService] Successfully updated maintenance ticket ${linkedEntityId} with repair costs.`)
    } catch (err) {
      console.error(`[formService] Failed to update linked maintenance ticket ${linkedEntityId}:`, err)
    }
  }

  // Auto-create task
  let createdTaskId = null
  const taskConfig = template.schema_json?.task_config || {}
  
  if (template.form_type === 'customer_survey') {
    if (taskConfig.enabled !== false) {
      try {
        createdTaskId = await createTaskFromCustomerSurvey(template, submission, answersJson, { ...finalMetadata, branch_id: branchId })
      } catch (err) {
        console.error('Failed to auto-create customer survey task:', err)
      }
    }
    // Assign loyalty customer category if submitted from customer app
    if (metadata?.source === 'customer_app' && submittedBy && submittedBy !== 'anonymous') {
      try {
        fetch(buildApiUrl('/api/customer-category-assign'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId: submittedBy })
        }).catch(err => console.error('Failed to assign loyalty category:', err))
      } catch (err) {
        console.error('Failed to call loyalty category assignment API:', err)
      }
    }
  } else if (taskConfig.enabled) {
    try {
      createdTaskId = await createTaskFromNotification(template, submission, answersJson, { ...finalMetadata, branch_id: branchId })
    } catch (err) {
      console.error('Failed to auto-create task:', err)
    }
  } else if (template.form_type === 'inspection' && taskConfig.enabled === undefined) {
    // Legacy fallback for inspection forms that don't have task_config.enabled configured yet
    try {
      createdTaskId = await createTaskFromInspection(template, submission, answersJson, { ...finalMetadata, branch_id: branchId })
    } catch (err) {
      console.error('Failed to auto-create legacy inspection task:', err)
    }
  }

  return {
    data: {
      ...submission,
      scoreResult: { totalScore, maxPossibleScore, scorePercentage },
      anomalies,
      createdTaskId,
    },
    error: null,
  }
}

// ─── Inspection → Task auto-creation ────────────────────────

function calcFieldScore(field, value) {
  if (value === null || value === undefined || value === '') return null
  const maxPoints = Number(field.max_points) || 0
  if (maxPoints <= 0) return 0
  if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
    const divisor = field.type === 'rating' ? 5 : 10
    return Math.min((Number(value) || 0) / divisor * maxPoints, maxPoints)
  }
  if (field.type === 'emoji_rating') {
    if (value === 'happy') return maxPoints
    if (value === 'neutral') return maxPoints / 2
    return 0
  }
  if (field.type === 'yes_no' || field.type === 'checkbox') return (value === true || value === 'yes') ? maxPoints : 0
  if (field.type === 'temperature') {
    const temp = Number(value), minV = Number(field.min_value), maxV = Number(field.max_value)
    return (!isNaN(temp) && !isNaN(minV) && !isNaN(maxV) && temp >= minV && temp <= maxV) ? maxPoints : 0
  }
  if (field.type === 'number') return value != null ? maxPoints : 0
  if (field.type === 'select') {
    const opt = toArray(field.options).find(o => String(typeof o === 'object' ? o.label : o) === String(value))
    if (opt && typeof opt === 'object' && 'points' in opt) return Number(opt.points) || 0
    return maxPoints
  }
  if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
    return getDynamicFieldItems(value).length > 0 ? maxPoints : 0
  }
  return value ? maxPoints : 0
}

async function createTaskFromInspection(template, submission, answersJson, meta) {
  if (!meta?.branch_authorized_id && !meta?.shift_officer_id) return null // Atanacak kişi yok — görev oluşturma

  const formDate = meta.form_date
    ? new Date(meta.form_date).toLocaleDateString('tr-TR')
    : new Date().toLocaleDateString('tr-TR')
  const scorePercent = Math.round(submission.score_percentage || 0)
  const shiftOfficerName = meta.shift_officer_name || ''

  // Katılımcı listesi oluştur
  const participantText = shiftOfficerName
    ? `${shiftOfficerName} ile birlikte`
    : ''

  const description = `${formDate} tarihinde ${participantText} yapılan "${template.title}" denetiminde alınan %${scorePercent}'lik sonucun takibi için açılmıştır.\n\n[Form ID: ${submission.id}]`

  // Checklist: max puandan düşük alan sorular
  const checklistItems = []
  const answersMap = new Map(toArray(answersJson).map(a => [a.field_id, a]))
  for (const section of toArray(template.schema_json?.sections)) {
    for (const field of toArray(section.fields)) {
      const maxPoints = Number(field.max_points) || 0
      if (maxPoints <= 0) continue
      const answer = answersMap.get(field.id)
      const score = calcFieldScore(field, answer?.value)
      if (score !== null && score < maxPoints) {
        const noteText = answer?.note ? ` (Not: ${answer.note})` : ''
        checklistItems.push(`${field.label} — ${Math.round(score)}/${maxPoints} puan${noteText}`)
      }
    }
  }

  // Gözlemciler: "sonucu gönder" seçili sorumlular (şube yetkilisi hariç — o zaten assignee)
  const observerIds = toArray(meta.branch_responsibles)
    .filter(r => r.send_result && String(r.id) !== String(meta.branch_authorized_id))
    .map(r => r.id)

  // Collaborator: Vardiya sorumlusu
  const collaboratorIds = meta.shift_officer_id ? [meta.shift_officer_id] : []

  const now = new Date()
  const dueDate = new Date(now.getTime() + 72 * 60 * 60 * 1000) // +72 saat
  const branchNodeId = meta.branch_id || submission.branch_id || ''

  console.log('[Inspection→Task] Assignee:', meta.branch_authorized_id, '| Collaborators:', collaboratorIds, '| Observers:', observerIds, '| Checklist:', checklistItems.length)

  // ── 1) Task kaydı oluştur (doğrudan DB insert) ──
  const taskInsert = await db.from('tasks').insert({
    branch_node_id: branchNodeId || null,
    organization_node_id: null,
    created_by_personnel_id: submission.submitted_by,
    created_by_position_id: null,
    title: template.title,
    description,
    status: 'open',
    priority: 'high',
    due_at: dueDate.toISOString(),
    start_at: now.toISOString(),
    has_specific_time: false,
    timezone: 'Europe/Istanbul',
    is_recurring: false,
    recurrence_rule_id: null,
    delegation_allowed: true,
    approval_required: true,
    closure_summary_required: true,
    closure_file_required: true,
    closure_image_required: true,
    edit_due_date_allowed: false,
    edit_schedule_allowed: false,
    incomplete_if_late: true,
    updated_at: nowIso(),
  }).select().maybeSingle()

  if (taskInsert.error) {
    console.error('[Inspection→Task] Task insert error:', taskInsert.error)
    return null
  }
  const task = taskInsert.data
  console.log('[Inspection→Task] Task created:', task.id)

  // ── 2) Katılımcılar (doğrudan DB insert — employee lookup yok) ──
  const participantRows = []
  const addedIds = new Set()

  // Assignee: Şube yetkilisi
  if (meta.branch_authorized_id) {
    participantRows.push({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: meta.branch_authorized_id,
      position_id: null,
      node_id: branchNodeId || null,
    })
    addedIds.add(String(meta.branch_authorized_id))
  }

  // Collaborators: Vardiya sorumlusu
  for (const collabId of collaboratorIds) {
    if (!addedIds.has(String(collabId))) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'assignee',
        personnel_id: collabId,
        position_id: null,
        node_id: branchNodeId || null,
      })
      addedIds.add(String(collabId))
    }
  }

  // Watchers: Gözlemciler
  for (const watcherId of observerIds) {
    if (!addedIds.has(String(watcherId))) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'watcher',
        personnel_id: watcherId,
        position_id: null,
        node_id: branchNodeId || null,
      })
      addedIds.add(String(watcherId))
    }
  }

  if (participantRows.length) {
    const partResult = await db.from('task_participants').insert(participantRows).select()
    if (partResult.error) {
      console.error('[Inspection→Task] Participants insert error:', partResult.error)
    } else {
      console.log('[Inspection→Task] Participants created:', partResult.data?.length)
    }
  }

  // ── 3) Checklist ──
  if (checklistItems.length) {
    const checklistRows = checklistItems.map((text, idx) => ({
      task_id: task.id,
      text,
      sort_order: idx,
    }))
    const checkResult = await db.from('task_checklist_items').insert(checklistRows).select()
    if (checkResult.error) {
      console.error('[Inspection→Task] Checklist insert error:', checkResult.error)
    }
  }

  // ── 4) Chat thread ──
  const threadResult = await db.from('task_chat_threads').insert({ task_id: task.id }).select().maybeSingle()
  if (threadResult.error) {
    console.error('[Inspection→Task] Thread insert error:', threadResult.error)
  }

  // ── 5) System note ──
  if (threadResult.data?.id) {
    await db.from('task_history').insert({
      task_id: task.id,
      action: 'created',
      performed_by: submission.submitted_by,
      metadata: { title: task.title },
    })
    await db.from('task_chat_messages').insert({
      thread_id: threadResult.data.id,
      task_id: task.id,
      message_type: 'system',
      sender_id: null,
      body: `Denetim formundan otomatik oluşturuldu. Puan: %${scorePercent}`,
      metadata: { title: task.title, score: scorePercent },
    })
  }

  return task.id
}

async function createTaskFromNotification(template, submission, answersJson, meta) {
  const taskConfig = template.schema_json?.task_config || {}
  
  const subIdShort = submission.id ? submission.id.slice(0, 8) : '--------'
  const title = `${subIdShort} numaralı ${template.title || 'bildirim'} bildirim formu takip görevidir.`

  let formDateFormatted = ''
  if (meta && meta.form_date) {
    const parts = meta.form_date.split('-')
    if (parts.length === 3) {
      formDateFormatted = `${parts[2]}.${parts[1]}.${parts[0]}`
    } else {
      formDateFormatted = meta.form_date
    }
  } else {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    formDateFormatted = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  }

  const startTime = (meta && meta.start_time) || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const branchName = (meta && meta.branch_name) || 'İlgili'
  const creatorName = (meta && meta.creator_name) || 'Bilinmeyen Kullanıcı'
  const description = `${formDateFormatted} tarihi ${startTime} saatinde ${branchName} şubesinden ${creatorName} tarafından yaratılmıştır.\n\n[Form ID: ${submission.id}]`

  const now = new Date()
  const completionHours = Number(taskConfig.completion_hours) || 72
  const dueDate = new Date(now.getTime() + completionHours * 60 * 60 * 1000)
  const branchNodeId = meta.branch_id || submission.branch_id || ''

  const rules = taskConfig.rules || {}

  // 1) Task kaydı oluştur
  const taskInsert = await db.from('tasks').insert({
    branch_node_id: branchNodeId || null,
    organization_node_id: null,
    created_by_personnel_id: submission.submitted_by,
    created_by_position_id: null,
    title,
    description,
    status: 'open',
    priority: taskConfig.priority || 'normal',
    due_at: dueDate.toISOString(),
    start_at: now.toISOString(),
    has_specific_time: false,
    timezone: 'Europe/Istanbul',
    is_recurring: false,
    recurrence_rule_id: null,
    delegation_allowed: !!rules.delegation_allowed,
    approval_required: !!rules.approval_required,
    closure_summary_required: !!rules.closure_summary_required,
    closure_file_required: !!rules.closure_file_required,
    closure_image_required: !!rules.closure_image_required,
    edit_due_date_allowed: !!rules.edit_due_date_allowed,
    edit_schedule_allowed: !!rules.edit_schedule_allowed,
    incomplete_if_late: !!rules.incomplete_if_late,
    requires_cost_input: !!rules.requires_cost_input,
    linked_entity_table: template.linked_entity_table || null,
    linked_entity_id: submission.linked_entity_id || null,
    updated_at: nowIso(),
  }).select().maybeSingle()

  if (taskInsert.error) {
    console.error('[Notification→Task] Task insert error:', taskInsert.error)
    return null
  }
  const task = taskInsert.data
  console.log('[Notification→Task] Task created:', task.id)

  // 2) Katılımcıları (Assignees/Collaborators/Watchers) Belirle
  const participantRows = []
  
  let allEmployees = []
  try {
    allEmployees = await readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord)
  } catch (err) {
    console.error('[Notification→Task] Error reading employees:', err)
  }

  const worksAtBranch = (emp, branchId) => {
    if (!branchId) return true
    const bid = String(branchId)
    const defaultBranch = String(emp.defaultBranchId || '')
    const workingBranches = Array.isArray(emp.workingBranchIds) ? emp.workingBranchIds.map(String) : []
    const managedBranches = Array.isArray(emp.managedBranchIds) ? emp.managedBranchIds.map(String) : []
    return defaultBranch === bid || workingBranches.includes(bid) || managedBranches.includes(bid)
  }

  const assigneeIds = new Set()
  const collaboratorIds = new Set()
  const watcherIds = new Set()

  // Auto collaborator: Vardiya Sorumlusu (Şube Yetkilisi)
  if (meta && meta.shift_officer_id) {
    collaboratorIds.add(String(meta.shift_officer_id))
  }

  // Assignee: Birincil Sorumlu
  if (template.form_type === 'checklist' && !template.schema_json?.require_branch_selection) {
    if (submission.submitted_by) {
      assigneeIds.add(String(submission.submitted_by))
    }
  } else if (taskConfig.assignee) {
    const posIds = taskConfig.assignee.positions || []
    posIds.forEach(posId => {
      const empsInPosition = allEmployees.filter(e => 
        String(e.positionId) === String(posId) && 
        !e.deletedAt && 
        !e.terminationDate &&
        worksAtBranch(e, branchNodeId)
      )
      empsInPosition.forEach(e => assigneeIds.add(String(e.id)))
    })
    const persIds = taskConfig.assignee.personnel || []
    persIds.forEach(id => assigneeIds.add(String(id)))

    // Old format fallback
    if (taskConfig.assignee.type && Array.isArray(taskConfig.assignee.ids)) {
      const type = taskConfig.assignee.type
      const ids = taskConfig.assignee.ids
      if (type === 'personnel') {
        ids.forEach(id => assigneeIds.add(String(id)))
      } else if (type === 'position') {
        ids.forEach(posId => {
          const empsInPosition = allEmployees.filter(e => 
            String(e.positionId) === String(posId) && 
            !e.deletedAt && 
            !e.terminationDate &&
            worksAtBranch(e, branchNodeId)
          )
          empsInPosition.forEach(e => assigneeIds.add(String(e.id)))
        })
      }
    }
  }

  // If the auditor is the branch official (i.e. submitted_by matches branch_authorized_id), 
  // they must be an assignee (both task creator/giver and assignee).
  if (meta && meta.branch_authorized_id && String(submission.submitted_by) === String(meta.branch_authorized_id)) {
    assigneeIds.add(String(submission.submitted_by))
  }

  // Collaborator: Ek Sorumlu
  if (taskConfig.collaborators) {
    const posIds = taskConfig.collaborators.positions || []
    posIds.forEach(posId => {
      const empsInPosition = allEmployees.filter(e => 
        String(e.positionId) === String(posId) && 
        !e.deletedAt && 
        !e.terminationDate &&
        worksAtBranch(e, branchNodeId)
      )
      empsInPosition.forEach(e => collaboratorIds.add(String(e.id)))
    })
    const persIds = taskConfig.collaborators.personnel || []
    persIds.forEach(id => collaboratorIds.add(String(id)))

    // Old format fallback
    if (taskConfig.collaborators.type && Array.isArray(taskConfig.collaborators.ids)) {
      const type = taskConfig.collaborators.type
      const ids = taskConfig.collaborators.ids
      if (type === 'personnel') {
        ids.forEach(id => collaboratorIds.add(String(id)))
      } else if (type === 'position') {
        ids.forEach(posId => {
          const empsInPosition = allEmployees.filter(e => 
            String(e.positionId) === String(posId) && 
            !e.deletedAt && 
            !e.terminationDate &&
            worksAtBranch(e, branchNodeId)
          )
          empsInPosition.forEach(e => collaboratorIds.add(String(e.id)))
        })
      }
    }
  }

  // Watcher: Gözlemci
  if (taskConfig.watchers) {
    const posIds = taskConfig.watchers.positions || []
    posIds.forEach(posId => {
      const empsInPosition = allEmployees.filter(e => 
        String(e.positionId) === String(posId) && 
        !e.deletedAt && 
        !e.terminationDate &&
        worksAtBranch(e, branchNodeId)
      )
      empsInPosition.forEach(e => watcherIds.add(String(e.id)))
    })
    const persIds = taskConfig.watchers.personnel || []
    persIds.forEach(id => watcherIds.add(String(id)))
    if (taskConfig.watchers.responsibles) {
      const targetBranchIds = new Set()
      if (branchNodeId) targetBranchIds.add(String(branchNodeId))
      const submittingUser = allEmployees.find(e => String(e.id) === String(submission.submitted_by))
      if (submittingUser?.defaultBranchId) {
        targetBranchIds.add(String(submittingUser.defaultBranchId))
      }

      const branchManagers = allEmployees.filter(e => 
        !e.deletedAt && 
        !e.terminationDate && 
        Array.isArray(e.managedBranchIds) && 
        e.managedBranchIds.some(bid => targetBranchIds.has(String(bid)))
      )
      branchManagers.forEach(e => watcherIds.add(String(e.id)))
    }

    // Old format fallback
    if (taskConfig.watchers.type && Array.isArray(taskConfig.watchers.ids)) {
      const type = taskConfig.watchers.type
      const ids = taskConfig.watchers.ids
      if (type === 'personnel') {
        ids.forEach(id => watcherIds.add(String(id)))
      } else if (type === 'position') {
        ids.forEach(posId => {
          const empsInPosition = allEmployees.filter(e => 
            String(e.positionId) === String(posId) && 
            !e.deletedAt && 
            !e.terminationDate &&
            worksAtBranch(e, branchNodeId)
          )
          empsInPosition.forEach(e => watcherIds.add(String(e.id)))
        })
      } else if (type === 'responsibles') {
        const targetBranchIds = new Set()
        if (branchNodeId) targetBranchIds.add(String(branchNodeId))
        const submittingUser = allEmployees.find(e => String(e.id) === String(submission.submitted_by))
        if (submittingUser?.defaultBranchId) {
          targetBranchIds.add(String(submittingUser.defaultBranchId))
        }

        const branchManagers = allEmployees.filter(e => 
          !e.deletedAt && 
          !e.terminationDate && 
          Array.isArray(e.managedBranchIds) && 
          e.managedBranchIds.some(bid => targetBranchIds.has(String(bid)))
        )
        branchManagers.forEach(e => watcherIds.add(String(e.id)))
      }
    }
  }

  // Fallback to old targets structure
  if (Array.isArray(taskConfig.targets)) {
    for (const target of taskConfig.targets) {
      if (target.type === 'personnel') {
        assigneeIds.add(String(target.id))
      } else if (target.type === 'position') {
        const empsInPosition = allEmployees.filter(e => 
          String(e.positionId) === String(target.id) && 
          !e.deletedAt && 
          !e.terminationDate &&
          worksAtBranch(e, branchNodeId)
        )
        empsInPosition.forEach(e => assigneeIds.add(String(e.id)))
      }
    }
  }

  // Assignees
  for (const assigneeId of assigneeIds) {
    participantRows.push({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: assigneeId,
      position_id: null,
      node_id: branchNodeId || null,
    })
  }

  // Collaborators (added to assignee list, checking duplicates)
  for (const collabId of collaboratorIds) {
    if (!assigneeIds.has(collabId)) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'assignee',
        personnel_id: collabId,
        position_id: null,
        node_id: branchNodeId || null,
      })
    }
  }

  // Watchers
  for (const watcherId of watcherIds) {
    if (!assigneeIds.has(watcherId) && !collaboratorIds.has(watcherId)) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'watcher',
        personnel_id: watcherId,
        position_id: null,
        node_id: branchNodeId || null,
      })
    }
  }

  if (participantRows.length > 0) {
    const partResult = await db.from('task_participants').insert(participantRows).select()
    if (partResult.error) {
      console.error('[Notification→Task] Participants insert error:', partResult.error)
    } else {
      console.log('[Notification→Task] Participants created:', partResult.data?.length)
    }
  }

  // 3) Soru/Cevapları Checklist olarak ekleyelim
  const answersMap = new Map(toArray(answersJson).map(a => [a.field_id, a]))
  let answerSummary = ''
  for (const section of toArray(template.schema_json?.sections)) {
    for (const field of toArray(section.fields)) {
      const answer = answersMap.get(field.id)
      if (answer && answer.value) {
        answerSummary += `**${field.label}**: ${answer.value}\n`
      }
    }
  }

  // 4) Chat thread
  const threadResult = await db.from('task_chat_threads').insert({ task_id: task.id }).select().maybeSingle()
  
  // 5) System note
  if (threadResult.data?.id) {
    await db.from('task_history').insert({
      task_id: task.id,
      action: 'created',
      performed_by: submission.submitted_by,
      metadata: { title: task.title },
    })
    
    let sysBody = `Bildirim formundan otomatik oluşturuldu.`
    if (answerSummary) {
      sysBody += `\n\n**Form Yanıtları:**\n${answerSummary}`
    }

    await db.from('task_chat_messages').insert({
      thread_id: threadResult.data.id,
      task_id: task.id,
      message_type: 'system',
      body: sysBody,
      metadata: { title: task.title },
    })
  }

  return task.id
}

// ─── Attach file/image to a task ────────────────────────────

export async function attachFileToTask(taskId, { fileName, fileUrl, fileSize, mimeType, uploadedBy, attachmentType = 'file' }) {
  return db.from('task_attachments').insert({
    task_id: taskId,
    attachment_type: attachmentType,
    file_name: fileName,
    file_url: fileUrl,
    file_size: fileSize || 0,
    mime_type: mimeType || 'image/png',
    uploaded_by: uploadedBy || null,
  }).select().maybeSingle()
}
// ─── Sync offline submission ────────────────────────────────

export async function syncOfflineSubmission(submissionId) {
  return db.from('form_submissions').update({
    status: 'completed',
    synced_at: nowIso(),
  }).eq('id', submissionId).eq('status', 'syncing').select().maybeSingle()
}

// ─── Templates assigned to a branch ─────────────────────────

export async function fetchTemplatesForBranch(branchId) {
  const { data: allTemplates, error } = await fetchFormTemplates()
  if (error) return { data: [], error }

  const filtered = toArray(allTemplates).filter(template => {
    const targets = toArray(template.target_branches)
    // Empty target_branches means "all branches"
    if (targets.length === 0) return true
    return targets.includes(branchId)
  })

  return { data: filtered, error: null }
}

// ─── Customer Survey -> Task auto-creation ────────────────────

async function createTaskFromCustomerSurvey(template, submission, answersJson, meta) {
  const taskConfig = template.schema_json?.task_config || {}
  
  const subIdShort = submission.id ? submission.id.slice(0, 8) : '--------'
  const title = `Müşteri Anketi Takip Görevi: ${template.title || 'Müşteri Bildirimi'} (${subIdShort})`

  let formDateFormatted = ''
  if (meta && meta.form_date) {
    const parts = meta.form_date.split('-')
    if (parts.length === 3) {
      formDateFormatted = `${parts[2]}.${parts[1]}.${parts[0]}`
    } else {
      formDateFormatted = meta.form_date
    }
  } else {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    formDateFormatted = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`
  }

  const startTime = (meta && meta.start_time) || new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  const branchName = (meta && meta.branch_name) || 'İlgili'
  const creatorName = (meta && meta.source === 'customer_app') ? 'Sadakat Müşterisi' : 'Anonim Müşteri'
  
  let description = `${formDateFormatted} tarihi ${startTime} saatinde `
  if (meta && meta.branch_id) {
    description += `${branchName} şubesi için `
  }
  description += `${creatorName} tarafından doldurulan "${template.title}" müşteri anketinin takibi için otomatik oluşturulmuştur.\n\n[Form ID: ${submission.id}]`

  const now = new Date()
  const completionHours = Number(taskConfig.completion_hours) || 72
  const dueDate = new Date(now.getTime() + completionHours * 60 * 60 * 1000)
  const branchNodeId = meta.branch_id || submission.branch_id || null

  const rules = taskConfig.rules || {}

  // 1) Task kaydı oluştur. 
  // created_by_personnel_id is NOT NULL, so use 'task_manager' for survey auto tasks
  const taskInsert = await db.from('tasks').insert({
    branch_node_id: branchNodeId || null,
    organization_node_id: null,
    created_by_personnel_id: 'task_manager',
    created_by_position_id: null,
    title,
    description,
    status: 'open',
    priority: taskConfig.priority || 'high',
    due_at: dueDate.toISOString(),
    start_at: now.toISOString(),
    has_specific_time: false,
    timezone: 'Europe/Istanbul',
    is_recurring: false,
    recurrence_rule_id: null,
    delegation_allowed: !!rules.delegation_allowed,
    approval_required: !!rules.approval_required,
    closure_summary_required: !!rules.closure_summary_required,
    closure_file_required: !!rules.closure_file_required,
    closure_image_required: !!rules.closure_image_required,
    edit_due_date_allowed: !!rules.edit_due_date_allowed,
    edit_schedule_allowed: !!rules.edit_schedule_allowed,
    incomplete_if_late: !!rules.incomplete_if_late,
    requires_cost_input: !!rules.requires_cost_input,
    linked_entity_table: template.linked_entity_table || null,
    linked_entity_id: submission.linked_entity_id || null,
    metadata: {
      created_by_label: 'Görev Yöneticisi',
      survey_submission_id: submission.id
    },
    updated_at: nowIso(),
  }).select().maybeSingle()

  if (taskInsert.error) {
    console.error('[Survey→Task] Task insert error:', taskInsert.error)
    return null
  }
  const task = taskInsert.data
  console.log('[Survey→Task] Task created:', task.id)

  // 2) Katılımcıları Belirle
  const participantRows = []
  
  let allEmployees = []
  try {
    allEmployees = await readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord)
  } catch (err) {
    console.error('[Survey→Task] Error reading employees:', err)
  }

  const worksAtBranch = (emp, branchId) => {
    if (!branchId) return false
    const bid = String(branchId)
    const defaultBranch = String(emp.defaultBranchId || '')
    const workingBranches = Array.isArray(emp.workingBranchIds) ? emp.workingBranchIds.map(String) : []
    const managedBranches = Array.isArray(emp.managedBranchIds) ? emp.managedBranchIds.map(String) : []
    return defaultBranch === bid || workingBranches.includes(bid) || managedBranches.includes(bid)
  }

  const assigneeIds = new Set()
  const collaboratorIds = new Set()
  const watcherIds = new Set()

  // Assignees
  if (taskConfig.assignee) {
    if (branchNodeId) {
      const posIds = taskConfig.assignee.positions || []
      posIds.forEach(posId => {
        const empsInPosition = allEmployees.filter(e => 
          String(e.positionId) === String(posId) && 
          !e.deletedAt && 
          !e.terminationDate &&
          worksAtBranch(e, branchNodeId)
        )
        empsInPosition.forEach(e => assigneeIds.add(String(e.id)))
      })
    }
    const persIds = taskConfig.assignee.personnel || []
    persIds.forEach(id => assigneeIds.add(String(id)))
  }

  // Collaborators
  if (taskConfig.collaborators) {
    if (branchNodeId) {
      const posIds = taskConfig.collaborators.positions || []
      posIds.forEach(posId => {
        const empsInPosition = allEmployees.filter(e => 
          String(e.positionId) === String(posId) && 
          !e.deletedAt && 
          !e.terminationDate &&
          worksAtBranch(e, branchNodeId)
        )
        empsInPosition.forEach(e => collaboratorIds.add(String(e.id)))
      })
    }
    const persIds = taskConfig.collaborators.personnel || []
    persIds.forEach(id => collaboratorIds.add(String(id)))
  }

  // Watchers
  if (taskConfig.watchers) {
    if (branchNodeId) {
      const posIds = taskConfig.watchers.positions || []
      posIds.forEach(posId => {
        const empsInPosition = allEmployees.filter(e => 
          String(e.positionId) === String(posId) && 
          !e.deletedAt && 
          !e.terminationDate &&
          worksAtBranch(e, branchNodeId)
        )
        empsInPosition.forEach(e => watcherIds.add(String(e.id)))
      })
    }
    if (taskConfig.watchers.responsibles) {
      const targetBranchIds = new Set()
      if (branchNodeId) targetBranchIds.add(String(branchNodeId))
      const submittingUser = allEmployees.find(e => String(e.id) === String(submission.submitted_by))
      if (submittingUser?.defaultBranchId) {
        targetBranchIds.add(String(submittingUser.defaultBranchId))
      }

      if (targetBranchIds.size > 0) {
        const branchManagers = allEmployees.filter(e => 
          !e.deletedAt && 
          !e.terminationDate && 
          Array.isArray(e.managedBranchIds) && 
          e.managedBranchIds.some(bid => targetBranchIds.has(String(bid)))
        )
        branchManagers.forEach(e => watcherIds.add(String(e.id)))
      }
    }
    const persIds = taskConfig.watchers.personnel || []
    persIds.forEach(id => watcherIds.add(String(id)))
  }

  // Assignees
  for (const assigneeId of assigneeIds) {
    participantRows.push({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: assigneeId,
      position_id: null,
      node_id: branchNodeId || null,
    })
  }

  // Collaborators
  for (const collabId of collaboratorIds) {
    if (!assigneeIds.has(collabId)) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'assignee',
        personnel_id: collabId,
        position_id: null,
        node_id: branchNodeId || null,
      })
    }
  }

  // Watchers
  for (const watcherId of watcherIds) {
    if (!assigneeIds.has(watcherId) && !collaboratorIds.has(watcherId)) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'watcher',
        personnel_id: watcherId,
        position_id: null,
        node_id: branchNodeId || null,
      })
    }
  }

  if (participantRows.length > 0) {
    const partResult = await db.from('task_participants').insert(participantRows).select()
    if (partResult.error) {
      console.error('[Survey→Task] Participants insert error:', partResult.error)
    }
  }

  // 3) Checklist
  const answersMap = new Map(toArray(answersJson).map(a => [a.field_id, a]))
  let answerSummary = ''
  for (const section of toArray(template.schema_json?.sections)) {
    for (const field of toArray(section.fields)) {
      const answer = answersMap.get(field.id)
      if (answer && answer.value !== null && answer.value !== undefined) {
        let valStr = String(answer.value)
        if (typeof answer.value === 'boolean') {
          valStr = answer.value ? 'Evet' : 'Hayır'
        }
        answerSummary += `**${field.label}**: ${valStr}\n`
      }
    }
  }

  // 4) Chat thread
  const threadResult = await db.from('task_chat_threads').insert({ task_id: task.id }).select().maybeSingle()
  
  // 5) System note
  if (threadResult.data?.id) {
    await db.from('task_history').insert({
      task_id: task.id,
      action: 'created',
      performed_by: 'task_manager',
      metadata: { title: task.title },
    })
    
    let sysBody = `Müşteri anketinden otomatik oluşturuldu.`
    if (answerSummary) {
      sysBody += `\n\n**Müşteri Yanıtları:**\n${answerSummary}`
    }

    await db.from('task_chat_messages').insert({
      thread_id: threadResult.data.id,
      task_id: task.id,
      message_type: 'system',
      body: sysBody,
      metadata: { title: task.title },
    })
  }

  return task.id
}
