## İşlem: Sayım Görevleri ve Fark Onay Mekanizması
Alternatif kullanıcı ifadeleri:
- Sayım görevi nasıl oluşturulur?
- Sayım farkı onaylama ve reddetme nasıl yapılır?
- Depo sayım farkları stokları nasıl eşitler?
- İkmal önerileri ve pick-face ikmali nedir?

Amaç:
Merkez depodaki rafların veya LPN'lerin periyodik sayım (cycle count) görevlerinin oluşturulması, mobil cihazda sayılması, sayım sonrasında oluşan stok farklarının yönetici panelinde onaylanarak stokların otomatik güncellenmesi ve pick-face alanları için otomatik ikmal (replenishment) önerilerinin yönetilmesi.

Ekran yolu:
Depo ve Üretim Ekranları > Depo WMS > WMS Görevleri

Link:
/depo-wms-tasks

Adımlar:
### 1. Sayım Görevi Oluşturma
1. WMS Görev Paneline gidin ve sağ üstteki "Yeni Sayım Görevi" butonuna tıklayın.
2. Sayılacak Stok Kalemini, sayımın yapılacağı Lokasyonu ve (varsa) LPN (Palet) numarasını seçip görevi oluşturun. Görev mobil el terminaline ("Atandı" statüsünde) iletilecektir.

### 2. El Terminalinde Sayım (Mobil)
1. Depo görevlisi el terminalinden "Görevlerim" altından sayım işini seçer.
2. Sırasıyla Lokasyon barkodunu, LPN barkodunu ve ürün barkodunu taratarak fiziksel miktar girişini tamamlar.
3. Eğer fark yoksa görev doğrudan tamamlanır. Fark varsa, onay için web paneline düşer.

### 3. Sayım Farkı Onayları (Web)
1. Sayım bittiğinde miktar farkı oluştuysa, WMS Görev Panelinde "Sayım Farkı Onayları" sekmesine gidin.
2. Listede bekleyen fark isteklerini inceleyin (ürün, lokasyon, LPN, sistemdeki bekleyen miktar, sayılan miktar, artı/eksi fark, sayımı yapan personel).
3. Sayım farkını onaylamak için yeşil **"Onayla"** butonuna tıklayın. Bu eylem, stok hareket defterinde sayım fazlası/eksiği kaydı açar ve sistem stoğunu sayılan miktar ile eşitler.
4. Sayım farkını iptal etmek için kırmızı **"Reddet"** butonuna tıklayın. Sistem stoğu değişmez, sayım geçersiz sayılır.

### 4. İkmal Önerileri (Pick-Face Replenishment)
1. WMS Görev Panelinde "İkmal Önerileri" sekmesine gidin.
2. Sistem, pick-face (sipariş toplama rafları) lokasyonlarındaki stokları minimum seviyenin altına düşen ürünleri listeler.
3. Rezerv alanda (yedek depo) uygun stok bulunuyorsa, önerinin yanındaki **"Görev Oluştur"** butonuna tıklayın.
4. Bu işlem, depo görevlisinin el terminaline rezerv alandan pick-face alanına çift adımlı doğrulama ile transfer etmesini söyleyen bir "Taşıma (Move)" görevi atar.

Önemli uyarı:
Sayım farkı onaylarında yöneticiler serbest karar yetkisine sahiptir. Onaylanan farklar anında stok kartlarındaki mevcut miktarları günceller ve bu işlem geri alınamaz. İkmal önerilerinde yedek alanda yeterli stok kalmadıysa "Rezerve Stok Yok" uyarısı verilir ve ikmal görevi oluşturulamaz.
