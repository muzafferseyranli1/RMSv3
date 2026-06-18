# SuitableRMS POS — LAN Master-Slave Mimari Planı
> **Son Güncelleme:** 2026-05-29 v2.1 — POS/Garson Ekran Modu Seçimi Eklendi

> **Revizyon:** 2026-05-29 v2.0 — Multi-Terminal LAN Edge Server Mimarisi  
> **Mod:** Read-Only Analiz + Geliştirme Planı  
> **Kararlar:** Electron ✅ | GitHub Releases ✅ | 24h offline ✅ | Şifreleme yok ✅ | 4 terminal multi-instance ✅

---

## 🏛️ Mimari Genel Bakış

```
┌─────────────────────────────────────────────────────────────────┐
│                        ŞUBE LAN (192.168.x.x)                   │
│                                                                   │
│  ┌──────────────────────────────────────────┐                    │
│  │         ANA KASA (Master)                │                    │
│  │   Electron + Node.js + better-sqlite3    │  ←── branch_id    │
│  │                                          │      terminal_id  │
│  │  ┌─────────────────────────────────┐     │                    │
│  │  │  Local Edge Server (Port 4000)  │     │                    │
│  │  │  ├── POST /lan/query     (HTTP) │     │                    │
│  │  │  ├── GET  /lan/health    (HTTP) │     │                    │
│  │  │  └── ws://...:4001      (WS)   │     │                    │
│  │  └─────────────────────────────────┘     │                    │
│  │                                          │                    │
│  │  ┌─────────────────────────────────┐     │                    │
│  │  │  SQLite (better-sqlite3)        │     │                    │
│  │  │  ├── catalog (menü, masa, ...)  │     │                    │
│  │  │  ├── offline_queue             │     │                    │
│  │  │  └── terminal_registry         │     │                    │
│  │  └─────────────────────────────────┘     │                    │
│  │                                          │                    │
│  │  [Sync Worker - background thread]       │                    │
│  │   ↕ Railway Postgres (internet var ise) │                    │
│  └──────────────────────────────────────────┘                    │
│           ↑ WebSocket push / ↓ HTTP query                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  YAN KASA 1 │  │  YAN KASA 2 │  │  YAN KASA 3 │              │
│  │  Electron   │  │  Electron   │  │  Electron   │              │
│  │  (Slave)    │  │  (Slave)    │  │  (Slave)    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │ internet
                              ↓
                    ┌──────────────────┐
                    │  Railway Postgres │
                    │  (tek authority) │
                    └──────────────────┘
```

---

## 📦 Dosya Mimarisi — Yeni & Değişen Dosyalar

```
X:\RMSv3\
├── desktop/
│   ├── main.cjs                    [DEĞİŞİR] — Edge server başlatma, IPC, ekran modu
│   ├── updater.cjs                 [YENİ]    — electron-updater / GitHub Releases
│   ├── edgeServer.cjs              [YENİ]    — Express + WebSocket LAN sunucusu
│   ├── sqliteStore.cjs             [YENİ]    — better-sqlite3 katmanı
│   ├── syncWorker.cjs              [YENİ]    — Railway sync worker (event-based)
│   └── terminalConfig.cjs          [YENİ]    — Terminal config okuma/yazma (JSON dosyası)
│
├── src/
│   ├── lib/
│   │   ├── db.js                   [DEĞİŞİR] — LAN/Railway yönlendirme wrapper
│   │   └── terminalIdentity.js     [YENİ]    — terminal_id, branch_id, role, screenMode
│   │
│   ├── components/
│   │   └── pos/
│   │       ├── PairingScreen.jsx   [YENİ]    — Aktivasyon + rol + EKRAN MODU seçimi
│   │       ├── OfflineStatusBar.jsx [YENİ]   — Offline banner (governance zorunlu)
│   │       └── UpdatePromptBanner.jsx [YENİ] — Auto-updater UI
│   │
│   └── DesktopPosApp.jsx           [DEĞİŞİR] — Pairing guard + screen mode routing
│
├── migrations/
│   └── 020_pos_terminal_registry.sql [YENİ] — Railway'de terminal kaydı
│
└── terminal-config.json            [YENİ]    — Cihaza özel kalıcı config (gitignore'da)
```

---

## AŞAMA 0 — Terminal Kimliği ve Pairing Sistemi (~2 gün)

### 0.1 — `terminal-config.json` Yapısı

Her kurulu cihazda `app.getPath('userData')/terminal-config.json` dosyası oluşturulur:

```json
{
  "terminalId": "uuid-v4-benzersiz-cihaz-id",
  "terminalRole": "master",
  "screenMode": "pos",
  "branchId": "uuid-branch",
  "branchName": "Kadıköy Şubesi",
  "activationCode": "SUT-8492-XKL",
  "masterLanIp": null,
  "masterLanPort": 4000,
  "pairedAt": "2026-05-29T14:00:00.000Z",
  "appVersion": "2.1.0"
}
```

Yan Kasa — Garson Modu için:
```json
{
  "terminalId": "uuid-v4-benzersiz-yan-kasa",
  "terminalRole": "slave",
  "screenMode": "garson",
  "branchId": "uuid-branch",
  "masterLanIp": "192.168.1.50",
  "masterLanPort": 4000,
  "pairedAt": "2026-05-29T14:05:00.000Z"
}
```

**`screenMode` değerleri:**

| Değer | Açıklama | Başlangıç Rotası |
|---|---|---|
| `pos` | Hızlı satış POS ekranı | `/pos` |
| `garson` | Masa servisi garson ekranı | `/garson` |
| `pos-masa` | Masa bazlı POS (tek masa) | `/pos-masa` |
| `kds` | Mutfak ekranı (ileride) | `/kds` |

### 0.2 — `desktop/terminalConfig.cjs` (YENİ DOSYA)

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
  return Boolean(cfg?.terminalId && cfg?.branchId && cfg?.terminalRole)
}

function isMaster() {
  return readConfig()?.terminalRole === 'master'
}

// Ekran modu: 'pos' | 'garson' | 'pos-masa' | 'pos-masalar'
function getScreenMode() {
  return readConfig()?.screenMode ?? 'pos'
}

// Başlangıç URL → Electron window.loadURL() için
function getStartupRoute() {
  const MODE_ROUTES = {
    pos:         '/pos',
    garson:      '/garson',
    'pos-masa':  '/pos-masa',
    'pos-masalar': '/pos-masalar',
  }
  return MODE_ROUTES[getScreenMode()] ?? '/pos'
}

module.exports = { readConfig, writeConfig, isPaired, isMaster, getScreenMode, getStartupRoute, CONFIG_FILE }
```

### 0.3 — `src/lib/terminalIdentity.js` (YENİ DOSYA)

```js
// Electron IPC üzerinden terminal config'i renderer'a aktaran bridge

const TERMINAL_CONFIG_CACHE_KEY = 'suitable_terminal_config_v1'

export function readTerminalConfig() {
  try {
    if (window.__ELECTRON_TERMINAL_CONFIG__) return window.__ELECTRON_TERMINAL_CONFIG__
    const raw = sessionStorage.getItem(TERMINAL_CONFIG_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function getTerminalId() {
  return readTerminalConfig()?.terminalId ?? null
}

export function getTerminalRole() {
  return readTerminalConfig()?.terminalRole ?? null  // 'master' | 'slave' | null
}

export function isMasterTerminal() {
  return getTerminalRole() === 'master'
}

export function getSlaveConfig() {
  const cfg = readTerminalConfig()
  return cfg?.terminalRole === 'slave' ? {
    masterIp: cfg.masterLanIp,
    masterPort: cfg.masterLanPort ?? 4000,
  } : null
}

export function getBranchId() {
  return readTerminalConfig()?.branchId ?? null
}

// Ekran modu: 'pos' | 'garson' | 'pos-masa' | 'pos-masalar'
export function getScreenMode() {
  return readTerminalConfig()?.screenMode ?? 'pos'
}

// Başlangıç rota— DesktopPosApp.jsx için
export function getStartupPath() {
  const SCREEN_PATHS = {
    pos:           '/pos',
    garson:        '/garson',
    'pos-masa':    '/pos-masa',
    'pos-masalar': '/pos-masalar',
  }
  return SCREEN_PATHS[getScreenMode()] ?? '/pos'
}
```

### 0.4 — `src/components/pos/PairingScreen.jsx` (YENİ DOSYA)

**4 adımlı wizard** — Ekran modu seçimi eklendi:

**Adım 1 — Aktivasyon Kodu:**
```
┌─────────────────────────────────────────────────────────┐
│  🔗 Terminal Aktivasyonu                                 │
│                                                          │
│  Web panelinden üretilen aktivasyon kodunu girin:        │
│  ┌─────────────────────────────────┐                     │
│  │  SUT - ____ - ___              │                     │
│  └─────────────────────────────────┘                     │
│                                                          │
│  [Doğrula →]                                            │
│                                                          │
│  ℹ️  Kodu web panelinde Ayarlar > Terminal Yönetimi     │
│      bölümünden üretebilirsiniz.                         │
└─────────────────────────────────────────────────────────┘
```

**Adım 2 — Rol Seçimi (Ana Kasa / Yan Kasa):**
```
┌─────────────────────────────────────────────────────────┐
│  📍 Kadıköy Şubesi — Terminal Rolü                      │
│                                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐   │
│  │  👑 ANA KASA        │  │  🖥️  YAN KASA           │   │
│  │                     │  │                          │   │
│  │  İnternet bağlantısı│  │  Sadece LAN üzerinden   │   │
│  │  üzerinden Railway  │  │  Ana Kasa ile çalışır   │   │
│  │  ile haberleşir.    │  │                          │   │
│  │  SQLite yerel DB    │  │  Ana Kasanın IP adresi  │   │
│  │  çalıştırır.        │  │  girilmesi gerekir.     │   │
│  └─────────────────────┘  └─────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Adım 3 (Yan Kasa ise) — Master IP:**
```
┌─────────────────────────────────────────────────────────┐
│  🌐 Ana Kasanın LAN IP Adresi                           │
│                                                          │
│  ┌──────────────────────────────┐                        │
│  │  192.168.____.____ :4000    │                        │
│  └──────────────────────────────┘                        │
│                                                          │
│  [Bağlantıyı Test Et]  ✅ Bağlantı başarılı             │
│  [Devam →]                                              │
└─────────────────────────────────────────────────────────┘
```

**Adım 4 — Ekran Modu Seçimi (TÜM cihazlar için):**
```
┌─────────────────────────────────────────────────────────┐
│  📺 Bu Ekran Ne Olarak Çalışacak?                       │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ 🧾 POS        │  │ 🍽️ GARSON   │  │ 📋 MASALAR  │   │
│  │               │  │              │  │              │   │
│  │ Hızlı satış  │  │  Masa servis │  │  Masa listesi│   │
│  │ kasası ekranı │  │  garson modu │  │  genel görün.│   │
│  │               │  │              │  │              │   │
│  │  /pos         │  │  /garson     │  │  /pos-masalar│   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                          │
│  ℹ️  Bu seçim sonradan Ayarlar menüsünden değiştiri-    │
│      lebilir, uygulama yeniden başlatılır.               │
│                                                          │
│  [Kurulumu Tamamla →]                                   │
└─────────────────────────────────────────────────────────┘
```

**Tipik şube kurulum senaryosu (4 terminal):**

| Cihaz | Rol | Ekran Modu | Başlangıç URL |
|---|---|---|---|
| Kasa 1 | Ana Kasa (Master) | `pos` | `/pos` |
| Kasa 2 | Yan Kasa (Slave) | `pos` | `/pos` |
| Tablet 1 | Yan Kasa (Slave) | `garson` | `/garson` |
| Tablet 2 | Yan Kasa (Slave) | `garson` | `/garson` |

### 0.5 — Railway Migration: Terminal Kayıt Tablosu

`migrations/020_pos_terminal_registry.sql`:

```sql
-- Terminal aktivasyon kodları ve kayıtlar
CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  terminal_id     UUID NOT NULL UNIQUE,           -- Cihaz UUID (local)
  branch_id       UUID NOT NULL,                  -- FK → branches
  activation_code TEXT NOT NULL UNIQUE,           -- SUT-XXXX-XXX format
  terminal_role   TEXT NOT NULL DEFAULT 'slave'
                  CHECK (terminal_role IN ('master', 'slave')),
  terminal_name   TEXT,                           -- "Kasa 1", "Kasa 2"
  last_seen_at    TIMESTAMPTZ,
  app_version     TEXT,
  is_active       BOOLEAN DEFAULT true NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Aktivasyon kodu üretme fonksiyonu (web panelden çağrılır)
CREATE OR REPLACE FUNCTION generate_terminal_activation_code(p_branch_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Format: SUT-XXXX-XXX (alfanumerik, büyük harf)
    v_code := 'SUT-' ||
      upper(substring(md5(random()::text), 1, 4)) || '-' ||
      upper(substring(md5(random()::text), 1, 3));
    
    SELECT EXISTS(SELECT 1 FROM pos_terminals WHERE activation_code = v_code)
    INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;
```

---

## AŞAMA 1 — SQLite Yerel Veritabanı (Ana Kasa) (~2 gün)

### 1.1 — `desktop/sqliteStore.cjs` (YENİ DOSYA)

```js
const Database = require('better-sqlite3')
const { app } = require('electron')
const path = require('path')

const DB_PATH = path.join(app.getPath('userData'), 'pos-local.db')
let db = null

function getDb() {
  if (db) return db
  db = new Database(DB_PATH, { verbose: null })
  db.pragma('journal_mode = WAL')  // Eşzamanlı okuma/yazma
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  initSchema()
  return db
}

function initSchema() {
  db.exec(`
    -- Menü kataloğu cache (TTL tabanlı)
    CREATE TABLE IF NOT EXISTS catalog_cache (
      cache_key   TEXT PRIMARY KEY,
      branch_id   TEXT NOT NULL,
      table_name  TEXT NOT NULL,
      data_json   TEXT NOT NULL,
      fetched_at  INTEGER NOT NULL,  -- epoch ms
      ttl_ms      INTEGER NOT NULL DEFAULT 1800000  -- 30 dk
    );

    -- Offline yazım kuyruğu (sadece Ana Kasada)
    CREATE TABLE IF NOT EXISTS offline_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      query_json  TEXT NOT NULL,       -- tam QueryBuilder body
      created_at  INTEGER NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error  TEXT,
      status      TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'done', 'failed')),
      terminal_id TEXT NOT NULL        -- hangi kasadan geldi
    );

    -- Şube terminallerinin kaydı (LAN discovery)
    CREATE TABLE IF NOT EXISTS terminal_registry (
      terminal_id   TEXT PRIMARY KEY,
      terminal_role TEXT NOT NULL,
      terminal_name TEXT,
      lan_ip        TEXT,
      last_seen_at  INTEGER NOT NULL,
      is_connected  INTEGER NOT NULL DEFAULT 0  -- boolean
    );

    -- Açık masa biletleri (yerel kopya — settings tablosunun mirror'ı)
    CREATE TABLE IF NOT EXISTS open_tickets_mirror (
      branch_id    TEXT NOT NULL,
      table_key    TEXT NOT NULL,
      ticket_json  TEXT NOT NULL,
      updated_at   INTEGER NOT NULL,
      PRIMARY KEY (branch_id, table_key)
    );
  `)
}

// ------- Catalog Cache API -------

function setCatalogCache(cacheKey, branchId, tableName, data, ttlMs = 1800000) {
  const stmt = getDb().prepare(`
    INSERT OR REPLACE INTO catalog_cache (cache_key, branch_id, table_name, data_json, fetched_at, ttl_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  stmt.run(cacheKey, branchId, tableName, JSON.stringify(data), Date.now(), ttlMs)
}

function getCatalogCache(cacheKey) {
  const row = getDb().prepare('SELECT * FROM catalog_cache WHERE cache_key = ?').get(cacheKey)
  if (!row) return null
  if (Date.now() - row.fetched_at > row.ttl_ms) return null  // TTL expired
  return JSON.parse(row.data_json)
}

// ------- Offline Queue API -------

function enqueueWrite(queryBody, terminalId) {
  getDb().prepare(`
    INSERT INTO offline_queue (query_json, created_at, terminal_id)
    VALUES (?, ?, ?)
  `).run(JSON.stringify(queryBody), Date.now(), terminalId)
}

function getPendingWrites(limit = 50) {
  return getDb().prepare(`
    SELECT * FROM offline_queue
    WHERE status = 'pending'
    ORDER BY id ASC
    LIMIT ?
  `).all(limit).map(row => ({ ...row, query: JSON.parse(row.query_json) }))
}

function markWriteDone(id) {
  getDb().prepare(`UPDATE offline_queue SET status = 'done' WHERE id = ?`).run(id)
}

function markWriteFailed(id, error) {
  getDb().prepare(`
    UPDATE offline_queue
    SET status = CASE WHEN retry_count >= 5 THEN 'failed' ELSE 'pending' END,
        retry_count = retry_count + 1,
        last_error = ?
    WHERE id = ?
  `).run(String(error).slice(0, 500), id)
}

function getQueueSize() {
  return getDb().prepare(`SELECT COUNT(*) as n FROM offline_queue WHERE status = 'pending'`).get().n
}

module.exports = {
  getDb, setCatalogCache, getCatalogCache,
  enqueueWrite, getPendingWrites, markWriteDone, markWriteFailed, getQueueSize
}
```

### 1.2 — Cache TTL Politikası

| Tablo | TTL | Açıklama |
|---|---|---|
| `sale_items` | 30 dk | Menü kataloğu (ürünler, fiyatlar) |
| `sale_categories` | 60 dk | Menü kategorileri |
| `settings` (layout) | 15 dk | Masa layout |
| `pos_table_halls/sections/tables` | 60 dk | Masa kataloğu |
| `sales_channels` | 60 dk | Kanal bilgisi |
| `settings` (open_tickets) | 2 dk | Açık masa biletleri (sık değişir) |
| `taxes` | 120 dk | Vergi tanımları |

---

## AŞAMA 2 — Local Edge Server (Ana Kasa HTTP + WebSocket) (~3 gün)

### 2.1 — `desktop/edgeServer.cjs` (YENİ DOSYA)

```js
const express = require('express')
const http = require('http')
const { WebSocketServer } = require('ws')
const { getCatalogCache, setCatalogCache, enqueueWrite, getQueueSize } = require('./sqliteStore.cjs')
const { readConfig } = require('./terminalConfig.cjs')

const EDGE_HTTP_PORT = 4000
const EDGE_WS_PORT = 4001

let httpServer = null
let wss = null
const connectedSlaves = new Map()  // terminalId → ws

// ── HTTP Router ──────────────────────────────────────────────────

function createEdgeApp(railwayQueryFn) {
  const app = express()
  app.use(express.json({ limit: '5mb' }))

  // LAN içi auth: sadece aynı branch_id'ye sahip terminaller
  app.use('/lan', (req, res, next) => {
    const terminalId = req.headers['x-terminal-id']
    const branchId = req.headers['x-branch-id']
    const masterConfig = readConfig()
    if (branchId !== masterConfig.branchId) {
      return res.status(403).json({ error: 'Branch mismatch' })
    }
    req.terminalId = terminalId
    next()
  })

  // Sağlık kontrolü (Yan Kasa bağlantı testinde kullanır)
  app.get('/lan/health', (req, res) => {
    res.json({
      ok: true,
      role: 'master',
      branchId: readConfig().branchId,
      queueSize: getQueueSize(),
      timestamp: Date.now(),
    })
  })

  // Ana sorgu endpoint'i (Yan Kasalar buraya istek atar)
  app.post('/lan/query', async (req, res) => {
    const { table, operation, select, filters, data, options } = req.body
    const isRead = operation === 'select'
    const cacheKey = `${table}:${JSON.stringify(filters ?? [])}:${select ?? '*'}`

    try {
      if (isRead) {
        // 1. SQLite cache'e bak
        const cached = getCatalogCache(cacheKey)
        if (cached) return res.json({ data: cached, error: null, source: 'sqlite_cache' })

        // 2. Railway'e ilet
        const result = await railwayQueryFn(req.body)
        if (!result.error && result.data) {
          const ttl = getTtlForTable(table)
          setCatalogCache(cacheKey, readConfig().branchId, table, result.data, ttl)
        }
        return res.json({ ...result, source: 'railway' })
      } else {
        // Yazım işlemi: Railway'e gönder, başarısızsa kuyruğa al
        try {
          const result = await railwayQueryFn(req.body)
          // Başarılı → Tüm Yan Kasalara bildir (WebSocket push)
          broadcastTableUpdate(table, req.terminalId)
          return res.json(result)
        } catch (err) {
          // Offline → kuyruğa al, optimistic OK döndür
          enqueueWrite(req.body, req.terminalId)
          broadcastTableUpdate(table, req.terminalId)  // local mirror update
          return res.json({ data: null, error: null, queued: true })
        }
      }
    } catch (err) {
      return res.status(500).json({ error: { message: err.message } })
    }
  })

  return app
}

// ── WebSocket Server ──────────────────────────────────────────────

function createWsServer() {
  wss = new WebSocketServer({ port: EDGE_WS_PORT })

  wss.on('connection', (ws, req) => {
    const terminalId = new URL(req.url, 'ws://localhost').searchParams.get('terminalId')
    if (terminalId) {
      connectedSlaves.set(terminalId, ws)
      console.log(`[WS] Yan Kasa bağlandı: ${terminalId} (Toplam: ${connectedSlaves.size})`)
    }

    ws.on('close', () => {
      connectedSlaves.delete(terminalId)
      console.log(`[WS] Yan Kasa ayrıldı: ${terminalId}`)
    })
  })
}

// Tüm bağlı Yan Kasalara tablo güncelleme sinyali gönder
function broadcastTableUpdate(table, sourceTerminalId) {
  const message = JSON.stringify({
    type: 'TABLE_UPDATED',
    table,
    sourceTerminalId,
    timestamp: Date.now(),
  })

  for (const [terminalId, ws] of connectedSlaves.entries()) {
    if (ws.readyState === 1) {  // OPEN
      ws.send(message)
    }
  }
}

// TTL tablosu
function getTtlForTable(table) {
  const TTL = {
    sale_items: 30 * 60 * 1000,
    sale_categories: 60 * 60 * 1000,
    pos_table_halls: 60 * 60 * 1000,
    pos_table_sections: 60 * 60 * 1000,
    pos_tables: 60 * 60 * 1000,
    sales_channels: 60 * 60 * 1000,
    taxes: 120 * 60 * 1000,
    settings: 2 * 60 * 1000,  // Masa biletleri için kısa TTL
  }
  return TTL[table] ?? 15 * 60 * 1000
}

function startEdgeServer(railwayQueryFn) {
  const app = createEdgeApp(railwayQueryFn)
  httpServer = http.createServer(app)
  httpServer.listen(EDGE_HTTP_PORT, '0.0.0.0', () => {
    console.log(`[Edge] HTTP dinleniyor: 0.0.0.0:${EDGE_HTTP_PORT}`)
  })
  createWsServer()
  return { httpServer, wss, broadcastTableUpdate }
}

function stopEdgeServer() {
  httpServer?.close()
  wss?.close()
}

module.exports = { startEdgeServer, stopEdgeServer, broadcastTableUpdate }
```

---

## AŞAMA 3 — Sync Worker (Ana Kasa → Railway) (~1.5 gün)

### 3.1 — `desktop/syncWorker.cjs` (YENİ DOSYA)

```js
const { getPendingWrites, markWriteDone, markWriteFailed } = require('./sqliteStore.cjs')

// Governance Kural 6: Polling YOK — sadece online event ve uygulama başlangıcı
let syncInProgress = false
let railwayQueryFn = null

function initSyncWorker(queryFn) {
  railwayQueryFn = queryFn
  // Online event: Node.js tarafında net/dns modülü ile
  monitorInternetConnection()
}

// DNS lookup ile bağlantı kontrolü (interval değil, event-driven)
function monitorInternetConnection() {
  const dns = require('dns')
  let wasOnline = true

  function check() {
    dns.lookup('rms-api-production-219d.up.railway.app', (err) => {
      const isOnline = !err
      if (isOnline && !wasOnline) {
        console.log('[Sync] İnternet bağlantısı geldi, kuyruk eritiliyor...')
        flushQueue()
      }
      wasOnline = isOnline
      // 30 saniyelik kontrol (Kural 6: uzun aralıklar)
      setTimeout(check, 30_000)
    })
  }

  check()
}

async function flushQueue() {
  if (syncInProgress) return
  syncInProgress = true

  const pending = getPendingWrites(50)
  console.log(`[Sync] Kuyrukta ${pending.length} yazım var`)

  for (const entry of pending) {
    try {
      await railwayQueryFn(entry.query)
      markWriteDone(entry.id)
    } catch (err) {
      markWriteFailed(entry.id, err.message)
      // Ağ hatası → diğerlerini de deneme, dur
      if (err.message.includes('network') || err.message.includes('fetch')) break
    }
  }

  syncInProgress = false
}

module.exports = { initSyncWorker, flushQueue }
```

---

## AŞAMA 4 — `src/lib/db.js` LAN/Railway Router (~1 gün)

Mevcut `db.js`'deki `QueryBuilder._execute()` metodunu genişlet:

```js
// db.js içine eklenecek import
import { getTerminalRole, getSlaveConfig, getTerminalId } from './terminalIdentity.js'

// Mevcut queryApi() fonksiyonunun ÜSTÜNE eklenecek wrapper:
async function routedQueryApi(body) {
  const role = getTerminalRole()

  if (role === 'slave') {
    // YAN KASA → Ana Kasanın LAN sunucusuna gönder
    const { masterIp, masterPort } = getSlaveConfig()
    const lanUrl = `http://${masterIp}:${masterPort}/lan/query`
    const response = await fetch(lanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Terminal-Id': getTerminalId(),
        'X-Branch-Id': getBranchId(),
      },
      body: JSON.stringify(body),
    })
    return response.json()
  }

  if (role === 'master') {
    // ANA KASA → Kendi içinde işle (edgeServer'dan geçmeden direkt)
    // Ana Kasa web renderer'ı, kendi edgeServer'ına istek atmaz;
    // SQLite cache ve railway aynı process içinde çözülür.
    return masterLocalQuery(body)
  }

  // Pairing henüz yapılmamış veya web ortamı → Mevcut Railway yolu
  return queryApi(body)
}

// Desktop modunda ana queryApi yerine routedQueryApi kullan
const DESKTOP_MODE = import.meta.env.VITE_DESKTOP_MODE === 'true'

// QueryBuilder._execute() güncellenir:
_execute() {
  const queryBody = { ... }  // mevcut yapı
  return DESKTOP_MODE ? routedQueryApi(queryBody) : queryApi(queryBody)
}
```

---

## AŞAMA 5 — WebSocket Listener (Yan Kasa Gerçek Zamanlı Güncelleme) (~1 gün)

### 5.1 — `src/hooks/useLanSync.js` (YENİ DOSYA)

```js
import { useEffect, useRef } from 'react'
import { getTerminalRole, getSlaveConfig, getTerminalId } from '@/lib/terminalIdentity'

// Yan Kasanın Ana Kasa WebSocket bağlantısını yönetir
export function useLanSync({ onTableUpdated } = {}) {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  useEffect(() => {
    if (getTerminalRole() !== 'slave') return

    function connect() {
      const { masterIp, masterPort } = getSlaveConfig()
      const wsPort = masterPort + 1  // 4001
      const terminalId = getTerminalId()
      const ws = new WebSocket(`ws://${masterIp}:${wsPort}?terminalId=${terminalId}`)

      ws.onopen = () => {
        console.log('[LAN] Ana Kasa WS bağlantısı kuruldu')
        clearTimeout(reconnectTimerRef.current)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'TABLE_UPDATED') {
            // İlgili tabloyu dinleyen bileşenleri uyar
            onTableUpdated?.(msg.table, msg)
            // Örn: masa biletleri güncellendi → POS ekranını yenile
          }
        } catch { /* ignore */ }
      }

      ws.onclose = () => {
        // Yeniden bağlan (30 sn sonra — Kural 6)
        reconnectTimerRef.current = setTimeout(connect, 30_000)
      }

      wsRef.current = ws
    }

    connect()
    return () => {
      wsRef.current?.close()
      clearTimeout(reconnectTimerRef.current)
    }
  }, [])
}
```

### 5.2 — `src/components/pos/OfflineStatusBar.jsx` (YENİ DOSYA, Governance Zorunlu)

```jsx
// antigravityrules.md Madde 1 istisnası: Offline modda kullanıcıya
// AÇIK VE BELGİN uyarı gösterme zorunluluğu

export function OfflineStatusBar({ queueSize = 0, isOnline = true, role = 'master' }) {
  if (isOnline && queueSize === 0) return null

  if (!isOnline) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#dc2626', color: 'white', textAlign: 'center',
        padding: '8px 16px', fontWeight: 700, fontSize: '0.875rem'
      }}>
        🔴 ÇEVRİMDIŞI MOD — {queueSize > 0 ? `${queueSize} fiş senkronize edilecek` : 'LAN üzerinden çalışıyor'}
        {role === 'slave' && ' — Yan Kasa, Ana Kasa\'ya bağlı'}
      </div>
    )
  }

  if (queueSize > 0) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#f59e0b', color: 'white', textAlign: 'center',
        padding: '8px 16px', fontWeight: 700, fontSize: '0.875rem'
      }}>
        🔄 Senkronize ediliyor... {queueSize} fiş kaldı
      </div>
    )
  }

  return null
}
```

---

## AŞAMA 6 — `desktop/main.cjs` Güncelleme (~1 gün)

Mevcut `main.cjs`'e eklenecekler:

```js
const { isPaired, isMaster, readConfig, getStartupRoute } = require('./terminalConfig.cjs')
const { startEdgeServer, stopEdgeServer } = require('./edgeServer.cjs')
const { initSyncWorker } = require('./syncWorker.cjs')
const { autoUpdater } = require('electron-updater')
const { ipcMain } = require('electron')

// ── Railway sorgu fonksiyonu ────────────────────────────────────
async function railwayQueryFn(body) {
  // server/index.js'deki executeQuery mantığını burada tekrar kullan
  // veya server/index.js'i child process olarak başlat
}

async function createMainWindow(startRoute) {
  mainWindow = new BrowserWindow({ ... })
  await waitForServer(desktopBaseUrl)
  // screenMode'a göre doğru URL'e yönlendir
  await mainWindow.loadURL(`${desktopBaseUrl}${startRoute}`)
}

// ── Uygulama başlatma ────────────────────────────────────────────
app.whenReady().then(async () => {
  const config = readConfig()

  if (!isPaired()) {
    await createPairingWindow()  // Pairing wizard ekranı
    return
  }

  if (isMaster()) {
    startEdgeServer(railwayQueryFn)
    initSyncWorker(railwayQueryFn)
  }

  // screenMode'a göre başlangıç rotasını belirle:
  // 'pos' → '/pos', 'garson' → '/garson', 'pos-masalar' → '/pos-masalar'
  const startRoute = getStartupRoute()  // terminalConfig.cjs'den
  await createMainWindow(startRoute)

  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'muzafferseyranli',
    repo: 'SuitableRMS-Releases',
    private: false,
  })
  autoUpdater.checkForUpdates()
})
})

// ── IPC Handlers ────────────────────────────────────────────────
ipcMain.handle('terminal:getConfig', () => readConfig())
ipcMain.handle('terminal:pair', async (_, payload) => {
  // Pairing wizard'dan gelen veri
  const { activationCode, role, masterLanIp } = payload
  // Railway'den aktivasyon kodunu doğrula
  // ...
  writeConfig({ ...newConfig })
  return { success: true }
})
ipcMain.handle('update:apply', () => autoUpdater.quitAndInstall())
ipcMain.handle('queue:getSize', () => getQueueSize())

// Auto-updater olayları
autoUpdater.on('update-available', (info) => {
  mainWindow?.webContents.send('update:available', info)
})
autoUpdater.on('update-downloaded', (info) => {
  mainWindow?.webContents.send('update:ready', info)
})

// ── Uygulama kapanınca ───────────────────────────────────────────
app.on('window-all-closed', () => {
  stopEdgeServer()
  // ...
})
```

---

### 6.2 — `src/DesktopPosApp.jsx` Değişiklikleri (DEĞİŞİR)

Mevcut `DesktopPosApp.jsx`'teki iki kritik değişiklik:

**Değişiklik 1 — PairingGuard:** Pairing yapılmamışsa uygulamayı blokla.

**Değişiklik 2 — screenMode routing:** `/` rotasına `Navigate` ile sabit `/pos` gitmek yerine, `terminal-config.json`'daki `screenMode`'a göre rota belirlenir.

```jsx
// src/DesktopPosApp.jsx — Güncellenmiş hali

import { getStartupPath, readTerminalConfig } from '@/lib/terminalIdentity'
import { PairingScreen } from '@/components/pos/PairingScreen'
// ... diğer importlar aynı

function DesktopPosShell() {
  // screenMode'dan başlangıç rotasını hesapla (her render'da değil, bir kez)
  const startPath = getStartupPath()  // '/pos' | '/garson' | '/pos-masa' | '/pos-masalar'

  return (
    <>
      <RouteActivityTracker />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Başlangıç: screenMode'a göre yönlendir */}
          <Route path="/" element={<Navigate to={startPath} replace />} />

          {/* Tüm rotalar her zaman mevcut — kullanıcı ayarlardan değiştirebilir */}
          <Route path="/pos"          element={<POS />} />
          <Route path="/garson"       element={<Garson />} />
          <Route path="/pos-masa"     element={<POSMasa />} />
          <Route path="/pos-masalar"  element={<POSMasalar />} />

          {/* Bilinmeyen rota → screenMode'a dön */}
          <Route path="*" element={<Navigate to={startPath} replace />} />
        </Routes>
      </Suspense>
    </>
  )
}

// Pairing yapılmamışsa PairingScreen göster
function PairingGuard({ children }) {
  const config = readTerminalConfig()
  const isPaired = Boolean(config?.terminalId && config?.branchId && config?.terminalRole)

  if (!isPaired) {
    // Electron main process zaten pairing window açacak;
    // ama web renderer guard olarak da kontrol eder
    return <PairingScreen onComplete={() => window.location.reload()} />
  }

  return children
}

export default function DesktopPosApp() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AuthGate>
          <WorkspaceProvider
            allowedScopes={[WORKSPACE_SCOPE.branch]}
            forcedScope={WORKSPACE_SCOPE.branch}
          >
            <WorkspaceGate>
              <PairingGuard>
                <DesktopPosShell />
              </PairingGuard>
            </WorkspaceGate>
          </WorkspaceProvider>
        </AuthGate>
      </AuthProvider>
    </ToastProvider>
  )
}
```

**Sonuç Davranışı:**

| terminal-config.json screenMode | Uygulama açıldığında |
|---|---|
| `pos` | `/pos` — Hızlı satış kasası |
| `garson` | `/garson` — Masa servis ekranı |
| `pos-masa` | `/pos-masa` — Tek masa POS |
| `pos-masalar` | `/pos-masalar` — Masa listesi genel görünüm |
| *(Ayarlanmamış / ilk kurulum)* | Pairing wizard açılır → Adım 4'te seçilir |

> **Önemli:** Tüm rotalar her zaman erişilebilir kalır. `screenMode` yalnızca başlangıç rotasını belirler; kullanıcı uygulama içinde rotalar arası geçiş yapabilir.

---

## AŞAMA 7 — `created_by_terminal` Veri Katmanı (~0.5 gün)

### 7.1 — `sales` tablosuna terminal bilgisi

`migrations/020_pos_terminal_registry.sql`'e ekleme:

```sql
-- sales tablosuna terminal izlenebilirliği
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS created_by_terminal UUID,
  ADD COLUMN IF NOT EXISTS created_by_terminal_name TEXT;

-- inventory_movements için de
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS created_by_terminal UUID;

-- İndeks (terminal bazlı raporlama için)
CREATE INDEX IF NOT EXISTS idx_sales_terminal ON public.sales(created_by_terminal);
```

### 7.2 — POS checkout'ta terminal bilgisi enjeksiyonu

`src/lib/terminalIdentity.js`'e eklenecek:

```js
// Her yazım işleminde terminal bilgisini otomatik ekle
export function injectTerminalFields(data, tableName) {
  const terminalId = getTerminalId()
  if (!terminalId) return data

  const TERMINAL_TRACKED_TABLES = new Set(['sales', 'sale_lines', 'inventory_movements'])
  if (!TERMINAL_TRACKED_TABLES.has(tableName)) return data

  if (Array.isArray(data)) {
    return data.map(row => ({ ...row, created_by_terminal: terminalId }))
  }
  return { ...data, created_by_terminal: terminalId }
}
```

---

## AŞAMA 8 — Auto-Updater ve GitHub Releases (~1 gün)

### 8.1 — `desktop/updater.cjs` (YENİ DOSYA)

```js
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')

autoUpdater.logger = log
autoUpdater.logger.transports.file.level = 'info'
autoUpdater.autoDownload = true  // Arka planda indir
autoUpdater.autoInstallOnAppQuit = false  // Kullanıcı onayı bekle

module.exports = { autoUpdater }
```

### 8.2 — `package.json` build config güncellemesi

```json
{
  "build": {
    "appId": "com.suitable.rms.pos",
    "productName": "SuitableRMS POS",
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
      "createDesktopShortcut": true
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
}
```

> **Not:** `better-sqlite3` native modül olduğundan `electron-rebuild` gerekir.  
> `package.json scripts`'e eklenecek: `"postinstall": "electron-rebuild -f -w better-sqlite3"`

---

## 🗓️ Geliştirme Takvimi

```
HAFTA 1 — Pairing & Terminal Kimliği
────────────────────────────────────────────────
[ ] AŞAMA 0.1-0.3: terminal-config.json + terminalConfig.cjs (1 gün)
[ ] AŞAMA 0.4: PairingScreen.jsx wizard UI (1 gün)
[ ] AŞAMA 0.5: Railway migration 020 + aktivasyon kodu sistemi (0.5 gün)
[ ] AŞAMA 7: created_by_terminal migration + enjeksiyon (0.5 gün)

HAFTA 2 — Ana Kasa Edge Server & SQLite
────────────────────────────────────────────────
[ ] AŞAMA 1: sqliteStore.cjs — schema + cache + queue API (1.5 gün)
[ ] AŞAMA 2: edgeServer.cjs — Express + WebSocket + TTL cache (2 gün)
[ ] AŞAMA 3: syncWorker.cjs — online event + kuyruk eritme (0.5 gün)

HAFTA 3 — Renderer Entegrasyonu & Auto-Updater
────────────────────────────────────────────────
[ ] AŞAMA 4: db.js LAN router — slave/master yönlendirme (1 gün)
[ ] AŞAMA 5: useLanSync hook + OfflineStatusBar (1 gün)
[ ] AŞAMA 6: main.cjs güncelleme — tüm parçaları birleştir (1 gün)
[ ] AŞAMA 8: updater.cjs + GitHub Releases pipeline (1 gün)

HAFTA 4 — Test & Sertleştirme
────────────────────────────────────────────────
[ ] 1 master + 3 slave senaryo testi (LAN simülasyonu)
[ ] 24 saat offline → tekrar online → sync doğrulama
[ ] created_by_terminal veri bütünlüğü doğrulama
[ ] GitHub Release pipeline çalıştırma (test build)
[ ] electron-rebuild + better-sqlite3 native build testi
```

---

## ⚠️ Risk ve Governance Uyumluluğu

### Governance Kontrol Listesi

| Kural | Durum | Açıklama |
|---|---|---|
| **Kural 1 — DB-First** | ✅ | SQLite yalnızca geçici buffer; Railway tek authority |
| **Kural 1 İstisnası — Offline** | ✅ | POS operasyonel çevrimdışı modu |
| **Zorunlu Offline Banner** | ✅ | OfflineStatusBar.jsx — her durumda görünür |
| **Supabase Yasağı** | ✅ | LAN → Ana Kasa → Railway; Supabase hiç yok |
| **AWS Yasağı** | ✅ | Yok |
| **Kural 6 — Polling Yasağı** | ✅ | syncWorker: 30sn DNS check (uzun aralık) |
| **Kural 5 — Dosya Yolları** | ✅ | Tüm yeni dosyalar ./desktop/ ve ./src/ altında |
| **Kural 4 — OperationSync** | ⚠️ | Uygulama sonrası Entry eklenmeli |

### Teknik Riskler

| Risk | Çözüm |
|---|---|
| `better-sqlite3` WAL lock (4 terminal) | Ana Kasa Edge Server tek yazar; Yan Kasalar HTTP ile erişir |
| LAN IP değişimi (DHCP) | Statik IP öneri; ya da mDNS discovery (Aşama 0'da doc) |
| Ana Kasa çökmesi | Yan Kasalar `LAN_OFFLINE` moduna geçer, sadece local cache |
| Offline queue 24h dolması | Max 1000 fiş limiti; UI uyarısı; otomatik flush önceliği |
| Electron rebuild native module | CI/CD pipeline'a `electron-rebuild` adımı eklenmeli |
| Terminal pairing güvenliği | Aktivasyon kodları tek kullanımlık + Railway'de is_used flag |

### Yan Kasa Ana Kasa Çöktüğünde Davranışı

```
Ana Kasa çöktü
     ↓
Yan Kasa WebSocket bağlantısı kapandı
     ↓
useLanSync → 30sn bekle → yeniden bağlanmayı dene (3 kez)
     ↓
Başarısız → LAN_OFFLINE moduna geç
     ↓
OfflineStatusBar: "⚠️ Ana Kasa'ya bağlanılamıyor — Sadece önbellek kullanılıyor"
     ↓
Yan Kasa yalnızca son SQLite cache verisiyle çalışmaya devam eder
(Yeni fiş yazılmaya çalışılırsa → kuyruk oluşturulamaz; UI hata verir)
```

---

## 📦 Yeni npm Bağımlılıkları

```json
{
  "dependencies": {
    "ws": "^8.17.0",
    "electron-log": "^5.1.0"
  },
  "devDependencies": {
    "better-sqlite3": "^9.4.3",
    "electron-updater": "^6.1.8",
    "electron-rebuild": "^3.2.9"
  }
}
```

> `better-sqlite3` devDependencies'te olsa da Electron asar paketiyle build'e dahil edilmelidir.  
> `files` array'inde `node_modules/better-sqlite3/**/*` açıkça belirtilmelidir.

