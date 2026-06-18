# Suitable WMS Android Handoff

Bu klasor WMS icin ayrilmis gercek native Android uygulama klasorudur.

## Hedef Yol

- Windows mutlak yol: `X:\RMSv3\wms-android`
- Repo ici yol: `wms-android/`
- Android application package onerisi: `com.suitable.wms`
- Ana kaynak yolu: `wms-android/app/src/main/java/com/suitable/wms/`

## Kural

Bu uygulama web route, WebView, PWA veya barkod simulasyonu degildir. Depo personelinin gercek Android cihazda kullanacagi ayri APK olarak gelistirilecektir.

## Referans Alinacak Projeler

- `personel-android/`: Kotlin, Jetpack Compose, Retrofit/Gson, Coroutines, ZXing scanner, kamera izinleri ve mevcut Android proje iskeleti icin referans.
- `musteri-android/`: Ayrik mobil uygulama klasoru duzeni icin referans.

Referans projelerden kod kopyalanabilir veya uyarlanabilir; ancak WMS kodu `personel-android` ya da `musteri-android` icine gomulmeyecektir.

## Beklenen Kurulum

Agent `wms-android` altinda bagimsiz bir Gradle Android application projesi kurmalidir:

- `settings.gradle.kts`
- `build.gradle.kts`
- `app/build.gradle.kts`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/com/suitable/wms/MainActivity.kt`
- `app/src/main/java/com/suitable/wms/data/ApiClient.kt`
- `app/src/main/java/com/suitable/wms/data/WmsApiService.kt`
- `app/src/main/java/com/suitable/wms/data/WmsRepository.kt`
- `app/src/main/java/com/suitable/wms/ui/main/*`
- `app/src/main/java/com/suitable/wms/ui/scan/*`

## Backend Ilkesi

- Android uygulama DB'ye dogrudan baglanmaz.
- Railway API uzerinden konusur.
- API hatasinda fail-closed davranir.
- Offline/local queue veya yerel done state kullanmaz.
- Server basarili donmeden WMS gorevi tamamlanmis sayilmaz.

## Dogrulama Komutlari

```powershell
cd X:\RMSv3\wms-android
.\gradlew.bat assembleDebug
.\gradlew.bat test
```

## Geliştirilen Modüller ve Ekranlar (WMS-03A - WMS-03G)

WMS Android uygulamasında depo süreçlerini yönetmek için aşağıdaki modern Compose ekranları ve veri mekanizmaları entegre edilmiştir:

1. **Giriş ve Yetkilendirme (`PinLoginScreen.kt`):** Depo personeli 4 haneli PIN kullanarak giriş yapar. Sadece `anadepo` ve `depo` tipli birimler listelenir.
2. **Ana Panel ve Kamera Entegrasyonu (`WmsMobileScreen.kt`):** Ekranın üst %22'si ZXing barkod okuyucu kamerayı barındırır. Alt %78'lik kısım ise sekmeli operasyon alanıdır. Okutulan tüm barkodlar sunucu tarafındaki `/api/wms/parse-barcode` API'si ile anlık doğrulanır.
3. **Ortak Paket Bilgi Kartı (`WmsPackageInfoCard.kt`):** Taranan barkod bir paket birimine (koli, palet vb.) karşılık geliyorsa; birim katsayısı, boyut, hacim ve ağırlık bilgilerini inline gösterir. Ölçüleri eksik paketlerde kırmızı master veri uyarısı verir.
4. **Putaway (Yerleştirme) Ekranı (`WmsPutawayScreen.kt`):** Personeli hedef lokasyona yönlendirir. Önerilen konum barkodu taranmadan görev tamamlatılmaz. Hatalı konum taramalarında sunucu hata döner ve olayı loglar.
5. **Picking (Toplama) Ekranı (`WmsPickingScreen.kt`):** Çift aşamalı toplama akışını işletir. Önce kaynak lokasyon barkodu, ardından ürün veya LPN barkodu taranmalıdır. Miktar eksik ise (kısmi toplama) kanıt fotoğrafı çekilmesi zorunlu tutulur ve sunucuda exception kaydı oluşturulur.
6. **Paketleme & Yükleme Ekranı (`WmsPackLoadScreen.kt`):** Sevkiyat satırı bazlı hacim ve brüt ağırlığı grafiksel barlar ile gösterir. Araç kapasitesi (maksimum hacim ve ağırlık) aşıldığında yükleme butonu kilitlenir ve sunucu fail-closed olarak işlemi reddeder.
7. **Fotoğraf Kanıtı & Yükleme:** Kameralı/galerili kanıt yükleme mekanizması. Görev tamamlanma isteğiyle birlikte API üzerinden yüklenen görseller `warehouse_task_events` tablosunda saklanır.



