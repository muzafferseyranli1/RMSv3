# Uygulama Planı - Müşteri Anketi QR ve Link Yönetimi UX İyileştirmesi

Bu plan, yeni oluşturulan müşteri anketi şablonlarının QR kod ve link oluşturma süreçlerini daha kullanıcı dostu (user-friendly) hale getirmeyi amaçlar. Kullanıcının şablonu kaydedip ardından listeden tekrar bularak düzenle demesi yerine, şablonu kaydettiği anda düzenleme modunda kalmasını ve doğrudan QR oluşturma ekranının açılmasını sağlar.

## User Review Required

> [!IMPORTANT]
> - **Teknik Zorunluluk:** QR kod ve survey_tokens oluşturulabilmesi için form şablonunun veritabanında bir ID'ye sahip olması (kaydedilmiş olması) zorunludur.
> - **Save & Stay (Kaydet ve Kal) Akışı:** Şablon düzenleme ekranında henüz kaydedilmemiş (yeni) bir şablon varken altta gösterilen uyarı kartına "Şablonu Kaydet ve QR Koda Geç" butonu eklenecektir. Bu buton tıklandığında şablon kaydedilecek, kullanıcı listeden çıkmak yerine aynı düzenleme sayfasında yeni ID ile kalacak ve otomatik olarak QR modalı açılacaktır.

## Proposed Changes

### Bileşen 1 — Form Şablonları Yönetimi

#### [MODIFY] [FormTemplates.jsx](file:///c:/RMSv3/src/components/pages/FormTemplates.jsx)
- `handleSave` fonksiyonu `stayAndOpenQr` adında bir parametre alacak şekilde güncellendi.
- `createFormTemplate` ve `updateFormTemplate` servis fonksiyonlarının dönüş değerleri (`data` ve `error`) yakalanarak kaydedilen yeni şablon nesnesi elde edildi.
- Eğer `stayAndOpenQr` parametresi true ise, veritabanı kaydı başarıyla oluştuktan sonra `startEdit(savedTemplate)` çağrısı yapılıp `setQrModalOpen(true)` ile QR modalı doğrudan tetiklenecek. Diğer durumlarda klasik `setEditing(null)` ile listeye dönülecek.
- `renderQrManagementPanel` içindeki henüz kaydedilmemiş şablon uyarısı güncellenerek "Şablonu Kaydet ve QR Koda Geç" butonu eklendi ve bu buton `handleSave(true)` akışına bağlandı.

## Verification Plan

### Automated Tests
- Proje derleme testi: `npm run build` komutu çalıştırılarak frontend derleme hataları kontrol edildi.

### Manual Verification
- Yeni şablon oluşturma ekranı açılacak, başlık ve anket alanları girilip alt kısımdaki uyarı kartından "Şablonu Kaydet ve QR Koda Geç" butonuna basılarak şablonun kaydedildiği, modalın otomatik açıldığı ve kullanıcının listeden çıkmadan düzenleme sayfasında kaldığı doğrulanacak.
