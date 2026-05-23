/**
 * Loyalty Runtime Truth Authority
 *
 * Bu modül loyalty runtime statüsü için tek gerçek kaynaktır.
 * Tüm condition/action kategorileri CONDITION_KEY_STATUS ve ACTION_TYPE_STATUS
 * map'lerinde tanımlanır. Set tabanlı yardımcı export'lar bu map'lerden
 * otomatik olarak türetilir; ikinci bir elle yazılmış truth sistemi yoktur.
 *
 * Kategori anlamları:
 *   local        - POS/Kiosk'ta sunucu çağrısı olmadan yerel olarak çözülür
 *   server       - DB geçmişi, müşteri profili veya kupon için sunucu gerekir
 *   ledger       - loyalty_transactions / wallet tablolarına fiilen yazılır
 *   model        - Şemada/modelde tanımlı, checkout/runtime executor henüz yok
 *   presentation - Yalnızca UI uyarısı/mesajı; iş verisi etkisi tasarlanmamış
 *
 * NOT: points_redeem_multiplier canlı smoke sonrasında aktif executor durumuna alındı.
 * Runtime offer, burn transaction ve redemption kaydı Railway smoke ile doğrulandı.
 */

// ---------------------------------------------------------------------------
// RUNTIME_STATUS_META - Badge görsel stilleri
// ---------------------------------------------------------------------------
export const RUNTIME_STATUS_META = {
  local: {
    label: 'Anında çalışır',
    detail: 'POS/Kiosk bu koşul veya eylemi mevcut sipariş bağlamında uygulayabilir.',
    color: '#166534',
    background: '#dcfce7',
    border: '#bbf7d0',
  },
  server: {
    label: 'Canlı kontrol ister',
    detail: 'DB geçmişi, müşteri profili, kupon veya zaman kontrolü için sunucu değerlendirici gerekir.',
    color: '#92400e',
    background: '#fef3c7',
    border: '#fde68a',
  },
  ledger: {
    label: 'Değer defteri yazar',
    detail: 'Cüzdan, işlem, kupon, hak, ilerleme veya kullanım kaydı gerektirir.',
    color: '#6d28d9',
    background: '#f3e8ff',
    border: '#ddd6fe',
  },
  model: {
    label: 'Motor eksik',
    detail: 'Tanım ve kayıt modeli var, checkout/runtime executor henüz yok.',
    color: '#475569',
    background: '#f8fafc',
    border: '#cbd5e1',
  },
  presentation: {
    label: 'Gösterim',
    detail: 'Kullanıcıya mesaj veya uyarı gösterir; iş verisi etkisi ayrıca tasarlanmalıdır.',
    color: '#0369a1',
    background: '#e0f2fe',
    border: '#bae6fd',
  },
}

// ---------------------------------------------------------------------------
// CONDITION_KEY_STATUS - Tek authority (map tabanlı)
// ---------------------------------------------------------------------------
export const CONDITION_KEY_STATUS = {
  // Yerel çözüm - POS/Kiosk sunucu çağrısı olmadan değerlendirebilir
  always: { category: 'local', label: 'Her siparişte' },
  order_total: { category: 'local', label: 'Sipariş toplamı' },
  sales_channel: { category: 'local', label: 'Satış kanalı' },
  manual_approval: { category: 'local', label: 'Manuel onay' },

  // Müşteri bağlamı gerektirir - müşteri bağlıysa yerel çözülür,
  // aksi halde sunucu araması gerekir
  customer_has_tag: { category: 'local', label: 'Müşteri etiketi' },
  customer_lacks_tag: { category: 'local', label: 'Müşteri etiketi yok' },

  // Sunucu araması gerektirir - DB geçmişi veya zamanlama
  calendar_schedule: { category: 'server', label: 'Takvim zamanlaması' },
  birthday: { category: 'server', label: 'Doğum günü' },
  period_total_order_amount: { category: 'server', label: 'Dönem harcaması' },
  period_order_count: { category: 'server', label: 'Dönem sipariş sayısı' },
  period_product_quantity: { category: 'server', label: 'Dönem ürün adedi' },
  period_sold_product_quantity: { category: 'server', label: 'Dönem satılan ürün' },
  happy_hour: { category: 'local', label: 'Happy hour' },
  gift_card_series: { category: 'server', label: 'Hediye kartı serisi' },
  campaign_triggered: { category: 'local', label: 'Kampanya tetiklendi' },
  coupon_present: { category: 'local', label: 'Kupon mevcut' },
  days_since_first_activity: { category: 'local', label: 'İlk aktiviteden beri gün' },
  referred_customer: { category: 'server', label: 'Müşteri referansla geldi' },
  gave_referral: { category: 'server', label: 'Referans verdi' },
  last_visit_days: { category: 'local', label: 'Son ziyaretten beri gün' },
  coupon_code: { category: 'server', label: 'Kupon kodu' },
  campaign_id: { category: 'server', label: 'Kampanya ID' },
  customer_id: { category: 'server', label: 'Müşteri ID' },
  missing_products: { category: 'local', label: 'Eksik ürünler' },

  // Model only - henüz executor yok
  order_item_quantity: { category: 'local', label: 'Sipariş ürün adedi' },
  day_of_week: { category: 'model', label: 'Gün kuralı' },
  time_of_day: { category: 'model', label: 'Zaman kuralı' },
  visit_count: { category: 'model', label: 'Ziyaret sayısı' },
  total_spent: { category: 'model', label: 'Toplam harcama' },
}

// ---------------------------------------------------------------------------
// ACTION_TYPE_STATUS - Tek authority (map tabanlı)
// ---------------------------------------------------------------------------
export const ACTION_TYPE_STATUS = {
  // POS'ta gerçekten çalışır - yerel değerlendirme + fiili indirimler
  discount_percent: { category: 'local', ledger: true, label: '% İndirim' },
  total_order_discount_percent: { category: 'local', ledger: true, label: 'Toplam % İndirim' },
  order_discount_amount: { category: 'local', ledger: true, label: 'Tutar İndirimi' },
  order_discount: { category: 'local', ledger: true, label: 'Siparişte indirim' },
  free_products: { category: 'local', ledger: true, label: 'Bedava ürünler' },

  // Puan kazanma - POS'ta çalışır, müşteri bağlıysa cüzdan yazımı olur
  bonus_points: { category: 'local', ledger: true, label: 'Bonus puan' },
  points_percent_of_order: { category: 'local', ledger: true, label: 'Sipariş % puan' },
  points_earn_multiplier: { category: 'local', ledger: true, label: 'Puan çarpanı' },

  // Kupon hakkı - çalışır
  issue_coupon: { category: 'local', ledger: true, label: 'Kupon hakkı' },

  points_redeem_multiplier: {
    category: 'local',
    ledger: true,
    label: 'Puan harcama çarpanı',
  },

  // Yalnızca bildirim - kalıcılık yok
  notify_customer: { category: 'presentation', ledger: false, label: 'Müşteri bilgilendirme' },
  show_message: { category: 'presentation', ledger: false, label: 'Mesaj göster' },
  warning_message: { category: 'presentation', ledger: false, label: 'Uyarı mesajı' },

  // Model only - şema var, executor yok
  tier_upgrade: { category: 'model', ledger: false, label: 'Seviye yükseltme' },
  birthday_bonus: { category: 'model', ledger: false, label: 'Doğum günü bonusu' },
  first_visit_bonus: { category: 'model', ledger: false, label: 'İlk ziyaret bonusu' },
  product_pricing: { category: 'model', ledger: false, label: 'Ürün bazlı fiyatlama' },
  combo_bundle: { category: 'model', ledger: false, label: 'Kombo paket' },
  write_customer_note: { category: 'model', ledger: false, label: 'Müşteri notu yaz' },
  send_sms: { category: 'model', ledger: false, label: 'SMS gönder' },
  send_webhook: { category: 'model', ledger: false, label: 'Webhook tetikle' },
  add_customer_tag: { category: 'model', ledger: false, label: 'Etiket ekle' },
  remove_customer_tag: { category: 'model', ledger: false, label: 'Etiket kaldır' },
  special_discount: { category: 'model', ledger: false, label: 'Özel indirim' },
  order_extra_charge_amount: { category: 'model', ledger: false, label: 'Ek ücret' },
  order_extra_charge_percent: { category: 'model', ledger: false, label: 'Ek ücret %' },
  order_extra_charge: { category: 'model', ledger: false, label: 'Siparişte ek ücret' },
  suggest_products: { category: 'model', ledger: false, label: 'Ürün öner' },
}

// ---------------------------------------------------------------------------
// Set yardımcıları - Tek authority'den türetilir, elle yazılmaz
// ---------------------------------------------------------------------------

/**
 * CONDITION_KEY_STATUS map'inden kategori bazlı Set'ler türetir.
 * Bu set'ler map'in türevi olduğundan her zaman map ile uyumludur.
 */
function buildConditionSetByCategory(category) {
  return new Set(
    Object.entries(CONDITION_KEY_STATUS)
      .filter(([, meta]) => meta.category === category)
      .map(([key]) => key),
  )
}

/**
 * ACTION_TYPE_STATUS map'inden kategori bazlı Set'ler türetir.
 */
function buildActionSetByCategory(category) {
  return new Set(
    Object.entries(ACTION_TYPE_STATUS)
      .filter(([, meta]) => meta.category === category)
      .map(([key]) => key),
  )
}

/**
 * ACTION_TYPE_STATUS map'inden ledger bayraklı Set türetir.
 */
function buildLedgerActionSet() {
  return new Set(
    Object.entries(ACTION_TYPE_STATUS)
      .filter(([, meta]) => meta.ledger === true)
      .map(([key]) => key),
  )
}

// Uyumluluk için dışa aktarılan Set'ler - map'ten otomatik türetilir
// NOT: Bu set'lere doğrudan yazma yapılmaz; map güncellenmeli.
export const LOCAL_READY_CONDITIONS = buildConditionSetByCategory('local')
export const SERVER_REQUIRED_CONDITIONS = buildConditionSetByCategory('server')
export const MODEL_ONLY_CONDITIONS = buildConditionSetByCategory('model')

export const LOCAL_READY_ACTIONS = buildActionSetByCategory('local')
export const VALUE_LEDGER_ACTIONS = buildLedgerActionSet()
export const MODEL_ONLY_ACTIONS = buildActionSetByCategory('model')
export const PRESENTATION_ONLY_ACTIONS = buildActionSetByCategory('presentation')

// ---------------------------------------------------------------------------
// Helper fonksiyonlar - tek authority'den beslenir
// ---------------------------------------------------------------------------

/**
 * Bir conditionKey için RUNTIME_STATUS_META döndürür.
 * Tek kaynak: CONDITION_KEY_STATUS map.
 */
export function getConditionRuntimeStatus(conditionKey) {
  const meta = CONDITION_KEY_STATUS[conditionKey]
  if (meta?.category && RUNTIME_STATUS_META[meta.category]) {
    return RUNTIME_STATUS_META[meta.category]
  }
  return RUNTIME_STATUS_META.model
}

/**
 * Bir actionType için RUNTIME_STATUS_META döndürür.
 * Tek kaynak: ACTION_TYPE_STATUS map.
 */
export function getActionRuntimeStatus(actionType) {
  const meta = ACTION_TYPE_STATUS[actionType]
  if (meta?.category && RUNTIME_STATUS_META[meta.category]) {
    return RUNTIME_STATUS_META[meta.category]
  }
  return RUNTIME_STATUS_META.model
}

/**
 * Bir actionType için runtime doğrulaması yapar.
 * Döner: { valid, message, status }
 */
export function validateActionRuntime(actionType) {
  const meta = ACTION_TYPE_STATUS[actionType]

  if (!meta) {
    return {
      valid: false,
      message: `${actionType} bilinmiyor`,
      status: 'unknown',
    }
  }

  if (meta.category === 'presentation') {
    return {
      valid: false,
      message: meta.warning || `${meta.label} henüz aktif değil`,
      status: 'not_supported',
    }
  }

  if (meta.category === 'model') {
    return {
      valid: false,
      message: `${meta.label} henüz uygulanmadı`,
      status: 'not_implemented',
    }
  }

  // local veya ledger destekli
  return {
    valid: true,
    message: `${meta.label} aktif`,
    status: 'supported',
  }
}

/**
 * conditionKey'nin yerel olarak çözülüp çözülemeyeceğini kontrol eder.
 * Tek kaynak: CONDITION_KEY_STATUS map.
 */
export function isLocalCondition(conditionKey) {
  return CONDITION_KEY_STATUS[conditionKey]?.category === 'local'
}

/**
 * actionType'ın ledger'a yazılıp yazılmadığını kontrol eder.
 * Tek kaynak: ACTION_TYPE_STATUS map.
 */
export function isLedgerAction(actionType) {
  return ACTION_TYPE_STATUS[actionType]?.ledger === true
}

/**
 * Yerel condition key dizisi döndürür.
 */
export function getLocalConditionKeys() {
  return Array.from(LOCAL_READY_CONDITIONS)
}

/**
 * Fiilen çalışan yerel action type dizisi döndürür.
 */
export function getLocalActionTypes() {
  return Array.from(LOCAL_READY_ACTIONS)
}

/**
 * Ledger'a yazılan action type dizisi döndürür.
 */
export function getLedgerActionTypes() {
  return Array.from(VALUE_LEDGER_ACTIONS)
}

/**
 * UI presentation action'ları için uyarı listesi döndürür.
 */
export function getPresentationWarnings() {
  return Array.from(PRESENTATION_ONLY_ACTIONS).map(key => {
    const meta = ACTION_TYPE_STATUS[key] || {}
    return { key, ...meta }
  })
}

/**
 * Kampanya kartı gösterimi için runtime statüs etiketi üretir.
 * Hem Wizard hem LoyaltyManagement tarafından tutarlı UI için kullanılır.
 */
export function buildRuntimeStatusLabel(campaign = {}, evaluation = {}) {
  const applicableRules = campaign.applicableRules || []

  // Presentation uyarılarını kontrol et
  const presentationWarnings = applicableRules
    .filter(rule => {
      const meta = ACTION_TYPE_STATUS[rule?.actionType]
      return meta?.category === 'presentation'
    })
    .map(rule => ACTION_TYPE_STATUS[rule.actionType]?.warning)
    .filter(Boolean)

  if (presentationWarnings.length > 0) {
    return {
      tone: 'warning',
      label: presentationWarnings[0],
      category: 'presentation',
      messages: presentationWarnings,
    }
  }

  const hasLocalResolution = applicableRules.every(rule => {
    if (!rule?.conditionKey) return campaign.campaignType === 'discount_percent'
    return isLocalCondition(rule.conditionKey)
  })

  const hasLedgerActions = applicableRules.every(rule => {
    if (!rule?.actionType) return campaign.actionType === 'discount_percent'
    return isLedgerAction(rule.actionType)
  })

  if (!hasLocalResolution) {
    return {
      tone: 'info',
      label: 'Sunucu kontrolü gerekli',
      category: 'server',
    }
  }

  if (hasLedgerActions) {
    return {
      tone: 'success',
      label: 'İndirim uygulanabilir',
      category: 'local',
      ledger: true,
    }
  }

  return {
    tone: 'muted',
    label: 'Kampanya mevcut',
    category: 'model',
  }
}
