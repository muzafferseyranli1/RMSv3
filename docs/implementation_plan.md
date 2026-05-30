# Kiosk Görsel Yükleme Optimizasyonu (Base64'ten Storage'a Geçiş)

Evet, harika bir tespit! Railway'de halihazırda bağlı olan `rms-api-volume` kalıcı disk alanı (`/app/uploads` klasörüne bağlı) Kiosk modülü için biçilmiş kaftandır. 

Kiosk Management modülündeki sorunun kaynağı; mevcut yapıda yüklenen görsellerin `Base64` metinlerine dönüştürülüp `JSONB` veritabanı satırına sıkıştırılmasıdır. Bu devasa veri yapısı lokal ortamda 10MB limitli Express sunucusundan geçerken, canlı (production) ortamda Railway'in ağ koruma limitlerine (yaklaşık 1MB) takılarak reddedilmekte; bu sebeple tarayıcı önbelleğinde görünen görseller canlı veritabanına hiç gitmemektedir.

## User Review Required

> [!IMPORTANT]
> Railway'deki kalıcı alanınızı kullanarak Base64 metin yükünü tamamen ortadan kaldıracağım. Mevcut görsellerin çalışmaya devam etmesi için geriye dönük uyumluluğu koruyacağım, yeni yüklenen görseller ise otomatik olarak `rms-api-volume`'a yüklenecek ve URL olarak saklanacak. Onaylıyor musunuz?

## Proposed Changes

### 1. Kiosk Görsel Yükleme Mekanizmasının Değiştirilmesi
Kiosk modülünde çalışan `UploadField` bileşeninin içindeki `readFileAsDataUrl` (Base64) mantığı `uploadFileAndGetUrl` (Storage Yükleme) fonksiyonu ile değiştirilecek. 

Görseller lokalde yine HTML5 Canvas yardımıyla `WebP` formatına çevrilip optimize edilecek, ancak bu sefer Base64 metne dönüşmek yerine doğrudan `/api/upload` servisine (sizin `rms-api-volume` diskinize) yüklenecektir.

### [MODIFY] [KioskManagementDesktop.jsx](file:///c:/RMSv3/src/components/pages/KioskManagementDesktop.jsx)
- `import { uploadApiFile, buildApiUrl } from '@/lib/db'` eklenecek.
- `readFileAsDataUrl` adlı eski fonksiyon, Canvas optimizasyonunu koruyacak şekilde `uploadFileAndGetUrl` olarak güncellenecek.
- Optimize edilen görsel (veya videolar) FormData ile API'ye yüklenecek.
- API'den dönen dosya URL'si, `buildApiUrl` fonksiyonu ile mutlak (absolute) adrese (`https://rms-api-production.../api/files/...`) çevrilerek veritabanına kaydedilecek.

## Verification Plan
1. Güncelleme sonrası `KioskManagementDesktop` üzerinde örnek bir banner veya karşılama görseli yüklenecek.
2. Sistemin Base64 yerine `https://rms-api.../api/files/...` URL'si oluşturduğu teyit edilecek.
3. Kiosk ekranlarının (`/kiosk`, `/kiosk-tablet`) bu URL'yi hatasız okuduğu gözlemlenecek.
4. "Kaydet" denildiğinde `Payload Too Large` (büyük boyut) engeline takılmadan veritabanına anında yazıldığı doğrulanacak.
