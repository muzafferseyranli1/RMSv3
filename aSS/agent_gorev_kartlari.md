# SuitableRMS POS — Agent Görev Kartları (Orchestration)

> **Yönetici:** Antigravity (Bu Oturum)  
> **Çalışan Agentler:** Aşağıdaki faz kartlarını alarak çalışacak sub-agentler  
> **Proje:** `X:\RMSv3` — LAN Master-Slave POS Desktop Dönüşümü  
> **Referans Plan:** [pos_lan_master_slave_plan.md](file:///C:/Users/muzaf/.gemini/antigravity/brain/02c9cfd3-c9c7-4305-ae6c-928164b962fa/pos_lan_master_slave_plan.md)

---

## 🗂️ Faz Tablosu

| Faz | Konu | Model | Bağımlılık |
|---|---|---|---|
| **FAZ 0-A** | terminalConfig.cjs + terminalIdentity.js | Flash | Yok |
| **FAZ 0-B** | PairingScreen.jsx (4 adımlı wizard) | **Pro** | FAZ 0-A |
| **FAZ 0-C** | Railway Migration 020 | Flash | Yok |
| **FAZ 1** | sqliteStore.cjs (better-sqlite3) | Flash | FAZ 0-A |
| **FAZ 2** | edgeServer.cjs (Express + WebSocket) | **Pro** | FAZ 1 |
| **FAZ 3** | syncWorker.cjs | Flash | FAZ 1 |
| **FAZ 4** | db.js LAN Router | **Pro** | FAZ 0-A |
| **FAZ 5** | useLanSync + OfflineStatusBar | Flash | FAZ 4 |
| **FAZ 6** | main.cjs + DesktopPosApp.jsx entegrasyonu | **Pro** | FAZ 2, 3, 5 |
| **FAZ 7** | created_by_terminal migration + enjeksiyon | Flash | FAZ 0-C |
| **FAZ 8** | Auto-Updater (electron-updater + GitHub) | Flash | FAZ 6 |

---
---

## 📋 FAZ 0-A — Terminal Kimlik Altyapısı
**Model: Gemini Flash** | Bağımlılık: Yok | Süre: ~1 saat

### Görev
`desktop/terminalConfig.cjs` ve `src/lib/terminalIdentity.js` dosyalarını oluştur.

### Oluşturulacak Dosyalar

**1. `X:\RMSv3\desktop\terminalConfig.cjs` (YENİ)**

```js
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const CONFIG_FILE = path.join(app.getPath('userData'), 'terminal-config.json')

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch { return null }
}

function writeConfig(data) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8')
}

function isPaired() {
  const cfg = readConfig()
  return Boolean(cfg?.terminalId && cfg?.branchId && cfg?.terminalRole && cfg?.screenMode)
}

function isMaster() {
  return readConfig()?.terminalRole === 'master'
}

// 'pos' | 'garson' | 'pos-masa' | 'pos-masalar'
function getScreenMode() {
  return readConfig()?.screenMode ?? 'pos'
}

// Electron window.loadURL() için başlangıç rotası
function getStartupRoute() {
  const ROUTES = {
    pos: '/pos',
    garson: '/garson',
    'pos-masa': '/pos-masa',
    'pos-masalar': '/pos-masalar',
  }
  return ROUTES[getScreenMode()] ?? '/pos'
}

module.exports = { readConfig, writeConfig, isPaired, isMaster, getScreenMode, getStartupRoute, CONFIG_FILE }
```

**2. `X:\RMSv3\src\lib\terminalIdentity.js` (YENİ)**

```js
// Electron IPC üzerinden terminal config'i renderer'a aktaran bridge.
// Electron ortamında window.__ELECTRON_TERMINAL_CONFIG__ inject edilir (main.cjs'de).
// Web/dev ortamında sessionStorage fallback kullanılır.

const CACHE_KEY = 'suitable_terminal_config_v1'

export function readTerminalConfig() {
  try {
    if (typeof window === 'undefined') return null
    if (window.__ELECTRON_TERMINAL_CONFIG__) return window.__ELECTRON_TERMINAL_CONFIG__
    const raw = sessionStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function getTerminalId() {
  return readTerminalConfig()?.terminalId ?? null
}

export function getBranchId() {
  return readTerminalConfig()?.branchId ?? null
}

export function getTerminalRole() {
  // 'master' | 'slave' | null
  return readTerminalConfig()?.terminalRole ?? null
}

export function isMasterTerminal() {
  return getTerminalRole() === 'master'
}

export function getSlaveConfig() {
  const cfg = readTerminalConfig()
  if (cfg?.terminalRole !== 'slave') return null
  return {
    masterIp: cfg.masterLanIp,
    masterPort: Number(cfg.masterLanPort) || 4000,
  }
}

export function getScreenMode() {
  return readTerminalConfig()?.screenMode ?? 'pos'
}

export function getStartupPath() {
  const PATHS = {
    pos: '/pos',
    garson: '/garson',
    'pos-masa': '/pos-masa',
    'pos-masalar': '/pos-masalar',
  }
  return PATHS[getScreenMode()] ?? '/pos'
}

export function isDesktopMode() {
  return Boolean(
    typeof window !== 'undefined' &&
    (window.__ELECTRON_TERMINAL_CONFIG__ || window.__DESKTOP_MODE__ === true)
  )
}
```

### Governance Kontrol Listesi
- [ ] Dosyalar belirtilen tam yollara yazıldı
- [ ] `terminalConfig.cjs` — `require('electron')` ile başlıyor (CJS formatı)
- [ ] `terminalIdentity.js` — ES Module (export) formatında, `.cjs` değil `.js`
- [ ] `terminalConfig.cjs` içinde `CONFIG_FILE` export ediliyor (test için)
- [ ] Mevcut hiçbir dosya değiştirilmedi

### Yönetici Kontrol Noktası
- `CONFIG_FILE` path'inin `userData` altında oluştuğunu doğrula
- `isPaired()` fonksiyonunun `screenMode` kontrolünü de yaptığını doğrula

---
---

## 📋 FAZ 0-B — Pairing Wizard UI
**Model: Gemini 2.5 Pro** | Bağımlılık: FAZ 0-A | Süre: ~3 saat

### Görev
`src/components/pos/PairingScreen.jsx` bileşenini oluştur. Bu, ilk kurulumda kullanıcıya gösterilen 4 adımlı aktivasyon wizard'ıdır.

### Bağlam Dosyaları — Önce Oku
- `X:\RMSv3\src\lib\terminalIdentity.js` (FAZ 0-A çıktısı)
- `X:\RMSv3\.antigravityrules.md` (stil kuralları)
- `X:\RMSv3\src\index.css` (mevcut CSS değişkenleri)

### Oluşturulacak Dosya
`X:\RMSv3\src\components\pos\PairingScreen.jsx` (YENİ)

### Wizard Akışı

```
Adım 1: Aktivasyon kodu giriş (SUT-XXXX-XXX formatında masked input)
         ↓ Doğrula butonu → Railway /api/query'den pos_terminals tablosunu sorgula
         ↓ Başarılı: branchId, branchName alınır → Adım 2
         ↓ Başarısız: hata mesajı göster

Adım 2: Terminal rolü seç
         [👑 ANA KASA] [🖥️ YAN KASA]
         ↓ Eğer ANA KASA → Adım 4'e git
         ↓ Eğer YAN KASA → Adım 3'e git

Adım 3: (Yalnızca Yan Kasa) Ana Kasanın LAN IP'si
         Input: 192.168.X.X
         [Bağlantıyı Test Et] → GET http://{ip}:4000/lan/health çağır
         ✅ başarılı ise [Devam →] aktif olur → Adım 4

Adım 4: Ekran modu seç (TÜM roller için)
         [🧾 POS] [🍽️ GARSON] [📋 MASALAR]
         [Kurulumu Tamamla →]
         → Tamamla: writeConfig() via IPC (ipcRenderer.invoke('terminal:pair', payload))
         → Başarılı: onComplete() callback çağır
```

### Teknik Gereksinimler
- `ipcRenderer` KULLANILAMAZ (sandbox: true). Bunun yerine:
  ```js
  // Pairing tamamlandığında window'a custom event at
  window.dispatchEvent(new CustomEvent('terminal:pairing-complete', { detail: payload }))
  // main.cjs bu eventi dinleyecek (preload aracılığıyla)
  ```
  VEYA doğrudan `fetch('/api/query')` ile `pos_terminals` tablosunu sorgulayıp
  sonucu `sessionStorage`'a yaz, `onComplete()` çağır.

- Aktivasyon kodu doğrulama sorgusu:
  ```js
  // db.js'in mevcut db.from() API'sini kullan
  import { db } from '@/lib/db'
  const result = await db.from('pos_terminals')
    .select('terminal_id, branch_id, activation_code')
    .eq('activation_code', code.toUpperCase())
    .eq('is_active', true)
    .single()
  ```

- Stil: Projenin mevcut CSS değişkenlerini kullan (`--color-primary`, vb.). Tailwind KULLANMA.
- Bileşen `onComplete` prop'u alır (zorunlu callback).
- Progress indicator (1/4, 2/4 vb.) ekle.
- Her adımda "Geri" butonu olsun (Adım 1 hariç).

### Export
```js
export function PairingScreen({ onComplete }) { ... }
```

### Governance Kontrol Listesi
- [ ] `ipcRenderer` doğrudan import edilmiyor (sandbox uyumu)
- [ ] `db.from()` API'si mevcut `@/lib/db` üzerinden kullanılıyor
- [ ] `pos_terminals` tablosu sorgulanıyor (Supabase değil, Railway)
- [ ] Tailwind class'ı yok, vanilla CSS / mevcut değişkenler kullanılıyor
- [ ] `onComplete` prop'u tanımlanmış ve çağrılıyor

### Yönetici Kontrol Noktası
- 4 adımın tamamı var mı?
- Adım 3, YAN KASA seçilmediğinde atlanıyor mu?
- IP test etme fetch başarısız olduğunda kullanıcıya hata gösteriliyor mu?

---
---

## 📋 FAZ 0-C — Railway Migration (Terminal Kayıt Tablosu)
**Model: Gemini Flash** | Bağımlılık: Yok | Süre: ~30 dk

### Görev
`migrations/020_pos_terminal_registry.sql` dosyasını oluştur.

### Oluşturulacak Dosya
`X:\RMSv3\migrations\020_pos_terminal_registry.sql` (YENİ)

### İçerik

```sql
-- ============================================================
-- 020_pos_terminal_registry.sql
-- POS terminal aktivasyon ve kayıt sistemi
-- ============================================================

-- Terminal kayıt tablosu
CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  terminal_id     UUID NOT NULL UNIQUE,
  branch_id       UUID NOT NULL,
  activation_code TEXT NOT NULL UNIQUE,
  terminal_role   TEXT NOT NULL DEFAULT 'slave'
                  CHECK (terminal_role IN ('master', 'slave')),
  screen_mode     TEXT NOT NULL DEFAULT 'pos'
                  CHECK (screen_mode IN ('pos', 'garson', 'pos-masa', 'pos-masalar')),
  terminal_name   TEXT,
  last_seen_at    TIMESTAMPTZ,
  app_version     TEXT,
  is_active       BOOLEAN DEFAULT true NOT NULL,
  is_used         BOOLEAN DEFAULT false NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- sales tablosuna terminal izlenebilirliği
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS created_by_terminal UUID,
  ADD COLUMN IF NOT EXISTS created_by_terminal_name TEXT;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS created_by_terminal UUID;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_pos_terminals_branch ON public.pos_terminals(branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_code ON public.pos_terminals(activation_code);
CREATE INDEX IF NOT EXISTS idx_sales_terminal ON public.sales(created_by_terminal)
  WHERE created_by_terminal IS NOT NULL;

-- Aktivasyon kodu üretme fonksiyonu
CREATE OR REPLACE FUNCTION public.generate_terminal_activation_code(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'SUT-' ||
      upper(substring(md5(random()::text), 1, 4)) || '-' ||
      upper(substring(md5(random()::text), 1, 3));
    SELECT EXISTS(
      SELECT 1 FROM public.pos_terminals WHERE activation_code = v_code
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;
```

### Governance Kontrol Listesi
- [ ] `IF NOT EXISTS` kullanılıyor (idempotent)
- [ ] `schema-railway-master.sql` dosyasına bu tablonun tanımı eklendi
- [ ] `protected-docs.json` kontrol edildi — değiştirilmesi yasak dosya yok

### Yönetici Kontrol Noktası
- `is_used` kolonu var mı? (Single-use aktivasyon kodu için)
- `screen_mode` check constraint doğru değerleri kapsıyor mu?

---
---

## 📋 FAZ 1 — SQLite Yerel Veritabanı Katmanı
**Model: Gemini Flash** | Bağımlılık: FAZ 0-A | Süre: ~2 saat

### Görev
`desktop/sqliteStore.cjs` dosyasını oluştur. `better-sqlite3` ile Ana Kasanın yerel SQLite veritabanı.

### Ön Kontrol
`better-sqlite3` paketi `package.json`'da devDependencies'e eklenmiş mi? Değilse:
```
"better-sqlite3": "^9.4.3"
```
Ayrıca `"postinstall": "electron-rebuild -f -w better-sqlite3"` scripts'e ekle.

### Oluşturulacak Dosya
`X:\RMSv3\desktop\sqliteStore.cjs` (YENİ)

### Tam Implementasyon Gereksinimleri

**Schema (initSchema):**
- `catalog_cache` tablosu: `(cache_key TEXT PK, branch_id TEXT, table_name TEXT, data_json TEXT, fetched_at INTEGER, ttl_ms INTEGER DEFAULT 1800000)`
- `offline_queue` tablosu: `(id INTEGER PK AUTOINCREMENT, query_json TEXT, created_at INTEGER, retry_count INTEGER DEFAULT 0, last_error TEXT, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sending','done','failed')), terminal_id TEXT)`
- `terminal_registry` tablosu: `(terminal_id TEXT PK, terminal_role TEXT, terminal_name TEXT, lan_ip TEXT, last_seen_at INTEGER, is_connected INTEGER DEFAULT 0)`
- `open_tickets_mirror` tablosu: `(branch_id TEXT, table_key TEXT, ticket_json TEXT, updated_at INTEGER, PRIMARY KEY(branch_id, table_key))`

**PRAGMA'lar:** `journal_mode = WAL`, `foreign_keys = ON`, `synchronous = NORMAL`

**Dışa açılan fonksiyonlar:**
- `getDb()` — singleton DB bağlantısı
- `setCatalogCache(cacheKey, branchId, tableName, data, ttlMs)` — INSERT OR REPLACE
- `getCatalogCache(cacheKey)` — TTL kontrolü ile, süresi dolmuşsa null
- `enqueueWrite(queryBody, terminalId)` — offline_queue'ya ekle
- `getPendingWrites(limit = 50)` — status='pending', ORDER BY id ASC
- `markWriteDone(id)` — status='done'
- `markWriteFailed(id, errorMsg)` — retry_count >= 5 ise status='failed', değilse 'pending'
- `getQueueSize()` — pending sayısı
- `upsertTicketMirror(branchId, tableKey, ticketData)` — open_tickets_mirror güncelle

**DB Path:** `path.join(app.getPath('userData'), 'pos-local.db')`

### Governance Kontrol Listesi
- [ ] Singleton pattern — birden fazla `getDb()` çağrısı aynı instance döner
- [ ] WAL modu aktif
- [ ] `markWriteFailed` retry limiti 5, sonrası 'failed' durumuna geçiyor
- [ ] Tüm fonksiyonlar `module.exports` ile dışa açılıyor
- [ ] `app.getPath('userData')` kullanılıyor (hardcoded path yok)

### Yönetici Kontrol Noktası
- WAL pragma set ediliyor mu?
- `getCatalogCache` TTL süresi dolmuşsa silip null döndürüyor mu (veya yeni fetch tetikliyor mu)?
- `markWriteFailed` retry sayısını doğru artırıyor mu?

---
---

## 📋 FAZ 2 — Local Edge Server (Express + WebSocket)
**Model: Gemini 2.5 Pro** | Bağımlılık: FAZ 1 | Süre: ~3 saat

### Görev
`desktop/edgeServer.cjs` dosyasını oluştur. Bu, Ana Kasanın tüm Yan Kasalara hizmet veren yerel HTTP + WebSocket sunucusudur.

### Bağlam Dosyaları — Önce Oku
- `X:\RMSv3\desktop\sqliteStore.cjs` (FAZ 1 çıktısı)
- `X:\RMSv3\desktop\terminalConfig.cjs` (FAZ 0-A çıktısı)
- `X:\RMSv3\server\index.js` — Referans: mevcut API server'ın `buildConditions` ve `executeQuery` mantığını anla

### Oluşturulacak Dosya
`X:\RMSv3\desktop\edgeServer.cjs` (YENİ)

### Gereksinimler

**HTTP Server (port 4000, 0.0.0.0):**

`GET /lan/health` — Auth olmadan:
```json
{ "ok": true, "role": "master", "branchId": "...", "queueSize": 0, "timestamp": 1234567890 }
```

`POST /lan/query` — Header kontrolü: `x-branch-id` === `readConfig().branchId` (403 değilse)
- READ işlemi (`operation === 'select'`): SQLite cache'e bak → hit ise cache döndür, miss ise `railwayQueryFn()` çağır → cache'e yaz → döndür
- WRITE işlemi: `railwayQueryFn()` çağır → başarılı ise `broadcastTableUpdate()` → JSON döndür; başarısız (ağ hatası) ise `enqueueWrite()` → `{ data: null, error: null, queued: true }` döndür

**TTL Politikası:**
```js
const TTL = {
  sale_items: 30 * 60 * 1000,
  sale_categories: 60 * 60 * 1000,
  pos_table_halls: 60 * 60 * 1000,
  pos_table_sections: 60 * 60 * 1000,
  pos_tables: 60 * 60 * 1000,
  sales_channels: 60 * 60 * 1000,
  taxes: 120 * 60 * 1000,
  settings: 2 * 60 * 1000,
}
// Diğerleri: 15 dakika
```

**WebSocket Server (port 4001):**
- `?terminalId=xxx` query param ile bağlanan Yan Kasaları `connectedSlaves` Map'ine ekle
- `close` eventi: Map'ten çıkar
- `broadcastTableUpdate(table, sourceTerminalId)`: tüm OPEN bağlantılara `{ type: 'TABLE_UPDATED', table, sourceTerminalId, timestamp }` gönder

**Export:**
```js
module.exports = { startEdgeServer, stopEdgeServer, broadcastTableUpdate }
```

`startEdgeServer(railwayQueryFn)` → `{ httpServer, wss }` döndürür

### Governance Kontrol Listesi
- [ ] Polling/setInterval YOK
- [ ] `x-branch-id` header kontrolü yapılıyor
- [ ] Cache key `table:${JSON.stringify(filters)}:${select}` formatında unique
- [ ] `ws` paketi kullanılıyor (`socket.io` değil)
- [ ] `stopEdgeServer()` her iki server'ı da kapatıyor

### Yönetici Kontrol Noktası
- `/lan/health` endpoint'ine curl ile erişilebiliyor mu?
- Branch ID mismatch durumunda 403 dönüyor mu?
- `broadcastTableUpdate` sadece `ws.readyState === 1` (OPEN) olanları hedef alıyor mu?

---
---

## 📋 FAZ 3 — Sync Worker (Offline Queue → Railway)
**Model: Gemini Flash** | Bağımlılık: FAZ 1 | Süre: ~1 saat

### Görev
`desktop/syncWorker.cjs` dosyasını oluştur. Offline biriken yazımları internet gelince Railway'e gönderir.

### Oluşturulacak Dosya
`X:\RMSv3\desktop\syncWorker.cjs` (YENİ)

### Gereksinimler

**İnternet izleme:** `dns.lookup()` ile Railway API host'u kontrol et. `setTimeout(check, 30_000)` — setInterval YOK.

**Kontrol mantığı:**
```
wasOnline = true (başlangıç)
  ↓
her 30 sn: dns.lookup('rms-api-production-219d.up.railway.app')
  ↓
isOnline değişti mi?
  false → true: flushQueue() çağır
  true  → true: hiç bir şey yapma
  true  → false: konsola log yaz
  false → false: hiç bir şey yapma
```

**`flushQueue()` mantığı:**
1. `syncInProgress` flag — aynı anda iki flush çalışmaz
2. `getPendingWrites(50)` — max 50'şer batch
3. Her entry için sırayla: `railwayQueryFn(entry.query)` → başarı: `markWriteDone(id)`, hata: `markWriteFailed(id, err.message)`
4. Network error gelirse (`err.message` 'ENOTFOUND' veya 'ECONNREFUSED' içeriyorsa) → döngüyü durdur
5. `syncInProgress = false`

**Export:**
```js
module.exports = { initSyncWorker, flushQueue }
```

### Governance Kontrol Listesi
- [ ] `setInterval` yok — yalnızca `setTimeout` ile zincirleme
- [ ] `syncInProgress` guard var
- [ ] Network error tespiti: `ENOTFOUND` veya `ECONNREFUSED`
- [ ] `flushQueue` export ediliyor (test için)

---
---

## 📋 FAZ 4 — db.js LAN/Railway Router
**Model: Gemini 2.5 Pro** | Bağımlılık: FAZ 0-A | Süre: ~2 saat

### Görev
`src/lib/db.js` dosyasını güncelle. Mevcut `QueryBuilder._execute()` metodunu sararak slave/master/web modlarında farklı davran.

### Önce Oku
`X:\RMSv3\src\lib\db.js` — TAMAMEN oku. Mevcut `QueryBuilder` sınıfı ve `queryApi` fonksiyonunu anla.

### Değişiklik Yeri
`db.js` içindeki `QueryBuilder` sınıfının son `execute` metodunu bul (ya da `_execute` veya `fetch` çağrısının yapıldığı nokta). Bu noktayı `routedExecute` ile sar.

### Eklenmesi Gereken Kod

Dosyanın **başına** (import'lardan sonra):
```js
import { getTerminalRole, getSlaveConfig, getTerminalId, getBranchId, isDesktopMode } from './terminalIdentity.js'
```

`queryApi` çağrısını yapan fonksiyonu şöyle güncelle:
```js
async function routedQueryApi(body) {
  if (!isDesktopMode()) {
    // Web/dev ortamı → mevcut Railway yolu (hiç değişmez)
    return queryApi(body)
  }

  const role = getTerminalRole()

  if (role === 'slave') {
    // YAN KASA → Ana Kasanın LAN HTTP sunucusuna gönder
    const { masterIp, masterPort } = getSlaveConfig()
    const response = await fetch(`http://${masterIp}:${masterPort}/lan/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Terminal-Id': getTerminalId() ?? '',
        'X-Branch-Id': getBranchId() ?? '',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`LAN query failed: ${response.status}`)
    return response.json()
  }

  if (role === 'master') {
    // ANA KASA → Kendi LAN sunucusuna istek atmadan doğrudan IPC ile
    // (main process'te executeQuery çağrılır — FAZ 6'da IPC handler eklenir)
    // Şimdilik fallback: normal Railway yolu
    return queryApi(body)
  }

  // Pairing yapılmamış → normal Railway yolu
  return queryApi(body)
}
```

`QueryBuilder`'ın fetch/execute ettiği son noktada `queryApi(body)` → `routedQueryApi(body)` olarak değiştir.

### ÖNEMLİ KISITLAR
- `queryApi` fonksiyonunu SİLME, sadece çağrı noktasını değiştir
- `VITE_DESKTOP_MODE` env flag'i gerekmiyor — `isDesktopMode()` kendi kontrol yapıyor
- `routedQueryApi` async olmalı
- Web build'de (dev, production web) hiçbir değişiklik olmamalı — `isDesktopMode()` false döner

### Governance Kontrol Listesi
- [ ] `queryApi` fonksiyonu silindi mi? → OLMAMALI, varlığı korunmalı
- [ ] Web ortamında (`isDesktopMode() === false`) kod tamamen bypass ediliyor
- [ ] `fetch` ile LAN çağrısında `X-Terminal-Id` ve `X-Branch-Id` header'ları var
- [ ] Mevcut yorumlar ve JSDoc korundu

### Yönetici Kontrol Noktası
- `npm run dev` çalıştırınca hiçbir hata yok mu?
- `isDesktopMode()` fonksiyonu `window.__ELECTRON_TERMINAL_CONFIG__` kontrolü yapıyor mu?
- Slave modunda fetch URL'i doğru format: `http://{ip}:{port}/lan/query`?

---
---

## 📋 FAZ 5 — WebSocket Listener + Offline Status UI
**Model: Gemini Flash** | Bağımlılık: FAZ 4 | Süre: ~1.5 saat

### Görev
İki dosya oluştur: `src/hooks/useLanSync.js` ve `src/components/pos/OfflineStatusBar.jsx`

### Dosya 1: `X:\RMSv3\src\hooks\useLanSync.js` (YENİ)

```js
import { useEffect, useRef, useCallback } from 'react'
import { getTerminalRole, getSlaveConfig, getTerminalId } from '@/lib/terminalIdentity'

// Yan Kasanın Ana Kasa WS bağlantısını yönetir.
// Governance Kural 6: Reconnect için setInterval değil, setTimeout kullanılır.
export function useLanSync({ onTableUpdated } = {}) {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const onTableUpdatedRef = useRef(onTableUpdated)
  onTableUpdatedRef.current = onTableUpdated

  useEffect(() => {
    if (getTerminalRole() !== 'slave') return

    function connect() {
      try {
        const { masterIp, masterPort } = getSlaveConfig()
        const wsPort = masterPort + 1  // 4001
        const terminalId = getTerminalId()
        const ws = new WebSocket(`ws://${masterIp}:${wsPort}?terminalId=${terminalId}`)

        ws.onopen = () => {
          clearTimeout(reconnectTimerRef.current)
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'TABLE_UPDATED') {
              onTableUpdatedRef.current?.(msg.table, msg)
            }
          } catch { /* ignore */ }
        }

        ws.onclose = () => {
          // 30 sn sonra yeniden dene
          reconnectTimerRef.current = setTimeout(connect, 30_000)
        }

        ws.onerror = () => {
          ws.close()
        }

        wsRef.current = ws
      } catch {
        reconnectTimerRef.current = setTimeout(connect, 30_000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])
}
```

### Dosya 2: `X:\RMSv3\src\components\pos\OfflineStatusBar.jsx` (YENİ)

**Governance zorunlu:** Offline olduğunda kullanıcıya görünür banner.

Prop'lar:
- `isOnline` (bool)
- `queueSize` (int, default 0)
- `role` ('master' | 'slave' | null)
- `masterReachable` (bool, slave için Ana Kasa'ya erişim)

Durumlar:
1. `isOnline && queueSize === 0 && masterReachable` → null (görünmez)
2. `!isOnline` → 🔴 kırmızı banner "ÇEVRİMDIŞI MOD — {queueSize} fiş senkronize edilecek"
3. `role === 'slave' && !masterReachable` → 🟠 turuncu "Ana Kasa'ya bağlanılamıyor — Önbellek modu"
4. `queueSize > 0 && isOnline` → 🟡 sarı "Senkronize ediliyor... {queueSize} fiş kaldı"

Stil: `position: fixed, top: 0, left: 0, right: 0, zIndex: 9999` — her zaman üstte.

### Governance Kontrol Listesi
- [ ] WS reconnect `setInterval` değil `setTimeout` ile
- [ ] `onTableUpdated` ref'e alınmış (stale closure yok)
- [ ] `OfflineStatusBar` tüm 4 durumu handle ediyor
- [ ] `role === 'slave' && !masterReachable` durumu var

---
---

## 📋 FAZ 6 — main.cjs + DesktopPosApp.jsx Entegrasyonu
**Model: Gemini 2.5 Pro** | Bağımlılık: FAZ 2, 3, 5 | Süre: ~3 saat

### Görev
Mevcut `desktop/main.cjs` ve `src/DesktopPosApp.jsx` dosyalarını güncelle.

### Önce Oku
- `X:\RMSv3\desktop\main.cjs` — TAMAMEN oku
- `X:\RMSv3\src\DesktopPosApp.jsx` — TAMAMEN oku
- `X:\RMSv3\desktop\terminalConfig.cjs` (FAZ 0-A)
- `X:\RMSv3\desktop\edgeServer.cjs` (FAZ 2)
- `X:\RMSv3\desktop\syncWorker.cjs` (FAZ 3)

### Değişiklik 1: `desktop/main.cjs`

Mevcut `createWindow` fonksiyonunda `mainWindow.loadURL(${baseUrl}/pos)` satırını bul.

Eklenecekler (dosyanın başına require'lar):
```js
const { isPaired, isMaster, readConfig, getStartupRoute } = require('./terminalConfig.cjs')
const { startEdgeServer, stopEdgeServer } = require('./edgeServer.cjs')
const { initSyncWorker } = require('./syncWorker.cjs')
```

`createWindow` fonksiyonu güncelleme:
```js
// Mevcut: await mainWindow.loadURL(`${baseUrl}/pos`)
// Yeni:
const startRoute = isPaired() ? getStartupRoute() : '/pairing'
await mainWindow.loadURL(`${baseUrl}${startRoute}`)
```

`app.whenReady()` bloğunda:
```js
app.whenReady().then(async () => {
  try {
    // Mevcut static server başlatma kodu korunur

    if (isPaired() && isMaster()) {
      // Railway pool bu aşamada FAZ 6 için basit fetch wrapper kullanılır
      const railwayBaseUrl = process.env.VITE_API_URL || 'https://rms-api-production-219d.up.railway.app'
      async function railwayQueryFn(body) {
        const res = await fetch(`${railwayBaseUrl}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        return res.json()
      }
      startEdgeServer(railwayQueryFn)
      initSyncWorker(railwayQueryFn)
    }

    // Terminal config'i renderer'a inject et (preload olmadan window global ile)
    // Bu FAZ 6'nın kritik kısmı — aşağıya bak
    const config = readConfig()
    // ...

    await createStaticServer()
    await createWindow()  // içinde getStartupRoute() kullanılır
  } catch (error) {
    // mevcut error dialog kodu
  }
})
```

**Terminal Config Inject (Renderer'a):** `mainWindow` oluşturulduktan sonra:
```js
mainWindow.webContents.on('did-finish-load', () => {
  const config = readConfig()
  if (config) {
    mainWindow.webContents.executeJavaScript(
      `window.__ELECTRON_TERMINAL_CONFIG__ = ${JSON.stringify(config)};
       window.__DESKTOP_MODE__ = true;`
    )
  }
})
```

**IPC Handlers ekle:**
```js
const { ipcMain } = require('electron')
ipcMain.handle('terminal:getConfig', () => readConfig())
ipcMain.handle('queue:getSize', () => {
  try {
    const { getQueueSize } = require('./sqliteStore.cjs')
    return getQueueSize()
  } catch { return 0 }
})
```

**`window-all-closed` handler güncelleme:**
```js
app.on('window-all-closed', () => {
  stopEdgeServer()
  // ... mevcut kod
})
```

### Değişiklik 2: `src/DesktopPosApp.jsx`

**Import ekle:**
```js
import { getStartupPath, readTerminalConfig } from '@/lib/terminalIdentity'
import { PairingScreen } from '@/components/pos/PairingScreen'
```

**`DesktopPosShell` fonksiyonunu güncelle:**
```jsx
function DesktopPosShell() {
  const startPath = getStartupPath()

  return (
    <>
      <RouteActivityTracker />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to={startPath} replace />} />
          <Route path="/pos"         element={<POS />} />
          <Route path="/garson"      element={<Garson />} />
          <Route path="/pos-masa"    element={<POSMasa />} />
          <Route path="/pos-masalar" element={<POSMasalar />} />
          <Route path="*"            element={<Navigate to={startPath} replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
```

**`PairingGuard` bileşeni ekle** (DesktopPosApp'ten önce):
```jsx
function PairingGuard({ children }) {
  const config = readTerminalConfig()
  const isPaired = Boolean(config?.terminalId && config?.branchId && config?.terminalRole && config?.screenMode)

  if (!isPaired) {
    return <PairingScreen onComplete={() => window.location.reload()} />
  }

  return children
}
```

**`DesktopPosApp` içine `<PairingGuard>` sar:**
```jsx
<WorkspaceGate>
  <PairingGuard>
    <DesktopPosShell />
  </PairingGuard>
</WorkspaceGate>
```

### Governance Kontrol Listesi
- [ ] `main.cjs` içinde mevcut static server ve window oluşturma kodu bozulmadı
- [ ] `executeJavaScript` ile config inject ediliyor
- [ ] `stopEdgeServer()` yalnızca `isMaster()` durumunda (veya try-catch ile)
- [ ] `DesktopPosApp.jsx` içinde mevcut `<Routes>` korundu, sadece genişletildi
- [ ] `PairingGuard` `screenMode` kontrolü yapıyor

### Yönetici Kontrol Noktası
- `npm run build:desktop:web && npm run desktop:start` çalışıyor mu?
- Pairing yapılmamış cihazda `PairingScreen` görünüyor mu?
- Config inject edildikten sonra `window.__ELECTRON_TERMINAL_CONFIG__` erişilebilir mi?

---
---

## 📋 FAZ 7 — created_by_terminal Enjeksiyonu
**Model: Gemini Flash** | Bağımlılık: FAZ 0-C, FAZ 0-A | Süre: ~1 saat

### Görev
POS fiş yazımında `created_by_terminal` alanının otomatik enjekte edilmesi.

### Değişiklik Yeri
`X:\RMSv3\src\lib\terminalIdentity.js` (FAZ 0-A çıktısı) — fonksiyon ekle.

**Eklenecek fonksiyon:**
```js
const TERMINAL_TRACKED_TABLES = new Set([
  'sales',
  'sale_lines',
  'inventory_movements',
])

export function injectTerminalFields(tableName, data) {
  const terminalId = getTerminalId()
  if (!terminalId) return data
  if (!TERMINAL_TRACKED_TABLES.has(tableName)) return data

  if (Array.isArray(data)) {
    return data.map(row => ({ ...row, created_by_terminal: terminalId }))
  }
  return { ...data, created_by_terminal: terminalId }
}
```

### db.js'e Entegrasyon
`X:\RMSv3\src\lib\db.js` içinde INSERT ve UPSERT işlemlerinin `data` parametresi build edildiği yerde:

```js
import { injectTerminalFields } from './terminalIdentity.js'

// INSERT/UPSERT body hazırlanırken:
const enrichedData = injectTerminalFields(body.table, body.data)
const finalBody = { ...body, data: enrichedData }
```

Bu enrichment yalnızca `isDesktopMode() && operation !== 'select'` durumunda yapılmalı.

### Governance Kontrol Listesi
- [ ] `injectTerminalFields` yalnızca 3 tabloyu etkiliyor
- [ ] `getTerminalId()` null ise data değişmeden döner
- [ ] Fonksiyon `terminalIdentity.js`'e eklendi, yeni dosya oluşturulmadı
- [ ] Web build'de `isDesktopMode()` false olduğundan injection hiç çalışmaz

---
---

## 📋 FAZ 8 — Auto-Updater (GitHub Releases)
**Model: Gemini Flash** | Bağımlılık: FAZ 6 | Süre: ~1 saat

### Görev
`desktop/updater.cjs` oluştur ve `desktop/main.cjs`'e entegre et. `package.json` build config'ini güncelle.

### Ön Kontrol
`electron-updater` `package.json`'da var mı? Değilse devDependencies'e ekle:
```
"electron-updater": "^6.1.8"
```

### Dosya 1: `X:\RMSv3\desktop\updater.cjs` (YENİ)

```js
const { autoUpdater } = require('electron-updater')

function initAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info)
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:ready', info)
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err.message)
  })

  // GitHub Releases — repo ve owner uygulamaya göre ayarlanacak
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'muzafferseyranli',
    repo: 'SuitableRMS-Releases',
    private: false,
  })

  // Uygulama açılışında bir kez kontrol et
  autoUpdater.checkForUpdates().catch(err => {
    console.warn('[Updater] Check failed:', err.message)
  })
}

module.exports = { initAutoUpdater, autoUpdater }
```

### `desktop/main.cjs` Eklentisi

`app.whenReady()` bloğunda, pencere oluşturulduktan sonra:
```js
const { initAutoUpdater, autoUpdater } = require('./updater.cjs')

// mainWindow oluşturulduktan sonra:
initAutoUpdater(mainWindow)

// IPC: kullanıcı "Şimdi yükle" dediğinde
ipcMain.handle('update:apply', () => autoUpdater.quitAndInstall(false, true))
```

### `package.json` build Config Güncellemesi

```json
"build": {
  "publish": {
    "provider": "github",
    "owner": "muzafferseyranli",
    "repo": "SuitableRMS-Releases"
  },
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] },
      { "target": "portable", "arch": ["x64"] }
    ],
    "signAndEditExecutable": false
  },
  "nsis": {
    "oneClick": true,
    "allowToChangeInstallationDirectory": false,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  },
  "files": [
    "dist-desktop-web/**/*",
    "desktop/**/*.cjs",
    "node_modules/better-sqlite3/**/*",
    "node_modules/electron-updater/**/*",
    "node_modules/ws/**/*",
    "package.json"
  ]
}
```

### Governance Kontrol Listesi
- [ ] `autoInstallOnAppQuit = false` — kullanıcı onayı bekleniyor
- [ ] `update:apply` IPC handler var
- [ ] `package.json` `files` array'inde `better-sqlite3` ve `ws` dahil
- [ ] `nsis` target eklendi (portable'da auto-updater çalışmaz)

---
---

## 🔍 Yönetici Kontrol Protokolü

Her faz tamamlandıktan sonra şu kontroller yapılır:

```
FAZ 0-A → 0-B → 0-C paralel başlayabilir
FAZ 1   → FAZ 0-A tamamlanınca
FAZ 2   → FAZ 1 tamamlanınca
FAZ 3   → FAZ 1 tamamlanınca (FAZ 2 ile paralel)
FAZ 4   → FAZ 0-A tamamlanınca
FAZ 5   → FAZ 4 tamamlanınca
FAZ 6   → FAZ 2, 3, 5 tamamlanınca
FAZ 7   → FAZ 0-A, 0-C tamamlanınca
FAZ 8   → FAZ 6 tamamlanınca
```

**Son Entegrasyon Testi:**
1. `npm run dev` — hata yok, web POS çalışıyor
2. `npm run build:desktop:web` — build başarılı
3. `npm run desktop:start` — Electron açılıyor
4. Pairing yapılmamış → PairingScreen görünüyor
5. 4 adım tamamlanıyor → screenMode='pos' → `/pos` açılıyor
6. Garson moduyla test → `/garson` açılıyor

