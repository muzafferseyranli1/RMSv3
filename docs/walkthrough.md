# Walkthrough - Talep ve İş Akışı (Workflow) Modülü Geliştirmeleri

Bu çalışma kapsamında, RMSv3 sistemine sunucuya ek yük getirmeyen **istemci tarafı tetiklemeli (client-side driven)** bir **Talep ve İş Akışı (Workflow) Modülü** kazandırılmıştır. Personelin izin, avans, masraf ve satın alma taleplerini oluşturabileceği, yöneticilerin de bunları görevler modülü üzerinden onaylayıp reddedebileceği uçtan uca bir mimari kurulmuştur.

## Gerçekleştirilen Değişiklikler

### 1. Veritabanı ve Şema Altyapısı
- **Migration `030_add_workflow_schema.sql`:**
  - `workflow_definitions` (Süreç şablonları)
  - `workflow_instances` (Aktif talepler ve verileri)
  - `workflow_history` (Onay denetim izi)
  - `form_templates` tablosundaki `form_type` kısıtlamasına `'request'` (Talep) tipi eklendi.
- Migration Railway veritabanına başarıyla uygulandı.

### 2. İş Akışı Motoru Servisi (`workflowService.js`)
- **İş Akışı Başlatma (`createWorkflowInstance`):** Başlangıç talep formunu doldurarak süreci başlatır ve sıradaki onaycı için görevi üretir.
- **İş Akışı İlerletme (`advanceWorkflow`):** Onay/ret kararlarını işler. Red durumunda düzeltmeye veya iptale yönlendirir.
- **Koşul Değerlendirici (`evaluateCondition`):** Form verilerine göre (örn: Masraf Tutarı >= 5000 TL) dinamik olarak onay adımının çalışıp çalışmayacağını kontrol eder.
- **Hiyerarşik Pozisyon Desteği (`loadWorkflowPersonnelContext`):** Pozisyonları, personeli ve Hesap Planı gider hesaplarını bir arada yükler.

### 3. Dinamik Form Builder ve Submission Güncellemeleri
- **Alan Tipleri:** Form şablonlarına `file`, `time` ve `expense_account_select` (Gider Hesabı Seçimi) alan tipleri eklendi.
- **FormTemplates.jsx:** `'request'` şablon tipi desteği ve yeni alan tanımları eklendi. Ayrıca Talep Formlarında ("request") kafa karıştırıcı olabilecek "Kullanım Bağlamı / Alanı" ve "Form Gönderildiğinde Otomatik Görev Oluştur" seçenekleri UI'da gizlendi ve kaydetme sırasında temizlenerek veritabanında gereksiz veri birikmesi engellendi.
- **FormSubmissions.jsx / FormSubmissionDetailModal.jsx:** Dosya yükleme (Drag-and-Drop) ve Hesap Çizelgesi üzerinden aktif gider hesaplarının listelenip seçilmesi entegre edildi.

### 4. İş Akışı Tasarımcısı & Talepler Ekranı
- **Workflows.jsx (Wrapper):** Listeler, tanımlar ve sihirbazı yöneten tekil lazy-load sayfa.
- **WorkflowDesigner.jsx:** Sıralı Adım Sihirbazı (Sequential Step-Builder) ile React Flow bağımlılığı olmadan temiz adımlı süreç tasarımı.
- **WorkflowInstancesList.jsx:** Personelin taleplerini (durum göstergesi ile) ve yöneticilerin onay bekleyen işlerini tek ekranda toplayan dashboard.

### 5. Görevler (Tasks) Modülü Entegrasyonu
- **taskService.js:** İş akışı tarafından oluşturulan görevlerin delege edilmesi, geri gönderilmesi veya doğrudan standart yolla tamamlanması engellendi. Tüm süreçlerin workflow engine kurallarına uyması garanti altına alındı.
- **TaskDrawer.jsx:** Görev iş akışı ile ilişkili ise (`linked_entity_table === 'workflow_instances'`):
  - Form verileri (resim ve PDF yüklemeleri) ve onay/ret geçmişi çekmecede dinamik olarak render edilir.
  - Standart butonlar yerine **[Onayla]** ve **[Reddet]** aksiyon butonları gösterilerek süreç ilerletilir.

### 6. Rota ve Sidebar Entegrasyonu
- **App.jsx:** `/is-akisleri` rotası lazy-load olarak kaydedildi.
- **Sidebar.jsx:** Hem merkez hem şube menülerine "Talepler ve İş Akışları" düğmesi yerleştirildi.

---

## Doğrulama ve Test Sonuçları

- **Vite Production Build:**
  - `npm run build:web` komutu sıfır hata ile tamamlanmış ve uygulamanın hatasız şekilde paketlendiği doğrulanmıştır.
- **Yüklenme Hatası ve Kullanıcı Bağlamı Düzeltmesi:**
  - Postgres gateway ile uyumsuz PostgREST inner join select sorgusu, flat select sorgularıyla değiştirilerek comma-split hatası çözülmüştür.
  - Auth-bypass modunda `useAuth().user` nesnesinin daima `null` dönmesi nedeniyle yaşanan sonsuz spinner sorunu; aktif kullanıcı kimliği `sessionStorage`'daki `rms_active_user` değerinden ve personel context'inden çözümlenerek giderilmiştir.
- **Form Bölümleri (Sections) ve Stil Düzeltmeleri:**
  - Tasarım ekranında (`WorkflowDesigner.jsx`) koşul tanımlarken iç içe bölümlerden (`sections`) alanların çekilmesi için `getTemplateFields` entegrasyonu tamamlandı.
  - Liste ekranında (`WorkflowInstancesList.jsx`) flexbox hizalamalarını bozan `justifyBetween` yazım hataları `justifyContent` olarak güncellendi.
- **İş Akışı Doğrulama (E2E Simülasyon Testi):**
  - Database düzeyinde çalışan bir entegrasyon simülasyon test scripti (`scratch/simulate_workflow.cjs`) yazılmış ve çalıştırılmıştır.
  - "Masraf Talebi" akışı başlatılıp; form verilerinin (`f_amount`, `f_description`, `f_account`, `f_receipt`) işlendiği, "Şube Müdürü Onayı" (pozisyon bazlı 38 çalışan) adımı için dinamik görevlerin oluşturulduğu, onay verildiğinde görevin kapatılıp "Genel Merkez Onayı" adımına (Kemal) aktarıldığı ve Kemal onayladığında sürecin "Tamamlandı" olarak sonlandığı doğrulanmıştır.
  - Akışın tüm geçmişi (submit, transition, approve, complete) `workflow_history` üzerinde denetim logu (audit trail) olarak başarıyla doğrulanmıştır.
