# Görevlere Form Şablonu Ekleme ve Doldurma Entegrasyon Planı

Bu plan, "Yeni Görev" modalı üzerinden bir göreve form şablonu bağlanmasını ve atanan kişinin görev detay çekmecesinden tek tıklamayla bu formu doldurmak üzere yeni bir sayfada boş form açmasını sağlayacak entegrasyonu tanımlar.

## User Review Required

> [!IMPORTANT]
> **DB-First İlkesi ve Şema Güncellemesi:**
> Görev ile form şablonu ilişkisini tutmak amacıyla `tasks` tablosuna `form_template_id` kolonu eklenecektir. Bu işlem `019_task_form_template_relation.sql` migrasyonu ile canlı veritabanında çalıştırılacaktır.
> 
> *   İşlemler Railway Postgres veritabanında gerçekleştirilecektir.
> *   `schema-railway-master.sql` dosyası güncellenerek senkronizasyon korunacaktır.

---

## Proposed Changes

### 1. Veritabanı ve Şema Güncellemeleri

#### [NEW] [019_task_form_template_relation.sql](file:///C:/RMSv3/migrations/019_task_form_template_relation.sql)
Aşağıdaki işlemleri transaction içinde uygulayacak SQL gövdesi:
1.  `tasks` tablosuna `form_template_id` (UUID) kolonunun eklenmesi.
2.  `form_templates` tablosuna foreign key ilişkisi kurulması (`ON DELETE SET NULL` kuralı ile).

#### [NEW] [run-migration-019.cjs](file:///C:/RMSv3/scripts/run-migration-019.cjs)
`server/.env` dosyasındaki `DATABASE_URL` bilgisini kullanarak `019` nolu SQL migrasyonunu canlı veritabanında çalıştırıp güvenle sonlanacak Node.js betiği.

#### [MODIFY] [schema-railway-master.sql](file:///C:/RMSv3/schema-railway-master.sql)
*   `public.tasks` tablosunun `CREATE TABLE` tanımına `form_template_id` kolonunun eklenmesi.
*   Tabloya `tasks_form_template_id_fkey` yabancı anahtar kısıtının (foreign key constraint) eklenmesi.

---

### 2. Frontend ve Servis Katmanı Güncellemeleri

#### [MODIFY] [taskService.js](file:///C:/RMSv3/src/lib/taskService.js)
*   `createTask` fonksiyonunda, yeni görev oluşturulurken form nesnesindeki `formTemplateId` alanının `form_template_id` adıyla veritabanına yazılmasının sağlanması.

#### [MODIFY] [Tasks.jsx](file:///C:/RMSv3/src/components/pages/Tasks.jsx)
*   Aktif form şablonlarının (`form_templates` tablosundan) sayfa açılışında yüklenmesi ve `formTemplates` state'inde saklanması.
*   `createInitialForm` fonksiyonuna `formTemplateId: ''` alanının eklenmesi.
*   "Yeni Görev" modalındaki "Checklist ve Ekler" kartı altına, kullanıcının aktif şablonlar arasından seçim yapabilmesini sağlayan "Görevin Formu (İsteğe Bağlı)" açılır menüsünün (select) eklenmesi.
*   Görev detay çekmecesinde (`TaskDrawer`) tıklanan formu yeni sekmede açacak `handleFillForm(templateId)` fonksiyonunun tasarlanması (aktif çalışma alanı kapsamına göre `/sube-formlar`, `/merkez-depo-formlar` veya `/formlar` rotasını hedef alacaktır).
*   `TaskDrawer` bileşenine `formTemplates` ve `onFillForm` prop'larının geçirilmesi.

#### [MODIFY] [TaskDrawer.jsx](file:///C:/RMSv3/src/components/pages/tasks/TaskDrawer.jsx)
*   Çekmeceye `formTemplates` ve `onFillForm` prop'larının tanımlanması.
*   Göreve atanmış bir form şablonu var ise, açıklama bölümünün hemen altında mavi sol kenarlıklı şık bir "Görev Formu" kartı ve üzerinde "Form Doldur: [Şablon Başlığı]" butonu gösterilmiştir.
*   Butona tıklandığında `onFillForm` callback'inin çalıştırılması sağlanmıştır.

#### [MODIFY] [FormSubmissions.jsx](file:///C:/RMSv3/src/components/pages/FormSubmissions.jsx)
*   `react-router-dom`'dan `useSearchParams` hook'u import edilmesi.
*   URL query parametreleri arasında `fillTemplateId` var ise, form şablonları yüklenikten hemen sonra otomatik olarak bu form şablonunun doldurma modalının (`startFillForm`) tetiklenmesi.
*   Form doldurma başlatıldıktan sonra URL query parametresinin temizlenmesi (böylece sayfa yenilemelerinde veya modal kapatıldığında mükerrer tetiklenmeler önlenecektir).

---

## Verification Plan

### Automated & Manual Verification
1.  **Migrasyon Testi:**
    *   Lokal olarak migrasyon betiği çalıştırılarak veritabanına uygulanacaktır:
        ```bash
        node scripts/run-migration-019.cjs
        ```
2.  **Derleme (Build) Doğrulaması:**
    *   Frontend kodlarının sıfır hata ile derlendiği teyit edilecektir:
        ```bash
        npm run build
        ```
3.  **Manuel Doğrulama (Akış Testi):**
    *   "Yeni Görev" oluşturulurken "Görevin Formu" dropdown'ından bir şablon seçilecek.
    *   Oluşturulan görev atanan kişiyle açılıp görev çekmecesine girilecek.
    *   Görev çekmecesinde "Form Doldur: [Form Adı]" butonunun çıktığı görülecek.
    *   Butona tıklandığında yeni bir sekmede form doldurma modalının otomatik olarak açık geldiği ve form doldurulduktan sonra kaydedilebildiği doğrulanacaktır.
