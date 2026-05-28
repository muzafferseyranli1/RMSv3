export const DEMO_SALES_SETTINGS_KEY = 'suitable_demo_sales_settings_v2'
export const DEMO_SALES_BASE_DATE = '2026-02-01'

export const DEMO_WEEKDAY_FIELDS = [
  { key: 'monday', label: 'Pazartesi' },
  { key: 'tuesday', label: 'Salı' },
  { key: 'wednesday', label: 'Çarşamba' },
  { key: 'thursday', label: 'Perşembe' },
  { key: 'friday', label: 'Cuma' },
  { key: 'saturday', label: 'Cumartesi' },
  { key: 'sunday', label: 'Pazar' },
]

export const DEFAULT_DEMO_SALES_SETTINGS = {
  baseDate: DEMO_SALES_BASE_DATE,
  receiptAverageMin: 480,
  receiptAverageMax: 795,
  receiptCountMin: 160,
  receiptCountMax: 300,
  discountEnabled: true,
  discountRateMin: 5,
  discountRateMax: 15,
  splitPaymentEnabled: true,
  dayWeights: {
    monday: 8,
    tuesday: 9,
    wednesday: 12,
    thursday: 11,
    friday: 17,
    saturday: 20,
    sunday: 23,
  },
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

function normalizeIsoDay(value, fallback) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fallback

  const [year, month, day] = text.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
  const isValid = (
    date.getFullYear() === year &&
    date.getMonth() === (month || 1) - 1 &&
    date.getDate() === (day || 1)
  )

  return isValid ? text : fallback
}

export function normalizeDayWeights(input = {}) {
  const raw = DEMO_WEEKDAY_FIELDS.map(field => ({
    key: field.key,
    value: Math.max(0, Number(input[field.key])),
  }))

  const safe = raw.every(item => Number.isFinite(item.value)) ? raw : []
  const total = safe.reduce((sum, item) => sum + item.value, 0)
  const base = total > 0 ? safe : DEMO_WEEKDAY_FIELDS.map(field => ({
    key: field.key,
    value: DEFAULT_DEMO_SALES_SETTINGS.dayWeights[field.key],
  }))
  const baseTotal = base.reduce((sum, item) => sum + item.value, 0) || 1

  let allocated = 0
  return base.reduce((acc, item, index) => {
    const nextValue = index === base.length - 1
      ? Math.max(0, 100 - allocated)
      : Math.max(0, Math.round((item.value / baseTotal) * 100))

    acc[item.key] = nextValue
    allocated += nextValue
    return acc
  }, {})
}

export function normalizeDemoSalesSettings(input = {}) {
  const baseDate = normalizeIsoDay(input.baseDate, DEFAULT_DEMO_SALES_SETTINGS.baseDate)
  const receiptAverageMin = clampNumber(input.receiptAverageMin, DEFAULT_DEMO_SALES_SETTINGS.receiptAverageMin, 50, 100000)
  const receiptAverageMax = clampNumber(input.receiptAverageMax, DEFAULT_DEMO_SALES_SETTINGS.receiptAverageMax, receiptAverageMin, 150000)
  const receiptCountMin = clampNumber(input.receiptCountMin, DEFAULT_DEMO_SALES_SETTINGS.receiptCountMin, 1, 5000)
  const receiptCountMax = clampNumber(input.receiptCountMax, DEFAULT_DEMO_SALES_SETTINGS.receiptCountMax, receiptCountMin, 10000)
  const discountRateMin = clampNumber(input.discountRateMin, DEFAULT_DEMO_SALES_SETTINGS.discountRateMin, 0, 100)
  const discountRateMax = clampNumber(input.discountRateMax, DEFAULT_DEMO_SALES_SETTINGS.discountRateMax, discountRateMin, 100)

  return {
    baseDate,
    receiptAverageMin,
    receiptAverageMax,
    receiptCountMin,
    receiptCountMax,
    discountEnabled: input.discountEnabled ?? DEFAULT_DEMO_SALES_SETTINGS.discountEnabled,
    discountRateMin,
    discountRateMax,
    splitPaymentEnabled: input.splitPaymentEnabled ?? DEFAULT_DEMO_SALES_SETTINGS.splitPaymentEnabled,
    dayWeights: normalizeDayWeights(input.dayWeights || DEFAULT_DEMO_SALES_SETTINGS.dayWeights),
  }
}

export function readDemoSalesSettings() {
  if (typeof window === 'undefined') return DEFAULT_DEMO_SALES_SETTINGS
  try {
    const raw = window.localStorage.getItem(DEMO_SALES_SETTINGS_KEY)
    if (!raw) return DEFAULT_DEMO_SALES_SETTINGS
    return normalizeDemoSalesSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_DEMO_SALES_SETTINGS
  }
}

export function writeDemoSalesSettings(settings) {
  const normalized = normalizeDemoSalesSettings(settings)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_SALES_SETTINGS_KEY, JSON.stringify(normalized))
  }
  return normalized
}
