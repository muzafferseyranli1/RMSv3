# Servis Sırası (Courses) ve Hold & Fire Yönetimi Geliştirme Planı

Bu plan, RMS/POS sistemimize servis sırası yönetimi (Başlangıçlar, Ara Sıcaklar, Ana Yemekler, Tatlılar, İçecekler vb.) ve "Hold & Fire" (Beklet / Marş Et) akışını kazandırmayı amaçlar. DB-First mimarisini koruyarak, KDS ekranının açık masalardaki sipariş durumlarını anlık yansıtmasını sağlar.

---

## Kullanıcı İncelemesi Gereken Konular

> [!IMPORTANT]
> **Aktif Masaların KDS Üzerindeki Görünürlüğü (Kritik Mimari Karar):**
> Mevcut yapıda KDS ekranı sadece ödemesi tamamlanmış (`status = 'completed'`) siparişleri göstermektedir. Servis sırası ve Hold & Fire yönetiminin mutfakta anlamlı olabilmesi için açık masalardaki siparişlerin ödeme alınmadan önce de KDS'e düşmesi gerekir.
> - Bu sorunu çözmek için `sales.status` kolonunun check constraint sınırlarını genişleterek `'active'` durumunu ekleyeceğiz.
> - Garson "Siparişi Onayla" dediğinde açık masa siparişi `sales` tablosuna `status = 'active'` ve `kds_status = 'pending'` ile kaydedilecek/güncellenecektir.
> - Ödeme alındığında ise bu kayıt `status = 'completed'` olarak güncellenecektir.
> - Ciro/Finans raporları (`Reports.jsx`) halihazırda sadece `status = 'completed'` olan kayıtları filtrelediği için açık masalar raporlara yanlışlıkla dahil edilmeyecektir.

> [!NOTE]
> **Hazırlanma Süreleri (PrepTime):**
> Veritabanı şemamızda (`sale_items` ve `sale_lines`) `prep_time_minutes` alanları halihazırda mevcuttur. Bu plan kapsamında bu alanlar hem ürün yönetim paneline (`SaleItems.jsx`) eklenecek hem de KDS üzerinde gecikme sayaçlarında kullanılacaktır.

---

## Açık Sorular

* **Counter/Zamanlayıcı (Auto-Fire):** Belirli bir servis (örn. Başlangıç) mutfakta hazırlandıktan kaç dakika sonra sonraki "HOLD" durumundaki servis (örn. Ana Yemek) otomatik olarak "FIRE" (Marş) durumuna geçmeli? Yoksa bu işlem tamamen garson kontrolünde manuel mi kalmalı? *(Varsayılan olarak 15 dakika auto-fire süresi tanımlanıp ayarlanabilir yapılacaktır.)*

---

## Önerilen Değişiklikler

### [Veritabanı Katmanı]

#### [MODIFY] [schema-railway-master.sql](file:///x:/RMSv3/schema-railway-master.sql)
- `sales` tablosundaki `sales_status_check` kısıtlamasını (constraint) güncelleyerek `'active'` durumunu desteklemesini sağlayacağız:
  ```sql
  ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
  ALTER TABLE public.sales ADD CONSTRAINT sales_status_check CHECK (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'refunded'::text, 'partially_refunded'::text, 'active'::text]));
  ```
- `sale_items` tablosuna varsayılan servis sırasını belirten yeni kolon eklenmesi:
  ```sql
  ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS default_course TEXT DEFAULT 'main_dish';
  ```
- `sale_lines` tablosuna servis sırası, Hold/Fire durumu ve ateşleme zamanını belirten yeni kolonların eklenmesi:
  ```sql
  ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'main_dish';
  ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS course_status TEXT DEFAULT 'fire';
  ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ DEFAULT now();
  ```

---

### [Ürün Yönetimi Katmanı]

#### [MODIFY] [SaleItems.jsx](file:///x:/RMSv3/src/components/pages/SaleItems.jsx)
- **Tab 4 (Ayarlar)** içerisine her ürün için aşağıdaki alanları düzenleme arayüzü eklenecektir:
  - **Varsayılan Servis Sırası (default_course):** Açılır menü (Başlangıç, Çorba, Ara Sıcak, Ana Yemek, Tatlı, İçecek).
  - **Hazırlanma Süresi (prep_time_minutes):** Sayısal girdi alanı (Dakika bazında).

---

### [Garson / POS Sipariş Katmanı]

#### [MODIFY] [Garson.jsx](file:///x:/RMSv3/src/components/pages/Garson.jsx) & [POS.jsx](file:///x:/RMSv3/src/components/pages/POS.jsx)
- Sepete eklenen her ürüne varsayılan olarak `default_course` değeri atanacak ve `course_status = 'fire'` olacaktır.
- Garson sipariş sepetinde ürünler servis sırası (Course) başlıklarına göre otomatik gruplanacaktır.
- Her ürün satırına servis sırasını değiştirmek için hızlı dropdown ve `HOLD / FIRE` durumları arasında geçiş yapmak için ikonik butonlar eklenecektir.
- Grup başlıklarına toplu eylem butonları eklenecektir: `"Tümünü Marş Et (Fire)"`, `"Tümünü Beklet (Hold)"`.
- **"Siparişi Onayla" (Confirm Order) Akışı:**
  - İlgili masanın mevcut bir `'active'` satışı olup olmadığı sorgulanacaktır.
  - Varsa, o satışa ait eski `sale_lines` silinecek ve sepetin güncel hali yeni `sale_lines` (durumlarıyla birlikte) olarak kaydedilecektir.
  - Yoksa, yeni bir `sales` kaydı oluşturulup `status = 'active'` ve `kds_status = 'pending'` ile kaydedilecektir.
  - Sipariş onaylandıktan sonra KDS anlık tetiklenecektir.

---

### [Mutfak Ekranı (KDS) Katmanı]

#### [MODIFY] [KDS.jsx](file:///x:/RMSv3/src/components/pages/KDS.jsx)
- **Veri Sorgulama:** KDS sipariş çekme sorgusu hem `'completed'` hem de `'active'` durumundaki siparişleri kapsayacak şekilde güncellenecektir:
  ```javascript
  .in('status', ['completed', 'active'])
  ```
- **Hold & Fire Görsel Ayrımı:**
  - `course_status === 'hold'` olan ürünler KDS kartlarında yarı saydam, soluk ve pasif görünerek mutfağın hazırlamaya başlamaması gerektiği belirtilecektir.
  - `course_status === 'fire'` olanlar ise normal görünümde ve aktif hazırlık süresi sayacı ile gösterilecektir.
- **Auto-Fire Mekanizması:**
  - KDS'te bir önceki servis sırasındaki tüm ürünler tamamlandığında (veya belirli bir süre geçtiğinde), sonraki "HOLD" durumundaki ürünler otomatik olarak veritabanında "FIRE" durumuna çekilecektir.

---

### [Offline-First ve Senkronizasyon Güvenliği]

#### [MODIFY] [posTablePersistence.js](file:///x:/RMSv3/src/lib/posTablePersistence.js)
- İnternet bağlantısının kopması durumunda, açık masa siparişlerine ait tüm detaylar (servis sıraları ve Hold/Fire durumları) `localStorage` üzerinde saklanacaktır.
- Cihaz tekrar çevrimiçi olduğunda, arka planda bir senkronizasyon kuyruğu çalıştırılarak yerel değişiklikler PostgreSQL DB'deki `sales` ve `sale_lines` tabloları ile eşitlenecektir.

---

## Doğrulama Planı

### Otomatik Testler
- Arayüz bileşenlerinin hatasız derlenmesi:
  `npm run build`

### Manuel Doğrulama
1. **Ürün Tanımlama:** `SaleItems.jsx` üzerinden bir ürüne "Ana Yemek" sırası ve "15 dk" hazırlanma süresi atanıp kaydedildiği doğrulanacaktır.
2. **Garson Sepet Görünümü:** Sepete eklenen ürünlerin "Başlangıçlar", "Ana Yemekler" şeklinde gruplandığı, bir ürünün sırasının elle değiştirilebildiği ve "HOLD" durumuna alınabildiği gözlemlenecektir.
3. **Mutfak Entegrasyonu (Hold/Fire):** Garson siparişi onayladığında masanın ödeme alınmadan KDS'e düştüğü, "HOLD" olan ürünlerin soluk, "FIRE" olanların aktif göründüğü doğrulanacaktır.
4. **Marş Tetikleme:** Garson terminalinden "Marş Et" butonuna tıklandığında KDS'teki ürünün anında renkli/aktif hale geldiği doğrulanacaktır.
5. **Offline Test:** Ağ kablosu/bağlantı kesildiğinde terminalde sipariş alınabildiği, bağlantı geri geldiğinde KDS ekranının güncellendiği doğrulanacaktır.
