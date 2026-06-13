# Walkthrough: WMS Phase 4 - Kalite, Karantina ve Barkod Master Data (WMS-04A, WMS-04B, WMS-04C, WMS-04D)

Bu belgede WMS Faz 4 kapsamında gerçekleştirilen kalite hold şeması, karantina yönetim ekranı, lot izlenebilirlik raporu ve ürün barkod/paketleme master data entegrasyonu anlatılmaktadır.

## Yapılan Değişiklikler

### 1. Veritabanı ve Migration Katmanı (WMS-04A, B, C, D)
- **`warehouse_quality_holds` Tablosu (`047`)**: Karantina (`hold`), kabul (`released`), ret (`rejected`) ve fire/hurda (`scrapped`) süreçlerini izlemek üzere oluşturuldu.
- **Otomatik Karantina Trigger'ı (`after_inventory_movement_quarantine`)**: `inventory_movements` tablosuna `availability_status = 'quarantine'` olan bir giriş hareketi eklendiğinde tetiklenir. Android task event metasındaki ve exception'daki kanıt resimlerini (`evidence_photo_url`) otomatik yakalayarak kalite hold kaydına bağlar.
- **Kalite Çözümleme Fonksiyonu (`resolve_warehouse_quality_hold`)**: Kalite kontrol memurunun hold statüsünü `release`, `reject` veya `scrap` yapabilmesi için atomik RPC tanımlandı. Bu RPC, stoku karantinadan düşüren transfer hareketlerini otomatik olarak oluşturarak audit izi bırakır.
- **Karantina Görünümü (`v_warehouse_quality_holds` - `048`)**: İlişkisel tabloları (LPN, Lokasyon, Ürün) birleştirerek frontend için tek sorguda okunabilir hale getirir.
- **Lot İzlenebilirlik Raporu RPC'leri (`049`)**:
  - `get_lot_movements_report(p_lot_number)`: Belirtilen lot numarasının tüm depo hareketlerini kronolojik listeler.
  - `get_lot_android_events(p_lot_number)`: Lot numarasıyla eşleşen Android el terminali operasyon event'lerini (tarama, miktar girişi, tamamlama) kronolojik olarak listeler.
- **Kısmi Benzersiz Barkod İndeksi (`050`)**: `product_external_barcodes` tablosundaki `gtin_barcode` kolonu üzerindeki benzersizlik kısıtı güncellenerek yalnızca aktif barkodlar (`active = true`) için benzersizlik şartı getirilmiştir. Bu sayede eski pasif barkodların çakışması engellenmiştir.
- **Otomatik Paketleme Normalizasyon Trigger'ı (`sync_stock_item_package_units` - `050`)**: `stock_items` tablosuna bağlanan trigger ile her ürün ekleme/güncelleme işleminde, JSONB `packaging_units` dizisindeki hiyerarşik paket katsayıları normalize `stock_item_package_units` tablosuna otomatik olarak (upsert/delete) yansıtılmaktadır. Ayrıca ürünün ana ölçü birimi otomatik olarak taban birim (`is_base_unit = true`) şeklinde normalize edilmektedir.

### 2. Arayüz ve Web Ekranları (WMS-04B, WMS-04C)
- **Karantina Yönetim Ekranı (`WmsQuality.jsx`)**:
  - Karantina altındaki tüm stoklar listelenir.
  - Personel kanıt fotoğrafı thumbnail olarak görünür; tıklandığında modal ile büyük boy gösterilir.
  - Kalite yetkilisi gerekçe belirterek stokları kabul edebilir (`release`), tedarikçiye iade edebilir (`reject`) veya hurdaya ayırabilir (`scrap`).
- **Lot İzlenebilirlik Raporu (`WmsTraceability.jsx`)**:
  - Lot numarasına göre arama yapılır.
  - Stoğun hangi şube ve depolarda bulunduğunu gösteren **Recall Özet Tablosu** bulunur; tek tıkla CSV export desteği sunulur.
  - Stoğun el terminali üzerindeki hareket tarihçesini gösteren **Android İşlem Zaman Çizelgesi (Timeline)** dikey akış olarak görselleştirilmiştir.

### 3. Backend Barkod Çözümleme Sıralaması
`/api/wms/parse-barcode` endpoint'i, taranan barkodları aşağıdaki kesin öncelik sırasıyla çözümleyecek şekilde güncellenmiştir:
1. **Lokasyon Barkodu**
2. **LPN / SSCC**
3. **Onaylanmış Aktif Ürün/Paket Barkodu** (`is_approved = true` ve `active = true`)
4. **Lot / SKT Yapısı** (`LOT:` veya `EXP:` içeren yapılar)
5. **SKU Fallback** (Eşleşme bulunamayan durumlarda manuel ürün kodu fallback'i)

## Doğrulama ve Test Sonuçları

### 1. Kalite Hold Regression Testi
`scratch/test_wms_quality_hold_regression.cjs` regression aracı çalıştırılmış ve aşağıdaki akışlar başarıyla doğrulanmıştır:
- Karantinaya giren stokların `v_wms_pickable_stock` üzerinden görünmediği ve toplanmasının (pick) engellendiği,
- Kalite onay (release) işlemi sonrası stokların otomatik olarak transfer edilip toplanabilir hale geldiği,
- Tüm işlemlerin loglandığı ve audit trail oluşturduğu onaylanmıştır.

### 2. Barkod ve Paket Master Data Smoke Testi
`scratch/test_wms_barcode_package_units.cjs` test aracı çalıştırılarak aşağıdaki özellikler doğrulanmıştır:
- Ürün eklendiğinde taban birimin (`is_base_unit`) normalize tabloya otomatik senkronize olması,
- JSONB dizisi güncellendiğinde hiyerarşik katsayıların ve en/boy/hacim generated kolonunun (`volume_m3`) otomatik hesaplanması,
- Yalnızca aktif barkodlar için benzersizlik kontrolü (kısmi indeks) mantığının çalışması,
- `/api/wms/parse-barcode` çözümleme sıralaması ve helper sorguları doğrulanmıştır.

### 3. Derleme ve Build Doğrulaması
Vite build aracı (`npm run build`) çalıştırılarak frontend uygulamasının hatasız derlendiği ve yeni sayfaların pakete dahil edildiği doğrulanmıştır.
