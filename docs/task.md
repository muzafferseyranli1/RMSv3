- `[x]` 1. SQL Migrasyonu (`migrations/018_inventory_cost_calculation_fix.sql`) oluşturulması
- `[x]` 2. Migrasyonu çalıştırmak için `scripts/run-migration-018.cjs` dosyasının oluşturulması
- `[x]` 3. `node scripts/run-migration-018.cjs` komutunu çalıştırarak canlı veritabanının güncellenmesi
- `[x]` 4. `src/components/pages/MalKabul.jsx` dosyasında frontend maliyet/bakiye hesaplama mantığının negatif stok normalizasyonu ile güncellenmesi
- `[x]` 5. `src/components/pages/InventoryTransfer.jsx` dosyasında frontend maliyet/bakiye hesaplama mantığının negatif stok normalizasyonu ile güncellenmesi
- `[x]` 6. `npm run build` ile projeyi derleyerek testlerin yapılması ve doğrulanması
- `[x]` 7. QueryBuilder'a `or()` desteğinin eklenmesi (`src/lib/db.js`)
- `[x]` 8. Backend `/api/query` filtre derleyicisine `or` case desteğinin eklenmesi (`server/index.js`)
- `[x]` 9. Sipariş sayfasındaki `query.or is not a function` hatasının giderildiğinin doğrulanması ve derleme kontrolü

