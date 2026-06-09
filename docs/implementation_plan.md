# Implementation Plan: WMS Faz 8 Demand Method Cila

Bu plan, Ana Depo satin alma siparislerinde Faz 8 talep planlama eksiklerini tamamlamak icin uygulanmistir. Ana hedef, sube siparis algoritmasini bozmadan Ana Depo icin ayri ve izlenebilir bir talep yontemi katmani kurmaktir.

## Hedefler

- Ana Depo talep motorunda `demand_method` bilgisini gercek veri/meta alanina tasimak.
- Desteklenen yontemleri standartlastirmak:
  - `recipe_forecast`
  - `usage_average`
  - `stock_topup`
  - `repeat_last_order`
  - `manual`
- Ana Depo "son siparisi tekrarla" modunda sube siparis gecmisi yerine depo satin alma gecmisini kullanmak.
- Ana Depo satin alma akisini yalnizca dis tedarikci siparislerine kapatmak; ic ikmal tedarikcilerine kaymayi engellemek.
- Inbound ve outbound "yolda" miktarlarini ayrik ve daha dogru hesaplamak.
- Kadikoy veya ilk sube gibi sessiz runtime fallback davranislarini dokunulan WMS satin alma yolundan kaldirmak.
- Faz 8 scratch scriptlerinde hardcoded database URL fallback kalmamasini saglamak.

## Uygulama Yaklasimi

### 1. Saf WMS talep motoru

`src/lib/warehouseDemandPlanning.js` dosyasinda Ana Depo talep hesaplamasi saf fonksiyon olarak guclendirildi. Fonksiyon, eksik parametrelerde bos koleksiyonlarla calisabilecek sekilde toleransli hale getirildi ve `demand_method` kararini uretir hale getirildi.

### 2. Orders ekran entegrasyonu

`src/components/pages/Orders.jsx` icinde Ana Depo satin alma akisi, WMS verileriyle zenginlestirildi:

- Depo stok parametreleri
- Bagli subelerin stok/satis/tahmin verileri
- Depoya gelecek dis satin alma kalan miktarlari
- Depodan subeye cikmis ama henuz tamamlanmamis ic ikmal miktarlari
- Depo satin alma gecmisi

Satir meta bilgisinde `meta.forecast.demand_method` saklanir ve siparis detayinda kullaniciya "Talep Yontemi" olarak gosterilir.

### 3. Siparis akisi korumalari

`src/components/pages/OrderFlows.jsx` icinde Ana Depo alici kapsamina sahip satin alma akislarinda ic tedarikci secimi engellendi. Ana Depo kendi ihtiyaci icin siparis urettiginde hedef dis tedarikci olmalidir.

### 4. Guvenlik ve test scriptleri

Faz 8 scratch scriptlerinde DATABASE_URL hardcoded/fallback kullanimlari temizlendi. Scriptler artik acikca `process.env.DATABASE_URL` bekler; ortam degiskeni yoksa calismayi durdurur.

## Dogrulama Plani

- `node scratch\test_branch_purchasing_regression.js`
- `node --check scratch\test_wms_demand_planning.js`
- `node --check scratch\apply_receiver_scope_migration.cjs`
- `node --check scratch\apply_image_url_stock_items_migration.cjs`
- WMS demand engine Node smoke import testi
- `npm.cmd run build`
- Runtime fallback taramasi:
  - `nextBranches[0]`
  - `branches[0]`
  - `Kadikoy`
  - `Kadıköy`
  - `DEFAULT_BRANCH_NAME`

## Kapsam Disi

- Canli Railway DB entegrasyon testi, bu oturumda `DATABASE_URL` verilmedigi icin calistirilmadi.
- Eski ve bu faza ait olmayan scratch dosyalarindaki onceki donem database URL kalintilari ayri bir temizlik konusudur.
