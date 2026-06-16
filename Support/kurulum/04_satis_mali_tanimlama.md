# Kurulum Adım 4 — Satış Malı Tanımlama

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Menünüzdeki ürünleri (yemek, içecek, tatlı vb.) sisteme ekleyeceğinizde bu adımı uygularsınız. Satış malı, POS ekranında görünen ve müşteriye satılan üründür.

## 📍 Nerede Bulunur?
- **Menü Yolu:** Sol menü > Katalog > Satış Malı
- **Doğrudan Link:** /products
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
- **[Adım 1]** Şube tanımlaması tamamlanmış olmalı
- **[Adım 2]** Kategoriler tanımlanmış olmalı (opsiyonel ama önerilir)

---

## 📋 Adım Adım İşlem

1. `/products` sayfasına gidin.
2. Sağ üst köşedeki **"Satış Malı Ekle"** butonuna tıklayın.
3. Açılan modal **6 sekmeli**dir:

---

### Sekme 1 — Temel Bilgiler
| Alan | Açıklama |
|---|---|
| **SKU Kodu** | Ürün kodu. "Otomatik" checkbox'ını işaretlerseniz sistem üretir |
| **Satış Malı İsmi** *(Zorunlu)* | Ürünün tam adı (menüde ve raporlarda görünür) |
| **Kısa İsim** | POS butonunda yer kısıtlıysa bu görünür |
| **Lokasyon** *(Zorunlu)* | Bu ürünün satıldığı şube(ler). En az bir şube seçilmeden kaydedilemez |
| **Kategori** | Ürün kategorisi (opsiyonel) |

---

### Sekme 2 — Satış & Fiyat
Ürününüzün kanal bazında fiyatlarını bu sekmede tanımlarsınız.

- **"Tüm Fiyatlar Aynı"** toggle'ını açarsanız tüm kanallara tek fiyat girersiniz.
- Her satış kanalı (Hızlı Satış, Kiosk, Garson vb.) için:
  - **Durum**: Toggle ile o kanalda aktif/pasif
  - **Satış Fiyatı**: ₺ cinsinden fiyat
  - **KDV Oranı**: Kanala özel KDV

> ⚠️ **POS'ta görünmesi için:** İlgili kanalın (örn. "Hızlı Satış") **Durum toggle'ı açık** olmalı ve **fiyat girilmiş** olmalı.

---

### Sekme 3 — Seçenekler
Ürüne porsiyon ve seçenek grupları eklemek için kullanılır.

**Porsiyon / Boyut:**
- **"Porsiyon Ekle"** butonu ile Small, Medium, Large gibi boyutlar tanımlanır.

**Seçenek Grupları:**
- **"Seçenek Grubu Ekle"** butonu ile daha önce `/options` sayfasında tanımladığınız seçenek grupları eklenir.
- Her grup için **Zorunlu** toggle'ı ve min/maks seçim sayısı ayarlanabilir.

---

### Sekme 4 — Görsel
POS butonunun nasıl görüneceğini bu sekmede ayarlarsınız.

**POS / Hızlı Satış Görseli:**
- **Buton Rengi**: Renk paleti veya özel renk seçin
- **Metin Rengi**: Buton yazı rengi
- Veya **"Resim Yükle"** ile görsel ekleyin
- Küçük bir önizleme (120×120 px) anlık gösterilir

**Satış Kanalı Görseli (Online, Kiosk vb.):**
- **Ürün Görseli**: Kiosk ve online kanallar için ayrı görsel
- **Açıklama**: Ürün açıklama metni

---

### Sekme 5 — Ayarlar
| Ayar | Varsayılan | Açıklama |
|---|---|---|
| **Satış Durumu** | Açık | Kapatılırsa hiçbir kanalda satılamaz |
| **Favori Ürün** | Kapalı | Açılırsa POS'ta öne çıkar |
| **Ödemede bölünebilir** | Kapalı | Masada hesap bölme için |
| **Açıklama Yazdırma** | Kapalı | Mutfak fişine açıklama yazdırır |
| **Mutfakta Gizle** | Kapalı | Mutfak ekranında görünmez |

---

### Sekme 6 — Reçete
Bu ürünün üretilmesi için hangi hammaddelerden ne kadar kullanılacağını tanımlarsınız.
- **Malzeme** (stok malı), **Miktar**, **Birim**, **Fire %** alanları satır satır eklenir.
- Kanal ve porsiyon bazında farklı reçete tanımlanabilir.
- Reçete girilince maliyet otomatik hesaplanır.

---

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Ürün POS'ta çıkmıyor | Kanal toggle'ı kapalı veya fiyat girilmemiş | Sekme 2'de ilgili kanalı aktif edip fiyat girin |
| "Lokasyon seçmelisiniz" hatası | Şube seçilmemiş | Sekme 1'den şube seçin |
| Ürün görsel bulanık çıkıyor | Görsel yüksek çözünürlükte yüklendi | 500×500 px civarı PNG önerilir |
| Seçenek grubu eklenemiyor | Grup daha önce `/options` sayfasında tanımlanmamış | Önce `/options` sayfasından grup oluşturun |

## 🗑️ Silme ve Geri Alma
- Silme **geri alınabilir** (soft delete).
- Silinen ürünleri görmek için sayfanın sağ üstündeki **"Silinmişleri Göster"** toggle'ını açın.
- Satırdaki **↩️ Geri Al** ikonuna tıklayarak geri alabilirsiniz.

## 💡 İpuçları
- Reçete girilmiş ürünlerin maliyeti otomatik hesaplanır — fiyat-maliyet oranını raporlarda takip edebilirsiniz.
- Kiosk veya online satış yapıyorsanız Sekme 4'te mutlaka ürün görseli ekleyin.
- "Kısa İsim" alanını doldurun — POS butonunda yer az olduğunda kısa isim görünür, okunabilirliği artırır.

## 🔗 İlgili Kılavuzlar
- **[Adım 3 ←]** Tedarikçi ve Hammadde Tanımlama (`/stock-items`)
- **[Sipariş & Mal Kabul]** (`/orders`)
- **[Sadakat Sistemi]** (`/sadakat`)
