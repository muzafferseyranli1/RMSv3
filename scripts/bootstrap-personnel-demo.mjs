const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

const argv = new Set(process.argv.slice(2))
const dryRun = argv.has('--dry-run')
const verifyOnly = argv.has('--verify-only')

const DEMO_PREFIX = 'demo_personnel_'
const PERSONNEL_KEY = 'personnel_records'
const POSITIONS_KEY = 'personnel_positions'
const COMPANY_TREE_KEY = 'company_tree'
const DEMO_TIMESTAMP = '2026-05-11T12:00:00.000Z'

const POSITION_CODES = {
  manager: 'SBM',
  shift: 'VRD',
  waiter: 'GRS',
  busser: 'KOM',
  cashier: 'KSR',
  package: 'PKT',
  kitchenChef: 'MTS',
  cook: 'UAS',
  prep: 'HZR',
  grill: 'IZG',
  dishwasher: 'BLS',
  stock: 'DPS',
  cleaning: 'TMZ',
}

const ROLE_TEMPLATE = [
  POSITION_CODES.manager,
  POSITION_CODES.shift,
  POSITION_CODES.waiter,
  POSITION_CODES.waiter,
  POSITION_CODES.busser,
  POSITION_CODES.cashier,
  POSITION_CODES.package,
  POSITION_CODES.kitchenChef,
  POSITION_CODES.cook,
  POSITION_CODES.prep,
]

const ELEVENTH_ROLE_ROTATION = [
  POSITION_CODES.grill,
  POSITION_CODES.dishwasher,
  POSITION_CODES.stock,
  POSITION_CODES.cleaning,
  POSITION_CODES.waiter,
  POSITION_CODES.package,
]

const TWELFTH_ROLE_ROTATION = [
  POSITION_CODES.prep,
  POSITION_CODES.cook,
  POSITION_CODES.grill,
  POSITION_CODES.dishwasher,
  POSITION_CODES.stock,
  POSITION_CODES.cleaning,
]

const FEMALE_FIRST_NAMES = [
  'Ayşe', 'Fatma', 'Elif', 'Zeynep', 'Merve', 'Derya', 'Ece', 'Büşra',
  'Seda', 'Gizem', 'Ceren', 'İrem', 'Sibel', 'Tuğba', 'Esra', 'Melis',
  'Deniz', 'Gül', 'Aslı', 'Yasemin', 'Selin', 'Burcu', 'Nisan', 'Aylin',
]

const MALE_FIRST_NAMES = [
  'Mehmet', 'Mustafa', 'Ahmet', 'Ali', 'Emre', 'Burak', 'Can', 'Mert',
  'Okan', 'Serkan', 'Onur', 'Tolga', 'Kerem', 'Barış', 'Kaan', 'Yusuf',
  'Hakan', 'Eren', 'Umut', 'Furkan', 'Levent', 'Arda', 'Cem', 'Tuna',
]

const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk',
  'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara',
  'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Güneş', 'Aksoy', 'Taş',
  'Avcı', 'Kaplan', 'Bulut', 'Keskin', 'Tekin', 'Ünal', 'Turan', 'Erdoğan',
  'Bozkurt', 'Acar', 'Güler', 'Işık', 'Başar', 'Sezer', 'Çoban', 'Ekinci',
]

const STREET_NOTES = [
  'Açılış vardiyası deneyimli demo personelidir.',
  'Yoğun saat operasyonu için planlanan demo personelidir.',
  'Şube içi çapraz görev desteği için oluşturuldu.',
  'PIN ile POS/Garson ekran bağlamı testlerinde kullanılabilir.',
]

function slugify(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function flattenNodes(nodes, parentChain = []) {
  const result = []
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue
    const flatNode = { ...node, parentChain }
    result.push(flatNode)
    if (Array.isArray(node.children)) {
      result.push(...flattenNodes(node.children, [...parentChain, flatNode]))
    }
  }
  return result
}

function getBranchCount(branchIndex) {
  return 10 + (branchIndex % 3)
}

function getRolesForBranch(branchIndex) {
  const count = getBranchCount(branchIndex)
  const roles = [...ROLE_TEMPLATE]
  const rotationIndex = Math.floor(branchIndex / 3)
  if (count >= 11) roles.push(ELEVENTH_ROLE_ROTATION[rotationIndex % ELEVENTH_ROLE_ROTATION.length])
  if (count >= 12) roles.push(TWELFTH_ROLE_ROTATION[rotationIndex % TWELFTH_ROLE_ROTATION.length])
  return roles
}

function getPositionByShortCode(positions, shortCode) {
  const position = positions.find(item => !item.deletedAt && item.shortCode === shortCode)
  if (!position) throw new Error(`Pozisyon bulunamadi: ${shortCode}`)
  return position
}

function createPersonName(globalIndex) {
  const isFemale = globalIndex % 2 === 0
  const firstNames = isFemale ? FEMALE_FIRST_NAMES : MALE_FIRST_NAMES
  return {
    firstName: firstNames[globalIndex % firstNames.length],
    lastName: LAST_NAMES[(globalIndex * 7) % LAST_NAMES.length],
    gender: isFemale ? 'Kadın' : 'Erkek',
  }
}

function createDemoPersonnel({ branches, positions }) {
  const employees = []

  branches.forEach((branch, branchIndex) => {
    const roles = getRolesForBranch(branchIndex)
    roles.forEach((shortCode, roleIndex) => {
      const globalIndex = employees.length
      const position = getPositionByShortCode(positions, shortCode)
      const name = createPersonName(globalIndex)
      const branchSlug = slugify(branch.name)
      const branchIdSlug = slugify(branch.id).slice(0, 8)
      const positionSlug = slugify(position.shortCode)
      const id = `${DEMO_PREFIX}${branchSlug}_${branchIdSlug}_${String(roleIndex + 1).padStart(2, '0')}_${positionSlug}`
      const contractType = position.contractTerms?.fixed_salary?.enabled
        ? 'fixed_salary'
        : (position.contractTerms?.hourly?.enabled ? 'hourly' : 'part_time')
      const salaryBase = contractType === 'fixed_salary'
        ? 33000 + ((branchIndex + roleIndex) % 8) * 1750
        : 220 + ((branchIndex + roleIndex) % 6) * 25

      employees.push({
        id,
        firstName: name.firstName,
        middleName: '',
        lastName: name.lastName,
        registryNumber: `PRS-${String(globalIndex + 1).padStart(5, '0')}`,
        sgkNumber: `SGK${String(5000000000 + globalIndex).padStart(10, '0')}`,
        gender: name.gender,
        birthDate: `${1978 + (globalIndex % 24)}-${String((globalIndex % 12) + 1).padStart(2, '0')}-${String((globalIndex % 27) + 1).padStart(2, '0')}`,
        address: `${branch.name} personel lojman kaydı`,
        phone: '',
        mobilePhone: `05${String(300000000 + globalIndex).padStart(9, '0')}`,
        telegramUsername: '',
        email: `${slugify(name.firstName)}.${slugify(name.lastName)}.${globalIndex + 1}@demo.suitablerms.local`,
        authorityLevel: roleIndex < 2 ? 'Şube' : 'Operasyon',
        positionId: position.id,
        contractType,
        defaultBranchId: branch.id,
        workingBranchIds: [branch.id],
        managedBranchIds: roleIndex < 2 ? [branch.id] : [],
        hireDate: `2025-${String((branchIndex % 12) + 1).padStart(2, '0')}-${String((roleIndex % 24) + 1).padStart(2, '0')}`,
        terminationDate: '',
        username: `demo.${branchSlug}.${String(roleIndex + 1).padStart(2, '0')}`,
        password: '',
        pin: String(4100 + globalIndex),
        photo: '',
        salary: salaryBase,
        bankName: ['Garanti BBVA', 'İş Bankası', 'Yapı Kredi', 'Akbank'][globalIndex % 4],
        iban: `TR${String(100000000000000000000000 + globalIndex).padStart(24, '0')}`,
        notes: STREET_NOTES[(branchIndex + roleIndex) % STREET_NOTES.length],
        createdAt: DEMO_TIMESTAMP,
        updatedAt: DEMO_TIMESTAMP,
        deletedAt: null,
      })
    })
  })

  return employees
}

async function apiQuery(payload) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  const result = await response.json()
  if (result.error) throw new Error(result.error.message || JSON.stringify(result.error))
  return result.data
}

async function readSettings(keys) {
  const rows = await apiQuery({
    table: 'settings',
    operation: 'select',
    select: 'key,value',
    filters: [{ type: 'in', col: 'key', val: keys }],
  })
  return Object.fromEntries((rows || []).map(row => [row.key, row.value]))
}

async function writePersonnelRecords(records) {
  return apiQuery({
    table: 'settings',
    operation: 'upsert',
    data: { key: PERSONNEL_KEY, value: records },
    options: { onConflict: 'key' },
  })
}

function verifyDemoRecords({ records, branches, expectedTotal }) {
  const demoRecords = records.filter(item => String(item.id || '').startsWith(DEMO_PREFIX))
  const pins = new Set()
  const ids = new Set()
  const branchCounts = new Map()
  const duplicatePins = []
  const duplicateIds = []

  for (const record of demoRecords) {
    if (ids.has(record.id)) duplicateIds.push(record.id)
    ids.add(record.id)
    if (pins.has(record.pin)) duplicatePins.push(record.pin)
    pins.add(record.pin)
    branchCounts.set(record.defaultBranchId, (branchCounts.get(record.defaultBranchId) || 0) + 1)
  }

  const invalidBranches = branches
    .map(branch => ({ branch, count: branchCounts.get(branch.id) || 0 }))
    .filter(item => item.count < 10 || item.count > 12)

  return {
    demoRecords: demoRecords.length,
    expectedTotal,
    branchCount: branches.length,
    uniquePins: pins.size,
    duplicatePins,
    duplicateIds,
    invalidBranches: invalidBranches.map(item => `${item.branch.name}:${item.count}`),
    ok: demoRecords.length === expectedTotal &&
      pins.size === demoRecords.length &&
      duplicatePins.length === 0 &&
      duplicateIds.length === 0 &&
      invalidBranches.length === 0,
  }
}

function summarizeByPosition(records, positions) {
  const demoRecords = records.filter(item => String(item.id || '').startsWith(DEMO_PREFIX))
  const positionNames = Object.fromEntries(positions.map(position => [position.id, position.name]))
  const counts = new Map()
  for (const record of demoRecords) {
    const name = positionNames[record.positionId] || record.positionId || 'Tanımsız'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((left, right) => left[0].localeCompare(right[0], 'tr'))
    .map(([name, count]) => ({ name, count }))
}

async function main() {
  const settings = await readSettings([PERSONNEL_KEY, POSITIONS_KEY, COMPANY_TREE_KEY])
  const positions = Array.isArray(settings[POSITIONS_KEY]) ? settings[POSITIONS_KEY] : []
  const branches = flattenNodes(settings[COMPANY_TREE_KEY])
    .filter(node => node.type === 'sube')
    .map(node => ({ id: String(node.id), name: node.name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'tr'))

  if (!branches.length) throw new Error('company_tree icinde sube bulunamadi.')
  if (!positions.length) throw new Error('personnel_positions bos veya bulunamadi.')

  const existingRecords = Array.isArray(settings[PERSONNEL_KEY]) ? settings[PERSONNEL_KEY] : []
  const preservedRecords = existingRecords.filter(item => !String(item.id || '').startsWith(DEMO_PREFIX))
  const demoRecords = createDemoPersonnel({ branches, positions })
  const nextRecords = [...preservedRecords, ...demoRecords]
  const expectedTotal = demoRecords.length

  const plannedVerification = verifyDemoRecords({ records: nextRecords, branches, expectedTotal })
  const positionSummary = summarizeByPosition(nextRecords, positions)

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : (verifyOnly ? 'verify-only' : 'apply'),
    apiUrl: API_URL,
    branches: branches.length,
    preservedRecords: preservedRecords.length,
    demoRecords: expectedTotal,
    totalAfterWrite: nextRecords.length,
    branchSizeRule: '10-12 personnel per branch',
    verification: plannedVerification,
    positionSummary,
  }, null, 2))

  if (dryRun) return

  if (!verifyOnly) {
    await writePersonnelRecords(nextRecords)
  }

  const readbackSettings = await readSettings([PERSONNEL_KEY, POSITIONS_KEY, COMPANY_TREE_KEY])
  const readbackRecords = Array.isArray(readbackSettings[PERSONNEL_KEY]) ? readbackSettings[PERSONNEL_KEY] : []
  const readbackVerification = verifyDemoRecords({ records: readbackRecords, branches, expectedTotal })

  console.log(JSON.stringify({
    mode: 'readback',
    readbackTotalRecords: readbackRecords.length,
    verification: readbackVerification,
  }, null, 2))

  if (!readbackVerification.ok) {
    throw new Error('Readback dogrulamasi basarisiz.')
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
