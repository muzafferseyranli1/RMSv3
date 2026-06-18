# SuitableRMS Sistem Mimarisi ve Dosya Haritası

Bu kılavuz, SuitableRMS projesinin modüllerini, bu modüllere karşılık gelen veritabanı tablolarını, yerel sunucu (localhost) bağlantılarını ve ilgili kaynak kod dosyalarını haritalandırır. Yapay zeka destek asistanlarının sistemde hızlı yön bulması için referans olarak tasarlanmıştır.

---

## 🗺️ Modül Haritası

### 1. Satış ve Menü Yönetimi (Catalog)
Menü yapısı, ürün kartları, reçeteler, yarı mamuller ve fiyatlandırma kuralları bu modülde yönetilir.
* **Veritabanı Tabloları:** 
  * `public.sale_items` (Satış ürünleri, reçeteler ve porsiyonlar)
  * `public.sale_categories` (Satış kategorileri)
  * `public.stock_items` (Hammadde stok kartları)
  * `public.semi_products` (Yarı mamuller)
* **Ekran ve Dosya Haritası:**
  * Ürün Tanımlama: [http://localhost:5173/products](http://localhost:5173/products) | Kod: [SaleItems.jsx](file:///X:/RMSv3/src/components/pages/SaleItems.jsx)
  * Kategori Yönetimi: [http://localhost:5173/sale-categories](http://localhost:5173/sale-categories) | Kod: [SaleCategories.jsx](file:///X:/RMSv3/src/components/pages/SaleCategories.jsx)
  * Hammaddeler: [http://localhost:5173/stock-items](http://localhost:5173/stock-items) | Kod: [StockItems.jsx](file:///X:/RMSv3/src/components/pages/StockItems.jsx)
  * Yarı Mamul Yönetimi: [http://localhost:5173/semi-products](http://localhost:5173/semi-products) | Kod: [SemiProducts.jsx](file:///X:/RMSv3/src/components/pages/SemiProducts.jsx)
  * Fiyat Tanımları: [http://localhost:5173/prices](http://localhost:5173/prices) | Kod: [Prices.jsx](file:///X:/RMSv3/src/components/pages/Prices.jsx)

### 2. POS ve Garson Ekranları (Point of Sale)
Şubelerde aktif kullanılan sipariş alma, masa yönetimi ve ödeme ekranlarıdır.
* **Veritabanı Tabloları:**
  * `public.pos_sales` (Satış başlıkları)
  * `public.sale_lines` (Satış satır detayları)
  * `public.sale_payments` (Tahsilat verileri)
* **Ekran ve Dosya Haritası:**
  * Kasa POS Ekranı: [http://localhost:5173/pos](http://localhost:5173/pos) | Kod: [POS.jsx](file:///X:/RMSv3/src/components/pages/POS.jsx)
  * Garson El Terminali: [http://localhost:5173/garson](http://localhost:5173/garson) | Kod: [Garson.jsx](file:///X:/RMSv3/src/components/pages/Garson.jsx)
  * Masa Yerleşimi: [http://localhost:5173/1/masalar](http://localhost:5173/1/masalar) (Şube bazlı) | Kod: [TableManagement.jsx](file:///X:/RMSv3/src/components/pages/TableManagement.jsx)

### 3. WMS - Depo ve Lojistik Yönetimi (Warehouse Management)
Depo yerleşimleri, stok transferleri, LPN, sayım ve otomatik iş görevleri (putaway, pick, load) motorudur.
* **Veritabanı Tabloları:**
  * `public.warehouse_tasks` (Depo görevleri)
  * `public.warehouse_task_events` (Görev olay günlüğü)
  * `public.warehouse_reservations` (Envanter rezervasyonları)
* **Ekran ve Dosya Haritası:**
  * Web Görev Paneli: [http://localhost:5173/depo-wms-tasks](http://localhost:5173/depo-wms-tasks) | Kod: [WmsTasks.jsx](file:///X:/RMSv3/src/components/pages/WmsTasks.jsx)
  * El Terminali Arayüzü: [http://localhost:5173/wms-mobile](http://localhost:5173/wms-mobile) | Kod: [WmsMobile.jsx](file:///X:/RMSv3/src/components/pages/WmsMobile.jsx)
  * Adres ve Lokasyonlar: [http://localhost:5173/depo-wms-locations](http://localhost:5173/depo-wms-locations) | Kod: [WmsLocations.jsx](file:///X:/RMSv3/src/components/pages/WmsLocations.jsx)
  * LPN Listesi: [http://localhost:5173/depo-wms-lpns](http://localhost:5173/depo-wms-lpns) | Kod: [WmsLpns.jsx](file:///X:/RMSv3/src/components/pages/WmsLpns.jsx)

### 4. Satınalma ve Sipariş Akışları (Procurement)
Şube ve depoların tedarikçi siparişleri, otomatik akış takvimleri ve manuel sipariş talepleridir.
* **Veritabanı Tabloları:**
  * `public.purchase_orders` (Sipariş başlıkları)
  * `public.purchase_order_lines` (Sipariş kalemleri)
  * `public.order_flows` (Otomatik/manuel tedarik zinciri akışları)
* **Ekran ve Dosya Haritası:**
  * Sipariş Takip Paneli: [http://localhost:5173/orders](http://localhost:5173/orders) | Kod: [Orders.jsx](file:///X:/RMSv3/src/components/pages/Orders.jsx)
  * Satınalma Yöneticisi: [http://localhost:5173/depo-satinalma](http://localhost:5173/depo-satinalma) | Kod: [PurchasingManager.jsx](file:///X:/RMSv3/src/components/pages/PurchasingManager.jsx)
  * Mal Kabul Ekranı: [http://localhost:5173/mal-kabul](http://localhost:5173/mal-kabul) | Kod: [MalKabul.jsx](file:///X:/RMSv3/src/components/pages/MalKabul.jsx)

### 5. Sadakat ve Kampanya Yönetimi (Loyalty)
Müşteri puanları, sadakat kartları, indirim kuponları ve kampanya motoru kurallarıdır.
* **Veritabanı Tabloları:**
  * `public.loyalty_cards` (Müşteri sadakat kartları)
  * `public.loyalty_campaigns` (Kampanyalar ve kuralları)
  * `public.loyalty_wallets` (Bakiye ve puan cüzdanları)
* **Ekran ve Dosya Haritası:**
  * Kampanya Yönetimi: [http://localhost:5173/sadakat](http://localhost:5173/sadakat) | Kod: [LoyaltyManagement.jsx](file:///X:/RMSv3/src/components/pages/LoyaltyManagement.jsx)
  * İndirim Kuponları: [http://localhost:5173/sadakat/kupon-serileri](http://localhost:5173/sadakat/kupon-serileri) | Kod: [LoyaltyCouponSets.jsx](file:///X:/RMSv3/src/components/pages/LoyaltyCouponSets.jsx)

---

## 🛠️ Teknik Bağlantılar ve Yardımcı Dosyalar

* **Veritabanı Entegrasyonu:** [db.js](file:///X:/RMSv3/src/lib/db.js) üzerinden tüm veritabanı CRUD işlemleri koordine edilir.
* **Uygulama Yönlendirmeleri:** [App.jsx](file:///X:/RMSv3/src/App.jsx) dosyasında tüm rota tanımları ve yetkilendirmeler bulunur.
* **Oturum ve Çalışma Alanı Korumaları:** [workspace.js](file:///X:/RMSv3/src/lib/workspace.js) hangi rotaların hangi departman PIN oturumlarıyla açılacağını doğrular.

