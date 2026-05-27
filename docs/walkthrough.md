# Müşteri Arama ve Kayıt Değişiklik Özeti

Bu çalışma, Çağrı Merkezi geribildirim oluşturma modalı içinden kayıtlı müşterilere ulaşılmasını, yoksa girilen bilgilerle yeni müşteri oluşturulmasını ve bu müşterilerin gömülü "Geri Bildirimden Gelen" kategorisine atanmasını sağlar. Ayrıca sipariş listesi filtresine bir arama butonu eklenmiş ve Şube yöneticileri için Sidebar'da görünmeyen "Şube İşlemleri" izin hatası giderilmiştir.

## Yapılan Değişiklikler

1. **Arama ve Öneri Listesi (`CallCenter.jsx`)**:
   - `ticketPhoneSuggestions` ve `ticketNameSuggestions` state'leri ile autocomplete arama altyapısı kuruldu.
   - Telefon veya isim alanlarına en az 3 karakter girildiğinde veritabanından eşleşen aktif müşteriler listelenir ve tıklandığında form alanlarını otomatik doldurur.

2. **Kayıt ve Kategori İlişkilendirme (`CallCenter.jsx`)**:
   - Kayıt sırasında girilen telefon numarası veritabanında taranarak mükerrer müşteri kaydı oluşması önlenir.
   - Müşteri mevcut değilse yeni kayıt açılır ve sadakat kategorisi olarak `'feedback_source'` (Geri Bildirimden Gelen) ataması otomatik yapılır.

3. **Gömülü Kategori Yönetimi (`LoyaltyCustomerCategories.jsx`)**:
   - Veritabanı sıfırlanmış veya boş olsa dahi `'feedback_source'` kategorisi listede daima gösterilir ve silme/düzenleme işlemleri engellenir.

4. **Arama Butonu (`CallCenter.jsx`)**:
   - Sipariş no, müşteri, masa, not aramak için kullanılan `hubSearch` alanının yanına `fa-magnifying-glass` (büyüteç) ikonlu modern bir arama butonu konumlandırılmıştır.

5. **Şube Yetkilisi İzin/Gösterim Düzeltmesi (`Sidebar.jsx`)**:
   - Sidebar'da menülerin yetki kontrollerinde (`canAccessSection`) kullanılan `section.section` ismi mojibake karakterlerden arındırılarak (`fixMojibakeText` fonksiyonuna tabi tutularak) kontrol edilmiş ve şube yetkilileri için "Şube İşlemleri" menüsünün görünmeme hatası çözülmüştür.

## Doğrulama ve Test Sonuçları
- `npm run build:web` çalıştırılarak tüm frontend dosyalarının sıfır hatayla derlendiği gözlemlenmiştir.
