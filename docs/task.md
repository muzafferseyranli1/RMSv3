# Görev Listesi - Combo Menü Boş Gelme Sorunu (Çözüm)

- `[x]` **Adım 1:** Veri normalizasyonunu sağla (`UnifiedPosStaffScreen.jsx` ve Kiosk dosyalarında `normalizeComboGroups` entegrasyonu).
- `[x]` **Adım 2:** Eksik seçenek grupları için statik eşleşme ekle (`ComboBuilderModal.jsx`, `KioskBig.jsx`, `KioskTablet.jsx` içerisinde `STATIC_OPTION_GROUPS` entegrasyonu).
- `[x]` **Adım 3:** `steps.length === 0` durumunda premium sorun teşhisi (Debug View) panelini tasarla ve ekle.
- `[x]` **Adım 4:** Proje genelinde derleme testi gerçekleştirerek hatasız çalıştığını doğrula.
- `[x]` **Adım 5:** Değişiklikleri `./docs/` klasörüne kopyala ve `OperationSync.md` dosyasını güncelle.
