-- Create equipments table
CREATE TABLE IF NOT EXISTS public.equipments (
  id          UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id   TEXT,
  name        TEXT NOT NULL,
  code        TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT equipments_pkey PRIMARY KEY (id)
);

-- Create maintenance_tickets table
CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id                    UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id             TEXT,
  equipment_id          UUID,
  description           TEXT,
  status                TEXT DEFAULT 'open' NOT NULL,
  repair_cost           NUMERIC(12,2),
  repair_currency       VARCHAR(3),
  repair_exchange_rate  NUMERIC(12,4),
  form_submission_id    UUID,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT maintenance_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT maintenance_tickets_equipment_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipments(id) ON DELETE SET NULL,
  CONSTRAINT maintenance_tickets_status_check CHECK (status = ANY (ARRAY['open', 'in_progress', 'resolved', 'closed']))
);

-- Alter form_templates to add cost requirements and linked entity
ALTER TABLE public.form_templates 
  ADD COLUMN IF NOT EXISTS requires_cost_input BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_entity_table TEXT DEFAULT NULL;

-- Alter form_submissions to add repair cost and linked entity
ALTER TABLE public.form_submissions
  ADD COLUMN IF NOT EXISTS linked_entity_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS repair_cost NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS repair_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS repair_exchange_rate NUMERIC(12,4);

-- Seed some sample equipments safely
INSERT INTO public.equipments (name, code, active)
SELECT 'Espresso Makinesi', 'EQ-ESP-01', true
WHERE NOT EXISTS (SELECT 1 FROM public.equipments WHERE code = 'EQ-ESP-01');

INSERT INTO public.equipments (name, code, active)
SELECT 'Endüstriyel Izgara', 'EQ-GRI-02', true
WHERE NOT EXISTS (SELECT 1 FROM public.equipments WHERE code = 'EQ-GRI-02');

INSERT INTO public.equipments (name, code, active)
SELECT 'Fritöz', 'EQ-FRY-03', true
WHERE NOT EXISTS (SELECT 1 FROM public.equipments WHERE code = 'EQ-FRY-03');

INSERT INTO public.equipments (name, code, active)
SELECT 'Buz Makinesi', 'EQ-ICE-04', true
WHERE NOT EXISTS (SELECT 1 FROM public.equipments WHERE code = 'EQ-ICE-04');

INSERT INTO public.equipments (name, code, active)
SELECT 'Konveksiyonel Fırın', 'EQ-OVN-05', true
WHERE NOT EXISTS (SELECT 1 FROM public.equipments WHERE code = 'EQ-OVN-05');
