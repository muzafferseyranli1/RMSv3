# Railway Egress Tüketimini Düşürme ve Polling Optimizasyonu Planı

Bu plan, Railway üzerinde yayında olan ve aktif olarak kullanılmadığında bile yüksek ağ egres trafiği (213 GB+) üreten geliştirme/test aşamasındaki projenin ağ trafiğini optimize etmeyi amaçlamaktadır. 

Kullanıcı geri bildirimi doğrultusunda, tüm otomatik arka plan sorgularını (`setInterval`), polling işlemlerini ve Supabase Realtime bağlantılarını (`db.channel(...)`) tamamen kaldırarak, ekranlara kullanıcı tarafından tetiklenebilecek şık manuel "Yenile" (Refresh) butonları yerleştireceğiz.

Kiosk ekranlarında ise test ortamına uygun şekilde QR kod oturumunun süresini 24 saate (86400 saniye) çıkaracak ve oturum sonlandığında otomatik olarak sonsuz döngüyle yeni QR üretilmesini engelleyeceğiz.

## User Review Required

> [!IMPORTANT]
> Yapılacak değişikliklerle tüm ekranlardan (KDS, Pickup, Queue, Garson, Mobil Garson ve POS) otomatik yenilemeler kaldırılacak ve veri güncellemeleri yalnızca manuel "Yenile" butonları ile yapılacaktır.
> Kiosk için QR kodunun yenilenme döngüsü kapatılacak, QR kod ilk açılışta bir kez üretilecektir.

## Open Questions

Herhangi bir açık soru bulunmamaktadır.

---

## Proposed Changes

### 1. Otomatik Güncellemelerin ve Realtime Bağlantıların Kaldırılması & Manuel Yenileme Butonları

#### [MODIFY] [KDS.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/KDS.jsx)
- Supabase Realtime aboneliğini (`db.channel('kds-...')`) tamamen kaldıracağız.
- Siparişlerin otomatik çekilmesini sağlayan `setInterval` döngüsünü tamamen kaldıracağız.
- Halihazırda var olan manuel yenileme butonunun işlevini koruyacağız.

#### [MODIFY] [PickupScreen.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/PickupScreen.jsx)
- Supabase Realtime aboneliğini (`db.channel('pickup-...')`) tamamen kaldıracağız.
- `setInterval` otomatik yenileme döngüsünü tamamen kaldıracağız.
- Halihazırda var olan manuel yenileme butonunun işlevini koruyacağız.

#### [MODIFY] [QueueScreen.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/QueueScreen.jsx)
- Supabase Realtime aboneliğini (`db.channel('queue-...')`) tamamen kaldıracağız.
- `setInterval` otomatik yenileme döngüsünü tamamen kaldıracağız.
- Ekranın sağ üst köşesine (saat bilgisinin yanına) şık bir manuel "Yenile" butonu ekleyeceğiz.

#### [MODIFY] [Garson.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/Garson.jsx)
- Masa adisyonlarını sorgulayan `OPEN_TICKET_POLL_MS` interval döngüsünü tamamen kaldıracağız.
- Masa isteklerini sorgulayan `TABLE_REQUEST_POLL_MS` interval döngüsünü tamamen kaldıracağız.
- Sol taraftaki şube başlığının yanına bir "Yenile" butonu ekleyeceğiz. Bu buton tıklandığında masa düzenini, adisyonları ve masa isteklerini veritabanından güncelleyecektir (`handleManualRefresh` callback).

#### [MODIFY] [MobileAppShells.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/MobileAppShells.jsx)
- Mobil garson ekranındaki `MOBILE_GARSON_POLL_MS` interval döngüsünü tamamen kaldıracağız.
- `MobileGarsonRuntime` bileşeni için bir `refreshTrigger` state'i tanımlayarak, bu state değiştiğinde `useEffect` içindeki `hydrateRuntime()` fonksiyonunun yeniden çalışmasını sağlayacağız.
- Mobil ekranın sağ üstündeki çıkış butonunun soluna şık bir "Yenile" butonu ekleyeceğiz.

#### [MODIFY] [POS.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/POS.jsx)
- Siparişlerin otomatik çekilmesini sağlayan `setInterval` döngüsünü (10 saniye) tamamen kaldıracağız.
- Kampanyaların periyodik olarak yenilenmesini sağlayan `setInterval` döngüsünü (`RUNTIME_LOYALTY_CACHE_TTL_MS`) kaldıracağız.
- Kullanıcı işlemiyle tetiklenen loyalty QR modalındaki 2.5 saniyelik sorgulama döngüsüne `if (document.hidden) return;` kontrolü ekleyeceğiz.

#### [MODIFY] [CallCenter.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/CallCenter.jsx)
- Halihazırda var olan manuel yenileme butonunun (`loadBase`) işlevini koruyacağız. Otomatik güncelleme bulunmadığı doğrulanmıştır.

---

### 2. Kiosk Ekranlarındaki QR Kod Sonsuz Döngüsünün Kapatılması

Kiosk boştayken (`screen === 'idle'`) oluşturulan QR kodun sürekli yenilenmesine test ortamında gerek yoktur. 24 saatlik bir timeout vererek QR kodun gün boyunca geçerli kalmasını sağlayacağız. Polling sırasında oturum sonlanırsa, yeni bir QR oluşturulmasını tetiklemeyerek döngüyü kıracağız.

#### [MODIFY] [KioskBig.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/KioskBig.jsx)
- Sadakat QR oturumu oluşturulurken `timeoutSec` değerini `86400` (24 saat) yapacağız.
- `startLoyaltyPolling` döngüsündeki `if (!next)` hata kontrolü içinde `setIdleLoyaltyQrUrl('')` temizleme işlemini kaldıracağız; böylece QR kodu ekrandan kaybolmayacak ve useEffect bağımlılığı tetiklenerek sonsuz döngüyle yeni QR üretilmeyecektir.
- Polling döngüsünün içine `if (document.hidden) return;` ekleyeceğiz.
- Genel kiosk ayarlarını yenileyen `refreshRuntimeConfig` interval süresini 10 saniyeden `30000` (30 saniye) değerine çıkarıp `if (document.hidden) return;` ekleyeceğiz.

#### [MODIFY] [KioskTablet.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/KioskTablet.jsx)
- `KioskBig.jsx` dosyasında yapılan tüm optimizasyonların (timeout değerinin 86400'e çıkarılması, state temizlemesinin kaldırılması, hidden kontrolü ve config yenileme süresinin 30 saniyeye çekilmesi) aynısını uygulayacağız.

---

## Verification Plan

### Automated Tests
- Projenin başarıyla derlendiğinden emin olmak için lokal build komutunu çalıştıracağız:
  ```powershell
  npm run build
  ```

### Manual Verification
- Değişiklikler yapıldıktan sonra yerel sunucuyu (`npm run dev`) başlatıp Chrome DevTools Network sekmesini açarak:
  1. Sekme inaktif/arka plandayken hiçbir Kiosk veya POS/Garson ekranının ağ trafiği oluşturmadığını doğrulayacağız.
  2. Yeni manuel yenileme butonlarının verileri başarıyla getirdiğini kontrol edeceğiz.
  3. Kiosk boştayken oluşturulan QR oturumunun arka planda sonsuz döngüye girmediğini teyit edeceğiz.
