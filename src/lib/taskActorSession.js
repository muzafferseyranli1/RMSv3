const TASK_ACTOR_SESSION_KEY = 'rms_task_actor_session'

export function readTaskActorSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(TASK_ACTOR_SESSION_KEY) || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function writeTaskActorSession(session) {
  try {
    if (session) sessionStorage.setItem(TASK_ACTOR_SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(TASK_ACTOR_SESSION_KEY)
  } catch {
    // no-op
  }
}

export function clearTaskActorSession() {
  writeTaskActorSession(null)
}

export function buildTaskActorSession(employee, branchId) {
  if (!employee?.id) return null
  return {
    id: employee.id,
    branchId: branchId || employee.defaultBranchId || '',
    firstName: employee.firstName || '',
    lastName: employee.lastName || '',
    authorityLevel: employee.authorityLevel || '',
    positionId: employee.positionId || '',
    defaultBranchId: employee.defaultBranchId || '',
    workingBranchIds: Array.isArray(employee.workingBranchIds) ? employee.workingBranchIds : [],
    managedBranchIds: Array.isArray(employee.managedBranchIds) ? employee.managedBranchIds : [],
  }
}
