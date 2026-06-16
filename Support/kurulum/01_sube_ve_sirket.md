# Kurulum Adım 1 — Şirket ve Şube Yapısı Tanımlama

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
SuitableRMS'e ilk başladığınızda yapmanız gereken **ilk işlem** budur. Sistemdeki tüm modüller (stok, sipariş, sadakat) mutlaka bir şube veya merkez yapısına bağlı olmalıdır. Bu adım tamamlanmadan başka hiçbir şey eklenemez.

## 📍 Nerede Bulunur?
- **Menü Yolu:** Sol menü > Ayarlar > Şirket Kuruluşu
- **Doğrudan Link:** /company
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
Ön koşul yoktur — bu sistemin ilk adımıdır.

---

## 📋 Yapı Mantığı

Sistemde şirket yapısı bir **ağaç hiyerarşisi** şeklinde çalışır. Her bir düğüm (node) farklı bir tip olabilir:

| Tip | Ne İfade Eder? |
|---|---|
| **Şirket** | En üst düzey — tüm yapının kökü |
| **Tüzel** | Hukuki kuruluş (holding, grup şirketi) |
| **Org** | Organizasyonel birim |
| **Şube** | Fiziksel restoran/mağaza lokasyonu |
| **Ana Depo** | Merkezi depo |
| **Üretim** | Merkez mutfak |
| **GM** | Genel Müdürlük |
| **Depo** | Şubeye bağlı alt depo |

---

## 📋 Adım Adım İşlem

### 1. İlk Şirket Kaydını Oluşturun
1. `/company` sayfasına gidin. Sayfa boşsa (henüz hiç kayıt yoksa) sağ üst köşedeki **"Şirket Ekle"** butonuna tıklayın.
2. Açılan modalda alanları doldurun:
   - **Tür**: `Şirket` seçin
   - **Ad** *(Zorunlu)*: Firmanızın ticaret ünvanı
   - **Logo** *(İsteğe bağlı)*: Firma logosu yükleyin
   - **Para Birimi** *(Zorunlu)*: `TRY` (Türk Lirası) seçin
   - **Satış Varsayılan Vergi**: Genel KDV oranınızı seçin (önce `/taxes` sayfasından tanımlanmış olmalı)
3. **"Kaydet"** butonuna tıklayın.

### 2. Şube Ekleyin
Şirket kaydı oluşturduktan sonra ağaçta o şirkete tıklayın. Sağ tarafta **detay paneli** açılır.
1. Detay panelinde **"＋ Alt Düğüm"** butonuna tıklayın.
2. Açılan modalda:
   - **Tür**: `Şube` seçin
   - **Ad** *(Zorunlu)*: Şube adını girin (örn: "Kadıköy Şubesi")
   - **Enlem / Boylam** *(İsteğe bağlı)*: Harita konumu için GPS koordinatları
3. **"Kaydet"** butonuna tıklayın.
4. Her yeni şube için bu adımı tekrarlayın.

### 3. Ana Depo veya Merkez Mutfak Ekleyin (Varsa)
Aynı şekilde şirkete **"＋ Alt Düğüm"** butonuyla `Ana Depo` veya `Üretim` tipinde düğümler ekleyebilirsiniz.

---

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| "Şube Ekle" butonu yok | Şube ağaçtaki bir üst düğüme bağlı eklenir | Önce ağaçta şirkete tıklayın, detay panelinde "＋ Alt Düğüm" çıkar |
| Stok/sipariş sayfalarında şube seçilemiyor | Şube henüz tanımlanmamış | Bu adımı tamamlayın |
| KDV seçenekleri boş geliyor | Vergi tanımlanmamış | Önce `/taxes` sayfasından KDV oranı ekleyin |

## ⚠️ Kritik Uyarı — Silme İşlemi
> **Dikkat:** Şirket yapısında bir düğümü silmek **GERİ ALINAMAZ**. Silme onay ekranında `"Tüm alt düğümler de silinecektir. Bu işlem geri alınamaz."` uyarısı görürsünüz. Şube silmeden önce o şubeye bağlı tüm stok, sipariş ve personel kayıtlarını kontrol edin.

## 💡 İpuçları
- Birden fazla şubeniz varsa hepsini baştan ekleyin; sonraki adımlarda her stok/ürün kaydı bir şubeye bağlanacak.
- Şube adını kısa ve tanımlayıcı tutun — POS ekranında bu ad görünür.

## 🔗 Bir Sonraki Adım
- **[Adım 2 →]** Birimler ve Kategoriler Tanımlama (`/units` ve `/categories`)
