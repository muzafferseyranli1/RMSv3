ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_address_id UUID,
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'sales'
      AND constraint_name = 'sales_customer_address_id_fkey'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_customer_address_id_fkey
      FOREIGN KEY (customer_address_id)
      REFERENCES public.customer_addresses(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.branch_addresses (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  branch_name TEXT NOT NULL,
  city_id TEXT,
  city_name TEXT,
  district_id TEXT,
  district_name TEXT,
  neighborhood_id TEXT,
  neighborhood_name TEXT,
  street TEXT,
  line_1 TEXT,
  is_primary BOOLEAN DEFAULT true NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT branch_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT branch_addresses_branch_id_key UNIQUE (branch_id)
);

CREATE TABLE IF NOT EXISTS public.branch_service_coverage (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  branch_name TEXT NOT NULL,
  city_id TEXT,
  city_name TEXT,
  district_id TEXT,
  district_name TEXT,
  neighborhood_id TEXT,
  neighborhood_name TEXT,
  priority INTEGER DEFAULT 100 NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT branch_service_coverage_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_sales_customer_address_id
  ON public.sales USING btree (customer_address_id);

CREATE INDEX IF NOT EXISTS idx_branch_addresses_active_branch
  ON public.branch_addresses USING btree (branch_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_branch_addresses_city_district_neighborhood
  ON public.branch_addresses USING btree (city_id, district_id, neighborhood_id)
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS idx_branch_service_coverage_active_branch
  ON public.branch_service_coverage USING btree (branch_id, priority)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_branch_service_coverage_city_district_neighborhood
  ON public.branch_service_coverage USING btree (city_id, district_id, neighborhood_id, priority)
  WHERE deleted_at IS NULL AND active = true;
