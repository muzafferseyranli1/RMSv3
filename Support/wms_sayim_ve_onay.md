## İşlem: WMS Sayım Görevleri ve Fark Onay Mekanizması

Alternatif kullanıcı ifadeleri:
- El terminalinden depo sayımı nasıl yapılır?
- Sayım farklarını nasıl onaylarım?
- Sayım farkı reddedilince ne olur?
- Yeni bir sayım görevi (cycle count) nasıl oluşturulur?
- Fiili envanter ve sistem envanteri arasındaki farklar nasıl eşitlenir?

Amaç:
Depo içerisindeki belirli ürünlerin, lokasyonların veya LPN'lerin (paletlerin) mobil el terminali aracılığıyla fiziksel olarak sayılması, sayım sonuçlarında fark çıkması durumunda bu farkların yönetici onayına sunulması ve yönetici onayıyla stok düzeltme işlemlerinin yapılması.

Ekran yolu:
Ana Depo / WMS > WMS Görevleri

Link:
/depo-wms-tasks

Adımlar:
1. **Sayım Görevi Oluşturma (Web):**
   - Tarayıcıdan [http://localhost:5173/depo-wms-tasks](http://localhost:5173/depo-wms-tasks) adresine gidin.
   - Sağ üstte bulunan **Yeni Görev Oluştur** butonuna tıklayın.
   - Görev tipini **Sayım (Count)** olarak seçin.
   - Sayım yapılacak hedef lokasyonu (raf), varsa LPN kodunu ve ürünü belirleyip **Görev Tanımla** butonuna tıklayın. Görev "Beklemede (pending)" durumunda oluşturulur.

2. **Sayımı Gerçekleştirme (Mobil/El Terminali):**
   - Depo personeli el terminalinden WMS mobil uygulamasına girer.
   - Görev listesinden ilgili **Sayım** görevini seçer.
   - Önce hedef lokasyon barkodunu, ardından LPN/palet barkodunu ve ürün barkodunu okutarak doğrular.
   - Ekranda fiili olarak saydığı ürün miktarını (adet/koli vb.) girer.
   - Eğer sayım miktarı sistemdeki miktar ile uyuşuyorsa, görev doğrudan **Tamamlandı (done)** durumuna geçer ve stok güncellenmez (zaten aynıdır).
   - Eğer sayım miktarı sistemdeki miktardan farklı ise (fark/discrepancy varsa), görev el terminalinde sonlandırılır ve onay kuyruğuna düşer.

3. **Sayım Farklarını Onaylama / Reddetme (Web):**
   - Tarayıcıdan [http://localhost:5173/depo-wms-tasks](http://localhost:5173/depo-wms-tasks) ekranına gidin ve **Sayım Onayları** sekmesine tıklayın. (Eğer onay bekleyen fark varsa sekme üzerinde kırmızı adet rozeti görünür).
   - Listede ilgili sayım satırını bularak **Sistemdeki Stok**, **Sayılan Stok** ve **Fark** (eksi/artı) bilgilerini kontrol edin.
   - Sayımı yapan personeli, saati ve personelin girdiği açıklama notunu inceleyin.
   - **Onayla:** Sayılan fiziksel miktarı doğru kabul eder. Sistemin stok envanterini sayılan miktar ile eşitler (stok girişi veya çıkışı işlemini otomatik yapar).
   - **Reddet:** Sayımı geçersiz sayar. Sistem envanteri değiştirilmeden eski haliyle korunur.

Önemli uyarı:
Fark onaylandığı anda sistem arka planda otomatik envanter düzeltme fişi oluşturur ve stok miktarlarını günceller. Bu işlem maliyet ve envanter raporlarına anında etki eder, dolayısıyla dikkatli onay verilmelidir.
