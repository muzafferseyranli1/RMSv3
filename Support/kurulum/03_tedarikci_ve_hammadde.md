# Kurulum Adım 3 — Tedarikçi ve Hammadde (Stok Malı) Tanımlama

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Mutfağınıza giren hammaddeleri (un, et, sebze, ambalaj vb.) sisteme kaydetmek istediğinizde bu adımı uygularsınız. Önce tedarikçiyi, ardından o tedarikçiden aldığınız stok mallarını tanımlarsınız.

## 📍 Nerede Bulunur?

### Tedarikçiler
- **Menü Yolu:** Sol menü > Satın Alma > Tedarikçiler
- **Doğrudan Link:** /suppliers
- **Gerekli Oturum:** Merkez bölüm PIN'i

### Stok Malları (Hammaddeler)
- **Menü Yolu:** Sol menü > Katalog > Stok Malı
- **Doğrudan Link:** /stock-items
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
- **[Adım 1]** Şube tanımlaması tamamlanmış olmalı
- **[Adım 2]** Ölçü birimleri tanımlanmış olmalı (kg, lt vb.)

---

## 📋 Adım Adım İşlem — Tedarikçi Ekleme

1. `/suppliers` sayfasına gidin.
2. Sağ üst köşedeki **"Tedarikçi Ekle"** butonuna tıklayın.
3. Açılan modal **3 sekmeli**dir:

### Sekme 1 — Genel Bilgiler
| Alan | Açıklama |
|---|---|
| **Cari Kodu** | Muhasebe sisteminizdeki cari kodu |
| **Tedarikçi Adı (Ünvanı)** *(Zorunlu)* | Firma ticaret ünvanı |
| **Marka / Kısa Adı** | Kısa tanımlayıcı isim |
| **Şirket Tipi** | Tüzel Kişilik veya Şahıs Şirketi |
| **Vergi Dairesi / Vergi No** | Fatura bilgileri için |
| **Fatura Tipi** | E-Fatura / E-Arşiv / Kağıt Fatura / Parakende Satış Fişi |
| **Ödeme Vadesi (gün)** | Kaç gün vadeli ödeme yapıyorsunuz |
| **Aktif** | Toggle — pasife alırsanız sipariş akışlarında görünmez |
| **IBAN** | Banka bilgisi |
| **Adres / Notlar** | Serbest metin |
| **Marka Logosu** | Tedarikçi logosu (opsiyonel) |

### Sekme 2 — Yetkili & İletişim
Her yetkili kişi için **Ad Soyad**, **E-posta**, **Telefon** alanları doldurulur. Birden fazla yetkili eklenebilir.

### Sekme 3 — Sipariş Ayarları
| Alan | Açıklama |
|---|---|
| **Sipariş İletme Yöntemi** | E-Mail / Telefon / Whatsapp / Entegrasyon / Suitable Tedarikçi Arayüzü |
| **Sipariş Maili** | Birden fazla e-posta girilebilir |
| **Sipariş Telefonu** | Birden fazla numara girilebilir |

4. **"Kaydet"** butonuna tıklayın.

### Tedarikçi Silme ve Geri Alma
- Silme **geri alınabilir** (soft delete). Onay ekranında `"Silinen kayıt geri alınabilir."` mesajı görürsünüz.
- Silinen tedarikçiyi görmek için sayfanın sağ üstündeki **"Silinmişleri Göster"** toggle'ını açın.
- Geri almak için satırdaki **↩️ Geri Al** ikonuna tıklayın.

> **Not:** İç tedarikçiler (Merkez Mutfak, İç Depo) sistem tarafından otomatik oluşturulur ve silinemez.

---

## 📋 Adım Adım İşlem — Stok Malı (Hammadde) Ekleme

1. `/stock-items` sayfasına gidin.
2. Sağ üst köşedeki **"Stok Malı Ekle"** butonuna tıklayın.
3. Açılan modal **4 sekmeli**dir:

### Sekme 1 — Temel Bilgiler
| Alan | Açıklama |
|---|---|
| **SKU Kodu** | Barkod/stok kodu. "Otomatik" checkbox'ını işaretlerseniz sistem üretir |
| **Malzeme İsmi** *(Zorunlu)* | Hammaddenin adı |
| **Kısa İsim** | Opsiyonel kısaltma |
| **Lokasyon** *(Zorunlu)* | Bu malın hangi şube(ler)de kullanılacağı. En az bir şube seçilmeden kaydedilemez |
| **Kategori** | Hammadde kategorisi (opsiyonel) |
| **Malzeme Görseli** | Görsel yükleme (opsiyonel) |

### Sekme 2 — Ölçüm & Stok
| Alan | Açıklama |
|---|---|
| **Ölçü Birimi (Temel)** *(Zorunlu)* | kg, lt, adet vb. — Adım 2'de tanımladığınız birimler buraya gelir |
| **En / Boy / Yükseklik / Ağırlık** | Fiziksel ölçüler (opsiyonel) |
| **Barkodlar** | Birden fazla barkod eklenebilir |
| **Paketleme Birimleri** | Koli, palet vb. paket birimleri (opsiyonel) |
| **Minimum / Maksimum Stok** | Alarm seviyeleri |
| **Sipariş Birimi / Min-Max Sipariş** | Otomatik sipariş hesabı için |

### Sekme 3 — Tedarikçi & Satış
| Alan | Açıklama |
|---|---|
| **Tedarikçi Seç** | Bu malı aldığınız tedarikçi(ler). Birden fazla eklenebilir, biri "Varsayılan" seçilir |
| **Alış Fiyatı** | Her tedarikçi için ayrı fiyat |
| **Bu stok malı tek başına satılabilir** | İşaretlerseniz hem hammadde hem satış ürünü olarak kullanılır |

### Sekme 4 — Depo Ayarları
> Bu sekme yalnızca **Sekme 3'te bir İç Depo tedarikçisi** seçiliyse aktif olur.
Seçili Ana Depo için min/maks stok, sipariş miktarı ve şubeye sevk fiyatı girilir.

4. **"Kaydet"** butonuna tıklayın.

> ⚠️ **En Sık Yapılan Hata:** Lokasyon seçmeden kaydetmeye çalışmak. Sistem `"En az bir lokasyon seçmelisiniz"` hatası verir ve Sekme 1'e geri döner.

### Stok Malı Silme ve Geri Alma
- Silme geri alınabilir. **"Silinmişleri Göster"** toggle'ıyla görüntüleyip **↩️ Geri Al** butonu ile geri alabilirsiniz.

---

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Ölçü birimi dropdown'ı boş | Birim tanımlanmamış | Önce `/units` sayfasından birim ekleyin |
| Tedarikçi dropdown'ında görünmüyor | Tedarikçi "Pasif" durumda | `/suppliers` sayfasından aktif edin |
| "Depo Ayarları" sekmesi kilitli (gri) | İç Depo tedarikçisi seçilmemiş | Sekme 3'te bir İç Depo tedarikçisi seçin |
| Sipariş oluşturulunca mal görünmüyor | Lokasyon seçilmemiş | Sekme 1'den ilgili şubeyi lokasyon olarak ekleyin |

## 💡 İpuçları
- Sık kullandığınız malzemeler için minimum stok seviyesi belirleyin — sistem sizi uyarır.
- Birden fazla tedarikçiden aynı malı aldığınızda hepsini ekleyip birini "Varsayılan" olarak işaretleyin.
- Tedarikçi sipariş yöntemini "E-Mail" seçerseniz sipariş oluşturulduğunda sistem otomatik e-posta gönderebilir.

## 🔗 İlgili Kılavuzlar
- **[Adım 2 ←]** Birimler Tanımlama (`/units`)
- **[Adım 4 →]** Satış Malı Tanımlama (`/products`)
- **[Sipariş & Mal Kabul]** (`/orders` ve `/mal-kabul`)
