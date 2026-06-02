# Merkezi Kuver Takibi ve Otomatik Dağıtım Entegrasyonu

Bu plan; işletmelerin kuver takibi yapıp yapmayacağını cihaz yönetimi ekranındaki Ana Kasa (Master) üzerinden yapılandırmasını, bu yapılandırmaya bağlı olarak POS ve Garson terminallerinde kuver ikon setinin dinamik olarak gizlenmesini/gösterilmesini ve kuver takibi kapalıysa her sipariş için belirtilen varsayılan kuver sayısının sabit oranlarla (%40 Kadın, %40 Erkek, %20 Çocuk) veritabanına kaydedilmesini içerir.

## Kullanıcı İncelemesi Gereken Hususlar

> [!IMPORTANT]
> Kuver takibi kapalıyken sipariş başına girilen kuver sayısı (örneğin 1 veya 5), veritabanındaki `female_guest_count`, `male_guest_count` ve `child_guest_count` alanlarının `INTEGER` (tam sayı) kısıtlaması nedeniyle deterministik bir dağıtım algoritmasıyla tam sayılara dönüştürülür. Örneğin, 1 kuver için: 1 Kadın, 0 Erkek, 0 Çocuk; 5 kuver için: 2 Kadın, 2 Erkek, 1 Çocuk kaydedilir.

## Önerilen Değişiklikler

---

### [Veri Yapısı / Ortak Ayarlar]

Genel kuver ayarları veritabanındaki `settings` tablosunda `cover_settings` anahtarı altında JSONB formatında saklanacaktır:
```json
{
  "tracking_enabled": false,
  "default_count": 1
}
```

---

### [Cihaz Yönetimi Ekranı]

#### [MODIFY] [DeviceSettings.jsx](file:///c:/RMSv3/src/components/pages/DeviceSettings.jsx)
- Cihaz düzenleme/oluşturma modalına, düzenlenen cihaz **Ana Kasa (Master)** ise kuver ayarları bölümü eklenecektir.
- "İşletmede kuver takibi yapılacak mı?" checkbox'ı ve bu checkbox seçili değilse "Sipariş Başına Varsayılan Kuver Sayısı" nümerik giriş alanı sunulacaktır.
- Cihaz kaydedilirken bu ayarlar veritabanındaki `settings` tablosunda `cover_settings` anahtarıyla güncellenecektir.

---

### [POS Terminali Uygulaması]

#### [MODIFY] [POS.jsx](file:///c:/RMSv3/src/components/pages/POS.jsx)
- Üst seviyede kuver sayısını Kadın (%40), Erkek (%40) ve Çocuk (%20) olarak tam sayılara dağıtan deterministik `distributeCover(n)` algoritması tanımlanacaktır.
- `cover_settings` ayarları `settings` tablosundan dinamik olarak yüklenecektir.
- Eğer `tracking_enabled` false ise:
  - Sağ paneldeki 3'lü kuver ikon seti (Kadın, Erkek, Çocuk butonları) gizlenecektir.
  - Yeni bir adisyon oluşturulurken veya temizlenirken varsayılan olarak `distributeCover(default_count)` oranları otomatik atanacaktır.
  - `sanitizeOpenTicket` fonksiyonunda bilet yeni oluşturulurken bu dağıtılmış varsayılan kuver oranları atanacaktır.

---

### [Garson (Tablet) Uygulaması]

#### [MODIFY] [Garson.jsx](file:///c:/RMSv3/src/components/pages/Garson.jsx)
- POS.jsx ile paralel olarak `distributeCover(n)` algoritması ve `cover_settings` durumunun yüklenmesi sağlanacaktır.
- Eğer `tracking_enabled` false ise:
  - Adisyon ekranındaki 3'lü kuver ikon seti tamamen gizlenecektir.
  - Yeni adisyon oluşturulurken veya sanitize edilirken otomatik olarak `distributeCover(default_count)` atanacaktır.

---

## Doğrulama Planı

### Otomatik & Manuel Testler
- **Ana Kasa Yapılandırması:** Cihaz yönetimi ekranından Master olan cihaz düzenlenerek "İşletmede kuver takibi yapılacak mı" seçeneği değiştirilecek ve kaydedilecektir.
- **Takip Açıkken:** POS ve Garson uygulamaları yenilenerek sol/sağ menüde kuver ikon setinin geldiği ve elle kuver artırılabildiği gözlemlenecektir.
- **Takip Kapalıyken (Default = 1):** POS ve Garson uygulamalarında ikon setinin gizlendiği doğrulanacaktır. Yeni bir masa siparişi verilip tamamlandığında veritabanında `cover_count: 1`, `female_guest_count: 1`, `male_guest_count: 0`, `child_guest_count: 0` olarak kaydedildiği kontrol edilecektir.
- **Takip Kapalıyken (Default = 5):** Master cihazdan kuver 5 girildiğinde, yeni sipariş kaydında `cover_count: 5`, `female_guest_count: 2`, `male_guest_count: 2`, `child_guest_count: 1` olarak (%40, %40, %20 dağılımla) kaydedildiği doğrulanacaktır.
