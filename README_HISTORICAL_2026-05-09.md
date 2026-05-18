# SuitableRMS Setup

Historical archive created on `2026-05-09`.

This file preserves the previous README content for reference only.
It is not the canonical source of truth for RMSv3.

Canonical sources:

1. `SUITABLERMS_PROJECT_GOVERNANCE.md`
2. `OperationSync.md`

---

# Previous README Content

IMPORTANT:

- Yeni agent icin bu dosya kanonik baslangic kaynagi degildir.
- Once `AGENT_START_HERE.md`, sonra `MASTER_HANDOFF.md` okunmalidir.
- Bu README icindeki eski deploy anlatimlari historical referans olabilir.

## 1. Supabase Tablolari

Supabase -> SQL Editor -> `supabase-schema.sql` dosyasinin icerigini yapistir -> Run

## 2. Bagimliliklari Kur

```bash
npm install
```

## 3. Gelistirme Sunucusu

```bash
npm run dev
```

Tarayicida `http://localhost:5173` ac.

## 4. Canli Deploy Notu

Guncel production kanali `AWS EC2 + Caddy + self-hosted Supabase` hattidir.

- Canli host sabit olarak README'ye yazilmaz; kaynak `.env` icindeki `VITE_SUPABASE_URL` ve `AGENT_START_HERE.md`'dir.
- Canonical deploy ve live truth icin once `AGENT_START_HERE.md`, sonra `MASTER_HANDOFF.md` okunmalidir.
- Asagidaki Vercel adimlari tarihsel referanstir; primary live kanal olarak kullanilmaz.
- Kod tarafinda legacy hosted iz kontrolu icin: `npm run check:supabase-hygiene`

## 5. Vercel'e Deploy (Historical - Do Not Use For Current Production)

Bu bolum sadece tarihsel referanstir.

- Mevcut production deploy yolu degildir.
- Yeni agent bu bolume gore canli deploy karari vermemelidir.
- Mevcut canli deploy AWS uzerinden yapilir.

1. GitHub'a push yap
2. vercel.com -> New Project -> GitHub reposunu sec
3. Environment Variables ekle:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## 6. Windows POS / Garson EXE

Bu repo artik mevcut web uygulamasini bozmadan ayrica POS ve Garson ekranlari icin ayri bir Windows uygulamasi da uretebilir.

1. `.env` icinde `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` dolu olmali.
2. Desktop OAuth kullanacaksaniz `VITE_AUTH_REDIRECT_URL=http://127.0.0.1:4173/` tanimlayin.
3. Supabase Auth ve Google OAuth redirect allowlist icine `http://127.0.0.1:4173/` ekleyin.
4. Paket almak icin:

```bash
npm run build:desktop
```

Olusan Windows portable exe dosyasi `release/` altina yazilir.

## Proje Yapisi

```text
src/
|-- components/
|   |-- layout/     Sidebar, Header
|   |-- ui/         Modal, ConfirmDialog, Placeholder
|   `-- pages/      Her modul ayri dosya
|-- hooks/
|   `-- useToast    Global bildirim sistemi
|-- lib/
|   `-- supabase.js Supabase client
`-- App.jsx         Router
```
