---
name: mobile-webapp
description: SuitableRMS v3 icinde mobil-first webapp, telefon arayuzu, tablet dokunmatik yuzey, mobil POS, Garson, Kiosk, KDS, Pickup, Queue veya native-app hissi isteyen ekranlar icin kullan. Use when Codex builds or revises a mobile or touch-first experience in this repo, especially React/Vite screens under src/components/pages and src/components/pos, not just standalone HTML prototypes. The goal is a real operational mobile surface that obeys SuitableRMS governance, design handbook, DB-first, auth-bypass, workspace and branch-scoping rules.
---

# SuitableRMS Mobile Webapp Skill

Bu skill SuitableRMS v3 icinde mobil webapp ve dokunmatik operasyon
yuzeyleri uretmek icin kullanilir.

Ana hedef: mobilde guzel gorunen bir demo degil, dokunmatik cihazda gercekten
calisan operasyon yuzeyi uretmek.

## Oncelik Sirasi

1. `SUITABLERMS_PROJECT_GOVERNANCE.md`
2. `OperationSync.md`
3. `DESIGN_HANDBOOK_V3_TR.md`
4. Mevcut React/Vite kodu ve aktif route davranisi
5. Mobil ergonomi ve native-app hissi
6. Gorsel susleme

Bir kural catistiginda:

- teknik ve veri gercegi icin governance kazanir
- ekran davranisi ve gorsel sistem icin design handbook kazanir

## Zorunlu Ilk Okuma

Mobil UI veya simulator benzeri ekran isi baslamadan once ilgili kisimlari oku:

- `SUITABLERMS_PROJECT_GOVERNANCE.md`
- `OperationSync.md`
- `DESIGN_HANDBOOK_V3_TR.md`
- `README.md`
- `src/App.jsx`
- `src/index.css`
- `src/context/WorkspaceContext.jsx`
- `src/context/AuthContext.jsx`
- `src/lib/displayMode.js`
- `src/lib/publicDisplayRoutes.js`

Hedef ekran ailesine gore bunlardan uygun olanlari da oku:

- `src/components/pos/UnifiedPosStaffScreen.jsx`
- `src/components/pos/StaffPinGate.jsx`
- `src/components/pos/ScreenFrame.jsx`
- `src/lib/posStaffAuth.js`
- `src/lib/kioskSettings.js`
- `src/components/pages/POS.jsx`
- `src/components/pages/Garson.jsx`
- `src/components/pages/KioskBig.jsx`
- `src/components/pages/KioskTablet.jsx`
- `src/components/pages/KDS.jsx`
- `src/components/pages/PickupScreen.jsx`
- `src/components/pages/QueueScreen.jsx`
- `src/components/pages/KioskManagementDesktop.jsx`
- `src/components/pages/LoyaltyMobileAppManagement.jsx`
- `src/components/pages/DesignDemo.jsx`

Hedef ekran baska bir moduldeyse once o modulun mevcut component, css-benzeri
inline style kaliplari, repository ve runtime dosyalarini bul.

## Proje Gercegi

- Bu repo React + Vite tabanlidir.
- Kanonik route haritasi `src/App.jsx` icindedir; `routeRegistry.js` yoktur.
- Global tema ve ortak UI tokenlari `src/index.css` icindedir; `App.css` yoktur.
- Auth bypass modundadir; login akisi tasarlama.
- Personel kimligi gerekiyorsa PIN tabanli ekran baglamini kullan.
- Kalici is verisi icin DB-first kural gecerlidir; `src/lib/db.js` disinda yeni
  authority katmani uretme.
- Public display ekranlari sidebar veya admin-shell varsayimi ile kurulmaz.

## Ekran Siniflari

Isin basinda ekrani bu siniflardan birine koy:

- `POS-Critical`: POS, Garson, Kiosk, KDS, Pickup, Queue, hizli operasyon
- `Admin-Flex`: master data, ayar, rapor, stok, fiyat, personel yonetimi
- `Mobile Public Display`: kiosk/public/mobile-app/public loyalty yuzeyleri
- `Mobile Task/Workflow`: gorev, checklist, onay, vardiya, saha akisi

Siniflandirma `DESIGN_HANDBOOK_V3_TR.md` ile uyumlu olmalidir.

## Uygulama Kurallari

- Varsayilan cikti mevcut uygulama icinde React component veya stil
  degisikligidir.
- Standalone tek HTML yalniz kullanici acikca prototip, mockup veya tek dosya
  demo isterse uretilir.
- Mevcut route, context, workspace, branch ve display mode yapilarini koru.
- Public display route davranislarini `src/lib/publicDisplayRoutes.js`
  ile uyumlu tut.
- `src/App.jsx` icindeki mevcut public ekran / admin shell ayrimini bozma.
- Gerekmedikce yeni state authority olusturma; kalicilik gerekiyorsa mevcut
  DB-first yolunu kullan.
- Turkce arayuz metinlerinde Turkce karakterleri dogru yaz.

## Workspace ve Branch Kurallari

- Admin ve branch-aware ekranlar `WorkspaceProvider`, `WorkspaceGate` ve
  gerekirse `WorkspaceBranchScope` mantigina uyar.
- Sube baglami gereken bir ekrani baglamsiz calisiyormus gibi gostermeye
  calisma.
- Public display ekranlari icin workspace picker zorlamasi uretme.
- PIN oturumu gereken yuzeylerde mevcut `posStaffAuth` akisini veya
  `UnifiedPosStaffScreen` / `StaffPinGate` kalibini koru.

## Mobil UX Kurallari

- Oncelikli viewportlar: `375x812`, `390x844`, `430x932`.
- Ana dokunma hedefleri en az `44px` olur.
- Alt bolgedeki ana aksiyonlar basparmak erisimine gore konumlanir.
- Yatay scroll ancak bilincli chip, tab veya dar yardimci satirlar icin kabul
  edilir.
- Ana is akisi yatay scroll istemez.
- Uzun Turkce metinler ve rakamsal veriler tasma yapmamalidir.
- Mobilde ilk ekranda ana gorev anlasilmalidir.

## Gorsel Dil

- SuitableRMS v3 kimligi korunur: siyah sidebar, amber accent, temiz icerik
  alani, light/dark tokenlari.
- Public display yuzeyleri sidebar kullanmasa bile ayni semantik renk mantigini
  korur.
- Purple-on-white veya rastgele yeni renk dili uretme.
- Kartlari yalniz gercek bilgi birimi icin kullan; dekoratif kart istifi kurma.
- `src/index.css` icindeki tokenlar ve handbook kararlarina aykiri yeni temel
  renk sistemi icat etme.

## Display Mode Kurallari

- `src/lib/displayMode.js` ve `src/index.css` icindeki `data-display-mode`
  mantigini bozma.
- `4:3 Safe` modda ana akisi koru; dar cihaz icin tabloyu zorla karta
  cevirmeye kalkma.
- `Wide` mod ekstra nefes alani icindir; yeni ana akis kurma araci degildir.

## POS-Critical Kurallari

- POS, Garson, Kiosk, KDS, Pickup ve Queue ekranlari backoffice referansi
  olarak kullanilmaz.
- Bu ekranlarda operasyonel hiz, okunabilirlik ve dokunmatik netlik estetigin
  onune gecer.
- `ScreenFrame` ile acilan ekranlarda sabit cerceve davranisini bozma.
- Durum, bilet, siparis veya sira bilgisi varsa ilk bakista okunur olmalidir.

## Mobile Public Display Kurallari

- `kiosk`, `kiosk-big`, `kiosk-tablet`, `kds`, `pickup`, `queue`,
  `mobil-app` ve ilgili public path'ler public display ailesidir.
- Bu yuzeylerde admin sidebar, workspace picker veya gereksiz yonetim chrome'u
  ekleme.
- Ekranda birincil durum, ana aksiyon ve bekleyen karar ilk bakista
  gorulebilmelidir.
- Calismayan sahte kontrol koyma.

## Mobile Task ve Admin Kurallari

- Liste once gelir, sonra detay veya sheet acilir.
- Arama, filtre ve ana commit aksiyonu net kalir.
- Yardimci aksiyonlar kompakt tutulur.
- Uzun formlar sheet, modal veya adimli akis ile bolunur; ekrani dar mobil
  yuzeyde tasirma.

## React Uygulama Kaliplari

- Dosyalari mevcut module yakin tut:
  - ekranlar icin `src/components/pages/*`
  - ortak operasyon parcalari icin `src/components/pos/*`
  - paylasilan mantik icin `src/lib/*` veya `src/context/*`
- Runtime veya veri hesaplari mevcut `lib` dosyalarinda varsa UI icinde yeniden
  yazma.
- Inline style kullanimi bu repoda yaygin; mevcut dosyanin stil diline uy.
- Yeni route gerekiyorsa `src/App.jsx` icinde mevcut shell ayrimina uygun ekle.
- Public ekran icin route ekliyorsan `isPublicDisplayPath` ile uyumu kontrol et.

## Standalone Prototype Istendiginde

Kullanici acikca tek dosya demo veya mockup isterse tek HTML uretebilirsin.
Bu varsayilan akis degildir.

Yine de:

- Gercek SuitableRMS akislarini temsil et
- En az 3 calisan interaction koy
- Sahte veri oldugunu finalde belirt
- Sonradan React'e tasinabilir parcalara ayir

## QA Zorunlulugu

Kod degisikliginden sonra mumkun oldugunda:

- `npm.cmd run build`
- gerekiyorsa hedef route'u gorerek mobil viewport kontrolu

Kontrol listesi:

- yatay overflow yok
- ana kontroller tiklanabilir
- bottom action alanlari icerigi kapatmiyor
- public ekranlarda admin chrome yok
- workspace / branch davranisi bozulmadi
- text overlap yok
- loading / empty / error durumlari okunabilir
- `375x812`, `390x844`, `430x932` gorunumleri guvenli

QA yapilamadiysa finalde acikca soyle.

## Stop Durumlari

Asagidaki durumlarda tamamlandi deme:

- UI calisiyor gorunuyor ama kontrol event'i yoksa
- public display yuzeyi admin sayfasi gibi gorunuyorsa
- branch baglami gereken ekran baglamsiz taklit veri ile calisiyorsa
- kayit veya kalicilik iddiasi var ama DB-first readback yoksa
- mobil viewportta ana aksiyon nav veya klavye altinda kaliyorsa
- ekran desktop'tan kucultulmus gibi duruyorsa
- `src/App.jsx` route gercegi ile uyumsuz dosya veya path referansi yazildiysa

Bu durumlarda once blocker veya eksik QA raporu ver, sonra gerekirse duzelt.
