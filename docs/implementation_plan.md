# Implementation Plan - WMS Phase 3: Android Paket Barkodu, Ölçü/Ağırlık ve Yük Önizleme (WMS-03G)

Bu plan, Android el terminali uygulamasında ürün veya paket barkodu okutulduğunda paketleme biriminin hacim, ağırlık, ölçü ve katsayı bilgilerini göstermeyi, yükleme/paketleme ekranlarında araç kapasite kontrolünü server tabanlı gerçekleştirerek kapasite aşımında işlemi engellemeyi hedefler.

---

## User Review Required

> [!IMPORTANT]
> **1. Veritabanı ve Şema Normalize Edilmesi (WMS-04D):**
> Yeni `stock_item_package_units` tablosu eklenecek ve `product_external_barcodes` bu tabloya ilişkilendirilecektir. Mevcut JSONB `stock_items.packaging_units` alanı geriye dönük uyumluluk amacıyla fallback olarak desteklenecektir.
>
> **2. Sunucu Tabanlı Kapasite Kontrolü (WMS-04G):**
> `warehouse_shipment_lines` tablosuna `package_unit_id`, `package_qty`, `base_qty`, `line_volume_m3`, `line_gross_weight_kg` alanları eklenecektir. Yükleme (`load`) görevi tamamlanırken, sevkiyat satırlarının toplam hacim ve ağırlığı, aracın kapasiteleri ile karşılaştırılacak ve aşım durumunda sunucu işlemi `fail-closed` olarak reddedecektir.
>
> **3. Ortak Paket Bilgisi Bileşeni (Jetpack Compose):**
> Mal kabul, picking, pack/load, sayım ve replenishment ekranlarında taranan paket bilgisi ortak bir `WmsPackageInfoCard` bileşeni ile gösterilecektir. Eksik ölçü/ağırlık verisi olduğunda kart kırmızı renkte bir master veri uyarısı gösterecektir.

---

## Proposed Changes

### 1. Veritabanı ve Sunucu Katmanı (Database & Server Side)

#### [NEW] [046_wms_packaging_and_capacity_schema.sql](file:///C:/RMSv3/migrations/046_wms_packaging_and_capacity_schema.sql)
- `stock_item_package_units` tablosunun oluşturulması (`volume_m3` en, boy, yükseklik çarpımıyla otomatik hesaplanan generated column olacaktır).
- `vehicles` tablosunun plaka, model dışında `max_volume_m3`, `max_weight_kg`, iç ölçüler ve sıcaklık sınıfı gibi alanlarla genişletilmesi.
- `warehouse_shipment_lines` tablosuna paketleme birimi ve hacim/ağırlık kolonlarının eklenmesi.
- `product_external_barcodes` tablosuna `package_unit_id` kolonu eklenmesi.
- `get_warehouse_shipment_capacity(shipment_id)` veritabanı fonksiyonunun yazılması. Bu fonksiyon, sevkiyattaki toplam hacim, toplam ağırlık ile seçili aracın kapasitelerini ve kalan miktarları döndürecektir.
- `complete_warehouse_shipment_task` RPC fonksiyonunun paket ve kapasite doğrulamasını yapacak şekilde güncellenmesi.

#### [MODIFY] [wms_migration.js](file:///C:/RMSv3/server/wms_migration.js)
- Göç adımlarının sonuna `046_wms_packaging_and_capacity_schema.sql` dosyasının eklenmesi.

#### [MODIFY] [index.js](file:///C:/RMSv3/server/index.js)
- `/api/wms/parse-barcode` endpoint'inin güncellenmesi:
  - Taranan barkodun onaylı paket barkodu olması durumunda ilişkili `stock_item_package_units` kaydıyla birlikte dönmesi.
  - Barkod doğrudan `stock_items.sku` ise fallback olarak varsayılan bir paket yapısının oluşturulup dönülmesi.
- `/api/wms/shipment-capacity/:shipment_id` endpoint'inin eklenmesi:
  - Sevkiyatın güncel toplam yük ve araç kapasite durumunu `get_warehouse_shipment_capacity` üzerinden sorgulayıp dönmesi.

---

### 2. Android Veri ve API Katmanı (Data & API Layer)

#### [MODIFY] [WmsScanResult.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/scan/WmsScanResult.kt)
- `WmsScanPackageUnit` sınıfının tanımlanması ve `WmsScanResult` içine opsiyonel `package_unit` alanının eklenmesi.

#### [MODIFY] [ApiClient.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/data/ApiClient.kt)
- `ApiService` içerisine sevkiyat kapasite durumunu çeken API tanımının eklenmesi:
  ```kotlin
  @GET("api/wms/shipment-capacity/{shipment_id}")
  suspend fun getShipmentCapacity(
      @Path("shipment_id") shipmentId: String
  ): ShipmentCapacityResponse
  ```
- `ShipmentCapacityResponse` ve `ShipmentCapacityData` veri sınıflarının tanımlanması.

#### [MODIFY] [WmsRepository.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/data/WmsRepository.kt)
- `completeShipmentTask` fonksiyonuna `packageUnitId: String? = null` ve `packageQty: Double? = null` parametrelerinin eklenmesi.

---

### 3. Android UI Katmanı (UI Layer)

#### [NEW] [WmsPackageInfoCard.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsPackageInfoCard.kt)
- Taranan paket barkoduna ait detayları (birim adı, sembolü, miktar katsayısı, hacim, ağırlık, ölçüler) gösteren ortak Jetpack Compose kartı.
- Hacim/ağırlık verileri boşsa eksik master data uyarısı gösterimi.

#### [NEW] [WmsPackLoadScreen.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsPackLoadScreen.kt)
- Paketleme (`pack`) ve Yükleme (`load`) görevleri için özel ekran tasarımı.
- Eğer sevkiyat ve araç tanımlı ise en üstte araç doluluk durumunun grafiksel/renkli özet kartı (sevkiyat toplam hacim/ağırlık vs araç kapasiteleri).
- Kapasite aşımı olduğunda butonu pasifleştiren ve inline server hata mesajını gösteren durum yönetimi.

#### [MODIFY] [WmsPutawayScreen.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsPutawayScreen.kt) & [WmsPickingScreen.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsPickingScreen.kt)
- Taranan barkod başarılı bir paket birimine karşılık geliyorsa ürün kartının altında `WmsPackageInfoCard` gösterimi.

#### [MODIFY] [WmsMobileScreen.kt](file:///C:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsMobileScreen.kt)
- Görev filtrelerine `pack` (Paketle), `load` (Yükle), `count` (Sayım) vb. eklenmesi.
- Aktif tab durumlarında `pack` ve `load` görev tipleri seçildiğinde `WmsPackLoadScreen` bileşeninin çağrılması.
- Barkod tarama olaylarında dönen paket bilgisi ve kapasite durumunun durum değişkenlerine (state) yazılması.

---

## Verification Plan

### Automated Tests
- Kotlin derlemesi ve APK oluşturma:
  ```powershell
  cd C:\RMSv3\wms-android
  .\gradlew.bat assembleDebug
  ```

### Manual Verification
1. Veritabanı göçlerinin uygulanması: `node server/wms_migration.js`
2. Test araçları ve paket birimleri eklenerek veritabanı API'si smoke testi yapılacaktır.
3. Android uygulamasında koli/palet barkodları taranarak katsayı ve ölçülerin doğru gösterildiği doğrulanacaktır.
4. Araç kapasitesini aşan yükleme senaryoları simüle edilerek sunucunun talebi reddettiği ve Android'de hata gösterildiği doğrulanacaktır.
