# WMS Faz 8: Ana Depo Talep Tahmini ve Satınalma Planlama Motoru - Walkthrough

Bu belgede, **WMS Faz 8 (Ana Depo Talep Tahmini ve Satınalma Planlama Motoru)** kapsamında gerçekleştirilen geliştirmeler, veri modelleri, kullanıcı arayüzü entegrasyonu ve doğrulama testlerinin sonuçları özetlenmiştir.

---

## 1. WMS Faz 8 Kapsamında Yapılan Geliştirmeler

### A. Veritabanı ve Şema Güncellemeleri
1. **`order_flows.receiver_scope` Kolonu eklendi:** 
   - `migrations/034_add_receiver_scope_to_order_flows.sql` dosyası ile `public.order_flows` tablosuna `receiver_scope` kolonu (tip: `TEXT`, default: `'branch'`, NOT NULL) eklendi.
   - Kolona kısıt (`CHECK`) eklenerek sadece `'branch'`, `'warehouse'` ve `'kitchen'` değerlerinin girilebilmesi güvence altına alındı.
   - Bu güncelleme master şema dosyasına (`schema-railway-master.sql`) işlendi ve Railway Postgres veritabanına uygulandı.
2. **`stock_items.image_url` Sorunu Çözüldü (Faz 8 UI):**
   - Malzeme düzenle ekranında görsel yükleme hatasına sebep olan eksik `image_url` kolonu `stock_items` tablosuna eklendi (`033_add_image_url_to_stock_items.sql` uygulandı) ve `schema-railway-master.sql` güncellendi.

### B. Bağımsız Tahmin ve Sipariş Öneri Motoru (`src/lib/warehouseDemandPlanning.js`)
Dış tedarikçiden depoya yapılacak satın almaları hesaplayan pure (saf) bir motor yazıldı:
- **Depo Ayarları:** Planlama parametreleri öncelikli olarak depoya özel ayarlar tablosundan (`stock_item_warehouse_settings`) okunmakta, burada değer tanımlı değilse global stok kartı değerlerine düşmektedir.
- **Yolda Stok Ayırımı:** Stok pipeline miktarları yönlerine göre ayrıştırıldı:
  - `Tedarikçi -> Ana Depo yolda` (Depoya gelecek satın alma siparişleri - depodaki net ihtiyacı doğrudan azaltır).
  - `Ana Depo -> Şube yolda` (Depodan şubelere sevk edilmiş ama kabul edilmemiş replenishment sevkiyatları - ilgili şubenin net talebini azaltarak depoya binen yükü hafifletir).
- **Şube Kapsama & Brüt Talep Hesabı:** Bağlı şubelerin reçete tahmini, kullanım ortalaması, stok tamamlama veya son sipariş miktarlarına göre brüt talepleri belirlenip şube kullanılabilir stokları ile yoldaki sevkiyatlar düşüldükten sonra net şube gereksinimi hesaplanır.
- **Ana Depo Öneri Formülü:** 
  `siparis_onerisi = Toplam_Net_Sube_Ihtiyaci + Depo_Guvenlik_Stogu - (Depo_Fiili_Stogu + Depo_Inbound_Yolda)`
- **Yuvarlama Kısıtları:** Depoya özel koli içi katsayı, minimum sipariş miktarı ve maksimum sipariş limiti sınırlandırmaları uygulanmaktadır.

### C. Sipariş Akış Sihirbazı Geliştirmeleri (`src/components/pages/OrderFlows.jsx`)
- **Alıcı Kapsamı Seçimi:** Sihirbazın 1. Adımına (Tanım) "Alıcı Kapsamı" seçeneği eklendi:
  - *Şube Siparişi* (`branch`) - Varsayılan eski şube akışları.
  - *Ana Depo Satınalma* (`warehouse`) - Yeni tahmin motoruna yönlenen depo akışları.
  - *Merkez Mutfak* (`kitchen`) - Gelecek fazlar için pasif/hazırlık durumunda.
- **Dinamik Terminoloji:** Akış alıcı kapsamı `warehouse` seçildiğinde, UI üzerindeki onay/limit ve açıklama wording'leri "Şube yöneticisi" yerine "Depo yöneticisi/Alıcı Nokta" terimlerine otomatik olarak dönüştürülmektedir.
- **Kanal ve Kapsam Badgeleri:** İş akışı detaylarında ve listeleme ekranında alıcı kapsamına göre `"Depo Satınalma"`, `"Şube Satınalma"`, `"Mutfak Satınalma"` veya `"İç İkmal"` badgeleri dinamik olarak üretilmektedir.

### D. Satınalma ve Sipariş Yönetimi Entegrasyonu (`src/components/pages/Orders.jsx`)
- **İzole Çalışma Yolları:** Şube siparişleri `/orders` rotasında, depo satınalma siparişleri ise `/depo-satinalma` rotasında filtrelenmiş olarak listelenir. Depo siparişlerinin şube listesine karışması engellenmiştir.
- **WMS Detayları ve Önizleme UI:** Depo planlama ekranında her bir satır için tahmin detayları butonu eklendi. Butona tıklandığında:
  - Hesaplama formülü detayları ve yuvarlama gerekçesi,
  - Deponun fiili ve yoldaki stok durumu,
  - Bağlı şubelerin her birinin brüt talebi, stoğu, yoldaki sevkiyatı ve net depo ihtiyacı görsel olarak listelenir.

### E. Mal Kabul & WMS Takibi (`src/components/pages/MalKabul.jsx`)
- Depo satınalma siparişlerisubmitted durumuna geçtiğinde `/depo-mal-kabul` Goods Receiving ekranına düşer.
- Mal kabul ekranı depo modunda (`isWmsMode = true`) açıldığında WMS Palet (LPN), Lokasyon seçimi, Lot Numarası, Son Kullanma Tarihi ve Karantina/Putaway uygunluk durumu alanları eksiksiz görüntülenir ve stok hareketlerine (`inventory_movements`) yazılır.

---

## 2. Doğrulama ve Test Sonuçları

### A. Şube Sipariş Regresyon Kilidi Testi (`scratch/test_branch_purchasing_regression.js`)
Depo tahmin geliştirmelerinin mevcut şube sipariş toplama mekanizmasını etkilemediğini doğrulamak amacıyla `tahmin`, `stok`, `son`, `manuel` modlarını ve koli yuvarlamalarını test eden regresyon unit testi başarıyla çalıştırılmıştır.

**Test Sonucu:**
```text
Running branch purchasing regression tests...
✅ [PASS] Tahmin mode - Target based (reorder > 0)
✅ [PASS] Tahmin mode - Usage based (no stock target)
✅ [PASS] Stok mode
✅ [PASS] Son mode
✅ [PASS] Manuel mode
✅ [PASS] Rounding with packaging unit and min order

All branch purchasing regression tests passed successfully!
```

### B. WMS Talep Tahmini Entegrasyon Testi (`scratch/test_wms_demand_planning.js`)
Database connection rollback korumalı test senaryosu çalıştırılarak `tahmin` (Recipe/Usage) ve `stok` (Stock level top-up) modlarında tahmin motorunun tüm yuvarlama, yoldaki stok ve emniyet stoklarını doğru hesapladığı kanıtlanmıştır.

**Test Sonucu:**
```text
Connected to database.
Started transaction.
Warehouse Branch: Pendik Merkez Depo (ID: 302bd195-3b79-4f14-a60b-4668c36a12c1)
Sube Branch: Ankara Etimesgut Şubesi (ID: 475960cc-bd6a-4b02-9587-df45b39a4cc5)
Stock Item: Pizza Hamuru (250g) (ID: b0e10002-0000-4000-8000-000000000002)
Inserted stock_item_warehouse_settings for the warehouse.
Verified warehouse settings - min_stock: 5.000, safety_stock: 3.000

--- TEST RESULTS: TAHMIN MODE ---
Suggested Qty: 30 (Expected: 30)
Explanation: Net Talep: 35.00, Güvenlik: 3, Depo Pozisyon: 15.00
Rounding: Koli içeriğine yuvarlandı (Çarpan: 10, Eşik: %20) + Minimum sipariş miktarı uygulandı (2 koli/birim)
✅ Tahmin Mode Test PASS!

--- TEST RESULTS: STOK MODE ---
Suggested Qty: 30 (Expected: 30)
Explanation: Stok Tamamlama (Hedef: 40, Depo Mevcut: 5, Yolda: 10)
✅ Stok Mode Test PASS!

All integration tests executed.
Transaction rolled back. DB is clean.
```

### C. Vite Derleme Doğrulaması
Vite production build komutu (`npm run build`) koşturulmuş ve tüm yeni kodlar Vite tarafından sıfır hata ile başarıyla derlenmiştir:
```text
✓ built in 30.32s
```

## 3. Ek Hata Giderimleri (Cila & Düzeltmeler)

### A. WMS Sipariş Konsolu İlişkisel JOIN Hatası Çözümü
- **Sorun:** `/depo-orders` sayfasında (WMS konsolu) `warehouse_shipment_lines` listelenirken, nested select (`*, stock_items(name, sku, unit)`) yapısı kullanıldığından backend API query translator virgül ayraçlarını parse edemeyerek `column "stock_items(name" does not exist` veritabanı hatasına yol açıyordu.
- **Çözüm:** `src/components/pages/DepoOrders.jsx` dosyasında `warehouse_shipment_lines` düz bir select (`*`) sorgusuna çekildi ve `stock_items` tablosu `Promise.all` ile asenkron olarak ayrı sorgulandı. Elde edilen veriler frontend tarafında in-memory birleştirilerek (`mappedLines`) UI'a beslendi. Bu sayede hem join hatası tamamen giderildi hem de UI bileşenlerinin nesne bağımlılıkları kesintisiz şekilde korundu.
- **Doğrulama:** Vite production build ve entegrasyon testleri sorunsuzdur. `/depo-orders` sayfası veritabanındaki sevkiyat satırlarını hatasız listelemektedir.
