# Task List: Form Ayarları ve Şube Seçimi Zorunluluğu Entegrasyonu

- `[x]` `FormTemplates.jsx` dosyasında ayarlar alanını "Form Ayarları" başlığı altında birleşik dikey şerit ve kesikli çizgi tasarımıyla tek bölüme topla.
- `[x]` "Şube Seçimi Zorunlu" checkbox girdisini ekle ve `schemaJson.require_branch_selection` ile bağla.
- `[x]` "Tarih ve Saati Otomatik Al" checkbox girdisini ekle ve `schemaJson.auto_date_time` ile bağla.
- `[x]` `FormTemplates.jsx` düzenleyicideki form tipi kısıtlamalarını esneterek bu ayarların tüm form tiplerinde (anket, talep vb.) kullanılmasını sağla.
- `[x]` `FormSubmissions.jsx` arayüzünden doldurucunun tarih/saat otomatik ayarını değiştirebilmesini sağlayan checkbox'ları tamamen kaldır.
- `[x]` Doldurucunun karşısındaki tarih/saat alanlarını şablondaki `auto_date_time` kuralı aktif ise kilitle, pasif ise düzenlenebilir yap.
- `[x]` `FormSubmissions.jsx` gönderim doğrulama mantığına `require_branch_selection` kontrolünü ekle, zorunluysa şube seçilmediğinde hata verdir.
- `[x]` `FormSubmissions.jsx` arayüzünde standart form tipleri dışındaki anket ve talepler için şube seçimi zorunlu kılındığında şube seçilebilen genel "Form Bilgileri" kartı göster.
- `[x]` `npm run build` ile üretim derlemesi yapılarak syntax ve derleme hataları olmadığını doğrula.
