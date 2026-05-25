import { db } from '@/lib/db'

// ─── Helpers ────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

// ─── Feedback (table_feedback) CRUD ─────────────────────────

export async function fetchFeedbackList({ branchId, limit = 100, offset = 0, ratingFilter = null }) {
  let query = db.from('table_feedback').select('*').order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  if (ratingFilter != null) query = query.eq('rating', ratingFilter)
  query = query.range(offset, offset + limit - 1)
  const { data, error } = await query
  return { data: toArray(data), error }
}

export async function fetchFeedbackDetail(feedbackId) {
  return db.from('table_feedback').select('*').eq('id', feedbackId).maybeSingle()
}

export async function createManualFeedback({ branchId, source = 'manual', rating, comment, customerPhone, customerId, staffId, metadata = {} }) {
  return db.from('table_feedback').insert({
    branch_id: branchId,
    table_id: null,
    rating: Number(rating) || 3,
    comment: String(comment || '').trim() || null,
    customer_phone: customerPhone || null,
    customer_id: customerId || null,
    source,
    staff_id: staffId || null,
    metadata,
  }).select().maybeSingle()
}

// ─── SLA Policies ───────────────────────────────────────────

export async function fetchSlaPolicies() {
  const { data, error } = await db.from('sla_policies').select('*').eq('active', true).order('deadline_minutes')
  return { data: toArray(data), error }
}

export function calculateSlaDeadline(createdAt, deadlineMinutes) {
  const base = new Date(createdAt || new Date())
  return new Date(base.getTime() + (Number(deadlineMinutes) || 1440) * 60_000).toISOString()
}

export async function resolveSlaPolicyForPriority(priority) {
  const levelMap = {
    critical: 'critical_15min',
    high: 'urgent_1h',
    normal: 'standard_24h',
    low: 'low_48h',
  }
  const slaLevel = levelMap[priority] || 'standard_24h'
  const { data } = await db.from('sla_policies').select('*').eq('sla_level', slaLevel).eq('active', true).maybeSingle()
  return data || { sla_level: slaLevel, deadline_minutes: 1440 }
}

// ─── Ticket Categories ──────────────────────────────────────

export async function fetchTicketCategories({ activeOnly = true } = {}) {
  let query = db.from('ticket_categories').select('*').order('sort_order')
  if (activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  return { data: toArray(data), error }
}

export async function createTicketCategory({ name, slug, icon, color, sortOrder }) {
  return db.from('ticket_categories').insert({
    name,
    slug: String(slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    icon: icon || 'fa-tag',
    color: color || '#64748b',
    sort_order: Number(sortOrder) || 0,
  }).select().maybeSingle()
}

export async function updateTicketCategory(categoryId, updates) {
  return db.from('ticket_categories').update({
    ...updates,
    slug: updates.slug ? String(updates.slug).toLowerCase().replace(/[^a-z0-9_]/g, '_') : undefined,
  }).eq('id', categoryId).select().maybeSingle()
}

export async function deleteTicketCategory(categoryId) {
  return db.from('ticket_categories').update({ active: false }).eq('id', categoryId).select().maybeSingle()
}

// ─── Feedback → Ticket Auto-Triage ─────────────────────────

const RISK_KEYWORDS = [
  'zehir', 'böcek', 'kıl', 'kirli', 'kötü', 'berbat', 'rezalet', 'hasta', 'kırık',
  'iğrenç', 'bozuk', 'kokuyor', 'bayat', 'çiğ', 'çürük', 'kurt', 'küflü',
]

export function shouldAutoCreateTicket(feedback) {
  if ((Number(feedback.rating) || 5) <= 2) return true
  const comment = String(feedback.comment || '').toLowerCase()
  return RISK_KEYWORDS.some(keyword => comment.includes(keyword))
}

export function detectCategorySuggestion(comment) {
  const text = String(comment || '').toLowerCase()
  if (/zehir|böcek|kıl|kirli|hijyen|temiz|küf/.test(text)) return 'hygiene'
  if (/yemek|tat|soğuk|bayat|çiğ|çürük|bozuk/.test(text)) return 'food_quality'
  if (/garson|kaba|ilgisiz|geç|yavaş|bekle/.test(text)) return 'service'
  if (/kırık|bozuk|çalışmıyor|arıza/.test(text)) return 'equipment'
  return 'other'
}

export async function triageFeedbackToTicket(feedback, { actorId = null, categoryId = null } = {}) {
  if (!shouldAutoCreateTicket(feedback)) return null

  const categories = (await fetchTicketCategories()).data || []
  const suggestedSlug = detectCategorySuggestion(feedback.comment)
  const resolvedCategoryId = categoryId || categories.find(c => c.slug === suggestedSlug)?.id || categories.find(c => c.slug === 'other')?.id || null

  const priority = (Number(feedback.rating) || 5) <= 1 ? 'high' : 'normal'
  const slaPolicy = await resolveSlaPolicyForPriority(priority)
  const slaDeadline = calculateSlaDeadline(feedback.created_at || new Date(), slaPolicy.deadline_minutes)

  const { data: ticket, error } = await db.from('tickets').insert({
    branch_id: feedback.branch_id,
    feedback_id: feedback.id,
    origin_type: 'feedback',
    category_id: resolvedCategoryId,
    priority,
    status: 'open',
    sla_level: slaPolicy.sla_level,
    sla_deadline_at: slaDeadline,
    updated_at: nowIso(),
  }).select().maybeSingle()

  if (error) return { data: null, error }

  // Link back to feedback
  await db.from('table_feedback').update({ ticket_id: ticket.id }).eq('id', feedback.id)

  // Audit log entry
  await db.from('ticket_audit_log').insert({
    ticket_id: ticket.id,
    action: 'created',
    performed_by: actorId,
    new_value: 'open',
    metadata: {
      source: 'auto_triage',
      feedback_rating: feedback.rating,
      feedback_comment: String(feedback.comment || '').slice(0, 200),
    },
  })

  return { data: ticket, error: null }
}
