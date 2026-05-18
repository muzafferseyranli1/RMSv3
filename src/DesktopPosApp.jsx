import React, { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthGate from '@/components/auth/AuthGate'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { WorkspaceGate, WorkspaceProvider, useWorkspace } from '@/context/WorkspaceContext'
import { ToastProvider } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import { WORKSPACE_SCOPE } from '@/lib/workspace'

const POS = lazy(() => import('@/components/pages/POS'))
const Garson = lazy(() => import('@/components/pages/Garson'))
const POSMasa = lazy(() => import('@/components/pages/POSMasa'))
const POSMasalar = lazy(() => import('@/components/pages/POSMasalar'))

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
  return (
    <>
      <RouteActivityTracker />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/garson" element={<Garson />} />
          <Route path="/pos-masa" element={<POSMasa />} />
          <Route path="/pos-masalar" element={<POSMasalar />} />
          <Route path="*" element={<Navigate to="/pos" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default function DesktopPosApp() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate>
          <WorkspaceProvider
            allowedScopes={[WORKSPACE_SCOPE.branch]}
            forcedScope={WORKSPACE_SCOPE.branch}
          >
            <WorkspaceGate>
              <DesktopPosShell />
            </WorkspaceGate>
          </WorkspaceProvider>
        </AuthGate>
      </AuthProvider>
    </ToastProvider>
  )
}
