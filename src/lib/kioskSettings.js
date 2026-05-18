import { db } from '@/lib/db'
import { compareSaleCategoryPriority } from '@/lib/comboMenuCategory'
import { repairTurkishText } from '@/lib/turkishText'

const SETTINGS_KEY = 'kiosk_settings_v2'
const LEGACY_SETTINGS_KEY = 'kiosk_settings_v1'
const LOYALTY_LINKS_KEY = 'kiosk_loyalty_links_v1'
const LOCAL_SETTINGS_CACHE_KEY = 'kiosk_settings_local_cache_v1'
const LOCAL_DEVICE_STATION_CODE_KEY = 'kiosk_device_station_code_v1'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function uid(prefix = 'kiosk') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? repairTurkishText(value) : repairTurkishText(fallback)
}

function isTruthyFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function isFalseFlag(value) {
  return value === false || value === 'false' || value === 0 || value === '0'
}

export function normalizeKioskStationCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeId(value) {
  const text = String(value ?? '').trim()
  return text
}

function idsEqual(left, right) {
  const normalizedLeft = normalizeId(left)
  const normalizedRight = normalizeId(right)
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight
}

export function asUuidOrNull(value) {
  const text = String(value || '').trim()
  return text && UUID_RE.test(text) ? text : null
}

function normalizeStringList(values) {
  return Array.isArray(values)
    ? values.map(value => String(value || '').trim()).filter(Boolean)
    : []
}

function normalizeImageUrl(value) {
  const text = normalizeText(value, '').trim()
  if (!text) return ''
  if (text.startsWith('data:image/')) return text
  return text
}

function parseTimeMinutes(value) {
  const text = normalizeText(value, '')
  const match = text.match(/^(\d{2}):(\d{2})$/)
  if (!match) return -1
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return -1
  return hours * 60 + minutes
}

function nowDayCode(date = new Date()) {
  return DAY_CODES[(date.getDay() + 6) % 7] || 'mon'
}

function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes()
}

function normalizeCategorySchedule(rule = {}) {
  return {
    id: String(rule.id || uid('cat_rule')),
    days: normalizeStringList(rule.days).filter(value => DAY_CODES.includes(value)),
    start: normalizeText(rule.start, '00:00'),
    end: normalizeText(rule.end, '23:59'),
    visible: rule.visible !== false,
    order: clampNumber(rule.order, 100, 0, 9999),
    note: normalizeText(rule.note, ''),
  }
}

function normalizeOperatingHoursRule(rule = {}) {
  return {
    id: String(rule.id || uid('open_rule')),
    days: normalizeStringList(rule.days).filter(value => DAY_CODES.includes(value)),
    start: normalizeText(rule.start, '09:00'),
    end: normalizeText(rule.end, '22:00'),
    note: normalizeText(rule.note, ''),
  }
}

function normalizeCategoryConfig(config = {}, index = 0) {
  return {
    categoryId: String(config.categoryId || ''),
    imageUrl: normalizeImageUrl(config.imageUrl),
    buttonLabel: normalizeText(config.buttonLabel, ''),
    defaultVisible: config.defaultVisible !== false,
    defaultOrder: clampNumber(config.defaultOrder, index + 1, 0, 9999),
    schedules: Array.isArray(config.schedules) ? config.schedules.map(normalizeCategorySchedule) : [],
  }
}

function normalizeCoupon(coupon = {}) {
  return {
    id: String(coupon.id || uid('coupon')),
    code: normalizeText(coupon.code, '').trim().toUpperCase(),
    label: normalizeText(coupon.label, ''),
    description: normalizeText(coupon.description, ''),
    type: coupon.type === 'amount' ? 'amount' : 'percent',
    value: clampNumber(coupon.value, 0, 0, 1000000),
    minTotal: clampNumber(coupon.minTotal, 0, 0, 1000000),
    active: coupon.active !== false,
  }
}

function normalizeSuggestion(rule = {}) {
  const triggerIds = Array.isArray(rule.triggerIds) && rule.triggerIds.length
    ? rule.triggerIds
    : rule.triggerId
      ? [rule.triggerId]
      : []
  return {
    id: String(rule.id || uid('suggest')),
    active: rule.active !== false,
    title: normalizeText(rule.title, ''),
    message: normalizeText(rule.message, ''),
    triggerType: rule.triggerType === 'category' ? 'category' : 'product',
    triggerIds: normalizeStringList(triggerIds),
    suggestionType: rule.suggestionType === 'category'
      ? 'category'
      : rule.suggestionType === 'message'
        ? 'message'
        : 'product',
    suggestionProductId: normalizeText(rule.suggestionProductId, ''),
    suggestionCategoryId: normalizeText(rule.suggestionCategoryId, ''),
  }
}

function normalizeCheckoutCondition(condition = {}) {
  return {
    id: String(condition.id || uid('condition')),
    field: normalizeText(condition.field, 'always'),
    value: normalizeText(condition.value, ''),
    value2: normalizeText(condition.value2, ''),
  }
}

function normalizeCheckoutSuggestion(rule = {}) {
  return {
    id: String(rule.id || uid('checkout')),
    active: rule.active !== false,
    title: normalizeText(rule.title, ''),
    message: normalizeText(rule.message, ''),
    logic: rule.logic === 'or' ? 'or' : 'and',
    conditions: Array.isArray(rule.conditions)
      ? rule.conditions.map(normalizeCheckoutCondition)
      : [normalizeCheckoutCondition({ field: 'always' })],
    suggestionType: rule.suggestionType === 'category'
      ? 'category'
      : rule.suggestionType === 'message'
        ? 'message'
        : 'product',
    suggestionProductId: normalizeText(rule.suggestionProductId, ''),
    suggestionCategoryId: normalizeText(rule.suggestionCategoryId, ''),
  }
}

function normalizeSuggestionLimits(limits = {}) {
  return {
    productFlow: clampNumber(limits.productFlow, 2, 0, 20),
    checkout: clampNumber(limits.checkout, 1, 0, 20),
  }
}

function normalizeKioskStation(station = {}, index = 0) {
  const kioskNumber = clampNumber(
    station.kiosk_number ?? station.kioskNumber ?? station.number,
    index + 1,
    1,
    999,
  )
  const code = normalizeKioskStationCode(
    station.code || station.external_id || station.externalId || `KIOSK-${String(kioskNumber).padStart(2, '0')}`,
  )
  const name = normalizeText(station.name, `Kiosk ${kioskNumber}`).trim() || `Kiosk ${kioskNumber}`
  return {
    id: String(station.id || uid('station')),
    code,
    name,
    kiosk_number: kioskNumber,
    active: station.active !== false,
    order: clampNumber(station.order, index + 1, 1, 9999),
  }
}

function sortKioskStations(stations = []) {
  return [...stations].sort((left, right) => (
    (left.order || 0) - (right.order || 0)
    || (left.kiosk_number || 0) - (right.kiosk_number || 0)
    || String(left.name || '').localeCompare(String(right.name || ''), 'tr')
  ))
}

export const KIOSK_DEFAULT_SETTINGS = {
  enabled: true,
  operating_hours_enabled: false,
  operating_hours: [],
  closed_title: 'Kiosk su anda kapali',
  closed_subtitle: 'Lutfen hizmet saatlerinde tekrar deneyin.',
  table_service_enabled: false,
  order_display_duration_sec: 30,
  kds_pickup_combined: false,
  idle_timeout_sec: 60,
  aspect_ratio: '9:16',
  loyalty_qr_enabled: false,
  loyalty_session_timeout_sec: 180,
  coupon_enabled: false,
  queue_sound_enabled: true,
  queue_bg_color: '#0f172a',
  queue_logo_url: '',
  queue_media_type: 'none',
  queue_media_url: '',
  queue_orientation: 'landscape',
  product_grid_cols: 4,
  category_button_height: 112,
  tablet_orientation: 'auto',
  tablet_product_grid_cols_portrait: 4,
  tablet_product_grid_cols_landscape: 5,
  tablet_category_button_height_portrait: 124,
  tablet_category_button_height_landscape: 104,
  accent_color: '#f59e0b',
  text_color: '#f8fafc',
  panel_color: '#0f172a',
  category_bg_color: '#0b1221',
  category_active_color: '#f59e0b',
  kiosk_bg_color: '#030712',
  kiosk_bg_image: '',
  kiosk_bg_overlay: 'rgba(3,7,18,.74)',
  kiosk_logo_url: '',
  idle_media_type: 'none',
  idle_media_url: '',
  idle_title: 'Hosgeldiniz!',
  idle_subtitle: 'Siparis vermek icin ekrana dokunun',
  idle_cta_label: 'BASLAT',
  idle_background_image: '',
  kiosk_show_banners: true,
  kiosk_show_quick_picks: true,
  tablet_show_banners: true,
  tablet_show_quick_picks: true,
  kiosk_show_category_labels: true,
  quick_pick_product_ids: [],
  tablet_quick_pick_product_ids: [],
  main_banner_title: '',
  main_banner_subtitle: '',
  main_banner_image: '',
  main_banner_action_type: 'none',
  main_banner_product_id: '',
  main_banner_category_id: '',
  main_banner_message_title: '',
  main_banner_message_body: '',
  tablet_main_banner_title: '',
  tablet_main_banner_subtitle: '',
  tablet_main_banner_image: '',
  tablet_main_banner_action_type: '',
  tablet_main_banner_product_id: '',
  tablet_main_banner_category_id: '',
  tablet_main_banner_message_title: '',
  tablet_main_banner_message_body: '',
  alt_kiosk_show_banners: true,
  alt_kiosk_show_quick_picks: true,
  success_message_takeaway: 'Siparisiniz mutfaga iletildi. Lutfen ekrani takip edin.',
  success_message_table: 'Masaniza servis yapilacaktir.',
  kiosk_stations: [],
  category_configs: [],
  coupons: [],
  suggestion_limits: {
    productFlow: 2,
    checkout: 1,
  },
  product_suggestions: [],
  checkout_suggestions: [],
  printer: {
    receipt_enabled: false,
    receipt_footer: 'Fis yazici baglandiginda bu siparis fis olarak basilabilir.',
  },
}

function normalizeSettings(input = {}) {
  const base = { ...KIOSK_DEFAULT_SETTINGS, ...(input || {}) }
  const kioskShowBanners = base.kiosk_show_banners ?? base.alt_kiosk_show_banners
  const kioskShowQuickPicks = base.kiosk_show_quick_picks ?? base.alt_kiosk_show_quick_picks
  const kioskShowCategoryLabels = base.kiosk_show_category_labels
  return {
    ...KIOSK_DEFAULT_SETTINGS,
    ...base,
    enabled: !isFalseFlag(base.enabled),
    operating_hours_enabled: isTruthyFlag(base.operating_hours_enabled),
    operating_hours: Array.isArray(base.operating_hours) ? base.operating_hours.map(normalizeOperatingHoursRule) : [],
    closed_title: normalizeText(base.closed_title, KIOSK_DEFAULT_SETTINGS.closed_title),
    closed_subtitle: normalizeText(base.closed_subtitle, KIOSK_DEFAULT_SETTINGS.closed_subtitle),
    table_service_enabled: isTruthyFlag(base.table_service_enabled),
    order_display_duration_sec: clampNumber(base.order_display_duration_sec, 30, 5, 180),
    kds_pickup_combined: isTruthyFlag(base.kds_pickup_combined),
    idle_timeout_sec: clampNumber(base.idle_timeout_sec, 60, 10, 900),
    aspect_ratio: normalizeText(base.aspect_ratio, '9:16'),
    loyalty_qr_enabled: isTruthyFlag(base.loyalty_qr_enabled),
    loyalty_session_timeout_sec: clampNumber(base.loyalty_session_timeout_sec, 180, 30, 1800),
    coupon_enabled: isTruthyFlag(base.coupon_enabled),
    queue_sound_enabled: !isFalseFlag(base.queue_sound_enabled),
    queue_bg_color: normalizeText(base.queue_bg_color, '#0f172a'),
    queue_logo_url: normalizeImageUrl(base.queue_logo_url),
    queue_media_type: ['none', 'image', 'video'].includes(base.queue_media_type) ? base.queue_media_type : 'none',
    queue_media_url: normalizeImageUrl(base.queue_media_url),
    queue_orientation: ['landscape', 'portrait'].includes(base.queue_orientation) ? base.queue_orientation : 'landscape',
    product_grid_cols: clampNumber(base.product_grid_cols, 4, 2, 6),
    category_button_height: clampNumber(base.category_button_height, 112, 88, 180),
    tablet_orientation: ['auto', 'portrait', 'landscape'].includes(base.tablet_orientation) ? base.tablet_orientation : 'auto',
    tablet_product_grid_cols_portrait: clampNumber(base.tablet_product_grid_cols_portrait, 4, 2, 6),
    tablet_product_grid_cols_landscape: clampNumber(base.tablet_product_grid_cols_landscape, 5, 2, 7),
    tablet_category_button_height_portrait: clampNumber(base.tablet_category_button_height_portrait, 124, 96, 180),
    tablet_category_button_height_landscape: clampNumber(base.tablet_category_button_height_landscape, 104, 88, 180),
    accent_color: normalizeText(base.accent_color, '#f59e0b'),
    text_color: normalizeText(base.text_color, '#f8fafc'),
    panel_color: normalizeText(base.panel_color, '#0f172a'),
    category_bg_color: normalizeText(base.category_bg_color, '#0b1221'),
    category_active_color: normalizeText(base.category_active_color, '#f59e0b'),
    kiosk_bg_color: normalizeText(base.kiosk_bg_color, '#030712'),
    kiosk_bg_image: normalizeImageUrl(base.kiosk_bg_image),
    kiosk_bg_overlay: normalizeText(base.kiosk_bg_overlay, 'rgba(3,7,18,.74)'),
    kiosk_logo_url: normalizeImageUrl(base.kiosk_logo_url),
    idle_media_type: ['none', 'image', 'video'].includes(base.idle_media_type) ? base.idle_media_type : 'none',
    idle_media_url: normalizeImageUrl(base.idle_media_url),
    idle_title: normalizeText(base.idle_title, 'Hosgeldiniz!'),
    idle_subtitle: normalizeText(base.idle_subtitle, 'Siparis vermek icin ekrana dokunun'),
    idle_cta_label: normalizeText(base.idle_cta_label, 'BASLAT'),
    idle_background_image: normalizeImageUrl(base.idle_background_image),
    kiosk_show_banners: kioskShowBanners !== false,
    kiosk_show_quick_picks: kioskShowQuickPicks !== false,
    tablet_show_banners: base.tablet_show_banners !== false,
    tablet_show_quick_picks: base.tablet_show_quick_picks !== false,
    kiosk_show_category_labels: kioskShowCategoryLabels !== false,
    quick_pick_product_ids: Array.isArray(base.quick_pick_product_ids)
      ? base.quick_pick_product_ids.map(item => normalizeText(item, '')).slice(0, 2)
      : [],
    tablet_quick_pick_product_ids: Array.isArray(base.tablet_quick_pick_product_ids)
      ? base.tablet_quick_pick_product_ids.map(item => normalizeText(item, '')).slice(0, 3)
      : [],
    main_banner_title: normalizeText(base.main_banner_title, ''),
    main_banner_subtitle: normalizeText(base.main_banner_subtitle, ''),
    main_banner_image: normalizeImageUrl(base.main_banner_image),
    main_banner_action_type: ['none', 'product', 'category', 'message'].includes(base.main_banner_action_type) ? base.main_banner_action_type : 'none',
    main_banner_product_id: normalizeText(base.main_banner_product_id, ''),
    main_banner_category_id: normalizeText(base.main_banner_category_id, ''),
    main_banner_message_title: normalizeText(base.main_banner_message_title, ''),
    main_banner_message_body: normalizeText(base.main_banner_message_body, ''),
    tablet_main_banner_title: normalizeText(base.tablet_main_banner_title, ''),
    tablet_main_banner_subtitle: normalizeText(base.tablet_main_banner_subtitle, ''),
    tablet_main_banner_image: normalizeImageUrl(base.tablet_main_banner_image),
    tablet_main_banner_action_type: ['', 'none', 'product', 'category', 'message'].includes(base.tablet_main_banner_action_type) ? base.tablet_main_banner_action_type : '',
    tablet_main_banner_product_id: normalizeText(base.tablet_main_banner_product_id, ''),
    tablet_main_banner_category_id: normalizeText(base.tablet_main_banner_category_id, ''),
    tablet_main_banner_message_title: normalizeText(base.tablet_main_banner_message_title, ''),
    tablet_main_banner_message_body: normalizeText(base.tablet_main_banner_message_body, ''),
    alt_kiosk_show_banners: kioskShowBanners !== false,
    alt_kiosk_show_quick_picks: kioskShowQuickPicks !== false,
    success_message_takeaway: normalizeText(base.success_message_takeaway, KIOSK_DEFAULT_SETTINGS.success_message_takeaway),
    success_message_table: normalizeText(base.success_message_table, KIOSK_DEFAULT_SETTINGS.success_message_table),
    kiosk_stations: sortKioskStations(
      Array.isArray(base.kiosk_stations)
        ? base.kiosk_stations.map(normalizeKioskStation)
        : [],
    ),
    category_configs: Array.isArray(base.category_configs) ? base.category_configs.map(normalizeCategoryConfig) : [],
    coupons: Array.isArray(base.coupons) ? base.coupons.map(normalizeCoupon).filter(item => item.code) : [],
    suggestion_limits: normalizeSuggestionLimits(base.suggestion_limits),
    product_suggestions: Array.isArray(base.product_suggestions) ? base.product_suggestions.map(normalizeSuggestion) : [],
    checkout_suggestions: Array.isArray(base.checkout_suggestions) ? base.checkout_suggestions.map(normalizeCheckoutSuggestion) : [],
    printer: {
      receipt_enabled: isTruthyFlag(base.printer?.receipt_enabled),
      receipt_footer: normalizeText(base.printer?.receipt_footer, KIOSK_DEFAULT_SETTINGS.printer.receipt_footer),
    },
  }
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

function readLocalSettingsCache() {
  try {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(LOCAL_SETTINGS_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeLocalSettingsCache(value) {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(LOCAL_SETTINGS_CACHE_KEY, JSON.stringify(value))
    window.dispatchEvent(new CustomEvent('kiosk-settings-change', {
      detail: { settings: value || null },
    }))
  } catch {}
}

function readLocalDeviceStationCode() {
  try {
    if (typeof window === 'undefined') return ''
    return normalizeKioskStationCode(window.localStorage.getItem(LOCAL_DEVICE_STATION_CODE_KEY) || '')
  } catch {
    return ''
  }
}

function writeLocalDeviceStationCode(value) {
  try {
    if (typeof window === 'undefined') return
    if (value) window.localStorage.setItem(LOCAL_DEVICE_STATION_CODE_KEY, value)
    else window.localStorage.removeItem(LOCAL_DEVICE_STATION_CODE_KEY)
    window.dispatchEvent(new CustomEvent('kiosk-device-station-change', {
      detail: { code: value || '' },
    }))
  } catch {}
}

export async function loadKioskSettings() {
  const localCache = readLocalSettingsCache()
  const currentValue = await readJsonSetting(SETTINGS_KEY, null)
  if (currentValue) {
    const normalized = normalizeSettings({ ...(localCache || {}), ...currentValue })
    writeLocalSettingsCache(normalized)
    return normalized
  }
  const legacyValue = await readJsonSetting(LEGACY_SETTINGS_KEY, null)
  if (legacyValue) {
    const normalized = normalizeSettings({ ...(localCache || {}), ...legacyValue })
    writeLocalSettingsCache(normalized)
    return normalized
  }
  return normalizeSettings(localCache || {})
}

export async function saveKioskSettings(settings) {
  const normalized = normalizeSettings(settings)
  writeLocalSettingsCache(normalized)
  await writeJsonSetting(SETTINGS_KEY, normalized)
  return normalized
}

export function loadKioskDeviceStationCode() {
  return readLocalDeviceStationCode()
}

export function saveKioskDeviceStationCode(code) {
  const normalized = normalizeKioskStationCode(code)
  writeLocalDeviceStationCode(normalized)
  return normalized
}

export function resolveKioskDeviceStation(settings, deviceStationCode) {
  const normalizedSettings = normalizeSettings(settings)
  const stations = sortKioskStations(normalizedSettings.kiosk_stations || [])
  const stationCode = normalizeKioskStationCode(deviceStationCode)
  const station = stationCode
    ? stations.find(item => normalizeKioskStationCode(item.code) === stationCode) || null
    : null

  return {
    stationCode,
    station,
    stations,
    hasMatch: Boolean(station),
    isActive: station ? station.active !== false : false,
  }
}

export function getKioskUrl() {
  return `${window.location.origin}/kiosk`
}

export function getKioskTabletUrl() {
  return `${window.location.origin}/kiosk-tablet`
}

export function getKDSUrl() {
  return `${window.location.origin}/kds`
}

export function getPickupUrl() {
  return `${window.location.origin}/pickup`
}

export function getQueueUrl() {
  return `${window.location.origin}/queue`
}

export function buildSalesChannelVisibilityMap(channels = []) {
  return new Map((channels || []).map(channel => [channel.id, channel || {}]))
}

export function isOrderVisibleForScreen(order, visibilityMap, key) {
  const channelId = order?.sales_channel_id
  if (!channelId) return true
  const channel = visibilityMap?.get(channelId)
  if (!channel) return true
  return channel[key] !== false
}

export function getKioskLoyaltyUrl(token) {
  return `${window.location.origin}/musteri-app/kiosk/${token}`
}

export function applyKioskBranchFilter(query, branchId, branchName = '') {
  const branchUuid = asUuidOrNull(branchId)
  if (branchUuid) return query.eq('branch_id', branchUuid)
  if (branchName) return query.eq('branch_name', branchName)
  return query
}

export function getKioskChannelPriceEntry(item, kioskChannelId) {
  const prices = Array.isArray(item?.channel_prices) ? item.channel_prices : []
  if (kioskChannelId) {
    const cp = prices.find(p => p.channel_id === kioskChannelId && p.active !== false)
    if (cp?.price != null) return { price: parseFloat(cp.price), taxId: cp.tax_id || null }
  }
  const first = prices.find(p => p.active !== false)
  if (first?.price != null) return { price: parseFloat(first.price), taxId: first.tax_id || null }
  return { price: 0, taxId: null }
}

export function getKioskChannelPrice(item, kioskChannelId) {
  return getKioskChannelPriceEntry(item, kioskChannelId).price
}

export async function getNextKioskDisplayNo(branchId, branchName = '') {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  let query = db
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('source_channel_type', 'kiosk')
    .gte('sale_datetime', todayStart.toISOString())
    .is('deleted_at', null)

  query = applyKioskBranchFilter(query, branchId, branchName)
  const { count, error } = await query
  if (error) throw error
  return (count || 0) + 1
}

function findActiveSchedule(config, date = new Date()) {
  const dayCode = nowDayCode(date)
  const minute = nowMinutes(date)
  return (config.schedules || []).find(rule => {
    const days = normalizeStringList(rule.days)
    const start = parseTimeMinutes(rule.start)
    const end = parseTimeMinutes(rule.end)
    const matchesDay = days.length === 0 || days.includes(dayCode)
    const matchesTime = start >= 0 && end >= 0
      ? (minute >= start && minute <= end)
      : true
    return matchesDay && matchesTime
  }) || null
}

function matchesTimeRule(rule, date = new Date()) {
  const dayCode = nowDayCode(date)
  const minute = nowMinutes(date)
  const days = normalizeStringList(rule.days)
  const start = parseTimeMinutes(rule.start)
  const end = parseTimeMinutes(rule.end)
  const matchesDay = days.length === 0 || days.includes(dayCode)
  const matchesTime = start >= 0 && end >= 0
    ? (minute >= start && minute <= end)
    : true
  return matchesDay && matchesTime
}

export function getKioskOperatingState(settings, date = new Date()) {
  const normalizedSettings = normalizeSettings(settings)
  if (!normalizedSettings.operating_hours_enabled) {
    return { isOpen: true, activeRule: null }
  }

  const rules = normalizedSettings.operating_hours || []
  if (!rules.length) {
    return { isOpen: true, activeRule: null }
  }

  const activeRule = rules.find(rule => matchesTimeRule(rule, date)) || null
  return {
    isOpen: Boolean(activeRule),
    activeRule,
  }
}

export function resolveKioskCategories(categories, settings, date = new Date()) {
  const normalizedSettings = normalizeSettings(settings)
  const configMap = new Map((normalizedSettings.category_configs || []).map(config => [normalizeId(config.categoryId), config]))

  return (categories || []).map((category, index) => {
    const config = configMap.get(normalizeId(category.id)) || normalizeCategoryConfig({ categoryId: category.id }, index)
    const activeSchedule = findActiveSchedule(config, date)
    const repairedCategoryName = repairTurkishText(category?.name || '')
    const repairedButtonLabel = repairTurkishText(config.buttonLabel || repairedCategoryName)
    return {
      ...category,
      name: repairedCategoryName,
      kioskImageUrl: config.imageUrl,
      kioskButtonLabel: repairedButtonLabel,
      kioskVisible: activeSchedule ? activeSchedule.visible : config.defaultVisible,
      kioskOrder: activeSchedule ? activeSchedule.order : config.defaultOrder,
      kioskScheduleNote: repairTurkishText(activeSchedule?.note || ''),
    }
  }).filter(category => category.kioskVisible !== false)
    .sort((left, right) => (
      left.kioskOrder - right.kioskOrder || compareSaleCategoryPriority(left, right)
    ))
}

export function evaluateCoupon(code, settings, subtotal) {
  const normalizedCode = String(code || '').trim().toUpperCase()
  if (!normalizedCode) return null
  const normalizedSettings = normalizeSettings(settings)
  const coupon = (normalizedSettings.coupons || []).find(item => item.active && item.code === normalizedCode)
  if (!coupon) return null
  const total = Number(subtotal || 0)
  if (total < coupon.minTotal) return { coupon, error: `Kupon icin minimum tutar ${coupon.minTotal} TL.` }

  const discountAmount = coupon.type === 'amount'
    ? Math.min(total, coupon.value)
    : Math.min(total, Math.round((total * coupon.value)) / 100)

  return {
    coupon,
    discountAmount,
    discountType: coupon.type,
    discountValue: coupon.value,
  }
}

function cartHasCategory(cartItems, categoryId, products = []) {
  const categorySet = new Set([normalizeId(categoryId)].filter(Boolean))
  const productMap = new Map((products || []).map(product => [normalizeId(product.id), product]))
  return (cartItems || []).some(item => {
    const product = productMap.get(normalizeId(item.prodId))
    if (!product) return false
    return [product.sale_cat_l1, product.sale_cat_l2, product.sale_cat_l3, product.sale_cat_l4, product.sale_cat_l5]
      .map(normalizeId)
      .some(value => categorySet.has(value))
  })
}

export function matchProductSuggestion(rule, product, products = []) {
  if (!rule?.active || !product) return false
  if (rule.triggerType === 'category') {
    return cartHasCategory([{ prodId: product.id }], rule.triggerIds?.[0], products)
      || [product.sale_cat_l1, product.sale_cat_l2, product.sale_cat_l3, product.sale_cat_l4, product.sale_cat_l5]
        .some(categoryId => (rule.triggerIds || []).some(triggerId => idsEqual(triggerId, categoryId)))
  }
  return (rule.triggerIds || []).some(triggerId => idsEqual(triggerId, product.id))
}

export function evaluateCheckoutSuggestion(rule, cartItems, products = [], totalAmount = 0) {
  if (!rule?.active) return false
  const checks = (rule.conditions || []).map(condition => {
    switch (condition.field) {
      case 'always':
        return true
      case 'has_product':
        return (cartItems || []).some(item => idsEqual(item.prodId, condition.value))
      case 'has_category':
        return cartHasCategory(cartItems, condition.value, products)
      case 'total_gt':
        return Number(totalAmount) > Number(condition.value || 0)
      case 'total_lt':
        return Number(totalAmount) < Number(condition.value || 0)
      case 'total_between':
        return Number(totalAmount) >= Number(condition.value || 0) && Number(totalAmount) <= Number(condition.value2 || 0)
      default:
        return false
    }
  })

  return rule.logic === 'or'
    ? checks.some(Boolean)
    : checks.every(Boolean)
}

function normalizeLinkSession(session = {}) {
  const kioskStationNumber = Number(session.kioskStationNumber)
  return {
    token: String(session.token || uid('loyalty')),
    branchId: String(session.branchId || ''),
    branchName: normalizeText(session.branchName, ''),
    kioskStationCode: normalizeKioskStationCode(session.kioskStationCode),
    kioskStationNumber: Number.isFinite(kioskStationNumber) && kioskStationNumber > 0 ? kioskStationNumber : null,
    kioskStationName: normalizeText(session.kioskStationName, ''),
    customerId: normalizeText(session.customerId, ''),
    customerName: normalizeText(session.customerName, ''),
    phone: normalizeText(session.phone, ''),
    selectedCampaignId: normalizeText(session.selectedCampaignId, ''),
    selectedCampaignName: normalizeText(session.selectedCampaignName, ''),
    selectedCouponCode: normalizeText(session.selectedCouponCode, '').toUpperCase(),
    selectedCouponLabel: normalizeText(session.selectedCouponLabel, ''),
    customerCategoryIds: Array.isArray(session.customerCategoryIds) ? session.customerCategoryIds.map(String) : [],
    status: ['pending', 'linked', 'consumed', 'expired'].includes(session.status) ? session.status : 'pending',
    createdAt: normalizeText(session.createdAt, new Date().toISOString()),
    expiresAt: normalizeText(session.expiresAt, new Date(Date.now() + 180000).toISOString()),
  }
}

function stripExpiredLinkSessions(items = []) {
  const now = Date.now()
  return (items || []).map(normalizeLinkSession).filter(session => {
    const expiresAt = new Date(session.expiresAt).getTime()
    return Number.isFinite(expiresAt) && expiresAt > now - 60000 && session.status !== 'expired'
  })
}

export async function createKioskLoyaltyLinkSession({
  branchId,
  branchName,
  timeoutSec = 180,
  kioskStationCode = '',
  kioskStationNumber = null,
  kioskStationName = '',
}) {
  const current = stripExpiredLinkSessions(await readJsonSetting(LOYALTY_LINKS_KEY, []))
  const nextSession = normalizeLinkSession({
    token: uid('loyalty'),
    branchId,
    branchName,
    kioskStationCode,
    kioskStationNumber,
    kioskStationName,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + timeoutSec * 1000).toISOString(),
  })
  await writeJsonSetting(LOYALTY_LINKS_KEY, [...current, nextSession])
  return nextSession
}

export async function readKioskLoyaltyLinkSession(token) {
  const current = stripExpiredLinkSessions(await readJsonSetting(LOYALTY_LINKS_KEY, []))
  return current.find(item => item.token === token) || null
}

export async function linkCustomerToKioskSession(token, customer, {
  customerCategoryIds = [],
  selectedCouponCode = '',
  selectedCouponLabel = '',
} = {}) {
  const current = stripExpiredLinkSessions(await readJsonSetting(LOYALTY_LINKS_KEY, []))
  const next = current.map(item => (
    item.token === token
      ? normalizeLinkSession({
          ...item,
          customerId: customer?.id || '',
          customerName: customer?.ad_soyad || customer?.name || '',
          phone: customer?.telefon || '',
          customerCategoryIds: Array.isArray(customerCategoryIds) ? customerCategoryIds.map(String) : [],
          selectedCouponCode: String(selectedCouponCode || item.selectedCouponCode || '').toUpperCase(),
          selectedCouponLabel: selectedCouponLabel || item.selectedCouponLabel || '',
          status: 'linked',
        })
      : item
  ))
  await writeJsonSetting(LOYALTY_LINKS_KEY, next)
}

export async function selectCampaignInKioskLoyaltySession(token, { campaignId = '', campaignName = '', couponCode = '', couponLabel = '' } = {}) {
  const current = stripExpiredLinkSessions(await readJsonSetting(LOYALTY_LINKS_KEY, []))
  const next = current.map(item => (
    item.token === token
      ? normalizeLinkSession({
          ...item,
          selectedCampaignId: String(campaignId || ''),
          selectedCampaignName: String(campaignName || ''),
          selectedCouponCode: String(couponCode || '').toUpperCase(),
          selectedCouponLabel: String(couponLabel || ''),
        })
      : item
  ))
  await writeJsonSetting(LOYALTY_LINKS_KEY, next)
}

export async function consumeKioskLoyaltyLinkSession(token) {
  const current = stripExpiredLinkSessions(await readJsonSetting(LOYALTY_LINKS_KEY, []))
  const next = current.map(item => (
    item.token === token
      ? normalizeLinkSession({ ...item, status: 'consumed' })
      : item
  ))
  await writeJsonSetting(LOYALTY_LINKS_KEY, next)
}
