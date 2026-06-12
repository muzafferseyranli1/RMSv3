# Kayıp Müşteri Geri Kazanım (Win-Back) Kılavuzu

Bu kılavuz, işletmenize gelmeyi bırakan veya son zamanlarda sipariş sıklığı azalan eski (uykudaki) müşterileri tekrar kazanmak için SuitableRMS sadakat ve segmentasyon modülleriyle uygulayabileceğiniz stratejileri ve kurulum adımlarını açıklar.

---

## 🛠️ Adım Adım Geri Kazanım Operasyonu

### Adım 1: Uykudaki Müşterilerin Tespit Edilmesi
Son sipariş tarihi (`last_order_at`) veya son ziyaret tarihi (`last_visit_at`) uzun süredir (örneğin 45 günden fazla) güncellenmemiş olan müşterileri belirleyin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/company](http://localhost:5173/company) (Müşteriler Sekmesi)
* **Kaynak Kod Dosyası:** [Musteriler.jsx](file:///c:/RMSv3/src/components/pages/Musteriler.jsx)
* **Veritabanı Karşılığı:** `public.musteriler` tablosundaki `last_order_at` ve `total_order_count` alanları taranır.

### Adım 2: "Seni Özledik" Müşteri Segmentinin Oluşturulması
Belirlediğiniz bu uykudaki/kayıp müşterileri hedefleyebilmek için özel bir müşteri kategorisi oluşturun.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sadakat/kategoriler](http://localhost:5173/sadakat/kategoriler)
* **Kaynak Kod Dosyası:** [LoyaltyCustomerCategories.jsx](file:///c:/RMSv3/src/components/pages/LoyaltyCustomerCategories.jsx)
* **Veritabanı Karşılığı:** `public.loyalty_customer_categories` ve `public.loyalty_customer_category_members` tabloları.

### Adım 3: Sadece Bu Kitleye Özel Kampanya Sihirbazının Çalıştırılması
Oluşturduğunuz "Uykudaki Müşteriler" segmentine özel, onları geri getirecek yüksek puan veya indirim içeren bir kampanya tanımlayın.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sadakat/kampanya/yeni](http://localhost:5173/sadakat/kampanya/yeni)
* **Kaynak Kod Dosyası:** [LoyaltyManagement.jsx](file:///c:/RMSv3/src/components/pages/LoyaltyManagement.jsx)
* **Veritabanı Karşılığı:** `public.loyalty_campaigns` tablosu (`audience_json` kolonunda ilgili müşteri kategorisinin UUID'si eşleştirilir).
* **Kritik Ayar:** Kampanya sihirbazında hedef kitle (Audience) adımından sadece "Uykudaki Müşteriler" kategorisini seçin.

### Adım 4: Kişiye Özel Geri Kazanım Kuponu Dağıtılması
Geri kazanım kampanyasını tetiklemek amacıyla, sadece bu hedef kitledeki müşterilerin telefonlarına veya maillerine gönderilecek özel kupon kodları üretin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sadakat/kuponlar](http://localhost:5173/sadakat/kuponlar)
* **Kaynak Kod Dosyası:** [LoyaltyCouponSets.jsx](file:///c:/RMSv3/src/components/pages/LoyaltyCouponSets.jsx)
* **Veritabanı Karşılığı:** `public.loyalty_coupon_series` ve `public.loyalty_coupons` tabloları.
