# Sipariş Yönetimi ve Merkez Mutfak Satınalma

## Modülün Amacı
Bu modül, restoran şubelerinizin Merkez Depo veya Merkez Mutfak birimlerinden manuel veya otomatik olarak sipariş oluşturmasına, taslak siparişleri yönetmesine olanak tanır. Merkez Mutfak, bu ekran üzerinden kendi hammadde satınalma süreçlerini yönetebilir.

## Ekranlara Erişim
* **Şube ve Depo Siparişleri:** [http://localhost:5173/siparisler](http://localhost:5173/siparisler)
* **Merkez Mutfak Satınalma:** [http://localhost:5173/merkezmutfak-satinalma](http://localhost:5173/merkezmutfak-satinalma)

## Önemli Adımlar ve Kurallar

1. **Manuel Sipariş Oluşturma:** 
   Siparişler sayfasından ilgili birimi seçtikten sonra, sistemin otomatik hesaplamalarını beklemeden acil ihtiyaçlarınız için manuel sipariş (taslak) oluşturabilirsiniz. "Manuel Sipariş Oluştur" işlemine tıkladığınızda açılan detay ekranından miktarları doğrudan girebilirsiniz.
   
2. **Otomatik Birim Kilitlenmesi:**
   Sisteme Merkez Depo (Ana Depo) veya Merkez Mutfak kullanıcısı olarak giriş yaptıysanız, Siparişler ekranındaki birim seçimi (dropdown) otomatik olarak sizin bulunduğunuz merkezi birime kilitlenecektir. Bu sayede yanlış şube adına işlem yapmanız engellenir.

3. **Merkez Mutfak Satınalma:**
   Merkez mutfak yetkilileri, üretim süreçleri için dış tedarikçilerden veya merkez depodan yapacakları satınalmaları özel `/merkezmutfak-satinalma` ekranı üzerinden takip ederler. Bu ekran, mutfağa özel hammadde gereksinimlerini listeler.

## Sık Sorulan Sorular / Sorun Giderme

**Soru:** Manuel sipariş oluşturdum ancak sayfada göremiyorum?
**Cevap:** Oluşturulan manuel sipariş başlangıçta "Taslak" statüsündedir. Filtreler bölümünden durumunu "Tümü" veya "Taslak" olarak işaretleyip kontrol edin.

**Soru:** Birim seçme menüsü neden kilitli?
**Cevap:** Merkez Depo veya Mutfak yetkisiyle oturum açtığınızda sistem, güvenlik gereği yalnızca kendi biriminiz üzerinden işlem yapabilmeniz için seçimi otomatik kilitler. Şubeler için işlem yapmak istiyorsanız şube yetkilisi (veya merkez yöneticisi) hesabıyla giriş yapmanız gerekir.
