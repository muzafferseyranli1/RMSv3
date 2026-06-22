# Kiosk Mobil Uygulaması Devir Notları (kiosk_fixes_handoff.md)

Bu belge, Kiosk Mobil Uygulaması ve Kiosk Ayarları panelinde yapılan düzeltmeler ve tablete kurulum süreciyle ilgili devir notlarını içermektedir.

## 1. Tespit Edilen Problemler ve Yapılan Çözümler

### Kategori Buton Yüksekliği Limitlerinin Genişletilmesi
- **Hata:** Kiosk Ayarları panelinde kategori yüksekliği cm cinsinden değiştirildiğinde kaydedildikten sonra eski haline dönüyordu.
- **Neden:** `src/components/pages/KioskManagementDesktop.jsx` tarafında limitler esnetilmiş olsa da `src/lib/kioskSettings.js` dosyasındaki `normalizeSettings` fonksiyonunda yer alan `clampNumber` limitleri (88 - 180 px) eski değerlerde kaldığı için sunucuya kaydedilirken otomatik olarak kırpılıyordu.
- **Çözüm:** 
  - `src/lib/kioskSettings.js` içindeki limitler `50` ve `300` px aralığına genişletildi.
  - `src/components/pages/KioskManagementDesktop.jsx` içindeki cm limitleri `1.5 cm` (56.7px) ile `8.0 cm` (302.4px) aralığına genişletildi.
  - Kotlin tarafında (`KioskBigScreen.kt` ve `KioskTabletScreen.kt`) `settingsJson`'dan `category_button_height`, `tablet_category_button_height_portrait` ve `tablet_category_button_height_landscape` ayarları dinamik olarak okunup yan menü butonlarının yüksekliğine atandı.

### Sepet Topu Animasyonunun Yumuşatılması
- **Hata:** Sepet topunun dokunulduktan veya sürüklendikten sonra durma ve harekete başlama ivmeleri çok sertti.
- **Çözüm:** `KioskBigScreen.kt` ve `KioskTabletScreen.kt` dosyalarındaki `cartDockYAnim` animasyon geçişini kontrol eden `spring` parametresi yerine 800 milisaniye süren ve `CubicBezierEasing(0.42f, 0.0f, 0.58f, 1.0f)` (Ease-In-Out) eğrisini kullanan `tween` animasyonu entegre edildi. Bu sayede duruş ve kalkış hareketleri daha az akselerasyonlu ve yumuşak hale getirildi.

### Seçenek Çekmecesinde Seçeneklerin Görünmeme Hatası
- **Hata:** Ürün detay çekmecesinde (Options Drawer) hiçbir seçenek listelenmiyordu.
- **Neden:** `sale_items.option_groups` tablosundan gelen JSON verisindeki grup tanım ID'leri `group_def_id` olarak tutulurken, Kotlin kodu `option_group_id` veya `id` alanını arıyordu. Bu da filtreleme sırasında tüm seçenek gruplarının elenmesine sebep oluyordu.
- **Çözüm:** `KioskBigScreen.kt` ve `KioskTabletScreen.kt` dosyalarında `linkedIds` çözümlenirken `group_def_id` alanına öncelik verildi.

### Kategori Görünürlüğü ve Alt Kategori Ürün Gruplaması
- **Hata:** Görünür olarak işaretlenen alt kategoriler listede gözükmüyor, tüm ürünler ana kategori altında birleştiriliyordu.
- **Çözüm:**
  - `topCategories` yerine, `category_configs` ayarlarından görünürlük moduna (`visibilityMode != "hide"`, `defaultVisible !== false`) göre filtrelenmiş ve sıralanmış (`defaultOrder`) tüm kategorileri içeren `visibleCategories` listesi oluşturuldu.
  - Eğer bir alt kategori aktif ve görünür ise, o alt kategoriye ait ürünlerin ana kategoride mükerrer olarak listelenmesi engellendi (`parentId` kontrolü eklendi).
  - Alt kategorilerin boş da olsa (hiç ürün olmasa dahi) başlığıyla birlikte boş olarak listelenebilmesi sağlandı.

---

## 2. Derleme, Kurulum ve Doğrulama Durumu

- **Android Proje Konumu:** `kiosk-android/`
- **Gradle Derleme Durumu:** Başarılı (`assembleDebug` hatasız tamamlandı).
- **Hedef Tablet Cihazı:** Samsung Galaxy A7 (SM-T220 - Android 14) kablosuz hata ayıklama moduyla bağlı.
- **Kurulum:** `.\gradlew.bat installDebug` komutuyla güncel APK paketi tablete başarıyla yüklendi.

---

## 3. Bir Sonraki Adımlar (Gelecek Agent veya Kullanıcı İçin)

1. **Yönetim Panelinden Test:** Kiosk Ayarları panelinden kategori yüksekliğini (örneğin 1.5 cm veya 7.5 cm gibi sınır değerler vererek) değiştirin, kaydedin ve veritabanına doğru şekilde yazıldığını/arayüzde sabit kaldığını doğrulayın.
2. **Tablet Arayüzü Kontrolü:** Tablette kiosk uygulamasını açarak:
   - Seçenekli bir ürüne tıklayıp Seçenek Çekmecesinin (Options Drawer) dolduğunu ve seçeneklerin göründüğünü test edin.
   - Sepet topunu sürükleyip bırakarak yeni Ease-In-Out animasyon geçişinin yumuşaklığını test edin.
   - Sol menüde alt kategorilerin göründüğünü ve ürünlerin mükerrer olmadan doğru kategori başlıkları altında toplandığını doğrulayın.
