## İşlem: Tedarikçi Değişikliği ve Sipariş Akışı Güncelleme
Alternatif kullanıcı ifadeleri:
- Bir ürünün tedarikçisini nasıl değiştiririm?
- Siparişleri yeni firmaya nasıl yönlendiririm?
- Stok kartının tedarikçisi nasıl güncellenir?

Amaç:
Sistemde tanımlı bir stok kaleminin tedarikçisini değiştirmek ve ilgili sipariş/tedarik akışlarını yeni firmaya kaydırmak.

Ekran yolu:
Satınalma > Tedarikçiler / Sözleşmeler / Sipariş Akışları

Link:
/suppliers

Adımlar:
1. Tedarikçiler ekranından yeni tedarikçi firmayı sisteme ticari bilgileriyle ekleyin.
2. Stok Kartları ekranına gidip ilgili ürünü bularak varsayılan tedarikçiyi yeni firma ile değiştirin.
3. Sözleşmeler ekranından eski tedarikçi ile olan sözleşmeyi pasif duruma getirin.
4. Yine Sözleşmeler ekranından yeni tedarikçiyle olan fiyat ve anlaşmaları içeren yeni bir sözleşme oluşturun.
5. Sipariş Akışları (/order-flows) ekranına giderek ilgili sipariş zincirini yeni tedarikçiye yönlendirin.

Önemli uyarı:
Değişiklik yapmadan önce eski tedarikçiye verilmiş bekleyen siparişleri (pending_delivery) tamamlayın veya iptal edin. Yeni tedarikçinin teslimat günleri farklıysa sipariş akışlarındaki order_days ayarlarını da güncelleyin.
