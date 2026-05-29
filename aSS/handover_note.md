# RMSv3 Kapsamlı Devir / Teslim Notu (Handover)

Bu doküman, masaüstü (Desktop) uygulamasının devreye alınmasından başlayarak cihaz eşleştirme, cihaz yönetimi ve masa düzenine kadar uzanan tüm mimari süreci ve gelinen son durumu belgelemektedir. Projeye başka bir bilgisayardan veya ortamdan devam edecek geliştiriciler için tam bir yol haritası niteliğindedir.

---

## 1. Mimari Temel: Masaüstü (Desktop) Uygulaması ve Eşleşme Mantığı

### Desktop Uygulaması Nedir?
Sistem (POS, KDS, Pickup), web tabanlı React uygulaması olsa da, şubelerdeki fiziksel donanımlarda (dokunmatik ekranlı bilgisayarlar vb.) bir **Masaüstü Kabuğu (Desktop App / Electron veya Tarayıcı Kiosk Modu)** içerisinde çalışmaktadır. 

### "Pair Key" (Eşleştirme) Kurgusu
Geçmişteki karmaşık "Hangi cihaz ne iş yapacak?" kurgusu tamamen merkezi bir **Pair Key** (Bağlantı Anahtarı) sistemine geçirildi.
1. Yeni kurulan boş bir Desktop cihazı (veya tablet) uygulamayı ilk açtığında ekrana sadece **`PairingScreen.jsx`** (Eşleştirme Ekranı) gelir.
2. Kullanıcı, Backoffice'ten (Yönetici panelinden) ürettiği 6 haneli Pair Key'i bu ekrana girer.
3. Desktop uygulaması, veritabanına giderek bu kodun karşılığı olan `device_type`, `is_master` ve `config_data` parametrelerini indirir (`terminalIdentity.js` üzerinden cihazı kalıcı olarak mühürler).
4. Cihaz saniyeler içinde kimliğine bürünür: Cihaz tipi "POS" ise Ana Kasa ekranı, "KDS" ise mutfak ekranı, "Garson" ise masa ekranı olarak açılır ve bir daha Pair kodu sormaz.

---

## 2. Merkezi Cihaz Yönetimi (Device Settings)

Desktop tarafının ihtiyaç duyduğu Pair Key'leri üreten ve cihazların donanımsal mantığını belirleyen sayfa **`Ayarlar > Cihaz Yönetimi`** (`DeviceSettings.jsx`) olarak tamamen baştan yazıldı.

- **Ana Kasa (Master) Kısıtlaması:** Şube başına **sadece tek bir cihaz** "Master" olabilir. Eğer sistemde master bir cihaz varsa, yeni cihaz eklerken bu seçenek otomatik olarak engellenir.
- **KDS (Mutfak) ve Pickup (Teslimat) Zinciri:** 
  - Bir KDS tanımlanırken, sistemdeki POS/Garson cihazları listelenir ve KDS'nin sadece seçili cihazlardan gelen siparişleri dinlemesi (`allowed_sources`) sağlanır.
  - Pickup tanımlanırken, KDS cihazları listelenir ve Pickup'ın seçili mutfakları dinlemesi (`allowed_kds`) sağlanır.
- **Sıra Ekranı (Queue Screen):** Bu ekranın diğerleri gibi Desktop uygulamasında değil, herhangi bir Akıllı TV'nin tarayıcısından çalışacağı varsayıldı. Bu nedenle eşleştirme kodu yerine doğrudan bir **URL linki** (Örn: `.../sira-ekrani/ABCDEF`) üretmesi ve ilişkilendirildiği Pickup cihazlarını (`allowed_pickups`) bilmesi sağlandı.
- **Veritabanı Entegrasyonu:** `pos_terminals` tablosuna kayıt atılırken `terminal_id` (UUID), `branch_id` ve `activation_code` gibi zorunlu NOT NULL alanların gönderilmesi sağlandı ve hata giderildi.

---

## 3. Masa Düzeni ve Backoffice Entegrasyonu

Cihazlardan biri "Garson (Tablet)" olarak tanımlandığında, garsonun sadece kendi baktığı masaları görmesi için **"Bağlı Olduğu Salon"** kısıtlaması getirildi. Bunun dinamik ve görsel olarak mükemmel çalışması için Masa Düzeni modülü tamamen elden geçirildi:

- **Eski Durum:** Karanlık POS teması içindeki gizli bir açılır pencerede (Modal) çalışıyordu.
- **Yeni Durum:** Tamamen standart Backoffice (aydınlık/beyaz) tasarım diline çevrilerek **`Ayarlar > Masa Düzeni`** (`TableManagement.jsx`) adıyla bağımsız tam sayfa bir modüle dönüştürüldü. Eski dosyalar projeden temizlendi.
- **Dinamik Besleme:** Cihaz eklerken çıkan "Bağlı Olduğu Salon" girdi alanı, artık Masa Düzeni sayfasında oluşturulan gerçek salonları (Bahçe, Teras vb.) açılır menü (`<select>`) olarak getirmektedir.
- **Toplu QR Baskı Optimizasyonu:** QR Yazdır ekranı tamamen yeniden tasarlandı. Tarayıcının "Yazdır" komutu verildiğinde (`@media print` CSS kuralları ile) ekrandaki butonları gizleyen, QR'ları tam boyutlu bir **A4 kağıda** ızgara (grid) nizamında yerleştiren yepyeni bir `TableQrPrintModal.jsx` yapıldı.

---

## 4. Bir Sonraki Geliştirici İçin: Nereden Devam Edilmeli? (TODO)

Altyapı (Pairing, Veritabanı ve Kısıtlamalar) mükemmel şekilde tamamlanmıştır. Yeni cihaza geçildiğinde uygulamanın işleyişi (Runtime) ile ilgili şu maddeler ele alınmalıdır:

1. **Sıra Ekranı Görünümü (Queue Screen UI):**
   - `DeviceSettings`'in ürettiği `/sira-ekrani/:pairKey` rotası için `App.jsx` içine bir Route eklenmeli ve bir component tasarlanmalıdır. Bu ekran, cihazın yetkili olduğu Pickup terminallerindeki "Hazır" sipariş numaralarını büyük puntolarla göstermelidir.
2. **KDS ve Pickup Socket Filtrelemeleri:**
   - Cihaz eşleştiğinde kendi yetkilerini `config_data` üzerinden biliyor. Ancak KDS ekranının (`/kds`) websocket (veya supabase realtime) üzerinden gelen her siparişi değil, **sadece `config_data.allowed_sources` içindeki pair_key/terminal_id**'lere sahip siparişleri ekranda göstermesi (filtrelemesi) kodlanmalıdır.
3. **Satış Raporlaması / Terminal İzlenebilirliği:**
   - Sipariş (Order/Sales) ödeme alınıp tamamlandığında, işlemi yapan cihazın `terminal_id`'sinin `sales` tablosundaki `created_by_terminal` kolonuna yazılması mantığının test edilmesi gerekmektedir. Böylece "Hangi garson tabletinden ne kadar ciro yapılmış?" raporlanabilecektir.
