## İşlem: WMS Karantina ve Kalite Kontrol Yönetimi

Alternatif kullanıcı ifadeleri:
- Bozuk veya hasarlı gelen ürünleri nasıl karantinaya alırım?
- Kalite kontrol onayını bekleyen stokları nasıl kabul ederim?
- Hasarlı malları nasıl reddeder veya hurdaya ayırırım?
- Karantina altındaki lot numarasını nasıl serbest bırakırım?

Amaç:
Mal kabul veya sayım sırasında hasarlı/kusurlu olarak tespit edilip karantinaya alınan (Hold durumundaki) stokların incelenmesi, kabul (Release), iade (Reject) veya imha (Scrap) süreçlerinin yönetilmesi.

Ekran yolu:
Ana Depo / WMS > Karantina Yönetimi

Link:
/wms-quality

Adımlar:
1. Tarayıcıdan [http://localhost:5173/wms-quality](http://localhost:5173/wms-quality) adresine giderek **Karantina Yönetimi** ekranını açın.
2. Sayfanın üst kısmında bulunan **Depo Seçimi**, **Durum Filtresi** (Karantina, Kabul Edilenler, Reddedilenler, Hurdaya Ayrılanlar) veya arama kutusunu kullanarak işlem yapmak istediğiniz lot kaydını bulun.
3. İlgili satırda bulunan **Kanıt / Sebep** sütunundaki görsel ikonuna tıklayarak mobil cihazdan yüklenmiş olan hasar kanıt fotoğrafını ve açıklamayı inceleyin.
4. Kararınıza göre satırın sonundaki işlemlerden birini seçin:
   - **Kabul Et (Release):** Üründe sorun olmadığını veya düzeltildiğini onaylayarak stoğu normal kullanıma açar.
   - **İade Et (Reject):** Ürünün tedarikçiye geri gönderilmesi kararını verir.
   - **Hurdaya Ayır (Scrap):** Ürünün kullanılamaz durumda olduğunu ve imha edileceğini onaylar.
5. Açılan modal pencerede işlemin gerekçesini (notunu) detaylıca yazın ve yeşil onay butonuna basarak kaydedin.

Önemli uyarı:
Karantinadan çıkartılarak serbest bırakılan, iade edilen veya hurdaya ayrılan stoklar için yapılan işlem geri alınamaz. Karantina durumundaki (Hold) stoklar şubelere sevk edilemez veya depo içi diğer sipariş akışlarında kullanılamaz.
