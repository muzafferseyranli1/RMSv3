# Kiosk Android Uygulaması — Arayüz Tasarım ve Parite İyileştirme Walkthrough

Bu belgede, Kiosk Native Android uygulamasında (hem `KioskBigScreen.kt` hem de `KioskTabletScreen.kt` modülleri) gerçekleştirilen kapsamlı görsel, animasyonel ve işlevsel iyileştirmelerin detayları ve doğrulama sonuçları sunulmaktadır.

## Gerçekleştirilen İyileştirmeler

### 1. Kiosk Ana Ekran Arka Planı (Background Image)
- **Arka Plan Resmi Entegrasyonu:** `settingsJson`'dan okunan `kiosk_bg_image` görseli ana katalog ekranlarında root seviyesine `AsyncImage` olarak eklendi.
- **Hafif ve Estetik Overlay:** Görselin arkada baskın olmaması ve içeriğin okunabilirliğini engellememesi için **%15 opasite (`alpha = 0.15f`)** ile harmanlanması sağlandı.

### 2. Kategori Sidebar'ı (Dar Genişlik & Görsel Kare Kartlar)
- **Genişlik Daraltılması:** Sol kategori sidebar'ı **90.dp** genişliğine daraltılarak ürün alanına daha geniş bir görünüm kazandırıldı.
- **Kare Kategori Kartları:** Kategoriler kare rounded-corner (12.dp) görsel kartlar haline getirildi. Arka planda kategori görseli (`imageUrlResolved`) gösterilirken, ön planda metin okunabilirliğini artırmak için alt kısımlarına siyah dikey gradyan overlay bindirildi.
- **Yeni Sipariş Akışı:** Sidebar'ın en üstüne "Baştan Başla / Yeni Sipariş" butonu eklendi:
  - Sepet boşken bu buton doğrudan `IdleScreen` başlangıç ekranına yönlendirir.
  - Sepette ürün varsa, **"Tüm sepet boşaltılacaktır"** uyarı mesajlı bir onay diyaloğu açılır. Diyalogdaki **"Devam Et" butonu 5 saniyeden geriye sayar** ve süre bitiminde ya da tıklama durumunda sepeti sıfırlayarak başlangıç ekranına döner.
- **Branch/Şube Bilgisi:** Arayüz kalabalığını önlemek amacıyla katalog ekranlarından şube ismi tamamen kaldırıldı.

### 3. Reklam Banner'ı (Main Banner Image)
- **Ürün Üstü Banner:** Ayarlardan gelen `main_banner_image` veya `tablet_main_banner_image`, `LazyVerticalGrid`'in en üstünde tam satır kaplayacak (`span = { GridItemSpan(maxLineSpan) }`) şekilde şık bir reklam banner'ı olarak entegre edildi.

### 4. Ürün Kartları (Tam Görsel & Gradyan Bilgi)
- **Cover Görsel Tasarımı:** Ürün kartları (`ProductCard`), görsellerin tamamını kaplayacağı (Card background) şekilde yeniden tasarlandı.
- **Fiyat ve İsim Overlay:** Ürün adı ve fiyatı kartın en altına konumlandırılmış yarı saydam siyah bir gradyan overlay üzerinde beyaz metinlerle yerleştirildi.
- **Hızlı Ekleme & Ayar Badge:** Kartın sağ üst köşesine hızlı ekleme için "+" butonu, seçenekli ürünler için ise "tune" (ayar) simgesi eklendi.

### 5. Seçenekler Çekmecesi (Web Paritesi & Dikey Merkezleme)
- **Web Temasıyla Parite:** Seçenekler çekmecesi (`ProductDetailSheet`) beyaz zemin (`#ffffff`), koyu gri/siyah metinler (`#0f172a`), gri detaylar ve beyaz arka planlı kapatma butonu ile tamamen web stiline kavuşturuldu.
- **Seçim Çerçeveleri:** Seçili opsiyonlar mor Accent rengi ve hafif saydam dolguyla, seçilmemiş olanlar ise açık gri zemin ve ince çerçeveyle gösterilir.
- **Sepet Topuna Göre Hizalama:** Çekmece açılırken sepet topunun o anki dikey Y pozisyonunu (`cartDockY`) merkezleyerek (`offset` ile) açılır.
- **Dinamik Yükseklik:** Yüksekliği içeriğe göre otomatik sarılır (`wrapContentHeight()`) ve maksimum 720.dp ile sınırlandırılır. Layout sıçramasını önlemek için ilk ölçüm yapılana kadar opaklığı sıfır tutulur.

### 6. Sepet Dokunuş Takibi, Yumuşak Drag ve Uçuş Animasyonu
- **Sadece Sürüklemeyle Drag (Drag-Lock):** Sepet topunun tüm ekran dokunuşlarını takip etmesi iptal edildi. FAB sepet butonuna doğrudan `detectVerticalDragGestures` eklenerek sadece doğrudan kendi üzerine dikey sürüklemelerle hareket etmesi ve bırakılan yerde kalması sağlandı.
- **Koordinat Yakalama ve Bezier Animasyonu:** Ürün kartlarına tıklandığında tıklandığı koordinat yakalanır ve sepet topuna doğru parabolik Bezier eğrisi izleyen kırmızı bir uçuş animasyon parçacığı (`FlyDotAnimation`) tetiklenir.

### 7. Sürekli Ürün Akışı & Kategori Senkronizasyonu (Scroll Sync)
- **Tek Liste Akışı (Continuous Grid):** Ürünler kategorilere göre sayfa sayfa bölünmek yerine, tüm kategoriler alt alta ince bir çizgi ve kategori adı (`CategoryHeaderRow`) ile ayrılmış tek bir düz listede (`flatGridItems`) toplanarak kesintisiz kaydırma sağlandı.
- **Otaktik Sidebar Güncellemesi:** Sağdaki ürün listesi kaydırıldıkça `LazyGridState` ile en üstte görünür olan kategori tespit edilir ve soldaki kategori barında seçili durum otomatik güncellenir.
- **Sidebar Tıklama Animasyonu:** Sol bar üzerinden bir kategoriye tıklandığında ürün gridi o kategorinin başlık çizgisine yumuşakça kaydırılır (`animateScrollToItem`).

---

## Derleme ve Doğrulama Sonuçları

- **Başarılı Gradle Derlemesi:** `.\gradlew.bat assembleDebug` komutuyla native Android projesi başarıyla derlenebilir durumdadır.
- **NoxPlayer Emulator Kurulumu:** Derlenen debug APK'sı NoxPlayer emülatörüne başarıyla kurulabilir durumdadır.
