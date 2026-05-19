import {
  ensureCallCenterChannelPrice,
  isCallCenterChannel,
} from '../src/lib/saleItemChannelPricing.js'

const API_URL = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'
const BATCH_SIZE = 10

const args = new Set(process.argv.slice(2))
const auditOnly = args.has('--audit-only')
const verifyOnly = args.has('--verify-only')

function log(message, payload) {
  if (payload === undefined) {
    console.log(`[call-center-channel-prices] ${message}`)
    return
  }
  console.log(`[call-center-channel-prices] ${message} ${JSON.stringify(payload)}`)
}

async function apiQuery(body) {
  const response = await fetch(`${API_URL}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`API HTTP ${response.status}: ${JSON.stringify(payload)}`)
  if (payload?.error) throw new Error(payload.error.message || JSON.stringify(payload.error))
  return payload.data || []
}

function isFilter(col, val) {
  return { type: 'is', col, val }
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

async function update(table, data, filters = []) {
  return apiQuery({ table, operation: 'update', data, filters })
}

function getChannelEntry(channelPrices, channelId) {
  const prices = Array.isArray(channelPrices) ? channelPrices : []
  return prices.find(entry => String(entry?.channel_id || '') === String(channelId)) || null
}

function buildPlan(items, channels, callCenterChannel) {
  return items.map(item => {
    const before = Array.isArray(item.channel_prices) ? item.channel_prices : []
    const after = ensureCallCenterChannelPrice(before, channels, {
      standardPrice: item.standard_price,
      salePrice: item.sale_price,
      taxId: item.tax_id,
    })
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      beforeEntry: getChannelEntry(before, callCenterChannel.id),
      afterEntry: getChannelEntry(after, callCenterChannel.id),
      channel_prices: after,
      changed: JSON.stringify(before) !== JSON.stringify(after),
    }
  })
}

function summarizePlan(plan) {
  return {
    sale_items: plan.length,
    rows_to_update: plan.filter(item => item.changed).length,
    missing_before: plan.filter(item => !item.beforeEntry).length,
    inactive_or_empty_before: plan.filter(item => !item.beforeEntry || item.beforeEntry.active !== true || Number(item.beforeEntry.price) <= 0).length,
    ready_after: plan.filter(item => item.afterEntry?.active === true && Number(item.afterEntry?.price) > 0 && item.afterEntry?.tax_id).length,
    sample: plan.slice(0, 5).map(item => ({
      name: item.name,
      sku: item.sku,
      call_center_price: item.afterEntry?.price,
    })),
  }
}

async function loadScope() {
  const [channels, items] = await Promise.all([
    select('sales_channels', [isFilter('deleted_at', null), order('sort_order', true), order('name', true)], 'id,name,sort_order,active,deleted_at'),
    select('sale_items', [isFilter('deleted_at', null), order('name', true)], 'id,name,sku,standard_price,sale_price,tax_id,channel_prices,deleted_at'),
  ])
  const activeChannels = channels.filter(channel => channel.active !== false && !channel.deleted_at)
  const callCenterChannel = activeChannels.find(isCallCenterChannel)
  if (!callCenterChannel) throw new Error('Aktif Call Center sales_channels kaydi bulunamadi.')
  return { activeChannels, callCenterChannel, items }
}

async function verifyPlan(plan, callCenterChannel) {
  const rows = await select('sale_items', [inFilter('id', plan.map(item => item.id))], 'id,name,sku,channel_prices')
  if (rows.length !== plan.length) {
    throw new Error(`Verify failed: expected ${plan.length}, found ${rows.length}`)
  }

  const invalid = rows.filter(row => {
    const entry = getChannelEntry(row.channel_prices, callCenterChannel.id)
    return !(entry?.active === true && Number(entry?.price) > 0 && entry?.tax_id)
  })
  if (invalid.length) {
    throw new Error(`Verify failed: ${invalid.length} sale_items missing active Call Center price`)
  }
  return {
    sale_items: rows.length,
    call_center_ready: rows.length - invalid.length,
  }
}

async function main() {
  const { activeChannels, callCenterChannel, items } = await loadScope()
  const plan = buildPlan(items, activeChannels, callCenterChannel)
  const summary = summarizePlan(plan)

  log('scope', {
    sale_items: items.length,
    active_channels: activeChannels.map(channel => channel.name),
    call_center_channel_id: callCenterChannel.id,
    batch_size: BATCH_SIZE,
  })
  log(auditOnly ? 'audit-plan' : verifyOnly ? 'verify-plan' : 'write-plan', summary)

  if (auditOnly) return

  if (verifyOnly) {
    log('verify', await verifyPlan(plan, callCenterChannel))
    return
  }

  const updates = plan.filter(item => item.changed)
  for (let index = 0; index < updates.length; index += BATCH_SIZE) {
    const batch = updates.slice(index, index + BATCH_SIZE)
    for (const item of batch) {
      await update('sale_items', { channel_prices: item.channel_prices }, [{ type: 'eq', col: 'id', val: item.id }])
    }

    const verifyRows = await select('sale_items', [inFilter('id', batch.map(item => item.id))], 'id,name,channel_prices')
    const invalid = verifyRows.filter(row => {
      const entry = getChannelEntry(row.channel_prices, callCenterChannel.id)
      return !(entry?.active === true && Number(entry?.price) > 0 && entry?.tax_id)
    })
    if (verifyRows.length !== batch.length || invalid.length) {
      throw new Error(`Batch verify failed at ${index}: read=${verifyRows.length}, invalid=${invalid.length}`)
    }
    log('batch', { batchStart: index, attempted: batch.length, succeeded: verifyRows.length })
  }

  log('done', await verifyPlan(plan, callCenterChannel))
}

main().catch(error => {
  console.error(`[call-center-channel-prices] ERROR ${error.message}`)
  process.exit(1)
})
