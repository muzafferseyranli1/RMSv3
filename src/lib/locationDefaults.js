const ALL_BRANCH_TEMPLATE_KEYS = new Set([
  'tum subeler',
  'all branches',
])

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0131/g, 'i')
    .replace(/\u015f/g, 's')
    .replace(/\u011f/g, 'g')
    .replace(/\u00fc/g, 'u')
    .replace(/\u00f6/g, 'o')
    .replace(/\u00e7/g, 'c')
    .replace(/\s+/g, ' ')
}

export function findAllBranchesTemplate(branchTemplates = []) {
  const templates = Array.isArray(branchTemplates) ? branchTemplates : []
  return templates.find(template => ALL_BRANCH_TEMPLATE_KEYS.has(normalizeText(template?.name))) || null
}

export function buildLocationSelectionFromTemplate(template) {
  if (!template?.id) return []
  return [{
    type: 'template',
    id: String(template.id),
    name: template.name,
    branchIds: Array.isArray(template.branch_ids) ? template.branch_ids.map(String) : [],
  }]
}

export function getAllBranchesLocationSelection(branchTemplates = []) {
  return buildLocationSelectionFromTemplate(findAllBranchesTemplate(branchTemplates))
}

export function ensureDefaultLocationSelection(value, branchTemplates = []) {
  const selected = Array.isArray(value) ? value : []
  if (selected.length) return selected
  return getAllBranchesLocationSelection(branchTemplates)
}

export function withDefaultLocationSelection(form, branchTemplates = []) {
  return {
    ...form,
    location: ensureDefaultLocationSelection(form?.location, branchTemplates),
  }
}
