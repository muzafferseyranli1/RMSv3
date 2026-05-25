import { db, uploadApiFile } from '@/lib/db'

// ─── Helpers ────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
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

export async function createFormTemplate({ title, description, formType = 'inspection', schemaJson, targetBranches = [], scoring = {}, recurrence, minCompletionSeconds, requireGeo = false, createdBy }) {
  return db.from('form_templates').insert({
    title,
    description: description || null,
    form_type: formType,
    schema_json: schemaJson,
    target_branches: targetBranches,
    scoring,
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
  if (!('scoring' in updates)) delete payload.scoring
  return db.from('form_templates').update(payload).eq('id', templateId).select().maybeSingle()
}

export async function softDeleteFormTemplate(templateId) {
  return db.from('form_templates').update({ deleted_at: nowIso(), active: false, updated_at: nowIso() }).eq('id', templateId).select().maybeSingle()
}

// ─── Form Submissions ───────────────────────────────────────

export async function fetchFormSubmissions({ branchId, templateId, status, limit = 100, offset = 0 } = {}) {
  let query = db.from('form_submissions').select('*').order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  if (templateId) query = query.eq('template_id', templateId)
  if (status) query = query.eq('status', status)
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

  for (const section of sections) {
    for (const field of toArray(section.fields)) {
      const maxPoints = Number(field.max_points) || 0
      if (maxPoints <= 0) continue
      maxPossibleScore += maxPoints

      const answer = answersMap.get(field.id)
      if (!answer) continue

      if (field.type === 'rating') {
        // rating 1-5 normalized to max_points
        const ratingValue = Number(answer.value) || 0
        totalScore += Math.min((ratingValue / 5) * maxPoints, maxPoints)
      } else if (field.type === 'yes_no') {
        totalScore += answer.value === true || answer.value === 'yes' ? maxPoints : 0
      } else if (field.type === 'temperature') {
        const temp = Number(answer.value)
        const minVal = Number(field.min_value)
        const maxVal = Number(field.max_value)
        if (!isNaN(temp) && !isNaN(minVal) && !isNaN(maxVal)) {
          totalScore += (temp >= minVal && temp <= maxVal) ? maxPoints : 0
        }
      } else if (field.type === 'number') {
        totalScore += answer.value != null ? maxPoints : 0
      } else {
        // For select, text, etc. — full points if answered
        totalScore += answer.value ? maxPoints : 0
      }
    }
  }

  const scorePercentage = maxPossibleScore > 0 ? Math.round((totalScore / maxPossibleScore) * 10000) / 100 : 0

  return { totalScore, maxPossibleScore, scorePercentage }
}

// ─── Anomaly Detection ──────────────────────────────────────

export function detectAnomalies(template, submission) {
  const anomalies = []

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

export async function submitFormResponse({ templateId, branchId, submittedBy, answersJson, geoLatitude, geoLongitude, deviceTimestamp, completionTimeSeconds, isOffline = false, photos = [] }) {
  // Load template for scoring
  const templateResult = await fetchFormTemplateDetail(templateId)
  if (templateResult.error || !templateResult.data) {
    return { data: null, error: templateResult.error || { message: 'Form şablonu bulunamadı' } }
  }
  const template = templateResult.data

  // Score the submission
  const { totalScore, maxPossibleScore, scorePercentage } = scoreSubmission(template.schema_json, answersJson)

  // Determine status
  let status = 'completed'
  if (isOffline) status = 'syncing'

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
  if (anomalies.length > 0) {
    await db.from('form_submissions').update({
      status: 'anomaly',
      metadata: { anomalies },
    }).eq('id', submission.id)
    submission.status = 'anomaly'
    submission.metadata = { anomalies }
  }

  return {
    data: {
      ...submission,
      scoreResult: { totalScore, maxPossibleScore, scorePercentage },
      anomalies,
      shouldCreateTicket: shouldTriggerInspectionTicket(template, submission),
    },
    error: null,
  }
}

// ─── Inspection → Ticket trigger ────────────────────────────

export function shouldTriggerInspectionTicket(template, submission) {
  const passThreshold = Number(template.scoring?.pass_threshold) || 0
  if (passThreshold > 0 && (Number(submission.score_percentage) || 0) < passThreshold) return true
  if (submission.status === 'anomaly') return true
  return false
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
