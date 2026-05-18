# SuitableRMS

Bu dosya artik kanonik baslangic ve hizli yonlendirme dosyasidir.

## Once Bunlari Oku

1. `SUITABLERMS_PROJECT_GOVERNANCE.md`
2. `OperationSync.md`

Bu iki dosya, tarihsel notlar ve eski README iceriklerinin uzerindedir.

## Proje Gercegi

- Proje dizini: `C:\RMSggl\Dropbox\RMSv3`
- Tek uretim ortami: Railway
- Tek veri kaynagi: Railway Postgres
- Frontend veri erisimi: `src/lib/db.js`
- Backend query gecidi: `server/index.js`
- Auth: kapali / bypass
- Personel ekran baglami: `src/lib/posStaffAuth.js`

## Lokal Gelistirme

Bagimliliklar:

```bash
npm install
```

Web gelistirme sunucusu:

```bash
npm.cmd run dev
```

Web build:

```bash
npm.cmd run build
```

Desktop build:

```bash
npm.cmd run build:desktop
```

## Tarihsel Not

Bu repoda Supabase, AWS EC2, eski deploy akislari ve migration izi tasiyan
dosyalar bulunabilir. Bunlar otomatik olarak aktif mimari anlamina gelmez ve uygulanmaz.

Tarihsel README icerigi korunmustur:

- `README_HISTORICAL_2026-05-09.md`

Bu dosya sadece gecmis baglami saklamak icindir. Kanonik karar kaynagi
degildir.
