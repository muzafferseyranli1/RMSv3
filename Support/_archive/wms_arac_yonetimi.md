## İşlem: Merkez Depo Araç Yönetimi
Alternatif kullanıcı ifadeleri:
- Yeni depo aracı nasıl eklerim?
- Araç kapasitesini ve sıcaklık sınıfını nasıl belirlerim?
- Araç kapasitesi aşıldı hatası nasıl çözülür?
- Araç doluluk oranları ve sıcaklık uyumsuzluğu uyarısı nedir?

Amaç:
Şubelere sevk edilecek Merkez Depo araçlarının kapasite, kasa boyutları ve sıcaklık sınıflarını tanımlayarak, yüklemeler sırasında kapasite aşımını engellemek ve araç takibini kolaylaştırmak.

Ekran yolu:
Depo ve Üretim Ekranları > Depo WMS > Araç Tanımları

Link:
/wms-vehicles

Adımlar:
1. Araç Tanımları sayfasına gidin.
2. Sağ üst köşede bulunan "Yeni Araç Ekle" butonuna tıklayın.
3. Açılan formda aracın Plaka Numarası (zorunlu), Araç Kodu, Görünen Adı ve Marka/Model bilgilerini girin.
4. Araç Tipi (Kamyon, Panelvan vb.) ve Sıcaklık Sınıfı (Kuru, Soğuk, Dondurulmuş, Çoklu Sıcaklık) alanlarını seçin.
5. Bağlı Olduğu Depo (Şube) seçimini yapın (seçilmezse Merkez Genel kabul edilir).
6. İç Kasa Ölçüleri (Cm) bölümünde kasa boyutlarını (Boy, En, Yükseklik) girin. Sistem girdiğiniz boyutlara göre hacmi otomatik olarak m³ cinsinden hesaplayacaktır.
7. Maksimum Hacim Kapasitesi (m³) ve Maksimum Taşıma Ağırlığı (kg) değerlerini doldurun. (Boyutlara göre hesaplanan hacim ile girdiğiniz hacim uyuşmuyorsa sistem uyarı verir ancak kaydetmenize izin verir).
8. Şoför Adı Soyadı ve Şoför Telefonu bilgilerini kaydedin.
9. "Bu araç aktif ve sevkıyatlarda kullanılabilir" seçeneğini işaretleyin.
10. "Değişiklikleri Kaydet" butonuna tıklayarak işlemi tamamlayın.

Önemli uyarı:
Sevkiyat hazırlığı (Depo Siparişleri / Depo Orders) sırasında seçilen aracın hacim veya ağırlık kapasitesi aşıldığında ya da taşınacak ürünler ile araç sıcaklık sınıfları uyuşmadığında (örn. soğuk zincir bir ürünün kuru araca yüklenmesi) sistem uyarı verir ve işlemi durdurur. Fiziksel olarak yükleme yapılabiliyorsa, yetkili şifresiyle "Override" (limit ve sıcaklık kontrollerini bypass etme) işlemi gerçekleştirilebilir.
