## İşlem: Stok Kartı Paket Ölçüleri ve Barkod Yönetimi

Alternatif kullanıcı ifadeleri:
- Stok kartına koli veya palet birimi nasıl eklenir?
- Bir ürüne birden fazla barkod nasıl tanımlanır?
- Ürün ambalaj boyutları, hacmi ve ağırlığı nasıl girilir?
- Paket biriminin içindeki adet miktarını nasıl belirlerim?
- Stok kartında birincil barkodu nasıl seçerim?

Amaç:
Stok kalemlerinin hem ana birimi (örn. adet, kg) hem de diğer ambalaj birimleri (örn. kutu, koli, paket, palet) için en/boy/yükseklik, hacim, ağırlık ve barkod tanımlamalarının yapılarak lojistik, depolama ve WMS barkod okuma işlemlerinde doğru çarpanların ve kapasitelerin işletilmesini sağlamak.

Ekran yolu:
Katalog > Stok Kalemleri > [İlgili Ürünü Düzenle veya Yeni Ekle]

Link:
/stock-items

Adımlar:
1. Tarayıcıdan [http://localhost:5173/stock-items](http://localhost:5173/stock-items) adresine gidin.
2. İşlem yapacağınız stok kartının yanındaki **Düzenle** (kalem) ikonuna tıklayın veya sağ üstteki **Yeni Stok Kalemi** butonunu kullanın.
3. Düzenleme çekmecesinde aşağı kaydırarak **Barkodlar & Paketleme** sekmesini/bölümünü bulun.
4. **Ana Birim Barkodları** başlığı altından, ürünün ana birimine (örn. Adet) ait barkodları girin. Birden fazla barkod varsa **Barkod Ekle** butonuna tıklayarak yeni satırlar ekleyin ve tarama önceliği için **Birincil** barkodu işaretleyin.
5. **Paketleme Birimleri** başlığının yanındaki **Birim Ekle** butonuna tıklayarak yeni bir ambalaj hiyerarşisi (örn. Koli veya Kutu) oluşturun.
6. Eklenen ambalaj kartını genişleterek şu alanları doldurun:
   - **Birim:** Eklenen ambalaj biriminin adı (Koli, Kutu, Paket, Palet vb.).
   - **Çarpan (Miktar):** Bu paketin içinde kaç adet/ana birim ürün olduğunu girin. (Örn: 1 Koli = 12 Adet).
   - **Boyutlar (cm):** Paketin **En**, **Boy** ve **Yükseklik** değerlerini girin. Sistem bu değerlere göre paketin hacmini ($m^3$ cinsinden) otomatik hesaplayacaktır.
   - **Ağırlıklar (kg):** Paketin **Brüt Ağırlık** ve **Net Ağırlık** değerlerini girin.
   - **Paket Barkodları:** Paket veya koli üzerine yapıştırılmış barkodları ekleyin ve aralarından birincil olanı seçin.
7. Bilgileri girdikten sonra alt kısımdaki yeşil **Kaydet** butonuna tıklayın.

Önemli uyarı:
- Brüt ağırlık her zaman net ağırlıktan büyük veya eşit olmalıdır. Boyut ve ağırlık alanlarına sıfır veya negatif değer girilemez.
- WMS barkod tarayıcı, el terminalinde koli barkodunu okuduğunda içindeki çarpan kadar adet girişini/çıkışını otomatik yapar. Mükerrer barkod tanımlanmasından kaçının.
