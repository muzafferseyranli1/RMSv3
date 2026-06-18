import fs from 'fs';
import path from 'path';

const workspaceRoot = 'X:\\\\RMSv3';

const syncEntry = `\n\n## Entry 127 - 2026-05-24\n- \`Timestamp\`: \`2026-05-24T19:15:00+03:00\`\n- \`Agent\`: \`Antigravity\`\n- \`Task\`: \`CouponsScreen Mükerrer Tanımının Kaldırılması\`\n- \`Intent\`: \`Müşteri mobil uygulamasındaki kupon kartlarının bilet tasarımını (CouponCard) korurken, CouponsScreen bileşeninin mükerrer tanımından kaynaklanan karmaşık arayüzü kaldırıp sade, orijinal (kupon kodu ekleme + aktif kupon listesi) tasarıma geri dönmek.\`\n- \`Files\`:\n  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`\n- \`Execution details\`:\n  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\` dosyasında 1214. satırda bulunan mükerrer \`CouponsScreen\` tanımı kaldırıldı. Bu sayede, React'in bu bileşenin eski karmaşık halini ezerek render etmesi engellendi ve 502. satırdaki sade, orijinal layout (sadece kupon kodu girişi ve aktif kuponların listesi) aktif hale geldi.\n  - Kupon kartlarının görsel referanstaki bilet tasarımını (beyaz koçan, dikey outline fayda yazısı, dikey kesikli çizgi, renkli bilet gövdesi, yanlarda bilet yırtmaçları) bozacak herhangi bir değişiklik yapılmadı; bilet tasarımları aynen korundu.\n  - Proje \`npm run build\` ile başarıyla derlenmiştir.\n- \`Handoff Contract\`: \`CouponsScreen'deki mükerrer tanım silindi, sade kupon listeleme layout'u ve özel bilet tasarımları başarıyla korundu. Proje hatasız derlenmektedir.\`\n`;

const memoryEntry = `\n\n## Entry 059\n\n- \`Timestamp\`: \`2026-05-24T19:15:00+03:00\`\n- \`Agent\`: \`Antigravity\`\n- \`Focus\`: \`CouponsScreen Sade Arayüzüne Geri Dönüş ve Mükerrer Kod Temizliği\`\n- \`Trigger\`: \`Kullanıcı geri bildirimi doğrultusunda CouponsScreen üzerindeki özet tile kartları, yakında bitecek ve pasif kupon başlıkları gibi fazlalıkların kaldırılması ve kupon kartlarının bilet tasarımının (CouponCard) aynen korunarak sade görünüme geçilmesi.\`\n- \`Files Read\`:\n  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`\n- \`Files Changed\`:\n  - \`src/components/mobile/CustomerLoyaltyMobileApp.jsx\`\n  - \`LOYALTYMEMORY.md\`\n  - \`OperationSync.md\`\n- \`Current Capability\`:\n  - Kupon ekranı artık sadece kupon kodu ekleme formu ve aktif kuponların listelendiği sade, temiz arayüze sahiptir.\n  - Kupon kartları referans görseldeki gibi beyaz sol koçan (outline dikey yazı), kesikli dikey çizgi, bilet yırtmaçları ve düz arka plan renkli gövde tasarımıyla listelenmektedir.\n- \`Gap\`:\n  - Yok.\n- \`Approved Phase\`: \`Clean CouponsScreen simple layout restore\`\n- \`Affected Surfaces\`:\n  - \`Müşteri Mobil Uygulaması Kuponlar Sekmesi\`\n- \`Readiness\`:\n  - \`Coupons screen cleanliness\`: \`Ready\`\n  - \`Coupon card visual design\`: \`Ready\`\n- \`Decision\`:\n  - Kod içindeki mükerrer \`CouponsScreen\` tanımı (line 1214) silinerek ilk sade tanımın ezilmesi engellendi ve görsel şablonların bilet tasarımları korunarak arayüz sadeliği sağlandı.\n- \`Risks\`:\n  - Yok.\n- \`Next Loyalty Step\`:\n  - Mobil uygulamayı yerel ortamda açıp kuponlar sekmesini sade haliyle ve kupon kartlarının doğru bilet görünümüyle render edildiğini son kez doğrulamak.\n`;

try {
  const syncPath = path.join(workspaceRoot, 'OperationSync.md');
  const syncData = fs.readFileSync(syncPath, 'utf8');
  fs.writeFileSync(syncPath, syncData.trimEnd() + syncEntry, 'utf8');
  console.log('Successfully updated OperationSync.md');

  const memoryPath = path.join(workspaceRoot, 'LOYALTYMEMORY.md');
  const memoryData = fs.readFileSync(memoryPath, 'utf8');
  fs.writeFileSync(memoryPath, memoryData.trimEnd() + memoryEntry, 'utf8');
  console.log('Successfully updated LOYALTYMEMORY.md');
} catch (err) {
  console.error('Error appending entries:', err);
  process.exit(1);
}

