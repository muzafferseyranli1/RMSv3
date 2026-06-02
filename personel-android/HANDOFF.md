# Personel App (Native Android) - Handoff / Devir Belgesi

Bu belge, **Personel App**'in native Android versiyonu üzerindeki çalışmaları başka bir bilgisayarda (veya farklı bir geliştirme ortamında) sürdürebilmeniz için gerekli tüm mimari, ortam ve ilerleme bilgilerini içerir.

## 1. Geliştirme Ortamı (Environment)
Projeyi başka bir makinede açıp derleyebilmek için aşağıdaki araçlara sahip olmanız gerekir:
- **IDE:** Android Studio (Iguana veya daha yeni bir sürümü tavsiye edilir)
- **JDK:** Java Development Kit 17 (JDK 17)
- **SDK:** Android SDK (API 34/35/36 hedeflenmiştir)
- **Proje kök dizini:** `RMSv3/personel-android`

Projeyi Android Studio üzerinden açtığınızda Gradle, gerekli kütüphaneleri (Compose, Retrofit, Coroutines, Gson vb.) otomatik indirecektir.

## 2. Mimari ve Kullanılan Teknolojiler
Uygulama, %100 modern Android geliştirme standartlarına uygun tasarlanmıştır:
- **UI (Kullanıcı Arayüzü):** `Jetpack Compose` (Tamamen deklaratif native UI).
- **Ağ/API:** `Retrofit` ve `Gson` kullanılarak JSON API bağlantıları sağlanır.
- **Asenkron İşlemler:** `Kotlin Coroutines` (API çağrıları ve arka plan işlemleri için).
- **Tasarım Deseni:** `MVVM (Model-View-ViewModel)`
    - *View:* `MainScreen.kt`, `PinLoginScreen.kt`, `HomeScreen.kt` (Dashboard), `TableScreen.kt`, `TableOrderScreen.kt`, `TableOrdersScreen.kt`
    - *ViewModel:* `MainViewModel.kt` ve `MainScreenViewModel.kt`
    - *Repository/Data:* `TableRepository.kt` (Veritabanı işlemleri, sipariş gönderme, doluluk tespiti, garson talepleri).

## 3. Uygulama Yapısı ve Temel Mantık
Uygulama, restoran personelinin şube içi operasyonları (masaları izleme, garson çağrılarını yanıtlama, sipariş alma ve adisyon özetini görme) yürütebilmesi amacıyla tasarlanmıştır:
- **Güvenlik Kapısı (PIN Login):** Personel 4 haneli PIN koduyla sisteme girer. `PinLoginScreen.kt` aracılığıyla veritabanındaki `settings` tablosundan şube ağacı ve çalışan izinleri doğrulanır, şube seçimi yaptırılarak `StaffSession` nesnesi oluşturulur.
- **Oturum Yönetimi:** `PersonelPrefs` SharedPreferences dosyasında Gson ile serialize edilmiş aktif `StaffSession` saklanır. Çıkış yapıldığında bu oturum verisi silinir.
- **Dinamik Tema:** `MusteriAppTheme` teması dinamik renk desteğiyle uyumlu şekilde personelde de kullanılmaktadır.

## 4. Ekran Durumları (UI & UX)
- **PIN Giriş Ekranı (`PinLoginScreen.kt`):** Sayı tuş takımı, otomatik 4 hane doğrulama ve çoklu şube yetkisi olan personele şube seçtiren M3 diyalog paneli.
- **Personel Paneli (`HomeScreen.kt`):** Personel adı, rolü ve şubesi. İnteraktif **PDKS (Mesai Başlat/Bitir)** kartı. Personel mesaiye başladığında çalışılan süreyi saniye saniye güncelleyip gösteren bir zamanlayıcı sayaç mevcuttur. Garson terminaline ve sipariş listesine hızlı geçiş kartları bulunur.
- **Masa Grid Ekranı (`TableScreen.kt`):** Şubedeki tüm masaları, doluluk durumlarını ve masalardan gelen garson çağrılarını (kırmızı yanıp sönen uyarı rozetleriyle) gösterir. Garson masaya tıkladığında servis talebini sonlandırabilir veya masaya sipariş ekleyebilir.
- **Sipariş Ekranı (`TableOrderScreen.kt`):** Müşteri sipariş ekranı ile görsel olarak aynı, ancak siparişi gönderen personel kimliğini (`personnelId`, `personnelName`) ve `customerId = null` (veya boş) bilgisini veritabanına iletir.
- **Masa Sipariş Detayı (`TableOrdersScreen.kt`):** Masanın o günkü aktif adisyonlarını, saat bazlı sipariş detaylarını, toplam adisyon tutarını listeler.

## 5. Nerede Kaldık & Sonraki Adımlar
Proje şu anda sıfır hata ile derlenmekte ve debug APK çıktısı başarıyla üretilmektedir.
1. **PDKS Arka Plan Kaydı:** Şu an yerel olarak (`PersonelPrefs`) saklanan PDKS giriş/çıkış verileri, API/Veritabanı tarafında personel çalışma saatleri tablosuna kaydedilebilir.
2. **KDS ve POS Entegrasyon Testleri:** Masalardan alınan siparişlerin POS ekranlarına ve KDS'lere (Mutfak Ekranı) düşme süreleri test edilebilir.
3. **Mal Kabul ve Diğer Sekmeler:** `MainScreen.kt` içerisinde gelecekte açılacak diğer personel yetkileri (depo, mal kabul vb.) için yeni Composable ekranlar eklenebilir.

## 6. Önemli Dosyaların Konumları
- Navigasyon ve Kontrolör: `app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt`
- PIN Girişi ve Oturum Modeli: `app/src/main/java/com/suitable/personel/ui/main/PinLoginScreen.kt`
- Personel Dashboard (PDKS): `app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt`
- Masalar Ekranı: `app/src/main/java/com/suitable/personel/ui/main/TableScreen.kt`
- Sipariş Alma: `app/src/main/java/com/suitable/personel/ui/main/TableOrderScreen.kt`
- Masa Hesap & Adisyonlar: `app/src/main/java/com/suitable/personel/ui/main/TableOrdersScreen.kt`
