function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function withTime(baseDate, rule) {
  const nextDate = new Date(baseDate.getTime())
  if (!rule?.time_of_day) return nextDate
  const [hours = '0', minutes = '0'] = String(rule.time_of_day).split(':')
  nextDate.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0)
  return nextDate
}

function parseWeekday(value) {
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(String(value || '').toLowerCase())
}

function nthWeekdayOfMonth(year, monthIndex, nth, weekday) {
  const target = new Date(year, monthIndex, 1)
  let count = 0
  while (target.getMonth() === monthIndex) {
    if (target.getDay() === weekday) {
      count += 1
      if (count === nth) return new Date(target.getTime())
    }
    target.setDate(target.getDate() + 1)
  }
  return null
}

export function calculateNextOccurrence(rule, fromDate = new Date()) {
  const baseDate = toDate(fromDate)
  if (!rule || !baseDate) return null

  const interval = Math.max(1, Number(rule.interval_value) || 1)
  const frequency = String(rule.frequency || '').toLowerCase()

  if (frequency === 'daily' || frequency === 'interval') {
    const nextDate = new Date(baseDate.getTime())
    nextDate.setDate(nextDate.getDate() + interval)
    return withTime(nextDate, rule)
  }

  if (frequency === 'weekly') {
    const weekdays = Array.isArray(rule.weekdays) ? rule.weekdays.map(parseWeekday).filter(value => value >= 0) : []
    if (!weekdays.length) {
      const nextDate = new Date(baseDate.getTime())
      nextDate.setDate(nextDate.getDate() + (7 * interval))
      return withTime(nextDate, rule)
    }
    const cursor = new Date(baseDate.getTime())
    for (let index = 1; index <= 21; index += 1) {
      cursor.setDate(cursor.getDate() + 1)
      if (weekdays.includes(cursor.getDay())) {
        return withTime(cursor, rule)
      }
    }
    return null
  }

  if (frequency === 'monthly') {
    const monthDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + interval, 1)
    if (Number(rule.month_day) === -1) {
      const nextDate = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0)
      return withTime(nextDate, rule)
    }
    if (rule.month_nth && rule.month_weekday) {
      const nextDate = nthWeekdayOfMonth(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        Number(rule.month_nth) || 1,
        parseWeekday(rule.month_weekday),
      )
      return nextDate ? withTime(nextDate, rule) : null
    }
    const day = Math.max(1, Number(rule.month_day) || baseDate.getDate())
    const nextDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), day)
    return withTime(nextDate, rule)
  }

  if (frequency === 'yearly') {
    const nextDate = new Date(baseDate.getFullYear() + interval, baseDate.getMonth(), baseDate.getDate())
    return withTime(nextDate, rule)
  }

  return null
}
