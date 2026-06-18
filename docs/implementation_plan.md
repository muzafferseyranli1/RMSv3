# Kiosk Cihaz Bazlı Çalışma Saatleri ve Kompakt Kural Yönetimi Planı

Bu plan, kiosk cihazlarının çalışma saatleri denetimini global bir JSON ayarından çıkarıp veritabanı seviyesinde ilişkisel tablolarla cihaz bazında yapılandırmayı ve saat kuralı arayüzünü (dikey yığılma olmadan) kompakt bir satır düzenine dönüştürmeyi amaçlar.

## User Review Required

Lütfen aşağıdaki veritabanı tasarımı ve arayüz değişikliklerini inceleyip onaylayın.

> [!IMPORTANT]
> **İlişkisel Veritabanı Geçişi**
> Saat kuralları artık `settings` tablosundaki global `kiosk_settings_v2` JSONB alanında değil, şube bağımlı `kiosk_operating_hours_rules` tablosunda tutulacaktır. Kiosk cihazları ile bu kurallar arasındaki eşleşmeler ise `kiosk_terminal_operating_rules` ara tablosu (junction table) üzerinden yönetilecektir.

## Proposed Changes

---

### Database Layer

#### [NEW] [055_kiosk_operating_hours_rules.sql](file:///X:/RMSv3/migrations/055_kiosk_operating_hours_rules.sql)
1. **`kiosk_operating_hours_rules`**: Şubede geçerli saat kuralları listesi.
   * `id` UUID PRIMARY KEY DEFAULT `gen_random_uuid()`
   * `branch_id` UUID NOT NULL REFERENCES `public.company_nodes(id)` ON DELETE CASCADE
   * `name` TEXT NOT NULL (Örn: "Hafta Sonu Kahvaltı")
   * `days` TEXT[] NOT NULL (Örn: `ARRAY['sat', 'sun']`)
   * `start_time` TEXT NOT NULL (Saat formatı: `'08:00'`)
   * `end_time` TEXT NOT NULL (Saat formatı: `'12:00'`)
   * `note` TEXT (İsteğe bağlı not)
   * `created_at` TIMESTAMPTZ DEFAULT `now()`
   * `updated_at` TIMESTAMPTZ DEFAULT `now()`
2. **`kiosk_terminal_operating_rules`**: Kiosk-Kural eşleşme tablosu.
   * `terminal_id` UUID NOT NULL REFERENCES `public.pos_terminals(id)` ON DELETE CASCADE
   * `rule_id` UUID NOT NULL REFERENCES `public.kiosk_operating_hours_rules(id)` ON DELETE CASCADE
   * PRIMARY KEY (`terminal_id`, `rule_id`)
3. **`schema-railway-master.sql` güncellemesi**: Yeni tabloların ana şema dosyasına eklenmesi.

---

### React Frontend UI

#### [MODIFY] [KioskManagementDesktop.jsx](file:///X:/RMSv3/src/components/pages/KioskManagementDesktop.jsx)
1. **Kompakt Kural Düzenleyici (`ScheduleRuleEditor`)**:
   * Dikey yığılan alanlar yerine, tüm kural ögeleri yatay tek bir satırda (`display: grid` veya `flex`) yer alacak:
     `[Kural Adı] [Günler Seçici] [Başlangıç Saat] [Bitiş Saat] [Not] [Sil Butonu]`
   * Saat giriş kutuları (`00:00` formatı için) genişlikleri sınırlandırılarak yan yana yerleştirilecek.
2. **Kural Listesi ve Veritabanı Senkronizasyonu**:
   * Cari şubeye (`branchId`) ait kurallar `kiosk_operating_hours_rules` tablosundan yüklenecek.
   * Kural ekleme/silme ve isim/gün/saat değişiklikleri doğrudan veritabanındaki tabloya yazılacak.
3. **Kiosk Satırlarında Kural Seçimi**:
   * Cihaz tablosunda "Çalışma Saatlerini Kullan" toggle'ı açıldığında, o satırın hemen altında ilgili kiosk için atanmış kuralları listeleyen ve yeni kural atanmasını sağlayan kompakt bir arayüz (checkbox listesi veya çoklu seçim) açılacak.
   * Seçilen kurallar `kiosk_terminal_operating_rules` tablosuna anında kaydedilecek/silinecek.

---

### Client Kiosks

#### [MODIFY] [KioskBig.jsx](file:///X:/RMSv3/src/components/pages/KioskBig.jsx) & [KioskTablet.jsx](file:///X:/RMSv3/src/components/pages/KioskTablet.jsx)
1. Cihaz çalışma zamanında veritabanındaki `kiosk_terminal_operating_rules` üzerinden kendi terminal ID'si ile eşleşen çalışma saati kurallarını çekecektir.
2. Kiosk, bu kurallara göre açık/kapalı durumunu (`kioskOperatingState`) belirleyecektir.

## Verification Plan

### Automated Tests
* Frontend derleme kontrolü:
  ```bash
  npm run build
  ```

### Manual Verification
* Kiosk yönetim panelinden yeni bir isimli saat kuralı oluşturma ve kuralı silme işlemleri test edilecek.
* Bir kiosk için "Çalışma Saatlerini Kullan" açılıp şube kurallarından biri atanacak, deaktif edildiğinde atamanın veritabanından kaldırıldığı doğrulanacak.
* Atanan kuralın gün/saat dilimlerine göre kiosk istemci ekranının kilitlenip/açıldığı test edilecek.
