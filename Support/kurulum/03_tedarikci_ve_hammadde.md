# Kurulum Adım 3 — Tedarikçi ve Hammadde (Stok Kartı) Tanımlama

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Ürün maliyeti hesaplamak, sipariş vermek veya stok takibi yapmak için önce hammaddelerinizi sisteme girmeniz gerekir. Her hammadde, bir tedarikçiye bağlıdır. Bu adım tamamlanmadan satış ürünü reçetesi oluşturulamaz.

## 📍 Nerede Bulunur?

### Tedarikçiler
- **Menü Yolu:** Sol menü > Katalog > Tedarikçiler
- **Doğrudan Link:** /suppliers
- **Gerekli Oturum:** Merkez bölüm PIN'i

### Stok Kartları (Hammaddeler)
- **Menü Yolu:** Sol menü > Katalog > Stok Kalemleri
- **Doğrudan Link:** /stock-items
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
- **[Adım 1]** Şube tanımlanmış olmalı
- **[Adım 2]** Birimler ve kategoriler tanımlanmış olmalı

## 📋 Adım Adım İşlem

### Tedarikçi Ekleme
1. **[Tedarikçiler sayfasına gidin]** `/suppliers` adresine gidin.
2. **[Yeni tedarikçi ekleyin]** Sağ üst köşedeki **"+ Yeni Tedarikçi"** butonuna tıklayın.
3. **[Formu doldurun]** Açılan formda:
   - **Tedarikçi Adı** (Zorunlu): Örn. "Güven Et A.Ş.", "Taze Sebzeciler Ltd."
   - **Vergi No**: İstenirse girilir
   - **İletişim Bilgileri**: Telefon, e-posta, adres
   - **Ödeme Vadesi**: Kaç günlük vade ile çalışıldığı (Örn: 30)
4. **"Kaydet"** butonuna tıklayın.

### Stok Kartı (Hammadde) Ekleme
1. **[Stok Kalemleri sayfasına gidin]** `/stock-items` adresine gidin.
2. **[Yeni stok kalemi ekleyin]** Sağ üst köşedeki **"+ Yeni Stok Kalemi"** butonuna tıklayın.
3. **[Genel Bilgiler sekmesini doldurun]**:
   - **Stok Kalemi Adı** (Zorunlu): Örn. "Dana Kıyma", "Domates", "Zeytinyağı"
   - **SKU/Stok Kodu**: Sisteme özgü benzersiz kod (Örn: `ET-001`)
   - **Birim** (Zorunlu): Daha önce tanımladığınız birimlerden seçin (Örn: kg)
   - **Kategori**: Hammadde kategorisinden seçin (Örn: "Etler")
   - **Tedarikçi**: Bu malı hangi tedarikçiden aldığınızı seçin
   - **Satın Alma Fiyatı**: Son alış fiyatını girin (TL)
   - **KDV Oranı**: Malın alışındaki KDV'yi seçin
4. **[Şube/Lokasyon Ayarları sekmesine geçin]**:
   - En az **bir şube seçin** (Zorunlu!) — bu malın hangi şube(ler)de kullanılacağını belirler
   - Her şube için minimum stok seviyesi girebilirsiniz (sipariş uyarısı için)
5. **[Depo Ayarları sekmesine geçin]** (WMS kullananlar için):
   - Depo lokasyonu, sıcaklık sınıfı, paket bilgileri girin
6. **"Kaydet"** butonuna tıklayın.

### Stok Kartı Listesinde Hızlı Arama ve Filtreleme
- Üst kısımdaki **arama kutusuna** ürün adı veya SKU yazın
- **Kategori filtresi** dropdown'ından kategori seçerek filtreleyin
- **Tedarikçi filtresi** ile belirli bir tedarikçinin tüm mallarını görün

### Mevcut Stok Kartını Düzenleme
1. Listede düzenlemek istediğiniz satıra tıklayın veya **kalem (✏️) ikonuna** tıklayın.
2. Bilgileri güncelleyin.
3. **"Kaydet"** butonuna tıklayın.

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Stok kalemi kaydedilmiyor, "Şube seç" hatası | En az bir şube seçilmemiş | Lokasyon sekmesinden şube seçin |
| Birim dropdown boş geliyor | Birim tanımlanmamış | Önce `/units` sayfasından birim ekleyin |
| Reçetede bu malı bulamıyorum | Şube eşleşmesi yok | Stok kartının ve satış ürününün aynı şubeye atandığını kontrol edin |
| Tedarikçi seçilemiyor | Tedarikçi tanımlanmamış | Önce `/suppliers` sayfasından tedarikçi ekleyin |

## 💡 İpuçları
- Tüm hammaddeleri listeye eklemek zaman alır; en çok kullandığınız 20-30 malı önce girin, gerisi zamanla tamamlanır.
- SKU kodunu anlamlı belirleyin: Örn. `ET-001` için "et birinci ürün", `IC-003` için "içecek üçüncü ürün".
- **Birim seçimi kritiktir:** "Dana Kıyma" için `kg` seçtiyseniz, siparişler ve reçeteler de kg cinsinden olur.

## 🔗 Bir Sonraki Adım
- **[Adım 4 →]** Satış Malı (Ürün) Tanımlama — `/products`
