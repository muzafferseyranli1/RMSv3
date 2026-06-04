# GÖREV: Belirli Tarih ve Şube İçin Kontrollü Demo Satış Verisi Üretimi ve Entegrasyonu

Bu görev, veritabanına doğrudan SQL yazabilen ve Javascript/Node.js kodları çalıştırabilen bir yapay zeka ajanının, sistemdeki gerçek ürün reçetelerini ve fiyatlarını temel alarak **belirli bir şube ve tarih için** gerçekçi demo satışları ve bunlara bağlı stok hareketlerini oluşturması için tasarlanmıştır.

Aşağıdaki talimatları sırasıyla ve eksiksiz bir şekilde uygulayarak verileri veritabanına entegre etmelisin.

---

## 1. HEDEF PARAMETRELER
*   **Hedef Tarih (YYYY-AA-GG):** `[BURAYA HEDEF TARİHİ YAZIN, Örn: 2026-05-28]`
*   **Hedef Şube Adı:** `[BURAYA HEDEF ŞUBEYİ YAZIN, Örn: Kadıköy Şubesi]`

---

## 2. ADIM 1: METADATA VE COĞRAFİ BİLGİLERİN ÇEKİLMESİ
İşleme başlamadan önce veritabanından gerekli şube, kanal ve ürün katalog bilgilerini sorgula:

1.  **Şube ve Üst Şirket Bilgileri:**
    `company_nodes` tablosundan şube adına göre aşağıdaki alanları çek:
    *   `branch_id` (UUID formatında)
    *   `company_id` (Bağlı olduğu şirketin UUID'si)
    *   `legal_entity_id` (Tüzel kişilik UUID'si)
    *   `org_unit_id` (Organizasyon birimi UUID'si)
    *   `branch_name` (Şube adı)
    *(Eğer bu alanlar şube satırında doğrudan bulunmuyorsa, hiyerarşideki parent_id zincirini takip ederek en üst Şirket, Tüzel Kişilik ve Organizasyon Birimi ID'lerini çöz).*

2.  **Satış Kanalı:**
    `sales_channels` tablosundan `active = true` olan ve adı içinde **"hizli"** (büyük/küçük harf duyarsız) geçen ilk kanalı seç. Bu kanalın `id` ve `name` (Genellikle "Hizli Satis") bilgilerini kullanacaksın.

3.  **Ürünler ve Fiyat Kataloğu:**
    `sale_items` tablosundan aktif ürünleri çek:
    *   **Koşul:** `deleted_at IS NULL` AND `sale_status = true` AND `setting_active = true`.
    *   **Çekilecek Sütunlar:** `id`, `sku`, `name`, `standard_price`, `portions`, `option_groups`, `channel_prices`, `recipe_rows`, `recipe_output_qty`, `sale_cat_l1`, `sale_cat_l2`, `sale_cat_l3`, `sale_cat_l4`, `sale_cat_l5`.
    *   **Kanal Fiyat Kontrolü:** Her ürünün `channel_prices` (JSONB dizisi) içinden seçtiğin Satış Kanalı ID'sine ait `{channel_id, price, active: true}` kaydını bul. Bu fiyata sahip ürünleri simülasyona dahil et. Fiyatı sıfır veya tanımsız olanları hariç tut.

4.  **Kategoriler ve Vergiler:**
    *   `sale_categories` tablosundan tüm aktif kategorileri (`id`, `name`, `parent_id`) çek.
    *   `taxes` tablosundan tüm vergi oranlarını (`id`, `name`, `rate`) çek.

5.  **Stok ve Yarı Mamul Kartları:**
    *   `stock_items` tablosundan aktif hammaddeleri (`id`, `name`, `sku`, `unit`) çek.
    *   `semi_items` tablosundan aktif yarı mamulleri (`id`, `name`, `sku`, `recipe_output_unit`) çek.

---

## 3. ADIM 2: SİMÜLASYON HACMİNİN HESAPLANMASI
Hedef tarih ve şube profiline göre fiş sayısını ve ortalama ciroyu hesapla:

1.  **Haftalık Gün Ağırlıkları (Day Weights):**
    Hedef tarihin haftanın hangi gününe geldiğini bul ve aşağıdaki varsayılan oranlara göre ağırlık faktörünü hesapla:
    *   **Pazartesi:** %8 | **Salı:** %9 | **Çarşamba:** %12 | **Perşembe:** %11 | **Cuma:** %17 | **Cumartesi:** %20 | **Pazar:** %23
    *   **Formül:** `weekdayFactor = ((dayWeight) / 100) * 7` (0.7 ile 1.3 arasına sınırlandırılır).

2.  **Günlük Fiş Sayısı (Receipt Count):**
    *   Varsayılan aralık: **160 ile 300** arası fiş.
    *   Hedef tarih için rastgele bir baz sayı belirle ve bunu gün ağırlık faktörüyle çarp:
        `rawCount = random_integer(160, 300) * weekdayFactor * random_float(0.78, 1.22)`
    *   Bulduğun fiş sayısını en az 160, en fazla 300 olacak şekilde sınırla (`clamp`).

3.  **Fiş Ortalama Tutarı (Average Receipt Amount):**
    *   Varsayılan ciro aralığı: **480 TRY ile 795 TRY** arası.
    *   Rastgele bir baz ortalama belirle: `receiptAverage = random_float(480, 795)`.
    *   Oluşturulacak her bir fiş için hedef tutar belirlemek üzere, bu ortalamayı şu dalgalanma aralıklarıyla çarp:
        *   Her 7. fiş için: baz ortalamanın `0.65` ile `1.38` katı arası.
        *   Her 3. fiş için: baz ortalamanın `0.76` ile `1.26` katı arası.
        *   Diğer fişler için: baz ortalamanın `0.84` ile `1.18` katı arası.
        *(Belirlenen fiş hedef tutarını her zaman 480 ile 795 TRY sınırları içerisinde tut).*

---

## 4. ADIM 3: SATIŞ SEPETLERİNİN OLUŞTURULMASI (BASKET GENERATION)
Belirlenen fiş sayısı kadar döngü kur. Her fiş için şu kurallara göre sepeti doldur:

1.  **Ürün Sınıflandırması:**
    Ürün adları ve kategori adlarına göre ürünleri tiplere ayır:
    *   **Main (Ana Yemek):** Ürün veya kategori adında "hamburger", "burger", "sandvic", "wrap", "taco", "pizza" geçenler. (Ağırlık: 4.8)
    *   **Drink (İçecek):** "icecek", "mesrubat", "cola", "fanta", "kahve", "coffee", "su ", "ayran" geçenler. (Ağırlık: 2.35)
    *   **Side (Yan Ürün):** "yan urun", "patates", "sogan halkasi", "fries", "nugget" geçenler. (Ağırlık: 1.95)
    *   **Misc (Diğer):** Yukarıdakilere uymayanlar. (Ağırlık: 1.2)

2.  **Sepet Satır Sayısı Planı:**
    Fişin hedef tutarına göre satır sayısı belirle:
    *   Tutar < 350 TRY ise: 1 - 2 farklı ürün.
    *   Tutar < 700 TRY ise: 1 - 3 farklı ürün.
    *   Tutar < 1200 TRY ise: 2 - 4 farklı ürün.
    *   Tutar < 1800 TRY ise: 2 - 5 farklı ürün.
    *   Tutar >= 1800 TRY ise: 3 - 6 farklı ürün.

3.  **Kategori Dağılım Planı:**
    *   Eğer hedef tutar >= 360 TRY ise veya %82 ihtimalle sepet mutlaka en az bir **Main (Ana Yemek)** içersin.
    *   Sepet tutarı >= 450 TRY ise %58, aksi halde %26 ihtimalle bir **Drink (İçecek)** içersin.
    *   Sepet tutarı >= 600 TRY ise %48, aksi halde %18 ihtimalle bir **Side (Yan Ürün)** içersin.
    *   Sepet tutarı >= 1400 TRY ise %20 ihtimalle ikinci bir **Main (Ana Yemek)** eklensin.
    *   Eksik satırlar yukarıdaki kategori ağırlıklarına göre rastgele seçilsin.

4.  **Ürün Seçimi ve Konfigürasyon:**
    Her planlanan satır için kategori havuzundan bir ürün seç (klasik ürünlere %20 daha fazla öncelik ver, duble/acılı ürünleri hafifçe azalt):
    *   **Porsiyon Seçimi:** Ürünün `portions` dizisinde tek porsiyon varsa onu al. Çoklu varsa %65 ihtimalle ilkini (varsayılanı), %35 ihtimalle diğerlerinden birini seç.
    *   **Seçenek (Options) Seçimi:** Ürünün `option_groups` listesindeki zorunlu gruplardan (`min_select > 0`) ve zorunlu olmayan gruplardan (%33 ihtimalle) kurallara uygun (`min_select` ile `max_select` arasında) rastgele opsiyonlar seç.
    *   **Birim Fiyat Hesaplama:** `Birim Fiyat = (Kanal Fiyatı) + (Porsiyon Fiyat Farkı) + (Seçilen Opsiyonların Fiyat Toplamı)`.

5.  **Miktar (Quantity) ve Toplama Tamamlama:**
    *   Ürün tipine göre maksimum adet sınırları: Main için max 2 (büyük fişlerde max 4), İçecek/Yan ürünler için max 2 (büyük fişlerde max 3).
    *   Sepetteki ürünün adet miktarını `Kalan Hedef Tutar / Birim Fiyat` oranına göre belirle (adetleri yukarıdaki limitlere sadık kalarak rastgele dalgalandır).
    *   Sepetin toplam tutarı hedef tutarın gerisinde kaldıysa, mevcut ürünlerin adetlerini artır veya yeni ürünler ekle (en fazla 5 deneme yap).

---

## 5. ADIM 4: İNDİRİM VE ÖDEME YAPILANDIRMASI
Oluşturulan her fiş için indirim ve ödeme satırlarını belirle:

1.  **İndirim (Discount) Kuralları:**
    *   Fişlerin **%34**'üne rastgele **%5 ile %15** arasında indirim oranı uygula.
    *   Toplam indirim tutarını hesapla: `discountAmount = Brüt Tutar * (Oran / 100)`.
    *   Bu indirim tutarını sepet satırlarına, satırın toplam tutardaki payı oranında dağıt (`discount_allocated_amount` sütununa yaz). Kuruş yuvarlama farkını son satıra ekle.
    *   Satırların net tutarlarını hesapla: `line_gross_after_discount = line_gross_before_discount - discount_allocated_amount`.
    *   Vergisiz net ciro tutarını hesapla: `line_net_after_discount = line_gross_after_discount / (1 + tax_rate / 100)`.

2.  **Ödeme (Payment) Yöntemi Kuralları:**
    *   Fiş tutarı **400 TRY**'nin üzerindeyse ve **%28** ihtimal dahilindeyse ödemeyi **bölünmüş (split)** olarak kaydet:
        *   Rastgele iki yöntem seç (Nakit, Kredi Karti, Transfer, Yemek Ceki listesinden).
        *   Fiş tutarını bu iki yönteme rastgele (%35-%65 oranlarında) dağıtarak `sale_payments` tablosuna iki ayrı satır ekle.
    *   Diğer durumlarda tekil ödeme kaydet (%72 Kredi Kartı, %28 diğer yöntemler).

---

## 6. ADIM 5: REÇETE TÜKETİMLERİNİN (STOK HAREKETLERİNİN) HESAPLANMASI
Her fişin her bir sepet satırı için stok tüketim hareketlerini (`inventory_movements`) hesapla:

1.  Ürünün `recipe_rows` (JSONB) alanındaki reçete satırlarını oku.
2.  Her bir reçete satırı için:
    *   Eğer reçete satırında `channels` veya `portions` filtreleri varsa, satışın kanalı ve porsiyonu ile eşleştiğinden emin ol (eşleşmiyorsa bu satırı atla).
    *   Reçete içeriğinin tipini (`stock_item_id` varsa `stock_item`, `semi_item_id` varsa `semi_item`) belirle ve ilgili stok kartından `sku` ve `unit` bilgilerini al.
    *   **Tüketim Miktarı Formülü:**
        `tuketim_miktari = (recete_miktari * (1 + waste_pct / 100) / recipe_output_qty) * satilan_urun_adedi`
    *   **Maliyet Hesaplama:** Reçetede yazılı olan snapshot maliyeti (`cost`) birim maliyet kabul et:
        `total_cost = unit_cost * tuketim_miktari`.

---

## 7. ADIM 6: VERİTABANINA GÜVENLİ VE KONTROLLÜ YAZMA (INSERT)
Tüm fişler ve hareketler bellekte oluşturulduktan sonra aşağıdaki kurallara göre tek bir veritabanı işlemi (Transaction) içinde ekleme yap:

### A. Eklenecek Tablolar ve Sütun Yapısı

1.  **`sales` (Fiş Başlıkları):**
    *   `id`: UUID (Yeni oluşturulacak)
    *   `local_id`: `'demo-' || branch_id || '-' || hedef_tarih || '-' || fis_indeksi || '-' || rastgele_hash` (Tekil olmalı!)
    *   `sale_datetime`: Hedef tarihte, saat 09:00 ile 21:00 arasına dağıtılmış zaman damgası (`TIMESTAMPTZ` formatında, örn: `2026-05-28T14:23:00+03:00`)
    *   `source`: `'pos'`
    *   `source_channel_type`: `'hizli_satis'`
    *   `sales_channel_id` & `sales_channel_name`: Seçilen kanal bilgileri
    *   `company_id`, `company_name`, `legal_entity_id`, `legal_entity_name`, `org_unit_id`, `org_unit_name`, `branch_id`, `branch_name`: Şube bilgileri
    *   `gross_total_before_discount`: Fiş brüt toplamı (indirim öncesi)
    *   `discount_type`: İndirim varsa `'percent'`, yoksa `null`
    *   `discount_value`: İndirim oranı (örn: 10.000000), yoksa `0`
    *   `discount_amount`: Toplam indirim tutarı
    *   `gross_total_after_discount` & `payment_total`: İndirim sonrası brüt tutar
    *   `net_total_after_discount`: Satırların `line_net_after_discount` toplamı
    *   `cost_total`: Satırların toplam hammadde maliyeti snapshot toplamı
    *   `status`: `'completed'`
    *   `integration_ref`: `'demo-sales-tool'` (Mutlaka bu değer olmalı!)

2.  **`sale_lines` (Fiş Detay Satırları):**
    *   `id`: UUID
    *   `sale_id`: Bağlı olduğu `sales.id`
    *   `line_no`: 1'den başlayan satır numarası
    *   `product_id`, `product_name`, `product_sku`: Ürün bilgileri
    *   `top_category_id`, `top_category_name`, `sub_category_id`, `sub_category_name`: Ürün kategori bilgileri
    *   `portion_id` & `portion_name`: Seçilen porsiyon bilgisi
    *   `options_json`: Seçilen opsiyonlar (Format: `[{"id": "...", "name": "..."}]`)
    *   `options_summary`: Seçenek isimlerinin birleşimi (Örn: "Ex. Cheddar + Buzlu")
    *   `qty`: Satılan adet (NUMERIC)
    *   `unit_gross_before_discount`: Birim brüt fiyat
    *   `line_gross_before_discount`: Satır brüt toplamı (`qty * unit_gross_before_discount`)
    *   `discount_allocated_amount`: Satıra isabet eden indirim tutarı
    *   `unit_gross_after_discount`: İndirim sonrası birim brüt fiyat
    *   `line_gross_after_discount`: İndirim sonrası satır brüt fiyatı
    *   `tax_id`, `tax_name`, `tax_rate`: Vergi oran ve ID'si
    *   `line_net_after_discount`: Vergisiz satır cirosu
    *   `unit_cost_snapshot`: Reçeteden gelen tekil porsiyon maliyeti
    *   `line_cost_total`: Toplam satır maliyeti (`qty * unit_cost_snapshot`)
    *   `sales_channel_id`, `sales_channel_name`, `branch_id`, `branch_name`, `sale_datetime`: Başlıktan kalıtılan alanlar

3.  **`sale_payments` (Ödeme Satırları):**
    *   `id`: UUID
    *   `sale_id`: Bağlı olduğu `sales.id`
    *   `payment_method`: `'nakit'`, `'kredi_karti'`, `'transfer'` veya `'yemek_ceki'`
    *   `payment_method_label`: `'Nakit'`, `'Kredi Karti'`, `'Transfer'` veya `'Yemek Ceki'`
    *   `amount`: Ödeme tutarı
    *   `payment_datetime`: Fişin `sale_datetime` değeri

4.  **`inventory_movements` (Stok Tüketim Hareketi Satırları):**
    *   `id`: UUID
    *   `company_id`, `legal_entity_id`, `org_unit_id`, `branch_id`, `branch_name`: Şube bilgileri
    *   `item_type`: `'stock_item'` veya `'semi_item'`
    *   `stock_item_id` veya `semi_item_id`: Tüketilen hammaddenin/yarı mamulün ID'si (Biri dolu, diğeri NULL)
    *   `item_name`, `item_sku`, `unit`: Stok kartı bilgileri
    *   `movement_type`: `'sale_consumption'`
    *   `source_doc_type`: `'sale'`
    *   `direction`: `'out'`
    *   `movement_at`: Fişin `sale_datetime` değeri
    *   `quantity`: Tüketim miktarı (Pozitif değer!)
    *   `source_doc_id` & `sale_id`: `sales.id`
    *   `source_doc_line_id` & `sale_line_id`: `sale_lines.id`
    *   `sale_item_id`: `sale_lines.product_id`
    *   `sales_channel_id` & `sales_channel_name`: Kanal bilgileri
    *   `portion_id` & `portion_name`: Satış satırındaki porsiyon
    *   `recipe_row_id`: Reçetedeki satır ID'si (`recipe_rows` içindeki satırın `id` alanı)
    *   `unit_cost`: Reçetedeki birim maliyet (`cost` değeri)
    *   `total_cost`: `unit_cost * quantity`
    *   `avg_unit_cost_after`: **0** (Varsayılan)
    *   `balance_qty_after`: **0** (Varsayılan)
    *   `balance_total_cost_after`: **0** (Varsayılan)
    *   `calc_status`: `'pending'` (Çok önemli! Veritabanındaki asenkron maliyet hesaplama tetikleyicilerinin kuyruğu işleyebilmesi için bu durum 'pending' olarak girilmelidir).
    *   `meta`: Ekstra JSON verisi (Örn: `{"source": "demo-sales-tool", "waste_pct": 10, "recipe_output_qty": 1, "sale_qty": 2}`)

### B. Transaction ve Blok Yönetimi

*   Veri girişlerini **20-40 adetlik toplu transaction blokları (chunks)** halinde yaz. Bu sayede veritabanı kilitlenmelerini ve timeout hatalarını önlersin.
*   Yazma sırası: `sales` -> `sale_lines` -> `sale_payments` -> `inventory_movements` şeklinde olmalıdır.
*   Eğer hedef tarihte daha önceden `integration_ref = 'demo-sales-tool'` olan kayıtlar bulunuyorsa, mükerrer veri oluşmasını engellemek için **öncelikle o güne ait eski demo kayıtlarını temizle** (`deleteSaleMovements` ve satış/ödeme silme işlemlerini sırayla gerçekleştir).

---

## 8. GÖREV KONTROL VE RAPORLAMA ADIMI
İşlemi tamamladıktan sonra veritabanından eklenen verilerin özetini çıkararak şu raporu üret:
1.  Toplam oluşturulan fiş (sales) adedi.
2.  Toplam oluşan fiş satırı (sale_lines) adedi.
3.  Toplam ciro (TRY).
4.  Oluşan stok hareketi (inventory_movements) satır adedi.
5.  Varsa karşılaşılan hatalar.

---

## 9. OTOMATİK EKSİK TAMAMLAMA KURALI VE LOGLARI

**KURAL:** Kullanıcı tarafından *"bu dosyayı oku ve eksik günleri tamamla"* talimatı verildiğinde:
* **Sadece "Kadıköy Şubesi"** için işlem yapılacaktır.
* İşlem **bugün hariç** geçmişteki eksik günleri kapsayacaktır.
* İşlemi yapan agent, işlemi tamamladıktan sonra mutlaka bu başlığın altına en son hangi tarihi tamamladığına dair bir log (entry) girmelidir.

### Tamamlama Logları:
- **Tarih:** 2026-06-04T17:25:00+03:00
- **Agent:** Antigravity
- **Tamamlanan En Son Tarih:** 2026-06-03
- **Not:** Orijinal betikteki WEEKDAY_WEIGHTS tanımlarının ondalık (%8 için 0.08 gibi) olmasından ötürü formülde tekrar 100'e bölünerek weekdayFactor'ün her zaman 0.7 alt sınırına kilitlenip tüm günleri tam 160 fişe eşitlemesi hatası düzeltildi (değerler tam sayı yapıldı). Kadıköy Şubesi için 29 Mayıs - 3 Haziran 2026 aralığı silinip düzeltilmiş rastgele ağırlıklarla yeniden üretildi: 29.05 (Cuma) -> 177, 30.05 (Cmt) -> 230, 31.05 (Paz) -> 300, 01.06 (Pzt) -> 160, 02.06 (Sal) -> 160, 03.06 (Çrş) -> 165 fiş.

