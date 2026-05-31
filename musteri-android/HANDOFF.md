# Müşteri App (Native Android) - Handoff / Devir Belgesi

Bu belge, **Müşteri App**'in native Android versiyonu üzerindeki çalışmaları başka bir bilgisayarda (veya farklı bir geliştirme ortamında) sürdürebilmeniz için gerekli tüm mimari, ortam ve ilerleme bilgilerini içerir.

## 1. Geliştirme Ortamı (Environment)
Projeyi başka bir makinede açıp derleyebilmek için aşağıdaki araçlara sahip olmanız gerekir:
- **IDE:** Android Studio (Iguana veya daha yeni bir sürümü tavsiye edilir)
- **JDK:** Java Development Kit 17 (JDK 17)
- **SDK:** Android SDK (API 34/35/36 hedeflenmiştir)
- Proje kök dizini: `RMSv3/musteri-android`

Projeyi Android Studio üzerinden açtığınızda Gradle, gerekli kütüphaneleri (Compose, Retrofit, Coroutines vb.) otomatik indirecektir.

## 2. Mimari ve Kullanılan Teknolojiler
Uygulama, %100 modern Android geliştirme standartlarına uygun tasarlanmıştır:
- **UI (Kullanıcı Arayüzü):** `Jetpack Compose` (Tamamen deklaratif native UI).
- **Ağ/API:** `Retrofit` ve `Moshi` kullanılarak JSON API bağlantıları sağlanır.
- **Asenkron İşlemler:** `Kotlin Coroutines` (Özellikle `Dispatchers.IO` ile API çağrıları için).
- **Tasarım Deseni:** `MVVM (Model-View-ViewModel)`
    - *View:* `MainScreen.kt`, `CouponsScreen.kt` vb.
    - *ViewModel:* `MainViewModel.kt` (State yönetimini ve veri çekimini üstlenir).
    - *Repository/Data:* `ConfigRepository.kt` ve `ApiClient.kt`.

## 3. Uygulama Yapısı ve Temel Mantık (DB-First Theme)
Uygulamanın benzersiz tarafı, renklerinin ve özelliklerinin dinamik (veritabanı güdümlü) olmasıdır:
- Uygulama açılırken `https://rmsv3-production.up.railway.app/api/query` adresinden `customer_app_config` ayarlarını çeker.
- Çekilen verideki `brandColor` (Örn: `#22c55e`), Jetpack Compose temasına (`MusteriAppTheme`) dinamik olarak uygulanır. Tüm butonlar ve vurgular bu renge bürünür.
- `maintenanceMode` aktifse arayüz kitlenir ve bakım ekranı gösterilir.

## 4. Mevcut UI (Arayüz) Durumu
Web tarafındaki premium ve zengin CSS tasarımları native bileşenlerle yeniden yaratılmıştır:
- **Bottom Navigation (Alt Menü):** Ana Sayfa, Kartım, Kuponlar, Kampanyalar, Hesabım sekmelerini içeren ve `BottomNavigationBar.kt` içinde tanımlanan akıcı bir menü.
- **Premium Kupon Tasarımı:** `CouponCard.kt` ve `TicketShape.kt` kullanılarak web uygulamasındaki tırtıklı (scallop) kenarlar, renkli gradyanlar (`Brush.linearGradient`), kesik çizgiler ve döndürülmüş dikey metinler native (Canvas tabanlı) olarak kodlanmıştır.
- **Donanımsal Etkileşimler:** Kupona uzun basıldığında cihazın titreşim (Haptic Feedback) motoru çalışarak dokunsal bir geri bildirim verir ve kupon `AKTİF` statüsüne geçer.

## 5. Nerede Kaldık & Sonraki Adımlar
Şu anda proje yapısı ve demo premium UI %100 çalışır durumdadır (`sampleCoupons` isimli statik (mock) verileri kullanmaktadır). Başka bir makinede devam ederken aşağıdaki adımları izleyebilirsiniz:

1. **Yönetim Paneli (Web):** Arayüz renklerini (`customer_app_config` tablosu) tarayıcıdan değiştirebilmek için web projenizde (`RMSv3`) basit bir admin arayüzü inşa edebilirsiniz.
2. **Gerçek Veri Entegrasyonu:** `CouponsScreen.kt` içerisindeki `sampleCoupons` sahte listesini, Retrofit üzerinden (Kiosk veya POS sepetlerinizden) gelecek gerçek API modelleri ile değiştirebilirsiniz.
3. **QR Okuyucu (Gelecek Vizyonu):** Müşterilerin masadaki QR'ı okutup masaya oturmaları için `CameraX` kütüphanesiyle native bir barkod tarayıcı eklenebilir.

## 6. Önemli Dosyaların Konumları
- Ana Ekran ve Sekmeler: `app/src/main/java/com/suitable/musteri/ui/main/MainScreen.kt`
- Alt Menü: `app/src/main/java/com/suitable/musteri/ui/main/BottomNavigationBar.kt`
- Kupon Arayüzü: `app/src/main/java/com/suitable/musteri/ui/main/CouponsScreen.kt` ve `CouponCard.kt`
- Dinamik Tema: `app/src/main/java/com/suitable/musteri/theme/Theme.kt`
- API ve İstekler: `app/src/main/java/com/suitable/musteri/data/ApiClient.kt`

> Başka bilgisayara geçerken klasörü taşımanız veya git reposu üzerinden klonlamanız yeterlidir, Gradle tüm paketleri bağımsız olarak indirecektir. İyi çalışmalar!
