# Maliyet Hesaplama ve Stok Değerleme Kılavuzu

SuitableRMS içerisinde stoklarınızın ve reçetelerinizin (menü kalemlerinizin) maliyetleri tamamen otomatik, anlık ve dinamik olarak hesaplanmaktadır. 

Bu kılavuz, restoranınızın kar/zarar durumunu doğru görebilmeniz için sistemin arka planda maliyetleri nasıl hesapladığını ve sizin nelere dikkat etmeniz gerektiğini açıklar.

## 1. Kullanılan Maliyet Yöntemi
Sistem, ana maliyet yöntemi olarak **Ağırlıklı Ortalama Maliyet (Moving Average Cost - WAC)** yöntemini kullanır. Bu, restoran otomasyonları için en güvenilir ve gerçekçi yöntemdir.

**Nasıl Çalışır?**
* Deponuza her **Mal Kabul (Fatura Girişi)** yaptığınızda, o ürünün depodaki mevcut miktarı ve değeri ile, yeni giren miktarı ve değeri toplanarak yeni bir "Ortalama Birim Maliyet" hesaplanır.
* Çıkış (Satış, Üretim, Zayi) işlemlerinde ise daima o anki güncel ortalama birim maliyet baz alınarak stoktan değer düşülür.
* Böylece enflasyonist ortamlarda fiyat dalgalanmaları yumuşatılarak en gerçekçi maliyet elde edilir.

## 2. Reçete Maliyetleri (Menü Kârlılığı)
Menüde sattığınız bir yemeğin (örneğin Hamburger) maliyeti, reçetesine eklediğiniz hammaddelerin (Ekmek, Köfte, Sos vb.) o anki güncel **Ağırlıklı Ortalama Maliyetleri** üzerinden anlık olarak hesaplanır.

* **Fiyat Değişimleri:** Tedarikçiden domatesi geçen ay 20 TL'ye, bu ay 40 TL'ye aldıysanız, ortalama maliyetiniz (örneğin 30 TL) reçetenize otomatik yansır. Porsiyon maliyetleriniz ve Kârlılık Oranınız (Food Cost %) canlı olarak güncellenir.
* **Üretim Kaydı:** Mutfak üretimi yapıldığında, kullanılan malzemeler ortalama maliyetten depodan düşer, üretilen yarı mamul (örneğin porsiyonlanmış köfte) bu toplam maliyet üzerinden depoya girer.

## 3. Doğru Maliyetlendirme İçin Altın Kurallar

Sistemin maliyetleri hatasız hesaplayabilmesi için aşağıdaki operasyonel süreçlere harfiyen uyulmalıdır:

1. **Mal Kabulleri Zamanında Girin:** 
   Tedarikçiden mal geldiğinde faturayı/irsaliyeyi sisteme geciktirmeden, doğru miktar ve doğru fiyatla girin. Sisteme girilmeyen veya "0 TL" olarak girilen ürünler, ortalama maliyeti anında dibe çekecek ve raporlarınızı bozacaktır.
2. **Reçete Firelerini (Yield) Doğru Tanımlayın:** 
   10 KG alınan bir etin temizlendikten sonra 8 KG kaldığını sisteme reçete freleri üzerinden doğru tanımlamalısınız. Aksi takdirde satılabilir ürün maliyetiniz (porsiyon maliyetiniz) yanlış hesaplanır.
3. **Eksi Stoka Düşmemeye Dikkat Edin:** 
   Eğer depoda sistemde 0 KG et varken, POS üzerinden satış yapmaya devam ederseniz sistem stoku - (eksi) bakiyeye düşürür. Eksi bakiyedeki stoklarda ortalama maliyet algoritması mantıksal hatalara yol açabilir. Düzenli **Stok Sayımı** yaparak depo bakiyelerinizi sıfırlayın/doğrulayın.

## 4. Maliyetleri İzleyebileceğiniz Ekranlar

* **Envanter Hareketleri (Stok Ekstresi):** Her bir malzemenin giriş-çıkışını incelerken satır bazında `Birim Maliyet` ve o anki `Ortalama Birim Maliyet` (Hareket Sonrası) değerlerini anlık olarak izleyebilirsiniz.
* **Ürün Seçenekleri ve Reçeteler:** Her bir ürünün satış fiyatı, maliyeti ve Kar/Maliyet oranını yeşil, sarı ve kırmızı renk kodlarıyla görebilirsiniz (Örn: %30 maliyet oranı yeşil, %80 kırmızı).
* **Raporlar -> Kar/Zarar (PnL):** Satışlardan elde edilen gelir ve tüketilen malzemelerin toplam maliyeti üzerinden net dönem karınızı inceleyebilirsiniz.

> **İpucu:** Eğer bir yemeğin maliyeti size çok düşük veya çok yüksek geliyorsa, öncelikle o yemeğin *Reçetesini* kontrol edin. Reçetede miktar hatası yoksa, o hammaddenin *Envanter Hareketleri* ekranına giderek son yapılan mal kabul faturalarında fiyatın hatalı girilip girilmediğini kontrol edin.
