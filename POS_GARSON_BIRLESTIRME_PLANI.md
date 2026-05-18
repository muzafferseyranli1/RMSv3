# POS ve Garson Birleştirme Planı

Oluşturulma tarihi: `2026-05-11`  
Status: `aktif — implementasyon başladı`

---

# Amaç

POS ve Garson ekranlarını tek bir ortak çekirdekte birleştirip mod farklarını adapter seviyesiyle yönetmek; aynı anda garson tarafına DB-first masa yönetimi, QR üretim/yazdırma ve girişte zorunlu PIN gate eklemek.

## Temel Kısıtlar ve Tasarım Kararları

- **DB-first**: Salon, bölüm, masa ve QR metadatası kalıcı olarak veritabanında yaşayacak.
- **Salon planı editörü kaldırılacak**: Sürükle-bırak salon planı ve karmaşık görsel yerleşim akışı kapsam dışı.
- **Tek gövde, mod adapter**: Ekran gövdesi ortak olacak; `mode='pos' | 'garson'` farkları davranış/izin/başlık/eylem seviyesinde ayrılacak.
- **PIN en başta**: Gövde render edilmeden önce personel doğrulaması tamamlanacak.
- **Governance uyumu**: `posStaffAuth.js` içindeki kalıcılık `localStorage` yerine `sessionStorage` olacak.
- **TreeExplorer standardı**: Garson masa yönetimi modali mevcut ağaç etkileşim standardını izleyecek.

---

# Etkilenecek Dosyalar

## Mevcut dosyalar

- `src/components/pages/POS.jsx`
- `src/components/pages/Garson.jsx`
- `src/components/pages/GarsonTableLayout.jsx`
- `src/components/pages/POSMasa.jsx`
- `src/components/pages/POSMasalar.jsx`
- `src/components/pos/PinLoginScreen.jsx`
- `src/components/ui/TreeExplorer.jsx`
- `src/lib/posStaffAuth.js`
- `src/lib/posTablePersistence.js`
- `src/lib/posUiPersistence.js`
- `src/App.jsx`
- `src/components/layout/Sidebar.jsx`
- `schema-railway-master.sql`
- `OperationSync.md`

## Muhtemel yeni dosyalar

- `migrations/xxx_pos_garson_unification.sql`
- `src/components/pos/UnifiedPosStaffScreen.jsx`
- `src/components/pos/StaffPinGate.jsx`
- `src/components/pos/TableManagementModal.jsx`
- `src/components/pos/TableTreePanel.jsx`
- `src/components/pos/TableDetailPanel.jsx`
- `src/components/pos/TableQrPrintModal.jsx`
- `src/lib/posTableCatalogService.js`
- `src/lib/posQrService.js`
- `src/lib/posStaffSession.js`

---

# DB Schema Değişiklikleri

## Yeni tablolar

### 1) `pos_table_halls`
Şube bazlı salon kayıtları.

Önerilen alanlar:
- `id` UUID PK
- `branch_id` UUID / mevcut branch tipine uyumlu alan tipi
- `name` TEXT
- `code` TEXT NULL
- `sort_order` INTEGER DEFAULT 0
- `is_active` BOOLEAN DEFAULT true
- `created_at`, `updated_at`
- `deleted_at` NULLABLE

Kısıt/indeks:
- aynı şubede aktif salon adı için unique index
- `branch_id + sort_order`

### 2) `pos_table_sections`
Salon altındaki bölümler.

Önerilen alanlar:
- `id` UUID PK
- `branch_id`
- `hall_id` FK -> `pos_table_halls.id`
- `name` TEXT
- `sort_order` INTEGER DEFAULT 0
- `is_active` BOOLEAN DEFAULT true
- `created_at`, `updated_at`
- `deleted_at`

Kısıt/indeks:
- `hall_id + lower(name)` aktif kayıt unique
- `branch_id + hall_id + sort_order`

### 3) `pos_tables`
Gerçek masa katalog tablosu.

Önerilen alanlar:
- `id` UUID PK
- `branch_id`
- `hall_id` FK
- `section_id` FK
- `table_code` TEXT
- `table_name` TEXT
- `table_number` TEXT
- `capacity` INTEGER NULL
- `status` TEXT DEFAULT 'active'
- `qr_token` TEXT
- `qr_payload_version` INTEGER DEFAULT 1
- `last_qr_generated_at` TIMESTAMP NULL
- `created_at`, `updated_at`
- `deleted_at`

Kısıt/indeks:
- aktif kayıtlar için `branch_id + table_number` unique
- aktif kayıtlar için `branch_id + qr_token` unique
- `section_id`, `hall_id`, `branch_id` indeksleri
- `status` check (`active`, `inactive`, `archived`)

## Mevcut tablolarla uyum değişiklikleri

### `sales` / `pos_sales` bağlantısı
Mevcut `table_no` / `masa_no` string alanlarını bozmadan geçiş yapılmalı.

Öneri:
- İlk fazda mevcut string alanlar korunur.
- Uygulama katmanında `pos_tables.table_number` temel kimlik gibi kullanılır.
- İkinci faz opsiyonel olarak `table_id` referansı eklenebilir, fakat bu birleşme görevini bloklamamalı.

### QR içerik standardı
QR payload DB'de açık metin değil, **yeniden üretilebilir alanlar** ile yönetilmeli.

Önerilen format:
- `v=1`
- `branch=<branch_id>`
- `table=<table_id>`
- ileride URL eklenecekse aynı payload ya doğrudan URL ya da signed querystring olarak üretilecek

Örnek mantık:
- bugün: yapılandırılmış payload üret
- ileride: `https://domain/menu?t=<table_id>&b=<branch_id>&v=1`

## Güvenlik / governance notları

- QR token'ı tahmin edilmesi zor olmalı.
- Soft delete tercih edilmeli.
- Branch izolasyonu tüm sorgularda zorunlu olmalı.
- Migration dosyasında indeksler ve gerekirse RLS/policy yaklaşımı mevcut schema standardıyla uyumlu eklenmeli.

---

# Birleştirme Adımları ve Sıralama

## Aşama 1 — Mevcut akışın sabitlenmesi

### Hedef
Birleştirme öncesi bug riskini azaltmak için auth, persistence ve ekran sorumluluklarını netleştirmek.

### Yapılacaklar
- `POS.jsx` ve `Garson.jsx` içindeki ortak state, veri yükleme, sipariş, ödeme, sadakat ve masa seçimi akışlarını çıkar.
- `GarsonTableLayout.jsx` içindeki yalnızca kaldırılacak salon-planı sorumluluklarını işaretle.
- `posTablePersistence.js` ve `posUiPersistence.js` içinde hangi anahtarların POS/Garson'a özel olduğunu haritalandır.
- `posStaffAuth.js` içindeki `localStorage` kullanımını `sessionStorage` düzeltmesi için izole et.

### Risk
- Ortak olmayan yan etkilerin yanlışlıkla ortaklaştırılması.

### Risk azaltma
- Önce sorumluluk matrisi çıkar; sonra refactor başlat.
- Session anahtarları için backward-compat fallback düşün.

### Doğrulama
- POS ve Garson mevcut davranış listesi çıkarılmış olmalı.
- Session/persist anahtar envanteri dokümante edilmiş olmalı.

---

## Aşama 2 — DB tabanlı masa katalog modelinin kurulması

### Hedef
Salon > bölüm > masa hiyerarşisini DB'ye taşımak.

### Yapılacaklar
- Migration ile `pos_table_halls`, `pos_table_sections`, `pos_tables` tablolarını ekle.
- Mevcut branch tipleri ve foreign key stilini schema ile hizala.
- Gerekirse başlangıç seed/backfill stratejisi tanımla: mevcut kullanılan masa numaralarını `Varsayılan Salon > Genel` altına taşı.

### Risk
- Eski siparişlerin string bazlı masa numarası ile yeni katalog arasında kopukluk.

### Risk azaltma
- İlk sürümde string tabanlı satış kayıtlarını bozmadan devam et.
- Yeni katalog, seçim ve yönetim kaynağı olsun; geçmiş satışlar migrate edilmesin.

### Doğrulama
- Bir şube için salon/bölüm/masa CRUD döngüsü DB'de çalışmalı.
- Aynı şubede yinelenen masa numarası engellenmeli.

---

## Aşama 3 — Ortak ekran çekirdeğinin çıkarılması

### Hedef
POS ve Garson için tek gövdeli ekran oluşturmak.

### Yapılacaklar
- `UnifiedPosStaffScreen` bileşeni oluştur.
- Ortak parçalar:
  - personel bağlamı
  - masa listesi/yükleme
  - aktif adisyon/satış state'i
  - ürün ekleme/çıkarma
  - checkout/ödeme
  - sadakat akışları
  - UI persistence
- Mod adapter ile farklılaştırılacak parçalar:
  - başlık/metinler
  - masa sahipliği kuralları
  - düzenle butonu görünürlüğü
  - garsona özel masa yönetimi işlemleri
  - farklı varsayılan filtreler

### Risk
- Büyük refactor sırasında checkout veya loyalty akışında regresyon.

### Risk azaltma
- Önce container birleştirilir, alt çocuk bileşenler mümkün olduğunca aynı kalır.
- Mode adapter yalnızca davranış katmanı olsun, UI kopyası üretmesin.

### Doğrulama
- `POS.jsx` ve `Garson.jsx` sadece wrapper seviyesine inmeli.
- Ortak ekran her iki route'ta da aynı ana akışı üretmeli.

---

## Aşama 4 — PIN gate'in en başa alınması

### Hedef
Ekran gövdesi yüklenmeden önce personel doğrulaması zorunlu hale gelsin.

### Yapılacaklar
- `StaffPinGate` bileşeni ile giriş koruması oluştur.
- `PinLoginScreen.jsx` mevcut görsel/işlev altyapısı yeniden kullanılsın.
- `posStaffAuth.js` session bazlı hale getirilsin.
- Giriş akışı sırala:
  1. branch/workspace bağlamı doğrula
  2. session'daki aktif personeli kontrol et
  3. yoksa PIN ekranını göster
  4. başarı sonrası ortak gövdeyi render et
- POS/Garson route'ları gate arkasında aynı auth standardını kullansın.

### Risk
- Mevcut oturum geçişleri veya başka modüllerin personel context beklentisi bozulabilir.

### Risk azaltma
- `sessionStorage` anahtar adlarını net standardize et.
- Mevcut okuyan yerler için geçici uyum katmanı ekle.

### Doğrulama
- Sayfa ilk açılışta body yerine PIN gate görünmeli.
- Refresh sonrası session varken tekrar PIN istenmemeli.
- Tarayıcı sekmesi kapanıp açıldığında session beklenen şekilde sıfırlanmalı.

---

## Aşama 5 — Garson masa yönetim modali

### Hedef
Garson ekranında "Düzenle" ile açılan ağaç tabanlı yönetim deneyimi eklemek.

### Yapılacaklar
- `TableManagementModal` oluştur.
- Sol panelde `TreeExplorer` benzeri hiyerarşi:
  - Kök: şube
  - 1. seviye: salonlar
  - 2. seviye: bölümler
  - 3. seviye: masalar
- Sağ panelde seçili node detay/aksiyon alanı:
  - salon seçiliyse: salon düzenle + altına bölüm ekle
  - bölüm seçiliyse: bölüm düzenle + altına masa ekle
  - masa seçiliyse: masa adı/numarası düzenle, QR işlemleri
- Modal aksiyonları:
  - salon ekle
  - bölüm ekle
  - masa ekle
  - ad/numara düzenle
  - pasife alma / arşivleme
  - tek QR yazdır
  - toplu QR yazdır ekranına geç

### UI Tasarım İlkesi
- `TreeExplorer` etkileşimini tekrar kullan; yeni ağaç paradigması üretme.
- Drag-drop yok.
- Klasör mantığı salon/bölüm için; yaprak mantığı masa için.
- Sağ panel tek aktif node üzerine odaklı olmalı.

### Risk
- Fazla aksiyonun modali karmaşıklaştırması.

### Risk azaltma
- İlk sürümde sadece create/edit/archive + QR aksiyonları.
- Taşı/böl/birleştir gibi masa operasyonları ayrı iş akışı olarak korunmalı, modal içine doldurulmamalı.

### Doğrulama
- Salon > bölüm > masa tam CRUD akışı modal içinde tamamlanmalı.
- Hatalı parent altında yanlış node ekleme mümkün olmamalı.

---

## Aşama 6 — QR üretim ve yazdırma hattı

### Hedef
Her masa için benzersiz QR üretmek ve tekil/toplu yazdırma sağlamak.

### Yapılacaklar
- `posQrService` ile payload üretim standardı tanımla.
- QR token üretimi masa oluştururken veya "QR yenile" aksiyonunda yapılmalı.
- Tekil yazdırma için masa detay panelinden print görünümü aç.
- Toplu yazdırma için seçili salon/bölüm/tüm şube kapsamı desteklenmeli.
- Yazdırma çıktısı için sade baskı layout'u hazırlanmalı:
  - işletme/şube adı
  - salon/bölüm
  - masa adı/numarası
  - QR görseli
  - gerekiyorsa kısa fallback metin/payload id

### Mekanizma
- UI tarafında QR görseli üretimi yapılabilir; kaynak doğruluk DB'deki masa/token verisinden gelir.
- Yazdırma için ayrı modal ya da print-only route kullanılabilir; seçim mevcut router yapısına göre netleştirilmeli.
- Toplu yazdırmada sayfa kırımı ve kart boyutu standardı tanımlanmalı.

### Risk
- Yazıcı uyumu ve toplu baskıda layout taşmaları.

### Risk azaltma
- İlk sürümde A4 grid veya tek kart standardı seç.
- Toplu yazdırmayı filtre bazlı yap; aynı anda tüm şube yükü için sanal liste yerine print datasını kontrollü hazırla.

### Doğrulama
- Her masa için benzersiz QR oluşmalı.
- Tek masa yazdırma ve tüm masaları yazdırma akışları önizleme ile doğrulanmalı.
- Aynı masanın QR yenilemesi gerekiyorsa eski/yeninin davranışı açık tanımlanmalı.

---

## Aşama 7 — Garson'a özel davranışların ortak çekirdeğe bağlanması

### Hedef
Garson modundaki masa sahipliği ve operasyon kurallarını korumak.

### Yapılacaklar
- Mode adapter içine garson kuralları taşı:
  - masa sahipliği görünürlüğü
  - yalnız kendine ait/açık masa filtreleri
  - masa taşı/böl/birleştir mevcutsa ortak gövdede destek noktaları bırak
- `GarsonTableLayout.jsx` içindeki sadece basit modda kalması gereken parçaları koru; salon planı editörü tamamen kaldır.
- Eğer `POSMasa.jsx` / `POSMasalar.jsx` tablo seçimi yapıyorsa yeni katalog veri kaynağına bağla.

### Risk
- Garson tarafındaki operasyonel akışların sadeleştirme sırasında kaybolması.

### Risk azaltma
- Masa katalog görüntüsü basit olur; ancak işlem komutları adapter üzerinden korunur.
- Kaldırılan tek şey görsel plan/editör olsun, iş kuralları değil.

### Doğrulama
- Garson modunda sahiplik kuralları çalışmalı.
- POS modunda gereksiz garson aksiyonları görünmemeli.

---

## Aşama 8 — Routing değişiklikleri

### Hedef
POS ve Garson route'larını ortak çekirdeğe yönlendirmek.

### Yapılacaklar
- `src/App.jsx` içinde POS ve Garson route'ları korunur; hedef component ortak çekirdek wrapper'ı olur.
- Önerilen yapı:
  - `/pos` → `UnifiedPosStaffScreen mode="pos"`
  - `/garson` → `UnifiedPosStaffScreen mode="garson"`
- Gerekirse QR toplu baskı için yardımcı route:
  - `/garson/qr-print` veya route yerine modal/print portal
- PIN gate route seviyesinde değil ekran container seviyesinde uygulanmalı; böylece iki mod aynı gate standardını kullanır.

### Risk
- Var olan derin linkler veya ekran state restore akışı bozulabilir.

### Risk azaltma
- Route path'leri değişmeden kalsın.
- Sadece component hedefleri değişsin.

### Doğrulama
- Mevcut menü linkleri çalışmaya devam etmeli.
- Doğrudan `/pos` ve `/garson` açılışları düzgün PIN gate ile başlamalı.

---

## Aşama 9 — Sidebar değişiklikleri

### Hedef
Navigasyon sade ve tutarlı kalsın.

### Yapılacaklar
- `Sidebar.jsx` içinde mevcut `POS` ve `Garson` menüleri korunacaksa etiket ve ikon tutarlılığı gözden geçir.
- Eğer kullanıcı akışı izin veriyorsa Garson menüsünde ek bir "Masa Yönetimi" alt menüsü eklemek yerine modal tabanlı kullanım korunmalı.
- QR toplu baskı bağımsız bir ana menü olmamalı; Garson içindeki yönetim modali aksiyonu olarak kalmalı.

### Risk
- Fazladan menü öğesi eklenirse kullanıcı birleşik mimariyi iki ayrı sistem gibi algılar.

### Risk azaltma
- Navigasyonda minimum değişiklik.
- Yönetim aksiyonlarını ekran içi tut.

### Doğrulama
- Sidebar'daki mevcut giriş noktaları değişmeden birleşik ekranlara ulaşmalı.
- Yeni modal için ek navigasyon bağımlılığı oluşmamalı.

---

# Risk Değerlendirmesi Özeti

## Yüksek risk
- Ortaklaştırma sırasında checkout/sadakat regresyonu
- Eski masa numarası akışının yeni katalogla uyumsuzluğu
- Session auth değişikliğinin başka modülleri etkilemesi

## Orta risk
- Garson sahiplik kurallarının adapter'a eksik taşınması
- Toplu QR baskı layout stabilitesi
- Persistence anahtarlarının çakışması

## Düşük risk
- Sidebar yönlendirme güncellemesi
- Modal bazlı ağaç yönetimi UI'si

## Genel azaltım stratejisi
- Önce veri modeli ve auth standardı, sonra ortak gövde, en son modal/QR.
- Geçişte mevcut route/path ve string masa alanları korunmalı.
- Her aşamada POS ve Garson ayrı ayrı smoke test edilmeli.

---

# Masa Yönetim Modali Tasarımı

## Yerleşim
- **Modal başlık**: `Masa Yönetimi`
- **Sol panel**: TreeExplorer tabanlı hiyerarşi
- **Sağ panel**: Seçili node detay/aksiyon formu
- **Alt aksiyon alanı**: Kaydet / İptal / Arşivle / Yazdır

## Node tipleri
- `hall`
- `section`
- `table`

## Sağ panel davranışı
- `hall` seçili:
  - ad
  - sıra
  - aktif/pasif
  - "Altına Bölüm Ekle"
- `section` seçili:
  - ad
  - bağlı salon bilgisi
  - sıra
  - "Altına Masa Ekle"
- `table` seçili:
  - masa adı
  - masa numarası
  - kapasite (opsiyonel)
  - QR önizleme / QR yenile / tek yazdır

## Toplu işlemler
- Üst araç çubuğu:
  - `Salon Ekle`
  - `Toplu QR Yazdır`
  - filtre: aktif/pasif

## UX notları
- Tree seçimli, form odaklı bir akış kullanılmalı.
- Inline karmaşık edit yerine sağ panelde kontrollü edit tercih edilmeli.
- Silme yerine arşiv/pasif yaklaşımı governance ile daha uyumlu.

---

# QR Üretim ve Yazdırma Planı

## Üretim
- Masa oluşturulurken `qr_token` üret.
- Payload standardı sürümlü olsun (`v=1`).
- QR görseli istemci tarafında üretilebilir; veri doğruluğu DB'den gelir.

## Tekil yazdırma
- Masa detay panelinde "QR Yazdır".
- Baskı görünümü tek kart formatı.

## Toplu yazdırma
- Kapsam seçenekleri:
  - seçili salon
  - seçili bölüm
  - tüm şube masaları
- Çıktı formatı:
  - A4 üzerinde kart grid
  - her kartta masa etiketi + QR

## Geleceğe hazırlık
- Payload ileride müşteri sipariş URL'sine dönüştürülebilmeli.
- Bu yüzden QR üretim servisi ile print layout servisi ayrılmalı.

---

# PIN Gate Yaklaşımı

## Davranış
- POS/Garson ekranı açılır açılmaz önce aktif şube bağlamı doğrulanır.
- Sonra aktif personel session'dan okunur.
- Geçerli değilse `PinLoginScreen` gösterilir.
- Başarılı PIN sonrası kullanıcı ortak ekrana alınır.

## Teknik yaklaşım
- `posStaffAuth.js` session standardının tek kaynağı olur.
- `posStaffSession.js` gibi ince bir yardımcı katmanla key adları ve parse/validate mantığı ayrıştırılabilir.
- `localStorage` tamamen kaldırılır; gerekiyorsa bir geçişte eski anahtar okunup session'a taşınır ve sonra bırakılır.

## Uyum notu
- Bu yaklaşım mevcut task modülündeki "aktif kullanıcıyı mevcut çalışma bağlamından oku" standardıyla uyumlu tutulmalı.

---

# Routing Değişiklikleri

## `src/App.jsx`
- `POS` ve `Garson` route'ları korunur.
- Component hedefleri ortak wrapper'a döner.
- Baskı ekranı route ile çözülecekse yalnız print odaklı minimal route eklenir.

## Geçiş stratejisi
- İlk aşamada eski bileşenler wrapper olarak kalır.
- Sonra iç mantık `UnifiedPosStaffScreen` içine taşınır.
- Böylece route referanslarını topluca değiştirme riski azalır.

---

# Sidebar Değişiklikleri

## `src/components/layout/Sidebar.jsx`
- POS ve Garson girişleri korunur.
- Etiketlerde birleşik davranışı bozacak ayrı/farklı navigasyon eklenmez.
- Masa yönetimi için ayrı ana menu yerine Garson ekran içi aksiyon korunur.
- Eğer kullanıcı görünürlüğü açısından gerekli olursa yalnızca tooltip/help text düzeyinde açıklama yapılır.

---

# Test / Doğrulama Planı

## 1) Veri modeli doğrulaması
- Migration uygulanınca tablolar oluşuyor mu?
- Aynı şubede duplicate salon/bölüm/masa engelleniyor mu?
- Soft delete sonrası aynı isim/numara tekrar açılabiliyor mu?

## 2) Auth doğrulaması
- İlk açılışta PIN isteniyor mu?
- Geçerli session ile body doğrudan açılıyor mu?
- Tarayıcı sekme/oturum davranışı beklendiği gibi mi?
- `localStorage` bağımlılığı kalmış mı?

## 3) POS smoke test
- Masa seçimi
- ürün ekleme/çıkarma
- checkout
- sadakat akışı
- persistence restore

## 4) Garson smoke test
- masa listesi görüntüleme
- sahiplik filtresi
- masa taşı/böl/birleştir mevcut davranışları
- düzenle → masa yönetimi modali açılışı

## 5) Masa yönetimi CRUD testleri
- salon ekle
- bölüm ekle
- masa ekle
- masa adı/numarası düzenle
- arşivleme/pasifleştirme
- ağaç yenileme ve seçili node sürekliliği

## 6) QR testleri
- tek masa QR üretimi
- aynı masa için tekrar üretim davranışı
- toplu baskı kapsam filtreleri
- yazdırma önizleme hizası ve sayfa kırımları

## 7) Navigasyon testleri
- Sidebar'dan `/pos` ve `/garson` girişleri
- doğrudan URL erişimi
- refresh sonrası route stabilitesi

## 8) Regresyon testleri
- checkout ve loyalty akışları
- persistence anahtar çakışmaları
- branch izolasyonu

---

# Step → Targets → Verification Matrisi

| Adım | Hedef Dosya/Alanlar | Doğrulama |
|---|---|---|
| 1 | `POS.jsx`, `Garson.jsx`, `posStaffAuth.js`, persistence dosyaları | Sorumluluk matrisi ve anahtar envanteri çıkarılmış |
| 2 | `schema-railway-master.sql`, migration dosyası | Salon/bölüm/masa CRUD ve unique kuralları çalışıyor |
| 3 | `UnifiedPosStaffScreen`, `POS.jsx`, `Garson.jsx` | İki route ortak gövde ile açılıyor |
| 4 | `StaffPinGate`, `PinLoginScreen.jsx`, `posStaffAuth.js` | Body öncesi PIN gate ve session davranışı doğrulandı |
| 5 | `TableManagementModal`, `TreeExplorer` entegrasyonu | Ağaç içinde salon>bölüm>masa yönetimi çalışıyor |
| 6 | `posQrService`, print UI | Tekil/toplu QR üretim ve yazdırma önizlemesi çalışıyor |
| 7 | Garson adapter kuralları, `GarsonTableLayout.jsx` | Sahiplik ve operasyon farkları korunuyor |
| 8 | `src/App.jsx` | Route'lar değişmeden ortak ekrana gidiyor |
| 9 | `Sidebar.jsx` | Menü akışı korunuyor, ek karmaşa yok |

---

# Definition of Done

- POS ve Garson aynı ortak çekirdeği kullanıyor.
- Garson tarafında DB-first masa yönetimi modali aktif.
- Salon planı editörü tamamen kaldırılmış.
- Her masa için QR üretim ve tekil/toplu yazdırma mevcut.
- PIN gate ekran gövdesinden önce çalışıyor.
- `posStaffAuth.js` governance'a uygun şekilde `sessionStorage` kullanıyor.
- Route ve sidebar girişleri stabil.
- Kritik POS/Garson smoke testleri ve QR/CRUD doğrulamaları geçmiş.
