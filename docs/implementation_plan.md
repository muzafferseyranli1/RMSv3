# KDS, Pickup ve POS/Garson Sorunlarının Çözüm Planı

Kullanıcının ilettiği hataların (KDS/Pickup anahtarlarının yanlış ekran açması, POS anahtarının Garson açması ve Garson anahtarının web sürümünden farklı görünmesi) kök nedenleri tespit edilmiş olup, uygulanacak çözüm adımları aşağıda listelenmiştir.

## 1. KDS ve Pickup Anahtarlarının POS Ekranını Açması
**Kök Neden:** 
Kod seviyesinde `PairingScreen.jsx` ve `DesktopPosApp.jsx` rotaları tamamen doğru çalışmaktadır. KDS anahtarı `device_type: 'kds'` olarak tanımlanmışsa, sistem kusursuz biçimde KDS ekranını açar. 
Ancak kullanıcı bu anahtarları oluştururken veritabanına `device_type: 'pos'` olarak kaydedilmiş (veya kullanıcı KDS cihazında yanlışlıkla bir POS anahtarı kullanmış). Sistem de veritabanından 'pos' yanıtını aldığı için doğal olarak POS ekranını açıyor.

**Çözüm (Kullanıcı Aksiyonu):** 
Uygulama yönetim panelinden (Cihaz Ayarları) yeni bir KDS ve Pickup anahtarı oluşturulmalı, "Tip" olarak mutlaka "Mutfak (KDS)" ve "Teslimat (Pickup)" seçilmelidir. Eski anahtarlar silinmelidir. Kodda yapılacak bir değişiklik yoktur.

## 2. Garson Anahtarının Web'deki `\garson` Ekranından Farklı Görünmesi
**Kök Neden:** 
Geçtiğimiz günlerde Masaüstü (Desktop) sürümü için bir "Personel PIN Girişi (StaffPinGate)" özelliği eklendi. Web sürümünde (tarayıcıda) bu PIN ekranı atlanırken (bypass), masaüstü sürümünde güvenlik gereği PIN ekranı zorunlu olarak karşınıza çıkar.
Siz web'de `/garson` adresine gidince PIN ekranı görmediğiniz için, masaüstü uygulamasında PIN ekranını görünce "bu tamamen yanlış bir ekran" diye düşündünüz. Aslında ikisi de aynı Garson ekranı, sadece masaüstü sürümünde PIN kilidi var.

**Çözüm:**
Masaüstü sürümündeki PIN ekranı tasarım gereği orada olmalıdır (personel güvenliği için). Eğer katalogların PIN girilmeden de görünmesini istiyorsak, `StaffPinGate` bileşenini "non-blocking" (engelleyici olmayan, sadece işlem sırasında modal olarak çıkan) formata dönüştürebiliriz (ki bu daha önceki planda belirtilmişti ancak tam uygulanmamıştı).

## 3. POS Anahtarının Garson (Masa Düzeni) Ekranını Açması
**Kök Neden:**
POS ekranı (kasa), aslında masaların hesaplarını alabilmek için "Masa Düzeni"ni de içinde barındırır. Eğer şubenizde "Hızlı Satış" kanalı silinmişse veya POS cihazı otomatik olarak ilk kanal olan "Masa" kanalını seçerse, POS ekranı anında Masa Düzeni görünümüne (Garson ekranına benzer bir görünüme) geçer. Siz de "POS anahtarı girdim ama Garson açıldı" diye düşünürsünüz (çünkü yan menü dışında ortadaki kısım tamamen masalardan oluşur).

**Çözüm (Kod Değişikliği):**
POS ekranının (`POS.jsx`) açılış kanalını belirleyen `resolveBootChannel` algoritmasını güncelleyeceğiz. POS ekranı açıldığında her zaman "Hızlı Satış" (veya türevi bir sipariş kanalı) kanalında kalmaya zorlanacak. Eğer Hızlı Satış kanalı yoksa bile Masa kanalını otomatik seçmek yerine boş bir POS ekranı gösterecek.

## User Review Required
> [!IMPORTANT]
> Lütfen yukarıdaki açıklamaların mantıklı gelip gelmediğini teyit edin. 
> 1. KDS ve Pickup için **Cihaz Ayarları** menüsünden doğru tipleri seçerek yeniden anahtar üretmeniz gerekmektedir.
> 2. POS ekranının Garson gibi görünmesini engellemek için kod güncellemesi yapacağım.
> 
> Onaylarsanız `POS.jsx` içindeki kanal seçim algoritmasını değiştireceğim.
