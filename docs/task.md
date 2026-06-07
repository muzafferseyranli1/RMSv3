# Görev Listesi - Müşteri Anketi QR ve Link Yönetimi UX İyileştirmesi

- `[x]` 1. FormTemplates.jsx handleSave Mantığı Revizyonu
  - `[x]` `handleSave` fonksiyonuna `stayAndOpenQr` parametresinin eklenmesi.
  - `[x]` `createFormTemplate` ve `updateFormTemplate` Supabase dönüşlerinden `data` (kaydedilen şablon) nesnesinin yakalanması.
  - `[x]` Kayıttan sonra listenin `loadTemplates()` ile yenilenmesi ve `stayAndOpenQr` parametresine bağlı olarak editör modunda kalınması (`startEdit(savedTemplate)` + `setQrModalOpen(true)`).
- `[x]` 2. FormTemplates.jsx renderQrManagementPanel Arayüz Revizyonu
  - `[x]` `!editing.id` (yeni şablon) durumundaki uyarı kartına "Şablonu Kaydet ve QR Koda Geç" butonunun eklenmesi.
  - `[x]` Butonun `handleSave(true)` fonksiyonunu tetikleyecek şekilde bağlanması.
- `[x]` 3. Derleme ve Entegrasyon Doğrulama
  - `[x]` Projeyi `npm run build` ile derleyerek derleme hatası olmadığını doğrulama.
  - `[x]` `OperationSync.md` dosyasına yeni girdi (Entry 045) eklenmesi.
