import { db } from '@/lib/db'
import { createTask, appendSystemNote } from '@/lib/taskService'
import { createNotification } from '@/lib/notificationService'
import { readSettingArray, PERSONNEL_SETTINGS_KEYS, normalizeEmployeeRecord, normalizePositionRecord } from '@/lib/personnelConfig'

// ─── Helpers ────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

// Helper to fetch employee name
async function getEmployeeNameAndRecord(personnelId) {
  if (!personnelId) return { name: '', record: null }
  try {
    const employees = await readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord)
    const emp = employees.find(e => e.id === personnelId)
    if (emp) {
      return { 
        name: `${emp.firstName} ${emp.lastName}`.trim(), 
        record: emp 
      }
    }
  } catch (e) {
    console.error('Error fetching employee name:', e)
  }
  return { name: '', record: null }
}

// ─── Ticket CRUD ────────────────────────────────────────────

export async function fetchTickets({ branchId, status, priority, originType, limit = 100, offset = 0, assignedTo }) {
  let query = db.from('tickets').select('*').order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (originType) query = query.eq('origin_type', originType)
  if (assignedTo) query = query.eq('assigned_to', assignedTo)
  
  query = query.range(offset, offset + limit - 1)
  const { data, error } = await query
  return { data: toArray(data), error }
}

export async function fetchTicketDetail(ticketId) {
  const [ticketResult, commentsResult, auditResult] = await Promise.all([
    db.from('tickets').select('*').eq('id', ticketId).maybeSingle(),
    db.from('ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    db.from('ticket_audit_log').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: false }),
  ])
  if (ticketResult.error) return ticketResult

  // Load related feedback if exists
  let feedback = null
  if (ticketResult.data?.feedback_id) {
    const feedbackResult = await db.from('table_feedback').select('*').eq('id', ticketResult.data.feedback_id).maybeSingle()
    feedback = feedbackResult.data || null
  }

  // Load related form submission if exists
  let formSubmission = null
  if (ticketResult.data?.form_submission_id) {
    const formResult = await db.from('form_submissions').select('*').eq('id', ticketResult.data.form_submission_id).maybeSingle()
    formSubmission = formResult.data || null
  }

  // Load related quality report if exists
  let qualityReport = null
  if (ticketResult.data?.quality_report_id) {
    const qResult = await db.from('quality_reports').select('*').eq('id', ticketResult.data.quality_report_id).maybeSingle()
    qualityReport = qResult.data || null
  }

  // Load related tasks (multiple)
  const linkedTasksResult = await db
    .from('ticket_linked_tasks')
    .select('task_id, tasks(id, title, status, priority, due_at, created_at)')
    .eq('ticket_id', ticketId)
    .order('created_at')
  const linkedTasks = (linkedTasksResult.data || []).map(r => r.tasks).filter(Boolean)

  // Fallback: legacy single task_id
  let legacyTask = null
  if (ticketResult.data?.task_id && linkedTasks.length === 0) {
    const legacyRes = await db.from('tasks').select('id,title,status,priority,due_at,created_at').eq('id', ticketResult.data.task_id).maybeSingle()
    if (legacyRes.data) legacyTask = legacyRes.data
  }

  return {
    data: {
      ...ticketResult.data,
      comments: toArray(commentsResult.data),
      auditLog: toArray(auditResult.data),
      feedback,
      formSubmission,
      qualityReport,
      linkedTasks: legacyTask ? [legacyTask] : linkedTasks,
    },
    error: null,
  }
}

export async function createManualTicket({ branchId, categoryId, feedbackId, formSubmissionId, priority = 'normal', description, assignedTo, slaLevel = 'standard_24h', slaDeadlineMinutes, actorId, originType = 'manual' }) {
  const { data: slaPolicy } = await db.from('sla_policies').select('*').eq('sla_level', slaLevel).eq('active', true).maybeSingle()
  const deadlineMinutes = slaDeadlineMinutes || slaPolicy?.deadline_minutes || 1440
  const slaDeadline = new Date(Date.now() + deadlineMinutes * 60_000).toISOString()

  let assignedToName = ''
  if (assignedTo) {
    const { name } = await getEmployeeNameAndRecord(assignedTo)
    assignedToName = name
  }

  const { data: ticket, error } = await db.from('tickets').insert({
    branch_id: branchId || null,
    origin_type: originType,
    category_id: categoryId || null,
    feedback_id: feedbackId || null,
    form_submission_id: formSubmissionId || null,
    priority,
    status: assignedTo ? 'assigned' : 'open',
    assigned_to: assignedTo || null,
    assigned_to_name: assignedToName || null,
    sla_level: slaLevel,
    sla_deadline_at: slaDeadline,
    updated_at: nowIso(),
  }).select().maybeSingle()

  if (error) return { data: null, error }

  await appendTicketAuditEntry(ticket.id, 'created', actorId, { priority, description })

  if (description) {
    await db.from('ticket_comments').insert({
      ticket_id: ticket.id,
      author_id: actorId || 'system',
      body: description,
      visibility: 'internal',
    })
  }

  // Auto assign if not manually assigned
  if (!assignedTo) {
    await autoAssignTicket(ticket.id)
  } else {
    // Notify the assigned person
    await createNotification(
      assignedTo,
      'ticket_assigned',
      'Yeni Geribildirim Atandı',
      `Size yeni bir geribildirim atandı: #${String(ticket.id).slice(0, 8)}`,
      'ticket',
      ticket.id
    )
  }

  return { data: ticket, error: null }
}

// ─── Ticket Lifecycle ───────────────────────────────────────

export async function assignTicket(ticketId, personnelId, actorId) {
  const oldTicket = await db.from('tickets').select('status,assigned_to').eq('id', ticketId).maybeSingle()
  if (oldTicket.error) return oldTicket

  const { name: assignedToName } = await getEmployeeNameAndRecord(personnelId)

  const update = await db.from('tickets').update({
    assigned_to: personnelId,
    assigned_to_name: assignedToName || null,
    status: 'assigned',
    updated_at: nowIso(),
  }).eq('id', ticketId).select().maybeSingle()

  if (!update.error) {
    await appendTicketAuditEntry(ticketId, 'assigned', actorId, {
      old_assigned: oldTicket.data?.assigned_to,
      new_assigned: personnelId,
      assigned_to_name: assignedToName,
    })

    // Notify new assigned personnel
    await createNotification(
      personnelId,
      'ticket_assigned',
      'Geribildirim Ataması',
      `Size yeni bir geribildirim atandı: #${String(ticketId).slice(0, 8)}`,
      'ticket',
      ticketId
    )
  }
  return update
}

export async function autoAssignTicket(ticketId) {
  const { data: ticket, error: tErr } = await db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
  if (tErr || !ticket) return { error: tErr || new Error('Ticket not found') }

  // If already assigned or doesn't have a branch, do nothing
  if (ticket.assigned_to || !ticket.branch_id) return { data: ticket, error: null }

  try {
    const employees = await readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord)
    const positions = await readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord)

    // Find employees who manage this branch
    const branchManagers = employees.filter(emp => 
      !emp.deletedAt && 
      Array.isArray(emp.managedBranchIds) && 
      emp.managedBranchIds.includes(ticket.branch_id)
    )

    if (branchManagers.length === 0) return { data: ticket, error: null }

    // Sort/filter by position priorities (SBM is first priority, then VRD)
    let selectedManager = null
    const sbmPosition = positions.find(p => p.shortCode === 'SBM')
    const vrdPosition = positions.find(p => p.shortCode === 'VRD')

    if (sbmPosition) {
      selectedManager = branchManagers.find(m => m.positionId === sbmPosition.id)
    }
    if (!selectedManager && vrdPosition) {
      selectedManager = branchManagers.find(m => m.positionId === vrdPosition.id)
    }
    if (!selectedManager) {
      selectedManager = branchManagers[0]
    }

    if (selectedManager) {
      const managerFullName = `${selectedManager.firstName} ${selectedManager.lastName}`.trim()
      const update = await db.from('tickets').update({
        assigned_to: selectedManager.id,
        assigned_to_name: managerFullName,
        status: 'assigned',
        updated_at: nowIso(),
      }).eq('id', ticketId).select().maybeSingle()

      if (!update.error) {
        await appendTicketAuditEntry(ticketId, 'auto_assigned', 'system', {
          assigned_to: selectedManager.id,
          assigned_to_name: managerFullName,
        })

        // Notify
        await createNotification(
          selectedManager.id,
          'ticket_assigned',
          'Otomatik Geribildirim Atandı',
          `Sorumlu olduğunuz şubeden otomatik geribildirim atandı: #${String(ticketId).slice(0, 8)}`,
          'ticket',
          ticketId
        )
      }
      return update
    }
  } catch (e) {
    console.error('Error in autoAssignTicket:', e)
  }

  return { data: ticket, error: null }
}

export async function escalateTicket(ticketId, reason, actorId) {
  const { data: ticket, error: tErr } = await db.from('tickets').select('*').eq('id', ticketId).maybeSingle()
  if (tErr || !ticket) return { error: tErr || new Error('Ticket not found') }

  const update = await db.from('tickets').update({
    escalated: true,
    escalation_reason: reason,
    updated_at: nowIso(),
  }).eq('id', ticketId).select().maybeSingle()

  if (!update.error) {
    await appendTicketAuditEntry(ticketId, 'escalated', actorId, { reason })

    // Find and notify all Genel Merkez users
    try {
      const employees = await readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord)
      const headquartersUsers = employees.filter(emp => !emp.deletedAt && emp.authorityLevel === 'Genel Merkez')

      for (const user of headquartersUsers) {
        await createNotification(
          user.id,
          'ticket_escalated',
          'Geribildirim Eskale Edildi ⚠️',
          `Geribildirim #${String(ticketId).slice(0, 8)} eskale edildi. Neden: ${reason}`,
          'ticket',
          ticketId
        )
      }
    } catch (e) {
      console.error('Error sending escalation notifications:', e)
    }
  }
  return update
}

export async function updateTicketStatus(ticketId, newStatus, actorId, note) {
  const oldTicket = await db.from('tickets').select('status,assigned_to').eq('id', ticketId).maybeSingle()

  const updatePayload = { status: newStatus, updated_at: nowIso() }
  if (newStatus === 'resolved') {
    updatePayload.resolved_at = nowIso()
    if (note) updatePayload.resolution_note = note
  }
  if (newStatus === 'closed') {
    updatePayload.closed_at = nowIso()
  }

  const update = await db.from('tickets').update(updatePayload).eq('id', ticketId).select().maybeSingle()

  if (!update.error) {
    await appendTicketAuditEntry(ticketId, 'status_changed', actorId, {
      old_status: oldTicket.data?.status,
      new_status: newStatus,
      note,
    })

    // Notify assigned user if state changed by someone else
    if (oldTicket.data?.assigned_to && oldTicket.data.assigned_to !== actorId) {
      await createNotification(
        oldTicket.data.assigned_to,
        'status_changed',
        'Geribildirim Durumu Güncellendi',
        `Geribildirim #${String(ticketId).slice(0, 8)} durumu yeni değerle güncellendi: ${newStatus}`,
        'ticket',
        ticketId
      )
    }
  }
  return update
}

export async function resolveTicket(ticketId, actorId, resolutionNote) {
  return updateTicketStatus(ticketId, 'resolved', actorId, resolutionNote)
}

export async function closeTicket(ticketId, actorId) {
  return updateTicketStatus(ticketId, 'closed', actorId)
}

// ─── Ticket → Task Integration (new multi-task) ─────────────

export async function createLinkedTaskFromTicket(ticketId, taskForm, actor) {
  // Direct DB insert — no employee-lookup risk
  const now = new Date()
  const due = new Date(now.getTime() + 24 * 60 * 60 * 1000)

  const taskInsert = await db.from('tasks').insert({
    branch_node_id: taskForm.locationId || null,
    created_by_personnel_id: actor?.id || null,
    title: taskForm.title,
    description: taskForm.description || '',
    status: 'open',
    priority: taskForm.priority || 'normal',
    due_at: taskForm.dueAt || due.toISOString(),
    start_at: now.toISOString(),
    has_specific_time: false,
    timezone: 'Europe/Istanbul',
    is_recurring: false,
    recurrence_rule_id: null,
    delegation_allowed: taskForm.delegation_allowed ?? true,
    approval_required: taskForm.approval_required ?? false,
    closure_summary_required: taskForm.closure_summary_required ?? true,
    closure_file_required: taskForm.closure_file_required ?? false,
    closure_image_required: taskForm.closure_image_required ?? false,
    edit_due_date_allowed: taskForm.edit_due_date_allowed ?? false,
    edit_schedule_allowed: taskForm.edit_schedule_allowed ?? false,
    incomplete_if_late: taskForm.incomplete_if_late ?? true,
    updated_at: now.toISOString(),
  }).select().maybeSingle()

  if (taskInsert.error) return { data: null, error: taskInsert.error }
  const task = taskInsert.data

  // Participants
  const participantRows = []
  if (taskForm.responsibleId) {
    participantRows.push({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: taskForm.responsibleId,
      position_id: null,
      node_id: taskForm.locationId || null,
    })
  }
  for (const id of (taskForm.collaboratorIds || [])) {
    participantRows.push({ task_id: task.id, participant_type: 'assignee', personnel_id: id, position_id: null, node_id: null })
  }
  for (const id of (taskForm.observerIds || [])) {
    participantRows.push({ task_id: task.id, participant_type: 'watcher', personnel_id: id, position_id: null, node_id: null })
  }
  if (participantRows.length) {
    await db.from('task_participants').insert(participantRows)
  }

  // Chat thread + system note
  const threadRes = await db.from('task_chat_threads').insert({ task_id: task.id }).select().maybeSingle()
  if (threadRes.data?.id) {
    await db.from('task_history').insert({ task_id: task.id, action: 'created', performed_by: actor?.id || null, metadata: { title: task.title } })
    await db.from('task_chat_messages').insert({
      thread_id: threadRes.data.id,
      task_id: task.id,
      message_type: 'system',
      sender_id: null,
      body: `Geribildirim #${String(ticketId).slice(0, 8)} için düzeltici görev olarak oluşturuldu.`,
      metadata: { source: 'ticket', ticket_id: ticketId },
    })
  }

  // Link to ticket via junction table (upsert-safe)
  await db.from('ticket_linked_tasks').upsert({ ticket_id: ticketId, task_id: task.id }).select()

  // Also update legacy task_id if column exists (first task only)
  await db.from('tickets').update({ task_id: task.id, status: 'in_progress', updated_at: now.toISOString() }).eq('id', ticketId).is('task_id', null)

  await appendTicketAuditEntry(ticketId, 'task_created', actor?.id || 'system', {
    task_id: task.id,
    task_title: task.title,
  })

  // Notify assignee
  if (taskForm.responsibleId && taskForm.responsibleId !== actor?.id) {
    await createNotification(
      taskForm.responsibleId,
      'task_assigned',
      'Yeni Düzeltici Görev Atandı',
      `Geribildirim #${String(ticketId).slice(0, 8)} için size bir düzeltici görev oluşturuldu: "${task.title}"`,
      'task',
      task.id
    )
  }

  return { data: task, error: null }
}

// ─── Legacy (single task) — kept for backward compatibility ───

export async function createTaskFromTicket(ticket, actor) {
  const categories = await db.from('ticket_categories').select('*').eq('id', ticket.category_id).maybeSingle()
  const categoryName = categories.data?.name || 'Geribildirim'
  const branchShort = String(ticket.branch_id || '').slice(0, 8)

  const taskForm = {
    title: `Geribildirim Düzeltici Görev / #${String(ticket.id).slice(0, 8)}`,
    description: ticket.resolution_note || `Geribildirim #${String(ticket.id).slice(0, 8)} (${categoryName}) için düzeltici görev.`,
    locationId: ticket.branch_id,
    priority: ticket.priority || 'normal',
    responsibleId: ticket.assigned_to || null,
    collaboratorIds: [],
    observerIds: [],
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    delegation_allowed: true,
    approval_required: false,
    closure_summary_required: true,
    closure_file_required: false,
    closure_image_required: false,
    edit_due_date_allowed: false,
    edit_schedule_allowed: false,
    incomplete_if_late: true,
  }

  return createLinkedTaskFromTicket(ticket.id, taskForm, actor)
}

// ─── Ticket Comments ────────────────────────────────────────

export async function addTicketComment(ticketId, authorId, body, visibility = 'internal') {
  const comment = await db.from('ticket_comments').insert({
    ticket_id: ticketId,
    author_id: authorId,
    body: String(body || '').trim(),
    visibility,
  }).select().maybeSingle()

  if (!comment.error && comment.data) {
    // Notify assignee (if comment by someone else)
    const { data: ticket } = await db.from('tickets').select('assigned_to').eq('id', ticketId).maybeSingle()
    if (ticket && ticket.assigned_to && ticket.assigned_to !== authorId) {
      await createNotification(
        ticket.assigned_to,
        'ticket_comment',
        'Yeni Geribildirim Yorumu',
        `Geribildiriminize yeni bir yorum eklendi: #${String(ticketId).slice(0, 8)}`,
        'ticket',
        ticketId
      )
    }
  }

  return comment
}

// ─── Win-back Coupon Integration ────────────────────────────

export async function attachWinbackCoupon(ticketId, couponId, actorId) {
  const update = await db.from('tickets').update({
    winback_coupon_id: couponId,
    updated_at: nowIso(),
  }).eq('id', ticketId).select().maybeSingle()

  if (!update.error) {
    await appendTicketAuditEntry(ticketId, 'coupon_sent', actorId, { coupon_id: couponId })
  }
  return update
}

// ─── SLA Breach Check ───────────────────────────────────────

export async function checkAndMarkSlaBreaches() {
  const { data: tickets } = await db.from('tickets')
    .select('id,sla_deadline_at,sla_breached,status,assigned_to')
    .eq('sla_breached', false)
    .not('status', 'in', '("resolved","closed")')

  const now = new Date()
  const breached = toArray(tickets).filter(ticket => {
    if (!ticket.sla_deadline_at) return false
    return new Date(ticket.sla_deadline_at) < now
  })

  const results = []
  for (const ticket of breached) {
    const update = await db.from('tickets').update({
      sla_breached: true,
      updated_at: nowIso(),
    }).eq('id', ticket.id).select().maybeSingle()

    if (!update.error) {
      await appendTicketAuditEntry(ticket.id, 'sla_breached', null, {
        sla_deadline_at: ticket.sla_deadline_at,
        breached_at: nowIso(),
      })
      
      // Notify assigned person
      if (ticket.assigned_to) {
        await createNotification(
          ticket.assigned_to,
          'sla_breach',
          'SLA Süresi Aşıldı! 🚨',
          `Geribildirim #${String(ticket.id).slice(0, 8)} için SLA süresi aşıldı!`,
          'ticket',
          ticket.id
        )

        // Escalate to Genel Merkez users immediately
        await escalateTicket(ticket.id, 'SLA Süresi Aşıldı - Otomatik Eskalasyon', 'system')
      }

      results.push(update.data)
    }
  }

  return { data: results, count: results.length, error: null }
}

// ─── Ticket Audit Log ───────────────────────────────────────

async function appendTicketAuditEntry(ticketId, action, performedBy, metadata = {}) {
  return db.from('ticket_audit_log').insert({
    ticket_id: ticketId,
    action,
    performed_by: performedBy,
    old_value: metadata.old_status || metadata.old_assigned || null,
    new_value: metadata.new_status || metadata.new_assigned || action,
    metadata,
  })
}
