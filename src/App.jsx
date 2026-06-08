import React, { lazy, Suspense, useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AuthGate from '@/components/auth/AuthGate'
import Sidebar from '@/components/layout/Sidebar'
import Placeholder from '@/components/ui/Placeholder'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { WorkspaceBranchScope, WorkspaceGate, WorkspaceProvider, useWorkspace } from '@/context/WorkspaceContext'
import { ToastProvider } from '@/hooks/useToast'
import { logActivity } from '@/lib/activityLogger'
import { isPublicDisplayPath } from '@/lib/publicDisplayRoutes'
import { canAccessPath, getDefaultPathForScope } from '@/lib/workspace'
import { SidebarProvider, useSidebar } from '@/context/SidebarContext'
import { isDesktopMode } from '@/lib/terminalIdentity'
import { useParams, useSearchParams } from 'react-router-dom'

const DesktopTerminalShell = lazy(() => import('@/components/desktop/DesktopTerminalShell'))
const Dashboard = lazy(() => import('@/components/pages/Dashboard'))
const Suppliers = lazy(() => import('@/components/pages/Suppliers'))
const Units = lazy(() => import('@/components/pages/Units'))
const Categories = lazy(() => import('@/components/pages/Categories'))
const Taxes = lazy(() => import('@/components/pages/Taxes'))
const Company = lazy(() => import('@/components/pages/Company (1).jsx'))
const Templates = lazy(() => import('@/components/pages/Templates'))
const StockItems = lazy(() => import('@/components/pages/StockItems'))
const InventoryMovements = lazy(() => import('@/components/pages/InventoryMovements'))
const SaleItems = lazy(() => import('@/components/pages/SaleItems'))
const ComboMenu = lazy(() => import('@/components/pages/ComboMenu'))
const ComboMenuBackofficePreview = lazy(() => import('@/components/pages/ComboMenuBackofficePreview'))
const SemiProducts = lazy(() => import('@/components/pages/SemiProducts'))
const Options = lazy(() => import('@/components/pages/Options'))
const SaleCategories = lazy(() => import('@/components/pages/SaleCategories'))
const SemiCategories = lazy(() => import('@/components/pages/SemiCategories'))
const SalesChannels = lazy(() => import('@/components/pages/SalesChannels'))
const Prices = lazy(() => import('@/components/pages/Prices'))
const PriceChanges = lazy(() => import('@/components/pages/PriceChanges'))
const Settings = lazy(() => import('@/components/pages/Settings'))
const DeviceSettings = lazy(() => import('@/components/pages/DeviceSettings'))
const ChartOfAccounts = lazy(() => import('@/components/pages/ChartOfAccounts'))
const AccountingMappings = lazy(() => import('@/components/pages/AccountingMappings'))
const PnLTemplateBuilder = lazy(() => import('@/components/pages/PnLTemplateBuilder'))
const PnLReport = lazy(() => import('@/components/pages/PnLReport'))
const Positions = lazy(() => import('@/components/pages/Positions'))
const PositionHierarchy = lazy(() => import('@/components/pages/PositionHierarchy'))
const Personnel = lazy(() => import('@/components/pages/Personnel'))
const BranchPersonnel = lazy(() => import('@/components/pages/BranchPersonnel'))
const DemoSales = lazy(() => import('@/components/pages/DemoSales'))
const OptionGroups = lazy(() => import('@/components/pages/OptionGroups'))
const Production = lazy(() => import('@/components/pages/Production'))
const Forecast = lazy(() => import('@/components/pages/Forecast'))
const Reports = lazy(() => import('@/components/pages/Reports'))
const ReportDesigner = lazy(() => import('@/components/pages/ReportDesigner'))
const ActivityLogs = lazy(() => import('@/components/pages/ActivityLogs'))
const Documents = lazy(() => import('@/components/pages/Documents'))
const InventoryOperationRecord = lazy(() => import('@/components/pages/InventoryOperationRecord'))
const InventoryTransfer = lazy(() => import('@/components/pages/InventoryTransfer'))
const PreShiftSettings = lazy(() => import('@/components/pages/PreShiftSettings'))
const ShiftPlanner = lazy(() => import('@/components/pages/ShiftPlanner'))
const TimerManager = lazy(() => import('@/components/pages/TimerManager'))
const TimeTrackingTimerPresets = lazy(() => import('@/components/pages/TimeTrackingTimerPresets'))
const PeriodClose = lazy(() => import('@/components/pages/PeriodClose'))
const Contracts = lazy(() => import('@/components/pages/Contracts'))
const Musteriler = lazy(() => import('@/components/pages/Musteriler'))
const OrderHub = lazy(() => import('@/components/pages/OrderHub'))
const PurchasingManager = lazy(() => import('@/components/pages/PurchasingManager'))
const SupplierOrderPanel = lazy(() => import('@/components/pages/SupplierOrderPanel'))
const Tasks = lazy(() => import('@/components/pages/Tasks'))
const LoyaltyManagement = lazy(() => import('@/components/pages/LoyaltyManagement'))
const LoyaltyCampaignWizard = lazy(() => import('@/components/loyalty/LoyaltyCampaignWizard'))
const LoyaltyCustomerCategories = lazy(() => import('@/components/pages/LoyaltyCustomerCategories'))
const LoyaltyCouponSets = lazy(() => import('@/components/pages/LoyaltyCouponSets'))
const LoyaltyReferralPrograms = lazy(() => import('@/components/pages/LoyaltyReferralPrograms'))
const TableManagement = lazy(() => import('@/components/pages/TableManagement'))
const MobileAppShells = lazy(() => import('@/components/pages/MobileAppShells'))
const OrderFlows = lazy(() => import('@/components/pages/OrderFlows'))
const CountFlows = lazy(() => import('@/components/pages/CountFlows'))
const Count = lazy(() => import('@/components/pages/Count'))
const POS = lazy(() => import('@/components/pages/POS'))
const Garson = lazy(() => import('@/components/pages/Garson'))
const Orders = lazy(() => import('@/components/pages/Orders'))
const CustomerAppAdminSettings = lazy(() => import('@/components/pages/CustomerAppAdminSettings'))
const CustomerMobileAppPage = lazy(() => import('@/components/pages/CustomerMobileAppPage'))
const QrMenuStandalone = lazy(() => import('@/components/pages/QrMenuStandalone'))
const KioskBig = lazy(() => import('@/components/pages/KioskBig'))
const KioskTablet = lazy(() => import('@/components/pages/KioskTablet'))
const KioskBackupPreview = lazy(() => import('@/components/pages/KioskBackupPreview'))
const KioskManagementDesktop = lazy(() => import('@/components/pages/KioskManagementDesktop'))
const MalKabul = lazy(() => import('@/components/pages/MalKabul'))
const KDS = lazy(() => import('@/components/pages/KDS'))
const PickupScreen = lazy(() => import('@/components/pages/PickupScreen'))
const QueueScreen = lazy(() => import('@/components/pages/QueueScreen'))
const PublicQueueScreen = lazy(() => import('@/components/pages/PublicQueueScreen'))
const ScreenFrame = lazy(() => import('@/components/pos/ScreenFrame'))
const DesignDemo = lazy(() => import('@/components/pages/DesignDemo'))
const TicketCategories = lazy(() => import('@/components/pages/TicketCategories'))
const FeedbackManagement = lazy(() => import('@/components/pages/FeedbackManagement'))

const FormTemplates = lazy(() => import('@/components/pages/FormTemplates'))
const FormSubmissions = lazy(() => import('@/components/pages/FormSubmissions'))
const ManualManagement = lazy(() => import('@/components/pages/ManualManagement'))
const ManualReader = lazy(() => import('@/components/pages/ManualReader'))
const EquipmentManagement = lazy(() => import('@/components/pages/EquipmentManagement'))
const PublicSurvey = lazy(() => import('@/components/pages/PublicSurvey'))
const TaskManager = lazy(() => import('@/components/pages/TaskManager'))
const Workflows = lazy(() => import('@/components/pages/Workflows'))
const WmsLocations = lazy(() => import('@/components/pages/WmsLocations'))
const WmsLpns = lazy(() => import('@/components/pages/WmsLpns'))
const WmsStockParams = lazy(() => import('@/components/pages/WmsStockParams'))

const POS_ROUTES = ['/pos', '/garson', '/pos-masa', '/pos-masalar', '/kiosk', '/kiosk-big', '/kiosk-tablet', '/kiosk-link', '/pos-loyalty-link', '/kds', '/pickup', '/queue', '/sira-ekrani', '/pos-screen', '/garson-screen', '/kds-screen', '/pickup-screen', '/q', '/anket']
const CHUNK_RELOAD_KEY = 'suitable-rms:chunk-reload'

function isDynamicImportError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('chunkloaderror')
  )
}

function PageLoader() {
  return (
    <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
      Sayfa yükleniyor...
    </div>
  )
}

function QrRedirector() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const branch = params.get('b') || params.get('branch')
  if (!branch || !token) {
    return <div style={{ padding: 20 }}>Geçersiz veya eksik QR kodu. Lütfen geçerli bir masa QR kodu okutun.</div>
  }
  return <Navigate to={`/mobil-app/qr-menu?branch=${branch}&tableToken=${token}`} replace />
}

function WarehouseBranchRoute({ title, children }) {
  const { branchId, branchName, openWorkspacePicker } = useWorkspace()

  if (branchId) return children

  return (
    <div className="card" style={{ padding: 24, borderColor: '#bfdbfe', background: '#eff6ff' }}>
      <div style={{ fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: '.85rem', color: '#1e40af', lineHeight: 1.6 }}>
        Bu ekran branch baglami ile calisir. Merkez depo / mutfak alaninda devam etmek icin once bir sube secin.
        {branchName ? ` Mevcut secili sube: ${branchName}.` : ''}
      </div>
      <button
        type="button"
        className="btn-p"
        onClick={openWorkspacePicker}
        style={{ marginTop: 16 }}
      >
        <i className="fa-solid fa-store" /> Sube Sec
      </button>
    </div>
  )
}

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, autoReloading: false }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('Page render error:', error)
    if (isDynamicImportError(error)) {
      try {
        const lastReloadPath = window.sessionStorage.getItem(CHUNK_RELOAD_KEY)
        if (lastReloadPath !== window.location.pathname) {
          window.sessionStorage.setItem(CHUNK_RELOAD_KEY, window.location.pathname)
          this.setState({ autoReloading: true }, () => {
            window.setTimeout(() => window.location.reload(), 150)
          })
        }
      } catch {
        window.setTimeout(() => window.location.reload(), 150)
      }
    }
  }

  render() {
    if (this.state.error) {
      if (this.state.autoReloading) {
        return (
          <div className="card" style={{ padding: 24, borderColor: '#bfdbfe', background: '#eff6ff' }}>
            <div style={{ fontWeight: 800, color: '#1d4ed8', marginBottom: 8 }}>Sayfa guncelleniyor</div>
            <div style={{ fontSize: '.85rem', color: '#1e40af', lineHeight: 1.5 }}>
              Uygulamanin yeni surumu algilandi. Sayfa otomatik yenileniyor...
            </div>
          </div>
        )
      }

      return (
        <div className="card" style={{ padding: 24, borderColor: '#fecaca', background: '#fff7f7' }}>
          <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>Sayfa yüklenemedi</div>
          <div style={{ fontSize: '.85rem', color: '#7f1d1d', lineHeight: 1.5 }}>
            {this.state.error?.message || 'Bilinmeyen bir hata oluştu.'}
          </div>
          {isDynamicImportError(this.state.error) && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: '10px 14px',
                borderRadius: 10,
                border: 'none',
                background: '#dc2626',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Sayfayi Yenile
            </button>
          )}
        </div>
      )
    }
    return this.props.children
  }
}

function RouteActivityTracker() {
  const location = useLocation()
  const { user } = useAuth()
  const { scope, branchId } = useWorkspace()
  const lastRouteKeyRef = useRef('')
  const lastLogAtRef = useRef(0)
  const ROUTE_LOG_MIN_INTERVAL_MS = 4000

  useEffect(() => {
    if (!user?.id) return

    const routeKey = location.pathname
    if (lastRouteKeyRef.current === routeKey) return
    const now = Date.now()
    if (now - lastLogAtRef.current < ROUTE_LOG_MIN_INTERVAL_MS) return
    lastRouteKeyRef.current = routeKey
    lastLogAtRef.current = now

    void logActivity({
      user,
      actionType: 'route_view',
      route: location.pathname,
      metadata: {
        scope: scope || null,
        branch_id: branchId || null,
      },
    })
  }, [location.pathname, user, scope, branchId])

  return null
}

function AdminLayout({ children }) {
  const { sidebarWidth, mode } = useSidebar()
  const pl = mode === 'closed' ? 28 : sidebarWidth + 28
  return (
    <div
      id="main"
      style={{
        minHeight: '100vh',
        background: 'var(--app-bg)',
        paddingTop: 24,
        paddingRight: 28,
        paddingBottom: 24,
        paddingLeft: pl,
        transition: 'padding-left .25s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {children}
    </div>
  )
}

function AppShell() {
  const location = useLocation()
  const { scope } = useWorkspace()
  const defaultPath = getDefaultPathForScope(scope)
  const isPublicDisplay = isPublicDisplayPath(location.pathname)
  const isPOS = POS_ROUTES.some(route => (
    location.pathname === route || location.pathname.startsWith(`${route}/`)
  ))

  useEffect(() => {
    try {
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    } catch {
      // no-op
    }
  }, [location.pathname])

  if (isDesktopMode()) {
    return (
      <PageErrorBoundary key="desktop-shell">
        <Suspense fallback={<PageLoader />}>
          <DesktopTerminalShell />
        </Suspense>
      </PageErrorBoundary>
    )
  }

  if (!isPublicDisplay && scope && location.pathname !== '/' && !canAccessPath(scope, location.pathname)) {
    return <Navigate to={defaultPath} replace />
  }

  if (isPOS) {
    return (
      <PageErrorBoundary key={location.pathname}>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/pos" element={<WorkspaceBranchScope><WorkspaceGate><POS /></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/garson" element={<WorkspaceBranchScope><WorkspaceGate><Garson /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk" element={<WorkspaceBranchScope><WorkspaceGate><KioskBig /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk-big" element={<WorkspaceBranchScope><WorkspaceGate><KioskBig /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk-tablet" element={<WorkspaceBranchScope><WorkspaceGate><KioskTablet /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk/backup" element={<WorkspaceBranchScope><WorkspaceGate><KioskBackupPreview /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk/backup/:backupId" element={<WorkspaceBranchScope><WorkspaceGate><KioskBackupPreview /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk/big" element={<WorkspaceBranchScope><WorkspaceGate><KioskBig /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk/tablet" element={<WorkspaceBranchScope><WorkspaceGate><KioskTablet /></WorkspaceGate></WorkspaceBranchScope>} />
              <Route path="/kiosk-link/:token" element={<CustomerMobileAppPage linkChannel="kiosk" />} />
              <Route path="/pos-loyalty-link" element={<CustomerMobileAppPage />} />
              <Route path="/pos-loyalty-link/:token" element={<CustomerMobileAppPage linkChannel="pos" />} />
            <Route path="/kds" element={<WorkspaceBranchScope><WorkspaceGate><KDS /></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/pickup" element={<WorkspaceBranchScope><WorkspaceGate><PickupScreen /></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/queue" element={<WorkspaceBranchScope><WorkspaceGate><QueueScreen /></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/sira-ekrani/:code" element={<PublicQueueScreen />} />
            <Route path="/pos-screen" element={<WorkspaceBranchScope><WorkspaceGate><ScreenFrame><POS /></ScreenFrame></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/garson-screen" element={<WorkspaceBranchScope><WorkspaceGate><ScreenFrame><Garson /></ScreenFrame></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/kds-screen" element={<WorkspaceBranchScope><WorkspaceGate><ScreenFrame><KDS /></ScreenFrame></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/pickup-screen" element={<WorkspaceBranchScope><WorkspaceGate><ScreenFrame><PickupScreen /></ScreenFrame></WorkspaceGate></WorkspaceBranchScope>} />
            <Route path="/q/:token" element={<QrRedirector />} />
            <Route path="/anket/:token" element={<PublicSurvey />} />
          </Routes>
        </Suspense>
      </PageErrorBoundary>
    )
  }

  return (
    <>
      <RouteActivityTracker />
      <Sidebar />
      <AdminLayout>
        <PageErrorBoundary key={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Navigate to={defaultPath} replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/design-demo" element={<DesignDemo />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/units" element={<Units />} />
              <Route path="/company" element={<Company />} />
              <Route path="/products" element={<SaleItems />} />
              <Route path="/customer-app-settings" element={<CustomerAppAdminSettings />} />
              <Route path="/combo-menu" element={<ComboMenu />} />
              <Route path="/combo-menu-preview" element={<ComboMenuBackofficePreview />} />
              <Route path="/semi-products" element={<SemiProducts />} />
              <Route path="/options" element={<Options />} />
              <Route path="/prices" element={<Prices />} />
              <Route path="/price-changes" element={<PriceChanges />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/:branchId/cihazlar" element={<WorkspaceBranchScope><DeviceSettings /></WorkspaceBranchScope>} />
              <Route path="/:branchId/masalar" element={<WorkspaceBranchScope><TableManagement /></WorkspaceBranchScope>} />
              <Route path="/reports" element={<Reports scopeVariant="center" initialTab="overview" />} />
              <Route path="/activity-logs" element={<ActivityLogs />} />
              <Route path="/stock-items" element={<StockItems />} />
              <Route path="/orders" element={<WorkspaceBranchScope><Orders /></WorkspaceBranchScope>} />
              <Route path="/pre-shift-settings" element={<WorkspaceBranchScope><PreShiftSettings /></WorkspaceBranchScope>} />
              <Route path="/time-tracking" element={<Navigate to="/pre-shift-settings" replace />} />
              <Route path="/time-tracking/timers" element={<WorkspaceBranchScope><TimerManager /></WorkspaceBranchScope>} />
              <Route path="/time-tracking/timers/presets" element={<WorkspaceBranchScope><TimeTrackingTimerPresets /></WorkspaceBranchScope>} />
              <Route path="/timer-manager" element={<WorkspaceBranchScope><ShiftPlanner /></WorkspaceBranchScope>} />
              <Route path="/documents" element={<Documents mode="center" />} />
              <Route path="/tasks" element={<Tasks scope="center" />} />
              <Route path="/stock" element={<Placeholder title="Stok Takibi" icon="fa-layer-group" />} />
              <Route path="/movements" element={<InventoryMovements />} />
              <Route path="/recipes" element={<Placeholder title="Reçeteler" icon="fa-book-open" />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/hesap-cizelgesi" element={<ChartOfAccounts />} />
              <Route path="/muhasebe-eslestirmeleri" element={<AccountingMappings />} />
              <Route path="/pnl-template" element={<PnLTemplateBuilder />} />
              <Route path="/positions" element={<Positions />} />
              <Route path="/positions/hierarchy" element={<PositionHierarchy />} />
              <Route path="/demo-sales" element={<DemoSales />} />
              <Route path="/taxes" element={<Taxes />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="/categories" element={<Categories />} />
              <Route path="/sale-categories" element={<SaleCategories />} />
              <Route path="/semi-categories" element={<SemiCategories />} />
              <Route path="/sales-channels" element={<SalesChannels />} />
              <Route path="/sales-reports" element={<Reports scopeVariant="center" initialTab="sales" />} />
              <Route path="/product-mix-report" element={<Reports scopeVariant="center" initialTab="product_mix" />} />
              <Route path="/pnl-report" element={<PnLReport scopeVariant="center" />} />
              <Route path="/advanced-reports" element={<Reports scopeVariant="center" initialTab="advanced" />} />
              <Route path="/report-designer" element={<ReportDesigner />} />
              <Route path="/contracts" element={<Contracts />} />
              <Route path="/purchasing" element={<PurchasingManager />} />
              <Route path="/supplier-order-panel" element={<SupplierOrderPanel />} />
              <Route path="/stock-reports" element={<Reports scopeVariant="center" initialTab="inventory" />} />
              <Route path="/personel" element={<Personnel />} />
              <Route path="/musteriler" element={<Musteriler />} />
              <Route path="/sube-musteriler" element={<Musteriler />} />
              <Route path="/cariler" element={<Musteriler />} />
              <Route path="/call-center" element={<OrderHub />} />
              <Route path="/mobil-app/personel" element={<MobileAppShells screenKey="personnel" />} />
              <Route path="/mobil-app/qr-menu" element={<QrMenuStandalone />} />
              <Route path="/mobil-app/musteri" element={<MobileAppShells screenKey="customer" />} />
              <Route path="/mobil-app/boss" element={<MobileAppShells screenKey="boss" />} />
              <Route path="/sadakat" element={<LoyaltyManagement />} />
              <Route path="/sadakat/kampanya/yeni" element={<LoyaltyCampaignWizard mode="create" />} />
              <Route path="/sadakat/kampanya/:campaignId" element={<LoyaltyCampaignWizard mode="view" />} />
              <Route path="/sadakat/kampanya/:campaignId/gor" element={<LoyaltyCampaignWizard mode="view" />} />
              <Route path="/sadakat/kampanya/:campaignId/duzenle" element={<LoyaltyCampaignWizard mode="edit" />} />
              <Route path="/sadakat/kategoriler" element={<LoyaltyCustomerCategories />} />
              <Route path="/sadakat/kuponlar" element={<LoyaltyCouponSets />} />
              <Route path="/sadakat/referanslar" element={<LoyaltyReferralPrograms />} />
              <Route path="/forecast" element={<WorkspaceBranchScope><Forecast /></WorkspaceBranchScope>} />
              <Route path="/uretim" element={<WorkspaceBranchScope><Production /></WorkspaceBranchScope>} />
              <Route path="/sube-personel" element={<WorkspaceBranchScope><BranchPersonnel /></WorkspaceBranchScope>} />
              <Route path="/sube-tasks" element={<WorkspaceBranchScope><Tasks scope="branch" /></WorkspaceBranchScope>} />
              <Route path="/sube-documents" element={<WorkspaceBranchScope><Documents mode="branch" /></WorkspaceBranchScope>} />
              <Route path="/sube-zayi-kaydi" element={<WorkspaceBranchScope><InventoryOperationRecord operationKey="waste" scopeVariant="branch" /></WorkspaceBranchScope>} />
              <Route path="/sube-serbest-kullanim-kaydi" element={<WorkspaceBranchScope><InventoryOperationRecord operationKey="freeUse" scopeVariant="branch" /></WorkspaceBranchScope>} />
              <Route path="/sube-transfer" element={<WorkspaceBranchScope><InventoryTransfer scopeVariant="branch" /></WorkspaceBranchScope>} />
              <Route path="/sube-reports" element={<WorkspaceBranchScope><Reports scopeVariant="branch" initialTab="overview" /></WorkspaceBranchScope>} />
              <Route path="/sube-satis-reports" element={<WorkspaceBranchScope><Reports scopeVariant="branch" initialTab="sales" /></WorkspaceBranchScope>} />
              <Route path="/sube-product-mix-report" element={<WorkspaceBranchScope><Reports scopeVariant="branch" initialTab="product_mix" /></WorkspaceBranchScope>} />
              <Route path="/sube-stok-reports" element={<WorkspaceBranchScope><Reports scopeVariant="branch" initialTab="inventory" /></WorkspaceBranchScope>} />
              <Route path="/sube-pnl-report" element={<WorkspaceBranchScope><PnLReport scopeVariant="branch" /></WorkspaceBranchScope>} />
              <Route path="/sube-finansal-reports" element={<WorkspaceBranchScope><Reports scopeVariant="branch" initialTab="advanced" /></WorkspaceBranchScope>} />
              <Route path="/option-groups" element={<OptionGroups />} />
              <Route path="/order-flows" element={<OrderFlows />} />
              <Route path="/count-flows" element={<CountFlows />} />
              <Route path="/count" element={<WorkspaceBranchScope><Count /></WorkspaceBranchScope>} />
              <Route path="/donem-kapanis" element={<PeriodClose />} />
              <Route path="/mal-kabul" element={<WorkspaceBranchScope><MalKabul /></WorkspaceBranchScope>} />
              <Route path="/kiosk-management" element={<KioskManagementDesktop />} />
              <Route path="/musteri-yorumlari" element={<FeedbackManagement />} />
              <Route path="/geribildirimler" element={<Navigate to="/gorev-yoneticisi" replace />} />
              <Route path="/geribildirimler/:ticketId" element={<Navigate to="/gorev-yoneticisi" replace />} />

              {/* Şube Geri Bildirim ve Kalite */}
              <Route path="/sube-geribildirimler" element={<WorkspaceBranchScope><Navigate to="/sube-tasks" replace /></WorkspaceBranchScope>} />
              <Route path="/sube-geribildirimler/:ticketId" element={<WorkspaceBranchScope><Navigate to="/sube-tasks" replace /></WorkspaceBranchScope>} />
              <Route path="/sube-formlar" element={<WorkspaceBranchScope><FormSubmissions /></WorkspaceBranchScope>} />

              {/* Merkez Depo / Üretim Geri Bildirim ve Kalite */}
              <Route path="/depo-geribildirimler" element={<WarehouseBranchRoute title="Geribildirimler"><Navigate to="/depo-tasks" replace /></WarehouseBranchRoute>} />
              <Route path="/depo-geribildirimler/:ticketId" element={<WarehouseBranchRoute title="Geribildirimler"><Navigate to="/depo-tasks" replace /></WarehouseBranchRoute>} />
              <Route path="/depo-formlar" element={<WarehouseBranchRoute title="Formlar"><FormSubmissions scopeVariant="anadepo" /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-geribildirimler" element={<WarehouseBranchRoute title="Geribildirimler"><Navigate to="/merkezmutfak-tasks" replace /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-geribildirimler/:ticketId" element={<WarehouseBranchRoute title="Geribildirimler"><Navigate to="/merkezmutfak-tasks" replace /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-formlar" element={<WarehouseBranchRoute title="Formlar"><FormSubmissions scopeVariant="merkezmutfak" /></WarehouseBranchRoute>} />
              <Route path="/form-sablonlari" element={<FormTemplates />} />
              <Route path="/formlar" element={<FormSubmissions />} />
              <Route path="/manual-yonetimi" element={<ManualManagement />} />
              <Route path="/manual" element={<WorkspaceBranchScope><ManualReader /></WorkspaceBranchScope>} />
              <Route path="/ekipman-yonetimi" element={<EquipmentManagement />} />
              <Route path="/geribildirim-kategorileri" element={<TicketCategories />} />
              <Route path="/kiosk-management-desktop" element={<Navigate to="/kiosk-management" replace />} />
              {/* Ana Depo İşlemleri */}
              <Route path="/depo-orders" element={<WarehouseBranchRoute title="Siparişler"><Orders /></WarehouseBranchRoute>} />
              <Route path="/depo-documents" element={<WarehouseBranchRoute title="Belge Girisi"><Documents mode="anadepo" /></WarehouseBranchRoute>} />
              <Route path="/depo-tasks" element={<WarehouseBranchRoute title="Gorevler"><Tasks scope="anadepo" /></WarehouseBranchRoute>} />
              <Route path="/depo-count" element={<WarehouseBranchRoute title="Sayim"><Count scopeVariant="anadepo" /></WarehouseBranchRoute>} />
              <Route path="/depo-zayi-kaydi" element={<InventoryOperationRecord operationKey="waste" scopeVariant="anadepo" />} />
              <Route path="/depo-serbest-kullanim-kaydi" element={<InventoryOperationRecord operationKey="freeUse" scopeVariant="anadepo" />} />
              <Route path="/depo-transfer" element={<InventoryTransfer scopeVariant="anadepo" />} />
              <Route path="/depo-time-tracking/timers" element={<WarehouseBranchRoute title="Zaman Sayaclari"><TimerManager /></WarehouseBranchRoute>} />
              <Route path="/depo-time-tracking/timers/presets" element={<WarehouseBranchRoute title="Zaman Sayaclari On Ayarlari"><TimeTrackingTimerPresets /></WarehouseBranchRoute>} />
              <Route path="/wms-locations" element={<WarehouseBranchRoute title="Lokasyonlar"><WmsLocations /></WarehouseBranchRoute>} />
              <Route path="/wms-lpns" element={<WarehouseBranchRoute title="LPN / Paletler"><WmsLpns /></WarehouseBranchRoute>} />
              <Route path="/wms-stock-params" element={<WarehouseBranchRoute title="Stok Parametreleri"><WmsStockParams /></WarehouseBranchRoute>} />
              <Route path="/depo-mal-kabul" element={<WarehouseBranchRoute title="Mal Kabul"><MalKabul /></WarehouseBranchRoute>} />

              {/* Merkez Mutfak İşlemleri */}
              <Route path="/merkezmutfak-uretim" element={<Production />} />
              <Route path="/merkezmutfak-documents" element={<WarehouseBranchRoute title="Belge Girisi"><Documents mode="merkezmutfak" /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-tasks" element={<WarehouseBranchRoute title="Gorevler"><Tasks scope="merkezmutfak" /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-count" element={<WarehouseBranchRoute title="Sayim"><Count scopeVariant="merkezmutfak" /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-zayi-kaydi" element={<InventoryOperationRecord operationKey="waste" scopeVariant="merkezmutfak" />} />
              <Route path="/merkezmutfak-serbest-kullanim-kaydi" element={<InventoryOperationRecord operationKey="freeUse" scopeVariant="merkezmutfak" />} />
              <Route path="/merkezmutfak-transfer" element={<InventoryTransfer scopeVariant="merkezmutfak" />} />
              <Route path="/merkezmutfak-time-tracking/timers" element={<WarehouseBranchRoute title="Zaman Sayaclari"><TimerManager /></WarehouseBranchRoute>} />
              <Route path="/merkezmutfak-time-tracking/timers/presets" element={<WarehouseBranchRoute title="Zaman Sayaclari On Ayarlari"><TimeTrackingTimerPresets /></WarehouseBranchRoute>} />
              <Route path="/gorev-yoneticisi" element={<TaskManager />} />
              <Route path="/is-akisleri" element={<Workflows />} />
              <Route path="*" element={<Navigate to={defaultPath} replace />} />
            </Routes>
          </Suspense>
        </PageErrorBoundary>
      </AdminLayout>
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate>
          <WorkspaceProvider>
            <WorkspaceGate>
              <SidebarProvider>
                <AppShell />
              </SidebarProvider>
            </WorkspaceGate>
          </WorkspaceProvider>
        </AuthGate>
      </AuthProvider>
    </ToastProvider>
  )
}
