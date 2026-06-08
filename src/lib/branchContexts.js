import { db } from '@/lib/db'

const DEFAULT_BRANCH_NAME = 'Kadikoy Subesi'
const BRANCH_CONTEXT_CACHE_KEY = 'suitable-rms:branch-contexts-v1'
const BRANCH_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000
let branchContextLoadPromise = null

function parseJsonValue(value, fallback = []) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function normalizeBranchText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
}

function compareNodeOrder(left = {}, right = {}) {
  const sortDiff = (Number(left.sort_order) || 0) - (Number(right.sort_order) || 0)
  if (sortDiff !== 0) return sortDiff
  return String(left.name || '').localeCompare(String(right.name || ''), 'tr')
}

function readBranchContextCache() {
  if (typeof window === 'undefined') return { contexts: null, fresh: false }

  try {
    const raw = window.localStorage.getItem(BRANCH_CONTEXT_CACHE_KEY)
    if (!raw) return { contexts: null, fresh: false }
    const parsed = JSON.parse(raw)
    const contexts = Array.isArray(parsed?.contexts) ? parsed.contexts : []
    const updatedAt = Number(parsed?.updatedAt) || 0
    const fresh = Date.now() - updatedAt < BRANCH_CONTEXT_CACHE_TTL_MS
    return { contexts: contexts.length > 0 ? contexts : null, fresh }
  } catch {
    return { contexts: null, fresh: false }
  }
}

function writeBranchContextCache(contexts = []) {
  if (typeof window === 'undefined') return
  if (!Array.isArray(contexts) || contexts.length === 0) return

  try {
    window.localStorage.setItem(
      BRANCH_CONTEXT_CACHE_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        contexts,
      }),
    )
  } catch {
    // best effort only
  }
}

export function findPreferredBranchContext(branchContexts, preferredId = '') {
  const list = Array.isArray(branchContexts)
    ? branchContexts
      .map(item => {
        const branchId = String(item?.branchId || item?.id || '').trim()
        const branchName = String(item?.branchName || item?.name || '').trim()
        if (!branchId || !branchName) return null
        return {
          ...item,
          branchId,
          branchName,
        }
      })
      .filter(Boolean)
    : []

  if (preferredId) {
    const remembered = list.find(branch => String(branch.branchId) === String(preferredId))
    if (remembered) return remembered
  }

  const kadikoyBranch = list.find(branch => (
    normalizeBranchText(branch.branchName) === normalizeBranchText(DEFAULT_BRANCH_NAME)
  ))
  if (kadikoyBranch) return kadikoyBranch

  return list[0] || null
}

export function mapBranchContextsToWorkspaceBranches(branchContexts = []) {
  return (branchContexts || []).map(branch => ({
    id: String(branch.branchId),
    name: branch.branchName,
    workspaceScope: branch.workspaceScope || null,
  }))
}

export function buildBranchContextsFromCompanyNodes(nodes = []) {
  const normalizedNodes = Array.isArray(nodes) ? [...nodes] : []
  const nodeMap = new Map(normalizedNodes.map(node => [String(node.id), node]))

  return normalizedNodes
    .filter(node => node?.can_sell === true)
    .sort(compareNodeOrder)
    .map(branchNode => {
      let current = branchNode
      let company = null
      let legalEntity = null
      let orgUnit = null

      while (current?.parent_id) {
        const parent = nodeMap.get(String(current.parent_id))
        if (!parent) break

        if (!company && parent.type === 'sirket') company = parent
        if (!legalEntity && parent.type === 'tuzel') legalEntity = parent
        if (!orgUnit && parent.type === 'org') orgUnit = parent
        current = parent
      }

      return {
        branchId: String(branchNode.id),
        branchName: branchNode.name,
        companyId: company?.id ? String(company.id) : null,
        companyName: company?.name || null,
        legalEntityId: legalEntity?.id ? String(legalEntity.id) : null,
        legalEntityName: legalEntity?.name || null,
        orgUnitId: orgUnit?.id ? String(orgUnit.id) : null,
        orgUnitName: orgUnit?.name || null,
        workspaceScope: branchNode.workspace_scope || null,
      }
    })
}

export function buildPersonnelNodesFromCompanyNodes(nodes = []) {
  const normalizedNodes = Array.isArray(nodes) ? [...nodes] : []
  return normalizedNodes
    .filter(node => node?.type !== 'sirket' && node?.type !== 'tuzel')
    .sort(compareNodeOrder)
    .map(node => ({
      id: String(node.id),
      name: node.name,
      type: node.type,
      canSell: node.can_sell === true,
    }))
}

export function buildBranchContextsFromCompanyTree(treeValue) {
  const tree = parseJsonValue(treeValue, [])
  const result = []

  function walk(nodes, ctx = {}) {
    for (const node of Array.isArray(nodes) ? nodes : [nodes]) {
      if (!node || typeof node !== 'object') continue

      const nextCtx = { ...ctx }
      if (node.type === 'sirket') nextCtx.company = { id: node.id, name: node.name }
      if (node.type === 'tuzel') nextCtx.legalEntity = { id: node.id, name: node.name }
      if (node.type === 'org') nextCtx.orgUnit = { id: node.id, name: node.name }

      if ((node.type === 'sube' || node.type === 'anadepo' || node.type === 'mutfak') && node.id && node.name) {
        result.push({
          branchId: String(node.id),
          branchName: String(node.name),
          companyId: nextCtx.company?.id ? String(nextCtx.company.id) : null,
          companyName: nextCtx.company?.name || null,
          legalEntityId: nextCtx.legalEntity?.id ? String(nextCtx.legalEntity.id) : null,
          legalEntityName: nextCtx.legalEntity?.name || null,
          orgUnitId: nextCtx.orgUnit?.id ? String(nextCtx.orgUnit.id) : null,
          orgUnitName: nextCtx.orgUnit?.name || null,
          workspaceScope: node.workspace_scope || (node.type === 'anadepo' ? 'anadepo' : (node.type === 'mutfak' ? 'merkezmutfak' : null)),
        })
      }

      walk(node.children || [], nextCtx)
    }
  }

  walk(tree, {})
  return result.sort((left, right) => String(left.branchName || '').localeCompare(String(right.branchName || ''), 'tr'))
}

export async function loadBranchContextsFromDb() {
  const cached = readBranchContextCache()
  if (cached.fresh && cached.contexts) {
    return cached.contexts
  }

  if (!branchContextLoadPromise) {
    branchContextLoadPromise = (async () => {
      const { data: companyNodes, error: companyNodesError } = await db
        .from('company_nodes')
        .select('id,type,name,parent_id,sort_order,can_sell')
        .order('sort_order')
        .order('name')

      if (!companyNodesError) {
        const contexts = buildBranchContextsFromCompanyNodes(companyNodes || [])
        if (contexts.length > 0) {
          writeBranchContextCache(contexts)
          return contexts
        }
      }

      const { data: settingsRow, error: settingsError } = await db
        .from('settings')
        .select('value')
        .eq('key', 'company_tree')
        .single()

      if (settingsError) {
        throw settingsError
      }

      const fallbackContexts = buildBranchContextsFromCompanyTree(settingsRow?.value)
      if (fallbackContexts.length > 0) {
        writeBranchContextCache(fallbackContexts)
        return fallbackContexts
      }

      if (cached.contexts?.length) return cached.contexts

      if (companyNodesError) throw companyNodesError
      throw new Error('Veritabaninda sube bulunamadi.')
    })().finally(() => {
      branchContextLoadPromise = null
    })
  }

  return branchContextLoadPromise
}
