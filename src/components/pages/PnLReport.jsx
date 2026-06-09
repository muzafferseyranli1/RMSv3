import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import PnLPreviewPanel from '@/components/pnl/PnLPreviewPanel'
import { useWorkspace } from '@/context/WorkspaceContext'
import { getAllBranches, parseJsonValue } from '@/lib/branchPurchasing'
import { DEFAULT_ACCOUNT_CHART, normalizeAccountChart } from '@/lib/accountChart'
import { ACCOUNTING_MAPPINGS_KEY, normalizeAccountingMappings } from '@/lib/accountingMappings'
import {
  buildPnlPreview,
  createDateRangeFromPreset,
  createDefaultPnlTemplate,
  normalizePnlTemplate,
  PNL_DATE_PRESETS,
  PNL_SCOPE_MODE_OPTIONS,
  PNL_TEMPLATE_KEY,
} from '@/lib/pnlTemplate'
import { readSettingValue } from '@/lib/settingsStore'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'

const PAGE_SIZE = 1000

function FilterCard({ children }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#64748b' }}>{label}</span>
      {children}
    </label>
  )
}

function SummaryChip({ label, value, accent, bg }) {
  return (
    <div style={{ borderRadius: 14, background: bg, padding: '12px 14px' }}>
      <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ marginTop: 6, fontWeight: 900, color: accent }}>{value}</div>
    </div>
  )
}

function startOfDay(dateStr) {
  return `${dateStr}T00:00:00`
}

function endOfDay(dateStr) {
  return `${dateStr}T23:59:59`
}

function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

async function fetchAllRows(buildQuery) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) throw error
    const batch = data || []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

function applyBranchNameFilter(query, branchNames) {
  if (!branchNames?.length) return query
  if (branchNames.length === 1) return query.eq('branch_name', branchNames[0])
  return query.in('branch_name', branchNames)
}

async function fetchSalesRows({ branchNames, dateFrom, dateTo }) {
  return fetchAllRows((from, to) => {
    let query = db
      .from('sales')
      .select('id,branch_name,sale_datetime,payment_total,gross_total_after_discount,net_total_after_discount,status')
      .gte('sale_datetime', startOfDay(dateFrom))
      .lte('sale_datetime', endOfDay(dateTo))
      .order('sale_datetime', { ascending: true })
      .range(from, to)

    query = applyBranchNameFilter(query, branchNames)
    return query
  })
}

async function fetchExpenseDocumentRows({ branchNames, dateFrom, dateTo }) {
  return fetchAllRows((from, to) => {
    let query = db
      .from('expense_documents')
      .select('expense_account_id,branch_id,branch_name,document_date,period_start,period_end,distribute_by_day,amount')
      .lte('period_start', dateTo)
      .gte('period_end', dateFrom)
      .order('period_start', { ascending: true })
      .range(from, to)

    query = applyBranchNameFilter(query, branchNames)
    return query
  })
}

async function fetchInventoryMovementRows({ branchNames, dateFrom, dateTo }) {
  return fetchAllRows((from, to) => {
    let query = db
      .from('inventory_movements')
      .select('movement_type,branch_name,movement_at,total_cost')
      .in('movement_type', ['stock_count_gain', 'stock_count_loss'])
      .gte('movement_at', startOfDay(dateFrom))
      .lte('movement_at', endOfDay(dateTo))
      .order('movement_at', { ascending: true })
      .range(from, to)

    query = applyBranchNameFilter(query, branchNames)
    return query
  })
}

function toDateValue(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function diffDaysInclusive(start, end) {
  if (!start || !end) return 0
  const ms = end.getTime() - start.getTime()
  return Math.floor(ms / 86400000) + 1
}

function getRecognizedExpenseAmount(row, dateFrom, dateTo) {
  const amount = safeNumber(row?.amount)
  if (!amount) return 0

  const reportStart = toDateValue(dateFrom)
  const reportEnd = toDateValue(dateTo)
  const periodStart = toDateValue(row?.period_start || row?.document_date)
  const periodEnd = toDateValue(row?.period_end || row?.period_start || row?.document_date)
  if (!reportStart || !reportEnd || !periodStart || !periodEnd) return 0

  if (row?.distribute_by_day) {
    const overlapStart = reportStart > periodStart ? reportStart : periodStart
    const overlapEnd = reportEnd < periodEnd ? reportEnd : periodEnd
    if (overlapStart > overlapEnd) return 0

    const totalDays = diffDaysInclusive(periodStart, periodEnd)
    const overlapDays = diffDaysInclusive(overlapStart, overlapEnd)
    if (totalDays <= 0 || overlapDays <= 0) return 0
    return amount * (overlapDays / totalDays)
  }

  const bookingDate = periodStart
  return bookingDate >= reportStart && bookingDate <= reportEnd ? amount : 0
}

function parseBranchIds(template) {
  const branchIds = Array.isArray(template?.branch_ids)
    ? template.branch_ids
    : parseJsonValue(template?.branch_ids, [])
  return Array.isArray(branchIds) ? branchIds : []
}

function buildSelection({ scopeVariant, branches, branchTemplates, scopeMode, branchId, templateId, workspaceBranchId }) {
  if (scopeVariant === 'branch') {
    const selectedBranch = branches.find(branch => branch.id === workspaceBranchId) || null
    return {
      kind: 'branch',
      label: selectedBranch?.name || 'Sube secimi bekleniyor',
      branches: selectedBranch ? [selectedBranch] : [],
    }
  }

  if (scopeMode === 'branch') {
    const selectedBranch = branches.find(branch => branch.id === branchId) || null
    return {
      kind: 'branch',
      label: selectedBranch?.name || 'Sube secin',
      branches: selectedBranch ? [selectedBranch] : [],
    }
  }

  if (scopeMode === 'template') {
    const selectedTemplate = branchTemplates.find(template => template.id === templateId) || null
    const selectedBranches = branches.filter(branch => parseBranchIds(selectedTemplate).includes(branch.id))
    return {
      kind: 'template',
      label: selectedTemplate ? `${selectedTemplate.name} (${selectedBranches.length} sube)` : 'Sube sablonu secin',
      branches: selectedBranches,
    }
  }

  return {
    kind: 'all',
    label: `Tum subeler (${branches.length})`,
    branches,
  }
}

export default function PnLReport({ scopeVariant = 'center' }) {
  const toast = useToast()
  const { branchId: workspaceBranchId, branches: workspaceBranches } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [salesLoading, setSalesLoading] = useState(false)
  const [expenseLoading, setExpenseLoading] = useState(false)
  const [movementLoading, setMovementLoading] = useState(false)
  const [chartAccounts, setChartAccounts] = useState([])
  const [accountingMappings, setAccountingMappings] = useState({})
  const [template, setTemplate] = useState(() => createDefaultPnlTemplate(DEFAULT_ACCOUNT_CHART))
  const [branchTemplates, setBranchTemplates] = useState([])
  const [branches, setBranches] = useState([])
  const [expenseDocuments, setExpenseDocuments] = useState([])
  const [inventoryMovements, setInventoryMovements] = useState([])
  const [salesSummary, setSalesSummary] = useState({ grossSales: 0, vatTotal: 0, completedSales: 0 })
  const [preset, setPreset] = useState('month')
  const [filters, setFilters] = useState(() => ({
    ...createDateRangeFromPreset('month'),
    scopeMode: scopeVariant === 'branch' ? 'branch' : 'all',
    branchId: workspaceBranchId || '',
    templateId: '',
  }))

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      try {
        const accountChartValue = await readSettingValue('account_chart', DEFAULT_ACCOUNT_CHART)
        const nextAccounts = normalizeAccountChart(accountChartValue, DEFAULT_ACCOUNT_CHART)
        const [templateValue, storedMappings] = await Promise.all([
          readSettingValue(PNL_TEMPLATE_KEY, createDefaultPnlTemplate(nextAccounts)),
          readSettingValue(ACCOUNTING_MAPPINGS_KEY, {}),
        ])

        const requests = [
          db.from('branch_templates').select('*').is('deleted_at', null).order('name'),
        ]

        if (!workspaceBranches.length) {
          requests.push(
            db.from('settings').select('value').eq('key', 'company_tree').single(),
          )
        }

        const results = await Promise.all(requests)
        const [templatesResult, settingsResult] = results
        if (templatesResult.error) throw templatesResult.error

        const resolvedBranches = workspaceBranches.length
          ? workspaceBranches
          : getAllBranches(parseJsonValue(settingsResult?.data?.value, []))

        if (ignore) return

        setChartAccounts(nextAccounts)
        setAccountingMappings(normalizeAccountingMappings(storedMappings, nextAccounts))
        setTemplate(normalizePnlTemplate(templateValue, nextAccounts))
        setBranchTemplates(templatesResult.data || [])
        setBranches(resolvedBranches)
        setFilters(current => ({
          ...current,
          branchId: current.branchId || workspaceBranchId || '',
        }))
      } catch (error) {
        if (ignore) return
        toast(error?.message || 'P&L raporu yuklenemedi', 'error')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [scopeVariant, toast, workspaceBranchId, workspaceBranches])

  useEffect(() => {
    if (scopeVariant !== 'branch' || !workspaceBranchId) return
    setFilters(current => ({
      ...current,
      scopeMode: 'branch',
      branchId: workspaceBranchId,
    }))
  }, [scopeVariant, workspaceBranchId])

  const selection = useMemo(
    () => buildSelection({
      scopeVariant,
      branches,
      branchTemplates,
      scopeMode: filters.scopeMode,
      branchId: filters.branchId,
      templateId: filters.templateId,
      workspaceBranchId,
    }),
    [branchTemplates, branches, filters.branchId, filters.scopeMode, filters.templateId, scopeVariant, workspaceBranchId],
  )

  useEffect(() => {
    let ignore = false

    async function loadSalesSummary() {
      if (!filters.dateFrom || !filters.dateTo) return
      if (!selection.branches.length) {
        setSalesSummary({ grossSales: 0, vatTotal: 0, completedSales: 0 })
        return
      }

      const branchNames = selection.branches.map(branch => branch.name).filter(Boolean)
      if (!branchNames.length) {
        setSalesSummary({ grossSales: 0, vatTotal: 0, completedSales: 0 })
        return
      }

      setSalesLoading(true)
      try {
        const salesRows = await fetchSalesRows({
          branchNames,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        })
        if (ignore) return

        const completedSales = salesRows.filter(row => row.status === 'completed')
        const grossSales = completedSales.reduce((sum, row) => sum + safeNumber(row.payment_total), 0)
        const vatTotal = completedSales.reduce((sum, row) => (
          sum + safeNumber(row.gross_total_after_discount) - safeNumber(row.net_total_after_discount)
        ), 0)

        setSalesSummary({
          grossSales,
          vatTotal,
          completedSales: completedSales.length,
        })
      } catch (error) {
        if (ignore) return
        setSalesSummary({ grossSales: 0, vatTotal: 0, completedSales: 0 })
        toast(error?.message || 'Satis toplami yuklenemedi', 'error')
      } finally {
        if (!ignore) setSalesLoading(false)
      }
    }

    loadSalesSummary()
    return () => {
      ignore = true
    }
  }, [filters.dateFrom, filters.dateTo, selection, toast])

  useEffect(() => {
    let ignore = false

    async function loadExpenseDocuments() {
      if (!filters.dateFrom || !filters.dateTo) return
      if (!selection.branches.length) {
        setExpenseDocuments([])
        return
      }

      const branchNames = selection.branches.map(branch => branch.name).filter(Boolean)
      if (!branchNames.length) {
        setExpenseDocuments([])
        return
      }

      setExpenseLoading(true)
      try {
        const rows = await fetchExpenseDocumentRows({
          branchNames,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        })
        if (ignore) return
        setExpenseDocuments(rows)
      } catch (error) {
        if (ignore) return
        const missingTable = error?.code === 'PGRST205' || String(error?.message || '').toLowerCase().includes('expense_documents')
        if (!missingTable) {
          toast(error?.message || 'Gider belgeleri yuklenemedi', 'error')
        }
        setExpenseDocuments([])
      } finally {
        if (!ignore) setExpenseLoading(false)
      }
    }

    loadExpenseDocuments()
    return () => {
      ignore = true
    }
  }, [filters.dateFrom, filters.dateTo, selection, toast])

  useEffect(() => {
    let ignore = false

    async function loadInventoryMovements() {
      if (!filters.dateFrom || !filters.dateTo) return
      if (!selection.branches.length) {
        setInventoryMovements([])
        return
      }

      const branchNames = selection.branches.map(branch => branch.name).filter(Boolean)
      if (!branchNames.length) {
        setInventoryMovements([])
        return
      }

      setMovementLoading(true)
      try {
        const rows = await fetchInventoryMovementRows({
          branchNames,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        })
        if (ignore) return
        setInventoryMovements(rows)
      } catch (error) {
        if (ignore) return
        setInventoryMovements([])
        toast(error?.message || 'Sayim farklari yuklenemedi', 'error')
      } finally {
        if (!ignore) setMovementLoading(false)
      }
    }

    loadInventoryMovements()
    return () => {
      ignore = true
    }
  }, [filters.dateFrom, filters.dateTo, selection, toast])

  const rowAmounts = useMemo(() => {
    const accountTotals = new Map()

    for (const row of expenseDocuments) {
      const accountId = String(row?.expense_account_id || '').trim()
      if (!accountId) continue
      const recognizedAmount = getRecognizedExpenseAmount(row, filters.dateFrom, filters.dateTo)
      if (!recognizedAmount) continue
      accountTotals.set(accountId, safeNumber(accountTotals.get(accountId)) + recognizedAmount)
    }

    for (const row of inventoryMovements) {
      const accountId = String(accountingMappings[row?.movement_type] || '').trim()
      if (!accountId) continue
      const amount = Math.abs(safeNumber(row?.total_cost))
      if (!amount) continue
      accountTotals.set(accountId, safeNumber(accountTotals.get(accountId)) + amount)
    }

    const totals = {}
    for (const block of template?.blocks || []) {
      for (const row of block?.rows || []) {
        totals[row.id] = (row.accountIds || []).reduce((sum, accountId) => (
          sum + safeNumber(accountTotals.get(accountId))
        ), 0)
      }
    }

    totals['gross-sales'] = salesSummary.grossSales
    totals.vat = salesSummary.vatTotal
    return totals
  }, [
    accountingMappings,
    expenseDocuments,
    filters.dateFrom,
    filters.dateTo,
    inventoryMovements,
    salesSummary.grossSales,
    salesSummary.vatTotal,
    template,
  ])

  const preview = useMemo(
    () => buildPnlPreview(template, chartAccounts, {
      rowAmounts,
    }),
    [chartAccounts, rowAmounts, template],
  )

  function patchFilter(key, value) {
    setFilters(current => ({ ...current, [key]: value }))
  }

  function handlePresetChange(nextPreset) {
    setPreset(nextPreset)
    setFilters(current => ({
      ...current,
      ...createDateRangeFromPreset(nextPreset),
    }))
  }

  const pageTitle = scopeVariant === 'branch' ? 'P&L Raporu' : 'P&L Raporu'
  const pageSubtitle = scopeVariant === 'branch'
    ? 'Sube baglamina kilitli P&L gorunumu'
    : 'Merkez tarafinda tek sube veya sube sablonu bazli P&L gorunumu'

  return (
    <div className="page-enter">
      <Header title={pageTitle} subtitle={pageSubtitle} />

      <div style={{ display: 'grid', gap: 18 }}>
        <FilterCard>
          <div style={{ display: 'grid', gridTemplateColumns: scopeVariant === 'branch' ? 'repeat(3, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))', gap: 12 }}>
            {scopeVariant !== 'branch' ? (
              <Field label="Gorunum">
                <select className="f-input" value={filters.scopeMode} onChange={event => patchFilter('scopeMode', event.target.value)}>
                  {PNL_SCOPE_MODE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {scopeVariant !== 'branch' && filters.scopeMode === 'branch' ? (
              <Field label="Sube">
                <select className="f-input" value={filters.branchId} onChange={event => patchFilter('branchId', event.target.value)}>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {scopeVariant !== 'branch' && filters.scopeMode === 'template' ? (
              <Field label="Sube sablonu">
                <select className="f-input" value={filters.templateId} onChange={event => patchFilter('templateId', event.target.value)}>
                  <option value="">Secin...</option>
                  {branchTemplates.map(templateOption => (
                    <option key={templateOption.id} value={templateOption.id}>{templateOption.name}</option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="Hazir donem">
              <select className="f-input" value={preset} onChange={event => handlePresetChange(event.target.value)}>
                {PNL_DATE_PRESETS.map(option => (
                  <option key={option.key} value={option.key}>{option.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Baslangic">
              <input className="f-input" type="date" value={filters.dateFrom} onChange={event => patchFilter('dateFrom', event.target.value)} />
            </Field>

            <Field label="Bitis">
              <input className="f-input" type="date" value={filters.dateTo} onChange={event => patchFilter('dateTo', event.target.value)} />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <SummaryChip label="Aktif sablon" value={template.name} accent="#1d4ed8" bg="#eff6ff" />
            <SummaryChip label="Rapor kapsami" value={selection.label} accent="#0f766e" bg="#ecfeff" />
            <SummaryChip label="Donem" value={`${filters.dateFrom} - ${filters.dateTo}`} accent="#b45309" bg="#fff7ed" />
            <SummaryChip label="Brut satis gelirleri" value={`₺${Number(salesSummary.grossSales || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="#991b1b" bg="#fef2f2" />
            <SummaryChip label="KDV" value={`₺${Number(salesSummary.vatTotal || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent="#b45309" bg="#fff7ed" />
            <SummaryChip label="Sayim fark kaydi" value={inventoryMovements.length} accent="#0f766e" bg="#ecfdf5" />
          </div>

          <div style={{ borderRadius: 14, border: '1px solid #dbeafe', background: '#eff6ff', color: '#1d4ed8', padding: '12px 14px', lineHeight: 1.6, fontSize: '.84rem' }}>
            Brut Satis Gelirleri ve KDV satirlari satislardan gelir. Belge giderleri secilen hesaplardan toplanir. Sayim farklari ise muhasebe eslestirmeleri ekraninda baglanan hesap uzerinden P&L satirlarina akar.
          </div>
        </FilterCard>

        {loading || salesLoading || expenseLoading || movementLoading ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
            P&L gorunumu yukleniyor...
          </div>
        ) : (
          <PnLPreviewPanel
            preview={preview}
            title="P&L Raporu"
            subtitle={`${selection.label} icin aktif sablon onizlemesi`}
          />
        )}
      </div>
    </div>
  )
}
