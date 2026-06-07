# Görev Listesi: Müşteri Anketi Yapısı

- [x] 1. migrations/029_survey_qr_tokens.sql → Railway uygula + schema-railway-master.sql güncelle
- [x] 2. server/index.js → survey-token API endpoint'leri (GET token, GET list, POST, DELETE, customer-category-assign)
- [x] 3. src/lib/publicDisplayRoutes.js → /anket/ prefix ekle
- [x] 4. src/components/pages/PublicSurvey.jsx → Herkese açık anket sayfası
- [x] 5. src/App.jsx → /anket/:token ve /gorev-yoneticisi route'ları ekle
- [x] 6. src/lib/formService.js → createTaskFromCustomerSurvey mantığı
- [x] 7. src/components/pages/FormTemplates.jsx → customer_survey özellikleri + QR yönetim kartı
- [x] 8. src/components/pages/TaskManager.jsx → Yeni Task Manager sayfası (ve inline CSS düzeltmeleri)
- [x] 9. src/components/layout/Sidebar.jsx → Görev Yöneticisi menü öğesi
- [ ] 10. OperationSync.md → Entry ekle + git commit
