import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { POS_BRANCH_KEY } from '@/lib/branchPurchasing'
import {
  loadBranchContextsFromDb,
  mapBranchContextsToWorkspaceBranches,
} from '@/lib/branchContexts'
import { isPublicDisplayPath } from '@/lib/publicDisplayRoutes'
import {
  WORKSPACE_SCOPE,
  getRequiredScopeForPath,
  getWorkspaceScopeOption,
  isBranchScopedScope,
  normalizeWorkspaceScope,
} from '@/lib/workspace'
import {
  findPersonnelForBranchPin,
  getPersonnelDisplayName,
  normalizePinInput,
} from '@/lib/posStaffAuth'
import { isDesktopMode } from '@/lib/terminalIdentity'

const WorkspaceContext = createContext(null)

export const WORKSPACE_SECTION = {
  center: 'center',
  branch: 'branch',
  pos: 'pos',
  warehouse: 'warehouse',
  kitchen: 'kitchen',
  settings: 'settings',
}

const SECTION_SESSION_STORAGE_KEY = 'suitable_workspace_section_sessions_v1'
const SECTION_VISIBILITY_STORAGE_KEY = 'suitable_sidebar_section_visibility_v1'

const SESSION_SECTION_KEYS = [
  WORKSPACE_SECTION.center,
  WORKSPACE_SECTION.branch,
  WORKSPACE_SECTION.warehouse,
  WORKSPACE_SECTION.kitchen,
]

const SECTION_LABELS = {
  [WORKSPACE_SECTION.center]: 'Merkez',
  [WORKSPACE_SECTION.branch]: 'Sube',
  [WORKSPACE_SECTION.pos]: 'POS ve Ekranlar',
  [WORKSPACE_SECTION.warehouse]: 'Ana Depo / WMS',
  [WORKSPACE_SECTION.kitchen]: 'Merkez Mutfak',
  [WORKSPACE_SECTION.settings]: 'Ayarlar',
}

const SECTION_SCOPE = {
  [WORKSPACE_SECTION.center]: WORKSPACE_SCOPE.center,
  [WORKSPACE_SECTION.branch]: WORKSPACE_SCOPE.branch,
  [WORKSPACE_SECTION.pos]: WORKSPACE_SCOPE.branch,
  [WORKSPACE_SECTION.warehouse]: WORKSPACE_SCOPE.anadepo,
  [WORKSPACE_SECTION.kitchen]: WORKSPACE_SCOPE.merkezmutfak,
  [WORKSPACE_SECTION.settings]: WORKSPACE_SCOPE.center,
}

function readJsonStorage(storage, key, fallback) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJsonStorage(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Best-effort persistence only.
  }
}

function writeStringStorage(storage, key, value) {
  try {
    if (value) storage.setItem(key, value)
    else storage.removeItem(key)
  } catch {
    // Best-effort persistence only.
  }
}

function normalizeAuthority(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
}

function getSectionForScope(scope) {
  const normalizedScope = normalizeWorkspaceScope(scope)
  if (normalizedScope === WORKSPACE_SCOPE.branch) return WORKSPACE_SECTION.branch
  if (normalizedScope === WORKSPACE_SCOPE.anadepo) return WORKSPACE_SECTION.warehouse
  if (normalizedScope === WORKSPACE_SCOPE.merkezmutfak) return WORKSPACE_SECTION.kitchen
  return WORKSPACE_SECTION.center
}

function getSessionSectionKey(sectionKey) {
  if (sectionKey === WORKSPACE_SECTION.pos) return WORKSPACE_SECTION.branch
  if (sectionKey === WORKSPACE_SECTION.settings) return WORKSPACE_SECTION.center
  return SESSION_SECTION_KEYS.includes(sectionKey) ? sectionKey : WORKSPACE_SECTION.center
}

function getBranchType(branch) {
  if (!branch) return ''
  if (branch.workspaceScope === WORKSPACE_SCOPE.anadepo) return WORKSPACE_SECTION.warehouse
  if (branch.workspaceScope === WORKSPACE_SCOPE.merkezmutfak) return WORKSPACE_SECTION.kitchen
  return WORKSPACE_SECTION.branch
}

function buildEmployeePayload(employee) {
  if (!employee) return null
  return {
    id: employee.id,
    firstName: employee.firstName,
    middleName: employee.middleName,
    lastName: employee.lastName,
    name: getPersonnelDisplayName(employee),
    pin: employee.pin,
    defaultBranchId: employee.defaultBranchId || '',
    authorityLevel: employee.authorityLevel || '',
    role: employee.role,
    positionId: employee.positionId || '',
  }
}

function buildSectionSession({ sectionKey, scope, employee, branch }) {
  const employeePayload = buildEmployeePayload(employee)
  return {
    sectionKey,
    scope,
    employee: employeePayload,
    employeeId: employeePayload?.id || '',
    employeeName: employeePayload?.name || '',
    authorityLevel: employeePayload?.authorityLevel || '',
    branchId: branch?.id || '',
    branchName: branch?.name || '',
    workspaceScope: branch?.workspaceScope || null,
    signedInAt: new Date().toISOString(),
  }
}

function sanitizeSessions(rawSessions) {
  return SESSION_SECTION_KEYS.reduce((result, key) => {
    const session = rawSessions?.[key]
    if (session && typeof session === 'object' && session.employeeId) {
      result[key] = session
    } else {
      result[key] = null
    }
    return result
  }, {})
}

function resolveTargetPath(targetPath, session) {
  if (!targetPath) return ''
  if (targetPath.includes(':branchId')) {
    if (!session?.branchId) return ''
    return targetPath.replace(':branchId', session.branchId)
  }
  return targetPath
}

function getSessionStatusLabel(sectionKey, session) {
  const key = getSessionSectionKey(sectionKey)
  if (!session) return ''
  if (key === WORKSPACE_SECTION.center) return session.employeeName || ''
  return session.branchName || ''
}

function PageLoader() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg,#0f172a,#1e293b)',
      color: '#e2e8f0',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 10 }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 10 }} />
          Calisma alani hazirlaniyor
        </div>
        <div style={{ color: '#94a3b8' }}>Sube ve rol bilgileri okunuyor...</div>
      </div>
    </div>
  )
}

export function WorkspaceAccessPrompt({ sectionKey, title = '' }) {
  const workspace = useWorkspace()
  const resolvedSection = sectionKey || workspace.activeSectionKey || WORKSPACE_SECTION.center
  const label = workspace.getSectionLabel(resolvedSection)

  return (
    <div className="card" style={{ padding: 24, borderColor: '#bfdbfe', background: '#eff6ff' }}>
      <div style={{ fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>
        {title || label}
      </div>
      <div style={{ fontSize: '.85rem', color: '#1e40af', lineHeight: 1.6 }}>
        Bu ekran {label} baglami ile calisir. Devam etmek icin ilgili basliga PIN ile giris yapin.
      </div>
      <button
        type="button"
        className="btn-p"
        onClick={() => workspace.openSectionLogin(resolvedSection)}
        style={{ marginTop: 16 }}
      >
        <i className="fa-solid fa-key" /> PIN ile Giris
      </button>
    </div>
  )
}

function SectionPinModal({
  branches,
  loadingBranches,
  modalState,
  session,
  onClose,
  onSubmit,
  onLogout,
}) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!modalState.open) return
    setPin('')
    setError('')
    setLoading(false)
  }, [modalState.open, modalState.sectionKey])

  if (!modalState.open) return null

  const sectionKey = modalState.sectionKey || WORKSPACE_SECTION.center
  const label = SECTION_LABELS[sectionKey] || 'Calisma Alani'
  const activeSession = session || null

  async function handleSubmit(event) {
    event.preventDefault()
    const normalizedPin = normalizePinInput(pin)
    if (normalizedPin.length < 4) {
      setError('PIN en az 4 haneli olmalidir.')
      return
    }

    setLoading(true)
    setError('')
    try {
      await onSubmit(sectionKey, normalizedPin, modalState.targetPath || '')
    } catch (err) {
      setError(err?.message || 'PIN dogrulanamadi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 5000,
      background: 'rgba(15,23,42,.58)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: 'min(380px, 100%)',
        background: '#f8fafc',
        borderRadius: 16,
        border: '1px solid rgba(148,163,184,.28)',
        boxShadow: '0 24px 70px rgba(15,23,42,.34)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: '.7rem', fontWeight: 900, color: '#4f46e5', letterSpacing: '.08em', textTransform: 'uppercase' }}>
              {label}
            </div>
            <div style={{ marginTop: 5, fontWeight: 900, color: '#0f172a' }}>
              PIN ile Giris
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 18, display: 'grid', gap: 14 }}>
          {activeSession && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              background: '#ecfdf5',
              border: '1px solid #86efac',
              borderRadius: 12,
            }}>
              <span style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: '#16a34a',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                flexShrink: 0,
              }}>
                {(activeSession.employeeName?.[0] || '?').toUpperCase()}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#15803d', fontWeight: 900, fontSize: '.86rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeSession.employeeName}
                </div>
                {getSessionStatusLabel(sectionKey, activeSession) && (
                  <div style={{ color: '#16a34a', fontSize: '.74rem', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {getSessionStatusLabel(sectionKey, activeSession)}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="f-label">Personel PIN'i</label>
            <input
              className="f-input"
              type="text"
              inputMode="numeric"
              value={'*'.repeat(pin.length)}
              onChange={() => {}}
              onKeyDown={event => {
                if (event.key === 'Backspace') {
                  setPin(current => current.slice(0, -1))
                  return
                }
                if (/^[0-9]$/.test(event.key) && pin.length < 6) {
                  setPin(current => current + event.key)
                  return
                }
                if (event.key !== 'Tab' && event.key !== 'Enter') event.preventDefault()
              }}
              placeholder="PIN Giriniz"
              disabled={loading || loadingBranches}
              autoFocus
              style={{ textAlign: 'center', letterSpacing: '.18em', fontWeight: 900 }}
            />
          </div>

          {error && (
            <div style={{ padding: '9px 11px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: '.8rem', lineHeight: 1.45 }}>
              <i className="fa-solid fa-circle-exclamation" style={{ marginRight: 6 }} />
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: activeSession ? 'space-between' : 'flex-end', alignItems: 'center', gap: 10 }}>
            {activeSession && (
              <button type="button" className="btn-o" onClick={() => onLogout(sectionKey)}>
                <i className="fa-solid fa-arrow-right-from-bracket" /> Cikis Yap
              </button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-o" onClick={onClose}>
                Vazgec
              </button>
              <button type="submit" className="btn-p" disabled={loading || loadingBranches}>
                <i className={loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right'} /> Giris Yap
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export function WorkspaceProvider({
  children,
  forcedScope = '',
  forcedBranchId = '',
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const publicKioskPath = isPublicDisplayPath(location.pathname)
  const terminalLocked = Boolean(forcedScope && forcedBranchId) || isDesktopMode()
  const normalizedForcedScope = normalizeWorkspaceScope(forcedScope)

  const [branches, setBranches] = useState([])
  const [branchLoadError, setBranchLoadError] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [sectionSessions, setSectionSessions] = useState(() => (
    typeof window === 'undefined'
      ? sanitizeSessions({})
      : sanitizeSessions(readJsonStorage(window.sessionStorage, SECTION_SESSION_STORAGE_KEY, {}))
  ))
  const [sectionVisibility, setSectionVisibility] = useState(() => (
    typeof window === 'undefined'
      ? {}
      : readJsonStorage(window.localStorage, SECTION_VISIBILITY_STORAGE_KEY, {})
  ))
  const [pinModal, setPinModal] = useState({ open: false, sectionKey: WORKSPACE_SECTION.center, targetPath: '' })

  const loadBranches = useCallback(async () => {
    setLoadingBranches(true)
    setBranchLoadError('')
    try {
      const branchContexts = await loadBranchContextsFromDb()
      setBranches(mapBranchContextsToWorkspaceBranches(branchContexts))
    } catch (error) {
      setBranches([])
      setBranchLoadError(error?.message || 'Sube listesi veritabanindan okunamadi.')
    } finally {
      setLoadingBranches(false)
    }
  }, [])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  useEffect(() => {
    if (!forcedBranchId || !normalizedForcedScope || branches.length === 0) return
    const sectionKey = getSectionForScope(normalizedForcedScope)
    const branch = branches.find(item => item.id === forcedBranchId)
    setSectionSessions(current => ({
      ...current,
      [sectionKey]: {
        sectionKey,
        scope: normalizedForcedScope,
        employee: null,
        employeeId: 'terminal',
        employeeName: 'Terminal',
        authorityLevel: 'Terminal',
        branchId: forcedBranchId,
        branchName: branch?.name || '',
        workspaceScope: branch?.workspaceScope || null,
        signedInAt: new Date().toISOString(),
      },
    }))
  }, [forcedBranchId, normalizedForcedScope, branches])

  useEffect(() => {
    if (typeof window === 'undefined') return
    writeJsonStorage(window.sessionStorage, SECTION_SESSION_STORAGE_KEY, sectionSessions)
  }, [sectionSessions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    writeJsonStorage(window.localStorage, SECTION_VISIBILITY_STORAGE_KEY, sectionVisibility)
  }, [sectionVisibility])

  const activeScope = normalizedForcedScope || getRequiredScopeForPath(location.pathname) || WORKSPACE_SCOPE.center
  const activeSectionKey = getSectionForScope(activeScope)
  const activeSession = sectionSessions[getSessionSectionKey(activeSectionKey)] || null
  const activeBranch = activeSession?.branchId
    ? branches.find(branch => branch.id === activeSession.branchId) || null
    : null
  const branchId = forcedBranchId || activeSession?.branchId || ''
  const branchName = activeSession?.branchName || activeBranch?.name || ''
  const currentBranch = branchId
    ? (activeBranch || {
      id: branchId,
      branchId,
      name: branchName,
      branchName,
      workspaceScope: activeSession?.workspaceScope || null,
    })
    : null
  const hasSelection = Boolean(terminalLocked || activeSession?.employeeId)
  const scopeOption = getWorkspaceScopeOption(activeScope)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const employee = activeSession?.employee || null
    if (employee) {
      writeJsonStorage(window.sessionStorage, 'rms_active_user', employee)
    } else {
      try { window.sessionStorage.removeItem('rms_active_user') } catch { /* noop */ }
    }
  }, [activeSession])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const branchSession = sectionSessions[WORKSPACE_SECTION.branch]
    writeStringStorage(window.localStorage, POS_BRANCH_KEY, branchSession?.branchId || '')
  }, [sectionSessions])

  const getSectionSession = useCallback((sectionKey) => (
    sectionSessions[getSessionSectionKey(sectionKey)] || null
  ), [sectionSessions])

  const getSectionLabel = useCallback((sectionKey) => (
    SECTION_LABELS[sectionKey] || SECTION_LABELS[getSessionSectionKey(sectionKey)] || 'Calisma Alani'
  ), [])

  const getSectionStatus = useCallback((sectionKey) => (
    getSessionStatusLabel(sectionKey, getSectionSession(sectionKey))
  ), [getSectionSession])

  const isSectionVisible = useCallback((sectionKey) => (
    sectionVisibility[sectionKey] !== false
  ), [sectionVisibility])

  const setSectionVisible = useCallback((sectionKey, visible) => {
    setSectionVisibility(current => ({
      ...current,
      [sectionKey]: Boolean(visible),
    }))
  }, [])

  const toggleSectionVisible = useCallback((sectionKey) => {
    setSectionVisibility(current => ({
      ...current,
      [sectionKey]: current[sectionKey] === false,
    }))
  }, [])

  const openSectionLogin = useCallback((sectionKey = WORKSPACE_SECTION.center, options = {}) => {
    setPinModal({
      open: true,
      sectionKey,
      targetPath: options.targetPath || '',
    })
  }, [])

  const closeSectionLogin = useCallback(() => {
    setPinModal(current => ({ ...current, open: false, targetPath: '' }))
  }, [])

  const logoutSection = useCallback((sectionKey) => {
    const sessionKey = getSessionSectionKey(sectionKey)
    setSectionSessions(current => ({ ...current, [sessionKey]: null }))
    if (pinModal.open && getSessionSectionKey(pinModal.sectionKey) === sessionKey) {
      setPinModal(current => ({ ...current, targetPath: '' }))
    }
  }, [pinModal.open, pinModal.sectionKey])

  const validatePersonnelForSection = useCallback((sectionKey, employee) => {
    if (!employee || employee.deletedAt) {
      throw new Error('Personel bulunamadi veya pasif.')
    }

    const sessionKey = getSessionSectionKey(sectionKey)
    const authority = normalizeAuthority(employee.authorityLevel)
    const defaultBranch = employee.defaultBranchId
      ? branches.find(branch => branch.id === employee.defaultBranchId)
      : null
    const branchType = getBranchType(defaultBranch)

    if (sessionKey === WORKSPACE_SECTION.center) {
      if (authority !== normalizeAuthority('Genel Merkez')) {
        throw new Error('Bu bolum icin Genel Merkez yetkisi gerekir.')
      }
      return buildSectionSession({
        sectionKey: sessionKey,
        scope: WORKSPACE_SCOPE.center,
        employee,
        branch: null,
      })
    }

    if (sessionKey === WORKSPACE_SECTION.branch) {
      if (authority !== normalizeAuthority('Sube') && authority !== normalizeAuthority('Şube')) {
        throw new Error('Bu bolum icin Sube yetkisi gerekir.')
      }
      if (!defaultBranch || branchType !== WORKSPACE_SECTION.branch) {
        throw new Error('Personelin varsayilan subesi gercek sube olmalidir.')
      }
      return buildSectionSession({
        sectionKey: sessionKey,
        scope: WORKSPACE_SCOPE.branch,
        employee,
        branch: defaultBranch,
      })
    }

    if (sessionKey === WORKSPACE_SECTION.warehouse) {
      if (authority !== normalizeAuthority('Operasyon')) {
        throw new Error('Ana Depo icin Operasyon yetkisi gerekir.')
      }
      if (!defaultBranch || branchType !== WORKSPACE_SECTION.warehouse) {
        throw new Error('Personelin varsayilan subesi Ana Depo olmalidir.')
      }
      return buildSectionSession({
        sectionKey: sessionKey,
        scope: WORKSPACE_SCOPE.anadepo,
        employee,
        branch: defaultBranch,
      })
    }

    if (authority !== normalizeAuthority('Operasyon')) {
      throw new Error('Merkez Mutfak icin Operasyon yetkisi gerekir.')
    }
    if (!defaultBranch || branchType !== WORKSPACE_SECTION.kitchen) {
      throw new Error('Personelin varsayilan subesi Merkez Mutfak olmalidir.')
    }
    return buildSectionSession({
      sectionKey: sessionKey,
      scope: WORKSPACE_SCOPE.merkezmutfak,
      employee,
      branch: defaultBranch,
    })
  }, [branches])

  const submitSectionPin = useCallback(async (sectionKey, pin, targetPath = '') => {
    const employee = await findPersonnelForBranchPin('', pin, { preferCache: false })
    const session = validatePersonnelForSection(sectionKey, employee)

    setSectionSessions(current => ({
      ...current,
      [session.sectionKey]: session,
    }))
    setPinModal(current => ({ ...current, open: false, targetPath: '' }))

    const nextPath = resolveTargetPath(targetPath, session)
    if (nextPath && !publicKioskPath) navigate(nextPath)
  }, [navigate, publicKioskPath, validatePersonnelForSection])

  const resolveSectionPath = useCallback((sectionKey, path) => (
    resolveTargetPath(path, getSectionSession(sectionKey))
  ), [getSectionSession])

  const value = useMemo(() => ({
    scope: activeScope,
    scopeOption,
    branchId,
    branchName,
    branch: currentBranch,
    currentBranch,
    branches,
    loadingBranches,
    branchLoadError,
    hasSelection,
    pickerOpen: pinModal.open,
    branchLocked: (isBranchScopedScope(activeScope) || activeScope === WORKSPACE_SCOPE.anadepo || activeScope === WORKSPACE_SCOPE.merkezmutfak) && !!branchId,
    activeSectionKey,
    activeSession,
    sectionSessions,
    sectionVisibility,
    getSectionSession,
    getSectionLabel,
    getSectionStatus,
    isSectionVisible,
    setSectionVisible,
    toggleSectionVisible,
    openSectionLogin,
    closeSectionLogin,
    logoutSection,
    resolveSectionPath,
    reloadBranches: loadBranches,
    terminalLocked,
  }), [
    activeScope,
    scopeOption,
    branchId,
    branchName,
    currentBranch,
    branches,
    loadingBranches,
    branchLoadError,
    hasSelection,
    pinModal.open,
    activeSectionKey,
    activeSession,
    sectionSessions,
    sectionVisibility,
    getSectionSession,
    getSectionLabel,
    getSectionStatus,
    isSectionVisible,
    setSectionVisible,
    toggleSectionVisible,
    openSectionLogin,
    closeSectionLogin,
    logoutSection,
    resolveSectionPath,
    loadBranches,
    terminalLocked,
  ])

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {!terminalLocked && (
        <SectionPinModal
          branches={branches}
          loadingBranches={loadingBranches}
          modalState={pinModal}
          session={getSectionSession(pinModal.sectionKey)}
          onClose={closeSectionLogin}
          onSubmit={submitSectionPin}
          onLogout={logoutSection}
        />
      )}
    </WorkspaceContext.Provider>
  )
}

export function WorkspaceGate({ children }) {
  const location = useLocation()
  const { loadingBranches } = useWorkspace()

  if (isPublicDisplayPath(location.pathname)) return children
  if (loadingBranches) return <PageLoader />
  return children
}

export function WorkspaceBranchScope({ children }) {
  const workspace = useContext(WorkspaceContext)

  if (!workspace) {
    throw new Error('WorkspaceBranchScope must be used within WorkspaceProvider')
  }

  const branchSession = workspace.getSectionSession(WORKSPACE_SECTION.branch)
  const scopedValue = useMemo(() => ({
    ...workspace,
    scope: WORKSPACE_SCOPE.branch,
    activeSectionKey: WORKSPACE_SECTION.branch,
    activeSession: branchSession,
    branchId: branchSession?.branchId || '',
    branchName: branchSession?.branchName || '',
    branch: branchSession?.branchId
      ? {
        id: branchSession.branchId,
        branchId: branchSession.branchId,
        name: branchSession.branchName,
        branchName: branchSession.branchName,
        workspaceScope: branchSession.workspaceScope || null,
      }
      : null,
    currentBranch: branchSession?.branchId
      ? {
        id: branchSession.branchId,
        branchId: branchSession.branchId,
        name: branchSession.branchName,
        branchName: branchSession.branchName,
        workspaceScope: branchSession.workspaceScope || null,
      }
      : null,
    hasSelection: Boolean(workspace.terminalLocked || branchSession?.employeeId),
    branchLocked: Boolean(branchSession?.branchId),
  }), [workspace, branchSession])

  return (
    <WorkspaceContext.Provider value={scopedValue}>
      {scopedValue.hasSelection ? children : <WorkspaceAccessPrompt sectionKey={WORKSPACE_SECTION.branch} />}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}
