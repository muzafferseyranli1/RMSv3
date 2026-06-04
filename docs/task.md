# Görev Listesi - Görev Ekleri, Form Gösterimi ve Durum Aksiyonları

- `[x]` 1. Android Veri Katmanı Değişiklikleri (`TaskRepository.kt`)
  - `[x]` `TaskAttachment`, `FormSubmissionDetail` ve `FormSubmissionPhoto` veri sınıflarını (data class) tanımlamak.
  - `[x]` `fetchTaskAttachments(taskId: String)` veritabanı sorgu fonksiyonunu eklemek.
  - `[x]` `fetchFormSubmissionDetail(submissionId: String)` veritabanı sorgu fonksiyonunu eklemek.
  - `[x]` `sendBackTask`, `delegateTask`, `softDeleteTask` ve `addSystemChatMessage` durum güncelleme ve chat fonksiyonlarını eklemek.
- `[x]` 2. Arayüz Temizliği ve Ekler Listesi (`TasksScreen.kt`)
  - `[x]` Regex helper fonksiyonu tanımlamak ve `TaskCard` ile `TaskDetailDialog` açıklamalarını temizleyip göstermek.
  - `[x]` `TaskDetailDialog` bileşeninde `attachments` listesini yükleyip Coil `AsyncImage` ve dosya linkleri ile listelemek.
- `[x]` 3. Form Detay Ekranı (`TasksScreen.kt`)
  - `[x]` `FormDetailDialog` Compose diyalog bileşenini tasarlamak (Mor header, bildirim zili, şube pilleri, kanıt fotoğrafları ve soru-yanıt kartları).
  - `[x]` `TaskDetailDialog` açıklamasının altına "İlişkili Form Yanıtını Göster" mor butonunu eklemek ve `FormDetailDialog`'u bağlamak.
- `[x]` 4. Görev Durum Aksiyonları (`TasksScreen.kt`)
  - `[x]` `SendBackPromptDialog` (gerekçe girişi) ve `DelegatePersonnelDialog` (personel seçimi) Compose diyaloglarını tasarlamak.
  - `[x]` `TaskDetailDialog` altına "Geri Gönder", "Delege Et", "Pasife Al" butonlarını entegre etmek ve ilgili fonksiyonlara bağlamak.
- `[x]` 5. Derleme ve Doğrulama
  - `[x]` Android derleme testleri (`.\gradlew.bat compileDebugKotlin` ve `.\gradlew.bat assembleDebug`).
  - `[x]` Değişiklikleri `walkthrough.md` ve `OperationSync.md` dosyalarına kaydetmek.
