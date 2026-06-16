# Kurulum Adım 4 — Satış Malı Tanımlama (Menüye Ürün Ekleme)

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Kasada (POS) satılacak her ürünü (yemek, içecek, tatlı vb.) sisteme kaydetmek için bu kılavuzu kullanın. Satış malı oluşturduğunuzda; reçeteyle maliyete, fiyat listeleriyle satış fiyatına ve POS kategorisiyle kasada görünürlüğe kavuşursunuz.

## 📍 Nerede Bulunur?
- **Menü Yolu:** Sol menü > Katalog > Satış Ürünleri
- **Doğrudan Link:** /products
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
- **[Adım 1]** Şube tanımlanmış olmalı
- **[Adım 2]** Satış kategorileri tanımlanmış olmalı
- **[Adım 3]** Reçete için kullanılacak hammaddeler/stok kalemleri girilmiş olmalı

## 📋 Adım Adım İşlem

### Yeni Satış Malı Oluşturma
1. **[Satış Ürünleri sayfasına gidin]** `/products` adresine gidin.
2. **[Yeni ürün ekleyin]** Sağ üst köşedeki **"+ Yeni Satış Kalemi"** butonuna tıklayın.
3. **Açılan form birkaç sekmeden oluşur:**

#### Sekme 1 — Genel Bilgiler
- **Ürün Adı** (Zorunlu): Örn. "Klasik Hamburger", "Ayran 200ml", "Cheesecake"
- **SKU/Ürün Kodu** (Zorunlu): Benzersiz bir kod (Örn: `URN-001`, `IC-AYR-200`)
- **Satış Kategorisi** (Zorunlu): POS'ta hangi kategoride görüneceği (Örn: "Sandviçler")
- **Birim**: Genellikle "Porsiyon" veya "Adet"
- **KDV Oranı**: Satış KDV'si (Örn: %10)
- **Durum**: **Aktif** seçilmeli ki POS'ta görünsün

#### Sekme 2 — Fiyatlandırma
- **Satış Fiyatı**: KDV dahil veya hariç girin (sistem otomatik hesaplar)
- **Birden fazla fiyat listesi** varsa her biri için ayrı fiyat girin (Örn: Masada, Paket servis, Online)
- **Kanal bazlı fiyatlandırma**: POS, Garson, Kiosk için farklı fiyat girebilirsiniz

#### Sekme 3 — Şube/Lokasyon
- En az **bir şube seçin** (Zorunlu!) — ürünün hangi şubede satılacağı
- Her şubeyi checkbox'tan işaretleyin

#### Sekme 4 — Reçete (Maliyet Hesabı)
- **"Reçete Bağlı"** seçeneğini aktif edin
- **"+ Hammadde Ekle"** butonuna tıklayın ve stok kalemlerini seçin:
  - Her hammadde için **miktar** girin (Örn: Dana Kıyma — 0.150 kg)
  - Sistem bu girişlerden otomatik maliyet hesaplar
- Yarı mamul (yarı hazır ürün) kullanıyorsanız **"+ Yarı Mamul Ekle"** butonunu kullanın

#### Sekme 5 — Seçenekler (Opsiyonel)
- Ürüne "Ekstra sos", "Soğansız", "Büyük boy" gibi seçenekler eklemek için kullanılır
- Önce `/options` sayfasından seçenek grupları tanımlanmış olmalıdır
- Tanımlanmış seçenek gruplarını buradan ürüne atayın

4. **"Kaydet"** butonuna tıklayın.

### POS'ta Ürünü Görüntüleme
Ürünü kaydettikten sonra POS ekranında görünmesi için şunları kontrol edin:
- **Durum:** "Aktif" olarak işaretli mi?
- **Şube:** POS'u açtığınız şube, ürünün lokasyon listesinde var mı?
- **Satış Kategorisi:** Kategori POS'ta aktif mi?

### Toplu Ürün Yönetimi
- Ürün listesinde **birden fazla ürünü checkbox ile seçin** → Toplu aktif/pasif yapma, toplu kategori değiştirme yapabilirsiniz.
- **Arama kutusuna** ürün adı veya SKU yazarak hızlıca bulun.
- **Kategori filtresi** ile belirli bir kategorinin ürünlerini listeleyin.

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Ürün POS'ta görünmüyor | Şube seçilmemiş veya pasif | Şube seçin ve "Aktif" yapın |
| Maliyet hesaplanamıyor | Reçete eklenmemiş veya hammadde fiyatsız | Reçete ekleyin, hammadde alış fiyatını girin |
| Fiyat sıfır görünüyor | İlgili fiyat listesine fiyat girilmemiş | Fiyatlandırma sekmesinden fiyatı girin |
| SKU hatası alıyorum | Bu SKU zaten kullanımda | Farklı ve benzersiz bir SKU kullanın |

## 💡 İpuçları
- Ürün adını POS'ta nasıl görünmesini istiyorsanız öyle girin — kasiyerler bu adı görecek.
- Reçete olmadan da kayıt yapılabilir, ancak maliyet sıfır gösterilir.
- Aynı ürünü farklı porsiyonlarda satmak istiyorsanız (küçük/büyük): Her porsiyon için **ayrı bir satış kalemi** oluşturun.

## 🔗 İlgili Diğer Kılavuzlar
- **Seçenek Grupları Tanımlama** — `/options`
- **Fiyat Listeleri** — `/prices`
- **[Adım 5 →]** Sipariş ve Mal Kabul işlemleri
