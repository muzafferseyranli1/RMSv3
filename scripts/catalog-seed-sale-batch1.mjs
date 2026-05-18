// catalog-seed-sale-batch1.mjs — Burgerler + Pizzalar (23 ürün)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDS, SALE_IDS, IMAGE_MAP } from './catalog-data-ids.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.resolve(__dirname, '..', 'images')
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'

async function upsert(table, data) {
  const res = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table, operation:'upsert', data, onConflict:'id' }) })
  if (!res.ok) { const t = await res.text(); throw new Error(`${table} fail ${res.status}: ${t.slice(0,200)}`) }
}

// Kanal + vergi oku
async function q(body) { const r = await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); return (await r.json()).data || [] }
const channels = (await q({ table:'sales_channels', operation:'select' })).filter(c=>!c.deleted_at).sort((a,b)=>a.sort_order-b.sort_order)
const taxes = await q({ table:'taxes', operation:'select' })
const vatTax = taxes.find(t=>t.name==='KDV G\u0131da') || taxes[0]
console.log(`Kanallar: ${channels.length}, Vergi: ${vatTax.name}`)

// Görsel base64
function loadImage(saleId) {
  const fname = IMAGE_MAP[saleId]; if (!fname) return null
  const fpath = path.join(IMG_DIR, fname)
  if (!fs.existsSync(fpath)) return null
  const buf = fs.readFileSync(fpath)
  const ext = fname.split('.').pop().toLowerCase()
  const mime = ext==='jpg'||ext==='jpeg'?'image/jpeg':ext==='png'?'image/png':ext==='webp'?'image/webp':'image/jpeg'
  return `data:${mime};base64,${buf.toString('base64')}`
}

// Fiyat stratejisi
const MULT = { 'H\u0131zl\u0131 Sat\u0131\u015f':1, 'Gel Al':0.97, 'Masa':1.02, 'QR Men\u00fc':1, 'Kiosk':0.98, 'Suitable Yemek':1.05, 'Online Yemek':1.05 }
function round5(p) { return Math.round(p/5)*5 }
function chPrices(base) {
  return channels.map(c => ({ channel_id:c.id, active:true, price:round5(base*(MULT[c.name]||1)), tax_id:vatTax.id }))
}

// Reçete helper
let _r=100
function rr(type,itemId,sku,unit,qty,cost,portions) {
  _r++; return { id:`b1050000-0000-4000-8000-${String(_r).padStart(12,'0')}`,
    ingredient_type:type, ingredient_id:itemId, stock_item_id:type==='stock'?itemId:null,
    semi_item_id:type==='semi'?itemId:null, sku, unit, qty:String(qty), cost:String(cost),
    waste_pct:'0', channels:channels.map(c=>c.id), portions:portions||['__standart__'] }
}

const ST=IDS.stk, SE=IDS.semi, SC=IDS.saleCat, OG=IDS.optGrp, O=IDS.opt, SI=SALE_IDS, P=IDS.portion

function sale(id, sku, name, short, catL1, catL2, basePrice, recipe, optGroups, portions) {
  const img = loadImage(id)
  return { id, sku, auto_sku:false, name, short_name:short, description:name,
    location:JSON.stringify([]), cat_l1:null, cat_l2:null, cat_l3:null, cat_l4:null, cat_l5:null,
    acc_cat:null, acc_code:null, unit:null, sale_price:basePrice, cost_price:null,
    tax_id:vatTax.id, stock_item_id:null, recipe_linked:true, active:true, deleted_at:null,
    channel_prices:JSON.stringify(chPrices(basePrice)), same_price:false,
    pos_image:img, pos_color:'#1e293b', pos_text_color:'#ffffff', channel_image:img,
    channel_description:name, setting_active:true, sale_status:true, is_favorite:false,
    split_payment:false, print_note:false, hide_kitchen:false, substitute_id:null,
    portions:JSON.stringify(portions||[]), option_groups:JSON.stringify(optGroups||[]),
    sale_cat_l1:SC.root, sale_cat_l2:catL1, sale_cat_l3:catL2, sale_cat_l4:null, sale_cat_l5:null,
    recipe_rows:JSON.stringify(recipe), recipe_output_qty:1, recipe_output_unit:'adet',
    recipe_is_template:false, standard_price:basePrice, prep_time_minutes:8 }
}

// Burger opsiyon grupları
const burgerOpts = [
  { id:'b1060001-0000-4000-8000-000000000001', group_def_id:OG.sosSecimi, group_name:'Sos Se\u00e7imi', required:true, min_select:1, max_select:2,
    options:[{option_id:O.exKetcap,name:'Extra Ket\u00e7ap',price:0},{option_id:O.exMayo,name:'Extra Mayonez',price:0},{option_id:O.exHardal,name:'Extra Hardal',price:0}] },
  { id:'b1060002-0000-4000-8000-000000000001', group_def_id:OG.ekstraMalz, group_name:'Ekstra Malzeme', required:false, min_select:0, max_select:2,
    options:[{option_id:O.exCheddar,name:'Extra Cheddar',price:25},{option_id:O.exKofte,name:'Extra K\u00f6fte',price:45}] },
]

// Standart burger reçetesi: ekmek + köfte + cheddar + marul + domates + sos
function burgerRecipe(sosId, sosSku, qty=20) {
  return [
    rr('stock',ST.ekmek,'STK-DN-01','adet',1,6.5),
    rr('stock',ST.kofte,'STK-DN-03','adet',1,38),
    rr('stock',ST.cheddar,'STK-SG-01','gram',15,0.85),
    rr('stock',ST.marul,'STK-SG-06','gram',20,0.06),
    rr('stock',ST.domates,'STK-SG-07','gram',30,0.08),
    rr('semi',sosId,sosSku,'mililitre',qty,0.15),
  ]
}
function tavukBurgerRecipe(sosId, sosSku, qty=20) {
  return [
    rr('stock',ST.ekmek,'STK-DN-01','adet',1,6.5),
    rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),
    rr('stock',ST.marul,'STK-SG-06','gram',20,0.06),
    rr('stock',ST.domates,'STK-SG-07','gram',30,0.08),
    rr('semi',sosId,sosSku,'mililitre',qty,0.15),
  ]
}
function pizzaRecipe(sosId, sosSku, toppings=[]) {
  return [
    rr('semi',SE.pizzaHamur,'SEM-HM-01','gram',265,0.02),
    rr('semi',sosId,sosSku,'gram',80,0.08),
    rr('stock',ST.mozzarella,'STK-SG-02','gram',100,1.2),
    ...toppings,
  ]
}

const items = [
  // ETLİ BURGERLER (8)
  sale(SI.hamburger,'SAL-EB-01','Hamburger','Hamburger',SC.burgerler,SC.etliBurger,245,
    burgerRecipe(SE.klasikSos,'SEM-BS-01'), burgerOpts),
  sale(SI.cheeseburger,'SAL-EB-02','Cheeseburger','Cheeseburger',SC.burgerler,SC.etliBurger,265,
    [...burgerRecipe(SE.klasikSos,'SEM-BS-01'), rr('stock',ST.cheddar,'STK-SG-01','gram',15,0.85)], burgerOpts),
  sale(SI.doubleBurger,'SAL-EB-03','Double Burger','Double',SC.burgerler,SC.etliBurger,325,
    [rr('stock',ST.ekmek,'STK-DN-01','adet',1,6.5),rr('stock',ST.kofte,'STK-DN-03','adet',2,38),rr('stock',ST.cheddar,'STK-SG-01','gram',30,0.85),rr('stock',ST.marul,'STK-SG-06','gram',20,0.06),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08),rr('semi',SE.klasikSos,'SEM-BS-01','mililitre',25,0.15)], burgerOpts),
  sale(SI.bbqBurger,'SAL-EB-04','BBQ Burger','BBQ Burger',SC.burgerler,SC.etliBurger,285,
    burgerRecipe(SE.bbqSos,'SEM-BS-02'), burgerOpts),
  sale(SI.mantarliBurger,'SAL-EB-05','Mantar\u0131l\u0131 Burger','Mantarl\u0131',SC.burgerler,SC.etliBurger,295,
    [...burgerRecipe(SE.klasikSos,'SEM-BS-01'),rr('stock',ST.mantar,'STK-SG-08','gram',40,0.25)], burgerOpts),
  sale(SI.karamelizeBurger,'SAL-EB-06','Karamelize So\u011fanl\u0131 Burger','Karamelize',SC.burgerler,SC.etliBurger,290,
    burgerRecipe(SE.klasikSos,'SEM-BS-01'), burgerOpts),
  sale(SI.aciMayoBurger,'SAL-EB-07','Ac\u0131 Mayo Burger','Ac\u0131 Mayo',SC.burgerler,SC.etliBurger,275,
    burgerRecipe(SE.aciMayo,'SEM-BS-03'), burgerOpts),
  sale(SI.megaBurger,'SAL-EB-08','Mega Burger','Mega',SC.burgerler,SC.etliBurger,365,
    [rr('stock',ST.ekmek,'STK-DN-01','adet',1,6.5),rr('stock',ST.kofte,'STK-DN-03','adet',3,38),rr('stock',ST.cheddar,'STK-SG-01','gram',45,0.85),rr('stock',ST.marul,'STK-SG-06','gram',30,0.06),rr('stock',ST.domates,'STK-SG-07','gram',40,0.08),rr('semi',SE.bbqSos,'SEM-BS-02','mililitre',30,0.15)], burgerOpts),

  // TAVUKLU BURGERLER (5)
  sale(SI.crispyTavuk,'SAL-TB-01','Crispy Tavuk Burger','Crispy',SC.burgerler,SC.tavukBurger,255,
    tavukBurgerRecipe(SE.klasikSos,'SEM-BS-01'), burgerOpts),
  sale(SI.izgaraTavuk,'SAL-TB-02','\u0130zgara Tavuk Burger','\u0130zgara',SC.burgerler,SC.tavukBurger,245,
    tavukBurgerRecipe(SE.klasikSos,'SEM-BS-01'), burgerOpts),
  sale(SI.miniBurger,'SAL-TB-03','Mini Burger','Mini',SC.burgerler,SC.tavukBurger,205,
    [rr('stock',ST.ekmek,'STK-DN-01','adet',1,6.5),rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('stock',ST.marul,'STK-SG-06','gram',10,0.06),rr('semi',SE.klasikSos,'SEM-BS-01','mililitre',15,0.15)], burgerOpts),
  sale(SI.tavukWrap,'SAL-TB-04','Tavuk Wrap','Wrap',SC.burgerler,SC.tavukBurger,245,
    [rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('stock',ST.marul,'STK-SG-06','gram',30,0.06),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08),rr('semi',SE.klasikSos,'SEM-BS-01','mililitre',20,0.15)]),
  sale(SI.tavukSandvic,'SAL-TB-05','Tavuklu Sandvi\u00e7','Sandvi\u00e7',SC.burgerler,SC.tavukBurger,235,
    [rr('stock',ST.ekmek,'STK-DN-01','adet',1,6.5),rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('stock',ST.marul,'STK-SG-06','gram',20,0.06),rr('stock',ST.domates,'STK-SG-07','gram',20,0.08)]),

  // KLASİK PİZZALAR (5)
  sale(SI.margherita,'SAL-KP-01','Margherita Pizza','Margherita',SC.pizzalar,SC.klasikPizza,300,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.feslegen,'STK-KR-08','gram',3,0.3)])),
  sale(SI.karisikPizza,'SAL-KP-02','Kar\u0131\u015f\u0131k Pizza','Kar\u0131\u015f\u0131k',SC.pizzalar,SC.klasikPizza,340,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.cheddar,'STK-SG-01','gram',30,0.85),rr('stock',ST.mantar,'STK-SG-08','gram',30,0.25)])),
  sale(SI.sucukluPizza,'SAL-KP-03','Sucuklu Pizza','Sucuklu',SC.pizzalar,SC.klasikPizza,320,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.cheddar,'STK-SG-01','gram',25,0.85)])),
  sale(SI.tonBalikliPizza,'SAL-KP-04','Ton Bal\u0131kl\u0131 Pizza','Ton Bal\u0131k',SC.pizzalar,SC.klasikPizza,330,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[])),
  sale(SI.sebzeliPizza,'SAL-KP-05','Sebzeli Pizza','Sebzeli',SC.pizzalar,SC.klasikPizza,290,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.mantar,'STK-SG-08','gram',30,0.25),rr('stock',ST.domates,'STK-SG-07','gram',40,0.08)])),

  // ÖZEL PİZZALAR (5)
  sale(SI.bbqTavukPizza,'SAL-OP-01','BBQ Tavuk Pizza','BBQ Pizza',SC.pizzalar,SC.ozelPizza,350,
    [rr('semi',SE.pizzaHamur,'SEM-HM-01','gram',265,0.02),rr('semi',SE.bbqSos,'SEM-BS-02','mililitre',60,0.15),rr('stock',ST.mozzarella,'STK-SG-02','gram',100,1.2),rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28)]),
  sale(SI.mantarliPizza,'SAL-OP-02','Mantar\u0131l\u0131 Pizza','Mantar P.',SC.pizzalar,SC.ozelPizza,330,
    pizzaRecipe(SE.beyazPizza,'SEM-PB-02',[rr('stock',ST.mantar,'STK-SG-08','gram',60,0.25)])),
  sale(SI.extraCheesePizza,'SAL-OP-03','Extra Cheese Pizza','Extra Cheese',SC.pizzalar,SC.ozelPizza,340,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.cheddar,'STK-SG-01','gram',40,0.85),rr('stock',ST.parmesan,'STK-SG-03','gram',20,1.8)])),
  sale(SI.tavukPizza,'SAL-OP-04','Tavuk Pizza','Tavuk P.',SC.pizzalar,SC.ozelPizza,320,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28)])),
  sale(SI.vejetaryenPizza,'SAL-OP-05','Vejetaryen Pizza','Vejetaryen',SC.pizzalar,SC.ozelPizza,310,
    pizzaRecipe(SE.domatesPizza,'SEM-PB-01',[rr('stock',ST.mantar,'STK-SG-08','gram',30,0.25),rr('stock',ST.domates,'STK-SG-07','gram',40,0.08),rr('stock',ST.feslegen,'STK-KR-08','gram',3,0.3)])),
]

async function main() {
  console.log(`=== BATCH 1: BURGERLER + P\u0130ZZALAR (${items.length}) ===`)
  let ok=0
  for (const item of items) {
    try { await upsert('sale_items', item); ok++; console.log(`  \u2713 ${item.name}`) }
    catch(e) { console.log(`  \u2717 ${item.name}: ${e.message.slice(0,100)}`) }
  }
  console.log(`\nBatch 1 sonu\u00e7: ${ok}/${items.length}`)
}
main().catch(e => { console.error('HATA:', e.message); process.exit(1) })
