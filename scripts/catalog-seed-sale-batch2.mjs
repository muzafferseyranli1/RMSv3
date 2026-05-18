// catalog-seed-sale-batch2.mjs — Makarna+YanÜrün+Salata+Tatlı (24 ürün)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IDS, SALE_IDS, IMAGE_MAP } from './catalog-data-ids.mjs'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.resolve(__dirname, '..', 'images')
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'
async function upsert(t,d) { const r=await fetch(`${API}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:t,operation:'upsert',data:d,onConflict:'id'})}); if(!r.ok)throw new Error(`${t} ${r.status}: ${(await r.text()).slice(0,150)}`) }
async function q(b) { const r=await fetch(`${API}/api/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); return (await r.json()).data||[] }
const channels=(await q({table:'sales_channels',operation:'select'})).filter(c=>!c.deleted_at).sort((a,b)=>a.sort_order-b.sort_order)
const taxes=await q({table:'taxes',operation:'select'})
const vat=taxes.find(t=>t.name==='KDV G\u0131da')||taxes[0]

const MAX_IMG=500000 // 500KB limit
function loadImg(id) { const f=IMAGE_MAP[id]; if(!f)return null; const p=path.join(IMG_DIR,f); if(!fs.existsSync(p))return null; const b=fs.readFileSync(p); if(b.length>MAX_IMG)return null; const e=f.split('.').pop().toLowerCase(); const m=e==='png'?'image/png':e==='webp'?'image/webp':'image/jpeg'; return `data:${m};base64,${b.toString('base64')}` }
const M={'H\u0131zl\u0131 Sat\u0131\u015f':1,'Gel Al':.97,'Masa':1.02,'QR Men\u00fc':1,'Kiosk':.98,'Suitable Yemek':1.05,'Online Yemek':1.05}
function r5(p){return Math.round(p/5)*5}
function cp(base){return channels.map(c=>({channel_id:c.id,active:true,price:r5(base*(M[c.name]||1)),tax_id:vat.id}))}
let _r=200
function rr(type,iid,sku,unit,qty,cost,por){_r++;return{id:`b1050000-0000-4000-8000-${String(_r).padStart(12,'0')}`,ingredient_type:type,ingredient_id:iid,stock_item_id:type==='stock'?iid:null,semi_item_id:type==='semi'?iid:null,sku,unit,qty:String(qty),cost:String(cost),waste_pct:'0',channels:channels.map(c=>c.id),portions:por||['__standart__']}}
const ST=IDS.stk,SE=IDS.semi,SC=IDS.saleCat,SI=SALE_IDS

function sale(id,sku,name,short,cL1,cL2,bp,recipe,opts,pors){const img=loadImg(id);return{id,sku,auto_sku:false,name,short_name:short,description:name,location:JSON.stringify([]),cat_l1:null,cat_l2:null,cat_l3:null,cat_l4:null,cat_l5:null,acc_cat:null,acc_code:null,unit:null,sale_price:bp,cost_price:null,tax_id:vat.id,stock_item_id:null,recipe_linked:true,active:true,deleted_at:null,channel_prices:JSON.stringify(cp(bp)),same_price:false,pos_image:img,pos_color:'#1e293b',pos_text_color:'#ffffff',channel_image:img,channel_description:name,setting_active:true,sale_status:true,is_favorite:false,split_payment:false,print_note:false,hide_kitchen:false,substitute_id:null,portions:JSON.stringify(pors||[]),option_groups:JSON.stringify(opts||[]),sale_cat_l1:SC.root,sale_cat_l2:cL1,sale_cat_l3:cL2,sale_cat_l4:null,sale_cat_l5:null,recipe_rows:JSON.stringify(recipe),recipe_output_qty:1,recipe_output_unit:'adet',recipe_is_template:false,standard_price:bp,prep_time_minutes:8}}

const OG=IDS.optGrp,O=IDS.opt
const sosOpt=[{id:'b1060005-0000-4000-8000-000000000001',group_def_id:OG.sosluSosuz,group_name:'Sos Tercihi',required:true,min_select:1,max_select:1,options:[{option_id:O.exKetcap,name:'Ket\u00e7apl\u0131',price:0},{option_id:O.exMayo,name:'Mayonezli',price:0}]}]

const items = [
  // MAKARNALAR (5)
  sale(SI.bolonezMakarna,'SAL-MK-01','Bolonezli Makarna','Bolonez',SC.makarnalar,null,225,[rr('semi',SE.bolonez,'SEM-MS-01','gram',150,0.08),rr('stock',ST.parmesan,'STK-SG-03','gram',10,1.8)]),
  sale(SI.kremaliMantarMakarna,'SAL-MK-02','Kremal\u0131 Mantar Makarna','Kr. Mantar',SC.makarnalar,null,240,[rr('semi',SE.kremaliMantar,'SEM-MS-02','gram',180,0.15),rr('stock',ST.parmesan,'STK-SG-03','gram',10,1.8)]),
  sale(SI.tavukluMakarna,'SAL-MK-03','Tavuklu Makarna','Tavuklu',SC.makarnalar,null,255,[rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('semi',SE.kremaliMantar,'SEM-MS-02','gram',150,0.15)]),
  sale(SI.aciTavukMakarna,'SAL-MK-04','Ac\u0131 Tavuklu Makarna','Ac\u0131 Tavuk',SC.makarnalar,null,260,[rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('semi',SE.bolonez,'SEM-MS-01','gram',150,0.08),rr('stock',ST.aciBiber,'STK-KR-06','mililitre',10,0.2)]),
  sale(SI.parmesanMakarna,'SAL-MK-05','Parmesanl\u0131 Makarna','Parmesan',SC.makarnalar,null,245,[rr('semi',SE.pesto,'SEM-MS-03','gram',80,0.3),rr('stock',ST.parmesan,'STK-SG-03','gram',20,1.8)]),

  // PATATES (5)
  sale(SI.klasikPatates,'SAL-PT-01','Klasik Patates','Patates',SC.yanUrunler,SC.patates,95,[rr('stock',ST.patates,'STK-DN-07','gram',200,0.28)],sosOpt),
  sale(SI.sosluPatates,'SAL-PT-02','Soslu Patates','Soslu P.',SC.yanUrunler,SC.patates,105,[rr('stock',ST.patates,'STK-DN-07','gram',200,0.28),rr('stock',ST.ketcap,'STK-KR-02','mililitre',30,0.12)],sosOpt),
  sale(SI.baharatliPatates,'SAL-PT-03','Baharatl\u0131 Patates','Baharatl\u0131',SC.yanUrunler,SC.patates,105,[rr('stock',ST.patates,'STK-DN-07','gram',200,0.28)],sosOpt),
  sale(SI.jalapenoPatates,'SAL-PT-04','Jalape\u00f1o Patates','Jalape\u00f1o',SC.yanUrunler,SC.patates,120,[rr('stock',ST.patates,'STK-DN-07','gram',200,0.28),rr('stock',ST.cheddar,'STK-SG-01','gram',20,0.85),rr('stock',ST.aciBiber,'STK-KR-06','mililitre',10,0.2)]),
  sale(SI.peynirliPatates,'SAL-PT-05','Peynirli Patates','Peynirli',SC.yanUrunler,SC.patates,115,[rr('stock',ST.patates,'STK-DN-07','gram',200,0.28),rr('stock',ST.cheddar,'STK-SG-01','gram',30,0.85)]),

  // ATIŞTIRMALIKLAR (5)
  sale(SI.soganHalkasi,'SAL-AT-01','So\u011fan Halkas\u0131','So\u011fan H.',SC.yanUrunler,SC.atistirma,130,[rr('stock',ST.soganHalkasi,'STK-DN-06','gram',150,0.35)]),
  sale(SI.mozzarellaStick,'SAL-AT-02','Mozzarella Stick','Mozz. Stick',SC.yanUrunler,SC.atistirma,135,[rr('stock',ST.mozzStick,'STK-DN-08','adet',6,12)]),
  sale(SI.miniNugget,'SAL-AT-03','Mini Nugget','Mini Nug.',SC.yanUrunler,SC.atistirma,115,[rr('stock',ST.nugget,'STK-DN-05','adet',6,8)]),
  sale(SI.nuggetBox,'SAL-AT-04','Nugget Box','Nugget Box',SC.yanUrunler,SC.atistirma,215,[rr('stock',ST.nugget,'STK-DN-05','adet',12,8)]),
  sale(SI.quesadilla,'SAL-AT-05','Quesadilla','Quesadilla',SC.yanUrunler,SC.atistirma,185,[rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('stock',ST.cheddar,'STK-SG-01','gram',30,0.85),rr('stock',ST.domates,'STK-SG-07','gram',20,0.08)]),

  // SALATALAR (6)
  sale(SI.sezarSalata,'SAL-SL-01','Sezar Salata','Sezar',SC.salatalar,null,190,[rr('stock',ST.marul,'STK-SG-06','gram',80,0.06),rr('stock',ST.parmesan,'STK-SG-03','gram',15,1.8),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08)]),
  sale(SI.akdenizSalata,'SAL-SL-02','Akdeniz Salata','Akdeniz',SC.salatalar,null,160,[rr('stock',ST.marul,'STK-SG-06','gram',80,0.06),rr('stock',ST.domates,'STK-SG-07','gram',40,0.08),rr('stock',ST.zeytinyagi,'STK-KR-07','mililitre',10,0.45)]),
  sale(SI.hellimSalata,'SAL-SL-03','Hellim Salata','Hellim',SC.salatalar,null,180,[rr('stock',ST.marul,'STK-SG-06','gram',70,0.06),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08)]),
  sale(SI.mevsimSalata,'SAL-SL-04','Mevsim Salata','Mevsim',SC.salatalar,null,145,[rr('stock',ST.marul,'STK-SG-06','gram',60,0.06),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08)]),
  sale(SI.ranchTavukSalata,'SAL-SL-05','Ranch Tavuk Salata','Ranch',SC.salatalar,null,195,[rr('stock',ST.marul,'STK-SG-06','gram',80,0.06),rr('stock',ST.tavukKofte,'STK-DN-04','adet',1,28),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08),rr('stock',ST.mayo,'STK-KR-04','mililitre',20,0.18)]),
  sale(SI.tonBalikSalata,'SAL-SL-06','Ton Bal\u0131kl\u0131 Salata','Ton',SC.salatalar,null,185,[rr('stock',ST.marul,'STK-SG-06','gram',80,0.06),rr('stock',ST.domates,'STK-SG-07','gram',30,0.08)]),

  // DONDURMA (4)
  sale(SI.vanilyaDondurma,'SAL-DN-01','Vanilya Dondurma','Vanilya',SC.tatlilar,SC.dondurma,90,[rr('stock',ST.dondurmaTopu,'STK-DN-09','adet',2,22)]),
  sale(SI.cikolataliDondurma,'SAL-DN-02','\u00c7ikolatal\u0131 Dondurma','\u00c7ik. Don.',SC.tatlilar,SC.dondurma,95,[rr('stock',ST.dondurmaTopu,'STK-DN-09','adet',2,22),rr('stock',ST.cikolataSos,'STK-KR-11','mililitre',20,0.3)]),
  sale(SI.karisikDondurma,'SAL-DN-03','Kar\u0131\u015f\u0131k Dondurma','Kar\u0131\u015f\u0131k',SC.tatlilar,SC.dondurma,100,[rr('stock',ST.dondurmaTopu,'STK-DN-09','adet',3,22)]),
  sale(SI.sosluDondurma,'SAL-DN-04','Soslu Dondurma','Soslu Don.',SC.tatlilar,SC.dondurma,105,[rr('stock',ST.dondurmaTopu,'STK-DN-09','adet',2,22),rr('stock',ST.cikolataSos,'STK-KR-11','mililitre',30,0.3),rr('stock',ST.ketcap,'STK-KR-02','mililitre',10,0.12)]),
]

async function main(){
  console.log(`=== BATCH 2 (${items.length}) ===`)
  let ok=0
  for(const i of items){try{await upsert('sale_items',i);ok++;console.log(`  \u2713 ${i.name}`)}catch(e){console.log(`  \u2717 ${i.name}: ${e.message.slice(0,100)}`)}}
  console.log(`\nBatch 2: ${ok}/${items.length}`)
}
main().catch(e=>{console.error('HATA:',e.message);process.exit(1)})
