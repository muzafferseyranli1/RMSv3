# Kurulum Adım 2 — Birimler ve Kategoriler Tanımlama

## 🎯 Bu Rehber Ne Zaman İşe Yarar?
Hammadde ve ürün eklemeden önce, bunların hangi birimlerde ölçüleceğini (kg, litre, adet) ve hangi kategorilere gireceğini belirlemeniz gerekir. Bu tanımlamalar yapılmadan stok kartı kaydedilemez.

## 📍 Nerede Bulunur?

### Birimler (Ölçü Birimleri)
- **Menü Yolu:** Sol menü > Katalog > Birimler
- **Doğrudan Link:** /units
- **Gerekli Oturum:** Merkez bölüm PIN'i

### Hammadde Kategorileri
- **Menü Yolu:** Sol menü > Katalog > Kategoriler
- **Doğrudan Link:** /categories
- **Gerekli Oturum:** Merkez bölüm PIN'i

### Satış Ürünü Kategorileri
- **Menü Yolu:** Sol menü > Katalog > Satış Kategorileri
- **Doğrudan Link:** /sale-categories
- **Gerekli Oturum:** Merkez bölüm PIN'i

## 🔑 Ön Koşullar
- **[Adım 1]** Şube tanımlaması tamamlanmış olmalı

---

## 📋 Adım Adım İşlem

### Yeni Birim Ekleme
1. **[Birimler sayfasına gidin]** `/units` adresine gidin. Sayfa açıldığında iki grup görürsünüz:
   - **Sistem Birimleri** — Sisteme önceden tanımlı, silinemez ve düzenlenemez (kg, lt, adet vb.)
   - **Özel Birimler** — Sizin eklediğiniz birimler
2. **[Yeni birim ekleyin]** Sayfanın sağ üst köşesindeki **"Birim Ekle"** butonuna tıklayın.
3. **[Açılan modalı doldurun]** Tam olarak 3 alan vardır, başka alan yoktur:
   - **Birim Adı** *(Zorunlu)*: Kullanıcıya gösterilecek tam ad. Örn: `Sepet`, `Varil`, `Torba`
   - **Kısa Kod** *(Zorunlu)*: Sistem içinde kullanılan benzersiz kod. Küçük harf, boşluksuz olmalı. Örn: `sepet`, `varil`, `torba`
   - **Sembol** *(İsteğe bağlı)*: Kısa gösterim için. Örn: `spt`, `vrl`
4. **"Kaydet"** butonuna tıklayın.

> ⚠️ **Dikkat:** Aynı kısa kodu daha önce tanımladıysanız sistem **"Bu kod zaten mevcut"** hatası verir. Farklı bir kısa kod seçin.

---

### Birimi Düzenleme
1. Listede düzenlemek istediğiniz birimin satırında **kalem (✏️) ikonuna** tıklayın.
2. Birim Adı, Kısa Kod ve Sembol alanlarını güncelleyin.
3. **"Kaydet"** butonuna tıklayın.

> **Not:** Sistem birimleri (kg, lt vb.) düzenlenemez — satırlarında kalem ikonu görünmez, yerine tire (—) gösterilir.

---

### Birimi Silme
1. Silmek istediğiniz birimin satırında **çöp kutusu (🗑️) ikonuna** tıklayın.
2. **"Silme Onayı"** ekranı açılır: `"[Birim Adı] birimi silinsin mi? Bu birimi kullanan stok malları etkilenebilir."` mesajı görürsünüz.
3. Onaylarsanız birim listeden kalkar, ancak tamamen silinmez — geri alınabilir.

> ⚠️ **Uyarı:** Stok kartlarında kullanımda olan birimleri silmeden önce tüm stok kartlarını kontrol edin. Silme işlemi geri alınabilir olsa da, aradaki süreçte stok kartı kaydedilmeye çalışılırsa sorun yaşanabilir.

---

### Silinen Birimi Geri Alma
Yanlışlıkla sildiğiniz birimi geri alabilirsiniz:
1. Sayfanın sağ üst köşesindeki **"Silinmişleri Göster"** toggle'ını açın (kırmızıya döner).
2. Listede silinen birimler kırmızı/üzeri çizili görünür.
3. Geri almak istediğiniz birimin satırında **geri al (↩️) ikonuna** tıklayın.
4. Birim tekrar aktif hale gelir.

---

### Birim Arama
Sayfanın üst kısmında bir arama kutusu bulunur. Birim adı veya kısa koda göre anlık filtreleme yapabilirsiniz.

---

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Stok kartı eklerken birim listesi boş geliyor | Birim tanımlanmamış | `/units` sayfasından birim ekleyin |
| "Bu kod zaten mevcut" hatası | Aynı kısa kod daha önce tanımlı | Farklı bir kısa kod kullanın (ör: `torba2`) |
| Kalem / çöp ikonu görünmüyor | Sistem birimi — değiştirilemez | Sistem birimlerini düzenleyemezsiniz; satırda tire (—) görürseniz bu sistemin kendi birimidir |
| Silinen birim listede gözükmüyor | "Silinmişleri Göster" toggle kapalı | Sağ üstteki toggle'ı açın (kırmızıya döner) |

## 💡 İpuçları
- Sisteme gelen hazır birimler (kg, lt, adet, porsiyon vb.) büyük ihtimalle ihtiyacınızı karşılar — önce onları kontrol edin.
- Kendi özel biriminizi eklerken kısa kodu anlamlı tutun: `varil` yerine `vrl` gibi.
- Hammadde ve satış kategorileri **tamamen ayrı** sistemlerdir (bir sonraki adımda açıklanır).

## 🔗 Bir Sonraki Adım
- **[Adım 3 →]** Tedarikçi ve Hammadde Tanımlama (`/suppliers` ve `/stock-items`)
