# Walkthrough: WMS Faz 8 Demand Method Cila

Bu dokuman, Ana Depo satin alma siparisleri icin Faz 8 kapsaminda tamamlanan talep planlama cilasini ve dogrulama sonuclarini ozetler.

## Problem

Ana Depo icin planlanan talep yontemleri dokumanda vardi, ancak uygulamada `demand_method` alaninin net bir runtime karsiligi eksikti. Bu nedenle kullanici ekranda veya satir meta bilgisinde su yontemleri dogrudan izleyemiyordu:

- `recipe_forecast`
- `usage_average`
- `stock_topup`
- `repeat_last_order`
- `manual`

Ayrica Ana Depo "son siparisi tekrarla" mantigi, depo satin alma gecmisi yerine sube siparis mantigina kayma riski tasiyordu. Ana Depo satin alma akisi da dis tedarikci yerine ic tedarikciye yonlenebilecek sekilde fazla gevsekti.

## Yapilan Degisiklikler

### 1. WMS Demand Engine

Dosya: `src/lib/warehouseDemandPlanning.js`

- `DEMAND_METHOD_PRIORITY` eklendi.
- `normalizeForecastRatio` eklendi; 110 ve 1.10 gibi oran girdileri normalize edilir.
- `pickDominantDemandMethod` eklendi; birden fazla sube talep kaynagi varsa agirlikli/dominant yontem secilir.
- `getDemandSourceLabel` eklendi; kullaniciya okunabilir kaynak metni uretilir.
- `calculateWarehouseDemand` artik eksik array/map parametrelerinde bos koleksiyonlarla calisir.
- Her satir icin `demand_method` uretilir.
- Satir meta bilgisine `meta.forecast.demand_method` yazilir.
- `qty_mode === 'son'` icin depo satin alma gecmisi `warehouseLastOrderQtyMap` uzerinden kullanilir.
- `qty_mode === 'manuel'` icin manuel yontem olarak sifir onerili satir uretimi korunur.

### 2. Orders UI ve Satir Olusturma

Dosya: `src/components/pages/Orders.jsx`

- `calculateWarehouseDemand` entegre edildi.
- `DEMAND_METHOD_LABELS` ve `getDemandMethodLabel` eklendi.
- Siparis detayinda "Talep Yontemi" satiri gosterilir.
- Ana Depo alici kapsami icin WMS snapshot verileri okunur:
  - Depo stok parametreleri
  - Bagli sube stoklari
  - Sube satis/tahmin verileri
  - Depoya gelecek dis satin alma kalan miktarlari
  - Depodan subelere cikmis ic ikmal kalan miktarlari
  - Depo son satin alma miktarlari
- Depo kapsaminda siparis olustururken satir tedarikcisi akisin dis tedarikcisine kilitlenir.
- Ana Depo satin alma listesi sadece external purchase siparislerini gosterir.
- Secili depo/sube yoksa tum siparisleri gosteren sessiz fallback engellenir.

### 3. Order Flow Guard

Dosya: `src/components/pages/OrderFlows.jsx`

- Alici kapsami Ana Depo olan satin alma akislarinda ic tedarikci secimi engellendi.
- Ana Depo kendi ihtiyaci icin siparis verdiginde bu akisin dis tedarikciye gitmesi gerekir.
- Onceki fazdan kalmis tekrar eden `uretim` tipi kontrolu temizlendi.

### 4. Scratch Script Guvenligi

Dosyalar:

- `scratch/test_wms_demand_planning.js`
- `scratch/apply_receiver_scope_migration.cjs`
- `scratch/apply_image_url_stock_items_migration.cjs`

Yapilanlar:

- Hardcoded DATABASE_URL ve fallback baglanti dizesi kaldirildi.
- Scriptler `process.env.DATABASE_URL` olmadan calismayi reddeder.
- `test_wms_demand_planning.js` assertion hatalarinda `process.exitCode = 1` set eder.

## Dogrulama

Calistirilan komutlar:

```powershell
node scratch\test_branch_purchasing_regression.js
node --check scratch\test_wms_demand_planning.js
node --check scratch\apply_receiver_scope_migration.cjs
node --check scratch\apply_image_url_stock_items_migration.cjs
node -e "import('./src/lib/warehouseDemandPlanning.js').then(m=>{const r=m.calculateWarehouseDemand({stockItems:[{id:'i1'}]}); console.log(r[0].demand_method + '|' + r[0].meta.forecast.source_label + '|' + r[0].suggested_qty)})"
npm.cmd run build
```

Sonuclar:

- Branch purchasing regression test basarili.
- Faz 8 scratch syntax checks basarili.
- WMS demand engine smoke test basarili.
- Production build basarili.
- Build sirasinda mevcut CSS minify uyarisi devam ediyor:
  - `Expected identifier but found "-" <stdin>:1179:2: -: T;`

Runtime fallback taramasi:

```powershell
rg "nextBranches\[0\]|branches\[0\]|Kadikoy|Kadıköy|DEFAULT_BRANCH_NAME" src\components\pages\Orders.jsx src\lib\warehouseDemandPlanning.js src\components\pages\OrderFlows.jsx
```

Sonuc: dokunulan WMS satin alma runtime dosyalarinda eslesme yok.

## Notlar

- Canli WMS DB integration testi calistirilmadi; cunku bu oturumda `DATABASE_URL` saglanmadi.
- Yeni Faz 8 scratch dosyalari temizlendi. Eski ve bu faza ait olmayan scratch dosyalarindaki olasi database URL kalintilari ayri bir guvenlik temizligi olarak ele alinmalidir.

## Son Durum

WMS Faz 8 demand method eksigi kapatildi. Ana Depo satin alma akisi, sube siparis algoritmasini bozmadan kendi talep yontemini uretir, meta olarak saklar ve UI'da gosterir.
