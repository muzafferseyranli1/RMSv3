# WMS Faz 7: Depo Operasyon Derinleştirme Uygulama Planı

Bu plan, `docs/ana_depo_wms_agent_talimatlari.md` belgesindeki Faz 7 adımlarını uygulamayı amaçlamaktadır. Sayım, transfer, zayi ve serbest kullanım gibi depo operasyonlarını lokasyon, LPN, lot numarası ve son kullanma tarihi (SKT) bazlı hale getirmeyi; depo içi lokasyon taşıma akışını kurmayı; ve WMS lokasyon/LPN ekranlarında stok raporları sunmayı hedefler.

## User Review Required

> [!IMPORTANT]
> - **Lokasyon/LPN Stok Hesaplamaları:** WMS modunda lokasyon bazlı güncel stok miktarları, `inventory_movements` tablosunda ilgili lokasyon/LPN/lot/SKT'ye ait `quantity_signed` değerlerinin toplamı alınarak dinamik olarak hesaplanacaktır. Küresel şube bakiyesi (`balance_qty_after`) lokasyon seviyesindeki stoğu değil, şube toplamını yansıtmaktadır.
> - **Depo İçi Lokasyon Taşıma (Transfer):** Bu işlem şube bazlı genel stoku değiştirmeden, sadece ürünün adresini (lokasyon/LPN) değiştirir. Bir taşıma işlemi için aynı depoda bir `transfer_out` (çıkış) ve bir `transfer_in` (giriş) hareketi ardışık olarak kaydedilecektir.
> - **Mal Kabul Kriteri:** WMS modundaki sayım ve zayi işlemlerinde lokasyon bilgisi zorunlu olacaktır. LPN, lot numarası ve SKT alanları ise isteğe bağlı girilebilecektir.

## Open Questions

> [!NOTE]
> - `Count.jsx` sayım ekranında WMS modunda varsayılan olarak mevcut tüm stok lokasyon/LPN satırları yüklenecektir. Sayım esnasında sistemde görünmeyen yeni bir lokasyonda stok bulunursa, depocu "Raf Satırı Ekle" butonuyla o ürün için yeni bir lokasyon/LPN sayım satırı ekleyebilecektir.

## Proposed Changes

### 1. Sayım Arayüzü Güncellemesi

#### [MODIFY] [Count.jsx](file:///C:/RMSv3/src/components/pages/Count.jsx)
- **WMS Modu Tespiti:**
  - `isWmsMode` bayrağının set edilmesi: `scopeVariant === 'anadepo' || useWorkspace().scope === 'anadepo'`.
- **WMS Lokasyon ve LPN Yükleme:**
  - WMS modunda `warehouse_locations` (aktif branch_id'ye ait) ve `warehouse_lpns` verilerinin yüklenmesi.
- **Lokasyon Bazlı Stok Hesaplama (`refreshBalances`):**
  - WMS modunda, movements tablosundan `stock_item_id, location_id, lpn_id, lot_number, expiration_date, quantity_signed` alanları çekilerek lokasyon seviyesindeki son stok bakiyeleri hesaplanacaktır.
- **WMS Sayım Satırları Yapısı:**
  - Ürün listesinde her bir SKU için, mevcut stoku bulunan her lokasyon/LPN/lot/SKT kombinasyonuna ait ayrı birer satır listelenecektir.
  - "Raf Satırı Ekle" modalı/arayüzü eklenerek, kullanıcının o ürün için yeni bir lokasyon/LPN/lot/SKT sayım satırı eklemesine izin verilecektir.
  - Kayıt esnasında WMS modunda her sayım satırı için lokasyon seçimi zorunlu tutulacaktır.
- **Envantere Yansıtma (`postInventoryAdjustments`):**
  - Fark bulunan her lokasyon/LPN satırı için ayrı `stock_count_gain` veya `stock_count_loss` hareketleri oluşturulacaktır. `location_id`, `lpn_id`, `lot_number` ve `expiration_date` alanları DB'ye yazılacaktır.

---

### 2. Zayi ve Serbest Kullanım Güncellemesi

#### [MODIFY] [InventoryOperationRecord.jsx](file:///C:/RMSv3/src/components/pages/InventoryOperationRecord.jsx)
- **WMS Modu Entegrasyonu:**
  - WMS modunda (`scope === 'anadepo'`) şube seçimi kilitlenip aktif depo branch'i kullanılacaktır.
  - Lokasyon ve LPN listeleri yüklenecektir.
- **Kaynak Seçim Kolaylığı:**
  - Kullanıcı bir ürün seçtiğinde, depodaki mevcut lokasyon/LPN/lot/SKT bakiye listesi çekilerek "Mevcut Kaynaklar" dropdown'ında gösterilecektir.
  - Seçilen kaynağa göre Lokasyon, LPN, Lot No ve SKT alanları otomatik doldurulacaktır. Kullanıcı dilerse bu alanları manuel de seçebilecektir.
- **DB Yazım Süreci:**
  - `inventory_movements` insert payload'una `location_id`, `lpn_id`, `lot_number` ve `expiration_date` alanları eklenecektir.

---

### 3. Depo İçi Lokasyon Taşıma (Transfer)

#### [MODIFY] [InventoryTransfer.jsx](file:///C:/RMSv3/src/components/pages/InventoryTransfer.jsx)
- **Mod Seçici (Tab/Toggle):**
  - WMS modunda ekranın üstüne "Depolar Arası Transfer" ve "Depo İçi Lokasyon Taşıma" sekmeleri eklenecektir.
- **Depo İçi Lokasyon Taşıma Akışı:**
  - Hedef ve kaynak şube aktif depo olarak kilitlenecektir.
  - Her satır için:
    - Ürün seçimi.
    - Kaynak Lokasyon, LPN, Lot No ve SKT (mevcut bakiyelerden seçilebilir).
    - Hedef Lokasyon ve Hedef LPN.
    - Taşınacak miktar.
  - Kaydedildiğinde:
    - İlgili depoda kaynak lokasyon için `direction = 'out'`, `movement_type = 'transfer_out'`, `source_doc_type = 'transfer'` olan stok çıkış hareketi.
    - Hedef lokasyon için `direction = 'in'`, `movement_type = 'transfer_in'`, `source_doc_type = 'transfer'` olan stok giriş hareketi.
    - İki hareket `transfer_pair_id` (ortak UUID) ile birbirine bağlanacaktır.

---

### 4. WMS Lokasyon & LPN Stok Raporları

#### [MODIFY] [WmsLocations.jsx](file:///C:/RMSv3/src/components/pages/WmsLocations.jsx)
- Her lokasyon satırına "Stok Raporu" butonu eklenecektir.
- Butona basıldığında açılan modalda, o lokasyonda `sum(quantity_signed) > 0` olan tüm ürünler, LPN, lot ve SKT kırılımıyla listelenecektir.

#### [MODIFY] [WmsLpns.jsx](file:///C:/RMSv3/src/components/pages/WmsLpns.jsx)
- Her LPN satırına "Stok Raporu" butonu eklenecektir.
- LPN'deki stoklar ürün, lokasyon, lot ve SKT bazında modalda listelenecektir.

---

### 5. Stok Hareketleri Filtreleri

#### [MODIFY] [InventoryMovements.jsx](file:///C:/RMSv3/src/components/pages/InventoryMovements.jsx)
- Filtre alanlarına "Lokasyon" (`location_id`) ve "LPN" (`lpn_id`) dropdown'ları eklenecektir.
- Seçim yapıldığında listelenen stok hareketleri bu alanlara göre filtrelenecektir.

---

## Verification Plan

### Automated Tests
- `npm run build` ile Vite derlemesinin hatasız tamamlandığı doğrulanacaktır.
- Depo içi lokasyon taşıma akışını, sayım ve zayi hareketlerini lokasyon/LPN/lot bazlı test eden entegrasyon test scripti (`scratch/test_wms_phase7.cjs`) yazılacaktır.

### Manual Verification
- **Lokasyon Stok Raporu:** Bir lokasyondaki stok raporu ile `inventory_movements` toplamlarının eşleştiği kontrol edilecektir.
- **Lokasyon Taşıma:** Yapılan depo içi transferin şube toplam stok miktarını etkilemediği, sadece iki lokasyon arasındaki bakiyeyi kaydırdığı DB'den doğrulanacaktır.
- **WMS Sayım:** Sayım yapıldığında fark hareketlerinin doğru lokasyon/LPN/lot bilgileriyle kaydedildiği teyit edilecektir.
