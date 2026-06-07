# SuitableRMS Project Governance

Yürürlük tarihi: `2026-05-09`  
Status: `active — tüm agent'lar için bağlayıcı`

---

## 1. Proje Konumu

- Lokal dizin: `C:\RMSv3`
- Lokal dev: `npm.cmd run dev`
- Lokal build: `npm.cmd run build`

---

## 2. Üretim Altyapısı

| Servis | Platform | URL |
|--------|----------|-----|
| Veritabanı | Railway Postgres | `postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway` |
| API | Railway | `https://rms-api-production-219d.up.railway.app` |
| Frontend | Railway | `https://suitablerms.up.railway.app` |
| Railway Proje | railway.com | `SuitableRMS / production` |

---

## 3. Ölü Altyapı — Kesinlikle Kullanılmayacak

Aşağıdakiler tarihe karışmıştır. Hiçbir agent bu adreslere bağlanmaz, bu kimlik bilgilerini kullanmaz, bu ortamlardan veri okumaz veya yazmaz.

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

- Müşteri, satış, ödeme, stok, sadakat, personel, muhasebe, sipariş, operasyon verileri yalnızca Railway Postgres tablolarındadır.
- Hiçbir iş verisi `localStorage`, `sessionStorage`, sabit JSON veya uygulama içi mock ile karşılanamaz.
- Performans için ara katman cache kullanılabilir (in-memory, Redis vb.) ancak bu cache'ler yalnızca DB'nin kopyasıdır, asla birincil kaynak değildir.
- Cache'ten okunan veri ile DB verisi çelişirse DB kazanır.

### Demo Veri Yasağı
- Demo satış verisi (demoSalesGenerator) Railway Postgres'e yüklenmez.
- Test verisi eklenecekse `metadata.source = 'demo'` alanı zorunludur ve üretim tablolarından ayrı tutulur.

### Fallback Yasağı
- Uygulama DB'ye ulaşamazsa ekranda açıkça hata gösterir.
- Sessiz fallback, mock veri gösterimi veya "sanki çalışıyormuş gibi" davranış yasaktır.

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

---

## 6. Kod Kuralları

### İsimlendirme
- DB bağlantısı: `src/lib/db.js` — başka isim kullanılmaz.
- Import: `import { db } from '@/lib/db'`
- Kullanım: `db.from('tablo').select()` — Supabase syntax'ı korunmuştur, arkası Railway'e gider.

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
- Railway `rms-api` servisi repo kokunden degil `server` klasorunden deploy edilmelidir.
- Railway `rms-api` zorunlu ayarlari:
  - `Root Directory = server`
  - `Start Command = node index.js`
  - `Healthcheck Path = /health`
- `rms-api` domaininde frontend route aciliyorsa servis yanlis hedefi calistiriyor demektir; once Railway service ayarlari duzeltilir.

---

## 7. Deploy Prosedürü

### API Güncelleme
```bash
cd server
railway up --service rms-api
```

Railway dashboard tarafinda da su ayarlar korunur:
- Service: `rms-api`
- Root Directory: `server`
- Start Command: `node index.js`
- Healthcheck Path: `/health`

### Frontend Güncelleme
```bash
npm.cmd run build
railway up --service frontend
```

Railway dashboard tarafinda frontend icin su ayarlar korunur:
- Service: `frontend`
- Root Directory: repo kokü (`bos` / tanimsiz)
- Build Command: `npm run build`
- Start Command: `npm run start:web`
- Healthcheck Path: `/`
- Frontend service `VITE_API_URL=https://rms-api-production-219d.up.railway.app` ile build alinmalidir.
- `frontend` service asla `server` klasorunden kalkmaz; API ve frontend root/command ayarlari birbirine karistirilmaz.

### Veritabanı Değişikliği
```bash
psql postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway -f migration.sql
```

### Schema Kaynağı
- Tek kaynak schema dosyası: `schema-railway-master.sql`
- 67 tablo, 153 index, 58 fonksiyon, 7 trigger
- Her tablo değişikliği veya migration sonrası bu dosya güncellenir
- Yeni bir Railway projesi kurulacaksa bu dosya çalıştırılır:
  ```bash
  psql [DATABASE_URL] -f schema-railway-master.sql
  ```
- Bu dosya olmadan Railway'e tablo eklenmez

---

## 8. Agent Çalışma Kuralları

Herhangi bir agent bu projeye dokunmadan önce şunu okur ve uygular:

1. **Veri kaynağı nedir?** → Railway Postgres, başka hiçbir şey değil.
2. **Deploy nereye?** → Railway, başka hiçbir yere değil.
3. **Auth var mı?** → Hayır.
4. **Supabase var mı?** → Hayır, kodda `db.js` var.
5. **AWS açık mı?** → Hayır, kapalı.

Bir agent bu kurallara aykırı bir değişiklik önerirse, o öneri reddedilir ve bu dosyaya bakılması istenir.

---

## 9. Ortam Değişkenleri (.env)

```
VITE_API_URL=https://rms-api-production-219d.up.railway.app
VITE_DISABLE_AUTH=true
TCMB_EVDS_API_KEY=9dcVSyM1Ex
```

Server tarafı (`server/.env` veya Railway Variables):
```
DATABASE_URL=postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway
PORT=3001
```

Notlar:
- Root `.env` icine `DATABASE_URL` yazilmaz.
- Server tarafi baglanti bilgileri yalnizca `server/.env` veya Railway Variables icinde tutulur.

---

## 10. Nihai Hüküm

SuitableRMS'in tek üretim ortamı Railway'dir.  
Tek veri kaynağı Railway Postgres'tir.  
Auth yoktur.  
AWS ve Supabase tarihe karışmıştır.  
Bu politika yazılı olarak değiştirilmedikçe tüm agent'lar, deploylar ve geliştirme çalışmaları için geçerlidir.
