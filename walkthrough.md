# Walkthrough - Gereksiz Otomatik Yenilemelerin Kaldırılması ve Egress Optimizasyonu

Railway veri çıkış (egress) kullanımını azaltmak amacıyla, arka planda otomatik çalışan veritabanı dinleyicileri (Supabase Realtime) ve periyodik sorgu döngüleri (polling) tüm kritik ekranlardan kaldırılmış, yerlerine estetik ve modern manuel **Yenile** butonları eklenmiştir.

## Yapılan Değişiklikler

### 1. KDS & Pickup Ekranları
- [KDS.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/KDS.jsx) ve [PickupScreen.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/PickupScreen.jsx) dosyalarındaki Supabase Realtime aboneliği (`db.channel`) ve 5-10 saniyelik `setInterval` sorguları tamamen kaldırıldı.
- Bu ekranlarda halihazırda manuel yenileme butonları bulunduğu için ek bir buton ihtiyacı olmamıştır.

### 2. Sıra Takip Ekranı (QueueScreen)
- [QueueScreen.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/QueueScreen.jsx) dosyasındaki otomatik veri dinleme / yenileme döngüsü kaldırıldı.
- Sağ üst köşede bulunan saat göstergesinin hemen yanına, genel temayla uyumlu, şık bir manuel **Yenile** butonu yerleştirildi.

### 3. Garson Paneli (Garson)
- [Garson.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/Garson.jsx) dosyasındaki açık adisyonları ve masa isteklerini periyodik olarak sorgulayan `setInterval` döngüleri devre dışı bırakıldı.
- Sol taraftaki şube başlığının yanına estetik bir manuel **Yenile** butonu eklendi.

### 4. Mobil Garson (MobileAppShells)
- [MobileAppShells.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/MobileAppShells.jsx) içindeki `MobileGarsonRuntime` bileşeninde `MOBILE_GARSON_POLL_MS` periyodu kaldırıldı.
- `refreshTrigger` state yönetimi entegre edilerek, header kısmında çıkış butonunun hemen yanına göze hoş gelen sky-blue renk tonlarında manuel **Yenile** butonu yerleştirildi.

### 5. POS Ekranı (POS)
- [POS.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/POS.jsx) dosyasındaki otomatik sipariş yükleme döngüsü (10s) ve sadakat (loyalty) kampanyaları cache yenileme döngüsü kaldırıldı.
- Kullanıcı işlemiyle tetiklenen loyalty QR modalındaki 2.5 saniyelik sorgulama döngüsüne `if (document.hidden) return;` kontrolü eklenerek sekme arka plandayken sorgu atılması önlendi.

### 6. Kiosk Ekranları (KioskBig & KioskTablet)
- [KioskBig.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/KioskBig.jsx) ve [KioskTablet.jsx](file:///C:/RMSggl/Dropbox/RMSv3/src/components/pages/KioskTablet.jsx) dosyalarındaki sadakat QR eşleştirme oturum süresi (`timeoutSec`) test ortamı gereksinimlerine uygun olarak **24 saate (86400 saniye)** çıkarıldı.
- Oturum zaman aşımına uğradığında veya başarısız olduğunda QR kod görselini temizleyip yeni oturum açma döngüsünü tetikleyen (`useEffect` içindeki sonsuz döngü) mekanizma devre dışı bırakıldı. QR kod ilk yüklendiği haliyle kalır ve tekrar tekrar oturum açma isteği göndermez.
- Kiosk ayarlarını sorgulayan arka plan döngü periyodu **10 saniyeden 30 saniyeye** çıkarıldı ve hem bu döngüye hem de sadakat eşleşme polling'ine `if (document.hidden) return;` koruması eklendi.

---

## Doğrulama ve Derleme

- Değişikliklerin kod bütünlüğünü bozmadığından emin olmak için yerel ortamda derleme kontrolü yapılmıştır:
  ```powershell
  npm run build
  ```
- **Sonuç**: Derleme işlemi başarıyla tamamlanmıştır (`built in 53.73s`). Herhangi bir linter veya derleme hatası tespit edilmemiştir.
