import { normalizeAccountChart, sortAccounts } from '@/lib/accountChart'

function createOptions(accounts, allowedTypes) {
  const allowed = new Set(allowedTypes || [])
  return sortAccounts(normalizeAccountChart(accounts, []))
    .filter(account => account.active)
    .filter(account => allowed.size === 0 || allowed.has(account.type))
    .map(account => ({
      value: account.id,
      label: account.code ? `${account.name} (${account.code})` : account.name,
    }))
}

export function createChartAccountMap(accounts = []) {
  return new Map(normalizeAccountChart(accounts, []).map(account => [account.id, account]))
}

export function buildStockCategoryAccountOptions(accounts = []) {
  return createOptions(accounts, ['gider', 'dogrudan-gider'])
}

export function buildSaleCategoryAccountOptions(accounts = []) {
  return createOptions(accounts, ['gelir'])
}

export function buildSemiCategoryAccountOptions(accounts = []) {
  return createOptions(accounts, ['gider', 'dogrudan-gider'])
}

export function resolveLegacyAccountingFields(account, fallbackGroup = '') {
  return {
    accCat: account?.group || account?.accountingCategory || fallbackGroup || '',
    accCode: account?.code || '',
  }
}
