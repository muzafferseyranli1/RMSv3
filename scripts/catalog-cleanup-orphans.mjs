// catalog-cleanup-orphans.mjs — Eski demo artıklarını temizle
// Yeni katalogdaki ID'ler dışındaki TÜM kayıtları sil
import { IDS, SALE_IDS } from './catalog-data-ids.mjs'
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'

async function q(b) {
  const r = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) })
  const j = await r.json()
  return j.data || j.rows || []
}
async function deleteById(table, id) {
  const r = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table, operation:'delete', filters:[{ type:'eq', col:'id', val:id }] }) })
  const j = await r.json()
  return r.ok && !j.error
}

// Bilinen ID setleri
const knownIds = {
  categories: Object.values(IDS.stockCat),
  semi_categories: Object.values(IDS.semiCat),
  sale_categories: Object.values(IDS.saleCat),
  suppliers: Object.values(IDS.supp),
  stock_items: Object.values(IDS.stk),
  semi_items: Object.values(IDS.semi),
  sale_options: Object.values(IDS.opt),
  option_groups: Object.values(IDS.optGrp),
  sale_items: Object.values(SALE_IDS),
}

async function cleanTable(table) {
  const known = new Set(knownIds[table] || [])
  const rows = await q({ table, operation:'select', select:'id,name' })
  const orphans = rows.filter(r => !known.has(r.id))
  
  if (orphans.length === 0) {
    console.log(`  ${table}: temiz (${rows.length} kayit, 0 artik)`)
    return 0
  }

  console.log(`  ${table}: ${rows.length} kayit, ${orphans.length} ARTIK bulundu:`)
  let deleted = 0
  for (const o of orphans) {
    const ok = await deleteById(table, o.id)
    if (ok) { deleted++; console.log(`    \u2717 silindi: ${o.name || o.id}`) }
    else { console.log(`    ! silinemedi: ${o.name || o.id}`) }
  }
  return deleted
}

async function main() {
  console.log('=== ESKİ DEMO ARTIKLARI TEMİZLİĞİ ===\n')
  
  // Önce child tablolardan başla (FK bağımlılık sırası)
  const tables = ['sale_items','semi_items','stock_items','option_groups','sale_options',
                  'sale_categories','semi_categories','categories','suppliers']
  
  let totalDeleted = 0
  for (const t of tables) {
    totalDeleted += await cleanTable(t)
  }

  // Doğrulama
  console.log('\n=== TEMİZLİK SONRASI DOĞRULAMA ===')
  for (const t of tables) {
    const rows = await q({ table:t, operation:'select', select:'id' })
    const known = knownIds[t] ? knownIds[t].length : '?'
    console.log(`  ${t}: ${rows.length} (beklenen: ${known})`)
  }

  // Satış malları detay
  const si = await q({ table:'sale_items', operation:'select', select:'id,name,channel_prices,recipe_rows,pos_image' })
  let rr=0, cp=0, img=0
  for (const i of si) {
    if (Array.isArray(i.recipe_rows) && i.recipe_rows.length > 0) rr++
    if (Array.isArray(i.channel_prices) && i.channel_prices.length > 0) cp++
    if (i.pos_image) img++
  }
  console.log(`\n  Satış Malları Detay:`)
  console.log(`    Toplam: ${si.length}`)
  console.log(`    Reçeteli: ${rr}/${si.length}`)
  console.log(`    Fiyatlı (7 kanal): ${cp}/${si.length}`)
  console.log(`    Görselli: ${img}/${si.length}`)
  
  console.log(`\nToplam silinen artık: ${totalDeleted}`)
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1) })
