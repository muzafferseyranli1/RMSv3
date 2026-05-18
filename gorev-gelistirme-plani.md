# Görev Takip Modülü — Geliştirme Planı

Tarih: 2026-05-11  
Kaynak: görevtakibi.txt (Railway Postgres mimarisine uyarlanmış)  
Proje: C:\RMSggl\Dropbox\RMSv3

---

## KESİNLEŞEN KARARLAR (konuşmadan)

### Dosya Depolama — Railway Volume
- Cloudflare R2, AWS S3, Google Cloud KESİNLİKLE kullanılmaz
- Railway API servisine (rms-api) Volume bağlanır
- Mount path: `/app/uploads`
- `server/index.js`'e `multer` + `diskStorage` tabanlı `/api/upload` endpoint eklenir
- Dosyalar `/api/files/:filename` ile serve edilir
- `task_attachments.file_url` → `/api/files/:filename` formatında yazılır
- Railway paneli aktifleştirme: rms-api → Volumes → New Volume → `/app/uploads`
- Fotoğraf maks 10 MB | Doküman maks 25 MB

### Pozisyon Hiyerarşisi
- `/positions` → mevcut düz liste, **dokunulmaz**
- `/positions/hierarchy` → **YENİ** ağaç editörü sayfası
- Her pozisyon kaydına `parentId` alanı eklenir (settings JSONB içinde)
- Sidebar'da Pozisyonlar altına "Hiyerarşi" alt öğesi eklenir

### Görev Atama / Red Kuralı (kesin)

| Durum | Kural |
|---|---|
| Üst → Alt | Alt kişi **reddedemez** — sadece "Göreve Başla" der |
| Alt → Üst | Üst kişi **kabul veya reddeder** |
| Paralel → Paralel | Karşı taraf **kabul veya reddeder** |
| Kendine → Kendine | Aksiyon yok, direkt açık |

- Herkes herkese görev yazabilir, kısıtlama yok
- Hiyerarşi yalnızca "reddedilebilir mi?" sorusunu yanıtlar
- `canReject(assignerPositionId, assigneePositionId, hierarchyTree)`:
  - assignee, assigner'ın doğrudan veya dolaylı **altındaysa** → `false`
  - **üstündeyse** veya **farklı dalda (paralel)** ise → `true`

---

## Mimari Özet

| Katman | Araç |
|---|---|
| Veritabanı | Railway Postgres |
| Backend | server/index.js — /api/query + /api/upload + /api/files/:filename |
| Frontend DB erişimi | src/lib/db.js (QueryBuilder) |
| Auth | YOK (bypass) |
| Dosya depolama | Railway Volume — /app/uploads |
| Schema dosyası | schema-railway-master.sql |

---

## BAĞIMLILIK HARİTASI

```
FAZ 0 (Ön koşul)
  └── Railway Volume aktifleştir (panelden — tek seferlik)

FAZ 1 — Veritabanı
  ├── 1.1 SQL Migration (10 görev tablosu)
  ├── 1.2 server/index.js jsonbColumns güncelle
  └── 1.3 /api/upload + /api/files/:filename endpoint

FAZ 2 — Pozisyon Hiyerarşisi (FAZ 1'den bağımsız, paralel yapılabilir)
  ├── 2.1 positions JSONB'ye parentId ekle
  ├── 2.2 /positions/hierarchy sayfası (ağaç editörü)
  └── 2.3 canReject() yardımcı fonksiyonu

FAZ 3 — Servis Katmanı (FAZ 1 + 2 tamamlanınca)
  ├── 3.1 src/lib/taskService.js
  └── 3.2 src/lib/taskRecurrence.js

FAZ 4 — Görev Oluşturma Formu (FAZ 3 sonrası)
  └── Mevcut Tasks.jsx formu tamamla

FAZ 5 — Görev Listesi (FAZ 3 sonrası)
  └── Sekme + filtre + kart görünümü

FAZ 6 — Detay + Chat + History (FAZ 5 sonrası)
  ├── TaskDrawer.jsx
  ├── TaskChatPanel.jsx
  └── TaskHistory.jsx

FAZ 7 — Modaller (FAZ 6 sonrası)
  ├── TaskClosureModal.jsx
  ├── TaskSendBackModal.jsx
  └── TaskDelegateModal.jsx

FAZ 8 — Workspace Entegrasyonu (FAZ 5 sonrası)
  └── Şube + depo scope erişimi

FAZ 9 — Bildirimler (FAZ 3 sonrası, deferred)
```

---

## FAZ 0 — ÖN KOŞUL (Railway Paneli)

Railway Volume aktifleştirme adımları:
1. `railway.com` → SuitableRMS → production
2. `rms-api` servisine tıkla
3. `Volumes` sekmesi → **New Volume**
4. Mount Path: `/app/uploads` | Size: 5 GB (başlangıç)
5. Create → servis otomatik redeploy olur
6. Volumes sekmesinde "Mounted" yazısı görününce hazır

**Bu adım tamamlanmadan FAZ 1.3 uygulanamaz.**

---

## FAZ 1 — VERİTABANI ALTYAPISI

### 1.1 — SQL Migration

**Dosya:** `migrations/001_task_domain.sql`

Oluşturulacak tablolar ve kritik alanlar:

```sql
-- tasks — ana görev tablosu
CREATE TABLE IF NOT EXISTS public.tasks (
  id                       UUID DEFAULT gen_random_uuid() NOT NULL,
  organization_node_id     UUID,
  branch_node_id           UUID,
  created_by_personnel_id  TEXT NOT NULL,
  created_by_position_id   TEXT,
  title                    TEXT NOT NULL,
  description              TEXT,
  status                   TEXT NOT NULL DEFAULT 'open',
  priority                 TEXT DEFAULT 'normal',
  due_at                   TIMESTAMPTZ,
  start_at                 TIMESTAMPTZ,
  has_specific_time        BOOLEAN DEFAULT false NOT NULL,
  timezone                 TEXT DEFAULT 'Europe/Istanbul' NOT NULL,
  is_recurring             BOOLEAN DEFAULT false NOT NULL,
  recurrence_rule_id       UUID,
  delegation_allowed       BOOLEAN DEFAULT false NOT NULL,
  approval_required        BOOLEAN DEFAULT false NOT NULL,
  closure_summary_required BOOLEAN DEFAULT false NOT NULL,
  closure_file_required    BOOLEAN DEFAULT false NOT NULL,
  closure_image_required   BOOLEAN DEFAULT false NOT NULL,
  edit_due_date_allowed    BOOLEAN DEFAULT false NOT NULL,
  edit_schedule_allowed    BOOLEAN DEFAULT false NOT NULL,
  incomplete_if_late       BOOLEAN DEFAULT false NOT NULL,
  closure_summary          TEXT,
  deleted_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY[
    'draft','open','in_progress','pending_approval',
    'pending_completion_approval','completed','rejected',
    'overdue','cancelled','soft_deleted','not_completed'
  ])),
  CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY[
    'low','normal','high','urgent'
  ]))
);

-- task_participants — atananlar ve gözlemciler
CREATE TABLE IF NOT EXISTS public.task_participants (
  id               UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id          UUID NOT NULL,
  participant_type TEXT NOT NULL,  -- 'assignee' | 'watcher'
  personnel_id     TEXT NOT NULL,
  position_id      TEXT,
  node_id          UUID,
  is_delegate      BOOLEAN DEFAULT false NOT NULL,
  delegated_from   TEXT,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_participants_pkey PRIMARY KEY (id),
  CONSTRAINT task_participants_type_check CHECK (
    participant_type = ANY (ARRAY['assignee','watcher'])
  ),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- task_checklist_items
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id         UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id    UUID NOT NULL,
  text       TEXT NOT NULL,
  is_done    BOOLEAN DEFAULT false NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_checklist_items_pkey PRIMARY KEY (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- task_attachments — dosya ve resim ekleri
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id              UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id         UUID NOT NULL,
  attachment_type TEXT NOT NULL,
  -- 'file'|'image'|'closure_file'|'closure_image'|'chat'
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,  -- /api/files/:filename
  file_size       INTEGER,
  mime_type       TEXT,
  uploaded_by     TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT task_attachments_type_check CHECK (
    attachment_type = ANY (ARRAY[
      'file','image','closure_file','closure_image','chat'
    ])
  ),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- task_recurrence_rules
CREATE TABLE IF NOT EXISTS public.task_recurrence_rules (
  id             UUID DEFAULT gen_random_uuid() NOT NULL,
  frequency      TEXT NOT NULL,
  interval_value INTEGER DEFAULT 1 NOT NULL,
  weekdays       TEXT[],
  month_day      INTEGER,
  month_nth      INTEGER,
  month_weekday  TEXT,
  specific_dates TEXT[],
  time_of_day    TIME,
  ends_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_recurrence_rules_pkey PRIMARY KEY (id),
  CONSTRAINT task_recurrence_rules_frequency_check CHECK (
    frequency = ANY (ARRAY['daily','weekly','monthly','yearly','interval'])
  )
);

-- task_approval_requests
CREATE TABLE IF NOT EXISTS public.task_approval_requests (
  id             UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id        UUID NOT NULL,
  request_type   TEXT NOT NULL,
  from_personnel TEXT NOT NULL,
  to_personnel   TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  reason         TEXT,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_approval_requests_pkey PRIMARY KEY (id),
  CONSTRAINT task_approval_requests_type_check CHECK (
    request_type = ANY (ARRAY[
      'assignment','upward_assignment','closure_approval',
      'delegation','rejection'
    ])
  ),
  CONSTRAINT task_approval_requests_status_check CHECK (
    status = ANY (ARRAY['pending','accepted','rejected'])
  ),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- task_history
CREATE TABLE IF NOT EXISTS public.task_history (
  id           UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id      UUID NOT NULL,
  action       TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_history_pkey PRIMARY KEY (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- task_chat_threads
CREATE TABLE IF NOT EXISTS public.task_chat_threads (
  id         UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id    UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_chat_threads_pkey PRIMARY KEY (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

-- task_chat_messages
CREATE TABLE IF NOT EXISTS public.task_chat_messages (
  id           UUID DEFAULT gen_random_uuid() NOT NULL,
  thread_id    UUID NOT NULL,
  task_id      UUID NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'system'
  sender_id    TEXT,
  body         TEXT,
  metadata     JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT task_chat_messages_type_check CHECK (
    message_type = ANY (ARRAY['user','system'])
  ),
  FOREIGN KEY (thread_id)
    REFERENCES public.task_chat_threads(id) ON DELETE CASCADE
);

-- Index'ler
CREATE INDEX ON public.tasks (created_by_personnel_id);
CREATE INDEX ON public.tasks (status);
CREATE INDEX ON public.tasks (due_at);
CREATE INDEX ON public.tasks (deleted_at);
CREATE INDEX ON public.task_participants (task_id, participant_type);
CREATE INDEX ON public.task_participants (personnel_id);
CREATE INDEX ON public.task_checklist_items (task_id);
CREATE INDEX ON public.task_history (task_id);
CREATE INDEX ON public.task_chat_messages (thread_id);
CREATE INDEX ON public.task_approval_requests (task_id, status);
```

**Uygulama komutu:**
```
psql [DATABASE_URL] -f migrations/001_task_domain.sql
```

**schema-railway-master.sql güncellenir.**

---

### 1.2 — server/index.js jsonbColumns Güncellemesi

`normalizeWriteValue` içindeki `jsonbColumns` nesnesine ekle:

```js
tasks:                   new Set(['metadata']),
task_history:            new Set(['metadata']),
task_chat_messages:      new Set(['metadata']),
task_approval_requests:  new Set(['metadata']),
```

**Dokunulacak dosya:** `server/index.js`

---

### 1.3 — Upload + File Serve Endpoint (FAZ 0 tamamlanınca)

**Dosya:** `server/index.js` (yeni endpoint'ler)

**Gerekli paket:** `multer` (server/package.json'a ekle)

```js
// Kurulum: npm install multer (server dizininde)

const multer = require('multer')
const path   = require('path')
const fs     = require('fs')

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads'

// uploads dizini yoksa oluştur
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const ext = path.extname(file.originalname)
    cb(null, `${unique}${ext}`)
  },
})

const ALLOWED_MIME = new Set([
  'image/png','image/jpeg','image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
])

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIME.has(file.mimetype)
      ? cb(null, true)
      : cb(new Error(`Desteklenmeyen dosya türü: ${file.mimetype}`))
  },
})

// Yükleme endpoint'i
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya alınamadı.' })
  res.json({
    file_url:   `/api/files/${req.file.filename}`,
    file_name:  req.file.originalname,
    file_size:  req.file.size,
    mime_type:  req.file.mimetype,
  })
})

// Dosya serve endpoint'i
app.get('/api/files/:filename', (req, res) => {
  const filename = path.basename(req.params.filename) // path traversal koruması
  const filepath = path.join(UPLOAD_DIR, filename)
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Dosya bulunamadı.' })
  res.sendFile(filepath)
})
```

---

## FAZ 2 — POZİSYON HİYERARŞİSİ

**FAZ 1 ile paralel yapılabilir.**

### 2.1 — positions JSONB'ye parentId Ekle

`src/lib/personnelConfig.js` içindeki `createEmptyPosition` fonksiyonuna alan ekle:

```js
export function createEmptyPosition() {
  return {
    id: '',
    name: '',
    shortCode: '',
    parentId: '',        // ← YENİ
    lateToleranceMinutes: 15,
    contractTerms: createDefaultContractTerms(),
    notes: '',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  }
}
```

`normalizePositionRecord` fonksiyonuna da `parentId` normalize satırı eklenir.

### 2.2 — /positions/hierarchy Sayfası

**Dosya:** `src/components/pages/PositionHierarchy.jsx`

Sayfa içeriği:
- Sol panel: Hiyerarşisiz (parentId boş) pozisyonlar listesi
- Sağ panel: Ağaç görünümü (parentId ilişkisinden türetilir)
- Her pozisyon satırında "Üstü:" SearchableSelect → diğer pozisyonlardan seçim
- Döngüsel bağımlılık kontrolü (A'nın üstü B, B'nin üstü A olamaz)
- Kaydet butonu → positions JSONB'yi settings tablosuna yazar
- Mevcut Positions.jsx tasarım dilinde

App.jsx'e route eklenir:
```jsx
const PositionHierarchy = lazy(() =>
  import('@/components/pages/PositionHierarchy')
)
<Route path="/positions/hierarchy" element={<PositionHierarchy />} />
```

workspace.js CENTER_PATHS'e `/positions/hierarchy` eklenir.

Sidebar.jsx'te Pozisyonlar altına alt öğe:
```js
{ label: 'Pozisyonlar', path: '/positions', icon: '...' },
{ label: 'Görev Hiyerarşisi', path: '/positions/hierarchy', icon: 'fa-sitemap' },
```

### 2.3 — canReject() Yardımcı Fonksiyonu

**Dosya:** `src/lib/taskHierarchy.js`

```js
// positions: tüm pozisyon kayıtlarının düz listesi [{ id, parentId, ... }]
// assigner: görevi oluşturanın position_id
// assignee: görevin atandığı kişinin position_id

export function canReject(assignerPositionId, assigneePositionId, positions) {
  if (assignerPositionId === assigneePositionId) return false // kendine atama

  // assigner'ın tüm alt torunlarını bul
  const descendants = getDescendants(assignerPositionId, positions)

  // assignee, assigner'ın altındaysa reddedemez
  if (descendants.has(assigneePositionId)) return false

  // üst veya paralel → reddedebilir
  return true
}

function getDescendants(positionId, positions) {
  const result = new Set()
  const queue  = [positionId]
  while (queue.length) {
    const current = queue.shift()
    positions
      .filter(p => p.parentId === current)
      .forEach(p => {
        if (!result.has(p.id)) {
          result.add(p.id)
          queue.push(p.id)
        }
      })
  }
  return result
}
```

---

## FAZ 3 — SERVİS KATMANI

### 3.1 — src/lib/taskService.js

Tüm görev işlemleri bu dosya üzerinden yapılır.
`db.js` QueryBuilder kullanılır, her fonksiyon `{ data, error }` döndürür.

**Fonksiyonlar:**

```
createTask(payload)
  → tasks INSERT
  → task_participants INSERT (assignees + watchers)
  → task_checklist_items INSERT
  → task_chat_threads INSERT (otomatik)
  → appendSystemNote(taskId, 'created')

fetchTasks({ personnelId, positionId, tab, statusFilter, orderBy, page })
  tab: 'mine' | 'assigned_by_me' | 'watching'
  → Sekme bazlı sorgular

fetchTaskDetail(taskId)
  → task + participants + checklist + attachments + approval_requests

updateTaskStatus(taskId, status, byPersonnelId, metadata)

acceptTask(taskId, personnelId)
  → status = 'in_progress'
  → history: 'started'
  → appendSystemNote(taskId, 'started')

sendBack(taskId, personnelId, reason)
  → reason boş kontrolü → hata döndür
  → task_approval_requests INSERT (type: 'rejection')
  → status = 'rejected'
  → history: 'sent_back'
  → appendSystemNote(taskId, 'sent_back', { reason })

delegateTask(taskId, fromPersonnelId, toPersonnelId)
  → task_approval_requests INSERT (type: 'delegation')
  → history: 'delegated'
  → appendSystemNote(taskId, 'delegated')

acceptDelegate(approvalId)
  → task_participants: from → watcher, to → assignee
  → approval status = 'accepted'
  → history: 'delegate_accepted'

rejectDelegate(approvalId, reason)
  → approval status = 'rejected'
  → history: 'delegate_rejected'

completeTask(taskId, personnelId, { summary, fileCount, imageCount })
  → closure_summary_required kontrolü
  → closure_file_required kontrolü
  → closure_image_required kontrolü
  → approval_required = true  → status = 'pending_completion_approval'
  → approval_required = false → status = 'completed'

approveCompletion(approvalId)
  → status = 'completed'
  → appendSystemNote(taskId, 'approved')

rejectCompletion(approvalId, reason)
  → status = 'in_progress'
  → appendSystemNote(taskId, 'approval_rejected', { reason })

softDeleteTask(taskId, personnelId)
  → created_by_personnel_id kontrolü (yetki yoksa error)
  → deleted_at = now(), status = 'soft_deleted'

restoreTask(taskId, personnelId)
  → deleted_at = null, status = 'open'

changeDueDate(taskId, personnelId, newDueAt, newStartAt)
  → edit_due_date_allowed / edit_schedule_allowed kontrolü
  → tasks UPDATE
  → history: 'date_changed' (metadata: { old_due_at, new_due_at })
  → appendSystemNote: "X kişisi tarihi Y olarak değiştirdi."

appendChatMessage(threadId, taskId, senderId, body)
  → task_chat_messages INSERT (type: 'user')

appendSystemNote(taskId, event, metadata = {})
  → task_chat_messages INSERT (type: 'system', sender_id: null)
  → task_history INSERT
```

### 3.2 — src/lib/taskRecurrence.js

```js
// calculateNextOccurrence(rule, fromDate) → Date | null
// Bağımlılıksız, native JS Date
// Desteklenen: daily / weekly / monthly / yearly / interval
```

Örnekler:
- `daily` → fromDate + 1 gün (time_of_day uygulanır)
- `weekly, weekdays: ['monday','friday']` → sonraki Pazartesi veya Cuma
- `monthly, month_day: 15` → sonraki ayın 15'i
- `monthly, month_nth: 2, month_weekday: 'monday'` → ayın 2. Pazartesisi
- `monthly, month_day: -1` (last_day) → ayın son günü

---

## FAZ 4 — GÖREV OLUŞTURMA FORMU

**Dosya:** `src/components/pages/Tasks.jsx` (mevcut forma ekleme)

### Eksik alanlar (eklenecek)

| Alan | Tip | Görevtakibi Referansı |
|---|---|---|
| `has_specific_time` | checkbox | Saat belirtme kuralı |
| Saat inputu | time | has_specific_time = true ise görünür |
| `priority` | SearchableSelect | low/normal/high/urgent |
| `delegation_allowed` | checkbox | Delege etme yetkisi |
| `approval_required` | checkbox | Kapanış onayı |
| `closure_summary_required` | checkbox | Kapanış özeti zorunlu |
| `closure_file_required` | checkbox | Kapanış dosyası zorunlu |
| `edit_due_date_allowed` | checkbox | Tarih değiştirme yetkisi |
| `incomplete_if_late` | checkbox | Süresinde bitirilmezse tamamlanmadı |
| Dosya ekleme | file input | /api/upload → task_attachments |
| Resim ekleme | file input | /api/upload → task_attachments |

### Checklist düzeltmesi

Mevcut textarea → dinamik liste:
- "+ Madde Ekle" butonu → yeni satır
- Her satır: input + silme ikonu
- sort_order güncelleme

### Kaydetme bağlantısı

"Kaydetmeye Hazır" butonu → `taskService.createTask(payload)` çağrısı

### Türkçe karakter düzeltmeleri

```
Gunluk    → Günlük
Haftalik  → Haftalık
Aylik     → Aylık
Yillik    → Yıllık
Sali      → Salı
Carsamba  → Çarşamba
Persembe  → Perşembe
```

---

## FAZ 5 — GÖREV LİSTESİ EKRANI

**Dosya:** `src/components/pages/Tasks.jsx` (liste modu)  
**Bileşen:** `src/components/pages/tasks/TaskCard.jsx`

### Sayfa yapısı

```
[ + Yeni Görev ]                          [ Sırala ▾ ] [ Filtrele ]

[ Görevlerim ] [ Verdiğim Görevler ] [ Gözlemci Olduklarım ]

        [ Devam Edenler ] [ Tamamlananlar ]

─────────────────────────────────────────
  [TaskCard] [TaskCard] [TaskCard]
  [TaskCard] [TaskCard]
─────────────────────────────────────────
```

### Sekme sorgu mantığı

```
Görevlerim:
  task_participants WHERE personnel_id = aktif AND type = 'assignee'

Verdiğim Görevler:
  tasks WHERE created_by_personnel_id = aktif

Gözlemci Olduklarım:
  task_participants WHERE personnel_id = aktif AND type = 'watcher'
```

### Ek filtreler (drawer/panel)

- Geciken (status = 'overdue')
- Tamamlanmadı (status = 'not_completed')
- Onay bekleyen (status IN pending_approval, pending_completion_approval)
- Soft deleted (deleted_at IS NOT NULL)
- Tarih aralığı
- Öncelik
- Kişi / pozisyon

### TaskCard içeriği

- Başlık + durum rozeti (renk kodlu)
- Vade: "3 gün kaldı" / "2 gün gecikti" (local timezone)
- Oluşturan + Atananlar
- Checklist ilerlemesi (X/Y veya progress bar)
- Ek göstergesi (📎 varsa)
- Tekrar ikonu (🔄 varsa)
- Bekleyen onay/delege rozeti

### Sıralama

- En yakın vade (varsayılan)
- En yeni oluşturulan
- Öncelik (urgent → high → normal → low)
- En eski

---

## FAZ 6 — DETAY + CHAT + HISTORY

### 6.1 — TaskDrawer.jsx

`src/components/pages/tasks/TaskDrawer.jsx`

Karta tıklanınca sağdan açılır.

Bölümler (sırayla):
1. Başlık + Durum + Öncelik + Aksiyon butonları
2. Açıklama
3. Tarih (start_at, due_at, timezone, tekrar)
4. Atananlar + delege durumları
5. Gözlemciler
6. Kapatma kuralları özeti
7. Checklist (interaktif — işaretle, ekle, sil)
8. Ekler (dosya + resim thumbnail)
9. Chat paneli
10. History timeline

### 6.2 — Aksiyon Butonu Mantığı

| Durum | Atanan Görür | Oluşturucu Görür |
|---|---|---|
| open | Göreve Başla, Geri Gönder* | Soft Delete, İptal |
| in_progress | Tamamla, Delege Et** | Soft Delete |
| pending_completion_approval | — | Onayla, İade Et |
| pending_approval | Kabul, Ret | — |
| rejected | — | Düzenle, Tekrar Gönder |
| soft_deleted | — | Restore |

*Geri Gönder: sadece canReject() = true ise görünür  
**Delege Et: sadece delegation_allowed = true ise görünür

### 6.3 — TaskChatPanel.jsx

`src/components/pages/tasks/TaskChatPanel.jsx`

- task_chat_messages listesi (type'a göre ayrı stil)
  - `user` mesajı: sağ hizalı, renkli balon
  - `system` notu: ortada, gri, italik
- Metin input + Gönder butonu
- Dosya/resim ekleme (chat tipi upload)
- Yeni mesajda scroll-to-bottom

### 6.4 — TaskHistory.jsx

`src/components/pages/tasks/TaskHistory.jsx`

- task_history kayıtları zaman çizelgesi olarak
- Her kayıt: tarih + performed_by + action açıklaması
- metadata içinden detay (tarih değişikliği için eski→yeni)

---

## FAZ 7 — MODALLER

### 7.1 — TaskClosureModal.jsx

"Tamamla" butonuna basılınca açılır.

```
1. closure_summary_required → textarea (zorunlu)
2. closure_file_required    → dosya upload (zorunlu)
3. closure_image_required   → resim upload, maks 10 (zorunlu)
4. Tüm zorunluluklar → "Gönder" aktif
5. taskService.completeTask() çağrısı
6. approval_required = true  → "Onay bekleniyor" bilgisi
   approval_required = false → toast "Görev tamamlandı"
```

### 7.2 — TaskSendBackModal.jsx

"Geri Gönder" butonuna basılınca açılır.

```
- Gerekçe textarea (zorunlu, boş bırakılamaz)
- "Gönder" yalnızca doldurulunca aktif
- taskService.sendBack() çağrısı
```

### 7.3 — TaskDelegateModal.jsx

"Delege Et" butonuna basılınca açılır.

```
- Kişi seçici (SearchableSelect — personnelOptions)
- canReject() çağrısı: üst/paralel mi?
  → evet: "Bu kişi görevi reddedebilir, devam?" uyarısı
  → hayır: doğrudan delege
- taskService.delegateTask() çağrısı
```

---

## FAZ 8 — WORKSPACE ENTEGRASYONU

**src/lib/workspace.js:**

```js
// CENTER_PATHS'e ekle (zaten var, kontrol et):
'/positions/hierarchy'

// BRANCH_PATHS'e ekle:
'/sube-tasks'

// WAREHOUSE_PATHS'e ekle:
'/merkez-tasks'
```

**src/App.jsx:**

```jsx
const PositionHierarchy = lazy(() => import('@/components/pages/PositionHierarchy'))

<Route path="/positions/hierarchy" element={<PositionHierarchy />} />
<Route path="/sube-tasks"
  element={<WorkspaceBranchScope><Tasks scope="branch" /></WorkspaceBranchScope>}
/>
<Route path="/merkez-tasks"
  element={<WarehouseBranchRoute title="Görevler"><Tasks scope="warehouse" /></WarehouseBranchRoute>}
/>
```

**src/components/layout/Sidebar.jsx:**

Pozisyonlar grubuna ekle:
```js
{ label: 'Görev Hiyerarşisi', path: '/positions/hierarchy', icon: 'fa-sitemap' }
```

Şube İşlemleri grubuna ekle:
```js
{ label: 'Görevler', path: '/sube-tasks', icon: 'fa-list-check' }
```

Merkez Depo grubuna ekle:
```js
{ label: 'Görevler', path: '/merkez-tasks', icon: 'fa-list-check' }
```

---

## FAZ 9 — BİLDİRİMLER (İlk Aşama — Deferred)

**src/lib/taskNotifications.js**

İlk fazda: in-app toast (`useToast`)  
Sonraki faz: okunmamış bildirim badge + panel

Olay → Alıcı:
```
Yeni görev atandı          → atanana toast
Göreve başlandı            → oluşturucuya toast
Geri gönderildi            → oluşturucuya toast
Tamamlandı                 → oluşturucuya toast
Kapanış onayı bekleniyor   → oluşturucuya toast
Süresinde tamamlanmadı     → oluşturucuya toast
Delege edildi              → oluşturucuya + yeni görevliye toast
```

---

## DOSYA YAPISI (tamamlandığında)

```
migrations/
└── 001_task_domain.sql              YENİ

src/
├── components/pages/
│   ├── Tasks.jsx                    MEVCUT — genişletilir
│   ├── PositionHierarchy.jsx        YENİ
│   └── tasks/
│       ├── TaskCard.jsx             YENİ
│       ├── TaskDrawer.jsx           YENİ
│       ├── TaskChatPanel.jsx        YENİ
│       ├── TaskHistory.jsx          YENİ
│       ├── TaskClosureModal.jsx     YENİ
│       ├── TaskSendBackModal.jsx    YENİ
│       └── TaskDelegateModal.jsx    YENİ
├── lib/
│   ├── taskService.js               YENİ
│   ├── taskRecurrence.js            YENİ
│   ├── taskHierarchy.js             YENİ
│   └── personnelConfig.js           GÜNCELLENİR (parentId)
├── App.jsx                          GÜNCELLENİR (routes)
└── components/layout/Sidebar.jsx    GÜNCELLENİR (menü)

server/
└── index.js                         GÜNCELLENİR (upload + jsonbColumns)

schema-railway-master.sql            GÜNCELLENİR (10 tablo)
gorev-gelistirme-plani.md            BU DOSYA
görevtakibi.txt                      GÜNCELLENDİ
```

---

## BAŞLAMA SIRASI

```
1. Railway panelinde Volume aktifleştir (FAZ 0)
2. migrations/001_task_domain.sql yaz ve Railway'e uygula (FAZ 1.1)
3. server/index.js güncelle: jsonbColumns + upload endpoint (FAZ 1.2 + 1.3)
4. personnelConfig.js'e parentId ekle + PositionHierarchy.jsx yaz (FAZ 2)
5. taskHierarchy.js yaz (FAZ 2.3)
6. taskService.js yaz (FAZ 3.1)
7. taskRecurrence.js yaz (FAZ 3.2)
8. Tasks.jsx formu tamamla (FAZ 4)
9. Görev listesi + TaskCard.jsx (FAZ 5)
10. TaskDrawer + Chat + History (FAZ 6)
11. Modaller (FAZ 7)
12. Workspace + Sidebar + routes (FAZ 8)
13. OperationSync.md güncelle
```

---

## HER FAZ SONUNDA ZORUNLU

1. `npm.cmd run build` — hatasız build
2. Manuel golden path testi
3. `OperationSync.md`'e kayıt (görev tamamlanmış sayılmaz)
