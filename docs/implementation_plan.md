# Cihaz Eşleşmesini Kaldırma (Unpairing) ve Wrapper Düzeltmesi Planı

Bu plan, kiosk uygulamasındaki 5 tıklama mantığına benzer evrensel ve gizli bir yöntemle cihaz eşleşmesini güvenli bir şekilde kaldırma işlevini ve bir önceki adımda konuştuğumuz DesktopPosApp sarmalama düzeltmesini içerir.

## Open Questions
- Gizli dokunmatik alanı ekranın sol üst köşesi (top-left) olarak konumlandırdım. Sağ üst veya başka bir köşe tercih ederseniz belirtebilirsiniz.

## Proposed Changes

Tüm 4 ekranda (POS, Garson, KDS, Pickup) ortak çalışması ve ekranların kendi arayüzlerini bozmaması için uygulamanın en tepe katmanına (Shell) görünmez bir tetikleyici (overlay) ekleyeceğiz. Ayrıca eşleşme kaldırma işlemini offline kuyruk kontrolüne bağlayacağız.

### 1. Electron Preload Katmanı (Offline Kuyruk Kontrolü İçin)

#### [MODIFY] desktop/preload.cjs
- Electron ana sürecinde (`main.cjs`) var olan ancak React tarafına aktarılmamış olan `queue:getSize` IPC fonksiyonunu `window.electronAPI.getQueueSize` olarak erişilebilir hale getireceğiz.

### 2. Ortak Gizli Tetikleyici ve Modal (Yeni Bileşen)

#### [NEW] src/components/pos/GlobalUnpairGesture.jsx
- Ekranın sol üst köşesine 60x60 piksellik görünmez (transparent) sabit bir alan ekler.
- Bu alana 3 saniye içinde arka arkaya 5 kez tıklandığında/dokunulduğunda "Cihaz Eşleşmesini Kaldır" modalını açar.
- Modal açıldığında `getQueueSize()` fonksiyonu ile bekleyen offline işlem sayısını kontrol eder.
- **Güvenlik Kriteri:** Kuyruk `> 0` ise *"Senkronize edilmemiş [X] adet kayıt bulunuyor. Lütfen bağlantı sağlanana kadar eşleşmeyi kaldırmayın."* uyarısı verir ve işlemi bloklar.
- Kuyruk `0` ise işlemi onaylatır, `saveTerminalConfig(null)` ile kimliği siler ve sayfayı yenileyerek cihazı eşleştirme (`PairingScreen`) ekranına düşürür.

### 3. Ana Uygulama Kabuğunun (DesktopPosApp) Düzenlenmesi

#### [MODIFY] src/DesktopPosApp.jsx
- Bir önceki adımda bahsettiğimiz hatayı çözmek için `PairingGuard` bileşenini dışarı, `WorkspaceProvider` bileşenini ise onun içine alarak sarmalama (wrapper) hatasını düzelteceğiz.
- Yeni oluşturduğumuz `GlobalUnpairGesture` bileşenini `DesktopPosShell` içerisine (veya App'in ortak ana katmanına) ekleyerek, cihazın hangi ekranda (POS, Garson, KDS vs.) olduğuna bakılmaksızın gizli unpair tuşunun her zaman çalışmasını sağlayacağız.

## Verification Plan

- Electron preload fonksiyonunun masaüstünde doğru çalışıp çevrimdışı işlem sayısını verebildiği doğrulanacak.
- Sol üst köşeye 5 kere hızlıca tıklanıldığında modalın sorunsuz açıldığı test edilecek.
- Eşleşme kaldırma tetiklendiğinde uygulamanın `PairingScreen` ekranına başarılı şekilde döndüğü kontrol edilecek.
- Verilen onay sonrasında bu adımlar kodlanacaktır.
