# Refactoring Plan - WMS Task Exception Resolution Atomic RPC

Bu plan, `WmsTasks.jsx` arayüzündeki sorun (exception) çözüm akışında gerçekleştirilen çok adımlı, transactional olmayan istemci çağrılarını kaldırarak, süreci veritabanı seviyesinde çalışan tek bir atomik saklı yordam (Stored Procedure / RPC) ile ACID uyumlu hale getirmeyi amaçlar.

---

## User Review Required

> [!IMPORTANT]
> **ACID Transaction Garantisi:**
> Tüm durum güncellemeleri (görev durumunun güncellenmesi, pick görevleri için ilişkili rezervasyonun iptal edilmesi ve olay günlüğü logunun atılması) tek bir PostgreSQL fonksiyonu (`resolve_warehouse_task_exception`) içerisinde ve `FOR UPDATE` kilitlemesi altında gerçekleştirilecektir. Bu sayede ağ kopması veya istemci çökmesi durumunda veritabanında tutarsızlık oluşma riski (Fail-Closed prensibi uyarınca) sıfırlanacaktır.

---

## Proposed Changes

### 1. Veritabanı Değişiklikleri

#### [NEW] [044_wms_task_exception_rpc.sql](file:///C:/RMSv3/migrations/044_wms_task_exception_rpc.sql)
Yeni bir migration dosyası oluşturulacak ve içerisinde `resolve_warehouse_task_exception` PL/pgSQL fonksiyonu tanımlanacaktır:
- Görevi `FOR UPDATE` ile kilitleyecek ve durumunun `'exception'` olduğunu doğrulayacaktır.
- Eğer aksiyon `'cancel'` ise ve görev tipi `'pick'` ise ilişkili rezervasyonu (`meta->>'reservation_id'`) bulup durumunu `'cancelled'` yapacaktır.
- Görevin statüsünü seçilen aksiyona (`'pending'` veya `'cancelled'`) güncelleyecek ve çözüm notlarını metasında saklayacaktır.
- Son olarak `warehouse_task_events` tablosuna audit logunu tek adımda ekleyecektir.

#### [MODIFY] [schema-railway-master.sql](file:///C:/RMSv3/schema-railway-master.sql)
- Projenin master şema dosyasının sonuna bu yeni RPC fonksiyon tanımı eklenecektir.

#### [MODIFY] [wms_migration.js](file:///C:/RMSv3/server/wms_migration.js)
- `STEPS` dizisinin sonuna `044` migration adımını ekleyerek `node server/wms_migration.js` ile Railway veritabanında çalıştırılması sağlanacaktır.

---

### 2. Frontend Değişiklikleri

#### [MODIFY] [WmsTasks.jsx](file:///C:/RMSv3/src/components/pages/WmsTasks.jsx)
- `handleResolveException` fonksiyonundaki tüm ardışık `db.from(...).update(...)` ve `insert(...)` istekleri silinecektir.
- Yerine sadece tek bir `await db.rpc('resolve_warehouse_task_exception', { ... })` RPC çağrısı yerleştirilecektir.

---

## Verification Plan

### Automated Tests
- `$env:DATABASE_URL="..."; node server/wms_migration.js` çalıştırılarak yeni RPC'nin veritabanına sorunsuz uygulandığı doğrulanacaktır.
- `npm run build` komutu ile frontend derlemesinin hatasız çalıştığı doğrulanacaktır.

### Manual Verification
- Bir exception görevi seçilerek web paneli üzerinden "Yeniden Dene" veya "İptal Et" butonlarına tıklanacak, veritabanında hem görev durumunun hem de rezervasyonların atomik olarak güncellendiği doğrulanacaktır.
