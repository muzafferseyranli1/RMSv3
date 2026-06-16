# Sipariş Oluşturma ve Mal Kabul Rehberi

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Tedarikçilerinizden hammadde sipariş etmek veya gelen malı stoka işlemek istediğinizde bu rehberi kullanın.

---

## Bölüm 1 — Sipariş Oluşturma

### 📍 Nerede Bulunur?
- **Menü Yolu:** Sol menü > Satın Alma > Siparişler
- **Doğrudan Link:** /orders
- **Sayfa Başlığı:** Şubeye göre değişir:
  - Normal şube: **"Siparişler"**
  - Ana depo: **"Depo Satinalma Siparişleri"**
  - Merkez mutfak: **"Mutfak Satinalma Siparişleri"**

### 📋 Sipariş Durumları
| Durum | Anlamı |
|---|---|
| **Taslak** | Henüz onaylanmamış |
| **İşlem Bekleniyor** | Aksiyon gerekiyor |
| **Onay Bekleniyor** | Yönetici onayı bekleniyor |
| **Sipariş Verildi** | Tedarikçiye iletildi |
| **Kısmi Kabul** | Bir kısmı teslim alındı |
| **Kabul Tamam** | Tamamı teslim alındı |
| **İptal** | Sipariş iptal edildi |

Sayfada bu durumlar **3 sekme** altında gruplanmıştır:
- **İşlem Bekleniyor** (Taslak + Bekleyen)
- **Onay Bekleniyor**
- **Sipariş Verildi** (Verilmiş + Kısmi + Tamamlanmış)

### 📋 Manuel Sipariş Oluşturma
1. Sağ üstteki **"Manuel Sipariş Oluştur"** butonuna tıklayın.
2. Açılan modalda **tek bir alan** vardır: **"Sipariş Akışı Seçin"** — daha önce tanımlanmış aktif sipariş akışlarından birini seçin (akış adı + tedarikçi + Otomatik/Manuel tipi görünür).
3. **"Sipariş Oluştur"** butonuna tıklayın.

> **Not:** **"Bugünün Siparişlerini Oluştur"** butonu otomatik akışları toplu tetikler — manuel müdahale gerektirmez.

### 🔍 Arama & Filtreleme
- **Metin arama:** Sipariş no, akış adı, açıklama veya tedarikçi adına göre
- **Sekme filtreleme:** Duruma göre 3 sekme
- **Şube/Depo seçimi:** Sayfa üstündeki dropdown ile farklı lokasyona geçilebilir

---

## Bölüm 2 — Mal Kabul

### 📍 Nerede Bulunur?
- **Menü Yolu:** Sol menü > Satın Alma > Mal Kabul
- **Doğrudan Link:** /mal-kabul
- **Sayfa Başlığı:** **"Mal Kabul"**

### 📋 Adım Adım Mal Kabul Akışı

1. **Şube seçin** — Sayfanın üstündeki dropdown'dan teslim alan şubeyi seçin.
2. **Sipariş listesinden seçin** — Durumu "Sipariş Verildi" veya "Kısmi Kabul" olan siparişler listelenir. İlgili siparişin yanındaki **"İşlem Yap"** butonuna tıklayın.
3. **Formu doldurun:**

#### Belge Bilgileri
| Alan | Zorunlu | Açıklama |
|---|---|---|
| **Tedarikçi** | ✅ Her zaman | Gönderen firma |
| **Teslim Tarihi** | ✅ | Malın geldiği tarih |
| **Teslim Saati** | - | Opsiyonel |
| **Sevk Belgesi** | ✅ | İrsaliye / İrsaliyeli Fatura / Belgesiz |
| **Belge No** | ✅ (belgesiz değilse) | İrsaliye/fatura numarası (max 16 karakter) |
| **Belge Tarihi** | ✅ (belgesiz değilse) | İrsaliye/fatura tarihi |
| **Not** | - | Teslim alan personel notu |
| **Açıklama** | ✅ (belgesiz ise) | Belgesiz kabulde zorunlu açıklama |

#### Satır Bazında Teslim Miktarı
Tabloda her ürün satırı için:
- **Sipariş Önerisi** — Sistemin hesapladığı ihtiyaç miktarı
- **Teslim Alınan** — Gerçekte gelen miktarı girin (kısmi olabilir)
- **Birim Fiyatı** — Güncel alış fiyatı (WAC hesabına dahil edilir)

> ✅ **Kısmi Teslimat:** Tüm miktarı almak zorunda değilsiniz. Daha az girerseniz sipariş "Kısmi Kabul" durumuna geçer ve kalan için tekrar işlem yapabilirsiniz.

#### WMS Modu Ek Alanlar (Ana Depoda)
Ana depo (WMS) modunda her satır için ek bilgi girilir:
| Alan | Açıklama |
|---|---|
| **Lokasyon** | Malın deponun hangi rafına kaldırılacağı (Zorunlu) |
| **LPN / Palet** | Palet numarası (opsiyonel) |
| **Lot No** | Parti/lot numarası |
| **SKT** | Son kullanma tarihi |
| **Durum** | Kullanılabilir / Karantina / Putaway Bekliyor |

4. **"Mal Kabulü Kaydet ve Stoğa İşle"** butonuna tıklayın.
   - Stok hareketi otomatik işlenir
   - WAC (Ağırlıklı Ortalama Maliyet) güncellenir
   - Tüm kalemler tam alındıysa sipariş "Kabul Tamam", kısmi ise "Kısmi Kabul" olur
   - Toast: `"Mal kabul kaydedildi ve stok güncellendi"`

### Manuel Mal Kabul (Siparişsiz)
Elinizdeki mal için önceden sipariş oluşturmadıysanız:
1. Sayfanın sağ üstündeki **"Manuel Mal Kabul"** butonuna tıklayın.
2. Boş form açılır — stok mallarını kendiniz ekleyerek kabul yapabilirsiniz.

---

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Sipariş listede görünmüyor | Sipariş durumu "Verildi" değil | `/orders` sayfasından sipariş durumunu kontrol edin |
| WMS lokasyon seçimi zorunlu hatası | Ana depoda lokasyon boş bırakıldı | Her satır için depo lokasyonu seçin |
| "Belgesiz kabulde açıklama zorunlu" | Sevk belgesi "Belgesiz" seçildi | Açıklama alanını doldurun |

## 💡 İpuçları
- İrsaliye numarasını mutlaka girin — denetim ve muhasebe için kritik
- Kısmi teslimatı kabul edin, kalan miktar için tedarikçiyle iletişime geçin
- Lot numarası girmek izlenebilirlik açısından önemlidir (özellikle gıda güvenliği için)

## 🔗 İlgili Kılavuzlar
- **[Adım 3 ←]** Tedarikçi ve Hammadde Tanımlama (`/stock-items`)
- **[Sadakat Sistemi]** (`/sadakat`)
