function normalizePositionId(value) {
  return value == null ? '' : String(value)
}

export function buildPositionChildrenMap(positions = []) {
  const map = new Map()
  positions.forEach(position => {
    const parentId = normalizePositionId(position.parentId)
    if (!map.has(parentId)) map.set(parentId, [])
    map.get(parentId).push(position)
  })
  return map
}

export function getDescendantIds(positionId, positions = []) {
  const normalizedId = normalizePositionId(positionId)
  const childrenMap = buildPositionChildrenMap(positions)
  const result = new Set()
  const queue = [...(childrenMap.get(normalizedId) || [])]

  while (queue.length) {
    const current = queue.shift()
    const currentId = normalizePositionId(current?.id)
    if (!currentId || result.has(currentId)) continue
    result.add(currentId)
    queue.push(...(childrenMap.get(currentId) || []))
  }

  return result
}

export function canReject(assignerPositionId, assigneePositionId, positions = []) {
  const assignerId = normalizePositionId(assignerPositionId)
  const assigneeId = normalizePositionId(assigneePositionId)

  if (!assignerId || !assigneeId) return true
  if (assignerId === assigneeId) return false

  return !getDescendantIds(assignerId, positions).has(assigneeId)
}

export function createsHierarchyCycle(positionId, parentId, positions = []) {
  const normalizedId = normalizePositionId(positionId)
  const normalizedParentId = normalizePositionId(parentId)
  if (!normalizedId || !normalizedParentId) return false
  if (normalizedId === normalizedParentId) return true
  return getDescendantIds(normalizedId, positions).has(normalizedParentId)
}

export function buildPositionTree(positions = []) {
  const childrenMap = buildPositionChildrenMap(positions)
  const sortedPositions = [...positions].sort((left, right) => (
    String(left?.name || '').localeCompare(String(right?.name || ''), 'tr')
  ))
  const sortedChildrenMap = new Map()

  childrenMap.forEach((items, key) => {
    sortedChildrenMap.set(key, [...items].sort((left, right) => (
      String(left?.name || '').localeCompare(String(right?.name || ''), 'tr')
    )))
  })

  function attach(position) {
    const positionId = normalizePositionId(position?.id)
    return {
      ...position,
      children: (sortedChildrenMap.get(positionId) || []).map(attach),
    }
  }

  return sortedPositions
    .filter(position => !normalizePositionId(position.parentId))
    .map(attach)
}
