# Kiosk Düzeltmeleri Görev Takip Listesi (task.md)

## Web Yönetim Paneli
- [x] `src/lib/kioskSettings.js` dosyasında kategori yüksekliği `clampNumber` sınırlarının `50` ve `300` olarak genişletilmesi
- [x] `src/components/pages/KioskManagementDesktop.jsx` dosyasında kategori yüksekliği input `min` ve `max` limitlerinin `1.5` ve `8.0` cm olarak esnetilmesi

## Kiosk Big Screen (`KioskBigScreen.kt`)
- [x] `settingsJson`'dan `category_button_height` ayarının okunması ve yan menü kartlarına uygulanması
- [x] `cartDockYAnim` animasyon eğrisinin 800ms'lik `tween` ve `CubicBezierEasing(0.42f, 0.0f, 0.58f, 1.0f)` ile yumuşatılması
- [x] `ProductDetailSheet` için `linkedIds` çözümlenmesinde `group_def_id` anahtarının önceliklendirilmesi
- [x] Kategori configs'ten `visibleCategories` listesinin çıkarılması, alt kategori ürün gruplama mantığının eklenmesi ve boş kategori başlığı desteği

## Kiosk Tablet Screen (`KioskTabletScreen.kt`)
- [x] Cihaz yönelimine göre dinamik kategori yüksekliği ayarının (`tablet_category_button_height_portrait` / `tablet_category_button_height_landscape`) okunması ve yan menüye uygulanması
- [x] `cartDockYAnim` animasyon eğrisinin 800ms'lik `tween` ve `CubicBezierEasing` ile yumuşatılması
- [x] `ProductDetailSheet` için `linkedIds` çözümlenmesinde `group_def_id` anahtarının önceliklendirilmesi
- [x] Kategori configs'ten `visibleCategories` listesinin çıkarılması, alt kategori ürün gruplama mantığının eklenmesi ve boş kategori başlığı desteği

## Derleme, Test ve Doğrulama
- [x] Kiosk Android uygulamasının başarılı derlenmesi ve tablete yüklenmesi (`.\gradlew.bat installDebug`)
- [ ] Değişikliklerin tablet üzerinde test edilmesi ve doğrulanması
- [x] `walkthrough.md` ve `OperationSync.md` belgelerinin güncellenmesi
