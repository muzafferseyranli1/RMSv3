# WMS Faz 4: Depo Mal Kabul ve Putaway Uygulama Planı

Bu plan, `docs/ana_depo_wms_agent_talimatlari.md` belgesindeki Faz 4 adımlarını uygulamayı amaçlamaktadır. Depo mal kabul süreçlerinde lokasyon, LPN/palet, lot numarası, son kullanma tarihi (SKT) ve kalite/karantina durumlarının toplanarak `inventory_movements` ve `purchase_receipt_lines` seviyesinde işlenmesini hedefler. Ayrıca, şube mal kabulünün depodan sevk onayı almamış siparişleri listelememesini garanti altına alır.

## User Review Required

> [!IMPORTANT]
> - **Depo (WMS) vs. Şube Ayrımı:** Mal kabul ekranı (`MalKabul.jsx`) hem şube hem de depo workspace bağlamlarında ortak çalışacaktır. `/depo-mal-kabul` rotası üzerinden (scope = `'anadepo'`) girildiğinde WMS modu aktif olacak; lokasyon, LPN, lot, SKT ve kalite durum alanları görünür ve zorunlu olacaktır.
> - **Lokasyon Zorunluluğu:** WMS mal kabulünde, sıfırdan büyük miktar kabul edilen her satır için bir lokasyon (`location_id`) seçilmesi zorunlu kılınacaktır. Seçim yapılmazsa kayıt engellenecektir.
> - **Şube Mal Kabulü Kısıtlaması:** Şube mal kabul ekranında, iç depo ikmal siparişleri (`warehouse_replenishment`) sadece depo sevk onayı verdiğinde (`meta.supplier_marked_sent === true`) listelenecektir. Böylece yola çıkmamış ürünlerin şube tarafından kabul edilmesi engellenir.

## Open Questions

> [!NOTE]
> - Depoda varsayılan kabul lokasyonu bulunmadığı durumlarda kullanıcıların lokasyon ekleyebilmesi için yönlendirici uyarı mesajı eklenecektir.

## Proposed Changes

### Frontend Components & Pages

#### [MODIFY] [MalKabul.jsx](file:///c:/RMSv3/src/components/pages/MalKabul.jsx)

- **WMS State Tanımları:**
  - `warehouseLocations` (aktif lokasyonları tutar)
  - `warehouseLpns` (aktif LPN listesini tutar)
  - `warehouseSettings` (ürün bazlı varsayılan lokasyon ayarlarını tutar)
- **Veri Yükleme (`loadInventory`):**
  - Seçilen şube/depo değiştiğinde ve `scope === 'anadepo'` ise, ilgili depoya ait `warehouse_locations`, `warehouse_lpns` ve `stock_item_warehouse_settings` kayıtlarını çekerek state'leri doldurmak.
- **Şube İkmal Siparişi Filtresi (`branchOrders`):**
  - `orders.filter` mantığını güncelleyerek, `flow_channel === 'warehouse_replenishment'` olan siparişler için `meta.supplier_marked_sent === true` kontrolü eklemek.
- **Taslak Hazırlama (`buildOrderDraft` & `addManualLine`):**
  - Eğer `scope === 'anadepo'` ise, her bir ürün satırı için `stock_item_warehouse_settings` tablosundan `default_location_id` çözüp `line.location_id` alanına atamak.
  - Satır bazlı `lpn_id`, `lot_number`, `expiration_date` ve `availability_status` (varsayılan: `'available'`) alanlarını başlatmak.
- **WMS Detay Paneli (`ReceiptEditorModal`):**
  - Modal bileşenine `isWmsMode`, `warehouseLocations` ve `warehouseLpns` prop'larını geçmek.
  - Eğer `isWmsMode` aktif ise, ürün tablosundaki her satırın hemen altına katlanabilir/açık bir WMS Detay satırı eklemek.
  - Bu detay satırında:
    - **Lokasyon Seçici:** Depodaki aktif lokasyonlar (`warehouse_locations`).
    - **LPN / Palet Seçici:** Depodaki aktif LPN'ler (`warehouse_lpns`).
    - **Lot Numarası:** Serbest metin girişi.
    - **Son Kullanma Tarihi (SKT):** Tarih seçici.
    - **Kullanılabilirlik Durumu:** `'available'` (Kullanılabilir), `'quarantine'` (Karantina), `'putaway_pending'` (Putaway Bekliyor) seçenekleri.
- **Validasyon Kontrolü (`save`):**
  - WMS modunda, teslim alınan miktarı (`received_qty`) 0'dan büyük olan her satırda `location_id` alanının dolu olduğunu doğrulamak. Dolu değilse kaydı durdurup uyarmak.
- **Kalıcı Kayıt Yapısı (`persistReceipt`):**
  - `purchase_receipt_lines` insert aşamasında WMS alanlarını satırın `meta` JSONB nesnesine kaydetmek.
  - `inventory_movements` insert aşamasında, `location_id`, `lpn_id`, `lot_number` ve `expiration_date` kolonlarını doğrudan doldurmak; `availability_status` bilgisini ise `meta.availability_status` alanında saklamak.

---

## Verification Plan

### Automated / Semi-Automated Tests
- `npm run build` komutu ile projenin sıfır hata ile derlendiğini doğrulamak.

### Manual Verification
- **/depo-mal-kabul (WMS Modu):**
  - Depo mal kabul ekranına girildiğinde, mal kabul detay modalında WMS alanlarının (Lokasyon, LPN, Lot, SKT, Durum) her satır için doğru şekilde render edildiğini doğrulamak.
  - Lokasyon seçilmeden kaydedilmeye çalışıldığında hata mesajı alındığını doğrulamak.
  - Başarılı kayıtta, veritabanındaki `inventory_movements` tablosunda ilgili satırlar için `location_id`, `lpn_id`, `lot_number`, `expiration_date` kolonlarının ve `meta.availability_status` değerinin doğru yazıldığını doğrulamak.
- **/mal-kabul (Şube Modu):**
  - Standart şube mal kabulüne girildiğinde, WMS detay satırlarının render edilmediğini ve standart mal kabul akışının hiçbir değişiklik olmadan, geriye dönük uyumlu çalıştığını doğrulamak.
  - Henüz depodan sevk edilmemiş (`meta.supplier_marked_sent` değeri true olmayan) ikmal siparişlerinin şube listesine düşmediğini, sevk onayı verildiğinde ise düştüğünü doğrulamak.
