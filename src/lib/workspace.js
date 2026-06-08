export const WORKSPACE_SCOPE = {
  center: 'center',
  anadepo: 'anadepo',
  merkezmutfak: 'merkezmutfak',
  branch: 'branch',
  admin: 'admin',
}

export const WORKSPACE_SCOPE_OPTIONS = [
  {
    value: WORKSPACE_SCOPE.center,
    label: 'Merkez',
    description: 'Merkez operasyonlari ve ayarlari yonetin.',
    icon: 'fa-building-columns',
    accent: '#60a5fa',
    bg: 'rgba(96,165,250,.14)',
  },
  {
    value: WORKSPACE_SCOPE.anadepo,
    label: 'Ana Depo (WMS)',
    description: 'Lojistik, lokasyon ve palet yonetimi operasyonlari.',
    icon: 'fa-warehouse',
    accent: '#34d399',
    bg: 'rgba(52,211,153,.14)',
  },
  {
    value: WORKSPACE_SCOPE.merkezmutfak,
    label: 'Merkez Mutfak',
    description: 'Uretim receteleri ve is emirleri akislarinda calisin.',
    icon: 'fa-industry',
    accent: '#f97316',
    bg: 'rgba(249,115,22,.14)',
  },
  {
    value: WORKSPACE_SCOPE.branch,
    label: 'Sube',
    description: 'Sube operasyonlari ve POS tarafinda calisin.',
    icon: 'fa-store',
    accent: '#f59e0b',
    bg: 'rgba(245,158,11,.14)',
  },
  {
    value: WORKSPACE_SCOPE.admin,
    label: 'Admin',
    description: 'Tum menuleri ve modulleri gorun.',
    icon: 'fa-user-shield',
    accent: '#a78bfa',
    bg: 'rgba(167,139,250,.14)',
  },
]

export const WORKSPACE_SCOPE_STORAGE_KEY = 'suitable_workspace_scope'
export const WORKSPACE_BRANCH_STORAGE_KEY = 'suitable_workspace_branch_id'
export const WORKSPACE_BRANCH_NAME_STORAGE_KEY = 'suitable_workspace_branch_name'

export const DEFAULT_PATH_BY_SCOPE = {
  [WORKSPACE_SCOPE.center]: '/dashboard',
  [WORKSPACE_SCOPE.anadepo]: '/depo-orders',
  [WORKSPACE_SCOPE.merkezmutfak]: '/merkezmutfak-uretim',
  [WORKSPACE_SCOPE.branch]: '/forecast',
  [WORKSPACE_SCOPE.admin]: '/dashboard',
}

const SECTION_ACCESS = {
  'Merkez': [WORKSPACE_SCOPE.center, WORKSPACE_SCOPE.admin],
  'Şube': [WORKSPACE_SCOPE.branch, WORKSPACE_SCOPE.admin],
  'POS ve Ekranlar': [WORKSPACE_SCOPE.branch, WORKSPACE_SCOPE.admin],
  'Ana Depo / WMS': [WORKSPACE_SCOPE.anadepo, WORKSPACE_SCOPE.admin],
  'Merkez Mutfak': [WORKSPACE_SCOPE.merkezmutfak, WORKSPACE_SCOPE.admin],
  Ayarlar: [WORKSPACE_SCOPE.center, WORKSPACE_SCOPE.admin],
}

const CENTER_PATHS = new Set([
  '/dashboard',
  '/company',
  '/products',
  '/combo-menu',
  '/semi-products',
  '/options',
  '/option-groups',
  '/prices',
  '/price-changes',
  '/sales-reports',
  '/product-mix-report',
  '/reports',
  '/activity-logs',
  '/advanced-reports',
  '/report-designer',
  '/pnl-report',
  '/stock-items',
  '/movements',
  '/purchasing',
  '/stock-reports',
  '/suppliers',
  '/contracts',
  '/supplier-order-panel',
  '/personel',
  '/musteriler',
  '/cariler',
  '/call-center',
  '/sadakat',
  '/sadakat/kampanya/yeni',
  '/sadakat/kategoriler',
  '/sadakat/kuponlar',
  '/documents',
  '/stock',
  '/recipes',
  '/donem-kapanis',
  '/settings',
  '/hesap-cizelgesi',
  '/muhasebe-eslestirmeleri',
  '/pnl-template',
  '/order-flows',
  '/count-flows',
  '/taxes',
  '/units',
  '/templates',
  '/categories',
  '/sale-categories',
  '/semi-categories',
  '/sales-channels',
  '/positions',
  '/positions/hierarchy',
  '/demo-sales',
  '/tasks',
  '/musteri-yorumlari',
  '/form-sablonlari',
  '/formlar',
  '/geribildirim-kategorileri',
  '/geribildirimler',
  '/kalite-raporlari',
])

const SHARED_PATHS = new Set([
  '/hesap-cizelgesi',
])

function pathMatchesSet(path, pathSet) {
  return [...pathSet].some(basePath => path === basePath || path.startsWith(`${basePath}/`))
}

const BRANCH_PATHS = new Set([
  '/forecast',
  '/orders',
  '/mal-kabul',
  '/sube-personel',
  '/sube-documents',
  '/sube-transfer',
  '/sube-zayi-kaydi',
  '/sube-serbest-kullanim-kaydi',
  '/count',
  '/sube-reports',
  '/uretim',
  '/timer-manager',
  '/pre-shift-settings',
  '/time-tracking',
  '/sube-satis-reports',
  '/sube-product-mix-report',
  '/sube-pnl-report',
  '/sube-stok-reports',
  '/sube-finansal-reports',
  '/sube-tasks',
  '/pos',
  '/garson',
  '/pos-masa',
  '/pos-masalar',
  '/kiosk',
  '/kiosk-big',
  '/kiosk-tablet',
  '/kds',
  '/pickup',
  '/queue',
  '/kiosk-management',
  '/kiosk-management-desktop',
  '/pos-screen',
  '/garson-screen',
  '/kds-screen',
  '/pickup-screen',
  '/sube-geribildirimler',
  '/sube-kalite-raporlari',
  '/sube-formlar',
])

const ANADEPO_PATHS = new Set([
  '/depo-orders',
  '/depo-documents',
  '/depo-count',
  '/depo-transfer',
  '/depo-zayi-kaydi',
  '/depo-serbest-kullanim-kaydi',
  '/depo-formlar',
  '/depo-tasks',
  '/depo-time-tracking',
  '/depo-geribildirimler',
  '/wms-locations',
  '/wms-lpns',
  '/wms-stock-params',
  '/depo-mal-kabul',
])

const MERKEZMUTFAK_PATHS = new Set([
  '/merkezmutfak-uretim',
  '/merkezmutfak-documents',
  '/merkezmutfak-count',
  '/merkezmutfak-transfer',
  '/merkezmutfak-zayi-kaydi',
  '/merkezmutfak-serbest-kullanim-kaydi',
  '/merkezmutfak-formlar',
  '/merkezmutfak-tasks',
  '/merkezmutfak-time-tracking',
  '/merkezmutfak-geribildirimler',
])

export function normalizeWorkspaceScope(value) {
  return WORKSPACE_SCOPE_OPTIONS.some(option => option.value === value) ? value : ''
}

export function isBranchScopedScope(scope) {
  return normalizeWorkspaceScope(scope) === WORKSPACE_SCOPE.branch
}

export function getDefaultPathForScope(scope) {
  return DEFAULT_PATH_BY_SCOPE[normalizeWorkspaceScope(scope)] || '/dashboard'
}

export function getWorkspaceScopeOption(scope) {
  return WORKSPACE_SCOPE_OPTIONS.find(option => option.value === normalizeWorkspaceScope(scope)) || null
}

export function getRequiredScopeForPath(path) {
  if (!path || path === '/') return ''
  if (pathMatchesSet(path, SHARED_PATHS)) return ''
  if (pathMatchesSet(path, CENTER_PATHS)) return WORKSPACE_SCOPE.center
  if (pathMatchesSet(path, BRANCH_PATHS)) return WORKSPACE_SCOPE.branch
  if (pathMatchesSet(path, ANADEPO_PATHS)) return WORKSPACE_SCOPE.anadepo
  if (pathMatchesSet(path, MERKEZMUTFAK_PATHS)) return WORKSPACE_SCOPE.merkezmutfak
  return ''
}

export function canAccessSection(scope, sectionName) {
  const normalizedScope = normalizeWorkspaceScope(scope)
  if (!normalizedScope) return false
  if (normalizedScope === WORKSPACE_SCOPE.admin) return true
  return (SECTION_ACCESS[sectionName] || []).includes(normalizedScope)
}

export function canAccessPath(scope, path) {
  const normalizedScope = normalizeWorkspaceScope(scope)
  if (!path || path === '/') return true
  if (!normalizedScope) return false
  if (normalizedScope === WORKSPACE_SCOPE.admin) return true
  if (pathMatchesSet(path, SHARED_PATHS)) return true
  if (pathMatchesSet(path, CENTER_PATHS)) return normalizedScope === WORKSPACE_SCOPE.center
  if (pathMatchesSet(path, BRANCH_PATHS)) return normalizedScope === WORKSPACE_SCOPE.branch
  if (pathMatchesSet(path, ANADEPO_PATHS)) return normalizedScope === WORKSPACE_SCOPE.anadepo
  if (pathMatchesSet(path, MERKEZMUTFAK_PATHS)) return normalizedScope === WORKSPACE_SCOPE.merkezmutfak
  return false
}
