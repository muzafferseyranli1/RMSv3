# Görev WMS-04E - Stok Kartı Paket Ölçüleri ve Barkod Yönetimi UI Uygulama Planı

Bu plan, stok malzemeleri düzenleme ekranında (`StockItems.jsx`) hem ana birim (adet) hem de ek ambalaj birimleri (kutu, koli, kasa vb.) için boyut, ağırlık ve çoklu barkod verilerinin girilmesini, otomatik hacim hesaplanmasını ve bunların veritabanı (DB-first) seviyesinde otomatik senkronize edilmesini içerir.

## User Review Required

Lütfen aşağıdaki veritabanı ve arayüz tasarım detaylarını inceleyip onaylayın.

> [!IMPORTANT]
> **Veritabanı Tetikleyicisi (Trigger) Geliştirmesi**
> `migrations/050_wms_barcode_and_package_sync.sql` içinde yazılan tetikleyici, `stock_items` üzerindeki `packaging_units` JSONB kolonundaki boyut, ağırlık ve barkod listesini (nesne dizisi olarak) doğrudan çözümleyecek şekilde genişletilecektir. Böylece hem veri tabanı bütünlüğü korunacak hem de frontend entegrasyonu tamamen geriye dönük uyumlu olacaktır.

> [!NOTE]
> **Arayüz Tasarımı ve Katlanabilir Kartlar**
> Her paketleme birimi (ve ana ürünün kendisi) için en, boy, yükseklik, brüt/net ağırlık, hacim ve çoklu barkod listesi gibi çok fazla veri alanı ekleneceğinden, ekranda daralmaya veya taşmaya yol açmamak için katlanabilir kartlar (expandable cards) kullanılacaktır.

## Open Questions

Herhangi bir açık soru bulunmamaktadır.

## Proposed Changes

---

### Database Layer

#### [MODIFY] [050_wms_barcode_and_package_sync.sql](file:///c:/RMSv3/migrations/050_wms_barcode_and_package_sync.sql)
Tetikleyici (`sync_stock_item_package_units`) fonksiyonunu aşağıdaki özelliklerle güncelleyeceğiz:
1. `length_cm`, `width_cm`, `height_cm`, `gross_weight_kg`, `net_weight_kg` değerlerini `stock_items.packaging_units` içinden okuyarak `stock_item_package_units` tablosuna yazma.
2. Her birim için `barcodes` (nesne dizisi) veya legacy `barcode` alanını okuyup `product_external_barcodes` tablosuna `package_unit_id` referansıyla kaydetme.
3. Boyut ve ağırlık doğrulamaları: `boyutlar > 0`, `ağırlıklar > 0` ve `net <= brüt` kuralını tetikleyici seviyesinde kontrol etme (hata durumunda işlemi iptal eder).
4. Ürün güncellendiğinde silinen eski barkod ve ambalaj birimlerini deaktif etme (veya referans yoksa silme).

---

### React Frontend UI

#### [MODIFY] [StockItems.jsx](file:///c:/RMSv3/src/components/pages/StockItems.jsx)
1. **Veri Yükleme (`open`)**:
   Ürün düzenleme açıldığında veritabanındaki güncel barkodları (`product_external_barcodes`) ve paket birimlerini (`stock_item_package_units`) çekerek frontend yerel state'i (`form.base_unit_details` ve `form.packaging_units`) ile birleştirme.
2. **Tab 1: Ölçüm & Paketleme UI Değişikliği**:
   * **Ana Birim Kartı**: Ürünün kendisi için en, boy, yükseklik, ağırlıklar ve çoklu barkod tanımlanabileceği sabit katlanabilir kart.
   * **Paketleme Birimleri Kart Listesi**: Eklenen her ambalaj için katlanabilir kartlar. Kart başlığında birim adı, katsayı ve kısa özet gösterilecek; kart açıldığında tüm ölçüler ve barkod ekleme/çıkarma formu yer alacaktır.
   * **Hacim Hesaplama**: En, boy, yükseklik değerleri girildiğinde hacim dinamik olarak `(en * boy * yükseklik) / 1000000` şeklinde kullanıcıya `m3` cinsinden gösterilecektir.
3. **Kaydetme Mantığı (`save`)**:
   * Ana birim ve diğer paket birimlerini birleştirerek `packaging_units` dizisini oluşturma.
   * Arayüz seviyesinde fail-closed doğrulamalar: Negatif boyut/ağırlık, brüt ağırlıktan büyük net ağırlık veya mükerrer barkod girişleri kontrol edilerek formun gönderilmesi engellenecek ve kullanıcıya uyarı verilecektir.
   * Sunucudan dönen barkod çakışma hatasını yakalayıp kullanıcı dostu hata mesajı gösterme.

---

### Smoke Test Script

#### [MODIFY] [test_wms_barcode_package_units.cjs](file:///c:/RMSv3/scratch/test_wms_barcode_package_units.cjs)
Trigger güncellemesi sonrasında, test scriptine boyut, ağırlık ve barkod nesne dizisi senkronizasyon kontrollerinin ve veritabanı doğrulama kurallarının eklenmesi.

## Verification Plan

### Automated Tests
- Geliştirilen test betiğinin çalıştırılması:
  ```bash
  node scratch/test_wms_barcode_package_units.cjs
  ```
- Frontend build testi:
  ```bash
  npm run build
  ```
- Git diff kontrolü:
  ```bash
  git diff --check
  ```

### Manual Verification
- Ürün düzenleme ekranından paket birimleri eklenip, boyut/ağırlık ve barkodlar girilerek kaydetme işlemi test edilecek; çakışma durumunda veya sıfır/negatif değerlerde hata alındığı doğrulanacaktır.
