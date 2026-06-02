# Kuver Yönetimi Entegrasyonu Görev Listesi

- `[x]` 1. Cihaz Yönetimi Ekranı Ayarları
  - `[x]` `DeviceSettings.jsx` içinde `coverSettings` state'ini ekle ve `settings` tablosundan yükle.
  - `[x]` Master (Ana Kasa) cihaz düzenlenirken kuver takibi checkbox'ını ve default kuver sayısı input alanını (ondalıklı girişe izin veren `step="0.1"` vb.) ekle.
  - `[x]` Master cihaz kaydedildiğinde bu ayarları `settings` tablosuna `cover_settings` key'iyle kaydet.

- `[x]` 2. POS Terminali Entegrasyonu
  - `[x]` `distributeCover` yardımcı fonksiyonunu ekle (ondalıklı sayıları tam sayılara yuvarlamadan %40-%40-%20 oranlarına göre bölen).
  - `[x]` `normalizeGuestCounts` içindeki `parseInt` kısıtlamalarını `parseFloat` olarak güncelle.
  - `[x]` `cover_settings` ayarını `settings` tablosundan yükle.
  - `[x]` Takip kapalıysa sağ taraftaki 3'lü kuver ikon seti (Kadın, Erkek, Çocuk butonları) gizle.
  - `[x]` Yeni bilet açılırken/sanitize edilirken `defaultGuestCounts` kullanacak şekilde `sanitizeOpenTicket` fonksiyonunu güncelle.
  - `[x]` Hızlı satış temizlenirken veya sıfırlanırken varsayılan kuver değerini ata.

- `[x]` 3. Garson (Tablet) Entegrasyonu
  - `[x]` `distributeCover` yardımcı fonksiyonunu ekle.
  - `[x]` `normalizeGuestCounts` içindeki `parseInt` kısıtlamalarını `parseFloat` olarak güncelle.
  - `[x]` `cover_settings` ayarını `settings` tablosundan yükle.
  - `[x]` Takip kapalıysa kuver ikon setini gizle.
  - `[x]` Yeni bilet açılırken/sanitize edilirken `defaultGuestCounts` kullanacak şekilde güncelle.

- `[x]` 4. Veritabanı Değişikliği (Decimal Desteği)
  - `[x]` `sales` ve `pos_sales` tablolarındaki `cover_count`, `female_guest_count`, `male_guest_count` ve `child_guest_count` kolonlarının veri tipini `NUMERIC(12,2)` olarak güncelleyen `025_alter_guest_counts_to_numeric.sql` SQL betiğini Railway canlı veritabanına uygula.

- `[x]` 5. Arayüz ve Hata Düzeltmeleri (Hotfixes)
  - `[x]` `Garson.jsx` ve `POS.jsx` dosyalarında cart içerisindeki eksik/hatalı veya combo ürünlerde `sale_cat_l5` okunurken oluşan `Cannot read properties of undefined` hatasını önlemek için `getProductCategoryId` fonksiyonunu isteğe bağlı zincirleme (`optional chaining` `item?.`) ile güvenli hale getir.

- `[x]` 6. Derleme & Doğrulama
  - `[x]` Uygulamanın hatasız build edildiğini doğrula (`npm run build`).
