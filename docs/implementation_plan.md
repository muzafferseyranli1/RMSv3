# Kiosk Android Uygulaması — Arayüz Geliştirme ve Parite İyileştirme Planı (Aşama 2)

Bu plan, native Kiosk Android uygulamasında sepet topunun (FAB) hareketlerini yumuşatmayı, seçenekler çekmecesini (options drawer) web arayüzü stiliyle ve dikey konumlandırmasıyla güncellemeyi, ürün listesini sürekli akan tek bir liste haline getirerek kategoriler arası geçişi otomatik senkronize etmeyi hedefler.

## User Review Required

> [!IMPORTANT]
> **Sepet Topu Drag-Lock:** Sepet topunun tüm ekran dokunuşlarını takip etmesi yerine, sadece kendi üzerine yapılan sürüklemeleri (vertical drag) takip etmesi ve bırakıldığı yerde kalması sağlanacaktır. Böylece katalogda gezinirken sepet topunun istemsizce zıplaması engellenecektir.
> **Scroll-Synchronized Grid:** Ürün listesi kategorilere göre sayfa sayfa bölünmeyecek; tüm ürünler alt alta akacak, aralarında sadece kategori isimleri ve ince çizgiler olacaktır. Kullanıcı kaydırdıkça sol taraftaki aktif kategori otomatik olarak değişecektir.

## Proposed Changes

### [Kiosk Android Uygulaması](file:///X:/RMSv3/kiosk-android/)

---

#### [MODIFY] [KioskBigScreen.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/ui/bigscreen/KioskBigScreen.kt)
- **Kategori & Ürün Akışı Entegrasyonu:**
  - Tüm kategorilerin ürünlerini ve aralarındaki başlıkları (`CategoryHeaderRow`) içeren düzleştirilmiş bir liste (`flatGridItems`) oluşturulması.
  - `LazyGridState` ile ürün listesinin scroll hareketinin izlenmesi ve en üstteki aktif kategorinin tespit edilerek sol kategori barına yansıtılması (`currentVisibleCategoryIndex`).
  - Sol kategori panelinde bir kategoriye tıklandığında, listenin o kategorinin başlık çizgisine animasyonlu olarak kaydırılması (`animateScrollToItem`).
- **Yumuşak Drag Desteği:**
  - Kök `Box` üzerindeki genel dokunma takip mekanizmasının kaldırılması.
  - `CartFab` bileşenine `detectVerticalDragGestures` eklenerek doğrudan kendi üzerinden yumuşakça sürüklenmesi ve bırakılan Y konumunda kalması.
- **Seçenek Çekmecesi (Web Paritesi & Dinamik Yükseklik):**
  - `ProductDetailSheet`'in arka planının **beyaz (`Color.White`)**, yazı ve detaylarının **koyu gri/siyah (`Color(0xFF0F172A)`)** olarak güncellenmesi.
  - Modalın yüksekliğinin içeriğe göre otomatik sarılması (`wrapContentHeight()`), maksimum 720.dp yüksekliğinde olması.
  - Modal açılırken sepet topunun o anki dikey Y pozisyonunun (`cartDockY`) parametre olarak geçilmesi ve modalın o noktayı merkezleyerek konumlanması (`offset`).
  - Seçenek seçim butonlarının web paritesine uygun olarak beyaz zeminli, seçildiğinde ise mor accent renkli çerçeve ve hafif şeffaf arka planla tasarlanması.

---

#### [MODIFY] [KioskTabletScreen.kt](file:///X:/RMSv3/kiosk-android/app/src/main/java/com/suitable/kiosk/ui/tablet/KioskTabletScreen.kt)
- `KioskBigScreen.kt` üzerinde uygulanan yeni scroll senkronizasyonu, sepet topu drag-along davranışı ve beyaz zeminli/dikey merkezli web paritesi seçenekler drawer'ı tasarımının birebir olarak tablet ekranına da taşınması.

## Verification Plan

### Automated Tests
- Gradle projesinin başarıyla derlenmesi:
  `.\gradlew.bat assembleDebug`

### Manual Verification
- **NoxPlayer Üzerinde Testler:**
  - Sol kategori barından bir kategori seçildiğinde ürün listesinin o kategori çizgisine yumuşakça kaydığının doğrulanması.
  - Ürün listesi kaydırıldıkça sol kategori sidebar'ındaki seçili kategorinin otomatik güncellendiğinin doğrulanması.
  - Sepet topunun (FAB) sadece kendi üzerinden aşağı/yukarı kaydırılabildiğinin ve dokunulduğu/bırakıldığı yerde kaldığının doğrulanması.
  - Herhangi bir seçenekli ürün tıklandığında, sağdan açılan seçenekler çekmecesinin beyaz renk temasıyla, içeriğe göre dinamik yükseklikte ve sepet topunun Y eksenindeki konumuna göre tam ortalanmış olarak açıldığının doğrulanması.
