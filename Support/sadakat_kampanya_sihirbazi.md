# Sadakat ve Kampanya Sihirbazı Kullanım Kılavuzu

SuitableRMS Sadakat ve Kampanya Sihirbazı, restoranınızın satışlarını artırmak, müşteri sadakatini sağlamak ve sepet ortalamasını büyütmek için gelişmiş kampanyalar kurgulamanızı sağlayan modüldür. 

Kampanya Sihirbazı'na ulaşmak için ana menüden **Sadakat -> Kampanyalar -> Yeni Kampanya Oluştur** adımlarını izleyebilirsiniz.

Sihirbaz toplam 5 basit adımdan oluşur:

## 1. Adım: Hedef Belirleme
Kampanyanızın ana amacını seçtiğiniz adımdır. Seçtiğiniz hedefe göre sistem size en uygun koşul ve eylemleri otomatik olarak önerecektir.
* **Yeni Müşteri Kazan:** İlk sipariş, referans veya hoş geldin ödülleri için kullanılır.
* **Sepet Ortalamasını Büyüt:** Belirli bir tutarın üzerine çıkıldığında veya birden fazla ürün alındığında tetiklenen kampanyalar içindir (Örn: "1000 TL ve üzeri siparişlerde %10 İndirim").
* **Ziyaret Sıklığını Artır:** Müşterinin belirli bir dönem içindeki sipariş sayısına veya son geliş tarihine göre tetiklenen kampanyalardır (Örn: "5. Kahveniz Bizden").

## 2. Adım: Kapsam ve Temel Bilgiler
Kampanyanın kimlere, hangi satış kanallarına ve hangi şubelere hitap edeceğini belirlediğiniz alandır.
* **Kampanya Adı ve Açıklaması:** Kasiyerlerin ve müşterilerin göreceği isimdir. Anlaşılır olmasına dikkat edin.
* **Geçerli Kanallar:** Kampanyanın sadece Paket Serviste mi, Gel-Al siparişlerde mi yoksa Masaya Serviste (Dine-in) mi geçerli olacağını seçebilirsiniz. Hepsini seçerseniz kampanya tüm sipariş tiplerinde çalışır.
* **Geçerli Şubeler:** Kampanyayı tüm şubelerde veya sadece seçeceğiniz belirli pilot şubelerde aktif edebilirsiniz.
* **Hedef Kitle:** 
  * *Tüm Müşteriler:* Sistemde kayıtlı olmayan veya numarası bilinmeyen walk-in müşteriler dahil herkes faydalanabilir.
  * *Sadece Sadakat Üyeleri:* Sisteme cep telefonuyla kayıt olmuş müşteriler için geçerlidir.

## 3. Adım: Koşul ve Eylem (Kurallar)
Kampanyanın kalbi burasıdır. Kampanyanın hangi şartlarda çalışacağını ve sonucunda müşterinin ne kazanacağını belirlersiniz.

**Önemli Koşul Tipleri:**
* **Sepet Tutarı:** Adisyonun toplam tutarı belirlediğiniz limiti geçtiğinde çalışır.
* **Sepet Ürün Adedi:** Belirli bir kategoriden (Örn: Tatlılar) belirlediğiniz sayıda ürün alındığında çalışır.
* **Dönemsel Sipariş Sayısı:** Müşterinin son 1 ay içinde 5. siparişini vermesi durumunda tetiklenir (Puan/Kahve kartı mantığı).
* **Doğum Günü:** Müşterinin doğum günü haftasında tetiklenir.
* **Zaman / Happy Hour:** Kampanyanın sadece belirli günlerde (Örn: Salı günleri) veya belirli saatlerde (Örn: 14:00 - 17:00 arası) çalışmasını sağlar.

**Önemli Eylem (Ödül) Tipleri:**
* **Sepet / Ürün İndirimi:** Toplam adisyon tutarına yüzdelik (%20) veya sabit tutar (50 TL) indirimi yansıtır.
* **Bedava Ürün (Promosyon):** Sepete ücretsiz olarak promosyon bir ürün (Örn: Sufle) ekler.
* **Bonus Puan:** Müşterinin cüzdan hesabına, sonraki siparişlerinde kullanabileceği sadakat puanı yükler.
* **Kupon Tanımlama:** Müşterinin hesabına ileri tarihli bir dijital kupon yükler.

## 4. Adım: Operasyon ve Uygulama Şekli
Kampanyanın restorandaki POS veya Garson terminalinde (Tablet/Telefon) nasıl bir akışla uygulanacağını belirlersiniz.
* **Uygulama Şekli:**
  * *Otomatik Uygula (Auto):* Adisyon koşulları sağladığı anda (örneğin sepet 1000 TL'yi geçtiğinde) sistem kasiyere sormadan indirimi adisyona otomatik işler.
  * *Onay İsteyerek Uygula (Prompt):* Koşullar sağlandığında POS ekranında kasiyerin veya garsonun karşısına bir bildirim (Popup) çıkar. Personel müşteriye "Kampanyadan faydalanmak ister misiniz?" diye sorar ve onaylarsa uygular.
* **Onay Mekanizması:** Kampanyanın uygulanabilmesi için mağaza müdürü şifresi / PIN gerektirip gerektirmediğini buradan ayarlayabilirsiniz. Yüksek indirimli kampanyalar için müdür onayı açılması tavsiye edilir.

## 5. Adım: Gözden Geçirme ve Kaydetme
Tüm tanımlamalarınızın bir özetini bu ekranda görürsünüz.
Her şeyin doğru olduğundan eminseniz **"Kaydet ve Aktif Et"** butonuna basarak kampanyayı yayına alabilirsiniz. Aktif edilen kampanyalar saniyeler içinde tüm şubelerinizdeki POS ve Garson terminallerine otomatik olarak iletilir.

> **İpucu:** Kampanyayı hemen yayına almak istemiyorsanız "Taslak Olarak Kaydet" seçeneğini kullanabilirsiniz.

## Sık Sorulan Sorular ve Çözümler
* **Kampanya POS Ekranında Çıkmıyor:** 
  1. Kampanyanın 2. adımdaki *Kapsam* bölümünden "Geçerli Kanallar" (Örn: Masaya Servis) ayarını doğru seçtiğinizden emin olun. 
  2. Müşteri telefon numarası girilmediyse ve kampanya "Sadece Sadakat Üyeleri" olarak ayarlandıysa tetiklenmez. POS'ta adisyona müşteri numarası eklediğinizden emin olun.
* **İndirim Yanlış Uygulanıyor:** 3. adımdaki Koşul/Eylem ekranından, Eylem bölümüne gidip indirimin "Sepet Toplamı" üzerinden mi yoksa sadece "Belirli Ürünler" üzerinden mi uygulandığını kontrol edin. Kısıtlamaları düzenleyerek düzeltebilirsiniz.
