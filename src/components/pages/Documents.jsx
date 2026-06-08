import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useWorkspace } from '@/context/WorkspaceContext'
import {
  ACCOUNT_CHART_KEY,
  DEFAULT_ACCOUNT_CHART,
  buildExpenseAccountOptions,
  getAccountScopeLabel,
  getAccountSectionLabel,
  getAccountTypeLabel,
  normalizeAccountChart,
} from '@/lib/accountChart'
import { parseMaybeArray } from '@/lib/countFlowUtils'
import { readSettingValue } from '@/lib/settingsStore'
import { db } from '@/lib/db'
import { addDays, formatDate, todayStr } from '@/lib/branchPurchasing'

const STORAGE_KEYS = {
  center: 'suitable_documents_center_drafts_v1',
  branch: 'suitable_documents_branch_drafts_v1',
}

const LEGACY_EXPENSE_ACCOUNT_OPTIONS = [
  { value: '', label: 'Seçin...' },
  { value: 'internet', label: 'Internet' },
  { value: 'electricity', label: 'Elektrik' },
  { value: 'water', label: 'Su' },
  { value: 'cleaning', label: 'Temizlik' },
  { value: 'maintenance', label: 'Bakım / Onarım' },
]

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'invoice', label: 'Fatura', icon: 'fa-file-invoice-dollar', color: '#2563eb', bg: '#dbeafe' },
  { value: 'accrual', label: 'Tahakkuk', icon: 'fa-clock', color: '#d97706', bg: '#fef3c7' },
  { value: 'unregistered', label: 'Belgesiz', icon: 'fa-file-circle-question', color: '#b91c1c', bg: '#fee2e2' },
]

const PERIOD_OPTIONS = [
  { value: 'current', label: 'Mevcut Dönem' },
  { value: 'previous', label: 'Önceki Dönem' },
  { value: 'next', label: 'Sonraki Dönem' },
  { value: 'manual', label: 'Manuel Dönem' },
]

const DISTRIBUTION_OPTIONS = [
  {
    value: 'equal',
    label: 'Gideri Eşit Dağıt',
    description: 'Seçilen şubelere eşit paylaştır.',
    color: '#0f766e',
    bg: '#ccfbf1',
  },
  {
    value: 'sales_ratio',
    label: 'Gideri Satışa Oranlayarak Dağıt',
    description: 'Son 30 günlük satış oranlarına göre dağıt.',
    color: '#7c3aed',
    bg: '#ede9fe',
  },
]

const PAGE_SIZE = 1000

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
      .select('branch_name,payment_total,status,sale_datetime')
      .gte('sale_datetime', startOfDay(dateFrom))
      .lte('sale_datetime', endOfDay(dateTo))
      .order('sale_datetime', { ascending: true })
      .range(from, to)

    query = applyBranchNameFilter(query, branchNames)
    return query
  })
}

function createDocumentGroupId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function normalizeLookupText(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR')
}

function resolveLinkedExpenseAccount(value, chartAccounts) {
  if (!value) return null

  const directMatch = chartAccounts.find(account => account.id === value)
  if (directMatch) return directMatch

  const legacyMatchMap = {
    internet: 'Internet',
    electricity: 'Elektrik',
    water: 'Su',
    cleaning: 'Temizlik',
    maintenance: 'Bakim Onarim',
  }

  const targetName = legacyMatchMap[value]
  if (!targetName) return null

  const normalizedTarget = normalizeLookupText(targetName)
  return chartAccounts.find(account => normalizeLookupText(account.name) === normalizedTarget) || null
}

function readDrafts(mode) {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEYS[mode]) || '[]')
  } catch {
    return []
  }
}

function writeDrafts(mode, drafts) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEYS[mode], JSON.stringify(drafts))
  } catch {
    // Best-effort local draft persistence.
  }
}

function createDocumentNo(mode) {
  const now = new Date()
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ]
  let prefix = 'SUB'
  if (mode === 'center') prefix = 'MRK'
  else if (mode === 'anadepo') prefix = 'AND'
  else if (mode === 'merkezmutfak') prefix = 'MMT'
  
  return `${prefix}-${parts.join('')}`
}

function toDateInputValue(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return todayStr()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function monthRange(baseDate, offset = 0) {
  const safeBase = baseDate || todayStr()
  const source = new Date(`${safeBase}T00:00:00`)
  const start = new Date(source.getFullYear(), source.getMonth() + offset, 1)
  const end = new Date(source.getFullYear(), source.getMonth() + offset + 1, 0)
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  }
}

function getPeriodRange(documentDate, periodMode) {
  if (periodMode === 'previous') return monthRange(documentDate, -1)
  if (periodMode === 'next') return monthRange(documentDate, 1)
  return monthRange(documentDate, 0)
}

function createBranchOptions(mode, branches) {
  if (mode !== 'center') return branches
  const hasCenter = branches.some(branch => branch.id === 'center')
  return hasCenter ? branches : [{ id: 'center', name: 'Merkez' }, ...branches]
}

function createInitialForm(mode, branchId = '') {
  const documentDate = todayStr()
  const defaultRange = getPeriodRange(documentDate, 'current')
  return {
    documentNo: createDocumentNo(mode),
    expenseAccount: '',
    accountingCode: '',
    accountingCategory: '',
    expenseAmount: '',
    documentType: 'invoice',
    supplierId: '',
    documentDate,
    periodMode: 'current',
    periodStart: defaultRange.start,
    periodEnd: defaultRange.end,
    distributeByDay: true,
    distributionMode: 'equal',
    allBranches: false,
    branchSelections: mode === 'center' ? [{ id: 'center', type: 'branch', name: 'Merkez', branchIds: [] }] : [],
    selectedBranchIds: mode !== 'center' && branchId ? [branchId] : ['center'],
    note: '',
    unregisteredReason: '',
  }
}

function ChoiceCardGroup({ options, value, onChange, columns = 'repeat(auto-fit, minmax(180px, 1fr))' }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: columns, gap: 10 }}>
      {options.map(option => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              border: `1.5px solid ${active ? option.color || '#2563eb' : '#e2e8f0'}`,
              background: active ? option.bg || '#eff6ff' : '#fff',
              color: active ? option.color || '#1d4ed8' : '#475569',
              borderRadius: 16,
              padding: '14px 15px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {option.icon ? (
                <span style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background: active ? 'rgba(255,255,255,.72)' : '#f8fafc',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <i className={`fa-solid ${option.icon}`} />
                </span>
              ) : null}
              <div>
                <div style={{ fontWeight: 800, fontSize: '.86rem' }}>{option.label}</div>
                {option.description ? (
                  <div style={{ fontSize: '.74rem', lineHeight: 1.45, color: active ? option.color || '#1d4ed8' : '#64748b', marginTop: 4 }}>
                    {option.description}
                  </div>
                ) : null}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SummaryCard({ label, value, hint, bg = '#fff', color = '#0f172a' }) {
  return (
    <div style={{ padding: 14, borderRadius: 16, border: '1px solid #e2e8f0', background: bg }}>
      <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.12rem', fontWeight: 800, color, marginTop: 6 }}>
        {value}
      </div>
      {hint ? <div style={{ fontSize: '.76rem', color: '#94a3b8', marginTop: 4 }}>{hint}</div> : null}
    </div>
  )
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: '.96rem', fontWeight: 800, color: '#0f172a' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="f-label">{label}</label>
      {children}
      {hint ? <div style={{ fontSize: '.74rem', color: '#94a3b8', marginTop: 6, lineHeight: 1.45 }}>{hint}</div> : null}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>
        <span style={{ display: 'block', fontSize: '.84rem', fontWeight: 700, color: '#0f172a' }}>{label}</span>
        {hint ? <span style={{ display: 'block', marginTop: 3, fontSize: '.75rem', color: '#64748b' }}>{hint}</span> : null}
      </span>
    </label>
  )
}

function Chip({ children, bg = '#eff6ff', color = '#1d4ed8' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: bg, color, fontSize: '.74rem', fontWeight: 700 }}>
      {children}
    </span>
  )
}

function sanitizeBranchSelections(selections) {
  const normalizedSelections = (selections || []).map(item => ({
    ...item,
    id: String(item.id),
    type: item.type === 'template' ? 'template' : 'branch',
    name: String(item.name || ''),
    branchIds: item.type === 'template' ? (item.branchIds || []).map(id => String(id)) : [],
  }))

  const coveredBranchIds = new Set(
    normalizedSelections
      .filter(item => item.type === 'template')
      .flatMap(item => item.branchIds)
  )

  return normalizedSelections.filter(item => item.type === 'template' || !coveredBranchIds.has(String(item.id)))
}

function resolveDocumentBranchIds(form, branches) {
  if (form.allBranches) return (branches || []).map(branch => String(branch.id))
  const selections = sanitizeBranchSelections(form.branchSelections || [])
  return [...new Set(selections.flatMap(item => item.type === 'template' ? item.branchIds.map(id => String(id)) : [String(item.id)]))]
}

function DocumentBranchSelection({ branches, templates, value, onChange }) {
  const sanitizedValue = sanitizeBranchSelections(value)
  const selectedTemplateBranchIds = new Set(
    sanitizedValue
      .filter(item => item.type === 'template')
      .flatMap(item => item.branchIds || [])
      .map(id => String(id))
  )

  function toggleBranch(branch) {
    const branchId = String(branch.id)
    if (selectedTemplateBranchIds.has(branchId)) return

    const next = sanitizedValue.some(item => item.type === 'branch' && item.id === branchId)
      ? sanitizedValue.filter(item => !(item.type === 'branch' && item.id === branchId))
      : [...sanitizedValue, { id: branchId, type: 'branch', name: branch.name, branchIds: [] }]
    onChange(sanitizeBranchSelections(next))
  }

  function toggleTemplate(template) {
    const branchIds = parseMaybeArray(template.branch_ids).map(id => String(id))
    const templateId = String(template.id)
    const next = sanitizedValue.some(item => item.type === 'template' && item.id === templateId)
      ? sanitizedValue.filter(item => !(item.type === 'template' && item.id === templateId))
      : [
          ...sanitizedValue.filter(item => !(item.type === 'branch' && branchIds.includes(String(item.id)))),
          { id: templateId, type: 'template', name: template.name, branchIds },
        ]
    onChange(sanitizeBranchSelections(next))
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 8 }}>Şube şablonları</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 140, overflowY: 'auto', paddingRight: 4 }}>
          {templates.map(template => {
            const checked = sanitizedValue.some(item => item.type === 'template' && item.id === String(template.id))
            return (
              <label key={template.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: '#0f172a' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleTemplate(template)} />
                {template.name}
              </label>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', marginBottom: 8 }}>Şubeler</div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 170, overflowY: 'auto', paddingRight: 4 }}>
          {branches.map(branch => {
            const branchId = String(branch.id)
            const checked = sanitizedValue.some(item => item.type === 'branch' && item.id === branchId)
            const disabled = selectedTemplateBranchIds.has(branchId)
            return (
              <label key={branch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.84rem', color: disabled ? '#94a3b8' : '#0f172a' }}>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleBranch(branch)} />
                <span>{branch.name}</span>
              </label>
            )
          })}
        </div>
        {selectedTemplateBranchIds.size > 0 ? (
          <div style={{ marginTop: 8, fontSize: '.74rem', color: '#64748b' }}>
            Seçili şube şablonlarına dahil olan şubeler burada tekrar seçilemez. Diğer şubeler için ek seçim yapabilirsiniz.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DraftTable({ drafts, branchNamesById, onLoad }) {
  if (!drafts.length) return null

  return (
    <SectionCard
      title="Yerel Taslaklar"
      subtitle="Kalıcı veritabanı akışı bağlanana kadar belge girişleri bu tarayıcıda taslak olarak tutulur."
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Belge No', 'Belge Tipi', 'Şubeler', 'Tedarikçi', 'Belge Tarihi', 'Kayıt'].map(label => (
                <th key={label} style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
              <th style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }} />
            </tr>
          </thead>
          <tbody>
            {drafts.map(draft => (
              <tr key={draft.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0f172a' }}>{draft.documentNo}</td>
                <td style={{ padding: '10px 12px', color: '#475569' }}>{draft.documentTypeLabel}</td>
                <td style={{ padding: '10px 12px', color: '#475569' }}>
                  {(draft.selectedBranchIds || []).map(id => branchNamesById.get(id) || id).join(', ') || '—'}
                </td>
                <td style={{ padding: '10px 12px', color: '#475569' }}>{draft.supplierName || 'Seçilmedi'}</td>
                <td style={{ padding: '10px 12px', color: '#475569' }}>{draft.documentDate ? formatDate(draft.documentDate) : '—'}</td>
                <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{draft.savedAtLabel}</td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <button type="button" className="btn-o" onClick={() => onLoad(draft.form)}>
                    Taslağı Yükle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

export default function Documents({ mode: overrideMode }) {
  const { branchId, branchName, branches, loadingBranches, scope } = useWorkspace()
  const mode = overrideMode || scope || 'branch'
  const [suppliers, setSuppliers] = useState([])
  const [branchTemplates, setBranchTemplates] = useState([])
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [supplierLoadError, setSupplierLoadError] = useState('')
  const [chartAccounts, setChartAccounts] = useState([])
  const [loadingChartAccounts, setLoadingChartAccounts] = useState(true)
  const [drafts, setDrafts] = useState(() => readDrafts(mode))
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(() => createInitialForm(mode, branchId))
  const [saveState, setSaveState] = useState({ message: '', tone: 'info' })

  const branchOptions = useMemo(
    () => createBranchOptions(mode, branches),
    [mode, branches],
  )

  const branchNamesById = useMemo(
    () => new Map(branchOptions.map(item => [item.id, item.name])),
    [branchOptions],
  )

  const selectedBranches = useMemo(
    () => (form.allBranches
      ? branchOptions
      : branchOptions.filter(item => resolveDocumentBranchIds(form, branchOptions).includes(String(item.id)))),
    [branchOptions, form],
  )

  const selectedBranchSelectionSummary = useMemo(
    () => sanitizeBranchSelections(form.branchSelections || []),
    [form.branchSelections],
  )

  const supplierName = useMemo(
    () => suppliers.find(item => item.id === form.supplierId)?.name || '',
    [suppliers, form.supplierId],
  )
  const linkedExpenseAccount = useMemo(
    () => resolveLinkedExpenseAccount(form.expenseAccount, chartAccounts),
    [chartAccounts, form.expenseAccount],
  )

  const expenseAccountOptions = useMemo(() => {
    const chartOptions = buildExpenseAccountOptions(chartAccounts).slice(1)
    const legacyOptions = LEGACY_EXPENSE_ACCOUNT_OPTIONS.slice(1).filter(option => (
      !chartOptions.some(chartOption => chartOption.label === option.label)
    ))

    return [LEGACY_EXPENSE_ACCOUNT_OPTIONS[0], ...chartOptions, ...legacyOptions]
  }, [chartAccounts])

  useEffect(() => {
    let ignore = false

    async function loadChartAccounts() {
      setLoadingChartAccounts(true)
      try {
        const value = await readSettingValue(ACCOUNT_CHART_KEY, [])
        if (ignore) return
        const sourceAccounts = Array.isArray(value) && value.length > 0 ? value : DEFAULT_ACCOUNT_CHART
        setChartAccounts(normalizeAccountChart(sourceAccounts, DEFAULT_ACCOUNT_CHART))
      } catch (error) {
        if (ignore) return
        console.error('Account chart load failed', error)
        setChartAccounts(normalizeAccountChart(DEFAULT_ACCOUNT_CHART, DEFAULT_ACCOUNT_CHART))
      } finally {
        if (!ignore) setLoadingChartAccounts(false)
      }
    }

    loadChartAccounts()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadSuppliers() {
      setLoadingSuppliers(true)
      setSupplierLoadError('')

      const [suppliersResult, templatesResult] = await Promise.all([
        db.from('suppliers').select('id,name').order('name', { ascending: true }),
        db.from('branch_templates').select('id,name,branch_ids').is('deleted_at', null).order('name'),
      ])

      if (ignore) return

      if (suppliersResult.error) {
        console.error('Supplier load failed', suppliersResult.error)
        setSuppliers([])
        setSupplierLoadError('Tedarikçi listesi yüklenemedi.')
      } else {
        setSuppliers(suppliersResult.data || [])
      }

      setBranchTemplates(templatesResult.data || [])

      setLoadingSuppliers(false)
    }

    loadSuppliers()
    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    if (mode === 'center' || !branchId) return
    setForm(current => ({ ...current, allBranches: false, branchSelections: [], selectedBranchIds: [branchId] }))
  }, [mode, branchId])

  useEffect(() => {
    if (mode !== 'center') return
    setForm(current => {
      if (current.branchSelections?.length) return current
      if (!current.selectedBranchIds?.length) return current
      return {
        ...current,
        branchSelections: current.selectedBranchIds.map(id => ({
          id: String(id),
          type: 'branch',
          name: branchOptions.find(item => String(item.id) === String(id))?.name || String(id),
          branchIds: [],
        })),
      }
    })
  }, [mode, branchOptions])

  useEffect(() => {
    if (form.documentType !== 'accrual') return
    const autoDate = todayStr()
    if (form.documentDate === autoDate) return
    setForm(current => ({ ...current, documentDate: autoDate }))
  }, [form.documentType, form.documentDate])

  useEffect(() => {
    if (form.periodMode === 'manual') return
    const nextRange = getPeriodRange(form.documentDate, form.periodMode)
    setForm(current => {
      if (current.periodStart === nextRange.start && current.periodEnd === nextRange.end) return current
      return {
        ...current,
        periodStart: nextRange.start,
        periodEnd: nextRange.end,
      }
    })
  }, [form.documentDate, form.periodMode])

  useEffect(() => {
    if (selectedBranches.length > 1 || form.distributionMode === 'equal') return
    setForm(current => ({ ...current, distributionMode: 'equal' }))
  }, [selectedBranches.length, form.distributionMode])

  useEffect(() => {
    if (!linkedExpenseAccount) return

    setForm(current => {
      const nextCode = linkedExpenseAccount.code || ''
      const nextCategory = linkedExpenseAccount.accountingCategory || linkedExpenseAccount.group || ''

      if (nextCode === current.accountingCode && nextCategory === current.accountingCategory) return current

      return {
        ...current,
        accountingCode: nextCode,
        accountingCategory: nextCategory,
      }
    })
  }, [linkedExpenseAccount])

  function patchForm(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function handleExpenseAccountChange(value) {
    const matchedAccount = resolveLinkedExpenseAccount(value, chartAccounts)

    setForm(current => ({
      ...current,
      expenseAccount: value,
      accountingCode: matchedAccount ? (matchedAccount.code || '') : (value ? current.accountingCode : ''),
      accountingCategory: matchedAccount
        ? (matchedAccount.accountingCategory || matchedAccount.group || '')
        : (value ? current.accountingCategory : ''),
    }))
  }

  function setAllBranches(checked) {
    setForm(current => ({
      ...current,
      allBranches: checked,
      branchSelections: checked ? [] : current.branchSelections,
    }))
  }

  function resolveSelectedDocumentBranches() {
    if (mode !== 'center') {
      return branchOptions.filter(item => (form.selectedBranchIds || []).includes(String(item.id)))
    }

    if (form.allBranches) return branchOptions
    const selectedIds = resolveDocumentBranchIds(form, branchOptions)
    return branchOptions.filter(item => selectedIds.includes(String(item.id)))
  }

  async function buildAllocationRows(selectedDocumentBranches, totalAmount) {
    const safeBranches = Array.isArray(selectedDocumentBranches) ? selectedDocumentBranches : []
    if (!safeBranches.length) return []

    if (safeBranches.length === 1 || form.distributionMode === 'equal') {
      const equalShare = 1 / safeBranches.length
      return safeBranches.map(branch => ({
        branch,
        share: equalShare,
        amount: totalAmount * equalShare,
      }))
    }

    const lookbackEnd = form.documentDate || todayStr()
    const lookbackStart = addDays(lookbackEnd, -29)
    const salesRows = await fetchSalesRows({
      branchNames: safeBranches.map(branch => branch.name).filter(Boolean),
      dateFrom: lookbackStart,
      dateTo: lookbackEnd,
    })

    const branchSalesMap = new Map(
      safeBranches.map(branch => [String(branch.name || ''), 0]),
    )

    salesRows
      .filter(row => row.status === 'completed')
      .forEach(row => {
        const branchName = String(row.branch_name || '')
        branchSalesMap.set(branchName, safeNumber(branchSalesMap.get(branchName)) + safeNumber(row.payment_total))
      })

    const totalSales = Array.from(branchSalesMap.values()).reduce((sum, value) => sum + safeNumber(value), 0)
    if (totalSales <= 0) {
      const equalShare = 1 / safeBranches.length
      return safeBranches.map(branch => ({
        branch,
        share: equalShare,
        amount: totalAmount * equalShare,
      }))
    }

    return safeBranches.map(branch => {
      const branchSales = safeNumber(branchSalesMap.get(String(branch.name || '')))
      const share = branchSales / totalSales
      return {
        branch,
        share,
        amount: totalAmount * share,
      }
    })
  }

  function resetForm() {
    setForm(createInitialForm(mode, branchId))
    setSaveState({ message: '', tone: 'info' })
  }

  async function saveDocument() {
    if (mode === 'center' && !form.allBranches && resolveDocumentBranchIds(form, branchOptions).length === 0) {
      setSaveState({ message: 'Merkez belge girişinde en az bir şube seçin.', tone: 'error' })
      return
    }

    if (mode !== 'center' && !branchId) {
      setSaveState({ message: 'Şube bağlamı olmadan belge taslağı kaydedilemez.', tone: 'error' })
      return
    }

    const now = new Date()
    const payload = {
      id: `${mode}-${now.getTime()}`,
      documentNo: form.documentNo,
      documentTypeLabel: DOCUMENT_TYPE_OPTIONS.find(item => item.value === form.documentType)?.label || 'Belirsiz',
      selectedBranchIds: mode === 'center'
        ? resolveDocumentBranchIds(form, branchOptions)
        : form.selectedBranchIds,
      supplierName,
      documentDate: form.documentDate,
      savedAt: now.toISOString(),
      savedAtLabel: now.toLocaleString('tr-TR'),
      form: {
        ...form,
        branchSelections: sanitizeBranchSelections(form.branchSelections || []),
        selectedBranchIds: mode === 'center'
          ? resolveDocumentBranchIds(form, branchOptions)
          : form.selectedBranchIds,
      },
    }

    const nextDrafts = [payload, ...drafts].slice(0, 12)
    setDrafts(nextDrafts)
    writeDrafts(mode, nextDrafts)
    setSaveState({ message: 'Belge taslağı yerel olarak kaydedildi.', tone: 'success' })
  }

  async function persistDocument() {
    if (mode === 'center' && !form.allBranches && resolveDocumentBranchIds(form, branchOptions).length === 0) {
      setSaveState({ message: 'Merkez belge girisinde en az bir sube secin.', tone: 'error' })
      return
    }

    if (mode !== 'center' && !branchId) {
      setSaveState({ message: 'Sube baglami olmadan belge kaydi yapilamaz.', tone: 'error' })
      return
    }

    if (!linkedExpenseAccount) {
      setSaveState({ message: 'Kayit icin hesap cizelgesinden bir gider hesabi secin.', tone: 'error' })
      return
    }

    const totalAmount = safeNumber(form.expenseAmount)
    if (totalAmount <= 0) {
      setSaveState({ message: 'Kayit icin gider tutari girin.', tone: 'error' })
      return
    }

    const selectedDocumentBranches = resolveSelectedDocumentBranches()
    if (!selectedDocumentBranches.length) {
      setSaveState({ message: 'Kayit icin en az bir sube secin.', tone: 'error' })
      return
    }

    const normalizedPeriodStart = form.periodStart || form.documentDate
    const normalizedPeriodEnd = form.periodEnd || form.periodStart || form.documentDate

    setSaving(true)
    try {
      const allocationRows = await buildAllocationRows(selectedDocumentBranches, totalAmount)
      const documentGroupId = createDocumentGroupId()
      const nowIso = new Date().toISOString()
      const payloadRows = allocationRows.map(allocation => ({
        document_group_id: documentGroupId,
        document_no: form.documentNo,
        document_type: form.documentType,
        supplier_id: form.supplierId || null,
        supplier_name: supplierName || null,
        expense_account_id: linkedExpenseAccount.id,
        expense_account_name: linkedExpenseAccount.name || null,
        accounting_code: linkedExpenseAccount.code || form.accountingCode || null,
        accounting_category: linkedExpenseAccount.accountingCategory || form.accountingCategory || null,
        account_group: linkedExpenseAccount.group || null,
        account_section: linkedExpenseAccount.section || null,
        account_type: linkedExpenseAccount.type || null,
        account_scope: linkedExpenseAccount.scope || null,
        branch_id: String(allocation.branch.id || ''),
        branch_name: allocation.branch.name || null,
        document_date: form.documentDate,
        period_start: normalizedPeriodStart,
        period_end: normalizedPeriodEnd,
        distribute_by_day: Boolean(form.distributeByDay),
        distribution_mode: form.distributionMode,
        allocation_share: allocation.share,
        amount: Number(allocation.amount.toFixed(2)),
        source_amount: Number(totalAmount.toFixed(2)),
        note: form.note || null,
        unregistered_reason: form.documentType === 'unregistered' ? (form.unregisteredReason || null) : null,
      }))

      const { error } = await db.from('expense_documents').insert(payloadRows)
      if (error) throw error

      setSaveState({ message: 'Belge gider kaydi olarak kaydedildi ve P&L raporuna baglandi.', tone: 'success' })
      setDrafts([])
      writeDrafts(mode, [])
      setForm(createInitialForm(mode, branchId))
    } catch (error) {
      console.error('Expense document save failed', error)
      const missingTable = error?.code === 'PGRST205' || String(error?.message || '').toLowerCase().includes('expense_documents')
      setSaveState({
        message: missingTable
          ? 'expense_documents tablosu bulunamadi. SQL dosyasini db uzerinde calistirin.'
          : (error?.message || 'Belge kaydedilemedi.'),
        tone: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  function loadDraft(nextForm) {
    setForm(nextForm)
    setSaveState({ message: 'Taslak forma yüklendi.', tone: 'info' })
  }

  const multipleBranchesSelected = mode === 'center' && selectedBranches.length > 1
  const isManualPeriod = form.periodMode === 'manual'
  const hasLinkedExpenseAccount = Boolean(linkedExpenseAccount)
  const saveToneStyle = saveState.tone === 'error'
    ? { color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }
    : saveState.tone === 'success'
      ? { color: '#166534', background: '#f0fdf4', borderColor: '#bbf7d0' }
      : { color: '#1d4ed8', background: '#eff6ff', borderColor: '#bfdbfe' }

  return (
    <div className="page-enter">
      <Header
        title={`Belge Girişi ${mode === 'center' ? '(Merkez)' : mode === 'anadepo' ? '(Ana Depo)' : mode === 'merkezmutfak' ? '(Merkez Mutfak)' : '(Şube)'}`}
        actions={(
          <>
            <button className="btn-o" type="button" onClick={resetForm}>
              <i className="fa-solid fa-rotate-left" /> Yeni Taslak
            </button>
            <button className="btn-p" type="button" onClick={persistDocument} disabled={saving}>
              <i className="fa-solid fa-floppy-disk" /> {saving ? 'Kaydediliyor...' : 'Belgeyi Kaydet'}
            </button>
          </>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 18 }}>
        <SummaryCard label="Belge No" value={form.documentNo} hint="Sistem tarafinda otomatik on taslak no verilir." bg="#eff6ff" color="#1d4ed8" />
        <SummaryCard label="Belge Tipi" value={DOCUMENT_TYPE_OPTIONS.find(item => item.value === form.documentType)?.label || '—'} bg="#f8fafc" color="#334155" />
        <SummaryCard
          label={mode === 'center' ? 'Seçilen Şubeler' : (mode === 'anadepo' ? 'Ana Depo' : (mode === 'merkezmutfak' ? 'Merkez Mutfak' : 'Bağlı Şube'))}
          value={mode !== 'center' ? (branchName || 'Seçili bağlam bekleniyor') : (form.allBranches ? 'Tüm şubeler' : String(selectedBranches.length))}
          hint={mode === 'center' ? (selectedBranches.map(item => item.name).join(', ') || 'Şube seçimi bekleniyor') : 'Şube bağlamı workspace seçiminden gelir.'}
          bg="#fff7ed"
          color="#c2410c"
        />
        <SummaryCard
          label="Dönem"
          value={`${formatDate(form.periodStart)} - ${formatDate(form.periodEnd)}`}
          hint={isManualPeriod ? 'Manuel tarih aralığı açık.' : 'Dönem belge tarihine göre otomatik hesaplanır.'}
          bg="#ecfeff"
          color="#0f766e"
        />
      </div>

      {saveState.message ? (
        <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 14, border: '1px solid', ...saveToneStyle }}>
          {saveState.message}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 16 }}>
        <SectionCard
          title="Belge Temel Bilgileri"
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
            <Field label="Belge No">
              <input className="f-input" value={form.documentNo} onChange={event => patchForm('documentNo', event.target.value)} />
            </Field>
            <Field
              label="Gider Hesabı"
              hint={loadingChartAccounts
                ? 'Hesap cizelgesi yukleniyor...'
                : 'Aktif gider hesaplari hesap cizelgesinden beslenir; secilen hesapla iliskili alanlar otomatik baglanir.'}
            >
              <select className="f-input" value={form.expenseAccount} onChange={event => handleExpenseAccountChange(event.target.value)}>
                {expenseAccountOptions.map(option => (
                  <option key={option.value || 'empty'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Tedarikçi" hint={supplierLoadError || ''}>
              <select className="f-input" value={form.supplierId} onChange={event => patchForm('supplierId', event.target.value)} disabled={loadingSuppliers}>
                <option value="">{loadingSuppliers ? 'Yükleniyor...' : 'Seçin...'}</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Muhasebe Kodu">
              <input
                className="f-input"
                value={form.accountingCode}
                onChange={event => patchForm('accountingCode', event.target.value)}
                placeholder="Secilen hesap kodu buraya gelir"
                readOnly={hasLinkedExpenseAccount}
              />
            </Field>
            <Field label="Muhasebe Kategorisi">
              <input
                className="f-input"
                value={form.accountingCategory}
                onChange={event => patchForm('accountingCategory', event.target.value)}
                placeholder="Secilen hesap kategorisi buraya gelir"
                readOnly={hasLinkedExpenseAccount}
              />
            </Field>
            <Field label="Gider Tutari">
              <input
                className="f-input"
                type="number"
                min="0"
                step="0.01"
                value={form.expenseAmount || ''}
                onChange={event => patchForm('expenseAmount', event.target.value)}
                placeholder="Orn. 1250.00"
              />
            </Field>
            <Field label="Bolum">
              <input
                className="f-input"
                value={linkedExpenseAccount ? getAccountSectionLabel(linkedExpenseAccount.section) : ''}
                placeholder="Secilen hesap bolumu buraya gelir"
                readOnly
              />
            </Field>
            <Field label="Grup">
              <input
                className="f-input"
                value={linkedExpenseAccount?.group || ''}
                placeholder="Secilen hesap grubu buraya gelir"
                readOnly
              />
            </Field>
            <Field label="Hesap Turu">
              <input
                className="f-input"
                value={linkedExpenseAccount ? getAccountTypeLabel(linkedExpenseAccount.type) : ''}
                placeholder="Secilen hesap turu buraya gelir"
                readOnly
              />
            </Field>
            <Field label="Kapsam">
              <input
                className="f-input"
                value={linkedExpenseAccount ? getAccountScopeLabel(linkedExpenseAccount.scope) : ''}
                placeholder="Secilen hesap kapsami buraya gelir"
                readOnly
              />
            </Field>
            <Field
              label="Belge Tarihi"
              hint={form.documentType === 'accrual'
                ? 'Tahakkuk seçiminde bugünün tarihi otomatik gelir.'
                : 'Fatura seçeneğinde tarih serbestçe girilebilir.'}
            >
              <input
                className="f-input"
                type="date"
                value={form.documentDate}
                onChange={event => patchForm('documentDate', event.target.value)}
                disabled={form.documentType === 'accrual'}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="Belge Tipi"
        >
          <ChoiceCardGroup options={DOCUMENT_TYPE_OPTIONS} value={form.documentType} onChange={value => patchForm('documentType', value)} />

          {form.documentType === 'accrual' ? (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
              Giderin belgesi geldiği zaman bu ekrandan düzeltme yapmayı unutmayın.
            </div>
          ) : null}

          {form.documentType === 'unregistered' ? (
            <div style={{ marginTop: 14 }}>
              <Field label="Belgesiz Açıklama" hint="Belgesiz seçeneğinde açıklama zorunlu olacak şekilde hazırlandı.">
                <textarea
                  className="f-input"
                  value={form.unregisteredReason}
                  onChange={event => patchForm('unregisteredReason', event.target.value)}
                  rows={4}
                  placeholder="Belgenin neden olmadığını veya neyin beklendiğini yazın"
                  style={{ resize: 'vertical', minHeight: 108 }}
                />
              </Field>
            </div>
          ) : null}
        </SectionCard>

        {mode === 'center' ? (
          <SectionCard
            title="Şube Dağıtımı"
          >
            {loadingBranches ? (
              <div style={{ color: '#64748b', fontSize: '.85rem' }}>
                <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                Şube listesi yükleniyor...
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gap: 14 }}>
                  <Toggle
                    checked={form.allBranches}
                    onChange={setAllBranches}
                    label="Tüm şubelerde kullan"
                  />

                  {!form.allBranches ? (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#fff' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                        {selectedBranches.length === 0 ? <span style={{ fontSize: '.77rem', color: '#94a3b8' }}>Henüz şube seçilmedi.</span> : null}
                        {selectedBranchSelectionSummary.filter(item => item.type === 'template').map(item => (
                          <Chip key={`template-${item.id}`} bg="#ede9fe" color="#6d28d9">
                            <i className="fa-solid fa-layer-group" />
                            {item.name}
                          </Chip>
                        ))}
                        {selectedBranchSelectionSummary.filter(item => item.type === 'branch').map(item => (
                          <Chip key={`branch-${item.id}`} bg="#eff6ff" color="#1d4ed8">
                            <i className={`fa-solid ${item.id === 'center' ? 'fa-building-columns' : 'fa-store'}`} />
                            {item.name}
                          </Chip>
                        ))}
                      </div>
                      <DocumentBranchSelection
                        branches={branchOptions}
                        templates={branchTemplates}
                        value={form.branchSelections || []}
                        onChange={next => setForm(current => ({ ...current, branchSelections: next }))}
                      />
                    </div>
                  ) : null}
                </div>

                {multipleBranchesSelected ? (
                  <div style={{ marginTop: 16 }}>
                    <ChoiceCardGroup options={DISTRIBUTION_OPTIONS} value={form.distributionMode} onChange={value => patchForm('distributionMode', value)} />
                  </div>
                ) : (
                  <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', color: '#64748b' }}>
                    Dağıtım yöntemi, birden fazla şube seçildiğinde aktif olur.
                  </div>
                )}
              </>
            )}
          </SectionCard>
        ) : (
          <SectionCard
            title="Şube Bağlamı"
            subtitle="Şube belge girişinde seçim mevcut workspace bağlamından otomatik gelir."
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '10px 14px', background: '#fff7ed', color: '#c2410c', fontWeight: 800 }}>
                <i className="fa-solid fa-store" />
                {branchName || 'Seçili şube bekleniyor'}
              </span>
            </div>
          </SectionCard>
        )}

        <SectionCard
          title="Gider Dönemi"
          subtitle="Dönem seçimi belge tarihine göre hesaplanır; manuel seçenekte tarih aralığı serbesttir."
        >
          <ChoiceCardGroup
            options={PERIOD_OPTIONS.map(option => ({
              ...option,
              color: '#0f766e',
              bg: '#ecfeff',
            }))}
            value={form.periodMode}
            onChange={value => patchForm('periodMode', value)}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14, marginTop: 14 }}>
            <Field label="Başlangıç">
              <input className="f-input" type="date" value={form.periodStart} onChange={event => patchForm('periodStart', event.target.value)} disabled={!isManualPeriod} />
            </Field>
            <Field label="Bitiş">
              <input className="f-input" type="date" value={form.periodEnd} onChange={event => patchForm('periodEnd', event.target.value)} disabled={!isManualPeriod} />
            </Field>
            <Field label="Günlere Dağıt">
              <button
                type="button"
                onClick={() => patchForm('distributeByDay', !form.distributeByDay)}
                style={{
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 12,
                  border: `1.5px solid ${form.distributeByDay ? '#16a34a' : '#e2e8f0'}`,
                  background: form.distributeByDay ? '#f0fdf4' : '#fff',
                  color: form.distributeByDay ? '#166534' : '#475569',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                <i className={`fa-solid ${form.distributeByDay ? 'fa-check' : 'fa-minus'}`} style={{ marginRight: 8 }} />
                {form.distributeByDay ? 'Aktif' : 'Kapalı'}
              </button>
            </Field>
          </div>

          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: '#f8fafc', color: '#64748b', lineHeight: 1.6 }}>
            Günlere dağıt açıksa, seçilen tarih aralığındaki günlere eşit yayılım mantığı ile raporlanacak şekilde hazırlandı.
          </div>
        </SectionCard>

        <SectionCard
          title="Notlar"
        >
          <Field label="Not">
            <textarea
              className="f-input"
              value={form.note}
              onChange={event => patchForm('note', event.target.value)}
              rows={4}
              placeholder="Tedarikçi, dönem veya dağıtımla ilgili notlar"
              style={{ resize: 'vertical', minHeight: 108 }}
            />
          </Field>
        </SectionCard>

        <DraftTable drafts={drafts} branchNamesById={branchNamesById} onLoad={loadDraft} />
      </div>
    </div>
  )
}
