import { COUNT_MONTH_ORDINALS } from '@/lib/countFlowConfig'
import { parseJsonValue } from '@/lib/branchPurchasing'

export function parseMaybeArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function getAllBranchesFromTree(tree) {
  const result = []
  function walk(nodes) {
    for (const node of nodes || []) {
      if (node?.type === 'sube' || node?.type === 'anadepo' || node?.type === 'mutfak') result.push({ id: String(node.id), name: String(node.name || '') })
      walk(node?.children || [])
    }
  }
  walk(Array.isArray(tree) ? tree : [])
  return result
}

export function sortCountFlows(flows) {
  return [...(flows || [])].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')))
}

function joinLabels(items) {
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} ve ${items[1]}`
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`
}

export function describeCountSchedule(schedule) {
  if (!schedule) return 'Takvim tanımsız'
  if (schedule.frequency === 'daily') return `Her gün ${schedule.startTime}`
  if (schedule.frequency === 'weekly') return `${joinLabels(schedule.weekdays || [])} ${schedule.startTime}`
  if (schedule.monthlyMode === 'weekday') {
    const rules = (schedule.monthlyWeekdayRules || []).map(rule => {
      const ordinal = COUNT_MONTH_ORDINALS.find(item => item.value === rule.ordinal)?.label || rule.ordinal
      return `ayın ${ordinal} ${rule.weekday}`
    })
    return `${joinLabels(rules)} ${schedule.startTime}`
  }
  const labels = (schedule.monthlyDays || []).map(day => day === 'last' ? 'ayın son günü' : `ayın ${day}. günü`)
  return `${joinLabels(labels)} ${schedule.startTime}`
}

export function describeCountScope(products) {
  if (!products) return 'Ürün kapsamı tanımsız'
  if (products.mode === 'moving') return `Son ${products.movementDays} gün hareketi olan ürünler`
  if (products.mode === 'all') return 'Tüm stok ürünleri'
  if (products.mode === 'manual') return `${products.selectedStocks?.length || 0} seçili ürün`
  if (products.mode === 'category') return `${products.selectedCategories?.length || 0} kategori`
  if (products.mode === 'template') return `${products.selectedTemplates?.length || 0} şablon`
  return 'Ürün kapsamı tanımsız'
}

export function resolveFlowBranchIds(flow, branches) {
  if (flow?.branches?.allBranches) return (branches || []).map(branch => String(branch.id))
  return [...new Set((flow?.branches?.selections || []).flatMap(item => item.type === 'template' ? (item.branchIds || []).map(id => String(id)) : [String(item.id)]))]
}

export function buildCountFlowProductItems(flow, stockItems, stockTemplates) {
  if (!flow) return []
  if (flow.products.mode === 'all' || flow.products.mode === 'moving') return [...(stockItems || [])]

  if (flow.products.mode === 'manual') {
    const selectedIds = new Set((flow.products.selectedStocks || []).map(item => String(item.id)))
    return (stockItems || []).filter(item => selectedIds.has(String(item.id)))
  }

  if (flow.products.mode === 'category') {
    const selectedIds = new Set((flow.products.selectedCategories || []).map(item => String(item.id)))
    return (stockItems || []).filter(item => (
      selectedIds.has(String(item.cat_l1 || '')) ||
      selectedIds.has(String(item.cat_l2 || '')) ||
      selectedIds.has(String(item.cat_l3 || '')) ||
      selectedIds.has(String(item.cat_l4 || '')) ||
      selectedIds.has(String(item.cat_l5 || ''))
    ))
  }

  if (flow.products.mode === 'template') {
    const templateIds = new Set((flow.products.selectedTemplates || []).map(item => String(item.id)))
    const stockIds = new Set()
    for (const template of stockTemplates || []) {
      if (!templateIds.has(String(template.id))) continue
      for (const stockId of parseJsonValue(template.stock_ids, [])) {
        stockIds.add(String(stockId))
      }
    }
    return (stockItems || []).filter(item => stockIds.has(String(item.id)))
  }

  return []
}

export function buildCountFlowProductPreview(flow, stockItems, stockTemplates) {
  return buildCountFlowProductItems(flow, stockItems, stockTemplates).slice(0, 5)
}
