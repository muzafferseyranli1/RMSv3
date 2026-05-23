import { normalizeLoyaltyApplicationMode } from '@/lib/checkoutLoyalty'
import { db } from '@/lib/db'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const PROGRAM_TYPE_OPTIONS = [
  { value: 'points', label: 'Puan programi' },
  { value: 'frequency', label: 'Frekans / ziyaret karti' },
  { value: 'reward', label: 'Odul programi' },
  { value: 'mixed', label: 'Karma program' },
  { value: 'product', label: 'Urun programi' },
  { value: 'gift_card', label: 'Hediye karti programi' },
  { value: 'stored_value_card', label: 'Bakiye / on odemeli kart' },
  { value: 'membership_card', label: 'Uyelik karti' },
]

export const CAMPAIGN_TYPE_OPTIONS = [
  { value: 'bonus_points', label: 'Bonus Puan' },
  { value: 'extra_multiplier', label: 'Ekstra Katsayi' },
  { value: 'points_percent_of_order', label: 'Harcama Bazli Puan' },
  { value: 'points_earn_multiplier', label: 'Puan Kazanma Katsayisi' },
  { value: 'points_redeem_multiplier', label: 'Puan Harcama Katsayisi' },
  { value: 'discount_percent', label: 'Yuzde Indirim' },
  { value: 'discount_amount', label: 'Tutar Indirimi' },
  { value: 'product_offer', label: 'Urun / Hediye' },
  { value: 'coupon_unlock', label: 'Kupon Kilidi Ac' },
]

export const CAMPAIGN_TRIGGER_OPTIONS = [
  { value: 'manual', label: 'Manuel' },
  { value: 'first_purchase', label: 'Ilk Alisveris' },
  { value: 'order_completed', label: 'Siparis Tamamlandi' },
  { value: 'birthday', label: 'Dogum Gunu' },
  { value: 'inactive_winback', label: 'Uyuyan Musteri' },
  { value: 'cart_total', label: 'Sepet Tutari' },
  { value: 'visit_count', label: 'Ziyaret Sayisi' },
]

export const CAMPAIGN_AUDIENCE_OPTIONS = [
  { value: 'all', label: 'Tüm Müşteriler' },
  { value: 'members', label: 'Sadakat Üyeleri' },
  { value: 'new_customers', label: 'Yeni Müşteriler' },
  { value: 'inactive_customers', label: 'Pasif Müşteriler' },
  { value: 'tagged_customers', label: 'Müşteri Kategorileri' },
]

export const CAMPAIGN_CHANNEL_OPTIONS = [
  { value: 'pos', label: 'POS' },
  { value: 'masa', label: 'Garson / Masa' },
  { value: 'kiosk', label: 'Kiosk' },
  { value: 'call_center', label: 'Call Center' },
  { value: 'online', label: 'Online' },
  { value: 'mobile', label: 'Mobil' },
]

export const CAMPAIGN_APPLICATION_MODE_OPTIONS = [
  { value: 'prompt', label: 'Kasiyere sor' },
  { value: 'auto', label: 'Otomatik uygula' },
]

export const RULE_SCOPE_OPTIONS = [
  { value: 'applicable', label: 'Uygulanabilir koşullar ve eylemler' },
  { value: 'periodic', label: 'Periyodik koşullar ve eylemler' },
]

export const COMPARISON_OPTIONS = [
  { value: 'eq', label: 'eşit' },
  { value: 'gt', label: 'büyük' },
  { value: 'gte', label: 'eşit veya büyük' },
  { value: 'lt', label: 'küçük' },
  { value: 'lte', label: 'eşit veya küçük' },
  { value: 'divisible', label: 'bölünebilir' },
]

export const PERIOD_OPTIONS = [
  { value: 'all_time', label: 'Tüm zamanlar' },
  { value: 'day', label: 'Günde' },
  { value: 'week', label: 'Haftada' },
  { value: 'month', label: 'Ayda' },
  { value: 'quarter', label: 'Üç ayda bir' },
  { value: 'year', label: 'Yılda' },
  { value: 'current_month_start', label: 'Mevcut ay başına' },
  { value: 'rolling_days', label: 'Son X gün (kayan)' },
]

export const ACTION_TYPE_OPTIONS = [
  { value: 'free_products', label: 'Hediye ürün' },
  { value: 'product_pricing', label: 'İndirimler ve özel fiyatlar' },
  { value: 'combo_bundle', label: 'Kombo' },
  { value: 'write_customer_note', label: 'Müşteri hesabı, fiş ve teslimat notuna metin yazdır' },
  { value: 'send_sms', label: 'Müşteriye SMS gönder' },
  { value: 'send_webhook', label: 'Müşteriye webhook gönder' },
  { value: 'remove_customer_tag', label: 'Müşteri kategorisini yönet (Ekle/Çıkar)' },
  { value: 'add_customer_tag', label: 'Müşteri kategorisini yönet (Ekle/Çıkar)' },
  { value: 'special_discount', label: 'Özel indirim' },
  { value: 'order_extra_charge', label: 'Siparişte ek ücret' },
  { value: 'order_discount', label: 'Siparişte indirim' },
  { value: 'warning_message', label: 'Uyarı' },
  { value: 'suggest_products', label: 'Ekstra ürün teklif et' },
  { value: 'bonus_points', label: 'Puan yükle' },
  { value: 'points_percent_of_order', label: 'Sipariş tutarının %X kadar puan kazandır' },
  { value: 'points_earn_multiplier', label: 'Puan kazanma katsayısı uygula' },
  { value: 'points_redeem_multiplier', label: 'Puan harcama katsayısı uygula' },
  { value: 'issue_coupon', label: 'Kupon yarat' },
  { value: 'discount_percent', label: 'Yüzde indirim uygula' },
]

export const COUPON_CHARSET_OPTIONS = [
  { value: 'numeric', label: 'Yalnizca rakamlar' },
  { value: 'alpha', label: 'Yalnizca harfler' },
  { value: 'alphanumeric', label: 'Harf ve rakamlar' },
]

export const CONDITION_LIBRARY = [
  { key: 'always', label: 'Her siparişte', description: 'Ek bir koşul aramadan, hedef kitle ve kanal uygunsa her siparişte çalışır.' },
  { key: 'calendar_schedule', label: 'Takvim', description: 'Periyodik kuralı günlük, haftalık, aylık veya yıllık takvime bağlar.' },
  { key: 'birthday', label: 'Doğum günü', description: 'Müşterinin doğum günü, önceki ve sonraki gün sayısına göre eşleşir.' },
  { key: 'period_total_order_amount', label: 'Dönem başına toplam sipariş tutarı', description: 'Müşterinin seçili zaman dilimindeki toplam sipariş tutarını kontrol eder; istenirse mevcut sipariş de hesaba katılır.' },
  { key: 'period_order_count', label: 'Dönem içindeki ziyaret / sipariş adedi', description: 'Müşterinin belirli dönemde yaptığı ziyaret veya verdiği sipariş sayısını kontrol eder; istenirse mevcut ziyaret / sipariş de bu sayıya dahil edilir.' },
  { key: 'period_product_quantity', label: 'Dönem içindeki ürün miktarı', description: 'Müşterinin dönem boyunca sipariş ettiği ürün adedini kontrol eder.' },
  { key: 'period_sold_product_quantity', label: 'Dönem içinde satılan ürün miktarı', description: 'Seçili ürün ve kategorilerin gün, hafta, ay, 3 ay veya yıl içindeki toplam satış adedini kontrol eder.' },
  { key: 'missing_products', label: 'Ürün siparişte yoksa', description: 'Seçili ürün, kategori veya satış malı şablonundaki ürünler siparişte yoksa tetiklenir.' },
  { key: 'happy_hour', label: 'Happy hour', description: 'Belirli saat ve gün aralığında koşul sağlanır.' },
  { key: 'gift_card_series', label: 'Hediye kartı serisi', description: 'Belirli bir hediye kartı veya kupon serisi ile eşleşir.' },
  { key: 'campaign_triggered', label: 'Kampanya aktifse', description: 'Seçili kampanyalardan biri bu siparişte aktif hale geldiyse veya tetiklendiyse koşul sağlanır.' },
  { key: 'coupon_present', label: 'Kupon', description: 'Belirli kuponlar veya kupon serileri ile eşleşir.' },
  { key: 'manual_approval', label: 'Manuel tetikleme', description: 'Bu koşul, personelin POS kampanyalar sekmesinden elle başlatacağı kampanyalar içindir; tetikleme yapıldığında diğer koşullar da uyuyorsa kampanya çalışır.' },
  { key: 'days_since_first_activity', label: 'Misafirin ilk aktivitesinden sonra geçen gün', description: 'İlk kayıt veya sipariş tarihinden bu yana geçen günü kontrol eder.' },
  { key: 'customer_has_tag', label: 'Müşteri kategorisindeyse', description: 'Müşterinin seçili kategori veya etiketlerden birine ait olmasını ister.' },
  { key: 'customer_lacks_tag', label: 'Müşteri kategorisinde değilse', description: 'Müşterinin seçili kategori veya etiketlerde olmamasını kontrol eder.' },
  { key: 'referred_customer', label: 'Müşteri referansla geldi', description: 'Belirli referans programlarından biriyle gelen müşterilerde tetiklenir.' },
  { key: 'gave_referral', label: 'Referans verdiyse', description: 'Başarılı referans veren müşterilerde, her kullanım veya eşik değerine göre tetiklenir.' },
  { key: 'order_item_quantity', label: 'Sipariş edilen ürün miktarı', description: 'Seçili ürünlerin bu siparişteki miktarını kontrol eder.' },
  { key: 'order_total', label: 'Sipariş tutarı', description: 'Sepet tutarının belirtilen eşiği geçmesini veya altında kalmasını kontrol eder.' },
  { key: 'last_visit_days', label: '... gündür gelmeyen', description: 'Müşterinin son siparişinden bu yana kaç gün geçtiğini kontrol eder; belirli süredir gelmeyen müşterileri hedeflemek için kullanılır.' },
]

export const DEFAULT_LOYALTY_PROGRAM = {
  id: 'program-default',
  name: 'Kampanyalar',
  programType: 'points',
  programFamily: 'points',
  earnModel: 'points_per_amount',
  redemptionModel: 'points_to_discount',
  redemptionRate: 0,
  cardMode: 'none',
  frequencyGoal: 0,
  frequencyResetPeriod: 'never',
  frequencyRewardType: 'bonus_points',
  frequencyRewardValue: 0,
  startsAt: '',
  endsAt: '',
  description: '',
  active: true,
  chainWideActive: false,
  notifyBalanceChange: true,
  notificationChannel: 'push_or_sms',
  webhookEnabled: false,
  webhookTemplate: 'default',
}

export const DEFAULT_LOYALTY_TIERS = [
  {
    id: 'tier-bronze',
    code: 'bronze',
    name: 'Bronz',
    minSpend: 0,
    minOrderCount: 0,
    pointsMultiplier: 1,
    birthdayBonusPoints: 25,
    benefitsSummary: 'Temel puan kazanimi',
    color: '#b45309',
    active: true,
    sortOrder: 10,
  },
  {
    id: 'tier-silver',
    code: 'silver',
    name: 'Gumus',
    minSpend: 5000,
    minOrderCount: 8,
    pointsMultiplier: 1.2,
    birthdayBonusPoints: 50,
    benefitsSummary: 'Ekstra puan ve kampanya onceligi',
    color: '#64748b',
    active: true,
    sortOrder: 20,
  },
  {
    id: 'tier-gold',
    code: 'gold',
    name: 'Altin',
    minSpend: 15000,
    minOrderCount: 20,
    pointsMultiplier: 1.5,
    birthdayBonusPoints: 100,
    benefitsSummary: 'Yuksek puan katsayisi ve VIP aksiyonlari',
    color: '#ca8a04',
    active: true,
    sortOrder: 30,
  },
]

export const DEFAULT_LOYALTY_CAMPAIGNS = [
  {
    id: 'campaign-welcome',
    programId: 'program-default',
    name: 'Hos Geldin',
    code: 'WELCOME',
    description: 'Yeni kayit olan musteriyi ilk sipariste sadakat akisina alir.',
    campaignType: 'bonus_points',
    triggerType: 'first_purchase',
    rewardValue: 250,
    audienceType: 'new_customers',
    channelTargets: ['pos', 'online', 'mobile'],
    applicationMode: 'prompt',
    startsAt: '',
    endsAt: '',
    priority: 10,
    stackable: false,
    active: true,
    applicableRules: [
      {
        id: 'rule-welcome-1',
        scope: 'applicable',
        conditionKey: 'period_order_count',
        operator: 'eq',
        threshold: 0,
        period: 'all_time',
        actionType: 'bonus_points',
        actionSummary: 'Ilk siparis tamamlandiginda 250 puan yukle',
        active: true,
        stopProcessing: false,
      },
    ],
    periodicRules: [],
  },
]

export const DEFAULT_COUPON_SERIES = [
  {
    id: 'coupon-series-welcome',
    name: 'Hos Geldin Kuponlari',
    prefix: 'HOS',
    singleCoupon: false,
    couponCount: 5,
    randomLength: 6,
    charset: 'numeric',
    useAfterCheckout: true,
    validFrom: '',
    validUntil: '',
    expiresInDays: 0,
    autoDeactivateOnExpiry: true,
    active: true,
    codes: [],
    coupons: [],
  },
]

export const DEFAULT_CUSTOMER_CATEGORIES = []

function uid(prefix = 'loyalty') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toInt(value, fallback = 0) {
  return Math.round(toNumber(value, fallback))
}

function toText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function toBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeCode(value, fallbackPrefix) {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || `${fallbackPrefix}-${Math.random().toString(36).slice(2, 7)}`
}

function normalizeStringList(values) {
  if (Array.isArray(values)) return values.map(value => String(value || '').trim()).filter(Boolean)
  if (typeof values === 'string') return values.split(',').map(value => value.trim()).filter(Boolean)
  return []
}

export function normalizeCampaignChannelTarget(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const canonicalOption = CAMPAIGN_CHANNEL_OPTIONS.find(option => (
    String(option.value || '').trim().toLowerCase() === raw.toLowerCase()
    || String(option.label || '').trim().toLowerCase() === raw.toLowerCase()
  ))

  return canonicalOption?.value || raw
}

function normalizeLegacyOrderTypeToChannelTarget(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return ''
  if (normalized === 'table') return 'masa'
  if (normalized === 'kiosk') return 'kiosk'
  if (normalized === 'mobile') return 'mobile'
  if (normalized === 'delivery' || normalized === 'pickup') return 'online'
  if (normalized === 'pos') return 'pos'
  return ''
}

function normalizeCampaignChannelTargets(values = []) {
  return [...new Set(
    normalizeStringList(values)
      .map(normalizeCampaignChannelTarget)
      .filter(Boolean),
  )]
}

export function getSalesChannelConditionValues(config = {}) {
  const directValues = normalizeCampaignChannelTargets(
    config.channelValues
    || config.channels
    || config.channelTargets,
  )
  if (directValues.length > 0) return directValues

  const legacyOrderTypeValues = [...new Set(
    normalizeStringList(config.orderTypes)
      .map(normalizeLegacyOrderTypeToChannelTarget)
      .filter(Boolean),
  )]
  if (legacyOrderTypeValues.length > 0) return legacyOrderTypeValues

  if (!Array.isArray(config.selections)) return []

  return [...new Set(
    config.selections
      .flatMap(item => {
        if (typeof item === 'string') return [item]
        return [
          item?.value,
          item?.channelValue,
          item?.channel,
          item?.name,
        ].filter(Boolean)
      })
      .map(normalizeCampaignChannelTarget)
      .filter(Boolean),
  )]
}

function resolveConditionKey(value) {
  const raw = String(value || '').trim()
  if (raw === 'order_type') return 'sales_channel'
  if (raw === 'delivery_order') return 'sales_channel'
  if (raw === 'sales_channel') return 'sales_channel'
  return CONDITION_LIBRARY.some(item => item.key === raw)
    ? raw
    : CONDITION_LIBRARY[0]?.key || 'birthday'
}

function asUuidOrNull(value) {
  const text = String(value || '').trim()
  if (!text) return null
  return UUID_PATTERN.test(text) ? text : null
}

function escapePostgrestValue(value) {
  return `"${String(value || '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function normalizeDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function addDaysToDateTime(value, days = 0) {
  const base = new Date(value)
  if (!Number.isFinite(base.getTime())) return ''
  const next = new Date(base.getTime() + Math.max(0, toInt(days, 0)) * 24 * 60 * 60 * 1000)
  return next.toISOString()
}

function cloneJson(value, fallback) {
  if (Array.isArray(fallback)) return Array.isArray(value) ? JSON.parse(JSON.stringify(value)) : [...fallback]
  if (value && typeof value === 'object' && !Array.isArray(value)) return JSON.parse(JSON.stringify(value))
  return { ...(fallback || {}) }
}

function slugifyPrefix(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function charsetCharacters(charset) {
  switch (charset) {
    case 'numeric':
      return '0123456789'
    case 'alpha':
      return 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    default:
      return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  }
}

function randomChunk(charset, length) {
  const source = charsetCharacters(charset)
  let output = ''
  for (let index = 0; index < length; index += 1) output += source[Math.floor(Math.random() * source.length)] || source[0]
  return output
}

function createCouponCode(prefix, charset, randomLength) {
  const safePrefix = slugifyPrefix(prefix)
  const suffix = randomChunk(charset, Math.max(1, toInt(randomLength, 6)))
  return `${safePrefix}${suffix}` || suffix
}

function buildCouponDefaultExpiry(series = {}, issuedAt = '') {
  if (series.validUntil) return normalizeDateTime(series.validUntil)
  if (toInt(series.expiresInDays, 0) > 0) return addDaysToDateTime(issuedAt || new Date().toISOString(), series.expiresInDays)
  return ''
}

function deriveCouponRedemptionStatus(coupon = {}, series = {}) {
  const metadata = cloneJson(coupon.metadata, {})
  const explicitStatus = String(
    coupon.redemptionStatus
    || coupon.redemption_status
    || metadata.redemptionStatus
    || metadata.redemption_status
    || '',
  ).trim().toLowerCase()
  if (explicitStatus === 'cancelled') return 'cancelled'
  if (explicitStatus === 'reserved') return 'reserved'
  if (
    explicitStatus === 'used'
    || coupon.isUsed === true
    || coupon.is_used === true
    || coupon.usedAt
    || coupon.used_at
    || metadata.usedAt
    || metadata.used_at
  ) return 'used'

  const expiresAt = normalizeDateTime(
    coupon.expiresAt
    || coupon.expires_at
    || metadata.expiresAt
    || metadata.expires_at
    || buildCouponDefaultExpiry(series, coupon.issuedAt || coupon.issued_at || metadata.issuedAt || metadata.issued_at),
  )
  if (expiresAt) {
    const expiryDate = new Date(expiresAt)
    if (Number.isFinite(expiryDate.getTime()) && expiryDate.getTime() <= Date.now()) return 'expired'
  }

  return 'available'
}

function normalizeCouponRecord(coupon = {}, series = {}, index = 0) {
  const metadata = cloneJson(coupon.metadata, {})
  const normalizedSeries = {
    validUntil: normalizeDateTime(series.validUntil),
    expiresInDays: Math.max(0, toInt(series.expiresInDays, 0)),
    autoDeactivateOnExpiry: series.autoDeactivateOnExpiry !== false,
  }
  const issuedAt = normalizeDateTime(
    coupon.issuedAt
    || coupon.issued_at
    || metadata.issuedAt
    || metadata.issued_at
    || coupon.created_at
    || new Date().toISOString(),
  ) || new Date().toISOString()
  const expiresAt = normalizeDateTime(
    coupon.expiresAt
    || coupon.expires_at
    || metadata.expiresAt
    || metadata.expires_at
    || buildCouponDefaultExpiry(normalizedSeries, issuedAt),
  )
  const redemptionStatus = deriveCouponRedemptionStatus({ ...coupon, issuedAt, expiresAt }, normalizedSeries)
  const active = coupon.active !== false && !(normalizedSeries.autoDeactivateOnExpiry && redemptionStatus === 'expired')

  return {
    id: String(coupon.id || uid(`coupon-${index}`)),
    code: String(coupon.code || '').trim(),
    customerId: coupon.customerId || coupon.customer_id || null,
    issuedAt,
    expiresAt,
    isUsed: coupon.isUsed === true || coupon.is_used === true || redemptionStatus === 'used',
    usedAt: normalizeDateTime(coupon.usedAt || coupon.used_at || metadata.usedAt || metadata.used_at),
    redeemedByCustomerId: coupon.redeemedByCustomerId || coupon.redeemed_by_customer_id || metadata.redeemedByCustomerId || metadata.redeemed_by_customer_id || null,
    redeemedChannel: toText(coupon.redeemedChannel || coupon.redeemed_channel || metadata.redeemedChannel || metadata.redeemed_channel),
    redeemedSourceRefId: toText(coupon.redeemedSourceRefId || coupon.redeemed_source_ref_id || coupon.source_ref_id || metadata.redeemedSourceRefId || metadata.redeemed_source_ref_id || metadata.source_ref_id),
    redemptionStatus,
    active,
    note: toText(coupon.note || metadata.note),
  }
}

function isCouponProtectedRecord(coupon = {}) {
  const metadata = cloneJson(coupon.metadata, {})
  const redemptionStatus = String(coupon.redemptionStatus || coupon.redemption_status || metadata.redemptionStatus || metadata.redemption_status || '').trim().toLowerCase()
  return (
    ['used', 'reserved', 'expired', 'cancelled'].includes(redemptionStatus)
    || coupon.isUsed === true
    || coupon.is_used === true
    || Boolean(coupon.customerId || coupon.customer_id)
    || Boolean(coupon.usedAt || coupon.used_at)
    || Boolean(coupon.redeemedByCustomerId || coupon.redeemed_by_customer_id || metadata.redeemedByCustomerId || metadata.redeemed_by_customer_id)
    || Boolean(coupon.redeemedChannel || coupon.redeemed_channel || metadata.redeemedChannel || metadata.redeemed_channel)
    || Boolean(coupon.redeemedSourceRefId || coupon.redeemed_source_ref_id || coupon.source_ref_id || metadata.redeemedSourceRefId || metadata.redeemed_source_ref_id || metadata.source_ref_id)
  )
}

export function formatDateTimeInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

export function normalizeProgram(program = {}) {
  const programType = PROGRAM_TYPE_OPTIONS.some(option => option.value === program.programType)
    ? program.programType
    : (PROGRAM_TYPE_OPTIONS.some(option => option.value === program.programFamily) ? program.programFamily : 'points')
  const programFamily = PROGRAM_TYPE_OPTIONS.some(option => option.value === program.programFamily)
    ? program.programFamily
    : programType
  return {
    id: String(program.id || uid('program')),
    name: toText(program.name || 'Sadakat Programi'),
    programType,
    programFamily,
    earnModel: toText(program.earnModel || 'points_per_amount'),
    redemptionModel: toText(program.redemptionModel || 'points_to_discount'),
    redemptionRate: Math.max(0, toNumber(program.redemptionRate ?? program.redemption_rate, 0)),
    cardMode: toText(program.cardMode || 'none'),
    frequencyGoal: toInt(program.frequencyGoal, 0),
    frequencyResetPeriod: toText(program.frequencyResetPeriod || 'never'),
    frequencyRewardType: toText(program.frequencyRewardType || 'bonus_points'),
    frequencyRewardValue: toNumber(program.frequencyRewardValue, 0),
    startsAt: normalizeDateTime(program.startsAt),
    endsAt: normalizeDateTime(program.endsAt),
    description: toText(program.description),
    active: program.active !== false,
    chainWideActive: toBoolean(program.chainWideActive, false),
    notifyBalanceChange: program.notifyBalanceChange !== false,
    notificationChannel: toText(program.notificationChannel || 'push_or_sms'),
    webhookEnabled: toBoolean(program.webhookEnabled, false),
    webhookTemplate: toText(program.webhookTemplate || 'default'),
  }
}

export function normalizeTier(tier = {}, index = 0) {
  return {
    id: String(tier.id || uid('tier')),
    code: normalizeCode(tier.code || tier.name, 'tier'),
    name: toText(tier.name),
    minSpend: toNumber(tier.minSpend, 0),
    minOrderCount: toInt(tier.minOrderCount, 0),
    pointsMultiplier: toNumber(tier.pointsMultiplier ?? tier.pointsRate, 1),
    birthdayBonusPoints: toNumber(tier.birthdayBonusPoints ?? tier.birthdayBonus, 0),
    benefitsSummary: toText(tier.benefitsSummary),
    color: toText(tier.color, '#2563eb'),
    active: tier.active !== false,
    sortOrder: toInt(tier.sortOrder, (index + 1) * 10),
  }
}

export function normalizeCustomerCategory(category = {}, index = 0) {
  return {
    id: String(category.id || uid('customer-category')),
    name: toText(category.name || `Kategori ${index + 1}`),
    code: normalizeCode(category.code || category.name, 'category').toUpperCase(),
    description: toText(category.description),
    color: toText(category.color, '#2563eb'),
    active: category.active !== false,
    sortOrder: toInt(category.sortOrder, (index + 1) * 10),
  }
}

function normalizeProductMask(mask = {}, index = 0) {
  const rawType = toText(mask.type || mask.maskType || 'product')
  const type = ['product', 'category', 'sale_template', 'combo'].includes(rawType)
    ? rawType
    : rawType === 'template'
      ? 'sale_template'
      : 'product'

  return {
    id: String(mask.id || uid(`mask-${index}`)),
    itemId: toText(mask.itemId || mask.entityId),
    name: toText(mask.name),
    type,
  }
}

function normalizeTimeWindow(window = {}, index = 0) {
  const days = Array.isArray(window.days) ? window.days.slice(0, 7).map(Boolean) : [false, false, false, false, false, false, false]
  while (days.length < 7) days.push(false)
  return {
    id: String(window.id || uid(`window-${index}`)),
    start: toText(window.start || '00:00'),
    end: toText(window.end || '00:00'),
    days,
  }
}

function normalizeAdditionalCondition(condition = {}, index = 0) {
  const conditionKey = resolveConditionKey(condition.conditionKey)

  return {
    id: String(condition.id || uid(`subcondition-${index}`)),
    conditionKey,
    config: normalizeConditionConfig(conditionKey, condition.config || condition.conditionConfig || {}),
  }
}

function normalizeOfferItem(item = {}, index = 0) {
  return {
    id: String(item.id || uid(`offer-${index}`)),
    itemId: toText(item.itemId),
    name: toText(item.name),
    type: toText(item.type || 'product'),
    size: toText(item.size),
  }
}

function normalizePricingRow(row = {}, index = 0) {
  const rawMaskType = toText(row.maskType || row.type || 'product')
  const maskType = ['product', 'category', 'sale_template'].includes(rawMaskType)
    ? rawMaskType
    : ['mask', 'combo', 'template'].includes(rawMaskType)
      ? 'sale_template'
      : 'product'

  return {
    id: String(row.id || uid(`pricing-${index}`)),
    itemId: toText(row.itemId),
    name: toText(row.name),
    maskType,
    size: toText(row.size),
    applyTo: toText(row.applyTo || 'all_matches'),
    pricingType: toText(row.pricingType || 'discount_percent'),
    value: toNumber(row.value, 0),
  }
}

function normalizeComboGroupItem(item = {}, index = 0) {
  return {
    id: String(item.id || uid(`combo-item-${index}`)),
    type: toText(item.type || 'product'),
    name: toText(item.name),
    size: toText(item.size),
    blockedOptions: toText(item.blockedOptions),
    priceAdjustment: toNumber(item.priceAdjustment, 0),
    position: toInt(item.position, 0),
  }
}

function getDefaultCouponBenefitConfig() {
  return {
    type: 'none',
    amount: 0,
    percent: 0,
    maxDiscountAmount: 0,
    productName: '',
    productItemId: '',
  }
}

function normalizeCouponBenefitConfig(rawConfig = {}) {
  const base = cloneJson(rawConfig, getDefaultCouponBenefitConfig())
  const normalized = { ...getDefaultCouponBenefitConfig(), ...base }
  const allowedTypes = ['none', 'order_discount_amount', 'order_discount_percent', 'product_discount_percent']

  normalized.type = allowedTypes.includes(normalized.type) ? normalized.type : 'none'
  normalized.amount = Math.max(0, toNumber(normalized.amount, 0))
  normalized.percent = Math.min(100, Math.max(0, toNumber(normalized.percent, 0)))
  normalized.maxDiscountAmount = Math.max(0, toNumber(normalized.maxDiscountAmount, 0))
  normalized.productName = toText(normalized.productName || normalized.product_name || normalized.targetProductName)
  normalized.productItemId = toText(normalized.productItemId || normalized.product_item_id || normalized.targetProductId)

  return normalized
}

function normalizeComboGroup(group = {}, index = 0) {
  return {
    id: String(group.id || uid(`combo-group-${index}`)),
    name: toText(group.name || `Yeni grup ${index + 1}`),
    isPrimary: toBoolean(group.isPrimary, false),
    items: Array.isArray(group.items) ? group.items.map(normalizeComboGroupItem) : [],
  }
}

export function getDefaultConditionConfig(conditionKey) {
  switch (conditionKey) {
    case 'always':
      return {}
    case 'calendar_schedule':
      return { frequency: 'daily', weekdays: [false, false, false, false, false, false, false], dayOfMonth: 'last', monthOfYear: 1 }
    case 'birthday':
      return { daysBefore: 0, daysAfter: 0 }
    case 'period_total_order_amount':
      return { amount: 0, operator: 'gte', period: 'all_time', periodDays: 30, includeCurrentOrder: false }
    case 'period_order_count':
      return { count: 0, operator: 'eq', period: 'all_time', periodDays: 30, includeCurrentOrder: false }
    case 'period_product_quantity':
      return { quantity: 0, operator: 'gte', period: 'all_time', periodDays: 30, repeatable: false, allowSameItemRepeat: true, productMasks: [] }
    case 'period_sold_product_quantity':
      return { quantity: 0, operator: 'gte', period: 'day', periodDays: 30, repeatable: false, allowSameItemRepeat: true, productMasks: [] }
    case 'missing_products':
      return { productMasks: [] }
    case 'happy_hour':
      return {
        saveWriteTime: true,
        windows: [{ id: uid('window'), start: '00:00', end: '00:00', days: [false, false, false, false, false, false, false] }],
        timezoneMode: 'default',
        timezone: 'Europe/Istanbul',
      }
    case 'gift_card_series':
      return { mode: 'matches_series', seriesIds: [] }
    case 'campaign_triggered':
      return { relatedCampaignIds: [] }
    case 'coupon_present':
      return { anySeries: false, seriesIds: [] }
    case 'days_since_first_activity':
      return { eventType: 'signup', days: 0, operator: 'gte' }
    case 'customer_has_tag':
    case 'customer_lacks_tag':
      return { target: 'order_customer', tags: [] }
    case 'referred_customer':
      return { program_ids: [], trigger: 'registration', trigger_purchase_count: 1 }
    case 'gave_referral':
      return { program_id: '', reward_type: 'per_each', threshold_count: 3, max_rewards: 10 }
    case 'sales_channel':
      return { channelValues: [] }
    case 'order_item_quantity':
      return { quantity: 1, operator: 'gte', repeatable: false, allowSameItemRepeat: true, excludeFreeItems: false, productMasks: [] }
    case 'order_total':
      return { amount: 0, operator: 'gte', repeatable: false, productMasks: [] }
    case 'last_visit_days':
      return { days: 0, operator: 'gte' }
    default:
      return {}
  }
}

export function getDefaultActionConfig(actionType) {
  switch (actionType) {
    case 'free_products':
    case 'suggest_products':
      return { items: [], applyToPricedOptions: false }
    case 'product_pricing':
      return { items: [], applyToPricedOptions: false }
    case 'combo_bundle':
      return {
        name: '',
        category: '',
        priceMode: 'fixed_price',
        priceValue: 0,
        sortOrder: 0,
        groups: [{ id: uid('combo-group'), name: 'Yeni grup', isPrimary: false, items: [] }],
        warnMissingSidesThreshold: '',
        applyToPaidOptions: false,
        blockOtherDiscounts: true,
      }
    case 'write_customer_note':
      return { customerTemplate: '', anonymousTemplate: '', customerOffer: '' }
    case 'send_sms':
      return { message: '', sendAt: '00:00' }
    case 'send_webhook':
      return { endpoint: '', template: '', sendAt: '' }
    case 'remove_customer_tag':
    case 'add_customer_tag':
      return { category: '', target: 'order_customer' }
    case 'special_discount':
      return { amount: 0 }
    case 'order_extra_charge_amount':
    case 'order_discount_amount':
      return { amount: 0 }
    case 'order_extra_charge_percent':
    case 'total_order_discount_percent':
    case 'discount_percent':
      return { percent: 0, includeAlreadyDiscounted: false }
    case 'order_discount':
      return { valueType: 'percent', percent: 0, amount: 0, includeAlreadyDiscounted: false }
    case 'order_extra_charge':
      return { valueType: 'amount', percent: 0, amount: 0 }
    case 'warning_message':
      return { message: '', customerOffer: '' }
    case 'bonus_points':
      return { points: 0 }
    case 'points_percent_of_order':
      return { percent: 10 }
    case 'points_earn_multiplier':
    case 'points_redeem_multiplier':
      return { multiplier: 2 }
    case 'issue_coupon':
      return { anySeries: false, seriesIds: [] }
    default:
      return { type: actionType }
  }
}

function normalizeConditionConfig(conditionKey, rawConfig = {}) {
  if (
    conditionKey === 'sales_channel'
    && Object.prototype.hasOwnProperty.call(rawConfig || {}, 'required')
    && !Array.isArray(rawConfig?.channelValues)
    && !Array.isArray(rawConfig?.orderTypes)
  ) {
    return normalizeConditionConfig('sales_channel', {
      ...rawConfig,
      channelValues: ['online'],
    })
  }
  if (conditionKey === 'sales_channel' && Array.isArray(rawConfig?.orderTypes) && !Array.isArray(rawConfig?.channelValues)) {
    return normalizeConditionConfig('sales_channel', {
      ...rawConfig,
      channelValues: getSalesChannelConditionValues(rawConfig),
    })
  }
  const base = cloneJson(rawConfig, getDefaultConditionConfig(conditionKey))
  const normalized = { ...getDefaultConditionConfig(conditionKey), ...base }
  normalized.additionalConditionsMode = normalized.additionalConditionsMode === 'or' ? 'or' : 'and'

  if (Array.isArray(normalized.productMasks)) normalized.productMasks = normalized.productMasks.map(normalizeProductMask)
  if (Array.isArray(normalized.windows)) normalized.windows = normalized.windows.map(normalizeTimeWindow)
  if (Array.isArray(normalized.seriesIds)) normalized.seriesIds = normalizeStringList(normalized.seriesIds)
  if (Array.isArray(normalized.relatedCampaignIds)) normalized.relatedCampaignIds = normalizeStringList(normalized.relatedCampaignIds)
  if (Array.isArray(normalized.tags)) normalized.tags = normalizeStringList(normalized.tags)
  if (Array.isArray(normalized.program_ids)) normalized.program_ids = normalizeStringList(normalized.program_ids)
  if (conditionKey === 'sales_channel') normalized.channelValues = getSalesChannelConditionValues(normalized)
  if (Array.isArray(normalized.additionalConditions)) normalized.additionalConditions = normalized.additionalConditions.map(normalizeAdditionalCondition)

  if (conditionKey === 'calendar_schedule') {
    normalized.frequency = ['daily', 'weekly', 'monthly', 'yearly'].includes(normalized.frequency) ? normalized.frequency : 'daily'
    normalized.weekdays = Array.isArray(normalized.weekdays)
      ? Array.from({ length: 7 }, (_, index) => Boolean(normalized.weekdays[index]))
      : [false, false, false, false, false, false, false]
    normalized.dayOfMonth = normalized.dayOfMonth === 'last'
      ? 'last'
      : Math.min(31, Math.max(1, toInt(normalized.dayOfMonth, 1)))
    normalized.monthOfYear = Math.min(12, Math.max(1, toInt(normalized.monthOfYear, 1)))
  }
  if (conditionKey === 'birthday') {
    normalized.daysBefore = toInt(normalized.daysBefore, 0)
    normalized.daysAfter = toInt(normalized.daysAfter, 0)
  }
  if (conditionKey === 'period_total_order_amount' || conditionKey === 'period_order_count' || conditionKey === 'period_product_quantity' || conditionKey === 'period_sold_product_quantity') {
    normalized.periodDays = Math.max(1, toInt(normalized.periodDays, 30))
  }
  if (conditionKey === 'period_total_order_amount' || conditionKey === 'order_total') normalized.amount = toNumber(normalized.amount, 0)
  if (conditionKey === 'period_order_count') normalized.count = toInt(normalized.count, 0)
  if (conditionKey === 'period_total_order_amount' || conditionKey === 'period_order_count') {
    const hasExplicitIncludeCurrentOrder = Object.prototype.hasOwnProperty.call(rawConfig || {}, 'includeCurrentOrder')
    normalized.includeCurrentOrder = hasExplicitIncludeCurrentOrder
      ? toBoolean(rawConfig.includeCurrentOrder, false)
      : true
  }
  if (conditionKey === 'period_product_quantity' || conditionKey === 'period_sold_product_quantity' || conditionKey === 'order_item_quantity') normalized.quantity = toInt(normalized.quantity, 0)
  if (conditionKey === 'days_since_first_activity' || conditionKey === 'last_visit_days') normalized.days = toInt(normalized.days, 0)

  return normalized
}

function getThresholdFromConfig(conditionKey, config) {
  switch (conditionKey) {
    case 'period_total_order_amount':
    case 'order_total':
      return toNumber(config.amount, 0)
    case 'period_order_count':
      return toInt(config.count, 0)
    case 'period_product_quantity':
    case 'period_sold_product_quantity':
    case 'order_item_quantity':
      return toInt(config.quantity, 0)
    case 'days_since_first_activity':
    case 'last_visit_days':
      return toInt(config.days, 0)
    default:
      return 0
  }
}

function getOperatorFromConfig(conditionKey, config) {
  switch (conditionKey) {
    case 'period_total_order_amount':
    case 'period_order_count':
    case 'period_product_quantity':
    case 'period_sold_product_quantity':
    case 'days_since_first_activity':
    case 'order_item_quantity':
    case 'order_total':
    case 'last_visit_days':
      return COMPARISON_OPTIONS.some(option => option.value === config.operator) ? config.operator : 'gte'
    default:
      return 'gte'
  }
}

function getPeriodFromConfig(conditionKey, config) {
  switch (conditionKey) {
    case 'period_total_order_amount':
    case 'period_order_count':
    case 'period_product_quantity':
    case 'period_sold_product_quantity':
      return PERIOD_OPTIONS.some(option => option.value === config.period) ? config.period : 'all_time'
    default:
      return 'all_time'
  }
}

function normalizeActionConfig(actionType, rawConfig = {}) {
  const base = cloneJson(rawConfig, getDefaultActionConfig(actionType))
  const normalized = { ...getDefaultActionConfig(actionType), ...base }

  if (Array.isArray(normalized.items)) {
    if (actionType === 'product_pricing') normalized.items = normalized.items.map(normalizePricingRow)
    else normalized.items = normalized.items.map(normalizeOfferItem)
  }
  if (Array.isArray(normalized.groups)) normalized.groups = normalized.groups.map(normalizeComboGroup)
  if (Array.isArray(normalized.seriesIds)) normalized.seriesIds = normalizeStringList(normalized.seriesIds)

  if ('amount' in normalized) normalized.amount = toNumber(normalized.amount, 0)
  if ('percent' in normalized) normalized.percent = toNumber(normalized.percent, 0)
  if ('valueType' in normalized) normalized.valueType = ['amount', 'percent'].includes(normalized.valueType) ? normalized.valueType : 'amount'
  if ('includeAlreadyDiscounted' in normalized) normalized.includeAlreadyDiscounted = toBoolean(normalized.includeAlreadyDiscounted, false)
  if ('points' in normalized) normalized.points = toNumber(normalized.points, 0)
  if ('multiplier' in normalized) normalized.multiplier = toNumber(normalized.multiplier, 1)
  if ('priceValue' in normalized) normalized.priceValue = toNumber(normalized.priceValue, 0)
  if ('sortOrder' in normalized) normalized.sortOrder = toInt(normalized.sortOrder, 0)
  if ('warnMissingSidesThreshold' in normalized && normalized.warnMissingSidesThreshold !== '') normalized.warnMissingSidesThreshold = toInt(normalized.warnMissingSidesThreshold, 0)

  return normalized
}

export function normalizeRule(rule = {}, index = 0, scope = 'applicable') {
  const conditionKey = resolveConditionKey(rule.conditionKey)
  const operator = COMPARISON_OPTIONS.some(option => option.value === rule.operator)
    ? rule.operator
    : 'gte'
  const period = PERIOD_OPTIONS.some(option => option.value === rule.period)
    ? rule.period
    : 'all_time'
  const actionType = ACTION_TYPE_OPTIONS.some(option => option.value === rule.actionType)
    ? rule.actionType
    : 'bonus_points'
  const conditionConfig = normalizeConditionConfig(conditionKey, rule.conditionConfig || rule.condition_json || {})
  const actionConfig = normalizeActionConfig(actionType, rule.actionConfig || rule.action_json || {})
  const threshold = getThresholdFromConfig(conditionKey, conditionConfig)
  const normalizedOperator = getOperatorFromConfig(conditionKey, conditionConfig)
  const normalizedPeriod = getPeriodFromConfig(conditionKey, conditionConfig)

  return {
    id: String(rule.id || uid('rule')),
    scope: rule.scope === 'periodic' ? 'periodic' : scope,
    conditionKey,
    operator: COMPARISON_OPTIONS.some(option => option.value === normalizedOperator) ? normalizedOperator : operator,
    threshold: toNumber(threshold, 0),
    period: PERIOD_OPTIONS.some(option => option.value === normalizedPeriod) ? normalizedPeriod : period,
    actionType,
    actionSummary: toText(rule.actionSummary),
    conditionConfig,
    actionConfig,
    active: rule.active !== false,
    stopProcessing: toBoolean(rule.stopProcessing, false),
    sortOrder: toInt(rule.sortOrder, (index + 1) * 10),
  }
}

function getRuleConditionChannelTargets(rule = {}) {
  const conditions = [
    {
      conditionKey: rule.conditionKey,
      conditionConfig: rule.conditionConfig || {},
    },
    ...((rule.conditionConfig?.additionalConditions || []).map(condition => ({
      conditionKey: condition?.conditionKey,
      conditionConfig: condition?.config || {},
    }))),
  ]

  return [...new Set(
    conditions
      .filter(condition => condition.conditionKey === 'sales_channel')
      .flatMap(condition => getSalesChannelConditionValues(condition.conditionConfig)),
  )]
}

function deriveCampaignChannelTargets(applicableRules = [], fallbackChannelTargets = []) {
  const normalizedFallback = normalizeCampaignChannelTargets(fallbackChannelTargets)
  const activeRules = Array.isArray(applicableRules)
    ? applicableRules.filter(rule => rule?.active !== false)
    : []

  if (activeRules.length === 0) return normalizedFallback

  let hasRuleLevelChannelRestriction = false
  let hasUnrestrictedRule = false
  const collectedTargets = new Set()

  activeRules.forEach(rule => {
    const ruleTargets = getRuleConditionChannelTargets(rule)
    if (ruleTargets.length === 0) {
      hasUnrestrictedRule = true
      return
    }

    hasRuleLevelChannelRestriction = true
    ruleTargets.forEach(target => collectedTargets.add(target))
  })

  if (!hasRuleLevelChannelRestriction) return normalizedFallback
  if (hasUnrestrictedRule) return []
  return [...collectedTargets]
}

export function normalizeCampaign(campaign = {}, index = 0) {
  const campaignType = CAMPAIGN_TYPE_OPTIONS.some(option => option.value === campaign.campaignType)
    ? campaign.campaignType
    : 'bonus_points'
  const triggerType = CAMPAIGN_TRIGGER_OPTIONS.some(option => option.value === campaign.triggerType)
    ? campaign.triggerType
    : 'manual'
  const audienceType = CAMPAIGN_AUDIENCE_OPTIONS.some(option => option.value === campaign.audienceType)
    ? campaign.audienceType
    : 'all'
  const audienceCategoryIds = normalizeStringList(
    campaign.audienceCategoryIds
      || campaign.audience_json?.categoryIds
      || campaign.audienceJson?.categoryIds,
  )
  const applicableRules = Array.isArray(campaign.applicableRules)
    ? campaign.applicableRules.map((rule, ruleIndex) => normalizeRule(rule, ruleIndex, 'applicable'))
    : []
  const periodicRules = Array.isArray(campaign.periodicRules)
    ? campaign.periodicRules.map((rule, ruleIndex) => normalizeRule(rule, ruleIndex, 'periodic'))
    : []
  const channelTargets = deriveCampaignChannelTargets(applicableRules, campaign.channelTargets)
  const applicationMode = normalizeLoyaltyApplicationMode(
    campaign.applicationMode
    || campaign.metadata?.applicationMode
    || campaign.audience_json?.applicationMode
    || campaign.audienceJson?.applicationMode,
  )
  const metadata = cloneJson(campaign.metadata, {})

  return {
    id: String(campaign.id || uid('campaign')),
    programId: String(campaign.programId || DEFAULT_LOYALTY_PROGRAM.id),
    name: toText(campaign.name),
    code: normalizeCode(campaign.code || campaign.name, 'campaign').toUpperCase(),
    description: toText(campaign.description),
    campaignType,
    triggerType,
    rewardValue: toNumber(campaign.rewardValue, 0),
    audienceType,
    audienceCategoryIds,
    channelTargets,
    applicationMode,
    metadata,
    startsAt: normalizeDateTime(campaign.startsAt),
    endsAt: normalizeDateTime(campaign.endsAt),
    priority: toInt(campaign.priority, (index + 1) * 10),
    stackable: toBoolean(campaign.stackable, false),
    exclusionGroup: typeof campaign.exclusionGroup === 'string' ? campaign.exclusionGroup.trim() : (campaign.metadata?.exclusionGroup || ''),
    active: campaign.active !== false,
    applicableRules,
    periodicRules,
  }
}

function normalizeCouponSeriesBase(series = {}, index = 0) {
  const charset = COUPON_CHARSET_OPTIONS.some(option => option.value === series.charset)
    ? series.charset
    : 'numeric'
  const metadata = cloneJson(series.metadata, {})
  const benefitConfig = normalizeCouponBenefitConfig(
    series.benefitConfig
    || series.benefit_config
    || series.redemptionEffect
    || metadata.benefitConfig
    || metadata.redemptionEffect
    || {},
  )
  const _couponsNotLoaded = toBoolean(series._couponsNotLoaded || metadata?._couponsNotLoaded, false)
  const normalized = {
    id: String(series.id || uid('coupon-series')),
    name: toText(series.name || `Kupon Serisi ${index + 1}`),
    prefix: slugifyPrefix(series.prefix || series.name || 'SRI'),
    singleCoupon: toBoolean(series.singleCoupon, false),
    couponCount: Math.max(1, toInt(series.couponCount, 1)),
    randomLength: Math.max(1, toInt(series.randomLength, 6)),
    charset,
    useAfterCheckout: toBoolean(series.useAfterCheckout, false),
    validFrom: normalizeDateTime(series.validFrom || series.valid_from || metadata.validFrom || metadata.valid_from),
    validUntil: normalizeDateTime(series.validUntil || series.valid_until || metadata.validUntil || metadata.valid_until),
    expiresInDays: Math.max(0, toInt(series.expiresInDays || series.expires_in_days || metadata.expiresInDays || metadata.expires_in_days, 0)),
    autoDeactivateOnExpiry: (
      series.autoDeactivateOnExpiry
      ?? series.auto_deactivate_on_expiry
      ?? metadata.autoDeactivateOnExpiry
      ?? metadata.auto_deactivate_on_expiry
    ) !== false,
    active: series.active !== false,
    metadata,
    benefitConfig,
    _couponsNotLoaded,
  }

  const rawCoupons = _couponsNotLoaded
    ? []
    : (Array.isArray(series.coupons)
      ? series.coupons
      : (Array.isArray(series.codes)
        ? series.codes.map(code => ({ code }))
        : []))

  const coupons = rawCoupons
    .map((coupon, couponIndex) => normalizeCouponRecord(coupon, normalized, couponIndex))
    .filter(coupon => coupon.code)

  return {
    ...normalized,
    coupons,
    codes: coupons.map(coupon => coupon.code),
  }
}

export function getCouponTargetCount(series = {}) {
  const normalized = normalizeCouponSeriesBase(series)
  return normalized.singleCoupon ? 1 : normalized.couponCount
}

function createUniqueCouponCodes(series = {}, targetCount = 1, seedCodes = []) {
  const normalized = normalizeCouponSeriesBase(series)
  const seen = new Set()
  const result = []

  ;(seedCodes || []).forEach(code => {
    const normalizedCode = String(code || '').trim()
    if (!normalizedCode || seen.has(normalizedCode)) return
    seen.add(normalizedCode)
    result.push(normalizedCode)
  })

  while (result.length < targetCount) {
    const nextCode = createCouponCode(normalized.prefix, normalized.charset, normalized.randomLength)
    if (seen.has(nextCode)) continue
    seen.add(nextCode)
    result.push(nextCode)
  }

  return result.slice(0, targetCount)
}

function createUniqueCouponEntries(series = {}, targetCount = 1, seedCoupons = []) {
  const normalized = normalizeCouponSeriesBase(series)
  const seen = new Set()
  const result = []

  ;(seedCoupons || []).forEach((coupon, index) => {
    const normalizedCoupon = normalizeCouponRecord(coupon, normalized, index)
    if (!normalizedCoupon.code || seen.has(normalizedCoupon.code)) return
    seen.add(normalizedCoupon.code)
    result.push(normalizedCoupon)
  })

  while (result.length < targetCount) {
    const issuedAt = new Date().toISOString()
    const code = createCouponCode(normalized.prefix, normalized.charset, normalized.randomLength)
    if (seen.has(code)) continue
    seen.add(code)
    result.push(normalizeCouponRecord({
      id: uid('coupon'),
      code,
      issuedAt,
      expiresAt: buildCouponDefaultExpiry(normalized, issuedAt),
      redemptionStatus: 'available',
      active: true,
    }, normalized, result.length))
  }

  return result.slice(0, targetCount)
}

export function syncCouponSeriesCodes(series = {}, options = {}) {
  const normalized = normalizeCouponSeriesBase(series)
  if (normalized._couponsNotLoaded) {
    return normalized
  }
  const targetCount = getCouponTargetCount(normalized)
  const mode = options.mode === 'regenerate' ? 'regenerate' : 'preserve'

  if (mode === 'regenerate') {
    const coupons = createUniqueCouponEntries(normalized, targetCount)
    return {
      ...normalized,
      coupons,
      codes: coupons.map(coupon => coupon.code),
    }
  }

  const protectedCoupons = normalized.coupons.filter(isCouponProtectedRecord)
  const removableCoupons = normalized.coupons.filter(coupon => !isCouponProtectedRecord(coupon))
  const desiredCount = Math.max(targetCount, protectedCoupons.length)
  const seedCoupons = [...protectedCoupons, ...removableCoupons].slice(0, desiredCount)
  const coupons = createUniqueCouponEntries(normalized, desiredCount, seedCoupons)
  return {
    ...normalized,
    coupons,
    codes: coupons.map(coupon => coupon.code),
  }
}

export function normalizeCouponSeries(series = {}, index = 0) {
  const normalized = normalizeCouponSeriesBase(series, index)

  if (normalized._couponsNotLoaded) return normalized

  if (normalized.coupons.length > 0) return normalized
  const coupons = createUniqueCouponEntries(normalized, getCouponTargetCount(normalized))
  return {
    ...normalized,
    coupons,
    codes: coupons.map(coupon => coupon.code),
  }
}

function isSchemaMissingError(error) {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase()
  return (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find') ||
    message.includes('column') ||
    message.includes('relation')
  )
}

export function getLoyaltyScopeInfo(workspace = {}) {
  const branchKey = String(workspace.branchId || '').trim()
  const branchId = asUuidOrNull(branchKey)
  const branchName = String(workspace.branchName || '').trim()
  const isBranchScope = workspace.scope === 'branch' && (branchId || branchName)
  const branchLabel = branchName || branchKey || 'Secili Sube'
  return {
    scopeType: isBranchScope ? 'branch' : 'global',
    branchId: isBranchScope ? branchId : null,
    branchKey: isBranchScope ? branchKey : '',
    branchName: isBranchScope ? branchName : '',
    label: isBranchScope ? `${branchLabel} kampanyalari` : 'Merkez / global sadakat ayarlari',
    description: isBranchScope
      ? 'Bu kayitlar sadece secili restoran veya sube icin gecerli olur.'
      : 'Bu kayitlar tum organizasyon icin ortak varsayilan olarak davranir.',
  }
}

function applyScopeFilter(query, scopeInfo) {
  if (scopeInfo.scopeType === 'branch') {
    const scopedQuery = query.eq('scope_type', 'branch')
    const branchId = String(scopeInfo.branchId || '').trim()
    const branchName = String(scopeInfo.branchName || '').trim()

    if (branchId && branchName) {
      if (typeof scopedQuery.or === 'function') {
        return scopedQuery.or(`scope_branch_id.eq.${escapePostgrestValue(branchId)},scope_branch_name.eq.${escapePostgrestValue(branchName)}`)
      }
      return scopedQuery.eq('scope_branch_id', branchId)
    }
    if (branchId) return scopedQuery.eq('scope_branch_id', branchId)
    if (branchName) return scopedQuery.eq('scope_branch_name', branchName)
  }
  return query.eq('scope_type', 'global')
}

function stripScopeColumns(row = {}) {
  const next = { ...row }
  delete next.scope_type
  delete next.scope_branch_id
  delete next.scope_branch_name
  return next
}

async function runScopeAwareSchemaSafeQuery(scopedQueryFactory, legacyQueryFactory, issueBucket, issueCode) {
  try {
    const result = await scopedQueryFactory()
    if (result?.error) throw result.error
    return { data: result?.data || [], ok: true, usedLegacyScopeFallback: false }
  } catch (error) {
    if (isSchemaMissingError(error) && legacyQueryFactory) {
      try {
        const legacyResult = await legacyQueryFactory()
        if (legacyResult?.error) throw legacyResult.error
        issueBucket.push({
          code: `${issueCode}_scope_legacy`,
          message: String(error?.message || error?.details || error?.hint || 'Scope columns missing, legacy scope fallback used'),
        })
        return { data: legacyResult?.data || [], ok: true, usedLegacyScopeFallback: true }
      } catch (legacyError) {
        issueBucket.push({
          code: issueCode,
          message: String(legacyError?.message || legacyError?.details || legacyError?.hint || 'Query failed'),
        })
        return { data: [], ok: false, usedLegacyScopeFallback: false }
      }
    }

    issueBucket.push({
      code: issueCode,
      message: String(error?.message || error?.details || error?.hint || 'Query failed'),
    })
    return { data: [], ok: false, usedLegacyScopeFallback: false }
  }
}

async function runSchemaSafeQuery(queryFactory, issueBucket, issueCode) {
  try {
    const result = await queryFactory()
    if (result?.error) throw result.error
    return { data: result?.data || [], ok: true }
  } catch (error) {
    issueBucket.push({
      code: issueCode,
      message: String(error?.message || error?.details || error?.hint || 'Query failed'),
    })
    return { data: [], ok: false }
  }
}

function buildCustomerInsights(baseCustomers = [], profileCustomers = []) {
  const profileMap = new Map(profileCustomers.map(customer => [customer.id, customer]))
  const combined = baseCustomers.map(customer => ({ ...customer, ...(profileMap.get(customer.id) || {}) }))

  return {
    totalCustomers: combined.length,
    reachableCustomers: combined.filter(customer => customer.telefon || customer.email).length,
    loyaltyMembers: combined.filter(customer => customer.loyalty_enrolled_at || (customer.loyalty_status && customer.loyalty_status !== 'prospect')).length,
    birthdayKnown: combined.filter(customer => customer.birth_date).length,
    consentReady: combined.filter(customer => customer.marketing_consent_at || customer.sms_opt_in || customer.email_opt_in || customer.push_opt_in).length,
    mobileLinked: combined.filter(customer => customer.mobile_app_user_id || customer.external_customer_ref).length,
  }
}

async function loadCustomerSnapshots() {
  try {
    const { data: baseCustomers, error: baseError } = await db
      .from('musteriler')
      .select('id,cari,email,telefon,toplam_borc,toplam_alacak')
      .is('deleted_at', null)
    if (baseError) throw baseError

    const { data: profileCustomers, error: profileError } = await db
      .from('musteriler')
      .select('id,birth_date,loyalty_status,loyalty_enrolled_at,sms_opt_in,email_opt_in,push_opt_in,marketing_consent_at,mobile_app_user_id,external_customer_ref')
      .is('deleted_at', null)
    if (profileError) throw profileError
    return { baseCustomers: baseCustomers || [], profileCustomers: profileCustomers || [], customerSchemaReady: true }
  } catch (error) {
    return { baseCustomers: [], profileCustomers: [], customerSchemaReady: false }
  }
}

export function normalizeReferralProgram(program = {}) {
  const mode = ['unique_multiple', 'single_reusable_date', 'single_reusable_limit'].includes(program.mode)
    ? program.mode
    : 'unique_multiple'
  return {
    id: String(program.id || uid('refprog')),
    name: toText(program.name || 'Yeni Referans Programı'),
    mode,
    configJson: cloneJson(program.configJson || program.config_json, {}),
    allowedReferrerCategories: Array.isArray(program.allowedReferrerCategories || program.allowed_referrer_categories)
      ? (program.allowedReferrerCategories || program.allowed_referrer_categories)
      : [],
    successCriteria: ['registration', 'nth_purchase'].includes(program.successCriteria || program.success_criteria)
      ? (program.successCriteria || program.success_criteria)
      : 'registration',
    successPurchaseCount: Math.max(1, toInt(program.successPurchaseCount ?? program.success_purchase_count, 1)),
    active: program.active !== false,
  }
}

function fromReferralProgramRow(row = {}) {
  return normalizeReferralProgram({
    id: row.id,
    name: row.name,
    mode: row.mode,
    config_json: row.config_json,
    allowed_referrer_categories: row.allowed_referrer_categories,
    success_criteria: row.success_criteria,
    success_purchase_count: row.success_purchase_count,
    active: row.active,
  })
}

function toReferralProgramRow(program = {}, scopeInfo) {
  const normalized = normalizeReferralProgram(program)
  return {
    id: normalized.id,
    name: normalized.name,
    mode: normalized.mode,
    config_json: normalized.configJson,
    allowed_referrer_categories: normalized.allowedReferrerCategories,
    success_criteria: normalized.successCriteria,
    success_purchase_count: normalized.successPurchaseCount,
    active: normalized.active,
    scope: scopeInfo.scopeType,
    branch_id: scopeInfo.scopeType === 'branch' ? scopeInfo.branchId : null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function applyReferralProgramsScopeFilter(query, scopeInfo) {
  if (scopeInfo.scopeType === 'branch') {
    return query.eq('scope', 'branch').eq('branch_id', scopeInfo.branchId)
  }
  return query.eq('scope', 'global')
}

async function softDeleteMissingReferralPrograms(scopeInfo, activeIds = []) {
  let query = db.from('loyalty_referral_programs').select('id').is('deleted_at', null)
  query = applyReferralProgramsScopeFilter(query, scopeInfo)
  const { data, error } = await query
  if (error) throw error

  const staleIds = (data || [])
    .map(row => row.id)
    .filter(id => !activeIds.includes(id))

  if (staleIds.length === 0) return

  const { error: updateError } = await db
    .from('loyalty_referral_programs')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      active: false,
    })
    .in('id', staleIds)

  if (updateError) throw updateError
}

function fromProgramRow(row = {}) {
  return normalizeProgram({
    id: row.id,
    name: row.name,
    programType: row.program_type,
    programFamily: row.program_family,
    earnModel: row.earn_model,
    redemptionModel: row.redemption_model,
    redemptionRate: row.redemption_rate,
    cardMode: row.card_mode,
    frequencyGoal: row.frequency_goal,
    frequencyResetPeriod: row.frequency_reset_period,
    frequencyRewardType: row.frequency_reward_json?.type,
    frequencyRewardValue: row.frequency_reward_json?.value,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    description: row.description,
    active: row.active,
    chainWideActive: row.chain_wide_active,
    notifyBalanceChange: row.notify_balance_change,
    notificationChannel: row.notification_channel,
    webhookEnabled: row.webhook_enabled,
    webhookTemplate: row.webhook_template,
  })
}

function toProgramRow(program = {}, scopeInfo) {
  const normalized = normalizeProgram(program)
  return {
    id: normalized.id,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    name: normalized.name,
    description: normalized.description || null,
    program_type: normalized.programType,
    program_family: normalized.programFamily,
    earn_model: normalized.earnModel,
    redemption_model: normalized.redemptionModel,
    redemption_rate: normalized.redemptionRate,
    card_mode: normalized.cardMode,
    frequency_goal: normalized.frequencyGoal,
    frequency_reset_period: normalized.frequencyResetPeriod,
    frequency_reward_json: {
      type: normalized.frequencyRewardType,
      value: normalized.frequencyRewardValue,
    },
    starts_at: normalized.startsAt || null,
    ends_at: normalized.endsAt || null,
    active: normalized.active,
    chain_wide_active: normalized.chainWideActive,
    notify_balance_change: normalized.notifyBalanceChange,
    notification_channel: normalized.notificationChannel,
    webhook_enabled: normalized.webhookEnabled,
    webhook_template: normalized.webhookTemplate || null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromTierRow(row = {}, index = 0) {
  return normalizeTier({
    id: row.id,
    code: row.code,
    name: row.name,
    minSpend: row.min_spend_total,
    minOrderCount: row.min_order_count,
    pointsMultiplier: row.points_multiplier,
    birthdayBonusPoints: row.birthday_bonus_points,
    benefitsSummary: row.benefits_summary,
    color: row.color,
    active: row.active,
    sortOrder: row.sort_order,
  }, index)
}

function toTierRow(tier = {}, scopeInfo) {
  const normalized = normalizeTier(tier)
  return {
    id: normalized.id,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    code: normalized.code,
    name: normalized.name,
    min_spend_total: normalized.minSpend,
    min_order_count: normalized.minOrderCount,
    points_multiplier: normalized.pointsMultiplier,
    birthday_bonus_points: normalized.birthdayBonusPoints,
    benefits_summary: normalized.benefitsSummary || null,
    benefits_json: normalized.benefitsSummary ? { summary: normalized.benefitsSummary } : {},
    color: normalized.color,
    active: normalized.active,
    sort_order: normalized.sortOrder,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromRuleRow(row = {}, index = 0) {
  return normalizeRule({
    id: row.id,
    scope: row.rule_scope,
    conditionKey: row.condition_key,
    operator: row.operator,
    threshold: row.threshold_value,
    period: row.period_window,
    actionType: row.action_type,
    actionSummary: row.action_summary,
    conditionConfig: row.condition_json,
    actionConfig: row.action_json,
    active: row.active,
    stopProcessing: row.stop_processing,
    sortOrder: row.sort_order,
  }, index, row.rule_scope)
}

function toRuleRow(rule = {}, campaignId) {
  const normalized = normalizeRule(rule, 0, rule.scope)
  return {
    id: normalized.id,
    campaign_id: campaignId,
    rule_scope: normalized.scope,
    condition_key: normalized.conditionKey,
    operator: normalized.operator,
    threshold_value: normalized.threshold,
    period_window: normalized.period,
    action_type: normalized.actionType,
    action_summary: normalized.actionSummary || null,
    stop_processing: normalized.stopProcessing,
    active: normalized.active,
    sort_order: normalized.sortOrder,
    condition_json: {
      key: normalized.conditionKey,
      operator: normalized.operator,
      threshold: normalized.threshold,
      period: normalized.period,
      ...normalized.conditionConfig,
    },
    action_json: {
      type: normalized.actionType,
      summary: normalized.actionSummary,
      ...normalized.actionConfig,
    },
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromCampaignRow(row = {}, index = 0) {
  const metadata = cloneJson(row.metadata, {})
  return normalizeCampaign({
    id: row.id,
    programId: row.program_id,
    name: row.name,
    code: row.code,
    description: row.description,
    campaignType: row.campaign_type,
    triggerType: row.trigger_type,
    rewardValue: row.reward_value,
    audienceType: row.audience_json?.type,
    audienceCategoryIds: row.audience_json?.categoryIds,
    channelTargets: row.channel_targets,
    applicationMode: metadata.applicationMode || row.audience_json?.applicationMode,
    metadata,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    priority: row.priority,
    stackable: row.stackable,
    exclusionGroup: metadata.conflictGroupId || metadata.exclusionGroup || '',
    active: row.active,
  }, index)
}

function toCampaignRow(campaign = {}, scopeInfo, programId) {
  const normalized = normalizeCampaign({ ...campaign, programId })
  const conflictGroupId = String(normalized.metadata?.conflictGroupId || normalized.exclusionGroup || '').trim()
  const conflictGroupName = String(normalized.metadata?.conflictGroupName || '').trim()
  const metadata = {
    ...cloneJson(normalized.metadata, {}),
    applicationMode: normalized.applicationMode,
    conflictGroupId: conflictGroupId || undefined,
    conflictGroupName: conflictGroupName || undefined,
    exclusionGroup: conflictGroupId || undefined,
  }
  return {
    id: normalized.id,
    program_id: normalized.programId,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    name: normalized.name,
    code: normalized.code,
    description: normalized.description || null,
    campaign_type: normalized.campaignType,
    trigger_type: normalized.triggerType,
    reward_type: normalized.campaignType,
    reward_value: normalized.rewardValue,
    priority: normalized.priority,
    stackable: normalized.stackable,
    active: normalized.active,
    status: normalized.active ? 'active' : 'draft',
    starts_at: normalized.startsAt || null,
    ends_at: normalized.endsAt || null,
    channel_targets: normalized.channelTargets,
    audience_json: {
      type: normalized.audienceType,
      categoryIds: normalized.audienceCategoryIds,
    },
    metadata,
    conditions_json: [],
    actions_json: [],
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromCampaignConflictGroupRow(row = {}) {
  return {
    id: String(row.id || ''),
    name: toText(row.name),
    code: toText(row.code),
    description: toText(row.description),
    active: row.active !== false,
    sortOrder: toInt(row.sort_order, 100),
    metadata: cloneJson(row.metadata, {}),
  }
}

function toCampaignConflictGroupRow(group = {}, scopeInfo) {
  const name = toText(group.name).trim()
  const id = String(group.id || uid('campaign-conflict-group'))
  return {
    id,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    name,
    code: normalizeCode(group.code || name, 'conflict_group'),
    description: toText(group.description) || null,
    active: group.active !== false,
    sort_order: toInt(group.sortOrder ?? group.sort_order, 100),
    metadata: cloneJson(group.metadata, {}),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromCouponSeriesRow(row = {}, coupons = []) {
  return normalizeCouponSeries({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    singleCoupon: row.single_coupon,
    couponCount: row.coupon_count,
    randomLength: row.random_length,
    charset: row.charset,
    useAfterCheckout: row.use_after_checkout,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    expiresInDays: row.expires_in_days,
    autoDeactivateOnExpiry: row.auto_deactivate_on_expiry,
    active: row.active,
    metadata: row.metadata || {},
    coupons,
  })
}

function toCouponSeriesRow(series = {}, scopeInfo) {
  const normalized = normalizeCouponSeries(series)
  const {
    benefitConfig,
    benefit_config,
    redemptionEffect,
    redemption_effect,
    validFrom,
    valid_from,
    validUntil,
    valid_until,
    expiresInDays,
    expires_in_days,
    autoDeactivateOnExpiry,
    auto_deactivate_on_expiry,
    ...metadata
  } = normalized.metadata || {}
  return {
    id: normalized.id,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    name: normalized.name,
    prefix: normalized.prefix,
    single_coupon: normalized.singleCoupon,
    coupon_count: normalized.singleCoupon ? 1 : normalized.couponCount,
    random_length: normalized.randomLength,
    charset: normalized.charset,
    use_after_checkout: normalized.useAfterCheckout,
    active: normalized.active,
    metadata,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromCustomerCategoryRow(row = {}, index = 0) {
  return normalizeCustomerCategory({
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    color: row.color,
    active: row.active,
    sortOrder: row.sort_order,
  }, index)
}

function toCustomerCategoryRow(category = {}, scopeInfo) {
  const normalized = normalizeCustomerCategory(category)
  return {
    id: normalized.id,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    name: normalized.name,
    code: normalized.code,
    description: normalized.description || null,
    color: normalized.color,
    active: normalized.active,
    sort_order: normalized.sortOrder,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function fromCustomerCategoryAssignmentRow(row = {}) {
  return {
    id: String(row.id || ''),
    customerId: row.customer_id || null,
    categoryId: String(row.category_id || ''),
    active: row.active !== false,
  }
}

function toCustomerCategoryAssignmentRow(customerId, categoryId, scopeInfo, existingRow = null) {
  return {
    id: existingRow?.id || uid('customer-category-member'),
    customer_id: customerId,
    category_id: categoryId,
    scope_type: scopeInfo.scopeType,
    scope_branch_id: scopeInfo.branchId,
    scope_branch_name: scopeInfo.branchName || null,
    active: true,
    metadata: cloneJson(existingRow?.metadata, {}),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

async function loadScopedCustomerCategoryRows(scopeInfo, { activeOnly = false } = {}) {
  let query = db.from('loyalty_customer_categories')
    .select('id,name,code,description,color,active,sort_order')
    .is('deleted_at', null)
    .order('sort_order')

  if (activeOnly) query = query.eq('active', true)

  const { data, error } = await applyScopeFilter(query, scopeInfo)
  if (error) throw error
  return (data || []).map(fromCustomerCategoryRow)
}

async function readCustomerTagCategoryIds(customerId) {
  const { data, error } = await db
    .from('musteriler')
    .select('id,tags')
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error
  return normalizeStringList(data?.tags)
}

async function writeCustomerTagCategoryIds(customerId, nextScopeCategoryIds = [], scopeCategoryIds = []) {
  const { data, error } = await db
    .from('musteriler')
    .select('id,tags')
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error

  const currentCategoryIds = normalizeStringList(data?.tags)
  const preservedCategoryIds = currentCategoryIds.filter(categoryId => !scopeCategoryIds.includes(categoryId))
  const mergedCategoryIds = [...new Set([...preservedCategoryIds, ...normalizeStringList(nextScopeCategoryIds)])]

  const { error: updateError } = await db
    .from('musteriler')
    .update({ tags: mergedCategoryIds })
    .eq('id', customerId)

  if (updateError) throw updateError
  return mergedCategoryIds
}

function buildCustomerCategoryFallbackMeta(scopeInfo) {
  return {
    scopeInfo,
    schemaReady: true,
    databaseUnavailable: false,
    dataSource: 'musteriler',
    fallbackMode: 'musteriler.tags',
    prodSafe: true,
  }
}

function buildCouponRows(series = {}) {
  const normalized = syncCouponSeriesCodes(series)
  return normalized.coupons.map(coupon => ({
    id: coupon.id || uid('coupon'),
    series_id: normalized.id,
    customer_id: coupon.customerId,
    code: coupon.code,
    is_used: coupon.isUsed,
    used_at: coupon.usedAt || null,
    issued_at: coupon.issuedAt || new Date().toISOString(),
    expires_at: coupon.expiresAt || null,
    redeemed_by_customer_id: coupon.redeemedByCustomerId,
    redeemed_channel: coupon.redeemedChannel || null,
    redeemed_source_ref_id: coupon.redeemedSourceRefId || null,
    redemption_status: coupon.redemptionStatus || 'available',
    source_ref_id: coupon.redeemedSourceRefId || null,
    use_after_checkout: normalized.useAfterCheckout,
    active: coupon.active !== false && normalized.active,
    note: coupon.note || null,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }))
}

function mergeCouponRecordWithExisting(coupon = {}, existingRow = null, series = {}) {
  const normalizedSeries = normalizeCouponSeriesBase(series)
  const incomingCoupon = normalizeCouponRecord(coupon, normalizedSeries)
  const existingCoupon = existingRow ? normalizeCouponRecord(existingRow, normalizedSeries) : null
  const preserveLifecycle = Boolean(existingCoupon) && isCouponProtectedRecord(existingCoupon)

  return normalizeCouponRecord({
    ...(existingCoupon || {}),
    ...incomingCoupon,
    id: existingCoupon?.id || incomingCoupon.id,
    code: incomingCoupon.code || existingCoupon?.code,
    customerId: preserveLifecycle
      ? existingCoupon?.customerId
      : (incomingCoupon.customerId || existingCoupon?.customerId || null),
    issuedAt: preserveLifecycle
      ? existingCoupon?.issuedAt
      : (incomingCoupon.issuedAt || existingCoupon?.issuedAt),
    expiresAt: preserveLifecycle
      ? existingCoupon?.expiresAt
      : (incomingCoupon.expiresAt || existingCoupon?.expiresAt),
    isUsed: preserveLifecycle ? existingCoupon?.isUsed : incomingCoupon.isUsed,
    usedAt: preserveLifecycle
      ? existingCoupon?.usedAt
      : (incomingCoupon.usedAt || existingCoupon?.usedAt),
    redeemedByCustomerId: preserveLifecycle
      ? existingCoupon?.redeemedByCustomerId
      : (incomingCoupon.redeemedByCustomerId || existingCoupon?.redeemedByCustomerId || null),
    redeemedChannel: preserveLifecycle
      ? existingCoupon?.redeemedChannel
      : (incomingCoupon.redeemedChannel || existingCoupon?.redeemedChannel || ''),
    redeemedSourceRefId: preserveLifecycle
      ? existingCoupon?.redeemedSourceRefId
      : (incomingCoupon.redeemedSourceRefId || existingCoupon?.redeemedSourceRefId || ''),
    redemptionStatus: preserveLifecycle
      ? existingCoupon?.redemptionStatus
      : (incomingCoupon.redemptionStatus || existingCoupon?.redemptionStatus || 'available'),
    note: incomingCoupon.note || existingCoupon?.note || '',
  }, normalizedSeries)
}

function buildCouponRow(series = {}, coupon = {}, existingRow = null) {
  const normalizedSeries = normalizeCouponSeriesBase(series)
  const normalizedCoupon = mergeCouponRecordWithExisting(coupon, existingRow, normalizedSeries)
  const protectedRow = isCouponProtectedRecord(existingRow || {})

  return {
    id: String(existingRow?.id || normalizedCoupon.id || uid('coupon')),
    series_id: normalizedSeries.id,
    customer_id: normalizedCoupon.customerId,
    code: normalizedCoupon.code,
    is_used: normalizedCoupon.isUsed,
    used_at: normalizedCoupon.usedAt || null,
    source_ref_id: protectedRow
      ? (existingRow?.source_ref_id || normalizedCoupon.redeemedSourceRefId || null)
      : (normalizedCoupon.redeemedSourceRefId || null),
    use_after_checkout: normalizedSeries.useAfterCheckout,
    active: normalizedCoupon.active !== false && normalizedSeries.active,
    metadata: {
      ...cloneJson(existingRow?.metadata, {}),
      issuedAt: existingRow?.issued_at || normalizedCoupon.issuedAt || new Date().toISOString(),
      expiresAt: normalizedCoupon.expiresAt || existingRow?.expires_at || null,
      redeemedByCustomerId: protectedRow
        ? (existingRow?.redeemed_by_customer_id || normalizedCoupon.redeemedByCustomerId || null)
        : (normalizedCoupon.redeemedByCustomerId || null),
      redeemedChannel: protectedRow
        ? (existingRow?.redeemed_channel || normalizedCoupon.redeemedChannel || null)
        : (normalizedCoupon.redeemedChannel || null),
      redeemedSourceRefId: protectedRow
        ? (existingRow?.redeemed_source_ref_id || normalizedCoupon.redeemedSourceRefId || null)
        : (normalizedCoupon.redeemedSourceRefId || null),
      redemptionStatus: protectedRow
        ? (existingRow?.redemption_status || normalizedCoupon.redemptionStatus || 'available')
        : (normalizedCoupon.redemptionStatus || 'available'),
      note: normalizedCoupon.note || null,
    },
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
}

function buildCouponPersistencePlan(couponSeries = [], existingRows = []) {
  const existingRowsBySeries = new Map()
  ;(existingRows || []).forEach(row => {
    const key = String(row.series_id || '')
    if (!key) return
    const current = existingRowsBySeries.get(key) || []
    current.push(row)
    existingRowsBySeries.set(key, current)
  })

  const upsertRows = []
  const softDeleteIds = []
  const persistedCouponSeries = []

  ;(couponSeries || []).forEach(series => {
    const normalizedSeries = syncCouponSeriesCodes(series)
    if (normalizedSeries._couponsNotLoaded) {
      persistedCouponSeries.push(normalizedSeries)
      return
    }
    const currentRows = existingRowsBySeries.get(normalizedSeries.id) || []
    const currentRowsById = new Map(currentRows.map(row => [String(row.id || ''), row]))
    const currentRowsByCode = new Map(currentRows.map(row => [String(row.code || '').trim(), row]))
    const desiredIds = new Set()
    const desiredCodes = new Set()
    const seriesRows = []

    normalizedSeries.coupons.forEach(coupon => {
      const couponId = String(coupon.id || '')
      const couponCode = String(coupon.code || '').trim()
      const existingRow = currentRowsById.get(couponId) || currentRowsByCode.get(couponCode) || null
      const row = buildCouponRow(normalizedSeries, coupon, existingRow)
      upsertRows.push(row)
      seriesRows.push(row)
      desiredIds.add(String(row.id))
      if (row.code) desiredCodes.add(String(row.code).trim())
    })

    currentRows.forEach(row => {
      const rowId = String(row.id || '')
      const rowCode = String(row.code || '').trim()
      if (desiredIds.has(rowId) || (rowCode && desiredCodes.has(rowCode))) return

      if (isCouponProtectedRecord(row)) {
        const preservedRow = buildCouponRow(normalizedSeries, row, row)
        upsertRows.push(preservedRow)
        seriesRows.push(preservedRow)
        desiredIds.add(String(preservedRow.id))
        if (preservedRow.code) desiredCodes.add(String(preservedRow.code).trim())
        return
      }

      if (rowId) softDeleteIds.push(rowId)
    })

    persistedCouponSeries.push(normalizeCouponSeries({
      ...normalizedSeries,
      coupons: seriesRows.map(row => normalizeCouponRecord(row, normalizedSeries)),
    }))
  })

  return {
    upsertRows,
    softDeleteIds,
    couponSeries: persistedCouponSeries,
  }
}

function attachRulesToCampaigns(campaigns = [], rules = []) {
  const ruleMap = new Map()
  ;(rules || []).forEach(rule => {
    const current = ruleMap.get(rule.campaign_id) || { applicable: [], periodic: [] }
    if (rule.rule_scope === 'periodic') current.periodic.push(rule)
    else current.applicable.push(rule)
    ruleMap.set(rule.campaign_id, current)
  })

  return campaigns.map((campaign, index) => {
    const current = ruleMap.get(campaign.id) || { applicable: [], periodic: [] }
    return normalizeCampaign({
      ...campaign,
      applicableRules: current.applicable.map(fromRuleRow),
      periodicRules: current.periodic.map(fromRuleRow),
    }, index)
  })
}

async function softDeleteMissingScopedRows(tableName, scopeInfo, activeIds = []) {
  let data = []
  try {
    const scopedResult = await applyScopeFilter(
      db.from(tableName).select('id').is('deleted_at', null),
      scopeInfo,
    )
    if (scopedResult.error) throw scopedResult.error
    data = scopedResult.data || []
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error
    const legacyResult = await db
      .from(tableName)
      .select('id')
      .is('deleted_at', null)
    if (legacyResult.error) throw legacyResult.error
    data = legacyResult.data || []
  }

  const staleIds = (data || [])
    .map(row => row.id)
    .filter(id => !activeIds.includes(id))

  if (staleIds.length === 0) return

  const { error: updateError } = await db
    .from(tableName)
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      active: false,
    })
    .in('id', staleIds)

  if (updateError) throw updateError
}

async function upsertScopeAwareRows(tableName, rows = [], onConflict = 'id') {
  if (!Array.isArray(rows) || rows.length === 0) return { usedLegacyScopeFallback: false }
  try {
    const { error } = await db.from(tableName).upsert(rows, { onConflict })
    if (error) throw error
    return { usedLegacyScopeFallback: false }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error
    const legacyRows = rows.map(stripScopeColumns)
    const { error: legacyError } = await db.from(tableName).upsert(legacyRows, { onConflict })
    if (legacyError) throw legacyError
    return { usedLegacyScopeFallback: true }
  }
}

async function softDeleteMissingChildRows(tableName, parentColumn, parentIds = [], activeIds = []) {
  if (parentIds.length === 0) return

  const { data, error } = await db
    .from(tableName)
    .select('id')
    .in(parentColumn, parentIds)
    .is('deleted_at', null)

  if (error) throw error

  const staleIds = (data || [])
    .map(row => row.id)
    .filter(id => !activeIds.includes(id))

  if (staleIds.length === 0) return

  const { error: updateError } = await db
    .from(tableName)
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      active: false,
    })
    .in('id', staleIds)

  if (updateError) throw updateError
}

export async function loadCouponsForSeries(seriesId) {
  const schemaIssues = []
  const couponsRes = await runSchemaSafeQuery(
    () => db.from('loyalty_coupons')
      .select('id,series_id,customer_id,code,is_used,used_at,source_ref_id,use_after_checkout,active,metadata,created_at')
      .eq('series_id', seriesId)
      .is('deleted_at', null),
    schemaIssues,
    'loyalty_coupons'
  )
  if (!couponsRes.ok) {
    throw new Error(schemaIssues.map(i => i.message).join(', ') || 'Failed to load coupons')
  }
  return couponsRes.data || []
}

export async function loadLoyaltyWorkspace(workspace = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)
  const customerSnapshot = await loadCustomerSnapshots()
  const schemaIssues = []
  const includeCoupons = workspace.includeCoupons === true

  const [programRes, tierRes, campaignRes, couponSeriesRes, referralProgramsRes] = await Promise.all([
    runScopeAwareSchemaSafeQuery(() => applyScopeFilter(
      db.from('loyalty_programs')
        .select('id,name,description,program_type,program_family,earn_model,redemption_model,redemption_rate,card_mode,frequency_goal,frequency_reset_period,frequency_reward_json,starts_at,ends_at,active,chain_wide_active,notify_balance_change,notification_channel,webhook_enabled,webhook_template')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1),
      scopeInfo,
    ), () => db.from('loyalty_programs')
      .select('id,name,description,program_type,program_family,earn_model,redemption_model,redemption_rate,card_mode,frequency_goal,frequency_reset_period,frequency_reward_json,starts_at,ends_at,active,chain_wide_active,notify_balance_change,notification_channel,webhook_enabled,webhook_template')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1), schemaIssues, 'loyalty_programs'),
    runScopeAwareSchemaSafeQuery(() => applyScopeFilter(
      db.from('loyalty_tiers')
        .select('id,code,name,min_spend_total,min_order_count,points_multiplier,birthday_bonus_points,benefits_summary,color,active,sort_order')
        .is('deleted_at', null)
        .order('sort_order'),
      scopeInfo,
    ), () => db.from('loyalty_tiers')
      .select('id,code,name,min_spend_total,min_order_count,points_multiplier,birthday_bonus_points,benefits_summary,color,active,sort_order')
      .is('deleted_at', null)
      .order('sort_order'), schemaIssues, 'loyalty_tiers'),
    runScopeAwareSchemaSafeQuery(() => applyScopeFilter(
      db.from('loyalty_campaigns')
        .select('id,program_id,name,code,description,campaign_type,trigger_type,reward_value,audience_json,channel_targets,starts_at,ends_at,priority,stackable,active,metadata')
        .is('deleted_at', null)
        .order('priority'),
      scopeInfo,
    ), () => db.from('loyalty_campaigns')
      .select('id,program_id,name,code,description,campaign_type,trigger_type,reward_value,audience_json,channel_targets,starts_at,ends_at,priority,stackable,active,metadata')
      .is('deleted_at', null)
      .order('priority'), schemaIssues, 'loyalty_campaigns'),
    runScopeAwareSchemaSafeQuery(() => applyScopeFilter(
      db.from('loyalty_coupon_series')
        .select('id,name,prefix,single_coupon,coupon_count,random_length,charset,use_after_checkout,active,metadata')
        .is('deleted_at', null)
        .order('created_at'),
      scopeInfo,
    ), () => db.from('loyalty_coupon_series')
      .select('id,name,prefix,single_coupon,coupon_count,random_length,charset,use_after_checkout,active,metadata')
      .is('deleted_at', null)
      .order('created_at'), schemaIssues, 'loyalty_coupon_series'),
    runScopeAwareSchemaSafeQuery(() => applyReferralProgramsScopeFilter(
      db.from('loyalty_referral_programs')
        .select('id,name,mode,config_json,allowed_referrer_categories,success_criteria,success_purchase_count,active')
        .is('deleted_at', null)
        .order('created_at'),
      scopeInfo,
    ), null, schemaIssues, 'loyalty_referral_programs'),
  ])

  const campaignIds = campaignRes.data.map(item => item.id)
  const seriesIds = couponSeriesRes.data.map(item => item.id)

  const [rulesRes, couponsRes] = await Promise.all([
    campaignIds.length > 0
      ? runSchemaSafeQuery(() => db.from('loyalty_campaign_rules')
        .select('id,campaign_id,rule_scope,condition_key,operator,threshold_value,period_window,action_type,action_summary,condition_json,action_json,active,stop_processing,sort_order')
        .in('campaign_id', campaignIds)
        .is('deleted_at', null)
        .order('sort_order'), schemaIssues, 'loyalty_campaign_rules')
      : Promise.resolve({ data: [], ok: true }),
    (seriesIds.length > 0 && includeCoupons)
      ? runSchemaSafeQuery(() => db.from('loyalty_coupons')
        .select('id,series_id,customer_id,code,is_used,used_at,source_ref_id,use_after_checkout,active,metadata,created_at')
        .in('series_id', seriesIds)
        .is('deleted_at', null), schemaIssues, 'loyalty_coupons')
      : Promise.resolve({ data: [], ok: true }),
  ])

  const couponMap = new Map()
  couponsRes.data.forEach(coupon => {
    const current = couponMap.get(coupon.series_id) || []
    current.push(coupon)
    couponMap.set(coupon.series_id, current)
  })

  const coreReadAvailable = programRes.ok && tierRes.ok && campaignRes.ok && couponSeriesRes.ok && rulesRes.ok && couponsRes.ok && referralProgramsRes.ok
  const campaignReadBroken = !campaignRes.ok
  const couponSeriesReadBroken = !couponSeriesRes.ok
  const tierReadBroken = !tierRes.ok
  const baseCampaigns = campaignRes.data.map(fromCampaignRow)
  const campaigns = campaignReadBroken ? [] : attachRulesToCampaigns(baseCampaigns, rulesRes.data)

  return {
    scopeInfo,
    schemaReady: coreReadAvailable,
    usingLegacyBootstrap: false,
    databaseUnavailable: !coreReadAvailable,
    dataSource: 'table',
    fallbackMode: 'none',
    prodSafe: coreReadAvailable,
    schemaIssues,
    program: programRes.data[0] ? fromProgramRow(programRes.data[0]) : null,
    tiers: tierReadBroken
      ? []
      : tierRes.data.map(fromTierRow),
    campaigns: campaignReadBroken ? [] : campaigns,
    couponSeries: couponSeriesReadBroken
      ? []
      : couponSeriesRes.data.map(series => {
          const coupons = couponMap.get(series.id) || []
          const item = fromCouponSeriesRow(series, coupons)
          if (!includeCoupons) {
            item._couponsNotLoaded = true
          }
          return item
        }),
    referralPrograms: referralProgramsRes.ok ? referralProgramsRes.data.map(fromReferralProgramRow) : [],
    customerInsights: buildCustomerInsights(customerSnapshot.baseCustomers, customerSnapshot.profileCustomers),
    customerSchemaReady: customerSnapshot.customerSchemaReady,
  }
}

export async function loadLoyaltyCustomerCategories(workspace = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)

  try {
    const { data, error } = await applyScopeFilter(
      db.from('loyalty_customer_categories')
        .select('id,name,code,description,color,active,sort_order')
        .is('deleted_at', null)
        .order('sort_order'),
      scopeInfo,
    )

    if (error) throw error

    return {
      scopeInfo,
      schemaReady: true,
      databaseUnavailable: false,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: true,
      categories: (data || []).map(fromCustomerCategoryRow),
    }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error
    return {
      scopeInfo,
      schemaReady: false,
      databaseUnavailable: true,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: false,
      categories: [],
    }
  }
}

export async function loadLoyaltyCampaignConflictGroups(workspace = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)

  try {
    const { data, error } = await applyScopeFilter(
      db.from('loyalty_campaign_conflict_groups')
        .select('id,name,code,description,active,sort_order,metadata')
        .is('deleted_at', null)
        .order('sort_order')
        .order('name'),
      scopeInfo,
    )

    if (error) throw error

    return {
      scopeInfo,
      schemaReady: true,
      databaseUnavailable: false,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: true,
      groups: (data || []).map(fromCampaignConflictGroupRow),
    }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error
    return {
      scopeInfo,
      schemaReady: false,
      databaseUnavailable: true,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: false,
      groups: [],
      schemaIssues: [{
        code: 'loyalty_campaign_conflict_groups',
        message: String(error?.message || error?.details || error?.hint || 'Conflict groups table missing'),
      }],
    }
  }
}

export async function createLoyaltyCampaignConflictGroup(workspace = {}, group = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)
  const row = toCampaignConflictGroupRow(group, scopeInfo)

  const { data, error } = await db
    .from('loyalty_campaign_conflict_groups')
    .upsert(row, { onConflict: 'id' })
    .select('id,name,code,description,active,sort_order,metadata')
    .single()

  if (error) throw error

  return {
    scopeInfo,
    group: fromCampaignConflictGroupRow(data || row),
  }
}

export async function saveLoyaltyWorkspace(workspace = {}, payload = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)
  const program = normalizeProgram(payload.program || DEFAULT_LOYALTY_PROGRAM)
  const tiers = (payload.tiers || []).map(normalizeTier)
  const campaigns = (payload.campaigns || []).map(campaign => normalizeCampaign({ ...campaign, programId: program.id }))
  const couponSeries = (payload.couponSeries || []).map(series => syncCouponSeriesCodes(series))
  const referralPrograms = (payload.referralPrograms || []).map(normalizeReferralProgram)
  const rules = campaigns.flatMap(campaign => [...campaign.applicableRules, ...campaign.periodicRules].map(rule => toRuleRow(rule, campaign.id)))
  const tierIds = tiers.map(tier => tier.id)
  const campaignIds = campaigns.map(campaign => campaign.id)
  const ruleIds = rules.map(rule => rule.id)
  const seriesIds = couponSeries.map(series => series.id)
  const referralProgramIds = referralPrograms.map(p => p.id)

  try {
    await upsertScopeAwareRows('loyalty_programs', [toProgramRow(program, scopeInfo)], 'id')

    await softDeleteMissingScopedRows('loyalty_tiers', scopeInfo, tierIds)
    if (tiers.length > 0) {
      await upsertScopeAwareRows('loyalty_tiers', tiers.map(tier => toTierRow(tier, scopeInfo)), 'id')
    }

    await softDeleteMissingScopedRows('loyalty_campaigns', scopeInfo, campaignIds)
    if (campaigns.length > 0) {
      await upsertScopeAwareRows('loyalty_campaigns', campaigns.map(campaign => toCampaignRow(campaign, scopeInfo, program.id)), 'id')
    }

    await softDeleteMissingChildRows('loyalty_campaign_rules', 'campaign_id', campaignIds, ruleIds)
    if (rules.length > 0) {
      const { error: rulesError } = await db.from('loyalty_campaign_rules').upsert(rules, { onConflict: 'id' })
      if (rulesError) throw rulesError
    }

    await softDeleteMissingReferralPrograms(scopeInfo, referralProgramIds)
    if (referralPrograms.length > 0) {
      const rows = referralPrograms.map(p => toReferralProgramRow(p, scopeInfo))
      const { error: refProgError } = await db.from('loyalty_referral_programs').upsert(rows, { onConflict: 'id' })
      if (refProgError) throw refProgError
    }

    await softDeleteMissingScopedRows('loyalty_coupon_series', scopeInfo, seriesIds)
    if (couponSeries.length > 0) {
      await upsertScopeAwareRows('loyalty_coupon_series', couponSeries.map(series => toCouponSeriesRow(series, scopeInfo)), 'id')

      const { data: existingCouponRows, error: existingCouponsError } = await db
        .from('loyalty_coupons')
        .select('id,series_id,customer_id,code,is_used,used_at,source_ref_id,use_after_checkout,active,metadata,created_at')
        .in('series_id', seriesIds)
        .is('deleted_at', null)
      if (existingCouponsError) throw existingCouponsError

      const couponPersistencePlan = buildCouponPersistencePlan(couponSeries, existingCouponRows || [])

      if (couponPersistencePlan.softDeleteIds.length > 0) {
        const { error: couponSoftDeleteError } = await db
          .from('loyalty_coupons')
          .update({
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            active: false,
          })
          .in('id', couponPersistencePlan.softDeleteIds)
        if (couponSoftDeleteError) throw couponSoftDeleteError
      }

      if (couponPersistencePlan.upsertRows.length > 0) {
        const { error: couponError } = await db
          .from('loyalty_coupons')
          .upsert(couponPersistencePlan.upsertRows, { onConflict: 'id' })
        if (couponError) throw couponError

        return {
          schemaReady: true,
          usedLegacyFallback: false,
          couponSeries: couponPersistencePlan.couponSeries,
          referralPrograms,
        }
      }
    }

    return {
      schemaReady: true,
      usedLegacyFallback: false,
      couponSeries,
      referralPrograms,
    }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error
    throw new Error('DATABASE UNAVAILABLE: Sadakat kayitlari sadece production tablolara yazilir. `settings` fallback kapatildi.')
  }
}

export async function saveLoyaltyCustomerCategories(workspace = {}, categories = []) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)
  const normalizedCategories = categories.map(normalizeCustomerCategory)
  const categoryIds = normalizedCategories.map(category => category.id)

  try {
    await softDeleteMissingScopedRows('loyalty_customer_categories', scopeInfo, categoryIds)

    if (normalizedCategories.length > 0) {
      const { error } = await db
        .from('loyalty_customer_categories')
        .upsert(normalizedCategories.map(category => toCustomerCategoryRow(category, scopeInfo)), { onConflict: 'id' })

      if (error) throw error
    }

    return { schemaReady: true, usedLegacyFallback: false }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error
    throw new Error('DATABASE UNAVAILABLE: Musteri kategorileri sadece production tablolara yazilir. `settings` fallback kapatildi.')
  }
}

export async function loadLoyaltyCustomerCategoryAssignments(workspace = {}, customerId) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)

  try {
    const categories = await loadScopedCustomerCategoryRows(scopeInfo, { activeOnly: true })
    const assignmentsResult = await applyScopeFilter(
      db.from('loyalty_customer_category_members')
        .select('id,customer_id,category_id,active,metadata')
        .eq('customer_id', customerId)
        .is('deleted_at', null),
      scopeInfo,
    )
    if (assignmentsResult.error) throw assignmentsResult.error

    const assignments = (assignmentsResult.data || []).map(fromCustomerCategoryAssignmentRow)
    return {
      scopeInfo,
      schemaReady: true,
      databaseUnavailable: false,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: true,
      categories,
      selectedCategoryIds: assignments.filter(item => item.active !== false).map(item => item.categoryId),
    }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error

    const categories = await loadScopedCustomerCategoryRows(scopeInfo, { activeOnly: true })
    const scopeCategoryIds = new Set(categories.map(category => String(category.id || '')))
    const selectedCategoryIds = (await readCustomerTagCategoryIds(customerId))
      .filter(categoryId => scopeCategoryIds.has(categoryId))

    return {
      ...buildCustomerCategoryFallbackMeta(scopeInfo),
      categories,
      selectedCategoryIds,
    }
  }
}

export async function loadLoyaltyCustomerCategoryAudience(workspace = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)

  try {
    const { data, error } = await applyScopeFilter(
      db.from('loyalty_customer_category_members')
        .select('customer_id,category_id')
        .eq('active', true)
        .is('deleted_at', null),
      scopeInfo,
    )

    if (error) throw error

    const assignments = (data || []).map(row => ({
      customerId: row.customer_id || '',
      categoryId: row.category_id || '',
    }))

    const countsByCategoryId = assignments.reduce((accumulator, assignment) => {
      if (!assignment.categoryId) return accumulator
      accumulator[assignment.categoryId] = (accumulator[assignment.categoryId] || 0) + 1
      return accumulator
    }, {})

    return {
      scopeInfo,
      schemaReady: true,
      databaseUnavailable: false,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: true,
      assignments,
      countsByCategoryId,
    }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error

    try {
      const categories = await loadScopedCustomerCategoryRows(scopeInfo, { activeOnly: true })
      const scopeCategoryIds = new Set(categories.map(category => String(category.id || '')))
      const { data: customers, error: customerError } = await db
        .from('musteriler')
        .select('id,tags')
        .is('deleted_at', null)

      if (customerError) throw customerError

      const assignments = (customers || []).flatMap(customer => (
        normalizeStringList(customer?.tags)
          .filter(categoryId => scopeCategoryIds.has(categoryId))
          .map(categoryId => ({
            customerId: String(customer?.id || ''),
            categoryId,
          }))
      ))

      const countsByCategoryId = assignments.reduce((accumulator, assignment) => {
        if (!assignment.categoryId) return accumulator
        accumulator[assignment.categoryId] = (accumulator[assignment.categoryId] || 0) + 1
        return accumulator
      }, {})

      return {
        ...buildCustomerCategoryFallbackMeta(scopeInfo),
        assignments,
        countsByCategoryId,
      }
    } catch {
      return {
        ...buildCustomerCategoryFallbackMeta(scopeInfo),
        assignments: [],
        countsByCategoryId: {},
      }
    }
  }
}

export async function saveLoyaltyCustomerCategoryAssignments(workspace = {}, customerId, categoryIds = []) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)
  const normalizedCategoryIds = normalizeStringList(categoryIds)

  try {
    const { data: existingAssignments, error: existingAssignmentsError } = await applyScopeFilter(
      db.from('loyalty_customer_category_members')
        .select('id,customer_id,category_id,metadata')
        .eq('customer_id', customerId)
        .is('deleted_at', null),
      scopeInfo,
    )
    if (existingAssignmentsError) throw existingAssignmentsError

    const existingAssignmentsByCategory = new Map(
      (existingAssignments || []).map(row => [String(row.category_id || ''), row]),
    )
    const staleIds = (existingAssignments || [])
      .filter(row => !normalizedCategoryIds.includes(String(row.category_id || '')))
      .map(row => row.id)

    if (staleIds.length > 0) {
      const { error: staleUpdateError } = await db
        .from('loyalty_customer_category_members')
        .update({
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          active: false,
        })
        .in('id', staleIds)
      if (staleUpdateError) throw staleUpdateError
    }

    if (normalizedCategoryIds.length > 0) {
      const nextRows = normalizedCategoryIds.map(categoryId => (
        toCustomerCategoryAssignmentRow(
          customerId,
          categoryId,
          scopeInfo,
          existingAssignmentsByCategory.get(categoryId) || null,
        )
      ))

      const { error: upsertError } = await db
        .from('loyalty_customer_category_members')
        .upsert(nextRows, { onConflict: 'id' })
      if (upsertError) throw upsertError
    }

    return {
      schemaReady: true,
      usedLegacyFallback: false,
      dataSource: 'table',
      fallbackMode: 'none',
      prodSafe: true,
      categoryIds: normalizedCategoryIds,
    }
  } catch (error) {
    if (!isSchemaMissingError(error)) throw error

    const categories = await loadScopedCustomerCategoryRows(scopeInfo, { activeOnly: false })
    const scopeCategoryIds = categories.map(category => String(category.id || ''))
    const filteredCategoryIds = normalizedCategoryIds.filter(categoryId => scopeCategoryIds.includes(categoryId))

    await writeCustomerTagCategoryIds(customerId, filteredCategoryIds, scopeCategoryIds)

    return {
      schemaReady: true,
      usedLegacyFallback: false,
      dataSource: 'musteriler',
      fallbackMode: 'musteriler.tags',
      prodSafe: true,
      categoryIds: filteredCategoryIds,
    }
  }
}
