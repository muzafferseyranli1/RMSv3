import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { POS_BRANCH_KEY } from '@/lib/branchPurchasing'
import {
  findPreferredBranchContext,
  loadBranchContextsFromDb,
  mapBranchContextsToWorkspaceBranches,
} from '@/lib/branchContexts'
import { isPublicDisplayPath } from '@/lib/publicDisplayRoutes'
import {
  WORKSPACE_BRANCH_STORAGE_KEY,
  WORKSPACE_BRANCH_NAME_STORAGE_KEY,
  WORKSPACE_SCOPE,
  WORKSPACE_SCOPE_OPTIONS,
  getRequiredScopeForPath,
  WORKSPACE_SCOPE_STORAGE_KEY,
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
const DEFAULT_ALLOWED_SCOPES = WORKSPACE_SCOPE_OPTIONS.map(option => option.value)

function normalizeAllowedScopes(values) {
  const inputValues = Array.isArray(values) && values.length > 0 ? values : DEFAULT_ALLOWED_SCOPES
  const normalizedValues = inputValues
    .map(value => normalizeWorkspaceScope(value))
    .filter(Boolean)

  return normalizedValues.length > 0
    ? Array.from(new Set(normalizedValues))
    : DEFAULT_ALLOWED_SCOPES
}

function resolveInitialScope({ forcedScope, allowedScopes, storedScope, pathScope }) {
  const normalizedForcedScope = normalizeWorkspaceScope(forcedScope)
  if (normalizedForcedScope) return normalizedForcedScope

  const candidates = [storedScope, pathScope]
    .map(value => normalizeWorkspaceScope(value))
    .filter(value => allowedScopes.includes(value))

  if (candidates.length > 0) return candidates[0]
  if (allowedScopes.length === 1) return allowedScopes[0]
  return ''
}

function readLocalStorage(key, fallback = '') {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function writeLocalStorage(key, value) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    // Best-effort persistence only.
  }
}

function overlayStyle(isBlocking) {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 5000,
    background: isBlocking ? 'linear-gradient(135deg,#0f172a,#1e293b)' : 'rgba(15,23,42,.68)',
    backdropFilter: 'blur(14px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  }
}

function cardStyle(option, active) {
  return {
    padding: 18,
    borderRadius: 18,
    border: `1px solid ${active ? option.accent : 'rgba(148,163,184,.24)'}`,
    background: active ? option.bg : '#fff',
    boxShadow: active ? `0 16px 40px ${option.accent}22` : '0 10px 30px rgba(15,23,42,.08)',
    cursor: 'pointer',
    transition: 'all .18s ease',
    display: 'grid',
    gap: 10,
  }
}

function WorkspacePickerModal({
  scope,
  branchId,
  branchName,
  branches,
  loadingBranches,
  branchLoadError,
  onReloadBranches,
  scopeOptions,
  open,
  canClose,
  onClose,
  onSave,
}) {
  const [draftScope, setDraftScope] = useState(scope || '')
  const [draftBranchId, setDraftBranchId] = useState(branchId || '')
  const [pin, setPin] = useState('')
  const [pinEmployee, setPinEmployee] = useState(null)
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setDraftScope(scope || '')
    setDraftBranchId(branchId || '')
  }, [open, scope, branchId])

  useEffect(() => {
    if (!open) return
    if (draftScope) return
    if (scopeOptions.length !== 1) return
    setDraftScope(scopeOptions[0].value)
  }, [open, draftScope, scopeOptions])

  useEffect(() => {
    setPin('')
    setPinEmployee(null)
    setPinError('')
  }, [draftScope])

  useEffect(() => {
    if (!open) {
      setPin('')
      setPinEmployee(null)
      setPinError('')
    }
  }, [open])

  async function handlePinChange(value) {
    const normalized = normalizePinInput(value)
    setPin(normalized)
    setPinEmployee(null)
    setPinError('')
    if (normalized.length < 4) return
    setPinLoading(true)
    try {
      const employee = await findPersonnelForBranchPin(null, normalized)
      if (employee) {
        setPinEmployee(employee)
        setDraftBranchId(employee.defaultBranchId || '')
      } else {
        setPinError('PIN bulunamadı')
      }
    } catch (err) {
      setPinError('PIN doğrulanamadı: ' + err.message)
    } finally {
      setPinLoading(false)
    }
  }

  function handleSave() {
    if (pinEmployee) {
      try {
        sessionStorage.setItem('rms_active_user', JSON.stringify({
          id: pinEmployee.id,
          firstName: pinEmployee.firstName,
          lastName: pinEmployee.lastName,
          pin: pinEmployee.pin,
          defaultBranchId: pinEmployee.defaultBranchId,
          role: pinEmployee.role,
          positionId: pinEmployee.positionId || '',
        }))
      } catch { /* ignore */ }
    }
    onSave({ scope: draftScope, branchId: draftBranchId })
  }

  const selectedScope = getWorkspaceScopeOption(draftScope)
  const branchRequired = isBranchScopedScope(draftScope)
  const canSubmit = draftScope && pinEmployee && (!branchRequired || draftBranchId)

  if (!open) return null

  return (
    <div style={overlayStyle(!canClose)}>
      <div style={{
        width: 'min(940px, 100%)',
        maxHeight: 'min(88vh, 920px)',
        overflowY: 'auto',
        background: '#f8fafc',
        borderRadius: 28,
        boxShadow: '0 30px 90px rgba(15,23,42,.34)',
        border: '1px solid rgba(255,255,255,.16)',
      }}>
        <div style={{
          padding: '24px 26px 18px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <div>
            <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#6366f1', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              Çalışma Bağlamı
            </div>
            <h2 style={{ margin: 0, fontSize: '1.45rem', color: '#0f172a' }}>
              Uygulama hangi rolde açılsın?
            </h2>
            <p style={{ margin: '8px 0 0', color: '#475569', lineHeight: 1.55 }}>
              İlk girişte hangi ekranda ve hangi şubede olduğumuzu netleştiriyoruz. Böylece menüler,
              POS ve şube operasyonları doğru bağlamda açılıyor.
            </p>
          </div>
          {canClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>

        <div style={{ padding: 26, display: 'grid', gap: 22 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {scopeOptions.map(option => {
              const active = draftScope === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDraftScope(option.value)}
                  style={cardStyle(option, active)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{
                      width: 42,
                      height: 42,
                      borderRadius: 14,
                      background: active ? option.accent : '#e2e8f0',
                      color: active ? '#fff' : '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <i className={`fa-solid ${option.icon}`} />
                    </span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{option.label}</div>
                      <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 2 }}>{option.description}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      border: `2px solid ${active ? option.accent : '#cbd5e1'}`,
                      background: active ? option.accent : 'transparent',
                      color: '#fff',
                      fontSize: '.7rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {active ? <i className="fa-solid fa-check" /> : null}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>

          {draftScope && (
            <div style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 18,
              padding: 18,
              display: 'grid',
              gap: 12,
            }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Personel PIN'i</div>
                <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 4 }}>
                  {branchRequired
                    ? 'Şube modunda uygulamayı kilitlemek için PIN girin. Şube bilgisi PIN\'den otomatik alınır.'
                    : 'Merkez operasyonları ve üretim akışlarında tüm menüleri görmek için PIN girin.'}
                </div>
              </div>
              <div style={{ position: 'relative', maxWidth: 220 }}>
                <input
                  className="f-input"
                  type="text"
                  inputMode="numeric"
                  value={'•'.repeat(pin.length)}
                  onChange={() => {}}
                  onKeyDown={e => {
                    if (e.key === 'Backspace') {
                      handlePinChange(pin.slice(0, -1))
                    } else if (/^[0-9]$/.test(e.key) && pin.length < 6) {
                      handlePinChange(pin + e.key)
                    } else if (e.key !== 'Tab') {
                      e.preventDefault()
                    }
                  }}
                  placeholder="PIN Giriniz"
                  style={{ letterSpacing: '.15em', fontWeight: 700, fontSize: '1.1rem', textAlign: 'center' }}
                  autoFocus
                />
                {pinLoading && (
                  <i className="fa-solid fa-spinner fa-spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                )}
              </div>
              {pinEmployee && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: 12,
                }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    background: '#16a34a',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '.9rem',
                    flexShrink: 0,
                  }}>
                    {(pinEmployee.firstName?.[0] || '?').toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#15803d', fontSize: '.9rem' }}>
                      Hoş geldiniz, {getPersonnelDisplayName(pinEmployee)}
                    </div>
                    {pinEmployee.defaultBranchId && branches.find(b => b.id === pinEmployee.defaultBranchId) && (
                      <div style={{ fontSize: '.76rem', color: '#16a34a', marginTop: 2 }}>
                        <i className="fa-solid fa-location-dot" style={{ marginRight: 4 }} />
                        {branches.find(b => b.id === pinEmployee.defaultBranchId)?.name}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {pinError && (
                <div style={{
                  fontSize: '.82rem',
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fca5a5',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}>
                  <i className="fa-solid fa-circle-xmark" style={{ marginRight: 6 }} />
                  {pinError}
                </div>
              )}
            </div>
          )}

          <div style={{
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: 20,
            padding: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#93c5fd', marginBottom: 5 }}>
                Seçili Bağlam
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800 }}>
                {selectedScope?.label || 'Rol seçilmedi'}
                {pinEmployee && draftBranchId
                  ? ` / ${branches.find(item => item.id === draftBranchId)?.name || ''}`
                  : ''}
              </div>
              <div style={{ fontSize: '.82rem', color: '#94a3b8', marginTop: 4 }}>
                {branchRequired
                  ? 'Şube modunda seçili şube tüm şube ekranlarına varsayılan ve kilitli bağlam olarak gider.'
                  : 'Bu seçim menüde hangi ana alanların gösterileceğini belirler.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {canClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-o"
                >
                  Vazgeç
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                className="btn-p"
                disabled={!canSubmit || loadingBranches}
              >
                <i className="fa-solid fa-arrow-right" /> Devam Et
              </button>
            </div>
          </div>

          {(scope || branchName) && canClose && (
            <div style={{ fontSize: '.8rem', color: '#64748b' }}>
              Mevcut bağlam: <strong>{getWorkspaceScopeOption(scope)?.label || '—'}</strong>
              {scope === WORKSPACE_SCOPE.branch && branchName ? ` / ${branchName}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function WorkspaceProvider({
  children,
  allowedScopes = DEFAULT_ALLOWED_SCOPES,
  forcedScope = '',
  forcedBranchId = '',
}) {
  const location = useLocation()
  const publicKioskPath = isPublicDisplayPath(location.pathname)
  // Desktop terminal modunda (forcedScope + forcedBranchId) picker hiç açılmaz
  const terminalLocked = Boolean(forcedScope && forcedBranchId) || isDesktopMode()
  const normalizedAllowedScopes = normalizeAllowedScopes(allowedScopes)
  const normalizedForcedScope = normalizeWorkspaceScope(forcedScope)
  const initialPathScope = getRequiredScopeForPath(location.pathname)
  const initialStoredScope = readLocalStorage(WORKSPACE_SCOPE_STORAGE_KEY)
  const initialResolvedScope = resolveInitialScope({
    forcedScope: normalizedForcedScope,
    allowedScopes: normalizedAllowedScopes,
    storedScope: initialStoredScope,
    pathScope: initialPathScope,
  })
  const [scope, setScope] = useState(() =>
    initialResolvedScope
  )
  const [branchId, setBranchId] = useState(() =>
    forcedBranchId || readLocalStorage(WORKSPACE_BRANCH_STORAGE_KEY) || readLocalStorage(POS_BRANCH_KEY)
  )
  const [persistedBranchMeta, setPersistedBranchMeta] = useState(() => ({
    id: forcedBranchId || readLocalStorage(WORKSPACE_BRANCH_STORAGE_KEY),
    name: readLocalStorage(WORKSPACE_BRANCH_NAME_STORAGE_KEY),
  }))
  const [branches, setBranches] = useState([])
  const [branchLoadError, setBranchLoadError] = useState('')
  const [loadingBranches, setLoadingBranches] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(() => {
    if (terminalLocked) return false
    const initialBranchId = forcedBranchId || readLocalStorage(WORKSPACE_BRANCH_STORAGE_KEY) || readLocalStorage(POS_BRANCH_KEY)
    if (publicKioskPath) return false
    return !initialResolvedScope || (initialResolvedScope === WORKSPACE_SCOPE.branch && !initialBranchId)
  })
  const scopeOptions = WORKSPACE_SCOPE_OPTIONS.filter(option => (
    normalizedAllowedScopes.includes(option.value)
  ))

  const loadBranches = useCallback(async () => {
    setLoadingBranches(true)
    setBranchLoadError('')

    try {
      const branchContexts = await loadBranchContextsFromDb()
      const nextBranches = mapBranchContextsToWorkspaceBranches(branchContexts)

      setBranches(nextBranches)
      setBranchId(current => {
        const rememberedBranchId =
          forcedBranchId ||
          current ||
          readLocalStorage(WORKSPACE_BRANCH_STORAGE_KEY) ||
          readLocalStorage(POS_BRANCH_KEY)

        const resolved = findPreferredBranchContext(branchContexts, rememberedBranchId)?.branchId
        return resolved || forcedBranchId || ''
      })
    } catch (error) {
      setBranches([])
      setBranchLoadError(error?.message || 'Şube listesi veritabanından okunamadı.')
    } finally {
      setLoadingBranches(false)
    }
  }, [forcedBranchId])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  useEffect(() => {
    if (forcedBranchId) {
      setBranchId(forcedBranchId)
      setPickerOpen(false)
    }
  }, [forcedBranchId])

  useEffect(() => {
    if (!normalizedForcedScope) return
    if (scope === normalizedForcedScope) return
    setScope(normalizedForcedScope)
  }, [scope, normalizedForcedScope])

  useEffect(() => {
    writeLocalStorage(WORKSPACE_SCOPE_STORAGE_KEY, scope)
  }, [scope])

  useEffect(() => {
    writeLocalStorage(WORKSPACE_BRANCH_STORAGE_KEY, branchId)
    if (branchId) writeLocalStorage(POS_BRANCH_KEY, branchId)
  }, [branchId])

  useEffect(() => {
    const resolvedBranchName = branches.find(branch => branch.id === branchId)?.name || ''
    if (resolvedBranchName) {
      setPersistedBranchMeta(current => (
        current.id === branchId && current.name === resolvedBranchName
          ? current
          : { id: branchId, name: resolvedBranchName }
      ))
      return
    }

    if (!branchId) {
      setPersistedBranchMeta(current => (
        current.id || current.name
          ? { id: '', name: '' }
          : current
      ))
      return
    }

    setPersistedBranchMeta(current => (
      current.id === branchId ? current : { id: branchId, name: '' }
    ))
  }, [branchId, branches])

  useEffect(() => {
    writeLocalStorage(WORKSPACE_BRANCH_NAME_STORAGE_KEY, persistedBranchMeta.name || '')
  }, [persistedBranchMeta.name])

  useEffect(() => {
    if (terminalLocked) { setPickerOpen(false); return }
    if (publicKioskPath) return
    if (forcedBranchId) {
      setPickerOpen(false)
      return
    }
    if (!scope) {
      setPickerOpen(true)
      return
    }
    if (isBranchScopedScope(scope) && !branchId) {
      setPickerOpen(true)
    }
  }, [scope, branchId, publicKioskPath, forcedBranchId, terminalLocked])

  useEffect(() => {
    if (scope) return
    if (terminalLocked) return

    const pathScope = getRequiredScopeForPath(location.pathname)
    const nextScope = resolveInitialScope({
      forcedScope: normalizedForcedScope,
      allowedScopes: normalizedAllowedScopes,
      storedScope: '',
      pathScope,
    })
    if (!nextScope) return

    if (nextScope === WORKSPACE_SCOPE.branch) {
      if (loadingBranches) return
      const resolvedBranchId = branchId || findPreferredBranchContext(branches, branchId)?.branchId || ''
      if (!resolvedBranchId) return
      setScope(nextScope)
      setBranchId(resolvedBranchId)
      setPickerOpen(false)
      return
    }

    setScope(nextScope)
    setPickerOpen(false)
  }, [
    scope,
    location.pathname,
    loadingBranches,
    branchId,
    branches,
    normalizedForcedScope,
    normalizedAllowedScopes,
    terminalLocked,
  ])

  const branchName = useMemo(
    () => branches.find(branch => branch.id === branchId)?.name
      || (persistedBranchMeta.id === branchId ? persistedBranchMeta.name || '' : ''),
    [branches, branchId, persistedBranchMeta],
  )

  const hasSelection = !!scope && (!isBranchScopedScope(scope) || !!branchId)

  const saveSelection = useCallback(({ scope: nextScope, branchId: nextBranchId }) => {
    const normalizedScope = normalizedForcedScope || normalizeWorkspaceScope(nextScope)
    if (!normalizedScope) return
    if (!normalizedAllowedScopes.includes(normalizedScope)) return

    const resolvedBranchId = normalizedScope === WORKSPACE_SCOPE.branch
      ? (nextBranchId || branchId || findPreferredBranchContext(branches, branchId)?.branchId || '')
      : (nextBranchId || branchId || '')

    if (normalizedScope === WORKSPACE_SCOPE.branch && !resolvedBranchId) return

    setScope(normalizedScope)
    setBranchId(resolvedBranchId)
    setPickerOpen(false)
  }, [branchId, branches, normalizedAllowedScopes, normalizedForcedScope])

  const closePicker = useCallback(() => {
    if (hasSelection) setPickerOpen(false)
  }, [hasSelection])

  const value = useMemo(() => ({
    scope,
    branchId,
    branchName,
    branches,
    loadingBranches,
    pickerOpen,
    hasSelection,
    branchLocked: isBranchScopedScope(scope) && !!branchId,
    openWorkspacePicker: () => setPickerOpen(true),
    closeWorkspacePicker: closePicker,
    setWorkspaceSelection: saveSelection,
  }), [scope, branchId, branchName, branches, loadingBranches, pickerOpen, hasSelection, closePicker, saveSelection])

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <WorkspacePickerModal
        scope={scope}
        branchId={branchId}
        branchName={branchName}
        branches={branches}
        loadingBranches={loadingBranches}
        branchLoadError={branchLoadError}
        onReloadBranches={loadBranches}
        scopeOptions={scopeOptions}
        open={pickerOpen && !publicKioskPath}
        canClose={hasSelection}
        onClose={closePicker}
        onSave={saveSelection}
      />
    </WorkspaceContext.Provider>
  )
}

export function WorkspaceGate({ children }) {
  const location = useLocation()
  const { hasSelection, loadingBranches } = useWorkspace()

  if (isPublicDisplayPath(location.pathname)) {
    return children
  }

  if (!hasSelection && loadingBranches) {
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
            Çalışma alanı hazırlanıyor
          </div>
          <div style={{ color: '#94a3b8' }}>Şube ve rol bilgileri okunuyor...</div>
        </div>
      </div>
    )
  }

  return children
}

export function WorkspaceBranchScope({ children }) {
  const workspace = useContext(WorkspaceContext)

  if (!workspace) {
    throw new Error('WorkspaceBranchScope must be used within WorkspaceProvider')
  }

  const scopedValue = useMemo(() => ({
    ...workspace,
    scope: WORKSPACE_SCOPE.branch,
    hasSelection: !!workspace.branchId,
    branchLocked: !!workspace.branchId,
  }), [workspace])

  return (
    <WorkspaceContext.Provider value={scopedValue}>
      {children}
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
