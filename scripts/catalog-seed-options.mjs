// catalog-seed-options.mjs — Seçenekler + Seçenek Grupları (Adım 8-9)
import { IDS } from './catalog-data-ids.mjs'
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'
async function upsert(table, data) {
  const res = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table, operation:'upsert', data, onConflict:'id' }) })
  if (!res.ok) throw new Error(`${table} fail ${res.status}`)
}
const O = IDS.opt, G = IDS.optGrp

const options = [
  { id:O.exKetcap, name:'Extra Ket\u00e7ap', short_name:'Ex.Ket\u00e7ap', sku:'OPT-01', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.exMayo, name:'Extra Mayonez', short_name:'Ex.Mayo', sku:'OPT-02', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.exHardal, name:'Extra Hardal', short_name:'Ex.Hardal', sku:'OPT-03', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.exCheddar, name:'Extra Cheddar', short_name:'Ex.Cheddar', sku:'OPT-04', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.exKofte, name:'Extra K\u00f6fte', short_name:'Ex.K\u00f6fte', sku:'OPT-05', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.buzlu, name:'Buzlu', short_name:'Buzlu', sku:'OPT-06', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.limonDilim, name:'Limon Dilimli', short_name:'Limonlu', sku:'OPT-07', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
  { id:O.sekersiz, name:'\u015eekersiz', short_name:'\u015eekersiz', sku:'OPT-08', channel_prices:JSON.stringify([]), portions:JSON.stringify([]), same_price:false, recipe_rows:JSON.stringify([]), sale_status:true, deleted_at:null, description:null },
]

const SC = IDS.saleCat
const groups = [
  { id:G.sosSecimi, name:'Sos Se\u00e7imi', category_id:SC.burgerler, deleted_at:null, updated_at:new Date().toISOString(),
    options:JSON.stringify([
      { __meta_type:'selection_rules', min_select:1, max_select:2 },
      { option_id:O.exKetcap, name:'Extra Ket\u00e7ap', price:0 },
      { option_id:O.exMayo, name:'Extra Mayonez', price:0 },
      { option_id:O.exHardal, name:'Extra Hardal', price:0 },
    ])},
  { id:G.ekstraMalz, name:'Ekstra Malzeme', category_id:SC.burgerler, deleted_at:null, updated_at:new Date().toISOString(),
    options:JSON.stringify([
      { __meta_type:'selection_rules', min_select:0, max_select:2 },
      { option_id:O.exCheddar, name:'Extra Cheddar', price:25 },
      { option_id:O.exKofte, name:'Extra K\u00f6fte', price:45 },
    ])},
  { id:G.icecekTercihi, name:'\u0130\u00e7ecek Tercihi', category_id:SC.sogukIcecek, deleted_at:null, updated_at:new Date().toISOString(),
    options:JSON.stringify([
      { __meta_type:'selection_rules', min_select:0, max_select:1 },
      { option_id:O.buzlu, name:'Buzlu', price:0 },
      { option_id:O.limonDilim, name:'Limon Dilimli', price:0 },
      { option_id:O.sekersiz, name:'\u015eekersiz', price:0 },
    ])},
  { id:G.sosluSosuz, name:'Sos Tercihi', category_id:SC.yanUrunler, deleted_at:null, updated_at:new Date().toISOString(),
    options:JSON.stringify([
      { __meta_type:'selection_rules', min_select:1, max_select:1 },
      { option_id:O.exKetcap, name:'Ket\u00e7apl\u0131', price:0 },
      { option_id:O.exMayo, name:'Mayonezli', price:0 },
    ])},
]

async function main() {
  console.log('=== ADIM 8: SE\u00c7ENEKLER (8) ===')
  for (const o of options) { await upsert('sale_options', o); console.log(`  + ${o.name}`) }
  console.log('\n=== ADIM 9: SE\u00c7ENEK GRUPLARI (4) ===')
  for (const g of groups) { await upsert('option_groups', g); console.log(`  + ${g.name}`) }
  console.log(`\n\u2713 Se\u00e7enekler: ${options.length}, Gruplar: ${groups.length}`)
}
main().catch(e => { console.error('HATA:', e.message); process.exit(1) })
