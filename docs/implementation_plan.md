# SuitableRMS Kiosk Native Android Uygulaması — İmplementasyon Planı

## Genel Açıklama

Mevcut web tabanlı `KioskBig.jsx` (dikey büyük TV) ve `KioskTablet.jsx` (yatay/dikey tablet) ekranlarının **tek bir native Android uygulaması** olarak yeniden yazılması planlanmaktadır.

Uygulama `X:\RMSv3\kiosk-android\` klasöründe yer alacak; mevcut `personel-android/`, `musteri-android/`, `wms-android/` uygulamalarından tamamen bağımsız bir Gradle projesi olacaktır.

Yeni APK paketi: `com.suitable.kiosk`

---

## Kullanıcı İncelemesi Gereken Konular

> [!IMPORTANT]
> **Tek uygulama / çift mod kararı:** Kiosk ve Kiosk Tablet, tek bir APK içinde farklı UI modları olarak çalışacaktır. Mod belirleme akışı:
> 1. İlk açılışta "Pair Key" giriş ekranı (KioskManagement'tan üretilen istasyon kodu)
> 2. API → `pos_terminals` tablosu → `terminal_type` alanı okunur
> 3. `terminal_type = 'kiosk'` → **BigScreen modu** (portrait lock, 480×854)
> 4. `terminal_type = 'kiosk_tablet'` → **Tablet modu** (landscape/portrait, 820×1180)
> 5. Mod + station code cihazın `SharedPreferences`'ına kaydedilir (iş verisi değil, cihaz tercihi)
> 6. 7 kez logo'ya tıklama → Yeniden eşleme ekranı (PIN korumalı)

> [!IMPORTANT]
> **API Adresi:** Tüm istekler `https://rms-api-production-219d.up.railway.app/api/query` üzerinden gider. Supabase / AWS kullanılmaz. Uygulama içinde hard-code edilecek; ilerleyen aşamada ayarlar ekranına taşınabilir.

> [!WARNING]
> **Resim yükleme:** Ürün görselleri `/api/files/...` yoluyla sunucudan gelir. Coil kütüphanesi ile yüklenecek. Resim yüklenemezse placeholder gösterilir; sessiz fallback kabul edilir (iş verisi değil, görsel).

---

## Klasör Yapısı

```
X:\RMSv3\
├── kiosk-android/               ← YENİ — diğer android klasörlerine dokunulmaz
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── java/com/suitable/kiosk/
│   │   │   │   ├── MainActivity.kt
│   │   │   │   ├── KioskApplication.kt
│   │   │   │   ├── data/
│   │   │   │   │   ├── ApiService.kt          ← Retrofit interface
│   │   │   │   │   ├── KioskRepository.kt     ← Tüm API çağrıları
│   │   │   │   │   └── model/
│   │   │   │   │       ├── SaleItem.kt
│   │   │   │   │       ├── SaleCategory.kt
│   │   │   │   │       ├── CartItem.kt
│   │   │   │   │       ├── KioskSettings.kt
│   │   │   │   │       ├── KioskStation.kt
│   │   │   │   │       └── OrderPayload.kt
│   │   │   │   ├── ui/
│   │   │   │   │   ├── setup/
│   │   │   │   │   │   └── PairingScreen.kt   ← İlk açılış / eşleme
│   │   │   │   │   ├── bigscreen/
│   │   │   │   │   │   ├── KioskBigScreen.kt  ← Dikey TV modu
│   │   │   │   │   │   └── BigScreenViewModel.kt
│   │   │   │   │   ├── tablet/
│   │   │   │   │   │   ├── KioskTabletScreen.kt ← Tablet modu
│   │   │   │   │   │   └── TabletViewModel.kt
│   │   │   │   │   └── shared/
│   │   │   │   │       ├── MenuGrid.kt        ← Ortak ürün grid
│   │   │   │   │       ├── CartPanel.kt       ← Ortak sepet
│   │   │   │   │       ├── ProductDetailModal.kt
│   │   │   │   │       ├── PaymentScreen.kt   ← Ortak ödeme
│   │   │   │   │       └── ClosedOverlay.kt   ← Çalışma saati kapalı ekranı
│   │   │   │   └── prefs/
│   │   │   │       └── KioskPrefs.kt          ← SharedPreferences wrapper
│   │   │   └── res/
│   │   │       ├── layout/ (boş — Compose kullanılıyor)
│   │   │       └── values/
│   │   │           ├── strings.xml
│   │   │           └── themes.xml
│   │   └── build.gradle.kts
│   ├── build.gradle.kts
│   ├── settings.gradle.kts
│   └── gradle/
│       └── libs.versions.toml
```

---

## Önerilen Değişiklikler

### Faz 1 — Proje İskeleti ve Eşleme Ekranı

#### [YENİ] `kiosk-android/` — Gradle Projesi
- `namespace = "com.suitable.kiosk"`
- `applicationId = "com.suitable.kiosk"`
- `minSdk = 26`, `targetSdk = 36`, `compileSdk = 36`
- Bağımlılıklar: Jetpack Compose BOM, Material3, Retrofit + Gson, Coil, Coroutines, Navigation3, ZXing (QR okuma — sadakat için)

#### [YENİ] `PairingScreen.kt`
- Pair Key (istasyon kodu) giriş alanı
- API'ye `pos_terminals` sorgusu → `terminal_type` okuma
- Hata durumu: açık mesaj ("Bu cihaz sisteme kayıtlı değil")
- Başarıda: mod + station_code `KioskPrefs`'e yaz → uygun moda yönlendir

#### [YENİ] `KioskPrefs.kt`
- `getKioskMode(): KioskMode?` — BIG_SCREEN / TABLET / null
- `getStationCode(): String?`
- `saveDeviceConfig(mode, stationCode)`
- `clearDeviceConfig()` — yeniden eşleme

---

### Faz 2 — Veri Katmanı

#### [YENİ] `ApiService.kt` + `KioskRepository.kt`
Web'deki `/api/query` endpoint'ini tüketen Retrofit tabanlı katman:

| İşlem | Tablo | Açıklama |
|-------|-------|----------|
| Ayarlar yükle | `settings` key=`kiosk_settings_v2` | Kiosk genel ayarları |
| İstasyon doğrula | `pos_terminals` | Pair key → terminal_type |
| Kategoriler | `sale_categories` | Menü kategorileri |
| Ürünler | `sale_items` | Fiyat, resim, seçenekler |
| Çalışma kuralları | `kiosk_operating_hours_rules` | Açık/kapalı saatler |
| Sipariş gönder | `sales` + `sale_lines` | Sepet → kayıt |
| Ödeme | `sale_payments` | Nakit / kart |
| Sadakat | `loyalty_customers` | QR ile müşteri eşleme |

---

### Faz 3 — BigScreen UI (KioskBig karşılığı)

#### [YENİ] `KioskBigScreen.kt`
- Portrait lock (manifest: `screenOrientation="portrait"`)
- Canvas: 480dp × 854dp sanal alan, `Box + scale` ile gerçek ekrana ölçekleme
- Sol panel: Kategori sekmeler (dikey scroll)
- Sağ panel: Ürün grid (3 sütun)
- Alt: Sepet özeti + Sipariş Ver butonu
- Floating sepet topu (web'deki CART_DOCK mantığı)
- Kapalı iken: `ClosedOverlay` (saat / mesaj)

---

### Faz 4 — Tablet UI (KioskTablet karşılığı)

#### [YENİ] `KioskTabletScreen.kt`
- Portrait + Landscape destekli (manifest: `screenOrientation="fullSensor"`)
- Portrait: Sol kategori bar + Sağ ürün grid + Alt sepet
- Landscape: Sol dar kategori şeridi + Orta ürün grid + Sağ sepet paneli (split layout)
- Ürün detay modal: arka planı karartan overlay + seçenek grupları
- Combo menü desteği (web'deki ComboBuilder mantığı)

---

### Faz 5 — Ortak Bileşenler

#### [YENİ] `shared/` Bileşenler
| Composable | Görev |
|------------|-------|
| `MenuGrid` | Ürün kartları, resim (Coil), fiyat, badge |
| `CartPanel` | Kalem listesi, miktar +/−, toplam, iptal |
| `ProductDetailModal` | Seçenek grupları, not alanı, sepete ekle |
| `PaymentScreen` | Nakit/Kart seçimi, tutar hesaplama, onay |
| `ClosedOverlay` | Saat/gün mesajı, sayaç (ne zaman açılır) |
| `LoyaltyQrScanner` | ZXing ile QR okuma, müşteri eşleme |

---

### Faz 6 — Güvenlik / PIN Sıfırlama

- Logo'ya 7 kez hızlı tıklama → Yönetici PIN ekranı
- PIN doğrulanırsa: `KioskPrefs.clearDeviceConfig()` → PairingScreen'e dön
- PIN `settings` tablosundan okunur (web'deki `admin_pin` mantığı)

---

## Teknik Kararlar

| Konu | Karar |
|------|-------|
| UI Framework | Jetpack Compose (Material3) |
| Ağ | Retrofit 2 + Gson |
| Görsel yükleme | Coil 2 |
| Asenkron | Kotlin Coroutines + ViewModel |
| Navigasyon | Navigation3 (personel-android ile aynı) |
| Yerel depolama | SharedPreferences (sadece cihaz config — iş verisi değil) |
| Ekran yönü | BigScreen: portrait lock / Tablet: fullSensor |
| Ölçekleme | Canvas boyutu sabit, `scale()` ile fiziksel ekrana uyum |
| QR okuma | ZXing (sadakat müşteri eşleme) |

---

## Verifikasyon Planı

### Derleme
- `./gradlew assembleDebug` → sıfır hata

### Manuel Test
- BigScreen modunu bir portrait Android cihazda / emülatörde aç
- Tablet modunu landscape emülatörde aç
- Pair Key ile eşleme → menü yükleme
- Sepete ürün ekleme → sipariş gönderme
- Çalışma saati dışında ClosedOverlay görünümü
- 7 kez logo tıklama → PIN → yeniden eşleme

---

## Kullanıcı Kararları ✅

| Konu | Karar |
|------|-------|
| **Ödeme** | Sadece "Kart ile öde" — kayıt `sale_payments` tablosuna `payment_method = 'card'` olarak düşer |
| **Kiosk Lockdown** | Evet — Immersive sticky mod, geri/home butonu devre dışı, ekran her zaman açık |
| **Offline** | ClosedOverlay göster — ağ kesilince menü erişimi kapatılır |
| **Faz yaklaşımı** | Faz faz ilerle — her fazın sonunda kullanıcı onayı alınır |
