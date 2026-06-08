# RMSv3 İş Akışı (Workflow) Modülü Uygulama Planı

Bu plan, **istemci tarafında çalışan (client-side driven)**, sunucuya ekstra CPU ve trafik yükü getirmeyen, **talep ve onay odaklı** (İzin, Avans, Satın Alma/Masraf talepleri) bir iş akışı motorunun RMSv3 projesine entegre edilmesini kapsamaktadır.

Süreç tasarımı, karmaşık grafik çizimler (React Flow) yerine, hem webde hem mobilde sorunsuz çalışan **Sıralı Adım Sihirbazı (Sequential Step-Builder)** ile yönetilecektir. Taleplere resim/fotoğraf ve PDF/dosya ekleme özellikleri dahil edilecektir.

---

## Veritabanı Değişiklikleri (New Migrations)

Mevcut Railway Postgres veritabanına uygulanacak migration betikleri:

### 1. [NEW] `030_add_workflow_schema.sql` (Veritabanı Şeması)
```sql
-- İş Akışı Tanım Şablonları (Taslaklar)
CREATE TABLE IF NOT EXISTS public.workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'published', -- draft, published, archived
    workflow_type VARCHAR(50) NOT NULL, -- leave, advance, expense, purchase, custom
    blueprint JSONB NOT NULL, -- Düğümler (adımlar) ve geçiş kuralları
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Çalışan İş Akışı Örnekleri (Talepler)
CREATE TABLE IF NOT EXISTS public.workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID REFERENCES public.workflow_definitions(id) ON DELETE RESTRICT,
    definition_version INT NOT NULL,
    current_node_id VARCHAR(100) NOT NULL, -- Akışın beklediği adım ID'si
    status VARCHAR(20) DEFAULT 'running' NOT NULL, -- running, completed, rejected, cancelled
    context_data JSONB DEFAULT '{}'::jsonb NOT NULL, -- Form girdileri, resim ve dosya URL'leri
    started_by VARCHAR(255) NOT NULL, -- Talep sahibi personel ID
    started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ,
    company_id UUID
);

-- İş Akışı Durum Geçiş Geçmişi (Denetim İzi)
CREATE TABLE IF NOT EXISTS public.workflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
    from_node_id VARCHAR(100),
    to_node_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- submit, approve, reject, cancel, return_to_start
    actor_id VARCHAR(255) NOT NULL, -- Eylemi yapan personel ID
    notes TEXT,
    delta_data JSONB DEFAULT '{}'::jsonb, -- Bu adımda eklenen veriler/dosyalar
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Performans için İndeksler
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON public.workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_started_by ON public.workflow_instances(started_by);
CREATE INDEX IF NOT EXISTS idx_workflow_history_instance_id ON public.workflow_history(instance_id);
```

---

## Servis Katmanı Tasarımı

### 2. [NEW] `src/lib/workflowService.js` (İş Akışı Mantığı)
Tüm akış yönetimi, kullanıcı eylemleriyle tetiklenecektir. Bu servis şunları içerecektir:
- `createWorkflowInstance(definitionId, formData)`: Yeni bir talep/akış başlatır. İlk adımı (`Start`) işler ve sıradaki onay adımını belirleyip müdüre onay görevi atar.
- `advanceWorkflow(instanceId, action, actorId, notes, deltaData)`: İlgili müdür onay veya ret verdiğinde tetiklenir:
  - Mevcut onay görevini (`task`) kapatır.
  - `workflow_history` tablosuna geçiş kaydını yazar.
  - Akışın durumunu (`completed`/`rejected`) veya sıradaki adımın onay görevini oluşturur.
- `evaluateCondition(condition, contextData)`: "Tutar > 5.000 TL ise bu adıma geç" gibi basit client-side koşul kontrollerini yapar.

---

## Arayüz Bileşenleri (Frontend UI)

### 3. [NEW] `src/components/pages/workflows/WorkflowDesigner.jsx` (Sıralı Tasarımcı)
*   React Flow yerine **Tailwind tabanlı Sıralı Kart Tasarımı** kullanılacaktır.
*   Her adım bir kart olarak listelenir, "Yukarı/Aşağı" butonlarıyla sıralaması değiştirilebilir.
*   **Adım Seçenekleri:**
    *   **Adım Tipi:** Onay İsteme (Human Approval) veya Otomatik Görev (Automated Task).
    *   **Onaylayacak Pozisyon:** Şube Müdürü, Muhasebe Müdürü, Bölge Müdürü vb. (Hiyerarşiden çekilir).
    *   **Reddedilirse Ne Yapılsın?:** Talebi tamamen iptal et / Bir önceki adıma geri gönder / Başlangıca geri gönder.

### 4. [NEW] `src/components/pages/workflows/WorkflowFormRenderer.jsx` (Talep Formu ve Dosya Yükleme)
*   Seçilen form şablonunu dinamik olarak render eder.
*   **Resim ve Dosya Desteği:**
    *   Kullanıcıya görsel bir dosya yükleme alanı (Drag & Drop) sunulur.
    *   Dosyalar yüklenirken `/api/upload` API'sine gönderilir ve gelen URL `context_data` nesnesine yazılır.
    *   Onaylayacak kişi (Müdür) ekranında bu resimleri doğrudan görüntüler, dosyaları indirebilir.

### 5. [NEW] `src/components/pages/workflows/WorkflowInstancesList.jsx` (Taleplerim ve Onay Bekleyenler)
*   **Taleplerim:** Personelin kendi açtığı talepler (İzin, Avans vb.) ve bunların güncel onay durumları (Örn: "2/3 Onayda - Finans Onayı Bekliyor").
*   **Onay Bekleyenler:** Giriş yapan yöneticinin önüne düşen, onaylaması gereken aktif talepler.

---

## Görevler (Tasks) Modülü Entegrasyonu

Mevcut görev modülü, iş akışlarının onay motoru olarak kullanılacaktır:
*   Bir onay adımı tetiklendiğinde, onaylayacak kişiye `linked_entity_table = 'workflow_instances'` ve `linked_entity_id = instanceId` olan bir görev oluşturulur.
*   `TaskDrawer.jsx` bileşeninde, eğer görevin `linked_entity_table` değeri `workflow_instances` ise, klasik görev tamamlama alanı yerine **İş Akışı Talep Formu Detayı ve [ONAYLA] / [REDDET] Butonları** render edilir.
*   Yönetici bu butonlara bastığında `advanceWorkflow` servisi tetiklenir ve süreç ilerler.

---

## Doğrulama ve Test Planı

### Otomatik Testler
- İzin akışının doğrusal onay zincirinin test edilmesi.
- Tutar sınırı koşullu dallanmanın (örn: > 5.000 TL ise ekstra onay) test edilmesi.
- Hatalı dosya yükleme durumlarının simüle edilmesi.

### Manuel Doğrulama
- Masraf talebi açıp fiş görseli (JPEG) ve PDF fatura yükleme.
- İlgili yöneticinin bu görselleri kendi panelinde görüntüleyip onaylaması.
- Akışın her adımında `workflow_history` tablosuna doğru logların atıldığının DB sorgusuyla kontrolü.
