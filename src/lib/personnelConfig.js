import { db } from '@/lib/db'

export const PERSONNEL_SETTINGS_KEYS = {
  positions: 'personnel_positions',
  employees: 'personnel_records',
}

export const CONTRACT_TYPES = [
  { key: 'fixed_salary', label: 'Matbu Maaşlı', description: 'Aylık sabit ücret kullanılır.' },
  { key: 'hourly', label: 'Saatlik Ücretli', description: 'Saat bazlı ücret kullanılır.' },
  { key: 'part_time', label: 'Kısmi Zamanlı', description: 'Kısmi zamanlı çalışma modeli kullanılır.' },
]

export const LABOR_SETTING_FIELDS = [
  {
    key: 'monthlyWorkHours',
    label: 'Matbu ücretliler için haftalık izin dahil aylık çalışma süresi (saat)',
    type: 'number',
    min: 0,
    step: 0.5,
    hint: 'Aylık maaşın saatlik ücrete çevrilmesinde baz alınır.',
  },
  {
    key: 'weeklyDayOffCount',
    label: 'Hafta tatili gün sayısı',
    type: 'number',
    min: 0,
    step: 1,
    hint: 'İşletmenin verdiği haftalık tatil gün sayısı.',
  },
  {
    key: 'weeklyWorkHours',
    label: 'Haftalık çalışma süresi (saat)',
    type: 'number',
    min: 0,
    step: 0.5,
    hint: 'Bu sürenin üzeri mesai olarak değerlendirilir.',
  },
  {
    key: 'overtimeDeltaRate',
    label: 'Mesai farkı',
    type: 'number',
    min: 0,
    step: 0.05,
    hint: 'Örnek: 0.5 değeri %50 zamlı mesai anlamına gelir.',
  },
  {
    key: 'holidayOvertimeRate',
    label: 'Resmi tatil mesai farkı',
    type: 'number',
    min: 0,
    step: 0.05,
    hint: 'Örnek: 1 değeri %100 zamlı resmi tatil mesaisi anlamına gelir.',
  },
  {
    key: 'maxDailyWorkHours',
    label: 'Günlük en fazla çalışma süresi (saat)',
    type: 'number',
    min: 0,
    step: 0.5,
    hint: 'Vardiya planlamasında bu limitin üzeri uyarı üretmek için kullanılabilir.',
  },
  {
    key: 'unpaidBreakMinutes',
    label: 'Çalışma süresi sayılmayacak süre (yemek mola vb.) dakika',
    type: 'number',
    min: 0,
    step: 5,
    hint: 'Net çalışma süresinden düşülecek mola süresi.',
  },
]

export const DEFAULT_LABOR_SETTINGS = {
  monthlyWorkHours: 225,
  weeklyDayOffCount: 1,
  weeklyWorkHours: 45,
  overtimeDeltaRate: 0.5,
  holidayOvertimeRate: 1,
  maxDailyWorkHours: 11,
  unpaidBreakMinutes: 60,
}

export const GENDER_OPTIONS = [
  { value: 'Kadın', label: 'Kadın' },
  { value: 'Erkek', label: 'Erkek' },
  { value: 'Belirtmek istemiyor', label: 'Belirtmek istemiyor' },
]

export const AUTHORITY_LEVEL_OPTIONS = [
  { value: 'Genel Merkez', label: 'Genel Merkez' },
  { value: 'Tüzel Kişilik', label: 'Tüzel Kişilik' },
  { value: 'Şube', label: 'Şube' },
  { value: 'Bölge', label: 'Bölge' },
  { value: 'Operasyon', label: 'Operasyon' },
]

function toFiniteNumber(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function toStringValue(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizeArrayValue(value) {
  if (!Array.isArray(value)) return []
  return value.filter(Boolean).map(item => String(item))
}

export function createUid(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function normalizeLaborSettings(input = {}) {
  return {
    monthlyWorkHours: toFiniteNumber(input.monthlyWorkHours, DEFAULT_LABOR_SETTINGS.monthlyWorkHours),
    weeklyDayOffCount: toFiniteNumber(input.weeklyDayOffCount, DEFAULT_LABOR_SETTINGS.weeklyDayOffCount),
    weeklyWorkHours: toFiniteNumber(input.weeklyWorkHours, DEFAULT_LABOR_SETTINGS.weeklyWorkHours),
    overtimeDeltaRate: toFiniteNumber(input.overtimeDeltaRate, DEFAULT_LABOR_SETTINGS.overtimeDeltaRate),
    holidayOvertimeRate: toFiniteNumber(input.holidayOvertimeRate, DEFAULT_LABOR_SETTINGS.holidayOvertimeRate),
    maxDailyWorkHours: toFiniteNumber(input.maxDailyWorkHours, DEFAULT_LABOR_SETTINGS.maxDailyWorkHours),
    unpaidBreakMinutes: toFiniteNumber(input.unpaidBreakMinutes, DEFAULT_LABOR_SETTINGS.unpaidBreakMinutes),
  }
}

export function createDefaultContractTerms() {
  return CONTRACT_TYPES.reduce((accumulator, contractType, index) => {
    accumulator[contractType.key] = {
      enabled: index === 0,
      amount: '',
    }
    return accumulator
  }, {})
}

export function normalizeContractTerms(input = {}) {
  const defaults = createDefaultContractTerms()
  const normalized = {}

  CONTRACT_TYPES.forEach(contractType => {
    const source = input?.[contractType.key] || {}
    normalized[contractType.key] = {
      enabled: source.enabled ?? defaults[contractType.key].enabled,
      amount: source.amount === '' ? '' : toFiniteNumber(source.amount, ''),
    }
  })

  if (!CONTRACT_TYPES.some(contractType => normalized[contractType.key].enabled)) {
    normalized[CONTRACT_TYPES[0].key].enabled = true
  }

  return normalized
}

export function createEmptyPosition() {
  return {
    id: '',
    name: '',
    shortCode: '',
    parentId: '',
    lateToleranceMinutes: 15,
    contractTerms: createDefaultContractTerms(),
    notes: '',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

export function normalizePositionRecord(input = {}) {
  const base = createEmptyPosition()
  return {
    ...base,
    ...input,
    id: toStringValue(input.id || base.id),
    name: toStringValue(input.name),
    shortCode: toStringValue(input.shortCode || input.short_code).toUpperCase(),
    parentId: toStringValue(input.parentId || input.parent_id),
    lateToleranceMinutes: toFiniteNumber(input.lateToleranceMinutes, base.lateToleranceMinutes),
    contractTerms: normalizeContractTerms(input.contractTerms),
    notes: toStringValue(input.notes),
    createdAt: toStringValue(input.createdAt),
    updatedAt: toStringValue(input.updatedAt),
    deletedAt: input.deletedAt || null,
  }
}

export function createEmptyEmployee() {
  return {
    id: '',
    firstName: '',
    middleName: '',
    lastName: '',
    registryNumber: '',
    sgkNumber: '',
    gender: '',
    birthDate: '',
    address: '',
    phone: '',
    mobilePhone: '',
    telegramUsername: '',
    email: '',
    authorityLevel: '',
    positionId: '',
    contractType: CONTRACT_TYPES[0].key,
    defaultBranchId: '',
    workingBranchIds: [],
    managedBranchIds: [],
    hireDate: '',
    terminationDate: '',
    username: '',
    password: '',
    pin: '',
    photo: '',
    salary: '',
    bankName: '',
    iban: '',
    notes: '',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}

export function normalizeEmployeeRecord(input = {}) {
  const base = createEmptyEmployee()
  const normalizedContractType = CONTRACT_TYPES.some(contractType => contractType.key === input.contractType)
    ? input.contractType
    : base.contractType

  return {
    ...base,
    ...input,
    id: toStringValue(input.id || base.id),
    firstName: toStringValue(input.firstName),
    middleName: toStringValue(input.middleName),
    lastName: toStringValue(input.lastName),
    registryNumber: toStringValue(input.registryNumber),
    sgkNumber: toStringValue(input.sgkNumber),
    gender: toStringValue(input.gender),
    birthDate: toStringValue(input.birthDate),
    address: toStringValue(input.address),
    phone: toStringValue(input.phone),
    mobilePhone: toStringValue(input.mobilePhone),
    telegramUsername: toStringValue(input.telegramUsername),
    email: toStringValue(input.email),
    authorityLevel: toStringValue(input.authorityLevel),
    positionId: toStringValue(input.positionId),
    contractType: normalizedContractType,
    defaultBranchId: toStringValue(input.defaultBranchId),
    workingBranchIds: normalizeArrayValue(input.workingBranchIds),
    managedBranchIds: normalizeArrayValue(input.managedBranchIds),
    hireDate: toStringValue(input.hireDate),
    terminationDate: toStringValue(input.terminationDate),
    username: toStringValue(input.username),
    password: toStringValue(input.password),
    pin: toStringValue(input.pin),
    photo: toStringValue(input.photo),
    salary: input.salary === '' ? '' : toFiniteNumber(input.salary, ''),
    bankName: toStringValue(input.bankName),
    iban: toStringValue(input.iban),
    notes: toStringValue(input.notes),
    createdAt: toStringValue(input.createdAt),
    updatedAt: toStringValue(input.updatedAt),
    deletedAt: input.deletedAt || null,
  }
}

export async function readSettingArray(settingKey, normalizer) {
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', settingKey)
    .maybeSingle()

  if (error) throw error
  const rawValue = Array.isArray(data?.value) ? data.value : []
  return normalizer ? rawValue.map(item => normalizer(item)) : rawValue
}

export async function writeSettingArray(settingKey, value) {
  const { error } = await db.from('settings').upsert({ key: settingKey, value })
  if (error) throw error
}

export async function readCompanyTree() {
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', 'company_tree')
    .maybeSingle()

  if (error) throw error
  return Array.isArray(data?.value) ? data.value : []
}

export function flattenCompanyNodes(nodes, parentChain = []) {
  const result = []
  ;(nodes || []).forEach(node => {
    const flatNode = { ...node, parentChain }
    result.push(flatNode)
    if (node.children?.length) {
      result.push(...flattenCompanyNodes(node.children, [...parentChain, flatNode]))
    }
  })
  return result
}

export function extractBranchNodes(nodes) {
  return flattenCompanyNodes(nodes)
    .filter(node => node.type === 'sube' || node.type === 'anadepo' || node.type === 'mutfak' || node.type === 'uretim')
    .map(node => ({
      id: String(node.id),
      name: node.name,
      legalEntityName: [...node.parentChain].reverse().find(parent => parent.type === 'tuzel')?.name || '',
    }))
}

export function extractLegalEntityNodes(nodes) {
  return flattenCompanyNodes(nodes)
    .filter(node => node.type === 'tuzel')
    .map(node => ({
      id: String(node.id),
      name: node.name,
    }))
}

export function getPositionDefaultSalary(position, contractType) {
  if (!position) return ''
  return position.contractTerms?.[contractType]?.amount ?? ''
}

export function getEnabledContractTypes(position) {
  if (!position) return []
  return CONTRACT_TYPES.filter(contractType => position.contractTerms?.[contractType.key]?.enabled)
}

export function formatAmount(value) {
  if (value === '' || value === null || value === undefined) return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric)
}

export function createUniquePin(existingPins = []) {
  const taken = new Set(existingPins.filter(Boolean).map(pin => String(pin)))
  for (let value = 1000; value <= 9999; value += 1) {
    const pin = String(value)
    if (!taken.has(pin)) return pin
  }
  return String(Date.now()).slice(-6)
}
