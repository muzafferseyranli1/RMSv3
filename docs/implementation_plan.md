# Native Android UI Tasarım Planı (Müşteri App)

Amacımız, mevcut web tabanlı Müşteri Uygulamasının (özellikle alt navigasyon ve renkli, tırtıklı kupon tasarımlarının) hissiyatını ve görünümünü Jetpack Compose ile birebir (native olarak) yeniden inşa etmektir.

## 1. Uygulama İskeleti (Scaffold & Bottom Navigation)
Uygulamanın ana yapısı bir alt menüye (Bottom Navigation) sahip olacaktır.
- **Sekmeler:** Ana Sayfa, Kartım, Kuponlar, Kampanyalar, Hesabım
- Sekmeler arası geçişler Compose'un State mekanizması ile pürüzsüz sağlanacaktır.
- Uygulama teması, yine Railway API'den gelen `primary_color` (veya `customer_app_config` ayarları) baz alınarak şekillenecektir. Koyu mod (dark background) hissiyatı webdeki ile aynı yapılacaktır (`#0f172a` türevleri).

## 2. Kupon Kartı Tasarımı (CouponCard)
Web sürümündeki zengin kupon kartını native Compose bileşenleri ile çizeceğiz:
- **Tırtıklı Kenarlar (Scallop Borders):** Compose'da özel bir `Shape` (Şekil) veya Canvas kullanılarak kartın sol ve sağ kenarlarından yarım daireler (tırtık efekti) kesilecektir.
- **Sol Koçan (Stub):** Kartın sol kısmında yatay eksende döndürülmüş (`Modifier.rotate(-90f)`) büyük fontlu fayda metni ("%50", "HEDİYE") bulunacaktır.
- **Kesik Çizgi:** Sol koçan ile sağ gövde arasında Canvas kullanılarak `PathEffect.dashPathEffect` ile dikey kesik bir çizgi çizilecektir.
- **Sağ Gövde & Gradyanlar:** Kuponun sağ tarafı zengin renkli gradyanlarla (`Brush.linearGradient`) boyanacak. Kampanya adı, kodu ve son kullanma tarihi buralara yerleştirilecektir.
- **Seçim & Titreşim Etkileşimi:** Kullanıcı kupona uzun bastığında (Long Press) Haptic Feedback (titreşim) tetiklenecek ve kartın etrafında webdeki gibi yeşil bir çerçeve/gölge (glowing border) oluşacaktır.

## 3. Mock Data (Örnek Veri) Entegrasyonu
İlk aşamada tasarımın harika göründüğünden emin olmak için, API entegrasyonundan önce web uygulamasındakine benzer mock (örnek) kupon ve kampanyaları arayüze basacağız.

## Açık Sorular (Kullanıcıya)
- **Tırtıklı Kenar Arka Plan Rengi:** Tırtıklı kupon tasarımında tırtıkların olduğu yerin uygulamanın genel arka plan rengine (Örn: Lacivert/Siyah tonları) tam uyum sağlaması gerekecek. Arka plan rengini şimdilik koyu tema (`#0f172a`) standartlarında tutmayı planlıyorum, uygun mudur?
- **Yönetim Paneli:** Bu native ekranları bitirip test ettikten sonra Yönetim Paneline (Web Admin) mi geçeceğiz, yoksa native uygulamayı tam canlı verilerle bağlamaya mı odaklanalım?

Bu plan onaylandığında kodlamaya geçip muazzam görünümlü native Android bileşenlerini üreteceğim.
