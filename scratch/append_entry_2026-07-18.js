import fs from 'fs';
import path from 'path';

const filePath = path.resolve('OperationSync.md');
const entry = `

## Entry - 2026-07-18 - Merkez Depo ve Merkez Mutfak Malı Aidiyeti Geliştirmesi

- \`Timestamp\`: \`2026-07-18T10:36:00+03:00\`
- \`Agent\`: Antigravity
- \`Task\`: Malzemelerin Merkez Depo/Mutfak aidiyet seçimlerinin modal arayüzüne eklenmesi ve sipariş motoruna entegrasyonu
- \`Intent\`: Şirket ağacında yer alan Merkez Depo (anadepo) ve Merkez Mutfak (uretim) düğümlerinin malzemelerle (stock_items) aidiyet olarak seçilebilmesini sağlamak ve bu malzemeler için şube bazındaki siparişleri otomatik olarak ilgili iç depoya veya mutfağa yönlendirecek yapıyı kurmak.
- \`Files Changed\`:
  - \`schema-railway-master.sql\` (stock_items tablosuna is_central_warehouse_good, central_warehouses, is_central_kitchen_good, central_kitchens kolonları eklendi)
  - \`src/components/pages/Company (1).jsx\` (uretim düğümlerinin suppliers tablosunda internal_kitchen tedarikçisi olarak otomatik senkronize edilmesi eklendi)
  - \`src/components/pages/StockItems.jsx\` (Form aidiyet kolonları eşleşmesi ve Tab 2 Tedarikçi & Satış sekmesine Merkez Depo/Mutfak Aidiyeti seçim kontrolleri ile suppliers_list çift yönlü senkronizasyonu eklendi)
  - \`src/lib/branchPurchasing.js\` (getInternalWarehouseSupplierIdsForItem fonksiyonuna internal_kitchen desteği eklenerek şube sipariş yönlendirmesinin mutfak için de otomatikleştirilmesi sağlandı)
- \`Files Created\`:
  - \`scratch/apply_central_goods_columns.cjs\` (DB migration scripti)
  - \`scratch/backfill_kitchen_suppliers.cjs\` (Mevcut Merkez Mutfak düğümünün suppliers tablosuna internal_kitchen olarak eklenmesi scripti)
  - \`scratch/verify_stock_item_columns.cjs\` (DB kolon test scripti)
  - \`scratch/inspect_company_tree.js\` (Şirket ağacı analiz scripti)
- \`Commands Run\`:
  - \`node scratch/apply_central_goods_columns.cjs\`
  - \`node scratch/backfill_kitchen_suppliers.cjs\`
  - \`node scratch/verify_stock_item_columns.cjs\`
  - \`npm run build\`
- \`Findings\`:
  - Mevcut sipariş akışında, malzeme kartında internal_warehouse tedarikçisi olması durumunda şube taleplerinin otomatik olarak iç ikmal deposuna yönlendirildiği doğrulandı.
  - Aynı yönlendirmenin mutfak (internal_kitchen) için de geçerli olması amacıyla branchPurchasing.js içerisindeki kontrol genişletildi.
- \`Decisions\`:
  - Merkez depoların ve mutfakların malzemeyle ilişkisi, aidiyet tabından seçildiğinde otomatik olarak suppliers_list listesine eklenip varsayılan yapılmaktadır; böylece sipariş motoruyla tam entegrasyon sağlanmıştır.
- \`Open Risks\`: Yok.
- \`Handoff Contract\`: Tüm değişiklikler canlı veritabanında ve repoda başarıyla uygulanmış, proje hatasız derlenmiştir.
`;

try {
  fs.appendFileSync(filePath, entry, 'utf8');
  console.log('Successfully appended entry to OperationSync.md');
} catch (err) {
  console.error('Failed to append entry:', err);
}
