


_________________________________________________________________________________________________________________________
# WMS Fazlandırılmış Agent Görev Tanımları

Tarih: `2026-06-11`
Amaç: `docs/wms_depo_yonetim_sistemi_analiz_ve_proje_plani.md` içindeki WMS projesini başka agentlara sırayla yaptırılabilecek net görev paketlerine bölmek.

Bu doküman agent talimatı olarak kullanılabilir. Her görev bağımsız bir teslimat üretmeli, `OperationSync.md` güncellenmeli ve DB-first kurallar korunmalıdır.

---

## En Baştaki Yürütme Sırası ve Paralellik Kuralları

Bu bölüm özellikle agent koordinasyonu için en başa konmuştur. WMS işi fazla modüllü olduğu için her görevi paralel başlatmak doğru değildir; bazı veri kontratları sırayla oturmadan sonraki agentların yazacağı kod boşa düşer.

### Kritik Sıralı Hat

Aşağıdaki görevler bu sırayla yapılmalıdır:

1. `WMS-00A` - Baseline denetimi
2. `WMS-01A` - Reservation şeması
3. `WMS-01B` - Net pickable stok RPC/view
4. `WMS-01C` - Sevkiyat taslağı oluştururken reservation
5. `WMS-01D` - Sevkiyat onayında reservation consume/release
6. `WMS-01E` - Depo planlamada reserved stok entegrasyonu
7. `WMS-02A` - Task/event şeması
8. `WMS-02B` - Mal kabulden putaway görevi
9. `WMS-02C` - Sevkiyattan pick/pack/load görevi
10. `WMS-02D` - WMS görev web ekranı
11. `WMS-03A` - Native Android WMS modülü ve Görevlerim
12. `WMS-03B` - Android barkod tarama motoru ve server parser kontratı
13. `WMS-03C` - Android barkodlu mal kabul
14. `WMS-03D` - Android putaway
15. `WMS-03E` - Android lokasyon yönlendirmeli picking
16. `WMS-03F` - Android fotoğraf kanıtı ve dosya upload entegrasyonu
17. `WMS-03G` - Android paket barkodu, ölçü/ağırlık ve yük önizleme
18. `WMS-04A` - Kalite hold şeması
19. `WMS-04B` - Karantina yönetim ekranı
20. `WMS-04C` - Lot/SKT traceability raporu
21. `WMS-04D` - Ürün barkod ve paketleme master data şeması
22. `WMS-04E` - Stok kartı paket ölçüleri ve barkod yönetimi UI
23. `WMS-04F` - Merkez Depo araç tanımları
24. `WMS-04G` - Araç hacim/ağırlık kapasite kontrolü
25. `WMS-05A` - WMS cycle count görevleri
26. `WMS-05B` - Pick-face replenishment
27. `WMS-06A` - WMS operasyon raporları
28. `WMS-06B` - WMS dashboard

### Paralel Yapılabilecekler

- `WMS-00A` baseline tamamlandıktan sonra proje kökünde ayrı `wms-android` native Android uygulama klasörü için keşif ve ekran tasarımı (`WMS-03A`) yapılabilir; ancak task/reservation tüketen API çağrıları Faz 1-2 tamamlanmadan merge edilmemeli.
- `WMS-03F` Android fotoğraf/upload altyapısı, `WMS-03A` native Android shell ile paralel hazırlanabilir. Bu iş reservation veya task consume mantığına bağımlı değildir.
- `WMS-04C` lot/SKT traceability raporu tasarımı, `WMS-04A` kalite hold şeması netleştikten sonra `WMS-04B` karantina ekranıyla paralel yürüyebilir.
- `WMS-04A` kalite hold DB şeması, `WMS-03F` tamamlanmadan tasarlanabilir; ancak fotoğraf/evidence alanları `wms-android` upload kontratıyla uyumlu tutulmalıdır.
- `WMS-04D` ürün barkod/paketleme şeması, Faz 4 kalite işleriyle paralel tasarlanabilir; ancak `WMS-04E`, `WMS-04G` ve `WMS-03G` bu DB kontratına göre kapanmalıdır.
- `WMS-04F` Merkez Depo araç tanımları, `vehicles` master data şeması genişletildikten sonra `WMS-04G` kapasite kontrolüyle paralel değil, önce yapılmalıdır. Sevkiyat, Android ve raporlar araç bilgisini bu master ekrandan tüketmelidir.
- `WMS-06A` rapor taslakları, Faz 1 reservation ve Faz 2 task tabloları oturduktan sonra Faz 3 mobil işleriyle kısmen paralel hazırlanabilir; raporların final doğrulaması Faz 5 sonrasına bırakılmalı.
- `WMS-06B` dashboard görsel iskeleti, `WMS-06A` metrik kontratları belli olduktan sonra paralel ilerleyebilir.

### Paralel Yapılmaması Gerekenler

- `WMS-01A`, `WMS-01B`, `WMS-01C`, `WMS-01D` aynı anda yapılmamalı. Reservation veri modeli, pickable stok hesabı, shipment creation ve shipment confirmation aynı kontratı paylaşır; sırayla oturmalıdır.
- `WMS-01E`, `WMS-01B` bitmeden yapılmamalı. Planlama motoru gerçek reserved stok hesabını ancak DB kontratı netleşince okuyabilir.
- `WMS-02B`, `WMS-02C`, `WMS-02D`, `WMS-02A` bitmeden başlamamalı. Task/event şeması oturmadan putaway/pick görevleri farklı agentlarda uyumsuz çıkar.
- `WMS-03C`, `WMS-03D`, `WMS-03E`, `WMS-03B` Android barkod tarama motoru ve server parser kontratı tamamlanmadan başlamamalı. Aksi halde her Android ekranı kendi barkod mantığını yazar.
- `WMS-03E` Android picking, `WMS-01C`, `WMS-01D` ve `WMS-02C` tamamlanmadan yapılmamalı. Picking reservation ve pick task olmadan gerçek WMS davranışı veremez.
- `WMS-03G`, `WMS-04D` paket/barkod master data kontratı bitmeden kapatılamaz. Android paket barkodu okutunca hangi paket birimi, katsayı, hacim ve ağırlık seçildiğini server doğrulamalıdır.
- `WMS-04B`, `WMS-04A` bitmeden yapılmamalı. Karantina ekranı quality hold şemasına bağlıdır. Fotoğraf/evidence gösterimi ayrıca `WMS-03F` upload kontratına bağlanmalıdır.
- `WMS-04E`, `WMS-04D` bitmeden yapılmamalı. Stok kartı UI, ürün barkod ve paket ölçüleri şemasını tüketmelidir.
- `WMS-04F`, Merkez Depo route/sidebar ve `vehicles` master data şeması netleşmeden kapatılmamalı. Araç plaka, sıcaklık sınıfı ve kapasite bilgileri tek merkezden yönetilmelidir.
- `WMS-04G`, `WMS-04D` ve `WMS-04F` bitmeden yapılmamalı. Araç hacim/ağırlık kontrolü paket ölçülerine, sevkiyat satırı paket birimine ve merkez araç tanımlarına bağlıdır.
- `WMS-05A` ve `WMS-05B` içinde Android görev tamamlama ekranları, `WMS-03A` native `wms-android` iskeleti ve `WMS-03B` barkod tarama/server parser kontratı bitmeden kapatılamaz.
- `WMS-05B`, `WMS-02A` ve lokasyon usage type kararları netleşmeden yapılmamalı. Pick-face replenishment task motoruna ve lokasyon sınıflarına bağlıdır.
- `WMS-06A/B` final rapor/dashboard olarak Faz 1-5 verileri, `WMS-04G` kapasite hesapları ve `wms-android` kaynaklı task event metadata oturmadan kapatılmamalı. Erken başlanırsa yalnızca taslak kalabilir.

### Agent Atama Önerisi

- Agent 1: Faz 1 reservation hattı (`WMS-01A` -> `WMS-01E`) tek elde yürütülmeli.
- Agent 2: Faz 2 task motoru (`WMS-02A` -> `WMS-02D`) reservation hattı bitince başlamalı.
- Agent 3: Faz 3 native Android WMS modülü ve upload hazırlığı (`WMS-03A`, `WMS-03F`) erken başlayabilir; barkod ve operasyon ekranları task motoru bitince devam etmeli.
- Agent 4: Faz 4 kalite/traceability, Faz 2 ve `wms-android` evidence/upload kontratları netleşince başlamalı.
- Agent 5: Faz 5-6 sayım, replenishment ve raporlar, önceki fazların DB kontratlarını ve `wms-android` task event çıktısını tüketmeli.

---

## 0. Ortak Agent Protokolü

Her agent işe başlamadan önce şunları okumalı:

1. `.antigravityrules.md`
2. `SUITABLERMS_PROJECT_GOVERNANCE.md`
3. `OperationSync.md` son 20 entry
4. `docs/wms_depo_yonetim_sistemi_analiz_ve_proje_plani.md`
5. `docs/wms_fazlandirilmis_agent_gorev_tanimlari.md`
6. İlgili fazda ayrıca belirtilen dosyalar

Genel sınırlar:

- İş verisi için `localStorage`, `sessionStorage`, mock JSON veya sessiz fallback kullanma.
- Railway Postgres DB-first kuralını bozma.
- Supabase/AWS eski altyapı referansı ekleme.
- Otomatik kısa aralıklı polling ekleme.
- Faz dışı refactor yapma.
- Kullanılmayan eski kod, yorum satırına alınmış alternatif implementasyon veya pasif JSX bırakma.
- Her faz sonunda `OperationSync.md` içine net entry ekle.

Her agent finalinde şunları raporlamalı:

- Değişen dosyalar
- Eklenen migration/schema değişiklikleri
- Çalıştırılan test/build komutları
- Açık riskler
- Bir sonraki faza devredilecek net durum

---

## Faz 0 - Mevcut WMS Baseline ve Test Kilidi

### Görev WMS-00A - WMS Baseline Denetimi

Amaç: Rezervasyon/görev/mobil geliştirmelerine başlamadan mevcut WMS davranışını bozmamak için baseline çıkarmak.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/pages/DepoOrders.jsx`
- `src/components/pages/MalKabul.jsx`
- `src/components/pages/WmsLocations.jsx`
- `src/components/pages/WmsLpns.jsx`
- `src/components/pages/WmsStockParams.jsx`
- `src/components/pages/WmsInternalTransfer.jsx`
- `src/lib/branchPurchasing.js`
- `src/lib/warehouseDemandPlanning.js`
- `scratch/test_branch_purchasing_regression.js`

Yapılacaklar:

- Mevcut WMS route ve tablo listesini doğrula.
- `warehouse_replenishment` akışının şube siparişlerinden ayrıldığını doğrula.
- `availability_status` kullanımını kontrol et.
- Mevcut testleri çalıştır: `node .\scratch\test_branch_purchasing_regression.js`, `npm.cmd run build`.
- Gerekirse küçük bir `scratch/test_wms_current_contract.js` ekleyerek mevcut helper davranışlarını kilitle.

Kabul kriterleri:

- Kod değişikliği yoksa bile baseline raporu `OperationSync.md` içine yazılmış olmalı.
- Build başarılı olmalı veya mevcut hatalar net belgelenmeli.
- Sonraki fazların bozmayacağı davranışlar listelenmeli.

---

## Faz 1 - Rezervasyon Motoru ve Sevkiyat Güvenliği

### Görev WMS-01A - `warehouse_reservations` Şeması

Amaç: WMS kaynak ayırmayı DB-first ve audit edilebilir hale getirecek rezervasyon tablosunu eklemek.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `migrations/031_wms_shipments.sql`
- `migrations/032_confirm_shipment_rpc.sql`
- `server/wms_migration.js`

Yapılacaklar:

- Yeni migration oluştur: `migrations/036_add_warehouse_reservations.sql`.
- `schema-railway-master.sql` içine tablo ve indexleri ekle.
- Önerilen kolonlar:
  - `id`
  - `branch_id`
  - `stock_item_id`
  - `location_id`
  - `lpn_id`
  - `lot_number`
  - `expiration_date`
  - `source_doc_type`
  - `source_doc_id`
  - `source_line_id`
  - `reserved_qty`
  - `status`: `active`, `consumed`, `released`, `cancelled`, `expired`
  - `reserved_by`
  - `reserved_at`
  - `consumed_at`
  - `released_at`
  - `meta`
- Aktif reservation için branch/item/location/lpn/lot/SKT/source alanlarında sorgu indexleri ekle.
- `server/wms_migration.js` dosyası aktif WMS bootstrap aracı olarak kullanılıyorsa tabloyu oraya da ekle.

Kabul kriterleri:

- Migration idempotent olmalı.
- Master schema güncel olmalı.
- `git diff --check` temiz olmalı.

Test/doğrulama:

- `npm.cmd run build`
- Şema SQL'i syntax olarak kontrol edilebiliyorsa proje içi mevcut diff/verify komutu çalıştır.

### Görev WMS-01B - Net Pickable Stok RPC/View

Amaç: Client snapshot ile stok hesaplamak yerine DB tarafında `physical_available - active_reservations` hesabını üretmek.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- `src/lib/branchPurchasing.js`
- `schema-railway-master.sql`
- WMS-01A migration çıktısı

Yapılacaklar:

- DB tarafında `get_wms_pickable_stock(...)` RPC veya view tasarla.
- Hesap:
  - `inventory_movements` hareketlerinden branch/item/location/lpn/lot/SKT bazında fiziksel bakiye.
  - `meta.availability_status in ('quarantine','putaway_pending')` stokları pickable dışı.
  - `warehouse_reservations.status = 'active'` miktarlarını düş.
- `DepoOrders.jsx` içindeki kaynak gösterimini bu RPC/view sonucuna bağla.
- Client tarafındaki `findPickingSources` yardımcı mantığını mümkün olduğunca DB sonucunu tüketen sade mantığa indir.

Kabul kriterleri:

- Aynı ürün/lokasyon/LPN/lot için rezerve miktar UI'da kullanılabilir kaynak olarak görünmemeli.
- Karantina ve putaway pending stoklar pickable görünmemeli.
- Sessiz fallback olmamalı; RPC hata verirse kullanıcı net hata görmeli.

Test/doğrulama:

- Yeni pure helper varsa unit test ekle.
- `npm.cmd run build`
- `git diff --check`

### Görev WMS-01C - Sevkiyat Taslağı Oluştururken Rezervasyon

Amaç: Sevkiyat taslağı oluşturma anında kaynak seçimi ve reservation aynı DB transaction içinde yapılsın.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- `migrations/032_confirm_shipment_rpc.sql`
- `schema-railway-master.sql`

Yapılacaklar:

- Yeni RPC önerisi: `create_warehouse_shipment_with_reservations(...)`.
- RPC şunları yapmalı:
  - Aktif depo yetkisini kontrol et.
  - Seçili `purchase_orders` ve satırlarını kilitle.
  - Pickable kaynakları FEFO sıralamasıyla bul.
  - `warehouse_shipments`, `warehouse_shipment_orders`, `warehouse_shipment_lines` oluştur.
  - Her pick için `warehouse_reservations.status = active` oluştur.
  - Shipment line `meta.picks` içine reservation id'leriyle birlikte kaynakları yaz.
- `DepoOrders.jsx` shipment creation akışını bu RPC'ye bağla.

Kabul kriterleri:

- Aynı stok kaynağı iki sevkiyat taslağına fazla rezerve edilememeli.
- Yetersiz stokta taslak fail-closed hata vermeli.
- Shipment line meta içinde pick kaynakları ve reservation id'leri görülebilmeli.

Test/doğrulama:

- Mümkünse rollback transaction kullanan scratch test.
- `npm.cmd run build`

### Görev WMS-01D - Sevkiyat Onayında Reservation Consume/Release

Amaç: `confirm_warehouse_shipment` artık yalnızca shipment satırını değil, reservation kaynaklarını da doğrulayıp tüketsin.

Okunacak dosyalar:

- `migrations/032_confirm_shipment_rpc.sql`
- `schema-railway-master.sql`
- `src/components/pages/DepoOrders.jsx`

Yapılacaklar:

- `confirm_warehouse_shipment` RPC'sini güncelle.
- Aktif reservation yoksa veya miktar uyuşmuyorsa hata ver.
- `transfer_out` hareketlerini reservation kaynaklarına göre üret.
- Başarılı sevkte reservation `consumed` olsun.
- Shipment iptali için yeni release RPC veya mevcut iptal akışında reservation `released/cancelled` statüsü ekle.

Kabul kriterleri:

- Sevkiyat tekrar onaylanamaz.
- Reservation tüketilmeden stok çıkışı oluşmaz.
- İptal edilen shipment reservation bırakmaz.

Test/doğrulama:

- RPC idempotency ve hata senaryosu testleri.
- `npm.cmd run build`

### Görev WMS-01E - Depo Planlamada Rezerve Stok Entegrasyonu

Amaç: Ana depo talep planlaması gerçek rezervasyonları dikkate alsın.

Okunacak dosyalar:

- `src/lib/warehouseDemandPlanning.js`
- `src/components/pages/Orders.jsx`
- `scratch/test_wms_demand_planning.js`

Yapılacaklar:

- `reserved = 0` sabitini kaldır.
- Planlama girdisine `warehouseReservedByItem` map'i ekle.
- Depo pozisyonu:
  - `warehouseAvail + inboundYolda + expectedReturn - reserved`
- UI detay penceresinde rezerve stok kalemi göster.
- Regression testleri güncelle.

Kabul kriterleri:

- Rezerve stok depo satınalma önerisini artırabilir.
- Eski testler bozulmamalı.

Test/doğrulama:

- `node .\scratch\test_wms_demand_planning.js` varsa çalıştır.
- `node .\scratch\test_branch_purchasing_regression.js`
- `npm.cmd run build`

---

## Faz 2 - WMS Görev Motoru

### Görev WMS-02A - `warehouse_tasks` ve `warehouse_task_events` Şeması

Amaç: Putaway, pick, pack, count, move, quality gibi fiziksel işleri DB-first görev modeline almak.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `src/components/pages/Tasks.jsx`
- `src/components/pages/tasks/TaskDrawer.jsx`
- `src/components/pages/MalKabul.jsx`
- `src/components/pages/DepoOrders.jsx`

Yapılacaklar:

- Yeni migration: `migrations/037_add_warehouse_tasks.sql`.
- `warehouse_tasks` tablosu ekle.
- `warehouse_task_events` tablosu ekle.
- Status değerleri:
  - task: `pending`, `assigned`, `in_progress`, `done`, `exception`, `cancelled`
  - type: `putaway`, `pick`, `pack`, `load`, `count`, `move`, `quality`
- Task event kayıtları personel, terminal, barkod, payload ve zaman damgası içermeli.

Kabul kriterleri:

- Her WMS görev tipi için tablo şeması yeterli olmalı.
- Event tablosu audit için değişmez log gibi kullanılmalı.

Test/doğrulama:

- SQL syntax / migration kontrolü.
- `npm.cmd run build`

### Görev WMS-02B - Mal Kabulden Putaway Görevi Üretimi

Amaç: Mal kabulde `putaway_pending` seçilen ürünler otomatik putaway görevine dönüşsün.

Okunacak dosyalar:

- `src/components/pages/MalKabul.jsx`
- `src/components/pages/WmsInternalTransfer.jsx`
- `schema-railway-master.sql`

Yapılacaklar:

- Mal kabul insert sonrası `putaway_pending` hareketler için `warehouse_tasks` kaydı oluştur.
- Task kaynak alanları:
  - stock item
  - quantity
  - source movement id
  - from location: kabul/karantina/receiving alanı
  - target suggestion: default location veya rule engine sonucu
  - LPN, lot, SKT
- Putaway tamamlanmadan stok `available` sayılmamalı.
- Putaway task tamamlandığında gerekli `inventory_movements` veya status transition üretilecek tasarımı netleştir.

Kabul kriterleri:

- `putaway_pending` mal kabul satırı görev listesine düşer.
- Görev tamamlanmadan pickable stok olmaz.
- Görev tamamlanınca audit event oluşur.

Test/doğrulama:

- Manual/scratch test.
- `npm.cmd run build`

### Görev WMS-02C - Sevkiyattan Pick/Pack/Load Görevi Üretimi

Amaç: Rezerve edilen sevkiyat satırları mobilde yapılabilir pick görevlerine dönüşsün.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- Faz 1 reservation RPC'leri
- Faz 2 task şeması

Yapılacaklar:

- Sevkiyat taslağı oluşunca reservation kaynaklarına göre `pick` task üret.
- Branch/order bazlı pack/load task opsiyonunu ekle.
- Pick tamamlanmadan shipment `ready_to_load` veya `in_transit` olamasın.
- Eksik toplama durumunda task `exception` veya partial done statüsüne düşsün.

Kabul kriterleri:

- Her shipment line pick kaynağının karşılığı task olarak izlenebilir.
- Görev tamamlanmadan sevkiyat onayı engellenir.
- Kısmi toplama shipment fill-rate raporuna veri bırakır.

Test/doğrulama:

- `npm.cmd run build`
- Sevkiyat taslağı -> task -> onay guard senaryosu.

### Görev WMS-02D - WMS Görev Web Ekranı

Amaç: Mobil fazdan önce web üzerinden görevleri izlemek ve exception yönetmek.

Okunacak dosyalar:

- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/pages/Tasks.jsx`
- `src/components/pages/DepoOrders.jsx`

Yapılacaklar:

- Yeni ekran: `src/components/pages/WmsTasks.jsx`.
- Route önerisi: `/wms-tasks` veya mevcut `/depo-tasks` içine WMS mode.
- Liste alanları:
  - task no
  - type
  - status
  - product
  - qty
  - source/target location
  - LPN
  - lot/SKT
  - assigned staff/terminal
  - exception reason
- Web üzerinden sadece izleme ve kontrollü exception çözümü yapılmalı; fiziksel tamamlama mobil faza bırakılmalı.

Kabul kriterleri:

- WMS görevleri webde izlenebilir.
- Exception task'lar filtrelenebilir.
- Yetkisiz/global bağlam fallback yok.

Test/doğrulama:

- `npm.cmd run build`

---

## Faz 3 - Native Android WMS Uygulaması

Bu fazda yapılacak iş **web route, responsive ekran, WebView veya PWA simülasyonu değildir**. Teslimat ve toplama operasyonları için gerçek Android uygulaması yapılacaktır. WMS mobil uygulaması proje kökünde, mevcut `personel-android` ve `musteri-android` klasörleriyle aynı seviyede, ayrı `wms-android` klasörü olarak oluşturulacaktır.

Kesin uygulama yolu:

- Windows mutlak yol: `C:\RMSv3\wms-android`
- Repo içi yol: `wms-android/`
- Android package önerisi: `com.suitable.wms`
- Ana kaynak yolu: `wms-android/app/src/main/java/com/suitable/wms/`

`personel-android` projesi Kotlin/Jetpack Compose, Retrofit/Gson, Coroutines ve ZXing QR/barcode altyapısı açısından referans/şablon olarak incelenecektir; ancak WMS uygulaması `personel-android` içine gömülmeyecek ve ayrı APK olarak `wms-android` altında teslim edilecektir.

Android uygulama DB'ye doğrudan bağlanmayacak; Railway API (`VITE_API_URL` ile aynı backend ailesi) üzerinden konuşacaktır. API erişimi fail-closed olmalı, offline/local queue yazılmamalıdır. Ağ yoksa görev tamamlanmış gibi davranılamaz.

Önemli revizyon: `src/components/pages/WmsMobile.jsx`, `/wms-mobile`, `/depo-mobile`, WebRTC kamera önizlemesi, dropdown barkod simülasyonu veya responsive web ekranı bu fazın kabul kriteri değildir. Bunlar en fazla UX/prototip referansı olarak incelenebilir; gerçek WMS mobil teslimatı `wms-android` altında native Android APK olarak yapılmalıdır.

### Görev WMS-03A - Native Android WMS Modülü ve Görevlerim

Amaç: Depo personelinin gerçek Android cihazda kullanacağı ayrı WMS Android uygulamasını proje kökünde `wms-android` klasörü olarak oluşturmak.

Okunacak dosyalar:

- `personel-android/HANDOFF.md` (referans mimari)
- `personel-android/app/build.gradle.kts` (referans Gradle/Kotlin/Compose bağımlılıkları)
- `personel-android/app/src/main/AndroidManifest.xml` (referans kamera/izin yapısı)
- `personel-android/app/src/main/java/com/suitable/personel/MainActivity.kt` (referans app entry)
- `personel-android/app/src/main/java/com/suitable/personel/Navigation.kt` (referans navigation)
- `personel-android/app/src/main/java/com/suitable/personel/data/ApiClient.kt` (referans Retrofit yapılandırması)
- `personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt` (referans Compose ekran düzeni)
- `personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt` (referans görev ekranı)
- `wms-android/HANDOFF.md`
- Oluşturulacak hedef klasör: `wms-android/`
- Faz 2 çıktıları: `warehouse_tasks`, `warehouse_task_events`, WMS task API endpointleri

Yapılacaklar:

- Proje kökünde `wms-android` klasörünü oluştur.
- `wms-android` içinde bağımsız Gradle Android application projesi kur:
  - package önerisi: `com.suitable.wms`
  - app adı: `Suitable WMS`
  - Kotlin/Jetpack Compose
  - Retrofit/Gson
  - Coroutines
  - ZXing barcode/QR tarama
- `wms-android` içinde WMS ana menüsü ve Compose navigation route'ları ekle.
- Ekranlar:
  - `WmsTaskListScreen`
  - `WmsReceivingScreen`
  - `WmsPutawayScreen`
  - `WmsPickingScreen`
  - `WmsPackLoadScreen`
  - `WmsCountScreen`
- Retrofit repository ekle:
  - `WmsRepository`
  - `WmsApiService`
  - DTO modelleri: task, event, scan request, scan response, exception, evidence.
- PIN/personel bağlamı backend API'den veya mevcut personel auth kontratından alınmalı; kullanıcı auth icat edilmemeli.
- Aktif Ana Depo bağlamı API'den gelmeli; sabit depo fallback olmamalı.
- Her task listesi server'daki `warehouse_tasks` kaynağından gelmeli.

Kabul kriterleri:

- `wms-android` gerçek cihaz/emülatörde açılır ve WMS görev listesi API'den gelir.
- `personel-android` veya `musteri-android` içine WMS kodu gömülmez.
- Uygulama WebView/PWA değildir.
- Offline/local queue yoktur; ağ hatasında net hata gösterir.
- Görev tamamlanmış gibi yerel state ile kandırma yoktur.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- `cd wms-android; .\gradlew.bat test`
- Android Studio veya emulator ile WMS görev listesi smoke test.

### Görev WMS-03B - Android Barkod Tarama Motoru ve Server Parser Kontratı

Amaç: Android uygulamadaki tüm WMS ekranları aynı barkod tarama ve server doğrulama kontratını kullansın.

Okunacak dosyalar:

- `wms-android/app/build.gradle.kts`
- `wms-android/app/src/main/AndroidManifest.xml`
- `wms-android/app/src/main/java/com/suitable/wms/ui/main/HomeScreen.kt`
- `wms-android/app/src/main/java/com/suitable/wms/ui/scan/*`
- `wms-android/app/src/main/java/com/suitable/wms/data/ApiClient.kt`
- `schema-railway-master.sql`
- Faz 2 `warehouse_task_events` şeması

Yapılacaklar:

- Mevcut ZXing `ScanContract` / `ScanOptions` altyapısını WMS için ortak hale getir.
- Android tarafında tek giriş noktası:
  - `WmsBarcodeScanner`
  - `WmsScanViewModel`
  - `WmsScanResult`
- Server tarafında parser/doğrulama endpointleri tasarla veya mevcut API'ye ekle:
  - ürün/GTIN
  - LPN/SSCC
  - lokasyon barkodu
  - lot/SKT payload
  - task expected source/target kontrolü
- Android parser sadece ilk ayrıştırmayı yapabilir; kesin doğrulama server tarafından yapılmalı.
- Her başarılı/başarısız okutma `warehouse_task_events` içine yazılmalı.

Kabul kriterleri:

- Yanlış lokasyon barkodu server tarafından reddedilir.
- Yanlış ürün/LPN/lot server tarafından reddedilir.
- Android ekranları kendi barkod doğrulama mantığını tekrar yazmaz.
- Kamera izni manifest ve runtime permission olarak çalışır.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Android scanner smoke test.
- Server parser için `scratch/test_wms_barcode_parser.js` veya API smoke testi.

### Görev WMS-03C - Android Barkodlu Mal Kabul

Amaç: Teslimatlar gerçek Android cihazda barkodla teslim alınsın.

Okunacak dosyalar:

- `wms-android/app/src/main/java/com/suitable/wms/data/ApiClient.kt`
- `wms-android/app/src/main/java/com/suitable/wms/ui/main/*`
- `server/index.js`
- `src/components/pages/MalKabul.jsx`
- Faz 2 receiving/putaway task API'leri

Yapılacaklar:

- `WmsReceivingScreen` oluştur.
- Akış:
  - görev veya PO/irsaliye seç
  - PO/irsaliye barkodu okut
  - ürün barkodu okut
  - LPN/palet barkodu okut veya yeni LPN oluştur
  - lot/SKT/miktar gir veya okut
  - ürün fotoğrafını göster
  - kabul, karantina, red/hasarlı kararını gönder
- Android tarafı server'a `scan + confirm` istekleri atmalı.
- Server başarılı dönmeden task/line tamamlanmış sayılmamalı.
- Hasar/eksik/fazla durumunda evidence fotoğrafı zorunlu yapılabilir.

Kabul kriterleri:

- Barkod doğrulaması olmadan mal kabul tamamlanamaz.
- Ürün fotoğrafı varsa Android ekranda görünür.
- Ağ/API hatasında işlem fail-closed kalır.
- Başarılı kabul DB'de `inventory_movements`, task status ve task events üretir.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Canlı/staging API ile transaction veya test fixture smoke.
- Kamera, ürün fotoğrafı ve hata senaryosu manuel test.

### Görev WMS-03D - Android Putaway

Amaç: Personel Android cihazda hedef lokasyona yönlendirilsin, lokasyon barkodu okutmadan putaway tamamlanamasın.

Okunacak dosyalar:

- `wms-android/app/src/main/java/com/suitable/wms/ui/main/*`
- `wms-android/app/src/main/java/com/suitable/wms/data/*`
- `src/components/pages/WmsInternalTransfer.jsx`
- `src/components/pages/WmsLocations.jsx`
- `src/components/pages/WmsStockParams.jsx`
- Faz 2 putaway task API'leri

Yapılacaklar:

- `WmsPutawayScreen` oluştur.
- Android ekranda göster:
  - ürün fotoğrafı
  - ürün adı/SKU/birim
  - LPN
  - lot/SKT
  - miktar
  - önerilen hedef lokasyon
- Hedef lokasyon barkodu okutulmadan tamamlanmasın.
- Yanlış lokasyon okutulursa server hata dönmeli ve event yazılmalı.
- Başarılı putaway server tarafından status transition ve movement/event üretmeli.

Kabul kriterleri:

- Putaway pending stok, doğru lokasyon barkodu okutulduktan sonra available olur.
- Yanlış lokasyon task tamamlatmaz.
- Android sadece server cevabıyla task done gösterir.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Doğru/yanlış lokasyon barkodu manuel test.

### Görev WMS-03E - Android Lokasyon Yönlendirmeli Picking

Amaç: Şube siparişleri Android cihazda lokasyon yönlendirmesiyle toplansın.

Okunacak dosyalar:

- `wms-android/app/src/main/java/com/suitable/wms/ui/main/*`
- `wms-android/app/src/main/java/com/suitable/wms/data/*`
- `src/components/pages/DepoOrders.jsx`
- Faz 1 reservation RPC'leri
- Faz 2 pick task API'leri

Yapılacaklar:

- `WmsPickingScreen` oluştur.
- Android ekranda sıradaki toplama kaynağı göster:
  - lokasyon adresi
  - lokasyon barkodu
  - LPN
  - ürün fotoğrafı
  - ürün adı/SKU/birim
  - lot/SKT
  - toplanacak miktar
- Akış:
  - lokasyon barkodu okut
  - ürün veya LPN barkodu okut
  - miktar onayla
  - kısmi toplama / eksik stok exception gönder
- Server reservation ve pick task kontratına göre doğrulama yapmalı.
- Pick tamamlanmadan pack/load aşaması açılmamalı.

Kabul kriterleri:

- Yanlış lokasyon veya yanlış ürünle task tamamlanamaz.
- Kısmi toplama shipment line/fill-rate verisini etkiler.
- Android ekranda ürün fotoğrafı ve lokasyon yönlendirmesi vardır.
- İşlem server onayı olmadan yerelde done olmaz.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Doğru/yanlış lokasyon, doğru/yanlış ürün, kısmi toplama manuel testleri.

### Görev WMS-03F - Android Fotoğraf Kanıtı ve Dosya Upload Entegrasyonu

Amaç: Ürün fotoğrafı gösterimi ve kanıt fotoğrafı yükleme Android uygulamada gerçek upload ile çalışsın.

Okunacak dosyalar:

- `wms-android/app/src/main/AndroidManifest.xml`
- `wms-android/app/build.gradle.kts`
- `wms-android/app/src/main/java/com/suitable/wms/data/ApiClient.kt`
- `server/index.js`
- Mevcut upload/file endpointleri
- `src/components/pages/StockItems.jsx`
- Faz 2 task event API'leri

Yapılacaklar:

- Android kamera/gallery izinlerini ekle.
- Compose içinde kanıt fotoğrafı çekme/seçme UI'ı yap.
- Retrofit multipart upload ekle.
- Server tarafında WMS evidence upload endpointi yoksa `UPLOAD_DIR` ve `/api/files/...` kuralına uygun endpoint ekle.
- Upload sonucu dönen dosya yolu `warehouse_task_events.payload` içinde saklanmalı.
- Ürün fotoğrafı Android tarafında `image_url` ile gösterilmeli; görsel yoksa profesyonel placeholder kullanılmalı.

Kabul kriterleri:

- Kanıt fotoğrafı gerçekten Railway Volume `UPLOAD_DIR` altında saklanır.
- DB'de sadece erişim yolu tutulur.
- Android'de fotoğraf yüklenmeden zorunlu exception task tamamlanamaz.
- Dosya yoksa UI bozulmaz.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Upload endpoint smoke testi.
- Android cihaz/emulator ile fotoğraf çek/yükle/görüntüle testi.

### Görev WMS-03G - Android Paket Barkodu, Ölçü/Ağırlık ve Yük Önizleme

Amaç: Android WMS ekranlarında ürün barkodu okutulduğunda yalnızca stok kalemi değil, hangi paketleme biriminin okutulduğu, bu birimin miktar katsayısı, hacmi ve ağırlığı da görülsün.

Bağımlılıklar:

- `WMS-03B` Android barkod tarama motoru ve server parser kontratı
- `WMS-04D` ürün barkod ve paketleme master data şeması
- `WMS-04G` araç kapasite hesap API/view kontratı

Okunacak dosyalar:

- `wms-android/HANDOFF.md`
- `wms-android/app/src/main/java/com/suitable/wms/ui/scan/*`
- `wms-android/app/src/main/java/com/suitable/wms/ui/main/*`
- `wms-android/app/src/main/java/com/suitable/wms/data/*`
- `server/index.js`
- `src/components/pages/StockItems.jsx`

Yapılacaklar:

- Barkod okutma sonucu Android'e şu bilgiler dönmeli:
  - `stock_item_id`
  - ürün adı/SKU/fotoğraf
  - `package_unit_id`
  - paket birimi adı ve sembolü
  - ana birime çevrim katsayısı
  - paket barkodu
  - en, boy, yükseklik
  - hacim
  - brüt ağırlık
- Mal kabul, picking, pack/load, sayım ve replenishment ekranları bu paket bilgisini ortak bileşenle göstermeli.
- Pack/load ekranında seçili sevkiyat ve araç varsa Android şu özetleri göstermeli:
  - sevkiyat toplam hacim
  - sevkiyat toplam brüt ağırlık
  - araç hacim kapasitesi
  - araç ağırlık kapasitesi
  - kalan/taşan kapasite
- Android kapasite hesabını kendisi nihai karar olarak kullanmamalı; server'ın capacity check sonucunu göstermeli.
- Kapasite aşımı varsa Android task'ı tamamlatmamalı, server hata mesajını inline göstermeli.

Kabul kriterleri:

- Ürün barkodu okutulduğunda doğru paket birimi ve katsayı server tarafından doğrulanır.
- Paket ölçü/ağırlık bilgisi yoksa kullanıcıya eksik master data uyarısı gösterilir.
- Kapasite aşımı server tarafından fail-closed reddedilir.
- Android yerel hesapla task done göstermez.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Android'de adet/koli/paket barkodu okutma manuel testi.
- Araç kapasitesi dolu/aşılmış/yeterli senaryoları API smoke testi.

---

## Faz 4 - Kalite, Karantina ve Lot İzlenebilirliği

### Görev WMS-04A - Kalite Hold Şeması

Amaç: Karantina, release, reject ve scrap süreçlerini ayrı kalite kaydıyla izlemek.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `src/components/pages/MalKabul.jsx`
- `src/components/pages/InventoryOperationRecord.jsx`
- `wms-android/HANDOFF.md`
- `WMS-03F` Android evidence/upload kontratı

Yapılacaklar:

- Yeni migration: sıradaki boş migration numarasıyla `add_warehouse_quality_holds.sql`. Sabit `038` numarası kullanma; Faz 1 tarafında migration numaraları ilerlemiş olabilir.
- `warehouse_quality_holds` tablosu ekle.
- Karantina hareketleri quality hold oluşturmalı.
- Android mal kabul/exception fotoğraflarının tutulduğu `warehouse_task_events.payload` dosya yollarıyla ilişki kurulmalı.
- Quality hold kaydı, gerekiyorsa kaynak `warehouse_task_id`, kaynak event ve evidence path referanslarını taşımalı.

Kabul kriterleri:

- Karantina stok pickable değildir.
- Release/reject/scrap eventleri audit edilebilir.
- Android'den gelen hasar/eksik/fazla evidence kaydı quality hold ekranında izlenebilir veri üretir.

### Görev WMS-04B - Karantina Yönetim Ekranı

Amaç: Kalite bekleyen stoklar web panelden yönetilsin.

Yapılacaklar:

- Yeni ekran: `WmsQuality.jsx`.
- Karantina stokları listele.
- Release, reject, scrap aksiyonları.
- `wms-android` tarafından yüklenen fotoğraf ve notları `warehouse_task_events.payload` veya quality hold evidence ilişkisinden göster.
- Web panel yalnızca kalite kararı verir; fiziksel barkod okutma veya mobil task tamamlama işini taklit etmez.

Kabul kriterleri:

- Release olmadan available'a geçiş yok.
- Reject/scrap stok hareketi üretir.
- Fotoğraf yoksa panel bozulmaz; varsa Railway file endpointinden gösterilir.
- Web karantina ekranı, `wms-android` görevlerinin yerini almaz.

### Görev WMS-04C - Lot/SKT Traceability Raporu

Amaç: Hangi lot hangi şubeye sevk edildi görülebilsin.

Yapılacaklar:

- Lot/SKT bazlı hareket raporu.
- Shipment ve branch ilişkisi.
- Android scan/task event geçmişiyle hangi lokasyonda, hangi cihaz/personel tarafından okutuldu bilgisi.
- Geri çağırma listesi çıktısı.

Kabul kriterleri:

- Lot numarasıyla sevk edilen şubeler listelenir.
- Android okutma eventleri varsa traceability zaman çizelgesinde görünür.

---

## Faz 4.5 - Ürün Barkod, Paketleme Ölçüleri ve Araç Kapasite Kontrolü

Bu faz, Faz 4 kalite/traceability sonrasında ve Faz 5 sayım/ikmal öncesinde yapılmalıdır. Mobil uygulama bitmeden DB şeması tasarlanabilir; ancak Android paket barkodu ve pack/load ekranları `WMS-04D`, `WMS-04F` ve `WMS-04G` kontratları olmadan tamamlandı sayılmamalıdır.

### Görev WMS-04D - Ürün Barkod ve Paketleme Master Data Şeması

Amaç: WMS barkod, paket birimi, ölçü, hacim ve ağırlık bilgisini DB-first ve raporlanabilir hale getirmek.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `server/wms_migration.js`
- `src/components/pages/StockItems.jsx`
- `server/index.js`
- Mevcut `product_external_barcodes` tablosu
- Mevcut `stock_items.packaging_units` JSONB alanı

Yapılacaklar:

- `stock_items` içine tek bir `barcode` alanı açma. Bir ürünün adet, paket, koli, kasa, palet ve tedarikçi barkodu gibi birden fazla barkodu olabilir.
- Mevcut `product_external_barcodes` tablosunu WMS için genişlet veya ilişkili yeni tablo oluştur.
- Önerilen normalize tablo: `stock_item_package_units`
  - `id`
  - `stock_item_id`
  - `unit_name`
  - `unit_symbol`
  - `base_unit_name`
  - `base_quantity`
  - `level_no`
  - `is_base_unit`
  - `is_default_receiving_unit`
  - `is_default_picking_unit`
  - `is_default_shipping_unit`
  - `length_cm`
  - `width_cm`
  - `height_cm`
  - `gross_weight_kg`
  - `net_weight_kg`
  - `volume_m3`
  - `active`
  - `created_at`
  - `updated_at`
- `volume_m3` DB tarafında hesaplanmalı veya generated/view alanı olarak türetilmeli: `(length_cm * width_cm * height_cm) / 1000000`.
- `product_external_barcodes` için önerilen ek alanlar:
  - `package_unit_id`
  - `barcode_type`: `EAN13`, `GTIN14`, `SUPPLIER`, `INTERNAL`, `SSCC`
  - `unit_type`
  - `unit_multiplier`
  - `is_primary`
  - `is_approved`
  - `active`
- Barkod unique kuralı aktif barkodlar için fail-closed olmalı; aynı barkod iki ürüne/paket birimine bağlanmamalı.
- Mevcut `stock_items.packaging_units` JSONB alanı varsa geriye dönük uyumluluk için okunabilir, ancak WMS kapasite ve barkod hesaplarında tek kaynak normalize tablo olmalıdır.
- Server barkod parser ürün eşleşmesini şu sırayla yapmalı:
  - lokasyon barkodu
  - LPN/SSCC
  - onaylı ürün/paket barkodu
  - lot/SKT payload
  - `stock_items.sku` yalnızca manuel ürün kodu fallback olarak, barkod gibi değil

Kabul kriterleri:

- Bir stok kalemine birden fazla barkod ve paket birimi bağlanabilir.
- Her paket birimi için en, boy, yükseklik, brüt ağırlık ve hacim bilgisi tutulur.
- Onaylanmamış barkod WMS görevini tamamlatmaz.
- WMS kapasite hesabı `stock_items.packaging_units` JSONB alanına bağımlı kalmaz.

Test/doğrulama:

- Migration idempotent olmalı.
- `scratch/test_wms_barcode_package_units.js` veya denk API smoke testi.
- `git diff --check`
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------
### Görev WMS-04E - Stok Kartı Paket Ölçüleri ve Barkod Yönetimi UI

Amaç: Stok malı düzenleme ekranında her paketleme birimi için barkod, en, boy, yükseklik ve ağırlık girilebilsin.

Okunacak dosyalar:

- `src/components/pages/StockItems.jsx`
- `schema-railway-master.sql`
- `server/index.js`
- `WMS-04D` şema çıktısı

Yapılacaklar:

- Stok kartı `Ölçüm & Paketleme` bölümünü genişlet.
- Her paketleme satırında şu alanlar olmalı:
  - paket birimi
  - önceki/ana birime göre miktar katsayısı
  - barkod veya barkodlar
  - barkod tipi
  - birincil barkod seçimi
  - en
  - boy
  - yükseklik
  - brüt ağırlık
  - net ağırlık
  - otomatik hesaplanan hacim
- Ölçü birimleri net olmalı:
  - boyut: cm
  - ağırlık: kg
  - hacim: m3
- UI, mevcut örnekteki paketleme hiyerarşisini korumalı; ancak dar alanda taşma yapmayacak şekilde satır detaylarını genişletilebilir panel veya kompakt grid ile göstermeli.
- Kaydetme DB-first olmalı; stok kartı kaydedildiğinde normalize `stock_item_package_units` ve barkod tabloları güncellenmeli.
- Barkod çakışması, eksik ölçü veya negatif/sıfır değerlerde fail-closed hata gösterilmeli.

Kabul kriterleri:

- Kullanıcı koli/paket/kasa gibi her paketleme birimi için ölçü ve ağırlık girebilir.
- Hacim otomatik hesaplanır ve kullanıcıya gösterilir.
- Aynı barkod iki farklı ürüne bağlanamaz.
- Stok kartı kayıt hatasında sessiz fallback veya kısmi local state yoktur.

Test/doğrulama:

- `npm.cmd run build`
- Paket birimi ekle/sil/güncelle manuel UI testi.
- Barkod duplicate ve eksik ölçü hata testi.

### Görev WMS-04F - Merkez Depo Araç Tanımları

Amaç: Merkez Depo içinde sevkiyatlarda kullanılacak araçlar tek master ekrandan tanımlansın; sevkiyat, Android yükleme ve rapor ekranları araç bilgisini buradan alsın.

Okunacak dosyalar:

- `migrations/031_wms_shipments.sql`
- `schema-railway-master.sql`
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/pages/DepoOrders.jsx`
- `server/index.js`
- `SUITABLERMS_PROJECT_GOVERNANCE.md`

Yapılacaklar:

- `vehicles` tablosunu araç master data için genişlet:
  - `plate_number`
  - `vehicle_code`
  - `display_name`
  - `model`
  - `vehicle_type`: `truck`, `van`, `pickup`, `container`, `other`
  - `temperature_class`: `dry`, `cold`, `frozen`, `multi_temp`
  - `max_volume_m3`
  - `max_weight_kg`
  - `inner_length_cm`
  - `inner_width_cm`
  - `inner_height_cm`
  - `driver_name`
  - `driver_phone`
  - `branch_id` veya `home_warehouse_branch_id`
  - `active`
  - `capacity_notes`
- Merkez Depo altında yeni web ekranı ekle:
  - önerilen dosya: `src/components/pages/WmsVehicles.jsx`
  - önerilen route: `/depo-araclar` veya `/wms-vehicles`
  - Sidebar içinde Ana Depo/WMS grubuna bağla.
- Araç tanımları ekranında şu işlevler olmalı:
  - araç ekle/düzenle/pasifleştir
  - plaka tekil kontrolü
  - sıcaklık sınıfı seçimi: kuru, soğuk, donuk, çok sıcaklıklı
  - iç ölçülerden hacim otomatik hesaplama
  - manuel hacim kapasitesi varsa iç ölçülerle tutarsızlık uyarısı
  - ağırlık kapasitesi zorunlu alan
  - aktif/pasif filtre
- `DepoOrders.jsx`, sevkiyat oluştururken araç listesini bu master kaynaktan okumalı; hard-coded araç veya serbest metin araç girişi olmamalı.
- Android pack/load ekranı da araç seçimini/özetini bu API kaynağından almalı.
- Araç sıcaklık sınıfı, ürün/paket sıcaklık gereksinimi veya lokasyon sıcaklık sınıfı ile uyumsuzsa sonraki kapasite/uygunluk kontrolünde fail-closed kullanılmak üzere veri üretmeli.

Kabul kriterleri:

- Merkez Depo menüsünde araç tanımları ekranı vardır.
- Plaka tekildir ve araç pasifleştirme silme yerine kullanılır.
- Hacim ve ağırlık kapasitesi olmayan aktif araç sevkiyat için kullanılabilir görünmez veya net eksik master data uyarısı verir.
- Sevkiyat ekranı, Android ve raporlar araç listesini `vehicles` master datasından alır.
- `localStorage/sessionStorage` veya statik araç listesi kullanılmaz.

Test/doğrulama:

- `npm.cmd run build`
- Araç ekle/düzenle/pasifleştir manuel UI testi.
- Plaka duplicate ve eksik kapasite hata testi.
- Sevkiyat ekranında yalnızca aktif/uygun araçların listelendiği smoke test.

### Görev WMS-04G - Araç Hacim/Ağırlık Kapasite Kontrolü

Amaç: Sevkiyat planlanırken ve yükleme tamamlanırken seçili aracın hacim ve ağırlık kapasitesi DB tarafında kontrol edilsin.

Okunacak dosyalar:

- `migrations/031_wms_shipments.sql`
- `schema-railway-master.sql`
- `src/components/pages/DepoOrders.jsx`
- `server/index.js`
- `WMS-04D` paket ölçüleri şema çıktısı
- `WMS-04F` Merkez Depo araç tanımları çıktısı
- `WMS-03G` Android yük önizleme kontratı

Yapılacaklar:

- Araç hacim/ağırlık ve sıcaklık sınıfı bilgisi `WMS-04F` araç master datasından okunmalı; sevkiyat ekranı veya Android tarafında ayrı araç kapasitesi girilmemeli.
- Sevkiyat satırlarında hangi paket birimiyle yüklendiği izlenmeli:
  - `package_unit_id`
  - `package_qty`
  - `base_qty`
  - `line_volume_m3`
  - `line_gross_weight_kg`
- DB tarafında kapasite hesap view/RPC oluştur:
  - `get_warehouse_shipment_capacity(shipment_id)`
  - veya `v_warehouse_shipment_capacity`
- Hesap, sevkiyat satırındaki paket birimi ve miktarı üzerinden toplam hacim/ağırlık üretmeli.
- Sevkiyat oluşturma, pack/load veya confirm aşamasında araç kapasitesi aşılırsa fail-closed hata dönmeli.
- Araç sıcaklık sınıfı ile sevk edilecek ürün/paket gereksinimi uyumsuzsa fail-closed veya yetkili override isteyen uyarı dönmeli.
- Kapasite aşımı için yönetici override gerekiyorsa ayrı yetki ve audit event ile tasarlanmalı; sessiz override olmamalı.
- Web sevkiyat ekranı ve Android pack/load ekranı aynı server kapasite sonucunu göstermeli.

Kabul kriterleri:

- Araç seçildiğinde toplam hacim ve ağırlık kapasiteye göre gösterilir.
- Kapasite aşımı sevkiyat/yükleme onayını engeller.
- Kapasite hesabı client tarafında nihai karar olarak yapılmaz; DB/API sonucu esas alınır.
- Araç kapasitesi, sıcaklık sınıfı veya aktiflik bilgisi eksik araçta sistem net eksik master data uyarısı verir.

Test/doğrulama:

- Kapasite yeterli, kapasite aşımı ve araç kapasitesi eksik senaryoları için scratch/API testi.
- `npm.cmd run build`
- `cd wms-android; .\gradlew.bat assembleDebug` yalnızca `WMS-03G` Android entegrasyonu bu fazla birlikte yapılıyorsa.

---

## Faz 5 - Cycle Count ve Pick-Face Replenishment

### Görev WMS-05A - WMS Cycle Count Görevleri

Amaç: Sayım, WMS görev motoruna bağlansın.

Okunacak dosyalar:

- `src/components/pages/Count.jsx`
- `src/components/pages/WmsLocations.jsx`
- `wms-android/HANDOFF.md`
- `wms-android/app/src/main/java/com/suitable/wms/ui/main/*`
- `wms-android/app/src/main/java/com/suitable/wms/ui/scan/*`
- Faz 2 task tabloları

Yapılacaklar:

- Lokasyon/LPN/ürün bazlı sayım görevi oluştur.
- `wms-android` içinde `WmsCycleCountScreen` oluştur.
- Android sayım ekranında lokasyon, LPN ve ürün barkodunu `WMS-03B` ortak scanner/parser kontratıyla okut.
- Sayım sonucu server API'ye gönderilmeli; Android yerelde stok farkı yazmamalı.
- Farkları onay kuyruğuna gönder.
- Onaydan sonra `stock_count_gain/loss` hareketi üret.

Kabul kriterleri:

- Sayım farkı doğrudan sessiz stok düzeltmez.
- Fark için neden ve onay kaydı vardır.
- `wms-android` scan olmadan sayım görevi tamamlanamaz.
- Ağ/API hatasında Android ekranı task done göstermez.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Doğru/yanlış lokasyon, LPN ve ürün barkodu manuel sayım testi.
- Server sayım farkı/onay kuyruğu smoke testi.

### Görev WMS-05B - Pick-Face Replenishment

Amaç: Reserve lokasyondan pick-face lokasyona ikmal görevleri üretmek.

Okunacak dosyalar:

- `src/components/pages/WmsLocations.jsx`
- `src/components/pages/WmsStockParams.jsx`
- `src/lib/branchPurchasing.js`
- `wms-android/HANDOFF.md`
- `wms-android/app/src/main/java/com/suitable/wms/ui/main/*`
- Faz 2 task tabloları
- `WMS-03D` Android putaway ekranı ve server kontratı

Yapılacaklar:

- Lokasyon usage type değerlerini kullan.
- Pick-face min/max parametrelerini tasarla.
- Eksik pick-face için replenishment task üret.
- `wms-android` içinde replenishment move/putaway akışını `WMS-03D` ekran/pattern üzerinden tamamlat.
- Kaynak reserve lokasyon ve hedef pick-face lokasyon barkodu server tarafından doğrulanmalı.

Kabul kriterleri:

- Pick-face eksikliği task önerisi üretir.
- Reserve stok yoksa net uyarı oluşur.
- Replenishment görevi Android lokasyon barkodu okutulmadan tamamlanamaz.
- Yanlış kaynak/hedef lokasyon server tarafından reddedilir.

Test/doğrulama:

- `cd wms-android; .\gradlew.bat assembleDebug`
- Doğru/yanlış kaynak ve hedef lokasyon barkodu manuel test.
- Replenishment task üretim API smoke testi.

---

## Faz 6 - Raporlama ve Yönetim

### Görev WMS-06A - WMS Operasyon Raporları

Amaç: Depo yöneticisi WMS sağlığını tek yerden görebilsin.

Raporlar:

- Available / reserved / quarantine / putaway pending stok
- Lokasyon doluluk
- LPN içerik ve hareket geçmişi
- Açık görevler
- Exception görevler
- `wms-android` scan, evidence upload, cihaz/personel ve app version eventleri
- Araç hacim/ağırlık kapasite kullanımı
- Eksik paket ölçüsü veya eksik araç kapasitesi master data uyarıları
- Sevkiyat fill-rate
- Geç sevkiyat
- Personel görev performansı
- SKT yaklaşan ürünler

Kabul kriterleri:

- Raporlar DB'den gelir.
- Polling yok; manuel yenileme butonu olmalı.
- Mobil performans metrikleri yalnızca `warehouse_task_events` ve server kayıtlarından türetilir; Android lokal state rapor kaynağı olamaz.

### Görev WMS-06B - WMS Dashboard

Amaç: Ana Depo giriş ekranı olarak hızlı operasyon paneli oluşturmak.

Yapılacaklar:

- KPI bandı:
  - bekleyen mal kabul
  - açık putaway
  - açık pick
  - exception
  - Android bekleyen/eşleşmeyen scan eventleri
  - evidence upload hataları
  - kapasite aşan sevkiyatlar
  - paket ölçüsü eksik ürünler
  - bugün sevk
  - karantina stok
- Manuel yenileme.
- İlgili ekrana drill-down.

Kabul kriterleri:

- Dashboard karar destek ekranı olur, işlem tamamlamaz.
- `wms-android` görevlerinin yerini almaz.
- Dashboard üzerinden barkod okutma, task done veya evidence upload simülasyonu yapılmaz.

---

## Son Not

Bu dosyadaki en üst bölüm, agent koordinasyonu için bağlayıcı kabul edilmelidir. Faz detayları görev kapsamını anlatır; paralellik ve sıra kararlarında her zaman "En Baştaki Yürütme Sırası ve Paralellik Kuralları" bölümü esas alınır.
