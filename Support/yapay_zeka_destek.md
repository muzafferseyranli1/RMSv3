# Yapay Zeka Destek Masası

## Modülün Amacı
Yapay Zeka Destek Masası, SuitableRMS sistemini kullanırken aklınıza takılan soruları (örn: "Dönem nasıl kapatılır?", "Sipariş nasıl oluşturulur?") sorabileceğiniz, sistem kılavuzlarını sizin için anında tarayıp cevaplayan sanal bir asistandır.

## Ekranlara Erişim
* **Destek Masası:** [http://localhost:5173/destek](http://localhost:5173/destek)
*(Not: Bu ekrana erişim için Merkez Yöneticisi veya ilgili destek yetkisine sahip olmanız gerekmektedir.)*

## Önemli Adımlar ve Kurallar

1. **Soru Sorma:**
   Destek sayfasına girdiğinizde alt kısımdaki mesaj alanına sistemin işleyişiyle ilgili sorunuzu yazıp gönderebilirsiniz. 
2. **Kılavuz Yönlendirmeleri:**
   Yapay zeka asistanı, size sadece işlemin nasıl yapılacağını anlatmakla kalmaz, aynı zamanda o işlemi yapabileceğiniz ekranların doğrudan linklerini de (Örn: Dönem Kapanışı için `/donem-kapanis`) sunar. Bu linklere tıklayarak doğrudan ilgili sayfaya gidebilirsiniz.
3. **Gerçekçi Cevaplar:**
   Sistem sadece resmi SuitableRMS kılavuzlarına dayanarak cevap verir. Eğer sistemin bilmediği veya mevcut olmayan bir özellik hakkında soru sorarsanız, asistan sizi yanıltmamak adına sorunun cevabının kılavuzlarda bulunamadığını nazikçe belirtecektir.

## Sık Sorulan Sorular / Sorun Giderme

**Soru:** Asistan soruma "Bilmiyorum" veya "[UNANSWERED]" şeklinde bir dönüş yaptı, ne yapmalıyım?
**Cevap:** Bu durum, sorduğunuz sorunun mevcut kılavuzlarda henüz yer almadığı anlamına gelir. Sistemimiz bu cevapsız soruları arka planda otomatik olarak kaydetmekte ve düzenli aralıklarla yeni kılavuzlar hazırlanarak asistanın bilgi bankası genişletilmektedir.

**Soru:** Destek linkine tıkladığımda yetkisiz erişim hatası alıyorum.
**Cevap:** Yapay Zeka Destek Masası genellikle Merkez/Genel Müdürlük yetkililerine veya "Destek" rolü atanmış kullanıcılara açıktır. Yetkinizi restoran müdürünüz veya sistem yöneticiniz üzerinden kontrol ettirebilirsiniz.
