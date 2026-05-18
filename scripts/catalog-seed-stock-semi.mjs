// catalog-seed-stock-semi.mjs — Stok Malları + Yarı Mamuller (reçeteli)
import { IDS } from './catalog-data-ids.mjs'
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'

async function upsert(table, data) {
  const res = await fetch(`${API}/api/query`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table, operation:'upsert', data, onConflict:'id' })
  })
  if (!res.ok) { const t = await res.text(); throw new Error(`${table} fail ${res.status}: ${t}`) }
}

// Kısa stok helper
const I = IDS, SK = I.stockCat, SP = I.supp, ST = I.stk
function stk(id, sku, name, short, catL1, catL2, unit, price, suppId) {
  return { id, sku, auto_sku:false, name, short_name:short, location:JSON.stringify([]),
    acc_cat:null, acc_code:null, cat_l1:SK.root, cat_l2:catL1, cat_l3:catL2, cat_l4:null, cat_l5:null,
    unit, packaging_units:JSON.stringify([]), min_stock:0, max_stock:1000, reorder:null,
    order_unit:'ana', min_order:null, max_order:null, recipe_linked:true, daily_usage:null,
    auto_usage:false, supp_id:suppId, purchase_price:price,
    suppliers_list:JSON.stringify([{supp_id:suppId, purchase_price:price, is_default:true}]),
    saleable:false, sale_name:null, sale_group:null, deleted_at:null }
}

const stockItems = [
  stk(ST.ekmek,'STK-DN-01','Hamburger Ekme\u011fi','Ekme\u011fi',SK.gida,SK.donuk,'adet',6.5,SP.ekmek),
  stk(ST.pizzaHamuru,'STK-DN-02','Pizza Hamuru (250g)','Pizza Hamuru',SK.gida,SK.donuk,'adet',12,SP.forno),
  stk(ST.kofte,'STK-DN-03','Hamburger K\u00f6ftesi','K\u00f6fte',SK.gida,SK.donuk,'adet',38,SP.et),
  stk(ST.tavukKofte,'STK-DN-04','Tavuk K\u00f6ftesi','Tavuk K\u00f6fte',SK.gida,SK.donuk,'adet',28,SP.et),
  stk(ST.nugget,'STK-DN-05','Nugget','Nugget',SK.gida,SK.donuk,'adet',8,SP.et),
  stk(ST.soganHalkasi,'STK-DN-06','So\u011fan Halkas\u0131','So\u011fan H.',SK.gida,SK.donuk,'gram',0.35,SP.et),
  stk(ST.patates,'STK-DN-07','Patates (dondurulmu\u015f)','Patates',SK.gida,SK.donuk,'gram',0.28,SP.et),
  stk(ST.mozzStick,'STK-DN-08','Mozzarella Stick','Mozz Stick',SK.gida,SK.donuk,'adet',12,SP.sut),
  stk(ST.dondurmaTopu,'STK-DN-09','Dondurma Topu','Dondurma',SK.gida,SK.donuk,'adet',22,SP.sut),
  stk(ST.cheddar,'STK-SG-01','Cheddar Peyniri','Cheddar',SK.gida,SK.soguk,'gram',0.85,SP.sut),
  stk(ST.mozzarella,'STK-SG-02','Mozzarella','Mozzarella',SK.gida,SK.soguk,'gram',1.2,SP.sut),
  stk(ST.parmesan,'STK-SG-03','Parmesan','Parmesan',SK.gida,SK.soguk,'gram',1.8,SP.sut),
  stk(ST.krema,'STK-SG-04','Krema','Krema',SK.gida,SK.soguk,'mililitre',0.55,SP.sut),
  stk(ST.sut,'STK-SG-05','S\u00fct','S\u00fct',SK.gida,SK.soguk,'mililitre',0.28,SP.sut),
  stk(ST.marul,'STK-SG-06','Marul','Marul',SK.gida,SK.soguk,'gram',0.06,SP.tarla),
  stk(ST.domates,'STK-SG-07','Domates','Domates',SK.gida,SK.soguk,'gram',0.08,SP.tarla),
  stk(ST.mantar,'STK-SG-08','Mantar','Mantar',SK.gida,SK.soguk,'gram',0.25,SP.tarla),
  stk(ST.salca,'STK-KR-01','Domates Sal\u00e7as\u0131','Sal\u00e7a',SK.gida,SK.kuru,'gram',0.08,SP.sos),
  stk(ST.ketcap,'STK-KR-02','Ket\u00e7ap','Ket\u00e7ap',SK.gida,SK.kuru,'mililitre',0.12,SP.sos),
  stk(ST.hardal,'STK-KR-03','Hardal','Hardal',SK.gida,SK.kuru,'mililitre',0.15,SP.sos),
  stk(ST.mayo,'STK-KR-04','Mayonez','Mayonez',SK.gida,SK.kuru,'mililitre',0.18,SP.sos),
  stk(ST.bbqSos,'STK-KR-05','BBQ Sos','BBQ',SK.gida,SK.kuru,'mililitre',0.22,SP.sos),
  stk(ST.aciBiber,'STK-KR-06','Ac\u0131 Biber Sosu','Ac\u0131 Sos',SK.gida,SK.kuru,'mililitre',0.2,SP.sos),
  stk(ST.zeytinyagi,'STK-KR-07','Zeytinya\u011f\u0131','Zeytinya\u011f\u0131',SK.gida,SK.kuru,'mililitre',0.45,SP.sos),
  stk(ST.feslegen,'STK-KR-08','Fesle\u011fen (kuru)','Fesle\u011fen',SK.gida,SK.kuru,'gram',0.3,SP.sos),
  stk(ST.sarimsak,'STK-KR-09','Sar\u0131msak','Sar\u0131msak',SK.gida,SK.kuru,'gram',0.15,SP.sos),
  stk(ST.un,'STK-KR-10','Un','Un',SK.gida,SK.kuru,'gram',0.02,SP.forno),
  stk(ST.cikolataSos,'STK-KR-11','\u00c7ikolata Sos','\u00c7ik. Sos',SK.gida,SK.kuru,'mililitre',0.3,SP.sos),
  stk(ST.kola330,'STK-IC-01','Kola 330ml','Kola',SK.icecek,null,'adet',18,SP.metro),
  stk(ST.su500,'STK-IC-02','Su 500ml','Su',SK.icecek,null,'adet',5,SP.metro),
  stk(ST.limonataKon,'STK-IC-03','Limonata Konsantrat','Limonata K.',SK.icecek,null,'mililitre',0.35,SP.metro),
  stk(ST.iceTeaKon,'STK-IC-04','Ice Tea Konsantrat','Ice Tea K.',SK.icecek,null,'mililitre',0.28,SP.metro),
  stk(ST.kahve,'STK-IC-05','Kahve (\u00e7ekirdek)','Kahve',SK.icecek,null,'gram',1.2,SP.barista),
  stk(ST.cayPoseti,'STK-IC-06','\u00c7ay Po\u015feti','\u00c7ay',SK.icecek,null,'adet',2,SP.barista),
  stk(ST.kremalicorba,'STK-KR-12','Kremal\u0131 \u00c7orba Tozu','Kremal\u0131 \u00c7.',SK.gida,SK.kuru,'gram',0.4,SP.sos),
]

// Yarı mamul reçete satırı helper
let _rid = 0
function rr(type, itemId, sku, unit, qty, cost) {
  _rid++
  return { id:`b0f20000-0000-4000-8000-${String(_rid).padStart(12,'0')}`,
    ingredient_type:type, ingredient_id:itemId,
    stock_item_id: type==='stock'?itemId:null, semi_item_id: type==='semi'?itemId:null,
    sku, unit, qty:String(qty), cost:String(cost), waste_pct:'0', channels:[], portions:['__standart__'] }
}

const SM = I.semiCat, SE = I.semi
function semi(id, sku, name, short, catL2, recipe, outQty, outUnit) {
  return { id, sku, auto_sku:false, name, short_name:short, location:JSON.stringify([]),
    acc_cat:null, acc_code:null, sale_cat_l1:SM.root, sale_cat_l2:catL2, sale_cat_l3:null, sale_cat_l4:null, sale_cat_l5:null,
    channel_prices:JSON.stringify([]), portions:JSON.stringify([]), option_groups:JSON.stringify([]),
    recipe_rows:JSON.stringify(recipe), recipe_output_qty:outQty, recipe_output_unit:outUnit,
    recipe_is_template:false, same_price:false, setting_active:true, sale_status:true, is_favorite:false,
    split_payment:false, print_note:false, hide_kitchen:false, substitute_id:null,
    pos_image:null, pos_color:'#1e293b', pos_text_color:'#ffffff', channel_image:null,
    channel_description:name, deleted_at:null }
}

const semiItems = [
  semi(SE.klasikSos,'SEM-BS-01','Klasik Burger Sosu','Klasik Sos',SM.burgerSos,[
    rr('stock',ST.mayo,'STK-KR-04','mililitre',200,0.18),
    rr('stock',ST.ketcap,'STK-KR-02','mililitre',150,0.12),
    rr('stock',ST.hardal,'STK-KR-03','mililitre',50,0.15),
  ],400,'mililitre'),
  semi(SE.bbqSos,'SEM-BS-02','BBQ Burger Sosu','BBQ Sos',SM.burgerSos,[
    rr('stock',ST.bbqSos,'STK-KR-05','mililitre',200,0.22),
    rr('stock',ST.ketcap,'STK-KR-02','mililitre',50,0.12),
    rr('stock',ST.sarimsak,'STK-KR-09','gram',10,0.15),
  ],260,'mililitre'),
  semi(SE.aciMayo,'SEM-BS-03','Ac\u0131 Mayo Sosu','Ac\u0131 Mayo',SM.burgerSos,[
    rr('stock',ST.mayo,'STK-KR-04','mililitre',150,0.18),
    rr('stock',ST.aciBiber,'STK-KR-06','mililitre',80,0.2),
  ],230,'mililitre'),
  semi(SE.domatesPizza,'SEM-PB-01','Domates Pizza Sosu','Pizza Sos',SM.pizzaBaz,[
    rr('stock',ST.salca,'STK-KR-01','gram',300,0.08),
    rr('stock',ST.zeytinyagi,'STK-KR-07','mililitre',30,0.45),
    rr('stock',ST.feslegen,'STK-KR-08','gram',5,0.3),
    rr('stock',ST.sarimsak,'STK-KR-09','gram',10,0.15),
  ],345,'gram'),
  semi(SE.beyazPizza,'SEM-PB-02','Beyaz Pizza Sosu','Beyaz Sos',SM.pizzaBaz,[
    rr('stock',ST.krema,'STK-SG-04','mililitre',200,0.55),
    rr('stock',ST.sarimsak,'STK-KR-09','gram',10,0.15),
    rr('stock',ST.parmesan,'STK-SG-03','gram',30,1.8),
  ],240,'mililitre'),
  semi(SE.bolonez,'SEM-MS-01','Bolonez Sos','Bolonez',SM.makarnaSos,[
    rr('stock',ST.salca,'STK-KR-01','gram',200,0.08),
    rr('stock',ST.kofte,'STK-DN-03','adet',1,38),
    rr('stock',ST.sarimsak,'STK-KR-09','gram',10,0.15),
  ],310,'gram'),
  semi(SE.kremaliMantar,'SEM-MS-02','Kremal\u0131 Mantar Sosu','Kr. Mantar',SM.makarnaSos,[
    rr('stock',ST.krema,'STK-SG-04','mililitre',200,0.55),
    rr('stock',ST.mantar,'STK-SG-08','gram',150,0.25),
    rr('stock',ST.sarimsak,'STK-KR-09','gram',10,0.15),
  ],360,'gram'),
  semi(SE.pesto,'SEM-MS-03','Pesto Sos','Pesto',SM.makarnaSos,[
    rr('stock',ST.zeytinyagi,'STK-KR-07','mililitre',100,0.45),
    rr('stock',ST.feslegen,'STK-KR-08','gram',30,0.3),
    rr('stock',ST.parmesan,'STK-SG-03','gram',20,1.8),
  ],150,'gram'),
  semi(SE.pizzaHamur,'SEM-HM-01','Pizza Hamuru (taze)','Taze Hamur',SM.hamur,[
    rr('stock',ST.un,'STK-KR-10','gram',250,0.02),
    rr('stock',ST.zeytinyagi,'STK-KR-07','mililitre',15,0.45),
  ],265,'gram'),
  semi(SE.milkshakeBaz,'SEM-OB-01','Milkshake Baz','Milkshake',SM.ozelBaz,[
    rr('stock',ST.sut,'STK-SG-05','mililitre',200,0.28),
    rr('stock',ST.dondurmaTopu,'STK-DN-09','adet',2,22),
  ],400,'mililitre'),
  semi(SE.limonataBaz,'SEM-OB-02','Limonata Baz','Limonata',SM.ozelBaz,[
    rr('stock',ST.limonataKon,'STK-IC-03','mililitre',80,0.35),
    rr('stock',ST.su500,'STK-IC-02','adet',1,5),
  ],380,'mililitre'),
  semi(SE.cayDemligi,'SEM-OB-03','\u00c7ay Demli\u011fi','\u00c7ay',SM.ozelBaz,[
    rr('stock',ST.cayPoseti,'STK-IC-06','adet',2,2),
  ],500,'mililitre'),
]

async function main() {
  console.log('=== ADIM 6: STOK MALLARI (35) ===')
  for (const s of stockItems) { await upsert('stock_items', s); console.log(`  + ${s.name}`) }
  console.log(`\n  Toplam: ${stockItems.length} stok mal\u0131`)

  console.log('\n=== ADIM 7: YARI MAMULLER (12) ===')
  for (const s of semiItems) { await upsert('semi_items', s); console.log(`  + ${s.name} (${JSON.parse(s.recipe_rows).length} recete sat\u0131r\u0131)`) }
  console.log(`\n  Toplam: ${semiItems.length} yar\u0131 mamul`)
  console.log('\u2713 Stok mallar\u0131 ve yar\u0131 mamuller tamamland\u0131.')
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1) })
