# Yeni Ürün Ekleme ve Menü Tanımlama Kılavuzu

Sisteme yeni bir ürün (örneğin: **Yeni Bir Hamburger Çeşidi**) eklemek ve satışa sunmak için takip edilmesi gereken operasyonel ve sistemsel adımlar aşağıda sıralanmıştır.

---

## 🛠️ Adım Adım Ürün Ekleme Süreci

### Adım 1: Hammadde ve Stok Kartlarının Oluşturulması
Hamburgerin yapımında kullanılacak tüm çiğ malzemeler (Hamburger Ekmeği, Hamburger Köftesi, Yeşillik, Turşu vb.) stok kalemi olarak sisteme girilmelidir.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/stock-items](http://localhost:5173/stock-items)
* **Kaynak Kod Dosyası:** [StockItems.jsx](file:///c:/RMSv3/src/components/pages/StockItems.jsx)
* **Veritabanı Karşılığı:** `public.stock_items` tablosu.
* **Kritik Detay:** Malzemelerin stok birimleri (Gram, Adet vb.) ve ortalama maliyet fiyatları doğru tanımlanmalıdır.

### Adım 2: Yarı Mamul Reçetelerinin Hazırlanması (Eğer Varsa)
Hamburgerde kullanılacak özel bir sos veya mutfakta önceden hazırlanan marine edilmiş köfte gibi ara ürünler varsa bunlar "Yarı Mamul" olarak açılmalıdır.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/semi-products](http://localhost:5173/semi-products)
* **Kaynak Kod Dosyası:** [SemiProducts.jsx](file:///c:/RMSv3/src/components/pages/SemiProducts.jsx)
* **Veritabanı Karşılığı:** `public.semi_products` tablosu.
* **Kritik Detay:** Yarı mamullere de kendi içindeki hammaddelerden oluşan bir reçete bağlanır.

### Adım 3: Satış Kategorisinin Belirlenmesi
Yeni hamburgerin POS ve Kiosk ekranlarında hangi menü veya kategori altında listeleneceğini belirleyin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sale-categories](http://localhost:5173/sale-categories)
* **Kaynak Kod Dosyası:** [SaleCategories.jsx](file:///c:/RMSv3/src/components/pages/SaleCategories.jsx)
* **Veritabanı Karşılığı:** `public.sale_categories` tablosu.

### Adım 4: Seçenek Gruplarının ve Modifiers Tanımlanması
Hamburger için "Soğansız", "Ekstra Peynirli", "Sos Tercihi" gibi seçenekler ve ekstralar tanımlanmalıdır.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/options](http://localhost:5173/options)
* **Kaynak Kod Dosyası:** [Options.jsx](file:///c:/RMSv3/src/components/pages/Options.jsx)
* **Veritabanı Karşılığı:** `public.sale_options` ve `public.option_groups` tabloları.

### Adım 5: Satış Kartının Oluşturulması ve Eşleştirmeler
Bu adım, yukarıda hazırlanan tüm katmanların birleştirildiği ana adımdır.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/products](http://localhost:5173/products)
* **Kaynak Kod Dosyası:** [SaleItems.jsx](file:///c:/RMSv3/src/components/pages/SaleItems.jsx)
* **Gerekli Alanlar:**
  1. **Genel Bilgiler:** Ürün Adı (örn: "Özel Soslu Cheddar Burger"), SKU, Kategori (Burgerler), KDV oranı ve Satış Fiyatı.
  2. **Seçenek Grupları:** Adım 4'te oluşturulan seçenek gruplarını bu karta bağlayın.
  3. **Porsiyonlar:** Ürünün Double, Single gibi porsiyonları varsa ve fiyatları farklıysa Portion ayarlarından tanımlayın.
  4. **Reçete Bağlantısı (Recipe):** `recipe_linked` seçeneğini aktif edin ve reçete satırlarına Adım 1 ve Adım 2'de oluşturulan stok kartlarını/yarı mamulleri miktarlarıyla (örn: 1 adet ekmek, 120 gr köfte) ekleyin.
* **Veritabanı Karşılığı:** `public.sale_items` tablosu (reçete satırları `recipe_rows` jsonb kolonunda, porsiyonlar `portions` jsonb kolonunda tutulur).

---

## 🔍 Kontrol ve Canlıya Alma Listesi

> [!IMPORTANT]
> **Satış Öncesi Son Kontroller:**
> * POS ekranında görünmesi için ürün kartındaki `active` ve `sale_status` bayraklarının `true` olduğundan emin olun.
> * Eğer ürünün stok takibi reçete üzerinden anlık düşülecekse reçete satırlarının tam ve eksiksiz doldurulduğunu [SaleItems.jsx](file:///c:/RMSv3/src/components/pages/SaleItems.jsx) detay panelinden teyit edin.
> * Ürün fiyatlarının şubelere göre farklılık gösterip göstermediğini `channel_prices` ayarlarından kontrol edin.
