import { db } from '@/lib/db'

/**
 * Creates a new notification in the database.
 * @param {string} recipientId - The ID of the employee to receive the notification
 * @param {string} type - The notification type:
 *   Geribildirim: 'ticket_assigned' | 'ticket_comment' | 'sla_warning' | 'sla_breach' | 'status_changed' | 'quality_report' | 'ticket_escalated'
 *   Görev:        'task_assigned' | 'task_comment' | 'task_status_changed'
 *   Duyuru:       'announcement'
 * @param {string} title - The notification title
 * @param {string} body - The detailed notification text
 * @param {string} referenceType - 'ticket' | 'task' | 'announcement' | 'quality_report' (optional)
 * @param {string} referenceId - UUID of the referenced object (optional)
 */
export async function createNotification(recipientId, type, title, body, referenceType = null, referenceId = null) {
  if (!recipientId) return { error: 'recipientId is required' }
  
  const { data, error } = await db
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      type,
      title,
      body,
      reference_type: referenceType,
      reference_id: referenceId,
      is_read: false,
      created_at: new Date().toISOString()
    })

  return { data, error }
}

/**
 * Görev atama bildirimi gönderir.
 * @param {string} recipientId - Görevi atanan kişinin ID'si
 * @param {string} taskTitle - Görev başlığı
 * @param {string} taskId - Görev UUID'si
 * @param {string} assignerName - Atayan kişinin adı
 */
export async function notifyTaskAssigned(recipientId, taskTitle, taskId, assignerName = '') {
  return createNotification(
    recipientId,
    'task_assigned',
    'Yeni Görev Atandı',
    assignerName
      ? `${assignerName} tarafından "${taskTitle}" görevi size atandı.`
      : `"${taskTitle}" görevi size atandı.`,
    'task',
    taskId
  )
}

/**
 * Görev yorumu bildirimi gönderir.
 * @param {string} recipientId - Bildirim alacak kişinin ID'si
 * @param {string} taskTitle - Görev başlığı
 * @param {string} taskId - Görev UUID'si
 * @param {string} commenterName - Yorum yapan kişinin adı
 */
export async function notifyTaskComment(recipientId, taskTitle, taskId, commenterName = '') {
  return createNotification(
    recipientId,
    'task_comment',
    'Görev Yorumu',
    commenterName
      ? `${commenterName}, "${taskTitle}" görevine yorum yaptı.`
      : `"${taskTitle}" görevine yeni bir yorum eklendi.`,
    'task',
    taskId
  )
}

/**
 * Duyuru bildirimi çok sayıda kişiye gönderir.
 * @param {string[]} recipientIds - Bildirim alacak kişilerin ID listesi
 * @param {string} announcementTitle - Duyuru başlığı
 * @param {string} announcementBody - Duyuru özeti
 * @param {string} announcementId - Duyuru UUID'si (opsiyonel)
 */
export async function notifyAnnouncement(recipientIds, announcementTitle, announcementBody, announcementId = null) {
  if (!recipientIds?.length) return { error: 'recipientIds required' }
  const rows = recipientIds.map(id => ({
    recipient_id: id,
    type: 'announcement',
    title: 'Yeni Duyuru',
    body: announcementTitle || announcementBody || 'Yeni bir duyuru yayınlandı.',
    reference_type: 'announcement',
    reference_id: announcementId,
    is_read: false,
    created_at: new Date().toISOString(),
  }))
  return db.from('notifications').insert(rows)
}



/**
 * Fetches notifications for a specific employee.
 * @param {string} personnelId - The ID of the employee
 * @param {Object} options - Query options
 * @param {boolean} options.unreadOnly - Fetch only unread notifications
 * @param {number} options.limit - Max records to return
 */
export async function fetchMyNotifications(personnelId, { unreadOnly = false, limit = 50 } = {}) {
  if (!personnelId) return { data: [], error: null }

  let query = db.from('notifications').eq('recipient_id', personnelId)

  if (unreadOnly) {
    query = query.eq('is_read', false)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  return { data: data || [], error }
}

/**
 * Marks a notification as read.
 * @param {string} notificationId - Notification UUID
 */
export async function markAsRead(notificationId) {
  if (!notificationId) return { error: 'notificationId is required' }
  const { data, error } = await db
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  return { data, error }
}

/**
 * Marks all notifications for a specific employee as read.
 * @param {string} personnelId - Employee ID
 */
export async function markAllAsRead(personnelId) {
  if (!personnelId) return { error: 'personnelId is required' }
  const { data, error } = await db
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', personnelId)
    .eq('is_read', false)

  return { data, error }
}

/**
 * Gets the number of unread notifications for a specific employee.
 * @param {string} personnelId - Employee ID
 */
export async function getUnreadCount(personnelId) {
  if (!personnelId) return { count: 0, error: null }
  
  const { data, error } = await db
    .from('notifications')
    .select('id')
    .eq('recipient_id', personnelId)
    .eq('is_read', false)

  return { count: data ? data.length : 0, error }
}
