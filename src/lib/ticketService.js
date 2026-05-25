import { db } from '@/lib/db'
import { createTask, appendSystemNote } from '@/lib/taskService'

// ─── Helpers ────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

// ─── Ticket CRUD ────────────────────────────────────────────

export async function fetchTickets({ branchId, status, priority, originType, limit = 100, offset = 0 }) {
  let query = db.from('tickets').select('*').order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (originType) query = query.eq('origin_type', originType)
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

  return {
    data: {
      ...ticketResult.data,
      comments: toArray(commentsResult.data),
      auditLog: toArray(auditResult.data),
      feedback,
      formSubmission,
    },
    error: null,
  }
}

export async function createManualTicket({ branchId, categoryId, feedbackId, priority = 'normal', description, assignedTo, slaLevel = 'standard_24h', slaDeadlineMinutes, actorId }) {
  const { data: slaPolicy } = await db.from('sla_policies').select('*').eq('sla_level', slaLevel).eq('active', true).maybeSingle()
  const deadlineMinutes = slaDeadlineMinutes || slaPolicy?.deadline_minutes || 1440
  const slaDeadline = new Date(Date.now() + deadlineMinutes * 60_000).toISOString()

  const { data: ticket, error } = await db.from('tickets').insert({
    branch_id: branchId,
    origin_type: 'manual',
    category_id: categoryId || null,
    feedback_id: feedbackId || null,
    priority,
    status: assignedTo ? 'assigned' : 'open',
    assigned_to: assignedTo || null,
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

  return { data: ticket, error: null }
}

// ─── Ticket Lifecycle ───────────────────────────────────────

export async function assignTicket(ticketId, personnelId, actorId) {
  const oldTicket = await db.from('tickets').select('status,assigned_to').eq('id', ticketId).maybeSingle()
  const update = await db.from('tickets').update({
    assigned_to: personnelId,
    status: 'assigned',
    updated_at: nowIso(),
  }).eq('id', ticketId).select().maybeSingle()

  if (!update.error) {
    await appendTicketAuditEntry(ticketId, 'assigned', actorId, {
      old_assigned: oldTicket.data?.assigned_to,
      new_assigned: personnelId,
    })
  }
  return update
}

export async function updateTicketStatus(ticketId, newStatus, actorId, note) {
  const oldTicket = await db.from('tickets').select('status').eq('id', ticketId).maybeSingle()

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
  }
  return update
}

export async function resolveTicket(ticketId, actorId, resolutionNote) {
  return updateTicketStatus(ticketId, 'resolved', actorId, resolutionNote)
}

export async function closeTicket(ticketId, actorId) {
  return updateTicketStatus(ticketId, 'closed', actorId)
}

// ─── Ticket → Task Integration ──────────────────────────────

export async function createTaskFromTicket(ticket, actor) {
  const categories = await db.from('ticket_categories').select('*').eq('id', ticket.category_id).maybeSingle()
  const categoryName = categories.data?.name || 'Bilet'

  const taskForm = {
    title: `[Bilet] ${categoryName} — Şube ${ticket.branch_id}`,
    description: ticket.resolution_note || `Bilet #${String(ticket.id).slice(0, 8)} için düzeltici görev.`,
    locationId: ticket.branch_id,
    priority: ticket.priority || 'normal',
    responsibleId: ticket.assigned_to || null,
    collaboratorIds: [],
    observerIds: [],
    completionDate: ticket.sla_deadline_at || null,
    approval_required: false,
    closure_summary_required: true,
    closure_image_required: false,
    closure_file_required: false,
  }

  const result = await createTask(taskForm, actor, [])
  if (result.error) return result

  // Link task to ticket
  await db.from('tickets').update({
    task_id: result.data.id,
    status: 'in_progress',
    updated_at: nowIso(),
  }).eq('id', ticket.id)

  await appendTicketAuditEntry(ticket.id, 'task_created', actor.id, {
    task_id: result.data.id,
    task_title: taskForm.title,
  })

  return result
}

// ─── Ticket Comments ────────────────────────────────────────

export async function addTicketComment(ticketId, authorId, body, visibility = 'internal') {
  return db.from('ticket_comments').insert({
    ticket_id: ticketId,
    author_id: authorId,
    body: String(body || '').trim(),
    visibility,
  }).select().maybeSingle()
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
    .select('id,sla_deadline_at,sla_breached,status')
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
