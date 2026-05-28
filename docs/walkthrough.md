# Walkthrough — Maliyet Hesaplama Hatası ve Yarış Durumu Düzeltme

Bu dokümanda, envanter hareketlerindeki (Mal Kabul, Transfer ve Zayi çıkışları) ağırlıklı ortalama maliyet (WAC) hesaplama mantığındaki negatif stok anomalilerini gidermek ve Railway üzerinde ek maliyet yaratmayacak şekilde veritabanı düzeyinde optimize etmek amacıyla gerçekleştirilen tüm çalışmalar özetlenmiştir.

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
  - Bu sayede JSONB alan filtreleri (`metadata->>creator_scope.is.null`), tarih karşılaştırmaları (`kds_release_at.lte...`) ve çoklu şube eşleştirmeleri (`branch_id.eq...`) gibi tüm `or` sorguları güvenle desteklendi.

---

## Doğrulama ve Test Sonuçları

1. **Veritabanı Migrasyon Testi**:
   - `node scripts/run-migration-018.cjs` komutu canlı Railway Postgres veritabanında çalıştırıldı ve başarıyla tamamlandı.
2. **Hata Giderme ve Arayüz Doğrulaması**:
   - `QueryBuilder.or()` entegrasyonu sonrası `/orders` sayfasındaki otomatik sipariş tetikleme mekanizmasının veritabanına sorunsuz istek attığı ve hatanın tamamen giderildiği doğrulandı.
3. **Derleme (Build) Testi**:
   - `npm.cmd run build` çalıştırıldı. Tüm frontend kodları sıfır hata ve uyarı ile başarıyla derlendi.
4. **Maliyet ve Trafik Denetimi**:
   - Herhangi bir sürekli çalışan `setInterval` veya periyodik cron betiği eklenmemiştir.
   - Tüm maliyet hesaplama ve kuyruk tetikleme işlemleri sadece veri yazma olaylarına bağlı (event-driven) olarak çalışmaktadır. Bu sayede Railway faturalandırma ve CPU kullanımlarında artış engellenmiştir.

