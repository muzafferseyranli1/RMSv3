# Duyuru ve Bildirim Sistemi Görev Takip Listesi (task.md)

- `[x]` 1. Veritabanı Katmanı: `personnel_notifications` tablosunun oluşturulması
- `[x]` 2. Veri / Depo Katmanı
  - `[x]` `AnnouncementRepository.kt` oluşturulması (duyuru getirme, okuma, oluşturma)
  - `[x]` `NotificationRepository.kt` oluşturulması (bildirim getirme, okundu yapma, oluşturma)
  - `[x]` `TaskRepository.kt` entegrasyonu (görev atama ve güncellemelerde bildirim yazımı)
- `[x]` 3. Arayüz ve Rotalama
  - `[x]` `AnnouncementsScreen.kt` oluşturulması (Duyuru listesi, detay modalı, ekleme formu)
  - `[x]` `NotificationsScreen.kt` oluşturulması (Bildirim listesi, yönlendirmeler, okunmuş/okunmamış)
  - `[x]` `HomeScreen.kt` entegrasyonu (TopAppBar zili, duyurular panosu, sidebar menüsü)
  - `[x]` `MainScreen.kt` entegrasyonu (yeni rotaların eklenmesi)
- `[ ]` 4. Derleme ve Doğrulama
  - `[ ]` Projenin hatasız derlenmesi (`.\gradlew.bat assembleDebug`)
  - `[ ]` Test cihazına kurulum ve manuel doğrulama (PDKS girişi, duyuru ekleme, bildirim tetikleme)
