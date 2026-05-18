# Agent Handoff — LoyaltyCampaignWizardPreview.jsx Yeniden Yazımı

**Oluşturulma tarihi:** 2026-05-12  
**Devam eden görev:** `src/components/pages/LoyaltyCampaignWizardPreview.jsx` tamamen yeniden yaz  
**Son adım:** Dosyaları okuma tamamlandı; Write çağrısı yapılmadı.

---

## Görevin Özeti

`LoyaltyCampaignWizardPreview.jsx` dosyasını tamamen yeniden yaz.

**Temel strateji:**
- `LoyaltyManagement.jsx` (6048 satır) içindeki tüm helper fonksiyonları, UI bileşenlerini ve sabit dizileri birebir kopyala.
- Bunları `wizardCampaign` (tek `normalizeCampaign({})` nesnesi) üzerinde çalışacak şekilde uyarla.
- 4 adımlı wizard UI sunumunu oluştur.
- **Başka hiçbir dosyaya dokunma.**

---

## Kaynak Dosyalar (Okunması gerekenler)

| Dosya | Satır | Amaç |
|---|---|---|
| `src/components/pages/LoyaltyManagement.jsx` | 1–6048 | Tüm kodu buradan al |
| `src/components/pages/LoyaltyCampaignWizardPreview.jsx` | 1–1289 | Mevcut wizard — GOALS, STEPS, AUDIENCE_DEFS, CHANNEL_DEFS, WINDOW_DEFS, STACK_MODES, SummaryPanel buradan alınır |
| `src/lib/loyalty.js` | tümü | Import edilecek export'lar |
| `OperationSync.md` | son 80 satır | Entry 043 son kayıt, Entry 044 eklenecek |

---

## Yeni Dosyanın Yapısı (Sırayla)

### 1. Import Bloğu

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  DEFAULT_LOYALTY_PROGRAM,
  PERIOD_OPTIONS,
  formatDateTimeInput,
  getDefaultActionConfig,
  getDefaultConditionConfig,
  getLoyaltyScopeInfo,
  getSalesChannelConditionValues,
  loadLoyaltyCustomerCategoryAudience,
  loadLoyaltyWorkspace,
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
```

### 2. Palette + STEPS + GOALS + AUDIENCE_DEFS + CHANNEL_DEFS + WINDOW_DEFS + STACK_MODES

**Kaynağı:** Mevcut `LoyaltyCampaignWizardPreview.jsx` satır 17–185 — aynısını kopyala.

GOALS dizisi (mevcut dosyada satır 43–87, DOĞRU VERSİYON):
```js
const GOALS = [
  { v: 'new_customer', icon: 'ti-user-plus', label: 'Yeni müşteri kazan', desc: '...', recConds: ['days_since_first_activity', 'customer_lacks_tag', 'referral_source', 'always'], recActs: ['issue_coupon', 'bonus_points', 'add_customer_tag', 'send_sms'] },
  { v: 'basket', icon: 'ti-shopping-cart-up', label: 'Satış ortalamasını artır', desc: '...', recConds: ['order_total', 'order_item_quantity', 'missing_products', 'always'], recActs: ['total_order_discount_percent', 'order_discount_amount', 'free_products', 'combo_bundle', 'suggest_products', 'warning_message'] },
  { v: 'frequency', icon: 'ti-repeat', label: 'Ziyaret sıklığını artır', desc: '...', recConds: ['last_visit_days', 'period_order_count', 'period_total_order_amount', 'customer_has_tag'], recActs: ['bonus_points', 'issue_coupon', 'add_customer_tag', 'send_sms'] },
  { v: 'loyalty', icon: 'ti-star', label: 'Sadakat üyesine değer kat', desc: '...', recConds: ['birthday', 'customer_has_tag', 'period_total_order_amount', 'coupon_present', 'gift_card_series'], recActs: ['bonus_points', 'points_earn_multiplier', 'issue_coupon', 'add_customer_tag', 'remove_customer_tag', 'write_customer_note'] },
  { v: 'event', icon: 'ti-clock-hour-4', label: 'Özel zaman / etkinlik', desc: '...', recConds: ['happy_hour', 'calendar_schedule', 'period_sold_product_quantity'], recActs: ['total_order_discount_percent', 'order_discount_amount', 'points_earn_multiplier', 'warning_message', 'suggest_products'] },
  { v: 'stamp', icon: 'ti-rosette', label: 'Damga kartı', desc: '...', recConds: ['period_order_count', 'period_product_quantity', 'period_total_order_amount'], recActs: ['free_products', 'issue_coupon', 'bonus_points'], isStamp: true },
]
```

### 3. LoyaltyManagement.jsx'ten Kopyalanacak Tüm Kodlar

#### 3a. Yardımcı Fonksiyonlar (Dosya seviyesi — component dışı)

LoyaltyManagement.jsx'ten satır numaralarıyla kopyala:

| Kod | Satır | Not |
|---|---|---|
| `createId` | 41–43 | Aynen kopyala |
| `loyaltyWorkspaceSessionCache` + `loyaltyWorkspaceSessionStoragePrefix` | 45–46 | Aynen kopyala |
| `buildLoyaltyWorkspaceCacheKey` | 48–51 | Aynen kopyala |
| `wait` | 53–55 | Aynen kopyala |
| `readWorkspaceSessionSnapshot` | 57–67 | Aynen kopyala |
| `writeWorkspaceSessionSnapshot` | 69–79 | Aynen kopyala |
| `loadLoyaltyWorkspaceWithRetry` | 81–124 | Aynen kopyala |
| `FieldStack` | 148–156 | Aynen kopyala |
| `HelperNote` | 158–178 | Aynen kopyala |
| `MiniBadge` | 180–194 | Aynen kopyala |
| `STACKING_RULE_OPTIONS` | 196–200 | Aynen kopyala |
| `STACKING_RULE_DETAILS` | 202–236 | Aynen kopyala |
| `getCampaignMergeMode` | 238–240 | Aynen kopyala |
| `ChannelMultiSelect` | 242–303 | Aynen kopyala |
| `channelActive` | 305–307 | Aynen kopyala |
| `getOptionLabel` | 309–311 | Aynen kopyala |
| `getCampaignApplicationModeHint` | 313–317 | Aynen kopyala |
| `getConditionMeta` | 319–321 | Aynen kopyala |
| `formatSummaryDate` | 323–336 | Aynen kopyala |
| `getChannelLabel` | 338–342 | Aynen kopyala |
| `formatCompactList` | 344–349 | Aynen kopyala |
| `getCatalogFilterTypeMeta` | 351–353 | Aynen kopyala |
| `formatMaskLabel` | 355–359 | Aynen kopyala |
| `formatProductMaskSummary` | 361–363 | Aynen kopyala |
| `formatApplyToSummary` | 365–374 | Aynen kopyala |
| `formatQuantityCountingMode` | 376–380 | Aynen kopyala |
| `formatWeekdaySummary` | 382–387 | Aynen kopyala (WEEKDAY_OPTIONS'dan önce kullanır — dikkat sıraya) |
| `formatHappyHourSummary` | 389–395 | Aynen kopyala |
| `formatCalendarScheduleSummary` | 397–413 | Aynen kopyala |
| `formatAmount` | 415–422 | Aynen kopyala |
| `formatPlainNumber` | 424–431 | Aynen kopyala |
| `formatNumberInputValue` | 433–446 | Aynen kopyala |
| `formatPeriodWindow` | 448–451 | Aynen kopyala |
| `formatCurrentOrderInclusion` | 453–455 | Aynen kopyala |
| `formatMessageSnippet` | 457–461 | Aynen kopyala |
| `TEMPLATE_MODEL_FIELDS` | 463–473 | Aynen kopyala |
| `renderTemplateText` | 475–479 | Aynen kopyala |
| `wrapPreviewLine` | 481–497 | Aynen kopyala (devamı sonraki satırlarda) |

LoyaltyManagement.jsx'te ~500-630 arası devam eden fonksiyonlar:
- `formatTemplatePreview` (~520–530)
- `createRuleSummaryContext` (~532–560)
- `getMappedLabels` (~562–575)
- `parseMaybeArray` (~577–580)
- `sanitizeBranchSelections` (~582–595)
- `formatComparisonNatural` (~597–610)
- `formatBirthdayWindow` (~612–620)
- `formatSalesChannelSelections` (~622–630)

Devam (~632–2034):
- `SearchableMultiSelect` component (~632–920) — aynen kopyala
- `ProductSingleSelect` component (~922–1241) — aynen kopyala
- `CatalogMaskSelect` component (~1242–1699) — aynen kopyala
- `buildConditionSummary`, `buildActionSummary`, `buildRuleSummary`, `buildRuleConditionText` (~1700–1800) — aynen kopyala
- `buildAudienceSummary`, `usesLegacyCategoryAudience`, `hasMatchingCategoryFilter`, `hasRuleLevelCategoryCondition`, `buildConditionScenarioText` (~1800–1935) — aynen kopyala
- Tüm sabitler: `WEEKDAY_OPTIONS`, `MONTH_OPTIONS`, `CALENDAR_FREQUENCY_OPTIONS`, `CALENDAR_DAY_OPTIONS`, `TIMEZONE_OPTIONS`, `CATALOG_FILTER_TYPE_META`, `MASK_TYPE_OPTIONS`, `PRICING_TARGET_OPTIONS`, `CUSTOMER_TARGET_OPTIONS`, `GIFT_CARD_MODE_OPTIONS`, `PRICING_APPLY_OPTIONS`, `PRICING_TYPE_OPTIONS`, `COMBO_PRICE_MODE_OPTIONS` (~1937–2034) — aynen kopyala
- `getEditorRuleConditions`, `getStandaloneConditionConfig`, `getStandaloneActionConfig`, `getEditorRuleActions`, `getEditorRuleConditionSummaries`, `getEditorRuleActionSummaries` (~2035–2103) — aynen kopyala
- Runtime status sabitleri + `RuntimeStatusBadge` + `RuntimeStatusNote` (~2105–2197) — aynen kopyala
- `RuleRow` component (~2199–2378) — aynen kopyala
- `createEditorRuleDraft`, `hydrateEditorRuleFromDraft`, `hydrateCampaignForEditor`, `materializeRuleForRuntime`, `serializeCampaignForPersistence` (~2380–2501) — aynen kopyala
- `EditorModal` component (2503–2520) — aynen kopyala
- `safeMapWithDiagnostics` (~2658–2674) — aynen kopyala

LoyaltyManagement.jsx'te `renderConditionDetails` fonksiyonu:
- Satır ~3993–4508 — aynen kopyala
- **ÖNEMLİ UYARLAMA:** Bu fonksiyon `selectedCampaign.id` ve `patchRuleConditionConfig(selectedCampaign.id, ...)` kullanıyor. Sihirbazda şöyle değiştir:
  ```js
  // Orjinal (LoyaltyManagement):
  const patchCondition = options.onPatch || (patch => patchRuleConditionConfig(selectedCampaign.id, scope, rule.id, patch))
  // Sihirbazda:
  const patchCondition = options.onPatch || (patch => patchWizardRuleConditionConfig(scope, rule.id, patch))
  ```

LoyaltyManagement.jsx'te `renderActionDetails` fonksiyonu:
- Satır ~4510–5121 — aynen kopyala
- **ÖNEMLİ UYARLAMA:** `templatePreviewValues` içindeki `campaign_name`:
  ```js
  // Orjinal:
  const templatePreviewValues = { campaign_name: selectedCampaign?.name || '...', ... }
  // Sihirbazda:
  const templatePreviewValues = { campaign_name: wizardCampaign?.name || 'Örnek Kampanya', ... }
  ```
- `patchRuleActionConfig` çağrılarını şöyle değiştir:
  ```js
  // Orjinal:
  const patchAction = onPatchOverride || (patch => patchRuleActionConfig(selectedCampaign.id, scope, rule.id, patch))
  // Sihirbazda:
  const patchAction = onPatchOverride || (patch => patchWizardRuleActionConfig(scope, rule.id, patch))
  ```
- `campaign_triggered` koşulu: `campaigns.filter(item => item.id !== selectedCampaign?.id)` → sadece `campaigns` kullan (wizardCampaign henüz kampanyalar listesinde yok).

---

### 4. Ana Bileşen: `export default function LoyaltyCampaignWizardPreview()`

#### 4a. State Tanımları

```jsx
const navigate = useNavigate()
const workspace = useWorkspace()
const toast = useToast()

// LoyaltyManagement'tan kopyalanan state:
const [loading, setLoading] = useState(true)
const [saving, setSaving] = useState(false)
const [program, setProgram] = useState(normalizeProgram(DEFAULT_LOYALTY_PROGRAM))
const [tiers, setTiers] = useState([])
const [campaigns, setCampaigns] = useState([])
const [customerCategories, setCustomerCategories] = useState([])
const [couponSeries, setCouponSeries] = useState([])
const [salesChannels, setSalesChannels] = useState(CAMPAIGN_CHANNEL_OPTIONS.map(o => ({ value: o.value, label: o.label })))
const [saleItems, setSaleItems] = useState([])
const [saleCategories, setSaleCategories] = useState([])
const [saleTemplates, setSaleTemplates] = useState([])
const [branchTemplates, setBranchTemplates] = useState([])
const [schemaReady, setSchemaReady] = useState(false)
const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
const [ruleEditorState, setRuleEditorState] = useState(null)
const [scopeInfo, setScopeInfo] = useState(null)
const [customerInsights, setCustomerInsights] = useState({ totalCustomers: 0, reachableCustomers: 0, loyaltyMembers: 0, birthdayKnown: 0, consentReady: 0, mobileLinked: 0 })

// Sihirbaza özgü state:
const [step, setStep] = useState(0)
const [wizardGoal, setWizardGoal] = useState('')
const [wizardCampaign, setWizardCampaign] = useState(null)
const [windowMode, setWindowMode] = useState('always')
const [advancedOpen, setAdvancedOpen] = useState(false)
```

#### 4b. workspaceCacheKey useMemo

```jsx
const workspaceCacheKey = useMemo(
  () => buildLoyaltyWorkspaceCacheKey({ scope: workspace.scope, branchId: workspace.branchId, branchName: workspace.branchName }),
  [workspace.scope, workspace.branchId, workspace.branchName],
)
```

#### 4c. useEffect — Veri Yükleme

LoyaltyManagement.jsx satır 2745–2959'daki `load()` fonksiyonunu kopyala, şu değişiklikle:
- `setSelectedCampaignId` yok → kampanya seçimi yok
- `setCampaigns(campaignHydration.results)` korunur (summaryContext için)
- Yükleme sonunda `wizardCampaign`'i başlat:

```jsx
// useEffect içinde, load() fonksiyonunun sonunda:
setWizardCampaign(normalizeCampaign({
  id: createId('campaign'),
  programId: safeProgram.id,
  name: '',
  audienceType: 'all',
  channelTargets: [],
  applicableRules: [],
  periodicRules: [],
}, 0))
```

Ayrıca yardımcı DB sorguları (LoyaltyManagement satır ~2850–2959):
```jsx
const [channelResult, itemResult, categoryResult, templateResult, branchTemplateResult] = await Promise.allSettled([
  db.from('sales_channels').select('id, name, channel_type').is('deleted_at', null).order('name'),
  db.from('sale_items').select('id, name, category_id').is('deleted_at', null).order('name'),
  db.from('sale_categories').select('id, name').is('deleted_at', null).order('name'),
  db.from('sale_templates').select('id, name').is('deleted_at', null).order('name'),
  db.from('branch_templates').select('id, name').is('deleted_at', null).order('name'),
])
// Her biri null/[] fallback ile setSalesChannels, setSaleItems, setSaleCategories, setSaleTemplates, setBranchTemplates
```

#### 4d. Update Fonksiyonları (wizardCampaign üzerinde çalışacak — campaignId parametresi YOK)

Tüm fonksiyonlar LoyaltyManagement.jsx'teki versiyonların uyarlamaları. `setCampaigns(current => current.map(c => c.id === campaignId ? ... : c))` yerine `setWizardCampaign(current => ...)` kullanılıyor.

```jsx
function updateCampaign(field, value) {
  setWizardCampaign(c => normalizeCampaign({ ...c, [field]: value, programId: program.id }, 0))
}

function addRule(scope) {
  const nextRuleId = createId('rule')
  const nextConditionKey = scope === 'periodic' ? 'calendar_schedule' : 'birthday'
  setWizardCampaign(current => {
    const key = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    const nextRules = [
      ...(current[key] || []),
      normalizeRule({
        id: nextRuleId, scope, conditionKey: nextConditionKey,
        actionType: 'bonus_points', actionSummary: '', active: true, stopProcessing: false,
        sortOrder: ((current[key] || []).length + 1) * 10,
        conditionConfig: { ...getDefaultConditionConfig(nextConditionKey), additionalConditions: [], __draftEmptyCondition: true },
        actionConfig: { ...getDefaultActionConfig('bonus_points'), additionalActions: [], __draftEmptyAction: true },
      }, (current[key] || []).length, scope),
    ]
    return normalizeCampaign({ ...current, [key]: nextRules, programId: program.id }, 0)
  })
}

function removeRule(scope, ruleId) {
  setWizardCampaign(current => {
    const key = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    return normalizeCampaign({ ...current, [key]: (current[key] || []).filter(r => r.id !== ruleId), programId: program.id }, 0)
  })
}

function updateRule(scope, ruleId, key, value) {
  setWizardCampaign(current => {
    const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    const nextRules = (current[ruleKey] || []).map((rule, idx) => (
      rule.id === ruleId
        ? normalizeRule({ ...rule, [key]: value, conditionConfig: key === 'conditionKey' ? getDefaultConditionConfig(value) : rule.conditionConfig, actionConfig: key === 'actionType' ? getDefaultActionConfig(value) : rule.actionConfig, scope }, idx, scope)
        : rule
    ))
    return normalizeCampaign({ ...current, [ruleKey]: nextRules, programId: program.id }, 0)
  })
}

function addConditionToRule(scope, ruleId, conditionKey = scope === 'periodic' ? 'calendar_schedule' : 'birthday') {
  setWizardCampaign(current => {
    const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    const nextRules = (current[ruleKey] || []).map((rule, ruleIndex) => {
      if (rule.id !== ruleId) return rule
      const currentConfig = rule.conditionConfig || {}
      if (currentConfig.__draftEmptyCondition) {
        return normalizeRule({ ...rule, conditionKey, conditionConfig: { ...getDefaultConditionConfig(conditionKey), additionalConditions: Array.isArray(currentConfig.additionalConditions) ? currentConfig.additionalConditions : [], __draftEmptyCondition: false }, scope }, ruleIndex, scope)
      }
      return normalizeRule({ ...rule, conditionConfig: { ...currentConfig, additionalConditions: [...(Array.isArray(currentConfig.additionalConditions) ? currentConfig.additionalConditions : []), { id: createId('subcondition'), conditionKey, config: getDefaultConditionConfig(conditionKey) }] }, scope }, ruleIndex, scope)
    })
    return normalizeCampaign({ ...current, [ruleKey]: nextRules, programId: program.id }, 0)
  })
}

function addActionToRule(scope, ruleId, actionType = 'bonus_points') {
  setWizardCampaign(current => {
    const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    const nextRules = (current[ruleKey] || []).map((rule, ruleIndex) => {
      if (rule.id !== ruleId) return rule
      const currentConfig = rule.actionConfig || {}
      if (currentConfig.__draftEmptyAction) {
        return normalizeRule({ ...rule, actionType, actionSummary: '', actionConfig: { ...getDefaultActionConfig(actionType), additionalActions: Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : [], __draftEmptyAction: false }, scope }, ruleIndex, scope)
      }
      return normalizeRule({ ...rule, actionConfig: { ...currentConfig, additionalActions: [...(Array.isArray(currentConfig.additionalActions) ? currentConfig.additionalActions : []), { id: createId('extra-action'), actionType, actionSummary: '', actionConfig: getDefaultActionConfig(actionType) }] }, scope }, ruleIndex, scope)
    })
    return normalizeCampaign({ ...current, [ruleKey]: nextRules, programId: program.id }, 0)
  })
}

function removeConditionFromRule(scope, ruleId, conditionId) {
  // LoyaltyManagement satır 3609–3651 mantığını kopyala, setCampaigns → setWizardCampaign(current => {...})
  // campaignId parametresi yok — direkt current üzerinde işlem
}

function removeActionFromRule(scope, ruleId, actionId) {
  // LoyaltyManagement satır 3653–3697 mantığını kopyala, aynı uyarlama
}

function updateConditionItem(scope, ruleId, conditionId, key, value) {
  // LoyaltyManagement satır 3718–3753, aynı uyarlama
}

function patchWizardRuleConditionConfig(scope, ruleId, patch) {
  // LoyaltyManagement patchRuleConditionConfig satır 3755–3768, aynı uyarlama
  setWizardCampaign(current => {
    const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    const nextRules = (current[ruleKey] || []).map((rule, ruleIndex) => {
      if (rule.id !== ruleId) return rule
      const nextConfig = typeof patch === 'function' ? patch(rule.conditionConfig || {}) : { ...(rule.conditionConfig || {}), ...patch }
      return normalizeRule({ ...rule, conditionConfig: nextConfig, scope }, ruleIndex, scope)
    })
    return normalizeCampaign({ ...current, [ruleKey]: nextRules, programId: program.id }, 0)
  })
}

function patchConditionItemConfig(scope, ruleId, conditionId, patch) {
  // LoyaltyManagement satır 3770–3796, aynı uyarlama
}

function patchWizardRuleActionConfig(scope, ruleId, patch) {
  // LoyaltyManagement patchRuleActionConfig satır 3798–3811, aynı uyarlama
  setWizardCampaign(current => {
    const ruleKey = scope === 'periodic' ? 'periodicRules' : 'applicableRules'
    const nextRules = (current[ruleKey] || []).map((rule, ruleIndex) => {
      if (rule.id !== ruleId) return rule
      const nextConfig = typeof patch === 'function' ? patch(rule.actionConfig || {}) : { ...(rule.actionConfig || {}), ...patch }
      return normalizeRule({ ...rule, actionConfig: nextConfig, scope }, ruleIndex, scope)
    })
    return normalizeCampaign({ ...current, [ruleKey]: nextRules, programId: program.id }, 0)
  })
}

function updateActionItem(scope, ruleId, actionId, key, value) {
  // LoyaltyManagement satır 3813–3849, aynı uyarlama
}

function patchActionItemConfig(scope, ruleId, actionId, patch) {
  // LoyaltyManagement satır 3851–3877, aynı uyarlama
}

function updateRuleConditionJoinerMode(scope, ruleId, mode) {
  // LoyaltyManagement satır 3589–3607, aynı uyarlama
}

// createProductMask, createOfferItem, createPricingItem, createComboGroup, createComboGroupItem, createAdditionalCondition
// (satır 3879–3905) — aynen kopyala (campaign/setCampaigns referansı yok, sadece yeni nesne döner)

// patchAdditionalConditionConfig — patchRuleConditionConfig yerine patchWizardRuleConditionConfig kullan
function patchAdditionalConditionConfig(scope, ruleId, conditionId, patch) {
  patchWizardRuleConditionConfig(scope, ruleId, config => ({
    ...config,
    additionalConditions: (config.additionalConditions || []).map(condition => {
      if (condition.id !== conditionId) return condition
      const nextConfig = typeof patch === 'function' ? patch(condition.config || {}) : { ...(condition.config || {}), ...patch }
      return { ...condition, config: nextConfig }
    }),
  }))
}
```

#### 4e. openRuleEditor / closeRuleEditor (Wizard Versiyonu)

```jsx
function openRuleEditor(mode, scope, ruleId, itemId = null) {
  if (!ruleId) return
  setRuleEditorState({ scope, ruleId, itemId: itemId || ruleId, mode })
}

function closeRuleEditor() {
  setRuleEditorState(null)
}
```

#### 4f. useMemo'lar

```jsx
const activeRuleEditorRule = useMemo(() => {
  if (!ruleEditorState?.ruleId || !wizardCampaign) return null
  const key = ruleEditorState.scope === 'periodic' ? 'periodicRules' : 'applicableRules'
  return (wizardCampaign[key] || []).find(r => r.id === ruleEditorState.ruleId) || null
}, [wizardCampaign, ruleEditorState])

const activeRuleEditorItem = useMemo(() => {
  if (!activeRuleEditorRule || !ruleEditorState?.itemId) return null
  if (ruleEditorState.mode === 'actions') {
    return getEditorRuleActions(activeRuleEditorRule).find(a => a.id === ruleEditorState.itemId) || null
  }
  return getEditorRuleConditions(activeRuleEditorRule).find(c => c.id === ruleEditorState.itemId) || null
}, [activeRuleEditorRule, ruleEditorState])

const summaryContext = useMemo(() => ({
  campaigns,
  couponSeries,
  customerCategories,
  saleItems,
  salesChannels,
}), [campaigns, couponSeries, customerCategories, saleItems, salesChannels])

const activeCustomerCategories = useMemo(
  () => customerCategories.filter(c => c.active !== false),
  [customerCategories],
)
```

#### 4g. renderCustomerCategoryGuide + renderProductMasksEditor

LoyaltyManagement satır 3920–3991'i kopyala:
- `patchRuleConditionConfig(selectedCampaign.id, ...)` → `patchWizardRuleConditionConfig(...)`
- `selectedCampaign` referansları kaldır

#### 4h. renderConditionDetails + renderActionDetails

LoyaltyManagement satır 3993–5121'i kopyala, şu 3 değişiklikle:
1. `patchRuleConditionConfig(selectedCampaign.id, ...)` → `patchWizardRuleConditionConfig(...)`
2. `patchRuleActionConfig(selectedCampaign.id, ...)` → `patchWizardRuleActionConfig(...)`
3. `selectedCampaign?.name` → `wizardCampaign?.name`
4. `campaigns.filter(item => item.id !== selectedCampaign?.id)` → `campaigns` (sadece var olan kampanyalar)

#### 4i. handleSave (Bölüm 3'ten)

```jsx
async function handleSave() {
  setSaving(true)
  try {
    const workspacePayload = { scope: workspace.scope, branchId: workspace.branchId, branchName: workspace.branchName }
    const result = await loadLoyaltyWorkspaceWithRetry(workspacePayload)
    const safeProgram = normalizeProgram(result.program || DEFAULT_LOYALTY_PROGRAM)
    const existingCampaigns = (result.campaigns || []).map(c => serializeCampaignForPersistence(c, safeProgram.id))
    const newCampaign = serializeCampaignForPersistence({ ...wizardCampaign, programId: safeProgram.id }, safeProgram.id)
    await saveLoyaltyWorkspace(workspacePayload, {
      program: safeProgram,
      tiers: result.tiers || [],
      campaigns: [...existingCampaigns, newCampaign],
      couponSeries: result.couponSeries || [],
    })
    toast('Kampanya kaydedildi', 'success')
    navigate('/sadakat')
  } catch (err) {
    toast(err?.message || 'Kayıt sırasında hata oluştu', 'error')
  } finally {
    setSaving(false)
  }
}
```

#### 4j. handleSelectGoal (Step 0 kart tıklama)

```jsx
function handleSelectGoal(goalObj) {
  setWizardGoal(goalObj.v)
  setWizardCampaign(prev => ({
    ...(prev || normalizeCampaign({ id: createId('campaign'), programId: program.id }, 0)),
    name: goalObj.label,
    audienceType: 'all',
    channelTargets: [],
    applicableRules: [normalizeRule({
      id: createId('rule'),
      conditionKey: goalObj.recConds[0] || 'always',
      actionType: goalObj.recActs[0] || 'bonus_points',
      conditionConfig: { ...getDefaultConditionConfig(goalObj.recConds[0] || 'always'), additionalConditions: [] },
      actionConfig: { ...getDefaultActionConfig(goalObj.recActs[0] || 'bonus_points'), additionalActions: [] },
    }, 0, 'applicable')],
  }))
}
```

---

### 5. Render Fonksiyonları (Adım UI'ları)

#### renderStep0 — "Ne yapmak istiyorsun?"

Mevcut `LoyaltyCampaignWizardPreview.jsx` satır ~602–680'deki `renderStep0`'ı kopyala, sadece `selectGoal(g.v)` yerine `handleSelectGoal(g)` çağır.

Kart seçim: `goal === g.v` yerine `wizardGoal === g.v`.

#### renderStep1 — "Kime, ne zaman, nerede?"

Mevcut `LoyaltyCampaignWizardPreview.jsx` satır ~680–800'deki `renderStep1`'i kopyala, şu değişiklikle:
- `audience` state → `wizardCampaign?.audienceType`, `updateCampaign('audienceType', v)`
- `channels` state → `wizardCampaign?.channelTargets`, `updateCampaign('channelTargets', ...)`
- `windowMode` state → ayrı kalsın (sihirbaza özgü), ama `startAt/endAt` → `updateCampaign('startsAt', ...)` / `updateCampaign('endsAt', ...)`

#### renderStep2 — "Koşul ve eylem" (YENİ — RuleRow kullanıyor)

```jsx
function renderStep2() {
  const applicableRules = wizardCampaign?.applicableRules || []
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {applicableRules.map(rule => (
        <RuleRow
          key={rule.id}
          rule={rule}
          summaryContext={summaryContext}
          onDelete={() => removeRule('applicable', rule.id)}
          onAddCondition={() => addConditionToRule('applicable', rule.id)}
          onAddAction={() => addActionToRule('applicable', rule.id)}
          onDeleteCondition={conditionId => removeConditionFromRule('applicable', rule.id, conditionId)}
          onDeleteAction={actionId => removeActionFromRule('applicable', rule.id, actionId)}
          onEditCondition={conditionId => openRuleEditor('conditions', 'applicable', rule.id, conditionId)}
          onEditAction={actionId => openRuleEditor('actions', 'applicable', rule.id, actionId)}
          onToggleConditionJoiner={mode => updateRuleConditionJoinerMode('applicable', rule.id, mode)}
        />
      ))}
      <button className="btn-o" type="button" onClick={() => addRule('applicable')}>+ Kural Ekle</button>

      {ruleEditorState && activeRuleEditorRule && activeRuleEditorItem && (
        <EditorModal
          title={ruleEditorState.mode === 'actions' ? 'Eylemi Düzenle' : 'Koşulu Düzenle'}
          subtitle={ruleEditorState.scope === 'periodic' ? 'Zaman bazlı akışa bağlı blok' : 'Sipariş anında çalışan blok'}
          onClose={closeRuleEditor}
        >
          {ruleEditorState.mode === 'actions' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {/* LoyaltyManagement satır 5903–5958 kopyala, selectedCampaign → wizardCampaign, updateActionItem/patchActionItemConfig campaignId kaldır */}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {/* LoyaltyManagement satır 5960–6005 kopyala, aynı uyarlama */}
            </div>
          )}
        </EditorModal>
      )}
    </div>
  )
}
```

EditorModal içindeki kod için LoyaltyManagement.jsx satır 5896–6007'yi kopyala, şu uyarlamalarla:
- `activeRuleEditorCampaign` → `wizardCampaign`
- `updateActionItem(activeRuleEditorCampaign.id, ...)` → `updateActionItem(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, ...)`
- `updateRule(activeRuleEditorCampaign.id, ...)` → `updateRule(ruleEditorState.scope, activeRuleEditorRule.id, ...)`
- `patchActionItemConfig(activeRuleEditorCampaign.id, ...)` → `patchActionItemConfig(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, ...)`
- `patchConditionItemConfig(activeRuleEditorCampaign.id, ...)` → `patchConditionItemConfig(ruleEditorState.scope, activeRuleEditorRule.id, activeRuleEditorItem.id, ...)`
- `buildAudienceSummary(activeRuleEditorCampaign, customerCategories)` → `buildAudienceSummary(wizardCampaign, customerCategories)`

#### renderStep3 — "Özet ve onay"

Mevcut `LoyaltyCampaignWizardPreview.jsx` satır ~900–1099'daki `renderStep3`'ü kopyala, şu değişiklikle:
- `name/setName` → `wizardCampaign?.name || ''`, `updateCampaign('name', v)`
- `description/setDescription` → `wizardCampaign?.description || ''`, `updateCampaign('description', v)`
- `stackMode` → `getCampaignMergeMode(wizardCampaign)`, `updateCampaign('stackable', ...)` / `updateCampaign('exclusionGroup', ...)`
- `priority` → `wizardCampaign?.priority || 10`, `updateCampaign('priority', v)`
- Review bölümünde: koşul/eylem özetleri için `buildConditionScenarioText(rule, summaryContext)` ve `buildActionSummary(rule, summaryContext)` kullan

---

### 6. SummaryPanel + SumSection

Mevcut `LoyaltyCampaignWizardPreview.jsx` satır ~1100–1175'ten kopyala, şu değişiklikle:
- `goal` → `wizardGoal`
- `audience` → `wizardCampaign?.audienceType`
- `channels` → `wizardCampaign?.channelTargets`
- `conditions/actions` → `wizardCampaign?.applicableRules`'dan derive et

---

### 7. Ana Return (Wizard Layout)

```jsx
return (
  <div>
    <Header />
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      {/* Step bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '10px 16px', background: i === step ? C.amber : i < step ? '#ecfdf5' : C.surface2, borderRadius: i === 0 ? '10px 0 0 10px' : i === STEPS.length - 1 ? '0 10px 10px 0' : 0, borderRight: i < STEPS.length - 1 ? `1px solid ${C.border}` : 'none', cursor: i < step ? 'pointer' : 'default' }} onClick={() => i < step && setStep(i)}>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color: i === step ? '#fff' : i < step ? C.success : C.muted }}>{i + 1}. Adım</div>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: i === step ? '#fff' : C.text, marginTop: 2 }}>{s.title}</div>
          </div>
        ))}
      </div>

      {/* İki sütun: sol + sağ özet */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
        <div style={{ width: 300, flexShrink: 0 }}>
          <SummaryPanel ... />
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
        <button className="btn-o" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>Geri</button>
        <div style={{ display: 'flex', gap: 10 }}>
          {step < STEPS.length - 1 ? (
            <button className="btn-p" style={{ background: C.amber }} onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))} disabled={step === 0 && !wizardGoal}>İleri</button>
          ) : (
            <button className="btn-p" style={{ background: C.amber }} onClick={handleSave} disabled={saving || !wizardCampaign?.name?.trim()}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
)
```

---

## OperationSync.md Güncellemesi

Dosyanın sonuna Entry 044 ekle:

```markdown
## Entry 044 — 2026-05-12 LoyaltyCampaignWizardPreview tam yeniden yazım (LoyaltyManagement altyapısıyla)

- `Timestamp`: `2026-05-12`
- `Agent`: `Claude Sonnet 4.6 (Claude Code)`
- `Task`: `LoyaltyCampaignWizardPreview.jsx'i LoyaltyManagement.jsx altyapısıyla 4 adımlı wizard olarak yeniden yaz`
- `Files Read`:
  - `src/components/pages/LoyaltyManagement.jsx` (6048 satır — tüm helper fonksiyonlar, RuleRow, EditorModal, renderConditionDetails, renderActionDetails, tüm update fonksiyonları)
  - `src/components/pages/LoyaltyCampaignWizardPreview.jsx` (1289 satır — eski versiyon)
  - `src/lib/loyalty.js` (export listesi)
  - `OperationSync.md`
- `Files Changed`:
  - `src/components/pages/LoyaltyCampaignWizardPreview.jsx` — tamamen yeniden yazıldı
- `Strategy`:
  - LoyaltyManagement.jsx'teki tüm fonksiyon ve bileşenler kopyalandı
  - Tüm update fonksiyonları `wizardCampaign` state'i üzerinde çalışacak şekilde uyarlandı (campaignId parametresi kaldırıldı)
  - `patchRuleConditionConfig` → `patchWizardRuleConditionConfig`, `patchRuleActionConfig` → `patchWizardRuleActionConfig` olarak yeniden adlandırıldı
  - `renderConditionDetails`/`renderActionDetails`: `selectedCampaign.id` → `wizardCampaign`, patch fonksiyonları wizard versiyonlarına yönlendirildi
  - Step 2: RuleRow + EditorModal tam LoyaltyManagement gücüyle çalışıyor
  - Kayıt: `loadLoyaltyWorkspaceWithRetry` + `serializeCampaignForPersistence` + `saveLoyaltyWorkspace` pattern
- `Handoff Contract`: Dosya yazıldı. Route `/sadakat/kampanya-sihirbazi-onizleme` değişmedi. Diğer dosyalara dokunulmadı.
```

---

## Kısıtlar (Kritik)

1. **LoyaltyManagement.jsx'e DOKUNMA**
2. **App.jsx'e DOKUNMA**
3. **loyalty.js'e DOKUNMA**
4. Sadece `src/components/pages/LoyaltyCampaignWizardPreview.jsx` değiştirilecek
5. `OperationSync.md`'ye Entry 044 eklenecek (başka dosya değil)
6. Türkçe karakterleri bozma
7. Tüm stiller inline style — Tailwind yok

---

## Sıradaki Adımlar

1. `LoyaltyManagement.jsx`'i tam oku (özellikle satır 500–2200 arası büyük fonksiyon bloklarını)
2. `LoyaltyCampaignWizardPreview.jsx`'i tam oku (mevcut wizard yapısını anla)
3. Yeni dosyayı bu handoff'taki yapıya göre yaz (tek Write çağrısı)
4. `OperationSync.md`'ye Entry 044 ekle
