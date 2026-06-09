# WMS Faz 6: Toplama, Paketleme, Sevk ve Araç/Plaka - Walkthrough

Bu belgede, WMS Faz 6 (Toplama, Paketleme, Sevk ve Araç/Plaka) kapsamında gerçekleştirilen geliştirmeler, veritabanı şeması ve entegrasyon test sonuçları özetlenmiştir.

---

## 1. WMS Faz 6 Geliştirmeleri

Faz 6 kapsamında, WMS ikmal taleplerinin fiziksel sevkiyata dönüştürülmesi, araç/plaka takibi, çoklu şube sipariş konsolidasyonu, kısmi sevk ve sevk onayı verildiğinde depo stok çıkışlarının yapılması sağlanmıştır.

### A. Veritabanı Şeması ve Modeller
Sevkiyat süreçlerini yönetmek için `migrations/031_wms_shipments.sql` dosyasında aşağıdaki tablolar oluşturulmuş ve Railway veritabanına uygulanmıştır:
- **`vehicles`**: WMS araç tanımlarını (plaka, model, şoför adı, telefonu ve aktiflik durumu) tutar.
- **`warehouse_shipments`**: Fiziksel sevk partilerini (durum: `draft`, `in_transit`, `delivered`, `cancelled`, atanan araç/plaka, sevk zamanları ve genel notlar) tutar.
- **`warehouse_shipment_orders`**: Tek bir sevkiyat partisinin birden fazla şube siparişini (`purchase_orders`) kapsayabilmesi için çoktan-çoğa ilişki sağlar.
- **`warehouse_shipment_lines`**: Kısmi sevk durumunda hangi sipariş satırından ne kadar ürünün yüklendiğini (`shipped_qty`, birim fiyat ve satır toplamı ile) takip eder.

Bu tablo ve indeks tanımları tek kaynak kuralı gereğince `schema-railway-master.sql` dosyasına da eklenmiştir.

### B. Arayüz Entegrasyonu (`DepoOrders.jsx`)
- **Yeni Sekme ("Sevkiyatlar / Araç Yükleme"):** `/depo-orders` ekranına yeni bir çalışma sekmesi olarak eklenmiştir.
- **Çoklu Sipariş Seçimi (Checkbox):** "Bekleyen Talepler" listesinde her satırın soluna checkbox'lar eklenmiş, bekleyen siparişlerin seçilerek tek bir sevkiyat partisine konsolide edilmesi sağlanmıştır.
- **Sevk Partisi Oluşturma Modalı:** Seçilen siparişlerin ürünlerini konsolide ederek gösterir. Bu modal üzerinden:
  - Kayıtlı araçlar listesinden (`vehicles` tablosu) seçim yapılabilir veya plaka/şoför bilgileri serbest metin olarak girilebilir.
  - Serbest metinle girilen yeni aracın sonraki sevkiyatlar için kalıcı olarak `vehicles` tablosuna kaydedilmesi seçeneği sunulur.
  - Her ürünün sevk edilecek miktarı (`shipped_qty`) düzenlenebilir (varsayılan: sipariş edilen miktar).
  - Kaydedildiğinde sevkiyat partisi `draft` (taslak) statüsünde veritabanına yazılır.

### C. Kısmi Sevk ve Sipariş Güncelleme
Sevkiyat partisi oluşturulurken operatör miktar kıstığında:
- Yüklenen miktar (`shipped_qty`) ilgili sipariş satırlarına FIFO usulü dağıtılır.
- Orijinal talep miktarları `purchase_order_lines.meta.original_ordered_qty` alanına yedeklenir.
- `purchase_order_lines.ordered_qty` ve siparişin toplam tutarları fiili sevk miktarına göre otomatik olarak güncellenir. Bu sayede şube mal kabul yaparken sadece fiziksel olarak yola çıkan miktar üzerinden kabul yapabilir.
- Draft sevkiyat iptal edilirse, orijinal miktarlar PO satırlarına geri yüklenir ve sipariş tutarları eski haline döndürülür.

### D. Sevk Onayı ve Depo Stok Çıkışları
Taslak halindeki bir sevkiyat onaylanıp "Sevk Et (Onayla)" tetiklendiğinde:
1. Sevkiyat durumu `'in_transit'` (Yolda) olarak güncellenir.
2. Sevkiyat satırlarındaki her bir ürün için depoda (`branch_id = activeDepotId`) `direction = 'out'`, `movement_type = 'transfer_out'`, `source_doc_type = 'transfer'` olacak şekilde stok çıkış hareketleri (`inventory_movements`) otomatik oluşturulur.
3. Bağlı siparişler `supplier_marked_sent = true` ve irsaliye/plaka detayları ile güncellenerek şube mal kabul ekranına aktarılır.
4. Faz 0 kararına uygun olarak şube stoğuna otomatik giriş yapılmaz; şube kendi mal kabulüyle stoğu içeri alır.

---

## 2. Doğrulama ve Entegrasyon Test Sonuçları

### A. WMS Faz 6 Entegrasyon Testi (`scratch/test_wms_shipments.cjs`)
Sevkiyat oluşturma, araç atama, kısmi sevk miktarları, sevk onayı verildiğinde depo stok çıkış hareketlerinin yazılması ve PO sevk durum güncellemelerini test eden transaction rollback korumalı test başarıyla çalıştırılmıştır.

**Çalıştırılan Komut:**
```bash
$env:DATABASE_URL="[DATABASE_URL]"; node scratch/test_wms_shipments.cjs
```

**Test Çıktısı:**
```text
Connected to DB successfully.
Started transaction (BEGIN).
Warehouse node: Pendik Merkez Depo (ID: 302bd195-3b79-4f14-a60b-4668c36a12c1)
Requesting branch node: Ankara Etimesgut Şubesi (ID: 475960cc-bd6a-4b02-9587-df45b39a4cc5)
Stock Item for test: Pizza Hamuru (250g) (ID: b0e10002-0000-4000-8000-000000000002)
Internal supplier configured: Test İç Depo P6 (Pendik Merkez Depo) (ID: 11c8ac7f-c200-4378-88c4-c76e0203e201)
Inserted replenishment purchase_order ID: 0c02e745-fb92-466b-8852-c5f52a1f4968 (No: PO-REPL-P6-1780960342498)
Inserted line ID: 5efb72ea-5205-46cd-825e-fbbedfec7823 (Ordered Qty: 15.0)
Configured vehicle plate: 34 WMS 666 (ID: 0da49174-4c77-43d1-86e8-ed85244d38c5)
Created draft shipment ID: 12439c99-9e82-4730-93e1-fb1ea0d32d07 (No: SH-TEST-P6-1780960342640)
Linked order PO-REPL-P6-1780960342498 to shipment SH-TEST-P6-1780960342640.
Added shipment line for Pizza Hamuru (250g) with quantity: 12 (Partial shipping: 12.0/15.0)
Updated PO line quantity to 12 and recalculated order totals.

--- DRAFT SHIPMENT STATE ---
Shipment Status: draft (Expected: draft)
Generated stock exit movement ID: 4c8e3a12-75f2-4153-b74b-cf68f9aec747 (direction: out, quantity: -12.0)
Updated PO metadata to trigger awaiting_receipt status.

--- VERIFICATION RESULTS ---
Shipment status in transit? YES (in_transit)
Shipment plate: 34 WMS 666
Inventory movement direction: out (Expected: out)
Inventory movement type: transfer_out (Expected: transfer_out)
Inventory movement quantity: 12 (Expected: 12)
PO supplier_marked_sent: true (Expected: true)
PO doc_no matches shipment_no: YES

✅ WMS Phase 6 Integration Test SUCCESSFUL!
Transaction rolled back successfully. Database remains clean.
```

### B. Vite Üretim Derlemesi (Production Build)
`npm run build` komutu çalıştırılmış ve yeni Faz 6 kodları Vite tarafından sıfır hata ile başarıyla derlenmiştir.
```text
dist/assets/DepoOrders-BEWnQZC0.js                   50.20 kB │ gzip:  11.18 kB
✓ built in 15.51s
```

---

## 3. WMS UI Polish (Görünürlük Cilası)

Kullanıcı deneyimini güçlendirmek ve WMS modülünün yeni kimliğini yansıtmak amacıyla aşağıdaki görsel ve yönlendirici iyileştirmeler yapılmıştır:

### A. Sidebar Menü Güncellemeleri ve Dinamik Sayaçlar (`Sidebar.jsx`)
- **İsim Değişiklikleri:** WMS menüsündeki "Siparişler" başlığı **"WMS Sipariş Konsolu"** olarak güncellenmiş; "Mal Kabul" ise **"Mal Kabul & Putaway"** olarak daha net tanımlanmıştır. Ayrıca WMS işlemleri altına **"Lokasyon Taşıma"** bağlantısı entegre edilmiştir.
- **Dinamik Sayaçlar (Badges):**
  - **WMS Sipariş Konsolu** menü kaleminin yanına, o depodan sevk edilmeyi bekleyen yeni siparişlerin sayısını gösteren mavi bir sayaç eklenmiştir.
  - **Mal Kabul & Putaway** menü kaleminin yanına, yolda olan ve şubeye teslim edilip kabul edilmeyi bekleyen sevkiyatların sayısını gösteren yeşil bir sayaç eklenmiştir.
  - Bu sayaçlar, arka planda 30 saniyede bir veritabanını sorgulayarak otomatik olarak güncellenir.

### B. Ana Depo Bağlam Rozeti ve Süreç Stepper'ı (`DepoOrders.jsx`)
- **Ana Depo Rozeti:** Sayfa başlığına (Header) eklenen şık, koyu mavi gradyan arka planlı ve mavi çerçeveli rozet, kullanıcının o anda hangi depoda işlem yaptığını (`{branchName} — ANA DEPO`) net bir şekilde gösterir.
- **Süreç Adımları Göstergesi:** Ekranın üst kısmına `Talepler` → `Toplama` → `Sevkiyat` → `Mal Kabul` adımlarını içeren interaktif bir süreç stepper'ı yerleştirilmiştir. Bu sayede warehouse personeli, siparişlerin hangi aşamada olduğunu (örneğin kaç talep bekliyor, kaç sevkiyat hazırlıkta) anlık olarak görebilir ve tıklayarak ilgili sekmeye geçiş yapabilir.

### C. Zenginleştirilmiş ve Yönlendirici Boş Durum Tasarımları (`DepoOrders.jsx`)
Varsayılan sade gri metinler yerine, tüm sekmeler için yönlendirici ve aksiyona teşvik edici yeni boş durum tasarımları (`EmptyState` bileşeni) uygulanmıştır:
1. **Bekleyen Talepler Boş:** Mavi ikonlu panel; şubelerden yeni talep geldiğinde buraya düşeceğini anlatır ve yeni ikmal talebi başlatmak için ipucu verir.
2. **Toplama Listesi Boş:** Mor ikonlu panel; listenin oluşması için öncelikle sevk bekleyen siparişlerin seçilmesi gerektiğini belirtir.
3. **Dağıtım Detayları Boş:** Dağıtım kırılımının henüz seçili bir sipariş olmadığı için gösterilemediğini açıklar.
4. **Sevkiyatlar Boş:** Sarı ikonlu panel; yeni bir araç yükleme başlatmak için bekleyen siparişleri seçip sağ üstteki "Sevk Et" butonunun kullanılacağını belirten rehber metin içerir.

### D. Derleme Doğrulaması
Yapılan tüm görsel cilalamalar sonrasında Vite production build başarıyla tamamlanmış ve `dist/assets/DepoOrders-D5QYQZrm.js` (56.41 kB) hatasız derlenmiştir.
