# Maliyet Hesaplama Hatası ve Yarış Durumu Düzeltme Planı

Bu plan, envanter hareketlerindeki (Mal Kabul, Transfer ve Zayi çıkışları) ağırlıklı ortalama maliyet (WAC) hesaplama mantığında tespit edilen **negatif stok anomalilerini** gidermeyi ve bu süreci **Railway üzerinde ek ağ trafiği ve sunucu maliyeti yaratmayacak** şekilde veritabanı düzeyinde optimize etmeyi hedefler.

## User Review Required

> [!IMPORTANT]
> **Maliyet ve Trafik Koruması Politikamız:**
> Önceki oturumlarda yaşanan sunucu maliyeti artışlarını engellemek adına, bu planda **sürekli çalışan hiçbir arka plan script'i veya polling (periyodik kontrol) döngüsü kullanılmamıştır.**
> 
> *   Tüm ortalama maliyet ve geriye dönük hesaplama mantığı, PostgreSQL'in kendi içinde (`stored procedure` ve `trigger` seviyesinde) çalıştırılacaktır.
> *   İşlemler sadece yeni bir stok kaydı yazıldığında (Mal Kabul, Transfer Onayı vb.) tetiklenecektir.
> *   Sistem boşta kaldığında **0 network trafiği ve 0% CPU** harcayacaktır.

> [!WARNING]
> **Şema Değişikliği:**
> Canlı Railway Postgres veritabanına `inventory_balances` adında yeni bir bakiye takip tablosu eklenecek ve mevcut `recalculate_inventory_item_costs` fonksiyonu düzeltilecektir. Bu işlem veritabanı tutarlılığını artıracaktır.

---

## Proposed Changes

### 1. Veritabanı ve Şema Güncellemeleri (Database Migration)

#### [NEW] [018_inventory_cost_calculation_fix.sql](file:///c:/RMSv3/migrations/018_inventory_cost_calculation_fix.sql)
Aşağıdaki işlemleri transaction içinde uygulayacak SQL gövdesi:
1.  `inventory_balances` tablosunun oluşturulması (hızlı bakiye okuma ve kilitleme desteği).
2.  Mevcut stok hareketlerinden (`inventory_movements`) en güncel durumların hesaplanarak `inventory_balances` tablosunun ilk verilerle tohumlanması (bootstrap).
3.  Negatif stok sapmalarını düzeltilmiş formülle ele alacak şekilde `recalculate_inventory_item_costs` veritabanı fonksiyonunun güncellenmesi.
4.  `BEFORE INSERT` trigger'ı oluşturularak her yeni eklemede çakışmayı (race condition) önleyecek satır kilitlemeli bakiye güncellemesinin eklenmesi.

#### [NEW] [run-migration-018.cjs](file:///c:/RMSv3/scripts/run-migration-018.cjs)
`server/.env` dosyasındaki `DATABASE_URL` bilgisini okuyarak `018` nolu SQL migrasyonunu canlı veritabanında çalıştıracak ve sonrasında güvenle sonlanacak Node.js script'i.

---

### 2. Arayüz Bileşenleri (Frontend Updates)

#### [MODIFY] [MalKabul.jsx](file:///c:/RMSv3/src/components/pages/MalKabul.jsx)
*   Mal kabul kaydedilirken (`persistReceipt` metodu) yapılan envanter hareketleri (`inventory_movements`) hazırlığında, negatif stok ihtimalini göz önünde bulunduran yeni düzeltilmiş ortalama maliyet (WAC) formülünün entegre edilmesi.
*   Böylece, veritabanındaki asenkron maliyet kuyruğu çalışana kadar geçen sürede de kullanıcının arayüzde doğru rakamları görmesi sağlanacaktır.

#### [MODIFY] [InventoryTransfer.jsx](file:///c:/RMSv3/src/components/pages/InventoryTransfer.jsx)
*   Transfer kabulü yapıldığında (`createMovementPayload` fonksiyonu, `direction = 'in'`) uygulanan frontend maliyet formülünün, negatif stok normalizasyonu ile uyumlu hale getirilmesi.

---

## Verification Plan

### Automated & Manual Verification
1.  **Migrasyon Testi:** 
    *   Lokal olarak migrasyon script'i dry-run edilecek ve canlı Railway Postgres'e uygulanacaktır:
        ```bash
        node scripts/run-migration-018.cjs
        ```
2.  **Derleme (Build) Doğrulaması:**
    *   Frontend kodlarının sıfır hata ile derlendiği teyit edilecektir:
        ```bash
        npm run build
        ```
3.  **Matematiksel Doğrulama (Smoke Test):**
    *   Negatif stok durumunda olan bir ürün için mal kabul veya transfer kabulü girilecek.
    *   Yeni ortalama maliyetin (WAC) fırlamadığı, yeni alış fiyatıyla normalize olduğu veritabanı satırından kontrol edilerek doğrulanacaktır.
