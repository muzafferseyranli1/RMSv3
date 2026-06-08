# WMS Faz 0: Veri Modeli ve Mimari Karar Notu

Tarih: `2026-06-08`
Durum: `Faz 0 Kararları Netleştirildi`

Bu doküman, `docs/ana_depo_siparis_modeli.md` tasarım notu ve `docs/ana_depo_wms_agent_talimatlari.md` uygulama kılavuzuna istinaden, Faz 0 (Keşif ve Karar Netleştirme) aşamasında alınan mimari kararları ve etki analizini içermektedir.

---

## Alınan Kararlar

### 1. WMS İkmal Talebi Veri Modeli
* **Karar:** WMS ikmal talepleri (depo ikmal talepleri) için ayrı bir `warehouse_requisitions` tablosu açılmayacaktır. Bunun yerine, mevcut `purchase_orders` ve `purchase_order_lines` tabloları **ortak veri yapısı** olarak kullanılacaktır.
* **Gerekçe:** 
  1. `Orders.jsx` altındaki gelişmiş otomatik sipariş taslağı oluşturma, satış tahminleme algoritması (forecasting), onay mekanizmaları (şube/genel merkez onayı) ve ürün kısıt yönetimi kod tabanında son derece kapsamlıdır. Ayrı bir tablo açılması bu karmaşık mantığın tamamen kopyalanmasına (code duplication) ve bakım zorluğuna yol açacaktır.
  2. Sipariş akışı, sipariş satırlarındaki tedarikçinin `supplier_kind` değerinin `internal_warehouse` olması durumunda otomatik olarak bir WMS ikmal talebi haline gelecektir.
  3. `purchase_orders` tablosuna (ve gerekirse `order_flows` tablosuna) kanonik bir `flow_channel` (değerler: `external_purchase`, `warehouse_replenishment`, `kitchen_replenishment`) kolonu eklenecektir. Bu sayede veri analizi ve ekran bazlı ayırma işlemleri performanslı şekilde yapılacaktır.

### 2. Stok Durum ve Putaway/Karantina/Kullanılabilir Stok Ayrımı
* **Karar:** İlk aşamada veritabanı şemasına doğrudan yeni durum kolonları eklemek yerine, `inventory_movements.meta` (JSONB) alanı kullanılacaktır.
* **Detay:**
  1. Stok hareketlerinde kalıcı olarak stok durumu `meta->>'availability_status'` altında `available` (kullanılabilir), `quarantine` (karantina) ve `putaway_pending` (yerleştirme bekliyor) değerleriyle tutulacaktır.
  2. WMS Lokasyon yapısı (`warehouse_locations`) bu ayrımı destekler. Lokasyonun tipi (`usage_type`) ve adresi (örneğin karantina alanı veya kabul alanı) doğal olarak stoğun durumunu yansıtır.
  3. **Kritik Uyarı (Faz 1+):** Stok yeterlilik hesapları yapılırken, genel stok bakiyesi son balance_qty_after değerinden doğrudan alınmamalı; `availability_status` değeri `available` dışındaki (quarantine, putaway_pending) kayıtlar hesaplamalardan kesinlikle hariç tutularak "kullanılabilir stok" belirlenmelidir.
  4. Performans gereksinimleri ileride netleştiğinde, bu alanlar doğrudan indeksli kolonlara dönüştürülebilir. İlk fazda risk minimumda tutularak geriye uyumluluk korunacaktır.

### 3. Şube Kabul Adımı Akışı
* **Karar:** Şubeye sevk edilen mallar için şube kabul (mal kabul) adımı **zorunlu** olacaktır; sevk anında şube stoğuna otomatik giriş yapılmayacaktır.
* **Detay:**
  1. Yoldaki stokların kontrolü, fire/hasar yönetimi ve miktar uyuşmazlıklarının tespiti için şube mal kabul süreci gereklidir.
  2. **Kritik Uyarı (Faz 1+):** Mevcut şube `MalKabul.jsx` ekranı, `purchase_orders` tablosundaki `submitted` veya `partially_received` durumundaki siparişleri mal kabul olarak işlemek üzere tasarlanmıştır. WMS siparişlerinde ise `submitted` durumu depodan sevk edilmeden önce de oluşabilir. Bu nedenle, `warehouse_replenishment` siparişleri şube mal kabule ancak depodan sevk edildikten sonra (örneğin `meta.supplier_marked_sent = true` sevk kanıtı / dispatch kontrolü ile) düşmelidir. Sadece statünün `submitted` olması yeterli sayılmamalıdır.

### 4. İç Tedarikçi Yönetimi
* **Karar:** `suppliers` tablosunda `supplier_kind = 'internal_warehouse'` olan kayıtlar Şirket Ağacı (`company_tree` settings) senkronizasyonu ile otomatik yönetilecektir. 
* **Detay:** Ancak, kullanici Suppliers ekranında bu iç tedarikçilerin banka bilgisi, sipariş mail adresi veya dahili notlar gibi operasyonel alanlarını düzenleyebilecektir. Kaydın silinmesi durumunda tarihsel sipariş bütünlüğünü korumak için `deleted_at` veya `active = false` bayrakları kullanılacaktır.

### 5. Çoklu Depo Sipariş Yönlendirmesi
* **Karar:** Stok kartında (`stock_items`) varsayılan tedarikçi (`supp_id`) veya tedarikçi listesi (`suppliers_list`) içinden seçilen depo supplier'ı temel alınacaktır.
* **Detay:** Çoklu depo yönlendirmesi için karmaşık bölge eşleştirme algoritmaları yerine, mevcut `OrderFlows` (Sipariş Akışları) motorundaki şube-tedarikçi-ürün eşleştirme kuralları kullanılacaktır. Her şube/depo kombinasyonu için ayrı bir `OrderFlow` tanımlanabilmesi bu ihtiyacı tamamen karşılamaktadır.

### 6. Depo İçi Lokasyon Transferleri
* **Karar:** Depo içi lokasyon transferleri (Putaway veya raftan rafa taşıma), şubeler arası `InventoryTransfer` ekranından ayrılacaktır.
* **Detay:** Depocunun kullanımı için LPN veya lokasyon bazlı çalışan, doğrudan `inventory_movements` üreten daha hafif ve hızlı bir "Lokasyon Taşıma" (Putaway/Bin-to-Bin) ekranı tasarlanacaktır. Arka planda yine `location_id` ve `lpn_id` güncellemeleri stok hareketleriyle izlenecektir.

---

## Etkilenen Tablo ve Ekran Listesi

### Etkilenen Tablolar
1. **`suppliers`**
   * Eklenen/Güncellenen Kolonlar:
     * `supplier_kind` (TEXT, varsayılan `external`)
     * `source_workspace_scope` (TEXT)
     * `source_branch_id` (UUID)
     * `is_system_generated` (BOOLEAN)
     * `sync_key` (TEXT)
2. **`purchase_orders`**
   * Eklenen/Güncellenen Kolonlar:
     * `flow_channel` (TEXT, varsayılan `external_purchase`)
3. **`order_flows`**
   * Eklenen/Güncellenen Kolonlar:
     * `flow_channel` (TEXT, varsayılan `external_purchase`)
4. **`inventory_movements`**
   * (WMS kolonları `location_id`, `lpn_id`, `lot_number`, `expiration_date` zaten mevcuttur).
   * Meta alanında `availability_status` bilgisi takip edilecektir.

### Etkilenen Ekranlar
1. **`Suppliers.jsx` (Tedarikçi Yönetimi):** İç tedarikçilerin badge ile ayrılması, silme ve düzenleme kısıtlarının kontrolü.
2. **`OrderFlows.jsx` (Sipariş Akışı Tanımlama):** Tedarikçi seçiminde `supplier_kind` ayrımının gösterilmesi ve iç depo seçildiğinde dilin "İkmal Deposu", "WMS Talebi" olarak güncellenmesi.
3. **`Orders.jsx` (Şube Sipariş Ekrani):** Sipariş oluşturulurken seçilen tedarikçi tipine göre `purchase_orders.flow_channel` değerinin atanması.
4. **`MalKabul.jsx` (Mal Kabul Ekrani):** WMS sevk bilgisi alındığında mal kabul listesine düşme mantığı. Depo mal kabul modu için lokasyon, LPN, lot ve SKT alanlarının girilmesinin zorunlu kılınması.
5. **`SupplierOrderPanel.jsx` / Yeni WMS Sipariş Konsolu:** Mevcut tedarikçi paneli kopyalanmayacak, ancak buradaki sevk bildirim mantığı referans alınarak WMS Sipariş Konsolu'nda stok yeterlilik, toplama listesi, LPN ve plaka/araç atamaları tasarlanacaktır.

---

## Risk ve Geri Dönüş Planı

### Risk 1: Geriye Uyumluluk ve Mevcut Sipariş Akışlarının Bozulması
* **Açıklama:** `purchase_orders` tablosuna yeni kolonlar/filtreler eklenmesi mevcut şube sipariş ve onay süreçlerinde hataya yol açabilir.
* **Önlem:** Eklenen kolonlar nullable veya varsayılan değere (`external_purchase`) sahip olacaktır. Mevcut kodların tamamı default davranışa göre çalışmaya devam edecektir. Filtreler sadece `flow_channel = 'warehouse_replenishment'` olan kayıtları WMS konsoluna yönlendirecektir.

### Risk 2: Şube Mal Kabulünde Uyuşmazlık Yaşanması
* **Açıklama:** Depodan sevk edilen miktar ile şubenin kabul ettiği miktar arasında fark olması durumunda stok hareketlerinin çelişmesi.
* **Önlem:** Şube mal kabul ekranında girilen `received_qty` değeri nihai şube stoğunu güncelleyecektir. Aradaki fark (eksik teslimat) WMS panelinde raporlanacak ve gerekiyorsa otomatik zayi veya düzeltme kaydı oluşturulacaktır.

### Geri Dönüş Planı
1. Kod tabanında yapılan değişiklikler git branch yapısında izole tutulacaktır.
2. Railway veritabanı şemasına eklenen kolonlar ve indeksler geriye dönük uyumlu olduğu için tablo düşürme (drop table) gerektirmeyecektir. Gerekirse eklenen kolonlar kaldırılmadan pasif bırakılabilir.
3. Herhangi bir regresyon durumunda, `flow_channel` filtreleri kaldırılıp eski akış (`supplier_kind` kontrolü olmaksızın) hızlıca devreye alınabilecektir.
