# Sipariş Oluşturma ve Mal Kabul İşlemleri

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Şubelerinizin tedarikçilerden veya merkez depodan malzeme sipariş etmesi, bu siparişlerin takibi ve mal geldiğinde kayıt yapılması gerektiğinde bu kılavuzu kullanın.

## 📍 Nerede Bulunur?

### Sipariş Yönetimi
- **Menü Yolu:** Sol menü > Şube > Siparişler
- **Doğrudan Link:** /orders
- **Gerekli Oturum:** Şube bölüm PIN'i

### Mal Kabul
- **Menü Yolu:** Sol menü > Şube > Mal Kabul
- **Doğrudan Link:** /mal-kabul
- **Gerekli Oturum:** Şube bölüm PIN'i

### Tedarikçi Sipariş Paneli
- **Menü Yolu:** Sol menü > Satınalma > Tedarikçi Paneli
- **Doğrudan Link:** /depo-satinalma
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
- Şube tanımlanmış olmalı
- Tedarikçiler ve hammaddeler (stok kartları) tanımlanmış olmalı
- Sipariş akışları (sipariş şablonları) yapılandırılmış olmalı (opsiyonel ama önerilir)

## 📋 Adım Adım İşlem

### Manuel Sipariş Oluşturma (Şube'den)
1. **[Sipariş sayfasına gidin]** `/orders` adresine gidin.
2. **[Yeni sipariş başlatın]** Sağ üst köşedeki **"+ Yeni Sipariş"** butonuna tıklayın.
3. **[Sipariş bilgilerini seçin]**:
   - **Tedarikçi**: Siparişi vereceğiniz tedarikçiyi seçin
   - **Teslimat Tarihi**: İstediğiniz teslim tarihini girin
   - **Teslimat Yeri**: Malın teslim alınacağı şubeyi/depoyu seçin
4. **[Kalem ekleyin]** Sayfada çıkan stok listesinden sipariş vereceğiniz malları seçin:
   - İlgili stok kaleminin satırında **miktar kutusuna** ne kadar sipariş verdiğinizi girin
   - Sistem önerilen sipariş miktarını gösterebilir (stok seviyesine göre)
5. **[Sipariş notunu girin]** (İsteğe bağlı): Tedarikçiye iletmek istediğiniz özel notu girin.
6. **"Siparişi Gönder"** butonuna tıklayın.
7. Sipariş "Gönderildi" statüsüne geçer ve tedarikçi sipariş panelinde görünür.

### Sipariş Durumu Takibi
Sipariş listesinde her siparişin durumu şu sırayı izler:
| Durum | Açıklama |
|---|---|
| **Taslak** | Henüz gönderilmemiş |
| **Gönderildi** | Tedarikçiye iletildi |
| **Onaylandı** | Tedarikçi onayladı |
| **Sevk Edildi** | Tedarikçi yola çıkardı |
| **Tamamlandı** | Mal kabul yapıldı |
| **İptal** | İptal edildi |

### Mal Kabul İşlemi
Sipariş edilen mal geldiğinde stok giriş yapılması için:

1. **[Mal Kabul sayfasına gidin]** `/mal-kabul` adresine gidin.
2. **[İlgili siparişi bulun]** Sayfada bekleyen siparişler listelenir. İlgili siparişi seçin.
3. **[Gelen miktarları girin]**:
   - Sipariş edilen her kalem için **"Gelen Miktar"** kutusuna fiili gelen miktarı girin
   - Sipariş miktarıyla gelen miktar farklıysa sistem bu farkı gösterir
   - **Lot Numarası / SKT** (son kullanma tarihi): WMS kullananlar için girin
4. **[Fatura bilgisini girin]** (İsteğe bağlı):
   - Fatura No, Fatura Tarihi, Fatura Tutarı
5. **"Mal Kabulü Tamamla"** butonuna tıklayın.
6. Stok miktarları otomatik güncellenir, maliyet hesaplaması güncellenir.

### Kısmi Teslimat (Eksik Mal Gelirse)
- Gelen miktarı sipariş miktarından az girerseniz sistem **"Kısmi Teslim"** durumuna alır.
- Kalan miktar için sipariş açık kalır, ikinci bir teslimat yapılabilir.

### Sipariş İptal Etme
1. Sipariş listesinde iptal etmek istediğiniz siparişi bulun.
2. Sağdaki **"İptal"** butonuna veya üç nokta menüsünden **"İptal Et"** seçeneğine tıklayın.
3. İptal nedenini girin ve onaylayın.

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Sipariş listesinde ürünler çıkmıyor | Stok kartı bu şubeye atanmamış | Stok kartına şubeyi ekleyin |
| Mal kabul sonrası stok güncellenmedi | Mal kabul tamamlanmadı (taslakta kaldı) | "Tamamla" butonuna basıldığını kontrol edin |
| Tedarikçi seçilemiyor | Tedarikçi tanımlanmamış | `/suppliers` sayfasından ekleyin |
| Sipariş WMS depo siparişiyle karışıyor | WMS depo siparişleri ayrı sistemdir | Şube siparişi için `/orders`, depo replenishment için `/depo-orders` kullanın |

## 💡 İpuçları
- **Sipariş Akışları** (düzenli tedarikçilerle çalışıyorsanız): Haftalık otomatik sipariş şablonları kurabilirsiniz — böylece her pazartesi aynı tedarikçiye aynı ürünler otomatik siparişe gider.
- Mal geldiğinde **aynı gün** mal kabul yapın — stok ve maliyet tutarlılığı için kritiktir.
- Lot numarası girilen mallar WMS üzerinde tam takip edilir.

## 🔗 İlgili Diğer Kılavuzlar
- **WMS Depo Görevleri** — `/depo-wms-tasks`
- **Tedarikçi Yönetimi** — `/suppliers`
- **Sadakat Sistemi** — Kapsamlı sadakat kılavuzu
