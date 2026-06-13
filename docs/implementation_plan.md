# Implementation Plan - Railway Deploy Hatası Çözümü (Postinstall Bypass)

Bu plan, Railway üretim (web) ortamında `npm ci` komutu çalışırken gereksiz yere tetiklenen Electron bağımlılık kurulumunun (`electron-builder install-app-deps`) engellenmesini ve deploy sürecinin başarıyla tamamlanmasını hedefler.

---

## User Review Required

> [!IMPORTANT]
> **Sorunun Nedeni:**
> `package.json` dosyasındaki `"postinstall": "electron-builder install-app-deps"` komutu, `npm ci` (veya `npm install`) sonrasında otomatik çalışmaktadır. 
> Railway build sunucusu (Linux/Nixpacks) Electron masaüstü bağımlılıklarına ihtiyaç duymadığı halde bu komutu çalıştırmakta ve harici paketleri indirmeye çalışırken ağ hataları (got/http-timer timeout) alarak derleme sürecini (exit code 1 ile) durdurmaktadır.
> 
> **Çözüm Yaklaşımı:**
> `"postinstall"` tetikleyicisini doğrudan çalıştırmak yerine, bir ara Node.js scripti (`scripts/postinstall.cjs`) üzerinden çalıştıracağız. Bu script, ortamda `RAILWAY_STATIC_URL` veya `NIXPACKS` değişkenleri (veya `NODE_ENV === 'production'`) varsa Electron kurulum adımını sessizce atlayacak; lokal bilgisayarda ise eskisi gibi normal şekilde kurmaya devam edecektir.

---

## Proposed Changes

### 1. Postinstall Koşullu Scripti

#### [NEW] [postinstall.cjs](file:///c:/RMSv3/scripts/postinstall.cjs)
- Railway veya production ortamı algılandığında postinstall adımını pas geçen, lokalde ise `electron-builder`'ı tetikleyen yeni bir script dosyası oluşturulacaktır.

### 2. Bağımlılık Ayarı

#### [MODIFY] [package.json](file:///c:/RMSv3/package.json)
- `"postinstall"` scripti `"electron-builder install-app-deps"` yerine `"node scripts/postinstall.cjs"` olarak güncellenecektir.

---

## Verification Plan

### Automated Tests
- Lokal terminalde `npm run build` ve `npm install` komutları çalıştırılarak lokalde Electron bağımlılıklarının kurulabildiği ve Vite build sürecinin sorunsuz çalıştığı test edilecektir.
- Railway'e pushlanarak build logları kontrol edilecektir.
