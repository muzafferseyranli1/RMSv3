# Kiosk Android — Faz 1 Görev Listesi

## Faz 1: Proje İskeleti + Eşleme Ekranı ✅ TAMAMLANDI

- [x] kiosk-android/ Gradle proje yapısı oluştur
  - [x] settings.gradle.kts
  - [x] build.gradle.kts (proje seviyesi)
  - [x] gradle.properties
  - [x] gradle/libs.versions.toml
  - [x] app/build.gradle.kts
  - [x] AndroidManifest.xml (lockdown flags dahil)
- [x] Temel Kotlin dosyaları
  - [x] KioskApplication.kt
  - [x] MainActivity.kt (immersive mode + lockdown)
  - [x] data/model/KioskMode.kt
  - [x] data/model/PairingResult.kt
  - [x] prefs/KioskPrefs.kt
  - [x] data/ApiService.kt (Retrofit)
  - [x] data/KioskRepository.kt (pos_terminals sorgusu)
  - [x] ui/setup/PairingViewModel.kt
  - [x] ui/setup/PairingScreen.kt
  - [x] ui/theme/Theme.kt
  - [x] ui/bigscreen/KioskBigScreen.kt (placeholder)
  - [x] ui/tablet/KioskTabletScreen.kt (placeholder)
- [x] res/ dosyaları
  - [x] strings.xml
  - [x] themes.xml
  - [x] mipmap/ (personel-android'den kopyalandı)
- [x] gradlew / gradlew.bat kopyalandı
- [x] Derleme doğrulama: BUILD SUCCESSFUL — app-debug.apk (19.9 MB)

## Faz 2: Veri Katmanı ✅ TAMAMLANDI

- [x] Model sınıfları
  - [x] SaleCategory.kt
  - [x] SaleItem.kt (channel_prices, channel_image yardımcıları dahil)
  - [x] OptionGroup.kt + ItemOption.kt
  - [x] CartItem.kt + SelectedOption.kt
  - [x] SalesChannel.kt
  - [x] OperatingHoursRule.kt + TerminalOperatingRule.kt
  - [x] OrderPayload.kt (OrderHeader + OrderLine + OrderPayment)
  - [x] MenuData.kt (MenuLoadState + OrderSubmitState sealed classes)
- [x] KioskRepository.kt genişletildi
  - [x] loadMenuData() — kategoriler, ürünler, kanal, option groups, çalışma saati
  - [x] loadKioskSettingsJson() — settings.key=kiosk_settings_v2
  - [x] getNextDisplayNo() — bugünkü max kiosk_display_no + 1
  - [x] submitOrder() — sales + sale_lines + sale_payments insert
- [x] KioskDataViewModel.kt oluşturuldu
  - [x] Menü yükleme (menuState flow)
  - [x] Kategori seçimi (selectedCategoryId)
  - [x] Sepet yönetimi (addToCart, increase/decrease/remove, clearCart)
  - [x] Sipariş gönderme (submitOrder → orderState flow)
  - [x] Çalışma saati hesaplama (terminal + şube kuralları)
- [x] BigScreen + Tablet placeholder'lar ViewModel ile güncellendi
- [x] Derleme doğrulama: BUILD SUCCESSFUL

