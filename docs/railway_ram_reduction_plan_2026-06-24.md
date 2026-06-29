# Railway RAM Azaltma Plani - 2026-06-24

## Ozet

Railway RAM artisinin ana adayi uygulama cache'i degil, Railway Postgres uzerindeki demo satis kaynakli buyuk veri hacmidir.

Canli salt-okunur olcumlerde:

- Veritabani toplam boyutu: 1579 MB.
- `inventory_movements`: 1014 MB, yaklasik 845 bin satir.
- `sale_lines`: 325 MB, yaklasik 337 bin satir.
- `sales`: 178 MB, yaklasik 137 bin satir.
- `sales.integration_ref = 'demo-sales-tool'`: 136,707 satis.
- Demo satislara bagli `sale_lines`: 336,997 satir.
- Demo satislara bagli `inventory_movements`: 845,833 satir.
- `inventory_movements.meta`: 94 MB JSON payload.
- `sale_lines.options_json`: 14 MB JSON payload.
- `settings.kiosk_settings_v2` ana aday degil; settings tablosu toplam 1368 KB.
- Kucuk API sorgulari yaklasik 0.5 sn donuyor; servis ayakta, sorun genel API down degil.

## Kok Neden

1. Demo satis araci uretim Railway Postgres'e cok buyuk miktarda satis, satis satiri ve stok hareketi yazmis.
2. Stok hareketlerinin neredeyse tamami `source_doc_type = 'sale'` ve demo satislara bagli.
3. `Reports`, `PnLReport`, `Forecast` ve `ShiftPlanner` gibi ekranlarda 1000'lik sayfalarla ham `sales`, `sale_lines` veya `inventory_movements` satirlari cekilip istemcide hesaplama yapiliyor.
4. API `/api/query` cache'i byte guard ile sinirli olsa da, buyuk sorgular Postgres buffer/RAM ve API JSON uretim maliyetini artirmaya devam ediyor.
5. `daily_sales` ve `sales_forecasts` tablolari canli olcumde bos gorunuyor; bu nedenle bazi ekranlar pre-aggregate yerine ham satis fallback yoluna dusuyor.

## Hemen Yapilacak Koruma

1. Demo satis uretimini prod ortamda kilitle:
   - Frontend demo satis baslatma akisini sadece acik bir admin/dev bayragi ile goster.
   - Server tarafinda `integration_ref = 'demo-sales-tool'` ile `sales`, `sale_lines`, `sale_payments`, `inventory_movements` yazimlarini `ALLOW_DEMO_SALES_WRITES=true` yoksa reddeden guard ekle.
   - Bu guard sessiz fallback yapmayacak; ekranda net hata verecek.

2. API cache basincini daha da kis:
   - `API_QUERY_CACHE_MAX_ENTRY_BYTES=65536`
   - `API_QUERY_CACHE_MAX_TOTAL_BYTES=1048576`
   - `API_QUERY_CACHE_MAX_ENTRIES=75`
   - `sales`, `sale_lines`, `inventory_movements` icin buyuk response cache'leme opsiyonel olarak tamamen kapatilabilir.

3. Otomatik yenilemeyi azalt:
   - Kiosk runtime config 30 sn polling yerine 30 dk + focus/manual refresh olacak sekilde planlanmali.
   - KDS/Pickup gibi operasyonel ekranlar kisa yenileme ihtiyaci varsa sadece aktif ekranda ve dar sorgu limitleriyle kalmali.

4. Connection pool basincini sinirla:
   - `server/index.js` pool `max: 10` yerine Railway planina gore `5-7` araligina cekilebilir.
   - Idle timeout 30 sn yerine 15 sn denenebilir.

## Veri Temizligi Plani

Veri silme onaysiz yapilmayacak. Temizlikten once kullanici `demo-sales-tool` verisinin kalici is verisi olmadigini onaylamali.

Onaydan sonra kontrollu akis:

1. Salt-okunur final audit:
   - Demo satis sayisi.
   - Demo satislara bagli satis satiri, odeme ve stok hareketi sayisi.
   - Tarih araligi.
   - Etkilenecek sube listesi.

2. Kucuk manifest tablosu olustur:
   - Sadece sayilar, tarih araliklari ve timestamp saklanir.
   - Tum satirlar ayni DB icinde arsivlenmez; bu disk/RAM sorununu azaltmaz.

3. Chunk bazli silme:
   - Once `inventory_movements` demo satis baglantilari.
   - Sonra `sale_payments`.
   - Sonra `sale_lines`.
   - En son `sales`.
   - Her chunk sonrasi etkilenen satir sayisi loglanir.

4. Bakim:
   - `VACUUM (ANALYZE)` calistirilir.
   - Disk fiziksel kuculmesi gerekiyorsa `VACUUM FULL` sadece bakim penceresinde ve tablo kilitleme etkisi kabul edilerek degerlendirilir.

Beklenen etki:

- `sales` tablosundaki satirlarin neredeyse tamami demo oldugu icin aktif veri hacmi dramatik azalir.
- `inventory_movements` 1 GB seviyesinden cok daha dusuk aktif calisma setine iner.
- Postgres buffer/RAM baskisi, buyuk siralama ve API JSON uretim maliyeti azalir.

## Sorgu Refaktor Plani

1. `Reports.jsx`:
   - `fetchSalesRows`, `fetchSaleLineRows`, `fetchPaymentRows` ham satir cekmek yerine DB aggregate RPC kullanmali.
   - Onerilen RPC'ler:
     - `get_sales_report_summary`
     - `get_sales_product_mix_summary`
     - `get_sales_payment_summary`

2. `PnLReport.jsx`:
   - `fetchSalesRows` ve `fetchInventoryMovementRows` yerine `get_pnl_summary` RPC'si kullanilmali.
   - KDV, brut satis, tamamlanan satis adedi ve stok sayim farklari DB tarafinda gruplanmali.

3. `Forecast.jsx` ve `ShiftPlanner.jsx`:
   - `daily_sales` tablosu bos kalmamali.
   - Satis yazimindan sonra veya manuel job ile `daily_sales` doldurulmali.
   - Urun karmasi icin ham `sale_lines` yerine gun/sube/urun bazli aggregate tablo veya RPC eklenmeli.

4. `ReportDesigner.jsx`:
   - Preview icin hard limit korunmali.
   - Export/advanced modda 1000'lik sonsuz sayfalama yerine maksimum satir ve tarih araligi guard'i olmali.

## Index Plani

Mevcut indeksler iyi bir temel sagliyor. Eklenmesi dusunulecek indeksler:

- `sales(integration_ref)` veya partial `sales(id) where integration_ref = 'demo-sales-tool'` temizlik ve guard audit icin.
- `sale_lines(branch_id, sale_datetime desc)` branch UUID kullanan forecast/rapor sorgulari icin.
- `sale_payments(payment_datetime desc)` rapor araliklari icin, yoksa eklenmeli.

Her indeks once `EXPLAIN` ile dogrulanmali; gereksiz indeks eklenmemeli.

## Izleme Plani

1. Railway dashboard'da API ve Postgres RAM ayrimi manuel dogrulanacak.
2. `[API_QUERY_LOG]` satirlari tablo, sure ve response size'a gore incelenecek.
3. Gerekirse server'a sadece internal kullanima uygun, gizli token zorunlu, kisa `/api/ops/runtime` endpoint'i eklenir:
   - `process.memoryUsage()`
   - query cache entry/byte sayisi
   - pool idle/active/waiting count
4. Public auth olmadigi icin bu endpoint token olmadan acilmayacak.

## Uygulama Sirasi

1. Prod demo write guard ve cache env daraltma.
2. Canli dashboard RAM ayrimi.
3. Kullanici onayli demo veri temizlik migration'i.
4. `VACUUM (ANALYZE)` ve tekrar olcum.
5. Rapor/forecast RPC refaktoru.
6. `daily_sales` ve urun karmasi aggregate mekanizmasi.
7. Otomatik yenileme araliklari ve manual refresh uyumu.
8. Build, deploy ve 24 saatlik RAM/API latency takibi.

## Acik Riskler

- Railway CLI bu oturumda calistirilamadi; servis bazli RAM ayrimi dashboard uzerinden teyit edilmeli.
- Demo veri silme geri donusu olmayan operasyon sayilir; ancak manifest ve on audit ile kontrollu yapilabilir.
- `VACUUM FULL` tablo kilitler; sadece bakim penceresinde uygulanmali.
