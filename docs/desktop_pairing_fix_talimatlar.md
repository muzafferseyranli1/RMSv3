# Desktop Pairing & Routing Fix — Agent Talimat Kartları

> **Yönetici:** Antigravity (Bu Oturum)  
> **Çalışan Agent:** Aşağıdaki görev kartlarını sırayla uygulayacak agent  
> **Proje:** `X:\RMSv3`  
> **Referans:** Bu dosya ve `implementation_plan.md`

---

## BAŞLAMADAN ÖNCE OKU

1. `.antigravityrules.md`
2. Bu dosya (baştan sona)
3. Değiştireceğin her dosyanın **mevcut halini** oku

**Kural:** `pair_key` kelimesi hiçbir dosyada kalmayacak (kiosk dosyaları dahil). Her yerde `activation_code` kullanılacak. Tüm activation code'lar **BÜYÜK HARF** olacak.

---
---

## 📋 GÖREV 1 — Veritabanı Migration

### Oluşturulacak Dosya
`X:\RMSv3\migrations\022_fix_terminal_screen_mode.sql` (YENİ)

### İçerik

```sql
-- ============================================================
-- 022_fix_terminal_screen_mode.sql
-- screen_mode constraint'ini genişlet, pair_key kolonunu kaldır
-- ============================================================

-- 1. screen_mode CHECK constraint'ini kaldır ve yeniden oluştur
ALTER TABLE pos_terminals DROP CONSTRAINT IF EXISTS pos_terminals_screen_mode_check;
ALTER TABLE pos_terminals ADD CONSTRAINT pos_terminals_screen_mode_check
  CHECK (screen_mode = ANY (ARRAY['pos'::text, 'garson'::text, 'pos-masa'::text, 'pos-masalar'::text, 'kds'::text, 'pickup'::text]));

-- 2. Mevcut kayıtlarda device_type'a göre screen_mode düzelt
UPDATE pos_terminals SET screen_mode = 'garson' WHERE device_type = 'masa' AND screen_mode = 'pos';
UPDATE pos_terminals SET screen_mode = 'kds' WHERE device_type = 'kds' AND screen_mode = 'pos';
UPDATE pos_terminals SET screen_mode = 'pickup' WHERE device_type = 'pickup' AND screen_mode = 'pos';

-- 3. pair_key kolonunu kaldır (artık sadece activation_code kullanılacak)
ALTER TABLE pos_terminals DROP COLUMN IF EXISTS pair_key;

-- 4. activation_code boş olan kayıtlarda oluştur
UPDATE pos_terminals
SET activation_code = 'SUT-' || UPPER(SUBSTRING(md5(random()::text) FROM 1 FOR 6))
WHERE activation_code IS NULL OR activation_code = '';
```

### Migration'ı Çalıştır

Migration'ı Railway DB'ye uygulamak için geçici bir script kullan:

```js
// Geçici — sadece migration çalıştırmak için
// node server/run-migration-temp.js dosyası zaten varsa onu kullan
// yoksa şöyle çalıştır:
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});
const sql = fs.readFileSync('migrations/022_fix_terminal_screen_mode.sql', 'utf8');
pool.query(sql).then(() => { console.log('Migration OK'); pool.end(); }).catch(e => { console.error(e); pool.end(); });
```

### Governance Kontrol Listesi
- [ ] Migration dosyası `migrations/` klasörüne yazıldı
- [ ] `pair_key` kolonu DROP ediliyor
- [ ] `screen_mode` constraint'i kds ve pickup içeriyor
- [ ] Mevcut kayıtlar device_type'a göre düzeltiliyor
- [ ] Migration Railway'de başarılı çalıştı

---
---

## 📋 GÖREV 2 — `schema-railway-master.sql` Güncelleme

### Önce Oku
`X:\RMSv3\schema-railway-master.sql` — Satır 1034-1053 arası `pos_terminals` tablo tanımı

### Değişiklik

Satır 1052'deki CHECK constraint'i değiştir:

**ESKİ:**
```sql
  CONSTRAINT pos_terminals_screen_mode_check CHECK (screen_mode = ANY (ARRAY['pos'::text, 'garson'::text, 'pos-masa'::text, 'pos-masalar'::text]))
```

**YENİ:**
```sql
  CONSTRAINT pos_terminals_screen_mode_check CHECK (screen_mode = ANY (ARRAY['pos'::text, 'garson'::text, 'pos-masa'::text, 'pos-masalar'::text, 'kds'::text, 'pickup'::text]))
```

Ayrıca tablo tanımına şu kolonları ekle (varsa dokunma, yoksa ekle):
```sql
  device_type     TEXT DEFAULT 'pos',
  is_master       BOOLEAN DEFAULT false NOT NULL,
  config_data     JSONB DEFAULT '{}'::jsonb NOT NULL,
```

> **NOT:** `pair_key` kolonu şemada **OLMAYACAK**. Eğer varsa SİL.

### Governance Kontrol Listesi
- [ ] `screen_mode` constraint'i 6 değeri kapsıyor (pos, garson, pos-masa, pos-masalar, kds, pickup)
- [ ] `pair_key` şemada YOK
- [ ] `device_type`, `is_master`, `config_data` kolonları var

---
---

## 📋 GÖREV 3 — `DeviceSettings.jsx` Düzeltme

### Önce Oku
`X:\RMSv3\src\components\pages\DeviceSettings.jsx` — TAMAMEN oku (480 satır)

### Değişiklik Listesi

Bu dosyada çok sayıda değişiklik var. Aşağıda sırayla:

---

#### 3.1 — `generatePairKey` fonksiyonunu `generateActivationCode` olarak yeniden adlandır

**ESKİ (satır 52-54):**
```js
  const generatePairKey = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }
```

**YENİ:**
```js
  const generateActivationCode = () => {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `SUT-${random}`
  }
```

---

#### 3.2 — `DEVICE_TYPE_TO_SCREEN_MODE` eşleme tablosu ekle

`generateActivationCode` fonksiyonundan **hemen sonra** şunu ekle:

```js
  // device_type → screen_mode eşlemesi (DB'ye yazılacak)
  const DEVICE_TYPE_TO_SCREEN_MODE = {
    pos: 'pos',
    masa: 'garson',
    kds: 'kds',
    pickup: 'pickup',
    queue_screen: 'pos',
    kiosk: 'pos',
    kiosk_tablet: 'pos',
  }
```

---

#### 3.3 — `kdsDevices` ve `pickupDevices` değişkenlerini tanımla

`hasMaster` ve `sourceDevices` satırlarından **hemen sonra** (satır 183-184 civarı) şunları ekle:

**ESKİ (satır 183-184):**
```js
  const hasMaster = devices.some(d => d.is_master)
  const sourceDevices = devices.filter(d => ['pos', 'masa', 'kiosk', 'kiosk_tablet'].includes(d.device_type))
```

**YENİ:**
```js
  const hasMaster = devices.some(d => d.is_master)
  const sourceDevices = devices.filter(d => ['pos', 'masa', 'kiosk', 'kiosk_tablet'].includes(d.device_type))
  const kdsDevices = devices.filter(d => d.device_type === 'kds')
  const pickupDevices = devices.filter(d => d.device_type === 'pickup')
```

---

#### 3.4 — Yeni cihaz oluşturma (insert) bloğunu düzelt

**ESKİ (satır 95-106):**
```js
    const generatedPairKey = generatePairKey()
    const newDevice = {
      terminal_id: crypto.randomUUID(),
      branch_id: branchId,
      device_type: formData.device_type,
      is_master: Boolean(formData.is_master),
      terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
      pair_key: generatedPairKey,
      activation_code: `SUT-${generatedPairKey}`,
      is_used: false,
      config_data: formData.config_data ?? {}
    }
```

**YENİ:**
```js
    const newDevice = {
      terminal_id: crypto.randomUUID(),
      branch_id: branchId,
      device_type: formData.device_type,
      screen_mode: DEVICE_TYPE_TO_SCREEN_MODE[formData.device_type] || 'pos',
      is_master: Boolean(formData.is_master),
      terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
      activation_code: generateActivationCode(),
      is_used: false,
      config_data: formData.config_data ?? {}
    }
```

> **DİKKAT:** `pair_key` satırı tamamen silindi, `screen_mode` eklendi, `activation_code` artık doğrudan `generateActivationCode()` ile üretiliyor.

---

#### 3.5 — Güncelleme (update) bloğuna `screen_mode` ekle

**ESKİ (satır 71-77):**
```js
      const updates = {
        device_type: formData.device_type,
        is_master: Boolean(formData.is_master),
        terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
        config_data: formData.config_data ?? {},
        terminal_name: (formData.terminal_name && formData.terminal_name.trim()) ? formData.terminal_name.trim() : null
      }
```

**YENİ:**
```js
      const updates = {
        device_type: formData.device_type,
        screen_mode: DEVICE_TYPE_TO_SCREEN_MODE[formData.device_type] || 'pos',
        is_master: Boolean(formData.is_master),
        terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
        config_data: formData.config_data ?? {},
        terminal_name: (formData.terminal_name && formData.terminal_name.trim()) ? formData.terminal_name.trim() : null
      }
```

---

#### 3.6 — Tablodaki sütun başlığını değiştir

**ESKİ (satır 219):**
```html
              <th className="px-6 py-3">Bağlantı Anahtarı (Pair Key) / URL</th>
```

**YENİ:**
```html
              <th className="px-6 py-3">Aktivasyon Kodu / URL</th>
```

---

#### 3.7 — Tablo gövdesinde `pair_key` → `activation_code` değiştir

**ESKİ (satır 238-248):**
```jsx
                {device.device_type === 'queue_screen' ? (
                    <div style={{ wordBreak: 'break-all' }}>
                      <a href={`/sira-ekrani/${device.pair_key}`} target="_blank" rel="noreferrer" className="text-blue-600 font-mono text-xs hover:underline">
                        {window.location.origin}/sira-ekrani/{device.pair_key}
                      </a>
                    </div>
                  ) : (
                    <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-lg font-bold">
                      {device.pair_key}
                    </span>
                  )}
```

**YENİ:**
```jsx
                {device.device_type === 'queue_screen' ? (
                    <div style={{ wordBreak: 'break-all' }}>
                      <a href={`/sira-ekrani/${device.activation_code}`} target="_blank" rel="noreferrer" className="text-blue-600 font-mono text-xs hover:underline">
                        {window.location.origin}/sira-ekrani/{device.activation_code}
                      </a>
                    </div>
                  ) : (
                    <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-lg font-bold">
                      {device.activation_code}
                    </span>
                  )}
```

---

#### 3.8 — KDS `allowed_sources` bölümünde `pair_key` → `activation_code`

3 satır değişiyor (satır 397, 403, 406):

- `src.pair_key` → `src.activation_code` (3 yerde)

---

#### 3.9 — Pickup `allowed_kds` bölümünde `pair_key` → `activation_code`

3 satır değişiyor (satır 424, 430, 433):

- `kds.pair_key` → `kds.activation_code` (3 yerde)

---

#### 3.10 — Queue Screen `allowed_pickups` bölümünde `pair_key` → `activation_code`

3 satır değişiyor (satır 450, 456, 459):

- `pu.pair_key` → `pu.activation_code` (3 yerde)

---

### Governance Kontrol Listesi
- [ ] `pair_key` kelimesi dosyada **hiç** geçmiyor (grep ile kontrol et)
- [ ] `generatePairKey` fonksiyonu yok, yerine `generateActivationCode` var
- [ ] `screen_mode` hem insert hem update'te set ediliyor
- [ ] `DEVICE_TYPE_TO_SCREEN_MODE` eşleme tablosu var
- [ ] `kdsDevices` ve `pickupDevices` tanımlanmış
- [ ] Tüm `activation_code` büyük harfle üretiliyor
- [ ] Sütun başlığı "Aktivasyon Kodu / URL" olarak değişti

---
---

## 📋 GÖREV 4 — `PairingScreen.jsx` Düzeltme

### Önce Oku
`X:\RMSv3\src\components\pos\PairingScreen.jsx` — TAMAMEN oku (237 satır)

### Değişiklik Listesi

---

#### 4.1 — `finalizePairing` fonksiyonundaki `screenMode` çözümlemesini düzelt

**ESKİ (satır 85-95):**
```js
    // Map device_type to screenMode
    // pos -> pos, masa -> garson (or pos-masalar based on usage), kds -> kds, pickup -> pickup
    let rawMode = String(terminal.screen_mode || terminal.device_type || 'pos').toLowerCase().trim();
    let screenMode = 'pos';
    if (rawMode.includes('masa') || rawMode.includes('garson')) {
      screenMode = 'garson';
    } else if (rawMode.includes('kds')) {
      screenMode = 'kds';
    } else if (rawMode.includes('pickup')) {
      screenMode = 'pickup';
    }
```

**YENİ:**
```js
    // device_type birincil kaynak — screen_mode sadece fallback
    const DEVICE_TO_SCREEN = {
      pos: 'pos',
      masa: 'garson',
      garson: 'garson',
      kds: 'kds',
      pickup: 'pickup',
      'pos-masa': 'garson',
      'pos-masalar': 'garson',
    }
    const deviceType = String(terminal.device_type || '').toLowerCase().trim()
    const screenModeRaw = String(terminal.screen_mode || '').toLowerCase().trim()
    const screenMode = DEVICE_TO_SCREEN[deviceType] || DEVICE_TO_SCREEN[screenModeRaw] || 'pos'
```

---

#### 4.2 — `handleVerifyCode`'da büyük/küçük harf normalleştirme

**ESKİ (satır 31):**
```js
      const searchCode = pairKey.startsWith('SUT-') ? pairKey : `SUT-${pairKey}`;
```

**YENİ:**
```js
      const normalizedInput = pairKey.toUpperCase().trim();
      const searchCode = normalizedInput.startsWith('SUT-') ? normalizedInput : `SUT-${normalizedInput}`;
```

---

#### 4.3 — `is_used` update sorgusunu düzelt (mevcut syntax hatalı)

**ESKİ (satır 52):**
```js
          await db.from('pos_terminals').eq('id', res[0].id).update({ is_used: true });
```

**YENİ:**
```js
          await db.from('pos_terminals').update({ is_used: true }).eq('id', res[0].id);
```

---

### Governance Kontrol Listesi
- [ ] `DEVICE_TO_SCREEN` eşleme tablosu var
- [ ] `device_type` **birincil** kaynak olarak kullanılıyor
- [ ] Büyük/küçük harf normalizasyonu yapılıyor
- [ ] `update().eq()` sırası düzeltildi

---
---

## 📋 GÖREV 5 — Kiosk Dosyalarında `pair_key` → `activation_code`

### Önce Oku
Aşağıdaki 3 dosyayı oku ve içlerinde `pair_key` geçen satırları bul:

1. `X:\RMSv3\src\components\pages\KioskBig.jsx`
2. `X:\RMSv3\src\components\pages\KioskTablet.jsx`
3. `X:\RMSv3\src\components\pages\KioskManagementDesktop.jsx`

### Değişiklik

Her üç dosyada da `pair_key` → `activation_code` olarak değiştir:

**`KioskBig.jsx`:**
- Satır 2747: `code: device.pair_key,` → `code: device.activation_code,`
- Satır 2824: `code: device.pair_key,` → `code: device.activation_code,`

**`KioskTablet.jsx`:**
- Satır 2943: `code: device.pair_key,` → `code: device.activation_code,`
- Satır 3023: `code: device.pair_key,` → `code: device.activation_code,`

**`KioskManagementDesktop.jsx`:**
- Satır 908: `code: device.pair_key,` → `code: device.activation_code,`

### Governance Kontrol Listesi
- [ ] `pair_key` kelimesi bu 3 dosyada **hiç** geçmiyor
- [ ] `activation_code` ile değiştirildi

---
---

## 🔍 SON DOĞRULAMA ADIMLARI

Agent tüm görevleri tamamladıktan sonra şu kontrolleri yap:

### 1. Tüm Projede `pair_key` Taraması
```bash
rg -n "pair_key" src/ --glob "*.jsx" --glob "*.js"
```
**Beklenen sonuç:** 0 sonuç. Hiçbir dosyada `pair_key` kalmamış olmalı.

### 2. Build Kontrolleri
```bash
npm run build
npm run build:desktop:web
```
**Her ikisi de hatasız tamamlanmalı.**

### 3. Migration Doğrulama
Migration çalıştırıldıktan sonra Railway DB'den kontrol et.

### 4. grep kontrolü: Yeni eklenen değişkenler
```bash
rg -n "kdsDevices|pickupDevices|DEVICE_TYPE_TO_SCREEN_MODE|generateActivationCode" src/components/pages/DeviceSettings.jsx
```
**Beklenen:** Tanımlar bulunmalı.

---
---

## ⚠️ YAPILMAYACAKLAR

1. `DesktopPosApp.jsx` değiştirilmeyecek — zaten doğru çalışıyor
2. `terminalIdentity.js` değiştirilmeyecek — zaten doğru çalışıyor
3. `terminalConfig.cjs` değiştirilmeyecek
4. `main.cjs` değiştirilmeyecek
5. `preload.cjs` değiştirilmeyecek
6. KDS.jsx, PickupScreen.jsx, POS.jsx, Garson.jsx değiştirilmeyecek
7. Yeni dosya oluşturulmayacak (migration hariç)
8. `localStorage`, `sessionStorage` ile mock veri yapılmayacak

---

## 📝 OperationSync Kaydı

Tüm görevler tamamlandıktan sonra `OperationSync.md` dosyasına yeni bir entry ekle:

```
## Entry - Desktop Pairing & Routing Architecture Fix

- Timestamp: [tarih]
- Agent: [agent adı]
- Task: Fix desktop terminal pairing flow — wrong screen routing, missing variables, pair_key removal
- Files Changed:
  - migrations/022_fix_terminal_screen_mode.sql (YENİ)
  - schema-railway-master.sql
  - src/components/pages/DeviceSettings.jsx
  - src/components/pos/PairingScreen.jsx
  - src/components/pages/KioskBig.jsx
  - src/components/pages/KioskTablet.jsx
  - src/components/pages/KioskManagementDesktop.jsx
- Decisions: pair_key tamamen kaldırıldı, activation_code tek anahtar oldu, screen_mode constraint genişletildi
- Next Step: Kullanıcı desktop build yaparak test etmeli
```

