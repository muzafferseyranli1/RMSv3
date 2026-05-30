# Müşteri Mobil Uygulaması (Native Android Kotlin/Jetpack Compose) Geliştirme Planı

Bu plan, `/musteri-app` web arayüzünü tamamen saf (native) bir Android uygulamasına dönüştürmek için `./musteri-android` dizini altında Kotlin ve Jetpack Compose tabanlı yeni bir Android projesi başlatılmasını kapsamaktadır.

Uygulama, DB-First prensiplerine sadık kalarak, tasarım ve buton konfigürasyonlarını Railway API'si üzerinden `customer_app_config` tablosundan dinamik olarak çekecek ve sadece mobil platforma özgü premium native deneyimler (titreşimsel geri bildirim - haptic feedback, kuponlar için uzun basma - long press gestleri, akıcı sayfa geçişleri) barındıracaktır.

## Model Seçim Önerisi
> [!IMPORTANT]
> Bu aşamadan sonra büyük kod sentezleme (Kotlin sınıfları, Gradle yapılandırmaları vb.) ve hata ayıklama süreçleri gerçekleştirilecektir.
> 
> **Gemini Pro (3.1 Pro / High)** modeli bu tarz çok dosyalı mimari oluşturma, karmaşık gradle bağımlılıklarını yönetme ve derleme hatalarını çözme konularında üstün mantık yürütme yeteneğine sahiptir. Hızlı sorular veya küçük düzeltmeler için **Flash** ideal olsa da, bu projenin temelini atarken **Gemini Pro** modelini kullanmanızı tavsiye ederim.

---

## User Review Required

> [!NOTE]
> Mobil uygulamanın renk, logo, karşılama metni ve ana sayfa butonları gibi tüm arayüz parametreleri dinamik olarak Railway üzerindeki `customer_app_config` tablosundan yönetilecektir. Bu sayede, Google Play Store'a yeni bir sürüm göndermeden uygulamanın temasını ve buton yerleşimlerini web paneli üzerinden anlık olarak güncelleyebileceksiniz.

> [!WARNING]
> Uygulama tamamen native Kotlin ile yazılacağı için React/Vite projesindeki CSS stilleri doğrudan çalışmayacaktır. Ancak Jetpack Compose'un sunduğu güçlü tema motoru ile bu stiller ve renk kodları dinamik olarak Android bileşenlerine uygulanacaktır.

---

## Proposed Changes

Proje `./musteri-android` dizini altında, modern Android standartlarına (Jetpack Compose, Kotlin, Coroutines, Retrofit/OkHttp) uygun olarak kurulacaktır.

### 1. Proje Yapılandırması (Gradle & Manifest)

#### [NEW] [settings.gradle](file:///c:/RMSv3/musteri-android/settings.gradle)
- Proje isminin (`musteri-app`) ve modüllerin (`:app`) tanımlanması.

#### [NEW] [build.gradle](file:///c:/RMSv3/musteri-android/build.gradle)
- Root seviyesi build script ve Kotlin / Android Gradle Plugin tanımlamaları.

#### [NEW] [app/build.gradle](file:///c:/RMSv3/musteri-android/app/build.gradle)
- Android SDK seviyeleri (compileSdk 34, targetSdk 34, minSdk 24).
- Jetpack Compose, Material 3, Retrofit (API entegrasyonu), Coroutines ve Haptic feedback kütüphane bağımlılıkları.

#### [NEW] [AndroidManifest.xml](file:///c:/RMSv3/musteri-android/app/src/main/AndroidManifest.xml)
- Uygulama izinleri (Internet vb.) ve MainActivity tanımlamaları.

### 2. Native Uygulama Çekirdeği (Kotlin)

#### [NEW] [ApiClient.kt](file:///c:/RMSv3/musteri-android/app/src/main/java/com/suitable/musteri/api/ApiClient.kt)
- Railway API (`https://rms-api-production-219d.up.railway.app/api/query`) ile haberleşecek ve `customer_app_config` tablosunu sorgulayacak Retrofit tabanlı API istemcisi.

#### [NEW] [Theme.kt](file:///c:/RMSv3/musteri-android/app/src/main/java/com/suitable/musteri/ui/theme/Theme.kt)
- API'den gelen `primaryColor` ve gradient verilerini dinamik olarak yükleyip Material 3 temasına dönüştüren akıllı tema yapısı.

#### [NEW] [HomeScreen.kt](file:///c:/RMSv3/musteri-android/app/src/main/java/com/suitable/musteri/ui/screens/HomeScreen.kt)
- **Premium Mobil Deneyim:**
  - API'den gelen `home_buttons` dizisine göre butonları dinamik çizen Jetpack Compose arayüzü.
  - **Uzun Basma (Long Press) Hareketi:** Kupon veya özel eylemleri aktifleştirmek için uzun basma jesti algılama.
  - **Haptic Geri Feedback:** Uzun basıldığında veya butonlara tıklandığında telefonda hafif ve kaliteli bir titreşim (haptic vibration) üretme özelliği.

#### [NEW] [MainActivity.kt](file:///c:/RMSv3/musteri-android/app/src/main/java/com/suitable/musteri/MainActivity.kt)
- Uygulamanın giriş noktası. API'den config verisini asenkron olarak çeken ve `HomeScreen` bileşenini yükleyen ana aktivite.

---

## Verification Plan

### Automated Tests
- Projenin başarıyla derlendiğini doğrulamak için Gradle derleme testi koşulacaktır:
  ```bash
  cd musteri-android
  ./gradlew compileDebugKotlin
  ```

### Manual Verification
- Uygulamanın APK çıktısı (`./gradlew assembleDebug` komutuyla) üretilecek ve test edilecektir.
- API'deki renkler veya butonlar değiştirildiğinde, uygulamanın tekrar derlenmeden açılışta yeni tasarımı başarıyla yüklediği simüle edilerek doğrulanacaktır.
