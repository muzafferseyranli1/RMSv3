# Müşteri Arama, Kayıt ve Gömülü Kategori Planı

Bu plan, çağrı merkezi üzerinden geribildirim oluşturulurken kayıtlı müşterilere ulaşılabilmesini, kaydı olmayan müşterilerin ise otomatik olarak sisteme kaydedilmesini ve bu müşterilerin sistemde silinemez/düzenlenemez olarak işaretlenmiş "Geri Bildirimden Gelen" kategorisine otomatik atanmasını sağlar. Ayrıca, Çağrı Merkezi sipariş listesi arama girdisine bir arama butonu eklenmesini ve Şube yetkili kullanıcılarının şube bağlamında "Şube İşlemleri" menüsünü görememe hatasının giderilmesini içerir.

## Yapılan Değişiklikler

### 1. Müşteri Arama ve Autocomplete (`CallCenter.jsx`)
- Müşteri Telefonu ve Müşteri Ad Soyad alanlarına autocomplete önerileri eklendi.
- Kullanıcı en az 3 karakter girdiğinde veritabanından (`musteriler` tablusundan) eşleşen müşteriler listelenir.
- Müşteri seçildiğinde telefon ve isim alanları otomatik dolar ve seçilen müşteri ID'si (`customerId`) saklanır.
- Input alanından çıkıldığında (onBlur) öneri listesi kapatılır.

### 2. Otomatik Kayıt ve Kategori Atama (`CallCenter.jsx`)
- Geribildirim kaydedilirken eğer seçilen bir `customerId` yoksa, girilen telefon numarası veritabanında taranarak mükerrer kayıt oluşması engellenir.
- Eğer veritabanında bu numarayla kayıtlı bir müşteri bulunamazsa, yeni müşteri kaydı oluşturulur (`acquisition_source` ve `signup_channel` alanları `'feedback_source'` olarak set edilir).
- Yeni müşteri `'feedback_source'` (Geri Bildirimden Gelen) müşteri kategorisine otomatik atanır (`saveLoyaltyCustomerCategoryAssignments` kullanılarak).

### 3. Gömülü Kategori Koruma (`LoyaltyCustomerCategories.jsx`)
- Sistemde `'feedback_source'` ID'li bir kategori yoksa, liste yüklenirken bu kategori dinamik olarak listeye eklenir.
- Bu kategorinin silinmesi ve ad/kod alanlarının düzenlenmesi UI seviyesinde tamamen engellenmiştir.
- Kategori kaydedilirken veya müşteri atanırken tablonun varlığı kontrol edilerek olası veritabanı sıfırlamalarına karşı dinamik olarak veritabanına eklenmesi (`ensureFeedbackSourceCategory`) sağlanmıştır.

### 4. Arama Butonu Ekleme (`CallCenter.jsx`)
- Çağrı Merkezi ana sayfasındaki sipariş arama input alanı (`hubSearch`) flex yapısına alınarak yanına büyüteç ikonlu mavi bir "Ara" butonu eklenmiştir.

### 5. Şube Yetkilileri İçin Menü İzin Hatası Giderme (`Sidebar.jsx`)
- Sidebar bileşenindeki `visibleSections` filtresinde, mojibake karakterlerden ötürü `canAccessSection` çağrısına giden `'Åžube Ä°ÅŸlemleri'` başlığı `fixMojibakeText` fonksiyonundan geçirilerek düzeltilmiştir.
- Şube bağlam göstergesi ve şube değiştirme butonu (`section.section === 'Sube Islemleri'`) koşulu da çözülmüş Türkçe karakterli `'Şube İşlemleri'` başlığına uyumlu hale getirilmiştir.
- Bu sayede şube yetkilisi (örneğin Arda Işık) sisteme kendi şubesi bağlamında giriş yaptığında "Şube İşlemleri" sekmesini eksiksiz görebilmektedir.

## Doğrulama Planı
- `npm run build:web` komutuyla Vite derleme testi tamamlanmış ve 0 hata alınmıştır.
