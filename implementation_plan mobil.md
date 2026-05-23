# Müşteri Mobil Uygulamasını Bağımsız Web App Olarak Yeniden Tasarlama

**Status: %95 TAMAMLANDI — Deploy Bekleniyor**

> [!CAUTION]
> **KRİTİK DEPLOY GEREKLİLİĞİ**: `server/index.js` değişikliği (normalizeWriteValue'da `customer_app_config` JSONB fix, satır 273) **henüz Railway'e deploy edilmedi**. Deploy olmadan admin panelinden config kaydetme `invalid input syntax for type json` hatası verir. **İlk iş deploy olmalı!**

---

## Tamamlanan İşler ✅

### Veritabanı
- [x] `migrations/customer-app-config.sql` — Tablo tanımı hazır
- [x] Railway Postgres'te `customer_app_config` tablosu oluşturuldu (id: `09df162e-557a-4a14-baf6-5291848ffa59`)
- [x] Varsayılan `default` satır eklendi

### Lib Katmanı
- [x] `src/lib/customerMobileAppConfig.js` — `loadCustomerAppConfig()`, `saveCustomerAppConfig()`, `getDefaultAppConfig()`
- [x] Branding alanları: companyName, logoUrl, backgroundImageUrl, primaryColor, headerGradient, welcomeText, **bodyBackgroundColor**, **bodyBackgroundImageUrl**

### Müşteri Mobil App (`CustomerLoyaltyMobileApp.jsx`)
- [x] `MobileHomeDashboard` bileşeni (hero + logo + hoşgeldin + 2×2 buton grid + özet tiles)
- [x] `OrderTypeModal` bileşeni (Adrese Teslim dış link + Masadan Sipariş QR)
- [x] Standalone modda PhoneChrome kaldırıldı → tam ekran `maxWidth: 430px`
- [x] Sahte telefon status bar'ı (saat/sinyal/wifi/pil) standalone modda gizlendi
- [x] Config DB'den yükleniyor (tek seferlik fetch, polling yok)
- [x] **Gövde arka planı customizable** — bodyBackgroundImageUrl varsa görsel, yoksa bodyBackgroundColor
- [x] Summary tiles'a `backdrop-filter: blur(8px)` + yarı saydam beyaz (görsel arka planda okunabilirlik)

### PWA
- [x] `CustomerMobileAppPage.jsx` — `apple-mobile-web-app-capable`, `theme-color`, `viewport-fit=cover`

### Admin Config Yüzeyi (`MobileAppShells.jsx`)
- [x] `CustomerAppConfigPanel` bileşeni (screenKey=customer için)
- [x] **Marka & Görünüm** sekmesi:
  - Şirket adı, hoş geldiniz metni
  - Logo yükleme (Railway volume)
  - Arka plan görseli yükleme (Railway volume)
  - **Gövde arka planı**: Renk seçici (color picker + hex) veya görsel yükleme
- [x] **Ana Sayfa Butonları** sekmesi: 4 buton — etiket, ikon, tip, tip bazlı config
- [x] Tüm görseller Railway volume üzerinden (`POST /api/upload` → `rms-api-volume`)

### Server (`server/index.js`)
- [x] `normalizeWriteValue` fonksiyonuna `customer_app_config: ['branding', 'home_buttons']` eklendi
- [ ] ⚠️ **DEPLOY EDİLMEDİ** — Railway'e push gerekli

### Build
- [x] `npx vite build` başarılı (18.39s, 0 hata)

---

## Bekleyen İşler ⏳

### 1. Deploy (KRİTİK — İLK İŞ)
- [ ] `server/index.js` Railway'e deploy et
- [ ] Deploy sonrası `/musteri-app`'ten config kaydetmeyi test et
- [ ] Görsel yükleme + gövde arka plan testini yap

### 2. Boss Uygulaması
- [ ] Boss mobil uygulamasına aynı standalone dönüşümü uygula

### 3. Personel Uygulaması
- [ ] Personel mobil uygulamasına aynı standalone dönüşümü uygula

---

## Dosya Haritası

| Dosya | Durum | Açıklama |
|---|---|---|
| `migrations/customer-app-config.sql` | ✅ | DB tablo tanımı |
| `src/lib/customerMobileAppConfig.js` | ✅ | Config CRUD + defaults |
| `src/components/mobile/CustomerLoyaltyMobileApp.jsx` | ✅ | Ana mobil app (~2340 satır) |
| `src/components/pages/CustomerMobileAppPage.jsx` | ✅ | PWA meta tag'ları |
| `src/components/pages/MobileAppShells.jsx` | ✅ | Admin config paneli |
| `server/index.js` | ⚠️ Deploy bekliyor | JSONB normalization fix (satır 273) |

## Erişim Bilgileri

- **Standalone müşteri app**: `https://suitablerms.up.railway.app/musteri-app`
- **Admin config yüzeyi**: Backoffice → Mobil App → Müşteri sekmesi
- **Railway API**: `https://rms-api-production-219d.up.railway.app`
- **Upload volume**: `rms-api-volume` → `/app/uploads` (UPLOAD_DIR env)
- **Local test**: `.env` → `VITE_API_URL=http://localhost:3001` + `node server/index.js`

## Notlar
- `.env`'deki `VITE_API_URL` Railway'i gösteriyor; local test için `http://localhost:3001` yapılmalı
- Görseller base64 değil, Railway volume'da saklanıyor (rms-api-volume)
- Gövde arka planında görsel varsa renk yerine görsel kullanılır (öncelik: görsel > renk)
