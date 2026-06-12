# Tedarikçi Değişikliği ve Sipariş Akışı Güncelleme Kılavuzu

Sistemde tanımlı bir stok kaleminin (örneğin: **Ekmek**) tedarikçisini değiştirmek ve sipariş süreçlerini yeni tedarikçiye kaydırmak için izlenmesi gereken adımlar aşağıda belirtilmiştir.

---

## 🛠️ Adım Adım Tedarikçi Değiştirme Süreci

### Adım 1: Yeni Tedarikçinin Tanımlanması (Eğer Kayıtlı Değilse)
Yeni tedarikçi firmayı sisteme ticari bilgileriyle (cari kodu, fatura tipi, iletişim mailleri vb.) birlikte ekleyin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/suppliers](http://localhost:5173/suppliers)
* **Kaynak Kod Dosyası:** [Suppliers.jsx](file:///c:/RMSv3/src/components/pages/Suppliers.jsx)
* **Veritabanı Karşılığı:** `public.suppliers` tablosu.

### Adım 2: Stok Kartındaki Tedarikçi Bilgilerinin Güncellenmesi
Ekmek (veya değiştirilecek diğer hammadde) stok kartına giderek varsayılan tedarikçiyi yeni eklediğiniz firma ile değiştirin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/stock-items](http://localhost:5173/stock-items)
* **Kaynak Kod Dosyası:** [StockItems.jsx](file:///c:/RMSv3/src/components/pages/StockItems.jsx)
* **Veritabanı Karşılığı:** `public.stock_items` tablosundaki `supp_id` (ana tedarikçi) kolonu ve `suppliers_list` jsonb listesi güncellenir.

### Adım 3: Eski Sözleşmenin Sonlandırılması
Eski tedarikçi ile ekmek kalemi için tanımlanmış olan aktif sözleşmenin geçerliliğini bitirin veya pasif konuma getirin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/contracts](http://localhost:5173/contracts)
* **Kaynak Kod Dosyası:** [Contracts.jsx](file:///c:/RMSv3/src/components/pages/Contracts.jsx)
* **Veritabanı Karşılığı:** `public.contracts` tablosunda eski tedarikçiye ait sözleşme kaydı.

### Adım 4: Yeni Tedarikçi Sözleşmesinin Tanımlanması
Yeni tedarikçi ile yapılan satın alma anlaşmasını (fiyatlar, toleranslar, minimum/maksimum sipariş kotaları) içeren yeni bir sözleşme oluşturun ve ekmek ürününü buradaki fiyat listesine ekleyin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/contracts](http://localhost:5173/contracts)
* **Kaynak Kod Dosyası:** [Contracts.jsx](file:///c:/RMSv3/src/components/pages/Contracts.jsx)
* **Veritabanı Karşılığı:** `public.contracts` tablosuna yeni bir satır eklenir (`rows` kolonu içinde ürün fiyat bilgileri tutulur).

### Adım 5: Sipariş Akışlarının (Order Flows) Güncellenmesi
Şubelerin veya depoların otomatik veya manuel sipariş oluşturmasını sağlayan sipariş akışlarında ekmek tedarik zincirini yeni tedarikçiye yönlendirin.
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/order-flows](http://localhost:5173/order-flows)
* **Kaynak Kod Dosyası:** [OrderFlows.jsx](file:///c:/RMSv3/src/components/pages/OrderFlows.jsx)
* **Veritabanı Karşılığı:** `public.order_flows` tablosundaki `supplier_id` kolonu yeni tedarikçinin UUID'si ile güncellenir.

---

## 🔍 Dikkat Edilmesi Gereken Hususlar

> [!WARNING]
> * **Açık Siparişler:** Tedarikçi değişikliği yapılmadan önce eski tedarikçiye gönderilmiş ve henüz mal kabulü yapılmamış (`pending_delivery`) siparişleri tamamlayın veya iptal edin.
> * **Sipariş Günleri:** Yeni tedarikçinin teslimat/sipariş takvimi farklıysa, [http://localhost:5173/order-flows](http://localhost:5173/order-flows) ekranından `order_days` ve `lead_days` (tedarik süresi) ayarlarını mutlaka yeni anlaşmaya göre düzenleyin.
