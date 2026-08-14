# SuitableRMS Project Governance

Yürürlük tarihi: `2026-05-09`  
Status: `active — tüm agent'lar için bağlayıcı`

---

## 1. Proje Konumu

- Lokal dizin: `X:\RMSv3`
- Lokal dev: `npm.cmd run dev`
- Lokal build: `npm.cmd run build`

---

## 2. Üretim Altyapısı

| Servis | Platform / Sunucu | URL / Adres |
|--------|------------------|-------------|
| Web Uygulaması (Frontend) | Hosting Dünyam VPS (Nginx) | `http://188.132.198.144:3000` |
| API Servisi (Node Backend) | Hosting Dünyam VPS (Node.js) | `http://188.132.198.144:3001` |
| Veritabanı | Hosting Dünyam VPS (PostgreSQL 15) | `postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway` |
| Yönetim Paneli | Coolify v4 | `http://188.132.198.144:8000` |
| Git & Release Deposu | GitHub | `https://github.com` (Yayinla.bat ve git push akışları aynen geçerlidir) |

---

## 3. Ölü Altyapı — Kesinlikle Kullanılmayacak

Aşağıdakiler tarihe karışmıştır. Hiçbir agent bu adreslere bağlanmaz, bu kimlik bilgilerini kullanmaz, bu ortamlardan veri okumaz veya yazmaz.

### Railway — KAPALI / PASİF
- Eski Railway Postgres (`*.rlwy.net`), Railway API (`*.up.railway.app`) ve frontend adresleri kapatılmıştır.
- Railway CLI (`railway up`) veya Railway deploy akışları kullanılmaz.
- Üretim ortamı tamamen Hosting Dünyam VPS (`188.132.198.144`) ve Coolify üzerine taşınmıştır.

### AWS EC2 — KAPALI
- Host: `52.59.179.17`
- Instance: `i-082102f6c92aebf41`
- Bölge: `eu-central-1`
- SSH key: artık geçersiz sayılır
- **Bu adrese SSH bağlantısı kurulmaz.**
- **Bu sunucuya deploy yapılmaz.**

### Supabase — KALDIRILDI
- Projede `@supabase/supabase-js` paketi yoktur.
- `src/lib/supabase.js` dosyası yoktur, yerine `src/lib/db.js` vardır.
- Kodda `supabase` kelimesi geçmez.
- Hiçbir agent Supabase Studio'ya, Supabase API'sine veya herhangi bir Supabase endpoint'ine bağlanmaz.
- `rms-52-59-179-17.sslip.io` adresine istek atılmaz.

### Eski hosted Supabase Cloud — KALDIRILDI
- Herhangi bir `*.supabase.co` adresi kullanılmaz.

---

## 4. Veri Yönetimi — DB First

### Temel Kural
**Her şey veritabanında yaşar.**

- Müşteri, satış, ödeme, stok, sadakat, personel, muhasebe, sipariş, operasyon verileri yalnızca VPS PostgreSQL tablolarındadır.
- Hiçbir iş verisi `localStorage`, `sessionStorage`, sabit JSON veya uygulama içi mock ile karşılanamaz.
- Performans için ara katman cache kullanılabilir (in-memory, Redis vb.) ancak bu cache'ler yalnızca DB'nin kopyasıdır, asla birincil kaynak değildir.
- Cache'ten okunan veri ile DB verisi çelişirse DB kazanır.

### Demo Veri Yasağı
- Demo satış verisi (demoSalesGenerator) VPS PostgreSQL üretim tablolarına yüklenmez.
- Test verisi eklenecekse `metadata.source = 'demo'` alanı zorunludur ve üretim tablolarından ayrı tutulur.

### Fallback Yasağı
- Uygulama DB'ye ulaşamazsa ekranda açıkça hata gösterir.
- Sessiz fallback, mock veri gösterimi veya "sanki çalışıyormuş gibi" davranış yasaktır.
- Şube/depo bağlamı yoksa sistem sabit bir şubeye, ilk şubeye veya sabit bir depoya düşemez; ilgili bölüm PIN oturumu istenir.
- Kaldırılan davranışlar kısa devreye alınmış JSX, yorum satırı veya kullanılmayan legacy blok olarak kodda bırakılamaz.

---

## 5. Auth — Yok

Bu projede kullanıcı kimlik doğrulaması yoktur.

- Google OAuth yoktur.
- Email/şifre girişi yoktur.
- JWT token yoktur.
- `AuthContext.jsx` sadece bypass modu döndürür.
- `AuthGate.jsx` her zaman `children` render eder.
- `.env` dosyasında `VITE_DISABLE_AUTH=true` kalıcıdır.

### Personel Kimliği
- Ekran içi "kim kullanıyor" bilgisi yalnızca PIN ile belirlenir.
- PIN doğrulaması `src/lib/posStaffAuth.js` üzerinden yapılır.
- PIN eşleşince kimlik `sessionStorage`'a yazılır, sekme kapanınca uçar.
- Bu sistem auth değildir, sadece ekran bağlamı bilgisidir.
- Çalışma bağlamı tek/global modal değildir. Sidebar bölüm başlıklarından bölüm bazlı PIN oturumu açılır: `center`, `branch`, `warehouse`, `kitchen`.
- `POS ve Ekranlar` şube oturumunu, `Ayarlar` merkez oturumunu kullanır. Bölüm checkbox'ları sadece alt menü görünürlüğünü yönetir; yetki yerine geçmez.

---

## 6. Kod Kuralları

### İsimlendirme
- DB bağlantısı: `src/lib/db.js` — başka isim kullanılmaz.
- Import: `import { db } from '@/lib/db'`
- Kullanım: `db.from('tablo').select()` — Supabase syntax'ı korunmuştur, arkası VPS API ve Postgres'e gider.

### Yasaklı Kelimeler (kod içinde geçemez)
- `supabase`
- `SUPABASE`
- `supabase.co`
- `sslip.io`
- `52.59.179.17`

### API Servisi
- Tüm DB sorguları `server/index.js` üzerinden geçer.
- Connection pool aktiftir: `max: 10`
- GET sorguları 30 saniyelik in-memory cache'e alınır.
- POST/PUT/DELETE cache'i temizler.
- VPS üzerinde API Docker container'ı (`node index.js`, port 3001) çalışmaktadır.
- Healthcheck endpoint: `http://188.132.198.144:3001/health`

---

## 7. Deploy Prosedürü

### Otomatik Canlıya Alma (Coolify & GitHub)
- Projedeki tüm güncellemeler GitHub `main` branch'ine push edildiğinde veya `Yayinla.bat` çalıştırıldığında, VPS üzerindeki Coolify v4 webhooks aracılığıyla otomatik olarak canlıya alınır.

### Veritabanı Değişikliği (Migration)
```bash
psql "postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway" -f migration.sql
```

### Schema Kaynağı
- Tek kaynak schema dosyası: `schema-railway-master.sql`
- Tablolar, indeksler, fonksiyonlar ve trigger'lar bu dosyada tutulur.
- Her tablo değişikliği veya migration sonrası bu dosya güncellenir.
- Yeni bir veritabanı kurulacaksa bu dosya çalıştırılır:
  ```bash
  psql [DATABASE_URL] -f schema-railway-master.sql
  ```

---

## 8. Agent Çalışma Kuralları

Herhangi bir agent bu projeye dokunmadan önce şunu okur ve uygular:

1. **Veri kaynağı nedir?** → Hosting Dünyam VPS (`188.132.198.144`) PostgreSQL, başka hiçbir şey değil.
2. **Deploy nereye?** → Hosting Dünyam VPS (Coolify & GitHub pipeline), başka hiçbir yere değil.
3. **Auth var mı?** → Hayır.
4. **Supabase var mı?** → Hayır, kodda `db.js` var.
5. **AWS ve Railway açık mı?** → Hayır, ikisi de kapalı/pasiftir.

Bir agent bu kurallara aykırı bir değişiklik önerirse, o öneri reddedilir ve bu dosyaya bakılması istenir.

---

## 9. Ortam Değişkenleri (.env)

```
VITE_API_URL=http://188.132.198.144:3001
VITE_DISABLE_AUTH=true
TCMB_EVDS_API_KEY=9dcVSyM1Ex
```

Server tarafı (`server/.env`):
```
DATABASE_URL=postgresql://postgres:RMSv3_Local_Password_2026!@188.132.198.144:5432/railway
PORT=3001
```

Notlar:
- Root `.env` içine `DATABASE_URL` yazılmaz.
- Server tarafı bağlantı bilgileri yalnızca `server/.env` içinde tutulur.

---

## 10. Nihai Hüküm

SuitableRMS'in tek üretim ortamı Hosting Dünyam VPS (`188.132.198.144`) & Coolify'dır.  
Tek veri kaynağı VPS PostgreSQL'dir.  
Auth yoktur.  
AWS, Supabase ve Railway tarihe karışmıştır.  
Bu politika yazılı olarak değiştirilmedikçe tüm agent'lar, deploylar ve geliştirme çalışmaları için geçerlidir.

