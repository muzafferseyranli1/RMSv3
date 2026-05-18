import { db } from '@/lib/db'

export const MOBILE_CUSTOMER_CACHE_KEY = 'suitable_mobile_loyalty_customer_v1'

export function normalizeStoredMobileCustomer(value) {
  if (!value?.id) return null
  return {
    id: String(value.id || ''),
    ad_soyad: String(value.ad_soyad || value.name || ''),
    telefon: String(value.telefon || ''),
    telefon_ulke: String(value.telefon_ulke || ''),
    email: String(value.email || ''),
    loyalty_member_no: String(value.loyalty_member_no || ''),
    home_branch_name: String(value.home_branch_name || ''),
  }
}

export function readStoredMobileCustomer() {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(MOBILE_CUSTOMER_CACHE_KEY)
    return normalizeStoredMobileCustomer(raw ? JSON.parse(raw) : null)
  } catch {
    return null
  }
}

export function writeStoredMobileCustomer(customer) {
  try {
    if (typeof window === 'undefined') return
    const normalized = normalizeStoredMobileCustomer(customer)
    if (normalized) window.localStorage.setItem(MOBILE_CUSTOMER_CACHE_KEY, JSON.stringify(normalized))
    else window.localStorage.removeItem(MOBILE_CUSTOMER_CACHE_KEY)
  } catch {
    // Best-effort persistence only.
  }
}

export function clearStoredMobileCustomer() {
  writeStoredMobileCustomer(null)
}

export async function searchMobileCustomers(query) {
  const rawQuery = String(query || '').trim()
  if (!rawQuery) return []

  const digits = rawQuery.replace(/\D/g, '')
  const fields = 'id,ad_soyad,telefon,telefon_ulke,email,loyalty_member_no,loyalty_status,home_branch_name'
  let request = db.from('musteriler').select(fields).is('deleted_at', null).limit(12)

  if (digits.length >= 3) {
    request = request.or(`telefon.like.%${digits}%,loyalty_member_no.ilike.%${rawQuery}%`)
  } else {
    request = request.or(`ad_soyad.ilike.%${rawQuery}%,loyalty_member_no.ilike.%${rawQuery}%`)
  }

  const { data, error } = await request
  if (error) throw error
  return (data || []).map(normalizeStoredMobileCustomer).filter(Boolean)
}
