import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Header from '@/components/layout/Header'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useToast } from '@/hooks/useToast'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
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
  createLoyaltyCampaignConflictGroup,
  loadLoyaltyCustomerCategories,
  loadLoyaltyCampaignConflictGroups,
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

function getCampaignApplicationModeHint(value) {
  return value === 'auto'
    ? 'Koşul sağlanır sağlanmaz POS / Garson kampanyayı kendisi bağlar.'
    : 'Kasiyer işlem kapanmadan önce kampanyayı uygulayıp uygulamayacağına karar verir.'
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

function resolveImageUrl(url) {
  const cleanUrl = String(url || '').trim()
  if (!cleanUrl) return ''
  if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') || cleanUrl.startsWith('data:')) {
    return cleanUrl
  }
  return buildApiUrl(cleanUrl)
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

function getAllBranches(tree) {
  const r = []
  function walk(n) { for (const x of n||[]) { if(x.type==='sube' || x.type === 'anadepo' || x.type === 'mutfak') r.push({id:x.id,name:x.name}); walk(x.children||[]) } }
  walk(tree); return r
}

const campaignButtonStyle = (active, themeColor = '#2563eb') => ({
  flex: 1,
  padding: '16px 20px',
  borderRadius: '12px',
  border: `2.5px solid ${active ? themeColor : '#cbd5e1'}`,
  background: active ? `${themeColor}0e` : '#ffffff',
  color: active ? themeColor : '#475569',
  fontWeight: '700',
  fontSize: '.9rem',
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  boxShadow: active ? `0 6px 16px ${themeColor}1a` : '0 2px 4px rgba(0,0,0,0.02)',
  transform: active ? 'scale(1.02)' : 'none',
})

const GOAL_PRESETS = [
  {
    value: 'new_customer',
    title: 'Yeni musteri kazan',
    description: 'İlk aktivite, referans ve hoş geldin ödülü odaklı başlangıç akışı.',
    icon: 'fa-solid fa-user-plus',
    color: '#2563eb',
    bgGradient: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
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
    description: 'Sepet eşiği, ürün adedi ve sipariş indirimiyle hızlı satış kampanyası.',
    icon: 'fa-solid fa-cart-shopping',
    color: '#16a34a',
    bgGradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    audienceType: 'all',
    applicationMode: 'prompt',
    draft: {
      applicable: [
        {
          conditionKey: 'order_total',
          actionType: 'order_discount',
        },
      ],
      periodic: [],
    },
  },
  {
    value: 'frequency',
    title: 'Ziyaret sikligini artir',
    description: 'Dönem içindeki sipariş sayısı veya son ziyaret üzerinden geri kazan.',
    icon: 'fa-solid fa-arrow-trend-up',
    color: '#d97706',
    bgGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
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
]

const WIZARD_STEPS = [
  { key: 'goal', title: 'Hedef' },
  { key: 'scope', title: 'Kapsam' },
  { key: 'condition-action', title: 'Koşul/Eylem' },
  { key: 'operations', title: 'Operasyon' },
  { key: 'review', title: 'Kaydet' },
]

const RECOMMENDED_CONDITIONS = {
  new_customer: ['birthday', 'manual_approval'],
  basket: ['order_total', 'happy_hour'],
  frequency: ['period_order_count', 'period_product_quantity', 'calendar_schedule', 'happy_hour']
}

const RECOMMENDED_ACTIONS = {
  new_customer: ['issue_coupon', 'bonus_points', 'order_discount'],
  basket: ['free_products', 'order_discount'],
  frequency: ['points_earn_multiplier', 'issue_coupon', 'bonus_points']
}

const CONDITION_HELP_METADATA = {
  order_total: {
    title: 'Sepet Tutarı Koşulu',
    desc: 'Bu koşul, müşterinin tek bir adisyondaki toplam harcama tutarı belirli bir limite ulaştığında kampanyayı tetikler.',
    usage: 'Örneğin: "1000 TL ve üzeri siparişlerde geçerlidir" kuralını tanımlamak için bu koşulu ekleyin ve kural editöründen tutar limitini düzenleyin.'
  },
  period_order_count: {
    title: 'Ziyaret / Sipariş Sayısı Koşulu',
    desc: 'Müşterinin belirli bir zaman diliminde (günlük, haftalık, aylık) yaptığı toplam sipariş sayısına göre tetiklenir.',
    usage: 'Örneğin: "Bu ayki 5. ziyaretinde indirim kazanır" veya "Haftada 3 kere sipariş verirse" kuralları için bu koşulu kullanın.'
  },
  period_product_quantity: {
    title: 'Dönem İçindeki Ürün Miktarı Koşulu',
    desc: 'Müşterinin belirli bir zaman diliminde (günlük, haftalık, aylık veya genel) satın aldığı seçili ürün veya kategorilerin toplam miktarını kontrol eder.',
    usage: 'Örneğin: "Bu ay 10 adet kurabiye alan müşteriye" gibi hedefleri kontrol etmek veya "5 kahveye 1 bedava" gibi damga kartı kurguları oluşturmak için bu koşulu kullanın.'
  },
  birthday: {
    title: 'Doğum Günü Koşulu',
    desc: 'Müşterinin doğum tarihi bilgisini kontrol eder ve sadece doğum gününde (veya tanımlanan tolerans günlerinde) geçerli olmasını sağlar.',
    usage: 'Doğum günü olan müşterilere özel "Doğum Gününüz Kutlu Olsun" kuponu veya puan hediyesi kampanyaları için idealdir.'
  },
  happy_hour: {
    title: 'Gün ve Saat Aralığı (Happy Hour) Koşulu',
    desc: 'Kampanyanın günün sadece belirli saatlerinde veya haftanın belirli günlerinde geçerli olmasını kısıtlar.',
    usage: 'Örneğin: "Hafta içi 14:00 - 17:00 saatleri arası" veya "Sadece Çarşamba günleri" geçerli indirimler oluşturmak için kullanılır.'
  },
  calendar_schedule: {
    title: 'Takvimli Tekrar Koşulu',
    desc: 'Belirli takvim günlerinde veya periyotlarında kampanyanın otomatik çalışmasını sağlar.',
    usage: 'Örneğin: "Her ayın 15. günü" veya "Yılbaşı döneminde" otomatik puan yüklemeleri yapmak için bu takvim tabanlı koşulu seçin.'
  },
  manual_approval: {
    title: 'Personel Manuel Tetikleme Koşulu',
    desc: 'Kasiyer veya garsonun POS/Kiosk ekranında bu kampanyayı manuel olarak seçip uygulamasına olanak tanır.',
    usage: 'Müşteriye özel bir durum olduğunda personelin insiyatifi ile uygulayabileceği ikram veya özel indirim kampanyalarında kullanılır.'
  }
}

const ACTION_HELP_METADATA = {
  order_discount: {
    title: 'Siparişe İndirim Eylemi',
    desc: 'Müşterinin siparişine yüzde (%) veya tutar (TL) bazında indirim uygular.',
    usage: 'Örneğin: "Tüm adisyona %15 indirim uygula" veya "100 TL indirim uygula" eylemleri için bunu seçip modal içinden türünü belirleyin.'
  },
  free_products: {
    title: 'Bedava Ürün İkramı Eylemi',
    desc: 'Adisyondaki belirli ürünleri veya hediye edilmek istenen promosyonları ücretsiz (0 TL) yapar.',
    usage: 'Örneğin: "Kahve alana kurabiye hediye" veya "3 al 2 öde" kampanyalarında ikram edilecek ürünü sıfırlamak için kullanılır.'
  },
  bonus_points: {
    title: 'Puan Kazandırma Eylemi',
    desc: 'Müşterinin sadakat kartı hesabına sabit veya sipariş tutarının belirli bir yüzdesi oranında puan ekler.',
    usage: 'Örneğin: "Adisyona 50 Puan hediye et" veya "Sipariş tutarının %10\'u kadar puan biriktir" kurguları için bu eylemi kullanabilirsiniz.'
  },
  issue_coupon: {
    title: 'Kupon Tanımlama Eylemi',
    desc: 'Müşterinin hesabına sonraki alışverişlerinde indirim veya ikram kazandıracak dijital bir indirim kuponu tanımlar.',
    usage: 'Örneğin: "Bu alışverişten sonraki siparişte geçerli %20 indirim kuponu kazanır" kurguları için bu eylemi bağlayın.'
  }
}

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

const CONDITION_CHOICES_MAP = {
  always: { triggerType: 'order_completed', scope: 'applicable' },
  calendar_schedule: { triggerType: 'manual', scope: 'periodic' },
  birthday: { triggerType: 'birthday', scope: 'applicable' },
  period_total_order_amount: { triggerType: 'cart_total', scope: 'applicable' },
  period_order_count: { triggerType: 'visit_count', scope: 'applicable' },
  period_product_quantity: { triggerType: 'order_completed', scope: 'applicable' },
  period_sold_product_quantity: { triggerType: 'order_completed', scope: 'applicable' },
  missing_products: { triggerType: 'order_completed', scope: 'applicable' },
  happy_hour: { triggerType: 'order_completed', scope: 'applicable' },
  gift_card_series: { triggerType: 'order_completed', scope: 'applicable' },
  campaign_triggered: { triggerType: 'order_completed', scope: 'applicable' },
  coupon_present: { triggerType: 'order_completed', scope: 'applicable' },
  manual_approval: { triggerType: 'manual', scope: 'applicable' },
  days_since_first_activity: { triggerType: 'first_purchase', scope: 'applicable' },
  customer_has_tag: { triggerType: 'order_completed', scope: 'applicable' },
  customer_lacks_tag: { triggerType: 'order_completed', scope: 'applicable' },
  referred_customer: { triggerType: 'order_completed', scope: 'applicable' },
  gave_referral: { triggerType: 'order_completed', scope: 'applicable' },
  sales_channel: { triggerType: 'order_completed', scope: 'applicable' },
  order_item_quantity: { triggerType: 'order_completed', scope: 'applicable' },
  order_total: { triggerType: 'cart_total', scope: 'applicable' },
  last_visit_days: { triggerType: 'inactive_winback', scope: 'applicable' },
}

const ACTION_CHOICES_MAP = {
  free_products: 'product_offer',
  product_pricing: 'discount_amount',
  combo_bundle: 'product_offer',
  write_customer_note: 'bonus_points',
  send_sms: 'bonus_points',
  send_webhook: 'bonus_points',
  remove_customer_tag: 'bonus_points',
  add_customer_tag: 'bonus_points',
  special_discount: 'discount_percent',
  order_extra_charge: 'discount_amount',
  order_discount: 'discount_percent',
  warning_message: 'bonus_points',
  bonus_points: 'bonus_points',
  points_percent_of_order: 'points_percent_of_order',
  points_earn_multiplier: 'points_earn_multiplier',
  points_redeem_multiplier: 'points_redeem_multiplier',
  issue_coupon: 'coupon_unlock',
  discount_percent: 'discount_percent',
}

const SIMPLE_CONDITION_CHOICES = CONDITION_LIBRARY.map(item => {
  const mapData = CONDITION_CHOICES_MAP[item.key] || { triggerType: 'order_completed', scope: 'applicable' }
  return {
    value: item.key,
    title: item.label,
    description: item.description,
    triggerType: mapData.triggerType,
    scope: mapData.scope,
  }
})

const SIMPLE_ACTION_CHOICES = ACTION_TYPE_OPTIONS.filter(item => item.value !== 'remove_customer_tag' && item.value !== 'points_percent_of_order').map(item => {
  const campaignType = ACTION_CHOICES_MAP[item.value] || 'bonus_points'
  return {
    value: item.value,
    campaignType,
    title: item.label,
    description: item.label,
  }
})

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
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
]
const CALENDAR_DAY_OPTIONS = [
  { value: 'last', label: 'Ayin son gunu' },
  ...Array.from({ length: 31 }, (_, index) => ({
    value: index + 1,
    label: `${index + 1}. gün`,
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
  { value: 'series_selected', label: 'Müşteri hediye kartı serisi belirtildi' },
  { value: 'series_missing', label: 'Müşteri hediye kartının serisi yok' },
  { value: 'matches_series', label: 'Müşteri hediye kartı seçili seriyle eşleşiyor' },
  { value: 'not_matching_series', label: 'Müşteri hediye kartının serisi yok veya seriyle eşleşmiyor' },
]
const MASK_TYPE_OPTIONS = [
  { value: 'product', label: 'Urun' },
  { value: 'category', label: 'Kategori' },
  { value: 'combo', label: 'Kombo' },
]
const PRICING_APPLY_OPTIONS = [
  { value: 'all_matches', label: 'Tüm eşleşenler' },
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
  { value: 'stackable', label: 'Birlesebilir', desc: 'Diger aktif kampanyalarla ayni sipariste birlikte calisabilir.', icon: 'fa-solid fa-layer-group', color: '#16a34a' },
  { value: 'group', label: 'Grup bazlı çakış', desc: 'Aynı exclusion group içindeki kampanyalarla çatışır.', icon: 'fa-solid fa-object-group', color: '#2563eb' },
  { value: 'exclusive', label: 'Münhasır', desc: 'Diğer münhasır kampanyalarla çatışır.', icon: 'fa-solid fa-lock', color: '#dc2626' },
]

const STACKING_RULE_HELP = {
  stackable: {
    title: 'Birleşebilir nasıl çalışır?',
    summary: 'Bu kampanya, şartları sağlayan diğer kampanyalarla aynı siparişte birlikte uygulanabilir.',
    examples: [
      '`%10 kahve indirimi` ile `2x puan` aynı siparişte birlikte çalışabilir.',
      '`Menü alana patates hediyesi` ile `sepette 50 TL indirim` aynı anda uygulanabilir.',
      '`Doğum günü indirimi` ile `sadakat puanı kazandır` kampanyası beraber çalışabilir.',
    ],
    usage: 'Bir siparişte birden fazla farklı fayda aynı anda verilsin istiyorsanız bu seçenek en doğru tercihtir.',
    priority: 'Öncelik genelde gerekli olmaz; bu mod çatışma yaratmak yerine birlikte çalışmayı hedefler.',
  },
  group: {
    title: 'Grup bazlı çakış nasıl çalışır?',
    summary: 'Bu kampanya sadece aynı kampanya grubuna bağlı kampanyalarla çatışır; diğer kampanyalarla birlikte çalışabilir.',
    examples: [
      '`burger_indirimleri` grubunda `%20 burger indirimi` ile `2. burger %50` aynı anda çalışmaz; düşük öncelik sayısı kazanır.',
      '`icecek_faydalari` grubunda `büyük boy içecek bedava` ile `içecekte %30 indirim` birlikte uygulanmaz.',
      '`tatlı_kampanyaları` grubunda iki farklı tatlı indirimi varsa kasada sadece kazanan kampanya devreye girer.',
    ],
    usage: 'Aynı tür kampanyalardan sadece biri seçilsin, ama diğer kategorilerdeki kampanyalar beraber çalışsın istiyorsanız bunu seçin.',
    priority: 'Öncelik bu modda kritik olur; örnek `10`, `30`dan daha güçlüdür ve çakışınca kazanır.',
  },
  exclusive: {
    title: 'Münhasır nasıl çalışır?',
    summary: 'Bu kampanya tüm münhasır kampanyalarla çatışır; siparişte sadece tek bir münhasır kampanya kazanır.',
    examples: [
      '`Sepette %15 genel indirim` ile `500 TL üstü 100 TL indirim` ikisi de münhasır ise aynı siparişte sadece biri uygulanır.',
      '`Tüm ürünlerde %20 indirim` ile `hesaba sabit 75 TL indirim` beraber çalışmaz; daha yüksek öncelik kazanır.',
      '`Kasiyer onaylı büyük kampanya` ile `hafta sonu genel indirim` ikisi de münhasır ise tek kazanan seçilir.',
    ],
    usage: 'Kampanya ne olursa olsun bu siparişte sadece tek bir büyük indirim veya tek bir kazanan olsun istiyorsanız bunu seçin.',
    priority: 'Öncelik bu modda belirleyicidir; en düşük sayı tek kazanan kampanyayı belirler.',
  },
}

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

function CampaignConflictPeerRow({ campaign, color }) {
  return (
    <div style={{
      border: `1px solid ${color}33`,
      borderRadius: 10,
      padding: '8px 10px',
      background: '#fff',
      display: 'grid',
      gap: 3,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 8, alignItems: 'center' }}>
        <strong style={{ color }}>#{formatNumberInputValue(campaign.priority, '0')}</strong>
        <span style={{ color: '#334155', fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name || campaign.code || campaign.id}</span>
        <span style={{ color: '#64748b', fontSize: '.74rem', whiteSpace: 'nowrap' }}>{campaign.applicationMode === 'auto' ? 'Otomatik' : 'Kasiyere sor'}</span>
      </div>
      {campaign.description ? (
        <div style={{ color: '#94a3b8', fontSize: '.72rem', lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 56 }}>
          {campaign.description}
        </div>
      ) : null}
    </div>
  )
}

function normalizeCampaignImageLibrary(metadata = {}) {
  const legacyImage = metadata.campaignImage && typeof metadata.campaignImage === 'object' ? metadata.campaignImage : null
  const library = Array.isArray(metadata.campaignImages) ? metadata.campaignImages : []
  const images = library
    .map((image, index) => ({
      id: String(image.id || `campaign-image-${index + 1}`),
      url: String(image.url || '').trim(),
      fileName: image.fileName || image.filename || '',
      title: image.title || image.fileName || image.filename || `Görsel ${index + 1}`,
      storage: image.storage || 'railway',
      mimeType: image.mimeType || image.mimetype || '',
      size: image.size || 0,
      uploadedAt: image.uploadedAt || image.createdAt || '',
      isPrimary: Boolean(image.isPrimary),
    }))
    .filter(image => image.url)

  if (legacyImage?.url && !images.some(image => image.url === legacyImage.url)) {
    images.unshift({
      id: legacyImage.id || 'campaign-image-legacy',
      url: legacyImage.url,
      fileName: legacyImage.fileName || legacyImage.filename || '',
      title: legacyImage.title || legacyImage.fileName || legacyImage.filename || 'Ana görsel',
      storage: legacyImage.storage || 'railway',
      mimeType: legacyImage.mimeType || legacyImage.mimetype || '',
      size: legacyImage.size || 0,
      uploadedAt: legacyImage.uploadedAt || legacyImage.createdAt || '',
      isPrimary: true,
    })
  }

  const primaryId = String(metadata.primaryCampaignImageId || images.find(image => image.isPrimary)?.id || images[0]?.id || '')
  return {
    images: images.map(image => ({ ...image, isPrimary: image.id === primaryId })),
    primaryId,
    primaryImage: images.find(image => image.id === primaryId) || images[0] || null,
  }
}

function RuntimeStatusBadge({ status }) {
  return null
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
        <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {placeholder}
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
                {allowSelectAll ? <button className="btn-o" type="button" onClick={selectAll}>Tümünü Seç</button> : null}
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
  if (period === 'rolling_days') return `son ${Math.max(1, Number(periodDays) || 30)} gün`
  return getOptionLabel(PERIOD_OPTIONS, period, 'Tüm zamanlar').toLowerCase()
}

function formatComparisonNatural(operator) {
  switch (operator) {
    case 'gte': return 'eşit veya büyük'
    case 'lte': return 'eşit veya küçük'
    case 'gt': return 'büyük'
    case 'lt': return 'küçük'
    case 'eq': return 'eşit'
    case 'divisible': return 'bölünebilir'
    default: return getOptionLabel(COMPARISON_OPTIONS, operator).toLowerCase()
  }
}

function formatCurrentOrderInclusion(config = {}, label = 'mevcut sipariş dahil') {
  return config.includeCurrentOrder !== false ? label : 'yalnizca onceki kayitlar'
}

function formatBirthdayWindow(daysBefore = 0, daysAfter = 0) {
  const before = Number(daysBefore) || 0
  const after = Number(daysAfter) || 0
  if (before <= 0 && after <= 0) return 'dogum gununde'
  if (before > 0 && after > 0) return `doğum gününden ${before} gün önce ve ${after} gün sonra`
  if (before > 0) return `doğum gününden ${before} gün önce`
  return `doğum gününden ${after} gün sonra`
}

function formatWeekdaySummary(days = []) {
  const labels = WEEKDAY_OPTIONS.filter((_, index) => Boolean(days?.[index]))
  if (labels.length === 0) return 'gün seçilmedi'
  if (labels.length === WEEKDAY_OPTIONS.length) return 'her gün'
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
  const dayLabel = config.dayOfMonth === 'last' ? 'ayın son günü' : `${config.dayOfMonth || 1}. gün`
  const monthLabel = MONTH_OPTIONS.find(option => Number(option.value) === Number(config.monthOfYear || 1))?.label || 'Ocak'
  switch (frequency) {
    case 'weekly': return `Haftalik${weekdayLabels.length ? ` (${weekdayLabels.join(', ')})` : ''}`
    case 'monthly': return `Aylık (${dayLabel})`
    case 'yearly': return `Yıllık (${dayLabel} / ${monthLabel})`
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
  const joinerSuffix = extraConditions > 0 ? ` + ${extraConditions} ek koşul (${config.additionalConditionsMode === 'or' ? 'VEYA' : 'VE'})` : ''
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
      return `${conditionMeta.label}: ${periodLabel} içinde ${formatComparisonNatural(config.operator || rule.operator)} ${config.count || 0} (${formatCurrentOrderInclusion(config, 'mevcut ziyaret / sipariş dahil')})${joinerSuffix}`
    case 'period_product_quantity':
      return `${conditionMeta.label}: ${periodLabel} icinde ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
    case 'period_sold_product_quantity':
      return `${conditionMeta.label}: ${periodLabel} icinde secili filtrelerde ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
    case 'order_item_quantity':
      return `${conditionMeta.label}: ${formatComparisonNatural(config.operator || rule.operator)} ${config.quantity || 0}${productMaskSummary ? ` (${productMaskSummary})` : ''}${joinerSuffix}`
    case 'last_visit_days':
      return `${conditionMeta.label}: ${config.days || 0} gün ve daha uzun süredir${joinerSuffix}`
    case 'days_since_first_activity':
      return `${conditionMeta.label}: ${formatComparisonNatural(config.operator || rule.operator)} ${config.days || 0} gün${joinerSuffix}`
    case 'gift_card_series':
      return `${conditionMeta.label}: ${getOptionLabel(GIFT_CARD_MODE_OPTIONS, config.mode, 'seri eslesmesi')}${seriesLabels ? ` (${seriesLabels})` : ''}${joinerSuffix}`
    case 'campaign_triggered':
      return `${conditionMeta.label}: ${campaignLabels || 'secili kampanyalar'}${joinerSuffix}`
    case 'coupon_present':
      return `${conditionMeta.label}: ${config.anySeries ? 'herhangi bir seri' : (seriesLabels || 'secili seriler')}${joinerSuffix}`
    case 'happy_hour':
      return `${conditionMeta.label}: ${happyHourSummary || 'gün ve saat aralığı seçin'}${joinerSuffix}`
    case 'customer_has_tag':
      return `${conditionMeta.label}: ${categoryLabels || 'secili kategoriler'}${joinerSuffix}`
    case 'customer_lacks_tag':
      return `${conditionMeta.label}: ${categoryLabels || 'secili kategoriler'} haric${joinerSuffix}`
    case 'sales_channel':
      return `${conditionMeta.label}: ${formatSalesChannelSelections(config, summaryContext.salesChannelMap) || 'seçili satış kanalları'}${joinerSuffix}`
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
      const itemNames = formatCompactList((config.items || []).map(item => {
        const name = item.name || summaryContext.saleItemMap.get(String(item.itemId || '')) || item.itemId
        const qty = item.qty || 1
        return qty > 1 ? `${qty}x ${name}` : name
      }))
      return itemNames ? `${itemNames} urunlerini hediye et` : actionLabel
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
      return categoryLabel ? `${categoryLabel} kategorisinden cikar` : actionLabel
    case 'add_customer_tag':
      return categoryLabel ? `${categoryLabel} kategorisine ekle` : actionLabel
    case 'special_discount':
      return `${formatAmount(config.amount || 0)} ozel indirim uygula`
    case 'order_discount_amount':
      return `${formatAmount(config.amount || 0)} sipariş indirimi uygula`
    case 'order_extra_charge_amount':
      return `${formatAmount(config.amount || 0)} ek ucret uygula`
    case 'order_extra_charge_percent':
      return `%${config.percent || 0} ek ucret uygula`
    case 'discount_percent':
      return `%${config.percent || 0} indirim uygula`
    case 'total_order_discount_percent':
      return `%${config.percent || 0} toplam sipariş indirimi uygula`
    case 'order_discount':
      if (config.valueType === 'percent') {
        return `%${config.percent || 0} toplam sipariş indirimi uygula`
      }
      return `${formatAmount(config.amount || 0)} sipariş indirimi uygula`
    case 'order_extra_charge':
      if (config.valueType === 'percent') {
        return `%${config.percent || 0} ek ucret uygula`
      }
      return `${formatAmount(config.amount || 0)} ek ucret uygula`
    case 'warning_message':
      return String(config.message || '').trim() || actionLabel
    case 'bonus_points':
      return `${config.points || 0} puan yukle`
    case 'points_percent_of_order':
      return `sipariş tutarının %${config.percent || 0} kadar puan kazandır`
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
      description: template.description || '',
      group: 'Satış malı şablonları',
      icon: 'fa-tags',
      meta: `${Array.isArray(template.saleIds || template.sale_ids) ? (template.saleIds || template.sale_ids).length : 0} ürün`,
    })),
    ...(saleCategories || []).map(category => ({
      value: `category:${category.id}`,
      label: category.name || '',
      description: 'Ürün kategorisi / ürün grubu',
      group: 'Kategoriler',
      icon: 'fa-layer-group',
      meta: 'Kategori',
    })),
    ...(saleItems || []).map(item => ({
      value: `product:${item.id}`,
      label: item.name || '',
      description: item.sku || '',
      group: 'Ürünler',
      icon: 'fa-burger',
      meta: 'Ürün',
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
  return { id: createId('offer'), itemId: '', name: '', type: 'product', size: '', qty: 1 }
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

function campaignChannelsOverlap(left = {}, right = {}) {
  const leftTargets = Array.isArray(left.channelTargets) ? left.channelTargets.map(String).filter(Boolean) : []
  const rightTargets = Array.isArray(right.channelTargets) ? right.channelTargets.map(String).filter(Boolean) : []
  if (leftTargets.length === 0 || rightTargets.length === 0) return true
  const rightSet = new Set(rightTargets)
  return leftTargets.some(target => rightSet.has(target))
}

function campaignAudiencesOverlap(left = {}, right = {}) {
  const leftType = left.audienceType || 'all'
  const rightType = right.audienceType || 'all'
  if (leftType !== 'tagged_customers' || rightType !== 'tagged_customers') return true
  const leftCategories = Array.isArray(left.audienceCategoryIds) ? left.audienceCategoryIds.map(String).filter(Boolean) : []
  const rightCategories = Array.isArray(right.audienceCategoryIds) ? right.audienceCategoryIds.map(String).filter(Boolean) : []
  if (leftCategories.length === 0 || rightCategories.length === 0) return true
  const rightSet = new Set(rightCategories)
  return leftCategories.some(categoryId => rightSet.has(categoryId))
}

function campaignOperationalScopeOverlaps(left = {}, right = {}) {
  return campaignChannelsOverlap(left, right) && campaignAudiencesOverlap(left, right)
}

function getCampaignConflictGroupId(campaign = {}) {
  return String(campaign.metadata?.conflictGroupId || campaign.exclusionGroup || campaign.metadata?.exclusionGroup || '').trim()
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
  const primaryConditionLabel = conditions[0] ? getConditionMeta(conditions[0].conditionKey).label : 'Boş koşul bloğu'
  const blockTitle = conditions.length > 1 ? `${primaryConditionLabel} + ${conditions.length - 1} koşul` : primaryConditionLabel
  const blockMeta = `${conditions.length} koşul / ${actions.length} eylem`
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
            <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Koşul
            </div>
            <button className="btn-o" type="button" onClick={onAddCondition}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Koşul Ekle
            </button>
          </div>
          {conditions.length === 0 ? (
            <div style={{ borderRadius: 10, border: '1px dashed #bfdbfe', padding: 10, color: '#64748b', fontSize: '.84rem' }}>
              Henüz koşul eklenmedi.
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
                      <button className="btn-o" type="button" onClick={() => onEditCondition(condition.id)}>Düzenle</button>
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
              Henüz eylem eklenmedi.
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
                      <button className="btn-o" type="button" onClick={() => onEditAction(action.id)}>Düzenle</button>
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

function getCampaignSummaryText(campaign, selectedGoal, customerCategories, salesChannels, summaryContext) {
  if (!campaign) return '';

  let sentences = [];

  // 1. Goal (Hedef)
  if (selectedGoal === 'new_customer') {
    sentences.push('Bu kampanya yeni müşteri kazanmak üzere tasarlanmıştır.');
  } else if (selectedGoal === 'basket') {
    sentences.push('Bu kampanya sepet ortalamasını büyütmek üzere tasarlanmıştır.');
  } else if (selectedGoal === 'frequency') {
    sentences.push('Bu kampanya ziyaret sıklığını artırmak üzere tasarlanmıştır.');
  } else {
    sentences.push('Bu kampanya sadakat hedeflerine ulaşmak üzere tasarlanmıştır.');
  }

  // 2. Scope (Kapsam)
  if (campaign.name) {
    sentences.push(`Kampanya adı "${campaign.name}" olarak belirlenmiştir.`);
  }

  // Audience
  const audienceLabel = CAMPAIGN_AUDIENCE_OPTIONS.find(opt => opt.value === campaign.audienceType)?.label || campaign.audienceType;
  if (campaign.audienceType === 'all') {
    sentences.push('Kampanya tüm müşterileri kapsamaktadır.');
  } else if (campaign.audienceType === 'new_customers') {
    sentences.push('Hedef kitle olarak özellikle yeni müşteriler belirlenmiştir.');
  } else if (campaign.audienceType === 'inactive_customers') {
    sentences.push('Hedef kitle olarak inaktif (pasif) müşteriler hedeflenmiştir.');
  } else if (campaign.audienceType === 'members') {
    sentences.push('Kampanyadan sadece sadakat kulübü üyeleri yararlanabilecektir.');
  } else {
    sentences.push(`Kampanya hedef kitlesi: ${audienceLabel}.`);
  }

  // Audience Categories
  if (Array.isArray(campaign.audienceCategoryIds) && campaign.audienceCategoryIds.length > 0) {
    const catNames = (customerCategories || [])
      .filter(c => campaign.audienceCategoryIds.map(String).includes(String(c.id)))
      .map(c => c.name)
      .join(', ');
    if (catNames) {
      sentences.push(`Sadakat grubu / kategorisi filtreleri: ${catNames}.`);
    }
  }

  // Channels
  if (Array.isArray(campaign.channelTargets) && campaign.channelTargets.length > 0) {
    const channelNames = (salesChannels || [])
      .filter(c => campaign.channelTargets.map(String).includes(String(c.value)))
      .map(c => c.label)
      .join(', ');
    if (channelNames) {
      sentences.push(`Kampanya sadece ${channelNames} satış kanallarında geçerli olacaktır.`);
    }
  } else {
    sentences.push('Kampanya tüm satış kanallarında geçerli olacaktır.');
  }

  // Branches
  const selectedBranches = campaign.metadata?.branchSelections || [];
  if (selectedBranches.length > 0) {
    const branchNames = selectedBranches.map(item => {
      if (item.type === 'template') {
        return `"${item.name}" şube grubu (${(item.branchIds || []).length} şube)`;
      }
      return `"${item.name}" şubesi`;
    }).join(', ');
    sentences.push(`Kampanya sadece seçilen şubelerde geçerli olacaktır: ${branchNames}.`);
  } else {
    sentences.push('Kampanya tüm şubelerde geçerli olacaktır.');
  }

  // Dates
  if (campaign.startsAt && campaign.endsAt) {
    sentences.push(`Kampanya ${campaign.startsAt} ile ${campaign.endsAt} tarihleri arasında aktif kalacaktır.`);
  } else if (campaign.startsAt) {
    sentences.push(`Kampanya ${campaign.startsAt} tarihinden itibaren geçerli olacaktır.`);
  } else if (campaign.endsAt) {
    sentences.push(`Kampanya ${campaign.endsAt} tarihine kadar geçerli olacaktır.`);
  } else {
    sentences.push('Kampanya süresiz (açık uçlu) olarak tanımlanmıştır.');
  }

  // 3. Rules (Tetikleyici & Kazanım)
  const appRules = campaign.applicableRules || [];
  const perRules = campaign.periodicRules || [];

  if (appRules.length === 0 && perRules.length === 0) {
    sentences.push('Henüz herhangi bir kampanya kuralı veya koşulu eklenmemiştir.');
  } else {
    // Summarize Order-time (applicable) rules
    if (appRules.length > 0) {
      appRules.forEach((rule, idx) => {
        const conditions = rule.conditions || [];
        const actions = rule.actions || [];
        
        let condTexts = conditions.map(c => {
          const pseudoRule = {
            ...rule,
            conditionKey: c.conditionKey,
            conditionConfig: getStandaloneConditionConfig(c.conditionConfig),
          };
          return buildConditionSummary(pseudoRule, summaryContext);
        }).join(rule.conditionConfig?.additionalConditionsMode === 'or' ? ' VEYA ' : ' VE ');

        let actTexts = actions.map(a => {
          const pseudoRule = {
            ...rule,
            actionType: a.actionType,
            actionConfig: getStandaloneActionConfig(a.actionConfig),
          };
          return a.actionSummary || buildActionSummary(pseudoRule, summaryContext);
        }).join(' VE ');

        if (condTexts && actTexts) {
          sentences.push(`Sipariş anında çalışan ${idx + 1}. Kural: [${condTexts}] durumunda [${actTexts}] eylemi uygulanacaktır.`);
        } else if (actTexts) {
          sentences.push(`Sipariş anında çalışan ${idx + 1}. Kural: Koşulsuz olarak [${actTexts}] uygulanacaktır.`);
        }
      });
    }

    // Summarize Periodic rules
    if (perRules.length > 0) {
      perRules.forEach((rule, idx) => {
        const conditions = rule.conditions || [];
        const actions = rule.actions || [];

        let condTexts = conditions.map(c => {
          const pseudoRule = {
            ...rule,
            conditionKey: c.conditionKey,
            conditionConfig: getStandaloneConditionConfig(c.conditionConfig),
          };
          return buildConditionSummary(pseudoRule, summaryContext);
        }).join(rule.conditionConfig?.additionalConditionsMode === 'or' ? ' VEYA ' : ' VE ');

        let actTexts = actions.map(a => {
          const pseudoRule = {
            ...rule,
            actionType: a.actionType,
            actionConfig: getStandaloneActionConfig(a.actionConfig),
          };
          return a.actionSummary || buildActionSummary(pseudoRule, summaryContext);
        }).join(' VE ');

        if (condTexts && actTexts) {
          sentences.push(`Arka planda çalışan ${idx + 1}. Periyodik Kural: [${condTexts}] durumunda [${actTexts}] eylemi tetiklenecektir.`);
        } else if (actTexts) {
          sentences.push(`Arka planda çalışan ${idx + 1}. Periyodik Kural: Koşulsuz olarak [${actTexts}] tetiklenecektir.`);
        }
      });
    }
  }

  // 4. Operations
  const appModeLabel = CAMPAIGN_APPLICATION_MODE_OPTIONS.find(opt => opt.value === campaign.applicationMode)?.label || campaign.applicationMode;
  sentences.push(`Kampanya önceliği ${campaign.priority} olarak ayarlanmıştır ve uygulama yöntemi "${appModeLabel}" şeklindedir.`);
  
  if (campaign.stackable) {
    sentences.push('Bu kampanya diğer sepet kampanyaları ile birleştirilebilir (stackable).');
  } else {
    sentences.push('Bu kampanya diğer sepet kampanyaları ile birleştirilemez.');
  }

  return sentences.join(' ');
}

export const IMAGE_SLOTS = [
  { key: 'mobileCouponImage', label: 'Mobil Uygulama Kupon Görseli', recommended: '600x300px' },
  { key: 'mobileCampaignImage', label: 'Mobil Uygulama Kampanya Görseli', recommended: '800x400px' },
  { key: 'kioskBigBanner', label: 'KioskBig Banner', recommended: '1920x1080px' },
  { key: 'kioskTabletBanner', label: 'Kiosk Tablet Banner', recommended: '1280x800px' },
  { key: 'socialMediaImage', label: 'Sosyal Medya Görseli', recommended: '1200x630px' },
  { key: 'posGarsonScreenImage', label: 'POS/Garson Kampanya Ekranı Görseli', recommended: '400x300px' },
  { key: 'qrMenuImage', label: 'QR Menü Kampanya Görseli', recommended: '600x600px' },
]

export function getSlotLabel(key) {
  const slot = IMAGE_SLOTS.find(s => s.key === key)
  return slot ? slot.label : key
}

export default function LoyaltyCampaignWizard({ mode }) {
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { campaignId } = useParams()
  const workspace = useWorkspace()

  const activeMode = location.pathname.endsWith('/duzenle') 
    ? 'edit' 
    : location.pathname.endsWith('/gor') 
      ? 'view' 
      : (mode || 'create')

  const [currentStep, setCurrentStep] = useState(0)
  const [wizardMode, setWizardMode] = useState('advanced')
  const [showAllConditions, setShowAllConditions] = useState(false)
  const [showAllActions, setShowAllActions] = useState(false)
  const [selectedLibCondition, setSelectedLibCondition] = useState(SIMPLE_CONDITION_CHOICES[0].value)
  const [selectedLibAction, setSelectedLibAction] = useState(SIMPLE_ACTION_CHOICES[0].value)
  const [selectedGoal, setSelectedGoal] = useState(GOAL_PRESETS[0].value)
  const [ruleScopeTab, setRuleScopeTab] = useState('applicable')
  const [wizardCampaign, setWizardCampaign] = useState(() => createBlankCampaign(DEFAULT_LOYALTY_PROGRAM.id, GOAL_PRESETS[0]))
  const [program, setProgram] = useState(normalizeProgram(DEFAULT_LOYALTY_PROGRAM))
  const [tiers, setTiers] = useState([])
  const [couponSeries, setCouponSeries] = useState([])
  const [conflictGroups, setConflictGroups] = useState([])
  const [existingCampaigns, setExistingCampaigns] = useState([])
  const [customerCategories, setCustomerCategories] = useState([])
  const [referralPrograms, setReferralPrograms] = useState([])
  const [salesChannels, setSalesChannels] = useState(CAMPAIGN_CHANNEL_OPTIONS.map(option => ({ value: option.value, label: option.label })))
  const [saleItems, setSaleItems] = useState([])
  const [saleCategories, setSaleCategories] = useState([])
  const [saleTemplates, setSaleTemplates] = useState([])
  const [branches, setBranches] = useState([])
  const [branchTemplates, setBranchTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(false)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [scopeInfo, setScopeInfo] = useState(null)
  const [schemaIssues, setSchemaIssues] = useState([])
  const [ruleEditorState, setRuleEditorState] = useState(null)
  const [stackingHelpKey, setStackingHelpKey] = useState(null)
  const [campaignImageUploading, setCampaignImageUploading] = useState(false)
  const [slotUploading, setSlotUploading] = useState({})
  const [conflictGroupModalOpen, setConflictGroupModalOpen] = useState(false)
  const [conflictGroupDraft, setConflictGroupDraft] = useState({ name: '', description: '' })
  const [conflictGroupSaving, setConflictGroupSaving] = useState(false)
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false)
  const workspaceSnapshotRef = useRef({
    program: normalizeProgram(DEFAULT_LOYALTY_PROGRAM),
    tiers: [],
    campaigns: [],
    couponSeries: [],
    conflictGroups: [],
    referralPrograms: [],
  })

  const activeCustomerCategories = useMemo(
    () => (customerCategories || []).filter(category => category?.active !== false),
    [customerCategories],
  )

  const sanitizeWizardBranchSelections = useCallback((selections) => {
    const templates = []
    const branchesSelected = []

    selections.forEach(val => {
      if (val.startsWith('template:')) {
        const id = val.replace('template:', '')
        const t = branchTemplates.find(x => String(x.id) === id)
        if (t) {
          templates.push({
            id: String(t.id),
            type: 'template',
            name: t.name,
            branchIds: (t.branch_ids || []).map(String)
          })
        }
      } else if (val.startsWith('branch:')) {
        const id = val.replace('branch:', '')
        const b = branches.find(x => String(x.id) === id)
        if (b) {
          branchesSelected.push({
            id: String(b.id),
            type: 'branch',
            name: b.name
          })
        }
      }
    })

    const coveredBranchIds = new Set(templates.flatMap(t => t.branchIds || []))
    const filteredBranches = branchesSelected.filter(b => !coveredBranchIds.has(String(b.id)))

    return [
      ...templates,
      ...filteredBranches.map(b => ({ id: b.id, type: 'branch', name: b.name }))
    ]
  }, [branches, branchTemplates])

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

        const [workspaceResult, categoryResult, conflictGroupResult, lookupResults] = await Promise.all([
          loadLoyaltyWorkspaceWithRetry(workspacePayload),
          loadLoyaltyCustomerCategories(workspacePayload).catch(() => ({ categories: [] })),
          loadLoyaltyCampaignConflictGroups(workspacePayload).catch(error => ({
            groups: [],
            schemaReady: false,
            databaseUnavailable: true,
            schemaIssues: [{ code: 'loyalty_campaign_conflict_groups', message: String(error?.message || 'Conflict groups load failed') }],
          })),
          Promise.allSettled([
            db.from('sales_channels').select('id,name,deleted_at').is('deleted_at', null).order('sort_order').order('name'),
            db.from('sale_items').select('id,name,sku,deleted_at').is('deleted_at', null).order('name'),
            db.from('sale_categories').select('id,name,deleted_at').is('deleted_at', null).order('name'),
            db.from('sale_templates').select('id,name,description,sale_ids').order('name'),
            db.from('settings').select('value').eq('key', 'company_tree').single(),
            db.from('branch_templates').select('id,name,branch_ids,deleted_at').is('deleted_at', null).order('name'),
          ]),
        ])

        if (cancelled) return

        const safeProgram = normalizeProgram(workspaceResult?.program || DEFAULT_LOYALTY_PROGRAM)
        const safeCampaigns = Array.isArray(workspaceResult?.campaigns) ? workspaceResult.campaigns : []
        const safeCouponSeries = Array.isArray(workspaceResult?.couponSeries) ? workspaceResult.couponSeries : []
        const safeTiers = Array.isArray(workspaceResult?.tiers) ? workspaceResult.tiers : []
        const safeConflictGroups = Array.isArray(conflictGroupResult?.groups) ? conflictGroupResult.groups : []

        workspaceSnapshotRef.current = {
          program: safeProgram,
          tiers: safeTiers,
          campaigns: safeCampaigns,
          couponSeries: safeCouponSeries,
          conflictGroups: safeConflictGroups,
          referralPrograms: workspaceResult?.referralPrograms || [],
        }

        setProgram(safeProgram)
        setTiers(safeTiers)
        setCouponSeries(safeCouponSeries)
        setConflictGroups(safeConflictGroups)
        setExistingCampaigns(safeCampaigns)
        setReferralPrograms(workspaceResult?.referralPrograms || [])
        setCustomerCategories(categoryResult?.categories || [])
        setScopeInfo(workspaceResult?.scopeInfo || getLoyaltyScopeInfo(workspacePayload))
        setSchemaReady(Boolean(workspaceResult?.schemaReady))
        setDatabaseUnavailable(Boolean(workspaceResult?.databaseUnavailable))
        setSchemaIssues([
          ...(Array.isArray(workspaceResult?.schemaIssues) ? workspaceResult.schemaIssues : []),
          ...(Array.isArray(conflictGroupResult?.schemaIssues) ? conflictGroupResult.schemaIssues : []),
        ])

        const [salesChannelsResult, saleItemsResult, saleCategoriesResult, saleTemplatesResult, companyTreeResult, branchTemplatesResult] = lookupResults

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

        if (companyTreeResult && companyTreeResult.status === 'fulfilled' && !companyTreeResult.value.error) {
          const val = companyTreeResult.value.data?.value
          setBranches(getAllBranches(val))
        }

        if (branchTemplatesResult && branchTemplatesResult.status === 'fulfilled' && !branchTemplatesResult.value.error) {
          setBranchTemplates(branchTemplatesResult.value.data || [])
        }

        const routeCampaign = campaignId && campaignId !== 'yeni'
          ? safeCampaigns.find(item => String(item.id) === String(campaignId))
          : null

        if (routeCampaign) {
          const matchedPreset = GOAL_PRESETS.find(preset => preset.audienceType === routeCampaign.audienceType) || GOAL_PRESETS[0]
          setSelectedGoal(matchedPreset.value)
        }

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
  const mergeMode = wizardCampaign.stackable
    ? 'stackable'
    : (wizardCampaign.metadata?.stackMode === 'group' || wizardCampaign.exclusionGroup ? 'group' : 'exclusive')
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
  const operationalPeerCampaigns = useMemo(() => (
    existingCampaigns
      .filter(campaign => String(campaign.id) !== String(wizardCampaign.id))
      .filter(campaign => campaign?.active !== false)
      .filter(campaign => campaignOperationalScopeOverlaps(campaign, wizardCampaign))
  ), [existingCampaigns, wizardCampaign])
  const stackablePeerCampaigns = useMemo(() => (
    operationalPeerCampaigns
      .filter(campaign => campaign.stackable)
      .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0) || String(left.name || '').localeCompare(String(right.name || ''), 'tr'))
  ), [operationalPeerCampaigns])
  const activeExclusiveCampaigns = useMemo(() => (
    operationalPeerCampaigns
      .filter(campaign => !campaign.stackable && !getCampaignConflictGroupId(campaign))
      .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0) || String(left.name || '').localeCompare(String(right.name || ''), 'tr'))
  ), [operationalPeerCampaigns])
  const activeConflictGroups = useMemo(() => (
    conflictGroups.filter(group => group?.active !== false)
  ), [conflictGroups])
  const selectedConflictGroupId = String(wizardCampaign.metadata?.conflictGroupId || wizardCampaign.exclusionGroup || '').trim()
  const selectedConflictGroup = useMemo(() => (
    activeConflictGroups.find(group => String(group.id) === selectedConflictGroupId)
    || activeConflictGroups.find(group => String(group.name || '').trim() === selectedConflictGroupId)
    || null
  ), [activeConflictGroups, selectedConflictGroupId])
  const selectedGroupCampaigns = useMemo(() => {
    const groupId = selectedConflictGroup?.id || selectedConflictGroupId
    if (!groupId) return []
    return operationalPeerCampaigns
      .filter(campaign => getCampaignConflictGroupId(campaign) === groupId)
      .sort((left, right) => Number(left.priority || 0) - Number(right.priority || 0) || String(left.name || '').localeCompare(String(right.name || ''), 'tr'))
  }, [operationalPeerCampaigns, selectedConflictGroup?.id, selectedConflictGroupId])
  const activeStackingHelp = stackingHelpKey ? STACKING_RULE_HELP[stackingHelpKey] : null

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

  async function uploadCampaignImage(file) {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      toast('Lütfen kampanya görseli için bir resim dosyası seçin.', 'error')
      return
    }
    setCampaignImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'loyalty-campaigns')
      formData.append('entity', 'loyalty_campaign')
      const uploaded = await uploadApiFile(formData)
      const url = uploaded?.url || uploaded?.publicUrl || uploaded?.public_url || uploaded?.path || uploaded?.fileUrl || uploaded?.file_url || ''
      if (!url) throw new Error('Yükleme başarılı oldu ancak dosya URL bilgisi dönmedi.')
      const imageId = createId('campaign-image')
      const imageRecord = {
        id: imageId,
        storage: 'railway',
        url,
        fileName: uploaded?.fileName || uploaded?.filename || file.name,
        title: uploaded?.fileName || uploaded?.filename || file.name,
        mimeType: uploaded?.mimeType || uploaded?.mimetype || file.type,
        size: uploaded?.size || file.size,
        uploadedAt: new Date().toISOString(),
      }
      updateCampaign(current => ({
        metadata: (() => {
          const metadata = current.metadata || {}
          const library = normalizeCampaignImageLibrary(metadata)
          const nextImages = [...library.images.map(image => ({ ...image, isPrimary: false })), imageRecord]
          const primaryId = library.primaryId || imageId
          return {
            ...metadata,
            campaignImages: nextImages.map(image => ({ ...image, isPrimary: image.id === primaryId })),
            primaryCampaignImageId: primaryId,
            campaignImage: { ...(nextImages.find(image => image.id === primaryId) || imageRecord), isPrimary: true },
          }
        })(),
      }))
      toast('Kampanya görseli yüklendi.', 'success')
    } catch (error) {
      toast(`Kampanya görseli yüklenemedi: ${error.message}`, 'error')
    } finally {
      setCampaignImageUploading(false)
    }
  }

  async function uploadSlotImage(file, slotKey) {
    if (!file) return
    if (!file.type?.startsWith('image/')) {
      toast('Lütfen geçerli bir resim dosyası seçin.', 'error')
      return
    }
    setSlotUploading(current => ({ ...current, [slotKey]: true }))
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'loyalty-campaigns')
      formData.append('entity', 'loyalty_campaign')
      const uploaded = await uploadApiFile(formData)
      const url = uploaded?.url || uploaded?.publicUrl || uploaded?.public_url || uploaded?.path || uploaded?.fileUrl || uploaded?.file_url || ''
      if (!url) throw new Error('Yükleme başarılı oldu ancak dosya URL bilgisi dönmedi.')
      
      const fileName = uploaded?.fileName || uploaded?.filename || file.name
      const fileRecord = {
        url,
        fileName,
        uploadedAt: new Date().toISOString()
      }
      
      if (slotKey === 'archive') {
        const imageId = createId('campaign-image')
        const imageRecord = {
          id: imageId,
          storage: 'railway',
          url,
          fileName,
          title: fileName,
          mimeType: uploaded?.mimeType || uploaded?.mimetype || file.type,
          size: uploaded?.size || file.size,
          uploadedAt: new Date().toISOString(),
        }
        updateCampaign(current => ({
          metadata: (() => {
            const metadata = current.metadata || {}
            const library = normalizeCampaignImageLibrary(metadata)
            const nextImages = [...library.images.map(image => ({ ...image, isPrimary: false })), imageRecord]
            const primaryId = library.primaryId || imageId
            return {
              ...metadata,
              campaignImages: nextImages.map(image => ({ ...image, isPrimary: image.id === primaryId })),
              primaryCampaignImageId: primaryId,
              campaignImage: { ...(nextImages.find(image => image.id === primaryId) || imageRecord), isPrimary: true },
            }
          })()
        }))
        toast('Görsel arşive yüklendi.', 'success')
      } else {
        const imageId = createId('campaign-image')
        const imageRecord = {
          id: imageId,
          storage: 'railway',
          url,
          fileName,
          title: `${getSlotLabel(slotKey)} - ${fileName}`,
          mimeType: uploaded?.mimeType || uploaded?.mimetype || file.type,
          size: uploaded?.size || file.size,
          uploadedAt: new Date().toISOString(),
        }
        updateCampaign(current => ({
          metadata: (() => {
            const metadata = current.metadata || {}
            const library = normalizeCampaignImageLibrary(metadata)
            const nextImages = [...library.images, imageRecord]
            return {
              ...metadata,
              [slotKey]: fileRecord,
              campaignImages: nextImages,
            }
          })()
        }))
        toast(`${getSlotLabel(slotKey)} yüklendi ve arşive eklendi.`, 'success')
      }
    } catch (error) {
      toast(`Görsel yüklenemedi: ${error.message}`, 'error')
    } finally {
      setSlotUploading(current => ({ ...current, [slotKey]: false }))
    }
  }

  function setSlotImageUrl(slotKey, url) {
    const cleanUrl = String(url || '').trim()
    if (!cleanUrl) return
    const fileRecord = {
      url: cleanUrl,
      fileName: 'Harici URL',
      uploadedAt: new Date().toISOString()
    }
    if (slotKey === 'archive') {
      const imageId = createId('campaign-image-url')
      const imageRecord = {
        id: imageId,
        storage: 'railway',
        url: cleanUrl,
        title: 'Harici Görsel',
        uploadedAt: new Date().toISOString(),
      }
      updateCampaign(current => ({
        metadata: (() => {
          const metadata = current.metadata || {}
          const library = normalizeCampaignImageLibrary(metadata)
          const nextImages = [...library.images, imageRecord]
          return {
            ...metadata,
            campaignImages: nextImages,
          }
        })()
      }))
      toast('Harici görsel arşive eklendi.', 'success')
    } else {
      const imageId = createId('campaign-image-url')
      const imageRecord = {
        id: imageId,
        storage: 'railway',
        url: cleanUrl,
        title: `${getSlotLabel(slotKey)} (URL)`,
        uploadedAt: new Date().toISOString(),
      }
      updateCampaign(current => ({
        metadata: (() => {
          const metadata = current.metadata || {}
          const library = normalizeCampaignImageLibrary(metadata)
          const nextImages = [...library.images, imageRecord]
          return {
            ...metadata,
            [slotKey]: fileRecord,
            campaignImages: nextImages,
          }
        })()
      }))
      toast(`${getSlotLabel(slotKey)} URL adresi atandı ve arşive eklendi.`, 'success')
    }
  }

  function removeSlotImage(slotKey) {
    updateCampaign(current => {
      const metadata = { ...(current.metadata || {}) }
      delete metadata[slotKey]
      return {
        ...current,
        metadata
      }
    })
    toast(`${getSlotLabel(slotKey)} kaldırıldı.`, 'info')
  }

  function useArchiveImageForSlot(archiveImage, slotKey) {
    if (!archiveImage?.url) return
    const fileRecord = {
      url: archiveImage.url,
      fileName: archiveImage.fileName || archiveImage.title || 'Arşiv Görseli',
      uploadedAt: new Date().toISOString()
    }
    updateCampaign(current => ({
      ...current,
      metadata: {
        ...(current.metadata || {}),
        [slotKey]: fileRecord
      }
    }))
    toast(`Arşiv görseli ${getSlotLabel(slotKey)} alanına atandı.`, 'success')
  }

  function addCampaignImageUrl(url) {
    const cleanUrl = String(url || '').trim()
    if (!cleanUrl) return
    updateCampaign(current => ({
      metadata: (() => {
        const metadata = current.metadata || {}
        const library = normalizeCampaignImageLibrary(metadata)
        const existing = library.images.find(image => image.url === cleanUrl)
        const imageRecord = existing || {
          id: createId('campaign-image-url'),
          storage: 'railway',
          url: cleanUrl,
          title: `Görsel ${library.images.length + 1}`,
          uploadedAt: new Date().toISOString(),
        }
        const nextImages = existing ? library.images : [...library.images, imageRecord]
        const primaryId = library.primaryId || imageRecord.id
        return {
          ...metadata,
          campaignImages: nextImages.map(image => ({ ...image, isPrimary: image.id === primaryId })),
          primaryCampaignImageId: primaryId,
          campaignImage: { ...(nextImages.find(image => image.id === primaryId) || imageRecord), isPrimary: true },
        }
      })(),
    }))
  }

  function setPrimaryCampaignImage(imageId) {
    updateCampaign(current => ({
      metadata: (() => {
        const metadata = current.metadata || {}
        const library = normalizeCampaignImageLibrary(metadata)
        const primaryImage = library.images.find(image => image.id === imageId) || library.images[0] || null
        return {
          ...metadata,
          campaignImages: library.images.map(image => ({ ...image, isPrimary: primaryImage?.id === image.id })),
          primaryCampaignImageId: primaryImage?.id || '',
          campaignImage: primaryImage ? { ...primaryImage, isPrimary: true } : {},
        }
      })(),
    }))
  }

  function removeCampaignImage(imageId) {
    updateCampaign(current => ({
      metadata: (() => {
        const metadata = current.metadata || {}
        const library = normalizeCampaignImageLibrary(metadata)
        const nextImages = library.images.filter(image => image.id !== imageId)
        const primaryImage = nextImages.find(image => image.id === library.primaryId) || nextImages[0] || null
        return {
          ...metadata,
          campaignImages: nextImages.map(image => ({ ...image, isPrimary: primaryImage?.id === image.id })),
          primaryCampaignImageId: primaryImage?.id || '',
          campaignImage: primaryImage ? { ...primaryImage, isPrimary: true } : {},
        }
      })(),
    }))
  }

  function openCampaignTaskCreate() {
    const returnTo = `${location.pathname}${location.search || ''}`
    const params = new URLSearchParams({
      create: '1',
      source: 'loyalty_campaign',
      campaignId: wizardCampaign.id || campaignId || '',
      campaignName: wizardCampaign.name || 'Adsız kampanya',
      taskTitle: `Kampanya görevi: ${wizardCampaign.name || 'Adsız kampanya'}`,
      taskDescription: `Kampanya adı: ${wizardCampaign.name || 'Adsız kampanya'}`,
      returnTo,
    })
    navigate(`/tasks?${params.toString()}`)
  }

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
            ...getSimpleActionConfig(actionType),
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
              actionConfig: getSimpleActionConfig(actionType),
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
          metadata: {
            ...(current.metadata || {}),
            stackMode: 'stackable',
            conflictGroupId: undefined,
            conflictGroupName: undefined,
            exclusionGroup: undefined,
          },
        }
      }
      if (mode === 'group') {
        const selectedGroup = activeConflictGroups.find(group => String(group.id) === String(current.metadata?.conflictGroupId || current.exclusionGroup || ''))
          || activeConflictGroups[0]
        return {
          ...current,
          stackable: false,
          exclusionGroup: selectedGroup?.id || '',
          metadata: {
            ...(current.metadata || {}),
            stackMode: 'group',
            conflictGroupId: selectedGroup?.id || '',
            conflictGroupName: selectedGroup?.name || '',
            exclusionGroup: selectedGroup?.id || '',
          },
        }
      }
      return {
        ...current,
        stackable: false,
        exclusionGroup: '',
        metadata: {
          ...(current.metadata || {}),
          stackMode: 'exclusive',
          conflictGroupId: undefined,
          conflictGroupName: undefined,
          exclusionGroup: undefined,
        },
      }
    })
  }

  function selectConflictGroup(groupId) {
    const selected = activeConflictGroups.find(group => String(group.id) === String(groupId)) || null
    updateCampaign(current => ({
      ...current,
      stackable: false,
      exclusionGroup: selected?.id || '',
      metadata: {
        ...(current.metadata || {}),
        stackMode: 'group',
        conflictGroupId: selected?.id || '',
        conflictGroupName: selected?.name || '',
        exclusionGroup: selected?.id || '',
      },
    }))
  }

  async function saveConflictGroup() {
    const name = conflictGroupDraft.name.trim()
    if (!name) {
      toast('Grup adi zorunlu', 'error')
      return
    }

    setConflictGroupSaving(true)
    try {
      const result = await createLoyaltyCampaignConflictGroup({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, {
        name,
        description: conflictGroupDraft.description,
        sortOrder: (conflictGroups.length + 1) * 10,
      })
      const createdGroup = result.group
      setConflictGroups(current => [...current.filter(group => group.id !== createdGroup.id), createdGroup].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.name || '').localeCompare(String(right.name || ''), 'tr')))
      updateCampaign(current => ({
        ...current,
        stackable: false,
        exclusionGroup: createdGroup.id,
        metadata: {
          ...(current.metadata || {}),
          stackMode: 'group',
          conflictGroupId: createdGroup.id,
          conflictGroupName: createdGroup.name,
          exclusionGroup: createdGroup.id,
        },
      }))
      setConflictGroupDraft({ name: '', description: '' })
      setConflictGroupModalOpen(false)
      toast('Çakışma grubu kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Çakışma grubu kaydedilemedi', 'error')
    } finally {
      setConflictGroupSaving(false)
    }
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
    const ruleList = scope === 'periodic' ? periodicRules : activeRules
    if (ruleList.length === 0) {
      const newRule = createDraftRule(choice.value, 'bonus_points', scope, 0)
      replaceRules(scope, () => [newRule])
    } else {
      addConditionToRule(scope, ruleList[0].id, choice.value)
    }
  }

  function applySimpleAction(choice, scope = ruleScopeTab) {
    setRuleScopeTab(scope)
    updateCampaign({ campaignType: choice.campaignType || wizardCampaign.campaignType })
    const ruleList = scope === 'periodic' ? periodicRules : activeRules
    if (ruleList.length === 0) {
      const newRule = createDraftRule(scope === 'periodic' ? 'calendar_schedule' : 'order_total', choice.value, scope, 0)
      replaceRules(scope, () => [newRule])
    } else {
      addActionToRule(scope, ruleList[0].id, choice.value)
    }
  }

  function validateBeforeSave() {
    if (!wizardCampaign.name.trim()) {
      toast('Kampanya adi zorunlu', 'error')
      if (activeMode === 'create') setCurrentStep(3)
      return false
    }
    if (wizardCampaign.audienceType === 'tagged_customers' && (wizardCampaign.audienceCategoryIds || []).length === 0) {
      toast('Müşteri kategorileri hedefi için en az bir kategori seçin', 'error')
      if (activeMode === 'create') setCurrentStep(1)
      return false
    }
    if (mergeMode === 'group' && !String(wizardCampaign.metadata?.conflictGroupId || wizardCampaign.exclusionGroup || '').trim()) {
      toast('Grup bazlı çakışma için bir kampanya grubu seçin veya yeni grup oluşturun', 'error')
      if (activeMode === 'create') setCurrentStep(3)
      return false
    }

    const runtimeCampaign = serializeCampaignForPersistence(wizardCampaign, program.id)
    if ((runtimeCampaign.applicableRules || []).length === 0 && (runtimeCampaign.periodicRules || []).length === 0) {
      toast('Kaydetmeden önce en az bir geçerli koşul ve eylem bloğu oluşturun', 'error')
      if (activeMode === 'create') setCurrentStep(2)
      return false
    }
    return true
  }

  async function handleSave() {
    if (!validateBeforeSave()) return
    if (databaseUnavailable || !schemaReady) {
      toast('Sadakat workspace hazır olmadığı için kaydetme kapalı', 'error')
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
        referralPrograms,
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
        conflictGroups,
        campaigns: [...existingCampaignsWithoutCurrent, runtimeCampaign],
        referralPrograms,
      }

      toast('Kampanya başarıyla kaydedildi', 'success')
      navigate(`/sadakat/kampanya/${runtimeCampaign.id}/gor`)
    } catch (error) {
      toast(error?.message || 'Kampanya kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function renderMaskSelect(value, onChange, placeholder = 'Ürün / kategori / şablon seçin') {
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
        <FieldStack label={label} hint="Bu alandan ürün, kategori veya satış malı şablonu seçilebilir.">
          <div style={{ display: 'grid', gap: 8 }}>
            {masks.map(mask => {
              const isTemplate = mask.type === 'sale_template' || mask.type === 'mask' || mask.type === 'template'
              const templateObj = isTemplate ? saleTemplates.find(st => String(st.id) === String(mask.itemId)) : null
              const matchedProducts = templateObj
                ? (templateObj.saleIds || templateObj.sale_ids || []).map(id => saleItems.find(p => String(p.id) === String(id))).filter(Boolean)
                : []
              const selectedValue = mask.itemId ? `${mask.type || 'product'}:${mask.itemId}` : ''

              return (
                <div key={mask.id} style={{ display: 'grid', gap: 4, padding: 8, border: '1px solid #f1f5f9', borderRadius: 12, background: '#fafbfc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8, alignItems: 'end' }}>
                    <div style={{ flex: 1 }}>
                      {renderMaskSelect(selectedValue, rawValue => {
                        const parsed = parseCatalogSelection(rawValue, maskCatalogMap)
                        onPatch(current => ({
                          ...current,
                          productMasks: (current.productMasks || []).map(item => item.id === mask.id ? { ...item, ...parsed } : item),
                        }))
                      })}
                    </div>
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
                  {matchedProducts.length > 0 && (
                    <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', padding: '6px 12px', borderRadius: 10, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800 }}>Şablon İçeriği:</span>
                      {matchedProducts.map(p => (
                        <span key={p.id} style={{ background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 6, fontSize: '.68rem' }}>
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 10 }}>
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
              <button className="btn-o" type="button" style={{ color: '#7c3aed', borderColor: '#ddd6fe', background: '#f5f3ff' }} onClick={() => setShowNewTemplateModal(true)}>
                <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Yeni Şablon Oluştur
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
        return <HelperNote title="Temel sipariş koşulu">Ek bir eşik aramadan, hedef kitle ve kanal uyuyorsa her siparişte çalışır.</HelperNote>
      case 'calendar_schedule':
        return (
          <div style={{ display: 'grid', gap: 12 }}>
            <HelperNote title="Periyodik takvim koşulu">Günlük, haftalık, aylık veya yıllık tekrar eden kampanyalar için kullanılır.</HelperNote>
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
            <FieldStack label="Doğum gününden gün önce">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.daysBefore)} onChange={event => onPatch({ daysBefore: event.target.value })} />
            </FieldStack>
            <FieldStack label="Doğum gününden gün sonra">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.daysAfter)} onChange={event => onPatch({ daysAfter: event.target.value })} />
            </FieldStack>
          </div>
        )
      case 'period_total_order_amount':
      case 'order_total':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: conditionKey === 'order_total' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
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
              ) : null}
            </div>
            {conditionKey === 'period_total_order_amount' && (config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gün sayısı">
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
              <FieldStack label="Ziyaret / sipariş adedi">
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
              <FieldStack label="Kayan gün sayısı">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => onPatch({ periodDays: event.target.value })} />
              </FieldStack>
            ) : null}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.includeCurrentOrder)} onChange={event => onPatch({ includeCurrentOrder: event.target.checked })} />
              Mevcut ziyaret / siparisi de say
            </label>
          </div>
        )
      case 'period_product_quantity': {
        const isStampMode = config.isStampMode !== false;
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            {/* Mode selection radio buttons */}
            <div style={{ display: 'flex', gap: 16, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#0f172a', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={`mode-${rule.id}`}
                  checked={isStampMode}
                  onChange={() => onPatch({ isStampMode: true, operator: 'gte' })}
                />
                🏆 Damga Kartı Modu (Önerilen)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name={`mode-${rule.id}`}
                  checked={!isStampMode}
                  onChange={() => onPatch({ isStampMode: false })}
                />
                ⚙️ Gelişmiş Ürün Miktarı Modu
              </label>
            </div>

            {/* Stamp mode explanation or notice */}
            {isStampMode ? (
              <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, color: '#1e40af', fontSize: '.78rem', lineHeight: 1.5 }}>
                <strong>🏆 Damga Kartı Modu Aktif:</strong> Karşılaştırma operatörü otomatik olarak <strong>"büyük veya eşit"</strong> olarak ayarlanmıştır. Bu sayede müşterinin hedefin üzerinde aldığı kahveler/ürünler (örneğin 4 kahvesi varken tek seferde 2 kahve alması durumunda) kaybolmaz, yeni döngüye (1/5 olarak) başarıyla aktarılır.
              </div>
            ) : (
              <div style={{ padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: '.78rem', lineHeight: 1.5 }}>
                <strong>⚠️ Gelişmiş Mod Aktif:</strong> Dönemlik ürün kontrolü için karşılaştırma operatörünü serbestçe seçebilirsiniz. Damga kartı benzeri kazanım kurguları yapıyorsanız "büyük veya eşit" operatörünü seçmeniz önerilir.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <FieldStack label={isStampMode ? 'Hedef Damga / Ürün Sayısı' : 'Ürün adedi'}>
                <input className="f-input" type="number" min={0} value={formatNumberInputValue(config.quantity)} onChange={event => onPatch({ quantity: event.target.value })} />
              </FieldStack>
              {isStampMode ? (
                <FieldStack label="Karşılaştırma">
                  <input className="f-input" style={{ background: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }} type="text" readOnly value="Büyük veya Eşit (>=)" />
                </FieldStack>
              ) : (
                <FieldStack label="Karşılaştırma">
                  <div className="sel-wrap">
                    <select className="f-input" value={config.operator || 'gte'} onChange={event => onPatch({ operator: event.target.value })}>
                      {COMPARISON_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              )}
              <FieldStack label="Dönem">
                <div className="sel-wrap">
                  <select className="f-input" value={config.period || 'all_time'} onChange={event => onPatch({ period: event.target.value })}>
                    {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
              </FieldStack>
            </div>
            {(config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gün sayısı">
                <input className="f-input" type="number" min={1} value={formatNumberInputValue(config.periodDays, '30')} onChange={event => onPatch({ periodDays: event.target.value })} />
              </FieldStack>
            ) : null}
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
            {renderProductMasksEditor(config, onPatch)}
          </div>
        )
      }
      case 'period_sold_product_quantity':
      case 'order_item_quantity':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: conditionKey === 'order_item_quantity' ? '1fr 1fr' : '1fr 1fr 1fr', gap: 10 }}>
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
              {conditionKey !== 'order_item_quantity' ? (
                <FieldStack label="Donem">
                  <div className="sel-wrap">
                    <select className="f-input" value={config.period || 'all_time'} onChange={event => onPatch({ period: event.target.value })}>
                      {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                </FieldStack>
              ) : null}
            </div>
            {(conditionKey === 'period_product_quantity' || conditionKey === 'period_sold_product_quantity') && (config.period || 'all_time') === 'rolling_days' ? (
              <FieldStack label="Kayan gün sayısı">
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
            <div style={{ display: 'none', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              placeholder="Kupon / hediye kartı serisi seçin"
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
            placeholder="Kampanya seçin"
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
              placeholder="Kupon serisi seçin"
            />
          </div>
        )
      case 'days_since_first_activity':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr .8fr .9fr', gap: 10 }}>
            <FieldStack label="Referans olay">
              <div className="sel-wrap">
                <select className="f-input" value={config.eventType || 'signup'} onChange={event => onPatch({ eventType: event.target.value })}>
                  <option value="signup">Kayıt</option>
                  <option value="first_order">İlk sipariş</option>
                </select>
              </div>
            </FieldStack>
            <FieldStack label="Gün sayısı">
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
        return <HelperNote title="Manuel Tetikleme">Bu koşul kampanyanın personel tarafından elle başlatıldığı senaryolar içindir.</HelperNote>
      case 'customer_has_tag':
      case 'customer_lacks_tag':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Müşteri kategorileri">
              <SearchableMultiSelect
                options={activeCustomerCategories.map(category => ({
                  value: category.id,
                  label: category.name,
                  description: category.description || category.code || '',
                }))}
                selectedValues={config.tags || []}
                onChange={next => onPatch({ tags: next })}
                placeholder="Müşteri kategorisi seçin"
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
      case 'referred_customer':
        return (
          <div style={{ display: 'grid', gap: 14 }}>
            <FieldStack label="Referans Programı Seçimi" hint="Bu koşulun geçerli olacağı referans programlarını seçin. Boş bırakılırsa tüm referans programları kabul edilir.">
              <SearchableMultiSelect
                options={referralPrograms.map(prog => ({
                  value: prog.id,
                  label: prog.name,
                }))}
                selectedValues={config.program_ids || []}
                onChange={next => onPatch({ program_ids: next })}
                placeholder="Program seçin (Tümü için boş bırakın)"
              />
            </FieldStack>

            <FieldStack label="Tetikleyici Başarı Kriteri" hint="Kupon veya ödülün ne zaman verileceğini seçin.">
              <div className="sel-wrap">
                <select 
                  className="f-input" 
                  value={config.trigger || 'registration'} 
                  onChange={event => {
                    const val = event.target.value
                    onPatch({ 
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
                  onChange={event => onPatch({ purchase_count: Math.max(1, parseInt(event.target.value, 10) || 1) })} 
                />
              </FieldStack>
            )}
          </div>
        )
      case 'gave_referral':
        return (
          <div style={{ display: 'grid', gap: 14 }}>
            <FieldStack label="Referans Programı Seçimi" hint="Bu koşulun bağlı olacağı referans programını seçin.">
              <div className="sel-wrap">
                <select 
                  className="f-input" 
                  value={config.program_id || ''} 
                  onChange={event => onPatch({ program_id: event.target.value })}
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
                    onPatch({ 
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
                  onChange={event => onPatch({ threshold_count: Math.max(1, parseInt(event.target.value, 10) || 1) })} 
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
                  onPatch({ max_rewards_limit: val ? Math.max(1, parseInt(val, 10) || 1) : undefined })
                }}
                placeholder="Örn: 5 (Sınırsız için boş bırakın)"
              />
            </FieldStack>
          </div>
        )
      case 'sales_channel':
        return (
          <FieldStack label="Geçerli satış kanalları" hint="POS, Garson / Masa, kiosk, online veya mobil kanallarını seçin.">
            <SearchableMultiSelect
              options={salesChannels}
              selectedValues={getSalesChannelConditionValues(config)}
              onChange={next => onPatch({ channelValues: next })}
              placeholder="Satış kanalı seçin"
            />
          </FieldStack>
        )
      case 'last_visit_days':
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '.8fr .9fr', gap: 10 }}>
            <FieldStack label="Gün sayısı">
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

  function renderActionDetails(rule, scope, onPatchOverride = null, onChangeActionType = null) {
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
          <div style={{ fontSize: '.74rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Bu listede hediye edilecek veya onerilecek urunleri tanimlarsiniz.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map(item => {
              const isTemplate = item.type === 'sale_template' || item.type === 'mask' || item.type === 'template'
              const templateObj = isTemplate ? saleTemplates.find(st => String(st.id) === String(item.itemId)) : null
              const matchedProducts = templateObj
                ? (templateObj.saleIds || templateObj.sale_ids || []).map(id => saleItems.find(p => String(p.id) === String(id))).filter(Boolean)
                : []
              const selectedValue = item.itemId ? `${item.type || 'product'}:${item.itemId}` : ''

              return (
                <div key={item.id} style={{ display: 'grid', gap: 4, padding: 8, border: '1px solid #f1f5f9', borderRadius: 12, background: '#fafbfc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 100px auto', gap: 8, alignItems: 'end' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 6 }}>Ürün / kategori / şablon</div>
                      {renderMaskSelect(selectedValue, rawValue => {
                        const parsed = parseCatalogSelection(rawValue, maskCatalogMap)
                        patchOfferItem(item.id, parsed)
                      })}
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Adet</div>
                      <input
                        className="f-input"
                        type="number"
                        min={1}
                        value={item.qty || 1}
                        onChange={event => {
                          const val = Math.max(1, parseInt(event.target.value, 10) || 1)
                          patchOfferItem(item.id, { qty: val })
                        }}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <button className="btn-danger" type="button" onClick={() => onPatch(current => ({ ...current, items: (current.items || []).filter(entry => entry.id !== item.id) }))}>
                      Sil
                    </button>
                  </div>
                  {matchedProducts.length > 0 && (
                    <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', padding: '6px 12px', borderRadius: 10, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800 }}>Şablon İçeriği:</span>
                      {matchedProducts.map(p => (
                        <span key={p.id} style={{ background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 6, fontSize: '.68rem' }}>
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-o" type="button" onClick={() => onPatch(current => ({ ...current, items: [...(current.items || []), createOfferItem()] }))}>
                + Oge Ekle
              </button>
              <button className="btn-o" type="button" style={{ color: '#7c3aed', borderColor: '#ddd6fe', background: '#f5f3ff' }} onClick={() => setShowNewTemplateModal(true)}>
                <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Yeni Şablon Oluştur
              </button>
            </div>
          </div>
          {rule.actionType === 'free_products' ? (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                <input type="checkbox" checked={config.freeOptions !== false} onChange={event => onPatch({ freeOptions: event.target.checked })} />
                Seçenekleri de hediye et
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                <input type="checkbox" checked={config.freeSizes !== false} onChange={event => onPatch({ freeSizes: event.target.checked })} />
                Boyutları de hediye et
              </label>
            </div>
          ) : (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.applyToPricedOptions)} onChange={event => onPatch({ applyToPricedOptions: event.target.checked })} />
              Fiyatli opsiyonlara uygula
            </label>
          )}
        </div>
      )
    }

    function renderPricingEditor() {
      const items = Array.isArray(config.items) ? config.items : []
      return (
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ fontSize: '.74rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Hedefi Ürün, Şablon veya Kategori olarak seçip indirimi şablona göre tüm ürünlere, en ucuz ürüne veya en pahalı ürüne uygulayabilirsiniz.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr 0.7fr auto', gap: 8, fontSize: '.72rem', color: '#64748b', fontWeight: 800, paddingInline: 8 }}>
                <div>Urun / kategori / sablon</div>
                <div>Uygula</div>
                <div>Tur</div>
                <div>Deger</div>
                <div />
              </div>
            ) : null}
            {items.map(item => {
              const isTemplate = item.maskType === 'sale_template' || item.maskType === 'mask' || item.maskType === 'template'
              const templateObj = isTemplate ? saleTemplates.find(st => String(st.id) === String(item.itemId)) : null
              const matchedProducts = templateObj
                ? (templateObj.saleIds || templateObj.sale_ids || []).map(id => saleItems.find(p => String(p.id) === String(id))).filter(Boolean)
                : []
              const isSingleProduct = item.maskType === 'product'
              const selectedValue = item.itemId ? `${item.maskType || 'product'}:${item.itemId}` : ''

              return (
                <div key={item.id} style={{ display: 'grid', gap: 4, padding: 8, border: '1px solid #f1f5f9', borderRadius: 12, background: '#fafbfc' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.2fr 1fr 0.7fr auto', gap: 8, alignItems: 'end' }}>
                    {renderMaskSelect(selectedValue, rawValue => {
                      const parsed = parseCatalogSelection(rawValue, maskCatalogMap)
                      onPatch(current => ({
                        ...current,
                        items: (current.items || []).map(entry => entry.id === item.id ? {
                          ...entry,
                          itemId: parsed.itemId,
                          name: parsed.name,
                          maskType: parsed.type,
                          applyTo: parsed.type === 'product' ? 'all_matches' : entry.applyTo
                        } : entry),
                      }))
                    })}
                    <div className="sel-wrap">
                      <select
                        className="f-input"
                        value={item.applyTo}
                        disabled={isSingleProduct}
                        onChange={event => onPatch(current => ({
                          ...current,
                          items: (current.items || []).map(entry => entry.id === item.id ? { ...entry, applyTo: event.target.value } : entry),
                        }))}
                      >
                        {PRICING_APPLY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                    <div className="sel-wrap">
                      <select
                        className="f-input"
                        value={item.pricingType}
                        onChange={event => onPatch(current => ({
                          ...current,
                          items: (current.items || []).map(entry => entry.id === item.id ? { ...entry, pricingType: event.target.value } : entry),
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
                      onChange={event => onPatch(current => ({
                        ...current,
                        items: (current.items || []).map(entry => entry.id === item.id ? { ...entry, value: event.target.value } : entry),
                      }))}
                      placeholder={item.pricingType === 'none' ? '-' : 'Deger'}
                      disabled={item.pricingType === 'none'}
                    />
                    <button
                      className="btn-danger"
                      type="button"
                      onClick={() => onPatch(current => ({
                        ...current,
                        items: (current.items || []).filter(entry => entry.id !== item.id),
                      }))}
                    >
                      Sil
                    </button>
                  </div>
                  {matchedProducts.length > 0 && (
                    <div style={{ fontSize: '.74rem', color: '#64748b', background: '#f8fafc', padding: '6px 12px', borderRadius: 10, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800 }}>Şablon İçeriği:</span>
                      {matchedProducts.map(p => (
                        <span key={p.id} style={{ background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 6, fontSize: '.68rem' }}>
                          {p.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn-o"
                type="button"
                onClick={() => onPatch(current => ({
                  ...current,
                  items: [...(current.items || []), createPricingItem()],
                }))}
              >
                + Fiyat Kurali Ekle
              </button>
              <button className="btn-o" type="button" style={{ color: '#7c3aed', borderColor: '#ddd6fe', background: '#f5f3ff' }} onClick={() => setShowNewTemplateModal(true)}>
                <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Yeni Şablon Oluştur
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
        return renderOfferItemsEditor()
      case 'product_pricing':
        return renderPricingEditor()
      case 'combo_bundle':
        return renderComboEditor()

      case 'write_customer_note':
        return (
          <div style={{ display: 'grid', gap: 12 }}>
            <FieldStack label="Müşteri adisyonuna, paket servise sipariş formuna yazılacak not">
              <textarea 
                className="f-input" 
                rows={3} 
                value={config.customerTemplate || ''} 
                onChange={event => onPatch({ customerTemplate: event.target.value, anonymousTemplate: event.target.value })} 
                placeholder="Örn. VIP müşteri indirimi uygulandı."
              />
            </FieldStack>

            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>Değişkenler (Tıklayarak ekleyin):</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  className="btn-o btn-xs" 
                  style={{ borderRadius: 16, padding: '4px 10px', fontSize: '0.78rem', border: '1px solid #c084fc', color: '#a855f7', background: 'rgba(168,85,247,0.04)', cursor: 'pointer' }}
                  onClick={() => {
                    const val = config.customerTemplate || '';
                    const newVal = val ? val + ' {{loyalty_points}}' : '{{loyalty_points}}';
                    onPatch({ customerTemplate: newVal, anonymousTemplate: newVal });
                  }}
                >
                  ✨ Sadakat Puanı ({{loyalty_points}})
                </button>
                <button 
                  type="button" 
                  className="btn-o btn-xs" 
                  style={{ borderRadius: 16, padding: '4px 10px', fontSize: '0.78rem', border: '1px solid #60a5fa', color: '#3b82f6', background: 'rgba(59,130,246,0.04)', cursor: 'pointer' }}
                  onClick={() => {
                    const val = config.customerTemplate || '';
                    const newVal = val ? val + ' {{active_campaigns}}' : '{{active_campaigns}}';
                    onPatch({ customerTemplate: newVal, anonymousTemplate: newVal });
                  }}
                >
                  🎁 Aktif Kampanyaları ({{active_campaigns}})
                </button>
                <button 
                  type="button" 
                  className="btn-o btn-xs" 
                  style={{ borderRadius: 16, padding: '4px 10px', fontSize: '0.78rem', border: '1px solid #34d399', color: '#10b981', background: 'rgba(16,185,129,0.04)', cursor: 'pointer' }}
                  onClick={() => {
                    const val = config.customerTemplate || '';
                    const newVal = val ? val + ' {{customer_category}}' : '{{customer_category}}';
                    onPatch({ customerTemplate: newVal, anonymousTemplate: newVal });
                  }}
                >
                  🏷️ Müşteri Kategorisi ({{customer_category}})
                </button>
              </div>
            </div>

            <div style={{ padding: 12, background: 'rgba(15,23,42,0.02)', border: '1px dashed #cbd5e1', borderRadius: 8 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>Hazır Şablon Cümleler:</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {[
                  "Sonraki siparişinizde kullanabileceğiniz {{loyalty_points}} puanınız bulunmaktadır, afiyet olsun.",
                  "Kullanımınız için {{active_campaigns}} kampanyaları bulunmaktadır.",
                  "Müşteri Kategorisi: {{customer_category}}"
                ].map((sentence, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      padding: '8px 12px', 
                      background: '#ffffff', 
                      border: '1px solid #e5e7eb', 
                      borderRadius: 6, 
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      color: '#4b5563',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                    onClick={() => onPatch({ customerTemplate: sentence, anonymousTemplate: sentence })}
                  >
                    <span>{sentence}</span>
                    <span style={{ fontSize: '0.7rem', color: '#6366f1', fontWeight: 600 }}>[Seç]</span>
                  </div>
                ))}
              </div>
            </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
              <FieldStack label="İşlem tipi">
                <div style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  width: '100%',
                }}>
                  <button
                    type="button"
                    onClick={() => onChangeActionType && onChangeActionType('add_customer_tag')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: rule.actionType === 'add_customer_tag' ? '#ffffff' : 'transparent',
                      color: rule.actionType === 'add_customer_tag' ? '#0f172a' : '#64748b',
                      fontWeight: rule.actionType === 'add_customer_tag' ? 700 : 500,
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: rule.actionType === 'add_customer_tag' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Kategoriye Ekle
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeActionType && onChangeActionType('remove_customer_tag')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: rule.actionType === 'remove_customer_tag' ? '#ffffff' : 'transparent',
                      color: rule.actionType === 'remove_customer_tag' ? '#0f172a' : '#64748b',
                      fontWeight: rule.actionType === 'remove_customer_tag' ? 700 : 500,
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: rule.actionType === 'remove_customer_tag' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Kategoriden Çıkar
                  </button>
                </div>
              </FieldStack>
              <FieldStack label="Kategori">
                <div className="sel-wrap">
                  <select className="f-input" value={config.category || ''} onChange={event => onPatch({ category: event.target.value })}>
                    <option value="">Kategori seçin</option>
                    {activeCustomerCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
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
            <FieldStack label="Toplam sipariş indirim yüzdesi">
              <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
            </FieldStack>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
              <input type="checkbox" checked={Boolean(config.includeAlreadyDiscounted)} onChange={event => onPatch({ includeAlreadyDiscounted: event.target.checked })} />
              Diger kampanyalara katilan urunlere uygula
            </label>
          </div>
        )
      case 'order_extra_charge':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Hesaplama Türü">
              <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => onPatch({ valueType: 'amount' })}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: (config.valueType || 'amount') === 'amount' ? '#fff' : 'transparent',
                    color: (config.valueType || 'amount') === 'amount' ? '#0f172a' : '#64748b',
                    fontWeight: (config.valueType || 'amount') === 'amount' ? 700 : 500,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: (config.valueType || 'amount') === 'amount' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Tutar (TL)
                </button>
                <button
                  type="button"
                  onClick={() => onPatch({ valueType: 'percent' })}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: config.valueType === 'percent' ? '#fff' : 'transparent',
                    color: config.valueType === 'percent' ? '#0f172a' : '#64748b',
                    fontWeight: config.valueType === 'percent' ? 700 : 500,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: config.valueType === 'percent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Yüzde (%)
                </button>
              </div>
            </FieldStack>
            {(config.valueType || 'amount') === 'amount' ? (
              <FieldStack label="Tutar">
                <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.amount)} onChange={event => onPatch({ amount: event.target.value })} />
              </FieldStack>
            ) : (
              <FieldStack label="Yüzde">
                <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
              </FieldStack>
            )}
          </div>
        )
      case 'order_discount':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <FieldStack label="Hesaplama Türü">
              <div style={{ display: 'flex', background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => onPatch({ valueType: 'amount' })}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: (config.valueType || 'amount') === 'amount' ? '#fff' : 'transparent',
                    color: (config.valueType || 'amount') === 'amount' ? '#0f172a' : '#64748b',
                    fontWeight: (config.valueType || 'amount') === 'amount' ? 700 : 500,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: (config.valueType || 'amount') === 'amount' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Tutar (TL)
                </button>
                <button
                  type="button"
                  onClick={() => onPatch({ valueType: 'percent' })}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: config.valueType === 'percent' ? '#fff' : 'transparent',
                    color: config.valueType === 'percent' ? '#0f172a' : '#64748b',
                    fontWeight: config.valueType === 'percent' ? 700 : 500,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: config.valueType === 'percent' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  Yüzde (%)
                </button>
              </div>
            </FieldStack>
            {(config.valueType || 'amount') === 'amount' ? (
              <FieldStack label="Tutar">
                <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.amount)} onChange={event => onPatch({ amount: event.target.value })} />
              </FieldStack>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <FieldStack label="Yüzde">
                  <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
                </FieldStack>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={Boolean(config.includeAlreadyDiscounted)} onChange={event => onPatch({ includeAlreadyDiscounted: event.target.checked })} />
                  Diger kampanyalara katilan urunlere uygula
                </label>
              </div>
            )}
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
      case 'points_percent_of_order':
      case 'bonus_points':
        return (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
              <FieldStack label="Puan yükleme şekli">
                <div style={{
                  display: 'flex',
                  background: '#f1f5f9',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  width: '100%',
                }}>
                  <button
                    type="button"
                    onClick={() => onChangeActionType && onChangeActionType('bonus_points')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: rule.actionType === 'bonus_points' ? '#ffffff' : 'transparent',
                      color: rule.actionType === 'bonus_points' ? '#0f172a' : '#64748b',
                      fontWeight: rule.actionType === 'bonus_points' ? 700 : 500,
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: rule.actionType === 'bonus_points' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Sabit Puan
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeActionType && onChangeActionType('points_percent_of_order')}
                    style={{
                      flex: 1,
                      border: 'none',
                      background: rule.actionType === 'points_percent_of_order' ? '#ffffff' : 'transparent',
                      color: rule.actionType === 'points_percent_of_order' ? '#0f172a' : '#64748b',
                      fontWeight: rule.actionType === 'points_percent_of_order' ? 700 : 500,
                      fontSize: '12px',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: rule.actionType === 'points_percent_of_order' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Yüzde Oranı (%)
                  </button>
                </div>
              </FieldStack>
              {rule.actionType === 'bonus_points' ? (
                <FieldStack label="Yüklenecek puan">
                  <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.points)} onChange={event => onPatch({ points: event.target.value })} />
                </FieldStack>
              ) : (
                <FieldStack label="Puan oranı (%)">
                  <input className="f-input" type="number" min={0} step="0.01" value={formatNumberInputValue(config.percent)} onChange={event => onPatch({ percent: event.target.value })} />
                </FieldStack>
              )}
            </div>
          </div>
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
                label: series.name + (series.metadata?.onDemandGenerationOnly ? ' (Dinamik / On-Demand)' : ''),
                description: (series.prefix || '') + (series.metadata?.onDemandGenerationOnly ? ' - Kodlar anlık üretilir' : ' - Hazır kod havuzu'),
                disabled: Boolean(config.anySeries),
              }))}
              selectedValues={config.seriesIds || []}
              onChange={next => onPatch({ seriesIds: next })}
              placeholder="Kupon serisi seçin"
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

        </div>



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

  const recConditions = RECOMMENDED_CONDITIONS[selectedGoal] || []
  const recConditionChoices = SIMPLE_CONDITION_CHOICES.filter(choice => recConditions.includes(choice.value))
  const otherConditionChoices = SIMPLE_CONDITION_CHOICES.filter(choice => !recConditions.includes(choice.value))

  const recActions = RECOMMENDED_ACTIONS[selectedGoal] || []
  const recActionChoices = SIMPLE_ACTION_CHOICES.filter(choice => recActions.includes(choice.value))
  const otherActionChoices = SIMPLE_ACTION_CHOICES.filter(choice => !recActions.includes(choice.value))

  const conditionCardStyle = (active) => ({
    textAlign: 'left',
    border: `1px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
    background: active ? '#eff6ff' : '#fff',
    borderRadius: 12,
    padding: 14,
    cursor: 'pointer',
    display: 'grid',
    gap: 8,
    transition: 'all 0.2s',
  })

  const actionCardStyle = (active) => ({
    textAlign: 'left',
    border: `1px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
    background: active ? '#fffbeb' : '#fff',
    borderRadius: 12,
    padding: 14,
    cursor: 'pointer',
    display: 'grid',
    gap: 8,
    transition: 'all 0.2s',
  })

  const reviewRuntimeCampaign = useMemo(
    () => serializeCampaignForPersistence(wizardCampaign, program.id),
    [program.id, wizardCampaign],
  )
  const campaignImageLibrary = useMemo(
    () => normalizeCampaignImageLibrary(wizardCampaign.metadata || {}),
    [wizardCampaign.metadata],
  )
  const campaignImages = campaignImageLibrary.images
  const primaryCampaignImage = campaignImageLibrary.primaryImage
  const campaignImageUrl = useMemo(() => {
    if (primaryCampaignImage?.url) return resolveImageUrl(primaryCampaignImage.url)
    if (campaignImages && campaignImages.length > 0) {
      const firstImg = campaignImages[0]?.url
      if (firstImg) return resolveImageUrl(firstImg)
    }
    const meta = wizardCampaign.metadata || {}
    for (const slot of IMAGE_SLOTS) {
      if (meta[slot.key]?.url) {
        return resolveImageUrl(meta[slot.key].url)
      }
    }
    return ''
  }, [primaryCampaignImage, campaignImages, wizardCampaign.metadata])

  const getHeader = () => {
    if (activeMode === 'view') {
      return (
        <Header
          title={wizardCampaign.name || 'Kampanya Detayı'}
          subtitle={`Kampanya Kodu: ${wizardCampaign.code || '-'}`}
          actions={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" onClick={() => navigate('/sadakat')}>
                <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
                Listeye Dön
              </button>
              <button className="btn-p" type="button" onClick={() => navigate(`/sadakat/kampanya/${wizardCampaign.id}/duzenle`)}>
                <i className="fa-solid fa-pen-to-square" style={{ marginRight: 6 }} />
                Düzenle
              </button>
            </div>
          )}
        />
      )
    }
    if (activeMode === 'edit') {
      return (
        <Header
          title={wizardCampaign.name ? `Kampanyayı Düzenle: ${wizardCampaign.name}` : 'Kampanyayı Düzenle'}
          subtitle="Kampanya parametrelerini ve kurallarını tek bir sayfada güncelleyin."
          actions={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" onClick={() => navigate(`/sadakat/kampanya/${wizardCampaign.id}/gor`)}>
                İptal
              </button>
              <button className="btn-p" type="button" onClick={handleSave} disabled={saving || loading || databaseUnavailable || !schemaReady}>
                {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          )}
        />
      )
    }
    return (
      <Header
        title="Akıllı Kampanya Wizard"
        subtitle="Yeni kampanya açılış akışını wizard üzerine taşıyıp kural motorunu mevcut sadakat modeliyle birebir yönetin."
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-o" type="button" onClick={() => navigate('/sadakat')}>
              <i className="fa-solid fa-arrow-left" style={{ marginRight: 6 }} />
              Listeye Dön
            </button>
            <button className="btn-o" type="button" onClick={() => navigate('/sadakat/kategoriler')}>
              <i className="fa-solid fa-tags" style={{ marginRight: 6 }} />
              Müşteri Kategorileri
            </button>
          </div>
        )}
      />
    )
  }

  function renderViewMode() {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        {/* Section 2: Hedef / Goal */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Kampanya Hedefi</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `${goalPreset.color || '#2563eb'}12`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: goalPreset.color || '#2563eb',
              fontSize: '1.1rem',
            }}>
              <i className={goalPreset.icon} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#0f172a' }}>{goalPreset.title}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 2 }}>{goalPreset.description}</div>
            </div>
          </div>
        </div>

        {/* Section 3: Kapsam / Scope */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Kampanya Kapsamı</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Hedef Kitle</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {wizardCampaign.audienceType === 'all' ? 'Tüm Müşteriler' : 'Seçili Kategoriler'}
              </div>
              {wizardCampaign.audienceType !== 'all' && (
                <div style={{ marginTop: 6, fontSize: '.78rem', color: '#64748b' }}>
                  {formatCompactList((wizardCampaign.audienceCategoryIds || []).map(id => customerCategories.find(c => String(c.id) === String(id))?.name || id))}
                </div>
              )}
            </div>

            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Satış Kanalları</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {!wizardCampaign.channelTargets || wizardCampaign.channelTargets.length === 0 ? 'Tüm Kanallar' : 'Seçili Kanallar'}
              </div>
              {wizardCampaign.channelTargets && wizardCampaign.channelTargets.length > 0 && (
                <div style={{ marginTop: 6, fontSize: '.78rem', color: '#64748b' }}>
                  {formatCompactList((wizardCampaign.channelTargets || []).map(val => getOptionLabel(CAMPAIGN_CHANNEL_OPTIONS, val, val)))}
                </div>
              )}
            </div>

            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Şubeler</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {!wizardCampaign.metadata?.branchSelections || wizardCampaign.metadata.branchSelections.length === 0 ? 'Tüm Şubeler' : 'Seçili Şubeler'}
              </div>
              {wizardCampaign.metadata?.branchSelections && wizardCampaign.metadata.branchSelections.length > 0 && (
                <div style={{ marginTop: 6, fontSize: '.78rem', color: '#64748b' }}>
                  {formatCompactList((wizardCampaign.metadata.branchSelections || []).map(x => x.name))}
                </div>
              )}
            </div>

            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Geçerlilik</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {!wizardCampaign.startsAt && !wizardCampaign.endsAt ? 'Süresiz' : 'Belirli Tarih Aralığı'}
              </div>
              {(wizardCampaign.startsAt || wizardCampaign.endsAt) && (
                <div style={{ marginTop: 6, fontSize: '.76rem', color: '#64748b', display: 'grid', gap: 2 }}>
                  {wizardCampaign.startsAt ? <div>Başlangıç: {formatSummaryDate(wizardCampaign.startsAt)}</div> : null}
                  {wizardCampaign.endsAt ? <div>Bitiş: {formatSummaryDate(wizardCampaign.endsAt)}</div> : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Rules / Koşullar & Eylemler */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', marginBottom: 10 }}>
            <button
              type="button"
              className={ruleScopeTab === 'applicable' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setRuleScopeTab('applicable')}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                borderBottom: ruleScopeTab === 'applicable' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                color: ruleScopeTab === 'applicable' ? '#2563eb' : '#64748b',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Sipariş Kuralları ({(wizardCampaign.applicableRules || []).length})
            </button>
            <button
              type="button"
              className={ruleScopeTab === 'periodic' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setRuleScopeTab('periodic')}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                borderBottom: ruleScopeTab === 'periodic' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                color: ruleScopeTab === 'periodic' ? '#2563eb' : '#64748b',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Periyodik Kurallar ({(wizardCampaign.periodicRules || []).length})
            </button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {renderRuleSummaryList(visibleRules, 'Kural bulunmamaktadır.')}
          </div>
        </div>

        {/* Section 5: Operasyon */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Operasyon ve Çakışma Kuralları</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Tetikleme Şekli</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {getOptionLabel(CAMPAIGN_APPLICATION_MODE_OPTIONS, wizardCampaign.applicationMode)}
              </div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 4 }}>
                {getCampaignApplicationModeHint(wizardCampaign.applicationMode)}
              </div>
            </div>

            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Öncelik Seviyesi</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {wizardCampaign.priority}
              </div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 4 }}>
                Daha küçük sayılar çakışma anında kazanır.
              </div>
            </div>

            <div style={{ border: '1px solid #f1f5f9', padding: 12, borderRadius: 12 }}>
              <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 4 }}>Çakışma / Birleşme Modu</div>
              <div style={{ fontSize: '.86rem', color: '#0f172a', fontWeight: 700 }}>
                {getOptionLabel(STACKING_RULE_OPTIONS, mergeMode, mergeMode)}
              </div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 4 }}>
                {mergeMode === 'group' && selectedConflictGroup
                  ? `Seçili Grup: ${selectedConflictGroup.name}`
                  : mergeMode === 'stackable'
                    ? 'Diğer aktif kampanyalarla birleşebilir.'
                    : 'Tek başına uygulanır (Münhasır).'}
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Campaign Identity */}
        <div className="card" style={{ padding: 20, display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 20 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontWeight: 900, color: '#0f172a', fontSize: '1.5rem' }}>{wizardCampaign.name || 'Yeni Kampanya'}</h2>
                <MiniBadge active={wizardCampaign.active !== false} trueLabel="Aktif" falseLabel="Pasif" />
              </div>
              <div style={{ fontSize: '.84rem', color: '#64748b', fontWeight: 700 }}>
                Kod: <span style={{ color: '#0f172a' }}>{wizardCampaign.code || '-'}</span>
              </div>
              {wizardCampaign.description ? (
                <div style={{ fontSize: '.9rem', color: '#334155', lineHeight: 1.6, background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                  {wizardCampaign.description}
                </div>
              ) : (
                <div style={{ fontSize: '.9rem', color: '#94a3b8', fontStyle: 'italic' }}>Açıklama girilmemiş.</div>
              )}
              <div style={{ border: '1px solid #dbeafe', borderRadius: 12, padding: 12, background: '#f8fbff', marginTop: 10 }}>
                <div style={{ fontWeight: 800, color: '#1e3a8a', marginBottom: 6 }}>Özet Tanım</div>
                <div style={{ fontSize: '.82rem', color: '#334155', lineHeight: 1.6 }}>
                  {getCampaignSummaryText(wizardCampaign, selectedGoal, customerCategories, salesChannels, summaryContext)}
                </div>
              </div>
            </div>
            
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>Öne Çıkan Görsel</div>
              <div style={{ aspectRatio: '16 / 9', border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {campaignImageUrl ? (
                  <img src={campaignImageUrl} alt={wizardCampaign.name || 'Kampanya görseli'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:6px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.6rem;color:#cbd5e1"></i><span style="font-size:.72rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '.82rem' }}>Görsel Yok</div>
                )}
              </div>
            </div>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid #f1f5f9', margin: '10px 0' }} />

          {/* Dedicated Channels Grid */}
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-rectangle-ad" style={{ color: '#2563eb' }}></i>
              Mecra Bazlı Kampanya Görselleri
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {IMAGE_SLOTS.map(slot => {
                const meta = wizardCampaign.metadata || {}
                const slotImg = meta[slot.key]
                const hasImg = slotImg && slotImg.url
                return (
                  <div key={slot.key} style={{ 
                    border: '1px solid #e2e8f0', 
                    borderRadius: 12, 
                    padding: 10, 
                    background: '#fff', 
                    display: 'grid', 
                    gap: 8, 
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '.78rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={slot.label}>
                        {slot.label}
                      </div>
                      <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>Öneri: {slot.recommended}</div>
                    </div>
                    
                    <div style={{ 
                      aspectRatio: '16 / 10', 
                      borderRadius: 8, 
                      overflow: 'hidden', 
                      border: hasImg ? '1px solid #e2e8f0' : '1px dashed #cbd5e1', 
                      background: '#f8fafc',
                      display: 'grid',
                      placeItems: 'center',
                      position: 'relative'
                    }}>
                      {hasImg ? (
                        <a href={resolveImageUrl(slotImg.url)} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
                          <img src={resolveImageUrl(slotImg.url)} alt={slot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:4px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.4rem;color:#cbd5e1"></i><span style="font-size:.65rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                        </a>
                      ) : (
                        <span style={{ fontSize: '.7rem', color: '#94a3b8', fontWeight: 600 }}>Tanımlanmamış</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid #f1f5f9', margin: '10px 0' }} />

          {/* General Image Archive */}
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-images" style={{ color: '#2563eb' }}></i>
              Görsel Arşivi ({campaignImages.length})
            </div>
            {campaignImages.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>
                {campaignImages.map(img => (
                  <div key={img.id} style={{ 
                    border: `1px solid ${img.isPrimary ? '#2563eb' : '#e2e8f0'}`, 
                    borderRadius: 10, 
                    overflow: 'hidden', 
                    background: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    display: 'grid'
                  }}>
                    <a href={resolveImageUrl(img.url)} target="_blank" rel="noopener noreferrer" style={{ aspectRatio: '16 / 9', overflow: 'hidden', display: 'block' }}>
                      <img src={resolveImageUrl(img.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:4px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.2rem;color:#cbd5e1"></i><span style="font-size:.6rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                    </a>
                    {img.isPrimary && (
                      <div style={{ background: '#2563eb', color: '#fff', fontSize: '.6rem', textAlign: 'center', padding: '2px 0', fontWeight: 800 }}>
                        Öne Çıkan
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '.82rem', color: '#94a3b8', fontStyle: 'italic' }}>Arşivde henüz görsel bulunmuyor.</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderEditMode() {
    return (
      <div style={{ display: 'grid', gap: 18 }}>
        {/* Section 2: Hedef / Goal */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Kampanya Hedefi</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {GOAL_PRESETS.map(goal => {
              const active = selectedGoal === goal.value
              return (
                <button
                  key={goal.value}
                  type="button"
                  onClick={() => applyGoalPreset(goal.value)}
                  style={{
                    border: active ? `2px solid ${goal.color}` : '1px solid #e2e8f0',
                    background: active ? goal.bgGradient : '#fff',
                    color: '#0f172a',
                    borderRadius: 12,
                    padding: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={goal.icon} style={{ color: goal.color }} />
                    <span style={{ fontWeight: 800, fontSize: '.88rem' }}>{goal.title}</span>
                  </div>
                  <span style={{ fontSize: '.76rem', color: '#64748b' }}>{goal.description}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Section 3: Kapsam / Scope */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 16 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Kampanya Kapsamı</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {/* Hedef Kitle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.86rem' }}>1. Hedef Kitle</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => updateCampaign({ audienceType: 'all', audienceCategoryIds: [] })}
                  style={campaignButtonStyle(wizardCampaign.audienceType === 'all', '#2563eb')}
                >
                  Tüm Müşteriler
                </button>
                <button
                  type="button"
                  onClick={() => updateCampaign({ audienceType: 'tagged_customers' })}
                  style={campaignButtonStyle(wizardCampaign.audienceType === 'tagged_customers', '#2563eb')}
                >
                  Kategori Seç
                </button>
              </div>
              {wizardCampaign.audienceType === 'tagged_customers' && (
                <div style={{ marginTop: 8 }}>
                  <SearchableMultiSelect
                    options={activeCustomerCategories.map(category => ({
                      value: category.id,
                      label: category.name,
                      description: category.description || category.code || '',
                    }))}
                    selectedValues={wizardCampaign.audienceCategoryIds || []}
                    onChange={next => updateCampaign({ audienceCategoryIds: next })}
                    placeholder="Kategori seçin"
                    allowSelectAll
                  />
                </div>
              )}
            </div>

            {/* Satış Kanalları */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.86rem' }}>2. Satış Kanalları</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => updateCampaign({ channelTargets: [] })}
                  style={campaignButtonStyle(!wizardCampaign.channelTargets || wizardCampaign.channelTargets.length === 0, '#0284c7')}
                >
                  Tüm Kanallar
                </button>
                <button
                  type="button"
                  onClick={() => updateCampaign({ channelTargets: [salesChannels[0]?.value].filter(Boolean) })}
                  style={campaignButtonStyle(wizardCampaign.channelTargets && wizardCampaign.channelTargets.length > 0, '#0284c7')}
                >
                  Seçili Kanallar
                </button>
              </div>
              {wizardCampaign.channelTargets && wizardCampaign.channelTargets.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <SearchableMultiSelect
                    options={campaignChannelOptions}
                    selectedValues={wizardCampaign.channelTargets || []}
                    onChange={next => updateCampaign({ channelTargets: next })}
                    placeholder="Satış kanalı seçin"
                  />
                </div>
              )}
            </div>

            {/* Şubeler */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.86rem' }}>3. Şubeler</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => updateCampaign({ metadata: { ...wizardCampaign.metadata, branchSelections: [] } })}
                  style={campaignButtonStyle(!wizardCampaign.metadata?.branchSelections || wizardCampaign.metadata.branchSelections.length === 0, '#7c3aed')}
                >
                  Tüm Şubeler
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const defaultSelection = branchTemplates[0]
                      ? [{ id: String(branchTemplates[0].id), type: 'template', name: branchTemplates[0].name, branchIds: (branchTemplates[0].branch_ids || []).map(String) }]
                      : (branches[0] ? [{ id: String(branches[0].id), type: 'branch', name: branches[0].name }] : [])
                    updateCampaign({ metadata: { ...wizardCampaign.metadata, branchSelections: defaultSelection } })
                  }}
                  style={campaignButtonStyle(wizardCampaign.metadata?.branchSelections && wizardCampaign.metadata.branchSelections.length > 0, '#7c3aed')}
                >
                  Şube Seç
                </button>
              </div>
              {wizardCampaign.metadata?.branchSelections && wizardCampaign.metadata.branchSelections.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <SearchableMultiSelect
                    options={[
                      ...(branchTemplates || []).map(t => ({
                        value: `template:${t.id}`,
                        label: t.name,
                        description: `${(t.branch_ids || []).length} şube içerir`
                      })),
                      ...(branches || []).map(b => ({
                        value: `branch:${b.id}`,
                        label: b.name,
                        description: 'Bireysel Şube'
                      }))
                    ]}
                    selectedValues={(wizardCampaign.metadata.branchSelections || []).map(x => `${x.type}:${x.id}`)}
                    onChange={next => {
                      const sanitized = sanitizeWizardBranchSelections(next)
                      updateCampaign({ metadata: { ...wizardCampaign.metadata, branchSelections: sanitized } })
                    }}
                    placeholder="Şube/Şablon seçin"
                  />
                </div>
              )}
            </div>

            {/* Tarih Aralığı */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 12, borderRadius: 12, background: '#fafafb' }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.86rem' }}>4. Geçerlilik Süresi</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => updateCampaign({ startsAt: null, endsAt: null })}
                  style={campaignButtonStyle(!wizardCampaign.startsAt && !wizardCampaign.endsAt, '#ea580c')}
                >
                  Süresiz
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date()
                    const oneMonthLater = new Date()
                    oneMonthLater.setMonth(now.getMonth() + 1)
                    updateCampaign({ startsAt: now.toISOString(), endsAt: oneMonthLater.toISOString() })
                  }}
                  style={campaignButtonStyle(wizardCampaign.startsAt || wizardCampaign.endsAt, '#ea580c')}
                >
                  Tarih Seç
                </button>
              </div>
              {(wizardCampaign.startsAt || wizardCampaign.endsAt) && (
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <FieldStack label="Başlangıç">
                    <input className="f-input" type="datetime-local" value={formatDateTimeInput(wizardCampaign.startsAt)} onChange={event => updateCampaign({ startsAt: event.target.value })} />
                  </FieldStack>
                  <FieldStack label="Bitiş">
                    <input className="f-input" type="datetime-local" value={formatDateTimeInput(wizardCampaign.endsAt)} onChange={event => updateCampaign({ endsAt: event.target.value })} />
                  </FieldStack>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Rules / Koşullar & Eylemler */}
        <div className="card" style={{ padding: 20, display: 'grid', gap: 20 }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #cbd5e1', marginBottom: 10 }}>
            <button
              type="button"
              className={ruleScopeTab === 'applicable' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setRuleScopeTab('applicable')}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                borderBottom: ruleScopeTab === 'applicable' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                color: ruleScopeTab === 'applicable' ? '#2563eb' : '#64748b',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Sipariş Kuralları ({(wizardCampaign.applicableRules || []).length})
            </button>
            <button
              type="button"
              className={ruleScopeTab === 'periodic' ? 'tab-btn active' : 'tab-btn'}
              onClick={() => setRuleScopeTab('periodic')}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: 'none',
                borderBottom: ruleScopeTab === 'periodic' ? '2.5px solid #2563eb' : '2.5px solid transparent',
                color: ruleScopeTab === 'periodic' ? '#2563eb' : '#64748b',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Periyodik Kurallar ({(wizardCampaign.periodicRules || []).length})
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-p" onClick={() => addRule(ruleScopeTab)}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Yeni Kural Bloğu Ekle
            </button>
          </div>

          <div className="wizard-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, position: 'relative' }}>
            <div className="vertical-split-divider" style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: '2px',
              background: 'linear-gradient(to bottom, #fecaca, #ef4444, #fecaca)',
              transform: 'translateX(-50%)',
              zIndex: 10
            }} />

            {/* Left: Conditions */}
            <div className="wizard-split-col" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 16, background: '#dbeeff', borderRadius: 14, padding: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', fontSize: '.75rem', fontWeight: 900 }}>1</span>
                  Koşul Kütüphanesi
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {recConditionChoices.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}>Önerilenler:</span>
                    {recConditionChoices.map(choice => {
                      const active = selectedLibCondition === choice.value
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() => setSelectedLibCondition(choice.value)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 16,
                            fontSize: '.74rem',
                            fontWeight: 800,
                            border: `1.5px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                            background: active ? '#eff6ff' : '#f8fafc',
                            color: active ? '#1d4ed8' : '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <i className="fa-solid fa-star" style={{ color: active ? '#3b82f6' : '#94a3b8', fontSize: '.68rem' }} />
                          {choice.title}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'grid', gap: 6 }}>
                  <select
                    className="f-input"
                    value={selectedLibCondition}
                    onChange={e => setSelectedLibCondition(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: '.9rem', border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    {SIMPLE_CONDITION_CHOICES.map(choice => {
                      const isRecommended = recConditions.includes(choice.value)
                      return (
                        <option key={choice.value} value={choice.value}>
                          {isRecommended ? '⭐ ' : ''}{choice.title} {isRecommended ? '(Önerilen)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                {(() => {
                  const choice = SIMPLE_CONDITION_CHOICES.find(c => c.value === selectedLibCondition)
                  if (!choice) return null
                  const help = CONDITION_HELP_METADATA[selectedLibCondition] || {
                    title: choice.title,
                    desc: choice.description || 'Bu koşul seçildiğinde kampanyaya eklenerek kurallar adımında düzenlenebilir.',
                    usage: 'Koşulu kurallar listesine eklemek için aşağıdaki butonu kullanın.'
                  }
                  return (
                    <div style={{ background: '#eef5ff', border: '1px solid #93c5fd', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180, marginTop: 8 }}>
                      <div>
                        <h5 style={{ fontWeight: 800, color: '#1e40af', margin: '0 0 8px 0', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fa-solid fa-circle-info" style={{ color: '#3b82f6' }} />
                          {help.title}
                        </h5>
                        <p style={{ fontSize: '.8rem', color: '#1e3a5f', lineHeight: 1.5, margin: '0 0 12px 0' }}>{help.desc}</p>
                        <div style={{ fontSize: '.78rem', color: '#1e3a5f', background: '#fff', padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid #3b82f6', lineHeight: 1.45 }}>
                          <strong>Nasıl Kullanılır:</strong> {help.usage}
                        </div>
                      </div>
                      <button type="button" onClick={() => applySimpleCondition(choice)} className="btn-p" style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <i className="fa-solid fa-plus" /> Koşulu Kampanyaya Ekle
                      </button>
                    </div>
                  )
                })()}
              </div>
              <div style={{ margin: '20px 0 0 0', height: 2, background: 'linear-gradient(to right, transparent, #3b82f6, transparent)', borderRadius: 2 }} />
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {visibleRules.map((rule, ruleIdx) => {
                  const conditions = getEditorRuleConditions(rule)
                  const conditionJoinerMode = rule.conditionConfig?.additionalConditionsMode === 'or' ? 'or' : 'and'
                  return (
                    <div key={rule.id} style={{ borderRadius: 12, border: '1px solid #dbeafe', background: '#eef5ff', padding: 12, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Tanımlı Koşullar {visibleRules.length > 1 ? `#${ruleIdx + 1}` : ''}
                        </div>
                        <button className="btn-o" type="button" onClick={() => addConditionToRule(ruleScopeTab, rule.id)}>
                          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Koşul Ekle
                        </button>
                      </div>
                      {conditions.length === 0 ? (
                        <div style={{ borderRadius: 10, border: '1px dashed #bfdbfe', padding: 10, color: '#64748b', fontSize: '.84rem', background: '#fff' }}>Henüz koşul eklenmedi.</div>
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
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getConditionMeta(condition.conditionKey).label}</div>
                                    <RuntimeStatusBadge status={conditionStatus} />
                                  </div>
                                  <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                                    {buildConditionSummary(pseudoRule, summaryContext)}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
                                  <button className="btn-o" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => openRuleEditor('conditions', ruleScopeTab, rule.id, condition.id)}>Düzenle</button>
                                  <button className="btn-danger" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => removeConditionFromRule(ruleScopeTab, rule.id, condition.id)}><i className="fa-solid fa-trash" /></button>
                                </div>
                              </div>
                            </div>
                            {index < conditions.length - 1 ? (
                              <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                                  <button
                                    type="button"
                                    onClick={() => updateRuleConditionJoinerMode(ruleScopeTab, rule.id, 'and')}
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
                                  >VE</button>
                                  <button
                                    type="button"
                                    onClick={() => updateRuleConditionJoinerMode(ruleScopeTab, rule.id, 'or')}
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
                                  >VEYA</button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: Actions */}
            <div className="wizard-split-col" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 16, background: '#fff8e1', borderRadius: 14, padding: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#fffbeb', color: '#b45309', fontSize: '.75rem', fontWeight: 900 }}>2</span>
                  Eylem Kütüphanesi
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {recActionChoices.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}>Önerilenler:</span>
                    {recActionChoices.map(choice => {
                      const active = selectedLibAction === choice.value
                      return (
                        <button
                          key={choice.value}
                          type="button"
                          onClick={() => setSelectedLibAction(choice.value)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 16,
                            fontSize: '.74rem',
                            fontWeight: 800,
                            border: `1.5px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                            background: active ? '#fffbeb' : '#f8fafc',
                            color: active ? '#b45309' : '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <i className="fa-solid fa-star" style={{ color: active ? '#f59e0b' : '#94a3b8', fontSize: '.68rem' }} />
                          {choice.title}
                        </button>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'grid', gap: 6 }}>
                  <select
                    className="f-input"
                    value={selectedLibAction}
                    onChange={e => setSelectedLibAction(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: '.9rem', border: '1px solid #cbd5e1', background: '#fff' }}
                  >
                    {SIMPLE_ACTION_CHOICES.map(choice => {
                      const isRecommended = recActions.includes(choice.value)
                      return (
                        <option key={choice.value} value={choice.value}>
                          {isRecommended ? '⭐ ' : ''}{choice.title} {isRecommended ? '(Önerilen)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                {(() => {
                  const choice = SIMPLE_ACTION_CHOICES.find(c => c.value === selectedLibAction)
                  if (!choice) return null
                  const help = ACTION_HELP_METADATA[selectedLibAction] || {
                    title: choice.title,
                    desc: choice.description || 'Bu eylem seçildiğinde kampanyaya eklenerek kurallar adımında kazanım değeri düzenlenebilir.',
                    usage: 'Eylemi kurallar listesine eklemek için aşağıdaki butonu kullanın.'
                  }
                  return (
                    <div style={{ background: '#fffbeb', border: '1px solid #fed7aa', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180, marginTop: 8 }}>
                      <div>
                        <h5 style={{ fontWeight: 800, color: '#9a3412', margin: '0 0 8px 0', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fa-solid fa-circle-info" style={{ color: '#f59e0b' }} />
                          {help.title}
                        </h5>
                        <p style={{ fontSize: '.8rem', color: '#7c2d12', lineHeight: 1.5, margin: '0 0 12px 0' }}>{help.desc}</p>
                        <div style={{ fontSize: '.78rem', color: '#451a03', background: '#fff', padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid #f59e0b', lineHeight: 1.45 }}>
                          <strong>Nasıl Kullanılır:</strong> {help.usage}
                        </div>
                      </div>
                      <button type="button" onClick={() => applySimpleAction(choice)} className="btn-p" style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }}>
                        <i className="fa-solid fa-plus" /> Eylemi Kampanyaya Ekle
                      </button>
                    </div>
                  )
                })()}
              </div>
              <div style={{ margin: '20px 0 0 0', height: 2, background: 'linear-gradient(to right, transparent, #f59e0b, transparent)', borderRadius: 2 }} />
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                {visibleRules.map((rule, ruleIdx) => {
                  const actions = getEditorRuleActions(rule)
                  return (
                    <div key={rule.id} style={{ borderRadius: 12, border: '1px solid #fed7aa', background: '#fffbeb', padding: 12, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#b45309', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                          Tanımlı Eylemler {visibleRules.length > 1 ? `#${ruleIdx + 1}` : ''}
                        </div>
                        <button className="btn-o" type="button" onClick={() => addActionToRule(ruleScopeTab, rule.id)}>
                          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Eylem Ekle
                        </button>
                      </div>
                      {actions.length === 0 ? (
                        <div style={{ borderRadius: 10, border: '1px dashed #fed7aa', padding: 10, color: '#64748b', fontSize: '.84rem', background: '#fff' }}>Henüz eylem eklenmedi.</div>
                      ) : actions.map(action => {
                        const pseudoRule = {
                          ...rule,
                          actionType: action.actionType,
                          actionConfig: getStandaloneActionConfig(action.actionConfig),
                        }
                        const actionStatus = getActionRuntimeStatus(action.actionType)
                        return (
                          <div key={action.id} style={{ borderRadius: 10, border: '1px solid #fed7aa', background: '#fff', padding: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                  <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getOptionLabel(ACTION_TYPE_OPTIONS, action.actionType)}</div>
                                  <RuntimeStatusBadge status={actionStatus} />
                                </div>
                                <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                                  {action.actionSummary || buildActionSummary(pseudoRule, summaryContext)}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
                                <button className="btn-o" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => openRuleEditor('actions', ruleScopeTab, rule.id, action.id)}>Düzenle</button>
                                <button className="btn-danger" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => removeActionFromRule(ruleScopeTab, rule.id, action.id)}><i className="fa-solid fa-trash" /></button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Section 5: Operasyon */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 16 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Operasyon ve Çakışma Kuralları</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FieldStack label="Tetikleme Şekli" hint="Otomatik seçilirse koşul sağlandığında doğrudan uygulanır.">
              <div className="sel-wrap">
                <select className="f-input" value={wizardCampaign.applicationMode || 'prompt'} onChange={event => updateCampaign({ applicationMode: event.target.value })}>
                  {CAMPAIGN_APPLICATION_MODE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </FieldStack>
            <FieldStack label="Öncelik" hint="Düşük öncelik sayıları çakışma durumunda daha güçlüdür.">
              <input className="f-input" type="number" min={0} value={formatNumberInputValue(wizardCampaign.priority, '10')} onChange={event => updateCampaign({ priority: event.target.value })} />
            </FieldStack>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Çakışma ve Birleşme Kuralı</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12 }}>
              {STACKING_RULE_OPTIONS.map(option => {
                const active = mergeMode === option.value
                const cardBorder = active ? option.color : '#cbd5e1'
                return (
                  <div key={option.value} style={{ display: 'grid', gap: 10 }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => updateMergeMode(option.value)}
                      style={{
                        textAlign: 'left',
                        border: `2.5px solid ${cardBorder}`,
                        background: active ? `${option.color}0e` : '#fff',
                        borderRadius: 14,
                        padding: 16,
                        cursor: 'pointer',
                        display: 'grid',
                        gap: 12,
                        minHeight: 118,
                        boxShadow: active ? `0 6px 16px ${option.color}1a` : 'none',
                        transition: 'all 0.15s ease-in-out',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <strong style={{ color: '#0f172a' }}>{option.label}</strong>
                      </div>
                      <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>{option.desc}</div>
                    </div>

                    {option.value === 'group' && active ? (
                      <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#f8fbff', display: 'grid', gap: 8 }}>
                        <FieldStack label="Kayıtlı kampanya grubu">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                            <div className="sel-wrap">
                              <select className="f-input" value={selectedConflictGroupId} onChange={event => selectConflictGroup(event.target.value)}>
                                <option value="">Grup seçin</option>
                                {activeConflictGroups.map(group => (
                                  <option key={group.id} value={group.id}>{group.name}</option>
                                ))}
                              </select>
                            </div>
                            <button className="btn-o" type="button" onClick={() => setConflictGroupModalOpen(true)}>Yeni</button>
                          </div>
                        </FieldStack>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Section 1: Campaign Identity */}
        <div className="card" style={{ padding: 18, display: 'grid', gap: 16 }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Kampanya Kimliği</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 16 }}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldStack label="Kampanya Adı">
                  <input className="f-input" value={wizardCampaign.name || ''} onChange={event => updateCampaign({ name: event.target.value })} placeholder="Kampanya adı" />
                </FieldStack>
                <FieldStack label="Kampanya Kodu">
                  <input className="f-input" value={wizardCampaign.code || ''} onChange={event => updateCampaign({ code: event.target.value })} placeholder="Kampanya kodu" />
                </FieldStack>
              </div>
              <FieldStack label="Açıklama">
                <textarea className="f-input" style={{ minHeight: 80 }} value={wizardCampaign.description || ''} onChange={event => updateCampaign({ description: event.target.value })} placeholder="Kampanya açıklaması" />
              </FieldStack>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.84rem', color: '#475569', fontWeight: 700 }}>
                  <input type="checkbox" checked={wizardCampaign.active !== false} onChange={event => updateCampaign({ active: event.target.checked })} />
                  Aktif Kampanya
                </label>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff', display: 'grid', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '.88rem' }}>Öne Çıkan Görsel (Önizleme)</div>
                <div style={{ fontSize: '.74rem', color: '#64748b', marginTop: 4 }}>Kampanya özetinde veya varsayılan olarak gösterilen görsel.</div>
              </div>
              <div style={{ aspectRatio: '16 / 9', border: '1px solid #cbd5e1', borderRadius: 12, overflow: 'hidden', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                {campaignImageUrl ? (
                  <img src={campaignImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:6px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.6rem;color:#cbd5e1"></i><span style="font-size:.72rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '.78rem' }}>Görsel yüklenmedi.</div>
                )}
              </div>
            </div>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '14px 0' }} />

          {/* Dedicated Channels Grid */}
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-rectangle-ad" style={{ color: '#2563eb' }}></i>
              Mecra Bazlı Kampanya Görselleri
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {IMAGE_SLOTS.map(slot => {
                const meta = wizardCampaign.metadata || {}
                const slotImg = meta[slot.key]
                const hasImg = slotImg && slotImg.url
                return (
                  <div key={slot.key} style={{ 
                    border: '1px solid #e2e8f0', 
                    borderRadius: 12, 
                    padding: 12, 
                    background: '#fff', 
                    display: 'grid', 
                    gap: 8, 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '.8rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={slot.label}>
                        {slot.label}
                      </div>
                      <div style={{ fontSize: '.68rem', color: '#94a3b8' }}>Öneri: {slot.recommended}</div>
                    </div>
                    
                    <div style={{ 
                      aspectRatio: '16 / 10', 
                      borderRadius: 8, 
                      overflow: 'hidden', 
                      border: hasImg ? '1px solid #e2e8f0' : '1px dashed #cbd5e1', 
                      background: '#f8fafc',
                      display: 'grid',
                      placeItems: 'center',
                      position: 'relative'
                    }}>
                      {hasImg ? (
                        <>
                          <img src={resolveImageUrl(slotImg.url)} alt={slot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:4px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.4rem;color:#cbd5e1"></i><span style="font-size:.65rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                          <button 
                            type="button" 
                            onClick={() => removeSlotImage(slot.key)}
                            style={{ 
                              position: 'absolute', 
                              top: 4, 
                              right: 4, 
                              background: 'rgba(239, 68, 68, 0.9)', 
                              color: '#fff', 
                              border: 'none', 
                              borderRadius: '50%', 
                              width: 20, 
                              height: 20, 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center', 
                              cursor: 'pointer',
                              fontSize: '.68rem'
                            }}
                            title="Görseli Kaldır"
                          >
                            <i className="fa-solid fa-xmark"></i>
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '.7rem', color: '#94a3b8', fontWeight: 600 }}>Tanımlanmamış</span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                      <label className="btn-o" style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        gap: 6, 
                        fontSize: '.74rem', 
                        cursor: slotUploading[slot.key] ? 'not-allowed' : 'pointer', 
                        margin: 0,
                        padding: '4px 8px'
                      }}>
                        <i className={`fa-solid ${slotUploading[slot.key] ? 'fa-spinner fa-spin' : 'fa-upload'}`} />
                        {slotUploading[slot.key] ? 'Yükleniyor...' : 'Görsel Seç'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={slotUploading[slot.key]}
                          style={{ display: 'none' }}
                          onChange={e => uploadSlotImage(e.target.files?.[0], slot.key)}
                        />
                      </label>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4 }}>
                        <input 
                          type="text" 
                          placeholder="URL yapıştır" 
                          className="f-input"
                          style={{ fontSize: '.74rem', padding: '4px 6px', height: 'auto' }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              setSlotImageUrl(slot.key, e.currentTarget.value)
                              e.currentTarget.value = ''
                            }
                          }}
                        />
                        <button 
                          type="button" 
                          className="btn-o" 
                          style={{ padding: '4px 8px', fontSize: '.72rem' }}
                          onClick={e => {
                            const input = e.currentTarget.parentElement?.querySelector('input')
                            if (input && input.value) {
                              setSlotImageUrl(slot.key, input.value)
                              input.value = ''
                            }
                          }}
                        >
                          Ekle
                        </button>
                      </div>

                      {campaignImages.length > 0 && (
                        <select 
                          value="" 
                          onChange={e => {
                            if (e.target.value) {
                              const img = campaignImages.find(i => i.id === e.target.value)
                              useArchiveImageForSlot(img, slot.key)
                            }
                          }}
                          style={{ fontSize: '.74rem', padding: '4px 6px', width: '100%', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}
                        >
                          <option value="" disabled>Arşivden Ata...</option>
                          {campaignImages.map(img => (
                            <option key={img.id} value={img.id}>{img.fileName || img.title || 'Görsel'}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <hr style={{ border: 0, borderTop: '1px solid #e2e8f0', margin: '14px 0' }} />

          {/* General Image Archive */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-images" style={{ color: '#2563eb' }}></i>
                Görsel Arşivi ({campaignImages.length})
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <label className="btn-o" style={{ cursor: slotUploading['archive'] ? 'not-allowed' : 'pointer', margin: 0, padding: '5px 10px', fontSize: '.76rem' }}>
                  <i className={`fa-solid ${slotUploading['archive'] ? 'fa-spinner fa-spin' : 'fa-plus'}`} style={{ marginRight: 4 }} />
                  Arşive Görsel Yükle
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={slotUploading['archive']}
                    style={{ display: 'none' }}
                    onChange={e => uploadSlotImage(e.target.files?.[0], 'archive')}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12, maxWidth: 450 }}>
              <input 
                type="text" 
                placeholder="Arşive eklenecek harici görsel URL'i" 
                className="f-input"
                style={{ fontSize: '.78rem', padding: '6px 8px', height: 'auto', flex: 1 }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setSlotImageUrl('archive', e.currentTarget.value)
                    e.currentTarget.value = ''
                  }
                }}
              />
              <button 
                type="button" 
                className="btn-o" 
                style={{ padding: '6px 12px', fontSize: '.78rem' }}
                onClick={e => {
                  const input = e.currentTarget.parentElement?.querySelector('input')
                  if (input && input.value) {
                    setSlotImageUrl('archive', input.value)
                    input.value = ''
                  }
                }}
              >
                URL'den Ekle
              </button>
            </div>

            {campaignImages.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {campaignImages.map(img => (
                  <div key={img.id} style={{ 
                    border: `1px solid ${img.isPrimary ? '#2563eb' : '#e2e8f0'}`, 
                    borderRadius: 12, 
                    overflow: 'hidden', 
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    {/* Preview */}
                    <div style={{ aspectRatio: '16 / 10', overflow: 'hidden', position: 'relative', background: '#f8fafc' }}>
                      <img src={resolveImageUrl(img.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:4px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.2rem;color:#cbd5e1"></i><span style="font-size:.6rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                      {img.isPrimary && (
                        <span style={{ 
                          position: 'absolute', 
                          top: 4, 
                          left: 4, 
                          background: '#2563eb', 
                          color: '#fff', 
                          fontSize: '.58rem', 
                          padding: '1px 4px', 
                          borderRadius: 4, 
                          fontWeight: 800 
                        }}>
                          Öne Çıkan
                        </span>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6, background: '#f8fafc', borderTop: '1px solid #e2e8f0', flex: 1, justifyContent: 'space-between' }}>
                      <div style={{ fontSize: '.68rem', color: '#64748b', wordBreak: 'break-all', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 28 }} title={img.fileName || img.title}>
                        {img.fileName || img.title || 'Görsel'}
                      </div>
                      
                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                        <button 
                          type="button" 
                          className="btn-o" 
                          style={{ padding: '2px 4px', fontSize: '.68rem', width: '100%' }}
                          onClick={() => setPrimaryCampaignImage(img.id)}
                        >
                          Öne Çıkar
                        </button>
                        
                        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                          <button 
                            type="button" 
                            className="btn-danger" 
                            style={{ padding: '2px 6px', fontSize: '.68rem', flex: 1 }} 
                            onClick={() => removeCampaignImage(img.id)}
                          >
                            Sil
                          </button>
                          
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) {
                                useArchiveImageForSlot(img, e.target.value)
                              }
                            }}
                            style={{ 
                              padding: '2px 4px', 
                              fontSize: '.68rem', 
                              borderRadius: 4, 
                              border: '1px solid #cbd5e1', 
                              background: '#fff', 
                              color: '#1e293b',
                              fontWeight: 600,
                              cursor: 'pointer',
                              flex: 1.2
                            }}
                          >
                            <option value="" disabled>Ata...</option>
                            {IMAGE_SLOTS.map(s => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '.84rem', color: '#94a3b8', fontStyle: 'italic', padding: '10px 0' }}>
                Arşivde henüz görsel bulunmuyor. Yukarıdan yeni görsel yükleyebilirsiniz.
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {getHeader()}

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

      {activeMode === 'create' && (
        <div className="card" style={{
          padding: 18,
          marginBottom: 18,
          position: 'relative',
          overflow: 'hidden',
          border: campaignImageUrl ? '1px solid #bfdbfe' : undefined,
        }}>
          {campaignImageUrl ? (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `linear-gradient(90deg, rgba(255,255,255,.96), rgba(255,255,255,.88)), url("${campaignImageUrl}")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.9,
                pointerEvents: 'none',
              }}
            />
          ) : null}
          <div style={{ display: 'grid', gap: 14, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {WIZARD_STEPS.map((step, index) => (
                  <StepPill key={step.key} index={index} currentStep={currentStep} title={step.title} onClick={setCurrentStep} />
                ))}
              </div>
              <label style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 40,
                padding: '0 12px',
                border: `1px solid ${wizardCampaign?.active === false ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: 10,
                background: wizardCampaign?.active === false ? '#fff1f2' : '#f0fdf4',
                color: wizardCampaign?.active === false ? '#991b1b' : '#166534',
                fontWeight: 900,
                fontSize: '.84rem',
              }}>
                <input
                  type="checkbox"
                  checked={wizardCampaign?.active !== false}
                  onChange={event => updateCampaign({ active: event.target.checked })}
                  disabled={loading}
                />
                {wizardCampaign?.active === false ? 'Pasif' : 'Aktif'}
              </label>
            </div>
            {campaignImages.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {campaignImages.slice(0, 6).map(image => (
                  <button
                    key={image.id}
                    type="button"
                    title={image.isPrimary ? 'Ana kampanya görseli' : 'Ana görsel yap'}
                    onClick={() => setPrimaryCampaignImage(image.id)}
                    style={{
                      width: 54,
                      height: 38,
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: `2px solid ${image.isPrimary ? '#2563eb' : '#e2e8f0'}`,
                      padding: 0,
                      background: '#fff',
                      cursor: 'pointer',
                      boxShadow: image.isPrimary ? '0 6px 14px rgba(37,99,235,.18)' : 'none',
                    }}
                  >
                    <img src={resolveImageUrl(image.url)} alt={image.title || 'Kampanya görseli'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f1f5f9;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:.7rem;color:#cbd5e1"></i>'; p.appendChild(ph); } }} />
                  </button>
                ))}
                {campaignImages.length > 6 ? (
                  <span style={{ color: '#64748b', fontSize: '.78rem', fontWeight: 800 }}>+{campaignImages.length - 6} görsel</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!loading && wizardCampaign && activeMode === 'create' ? (
        <div className="card" style={{
          padding: 16,
          marginBottom: 18,
          background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%)',
          border: '1px solid #dbeafe',
          borderRadius: 16,
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <i className="fa-solid fa-file-signature" style={{ color: '#2563eb', fontSize: '1.1rem' }} />
            <div style={{ fontWeight: 800, fontSize: '.88rem', color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Kampanya Özeti
            </div>
          </div>
          <div style={{ fontSize: '.82rem', color: '#334155', lineHeight: 1.6, fontWeight: 500 }}>
            {getCampaignSummaryText(wizardCampaign, selectedGoal, customerCategories, salesChannels, summaryContext)}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
          Wizard verileri yukleniyor...
        </div>
      ) : activeMode === 'view' ? (
        renderViewMode()
      ) : activeMode === 'edit' ? (
        renderEditMode()
      ) : (
        <>
          {currentStep === 0 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18 }}>
              <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Kampanyanın ana hedefini seçin</div>
              <div style={{ fontSize: '.82rem', color: '#64748b', marginBottom: 16 }}>
                Oluşturacağınız kampanya için ana hedefinizi seçin, sonraki adımlarda hedefinize uygun öneriler yapılacaktır.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                {GOAL_PRESETS.map(goal => {
                  const active = selectedGoal === goal.value
                  return (
                    <button
                      key={goal.value}
                      type="button"
                      onClick={() => applyGoalPreset(goal.value)}
                      style={{
                        border: active ? `2px solid ${goal.color}` : '1px solid #e2e8f0',
                        background: active ? goal.bgGradient : '#fff',
                        color: '#0f172a',
                        borderRadius: 16,
                        padding: '20px 18px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: active ? `0 12px 24px rgba(15,23,42,0.06), 0 4px 12px ${goal.color}1e` : '0 4px 6px -1px rgba(15,23,42,0.02)',
                        transition: 'all 0.2s ease-in-out',
                        transform: active ? 'scale(1.02)' : 'none',
                        outline: 'none',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Decorative background accent */}
                      <div style={{
                        position: 'absolute',
                        right: -10,
                        top: -10,
                        fontSize: '5rem',
                        color: active ? `${goal.color}0c` : 'rgba(15,23,42,0.02)',
                        pointerEvents: 'none',
                        transition: 'color 0.2s ease'
                      }}>
                        <i className={goal.icon} />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          borderRadius: 12,
                          background: active ? '#fff' : `${goal.color}12`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: goal.color,
                          fontSize: '1.2rem',
                          boxShadow: active ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
                          border: active ? `1px solid ${goal.color}1e` : 'none',
                          flexShrink: 0,
                        }}>
                          <i className={goal.icon} />
                        </div>
                        <div style={{ fontWeight: 800, fontSize: '.95rem', color: active ? '#0f172a' : '#1e293b' }}>
                          {goal.title}
                        </div>
                      </div>

                      <div style={{
                        fontSize: '.82rem',
                        color: active ? '#334155' : '#64748b',
                        lineHeight: 1.5,
                        fontWeight: 500,
                        zIndex: 1
                      }}>
                        {goal.description}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {currentStep === 1 ? (
            <div className="card" style={{ padding: 24, marginBottom: 18, display: 'grid', gap: 24 }}>
              <style>{`
                .scope-questions-grid {
                  display: grid;
                  gap: 20px;
                  grid-template-columns: 1fr;
                }
                @media (min-width: 768px) and (max-width: 1240px) {
                  .scope-questions-grid {
                    grid-template-columns: 1fr 1fr;
                  }
                }
                @media (min-width: 1241px) {
                  .scope-questions-grid {
                    grid-template-columns: 1fr 1fr 1fr 1fr;
                  }
                }
              `}</style>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
                  Kampanya Kapsamını Belirleyin
                </h3>
                <p style={{ fontSize: '.82rem', color: '#64748b', margin: 0 }}>
                  Aşağıdaki 4 temel soruya cevap vererek kampanyanın sınırlarını kolayca çizin.
                </p>
              </div>

              {/* 2x2 Grid for the Questions */}
              <div className="scope-questions-grid">
                
                {/* Question 1: Hedef Kitle (Audience) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 16, borderRadius: 16, background: '#fafafb' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>1. Hedef Kitle</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 6 }}>Bu kampanya hangi müşteri kitlesi için geçerli olsun?</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => updateCampaign({ audienceType: 'all', audienceCategoryIds: [] })}
                      style={campaignButtonStyle(wizardCampaign.audienceType === 'all', '#2563eb')}
                    >
                      <i className="fa-solid fa-users" style={{ fontSize: '1.2rem' }} />
                      <span>Tüm Müşteriler</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCampaign({ audienceType: 'tagged_customers' })}
                      style={campaignButtonStyle(wizardCampaign.audienceType === 'tagged_customers', '#2563eb')}
                    >
                      <i className="fa-solid fa-tags" style={{ fontSize: '1.2rem' }} />
                      <span>Seçili Kategori</span>
                    </button>
                  </div>

                  {wizardCampaign.audienceType === 'tagged_customers' && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                      <SearchableMultiSelect
                        options={activeCustomerCategories.map(category => ({
                          value: category.id,
                          label: category.name,
                          description: category.description || category.code || '',
                        }))}
                        selectedValues={wizardCampaign.audienceCategoryIds || []}
                        onChange={next => updateCampaign({ audienceCategoryIds: next })}
                        placeholder="Müşteri kategorisi seçin"
                        allowSelectAll
                      />
                    </div>
                  )}
                </div>

                {/* Question 2: Hangi Satış Kanallarında */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 16, borderRadius: 16, background: '#fafafb' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>2. Satış Kanalları</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 6 }}>Kampanyanın aktif olacağı satış kanallarını seçin.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => updateCampaign({ channelTargets: [] })}
                      style={campaignButtonStyle(!wizardCampaign.channelTargets || wizardCampaign.channelTargets.length === 0, '#0284c7')}
                    >
                      <i className="fa-solid fa-globe" style={{ fontSize: '1.2rem' }} />
                      <span>Tüm Kanallar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateCampaign({ channelTargets: [salesChannels[0]?.value].filter(Boolean) })}
                      style={campaignButtonStyle(wizardCampaign.channelTargets && wizardCampaign.channelTargets.length > 0, '#0284c7')}
                    >
                      <i className="fa-solid fa-mobile-screen-button" style={{ fontSize: '1.2rem' }} />
                      <span>Seçili Kanallar</span>
                    </button>
                  </div>

                  {wizardCampaign.channelTargets && wizardCampaign.channelTargets.length > 0 && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                      <SearchableMultiSelect
                        options={campaignChannelOptions}
                        selectedValues={wizardCampaign.channelTargets || []}
                        onChange={next => updateCampaign({ channelTargets: next })}
                        placeholder="Satış kanalı seçin"
                      />                    </div>
                  )}
                </div>

                {/* Question 3: Hangi Şubelerde */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 16, borderRadius: 16, background: '#fafafb' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>3. Şubeler</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 6 }}>Kampanyanın geçerli olacağı şube veya şube şablonlarını seçin.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => updateCampaign({ metadata: { ...wizardCampaign.metadata, branchSelections: [] } })}
                      style={campaignButtonStyle(!wizardCampaign.metadata?.branchSelections || wizardCampaign.metadata.branchSelections.length === 0, '#7c3aed')}
                    >
                      <i className="fa-solid fa-network-wired" style={{ fontSize: '1.2rem' }} />
                      <span>Tüm Şubeler</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultSelection = branchTemplates[0]
                          ? [{ id: String(branchTemplates[0].id), type: 'template', name: branchTemplates[0].name, branchIds: (branchTemplates[0].branch_ids || []).map(String) }]
                          : (branches[0] ? [{ id: String(branches[0].id), type: 'branch', name: branches[0].name }] : [])
                        updateCampaign({ metadata: { ...wizardCampaign.metadata, branchSelections: defaultSelection } })
                      }}
                      style={campaignButtonStyle(wizardCampaign.metadata?.branchSelections && wizardCampaign.metadata.branchSelections.length > 0, '#7c3aed')}
                    >
                      <i className="fa-solid fa-store" style={{ fontSize: '1.2rem' }} />
                      <span>Seçili Şubeler</span>
                    </button>
                  </div>

                  {wizardCampaign.metadata?.branchSelections && wizardCampaign.metadata.branchSelections.length > 0 && (
                    <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                      <SearchableMultiSelect
                        options={[
                          ...(branchTemplates || []).map(t => ({
                            value: `template:${t.id}`,
                            label: t.name,
                            description: `${(t.branch_ids || []).length} şube içerir`
                          })),
                          ...(branches || []).map(b => ({
                            value: `branch:${b.id}`,
                            label: b.name,
                            description: 'Bireysel Şube'
                          }))
                        ]}
                        selectedValues={(wizardCampaign.metadata.branchSelections || []).map(x => `${x.type}:${x.id}`)}
                        onChange={next => {
                          const sanitized = sanitizeWizardBranchSelections(next)
                          updateCampaign({ metadata: { ...wizardCampaign.metadata, branchSelections: sanitized } })
                        }}
                        placeholder="Şube veya şube grubu seçin"
                      />                    </div>
                  )}
                </div>

                {/* Question 4: Ne Zaman */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #f1f5f9', padding: 16, borderRadius: 16, background: '#fafafb' }}>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.9rem' }}>4. Ne Zaman?</div>
                  <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 6 }}>Kampanyanın hangi tarih aralığında aktif olacağını belirtin.</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => updateCampaign({ startsAt: null, endsAt: null })}
                      style={campaignButtonStyle(!wizardCampaign.startsAt && !wizardCampaign.endsAt, '#ea580c')}
                    >
                      <i className="fa-solid fa-bolt" style={{ fontSize: '1.2rem' }} />
                      <span>Hemen/Süresiz Başla</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date()
                        const oneMonthLater = new Date()
                        oneMonthLater.setMonth(now.getMonth() + 1)
                        updateCampaign({ startsAt: now.toISOString(), endsAt: oneMonthLater.toISOString() })
                      }}
                      style={campaignButtonStyle(wizardCampaign.startsAt || wizardCampaign.endsAt, '#ea580c')}
                    >
                      <i className="fa-solid fa-calendar-days" style={{ fontSize: '1.2rem' }} />
                      <span>Tarih Aralığı Belirt</span>
                    </button>
                  </div>

                  {(wizardCampaign.startsAt || wizardCampaign.endsAt) && (
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <FieldStack label="Başlangıç Tarihi">
                        <input className="f-input" type="datetime-local" value={formatDateTimeInput(wizardCampaign.startsAt)} onChange={event => updateCampaign({ startsAt: event.target.value })} />
                      </FieldStack>
                      <FieldStack label="Bitiş Tarihi">
                        <input className="f-input" type="datetime-local" value={formatDateTimeInput(wizardCampaign.endsAt)} onChange={event => updateCampaign({ endsAt: event.target.value })} />
                      </FieldStack>
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="card" style={{ padding: 20, marginBottom: 18, display: 'grid', gap: 20 }}>
              <style>{`
                @media (max-width: 991px) {
                  .wizard-split-grid {
                    grid-template-columns: 1fr !important;
                    gap: 20px !important;
                  }
                  .vertical-split-divider {
                    display: none !important;
                  }
                  .wizard-split-col {
                    padding: 0 !important;
                    border-right: none !important;
                  }
                }
              `}</style>

              <div className="wizard-split-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, position: 'relative' }}>
                {/* Visual red divider line */}
                <div className="vertical-split-divider" style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: '2px',
                  background: 'linear-gradient(to bottom, #fecaca, #ef4444, #fecaca)',
                  transform: 'translateX(-50%)',
                  zIndex: 10
                }} />

                {/* Left Column: Conditions Library */}
                <div className="wizard-split-col" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 16, background: '#dbeeff', borderRadius: 14, padding: 16 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#eff6ff', color: '#1d4ed8', fontSize: '.75rem', fontWeight: 900 }}>1</span>
                      Koşul Kütüphanesi
                    </div>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>
                      Kampanyanın tetiklenme koşulunu seçin ve altındaki açıklama kartından detayları inceleyin.
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {/* Recommendation Chips for Conditions */}
                    {recConditionChoices.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}>Önerilenler:</span>
                        {recConditionChoices.map(choice => {
                          const active = selectedLibCondition === choice.value
                          return (
                            <button
                              key={choice.value}
                              type="button"
                              onClick={() => setSelectedLibCondition(choice.value)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 16,
                                fontSize: '.74rem',
                                fontWeight: 800,
                                border: `1.5px solid ${active ? '#3b82f6' : '#e2e8f0'}`,
                                background: active ? '#eff6ff' : '#f8fafc',
                                color: active ? '#1d4ed8' : '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.2s'
                              }}
                            >
                              <i className="fa-solid fa-star" style={{ color: active ? '#3b82f6' : '#94a3b8', fontSize: '.68rem' }} />
                              {choice.title}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div style={{ display: 'grid', gap: 6 }}>
                      <select
                        className="f-input"
                        value={selectedLibCondition}
                        onChange={e => setSelectedLibCondition(e.target.value)}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: '.9rem', border: '1px solid #cbd5e1', background: '#fff' }}
                      >
                        {SIMPLE_CONDITION_CHOICES.map(choice => {
                          const isRecommended = recConditions.includes(choice.value)
                          return (
                            <option key={choice.value} value={choice.value}>
                              {isRecommended ? '⭐ ' : ''}{choice.title} {isRecommended ? '(Önerilen)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>

                    {/* Condition details card */}
                    {(() => {
                      const choice = SIMPLE_CONDITION_CHOICES.find(c => c.value === selectedLibCondition)
                      if (!choice) return null
                      const help = CONDITION_HELP_METADATA[selectedLibCondition] || {
                        title: choice.title,
                        desc: choice.description || 'Bu koşul seçildiğinde kampanyaya eklenerek kurallar adımında düzenlenebilir.',
                        usage: 'Koşulu kurallar listesine eklemek için aşağıdaki butonu kullanın.'
                      }
                      return (
                        <div style={{
                          background: '#eef5ff',
                          border: '1px solid #93c5fd',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 180,
                          marginTop: 8
                        }}>
                          <div>
                            <h5 style={{ fontWeight: 800, color: '#1e40af', margin: '0 0 8px 0', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="fa-solid fa-circle-info" style={{ color: '#3b82f6' }} />
                              {help.title}
                            </h5>
                            <p style={{ fontSize: '.8rem', color: '#1e3a5f', lineHeight: 1.5, margin: '0 0 12px 0' }}>
                              {help.desc}
                            </p>
                            <div style={{ fontSize: '.78rem', color: '#1e3a5f', background: '#fff', padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid #3b82f6', lineHeight: 1.45 }}>
                              <strong>Nasıl Kullanılır:</strong> {help.usage}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              applySimpleCondition(choice)
                            }}
                            className="btn-p"
                            style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <i className="fa-solid fa-plus" /> Koşulu Kampanyaya Ekle
                          </button>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Blue horizontal divider */}
                  <div style={{ margin: '20px 0 0 0', height: 2, background: 'linear-gradient(to right, transparent, #3b82f6, transparent)', borderRadius: 2 }} />

                  {/* Current Conditions List */}
                  <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                    {visibleRules.map((rule, ruleIdx) => {
                      const conditions = getEditorRuleConditions(rule)
                      const conditionJoinerMode = rule.conditionConfig?.additionalConditionsMode === 'or' ? 'or' : 'and'
                      return (
                        <div key={rule.id} style={{ borderRadius: 12, border: '1px solid #dbeafe', background: '#eef5ff', padding: 12, display: 'grid', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                            <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                              Tanımlı Koşullar {visibleRules.length > 1 ? `#${ruleIdx + 1}` : ''}
                            </div>
                            <button className="btn-o" type="button" onClick={() => addConditionToRule(ruleScopeTab, rule.id)}>
                              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                              Koşul Ekle
                            </button>
                          </div>
                          {conditions.length === 0 ? (
                            <div style={{ borderRadius: 10, border: '1px dashed #bfdbfe', padding: 10, color: '#64748b', fontSize: '.84rem', background: '#fff' }}>
                              Henüz koşul eklenmedi.
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
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getConditionMeta(condition.conditionKey).label}</div>
                                        <RuntimeStatusBadge status={conditionStatus} />
                                      </div>
                                      <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                                        {buildConditionSummary(pseudoRule, summaryContext)}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
                                      <button className="btn-o" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => openRuleEditor('conditions', ruleScopeTab, rule.id, condition.id)}>Düzenle</button>
                                      <button className="btn-danger" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => removeConditionFromRule(ruleScopeTab, rule.id, condition.id)}><i className="fa-solid fa-trash" /></button>
                                    </div>
                                  </div>
                                </div>
                                {index < conditions.length - 1 ? (
                                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                                    <div style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 999, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
                                      <button
                                        type="button"
                                        onClick={() => updateRuleConditionJoinerMode(ruleScopeTab, rule.id, 'and')}
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
                                        onClick={() => updateRuleConditionJoinerMode(ruleScopeTab, rule.id, 'or')}
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
                      )
                    })}
                  </div>
                </div>

                {/* Right Column: Actions Library */}
                <div className="wizard-split-col" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingLeft: 16, background: '#fff8e1', borderRadius: 14, padding: 16 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', background: '#fffbeb', color: '#b45309', fontSize: '.75rem', fontWeight: 900 }}>2</span>
                      Eylem Kütüphanesi
                    </div>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>
                      Kampanya sonucunda verilecek kazanımı seçin ve altındaki açıklama kartından detayları inceleyin.
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10 }}>
                    {/* Recommendation Chips for Actions */}
                    {recActionChoices.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        <span style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}>Önerilenler:</span>
                        {recActionChoices.map(choice => {
                          const active = selectedLibAction === choice.value
                          return (
                            <button
                              key={choice.value}
                              type="button"
                              onClick={() => setSelectedLibAction(choice.value)}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 16,
                                fontSize: '.74rem',
                                fontWeight: 800,
                                border: `1.5px solid ${active ? '#f59e0b' : '#e2e8f0'}`,
                                background: active ? '#fffbeb' : '#f8fafc',
                                color: active ? '#b45309' : '#475569',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                transition: 'all 0.2s'
                              }}
                            >
                              <i className="fa-solid fa-star" style={{ color: active ? '#f59e0b' : '#94a3b8', fontSize: '.68rem' }} />
                              {choice.title}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div style={{ display: 'grid', gap: 6 }}>
                      <select
                        className="f-input"
                        value={selectedLibAction}
                        onChange={e => setSelectedLibAction(e.target.value)}
                        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: '.9rem', border: '1px solid #cbd5e1', background: '#fff' }}
                      >
                        {SIMPLE_ACTION_CHOICES.map(choice => {
                          const isRecommended = recActions.includes(choice.value)
                          return (
                            <option key={choice.value} value={choice.value}>
                              {isRecommended ? '⭐ ' : ''}{choice.title} {isRecommended ? '(Önerilen)' : ''}
                            </option>
                          )
                        })}
                      </select>
                    </div>

                    {/* Action details card */}
                    {(() => {
                      const choice = SIMPLE_ACTION_CHOICES.find(c => c.value === selectedLibAction)
                      if (!choice) return null
                      const help = ACTION_HELP_METADATA[selectedLibAction] || {
                        title: choice.title,
                        desc: choice.description || 'Bu eylem seçildiğinde kampanyaya eklenerek kurallar adımında kazanım değeri düzenlenebilir.',
                        usage: 'Eylemi kurallar listesine eklemek için aşağıdaki butonu kullanın.'
                      }
                      return (
                        <div style={{
                          background: '#fffbeb',
                          border: '1px solid #fed7aa',
                          borderRadius: 12,
                          padding: 16,
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: 180,
                          marginTop: 8
                        }}>
                          <div>
                            <h5 style={{ fontWeight: 800, color: '#9a3412', margin: '0 0 8px 0', fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <i className="fa-solid fa-circle-info" style={{ color: '#f59e0b' }} />
                              {help.title}
                            </h5>
                            <p style={{ fontSize: '.8rem', color: '#7c2d12', lineHeight: 1.5, margin: '0 0 12px 0' }}>
                              {help.desc}
                            </p>
                            <div style={{ fontSize: '.78rem', color: '#451a03', background: '#fff', padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid #f59e0b', lineHeight: 1.45 }}>
                              <strong>Nasıl Kullanılır:</strong> {help.usage}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              applySimpleAction(choice)
                            }}
                            className="btn-p"
                            style={{ width: '100%', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' }}
                          >
                            <i className="fa-solid fa-plus" /> Eylemi Kampanyaya Ekle
                          </button>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Yellow horizontal divider */}
                  <div style={{ margin: '20px 0 0 0', height: 2, background: 'linear-gradient(to right, transparent, #f59e0b, transparent)', borderRadius: 2 }} />

                  {/* Current Actions List */}
                  <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                    {visibleRules.map((rule, ruleIdx) => {
                      const actions = getEditorRuleActions(rule)
                      return (
                        <div key={rule.id} style={{ borderRadius: 12, border: '1px solid #fed7aa', background: '#fffbeb', padding: 12, display: 'grid', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                            <div style={{ fontSize: '.72rem', fontWeight: 900, color: '#b45309', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                              Tanımlı Eylemler {visibleRules.length > 1 ? `#${ruleIdx + 1}` : ''}
                            </div>
                            <button className="btn-o" type="button" onClick={() => addActionToRule(ruleScopeTab, rule.id)}>
                              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                              Eylem Ekle
                            </button>
                          </div>
                          {actions.length === 0 ? (
                            <div style={{ borderRadius: 10, border: '1px dashed #fed7aa', padding: 10, color: '#64748b', fontSize: '.84rem', background: '#fff' }}>
                              Henüz eylem eklenmedi.
                            </div>
                          ) : actions.map(action => {
                            const pseudoRule = {
                              ...rule,
                              actionType: action.actionType,
                              actionConfig: getStandaloneActionConfig(action.actionConfig),
                            }
                            const actionStatus = getActionRuntimeStatus(action.actionType)
                            return (
                              <div key={action.id} style={{ borderRadius: 10, border: '1px solid #fed7aa', background: '#fff', padding: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getOptionLabel(ACTION_TYPE_OPTIONS, action.actionType)}</div>
                                      <RuntimeStatusBadge status={actionStatus} />
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: '.82rem', color: '#334155', lineHeight: 1.55 }}>
                                      {action.actionSummary || buildActionSummary(pseudoRule, summaryContext)}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', flexShrink: 0, marginLeft: 8 }}>
                                    <button className="btn-o" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => openRuleEditor('actions', ruleScopeTab, rule.id, action.id)}>Düzenle</button>
                                    <button className="btn-danger" type="button" style={{ padding: '4px 8px', fontSize: '.78rem' }} onClick={() => removeActionFromRule(ruleScopeTab, rule.id, action.id)}><i className="fa-solid fa-trash" /></button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Operasyon ve Çakışma Kuralları</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                  Kampanyanın satış anında otomatik mi yoksa kasacı tarafından mı tetikleneceği ve diğer kampanyalarla çakışma davranışı buradan yönetilir.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
                <FieldStack label="Tetikleme şekli" hint="Otomatik seçilirse koşullar sağlandığında POS/Garson/Kiosk akışı kampanyayı kendisi uygular.">
                  <div className="sel-wrap">
                    <select className="f-input" value={wizardCampaign.applicationMode || 'prompt'} onChange={event => updateCampaign({ applicationMode: event.target.value })}>
                      {CAMPAIGN_APPLICATION_MODE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </FieldStack>
                <FieldStack label="Öncelik" hint="Daha küçük sayı daha güçlü kabul edilir ve çakışma durumunda önce değerlendirilir.">
                  <input className="f-input" type="number" min={0} value={formatNumberInputValue(wizardCampaign.priority, '10')} onChange={event => updateCampaign({ priority: event.target.value })} />
                </FieldStack>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Çakışma ve Birleşme Kuralı</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(220px, 1fr))', gap: 12, alignItems: 'start' }}>
                  {STACKING_RULE_OPTIONS.map(option => {
                    const active = mergeMode === option.value
                    const cardBorder = active ? option.color : '#cbd5e1'
                    return (
                      <div key={option.value} style={{ display: 'grid', gap: 10 }}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          onClick={() => updateMergeMode(option.value)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              updateMergeMode(option.value)
                            }
                          }}
                          style={{
                            textAlign: 'left',
                            border: `2.5px solid ${cardBorder}`,
                            background: active ? `${option.color}0e` : '#fff',
                            borderRadius: 14,
                            padding: 16,
                            cursor: 'pointer',
                            display: 'grid',
                            gap: 12,
                            minHeight: 118,
                            boxShadow: active ? `0 6px 16px ${option.color}1a` : '0 2px 4px rgba(0,0,0,0.02)',
                            transform: active ? 'scale(1.01)' : 'none',
                            transition: 'all 0.2s ease-in-out',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                              width: 44,
                              height: 44,
                              borderRadius: 12,
                              background: active ? '#fff' : `${option.color}12`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: option.color,
                              fontSize: '1.2rem',
                              boxShadow: active ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
                              border: active ? `1px solid ${option.color}1e` : 'none',
                              flexShrink: 0,
                            }}>
                              <i className={option.icon} />
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '.95rem', color: active ? '#0f172a' : '#1e293b', minWidth: 0, flex: 1 }}>{option.label}</div>
                            <button
                              type="button"
                              title={`${option.label} yardım`}
                              aria-label={`${option.label} yardım`}
                              onClick={event => {
                                event.preventDefault()
                                event.stopPropagation()
                                setStackingHelpKey(option.value)
                              }}
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: 10,
                                border: `1px solid ${option.color}33`,
                                background: active ? '#fff' : '#fffbeb',
                                color: '#d97706',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                boxShadow: active ? '0 4px 10px rgba(0,0,0,0.06)' : 'none',
                                flexShrink: 0,
                              }}
                            >
                              <i className="fa-solid fa-lightbulb" />
                            </button>
                          </div>
                          <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.5 }}>{option.desc}</div>
                        </div>

                        {option.value === 'stackable' && active ? (
                          <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#f0fdf4', display: 'grid', gap: 8 }}>
                            <div style={{ fontWeight: 900, color: '#166534' }}>Birleşebileceği aktif kampanyalar</div>
                            {stackablePeerCampaigns.length > 0 ? stackablePeerCampaigns.slice(0, 6).map(campaign => (
                              <CampaignConflictPeerRow key={campaign.id} campaign={campaign} color="#166534" />
                            )) : <div style={{ color: '#64748b', fontSize: '.82rem' }}>Bu kapsamda birleşebilir aktif kampanya bulunamadı.</div>}
                          </div>
                        ) : null}

                        {option.value === 'group' && active ? (
                          <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 10, background: '#f8fbff', display: 'grid', gap: 8 }}>
                            <FieldStack label="Kayıtlı kampanya grubu">
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                                <div className="sel-wrap">
                                  <select className="f-input" value={selectedConflictGroup?.id || ''} onChange={event => selectConflictGroup(event.target.value)}>
                                    <option value="">Grup seçin</option>
                                    {activeConflictGroups.map(group => (
                                      <option key={group.id} value={group.id}>{group.name}</option>
                                    ))}
                                  </select>
                                </div>
                                <button className="btn-o" type="button" onClick={() => setConflictGroupModalOpen(true)}>
                                  <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                                  Yeni
                                </button>
                              </div>
                            </FieldStack>
                            {selectedConflictGroup ? (
                              <div style={{ color: '#1d4ed8', fontSize: '.78rem', fontWeight: 800 }}>
                                Seçili grup: {selectedConflictGroup.name}
                              </div>
                            ) : (
                              <div style={{ color: '#64748b', fontSize: '.82rem' }}>DB'de kayıtlı bir grup seçin veya yeni grup ekleyin.</div>
                            )}
                            {selectedGroupCampaigns.length > 0 ? (
                              <div style={{ display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: '.76rem', fontWeight: 900, color: '#1d4ed8' }}>Bu gruptaki aktif kampanyalar</div>
                                {selectedGroupCampaigns.slice(0, 6).map(campaign => (
                                  <CampaignConflictPeerRow key={campaign.id} campaign={campaign} color="#1d4ed8" />
                                ))}
                              </div>
                            ) : selectedConflictGroup ? (
                              <div style={{ color: '#64748b', fontSize: '.82rem' }}>
                                Bu grupta aktif kampanya yok.
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {option.value === 'exclusive' && active ? (
                          <div style={{ border: '1px solid #fecaca', borderRadius: 12, padding: 10, background: '#fff7f7', display: 'grid', gap: 8 }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontWeight: 900, color: '#991b1b' }}>Aktif münhasır kampanyalar</div>
                              <div style={{ fontSize: '.74rem', color: '#7f1d1d', fontWeight: 800 }}>Sıralama: önce küçük öncelik, sonra kampanya adı</div>
                            </div>
                            {activeExclusiveCampaigns.length > 0 ? activeExclusiveCampaigns.slice(0, 6).map(campaign => (
                              <CampaignConflictPeerRow key={campaign.id} campaign={campaign} color="#991b1b" />
                            )) : <div style={{ color: '#64748b', fontSize: '.82rem' }}>Bu kapsamda aktif başka münhasır kampanya bulunamadı.</div>}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: '.74rem', color: '#64748b', lineHeight: 1.5 }}>
                  Liste kapsamı seçili şube, satış kanalı ve müşteri kategorisi kesişimine göre daraltılır; farklı kanaldaki kampanya bu ekranda çakışma adayı sayılmaz.
                </div>
              </div>
            </div>
          ) : null}

          {currentStep === 4 ? (
            <div className="card" style={{ padding: 18, marginBottom: 18, display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gap: 12, borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a' }}>Kampanya Kimliği</div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                    Kampanya adı, kodu, açıklaması, özeti ve görselleri kayıt öncesi son sekmede tamamlanır.
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 12 }}>
                  <FieldStack label="Kampanya Adı">
                    <input className="f-input" value={wizardCampaign.name || ''} onChange={event => updateCampaign({ name: event.target.value })} placeholder="Kampanya adı" />
                  </FieldStack>
                  <FieldStack label="Kampanya Kodu">
                    <input className="f-input" value={wizardCampaign.code || ''} onChange={event => updateCampaign({ code: event.target.value })} placeholder="Kampanya kodu (örn. KM001)" />
                  </FieldStack>
                </div>
                <FieldStack label="Açıklama">
                  <textarea className="f-input" style={{ minHeight: 74 }} value={wizardCampaign.description || ''} onChange={event => updateCampaign({ description: event.target.value })} placeholder="Kampanya açıklaması" />
                </FieldStack>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 12, alignItems: 'start' }}>
                <div style={{ border: '1px solid #dbeafe', borderRadius: 14, padding: 14, background: '#f8fbff', display: 'grid', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: '#1d4ed8' }}>Kampanya Özeti</div>
                    <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                      Bu özet hedef, kapsam, koşul/eylem ve operasyon sekmelerindeki seçimlerden otomatik oluşur.
                    </div>
                  </div>
                  <div style={{ fontSize: '.84rem', color: '#334155', lineHeight: 1.65 }}>
                    {getCampaignSummaryText(wizardCampaign, selectedGoal, customerCategories, salesChannels, summaryContext)}
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff', display: 'grid', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 900, color: '#0f172a' }}>Kampanya Görsel Kütüphanesi</div>
                    <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                      Görseller Railway storage'a yüklenir; kampanya kaydında DB metadata referansı ve geçmiş görsel kütüphanesi saklanır.
                    </div>
                  </div>
                  <div style={{ aspectRatio: '16 / 9', border: '1px dashed #cbd5e1', borderRadius: 12, background: '#f8fafc', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                    {campaignImageUrl ? (
                      <img src={campaignImageUrl} alt={wizardCampaign.name || 'Kampanya görseli'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:6px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.6rem;color:#cbd5e1"></i><span style="font-size:.72rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '.82rem', textAlign: 'center', padding: 16 }}>
                        Henüz kampanya görseli yüklenmedi.
                      </div>
                    )}
                  </div>
                  <FieldStack label="Yeni Görsel URL">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                      <input
                        className="f-input"
                        defaultValue=""
                        placeholder="Railway storage / CDN URL"
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            addCampaignImageUrl(event.currentTarget.value)
                            event.currentTarget.value = ''
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn-o"
                        onClick={event => {
                          const input = event.currentTarget.parentElement?.querySelector('input')
                          addCampaignImageUrl(input?.value || '')
                          if (input) input.value = ''
                        }}
                      >
                        URL Ekle
                      </button>
                    </div>
                  </FieldStack>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="btn-o" style={{ margin: 0, cursor: campaignImageUploading ? 'not-allowed' : 'pointer' }}>
                      <i className={`fa-solid ${campaignImageUploading ? 'fa-spinner fa-spin' : 'fa-upload'}`} style={{ marginRight: 6 }} />
                      {campaignImageUploading ? 'Yükleniyor' : 'Görsel Yükle'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={campaignImageUploading}
                        style={{ display: 'none' }}
                        onChange={event => uploadCampaignImage(event.target.files?.[0])}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ fontSize: '.76rem', fontWeight: 900, color: '#64748b' }}>
                      Kütüphane ({campaignImages.length})
                    </div>
                    {campaignImages.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(124px, 1fr))', gap: 8 }}>
                        {campaignImages.map(image => (
                          <div key={image.id} style={{ border: `1px solid ${image.isPrimary ? '#2563eb' : '#e2e8f0'}`, borderRadius: 12, overflow: 'hidden', background: '#fff', display: 'grid' }}>
                            <button type="button" onClick={() => setPrimaryCampaignImage(image.id)} style={{ border: 'none', padding: 0, background: '#fff', cursor: 'pointer', aspectRatio: '16 / 9', overflow: 'hidden' }}>
                              <img src={resolveImageUrl(image.url)} alt={image.title || 'Kampanya görseli'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={e => { e.currentTarget.style.display = 'none'; const p = e.currentTarget.parentElement; if (p) { const ph = document.createElement('div'); ph.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;gap:4px;'; ph.innerHTML = '<i class="fa-solid fa-image" style="font-size:1.2rem;color:#cbd5e1"></i><span style="font-size:.6rem;color:#94a3b8;font-weight:600">Yüklenemedi</span>'; p.appendChild(ph); } }} />
                            </button>
                            <div style={{ padding: 8, display: 'grid', gap: 6 }}>
                              <div style={{ fontSize: '.72rem', color: image.isPrimary ? '#1d4ed8' : '#64748b', fontWeight: 900 }}>
                                {image.isPrimary ? 'Ana görsel' : 'Arşiv görseli'}
                              </div>
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {!image.isPrimary ? (
                                  <button type="button" className="btn-o" style={{ padding: '5px 8px', fontSize: '.72rem' }} onClick={() => setPrimaryCampaignImage(image.id)}>Ana Yap</button>
                                ) : null}
                                <button type="button" className="btn-g" style={{ padding: '5px 8px', fontSize: '.72rem' }} onClick={() => removeCampaignImage(image.id)}>Kaldır</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 12, color: '#94a3b8', fontSize: '.82rem' }}>
                        Bu kampanya için henüz görsel kütüphanesi yok.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#f8fafc', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 900, color: '#0f172a' }}>Kayıt Öncesi Kontrol</div>
                    <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>
                      Kayıt, loyalty workspace persistence akışı üzerinden yapılır; editorRuleDrafts round-trip korunur.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <MiniBadge active={(reviewRuntimeCampaign.applicableRules || []).length > 0} trueLabel={`${reviewRuntimeCampaign.applicableRules.length} sipariş kuralı`} falseLabel="Sipariş kuralı yok" />
                  <MiniBadge active={(reviewRuntimeCampaign.periodicRules || []).length > 0} trueLabel={`${reviewRuntimeCampaign.periodicRules.length} periyodik kural`} falseLabel="Periyodik kural yok" />
                    <MiniBadge active={schemaReady} trueLabel="Kayda hazır" falseLabel="Workspace hazır değil" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Kampanya: <strong>{wizardCampaign.name || 'Adsız kampanya'}</strong></div>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Kod: <strong>{wizardCampaign.code || 'Kod girilmedi'}</strong></div>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Hedef kitle: <strong>{getOptionLabel(CAMPAIGN_AUDIENCE_OPTIONS, wizardCampaign.audienceType)}</strong></div>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Uygulama modu: <strong>{getOptionLabel(CAMPAIGN_APPLICATION_MODE_OPTIONS, wizardCampaign.applicationMode)}</strong></div>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Kanallar: <strong>{(wizardCampaign.channelTargets || []).length > 0 ? formatCompactList((wizardCampaign.channelTargets || []).map(value => getOptionLabel(CAMPAIGN_CHANNEL_OPTIONS, value, value))) : 'Tüm kanallar'}</strong></div>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Çakışma modu: <strong>{getOptionLabel(STACKING_RULE_OPTIONS, mergeMode, mergeMode)}</strong></div>
                  <div style={{ fontSize: '.82rem', color: '#334155' }}>Öncelik: <strong>{wizardCampaign.priority}</strong></div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-o" onClick={openCampaignTaskCreate}>
                    <i className="fa-solid fa-list-check" style={{ marginRight: 6 }} />
                    Görev Oluştur
                  </button>
                  <button type="button" className="btn-o" onClick={() => toast('Duyuru modülü hazır olduğunda bu buton kampanya duyurusu oluşturma akışına bağlanacak.', 'info')}>
                    <i className="fa-solid fa-bullhorn" style={{ marginRight: 6 }} />
                    Duyuru Oluştur
                  </button>
                </div>
                <div style={{ color: '#64748b', fontSize: '.78rem', lineHeight: 1.5 }}>
                  Görev oluşturma akışı kampanya adını görev tanımına taşır; görev kaydedilince wizard ekranına dönülür.
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {activeStackingHelp ? (
        <EditorModal
          title={activeStackingHelp.title}
          subtitle="Çakışma ve birleşme kuralı yardım ekranı"
          onClose={() => setStackingHelpKey(null)}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <HelperNote title="Çalışma mantığı">
              {activeStackingHelp.summary}
            </HelperNote>
            <div style={{ border: '1px solid #dbeafe', background: '#f8fbff', borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
              <div style={{ fontSize: '.76rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>Örnek senaryolar</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {activeStackingHelp.examples.map((example, index) => (
                  <div key={example} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, fontSize: '.84rem', color: '#475569', lineHeight: 1.55 }}>
                    <strong style={{ color: '#1d4ed8' }}>{index + 1}.</strong>
                    <span>{example.replaceAll('`', '')}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: '.84rem', color: '#475569', lineHeight: 1.6 }}>
              <div><strong style={{ color: '#0f172a' }}>Kullanım:</strong> {activeStackingHelp.usage}</div>
              <div><strong style={{ color: '#0f172a' }}>Öncelik:</strong> {activeStackingHelp.priority}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-p" type="button" onClick={() => setStackingHelpKey(null)}>Tamam</button>
            </div>
          </div>
        </EditorModal>
      ) : null}

      {conflictGroupModalOpen ? (
        <EditorModal
          title="Yeni Çakışma Grubu"
          subtitle="Grup DB'ye kaydedilir ve bu kampanya seçilen gruba dahil edilir."
          onClose={() => {
            if (!conflictGroupSaving) setConflictGroupModalOpen(false)
          }}
        >
          <div style={{ display: 'grid', gap: 12 }}>
            <FieldStack label="Grup adı">
              <input
                className="f-input"
                value={conflictGroupDraft.name}
                onChange={event => setConflictGroupDraft(current => ({ ...current, name: event.target.value }))}
                placeholder="Örn. burger indirimleri"
                autoFocus
              />
            </FieldStack>
            <FieldStack label="Açıklama">
              <textarea
                className="f-input"
                style={{ minHeight: 78 }}
                value={conflictGroupDraft.description}
                onChange={event => setConflictGroupDraft(current => ({ ...current, description: event.target.value }))}
                placeholder="Bu grup hangi kampanyaları birbiriyle yarıştırır?"
              />
            </FieldStack>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn-o" type="button" disabled={conflictGroupSaving} onClick={() => setConflictGroupModalOpen(false)}>Vazgeç</button>
              <button className="btn-p" type="button" disabled={conflictGroupSaving} onClick={saveConflictGroup}>
                {conflictGroupSaving
                  ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor</>
                  : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />Grubu Kaydet</>}
              </button>
            </div>
          </div>
        </EditorModal>
      ) : null}

      {showNewTemplateModal ? (
        <NewTemplateModal
          saleItems={saleItems}
          onClose={() => setShowNewTemplateModal(false)}
          onSave={(newTemplate) => {
            const newNormalized = {
              id: String(newTemplate.id),
              name: newTemplate.name || '',
              description: newTemplate.description || '',
              saleIds: Array.isArray(newTemplate.sale_ids) ? newTemplate.sale_ids.map(String) : [],
            }
            setSaleTemplates(current => [...current, newNormalized])
            setShowNewTemplateModal(false)
          }}
        />
      ) : null}

      {ruleEditorState && activeRuleEditorRule && activeRuleEditorItem ? (
        <EditorModal
          title={ruleEditorState.mode === 'actions' ? 'Eylemi Düzenle' : 'Koşulu Düzenle'}
          subtitle={ruleEditorState.scope === 'periodic' ? 'Zaman bazlı akışa bağlı blok' : 'Sipariş anında çalışan blok'}
          onClose={closeRuleEditor}
        >
          {ruleEditorState.mode === 'actions' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
                <FieldStack label="Eylem tipi">
                  <div className="sel-wrap">
                    <select
                      className="f-input"
                      value={
                        activeRuleEditorItem.actionType === 'remove_customer_tag'
                          ? 'add_customer_tag'
                          : activeRuleEditorItem.actionType === 'points_percent_of_order'
                          ? 'bonus_points'
                          : activeRuleEditorItem.actionType
                      }
                      onChange={event => updateActionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'actionType', event.target.value)}
                    >
                      {ACTION_TYPE_OPTIONS.filter(option => option.value !== 'remove_customer_tag' && option.value !== 'points_percent_of_order').map(option => {
                        return <option key={option.value} value={option.value}>{option.label}</option>
                      })}
                    </select>
                  </div>
                </FieldStack>
                <FieldStack label="Kısa özet">
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
                }, ruleEditorState.scope, patch => patchActionItemConfig(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, patch), newType => updateActionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'actionType', newType))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end' }}>
                <FieldStack label="Koşul tipi">
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="sel-wrap">
                      <select
                        className="f-input"
                        value={activeRuleEditorItem.conditionKey}
                        onChange={event => updateConditionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, 'conditionKey', event.target.value)}
                      >
                        {CONDITION_LIBRARY.map(option => {
                          return <option key={option.key} value={option.key}>{option.label}</option>
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

      {activeMode === 'create' && (
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
              ? 'Workspace hazır olmadan kaydetme kapalı kalır.'
              : null}
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
                  : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />Kaydet ve Editöre Git</>}
              </button>
            )}
          </div>
        </div>
      )}

      {activeMode === 'edit' && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 6,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '14px 16px',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          background: 'rgba(255,255,255,0.96)',
          boxShadow: '0 -8px 24px rgba(15,23,42,0.08)',
          backdropFilter: 'blur(6px)',
          marginBottom: 18,
          marginTop: 18,
        }}>
          <button className="btn-o" type="button" onClick={() => navigate(`/sadakat/kampanya/${wizardCampaign.id}/gor`)}>
            İptal
          </button>
          <button className="btn-p" type="button" onClick={handleSave} disabled={saving || loading || databaseUnavailable || !schemaReady}>
            {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
          </button>
        </div>
      )}
    </div>
  )
}

function NewTemplateModal({ saleItems, onClose, onSave }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [saving, setSaving] = useState(false)

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return saleItems
    return saleItems.filter(item => (item.name || '').toLowerCase().includes(query))
  }, [saleItems, search])

  const toggleSelect = id => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) {
      alert('Lütfen şablon adı girin')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await db.from('sale_templates').insert({
        name: name.trim(),
        description: description.trim(),
        sale_ids: Array.from(selectedIds),
      }).select('*').single()

      if (error) throw error
      onSave(data)
    } catch (err) {
      alert(err.message || 'Şablon kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: 'min(640px, 100%)', maxHeight: 'calc(100vh - 48px)', overflow: 'hidden', padding: 0, boxShadow: '0 24px 60px rgba(15,23,42,.24)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, color: '#0f172a' }}>Yeni Satış Şablonu Oluştur</div>
            <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 2 }}>Bu şablonu kampanyalarda filtre olarak kullanabilirsiniz</div>
          </div>
          <button className="btn-o" type="button" onClick={onClose}>Kapat</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Şablon Adı *</div>
            <input className="f-input" value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Bowl Şablonu" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Açıklama</div>
            <input className="f-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Şablon hakkında kısa bilgi" style={{ width: '100%' }} />
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b' }}>Şablon İçeriği (Ürünler)</div>
            <input className="f-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ürün ara..." style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 200, overflowY: 'auto', padding: 6, display: 'grid', gap: 4 }}>
              {filteredItems.map(item => (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', background: selectedIds.has(item.id) ? '#f5f3ff' : 'transparent', transition: 'background 0.1s' }}>
                  <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                  <span style={{ fontSize: '.82rem', fontWeight: 600, color: selectedIds.has(item.id) ? '#7c3aed' : '#334155' }}>{item.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn-o" type="button" onClick={onClose} disabled={saving}>Vazgeç</button>
          <button className="btn" type="button" style={{ background: '#7c3aed', color: '#fff' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
