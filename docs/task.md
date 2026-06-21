# Checklist for Phase 2 UI and Parity Improvements

## Kiosk Big Screen (`KioskBigScreen.kt`)
- [x] Kök Box üzerindeki genel dokunma takip mekanizmasının (`pointerInput`) kaldırılması
- [x] `CartFab` sepet topuna `detectVerticalDragGestures` entegre edilerek yumuşak sürüklenme ve bırakılan yerde kalma davranışının eklenmesi
- [x] Ürünlerin sürekli akması için kategori başlıkları ve ürünleri birleştiren düz listeye (`flatGridItems`) geçilmesi
- [x] Kategori başlıkları için `CategoryHeaderRow` eklenmesi ve `ProductGrid` ile `ProductCard`'ın bu düz listeyle çalışacak şekilde güncellenmesi
- [x] `LazyGridState` yardımıyla scroll takibi yapılarak sol kategori panelinin aktif kategorisinin güncellenmesi (`currentVisibleCategoryIndex`)
- [x] Sol kategori barından bir kategori tıklandığında ürün listesinin o kategorinin başlık çizgisine kaydırılması (`animateScrollToItem`)
- [x] `ProductDetailSheet`'in (Seçenekler Çekmecesi) `cartDockY` parametresi alarak sepet topunu dikeyde merkezleyecek şekilde (`offset` ve `onGloballyPositioned` ile) konumlandırılması
- [x] `ProductDetailSheet` arayüzünün web paritesine uygun olarak beyaz zemin, koyu gri/siyah metinler ve mor accent rengiyle yeniden tasarlanması, yüksekliğinin dinamik yapılması (`wrapContentHeight()`)

## Kiosk Tablet Screen (`KioskTabletScreen.kt`)
- [x] Kök Box üzerindeki genel dokunma takip mekanizmasının kaldırılması
- [x] `CartFab` sepet topuna `detectVerticalDragGestures` entegre edilmesi
- [x] Ürünlerin sürekli akması için kategori başlıkları ve ürünleri birleştiren düz listeye (`flatGridItems`) geçilmesi
- [x] Kategori başlıkları için `CategoryHeaderRow` eklenmesi ve listelemelerin güncellenmesi
- [x] Scroll takibiyle sol kategori panelinin aktif kategorisinin güncellenmesi
- [x] Sol kategori barından bir kategori tıklandığında ürün listesinin o kategori çizgisine kaydırılması
- [x] `ProductDetailSheet`'in (Seçenekler Çekmecesi) `cartDockY` parametresi alarak sepet topunu dikeyde merkezleyecek şekilde konumlandırılması
- [x] `ProductDetailSheet` arayüzünün web paritesine uygun olarak beyaz zemin, koyu gri/siyah metinler ve mor accent rengiyle yeniden tasarlanması, yüksekliğinin dinamik yapılması

## Derleme, Test ve Entegrasyon
- [x] Gradle derleme testi yapılması (`.\gradlew.bat assembleDebug`)
- [ ] Üretilen APK'nın NoxPlayer emülatörüne yüklenmesi
- [ ] Yapılan tüm değişikliklerin `walkthrough.md` ve `OperationSync.md` dosyalarına işlenmesi
