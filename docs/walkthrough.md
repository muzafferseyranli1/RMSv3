# Walkthrough — Maliyet Hesaplama, Filtreleme ve Mükerrer Sipariş Düzeltmeleri

Bu dokümanda, envanter hareketlerindeki (Mal Kabul, Transfer ve Zayi çıkışları) ağırlıklı ortalama maliyet (WAC) hesaplama mantığındaki negatif stok anomalilerini gidermek, `/orders` sayfasındaki otomatik sipariş filtreleme hatalarını gidermek ve zaman dilimi (timezone) kaymasından ötürü oluşan mükerrer otomatik sipariş döngüsünü çözmek amacıyla gerçekleştirilen tüm çalışmalar özetlenmiştir.

## Yapılan Değişiklikler

### 1. Veritabanı ve Şema Güncellemeleri (Database Migration)
- **SQL Dosyası**: [018_inventory_cost_calculation_fix.sql](file:///c:/RMSv3/migrations/018_inventory_cost_calculation_fix.sql)
  - `inventory_balances` tablosu oluşturuldu. Bu tablo her şube ve ürün için en güncel miktarları, toplam maliyetleri ve ağırlıklı ortalama birim maliyetlerini tutmaktadır.
  - Mevcut `inventory_movements` verileri taranarak `inventory_balances` tablosuna başlangıç değerleri başarıyla tohumlandı (bootstrap).
  - `recalculate_inventory_item_costs` saklı yordamı (stored procedure) güncellendi:
    - Negatif stoktan pozitif stoğa geçişlerde veya negatif stok durumunda kalmaya devam eden durumlarda maliyetin hatalı sapması engellendi. Negatif stok sonrası ilk girişte average cost gelen yeni birim fiyata eşitlenerek WAC matematiksel olarak normalize edildi.
    - Stok çıkışlarında (`direction = 'out'`) ortalama maliyetin değişmemesi, sadece bakiye maliyetin tüketilmesi kuralı korundu.
  - Değişiklikler sonrası `inventory_balances` tablosunun otomatik güncellenmesi sağlandı.

- **Migrasyon Çalıştırıcı**: [run-migration-018.cjs](file:///c:/RMSv3/scripts/run-migration-018.cjs)
  - Canlı Railway Postgres veritabanına bağlanıp migrasyonu güvenle uygulayan betik oluşturuldu.
  - `node scripts/run-migration-018.cjs` komutuyla canlı veritabanına uygulandı.

---

### 2. Arayüz Bileşenleri (Frontend Updates)
- **Mal Kabul**: [MalKabul.jsx](file:///c:/RMSv3/src/components/pages/MalKabul.jsx)
  - `persistReceipt` fonksiyonunda envanter hareketi kayıtları oluşturulurken, negatif stok olasılığı kontrol edilerek düzeltilmiş ortalama maliyet formülü frontend tarafında da entegre edildi. Bu sayede veritabanı asenkron kuyruğunun çalışması beklenmeden kullanıcının anlık doğru maliyetleri görmesi sağlandı.
- **Envanter Transferi**: [InventoryTransfer.jsx](file:///c:/RMSv3/src/components/pages/InventoryTransfer.jsx)
  - `createMovementPayload` fonksiyonundaki transfer kabulü (`direction = 'in'`) maliyet hesaplaması negatif stok normalizasyonu formülüne uyarlandı.

### 3. Otomatik Sipariş Arama/Filtreleme Düzeltmesi (QueryBuilder .or() Entegrasyonu)
- **Hata**: `/orders` sayfasında otomatik sipariş oluşturulurken `query.or is not a function` hatası alınıyordu.
- **Sebep**: Supabase benzeri istemci yerine kullanılan yerel generic `QueryBuilder` yapısında `.or(...)` metodunun bulunmaması, ancak şube bazlı filtreleme mantığının (`applyBranchFilter`) bu metodu çağırması.
- **Düzeltme**:
  - `src/lib/db.js` içerisindeki `QueryBuilder` sınıfına zincirlenebilir `.or(val)` metodu eklendi.
  - `server/index.js` içerisindeki backend filtre derleme mantığına (`buildConditions`) gelen Postgrest-uyumlu `or` filtresini çözüp PostgreSQL `OR` ifadesine dönüştüren parser entegre edildi.

---

### 4. Zaman Dilimi (Timezone) Eşleştirme ve Mükerrer Sipariş Çözümü
- **Hata**: Aynı gün/dakika içinde aynı akış için çoklu mükerrer (duplicate) siparişler (örneğin 40 adet) otomatik olarak oluşturuluyordu.
- **Sebep**: Postgres `DATE` tipi alanlar Express backend API tarafından istemciye UTC JSON stringi olarak (`2026-05-27T21:00:00.000Z`) gönderiliyordu. Frontend tarafında sadece ilk 10 hane kesilerek (`2026-05-27`) işlem yapıldığı için, bu sipariş yerel saat dilimindeki bugünün tarihi (`2026-05-28`) ile uyuşmuyor, siparişin henüz oluşturulmadığı zannedilerek sürekli yeni kayıt ekleniyordu.
- **Düzeltme**:
  - `src/components/pages/Orders.jsx` içerisindeki `collectMissingDueFlows` fonksiyonunda sipariş tarih kontrolleri `toDateOnly(order.order_date) === toDateOnly(targetDate)` olarak güncellendi.
  - `Orders.jsx` altındaki `toDateOnly` ve `src/lib/branchPurchasing.js` altındaki `dateOnly` fonksiyonları güncellenerek ISO formatlı dizelerin yerel saat diliminin gün, ay ve yıl bilgilerine göre çözümlenmesi (`Date.getFullYear()`, `Date.getMonth()`, `Date.getDate()`) sağlandı.
  - `scratch/cleanup_duplicates.cjs` script'i ile veritabanındaki mükerrer siparişler ve bunlara bağlı sipariş satırları başarıyla temizlendi, sadece 1 adet orijinal sipariş bırakıldı.

---

## Doğrulama ve Test Sonuçları

1. **Veritabanı Migrasyon ve Temizlik Testi**:
   - `node scratch/cleanup_duplicates.cjs` komutu başarıyla çalıştırılarak mükerrer siparişler silindi. Veritabanında tek sipariş kaldığı doğrulandı.
2. **Derleme (Build) Testi**:
   - `npm.cmd run build` çalıştırıldı. Tüm frontend kodları sorunsuz ve sıfır hata ile derlendi.
3. **Canlı Ortam Doğrulaması**:
   - Yapılan düzeltmeler GitHub main branch'ine push edilerek Railway üzerinde otomatik deploy edildi. Deploy sonrası mükerrer otomatik sipariş üretiminin tamamen durduğu doğrulandı.
