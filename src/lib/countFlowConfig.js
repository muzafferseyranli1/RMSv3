export const COUNT_FLOW_STORAGE_KEY = 'suitable_count_flows_v1'
export const COUNT_FLOWS_TABLE = 'count_flows'

export const COUNT_WEEKDAYS = [
  'Pazartesi',
  'Sali',
  'Carsamba',
  'Persembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
]

export const COUNT_MONTH_ORDINALS = [
  { value: '1', label: '1.' },
  { value: '2', label: '2.' },
  { value: '3', label: '3.' },
  { value: '4', label: '4.' },
  { value: 'last', label: 'Son' },
]

export const COUNT_PRODUCT_MODES = [
  'moving',
  'all',
  'manual',
  'category',
  'template',
]

function uid() {
  return `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function normalizeTime(value, fallback = '13:00') {
  return /^\d{2}:\d{2}$/.test(String(value || '').trim()) ? String(value).trim() : fallback
}

function normalizeNamedItems(items = []) {
  const seen = new Set()
  return (Array.isArray(items) ? items : [])
    .map(item => {
      if (!item?.id) return null
      return {
        id: String(item.id),
        name: String(item.name || item.label || 'Adsiz secim'),
        sku: item.sku ? String(item.sku) : '',
        type: item.type ? String(item.type) : '',
        branchIds: Array.isArray(item.branchIds)
          ? [...new Set(item.branchIds.map(id => String(id)))]
          : [],
      }
    })
    .filter(item => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
}

function normalizeBranchConfig(input = {}) {
  return {
    allBranches: !!input.allBranches,
    selections: normalizeNamedItems(input.selections || []),
  }
}

function normalizeMonthlyDays(days = []) {
  const unique = []
  for (const raw of Array.isArray(days) ? days : []) {
    if (raw === 'last') {
      if (!unique.includes('last')) unique.push('last')
      continue
    }
    const num = Math.min(31, Math.max(1, parseInt(raw, 10) || 0))
    if (num && !unique.includes(num)) unique.push(num)
  }
  return unique
}

function normalizeMonthlyWeekdayRules(rules = []) {
  const unique = []
  for (const rule of Array.isArray(rules) ? rules : []) {
    const ordinal = COUNT_MONTH_ORDINALS.some(item => item.value === rule?.ordinal)
      ? rule.ordinal
      : '1'
    const weekday = COUNT_WEEKDAYS.includes(rule?.weekday)
      ? rule.weekday
      : COUNT_WEEKDAYS[0]
    const key = `${ordinal}:${weekday}`
    if (!unique.some(item => `${item.ordinal}:${item.weekday}` === key)) {
      unique.push({ ordinal, weekday })
    }
  }
  return unique
}

function normalizeSchedule(input = {}) {
  const frequency = ['daily', 'weekly', 'monthly'].includes(input.frequency)
    ? input.frequency
    : 'daily'
  const weekdays = [...new Set((Array.isArray(input.weekdays) ? input.weekdays : []).filter(day => COUNT_WEEKDAYS.includes(day)))]
  const monthlyMode = input.monthlyMode === 'weekday' ? 'weekday' : 'days'
  const monthlyDays = normalizeMonthlyDays(input.monthlyDays)
  const monthlyWeekdayRules = normalizeMonthlyWeekdayRules(input.monthlyWeekdayRules)

  return {
    frequency,
    startTime: normalizeTime(input.startTime),
    weekdays,
    monthlyMode,
    monthlyDays: monthlyDays.length ? monthlyDays : [1],
    monthlyWeekdayRules: monthlyWeekdayRules.length
      ? monthlyWeekdayRules
      : [{ ordinal: '1', weekday: COUNT_WEEKDAYS[0] }],
  }
}

function normalizeProducts(input = {}) {
  return {
    mode: COUNT_PRODUCT_MODES.includes(input.mode) ? input.mode : 'moving',
    movementDays: Math.min(365, Math.max(1, parseInt(input.movementDays, 10) || 30)),
    selectedStocks: normalizeNamedItems(input.selectedStocks || []),
    selectedCategories: normalizeNamedItems(input.selectedCategories || []),
    selectedTemplates: normalizeNamedItems(input.selectedTemplates || []),
  }
}

export function normalizeCountFlow(input = {}) {
  const now = new Date().toISOString()
  return {
    id: String(input.id || uid()),
    active: input.active !== false,
    name: String(input.name || ''),
    description: String(input.description || ''),
    branches: normalizeBranchConfig(input.branches || {}),
    schedule: normalizeSchedule(input.schedule || {}),
    products: normalizeProducts(input.products || {}),
    notes: {
      mobileEntry: input.notes?.mobileEntry !== false,
      printableForm: input.notes?.printableForm !== false,
    },
    deletedAt: input.deletedAt ? String(input.deletedAt) : null,
    createdAt: input.createdAt ? String(input.createdAt) : now,
    updatedAt: input.updatedAt ? String(input.updatedAt) : now,
  }
}

export function createCountFlowDraft() {
  return normalizeCountFlow({})
}

export function readCountFlows() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(COUNT_FLOW_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(normalizeCountFlow) : []
  } catch (error) {
    return []
  }
}

export function writeCountFlows(flows = []) {
  const normalized = (Array.isArray(flows) ? flows : []).map(normalizeCountFlow)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COUNT_FLOW_STORAGE_KEY, JSON.stringify(normalized))
  }
  return normalized
}

export function mergeCountFlowLists(primaryFlows = [], secondaryFlows = []) {
  const merged = []
  const seen = new Set()

  for (const flow of [...(Array.isArray(primaryFlows) ? primaryFlows : []), ...(Array.isArray(secondaryFlows) ? secondaryFlows : [])]) {
    const normalized = normalizeCountFlow(flow)
    if (seen.has(normalized.id)) continue
    seen.add(normalized.id)
    merged.push(normalized)
  }

  return merged
}

export function countFlowFromRow(row = {}) {
  return normalizeCountFlow({
    id: row.id,
    active: row.active,
    name: row.name,
    description: row.description,
    branches: row.branches,
    schedule: row.schedule,
    products: row.products,
    notes: row.notes,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function countFlowToRow(flow = {}) {
  const normalized = normalizeCountFlow(flow)
  return {
    id: normalized.id,
    active: normalized.active,
    name: normalized.name.trim(),
    description: normalized.description.trim() || null,
    branches: normalized.branches,
    schedule: normalized.schedule,
    products: normalized.products,
    notes: normalized.notes,
    deleted_at: normalized.deletedAt,
    created_at: normalized.createdAt,
    updated_at: normalized.updatedAt,
  }
}
