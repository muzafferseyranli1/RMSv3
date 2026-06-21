# Kiosk Android — Devir Notu (Handout)

**Tarih:** 2026-06-21  
**Proje:** `X:\RMSv3\kiosk-android\`  
**Sohbet ID:** `5329b333-00a9-43ae-a9bc-bf23d287dda3`

---

## Son Yapılan Arayüz & Parite İyileştirmeleri (Faz 2 Aşama 2)

Hem **`KioskBigScreen.kt`** hem de **`KioskTabletScreen.kt`** üzerinde aşağıdaki geliştirmeler eksiksiz olarak tamamlanmıştır:

1. **Sepet Topu (FAB) Sürükleme Desteği (Drag-Lock):**
   - Kök ekrandaki genel touch interceptor (`pointerInput`) kaldırıldı.
   - Sadece sepet topunun (`CartFab`) kendi üzerine yapılan dikey sürüklemeleri (`detectVerticalDragGestures`) dinlemesi sağlandı. Sepet topu artık katalogda gezinirken zıplamıyor, bırakılan Y koordinatında sabit kalıyor.

2. **Sürekli Akış (Continuous Grid) & Scroll Sync:**
   - Kategorilere göre sayfalama kaldırıldı; tüm ürünler alt alta akan tek bir düz liste (`flatGridItems`) haline getirildi.
   - Kategoriler arasına başlık ve ayırt edici ince çizgiler (`CategoryHeaderRow`) eklendi.
   - Sağ taraf kaydırıldıkça hangi kategori aktifse soldaki kategori panelindeki seçili kategori otomatik güncelleniyor.
   - Sol panelden bir kategori tıklandığında, grid o kategorinin başlık çizgisine yumuşakça kaydırılıyor (`animateScrollToItem`).

3. **Seçenek Çekmecesi (Web Paritesi & Y-Hizalama):**
   - Ürün detay modalı (`ProductDetailSheet`) web paritesine uygun şekilde güncellendi: Beyaz zemin (`#ffffff`), koyu gri/siyah metinler (`#0f172a`), gri alt metinler ve beyaz zeminli kapatma butonu.
   - Seçenek butonları seçildiğinde Accent rengi çerçeve ve hafif opak arka planla, seçilmediğinde ise açık gri zeminle gösterilir.
   - Çekmecenin dikey yüksekliği içeriğe göre dinamik ayarlandı (`wrapContentHeight()`, max 720.dp).
   - Çekmece açılırken sepet topunun o anki dikey Y pozisyonunu (`cartDockY`) merkez alarak (`offset` yardımıyla) hizalanır.

---

## Güncel Derleme ve Test Durumu
- Kotlin derleme hatasına yol açan yerel değişken sıralama sorunu (`resolvedBannerUrl` / `bannerTitle`'ın tanımlanmadan önce scroll sync `derivedStateOf` içinde kullanılması) giderildi.
- `.\gradlew.bat assembleDebug` derleme süreci başlatıldı ve Kotlin kodlarının derlemesi hatasız geçti.

---

## Sonraki Adımlar
1. **Emülatör Kurulumu ve Manuel Test:**
   - Derlenen debug APK'sını NoxPlayer emülatörüne yükleyin: `nox_adb install -r app/build/outputs/apk/debug/app-debug.apk`
   - Kategori tıklamalarının, dikey katalog kaydırma sırasında sol menü senkronizasyonunun ve sepet topunun drag-along hareketinin doğruluğunu manuel olarak doğrulayın.
   - Seçenekli bir ürüne tıklayıp sağdan açılan seçenekler çekmecesinin sepet topunun Y pozisyonuna göre dikeyde tam ortalandığını ve web stili renklerle açıldığını doğrulayın.
2. **Kiosk Kapalı Hatası Kontrolü (Opsiyonel):**
   - Kiosk uygulamasının "Kapalıyız" deme durumu şube çalışma saatleri ayarları veya kiosk aktiflik durumuna bağlıdır. Eğer gerekirse ayarlar JSON'ını kontrol edin.
