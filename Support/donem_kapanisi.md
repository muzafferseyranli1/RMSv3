# Dönem Kapanışı ve Kilit Yönetimi Kılavuzu

SuitableRMS sisteminde **Dönem Kapanışı**, belirli bir tarihten önceki tüm finansal ve operasyonel verileri (stok hareketleri, maliyetler, faturalar vb.) kilitlemek ve geriye dönük değişiklik yapılmasını engellemek için kullanılır. Bu işlem muhasebe ve restoran kar/zarar doğruluğu için çok önemlidir.

Dönem Kapanışı sayfasına gitmek için ana menüden **İşlemler -> Dönem Kapanışı** adımlarını izleyebilir veya doğrudan şu adrese gidebilirsiniz: `/donem-kapanis`

## Dönem Kapanışı Nasıl Yapılır? (Adım Adım)
1. **Şube Seçimi:** Ekranın sol üst kısmındaki "Şube" filtresinden dönemi kapatmak istediğiniz şubeleri seçin. (Aynı anda birden çok şube seçebilirsiniz).
2. **Tablodan İşaretleme:** Listelenen şubelerin sağındaki kutucukları işaretleyin.
3. **Kapanış Tarihi Belirleme:** Ekranın sağ alt köşesinde bulunan **"Dönem Kapanış Tarihi"** alanından, hangi tarihe kadarki verileri kilitlemek istediğinizi seçin.
   * *Not: Bu tarih, sistemdeki o şubeye ait en son yapılmış kapanış tarihinden daha eski olamaz.*
4. **Onaylama:** Turuncu renkli **"Dönemi Kapat"** butonuna basın.

> **ÖNEMLİ UYARI:** Dönemi kapattığınız tarihten daha eski bir güne geçmişe dönük fatura giremezsiniz, stok maliyeti değiştiremezsiniz ve adisyon silemezsiniz. Lütfen kapatmadan önce o döneme ait tüm sayım ve fatura girişlerinin bittiğinden emin olun.

## Geçici Kilit (Pre-Lock) Nedir?
Eğer resmi dönem kapanışını (örneğin ay sonu) yapmaya daha vakit varsa ama **günlük/haftalık bazda** geçmişe dönük işlemi sadece belirli bir süreliğine durdurmak istiyorsanız "Geçici Kilit" sekmesini kullanabilirsiniz. 

Geçici kilitler, gerçek dönem kapanışı yapılana kadar hatalı geriye dönük işlem yapılmasını önler ancak yetkili bir yönetici tarafından daha sonra tekrar açılabilir.

## Sık Sorulan Sorular (SSS)
* **Kapanan dönemi geri açabilir miyim?** 
  Hayır, resmi olarak kapatılmış dönem kilitleri standart arayüzden geri açılamaz. (Çok istisnai durumlarda Veritabanı Yöneticisi desteği gerekir). Eğer şüpheniz varsa "Geçici Kilit" yöntemini kullanmalısınız.
* **Son kapanıştan geçen süre kırmızı yanıyor:** 
  Tabloda "30 gün"den daha uzun süredir dönem kapanışı yapmayan şubelerin yanında kırmızı bir ünlem çıkar. Sisteminizin stok/maliyet hesaplamalarının şişmemesi için en az ayda 1 kez dönem kapatmanız şiddetle tavsiye edilir.
