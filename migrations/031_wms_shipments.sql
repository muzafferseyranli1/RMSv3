-- Create vehicles table
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  plate_number TEXT NOT NULL,
  model TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_plate_number_key UNIQUE (plate_number)
);

-- Create warehouse_shipments table
CREATE TABLE IF NOT EXISTS public.warehouse_shipments (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  shipment_no TEXT NOT NULL,
  source_branch_id UUID NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  plate_number TEXT,
  driver_info TEXT,
  status TEXT DEFAULT 'draft'::text NOT NULL,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_shipments_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_shipments_shipment_no_key UNIQUE (shipment_no),
  CONSTRAINT warehouse_shipments_status_check CHECK (status = ANY (ARRAY['draft'::text, 'ready_to_load'::text, 'in_transit'::text, 'delivered'::text, 'cancelled'::text]))
);

-- Create warehouse_shipment_orders table
CREATE TABLE IF NOT EXISTS public.warehouse_shipment_orders (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  shipment_id UUID NOT NULL REFERENCES public.warehouse_shipments(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_shipment_orders_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_shipment_orders_uq UNIQUE (shipment_id, purchase_order_id)
);

-- Create warehouse_shipment_lines table
CREATE TABLE IF NOT EXISTS public.warehouse_shipment_lines (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  shipment_id UUID NOT NULL REFERENCES public.warehouse_shipments(id) ON DELETE CASCADE,
  purchase_order_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  shipped_qty NUMERIC(18,4) NOT NULL,
  unit_price NUMERIC(18,4) DEFAULT 0 NOT NULL,
  line_total NUMERIC(18,4) DEFAULT 0 NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_shipment_lines_pkey PRIMARY KEY (id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS vehicles_active_idx ON public.vehicles(active);
CREATE INDEX IF NOT EXISTS warehouse_shipments_source_branch_idx ON public.warehouse_shipments(source_branch_id);
CREATE INDEX IF NOT EXISTS warehouse_shipments_vehicle_idx ON public.warehouse_shipments(vehicle_id);
CREATE INDEX IF NOT EXISTS warehouse_shipments_status_idx ON public.warehouse_shipments(status);
