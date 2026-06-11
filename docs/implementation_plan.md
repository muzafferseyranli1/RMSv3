# Implementation Plan: Form Ayarları ve Şube Seçimi Zorunluluğu Entegrasyonu

Bu plan, form şablonlarındaki ayarların (GPS Zorunlu, Kullanım Alanı, Görev Oluşturma) şık ve birleşik bir "Form Ayarları" grubu olarak düzenlenmesi ve "Şube Seçimi Zorunlu" adında yeni bir form ayarının tüm form tiplerine uygulanması amacıyla hazırlanmıştır.

## Hedefler

1. **Görsel Sadeleştirme:** Form Şablonu Düzenleyici (`FormTemplates.jsx`) ekranında dağınık ve farklı koşullara bağlı olan tüm ayarlar (GPS Zorunlu, Şube Seçimi Zorunlu, Kullanım Bağlamı, Otomatik Görev Oluştur) tek bir "Form Ayarları" kartı altında, kesikli çizgiyle ayrılmış şık bir bölüm olarak birleştirilecek.
2. **Şube Seçimi Zorunlu Desteği:** Şablon şemasına (`schemaJson.require_branch_selection`) yeni bir boolean ayar eklenecek.
3. **Tarih/Saat Otomatikleştirme Kuralı:** Şablon şemasına (`schemaJson.auto_date_time`) yeni bir kural eklenecek; dolduran kişinin seçimine bırakılmaksızın sistem tarih/saatinin otomatik alınıp kilitlenmesi sağlanacak.
4. **Tüm Form Tiplerine Uygulama:** Form ayarları ve otomatik görev oluşturma yeteneği tüm form tiplerinde (inspections, checklists, customer_surveys, personnel_surveys, requests vb.) kullanılabilir olacak.
5. **Form Gönderim Kontrolleri:** Form Doldurma ekranında (`FormSubmissions.jsx`) eğer şablon için `require_branch_selection` aktifse, kullanıcının şube seçmesi zorunlu kılınacak ve şube seçilmeden form gönderilemeyecek.

## Önerilen Değişiklikler

### 1. Şablon Düzenleyici

Dosya: `src/components/pages/FormTemplates.jsx`

- Dağınık duran tüm checkbox girdileri ve kullanım bağlamı seçicileri tek bir `Form Ayarları` başlığı altında iki sütunlu grid yapısında görsel olarak birleştirildi.
- "Şube Seçimi Zorunlu" checkbox'ı eklendi ve `schemaJson.require_branch_selection` ile bağlandı.
- "Tarih ve Saati Otomatik Al" checkbox'ı eklendi ve `schemaJson.auto_date_time` ile bağlandı.
- Form tipi `request` olduğunda kullanım alanı ve otomatik görev oluşturma kısıtlamaları kaldırılarak tüm form tiplerinde etkinleştirildi.

### 2. Form Doldurma ve Gönderim

Dosya: `src/components/pages/FormSubmissions.jsx`

- Form doldurma aşamasında `autoDateTime` değeri doğrudan şablondaki `auto_date_time` kuralına bağlandı. Formu dolduran kişinin bu seçimi değiştirmesini sağlayan onay kutuları arayüzden tamamen kaldırıldı.
- Eğer şablonda `auto_date_time` kuralı aktifse tarih ve saat alanları sistem saatiyle otomatik doldurulup kilitlenir (readonly/disabled), aktif değilse alanlar düzenlenebilir hale gelir.
- Gönderim doğrulama (`handleSubmit`) fonksiyonuna `require_branch_selection` kontrolü eklenerek şube seçilmediğinde formun gönderilmesi engellendi ve kullanıcıya uyarı gösterilmesi sağlandı.
- `inspection`, `checklist` ve `notification_form` dışındaki form tipleri (örneğin anketler ve talepler) için eğer `require_branch_selection` aktifse şube seçim kutusunu da içeren genel "Form Bilgileri" başlık kartı render edilmesi sağlandı.

## Doğrulama Plani

- `npm run build` komutu ile üretim derlemesi yapılarak kodların hatasız derlendiği doğrulanacak.
- Form şablonu oluşturma ve düzenleme ekranındaki ayar kaydetme davranışları kontrol edilecek.
- Form yanıtlarında şube zorunluluğu doğrulama akışları test edilecek.
