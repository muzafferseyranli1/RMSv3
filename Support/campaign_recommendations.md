# Yeni Müşteri Kazanımı Kampanya Rehberi

Bu kılavuz, SuitableRMS sadakat ve kampanya modüllerini kullanarak işletmenize yeni müşteriler kazandırmak için uygulayabileceğiniz en etkili 3 kampanya modelini ve bunların sistemdeki kurulum adımlarını açıklar.

---

## 🚀 Öneri 1: "Arkadaşını Getir" Referans Kampanyası (Referral Program)
Mevcut sadık müşterilerinizi birer marka elçisine dönüştürerek organik olarak yeni müşteri kazanmanın en az maliyetli yoludur.

### Nasıl Çalışır?
1. Mevcut müşteri sistem üzerinden kendine özel üretilen referans kodunu arkadaşıyla paylaşır.
2. Yeni müşteri bu kodla üye olur ve ilk alışverişini gerçekleştirir (`success_criteria: 'nth_purchase'`).
3. Alışveriş tamamlandığında hem davet eden hem de yeni gelen müşteri ödüllendirilir (örn: indirim kuponu veya bonus puan).

### Kurulum Adımları:
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sadakat/referanslar](http://localhost:5173/sadakat/referanslar)
* **Kaynak Kod Dosyası:** [LoyaltyReferralPrograms.jsx](file:///c:/RMSv3/src/components/pages/LoyaltyReferralPrograms.jsx)
* **Veritabanı Tabloları:** `public.loyalty_referral_programs`, `public.loyalty_referral_codes`, `public.loyalty_referral_tracking`.
* **Ayarlama Kriterleri:** Arayüzden `success_criteria` alanını `registration` (üyelik anında ödül) veya `nth_purchase` (satın alma anında ödül) olarak belirleyip başarı satın alma sayısını `1` yapın.

---

## 🎫 Öneri 2: "Hoş Geldin" Kupon Kampanyası (Coupon Series)
Sosyal medya, el ilanları veya SMS yoluyla dağıtılan, sadece yeni müşterilerin ilk siparişlerinde geçerli tek kullanımlık indirim kodlarıdır.

### Nasıl Çalışır?
* "MERHABA100" gibi tek bir genel kod veya kişiye özel benzersiz kodlardan oluşan bir seri tanımlanır.
* Bu kuponlar sadece yeni üyelerin ilk sepetlerinde geçerli olacak şekilde sınırlandırılır.

### Kurulum Adımları:
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sadakat/kuponlar](http://localhost:5173/sadakat/kuponlar)
* **Kaynak Kod Dosyası:** [LoyaltyCouponSets.jsx](file:///c:/RMSv3/src/components/pages/LoyaltyCouponSets.jsx)
* **Veritabanı Tabloları:** `public.loyalty_coupon_series`, `public.loyalty_coupons`.
* **Ayarlama Kriterleri:** "Yeni Kupon Serisi" oluştururken indirim tipini (Tutar veya Oran) seçin, maksimum kullanım sınırını `1` yapın ve geçerlilik sürelerini belirleyin.

---

## 🎁 Öneri 3: İlk Üyeliğe Hediye Puan Kampanyası (Welcome Points)
Kullanıcıların mobil uygulamayı indirmelerini ve ilk kez üye olmalarını teşvik eden cüzdan puanı kampanyasıdır.

### Nasıl Çalışır?
* Müşteri ilk kez kayıt olduğunda cüzdanına (wallet) otomatik olarak 50 TL değerinde "Hoş Geldin Puanı" yüklenir. Müşteri bu puanları ilk siparişinde harcayabilir.

### Kurulum Adımları:
* **Canlı Ekran Bağlantısı:** [http://localhost:5173/sadakat/kampanya/yeni](http://localhost:5173/sadakat/kampanya/yeni) (Kampanya Sihirbazı)
* **Kaynak Kod Dosyası:** [LoyaltyManagement.jsx](file:///c:/RMSv3/src/components/pages/LoyaltyManagement.jsx)
* **Veritabanı Tabloları:** `public.loyalty_campaigns`, `public.loyalty_wallets`.
* **Ayarlama Kriterleri:** Kampanya tipini `bonus_points` (veya `reward_type: 'points'`) seçin. Tetikleyici tipini `registration` (üye olma) olarak ayarlayıp ödül puan tutarını girin.

---

## 🛡️ Kampanya Yönetiminde Önemli Güvenlik Ayarları

> [!WARNING]
> * **Suistimal Koruması (Limits):** Kampanyalarda kişi başı maksimum katılım sınırını (`limits_json`) mutlaka `1` olarak ayarlayın.
> * **Bütçe Sınırı (Budget):** Dağıtılacak toplam puan veya indirim tutarını sınırlamak için `budget_json` alanından kampanya toplam bütçesini sınırlandırın.
