# Tekrarlayan Görevler, Görsel Modal Ayrımı ve PDKS Vardiya Kontrolü

Bu plan, web panelinde ve personel mobil uygulamasında eksik olan tekrarlayan görev detay alanlarının eklenmesini, modallerin görsel şeritlerle ayrıştırılmasını ve mobil ana sayfada mesai giriş/çıkış işlemlerinde planlanan vardiyaya göre ±5 dakika kontrolünün yapılarak uyarı verilmesini içerir.

## User Review Required

> [!WARNING]
> Görev tekrar kuralları veritabanındaki `task_recurrence_rules` tablosuna tam uyumlu olarak kaydedilecektir. Mobil uygulamadaki `TaskRepository.createTask` metodunun imzası bu parametreleri destekleyecek şekilde genişletilecektir.

## Proposed Changes

### 1. Web Paneli Görev Ekranı (`Tasks.jsx` ve Modaller)
- **[MODIFY] [Tasks.jsx](file:///C:/RMSv3/src/components/pages/Tasks.jsx)**
  - "Tekrar" seçimi "Tek seferlik" dışında bir değere (Günlük, Haftalık, Aylık, Yıllık) ayarlandığında, o türe özgü detay giriş alanları (Sıklık, Günler, Aylık model, Ayın günü, N. gün, Yıllık tarihler) dinamik olarak formda gösterilecektir.
  - Form verileri `createTask` servisine aktarılırken `buildRecurrencePayload` fonksiyonunun beklentileriyle tam uyumlu olarak gönderilecektir.
  - Açılan tüm modallerin (Yeni Görev, Duyuru Yayınla) sol tarafına mor, sarı gibi renkli şeritler ve başlığa uygun ikonlar eklenerek görsel olarak ayrışmaları sağlanacaktır.
- **[MODIFY] [TaskClosureModal.jsx](file:///C:/RMSv3/src/components/pages/tasks/TaskClosureModal.jsx)**
  - Başlığa yeşil renkli şerit eklenerek diğer modallerden ayrıştırılacak. Türkçe karakterler düzeltilecektir.
- **[MODIFY] [TaskSendBackModal.jsx](file:///C:/RMSv3/src/components/pages/tasks/TaskSendBackModal.jsx)**
  - Başlığa kırmızı renkli şerit eklenerek diğer modallerden ayrıştırılacak. Türkçe karakterler düzeltilecektir.
- **[MODIFY] [TaskDelegateModal.jsx](file:///C:/RMSv3/src/components/pages/tasks/TaskDelegateModal.jsx)**
  - Başlığa mor renkli şerit eklenerek diğer modallerden ayrıştırılacak. Türkçe karakterler düzeltilecektir.

### 2. Personel Android Uygulaması
- **[MODIFY] [TaskRepository.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt)**
  - `createTask` metodunun imzası `intervalValue`, `weekdays`, `monthDay`, `monthNth`, `monthWeekday`, `specificDates` parametrelerini alacak şekilde genişletilecek.
  - `task_recurrence_rules` tablosuna ekleme yapılırken bu alanlar doğru veri tipleriyle (örneğin diziler için String listeleri) SQL Insert sorgusuna eklenecektir.
- **[MODIFY] [TasksScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt)**
  - Görev oluşturma diyalogunda (`CreateTaskDialog`), seçilen tekrar tekrar türüne göre dinamik form alanları eklenecek:
    - Günlük için: Tekrarlama sıklığı (gün sayısı) inputu.
    - Haftalık için: Haftanın günleri seçicisi (Pazartesi - Pazar).
    - Aylık için: "Belirli bir gün", "Ayın son günü", "N. hafta günü" seçenekleri ve buna bağlı dinamik alanlar.
    - Yıllık için: Tarih listesi (virgülle ayrılmış).
  - Bu form alanları `repo.createTask` metoduna iletilecektir.
- **[MODIFY] [HomeScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt)**
  - Personel Bugün kartı üzerinden mesaiye başlarken veya sonlandırırken, o günkü `todayShift` planı kontrol edilecektir.
  - Giriş yaparken: Planlanan başlangıç saatinden 5 dakikadan fazla erken veya geç ise `"Vardiya planınızda X dk erken/geç giriş yapıyorsunuz."` uyarısı gösterilecektir.
  - Çıkış yaparken: Planlanan bitiş saatinden 5 dakikadan fazla erken veya geç ise `"Vardiya planınızda X dk erken/geç çıkış yapıyorsunuz."` uyarısı gösterilecektir.

## Verification Plan

### Automated/Compilation Tests
- `npm run build` ile web projesinin derlenebilirliği doğrulanacaktır.
- `.\gradlew.bat compileDebugKotlin` ile Android projesinin sıfır hata ile derlendiği teyit edilecektir.

### Manual Verification
- Web ve Android uygulamalarında görev tanımlama formlarında tekrar kurallarının tam girilip girilemediği kontrol edilecektir.
- Mobil uygulamada Bugün kartına tıklanarak açılan diyaloglarda doğru Türkçe uyarı metninin çıktığı teyit edilecektir.
