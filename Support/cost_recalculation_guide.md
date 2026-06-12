# Maliyet Hesaplama ve Geriye Dönük İşlemler Kılavuzu

Bu kılavuz, SuitableRMS veritabanında geriye dönük girilen fatura/mal kabul veya stok hareketlerinin maliyet hesaplamalarına (WAC / Ağırlıklı Ortalama Maliyet) etkisini ve sistemin bu durumu nasıl yönettiğini açıklar.

---

## 🔄 Geriye Dönük Fatura Girişlerinde Maliyet Hesaplama Mantığı

Sistemimiz **WAC (Weighted Average Cost - Ağırlıklı Ortalama Maliyet)** yöntemini kullanmaktadır ve geriye dönük girilen işlemler için otomatik bir düzeltme mekanizmasına sahiptir.

### 1. Stok Defterinin (Stok Kartı Maliyetlerinin) Otomatik Düzeltilmesi
Geçen haftaya ait bir faturayı sisteme girdiğinizde stok defteri hatalı kalmaz. Veritabanı düzeyinde şu otomatik süreç çalışır:
* **Tetikleyici (Trigger):** `inventory_movements` tablosuna geriye dönük bir hareket (`direction: 'in'`) eklendiğinde, `trg_inventory_movements_queue_recalc` tetiklenir.
* **Yeniden Hesaplama Kuyruğu:** Bu işlem, ilgili ürün ve şube için geçmiş tarihten itibaren bir yeniden hesaplama görevi (`inventory_movement_recalc_jobs`) oluşturur.
* **Kronolojik Düzeltme:** Arka planda çalışan `public.recalculate_inventory_item_costs(...)` fonksiyonu, faturanın girildiği tarihten günümüze kadar olan tüm stok giriş ve çıkış hareketlerini kronolojik sırayla (`movement_at ASC`) tek tek yeniden işler.
* **Sonuç:** Faturanın girildiği tarihten sonraki tüm hareketlerin ortalama birim maliyetleri (`avg_unit_cost_after`) ve bakiye tutarları otomatik olarak güncellenir. Stok defteriniz ve güncel stok maliyetleriniz **tamamen doğru** hale gelir.

### 2. Geçmiş Satış Raporlarındaki Maliyet Snapshot'ları (Önemli İstisna)
Stok defteri maliyetleri otomatik düzeltilirken, geçmişte gerçekleşen satışların karlılık raporlarındaki snapshot maliyetleri otomatik olarak değişmez.
* **Nedeni:** POS ve Garson üzerinden yapılan satışlarda maliyet, satış anında reçetede kayıtlı olan birim maliyet (`unit_cost_snapshot`) üzerinden dondurulur (snapshot).
* **Etkisi:** Geçen hafta yapılan satışların raporlardaki maliyet tutarı, o anki reçete fiyatını korur. Güncel ve gelecekteki satışlar ise yeni faturadaki güncel maliyetler üzerinden hesaplanmaya devam eder.
* **Çözüm:** Eğer geçmiş satışların maliyet snapshot'larının da yeni geriye dönük faturaya göre güncellenmesi isteniyorsa, teknik ekibin sisteme entegre olan maliyet onarma scriptlerini (örn: `generate-missing-sales.mjs`) çalıştırması gerekir.

---

## 🛠️ İlgili Kod Yapısı ve Veritabanı Nesneleri

* **Maliyet Yeniden Hesaplama Fonksiyonu:** [schema-railway-master.sql:L2907](file:///c:/RMSv3/schema-railway-master.sql#L2907) altındaki `public.recalculate_inventory_item_costs` fonksiyonu geriye dönük recalculation mantığını yürütür.
* **Yeniden Hesaplama Tetikleyicisi:** [schema-railway-master.sql:L2601](file:///c:/RMSv3/schema-railway-master.sql#L2601) altındaki trigger, hareket değişikliklerini kuyruğa yazar.
* **Mal Kabul Ekranı:** Mal kabullerin ve faturaların girildiği arayüz: [MalKabul.jsx](file:///c:/RMSv3/src/components/pages/MalKabul.jsx) | Canlı Link: [http://localhost:5173/mal-kabul](http://localhost:5173/mal-kabul).
