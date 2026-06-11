# Maliyet Hesaplama Handoff

Tarih: 2026-06-11

Bu handoff, restoran stok/reçete maliyet yöntemleri çalışmasını başka makinede kaldığı yerden sürdürebilmek için hazırlandı.

## Kullanıcının İlk İsteği

Kullanıcı restoran işletmeciliğinde farklı fiyatlardan alınan hammaddeler için şu 3 yöntemin, özellikle büyük datada nasıl formülize edildiğini anlatan bir Excel dosyası istedi:

1. Ağırlıklı Ortalama Maliyet
2. FIFO
3. Son Alış Fiyatı

Kullanıcı ayrıca mevcut RMS projesinde bu hesaplamanın nasıl yapıldığını sordu.

## Oluşturulan Excel Dosyaları

Çalışma dizini:

```text
C:\RMSv3
```

Oluşturulan dosyalar:

```text
C:\RMSv3\restoran_maliyet_yontemleri_buyuk_data.xlsx
C:\RMSv3\restoran_maliyet_yontemleri_buyuk_data_excel_uyumlu.xlsx
```

İkinci dosya önerilen dosyadır:

```text
C:\RMSv3\restoran_maliyet_yontemleri_buyuk_data_excel_uyumlu.xlsx
```

Sebep: Kullanıcının Excel sürümünde `XLOOKUP` formülü `#AD?` hatası verdi. Bu yüzden reçete maliyeti sayfasındaki `XLOOKUP` formülleri eski Excel sürümleriyle uyumlu `LOOKUP` mantığına çevrildi.

Örnek uyumlu formül:

```excel
=IFERROR(LOOKUP(2,1/('02_Agirlikli_Ortalama'!$B$6:$B$19=$B8),'02_Agirlikli_Ortalama'!$Q$6:$Q$19),0)
```

Türkçe Excel bunu yerel adlarla gösterebilir:

```excel
=EĞERHATA(ARA(2;1/('02_Agirlikli_Ortalama'!$B$6:$B$19=$B8);'02_Agirlikli_Ortalama'!$Q$6:$Q$19);0)
```

Not: Orijinal dosya açık olduğu için üzerine yazılamadı. Bu nedenle uyumlu kopya ayrı adla oluşturuldu.

## Excel İçeriği

Sayfalar:

```text
00_Ozet
01_Ham_Veri
02_Agirlikli_Ortalama
03_FIFO
04_Son_Alis
05_Buyuk_Data_Rehberi
06_Recete_Maliyeti
```

Dosya içeriği:

- Ham veri hareket logu örneği
- Ağırlıklı ortalama maliyet hesap sayfası
- FIFO kümülatif lot/aralık mantığı hesap sayfası
- Son alış fiyatı yöntemi hesap sayfası
- Büyük data mimarisi açıklamaları
- Reçete maliyeti ve yield/fire etkisi örneği

Kontroller:

- Türkçe karakter bozulması kontrol edildi.
- Formül olarak `XLOOKUP` kalmadığı kontrol edildi.
- `??` şeklinde bozuk karakter kalmadığı kontrol edildi.

## Üç Yöntemin Büyük Data Mantığı

### 1. Ağırlıklı Ortalama Maliyet

Bu yöntem restoran için ana önerilen yöntemdir.

Temel state:

```text
Q = stok miktarı
V = stok toplam maliyeti
C = anlık ortalama birim maliyet
```

Alışta:

```text
Q_yeni = Q_eski + AlışMiktarı
V_yeni = V_eski + (AlışMiktarı * AlışBirimFiyat)
C_yeni = V_yeni / Q_yeni
```

Çıkışta:

```text
ÇıkışBirimMaliyeti = C_eski
ÇıkışToplamMaliyeti = ÇıkışMiktarı * C_eski
Q_yeni = Q_eski - ÇıkışMiktarı
V_yeni = V_eski - ÇıkışToplamMaliyeti
C_yeni = V_yeni / Q_yeni
```

Büyük datada öneri:

- Her ürün/şube/depo için sıralı hareket defteri tutulur.
- Sıralama anahtarı: `MalzemeID + Şube/Depo + TarihSaat + HareketID`
- Her satır tüm geçmişi taramamalı; bir önceki state üzerinden ilerlemeli.
- Milyonlarca satırda günlük/saatlik snapshot tablosu kullanılmalı.

### 2. FIFO

Temel mantık:

- Her alış bir lot/katman oluşturur.
- Çıkışta en eski açık lotlardan tüketilir.

Analitik formül:

```text
KullanılanMiktar_lot =
MAX(0, MIN(ÇıkışSonrası, LotEnd) - MAX(ÇıkışÖncesi, LotStart))

ÇıkışMaliyeti =
SUM(KullanılanMiktar_lot * LotBirimFiyat)
```

Büyük datada öneri:

- Açık FIFO lot kuyruğu tutulmalı.
- Bir satış/çıkış satırı gerekirse birden çok lot tüketim satırına bölünmeli.
- Excel öğretici olabilir ama milyon satırda pahalıdır; uygulama servisi veya SQL tarafında lot tüketim tablosu daha doğru olur.

### 3. Son Alış Fiyatı

Temel mantık:

```text
C_t = Alış varsa AlışBirimFiyat, yoksa C_(t-1)
ÇıkışMaliyeti = ÇıkışMiktarı * C_t
```

Büyük datada öneri:

- Ürün master/snapshot tablosunda `LastPurchasePrice` tutulur.
- Her mal kabul/fatura girişinde güncellenir.
- Satış ve reçete maliyetleri bu fiyatı okur.

Avantaj:

- Enflasyonist ortamda korumacı fiyatlama sağlar.

Dezavantaj:

- Stok defteri değerini fiili maliyetten yüksek gösterebilir.

## Mevcut Projede Bulunan Gerçek Maliyet Akışı

Özet:

```text
Stok defteri tarafı: Ağırlıklı Ortalama Maliyet / WAC
Reçete-POS maliyet snapshot tarafı: Reçete satırındaki kayıtlı cost alanı
FIFO: aktif ana maliyet yöntemi olarak görünmüyor
Son alış fiyatı: stok kartı/reçete fiyatı tarafında dolaylı kullanılıyor, ama ana stok defteri yöntemi değil
```

## Ana Stok Defteri Tablosu

Dosya:

```text
C:\RMSv3\schema-railway-master.sql
```

Tablo:

```sql
public.inventory_movements
```

İlgili alanlar:

```text
unit_cost
total_cost
total_cost_signed
avg_unit_cost_after
balance_qty_after
balance_total_cost_after
calc_status
calc_version
```

Referans:

```text
C:\RMSv3\schema-railway-master.sql:394
```

Bu tablo stok hareket defteri gibi çalışıyor. Her hareketten sonra miktar ve maliyet bakiyesi satıra yazılıyor.

## Veritabanındaki WAC Motoru

Fonksiyon:

```sql
public.recalculate_inventory_item_costs(...)
```

Referans:

```text
C:\RMSv3\schema-railway-master.sql:2907
```

Motorun yaptığı:

1. İlgili ürün/şube için başlangıç seed satırını buluyor.
2. Sonraki hareketleri kronolojik sıraya koyuyor:

```text
movement_at ASC, ledger_seq ASC
```

3. Her hareketi yeniden hesaplıyor.

Çıkış hareketinde:

```text
v_new_unit_cost =
  önceki avg_unit_cost_after varsa onu kullanır,
  yoksa mevcut satır unit_cost değerini kullanır.

v_new_line_total = v_new_unit_cost * quantity
```

Giriş hareketinde:

- Normal alışta satırın `unit_cost` ve `total_cost` değerini kullanır.
- Production output ise tüketilen production consumption satırlarının toplamını kullanır.
- Transfer in ise eşleşen transfer out maliyetini kullanır.

Sonra:

```text
v_new_qty =
  v_prev_qty + girişse quantity, çıkışsa -quantity

v_new_total_cost =
  v_prev_total_cost + girişse line_total, çıkışsa -line_total

v_new_avg_cost =
  v_new_total_cost / v_new_qty
```

Bu, WAC/ağırlıklı ortalama maliyet mantığıdır.

## Yeniden Hesaplama Kuyruğu

Trigger:

```sql
trg_inventory_movements_queue_recalc
```

Fonksiyon:

```sql
inventory_movements_queue_recalc_trigger()
```

Referans:

```text
C:\RMSv3\schema-railway-master.sql:2601
C:\RMSv3\schema-railway-master.sql:3401
```

Bir `inventory_movements` satırı insert/update/delete olursa yeniden hesaplama kuyruğu oluşturulur.

Kuyruğu işleyen fonksiyon:

```sql
process_inventory_recalc_jobs(p_limit integer default 100)
```

Referans:

```text
C:\RMSv3\schema-railway-master.sql:2794
```

Uygulama tarafında bazı ekranlar insert sonrası bunu çağırıyor.

## Mal Kabul Akışı

Dosya:

```text
C:\RMSv3\src\components\pages\MalKabul.jsx
```

Mal kabul satırında `unit_price` alış fiyatıdır.

İlgili bölüm:

```text
C:\RMSv3\src\components\pages\MalKabul.jsx:882
```

Mantık:

```text
prevQty = önceki stok miktarı
prevTotalCost = önceki stok toplam maliyeti
receivedQty = kabul edilen miktar
unitCost = line.unit_price
lineTotal = line.line_total

nextQty = prevQty + receivedQty

Eğer prevQty < 0:
  nextAvg = unitCost
  nextTotalCost = nextQty * nextAvg

Değilse:
  nextTotalCost = prevTotalCost + lineTotal
  nextAvg = nextQty > 0 ? nextTotalCost / nextQty : unitCost
```

Sonra `inventory_movements` içine `purchase_receipt` hareketi yazılır:

```text
movement_type: purchase_receipt
source_doc_type: purchase_receipt
direction: in
unit_cost: line.unit_price
total_cost: lineTotal
avg_unit_cost_after: nextAvg
balance_qty_after: nextQty
balance_total_cost_after: nextTotalCost
```

Mal kabul sonunda:

```js
await db.rpc('process_inventory_recalc_jobs', { p_limit: 200 })
```

çağrılıyor.

## Reçete/POS Maliyet Snapshot Akışı

Satış/reçete tarafı stok defterindeki `avg_unit_cost_after` alanını doğrudan okumuyor. Reçete satırındaki kayıtlı `cost` alanını kullanıyor.

POS:

```text
C:\RMSv3\src\components\pages\POS.jsx
```

Fonksiyon:

```js
calcRecipeUnitCost(item, channelId, portionId)
```

Referans:

```text
C:\RMSv3\src\components\pages\POS.jsx:416
```

Formül:

```text
toplam =
  SUM(qty * (1 + waste_pct/100) * row.cost)

birim reçete maliyeti =
  toplam / recipe_output_qty
```

Satış satırına yazılan alanlar:

```text
unit_cost_snapshot
line_cost_total
```

Referans:

```text
C:\RMSv3\src\components\pages\POS.jsx:4404
```

Satış başlığına yazılan toplam maliyet:

```text
cost_total = SUM(line_cost_total)
```

Referans:

```text
C:\RMSv3\src\components\pages\POS.jsx:4449
```

Garson ekranında aynı mantık var:

```text
C:\RMSv3\src\components\pages\Garson.jsx:392
C:\RMSv3\src\components\pages\Garson.jsx:4330
```

Demo satış üretici de aynı hesaplama fonksiyonunu kullanıyor:

```text
C:\RMSv3\src\lib\demoSalesGenerator.js:190
C:\RMSv3\src\lib\demoSalesGenerator.js:949
```

## Reçete Satırındaki Cost Nereden Geliyor?

Satış malı/reçete düzenleme ekranı:

```text
C:\RMSv3\src\components\pages\SaleItems.jsx
```

Stok ürünü reçeteye seçildiğinde:

```text
row.cost = stockItem.purchase_price
```

Referans:

```text
C:\RMSv3\src\components\pages\SaleItems.jsx:44
C:\RMSv3\src\components\pages\SaleItems.jsx:1723
```

Stok kartındaki `purchase_price` alanı:

```text
C:\RMSv3\src\components\pages\StockItems.jsx:696
```

Burada default tedarikçi fiyatı veya formdaki purchase_price kullanılıyor:

```js
purchase_price:
  parseFloat(form.suppliers_list?.find(s=>s.is_default)?.purchase_price)
  || parseFloat(form.purchase_price)
  || null
```

Önemli sonuç:

```text
Reçete maliyeti, stok defterindeki canlı WAC değerinden değil, reçeteye kaydedilmiş cost değerinden hesaplanıyor.
```

Bu nedenle mal kabul sonrası stok defterindeki `avg_unit_cost_after` değişse bile, reçete satırındaki `cost` otomatik güncellenmiyorsa POS maliyet snapshotı eski/farklı kalabilir.

## Mal Kabulde Son Alış Fiyatı Gibi Kullanım

`MalKabul.jsx` görünür stok listesinde ürün fiyatını son purchase movement unit_cost üzerinden göstermeye çalışıyor.

Referans:

```text
C:\RMSv3\src\components\pages\MalKabul.jsx:1032
C:\RMSv3\src\lib\branchPurchasing.js:688
```

Fonksiyon:

```js
buildLatestPurchasePriceMap(movementRows, preferredBranchId)
```

Bu fonksiyon son alış hareketlerinden `unit_cost` map'i çıkarıyor. Ancak bu UI/default fiyat amaçlı kullanılıyor; ana stok değerleme yöntemi olarak FIFO veya son alış değil.

## Transfer / Manuel Çıkış / Sayım Akışları

Bu ekranlarda genellikle önceki `avg_unit_cost_after` okunup çıkış maliyeti olarak kullanılıyor.

Örnekler:

```text
C:\RMSv3\src\components\pages\InventoryOperationRecord.jsx:401
C:\RMSv3\src\components\pages\InventoryTransfer.jsx:610
C:\RMSv3\src\components\pages\WmsInternalTransfer.jsx:311
C:\RMSv3\src\components\pages\Count.jsx:905
```

Bu da WAC kullanıldığını destekliyor.

## Raporlama

Satış raporları satış tablosundaki snapshot maliyeti kullanıyor:

```text
sales.cost_total
sale_lines.line_cost_total
```

Referans:

```text
C:\RMSv3\src\components\pages\Reports.jsx:374
C:\RMSv3\src\components\pages\Reports.jsx:541
```

Stok değer raporları `inventory_movements` üzerinden `balance_total_cost_after` ve `avg_unit_cost_after` kullanıyor:

```text
C:\RMSv3\src\components\pages\Reports.jsx:715
C:\RMSv3\src\components\pages\Reports.jsx:737
```

Bu yüzden iki maliyet dünyası var:

1. Stok defteri WAC maliyeti
2. Satış/reçete snapshot maliyeti

Bunlar her zaman aynı olmayabilir.

## FIFO Durumu

Kodda FIFO aktif ana maliyet yöntemi olarak bulunmadı.

Arama terimleri:

```text
FIFO
First-In
lot cost
cost lot
son_alis
last_purchase
weighted average
WAC
```

Bulgu:

- Lot/son kullanma tarihi alanları var.
- Bunlar WMS/izlenebilirlik için kullanılıyor.
- Maliyet tüketimi lot katmanına göre yapılmıyor.
- Maliyet hesaplama `avg_unit_cost_after` ile ağırlıklı ortalama şeklinde.

## Satış Stok Hareketi Durumu

POS dosyasında satış başlığı ve satış satırı yazılıyor:

```text
C:\RMSv3\src\components\pages\POS.jsx:4580
C:\RMSv3\src\components\pages\POS.jsx:4600
```

Ancak bu dosyada doğrudan `inventory_movements` içine satış tüketimi yazan kod görünmedi.

Schema tarafında `sale_lines` insert trigger'ı ile otomatik `inventory_movements` üreten bir trigger da bulunmadı.

`inventory_movements` içinde `sale_consumption` hareket tipi destekleniyor:

```text
C:\RMSv3\schema-railway-master.sql:466
```

Demo/onarma akışlarında satış tüketim hareketi oluşturuluyor:

```text
C:\RMSv3\src\hooks\useDemoSalesJob.jsx:122
C:\RMSv3\scripts\generate-missing-sales.mjs:354
```

Bu konu önemli:

```text
Canlı POS satışı stok hareketi üretiyor mu?
```

Bu handoff sonrası devam eden kişi bunu özellikle doğrulamalı. Eğer canlı POS satışları `inventory_movements` üretmiyorsa:

- Satış raporunda maliyet görünür.
- Ama stok defteri/fiili stok düşümü eksik kalabilir.
- Demo/onarma scriptleri eksik satış stok hareketlerini sonradan tamamlıyor olabilir.

## Mevcut Durumun Kısa Yorumu

Projede gerçek stok değerleme:

```text
Ağırlıklı Ortalama Maliyet
```

Projede reçete fiyatlama/satış snapshot:

```text
Reçete satırındaki row.cost
```

Bu `row.cost` çoğunlukla stok kartındaki `purchase_price` ile doluyor.

Dolayısıyla kullanıcıya verilecek teknik cevap:

```text
Projede stok defteri tarafında WAC var. POS/reçete maliyeti ise canlı WAC yerine reçete satırına kaydedilen maliyetle hesaplanıyor. FIFO yok. Son alış fiyatı sadece bazı UI/default fiyat akışlarında kullanılıyor gibi.
```

## Eğer Sonraki İş Değişiklik Yapmaksa

Kullanıcı muhtemelen şunlardan birini isteyebilir:

1. Reçete/POS maliyetini de canlı WAC ile hesaplatmak
2. Son alış fiyatı yöntemine geçirmek
3. FIFO altyapısı eklemek
4. Üç yöntemden seçilebilir maliyet politikası yapmak
5. Excelde anlatılan modeli projeye uyarlamak

Önerilen teknik yol:

### Seçenek A - Reçete/POS maliyetini canlı WAC yap

Satış anında:

1. Satış ürününün reçete satırlarını aç.
2. Her stok/semi item için ilgili şube son `inventory_movements` satırını al.
3. `avg_unit_cost_after` değerini birim maliyet olarak kullan.
4. Reçete formülünü bununla çalıştır.
5. `sale_lines.unit_cost_snapshot` ve `sale_lines.line_cost_total` alanlarına bu sonucu yaz.
6. Aynı anda `inventory_movements` için `sale_consumption` hareketlerini üret.
7. `process_inventory_recalc_jobs` çağır.

Risk:

- POS performansı etkilenebilir.
- Reçete satırı çoksa her satışta çok sorgu oluşur.
- Çözüm: branch/item bazlı maliyet cache'i veya RPC.

### Seçenek B - Son Alış Fiyatı politikası

Gerekli:

- Ürün bazında `last_purchase_price` veya mevcut `stock_items.purchase_price` güvenilir şekilde güncellenmeli.
- Mal kabul sonrası stok kartı/reçete maliyeti senkronizasyon kararı verilmeli.
- Stok defteri WAC kalabilir, fiyatlama replacement cost kullanabilir.

### Seçenek C - FIFO

Gerekli:

- FIFO lot tablosu veya açık lot state'i
- Alışta lot açma
- Çıkışta lot tüketimi
- Bir satış/çıkış satırını birden fazla lot tüketim satırına bölme
- Raporlarda lot maliyet toplamlarını kullanma

Mevcut yapı FIFO için hazır değil; sadece lot/expiration alanları bulunuyor.

## Kullanılan Komut ve Kontroller

Önemli aramalar:

```powershell
rg -n "avg_unit_cost_after|balance_total_cost_after|unit_cost|total_cost|process_inventory_recalc_jobs|inventory_recalc|recipe_cost|cost_snapshot|cost_total|line_cost|purchase_price" -S src server scripts sql migrations schema-railway-master.sql sales-model.sql
```

```powershell
rg -n "FIFO|First-In|first in|lot.*cost|cost.*lot|last_purchase|last purchase|son al|son_alis|weighted average|ağırlıklı|agirlikli|WAC" -S src schema-railway-master.sql migrations scripts docs sql
```

```powershell
rg -n "sale_lines.*trigger|trigger.*sale_lines|sale_consumption|inventory_movements.*sale|CREATE TRIGGER.*sale|FUNCTION.*sale.*inventory|sale_line" -S schema-railway-master.sql migrations sql sales-model.sql
```

## Dosya Referansları

Ana schema:

```text
C:\RMSv3\schema-railway-master.sql
```

Mal kabul:

```text
C:\RMSv3\src\components\pages\MalKabul.jsx
```

POS:

```text
C:\RMSv3\src\components\pages\POS.jsx
```

Garson:

```text
C:\RMSv3\src\components\pages\Garson.jsx
```

Satış malı/reçete:

```text
C:\RMSv3\src\components\pages\SaleItems.jsx
```

Stok kartı:

```text
C:\RMSv3\src\components\pages\StockItems.jsx
```

Branch purchasing yardımcıları:

```text
C:\RMSv3\src\lib\branchPurchasing.js
```

Raporlar:

```text
C:\RMSv3\src\components\pages\Reports.jsx
```

Demo satış job:

```text
C:\RMSv3\src\hooks\useDemoSalesJob.jsx
C:\RMSv3\src\lib\demoSalesGenerator.js
```

Eksik satış onarma scripti:

```text
C:\RMSv3\scripts\generate-missing-sales.mjs
```

## Son Kullanıcıya Söylenen Kısa Cevap

Kullanıcıya verilen özet:

```text
Mevcut projede ana stok maliyeti FIFO değil, Ağırlıklı Ortalama Maliyet/WAC mantığıyla çalışıyor.

Stok defteri tarafı inventory_movements tablosunda unit_cost, total_cost, avg_unit_cost_after, balance_qty_after, balance_total_cost_after alanlarıyla tutuluyor.

Reçete/POS tarafı ise stok defterindeki canlı avg_unit_cost_after yerine reçete satırındaki kayıtlı row.cost alanından maliyet snapshotı hesaplıyor. Bu row.cost çoğunlukla stok kartındaki purchase_price ile doluyor.

Dolayısıyla stok defteri WAC, satış/reçete snapshotı kayıtlı reçete maliyeti ile çalışıyor. FIFO aktif görünmüyor.
```

## Sonraki Makinede İlk Yapılacaklar

1. Bu dosyayı oku:

```text
C:\RMSv3\MALIYET_HESAPLAMA_HANDOFF.md
```

2. Kullanıcının ne istediğini netleştir:

```text
Sadece analiz mi istiyor, yoksa sistemi Exceldeki yöntemlerden birine göre değiştirmek mi istiyor?
```

3. Eğer değişiklik istenirse önce şu kararı al:

```text
Stok değerleme politikası mı değişecek?
Yoksa sadece POS/reçete maliyet snapshotı canlı WAC okuyacak şekilde mi düzeltilecek?
```

4. Canlı POS satışlarının `inventory_movements` içinde `sale_consumption` üretip üretmediğini mutlaka test et.

5. Excel için gerekirse uyumlu dosyayı kullan:

```text
C:\RMSv3\restoran_maliyet_yontemleri_buyuk_data_excel_uyumlu.xlsx
```

