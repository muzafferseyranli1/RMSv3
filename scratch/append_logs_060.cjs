const fs = require('fs');
const path = require('path');

const loyaltyMemoryPath = path.join(__dirname, '..', 'LOYALTYMEMORY.md');
const operationSyncPath = path.join(__dirname, '..', 'OperationSync.md');

const loyaltyMemoryAppend = `

## Entry 060

- \`Timestamp\`: \`2026-05-25T00:36:00+03:00\`
- \`Agent\`: \`Antigravity\`
- \`Focus\`: \`CouponCard Bilet Tasarımının Referans Görsele Birebir Uyumlu Yeniden Yazılması\`
- \`Trigger\`: \`Kullanıcının gönderdiği referans kupon görseline birebir uyum sağlamak. Görselde: büyük tırtıklı (scallop) kenarlar, beyaz sol koçan üzerinde döndürülmüş büyük outline fayda metni (30%, 50TL, HEDİYE), düz renkli sağ gövde üzerinde büyük Impact fontlu "KUPON" başlığı, altında geçerlilik tarihi ve küçük kampanya adı. Kuponlar arası makas kesik çizgisi.\`
- \`Files Read\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
  - \`src/components/loyalty/LoyaltyCampaignWizard.jsx\` (IMAGE_SLOTS tanımı)
- \`Files Changed\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
  - \`LOYALTYMEMORY.md\`
  - \`OperationSync.md\`
- \`Current Capability\`:
  - CouponCard bileşeni referans görseldeki klasik bilet tasarımına tam uyumlu şekilde yeniden yazıldı.
  - Sol koçan (105px genişlik, beyaz): döndürülmüş (-90deg) büyük outline fayda metni (WebkitTextStroke ile gövde renginde).
  - Sağ gövde (solid renk): büyük Impact fontlu "KUPON" başlığı (2.6rem), altında geçerlilik tarihi ve küçük kampanya adı.
  - 6 renk döngüsü: kırmızı, sarı, teal, mor, yeşil, turuncu.
  - Büyük tırtıklı kenarlar (scallop, 6px radius radial-gradient).
  - Dikey kesikli ayırıcı çizgi (dashed border).
  - Kupon kodu sağ üst rozette görünür.
  - Kampanya wizard'daki mobileCouponImage slot'undaki görsel varsa, sağ gövde arka planında renk overlay ile kullanılır.
  - Kuponlar arası makas (✂) ikonlu kesik çizgi ayırıcı.
  - Fayda metni: yüzde (30%), tutar (50TL), hediye (HEDİYE) — 3 seçenek desteklenir.
- \`Gap\`:
  - Yok.
- \`Approved Phase\`: \`CouponCard reference-image-exact ticket redesign\`
- \`Affected Surfaces\`:
  - \`Müşteri Mobil Uygulaması Kuponlar Sekmesi\`
- \`Readiness\`:
  - \`CouponCard visual design\`: \`Ready\`
  - \`CouponsScreen layout\`: \`Ready\`
  - \`Campaign image integration\`: \`Ready\`
- \`Decision\`:
  - CouponCard tamamen yeniden yazıldı: büyük "KUPON" başlığı ana öğe, kampanya adı küçük alt satır, fayda metni sol koçanda büyük ve okunaklı.
  - mobileCouponImage slot'undan görsel varsa linear-gradient overlay ile arka planda gösterilir.
  - Kuponlar arası makas simgeli (fa-scissors) kesik çizgi (dashed line) eklendi.
- \`Risks\`:
  - Yok.
- \`Next Loyalty Step\`:
  - Mobil uygulamada kuponlar sekmesini açarak yeni bilet tasarımının referans görsele tam uyumlu olduğunu doğrulamak.
`;

const operationSyncAppend = `

## Entry 128 - 2026-05-25
- \`Timestamp\`: \`2026-05-25T00:36:00+03:00\`
- \`Agent\`: \`Antigravity\`
- \`Task\`: \`CouponCard Bilet Tasarımının Referans Görsele Birebir Uyumlu Yeniden Yazılması\`
- \`Intent\`: \`Kullanıcının gönderdiği referans kupon görselindeki klasik bilet tasarımını (beyaz koçan + renkli gövde + büyük tırtıklı kenarlar + makas ayırıcı) birebir uygulamak ve kampanya wizard'daki mobileCouponImage slot'undan görsel desteği eklemek.\`
- \`Files Read\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
  - \`src/components/loyalty/LoyaltyCampaignWizard.jsx\` (IMAGE_SLOTS ve uploadSlotImage yapısı)
- \`Files Changed\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\` — CouponCard bileşeni tamamen yeniden yazıldı:
    - Sol koçan (105px, beyaz): döndürülmüş büyük outline fayda metni (30%, 50TL, HEDİYE).
    - Sağ gövde (solid renk, 6 renk döngüsü): büyük "KUPON" başlığı (Impact, 2.6rem), geçerlilik tarihi, küçük kampanya adı.
    - Büyük scallop kenarlar (6px radius radial-gradient).
    - mobileCouponImage slot'undan görsel desteği (linear-gradient overlay).
    - Kupon kodu sağ üst rozet.
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\` — CouponsScreen listesine kuponlar arası makas (fa-scissors) + dashed çizgi ayırıcı eklendi.
- \`Commands Run\`:
  - \`npm run build:web\` (başarıyla tamamlandı, 6.45s, 0 hata)
- \`Findings\`:
  - IMAGE_SLOTS tanımında \`mobileCouponImage\` anahtarı ile 600x300px kupon görseli yükleme desteği mevcut. Görseller \`campaign.metadata.mobileCouponImage.url\` altında saklanıyor.
- \`Decisions\`:
  - CouponCard ana başlığı olarak sabit "KUPON" metni kullanıldı (referans görseldeki "COUPON" karşılığı). Kampanya adı küçük alt satır olarak gösterildi.
  - Fayda metni formatı: yüzde → \`30%\`, tutar → \`50TL\`, hediye → \`HEDİYE\`.
  - Kampanya görseli varsa arka plan olarak renk overlay ile birlikte gösterilir, yoksa düz solid renk kullanılır.
- \`Open Risks\`:
  - Yok.
- \`Next Step\`:
  - Mobil uygulamayı açıp kuponlar sekmesinde yeni bilet tasarımının referans görsele birebir uyduğunu teyit etmek.
- \`Handoff Contract\`: \`CouponCard referans görseldeki bilet tasarımına birebir uyumlu olarak yeniden yazıldı. mobileCouponImage slot desteği eklendi. Kuponlar arası makas ayırıcı eklendi. Build başarılı.\`
`;

try {
  fs.appendFileSync(loyaltyMemoryPath, loyaltyMemoryAppend, 'utf8');
  console.log('Appended Entry 060 to LOYALTYMEMORY.md successfully.');
} catch (e) {
  console.error('Error appending to LOYALTYMEMORY.md:', e);
}

try {
  fs.appendFileSync(operationSyncPath, operationSyncAppend, 'utf8');
  console.log('Appended Entry 128 to OperationSync.md successfully.');
} catch (e) {
  console.error('Error appending to OperationSync.md:', e);
}
