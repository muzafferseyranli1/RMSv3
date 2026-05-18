// _probe2.mjs — daha sade API sorgusu
const API = 'https://rms-api-production-219d.up.railway.app'

async function query(table, select = '*', filters = {}) {
  const body = { table, operation: 'select' }
  if (select !== '*') body.select = select
  if (Object.keys(filters).length) body.filters = filters
  const res = await fetch(`${API}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return json.data || json.rows || json || []
}

console.log('--- RAW sales_channels ---')
const chRaw = await query('sales_channels')
console.log(JSON.stringify(chRaw, null, 2))

console.log('\n--- RAW sale_items (first 5) ---')
const siRaw = await query('sale_items', 'id,name,sku,sale_price')
console.log('total:', siRaw.length)
siRaw.slice(0, 5).forEach(r => console.log(' ', r.name, r.sale_price))
