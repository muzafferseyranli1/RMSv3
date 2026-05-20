import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '@/components/layout/Header'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import {
  ACTION_TYPE_OPTIONS,
  CAMPAIGN_APPLICATION_MODE_OPTIONS,
  CAMPAIGN_AUDIENCE_OPTIONS,
  CAMPAIGN_CHANNEL_OPTIONS,
  CAMPAIGN_TRIGGER_OPTIONS,
  CAMPAIGN_TYPE_OPTIONS,
  COMPARISON_OPTIONS,
  CONDITION_LIBRARY,
  DEFAULT_LOYALTY_PROGRAM,
  PERIOD_OPTIONS,
  formatDateTimeInput,
  getDefaultActionConfig,
  getDefaultConditionConfig,
  getLoyaltyScopeInfo,
  getSalesChannelConditionValues,
  loadLoyaltyCustomerCategories,
  loadLoyaltyWorkspace,
  normalizeCampaign,
  normalizeProgram,
  normalizeRule,
  saveLoyaltyWorkspace,
} from '@/lib/loyalty'
import {
  getEditorRuleActions,
  getEditorRuleConditions,
  getStandaloneActionConfig,
  getStandaloneConditionConfig,
  hydrateCampaignForEditor,
  hydrateEditorRuleFromDraft,
  serializeCampaignForPersistence,
} from '@/lib/loyaltyCampaignEditorModel'
import {
  RUNTIME_STATUS_META,
  getConditionRuntimeStatus,
  getActionRuntimeStatus,
  LOCAL_READY_CONDITIONS,
  SERVER_REQUIRED_CONDITIONS,
  MODEL_ONLY_CONDITIONS,
  LOCAL_READY_ACTIONS,
  VALUE_LEDGER_ACTIONS,
  MODEL_ONLY_ACTIONS,
  PRESENTATION_ONLY_ACTIONS,
} from '@/lib/loyaltyRuntimeStatus'

function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
    if (attempt < attempts - 1) await wait(350 * (attempt + 1))
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

const GOAL_PRESETS = [
  {
    value: 'new_customer',
    title: 'Yeni musteri kazan',
    description: 'Ilk aktivite, referans ve hos geldin odulu odakli baslangic akisi.',
    audienceType: 'new_customers',
    applicationMode: 'prompt',
    draft: {
      applicable: [
        {
          conditionKey: 'days_since_first_activity',
          actionType: 'issue_coupon',
        },
      ],
      periodic: [],
    },
  },
  {
    value: 'basket',
    title: 'Sepet ortalamasini buyut',
    description: 'Sepet esigi, urun adedi ve siparis indirimiyle hizli satis kampanyasi.',
    audienceType: 'all',
    applicationMode: 'prompt',
    draft: {
      applicable: [
        {
          conditionKey: 'order_total',
          actionType: 'total_order_discount_percent',
        },
      ],
      periodic: [],
    },
  },
  {
    value: 'frequency',
    title: 'Ziyaret sikligini artir',
    description: 'Donem icinde siparis sayisi veya son ziyaret uzerinden geri kazan.',
    audienceType: 'inactive_customers',
    applicationMode: 'prompt',
    draft: {
      applicable: [
        {
          conditionKey: 'period_order_count',
          actionType: 'bonus_points',
        },
      ],
      periodic: [],
    },
  },
  {
    value: 'loyalty',
    title: 'Sadakat uyesine deger kat',
    description: 'Dogum gunu, puan, kupon ve kategori zenginlestirmesiyle calis.',
    audienceType: 'members',
    applicationMode: 'auto',
    draft: {
      applicable: [
        {
          conditionKey: 'birthday',
          actionType: 'bonus_points',
        },
      ],
      periodic: [],
    },
  },
  {
    value: 'event',
    title: 'Zaman bazli etkinlik kur',
    description: 'Takvim ve saat penceresi kullanan tekrarlayan kampanya tohumu.',
    audienceType: 'all',
    applicationMode: 'auto',
    draft: {
      applicable: [
        {
          conditionKey: 'happy_hour',
          actionType: 'total_order_discount_percent',
        },
      ],
      periodic: [
        {
          conditionKey: 'calendar_schedule',
          actionType: 'send_sms',
        },
      ],
    },
  },
  {
    value: 'stamp',
    title: 'Damga karti mantigi',
    description: 'Tekrarlayan ziyaret veya harcama hedeflerinden kupon ya da odul ver.',
    audienceType: 'members',
    applicationMode: 'auto',
    draft: {
      applicable: [
        {
          conditionKey: 'period_order_count',
          actionType: 'issue_coupon',
        },
      ],
      periodic: [],
    },
  },
]

const WIZARD_STEPS = [
  { key: 'goal', title: 'Hedef' },
  { key: 'scope', title: 'Kapsam' },
  { key: 'trigger', title: 'Tetikleyici' },
  { key: 'reward', title: 'Kazanim' },
  { key: 'coupon-points', title: 'Kupon ve Puan' },
  { key: 'operations', title: 'Operasyon' },
  { key: 'review', title: 'Kaydet' },
]

const EDITOR_MODE_OPTIONS = [
  {
    value: 'simple',
    label: 'Basit mod',
    description: 'Hedef, kitle, tetikleyici ve kazanim dilinde ilerler; teknik kural modeli arkada uretilir.',
  },
  {
    value: 'advanced',
    label: 'Gelismis mod',
    description: 'Mevcut campaign editor gucundeki condition/action bloklarini ayni kampanya uzerinde acar.',
  },
]

const SIMPLE_CONDITION_CHOICES = [
  {
    value: 'order_total',
    title: 'Sepet tutarina gore',
    description: 'Sepet belirli tutari gecince kampanya calissin.',
    triggerType: 'cart_total',
    scope: 'applicable',
  },
  {
    value: 'period_order_count',
    title: 'Ziyaret sayisina gore',
    description: 'Musteri belirli sayida ziyaret/siparise ulasinca calissin.',
    triggerType: 'visit_count',
    scope: 'applicable',
  },
  {
    value: 'birthday',
    title: 'Dogum gunu',
    description: 'Dogum gunu penceresinde otomatik deger versin.',
    triggerType: 'birthday',
    scope: 'applicable',
  },
  {
    value: 'happy_hour',
    title: 'Gun ve saat araligi',
    description: 'Happy hour veya servis saatlerine bagli calissin.',
    triggerType: 'order_completed',
    scope: 'applicable',
  },
  {
    value: 'calendar_schedule',
    title: 'Takvimli tekrar',
    description: 'Gunluk, haftalik, aylik veya yillik periyotta calissin.',
    triggerType: 'manual',
    scope: 'periodic',
  },
  {
    value: 'manual_approval',
    title: 'Personel elle baslatsin',
    description: 'POS kampanyalar sekmesinden manuel tetiklensin.',
    triggerType: 'manual',
    scope: 'applicable',
  },
]

const SIMPLE_ACTION_CHOICES = [
  {
    value: 'total_order_discount_percent',
    campaignType: 'discount_percent',
    title: 'Siparise yuzde indirim',
    description: 'Toplam sipariste yuzde indirim uygula.',
  },
  {
    value: 'order_discount_amount',
    campaignType: 'discount_amount',
    title: 'Siparise tutar indirimi',
    description: 'Sabit tutarda siparis indirimi uygula.',
  },
  {
    value: 'bonus_points',
    campaignType: 'bonus_points',
    title: 'Sabit puan kazandir',
    description: 'Musterinin cuzdanina belirli puan yukle.',
  },
  {
    value: 'points_earn_multiplier',
    campaignType: 'points_earn_multiplier',
    title: 'Puan kazanimi carpani',
    description: 'Kazanim katsayisini kampanya boyunca arttir.',
  },
  {
    value: 'points_redeem_multiplier',
    campaignType: 'points_redeem_multiplier',
    title: 'Puan harcama degeri',
    description: 'Puan kullanirken degeri kampanya icin arttir.',
  },
  {
    value: 'issue_coupon',
    campaignType: 'coupon_unlock',
    title: 'Kupon ver',
    description: 'Canonical loyalty kupon serisinden kupon uret.',
  },
  {
    value: 'free_products',
    campaignType: 'product_offer',
    title: 'Hediye urun',
    description: 'Secili urun/kategori/sablon icin hediye veya urun teklifi ver.',
  },
]

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
const CUSTOMER_TARGET_OPTIONS = [
  { value: 'order_customer', label: 'Siparisin musterisi' },
  { value: 'linked_customer', label: 'Bagli musteri' },
]
const GIFT_CARD_MODE_OPTIONS = [
  { value: 'series_selected', label: 'Musteri hediye karti serisi belirtildi' },
  { value: 'series_missing', label: 'Musteri hediye kartinin serisi yok' },
  { value: 'matches_series', label: 'Musteri hediye karti secili seriyle eslesiyor' },
  { value: 'not_matching_series', label: 'Musteri hediye kartinin serisi yok veya seriyle eslesmiyor' },
]
const MASK_TYPE_OPTIONS = [
  { value: 'product', label: 'Urun' },
  { value: 'category', label: 'Kategori' },
  { value: 'combo', label: 'Kombo' },
]
const PRICING_APPLY_OPTIONS = [
  { value: 'all_matches', label: 'Tum eslesenler' },
  { value: 'cheapest', label: 'En ucuz' },
  { value: 'most_expensive', label: 'En pahali' },
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
const STACKING_RULE_OPTIONS = [
  { value: 'stackable', label: 'Birlesebilir', desc: 'Diger aktif kampanyalarla ayni sipariste birlikte calisabilir.' },
  { value: 'group', label: 'Grup bazli cakis', desc: 'Ayni exclusion group icindeki kampanyalarla catisir.' },
  { value: 'exclusive', label: 'Munhasir', desc: 'Diger munhasir kampanyalarla catisir.' },
]

// RUNTIME_STATUS_META and helpers imported from loyaltyRuntimeStatus.js

function FieldStack({ label, hint, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>{label}</div>
      {children}
      {hint ? <div style={{ fontSize: '.72rem', color: '#94a3b8', lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  )
}

function HelperNote({ title, children, tone = 'info' }) {
  const palette = tone === 'warning'
    ? { border: '#fde68a', background: '#fffaf0', title: '#b45309' }
    : { border: '#bfdbfe', background: '#f8fbff', title: '#1d4ed8' }

  return (
    <div style={{ border: `1px solid ${palette.border}`, background: palette.background, borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: '.74rem', color: palette.title, fontWeight: 900, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {title}
      </div>
      <div style={{ fontSize: '.82rem', color: '#475569', lineHeight: 1.6 }}>
        {children}
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

function RuntimeStatusBadge({ status }) {
  if (!status) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        border: `1px solid ${status.border}`,
        background: status.background,
        color: status.color,
        padding: '3px 8px',
        fontSize: '.66rem',
        fontWeight: 900,
        whiteSpace: 'nowrap',
      }}
    >
      {status.label}
    </span>
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

function StepPill({ index, currentStep, title, onClick }) {
  const active = currentStep === index
  const complete = currentStep > index
  return (
    <button
      type="button"
      onClick={() => onClick(index)}
      style={{
        border: `1px solid ${active ? '#2563eb' : complete ? '#bbf7d0' : '#e2e8f0'}`,
        background: active ? '#eff6ff' : complete ? '#ecfdf5' : '#fff',
        color: active ? '#1d4ed8' : complete ? '#166534' : '#475569',
        borderRadius: 999,
        padding: '9px 14px',
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {index + 1}. {title}
    </button>
  )
}

function SearchableMultiSelect({
  options,
  selectedValues,
  onChange,
  placeholder = 'Secim yapin',
  searchPlaceholder = 'Ara',
  emptyText = 'Sonuc bulunamadi.',
  allowSelectAll = false,
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
    const haystack = [option.label, option.description, option.value].filter(Boolean).join(' ').toLowerCase()
    return !normalizedSearch || haystack.includes(normalizedSearch)
  })

  function toggleValue(nextValue) {
    const normalizedValue = String(nextValue)
    const nextValues = selectedSet.has(normalizedValue)
      ? normalizedSelectedValues.filter(value => value !== normalizedValue)
      : [...normalizedSelectedValues, normalizedValue]
    onChange(nextValues)
  }

  function selectAll() {
    onChange([...new Set([...normalizedSelectedValues, ...filteredOptions.filter(option => !option.disabled).map(option => String(option.value))])])
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
          {selectedOptions.length > 0 ? selectedOptions.map(option => option.label).join(', ') : placeholder}
        </span>
        <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ color: '#64748b' }} />
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.74rem', color: '#64748b' }}>{selectedOptions.length} secim</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allowSelectAll ? <button className="btn-o" type="button" onClick={selectAll}>Tumunu Sec</button> : null}
                <button className="btn-o" type="button" onClick={() => onChange([])}>Temizle</button>
              </div>
            </div>
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
                    {option.description ? <span style={{ fontSize: '.74rem', color: '#64748b', lineHeight: 1.4 }}>{option.description}</span> : null}
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

function getOptionLabel(options, value, fallback = '-') {
  return options.find(option => option.value === value)?.label || fallback
}

function formatNumberInputValue(value, fallback = '0') {
  if (value == null || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback
  const text = String(value).trim()
  if (!text) return fallback
  return text
}

function formatCompactList(values = [], fallback = '') {
  const normalized = (values || []).map(value => String(value || '').trim()).filter(Boolean)
  if (normalized.length === 0) return fallback
  if (normalized.length <= 2) return normalized.join(', ')
  return `${normalized.slice(0, 2).join(', ')} +${normalized.length - 2}`
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

function formatPeriodWindow(period, periodDays = 30) {
  if (period === 'rolling_days') return `son ${Math.max(1, Number(periodDays) || 30)} gun`
  return getOptionLabel(PERIOD_OPTIONS, period, 'Tum zamanlar').toLowerCase()
}

function formatComparisonNatural(operator) {
  switch (operator) {
    case 'gte': return 'en az'
    case 'lte': return 'en fazla'
    case 'gt': return 'daha fazla'
    case 'lt': return 'daha az'
    case 'eq': return 'tam olarak'
    case 'divisible': return 'bolunebilir'
    default: return getOptionLabel(COMPARISON_OPTIONS, operator).toLowerCase()
  }
}

function formatCurrentOrderInclusion(config = {}, label = 'mevcut siparis dahil') {
  return config.includeCurrentOrder !== false ? label : 'yalnizca onceki kayitlar'
}

function formatBirthdayWindow(daysBefore = 0, daysAfter = 0) {
  const before = Number(daysBefore) || 0
  const after = Number(daysAfter) || 0
  if (before <= 0 && after <= 0) return 'dogum gununde'
  if (before > 0 && after > 0) return `dogum gununden ${before} gun once ve ${after} gun sonra`
  if (before > 0) return `dogum gununden ${before} gun once`
  return `dogum gununden ${after} gun sonra`
}

function formatWeekdaySummary(days = []) {
  const labels = WEEKDAY_OPTIONS.filter((_, index) => Boolean(days?.[index]))
  if (labels.length === 0) return 'gun secilmedi'
  if (labels.length === WEEKDAY_OPTIONS.length) return 'her gun'
  return labels.join(', ')
}

function formatHappyHourSummary(windows = []) {
  return formatCompactList(
    (Array.isArray(windows) ? windows : [])
      .filter(window => window?.start && window?.end)
      .map(window => `${formatWeekdaySummary(window.days)} ${window.start}-${window.end}`.trim()),
    '',
  )
}

function formatCalendarScheduleSummary(config = {}) {
  const frequency = config.frequency || 'daily'
  const weekdayLabels = WEEKDAY_OPTIONS.filter((_, index) => Boolean(config.weekdays?.[index]))
  const dayLabel = config.dayOfMonth === 'last' ? 'ayin son gunu' : `${config.dayOfMonth || 1}. gun`
  const monthLabel = MONTH_OPTIONS.find(option => Number(option.value) === Number(config.monthOfYear || 1))?.label || 'Ocak'
  switch (frequency) {
    case 'weekly': return `Haftalik${weekdayLabels.length ? ` (${weekdayLabels.join(', ')})` : ''}`
    case 'monthly': return `Aylik (${dayLabel})`
    case 'yearly': return `Yillik (${dayLabel} / ${monthLabel})`
    default: return 'Gunluk'
  }
}

function createRuleSummaryContext(context = {}) {
  return {
    customerCategoryMap: new Map((context.customerCategories || []).map(category => [String(category.id), category.name || String(category.id)])),
    couponSeriesMap: new Map((context.couponSeries || []).map(series => [String(series.id), series.name || String(series.id)])),
    campaignMap: new Map((context.campaigns || []).map(campaign => [String(campaign.id), campaign.name || String(campaign.id)])),
    saleItemMap: new Map((context.saleItems || []).map(item => [String(item.id), item.name || String(item.id)])),
    salesChannelMap: new Map([
      ...CAMPAIGN_CHANNEL_OPTIONS.flatMap(option => [[String(option.value), option.label], [String(option.label), option.label]]),
      ...(context.salesChannels || []).flatMap(channel => [[String(channel.value), channel.label || String(channel.value)], [String(channel.label || channel.value), channel.label || String(channel.value)]]),
    ]),
  }
}

function getMappedLabels(values = [], mapping = new Map()) {
  return (values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .map(value => mapping.get(value) || value)
}

function getConditionMeta(conditionKey) {
  return CONDITION_LIBRARY.find(item => item.key === conditionKey) || CONDITION_LIBRARY[0]
}

function formatProductMaskLabel(mask = {}) {
  return String(mask.name || '').trim() || 'Adsiz filtre'
}

function formatProductMaskSummary(masks = []) {
  return formatCompactList((masks || []).map(formatProductMaskLabel), '')
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
      return `${conditionMeta.label}: ${periodLabel} icinde ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
    case 'period_sold_product_quantity':
      return `${conditionMeta.label}: ${periodLabel} icinde secili filtrelerde ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
    case 'order_item_quantity':
      return `${conditionMeta.label}: ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
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
    case 'sales_channel':
      return `${conditionMeta.label}: ${formatSalesChannelSelections(config, summaryContext.salesChannelMap) || 'secili satis kanallari'}${joinerSuffix}`
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
    case 'free_products':
    case 'suggest_products': {
      const itemNames = formatCompactList((config.items || []).map(item => item.name || summaryContext.saleItemMap.get(String(item.itemId || '')) || item.itemId))
      return itemNames ? `${itemNames} urunlerini ${rule.actionType === 'free_products' ? 'hediye et' : 'oner'}` : actionLabel
    }
    case 'product_pricing':
      return (config.items || []).length > 0 ? formatCompactList((config.items || []).map(item => item.name || 'Fiyat kuralı'), actionLabel) : actionLabel
    case 'combo_bundle':
      return `${String(config.name || '').trim() || 'Kombo'} uygula`
    case 'write_customer_note':
      return String(config.customerTemplate || config.anonymousTemplate || '').trim() || actionLabel
    case 'send_sms':
      return String(config.message || '').trim() || actionLabel
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
      return String(config.message || '').trim() || actionLabel
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

function createMaskCatalogOptions({ saleItems, saleCategories, saleTemplates }) {
  return [
    ...(saleTemplates || []).map(template => ({
      value: `sale_template:${template.id}`,
      label: template.name || '',
      description: template.description || 'Satis mali sablonu',
    })),
    ...(saleCategories || []).map(category => ({
      value: `category:${category.id}`,
      label: category.name || '',
      description: 'Urun kategorisi',
    })),
    ...(saleItems || []).map(item => ({
      value: `product:${item.id}`,
      label: item.name || '',
      description: item.sku || 'Urun',
    })),
  ]
}

function parseCatalogSelection(rawValue, optionsMap) {
  const [type = 'product', itemId = ''] = String(rawValue || '').split(':')
  const option = optionsMap.get(String(rawValue || ''))
  return {
    type,
    itemId,
    name: option?.label || '',
  }
}

function createProductMask() {
  return { id: createId('mask'), itemId: '', name: '', type: 'product' }
}

function createOfferItem() {
  return { id: createId('offer'), itemId: '', name: '', type: 'product', size: '' }
}

function createPricingItem() {
  return { id: createId('pricing'), itemId: '', name: '', maskType: 'product', size: '', applyTo: 'all_matches', pricingType: 'discount_percent', value: 0 }
}

function createComboGroup() {
  return { id: createId('combo-group'), name: 'Yeni grup', isPrimary: false, items: [] }
}

function createComboGroupItem() {
  return { id: createId('combo-item'), type: 'product', name: '', size: '', blockedOptions: '', priceAdjustment: 0, position: 0 }
}

function createDraftRule(conditionKey, actionType, scope = 'applicable', index = 0) {
  return hydrateEditorRuleFromDraft({
    id: createId('rule'),
    scope,
    active: true,
    stopProcessing: false,
    conditions: [
      {
        id: createId('condition'),
        conditionKey,
        conditionConfig: getDefaultConditionConfig(conditionKey),
      },
    ],
    actions: [
      {
        id: createId('action'),
        actionType,
        actionSummary: '',
        actionConfig: getDefaultActionConfig(actionType),
      },
    ],
  }, index, scope)
}

function createBlankCampaign(programId, goalPreset = GOAL_PRESETS[0]) {
  return normalizeCampaign({
    id: createId('campaign'),
    programId: programId || DEFAULT_LOYALTY_PROGRAM.id,
    name: goalPreset?.title || '',
    description: '',
    campaignType: 'bonus_points',
    triggerType: 'manual',
    audienceType: goalPreset?.audienceType || 'all',
    audienceCategoryIds: [],
    channelTargets: [],
    applicationMode: goalPreset?.applicationMode || 'prompt',
    startsAt: '',
    endsAt: '',
    priority: 10,
    stackable: false,
    exclusionGroup: '',
    active: true,
    applicableRules: (goalPreset?.draft?.applicable || []).map((entry, index) => createDraftRule(entry.conditionKey, entry.actionType, 'applicable', index)),
    periodicRules: (goalPreset?.draft?.periodic || []).map((entry, index) => createDraftRule(entry.conditionKey, entry.actionType, 'periodic', index)),
  })
}

function RuleRow({ rule, onEditCondition, onEditAction, onDelete, onAddCondition, onAddAction, onDeleteCondition, onDeleteAction, onToggleConditionJoiner, summaryContext }) {
  const conditions = getEditorRuleConditions(rule)
  const actions = getEditorRuleActions(rule)
  const primaryConditionLabel = conditions[0] ? getConditionMeta(conditions[0].conditionKey).label : 'Bos kosul blogu'
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
              Kosul Blogu
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
            <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Kosul
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
                        <RuntimeStatusBadge status={conditionStatus} />
                      </div>
                      <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                        {buildConditionSummary(pseudoRule, summaryContext)}
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
            <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#b45309', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Eylem
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
                        <RuntimeStatusBadge status={actionStatus} />
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

export default function LoyaltyCampaignWizard() {
  const toast = useToast()
  const navigate = useNavigate()
  const { campaignId } = useParams()
  const workspace = useWorkspace()
  const [currentStep, setCurrentStep] = useState(0)
  const [wizardMode, setWizardMode] = useState('simple')
  const [selectedGoal, setSelectedGoal] = useState(GOAL_PRESETS[0].value)
  const [ruleScopeTab, setRuleScopeTab] = useState('applicable')
  const [wizardCampaign, setWizardCampaign] = useState(() => createBlankCampaign(DEFAULT_LOYALTY_PROGRAM.id, GOAL_PRESETS[0]))
  const [program, setProgram] = useState(normalizeProgram(DEFAULT_LOYALTY_PROGRAM))
  const [tiers, setTiers] = useState([])
  const [couponSeries, setCouponSeries] = useState([])
  const [existingCampaigns, setExistingCampaigns] = useState([])
  const [customerCategories, setCustomerCategories] = useState([])
  const [salesChannels, setSalesChannels] = useState(CAMPAIGN_CHANNEL_OPTIONS.map(option => ({ value: option.value, label: option.label })))
  const [saleItems, setSaleItems] = useState([])
  const [saleCategories, setSaleCategories] = useState([])
  const [saleTemplates, setSaleTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(false)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [scopeInfo, setScopeInfo] = useState(null)
  const [schemaIssues, setSchemaIssues] = useState([])
  const [ruleEditorState, setRuleEditorState] = useState(null)
  const workspaceSnapshotRef = useRef({
    program: normalizeProgram(DEFAULT_LOYALTY_PROGRAM),
    tiers: [],
    campaigns: [],
    couponSeries: [],
  })

  const activeCustomerCategories = useMemo(
    () => (customerCategories || []).filter(category => category?.active !== false),
    [customerCategories],
  )

  const maskCatalogOptions = useMemo(
    () => createMaskCatalogOptions({ saleItems, saleCategories, saleTemplates }),
    [saleItems, saleCategories, saleTemplates],
  )
  const maskCatalogMap = useMemo(
    () => new Map(maskCatalogOptions.map(option => [String(option.value), option])),
    [maskCatalogOptions],
  )
  const summaryContext = useMemo(
    () => createRuleSummaryContext({
      customerCategories: activeCustomerCategories,
      couponSeries,
      campaigns: existingCampaigns,
      saleItems,
      salesChannels,
    }),
    [activeCustomerCategories, couponSeries, existingCampaigns, saleItems, salesChannels],
  )

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)
      try {
        const workspacePayload = {
          scope: workspace.scope,
          branchId: workspace.branchId,
          branchName: workspace.branchName,
        }

        const [workspaceResult, categoryResult, lookupResults] = await Promise.all([
          loadLoyaltyWorkspaceWithRetry(workspacePayload),
          loadLoyaltyCustomerCategories(workspacePayload).catch(() => ({ categories: [] })),
          Promise.allSettled([
            db.from('sales_channels').select('id,name,deleted_at').is('deleted_at', null).order('sort_order').order('name'),
            db.from('sales_items').select('id,name,sku,deleted_at').is('deleted_at', null).order('name'),
            db.from('sale_categories').select('id,name,deleted_at').is('deleted_at', null).order('name'),
            db.from('sale_templates').select('id,name,description,sale_ids').order('name'),
          ]),
        ])

        if (cancelled) return

        const safeProgram = normalizeProgram(workspaceResult?.program || DEFAULT_LOYALTY_PROGRAM)
        const safeCampaigns = Array.isArray(workspaceResult?.campaigns) ? workspaceResult.campaigns : []
        const safeCouponSeries = Array.isArray(workspaceResult?.couponSeries) ? workspaceResult.couponSeries : []
        const safeTiers = Array.isArray(workspaceResult?.tiers) ? workspaceResult.tiers : []

        workspaceSnapshotRef.current = {
          program: safeProgram,
          tiers: safeTiers,
          campaigns: safeCampaigns,
          couponSeries: safeCouponSeries,
        }

        setProgram(safeProgram)
        setTiers(safeTiers)
        setCouponSeries(safeCouponSeries)
        setExistingCampaigns(safeCampaigns)
        setCustomerCategories(categoryResult?.categories || [])
        setScopeInfo(workspaceResult?.scopeInfo || getLoyaltyScopeInfo(workspacePayload))
        setSchemaReady(Boolean(workspaceResult?.schemaReady))
        setDatabaseUnavailable(Boolean(workspaceResult?.databaseUnavailable))
        setSchemaIssues(Array.isArray(workspaceResult?.schemaIssues) ? workspaceResult.schemaIssues : [])

        const [salesChannelsResult, saleItemsResult, saleCategoriesResult, saleTemplatesResult] = lookupResults

        if (salesChannelsResult.status === 'fulfilled' && !salesChannelsResult.value.error) {
          const rows = salesChannelsResult.value.data || []
          setSalesChannels(rows.length > 0
            ? rows.map(channel => ({ value: String(channel.id), label: channel.name || String(channel.id) }))
            : CAMPAIGN_CHANNEL_OPTIONS.map(option => ({ value: option.value, label: option.label })))
        }

        if (saleItemsResult.status === 'fulfilled' && !saleItemsResult.value.error) {
          setSaleItems((saleItemsResult.value.data || []).map(item => ({
            id: String(item.id),
            name: item.name || '',
            sku: item.sku || '',
          })))
        }

        if (saleCategoriesResult.status === 'fulfilled' && !saleCategoriesResult.value.error) {
          setSaleCategories((saleCategoriesResult.value.data || []).map(category => ({
            id: String(category.id),
            name: category.name || '',
          })))
        }

        if (saleTemplatesResult.status === 'fulfilled' && !saleTemplatesResult.value.error) {
          setSaleTemplates((saleTemplatesResult.value.data || []).map(template => ({
            id: String(template.id),
            name: template.name || '',
            description: template.description || '',
            saleIds: Array.isArray(template.sale_ids) ? template.sale_ids : [],
          })))
        }

        const routeCampaign = campaignId && campaignId !== 'yeni'
          ? safeCampaigns.find(item => String(item.id) === String(campaignId))
          : null

        setWizardCampaign(current => {
          if (routeCampaign) {
            return hydrateCampaignForEditor(normalizeCampaign({
              ...routeCampaign,
              programId: safeProgram.id,
            }))
          }

          return normalizeCampaign({
            ...current,
            programId: safeProgram.id,
          })
        })
      } catch (error) {
        if (cancelled) return
        setSchemaReady(false)
        setDatabaseUnavailable(true)
        setSchemaIssues([{ code: 'wizard_load_failed', message: String(error?.message || 'Wizard load failed') }])
        toast(error?.message || 'Kampanya wizard verileri yuklenemedi', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
  }, [campaignId, toast, workspace.branchId, workspace.branchName, workspace.scope])

  const activeRules = wizardCampaign.applicableRules || []
  const periodicRules = wizardCampaign.periodicRules || []
  const visibleRules = ruleScopeTab === 'periodic' ? periodicRules : activeRules
  const mergeMode = wizardCampaign.stackable ? 'stackable' : (wizardCampaign.exclusionGroup ? 'group' : 'exclusive')
  const audienceOptions = CAMPAIGN_AUDIENCE_OPTIONS
  const goalPreset = GOAL_PRESETS.find(item => item.value === selectedGoal) || GOAL_PRESETS[0]
  const campaignChannelOptions = useMemo(
    () => CAMPAIGN_CHANNEL_OPTIONS.map(option => ({
      value: option.value,
      label: option.label,
      description: salesChannels.find(item => item.value === option.value)?.label || option.label,
    })),
    [salesChannels],
  )

  const activeRuleEditorRule = useMemo(() => {
    if (!ruleEditorState) return null
    const rules = ruleEditorState.scope === 'periodic' ? (wizardCampaign.periodicRules || []) : (wizardCampaign.applicableRules || [])
    return rules.find(rule => rule.id === ruleEditorState.ruleId) || null
  }, [ruleEditorState, wizardCampaign])

  const activeRuleEditorItem = useMemo(() => {
    if (!activeRuleEditorRule || !ruleEditorState) return null
    return ruleEditorState.mode === 'actions'
      ? getEditorRuleActions(activeRuleEditorRule).find(item => item.id === ruleEditorState.itemId) || null
      : getEditorRuleConditions(activeRuleEditorRule).find(item => item.id === ruleEditorState.itemId) || null
  }, [activeRuleEditorRule, ruleEditorState])

  const updateCampaign = useCallback((patch) => {
    setWizardCampaign(current => normalizeCampaign({
      ...current,
      ...(typeof patch === 'function' ? patch(current) : patch),
    }))
  }, [])

  function replaceRules(scope, updater) {
    const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    setWizardCampaign(current => normalizeCampaign({
      ...current,
      [ruleKey]: updater(current[ruleKey] || []).map((rule, index) => normalizeRule({ ...rule, scope }, index, scope)),
    }))
  }

  function updateRule(scope, ruleId, key, value) {
    replaceRules(scope, rules => rules.map(rule => (
      rule.id === ruleId ? { ...rule, [key]: value } : rule
    )))
  }

  function updateRuleConditionJoinerMode(scope, ruleId, mode) {
    replaceRules(scope, rules => rules.map(rule => (
      rule.id === ruleId
        ? {
          ...rule,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            additionalConditionsMode: mode === 'or' ? 'or' : 'and',
          },
        }
        : rule
    )))
  }

  function patchRuleConditionConfig(scope, ruleId, patch) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      const currentConfig = rule.conditionConfig || {}
      const nextConfig = typeof patch === 'function'
        ? patch(currentConfig)
        : { ...currentConfig, ...patch }
      return { ...rule, conditionConfig: nextConfig }
    }))
  }

  function patchRuleActionConfig(scope, ruleId, patch) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      const currentConfig = rule.actionConfig || {}
      const nextConfig = typeof patch === 'function'
        ? patch(currentConfig)
        : { ...currentConfig, ...patch }
      return { ...rule, actionConfig: nextConfig }
    }))
  }

  function updateConditionItem(scope, ruleId, conditionId, key, value) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule

      if (rule.id === conditionId) {
        if (key === 'conditionKey') {
          return {
            ...rule,
            conditionKey: value,
            conditionConfig: {
              ...getDefaultConditionConfig(value),
              additionalConditions: Array.isArray(rule.conditionConfig?.additionalConditions) ? rule.conditionConfig.additionalConditions : [],
              additionalConditionsMode: rule.conditionConfig?.additionalConditionsMode || 'and',
            },
          }
        }
        return {
          ...rule,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            [key]: value,
          },
        }
      }

      return {
        ...rule,
        conditionConfig: {
          ...(rule.conditionConfig || {}),
          additionalConditions: (rule.conditionConfig?.additionalConditions || []).map(condition => (
            condition.id === conditionId
              ? {
                ...condition,
                ...(key === 'conditionKey'
                  ? { conditionKey: value, config: getDefaultConditionConfig(value) }
                  : { config: { ...(condition.config || {}), [key]: value } }),
              }
              : condition
          )),
        },
      }
    }))
  }

  function patchConditionItemConfig(scope, ruleId, conditionId, patch) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      if (rule.id === conditionId) {
        const nextConfig = typeof patch === 'function'
          ? patch(rule.conditionConfig || {})
          : { ...(rule.conditionConfig || {}), ...patch }
        return { ...rule, conditionConfig: nextConfig }
      }

      return {
        ...rule,
        conditionConfig: {
          ...(rule.conditionConfig || {}),
          additionalConditions: (rule.conditionConfig?.additionalConditions || []).map(condition => {
            if (condition.id !== conditionId) return condition
            const nextConfig = typeof patch === 'function'
              ? patch(condition.config || {})
              : { ...(condition.config || {}), ...patch }
            return { ...condition, config: nextConfig }
          }),
        },
      }
    }))
  }

  function updateActionItem(scope, ruleId, actionId, key, value) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule

      if (rule.id === actionId) {
        if (key === 'actionType') {
          return {
            ...rule,
            actionType: value,
            actionSummary: '',
            actionConfig: {
              ...getDefaultActionConfig(value),
              additionalActions: Array.isArray(rule.actionConfig?.additionalActions) ? rule.actionConfig.additionalActions : [],
            },
          }
        }
        return { ...rule, [key]: value }
      }

      return {
        ...rule,
        actionConfig: {
          ...(rule.actionConfig || {}),
          additionalActions: (rule.actionConfig?.additionalActions || []).map(action => (
            action.id === actionId
              ? {
                ...action,
                ...(key === 'actionType'
                  ? { actionType: value, actionSummary: '', actionConfig: getDefaultActionConfig(value) }
                  : { [key]: value }),
              }
              : action
          )),
        },
      }
    }))
  }

  function patchActionItemConfig(scope, ruleId, actionId, patch) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      if (rule.id === actionId) {
        const nextConfig = typeof patch === 'function'
          ? patch(rule.actionConfig || {})
          : { ...(rule.actionConfig || {}), ...patch }
        return { ...rule, actionConfig: nextConfig }
      }

      return {
        ...rule,
        actionConfig: {
          ...(rule.actionConfig || {}),
          additionalActions: (rule.actionConfig?.additionalActions || []).map(action => {
            if (action.id !== actionId) return action
            const nextConfig = typeof patch === 'function'
              ? patch(action.actionConfig || {})
              : { ...(action.actionConfig || {}), ...patch }
            return { ...action, actionConfig: nextConfig }
          }),
        },
      }
    }))
  }

  function addRule(scope) {
    replaceRules(scope, rules => [
      ...rules,
      createDraftRule(scope === 'periodic' ? 'calendar_schedule' : 'birthday', 'bonus_points', scope, rules.length),
    ])
  }

  function removeRule(scope, ruleId) {
    replaceRules(scope, rules => rules.filter(rule => rule.id !== ruleId))
  }

  function addConditionToRule(scope, ruleId, conditionKey = scope === 'periodic' ? 'calendar_schedule' : 'birthday') {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      const currentConfig = rule.conditionConfig || {}
      if (currentConfig.__draftEmptyCondition) {
        return {
          ...rule,
          conditionKey,
          conditionConfig: {
            ...getDefaultConditionConfig(conditionKey),
            additionalConditions: Array.isArray(currentConfig.additionalConditions) ? currentConfig.additionalConditions : [],
            additionalConditionsMode: currentConfig.additionalConditionsMode || 'and',
            __draftEmptyCondition: false,
          },
        }
      }
      return {
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
      }
    }))
  }

  function addActionToRule(scope, ruleId, actionType = 'bonus_points') {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      const currentConfig = rule.actionConfig || {}
      if (currentConfig.__draftEmptyAction) {
        return {
          ...rule,
          actionType,
          actionSummary: '',
          actionConfig: {
            ...getDefaultActionConfig(actionType),
            additionalActions: Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : [],
            __draftEmptyAction: false,
          },
        }
      }
      return {
        ...rule,
        actionConfig: {
          ...currentConfig,
          additionalActions: [
            ...(Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : []),
            {
              id: createId('subaction'),
              actionType,
              actionSummary: '',
              actionConfig: getDefaultActionConfig(actionType),
            },
          ],
        },
      }
    }))
  }

  function removeConditionFromRule(scope, ruleId, conditionId) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      if (rule.id === conditionId) {
        const remainingAdditionalConditions = Array.isArray(rule.conditionConfig?.additionalConditions)
          ? rule.conditionConfig.additionalConditions
          : []
        if (remainingAdditionalConditions.length > 0) {
          const [nextPrimary, ...rest] = remainingAdditionalConditions
          return {
            ...rule,
            conditionKey: nextPrimary.conditionKey,
            conditionConfig: {
              ...(nextPrimary.config || {}),
              additionalConditions: rest,
              additionalConditionsMode: rule.conditionConfig?.additionalConditionsMode || 'and',
            },
          }
        }
        return {
          ...rule,
          conditionConfig: {
            ...(rule.conditionConfig || {}),
            additionalConditions: [],
            __draftEmptyCondition: true,
          },
        }
      }
      return {
        ...rule,
        conditionConfig: {
          ...(rule.conditionConfig || {}),
          additionalConditions: (rule.conditionConfig?.additionalConditions || []).filter(condition => condition.id !== conditionId),
        },
      }
    }))
  }

  function removeActionFromRule(scope, ruleId, actionId) {
    replaceRules(scope, rules => rules.map(rule => {
      if (rule.id !== ruleId) return rule
      if (rule.id === actionId) {
        const remainingAdditionalActions = Array.isArray(rule.actionConfig?.additionalActions)
          ? rule.actionConfig.additionalActions
          : []
        if (remainingAdditionalActions.length > 0) {
          const [nextPrimary, ...rest] = remainingAdditionalActions
          return {
            ...rule,
            actionType: nextPrimary.actionType,
            actionSummary: nextPrimary.actionSummary || '',
            actionConfig: {
              ...(nextPrimary.actionConfig || {}),
              additionalActions: rest,
            },
          }
        }
        return {
          ...rule,
          actionConfig: {
            ...(rule.actionConfig || {}),
            additionalActions: [],
            __draftEmptyAction: true,
          },
        }
      }
      return {
        ...rule,
        actionConfig: {
          ...(rule.actionConfig || {}),
          additionalActions: (rule.actionConfig?.additionalActions || []).filter(action => action.id !== actionId),
        },
      }
    }))
  }

  function openRuleEditor(mode, scope, ruleId, itemId) {
    setRuleEditorState({ mode, scope, ruleId, itemId })
  }

  function closeRuleEditor() {
    setRuleEditorState(null)
  }

  function applyGoalPreset(goalValue) {
    const preset = GOAL_PRESETS.find(item => item.value === goalValue) || GOAL_PRESETS[0]
    setSelectedGoal(goalValue)
    setWizardCampaign(current => normalizeCampaign({
      ...current,
      name: current.name?.trim() ? current.name : preset.title,
      audienceType: preset.audienceType,
      applicationMode: preset.applicationMode,
      applicableRules: preset.draft.applicable.map((entry, index) => createDraftRule(entry.conditionKey, entry.actionType, 'applicable', index)),
      periodicRules: preset.draft.periodic.map((entry, index) => createDraftRule(entry.conditionKey, entry.actionType, 'periodic', index)),
    }))
  }

  function updateMergeMode(mode) {
    updateCampaign(current => {
      if (mode === 'stackable') {
        return {
          ...current,
          stackable: true,
          exclusionGroup: '',
        }
      }
      if (mode === 'group') {
        return {
          ...current,
          stackable: false,
          exclusionGroup: current.exclusionGroup || 'wizard-group',
        }
      }
      return {
        ...current,
        stackable: false,
        exclusionGroup: '',
      }
    })
  }

  function toggleChannelTarget(nextValue) {
    updateCampaign(current => {
      const currentTargets = Array.isArray(current.channelTargets) ? current.channelTargets : []
      const normalized = String(nextValue || '')
      const nextTargets = currentTargets.includes(normalized)
        ? currentTargets.filter(value => value !== normalized)
        : [...currentTargets, normalized]
      return { ...current, channelTargets: nextTargets }
    })
  }

  function getSimpleActionConfig(actionType) {
    const baseConfig = getDefaultActionConfig(actionType)
    const firstSeriesId = couponSeries.find(series => series?.active !== false)?.id || couponSeries[0]?.id || ''

    switch (actionType) {
      case 'total_order_discount_percent':
        return { ...baseConfig, percent: baseConfig.percent || 10 }
      case 'order_discount_amount':
        return { ...baseConfig, amount: baseConfig.amount || 50 }
      case 'bonus_points':
        return { ...baseConfig, points: baseConfig.points || 100 }
      case 'points_earn_multiplier':
      case 'points_redeem_multiplier':
        return { ...baseConfig, multiplier: baseConfig.multiplier || 2 }
      case 'issue_coupon':
        return {
          ...baseConfig,
          anySeries: false,
          seriesIds: Array.isArray(baseConfig.seriesIds) && baseConfig.seriesIds.length > 0
            ? baseConfig.seriesIds
            : (firstSeriesId ? [firstSeriesId] : []),
        }
      default:
        return baseConfig
    }
  }

  function applySimpleCondition(choice) {
    const scope = choice.scope || 'applicable'
    setRuleScopeTab(scope)
    updateCampaign({ triggerType: choice.triggerType || wizardCampaign.triggerType })
    replaceRules(scope, rules => {
      const baseRule = rules[0] || createDraftRule(choice.value, 'bonus_points', scope, 0)
      const currentConfig = baseRule.conditionConfig || {}
      return [
        {
          ...baseRule,
          conditionKey: choice.value,
          conditionConfig: {
            ...getDefaultConditionConfig(choice.value),
            additionalConditions: Array.isArray(currentConfig.additionalConditions) ? currentConfig.additionalConditions : [],
            additionalConditionsMode: currentConfig.additionalConditionsMode || 'and',
            __draftEmptyCondition: false,
          },
        },
        ...rules.slice(1),
      ]
    })
  }

  function applySimpleAction(choice, scope = ruleScopeTab) {
    setRuleScopeTab(scope)
    updateCampaign({ campaignType: choice.campaignType || wizardCampaign.campaignType })
    replaceRules(scope, rules => {
      const baseRule = rules[0] || createDraftRule(scope === 'periodic' ? 'calendar_schedule' : 'order_total', choice.value, scope, 0)
      const currentConfig = baseRule.actionConfig || {}
      return [
        {
          ...baseRule,
          actionType: choice.value,
          actionSummary: '',
          actionConfig: {
            ...getSimpleActionConfig(choice.value),
            additionalActions: Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : [],
            __draftEmptyAction: false,
          },
        },
        ...rules.slice(1),
      ]
    })
  }

  function validateBeforeSave() {
    if (!wizardCampaign.name.trim()) {
      toast('Kampanya adi zorunlu', 'error')
      setCurrentStep(1)
      return false
    }
    if (wizardCampaign.audienceType === 'tagged_customers' && (wizardCampaign.audienceCategoryIds || []).length === 0) {
      toast('Musteri kategorileri hedefi icin en az bir kategori secin', 'error')
      setCurrentStep(1)
      return false
    }

    const runtimeCampaign = serializeCampaignForPersistence(wizardCampaign, program.id)
    if ((runtimeCampaign.applicableRules || []).length === 0 && (runtimeCampaign.periodicRules || []).length === 0) {
      toast('Kaydetmeden once en az bir gecerli kosul ve eylem blogu olusturun', 'error')
      setCurrentStep(2)
      return false
    }
    return true
  }

  async function handleSave() {
    if (!validateBeforeSave()) return
    if (databaseUnavailable || !schemaReady) {
      toast('Sadakat workspace hazir olmadigi icin kaydetme kapali', 'error')
      return
    }

    setSaving(true)
    try {
      const runtimeCampaign = serializeCampaignForPersistence(wizardCampaign, program.id)
      const existingCampaignsWithoutCurrent = (workspaceSnapshotRef.current.campaigns || []).filter(item => item.id !== runtimeCampaign.id)
      const payload = {
        program,
        tiers,
        couponSeries,
        campaigns: [...existingCampaignsWithoutCurrent, runtimeCampaign],
      }

      const result = await saveLoyaltyWorkspace({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, payload)

      workspaceSnapshotRef.current = {
        program,
        tiers,
        couponSeries: Array.isArray(result?.couponSeries) ? result.couponSeries : couponSeries,
        campaigns: [...existingCampaignsWithoutCurrent, runtimeCampaign],
      }

      toast('Kampanya wizard uzerinden kaydedildi', 'success')
      navigate(`/sadakat/kampanya/${runtimeCampaign.id}`)
    } catch (error) {
      toast(error?.message || 'Kampanya kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function renderMaskSelect(value, onChange, placeholder = 'Urun / kategori / sablon secin') {
    return (
      <SearchableSelect
        value={value}
        onChange={selected => onChange(selected || '')}
        options={maskCatalogOptions}
        placeholder={placeholder}
        searchPlaceholder="Ara"
      />
    )
  }

  function renderProductMasksEditor(config, onPatch, label = 'Urun / kategori / sablon filtreleri') {
    const masks = Array.isArray(config.productMasks) ? config.productMasks : []
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        <FieldStack label={label} hint="Bu alandan urun, kategori veya satis mali sablonu secilebilir.">
          <div style={{ display: 'grid', gap: 8 }}>
            {masks.map(mask => {
              const selectedValue = mask.itemId ? `${mask.type || 'product'}:${mask.itemId}` : ''
              return (
                <div key={mask.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                  {renderMaskSelect(selectedValue, rawValue => {
                    const parsed = parseCatalogSelection(rawValue, maskCatalogMap)
                    onPatch(current => ({
                      ...current,
                      productMasks: (current.productMasks || []).map(item => item.id === mask.id ? { ...item, ...parsed } : item),
                    }))
                  })}
                  <button
                    className="btn-danger"
                    type="button"
                    onClick={() => onPatch(current => ({
                      ...current,
                      productMasks: (current.productMasks || []).filter(item => item.id !== mask.id),
                    }))}
                  >
                    Sil
                  </button>
                </div>
              )
            })}
            <div>
              <button
                className="btn-o"
                type="button"
                onClick={() => onPatch(current => ({
                  ...current,
                  productMasks: [...(current.productMasks || []), createProductMask()],
                }))}
              >
                + Filtre Ekle
              </button>
            </div>
          </div>
        </FieldStack>
      </div>
    )
  }

  function renderConditionDetails(rule, scope, options = {}) {
    const conditionKey = options.conditionKey || rule.conditionKey
    const config = options.config || rule.conditionConfig || {}
    const onPatch = options.onPatch || (patch => patchRuleConditionConfig(scope, rule.id, patch))

    switch (conditionKey) {
      case 'always':
        return <HelperNote title="Temel siparis kosulu">Ek bir esik aramadan, hedef kitle ve kanal uyuyorsa her sipariste calisir.</HelperNote>
      case 'calendar_schedule':
        return (
          <div style={{ display: 'grid', gap: 12 }}>
            <HelperNote title="Periyodik takvim kosulu">Gunluk, haftalik, aylik veya yillik tekrar eden kampanyalar icin kullanilir.</HelperNote>
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
                        onChange={() => onPatch({ frequency: option.value })}
                      />
                      {option.label}
                    </label>

                    {active && option.value === 'weekly' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
                        {WEEKDAY_OPTIONS.map((day, index) => (
                          <label key={`${option.value}-${day}`} style={{ display: 'grid', justifyItems: 'center', gap: 4, fontSize: '.72rem', color: '#64748b' }}>
                            <span>{day}</span>
                            <input
                              type="checkbox"
                              checked={Boolean(config.weekdays?.[index])}
                              onChange={event => onPatch(current => ({
                                ...current,
                                weekdays: Array.from({ length: 7 }, (_, dayIndex) => (
                                  dayIndex === index ? event.target.checked : Boolean(current.weekdays?.[dayIndex])
                                )),
                              }))}
                            />
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {active && option.value === 'monthly' ? (
                      <div className="sel-wrap">
                        <select className="f-input" value={String(config.dayOfMonth || 'last')} onChange={event => onPatch({ dayOfMonth: event.target.value === 'last' ? 'last' : Number(event.target.value) })}>
                          {CALENDAR_DAY_OPTIONS.map(day => <option key={`monthly-${day.value}`} value={day.value}>{day.label}</option>)}
                        </select>
                      </div>
                    ) : null}

                    {active && option.value === 'yearly' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div className="sel-wrap">
                          <select className="f-input" value={String(config.dayOfMonth || 'last')} onChange={event => onPatch({ dayOfMonth: event.target.value === 'last' ? 'last' : Number(event.target.value) })}>
                            {CALENDAR_DAY_OPTIONS.map(day => <option key={`yearly-day-${day.value}`} value={day.value}>{day.label}</option>)}
                          </select>
                        </div>
                        <div className="sel-wrap">
                          <select className="f-input" value={Number(config.monthOfYear || 1)} onChange={event => onPatch({ monthOfYear: Number(event.target.value) })}>
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
      case 'birthday':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FieldStack label="Dogum gununden gun once">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.daysBefore)} onChange={event => onPatch({ daysBefore: event.target.value })} />
            </FieldStack>
            <FieldStack label="Dogum gununden gun sonra">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.daysAfter)} onChange={event => onPatch({ daysAfter: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'period_total_order_amount':
      case 'order_total':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <FieldStack label="Tutar esigi">
                <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.amount)} onChange={event => onPatch({ amount: event.target.value })} />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'gte'} onChange={event => onPatch({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.filter(option => option.value !== 'divisible').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
              {conditionKey === 'period_total_order_amount' ? (
                <FieldStack label="Donem">
                  <div className="sel-wrap">
                    <select className="f-input" value={config.period || 'all_time'} onChange={event => onPatch({ period: event.target.value })}>
                      {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              ) : <div />}
            </div>
            {conditionKey === 'period_total_order_amount' && (config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gun sayisi">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => onPatch({ periodDays: event.target.value })} />
              </FieldStack>
            ) : null}
            {conditionKey === 'period_total_order_amount' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                <input type="checkbox" checked={Boolean(config.includeCurrentOrder)} onChange={event => onPatch({ includeCurrentOrder: event.target.checked })} />
                Mevcut siparisi de tutara dahil et
              </label>
            ) : null}
            {renderProductMasksEditor(config, onPatch, 'Urun sablonlari')}
          </div>
        )
      case 'period_order_count':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <FieldStack label="Ziyaret / siparis adedi">
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.count)} onChange={event => onPatch({ count: event.target.value })} />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'eq'} onChange={event => onPatch({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Donem">
                <div className="sel-wrap">
                  <select className="f-input" value={config.period || 'all_time'} onChange={event => onPatch({ period: event.target.value })}>
                    {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
            {(config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gun sayisi">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => onPatch({ periodDays: event.target.value })} />
              </FieldStack>
            ) : null}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.includeCurrentOrder)} onChange={event => onPatch({ includeCurrentOrder: event.target.checked })} />
              Mevcut ziyaret / siparisi de say
            </label>
          </div>
        )
      case 'period_product_quantity':
      case 'period_sold_product_quantity':
      case 'order_item_quantity':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <FieldStack label="Urun adedi">
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.quantity)} onChange={event => onPatch({ quantity: event.target.value })} />
              </FieldStack>
              <FieldStack label="Karsilastirma">
                <div className="sel-wrap">
                  <select className="f-input" value={config.operator || 'gte'} onChange={event => onPatch({ operator: event.target.value })}>
                    {COMPARISON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Donem">
                <div className="sel-wrap">
                  <select className="f-input" value={config.period || 'all_time'} onChange={event => onPatch({ period: event.target.value })}>
                    {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
            {(conditionKey === 'period_product_quantity' || conditionKey === 'period_sold_product_quantity') && (config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gun sayisi">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => onPatch({ periodDays: event.target.value })} />
              </FieldStack>
            ) : null}
            {conditionKey !== 'period_sold_product_quantity' ? (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={Boolean(config.repeatable)} onChange={event => onPatch({ repeatable: event.target.checked })} />
                  Bir sipariste birkac kez etkinlestirilebilir
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={config.allowSameItemRepeat !== false} onChange={event => onPatch({ allowSameItemRepeat: event.target.checked })} />
                  Ayni urun tekrarlarini say
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={Boolean(config.excludeFreeItems)} onChange={event => onPatch({ excludeFreeItems: event.target.checked })} />
                  Ucretsiz ogeleri haric tut
                </label>
              </div>
            ) : null}
            {renderProductMasksEditor(config, onPatch)}
          </div>
        )
      case 'missing_products':
        return renderProductMasksEditor(config, onPatch)
      case 'happy_hour':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={config.saveWriteTime !== false} onChange={event => onPatch({ saveWriteTime: event.target.checked })} />
              Urun yazdirma zamanini kaydet
            </label>
            <div style={{ display: 'grid', gap: 8 }}>
              {(config.windows || []).map(window => (
                <div key={window.id} style={{ display: 'grid', gap: 8, padding: 10, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
                    <input className="f-input" type="time" value={window.start} onChange={event => onPatch(cfg => ({ ...cfg, windows: (cfg.windows || []).map(item => item.id === window.id ? { ...item, start: event.target.value } : item) }))} />
                    <input className="f-input" type="time" value={window.end} onChange={event => onPatch(cfg => ({ ...cfg, windows: (cfg.windows || []).map(item => item.id === window.id ? { ...item, end: event.target.value } : item) }))} />
                    <button className="btn-danger" type="button" onClick={() => onPatch(cfg => ({ ...cfg, windows: (cfg.windows || []).filter(item => item.id !== window.id) }))}>Sil</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
                    {WEEKDAY_OPTIONS.map((dayLabel, dayIndex) => (
                      <label key={`${window.id}-${dayLabel}`} style={{ display: 'grid', justifyItems: 'center', gap: 4, fontSize: '.7rem', color: '#64748b' }}>
                        <span>{dayLabel}</span>
                        <input type="checkbox" checked={Boolean(window.days?.[dayIndex])} onChange={event => onPatch(cfg => ({ ...cfg, windows: (cfg.windows || []).map(item => item.id === window.id ? { ...item, days: item.days.map((day, index) => index === dayIndex ? event.target.checked : day) } : item) }))} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button className="btn-o" type="button" onClick={() => onPatch(cfg => ({ ...cfg, windows: [...(cfg.windows || []), { id: createId('window'), start: '00:00', end: '00:00', days: [false, false, false, false, false, false, false] }] }))}>+ Pencere Ekle</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FieldStack label="Saat dilimi kaynagi">
                <div className="sel-wrap">
                  <select className="f-input" value={config.timezoneMode || 'default'} onChange={event => onPatch({ timezoneMode: event.target.value })}>
                    <option value="default">Varsayilan</option>
                    <option value="reference_branch">Referans sube saat dilimi</option>
                    <option value="branch">Sube saat dilimi</option>
                    <option value="custom">Secilen saat dilimi</option>
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Saat dilimi">
                <div className="sel-wrap">
                  <select className="f-input" value={config.timezone || 'Europe/Istanbul'} onChange={event => onPatch({ timezone: event.target.value })}>
                    {TIMEZONE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
          </div>
        )
      case 'gift_card_series':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="sel-wrap">
              <select className="f-input" value={config.mode || 'matches_series'} onChange={event => onPatch({ mode: event.target.value })}>
                {GIFT_CARD_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <SearchableMultiSelect
              options={couponSeries.map(series => ({
                value: series.id,
                label: series.name,
                description: series.prefix || '',
              }))}
              selectedValues={config.seriesIds || []}
              onChange={next => onPatch({ seriesIds: next })}
              placeholder="Kupon / hediye karti serisi secin"
            />
          </div>
        )
      case 'campaign_triggered':
        return (
          <SearchableMultiSelect
            options={existingCampaigns.filter(item => item.id !== wizardCampaign.id).map(item => ({
              value: item.id,
              label: item.name || item.code || item.id,
              description: `${getOptionLabel(CAMPAIGN_TRIGGER_OPTIONS, item.triggerType)} / ${getOptionLabel(CAMPAIGN_TYPE_OPTIONS, item.campaignType)}`,
            }))}
            selectedValues={config.relatedCampaignIds || []}
            onChange={next => onPatch({ relatedCampaignIds: next })}
            placeholder="Kampanya secin"
          />
        )
      case 'coupon_present':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.anySeries)} onChange={event => onPatch({ anySeries: event.target.checked })} />
              Herhangi bir seri
            </label>
            <SearchableMultiSelect
              options={couponSeries.map(series => ({
                value: series.id,
                label: series.name,
                description: series.prefix || '',
                disabled: Boolean(config.anySeries),
              }))}
              selectedValues={config.seriesIds || []}
              onChange={next => onPatch({ seriesIds: next })}
              placeholder="Kupon serisi secin"
            />
          </div>
        )
      case 'days_since_first_activity':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr .8fr .9fr', gap: 10 }}>
            <FieldStack label="Referans olay">
              <div className="sel-wrap">
                <select className="f-input" value={config.eventType || 'signup'} onChange={event => onPatch({ eventType: event.target.value })}>
                  <option value="signup">Kayit</option>
                  <option value="first_order">Ilk siparis</option>
                </select>
              </div>
            </FieldStack>
            <FieldStack label="Gun sayisi">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.days)} onChange={event => onPatch({ days: event.target.value })} />
            </FieldStack>
            <FieldStack label="Karsilastirma">
              <div className="sel-wrap">
                <select className="f-input" value={config.operator || 'gte'} onChange={event => onPatch({ operator: event.target.value })}>
                  {COMPARISON_OPTIONS.filter(option => option.value !== 'divisible').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </FieldStack>
          </div>
        )
      case 'manual_approval':
        return <HelperNote title="Manuel Tetikleme">Bu kosul kampanyanin personel tarafindan elle baslatildigi senaryolar icindir.</HelperNote>
      case 'customer_has_tag':
      case 'customer_lacks_tag':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Musteri kategorileri">
              <SearchableMultiSelect
                options={activeCustomerCategories.map(category => ({
                  value: category.id,
                  label: category.name,
                  description: category.description || category.code || '',
                }))}
                selectedValues={config.tags || []}
                onChange={next => onPatch({ tags: next })}
                placeholder="Musteri kategorisi secin"
              />
            </FieldStack>
            <FieldStack label="Kontrol edilen musteri">
              <div className="sel-wrap">
                <select className="f-input" value={config.target || 'order_customer'} onChange={event => onPatch({ target: event.target.value })}>
                  {CUSTOMER_TARGET_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </FieldStack>
          </div>
        )
      case 'referral_source':
        return <HelperNote title="Referans kaynagi">Bu kosul referans baglantisi veya referral kodu ile gelen musterileri hedefler.</HelperNote>
      case 'sales_channel':
        return (
          <FieldStack label="Gecerli satis kanallari" hint="POS, Garson / Masa, kiosk, online veya mobil kanallarini secin.">
            <SearchableMultiSelect
              options={salesChannels}
              selectedValues={getSalesChannelConditionValues(config)}
              onChange={next => onPatch({ channelValues: next })}
              placeholder="Satis kanali secin"
            />
          </FieldStack>
        )
      case 'last_visit_days':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '.8fr .9fr', gap: 10 }}>
            <FieldStack label="Gun sayisi">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.days)} onChange={event => onPatch({ days: event.target.value })} />
            </FieldStack>
            <FieldStack label="Karsilastirma">
              <div className="sel-wrap">
                <select className="f-input" value={config.operator || 'gte'} onChange={event => onPatch({ operator: event.target.value })}>
                  {COMPARISON_OPTIONS.filter(option => option.value !== 'divisible').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </FieldStack>
          </div>
        )
      default:
        return null
    }
  }

  function renderActionDetails(rule, scope, onPatchOverride = null) {
    const config = rule.actionConfig || {}
    const onPatch = onPatchOverride || (patch => patchRuleActionConfig(scope, rule.id, patch))

    function patchOfferItem(itemId, patch) {
      onPatch(current => ({
        ...current,
        items: (current.items || []).map(item => item.id === itemId ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item),
      }))
    }

    function renderOfferItemsEditor() {
      const items = Array.isArray(config.items) ? config.items : []
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map(item => {
              const selectedValue = item.itemId ? `${item.type || 'product'}:${item.itemId}` : ''
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                  {renderMaskSelect(selectedValue, rawValue => {
                    const parsed = parseCatalogSelection(rawValue, maskCatalogMap)
                    patchOfferItem(item.id, parsed)
                  })}
                  <button className="btn-danger" type="button" onClick={() => onPatch(current => ({ ...current, items: (current.items || []).filter(entry => entry.id !== item.id) }))}>
                    Sil
                  </button>
                </div>
              )
            })}
            <div>
              <button className="btn-o" type="button" onClick={() => onPatch(current => ({ ...current, items: [...(current.items || []), createOfferItem()] }))}>
                + Oge Ekle
              </button>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
            <input type="checkbox" checked={Boolean(config.applyToPricedOptions)} onChange={event => onPatch({ applyToPricedOptions: event.target.checked })} />
            Fiyatli opsiyonlara uygula
          </label>
        </div>
      )
    }

    function renderPricingEditor() {
      const items = Array.isArray(config.items) ? config.items : []
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.map(item => {
            const selectedValue = item.itemId ? `${item.maskType || 'product'}:${item.itemId}` : ''
            return (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr .8fr auto', gap: 8 }}>
                {renderMaskSelect(selectedValue, rawValue => {
                  const parsed = parseCatalogSelection(rawValue, maskCatalogMap)
                  onPatch(current => ({
                    ...current,
                    items: (current.items || []).map(entry => entry.id === item.id ? {
                      ...entry,
                      itemId: parsed.itemId,
                      name: parsed.name,
                      maskType: parsed.type,
                    } : entry),
                  }))
                })}
                <div className="sel-wrap">
                  <select className="f-input" value={item.applyTo} onChange={event => onPatch(current => ({ ...current, items: (current.items || []).map(entry => entry.id === item.id ? { ...entry, applyTo: event.target.value } : entry) }))}>
                    {PRICING_APPLY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div className="sel-wrap">
                  <select className="f-input" value={item.pricingType} onChange={event => onPatch(current => ({ ...current, items: (current.items || []).map(entry => entry.id === item.id ? { ...entry, pricingType: event.target.value } : entry) }))}>
                    {PRICING_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(item.value)} disabled={item.pricingType === 'none'} onChange={event => onPatch(current => ({ ...current, items: (current.items || []).map(entry => entry.id === item.id ? { ...entry, value: event.target.value } : entry) }))} />
                <button className="btn-danger" type="button" onClick={() => onPatch(current => ({ ...current, items: (current.items || []).filter(entry => entry.id !== item.id) }))}>Sil</button>
              </div>
            )
          })}
          <div>
            <button className="btn-o" type="button" onClick={() => onPatch(current => ({ ...current, items: [...(current.items || []), createPricingItem()] }))}>+ Fiyat Kurali Ekle</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
            <input type="checkbox" checked={Boolean(config.applyToPricedOptions)} onChange={event => onPatch({ applyToPricedOptions: event.target.checked })} />
            Fiyatli opsiyonlara uygula
          </label>
        </div>
      )
    }

    function renderComboEditor() {
      const groups = Array.isArray(config.groups) ? config.groups : []
      return (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr .7fr', gap: 10 }}>
            <input className="f-input" value={config.name || ''} onChange={event => onPatch({ name: event.target.value })} placeholder="Kombo adi" />
            <input className="f-input" value={config.category || ''} onChange={event => onPatch({ category: event.target.value })} placeholder="Kategori" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr .8fr', gap: 8 }}>
              <div className="sel-wrap">
                <select className="f-input" value={config.priceMode || 'fixed_price'} onChange={event => onPatch({ priceMode: event.target.value })}>
                  {COMBO_PRICE_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.priceValue)} onChange={event => onPatch({ priceValue: event.target.value })} placeholder="Fiyat" />
            </div>
            <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.sortOrder)} onChange={event => onPatch({ sortOrder: event.target.value })} placeholder="Pozisyon" />
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {groups.map(group => (
              <div key={group.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc', display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                  <input className="f-input" value={group.name} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, name: event.target.value } : entry) }))} placeholder="Grup adi" />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                    <input type="checkbox" checked={Boolean(group.isPrimary)} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, isPrimary: event.target.checked } : entry) }))} />
                    Ana urun
                  </label>
                  <button className="btn-danger" type="button" onClick={() => onPatch(current => ({ ...current, groups: groups.filter(entry => entry.id !== group.id) }))}>Sil</button>
                </div>
                {(group.items || []).map(item => (
                  <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '.8fr 1fr .8fr 1fr .7fr .6fr auto', gap: 8 }}>
                    <div className="sel-wrap">
                      <select className="f-input" value={item.type} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, type: event.target.value } : groupItem) } : entry) }))}>
                        {MASK_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <input className="f-input" value={item.name} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, name: event.target.value } : groupItem) } : entry) }))} placeholder="Ad" />
                    <input className="f-input" value={item.size} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, size: event.target.value } : groupItem) } : entry) }))} placeholder="Boyut" />
                    <input className="f-input" value={item.blockedOptions} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, blockedOptions: event.target.value } : groupItem) } : entry) }))} placeholder="Yasakli opsiyonlar" />
                    <input className="f-input" type="number" step="0.01" value={formatNumberInputValue(item.priceAdjustment)} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, priceAdjustment: event.target.value } : groupItem) } : entry) }))} placeholder="Fiyat" />
                    <input className="f-input" type="number" min={0} value={formatNumberInputValue(item.position)} onChange={event => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.map(groupItem => groupItem.id === item.id ? { ...groupItem, position: event.target.value } : groupItem) } : entry) }))} placeholder="Poz" />
                    <button className="btn-danger" type="button" onClick={() => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: entry.items.filter(groupItem => groupItem.id !== item.id) } : entry) }))}>Sil</button>
                  </div>
                ))}
                <div>
                  <button className="btn-o" type="button" onClick={() => onPatch(current => ({ ...current, groups: groups.map(entry => entry.id === group.id ? { ...entry, items: [...(entry.items || []), createComboGroupItem()] } : entry) }))}>+ Urun Ekle</button>
                </div>
              </div>
            ))}
            <div>
              <button className="btn-o" type="button" onClick={() => onPatch(current => ({ ...current, groups: [...(current.groups || []), createComboGroup()] }))}>+ Grup Ekle</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.applyToPaidOptions)} onChange={event => onPatch({ applyToPaidOptions: event.target.checked })} />
              Ucretli opsiyonlara uygula
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={config.blockOtherDiscounts !== false} onChange={event => onPatch({ blockOtherDiscounts: event.target.checked })} />
              Kombo urunlere baska indirim uygulama
            </label>
          </div>

          <FieldStack label="Eksik yan urun uyarisi esigi">
            <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.warnMissingSidesThreshold, '')} onChange={event => onPatch({ warnMissingSidesThreshold: event.target.value })} />
          </FieldStack>
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
            <FieldStack label="Musteri varsa yazilacak not">
              <textarea className="f-input" rows={3} value={config.customerTemplate || ''} onChange={event => onPatch({ customerTemplate: event.target.value })} />
            </FieldStack>
            <FieldStack label="Musteri yoksa yazilacak not">
              <textarea className="f-input" rows={3} value={config.anonymousTemplate || ''} onChange={event => onPatch({ anonymousTemplate: event.target.value })} />
            </FieldStack>
            <FieldStack label="Musteriye teklif">
              <input className="f-input" value={config.customerOffer || ''} onChange={event => onPatch({ customerOffer: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'send_sms':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="SMS metni">
              <textarea className="f-input" rows={3} value={config.message || ''} onChange={event => onPatch({ message: event.target.value })} />
            </FieldStack>
            <FieldStack label="Gonderim saati">
              <input className="f-input" type="time" value={config.sendAt || '00:00'} onChange={event => onPatch({ sendAt: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'send_webhook':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Webhook adresi">
              <input className="f-input" value={config.endpoint || ''} onChange={event => onPatch({ endpoint: event.target.value })} />
            </FieldStack>
            <FieldStack label="Payload sablonu">
              <textarea className="f-input" rows={3} value={config.template || ''} onChange={event => onPatch({ template: event.target.value })} />
            </FieldStack>
            <FieldStack label="Gonderim zamani / cron notu">
              <input className="f-input" value={config.sendAt || ''} onChange={event => onPatch({ sendAt: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'remove_customer_tag':
      case 'add_customer_tag':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <FieldStack label="Kategori">
                <div className="sel-wrap">
                  <select className="f-input" value={config.category || ''} onChange={event => onPatch({ category: event.target.value })}>
                    <option value="">Kategori secin</option>
                    {activeCustomerCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </div>
              </FieldStack>
              <FieldStack label="Hedef musteri">
                <div className="sel-wrap">
                  <select className="f-input" value={config.target || 'order_customer'} onChange={event => onPatch({ target: event.target.value })}>
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
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.amount)} onChange={event => onPatch({ amount: event.target.value })} />
          </FieldStack>
        )
      case 'order_extra_charge_percent':
      case 'discount_percent':
        return (
          <FieldStack label="Yuzde">
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
          </FieldStack>
        )
      case 'total_order_discount_percent':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Toplam siparis indirim yuzdesi">
              <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
            </FieldStack>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.includeAlreadyDiscounted)} onChange={event => onPatch({ includeAlreadyDiscounted: event.target.checked })} />
              Diger kampanyalara katilan urunlere uygula
            </label>
          </div>
        )
      case 'warning_message':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Uyari metni">
              <textarea className="f-input" rows={3} value={config.message || ''} onChange={event => onPatch({ message: event.target.value })} />
            </FieldStack>
            <FieldStack label="Musteriye teklif">
              <input className="f-input" value={config.customerOffer || ''} onChange={event => onPatch({ customerOffer: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'bonus_points':
        return (
          <FieldStack label="Yuklenecek puan">
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.points)} onChange={event => onPatch({ points: event.target.value })} />
          </FieldStack>
        )
      case 'points_percent_of_order':
        return (
          <FieldStack label="Puan orani (%)">
            <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
          </FieldStack>
        )
      case 'points_earn_multiplier':
      case 'points_redeem_multiplier':
        return (
          <FieldStack label="Katsayi">
            <input className="f-input" type="number" min={1} step="0.1" value={formatNumberInputValue(config.multiplier, '1')} onChange={event => onPatch({ multiplier: event.target.value })} />
          </FieldStack>
        )
      case 'issue_coupon':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.anySeries)} onChange={event => onPatch({ anySeries: event.target.checked })} />
              Herhangi bir seri
            </label>
            <SearchableMultiSelect
              options={couponSeries.map(series => ({
                value: series.id,
                label: series.name,
                description: series.prefix || '',
                disabled: Boolean(config.anySeries),
              }))}
              selectedValues={config.seriesIds || []}
              onChange={next => onPatch({ seriesIds: next })}
              placeholder="Kupon serisi secin"
            />
          </div>
        )
      default:
        return null
    }
  }

  function renderModeToggle() {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {EDITOR_MODE_OPTIONS.map(option => {
          const active = wizardMode === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setWizardMode(option.value)}
              style={{
                border: `1px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                background: active ? '#fffbeb' : '#fff',
                color: '#0f172a',
                borderRadius: 12,
                padding: 12,
                textAlign: 'left',
                cursor: 'pointer',
                display: 'grid',
                gap: 6,
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <strong>{option.label}</strong>
                {active ? <MiniBadge active trueLabel="Aktif" falseLabel="" /> : null}
              </span>
              <span style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>{option.description}</span>
            </button>
          )
        })}
      </div>
    )
  }

  function renderRuleEditorPanel({ title = 'Gelismis kural editoru', subtitle = '' } = {}) {
    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle ? (
              <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>{subtitle}</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={ruleScopeTab === 'applicable' ? 'btn-p' : 'btn-o'} type="button" onClick={() => setRuleScopeTab('applicable')}>
              Siparis Aninda
            </button>
            <button className={ruleScopeTab === 'periodic' ? 'btn-p' : 'btn-o'} type="button" onClick={() => setRuleScopeTab('periodic')}>
              Zaman Bazli
            </button>
            <button className="btn-o" type="button" onClick={() => addRule(ruleScopeTab)}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Blok Ekle
            </button>
          </div>
        </div>

        <HelperNote title="Parity">
          Bu panel mevcut campaign editor ile ayni condition/action modelini duzenler. Coklu kosul, VE/VEYA joiner, coklu eylem ve stop processing burada kayipsiz kalir.
        </HelperNote>

        {visibleRules.length === 0 ? (
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 16, color: '#64748b', textAlign: 'center' }}>
            Bu sekmede henuz blok yok.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {visibleRules.map(rule => (
              <RuleRow
                key={rule.id}
                rule={rule}
                summaryContext={summaryContext}
                onEditCondition={conditionId => openRuleEditor('conditions', ruleScopeTab, rule.id, conditionId)}
                onEditAction={actionId => openRuleEditor('actions', ruleScopeTab, rule.id, actionId)}
                onAddCondition={() => addConditionToRule(ruleScopeTab, rule.id)}
                onAddAction={() => addActionToRule(ruleScopeTab, rule.id)}
                onToggleConditionJoiner={mode => updateRuleConditionJoinerMode(ruleScopeTab, rule.id, mode)}
                onDeleteCondition={conditionId => removeConditionFromRule(ruleScopeTab, rule.id, conditionId)}
                onDeleteAction={actionId => removeActionFromRule(ruleScopeTab, rule.id, actionId)}
                onDelete={() => removeRule(ruleScopeTab, rule.id)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderRuleSummaryList(rules = [], emptyText = 'Bu sekmede kural yok.') {
    if (rules.length === 0) {
      return <div style={{ color: '#64748b', fontSize: '.82rem' }}>{emptyText}</div>
    }

    return rules.map(rule => (
      <div key={rule.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
        <div style={{ fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
          {buildConditionSummary(rule, summaryContext)} {'->'} {buildActionSummary(rule, summaryContext)}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {getEditorRuleConditions(rule).map(condition => (
            <RuntimeStatusBadge key={`${rule.id}-${condition.id}-condition`} status={getConditionRuntimeStatus(condition.conditionKey)} />
          ))}
          {getEditorRuleActions(rule).map(action => (
            <RuntimeStatusBadge key={`${rule.id}-${action.id}-action`} status={getActionRuntimeStatus(action.actionType)} />
          ))}
        </div>
      </div>
    ))
  }

  const reviewRuntimeCampaign = useMemo(
    () => serializeCampaignForPersistence(wizardCampaign, program.id),
    [program.id, wizardCampaign],
  )

  return (
    <div>
      <Header
        title="Akilli Kampanya Wizard"
        subtitle="Yeni kampanya acilis akisini wizard uzerine tasiyip, kural motorunu mevcut sadakat modeliyle birebir yonetin."
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-o" type="button" onClick={() => navigate('/sadakat')}>
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
              Listeye Don
            </button>
            <button className="btn-o" type="button" onClick={() => navigate('/sadakat/kategoriler')}>
              <i className="fa-solid fa-tags" style={{ marginRight: 6 }} />
              Musteri Kategorileri
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
              Wizard bu kapsam icin {campaignId && campaignId !== 'yeni' ? 'kampanya duzenleme' : 'yeni kampanya create'} akisi olarak calisir.
            </div>
          </div>
          <div style={{
            borderRadius: 12,
            padding: '10px 12px',
            background: schemaReady ? '#ecfdf5' : '#fff7ed',
            color: schemaReady ? '#166534' : '#9a3412',
            fontWeight: 700,
            fontSize: '.82rem',
          }}>
            {schemaReady ? 'Sadakat workspace hazir' : 'Sadakat workspace henuz hazir degil'}
          </div>
        </div>
      </div>

      {schemaIssues.length > 0 ? (
        <div className="card" style={{ padding: 16, marginBottom: 18, border: '1px solid #facc15', background: '#fffbeb' }}>
          <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 8 }}>Tanilar</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {schemaIssues.slice(0, 6).map((issue, index) => (
              <div key={`${issue.code || 'issue'}-${index}`} style={{ fontSize: '.8rem', color: '#78350f' }}>
                <strong>{issue.code || 'load_issue'}:</strong> {issue.message || 'Ayrinti yok'}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'grid', gap: 14 }}>
          {renderModeToggle()}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {WIZARD_STEPS.map((step, index) => (
            <StepPill key={step.key} index={index} currentStep={currentStep} title={step.title} onClick={setCurrentStep} />
          ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
          Wizard verileri yukleniyor...
        </div>
      ) : (
        <>
          {currentStep === 0 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Kampanyanin ana hedefi ne?</div>
              <div style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 16 }}>
                Bu adim sadece baslangic tohumu verir. Sonraki adimda tum kosul ve eylemleri gercek kural editoru ile duzenleyebilirsiniz.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {GOAL_PRESETS.map(goal => {
                  const active = selectedGoal === goal.value
                  return (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => applyGoalPreset(goal.value)}
                      style={{
                        border: `1px solid ${active ? '#bfdbfe' : '#e2e8f0'}`,
                        background: active ? '#eff6ff' : '#fff',
                        color: '#0f172a',
                        borderRadius: 16,
                        padding: 16,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 10,
                        boxShadow: active ? '0 10px 24px rgba(37,99,235,.12)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 800 }}>{goal.title}</div>
                        {active ? <MiniBadge active trueLabel="Secili" falseLabel="" /> : null}
                      </div>
                      <div style={{ fontSize: '.8rem', color: '#475569', lineHeight: 1.55 }}>{goal.description}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <RuntimeStatusBadge status={getConditionRuntimeStatus(goal.draft.applicable[0]?.conditionKey || 'always')} />
                        <RuntimeStatusBadge status={getActionRuntimeStatus(goal.draft.applicable[0]?.actionType || 'bonus_points')} />
                      </div>
                    </button>
                  )
                })}
              </div>

              <div style={{ marginTop: 18 }}>
                <HelperNote title="Secili tohum">
                  {goalPreset.title}: hedef kitle varsayilan olarak <strong>{getOptionLabel(CAMPAIGN_AUDIENCE_OPTIONS, goalPreset.audienceType)}</strong>, uygulama modu <strong>{getOptionLabel(CAMPAIGN_APPLICATION_MODE_OPTIONS, goalPreset.applicationMode)}</strong> olacak sekilde hazirlandi.
                </HelperNote>
              </div>
            </div>
          ) : null}

          {currentStep === 1 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Kime, nerede ve hangi tarihte uygulansin?</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Bu adim kampanya kimligini, hedef kitleyi, kanal hedeflerini ve aktif donemi toplar.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 12 }}>
                <FieldStack label="Kampanya adi">
                  <input className="f-input" value={wizardCampaign.name} onChange={event => updateCampaign({ name: event.target.value })} placeholder="Orn. Hafta Ici 2x Puan" />
                </FieldStack>
                <FieldStack label="Kod">
                  <input className="f-input" value={wizardCampaign.code || ''} onChange={event => updateCampaign({ code: event.target.value })} placeholder="Kampanya kodu" />
                </FieldStack>
              </div>

              <FieldStack label="Aciklama">
                <textarea className="f-input" rows={3} value={wizardCampaign.description || ''} onChange={event => updateCampaign({ description: event.target.value })} placeholder="Kampanyanin ne yaptigini kisa aciklayin." />
              </FieldStack>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldStack label="Baslangic">
                  <input className="f-input" type="datetime-local" value={formatDateTimeInput(wizardCampaign.startsAt)} onChange={event => updateCampaign({ startsAt: event.target.value })} />
                </FieldStack>
                <FieldStack label="Bitis">
                  <input className="f-input" type="datetime-local" value={formatDateTimeInput(wizardCampaign.endsAt)} onChange={event => updateCampaign({ endsAt: event.target.value })} />
                </FieldStack>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldStack label="Hedef kitle">
                  <div className="sel-wrap">
                    <select className="f-input" value={wizardCampaign.audienceType} onChange={event => updateCampaign({ audienceType: event.target.value, audienceCategoryIds: event.target.value === 'tagged_customers' ? wizardCampaign.audienceCategoryIds : [] })}>
                      {audienceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
                <FieldStack label="Uygulama modu" hint="Kasiyere sor veya otomatik uygula davranisi save/load modelinde ayni kalir.">
                  <div className="sel-wrap">
                    <select className="f-input" value={wizardCampaign.applicationMode} onChange={event => updateCampaign({ applicationMode: event.target.value })}>
                      {CAMPAIGN_APPLICATION_MODE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              </div>

              {wizardCampaign.audienceType === 'tagged_customers' ? (
                <FieldStack label="Musteri kategorileri">
                  <SearchableMultiSelect
                    options={activeCustomerCategories.map(category => ({
                      value: category.id,
                      label: category.name,
                      description: category.description || category.code || '',
                    }))}
                    selectedValues={wizardCampaign.audienceCategoryIds || []}
                    onChange={next => updateCampaign({ audienceCategoryIds: next })}
                    placeholder="Kategori secin"
                    allowSelectAll
                  />
                </FieldStack>
              ) : null}

              <FieldStack label="Kanal hedefleri" hint="Bos birakilirsa tum kanallarda calisir. Rule seviyesindeki satis kanali kosulu bundan daha detayli filtre olabilir.">
                <SearchableMultiSelect
                  options={campaignChannelOptions}
                  selectedValues={wizardCampaign.channelTargets || []}
                  onChange={next => updateCampaign({ channelTargets: next })}
                  placeholder="Kanal secin"
                />
              </FieldStack>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldStack label="Trigger tipi">
                  <div className="sel-wrap">
                    <select className="f-input" value={wizardCampaign.triggerType} onChange={event => updateCampaign({ triggerType: event.target.value })}>
                      {CAMPAIGN_TRIGGER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
                <FieldStack label="Kampanya tipi">
                  <div className="sel-wrap">
                    <select className="f-input" value={wizardCampaign.campaignType} onChange={event => updateCampaign({ campaignType: event.target.value })}>
                      {CAMPAIGN_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Ne zaman calissin?</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Basit mod tetikleyiciyi is diliyle secer; gelismis mod ayni secimi condition bloklari olarak acar.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {SIMPLE_CONDITION_CHOICES.map(choice => {
                  const scopeRules = choice.scope === 'periodic' ? periodicRules : activeRules
                  const active = scopeRules.some(rule => getEditorRuleConditions(rule).some(condition => condition.conditionKey === choice.value))
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      onClick={() => applySimpleCondition(choice)}
                      style={{
                        textAlign: 'left',
                        border: `1px solid ${active ? '#bfdbfe' : '#e2e8f0'}`,
                        background: active ? '#eff6ff' : '#fff',
                        borderRadius: 12,
                        padding: 14,
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <strong style={{ color: active ? '#1d4ed8' : '#0f172a' }}>{choice.title}</strong>
                        <RuntimeStatusBadge status={getConditionRuntimeStatus(choice.value)} />
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>{choice.description}</div>
                    </button>
                  )
                })}
              </div>

              <HelperNote title="Arka planda uretilen model">
                Bu secimler `triggerType`, applicable/periodic rule, condition config ve gerekirse takvim/happy hour ayrintilarina map edilir. Gelismis modda hepsi gorunur ve duzenlenebilir.
              </HelperNote>

              {wizardMode === 'advanced' ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                  {renderRuleEditorPanel({
                    title: 'Tetikleyici condition bloklari',
                    subtitle: 'Birden fazla kosul, VE/VEYA joiner ve zaman bazli periyodik kurallar burada yonetilir.',
                  })}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Secili tetikleyici ozeti</div>
                  {renderRuleSummaryList([...activeRules, ...periodicRules], 'Henuz tetikleyici secilmedi.')}
                </div>
              )}
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Musteri ne kazansin?</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Basit mod odul dilini kullanir; gelismis mod ayni sonucu action bloklari olarak acar.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                {SIMPLE_ACTION_CHOICES.map(choice => {
                  const active = [...activeRules, ...periodicRules].some(rule => getEditorRuleActions(rule).some(action => action.actionType === choice.value))
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      onClick={() => applySimpleAction(choice)}
                      style={{
                        textAlign: 'left',
                        border: `1px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                        background: active ? '#fffbeb' : '#fff',
                        borderRadius: 12,
                        padding: 14,
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <strong style={{ color: active ? '#92400e' : '#0f172a' }}>{choice.title}</strong>
                        <RuntimeStatusBadge status={getActionRuntimeStatus(choice.value)} />
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>{choice.description}</div>
                    </button>
                  )
                })}
              </div>

              {wizardMode === 'advanced' ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                  {renderRuleEditorPanel({
                    title: 'Kazanim action bloklari',
                    subtitle: 'Coklu action, action sirasi, stop processing ve destek durumlari burada kayipsiz duzenlenir.',
                  })}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Secili kazanim ozeti</div>
                  {renderRuleSummaryList([...activeRules, ...periodicRules], 'Henuz kazanim secilmedi.')}
                </div>
              )}
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Kupon ve puan detaylari</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Wizard loyalty coupon modelini kullanir; kiosk ayarlarindaki kupon mantigi ayri kanal davranisi olarak kalir.
                </div>
              </div>

              <HelperNote title="Canonical loyalty coupon">
                Kupon secimleri `loyalty_coupon_series`, `loyalty_coupons` ve `loyalty_campaign_redemptions` omurgasina baglanir. Kiosk settings coupon ayni kavram gibi sunulmaz; kanal ayari olarak kalir.
              </HelperNote>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff', display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Kupon serileri</div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>
                    Aktif seri sayisi: <strong>{couponSeries.filter(series => series?.active !== false).length}</strong>
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {couponSeries.slice(0, 5).map(series => (
                      <div key={series.id} style={{ fontSize: '.78rem', color: '#334155', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{series.name || series.prefix || series.id}</span>
                        <span style={{ color: series.useAfterCheckout ? '#0f766e' : '#64748b', fontWeight: 800 }}>{series.useAfterCheckout ? 'Checkout sonrasi' : 'Aninda'}</span>
                      </div>
                    ))}
                    {couponSeries.length === 0 ? <div style={{ fontSize: '.78rem', color: '#64748b' }}>Henuz kupon serisi yok.</div> : null}
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#fff', display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Puan davranislari</div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>
                    Sabit puan, siparis yuzdesi, kazanma katsayisi ve harcama katsayisi ayni action modelinden yonetilir.
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['bonus_points', 'points_percent_of_order', 'points_earn_multiplier', 'points_redeem_multiplier'].map(actionType => (
                      <RuntimeStatusBadge key={actionType} status={getActionRuntimeStatus(actionType)} />
                    ))}
                  </div>
                </div>
              </div>

              {wizardMode === 'advanced' ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                  {renderRuleEditorPanel({
                    title: 'Kupon ve puan action ayrintilari',
                    subtitle: 'Kupon serisi, use-after-checkout etkisi, puan kazanma/harcama ve model-only action durumlari burada gorunur.',
                  })}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {renderRuleSummaryList([...activeRules, ...periodicRules], 'Kupon veya puan action secilmedi.')}
                </div>
              )}
            </div>
          ) : null}

          {currentStep === 5 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Cakisma ve operasyon</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Birlesme, exclusion group, oncelik, manuel tetikleme ve stop processing davranislari burada toparlanir.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldStack label="Oncelik" hint="Daha kucuk sayi daha guclu kabul edilir.">
                  <input className="f-input" type="number" min={0} value={formatNumberInputValue(wizardCampaign.priority, '10')} onChange={event => updateCampaign({ priority: event.target.value })} />
                </FieldStack>
                <FieldStack label="Durum">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, color: '#334155', fontWeight: 800 }}>
                    <input type="checkbox" checked={wizardCampaign.active !== false} onChange={event => updateCampaign({ active: event.target.checked })} />
                    Kampanya aktif
                  </label>
                </FieldStack>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Cakisma ve birlesme kurali</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {STACKING_RULE_OPTIONS.map(option => {
                    const active = mergeMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateMergeMode(option.value)}
                        style={{
                          textAlign: 'left',
                          border: `1px solid ${active ? '#bfdbfe' : '#e2e8f0'}`,
                          background: active ? '#eff6ff' : '#fff',
                          borderRadius: 12,
                          padding: 14,
                          cursor: 'pointer',
                          display: 'grid',
                          gap: 8,
                        }}
                      >
                        <div style={{ fontWeight: 800, color: active ? '#1d4ed8' : '#0f172a' }}>{option.label}</div>
                        <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>{option.desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {mergeMode === 'group' ? (
                <FieldStack label="Exclusion group">
                  <input className="f-input" value={wizardCampaign.exclusionGroup || ''} onChange={event => updateCampaign({ exclusionGroup: event.target.value })} placeholder="Orn. burger-indirimleri" />
                </FieldStack>
              ) : null}

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Runtime durumu</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {Array.from(new Set([
                    ...activeRules.flatMap(rule => getEditorRuleConditions(rule).map(condition => `condition:${condition.conditionKey}`)),
                    ...activeRules.flatMap(rule => getEditorRuleActions(rule).map(action => `action:${action.actionType}`)),
                    ...periodicRules.flatMap(rule => getEditorRuleConditions(rule).map(condition => `condition:${condition.conditionKey}`)),
                    ...periodicRules.flatMap(rule => getEditorRuleActions(rule).map(action => `action:${action.actionType}`)),
                  ])).map(token => {
                    const [kind, value] = token.split(':')
                    return kind === 'condition'
                      ? <RuntimeStatusBadge key={token} status={getConditionRuntimeStatus(value)} />
                      : <RuntimeStatusBadge key={token} status={getActionRuntimeStatus(value)} />
                  })}
                </div>
              </div>

              {wizardMode === 'advanced' ? (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                  {renderRuleEditorPanel({
                    title: 'Operasyonel rule kontrolleri',
                    subtitle: 'Stop processing, aktif/pasif bloklar, manuel approval kosulu ve kanal kosullari burada duzenlenebilir.',
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep === 6 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Test, ozet ve kaydet</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Kayit, loyalty workspace persistence akisi uzerinden yapilir; editorRuleDrafts round-trip korunur.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 12 }}>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#fff' }}>
                  <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.1rem' }}>{wizardCampaign.name || 'Adsiz kampanya'}</div>
                  <div style={{ marginTop: 8, fontSize: '.84rem', color: '#64748b', lineHeight: 1.6 }}>
                    {wizardCampaign.description || 'Aciklama girilmedi.'}
                  </div>
                  <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: '.82rem', color: '#334155' }}>Hedef kitle: <strong>{getOptionLabel(CAMPAIGN_AUDIENCE_OPTIONS, wizardCampaign.audienceType)}</strong></div>
                    <div style={{ fontSize: '.82rem', color: '#334155' }}>Uygulama modu: <strong>{getOptionLabel(CAMPAIGN_APPLICATION_MODE_OPTIONS, wizardCampaign.applicationMode)}</strong></div>
                    <div style={{ fontSize: '.82rem', color: '#334155' }}>Kanallar: <strong>{(wizardCampaign.channelTargets || []).length > 0 ? formatCompactList((wizardCampaign.channelTargets || []).map(value => getOptionLabel(CAMPAIGN_CHANNEL_OPTIONS, value, value))) : 'Tum kanallar'}</strong></div>
                    <div style={{ fontSize: '.82rem', color: '#334155' }}>Cakisma modu: <strong>{mergeMode}</strong></div>
                    <div style={{ fontSize: '.82rem', color: '#334155' }}>Oncelik: <strong>{wizardCampaign.priority}</strong></div>
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, background: '#f8fafc', display: 'grid', gap: 10 }}>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Runtime ozet</div>
                  <MiniBadge active={(reviewRuntimeCampaign.applicableRules || []).length > 0} trueLabel={`${reviewRuntimeCampaign.applicableRules.length} siparis kuralı`} falseLabel="Siparis kuralı yok" />
                  <MiniBadge active={(reviewRuntimeCampaign.periodicRules || []).length > 0} trueLabel={`${reviewRuntimeCampaign.periodicRules.length} periyodik kural`} falseLabel="Periyodik kural yok" />
                  <MiniBadge active={schemaReady} trueLabel="Kayda hazir" falseLabel="Workspace hazir degil" />
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Siparis aninda calisan kurallar</div>
                {(wizardCampaign.applicableRules || []).length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '.82rem' }}>Bu sekmede kural yok.</div>
                ) : (
                  (wizardCampaign.applicableRules || []).map(rule => (
                    <div key={rule.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
                      <div style={{ fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                        {buildConditionSummary(rule, summaryContext)} \u2192 {buildActionSummary(rule, summaryContext)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Zaman bazli kurallar</div>
                {(wizardCampaign.periodicRules || []).length === 0 ? (
                  <div style={{ color: '#64748b', fontSize: '.82rem' }}>Bu sekmede kural yok.</div>
                ) : (
                  (wizardCampaign.periodicRules || []).map(rule => (
                    <div key={rule.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
                      <div style={{ fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                        {buildConditionSummary(rule, summaryContext)} \u2192 {buildActionSummary(rule, summaryContext)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      {ruleEditorState && activeRuleEditorRule && activeRuleEditorItem ? (
        <EditorModal
          title={ruleEditorState.mode === 'actions' ? 'Eylemi Duzenle' : 'Kosulu Duzenle'}
          subtitle={ruleEditorState.scope === 'periodic' ? 'Zaman bazli akisa bagli blog' : 'Siparis aninda calisan blog'}
          onClose={closeRuleEditor}
        >
          {ruleEditorState.mode === 'actions' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
                <FieldStack label="Eylem tipi">
                  <div className="sel-wrap">
                    <select
                      className="f-input"
                      value={activeRuleEditorItem.actionType}
                      onChange={event => updateActionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'actionType', event.target.value)}
                    >
                      {ACTION_TYPE_OPTIONS.map(option => {
                        const status = getActionRuntimeStatus(option.value)
                        return <option key={option.value} value={option.value}>{`${option.label} - ${status.label}`}</option>
                      })}
                    </select>
                  </div>
                </FieldStack>
                <FieldStack label="Kisa ozet">
                  <input
                    className="f-input"
                    value={activeRuleEditorItem.actionSummary || ''}
                    onChange={event => updateActionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'actionSummary', event.target.value)}
                    placeholder={buildActionSummary({
                      ...activeRuleEditorRule,
                      actionType: activeRuleEditorItem.actionType,
                      actionSummary: activeRuleEditorItem.actionSummary,
                      actionConfig: activeRuleEditorItem.actionConfig,
                    }, summaryContext)}
                  />
                </FieldStack>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                  <input type="checkbox" checked={activeRuleEditorRule.stopProcessing} onChange={event => updateRule(ruleEditorState.scope, activeRuleEditorRule.id, 'stopProcessing', event.target.checked)} />
                  Durdur
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                  <input type="checkbox" checked={activeRuleEditorRule.active} onChange={event => updateRule(ruleEditorState.scope, activeRuleEditorRule.id, 'active', event.target.checked)} />
                  Aktif
                </label>
              </div>

              <div style={{ border: '1px solid #fde68a', background: '#fffaf0', borderRadius: 12, padding: 12 }}>
                {renderActionDetails({
                  ...activeRuleEditorRule,
                  actionType: activeRuleEditorItem.actionType,
                  actionSummary: activeRuleEditorItem.actionSummary,
                  actionConfig: activeRuleEditorItem.actionConfig,
                }, ruleEditorState.scope, patch => patchActionItemConfig(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, patch))}
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
                        onChange={event => updateConditionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'conditionKey', event.target.value)}
                      >
                        {CONDITION_LIBRARY.map(option => {
                          const status = getConditionRuntimeStatus(option.key)
                          return <option key={option.key} value={option.key}>{`${option.label} - ${status.label}`}</option>
                        })}
                      </select>
                    </div>
                    <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.5 }}>
                      {getConditionMeta(activeRuleEditorItem.conditionKey).description}
                    </div>
                  </div>
                </FieldStack>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                  <input type="checkbox" checked={activeRuleEditorRule.stopProcessing} onChange={event => updateRule(ruleEditorState.scope, activeRuleEditorRule.id, 'stopProcessing', event.target.checked)} />
                  Durdur
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', fontWeight: 700, minHeight: 42 }}>
                  <input type="checkbox" checked={activeRuleEditorRule.active} onChange={event => updateRule(ruleEditorState.scope, activeRuleEditorRule.id, 'active', event.target.checked)} />
                  Aktif
                </label>
              </div>

              <div style={{ border: '1px solid #bfdbfe', background: '#f8fbff', borderRadius: 12, padding: 12 }}>
                {renderConditionDetails({
                  ...activeRuleEditorRule,
                  conditionKey: activeRuleEditorItem.conditionKey,
                  conditionConfig: activeRuleEditorItem.conditionConfig,
                }, ruleEditorState.scope, {
                  onPatch: patch => patchConditionItemConfig(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, patch),
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
        marginBottom: 18,
      }}>
        <div style={{ fontSize: '.8rem', color: '#64748b' }}>
          {databaseUnavailable || !schemaReady
            ? 'Workspace hazir olmadan kaydetme kapali kalir.'
            : 'Kaydetme loyalty workspace persistence akisi uzerinden yapilir.'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn-o" type="button" onClick={() => setCurrentStep(current => Math.max(0, current - 1))} disabled={currentStep === 0 || loading}>
            Geri
          </button>
          {currentStep < WIZARD_STEPS.length - 1 ? (
            <button className="btn-p" type="button" onClick={() => setCurrentStep(current => Math.min(WIZARD_STEPS.length - 1, current + 1))} disabled={loading}>
              Ileri
            </button>
          ) : (
            <button className="btn-p" type="button" onClick={handleSave} disabled={saving || loading || databaseUnavailable || !schemaReady}>
              {saving
                ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor</>
                : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />Kaydet ve Editore Git</>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
