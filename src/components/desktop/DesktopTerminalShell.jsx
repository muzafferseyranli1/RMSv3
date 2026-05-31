import React, { lazy, Suspense, useState } from 'react'
import PairingScreen from '@/components/pos/PairingScreen'
import { readTerminalConfig } from '@/lib/terminalIdentity'
import { WorkspaceProvider, WorkspaceGate } from '@/context/WorkspaceContext'
import { WORKSPACE_SCOPE } from '@/lib/workspace'
import GlobalUnpairGesture from '@/components/pos/GlobalUnpairGesture'
import GlobalExitButton from '@/components/pos/GlobalExitButton'
import GlobalUpdaterNotification from '@/components/pos/GlobalUpdaterNotification'

const POS = lazy(() => import('@/components/pages/POS'))
const Garson = lazy(() => import('@/components/pages/Garson'))
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

export default function DesktopTerminalShell() {
  const [config, setConfig] = useState(() => readTerminalConfig())
  const isPaired = Boolean(config?.terminalId && config?.branchId && config?.terminalRole && config?.screenMode)

  if (!isPaired) {
    return (
      <PairingScreen
        onComplete={(newConfig) => {
          setConfig(newConfig)
        }}
      />
    )
  }

  // Bypass branch selection modal by saving to local storage
  if (config?.branchId) {
    localStorage.setItem('suitable_rms_workspace_branch_v1', config.branchId)
    localStorage.setItem('suitable_rms_pos_branch_v1', config.branchId)
  }

  const mode = String(config?.screenMode || 'pos').toLowerCase().trim()
  let ComponentToRender = POS
  if (mode === 'garson' || mode === 'masa') {
    ComponentToRender = Garson
  } else if (mode === 'kds') {
    ComponentToRender = KDS
  } else if (mode === 'pickup') {
    ComponentToRender = PickupScreen
  }

  return (
    <>
      <GlobalUnpairGesture />
      <GlobalExitButton />
      <GlobalUpdaterNotification />
      <WorkspaceProvider
        allowedScopes={[WORKSPACE_SCOPE.branch]}
        forcedScope={WORKSPACE_SCOPE.branch}
        forcedBranchId={config.branchId}
      >
        <WorkspaceGate>
          <Suspense fallback={<PageLoader />}>
            <ComponentToRender />
          </Suspense>
        </WorkspaceGate>
      </WorkspaceProvider>
    </>
  )
}
