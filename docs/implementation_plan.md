# Görev Ekleri, Form Gösterimi ve Durum Aksiyonları Entegrasyonu

Bu plan, mobil uygulamada görev detaylarına eklerin (attachments) eklenmesini, formdan gelen görevlerde form yanıtlarının şık bir arayüzde gösterilmesini ve web sürümünde yer alan "Geri Gönder", "Delege Et", "Pasife Al" aksiyonlarının mobile entegrasyonunu kapsar.

## User Review Required

> [!NOTE]
> - Görev açıklamasındaki `[Form ID: <submission_id>]` ifadesi regex ile gizlenecek, altına mor renkli "İlişkili Formu Göster" butonu yerleştirilecektir.
> - Butona tıklanınca açılacak olan diyalog, mor header, bildirim zili, şube adı, tarih/süre pilleri, kanıt görselleri ve soru & yanıt detaylarını içerecektir.
> - Görev detayının en altına web sürümündeki gibi 4 ana aksiyon butonu eklenecektir:
>   - **Geri Gönder (Send Back)**: Görev durumunu `rejected` yapar. Bir diyalog ile kullanıcıdan geri gönderme gerekçesi alınır.
>   - **Delege Et (Delegate)**: `delegation_allowed` aktifse görünür. Diğer personellerin listelendiği bir diyalog açar, seçim sonrası delege talebi (`task_approval_requests`) oluşturur.
>   - **Pasife Al (Soft Delete)**: Görevi oluşturan kişi ise görünür. Onay sonrası görevi `soft_deleted` durumuna çeker.
>   - **Tamamla (Complete) / Başlat (Start)**: Mevcut tamamlama ve başlatma mantığı mor/yeşil butonlarla sunulur.

## Proposed Changes

### 1. Android Veri Katmanı Entegrasyonu

#### [MODIFY] [TaskRepository.kt](file:///c:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt)
- `TaskAttachment`, `FormSubmissionDetail` ve `FormSubmissionPhoto` veri sınıflarını eklemek.
- `fetchTaskAttachments(taskId: String): List<TaskAttachment>` fonksiyonunu tanımlamak.
- `fetchFormSubmissionDetail(submissionId: String): FormSubmissionDetail?` fonksiyonunu ekleyerek form şablonu, yanıtları ve kanıt fotoğraflarını çekip birleştirmek.
- `sendBackTask(taskId: String, personnelId: String, reason: String, creatorId: String): Boolean` fonksiyonunu eklemek.
- `delegateTask(taskId: String, fromPersonnelId: String, toPersonnelId: String, fromPositionId: String?, toPositionId: String?, positions: List<PositionInfo>): Boolean` fonksiyonunu eklemek.
- `softDeleteTask(taskId: String, personnelId: String): Boolean` fonksiyonunu eklemek.
- Sistem mesajlarını chat akışına eklemek üzere `addSystemChatMessage(taskId: String, body: String): Boolean` fonksiyonunu yazmak.

### 2. Arayüz ve Diyalog Entegrasyonları

#### [MODIFY] [TasksScreen.kt](file:///c:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt)
- `TaskCard` ve `TaskDetailDialog` üzerinde `task.description` alanını regex (`\\[Form ID:\\s*([^\\]]+)\\]`) ile temizleyip göstermek.
- `TaskDetailDialog` bileşeninde:
  - `formId` tespit edilirse açıklamanın altına mor renkli "İlişkili Form Yanıtını Göster" butonu yerleştirmek.
  - Göreve bağlı ekleri (`task_attachments`) database'den çekerek "Ekler" başlığı altında listelemek (Görseller Coil `AsyncImage` ile, dosyalar ise dosya adı ve tıklanabilir link ile gösterilir).
  - Alt kısımdaki aksiyon butonlarını 2x2 grid yapısı veya şık buton grubu şeklinde sunmak:
    - **Geri Gönder**: Tıklanınca gerekçe girmek için `SendBackPromptDialog` açılır.
    - **Delege Et**: Tıklanınca personel listesinden seçim yapmak için `DelegatePersonnelDialog` açılır.
    - **Pasife Al**: Tıklanınca onay penceresi açılır.
    - **Görevi Başlat / Tamamla**: Mevcut başlatma ve tamamlama mekanizmaları bu buton grubuna entegre edilir.
- `FormDetailDialog` Compose bileşenini tasarlamak:
  - Mockup görselindeki mor header, zil simgesi, şube pilleri, kanıt fotoğrafları ve soru-yanıt listesini mobil ekran boyutuna uygun şekilde sunmak.
- `SendBackPromptDialog` ve `DelegatePersonnelDialog` yardımcı diyaloglarını oluşturmak.

## Verification Plan

### Automated Tests
- Projeyi `.\gradlew.bat compileDebugKotlin` ve `.\gradlew.bat assembleDebug` ile derleyerek herhangi bir Kotlin derleme veya dependency hatası olmadığını doğrulamak.

### Manual Verification
- Görev detaylarında "Geri Gönder", "Delege Et", "Pasife Al" butonlarının durumlarına göre göründüğü test edilecek.
- Geri gönderme yapıldığında gerekçenin chat ekranına düştüğü ve durumun `rejected` olduğu doğrulanacak.
- Delege etme işleminde seçilen personel için onay kaydı oluşturulduğu ve chat sistemine not düştüğü gözlemlenecek.
- Pasife alma tıklandığında görevin listeden kaldırıldığı doğrulanacak.
- Otomatik formdan oluşan görevlerde mor butona basılınca form verilerinin ve yüklenen görsellerin eksiksiz geldiği test edilecek.
