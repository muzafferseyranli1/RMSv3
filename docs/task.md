# Görevler Modülü Geliştirme Takip Listesi

## 1. Görevlere Form Şablonu İlişkilendirme ve Otomatik Form Doldurma Entegrasyonu
- [x] 1. SQL Migrasyonu (`migrations/019_task_form_template_relation.sql`) oluşturulması
- [x] 2. Migrasyonu çalıştırmak için `scripts/run-migration-019.cjs` dosyasının oluşturulması
- [x] 3. `node scripts/run-migration-019.cjs` komutunu çalıştırarak canlı veritabanının güncellenmesi
- [x] 4. `schema-railway-master.sql` dosyasının yeni şemaya göre güncellenmesi
- [x] 5. `src/lib/taskService.js` dosyasında `createTask` fonksiyonunun `form_template_id` kaydedecek şekilde güncellenmesi
- [x] 6. `src/components/pages/Tasks.jsx` dosyasında form şablonları yükleme, modal içi dropdown ve detay çekmecesi bağlantısının güncellenmesi
- [x] 7. `src/components/pages/tasks/TaskDrawer.jsx` dosyasına "GÖREV FORMU" kartı ve "Form Doldur" butonunun eklenmesi
- [x] 8. `src/components/pages/FormSubmissions.jsx` dosyasının URL query param üzerinden otomatik form doldurma modalı tetiklemesi ve temizlemesiyle güncellenmesi
- [x] 9. `npm run build` ile projeyi derleyerek testlerin yapılması ve doğrulanması
- [x] 10. `OperationSync.md` dosyasına yeni giriş (Entry 167) eklenmesi ve `./docs/` klasörünün güncellenmesi

## 2. Personel Mobil Uygulaması Görevler Sayfası Mobil Uyumlaştırma
- [x] 1. Personel uygulaması (/personel-app) görevler sayfasının mobil uyumlu hale getirilmesi
- [x] 2. Modal bileşeninin dar ekranlarda taşmasını engellemek için min(94vw, width) ve minHeight ayarlaması
- [x] 3. Tasks.jsx'te mobil görünümde (isMobile=true) gereksiz büyük başlıkların ve kartların gizlenmesi
- [x] 4. Tasks.jsx sekme butonlarının mobilde yatay kaydırılabilir yapılması ve filtre/arama alanlarının dikey düzenlenmesi
- [x] 5. Yeni görev ekleme butonunun mobilde FAB (Floating Action Button) olarak sağ alta yerleştirilmesi
- [x] 6. Değişikliklerin yerel sunucuda test edilmesi ve build kontrolü (npm.cmd run build)
- [x] 7. Değişikliklerin OperationSync.md dosyasına (Entry 169) eklenmesi ve docs altındaki dosyaların güncellenmesi
