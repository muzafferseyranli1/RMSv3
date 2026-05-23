# Müşteri Mobil Uygulamasını Bağımsız Web App Olarak Yeniden Tasarlama

**Status: %90 TAMAMLANDI — Deploy Bekleniyor**

> [!CAUTION]
> **KRİTİK DEPLOY GEREKLİLİĞİ**: `server/index.js` değişikliği (normalizeWriteValue'da `customer_app_config` JSONB fix) **henüz Railway'e deploy edilmedi**. Deploy olmadan config kaydetme `invalid input syntax for type json` hatası verir. **İlk iş deploy olmalı!**

---

## Tamamlanan İşler ✅

### Veritabanı
- [x] `migrations/customer-app-config.sql` — Tablo tanımı hazır
- [x] Railway Postgres'te `customer_app_config` tablosu oluşturuldu (id: `09df162e-557a-4a14-baf6-5291848ffa59`)
- [x] Varsayılan `default` satır eklendi

### Lib Katmanı
- [x] `src/lib/customerMobileAppConfig.js` — `loadCustomerAppConfig()`, `saveCustomerAppConfig()`, `getDefaultAppConfig()` fonksiyonları

### Müşteri Mobil App (`CustomerLoyaltyMobileApp.jsx`)
- [x] `MobileHomeDashboard` bileşeni (hero + logo + hoşgeldin + 2×2 buton grid + özet tiles)
- [x] `OrderTypeModal` bileşeni (Adrese Teslim dış link + Masadan Sipariş QR)
- [x] Standalone modda PhoneChrome kaldırıldı → tam ekran `maxWidth: 430px`
- [x] Sahte telefon status bar'ı (saat/sinyal/wifi/pil) standalone modda gizlendi
- [x] Config DB'den yükleniyor (tek seferlik fetch, polling yok)
- [x] AppViewport'a `appConfig` ve `onOrderAction` prop'ları geçiriliyor
- [x] Home tab'da standalone → MobileHomeDashboard, embedded → eski HomeScreen

### PWA
- [x] `CustomerMobileAppPage.jsx` — `apple-mobile-web-app-capable`, `theme-color`, `viewport-fit=cover` meta tag'ları

### Admin Config Yüzeyi (`MobileAppShells.jsx`)
- [x] `CustomerAppConfigPanel` bileşeni (screenKey=customer için)
- [x] **Marka & Görünüm** sekmesi: Şirket adı, hoş geldiniz metni, logo yükleme, arka plan yükleme
- [x] **Ana Sayfa Butonları** sekmesi: 4 buton — etiket, ikon, tip (sipariş/telefon/weblink/app_page), tip bazlı config
- [x] Görsel yükleme **Railway volume** üzerinden (`POST /api/upload` → `rms-api-volume` → `/api/files/:filename`)
- [x] Yükleme durumu göstergesi (spinner)

### Server (`server/index.js`)
- [x] `normalizeWriteValue` fonksiyonuna `customer_app_config: ['branding', 'home_buttons']` eklendi
- [ ] ⚠️ **DEPLOY EDİLMEDİ** — Railway'e push gerekli

### Build
- [x] `npx vite build` başarılı (18.22s, 0 hata)

---

## Bekleyen İşler ⏳

### 1. Deploy (KRİTİK)
- [ ] `server/index.js` Railway'e deploy et (`GitHubguncelle.bat` veya `railway up`)
- [ ] Deploy sonrası `/musteri-app`'ten config kaydetmeyi test et

### 2. Boss Uygulaması
- [ ] Boss mobil uygulamasına aynı standalone dönüşümü uygula
- [ ] Boss'a özel config tablosu veya mevcut tabloyu genişlet

### 3. Personel Uygulaması
- [ ] Personel mobil uygulamasına aynı standalone dönüşümü uygula

---

## Dosya Haritası

| Dosya | Durum | Açıklama |
|---|---|---|
| `migrations/customer-app-config.sql` | ✅ Tamamlandı | DB tablo tanımı |
| `src/lib/customerMobileAppConfig.js` | ✅ Tamamlandı | Config CRUD |
| `src/components/mobile/CustomerLoyaltyMobileApp.jsx` | ✅ Tamamlandı | Ana mobil app (2331 satır) |
| `src/components/pages/CustomerMobileAppPage.jsx` | ✅ Tamamlandı | PWA meta tag'ları |
| `src/components/pages/MobileAppShells.jsx` | ✅ Tamamlandı | Admin config paneli |
| `server/index.js` | ⚠️ Deploy bekliyor | JSONB normalization fix |

## Erişim Bilgileri

- **Standalone müşteri app**: `https://suitablerms.up.railway.app/musteri-app`
- **Admin config yüzeyi**: Backoffice → Mobil App → Müşteri sekmesi (üstte config paneli)
- **Railway API**: `https://rms-api-production-219d.up.railway.app`
- **Upload volume**: `rms-api-volume` → `/app/uploads`
