-- Create warehouse_reservations table
CREATE TABLE IF NOT EXISTS public.warehouse_reservations (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  lot_number TEXT,
  expiration_date DATE,
  source_doc_type TEXT NOT NULL,
  source_doc_id UUID NOT NULL,
  source_line_id UUID,
  reserved_qty NUMERIC(18,4) NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  reserved_by TEXT,
  reserved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_reservations_status_check CHECK (status = ANY (ARRAY['active'::text, 'consumed'::text, 'released'::text, 'cancelled'::text, 'expired'::text])),
  CONSTRAINT warehouse_reservations_qty_check CHECK (reserved_qty > 0)
);

-- Idempotent index creation using DO block
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_warehouse_reservations_branch') THEN
    CREATE INDEX idx_warehouse_reservations_branch ON public.warehouse_reservations(branch_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_warehouse_reservations_stock_item') THEN
    CREATE INDEX idx_warehouse_reservations_stock_item ON public.warehouse_reservations(stock_item_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_warehouse_reservations_location') THEN
    CREATE INDEX idx_warehouse_reservations_location ON public.warehouse_reservations(location_id) WHERE location_id IS NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_warehouse_reservations_lpn') THEN
    CREATE INDEX idx_warehouse_reservations_lpn ON public.warehouse_reservations(lpn_id) WHERE lpn_id IS NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_warehouse_reservations_status') THEN
    CREATE INDEX idx_warehouse_reservations_status ON public.warehouse_reservations(status);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_warehouse_reservations_source') THEN
    CREATE INDEX idx_warehouse_reservations_source ON public.warehouse_reservations(source_doc_type, source_doc_id);
  END IF;
END $$;
