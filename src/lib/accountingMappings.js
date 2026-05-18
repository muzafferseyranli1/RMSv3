import { normalizeAccountChart } from '@/lib/accountChart'

export const ACCOUNTING_MAPPINGS_KEY = 'accounting_event_mappings_v1'

export const ACCOUNTING_EVENT_GROUPS = [
  {
    id: 'inventory',
    title: 'Envanter ve Sayim',
    description: 'Sistemin otomatik urettigi stok farklarini hangi muhasebe hesabina atacagini belirler.',
  },
]

export const ACCOUNTING_EVENT_DEFINITIONS = [
  {
    id: 'stock_count_loss',
    groupId: 'inventory',
    label: 'Sayim Eksigi',
    description: 'Sayim sonucu stok eksigi olustugunda kullanilir.',
    sourceLabel: 'Count -> inventory_movements.stock_count_loss',
    defaultAccountNames: ['Sayim Eksigi'],
    supportedAccountTypes: ['dogrudan-gider', 'gider'],
    live: true,
  },
  {
    id: 'stock_count_gain',
    groupId: 'inventory',
    label: 'Sayim Fazlasi',
    description: 'Sayim sonucu stok fazlasi olustugunda kullanilir.',
    sourceLabel: 'Count -> inventory_movements.stock_count_gain',
    defaultAccountNames: ['Sayim Fazlasi'],
    supportedAccountTypes: ['gelir', 'gider'],
    live: true,
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

function findDefaultAccountId(chartAccounts, eventDef) {
  const safeAccounts = normalizeAccountChart(chartAccounts, [])
  const normalizedNames = new Set((eventDef.defaultAccountNames || []).map(normalizeComparable))
  return safeAccounts.find(account => normalizedNames.has(normalizeComparable(account.name)))?.id || ''
}

export function getAccountingEventDefinition(eventId) {
  return ACCOUNTING_EVENT_DEFINITIONS.find(definition => definition.id === eventId) || null
}

export function createDefaultAccountingMappings(chartAccounts = []) {
  return ACCOUNTING_EVENT_DEFINITIONS.reduce((result, definition) => {
    result[definition.id] = findDefaultAccountId(chartAccounts, definition)
    return result
  }, {})
}

export function normalizeAccountingMappings(value, chartAccounts = []) {
  const safeAccounts = normalizeAccountChart(chartAccounts, [])
  const validAccountIds = new Set(safeAccounts.map(account => account.id))
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const defaults = createDefaultAccountingMappings(safeAccounts)

  return ACCOUNTING_EVENT_DEFINITIONS.reduce((result, definition) => {
    const mappedAccountId = normalizeText(source[definition.id])
    result[definition.id] = validAccountIds.has(mappedAccountId)
      ? mappedAccountId
      : defaults[definition.id] || ''
    return result
  }, {})
}

export function groupAccountingEventDefinitions() {
  return ACCOUNTING_EVENT_GROUPS.map(group => ({
    ...group,
    events: ACCOUNTING_EVENT_DEFINITIONS.filter(definition => definition.groupId === group.id),
  }))
}

