const fs = require('fs');
const path = require('path');

const operationSyncPath = path.join(__dirname, '..', 'OperationSync.md');

const operationSyncAppend = `

## Entry 031

- Timestamp: 2026-06-06T18:46:00+03:00
- Agent: Antigravity
- Task: Operasyon El Kitabı (Phase 3: Kullanıcı Arayüzü)
- Intent: Merkez yöneticileri için kategori/sayfa düzenleyici paneli, şube personeli için accordion ağaç yapılı okuyucu arayüzü, zengin metin renderı, kullanılan ekipman widget'ı ve arıza bildirim modalını içeren komple UI entegrasyonunun tamamlanması.
- Files Changed:
  - src/components/layout/Sidebar.jsx
  - src/App.jsx
  - src/components/pages/ManualManagement.jsx
  - src/components/pages/ManualReader.jsx
  - task.md
  - walkthrough.md
- Findings:
  - \`Sidebar.jsx\` dosyasına "El Kitabı Yönetimi" (Merkez) ve "Operasyon El Kitabı" (Şube) linkleri başarıyla eklendi.
  - \`App.jsx\` üzerinde rotalar lazy-loaded olarak \`/manual-yonetimi\` ve \`/manual\` yollarına bağlandı.
  - \`ManualManagement.jsx\` ile tam özellikli HQ kategori ve sayfa yönetici panel arayüzü yazıldı. Editörde Markdown içerik girdisi, çoklu ekipman tanımları ilişkisi seçimi ve PIN doğrulama sistemi tamamlandı.
  - \`ManualReader.jsx\` ile hiyerarşik akordeon menüsü, regex tabanlı hafif Markdown-to-HTML parserı, sayfada kullanılan ekipmanları gösteren widget kartları tasarlandı.
  - Ekipmana tıklandığında açılan arıza bildirim modalı, şubenin aktif \`branchId\` değerini kullanarak fiziksel cihazları (\`equipments\` tablosu) listeler ve \`maintenance_tickets\` tablosuna direkt insert işlemini gerçekleştirir.
  - Proje \`npm run build\` ile hatasız şekilde derlendi.
- Next Step: Kılavuz sayfalarının şube kullanıcıları tarafından test edilmesi ve veritabanı arıza biletlerinin form entegrasyonuyla olan bağlantısının canlıda izlenmesi.
- Handoff Contract: Operasyon El Kitabı modülünün Faz 1 (Veritabanı), Faz 2 (Backend REST APIs) ve Faz 3 (HQ Yönetimi ve Şube Okuyucu Arayüzleri) entegrasyonu tamamen tamamlanmış, test edilmiş ve hatasız derlenmiştir. Modül kullanıma hazırdır.
`;

try {
  fs.appendFileSync(operationSyncPath, operationSyncAppend, 'utf8');
  console.log('Appended Entry 031 to OperationSync.md successfully.');
} catch (e) {
  console.error('Error appending to OperationSync.md:', e);
}
