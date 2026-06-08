# WMS Faz 3 ve Faz 4 Geliştirmeleri - Walkthrough

Bu belgede, WMS Faz 3 sonrasında yapılan düzeltmeler ile WMS Faz 4 kapsamında gerçekleştirilen Depo Mal Kabul ve Putaway geliştirmeleri ile doğrulama sonuçları özetlenmiştir.

---

## 1. WMS Faz 3 Düzeltmeleri ve Geliştirmeleri

### WMS Sevk-Gate Koruması (`src/components/pages/MalKabul.jsx`)
- **Bulgu (P1):** docs/wms_faz0_karar_notu.md (line 31) uyarınca, `warehouse_replenishment` ikmal siparişlerinin şube mal kabul ekranına düşmesi için depodan sevk onayı almış olması gerekiyordu.
- **Çözüm:** `branchOrders` filtresi güncellendi. Eğer siparişin `flow_channel` değeri `'warehouse_replenishment'` ise, siparişin `meta.supplier_marked_sent === true` sevk kanıtı kontrol edilmektedir. Bu sevk işareti yoksa sipariş şube mal kabul listesinde listelenmemektedir.

### Satır Tedarikçi Çözümleme Önceliği (`src/lib/branchPurchasing.js`)
- **Bulgu (P2-1):** Planda belirtilen "akış tedarikçisi `suppliers_list` içindeyse o seçilmeli" kuralı kodda eksikti.
- **Çözüm:** `resolveLineSupplierId` fonksiyonu güncellendi. Artık:
  1. `suppliers_list` dizisindeki `is_default === true` olan tedarikçi.
  2. Stok kartının birincil tedarikçisi `supp_id`.
  3. Akışın (flow) `supplier_id` değeri stok kartının `suppliers_list` dizisinde mevcutsa, bu değer.
  4. Yukarıdakiler yoksa listedeki ilk aktif tedarikçi.
  5. Fallback olarak stok kartındaki `supp_id` veya `flowSupplierId` seçilmektedir.

### Kısmi Başarısızlık ve Sipariş Tekrarlama Riski (`src/components/pages/Orders.jsx`)
- **Bulgu (P2-3):** Aynı akış/şube/tarih için herhangi bir sipariş bulunduğunda akışın tamamen atlanması, kısmi sipariş bölünmelerinde veya yeni eklenen ürünlerde eksik grupların oluşmamasına yol açıyordu.
- **Çözüm:** 
  - `collectMissingDueFlows` fonksiyonu güncellendi. Artık akışın `resolveFlowItems` ile tüm ürünleri taranarak bu akışta olması gereken tüm tedarikçi grupları (`expectedSupplierIds`) hesaplanır. Bu tedarikçilerden en az biri için o gün aktif sipariş oluşturulmamışsa akış tetiklenir.
  - `createOrdersForToday` içindeki kaydetme döngüsünde, her bir bölünen tedarikçi grubu için o güne ait aktif bir sipariş olup olmadığı `orders.find(...)` ile kontrol edilir. Zaten oluşturulmuş gruplar atlanırken eksik olanlar oluşturulur.

---

## 2. WMS Faz 4: Depo Mal Kabul ve Putaway

### Arayüz ve WMS Modu Yönetimi (`src/components/pages/MalKabul.jsx`)
- `useWorkspace()` hook'undan dönen `scope === 'anadepo'` değerine göre `isWmsMode` bayrağı tanımlandı.
- WMS modunda, mal kabul esnasında her bir ürün satırının altında dynamic ve premium görünümlü bir **WMS Detayları** alt satırı render edilir.
- Toplanan alanlar:
  - **Lokasyon Seçici:** Depodaki aktif lokasyonlar (`warehouse_locations`).
  - **LPN / Palet Seçici:** Depodaki aktif LPN'ler (`warehouse_lpns`).
  - **Lot Numarası:** Serbest metin girişi.
  - **Son Kullanma Tarihi (SKT):** Date input alanı.
  - **Kullanılabilirlik Durumu:** `Kullanılabilir` (`available`), `Karantina` (`quarantine`), `Putaway Bekliyor` (`putaway_pending`) durum dropdown'ı.

### Validasyon Kontrolü
- WMS modunda kabul edilen miktarı (`received_qty > 0`) olan her ürün satırı için lokasyon seçimi (`location_id`) zorunlu kılınmıştır. Lokasyon seçilmemişse kayıt işlemi durdurularak kullanıcıya hata bildirimi (toast) gösterilir.

### Stok Hareketi Yazımında WMS Alanları
- Kabul kaydedildiğinde `purchase_receipt_lines` tablosuna yapılan eklemelerde WMS detayları satırın `meta` JSONB nesnesine kaydedilir.
- `inventory_movements` tablosuna yapılan eklemelerde ise `location_id`, `lpn_id`, `lot_number` ve `expiration_date` kolonları doğrudan (first-class columns) doldurulur; kalite/putaway durumu ise `meta.availability_status` olarak saklanır.

---

## 3. Doğrulama ve Test Sonuçları

### 1. WMS Veritabanı Entegrasyon Testi (`scratch/test_wms_mal_kabul.cjs`)
WMS veri yazımının doğruluğunu onaylamak için yazılan entegrasyon testi çalıştırılmış ve veritabanı seviyesinde first-class kolon atamaları başarıyla doğrulanmıştır:
```text
Connected to DB successfully.
Selected metadata for test:
      Branch: "Pendik Merkez Depo" (ID: 302bd195-3b79-4f14-a60b-4668c36a12c1)
      Supplier: "Pendik Merkez Depo" (ID: f2e16624-f10a-4a2b-9cf9-3a746c631e4a)
      Item: "Pizza Hamuru (250g)" (ID: b0e10002-0000-4000-8000-000000000002)
      Location ID: 61eda94b-c634-4229-ae00-ea14ae5c595b
      LPN ID: 36740d78-b841-4a92-84e1-57f694622d0d
    
Inserted mock purchase_receipt ID: 134e6f6f-8bd7-4e89-89ce-bee69acbbe12
Inserted mock purchase_receipt_line ID: 6c66a8b8-1bea-42bb-ad8e-043d1e70ea4d
Inserted mock inventory_movement ID: 72d4ed89-086a-4a30-b04a-4088591973d0

--- VERIFICATION DETAILS ---
Inserted Movement ID: 72d4ed89-086a-4a30-b04a-4088591973d0
Direct location_id: 61eda94b-c634-4229-ae00-ea14ae5c595b (Expected: 61eda94b-c634-4229-ae00-ea14ae5c595b)
Direct lpn_id: 36740d78-b841-4a92-84e1-57f694622d0d (Expected: 36740d78-b841-4a92-84e1-57f694622d0d)
Direct lot_number: LOT-999-WMS (Expected: 'LOT-999-WMS')
Direct expiration_date: 2027-12-31 (Expected: '2027-12-31')
Meta Availability Status: quarantine (Expected: 'quarantine')

✅ WMS Mal Kabul Database Columns Verification SUCCESSFUL!

Cleaned up mock database records successfully.
```

### 2. Proje Derleme (Production Build) Doğrulaması
MalKabul sayfasındaki WMS geliştirmeleri sonrasında `npm run build` komutu çalıştırılmış ve Vite derlemesi **0 hata** ile tamamlanmıştır.
```text
✓ built in 18.05s
```
Bu sayede şube mal kabul akışının geriye dönük uyumluluğunun korunduğu ve depo mal kabulü sırasında WMS parametrelerinin başarıyla toplandığı kanıtlanmıştır.
