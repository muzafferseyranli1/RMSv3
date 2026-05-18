// catalog-seed-sale-batch3.mjs — Tatlılar + İçecekler + retry (18+1)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDS, SALE_IDS, IMAGE_MAP } from './catalog-data-ids.mjs'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.resolve(__dirname, '..', 'images')
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'
async function upsert(t,d){const r=await fetch(`${API}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:t,operation:'upsert',data:d,onConflict:'id'})});if(!r.ok)throw new Error(`${t} ${r.status}: ${(await r.text()).slice(0,150)}`)}
async function q(b){const r=await fetch(`${API}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return(await r.json()).data||[]}
const channels=(await q({table:'sales_channels',operation:'select'})).filter(c=>!c.deleted_at).sort((a,b)=>a.sort_order-b.sort_order)
const taxes=await q({table:'taxes',operation:'select'})
const vat=taxes.find(t=>t.name==='KDV G\u0131da')||taxes[0]

const MAX_IMG=500000
function loadImg(id){const f=IMAGE_MAP[id];if(!f)return null;const p=path.join(IMG_DIR,f);if(!fs.existsSync(p))return null;const b=fs.readFileSync(p);if(b.length>MAX_IMG)return null;const e=f.split('.').pop().toLowerCase();const m=e==='png'?'image/png':e==='webp'?'image/webp':'image/jpeg';return`data:${m};base64,${b.toString('base64')}`}
const ML={'H\u0131zl\u0131 Sat\u0131\u015f':1,'Gel Al':.97,'Masa':1.02,'QR Men\u00fc':1,'Kiosk':.98,'Suitable Yemek':1.05,'Online Yemek':1.05}
function r5(p){return Math.round(p/5)*5}
function cp(base){return channels.map(c=>({channel_id:c.id,active:true,price:r5(base*(ML[c.name]||1)),tax_id:vat.id}))}
let _r=400
function rr(type,iid,sku,unit,qty,cost){_r++;return{id:`b1050000-0000-4000-8000-${String(_r).padStart(12,'0')}`,ingredient_type:type,ingredient_id:iid,stock_item_id:type==='stock'?iid:null,semi_item_id:type==='semi'?iid:null,sku,unit,qty:String(qty),cost:String(cost),waste_pct:'0',channels:channels.map(c=>c.id),portions:['__standart__']}}
const ST=IDS.stk,SE=IDS.semi,SC=IDS.saleCat,SI=SALE_IDS,OG=IDS.optGrp,O=IDS.opt
const icOpt=[{id:'b1060010-0000-4000-8000-000000000001',group_def_id:OG.icecekTercihi,group_name:'\u0130\u00e7ecek Tercihi',required:false,min_select:0,max_select:1,options:[{option_id:O.buzlu,name:'Buzlu',price:0},{option_id:O.limonDilim,name:'Limon Dilimli',price:0},{option_id:O.sekersiz,name:'\u015eekersiz',price:0}]}]

function sale(id,sku,name,short,cL1,cL2,bp,recipe,opts){const img=loadImg(id);return{id,sku,auto_sku:false,name,short_name:short,description:name,location:JSON.stringify([]),cat_l1:null,cat_l2:null,cat_l3:null,cat_l4:null,cat_l5:null,acc_cat:null,acc_code:null,unit:null,sale_price:bp,cost_price:null,tax_id:vat.id,stock_item_id:null,recipe_linked:true,active:true,deleted_at:null,channel_prices:JSON.stringify(cp(bp)),same_price:false,pos_image:img,pos_color:'#1e293b',pos_text_color:'#ffffff',channel_image:img,channel_description:name,setting_active:true,sale_status:true,is_favorite:false,split_payment:false,print_note:false,hide_kitchen:false,substitute_id:null,portions:JSON.stringify([]),option_groups:JSON.stringify(opts||[]),sale_cat_l1:SC.root,sale_cat_l2:cL1,sale_cat_l3:cL2,sale_cat_l4:null,sale_cat_l5:null,recipe_rows:JSON.stringify(recipe),recipe_output_qty:1,recipe_output_unit:'adet',recipe_is_template:false,standard_price:bp,prep_time_minutes:5}}

const items = [
  // TATLILAR (5)
  sale(SI.kremaliKakao,'SAL-ST-01','Kremal\u0131 Kakao Tatl\u0131s\u0131','Kr. Kakao',SC.tatlilar,SC.sicakTatli,125,[rr('stock',ST.krema,'STK-SG-04','mililitre',50,0.55),rr('stock',ST.cikolataSos,'STK-KR-11','mililitre',30,0.3)]),
  sale(SI.sogukCikolata,'SAL-ST-02','So\u011fuk \u00c7ikolata Tatl\u0131s\u0131','So\u011fuk \u00c7ik.',SC.tatlilar,SC.sicakTatli,130,[rr('stock',ST.cikolataSos,'STK-KR-11','mililitre',40,0.3),rr('stock',ST.sut,'STK-SG-05','mililitre',100,0.28)]),
  sale(SI.cikolataKup,'SAL-ST-03','\u00c7ikolata Kup','\u00c7ik. Kup',SC.tatlilar,SC.sicakTatli,120,[rr('stock',ST.cikolataSos,'STK-KR-11','mililitre',30,0.3),rr('stock',ST.krema,'STK-SG-04','mililitre',30,0.55)]),
  sale(SI.vanilyaKup,'SAL-ST-04','Vanilya Kup','Van. Kup',SC.tatlilar,SC.sicakTatli,120,[rr('stock',ST.krema,'STK-SG-04','mililitre',50,0.55),rr('stock',ST.sut,'STK-SG-05','mililitre',30,0.28)]),
  sale(SI.meyveliKup,'SAL-ST-05','Meyveli Kup','Mey. Kup',SC.tatlilar,SC.sicakTatli,120,[rr('stock',ST.krema,'STK-SG-04','mililitre',40,0.55)]),

  // SICAK İÇECEKLER (5)
  sale(SI.cay,'SAL-SI-01','\u00c7ay','\u00c7ay',SC.icecekler,SC.sicakIcecek,25,[rr('semi',SE.cayDemligi,'SEM-OB-03','mililitre',200,0.01)]),
  sale(SI.espresso,'SAL-SI-02','Espresso','Espresso',SC.icecekler,SC.sicakIcecek,55,[rr('stock',ST.kahve,'STK-IC-05','gram',7,1.2)]),
  sale(SI.latte,'SAL-SI-03','Latte','Latte',SC.icecekler,SC.sicakIcecek,75,[rr('stock',ST.kahve,'STK-IC-05','gram',7,1.2),rr('stock',ST.sut,'STK-SG-05','mililitre',150,0.28)]),
  sale(SI.sutluKahve,'SAL-SI-04','S\u00fctl\u00fc Kahve','S. Kahve',SC.icecekler,SC.sicakIcecek,80,[rr('stock',ST.kahve,'STK-IC-05','gram',7,1.2),rr('stock',ST.sut,'STK-SG-05','mililitre',200,0.28)]),
  sale(SI.sicakCikolata,'SAL-SI-05','S\u0131cak \u00c7ikolata','S. \u00c7ik.',SC.icecekler,SC.sicakIcecek,70,[rr('stock',ST.cikolataSos,'STK-KR-11','mililitre',30,0.3),rr('stock',ST.sut,'STK-SG-05','mililitre',200,0.28)]),

  // SOĞUK İÇECEKLER (7)
  sale(SI.cocaCola,'SAL-SK-01','Coca-Cola','Kola',SC.icecekler,SC.sogukIcecek,50,[rr('stock',ST.kola330,'STK-IC-01','adet',1,18)],icOpt),
  sale(SI.colaZero,'SAL-SK-02','Coca-Cola Zero','Zero',SC.icecekler,SC.sogukIcecek,50,[rr('stock',ST.kola330,'STK-IC-01','adet',1,18)],icOpt),
  sale(SI.fanta,'SAL-SK-03','Fanta','Fanta',SC.icecekler,SC.sogukIcecek,50,[rr('stock',ST.kola330,'STK-IC-01','adet',1,18)],icOpt),
  sale(SI.sprite,'SAL-SK-04','Sprite','Sprite',SC.icecekler,SC.sogukIcecek,50,[rr('stock',ST.kola330,'STK-IC-01','adet',1,18)],icOpt),
  sale(SI.soda,'SAL-SK-05','Soda','Soda',SC.icecekler,SC.sogukIcecek,30,[rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),
  sale(SI.ayran,'SAL-SK-06','Ayran','Ayran',SC.icecekler,SC.sogukIcecek,35,[rr('stock',ST.sut,'STK-SG-05','mililitre',250,0.28)]),
  sale(SI.su500,'SAL-SK-07','Su 500ml','Su',SC.icecekler,SC.sogukIcecek,20,[rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),

  // MEYVE SULARI (5)
  sale(SI.portakalSuyu,'SAL-MS-01','Portakal Suyu','Portakal',SC.icecekler,SC.milkshake,60,[rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),
  sale(SI.elmaSuyu,'SAL-MS-02','Elma Suyu','Elma',SC.icecekler,SC.milkshake,55,[rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),
  sale(SI.havucSuyu,'SAL-MS-03','Havu\u00e7 Suyu','Havu\u00e7',SC.icecekler,SC.milkshake,60,[rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),
  sale(SI.karisikMeyve,'SAL-MS-04','Kar\u0131\u015f\u0131k Meyve Suyu','Kar. Meyve',SC.icecekler,SC.milkshake,60,[rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),
  sale(SI.limonata,'SAL-MS-05','Limonata','Limonata',SC.icecekler,SC.milkshake,55,[rr('semi',SE.limonataBaz,'SEM-OB-02','mililitre',300,0.1)]),

  // ICE TEA (2)
  sale(SI.iceTeaLimon,'SAL-MS-06','Ice Tea Limon','Ice Tea L.',SC.icecekler,SC.milkshake,45,[rr('stock',ST.iceTeaKon,'STK-IC-04','mililitre',50,0.28),rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),
  sale(SI.iceTeaSeftali,'SAL-MS-07','Ice Tea \u015eeftali','Ice Tea \u015e.',SC.icecekler,SC.milkshake,45,[rr('stock',ST.iceTeaKon,'STK-IC-04','mililitre',50,0.28),rr('stock',ST.su500,'STK-IC-02','adet',1,5)]),

  // MILKSHAKE (2)
  sale(SI.cilekMilkshake,'SAL-MS-08','\u00c7ilek Milkshake','\u00c7ilek MS',SC.icecekler,SC.milkshake,80,[rr('semi',SE.milkshakeBaz,'SEM-OB-01','mililitre',300,0.2)]),
  sale(SI.muzMilkshake,'SAL-MS-09','Muz Milkshake','Muz MS',SC.icecekler,SC.milkshake,80,[rr('semi',SE.milkshakeBaz,'SEM-OB-01','mililitre',300,0.2)]),

  // RETRY: Extra Cheese Pizza (görselsiz — 4MB fazla)
  sale(SI.extraCheesePizza,'SAL-OP-03','Extra Cheese Pizza','Extra Cheese',SC.pizzalar,SC.ozelPizza,340,
    [rr('semi',SE.pizzaHamur,'SEM-HM-01','gram',265,0.02),rr('semi',SE.domatesPizza,'SEM-PB-01','gram',80,0.08),rr('stock',ST.mozzarella,'STK-SG-02','gram',100,1.2),rr('stock',ST.cheddar,'STK-SG-01','gram',40,0.85),rr('stock',ST.parmesan,'STK-SG-03','gram',20,1.8)]),
]

async function main(){
  console.log(`=== BATCH 3 (${items.length}) ===`)
  let ok=0
  for(const i of items){try{await upsert('sale_items',i);ok++;console.log(`  \u2713 ${i.name}`)}catch(e){console.log(`  \u2717 ${i.name}: ${e.message.slice(0,100)}`)}}
  console.log(`\nBatch 3: ${ok}/${items.length}`)
}
main().catch(e=>{console.error('HATA:',e.message);process.exit(1)})
