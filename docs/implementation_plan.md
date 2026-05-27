# Refactor Demo Sales Generation

Mevcut durumda `DemoSales.jsx` modülü arka planda çalışan ve `localStorage` kullanan bir iş kuyruğu sistemine dayanıyor. Kullanıcının talebi doğrultusunda bu süreç tamamen ön plana alınacak ve tamamlanmamış (eksik satışlı) günlerin üzerine ekleme yapılacak şekilde güncellenecektir. Ayrıca Railway veritabanındaki yükü azaltmak için işlem yığınları küçültülecektir.

## Proposed Changes

### 1. `src/hooks/useDemoSalesJob.jsx` (Kaldırılacak / Yeniden Yazılacak)
- `localStorage` (örneğin `JOB_STORAGE_KEY`) kullanımı tamamen kaldırılacak.
- Zamanlanmış arka plan görev döngüsü (`scheduleLoop`, `setTimeout(..., LOOP_PAUSE_MS)`) kaldırılacak.
- Bunun yerine, yalnızca sayfa açıkken (component mount durumundayken) çalışan ve React state kullanan foreground (ön plan) bir süreç yazılacak. İşlem duraklatılırsa veya sayfa kapatılırsa, kuyruk baştan alınabilecek veya sadece eksik kalanlar tekrar hesaplanabilecek.
- İşlem yığınları (chunk) küçültülecek:
  - `SALES_INSERT_CHUNK` = 20 (önceki 40)
  - `LINES_INSERT_CHUNK` = 40 (önceki 80)
  - `MOVEMENTS_INSERT_CHUNK` = 60 (önceki 120)

### 2. `src/components/pages/DemoSales.jsx`
- Sayfadaki indikatörler güçlendirilecek: İşlem çalışırken ekranda belirgin bir ilerleme durumu (örneğin "Şube X için Y günü işleniyor... %Z tamamlandı") gösterilecek.
- Veri tarama mantığı (`fetchSalesPresenceChunk`) güncellenerek, bir günde kaç adet fiş/satış olduğu kontrol edilecek. Eğer o gün için az sayıda (örn. belirlenen günlük hedefin %50'sinden az veya sadece 3-5 tane) satış varsa, bu gün **"tamamlanmamış"** sayılacak ve o günün satış hedefine ulaşacak kadar "tamamlama (top-up)" satışı üretilecek. 
- Tamamlanmış (yeterli satışı olan) günler pas geçilecek.

### 3. `src/lib/demoSalesGenerator.js`
- `buildMissingSalesSummary` fonksiyonu, veritabanından dönen satış adetlerini (eğer varsa) veya ciro tutarlarını inceleyerek o günün tam mı yoksa eksik mi olduğuna karar veren algoritmaya göre güncellenecek.
- `buildReceiptLines` içindeki ürün seçme (çeşitlilik) algoritması iyileştirilecek. Hep aynı ürünlerin satılmasını engellemek için daha önceden rastgele seçilmiş ürünlerin havuzdaki ağırlığı azaltılacak (penalty) veya her fiş için farklı kombinasyonlar denenmeye zorlanacak.

## Open Questions
> [!IMPORTANT]
> **Sorunuzun Cevabı ve Açıklaması:**
> Belirttiğiniz Seçenek A ve Seçenek B, **satışların nasıl üretileceği ile ilgili DEĞİLDİR.** Bu seçenekler sadece *sistemin o güne ait ne kadar gerçek satış olduğunu nasıl sayacağı* ile ilgilidir. Üretilecek olan yeni demo satışlar, her halükarda stok hareketlerini (inventory_movements), fiş satırlarını ve ödemeleri eksiksiz olarak oluşturmaya devam edecektir (mevcut sistemde olduğu gibi). Bu konuda hiçbir bozulma olmayacaktır.
> 
> **Seçenek A (Yeni RPC/SQL Fonksiyonu):**
> *   **Nasıl Çalışır:** Sistem, doğrudan `sales` (satışlar) tablosuna giderek o günkü organik ve demo satışların toplam adetini o an canlı olarak sayar.
> *   **Avantajı:** %100 kesin ve anlık sonuç verir. Eğer 5 satış varsa tam 5 olarak görür ve hedefe (örn. 50) ulaşmak için 45 adet yeni "stok hareketli" satış üretir.
> *   **Dezavantajı:** Railway veritabanında ufak bir yeni fonksiyon (RPC) tanımlamamız gerekir.
> 
> **Seçenek B (`daily_sales` Özet Tablosu):**
> *   **Nasıl Çalışır:** Her satış yapıldığında arka planda tetikleyicilerle güncellendiği varsayılan `daily_sales` isimli günlük ciro özet tablosuna bakar.
> *   **Avantajı:** Veritabanına yeni bir fonksiyon eklememize gerek kalmaz, okuması hızlıdır.
> *   **Dezavantajı:** Eğer `daily_sales` tablosu anlık olarak anında güncellenmiyorsa (gecikme varsa), sistem o günü 0 satışlı sanabilir ve gereğinden fazla üretim yapabilir.
> 
> Kesinlik açısından **Seçenek A'nın** kullanılmasını şiddetle tavsiye ederim. Veritabanına gerekli küçük sayma fonksiyonunu kod ile ben ekleyebilirim. Seçenek A ile ilerlememi onaylıyor musunuz?

## Verification Plan
### Manual Verification
- `http://localhost:5173/demo-sales` sayfasına girilecek.
- Tekrar Tara dendiğinde, içinde 1-2 satış olan günlerin "Eksik Gün" olarak algılandığı teyit edilecek.
- Üretimi Başlat dendiğinde işlemin sadece sekme açıkken çalıştığı, ilerlemenin ekranda görüldüğü test edilecek.
- Railway veri trafiğinin daha yavaş/düşük paketler halinde gidip gitmediği ağ sekmesinden doğrulanacak.
