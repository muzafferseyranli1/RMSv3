# Sadakat Sistemi — Kapsamlı Kullanım Kılavuzu

## 🎯 Sadakat Sistemi Ne İşe Yarar?
Müşterilerinize her alışverişlerinde puan kazandırın, özel kampanyalar tanımlayın, uyuyan müşterilerinizi geri kazanın ve en sadık müşterilerinizi ödüllendirin. SuitableRMS sadakat sistemi; puan, damga (stamp), nakit iade, kupon ve hediye kartı modellerini destekler.

---

## 📍 Sadakat Modülünün Haritası
| Ekran | Link | Ne İşe Yarar? |
|---|---|---|
| **Sadakat Yönetimi** (Ana Ekran) | /sadakat | Kampanyalar, seviyeleri, referans programları, ayarlar |
| **Kupon Yönetimi** | /sadakat/kupon-serileri | Kupon serisi oluşturma ve dağıtım |
| **Yeni Kampanya** | /sadakat/kampanya/yeni | Sıfırdan kampanya oluşturma |
| **Müşteriler** | /musteriler | Müşteri kayıtları ve üyelik bilgileri |

**Gerekli Oturum:** Merkez bölüm PIN'i

---

## 🏗️ Sistemi İlk Kez Kurma (Kurulum Sırası)

### Adım 1 — Program Ayarları
1. `/sadakat` adresine gidin ve **"Program Ayarları"** sekmesine tıklayın.
2. Şu bilgileri doldurun:
   - **Sadakat Program Adı**: Örn. "Lezzet Kulübü", "Altın Üyelik Programı"
   - **Program Türü**:
     - 🏅 **Puan Tabanlı**: Harcama = Puan. Puanlar indirime dönüşür.
     - 🎠 **Damga (Stamp) Tabanlı**: Her ziyaret = 1 damga. X damgada ödül.
     - 💰 **Nakit İade (Cashback)**: Harcamanın %'si cüzdana yatar.
   - **Kazanım Modeli**:
     - *Harcama Tutarına Göre*: Örn. "Her 1 TL harcamada 1 puan"
     - *Sipariş Başına Sabit*: Her siparişe X puan
   - **Puan Dönüşüm Oranı**: Örn. "100 Puan = 1 TL indirim"
   - **Bildirim Kanalı**: Müşterilere SMS mi, Push mu, ikisi de mi gönderilsin?
3. **"Sadakat Programı Genel Aktif"** checkbox'ını işaretleyin.
4. **"Kaydet"** butonuna tıklayın.

### Adım 2 — Sadakat Seviyeleri (Tier) Tanımlama
Müşterileri ne kadar harcadıklarına göre sınıflara ayıran sistem (Bronz, Gümüş, Altın gibi).

1. `/sadakat` adresinde **"Sadakat Seviyeleri"** sekmesine tıklayın.
2. Sistem size varsayılan 3 seviye önerir (Bronz, Gümüş, Altın). Bunları düzenleyebilir veya yenisini ekleyebilirsiniz.
3. Her seviye için:
   - **Kademe Adı**: Örn. "Bronz Üye", "Gümüş Üye", "Altın Üye"
   - **Asgari Harcama (TL)**: O kademeye girebilmek için toplam harcama eşiği. Bronz için genellikle 0 TL girilir.
   - **Asgari Sipariş Sayısı**: Kademeye girmek için minimum sipariş adedi
   - **Puan Katsayısı**: Bu kademe müşteriler kaç katı puan kazanır? Örn. Altın için 1.5x
   - **Doğum Günü Puanı**: Bu kademede doğum gününde verilecek bonus puan
   - **Kademe Rengi**: Uygulamada gösterilecek renk
4. **"Kaydet"** butonuna tıklayın.

---

## 📣 Kampanya Oluşturma — Adım Adım

### Yeni Kampanya Oluşturma
1. `/sadakat` sayfasında **"Kampanyalar"** sekmesinde **"+ Yeni Kampanya"** butonuna tıklayın veya `/sadakat/kampanya/yeni` adresine gidin.
2. **Kampanya editörü 8 bölümden oluşur:**

#### Bölüm 1 — Temel Bilgiler
- **Kampanya Adı**: Örn. "Hafta Sonu Bonus Puanı", "Yeni Müşteri Hoş Geldin"
- **Kampanya Kodu**: Kısa ve benzersiz (Örn: `HFTSONU`, `HOSGELDIN`)
- **Açıklama**: İç kullanım için not (müşteriye gösterilmez)

#### Bölüm 2 — Tip & Tetikleyici
- **Kampanya Tipi** — Ne verilecek?
  - 🎁 *Bonus Puan* — Sabit puan yükle
  - 📈 *Ekstra Katsayı* — Puan çarpanı artır
  - 💸 *Yüzde İndirim* — Sepete yüzde indirim
  - 💴 *Tutar İndirimi* — Sepete sabit TL indirim
  - 🎀 *Ürün/Hediye* — Ücretsiz ürün ver
  - 🎟️ *Kupon Kilidi Aç* — Müşteriye kupon tanımla
- **Tetikleyici** — Kampanya ne zaman devreye girer?
  - *Manuel* — Kasiyer elle aktive eder
  - *İlk Alışveriş* — Müşterinin ilk siparişinde otomatik
  - *Sipariş Tamamlandı* — Her siparişin ardından
  - *Doğum Günü* — Doğum günü çevresinde
  - *Uyuyan Müşteri* — X gündür gelmeyen müşteri
  - *Sepet Tutarı* — Belirli bir tutarı geçince
  - *Ziyaret Sayısı* — Belirli bir sipariş sayısına ulaşınca

#### Bölüm 3 — Hedef Kitle
- **Tüm Müşteriler** — Herkese açık
- **Sadakat Üyeleri** — Sadece kayıtlı üyeler
- **Yeni Müşteriler** — İlk kez gelenler
- **Pasif Müşteriler** — Uzun süredir gelmeyen müşteriler
- **Müşteri Kategorileri** — Özel olarak etiketlediğiniz gruplar

#### Bölüm 4 — Kanal Hedefleme
Hangi kanallardan yapılan siparişler için kampanya geçerli olsun?
- ✅ POS (Kasa)
- ✅ Garson (Masa servisi)
- ✅ Kiosk
- ✅ Çağrı Merkezi
- ✅ Online
- ✅ Mobil Uygulama
Checkbox'ları işaretleyin. (Hepsini seçerseniz tüm kanallar için geçerli)

#### Bölüm 5 — Tarih & Öncelik
- **Başlangıç / Bitiş Tarihi**: Boş bırakırsanız süresiz devam eder
- **Öncelik**: Küçük sayı = yüksek öncelik. Birden fazla kampanya çakışırsa düşük sayılı kazanır.

#### Bölüm 6 — Birleştirme Kuralı (Stacking)
- **Birleşebilir**: Bu kampanya diğer kampanyalarla aynı anda çalışır
- **Gruba Özel**: Aynı gruptaki kampanyalardan sadece biri aktif olur
- **Münhasır**: Bu kampanya aktifken başka hiçbir kampanya çalışmaz

#### Bölüm 7 — Uygulama Modu
- **Kasiyere Sor**: Kasiyer POS'ta manuel aktive etmeli
- **Otomatik Uygula**: Koşullar sağlandığında sistem kendiliğinden devreye girer

#### Bölüm 8 — Kural Blokları (Koşul → Eylem)
Bu en kritik bölümdür. Her kural bloğu "eğer [koşul] → [eylem yap" mantığıyla çalışır.

**Kural Bloğu Ekleme:**
1. **"+ Yeni Kural Bloğu"** butonuna tıklayın.
2. Bloğun sol (mavi) tarafına **Koşul ekleyin**:
   - **"+ Koşul Ekle"** butonuna tıklayın
   - Açılan modalden koşul tipini seçin:
     - *"Sepet tutarı"* → Sipariş X TL'den büyük ise
     - *"Dönem içindeki sipariş adedi"* → Bu ay X'ten fazla sipariş verdiyse
     - *"X gündür gelmeyen"* → Son 30 gündür sipariş yoksa
     - *"Doğum günü"* → Bugün doğum günüyse (±N gün ayarlayabilirsiniz)
     - *"Müşteri kategorisindeyse"* → Belirli bir segmentteyse
     - vb.
   - Koşul değerlerini girin (sayı, tarih aralığı, kategori seçimi)
   - Birden fazla koşul eklerseniz aralarında **VE / VEYA** bağlacını seçin
3. Bloğun sağ (sarı) tarafına **Eylem ekleyin**:
   - **"+ Eylem Ekle"** butonuna tıklayın
   - Açılan modalden eylem tipini seçin:
     - *"Puan Yükle"* → Sabit puan veya % puan
     - *"Puan Kazanma Katsayısı"* → Puan çarpanı uygula
     - *"Sipariş İndirimi"* → Sepetten TL düş
     - *"Yüzde İndirim"* → % indirim uygula
     - *"Hediye Ürün"* → Ücretsiz ürün ekle
     - *"Kupon Yarat"* → Müşteriye kupon oluştur
     - *"SMS Gönder"* → Müşteriye mesaj yolla
     - *"Müşteri Kategorisi Ekle/Çıkar"* → Segmente ata
     - vb.
   - Eylem parametrelerini girin
4. **"Akışı Durdurur"** toggle: Bu kural tetiklenirse sonraki kurallar çalışmasın mı?
5. Birden fazla kural bloğu ekleyebilirsiniz — her blok sırayla değerlendirilir.

3. Tüm bölümleri doldurduktan sonra **"Kampanyayı Kaydet"** butonuna tıklayın.

---

## 🛑 Senaryo: "Satışlar Düştü, Eski Müşterilerim Gelmiyor" — Ne Yapmalıyım?

Bu çok yaygın bir durumdur. Adım adım çözüm:

### Adım 1 — Uyuyan Müşterileri Tespit Edin
1. `/musteriler` sayfasına gidin.
2. Listede **"Son Sipariş Tarihi"** sütununa göre sıralama yapın (en eskiden yeniye).
3. Son 60 günde sipariş vermeyen müşteri grubunu belirleyin. Bu gruba "uyuyan müşteriler" denir.

### Adım 2 — Geri Kazanım Kampanyası Oluşturun
1. `/sadakat/kampanya/yeni` adresine gidin.
2. **Kampanya Adı**: "Sizi Özledik — Geri Dönün!"
3. **Tetikleyici**: **"Uyuyan Müşteri"** seçin
4. **Hedef Kitle**: **"Pasif Müşteriler"** seçin
5. **Kural Bloğu Ekleyin**:
   - Koşul: **"X gündür gelmeyen"** → 45 gün (veya belirlediğiniz süre)
   - Eylem 1: **"SMS Gönder"** → Mesaj: "Sizi özledik! Bugün gelin, {{loyalty_points}} + 100 bonus puan kazanın 🎁"
   - Eylem 2: **"Puan Yükle"** → 100 bonus puan (ya da indirim kuponu)
6. **Uygulama Modu**: Otomatik
7. **Kaydet**

> 💡 **İpucu:** Bu kampanya yalnızca o kriterin (45 günde gelmemek) ilk karşılandığı anda tetiklenmelidir. "Akışı Durdurur" seçeneğini açın, önceliği düşük tutun.

### Adım 3 — Doğum Günü Kampanyası Kurun
Özel günlerde müşteriler daha kolay geri kazanılır.
1. Yeni kampanya oluşturun, tetikleyici: **"Doğum Günü"**
2. Koşul: Doğum gününe **-3 gün / +3 gün** (hafta boyunca geçerli)
3. Eylem: **"Bonus Puan Yükle"** → 200 puan + **"SMS Gönder"** → "Doğum gününüz kutlu olsun! Size özel 200 puan hesabınızda 🎂"

### Adım 4 — Sadık Müşterileri Kademelendirin (Tier)
Altın müşterilere özel avantajlar tanımlayın ki geri gelmeleri için motivasyonları artsın.
1. **"Sadakat Seviyeleri"** sekmesine gelin.
2. "Altın" kademesine: puan katsayısını 1.5x yapın, doğum günü bonusunu yükseltin.
3. Müşterilere SMS ile bildirin: "Altın üye olarak bu ay %50 daha fazla puan kazanıyorsunuz!"

---

## 🎟️ Kupon Oluşturma ve Dağıtma

### Kupon Serisi Oluşturma
1. `/sadakat/kupon-serileri` adresine gidin.
2. **"+ Yeni Seri"** butonuna tıklayın.
3. **Seri Bilgileri**:
   - **Seri Adı**: Örn. "Nisan Kampanya Kuponu"
   - **Ön Ek (Prefix)**: Örn. `NIS24` (tüm kuponlar bu harflerle başlar)
   - **Kupon Sayısı**: Kaç adet üretilsin? (Örn: 500)
   - **Karakter Seti**: Sadece Rakamlar / Sadece Harfler / Harf+Rakam
   - **Rastgele Uzunluk**: Ön ek sonrasındaki rastgele karakterlerin sayısı (Örn: 6)
4. **Geçerlilik**:
   - **Geçerlilik Başlangıcı / Bitişi**: Tarih aralığı
   - **Verilişten İtibaren Gün**: Kuponun verildiği günden itibaren X gün geçerli
5. **"Oluştur"** butonuna tıklayın. Tüm kupon kodları üretilir.
6. **"Tümünü Kopyala"** ile Excel'e aktarabilir veya **"Kodları Göster"** ile listeleyebilirsiniz.

### Kampanyada Kupon Kullanma
- Kampanya editöründe Eylem olarak **"Kupon Yarat"** seçin ve ilgili seriyi atayın.
- Koşul sağlandığında sistem otomatik kupon üretir ve müşteriye atar.

---

## 🔗 Referans Programı Kurma
Müşterileriniz başkalarını getirince ödüllendirilsin!

1. `/sadakat` sayfasında **"Referans Programları"** sekmesine tıklayın.
2. **"+ Yeni Program"** butonuna tıklayın.
3. **Program Detayları**:
   - **Mod**: Her referans için ayrı kod / Tek bir yeniden kullanılabilir kod
   - **Başarı Kriteri**: Referans verilen kişi kayıt olursa mı, X. siparişini verdikten sonra mı?
4. Kural bloklarında referans veren ve referans alınan için ödüller tanımlayın.
5. **"Kaydet"**

---

## 📊 Kampanya Performansını İzleme
1. `/sadakat` sayfasında kampanya listesini görün.
2. Her kampanyanın yanında **"Gör"** butonuna tıklayın.
3. Kampanya istatistikleri: Kaç kez tetiklendi, kaç müşteriye uygulandı, toplam puan yüklemesi.

---

## ⚠️ Sık Yapılan Hatalar ve Çözümler
| Hata / Sorun | Neden Olur? | Çözüm |
|---|---|---|
| Kampanya POS'ta tetiklenmiyor | Uygulama modu "Kasiyere Sor" | Kasiyerin POS'ta kampanyayı manuel aktive etmesi gerekiyor |
| Kampanya herkese değil bazı müşterilere uygulandı | Hedef kitle kısıtlaması var | "Tüm Müşteriler" olarak güncelle |
| Müşteri puan kazanmıyor | Sadakat programı aktif değil | Program Ayarları > "Aktif" checkbox'ını işaretle |
| Kupon kabul edilmiyor | Kuponun geçerlilik süresi dolmuş veya kullanılmış | `/sadakat/kupon-serileri` sayfasında kuponu kontrol et |
| SMS gitmiyor | SMS kanalı aktif değil veya müşteri izin vermemiş | Program Ayarları > Bildirim Kanalı'nı kontrol et; müşteri "SMS İzni" vermemiş olabilir |
| İki kampanya birden uygulanmıyor | Biri "Münhasır" ayarlı | Birleştirme kuralını "Birleşebilir" olarak değiştir |

## 💡 İpuçları
- **Önce basit bir kampanya kurun** (Örn: "Her siparişe 10 puan"), sistemi öğrendikten sonra karmaşık kural zincirleri ekleyin.
- **SMS maliyeti** düşünülerek filtrelenmiş hedef kitleler kullanın — herkese değil, sadece etkilenecek müşterilere gönderin.
- Uyuyan müşteri kampanyasını **60 günlük** bir eşikle başlatın. 90-120 günde gelmeyeni kazanmak çok daha zordur.
- Sadakat puanlarının **sona erme tarihi** ekleyin — bu müşterileri acele ettirir ve satışları artırır.

## 🔗 İlgili Diğer Kılavuzlar
- **Müşteri Yönetimi** — `/musteriler`
- **Kampanya Sihirbazı (Hızlı Başlangıç)** — `/sadakat/kampanya/yeni`
