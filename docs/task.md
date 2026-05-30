# Görev Listesi - Combo Menü Boş Gelme Sorunu (Çözüm)

- `[x]` **Adım 1:** Veri normalizasyonunu sağla (`UnifiedPosStaffScreen.jsx` ve Kiosk dosyalarında `normalizeComboGroups` entegrasyonu).
- `[x]` **Adım 2:** Eksik seçenek grupları için statik eşleşme ekle (`ComboBuilderModal.jsx`, `KioskBig.jsx`, `KioskTablet.jsx` içerisinde `STATIC_OPTION_GROUPS` entegrasyonu).
- `[x]` **Adım 3:** `steps.length === 0` durumunda premium sorun teşhisi (Debug View) panelini tasarla ve ekle.
- `[x]` **Adım 4:** Proje genelinde derleme testi gerçekleştirerek hatasız çalıştığını doğrula.
- `[x]` **Adım 5:** Değişiklikleri `./docs/` klasörüne kopyala ve `OperationSync.md` dosyasını güncelle.

# Görev Listesi - Satış Malları Görsel Depolama ve Yerel/Terminal Ortam Çözümleme

- `[x]` **Adım 6:** 74 ürünün Base64 `pos_image` verilerini Railway Volume depolama alanına (`/api/files/`) kayıpsız yükle ve DB'yi güncelle.
- `[x]` **Adım 7:** Merkezi DB istemcisinde (`db.js`) relative `/api/files/` yollarını canlının API URL'ine çözümleyen `resolveImageUrl` metodunu entegre et.
- `[x]` **Adım 8:** `useUnifiedPosCatalogBootstrap` (`UnifiedPosStaffScreen.jsx`), `KioskBig.jsx` ve `KioskTablet.jsx` içerisinde ürün görsellerini bu çözümleyici ile besle.
- `[x]` **Adım 9:** Vite derlemesini sıfır hata ile al ve `./docs/` belgelerini tamamen eşle.

