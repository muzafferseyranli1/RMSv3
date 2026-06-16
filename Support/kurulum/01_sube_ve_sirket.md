# Kurulum Adım 1 — Şube ve Şirket Yapısı Tanımlama

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Sistemi ilk kez kuruyorsanız ya da yeni bir şube, depo veya mutfak birimi açıyorsanız buradan başlayın. Şube tanımlanmadan sisteme başka hiçbir şey eklenemez — tüm stok kartları, ürünler ve siparişler bir şubeye bağlıdır.

## 📍 Nerede Bulunur?
- **Menü Yolu:** Sol menü > Ayarlar > Şirket Bilgileri
- **Doğrudan Link:** /company
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
Başka bir ön koşul yoktur — bu ilk yapılacak işlemdir.

## 📋 Adım Adım İşlem

### Sistem İlk Açılışında Şirket ve Şube Tanımı
1. **[Ayarlar ekranına gidin]** Sol menüde **Ayarlar** bölümünü açın ve **Şirket Bilgileri** sayfasına gidin.
2. **[Genel bilgileri doldurun]** Şirket adı, vergi numarası, adres ve iletişim bilgilerini girin.
3. **[Şube ağacını oluşturun]** Sayfada **"Şube Yapısı"** veya **"Lokasyon Ağacı"** bölümüne inin. Burası sistemin omurgasıdır.
4. **[Yeni şube ekleyin]** **"+ Yeni Şube Ekle"** butonuna tıklayın. Açılan formda:
   - **Şube Adı** (Zorunlu): Örn. "Kadıköy Şubesi", "Merkez Depo", "Merkez Mutfak"
   - **Şube Tipi**: Şube / Depo / Mutfak seçeneklerinden birini seçin
   - **Şube Kodu**: Kısa ve benzersiz bir kod girin (Örn: `KDK`, `MRKZ-DPO`)
5. **[Kaydedin]** **"Kaydet"** butonuna tıklayın. Şube listede görünecektir.
6. **[Gerekirse tekrarlayın]** Her şube, depo veya mutfak için adımları tekrarlayın.

### Şube Bilgilerini Düzenleme
1. **Şirket Bilgileri** sayfasında mevcut şubenin yanındaki **kalem (✏️) ikonuna** tıklayın.
2. Değiştirmek istediğiniz alanları güncelleyin.
3. **"Kaydet"** butonuna tıklayın.

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Stok kartı eklerken şube seçilemiyor | Şube tanımlanmamış | Önce bu kılavuzdaki adımları uygulayın |
| Sipariş oluşturulurken lokasyon boş geliyor | Şube tipi yanlış seçilmiş | Şube tipini (Şube/Depo/Mutfak) doğru seçin |

## 💡 İpuçları
- Şube kodu sonradan değiştirmeniz güçleşebilir; başta düşünerek belirleyin.
- Sisteminizde tek şube olsa bile şube tanımlaması zorunludur.
- Depo ve Mutfak birimleri de birer "şube" olarak girilir, sadece tipi farklıdır.

## 🔗 Bir Sonraki Adım
Şubenizi tanımladıktan sonra:
- **[Adım 2 →]** Birimler ve Kategoriler Tanımlama (`/units` ve `/categories`)
