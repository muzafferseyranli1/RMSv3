-- ============================================================
-- Migration: Operasyon El Kitabı (Operation Manual) Altyapısı
-- Tarih: 2026-06-06
-- Açıklama: El kitabı kategorileri, sayfaları ve ilişkili ekipmanları tanımlar
-- ============================================================

BEGIN;

-- 1. Create equipment_definitions table
CREATE TABLE IF NOT EXISTS public.equipment_definitions (
  id                       UUID DEFAULT gen_random_uuid() NOT NULL,
  name                     TEXT NOT NULL,
  image_url                TEXT,
  maintenance_period_days  INTEGER,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT equipment_definitions_pkey PRIMARY KEY (id)
);

-- 2. Create manual_categories table
CREATE TABLE IF NOT EXISTS public.manual_categories (
  id             UUID DEFAULT gen_random_uuid() NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  display_order  INTEGER DEFAULT 0 NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT manual_categories_pkey PRIMARY KEY (id)
);

-- 3. Create manual_pages table
CREATE TABLE IF NOT EXISTS public.manual_pages (
  id                    UUID DEFAULT gen_random_uuid() NOT NULL,
  category_id           UUID NOT NULL,
  title                 TEXT NOT NULL,
  content               TEXT,
  version               INTEGER DEFAULT 1 NOT NULL,
  last_updated_by_pin   TEXT,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT manual_pages_pkey PRIMARY KEY (id),
  CONSTRAINT manual_pages_category_fkey FOREIGN KEY (category_id) REFERENCES public.manual_categories(id) ON DELETE CASCADE
);

-- 4. Create manual_page_equipments table (Many-to-Many)
CREATE TABLE IF NOT EXISTS public.manual_page_equipments (
  page_id                  UUID NOT NULL,
  equipment_definition_id  UUID NOT NULL,
  CONSTRAINT manual_page_equipments_pkey PRIMARY KEY (page_id, equipment_definition_id),
  CONSTRAINT manual_page_equipments_page_fkey FOREIGN KEY (page_id) REFERENCES public.manual_pages(id) ON DELETE CASCADE,
  CONSTRAINT manual_page_equipments_eq_def_fkey FOREIGN KEY (equipment_definition_id) REFERENCES public.equipment_definitions(id) ON DELETE CASCADE
);

-- Seed initial sample equipment definitions
INSERT INTO public.equipment_definitions (name, image_url, maintenance_period_days) VALUES
  ('Espresso Makinesi', '/images/espresso_machine.jpg', 30),
  ('Fritöz', '/images/fryer.jpg', 15),
  ('Endüstriyel Izgara', '/images/grill.jpg', 15),
  ('Buz Makinesi', '/images/ice_machine.png', 60),
  ('Konveksiyonel Fırın', '/images/oven.jpg', 30)
ON CONFLICT DO NOTHING;

-- Seed initial sample categories
INSERT INTO public.manual_categories (name, description, display_order) VALUES
  ('Mutfak Ekipmanları', 'Mutfakta kullanılan cihazların temizlik, güvenlik ve bakım el kitabı.', 1),
  ('Bar & Kahve', 'Kahve barı operasyonel hazırlık ve servis prosedürleri.', 2),
  ('Hijyen & Güvenlik', 'Genel temizlik kuralları ve HACCP standartları.', 3)
ON CONFLICT DO NOTHING;

COMMIT;
