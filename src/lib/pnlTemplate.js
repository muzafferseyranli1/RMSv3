import { DEFAULT_ACCOUNT_CHART, normalizeAccountChart } from '@/lib/accountChart'

export const PNL_TEMPLATE_KEY = 'pnl_template_v1'
export const PNL_TEMPLATE_VERSION = 1

export const PNL_SCOPE_MODE_OPTIONS = [
  { value: 'all', label: 'Tum Subeler' },
  { value: 'branch', label: 'Tek Sube' },
  { value: 'template', label: 'Sube Sablonu' },
]

export const PNL_DATE_PRESETS = [
  { key: 'today', label: 'Bugun' },
  { key: 'last7', label: 'Son 7 Gun' },
  { key: 'last30', label: 'Son 30 Gun' },
  { key: 'month', label: 'Bu Ay' },
]

export const PNL_BLOCK_DEFS = [
  {
    id: 'revenue',
    title: 'Gelirler',
    addLabel: 'Ek gelir / gider satiri ekle',
    defaultMode: 'income',
    modeOptions: [
      { value: 'income', label: 'Gelire ekle' },
      { value: 'contra', label: 'Gelirden dus' },
    ],
    rows: [
      {
        id: 'gross-sales',
        label: 'Brut Satis Gelirleri',
        defaultAccountNames: ['Brut Satis Gelirleri'],
        exampleAmount: 1000,
        mode: 'income',
      },
      {
        id: 'other-income',
        label: 'Diger Gelirler',
        defaultAccountNames: ['Diger Gelirler'],
        exampleAmount: 150,
        mode: 'income',
      },
      {
        id: 'vat',
        label: 'KDV',
        defaultAccountNames: ['KDV'],
        exampleAmount: 115,
        mode: 'contra',
      },
    ],
    summaryRows: [
      { id: 'net-revenue', label: 'Net Gelir', formula: 'netRevenue' },
    ],
  },
  {
    id: 'prime-cost',
    title: 'Brut Maliyet (IMM)',
    addLabel: 'Ek gider satiri ekle',
    defaultMode: 'expense',
    rows: [
      {
        id: 'food-cost',
        label: 'Yiyecek Maliyeti',
        defaultAccountNames: ['Ana Stok Grubu 1', 'Ana Stok Grubu 2'],
        exampleAmount: 305,
      },
      {
        id: 'packaging-cost',
        label: 'Ambalaj Maliyeti',
        defaultAccountNames: ['Paketleme Malz', 'Ana Stok Grubu 2'],
        exampleAmount: 15,
      },
      {
        id: 'waste-cost',
        label: 'Zayi',
        defaultAccountNames: ['Zayi Giderleri'],
        exampleAmount: 10,
      },
      {
        id: 'inventory-diff',
        label: 'Envanter farki',
        defaultAccountNames: ['Sayim Eksigi', 'Sayim Fazlasi'],
        exampleAmount: 5,
      },
    ],
    summaryRows: [
      { id: 'total-prime-cost', label: 'Toplam Ilk Madde Maliyeti', formula: 'blockTotal' },
      { id: 'gross-profit', label: 'Brut Kar', formula: 'grossProfit' },
    ],
  },
  {
    id: 'variable-expense',
    title: 'Degisken Giderler',
    addLabel: 'Ek kontrol edilebilir gider ekle',
    defaultMode: 'expense',
    rows: [
      {
        id: 'personnel-cost',
        label: 'Personel Giderleri',
        defaultAccountNames: ['Personel Net Maas giderleri'],
        exampleAmount: 270,
      },
      {
        id: 'personnel-tax',
        label: 'Personel Vergileri',
        defaultAccountNames: ['Bordro isveren vergileri gider', 'Personel SGK gideri'],
        exampleAmount: 35,
      },
      {
        id: 'energy-cost',
        label: 'Enerji giderleri',
        defaultAccountNames: ['Elektrik', 'Dogalgaz'],
        exampleAmount: 45,
      },
      {
        id: 'commission-cost',
        label: 'Komisyon Giderleri',
        defaultAccountNames: ['Pazar yeri komisyonlari', 'Kredi Karti Komisyonlari'],
        exampleAmount: 32,
      },
      {
        id: 'communication-cost',
        label: 'Haberlesme giderleri',
        defaultAccountNames: ['Internet', 'Telefon'],
        exampleAmount: 0,
      },
    ],
    summaryRows: [
      { id: 'total-variable-expense', label: 'Toplam Degisken giderler', formula: 'blockTotal' },
      { id: 'post-variable-profit', label: 'Degisken giderler sonrasi kalan Kar', formula: 'postVariableProfit' },
    ],
  },
  {
    id: 'fixed-expense',
    title: 'Sabit Giderler',
    addLabel: 'Ek kontrol edilemez gider ekle',
    defaultMode: 'expense',
    rows: [
      {
        id: 'rent',
        label: 'Kira',
        defaultAccountNames: ['Kira'],
        exampleAmount: 105,
      },
      {
        id: 'shared-area',
        label: 'Ortak alan',
        defaultAccountNames: ['Ortak Alan'],
        exampleAmount: 15,
      },
    ],
    summaryRows: [
      { id: 'total-fixed-expense', label: 'Toplam Sabit giderler', formula: 'blockTotal' },
      { id: 'post-fixed-profit', label: 'Sabit Giderler sonrasi kalan Kar', formula: 'postFixedProfit' },
    ],
  },
  {
    id: 'management-expense',
    title: 'Genel Yonetim Giderleri',
    addLabel: 'Ek kontrol yonetim gideri ekle',
    defaultMode: 'expense',
    rows: [
      {
        id: 'hq-rent',
        label: 'Genel Mudurluk Kirasi Payi',
        defaultAccountNames: ['Genel Mudurluk Kirasi'],
        exampleAmount: 23,
      },
      {
        id: 'ops-support',
        label: 'Operasyon destek maaslari',
        defaultAccountNames: ['Operasyon destek maaslari'],
        exampleAmount: 19,
      },
    ],
    summaryRows: [
      { id: 'total-management-expense', label: 'Toplam Genel Yonetim Giderleri', formula: 'blockTotal' },
      { id: 'operating-profit', label: 'Toplam Isletme Kar/Zarar', formula: 'operatingProfit', emphasis: true },
    ],
  },
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeComparable(value) {
  return normalizeText(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function normalizeAmount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function normalizeIdList(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map(item => normalizeText(item))
      .filter(Boolean),
  ))
}

function pickMode(blockDef, value) {
  const validModes = blockDef.modeOptions?.map(option => option.value) || [blockDef.defaultMode]
  return validModes.includes(value) ? value : blockDef.defaultMode
}

function createTemplateRowId(blockId = 'row') {
  return `${blockId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function matchAccountIdsByNames(chartAccounts, names) {
  if (!Array.isArray(names) || names.length === 0) return []

  const normalizedNames = new Set(names.map(normalizeComparable))
  return chartAccounts
    .filter(account => normalizedNames.has(normalizeComparable(account.name)))
    .map(account => account.id)
}

function normalizeTemplateRow(row, blockDef, chartAccounts, fallbackDef = null) {
  const source = row || {}
  const fallback = fallbackDef || {}
  const accountIds = normalizeIdList(source.accountIds)

  return {
    id: normalizeText(source.id) || normalizeText(fallback.id) || createTemplateRowId(blockDef.id),
    name: normalizeText(source.name) || normalizeText(fallback.label) || 'Yeni P&L satiri',
    accountIds: accountIds.length > 0
      ? accountIds
      : matchAccountIdsByNames(chartAccounts, source.defaultAccountNames || fallback.defaultAccountNames || []),
    exampleAmount: normalizeAmount(source.exampleAmount ?? fallback.exampleAmount ?? 0),
    builtin: fallbackDef ? true : source.builtin === false ? false : true,
    mode: pickMode(blockDef, normalizeText(source.mode) || normalizeText(fallback.mode) || blockDef.defaultMode),
  }
}

export function getAccountLabel(account) {
  if (!account) return 'Hesap bulunamadi'
  return account.code ? `${account.name} (${account.code})` : account.name
}

export function createEmptyPnlRow(blockId) {
  const blockDef = PNL_BLOCK_DEFS.find(block => block.id === blockId) || PNL_BLOCK_DEFS[0]
  return {
    id: createTemplateRowId(blockDef.id),
    name: 'Yeni P&L satiri',
    accountIds: [],
    exampleAmount: 0,
    builtin: false,
    mode: blockDef.defaultMode,
  }
}

export function createDefaultPnlTemplate(chartAccounts = DEFAULT_ACCOUNT_CHART) {
  const safeChartAccounts = normalizeAccountChart(chartAccounts, DEFAULT_ACCOUNT_CHART)

  return {
    version: PNL_TEMPLATE_VERSION,
    name: 'Varsayilan P&L Formati',
    updatedAt: null,
    blocks: PNL_BLOCK_DEFS.map(block => ({
      id: block.id,
      rows: block.rows.map(row => normalizeTemplateRow({}, block, safeChartAccounts, row)),
    })),
  }
}

export function normalizePnlTemplate(value, chartAccounts = DEFAULT_ACCOUNT_CHART) {
  const safeChartAccounts = normalizeAccountChart(chartAccounts, DEFAULT_ACCOUNT_CHART)
  const source = value && typeof value === 'object' ? value : {}
  const savedBlocks = Array.isArray(source.blocks) ? source.blocks : []

  return {
    version: PNL_TEMPLATE_VERSION,
    name: normalizeText(source.name) || 'Varsayilan P&L Formati',
    updatedAt: source.updatedAt || null,
    blocks: PNL_BLOCK_DEFS.map(block => {
      const savedBlock = savedBlocks.find(item => item?.id === block.id)
      const savedRows = Array.isArray(savedBlock?.rows) ? savedBlock.rows : []
      const builtInMap = new Map(savedRows.filter(row => row?.builtin !== false).map(row => [row.id, row]))
      const customRows = savedRows
        .filter(row => row?.builtin === false)
        .map(row => normalizeTemplateRow(row, block, safeChartAccounts))

      return {
        id: block.id,
        rows: [
          ...block.rows.map(row => normalizeTemplateRow(builtInMap.get(row.id), block, safeChartAccounts, row)),
          ...customRows,
        ],
      }
    }),
  }
}

export function buildPnlAccountUsage(template) {
  const usage = new Map()

  for (const block of template?.blocks || []) {
    for (const row of block?.rows || []) {
      for (const accountId of row?.accountIds || []) {
        if (!usage.has(accountId)) usage.set(accountId, row.id)
      }
    }
  }

  return usage
}

export function getAvailablePnlAccounts(chartAccounts, template, rowId) {
  const safeAccounts = normalizeAccountChart(chartAccounts, DEFAULT_ACCOUNT_CHART).filter(account => account.active)
  const usage = buildPnlAccountUsage(template)

  return safeAccounts.filter(account => {
    const ownerRowId = usage.get(account.id)
    return !ownerRowId || ownerRowId === rowId
  })
}

export function findPnlBlock(template, blockId) {
  return template?.blocks?.find(block => block.id === blockId) || null
}

function ratioOf(value, base) {
  if (!base) return null
  return Number(value || 0) / Number(base || 0)
}

function scaleAmount(amount, scale = 1) {
  return normalizeAmount(amount) * Number(scale || 1)
}

function resolveRowAmount(row, scale, amountOverrides) {
  if (!amountOverrides) return scaleAmount(row.exampleAmount, scale)

  if (amountOverrides instanceof Map && amountOverrides.has(row.id)) {
    return normalizeAmount(amountOverrides.get(row.id))
  }

  if (typeof amountOverrides === 'object' && amountOverrides !== null && row.id in amountOverrides) {
    return normalizeAmount(amountOverrides[row.id])
  }

  return scaleAmount(row.exampleAmount, scale)
}

function buildPreviewRows(blockDef, block, accountMap, scale, amountOverrides) {
  return (block?.rows || []).map(row => {
    const mappedAccounts = (row.accountIds || []).map(accountId => accountMap.get(accountId)).filter(Boolean)
    const amount = resolveRowAmount(row, scale, amountOverrides)
    return {
      id: row.id,
      label: row.name,
      amount,
      mode: blockDef.id === 'revenue' ? row.mode : 'expense',
      mappedAccounts,
      accountLabels: mappedAccounts.map(getAccountLabel),
      builtin: row.builtin !== false,
    }
  })
}

export function buildPnlPreview(template, chartAccounts, options = {}) {
  const safeTemplate = normalizePnlTemplate(template, chartAccounts)
  const safeChartAccounts = normalizeAccountChart(chartAccounts, DEFAULT_ACCOUNT_CHART)
  const accountMap = new Map(safeChartAccounts.map(account => [account.id, account]))
  const scale = Number(options.scale || 1)
  const amountOverrides = options.rowAmounts || null

  const revenueBlock = buildPreviewRows(PNL_BLOCK_DEFS[0], safeTemplate.blocks[0], accountMap, scale, amountOverrides)
  const primeCostBlock = buildPreviewRows(PNL_BLOCK_DEFS[1], safeTemplate.blocks[1], accountMap, scale, amountOverrides)
  const variableBlock = buildPreviewRows(PNL_BLOCK_DEFS[2], safeTemplate.blocks[2], accountMap, scale, amountOverrides)
  const fixedBlock = buildPreviewRows(PNL_BLOCK_DEFS[3], safeTemplate.blocks[3], accountMap, scale, amountOverrides)
  const managementBlock = buildPreviewRows(PNL_BLOCK_DEFS[4], safeTemplate.blocks[4], accountMap, scale, amountOverrides)

  const revenueTotal = revenueBlock.reduce((sum, row) => (
    sum + (row.mode === 'contra' ? -row.amount : row.amount)
  ), 0)
  const primeCostTotal = primeCostBlock.reduce((sum, row) => sum + row.amount, 0)
  const grossProfit = revenueTotal - primeCostTotal
  const variableTotal = variableBlock.reduce((sum, row) => sum + row.amount, 0)
  const postVariableProfit = grossProfit - variableTotal
  const fixedTotal = fixedBlock.reduce((sum, row) => sum + row.amount, 0)
  const postFixedProfit = postVariableProfit - fixedTotal
  const managementTotal = managementBlock.reduce((sum, row) => sum + row.amount, 0)
  const operatingProfit = postFixedProfit - managementTotal

  const summaryMap = {
    revenue: [
      { id: 'net-revenue', label: 'Net Gelir', amount: revenueTotal, ratio: ratioOf(revenueTotal, revenueTotal) },
    ],
    'prime-cost': [
      { id: 'total-prime-cost', label: 'Toplam Ilk Madde Maliyeti', amount: primeCostTotal, ratio: ratioOf(primeCostTotal, revenueTotal) },
      { id: 'gross-profit', label: 'Brut Kar', amount: grossProfit, ratio: ratioOf(grossProfit, revenueTotal) },
    ],
    'variable-expense': [
      { id: 'total-variable-expense', label: 'Toplam Degisken giderler', amount: variableTotal, ratio: ratioOf(variableTotal, revenueTotal) },
      { id: 'post-variable-profit', label: 'Degisken giderler sonrasi kalan Kar', amount: postVariableProfit, ratio: ratioOf(postVariableProfit, revenueTotal) },
    ],
    'fixed-expense': [
      { id: 'total-fixed-expense', label: 'Toplam Sabit giderler', amount: fixedTotal, ratio: ratioOf(fixedTotal, revenueTotal) },
      { id: 'post-fixed-profit', label: 'Sabit Giderler sonrasi kalan Kar', amount: postFixedProfit, ratio: ratioOf(postFixedProfit, revenueTotal) },
    ],
    'management-expense': [
      { id: 'total-management-expense', label: 'Toplam Genel Yonetim Giderleri', amount: managementTotal, ratio: ratioOf(managementTotal, revenueTotal) },
      { id: 'operating-profit', label: 'Toplam Isletme Kar/Zarar', amount: operatingProfit, ratio: ratioOf(operatingProfit, revenueTotal), emphasis: true },
    ],
  }

  const blockRowsMap = {
    revenue: revenueBlock,
    'prime-cost': primeCostBlock,
    'variable-expense': variableBlock,
    'fixed-expense': fixedBlock,
    'management-expense': managementBlock,
  }

  return {
    templateName: safeTemplate.name,
    baseRevenue: revenueTotal,
    totals: {
      revenueTotal,
      primeCostTotal,
      grossProfit,
      variableTotal,
      postVariableProfit,
      fixedTotal,
      postFixedProfit,
      managementTotal,
      operatingProfit,
    },
    blocks: PNL_BLOCK_DEFS.map(block => ({
      id: block.id,
      title: block.title,
      rows: blockRowsMap[block.id] || [],
      summaryRows: summaryMap[block.id] || [],
      addLabel: block.addLabel,
      modeOptions: block.modeOptions || [],
    })),
  }
}

export function createDateRangeFromPreset(presetKey, todayFactory = () => new Date()) {
  const today = new Date(todayFactory())
  today.setHours(0, 0, 0, 0)

  function format(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const end = new Date(today)
  const start = new Date(today)

  if (presetKey === 'last7') start.setDate(start.getDate() - 6)
  if (presetKey === 'last30') start.setDate(start.getDate() - 29)
  if (presetKey === 'month') start.setDate(1)

  return {
    dateFrom: format(start),
    dateTo: format(end),
  }
}
