import { db } from '@/lib/db'

function sanitizeValue(value) {
  if (value === undefined) return null
  return value
}

export async function logActivity({
  user = null,
  actionType,
  route = null,
  entityType = null,
  entityId = null,
  metadata = {},
} = {}) {
  if (!actionType) return

  try {
    let resolvedUser = user
    if (!resolvedUser) {
      const { data, error } = await db.auth.getUser()
      if (error) throw error
      resolvedUser = data?.user || null
    }

    if (!resolvedUser?.id || !resolvedUser?.email) return

    const payload = {
      user_id: resolvedUser.id,
      user_email: resolvedUser.email.toLowerCase(),
      action_type: actionType,
      route: sanitizeValue(route ?? window.location.pathname),
      entity_type: sanitizeValue(entityType),
      entity_id: sanitizeValue(entityId),
      metadata: metadata || {},
    }

    const { error } = await db.from('activity_logs').insert(payload)
    if (error) throw error
  } catch (error) {
    console.warn(`Activity log failed for ${actionType}`, error)
  }
}
