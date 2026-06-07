# Müşteri Anketi Form Yapısı — Uygulama Planı

## Genel Bakış

Bu plan; Müşteri Anketi form tipine özgü **anonim doldurma**, **QR/Link tabanlı yönlendirme**, **Task Manager (Görev Yöneticisi) ekranı** ve **müşteri uygulaması üzerinden anket** özelliklerini kapsamaktadır. Checklist ve Denetim form mantığı referans alınarak, müşteri anketi için benzer ama farklı bir katman inşa edilecektir.

---

## Açık Sorular

> [!IMPORTANT]
> **Masa QR ile uyum:** Mevcut `/q/:token` → `/mobil-app/qr-menu` akışı referans alınacaktır. Anket QR'ları benzer token yapısını kullanacak mı, yoksa ayrı bir token sistemi mi kurulsun?
>
> **Task Manager kimliği:** Şimdilik merkeze giriş yapan herkes Task Manager sayfasına erişebilir. İleride hangi koşula göre kısıtlanacak — pozisyona mı, özel bir `is_task_manager` bayrağına mı?
>
> **PDF yazdırma:** QR'lar PDF olarak çıktı alınacak. Masa QR yazdırma adımları incelenecek (`KioskManagementDesktop.jsx`). Aynı bileşen mi kullanılsın yoksa bağımsız yazdırma yardımcısı mı?
>
> **Müşteri kategorisi:** "Geribildirim veren müşteri" kategorisinin `loyalty_customer_categories` tablosunda var olduğu varsayılmaktadır. Yoksa otomatik seed edilmeli mi?

---

## Önerilen Değişiklikler

### Bileşen 1 — Veritabanı Şeması

---

#### [NEW] `migrations/029_survey_qr_tokens.sql`

Anket QR/Link tokenlarını tutan yeni tablo:
- `id`, `template_id`, `token` (URL-safe benzersiz), `mode` (anonymous/branch/multi_branch), `branch_id`, `branch_ids` (JSONB), `label`, `qr_config` (JSONB), `active`, `created_at`, `updated_at`
- `schema-railway-master.sql` her migration sonrası güncellenecek

---

### Bileşen 2 — Şablon Editörü

---

#### [MODIFY] [FormTemplates.jsx](file:///C:/RMSv3/src/components/pages/FormTemplates.jsx)

**2a. Müşteri Anketi'ne özgü seçenekler (form_type === 'customer_survey'):**

- **Anonim Mod Checkbox:** `schemaJson.survey_config.allow_anonymous = true/false`
  - Seçildiğinde: Atama alanlarında `hidePositions={true}` zorlanır; sadece merkez çalışanı seçilir. Banner: *"Anonim doldurmada tüm atamalar yalnızca merkez çalışanlarına yapılır. Görevi veren: Görev Yöneticisi."*
  - Varsayılan: `true`

- **QR / Link Oluşturma Aracı Kartı:**
  - Şablon kaydedilmişse editörün altında "🔗 Link & QR Yönetimi" kartı açılır
  - Kayıt öncesinde: *"Önce şablonu kaydedin, ardından QR oluşturabilirsiniz"* notu

**2b. Otomatik Görev Oluşturma bloğu (customer_survey için):**

- Anonim mod aktifse:
  - Tüm 3 hedef bölümde `hidePositions={true}` zorlanır
  - "Şube Sorumlularını Otomatik Gözlemci Ekle" checkbox'ı gizlenir
  - "Görevi oluşturan: **Görev Yöneticisi (Task Manager)**" sabit banner
- Şube bağlı QR'da (anonim değil): denetim formundaki normal pozisyon + merkez mantığı

---

### Bileşen 3 — Herkese Açık Anket Doldurma Sayfası

---

#### [NEW] `src/components/pages/PublicSurvey.jsx`

Route: `/anket/:token` — Giriş gerektirmez, müşteriler tarafından doldurulur.

**Akış:**
1. Token → `GET /api/survey-tokens/:token` ile doğrulanır
2. Şablon çekilir, tüm soru tipleri render edilir (rating, emoji, nps, slider, text, select, branch_select vb.)
3. Mod = `anonymous`: şube seçimi gizli, `branch_id = null`
4. Mod = `branch`: `survey_tokens.branch_id` otomatik kullanılır, müşteri seçemez
5. Mod = `multi_branch` veya formda `branch_select` alanı varsa: dropdown ile şube seçimi — bu Kural 2'yi (şube bazlı atama) tetikler
6. `submitted_by = null`, `metadata.source = 'public_survey'`, `metadata.token_id = token.id`
7. Gönderim sonrası teşekkür ekranı
8. DESIGN_HANDBOOK_V3_TR.md standartları, mobil-önce tasarım

---

#### [MODIFY] `server/index.js` — Survey Token API Endpoint'leri

```
GET  /api/survey-tokens/:token        → token + şablon bilgisi (auth yok, public)
GET  /api/survey-tokens?templateId=X  → şablona ait token listesi
POST /api/survey-tokens               → yeni token oluştur (merkez)
DELETE /api/survey-tokens/:id         → token sil/deaktive et
GET  /api/branches/list               → anket için public şube listesi
```

---

### Bileşen 4 — QR / Link Yönetim Paneli

---

#### [MODIFY] [FormTemplates.jsx](file:///C:/RMSv3/src/components/pages/FormTemplates.jsx) — QR Yönetim Kartı

Kayıtlı `customer_survey` şablonu editörünün altında "🔗 Link & QR Yönetimi" kartı:

**QR Oluşturma Modal Adımları:**

| Adım | İçerik |
|------|--------|
| 1 | Mod: **Anonim** / **Belirli Şube** / **Çoklu Şube** / **Tüm Şubeler (her biri için ayrı QR)** |
| 2 | Şube seçimi (anonim değilse) |
| 3 | Etiket/isim (opsiyonel) |
| 4 | Oluştur → API çağrısı |

**Oluşturulan Token Listesi:**
- Her token için: etiket, mod, şube adı, URL, QR önizleme küçüğü
- **"PDF Yazdır"** butonu: Seçilen token(ları) A4 sayfaya sığdırılmış QR PDF olarak çıktı
  - `qrcode` veya `qrcode.react` kütüphanesi + `window.print()` CSS print media query
  - Her QR altında: şube adı, form adı, tarih
  - A4 sayfaya sığacak düzende (2×2 veya 3×3)
- **"Linki Kopyala"** butonu
- **"Deaktive Et"** butonu

---

### Bileşen 5 — `formService.js` Müşteri Anketi Görev Atama Mantığı

---

#### [MODIFY] [formService.js](file:///C:/RMSv3/src/lib/formService.js)

**Yeni `createTaskFromCustomerSurvey` fonksiyonu** — `submitFormResponse` içinde `form_type === 'customer_survey'` algılanınca çağrılır:

```
Karar ağacı:
1. Anonim mı? (submitted_by == null)
   → created_by_personnel_id = NULL
   → tasks.metadata.created_by_label = 'Görev Yöneticisi'

2. branch_id dolu mu? (şube bağlı QR veya müşteri branch_select'te şube seçti)
   → Denetim formu mantığı: task_config'deki pozisyonlardaki şube çalışanları + merkez çalışanları
   → Kural 2

3. branch_id yok mu? (anonim + branch seçilmedi)
   → SADECE task_config.assignee.personnel listesindeki merkez çalışanları
   → Kural 1 ve Kural 3

4. Müşteri uygulamasından mı? (metadata.source = 'customer_app')
   → submitted_by = customer_id (loyalty kaydı)
   → Müşteri "Geribildirim Veren Müşteri" kategorisine eklenir
   → Görev atama: formda branch_select varsa ve seçildiyse → Kural 2, yoksa → Kural 3
```

---

### Bileşen 6 — Task Manager (Görev Yöneticisi) Ekranı

---

#### [NEW] `src/components/pages/TaskManager.jsx`

Route: `/gorev-yoneticisi` — Merkez menüsüne erişebilen herkes

**Sekme Yapısı:**

**Sekme 1: Tüm Görevler**
- Sistemdeki tüm görevleri listeler (şube filtresi olmadan)
- Gelişmiş filtreler: durum, öncelik, şube, oluşturan, atanan, tarih aralığı, kaynak (form/manuel)
- Görev detay paneli (drawer/sağ panel):
  - Görev bilgileri, katılımcılar, chat geçmişi görünür
  - **Not yazabilir** (message_type: 'manager_note' olarak kaydedilir)
  - `created_by_personnel_id = null` (Görev Yöneticisi tarafından oluşturulan) görevlerde:
    - **Yeni atama ekle/çıkar** (task_participants güncelleme)
    - **Dosya ekle** (mevcut uploadTaskFile kullanılır)
    - **Şube değiştir** → `branch_node_id` güncellenir → delegation kuralları tetiklenir (eski atanana + yeni atanana bildirim)
  - Başka aksiyon yok (kabul/red/tamamla gizli)

**Sekme 2: Tüm Form Gönderileri**
- Tüm `form_submissions` listesi (tüm form tipleri, şube filtresi olmadan)
- Filtreler: form tipi, şube, durum, tarih, kaynak (anonim/kişi/customer_app)
- Detay modalı: mevcut form detay bileşeni

**Sekme 3: Raporlar**
- Toplam açık görev / form kaynaklı görev / manuel görev
- Geciken görev sayısı
- Bu haftaki anket gönderim sayısı (`form_type = 'customer_survey'`)
- NPS ortalaması (son 30 gün — `answers_json` içinden NPS alanları çekilerek)
- Şubeye göre anket dağılımı (bar grafik veya tablo)
- Ortalama görev tamamlanma süresi

---

#### [MODIFY] [App.jsx](file:///C:/RMSv3/src/App.jsx)

```jsx
// Yeni lazy import'lar:
const TaskManager = lazy(() => import('@/components/pages/TaskManager'))
const PublicSurvey = lazy(() => import('@/components/pages/PublicSurvey'))

// Yeni route'lar:
<Route path="/gorev-yoneticisi" element={<TaskManager />} />
<Route path="/anket/:token" element={<PublicSurvey />} />
```

> [!WARNING]
> `/anket/:token` route'u POS_ROUTES dışında kalmalı ve AuthGate'i bypass etmelidir — müşteriler giriş yapmadan bu sayfaya erişecektir.

---

#### [MODIFY] [Sidebar.jsx](file:///C:/RMSv3/src/components/layout/Sidebar.jsx)

Merkez menüsünde Görevler grubunun altına:
- İkon: `fa-shield-halved`
- Etiket: **Görev Yöneticisi**
- Route: `/gorev-yoneticisi`

---

### Bileşen 7 — Müşteri Uygulaması Anket Entegrasyonu

---

#### Müşteri uygulamasından anket akışı

- `form_type = 'customer_survey'` şablonları müşteri uygulamasında listelenir
- Müşteri doldurursa: `submitted_by = customer_id`, `metadata.source = 'customer_app'`
- Gönderim sonrası: **"Geribildirim Veren Müşteri"** kategorisi müşteriye atanır (`loyalty_customer_category_assignments`)
- Müşteri profil sayfasında anket gönderileri filtrelenebilir liste olarak görünür

#### [MODIFY] `server/index.js` — Ek Endpoint'ler

```
GET  /api/customer-surveys?customerId=X     → müşteriye ait anket gönderileri
POST /api/customer-category-assign          → müşteriyi "Geribildirim Veren" kategorisine ata
```

---

## Doğrulama Planı

### Otomatik Testler
- `npm run build` — sıfır hatayla derleme

### Manuel Doğrulama

| Senaryo | Beklenen Sonuç |
|---------|---------------|
| Anonim QR ile anket doldur (branch_select yok) | `submitted_by=null`, `branch_id=null`, görev yalnızca merkez çalışanlarına |
| Anonim QR ile anket doldur (branch_select var, şube seçildi) | `branch_id` dolu, şube bazlı atama devreye girer |
| Şube bağlı QR ile doldur | `branch_id` otomatik, denetim formundaki atama mantığı çalışır |
| Müşteri uygulamasından doldur | `submitted_by=customer_id`, "Geribildirim Veren" kategorisi atanır |
| Task Manager → not yaz | `task_chat_messages`'a `manager_note` düşer |
| Task Manager → atanan değiştir | `task_participants` güncellenir, bildirim gider |
| Task Manager → şube değiştir | delegation tetiklenir, görev "delege edildi" işaretlenir |
| QR PDF yazdır (çoklu şube) | Her şube için ayrı QR, A4 düzeninde PDF |
| QR token deaktive et | Token sorgusu 404 döner, public sayfa erişimi engellenir |
| Task Manager raporlar | NPS, görev sayıları, anket grafikleri doğru hesaplanır |
