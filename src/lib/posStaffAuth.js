import {
  PERSONNEL_SETTINGS_KEYS,
  normalizeEmployeeRecord,
  readSettingArray,
} from '@/lib/personnelConfig'

const PERSONNEL_CACHE_KEY = 'suitable_personnel_records_cache_v1'
const PERSONNEL_CACHE_TTL_MS = 5 * 60 * 1000

let personnelLoadPromise = null

export function normalizePinInput(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6)
}

export function getPersonnelDisplayName(employee) {
  const fullName = [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return fullName || employee?.username || employee?.registryNumber || 'Personel'
}

export function canPersonnelAccessBranch(employee, branchId) {
  if (!employee || employee.deletedAt) return false
  if (!branchId) return true
  const branchIds = new Set([
    employee.defaultBranchId,
    ...(employee.workingBranchIds || []),
    ...(employee.managedBranchIds || []),
  ].filter(Boolean))
  return branchIds.size === 0 || branchIds.has(branchId)
}

function filterPersonnelForBranch(employees, branchId) {
  return employees
    .filter(employee => !employee.deletedAt)
    .filter(employee => employee.pin)
    .filter(employee => canPersonnelAccessBranch(employee, branchId))
    .sort((left, right) => getPersonnelDisplayName(left).localeCompare(getPersonnelDisplayName(right), 'tr'))
}

function findPersonnelRecordForBranchPin(employees, branchId, normalizedPin) {
  for (const employee of employees || []) {
    if (employee?.deletedAt) continue
    if (!employee?.pin || employee.pin !== normalizedPin) continue
    if (!canPersonnelAccessBranch(employee, branchId)) continue
    return employee
  }
  return null
}

function readCachedPersonnelRecords({ allowExpired = false } = {}) {
  try {
    const rawSession = sessionStorage.getItem(PERSONNEL_CACHE_KEY)
    const rawLegacy = rawSession == null ? localStorage.getItem(PERSONNEL_CACHE_KEY) : null
    const parsed = JSON.parse(rawSession || rawLegacy || 'null')
    if (!parsed || typeof parsed !== 'object') return []
    const cachedAt = Number(parsed.cachedAt) || 0
    if (!cachedAt) return []
    if (!allowExpired && (Date.now() - cachedAt) > PERSONNEL_CACHE_TTL_MS) return []
    const records = Array.isArray(parsed.records) ? parsed.records : []
    if (!rawSession && rawLegacy) {
      try {
        sessionStorage.setItem(PERSONNEL_CACHE_KEY, rawLegacy)
        localStorage.removeItem(PERSONNEL_CACHE_KEY)
      } catch {
        // Migration is best-effort only.
      }
    }
    return records.map(record => normalizeEmployeeRecord(record))
  } catch {
    return []
  }
}

function writeCachedPersonnelRecords(records) {
  try {
    sessionStorage.setItem(PERSONNEL_CACHE_KEY, JSON.stringify({
      cachedAt: Date.now(),
      records,
    }))
    localStorage.removeItem(PERSONNEL_CACHE_KEY)
  } catch {
    // Cache persistence is best-effort only.
  }
}

async function loadAllPersonnelRecords({ preferCache = true } = {}) {
  if (preferCache) {
    const cached = readCachedPersonnelRecords()
    if (cached.length > 0) return cached
  }

  if (!personnelLoadPromise) {
    personnelLoadPromise = readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord)
      .then(records => {
        writeCachedPersonnelRecords(records)
        return records
      })
      .finally(() => {
        personnelLoadPromise = null
      })
  }

  return personnelLoadPromise
}

export function getCachedPersonnelForBranch(branchId, options = {}) {
  return filterPersonnelForBranch(
    readCachedPersonnelRecords({ allowExpired: options.allowExpired ?? true }),
    branchId,
  )
}

export function findCachedPersonnelForBranchPin(branchId, pin, options = {}) {
  const normalizedPin = normalizePinInput(pin)
  if (!normalizedPin) return null
  const employees = readCachedPersonnelRecords({ allowExpired: options.allowExpired ?? true })
  return findPersonnelRecordForBranchPin(employees, branchId, normalizedPin)
}

export async function loadPersonnelForBranch(branchId, options = {}) {
  const employees = await loadAllPersonnelRecords(options)
  return filterPersonnelForBranch(employees, branchId)
}

export async function findPersonnelForBranchPin(branchId, pin, options = {}) {
  const normalizedPin = normalizePinInput(pin)
  if (!normalizedPin) return null
  const employees = await loadAllPersonnelRecords(options)
  return findPersonnelRecordForBranchPin(employees, branchId, normalizedPin)
}

export function readPosStaffSession(storageKey) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writePosStaffSession(storageKey, session) {
  try {
    if (session) sessionStorage.setItem(storageKey, JSON.stringify(session))
    else sessionStorage.removeItem(storageKey)
  } catch {
    // Session persistence is best-effort only.
  }
}
