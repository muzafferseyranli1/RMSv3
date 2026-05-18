export const DEMO_SCAN_RPC_WINDOW_DAYS = 1
export const DEMO_SCAN_FALLBACK_CONCURRENCY = 12
export const DEMO_SCAN_FALLBACK_PROGRESS_EVERY = 25

function localDateFromIso(isoDay) {
  const [year, month, day] = String(isoDay || '').split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
}

export function formatIsoDay(dateLike) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addIsoDays(isoDay, days) {
  const date = localDateFromIso(isoDay)
  date.setDate(date.getDate() + days)
  return formatIsoDay(date)
}

export function listIsoDays(startIsoDay, endIsoDay) {
  if (!startIsoDay || !endIsoDay || startIsoDay > endIsoDay) return []

  const result = []
  let cursor = startIsoDay

  while (cursor <= endIsoDay) {
    result.push(cursor)
    cursor = addIsoDays(cursor, 1)
  }

  return result
}

export function buildIsoDayChunks(startIsoDay, endIsoDay, chunkDays = DEMO_SCAN_RPC_WINDOW_DAYS) {
  if (!startIsoDay || !endIsoDay || startIsoDay > endIsoDay) return []

  const ranges = []
  const windowDays = Math.max(1, Number(chunkDays) || 1)
  let cursor = startIsoDay

  while (cursor <= endIsoDay) {
    const nextEnd = addIsoDays(cursor, windowDays - 1)
    const chunkEnd = nextEnd > endIsoDay ? endIsoDay : nextEnd
    ranges.push({ startIsoDay: cursor, endIsoDay: chunkEnd })
    cursor = addIsoDays(chunkEnd, 1)
  }

  return ranges
}

export async function fetchRowsByIsoDayChunks({
  startIsoDay,
  endIsoDay,
  chunkDays = DEMO_SCAN_RPC_WINDOW_DAYS,
  fetchChunk,
  onProgress,
}) {
  const ranges = buildIsoDayChunks(startIsoDay, endIsoDay, chunkDays)
  const rows = []

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]
    const chunkRows = await fetchChunk(range, index, ranges.length)
    if (Array.isArray(chunkRows) && chunkRows.length) rows.push(...chunkRows)
    if (typeof onProgress === 'function') {
      onProgress({
        index: index + 1,
        total: ranges.length,
        startIsoDay: range.startIsoDay,
        endIsoDay: range.endIsoDay,
        rowCount: Array.isArray(chunkRows) ? chunkRows.length : 0,
      })
    }
  }

  return rows
}

export function buildBranchDayTasks(branches, startIsoDay, endIsoDay) {
  const isoDays = listIsoDays(startIsoDay, endIsoDay)
  const tasks = []

  for (const isoDay of isoDays) {
    for (const branch of branches || []) {
      tasks.push({ branch, isoDay })
    }
  }

  return tasks
}

export async function runBranchDayTasks({
  branches = [],
  startIsoDay,
  endIsoDay,
  tasks,
  worker,
  concurrency = DEMO_SCAN_FALLBACK_CONCURRENCY,
  progressEvery = DEMO_SCAN_FALLBACK_PROGRESS_EVERY,
  onProgress,
}) {
  const workItems = Array.isArray(tasks)
    ? tasks
    : buildBranchDayTasks(branches, startIsoDay, endIsoDay)

  if (!workItems.length) return []

  const results = []
  const total = workItems.length
  const poolSize = Math.max(1, Math.min(Number(concurrency) || 1, total))
  let nextIndex = 0
  let processed = 0

  async function runWorker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1
      if (currentIndex >= total) return

      const task = workItems[currentIndex]
      const result = await worker(task, currentIndex, total)
      if (result !== undefined) results.push(result)

      processed += 1
      const shouldReport = (
        processed === 1 ||
        processed === total ||
        processed % Math.max(1, Number(progressEvery) || 1) === 0
      )

      if (shouldReport && typeof onProgress === 'function') {
        onProgress({
          processed,
          total,
          task,
          index: currentIndex + 1,
        })
      }
    }
  }

  await Promise.all(Array.from({ length: poolSize }, () => runWorker()))
  return results
}
