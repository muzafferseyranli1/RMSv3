// _probe-images.mjs — Mevcut görsellerin DB'deki formatını kontrol et
const API = 'https://rms-api-production-219d.up.railway.app'

async function q(body) {
  const res = await fetch(`${API}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()).data || []
}

// Hamburger - dolu olan tek kayıt
const items = await q({ table: 'sale_items', operation: 'select', select: 'id,name,pos_image,channel_image' })
for (const item of items) {
  const pi = item.pos_image ? (item.pos_image.length > 100 ? `base64(${item.pos_image.length} chars)` : item.pos_image) : 'NULL'
  const ci = item.channel_image ? (item.channel_image.length > 100 ? `base64(${item.channel_image.length} chars)` : item.channel_image) : 'NULL'
  if (pi !== 'NULL' || ci !== 'NULL') {
    console.log(`${item.name}: pos_image=${pi} | channel_image=${ci}`)
  }
}
console.log(`Toplam: ${items.length} ürün tarandı`)
