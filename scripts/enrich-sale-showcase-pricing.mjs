const API_URL = (process.env.API_URL || process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app').replace(/\/$/, '')

const args = new Set(process.argv.slice(2))
const auditOnly = args.has('--audit-only')
const verifyOnly = args.has('--verify-only')

const PRICE_FACTORS = [-0.05, -0.035, -0.02, 0, 0.02, 0.035, 0.05]
const SIZE_RULES = [
  {
    test: /burger|wrap|sandvi/i,
    portions: [
      { key: 'orta', name: 'Orta', ratio: 0.14 },
      { key: 'buyuk', name: 'B\u00fcy\u00fck', ratio: 0.26 },
    ],
  },
  {
    test: /pizza/i,
    portions: [
      { key: 'orta', name: 'Orta', ratio: 0.18 },
      { key: 'buyuk', name: 'B\u00fcy\u00fck', ratio: 0.32 },
    ],
  },
  {
    test: /patates|nugget|kanat|halka|stick/i,
    portions: [
      { key: 'orta', name: 'Orta', ratio: 0.16 },
      { key: 'buyuk', name: 'B\u00fcy\u00fck', ratio: 0.30 },
    ],
  },
  {
    test: /milkshake|limonata|suyu|latte|s\u0131cak|sicak/i,
    portions: [
      { key: 'kucuk', name: 'K\u00fc\u00e7\u00fck', ratio: -0.14 },
      { key: 'buyuk', name: 'B\u00fcy\u00fck', ratio: 0.18 },
    ],
  },
]

function log(message, payload) {
  if (payload === undefined) {
    console.log(`[sale-showcase-pricing] ${message}`)
    return
  }
  console.log(`[sale-showcase-pricing] ${message} ${JSON.stringify(payload)}`)
}

function stableHash(text) {
  let hash = 2166136261
  for (const char of String(text || '')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0)
}

function stableId(scope, itemId, key) {
  return `${scope}-${String(itemId).slice(0, 8)}-${key}`.replace(/[^a-zA-Z0-9_-]/g, '-')
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

function toNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function roundPrice(value) {
  return Math.max(1, Math.round(Number(value) || 0))
}

function resolveBasePrice(item) {
  return roundPrice(
    toNumber(item.standard_price)
    || toNumber(item.sale_price)
    || firstChannelPrice(item)
    || 100,
  )
}

function firstChannelPrice(item) {
  const prices = asArray(item.channel_prices)
  const match = prices.find((entry) => toNumber(entry?.price) > 0)
  return toNumber(match?.price)
}

function buildChannelPrices(item, channels, fallbackTaxId) {
  const basePrice = resolveBasePrice(item)
  const existing = asArray(item.channel_prices)
  const existingByChannel = new Map(existing.map((entry) => [String(entry?.channel_id || ''), entry]))
  const offset = stableHash(item.id) % PRICE_FACTORS.length

  return channels.map((channel, index) => {
    const channelId = String(channel.id)
    const factor = PRICE_FACTORS[(index + offset) % PRICE_FACTORS.length]
    const price = roundPrice(basePrice * (1 + factor))
    const previous = existingByChannel.get(channelId) || {}
    return {
      ...previous,
      channel_id: channelId,
      active: true,
      price,
      tax_id: previous.tax_id || item.tax_id || fallbackTaxId || '',
    }
  })
}

function portionOffset(basePrice, ratio) {
  const raw = basePrice * ratio
  if (ratio < 0) return -Math.max(1, Math.round(Math.abs(raw)))
  return Math.max(1, Math.round(raw))
}

function buildPortions(item) {
  const existing = asArray(item.portions)
  if (existing.length) return existing

  const name = `${item.name || ''} ${item.sku || ''}`
  const rule = SIZE_RULES.find((candidate) => candidate.test.test(name))
  if (!rule) return []

  const basePrice = resolveBasePrice(item)
  return rule.portions.map((portion) => ({
    id: stableId('portion', item.id, portion.key),
    name: portion.name,
    price_offset: portionOffset(basePrice, portion.ratio),
  }))
}

async function apiQuery(body) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`API HTTP ${response.status}`)
  const payload = await response.json()
  if (payload?.error) throw new Error(payload.error.message || 'API query failed')
  return payload.data
}

function eq(col, val) {
  return { type: 'eq', col, val }
}

function inFilter(col, val) {
  return { type: 'in', col, val }
}

function order(col, ascending = true) {
  return { type: 'order', col, ascending }
}

async function select(table, filters = [], columns = '*') {
  return apiQuery({ table, operation: 'select', select: columns, filters })
}

async function upsert(table, data, onConflict = 'id') {
  return apiQuery({ table, operation: 'upsert', data, options: { onConflict } })
}

async function update(table, data, filters = []) {
  return apiQuery({ table, operation: 'update', data, filters })
}

async function loadScope() {
  const [items, channels, taxes] = await Promise.all([
    select(
      'sale_items',
      [eq('deleted_at', null), order('name', true)],
      'id,name,sku,standard_price,sale_price,tax_id,channel_prices,portions,option_groups,recipe_rows,deleted_at',
    ),
    select('sales_channels', [eq('active', true), eq('deleted_at', null), order('sort_order', true), order('name', true)], 'id,name,sort_order,active,deleted_at'),
    select('taxes', [eq('deleted_at', null), order('rate', true), order('name', true)], 'id,name,rate,deleted_at'),
  ])
  const fallbackTax = taxes.find((tax) => Number(tax.rate) === 10)
    || taxes.find((tax) => Number(tax.rate) === 20)
    || taxes[0]
  return { items, channels, taxes, fallbackTaxId: fallbackTax?.id || '' }
}

function buildUpdates({ items, channels, fallbackTaxId }) {
  return items.map((item) => ({
    id: item.id,
    channel_prices: buildChannelPrices(item, channels, fallbackTaxId),
    portions: buildPortions(item),
  }))
}

function summarize(items, channels) {
  const targetChannelCount = channels.length
  const allChannelsActive = items.filter((item) => {
    const prices = asArray(item.channel_prices)
    return channels.every((channel) => prices.some((entry) => (
      String(entry?.channel_id) === String(channel.id)
      && entry?.active === true
      && toNumber(entry?.price) > 0
    )))
  }).length
  const sizeOptionCount = items.filter((item) => asArray(item.portions).length > 0).length
  const nonRoundedPriceCount = items.filter((item) => (
    asArray(item.channel_prices).some((entry) => !Number.isInteger(Number(entry?.price)))
  )).length
  return {
    sale_items: items.length,
    active_channels: targetChannelCount,
    all_channels_active: allChannelsActive,
    with_size_options: sizeOptionCount,
    non_rounded_prices: nonRoundedPriceCount,
  }
}

async function verify(updates, channels) {
  const ids = updates.map((item) => item.id)
  const rows = await select('sale_items', [inFilter('id', ids)], 'id,name,sku,channel_prices,portions')
  const summary = summarize(rows, channels)
  if (summary.sale_items !== updates.length) {
    throw new Error(`Verify failed: expected ${updates.length} sale_items, found ${summary.sale_items}`)
  }
  if (summary.all_channels_active !== updates.length) {
    throw new Error(`Verify failed: ${summary.all_channels_active}/${updates.length} items have all channels active`)
  }
  if (summary.with_size_options < 20) {
    throw new Error(`Verify failed: only ${summary.with_size_options} items have size options`)
  }
  if (summary.non_rounded_prices !== 0) {
    throw new Error(`Verify failed: ${summary.non_rounded_prices} items have non-rounded channel prices`)
  }
  return summary
}

async function main() {
  const scope = await loadScope()
  log('scope', {
    sale_items: scope.items.length,
    active_channels: scope.channels.length,
    fallback_tax_id: scope.fallbackTaxId,
  })

  if (scope.items.length !== 60) {
    throw new Error(`Expected 60 active sale_items, found ${scope.items.length}`)
  }
  if (!scope.channels.length) {
    throw new Error('No active sales channels found')
  }

  if (verifyOnly) {
    const summary = await verify(scope.items.map((item) => ({ id: item.id })), scope.channels)
    log('verify', summary)
    return
  }

  const updates = buildUpdates(scope)
  const plannedSizeOptions = updates.filter((item) => item.portions.length > 0).length
  log(auditOnly ? 'audit-plan' : 'write-plan', {
    update_rows: updates.length,
    batch_size: 10,
    planned_size_option_items: plannedSizeOptions,
    price_factor_min: -0.05,
    price_factor_max: 0.05,
  })

  if (auditOnly) return

  for (let index = 0; index < updates.length; index += 10) {
    const batch = updates.slice(index, index + 10)
    for (const item of batch) {
      await update(
        'sale_items',
        {
          channel_prices: item.channel_prices,
          portions: item.portions,
        },
        [eq('id', item.id)],
      )
    }
    const verifyRows = await select('sale_items', [inFilter('id', batch.map((item) => item.id))], 'id,channel_prices,portions')
    if (verifyRows.length !== batch.length) {
      throw new Error(`Batch verify failed at ${index}: expected ${batch.length}, found ${verifyRows.length}`)
    }
    log('batch', { batchStart: index, attempted: batch.length, succeeded: verifyRows.length })
  }

  const summary = await verify(updates, scope.channels)
  log('done', summary)
}

main().catch((error) => {
  console.error(`[sale-showcase-pricing] ERROR ${error.message}`)
  process.exit(1)
})
