# Uygulama Planı - Form Şablon Raporlama ve Filtreleme Geliştirmesi

Mevcut `Form Yanıtları` sayfasındaki istatistik kartlarının kaldırılması, tarih filtrelerinin eklenmesi ve kapsamlı şube/tarih/şablon bazlı soru ortalamalarını hesaplayıp yazdırabilen yeni bir "Rapor Al" özelliğinin eklenmesi planlanmaktadır.

## Kullanıcı İncelemesi Gereken Hususlar
> [!IMPORTANT]
> - **Şube Şablonları Entegrasyonu**: Genel Merkez (Center) ve Admin yetkisindeki kullanıcılar, rapor alırken tekil şubelerin yanı sıra `branch_templates` tablosunda tanımlanmış şube şablonlarını (İstanbul Şubeleri, Ege Şubeleri vb.) da seçebilecektir. Şube ve Depo kullanıcıları ise sadece kendi şubelerinin verilerini görebilecek, şube seçimi yapamayacaktır.
> - **Soru Bazlı Ortalama Hesaplama Kuralları**:
>   - **Evet/Hayır (yes_no) & Onay Kutusu (checkbox)**: "Evet" veya işaretli olma yüzdesi (% bazında oran) hesaplanacaktır.
>   - **Derecelendirme (rating, rating_10, slider, nps, number, temperature)**: Matematiksel aritmetik ortalama hesaplanacak ve görsel barlar / yıldızlarla sunulacaktır.
>   - **Emoji Derecelendirme (emoji_rating)**: `sad` (1), `neutral` (2), `happy` (3) puan karşılıkları atanarak ortalama skor çıkarılacaktır.
>   - **Seçim Listesi (select)**: Seçeneklerin puan ağırlıkları varsa bunlara göre ortalama alınacaktır.

## Önerilen Değişiklikler

### Bileşenler ve Arayüz Katmanı

#### [MODIFY] [FormSubmissions.jsx](file:///c:/RMSv3/src/components/pages/FormSubmissions.jsx)

1. **Arayüz Sadeleştirmesi ve Tarih Filtreleri**:
   - Üst kısımdaki `Stat Cards` (Toplam, Tamamlanan, Anomali, Ort. Puan kartları) kaldırılacak.
   - Listeleme filtrelerinin bulunduğu satıra başlangıç tarihi (`filter.startDate`) ve bitiş tarihi (`filter.endDate`) inputları (`type="date"`) eklenecek.
   - Listelenen yanıtlar local state seviyesinde `filteredSubmissions` olarak bu tarihlere göre süzülecek.

2. **Rapor Al Butonu**:
   - Tarih ve durum filtrelerinin yanına şık, mavi renkli bir **Rapor Al** (`<button className="btn-p">Rapor Al</button>`) butonu eklenecek.
   - Bu buton tıklandığında `showReportModal` state'ini `true` yaparak yeni rapor modalını açacak.

3. **Rapor Seçim ve Hesaplama Modalı**:
   - **Form Şablonu Seçimi**: Raporlanacak form şablonu (dropdown) seçilir.
   - **Şube Seçimi**:
     - `scope === 'center' || scope === 'admin'` ise: Kullanıcıya şube şablonları (`branch_templates` tablosundan dinamik çekilen listeler) ve tekil şubeleri seçebileceği çoklu seçim/dropdown alanı sunulur.
     - `scope === 'branch' || scope === 'warehouse'` ise: Kullanıcının kendi şubesi kilitli ve otomatik seçili olarak gelir.
   - **Tarih Aralığı Seçimi**: Başlangıç ve bitiş tarihlerini içerir.
   - **Raporu Göster Butonu**: Seçimlerden sonra veritabanından (`form_submissions` tablosu) ilgili şablon, şubeler ve tarih aralığına ait tüm tamamlanmış form yanıtlarını çeker.

4. **Soru Bazlı Ortalama Hesaplama Motoru**:
   - Gelen tüm form yanıtlarının `answers_json` verileri parse edilerek soru bazında (field_id) cevaplar toplanır.
   - Her sorunun ortalama skoru hesaplanır.
   - Rapor Sonuçları Ekranında:
     - Seçilen şablon bilgisi, analiz edilen toplam form adeti, seçilen şubeler ve tarih aralığı özetlenir.
     - Her bölüm (section) altında yer alan soruların ortalama puanları görsel ilerleme barlar (progress bar) veya derecelendirme yıldızları / emojileri ile premium bir UX tasarımında listelenir.

5. **Yazdırılabilir Sürüm (A4 Print)**:
   - Rapor sonuç ekranında bir **Yazdır** butonu bulunacaktır.
   - Buton tıklandığında veya `window.print()` tetiklendiğinde devreye giren `@media print` CSS kuralları ile sayfanın diğer tüm elemanları gizlenecek; sadece A4 dikey (portrait) düzenene uygun, şık bir başlık altında tüm soruların karşısında ortalama değerlerinin yazdığı temiz bir tablo raporu yazdırılacaktır.

### Veritabanı ve Servis Katmanı

- Veritabanı sorguları `db.from('form_submissions')` üzerinden doğrudan çekilecektir.
- Şube şablonları için `db.from('branch_templates').select('*').is('deleted_at', null)` sorgusuyla aktif şablonlar yüklenecektir.

## Doğrulama Planı

### Otomatik Test ve Derleme Kontrolü
- Değişiklikler yapıldıktan sonra `npm.cmd run build` çalıştırılarak hata almadan derlendiği doğrulanacak.

### Manuel Doğrulama
1. **İstatistik Kartlarının Kontrolü**: `Form Yanıtları` ekranında stat kartlarının kaldırıldığı, filtrelerin ve listenin yukarı kayarak daha geniş alan kazandığı gözlemlenecek.
2. **Tarih Filtresi Kontrolü**: Başlangıç ve bitiş tarihi seçildiğinde listelenen form yanıtlarının bu tarihlere göre süzüldüğü doğrulanacak.
3. **Rapor Seçici Yetki Kontrolü**:
   - Şube rolüyle girildiğinde şube seçicinin kapalı olduğu ve sadece kendi şubesine ait rapor alabildiği test edilecek.
   - Merkez rolüyle girildiğinde hem tekil şube hem de "İstanbul Şubeleri" vb. şube şablonlarının seçilebildiği test edilecek.
4. **Ortalama Hesaplama ve Rapor Görünümü**: Seçilen tarih aralığındaki form yanıtlarının başarıyla çekilip soru bazında ortalama skorların doğru hesaplandığı ve görsel barlarla listelendiği doğrulanacak.
5. **A4 Yazıcı Önizlemesi**: "Yazdır" tıklandığında açılan tarayıcı yazdırma ekranında form başlığı, tarih aralığı, şube detayları ve soru-ortalama tablosunun A4 sayfasına tam oturduğu gözlemlenecek.
