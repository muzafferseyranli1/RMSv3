# Walkthrough: WMS Phase 4 & Phase 5 - Kalite, Karantina, Barkod, Araç Yönetimi, Sayım Görevleri ve Tedarikçi İzolasyonu (WMS-04A - WMS-05B)

Bu belgede WMS Faz 4 ve Faz 5 kapsamında gerçekleştirilen kalite hold şeması, karantina yönetim ekranı, lot izlenebilirlik raporu, ürün barkod/paketleme master data entegrasyonu, Stok Kartı düzenleme ekranına (UI) boyut/ağırlık/çoklu barkod yönetim özelliklerinin kazandırılması, Merkez Depo araç yönetim ekranı, sevkiyat kapasite/sıcaklık kontrol mekanizmaları, WMS Sayım (Cycle Count) görevleri, sayım fark onay kuyruğu ve depo ikmal siparişlerinin tedarikçi panelinden tamamen izole edilmesi entegrasyonları anlatılmaktadır.

---

## Yapılan Değişiklikler

### 1. Veritabanı ve Migration Katmanı (WMS-04A - WMS-05B)
- **`warehouse_quality_holds` Tablosu (`047`)**: Karantina (`hold`), kabul (`released`), ret (`rejected`) ve fire/hurda (`scrapped`) süreçlerini izlemek üzere oluşturuldu.
- **Otomatik Karantina Trigger'ı (`after_inventory_movement_quarantine`)**: `inventory_movements` tablosuna `availability_status = 'quarantine'` olan bir giriş hareketi eklendiğinde tetiklenir. Android task event metasındaki ve exception'daki kanıt resimlerini (`evidence_photo_url`) otomatik yakalayarak kalite hold kaydına bağlar.
- **Kalite Çözümleme Fonksiyonu (`resolve_warehouse_quality_hold`)**: Kalite kontrol memurunun hold statüsünü `release`, `reject` veya `scrap` yapabilmesi için atomik RPC tanımlandı. Bu RPC, stoku karantinadan düşüren transfer hareketlerini otomatik olarak oluşturarak audit izi bırakır.
- **Karantina Görünümü (`v_warehouse_quality_holds` - `048`)**: İlişkisel tabloları (LPN, Lokasyon, Ürün) birleştirerek frontend için tek sorguda okunabilir hale getirir.
- **Lot İzlenebilirlik Raporu RPC'leri (`049`)**:
  - `get_lot_movements_report(p_lot_number)`: Belirtilen lot numarasının tüm depo hareketlerini kronolojik listeler.
  - `get_lot_android_events(p_lot_number)`: Lot numarasıyla eşleşen Android el terminali operasyon event'lerini (tarama, miktar girişi, tamamlama) kronolojik olarak listeler.
- **Kısmi Benzersiz Barkod İndeksi (`050`)**: [product_external_barcodes](file:///X:/RMSv3/schema-railway-master.sql#L4163) üzerindeki global benzersizlik kısıtı güncellenerek yalnızca aktif barkodlar (`active = true`) için benzersizlik kısıtı getirilmiştir. Bu sayede eski pasif barkodların çakışması engellenmiştir.
- **Otomatik Paketleme Normalizasyon Trigger'ı (`sync_stock_item_package_units` - `050`)**: [stock_items](file:///X:/RMSv3/schema-railway-master.sql#L6628) tablosuna bağlanan trigger ile her ürün ekleme/güncelleme işleminde, JSONB `packaging_units` dizisindeki hiyerarşik paket katsayıları normalize `stock_item_package_units` tablosuna otomatik olarak (upsert/delete) yansıtılmaktadır.
  - Ürünün ana ölçü birimini (`stock_items.unit`) otomatik olarak `is_base_unit = true` olacak şekilde normalize tabloya ekler.
  - Boyutlar (en, boy, yükseklik), ağırlıklar (brüt, net) için sıfır veya negatif değer girişlerini ve net ağırlığın brüt ağırlığı aşması durumlarını veritabanı seviyesinde doğrulayarak işlemi iptal eder (fail-closed).
  - Her birim için `barcodes` (nesne dizisi) veya legacy `barcode` alanını okuyup `product_external_barcodes` tablosuna `package_unit_id` referansıyla kaydeder.
- **Araç Genişletme Şeması (`051`)**: `vehicles` tablosuna araç tipi (`vehicle_type`), sıcaklık sınıfı (`temperature_class` - dry, cold, frozen, multi_temp), taşıma kapasiteleri (hacim $m^3$, ağırlık $kg$) ve iç hacim boyutları eklendi. `stock_items` tablosuna da envanterin korunması gereken `temperature_class` kolonu tanımlandı.
- **Kapasite ve Sıcaklık Uyum Kontrolü (`052`)**:
  - `warehouse_shipment_lines` tablosuna sevk edilen paketin referansı, adedi, hacmi ve brüt ağırlığı alanları eklendi.
  - `get_warehouse_shipment_capacity(shipment_id)` RPC'si ile sevkiyatın toplam hacim ve ağırlığı, araç limitleri ve sıcaklık sınıfı uyuşmazlığı detayları hesaplanır.
  - `confirm_warehouse_shipment` RPC'si kapasite aşımında veya sıcaklık uyuşmazlığında onay işlemini engeller. Bu engel yetkili şifresiyle girilen `capacity_override = true` parametresiyle aşılabilir.
- **WMS Sayım Görevleri ve Fark Onay Şeması (`053`)**:
  - `warehouse_count_approvals` tablosu oluşturuldu. Sayım sonucunda ortaya çıkan farklar bu tabloya `pending` durumunda kaydedilerek yönetici onay kuyruğuna alınır.
  - `submit_warehouse_count_task` RPC'si ile sayım sonucu gönderilir; fark yoksa görev doğrudan tamamlanır, fark varsa onay kuyruğuna alınarak görev tamamlanır.
  - `approve_warehouse_count_approval` RPC'si farkı onaylar ve fark durumuna göre envantere `stock_count_gain` veya `stock_count_loss` hareketini yazar.
  - `reject_warehouse_count_approval` RPC'si ise farkı reddeder ve envanter durumunun değiştirilmeden korunmasını sağlar.
- **Tedarikçi Paneli ve API İzolasyon Güvenliği (`server/index.js`)**:
  - Tedarikçi panelinde veya API query katmanında (`/api/query`), `purchase_orders` tablosunun `meta` kolonuna sevk bilgisi (`supplier_marked_sent`) veya tedarikçi notu (`supplier_notes`) yazılmak istendiğinde fail-closed guard kontrolleri eklendi.
  - `flow_channel = 'warehouse_replenishment'` olan veya ilişkili tedarikçisinin `supplier_kind = 'internal_warehouse'` olduğu WMS siparişlerinde tedarikçi panelinin güncelleme yapması engellendi. WMS siparişlerinin "yolda" durumuna geçmesi sadece `confirm_warehouse_shipment` RPC'si üzerinden WMS akışıyla yapılabilir.
- **Pick-Face İkmal (Replenishment) Şeması ve RPC (`054`)**:
  - `stock_item_warehouse_settings` tablosuna pick-face minimum stok seviyesi (`pick_face_min_qty`) ve hedef maksimum ikmal seviyesi (`pick_face_max_qty`) alanları eklendi.
  - `complete_warehouse_move_task` PL/pgSQL fonksiyonu tasarlanıp uygulandı. Bu fonksiyon, move tipi ikmal transfer görevini atomik transaction içerisinde kilitler, doğrular, aktif `warehouse_reservations` kaydını bulup `consumed` statüsüne çeker, kaynak reserve lokasyonundan çıkış (`transfer_out`) ve hedef pick-face lokasyonuna giriş (`transfer_in`) olarak 2 adet `inventory_movements` hareketi ekleyerek görevi başarıyla `done` statüsüne çeker.

### 2. Arayüz ve Web Ekranları (WMS-04B - WMS-05B)
- **Karantina Yönetim Ekranı (`WmsQuality.jsx`)**:
  - Karantina altındaki tüm stoklar listelenir. Kanıt fotoğrafı modal ile görüntülenebilir.
  - Yetkili personel gerekçe belirterek stokları kabul edebilir (`release`), iade edebilir (`reject`) veya hurdaya ayırabilir (`scrap`).
- **Lot İzlenebilirlik Raporu (`WmsTraceability.jsx`)**:
  - Lot numarasına göre arama yapılır. Şube/depolardaki dağılımı gösteren **Recall Özet Tablosu** ve Android işlem zaman çizgesi (timeline) sunulur.
- **Stok Kartı Ölçüm & Paketleme Sekmesi (`StockItems.jsx` - Tab 1)**:
  - Ana ürün ve paket birimleri için katlanabilir kartlar (expandable cards) arayüzü oluşturuldu.
  - Boyutlar, ağırlıklar, dinamik hacim gösterimi ($m^3$) ve çoklu barkod girişleri eklendi.
- **Depo Araç Yönetimi Paneli (`WmsVehicles.jsx`)**:
  - Merkez depoda kullanılan araçların tanımlandığı, plaka, sürücü, hacim ve sıcaklık sınıflarının yönetildiği yeni master veri ekranı sisteme dahil edildi.
- **Kapasite Kontrollü Sevkiyat Ekranı (`DepoOrders.jsx`)**:
  - Serbest plaka girişi kapatılarak kayıtlı araçlar listesinden seçim yapılması sağlandı. Anlık doluluk grafikleri ve aşırı yük/sıcaklık override modülü eklendi.
- **WMS Sayım Görevleri ve Onay Sekmesi (`WmsTasks.jsx`)**:
  - Web panelinden sayım görevlerini izlemek üzere "Görevler" sekmesinin yanına **Fark Onayları** sekmesi entegre edildi.
  - Sayım farkları tablodan listelenip, yöneticiler tarafından doğrudan web üzerinden onaylanabilir (`approve`) veya reddedilebilir (`reject`).
  - Yeni Sayım (Cycle Count) görevi oluşturmayı sağlayan modül eklendi.
- **Tedarikçi Sipariş Paneli İzolasyonu (`SupplierOrderPanel.jsx`)**:
  - Panel veri yükleme aşamasında depo ikmal siparişleri (`warehouse_replenishment`) ve iç depolar (`internal_warehouse` tipindeki suppliers) sipariş listelerinden tamamen izole edildi.
  - Tedarikçi ekranındaki `Sevk Et` ve `Not Ekle` aksiyonları WMS siparişleri için arayüz seviyesinde toast uyarılarıyla engellendi.
- **Stok Parametreleri Düzenleme Panelinde İkmal Sınırları (`WmsStockParams.jsx`)**:
  - WMS stok parametreleri paneline "Toplama Min" (pick_face_min_qty) ve "Toplama Max" (pick_face_max_qty) kolonları entegre edilerek veritabanına toplu kayıt/upsert desteği sağlandı.
- **İkmal Önerileri Sekmesi (`WmsTasks.jsx`)**:
  - Görevler ekranına "İkmal Önerileri" sekmesi eklendi. Pick-face lokasyonunda stoğu minimumun altına düşen ürünler için yoldaki/pending ikmal miktarları da hesaplanarak ihtiyaç listesi oluşturulur.
  - Reserve alanda yeterli serbest stok yoksa kırmızı uyarı bayrağı (`has_warning = true`) gösterilir ve "Görev Oluştur" butonu kilitlenir. Yeterli stok olan öneriler için tek tuşla move görevleri ve ilgili envanter rezervasyonları oluşturulur.

### 3. Android El Terminali Entegrasyonu (WMS-05A - WMS-05B)
- **Sayım Görev Akış Ekranı (`WmsCycleCountScreen.kt`)**:
  - Lokasyon barkodu, LPN barkodu (varsa) ve Ürün barkodu sırasıyla taranmadan sayım miktarı girişi kilitlenmektedir.
  - Tüm doğrulamalar bittikten sonra personel fiziksel sayım miktarını ve fark varsa açıklamasını (gerekçe) girip sunucuya iletebilir.
  - Malzeme 3 `OutlinedTextFieldDefaults.colors` renk uyumsuzlukları giderilerek derleme hatasız hale getirilmiştir.
- **Filtre ve Navigasyon (`WmsMobileScreen.kt`)**:
  - El terminali ana ekranına sayım görevlerini ayırt etmek üzere "SAYIM" tipi ve pembe renk kodu (`0xFFEC4899`) entegre edilmiştir.
- **İki Aşamalı Lokasyon Doğrulama ve Yönergeler (`WmsPutawayScreen.kt` & `WmsMobileScreen.kt`)**:
  - `move` (ikmal transfer) görevlerinde iki aşamalı doğrulama zorunlu kılınmıştır:
    1. Personel ilk olarak kaynağın (reserve lokasyon) barkodunu okutur. Doğrulanana kadar sonraki adıma izin verilmez.
    2. Ardından hedefin (pick-face lokasyon) barkodunu okutur.
  - İki lokasyon da başarılı şekilde çözümlenip doğrulanmadan miktar onaylama ve görevi tamamlama butonu engellenmiştir.
  - Taranması beklenen lokasyona (Kaynak/Hedef) göre arayüzdeki başlıklar, border renkleri (Mavi/Mor/Yeşil/Kırmızı) ve yönergeler dinamik olarak değişir.

### 4. Backend Barkod Çözümleme Sıralaması
- [server/index.js](file:///X:/RMSv3/server/index.js#L681) içerisindeki `/api/wms/parse-barcode` endpoint'i, taranan barkodları aşağıdaki kesin öncelik sırasıyla çözümleyecek şekilde güncellenmiştir:
  1. **Lokasyon Barkodu** (`location`)
  2. **LPN / SSCC** (`lpn`)
  3. **Onaylanmış Aktif Ürün/Paket Barkodu** (`product` - `is_approved = true` ve `active = true`)
  4. **Lot / SKT Yapısı** (`LOT:` veya `EXP:` içeren yapılar)
  5. **SKU Fallback** (Eşleşme bulunamayan durumlarda manuel ürün kodu fallback'i olarak)

---

## Doğrulama ve Test Sonuçları

### 1. Kalite Hold Regression Testi
`scratch/test_wms_quality_hold_regression.cjs` aracı çalıştırılmış ve aşağıdaki akışlar başarıyla doğrulanmıştır:
- Karantinaya giren stokların toplanamadığı (`v_wms_pickable_stock` dışında kaldığı),
- Kalite onay (release) işlemi sonrası otomatik transfer edilip toplanabilir hale geldiği kanıtlanmıştır.

### 2. Barkod ve Paket Master Data Smoke Testi
`scratch/test_wms_barcode_package_units.cjs` smoke testi başarıyla çalıştırılmıştır:
- Taban birim normalizasyonu, hiyerarşik conversion ve generated hacim kolonu (`volume_m3`) hesaplamaları doğrulanmıştır.

### 3. Araç Kapasite ve Sıcaklık Entegrasyon Testi
`scratch/test_wms_vehicle_capacity.cjs` entegrasyon testi veritabanı üzerinde çalıştırılmış ve tüm adımlar başarıyla yeşile dönmüştür:
- Sıcaklık uyuşmazlığı engelleri, kapasite aşımı kontrolleri ve yetkili override bypass mekanizması doğrulanmıştır.

### 4. Sayım Görevi ve Onay Mekanizması Entegrasyon Testi
`scratch/test_wms_cycle_count.cjs` entegrasyon testi çalıştırılmış ve tüm senaryolar başarıyla doğrulanmıştır.

### 5. Tedarikçi İzolasyonu Entegrasyon Testi
`scratch/test_wms_supplier_isolation.cjs` entegrasyon testi çalıştırılmış ve tüm izolasyon ve API süzgeç kuralları başarıyla doğrulanmıştır.

### 6. İkmal (Replenishment) Entegrasyon Testi
`scratch/test_wms_replenishment.cjs` entegrasyon testi çalıştırılmış ve 5 temel senaryo başarıyla doğrulanmıştır:
- Test Case 1: Stok seviyesi min altına düşen pick-face lokasyonu için ikmal önerisi üretildiği ve reserve alan boşken kırmızı uyarı bayrağının yandığı,
- Test Case 2: Reserve alana stok girildiğinde FEFO (First Expired First Out) sırasına göre allocation hesaplandığı,
- Test Case 3: Transfer görevi oluşturulunca pending ikmal miktarının hesaba katıldığı ve önerinin listeden kalktığı,
- Test Case 4: Barkod çözümleme API'sinin kaynak ve hedef lokasyonlarını başarılı şekilde doğruladığı, yanlış lokasyon taramalarını reddettiği,
- Test Case 5: Görev tamamlandığında RPC'nin rezervasyonu consumed durumuna çektiği, transfer_out ve transfer_in hareketlerini atomik olarak yazdığı ve pick-face bakiyesini güncellediği doğrulanmıştır.

### 7. Derleme ve Git Diff Doğrulaması
- Android Gradle projesi (`.\gradlew.bat compileDebugSources` & `.\gradlew.bat assembleDebug`) ve Vite frontend projesi (`npm run build`) sıfır hata ve sıfır uyarı ile başarıyla derlenmiştir.
- `git diff --check` komutu ile boşluk ve trailing whitespace kontrolleri yapılmış, herhangi bir kod stili hatası olmadığı kesinleştirilmiştir.

