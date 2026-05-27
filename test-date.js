function localDateFromIso(isoDay) {
  const [year, month, day] = String(isoDay || '').split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
}

function formatIsoDay(input) {
  const date = input instanceof Date ? input : new Date(input)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(isoDay, days) {
  const date = localDateFromIso(isoDay)
  date.setDate(date.getDate() + days)
  return formatIsoDay(date)
}

function normalizeDemoSalesSettings(raw = {}) {
  // We use this to see what baseDate ends up as
  return {
    baseDate: String(raw.baseDate || '2024-01-01').slice(0, 10),
  }
}

console.log("localDateFromIso('2026-05-27'):", localDateFromIso('2026-05-27'))
console.log("formatIsoDay(new Date()):", formatIsoDay(new Date()))
console.log("addDays('2026-05-27', 1):", addDays('2026-05-27', 1))
console.log("normalizeDemoSalesSettings({ baseDate: '2026-05-27T12:00:00.000Z' }):", normalizeDemoSalesSettings({ baseDate: '2026-05-27T12:00:00.000Z' }))
