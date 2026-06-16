## İşlem: WMS Raf İkmal (Pick-Face Replenishment) Yönetimi

Alternatif kullanıcı ifadeleri:
- Toplama raflarındaki azalan stoklar nasıl tamamlanır?
- İkmal görevi (replenishment) nasıl oluşturulur ve çalıştırılır?
- Pick-face minimum ve maksimum limitleri nasıl ayarlanır?
- Rezerve stok alanından toplama alanına ürün transferi nasıl yapılır?
- El terminalinden raf ikmali nasıl gerçekleştirilir?

Amaç:
Şubelerin siparişlerini toplamak için kullanılan hızlı toplama raflarındaki (Pick-Face) stok seviyeleri belirlenen minimum seviyenin altına düştüğünde, sistemin otomatik olarak rezerve depolama alanlarından (Reserve) toplama alanlarına stok transferi önermesi ve bu ikmal görevlerinin el terminali üzerinden yürütülmesi.

Ekran yolu:
1. Ayarlar için: Ana Depo / WMS > Stok Parametreleri
2. Görev yönetimi için: Ana Depo / WMS > WMS Görevleri > İkmal Önerileri sekmesi

Link:
1. Stok Parametreleri: /wms-stock-params
2. İkmal Önerileri: /depo-wms-tasks

Adımlar:
1. **İkmal Parametrelerinin Tanımlanması (Web):**
   - Tarayıcıdan [http://localhost:5173/wms-stock-params](http://localhost:5173/wms-stock-params) adresine gidin.
   - İlgili ürün satırında aşağıdaki alanları tanımlayın:
     - **Toplama Min:** Raftaki stok miktarı bu limitin altına indiğinde sistem ikmal uyarısı verir.
     - **Toplama Max:** Rafta tutulabilecek maksimum hedef stok miktarıdır.
     - **Varsayılan Lokasyon:** Ürünün hızlı toplama konumu (usage_type 'PICK_FACE' olan bir lokasyon) seçilmelidir.
   - Sağ üstteki yeşil **Parametreleri Kaydet** butonuna tıklayarak ayarları kaydedin.

2. **İkmal Görevlerinin Oluşturulması (Web):**
   - Tarayıcıdan [http://localhost:5173/depo-wms-tasks](http://localhost:5173/depo-wms-tasks) adresine gidin.
   - **İkmal Önerileri** sekmesine tıklayın.
   - Sistem, raftaki mevcut stok ile yoldaki görev miktarlarını toplayıp `Toplama Min` değerinin altında kalan ürünleri listeler.
   - Tabloda **İhtiyaç** miktarını (Max stok - Mevcut stok farkı) ve **Rezerve Durumu** kolonunda hangi yedek lokasyondan (FEFO - ilk SKT'si gelecek şekilde) ürünlerin çekileceğini kontrol edin.
   - İlgili ürün satırındaki **Görev Oluştur** butonuna tıklayarak ikmal transfer (Move) görevini oluşturun.

3. **İkmal Görevinin Yürütülmesi (Mobil/El Terminali):**
   - Depo personeli el terminalinden WMS mobil uygulamasına girip kendisine atanan **İkmal (Move)** görevini açar.
   - Sistem personeli yönlendirir: "Kaynak Rezerve Lokasyonuna git ve LPN/Paleti tara."
   - Personel belirtilen rezerve lokasyon barkodunu ve palet barkodunu okutur.
   - Ürün barkodunu okutur ve belirtilen miktarda ürünü paletten alır.
   - Sistem personeli yönlendirir: "Hedef Toplama Konumuna (Pick-Face) git."
   - Personel toplama rafına giderek raf barkodunu okutur ve ürünleri rafa yerleştirerek miktarı doğrular.
   - Görev el terminalinde yeşil onay ekranıyla tamamlanır ve web paneldeki ikmal önerisi listeden kalkar.

Önemli uyarı:
Eğer rezerve depolama alanlarında ürün kalmamışsa, sistem "Rezerve Stok Yok" uyarısı verir ve ikmal görevi oluşturulmasına izin vermez. Bu durumda öncelikle tedarikçiden mal kabul yapılması gerekir.
