// catalog-seed-categories.mjs — Kategori + Tedarikçi seed
import { IDS } from './catalog-data-ids.mjs'
const API = process.env.API_URL || 'https://rms-api-production-219d.up.railway.app'

async function upsert(table, data) {
  const res = await fetch(`${API}/api/query`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ table, operation:'upsert', data, onConflict:'id' })
  })
  if (!res.ok) throw new Error(`${table} upsert fail: ${res.status}`)
  return res.json()
}

async function del(table) {
  const res = await fetch(`${API}/api/query`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ table, operation:'delete', filters:{} })
  })
  console.log(`  DELETE ${table}: ${res.status}`)
}

function cat(id, name, parent_id, bg, text_color, sku_mask) {
  return { id, name, parent_id, bg, text_color, sku_mask, append_type:'karisik', append_len:4, description:name, acc_cat:null, acc_code:null, expense_account_id:null, deleted_at:null }
}
function scat(id, name, parent_id, bg, text_color, sku_mask) {
  return { id, name, parent_id, bg, text_color, sku_mask, append_type:'karisik', append_len:4, description:name, acc_cat:null, acc_code:null, revenue_account_id:null, deleted_at:null }
}
function smcat(id, name, parent_id, bg, text_color, sku_mask) {
  return { id, name, parent_id, bg, text_color, sku_mask, append_type:'karisik', append_len:4, description:name, acc_cat:null, acc_code:null, semi_cost_account_id:null, deleted_at:null }
}

const I = IDS
const stockCats = [
  cat(I.stockCat.root,'Hammaddeler',null,'#fef3c7','#92400e','STK-'),
  cat(I.stockCat.gida,'G\u0131da',I.stockCat.root,'#fee2e2','#991b1b','STK-GD-'),
  cat(I.stockCat.donuk,'Donuk \u00dcr\u00fcnler',I.stockCat.gida,'#dbeafe','#1d4ed8','STK-DN-'),
  cat(I.stockCat.soguk,'So\u011fuk \u00dcr\u00fcnler',I.stockCat.gida,'#dcfce7','#166534','STK-SG-'),
  cat(I.stockCat.kuru,'Kuru G\u0131da',I.stockCat.gida,'#ffedd5','#9a3412','STK-KR-'),
  cat(I.stockCat.icecek,'\u0130\u00e7ecek Malzemeleri',I.stockCat.root,'#ede9fe','#5b21b6','STK-IC-'),
  cat(I.stockCat.ambalaj,'Ambalaj',I.stockCat.root,'#f3e8ff','#7e22ce','STK-AM-'),
  cat(I.stockCat.temizlik,'Temizlik',I.stockCat.root,'#ecfccb','#3f6212','STK-TM-'),
]

const S = I.saleCat
const saleCats = [
  scat(S.root,'A la Carte',null,'#dbeafe','#1d4ed8','SAL-'),
  scat(S.burgerler,'Burgerler',S.root,'#fef3c7','#92400e','SAL-BRG-'),
  scat(S.etliBurger,'Etli Burgerler',S.burgerler,'#fee2e2','#991b1b','SAL-EB-'),
  scat(S.tavukBurger,'Tavuklu Burgerler',S.burgerler,'#ffedd5','#9a3412','SAL-TB-'),
  scat(S.pizzalar,'Pizzalar',S.root,'#fce7f3','#9d174d','SAL-PZA-'),
  scat(S.klasikPizza,'Klasik Pizzalar',S.pizzalar,'#fecdd3','#be123c','SAL-KP-'),
  scat(S.ozelPizza,'\u00d6zel Pizzalar',S.pizzalar,'#fbcfe8','#be185d','SAL-OP-'),
  scat(S.makarnalar,'Makarnalar',S.root,'#e0e7ff','#3730a3','SAL-MKR-'),
  scat(S.yanUrunler,'Yan \u00dcr\u00fcnler',S.root,'#dcfce7','#166534','SAL-YAN-'),
  scat(S.patates,'Patates & K\u0131zartmalar',S.yanUrunler,'#bbf7d0','#15803d','SAL-PT-'),
  scat(S.atistirma,'At\u0131\u015ft\u0131rmal\u0131klar',S.yanUrunler,'#d1fae5','#059669','SAL-AT-'),
  scat(S.salatalar,'Salatalar',S.root,'#ecfccb','#3f6212','SAL-SLT-'),
  scat(S.tatlilar,'Tatl\u0131lar',S.root,'#fae8ff','#86198f','SAL-TTL-'),
  scat(S.dondurma,'Dondurma',S.tatlilar,'#f5d0fe','#a21caf','SAL-DND-'),
  scat(S.sicakTatli,'S\u0131cak Tatl\u0131lar',S.tatlilar,'#e9d5ff','#7e22ce','SAL-ST-'),
  scat(S.icecekler,'\u0130\u00e7ecekler',S.root,'#cffafe','#0e7490','SAL-ICK-'),
  scat(S.sicakIcecek,'S\u0131cak \u0130\u00e7ecekler',S.icecekler,'#a5f3fc','#0891b2','SAL-SI-'),
  scat(S.sogukIcecek,'So\u011fuk \u0130\u00e7ecekler',S.icecekler,'#bae6fd','#0284c7','SAL-SK-'),
  scat(S.milkshake,'Milkshake & Smoothie',S.icecekler,'#c7d2fe','#4338ca','SAL-MS-'),
]

const SM = I.semiCat
const semiCats = [
  smcat(SM.root,'Haz\u0131rl\u0131k \u00dcr\u00fcnleri',null,'#ede9fe','#5b21b6','SEM-'),
  smcat(SM.burgerSos,'Burger Soslar\u0131',SM.root,'#fae8ff','#86198f','SEM-BS-'),
  smcat(SM.pizzaBaz,'Pizza Bazlar\u0131',SM.root,'#fce7f3','#9d174d','SEM-PB-'),
  smcat(SM.makarnaSos,'Makarna Soslar\u0131',SM.root,'#e0e7ff','#3730a3','SEM-MS-'),
  smcat(SM.hamur,'Hamurlar',SM.root,'#ffedd5','#9a3412','SEM-HM-'),
  smcat(SM.ozelBaz,'\u00d6zel Bazlar',SM.root,'#cffafe','#0e7490','SEM-OB-'),
]

function supp(id, code, name, short, cat, pay_term) {
  return { id, cari_kodu:code, muhasebe_kodu:`320.${code.slice(-3)}`, karsi_taraf_kodu:code, name, marka_kisa_adi:short, yetkililer:JSON.stringify([]), sirket_tipi:'tuzel', vergi_dairesi:null, vergi_no:null, tc_no:null, fatura_tipi:'e_fatura', pay_term, banka:null, iban:null, siparis_yontemi:'email', siparis_mailleri:JSON.stringify([]), siparis_telefonlari:JSON.stringify([]), siparis_wa_no:null, logo_url:null, cat, address:null, notes:name, active:true, deleted_at:null }
}

const SP = I.supp
const suppliers = [
  supp(SP.ekmek,'SUP-001','Anadolu Ekmek Tedarik A.\u015e.','Anadolu Ekmek','Ekmek',30),
  supp(SP.et,'SUP-002','Marmara Et \u00dcr\u00fcnleri Ltd. \u015eti.','Marmara Et','Et',30),
  supp(SP.sut,'SUP-003','Horeca S\u00fct ve Peynir Da\u011f\u0131t\u0131m A.\u015e.','Horeca S\u00fct','Peynir',15),
  supp(SP.sos,'SUP-004','Tat Sos Horeca Da\u011f\u0131t\u0131m Ltd.','Tat Sos','Sos',30),
  supp(SP.tarla,'SUP-005','Taze Tarla G\u0131da A.\u015e.','Taze Tarla','Sebze',7),
  supp(SP.forno,'SUP-006','Pasta Forno Unlu Mamul Ltd.','Pasta Forno','Hamur',30),
  supp(SP.metro,'SUP-007','Metro \u0130\u00e7ecek Da\u011f\u0131t\u0131m A.\u015e.','Metro \u0130\u00e7ecek','\u0130\u00e7ecek',30),
  supp(SP.barista,'SUP-008','Barista Co Kahve ve \u00c7ay Ltd.','Barista Co','Kahve',30),
]

async function main() {
  console.log('=== ADIM 1: MEVCUT VERİ TEMİZLİĞİ ===')
  for (const t of ['sale_items','semi_items','stock_items','option_groups','sale_options','sale_templates','stock_templates','suppliers','sale_categories','semi_categories','categories']) {
    await del(t)
  }
  // combo temizle
  await fetch(`${API}/api/query`, { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ table:'settings', operation:'delete', filters:{ key:'combo_menus_v1' } })
  })
  console.log('  DELETE settings.combo_menus_v1')

  console.log('\n=== ADIM 2: STOK KATEGORİLERİ (8) ===')
  for (const c of stockCats) { await upsert('categories', c); console.log(`  + ${c.name}`) }

  console.log('\n=== ADIM 3: YARI MAMUL KATEGORİLERİ (6) ===')
  for (const c of semiCats) { await upsert('semi_categories', c); console.log(`  + ${c.name}`) }

  console.log('\n=== ADIM 4: SATIŞ KATEGORİLERİ (19) ===')
  for (const c of saleCats) { await upsert('sale_categories', c); console.log(`  + ${c.name}`) }

  console.log('\n=== ADIM 5: TEDARİKÇİLER (8) ===')
  for (const s of suppliers) { await upsert('suppliers', s); console.log(`  + ${s.marka_kisa_adi}`) }

  console.log('\n✓ Kategoriler ve tedarikçiler tamamlandı.')
  console.log(`  Stok Kategorileri: ${stockCats.length}`)
  console.log(`  Yarı Mamul Kategorileri: ${semiCats.length}`)
  console.log(`  Satış Kategorileri: ${saleCats.length}`)
  console.log(`  Tedarikçiler: ${suppliers.length}`)
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1) })
