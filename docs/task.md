# Görev Listesi - Tekrarlayan Görevler ve PDKS Vardiya Tolerans Kontrolü

- `[x]` 1. Web Paneli Görev Ekranı (`Tasks.jsx` ve Modaller)
  - `[x]` `Tasks.jsx` formuna dinamik tekrar detay alanlarını (Günlük, Haftalık, Aylık, Yıllık) ekle.
  - `[x]` Modallerin (`Yeni Görev`, `Duyuru Yayınla`) başlığına renkli şeritler/görsel ayrım ekle.
  - `[x]` `TaskClosureModal.jsx` (Yeşil şerit) ve Türkçe karakter düzeltmesi.
  - `[x]` `TaskSendBackModal.jsx` (Kırmızı şerit) ve Türkçe karakter düzeltmesi.
  - `[x]` `TaskDelegateModal.jsx` (Mor şerit) ve Türkçe karakter düzeltmesi.
- `[x]` 2. Personel Android: `TaskRepository.kt` Güncellemesi
  - `[x]` `createTask` metoduna `intervalValue`, `weekdays`, `monthDay`, `monthNth`, `monthWeekday`, `specificDates` parametrelerini ekle.
  - `[x]` Insert sorgusunda `task_recurrence_rules` tablosuna bu parametreleri kaydet.
- `[x]` 3. Personel Android: `TasksScreen.kt` Güncellemesi
  - `[x]` `CreateTaskDialog` içerisine dinamik tekrar detay alanlarını (Günlük, Haftalık, Aylık, Yıllık) ekle.
  - `[x]` Bu alanların değerlerini `repo.createTask` metoduna doğru tiplerde geçir.
- `[x]` 4. Personel Android: `HomeScreen.kt` PDKS Vardiya Tolerans Kontrolü
  - `[x]` Bugün kartına tıklandığında (Giriş veya Çıkış diyaloglarında) planlanan vardiya ile kıyaslayıp 5 dakikadan fazla sapma varsa uyarı metnini göster.
- `[x]` 5. Derleme ve Doğrulama
  - `[x]` Web projesini derle (`npm run build`).
  - `[x]` Android projesini derle (`.\gradlew.bat compileDebugKotlin`).
  - `[x]` `OperationSync.md` dosyasına yapılan değişiklikleri logla.
