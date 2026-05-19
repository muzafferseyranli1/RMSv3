import { db, uploadApiFile } from '@/lib/db'
import {
  PERSONNEL_SETTINGS_KEYS,
  extractBranchNodes,
  flattenCompanyNodes,
  normalizeEmployeeRecord,
  normalizePositionRecord,
  readCompanyTree,
  readSettingArray,
} from '@/lib/personnelConfig'
import { canReject, getDescendantIds } from '@/lib/taskHierarchy'
import { calculateNextOccurrence } from '@/lib/taskRecurrence'

const TASK_STATUS = {
  draft: 'draft',
  open: 'open',
  inProgress: 'in_progress',
  pendingApproval: 'pending_approval',
  pendingCompletionApproval: 'pending_completion_approval',
  completed: 'completed',
  rejected: 'rejected',
  cancelled: 'cancelled',
  softDeleted: 'soft_deleted',
  notCompleted: 'not_completed',
}

function nowIso() {
  return new Date().toISOString()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toStringValue(value) {
  return value == null ? '' : String(value)
}

function startOfLateWindow(task) {
  if (!task?.due_at) return null
  const dueDate = new Date(task.due_at)
  if (Number.isNaN(dueDate.getTime())) return null
  if (!task.has_specific_time) {
    dueDate.setHours(23, 59, 59, 999)
  }
  return dueDate
}

async function ensureTaskEscalationState(task) {
  const lateWindow = startOfLateWindow(task)
  if (!lateWindow) return task
  const isLate = Date.now() > lateWindow.getTime()
  if (!isLate) return task

  if (task.incomplete_if_late && ![TASK_STATUS.completed, TASK_STATUS.softDeleted, TASK_STATUS.notCompleted].includes(task.status)) {
    const { data, error } = await db
      .from('tasks')
      .update({ status: TASK_STATUS.notCompleted, updated_at: nowIso() })
      .eq('id', task.id)
      .select()
      .maybeSingle()
    if (!error && data) return data
  }

  return { ...task, display_status: task.status === TASK_STATUS.notCompleted ? TASK_STATUS.notCompleted : 'overdue' }
}

function buildBranchNodeMaps(companyTree) {
  const flatNodes = flattenCompanyNodes(companyTree)
  const nodesById = new Map(flatNodes.map(node => [String(node.id), node]))
  const branchNodes = extractBranchNodes(companyTree)
  const branchesById = new Map(branchNodes.map(branch => [String(branch.id), branch]))

  function findLegalEntityId(branchId) {
    const node = nodesById.get(String(branchId))
    const parent = [...(node?.parentChain || [])].reverse().find(item => item.type === 'tuzel')
    return parent ? String(parent.id) : ''
  }

  return { flatNodes, nodesById, branchNodes, branchesById, findLegalEntityId }
}

async function loadTaskContext() {
  const [companyTree, employees, positions] = await Promise.all([
    readCompanyTree(),
    readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
    readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord),
  ])

  const maps = buildBranchNodeMaps(companyTree)
  return {
    companyTree,
    employees,
    positions,
    employeesById: new Map(employees.map(employee => [String(employee.id), employee])),
    positionsById: new Map(positions.map(position => [String(position.id), position])),
    ...maps,
  }
}

function isGeneralCenterActor(actor) {
  return String(actor?.authorityLevel || '').toLowerCase() === 'genel merkez'
}

function getActorLegalEntityIds(actor, context) {
  if (isGeneralCenterActor(actor)) return new Set(context.branchNodes.map(branch => context.findLegalEntityId(branch.id)).filter(Boolean))

  const branchIds = new Set([
    actor?.branchId,
    actor?.defaultBranchId,
    ...toArray(actor?.workingBranchIds),
    ...toArray(actor?.managedBranchIds),
  ].filter(Boolean).map(String))

  return new Set([...branchIds].map(branchId => context.findLegalEntityId(branchId)).filter(Boolean))
}

function getAssignableBranches(actor, context) {
  if (isGeneralCenterActor(actor)) return context.branchNodes
  const legalEntityIds = getActorLegalEntityIds(actor, context)
  return context.branchNodes.filter(branch => legalEntityIds.has(context.findLegalEntityId(branch.id)))
}

function getVisibleTaskIdsForActor(actor, tasks, participants, context) {
  if (isGeneralCenterActor(actor)) return new Set(tasks.map(task => String(task.id)))

  const actorId = String(actor?.id || '')
  const actorPositionId = String(actor?.positionId || '')
  const descendantIds = actorPositionId ? getDescendantIds(actorPositionId, context.positions) : new Set()
  const tasksById = new Set()
  const actorLegalEntityIds = getActorLegalEntityIds(actor, context)
  const participantsByTaskId = new Map()

  participants.forEach(participant => {
    const taskId = String(participant.task_id)
    if (!participantsByTaskId.has(taskId)) participantsByTaskId.set(taskId, [])
    participantsByTaskId.get(taskId).push(participant)
  })

  tasks.forEach(task => {
    const taskId = String(task.id)
    const taskLegalEntityId = context.findLegalEntityId(task.branch_node_id)
    const relatedParticipants = participantsByTaskId.get(taskId) || []
    const isRelated = String(task.created_by_personnel_id) === actorId || relatedParticipants.some(item => String(item.personnel_id) === actorId)
    const isScoped = actorLegalEntityIds.has(taskLegalEntityId)
    const isManaged = actorPositionId && (
      descendantIds.has(String(task.created_by_position_id || '')) ||
      relatedParticipants.some(item => descendantIds.has(String(item.position_id || '')))
    )

    if (isRelated || (isScoped && isManaged)) {
      tasksById.add(taskId)
    }
  })

  return tasksById
}

function buildRecurrencePayload(form) {
  if (!form.recurrence) return null
  return {
    frequency: form.recurrence,
    interval_value: Math.max(1, Number(form.durationValue) || 1),
    weekdays: form.recurrence === 'weekly' ? toArray(form.weeklyDays) : null,
    month_day: form.recurrence === 'monthly'
      ? (form.monthlyPattern === 'last_day' ? -1 : Number(form.monthlyDayOfMonth) || null)
      : null,
    month_nth: form.recurrence === 'monthly' && form.monthlyPattern === 'nth_weekday' ? Number(form.monthlyNth) || 1 : null,
    month_weekday: form.recurrence === 'monthly' && form.monthlyPattern === 'nth_weekday' ? form.monthlyWeekday : null,
    specific_dates: form.recurrence === 'yearly' && form.yearlyPattern === 'specific_dates'
      ? String(form.yearlyDates || '').split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)
      : null,
    time_of_day: form.has_specific_time ? form.completionTime || null : null,
  }
}

export async function uploadTaskFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  return uploadApiFile(formData)
}

export async function fetchTaskOptions(actor) {
  const context = await loadTaskContext()
  return {
    employees: context.employees,
    positions: context.positions,
    branches: getAssignableBranches(actor, context),
  }
}

export async function createTask(form, actor, uploadedFiles = []) {
  const context = await loadTaskContext()
  const branchNodeId = String(form.locationId || actor?.branchId || '')
  const organizationNodeId = context.findLegalEntityId(branchNodeId)
  const recurrencePayload = buildRecurrencePayload(form)
  let recurrenceRuleId = null

  if (recurrencePayload) {
    const recurrenceInsert = await db.from('task_recurrence_rules').insert(recurrencePayload).select().maybeSingle()
    if (recurrenceInsert.error) return recurrenceInsert
    recurrenceRuleId = recurrenceInsert.data?.id || null
  }

  const assigneeIds = [form.responsibleId, ...toArray(form.collaboratorIds)].filter(Boolean)
  const assignees = assigneeIds
    .map(id => context.employeesById.get(String(id)))
    .filter(Boolean)
  const watchers = toArray(form.observerIds)
    .map(id => context.employeesById.get(String(id)))
    .filter(Boolean)

  const requiresAssignmentApproval = assignees.some(assignee => canReject(actor?.positionId, assignee.positionId, context.positions))
  const taskInsert = await db.from('tasks').insert({
    organization_node_id: organizationNodeId || null,
    branch_node_id: branchNodeId || null,
    created_by_personnel_id: actor.id,
    created_by_position_id: actor.positionId || null,
    title: form.title,
    description: form.description || '',
    status: requiresAssignmentApproval ? TASK_STATUS.pendingApproval : TASK_STATUS.open,
    priority: form.priority || 'normal',
    due_at: form.completionDate ? new Date(form.completionDate).toISOString() : null,
    start_at: form.startDate ? new Date(form.startDate).toISOString() : null,
    has_specific_time: !!form.has_specific_time,
    timezone: 'Europe/Istanbul',
    is_recurring: !!form.recurrence,
    recurrence_rule_id: recurrenceRuleId,
    delegation_allowed: !!form.delegation_allowed,
    approval_required: !!form.approval_required,
    closure_summary_required: !!form.closure_summary_required,
    closure_file_required: !!form.closure_file_required,
    closure_image_required: !!form.closure_image_required,
    edit_due_date_allowed: !!form.edit_due_date_allowed,
    edit_schedule_allowed: !!form.edit_schedule_allowed,
    incomplete_if_late: !!form.incomplete_if_late,
    updated_at: nowIso(),
  }).select().maybeSingle()

  if (taskInsert.error) return taskInsert
  const task = taskInsert.data

  const participantRows = [
    ...assignees.map(assignee => ({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: assignee.id,
      position_id: assignee.positionId || null,
      node_id: assignee.defaultBranchId || null,
    })),
    ...watchers.map(watcher => ({
      task_id: task.id,
      participant_type: 'watcher',
      personnel_id: watcher.id,
      position_id: watcher.positionId || null,
      node_id: watcher.defaultBranchId || null,
    })),
  ]

  if (participantRows.length) {
    const participantInsert = await db.from('task_participants').insert(participantRows).select()
    if (participantInsert.error) return participantInsert
  }

  const checklistRows = toArray(form.checklistItems)
    .map((item, index) => ({
      task_id: task.id,
      text: String(item.text || '').trim(),
      sort_order: index,
    }))
    .filter(item => item.text)

  if (checklistRows.length) {
    const checklistInsert = await db.from('task_checklist_items').insert(checklistRows).select()
    if (checklistInsert.error) return checklistInsert
  }

  const threadInsert = await db.from('task_chat_threads').insert({ task_id: task.id }).select().maybeSingle()
  if (threadInsert.error) return threadInsert

  const attachmentRows = uploadedFiles.map(file => ({
    task_id: task.id,
    attachment_type: file.attachment_type,
    file_name: file.file_name,
    file_url: file.file_url,
    file_size: file.file_size,
    mime_type: file.mime_type,
    uploaded_by: actor.id,
  }))
  if (attachmentRows.length) {
    const attachmentInsert = await db.from('task_attachments').insert(attachmentRows).select()
    if (attachmentInsert.error) return attachmentInsert
  }

  if (requiresAssignmentApproval) {
    const approvalRows = assignees
      .filter(assignee => canReject(actor?.positionId, assignee.positionId, context.positions))
      .map(assignee => ({
        task_id: task.id,
        request_type: 'assignment',
        from_personnel: actor.id,
        to_personnel: assignee.id,
      }))
    if (approvalRows.length) {
      const approvalInsert = await db.from('task_approval_requests').insert(approvalRows).select()
      if (approvalInsert.error) return approvalInsert
    }
  }

  await appendSystemNote(task.id, 'created', actor.id, {
    title: task.title,
    next_occurrence: recurrencePayload ? calculateNextOccurrence(recurrencePayload, task.start_at || task.due_at || new Date())?.toISOString() || null : null,
  })

  return { data: task, error: null }
}

async function fetchAllParticipantsForTasks(taskIds) {
  if (!taskIds.length) return []
  const { data } = await db.from('task_participants').select('*').in('task_id', taskIds)
  return toArray(data)
}

async function fetchTaskRows() {
  const { data, error } = await db.from('tasks').select('*').order('created_at', { ascending: false })
  if (error) throw error
  const taskRows = await Promise.all(toArray(data).map(ensureTaskEscalationState))
  return taskRows
}

export async function fetchTasks({ actor, scope = 'center', scopeBranchId = '', tab = 'mine', statusFilter = 'active' }) {
  const context = await loadTaskContext()
  const taskRows = await fetchTaskRows()
  const participants = await fetchAllParticipantsForTasks(taskRows.map(task => task.id))
  const checklistResult = taskRows.length
    ? await db.from('task_checklist_items').select('id,task_id,is_done').in('task_id', taskRows.map(task => task.id))
    : { data: [], error: null }
  if (checklistResult.error) return checklistResult
  const visibleTaskIds = getVisibleTaskIdsForActor(actor, taskRows, participants, context)
  const participantMap = new Map()
  const checklistMap = new Map()

  participants.forEach(participant => {
    const taskId = String(participant.task_id)
    if (!participantMap.has(taskId)) participantMap.set(taskId, [])
    participantMap.get(taskId).push(participant)
  })

  toArray(checklistResult.data).forEach(item => {
    const taskId = String(item.task_id)
    if (!checklistMap.has(taskId)) checklistMap.set(taskId, [])
    checklistMap.get(taskId).push(item)
  })

  const filtered = taskRows.filter(task => visibleTaskIds.has(String(task.id))).filter(task => {
    if (scope !== 'center' && scopeBranchId) {
      return String(task.branch_node_id || '') === String(scopeBranchId)
    }
    return true
  }).filter(task => {
    const taskId = String(task.id)
    const taskParticipants = participantMap.get(taskId) || []
    if (tab === 'assigned_by_me') return String(task.created_by_personnel_id) === String(actor.id)
    if (tab === 'watching') return taskParticipants.some(item => item.participant_type === 'watcher' && String(item.personnel_id) === String(actor.id))
    return taskParticipants.some(item => item.participant_type === 'assignee' && String(item.personnel_id) === String(actor.id))
  }).filter(task => {
    const effectiveStatus = task.display_status || task.status
    if (statusFilter === 'completed') return effectiveStatus === TASK_STATUS.completed
    if (statusFilter === 'deleted') return !!task.deleted_at || effectiveStatus === TASK_STATUS.softDeleted
    return [TASK_STATUS.open, TASK_STATUS.inProgress, TASK_STATUS.pendingApproval, TASK_STATUS.pendingCompletionApproval, TASK_STATUS.notCompleted, 'overdue', TASK_STATUS.rejected].includes(effectiveStatus)
      && !task.deleted_at
  })

  return {
    data: filtered.map(task => ({
      ...task,
      participants: participantMap.get(String(task.id)) || [],
      checklist_count: (checklistMap.get(String(task.id)) || []).length,
      checklist_done_count: (checklistMap.get(String(task.id)) || []).filter(item => item.is_done).length,
    })),
    error: null,
  }
}

export async function fetchTaskDetail(taskId) {
  const [taskResult, participantsResult, checklistResult, attachmentsResult, approvalsResult, threadResult, historyResult] = await Promise.all([
    db.from('tasks').select('*').eq('id', taskId).maybeSingle(),
    db.from('task_participants').select('*').eq('task_id', taskId),
    db.from('task_checklist_items').select('*').eq('task_id', taskId).order('sort_order'),
    db.from('task_attachments').select('*').eq('task_id', taskId).order('created_at'),
    db.from('task_approval_requests').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
    db.from('task_chat_threads').select('*').eq('task_id', taskId).maybeSingle(),
    db.from('task_history').select('*').eq('task_id', taskId).order('created_at', { ascending: false }),
  ])

  if (taskResult.error) return taskResult

  let messages = []
  if (threadResult.data?.id) {
    const messagesResult = await db.from('task_chat_messages').select('*').eq('thread_id', threadResult.data.id).order('created_at')
    if (messagesResult.error) return messagesResult
    messages = toArray(messagesResult.data)
  }

  return {
    data: {
      ...(await ensureTaskEscalationState(taskResult.data)),
      participants: toArray(participantsResult.data),
      checklist: toArray(checklistResult.data),
      attachments: toArray(attachmentsResult.data),
      approvals: toArray(approvalsResult.data),
      thread: threadResult.data || null,
      messages,
      history: toArray(historyResult.data),
    },
    error: null,
  }
}

export async function appendSystemNote(taskId, event, performedBy, metadata = {}) {
  const threadResult = await db.from('task_chat_threads').select('*').eq('task_id', taskId).maybeSingle()
  if (threadResult.error) return threadResult

  const historyResult = await db.from('task_history').insert({
    task_id: taskId,
    action: event,
    performed_by: performedBy,
    metadata,
  }).select().maybeSingle()
  if (historyResult.error) return historyResult

  const messageResult = await db.from('task_chat_messages').insert({
    thread_id: threadResult.data.id,
    task_id: taskId,
    message_type: 'system',
    sender_id: null,
    body: metadata.body || event,
    metadata,
  }).select().maybeSingle()

  return messageResult
}

export async function appendChatMessage(taskId, senderId, body, file = null) {
  const detail = await fetchTaskDetail(taskId)
  if (detail.error) return detail
  const threadId = detail.data.thread?.id
  if (!threadId) return { data: null, error: { message: 'Task thread is missing' } }

  const insertResult = await db.from('task_chat_messages').insert({
    thread_id: threadId,
    task_id: taskId,
    message_type: 'user',
    sender_id: senderId,
    body,
    metadata: file ? { attachment_type: file.attachment_type, file_url: file.file_url, file_name: file.file_name } : {},
  }).select().maybeSingle()
  if (insertResult.error) return insertResult

  if (file) {
    const attachmentResult = await db.from('task_attachments').insert({
      task_id: taskId,
      attachment_type: file.attachment_type,
      file_name: file.file_name,
      file_url: file.file_url,
      file_size: file.file_size,
      mime_type: file.mime_type,
      uploaded_by: senderId,
    }).select().maybeSingle()
    if (attachmentResult.error) return attachmentResult
  }

  return insertResult
}

export async function acceptAssignment(taskId, approvalId, personnelId) {
  const [approvalUpdate, taskUpdate] = await Promise.all([
    db.from('task_approval_requests').update({ status: 'accepted', resolved_at: nowIso() }).eq('id', approvalId).select().maybeSingle(),
    db.from('tasks').update({ status: TASK_STATUS.open, updated_at: nowIso() }).eq('id', taskId).select().maybeSingle(),
  ])
  if (approvalUpdate.error) return approvalUpdate
  if (taskUpdate.error) return taskUpdate
  await appendSystemNote(taskId, 'accepted', personnelId, { body: 'Gorev kabul edildi.' })
  return taskUpdate
}

export async function rejectAssignment(taskId, approvalId, personnelId, reason) {
  const [approvalUpdate, taskUpdate] = await Promise.all([
    db.from('task_approval_requests').update({ status: 'rejected', reason, resolved_at: nowIso() }).eq('id', approvalId).select().maybeSingle(),
    db.from('tasks').update({ status: TASK_STATUS.rejected, updated_at: nowIso() }).eq('id', taskId).select().maybeSingle(),
  ])
  if (approvalUpdate.error) return approvalUpdate
  if (taskUpdate.error) return taskUpdate
  await appendSystemNote(taskId, 'rejected', personnelId, { body: `Gorev geri gonderildi: ${reason}`, reason })
  return taskUpdate
}

export async function acceptTask(taskId, personnelId) {
  const result = await db.from('tasks').update({ status: TASK_STATUS.inProgress, updated_at: nowIso() }).eq('id', taskId).select().maybeSingle()
  if (!result.error) await appendSystemNote(taskId, 'started', personnelId, { body: 'Goreve baslandi.' })
  return result
}

export async function sendBack(taskId, personnelId, reason) {
  if (!String(reason || '').trim()) return { data: null, error: { message: 'Reason is required' } }
  const taskResult = await db.from('tasks').select('*').eq('id', taskId).maybeSingle()
  if (taskResult.error) return taskResult
  const approvalInsert = await db.from('task_approval_requests').insert({
    task_id: taskId,
    request_type: 'rejection',
    from_personnel: personnelId,
    to_personnel: taskResult.data.created_by_personnel_id,
    reason,
  }).select().maybeSingle()
  if (approvalInsert.error) return approvalInsert
  const taskUpdate = await db.from('tasks').update({ status: TASK_STATUS.rejected, updated_at: nowIso() }).eq('id', taskId).select().maybeSingle()
  if (!taskUpdate.error) await appendSystemNote(taskId, 'sent_back', personnelId, { body: `Gorev geri gonderildi: ${reason}`, reason })
  return taskUpdate
}

export async function delegateTask(taskId, fromPersonnelId, toEmployee, positions) {
  const approvalInsert = await db.from('task_approval_requests').insert({
    task_id: taskId,
    request_type: 'delegation',
    from_personnel: fromPersonnelId,
    to_personnel: toEmployee.id,
  }).select().maybeSingle()
  if (approvalInsert.error) return approvalInsert
  await appendSystemNote(taskId, 'delegated', fromPersonnelId, {
    body: canReject(positions.actorPositionId, toEmployee.positionId, positions.all)
      ? 'Delege talebi onay bekliyor.'
      : 'Delege talebi olusturuldu.',
    to_personnel: toEmployee.id,
  })
  return approvalInsert
}

export async function acceptDelegate(approvalId, personnelId) {
  const approval = await db.from('task_approval_requests').select('*').eq('id', approvalId).maybeSingle()
  if (approval.error) return approval
  const participantUpdate = await db.from('task_participants')
    .update({ participant_type: 'watcher', is_delegate: true })
    .eq('task_id', approval.data.task_id)
    .eq('personnel_id', approval.data.from_personnel)
    .select()
  if (participantUpdate.error) return participantUpdate

  const newAssignee = await db.from('task_participants').insert({
    task_id: approval.data.task_id,
    participant_type: 'assignee',
    personnel_id: approval.data.to_personnel,
    is_delegate: true,
    delegated_from: approval.data.from_personnel,
  }).select().maybeSingle()
  if (newAssignee.error) return newAssignee

  await db.from('task_approval_requests').update({ status: 'accepted', resolved_at: nowIso() }).eq('id', approvalId)
  await appendSystemNote(approval.data.task_id, 'delegate_accepted', personnelId, { body: 'Delege talebi kabul edildi.' })
  return newAssignee
}

export async function rejectDelegate(approvalId, personnelId, reason) {
  const approval = await db.from('task_approval_requests').select('*').eq('id', approvalId).maybeSingle()
  if (approval.error) return approval
  const update = await db.from('task_approval_requests').update({ status: 'rejected', reason, resolved_at: nowIso() }).eq('id', approvalId).select().maybeSingle()
  if (!update.error) await appendSystemNote(approval.data.task_id, 'delegate_rejected', personnelId, { body: `Delege talebi reddedildi: ${reason}`, reason })
  return update
}

export async function completeTask(taskId, personnelId, closure) {
  const detail = await fetchTaskDetail(taskId)
  if (detail.error) return detail
  const task = detail.data
  const closureSummary = String(closure.summary || '').trim()
  const closureFiles = toArray(closure.files)
  const closureImages = toArray(closure.images)

  if (task.closure_summary_required && !closureSummary) return { data: null, error: { message: 'Closure summary is required' } }
  if (task.closure_file_required && !closureFiles.length) return { data: null, error: { message: 'Closure file is required' } }
  if (task.closure_image_required && !closureImages.length) return { data: null, error: { message: 'Closure image is required' } }

  const attachmentRows = [
    ...closureFiles.map(file => ({ ...file, attachment_type: 'closure_file' })),
    ...closureImages.map(file => ({ ...file, attachment_type: 'closure_image' })),
  ].map(file => ({
    task_id: taskId,
    attachment_type: file.attachment_type,
    file_name: file.file_name,
    file_url: file.file_url,
    file_size: file.file_size,
    mime_type: file.mime_type,
    uploaded_by: personnelId,
  }))

  if (attachmentRows.length) {
    const attachmentInsert = await db.from('task_attachments').insert(attachmentRows).select()
    if (attachmentInsert.error) return attachmentInsert
  }

  if (task.approval_required) {
    await db.from('task_approval_requests').insert({
      task_id: taskId,
      request_type: 'closure_approval',
      from_personnel: personnelId,
      to_personnel: task.created_by_personnel_id,
    })
  }

  const status = task.approval_required ? TASK_STATUS.pendingCompletionApproval : TASK_STATUS.completed
  const update = await db.from('tasks').update({
    status,
    closure_summary: closureSummary || null,
    updated_at: nowIso(),
  }).eq('id', taskId).select().maybeSingle()
  if (!update.error) {
    await appendSystemNote(taskId, task.approval_required ? 'pending_completion_approval' : 'completed', personnelId, {
      body: task.approval_required ? 'Gorev kapanis onayina gonderildi.' : 'Gorev tamamlandi.',
    })
  }
  return update
}

export async function approveCompletion(approvalId, personnelId) {
  const approval = await db.from('task_approval_requests').select('*').eq('id', approvalId).maybeSingle()
  if (approval.error) return approval
  await db.from('task_approval_requests').update({ status: 'accepted', resolved_at: nowIso() }).eq('id', approvalId)
  const taskUpdate = await db.from('tasks').update({ status: TASK_STATUS.completed, updated_at: nowIso() }).eq('id', approval.data.task_id).select().maybeSingle()
  if (!taskUpdate.error) await appendSystemNote(approval.data.task_id, 'approved', personnelId, { body: 'Kapanis onaylandi.' })
  return taskUpdate
}

export async function rejectCompletion(approvalId, personnelId, reason) {
  const approval = await db.from('task_approval_requests').select('*').eq('id', approvalId).maybeSingle()
  if (approval.error) return approval
  await db.from('task_approval_requests').update({ status: 'rejected', reason, resolved_at: nowIso() }).eq('id', approvalId)
  const taskUpdate = await db.from('tasks').update({ status: TASK_STATUS.inProgress, updated_at: nowIso() }).eq('id', approval.data.task_id).select().maybeSingle()
  if (!taskUpdate.error) await appendSystemNote(approval.data.task_id, 'approval_rejected', personnelId, { body: `Kapanis iade edildi: ${reason}`, reason })
  return taskUpdate
}

export async function softDeleteTask(taskId, personnelId) {
  const taskResult = await db.from('tasks').select('*').eq('id', taskId).maybeSingle()
  if (taskResult.error) return taskResult
  if (String(taskResult.data.created_by_personnel_id) !== String(personnelId)) {
    return { data: null, error: { message: 'Only the creator can delete this task' } }
  }
  const update = await db.from('tasks').update({
    deleted_at: nowIso(),
    status: TASK_STATUS.softDeleted,
    updated_at: nowIso(),
  }).eq('id', taskId).select().maybeSingle()
  if (!update.error) await appendSystemNote(taskId, 'soft_deleted', personnelId, { body: 'Gorev pasife alindi.' })
  return update
}

export async function restoreTask(taskId, personnelId) {
  const update = await db.from('tasks').update({
    deleted_at: null,
    status: TASK_STATUS.open,
    updated_at: nowIso(),
  }).eq('id', taskId).select().maybeSingle()
  if (!update.error) await appendSystemNote(taskId, 'restored', personnelId, { body: 'Gorev geri alindi.' })
  return update
}

export async function changeDueDate(taskId, personnelId, { dueAt, startAt }) {
  const detail = await fetchTaskDetail(taskId)
  if (detail.error) return detail
  const task = detail.data
  if (task.is_recurring) return { data: null, error: { message: 'Recurring tasks cannot be rescheduled' } }
  if (!task.edit_due_date_allowed && !task.edit_schedule_allowed) {
    return { data: null, error: { message: 'Date editing is not allowed' } }
  }

  const updatePayload = {
    due_at: dueAt || task.due_at,
    updated_at: nowIso(),
  }
  if (task.edit_schedule_allowed) updatePayload.start_at = startAt || task.start_at

  const update = await db.from('tasks').update(updatePayload).eq('id', taskId).select().maybeSingle()
  if (!update.error) {
    await appendSystemNote(taskId, 'date_changed', personnelId, {
      body: 'Gorev tarihleri guncellendi.',
      old_due_at: task.due_at,
      new_due_at: updatePayload.due_at,
      old_start_at: task.start_at,
      new_start_at: updatePayload.start_at || task.start_at,
    })
  }
  return update
}

export async function replaceChecklist(taskId, checklistItems) {
  await db.from('task_checklist_items').delete().eq('task_id', taskId)
  const rows = toArray(checklistItems)
    .map((item, index) => ({
      task_id: taskId,
      text: String(item.text || '').trim(),
      is_done: !!item.is_done,
      sort_order: index,
      updated_at: nowIso(),
    }))
    .filter(item => item.text)
  if (!rows.length) return { data: [], error: null }
  return db.from('task_checklist_items').insert(rows).select()
}
