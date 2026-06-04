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
    - *View:* `MainScreen.kt`, `PinLoginScreen.kt`, `HomeScreen.kt` (Dashboard), `TableScreen.kt`, `TableOrderScreen.kt`, `TableOrdersScreen.kt`, `TasksScreen.kt`
    - *ViewModel:* `MainViewModel.kt` ve `MainScreenViewModel.kt`
    - *Repository/Data:* `TableRepository.kt` (Veritabanı işlemleri, sipariş gönderme, doluluk tespiti, garson talepleri), `TaskRepository.kt` (Görevler, sohbet, onaylar ve recurrence kuralları).

## 3. Uygulama Yapısı ve Temel Mantık
Uygulama, restoran personelinin şube içi operasyonları (masaları izleme, garson çağrılarını yanıtlama, sipariş alma ve adisyon özetini görme) yürütebilmesi amacıyla tasarlanmıştır:
- **Güvenlik Kapısı (PIN Login):** Personel 4 haneli PIN koduyla sisteme girer. `PinLoginScreen.kt` aracılığıyla veritabanındaki `settings` tablosundan şube ağacı ve çalışan izinleri doğrulanır, şube seçimi yaptırılarak `StaffSession` nesnesi oluşturulur.
- **Oturum Yönetimi:** `PersonelPrefs` SharedPreferences dosyasında Gson ile serialize edilmiş aktif `StaffSession` saklanır. Çıkış yapıldığında bu oturum verisi silinir.
- **Dinamik Tema:** `MusteriAppTheme` teması dinamik renk desteğiyle uyumlu şekilde personelde de kullanılmaktadır.
- **Görev Yönetimi ve Tekrarlar:** `/tasks` sayfası ile tam entegre, veritabanındaki `task_recurrence_rules` tablosunu destekleyen günlük/haftalık/aylık/yıllık dinamik tekrar parametreleri ile yeni görevler oluşturulabilir.

## 4. Ekran Durumları (UI & UX)
- **PIN Giriş Ekranı (`PinLoginScreen.kt`):** Sayı tuş takımı, otomatik 4 hane doğrulama ve çoklu şube yetkisi olan personele şube seçtiren M3 diyalog paneli.
- **Personel Paneli (`HomeScreen.kt`):** PDKS giriş/çıkış (Mesai Başlat/Bitir) kartı. Giriş ve çıkış saatleri planlanan vardiya ile karşılaştırılır ve ±5 dakikalık toleransı aşan durumlarda Türkçe uyarısı (`Vardiya planınızda X dk geç/erken...`) gösterilir.
- **Garson Terminal Seçimi & Masalar (`TableScreen.kt`):** Garson modülünde aktif terminal eşleştirilerek sadece o terminalin yetki alanındaki masalar listelenir. Masalardan gelen müşteri çağrıları (Garson çağır/hesap iste) animasyonlu (pulse) bildirim olarak kartlarda belirir, tıklandığında çözümlenebilir.
- **Sipariş Kabulü:** Müşteriden gelen ve henüz garson atanmamış siparişler (`status = 'pending_waiter_assignment'`) için garsona diyalog uyarısı çıkar, garson PIN koduyla siparişi kendi üzerine kabul edebilir.
- **Görevler Ekranı (`TasksScreen.kt`):** Şirket içi görevlerin takibi, kontrol listeleri, görev içi chat akışı, onay talebi/geri gönderme süreçleri ve detaylı tekrarlama kuralı tanımlama arayüzü sunulur.

## 5. Nerede Kaldık & Sonraki Adımlar
Proje şu anda sıfır hata ile derlenmekte ve debug APK çıktısı başarıyla üretilmektedir.
- **Konum Doğrulamalı QR Mesai Girişi (Tamamlandı):** Personelin mobil uygulamada vardiya başlatırken (OUT -> IN) şubeye özel bir QR kodu taratması ve cihazının GPS konumu ile şubenin kayıtlı enlem/boylam koordinatları arasındaki mesafenin doğrulanması özelliği başarıyla eklendi.
  - Sapma limiti 100 metredir.
  - Kadıköy şubesi test koordinatları veritabanında `41.028595, 29.177221` olarak tanımlanmıştır.
  - Mesafe kontrolü Android'in native `Location.distanceBetween` metodu kullanılarak hassas bir şekilde hesaplanır.
  - Konum izinleri (`ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`) çalışma zamanında dinamik olarak istenir.
  - Koordinat bilgileri `StaffSession` nesnesi içerisinde oturum boyunca saklanır.
- **Çalışma Planı Ekranı (Tamamlandı):** Personelin bugünden itibaren tanımlanmış olan vardiya planlarını listeyen salt okunur "Çalışma Planı" ekranı eklendi.
  - Bu sayfada vardiyaların giriş-çıkış saatleri, mola süreleri ve mola hariç net çalışma süreleri hesaplanıp gösterilmektedir.
  - Sayfa açıldığında sadece bugünden itibaren gelecek günler yüklenerek veri trafiği optimize edilir. Sayfa sağ üstündeki yenileme butonuna basıldığında cari ayın geçmiş günleri de dahil edilerek veriler güncellenir.
  - Bu sayfaya hem yan menüden (Sidebar) hem de ana sayfadaki "Yarın" ve "Sonraki" kartlarına tıklanarak ulaşılabilir.
- **Görev Ekleri, Form Gösterimi ve Durum Aksiyonları (Tamamlandı):** Görev detayları ekranında eklerin listelenmesi, otomatik formlardan oluşan görevlerin form yanıtını mobil uyumlu biçimde gösteren `FormDetailDialog` entegrasyonu ve durum eylemlerinin ("Geri Gönder", "Delege Et", "Pasife Al") entegrasyonu tamamlandı.
  - Görev açıklamalarındaki `[Form ID: <submission_id>]` metinleri Regex ile temizlendi ve altına mor renkli "İlişkili Form Yanıtını Göster" butonu yerleştirildi.
  - Tıklandığında soru-yanıt listesini, kanıt fotoğraflarını ve şube/tarih pillerini şık bir biçimde gösteren `FormDetailDialog` Compose overlay modali açılmaktadır.
  - Görev ekleri (`task_attachments`) algılanarak dosya türlerine göre resimler Coil `AsyncImage` ile, dosyalar simgeli tıklanabilir linkler halinde listelendi.
  - Detay ekranına "Geri Gönder" (gerekçe promptu ile), "Delege Et" (personel seçici listesiyle) ve "Pasife Al" (onay diyaloguyla) durum eylemleri entegre edildi.
- Sonraki çalışmalarda yeni eklenebilecek mal kabul ve depo modülleri için Compose ekranları geliştirilebilir.


## 6. Önemli Dosyaların Konumları
- Navigasyon ve Kontrolör: [MainScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt)
- PIN Girişi ve Oturum Modeli: [PinLoginScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/PinLoginScreen.kt)
- Personel Dashboard (PDKS & Vardiya Toleransı & Konumlu QR): [HomeScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt)
- Çalışma Planı Ekranı (Vardiyalar & Net Çalışma): [ShiftPlanScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/ShiftPlanScreen.kt)
- Masalar ve Çağrı Yönetimi: [TableScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TableScreen.kt)
- Görevler ve Tekrarlayan Kurallar: [TasksScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt)
- Sipariş Alma: [TableOrderScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TableOrderScreen.kt)
- Masa Hesap & Adisyonlar: [TableOrdersScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TableOrdersScreen.kt)
- İzin Tanımları: [AndroidManifest.xml](file:///C:/RMSv3/personel-android/app/src/main/AndroidManifest.xml)
