# SuitableRMS Kiosk Native Android Uygulaması — Revize İmplementasyon Planı

## Genel Açıklama

Mevcut web tabanlı `KioskBig.jsx` (dikey büyük TV) ve `KioskTablet.jsx` (yatay/dikey tablet) ekranlarının arayüz tasarımı, akışı ve tüm işlevleri (sadakat entegrasyonu, öneriler, combo menüler) korunarak **native Android uygulaması** olarak tamamlanması hedeflenmektedir. Web tarafındaki kullanıcı deneyiminden memnun olunduğu için native tarafında tamamen farklı bir tasarıma gidilmeyecek, web paritesi birebir korunacaktır.

Uygulama `X:\RMSv3\kiosk-android\` klasöründe yer almaktadır ve bağımsız bir Gradle projesidir.

---

## Yol Haritası ve Mevcut Durum

| Faz | Kapsam | Durum | Açıklama |
|-----|--------|-------|----------|
| **Faz 1** | Proje iskeleti + Eşleme ekranı | ✅ TAMAMLANDI | Cihaz eşleme ekranı, veritabanı kolon paritesi (`activation_code`, `device_type`, `terminal_name`) tamamlandı. |
| **Faz 2** | Veri katmanı (Retrofit/Gson) | ✅ TAMAMLANDI | `channel_prices` verisinin dizi (JSON Array) olarak okunması ve fiyat hesaplama hatası düzeltildi. |
| **Faz 3** | BigScreen UI (KioskBig paritesi) | ✅ TAMAMLANDI | Sol kategori paneli, 3 sütunlu ürün gridi (Coil görsel çözücü ile), yüzen sepet topu, sepet detayları ve kartlı ödeme akışı tamamlandı. |
| **Faz 4** | Tablet UI (KioskTablet paritesi) | ⏳ BEKLİYOR | Yatay (split layout) ve dikey mod desteği, sepet paneli entegrasyonu. |
| **Faz 5** | Ortak Bileşenler & Arayüz Paritesi | ⏳ BEKLİYOR | Combo menü oluşturucu (ComboBuilder), öneri motoru (checkout & ürün önerileri), closed overlay ve sadakat QR entegrasyonu. |
| **Faz 6** | Güvenlik / PIN Sıfırlama | ⏳ BEKLİYOR | Logo 7 kez tıklama, admin PIN doğrulama ve SharedPreferences temizleme akışı. |

---

## Planlanan Geliştirmeler (Kalan Aşamalar)

### Faz 4 — Tablet UI (KioskTablet paritesi)
#### [MODIFY] [KioskTabletScreen.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/ui/tablet/KioskTabletScreen.kt)
- Mevcut yer tutucu ekran kaldırılarak web `KioskTablet.jsx` paritesinde arayüz geliştirilecektir.
- **Yönelim Desteği (Orientation):** Cihaz yatayda iken sol tarafta dar kategori şeridi, ortada ürün gridi ve sağ tarafta sürekli açık sepet paneli (split layout) yer alacaktır. Cihaz dikeyde iken ise kategori listesi ve ürün gridi tam ekran olacak, sepet alt bar veya FAB ile açılacaktır.

---

### Faz 5 — Ortak Bileşenler & Web Paritesi
#### [NEW] [ComboBuilder.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/ui/shared/ComboBuilder.kt)
- Web'deki Combo menü seçici mantığının native Compose portu. Seçili combo menü (örn. Hamburger Menü) için alt adımların (içecek seçimi, sos seçimi vb.) adım adım kullanıcıya sorulmasını sağlayan modal ekran.
- Seçimlerin zorunluluk/miktar kuralları webdeki `combo_menus_v1` ayarlarına göre kontrol edilecektir.

#### [NEW] [SuggestionManager.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/ui/shared/SuggestionManager.kt)
- Sepete ürün eklerken (ürün önerisi) ve ödemeye geçişte (checkout önerisi) settings'deki kurallara göre popup öneri pencerelerinin gösterilmesi sağlanacaktır.

#### [NEW] [ClosedOverlay.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/ui/shared/ClosedOverlay.kt)
- `kiosk_operating_hours_rules` tablosundan okunan çalışma saatleri dışında kiosk sipariş alımını kapatan ve ekranda kapalı mesajı ile geri sayım gösteren katman.

---

### Faz 6 — Güvenlik / PIN Sıfırlama
#### [MODIFY] [MainActivity.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/MainActivity.kt)
- Sol üstteki KIOSK logosuna 7 kez hızlı tıklandığında açılacak şifreli sıfırlama ekranı.
- Şifre (admin PIN) doğrulandığında `prefs.clearDeviceConfig()` çalıştırılarak cihazın tüm eşleme bilgileri temizlenecek ve uygulama PairingScreen'e yönlendirilecektir.

---

## Verifikasyon Planı

### Otomatik Testler
- Uygulamanın derleme testi: `./gradlew.bat assembleDebug` (hata sıfır olmalıdır).

### Manuel Testler
- **Tablet Modu Testi**: Emülatör landscape moduna alınarak split-layout görünümü ve sepet işlemleri test edilecektir.
- **Güvenlik Testi**: Logo 7 kez tıklanarak sıfırlama akışı denenecektir.
- **Senkronizasyon Testi**: Web Kiosk arayüzünden girilen verilerle native Android üzerindeki verilerin/fiyatların birebir uyuştuğu doğrulanacaktır.
