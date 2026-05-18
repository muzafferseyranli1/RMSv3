export const FORECAST_SETTINGS_KEY = 'suitable_forecast_settings'

export const DEFAULT_FORECAST_SETTINGS = {
  lookbackWeeks: 6,
  forecastWeeks: 5,
  allowFutureManualAdjustments: true,
  currentDayManualCutoffHour: 8,
  orderForecastGenerationHour: 6,
  includeWasteRecords: true,
  includeProvisionRecords: true,
  ignorePastSpecialEventDays: true,
  excludeManualEventIncreaseFromHistory: true,
  useLastYearData: true,
  ignorePastDiscounts: true,
  forecastNonRecipeStockItems: true,
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, numeric))
}

export function normalizeForecastSettings(input = {}) {
  return {
    lookbackWeeks: clampNumber(input.lookbackWeeks, DEFAULT_FORECAST_SETTINGS.lookbackWeeks, 1, 12),
    forecastWeeks: clampNumber(input.forecastWeeks, DEFAULT_FORECAST_SETTINGS.forecastWeeks, 1, 8),
    allowFutureManualAdjustments: input.allowFutureManualAdjustments ?? DEFAULT_FORECAST_SETTINGS.allowFutureManualAdjustments,
    currentDayManualCutoffHour: clampNumber(input.currentDayManualCutoffHour, DEFAULT_FORECAST_SETTINGS.currentDayManualCutoffHour, 0, 23),
    orderForecastGenerationHour: clampNumber(input.orderForecastGenerationHour, DEFAULT_FORECAST_SETTINGS.orderForecastGenerationHour, 0, 23),
    includeWasteRecords: input.includeWasteRecords ?? DEFAULT_FORECAST_SETTINGS.includeWasteRecords,
    includeProvisionRecords: input.includeProvisionRecords ?? DEFAULT_FORECAST_SETTINGS.includeProvisionRecords,
    ignorePastSpecialEventDays: input.ignorePastSpecialEventDays ?? DEFAULT_FORECAST_SETTINGS.ignorePastSpecialEventDays,
    excludeManualEventIncreaseFromHistory: input.excludeManualEventIncreaseFromHistory ?? DEFAULT_FORECAST_SETTINGS.excludeManualEventIncreaseFromHistory,
    useLastYearData: input.useLastYearData ?? DEFAULT_FORECAST_SETTINGS.useLastYearData,
    ignorePastDiscounts: input.ignorePastDiscounts ?? DEFAULT_FORECAST_SETTINGS.ignorePastDiscounts,
    forecastNonRecipeStockItems: input.forecastNonRecipeStockItems ?? DEFAULT_FORECAST_SETTINGS.forecastNonRecipeStockItems,
  }
}

export function readForecastSettings() {
  if (typeof window === 'undefined') return DEFAULT_FORECAST_SETTINGS
  try {
    const raw = window.localStorage.getItem(FORECAST_SETTINGS_KEY)
    if (!raw) return DEFAULT_FORECAST_SETTINGS
    return normalizeForecastSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_FORECAST_SETTINGS
  }
}

export function writeForecastSettings(settings) {
  const normalized = normalizeForecastSettings(settings)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(FORECAST_SETTINGS_KEY, JSON.stringify(normalized))
  }
  return normalized
}
