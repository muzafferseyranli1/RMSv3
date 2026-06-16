## İşlem: Stok Paket Ölçüleri ve Barkod Yönetimi
Alternatif kullanıcı ifadeleri:
- Stok kartına ambalaj birimi nasıl eklenir?
- Bir ürüne birden fazla barkod nasıl tanımlanır?
- Koli boyutları, brüt ağırlık ve hacim bilgisi girişi nerede?
- Birincil barkod seçimi nedir?

Amaç:
Stok malzemelerinin (hammadde veya satılabilir ürünler) ana ölçü birimlerinin (örn. Adet) yanı sıra ek paketleme/ambalaj birimlerinin (Koli, Kutu vb.) boyut, brüt/net ağırlık ve birden fazla barkod eşleştirmelerinin girilmesini sağlayarak depo hacim ve yerleştirme kontrollerini optimize etmek.

Ekran yolu:
Merkez / Yönetici Ekranları > Stok Yönetimi > Stok Kalemleri

Link:
/stock-items

Adımlar:
1. Stok Kalemleri sayfasına gidin.
2. İşlem yapmak istediğiniz stok malzemesinin yanındaki düzenleme (kalem) butonuna tıklayın.
3. Düzenleme formunda "Paketleme & Barkodlar" sekmesine veya ambalaj yönetim alanına gelin.
4. **Ana Birim Bilgileri:** Ana birimin (örn. Adet) En, Boy, Yükseklik (cm) ve Net/Brüt Ağırlık (kg) değerlerini girin.
5. **Ek Paketleme/Ambalaj Birimi Ekleme:** "Ambalaj Birimi Ekle" butonuna tıklayarak yeni bir birim (örn. Koli) ekleyin:
   - Ambalaj Birimi tipini seçin.
   - Ana Birim Çarpanını girin (Örn: 1 Koli = 24 Adet ise çarpan 24'tür).
   - Koli boyutlarını (Boy, En, Yükseklik) girin. Sistem koli hacmini ($m^3$) otomatik olarak hesaplayacaktır.
   - Brüt ve Net ağırlık değerlerini doldurun.
6. **Çoklu Barkod Tanımlama:** Her bir ambalaj kartı altında bulunan barkod listesine o birime ait barkodları ekleyin:
   - "Barkod Ekle" butonuna tıklayın.
   - Barkod dizesini girin ve barkod tipini (GTIN, EAN, CODE128 vb.) seçin.
   - Bu birim için ana barkod ise "Birincil Barkod" seçeneğini işaretleyin.
7. Tüm kontrolleri doğrulayın: Net ağırlık brüt ağırlıktan küçük veya eşit olmalı, boyutlar sıfırdan büyük olmalı ve mükerrer barkod bulunmamalıdır.
8. Değişiklikleri kaydedin.

Önemli uyarı:
Barkod tanımları veritabanında normalize tablolarla tutulur ve aktif mükerrer barkod kullanımına izin verilmez. El terminalinden taranan barkodların sistem tarafından sırasıyla (Lokasyon, LPN, onaylı barkod, Lot/SKT payload ve SKU fallback) doğru çözümlenebilmesi için barkodların tekil ve doğru tanımlanmış olması kritik önem taşır.
