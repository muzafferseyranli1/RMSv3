-- ============================================================
-- Migration: Şikayet/Geri Bildirim & Esnek Form/Denetim Altyapısı
-- Tarih: 2026-05-25
-- Açıklama: Mevcut table_feedback tablosunu genişletir, 9 yeni tablo oluşturur
-- ============================================================

BEGIN;

-- ============================================================
-- 1. MEVCUT table_feedback TABLOSU GENİŞLETME
-- ============================================================

ALTER TABLE public.table_feedback
  ADD COLUMN IF NOT EXISTS order_id      UUID,
  ADD COLUMN IF NOT EXISTS item_ratings  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_info  JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS staff_id      TEXT,
  ADD COLUMN IF NOT EXISTS ticket_id     UUID,
  ADD COLUMN IF NOT EXISTS metadata      JSONB DEFAULT '{}'::jsonb;

-- source constraint genişletme (yeni kanallar ekleniyor)
ALTER TABLE public.table_feedback
  DROP CONSTRAINT IF EXISTS table_feedback_source_check;
ALTER TABLE public.table_feedback
  ADD CONSTRAINT table_feedback_source_check CHECK (
    source = ANY (ARRAY['qr_menu','call_center','social_media','google_review','digital_receipt','tablet','manual'])
  );

-- ============================================================
-- 2. ticket_categories — Yönetilebilir Bilet Kategorileri
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id          UUID DEFAULT gen_random_uuid() NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  icon        TEXT DEFAULT 'fa-tag',
  color       TEXT DEFAULT '#64748b',
  sort_order  INTEGER DEFAULT 0 NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ticket_categories_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_categories_slug_key UNIQUE (slug)
);

INSERT INTO public.ticket_categories (name, slug, icon, color, sort_order) VALUES
  ('Yemek Kalitesi', 'food_quality', 'fa-utensils', '#ef4444', 1),
  ('Hijyen',         'hygiene',      'fa-broom',    '#f59e0b', 2),
  ('Servis',         'service',      'fa-user-tie', '#3b82f6', 3),
  ('Ekipman',        'equipment',    'fa-wrench',   '#8b5cf6', 4),
  ('Diğer',          'other',        'fa-tag',      '#64748b', 5)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 3. sla_policies — Global SLA Politikaları
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id                UUID DEFAULT gen_random_uuid() NOT NULL,
  name              TEXT NOT NULL,
  sla_level         TEXT NOT NULL,
  deadline_minutes  INTEGER NOT NULL,
  escalation_to     TEXT,
  auto_create_task  BOOLEAN DEFAULT true,
  active            BOOLEAN DEFAULT true,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT sla_policies_pkey PRIMARY KEY (id),
  CONSTRAINT sla_policies_level_unique UNIQUE (sla_level)
);

INSERT INTO public.sla_policies (name, sla_level, deadline_minutes) VALUES
  ('Kritik (15dk)',    'critical_15min', 15),
  ('Acil (1 saat)',    'urgent_1h',      60),
  ('Standart (24 saat)', 'standard_24h', 1440),
  ('Düşük (48 saat)',  'low_48h',        2880)
ON CONFLICT (sla_level) DO NOTHING;

-- ============================================================
-- 4. tickets — Şikayet/Görev Biletleri
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id                  UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id           TEXT NOT NULL,
  feedback_id         UUID,
  form_submission_id  UUID,
  task_id             UUID,
  origin_type         TEXT NOT NULL,
  category_id         UUID,
  priority            TEXT DEFAULT 'normal',
  status              TEXT DEFAULT 'open',
  assigned_to         TEXT,
  sla_level           TEXT DEFAULT 'standard_24h',
  sla_deadline_at     TIMESTAMPTZ,
  sla_breached        BOOLEAN DEFAULT false,
  resolution_note     TEXT,
  winback_coupon_id   TEXT,
  resolved_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT tickets_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_origin_check CHECK (origin_type = ANY (ARRAY['feedback','inspection','manual'])),
  CONSTRAINT tickets_status_check CHECK (status = ANY (ARRAY['open','assigned','in_progress','waiting','resolved','closed'])),
  CONSTRAINT tickets_priority_check CHECK (priority = ANY (ARRAY['low','normal','high','critical'])),
  CONSTRAINT tickets_feedback_fkey FOREIGN KEY (feedback_id) REFERENCES table_feedback(id) ON DELETE SET NULL,
  CONSTRAINT tickets_category_fkey FOREIGN KEY (category_id) REFERENCES ticket_categories(id) ON DELETE SET NULL,
  CONSTRAINT tickets_task_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline ON public.tickets (sla_deadline_at) WHERE sla_breached = false AND status NOT IN ('resolved','closed');
CREATE INDEX IF NOT EXISTS idx_tickets_branch ON public.tickets (branch_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets (status);

-- table_feedback → tickets FK (geri yön bağlantı)
ALTER TABLE public.table_feedback
  ADD CONSTRAINT table_feedback_ticket_fkey FOREIGN KEY (ticket_id)
    REFERENCES tickets(id) ON DELETE SET NULL;

-- ============================================================
-- 5. ticket_comments — Bilet İç/Dış İletişim
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id          UUID DEFAULT gen_random_uuid() NOT NULL,
  ticket_id   UUID NOT NULL,
  author_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  visibility  TEXT DEFAULT 'internal',
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ticket_comments_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_comments_visibility_check CHECK (visibility = ANY (ARRAY['internal','external'])),
  CONSTRAINT ticket_comments_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments (ticket_id);

-- ============================================================
-- 6. ticket_audit_log — Bilet Durum Geçişleri (Append-Only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_audit_log (
  id            UUID DEFAULT gen_random_uuid() NOT NULL,
  ticket_id     UUID NOT NULL,
  action        TEXT NOT NULL,
  performed_by  TEXT,
  old_value     TEXT,
  new_value     TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ticket_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_audit_log_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_log_ticket ON public.ticket_audit_log (ticket_id);

-- ============================================================
-- 7. form_templates — Dinamik Form Şablonları (Merkez-Only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_templates (
  id                       UUID DEFAULT gen_random_uuid() NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,
  form_type                TEXT DEFAULT 'inspection',
  schema_json              JSONB NOT NULL,
  target_branches          JSONB DEFAULT '[]'::jsonb,
  scoring                  JSONB DEFAULT '{}'::jsonb,
  recurrence               JSONB,
  min_completion_seconds   INTEGER,
  require_geo              BOOLEAN DEFAULT false,
  active                   BOOLEAN DEFAULT true,
  created_by               TEXT,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT form_templates_pkey PRIMARY KEY (id),
  CONSTRAINT form_templates_type_check CHECK (
    form_type = ANY (ARRAY['inspection','customer_survey','personnel_survey','checklist'])
  )
);

-- ============================================================
-- 8. form_submissions — Form Yanıtları
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id                        UUID DEFAULT gen_random_uuid() NOT NULL,
  template_id               UUID NOT NULL,
  branch_id                 TEXT NOT NULL,
  submitted_by              TEXT NOT NULL,
  status                    TEXT DEFAULT 'draft',
  answers_json              JSONB NOT NULL,
  total_score               NUMERIC(8,2),
  max_possible_score        NUMERIC(8,2),
  score_percentage          NUMERIC(5,2),
  geo_latitude              NUMERIC(10,7),
  geo_longitude             NUMERIC(10,7),
  device_timestamp          TIMESTAMPTZ,
  completion_time_seconds   INTEGER,
  is_offline_submission     BOOLEAN DEFAULT false,
  synced_at                 TIMESTAMPTZ,
  metadata                  JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT form_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT form_submissions_status_check CHECK (
    status = ANY (ARRAY['draft','syncing','completed','anomaly'])
  ),
  CONSTRAINT form_submissions_template_fkey FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_branch ON public.form_submissions (branch_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template ON public.form_submissions (template_id);

-- form_submissions → tickets FK ekleme
ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_form_submission_fkey FOREIGN KEY (form_submission_id)
    REFERENCES form_submissions(id) ON DELETE SET NULL;

-- ============================================================
-- 9. form_submission_photos — Form Fotoğrafları
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_submission_photos (
  id              UUID DEFAULT gen_random_uuid() NOT NULL,
  submission_id   UUID NOT NULL,
  field_id        TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_name       TEXT,
  captured_at     TIMESTAMPTZ,
  is_live_capture BOOLEAN DEFAULT false,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT form_submission_photos_pkey PRIMARY KEY (id),
  CONSTRAINT form_submission_photos_submission_fkey FOREIGN KEY (submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_submission_photos_submission ON public.form_submission_photos (submission_id);

COMMIT;
