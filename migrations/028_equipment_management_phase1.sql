-- ============================================================
-- Migration 028: Equipment Management Phase 1
-- Tarih: 2026-06-06
-- Açıklama:
--   1. equipment_definitions tablosuna eksik sütunlar eklenir
--      (description, purpose, useful_life_months, active)
--   2. equipment_instances tablosu oluşturulur (fiziksel envanter)
--   3. equipment_transfers tablosu oluşturulur (transfer akışı)
--   4. maintenance_tickets tablosuna eksik sütunlar eklenir
--      (equipment_instance_id FK, reported_by_pin, issue_description,
--       resolved_at) ve kural motoru kaydı oluşturulur
-- ============================================================

-- ------------------------------------------------------------
-- 1. equipment_definitions: eksik sütunlar
-- ------------------------------------------------------------

ALTER TABLE public.equipment_definitions
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS purpose           TEXT,
  ADD COLUMN IF NOT EXISTS useful_life_months INTEGER,
  ADD COLUMN IF NOT EXISTS active            BOOLEAN DEFAULT true NOT NULL;


-- ------------------------------------------------------------
-- 2. equipment_instances (Fiziksel Envanter Tablosu)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_instances (
  id                          UUID DEFAULT gen_random_uuid() NOT NULL,
  definition_id               UUID NOT NULL,
  current_location_id         TEXT NOT NULL,          -- branch_id (TEXT, mevcut şube yapısıyla uyumlu)
  serial_number               TEXT,
  status                      TEXT DEFAULT 'active' NOT NULL,
  installed_at                DATE,
  purchase_date               DATE,
  purchase_price              NUMERIC(14,2),
  currency                    VARCHAR(10) DEFAULT 'TRY' NOT NULL,
  purchase_exchange_rate      NUMERIC(12,4) DEFAULT 1.0,  -- alım tarihindeki kur (TRY için 1)
  legacy_accumulated_depreciation NUMERIC(14,2) DEFAULT 0, -- devir amortisman
  warranty_end_date           DATE,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                  TIMESTAMPTZ DEFAULT now() NOT NULL,

  CONSTRAINT equipment_instances_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_instances_definition_fkey
    FOREIGN KEY (definition_id) REFERENCES public.equipment_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT equipment_instances_status_check
    CHECK (status = ANY (ARRAY['active', 'in_repair', 'transferred', 'decommissioned']))
);

CREATE INDEX IF NOT EXISTS idx_equipment_instances_definition ON public.equipment_instances (definition_id);
CREATE INDEX IF NOT EXISTS idx_equipment_instances_location   ON public.equipment_instances (current_location_id);
CREATE INDEX IF NOT EXISTS idx_equipment_instances_status     ON public.equipment_instances (status);


-- ------------------------------------------------------------
-- 3. equipment_transfers (Transfer Tablosu)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.equipment_transfers (
  id                    UUID DEFAULT gen_random_uuid() NOT NULL,
  equipment_instance_id UUID NOT NULL,
  from_location_id      TEXT NOT NULL,
  to_location_id        TEXT NOT NULL,
  status                TEXT DEFAULT 'pending' NOT NULL,
  notes                 TEXT,
  transferred_at        TIMESTAMPTZ,
  transferred_by_pin    TEXT,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,

  CONSTRAINT equipment_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_transfers_instance_fkey
    FOREIGN KEY (equipment_instance_id) REFERENCES public.equipment_instances(id) ON DELETE CASCADE,
  CONSTRAINT equipment_transfers_status_check
    CHECK (status = ANY (ARRAY['pending', 'completed', 'rejected']))
);

CREATE INDEX IF NOT EXISTS idx_equipment_transfers_instance ON public.equipment_transfers (equipment_instance_id);
CREATE INDEX IF NOT EXISTS idx_equipment_transfers_status   ON public.equipment_transfers (status);


-- ------------------------------------------------------------
-- 4. maintenance_tickets: eksik sütunlar ekle
--    (mevcut equipment_id -> equipments tablosuna FK kalıyor,
--     yeni equipment_instance_id -> equipment_instances tablosuna FK ekleniyor)
-- ------------------------------------------------------------

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS equipment_instance_id UUID,
  ADD COLUMN IF NOT EXISTS reported_by_pin        TEXT,
  ADD COLUMN IF NOT EXISTS issue_description      TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at            TIMESTAMPTZ;

-- equipment_instance_id için FK kısıtı (IF NOT EXISTS benzeri DROP+ADD pattern)
ALTER TABLE public.maintenance_tickets
  DROP CONSTRAINT IF EXISTS maintenance_tickets_instance_fkey;
ALTER TABLE public.maintenance_tickets
  ADD CONSTRAINT maintenance_tickets_instance_fkey
    FOREIGN KEY (equipment_instance_id) REFERENCES public.equipment_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_instance ON public.maintenance_tickets (equipment_instance_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status   ON public.maintenance_tickets (status);


-- ------------------------------------------------------------
-- 5. Form kural motoru: "Ekipman Arıza Bildirim Formu" şablonu
--    Eğer yoksa, requires_cost_input = true ve
--    linked_entity_table = 'maintenance_tickets' olarak oluştur
-- ------------------------------------------------------------

INSERT INTO public.form_templates (
  title,
  description,
  form_type,
  schema_json,
  requires_cost_input,
  linked_entity_table,
  active,
  created_by
)
SELECT
  'Ekipman Arıza Bildirim Formu',
  'Şube ekipmanlarındaki arızaların raporlanması, maliyet ve döviz kuru bilgisi zorunlu kapatma formu.',
  'inspection',
  '{
    "fields": [
      {
        "id": "f_device",
        "type": "equipment_select",
        "label": "Arızalı Ekipman",
        "required": true
      },
      {
        "id": "f_desc",
        "type": "textarea",
        "label": "Arıza Açıklaması",
        "required": true
      },
      {
        "id": "f_photo",
        "type": "photo",
        "label": "Fotoğraf (opsiyonel)",
        "required": false
      }
    ]
  }'::jsonb,
  true,
  'maintenance_tickets',
  true,
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM public.form_templates
  WHERE linked_entity_table = 'maintenance_tickets'
    AND deleted_at IS NULL
);
