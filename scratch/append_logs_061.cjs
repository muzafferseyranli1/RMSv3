const fs = require('fs');
const path = require('path');

const loyaltyMemoryPath = path.join(__dirname, '..', 'LOYALTYMEMORY.md');
const operationSyncPath = path.join(__dirname, '..', 'OperationSync.md');

const loyaltyMemoryAppend = `

## Entry 061

- \`Timestamp\`: \`2026-05-25T00:49:00+03:00\`
- \`Agent\`: \`Antigravity\`
- \`Focus\`: \`CouponCard İçeriğini Kampanya Verilerinden Otomatik Çekme\`
- \`Trigger\`: \`Kullanıcı talebi: Kupon kartında "KUPON" yazmak yerine kupon setinin bağlı olduğu kampanya adı yazılsın, sol koçandaki fayda metni kampanyanın eylemlerinden (action config) otomatik çekilsin, geçerlilik tarihi kampanya bitiş tarihinden alınsın.\`
- \`Files Read\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
  - \`src/lib/loyalty.js\` (ACTION_TYPE_OPTIONS, getDefaultActionConfig yapısı)
  - \`src/components/loyalty/LoyaltyCampaignWizard.jsx\` (IMAGE_SLOTS)
- \`Files Changed\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`
  - \`LOYALTYMEMORY.md\`
  - \`OperationSync.md\`
- \`Current Capability\`:
  - CouponCard artık büyük başlık olarak kampanya adını gösterir ("KUPON" yerine, örn. "İNDİRİM").
  - Sol koçandaki fayda metni kampanyanın \`applicableRules\` eylemlerinden otomatik çıkarılır:
    - \`order_discount\` (amount/percent) → \`50TL\` veya \`%30\`
    - \`special_discount\` / \`order_discount_amount\` → \`50TL\`
    - \`discount_percent\` → \`%30\`
    - \`product_pricing\` → öğe bazlı yüzde/tutar
    - \`free_products\` → \`HEDİYE\`
    - \`bonus_points\` → \`250P\`
    - \`points_earn_multiplier\` → \`x2\`
    - \`combo_bundle\` → \`KOMBO\` veya tutar
    - Fallback: \`coupon.benefitText\` kullanılır, o da yoksa \`HEDİYE\` gösterilir.
  - Kampanya eşleştirme geliştirildi: Önce \`coupon_present\` koşulunda bu kupon serisini arayan kampanya bulunur (çoklu ve tekli koşul yapısı desteklenir). Bulunamazsa eylem bazlı (couponSeriesId) eşleşme denenır.
  - Geçerlilik tarihi kampanya bitiş tarihinden (\`endsAt\`) alınır; yoksa kuponun kendi \`expiresAt\` değeri kullanılır.
  - Kampanya adı uzunluğuna göre otomatik font boyutu ayarlanır (>20 karakter: 1.3rem, >12: 1.6rem, kısa: 2rem).
- \`Gap\`:
  - Yok.
- \`Approved Phase\`: \`CouponCard campaign-driven content\`
- \`Affected Surfaces\`:
  - \`Müşteri Mobil Uygulaması Kuponlar Sekmesi\`
- \`Readiness\`:
  - \`CouponCard campaign name display\`: \`Ready\`
  - \`CouponCard benefit extraction\`: \`Ready\`
  - \`CouponCard campaign expiry\`: \`Ready\`
- \`Decision\`:
  - \`extractBenefitFromAction()\` helper fonksiyonu eklenerek tüm eylem tiplerinden fayda metni çıkarma desteklendi.
  - Kampanya eşleştirmesi \`coupon_present\` koşuluna öncelik verecek şekilde genişletildi (çoklu koşul ve tekli koşul formatı).
- \`Risks\`:
  - Yok.
- \`Next Loyalty Step\`:
  - Canlıda kupon kartlarının doğru kampanya adını, fayda metnini ve geçerlilik tarihini gösterdiğini doğrulamak.
`;

const operationSyncAppend = `

## Entry 129 - 2026-05-25
- \`Timestamp\`: \`2026-05-25T00:49:00+03:00\`
- \`Agent\`: \`Antigravity\`
- \`Task\`: \`CouponCard İçeriğini Kampanya Verilerinden Otomatik Çekme\`
- \`Intent\`: \`Kupon kartındaki "KUPON" başlığını kampanya adıyla, sol koçandaki fayda metnini kampanya eylem konfigürasyonundan çıkarılan değerle, geçerlilik tarihini kampanya bitiş tarihiyle değiştirmek.\`
- \`Files Changed\`:
  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`:
    - CouponCard bileşeni: "KUPON" → \`campaignName\` (büyük Impact font başlık)
    - Kampanya eşleştirme geliştirildi: \`coupon_present\` koşulu öncelikli, sonra \`couponSeriesId\` eylem bazlı
    - \`extractBenefitFromAction()\` helper fonksiyonu eklendi — tüm eylem tiplerini destekler
    - Fayda metni kampanya eylemlerinden otomatik çıkarılır (fallback: coupon.benefitText)
    - Kampanya adı uzunluğuna göre dinamik font boyutu
- \`Commands Run\`:
  - \`npm run build:web\` (başarılı, 6.92s, 0 hata)
- \`Handoff Contract\`: \`CouponCard artık kampanya adını büyük başlık olarak gösterir, fayda metnini kampanya eylemlerinden otomatik çıkarır, geçerlilik tarihini kampanya bitiş tarihinden alır. Build başarılı.\`
`;

try {
  fs.appendFileSync(loyaltyMemoryPath, loyaltyMemoryAppend, 'utf8');
  console.log('Appended Entry 061 to LOYALTYMEMORY.md successfully.');
} catch (e) {
  console.error('Error appending to LOYALTYMEMORY.md:', e);
}

try {
  fs.appendFileSync(operationSyncPath, operationSyncAppend, 'utf8');
  console.log('Appended Entry 129 to OperationSync.md successfully.');
} catch (e) {
  console.error('Error appending to OperationSync.md:', e);
}
