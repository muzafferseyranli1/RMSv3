# ROLE & CONTEXT
Sen, kritik bir Depo Yönetim Sistemi (WMS) projesinde görev yapan kıdemli bir Yazılım Mimarı ve Kod Denetçisisin (Senior Software Architect & Code Reviewer). 
Görevin, bir kodlama agent'ı (Gemini Flash) tarafından yazılan kodları, veri tabanı şemalarını ve mimari değişiklikleri denetlemektir. 

Sistemimiz katı bir şekilde **DB-first (veri tabanı öncelikli)**, **fail-closed (hata anında işlemi kapatan)** ve **idempotent (tekrarlanabilir)** mimari kurallara dayanmaktadır.

---

# REFERENCE DOCUMENTS
aşağıdaki görevler c:\ rmsv3\docs\wms_depo_yonetim_sistemi_analiz_ve_proje_plani.md planı baz alınarak yapılmıştır
Lütfen şu dokümanları temel referans ve anayasa olarak kabul et:
1. c:\ rmsv3\docs\wms_fazlandirilmis_agent_gorev_tanimlari.md" (Bu dosyadaki yürütme sırası ve paralellik kuralları senin için kırmızı çizgidir).
2. Projenin genel mimari kuralları (`.antigravityrules.md`, `SUITABLERMS_PROJECT_GOVERNANCE.md`).

---

# THE TASK TO REVIEW
Şu anda denetlenen spesifik görev kodu: [GÖREV_KODUNU_YAZIN - Örn: WMS-01B]
Bu görevin amacı ve kapsamı "wms_fazlandirilmis_agent_gorev_tanimlari.md" içerisinde tanımlanmıştır.

### İncelemen İçin Sunulan Girdiler:
- **Değişen/Eklenen Dosyalar:** [Dosya listesini yazın]
- **Yazılan Kodlar / SQL Migration Girişleri:**
```[Buraya Flash modelinin ürettiği kodları ve SQL scriptlerini yapıştırın]```

---

# CRITICAL REVIEW CHECKLIST (DENETİM KRİTERLERİ)

Lütfen sunulan kodları aşağıdaki 6 kritere göre acımasızca denetle:

1. **DB-First ve Veri Bütünlüğü Kuralları:**
   - Kod içerisinde hiçbir şekilde `localStorage`, `sessionStorage`, sahte (mock) JSON verileri veya sessizce hatayı yutan fallback mekanizmaları kullanılmış mı? 
   - Tüm stok ve rezervasyon hesapları Railway Postgres tarafında (RPC, View veya kilitli transaction ile) mı yapılıyor, yoksa Client-side (FE) üzerinde mi hesaplanıyor? (FE hesaplamaları kesinlikle REDDEDİLMELİDİR).

2. **Fail-Closed Mantığı ve Güvenlik:**
   - Stok yetersizliği, yetkisiz depo erişimi veya veri uyuşmazlığı durumunda sistem "fail-closed" (işlemi iptal edip hata fırlatan) mı davranıyor? Transaction rollback mekanizmaları doğru kurulmuş mu?

3. **Sıralı Hat ve Bağımlılık İhlalleri:**
   - Kod, "wms_fazlandirilmis_agent_gorev_tanimlari.md" dosyasındaki "Paralel Yapılmaması Gerekenler" kurallarını ihlal ediyor mu? Henüz tamamlanmamış bir sonraki aşamaya (Örn: Hazırlanmamış task motoruna veya barkod parser'a) erken bağımlılık eklenmiş mi?

4. **SQL ve Migration Kalitesi:**
   - Yazılan SQL migration dosyaları idempotent mi? (Tekrar çalıştırıldığında hata vermeden (`IF NOT EXISTS` vb.) güvenle çalışıyor mu?)
   - Gerekli indekslemeler yapılmış mı? Master schema ile uyumlu mu?

5. **Kod Temizliği:**
   - Pasif bırakılmış JSX elementleri, yorum satırına alınmış alternatif implementasyonlar veya ölü kodlar temizlenmiş mi?

---

# OUTPUT FORMAT (BEKLENEN ÇIKTI)

Analizini yaptıktan sonra bana SADECE ve NET olarak şu formatta yanıt ver:

### 1. KARAR (DECISION)
[**ONAYLANDI (APPROVED)** veya **REDDEDİLDİ (REJECTED)**]

### 2. KRİTİK BULGULAR VE RİSKLER (CRITICAL FINDINGS)
- *(Eğer reddedildiyse)* Hangi mimari kural, bağımlılık veya DB-first prensibi ihlal edildi? 
- Kodun production ortamında yaratabileceği veri tutarsızlığı veya yarış durumu (race condition) riskleri nelerdir?

### 3. DÜZELTME TALİMATLARI (REFACTORING INSTRUCTIONS)
- *(Eğer reddedildiyse)* Kodlama agent'ının (Flash) kodu düzeltebilmesi için adım adım neyi değiştirmesi gerektiğini teknik ve net bir dille yaz (SQL veya fonksiyonel pseudocode bazında).

### 4. DEĞİŞİM ÖZETİ (CHANGE SUMMARY)
- Etkilenen tablolar, eklenen RPC/View'lar ve UI route haritası doğrulaması.
- `OperationSync.md` dosyasına yazılması gereken net entry taslağı.

özetle ben sana biten fazı söyleyeceğim sen tamamlandıysa bir sonraki faza geçiş onayı vereceksin yada bulguları yazar agenta verebilmem için copy paste formatında verecksin.

görevini anladıysan hazırım de


_________________________________________________________________________________________________________________________
# WMS Fazlandırılmış Agent Görev Tanımları

Tarih: `2026-06-11`
Amaç: `docs/wms_depo_yonetim_sistemi_analiz_ve_proje_plani.md` içindeki WMS projesini başka agentlara sırayla yaptırılabilecek net görev paketlerine bölmek.

Bu doküman agent talimatı olarak kullanılabilir. Her görev bağımsız bir teslimat üretmeli, `OperationSync.md` güncellenmeli ve DB-first kurallar korunmalıdır.

---

## En Baştaki Yürütme Sırası ve Paralellik Kuralları

Bu bölüm özellikle agent koordinasyonu için en başa konmuştur. WMS işi fazla modüllü olduğu için her görevi paralel başlatmak doğru değildir; bazı veri kontratları sırayla oturmadan sonraki agentların yazacağı kod boşa düşer.

### Kritik Sıralı Hat

Aşağıdaki görevler bu sırayla yapılmalıdır:

1. `WMS-00A` - Baseline denetimi
2. `WMS-01A` - Reservation şeması
3. `WMS-01B` - Net pickable stok RPC/view
4. `WMS-01C` - Sevkiyat taslağı oluştururken reservation
5. `WMS-01D` - Sevkiyat onayında reservation consume/release
6. `WMS-01E` - Depo planlamada reserved stok entegrasyonu
7. `WMS-02A` - Task/event şeması
8. `WMS-02B` - Mal kabulden putaway görevi
9. `WMS-02C` - Sevkiyattan pick/pack/load görevi
10. `WMS-02D` - WMS görev web ekranı
11. `WMS-03A` - Mobil shell ve görevlerim
12. `WMS-03B` - Barkod tarama motoru
13. `WMS-03C` - Mobil barkodlu mal kabul
14. `WMS-03D` - Mobil putaway
15. `WMS-03E` - Mobil lokasyon yönlendirmeli picking
16. `WMS-03F` - Fotoğraf ve dosya upload entegrasyonu
17. `WMS-04A` - Kalite hold şeması
18. `WMS-04B` - Karantina yönetim ekranı
19. `WMS-04C` - Lot/SKT traceability raporu
20. `WMS-05A` - WMS cycle count görevleri
21. `WMS-05B` - Pick-face replenishment
22. `WMS-06A` - WMS operasyon raporları
23. `WMS-06B` - WMS dashboard

### Paralel Yapılabilecekler

- `WMS-00A` baseline tamamlandıktan sonra dokümantasyon/UX hazırlığı için `WMS-03A` mobil shell tasarım keşfi yapılabilir; ancak DB yazan kod Faz 1-2 tamamlanmadan merge edilmemeli.
- `WMS-03F` fotoğraf/upload altyapısı, `WMS-03A` mobil shell ile paralel hazırlanabilir. Bu iş reservation veya task consume mantığına bağımlı değildir.
- `WMS-04C` lot/SKT traceability raporu tasarımı, `WMS-04A` kalite hold şeması netleştikten sonra `WMS-04B` karantina ekranıyla paralel yürüyebilir.
- `WMS-06A` rapor taslakları, Faz 1 reservation ve Faz 2 task tabloları oturduktan sonra Faz 3 mobil işleriyle kısmen paralel hazırlanabilir; raporların final doğrulaması Faz 5 sonrasına bırakılmalı.
- `WMS-06B` dashboard görsel iskeleti, `WMS-06A` metrik kontratları belli olduktan sonra paralel ilerleyebilir.

### Paralel Yapılmaması Gerekenler

- `WMS-01A`, `WMS-01B`, `WMS-01C`, `WMS-01D` aynı anda yapılmamalı. Reservation veri modeli, pickable stok hesabı, shipment creation ve shipment confirmation aynı kontratı paylaşır; sırayla oturmalıdır.
- `WMS-01E`, `WMS-01B` bitmeden yapılmamalı. Planlama motoru gerçek reserved stok hesabını ancak DB kontratı netleşince okuyabilir.
- `WMS-02B`, `WMS-02C`, `WMS-02D`, `WMS-02A` bitmeden başlamamalı. Task/event şeması oturmadan putaway/pick görevleri farklı agentlarda uyumsuz çıkar.
- `WMS-03C`, `WMS-03D`, `WMS-03E`, `WMS-03B` barkod parser tamamlanmadan başlamamalı. Aksi halde her ekran kendi barkod mantığını yazar.
- `WMS-03E` mobil picking, `WMS-01C`, `WMS-01D` ve `WMS-02C` tamamlanmadan yapılmamalı. Mobil picking reservation ve pick task olmadan gerçek WMS davranışı veremez.
- `WMS-04B`, `WMS-04A` bitmeden yapılmamalı. Karantina ekranı quality hold şemasına bağlıdır.
- `WMS-05B`, `WMS-02A` ve lokasyon usage type kararları netleşmeden yapılmamalı. Pick-face replenishment task motoruna ve lokasyon sınıflarına bağlıdır.
- `WMS-06A/B` final rapor/dashboard olarak Faz 1-5 verileri oturmadan kapatılmamalı. Erken başlanırsa yalnızca taslak kalabilir.

### Agent Atama Önerisi

- Agent 1: Faz 1 reservation hattı (`WMS-01A` -> `WMS-01E`) tek elde yürütülmeli.
- Agent 2: Faz 2 task motoru (`WMS-02A` -> `WMS-02D`) reservation hattı bitince başlamalı.
- Agent 3: Faz 3 mobil shell/upload hazırlığı (`WMS-03A`, `WMS-03F`) erken başlayabilir; barkod ve operasyon ekranları task motoru bitince devam etmeli.
- Agent 4: Faz 4 kalite/traceability, Faz 2 ve mobil evidence kontratları netleşince başlamalı.
- Agent 5: Faz 5-6 sayım, replenishment ve raporlar, önceki fazların DB kontratlarını tüketmeli.

---

## 0. Ortak Agent Protokolü

Her agent işe başlamadan önce şunları okumalı:

1. `.antigravityrules.md`
2. `SUITABLERMS_PROJECT_GOVERNANCE.md`
3. `OperationSync.md` son 20 entry
4. `docs/wms_depo_yonetim_sistemi_analiz_ve_proje_plani.md`
5. `docs/wms_fazlandirilmis_agent_gorev_tanimlari.md`
6. İlgili fazda ayrıca belirtilen dosyalar

Genel sınırlar:

- İş verisi için `localStorage`, `sessionStorage`, mock JSON veya sessiz fallback kullanma.
- Railway Postgres DB-first kuralını bozma.
- Supabase/AWS eski altyapı referansı ekleme.
- Otomatik kısa aralıklı polling ekleme.
- Faz dışı refactor yapma.
- Kullanılmayan eski kod, yorum satırına alınmış alternatif implementasyon veya pasif JSX bırakma.
- Her faz sonunda `OperationSync.md` içine net entry ekle.

Her agent finalinde şunları raporlamalı:

- Değişen dosyalar
- Eklenen migration/schema değişiklikleri
- Çalıştırılan test/build komutları
- Açık riskler
- Bir sonraki faza devredilecek net durum

---

## Faz 0 - Mevcut WMS Baseline ve Test Kilidi

### Görev WMS-00A - WMS Baseline Denetimi

Amaç: Rezervasyon/görev/mobil geliştirmelerine başlamadan mevcut WMS davranışını bozmamak için baseline çıkarmak.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/pages/DepoOrders.jsx`
- `src/components/pages/MalKabul.jsx`
- `src/components/pages/WmsLocations.jsx`
- `src/components/pages/WmsLpns.jsx`
- `src/components/pages/WmsStockParams.jsx`
- `src/components/pages/WmsInternalTransfer.jsx`
- `src/lib/branchPurchasing.js`
- `src/lib/warehouseDemandPlanning.js`
- `scratch/test_branch_purchasing_regression.js`

Yapılacaklar:

- Mevcut WMS route ve tablo listesini doğrula.
- `warehouse_replenishment` akışının şube siparişlerinden ayrıldığını doğrula.
- `availability_status` kullanımını kontrol et.
- Mevcut testleri çalıştır: `node .\scratch\test_branch_purchasing_regression.js`, `npm.cmd run build`.
- Gerekirse küçük bir `scratch/test_wms_current_contract.js` ekleyerek mevcut helper davranışlarını kilitle.

Kabul kriterleri:

- Kod değişikliği yoksa bile baseline raporu `OperationSync.md` içine yazılmış olmalı.
- Build başarılı olmalı veya mevcut hatalar net belgelenmeli.
- Sonraki fazların bozmayacağı davranışlar listelenmeli.

---

## Faz 1 - Rezervasyon Motoru ve Sevkiyat Güvenliği

### Görev WMS-01A - `warehouse_reservations` Şeması

Amaç: WMS kaynak ayırmayı DB-first ve audit edilebilir hale getirecek rezervasyon tablosunu eklemek.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `migrations/031_wms_shipments.sql`
- `migrations/032_confirm_shipment_rpc.sql`
- `server/wms_migration.js`

Yapılacaklar:

- Yeni migration oluştur: `migrations/036_add_warehouse_reservations.sql`.
- `schema-railway-master.sql` içine tablo ve indexleri ekle.
- Önerilen kolonlar:
  - `id`
  - `branch_id`
  - `stock_item_id`
  - `location_id`
  - `lpn_id`
  - `lot_number`
  - `expiration_date`
  - `source_doc_type`
  - `source_doc_id`
  - `source_line_id`
  - `reserved_qty`
  - `status`: `active`, `consumed`, `released`, `cancelled`, `expired`
  - `reserved_by`
  - `reserved_at`
  - `consumed_at`
  - `released_at`
  - `meta`
- Aktif reservation için branch/item/location/lpn/lot/SKT/source alanlarında sorgu indexleri ekle.
- `server/wms_migration.js` dosyası aktif WMS bootstrap aracı olarak kullanılıyorsa tabloyu oraya da ekle.

Kabul kriterleri:

- Migration idempotent olmalı.
- Master schema güncel olmalı.
- `git diff --check` temiz olmalı.

Test/doğrulama:

- `npm.cmd run build`
- Şema SQL'i syntax olarak kontrol edilebiliyorsa proje içi mevcut diff/verify komutu çalıştır.

### Görev WMS-01B - Net Pickable Stok RPC/View

Amaç: Client snapshot ile stok hesaplamak yerine DB tarafında `physical_available - active_reservations` hesabını üretmek.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- `src/lib/branchPurchasing.js`
- `schema-railway-master.sql`
- WMS-01A migration çıktısı

Yapılacaklar:

- DB tarafında `get_wms_pickable_stock(...)` RPC veya view tasarla.
- Hesap:
  - `inventory_movements` hareketlerinden branch/item/location/lpn/lot/SKT bazında fiziksel bakiye.
  - `meta.availability_status in ('quarantine','putaway_pending')` stokları pickable dışı.
  - `warehouse_reservations.status = 'active'` miktarlarını düş.
- `DepoOrders.jsx` içindeki kaynak gösterimini bu RPC/view sonucuna bağla.
- Client tarafındaki `findPickingSources` yardımcı mantığını mümkün olduğunca DB sonucunu tüketen sade mantığa indir.

Kabul kriterleri:

- Aynı ürün/lokasyon/LPN/lot için rezerve miktar UI'da kullanılabilir kaynak olarak görünmemeli.
- Karantina ve putaway pending stoklar pickable görünmemeli.
- Sessiz fallback olmamalı; RPC hata verirse kullanıcı net hata görmeli.

Test/doğrulama:

- Yeni pure helper varsa unit test ekle.
- `npm.cmd run build`
- `git diff --check`

### Görev WMS-01C - Sevkiyat Taslağı Oluştururken Rezervasyon

Amaç: Sevkiyat taslağı oluşturma anında kaynak seçimi ve reservation aynı DB transaction içinde yapılsın.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- `migrations/032_confirm_shipment_rpc.sql`
- `schema-railway-master.sql`

Yapılacaklar:

- Yeni RPC önerisi: `create_warehouse_shipment_with_reservations(...)`.
- RPC şunları yapmalı:
  - Aktif depo yetkisini kontrol et.
  - Seçili `purchase_orders` ve satırlarını kilitle.
  - Pickable kaynakları FEFO sıralamasıyla bul.
  - `warehouse_shipments`, `warehouse_shipment_orders`, `warehouse_shipment_lines` oluştur.
  - Her pick için `warehouse_reservations.status = active` oluştur.
  - Shipment line `meta.picks` içine reservation id'leriyle birlikte kaynakları yaz.
- `DepoOrders.jsx` shipment creation akışını bu RPC'ye bağla.

Kabul kriterleri:

- Aynı stok kaynağı iki sevkiyat taslağına fazla rezerve edilememeli.
- Yetersiz stokta taslak fail-closed hata vermeli.
- Shipment line meta içinde pick kaynakları ve reservation id'leri görülebilmeli.

Test/doğrulama:

- Mümkünse rollback transaction kullanan scratch test.
- `npm.cmd run build`

### Görev WMS-01D - Sevkiyat Onayında Reservation Consume/Release

Amaç: `confirm_warehouse_shipment` artık yalnızca shipment satırını değil, reservation kaynaklarını da doğrulayıp tüketsin.

Okunacak dosyalar:

- `migrations/032_confirm_shipment_rpc.sql`
- `schema-railway-master.sql`
- `src/components/pages/DepoOrders.jsx`

Yapılacaklar:

- `confirm_warehouse_shipment` RPC'sini güncelle.
- Aktif reservation yoksa veya miktar uyuşmuyorsa hata ver.
- `transfer_out` hareketlerini reservation kaynaklarına göre üret.
- Başarılı sevkte reservation `consumed` olsun.
- Shipment iptali için yeni release RPC veya mevcut iptal akışında reservation `released/cancelled` statüsü ekle.

Kabul kriterleri:

- Sevkiyat tekrar onaylanamaz.
- Reservation tüketilmeden stok çıkışı oluşmaz.
- İptal edilen shipment reservation bırakmaz.

Test/doğrulama:

- RPC idempotency ve hata senaryosu testleri.
- `npm.cmd run build`

### Görev WMS-01E - Depo Planlamada Rezerve Stok Entegrasyonu

Amaç: Ana depo talep planlaması gerçek rezervasyonları dikkate alsın.

Okunacak dosyalar:

- `src/lib/warehouseDemandPlanning.js`
- `src/components/pages/Orders.jsx`
- `scratch/test_wms_demand_planning.js`

Yapılacaklar:

- `reserved = 0` sabitini kaldır.
- Planlama girdisine `warehouseReservedByItem` map'i ekle.
- Depo pozisyonu:
  - `warehouseAvail + inboundYolda + expectedReturn - reserved`
- UI detay penceresinde rezerve stok kalemi göster.
- Regression testleri güncelle.

Kabul kriterleri:

- Rezerve stok depo satınalma önerisini artırabilir.
- Eski testler bozulmamalı.

Test/doğrulama:

- `node .\scratch\test_wms_demand_planning.js` varsa çalıştır.
- `node .\scratch\test_branch_purchasing_regression.js`
- `npm.cmd run build`

---

## Faz 2 - WMS Görev Motoru

### Görev WMS-02A - `warehouse_tasks` ve `warehouse_task_events` Şeması

Amaç: Putaway, pick, pack, count, move, quality gibi fiziksel işleri DB-first görev modeline almak.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `src/components/pages/Tasks.jsx`
- `src/components/pages/tasks/TaskDrawer.jsx`
- `src/components/pages/MalKabul.jsx`
- `src/components/pages/DepoOrders.jsx`

Yapılacaklar:

- Yeni migration: `migrations/037_add_warehouse_tasks.sql`.
- `warehouse_tasks` tablosu ekle.
- `warehouse_task_events` tablosu ekle.
- Status değerleri:
  - task: `pending`, `assigned`, `in_progress`, `done`, `exception`, `cancelled`
  - type: `putaway`, `pick`, `pack`, `load`, `count`, `move`, `quality`
- Task event kayıtları personel, terminal, barkod, payload ve zaman damgası içermeli.

Kabul kriterleri:

- Her WMS görev tipi için tablo şeması yeterli olmalı.
- Event tablosu audit için değişmez log gibi kullanılmalı.

Test/doğrulama:

- SQL syntax / migration kontrolü.
- `npm.cmd run build`

### Görev WMS-02B - Mal Kabulden Putaway Görevi Üretimi

Amaç: Mal kabulde `putaway_pending` seçilen ürünler otomatik putaway görevine dönüşsün.

Okunacak dosyalar:

- `src/components/pages/MalKabul.jsx`
- `src/components/pages/WmsInternalTransfer.jsx`
- `schema-railway-master.sql`

Yapılacaklar:

- Mal kabul insert sonrası `putaway_pending` hareketler için `warehouse_tasks` kaydı oluştur.
- Task kaynak alanları:
  - stock item
  - quantity
  - source movement id
  - from location: kabul/karantina/receiving alanı
  - target suggestion: default location veya rule engine sonucu
  - LPN, lot, SKT
- Putaway tamamlanmadan stok `available` sayılmamalı.
- Putaway task tamamlandığında gerekli `inventory_movements` veya status transition üretilecek tasarımı netleştir.

Kabul kriterleri:

- `putaway_pending` mal kabul satırı görev listesine düşer.
- Görev tamamlanmadan pickable stok olmaz.
- Görev tamamlanınca audit event oluşur.

Test/doğrulama:

- Manual/scratch test.
- `npm.cmd run build`

### Görev WMS-02C - Sevkiyattan Pick/Pack/Load Görevi Üretimi

Amaç: Rezerve edilen sevkiyat satırları mobilde yapılabilir pick görevlerine dönüşsün.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- Faz 1 reservation RPC'leri
- Faz 2 task şeması

Yapılacaklar:

- Sevkiyat taslağı oluşunca reservation kaynaklarına göre `pick` task üret.
- Branch/order bazlı pack/load task opsiyonunu ekle.
- Pick tamamlanmadan shipment `ready_to_load` veya `in_transit` olamasın.
- Eksik toplama durumunda task `exception` veya partial done statüsüne düşsün.

Kabul kriterleri:

- Her shipment line pick kaynağının karşılığı task olarak izlenebilir.
- Görev tamamlanmadan sevkiyat onayı engellenir.
- Kısmi toplama shipment fill-rate raporuna veri bırakır.

Test/doğrulama:

- `npm.cmd run build`
- Sevkiyat taslağı -> task -> onay guard senaryosu.

### Görev WMS-02D - WMS Görev Web Ekranı

Amaç: Mobil fazdan önce web üzerinden görevleri izlemek ve exception yönetmek.

Okunacak dosyalar:

- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/components/pages/Tasks.jsx`
- `src/components/pages/DepoOrders.jsx`

Yapılacaklar:

- Yeni ekran: `src/components/pages/WmsTasks.jsx`.
- Route önerisi: `/wms-tasks` veya mevcut `/depo-tasks` içine WMS mode.
- Liste alanları:
  - task no
  - type
  - status
  - product
  - qty
  - source/target location
  - LPN
  - lot/SKT
  - assigned staff/terminal
  - exception reason
- Web üzerinden sadece izleme ve kontrollü exception çözümü yapılmalı; fiziksel tamamlama mobil faza bırakılmalı.

Kabul kriterleri:

- WMS görevleri webde izlenebilir.
- Exception task'lar filtrelenebilir.
- Yetkisiz/global bağlam fallback yok.

Test/doğrulama:

- `npm.cmd run build`

---

## Faz 3 - Mobil WMS Uygulaması

### Görev WMS-03A - Mobil WMS Shell ve Görevlerim

Amaç: Depo personelinin barkod odaklı kullanacağı mobil/PWA ekranını kurmak.

Okunacak dosyalar:

- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/lib/posStaffAuth.js`
- `src/components/pages/WmsTasks.jsx`

Yapılacaklar:

- Yeni route: `/wms-mobile` veya `/depo-mobile`.
- Mobil odaklı ekran:
  - PIN/personel bağlamı
  - Aktif ana depo bağlamı
  - `Görevlerim`
  - task type segmentleri: teslim alma, putaway, pick, pack/load, sayım
- Desktop panel tasarımına uymaya çalışırken mobilde büyük dokunma alanları ve sabit tarama inputu kullanılmalı.

Kabul kriterleri:

- Mobil viewportta kullanılabilir.
- Görevler task tablosundan DB-first gelir.
- Offline/local queue yok.

Test/doğrulama:

- `npm.cmd run build`
- Browser/mobile viewport görsel kontrol.

### Görev WMS-03B - Barkod Tarama Motoru

Amaç: Mobil uygulamada ürün, LPN, lokasyon, lot/SKT barkodlarını merkezi parser ile ele almak.

Okunacak dosyalar:

- `src/components/pages/WmsLpns.jsx`
- `src/components/pages/WmsLocations.jsx`
- `schema-railway-master.sql`

Yapılacaklar:

- Yeni helper: `src/lib/wmsBarcode.js`.
- Destek:
  - İç LPN kodları (`LP000001` vb.)
  - GS1 SSCC `(00)`
  - Ürün barkodu / GTIN (`product_external_barcodes`)
  - Lokasyon kodu
  - Lot ve SKT alanları için GS1 AI parse hazırlığı
- Her scan `warehouse_task_events` içine yazılmalı.
- Eşleşmeyen barkodlar onay kuyruğu/exception üretmeli.

Kabul kriterleri:

- Yanlış lokasyon barkodu task tamamlatmaz.
- Yanlış ürün/LPN barkodu task tamamlatmaz.
- Parser pure testlerle doğrulanır.

Test/doğrulama:

- `scratch/test_wms_barcode_parser.js`
- `npm.cmd run build`

### Görev WMS-03C - Mobil Barkodlu Mal Kabul

Amaç: Teslimatlar barkodla teslim alınsın.

Okunacak dosyalar:

- `src/components/pages/MalKabul.jsx`
- `src/components/pages/WmsLpns.jsx`
- `src/lib/wmsBarcode.js`

Yapılacaklar:

- Mobil mal kabul görev ekranı ekle.
- PO/irsaliye barkodu veya görev seçimi.
- Ürün barkodu okutma.
- LPN okutma veya yeni LPN oluşturma.
- Lot/SKT/miktar doğrulama.
- Ürün fotoğrafını göster (`stock_items.image_url`).
- Hasar/eksik/fazla için exception ve fotoğraf kanıtı.

Kabul kriterleri:

- Barkod doğrulaması olmadan kabul tamamlanamaz.
- Ürün fotoğrafı varsa gösterilir.
- Kanıt fotoğrafı varsa Railway Volume upload API üzerinden saklanır, DB'ye dosya yolu yazılır.

Test/doğrulama:

- `npm.cmd run build`
- Mobil viewport manuel doğrulama.

### Görev WMS-03D - Mobil Putaway

Amaç: Personel sistemin önerdiği lokasyona gidip lokasyon barkodu okutarak rafa yerleştirme yapsın.

Okunacak dosyalar:

- `src/components/pages/WmsInternalTransfer.jsx`
- `src/components/pages/WmsLocations.jsx`
- `src/components/pages/WmsStockParams.jsx`

Yapılacaklar:

- Putaway task ekranı.
- Ürün/LPN fotoğraf ve detay gösterimi.
- Önerilen hedef lokasyon:
  - stock item default location
  - temperature class
  - usage type
  - ileride kapasite
- Hedef lokasyon barkodu okutulmadan tamamlanmasın.
- Yanlış lokasyon fail-closed hata versin.
- Tamamlanınca task done + movement/status transition + event.

Kabul kriterleri:

- Putaway pending stok, doğru lokasyona barkodla taşındıktan sonra available olur.
- Yanlış lokasyon event olarak kaydedilir.

Test/doğrulama:

- `npm.cmd run build`

### Görev WMS-03E - Mobil Lokasyon Yönlendirmeli Picking

Amaç: Gelen şube siparişleri toplanırken mobil uygulama personeli lokasyon lokasyon yönlendirsin.

Okunacak dosyalar:

- `src/components/pages/DepoOrders.jsx`
- `src/components/pages/WmsTasks.jsx`
- Faz 1 reservation ve Faz 2 task çıktıları

Yapılacaklar:

- Pick task ekranı.
- FEFO/route sırasına göre sıradaki kaynak göster:
  - lokasyon
  - LPN
  - ürün fotoğrafı
  - SKU/ad/birim
  - lot/SKT
  - toplanacak miktar
- Lokasyon barkodu okut.
- Ürün/LPN barkodu okut.
- Miktar onayla.
- Kısmi toplama/eksik stok exception.

Kabul kriterleri:

- Yanlış lokasyon veya yanlış ürünle görev tamamlanamaz.
- Kısmi toplama shipment line/fill-rate verisini etkiler.
- Pick tamamlanmadan pack/load aşaması açılmaz.

Test/doğrulama:

- `npm.cmd run build`
- Mobil viewport manuel doğrulama.

### Görev WMS-03F - Fotoğraf ve Dosya Upload Entegrasyonu

Amaç: Ürün fotoğrafı gösterimi ve kanıt fotoğrafı yükleme WMS mobilde tamamlanmış olsun.

Okunacak dosyalar:

- `server/index.js`
- Mevcut upload/file endpointleri
- `src/components/pages/StockItems.jsx`
- `src/components/pages/MalKabul.jsx`

Yapılacaklar:

- Mevcut dosya upload altyapısı varsa WMS evidence için yeniden kullan.
- Yoksa `UPLOAD_DIR` ve `/api/files/...` kuralına uygun endpoint ekle.
- `warehouse_task_events.payload` veya ilgili evidence tablosunda dosya yolunu sakla.
- Ürün fotoğrafı için `stock_items.image_url` mobilde göster.

Kabul kriterleri:

- Dosyalar Railway Volume `UPLOAD_DIR` altında kalır.
- DB'de sadece erişim yolu tutulur.
- Dosya yoksa UI bozulmaz, net placeholder gösterir.

Test/doğrulama:

- `npm.cmd run build`
- Upload endpoint smoke testi.

---

## Faz 4 - Kalite, Karantina ve Lot İzlenebilirliği

### Görev WMS-04A - Kalite Hold Şeması

Amaç: Karantina, release, reject ve scrap süreçlerini ayrı kalite kaydıyla izlemek.

Okunacak dosyalar:

- `schema-railway-master.sql`
- `src/components/pages/MalKabul.jsx`
- `src/components/pages/InventoryOperationRecord.jsx`

Yapılacaklar:

- Yeni migration: `migrations/038_add_warehouse_quality_holds.sql`.
- `warehouse_quality_holds` tablosu ekle.
- Karantina hareketleri quality hold oluşturmalı.

Kabul kriterleri:

- Karantina stok pickable değildir.
- Release/reject/scrap eventleri audit edilebilir.

### Görev WMS-04B - Karantina Yönetim Ekranı

Amaç: Kalite bekleyen stoklar web panelden yönetilsin.

Yapılacaklar:

- Yeni ekran: `WmsQuality.jsx`.
- Karantina stokları listele.
- Release, reject, scrap aksiyonları.
- Fotoğraf ve not gösterimi.

Kabul kriterleri:

- Release olmadan available'a geçiş yok.
- Reject/scrap stok hareketi üretir.

### Görev WMS-04C - Lot/SKT Traceability Raporu

Amaç: Hangi lot hangi şubeye sevk edildi görülebilsin.

Yapılacaklar:

- Lot/SKT bazlı hareket raporu.
- Shipment ve branch ilişkisi.
- Geri çağırma listesi çıktısı.

Kabul kriterleri:

- Lot numarasıyla sevk edilen şubeler listelenir.

---

## Faz 5 - Cycle Count ve Pick-Face Replenishment

### Görev WMS-05A - WMS Cycle Count Görevleri

Amaç: Sayım, WMS görev motoruna bağlansın.

Okunacak dosyalar:

- `src/components/pages/Count.jsx`
- `src/components/pages/WmsLocations.jsx`
- Faz 2 task tabloları

Yapılacaklar:

- Lokasyon/LPN/ürün bazlı sayım görevi oluştur.
- Mobil sayım ekranı ile barkod okut.
- Farkları onay kuyruğuna gönder.
- Onaydan sonra `stock_count_gain/loss` hareketi üret.

Kabul kriterleri:

- Sayım farkı doğrudan sessiz stok düzeltmez.
- Fark için neden ve onay kaydı vardır.

### Görev WMS-05B - Pick-Face Replenishment

Amaç: Reserve lokasyondan pick-face lokasyona ikmal görevleri üretmek.

Okunacak dosyalar:

- `src/components/pages/WmsLocations.jsx`
- `src/components/pages/WmsStockParams.jsx`
- `src/lib/branchPurchasing.js`

Yapılacaklar:

- Lokasyon usage type değerlerini kullan.
- Pick-face min/max parametrelerini tasarla.
- Eksik pick-face için replenishment task üret.
- Mobil move/putaway ekranı üzerinden tamamlat.

Kabul kriterleri:

- Pick-face eksikliği task önerisi üretir.
- Reserve stok yoksa net uyarı oluşur.

---

## Faz 6 - Raporlama ve Yönetim

### Görev WMS-06A - WMS Operasyon Raporları

Amaç: Depo yöneticisi WMS sağlığını tek yerden görebilsin.

Raporlar:

- Available / reserved / quarantine / putaway pending stok
- Lokasyon doluluk
- LPN içerik ve hareket geçmişi
- Açık görevler
- Exception görevler
- Sevkiyat fill-rate
- Geç sevkiyat
- Personel görev performansı
- SKT yaklaşan ürünler

Kabul kriterleri:

- Raporlar DB'den gelir.
- Polling yok; manuel yenileme butonu olmalı.

### Görev WMS-06B - WMS Dashboard

Amaç: Ana Depo giriş ekranı olarak hızlı operasyon paneli oluşturmak.

Yapılacaklar:

- KPI bandı:
  - bekleyen mal kabul
  - açık putaway
  - açık pick
  - exception
  - bugün sevk
  - karantina stok
- Manuel yenileme.
- İlgili ekrana drill-down.

Kabul kriterleri:

- Dashboard karar destek ekranı olur, işlem tamamlamaz.
- Mobil görevlerin yerini almaz.

---

## Son Not

Bu dosyadaki en üst bölüm, agent koordinasyonu için bağlayıcı kabul edilmelidir. Faz detayları görev kapsamını anlatır; paralellik ve sıra kararlarında her zaman "En Baştaki Yürütme Sırası ve Paralellik Kuralları" bölümü esas alınır.
