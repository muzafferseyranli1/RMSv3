const fs = require('fs');
const path = require('path');

const loyaltyMemoryPath = path.join(__dirname, '..', 'LOYALTYMEMORY.md');
const operationSyncPath = path.join(__dirname, '..', 'OperationSync.md');

const loyaltyMemoryAppend = `

## Entry 050

- \`Timestamp\`: \`2026-05-24T04:15:00+03:00\`
- \`Agent\`: \`Antigravity\`
- \`Focus\`: \`Alt Menü Butonlarının Kompakt Hale Getirilmesi ve Türkçe Karakter Düzeltmeleri\`
- \`Trigger\`: \`Kullanıcının, sabit alt menü butonlarının dikeyde çok uzun (yüksek) durduğunu belirtmesi ve bu butonların daha kompakt tasarlanmasını istemesi.\`
- \`Files Changed\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
- \`Current Capability\`:
  - \`TAB_ITEMS\` dizisindeki etiketlerin Türkçe karakter yazımları düzeltildi (\`Kartim\` -> \`Kartım\`, \`Hesabim\` -> \`Hesabım\`) ve \`Kuponlarim\` etiketi "Kuponlar" olarak kısaltılarak taşma/satır kesilmesi engellendi.
  - Alt bar buton sarmalayıcısı (\`div\`) padding'i \`10px 10px 12px\`'den \`6px 6px 8px\`'e, gap değeri \`6\`'dan \`4\`'e düşürüldü.
  - Butonların (\`button\`) stili \`display: grid\` yerine \`display: flex\` and dikey yönelimli (\`flexDirection: column\`) hale getirilerek dikeyde esneme/uzama yapması engellendi.
  - Buton padding'i \`8px 4px\`'ten \`6px 2px\`'ye indirildi, border-radius \`12\` yapıldı.
  - İkon boyutu \`1.05rem\` olarak netleştirildi, yazı boyutu \`.62rem\` yapılıp \`whiteSpace: 'nowrap'\` ile tek satıra zorlandı.
  - Aktif tab arka plan gradyanı daha hafif ve zarif bir görünüme kavuşturuldu (\`rgba(251,113,133,.12)\` ve \`rgba(249,115,22,.1)\`).
- \`Next Loyalty Step\`:
  - Mobil simülatörde veya \`/musteri-app\` sayfasında alt menünün kısalmış, daha kompakt ve premium halini görsel olarak doğrula.
`;

const operationSyncAppend = `

## Entry 111

- \`Timestamp\`: \`2026-05-24T04:15:00+03:00\`
- \`Agent\`: \`Antigravity\`
- \`Task\`: \`Alt Menü Butonlarının Kompakt Hale Getirilmesi ve Türkçe Karakter Düzeltmeleri\`
- \`Intent\`: \`Sabit alt menü butonlarının dikey yüksekliğini azaltmak, Türkçe karakter sorunlarını çözmek ve kelimelerin taşarak buton yüksekliğini artırmasını engellemek.\`
- \`Files Read\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
- \`Files Changed\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\` - \`TAB_ITEMS\` etiketleri güncellendi, buton stilleri grid yerine flex'e geçirildi, paddings ve font size'lar daha küçük, sıkı değerlere çekildi.
- \`Commands Run\`:
  - \`npm run build\` (başarıyla tamamlandı, 16.45s)
- \`Findings\`:
  - \`display: grid\` modunda butonlar üst/alt limitleri belirlenmediğinde dikeyde uzuyordu. \`display: flex\` ve \`white-space: nowrap\` kombinasyonu ile buton boyutları kontrol altına alındı.
- \`Decisions\`:
  - Buton yazılarını \`white-space: nowrap\` ile sınırlayarak kelimelerin (örneğin "Kampanyalar") alt satıra geçip buton yüksekliğini ikiye katlamasını önlemek.
- \`Open Risks\`:
  - Yok.
- \`Next Step\`:
  - Müşteri mobil uygulamasının alt menü butonlarının yeni kompakt görünümünü canlıda veya simülatörde test etmek.
- \`Handoff Contract\`: \`Alt menü butonları artık daha kısa, kompakt ve Türkçe karakterleri düzgün. Proje başarıyla build edildi.\`
`;

try {
  fs.appendFileSync(loyaltyMemoryPath, loyaltyMemoryAppend, 'utf8');
  console.log('Appended to LOYALTYMEMORY.md successfully.');
} catch (e) {
  console.error('Error appending to LOYALTYMEMORY.md:', e);
}

try {
  fs.appendFileSync(operationSyncPath, operationSyncAppend, 'utf8');
  console.log('Appended to OperationSync.md successfully.');
} catch (e) {
  console.error('Error appending to OperationSync.md:', e);
}
