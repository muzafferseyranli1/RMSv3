import { db } from '@/lib/db'
import { loadLoyaltyWorkspace } from '@/lib/loyalty'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function sameDayKey(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function addDays(dateValue, days) {
  const date = new Date(dateValue)
  if (!Number.isFinite(date.getTime())) return null
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000)
}

function isRecentFuture(value, days = 7) {
  if (!value) return false
  const now = new Date()
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return false
  return date >= now && date <= addDays(now, days)
}

function isLiveCampaignNow(campaign = {}) {
  if (campaign.active === false) return false
  const now = new Date()
  const startsAt = campaign.startsAt ? new Date(campaign.startsAt) : null
  const endsAt = campaign.endsAt ? new Date(campaign.endsAt) : null
  if (startsAt && Number.isFinite(startsAt.getTime()) && startsAt > now) return false
  if (endsAt && Number.isFinite(endsAt.getTime()) && endsAt < now) return false
  return true
}

function matchesAudience(campaign = {}, customer = {}) {
  const audienceType = String(campaign.audienceType || 'all')
  const orderCount = asNumber(customer.total_order_count ?? customer.siparis_sayisi ?? customer.total_order_count, 0)
  const lastVisitAt = customer.last_visit_at || customer.last_visit_at
  const daysSinceLastVisit = lastVisitAt
    ? Math.floor((Date.now() - new Date(lastVisitAt).getTime()) / (24 * 60 * 60 * 1000))
    : null
  const customerTags = normalizeJsonArray(customer.tags).map(tag => String(tag || ''))
  const audienceCategoryIds = asArray(campaign.audienceCategoryIds).map(id => String(id || ''))
  const hasMembership = Boolean(customer.loyalty_enrolled_at || customer.loyalty_member_no || customer.loyalty_status === 'member')

  if (audienceType === 'all') return true
  if (audienceType === 'members') return hasMembership
  if (audienceType === 'new_customers') return orderCount <= 1
  if (audienceType === 'inactive_customers') return daysSinceLastVisit != null ? daysSinceLastVisit >= 30 : false
  if (audienceType === 'tagged_customers') {
    if (audienceCategoryIds.length === 0) return customerTags.length > 0
    return audienceCategoryIds.some(categoryId => customerTags.includes(categoryId))
  }
  return false
}

function deriveCampaignBucket(campaign, customer) {
  const personalized = matchesAudience(campaign, customer)
  if (!campaign.startsAt && !campaign.endsAt && personalized) return 'personalized'
  if (!campaign.startsAt && !campaign.endsAt) return 'public'
  const now = new Date()
  const startsAt = campaign.startsAt ? new Date(campaign.startsAt) : null
  const endsAt = campaign.endsAt ? new Date(campaign.endsAt) : null
  if (startsAt && Number.isFinite(startsAt.getTime()) && startsAt > now) return 'upcoming'
  if (endsAt && Number.isFinite(endsAt.getTime()) && endsAt >= now && endsAt <= addDays(now, 7)) return 'ending'
  return personalized ? 'personalized' : 'public'
}

function deriveTierSnapshot(customer, tiers = [], wallets = []) {
  const sortedTiers = [...tiers].sort((left, right) => asNumber(left.sortOrder, 0) - asNumber(right.sortOrder, 0))
  const tierById = new Map(sortedTiers.map(tier => [String(tier.id || ''), tier]))
  const customerOrderCount = asNumber(customer.total_order_count ?? customer.siparis_sayisi, 0)
  const customerOrderAmount = asNumber(customer.total_order_amount, 0)
  const walletTierId = wallets.find(wallet => wallet.tier_id)?.tier_id
  const walletTier = walletTierId ? tierById.get(String(walletTierId)) : null

  let currentTier = walletTier
  if (!currentTier) {
    currentTier = sortedTiers.reduce((best, tier) => {
      const minOrderCount = asNumber(tier.minOrderCount, 0)
      const minSpend = asNumber(tier.minSpend, 0)
      if (customerOrderCount >= minOrderCount && customerOrderAmount >= minSpend) return tier
      return best
    }, sortedTiers[0] || null)
  }

  const currentIndex = currentTier
    ? sortedTiers.findIndex(tier => String(tier.id) === String(currentTier.id))
    : -1
  const nextTier = currentIndex >= 0 ? sortedTiers[currentIndex + 1] || null : sortedTiers[0] || null

  let progressLabel = 'Aktif seviyedesin'
  let progressRatio = currentTier ? 100 : 0
  let remainingLabel = 'Bir ust seviye tanimli degil'

  if (currentTier && nextTier) {
    const targetOrders = asNumber(nextTier.minOrderCount, 0)
    const targetSpend = asNumber(nextTier.minSpend, 0)
    if (targetOrders > customerOrderCount) {
      const remainingOrders = Math.max(0, targetOrders - customerOrderCount)
      progressRatio = targetOrders > 0 ? Math.min(100, Math.round((customerOrderCount / targetOrders) * 100)) : 0
      remainingLabel = `${remainingOrders} ziyaret daha kaldı`
      progressLabel = `${customerOrderCount} / ${targetOrders} ziyaret`
    } else if (targetSpend > customerOrderAmount) {
      const remainingSpend = Math.max(0, targetSpend - customerOrderAmount)
      progressRatio = targetSpend > 0 ? Math.min(100, Math.round((customerOrderAmount / targetSpend) * 100)) : 0
      remainingLabel = `${remainingSpend.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL hacim kaldı`
      progressLabel = `${customerOrderAmount.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} / ${targetSpend.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`
    } else {
      progressRatio = 100
      remainingLabel = `${nextTier.name} seviyesi hazır`
      progressLabel = 'Hedef tamamlandi'
    }
  } else if (currentTier) {
    progressRatio = 100
    remainingLabel = 'En yuksek seviyedesin'
    progressLabel = 'Tum tier hedefleri tamamlandi'
  }

  return {
    currentTier,
    nextTier,
    progressRatio,
    progressLabel,
    remainingLabel,
  }
}

function deriveCustomerDisplayName(customer = {}) {
  const fullName = asText(customer.ad_soyad).trim()
  if (!fullName) return 'Misafir'
  const [firstName] = fullName.split(/\s+/)
  return firstName || fullName
}

function deriveMemberCode(customer = {}) {
  const explicit = asText(customer.loyalty_member_no).trim()
  if (explicit) return explicit
  const phone = asText(customer.normalized_phone || customer.telefon).replace(/\D/g, '')
  if (phone) return `RMS-${phone.slice(-8)}`
  const fallbackId = asText(customer.external_customer_ref || customer.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()
  return fallbackId ? `RMS-${fallbackId}` : 'RMS-LOYALTY'
}

export async function loadCustomerRoster() {
  const { data, error } = await db
    .from('musteriler')
    .select('id,ad_soyad,telefon,telefon_ulke,loyalty_status,loyalty_enrolled_at,loyalty_member_no,total_order_count,total_order_amount,last_order_at,home_branch_name,mobile_app_user_id')
    .is('deleted_at', null)
    .order('total_order_amount', { ascending: false })
    .order('last_order_at', { ascending: false })
    .limit(40)

  if (error) throw error
  return data || []
}

export function pickDefaultCustomer(customers = []) {
  const prioritized = [...customers].sort((left, right) => {
    const leftScore = Number(Boolean(left.loyalty_enrolled_at || left.loyalty_member_no || left.mobile_app_user_id)) * 10
      + asNumber(left.total_order_amount, 0)
    const rightScore = Number(Boolean(right.loyalty_enrolled_at || right.loyalty_member_no || right.mobile_app_user_id)) * 10
      + asNumber(right.total_order_amount, 0)
    return rightScore - leftScore
  })
  return prioritized[0] || null
}

export async function loadCustomerMobileSnapshot(customerId) {
  const { data: customerRows, error: customerError } = await db
    .from('musteriler')
    .select('id,ad_soyad,email,telefon,telefon_ulke,adresler,birth_date,gender,preferred_language,loyalty_member_no,loyalty_status,loyalty_enrolled_at,sms_opt_in,email_opt_in,push_opt_in,kvkk_consent_at,marketing_consent_at,acquisition_source,signup_channel,home_branch_id,home_branch_name,first_order_at,last_order_at,last_visit_at,total_order_count,total_order_amount,avg_ticket_amount,tags,external_customer_ref,mobile_app_user_id,referral_code,notlar,metadata')
    .eq('id', customerId)
    .limit(1)

  if (customerError) throw customerError
  const customer = customerRows?.[0] || null
  if (!customer) throw new Error('Müşteri bulunamadı.')

  const queryResults = await Promise.all([
    db.from('loyalty_wallets')
      .select('id,program_id,tier_id,wallet_type,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points,last_transaction_at,metadata')
      .eq('customer_id', customerId)
      .order('updated_at', { ascending: false }),
    db.from('loyalty_transactions')
      .select('id,wallet_id,program_id,campaign_id,tier_id,wallet_type,transaction_type,status,source_channel,source_type,source_ref_id,source_ref_no,branch_name,points_delta,points_before,points_after,monetary_amount,expires_at,occurred_at,note,metadata')
      .eq('customer_id', customerId)
      .order('occurred_at', { ascending: false })
      .limit(80),
    db.from('loyalty_reward_entitlements')
      .select('id,program_id,campaign_id,entitlement_type,entitlement_status,title,description,target_scope_type,target_scope_json,reward_payload,quantity,earned_at,available_from,expires_at,consumed_at,metadata')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('earned_at', { ascending: false }),
    db.from('loyalty_frequency_progress')
      .select('id,program_id,campaign_id,progress_type,current_count,target_count,completed_cycles,last_qualified_at,metadata,updated_at')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),
    db.from('loyalty_coupons')
      .select('id,series_id,customer_id,code,is_used,used_at,redeemed_channel,source_ref_id,active,redemption_status,metadata,created_at,expires_at')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    db.from('loyalty_campaign_redemptions')
      .select('id,campaign_id,wallet_id,transaction_id,redemption_status,source_channel,source_ref_id,redeemed_at,metadata')
      .eq('customer_id', customerId)
      .order('redeemed_at', { ascending: false })
      .limit(40),
  ])

  const missingTables = []
  const nonSchemaErrors = []
  const tableNames = [
    'loyalty_wallets',
    'loyalty_transactions',
    'loyalty_reward_entitlements',
    'loyalty_frequency_progress',
    'loyalty_coupons',
    'loyalty_campaign_redemptions',
  ]

  queryResults.forEach((result, index) => {
    if (!result.error) return
    const text = String(result.error.message || '')
    if (text.includes('does not exist') || result.error.code === 'PGRST204') missingTables.push(tableNames[index])
    else nonSchemaErrors.push(`${tableNames[index]}: ${text || 'okunamadı'}`)
  })

  const workspaceResults = await Promise.all([
    loadLoyaltyWorkspace({ scope: 'global' }),
    customer.home_branch_id || customer.home_branch_name
      ? loadLoyaltyWorkspace({
        scope: 'branch',
        branchId: customer.home_branch_id || '',
        branchName: customer.home_branch_name || '',
      })
      : Promise.resolve(null),
  ])

  const globalWorkspace = workspaceResults[0]
  const branchWorkspace = workspaceResults[1]
  const mergedCampaignsById = new Map()
  ;[...(globalWorkspace?.campaigns || []), ...(branchWorkspace?.campaigns || [])].forEach(campaign => {
    mergedCampaignsById.set(String(campaign.id), campaign)
  })

  const mergedCouponSeriesById = new Map()
  ;[...(globalWorkspace?.couponSeries || []), ...(branchWorkspace?.couponSeries || [])].forEach(series => {
    mergedCouponSeriesById.set(String(series.id), series)
  })

  return {
    customer,
    missingTables: [...new Set(missingTables)],
    errorText: nonSchemaErrors.join(' | '),
    wallets: queryResults[0].data || [],
    transactions: queryResults[1].data || [],
    entitlements: queryResults[2].data || [],
    progressRows: queryResults[3].data || [],
    coupons: queryResults[4].data || [],
    redemptions: queryResults[5].data || [],
    program: branchWorkspace?.program || globalWorkspace?.program || null,
    tiers: (branchWorkspace?.tiers?.length ? branchWorkspace.tiers : globalWorkspace?.tiers) || [],
    campaigns: Array.from(mergedCampaignsById.values()).sort((left, right) => asNumber(left.priority, 0) - asNumber(right.priority, 0)),
    couponSeriesMap: Object.fromEntries(Array.from(mergedCouponSeriesById.entries())),
  }
}

export function buildCustomerMobileViewModel(snapshot) {
  const customer = snapshot.customer || {}
  const wallets = snapshot.wallets || []
  const transactions = snapshot.transactions || []
  const entitlements = snapshot.entitlements || []
  const coupons = snapshot.coupons || []
  const campaigns = snapshot.campaigns || []
  const couponSeriesMap = snapshot.couponSeriesMap || {}
  const pointsWallets = wallets.filter(wallet => wallet.wallet_type === 'points')
  const storedValueWallets = wallets.filter(wallet => wallet.wallet_type === 'stored_value')
  const rewardWallets = wallets.filter(wallet => wallet.wallet_type === 'reward')
  const pointBalance = pointsWallets.reduce((sum, wallet) => sum + asNumber(wallet.current_points_balance, 0), 0)
  const storedValueBalance = storedValueWallets.reduce((sum, wallet) => sum + asNumber(wallet.current_points_balance, 0), 0)
  const rewardBalance = rewardWallets.reduce((sum, wallet) => sum + asNumber(wallet.current_points_balance, 0), 0)
  const availableEntitlements = entitlements.filter(item => item.entitlement_status === 'available')
  const tierSnapshot = deriveTierSnapshot(customer, snapshot.tiers || [], wallets)

  const couponCards = coupons.map(coupon => {
    const metadata = coupon.metadata && typeof coupon.metadata === 'object' ? coupon.metadata : {}
    const series = couponSeriesMap[String(coupon.series_id)] || {}
    const benefitConfig = series.benefitConfig || {}
    const benefitText = benefitConfig.percent
      ? `%${benefitConfig.percent} indirim`
      : benefitConfig.amount
        ? `${benefitConfig.amount} TL indirim`
        : benefitConfig.productName
          ? `${benefitConfig.productName} ikram`
          : (series.name || 'Sadakat kuponu')

    const status = String(coupon.redemption_status || (coupon.is_used ? 'used' : 'available') || 'available')
    return {
      ...coupon,
      seriesName: series.name || 'Kupon serisi',
      benefitText,
      channelLabel: coupon.redeemed_channel || metadata.redeemed_channel || metadata.source_channel || 'POS / Kiosk / Masa',
      ruleText: metadata.rule_text || metadata.ruleText || 'Kasada veya kioskte okutularak kullanılır.',
      issuedAt: coupon.created_at,
      expiresAt: coupon.expires_at || metadata.expires_at || '',
      status,
    }
  })

  const activeCoupons = couponCards.filter(coupon => ['available', 'reserved'].includes(coupon.status))
  const expiringCoupons = activeCoupons.filter(coupon => isRecentFuture(coupon.expiresAt, 7))
  const passiveCoupons = couponCards.filter(coupon => !['available', 'reserved'].includes(coupon.status))

  const campaignCards = campaigns.map(campaign => ({
    ...campaign,
    bucket: deriveCampaignBucket(campaign, customer),
    personalized: matchesAudience(campaign, customer),
    activeNow: isLiveCampaignNow(campaign),
    mobileEligible: asArray(campaign.channelTargets).length === 0 || asArray(campaign.channelTargets).includes('mobile'),
  }))

  const quickHighlights = [
    pointBalance > 0 ? `${pointBalance.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} puan hazır` : '',
    storedValueBalance > 0 ? `${storedValueBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL bakiye var` : '',
    activeCoupons.length > 0 ? `${activeCoupons.length} kupon kullanıma açık` : '',
    availableEntitlements.length > 0 ? `${availableEntitlements.length} hak seni bekliyor` : '',
  ].filter(Boolean)

  const latestActivityDate = [
    customer.last_visit_at,
    customer.last_order_at,
    transactions[0]?.occurred_at,
  ].find(Boolean)

  return {
    customer,
    displayName: deriveCustomerDisplayName(customer),
    memberCode: deriveMemberCode(customer),
    pointBalance,
    storedValueBalance,
    rewardBalance,
    walletCount: wallets.length,
    availableEntitlements,
    transactions,
    progressRows: snapshot.progressRows || [],
    activeCoupons,
    expiringCoupons,
    passiveCoupons,
    campaigns: campaignCards,
    tierSnapshot,
    latestActivityDate,
    quickHighlights,
    homeBranchName: customer.home_branch_name || 'Favori şube atanmadı',
    profileTags: normalizeJsonArray(customer.tags).map(tag => String(tag || '')).filter(Boolean),
    addresses: normalizeJsonArray(customer.adresler),
    activeMembership: Boolean(customer.loyalty_enrolled_at || customer.loyalty_member_no || wallets.length > 0),
    schemaReady: snapshot.missingTables.length === 0,
    errorText: snapshot.errorText,
    missingTables: snapshot.missingTables,
  }
}

export function formatMobileMoney(value) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(asNumber(value, 0))
}

export function formatMobileNumber(value, digits = 0) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(asNumber(value, 0))
}

export function formatMobileDate(value, options = {}) {
  if (!value) return '-'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return new Intl.DateTimeFormat('tr-TR', options).format(date)
}

export function formatMobileRelativeDateLabel(value) {
  const key = sameDayKey(value)
  if (!key) return '-'
  const today = sameDayKey(new Date())
  if (key === today) return 'Bugün'
  const yesterday = sameDayKey(addDays(new Date(), -1))
  if (key === yesterday) return 'Dün'
  return formatMobileDate(value, { day: '2-digit', month: 'short' })
}
