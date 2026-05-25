import { loadLoyaltyCustomerCategoryAssignments } from '@/lib/loyalty'
import { db } from '@/lib/db'

const POS_LOYALTY_LINKS_KEY = 'pos_loyalty_link_sessions_v1'
const POS_LOYALTY_SESSION_TIMEOUT_SEC = 180

function uid(prefix = 'pos_loyalty') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function normalizeStringList(values) {
  return Array.isArray(values)
    ? values.map(value => String(value || '').trim()).filter(Boolean)
    : []
}

async function readJsonSetting(key, fallbackValue) {
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error) throw error
  return data?.value ?? fallbackValue
}

async function writeJsonSetting(key, value) {
  const { error } = await db
    .from('settings')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) throw error
}

function normalizeSession(session = {}) {
  return {
    token: String(session.token || uid('pos_link')),
    branchId: String(session.branchId || ''),
    branchName: normalizeText(session.branchName, ''),
    registerNo: String(session.registerNo || '1'),
    registerLabel: normalizeText(session.registerLabel, 'POS 1'),
    customerId: normalizeText(session.customerId, ''),
    customerName: normalizeText(session.customerName, ''),
    phone: normalizeText(session.phone, ''),
    customerCategoryIds: normalizeStringList(session.customerCategoryIds),
    customerCreatedAt: normalizeText(session.customerCreatedAt || session.created_at, ''),
    customerFirstOrderAt: normalizeText(session.customerFirstOrderAt || session.first_order_at, ''),
    customerLastVisitAt: normalizeText(session.customerLastVisitAt || session.last_visit_at, ''),
    selectedCampaignId: normalizeText(session.selectedCampaignId, ''),
    selectedCampaignIds: Array.isArray(session.selectedCampaignIds) ? session.selectedCampaignIds.map(String) : [],
    selectedCampaignName: normalizeText(session.selectedCampaignName, ''),
    selectedCouponCode: normalizeText(session.selectedCouponCode, '').toUpperCase(),
    selectedCouponLabel: normalizeText(session.selectedCouponLabel, ''),
    status: ['pending', 'linked', 'consumed', 'expired'].includes(session.status)
      ? session.status
      : 'pending',
    createdAt: normalizeText(session.createdAt, new Date().toISOString()),
    expiresAt: normalizeText(
      session.expiresAt,
      new Date(Date.now() + POS_LOYALTY_SESSION_TIMEOUT_SEC * 1000).toISOString(),
    ),
  }
}

function stripExpiredSessions(items = []) {
  const now = Date.now()

  return (items || [])
    .map(normalizeSession)
    .filter(session => {
      const expiresAt = new Date(session.expiresAt).getTime()
      return Number.isFinite(expiresAt) && expiresAt > now - 60000 && session.status !== 'expired'
    })
}

async function loadCurrentSessions() {
  return stripExpiredSessions(await readJsonSetting(POS_LOYALTY_LINKS_KEY, []))
}

async function persistSessions(sessions = []) {
  await writeJsonSetting(POS_LOYALTY_LINKS_KEY, sessions.map(normalizeSession))
}

async function loadCustomerCategoryIdsForSession(session = {}, customerId) {
  const scopes = [{ scope: 'global' }]

  if (session.branchId || session.branchName) {
    scopes.push({
      scope: 'branch',
      branchId: session.branchId || '',
      branchName: session.branchName || '',
    })
  }

  const results = await Promise.all(
    scopes.map(scope => loadLoyaltyCustomerCategoryAssignments(scope, customerId)),
  )

  return [...new Set(
    results.flatMap(result => result?.schemaReady ? (result.selectedCategoryIds || []) : []),
  )]
}

export function extractPosLoyaltyToken(input = '') {
  const raw = String(input || '').trim()
  if (!raw) return ''

  const mobileRouteMatch = raw.match(/\/musteri-app\/pos\/([^/?#]+)/i)
  if (mobileRouteMatch?.[1]) return mobileRouteMatch[1]

  const routeMatch = raw.match(/\/pos-loyalty-link\/([^/?#]+)/i)
  if (routeMatch?.[1]) return routeMatch[1]

  return raw.replace(/[^a-z0-9_-]/gi, '')
}

export function getPosLoyaltyLinkUrl(token) {
  const safeToken = String(token || '').trim()
  if (!safeToken) return ''
  if (typeof window === 'undefined') return `/musteri-app/pos/${safeToken}`
  return `${window.location.origin}/musteri-app/pos/${safeToken}`
}

export async function createPosLoyaltyLinkSession({
  branchId = '',
  branchName = '',
  registerNo = '1',
  registerLabel = 'POS 1',
  timeoutSec = POS_LOYALTY_SESSION_TIMEOUT_SEC,
} = {}) {
  const current = await loadCurrentSessions()
  const nextSession = normalizeSession({
    token: uid('pos_link'),
    branchId,
    branchName,
    registerNo,
    registerLabel,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + Math.max(30, Number(timeoutSec || POS_LOYALTY_SESSION_TIMEOUT_SEC)) * 1000).toISOString(),
  })

  await persistSessions([...current, nextSession])
  return nextSession
}

export async function readPosLoyaltyLinkSession(token) {
  const safeToken = String(token || '').trim()
  if (!safeToken) return null

  const current = await loadCurrentSessions()
  return current.find(item => item.token === safeToken) || null
}

export async function linkCustomerToPosLoyaltySession(token, customer, {
  selectedCampaignId = '',
  selectedCampaignName = '',
  selectedCouponCode = '',
  selectedCouponLabel = '',
  selectedCampaignIds = [],
} = {}) {
  const safeToken = String(token || '').trim()
  if (!safeToken) throw new Error('Baglanti kodu bulunamadi.')

  const current = await loadCurrentSessions()
  const currentSession = current.find(item => item.token === safeToken)
  if (!currentSession) throw new Error('Bu POS baglantisi bulunamadi veya suresi doldu.')

  const customerCategoryIds = await loadCustomerCategoryIdsForSession(currentSession, customer?.id)

  let createdAt = customer?.created_at || customer?.customerCreatedAt || null
  let firstOrderAt = customer?.first_order_at || customer?.customerFirstOrderAt || null
  let lastVisitAt = customer?.last_visit_at || customer?.customerLastVisitAt || null

  if (customer?.id && (!createdAt || !firstOrderAt || !lastVisitAt)) {
    try {
      const { data, error } = await db
        .from('musteriler')
        .select('created_at,first_order_at,last_visit_at')
        .eq('id', customer.id)
        .maybeSingle()
      if (!error && data) {
        if (!createdAt) createdAt = data.created_at || null
        if (!firstOrderAt) firstOrderAt = data.first_order_at || null
        if (!lastVisitAt) lastVisitAt = data.last_visit_at || null
      }
    } catch {
      // Ignored fallback failure.
    }
  }

  const next = current.map(item => (
    item.token === safeToken
      ? normalizeSession({
          ...item,
          customerId: customer?.id || '',
          customerName: customer?.ad_soyad || customer?.name || '',
          phone: customer?.telefon || '',
          customerCategoryIds,
          customerCreatedAt: createdAt,
          customerFirstOrderAt: firstOrderAt,
          customerLastVisitAt: lastVisitAt,
          selectedCampaignId: selectedCampaignId || item.selectedCampaignId || '',
          selectedCampaignIds: selectedCampaignIds.length > 0 ? selectedCampaignIds : (item.selectedCampaignIds || []),
          selectedCampaignName: selectedCampaignName || item.selectedCampaignName || '',
          selectedCouponCode: String(selectedCouponCode || item.selectedCouponCode || '').toUpperCase(),
          selectedCouponLabel: selectedCouponLabel || item.selectedCouponLabel || '',
          status: 'linked',
        })
      : item
  ))

  await persistSessions(next)
  return next.find(item => item.token === safeToken) || null
}

export async function selectCampaignInPosLoyaltySession(token, { campaignId = '', campaignName = '', couponCode = '', couponLabel = '' } = {}) {
  const safeToken = String(token || '').trim()
  if (!safeToken) throw new Error('Baglanti kodu bulunamadi.')

  const current = await loadCurrentSessions()
  const currentSession = current.find(item => item.token === safeToken)
  if (!currentSession) throw new Error('Bu POS baglantisi bulunamadi veya suresi doldu.')

  const next = current.map(item => (
    item.token === safeToken
      ? normalizeSession({
          ...item,
          selectedCampaignId: String(campaignId || ''),
          selectedCampaignName: String(campaignName || ''),
          selectedCouponCode: String(couponCode || '').toUpperCase(),
          selectedCouponLabel: String(couponLabel || ''),
        })
      : item
  ))

  await persistSessions(next)
  return next.find(item => item.token === safeToken) || null
}

export async function loadCustomerLoyaltyCategoryIds({ branchId = '', branchName = '' } = {}, customerId) {
  return loadCustomerCategoryIdsForSession({ branchId, branchName }, customerId)
}

export async function consumePosLoyaltyLinkSession(token) {
  const safeToken = String(token || '').trim()
  if (!safeToken) return

  const current = await loadCurrentSessions()
  const next = current.map(item => (
    item.token === safeToken
      ? normalizeSession({ ...item, status: 'consumed' })
      : item
  ))

  await persistSessions(next)
}
