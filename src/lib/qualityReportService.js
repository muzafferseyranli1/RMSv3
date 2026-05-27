import { db } from '@/lib/db'
import { createNotification } from '@/lib/notificationService'

// Helper for ISO timestamp
function nowIso() {
  return new Date().toISOString()
}

/**
 * Creates a new quality report (non-standard product report),
 * creates an associated ticket with 'quality' origin, automatically assigns it to 
 * the Quality Specialist, and notifies them.
 * 
 * @param {Object} report - The report data
 * @param {string} report.branchId - Branch ID
 * @param {string} report.reportedBy - Employee ID who reported it
 * @param {string} report.productName - Product name
 * @param {string} report.stockItemId - Associated stock item UUID (optional)
 * @param {string} report.supplierName - Supplier name (optional)
 * @param {string} report.description - Details of the issue
 * @param {string} report.severity - 'low', 'normal', 'high', 'critical'
 * @param {Array<string>} report.photoUrls - Array of image URLs
 * @param {string} actorId - Active employee user ID
 */
export async function createQualityReport(report, actorId) {
  const { branchId, reportedBy, productName, stockItemId, supplierName, description, severity = 'normal', photoUrls = [] } = report

  // 1. Insert Quality Report record first
  const { data: qualityReport, error: qError } = await db
    .from('quality_reports')
    .insert({
      branch_id: branchId,
      reported_by: reportedBy,
      report_type: 'non_standard_product',
      product_name: productName,
      stock_item_id: stockItemId || null,
      supplier_name: supplierName || null,
      description,
      severity,
      photo_urls: photoUrls,
      status: 'open',
      assigned_to: 'emp_kalite_sorumlusu', // Kemal Kaliteci
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select()
    .maybeSingle()

  if (qError || !qualityReport) {
    return { data: null, error: qError || new Error('Failed to create quality report') }
  }

  // 2. Create the associated Ticket
  // Map severity to priority
  const priority = severity === 'critical' ? 'critical' : (severity === 'high' ? 'high' : (severity === 'low' ? 'low' : 'normal'))
  
  // Set 24 hour SLA deadline
  const slaDeadline = new Date(Date.now() + 1440 * 60_000).toISOString()

  const { data: ticket, error: tError } = await db
    .from('tickets')
    .insert({
      branch_id: branchId,
      origin_type: 'quality',
      priority,
      status: 'assigned',
      assigned_to: 'emp_kalite_sorumlusu',
      assigned_to_name: 'Kemal Kaliteci',
      sla_level: 'standard_24h',
      sla_deadline_at: slaDeadline,
      quality_report_id: qualityReport.id,
      created_at: nowIso(),
      updated_at: nowIso()
    })
    .select()
    .maybeSingle()

  if (tError || !ticket) {
    // Attempt rollback/delete of quality report to be clean
    await db.from('quality_reports').delete().eq('id', qualityReport.id)
    return { data: null, error: tError || new Error('Failed to create associated ticket') }
  }

  // 3. Update the Quality Report with the ticket ID
  await db
    .from('quality_reports')
    .update({ ticket_id: ticket.id })
    .eq('id', qualityReport.id)

  // 4. Create an entry in ticket audit log
  await db.from('ticket_audit_log').insert({
    ticket_id: ticket.id,
    action: 'created',
    performed_by: actorId || 'system',
    new_value: 'open',
    metadata: {
      origin_type: 'quality',
      quality_report_id: qualityReport.id,
      product_name: productName,
      description
    }
  })

  // Add initial description as comment in ticket comments
  await db.from('ticket_comments').insert({
    ticket_id: ticket.id,
    author_id: actorId || 'system',
    body: `[Standart Dışı Ürün Bildirimi] Ürün: ${productName}. ${supplierName ? `Tedarikçi: ${supplierName}. ` : ''}Açıklama: ${description}`,
    visibility: 'internal'
  })

  // 5. Trigger notification for Kemal Kaliteci (emp_kalite_sorumlusu)
  await createNotification(
    'emp_kalite_sorumlusu',
    'quality_report',
    'Yeni Kalite Bildirimi',
    `${branchId} şubesinden yeni standart dışı ürün bildirimi yapıldı: ${productName}`,
    'ticket',
    ticket.id
  )

  return { data: { ...qualityReport, ticket_id: ticket.id }, error: null }
}

/**
 * Fetches all quality reports.
 */
export async function fetchQualityReports({ branchId, status, limit = 50 } = {}) {
  let query = db.from('quality_reports').select('*').order('created_at', { ascending: false })
  if (branchId) query = query.eq('branch_id', branchId)
  if (status) query = query.eq('status', status)
  query = query.limit(limit)

  const { data, error } = await query
  return { data: data || [], error }
}

/**
 * Updates status of quality report and syncs with associated ticket.
 */
export async function updateQualityReportStatus(reportId, status, resolutionNote = null, actorId) {
  const { data: report, error: fetchErr } = await db
    .from('quality_reports')
    .select('ticket_id')
    .eq('id', reportId)
    .maybeSingle()

  if (fetchErr || !report) return { error: fetchErr || new Error('Report not found') }

  // Update quality report status
  const updatePayload = { status, updated_at: nowIso() }
  if (resolutionNote) updatePayload.resolution_note = resolutionNote

  const { data: updatedReport, error } = await db
    .from('quality_reports')
    .update(updatePayload)
    .eq('id', reportId)
    .select()
    .maybeSingle()

  if (error) return { error }

  // Update associated ticket status if ticket exists
  if (report.ticket_id) {
    let ticketStatus = 'in_progress'
    if (status === 'resolved') ticketStatus = 'resolved'
    if (status === 'closed') ticketStatus = 'closed'

    const tPayload = { status: ticketStatus, updated_at: nowIso() }
    if (status === 'resolved') {
      tPayload.resolved_at = nowIso()
      if (resolutionNote) tPayload.resolution_note = resolutionNote
    }
    if (status === 'closed') {
      tPayload.closed_at = nowIso()
    }

    await db.from('tickets').update(tPayload).eq('id', report.ticket_id)

    // Append to audit log
    await db.from('ticket_audit_log').insert({
      ticket_id: report.ticket_id,
      action: 'status_changed',
      performed_by: actorId,
      old_value: 'open',
      new_value: ticketStatus,
      metadata: { status: ticketStatus, note: resolutionNote }
    })
  }

  return { data: updatedReport, error: null }
}
