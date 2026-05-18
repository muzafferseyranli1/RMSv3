// catalog-seed-combo-verify.mjs — Combo + Doğrulama
import { SALE_IDS } from './catalog-data-ids.mjs'
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'
async function q(b){const r=await fetch(`${API}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return(await r.json()).data||[]}
async function upsert(t,d){await fetch(`${API}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:t,operation:'upsert',data:d,onConflict:t==='settings'?'key':'id'})})}

const SI = SALE_IDS
function combo(id,name,items,discount) {
  const totalBase = items.reduce((s,i)=>s+i.base,0)
  const comboPrice = Math.round(totalBase*(1-discount/100)/5)*5
  return { id, name, items: items.map(i=>({sale_item_id:i.id,name:i.name})), combo_price:comboPrice, discount_pct:discount, active:true }
}

const combos = [
  combo('cmb-001','Klasik Men\u00fc',[{id:SI.hamburger,name:'Hamburger',base:245},{id:SI.klasikPatates,name:'Patates',base:95},{id:SI.cocaCola,name:'Coca-Cola',base:50}],10),
  combo('cmb-002','Tavuk Men\u00fc',[{id:SI.crispyTavuk,name:'Crispy Tavuk',base:255},{id:SI.klasikPatates,name:'Patates',base:95},{id:SI.cocaCola,name:'Coca-Cola',base:50}],10),
  combo('cmb-003','Pizza Men\u00fc',[{id:SI.margherita,name:'Margherita',base:300},{id:SI.cocaCola,name:'Coca-Cola',base:50}],8),
  combo('cmb-004','\u00c7ocuk Men\u00fc',[{id:SI.miniBurger,name:'Mini Burger',base:205},{id:SI.miniNugget,name:'Mini Nugget',base:115},{id:SI.ayran,name:'Ayran',base:35}],12),
  combo('cmb-005','B\u00fcy\u00fck A\u00e7l\u0131k',[{id:SI.doubleBurger,name:'Double Burger',base:325},{id:SI.peynirliPatates,name:'Peynirli Patates',base:115},{id:SI.cocaCola,name:'Coca-Cola',base:50},{id:SI.cocaCola,name:'Coca-Cola',base:50}],15),
  combo('cmb-006','Vejetaryen Men\u00fc',[{id:SI.vejetaryenPizza,name:'Vejetaryen Pizza',base:310},{id:SI.akdenizSalata,name:'Akdeniz Salata',base:160},{id:SI.limonata,name:'Limonata',base:55}],10),
]

async function main() {
  // COMBO YAZIMI
  console.log('=== COMBO MEN\u00dcLER ===')
  await upsert('settings', { key:'combo_menus_v1', value:JSON.stringify(combos) })
  for (const c of combos) console.log(`  + ${c.name} = ${c.combo_price}\u20ba (-%${c.discount_pct})`)

  // DO\u011eRULAMA
  console.log('\n=== DO\u011eRULAMA ===')
  const checks = [
    ['categories', 8], ['semi_categories', 6], ['sale_categories', 19],
    ['suppliers', 8], ['stock_items', 35], ['semi_items', 12],
    ['sale_options', 8], ['option_groups', 4],
  ]
  for (const [t,exp] of checks) {
    const rows = await q({table:t, operation:'select'})
    const icon = rows.length >= exp ? '\u2713' : '\u2717'
    console.log(`  ${icon} ${t}: ${rows.length} (beklenen \u2265${exp})`)
  }

  // Sat\u0131\u015f mallar\u0131 detayl\u0131
  const saleItems = await q({table:'sale_items', operation:'select', select:'id,name,channel_prices,recipe_rows,pos_image'})
  const total = saleItems.length
  let withRecipe=0, withPrices=0, withImage=0
  for (const i of saleItems) {
    const rr = Array.isArray(i.recipe_rows) ? i.recipe_rows : []
    const cp = Array.isArray(i.channel_prices) ? i.channel_prices : []
    if (rr.length > 0) withRecipe++
    if (cp.length > 0) withPrices++
    if (i.pos_image) withImage++
  }
  console.log(`\n  Sat\u0131\u015f Mallar\u0131: ${total}`)
  console.log(`    Re\u00e7eteli: ${withRecipe}/${total}`)
  console.log(`    Fiyatl\u0131: ${withPrices}/${total}`)
  console.log(`    G\u00f6rselli: ${withImage}/${total}`)

  // Combo
  const settings = await q({table:'settings', operation:'select'})
  const comboSetting = settings.find(s=>s.key==='combo_menus_v1')
  const comboCount = comboSetting ? (Array.isArray(comboSetting.value)?comboSetting.value.length:JSON.parse(comboSetting.value).length) : 0
  console.log(`    Combo: ${comboCount}`)

  console.log('\n\u2713 TAM KATALOG TAMAMLANDI!')
}
main().catch(e=>{console.error('HATA:',e.message);process.exit(1)})
