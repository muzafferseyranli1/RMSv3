## İşlem: Yeni Müşteri Kazanımı Kampanyaları
Alternatif kullanıcı ifadeleri:
- Arkadaşını getir kampanyası nasıl yapılır?
- Hoş geldin kuponu nasıl oluşturulur?
- İlk üyeliğe hediye puan nasıl verilir?
- Yeni müşteriler için kampanya nasıl hazırlanır?

Amaç:
Sadakat ve kampanya modüllerini kullanarak işletmeye yeni müşteriler kazandırmak için etkili kampanya modellerini (Referans, Kupon Serisi, Hoş Geldin Puanı) kurmak.

Ekran yolu:
Sadakat > Kampanyalar / Kuponlar / Referanslar

Link:
/sadakat/kampanya/yeni

Adımlar:
1. "Arkadaşını Getir" (Referans) kampanyası için `/sadakat/referanslar` ekranına gidin ve success_criteria ayarını 'registration' veya 'nth_purchase' olarak belirleyin.
2. "Hoş Geldin" Kupon kampanyası için `/sadakat/kuponlar` ekranına gidin, yeni kupon serisi oluşturarak kullanım sınırını 1 yapın.
3. "İlk Üyeliğe Hediye Puan" kampanyası için `/sadakat/kampanya/yeni` ekranından kampanya tipini "bonus_points" ve tetikleyici tipini "registration" olarak ayarlayın.

Önemli uyarı:
Suistimalleri önlemek için kampanyalarda kişi başı maksimum katılım sınırını (limits_json) mutlaka 1 olarak ayarlayın ve dağıtılacak toplam puan veya indirim tutarını sınırlamak için bütçe sınırı belirleyin.
