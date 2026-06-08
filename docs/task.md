# İş Akışı Modülü Geliştirme Checklist

- [x] Veritabanı ve Şema Kurulumu (Migration)
  - [x] `migrations/030_add_workflow_schema.sql` dosyasının oluşturulması (definitions, instances, history tabloları ve `request` form tipi kısıtlamasının güncellenmesi)
  - [x] Migration'ı veritabanına uygulayacak bir script yazılması ve çalıştırılması
- [x] Servis Katmanı
  - [x] `src/lib/workflowService.js` dosyasının oluşturulması (akış başlatma, onaylama/reddetme, adım ilerletme ve koşullu kontrol fonksiyonları)
- [x] Arayüz Geliştirmeleri (Frontend UI)
  - [x] `FormTemplates.jsx` güncellenmesi (Form tiplerine `request` eklenmesi, alan tiplerine `file`, `time` ve `expense_account_select` eklenmesi)
  - [x] `FormTemplates.jsx` sadeleştirilmesi (Talep formlarında kullanım bağlamı ve otomatik görev ayarlarının gizlenmesi ve kaydetmede temizlenmesi)
  - [x] `FormSubmissions.jsx` güncellenmesi (Yeni alan tiplerinin render edilmesi, dosya yükleme arayüzü)
  - [x] `src/components/pages/workflows/WorkflowDesigner.jsx` (Sıralı Adım Sihirbazı akış oluşturucu ekranı)
  - [x] `src/components/pages/workflows/WorkflowInstancesList.jsx` (Personel talepleri ve yöneticinin onay bekleyen talepler listesi ekranı)
- [x] Görevler (Tasks) Modülü Entegrasyonu
  - [x] `taskService.js` güncellenmesi (İş akışından gelen görevlerin bypass edilmesi, durum güncellemeleri)
  - [x] `TaskDrawer.jsx` güncellenmesi (İş akışı ile ilişkili görevlerde onaylama/reddetme butonlarının ve form detayının render edilmesi)
- [x] Doğrulama ve Test
  - [x] Test amaçlı "Masraf Talebi" akışı tasarlanması (Tutar bütçe kontrolü, dosya yükleme, hesap planı seçimi)
  - [x] Akışın test kullanıcılarıyla başlatılıp onaycılar tarafından onaylanarak tamamlanması ve DB geçmişinin kontrol edilmesi
