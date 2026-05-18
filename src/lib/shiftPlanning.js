export const DEFAULT_SHIFT_DAY_START = '07:30'
export const DEFAULT_SHIFT_DAY_END = '19:30'
export const SHIFT_PLANNER_VIEW_KEY = 'suitable-rms:shift-planner-view-v1'
export const OPERATING_HOURS_TEMPLATE_WEEK_START = '2000-01-03'
export const OPERATING_HOURS_TEMPLATE_KEYS = Array.from({ length: 7 }, (_, index) => (
  getOperatingHoursTemplateDate(index)
))

export function toDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00`)
}

export function startOfWeek(date) {
  const nextDate = new Date(date)
  const dayIndex = nextDate.getDay()
  const diff = dayIndex === 0 ? -6 : 1 - dayIndex
  nextDate.setDate(nextDate.getDate() + diff)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

export function addDays(date, amount) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

export function getWeekdayTemplateIndex(value) {
  const date = value instanceof Date ? value : parseDateKey(value)
  const dayIndex = date.getDay()
  return dayIndex === 0 ? 6 : dayIndex - 1
}

export function getOperatingHoursTemplateDate(weekdayIndex) {
  const baseDate = parseDateKey(OPERATING_HOURS_TEMPLATE_WEEK_START)
  return toDateKey(addDays(baseDate, weekdayIndex))
}

export function timeToMinutes(value) {
  const [hoursText, minutesText] = String(value || '').split(':')
  const hours = Number(hoursText)
  const minutes = Number(minutesText)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return (hours * 60) + minutes
}

export function minutesToTime(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return ''
  let normalizedMinutes = Math.round(totalMinutes) % 1440
  if (normalizedMinutes < 0) normalizedMinutes += 1440
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function normalizeTimeRange(startTime, endTime) {
  const start = timeToMinutes(startTime)
  const end = timeToMinutes(endTime)
  if (start == null || end == null) return null
  const normalizedEnd = end <= start ? end + 1440 : end
  return {
    start,
    end: normalizedEnd,
    duration: normalizedEnd - start,
  }
}

export function buildWindowRange(startTime, endTime) {
  return normalizeTimeRange(startTime || DEFAULT_SHIFT_DAY_START, endTime || DEFAULT_SHIFT_DAY_END)
    || normalizeTimeRange(DEFAULT_SHIFT_DAY_START, DEFAULT_SHIFT_DAY_END)
}

export function buildHourSlots(startTime, endTime) {
  const windowRange = buildWindowRange(startTime, endTime)
  const slots = []

  for (let cursor = windowRange.start; cursor < windowRange.end; cursor += 60) {
    const slotEnd = Math.min(cursor + 60, windowRange.end)
    slots.push({
      key: `${cursor}-${slotEnd}`,
      start: cursor,
      end: slotEnd,
      startLabel: minutesToTime(cursor),
      midpointLabel: minutesToTime(cursor + ((slotEnd - cursor) / 2)),
    })
  }

  const boundaries = []
  for (let cursor = windowRange.start; cursor <= windowRange.end; cursor += 60) {
    boundaries.push({
      key: `boundary-${cursor}`,
      time: cursor,
      label: minutesToTime(cursor),
    })
  }

  return { windowRange, slots, boundaries }
}

export function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart))
}

export function normalizeRangeToWindow(startTime, endTime, windowStart) {
  const range = normalizeTimeRange(startTime, endTime)
  if (!range) return null

  let nextStart = range.start
  let nextEnd = range.end

  while (nextEnd <= windowStart) {
    nextStart += 1440
    nextEnd += 1440
  }

  while (nextStart - windowStart > 1440) {
    nextStart -= 1440
    nextEnd -= 1440
  }

  return {
    start: nextStart,
    end: nextEnd,
    duration: nextEnd - nextStart,
  }
}

export function resolveBreakTimes({ shiftStartTime, shiftEndTime, breakMinutes, breakStartTime, autoPlaceWhenMissing = true }) {
  const safeBreakMinutes = Math.max(0, Number(breakMinutes) || 0)
  if (!safeBreakMinutes) {
    return { breakStartTime: '', breakEndTime: '', breakMinutes: 0 }
  }

  const shiftRange = normalizeTimeRange(shiftStartTime, shiftEndTime)
  if (!shiftRange) {
    return { error: 'Vardiya saatleri gecersiz.' }
  }

  if (safeBreakMinutes >= shiftRange.duration) {
    return { error: 'Mola suresi vardiya suresinden kisa olmali.' }
  }

  let breakStart = timeToMinutes(breakStartTime)
  if (breakStart == null) {
    if (!autoPlaceWhenMissing) {
      return { breakStartTime: '', breakEndTime: '', breakMinutes: safeBreakMinutes }
    }
    breakStart = shiftRange.start + Math.floor((shiftRange.duration - safeBreakMinutes) / 2)
  } else {
    while (breakStart < shiftRange.start) breakStart += 1440
  }

  const breakEnd = breakStart + safeBreakMinutes
  if (breakEnd > shiftRange.end) {
    return { error: 'Mola vardiya araligini asiyor.' }
  }

  return {
    breakStartTime: minutesToTime(breakStart),
    breakEndTime: minutesToTime(breakEnd),
    breakMinutes: safeBreakMinutes,
  }
}

export function computeEntryNetMinutes(entry) {
  if (entry?.shift_kind !== 'working') return 0
  const range = normalizeTimeRange(entry.shift_start_time, entry.shift_end_time)
  if (!range) return 0
  return Math.max(range.duration - (Number(entry.break_minutes) || 0), 0)
}

export function getEntryPresenceRange(entry, windowStart) {
  if (entry?.shift_kind !== 'working') return null
  return normalizeRangeToWindow(entry.shift_start_time, entry.shift_end_time, windowStart)
}

export function getEntryBreakRange(entry, windowStart) {
  if (entry?.shift_kind !== 'working' || !(Number(entry.break_minutes) || 0) || !String(entry.break_start_time || '').trim()) return null
  const resolved = resolveBreakTimes({
    shiftStartTime: entry.shift_start_time,
    shiftEndTime: entry.shift_end_time,
    breakMinutes: entry.break_minutes,
    breakStartTime: entry.break_start_time,
    autoPlaceWhenMissing: false,
  })
  if (resolved.error || !resolved.breakStartTime || !resolved.breakEndTime) return null
  return normalizeRangeToWindow(resolved.breakStartTime, resolved.breakEndTime, windowStart)
}

export function calculateSlotCoverage(entries, slot, windowStart) {
  return entries.reduce((total, entry) => {
    const shiftRange = getEntryPresenceRange(entry, windowStart)
    if (!shiftRange) return total

    const shiftMinutes = overlapMinutes(shiftRange.start, shiftRange.end, slot.start, slot.end)
    if (!shiftMinutes) return total

    const breakRange = getEntryBreakRange(entry, windowStart)
    const breakMinutes = breakRange
      ? overlapMinutes(breakRange.start, breakRange.end, slot.start, slot.end)
      : 0

    return total + Math.max(shiftMinutes - breakMinutes, 0)
  }, 0) / 60
}

export function buildEntryBarLayout(entry, windowRange) {
  if (entry?.shift_kind !== 'working') {
    return {
      visible: true,
      leftPercent: 0,
      widthPercent: 100,
      breakLeftPercent: 0,
      breakWidthPercent: 0,
    }
  }

  const shiftRange = getEntryPresenceRange(entry, windowRange.start)
  if (!shiftRange) return { visible: false }

  const visibleStart = Math.max(shiftRange.start, windowRange.start)
  const visibleEnd = Math.min(shiftRange.end, windowRange.end)
  if (visibleEnd <= visibleStart) return { visible: false }
  const visibleDuration = visibleEnd - visibleStart

  const breakRange = getEntryBreakRange(entry, windowRange.start)
  const visibleBreakStart = breakRange ? Math.max(breakRange.start, visibleStart) : null
  const visibleBreakEnd = breakRange ? Math.min(breakRange.end, visibleEnd) : null

  return {
    visible: true,
    leftPercent: ((visibleStart - windowRange.start) / windowRange.duration) * 100,
    widthPercent: (visibleDuration / windowRange.duration) * 100,
    breakLeftPercent: visibleBreakStart != null
      ? ((visibleBreakStart - visibleStart) / visibleDuration) * 100
      : 0,
    breakWidthPercent: visibleBreakStart != null && visibleBreakEnd > visibleBreakStart
      ? ((visibleBreakEnd - visibleBreakStart) / visibleDuration) * 100
      : 0,
  }
}

export function formatHourValue(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return rounded.toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

export function getShiftKindTone(kind) {
  const tones = {
    working: { label: '\u00c7al\u0131\u015fma', color: '#9a3412', background: '#fed7aa', bar: '#ea7a2c' },
    off: { label: '\u0130zin', color: '#6b21a8', background: '#f3e8ff', bar: '#9333ea' },
    report: { label: 'Rapor', color: '#0f172a', background: '#e2e8f0', bar: '#111827' },
    other: { label: 'Di\u011fer', color: '#166534', background: '#dcfce7', bar: '#15803d' },
  }
  return tones[kind] || tones.working
}

export function getPersonnelDisplayName(personnel) {
  return [
    personnel?.firstName,
    personnel?.middleName,
    personnel?.lastName,
  ].filter(Boolean).join(' ').trim()
}
