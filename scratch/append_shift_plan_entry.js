const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'OperationSync.md');
const entry = `

## Entry 018

- Timestamp: 2026-06-04T19:55:00+03:00
- Agent: Antigravity
- Task: Çalışma Planı (Shift Plan) Ekranı Entegrasyonu
- Intent: Personelin bugünden itibaren tanımlanmış olan vardiya planlarını listeleyen, mola hariç net çalışma süresini hesaplayan ve geçmiş günlerin verilerini isteğe bağlı yenileyerek veri trafiğini optimize eden yeni bir "Çalışma Planı" ekranının mobil uygulamaya entegrasyonu.
- Files Read:
  - personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt
  - personel-android/app/src/main/java/com/suitable/personel/NavigationKeys.kt
  - personel-android/app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt
  - personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt
- Files Changed:
  - personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt
  - personel-android/app/src/main/java/com/suitable/personel/NavigationKeys.kt
  - personel-android/app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt
  - personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt
  - personel-android/app/src/main/java/com/suitable/personel/ui/main/ShiftPlanScreen.kt [NEW]
  - personel-android/HANDOFF.md
- Commands Run:
  - \`.\\\\gradlew.bat compileDebugKotlin\` (Android derleme testi - BAŞARILI)
  - \`.\\\\gradlew.bat assembleDebug\` (Android APK paketi derleme - BAŞARILI)
- Findings:
  - \`TaskRepository.kt\` modeline \`breakMinutes\` alanı eklendi ve DB'den gelen \`break_minutes\` değeri bu alana atandı.
  - \`fetchShiftsForPersonnelRange\` fonksiyonu eklenerek API'nin \`gte\`/\`lte\` filtreleri üzerinden belirli tarih aralıklarında vardiya sorgusu çekilmesi sağlandı.
  - Navigasyon için \`ShiftPlan\` nav key tanımlandı ve \`MainScreen\` rotasına bağlandı.
  - \`HomeScreen\` yan menüsüne "🗓️ Çalışma Planı" butonu eklendi. "Yarın" ve "Sonraki" kartları tıklanabilir hale getirilerek "Çalışma Planı" ekranına yönlendirildi.
  - \`ShiftPlanScreen.kt\` adında Jetpack Compose ekranı oluşturuldu. Bu ekranda:
    - Bugünün vardiya planı en üstte belirgin gösterilir.
    - Aylık tüm vardiya planları listelenir.
    - Giriş, çıkış, mola süreleri ve mola hariç net çalışma saatleri gösterilir.
    - Veri tasarrufu için varsayılan olarak gelecek vardiyalar çekilir; yenileme butonuyla geçmiş günlerin verileri de yüklenebilir.
- Decisions:
  - Net çalışma süresi \`brüt süre - mola süresi\` şeklinde hesaplanacak ve saat biriminde gösterilecek.
  - Sayfa açılışında veri minimizasyonu için sadece gelecek vardiyaların çekilmesi, manuel tetiklemeyle tüm ayın geçmişinin yüklenmesi kararlaştırıldı.
- Next Step: \`Uygulamanın şubede/test ortamında personel tarafından test edilmesi.\`
- Handoff Contract: Sonraki agent çalışmaya başlamadan önce bu Entry 018'i ve güncellenmiş HANDOFF.md dosyasını okusun. Mobil uygulamada Çalışma Planı ekranının ve veri çekme/sorgulama altyapısının sorunsuz çalıştığını varsayabilir.
`;

try {
  fs.appendFileSync(targetPath, entry, 'utf8');
  console.log('Successfully appended Entry 018 to OperationSync.md');
} catch (e) {
  console.error('Error appending entry:', e);
  process.exit(1);
}
