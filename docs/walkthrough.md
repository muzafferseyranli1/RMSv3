# Kiosk Android — Walkthrough (Faz 1 + Faz 2)

**Tarih:** 2026-06-19  
**Oturum:** kiosk-android native Android uygulaması ilk iki fazı

---

## Yapılan Değişiklikler

### Faz 1 — Proje İskeleti + Eşleme Ekranı

- `X:\RMSv3\kiosk-android\` yeni bağımsız Gradle projesi oluşturuldu
- AGP 9.0 uyumlu yapılandırma (`kotlin.android` plugin kaldırıldı)
- `com.suitable.kiosk`, `minSdk=26`, `targetSdk=36`
- Kiosk lockdown: immersive sticky mode + FLAG_KEEP_SCREEN_ON
- Eşleme ekranı: dark premium UI, station code giriş, `pos_terminals` API sorgusu
- `KioskMode` enum: `BIG_SCREEN` / `TABLET`
- `KioskPrefs`: cihaz config SharedPreferences wrapper

### Faz 2 — Veri Katmanı

- 8 model sınıfı: SaleCategory, SaleItem, OptionGroup, CartItem, OrderPayload vb.
- `KioskRepository`: kategoriler, ürünler, kiosk kanalı, option groups, çalışma saati, sipariş gönderme
- `KioskDataViewModel`: menü yükleme, sepet yönetimi, sipariş gönderme, çalışma saati hesaplama
- Placeholder ekranlar ViewModel ile güncellendi

---

## Test Sonuçları

- `./gradlew assembleDebug` → **BUILD SUCCESSFUL** (19.9 MB APK)
- Cihazda crash sorunu tespit edildi: ViewModel factory yanlış kullanımı

---

## Doğrulama

- Build: ✅
- Cihaz: ❌ Crash (ViewModel factory düzeltmesi gerekli)
- Logcat: ❌ adb bağlantı sorunu

---

## Açık Görevler

- [ ] ViewModel factory crash düzeltmesi (`MainActivity.kt`)
- [ ] Faz 3: BigScreen UI
- [ ] Faz 4: Tablet UI
- [ ] Faz 5: Ortak bileşenler
- [ ] Faz 6: PIN güvenliği
