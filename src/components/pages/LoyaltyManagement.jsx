import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import {
  ACTION_TYPE_OPTIONS,
  CAMPAIGN_AUDIENCE_OPTIONS,
  CAMPAIGN_APPLICATION_MODE_OPTIONS,
  CAMPAIGN_CHANNEL_OPTIONS,
  CAMPAIGN_TRIGGER_OPTIONS,
  CAMPAIGN_TYPE_OPTIONS,
  COMPARISON_OPTIONS,
  CONDITION_LIBRARY,
  COUPON_CHARSET_OPTIONS,
  DEFAULT_COUPON_SERIES,
  DEFAULT_LOYALTY_CAMPAIGNS,
  DEFAULT_LOYALTY_PROGRAM,
  DEFAULT_LOYALTY_TIERS,
  PERIOD_OPTIONS,
  PROGRAM_TYPE_OPTIONS,
  formatDateTimeInput,
  getDefaultActionConfig,
  getDefaultConditionConfig,
  getLoyaltyScopeInfo,
  getSalesChannelConditionValues,
  loadLoyaltyCustomerCategoryAudience,
  loadLoyaltyWorkspace,
  loadCouponsForSeries,
  loadLoyaltyCustomerCategories,
  normalizeCampaign,
  normalizeCampaignChannelTarget,
  normalizeCustomerCategory,
  normalizeCouponSeries,
  normalizeProgram,
  normalizeRule,
  normalizeTier,
  saveLoyaltyWorkspace,
} from '@/lib/loyalty'
import {
  getEditorRuleActions,
  getEditorRuleConditions,
  getStandaloneActionConfig,
  getStandaloneConditionConfig,
  hydrateCampaignForEditor,
  serializeCampaignForPersistence,
} from '@/lib/loyaltyCampaignEditorModel'
import {
  RUNTIME_STATUS_META,
  getConditionRuntimeStatus,
  getActionRuntimeStatus,
  LOCAL_READY_CONDITIONS,
  LOCAL_READY_ACTIONS,
  VALUE_LEDGER_ACTIONS,
  MODEL_ONLY_ACTIONS,
  PRESENTATION_ONLY_ACTIONS,
} from '@/lib/loyaltyRuntimeStatus'

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

const loyaltyWorkspaceSessionCache = new Map()
const loyaltyWorkspaceSessionStoragePrefix = 'rms.loyalty.workspaceSnapshot'

function buildLoyaltyWorkspaceCacheKey(workspace = {}) {
  const scopeInfo = getLoyaltyScopeInfo(workspace)
  return `${scopeInfo.scopeType}::${scopeInfo.branchId || 'global'}::${scopeInfo.branchName || ''}`
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readWorkspaceSessionSnapshot(cacheKey) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(`${loyaltyWorkspaceSessionStoragePrefix}:${cacheKey}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function writeWorkspaceSessionSnapshot(cacheKey, snapshot) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      `${loyaltyWorkspaceSessionStoragePrefix}:${cacheKey}`,
      JSON.stringify(snapshot),
    )
  } catch {
    // no-op: storage availability depends on runtime/browser settings
  }
}

async function loadLoyaltyWorkspaceWithRetry(workspacePayload, attempts = 3) {
  const scopeInfo = getLoyaltyScopeInfo(workspacePayload)
  let lastResult = null
  let lastError = null
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastResult = await loadLoyaltyWorkspace(workspacePayload)
    } catch (error) {
      lastError = error
      lastResult = null
    }
    if (lastResult?.schemaReady && !lastResult?.databaseUnavailable) return lastResult
    if (attempt < attempts - 1) {
      await wait(350 * (attempt + 1))
    }
  }
  if (!lastResult && lastError) {
    return {
      scopeInfo,
      schemaReady: false,
      customerSchemaReady: false,
      databaseUnavailable: true,
      program: DEFAULT_LOYALTY_PROGRAM,
      tiers: [],
      campaigns: [],
      couponSeries: [],
      customerInsights: {
        totalCustomers: 0,
        reachableCustomers: 0,
        loyaltyMembers: 0,
        birthdayKnown: 0,
        consentReady: 0,
        mobileLinked: 0,
      },
      schemaIssues: [
        {
          code: 'loyalty_workspace_exception',
          message: String(lastError?.message || lastError?.details || lastError?.hint || 'Workspace load failed'),
        },
      ],
    }
  }
  return lastResult
}

function StatsCard({ label, value, accent, hint }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: '1.7rem', fontWeight: 900, color: accent }}>{value}</div>
      {hint ? <div style={{ marginTop: 6, fontSize: '.76rem', color: '#94a3b8' }}>{hint}</div> : null}
    </div>
  )
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>{title}</div>
        <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>{subtitle}</div>
      </div>
      {action}
    </div>
  )
}

function FieldStack({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>{label}</div>
      {children}
      {hint ? <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  )
}

function HelperNote({ title, children, action = null, tone = 'info' }) {
  const palette = tone === 'warning'
    ? { border: '#fde68a', background: '#fffaf0', title: '#b45309', text: '#7c2d12' }
    : { border: '#bfdbfe', background: '#f8fbff', title: '#1d4ed8', text: '#334155' }

  return (
    <div style={{ border: `1px solid ${palette.border}`, background: palette.background, borderRadius: 12, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '.74rem', color: palette.title, fontWeight: 900, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
            {title}
          </div>
          <div style={{ fontSize: '.82rem', color: '#4b5563', lineHeight: 1.6, fontStyle: 'italic' }}>
            {children}
          </div>
        </div>
        {action}
      </div>
    </div>
  )
}

function MiniBadge({ active, trueLabel, falseLabel }) {
  return (
    <span style={{
      borderRadius: 999,
      padding: '4px 10px',
      fontSize: '.72rem',
      fontWeight: 800,
      background: active ? '#ecfdf5' : '#f8fafc',
      color: active ? '#166534' : '#64748b',
      border: `1px solid ${active ? '#bbf7d0' : '#e2e8f0'}`,
    }}>
      {active ? trueLabel : falseLabel}
    </span>
  )
}

const STACKING_RULE_OPTIONS = [
  { value: 'stackable', label: 'Birlesebilir', desc: 'Diger aktif kampanyalarla ayni anda uygulanabilir', color: '#22c55e' },
  { value: 'group', label: 'Gruba Ozel', desc: 'Ayni gruptaki kampanyalarla catisir; yuksek oncelikli olan kazanir', color: '#f59e0b' },
  { value: 'exclusive', label: 'Munhasir', desc: 'Herhangi baska bir munhasir kampanya varsa catisir; oncelik belirler', color: '#ef4444' },
]

const STACKING_RULE_DETAILS = {
  stackable: {
    title: 'Birlesebilir nasil calisir?',
    summary: 'Bu kampanya, sartlari saglayan diger kampanyalarla ayni sipariste birlikte uygulanabilir.',
    examples: [
      '`%10 kahve indirimi` ile `2x puan` ayni sipariste birlikte calisabilir.',
      '`Menu alana patates hediyesi` ile `sepette 50 TL indirim` ayni anda uygulanabilir.',
      '`Dogum gunu indirimi` ile `sadakat puani kazandir` kampanyasi beraber calisabilir.',
    ],
    usage: 'Bir sipariste birden fazla farkli fayda ayni anda verilsin istiyorsaniz bu secenek en dogru tercihtir.',
    priority: 'Oncelik genelde gerekli olmaz; bu mod catisma yaratmak yerine birlikte calismayi hedefler.',
  },
  group: {
    title: 'Gruba Ozel nasil calisir?',
    summary: 'Bu kampanya sadece ayni grup adina sahip kampanyalarla catisir; diger kampanyalarla birlikte calisabilir.',
    examples: [
      '`burger_indirimleri` grubunda `%20 burger indirimi` ile `2. burger %50` ayni anda calismaz; dusuk oncelik sayisi kazanir.',
      '`icecek_faydalari` grubunda `buyuk boy icecek bedava` ile `icecekte %30 indirim` birlikte uygulanmaz.',
      '`tatli_kampanyalari` grubunda iki farkli tatli indirimi varsa kasada sadece kazanan kampanya devreye girer.',
    ],
    usage: 'Ayni tur kampanyalardan sadece biri secilsin, ama diger kategorilerdeki kampanyalar beraber calissin istiyorsaniz bunu secin.',
    priority: 'Oncelik bu modda kritik olur; ornek `10`, `30`dan daha gucludur ve cakisinca kazanir.',
  },
  exclusive: {
    title: 'Munhasir nasil calisir?',
    summary: 'Bu kampanya tum munhasir kampanyalarla catisir; sipariste sadece tek bir munhasir kampanya kazanir.',
    examples: [
      '`Sepette %15 genel indirim` ile `500 TL ustu 100 TL indirim` ikisi de munhasir ise ayni sipariste sadece biri uygulanir.',
      '`Tum urunlerde %20 indirim` ile `hesaba sabit 75 TL indirim` beraber calismaz; daha yuksek oncelik kazanir.',
      '`Kasiyer onayli buyuk kampanya` ile `hafta sonu genel indirim` ikisi de munhasir ise tek kazanan secilir.',
    ],
    usage: 'Kampanya ne olursa olsun bu sipariste sadece tek bir buyuk indirim veya tek bir kazanan olsun istiyorsaniz bunu secin.',
    priority: 'Oncelik bu modda belirleyicidir; en dusuk sayi tek kazanan kampanyayi belirler.',
  },
}

function getCampaignMergeMode(campaign) {
  return campaign.stackable ? 'stackable' : (campaign.exclusionGroup ? 'group' : 'exclusive')
}

function ChannelMultiSelect({ options, selectedValues, onToggle, onRemove }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOptions = options.filter(option => selectedValues.includes(option.value))

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="f-input"
        onClick={() => setOpen(current => !current)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff' }}
      >
        <span style={{ color: selectedOptions.length ? '#0f172a' : '#94a3b8' }}>
          {selectedOptions.length ? `${selectedOptions.length} kanal secildi` : 'Satis kanali secin'}
        </span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#64748b' }} />
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 20, border: '1px solid #dbeafe', borderRadius: 14, background: '#fff', boxShadow: '0 18px 36px rgba(15, 23, 42, 0.14)', padding: 8, maxHeight: 240, overflowY: 'auto' }}>
          {options.map(option => {
            const checked = selectedValues.includes(option.value)
            return (
              <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: checked ? '#eff6ff' : 'transparent', color: checked ? '#1d4ed8' : '#334155', fontWeight: 700 }}>
                <input type="checkbox" checked={checked} onChange={() => onToggle(option.value)} />
                <span>{option.label}</span>
              </label>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {selectedOptions.length === 0 ? (
          <div style={{ fontSize: '.8rem', color: '#64748b' }}>Henuz kanal secilmedi.</div>
        ) : (
          selectedOptions.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => onRemove(option.value)}
              style={{ borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, padding: '6px 12px', cursor: 'pointer' }}
            >
              {option.label} <span style={{ marginLeft: 6 }}>x</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function channelActive(campaign, channelValue) {
  return Array.isArray(campaign.channelTargets) && campaign.channelTargets.includes(channelValue)
}

function getOptionLabel(options, value, fallback = '-') {
  return options.find(option => option.value === value)?.label || fallback
}

function getCampaignApplicationModeHint(value) {
  return value === 'auto'
    ? 'Kosul saglanir saglanmaz POS / Garson kampanyayi kendisi baglar.'
    : 'Kasiyer transaction kapanmadan once kampanyayi uygulayip uygulamayacagina karar verir.'
}

function getConditionMeta(conditionKey) {
  return CONDITION_LIBRARY.find(item => item.key === conditionKey) || CONDITION_LIBRARY[0]
}

function formatSummaryDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function getChannelLabel(channelValue, salesChannels) {
  return salesChannels.find(item => item.value === channelValue)?.label
    || CAMPAIGN_CHANNEL_OPTIONS.find(item => item.value === channelValue)?.label
    || channelValue
}

function formatCompactList(values = [], fallback = '') {
  const normalized = (values || []).map(value => String(value || '').trim()).filter(Boolean)
  if (normalized.length === 0) return fallback
  if (normalized.length <= 2) return normalized.join(', ')
  return `${normalized.slice(0, 2).join(', ')} +${normalized.length - 2}`
}

function getCatalogFilterTypeMeta(type) {
  return CATALOG_FILTER_TYPE_META[type] || CATALOG_FILTER_TYPE_META.product
}

function formatMaskLabel(mask = {}) {
  const base = String(mask.name || '').trim() || 'Adsiz filtre'
  const typeLabel = getCatalogFilterTypeMeta(mask.type).label.toLowerCase()
  return `${base} (${typeLabel})`
}

function formatProductMaskSummary(masks = []) {
  return formatCompactList((masks || []).map(formatMaskLabel), '')
}

function formatApplyToSummary(applyTo) {
  switch (applyTo) {
    case 'cheapest':
      return 'en ucuz eslesen urunde'
    case 'most_expensive':
      return 'en pahali eslesen urunde'
    default:
      return 'sablona gore tum eslesen urunlerde'
  }
}

function formatQuantityCountingMode(config = {}) {
  return config.allowSameItemRepeat !== false
    ? 'ayni urun tekrarlari dahil'
    : 'farkli urunler sayilsin'
}

function formatWeekdaySummary(days = []) {
  const labels = WEEKDAY_OPTIONS.filter((_, index) => Boolean(days?.[index]))
  if (labels.length === 0) return 'gun secilmedi'
  if (labels.length === WEEKDAY_OPTIONS.length) return 'her gun'
  return labels.join(', ')
}

function formatHappyHourSummary(windows = []) {
  const normalized = Array.isArray(windows) ? windows : []
  const parts = normalized
    .filter(window => window?.start && window?.end)
    .map(window => `${formatWeekdaySummary(window.days)} ${window.start}-${window.end}`.trim())
  return formatCompactList(parts, '')
}

function formatCalendarScheduleSummary(config = {}) {
  const frequency = config.frequency || 'daily'
  const weekdayLabels = WEEKDAY_OPTIONS.filter((_, index) => Boolean(config.weekdays?.[index]))
  const dayLabel = config.dayOfMonth === 'last' ? 'ayin son gunu' : `${config.dayOfMonth || 1}. gun`
  const monthLabel = MONTH_OPTIONS.find(option => Number(option.value) === Number(config.monthOfYear || 1))?.label || 'Ocak'

  switch (frequency) {
    case 'weekly':
      return `Haftalik${weekdayLabels.length ? ` (${weekdayLabels.join(', ')})` : ''}`
    case 'monthly':
      return `Aylik (${dayLabel})`
    case 'yearly':
      return `Yillik (${dayLabel} / ${monthLabel})`
    default:
      return 'Gunluk'
  }
}

function formatAmount(value, suffix = 'TL') {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return `0 ${suffix}`.trim()
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numeric)} ${suffix}`.trim()
}

function formatPlainNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numeric)
}

function formatNumberInputValue(value, fallback = '0') {
  if (value == null || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback

  const text = String(value).trim()
  if (!text) return fallback

  if (/^[-+]?0+\d+(?:\.\d+)?$/.test(text)) {
    const numeric = Number(text)
    return Number.isFinite(numeric) ? String(numeric) : fallback
  }

  return text
}

function formatPeriodWindow(period, periodDays = 30) {
  if (period === 'rolling_days') return `son ${Math.max(1, Number(periodDays) || 30)} gun`
  return getOptionLabel(PERIOD_OPTIONS, period, 'Tum zamanlar').toLowerCase()
}

function formatCurrentOrderInclusion(config = {}, label = 'mevcut siparis dahil') {
  return config.includeCurrentOrder !== false ? label : 'yalnizca onceki kayitlar'
}

function formatMessageSnippet(value, fallback = '') {
  const sanitized = String(value || '').trim().replace(/\s+/g, ' ')
  if (!sanitized) return fallback
  return sanitized.length > 56 ? `${sanitized.slice(0, 53)}...` : sanitized
}

const TEMPLATE_MODEL_FIELDS = [
  { token: '{{campaign_name}}', label: 'Kampanya adi' },
  { token: '{{customer_name}}', label: 'Musteri adi' },
  { token: '{{customer_category}}', label: 'Musteri kategorisi' },
  { token: '{{order_total}}', label: 'Siparis toplami' },
  { token: '{{visit_count}}', label: 'Ziyaret / siparis sayisi' },
  { token: '{{coupon_code}}', label: 'Kupon kodu' },
  { token: '{{branch_name}}', label: 'Sube adi' },
  { token: '{{current_date}}', label: 'Bugunun tarihi' },
  { token: '{{current_time}}', label: 'Guncel saat' },
]

function renderTemplateText(template, values = {}) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  ))
}

function wrapPreviewLine(line, maxLineLength = 42) {
  const sanitized = String(line || '').trim()
  if (!sanitized) return []
  if (sanitized.length <= maxLineLength) return [sanitized]

  const words = sanitized.split(/\s+/)
  const lines = []
  let current = ''

  words.forEach(word => {
    if (word.length > maxLineLength) {
      if (current) {
        lines.push(current)
        current = ''
      }
      for (let index = 0; index < word.length; index += maxLineLength) {
        lines.push(word.slice(index, index + maxLineLength))
      }
      return
    }

    const next = current ? `${current} ${word}` : word
    if (next.length > maxLineLength) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  })

  if (current) lines.push(current)
  return lines
}

function formatTemplatePreview(template, values = {}, { maxLines = 3, maxLineLength = 42 } = {}) {
  const rendered = renderTemplateText(template, values).replace(/\r/g, '').trim()
  if (!rendered) return ''

  const wrappedLines = rendered
    .split('\n')
    .flatMap(line => wrapPreviewLine(line, maxLineLength))
    .filter(Boolean)

  if (wrappedLines.length <= maxLines) return wrappedLines.join('\n')

  const clippedLines = wrappedLines.slice(0, maxLines)
  clippedLines[maxLines - 1] = `${clippedLines[maxLines - 1].replace(/\.*$/, '')}...`
  return clippedLines.join('\n')
}

function createRuleSummaryContext(context = {}) {
  return {
    customerCategoryMap: new Map((context.customerCategories || []).map(category => [String(category.id), category.name || String(category.id)])),
    couponSeriesMap: new Map((context.couponSeries || []).map(series => [String(series.id), series.name || String(series.id)])),
    campaignMap: new Map((context.campaigns || []).map(campaign => [String(campaign.id), campaign.name || String(campaign.id)])),
    saleItemMap: new Map((context.saleItems || []).map(item => [String(item.id), item.name || String(item.id)])),
    salesChannelMap: new Map([
      ...CAMPAIGN_CHANNEL_OPTIONS.flatMap(option => [
        [String(option.value), option.label],
        [String(option.label), option.label],
      ]),
      ...(context.salesChannels || []).flatMap(channel => [
        [String(channel.value), channel.label || String(channel.value)],
        [String(channel.label || channel.value), channel.label || String(channel.value)],
      ]),
    ]),
  }
}

function getMappedLabels(values = [], mapping = new Map()) {
  return (values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .map(value => mapping.get(value) || value)
}

function parseMaybeArray(value) {
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

function sanitizeBranchSelections(selections) {
  const normalizedSelections = (selections || []).map(item => ({
    id: String(item?.id || ''),
    type: item?.type === 'template' ? 'template' : 'branch',
    name: String(item?.name || ''),
    branchIds: item?.type === 'template'
      ? (item?.branchIds || []).map(id => String(id))
      : [],
  })).filter(item => item.id)

  const coveredBranchIds = new Set(
    normalizedSelections
      .filter(item => item.type === 'template')
      .flatMap(item => item.branchIds)
  )

  return normalizedSelections.filter(item => item.type === 'template' || !coveredBranchIds.has(String(item.id)))
}

function formatComparisonNatural(operator) {
  switch (operator) {
    case 'gte':
      return 'eşit veya büyük'
    case 'lte':
      return 'eşit veya küçük'
    case 'gt':
      return 'büyük'
    case 'lt':
      return 'küçük'
    case 'eq':
      return 'eşit'
    case 'divisible':
      return 'bölünebilir'
    default:
      return getOptionLabel(COMPARISON_OPTIONS, operator).toLowerCase()
  }
}

function formatBirthdayWindow(daysBefore = 0, daysAfter = 0) {
  const before = Number(daysBefore) || 0
  const after = Number(daysAfter) || 0

  if (before <= 0 && after <= 0) return 'dogum gununde'
  if (before > 0 && after > 0) return `dogum gununden ${before} gun once ve ${after} gun sonra`
  if (before > 0) return `dogum gununden ${before} gun once`
  return `dogum gununden ${after} gun sonra`
}

function formatSalesChannelSelections(configOrValues = [], salesChannelMap = new Map()) {
  const values = Array.isArray(configOrValues)
    ? configOrValues.map(value => String(value || '').trim()).filter(Boolean)
    : getSalesChannelConditionValues(configOrValues || {})

  if (values.length === 0) return ''

  return formatCompactList(values.map(value => (
    salesChannelMap.get(String(value))
    || CAMPAIGN_CHANNEL_OPTIONS.find(option => option.value === value || option.label === value)?.label
    || value
  )))
}

function SearchableMultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = 'Secim yapin',
  searchPlaceholder = 'Ara',
  emptyText = 'Sonuc bulunamadi.',
  allowSelectAll = false,
  summaryFormatter = null,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    setSearch('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  const normalizedSelectedValues = Array.isArray(selectedValues) ? selectedValues.map(value => String(value)) : []
  const selectedSet = new Set(normalizedSelectedValues)
  const selectedOptions = options.filter(option => selectedSet.has(String(option.value)))
  const normalizedSearch = search.trim().toLowerCase()
  const filteredOptions = options.filter(option => {
    const haystack = [option.label, option.description, option.value]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return !normalizedSearch || haystack.includes(normalizedSearch)
  })
  const summaryText = selectedOptions.length > 0
    ? (summaryFormatter ? summaryFormatter(selectedOptions) : formatCompactList(selectedOptions.map(option => option.label), `${selectedOptions.length} secim`))
    : placeholder

  function toggleValue(nextValue) {
    const normalizedValue = String(nextValue)
    const nextValues = selectedSet.has(normalizedValue)
      ? normalizedSelectedValues.filter(value => value !== normalizedValue)
      : [...normalizedSelectedValues, normalizedValue]
    onChange(nextValues)
  }

  function handleClear(event) {
    event.stopPropagation()
    onChange([])
  }

  function handleSelectAll() {
    const nextValues = [...new Set([...normalizedSelectedValues, ...filteredOptions.filter(option => !option.disabled).map(option => String(option.value))])]
    onChange(nextValues)
  }

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: 10, position: 'relative' }}>
      <button
        type="button"
        className="f-input"
        onClick={() => setOpen(current => !current)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff' }}
      >
        <span style={{ color: selectedOptions.length > 0 ? '#0f172a' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summaryText}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 12 }}>
          {selectedOptions.length > 0 ? (
            <i
              className="fa-solid fa-xmark"
              onClick={handleClear}
              style={{ color: '#94a3b8', cursor: 'pointer' }}
            />
          ) : null}
          <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#64748b' }} />
        </span>
      </button>

      {selectedOptions.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {selectedOptions.map(option => (
            <span
              key={option.value}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, padding: '6px 12px', fontSize: '.78rem' }}
            >
              {option.label}
            </span>
          ))}
        </div>
      ) : null}

      {open ? (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0, zIndex: 30, border: '1px solid #dbeafe', borderRadius: 14, background: '#fff', boxShadow: '0 18px 36px rgba(15, 23, 42, 0.14)', overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 8 }}>
            <input
              ref={inputRef}
              className="f-input"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
            />
            {(allowSelectAll || selectedOptions.length > 0) ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '.74rem', color: '#64748b' }}>{selectedOptions.length} secim</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {allowSelectAll ? (
                    <button className="btn-o" type="button" onClick={handleSelectAll}>
                      Tumunu Sec
                    </button>
                  ) : null}
                  <button className="btn-o" type="button" onClick={() => onChange([])}>
                    Temizle
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 8 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: 14, fontSize: '.82rem', color: '#94a3b8', textAlign: 'center' }}>{emptyText}</div>
            ) : filteredOptions.map(option => {
              const checked = selectedSet.has(String(option.value))
              const disabled = Boolean(option.disabled)
              return (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: checked ? '#eff6ff' : '#fff',
                    color: disabled ? '#94a3b8' : (checked ? '#1d4ed8' : '#334155'),
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleValue(option.value)}
                  />
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontSize: '.84rem', fontWeight: 700 }}>{option.label}</span>
                    {option.description ? (
                      <span style={{ fontSize: '.74rem', color: '#64748b', lineHeight: 1.4 }}>{option.description}</span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function BranchTargetSelection({ branches, templates, value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const sanitizedValue = sanitizeBranchSelections(value)
  const selectedTemplateBranchIds = new Set(
    sanitizedValue
      .filter(item => item.type === 'template')
      .flatMap(item => item.branchIds || [])
      .map(id => String(id))
  )

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const summaryText = sanitizedValue.length > 0
    ? sanitizedValue.map(item => item.type === 'template' ? `${item.name} sablonu` : item.name).join(', ')
    : 'Sube veya sube sablonu secin'

  function toggleBranch(branch) {
    const branchId = String(branch.id)
    if (selectedTemplateBranchIds.has(branchId)) return

    const next = sanitizedValue.some(item => item.type === 'branch' && item.id === branchId)
      ? sanitizedValue.filter(item => !(item.type === 'branch' && item.id === branchId))
      : [...sanitizedValue, { id: branchId, type: 'branch', name: branch.name, branchIds: [] }]

    onChange(sanitizeBranchSelections(next))
    setOpen(false)
  }

  function toggleTemplate(template) {
    const branchIds = parseMaybeArray(template.branch_ids).map(id => String(id))
    const templateId = String(template.id)
    const next = sanitizedValue.some(item => item.type === 'template' && item.id === templateId)
      ? sanitizedValue.filter(item => !(item.type === 'template' && item.id === templateId))
      : [
          ...sanitizedValue.filter(item => !(item.type === 'branch' && branchIds.includes(String(item.id)))),
          { id: templateId, type: 'template', name: template.name, branchIds },
        ]

    onChange(sanitizeBranchSelections(next))
    setOpen(false)
  }

  return (
    <div ref={rootRef} style={{ display: 'grid', gap: 12, position: 'relative' }}>
      <button
        type="button"
        className="f-input"
        onClick={() => setOpen(current => !current)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', cursor: 'pointer', background: '#fff' }}
      >
        <span style={{ color: sanitizedValue.length > 0 ? '#0f172a' : '#94a3b8' }}>{summaryText}</span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#64748b' }} />
      </button>

      {sanitizedValue.length > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {sanitizedValue.map(item => (
            <span
              key={`${item.type}-${item.id}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 800, padding: '6px 12px', fontSize: '.78rem' }}
            >
              {item.type === 'template' ? `${item.name} sablonu` : item.name}
            </span>
          ))}
        </div>
      ) : null}

      {open && (
        <div style={{ border: '1px solid #dbeafe', borderRadius: 14, background: '#fff', boxShadow: '0 18px 36px rgba(15, 23, 42, 0.14)', padding: 12, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Sube sablonlari</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 140, overflowY: 'auto', paddingRight: 4 }}>
              {templates.length === 0 ? (
                <div style={{ fontSize: '.78rem', color: '#94a3b8' }}>Kayitli sube sablonu bulunmuyor.</div>
              ) : templates.map(template => {
                const checked = sanitizedValue.some(item => item.type === 'template' && item.id === String(template.id))
                return (
                  <label key={template.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: '#0f172a' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTemplate(template)} />
                    <span>{template.name}</span>
                  </label>
                )
              })}
            </div>
          </div>
    
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Subeler</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
              {branches.length === 0 ? (
                <div style={{ fontSize: '.78rem', color: '#94a3b8' }}>Sube listesi bulunmuyor.</div>
              ) : branches.map(branch => {
                const branchId = String(branch.id)
                const checked = sanitizedValue.some(item => item.type === 'branch' && item.id === branchId)
                const disabled = selectedTemplateBranchIds.has(branchId)
                return (
                  <label key={branch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: disabled ? '#94a3b8' : '#0f172a' }}>
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleBranch(branch)} />
                    <span>{branch.name}</span>
                  </label>
                )
              })}
            </div>
            {selectedTemplateBranchIds.size > 0 ? (
              <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                Secili sube sablonlarina dahil olan subeler burada tekrar secilemez. Gerekirse ek subeleri ayrica secin.
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductSingleSelect({ items, value, itemId, onSelect, placeholder = 'Urun secin' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hoveredId, setHoveredId] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) {
      setSearch('')
      setHoveredId('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const selectedItem = items.find(item => String(item.id) === String(itemId))
    || items.find(item => item.name === value)
    || null

  const normalizedSearch = search.trim().toLowerCase()
  const filteredItems = items.filter(item => (
    !normalizedSearch
      || item.name.toLowerCase().includes(normalizedSearch)
      || String(item.sku || '').toLowerCase().includes(normalizedSearch)
  ))

  function handleSelect(item) {
    onSelect({
      itemId: String(item.id),
      name: item.name,
    })
    setSearch('')
    setOpen(false)
  }

  function clearSelection(event) {
    event.stopPropagation()
    onSelect({
      itemId: '',
      name: '',
    })
    setSearch('')
    setOpen(false)
  }

  const resultCountLabel = `${filteredItems.length} sonuc`

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        style={{
          width: '100%',
          border: `1.5px solid ${open ? '#fbbf24' : '#cbd5e1'}`,
          borderRadius: 14,
          padding: '10px 14px',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          textAlign: 'left',
          cursor: 'pointer',
          background: '#fff',
          boxShadow: open
            ? '0 0 0 4px rgba(251, 191, 36, 0.14), inset 0 1px 3px rgba(15, 23, 42, 0.05)'
            : 'inset 0 1px 3px rgba(15, 23, 42, 0.05)',
          transition: 'border-color .16s ease, box-shadow .16s ease',
        }}
      >
        <span style={{ minWidth: 0, display: 'grid', gap: 4, flex: 1 }}>
          <span
            style={{
              color: selectedItem || value ? '#0f172a' : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: selectedItem || value ? 700 : 500,
              fontSize: '.84rem',
            }}
          >
            {selectedItem?.name || value || placeholder}
          </span>
          {selectedItem?.sku ? (
            <span
              style={{
                width: 'fit-content',
                maxWidth: '100%',
                fontSize: '.68rem',
                color: '#64748b',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 999,
                padding: '2px 8px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedItem.sku}
            </span>
          ) : null}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
          {selectedItem || value ? (
            <i
              className="fa-solid fa-xmark"
              onClick={clearSelection}
              style={{ color: '#94a3b8', cursor: 'pointer', fontSize: '.8rem' }}
            />
          ) : null}
          <i
            className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`}
            style={{ color: '#64748b', fontSize: '.82rem' }}
          />
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: 0,
            right: 0,
            zIndex: 30,
            border: '1px solid #dbeafe',
            borderRadius: 18,
            background: '#fff',
            boxShadow: '0 22px 44px rgba(15, 23, 42, 0.16)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: '1px solid #e2e8f0',
              background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: '1.5px solid #fde68a',
                borderRadius: 14,
                background: '#fffdf7',
                boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', fontSize: '.8rem', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Urun ara"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '.84rem',
                  color: '#0f172a',
                  flex: 1,
                  minWidth: 0,
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    setSearch('')
                    inputRef.current?.focus()
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    border: 'none',
                    borderRadius: 999,
                    background: '#f1f5f9',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-xmark" style={{ fontSize: '.72rem' }} />
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700 }}>
                Urun secimi
              </span>
              <span
                style={{
                  fontSize: '.68rem',
                  color: '#475569',
                  background: '#eef2ff',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontWeight: 800,
                }}
              >
                {resultCountLabel}
              </span>
            </div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', padding: 8, background: '#fcfdff' }}>
            {filteredItems.length === 0 ? (
              <div style={{ padding: 20, fontSize: '.82rem', color: '#94a3b8', textAlign: 'center', display: 'grid', gap: 6 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '.9rem' }} />
                Sonuc bulunamadi.
              </div>
            ) : filteredItems.map(item => {
              const active = String(item.id) === String(itemId) || item.name === value
              const hovered = hoveredId === String(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHoveredId(String(item.id))}
                  onMouseLeave={() => setHoveredId(current => (current === String(item.id) ? '' : current))}
                  style={{
                    width: '100%',
                    border: `1px solid ${active ? '#bfdbfe' : hovered ? '#e2e8f0' : 'transparent'}`,
                    background: active ? '#eff6ff' : hovered ? '#f8fafc' : '#fff',
                    color: active ? '#1d4ed8' : '#0f172a',
                    borderRadius: 14,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'grid',
                    gap: 8,
                    fontWeight: active ? 800 : 600,
                    marginBottom: 6,
                    boxShadow: active ? '0 8px 18px rgba(59, 130, 246, 0.10)' : 'none',
                    transition: 'background .14s ease, border-color .14s ease, box-shadow .14s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <span
                      style={{
                        color: active ? '#1d4ed8' : '#0f172a',
                        fontWeight: active ? 800 : 700,
                        lineHeight: 1.35,
                        minWidth: 0,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.name}
                    </span>
                    {active ? (
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 999,
                          background: '#dbeafe',
                          color: '#2563eb',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <i className="fa-solid fa-check" style={{ fontSize: '.72rem' }} />
                      </span>
                    ) : null}
                  </div>
                  {item.sku ? (
                    <span
                      style={{
                        width: 'fit-content',
                        maxWidth: '100%',
                        fontSize: '.69rem',
                        color: active ? '#1d4ed8' : '#64748b',
                        background: active ? '#dbeafe' : '#f8fafc',
                        border: `1px solid ${active ? '#bfdbfe' : '#e2e8f0'}`,
                        borderRadius: 999,
                        padding: '4px 10px',
                        flexShrink: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.sku}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CatalogMaskSelect({
  items,
  categories,
  saleTemplates,
  value,
  itemId,
  selectionType = 'product',
  onSelect,
  placeholder = 'Urun / kategori / sablon secin',
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [hoveredKey, setHoveredKey] = useState('')
  const rootRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (open) {
      setSearch('')
      setHoveredKey('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const options = useMemo(() => {
    const templateOptions = (saleTemplates || []).map(template => ({
      key: `sale_template:${template.id}`,
      id: String(template.id),
      type: 'sale_template',
      label: template.name || '',
      description: template.description || '',
      meta: `${Array.isArray(template.saleIds) ? template.saleIds.length : 0} urun`,
      group: 'Satis mali sablonlari',
      icon: getCatalogFilterTypeMeta('sale_template').icon,
      searchText: `${template.name || ''} ${template.description || ''}`,
    }))

    const categoryOptions = (categories || []).map(category => ({
      key: `category:${category.id}`,
      id: String(category.id),
      type: 'category',
      label: category.name || '',
      description: 'Urun kategorisi / urun grubu',
      meta: 'Kategori',
      group: 'Kategoriler',
      icon: getCatalogFilterTypeMeta('category').icon,
      searchText: category.name || '',
    }))

    const itemOptions = (items || []).map(item => ({
      key: `product:${item.id}`,
      id: String(item.id),
      type: 'product',
      label: item.name || '',
      description: '',
      meta: item.sku || 'Urun',
      group: 'Urunler',
      icon: getCatalogFilterTypeMeta('product').icon,
      searchText: `${item.name || ''} ${item.sku || ''}`,
    }))

    return [...templateOptions, ...categoryOptions, ...itemOptions]
  }, [categories, items, saleTemplates])

  const normalizedSearch = search.trim().toLowerCase()
  const filteredOptions = options.filter(option => (
    !normalizedSearch
      || option.label.toLowerCase().includes(normalizedSearch)
      || option.searchText.toLowerCase().includes(normalizedSearch)
      || option.meta.toLowerCase().includes(normalizedSearch)
  ))

  const selectedOption = options.find(option => (
    option.type === selectionType && option.id === String(itemId)
  )) || (value ? {
    key: `legacy:${selectionType}:${itemId || value}`,
    id: String(itemId || ''),
    type: selectionType || 'product',
    label: value,
    description: '',
    meta: getCatalogFilterTypeMeta(selectionType).label,
    group: 'Secili oge',
    icon: getCatalogFilterTypeMeta(selectionType).icon,
  } : null)

  function handleSelect(option) {
    onSelect({
      itemId: option.id,
      name: option.label,
      type: option.type,
    })
    setSearch('')
    setOpen(false)
  }

  function clearSelection(event) {
    event.stopPropagation()
    onSelect({
      itemId: '',
      name: '',
      type: 'product',
    })
    setSearch('')
    setOpen(false)
  }

  const resultCountLabel = `${filteredOptions.length} secenek`
  const selectedMeta = getCatalogFilterTypeMeta(selectedOption?.type)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        style={{
          width: '100%',
          border: `1.5px solid ${open ? '#fbbf24' : '#cbd5e1'}`,
          borderRadius: 14,
          padding: '10px 14px',
          minHeight: 46,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          textAlign: 'left',
          cursor: 'pointer',
          background: '#fff',
          boxShadow: open
            ? '0 0 0 4px rgba(251, 191, 36, 0.14), inset 0 1px 3px rgba(15, 23, 42, 0.05)'
            : 'inset 0 1px 3px rgba(15, 23, 42, 0.05)',
          transition: 'border-color .16s ease, box-shadow .16s ease',
        }}
      >
        <span style={{ minWidth: 0, display: 'grid', gap: 4, flex: 1 }}>
          <span
            style={{
              color: selectedOption ? '#0f172a' : '#94a3b8',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: selectedOption ? 700 : 500,
              fontSize: '.84rem',
            }}
          >
            {selectedOption?.label || placeholder}
          </span>
          {selectedOption ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span
                style={{
                  width: 'fit-content',
                  maxWidth: '100%',
                  fontSize: '.68rem',
                  color: selectedMeta.color,
                  background: selectedMeta.background,
                  border: `1px solid ${selectedMeta.border}`,
                  borderRadius: 999,
                  padding: '2px 8px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedMeta.label}
              </span>
              {selectedOption.meta ? (
                <span
                  style={{
                    width: 'fit-content',
                    maxWidth: '100%',
                    fontSize: '.68rem',
                    color: '#64748b',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 999,
                    padding: '2px 8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedOption.meta}
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexShrink: 0 }}>
          {selectedOption ? (
            <i
              className="fa-solid fa-xmark"
              onClick={clearSelection}
              style={{ color: '#94a3b8', cursor: 'pointer', fontSize: '.8rem' }}
            />
          ) : null}
          <i
            className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`}
            style={{ color: '#64748b', fontSize: '.82rem' }}
          />
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: 0,
            right: 0,
            zIndex: 30,
            border: '1px solid #dbeafe',
            borderRadius: 18,
            background: '#fff',
            boxShadow: '0 22px 44px rgba(15, 23, 42, 0.16)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: '1px solid #e2e8f0',
              background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                border: '1.5px solid #fde68a',
                borderRadius: 14,
                background: '#fffdf7',
                boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', fontSize: '.8rem', flexShrink: 0 }} />
              <input
                ref={inputRef}
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Urun, kategori veya sablon ara"
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '.84rem',
                  color: '#0f172a',
                  flex: 1,
                  minWidth: 0,
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={event => {
                    event.stopPropagation()
                    setSearch('')
                    inputRef.current?.focus()
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    border: 'none',
                    borderRadius: 999,
                    background: '#f1f5f9',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-xmark" style={{ fontSize: '.72rem' }} />
                </button>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700 }}>
                Urun / kategori / sablon secimi
              </span>
              <span
                style={{
                  fontSize: '.68rem',
                  color: '#475569',
                  background: '#eef2ff',
                  borderRadius: 999,
                  padding: '4px 10px',
                  fontWeight: 800,
                }}
              >
                {resultCountLabel}
              </span>
            </div>
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8, background: '#fcfdff' }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: 20, fontSize: '.82rem', color: '#94a3b8', textAlign: 'center', display: 'grid', gap: 6 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ fontSize: '.9rem' }} />
                Sonuc bulunamadi.
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const optionMeta = getCatalogFilterTypeMeta(option.type)
                const active = option.type === selectionType && option.id === String(itemId)
                const hovered = hoveredKey === option.key
                const previousGroup = index > 0 ? filteredOptions[index - 1]?.group : ''
                const showGroup = option.group !== previousGroup

                return (
                  <div key={option.key}>
                    {showGroup ? (
                      <div
                        style={{
                          padding: index === 0 ? '4px 8px 8px' : '12px 8px 8px',
                          fontSize: '.68rem',
                          fontWeight: 900,
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: '.08em',
                        }}
                      >
                        {option.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleSelect(option)}
                      onMouseEnter={() => setHoveredKey(option.key)}
                      onMouseLeave={() => setHoveredKey(current => (current === option.key ? '' : current))}
                      style={{
                        width: '100%',
                        border: `1px solid ${active ? '#bfdbfe' : hovered ? '#e2e8f0' : 'transparent'}`,
                        background: active ? '#eff6ff' : hovered ? '#f8fafc' : '#fff',
                        color: active ? '#1d4ed8' : '#0f172a',
                        borderRadius: 14,
                        padding: '12px 14px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'grid',
                        gap: 8,
                        marginBottom: 6,
                        boxShadow: active ? '0 8px 18px rgba(59, 130, 246, 0.10)' : 'none',
                        transition: 'background .14s ease, border-color .14s ease, box-shadow .14s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <span
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                background: optionMeta.background,
                                color: optionMeta.color,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <i className={`fa-solid ${optionMeta.icon}`} style={{ fontSize: '.78rem' }} />
                            </span>
                            <span
                              style={{
                                color: active ? '#1d4ed8' : '#0f172a',
                                fontWeight: active ? 800 : 700,
                                lineHeight: 1.35,
                                minWidth: 0,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {option.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: '.68rem',
                                color: optionMeta.color,
                                background: optionMeta.background,
                                border: `1px solid ${optionMeta.border}`,
                                borderRadius: 999,
                                padding: '2px 8px',
                              }}
                            >
                              {optionMeta.label}
                            </span>
                            {option.meta ? (
                              <span
                                style={{
                                  fontSize: '.68rem',
                                  color: active ? '#1d4ed8' : '#64748b',
                                  background: active ? '#dbeafe' : '#f8fafc',
                                  border: `1px solid ${active ? '#bfdbfe' : '#e2e8f0'}`,
                                  borderRadius: 999,
                                  padding: '2px 8px',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {option.meta}
                              </span>
                            ) : null}
                          </div>
                          {option.description ? (
                            <div style={{ fontSize: '.72rem', color: '#64748b', lineHeight: 1.45 }}>
                              {option.description}
                            </div>
                          ) : null}
                        </div>
                        {active ? (
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              background: '#dbeafe',
                              color: '#2563eb',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <i className="fa-solid fa-check" style={{ fontSize: '.72rem' }} />
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function buildConditionSummary(rule, context = {}) {
  const conditionMeta = getConditionMeta(rule.conditionKey)
  const config = rule.conditionConfig || {}
  const extraConditions = Array.isArray(config.additionalConditions) ? config.additionalConditions.length : 0
  const joinerSuffix = extraConditions > 0 ? ` + ${extraConditions} ek kosul (${config.additionalConditionsMode === 'or' ? 'VEYA' : 'VE'})` : ''
  const summaryContext = createRuleSummaryContext(context)
  const categoryLabels = formatCompactList(getMappedLabels(config.tags, summaryContext.customerCategoryMap))
  const seriesLabels = formatCompactList(getMappedLabels(config.seriesIds, summaryContext.couponSeriesMap))
  const campaignLabels = formatCompactList(getMappedLabels(config.relatedCampaignIds, summaryContext.campaignMap))
  const happyHourSummary = formatHappyHourSummary(config.windows)
  const periodLabel = formatPeriodWindow(config.period || rule.period, config.periodDays)
  const productMaskSummary = formatProductMaskSummary(config.productMasks)

  switch (rule.conditionKey) {
    case 'always':
      return `${conditionMeta.label}${joinerSuffix}`
    case 'calendar_schedule':
      return `${conditionMeta.label}: ${formatCalendarScheduleSummary(config)}${joinerSuffix}`
    case 'birthday':
      return `${conditionMeta.label}: ${formatBirthdayWindow(config.daysBefore, config.daysAfter)}${joinerSuffix}`
    case 'period_total_order_amount':
      return `${conditionMeta.label}: ${periodLabel} icinde ${formatComparisonNatural(config.operator || rule.operator)} ${formatAmount(config.amount || 0)} (${formatCurrentOrderInclusion(config)})${joinerSuffix}`
    case 'order_total':
      return `${conditionMeta.label}: ${formatComparisonNatural(config.operator || rule.operator)} ${formatAmount(config.amount || 0)}${joinerSuffix}`
    case 'period_order_count':
      return `${conditionMeta.label}: ${periodLabel} icinde ${formatComparisonNatural(config.operator || rule.operator)} ${config.count || 0} (${formatCurrentOrderInclusion(config, 'mevcut ziyaret / siparis dahil')})${joinerSuffix}`
    case 'period_product_quantity':
      return `${conditionMeta.label}: ${periodLabel} icinde ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}, ${formatQuantityCountingMode(config)}${joinerSuffix}`
    case 'period_sold_product_quantity':
      return `${conditionMeta.label}: ${periodLabel} icinde secili urun / kategori / sablonlarin toplam satis adedi ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
    case 'order_item_quantity':
      return `${conditionMeta.label}: ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}, ${formatQuantityCountingMode(config)}${joinerSuffix}`
    case 'last_visit_days':
      return `${conditionMeta.label}: ${config.days || 0} gun ve daha uzun suredir${joinerSuffix}`
    case 'days_since_first_activity':
      return `${conditionMeta.label}: ${formatComparisonNatural(config.operator || rule.operator)} ${config.days || 0} gun${joinerSuffix}`
    case 'gift_card_series':
      return `${conditionMeta.label}: ${getOptionLabel(GIFT_CARD_MODE_OPTIONS, config.mode, 'seri eslesmesi')}${seriesLabels ? ` (${seriesLabels})` : ''}${joinerSuffix}`
    case 'campaign_triggered':
      return `${conditionMeta.label}: ${campaignLabels || 'secili kampanyalar'}${joinerSuffix}`
    case 'coupon_present':
      return `${conditionMeta.label}: ${config.anySeries ? 'herhangi bir seri' : (seriesLabels || 'secili seriler')}${joinerSuffix}`
    case 'happy_hour':
      return `${conditionMeta.label}: ${happyHourSummary || 'gun ve saat araligi secin'}${joinerSuffix}`
    case 'customer_has_tag':
      return `${conditionMeta.label}: ${categoryLabels || 'secili kategoriler'}${joinerSuffix}`
    case 'customer_lacks_tag':
      return `${conditionMeta.label}: ${categoryLabels || 'secili kategoriler'} haric${joinerSuffix}`
    case 'sales_channel': {
      const selectionText = formatSalesChannelSelections(config, summaryContext.salesChannelMap)
      return `${conditionMeta.label}: ${selectionText || 'secili satis kanallari'}${joinerSuffix}`
    }
    case 'missing_products':
      return `${conditionMeta.label}: ${productMaskSummary || 'secili urun / kategori / sablon filtreleri'} eksik${joinerSuffix}`
    default:
      return `${conditionMeta.label}${joinerSuffix}`
  }
}

function buildActionSummary(rule, context = {}) {
  const config = rule.actionConfig || {}
  const actionLabel = getOptionLabel(ACTION_TYPE_OPTIONS, rule.actionType)
  const summaryContext = createRuleSummaryContext(context)
  const targetLabel = getOptionLabel(CUSTOMER_TARGET_OPTIONS, config.target, 'Siparisin musterisi').toLowerCase()
  const categoryLabel = summaryContext.customerCategoryMap.get(String(config.category || '')) || config.category
  const seriesLabels = formatCompactList(getMappedLabels(config.seriesIds, summaryContext.couponSeriesMap))

  switch (rule.actionType) {
    case 'free_products': {
      const itemNames = formatCompactList((config.items || []).map(item => item.name || summaryContext.saleItemMap.get(String(item.itemId || '')) || item.itemId))
      return itemNames ? `${itemNames} urunlerini hediye et` : actionLabel
    }
    case 'suggest_products': {
      const itemNames = formatCompactList((config.items || []).map(item => item.name || summaryContext.saleItemMap.get(String(item.itemId || '')) || item.itemId))
      return itemNames ? `${itemNames} urunlerini oner` : actionLabel
    }
    case 'product_pricing': {
          const pricingSummaries = (config.items || [])
        .map(item => {
          const itemName = item.name || summaryContext.saleItemMap.get(String(item.itemId || '')) || 'Adsiz oge'
          const scopeText = formatApplyToSummary(item.applyTo)
          switch (item.pricingType) {
            case 'discount_percent':
              return `${itemName} icin ${scopeText} %${item.value || 0} indirim`
            case 'discount_amount':
              return `${itemName} icin ${scopeText} ${formatAmount(item.value || 0)} indirim`
            case 'fixed_price':
              return `${itemName} icin ${scopeText} ${formatAmount(item.value || 0)} sabit fiyat`
            case 'none':
              return `${itemName} icin indirim yok`
            default:
              return itemName
          }
        })
      return pricingSummaries.length > 0 ? formatCompactList(pricingSummaries, actionLabel) : actionLabel
    }
    case 'combo_bundle': {
      const comboName = String(config.name || '').trim() || 'Kombo'
      const priceDetail = config.priceMode === 'fixed_price' ? ` (${formatAmount(config.priceValue || 0)})` : ''
      return `${comboName}${priceDetail} uygula`
    }
    case 'write_customer_note':
      return formatMessageSnippet(config.customerTemplate || config.anonymousTemplate, actionLabel)
    case 'send_sms':
      return formatMessageSnippet(config.message, actionLabel)
    case 'send_webhook':
      return config.endpoint ? `Webhook gonder: ${config.endpoint}` : actionLabel
    case 'remove_customer_tag':
      return categoryLabel ? `${targetLabel} icin ${categoryLabel} kategorisini kaldir` : actionLabel
    case 'add_customer_tag':
      return categoryLabel ? `${targetLabel} icin ${categoryLabel} kategorisini ekle` : actionLabel
    case 'special_discount':
      return `${formatAmount(config.amount || 0)} ozel indirim uygula`
    case 'order_discount_amount':
      return `${formatAmount(config.amount || 0)} siparis indirimi uygula`
    case 'order_extra_charge_amount':
      return `${formatAmount(config.amount || 0)} ek ucret uygula`
    case 'order_extra_charge_percent':
      return `%${config.percent || 0} ek ucret uygula`
    case 'discount_percent':
      return `%${config.percent || 0} indirim uygula`
    case 'total_order_discount_percent':
      return `%${config.percent || 0} toplam siparis indirimi uygula`
    case 'warning_message':
      return formatMessageSnippet(config.message, actionLabel)
    case 'bonus_points':
      return `${config.points || 0} puan yukle`
    case 'points_percent_of_order':
      return `siparis tutarinin %${config.percent || 0} kadar puan kazandir`
    case 'points_earn_multiplier':
      return `puan kazanimi x${formatPlainNumber(config.multiplier || 1)} katsayi ile uygula`
    case 'points_redeem_multiplier':
      return `puan harcama degerini x${formatPlainNumber(config.multiplier || 1)} yap`
    case 'issue_coupon':
      return config.anySeries ? 'uygun seriden kupon ver' : (seriesLabels ? `${seriesLabels} serisinden kupon ver` : actionLabel)
    default:
      return actionLabel
  }
}

function buildRuleSummary(rule, context = {}) {
  return `${buildConditionSummary(rule, context)} -> ${buildActionSummary(rule, context)}`
}

function buildRuleConditionText(rule, context = {}) {
  return buildConditionSummary(rule, context)
}

function buildAudienceSummary(selectedCampaign, customerCategories, targetedCustomerCount = null) {
  if (!selectedCampaign) return 'tum musteriler'

  if (selectedCampaign.audienceType === 'tagged_customers' && (selectedCampaign.audienceCategoryIds || []).length > 0) {
    return 'legacy kategori hedefi'
  }

  return getOptionLabel(CAMPAIGN_AUDIENCE_OPTIONS, selectedCampaign.audienceType, 'Tum Musteriler').toLowerCase()
}

function usesLegacyCategoryAudience(campaign = {}) {
  return campaign?.audienceType === 'tagged_customers' && (campaign.audienceCategoryIds || []).length > 0
}

function hasMatchingCategoryFilter(config = {}, conditionKey, categoryIds = []) {
  const normalizedRuleCategoryIds = [...new Set((config?.tags || []).map(value => String(value || '')).filter(Boolean))].sort()
  const normalizedCategoryIds = [...new Set((categoryIds || []).map(value => String(value || '')).filter(Boolean))].sort()
  if (normalizedRuleCategoryIds.length !== normalizedCategoryIds.length) return false
  if (!normalizedRuleCategoryIds.every((value, index) => value === normalizedCategoryIds[index])) return false
  return true
    && (conditionKey === 'customer_has_tag' || conditionKey === 'customer_lacks_tag')
}

function hasRuleLevelCategoryCondition(rule = {}, conditionKey, categoryIds = []) {
  if (rule.conditionKey === conditionKey && hasMatchingCategoryFilter(rule.conditionConfig, conditionKey, categoryIds)) {
    return true
  }
  return (rule.conditionConfig?.additionalConditions || []).some(condition => (
    condition.conditionKey === conditionKey && hasMatchingCategoryFilter(condition.config, conditionKey, categoryIds)
  ))
}

function buildConditionScenarioText(rule, context = {}) {
  const config = rule.conditionConfig || {}
  const summaryContext = createRuleSummaryContext(context)
  const categoryLabels = formatCompactList(getMappedLabels(config.tags, summaryContext.customerCategoryMap))
  const seriesLabels = formatCompactList(getMappedLabels(config.seriesIds, summaryContext.couponSeriesMap))
  const campaignLabels = formatCompactList(getMappedLabels(config.relatedCampaignIds, summaryContext.campaignMap))
  const happyHourSummary = formatHappyHourSummary(config.windows)
  const periodLabel = formatPeriodWindow(config.period || rule.period, config.periodDays)
  const productMaskSummary = formatProductMaskSummary(config.productMasks)

  switch (rule.conditionKey) {
    case 'always':
      return 'her sipariste'
    case 'calendar_schedule':
      return `${formatCalendarScheduleSummary(config)} takviminde`
    case 'birthday':
      return `musterinin ${formatBirthdayWindow(config.daysBefore, config.daysAfter)}`
    case 'period_total_order_amount':
      return `${periodLabel} icindeki toplam siparis tutari ${formatComparisonNatural(config.operator || rule.operator)} ${formatAmount(config.amount || 0)} oldugunda (${formatCurrentOrderInclusion(config)})`
    case 'order_total':
      return `siparis tutari ${formatComparisonNatural(config.operator || rule.operator)} ${formatAmount(config.amount || 0)} oldugunda`
    case 'period_order_count':
      return `${periodLabel} icindeki ziyaret / siparis sayisi ${formatComparisonNatural(config.operator || rule.operator)} ${config.count || 0} oldugunda (${formatCurrentOrderInclusion(config, 'mevcut ziyaret / siparis dahil')})`
    case 'period_product_quantity':
      return `${periodLabel} icindeki urun miktari ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''} oldugunda (${formatQuantityCountingMode(config)})`
    case 'period_sold_product_quantity':
      return `${periodLabel} icinde secili urun / kategori / sablonlarin toplam satis adedi ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''} oldugunda`
    case 'order_item_quantity':
      return `urun miktari ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''} oldugunda (${formatQuantityCountingMode(config)})`
    case 'last_visit_days':
      return `${config.days || 0} gun ve daha uzun suredir gelmediginde`
    case 'days_since_first_activity':
      return `ilk aktiviteden sonra ${formatComparisonNatural(config.operator || rule.operator)} ${config.days || 0} gun gectiginde`
    case 'happy_hour':
      return happyHourSummary ? `${happyHourSummary} araliginda` : 'belirlenen gun ve saat araliginda'
    case 'gift_card_series':
      return seriesLabels ? `musteri hediye karti ${seriesLabels} serileriyle eslestiginde` : 'musteri hediye karti seri kosulu saglandiginda'
    case 'campaign_triggered':
      return campaignLabels ? `${campaignLabels} kampanyasi tetiklendiginde` : 'bagli kampanya tetiklendiginde'
    case 'coupon_present':
      return config.anySeries ? 'musteride herhangi bir kupon serisi bulundugunda' : (seriesLabels ? `musteride ${seriesLabels} kuponu bulundugunda` : 'musteride secili kupon bulundugunda')
    case 'customer_has_tag':
      return categoryLabels ? `musteri ${categoryLabels} kategorilerinden birine ait oldugunda` : 'musteri secili kategorilerden birine ait oldugunda'
    case 'customer_lacks_tag':
      return categoryLabels ? `musteri ${categoryLabels} kategorilerine ait olmadiginda` : 'musteri secili kategorilere ait olmadiginda'
    case 'sales_channel':
      return formatSalesChannelSelections(config, summaryContext.salesChannelMap)
        ? `siparis ${formatSalesChannelSelections(config, summaryContext.salesChannelMap)} kanalindan geldiginde`
        : 'siparis secili satis kanalindan geldiginde'
    case 'missing_products':
      return productMaskSummary ? `${productMaskSummary} sipariste olmadiginda` : 'secili urun / kategori / sablonlar sipariste olmadiginda'
    default:
      return `${getConditionMeta(rule.conditionKey).label.toLowerCase()} kosulu saglandiginda`
  }
}

const WEEKDAY_OPTIONS = ['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz']
const MONTH_OPTIONS = [
  { value: 1, label: 'Ocak' },
  { value: 2, label: 'Subat' },
  { value: 3, label: 'Mart' },
  { value: 4, label: 'Nisan' },
  { value: 5, label: 'Mayis' },
  { value: 6, label: 'Haziran' },
  { value: 7, label: 'Temmuz' },
  { value: 8, label: 'Agustos' },
  { value: 9, label: 'Eylul' },
  { value: 10, label: 'Ekim' },
  { value: 11, label: 'Kasim' },
  { value: 12, label: 'Aralik' },
]
const CALENDAR_FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Gunluk' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Aylik' },
  { value: 'yearly', label: 'Yillik' },
]
const CALENDAR_DAY_OPTIONS = [
  { value: 'last', label: 'Ayin son gunu' },
  ...Array.from({ length: 31 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}. gun`,
  })),
]
const TIMEZONE_OPTIONS = [
  { value: 'Europe/Istanbul', label: '(UTC+03:00) Istanbul' },
  { value: 'UTC', label: '(UTC+00:00) UTC' },
]
const CATALOG_FILTER_TYPE_META = {
  product: {
    label: 'Urun',
    icon: 'fa-burger',
    color: '#0f766e',
    background: '#ccfbf1',
    border: '#99f6e4',
  },
  category: {
    label: 'Kategori',
    icon: 'fa-layer-group',
    color: '#7c3aed',
    background: '#ede9fe',
    border: '#ddd6fe',
  },
  sale_template: {
    label: 'Satis mali sablonu',
    icon: 'fa-tags',
    color: '#c2410c',
    background: '#ffedd5',
    border: '#fed7aa',
  },
  combo: {
    label: 'Kombo',
    icon: 'fa-box-archive',
    color: '#475569',
    background: '#e2e8f0',
    border: '#cbd5e1',
  },
}
const MASK_TYPE_OPTIONS = [
  { value: 'product', label: 'Urun' },
  { value: 'category', label: 'Urun kategorisi' },
  { value: 'combo', label: 'Kombo' },
]
const PRICING_TARGET_OPTIONS = [
  { value: 'product', label: 'Urun' },
  { value: 'sale_template', label: 'Sablon' },
  { value: 'category', label: 'Kategori' },
]
const CUSTOMER_TARGET_OPTIONS = [
  { value: 'order_customer', label: 'Siparisin musterisi' },
  { value: 'linked_customer', label: 'Bagli musteri' },
]
const GIFT_CARD_MODE_OPTIONS = [
  { value: 'series_selected', label: 'Musteri Hediye Karti serisi belirtildi' },
  { value: 'series_missing', label: 'Musteri Hediye Kartinin serisi yok' },
  { value: 'matches_series', label: 'Musteri Hediye Karti, onceden ayarlanmis seriyle eslesiyor' },
  { value: 'not_matching_series', label: 'Musteri Hediye Kartinin serisi yok veya seriyle eslesmiyor' },
]
const PRICING_APPLY_OPTIONS = [
  { value: 'all_matches', label: 'Sablona gore tum urunler' },
  { value: 'cheapest', label: 'En ucuz urun' },
  { value: 'most_expensive', label: 'En pahali urun' },
]
const PRICING_TYPE_OPTIONS = [
  { value: 'discount_percent', label: 'Indirim (%)' },
  { value: 'discount_amount', label: 'Indirim (Tutar)' },
  { value: 'fixed_price', label: 'Sabit fiyat' },
  { value: 'none', label: 'Indirim yok' },
]
const COMBO_PRICE_MODE_OPTIONS = [
  { value: 'fixed_price', label: 'Sabit fiyat' },
  { value: 'dynamic', label: 'Dinamik fiyat' },
]

function getEditorRuleConditionSummaries(rule, context = {}) {
  return getEditorRuleConditions(rule)
    .map(condition => buildConditionSummary({
      ...rule,
      conditionKey: condition.conditionKey,
      conditionConfig: getStandaloneConditionConfig(condition.conditionConfig),
    }, context))
    .filter(value => String(value || '').trim().length > 0)
}

function getEditorRuleActionSummaries(rule, context = {}) {
  return getEditorRuleActions(rule)
    .map(action => (String(action.actionSummary || '').trim() || buildActionSummary({
      ...rule,
      actionType: action.actionType,
      actionSummary: action.actionSummary,
      actionConfig: getStandaloneActionConfig(action.actionConfig),
    }, context)))
    .filter(value => String(value || '').trim().length > 0)
}

// RUNTIME_STATUS_META and helpers imported from loyaltyRuntimeStatus.js

function RuntimeStatusBadge({ status, compact = false }) {
  return null
}

function RuntimeStatusNote({ status }) {
  return null
}

function RuleRow({ rule, onEditCondition, onEditAction, onDelete, onAddCondition, onAddAction, onDeleteCondition, onDeleteAction, onToggleConditionJoiner, summaryContext }) {
  const conditions = getEditorRuleConditions(rule)
  const actions = getEditorRuleActions(rule)
  const primaryConditionLabel = conditions[0] ? getConditionMeta(conditions[0].conditionKey).label : 'Boş koşul bloğu'
  const blockTitle = conditions.length > 1 ? `${primaryConditionLabel} + ${conditions.length - 1} kosul` : primaryConditionLabel
  const blockMeta = `${conditions.length} kosul / ${actions.length} eylem`
  const conditionJoinerMode = rule.conditionConfig?.additionalConditionsMode === 'or' ? 'or' : 'and'

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              borderRadius: 999,
              padding: '5px 10px',
              fontSize: '.72rem',
              fontWeight: 900,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
            }}>
              Koşul Bloğu
            </span>
            <MiniBadge active={rule.active} trueLabel="Aktif" falseLabel="Pasif" />
            {rule.stopProcessing ? <MiniBadge active trueLabel="Akisi durdurur" falseLabel="" /> : null}
          </div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{blockTitle}</div>
          <div style={{ fontSize: '.74rem', color: '#64748b' }}>{blockMeta}</div>
        </div>
        <button className="btn-danger" type="button" onClick={onDelete}>
          <i className="fa-solid fa-trash" />
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
        <div style={{ borderRadius: 12, border: '1px solid #dbeafe', background: '#f8fbff', padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Kosul
              </div>
            </div>
            <button className="btn-o" type="button" onClick={onAddCondition}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Kosul Ekle
            </button>
          </div>
          {conditions.length === 0 ? (
            <div style={{ borderRadius: 10, border: '1px dashed #bfdbfe', padding: 10, color: '#64748b', fontSize: '.84rem' }}>
              Henuz kosul eklenmedi.
            </div>
          ) : conditions.map((condition, index) => {
            const pseudoRule = {
              ...rule,
              conditionKey: condition.conditionKey,
              conditionConfig: getStandaloneConditionConfig(condition.conditionConfig),
            }
            const conditionStatus = getConditionRuntimeStatus(condition.conditionKey)
            return (
              <div key={condition.id} style={{ display: 'grid', gap: 8 }}>
                <div style={{ borderRadius: 10, border: '1px solid #dbeafe', background: '#fff', padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>{getConditionMeta(condition.conditionKey).label}</div>
                        <RuntimeStatusBadge status={conditionStatus} compact />
                      </div>
                      <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                        {buildRuleConditionText(pseudoRule, summaryContext)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn-o" type="button" onClick={() => onEditCondition(condition.id)}>Duzenle</button>
                      <button className="btn-danger" type="button" onClick={() => onDeleteCondition(condition.id)}><i className="fa-solid fa-trash" /></button>
                    </div>
                  </div>
                </div>
                {index < conditions.length - 1 ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                      <button
                        type="button"
                        onClick={() => onToggleConditionJoiner('and')}
                        style={{
                          border: 'none',
                          borderRadius: 999,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: '.7rem',
                          fontWeight: 900,
                          background: conditionJoinerMode === 'and' ? '#2563eb' : 'transparent',
                          color: conditionJoinerMode === 'and' ? '#fff' : '#1d4ed8',
                        }}
                      >
                        VE
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleConditionJoiner('or')}
                        style={{
                          border: 'none',
                          borderRadius: 999,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontSize: '.7rem',
                          fontWeight: 900,
                          background: conditionJoinerMode === 'or' ? '#2563eb' : 'transparent',
                          color: conditionJoinerMode === 'or' ? '#fff' : '#1d4ed8',
                        }}
                      >
                        VEYA
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
        <div style={{ borderRadius: 12, border: '1px solid #fde68a', background: '#fffaf0', padding: 12, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#b45309', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Eylem
              </div>
            </div>
            <button className="btn-o" type="button" onClick={onAddAction}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Eylem Ekle
            </button>
          </div>
          {actions.length === 0 ? (
            <div style={{ borderRadius: 10, border: '1px dashed #fde68a', padding: 10, color: '#64748b', fontSize: '.84rem' }}>
              Henuz eylem eklenmedi.
            </div>
          ) : actions.map((action, index) => {
            const pseudoRule = {
              ...rule,
              actionType: action.actionType,
              actionSummary: action.actionSummary,
              actionConfig: getStandaloneActionConfig(action.actionConfig),
            }
            const actionStatus = getActionRuntimeStatus(action.actionType)
            return (
              <div key={action.id} style={{ display: 'grid', gap: 8 }}>
                <div style={{ borderRadius: 10, border: '1px solid #fde68a', background: '#fff', padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a' }}>{getOptionLabel(ACTION_TYPE_OPTIONS, action.actionType)}</div>
                        <RuntimeStatusBadge status={actionStatus} compact />
                      </div>
                      <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                        {String(action.actionSummary || '').trim() || buildActionSummary(pseudoRule, summaryContext)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn-o" type="button" onClick={() => onEditAction(action.id)}>Duzenle</button>
                      <button className="btn-danger" type="button" onClick={() => onDeleteAction(action.id)}><i className="fa-solid fa-trash" /></button>
                    </div>
                  </div>
                </div>
                {index < actions.length - 1 ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ padding: '6px 12px', borderRadius: 999, border: '1px solid #fde68a', background: '#fff7ed', color: '#b45309', fontSize: '.74rem', fontWeight: 900 }}>
                      VE
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function EditorModal({ title, subtitle = '', onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(920px, 100%)', maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', padding: 0, boxShadow: '0 24px 60px rgba(15,23,42,.24)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>{subtitle}</div> : null}
          </div>
          <button className="btn-o" type="button" onClick={onClose}>Kapat</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', maxHeight: 'calc(100vh - 140px)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function CouponSeriesCard({ series, onChange, onRefreshCodes, onDelete }) {
  const [showCodes, setShowCodes] = useState(false)
  const previewCodes = series.codes.slice(0, 3)

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(series.codes.join('\n'))
    } catch {
      // no-op: clipboard availability depends on runtime context
    }
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{series.name || 'Kupon Serisi'}</div>
          <div style={{ marginTop: 4, fontSize: '.78rem', color: '#64748b' }}>
            {series.codes.length} kod, on ek: <strong>{series.prefix}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <MiniBadge active={series.active} trueLabel="Aktif" falseLabel="Pasif" />
          <button className="btn-o" onClick={onRefreshCodes}>Kodlari Yenile</button>
          <button className="btn-danger" onClick={onDelete}>Sil</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.8fr 0.9fr', gap: 10, marginTop: 12 }}>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Seri Adi</div>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>On Ek</div>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Kupon Sayisi</div>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Rastgele Uzunluk</div>
        <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>Karakter Seti</div>
        <input className="f-input" value={series.name} onChange={event => onChange('name', event.target.value)} placeholder="Seri adi" />
        <input className="f-input" value={series.prefix} onChange={event => onChange('prefix', event.target.value)} placeholder="On ek" />
        <input className="f-input" type="number" min={1} value={formatNumberInputValue(series.couponCount)} onChange={event => onChange('couponCount', event.target.value)} placeholder="Adet" disabled={series.singleCoupon} />
        <input className="f-input" type="number" min={1} value={formatNumberInputValue(series.randomLength)} onChange={event => onChange('randomLength', event.target.value)} placeholder="Uzunluk" />
        <div className="sel-wrap">
          <select className="f-input" value={series.charset} onChange={event => onChange('charset', event.target.value)}>
            {COUPON_CHARSET_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
          <input type="checkbox" checked={series.singleCoupon} onChange={event => onChange('singleCoupon', event.target.checked)} />
          Tek kupon
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
          <input type="checkbox" checked={series.useAfterCheckout} onChange={event => onChange('useAfterCheckout', event.target.checked)} />
          Siparisi kapattiktan sonra kuponu kullan
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
          <input type="checkbox" checked={series.active} onChange={event => onChange('active', event.target.checked)} />
          Aktif
        </label>
      </div>

      <div style={{ marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.78rem', fontWeight: 800, color: '#475569' }}>Olusan Kodlar</div>
            <div style={{ marginTop: 4, fontSize: '.75rem', color: '#64748b' }}>
              {series.codes.length === 0
                ? 'Henuz kod uretilmedi'
                : `${series.codes.length} kod hazir. Yonetim ekrani temiz kalsin diye liste ozetlenmis gorunuyor.`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-o" type="button" onClick={() => setShowCodes(current => !current)} disabled={series.codes.length === 0}>
              {showCodes ? 'Kodlari Gizle' : 'Kodlari Goster'}
            </button>
            <button className="btn-o" type="button" onClick={copyCodes} disabled={series.codes.length === 0}>
              Tumunu Kopyala
            </button>
          </div>
        </div>

        {previewCodes.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {previewCodes.map(code => (
              <span key={code} style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: '#fff',
                border: '1px solid #dbeafe',
                color: '#1e3a8a',
                fontSize: '.75rem',
                fontWeight: 700,
                maxWidth: 320,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {code}
              </span>
            ))}
            {series.codes.length > previewCodes.length && (
              <span style={{
                padding: '6px 10px',
                borderRadius: 999,
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                color: '#1d4ed8',
                fontSize: '.75rem',
                fontWeight: 800,
              }}>
                +{series.codes.length - previewCodes.length} kod daha
              </span>
            )}
          </div>
        )}

        {showCodes && series.codes.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <textarea
              className="f-input"
              rows={Math.min(Math.max(series.codes.length, 6), 14)}
              readOnly
              value={series.codes.join('\n')}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '.74rem',
                lineHeight: 1.55,
                whiteSpace: 'pre',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function safeMapWithDiagnostics(items = [], mapper, issuePrefix) {
  const diagnostics = []
  const results = []

  ;(items || []).forEach((item, index) => {
    try {
      results.push(mapper(item, index))
    } catch (error) {
      diagnostics.push({
        code: `${issuePrefix}_${index}`,
        message: error?.message || `${issuePrefix} map failed`,
      })
    }
  })

  return { results, diagnostics }
}

export default function LoyaltyManagement() {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { campaignId } = useParams()
  const workspace = useWorkspace()
  const newCampaignInitializedRef = useRef(false)
  const pendingCampaignIdRef = useRef('')
  const draftCampaignBufferRef = useRef(new Map())
  const draftCampaignFromRoute = location.state?.draftCampaign
    ? normalizeCampaign(location.state.draftCampaign)
    : null

  const isListMode = location.pathname === '/sadakat'
  const isNewCampaignMode = location.pathname === '/sadakat/kampanya/yeni'
  const isEditorMode = location.pathname.startsWith('/sadakat/kampanya/')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [program, setProgram] = useState(normalizeProgram(DEFAULT_LOYALTY_PROGRAM))
  const [tiers, setTiers] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [referralPrograms, setReferralPrograms] = useState([])
  const [customerCategories, setCustomerCategories] = useState([])
  const [categoryAudienceAssignments, setCategoryAudienceAssignments] = useState([])
  const [categoryAudienceCounts, setCategoryAudienceCounts] = useState({})
  const [couponSeries, setCouponSeries] = useState([])
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [editorTab, setEditorTab] = useState('general')
  const [activeRuleTab, setActiveRuleTab] = useState('applicable')
  const [ruleEditorState, setRuleEditorState] = useState(null)
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all')
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignAudienceFilter, setCampaignAudienceFilter] = useState('all')
  const [salesChannels, setSalesChannels] = useState(CAMPAIGN_CHANNEL_OPTIONS.map(option => ({ value: option.value, label: option.label })))
  const [saleItems, setSaleItems] = useState([])
  const [saleCategories, setSaleCategories] = useState([])
  const [saleTemplates, setSaleTemplates] = useState([])
  const [branchTemplates, setBranchTemplates] = useState([])
  const [showCampaignAdvanced, setShowCampaignAdvanced] = useState(false)
  const [schemaReady, setSchemaReady] = useState(false)
  const [categorySchemaReady, setCategorySchemaReady] = useState(false)
  const [customerSchemaReady, setCustomerSchemaReady] = useState(false)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [usingSessionSnapshot, setUsingSessionSnapshot] = useState(false)
  const [loadDiagnostics, setLoadDiagnostics] = useState([])
  const [conditionLibraryPreviewKey, setConditionLibraryPreviewKey] = useState(CONDITION_LIBRARY[0]?.key || 'always')

  const availableAudienceOptions = useMemo(
    () => CAMPAIGN_AUDIENCE_OPTIONS.filter(option => option.value !== 'tagged_customers'),
    [],
  )
  const workspaceCacheKey = useMemo(
    () => buildLoyaltyWorkspaceCacheKey({
      scope: workspace.scope,
      branchId: workspace.branchId,
      branchName: workspace.branchName,
    }),
    [workspace.scope, workspace.branchId, workspace.branchName],
  )
  const [scopeInfo, setScopeInfo] = useState(null)
  const [customerInsights, setCustomerInsights] = useState({
    totalCustomers: 0,
    reachableCustomers: 0,
    loyaltyMembers: 0,
    birthdayKnown: 0,
    consentReady: 0,
    mobileLinked: 0,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const workspacePayload = {
          scope: workspace.scope,
          branchId: workspace.branchId,
          branchName: workspace.branchName,
        }
        const cachedSnapshot = loyaltyWorkspaceSessionCache.get(workspaceCacheKey) || readWorkspaceSessionSnapshot(workspaceCacheKey) || null
        const scopeFallback = getLoyaltyScopeInfo(workspacePayload)
        setScopeInfo(scopeFallback)

        const [workspaceResult, categoryResult, categoryAudienceResult] = await Promise.allSettled([
          loadLoyaltyWorkspaceWithRetry(workspacePayload),
          loadLoyaltyCustomerCategories(workspacePayload),
          loadLoyaltyCustomerCategoryAudience(workspacePayload),
        ])

        if (cancelled) return

        const result = workspaceResult.status === 'fulfilled'
          ? workspaceResult.value
          : {
              scopeInfo: scopeFallback,
              schemaReady: false,
              customerSchemaReady: false,
              databaseUnavailable: true,
              program: DEFAULT_LOYALTY_PROGRAM,
              tiers: [],
              campaigns: [],
              couponSeries: [],
              customerInsights: {
                totalCustomers: 0,
                reachableCustomers: 0,
                loyaltyMembers: 0,
                birthdayKnown: 0,
                consentReady: 0,
                mobileLinked: 0,
              },
            }
        const safeCategoryResult = categoryResult.status === 'fulfilled'
          ? categoryResult.value
          : {
              categories: [],
              schemaReady: false,
            }
        const safeCategoryAudienceResult = categoryAudienceResult.status === 'fulfilled'
          ? categoryAudienceResult.value
          : {
              assignments: [],
              countsByCategoryId: {},
            }

        const campaignHydration = safeMapWithDiagnostics(
          result.campaigns || [],
          item => hydrateCampaignForEditor(item),
          'campaign_hydration',
        )
        const tierHydration = safeMapWithDiagnostics(
          result.tiers || [],
          item => normalizeTier(item),
          'tier_hydration',
        )
        const categoryHydration = safeMapWithDiagnostics(
          safeCategoryResult.categories || [],
          item => normalizeCustomerCategory(item),
          'category_hydration',
        )
        const couponSeriesHydration = safeMapWithDiagnostics(
          result.couponSeries || [],
          item => normalizeCouponSeries(item),
          'coupon_series_hydration',
        )
        const diagnostics = [
          ...(result.schemaIssues || []),
          ...campaignHydration.diagnostics,
          ...tierHydration.diagnostics,
          ...categoryHydration.diagnostics,
          ...couponSeriesHydration.diagnostics,
        ]
        if (workspaceResult.status === 'rejected') {
          diagnostics.push({
            code: 'loyalty_workspace_rejected',
            message: String(workspaceResult.reason?.message || workspaceResult.reason || 'Workspace promise rejected'),
          })
        }
        if (categoryResult.status === 'rejected') {
          diagnostics.push({
            code: 'loyalty_categories_rejected',
            message: String(categoryResult.reason?.message || categoryResult.reason || 'Category promise rejected'),
          })
        }
        if (categoryAudienceResult.status === 'rejected') {
          diagnostics.push({
            code: 'loyalty_category_audience_rejected',
            message: String(categoryAudienceResult.reason?.message || categoryAudienceResult.reason || 'Category audience promise rejected'),
          })
        }
        const safeCampaigns = campaignHydration.results
        const nextSnapshot = {
          scopeInfo: result.scopeInfo,
          schemaReady: Boolean(result.schemaReady),
          categorySchemaReady: Boolean(safeCategoryResult.schemaReady),
          customerSchemaReady: Boolean(result.customerSchemaReady),
          databaseUnavailable: Boolean(result.databaseUnavailable),
          program: normalizeProgram(result.program || DEFAULT_LOYALTY_PROGRAM),
          tiers: tierHydration.results,
          campaigns: safeCampaigns,
          customerCategories: categoryHydration.results,
          categoryAudienceAssignments: safeCategoryAudienceResult.assignments || [],
          categoryAudienceCounts: safeCategoryAudienceResult.countsByCategoryId || {},
          couponSeries: couponSeriesHydration.results,
          referralPrograms: result.referralPrograms || [],
          customerInsights: result.customerInsights,
        }
        const degradedWorkspaceRead = !nextSnapshot.schemaReady || nextSnapshot.databaseUnavailable
        const shouldKeepLastGoodSnapshot = degradedWorkspaceRead && cachedSnapshot?.schemaReady && Array.isArray(cachedSnapshot.campaigns)
        const activeSnapshot = shouldKeepLastGoodSnapshot
          ? cachedSnapshot
          : nextSnapshot
        const activeDiagnostics = shouldKeepLastGoodSnapshot
          ? [
              ...diagnostics,
              {
                code: 'session_snapshot_active',
                message: 'Production read gecici olarak bozuldu. Son basarili oturum verisi korunuyor; ekran sifirlanmadi.',
              },
            ]
          : diagnostics

        setScopeInfo(activeSnapshot.scopeInfo || scopeFallback)
        setSchemaReady(Boolean(activeSnapshot.schemaReady))
        setCategorySchemaReady(Boolean(activeSnapshot.categorySchemaReady))
        setCustomerSchemaReady(Boolean(activeSnapshot.customerSchemaReady))
        setDatabaseUnavailable(Boolean(shouldKeepLastGoodSnapshot || activeSnapshot.databaseUnavailable))
        setUsingSessionSnapshot(Boolean(shouldKeepLastGoodSnapshot))
        setProgram(activeSnapshot.program)
        setTiers(activeSnapshot.tiers)
        setCampaigns(activeSnapshot.campaigns)
        setReferralPrograms(activeSnapshot.referralPrograms || [])
        setCustomerCategories(activeSnapshot.customerCategories)
        setCategoryAudienceAssignments(activeSnapshot.categoryAudienceAssignments)
        setCategoryAudienceCounts(activeSnapshot.categoryAudienceCounts)
        setCouponSeries(activeSnapshot.couponSeries)
        setCustomerInsights(activeSnapshot.customerInsights)
        setLoadDiagnostics(activeDiagnostics)
        setSelectedCampaignId(current => {
          if (current && activeSnapshot.campaigns.some(campaign => campaign.id === current)) return current
          return activeSnapshot.campaigns[0]?.id || ''
        })
        setLoading(false)

        if (!degradedWorkspaceRead) {
          loyaltyWorkspaceSessionCache.set(workspaceCacheKey, nextSnapshot)
          writeWorkspaceSessionSnapshot(workspaceCacheKey, nextSnapshot)
        }

        if (workspaceResult.status === 'rejected') {
          toast(workspaceResult.reason?.message || 'Sadakat kampanyalari okunurken hata olustu', 'error')
        } else if (shouldKeepLastGoodSnapshot) {
          toast('Sadakat verisi tekrar okunamadi. Son basarili liste korunuyor.', 'info')
        }

        Promise.all([
          db.from('sales_channels').select('id,name,deleted_at').is('deleted_at', null).order('sort_order').order('name'),
          db.from('sale_items').select('id,name,sku,deleted_at').is('deleted_at', null).order('name'),
          db.from('sale_categories').select('id,name,deleted_at').is('deleted_at', null).order('name'),
          db.from('sale_templates').select('id,name,description,sale_ids').order('name'),
          db.from('branch_templates').select('id,name,branch_ids,deleted_at').is('deleted_at', null).order('name'),
        ]).then(([salesChannelResult, saleItemsResult, saleCategoriesResult, saleTemplatesResult, branchTemplatesResult]) => {
          if (cancelled) return
          if (!salesChannelResult.error && Array.isArray(salesChannelResult.data) && salesChannelResult.data.length > 0) {
            setSalesChannels(salesChannelResult.data.map(channel => ({
              value: normalizeCampaignChannelTarget(channel.name),
              label: channel.name,
            })))
          }
          if (!saleItemsResult.error && Array.isArray(saleItemsResult.data)) {
            setSaleItems(saleItemsResult.data.map(item => ({
              id: String(item.id),
              name: item.name || '',
              sku: item.sku || '',
            })))
          }
          if (!saleCategoriesResult.error && Array.isArray(saleCategoriesResult.data)) {
            setSaleCategories(saleCategoriesResult.data.map(category => ({
              id: String(category.id),
              name: category.name || '',
            })))
          }
          if (!saleTemplatesResult.error && Array.isArray(saleTemplatesResult.data)) {
            setSaleTemplates(saleTemplatesResult.data.map(template => ({
              id: String(template.id),
              name: template.name || '',
              description: template.description || '',
              saleIds: Array.isArray(template.sale_ids) ? template.sale_ids.map(value => String(value)) : [],
            })))
          }
          if (!branchTemplatesResult.error && Array.isArray(branchTemplatesResult.data)) {
            setBranchTemplates(branchTemplatesResult.data)
          }
        }).catch(() => {
          // auxiliary lookups should not block editor entry
        })
      } catch (error) {
        if (!cancelled) toast(error?.message || 'Sadakat altyapisi yuklenemedi', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [toast, workspace.scope, workspace.branchId, workspace.branchName, workspaceCacheKey])

  useEffect(() => {
    if (selectedCampaignId && campaigns.some(campaign => campaign.id === selectedCampaignId)) return
    setSelectedCampaignId(campaigns[0]?.id || '')
  }, [campaigns, selectedCampaignId])

  useEffect(() => {
    if (!isNewCampaignMode) newCampaignInitializedRef.current = false
  }, [isNewCampaignMode])

  useEffect(() => {
    if (!pendingCampaignIdRef.current) return
    if (campaigns.some(campaign => campaign.id === pendingCampaignIdRef.current)) {
      draftCampaignBufferRef.current.delete(pendingCampaignIdRef.current)
      pendingCampaignIdRef.current = ''
    }
  }, [campaigns])

  useEffect(() => {
    if (isNewCampaignMode) {
      if (newCampaignInitializedRef.current) return
      newCampaignInitializedRef.current = true
      const bufferedDraft = pendingCampaignIdRef.current
        ? draftCampaignBufferRef.current.get(pendingCampaignIdRef.current)
        : null
      const nextCampaign = draftCampaignFromRoute || bufferedDraft || createCampaignDraft()
      pendingCampaignIdRef.current = nextCampaign.id
      draftCampaignBufferRef.current.set(nextCampaign.id, nextCampaign)
      setCampaigns(current => (
        current.some(campaign => campaign.id === nextCampaign.id)
          ? current
          : [...current, nextCampaign]
      ))
      setSelectedCampaignId(nextCampaign.id)
      setShowCampaignAdvanced(false)
      setEditorTab('general')
      navigate(`/sadakat/kampanya/${nextCampaign.id}`, {
        replace: true,
        state: { draftCampaign: nextCampaign },
      })
      return
    }

    if (loading) return

    if (!isEditorMode || !campaignId) return

    const exists = campaigns.some(campaign => campaign.id === campaignId)
    if (exists) {
      setSelectedCampaignId(campaignId)
      return
    }

    if (draftCampaignFromRoute?.id === campaignId) {
      draftCampaignBufferRef.current.set(draftCampaignFromRoute.id, draftCampaignFromRoute)
      setCampaigns(current => (
        current.some(campaign => campaign.id === draftCampaignFromRoute.id)
          ? current
          : [...current, draftCampaignFromRoute]
      ))
      setSelectedCampaignId(campaignId)
      setShowCampaignAdvanced(false)
      return
    }

    const bufferedDraft = draftCampaignBufferRef.current.get(campaignId)
    if (bufferedDraft) {
      setCampaigns(current => (
        current.some(campaign => campaign.id === bufferedDraft.id)
          ? current
          : [...current, bufferedDraft]
      ))
      setSelectedCampaignId(campaignId)
      setShowCampaignAdvanced(false)
      return
    }

    if (selectedCampaignId && campaigns.some(campaign => campaign.id === selectedCampaignId)) {
      navigate(`/sadakat/kampanya/${selectedCampaignId}`, { replace: true })
      return
    }

    if (pendingCampaignIdRef.current === campaignId) return

    navigate('/sadakat', { replace: true })
  }, [campaignId, campaigns, draftCampaignFromRoute, isEditorMode, isNewCampaignMode, loading, navigate, selectedCampaignId])

  const selectedCampaign = useMemo(
    () => campaigns.find(campaign => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId],
  )

  const activeRuleEditorCampaign = useMemo(
    () => campaigns.find(campaign => campaign.id === ruleEditorState?.campaignId) || null,
    [campaigns, ruleEditorState?.campaignId],
  )

  const activeRuleEditorRule = useMemo(() => {
    if (!activeRuleEditorCampaign || !ruleEditorState?.ruleId) return null
    const ruleKey = ruleEditorState.scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    return (activeRuleEditorCampaign[ruleKey] || []).find(rule => rule.id === ruleEditorState.ruleId) || null
  }, [activeRuleEditorCampaign, ruleEditorState])

  const activeRuleEditorItem = useMemo(() => {
    if (!activeRuleEditorRule) return null
    if (ruleEditorState?.mode === 'actions') {
      return getEditorRuleActions(activeRuleEditorRule).find(item => item.id === (ruleEditorState.itemId || activeRuleEditorRule.id)) || null
    }
    return getEditorRuleConditions(activeRuleEditorRule).find(item => item.id === (ruleEditorState.itemId || activeRuleEditorRule.id)) || null
  }, [activeRuleEditorRule, ruleEditorState])
  const selectedConditionLibraryItem = useMemo(
    () => CONDITION_LIBRARY.find(item => item.key === conditionLibraryPreviewKey) || CONDITION_LIBRARY[0] || null,
    [conditionLibraryPreviewKey],
  )

  useEffect(() => {
    if (ruleEditorState?.mode !== 'conditions') return
    if (!activeRuleEditorItem?.conditionKey) return
    setConditionLibraryPreviewKey(activeRuleEditorItem.conditionKey)
  }, [activeRuleEditorItem?.conditionKey, ruleEditorState?.mode])

  function openRuleEditor(mode, scope, ruleId, itemId = null, campaignOverrideId = null) {
    const resolvedCampaignId = campaignOverrideId || selectedCampaignId
    if (!resolvedCampaignId || !ruleId) return
    setRuleEditorState({
      campaignId: resolvedCampaignId,
      scope,
      ruleId,
      itemId: itemId || ruleId,
      mode,
    })
  }

  function closeRuleEditor() {
    setRuleEditorState(null)
  }

  const filteredCampaigns = useMemo(() => campaigns.filter(campaign => {
    if (campaignStatusFilter === 'active' && !campaign.active) return false
    if (campaignStatusFilter === 'passive' && campaign.active) return false
    if (campaignAudienceFilter !== 'all' && campaign.audienceType !== campaignAudienceFilter) return false

    const search = campaignSearch.trim().toLowerCase()
    if (!search) return true

    return [
      campaign.name,
      campaign.code,
      campaign.description,
      getOptionLabel(CAMPAIGN_TRIGGER_OPTIONS, campaign.triggerType),
      getOptionLabel(CAMPAIGN_TYPE_OPTIONS, campaign.campaignType),
    ]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(search))
  }), [campaignAudienceFilter, campaignSearch, campaignStatusFilter, campaigns])

  const campaignStats = useMemo(() => ({
    all: campaigns.length,
    active: campaigns.filter(campaign => campaign.active).length,
    passive: campaigns.filter(campaign => !campaign.active).length,
  }), [campaigns])

  const ruleSummaryContext = useMemo(() => ({
    campaigns,
    couponSeries,
    customerCategories,
    saleItems,
    salesChannels,
  }), [campaigns, couponSeries, customerCategories, saleItems, salesChannels])

  const summaryText = useMemo(() => {
    if (!selectedCampaign) return ''

    const headline = String(selectedCampaign.description || '').trim() || selectedCampaign.name || 'Adsiz kampanya'
    const parts = [headline]

    const dateParts = [formatSummaryDate(selectedCampaign.startsAt), formatSummaryDate(selectedCampaign.endsAt)].filter(Boolean)
    if (dateParts.length === 2) {
      parts.push(`${dateParts[0]} ile ${dateParts[1]} arasinda`)
    } else if (dateParts.length === 1) {
      parts.push(`${dateParts[0]} itibariyla`)
    }

    let audienceLabel = getOptionLabel(CAMPAIGN_AUDIENCE_OPTIONS, selectedCampaign.audienceType, 'Tum Musteriler')
    audienceLabel = `${audienceLabel.toLowerCase()} icin`
    parts.push(audienceLabel)

    const channels = (selectedCampaign.channelTargets || []).map(value => getChannelLabel(value, salesChannels))
    if (channels.length > 0) parts.push(`${channels.join(', ')} kanallarinda`)
    parts.push(`${getOptionLabel(CAMPAIGN_APPLICATION_MODE_OPTIONS, selectedCampaign.applicationMode, 'Kasiyere sor').toLowerCase()} akisi ile`)

    const conditionSummaries = [...(selectedCampaign.applicableRules || []), ...(selectedCampaign.periodicRules || [])]
      .flatMap(rule => getEditorRuleConditionSummaries(rule, ruleSummaryContext))
    const actionSummaries = [...(selectedCampaign.applicableRules || []), ...(selectedCampaign.periodicRules || [])]
      .flatMap(rule => getEditorRuleActionSummaries(rule, ruleSummaryContext))

    if (conditionSummaries.length > 0) parts.push(`su kosullarda gecerlidir: ${conditionSummaries.join('; ')}`)
    if (actionSummaries.length > 0) parts.push(`uygulanacak eylemler: ${actionSummaries.join(', ')}`)

    const sentence = parts.join(', ').replace(/\s+,/g, ',').trim()
    return sentence.endsWith('.') ? sentence : `${sentence}.`
  }, [customerCategories, ruleSummaryContext, salesChannels, selectedCampaign])

  const activeCustomerCategories = useMemo(
    () => customerCategories.filter(category => category.active),
    [customerCategories],
  )

  useEffect(() => {
    if (!ruleEditorState) return
    if (activeRuleEditorCampaign && activeRuleEditorRule && activeRuleEditorItem) return
    setRuleEditorState(null)
  }, [activeRuleEditorCampaign, activeRuleEditorItem, activeRuleEditorRule, ruleEditorState])

  const selectedAudienceCustomerCount = useMemo(() => {
    if (!selectedCampaign || !usesLegacyCategoryAudience(selectedCampaign)) return 0
    const selectedCategoryIds = (selectedCampaign.audienceCategoryIds || []).map(value => String(value))
    if (selectedCategoryIds.length === 0) return 0

    return new Set(
      categoryAudienceAssignments
        .filter(item => selectedCategoryIds.includes(String(item.categoryId)))
        .map(item => String(item.customerId)),
    ).size
  }, [categoryAudienceAssignments, selectedCampaign])

  const campaignStructure = useMemo(() => {
    if (!selectedCampaign) return []

    const dateParts = [formatSummaryDate(selectedCampaign.startsAt), formatSummaryDate(selectedCampaign.endsAt)].filter(Boolean)
    const scheduleLabel = dateParts.length === 2
      ? `${dateParts[0]} - ${dateParts[1]}`
      : (dateParts[0] || 'Tarih siniri yok')

    const channels = (selectedCampaign.channelTargets || []).map(value => getChannelLabel(value, salesChannels)).filter(Boolean)
    const conditionSummaries = [
      ...(selectedCampaign.applicableRules || []).flatMap(rule => getEditorRuleConditionSummaries(rule, ruleSummaryContext)),
      ...(selectedCampaign.periodicRules || []).flatMap(rule => getEditorRuleConditionSummaries(rule, ruleSummaryContext)),
    ]
    const actionSummaries = [
      ...(selectedCampaign.applicableRules || []).flatMap(rule => getEditorRuleActionSummaries(rule, ruleSummaryContext)),
      ...(selectedCampaign.periodicRules || []).flatMap(rule => getEditorRuleActionSummaries(rule, ruleSummaryContext)),
    ]

    return [
      {
        key: 'schedule',
        title: '1. Ne Zaman',
        value: scheduleLabel,
        hint: 'Kampanyanin aktif olacagi tarih araligi',
        ready: Boolean(selectedCampaign.startsAt || selectedCampaign.endsAt),
      },
      {
        key: 'audience',
        title: '2. Kimlere',
        value: buildAudienceSummary(selectedCampaign, customerCategories, usesLegacyCategoryAudience(selectedCampaign) ? selectedAudienceCustomerCount : null),
        hint: usesLegacyCategoryAudience(selectedCampaign)
          ? `Legacy kategori hedefi bulundu. Kosullar sekmesinden tasimaniz onerilir. Eslesen musteri: ${selectedAudienceCustomerCount}`
          : 'Tum musteriler veya secili hedef kitle',
        ready: true,
      },
      {
        key: 'channels',
        title: '3. Nerelerde',
        value: channels.length > 0 ? channels.join(', ') : 'Tum kanallar',
        hint: 'POS, kiosk, online ve mobil kanallari',
        ready: true,
      },
      {
        key: 'conditions',
        title: '4. Kasa Akisi',
        value: getOptionLabel(CAMPAIGN_APPLICATION_MODE_OPTIONS, selectedCampaign.applicationMode, 'Kasiyere sor'),
        hint: getCampaignApplicationModeHint(selectedCampaign.applicationMode),
        ready: true,
      },
      {
        key: 'conditions',
        title: '5. Hangi Kosullarda',
        value: conditionSummaries.length > 0 ? conditionSummaries.join('; ') : 'Henuz kosul tanimlanmadi',
        hint: 'Birden fazla kosulu VE / VEYA ile baglayabilirsiniz',
        ready: conditionSummaries.length > 0,
      },
      {
        key: 'actions',
        title: '6. Sonucunda Ne Yap',
        value: actionSummaries.length > 0 ? actionSummaries.join(', ') : 'Henuz eylem tanimlanmadi',
        hint: 'Indirim, puan, urun, kupon veya musteri kategorisi eylemleri',
        ready: actionSummaries.length > 0,
      },
    ]
  }, [customerCategories, ruleSummaryContext, salesChannels, selectedAudienceCustomerCount, selectedCampaign])

  const stats = useMemo(() => (
    [
      { label: 'Toplam Musteri', value: customerInsights.totalCustomers, accent: '#2563eb', hint: 'Musteri havuzu buyuklugu' },
      { label: 'Iletisim Hazir', value: customerInsights.reachableCustomers, accent: '#0f766e', hint: 'Telefon veya e-mail mevcut' },
      { label: 'Sadakat Kayitli', value: customerInsights.loyaltyMembers, accent: '#7c3aed', hint: customerSchemaReady ? 'Uye statusu islenmis' : 'SQL uygulaninca netlesir' },
      { label: 'Dogum Tarihi Var', value: customerInsights.birthdayKnown, accent: '#db2777', hint: customerSchemaReady ? 'Dogum gunu aksiyonlari icin' : 'Yeni alan bekliyor' },
      { label: 'Pazarlama Izni', value: customerInsights.consentReady, accent: '#b45309', hint: customerSchemaReady ? 'SMS / e-mail / push icin' : 'Yeni alan bekliyor' },
      { label: 'Mobil Eslesme', value: customerInsights.mobileLinked, accent: '#1d4ed8', hint: customerSchemaReady ? 'Online ve mobil baglantilar' : 'Yeni alan bekliyor' },
    ]
  ), [customerInsights, customerSchemaReady])

  function updateProgram(key, value) {
    setProgram(current => normalizeProgram({ ...current, [key]: value }))
  }

  function updateTier(tierId, key, value) {
    setTiers(current => current.map((tier, index) => (
      tier.id === tierId
        ? normalizeTier({ ...tier, [key]: value }, index)
        : tier
    )))
  }

  function addTier() {
    setTiers(current => [
      ...current,
      normalizeTier({
        id: createId('tier'),
        name: 'Yeni Kademe',
        code: `tier-${current.length + 1}`,
        minSpend: 0,
        minOrderCount: 0,
        pointsMultiplier: 1,
        birthdayBonusPoints: 0,
        benefitsSummary: '',
        color: '#1d4ed8',
        active: true,
        sortOrder: (current.length + 1) * 10,
      }, current.length),
    ])
  }

  function removeTier(tierId) {
    setTiers(current => current.filter(tier => tier.id !== tierId))
  }

  function updateCampaign(campaignId, key, value) {
    setCampaigns(current => current.map((campaign, index) => (
      campaign.id === campaignId
        ? normalizeCampaign({ ...campaign, [key]: value, programId: program.id }, index)
        : campaign
    )))
  }

  function toggleCampaignChannel(campaignId, channelValue) {
    setCampaigns(current => current.map((campaign, index) => {
      if (campaign.id !== campaignId) return campaign
      const currentChannels = Array.isArray(campaign.channelTargets) ? campaign.channelTargets : []
      const nextChannels = currentChannels.includes(channelValue)
        ? currentChannels.filter(value => value !== channelValue)
        : [...currentChannels, channelValue]
      return normalizeCampaign({ ...campaign, channelTargets: nextChannels, programId: program.id }, index)
    }))
  }

  function removeCampaignChannel(campaignId, channelValue) {
    const campaign = campaigns.find(item => item.id === campaignId)
    if (!campaign || !channelActive(campaign, channelValue)) return
    toggleCampaignChannel(campaignId, channelValue)
  }

  function createCampaignDraft() {
    return normalizeCampaign({
      id: createId('campaign'),
      programId: program.id,
      name: `Kampanya ${campaigns.length + 1}`,
      code: `campaign-${campaigns.length + 1}`,
      description: '',
      campaignType: 'bonus_points',
      triggerType: 'manual',
      rewardValue: 0,
      audienceType: 'all',
      channelTargets: [],
      startsAt: '',
      endsAt: '',
      priority: (campaigns.length + 1) * 10,
      stackable: false,
      active: true,
      applicableRules: [],
      periodicRules: [],
    }, campaigns.length)
  }

  function addCampaign(openEditor = false) {
    const nextCampaign = createCampaignDraft()
    if (openEditor) {
      pendingCampaignIdRef.current = nextCampaign.id
      draftCampaignBufferRef.current.set(nextCampaign.id, nextCampaign)
      setShowCampaignAdvanced(false)
      setEditorTab('general')
      navigate('/sadakat/kampanya/yeni', {
        state: { draftCampaign: nextCampaign },
      })
      return
    }
    setCampaigns(current => [...current, nextCampaign])
    setSelectedCampaignId(nextCampaign.id)
    setShowCampaignAdvanced(false)
  }

  function duplicateCampaign(campaignId) {
    const source = campaigns.find(item => item.id === campaignId)
    if (!source) return
    const duplicated = normalizeCampaign({
      ...source,
      id: createId('campaign'),
      code: `${source.code || source.name}-copy`,
      name: `${source.name} Kopya`,
      applicableRules: source.applicableRules.map(rule => ({ ...rule, id: createId('rule') })),
      periodicRules: source.periodicRules.map(rule => ({ ...rule, id: createId('rule') })),
    }, campaigns.length)
    setEditorTab('general')
    navigate(`/sadakat/kampanya/${duplicated.id}`, {
      state: { draftCampaign: duplicated },
    })
  }

  function removeCampaign(campaignId) {
    setCampaigns(current => current.filter(campaign => campaign.id !== campaignId))
    if (location.pathname !== '/sadakat') navigate('/sadakat')
  }

  function moveLegacyAudienceToConditions(campaignId) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId || !usesLegacyCategoryAudience(campaign)) return campaign

      const categoryIds = (campaign.audienceCategoryIds || []).map(value => String(value || '')).filter(Boolean)
      const patchLegacyRule = (rule, ruleIndex, scope) => {
        if (hasRuleLevelCategoryCondition(rule, 'customer_has_tag', categoryIds)) {
          return normalizeRule({ ...rule, scope }, ruleIndex, scope)
        }

        if (rule.conditionKey === 'always') {
          return normalizeRule({
            ...rule,
            scope,
            conditionKey: 'customer_has_tag',
            conditionConfig: {
              ...getDefaultConditionConfig('customer_has_tag'),
              tags: categoryIds,
              additionalConditions: rule.conditionConfig?.additionalConditions || [],
              additionalConditionsMode: rule.conditionConfig?.additionalConditionsMode || 'and',
            },
          }, ruleIndex, scope)
        }

        return normalizeRule({
          ...rule,
          scope,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            additionalConditionsMode: rule.conditionConfig?.additionalConditionsMode || 'and',
            additionalConditions: [
              ...(rule.conditionConfig?.additionalConditions || []),
              {
                id: createId('subcondition'),
                conditionKey: 'customer_has_tag',
                config: {
                  ...getDefaultConditionConfig('customer_has_tag'),
                  tags: categoryIds,
                },
              },
            ],
          },
        }, ruleIndex, scope)
      }

      const hasExistingRules = (campaign.applicableRules || []).length > 0 || (campaign.periodicRules || []).length > 0
      const nextApplicableRules = hasExistingRules
        ? (campaign.applicableRules || []).map((rule, ruleIndex) => patchLegacyRule(rule, ruleIndex, 'applicable'))
        : [
            normalizeRule({
              id: createId('rule'),
              scope: 'applicable',
              conditionKey: 'customer_has_tag',
              operator: 'gte',
              threshold: 0,
              period: 'all_time',
              actionType: 'bonus_points',
              actionSummary: '',
              active: true,
              stopProcessing: false,
              sortOrder: 10,
              conditionConfig: {
                ...getDefaultConditionConfig('customer_has_tag'),
                tags: categoryIds,
              },
            }, 0, 'applicable'),
          ]

      const nextPeriodicRules = hasExistingRules
        ? (campaign.periodicRules || []).map((rule, ruleIndex) => patchLegacyRule(rule, ruleIndex, 'periodic'))
        : []

      return normalizeCampaign({
        ...campaign,
        audienceType: 'all',
        audienceCategoryIds: [],
        applicableRules: nextApplicableRules,
        periodicRules: nextPeriodicRules,
        programId: program.id,
      }, campaignIndex)
    }))
    setEditorTab('conditions')
  }

  function addRule(campaignId, scope, mode = editorTab, initialConditionKey = null) {
    const nextRuleId = createId('rule')
    setCampaigns(current => current.map((campaign, index) => {
      if (campaign.id !== campaignId) return campaign
      const key = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextConditionKey = initialConditionKey || (scope === 'periodic' ? 'calendar_schedule' : 'birthday')
      const conditionConfig = {
        ...getDefaultConditionConfig(nextConditionKey),
        additionalConditions: [],
        __draftEmptyCondition: !initialConditionKey && mode !== 'conditions',
      }
      const nextRules = [
        ...(campaign[key] || []),
        normalizeRule({
          id: nextRuleId,
          scope,
          conditionKey: nextConditionKey,
          operator: 'gte',
          threshold: 0,
          period: 'all_time',
          actionType: 'bonus_points',
          actionSummary: '',
          active: true,
          stopProcessing: false,
          sortOrder: ((campaign[key] || []).length + 1) * 10,
          conditionConfig,
          actionConfig: {
            ...getDefaultActionConfig('bonus_points'),
            additionalActions: [],
            __draftEmptyAction: true,
          },
        }, (campaign[key] || []).length, scope),
      ]

      return normalizeCampaign({ ...campaign, [key]: nextRules, programId: program.id }, index)
    }))
    if (initialConditionKey) {
      openRuleEditor('conditions', scope, nextRuleId, nextRuleId, campaignId)
    }
  }

  function addConditionToRule(campaignId, scope, ruleId, conditionKey = scope === 'periodic' ? 'calendar_schedule' : 'birthday') {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        const currentConfig = rule.conditionConfig || {}
        if (currentConfig.__draftEmptyCondition) {
          return normalizeRule({
            ...rule,
            conditionKey,
            conditionConfig: {
              ...getDefaultConditionConfig(conditionKey),
              additionalConditions: Array.isArray(currentConfig.additionalConditions) ? currentConfig.additionalConditions : [],
              __draftEmptyCondition: false,
            },
            scope,
          }, ruleIndex, scope)
        }
        return normalizeRule({
          ...rule,
          conditionConfig: {
            ...currentConfig,
            additionalConditions: [
              ...(Array.isArray(currentConfig.additionalConditions) ? currentConfig.additionalConditions : []),
              {
                id: createId('subcondition'),
                conditionKey,
                config: getDefaultConditionConfig(conditionKey),
              },
            ],
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function addActionToRule(campaignId, scope, ruleId, actionType = 'bonus_points') {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        const currentConfig = rule.actionConfig || {}
        if (currentConfig.__draftEmptyAction) {
          return normalizeRule({
            ...rule,
            actionType,
            actionSummary: '',
            actionConfig: {
              ...getDefaultActionConfig(actionType),
              additionalActions: Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : [],
              __draftEmptyAction: false,
            },
            scope,
          }, ruleIndex, scope)
        }
        return normalizeRule({
          ...rule,
          actionConfig: {
            ...currentConfig,
            additionalActions: [
              ...(Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : []),
              {
                id: createId('extra-action'),
                actionType,
                actionSummary: '',
                actionConfig: getDefaultActionConfig(actionType),
              },
            ],
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function updateRuleConditionJoinerMode(campaignId, scope, ruleId, mode) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => (
        rule.id === ruleId
          ? normalizeRule({
            ...rule,
            conditionConfig: {
              ...(rule.conditionConfig || {}),
              additionalConditionsMode: mode === 'or' ? 'or' : 'and',
            },
            scope,
          }, ruleIndex, scope)
          : rule
      ))
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function removeConditionFromRule(campaignId, scope, ruleId, conditionId) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        const extras = Array.isArray(rule.conditionConfig?.additionalConditions) ? [...rule.conditionConfig.additionalConditions] : []
        if (conditionId === rule.id) {
          if (extras.length > 0) {
            const nextMain = extras.shift()
            return normalizeRule({
              ...rule,
              conditionKey: nextMain.conditionKey,
              conditionConfig: {
                ...(nextMain.config || {}),
                additionalConditions: extras,
                __draftEmptyCondition: false,
              },
              scope,
            }, ruleIndex, scope)
          }
          return normalizeRule({
            ...rule,
            conditionConfig: {
              ...(rule.conditionConfig || {}),
              additionalConditions: [],
              __draftEmptyCondition: true,
            },
            scope,
          }, ruleIndex, scope)
        }
        return normalizeRule({
          ...rule,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            additionalConditions: extras.filter(item => item.id !== conditionId),
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function removeActionFromRule(campaignId, scope, ruleId, actionId) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        const extras = Array.isArray(rule.actionConfig?.additionalActions) ? [...rule.actionConfig.additionalActions] : []
        if (actionId === rule.id) {
          if (extras.length > 0) {
            const nextMain = extras.shift()
            return normalizeRule({
              ...rule,
              actionType: nextMain.actionType,
              actionSummary: nextMain.actionSummary || '',
              actionConfig: {
                ...(nextMain.actionConfig || {}),
                additionalActions: extras,
                __draftEmptyAction: false,
              },
              scope,
            }, ruleIndex, scope)
          }
          return normalizeRule({
            ...rule,
            actionSummary: '',
            actionConfig: {
              ...(rule.actionConfig || {}),
              additionalActions: [],
              __draftEmptyAction: true,
            },
            scope,
          }, ruleIndex, scope)
        }
        return normalizeRule({
          ...rule,
          actionConfig: {
            ...(rule.actionConfig || {}),
            additionalActions: extras.filter(item => item.id !== actionId),
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function updateRule(campaignId, scope, ruleId, key, value) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => (
        rule.id === ruleId
          ? normalizeRule({
            ...rule,
            [key]: value,
            conditionConfig: key === 'conditionKey' ? getDefaultConditionConfig(value) : rule.conditionConfig,
            actionConfig: key === 'actionType' ? getDefaultActionConfig(value) : rule.actionConfig,
            scope,
          }, ruleIndex, scope)
          : rule
      ))
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function updateConditionItem(campaignId, scope, ruleId, conditionId, key, value) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        if (conditionId === rule.id) {
          return normalizeRule({
            ...rule,
            [key]: value,
            conditionConfig: key === 'conditionKey'
              ? { ...getDefaultConditionConfig(value), additionalConditions: Array.isArray(rule.conditionConfig?.additionalConditions) ? rule.conditionConfig.additionalConditions : [], __draftEmptyCondition: false }
              : { ...(rule.conditionConfig || {}), __draftEmptyCondition: false },
            scope,
          }, ruleIndex, scope)
        }
        return normalizeRule({
          ...rule,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            additionalConditions: (rule.conditionConfig?.additionalConditions || []).map(item => (
              item.id === conditionId
                ? {
                  ...item,
                  conditionKey: key === 'conditionKey' ? value : item.conditionKey,
                  config: key === 'conditionKey' ? getDefaultConditionConfig(value) : (item.config || {}),
                }
                : item
            )),
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function patchRuleConditionConfig(campaignId, scope, ruleId, patch) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        const nextConfig = typeof patch === 'function'
          ? patch(rule.conditionConfig || {})
          : { ...(rule.conditionConfig || {}), ...patch }
        return normalizeRule({ ...rule, conditionConfig: nextConfig, scope }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function patchConditionItemConfig(campaignId, scope, ruleId, conditionId, patch) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        if (conditionId === rule.id) {
          const nextConfig = typeof patch === 'function' ? patch(rule.conditionConfig || {}) : { ...(rule.conditionConfig || {}), ...patch }
          return normalizeRule({ ...rule, conditionConfig: { ...nextConfig, __draftEmptyCondition: false }, scope }, ruleIndex, scope)
        }
        const nextAdditionalConditions = (rule.conditionConfig?.additionalConditions || []).map(item => {
          if (item.id !== conditionId) return item
          const nextConfig = typeof patch === 'function' ? patch(item.config || {}) : { ...(item.config || {}), ...patch }
          return { ...item, config: nextConfig }
        })
        return normalizeRule({
          ...rule,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            additionalConditions: nextAdditionalConditions,
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function patchRuleActionConfig(campaignId, scope, ruleId, patch) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        const nextConfig = typeof patch === 'function'
          ? patch(rule.actionConfig || {})
          : { ...(rule.actionConfig || {}), ...patch }
        return normalizeRule({ ...rule, actionConfig: nextConfig, scope }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function updateActionItem(campaignId, scope, ruleId, actionId, key, value) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        if (actionId === rule.id) {
          return normalizeRule({
            ...rule,
            [key]: value,
            actionConfig: key === 'actionType'
              ? { ...getDefaultActionConfig(value), additionalActions: Array.isArray(rule.actionConfig?.additionalActions) ? rule.actionConfig.additionalActions : [], __draftEmptyAction: false }
              : { ...(rule.actionConfig || {}), __draftEmptyAction: false },
            scope,
          }, ruleIndex, scope)
        }
        return normalizeRule({
          ...rule,
          actionConfig: {
            ...(rule.actionConfig || {}),
            additionalActions: (rule.actionConfig?.additionalActions || []).map(item => (
              item.id === actionId
                ? {
                  ...item,
                  actionType: key === 'actionType' ? value : item.actionType,
                  actionSummary: key === 'actionSummary' ? value : item.actionSummary,
                  actionConfig: key === 'actionType' ? getDefaultActionConfig(value) : (item.actionConfig || {}),
                }
                : item
            )),
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function patchActionItemConfig(campaignId, scope, ruleId, actionId, patch) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).map((rule, ruleIndex) => {
        if (rule.id !== ruleId) return rule
        if (actionId === rule.id) {
          const nextConfig = typeof patch === 'function' ? patch(rule.actionConfig || {}) : { ...(rule.actionConfig || {}), ...patch }
          return normalizeRule({ ...rule, actionConfig: { ...nextConfig, __draftEmptyAction: false }, scope }, ruleIndex, scope)
        }
        const nextAdditionalActions = (rule.actionConfig?.additionalActions || []).map(item => {
          if (item.id !== actionId) return item
          const nextConfig = typeof patch === 'function' ? patch(item.actionConfig || {}) : { ...(item.actionConfig || {}), ...patch }
          return { ...item, actionConfig: nextConfig }
        })
        return normalizeRule({
          ...rule,
          actionConfig: {
            ...(rule.actionConfig || {}),
            additionalActions: nextAdditionalActions,
          },
          scope,
        }, ruleIndex, scope)
      })
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function createProductMask() {
    return { id: createId('mask'), itemId: '', name: '', type: 'product' }
  }

  function createOfferItem() {
    return { id: createId('offer'), itemId: '', name: '', type: 'product', size: '' }
  }

  function createPricingItem() {
    return { id: createId('pricing'), name: '', maskType: 'product', size: '', applyTo: 'all_matches', pricingType: 'discount_percent', value: 0 }
  }

  function createComboGroup() {
    return { id: createId('combo-group'), name: 'Yeni grup', isPrimary: false, items: [] }
  }

  function createComboGroupItem() {
    return { id: createId('combo-item'), type: 'product', name: '', size: '', blockedOptions: '', priceAdjustment: 0, position: 0 }
  }

  function createAdditionalCondition(conditionKey = CONDITION_LIBRARY[0]?.key || 'birthday') {
    return {
      id: createId('subcondition'),
      conditionKey,
      config: getDefaultConditionConfig(conditionKey),
    }
  }

  function patchAdditionalConditionConfig(campaignId, scope, ruleId, conditionId, patch) {
    patchRuleConditionConfig(campaignId, scope, ruleId, config => ({
      ...config,
      additionalConditions: (config.additionalConditions || []).map(condition => {
        if (condition.id !== conditionId) return condition
        const nextConfig = typeof patch === 'function'
          ? patch(condition.config || {})
          : { ...(condition.config || {}), ...patch }
        return { ...condition, config: nextConfig }
      }),
      }))
  }

  function renderCustomerCategoryGuide(title = 'Musteri kategorileri kaynagi') {
    return (
      <HelperNote
        title={title}
        action={(
          <button className="btn-o" type="button" onClick={() => navigate('/sadakat/kategoriler')}>
            Kategorileri Yonet
          </button>
        )}
      >
        {activeCustomerCategories.length > 0
          ? `Bu secim listesi Sadakat > Musteri Kategorileri ekranindaki aktif kayitlardan beslenir. Simdi ${activeCustomerCategories.length} aktif kategori var.`
          : 'Bu secim listesi Sadakat > Musteri Kategorileri ekranindaki aktif kayitlardan beslenir. Henuz aktif kategori olmadigi icin once oradan kategori tanimlamaniz gerekir.'}
      </HelperNote>
    )
  }

  function renderProductMasksEditor(rule, scope, label = 'Urun Sablonlari', options = {}) {
    const config = options.config || rule.conditionConfig || {}
    const patchCondition = options.onPatch || (patch => patchRuleConditionConfig(selectedCampaign.id, scope, rule.id, patch))
    const masks = Array.isArray(config?.productMasks) ? config.productMasks : []

    return (
      <div>
        <div style={{ fontSize: '.78rem', color: '#475569', fontWeight: 800, marginBottom: 8 }}>{label}</div>
        <div style={{ fontSize: '.74rem', color: '#94a3b8', lineHeight: 1.5, marginBottom: 8 }}>
          Bu alandan musteri kategorisi degil; urun, urun kategorisi / urun grubu veya satis mali sablonu secebilirsiniz.
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {masks.map(mask => (
            <div key={mask.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
              <FieldStack label="Urun / kategori / sablon">
                <CatalogMaskSelect
                  items={saleItems}
                  categories={saleCategories}
                  saleTemplates={saleTemplates}
                  value={mask.name}
                  itemId={mask.itemId}
                  selectionType={mask.type}
                  onSelect={({ itemId, name, type }) => patchCondition(current => ({
                    ...current,
                    productMasks: (current.productMasks || []).map(item => item.id === mask.id ? { ...item, itemId, name, type } : item),
                  }))}
                  placeholder="Urun / kategori / sablon secin"
                />
              </FieldStack>
              <button
                className="btn-danger"
                onClick={() => patchCondition(current => ({
                  ...current,
                  productMasks: (current.productMasks || []).filter(item => item.id !== mask.id),
                }))}
              >
                Sil
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn-o"
              onClick={() => patchCondition(current => ({
                ...current,
                productMasks: [...(current.productMasks || []), createProductMask()],
              }))}
            >
              + Olustur
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderConditionDetails(rule, scope, options = {}) {
    const conditionKey = options.conditionKey || rule.conditionKey
    const config = options.config || rule.conditionConfig || {}
    const patchCondition = options.onPatch || (patch => patchRuleConditionConfig(selectedCampaign.id, scope, rule.id, patch))
    let content = null

    switch (conditionKey) {
      case 'always':
        content = (
          <HelperNote title="Temel siparis kosulu">
            Bu kosul ek bir esik aramaz. Kampanya hedef kitlesi, kanal ve genel tarih araligi uyuyorsa her sipariste calisir. Ornek: `xxx` kategorisindeki musteriler her alisveriste `%10` puan kazansin.
          </HelperNote>
        )
        break
      case 'calendar_schedule':
        content = (
          <div style={{ display: 'grid', gap: 12 }}>
            <HelperNote title="Periyodik takvim kosulu">
              Bu kosul ozellikle `Zaman Bazli` sekmesinde gunluk, haftalik, aylik veya yillik tekrar eden kampanyalar icin kullanilir. Syrve'deki `Takvim` mantigina denk gelir.
            </HelperNote>
            <div style={{ display: 'grid', gap: 10 }}>
              {CALENDAR_FREQUENCY_OPTIONS.map(option => {
                const active = (config.frequency || 'daily') === option.value
                return (
                  <div key={option.value} style={{ display: 'grid', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.92rem', color: '#334155', fontWeight: 700 }}>
                      <input
                        type="radio"
                        name={`calendar-frequency-${rule.id}`}
                        checked={active}
                        onChange={() => patchCondition({ frequency: option.value })}
                      />
                      {option.label}
                    </label>

                    {active && option.value === 'weekly' ? (
                      <div style={{ border: '1px solid #dbeafe', borderRadius: 12, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: '#dbeafe', color: '#475569', fontSize: '.78rem', fontWeight: 800 }}>
                          {WEEKDAY_OPTIONS.map(day => (
                            <div key={day} style={{ padding: '8px 10px' }}>{day}</div>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: '#eff6ff' }}>
                          {WEEKDAY_OPTIONS.map((day, dayIndex) => (
                            <label key={`${option.value}-${day}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 8px' }}>
                              <input
                                type="checkbox"
                                checked={Boolean(config.weekdays?.[dayIndex])}
                                onChange={event => patchCondition(current => ({
                                  ...current,
                                  weekdays: Array.from({ length: 7 }, (_, index) => (
                                    index === dayIndex ? event.target.checked : Boolean(current.weekdays?.[index])
                                  )),
                                }))}
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {active && option.value === 'monthly' ? (
                      <div style={{ maxWidth: 220 }}>
                        <div className="sel-wrap">
                          <select className="f-input" value={String(config.dayOfMonth || 'last')} onChange={event => patchCondition({ dayOfMonth: event.target.value === 'last' ? 'last' : Number(event.target.value) })}>
                            {CALENDAR_DAY_OPTIONS.map(day => <option key={`monthly-${day.value}`} value={day.value}>{day.label}</option>)}
                          </select>
                        </div>
                      </div>
                    ) : null}

                    {active && option.value === 'yearly' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '220px 180px', gap: 10 }}>
                        <div className="sel-wrap">
                          <select className="f-input" value={String(config.dayOfMonth || 'last')} onChange={event => patchCondition({ dayOfMonth: event.target.value === 'last' ? 'last' : Number(event.target.value) })}>
                            {CALENDAR_DAY_OPTIONS.map(day => <option key={`yearly-day-${day.value}`} value={day.value}>{day.label}</option>)}
                          </select>
                        </div>
                        <div className="sel-wrap">
                          <select className="f-input" value={Number(config.monthOfYear || 1)} onChange={event => patchCondition({ monthOfYear: Number(event.target.value) })}>
                            {MONTH_OPTIONS.map(month => <option key={`yearly-month-${month.value}`} value={month.value}>{month.label}</option>)}
                          </select>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        )
        break
      case 'birthday':
        content = (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Dogum gununden gun once</div>
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.daysBefore)} onChange={event => patchCondition({ daysBefore: event.target.value })} />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Dogum gununden gun sonra</div>
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.daysAfter)} onChange={event => patchCondition({ daysAfter: event.target.value })} />
            </div>
          </div>
        )
        break
      case 'period_total_order_amount':
      case 'order_total':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 0.9fr 1fr', gap: 10 }}>
              <FieldStack label="Tutar esigi">
                <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.amount)} onChange={event => patchCondition({ amount: event.target.value })} placeholder="Orn. 500" />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'gte'} onChange={event => patchCondition({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.filter(option => option.value !== 'divisible').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
              {conditionKey === 'period_total_order_amount' ? (
                <FieldStack label="Donem">
                  <div className="sel-wrap">
                    <select className="f-input" value={config.period || 'all_time'} onChange={event => patchCondition({ period: event.target.value })}>
                      {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              ) : <div />}
            </div>
            {conditionKey === 'period_total_order_amount' && (config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gun sayisi" hint="Orn. son 30 gun, son 45 gun gibi.">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => patchCondition({ periodDays: event.target.value })} placeholder="30" />
              </FieldStack>
            ) : null}
            {conditionKey === 'period_total_order_amount' ? (
              <div style={{ display: 'grid', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={Boolean(config.includeCurrentOrder)} onChange={event => patchCondition({ includeCurrentOrder: event.target.checked })} />
                  Mevcut siparisi de tutara dahil et
                </label>
                {config.includeCurrentOrder ? (
                  <HelperNote title="Mevcut siparis dahil mi?">
                    Bu secenek aciksa mevcut siparisin tutari da bu esige dahil edilir. Ornek: limit `500 TL`, musteri bu siparisle birlikte `500 TL` ve uzerine cikiyorsa indirim ayni sipariste uygulanir.
                  </HelperNote>
                ) : null}
              </div>
            ) : null}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.repeatable)} onChange={event => patchCondition({ repeatable: event.target.checked })} />
              Bir sipariste birkac kez etkinlestirilebilir
            </label>
            {renderProductMasksEditor(rule, scope, 'Urun Sablonlari', { config, onPatch: patchCondition })}
          </div>
        )
        break
      case 'period_order_count':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Karsilastirma mantigi">
              `Esit` tam olarak belirli sayiyi, `daha fazla veya esit` esigi gecmeyi, `bolunebilir` ise her 10., 50. veya 100. ziyaret gibi tekrar eden kilometre taslarini ifade eder.
            </HelperNote>
            <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.8fr 1fr', gap: 10 }}>
              <FieldStack label="Ziyaret / siparis adedi">
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.count)} onChange={event => patchCondition({ count: event.target.value })} placeholder="Orn. 3" />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'eq'} onChange={event => patchCondition({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Donem">
                <div className="sel-wrap">
                  <select className="f-input" value={config.period || 'all_time'} onChange={event => patchCondition({ period: event.target.value })}>
                    {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
            {(config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gun sayisi">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => patchCondition({ periodDays: event.target.value })} placeholder="30" />
              </FieldStack>
            ) : null}
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                <input type="checkbox" checked={Boolean(config.includeCurrentOrder)} onChange={event => patchCondition({ includeCurrentOrder: event.target.checked })} />
                Mevcut ziyaret / siparisi de say
              </label>
              {config.includeCurrentOrder ? (
                <HelperNote title="100. ziyaret bu sipariste sayilsin">
                  Bu secenek aciksa musteri 99 ziyaretle geldiyse ve bu siparis 100. ziyaret ise, kural ayni sipariste saglanmis sayilir ve bagli indirim veya odul hemen uygulanir.
                </HelperNote>
              ) : null}
            </div>
          </div>
        )
        break
      case 'period_product_quantity':
      case 'period_sold_product_quantity':
      case 'order_item_quantity':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            {conditionKey === 'order_item_quantity' ? (
              <HelperNote title="3 al 2 ode kurulumu">
                3 al 2 ode icin adet `3`; 1 alana 1 bedava veya 2. urun indirimli icin adet `2` secin. `Daha fazla veya esit` esigi gecince, `esit` tam adette, `bolunebilir` ise her 2'li / 3'lu / 4'lu grup icin calisir. Urun / kategori / sablon alanindan kategori, satis mali sablonu veya tekil urunleri belirleyin. Gun-saat siniri gerekiyorsa ayni bloğa ek kosul olarak `Happy hour` ekleyin.
              </HelperNote>
            ) : null}
            {conditionKey === 'period_sold_product_quantity' ? (
              <HelperNote title="Toplam satis hacmi kosulu">
                Bu kosul musteri bazli degil, secili urun, kategori ve satis mali sablonlarinin donem icindeki toplam satis adedine bakar. Ayni bloğa hem `xxx` urunu hem de `yyy` urun kategorisini ya da bir satis mali sablonunu ekleyebilirsiniz; sistem secili filtrelerdeki toplam adedi izler.
              </HelperNote>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: conditionKey === 'order_item_quantity' ? '1fr 1fr' : '0.8fr 0.9fr 1fr', gap: 10 }}>
              <FieldStack label="Urun adedi">
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.quantity)} onChange={event => patchCondition({ quantity: event.target.value })} placeholder="Orn. 2" />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'gte'} onChange={event => patchCondition({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
              {conditionKey !== 'order_item_quantity' ? (
                <FieldStack label="Donem">
                  <div className="sel-wrap">
                    <select className="f-input" value={config.period || 'all_time'} onChange={event => patchCondition({ period: event.target.value })}>
                      {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              ) : null}
            </div>
            {(conditionKey === 'period_product_quantity' || conditionKey === 'period_sold_product_quantity') && (config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gun sayisi">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => patchCondition({ periodDays: event.target.value })} placeholder="30" />
              </FieldStack>
            ) : null}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {conditionKey !== 'period_sold_product_quantity' ? (
                <>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                    <input type="checkbox" checked={Boolean(config.repeatable)} onChange={event => patchCondition({ repeatable: event.target.checked })} />
                    Bir sipariste birkac kez etkinlestirilebilir
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                    <input type="checkbox" checked={config.allowSameItemRepeat !== false} onChange={event => patchCondition({ allowSameItemRepeat: event.target.checked })} />
                    Ayni urun tekrarlarini say
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                    <input type="checkbox" checked={Boolean(config.excludeFreeItems)} onChange={event => patchCondition({ excludeFreeItems: event.target.checked })} />
                    Ucretsiz ogeleri haric tut
                  </label>
                </>
              ) : (
                <div style={{ fontSize: '.8rem', color: '#64748b' }}>
                  Bu kosul donem toplam satisini izledigi icin siparis-ici tekrar ve ucretsiz oge sayimi burada kullanilmaz.
                </div>
              )}
            </div>
            {renderProductMasksEditor(rule, scope, conditionKey === 'period_sold_product_quantity' ? 'Satilan Urun / Kategori / Sablon Filtreleri' : 'Urun / Kategori / Sablon Filtreleri', { config, onPatch: patchCondition })}
          </div>
        )
        break
      case 'missing_products':
        content = renderProductMasksEditor(rule, scope, 'Urun / Kategori / Sablon Filtreleri', { config, onPatch: patchCondition })
        break
      case 'happy_hour':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Gun ve saat penceresi">
              Ornek kurulum: Pazartesi 18:00-20:00 kampanyasi icin tek pencere ekleyip yalnizca `Pzt` gununu isaretleyin.
            </HelperNote>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={config.saveWriteTime !== false} onChange={event => patchCondition({ saveWriteTime: event.target.checked })} />
              Urun yazdirma zamanini kaydet
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              {(config.windows || []).map(window => (
                <div key={window.id} style={{ display: 'grid', gridTemplateColumns: '100px 100px repeat(7, 40px) auto', gap: 6, alignItems: 'center' }}>
                  <input className="f-input" type="time" value={window.start} onChange={event => patchCondition(cfg => ({ ...cfg, windows: (cfg.windows || []).map(item => item.id === window.id ? { ...item, start: event.target.value } : item) }))} />
                  <input className="f-input" type="time" value={window.end} onChange={event => patchCondition(cfg => ({ ...cfg, windows: (cfg.windows || []).map(item => item.id === window.id ? { ...item, end: event.target.value } : item) }))} />
                  {WEEKDAY_OPTIONS.map((dayLabel, dayIndex) => (
                    <label key={`${window.id}-${dayLabel}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: '.7rem', color: '#64748b' }}>
                      {dayLabel}
                      <input type="checkbox" checked={Boolean(window.days?.[dayIndex])} onChange={event => patchCondition(cfg => ({ ...cfg, windows: (cfg.windows || []).map(item => item.id === window.id ? { ...item, days: item.days.map((day, index) => index === dayIndex ? event.target.checked : day) } : item) }))} />
                    </label>
                  ))}
                  <button className="btn-danger" onClick={() => patchCondition(cfg => ({ ...cfg, windows: (cfg.windows || []).filter(item => item.id !== window.id) }))}>Sil</button>
                </div>
              ))}
              <div>
                <button className="btn-o" onClick={() => patchCondition(cfg => ({ ...cfg, windows: [...(cfg.windows || []), { id: createId('window'), start: '00:00', end: '00:00', days: [false, false, false, false, false, false, false] }] }))}>+ Olustur</button>
              </div>
            </div>
            <div style={{ display: 'none', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FieldStack label="Saat dilimi kaynagi">
                <div className="sel-wrap">
                  <select className="f-input" value={config.timezoneMode || 'default'} onChange={event => patchCondition({ timezoneMode: event.target.value })}>
                    <option value="default">Varsayilan</option>
                    <option value="reference_branch">Referans sube saat dilimi</option>
                    <option value="branch">Sube saat dilimi</option>
                    <option value="custom">Secilen saat dilimi</option>
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Saat dilimi">
                <div className="sel-wrap">
                  <select className="f-input" value={config.timezone || 'Europe/Istanbul'} onChange={event => patchCondition({ timezone: event.target.value })}>
                    {TIMEZONE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
            <HelperNote title="Ziyaret sayisi kurallari">
              Gunde, haftada, ayda, 3 ayda veya yilda en az belirli sayida ziyaret eden musterileri bu kosulla hedefleyebilirsiniz. Buradaki ziyaret sayisi, operasyon tarafinda siparis / fis olusumu ile eslenecek.
            </HelperNote>
          </div>
        )
        break
      case 'gift_card_series':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="sel-wrap">
              <select className="f-input" value={config.mode || 'matches_series'} onChange={event => patchCondition({ mode: event.target.value })}>
                {GIFT_CARD_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <SearchableMultiSelect
              options={couponSeries.map(series => ({
                value: series.id,
                label: series.name,
                description: `${series.prefix} on eki, ${series.codes.length} kod`,
              }))}
              selectedValues={config.seriesIds || []}
              onChange={next => patchCondition({ seriesIds: next })}
              placeholder="Kupon / hediye karti serisi secin"
              searchPlaceholder="Seri ara"
              emptyText="Kupon serisi bulunamadi."
            />
          </div>
        )
        break
      case 'campaign_triggered':
        content = (
          <div style={{ display: 'grid', gap: 8 }}>
            <HelperNote title="Kampanya aktifse">
              Bu kosul, sectiginiz kampanyalardan biri ayni sipariste aktif hale geldiyse calisir. Zincirleme kampanya kurgularinda, bir kampanya devreye girince digerini acmak icin kullanabilirsiniz.
            </HelperNote>
            <SearchableMultiSelect
              options={campaigns
                .filter(item => item.id !== selectedCampaign?.id)
                .map(item => ({
                  value: item.id,
                  label: item.name,
                  description: `${getOptionLabel(CAMPAIGN_TRIGGER_OPTIONS, item.triggerType)} / ${getOptionLabel(CAMPAIGN_TYPE_OPTIONS, item.campaignType)}`,
                }))}
              selectedValues={config.relatedCampaignIds || []}
              onChange={next => patchCondition({ relatedCampaignIds: next })}
              placeholder="Kampanya secin"
              searchPlaceholder="Kampanya ara"
              emptyText="Secilebilecek kampanya yok."
            />
          </div>
        )
        break
      case 'coupon_present':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.anySeries)} onChange={event => patchCondition({ anySeries: event.target.checked })} />
              Herhangi bir seri
            </label>
            <SearchableMultiSelect
              options={couponSeries.map(series => ({
                value: series.id,
                label: series.name,
                description: `${series.prefix} on eki, ${series.codes.length} kod`,
                disabled: Boolean(config.anySeries),
              }))}
              selectedValues={config.seriesIds || []}
              onChange={next => patchCondition({ seriesIds: next })}
              placeholder="Kupon serisi secin"
              searchPlaceholder="Seri ara"
              emptyText="Kupon serisi bulunamadi."
            />
          </div>
        )
        break
      case 'days_since_first_activity':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Gun farki kosulu">
              Bu kosul kayit veya ilk siparisten sonra gecen gun sayisini kontrol eder. Burada `esit`, `daha az`, `daha az veya esit`, `daha fazla`, `daha fazla veya esit` mantiklari kullanilir.
            </HelperNote>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.9fr', gap: 10 }}>
              <FieldStack label="Referans olay">
                <div className="sel-wrap">
                  <select className="f-input" value={config.eventType || 'signup'} onChange={event => patchCondition({ eventType: event.target.value })}>
                    <option value="signup">Kayit</option>
                    <option value="first_order">Ilk siparis</option>
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Gun sayisi">
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.days)} onChange={event => patchCondition({ days: event.target.value })} placeholder="Orn. 30" />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'gte'} onChange={event => patchCondition({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.filter(option => option.value !== 'divisible').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
          </div>
        )
        break
      case 'manual_approval':
        content = (
          <HelperNote title="Manuel Tetikleme">
            Bu kosul, kampanyanin personel tarafindan elle baslatilan bir akista calismasi icin kullanilir. POS kampanyalar sekmesinde basilabilir kampanya karti / butonu ile tetiklenen senaryolarda, personel butona bastiginda ve diger kosullar da uyuyorsa kampanya devreye girer.
          </HelperNote>
        )
        break
      case 'customer_has_tag':
      case 'customer_lacks_tag':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            {renderCustomerCategoryGuide('Musteri kategorileri nereden gelir')}
            {activeCustomerCategories.length === 0 ? (
              <div style={{ fontSize: '.8rem', color: '#64748b' }}>
                Henuz aktif musteri kategorisi yok.
              </div>
            ) : (
              <FieldStack label="Musteri kategorileri">
                <SearchableMultiSelect
                  options={activeCustomerCategories.map(category => ({
                    value: category.id,
                    label: category.name,
                    description: category.description || category.code,
                  }))}
                  selectedValues={config.tags || []}
                  onChange={next => patchCondition({ tags: next })}
                  placeholder="Musteri kategorisi secin"
                  searchPlaceholder="Kategori ara"
                  emptyText="Kategori bulunamadi."
                />
              </FieldStack>
            )}
            <FieldStack label="Kontrol edilen musteri">
              <div className="sel-wrap">
                <select className="f-input" value={config.target || 'order_customer'} onChange={event => patchCondition({ target: event.target.value })}>
                  {CUSTOMER_TARGET_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </FieldStack>
          </div>
        )
        break
      case 'referred_customer':
        content = (
          <div style={{ display: 'grid', gap: 14 }}>
            <FieldStack label="Referans Programı Seçimi" hint="Bu koşulun geçerli olacağı referans programlarını seçin. Boş bırakılırsa tüm referans programları kabul edilir.">
              <SearchableMultiSelect
                options={referralPrograms.map(prog => ({
                  value: prog.id,
                  label: prog.name,
                }))}
                selectedValues={config.program_ids || []}
                onChange={next => patchCondition({ program_ids: next })}
                placeholder="Program seçin (Tümü için boş bırakın)"
                searchPlaceholder="Program ara..."
                emptyText="Aktif referans programı bulunamadı."
              />
            </FieldStack>

            <FieldStack label="Tetikleyici Başarı Kriteri" hint="Kupon veya ödülün ne zaman verileceğini seçin.">
              <div className="sel-wrap">
                <select 
                  className="f-input" 
                  value={config.trigger || 'registration'} 
                  onChange={event => {
                    const val = event.target.value
                    patchCondition({ 
                      trigger: val,
                      purchase_count: val === 'nth_purchase' ? (config.purchase_count || 1) : undefined
                    })
                  }}
                >
                  <option value="registration">Referansla kayıt olduğunda</option>
                  <option value="nth_purchase">N. siparişi tamamlandığında</option>
                </select>
              </div>
            </FieldStack>

            {config.trigger === 'nth_purchase' && (
              <FieldStack label="Gerekli Sipariş Sayısı (N)" hint="Kaçıncı alışverişinde bu eylemin tetikleneceği.">
                <input 
                  className="f-input" 
                  type="number" 
                  min={1} 
                  value={config.purchase_count !== undefined ? config.purchase_count : 1} 
                  onChange={event => patchCondition({ purchase_count: Math.max(1, parseInt(event.target.value, 10) || 1) })} 
                />
              </FieldStack>
            )}
          </div>
        )
        break
      case 'gave_referral':
        content = (
          <div style={{ display: 'grid', gap: 14 }}>
            <FieldStack label="Referans Programı Seçimi" hint="Bu koşulun bağlı olacağı referans programını seçin.">
              <div className="sel-wrap">
                <select 
                  className="f-input" 
                  value={config.program_id || ''} 
                  onChange={event => patchCondition({ program_id: event.target.value })}
                >
                  <option value="">Program seçin...</option>
                  {referralPrograms.map(prog => (
                    <option key={prog.id} value={prog.id}>{prog.name}</option>
                  ))}
                </select>
              </div>
            </FieldStack>

            <FieldStack label="Ödüllendirme Tipi" hint="Her davet için mi, yoksa belirli bir davet barajı aşıldığında mı ödül verilecek?">
              <div className="sel-wrap">
                <select 
                  className="f-input" 
                  value={config.reward_type || 'per_each'} 
                  onChange={event => {
                    const val = event.target.value
                    patchCondition({ 
                      reward_type: val,
                      threshold_count: val === 'threshold' ? (config.threshold_count || 3) : undefined
                    })
                  }}
                >
                  <option value="per_each">Her başarılı davet için (1:1)</option>
                  <option value="threshold">Baraj bazlı davet için (N adet getirdiğinde 1 kez)</option>
                </select>
              </div>
            </FieldStack>

            {config.reward_type === 'threshold' && (
              <FieldStack label="Gerekli Başarılı Davet Sayısı (Baraj)" hint="Müşterinin ödülü alabilmesi için getirmesi gereken minimum başarılı davet sayısı.">
                <input 
                  className="f-input" 
                  type="number" 
                  min={1} 
                  value={config.threshold_count !== undefined ? config.threshold_count : 3} 
                  onChange={event => patchCondition({ threshold_count: Math.max(1, parseInt(event.target.value, 10) || 1) })} 
                />
              </FieldStack>
            )}

            <FieldStack label="Maksimum Ödül Sayısı Limiti (Opsiyonel)" hint="Bu koşuldan kazanılabilecek maksimum ödül sayısı limitidir. Boş bırakılırsa sınırsızdır.">
              <input 
                className="f-input" 
                type="number" 
                min={1} 
                value={config.max_rewards_limit !== undefined ? config.max_rewards_limit : ''} 
                onChange={event => {
                  const val = event.target.value
                  patchCondition({ max_rewards_limit: val ? Math.max(1, parseInt(val, 10) || 1) : undefined })
                }}
                placeholder="Örn: 5 (Sınırsız için boş bırakın)"
              />
            </FieldStack>
          </div>
        )
        break
      case 'sales_channel':
        content = (
          <div style={{ display: 'grid', gap: 12 }}>
            <HelperNote title="Satis kanali kosulu">
              Bu kosul eklendiginde kampanya sadece secilen satis kanallarinda calisir. Ayrica genel ekrandaki eski kanal alani yerine artik buradan yonetilir.
            </HelperNote>
            <FieldStack label="Gecerli satis kanallari" hint="POS, Garson / Masa, kiosk, online veya mobil kanallarini secin.">
              <SearchableMultiSelect
                options={salesChannels}
                selectedValues={getSalesChannelConditionValues(config)}
                onChange={next => patchCondition({ channelValues: next })}
                placeholder="Satis kanali secin"
                searchPlaceholder="Kanal ara"
                emptyText="Kanal bulunamadi."
              />
            </FieldStack>
          </div>
        )
        break
      case 'last_visit_days':
        content = (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="... gundur gelmeyen">
              Burada musteri son siparisinden beri kac gun gectigine gore hedeflenir. Ornek: `daha fazla veya esit 30` ile 30 gundur gelmeyen musteriler.
            </HelperNote>
            <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 0.9fr', gap: 10 }}>
              <FieldStack label="Gun sayisi">
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.days)} onChange={event => patchCondition({ days: event.target.value })} placeholder="Orn. 14" />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'gte'} onChange={event => patchCondition({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.filter(option => option.value !== 'divisible').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
          </div>
        )
        break
      default:
        content = null
        break
    }

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        {content}
      </div>
    )
  }

  function renderActionDetails(rule, scope, onPatchOverride = null) {
    const config = rule.actionConfig || {}
    const offerItems = Array.isArray(config.items) ? config.items : []
    const pricingItems = Array.isArray(config.items) ? config.items : []
    const comboGroups = Array.isArray(config.groups) ? config.groups : []
    const patchAction = onPatchOverride || (patch => patchRuleActionConfig(selectedCampaign.id, scope, rule.id, patch))
    const templatePreviewValues = {
      campaign_name: selectedCampaign?.name || 'Ornek Kampanya',
      customer_name: 'Ayse Yilmaz',
      customer_category: activeCustomerCategories[0]?.name || 'VIP',
      order_total: formatAmount(575.5),
      visit_count: '100',
      coupon_code: couponSeries[0]?.codes?.[0] || 'KPN123456',
      branch_name: 'Merkez Sube',
      current_date: new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date()),
      current_time: new Intl.DateTimeFormat('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()),
    }

    function showTemplatePreview(template, options = {}) {
      const preview = formatTemplatePreview(template, templatePreviewValues, options)
      toast(preview ? preview.replace(/\n/g, ' / ') : 'Onizleme icin once metin girin', 'info')
    }

    function showTemplateFields() {
      toast(
        `Alanlar: ${TEMPLATE_MODEL_FIELDS.map(field => `${field.token} (${field.label})`).join(', ')}`,
        'info',
      )
    }

    function renderTemplatePreviewCard(template, {
      title = 'Onizleme',
      emptyText = 'Onizleme icin metin girin.',
      maxLines = 3,
    } = {}) {
      const preview = formatTemplatePreview(template, templatePreviewValues, { maxLines })
      return (
        <HelperNote title={title}>
          <div style={{ whiteSpace: 'pre-line' }}>{preview || emptyText}</div>
        </HelperNote>
      )
    }

    function renderOfferItemsEditor(extra = null) {
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Bu listede hediye edilecek veya onerilecek urunleri tanimlarsiniz.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {offerItems.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                <FieldStack label="Urun / kategori / sablon">
                  <CatalogMaskSelect
                    items={saleItems}
                    categories={saleCategories}
                    saleTemplates={saleTemplates}
                    value={item.name}
                    itemId={item.itemId}
                    selectionType={item.type || 'product'}
                    onSelect={({ itemId, name, type }) => patchAction(current => ({
                      ...current,
                      items: offerItems.map(entry => entry.id === item.id ? { ...entry, itemId, name, type } : entry),
                    }))}
                    placeholder="Urun / kategori / sablon secin"
                  />
                </FieldStack>
                <button
                  className="btn-danger"
                  onClick={() => patchAction(current => ({
                    ...current,
                    items: offerItems.filter(entry => entry.id !== item.id),
                  }))}
                >
                  Sil
                </button>
              </div>
            ))}
            <div>
              <button className="btn-o" type="button" onClick={() => patchAction(current => ({
                ...current,
                items: [...(current.items || []), createOfferItem()],
              }))}>
                + Olustur
              </button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
            <input type="checkbox" checked={Boolean(config.applyToPricedOptions)} onChange={event => patchAction({ applyToPricedOptions: event.target.checked })} />
            Fiyatli opsiyonlara uygula
          </label>
          {extra}
        </div>
      )
    }

    function renderPricingEditor() {
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <HelperNote title="Indirimler ve ozel fiyatlar">
            Hedefi `Urun`, `Sablon` veya `Kategori` olarak secip indirimi sablona gore tum urunlere, en ucuz urune veya en pahali urune uygulayabilirsiniz. `Indirim yok` secimi, secili hedefi diger fiyatlamalardan dislamak icin kullanilabilir.
          </HelperNote>
          <div style={{ display: 'grid', gap: 8 }}>
            {pricingItems.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr 0.7fr auto', gap: 8, fontSize: '.72rem', color: '#64748b', fontWeight: 800 }}>
                <div>Urun / kategori / sablon</div>
                <div>Uygula</div>
                <div>Tur</div>
                <div>Deger</div>
                <div />
              </div>
            ) : null}
            {pricingItems.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr 0.7fr auto', gap: 8 }}>
                <CatalogMaskSelect
                  items={saleItems}
                  categories={saleCategories}
                  saleTemplates={saleTemplates}
                  value={item.name}
                  itemId={item.itemId}
                  selectionType={item.maskType === 'mask' ? 'sale_template' : (item.maskType || 'product')}
                  onSelect={({ itemId, name, type }) => patchAction(current => ({
                    ...current,
                    items: pricingItems.map(entry => entry.id === item.id ? {
                      ...entry,
                      itemId,
                      name,
                      maskType: type,
                    } : entry),
                  }))}
                  placeholder="Urun / kategori / sablon secin"
                />
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={item.applyTo}
                    onChange={event => patchAction(current => ({
                      ...current,
                      items: pricingItems.map(entry => entry.id === item.id ? { ...entry, applyTo: event.target.value } : entry),
                    }))}
                  >
                    {PRICING_APPLY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={item.pricingType}
                    onChange={event => patchAction(current => ({
                      ...current,
                      items: pricingItems.map(entry => entry.id === item.id ? { ...entry, pricingType: event.target.value } : entry),
                    }))}
                  >
                    {PRICING_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <input
                  className="f-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formatNumberInputValue(item.value)}
                  onChange={event => patchAction(current => ({
                    ...current,
                    items: pricingItems.map(entry => entry.id === item.id ? { ...entry, value: event.target.value } : entry),
                  }))}
                  placeholder={item.pricingType === 'none' ? '-' : 'Deger'}
                  disabled={item.pricingType === 'none'}
                />
                <button
                  className="btn-danger"
                  onClick={() => patchAction(current => ({
                    ...current,
                    items: pricingItems.filter(entry => entry.id !== item.id),
                  }))}
                >
                  Sil
                </button>
              </div>
            ))}
            <div>
              <button className="btn-o" type="button" onClick={() => patchAction(current => ({
                ...current,
                items: [...(current.items || []), createPricingItem()],
              }))}>
                + Olustur
              </button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
            <input type="checkbox" checked={Boolean(config.applyToPricedOptions)} onChange={event => patchAction({ applyToPricedOptions: event.target.checked })} />
            Fiyatli opsiyonlara uygula
          </label>
        </div>
      )
    }

    function renderComboEditor() {
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr 1fr 0.8fr', gap: 10 }}>
            <input className="f-input" value={config.name || ''} onChange={event => patchAction({ name: event.target.value })} placeholder="Kombo adi" />
            <input className="f-input" value={config.category || ''} onChange={event => patchAction({ category: event.target.value })} placeholder="Kategori" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr', gap: 8 }}>
              <div className="sel-wrap">
                <select className="f-input" value={config.priceMode || 'fixed_price'} onChange={event => patchAction({ priceMode: event.target.value })}>
                  {COMBO_PRICE_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.priceValue)} onChange={event => patchAction({ priceValue: event.target.value })} placeholder="Fiyat" />
            </div>
            <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.sortOrder)} onChange={event => patchAction({ sortOrder: event.target.value })} placeholder="Pozisyon" />
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {comboGroups.map(group => (
              <div key={group.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    className="f-input"
                    value={group.name}
                    onChange={event => patchAction(current => ({
                      ...current,
                      groups: comboGroups.map(entry => entry.id === group.id ? { ...entry, name: event.target.value } : entry),
                    }))}
                    placeholder="Grup adi"
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                    <input
                      type="checkbox"
                      checked={Boolean(group.isPrimary)}
                      onChange={event => patchAction(current => ({
                        ...current,
                        groups: comboGroups.map(entry => entry.id === group.id ? { ...entry, isPrimary: event.target.checked } : entry),
                      }))}
                    />
                    Ana urun
                  </label>
                  <button className="btn-danger" onClick={() => patchAction(current => ({
                    ...current,
                    groups: comboGroups.filter(entry => entry.id !== group.id),
                  }))}>
                    Sil
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  {(group.items || []).map(item => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '0.8fr 1fr 0.8fr 1fr 0.7fr 0.6fr auto', gap: 8 }}>
                      <div className="sel-wrap">
                        <select
                          className="f-input"
                          value={item.type}
                          onChange={event => patchAction(current => ({
                            ...current,
                            groups: comboGroups.map(entry => (
                              entry.id === group.id
                                ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, type: event.target.value } : groupItem) }
                                : entry
                            )),
                          }))}
                        >
                          {MASK_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <input
                        className="f-input"
                        value={item.name}
                        onChange={event => patchAction(current => ({
                          ...current,
                          groups: comboGroups.map(entry => (
                            entry.id === group.id
                              ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, name: event.target.value } : groupItem) }
                              : entry
                          )),
                        }))}
                        placeholder="Ad"
                      />
                      <input
                        className="f-input"
                        value={item.size}
                        onChange={event => patchAction(current => ({
                          ...current,
                          groups: comboGroups.map(entry => (
                            entry.id === group.id
                              ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, size: event.target.value } : groupItem) }
                              : entry
                          )),
                        }))}
                        placeholder="Boyut"
                      />
                      <input
                        className="f-input"
                        value={item.blockedOptions}
                        onChange={event => patchAction(current => ({
                          ...current,
                          groups: comboGroups.map(entry => (
                            entry.id === group.id
                              ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, blockedOptions: event.target.value } : groupItem) }
                              : entry
                          )),
                        }))}
                        placeholder="Yasakli opsiyonlar"
                      />
                      <input
                        className="f-input"
                        type="number"
                        step="0.01"
                        value={formatNumberInputValue(item.priceAdjustment)}
                        onChange={event => patchAction(current => ({
                          ...current,
                          groups: comboGroups.map(entry => (
                            entry.id === group.id
                              ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, priceAdjustment: event.target.value } : groupItem) }
                              : entry
                          )),
                        }))}
                        placeholder="Fiyat"
                      />
                      <input
                        className="f-input"
                        type="number"
                        min={0}
                        value={formatNumberInputValue(item.position)}
                        onChange={event => patchAction(current => ({
                          ...current,
                          groups: comboGroups.map(entry => (
                            entry.id === group.id
                              ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, position: event.target.value } : groupItem) }
                              : entry
                          )),
                        }))}
                        placeholder="Poz"
                      />
                      <button
                        className="btn-danger"
                        onClick={() => patchAction(current => ({
                          ...current,
                          groups: comboGroups.map(entry => (
                            entry.id === group.id
                              ? { ...entry, items: entry.items.filter(groupItem => groupItem.id !== item.id) }
                              : entry
                          )),
                        }))}
                      >
                        Sil
                      </button>
                    </div>
                  ))}
                  <div>
                    <button className="btn-o" type="button" onClick={() => patchAction(current => ({
                      ...current,
                      groups: comboGroups.map(entry => (
                        entry.id === group.id
                          ? { ...entry, items: [...(entry.items || []), createComboGroupItem()] }
                          : entry
                      )),
                    }))}>
                      + Urun Ekle
                    </button>
                  </div>
                </div>
              </div>
            ))}

            <div>
              <button className="btn-o" type="button" onClick={() => patchAction(current => ({
                ...current,
                groups: [...(current.groups || []), createComboGroup()],
              }))}>
                + Grup Ekle
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.applyToPaidOptions)} onChange={event => patchAction({ applyToPaidOptions: event.target.checked })} />
              Ucretli opsiyonlara uygula
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={config.blockOtherDiscounts !== false} onChange={event => patchAction({ blockOtherDiscounts: event.target.checked })} />
              Kombo urunlere baska indirim uygulama
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr auto', gap: 10 }}>
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.warnMissingSidesThreshold, '')} onChange={event => patchAction({ warnMissingSidesThreshold: event.target.value })} placeholder="Eksik yan urun esigi" />
            <div style={{ fontSize: '.78rem', color: '#64748b', display: 'flex', alignItems: 'center' }}>
              Eksik yan urunler icin personel uyarisi esigi
            </div>
          </div>
        </div>
      )
    }

    switch (rule.actionType) {
      case 'free_products':
      case 'suggest_products':
        return renderOfferItemsEditor()
      case 'product_pricing':
        return renderPricingEditor()
      case 'combo_bundle':
        return renderComboEditor()
      case 'write_customer_note':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Sablonlu not">
              Musteri notuna kampanya, musteri ve siparis bilgisini sablon alanlariyla yazabilirsiniz. `Onizleme` ornek degerlerle sonucu gosterir.
            </HelperNote>
            <FieldStack label="Musteri varsa yazilacak not">
              <textarea className="f-input" rows={3} value={config.customerTemplate || ''} onChange={event => patchAction({ customerTemplate: event.target.value })} placeholder="Orn. VIP musteri indirimi uygulandi." />
            </FieldStack>
            <FieldStack label="Musteri yoksa yazilacak not">
              <textarea className="f-input" rows={3} value={config.anonymousTemplate || ''} onChange={event => patchAction({ anonymousTemplate: event.target.value })} placeholder="Anonim siparis sablonu" />
            </FieldStack>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" onClick={() => showTemplatePreview(config.customerTemplate || config.anonymousTemplate || '')}>Onizleme</button>
              <button className="btn-o" type="button" onClick={showTemplateFields}>Model alanlarini alma</button>
            </div>
            {renderTemplatePreviewCard(config.customerTemplate || config.anonymousTemplate || '', {
              title: 'Not onizleme',
              emptyText: 'Not sablonu girildiginde burada gorunur.',
            })}
          </div>
        )
      case 'send_sms':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="SMS sablonu">
              SMS metninde ayni model alanlarini kullanabilirsiniz. Uzun metinleri kampanya amacina gore kisa tutmak teslim basarisini artirir.
            </HelperNote>
            <FieldStack label="SMS metni">
              <textarea className="f-input" rows={3} value={config.message || ''} onChange={event => patchAction({ message: event.target.value })} placeholder="Mesaj metni" />
            </FieldStack>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" onClick={() => showTemplatePreview(config.message || '')}>Onizleme</button>
              <button className="btn-o" type="button" onClick={showTemplateFields}>Model alanlarini alma</button>
            </div>
            {renderTemplatePreviewCard(config.message || '', {
              title: 'SMS onizleme',
              emptyText: 'SMS metni girildiginde burada gorunur.',
            })}
            <FieldStack label="Gonderim saati">
              <input className="f-input" type="time" value={config.sendAt || '00:00'} onChange={event => patchAction({ sendAt: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'send_webhook':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Webhook adresi">
              <input className="f-input" value={config.endpoint || ''} onChange={event => patchAction({ endpoint: event.target.value })} placeholder="Webhook endpoint" />
            </FieldStack>
            <FieldStack label="Payload sablonu">
              <textarea className="f-input" rows={3} value={config.template || ''} onChange={event => patchAction({ template: event.target.value })} placeholder="Payload sablonu" />
            </FieldStack>
            <FieldStack label="Gonderim zamani / cron notu">
              <input className="f-input" value={config.sendAt || ''} onChange={event => patchAction({ sendAt: event.target.value })} placeholder="Orn. hemen / 18:00 / cron" />
            </FieldStack>
          </div>
        )
      case 'remove_customer_tag':
      case 'add_customer_tag':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            {renderCustomerCategoryGuide('Musteri kategorisi hedefi')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FieldStack label="Eklenecek / kaldirilacak kategori">
                <div className="sel-wrap">
                  <select className="f-input" value={config.category || ''} onChange={event => patchAction({ category: event.target.value })}>
                    <option value="">Kategori secin</option>
                    {activeCustomerCategories.map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Hangi musteriye uygulansin">
                <div className="sel-wrap">
                  <select className="f-input" value={config.target || 'order_customer'} onChange={event => patchAction({ target: event.target.value })}>
                    {CUSTOMER_TARGET_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
          </div>
        )
      case 'special_discount':
      case 'order_discount_amount':
      case 'order_extra_charge_amount':
        return (
          <FieldStack label="Tutar">
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.amount)} onChange={event => patchAction({ amount: event.target.value })} placeholder="Orn. 50" />
          </FieldStack>
        )
      case 'order_extra_charge_percent':
      case 'discount_percent':
        return (
          <FieldStack label="Yuzde">
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => patchAction({ percent: event.target.value })} placeholder="Orn. 20" />
          </FieldStack>
        )
      case 'total_order_discount_percent':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Toplam siparis indirim yuzdesi">
              <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => patchAction({ percent: event.target.value })} placeholder="Orn. 20" />
            </FieldStack>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.includeAlreadyDiscounted)} onChange={event => patchAction({ includeAlreadyDiscounted: event.target.checked })} />
              Diger kampanyalara katilan urunlere uygula
            </label>
          </div>
        )
      case 'warning_message':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="POS uyarisi">
              Sablon tabanli uyari metni. POS ekrani iki satirla sinirlidir; asagidaki onizleme metni iki satira gore kisaltir. `Model alanlarini alma` butonu kullanabileceginiz yer tutuculari listeler.
            </HelperNote>
            <FieldStack label="Uyari metni">
              <textarea className="f-input" rows={3} value={config.message || ''} onChange={event => patchAction({ message: event.target.value })} placeholder="Sablon tabanli uyari metni" />
            </FieldStack>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" onClick={() => showTemplatePreview(config.message || '', { maxLines: 2 })}>Onizleme</button>
              <button className="btn-o" type="button" onClick={showTemplateFields}>Model alanlarini alma</button>
            </div>
            {renderTemplatePreviewCard(config.message || '', {
              title: 'POS onizleme',
              emptyText: 'POS uyarisi burada iki satir halinde gorunur.',
              maxLines: 2,
            })}
            <FieldStack label="Musteriye teklif">
              <input className="f-input" value={config.customerOffer || ''} onChange={event => patchAction({ customerOffer: event.target.value })} placeholder="Musteriye teklif" />
            </FieldStack>
          </div>
        )
      case 'bonus_points':
        return (
          <FieldStack label="Yuklenecek puan">
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.points)} onChange={event => patchAction({ points: event.target.value })} placeholder="Orn. 250" />
          </FieldStack>
        )
      case 'points_percent_of_order':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Harcama bazli puan">
              Bu eylem siparis tutarinin belirli bir yuzdesi kadar puan kazandirir. Ornek `%10` ise `500 TL` sipariste `50` puan verilir.
            </HelperNote>
            <FieldStack label="Puan orani (%)">
              <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => patchAction({ percent: event.target.value })} placeholder="Orn. 10" />
            </FieldStack>
          </div>
        )
      case 'points_earn_multiplier':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Puan kazanma katsayisi">
              Bu eylem temel puan kazaniminin ustune katsayi uygular. Ornek `x2`, `x3` veya `x4`. Hafta sonu double / triple points kampanyalari icin kullanilir.
            </HelperNote>
            <FieldStack label="Katsayi">
              <input className="f-input" type="number" min={1} step="0.1" value={formatNumberInputValue(config.multiplier, '1')} onChange={event => patchAction({ multiplier: event.target.value })} placeholder="Orn. 2" />
            </FieldStack>
          </div>
        )
      case 'points_redeem_multiplier':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <HelperNote title="Puan harcama katsayisi">
              Bu eylem belirli gun veya kosullarda puanin harcama degerini artirir. Ornek `x2` ise musteri ayni puanla normalin iki kati deger kullanir.
            </HelperNote>
            <FieldStack label="Katsayi">
              <input className="f-input" type="number" min={1} step="0.1" value={formatNumberInputValue(config.multiplier, '1')} onChange={event => patchAction({ multiplier: event.target.value })} placeholder="Orn. 2" />
            </FieldStack>
          </div>
        )
      case 'issue_coupon':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.anySeries)} onChange={event => patchAction({ anySeries: event.target.checked })} />
              Herhangi bir seri
            </label>
            <FieldStack label="Verilecek kupon serisi">
              <SearchableMultiSelect
                options={couponSeries.map(series => ({
                  value: series.id,
                  label: series.name,
                  description: `${series.prefix} on eki, ${series.codes.length} kod`,
                  disabled: Boolean(config.anySeries),
                }))}
                selectedValues={config.seriesIds || []}
                onChange={next => patchAction({ seriesIds: next })}
                placeholder="Verilecek kupon serisini secin"
                searchPlaceholder="Seri ara"
                emptyText="Kupon serisi bulunamadi."
              />
            </FieldStack>
          </div>
        )
      default:
        return null
    }
  }

  function removeRule(campaignId, scope, ruleId) {
    setCampaigns(current => current.map((campaign, campaignIndex) => {
      if (campaign.id !== campaignId) return campaign
      const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
      const nextRules = (campaign[ruleKey] || []).filter(rule => rule.id !== ruleId)
      return normalizeCampaign({ ...campaign, [ruleKey]: nextRules, programId: program.id }, campaignIndex)
    }))
  }

  function addCouponSeries() {
    setCouponSeries(current => [
      ...current,
      normalizeCouponSeries({
        id: createId('coupon-series'),
        name: `Kupon Serisi ${current.length + 1}`,
        prefix: `KPN${current.length + 1}`,
        singleCoupon: false,
        couponCount: 5,
        randomLength: 6,
        charset: 'numeric',
        useAfterCheckout: true,
        active: true,
        codes: [],
      }, current.length),
    ])
  }

  function updateCouponSeries(seriesId, key, value) {
    setCouponSeries(current => current.map((series, index) => (
      series.id === seriesId
        ? normalizeCouponSeries({ ...series, [key]: value }, index)
        : series
    )))
  }

  function refreshCouponSeriesCodes(seriesId) {
    setCouponSeries(current => current.map((series, index) => (
      series.id === seriesId
        ? normalizeCouponSeries({ ...series, codes: [] }, index)
        : series
    )))
  }

  function removeCouponSeries(seriesId) {
    setCouponSeries(current => current.filter(series => series.id !== seriesId))
  }

  async function saveAll() {
    setSaving(true)
    try {
      const safeProgram = normalizeProgram(program)
      const safeTiers = tiers.map(normalizeTier)
      const safeCampaigns = campaigns.map(item => serializeCampaignForPersistence(item, safeProgram.id))
      const safeCouponSeries = couponSeries.map(normalizeCouponSeries)

      const result = await saveLoyaltyWorkspace({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, {
        program: safeProgram,
        tiers: safeTiers,
        campaigns: safeCampaigns,
        couponSeries: safeCouponSeries,
        referralPrograms,
      })

      const persistedCouponSeries = Array.isArray(result.couponSeries)
        ? result.couponSeries.map(normalizeCouponSeries)
        : safeCouponSeries

      setProgram(safeProgram)
      setTiers(safeTiers)
      const hydratedCampaigns = safeCampaigns.map(hydrateCampaignForEditor)
      setCampaigns(hydratedCampaigns)
      setCouponSeries(persistedCouponSeries)
      setSchemaReady(result.schemaReady)
      setDatabaseUnavailable(false)
      setUsingSessionSnapshot(false)
      loyaltyWorkspaceSessionCache.set(workspaceCacheKey, {
        scopeInfo: getLoyaltyScopeInfo(workspace),
        schemaReady: Boolean(result.schemaReady),
        categorySchemaReady,
        customerSchemaReady,
        databaseUnavailable: false,
        program: safeProgram,
        tiers: safeTiers,
        campaigns: hydratedCampaigns,
        customerCategories,
        categoryAudienceAssignments,
        categoryAudienceCounts,
        couponSeries: persistedCouponSeries,
        referralPrograms,
        customerInsights,
      })
      writeWorkspaceSessionSnapshot(workspaceCacheKey, {
        scopeInfo: getLoyaltyScopeInfo(workspace),
        schemaReady: Boolean(result.schemaReady),
        categorySchemaReady,
        customerSchemaReady,
        databaseUnavailable: false,
        program: safeProgram,
        tiers: safeTiers,
        campaigns: hydratedCampaigns,
        customerCategories,
        categoryAudienceAssignments,
        categoryAudienceCounts,
        couponSeries: persistedCouponSeries,
        referralPrograms,
        customerInsights,
      })
      toast('Sadakat altyapisi production tablolara kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Sadakat yonetimi kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function resetDefaults() {
    const defaultProgram = normalizeProgram(DEFAULT_LOYALTY_PROGRAM)
    const defaultCampaigns = DEFAULT_LOYALTY_CAMPAIGNS.map(item => normalizeCampaign({ ...item, programId: defaultProgram.id }))
    setProgram(defaultProgram)
    setTiers(DEFAULT_LOYALTY_TIERS.map(normalizeTier))
    setCampaigns(defaultCampaigns)
    setCouponSeries(DEFAULT_COUPON_SERIES.map(normalizeCouponSeries))
    setSelectedCampaignId(defaultCampaigns[0]?.id || '')
    toast('Varsayilan sadakat taslagi yuklendi', 'info')
  }

  const activeRules = selectedCampaign?.applicableRules || []
  const periodicRules = selectedCampaign?.periodicRules || []
  const visibleRules = activeRuleTab === 'periodic' ? periodicRules : activeRules

  return (
    <div>
      <Header
        title={isListMode ? 'Sadakat Kampanyalari' : 'Kampanya Editoru'}
        subtitle={isListMode
          ? (scopeInfo?.description || 'Aktif ve pasif kampanyalari listeleyin, filtreleyin ve yeni kampanya olusturun')
          : (selectedCampaign?.name || 'Secilen kampanyanin hedef kitlesini, kosullarini ve eylemlerini yonetin')}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isEditorMode && (
              <button className="btn-o" onClick={() => navigate('/sadakat')}>
                <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
                Listeye Don
              </button>
            )}
            <button className="btn-o" onClick={() => navigate('/sadakat/kategoriler')}>
              <i className="fa-solid fa-tags" style={{ marginRight: 6 }} />
              Musteri Kategorileri
            </button>
            <button className="btn-o" onClick={() => navigate('/sadakat/kampanya-sihirbazi-onizleme')}>
              <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: 6 }} />
              Akilli Kampanya Kur
            </button>
            <button className="btn-o" onClick={() => addCampaign(true)}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Yeni Kampanya
            </button>
            {isListMode && <button className="btn-o" onClick={resetDefaults} disabled={databaseUnavailable}>Taslak Yukle</button>}
            <button className="btn-p" onClick={saveAll} disabled={saving || loading || databaseUnavailable || !schemaReady}>
              {saving
                ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor</>
                : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />Kaydet</>}
            </button>
          </div>
        )}
      />

      <div className="card" style={{ padding: 18, marginBottom: 18, border: '1px solid #dbeafe', background: '#f8fbff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>Aktif Kapsam</div>
            <div style={{ marginTop: 6, fontSize: '.9rem', color: '#1e3a8a', fontWeight: 700 }}>
              {scopeInfo?.label || 'Sadakat kapsami yukleniyor'}
            </div>
            <div style={{ marginTop: 6, fontSize: '.8rem', color: '#64748b' }}>
              Bu ekrandaki degisiklikler secili kapsam icin kayit altina alinir.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8, minWidth: 220 }}>
            <div style={{
              borderRadius: 12,
              padding: '10px 12px',
              background: usingSessionSnapshot ? '#eff6ff' : (schemaReady ? '#ecfdf5' : '#fff7ed'),
              color: usingSessionSnapshot ? '#1d4ed8' : (schemaReady ? '#166534' : '#9a3412'),
              fontWeight: 700,
              fontSize: '.82rem',
            }}>
              {usingSessionSnapshot
                ? 'Son basarili sadakat verisi gosteriliyor'
                : (schemaReady ? 'Sadakat tablolari hazir' : 'Sadakat tablolari henuz yok')}
            </div>
            <div style={{
              borderRadius: 12,
              padding: '10px 12px',
              background: customerSchemaReady ? '#eff6ff' : '#f8fafc',
              color: customerSchemaReady ? '#1d4ed8' : '#475569',
              fontWeight: 700,
              fontSize: '.82rem',
            }}>
              {customerSchemaReady ? 'Musteri master alanlari okunuyor' : 'Musteri master ek alanlari henuz yok'}
            </div>
            <div style={{
              borderRadius: 12,
              padding: '10px 12px',
              background: categorySchemaReady ? '#f5f3ff' : '#f8fafc',
              color: categorySchemaReady ? '#6d28d9' : '#475569',
              fontWeight: 700,
              fontSize: '.82rem',
            }}>
              {categorySchemaReady ? 'Musteri kategori tablosu hazir' : 'Kategori tablosu henuz yok'}
            </div>
          </div>
        </div>
      </div>

      {loadDiagnostics.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 18, border: '1px solid #facc15', background: '#fffbeb' }}>
          <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 8 }}>Sadakat veri tanilari</div>
          <div style={{ fontSize: '.82rem', color: '#78350f', lineHeight: 1.6 }}>
            Yuzeyde bos liste gorunse bile backend kaynakli veya donusum kaynakli hata mesajlarini burada gosteriyoruz.
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {loadDiagnostics.slice(0, 8).map((issue, index) => (
              <div key={`${issue.code || 'issue'}-${index}`} style={{ fontSize: '.8rem', color: '#78350f' }}>
                <strong>{issue.code || 'load_issue'}:</strong> {issue.message || 'Ayrinti yok'}
              </div>
            ))}
          </div>
        </div>
      )}

      {databaseUnavailable && (
        <div className="card" style={{ padding: 16, marginBottom: 18, border: '1px solid #fed7aa', background: '#fff7ed' }}>
          <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: 6 }}>
            {usingSessionSnapshot ? 'Sadakat verisi yeniden okunamadi' : 'Sadakat tablolari eksik'}
          </div>
          <div style={{ fontSize: '.82rem', color: '#9a3412', lineHeight: 1.6 }}>
            {usingSessionSnapshot
              ? 'Bu yenilemede production tablolardan tutarli cevap alinmadi. Liste ve kampanyalar sifirlanmasin diye ayni browser oturumundaki son basarili veri korunuyor; kaydetme islemi ise bilincli olarak kapali kalir.'
              : 'Buradaki sorun genel veritabani baglantisi degil; sadakat modulunun cekirdek production tablolari bu ortamda henuz hazir degil veya okunamiyor. Bu durumda kampanya verisi `settings` fallback\'e dusurulmez ve kaydetme islemi bilincli olarak kapatilir.'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        {stats.map(card => <StatsCard key={card.label} {...card} />)}
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <SectionTitle
          title={isListMode ? 'Kampanya Listesi' : 'Kampanya Detayi'}
          subtitle={isListMode
            ? 'Bu ekrana girildiginde once mevcut kampanyalar listelenir. Aktif/pasif filtreleyip bir kampanyayi duzenlemek veya yeni kampanya acmak icin kullanin.'
            : 'Bu ekranda sadece secilen kampanyanin temel ayarlari ve kural bloklari duzenlenir.'}
          action={(
            isListMode ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className={campaignStatusFilter === 'all' ? 'btn-p' : 'btn-o'} onClick={() => setCampaignStatusFilter('all')}>
                  Hepsi ({campaignStats.all})
                </button>
                <button className={campaignStatusFilter === 'active' ? 'btn-p' : 'btn-o'} onClick={() => setCampaignStatusFilter('active')}>
                  Aktif ({campaignStats.active})
                </button>
                <button className={campaignStatusFilter === 'passive' ? 'btn-p' : 'btn-o'} onClick={() => setCampaignStatusFilter('passive')}>
                  Pasif ({campaignStats.passive})
                </button>
              </div>
            ) : selectedCampaign ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn-o" onClick={() => duplicateCampaign(selectedCampaign.id)}>Kopyala</button>
                <button className="btn-danger" onClick={() => removeCampaign(selectedCampaign.id)}>Sil</button>
              </div>
            ) : null
            
          )}
        />

        <div>
          {isListMode ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.3fr) 180px 220px auto', gap: 10, alignItems: 'end' }}>
                <div>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Ara</div>
                  <input className="f-input" value={campaignSearch} onChange={event => setCampaignSearch(event.target.value)} placeholder="Kampanya adi, kodu veya aciklama" />
                </div>
                <div>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Durum</div>
                  <div className="sel-wrap">
                    <select className="f-input" value={campaignStatusFilter} onChange={event => setCampaignStatusFilter(event.target.value)}>
                      <option value="all">Hepsi</option>
                      <option value="active">Aktif</option>
                      <option value="passive">Pasif</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Hedef Kitle</div>
                  <div className="sel-wrap">
                    <select className="f-input" value={campaignAudienceFilter} onChange={event => setCampaignAudienceFilter(event.target.value)}>
                      <option value="all">Tum Hedefler</option>
                      {CAMPAIGN_AUDIENCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <MiniBadge active={campaignStats.active > 0} trueLabel={`${campaignStats.active} aktif`} falseLabel="Aktif yok" />
                  <MiniBadge active={campaignStats.passive > 0} trueLabel={`${campaignStats.passive} pasif`} falseLabel="Pasif yok" />
                </div>
              </div>

              {filteredCampaigns.length === 0 ? (
                <div style={{ border: '1px dashed #cbd5e1', borderRadius: 16, padding: 24, textAlign: 'center', color: '#64748b' }}>
                  Bu filtrede kampanya bulunmuyor.
                </div>
              ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                      <thead style={{ background: '#f8fafc' }}>
                        <tr>
                          {['Kampanya', 'Kod', 'Hedef Kitle', 'Tetik', 'Tip', 'Durum', 'Islem'].map(label => (
                            <th key={label} style={{ textAlign: 'left', padding: '12px 14px', fontSize: '.74rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: '1px solid #e2e8f0' }}>
                              {label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCampaigns.map(campaign => (
                          <tr key={campaign.id}>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7' }}>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{campaign.name || 'Yeni Kampanya'}</div>
                              <div style={{ marginTop: 4, fontSize: '.76rem', color: '#64748b', maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {campaign.description || 'Aciklama girilmedi'}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7', fontSize: '.82rem', color: '#334155', fontWeight: 700 }}>{campaign.code || '-'}</td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7', fontSize: '.82rem', color: '#334155' }}>{getOptionLabel(CAMPAIGN_AUDIENCE_OPTIONS, campaign.audienceType)}</td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7', fontSize: '.82rem', color: '#334155' }}>{getOptionLabel(CAMPAIGN_TRIGGER_OPTIONS, campaign.triggerType)}</td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7', fontSize: '.82rem', color: '#334155' }}>{getOptionLabel(CAMPAIGN_TYPE_OPTIONS, campaign.campaignType)}</td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7' }}>
                              <MiniBadge active={campaign.active} trueLabel="Aktif" falseLabel="Pasif" />
                            </td>
                            <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f7' }}>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="btn-o" onClick={() => navigate(`/sadakat/kampanya/${campaign.id}`)}>Duzenle</button>
                                <button className="btn-o" onClick={() => duplicateCampaign(campaign.id)}>Kopyala</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : !selectedCampaign ? (
            <div style={{ border: '1px dashed #cbd5e1', borderRadius: 16, padding: 24, textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontWeight: 700, color: '#475569' }}>Bu rota icin kampanya taslagi bulunamadi.</div>
              <div style={{ marginTop: 8 }}>Listeye donun veya buradan yeni bir kampanya taslagi olusturun.</div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button className="btn-o" type="button" onClick={() => navigate('/sadakat')}>
                  Listeye Don
                </button>
                <button className="btn-p" type="button" onClick={() => addCampaign(true)}>
                  Yeni Kampanya Ac
                </button>
              </div>
            </div>
          ) : (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 80, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, overflowY: 'auto' }}>
              <div className="card" style={{ width: 'min(1180px, 100%)', padding: 18, margin: '24px 0', boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.05rem' }}>{selectedCampaign.name || 'Kampanya Editoru'}</div>
                    <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                      Secilen kampanyayi bu detay penceresinde duzenleyin.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn-o" onClick={() => duplicateCampaign(selectedCampaign.id)}>Kopyala</button>
                    <button className="btn-danger" onClick={() => removeCampaign(selectedCampaign.id)}>Sil</button>
                    <button className="btn-o" onClick={() => navigate('/sadakat')}>Kapat</button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                <div style={{ position: 'sticky', top: 0, zIndex: 5, border: '1px solid #fde68a', background: '#fffdf5', borderRadius: 16, padding: 14, boxShadow: '0 10px 24px rgba(15,23,42,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 900, color: '#92400e', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Kampanya Ozeti</div>
                      <div style={{ marginTop: 6, fontSize: '.95rem', color: '#1f2937', lineHeight: 1.6 }}>
                        {summaryText || 'Kampanya adi, tarih, hedef kitle, kosul ve eylem bilgileri burada ozetlenecek.'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        { key: 'general', label: 'Genel Ayarlar' },
                        { key: 'conditions', label: 'Kosullar' },
                        { key: 'actions', label: 'Eylemler' },
                      ].map(tab => (
                        <button
                          key={tab.key}
                          className={editorTab === tab.key ? 'btn-p' : 'btn-o'}
                          onClick={() => setEditorTab(tab.key)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {editorTab === 'general' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>Kampanya Ayarlari</div>
                    </div>
                    <button className="btn-o" onClick={() => setShowCampaignAdvanced(current => !current)}>
                      {showCampaignAdvanced ? 'Gelismisi Gizle' : 'Gelismis Ayarlar'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                    {campaignStructure.map(section => (
                      <div
                        key={section.key}
                        style={{
                          borderRadius: 14,
                          border: `1px solid ${section.ready ? '#bfdbfe' : '#fde68a'}`,
                          background: section.ready ? '#f8fbff' : '#fffaf0',
                          padding: 12,
                        }}
                      >
                        <div style={{ fontSize: '.74rem', fontWeight: 900, color: section.ready ? '#1d4ed8' : '#b45309', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          {section.title}
                        </div>
                        <div style={{ marginTop: 6, fontSize: '.86rem', color: '#0f172a', fontWeight: 700, lineHeight: 1.5 }}>
                          {section.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Kampanya Adi</div>
                      <input className="f-input" value={selectedCampaign.name} onChange={event => updateCampaign(selectedCampaign.id, 'name', event.target.value)} placeholder="Kampanya adi" />
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Ne Zaman Baslar</div>
                      <input className="f-input" type="datetime-local" value={formatDateTimeInput(selectedCampaign.startsAt)} onChange={event => updateCampaign(selectedCampaign.id, 'startsAt', event.target.value)} />
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Ne Zaman Biter</div>
                      <input className="f-input" type="datetime-local" value={formatDateTimeInput(selectedCampaign.endsAt)} onChange={event => updateCampaign(selectedCampaign.id, 'endsAt', event.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr 0.6fr', gap: 10, marginTop: 10 }}>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Aciklama</div>
                      <textarea className="f-input" rows={3} value={selectedCampaign.description} onChange={event => updateCampaign(selectedCampaign.id, 'description', event.target.value)} placeholder="Bu kampanya ne icin var?" />
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Kimlere Yapilacak</div>
                      <div className="sel-wrap">
                        <select
                          className="f-input"
                          value={selectedCampaign.audienceType === 'tagged_customers' ? 'all' : selectedCampaign.audienceType}
                          onChange={event => updateCampaign(selectedCampaign.id, 'audienceType', event.target.value)}
                        >
                          {availableAudienceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5, marginTop: 6 }}>
                        Musteri kategori hedefleri artik bu alandan degil, kosullar sekmesindeki kategori kosullari ile tanimlanir.
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Kasada Nasil Davransin</div>
                      <div className="sel-wrap">
                        <select className="f-input" value={selectedCampaign.applicationMode} onChange={event => updateCampaign(selectedCampaign.id, 'applicationMode', event.target.value)}>
                          {CAMPAIGN_APPLICATION_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                      <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5, marginTop: 6 }}>
                        {getCampaignApplicationModeHint(selectedCampaign.applicationMode)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Durum</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                          <input type="checkbox" checked={selectedCampaign.active} onChange={event => updateCampaign(selectedCampaign.id, 'active', event.target.checked)} />
                          Aktif
                        </label>
                      </div>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>Birlesme Kurali</div>
                      {(() => {
                        const currentMode = getCampaignMergeMode(selectedCampaign)
                        const currentRuleDetails = STACKING_RULE_DETAILS[currentMode]

                        return (
                          <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                        {STACKING_RULE_OPTIONS.map(opt => {
                          const isActive = currentMode === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              title={opt.desc}
                              onClick={() => {
                                if (opt.value === 'stackable') {
                                  updateCampaign(selectedCampaign.id, 'stackable', true)
                                  updateCampaign(selectedCampaign.id, 'exclusionGroup', '')
                                } else if (opt.value === 'exclusive') {
                                  updateCampaign(selectedCampaign.id, 'stackable', false)
                                  updateCampaign(selectedCampaign.id, 'exclusionGroup', '')
                                } else {
                                  updateCampaign(selectedCampaign.id, 'stackable', false)
                                  if (!selectedCampaign.exclusionGroup) {
                                    updateCampaign(selectedCampaign.id, 'exclusionGroup', 'indirim_grubu')
                                  }
                                }
                              }}
                              style={{
                                padding: '6px 14px',
                                borderRadius: 20,
                                border: `2px solid ${isActive ? opt.color : '#e2e8f0'}`,
                                background: isActive ? `${opt.color}18` : 'transparent',
                                color: isActive ? opt.color : '#64748b',
                                fontWeight: 800,
                                fontSize: '.78rem',
                                cursor: 'pointer',
                              }}
                            >{opt.label}</button>
                          )
                        })}
                      </div>
                      <div style={{ display: 'grid', gap: 6, marginBottom: 10, padding: 12, borderRadius: 12, border: '1px solid #dbeafe', background: '#f8fbff' }}>
                        <div style={{ fontSize: '.76rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Cakisma mantigi
                        </div>
                        <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.6 }}>
                          <strong>{STACKING_RULE_OPTIONS.find(opt => opt.value === currentMode)?.label}:</strong> {currentRuleDetails.summary}
                        </div>
                        <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.6 }}>
                          <strong>Kullanim:</strong> {currentRuleDetails.usage}
                        </div>
                        <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.6, fontStyle: 'italic' }}>
                          <strong>Oncelik:</strong> {currentRuleDetails.priority}
                        </div>
                        <div style={{ display: 'grid', gap: 6, paddingTop: 2 }}>
                          <div style={{ fontSize: '.74rem', color: '#1d4ed8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Ornek senaryolar
                          </div>
                          <div style={{ display: 'grid', gap: 6 }}>
                            {currentRuleDetails.examples.map((example, index) => (
                              <div key={`${currentMode}-example-${index}`} style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.6 }}>
                                <strong>{index + 1}.</strong> {example}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                          </>
                        )
                      })()}
                      {!selectedCampaign.stackable && (
                        <div style={{ display: 'grid', gap: 8 }}>
                          {selectedCampaign.exclusionGroup !== undefined && (
                            <div>
                              <div style={{ fontSize: '.72rem', color: '#94a3b8', marginBottom: 4 }}>
                                {selectedCampaign.exclusionGroup ? 'Grup adi — ayni gruptaki kampanyalar birlikte calismaz' : 'Munhasir — tum munhasir kampanyalarla catisir (oncelik belirler)'}
                              </div>
                              {selectedCampaign.exclusionGroup !== '' && (
                                <input
                                  className="f-input"
                                  value={selectedCampaign.exclusionGroup}
                                  onChange={event => updateCampaign(selectedCampaign.id, 'exclusionGroup', event.target.value)}
                                  placeholder="ornek: indirim_grubu"
                                  style={{ marginBottom: 6 }}
                                />
                              )}
                              {selectedCampaign.exclusionGroup && (() => {
                                const siblings = campaigns.filter(c =>
                                  c.id !== selectedCampaign.id &&
                                  !c.stackable &&
                                  c.exclusionGroup === selectedCampaign.exclusionGroup
                                )
                                return siblings.length > 0 ? (
                                  <div style={{ fontSize: '.72rem', color: '#94a3b8', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px' }}>
                                    <span style={{ fontWeight: 800, color: '#64748b' }}>Ayni grupta: </span>
                                    {siblings.map(s => s.name).join(', ')}
                                  </div>
                                ) : null
                              })()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: '.72rem', color: '#94a3b8', marginBottom: 4 }}>Catisma Onceligi — dusuk sayi daha yuksek oncelik (kazanan olur)</div>
                            <input
                              className="f-input"
                              type="number"
                              min={1}
                              value={formatNumberInputValue(selectedCampaign.priority, '1')}
                              onChange={event => updateCampaign(selectedCampaign.id, 'priority', event.target.value)}
                              placeholder="Oncelik (1 = en yuksek)"
                              style={{ maxWidth: 160 }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {usesLegacyCategoryAudience(selectedCampaign) && (
                    <div style={{ marginTop: 12, border: '1px solid #fbcfe8', background: '#fffafc', borderRadius: 14, padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '.78rem', color: '#9d174d', fontWeight: 900 }}>Legacy Musteri Kategorisi Hedefi</div>
                          <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 3 }}>
                            Bu kampanyada eski tip kategori hedefi bulundu. Bunu koşul bloklarına taşırsan kampanya yeni editör mantığı ile uyumlu olur.
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="btn-o" type="button" onClick={() => navigate('/sadakat/kategoriler')}>
                            Kategorileri Yonet
                          </button>
                          <button className="btn-p" type="button" onClick={() => moveLegacyAudienceToConditions(selectedCampaign.id)}>
                            Kosullara Tasi
                          </button>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: '.76rem', color: '#475569', lineHeight: 1.6 }}>
                        Secili kategori sayisi: {(selectedCampaign.audienceCategoryIds || []).length} | Eslesen musteri: {selectedAudienceCustomerCount}
                      </div>
                    </div>
                  )}

                  {showCampaignAdvanced && (
                    <div style={{ marginTop: 12, borderTop: '1px dashed #cbd5e1', paddingTop: 12, display: 'grid', gap: 10 }}>
                      <div style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 800 }}>
                        Gelismis alanlar. MVP akista bunlar zorunlu degil; detayli segmentleme ve entegrasyon icin tutulur.
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                        <input className="f-input" value={selectedCampaign.code} onChange={event => updateCampaign(selectedCampaign.id, 'code', event.target.value)} placeholder="Kod" />
                        <div className="sel-wrap">
                          <select className="f-input" value={selectedCampaign.triggerType} onChange={event => updateCampaign(selectedCampaign.id, 'triggerType', event.target.value)}>
                            {CAMPAIGN_TRIGGER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <div className="sel-wrap">
                          <select className="f-input" value={selectedCampaign.campaignType} onChange={event => updateCampaign(selectedCampaign.id, 'campaignType', event.target.value)}>
                            {CAMPAIGN_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                        <input className="f-input" type="number" min={0} value={formatNumberInputValue(selectedCampaign.priority)} onChange={event => updateCampaign(selectedCampaign.id, 'priority', event.target.value)} placeholder="Oncelik" />
                        <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(selectedCampaign.rewardValue)} onChange={event => updateCampaign(selectedCampaign.id, 'rewardValue', event.target.value)} placeholder="Odul degeri" />
                      </div>
                      <div style={{ fontSize: '.74rem', color: '#94a3b8' }}>
                        Program tipi: {getOptionLabel(PROGRAM_TYPE_OPTIONS, program.programType)}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {editorTab !== 'general' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>Kosullar ve Eylemler</div>
                      <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                        Kampanya bloklarını iki parçalı düzende yönetin: solda koşul, sağda aynı bloğun eylemi.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className={activeRuleTab === 'applicable' ? 'btn-p' : 'btn-o'}
                        onClick={() => setActiveRuleTab('applicable')}
                      >
                        Siparis Aninda
                      </button>
                      <button
                        className={activeRuleTab === 'periodic' ? 'btn-p' : 'btn-o'}
                        onClick={() => setActiveRuleTab('periodic')}
                      >
                        Zaman Bazli
                      </button>
                      <button className="btn-o" onClick={() => addRule(selectedCampaign.id, activeRuleTab, 'conditions')}>
                        <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                        Kosul Bloğu Ekle
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <HelperNote title="Ornek kurulum">
                      Ornek kampanya: zzz musteri kategorisi + Pazartesi 18:00-20:00 + siparis tutari en az 500 TL. Solda aynı bloğa birden fazla koşul, sağda ise o blok çalışınca uygulanacak bir veya birden fazla eylem ekleyebilirsiniz.
                    </HelperNote>

                  </div>

                  {visibleRules.length === 0 ? (
                    <div style={{ border: '1px dashed #cbd5e1', borderRadius: 14, padding: 18, color: '#64748b', textAlign: 'center' }}>
                      Bu kampanyada henüz blok yok.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {visibleRules.map(rule => (
                        <RuleRow
                          key={rule.id}
                          rule={rule}
                          summaryContext={ruleSummaryContext}
                          onEditCondition={conditionId => openRuleEditor('conditions', activeRuleTab, rule.id, conditionId, selectedCampaign.id)}
                          onEditAction={actionId => openRuleEditor('actions', activeRuleTab, rule.id, actionId, selectedCampaign.id)}
                          onAddCondition={() => addConditionToRule(selectedCampaign.id, activeRuleTab, rule.id)}
                          onAddAction={() => addActionToRule(selectedCampaign.id, activeRuleTab, rule.id)}
                          onToggleConditionJoiner={mode => updateRuleConditionJoinerMode(selectedCampaign.id, activeRuleTab, rule.id, mode)}
                          onDeleteCondition={conditionId => removeConditionFromRule(selectedCampaign.id, activeRuleTab, rule.id, conditionId)}
                          onDeleteAction={actionId => removeActionFromRule(selectedCampaign.id, activeRuleTab, rule.id, actionId)}
                          onDelete={() => removeRule(selectedCampaign.id, activeRuleTab, rule.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                )}

                {editorTab === 'conditions' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#f8fafc' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Kosul Kutuphanesi</div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    <div className="sel-wrap">
                      <select
                        className="f-input"
                        value={conditionLibraryPreviewKey}
                        onChange={event => setConditionLibraryPreviewKey(event.target.value)}
                      >
                        {CONDITION_LIBRARY.map(item => {
                          const status = getConditionRuntimeStatus(item.key)
                          return <option key={item.key} value={item.key}>{`${item.label} - ${status.label}`}</option>
                        })}
                      </select>
                    </div>
                    {selectedConditionLibraryItem ? (
                      <div style={{ borderRadius: 12, border: '1px solid #dbeafe', padding: 12, background: '#fff' }}>
                        <div style={{ fontWeight: 700, color: '#1e293b' }}>{selectedConditionLibraryItem.label}</div>
                        <div style={{ marginTop: 6, fontSize: '.76rem', color: '#64748b', lineHeight: 1.5 }}>
                          {selectedConditionLibraryItem.description}
                        </div>
                        <RuntimeStatusNote status={getConditionRuntimeStatus(selectedConditionLibraryItem.key)} />
                      </div>
                    ) : null}
                  </div>
                </div>
                )}

                {ruleEditorState && activeRuleEditorRule && activeRuleEditorCampaign && activeRuleEditorItem ? (
                  <EditorModal
                    title={ruleEditorState.mode === 'actions' ? 'Eylemi Duzenle' : 'Kosulu Duzenle'}
                    subtitle={ruleEditorState.scope === 'periodic' ? 'Zaman bazlı akışa bağlı blok' : 'Sipariş anında çalışan blok'}
                    onClose={closeRuleEditor}
                  >
                    {ruleEditorState.mode === 'actions' ? (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ border: '1px solid #bfdbfe', background: '#f8fbff', borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: '.74rem', color: '#1d4ed8', fontWeight: 900, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Uygulama notu
                          </div>
                          <div style={{ fontSize: '.84rem', color: '#334155', fontWeight: 700 }}>
                            {`${buildAudienceSummary(activeRuleEditorCampaign, customerCategories)} icin, ${buildConditionScenarioText(activeRuleEditorRule, ruleSummaryContext)} uygulanacak eylemi tanimlayin.`}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
                          <FieldStack label="Eylem tipi">
                            <div className="sel-wrap">
                              <select
                                className="f-input"
                                value={activeRuleEditorItem.actionType}
                                onChange={event => updateActionItem(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'actionType', event.target.value)}
                              >
                                {ACTION_TYPE_OPTIONS.map(option => {
                                  return <option key={option.value} value={option.value}>{option.label}</option>
                                })}
                              </select>
                            </div>
                          </FieldStack>
                          <FieldStack label="Kisa ozet">
                            <input
                              className="f-input"
                              value={activeRuleEditorItem.actionSummary || ''}
                              onChange={event => updateActionItem(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'actionSummary', event.target.value)}
                              placeholder={buildActionSummary({ ...activeRuleEditorRule, actionType: activeRuleEditorItem.actionType, actionSummary: activeRuleEditorItem.actionSummary, actionConfig: activeRuleEditorItem.actionConfig }, ruleSummaryContext)}
                            />
                          </FieldStack>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                            <input type="checkbox" checked={activeRuleEditorRule.stopProcessing} onChange={event => updateRule(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, 'stopProcessing', event.target.checked)} />
                            Durdur
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                            <input type="checkbox" checked={activeRuleEditorRule.active} onChange={event => updateRule(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, 'active', event.target.checked)} />
                            Aktif
                          </label>
                        </div>
                        <RuntimeStatusNote status={getActionRuntimeStatus(activeRuleEditorItem.actionType)} />

                        <div style={{ border: '1px solid #fde68a', background: '#fffaf0', borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: '.74rem', color: '#b45309', fontWeight: 900, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Eylem ayarlari
                          </div>
                          {renderActionDetails({
                            ...activeRuleEditorRule,
                            actionType: activeRuleEditorItem.actionType,
                            actionSummary: activeRuleEditorItem.actionSummary,
                            actionConfig: activeRuleEditorItem.actionConfig,
                          }, ruleEditorState.scope, patch => patchActionItemConfig(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, patch))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end' }}>
                          <FieldStack label="Kosul tipi">
                            <div style={{ display: 'grid', gap: 8 }}>
                              <div className="sel-wrap">
                                <select
                                  className="f-input"
                                  value={activeRuleEditorItem.conditionKey}
                                  onChange={event => updateConditionItem(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'conditionKey', event.target.value)}
                                >
                                  {CONDITION_LIBRARY.map(option => {
                                    return <option key={option.key} value={option.key}>{option.label}</option>
                                  })}
                                </select>
                              </div>
                              <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.5 }}>
                                {getConditionMeta(activeRuleEditorItem.conditionKey).description}
                              </div>
                              <RuntimeStatusNote status={getConditionRuntimeStatus(activeRuleEditorItem.conditionKey)} />
                            </div>
                          </FieldStack>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                            <input type="checkbox" checked={activeRuleEditorRule.stopProcessing} onChange={event => updateRule(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, 'stopProcessing', event.target.checked)} />
                            Durdur
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                            <input type="checkbox" checked={activeRuleEditorRule.active} onChange={event => updateRule(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, 'active', event.target.checked)} />
                            Aktif
                          </label>
                        </div>

                        <div style={{ border: '1px solid #bfdbfe', background: '#f8fbff', borderRadius: 12, padding: 12 }}>
                          <div style={{ fontSize: '.74rem', color: '#1d4ed8', fontWeight: 900, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            Kosul ayarlari
                          </div>
                          {renderConditionDetails({
                            ...activeRuleEditorRule,
                            conditionKey: activeRuleEditorItem.conditionKey,
                            conditionConfig: activeRuleEditorItem.conditionConfig,
                          }, ruleEditorState.scope, {
                            onPatch: patch => patchConditionItemConfig(activeRuleEditorCampaign.id, ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, patch),
                          })}
                        </div>
                      </div>
                    )}
                  </EditorModal>
                ) : null}

                <div style={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  padding: '14px 16px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.96)',
                  boxShadow: '0 -8px 24px rgba(15,23,42,0.08)',
                  backdropFilter: 'blur(6px)',
                }}>
                  <div style={{ fontSize: '.8rem', color: '#64748b' }}>
                    Degisiklikleri kaydetmek icin sagdaki butonu kullanin.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn-o" type="button" onClick={() => navigate('/sadakat')}>
                      Kapat
                    </button>
                    <button className="btn-p" type="button" onClick={saveAll} disabled={saving || loading || databaseUnavailable || !schemaReady}>
                      {saving
                        ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor</>
                        : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />Kaydet</>}
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}
      </div>
      </div>
    </div>
  )
}
