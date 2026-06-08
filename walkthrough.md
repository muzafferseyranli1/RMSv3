# WMS Faz 1: İç Tedarikçi Veri Modeli ve Senkron Doğrulama Özeti

Bu doküman, WMS Faz 1 adımı kapsamında yapılan geliştirmelerin, veritabanı senkronizasyonunun ve stok kartı entegrasyonunun doğrulama sonuçlarını içerir.

## Yapılan Değişiklikler

### 1. Veritabanı Şeması ve Göçler (Migrations)
* `suppliers`, `purchase_orders` ve `order_flows` tablolarına `supplier_kind`, `source_workspace_scope`, `source_branch_id`, `is_system_generated`, `sync_key` ve `flow_channel` alanları ve ilgili kısıtlar (check constraint / unique key) eklenmiştir.
* `wms-migration.sql` ve `schema-railway-master.sql` güncellenmiştir.

### 2. Şirket Ağacı Senkronizasyonu (`Company (1).jsx`)
* Şirket hiyerarşisi kaydedilirken (`saveTree`), ağaçtaki `anadepo` düğümleri recursive olarak taranıp `sync_key = 'anadepo_${id}'` ile `suppliers` tablosuna otomatik olarak iç tedarikçi olarak upsert edilmektedir.
* Şirket ağacından kaldırılan depolar, geçmiş sipariş verilerinin bozulmaması için `active = false` ve `deleted_at = now()` yapılarak pasifleştirilir.

### 3. Tedarikçiler Ekranı UI Guard'ları (`Suppliers.jsx`)
* İç tedarikçiler "İç Depo" ve "Merkez Mutfak" badge'leri ile görselleştirilmiştir.
* Doğrudan silme (`trash`) ve silinenleri geri yükleme işlemleri engellenmiştir.
* Düzenleme modalında isim ve aktiflik alanları salt-okunurdur ve şirket ağacı senkronizasyonuna dair yeşil bilgi notu gösterilir.

### 4. Stok Kartı Ekranı Entegrasyonu (`StockItems.jsx`)
* Tedarikçilerin veritabanından çekildiği SELECT sorgusuna `supplier_kind` kolonu dahil edildi.
* Stok kartı listesinde tedarikçi sütununda iç depolara ait kayıtlar `[İç Depo]` / `[Mutfak]` etiketleriyle render edildi.
* Tedarikçi & Fiyat sekmesindeki (Tab 2) çoklu tedarikçi atama dropdown listesinde, iç depoların `[İç Depo]` ve `[Mutfak]` ibareleriyle ayırt edilebilir olması sağlandı.

---

## Doğrulama Sonuçları

### 1. Veritabanı Senkronizasyon Testi (`verify_sync.js`)
* `scratch/verify_sync.js` test scripti canlı Railway veritabanı üzerinde çalıştırılmıştır.
* Yeni ağaç ekleme, ad güncelleme ve ağaçtan silme (deaktif etme) senkronizasyon durumları test edilmiş ve hepsi başarıyla doğrulanmıştır.
* Güvenlik nedeniyle hardcoded veritabanı parolaları script içerisinden temizlenmiş ve `process.env.DATABASE_URL` üzerinden okuma yapacak şekilde güncellenmiştir.

### 2. Frontend Derleme Testi (`npm run build`)
* Yapılan JSX ve query değişiklikleri sonrasında Vite build (`npm run build`) çalıştırılmış ve projenin 0 hata ile başarıyla derlendiği doğrulanmıştır.
