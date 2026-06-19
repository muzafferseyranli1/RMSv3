# Kiosk Android — Devir Notu (Handout)

**Tarih:** 2026-06-19  
**Proje:** `X:\RMSv3\kiosk-android\`  
**Paket:** `com.suitable.kiosk`  
**Son Build:** DEBUG APK — BUILD SUCCESSFUL ✅

---

## Genel Durum

| Faz | Kapsam | Durum |
|-----|--------|-------|
| Faz 1 | Proje iskeleti + Eşleme ekranı | ✅ TAMAMLANDI |
| Faz 2 | Veri katmanı (modeller, repository, ViewModel) | ✅ TAMAMLANDI |
| Faz 3 | BigScreen UI (Kategori, Ürün Grid, Sepet, Ödeme) | ⏳ BEKLIYOR |
| Faz 4 | Tablet UI | ⏳ BEKLIYOR |
| Faz 5 | Ortak bileşenler (ClosedOverlay, ProductDetail, Payment) | ⏳ BEKLIYOR |
| Faz 6 | PIN / Yeniden eşleme güvenliği | ⏳ BEKLIYOR |

---

## ⚠️ Açık Sorun — Uygulama Çöküyor

Cihazda APK kuruldu, `Kiosk keeps stopping` hatası veriyor.  
Logcat alınamadı (adb bağlantı sorunu).

### Tespit Edilen Asıl Neden

`MainActivity.kt` içinde `KioskDataViewModel` yanlış şekilde oluşturuluyor:

```kotlin
// YANLIŞ — remember{} içinde doğrudan new — lifecycle dışında kalır, crash olur
val dataViewModel = remember(currentMode) {
    if (currentMode != null) KioskDataViewModel(prefs, repository) else null
}

// DOĞRU — viewModel() factory ile oluştur
val dataViewModel: KioskDataViewModel? = if (currentMode != null) {
    viewModel(
        factory = object : ViewModelProvider.Factory {
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                @Suppress("UNCHECKED_CAST")
                return KioskDataViewModel(prefs, repository) as T
            }
        }
    )
} else null
```

Gerekli import'lar:
```kotlin
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.compose.viewModel
```

**Bu düzeltme Faz 3'e başlamadan önce yapılmalı.**

---

## Proje Yapısı

```
X:\RMSv3\kiosk-android\
├── app/src/main/java/com/suitable/kiosk/
│   ├── MainActivity.kt              <- ViewModel factory hatası BURADA
│   ├── KioskApplication.kt
│   ├── data/
│   │   ├── ApiService.kt
│   │   ├── KioskRepository.kt
│   │   └── model/
│   │       ├── KioskMode.kt
│   │       ├── PairingResult.kt
│   │       ├── SaleCategory.kt
│   │       ├── SaleItem.kt
│   │       ├── OptionGroup.kt
│   │       ├── CartItem.kt
│   │       ├── SalesChannel.kt
│   │       ├── OperatingHoursRule.kt
│   │       ├── OrderPayload.kt
│   │       └── MenuData.kt
│   ├── prefs/KioskPrefs.kt
│   └── ui/
│       ├── KioskDataViewModel.kt
│       ├── setup/PairingScreen.kt   <- TAMAMLANDI
│       ├── bigscreen/KioskBigScreen.kt  <- PLACEHOLDER, Faz 3
│       ├── tablet/KioskTabletScreen.kt  <- PLACEHOLDER, Faz 4
│       └── theme/Theme.kt
```

---

## Teknik Kararlar

| Konu | Karar |
|------|-------|
| API | https://rms-api-production-219d.up.railway.app/api/query |
| Odeme | Yalnizca payment_method = 'card' |
| Lockdown | Immersive sticky + FLAG_KEEP_SCREEN_ON |
| Ekran yonu | BigScreen: portrait / Tablet: fullSensor |
| Offline | ClosedOverlay goster (Faz 5) |
| Mod | pos_terminals.terminal_type: kiosk->BIG_SCREEN, kiosk_tablet->TABLET |

---

## Faz 3 Baslangic Sirasi

1. ViewModel factory crash duzeltmesi (yukardaki kod)
2. Build + cihazda test
3. KioskBigScreen.kt tam UI:
   - Sol: Kategori listesi
   - Sag: 3 sutunlu urun grid (Coil resim)
   - Alt bar: Sepet ozeti + Siparis Ver
   - ClosedOverlay (calisma saati disi)
   - Urun detay modal + secenekler
   - Kart odeme onay ekrani

---

## Build Notlari

- gradlew.bat assembleDebug
- Cikti: app\build\outputs\apk\debug\app-debug.apk
- local.properties: sdk.dir=C\:/Users/muzaf/AppData/Local/Android/Sdk
- AGP 9.0, minSdk=26, targetSdk=36
