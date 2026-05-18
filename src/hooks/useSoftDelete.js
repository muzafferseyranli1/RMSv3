import { db } from '@/lib/db'

/**
 * Soft-delete helpers
 * softDelete(table, id)   → deleted_at = now()
 * restore(table, id)      → deleted_at = null
 */
export async function softDelete(table, id) {
  return db.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
}

export async function restore(table, id) {
  return db.from(table).update({ deleted_at: null }).eq('id', id)
}
