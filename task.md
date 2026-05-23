# Müşteri Mobil App — Bağımsız Web App Dönüşümü

## Tamamlanan ✅
- [x] SQL migration: `customer_app_config` tablosu (Railway'de çalıştırıldı)
- [x] `src/lib/customerMobileAppConfig.js` — DB CRUD fonksiyonları
- [x] `CustomerLoyaltyMobileApp.jsx` — PhoneChrome kaldır, tam ekran standalone
- [x] `CustomerLoyaltyMobileApp.jsx` — MobileHomeDashboard bileşeni
- [x] `CustomerLoyaltyMobileApp.jsx` — OrderTypeModal (adrese teslim + masadan sipariş)
- [x] `CustomerLoyaltyMobileApp.jsx` — Sahte status bar standalone modda gizlendi
- [x] `CustomerLoyaltyMobileApp.jsx` — Config entegrasyonu (DB'den branding/buton okuma)
- [x] `CustomerMobileAppPage.jsx` — PWA meta tag'ları
- [x] `MobileAppShells.jsx` — Admin config paneli (branding + butonlar)
- [x] `MobileAppShells.jsx` — Görsel yükleme Railway volume üzerinden
- [x] `server/index.js` — JSONB normalizeWriteValue fix (customer_app_config)
- [x] Build başarılı (0 hata)

## Bekleyen ⏳
- [ ] ⚠️ **KRİTİK**: `server/index.js` Railway'e deploy et
- [ ] Deploy sonrası config kaydetme testi
- [ ] Boss uygulamasına aynı standalone dönüşüm
- [ ] Personel uygulamasına aynı standalone dönüşüm
- [ ] OperationSync.md güncelle (Entry 106 eklendi)
