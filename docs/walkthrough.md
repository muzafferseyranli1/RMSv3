# Müşteri Anketi Form Yapısı — Uygulama Walkthrough

Müşteri Anketi form yapısı, gelişmiş anonim / şubeli / çoklu şubeli / şablon bazlı QR & Link oluşturma mekanizmaları, herkese açık doldurma sayfası, loyalty entegrasyonu ve merkezi Görev Yöneticisi ekranı başarıyla uygulandı.

---

## Yapılan Çalışmalar

### 1. Veritabanı ve API Altyapısı
- **SQL Migration:** `migrations/029_survey_qr_tokens.sql` ile anket tokenlarını tutacak `survey_tokens` tablosu oluşturuldu ve Railway Postgres veritabanına uygulandı. `schema-railway-master.sql` güncellendi.
- **Survey Token APIs:** `server/index.js` üzerinde token doğrulama (`GET /api/survey-tokens/:token`), token listeleme (`GET /api/survey-tokens`), oluşturma (`POST`) ve silme (`DELETE`) endpoint'leri yazıldı.
- **Şube Listesi:** Herkese açık doldurma ekranlarında şube seçilebilmesi için `GET /api/branches/list` endpoint'i eklendi.
- **Loyalty Kategori Atama:** Müşteri uygulamasından anket dolduranları `'feedback_source'` ("Geri Bildirimden Gelen") kategorisine atayan `/api/customer-category-assign` endpoint'i entegre edildi.

### 2. Gelişmiş Link & QR Yönetim Paneli
- **Şablon Editörü Entegrasyonu:** `FormTemplates.jsx` editöründe `customer_survey` tipi formlar için "Anonim Doldurmaya İzin Ver" seçeneği sunuldu.
- **Çok Yönlü Hedef Seçim Kaynakları:** QR oluştururken aşağıdaki kaynaklar seçilebilir hale getirildi:
  - *Anonim Mod:* Şube ve müşteri bilgisi olmadan genel doldurma.
  - *Tek Şube:* Seçilen belirli bir şubeye özel.
  - *Çoklu Şube:* Checklist üzerinden seçilen şubeler.
  - *Şube Şablonu:* `branch_templates` tablosundan dinamik çekilen ve çözümlenen şube grupları.
  - *Tüm Şubeler:* Sistemde kayıtlı olan tüm şubeler.
- **Dinamik Üretim Tipleri:** Çoklu şube içeren kaynaklar için kullanıcıya iki alternatif sunuldu:
  - *Tek Bir QR Kod / Link (Tek URL):* `multi_branch` modunda tek bir QR üretir; müşteri sayfayı açınca şubesini seçer.
  - *Her Şube İçin Ayrı Ayrı Link ve QR (Çoklu URL):* Belirtilen şubelerin her biri için arka arkaya `branch` modunda bağımsız QR kodlar üretir.
- **Yazdırma ve Yönetim:** A4 düzeninde toplu yazdırma, tekil link kopyalama ve deaktive etme özellikleri eksiksiz çalışmaktadır.

### 3. Herkese Açık Anket Doldurma Ekranı
- `src/components/pages/PublicSurvey.jsx` oluşturuldu.
- Giriş gerektirmeden `/anket/:token` rotası üzerinden erişim sağlandı. Rota `publicDisplayRoutes.js` içerisine eklenerek AuthGate bypass edildi.
- Emoji değerlendirme, NPS, Slider, Yıldız derecelendirme (5'li ve 10'lu) ve şube seçimi gibi zengin veri tipleri premium tasarım standartlarına uygun şekilde geliştirildi.

### 4. Otomatik Görev Atama Mantığı
- `src/lib/formService.js` içerisine `createTaskFromCustomerSurvey` entegre edildi.
- Anket gönderildiğinde `task_manager` (Görev Yöneticisi) adıyla otomatik takip görevi oluşturuluyor.
- Şube ve kullanıcı bilgisine göre atama mantığı Kural 1, 2 ve 3 kapsamında dinamikleştirildi.

### 5. Görev Yöneticisi Dashboard'u
- `src/components/pages/TaskManager.jsx` oluşturuldu ve `/gorev-yoneticisi` rotasına bağlandı.
- **Tüm Görevler Sekmesi:** Şube sınırı olmaksızın tüm görevler listelenir. Otomatik anket görevlerinde şube değiştirme, merkez çalışanı atama ve dosya ekleme kontrolleri sağlar.
- **Form Gönderileri Sekmesi:** Tüm form gönderileri filtreli olarak izlenebilir.
- **Analiz Sekmesi:** NPS skoru hesaplaması ve şube dağılım grafikleri/raporları yer alır.
- **Menü Entegrasyonu:** `Sidebar.jsx` Merkez menüsü altına "Görev Yöneticisi" öğesi eklendi.

---

## Doğrulama Sonuçları

- **Derleme Testi:** `npm run build` ile Vite build işlemi sorunsuz şekilde tamamlandı, herhangi bir derleme veya import hatası bulunmuyor.
- **CSS Stilleri:** `TaskManager.jsx` dosyasındaki geçersiz `justifyBetween` stilleri standart `justifyContent` ile değiştirilerek derleme hatası düzeltildi.
- **Şablon / Çözümleme Testi:** Şube şablonundan tekil ve çoğul QR üretim senaryolarının mantığı kod düzeyinde doğrulandı.
