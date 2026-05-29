import React, { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthGate from '@/components/auth/AuthGate'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { WorkspaceGate, WorkspaceProvider, useWorkspace } from '@/context/WorkspaceContext'
import { ToastProvider } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import { WORKSPACE_SCOPE } from '@/lib/workspace'
import { getStartupPath, readTerminalConfig } from '@/lib/terminalIdentity'
import PairingScreen from '@/components/pos/PairingScreen'

const POS = lazy(() => import('@/components/pages/POS'))
const Garson = lazy(() => import('@/components/pages/Garson'))
const POSMasa = lazy(() => import('@/components/pages/POSMasa'))
const POSMasalar = lazy(() => import('@/components/pages/POSMasalar'))
const KDS = lazy(() => import('@/components/pages/KDS'))
const PickupScreen = lazy(() => import('@/components/pages/PickupScreen'))

function PageLoader() {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
      Sayfa yukleniyor...
    </div>
  )
}

function RouteActivityTracker() {
  const location = useLocation()
  const { user } = useAuth()
  const { scope, branchId } = useWorkspace()
  const lastRouteKeyRef = useRef('')

  useEffect(() => {
    if (!user?.id) return

    const routeKey = `${location.pathname}${location.search}${location.hash}`
    if (lastRouteKeyRef.current === routeKey) return
    lastRouteKeyRef.current = routeKey

    logActivity({
      user,
      actionType: 'route_view',
      route: location.pathname,
      metadata: {
        search: location.search || null,
        hash: location.hash || null,
        scope: scope || null,
        branch_id: branchId || null,
        desktop_mode: true,
      },
    })
  }, [location.pathname, location.search, location.hash, user, scope, branchId])

  return null
}

function DesktopPosShell() {
  const startPath = getStartupPath()

  return (
    <>
      <RouteActivityTracker />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to={startPath} replace />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/garson" element={<Garson />} />
          <Route path="/pos-masa" element={<POSMasa />} />
          <Route path="/pos-masalar" element={<POSMasalar />} />
          <Route path="/kds" element={<KDS />} />
          <Route path="/pickup" element={<PickupScreen />} />
          <Route path="*" element={<Navigate to={startPath} replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

function PairingGuard({ children }) {
  const config = readTerminalConfig()
  const isPaired = Boolean(config?.terminalId && config?.branchId && config?.terminalRole && config?.screenMode)

  if (!isPaired) {
    return <PairingScreen onComplete={() => window.location.reload()} />
  }

  return children
}

export default function DesktopPosApp() {
  // Terminal eşleşmesi yapılmışsa, branchId'yi localStorage'a yazarak 
  // WorkspaceContext'in PIN/Şube sormasını (PickerModal) bypass et.
  const config = readTerminalConfig()
  if (config?.branchId) {
    localStorage.setItem('suitable_rms_workspace_branch_v1', config.branchId)
    localStorage.setItem('suitable_rms_pos_branch_v1', config.branchId)
  }

  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate>
          <WorkspaceProvider
            allowedScopes={[WORKSPACE_SCOPE.branch]}
            forcedScope={WORKSPACE_SCOPE.branch}
          >
            <WorkspaceGate>
              <PairingGuard>
                <DesktopPosShell />
              </PairingGuard>
            </WorkspaceGate>
          </WorkspaceProvider>
        </AuthGate>
      </AuthProvider>
    </ToastProvider>
  )
}
