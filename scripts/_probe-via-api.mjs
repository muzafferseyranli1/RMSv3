// _probe-via-api.mjs  — Railway API üzerinden canli okuma
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'

async function query(table, options = {}) {
  const body = { table, operation: 'select', ...options }
  const res = await fetch(`${API}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`API error ${res.status}: ${JSON.stringify(json)}`)
  return json.data || json.rows || []
}

const channels = await query('sales_channels', { filters: { active: true } })
console.log('CHANNELS:', channels.length)
channels.forEach(c => console.log(' ', c.id, c.name))

const taxes = await query('taxes')
console.log('TAXES:', taxes.length)
taxes.forEach(t => console.log(' ', t.id, t.name, t.rate))

// sale_items — tum 60 kayit, sadece id+name+sale_price
const items = await query('sale_items', {
  select: 'id,name,sku,sale_price,sale_cat_l1,sale_cat_l2',
  filters: {},
})
console.log('SALE_ITEMS:', items.length)
items.forEach(i => console.log(' ', i.id, i.name, '|', i.sale_price))
