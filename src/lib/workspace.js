export const WORKSPACE_SCOPE = {
  center: 'center',
  warehouse: 'warehouse',
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
    value: WORKSPACE_SCOPE.warehouse,
    label: 'Ana Depo / Merkez Mutfak',
    description: 'Ana depo ve uretim akislarinda calisin.',
    icon: 'fa-warehouse',
    accent: '#34d399',
    bg: 'rgba(52,211,153,.14)',
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
  [WORKSPACE_SCOPE.warehouse]: '/merkez-orders',
  [WORKSPACE_SCOPE.branch]: '/forecast',
  [WORKSPACE_SCOPE.admin]: '/dashboard',
}

const SECTION_ACCESS = {
  'Merkez İşlemleri': [WORKSPACE_SCOPE.center, WORKSPACE_SCOPE.admin],
  'Şube İşlemleri': [WORKSPACE_SCOPE.branch, WORKSPACE_SCOPE.admin],
  'POS ve Ekranlar': [WORKSPACE_SCOPE.branch, WORKSPACE_SCOPE.admin],
  'Merkez Depo / Üretim': [WORKSPACE_SCOPE.warehouse, WORKSPACE_SCOPE.admin],
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
])

const WAREHOUSE_PATHS = new Set([
  '/merkez-orders',
  '/merkez-uretim',
  '/merkez-documents',
  '/merkez-count',
  '/merkez-transfer',
  '/merkez-zayi-kaydi',
  '/merkez-serbest-kullanim-kaydi',
  '/merkez-time-tracking/timers',
  '/merkez-time-tracking/timers/presets',
  '/merkez-tasks',
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
  if (SHARED_PATHS.has(path)) return ''
  if (pathMatchesSet(path, CENTER_PATHS)) return WORKSPACE_SCOPE.center
  if (pathMatchesSet(path, BRANCH_PATHS)) return WORKSPACE_SCOPE.branch
  if (pathMatchesSet(path, WAREHOUSE_PATHS)) return WORKSPACE_SCOPE.warehouse
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
  if (SHARED_PATHS.has(path)) return true
  if (pathMatchesSet(path, CENTER_PATHS)) return normalizedScope === WORKSPACE_SCOPE.center
  if (pathMatchesSet(path, BRANCH_PATHS)) return normalizedScope === WORKSPACE_SCOPE.branch
  if (pathMatchesSet(path, WAREHOUSE_PATHS)) return normalizedScope === WORKSPACE_SCOPE.warehouse
  return false
}
