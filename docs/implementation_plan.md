# Duyuru ve Bildirim Sistemi Geliştirme Planı

Bu plan, `personel-android` mobil uygulamasına çalışanlar arası duyuru yapma, okuma, okundu onayı verme özellikleri ile yeni görev atama, durum güncelleme, geciken görevler ve yeni duyuru olaylarına dair bildirim takip arayüzleri eklemeyi amaçlar.

---

## Kullanıcı İncelemesi Gereken Konular

> [!IMPORTANT]
> **Yetki Seviyeleri ve Duyuru Yapma:**
> Duyuru ekleme yetkisi varsayılan olarak `staffSession.authorityLevel` değeri `"ADMIN"`, `"MANAGER"`, `"GENEL MERKEZ"` veya `"ŞUBE MÜDÜRÜ"` olan kişilere verilecektir. Diğer personel ise sadece duyuruları okuyabilecek ve okundu onayı (receipt) gönderebilecektir.

> [!NOTE]
> **Görev Gecikme Bildirimleri (Auto-Detection):**
> Gecikmiş görevlerin bildirimlerini oluşturmak için arka planda bir cron çalıştırılamayacağı için (Postgres trigger'ı yerine), kullanıcının görevler ekranını veya ana sayfayı açtığı anda **istemci bazlı otomatik tarama (overdue check)** yapılacak ve eğer veritabanında o gecikme için daha önce bildirim oluşturulmadıysa otomatik olarak `personnel_notifications` tablosuna bir satır yazılacaktır.

---

## Açık Sorular

* **Duyuru Hedef Seçenekleri:** Duyuru oluşturulurken hedef kitle olarak "Tüm Şubeler" (all) ve "Sadece Kendi Şubem" (branch) dışında "Departman Bazlı" (position/role) bir ayrım eklenmeli mi? *(Plana şimdilik tüm şubeler ve aktif şube hedefleri eklenmiştir.)*

---

## Önerilen Değişiklikler

### [Veritabanı Katmanı]

#### [NEW] [create_notifications_table.sql](file:///x:/RMSv3/sql/create_notifications_table.sql)
- Bildirimleri veritabanında saklamak için yeni `personnel_notifications` tablosunun ve indeksinin oluşturulması:
  ```sql
  CREATE TABLE IF NOT EXISTS public.personnel_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personnel_id TEXT NOT NULL, -- Alıcı personel ID veya 'all' veya 'branch_[branchId]'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'task_assigned', 'task_updated', 'task_overdue', 'new_announcement', 'order_approval_pending'
    related_id VARCHAR(255),
    is_read BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_personnel_notifications_personnel ON public.personnel_notifications (personnel_id);
  ```

---

### [Veri / Depo Katmanı]

#### [NEW] [AnnouncementRepository.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/AnnouncementRepository.kt)
- Duyuru verilerini Supabase/Query API üzerinden yöneten sınıf:
  - `fetchAnnouncements(personnelId: String, branchId: String): List<AnnouncementItem>`
  - `markAsRead(announcementId: String, personnelId: String): Boolean`
  - `createAnnouncement(title: String, content: String, targetType: String, targetId: String?, priority: String, requestReadReceipt: Boolean, createdBy: String): Boolean`

#### [NEW] [NotificationRepository.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/NotificationRepository.kt)
- Bildirim verilerini ve okundu durumlarını yöneten sınıf:
  - `fetchNotifications(personnelId: String, branchId: String): List<NotificationItem>`
  - `markAsRead(notificationId: String): Boolean`
  - `markAllAsRead(personnelId: String, branchId: String): Boolean`
  - `createNotification(personnelId: String, title: String, message: String, type: String, relatedId: String?): Boolean`

#### [MODIFY] [TaskRepository.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt)
- Görev durum güncellemelerinde (`updateTaskStatus`, `updateTaskParticipant`) ilgili kişilere bildirim üretmek üzere `NotificationRepository` çağrılarının entegre edilmesi:
  - Yeni görev atandığında alıcıya `'task_assigned'` bildirimi yazılması.
  - Göreve yeni bir checklist eklendiğinde veya tamamlandığında oluşturana `'task_updated'` bildirimi yazılması.

---

### [Mobil Kullanıcı Arayüzü Katmanı]

#### [NEW] [AnnouncementsScreen.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/AnnouncementsScreen.kt)
- **Liste Ekranı:** Önceliklerine göre sıralanmış (Düşük, Normal, Yüksek, Acil) duyuruların kart şeklinde gösterimi.
- **Detay Modalı:** Tıklanan duyurunun içeriği, yazarı, tarihi ve `Okundu Bilgisi` isteği varsa "Okudum ve Anladım" onay butonu.
- **Duyuru Ekleme Formu:** Yetkili personeller için (Admin/Müdür) başlık, içerik, hedef şube, öncelik ve okundu bilgisi onay kutusu içeren form modalı.

#### [NEW] [NotificationsScreen.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/NotificationsScreen.kt)
- Bildirimlerin tarih sırasına göre listesi (Okunmuş/Okunmamış ayrımı).
- Türüne göre ikonik görselleştirme (Gecikme -> Kırmızı Uyarı İkonu, Yeni Görev -> Liste İkonu, Duyuru -> Megafon).
- Bildirime tıklanıldığında ilgili göreve veya duyuruya otomatik yönlendirme ve bildirimin otomatik okunmuş yapılması.
- "Hepsini Okundu Yap" butonu.

#### [MODIFY] [HomeScreen.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt)
- **TopAppBar Entegrasyonu:** `AppScaffold` bileşenine Menu ikonunun soluna gelecek şekilde bildirim zili (bell) ikonu eklenmesi. Okunmamış bildirim sayısı kadar zil üzerinde kırmızı badge gösterilecektir.
- **Duyurular Panosu:** Ana sayfanın üst kısmına, en son yayınlanan duyuruları gösteren kaydırılabilir bir "Duyurular ve Haberler" panosu eklenmesi.
- **Sidebar Menüsü:** Dropdown içerisine `Megafon İkonlu Duyurular` ve `Zil İkonlu Bildirimler` menü kalemlerinin eklenmesi.

#### [MODIFY] [MainScreen.kt](file:///x:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt)
- Rota ağacına `"announcements"` ve `"notifications"` ekranlarının rotalarının eklenmesi ve view state'lerinin tanımlanması.

---

## Doğrulama Planı

### Otomatik Testler
- Değişikliklerden sonra android projesinin başarıyla derlendiğinin doğrulanması:
  `.\gradlew.bat assembleDebug` (personel-android klasöründe)

### Manuel Doğrulama
1. **Duyuru Yayınlama:** Yönetici olarak giriş yapıp yeni bir "Acil" ve "Okundu Onaylı" duyuru oluşturulduğunda bu duyurunun tüm personelin ana sayfasına düştüğü teyit edilecek.
2. **Okundu Bilgisi:** Çalışan duyuruyu açıp "Okudum" butonuna bastığında veritabanında `announcement_reads` tablosuna ilgili satırın eklendiği ve butonun kaybolduğu kontrol edilecek.
3. **Görev Bildirimi:** Bir çalışana yeni görev atandığında zil ikonunun üstündeki kırmızı sayacın arttığı ve bildirim detayının "Yeni Görev Atandı" şeklinde göründüğü test edilecek.
4. **Yönlendirme:** Gecikmiş görev bildirimine tıklandığında uygulamanın doğrudan Görevler ekranına yönlendirdiği ve o bildirimi "okunmuş" olarak güncellediği doğrulanacak.
