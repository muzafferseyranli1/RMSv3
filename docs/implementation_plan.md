# El Kitabı Sayfalarında Responsive Yapı ve Gelişmiş Raf Ömrü / Ürün Özellikleri Entegrasyonu

Bu plan, el kitabı sayfalarının sabit A4 görünümü yerine her ekran boyutuna (özellikle mobil cihazlara) tam uyum sağlayan esnek bir web sayfasına dönüştürülmesini ve yazdırılmak istendiğinde otomatik olarak A4 kağıt düzenine uymasını (CSS `@media print` kullanarak) amaçlar. Ayrıca "2. Raf Ömrü" (açıldıktan/çözündükten sonraki ömür) dahil olmak üzere kritik mutfak operasyonel parametrelerinin eklenmesini kapsar.

## User Review Required

> [!IMPORTANT]
> **Yazıcı ve PDF Çıktı Desteği (`@media print`):**
> Kullanıcılar el kitabını yazdırmak veya PDF kaydetmek istediğinde, tarayıcının "Yazdır" (Ctrl+P) komutu çalıştırıldığında sol menü, arıza modalı gibi web arayüzü bileşenleri otomatik olarak gizlenecek, sadece A4 boyutunda optimize edilmiş temiz içerik sayfası basılacaktır.
>
> **2. Raf Ömrü Standardı:**
> Restoran operasyonlarında çok önemli olan "ikincil raf ömrü" verilerini esnek bir şekilde tutabilmek için `metadata` şemamıza yeni alanlar ekleyeceğiz. Örneğin:
> - **Teneke Ketçap (Orijinal Ambalaj):** Oda Sıcaklığında 3 ay
> - **Teneke Ketçap (Açıldıktan Sonra - Durum 1):** +4°C'de 1 hafta
> - **Teneke Ketçap (Açıldıktan Sonra - Durum 2):** Oda Sıcaklığında 4 saat

## Proposed Changes

### [Manual Page Metadata Schema]
`manual_pages.metadata` JSONB kolonuna eklenecek yeni alanlar:
- `prep_time`: Hazırlanma süresi (örn. "5 dakika")
- `thaw_time`: Çözünme süresi (örn. "4 saat")
- `cooling_time`: Ilınma/soğuma süresi (örn. "10 dakika")
- `portion_qty`: Porsiyon miktarı (örn. "150 gram")
- `allergens`: Alerjen bilgileri (örn. "Glüten, Soya")
- `storage_temp`: Saklama sıcaklığı (örn. "+4°C Dolap" veya "-18°C Donuk")
- `primary_shelf_life`: Birincil raf ömrü (kapalı ambalaj, örn. "3 ay")
- `secondary_shelf_life_1`: İkincil raf ömrü (açıldıktan/çözündükten sonra 1. koşul, örn. "1 hafta")
- `secondary_storage_cond_1`: İkincil saklama koşulu 1 (örn. "+4°C Dolap")
- `secondary_shelf_life_2`: İkincil raf ömrü (açıldıktan sonra 2. koşul, örn. "4 saat")
- `secondary_storage_cond_2`: İkincil saklama koşulu 2 (örn. "Oda Sıcaklığı")

---

### [Components]

#### [MODIFY] [ManualReader.jsx](file:///c:/RMSv3/src/components/pages/ManualReader.jsx)
- **Responsive Düzen**: Sabit `width` veya sınırlayıcı A4 kutusu yerine mobil/tablet/desktop duyarlı flex/grid yapısına geçiş.
- **Detay Paneli (Ürün Özellikleri ve Raf Ömrü)**: Ürün görselinin yanına veya altına, doldurulan bilgileri gösterecek şık ikonlu kartlar (pills/cards).
- **2. Raf Ömrü Akışı**: Birincil depo ömrü ve açıldıktan sonraki ikincil ömür durumlarını (Durum 1 ve Durum 2 şeklinde) net bir zaman çizgisi veya karşılaştırma tablosu olarak sunma.
- **Yazdırma Stili (CSS)**: `@media print` eklenerek sol menünün gizlenmesi, yazı tipi boyutlarının yazıcıya göre optimize edilmesi, A4 sayfaya sığacak şekilde düzenin ayarlanması.

#### [MODIFY] [ManualManagement.jsx](file:///c:/RMSv3/src/components/pages/ManualManagement.jsx)
- **Yeni Girdi Alanları**: Sayfa oluşturma/düzenleme formunda, "Ürün Detayları ve Raf Ömrü" adında katlanabilir yeni bir bölüm oluşturulması.
- Burada hazırlanma süresi, çözünme süresi, birincil/ikincil raf ömürleri ve saklama koşulları için temiz form elemanları yer alacak.
- **Canlı Önizleme Güncellemesi**: Yönetici düzenleme yaparken, sağdaki canlı önizlemede de responsive tasarım ve girilen yeni ürün özellikleri ikonlarıyla anlık görüntülenecek.

---

## Verification Plan

### Automated Tests
- `npm run build` ile projenin hatasız derlendiğini doğrulama.

### Manual Verification
- **Mobil Görünüm Testi**: Tarayıcı geliştirici araçlarında mobil boyutlarda (örneğin 375px genişlik) sayfanın taşma yapmadan, hamburger menüsü ve sidebar ile düzgün aktığını doğrulama.
- **Yazdırma Önizleme Testi**: Tarayıcıda Ctrl+P yapıldığında sol menünün kaybolduğunu, sadece ürün kılavuzunun A4 formatında temizce yerleştiğini doğrulama.
- **Raf Ömrü Alanları Testi**: Yönetim panelinden yeni raf ömürlerini ("Teneke Ketçap" örneğindeki gibi) girip kaydederek okuyucu ekranında doğru ve şık şekilde görüntülendiğini teyit etme.
