-- WMS Phase 4.5: vehicles expansion and stock_items temperature class
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_code TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS temperature_class TEXT,
  ADD COLUMN IF NOT EXISTS max_volume_m3 NUMERIC,
  ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS inner_length_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS inner_width_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS inner_height_cm NUMERIC,
  ADD COLUMN IF NOT EXISTS branch_id UUID,
  ADD COLUMN IF NOT EXISTS capacity_notes TEXT;

-- Re-apply check constraints to avoid duplicates/errors
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_type_check CHECK (vehicle_type IN ('truck', 'van', 'pickup', 'container', 'other'));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_temperature_class_check;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_temperature_class_check CHECK (temperature_class IN ('dry', 'cold', 'frozen', 'multi_temp'));

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_code_key;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_vehicle_code_key UNIQUE (vehicle_code);

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_branch_id_fkey;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.company_nodes(id) ON DELETE SET NULL;

-- Add temperature_class to stock_items
ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS temperature_class TEXT;

ALTER TABLE public.stock_items DROP CONSTRAINT IF EXISTS stock_items_temperature_class_check;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_temperature_class_check CHECK (temperature_class IN ('dry', 'cold', 'frozen'));
