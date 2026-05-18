// _probe-recipes.mjs — recipe_rows durumu
const API = 'https://rms-api-production-219d.up.railway.app'

async function apiQuery(body) {
  const res = await fetch(`${API}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return json.data || json.rows || json || []
}

const items = await apiQuery({ table: 'sale_items', operation: 'select', select: 'id,name,recipe_rows' })

let dolu = 0, bos = 0
for (const item of items) {
  const rr = Array.isArray(item.recipe_rows) ? item.recipe_rows : []
  if (rr.length > 0) {
    dolu++
    console.log(`✓ DOLU  | ${item.name} → ${rr.length} satır`)
  } else {
    bos++
    console.log(`✗ BOŞ   | ${item.name}`)
  }
}

console.log(`\nToplam: ${items.length} | Dolu: ${dolu} | Boş: ${bos}`)
