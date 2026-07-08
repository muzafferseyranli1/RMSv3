import React, { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useWorkspace, WorkspaceBranchScope, WorkspaceGate } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import { getTerminalId, readTerminalConfig } from '@/lib/terminalIdentity'
import { 
  Tv, 
  Smartphone, 
  Grid, 
  Columns, 
  Layers, 
  ShieldCheck, 
  LogOut, 
  RefreshCw, 
  Settings, 
  ChevronRight, 
  Utensils, 
  Clock, 
  Activity, 
  ShoppingBag, 
  DollarSign,
  Maximize2,
  Minimize2
} from 'lucide-react'

// Import target screens directly as lazy loaded components for sandboxing
const POS = lazy(() => import('./POS'))
const Garson = lazy(() => import('./Garson'))
const KDS = lazy(() => import('./KDS'))
const PickupScreen = lazy(() => import('./PickupScreen'))
const QueueScreen = lazy(() => import('./QueueScreen'))

const TERMINAL_CONFIG_CACHE_KEY = 'suitable_terminal_config_v1'
const WORKSPACE_SESSIONS_CACHE_KEY = 'suitable_workspace_section_sessions_v1'
const POS_BRANCH_KEY = 'suitable_pos_branch_id'

export default function MultiDeviceTerminal() {
  const workspace = useWorkspace()
  const [terminal, setTerminal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Pairing State
  const [pairKey, setPairKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [pairError, setPairError] = useState(null)

  // Layout States
  const [layoutMode, setLayoutMode] = useState('dashboard') // 'dashboard' | 'single' | 'split-h' | 'split-v' | 'grid-4'
  const [activeTab, setActiveTab] = useState('pos') // 'pos' | 'garson' | 'kds' | 'pickup' | 'queue'
  
  // Custom split dropdown tabs
  const [pane1Tab, setPane1Tab] = useState('pos')
  const [pane2Tab, setPane2Tab] = useState('kds')
  const [pane3Tab, setPane3Tab] = useState('garson')
  const [pane4Tab, setPane4Tab] = useState('pickup')

  // Theme State
  const [isLightMode, setIsLightMode] = useState(true) // default to light color

  // Dashboard Statistics
  const [stats, setStats] = useState({
    activeOrdersCount: 0,
    kdsPendingCount: 0,
    pickupReadyCount: 0,
    todaySalesCount: 0,
    todayRevenue: 0
  })
  const [statsLoading, setStatsLoading] = useState(false)

  // Sticky menu controls
  const [isMenuExpanded, setIsMenuExpanded] = useState(true)

  // Read terminal configuration on mount
  useEffect(() => {
    const config = readTerminalConfig()
    if (config && config.branchId) {
      setTerminal(config)
      // Double check workspace session auto login
      verifyAndSetupWorkspaceSession(config)
    } else {
      setLoading(false)
    }
  }, [])

  // Auto-login helper to sync terminal configuration with WorkspaceBranchScope
  const verifyAndSetupWorkspaceSession = (config) => {
    try {
      const rawSessions = sessionStorage.getItem(WORKSPACE_SESSIONS_CACHE_KEY)
      let sessions = {}
      if (rawSessions) {
        sessions = JSON.parse(rawSessions)
      }

      const activeBranchSession = sessions?.branch
      if (!activeBranchSession || activeBranchSession.branchId !== config.branchId) {
        // Resolve branch details from context or database to fill out the session
        const branchName = workspace.branches?.find(b => b.id === config.branchId)?.name || 'Eşleştirilmiş Şube'
        
        const sessionPayload = {
          ...sessions,
          branch: {
            sectionKey: 'branch',
            scope: 'branch',
            employee: {
              id: 'terminal',
              name: 'Terminal ' + (config.terminalId ? config.terminalId.slice(-4).toUpperCase() : 'Cihazı'),
              authorityLevel: 'Terminal'
            },
            employeeId: 'terminal',
            employeeName: 'Terminal Cihazı',
            authorityLevel: 'Terminal',
            branchId: config.branchId,
            branchName: branchName,
            workspaceScope: 'branch',
            signedInAt: new Date().toISOString()
          }
        }
        
        sessionStorage.setItem(WORKSPACE_SESSIONS_CACHE_KEY, JSON.stringify(sessionPayload))
        localStorage.setItem(POS_BRANCH_KEY, config.branchId)
        
        // Reload to let workspace context boot with correct session
        window.location.reload()
      } else {
        setLoading(false)
        loadDashboardStats(config.branchId)
      }
    } catch (e) {
      console.error("Auto login configuration error", e)
      setLoading(false)
    }
  }

  // Load dashboard live statistics
  const loadDashboardStats = async (branchId) => {
    if (!branchId) return
    setStatsLoading(true)
    try {
      const nowIso = new Date().toISOString()
      
      // Query active orders (status = 'active')
      const { data: activeOrders } = await db
        .from('sales')
        .select('id')
        .eq('branch_id', branchId)
        .eq('status', 'active')
        .is('deleted_at', null)

      // Query KDS pending/preparing items (kds_status in ['pending', 'in_progress'])
      const { data: kdsPending } = await db
        .from('sales')
        .select('id')
        .eq('branch_id', branchId)
        .in('status', ['completed', 'active'])
        .in('kds_status', ['pending', 'in_progress'])
        .is('deleted_at', null)

      // Query Pickup/Teslim ready orders (kds_status = 'ready', pickup_called = false)
      const { data: pickupReady } = await db
        .from('sales')
        .select('id')
        .eq('branch_id', branchId)
        .in('status', ['completed', 'active'])
        .eq('kds_status', 'ready')
        .is('deleted_at', null)

      // Today's completed sales
      const startOfToday = new Date()
      startOfToday.setHours(0, 0, 0, 0)
      const { data: todaySales } = await db
        .from('sales')
        .select('gross_total_after_discount')
        .eq('branch_id', branchId)
        .eq('status', 'completed')
        .gte('sale_datetime', startOfToday.toISOString())
        .is('deleted_at', null)

      setStats({
        activeOrdersCount: activeOrders?.length || 0,
        kdsPendingCount: kdsPending?.length || 0,
        pickupReadyCount: pickupReady?.length || 0,
        todaySalesCount: todaySales?.length || 0,
        todayRevenue: todaySales?.reduce((sum, s) => sum + (parseFloat(s.gross_total_after_discount) || 0), 0) || 0
      })
    } catch (err) {
      console.error("Dashboard statistics loading failed", err)
    } finally {
      setStatsLoading(false)
    }
  }

  // Handle pair code submission
  const handleVerifyPairCode = async (e) => {
    if (e) e.preventDefault()
    if (pairKey.trim().length < 4) {
      setPairError('Lütfen geçerli bir Pair Key giriniz.')
      return
    }

    setVerifying(true)
    setPairError(null)

    try {
      const normalizedInput = pairKey.toUpperCase().trim()
      const searchCode = normalizedInput.startsWith('SUT-') ? normalizedInput : `SUT-${normalizedInput}`

      // Check DB for activation key
      const { data, error: dbError } = await db
        .from('pos_terminals')
        .select('id, branch_id, device_type, is_master, terminal_role, screen_mode, terminal_name, config_data')
        .eq('activation_code', searchCode)
        .limit(1)

      if (dbError) throw dbError
      const res = data || []

      if (res.length > 0) {
        // Mark terminal as activated/used
        await db.from('pos_terminals').update({ is_used: true }).eq('id', res[0].id)
        
        const payload = {
          terminalId: res[0].id,
          branchId: res[0].branch_id,
          terminalRole: res[0].terminal_role || (res[0].is_master ? 'master' : 'slave'),
          screenMode: res[0].screen_mode || 'pos',
          configData: res[0].config_data || {},
          terminalName: res[0].terminal_name || 'Terminal Cihazı',
          pairedAt: new Date().toISOString()
        }

        // Cache configuration
        localStorage.setItem(TERMINAL_CONFIG_CACHE_KEY, JSON.stringify(payload))
        setTerminal(payload)
        
        // Auto setup workspace context branch variables and reload
        verifyAndSetupWorkspaceSession(payload)
      } else if (pairKey === 'DEV-123') {
        // Dev / Local testing fallback
        const devPayload = {
          terminalId: 'dev-terminal-id',
          branchId: workspace.branches?.[0]?.id || 'dev-branch-id',
          terminalRole: 'master',
          screenMode: 'pos',
          configData: {},
          terminalName: 'Geliştirici Terminali (DEV-123)',
          pairedAt: new Date().toISOString()
        }

        localStorage.setItem(TERMINAL_CONFIG_CACHE_KEY, JSON.stringify(devPayload))
        setTerminal(devPayload)
        
        verifyAndSetupWorkspaceSession(devPayload)
      } else {
        setPairError('Geçersiz Pair Key. Lütfen şubenize tanımlı kodu girin.')
      }
    } catch (err) {
      console.error(err)
      if (pairKey === 'DEV-123') {
        const devPayload = {
          terminalId: 'dev-terminal-id',
          branchId: workspace.branches?.[0]?.id || 'dev-branch-id',
          terminalRole: 'master',
          screenMode: 'pos',
          configData: {},
          terminalName: 'Geliştirici Terminali (DEV-123)',
          pairedAt: new Date().toISOString()
        }
        localStorage.setItem(TERMINAL_CONFIG_CACHE_KEY, JSON.stringify(devPayload))
        setTerminal(devPayload)
        verifyAndSetupWorkspaceSession(devPayload)
      } else {
        setPairError(`Bağlantı Hatası: ${err?.message || err}`)
      }
    } finally {
      setVerifying(false)
    }
  }

  // Handle unpairing terminal
  const handleUnpair = async () => {
    if (!window.confirm('Bu cihazın eşleştirmesini silmek ve sıfırlamak istediğinize emin misiniz?')) return
    try {
      localStorage.removeItem(TERMINAL_CONFIG_CACHE_KEY)
      sessionStorage.removeItem(WORKSPACE_SESSIONS_CACHE_KEY)
      setTerminal(null)
      window.location.reload()
    } catch (e) {
      console.error(e)
    }
  }

  // Render individual pages based on active configuration
  const renderScreenComponent = (screenType) => {
    switch (screenType) {
      case 'pos':
        return <POS />
      case 'garson':
        return <Garson />
      case 'kds':
        return <KDS />
      case 'pickup':
        return <PickupScreen />
      case 'queue':
        return <QueueScreen />
      default:
        return <POS />
    }
  }

  // Define tab configuration
  const tabConfig = [
    { key: 'pos', label: 'POS Kasa', icon: <DollarSign size={18} /> },
    { key: 'garson', label: 'Garson Sipariş', icon: <Utensils size={18} /> },
    { key: 'kds', label: 'Mutfak (KDS)', icon: <Clock size={18} /> },
    { key: 'pickup', label: 'Teslim Ekranı', icon: <ShoppingBag size={18} /> },
    { key: 'queue', label: 'Sıra Takip', icon: <Tv size={18} /> },
  ]

  // Render screen sandbox wrapped in Workspace gate & theme variables
  const renderScreenSandbox = (screenType) => {
    return (
      <div className="sandbox-panel-wrapper" style={{ height: '100%', width: '100%', overflow: 'auto', position: 'relative' }}>
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#fff', color: '#64748b' }}>
            <div style={{ textAlign: 'center' }}>
              <RefreshCw className="spin-animation" size={28} style={{ margin: '0 auto 12px', color: '#f5a623' }} />
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Ekran Yükleniyor...</div>
            </div>
          </div>
        }>
          <WorkspaceBranchScope>
            <WorkspaceGate>
              {renderScreenComponent(screenType)}
            </WorkspaceGate>
          </WorkspaceBranchScope>
        </Suspense>
      </div>
    )
  }

  // 1. Render Loading State
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        fontFamily: "'Inter', sans-serif"
      }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw className="spin-animation" size={36} style={{ color: '#f5a623', margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b', margin: 0 }}>RMS Cihaz Ekranı Yükleniyor</h2>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '6px' }}>Terminal yapılandırması doğrulanıyor...</p>
        </div>
      </div>
    )
  }

  // 2. Render Pairing Mode Screen if not registered
  if (!terminal) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f1f5f9',
        fontFamily: "'Inter', sans-serif",
        padding: '20px'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '460px',
          background: '#ffffff',
          borderRadius: '20px',
          padding: '36px',
          boxShadow: '0 12px 30px -4px rgba(148, 163, 184, 0.22), 0 4px 12px -2px rgba(148, 163, 184, 0.12)',
          border: '1px solid #e2e8f0'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              background: 'rgba(245, 166, 35, 0.08)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#f5a623',
              boxShadow: '0 4px 12px rgba(245, 166, 35, 0.15)'
            }}>
              <ShieldCheck size={30} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: '0 0 6px 0' }}>Multi-Cihaz Eşleştirme</h1>
            <p style={{ color: '#64748b', margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
              Tüm restoran ekranlarını tek panelden yönetmek için cihaz tanımlama anahtarını giriniz.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleVerifyPairCode} style={{ display: 'grid', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Eşleştirme Anahtarı (Pair Key)
              </label>
              <input
                type="text"
                value={pairKey}
                onChange={(e) => setPairKey(e.target.value)}
                placeholder="Örn: SUT-A1B2C3 veya DEV-123"
                autoFocus
                style={{
                  width: '100%',
                  height: '48px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: '15px',
                  fontWeight: 700,
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  outline: 'none',
                  transition: 'all 0.15s ease'
                }}
              />
            </div>

            {pairError && (
              <div style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1px solid #fca5a5',
                color: '#b91c1c',
                fontSize: '12px',
                lineHeight: 1.5,
                fontWeight: 600
              }}>
                {pairError}
              </div>
            )}

            <button
              type="submit"
              disabled={verifying}
              style={{
                width: '100%',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #f5a623, #d97706)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(245, 166, 35, 0.35)',
                transition: 'all 0.15s ease'
              }}
            >
              {verifying ? (
                <RefreshCw className="spin-animation" size={18} />
              ) : (
                <>
                  Cihazı Eşleştir <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Footnotes */}
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Geliştirme veya deneme amacıyla direkt <strong style={{ color: '#64748b' }}>DEV-123</strong> yazıp geçebilirsiniz.
            </span>
          </div>
        </div>
      </div>
    )
  }

  // 3. Render Combined Terminal Main View
  return (
    <div 
      className={isLightMode ? "light-terminal-theme" : ""}
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        fontFamily: "'Inter', sans-serif",
        display: 'flex',
        flexDirection: 'column',
        position: 'relative'
      }}
    >
      {/* Light Theme Dynamic Override Stylesheet */}
      {isLightMode && (
        <style dangerouslySetInnerHTML={{ __html: `
          /* High specificity overrides to convert sub-components to beautiful Light Mode */
          .light-terminal-theme,
          .light-terminal-theme .touch-modal,
          .light-terminal-theme div[style*="background: rgb(15, 23, 42)"],
          .light-terminal-theme div[style*="background:#0f172a"],
          .light-terminal-theme div[style*="background: #0f172a"],
          .light-terminal-theme div[style*="background-color:#0f172a"],
          .light-terminal-theme div[style*="background-color: rgb(15, 23, 42)"] {
            background-color: #f8fafc !important;
            background: #f8fafc !important;
            color: #0f172a !important;
          }

          /* Overwrite dark backgrounds in cards, list items, and modal layers */
          .light-terminal-theme div[style*="background: rgb(30, 41, 59)"],
          .light-terminal-theme div[style*="background:#1e293b"],
          .light-terminal-theme div[style*="background: #1e293b"],
          .light-terminal-theme div[style*="background-color:#1e293b"],
          .light-terminal-theme div[style*="background-color: rgb(30, 41, 59)"],
          .light-terminal-theme div[style*="background: rgb(10, 15, 68)"],
          .light-terminal-theme div[style*="background:#0a0f44"],
          .light-terminal-theme div[style*="background: #0a0f44"],
          .light-terminal-theme div[style*="background-color:#0a0f44"],
          .light-terminal-theme div[style*="background: rgb(11, 18, 73)"],
          .light-terminal-theme div[style*="background:#0b1249"],
          .light-terminal-theme div[style*="background: #0b1249"],
          .light-terminal-theme div[style*="background-color:#0b1249"],
          .light-terminal-theme div[style*="background: rgb(5, 8, 43)"],
          .light-terminal-theme div[style*="background:#05082b"],
          .light-terminal-theme div[style*="background: #05082b"],
          .light-terminal-theme div[style*="background-color:#05082b"] {
            background-color: #ffffff !important;
            background: #ffffff !important;
            color: #0f172a !important;
            border-color: #e2e8f0 !important;
            box-shadow: 0 4px 15px -3px rgba(148, 163, 184, 0.08), 0 2px 6px -2px rgba(148, 163, 184, 0.04) !important;
          }

          /* General text element styling overrides */
          .light-terminal-theme p,
          .light-terminal-theme span,
          .light-terminal-theme h1,
          .light-terminal-theme h2,
          .light-terminal-theme h3,
          .light-terminal-theme h4,
          .light-terminal-theme h5,
          .light-terminal-theme h6,
          .light-terminal-theme label,
          .light-terminal-theme td,
          .light-terminal-theme th,
          .light-terminal-theme .nav-item {
            color: #1e293b !important;
          }

          /* Secondary text contrast adjustments */
          .light-terminal-theme span[style*="color: rgb(203, 213, 225)"],
          .light-terminal-theme span[style*="color: #cbd5e1"],
          .light-terminal-theme span[style*="color: rgb(226, 232, 240)"],
          .light-terminal-theme span[style*="color: #e2e8f0"],
          .light-terminal-theme div[style*="color: rgb(203, 213, 225)"],
          .light-terminal-theme div[style*="color: #cbd5e1"],
          .light-terminal-theme div[style*="color: rgb(226, 232, 240)"],
          .light-terminal-theme div[style*="color: #e2e8f0"],
          .light-terminal-theme span[style*="color: rgb(148, 163, 184)"],
          .light-terminal-theme span[style*="color: #94a3b8"],
          .light-terminal-theme div[style*="color: rgb(148, 163, 184)"],
          .light-terminal-theme div[style*="color: #94a3b8"] {
            color: #64748b !important;
          }

          /* Interactive form fields styling */
          .light-terminal-theme input,
          .light-terminal-theme select,
          .light-terminal-theme textarea {
            background-color: #ffffff !important;
            background: #ffffff !important;
            color: #0f172a !important;
            border: 1px solid #cbd5e1 !important;
          }

          /* Specific overrides for Garson/POS side panels */
          .light-terminal-theme div[style*="border-top: 1px solid rgba(255, 255, 255, 0.08)"],
          .light-terminal-theme div[style*="border-top:1px solid rgba(255,255,255,.08)"] {
            border-top: 1px solid #e2e8f0 !important;
          }

          .light-terminal-theme div[style*="border-left: 1px solid rgba(255, 255, 255, 0.08)"],
          .light-terminal-theme div[style*="border-left:1px solid rgba(255,255,255,.08)"] {
            border-left: 1px solid #e2e8f0 !important;
          }

          .light-terminal-theme div[style*="border: 1px solid rgba(255, 255, 255, 0.12)"],
          .light-terminal-theme div[style*="border:1px solid rgba(255,255,255,.12)"] {
            border: 1px solid #e2e8f0 !important;
          }

          .light-terminal-theme div[style*="background: rgba(255, 255, 255, 0.03)"],
          .light-terminal-theme div[style*="background:rgba(255,255,255,.03)"],
          .light-terminal-theme div[style*="background: rgba(255, 255, 255, 0.06)"],
          .light-terminal-theme div[style*="background:rgba(255,255,255,.06)"] {
            background: #f1f5f9 !important;
            background-color: #f1f5f9 !important;
          }

          /* Buttons secondary overlays */
          .light-terminal-theme button[style*="background: transparent"],
          .light-terminal-theme button[style*="background:transparent"] {
            background: #ffffff !important;
            border: 1.5px solid #cbd5e1 !important;
            color: #475569 !important;
          }

          .light-terminal-theme button[style*="background: transparent"]:hover,
          .light-terminal-theme button[style*="background:transparent"]:hover {
            background: #f8fafc !important;
            border-color: #94a3b8 !important;
          }

          /* Scrollbar styling overrides */
          .light-terminal-theme *::-webkit-scrollbar-thumb {
            background-color: #cbd5e1 !important;
          }

          .light-terminal-theme *::-webkit-scrollbar-track {
            background-color: #f1f5f9 !important;
          }

          /* Overrides for StaffPinGate & PinLoginScreen (light theme compatibility) */
          .light-terminal-theme .pin-login-screen-overlay {
            background: radial-gradient(circle at top, rgba(241, 245, 249, 0.96), rgba(226, 232, 240, 0.99)) !important;
          }

          .light-terminal-theme .pin-login-screen-card {
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            box-shadow: 0 25px 60px -15px rgba(148, 163, 184, 0.25) !important;
          }

          .light-terminal-theme .pin-login-title-label {
            color: #d97706 !important;
          }

          .light-terminal-theme .pin-login-title {
            color: #0f172a !important;
          }

          .light-terminal-theme .pin-login-subtitle {
            color: #475569 !important;
          }

          .light-terminal-theme .pin-login-branch {
            color: #0284c7 !important;
          }

          .light-terminal-theme .pin-login-stars-display {
            background: #f1f5f9 !important;
            border: 1px solid #cbd5e1 !important;
            color: #0f172a !important;
          }

          .light-terminal-theme .pin-login-keypad-btn {
            background: #f1f5f9 !important;
            border: 1px solid #cbd5e1 !important;
            color: #0f172a !important;
          }

          .light-terminal-theme .pin-login-keypad-btn:hover {
            background: #e2e8f0 !important;
          }

          .light-terminal-theme .pin-login-keypad-btn.btn-sil {
            background: #fef2f2 !important;
            border: 1.5px solid #fca5a5 !important;
            color: #b91c1c !important;
          }

          .light-terminal-theme .pin-login-keypad-btn.btn-sil:hover {
            background: #fee2e2 !important;
          }

          .light-terminal-theme .pin-login-submit-btn {
            background: linear-gradient(135deg, #f5a623, #d97706) !important;
            color: #ffffff !important;
            box-shadow: 0 4px 14px rgba(245, 166, 35, 0.3) !important;
          }

          .light-terminal-theme .pin-login-close-btn {
            background: #f1f5f9 !important;
            border: 1px solid #cbd5e1 !important;
            color: #475569 !important;
          }

          /* Left ticket sidebar (Adisyon alanı) width adjustment to 25% */
          .light-terminal-theme div[style*="width: 280px"],
          .light-terminal-theme div[style*="width:280px"],
          .light-terminal-theme div[style*="width: 280"],
          .light-terminal-theme div[style*="width:280"] {
            width: 25% !important;
          }

          /* Force POS page dark blue root background to light theme slate */
          .light-terminal-theme div[style*="background: rgb(0, 0, 58)"],
          .light-terminal-theme div[style*="background: #00003a"],
          .light-terminal-theme div[style*="background:#00003a"],
          .light-terminal-theme div[style*="background-color:#00003a"] {
            background: #f8fafc !important;
            background-color: #f8fafc !important;
          }

          /* Hide/overwrite dark radial gradient in the main content container */
          .light-terminal-theme div[style*="rgba(99, 102, 241"],
          .light-terminal-theme div[style*="rgba(99,102,241"] {
            background: none !important;
            background-color: #f8fafc !important;
          }

          /* Adisyon sidebar background */
          .light-terminal-theme div[style*="background: rgb(10, 15, 68)"],
          .light-terminal-theme div[style*="background:#0a0f44"],
          .light-terminal-theme div[style*="background: #0a0f44"] {
            background-color: #ffffff !important;
            background: #ffffff !important;
            border-right: 1px solid #e2e8f0 !important;
          }

          /* Bottom total block background */
          .light-terminal-theme div[style*="background: rgb(5, 8, 43)"],
          .light-terminal-theme div[style*="background:#05082b"],
          .light-terminal-theme div[style*="background: #05082b"] {
            background-color: #ffffff !important;
            background: #ffffff !important;
            border-top: 1px solid #e2e8f0 !important;
          }

          /* Force white texts to be dark gray */
          .light-terminal-theme div[style*="color: rgb(248, 250, 252)"],
          .light-terminal-theme div[style*="color: #f8fafc"],
          .light-terminal-theme div[style*="color:#f8fafc"],
          .light-terminal-theme div[style*="color: rgb(255, 255, 255)"],
          .light-terminal-theme div[style*="color: #fff"],
          .light-terminal-theme div[style*="color:#fff"],
          .light-terminal-theme span[style*="color: rgb(255, 255, 255)"],
          .light-terminal-theme span[style*="color: #fff"],
          .light-terminal-theme span[style*="color:#fff"] {
            color: #0f172a !important;
          }

          /* Adjust amber/yellow texts to be darker/readable */
          .light-terminal-theme span[style*="color: rgb(251, 191, 36)"],
          .light-terminal-theme span[style*="color: #fbbf24"],
          .light-terminal-theme span[style*="color:#fbbf24"] {
            color: #d97706 !important;
          }

          /* Sidebar guest count reset buttons */
          .light-terminal-theme button[style*="background: rgba(255, 255, 255, 0.04)"],
          .light-terminal-theme button[style*="background:rgba(255,255,255,.04)"] {
            background: #f1f5f9 !important;
            border: 1px solid #cbd5e1 !important;
            color: #0f172a !important;
          }

          /* Sidebar course header */
          .light-terminal-theme div[style*="background: rgba(255, 255, 255, 0.05)"],
          .light-terminal-theme div[style*="background:rgba(255,255,255,.05)"] {
            background: #f1f5f9 !important;
            border: 1px solid #cbd5e1 !important;
          }

          /* Table Catalog cards style overrides */
          .light-terminal-theme button[style*="rgba(15, 23, 42, .52)"],
          .light-terminal-theme button[style*="rgba(15,23,42,.52)"] {
            background: #ffffff !important;
            border: 1px solid #cbd5e1 !important;
            box-shadow: 0 4px 6px -1px rgba(148, 163, 184, 0.05) !important;
          }

          .light-terminal-theme button[style*="rgba(251, 191, 36, .12)"],
          .light-terminal-theme button[style*="rgba(251,191,36,.12)"] {
            background: rgba(245, 166, 35, 0.08) !important;
            border: 1.5px solid #f5a623 !important;
            box-shadow: 0 4px 12px rgba(245, 166, 35, 0.12) !important;
          }

          .light-terminal-theme div[style*="color: rgba(191,219,254,.74)"],
          .light-terminal-theme div[style*="color: rgba(191, 219, 254, .74)"] {
            color: #475569 !important;
          }

          /* Section/hall name labels in tables layout */
          .light-terminal-theme div[style*="color: rgb(147, 197, 253)"],
          .light-terminal-theme div[style*="color: #93c5fd"],
          .light-terminal-theme div[style*="color:#93c5fd"],
          .light-terminal-theme div[style*="color: rgb(186, 230, 253)"],
          .light-terminal-theme div[style*="color: #bae6fd"],
          .light-terminal-theme div[style*="color:#bae6fd"] {
            color: #0284c7 !important;
          }

          /* Header menu selection inactive tabs */
          .light-terminal-theme button[style*="rgba(255, 255, 255, .15)"],
          .light-terminal-theme button[style*="rgba(255,255,255,.15)"] {
            border: 1px solid #cbd5e1 !important;
            color: #475569 !important;
            background: #ffffff !important;
          }

          .light-terminal-theme button[style*="rgba(255, 255, 255, .05)"],
          .light-terminal-theme button[style*="rgba(255,255,255,.05)"] {
            border: 1px solid #cbd5e1 !important;
            color: #475569 !important;
            background: #f1f5f9 !important;
          }




          /* Spin animation definition */
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .spin-animation {
            animation: spin 1.2s linear infinite;
          }
        ` }} />
      )}

      {/* Floating control bar */}
      <div 
        style={{
          background: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          sticky: 'top',
          top: 0,
          zIndex: 4000,
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          {/* Brand/Active terminal info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #f5a623, #d97706)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Tv size={20} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                {terminal.terminalName || 'Cihaz Ekranı'}
                <span style={{
                  padding: '2px 6px',
                  borderRadius: '99px',
                  background: '#d1fae5',
                  color: '#065f46',
                  fontSize: '10px',
                  fontWeight: 800
                }}>
                  Bağlı
                </span>
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Şube: <strong>{workspace.branchName || 'Aktif Şube'}</strong> | Rol: <strong>{terminal.terminalRole?.toUpperCase()}</strong>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          {isMenuExpanded && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <button
                onClick={() => { setLayoutMode('dashboard') }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: layoutMode === 'dashboard' ? 'rgba(245, 166, 35, 0.08)' : 'transparent',
                  color: layoutMode === 'dashboard' ? '#d97706' : '#64748b',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Layers size={16} /> Yönetici Paneli
              </button>

              <div style={{ height: '20px', width: '1px', background: '#e2e8f0', margin: '0 4px' }} />

              {/* Single Screen Tabs */}
              {tabConfig.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setLayoutMode('single')
                    setActiveTab(tab.key)
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    background: (layoutMode === 'single' && activeTab === tab.key) ? 'linear-gradient(135deg, #f5a623, #d97706)' : 'transparent',
                    color: (layoutMode === 'single' && activeTab === tab.key) ? '#ffffff' : '#64748b',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}

              <div style={{ height: '20px', width: '1px', background: '#e2e8f0', margin: '0 4px' }} />

              {/* Layout modes switcher */}
              <button
                onClick={() => setLayoutMode('split-h')}
                title="Yatay Bölünmüş Ekran"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: 'none',
                  background: layoutMode === 'split-h' ? 'rgba(245, 166, 35, 0.08)' : 'transparent',
                  color: layoutMode === 'split-h' ? '#d97706' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <Columns size={18} />
              </button>

              <button
                onClick={() => setLayoutMode('split-v')}
                title="Dikey Bölünmüş Ekran"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: 'none',
                  background: layoutMode === 'split-v' ? 'rgba(245, 166, 35, 0.08)' : 'transparent',
                  color: layoutMode === 'split-v' ? '#d97706' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: 'rotate(90deg)',
                  transition: 'all 0.15s ease'
                }}
              >
                <Columns size={18} />
              </button>

              <button
                onClick={() => setLayoutMode('grid-4')}
                title="4'lü Izgara Panel"
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  border: 'none',
                  background: layoutMode === 'grid-4' ? 'rgba(245, 166, 35, 0.08)' : 'transparent',
                  color: layoutMode === 'grid-4' ? '#d97706' : '#64748b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                <Grid size={18} />
              </button>
            </div>
          )}

          {/* Quick options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Refresh Statistics */}
            <button
              onClick={() => loadDashboardStats(terminal.branchId)}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="İstatistikleri Yenile"
            >
              <RefreshCw className={statsLoading ? "spin-animation" : ""} size={16} />
            </button>

            {/* Toggle header state */}
            <button
              onClick={() => setIsMenuExpanded(!isMenuExpanded)}
              style={{
                padding: '0 12px',
                height: '34px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#64748b',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {isMenuExpanded ? (
                <>
                  <Minimize2 size={14} /> Küçült
                </>
              ) : (
                <>
                  <Maximize2 size={14} /> Menüyü Aç
                </>
              )}
            </button>

            {/* Unpair Terminal button */}
            <button
              onClick={handleUnpair}
              style={{
                padding: '0 12px',
                height: '34px',
                borderRadius: '8px',
                border: '1.5px solid #fca5a5',
                background: '#ffffff',
                color: '#dc2626',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <LogOut size={14} /> Eşleştirmeyi Kaldır
            </button>
          </div>
        </div>

        {/* Live summary bar helper */}
        {layoutMode !== 'dashboard' && isMenuExpanded && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            paddingTop: '10px',
            borderTop: '1px solid #f1f5f9',
            flexWrap: 'wrap'
          }}>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Live Restoran Özeti:</div>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#334155' }}>Aktif Siparişler: <strong>{stats.activeOrdersCount}</strong></span>
              <span style={{ fontSize: '12px', color: '#334155' }}>Mutfakta Bekleyen (KDS): <strong>{stats.kdsPendingCount}</strong></span>
              <span style={{ fontSize: '12px', color: '#334155' }}>Teslime Hazır: <strong>{stats.pickupReadyCount}</strong></span>
              <span style={{ fontSize: '12px', color: '#334155' }}>Bugünkü Ciro: <strong>{stats.todayRevenue.toFixed(2)} ₺</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        
        {/* 1. Dashboard Mode */}
        {layoutMode === 'dashboard' && (
          <div style={{ padding: '30px', maxWidth: '1200px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
              
              {/* Stat 1 */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  <Activity size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Aktif Masalar/Oturumlar</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{stats.activeOrdersCount}</div>
                </div>
              </div>

              {/* Stat 2 */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  <Clock size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Mutfakta Bekleyen</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{stats.kdsPendingCount}</div>
                </div>
              </div>

              {/* Stat 3 */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.08)', color: '#22c55e', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  <ShoppingBag size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Teslime Hazır</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{stats.pickupReadyCount}</div>
                </div>
              </div>

              {/* Stat 4 */}
              <div style={{
                background: '#ffffff',
                borderRadius: '16px',
                padding: '24px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(236, 72, 153, 0.08)', color: '#ec4899', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center' }}>
                  <DollarSign size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Bugünkü Toplam Hasılat</div>
                  <div style={{ fontSize: '26px', fontWeight: 900, color: '#0f172a', marginTop: '4px' }}>{stats.todayRevenue.toFixed(2)} ₺</div>
                </div>
              </div>

            </div>

            {/* Quick access grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0 }}>Ekranları Başlat</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                {tabConfig.map((tab) => (
                  <div 
                    key={tab.key}
                    onClick={() => {
                      setLayoutMode('single')
                      setActiveTab(tab.key)
                    }}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '24px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 10px 20px -5px rgba(148,163,184,0.15)'
                      e.currentTarget.style.borderColor = '#f5a623'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.02)'
                      e.currentTarget.style.borderColor = '#e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: 'rgba(245, 166, 35, 0.06)',
                        color: '#d97706',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {tab.icon}
                      </div>
                      <ChevronRight size={18} style={{ color: '#94a3b8' }} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>{tab.label}</h4>
                      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                        {tab.key === 'pos' && 'Satış, ödeme alma ve sipariş fiş takibi ekranı.'}
                        {tab.key === 'garson' && 'Masa takibi, hızlı servis ve garson sipariş giriş ekranı.'}
                        {tab.key === 'kds' && 'Mutfak hazırlık kuyruğu, ürün durum kontrol paneli.'}
                        {tab.key === 'pickup' && 'Hazırlanan siparişlerin teslimat ve çağrı paneli.'}
                        {tab.key === 'queue' && 'Müşteriler için hazırlanan ve bekleyen sıra durum göstergesi.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 2. Single View Mode */}
        {layoutMode === 'single' && (
          <div style={{ flex: 1, position: 'relative', background: '#f8fafc' }}>
            {renderScreenSandbox(activeTab)}
          </div>
        )}

        {/* 3. Horizontal Split 2-in-1 Mode */}
        {layoutMode === 'split-h' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'row', width: '100%' }}>
            {/* Left Panel */}
            <div style={{ flex: 1, borderRight: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ padding: '8px 16px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>Sol Panel:</span>
                <select 
                  value={pane1Tab}
                  onChange={(e) => setPane1Tab(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane1Tab)}
              </div>
            </div>
            {/* Right Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ padding: '8px 16px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>Sağ Panel:</span>
                <select 
                  value={pane2Tab}
                  onChange={(e) => setPane2Tab(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane2Tab)}
              </div>
            </div>
          </div>
        )}

        {/* 4. Vertical Split 2-in-1 Mode */}
        {layoutMode === 'split-v' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Top Panel */}
            <div style={{ flex: 1, borderBottom: '2px solid #e2e8f0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ padding: '8px 16px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>Üst Panel:</span>
                <select 
                  value={pane1Tab}
                  onChange={(e) => setPane1Tab(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane1Tab)}
              </div>
            </div>
            {/* Bottom Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ padding: '8px 16px', background: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#475569' }}>Alt Panel:</span>
                <select 
                  value={pane2Tab}
                  onChange={(e) => setPane2Tab(e.target.value)}
                  style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #cbd5e1', fontWeight: 700 }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane2Tab)}
              </div>
            </div>
          </div>
        )}

        {/* 5. Grid 4-in-1 Mode */}
        {layoutMode === 'grid-4' && (
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: '4px', background: '#e2e8f0' }}>
            {/* Cell 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', background: '#ffffff', position: 'relative' }}>
              <div style={{ padding: '4px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569' }}>Panel 1:</span>
                <select 
                  value={pane1Tab}
                  onChange={(e) => setPane1Tab(e.target.value)}
                  style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', border: '1px solid #cbd5e1' }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane1Tab)}
              </div>
            </div>
            {/* Cell 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', background: '#ffffff', position: 'relative' }}>
              <div style={{ padding: '4px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569' }}>Panel 2:</span>
                <select 
                  value={pane2Tab}
                  onChange={(e) => setPane2Tab(e.target.value)}
                  style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', border: '1px solid #cbd5e1' }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane2Tab)}
              </div>
            </div>
            {/* Cell 3 */}
            <div style={{ display: 'flex', flexDirection: 'column', background: '#ffffff', position: 'relative' }}>
              <div style={{ padding: '4px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569' }}>Panel 3:</span>
                <select 
                  value={pane3Tab}
                  onChange={(e) => setPane3Tab(e.target.value)}
                  style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', border: '1px solid #cbd5e1' }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane3Tab)}
              </div>
            </div>
            {/* Cell 4 */}
            <div style={{ display: 'flex', flexDirection: 'column', background: '#ffffff', position: 'relative' }}>
              <div style={{ padding: '4px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifySelf: 'center', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#475569' }}>Panel 4:</span>
                <select 
                  value={pane4Tab}
                  onChange={(e) => setPane4Tab(e.target.value)}
                  style={{ padding: '2px 4px', borderRadius: '4px', fontSize: '11px', border: '1px solid #cbd5e1' }}
                >
                  {tabConfig.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                {renderScreenSandbox(pane4Tab)}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
