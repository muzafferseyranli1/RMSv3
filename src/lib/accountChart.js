export const ACCOUNT_CHART_KEY = 'account_chart'

export const ACCOUNT_TYPES = [
  { value: 'varlik', label: 'Varlik' },
  { value: 'borc', label: 'Borc' },
  { value: 'ozkaynak', label: 'Ozkaynak' },
  { value: 'gelir', label: 'Gelir' },
  { value: 'dogrudan-gider', label: 'Dogrudan Gider' },
  { value: 'gider', label: 'Gider' },
]

export const ACCOUNT_SCOPES = [
  { value: 'tum-sistem', label: 'Tum sistem' },
  { value: 'merkez', label: 'Merkez' },
  { value: 'sube', label: 'Sube' },
]

export const ACCOUNT_SECTIONS = [
  { value: 'gelirler', label: 'Gelirler' },
  { value: 'giderler', label: 'Giderler' },
  { value: 'nakitler', label: 'Nakitler' },
  { value: 'diger', label: 'Diger' },
]

const DEFAULT_SCOPE = ACCOUNT_SCOPES[0].value
const DEFAULT_SECTION = 'giderler'

const DEFAULT_TEMPLATE_ACCOUNTS = [
  { id: 'acct-brut-satis-gelirleri', name: 'Brut Satis Gelirleri', type: 'gelir', code: '9001', accountingCategory: 'giderler', section: 'gelirler' },
  { id: 'acct-sirket-ici-transfer', name: 'Sirket ici Transfer', type: 'gelir', section: 'gelirler' },
  { id: 'acct-diger-gelirler', name: 'Diger Gelirler', type: 'gelir', section: 'gelirler' },
  { id: 'acct-satistan-zayi', name: 'Satistan Zayi', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-skt-asimi', name: 'SKT Asimi', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-raf-omru-asimi', name: 'Raf Omru Asimi', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-uretim-zayiatlari', name: 'Uretim Zayiatlari', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-dusme-kirilma', name: 'Dusme/Kirilma', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-recete-test-demo', name: 'Recete Test / Demo', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-ikramlar', name: 'Ikramlar', type: 'gider', section: 'giderler', group: 'Zayi Giderleri' },
  { id: 'acct-sayim-fazlasi', name: 'Sayim Fazlasi', type: 'gelir', section: 'giderler', group: 'Sayim Farklari' },
  { id: 'acct-sayim-eksigi', name: 'Sayim Eksigi', type: 'dogrudan-gider', section: 'giderler', group: 'Sayim Farklari' },
  { id: 'acct-gida', name: 'Gida', type: 'dogrudan-gider', section: 'giderler', group: 'Teorik Hammadde Maliyeti' },
  { id: 'acct-paketleme-malz', name: 'Paketleme Malz', type: 'dogrudan-gider', section: 'giderler', group: 'Teorik Hammadde Maliyeti' },
  { id: 'acct-ana-stok-grubu-1', name: 'Ana Stok Grubu 1', type: 'dogrudan-gider', section: 'giderler', group: 'Teorik Hammadde Maliyeti' },
  { id: 'acct-ana-stok-grubu-2', name: 'Ana Stok Grubu 2', type: 'dogrudan-gider', section: 'giderler', group: 'Teorik Hammadde Maliyeti' },
  { id: 'acct-kdv', name: 'KDV', type: 'gider', section: 'giderler', group: 'Satistan Giderler' },
  { id: 'acct-indirimler', name: 'Indirimler', type: 'gider', section: 'giderler', group: 'Satistan Giderler' },
  { id: 'acct-pazar-yeri-komisyonlari', name: 'Pazar yeri komisyonlari', type: 'gider', section: 'giderler', group: 'Komisyon Giderleri' },
  { id: 'acct-kredi-karti-komisyonlari', name: 'Kredi Karti Komisyonlari', type: 'gider', section: 'giderler', group: 'Komisyon Giderleri' },
  { id: 'acct-yemek-karti-komisyonlari', name: 'Yemek Karti Komisyonlari', type: 'gider', section: 'giderler', group: 'Komisyon Giderleri' },
  { id: 'acct-personel-net-maas', name: 'Personel Net Maas giderleri', type: 'gider', section: 'giderler', group: 'Personel Giderleri' },
  { id: 'acct-personel-yemek', name: 'Personel Yemek Gideri', type: 'gider', section: 'giderler', group: 'Personel Giderleri' },
  { id: 'acct-personel-yol', name: 'Personel Yol Gideri', type: 'gider', section: 'giderler', group: 'Personel Giderleri' },
  { id: 'acct-bordro-isveren-vergileri', name: 'Bordro isveren vergileri gider', type: 'gider', section: 'giderler', group: 'Personel Giderleri' },
  { id: 'acct-personel-sgk', name: 'Personel SGK gideri', type: 'gider', section: 'giderler', group: 'Personel Giderleri' },
  { id: 'acct-kira', name: 'Kira', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-ortak-alan', name: 'Ortak Alan', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-elektrik', name: 'Elektrik', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-su', name: 'Su', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-dogalgaz', name: 'Dogalgaz', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-internet', name: 'Internet', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-telefon', name: 'Telefon', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-guvenlik', name: 'Guvenlik', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-bakim-onarim', name: 'Bakim Onarim', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-bilgiislem-otomasyon', name: 'Bilgiislem Otomasyon giderleri', type: 'gider', section: 'giderler', group: 'Rutin Giderler' },
  { id: 'acct-akbank', name: 'Akbank', type: 'varlik', section: 'nakitler', group: 'Bankalar' },
  { id: 'acct-yapi-kredi', name: 'Yapi Kredi', type: 'varlik', section: 'nakitler', group: 'Bankalar' },
  { id: 'acct-ana-kasa', name: 'Ana Kasa', type: 'varlik', section: 'nakitler', group: 'Subedeki Nakit' },
  { id: 'acct-on-kasa', name: 'On Kasa', type: 'varlik', section: 'nakitler', group: 'Subedeki Nakit' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeCode(value) {
  return normalizeText(value).replace(/\.0$/, '')
}

function pickValidOption(options, value, fallbackValue) {
  return options.some(option => option.value === value) ? value : fallbackValue
}

function inferSection(account = {}) {
  const normalizedSection = normalizeText(account.section)
  if (ACCOUNT_SECTIONS.some(section => section.value === normalizedSection)) return normalizedSection

  const normalizedType = normalizeText(account.type)
  if (normalizedType === 'gelir') return 'gelirler'
  if (normalizedType === 'gider' || normalizedType === 'dogrudan-gider') return 'giderler'
  if (normalizedType === 'varlik') return 'nakitler'
  if (normalizedType === 'borc' || normalizedType === 'ozkaynak') return 'diger'

  const normalizedName = normalizeText(account.name).toLocaleLowerCase('tr-TR')
  if (normalizedName.includes('banka') || normalizedName.includes('kasa') || normalizedName.includes('nakit')) return 'nakitler'

  return DEFAULT_SECTION
}

function inferType(account = {}, section = DEFAULT_SECTION) {
  const normalizedType = normalizeText(account.type)
  if (ACCOUNT_TYPES.some(type => type.value === normalizedType)) return normalizedType
  if (section === 'gelirler') return 'gelir'
  if (section === 'nakitler') return 'varlik'
  return 'gider'
}

export function createAccountId(prefix = 'account') {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function normalizeAccount(account = {}) {
  const section = inferSection(account)
  return {
    id: normalizeText(account.id) || createAccountId(),
    code: normalizeCode(account.code),
    name: normalizeText(account.name),
    type: inferType(account, section),
    parentCode: normalizeCode(account.parentCode),
    scope: pickValidOption(ACCOUNT_SCOPES, normalizeText(account.scope), DEFAULT_SCOPE),
    active: account.active !== false,
    section,
    group: normalizeText(account.group),
    accountingCategory: normalizeText(account.accountingCategory),
  }
}

export const DEFAULT_ACCOUNT_CHART = DEFAULT_TEMPLATE_ACCOUNTS.map(normalizeAccount)

export function normalizeAccountChart(value, fallbackValue = []) {
  const source = Array.isArray(value) ? value : fallbackValue
  return (Array.isArray(source) ? source : []).map(normalizeAccount)
}

export function getAccountTypeLabel(typeValue) {
  return ACCOUNT_TYPES.find(type => type.value === typeValue)?.label || 'Belirsiz'
}

export function getAccountScopeLabel(scopeValue) {
  return ACCOUNT_SCOPES.find(scope => scope.value === scopeValue)?.label || 'Belirsiz'
}

export function getAccountSectionLabel(sectionValue) {
  return ACCOUNT_SECTIONS.find(section => section.value === sectionValue)?.label || 'Diger'
}

export function sortAccounts(accounts = []) {
  const sectionOrder = new Map(ACCOUNT_SECTIONS.map((section, index) => [section.value, index]))
  const defaultGroupOrder = new Map()

  DEFAULT_ACCOUNT_CHART.forEach(account => {
    const key = `${account.section}::${account.group || ''}`
    if (!defaultGroupOrder.has(key)) defaultGroupOrder.set(key, defaultGroupOrder.size)
  })

  return [...accounts].sort((leftRaw, rightRaw) => {
    const left = normalizeAccount(leftRaw)
    const right = normalizeAccount(rightRaw)

    const sectionDiff = (sectionOrder.get(left.section) ?? 999) - (sectionOrder.get(right.section) ?? 999)
    if (sectionDiff !== 0) return sectionDiff

    const leftGroupKey = `${left.section}::${left.group || ''}`
    const rightGroupKey = `${right.section}::${right.group || ''}`
    const leftGroupOrder = defaultGroupOrder.has(leftGroupKey) ? defaultGroupOrder.get(leftGroupKey) : 1000
    const rightGroupOrder = defaultGroupOrder.has(rightGroupKey) ? defaultGroupOrder.get(rightGroupKey) : 1000
    if (leftGroupOrder !== rightGroupOrder) return leftGroupOrder - rightGroupOrder

    const groupDiff = (left.group || '').localeCompare(right.group || '', 'tr')
    if (groupDiff !== 0) return groupDiff

    const codeDiff = (left.code || '').localeCompare(right.code || '', 'tr')
    if (codeDiff !== 0) return codeDiff

    return (left.name || '').localeCompare(right.name || '', 'tr')
  })
}

export function buildExpenseAccountOptions(accounts = []) {
  const expenseAccounts = sortAccounts(normalizeAccountChart(accounts, []))
    .filter(account => account.active)
    .filter(account => account.section === 'giderler' || account.type === 'gider' || account.type === 'dogrudan-gider')
    .filter(account => account.name)

  return [
    { value: '', label: 'Secin...' },
    ...expenseAccounts.map(account => ({
      value: account.id,
      label: account.code ? `${account.name} (${account.code})` : account.name,
      code: account.code,
      accountingCategory: account.accountingCategory,
      group: account.group,
    })),
  ]
}
