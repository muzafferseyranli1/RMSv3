const CALL_CENTER_KEYS = new Set([
  'call center',
  'callcenter',
  'cagri merkezi',
  'cagri_merkezi',
])

const PRICE_REFERENCE_KEYS = [
  'online yemek',
  'suitable yemek',
  'qr menu',
  'hizli satis',
  'masa',
  'gel al',
  'kiosk',
]

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

function asArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function roundTo5(value) {
  const number = toNumber(value)
  if (number <= 0) return ''
  return Math.max(5, Math.round(number / 5) * 5)
}

export function isCallCenterChannel(channel) {
  return CALL_CENTER_KEYS.has(normalizeText(channel?.name || channel?.label || channel?.id))
}

function getChannelKey(channel) {
  return normalizeText(channel?.name || channel?.label || '')
}

function findReferenceEntry(prices, channels) {
  const byChannelId = new Map(prices.map(entry => [String(entry?.channel_id || ''), entry]))
  for (const key of PRICE_REFERENCE_KEYS) {
    const channel = channels.find(item => getChannelKey(item) === key)
    const entry = channel ? byChannelId.get(String(channel.id)) : null
    if (toNumber(entry?.price) > 0) return entry
  }
  return prices.find(entry => entry?.active !== false && toNumber(entry?.price) > 0)
    || prices.find(entry => toNumber(entry?.price) > 0)
    || null
}

function resolveCompatiblePrice(prices, channels, context = {}) {
  const referenceEntry = findReferenceEntry(prices, channels)
  if (referenceEntry) return roundTo5(referenceEntry.price)

  const activePrices = prices
    .filter(entry => entry?.active !== false)
    .map(entry => toNumber(entry?.price))
    .filter(price => price > 0)
  if (activePrices.length) {
    return roundTo5(activePrices.reduce((sum, price) => sum + price, 0) / activePrices.length)
  }

  return roundTo5(context.standardPrice || context.salePrice || context.basePrice)
}

function resolveTaxId(existingEntry, prices, channels, context = {}) {
  if (existingEntry?.tax_id) return existingEntry.tax_id
  const referenceEntry = findReferenceEntry(prices, channels)
  return referenceEntry?.tax_id || context.taxId || context.defaultTaxId || ''
}

export function ensureCallCenterChannelPrice(channelPrices, channels, context = {}) {
  const prices = asArray(channelPrices).map(entry => ({ ...entry }))
  const channelList = Array.isArray(channels) ? channels : []
  const callCenterChannel = channelList.find(isCallCenterChannel)
  if (!callCenterChannel?.id) return prices

  const channelId = String(callCenterChannel.id)
  const existingIndex = prices.findIndex(entry => String(entry?.channel_id || '') === channelId)
  const existingEntry = existingIndex >= 0 ? prices[existingIndex] : {}
  const compatiblePrice = toNumber(existingEntry.price) > 0
    ? roundTo5(existingEntry.price)
    : resolveCompatiblePrice(prices, channelList, context)

  const nextEntry = {
    ...existingEntry,
    channel_id: channelId,
    active: true,
    price: compatiblePrice,
    tax_id: resolveTaxId(existingEntry, prices, channelList, context),
  }

  if (existingIndex >= 0) {
    return prices.map((entry, index) => (index === existingIndex ? nextEntry : entry))
  }
  return [...prices, nextEntry]
}
