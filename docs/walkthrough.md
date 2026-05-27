# Demo Satış Yeniden Yapılandırması

Seçtiğimiz **Seçenek A** (tam sayım yöntemi) ve talepleriniz doğrultusunda arka planda çalışan, çok fazla yük bindiren ve eksik günleri tam olarak algılayamayan demo satış mekanizması tamamen refactor (yeniden yapılandırma) edilmiştir.

## Yapılan Değişiklikler

### 1. Ön Plan (Foreground) Çalışma Mantığı
`useDemoSalesJob.jsx` dosyasındaki `localStorage` kullanımı kaldırıldı. Artık işlem başladıktan sonra, ilerleme durumu sadece o sekme açık kaldığı sürece `DemoSales.jsx` bileşeni tarafından kontrol edilecek ve ekranda görünecektir. Sekmeyi kapattığınızda veya duraklattığınızda Railway'e gönderilen devasa arka plan işleri iptal olacaktır.

### 2. İşlem Yükü (Chunking) Azaltıldı
Railway veritabanına binen yükü hafifletmek için tek seferde atılan kayıt blokları küçültüldü:
*   Satış (Sale) oluşturma bloğu 40'tan 20'ye düşürüldü.
*   Fiş satırı bloğu 80'den 40'a düşürüldü.
*   Ödeme ve stok hareketi blokları da yarı yarıya azaltılarak sunucu nefes alacak şekilde yeniden yapılandırıldı (Bekleme süreleri artırıldı).

### 3. Eksik Günlerin Tespiti ve Satış Tamamlama (Top-up)
Artık sistem, günde hedeflenen fiş sayısının %40'ı veya daha az satış yapılmış günleri **eksik gün** kabul edecek. 
Örneğin o gün hedeflenen satış 50, ancak sistemde (POS vb. denemelerden) 5 gerçek satış varsa, sistem bu 5 satışı koruyacak ve sadece üzerine 45 yeni demo satış ekleyerek günü tamamlayacaktır. Bu özellik `demoSalesGenerator.js` içerisinde kodlandı.

### 4. Ürün Çeşitliliğinde Rastgelelik (Jitter)
Satış fişleri oluşturulurken hep aynı ürünlerin seçilmesini engellemek adına algoritmanın çekirdek fonksiyonu olan `pickProductForReceipt` metoduna bir ağırlık sarsma (jitter) tekniği eklendi. Rastgele bir dalgalanma katsayısı kullanılarak daha önce hiç seçilmemiş veya düşük ağırlıklı ürünlerin de satılması sağlandı.

## Veritabanı Güncellemesi (Otomatik Uygulandı)

Sistemin düzgün çalışabilmesi için gereken `get_sales_count_by_branch_day` RPC fonksiyonunu Railway veritabanınıza **otomatik olarak uyguladım**. 
Sizin herhangi bir manuel SQL sorgusu çalıştırmanıza gerek kalmadı.

**Şimdi sadece `http://localhost:5173/demo-sales` sayfasını yenileyerek (F5) "Tekrar Tara" diyebilir ve yeni özellikleri test edebilirsiniz.**
