const fs = require('fs');
const path = require('path');

const operationSyncPath = path.join(__dirname, '..', 'OperationSync.md');

const operationSyncAppend = `

## Entry 029

- Timestamp: 2026-06-06T18:30:00+03:00
- Agent: Antigravity
- Task: Operasyon El Kitabı (Phase 1: Veritabanı Şeması)
- Intent: El kitabı kategorilerini, sayfalarını ve sayfalardaki ekipmanların etiketlenebilmesini sağlayan veri modelini kurmak, Postgres veritabanına migration uygulamak ve master şemayı güncellemek.
- Files Changed:
  - migrations/027_add_operation_manual_support.sql
  - schema-railway-master.sql
  - task.md
  - walkthrough.md
- Findings:
  - \`migrations/027_add_operation_manual_support.sql\` başarıyla oluşturuldu ve Railway Postgres veritabanına uygulandı.
  - Veritabanında \`equipment_definitions\`, \`manual_categories\`, \`manual_pages\` ve \`manual_page_equipments\` tabloları başarıyla oluşturuldu ve \`equipment_definitions\` (5 satır), \`manual_categories\` (3 satır) örnek verileri seed edildi.
  - \`schema-railway-master.sql\` dosyasına yeni tabloların şemaları eklendi.
  - Proje \`npm run build\` ile hatasız derlendi.
- Next Step: Faz 2 API ve Express endpoint'lerinin (CRUD ve ilişkisel JOIN) \`server/index.js\` içerisine yazılması.
- Handoff Contract: Operasyon El Kitabı modülü için Faz 1 veri tabanı altyapısı ve şema senkronizasyonu tamamlanmıştır. Postgres veritabanındaki tablolar hazırdır. Faz 2 backend implementasyonuna geçilebilir.
`;

try {
  fs.appendFileSync(operationSyncPath, operationSyncAppend, 'utf8');
  console.log('Appended Entry 029 to OperationSync.md successfully.');
} catch (e) {
  console.error('Error appending to OperationSync.md:', e);
}
