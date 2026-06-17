# /manual Academy — Devir Teslim Belgesi
> Tarih: 2026-06-17  |  Sonraki agent bu dosyayı ilk okuyacak.

## ✅ TAMAMLANAN İŞLER

### 1. Giriş Sayfası (Hero) — TAMAM
- `src/styles/manual-academy.css` — premium CSS: floating orbs, shimmer title, glassmorphism search, kategori kartları
- `ManualReader.jsx` — root div'e `mr-academy-active` eklendi, hero section render ediliyor
- `App.jsx` — `/manual` route'unda sidebar + tüm padding kaldırıldı (fullscreen)

### 2. İç Sayfa Dark Tema — TAMAM  
- `src/styles/manual-academy.css` içine 300+ satır override eklendi
- Header, nav dropdown, breadcrumb, title, hero img, product story, specs banner,
  shelf life, recipe table, steps, ekipman tablosu, hammadde spec, prev/next
  navigasyon — HEPSİ dark glassmorphism temasında

### 3. Veri Seeding — TAMAM
| Kategori | Kayıt | Durum |
|----------|-------|-------|
| Ürünler (sale_items) | 73 sayfa | ✅ |
| Hammaddeler (stock_items) | 58 sayfa | ✅ |
| **Toplam** | **131 sayfa** | ✅ |

- Tüm kayıtlar `linked_item_id` ile ilgili tabloya bağlı
- Local server (localhost:3001) kullanıldı, Railway DB'ye yazıldı

### 4. Yeni API Endpoint'ler — TAMAM
- `GET /api/sale-items-list` — server/index.js ~2297. satır
- `GET /api/stock-items-list` — server/index.js ~2314. satır

---

## ⏳ YAPILMASI GEREKEN (Sonraki Agent)

### Öncelik 1: Build + Deploy
```bash
# Build
npx vite build --mode development

# Git commit
git add .
git commit -m "feat: /manual Academy dark theme + 131 manual pages seeded"
```

### Öncelik 2: Cross-Link Drawer Implementasyonu
**Amaç:** Ürün sayfasındaki reçete malzemesine tıklandığında sağdan kayan drawer açılacak, hammadde sayfası orada gösterilecek, kullanıcı geri dönebilecek.

**CSS hazır:** `.mr-link-drawer`, `.mr-link-drawer-open`, `.mr-ingredient-link` — `manual-academy.css`'de mevcut.

**Eksik React kodu** (`ManualReader.jsx` içine eklenecek):
```jsx
// State
const [drawerPage, setDrawerPage] = useState(null)

// Ingredient tıklandığında
const openIngredientDrawer = useCallback(async (stockItemId) => {
  // manual_pages'den stock_item'a bağlı sayfayı çek
  const { data } = await db.from('manual_pages')
    .select('*')
    .eq('linked_item_id', stockItemId)
    .eq('linked_item_type', 'stock_item')
    .single()
  setDrawerPage(data)
}, [])

// Drawer JSX
<div className={`mr-link-drawer ${drawerPage ? 'mr-link-drawer-open' : ''}`}>
  <button onClick={() => setDrawerPage(null)}>← Geri</button>
  {drawerPage && <PageDetail page={drawerPage} isDrawer />}
</div>
```

**Reçete satırlarında** `mr-ingredient-link` class'ı olan elementlere `onClick={() => openIngredientDrawer(row.stock_item_id)}` eklenmeli.

### Öncelik 3: Demo Veri Temizliği
DB'de "Test Cold Item", "Test Dry Item", "WMS Test Product" isimli demo kayıtlar var.
- Bunlar için oluşturulmuş manual_pages silinmeli
- Gerçek üretim ortamında stock_items'tan da kaldırılmalı

### Öncelik 4: ManualManagement İçerik Zenginleştirme
- `ManualManagement.jsx` üzerinden her sayfaya görsel, adım açıklaması, specs eklenebilir
- Şu an otomatik oluşturulan içerikler yüzeysel — kullanıcı elle zenginleştirecek

---

## 🗂️ KRİTİK DOSYALAR

| Dosya | Açıklama |
|-------|----------|
| `src/styles/manual-academy.css` | Tüm Academy CSS — DOKUNMA, sadece ekle |
| `src/components/pages/ManualReader.jsx` | Ana sayfa — 3855 satır, dikkatli işle |
| `src/App.jsx` | AdminLayout → isAcademy flag'i var, korunmalı |
| `server/index.js` | İki yeni endpoint var (~2297-2330 arası) |
| `docs/scripts/seed_manual_pages.js` | Ürün seeding (localhost:3001'e karşı) |
| `docs/scripts/seed_hammadde_pages.js` | Hammadde seeding (localhost:3001'e karşı) |

---

## 🔑 BAĞLANTI BİLGİLERİ

- **Railway API (prod):** `https://rms-api-production-219d.up.railway.app`
- **Local server:** `http://localhost:3001` (node server/index.js ile başlatılır)
- **Vite dev:** `npm run dev`
- **DB:** Railway PostgreSQL (db.js üzerinden, aynı Railway sunucusuna bağlı)

---

## 📦 MANUAL_CATEGORIES ID'LERİ

| Kategori | ID |
|----------|----|
| Ürünler | `5a220e60-ea65-4f28-a55f-c219bdccc520` |
| Hammaddeler | `4f63a03a-edc5-4303-ad1c-741ee6015938` |
| Ekipmanlar | `ab87f40b-8634-4743-a62e-3aaffdb133ca` |
| Operasyon | `0f0756c0-d8ad-407a-b2c8-315e9cd9f3e6` |
| Hizmet Standartları | `b93d411c-2e7d-41b9-b3e4-d36bb099eff1` |

---

*Bu dosya bir sonraki agent tarafından silinmemeli, tamamlandıkça güncellenmeli.*
