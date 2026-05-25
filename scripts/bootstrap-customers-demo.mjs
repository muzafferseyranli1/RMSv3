const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

const argv = new Set(process.argv.slice(2))
const dryRun = argv.has('--dry-run')
const verifyOnly = argv.has('--verify-only')

const CUSTOMER_PREFIX = 'DEMO-MUS-202605-'
const CATEGORY_PREFIX = 'DEMO-CAT-202605-'
const MEMBER_PREFIX = 'DEMO-MUSCAT-202605-'
const DEMO_TIMESTAMP = '2026-05-11T12:00:00.000Z'
const CUSTOMER_COUNT = 100
const CUSTOMER_BATCH_SIZE = 25
const MEMBER_BATCH_SIZE = 50

const CATEGORY_SPECS = [
  { no: '001', code: 'VIP', name: 'VIP', color: '#7c3aed', description: 'Yuksek harcama ve ozel ilgi gerektiren sadakat demo segmenti.' },
  { no: '002', code: 'DUZENLI', name: 'Duzenli', color: '#2563eb', description: 'Tekrarli siparis veren aktif demo musterileri.' },
  { no: '003', code: 'YENI', name: 'Yeni', color: '#0891b2', description: 'Yeni kayit veya ilk siparis asamasindaki demo musterileri.' },
  { no: '004', code: 'KURUMSAL', name: 'Kurumsal', color: '#475569', description: 'Sirket/cari baglantili demo musterileri.' },
  { no: '005', code: 'PAKET_GEL_AL', name: 'Paket/Gel Al', color: '#ea580c', description: 'Paket servis veya gel-al kanali agirlikli demo musterileri.' },
  { no: '006', code: 'SADAKAT_AKTIF', name: 'Sadakat Aktif', color: '#16a34a', description: 'Sadakat programina hazir aktif demo musterileri.' },
  { no: '007', code: 'RISKLI', name: 'Riskli/Terk Etme Egilimli', color: '#dc2626', description: 'Son ziyareti gecmis, geri kazanima aday demo musterileri.' },
]

const FIRST_NAMES = [
  'Ayse', 'Mehmet', 'Zeynep', 'Ahmet', 'Elif', 'Mustafa', 'Fatma', 'Ali', 'Merve', 'Emre',
  'Derya', 'Burak', 'Ece', 'Can', 'Ceren', 'Mert', 'Seda', 'Okan', 'Gizem', 'Serkan',
  'Irem', 'Onur', 'Sibel', 'Tolga', 'Esra', 'Kerem', 'Deniz', 'Kaan', 'Selin', 'Yusuf',
]

const LAST_NAMES = [
  'Yilmaz', 'Kaya', 'Demir', 'Celik', 'Sahin', 'Yildiz', 'Yildirim', 'Ozturk', 'Aydin', 'Ozdemir',
  'Arslan', 'Dogan', 'Kilic', 'Aslan', 'Cetin', 'Kara', 'Koc', 'Kurt', 'Ozkan', 'Simsek',
  'Polat', 'Gunes', 'Aksoy', 'Tas', 'Avci', 'Kaplan', 'Bulut', 'Keskin', 'Tekin', 'Unal',
]

const COMPANY_NAMES = [
  'Kanyon Ofis Yemekleri Ltd.', 'Levent Etkinlik Catering A.S.', 'Marmara Lojistik Yemek Kartlari',
  'Ege Plaza Personel Hizmetleri', 'Ankara Kurumsal Ikram Ltd.', 'Bursa Fabrika Yemekleri',
  'Izmir Ajans Organizasyon', 'Antalya Otel Satinalma', 'Kadikoy Spor Kulubu', 'Ataşehir Klinik Hizmetleri',
  'Konya Bayi Operasyonlari', 'Mersin Liman Tedarik',
]

const ACQUISITION_SOURCES = ['magaza', 'pos', 'kiosk', 'mobil', 'web', 'paket_servis']
const SIGNUP_CHANNELS = ['pos', 'kiosk', 'mobile_app', 'web', 'call_center']
const ADDRESS_DISTRICTS = ['Kadikoy', 'Besiktas', 'Levent', 'Atasehir', 'Bornova', 'Muratpasa', 'Cankaya', 'Nilufer']

function categoryId(spec) {
  return `${CATEGORY_PREFIX}${spec.no}`
}

function customerRef(index) {
  return `${CUSTOMER_PREFIX}${String(index + 1).padStart(3, '0')}`
}

function customerUuid(index) {
  const seq = String(index + 1).padStart(4, '0')
  return `c0de${seq}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
}

function memberId(customerIndex, categoryIndex) {
  return `${MEMBER_PREFIX}${String(customerIndex + 1).padStart(3, '0')}-${String(categoryIndex + 1).padStart(3, '0')}`
}

function categoryRows() {
  return CATEGORY_SPECS.map((spec, index) => ({
    id: categoryId(spec),
    scope_type: 'global',
    scope_branch_id: null,
    scope_branch_name: null,
    name: spec.name,
    code: spec.code,
    description: spec.description,
    color: spec.color,
    active: true,
    sort_order: (index + 1) * 10,
    metadata: {
      source: 'demo-customers-bootstrap',
      demo_prefix: CATEGORY_PREFIX,
      generated_at: DEMO_TIMESTAMP,
    },
    created_at: DEMO_TIMESTAMP,
    updated_at: DEMO_TIMESTAMP,
    deleted_at: null,
  }))
}

function parseJsonMaybe(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

function flattenBranches(nodes, result = []) {
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.type === 'sube') result.push({ id: String(node.id), name: node.name })
    if (Array.isArray(node?.children)) flattenBranches(node.children, result)
  }
  return result
}

function normalizePhone(index) {
  return `90555${String(202605000 + index + 1).slice(-7)}`
}

function displayPhone(index) {
  const raw = normalizePhone(index)
  return `${raw.slice(2, 5)} ${raw.slice(5, 8)} ${raw.slice(8, 10)} ${raw.slice(10, 12)}`
}

function customerProfileType(index) {
  if (index < 70) return 'individual'
  if (index < 85) return 'corporate'
  if (index < 95) return 'new'
  return 'risk'
}

function categoryIdsForCustomer(index) {
  const byCode = Object.fromEntries(CATEGORY_SPECS.map(spec => [spec.code, categoryId(spec)]))
  const type = customerProfileType(index)
  const ids = []

  if (type === 'corporate') ids.push(byCode.KURUMSAL)
  else if (type === 'new') ids.push(byCode.YENI)
  else if (type === 'risk') ids.push(byCode.RISKLI)
  else ids.push(byCode.DUZENLI)

  if (type !== 'risk' && index % 3 !== 2) ids.push(byCode.SADAKAT_AKTIF)
  if (index % 10 === 0) ids.push(byCode.VIP)
  else if (index % 6 === 0) ids.push(byCode.PAKET_GEL_AL)

  return Array.from(new Set(ids)).slice(0, 3)
}

function createAddress(index, branch) {
  const district = ADDRESS_DISTRICTS[index % ADDRESS_DISTRICTS.length]
  return [{
    baslik: 'Varsayilan Adres',
    il_id: '',
    ilce_id: '',
    mahalle_id: null,
    sokak: `${district} Demo Sokak No:${10 + (index % 70)}`,
    apt_no: String(1 + (index % 30)),
    daire_no: String(1 + (index % 18)),
    kat: String(index % 9),
    aciklama: `${branch.name} teslimat bolgesi demo adresi`,
    birincil: true,
  }]
}

function createCustomers(branches) {
  return Array.from({ length: CUSTOMER_COUNT }, (_, index) => {
    const type = customerProfileType(index)
    const branch = branches[index % branches.length]
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length]
    const lastName = LAST_NAMES[(index * 7) % LAST_NAMES.length]
    const fullName = `${firstName} ${lastName}`
    const ref = customerRef(index)
    const orderCount = type === 'new' ? index % 2 : (type === 'risk' ? 2 + (index % 5) : 4 + (index % 28))
    const totalAmount = type === 'new'
      ? 0
      : Number((orderCount * (185 + ((index * 13) % 240))).toFixed(2))
    const avgTicket = orderCount > 0 ? Number((totalAmount / orderCount).toFixed(2)) : 0
    const loyaltyStatus = type === 'new' ? 'prospect' : (type === 'risk' ? 'inactive' : 'active')
    const enrolled = type === 'new' ? null : `2026-${String(1 + (index % 4)).padStart(2, '0')}-${String(1 + (index % 24)).padStart(2, '0')}T10:00:00.000Z`
    const firstOrder = orderCount > 0 ? `2026-${String(1 + (index % 4)).padStart(2, '0')}-${String(1 + (index % 24)).padStart(2, '0')}T13:00:00.000Z` : null
    const lastMonth = type === 'risk' ? 2 : 5
    const lastOrder = orderCount > 0 ? `2026-${String(lastMonth).padStart(2, '0')}-${String(1 + (index % 24)).padStart(2, '0')}T18:30:00.000Z` : null
    const isCorporate = type === 'corporate'
    const emailLocal = `${firstName}.${lastName}.${String(index + 1).padStart(3, '0')}`.toLowerCase()

    return {
      id: customerUuid(index),
      ad_soyad: isCorporate ? `${COMPANY_NAMES[index % COMPANY_NAMES.length]} - ${fullName}` : fullName,
      cari: isCorporate,
      musteri_tipi: isCorporate ? 'kurumsal' : 'gercek',
      sirket_adi: isCorporate ? COMPANY_NAMES[index % COMPANY_NAMES.length] : null,
      vergi_no: isCorporate ? `34${String(10000000 + index).padStart(8, '0')}` : null,
      email: `${emailLocal}@demo.suitablerms.local`,
      notlar: `${ref} sadakat hazir demo musteri kaydi.`,
      telefon: displayPhone(index),
      telefon_ulke: '+90',
      adresler: createAddress(index, branch),
      toplam_borc: isCorporate ? Number(((index % 5) * 450).toFixed(2)) : 0,
      toplam_alacak: 0,
      siparis_sayisi: orderCount,
      deleted_at: null,
      created_at: DEMO_TIMESTAMP,
      updated_at: DEMO_TIMESTAMP,
      normalized_phone: normalizePhone(index),
      normalized_email: `${emailLocal}@demo.suitablerms.local`,
      birth_date: isCorporate ? null : `${1972 + (index % 30)}-${String(1 + (index % 12)).padStart(2, '0')}-${String(1 + (index % 27)).padStart(2, '0')}`,
      gender: isCorporate ? null : (index % 2 === 0 ? 'female' : 'male'),
      preferred_language: 'tr',
      loyalty_member_no: type === 'new' ? null : `LYT-${String(202605000 + index + 1)}`,
      loyalty_status: loyaltyStatus,
      loyalty_enrolled_at: enrolled,
      sms_opt_in: index % 5 !== 0,
      email_opt_in: index % 4 !== 0,
      push_opt_in: index % 3 !== 0,
      kvkk_consent_at: `2026-05-${String(1 + (index % 10)).padStart(2, '0')}T09:00:00.000Z`,
      marketing_consent_at: index % 6 === 0 ? null : `2026-05-${String(1 + (index % 10)).padStart(2, '0')}T09:05:00.000Z`,
      acquisition_source: ACQUISITION_SOURCES[index % ACQUISITION_SOURCES.length],
      signup_channel: SIGNUP_CHANNELS[index % SIGNUP_CHANNELS.length],
      home_branch_id: branch.id,
      home_branch_name: branch.name,
      first_order_at: firstOrder,
      last_order_at: lastOrder,
      last_visit_at: lastOrder,
      total_order_count: orderCount,
      total_order_amount: totalAmount,
      avg_ticket_amount: avgTicket,
      tags: categoryIdsForCustomer(index),
      external_customer_ref: ref,
      mobile_app_user_id: index % 3 === 0 ? `demo-mobile-${String(index + 1).padStart(3, '0')}` : null,
      referral_code: `REF${String(202605000 + index + 1)}`,
      referred_by_customer_id: null,
      metadata: {
        source: 'demo-customers-bootstrap',
        demo_prefix: CUSTOMER_PREFIX,
        profile_type: type,
        generated_at: DEMO_TIMESTAMP,
        loyalty_scope: 'category-ready-only',
      },
    }
  })
}

function createMembershipRows(customers) {
  const categoryIndexById = new Map(CATEGORY_SPECS.map((spec, index) => [categoryId(spec), index]))
  return customers.flatMap((customer, customerIndex) => (
    categoryIdsForCustomer(customerIndex).map(categoryIdValue => ({
      id: memberId(customerIndex, categoryIndexById.get(categoryIdValue) ?? 0),
      customer_id: customer.id,
      category_id: categoryIdValue,
      scope_type: 'global',
      scope_branch_id: null,
      scope_branch_name: null,
      active: true,
      metadata: {
        source: 'demo-customers-bootstrap',
        demo_prefix: MEMBER_PREFIX,
        customer_ref: customer.external_customer_ref,
        generated_at: DEMO_TIMESTAMP,
      },
      created_at: DEMO_TIMESTAMP,
      updated_at: DEMO_TIMESTAMP,
      deleted_at: null,
    }))
  ))
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

function eq(col, val) {
  return { type: 'eq', col, val }
}

function ilike(col, val) {
  return { type: 'ilike', col, val }
}

function inFilter(col, val) {
  return { type: 'in', col, val }
}

async function selectRows(table, select = '*', filters = []) {
  return apiQuery({ table, operation: 'select', select, filters })
}

async function deleteRows(table, filters) {
  return apiQuery({ table, operation: 'delete', filters })
}

const JSON_COLUMNS = {
  musteriler: new Set(['adresler', 'tags', 'metadata']),
  loyalty_customer_categories: new Set(['metadata']),
  loyalty_customer_category_members: new Set(['metadata']),
}

function normalizeRecordForApi(table, record) {
  const jsonColumns = JSON_COLUMNS[table]
  if (!jsonColumns) return record
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [
    key,
    jsonColumns.has(key) && value !== null && typeof value === 'object'
      ? JSON.stringify(value)
      : value,
  ]))
}

async function insertRows(table, rows) {
  if (!rows.length) return []
  return apiQuery({
    table,
    operation: 'insert',
    data: rows.map(row => normalizeRecordForApi(table, row)),
  })
}

function chunk(rows, size) {
  const chunks = []
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size))
  return chunks
}

async function readCompanyBranches() {
  const rows = await selectRows('settings', 'key,value', [eq('key', 'company_tree')])
  const tree = parseJsonMaybe(rows?.[0]?.value, [])
  return flattenBranches(tree).sort((left, right) => left.name.localeCompare(right.name, 'tr'))
}

async function readExistingDemo() {
  const categoryIds = CATEGORY_SPECS.map(categoryId)
  const [customers, categories, memberships] = await Promise.all([
    selectRows('musteriler', 'id,external_customer_ref,telefon,email,normalized_phone,normalized_email,loyalty_status,deleted_at', [
      ilike('external_customer_ref', `${CUSTOMER_PREFIX}%`),
    ]),
    selectRows('loyalty_customer_categories', 'id,name,active,deleted_at', [
      inFilter('id', categoryIds),
    ]),
    selectRows('loyalty_customer_category_members', 'id,customer_id,category_id,active,deleted_at', [
      inFilter('category_id', categoryIds),
    ]),
  ])
  return { customers, categories, memberships }
}

async function cleanupExistingDemo(existing) {
  const categoryIds = CATEGORY_SPECS.map(categoryId)
  const customerIds = (existing.customers || []).map(row => row.id).filter(Boolean)

  if (categoryIds.length) {
    await deleteRows('loyalty_customer_category_members', [inFilter('category_id', categoryIds)])
  }
  if (customerIds.length) {
    await deleteRows('loyalty_customer_category_members', [inFilter('customer_id', customerIds)])
    await deleteRows('musteriler', [inFilter('id', customerIds)])
  }
  if (categoryIds.length) {
    await deleteRows('loyalty_customer_categories', [inFilter('id', categoryIds)])
  }
}

function summarizeStatus(customers) {
  return customers.reduce((accumulator, customer) => {
    const key = customer.loyalty_status || 'empty'
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})
}

function summarizeProfiles(customers) {
  return customers.reduce((accumulator, customer) => {
    const type = customer.metadata?.profile_type || parseJsonMaybe(customer.metadata, {})?.profile_type || 'unknown'
    accumulator[type] = (accumulator[type] || 0) + 1
    return accumulator
  }, {})
}

function verifyDataset({ customers, categories, memberships }) {
  const customerRefs = customers.map(row => row.external_customer_ref).filter(Boolean)
  const phones = customers.map(row => row.normalized_phone || row.telefon).filter(Boolean)
  const emails = customers.map(row => row.normalized_email || row.email).filter(Boolean)
  const activeCategories = categories.filter(row => row.active !== false && !row.deleted_at)
  const activeMemberships = memberships.filter(row => row.active !== false && !row.deleted_at)
  const membershipsByCustomer = new Map()

  for (const membership of activeMemberships) {
    membershipsByCustomer.set(membership.customer_id, (membershipsByCustomer.get(membership.customer_id) || 0) + 1)
  }

  const customersWithoutMembership = customers
    .filter(row => !row.deleted_at)
    .filter(row => !membershipsByCustomer.has(row.id))
    .map(row => row.external_customer_ref || row.id)

  const uniqueRefs = new Set(customerRefs)
  const uniquePhones = new Set(phones)
  const uniqueEmails = new Set(emails)
  const statusSummary = summarizeStatus(customers)

  return {
    customers: customers.length,
    categories: activeCategories.length,
    memberships: activeMemberships.length,
    uniqueExternalRefs: uniqueRefs.size,
    uniquePhones: uniquePhones.size,
    uniqueEmails: uniqueEmails.size,
    customersWithoutMembership,
    loyaltyStatusSummary: statusSummary,
    ok: customers.length === CUSTOMER_COUNT &&
      activeCategories.length === CATEGORY_SPECS.length &&
      activeMemberships.length >= CUSTOMER_COUNT &&
      activeMemberships.length >= 160 &&
      activeMemberships.length <= 190 &&
      uniqueRefs.size === CUSTOMER_COUNT &&
      uniquePhones.size === CUSTOMER_COUNT &&
      uniqueEmails.size === CUSTOMER_COUNT &&
      Object.keys(statusSummary).length > 0 &&
      customersWithoutMembership.length === 0,
  }
}

async function readbackDemoRows() {
  const categoryIds = CATEGORY_SPECS.map(categoryId)
  const customers = await selectRows(
    'musteriler',
    'id,ad_soyad,telefon,email,normalized_phone,normalized_email,loyalty_status,external_customer_ref,metadata,deleted_at',
    [ilike('external_customer_ref', `${CUSTOMER_PREFIX}%`)],
  )
  const categories = await selectRows(
    'loyalty_customer_categories',
    'id,name,code,active,deleted_at',
    [inFilter('id', categoryIds)],
  )
  const customerIds = (customers || []).map(row => row.id)
  const memberships = customerIds.length
    ? await selectRows(
      'loyalty_customer_category_members',
      'id,customer_id,category_id,active,deleted_at',
      [inFilter('customer_id', customerIds)],
    )
    : []
  return { customers: customers || [], categories: categories || [], memberships: memberships || [] }
}

async function main() {
  const branches = await readCompanyBranches()
  if (!branches.length) throw new Error('settings.company_tree icinde sube bulunamadi. Musteri demo seed durduruldu.')

  const categories = categoryRows()
  const customers = createCustomers(branches)
  const memberships = createMembershipRows(customers)
  const existing = await readExistingDemo()
  const plannedVerification = verifyDataset({ customers, categories, memberships })

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : (verifyOnly ? 'verify-only' : 'apply'),
    apiUrl: API_URL,
    branches: branches.length,
    planned: {
      categories: categories.length,
      customers: customers.length,
      memberships: memberships.length,
      customerBatches: chunk(customers, CUSTOMER_BATCH_SIZE).length,
      membershipBatches: chunk(memberships, MEMBER_BATCH_SIZE).length,
      profileSummary: summarizeProfiles(customers),
      loyaltyStatusSummary: summarizeStatus(customers),
    },
    existingDemo: {
      categories: existing.categories?.length || 0,
      customers: existing.customers?.length || 0,
      memberships: existing.memberships?.length || 0,
    },
    excludedLoyaltyTables: [
      'loyalty_wallets',
      'loyalty_transactions',
      'loyalty_reward_entitlements',
      'loyalty_frequency_progress',
      'loyalty_coupons',
    ],
    plannedVerification,
  }, null, 2))

  if (dryRun) return

  if (!verifyOnly) {
    await cleanupExistingDemo(existing)
    await insertRows('loyalty_customer_categories', categories)

    for (const batch of chunk(customers, CUSTOMER_BATCH_SIZE)) {
      await insertRows('musteriler', batch)
      const lastRef = batch[batch.length - 1]?.external_customer_ref
      console.log(JSON.stringify({ batch: 'customers', attempted: batch.length, lastRef }))
    }

    for (const batch of chunk(memberships, MEMBER_BATCH_SIZE)) {
      await insertRows('loyalty_customer_category_members', batch)
      const lastId = batch[batch.length - 1]?.id
      console.log(JSON.stringify({ batch: 'memberships', attempted: batch.length, lastId }))
    }
  }

  const readback = await readbackDemoRows()
  const verification = verifyDataset(readback)

  console.log(JSON.stringify({
    mode: 'readback',
    readback: {
      categories: readback.categories.length,
      customers: readback.customers.length,
      memberships: readback.memberships.length,
    },
    verification,
  }, null, 2))

  if (!verification.ok) {
    throw new Error('Musteri demo readback dogrulamasi basarisiz.')
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
