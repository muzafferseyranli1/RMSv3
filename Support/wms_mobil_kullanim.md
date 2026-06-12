# WMS Mobil (El Terminali) Kullanımı

## Modülün Amacı
WMS Mobil uygulaması, depo görevlilerinin Android işletim sistemli el terminalleri veya mobil cihazlar üzerinden barkod/QR okutarak Mal Kabul (Putaway), Depo Toplama (Picking), Lokasyon Taşıma ve Araç Yükleme (Load) işlemlerini sahada anlık olarak yapmalarını sağlar.

## Ekranlara Erişim
* **Kurulum:** WMS Mobil uygulaması, depo görevlilerinin Android el terminallerine `app-debug.apk` (veya ilgili sürüm) dosyası aracılığıyla yüklenir.
* **Web Üzerinden Görüntüleme:** Yalnızca test amaçlı tarayıcı üzerinden [http://localhost:5173/wms-mobile](http://localhost:5173/wms-mobile) veya [http://localhost:5173/depo-mobile](http://localhost:5173/depo-mobile) rotalarından erişilebilir.

## Önemli Adımlar ve Kurallar

1. **Giriş ve Yetkilendirme (PIN ile Giriş):**
   Uygulamayı açtığınızda sistem sizden personelinize atanmış şifreyi (PIN) girmenizi ister. Yalnızca Depo yetkisi olan personeller bu ekranlara giriş yapabilir.
2. **Görevlerim Ekranı:**
   Uygulama açıldığında o gün yapmanız gereken işlemler (toplama, yerleştirme vb.) liste halinde karşınıza çıkar.
3. **Kamera ile Barkod Okutma (Split-Screen):**
   Uygulamanın üst kısmı sürekli kamerayı veya barkod okuyucu lazerini aktif tutar. İşlem yapmak istediğiniz ürünün, paletin veya depo lokasyonunun barkodunu okuttuğunuzda alttaki işlem ekranı anında güncellenir.
   - Doğru barkod okutulduğunda **Yeşil** onay ekranı,
   - Hatalı veya siparişte olmayan bir barkod okutulduğunda **Kırmızı** hata uyarısı görünür.
4. **Fotoğraflı Kanıt Ekleme:**
   Mal kabul sırasında hasarlı bir ürün tespit ettiğinizde veya toplamada eksik/hatalı bir durum (Exception) bildirmek istediğinizde sistem sizden "Fotoğraf Çekmenizi" zorunlu kılar. Fotoğraf yüklenmeden görevi tamamlayamazsınız.
5. **Kapasite ve Paket Önizleme:**
   Bir koliyi okuttuğunuzda, sistem size kolinin ebatlarını ve ilgili sevkiyat aracında ne kadar yer kapladığını (yük önizlemesi) görsel olarak gösterebilir.

## Sık Sorulan Sorular / Sorun Giderme

**Soru:** El terminalinde kameradan barkod okutuyorum ama sistem hiçbir tepki vermiyor.
**Cevap:** Cihazın kamera veya barkod okuyucu izinlerinin Android ayarlarından verilip verilmediğini kontrol edin. Lazer okuyuculu cihazlarda barkodun cihaz tarafından klavye (keyboard emulation) modunda okunduğundan emin olun.

**Soru:** Ürünü rafa koydum ama görevi onaylayamıyorum, onay butonu kilitli?
**Cevap:** Görev sırasında ürün eksik geldi veya iptal girildiyse, sistem sizden zorunlu olarak "Fotoğraf (Kanıt)" yüklemenizi bekliyor olabilir. Ekranda "Fotoğraf Ekle" uyarısı olup olmadığını kontrol edin.

**Soru:** Yanlış rafı okutursam ne olur?
**Cevap:** Sistem size "Hatalı Lokasyon" uyarısı verir (kırmızı ekran) ve işlem yapmanıza izin vermez. İstenilen doğru rafın barkodunu okutmanız gerekmektedir.
