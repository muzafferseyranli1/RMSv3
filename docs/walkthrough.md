# Walkthrough: WMS-04A Kalite Hold Şeması

Bu belgede WMS Faz 4 kapsamında gerçekleştirilen kalite hold şeması ve ilgili veritabanı mekanizmaları anlatılmaktadır.

## Yapılan Değişiklikler

### 1. Veritabanı Değişiklikleri ve Migration
Sıradaki boş migration numarasıyla [047_add_warehouse_quality_holds.sql](file:///c:/RMSv3/migrations/047_add_warehouse_quality_holds.sql) dosyası oluşturuldu ve veritabanına uygulandı:
- **`warehouse_quality_holds` Tablosu**: Karantina (hold), kabul (released), ret (rejected) ve fire/hurda (scrapped) süreçlerini izlemek üzere oluşturuldu.
- **Otomatik Karantina Trigger'ı (`trg_create_quality_hold_on_quarantine_movement`)**: `inventory_movements` tablosuna `availability_status = 'quarantine'` olan bir giriş hareketi eklendiğinde tetiklenir. Android task event metasındaki ve exception'daki kanıt resimlerini (`evidence_photo_url`) otomatik yakalayarak kalite hold kaydına bağlar.
- **Kalite Çözümleme Fonksiyonu (`resolve_warehouse_quality_hold`)**: Kalite kontrol memurunun hold statüsünü `release`, `reject` veya `scrap` yapabilmesi için atomik RPC tanımlandı. Bu RPC, stoku karantinadan düşüren transfer hareketlerini otomatik olarak oluşturarak audit izi bırakır.

### 2. Migration Entegrasyonu
- [server/wms_migration.js](file:///c:/RMSv3/server/wms_migration.js) dosyasına yeni migration adımı eklendi.
- [schema-railway-master.sql](file:///c:/RMSv3/schema-railway-master.sql) dosyası Railway ana veritabanı şemasıyla uyumlu olacak şekilde güncellendi.

## Doğrulama ve Test Sonuçları

Otomatik regression testi için [scratch/test_wms_quality_hold_regression.cjs](file:///c:/RMSv3/scratch/test_wms_quality_hold_regression.cjs) yazıldı ve Railway Postgres üzerinde çalıştırıldı.

### Test Çıktısı:
```text
Connected to DB successfully.
Started transaction (BEGIN).
Inserting quarantine movement...
SUCCESS: Quality hold record automatically created by trigger.
Hold details: {
  id: '7138de45-b1f5-403f-a39d-e6ed06077da6',
  status: 'hold',
  qty: '100.0000',
  lot: 'LOT-QUALITY-TEST-1'
}
Pickable qty for test lot: 0 (Expected: 0)
SUCCESS: Quarantine stock is NOT pickable.
Resolving quality hold (Release)...
Resolve RPC result: {
  status: 'released',
  hold_id: '7138de45-b1f5-403f-a39d-e6ed06077da6',
  success: true,
  in_movement_id: '1cb74004-93e6-406c-9eea-15685eead14e',
  out_movement_id: 'c97b083f-f854-48f0-8a8a-2dc8a7511b38'
}
SUCCESS: Quality hold successfully released.
Updated Hold Status: released (Expected: released)
Pickable qty after release: 100.000000 (Expected: 100.0)
SUCCESS: Released stock is now pickable!
Rollbacking transactions...
Rollback successful. Database clean.
```

Tüm test adımları başarıyla tamamlanmış ve kalite hold sistemi devreye alınmıştır.
