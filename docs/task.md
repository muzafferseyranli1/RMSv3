# Kiosk Cihaz Bazlı Çalışma Saatleri Entegrasyonu

- `[x]` Veritabanı Değişiklikleri (Database Layer)
  - `[x]` `migrations/055_kiosk_operating_hours_rules.sql` dosyasının oluşturulması
  - `[x]` Tabloların Railway Postgres DB üzerinde çalıştırılarak uygulanması
  - `[x]` `schema-railway-master.sql` dosyasına yeni tabloların eklenmesi
- `[x]` Frontend UI Değişiklikleri (`KioskManagementDesktop.jsx`)
  - `[x]` `ScheduleRuleEditor` kural düzenleyici tasarımının yatay/sıkı hale getirilmesi (İsim alanı eklenmesi)
  - `[x]` Şube saat kurallarının `kiosk_operating_hours_rules` tablosundan yüklenmesi/yazılması işlemlerinin entegrasyonu
  - `[x]` Kiosk cihaz listesinde "Çalışma Saatlerini Kullan" toggle'ı açıldığında kuralların listelenip seçilmesi ve `kiosk_terminal_operating_rules` tablosuna yazılması
- `[x]` İstemci Kiosk Entegrasyonları (`KioskBig.jsx` & `KioskTablet.jsx`)
  - `[x]` `KioskBig.jsx` üzerinde terminal-kural eşleşmelerinin çekilmesi ve kurala göre açık/kapalı kontrolü
  - `[x]` `KioskTablet.jsx` üzerinde aynı kontrollerin entegre edilmesi
- `[x]` Doğrulama (Verification)
  - `[x]` Vite production build doğrulaması (`npm run build`)
  - `[x]` Git status kontrolü
  - `[x]` `OperationSync.md` dosyasına güncel durum logunun yazılması
