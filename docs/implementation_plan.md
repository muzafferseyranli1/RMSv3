# KDS Ekranı PIN Bypass Implementation Plan

KDS (Kitchen Display System), Pickup ve Queue gibi genel gösterim (public display) ekranlarının ilk kurulum / pairing sonrasında veya sayfa yenilemelerinde şube yetkilendirmesi (PIN girişi) istemeden doğrudan kendi ekranlarına açılmasını sağlayacak bypass mekanizmasının tasarımı.

## User Review Required

> [!IMPORTANT]
> Masaüstü uygulamasında (Electron) cihaz eşleştirildikten sonra, uygulama ilk olarak `/` (root) rotasını yükler ve ardından ilgili ekran modunun rotasına (`/kds`, `/pickup` vb.) yönlendirme yapar.
> 
> `/` rotası normal şartlarda bir genel ekran olmadığı için `WorkspaceProvider` tarafından yakalanır ve eğer şube bilgisi henüz yüklenmemişse `WorkspacePickerModal` (Personel PIN ekranı) açılmasına neden olur. Bu durum, KDS gibi PIN gerektirmeyen ekranlarda istenmeyen bir kilit ekranına yol açmaktadır.

> [!TIP]
> Çözüm olarak, `src/lib/publicDisplayRoutes.js` içerisine masaüstü modunu ve eşleşen ekran rolünü algılayan akıllı bir kontrol ekleyeceğiz. Eğer cihaz masaüstü modunda bir KDS, teslimat veya kiosk ekranı olarak mühürlenmişse, başlangıçtaki `/` rotasını da bir genel ekran (public display) olarak sınıflandıracağız. Böylece `WorkspaceGate` ve `WorkspacePickerModal` bu adımı tamamen sessizce atlayacak ve cihaz doğrudan KDS ekranına PIN'siz geçiş yapacaktır.

## Proposed Changes

### Routing & Public Display Validation

#### [MODIFY] [publicDisplayRoutes.js](file:///c:/RMSv3/src/lib/publicDisplayRoutes.js)
- Cihazın masaüstü modunda olup olmadığını (`isDesktopMode`) ve ekran rolünün genel ekran sınıfına girip girmediğini (`getScreenMode`) kontrol eden koşulu ekle.
- Başlangıçtaki `/` rotası için bu koşul sağlandığında `true` döndürerek PIN/Workspace kapılarını bypass et.

---

## Verification Plan

### Automated Tests
- Projenin başarıyla derlendiğini doğrulamak için root dizinde build testi koşulacaktır:
  ```bash
  npm.cmd run build:desktop:web
  ```

### Manual Verification
- Kullanıcı masaüstü uygulamasında (Electron veya tarayıcı simülasyonunda) KDS veya Pickup rolüyle cihazı eşleştirdikten sonra uygulamanın PIN sormadan doğrudan `/kds` sayfasına yönlendiğini gözlemleyecektir.
