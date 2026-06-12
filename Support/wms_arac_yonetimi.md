# Merkez Depo Araç Yönetimi

## Modülün Amacı
Bu modül, şubelere sevkiyat yapacak olan Merkez Depo araçlarının kapasite (hacim, ağırlık), sıcaklık sınıfı ve genel bilgilerinin sistemde tanımlanması ve sevkiyat yüklemeleri sırasında kapasite aşımının engellenmesi amacıyla kullanılır.

## Ekranlara Erişim
* **Araç Tanımları:** [http://localhost:5173/depo-araclar](http://localhost:5173/depo-araclar) *(veya http://localhost:5173/wms-vehicles)*

## Önemli Adımlar ve Kurallar

1. **Araç Tanımlama:**
   Ekrandaki "Yeni Araç" veya benzeri bir buton üzerinden aracın Plakasını, Modelini ve Sürücü bilgisini kaydedebilirsiniz.
2. **Kapasite ve Sıcaklık Sınıfı:**
   Aracın hangi sıcaklık koşullarında taşıma yapabildiği oldukça önemlidir:
   - **Kuru (Dry):** Soğutma gerektirmeyen standart ürünler.
   - **Soğuk (Cold):** +4 derece ürünler.
   - **Donuk (Frozen):** -18 derece ürünler.
   - **Çoklu Sıcaklık (Multi-temp):** Farklı rejimlerdeki ürünleri taşıyabilen araçlar.
   Aracın maksimum yükleme hacmi ve taşıyabileceği ağırlık (kg/ton) değerleri eksiksiz doldurulmalıdır.
3. **Sevkiyat ve Kapasite Kontrolü:**
   Depo görevlileri sevkiyat hazırlığı (Pack/Load) yaparken veya rotalama ekranlarında bu araçları seçtiğinde sistem, ürünlerin paket ölçüleri ve aracın maksimum kapasitesini karşılaştırır. Aracın kapasitesi aşıldığında sistem uyarı verecek ve işlemi durduracaktır.

## Sık Sorulan Sorular / Sorun Giderme

**Soru:** Sevkiyat yüklemesi yaparken sistem "Araç kapasitesi aşıldı" hatası veriyor, ancak fiziksel olarak araçta yer var?
**Cevap:** Bu durum genellikle iki nedenden kaynaklanır:
1. Araç tanımlarında aracın hacim veya ağırlık kapasitesi eksik/hatalı girilmiş olabilir. Araç Tanımları ekranından değerleri kontrol edin.
2. Yüklenen ürünlerin stok kartındaki "Paketleme/Boyut/Ağırlık" ölçüleri hatalı girilmiş olabilir. 

**Soru:** Yeni bir soğuk zincir aracı kiraladık, sıcaklık sınıfını nasıl seçmeliyim?
**Cevap:** Aracın soğutma motoru sadece tek bir rejim (örn: +4) çalıştırıyorsa "Soğuk (Cold)", aynı anda hem eksi derecelere hem artı derecelere ayarlanabilen bölmeleri varsa "Çoklu Sıcaklık (Multi-temp)" seçmelisiniz.
