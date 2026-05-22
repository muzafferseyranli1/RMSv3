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
    .select('id,ad_soyad,email,telefon,telefon_ulke,adresler,birth_date,gender,preferred_language,loyalty_member_no,loyalty_status,loyalty_enrolled_at,sms_opt_in,email_opt_in,push_opt_in,kvkk_consent_at,marketing_consent_at,acquisition_source,signup_channel,home_branch_id,home_branch_name,first_order_at,last_order_at,last_visit_at,total_order_count,total_order_amount,avg_ticket_amount,tags,external_customer_ref,mobile_app_user_id,referral_code,notlar,metadata,created_at,referred_by_customer_id')
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
    db.from('musteriler')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by_customer_id', customerId),
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
    referredCount: queryResults[6]?.count || 0,
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
    referredCount: snapshot.referredCount || 0,
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

export async function bindCouponToCustomer(customerId, couponCode) {
  if (!customerId) throw new Error('Geçersiz müşteri oturumu.')
  if (!couponCode || !couponCode.trim()) throw new Error('Lütfen bir kupon kodu girin.')

  const cleanCode = couponCode.trim()

  const { data: couponRows, error: fetchError } = await db
    .from('loyalty_coupons')
    .select('id, customer_id, code, is_used, redemption_status, active, deleted_at, expires_at')
    .ilike('code', cleanCode)
    .is('deleted_at', null)
    .limit(1)

  if (fetchError) throw fetchError
  const coupon = couponRows?.[0]
  if (!coupon) {
    throw new Error('Geçersiz veya bulunamayan kupon kodu.')
  }

  if (coupon.customer_id) {
    if (String(coupon.customer_id) === String(customerId)) {
      throw new Error('Bu kupon zaten hesabınıza tanımlı.')
    } else {
      throw new Error('Bu kupon kodu başka bir hesaba tanımlı.')
    }
  }

  if (coupon.is_used || coupon.redemption_status === 'used') {
    throw new Error('Bu kupon zaten kullanılmış.')
  }

  if (coupon.redemption_status === 'expired' || (coupon.expires_at && new Date(coupon.expires_at) < new Date())) {
    throw new Error('Bu kuponun süresi dolmuş.')
  }

  if (!coupon.active) {
    throw new Error('Bu kupon aktif değil.')
  }

  const { error: updateError } = await db
    .from('loyalty_coupons')
    .update({
      customer_id: customerId,
      updated_at: new Date().toISOString()
    })
    .eq('id', coupon.id)

  if (updateError) throw updateError
  return coupon
}

export async function getActiveReferralPrograms() {
  const { data: programs, error } = await db
    .from('loyalty_referral_programs')
    .select('id, name, mode, config_json, allowed_referrer_categories, success_criteria, success_purchase_count, active')
    .is('deleted_at', null)
    .eq('active', true)
    .order('created_at')
  
  if (error) throw error
  return programs || []
}

// Wrapper for backwards compatibility / tests if needed
export async function getActiveReferralCampaign() {
  const programs = await getActiveReferralPrograms()
  if (!programs || programs.length === 0) return null
  return {
    campaign: { id: programs[0].id, name: programs[0].name },
    config: {
      mode: programs[0].mode,
      allowed_referrer_categories: programs[0].allowed_referrer_categories,
      ...programs[0].config_json
    }
  }
}

export function checkReferralEligibility(customer, program) {
  if (!program) {
    return { eligible: false, reason: 'Aktif bir referans programı bulunmamaktadır.' }
  }
  const allowedCategories = normalizeJsonArray(program.allowed_referrer_categories || (program.config && program.config.allowed_referrer_categories))
  if (allowedCategories.length > 0) {
    const customerTags = normalizeJsonArray(customer.tags).map(tag => String(tag || '').trim().toLowerCase())
    const hasAllowedTag = allowedCategories.some(cat => customerTags.includes(String(cat || '').trim().toLowerCase()))
    if (!hasAllowedTag) {
      return { eligible: false, reason: 'Referans kodu oluşturmak için yetkili kategoride değilsiniz.' }
    }
  }
  return { eligible: true, program }
}

export async function generateReferralCode(customerId, programId) {
  if (!customerId) throw new Error('Geçersiz müşteri oturumu.')
  if (!programId) throw new Error('Geçersiz referans programı seçimi.')

  const { data: customerRows, error: customerError } = await db
    .from('musteriler')
    .select('id, tags, referral_code')
    .eq('id', customerId)
    .limit(1)

  if (customerError) throw customerError
  const customer = customerRows?.[0]
  if (!customer) throw new Error('Müşteri bulunamadı.')

  const { data: programRows, error: programError } = await db
    .from('loyalty_referral_programs')
    .select('*')
    .eq('id', programId)
    .is('deleted_at', null)
    .limit(1)
  if (programError) throw programError
  const program = programRows?.[0]
  if (!program || !program.active) {
    throw new Error('Referans programı bulunamadı veya aktif değil.')
  }

  const eligibility = checkReferralEligibility(customer, program)
  if (!eligibility.eligible) {
    throw new Error(eligibility.reason || 'Referans kodu oluşturmaya yetkili değilsiniz.')
  }

  const config = program.config_json || {}
  const mode = program.mode || 'unique_multiple'

  if (mode === 'unique_multiple') {
    const { data: existingCodes, error: countError } = await db
      .from('loyalty_referral_codes')
      .select('id')
      .eq('program_id', programId)
      .eq('referrer_customer_id', customerId)

    if (countError) throw countError
    const limit = Number(config.max_unique_codes || 4)
    if (existingCodes && existingCodes.length >= limit) {
      throw new Error(`En fazla ${limit} adet davet kodu üretebilirsiniz. Limitiniz dolmuştur.`)
    }

    let attempts = 0
    let inserted = null
    while (!inserted && attempts < 5) {
      const referralCode = `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      const { data, error: insertError } = await db
        .from('loyalty_referral_codes')
        .insert({
          program_id: programId,
          referrer_customer_id: customerId,
          referral_code: referralCode,
          is_used: false,
        })
        .select('*')
        .single()

      if (insertError) {
        if (insertError.code === '23505' || String(insertError.message).includes('duplicate') || String(insertError.message).includes('already exists')) {
          attempts++
          continue
        }
        throw insertError
      }
      inserted = data
      return referralCode
    }
    if (!inserted) throw new Error('Benzersiz kod üretilemedi. Lütfen tekrar deneyin.')
  } else {
    // Single reusable modes
    if (customer.referral_code) {
      return customer.referral_code
    }

    let attempts = 0
    let updated = false
    while (!updated && attempts < 5) {
      const referralCode = `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
      const { error: updateError } = await db
        .from('musteriler')
        .update({ referral_code: referralCode })
        .eq('id', customerId)

      if (updateError) {
        if (updateError.code === '23505' || String(updateError.message).includes('duplicate') || String(updateError.message).includes('already exists')) {
          attempts++
          continue
        }
        throw updateError
      }
      updated = true
      return referralCode
    }
    if (!updated) throw new Error('Benzersiz kod üretilemedi. Lütfen tekrar deneyin.')
  }
}

export async function validateReferralCode(refereeId, code) {
  if (!refereeId) throw new Error('Geçersiz kullanıcı oturumu.')
  if (!code || !code.trim()) throw new Error('Lütfen bir davet kodu girin.')

  const cleanCode = code.trim().toUpperCase()

  const { data: referee, error: refereeError } = await db
    .from('musteriler')
    .select('id, referred_by_customer_id, created_at, total_order_count, siparis_sayisi')
    .eq('id', refereeId)
    .limit(1)
    .single()

  if (refereeError) throw refereeError
  if (!referee) throw new Error('Müşteri bulunamadı.')

  if (referee.referred_by_customer_id) {
    throw new Error('Zaten başka bir kullanıcı tarafından davet edilmişsiniz.')
  }

  const orderCount = Number(referee.total_order_count ?? referee.siparis_sayisi ?? 0)
  if (orderCount > 0) {
    throw new Error('Geriye dönük referans kodu girişi yapabilmek için henüz sipariş vermemiş olmanız gerekir.')
  }

  const createdAt = referee.created_at ? new Date(referee.created_at) : new Date()
  const daysDiff = (new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  if (daysDiff > 7) {
    throw new Error('Geriye dönük referans kodu girişi sadece kayıttan sonraki ilk 7 gün içinde yapılabilir.')
  }

  // 1. Check loyalty_referral_codes
  const { data: codeRow, error: codeRowError } = await db
    .from('loyalty_referral_codes')
    .select('id, program_id, referrer_customer_id, is_used')
    .eq('referral_code', cleanCode)
    .limit(1)
    .maybeSingle()

  if (codeRowError) throw codeRowError

  if (codeRow) {
    if (codeRow.is_used) {
      throw new Error('Bu davet kodu zaten kullanılmış.')
    }
    if (String(codeRow.referrer_customer_id) === String(refereeId)) {
      throw new Error('Kendi davet kodunuzu kullanamazsınız.')
    }

    const { data: program, error: progError } = await db
      .from('loyalty_referral_programs')
      .select('*')
      .eq('id', codeRow.program_id)
      .limit(1)
      .single()

    if (progError) throw progError
    if (!program || !program.active) {
      throw new Error('Bu kodun bağlı olduğu referans programı aktif değil.')
    }

    // Check if referee already has tracking for this program
    const { data: existingTracking, error: trackingError } = await db
      .from('loyalty_referral_tracking')
      .select('id')
      .eq('program_id', program.id)
      .eq('referee_customer_id', refereeId)
      .limit(1)
      .maybeSingle()
    if (trackingError) throw trackingError
    if (existingTracking) {
      throw new Error('Bu referans programına zaten katılmışsınız.')
    }

    const { data: referrer, error: refError } = await db
      .from('musteriler')
      .select('id, ad_soyad, tags')
      .eq('id', codeRow.referrer_customer_id)
      .limit(1)
      .single()

    if (refError) throw refError
    if (!referrer) throw new Error('Davet eden üye bulunamadı.')

    const eligibility = checkReferralEligibility(referrer, program)
    if (!eligibility.eligible) {
      throw new Error('Bu davet kodunu oluşturan üye artık davet yetkisine sahip değil.')
    }

    return {
      isValid: true,
      mode: 'unique_multiple',
      programId: program.id,
      referrerId: referrer.id,
      referrerName: referrer.ad_soyad,
      codeRowId: codeRow.id,
      referralCode: cleanCode,
    }
  }

  // 2. Check musteriler (reusable codes)
  const { data: referrer, error: referrerError } = await db
    .from('musteriler')
    .select('id, ad_soyad, referral_code, tags')
    .eq('referral_code', cleanCode)
    .limit(1)
    .maybeSingle()

  if (referrerError) throw referrerError

  if (referrer) {
    if (String(referrer.id) === String(refereeId)) {
      throw new Error('Kendi davet kodunuzu kullanamazsınız.')
    }

    const activePrograms = await getActiveReferralPrograms()
    const reusablePrograms = activePrograms.filter(p => ['single_reusable_date', 'single_reusable_limit'].includes(p.mode))

    if (!reusablePrograms || reusablePrograms.length === 0) {
      throw new Error('Şu anda aktif bir referans programı bulunmamaktadır.')
    }

    let firstErrorMsg = null
    for (const program of reusablePrograms) {
      try {
        // Check if referee already has tracking for this program
        const { data: existingTracking } = await db
          .from('loyalty_referral_tracking')
          .select('id')
          .eq('program_id', program.id)
          .eq('referee_customer_id', refereeId)
          .limit(1)
          .maybeSingle()
        if (existingTracking) {
          continue
        }

        const eligibility = checkReferralEligibility(referrer, program)
        if (!eligibility.eligible) {
          continue
        }

        const config = program.config_json || {}
        if (program.mode === 'single_reusable_date') {
          const now = new Date()
          const validFrom = config.valid_from ? new Date(config.valid_from) : null
          const validUntil = config.valid_until ? new Date(config.valid_until) : null
          if (validFrom && validFrom > now) {
            throw new Error('Bu davet kodunun geçerlilik süresi henüz başlamamış.')
          }
          if (validUntil && validUntil < now) {
            throw new Error('Bu davet kodunun geçerlilik süresi dolmuş.')
          }
        } else if (program.mode === 'single_reusable_limit') {
          const { data: trackingCountRes } = await db
            .from('loyalty_referral_tracking')
            .select('id')
            .eq('program_id', program.id)
            .eq('referrer_customer_id', referrer.id)

          const referredCount = Array.isArray(trackingCountRes) ? trackingCountRes.length : 0
          const limit = Number(config.max_redemptions_per_referrer || 4)
          if (referredCount >= limit) {
            throw new Error('Bu davet kodu kullanım limitine ulaşmış.')
          }
        }

        return {
          isValid: true,
          mode: program.mode,
          programId: program.id,
          referrerId: referrer.id,
          referrerName: referrer.ad_soyad,
          referralCode: cleanCode,
        }
      } catch (err) {
        if (!firstErrorMsg) {
          firstErrorMsg = err.message
        }
      }
    }

    if (firstErrorMsg) {
      throw new Error(firstErrorMsg)
    }
    throw new Error('Bu davet koduna uygun aktif bir referans programı bulunamadı veya katılım limiti aşıldı.')
  }

  throw new Error('Geçersiz veya bulunamayan davet kodu.')
}

async function awardLoyaltyPoints(customerId, points, campaignId, note, type = 'campaign_bonus', extraMeta = {}) {
  if (points <= 0) return null

  const { data: wallets, error: walletError } = await db
    .from('loyalty_wallets')
    .select('id,current_points_balance,lifetime_earned_points')
    .eq('customer_id', customerId)
    .eq('wallet_type', 'points')
    .limit(1)
  
  if (walletError) throw walletError
  let wallet = wallets?.[0]
  const now = new Date().toISOString()
  
  if (!wallet) {
    const { data: inserted, error: insertError } = await db
      .from('loyalty_wallets')
      .insert({
        customer_id: customerId,
        program_id: null,
        tier_id: null,
        wallet_type: 'points',
        current_points_balance: points,
        lifetime_earned_points: points,
        lifetime_burned_points: 0,
        lifetime_expired_points: 0,
        metadata: { createdBy: 'referral_system', ...extraMeta }
      })
      .select('id,current_points_balance,lifetime_earned_points')
      .single()
    if (insertError) throw insertError
    wallet = inserted
  } else {
    const before = Number(wallet.current_points_balance || 0)
    const after = before + points
    const lifetime = Number(wallet.lifetime_earned_points || 0) + points
    
    const { error: updateError } = await db
      .from('loyalty_wallets')
      .update({
        current_points_balance: after,
        lifetime_earned_points: lifetime,
        last_transaction_at: now,
        updated_at: now
      })
      .eq('id', wallet.id)
    if (updateError) throw updateError
    
    wallet.current_points_balance = after
  }

  const { data: tx, error: txError } = await db
    .from('loyalty_transactions')
    .insert({
      wallet_id: wallet.id,
      customer_id: customerId,
      program_id: null,
      campaign_id: campaignId || null,
      wallet_type: 'points',
      transaction_type: type,
      status: 'posted',
      source_channel: 'mobile',
      source_type: 'referral',
      points_delta: points,
      points_before: wallet.current_points_balance - points,
      points_after: wallet.current_points_balance,
      occurred_at: now,
      note: note,
      metadata: { generatedBy: 'referral_system', ...extraMeta }
    })
    .select('id')
    .single()
  
  if (txError) throw txError
  return tx
}

async function issueCouponFromSeries(customerId, seriesId, campaignId, extraMeta = {}) {
  const { data: series } = await db
    .from('loyalty_coupon_series')
    .select('*')
    .eq('id', seriesId)
    .single()

  if (!series || !series.active) return

  const prefix = series.prefix || 'CPN'
  const randomLength = series.random_length || 6
  const charset = series.charset || 'alphanumeric'
  const validChars = charset === 'numeric' ? '0123456789' : 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

  let code = ''
  for (let i = 0; i < randomLength; i++) {
    code += validChars.charAt(Math.floor(Math.random() * validChars.length))
  }
  const couponCode = `${prefix}-${code}`

  let expiresAt = null
  if (series.expires_in_days) {
    expiresAt = new Date(Date.now() + Number(series.expires_in_days) * 24 * 60 * 60 * 1000).toISOString()
  } else if (series.valid_until) {
    expiresAt = series.valid_until
  }

  await db.from('loyalty_coupons').insert({
    series_id: seriesId,
    code: couponCode,
    customer_id: customerId,
    redemption_status: 'available',
    active: true,
    expires_at: expiresAt,
    metadata: { campaign_id: campaignId, ...extraMeta }
  })
}

export async function evaluateRefereeRewards(refereeCustomerId, triggerEvent) {
  if (!refereeCustomerId) return

  const { data: referee, error: refError } = await db
    .from('musteriler')
    .select('id, total_order_count, siparis_sayisi')
    .eq('id', refereeCustomerId)
    .single()

  if (refError || !referee) return

  const { data: tracking, error: trackingError } = await db
    .from('loyalty_referral_tracking')
    .select('*')
    .eq('referee_customer_id', refereeCustomerId)
    .eq('status', 'successful')
    .limit(1)
    .maybeSingle()

  if (trackingError || !tracking) return

  const { data: campaigns, error: campError } = await db
    .from('loyalty_campaigns')
    .select('*')
    .is('deleted_at', null)
    .eq('active', true)

  if (campError || !campaigns) return

  for (const campaign of campaigns) {
    const conditions = normalizeJsonArray(campaign.conditions_json)
    const cond = conditions.find(c => c.condition_key === 'referred_customer' || c.conditionKey === 'referred_customer')
    if (!cond) continue

    const config = cond.config || {}
    const programIds = normalizeJsonArray(config.program_ids)
    if (programIds.length > 0 && !programIds.includes(tracking.program_id)) {
      continue
    }

    const trigger = config.trigger || 'registration'
    if (trigger !== triggerEvent) {
      continue
    }

    if (trigger === 'nth_purchase') {
      const orderCount = Number(referee.total_order_count ?? referee.siparis_sayisi ?? 0)
      if (orderCount < Number(config.trigger_purchase_count || 1)) {
        continue
      }
    }

    const actions = normalizeJsonArray(campaign.actions_json)
    
    // Points reward
    const pointsAction = actions.find(a => a.action_type === 'bonus_points' || a.actionType === 'bonus_points')
    if (pointsAction) {
      const actConfig = pointsAction.action_config || pointsAction.actionConfig || {}
      const points = Number(actConfig.points || 0)
      if (points > 0) {
        const { data: existingTx } = await db
          .from('loyalty_transactions')
          .select('id')
          .eq('customer_id', refereeCustomerId)
          .eq('campaign_id', campaign.id)
          .in('transaction_type', ['welcome_bonus', 'campaign_bonus'])
          .limit(1)
          .maybeSingle()

        if (!existingTx) {
          await awardLoyaltyPoints(
            refereeCustomerId,
            points,
            campaign.id,
            `Aramıza hoş geldiniz! ${campaign.name} kampanya ödülü.`,
            'welcome_bonus'
          )
        }
      }
    }

    // Coupon reward
    const couponAction = actions.find(a => a.action_type === 'issue_coupon' || a.actionType === 'issue_coupon')
    if (couponAction) {
      const actConfig = couponAction.action_config || couponAction.actionConfig || {}
      const seriesIds = normalizeJsonArray(actConfig.seriesIds)
      if (seriesIds.length > 0) {
        const seriesId = seriesIds[0]
        const { data: existingCoupon } = await db
          .from('loyalty_coupons')
          .select('id')
          .eq('customer_id', refereeCustomerId)
          .contains('metadata', { campaign_id: campaign.id })
          .limit(1)
          .maybeSingle()

        if (!existingCoupon) {
          await issueCouponFromSeries(refereeCustomerId, seriesId, campaign.id)
        }
      }
    }
  }
}

export async function evaluateReferrerRewards(referrerCustomerId, programId, refereeCustomerId) {
  if (!referrerCustomerId || !programId) return

  const { data: campaigns, error: campError } = await db
    .from('loyalty_campaigns')
    .select('*')
    .is('deleted_at', null)
    .eq('active', true)

  if (campError || !campaigns) return

  for (const campaign of campaigns) {
    const conditions = normalizeJsonArray(campaign.conditions_json)
    const cond = conditions.find(c => c.condition_key === 'gave_referral' || c.conditionKey === 'gave_referral')
    if (!cond) continue

    const config = cond.config || {}
    if (config.program_id && config.program_id !== programId) {
      continue
    }

    const actions = normalizeJsonArray(campaign.actions_json)

    // Points reward
    const pointsAction = actions.find(a => a.action_type === 'bonus_points' || a.actionType === 'bonus_points')
    if (pointsAction) {
      const actConfig = pointsAction.action_config || pointsAction.actionConfig || {}
      const points = Number(actConfig.points || 0)
      if (points > 0) {
        if (config.reward_type === 'threshold') {
          const { data: existingTx } = await db
            .from('loyalty_transactions')
            .select('id')
            .eq('customer_id', referrerCustomerId)
            .eq('campaign_id', campaign.id)
            .contains('metadata', { reward_type: 'threshold' })
            .limit(1)
            .maybeSingle()

          if (!existingTx) {
            const { data: trackingList } = await db
               .from('loyalty_referral_tracking')
               .select('id')
               .eq('referrer_customer_id', referrerCustomerId)
               .eq('program_id', programId)
               .eq('status', 'successful')

            const successCount = trackingList ? trackingList.length : 0
            const threshold = Number(config.threshold_count || 3)
            if (successCount >= threshold) {
              await awardLoyaltyPoints(
                referrerCustomerId,
                points,
                campaign.id,
                `Tebrikler! ${threshold} arkadaşınızı başarıyla davet ettiniz.`,
                'campaign_bonus',
                { reward_type: 'threshold' }
              )
            }
          }
        } else {
          // per_each
          const { data: existingTx } = await db
            .from('loyalty_transactions')
            .select('id')
            .eq('customer_id', referrerCustomerId)
            .eq('campaign_id', campaign.id)
            .contains('metadata', { referee_customer_id: refereeCustomerId })
            .limit(1)
            .maybeSingle()

          if (!existingTx) {
            const { data: txList } = await db
              .from('loyalty_transactions')
              .select('id')
              .eq('customer_id', referrerCustomerId)
              .eq('campaign_id', campaign.id)

            const rewardedCount = txList ? txList.length : 0
            const maxRewards = Number(config.max_rewards || 10)
            if (rewardedCount < maxRewards) {
              await awardLoyaltyPoints(
                referrerCustomerId,
                points,
                campaign.id,
                'Tebrikler! Davet ettiğiniz arkadaşınız katıldı.',
                'campaign_bonus',
                { referee_customer_id: refereeCustomerId }
              )
            }
          }
        }
      }
    }

    // Coupon reward
    const couponAction = actions.find(a => a.action_type === 'issue_coupon' || a.actionType === 'issue_coupon')
    if (couponAction) {
      const actConfig = couponAction.action_config || couponAction.actionConfig || {}
      const seriesIds = normalizeJsonArray(actConfig.seriesIds)
      if (seriesIds.length > 0) {
        const seriesId = seriesIds[0]
        if (config.reward_type === 'threshold') {
          const { data: existingCoupon } = await db
            .from('loyalty_coupons')
            .select('id')
            .eq('customer_id', referrerCustomerId)
            .contains('metadata', { reward_type: 'threshold', campaign_id: campaign.id })
            .limit(1)
            .maybeSingle()

          if (!existingCoupon) {
            const { data: trackingList } = await db
               .from('loyalty_referral_tracking')
               .select('id')
               .eq('referrer_customer_id', referrerCustomerId)
               .eq('program_id', programId)
               .eq('status', 'successful')

            const successCount = trackingList ? trackingList.length : 0
            const threshold = Number(config.threshold_count || 3)
            if (successCount >= threshold) {
              await issueCouponFromSeries(referrerCustomerId, seriesId, campaign.id, { reward_type: 'threshold' })
            }
          }
        } else {
          // per_each
          const { data: existingCoupon } = await db
            .from('loyalty_coupons')
            .select('id')
            .eq('customer_id', referrerCustomerId)
            .contains('metadata', { referee_customer_id: refereeCustomerId, campaign_id: campaign.id })
            .limit(1)
            .maybeSingle()

          if (!existingCoupon) {
            const { data: couponList } = await db
              .from('loyalty_coupons')
              .select('id')
              .eq('customer_id', referrerCustomerId)
              .contains('metadata', { campaign_id: campaign.id })

            const issuedCount = couponList ? couponList.length : 0
            const maxRewards = Number(config.max_rewards || 10)
            if (issuedCount < maxRewards) {
              await issueCouponFromSeries(referrerCustomerId, seriesId, campaign.id, { referee_customer_id: refereeCustomerId })
            }
          }
        }
      }
    }
  }
}

export async function applyReferralCode(refereeId, validationResult) {
  if (!refereeId) throw new Error('Geçersiz kullanıcı oturumu.')
  if (!validationResult || !validationResult.isValid) throw new Error('Geçersiz doğrulama sonucu.')

  const { data: program, error: progError } = await db
    .from('loyalty_referral_programs')
    .select('*')
    .eq('id', validationResult.programId)
    .single()

  if (progError) throw progError
  if (!program) throw new Error('Referans programı bulunamadı.')

  // 1. Link referee to referrer
  const { error: linkError } = await db
    .from('musteriler')
    .update({ referred_by_customer_id: validationResult.referrerId })
    .eq('id', refereeId)

  if (linkError) throw linkError

  // 2. If Mode 1, mark code as used
  if (validationResult.codeRowId) {
    const { error: codeUpdateError } = await db
      .from('loyalty_referral_codes')
      .update({
        is_used: true,
        referee_customer_id: refereeId,
        used_at: new Date().toISOString()
      })
      .eq('id', validationResult.codeRowId)

    if (codeUpdateError) throw codeUpdateError
  }

  // 3. Insert tracking record
  const isRegistration = program.success_criteria === 'registration'
  const status = isRegistration ? 'successful' : 'pending'
  const successAt = isRegistration ? new Date().toISOString() : null

  const { error: trackingError } = await db
    .from('loyalty_referral_tracking')
    .insert({
      program_id: program.id,
      referrer_customer_id: validationResult.referrerId,
      referee_customer_id: refereeId,
      referral_code: validationResult.referralCode,
      status: status,
      success_at: successAt,
    })

  if (trackingError) throw trackingError

  // 4. Award points if registration success criteria met
  if (isRegistration) {
    await evaluateRefereeRewards(refereeId, 'registration')
    await evaluateReferrerRewards(validationResult.referrerId, program.id, refereeId)
  }

  return true
}

export async function checkReferralSuccess(refereeCustomerId) {
  if (!refereeCustomerId) return

  const { data: trackingRows, error: trackingError } = await db
    .from('loyalty_referral_tracking')
    .select('*')
    .eq('referee_customer_id', refereeCustomerId)
    .eq('status', 'pending')

  if (trackingError) throw trackingError
  if (!trackingRows || trackingRows.length === 0) return

  const { data: referee, error: refError } = await db
    .from('musteriler')
    .select('id, total_order_count, siparis_sayisi')
    .eq('id', refereeCustomerId)
    .single()

  if (refError || !referee) return
  const orderCount = Number(referee.total_order_count ?? referee.siparis_sayisi ?? 0)

  for (const tracking of trackingRows) {
    const { data: program, error: progError } = await db
      .from('loyalty_referral_programs')
      .select('*')
      .eq('id', tracking.program_id)
      .single()

    if (progError || !program) continue

    const threshold = Number(program.success_purchase_count || 1)
    if (orderCount >= threshold) {
      const now = new Date().toISOString()
      const { error: updateError } = await db
        .from('loyalty_referral_tracking')
        .update({
          status: 'successful',
          success_at: now
        })
        .eq('id', tracking.id)

      if (updateError) continue

      // Evaluate rewards
      await evaluateRefereeRewards(refereeCustomerId, 'nth_purchase')
      await evaluateReferrerRewards(tracking.referrer_customer_id, program.id, refereeCustomerId)
    }
  }
}

export async function getReferrerCodes(customerId, programId) {
  if (!customerId || !programId) return []
  const { data, error } = await db
    .from('loyalty_referral_codes')
    .select('id, referral_code, is_used, used_at, referee_customer_id')
    .eq('referrer_customer_id', customerId)
    .eq('program_id', programId)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data || []
}

export async function checkCodeExists(code) {
  if (!code || !code.trim()) return false
  const cleanCode = code.trim().toUpperCase()
  
  const { data: codeRow } = await db
    .from('loyalty_referral_codes')
    .select('id')
    .eq('referral_code', cleanCode)
    .eq('is_used', false)
    .limit(1)
  
  if (codeRow && codeRow.length > 0) return true

  const { data: customerRow } = await db
    .from('musteriler')
    .select('id')
    .eq('referral_code', cleanCode)
    .limit(1)

  if (customerRow && customerRow.length > 0) return true
  
  return false
}

export async function registerCustomer(ad_soyad, telefon, email, referralCode) {
  if (!ad_soyad || !ad_soyad.trim()) throw new Error('Ad Soyad alanı zorunludur.')
  if (!telefon || !telefon.trim()) throw new Error('Telefon alanı zorunludur.')

  const cleanPhone = telefon.trim()
  const { data: existing } = await db
    .from('musteriler')
    .select('id')
    .eq('telefon', cleanPhone)
    .is('deleted_at', null)
    .limit(1)

  if (existing && existing.length > 0) {
    throw new Error('Bu telefon numarasıyla kayıtlı bir kullanıcı zaten mevcut.')
  }

  // Pre-validate referral code if provided
  if (referralCode && referralCode.trim()) {
    const cleanCode = referralCode.trim().toUpperCase()
    
    // Check loyalty_referral_codes
    const { data: codeRow } = await db
      .from('loyalty_referral_codes')
      .select('id, is_used')
      .eq('referral_code', cleanCode)
      .limit(1)
      .maybeSingle()

    if (codeRow) {
      if (codeRow.is_used) {
        throw new Error('Bu davet kodu zaten kullanılmış.')
      }
    } else {
      // Check musteriler
      const { data: referrer } = await db
        .from('musteriler')
        .select('id, referral_code')
        .eq('referral_code', cleanCode)
        .limit(1)
        .maybeSingle()

      if (!referrer) {
        throw new Error('Geçersiz veya bulunamayan davet kodu.')
      }
    }
  }

  // Generate unique member number
  const memberNo = `M-${Math.floor(100000 + Math.random() * 900000)}`

  // Insert customer
  const { data: newCustomer, error: insertError } = await db
    .from('musteriler')
    .insert({
      ad_soyad: ad_soyad.trim(),
      telefon: cleanPhone,
      email: email ? email.trim() : null,
      loyalty_status: 'member',
      loyalty_enrolled_at: new Date().toISOString(),
      loyalty_member_no: memberNo,
      signup_channel: 'mobile',
      total_order_count: 0,
      total_order_amount: 0,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertError) throw insertError

  // If referral code is valid, apply it
  if (referralCode && referralCode.trim()) {
    try {
      const valResult = await validateReferralCode(newCustomer.id, referralCode)
      if (valResult.isValid) {
        await applyReferralCode(newCustomer.id, valResult)
        // Refresh customer from DB to get the updated record (e.g. referred_by_customer_id)
        const { data: updatedCustomer, error: selectError } = await db
          .from('musteriler')
          .select('*')
          .eq('id', newCustomer.id)
          .single()
        if (!selectError && updatedCustomer) {
          return updatedCustomer
        }
      }
    } catch (refError) {
      // Cleanup on error to maintain consistency
      await db.from('musteriler').delete().eq('id', newCustomer.id)
      throw new Error(`Davet kodu uygulanamadı: ${refError.message || refError}`)
    }
  }

  return newCustomer
}



