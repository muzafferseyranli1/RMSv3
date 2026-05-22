# Walkthrough - Sadakat Koşulları Yerel Entegrasyonları ve PostgreSQL JSONB Düzeltmeleri

Bu belgede, sadakat koşullarının POS sadakat değerlendirme motorunda yerel (local) olarak çözülmesi, PostgreSQL JSONB kaydetme hatasının giderilmesi ve arayüzdeki yazım düzeltmeleri özetlenmiştir.

---

## Son Yapılan Geliştirmeler: PostgreSQL JSONB Kolonları İçin Otomatik Stringify Entegrasyonu (`server/index.js`)

- **JSONB Veri Kayıt Hatasının Giderilmesi**:
  - Kupon setleri (`loyalty_coupon_series`, `loyalty_coupons`), sadakat programları (`loyalty_programs`), kampanyalar (`loyalty_campaigns`), kurallar (`loyalty_campaign_rules`), görevler (`tasks`) ve diğer birçok yeni JSONB kolonu içeren tabloda veri kaydetme sırasında karşılaşılan `invalid input syntax for type json` hatası giderildi.
- **`normalizeWriteValue` Kayıt Defteri Güncellemesi**:
  - `server/index.js` içerisindeki `normalizeWriteValue` fonksiyonunda yer alan `jsonbColumns` kayıt defterine yeni eklenen tüm tablolar ve bunlara ait JSONB kolon isimleri tanımlandı.
  - Bu sayede ön yüzden gönderilen JavaScript nesneleri, SQL sorgusuna parametre olarak gönderilmeden önce otomatik olarak geçerli JSON string değerlerine dönüştürülür.
- **Güvenli Fallback Tanımları**:
  - Gelecekte benzer veri kaydetme sorunları yaşanmaması adına, şema dosyasındaki tüm JSONB kolonları (`count_flows`, `customer_addresses`, `order_flows`, `pos_sales` vb.) taranarak tamamı `jsonbColumns` kapsamına dahil edildi.

---

## Önceki Geliştirmeler: Kupon Koşulu (`coupon_present`) Yerel Çözümlemesi & Arayüz Düzeltmeleri


### 1. Kupon Koşulu (`coupon_present`) Yerel Entegrasyonu (`posLoyalty.js` & `loyaltyRuntimeStatus.js`)
- **Yerel Çözümleme Yeteneği**: `LOCAL_RULE_CONDITION_KEYS` kümesine `'coupon_present'` anahtarı eklenerek, kuralın harici sunucuya yönlendirilmeden yerel olarak çözümlenmesi sağlandı.
- **Doğal Dil Önizlemesi (`getConditionPreview`)**: Kampanya detaylarında veya listesinde koşulun kupon serileriyle birlikte görünmesi için dinamik bir formatlayıcı eklendi (Örnek: `"Seçili 1 kupon serisinden biri"` veya `"Herhangi bir kupon serisi"`).
- **Asenkron Kupon Sorgusu (`evaluateRuntimeOrderCampaignsAsync`)**:
  - Girilen kupon kodu (`selectedCouponCode`), asenkron olarak veritabanının `loyalty_coupons` tablosundan sorgulanıp `couponDetails` nesnesine aktarıldı.
- **Yerel Doğrulama Mantığı (`evaluateSingleCondition`)**:
  - Kuponun aktifliği (`active !== false`), kullanılmamış olması (`is_used` veya `redemption_status` durumları kontrol edilerek), son kullanma tarihi (`expires_at >= now`) ve kupon serisi doğrulamaları tamamen yerel motor katmanında çözümlendi.
- **Durum Güncellemesi (`loyaltyRuntimeStatus.js`)**:
  - `coupon_present` kuralının kategorisi `'server'` değerinden `'local'` değerine çekildi.

### 2. Arayüz Yazım Hatalarının Düzeltilmesi ("blog" $\rightarrow$ "blok")
- Arayüzdeki bazı metinlerde mantıksal kural kümelerini ifade etmek için yanlışlıkla kullanılan "blog" (veya "blogu/blogları") kelimeleri, anlam karmaşasını önlemek adına doğru Türkçe karşılığı olan **"blok"** ("bloğu / blokları") terimi ile değiştirildi:
  - **[LoyaltyCampaignWizard.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/loyalty/LoyaltyCampaignWizard.jsx)**: `Siparis aninda calisan blog` $\rightarrow$ `Sipariş anında çalışan blok` ve `Zaman bazli akisa bagli blog` $\rightarrow$ `Zaman bazlı akışa bağlı blok` olarak güncellendi.
  - **[LoyaltyManagement.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/LoyaltyManagement.jsx)**: Koşul ve eylem pencerelerindeki tüm `blog`, `blogu`, `blogları` ifadeleri `blok`, `bloğu`, `blokları` olarak güncellendi ve Türkçe karakter desteğiyle daha düzgün hale getirildi.

---

## Önceki Geliştirmeler: Sepette Eksik Ürün (missing_products) Koşulu

"Ürün siparişte yoksa / Sepette eksik ürün" (`missing_products`) koşulunun POS yerel değerlendirme motoru katmanında tam olarak desteklenebilmesi amacıyla şu güncellemeler yapılmıştır:

### 1. Koşulun Yerel Listeye Tanıtılması (posLoyalty.js)
- `LOCAL_RULE_CONDITION_KEYS` kümesine `'missing_products'` koşul anahtarı eklenerek motorun bu koşulu harici sunucuya yönlendirmeden yerel olarak çözümlemesi sağlandı.

### 2. Koşul Değerlendirme Mantığı (posLoyalty.js)
- `evaluateSingleCondition` fonksiyonu içerisine `'missing_products'` case'i eklendi.
- Koşul konfigürasyonunda yer alan ürün maskeleri (`productMasks`) alındı.
- Eğer maske listesi boş ise koşulun doğrudan sağlandığı (`matched: true`) kabul edildi.
- Maske listesi dolu ise mevcut sepet satırları (`orderContext.cartLines`) ile maskelenen ürün/kategori/şablonların eşleşip eşleşmediği `getMatchingCartLinesContribution` yardımcı fonksiyonu kullanılarak kontrol edildi.
- Koşulun amacı eksik ürünleri tespit etmek olduğundan, sepette hiçbir eşleşme bulunmadığı durumda koşul başarılı (`matched: true`), eşleşme bulunduğu durumda ise başarısız (`matched: false`) olarak kabul edildi.
- Koşul değerlendirme sonucuna, hangi ürünlerin bulunup bulunmadığına dair anlaşılır Türkçe neden açıklamaları (`reason`) eklendi.

### 3. Önizleme ve Doğal Dil Gösterimi (posLoyalty.js)
- `getConditionPreview` fonksiyonuna `missing_products` desteği eklendi. Sepette eksik olan ürünlerin adları alınarak, kampanya önizleme kartlarında dinamik olarak **"Sepette [Ürün Adları] yoksa"** şeklinde anlaşılır ve doğal dilde bir açıklama üretilmesi sağlandı.

### 4. Satış Şablonu Yükleme Desteği (posLoyalty.js)
- `evaluateRuntimeOrderCampaignsAsync` fonksiyonunda satış şablonlarının (`sale_templates`) yüklenme tetikleyicisine `missing_products` koşulu dahil edildi.
- Müşteri ID'si (`customerId`) bulunmayan misafir (guest) siparişlerde de şablon bazlı filtreleme yapılabilmesi için şablon yükleme işlemindeki müşteri zorunluluğu kaldırıldı.

---

## Önceki Geliştirmeler: Müşteriden Bağımsız Satış Kanalı Filtreli Dönemlik Ürün Satış Koşulu

"Dönem içinde satılan ürün miktarı" (`period_sold_product_quantity`) koşulunun hedeflenen şekilde çalışabilmesi için veritabanı ve iş mantığı katmanlarında şu güncellemeler yapılmıştır:

### 1. Veritabanı Katmanı (SQL Migrasyonu - 013)
- **Yardımcı Fonksiyon**: Satış kanalı isimlerini (örneğin: `'Çagrı Merkezi'`, `'Garson'`, `'Kiosk'`, vb.) standardize eden immutable `public.normalize_sales_channel_key(channel_name text)` fonksiyonu oluşturuldu.
- **RPC Güncellemesi**: `public.get_customer_period_stats` fonksiyonu `p_sales_channel text DEFAULT NULL` opsiyonel parametresini kabul edecek şekilde güncellendi.
- **Koşul Esnekliği**:
  - `p_customer_id` değeri `NULL` gönderildiğinde müşteri bazlı filtre devre dışı bırakılarak tüm sistemdeki (şubedeki) geçmiş satışlar sorgulanır hale getirildi.
  - `p_sales_channel` parametresi gönderildiğinde, geçmiş satışların sipariş kanalı ile siparişin aktif kanalı normalize edilerek filtreleme sağlandı.

### 2. İş Mantığı Katmanı (posLoyalty.js)
- **Müşteri Zorunluluğu Kaldırıldı**: `evaluateSingleCondition` fonksiyonunda `period_sold_product_quantity` koşulu için `customerId` kontrolü esnetildi. Müşteri bilgisi olmasa dahi bu koşul değerlendirilmeye devam eder.
- **Asenkron Veri Toplama Refaktörü**: `evaluateRuntimeOrderCampaignsAsync` fonksiyonunda dönem sorguları toplama mantığı `customerId` bağımlılığından ayrıldı.
  - Müşteri yoksa sadece `period_sold_product_quantity` içeren kampanyaların istatistikleri veri tabanından sorgulanır.
  - RPC çağrısı yapılırken siparişin aktif kanalı `p_sales_channel => options.runtimeChannel || 'pos'` olarak iletilir.
  - Kampanya tipi `period_sold_product_quantity` olduğunda müşteri ID'si her zaman `null` gönderilerek tüm müşterileri kapsayan global miktar sorgulanması sağlanır.

### 3. Arayüz Katmanı (Karşılaştırma Ölçütü Terimleri)
- **Terim Güncellemesi**: Kampanya sihirbazı ve kampanya yönetimi ekranlarında ortak kullanılan `COMPARISON_OPTIONS` (`src/lib/loyalty.js`) karşılaştırma ölçütü etiketleri daha anlaşılır Türkçe ifadelerle güncellendi:
  - `eq` (Eşit) $\rightarrow$ **"eşit"**
  - `gt` (Büyük) $\rightarrow$ **"büyük"**
  - `gte` (Eşit veya büyük) $\rightarrow$ **"eşit veya büyük"**
  - `lt` (Küçük) $\rightarrow$ **"küçük"**
  - `lte` (Eşit veya küçük) $\rightarrow$ **"eşit veya küçük"**
  - `divisible` (Bölünebilir) $\rightarrow$ **"bölünebilir"**
- **Doğal Dil Formatlayıcı Güncellemesi**: Hem [LoyaltyCampaignWizard.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/loyalty/LoyaltyCampaignWizard.jsx) hen de [LoyaltyManagement.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/LoyaltyManagement.jsx) üzerindeki `formatComparisonNatural` fonksiyonları, doğal dil yerine literal karşılıklarını döndürecek şekilde güncellendi. Böylece tüm dönemlik ve standart karşılaştırma ekranlarında aynı terim birliği sağlandı.

---

## Doğrulama ve Derleme

- Yapılan tüm değişikliklerin ardından yerel ortamda temiz derleme kontrolü yapılmıştır:
  ```powershell
  npm run build
  ```
- **Sonuç**: Derleme işlemi başarıyla tamamlanmıştır. Herhangi bir linter veya derleme hatası tespit edilmemiştir.
