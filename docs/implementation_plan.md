# Combo Menü Seçim Modalinin Boş Gelmesi - Çözüm Planı

Mevcut durumda, diğer asistan `POS`, `Garson` ve `Kiosk` ekranlarında çoklu seçim mantığını başarıyla uygulamış ve modal boş geldiğinde ekranda beliren "Seçenek Bulunamadı" uyarısını eklemiştir.

Ancak, belirttiğiniz üzere **Combo Menü Seçim Modali hala boş gelmektedir**.

## Sorunun Temel Analizi
Modalin içerisindeki adımların (`steps` dizisi) boş olmasının teknik olarak iki olası nedeni vardır:
1. **Veritabanındaki `combo_menus_v1` Kaydı Eksik veya Uyumsuz:** Eski projedeki veritabanında `groups` (gruplar) dizisi dolu olarak kayıtlıyken, yeni projenin veritabanında `groups` verisi boş, tanımsız veya eski bir formatta kalmış olabilir. Arayüz tarafında bu veri alınırken herhangi bir normalizasyon işleminden geçirilmediği için doğrudan `undefined` veya `[]` (boş dizi) olarak işleniyor. Bu nedenle `ComboBuilderModal` hiçbir grup adımı üretemiyor.
2. **Mock ID vs Real UUID Uyuşmazlığı Devam Ediyor:** Daha önceki güncellemede isim bazlı (slug, name) fallback eşleşmeleri eklenmiş olsa da, eğer yeni veritabanındaki "Opsiyon Grupları" tablosunda (`option_groups`) eski projede yer alan "Sos Seçimi" vb. isimler tamamen farklı veya yoksa, opsiyon eşleşmeleri yine başarısız olur ve opsiyon adımları da atlanır.

## Yapılacak Değişiklikler (Proposed Changes)

### 1. Veri Normalizasyonu (Data Normalization)
- `UnifiedPosStaffScreen.jsx`, `KioskBig.jsx` ve `KioskTablet.jsx` dosyalarında veritabanından `combo_menus_v1` çekilirken, doğrudan JSON verisini state'e atmak yerine, `ComboMenu.jsx` içerisindeki `normalizeGroups` benzeri bir güvenlik filtresinden geçireceğim.
- Eğer çekilen bir combo menüsünde `groups` tanımlı değilse, sistemin çökmesini veya boş ekran gelmesini önlemek adına `buildInitialGroups()` ile varsayılan (fallback) verileri yerleştireceğim.

### 2. `ComboBuilderModal` ve Eksik Veri Yönetimi
- `ComboBuilderModal.jsx` içerisinde `comboDefinition.groups` boş gelse bile, uygulamanın tıkanmaması için menü tanımlamasının anlık olarak varsayılan bir grupla başlatılmasını sağlayacağım.
- Eğer `steps.length === 0` uyarısı hala ekranda kalırsa, bu uyarı ekranına "Sorun Teşhisi (Debug)" amaçlı küçük bir detay ekleyeceğim. Böylece veritabanından gelen verinin içeriğini (hangi ID'lerin eşleşmediğini) doğrudan arayüzde görebileceğiz.

### 3. Option Groups (Opsiyon Grupları) Fallback Kurgusu
- Eğer veritabanındaki gerçek `option_groups` ile Combo Menü tanımındaki ID'ler eşleşmiyorsa, sistemin eski projede olduğu gibi sorunsuz çalışabilmesi için statik bir `OPTION_GROUPS` fallback listesini doğrudan `ComboBuilderModal` içerisine ekleyeceğim (veya eşleşme bulunamazsa bu varsayılan listeyi devreye sokacağım).

---

> [!IMPORTANT]  
> **Kullanıcı Onayı Gerekiyor:** 
> Bu plan, veritabanından kaynaklı yapısal boşlukları (eksik gruplar veya uyuşmayan ID'ler) arayüzde onarmaya yöneliktir. 
> 
> Lütfen planı onaylayın, ben de hemen kodlara müdahale edip Kiosk ve POS ekranlarındaki bu "boş ekran" krizini kalıcı olarak çözeyim.
