# Walkthrough - WMS Phase 3: Native Android Mobile WMS Shell (WMS-03A)

Bu çalışmada, depo personelinin el terminalleri veya mobil cihazlar üzerinden barkod/QR okutarak kesintisiz ve canlı tarama yapabileceği bağımsız, native Android uygulaması (`wms-android`) kurulmuş, refaktör edilmiş ve tüm derleme/test süreçleri başarıyla tamamlanmıştır.

Ayrıca kod incelemesi/denetim sonrasında, Railway Postgres veritabanındaki RPC imzaları ile Kotlin veri katmanındaki parametrelerin ve veri tiplerinin tam uyumluluğu sağlanmıştır.

---

## Yapılan Değişiklikler

### 1. Yeni Proje Kurulumu (`wms-android/`)
- Proje kök dizininde `com.suitable.wms` paket adı ve `Suitable WMS` uygulama ismiyle modern bir Jetpack Compose / Kotlin Gradle Android projesi oluşturuldu.
- `settings.gradle.kts` ve `build.gradle.kts` yapılandırılarak `personel-android` ile uyumlu Compose, Retrofit, Coroutines, ve ZXing tarama kütüphaneleri dahil edildi.

### 2. İzinler ve Manifest Entegrasyonu
- [AndroidManifest.xml](file:///c:/RMSv3/wms-android/app/src/main/AndroidManifest.xml) dosyası güncellenerek:
  - `INTERNET` ve `CAMERA` izinleri eklendi.
  - Cihazlarda kameranın zorunlu olmadan da çalışabilmesi için `android.hardware.camera` özelliği `required="false"` olarak ayarlandı.
  - `MainActivity` için portrait (dikey) ekran kilidi eklendi.
  - ZXing `CaptureActivity` bildirimleri dahil edildi.

### 3. API, Depo Veri Katmanı ve RPC Hizalaması
- [ApiClient.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/data/ApiClient.kt): Railway API sunucusuyla (`https://rms-api-production-219d.up.railway.app/`) konuşacak Retrofit istemcisi ve `QueryRequest`/`QueryResponse` veri tipleri tanımlandı.
- [WmsRepository.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/data/WmsRepository.kt):
  - `WarehouseTask` modeli oluşturuldu.
  - Depoya atanan aktif görevleri çeken `fetchWarehouseTasks` eklendi.
  - **Lokasyon Çözümleme (`resolveLocationId`):** Putaway işleminde ham barkod string verisini (örn: "LOC-A-01-02-01"), veritabanının beklediği UUID formatına dönüştürmek amacıyla `warehouse_locations` tablosundan dinamik çözümleyen fonksiyon kuruldu.
  - **`completePutawayTask` RPC Hizalaması:** DB imzasındaki `p_task_id`, `p_personnel_id` (oturum açan personelin UUID'si) ve `p_target_location_id` (çözümlenmiş lokasyon UUID'si) parametreleriyle tam uyumlu hale getirildi. Miktar parametresi DB meta verisinden okunduğu için parametrelerden arındırıldı.
  - **`completeShipmentTask` RPC Hizalaması:** DB imzasındaki `p_task_id`, `p_personnel_id` ve `p_picked_qty` (adet) parametreleriyle tam uyumlu hale getirildi.
  - Taranan barkodun LPN, Lokasyon veya Ürün SKU'su olup olmadığını veritabanından dinamik sorgulayan `queryStock` metodu eklendi.

### 4. Giriş ve Split-Screen Arayüz Entegrasyonu
- [PinLoginScreen.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/PinLoginScreen.kt): Personelin 4 haneli PIN ile girmesini sağlayan ve şube ağacını çözümlerken sadece `anadepo` ve `depo` tipli depo birimlerini filtreleyen, depo yetkisi yoksa girişe izin vermeyen WMS PIN ekranı kuruldu.
- [WmsMobileScreen.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsMobileScreen.kt): Bölünmüş ekran standardını native olarak gerçekleştiren Jetpack Compose ekranı:
  - **Üst Kısım (%22):** ZXing `CompoundBarcodeView` ile sürekli canlı tarama yapan gömülü kamera alanı. Kırmızı lazer çizgisi ve tarama çerçevesi animasyonu eklendi. Emülatör/test ortamı için manuel barkod simülasyon araçları yerleştirildi.
  - **Inline Geri Bildirim Banner'ı:** Barkod okutulduğunda (başarılı tarama, lokasyon eşleştirme veya yanlış barkod hatası) ekranı kaplayan popup veya modal açılmadan, kamera ile sekmeler arasındaki inline yeşil/kırmızı alanda anlık ve kesintisiz geri bildirim sağlandı.
  - **Alt Kısım (%78):** Üç sekmeli operasyon paneli:
    - **Görevler:** Aktif işleri listeleyen ve filtreleyen görev listesi.
    - **Aktif İşlem:** Seçili görevi gösteren, barkod eşleştikçe inline geri bildirim banner'ı ile adetleri güncelleyen, putaway için önce lokasyon UUID'sini çözümleyen ve "Görevi Tamamla" butonuyla API'yi tetikleyen WMS işlem ekranı.
    - **Stok Sorgu:** Taranan veya girilen barkodun depodaki LPN/Lokasyon ve bakiye dağılımını gösteren sorgu alanı.
- [MainScreen.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/MainScreen.kt) & [Navigation.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/Navigation.kt): `staffSession` varlığına bağlı olarak PIN login ve WMS Mobile shell arasında geçişi yöneten ve tam ekran kamera kullanımını destekleyen rota entegrasyonu tamamlandı.

---

## Doğrulama ve Test Sonuçları

### 1. Kotlin Derleme Doğrulaması
- Gradle Kotlin derleme aracı çalıştırıldı:
  ```powershell
  cd C:\RMSv3\wms-android
  .\gradlew.bat compileDebugKotlin
  ```
- **Sonuç:** `BUILD SUCCESSFUL` - Tüm Kotlin dosyaları sıfır hata ve uyarı ile derlendi.

### 2. Unit Test Sonuçları
- Gradle unit test aracı çalıştırıldı:
  ```powershell
  cd C:\RMSv3\wms-android
  .\gradlew.bat test
  ```
- **Sonuç:** `BUILD SUCCESSFUL` - Tüm entegre test paketleri başarıyla koşuldu.

### 3. Paketleme ve APK Derleme
- Debug APK çıktısı oluşturuldu:
  ```powershell
  cd C:\RMSv3\wms-android
  .\gradlew.bat assembleDebug
  ```
- **Sonuç:** `BUILD SUCCESSFUL` - [app-debug.apk](file:///c:/RMSv3/wms-android/app/build/outputs/apk/debug/app-debug.apk) dosyası başarıyla derlendi ve kullanıma hazır hale getirildi.

---

## WMS-03B: Barkod Tarama Motoru ve Server Parser Entegrasyonu

Bu adımda, el terminali kamerasından veya test simülasyonundan girilen tüm barkodların sunucu tarafında doğrulanması ve taranan tüm girdilerin loglanması sağlandı.

### 1. Sunucu Tarafı Barkod Ayrıştırıcı API Entegrasyonu
- `/api/wms/parse-barcode` endpoint'i [index.js](file:///c:/RMSv3/server/index.js) dosyası üzerinde güncellenerek:
  - Taranan barkodun bir **Lokasyon**, **LPN** veya **Ürün (SKU/GTIN)** olup olmadığını veritabanından dinamik olarak çözümler.
  - Aktif görev (`task_id`) ile eşleştirme yaparak, taranan öğenin beklenen öğe olup olmadığını (`is_expected`) denetler.
  - Yanlış lokasyon veya yanlış ürün taranması durumunda detaylı hata mesajı döner.
  - Yapılan tüm tarama işlemlerini (başarılı/başarısız) `warehouse_task_events` tablosuna `scan_success` veya `scan_failed` olayı olarak kaydeder.

### 2. Android İstemci Katmanı ve Entegrasyonu
- **`WmsBarcodeScanner`:** ZXing kütüphanesi için WMS standart tarama ayarlarını ortaklaştırır.
- **`WmsScanResult`:** Sunucudan dönen doğrulama yanıtını karşılayan veri modelidir.
- **`WmsScanViewModel`:** Sunucuya `/api/wms/parse-barcode` üzerinden istek gönderip durum yönetimini üstlenir.
- **`WmsMobileScreen`:** Canlı kamera taraması veya manuel giriş sonrasında `WmsScanViewModel` aracılığıyla sunucu sorgusunu tetikler. Sunucudan dönen hata veya başarı geri bildirimini ekranı kapatmadan inline kırmızı/yeşil banner ile gösterir. Bölünmüş ekran düzeni (%22 kamera, %78 operasyon alanı) korunmuştur.

### 3. API Smoke Test Sonuçları
- `scratch/test_wms_barcode_parser.js` betiği üzerinden veritabanına geçici bir test görevi eklenerek şu durumlar test edildi:
  - Doğru ürün barkodu taranması (Başarılı)
  - Yanlış ürün barkodu taranması (Reddedildi)
  - Doğru hedef lokasyon taranması (Başarılı)
  - Yanlış lokasyon taranması (Reddedildi)
  - Olay günlüklerinin `warehouse_task_events` tablosuna başarıyla yazılması ve loglanması
- **Sonuç:** Test senaryolarının tamamı başarıyla geçmiştir.

---

## WMS-03D: Android Putaway

Depo personelinin putaway (yerleştirme) görevlerini el terminalleri üzerinden hatasız ve kontrollü yapabilmesi için `WmsPutawayScreen` ekranı ve doğrulama akışı geliştirildi.

### 1. Genişletilmiş Görev Detay Çözümlemesi
- [WmsRepository.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/data/WmsRepository.kt) veri katmanı genişletilerek `WarehouseTask` nesnesine **LPN kodu**, **Lot No**, **SKT**, **Birim** ve **Ürün Görseli** alanları eklendi.
- `fetchWarehouseTasks` fonksiyonu, veritabanından dönen görevlerin meta verilerindeki ID referanslarını (`stock_item_id`, `from_location_id`, `target_location_id`, `lpn_id`) toplu olarak ve paralel (async) sorgularla çözümleyecek şekilde güncellendi.

### 2. Putaway İş Ekranı Tasarımı ve Kuralları (`WmsPutawayScreen`)
- [WmsPutawayScreen.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsPutawayScreen.kt) dosyası oluşturuldu ve şu özellikler sağlandı:
  - **Ürün Kartı:** Ürün fotoğrafı (varsa dinamik olarak Railway API sunucusundan Coil ile yüklenir), ürün adı, SKU ve birim bilgisi gösterilir.
  - **LPN ve Lot/SKT Bilgileri:** Palet/LPN kodu ile Lot numarası ve SKT (Son Kullanma Tarihi) bilgileri ayrı kartlarda gösterilir.
  - **Önerilen Hedef Lokasyon:** Personelin stoğu yerleştirmesi gereken önerilen adres (örn: `LOC-Z9-K9-R9-S9` formatında) net şekilde vurgulanır.
  - **Canlı Konum Doğrulaması:** Okutulan lokasyon barkodu `/api/wms/parse-barcode` endpoint'i üzerinden sunucuda anlık doğrulanır.
    - Lokasyon doğru ise yeşil çerçeve ile "LOKASYON DOĞRULANDI" feedback'i gösterilir ve "GÖREVİ TAMAMLA" butonu aktifleşir.
    - Lokasyon hatalı ise kırmızı çerçeve ile "HATALI LOKASYON" uyarısı gösterilir, görev tamamlatılmaz ve sunucu tarafında `warehouse_task_events` tablosuna `scan_failed` olayı yazılır.
  - **Miktar Seçimi:** Adet ayarlama widget'ı ile yerleştirilen miktar girilebilir.

### 3. Derleme ve APK Çıktısı
- **Kotlin Derlemesi:** `.\gradlew.bat compileDebugKotlin` komutuyla tüm Compose ve veri katmanı kodları başarıyla derlendi.
- **Debug APK Derlemesi:** `.\gradlew.bat assembleDebug` komutuyla [app-debug.apk](file:///c:/RMSv3/wms-android/app/build/outputs/apk/debug/app-debug.apk) dosyası sorunsuz şekilde paketlendi.

---

## WMS-03E: Android Lokasyon Yönlendirmeli Picking

Depo personelinin şube siparişlerini lokasyon ve palet/LPN yönlendirmesiyle hatasız toplayabilmesi için çift aşamalı picking (toplama) ekranı ve entegrasyonu tamamlandı.

### 1. Sunucu API ve SQL Hizalaması
- `/api/wms/parse-barcode` endpoint'indeki SQL sorgusu, picking görevleri metasındaki `stock_item_id` ve `location_id` parametreleriyle uyumlu olacak şekilde `COALESCE` fonksiyonları ile güncellendi.
- [WmsRepository.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/data/WmsRepository.kt) veri katmanında picking görevleri için `location_id` anahtarı kaynak lokasyon ID'si olarak çözümlenecek şekilde refaktör edildi.

### 2. Çift Aşamalı Picking Ekranı (`WmsPickingScreen`)
- [WmsPickingScreen.kt](file:///c:/RMSv3/wms-android/app/src/main/java/com/suitable/wms/ui/main/WmsPickingScreen.kt) dosyası oluşturuldu ve şu akış uygulandı:
  - **Aşama 1 (Lokasyon Okutma):** Personel, önerilen toplama kaynak lokasyon barkodunu taratana kadar 2. aşama kilitli kalır. Hatalı lokasyon tarandığında kırmızı feedback uyarısı gösterilir ve işlem engellenir.
  - **Aşama 2 (Ürün / LPN Okutma):** Doğru lokasyon okutulduktan sonra aktifleşir. Doğru ürün barkodu veya palet LPN barkodu taranmalıdır.
  - **Kısmi Toplama Desteği (Stock Shortage):** Eğer taranan adet hedeflenen miktardan az ise, "Kısmi Tamamla" seçeneği ile görev sonlandırılabilir. Bu durumda sunucu tarafında görev `exception` durumuna geçirilir, PO ve sevkiyat satırları otomatik olarak toplanan miktara göre güncellenir.

### 3. Derleme ve APK Çıktısı
- **Kotlin Derlemesi:** `.\gradlew.bat compileDebugKotlin` komutuyla tüm Compose ve veri katmanı kodları başarıyla derlendi.
- **Debug APK Derlemesi:** `.\gradlew.bat assembleDebug` komutuyla [app-debug.apk](file:///c:/RMSv3/wms-android/app/build/outputs/apk/debug/app-debug.apk) dosyası sorunsuz şekilde paketlendi.

---

## WMS-03F: Android Fotoğraf Kanıtı ve Dosya Upload Entegrasyonu

Depo personelinin el terminali kamerasından fotoğraf çekebileceği, galeriden seçebileceği ve bu fotoğrafları doğrudan sunucuya yükleyip görev kanıtı olarak veritabanında saklayabileceği entegrasyon tamamlandı.

### 1. Veritabanı ve Sunucu Katmanı Entegrasyonu
- **RPC Güncellemeleri (`migrations/045_add_evidence_photo_to_task_events.sql`):**
  - `complete_warehouse_putaway_task` ve `complete_warehouse_shipment_task` RPC fonksiyonları güncellendi.
  - Opsiyonel `p_evidence_photo_url TEXT DEFAULT NULL` parametresi eklendi.
  - Görev tamamlandığında üretilen olay günlüğünün (`warehouse_task_events.payload`) JSONB kolonuna `evidence_photo_url` anahtarıyla yüklendiği doğrulanmıştır.
- **Göç Betiği (`server/wms_migration.js`):**
  - Göç adımlarının sonuna yeni sql dosyası eklenerek Railway Postgres veritabanına başarıyla uygulandı (`0 errors`).
  - Göçlerin yerel ortamda da sorunsuz çalışabilmesi için `server/.env` dosyasını otomatik yükleyen `loadServerEnv()` yardımcı fonksiyonu entegre edildi.
- **Generic API Desteği (`server/index.js`):**
  - `jsonbColumns` tanımına `warehouse_tasks: new Set(['meta'])` ve `warehouse_task_events: new Set(['payload'])` tabloları eklenerek, generic güncelleme ve sorguların JSON serialization hataları engellendi.

### 2. Android Manifest ve Kaynak Katmanı
- **İzinler:** `AndroidManifest.xml` içerisine galeri okuma izinleri (`READ_EXTERNAL_STORAGE` - maxSdkVersion 32 ve Android 13+ için `READ_MEDIA_IMAGES`) tanımlandı.
- **FileProvider:** Uygulamanın kendi önbelleğinde oluşturduğu geçici dosya URI'larını kamera uygulamasıyla güvenli paylaşabilmesi için FileProvider tanımlandı.
- **Yollar (`res/xml/file_paths.xml`):** FileProvider'ın önbellek klasörünü (`cacheDir` ve `externalCacheDir`) okuyabilmesi için yollar dosyası oluşturuldu.

### 3. Android Veri ve API Katmanı
- **Retrofit Dosya Upload (`ApiClient.kt`):**
  - `ApiService` arayüzüne `@Multipart @POST("api/upload")` ile dosya yükleme API'si (`uploadFile`) eklendi.
  - OkHttp 4 standartlarına uygun `toMediaTypeOrNull()` ve `asRequestBody()` extension fonksiyonları kullanıldı.
  - Dosya yükleme sonucunu karşılayacak `UploadResponse` ve `UploadData` modelleri tanımlandı.
- **Repository Parametre Hizalaması (`WmsRepository.kt`):**
  - `completePutawayTask` ve `completeShipmentTask` fonksiyonlarına `evidencePhotoUrl: String?` parametresi eklendi ve bu değer veritabanı RPC parametresi `p_evidence_photo_url` olarak eşleştirildi.

### 4. UI ve Validasyon Kontrolleri (`WmsPutawayScreen` & `WmsPickingScreen`)
- **Kanıt Fotoğrafı Arayüzü:**
  - Ekrana "KANIT FOTOĞRAFI" kartı eklenerek "FOTOĞRAF ÇEK" ve "GALERİDEN SEÇ" butonları yerleştirildi.
  - Fotoğraf yükleme esnasında inline dairesel yüklenme animasyonu gösterilmektedir.
  - Yükleme tamamlandıktan sonra sunucudan dönen resim yolu Coil `AsyncImage` ile kart içerisinde anında önizlenir ve silme butonu gösterilir.
- **Zorunlu Kanıt Validasyonu:**
  - Görev `exception` statüsünde ise veya toplama görevi hedeflenen miktardan az toplanıp (kısmi toplama) `exception` statüsü alacaksa, fotoğraf yüklenmesi **zorunlu** hale getirilmiştir. Kanıt fotoğrafı yüklenmeden onay butonları kilitli kalır.
  - Normal ve başarılı görevlerde fotoğraf yüklenmesi opsiyonel olarak sürdürülmektedir.

### 5. Mobil Ekran Durum Yönetimi (`WmsMobileScreen`)
- Kamera ve galeri tetikleyicileri `rememberLauncherForActivityResult` ile kurularak, geçici önbellek dosyaları (`cacheDir`) üzerinde dosya kopyalama/çekme ve API'ye MultipartBody olarak gönderme akışı yazıldı.
- Görev kapatıldığında (`Vazgeç` veya `Tamamla`) yüklenmiş fotoğraf url bilgileri ve geçici durumlar otomatik olarak sıfırlanır.

### 6. Derleme ve Paketleme Doğrulamaları
- **Kotlin Derleme Testi:** `.\gradlew.bat compileDebugKotlin` komutuyla sıfır hata ve modern OkHttp 4 API kullanımı ile derleme başarıyla sağlandı.
- **Debug APK Derlemesi:** `.\gradlew.bat assembleDebug` komutuyla [app-debug.apk](file:///c:/RMSv3/wms-android/app/build/outputs/apk/debug/app-debug.apk) dosyası sorunsuz şekilde paketlendi.

---

## WMS-03G: Android Paket Barkodu, Ölçü/Ağırlık ve Yük Önizleme

Bu adımda, Android WMS ekranlarında ürün/paket barkodu okutulduğunda paketleme biriminin hacim, ağırlık, ölçü ve katsayı bilgilerinin gösterilmesi, yükleme/paketleme ekranlarında araç kapasite kontrolünün sunucu tabanlı gerçekleştirilerek kapasite aşımında işlemin engellenmesi sağlandı.

### 1. Veritabanı ve Şema Normalize Edilmesi (WMS-04D / WMS-04G)
- **SQL Göçü (`migrations/046_wms_packaging_and_capacity_schema.sql`):**
  - `stock_item_package_units` tablosu eklendi; en, boy, yükseklik çarpımıyla otomatik hesaplanan `volume_m3` generated kolonu eklendi.
  - `vehicles` tablosu `max_volume_m3`, `max_weight_kg`, iç ölçüler ve sıcaklık sınıfı gibi kapasite ve hacim alanlarıyla genişletildi.
  - `warehouse_shipment_lines` tablosuna paketleme birimi ve hacim/ağırlık kolonları (`package_unit_id`, `package_qty`, `line_volume_m3`, `line_gross_weight_kg`) eklenerek yükleme verisi takip edilebilir hale getirildi.
  - `product_external_barcodes` tablosuna `package_unit_id` kolonu eklenerek barkodların paketleme birimleriyle ilişkilendirilmesi sağlandı.
  - `get_warehouse_shipment_capacity(shipment_id)` veritabanı fonksiyonu yazıldı. Bu fonksiyon sevkiyatın toplam hacim ve ağırlığı ile araç kapasite durumunu dinamik hesaplamaktadır.
  - `complete_warehouse_shipment_task` RPC fonksiyonu, yükleme (`load`) görevlerinde araç doluluk durumunu kontrol edecek ve kapasite aşımı durumunda işlemi `fail-closed` olarak reddedecek şekilde güncellendi.

### 2. Sunucu API Güncellemeleri (`server/index.js`)
- `/api/wms/parse-barcode` endpoint'i güncellenerek, taranan barkod bir paket birimiyle eşleşiyorsa `package_unit` detaylarıyla birlikte dönmesi sağlandı.
- `/api/wms/shipment-capacity/:shipment_id` endpoint'i eklenerek, sevkiyatın güncel toplam yük ve araç doluluk durumunun Android tarafına beslenmesi sağlandı.

### 3. Android İstemci Katmanı ve Durum Yönetimi
- **Modeller (`WmsScanResult.kt`, `ApiClient.kt`):** `WmsScanPackageUnit` ve `ShipmentCapacityResponse` veri sınıfları tanımlandı, `getShipmentCapacity` API servisi eklendi.
- **Ortak Paket Bilgi Kartı (`WmsPackageInfoCard.kt`):** Okutulan barkod bir paket birimine aitse, birim katsayısı, ölçüleri, hacim ve ağırlık bilgilerini gösteren ortak Compose kartı oluşturuldu. Hacim/ağırlık verileri tanımsızsa kırmızı renkli master veri eksikliği uyarısı verilmektedir.
- **Yükleme ve Paketleme Ekranı (`WmsPackLoadScreen.kt`):** `pack` ve `load` görevleri için özel ekran tasarlandı. Araç plaka bilgisiyle birlikte toplam yük hacmi ve ağırlığı, aracın maksimum sınırlarına oranlanarak grafiksel ve renkli ilerleme çubuklarıyla (progress bar) gösterilmektedir.
- **Kapasite Validasyon Kontrolü (`WmsMobileScreen.kt`):** Eğer araç kapasitesi aşılmışsa (`is_exceeded == true`), "Görevi Tamamla" butonu pasif hale getirilir ve inline uyarı mesajı gösterilir. Görev sonlandırılmak istendiğinde de sunucu taraflı doğrulama yapıldığından veri bütünlüğü tam olarak güvence altına alınmıştır.

### 4. Derleme ve APK Çıktısı
- **Kotlin Derleme Testi:** `.\gradlew.bat compileDebugKotlin` başarıyla tamamlandı.
- **Debug APK Derlemesi:** `.\gradlew.bat assembleDebug` komutuyla [app-debug.apk](file:///c:/RMSv3/wms-android/app/build/outputs/apk/debug/app-debug.apk) dosyası sorunsuz şekilde paketlendi.
