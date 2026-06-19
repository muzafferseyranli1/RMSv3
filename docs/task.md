# Checklist for Implementation Plan Execution

## Compile and Diagnostics
- [x] Fix compile errors in project
  - [x] Inspect and fix compile errors in `MainActivity.kt`
  - [x] Inspect and fix compile errors in `ComboBuilder.kt`
  - [x] Inspect and fix compile errors in `IdleScreen.kt`
  - [x] Inspect and fix compile errors in `KioskBigScreen.kt`
- [x] Successfully run `.\gradlew.bat assembleDebug` with 0 errors

## Faz 4 — Tablet UI (KioskTablet paritesi)
- [ ] Verify or implement `KioskTabletScreen.kt` layout to match `KioskTablet.jsx` split layout (portrait/landscape support)

## Faz 5 — Ortak Bileşenler & Web Paritesi
- [ ] Verify `ComboBuilder.kt` step selection and constraints parsing `combo_menus_v1`
- [ ] Verify `SuggestionManager.kt` popup recommendations
- [ ] Verify `ClosedOverlay.kt` operating hour rules enforcement

## Faz 6 — Güvenlik / PIN Sıfırlama
- [ ] Verify 7-clicks on kiosk logo admin reset functionality
- [ ] Verify `prefs.clearDeviceConfig()` clears state and redirects to pairing

## Verification & Documentation
- [ ] Deploy APK to Nox emulator
- [ ] Verify all flows on emulator
- [ ] Document final walkthrough in `walkthrough.md` and `OperationSync.md`
