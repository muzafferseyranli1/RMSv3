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

## 📋 Adım Adım İşlem

### Birim Ekleme
1. **[Birimler sayfasına gidin]** `/units` adresine gidin.
2. **[Yeni birim ekleyin]** Sağ üst köşedeki **"+ Yeni Birim"** butonuna tıklayın.
3. **[Formu doldurun]** Açılan formda:
   - **Birim Adı** (Zorunlu): Örn. "Kilogram", "Litre", "Adet", "Kutu", "Porsiyon"
   - **Kısa Kod** (Zorunlu): Örn. `kg`, `lt`, `adet`, `kutu`, `por`
4. **"Kaydet"** butonuna tıklayın.
5. Tüm kullandığınız birimler için tekrarlayın.

> **💡 Tavsiye:** En yaygın birimler: kg, gr, lt, ml, adet, kutu, paket, porsiyon, dilim

### Hammadde Kategorisi Ekleme
Hammaddelerinizi (un, et, sebze, içecek hammaddesi vb.) gruplamak için kullanılır.

1. **[Kategoriler sayfasına gidin]** `/categories` adresine gidin.
2. **[Yeni kategori ekleyin]** **"+ Yeni Kategori"** butonuna tıklayın.
3. **[Formu doldurun]**:
   - **Kategori Adı**: Örn. "Etler", "Sebzeler", "Baharatlar", "İçecekler"
   - **Üst Kategori**: Hiyerarşik yapı için bir üst kategori seçebilirsiniz
   - **Renk**: Listelerde kolayca ayırt etmek için renk seçin
4. **"Kaydet"** butonuna tıklayın.

### Satış Ürünü Kategorisi Ekleme
POS ekranında ürünlerin hangi gruplarda görüneceğini belirler. (Hammadde kategorisinden **ayrı**!)

1. **[Satış Kategorileri sayfasına gidin]** `/sale-categories` adresine gidin.
2. **[Yeni kategori ekleyin]** **"+ Yeni Satış Kategorisi"** butonuna tıklayın.
3. **[Formu doldurun]**:
   - **Kategori Adı**: Örn. "Izgara Çeşitleri", "İçecekler", "Tatlılar", "Ana Yemekler"
   - **Üst Kategori**: Hiyerarşik yapı için seçebilirsiniz
   - **Görsel**: İsteğe bağlı kategori görseli yükleyebilirsiniz
   - **Renk**: POS ekranında gösterilecek renk
4. **"Kaydet"** butonuna tıklayın.

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Stok kartı eklerken birim listesi boş geliyor | Birim tanımlanmamış | `/units` sayfasından birim ekleyin |
| POS'ta ürün kategorisi seçilemiyor | Satış kategorisi tanımlanmamış | `/sale-categories` sayfasından kategori ekleyin |
| "Hammadde kategorisi" ile "Satış kategorisi" karıştırıldı | İki farklı sistem | Hammadde: `/categories` / Ürün: `/sale-categories` |

## 💡 İpuçları
- Hammadde ve satış kategorileri **tamamen ayrı** sistemlerdir. Un için "Unlu Mamuller" hammadde kategorisi, Hamburger için "Sandviçler" satış kategorisi oluşturursunuz.
- Kategorileri baştan iyi planlayın — sonradan değiştirmek zor olmasa da tutarlılık önemlidir.

## 🔗 Bir Sonraki Adım
- **[Adım 3 →]** Tedarikçi ve Hammadde Tanımlama (`/suppliers` ve `/stock-items`)
