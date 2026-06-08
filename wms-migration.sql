-- WMS Tabloları ve Kolon Eklemeleri
-- Mevcut olmayan tablolar oluşturulur, mevcut olanlara kolon eklenir.

-- 1. warehouse_locations (yoksa oluştur)
CREATE TABLE IF NOT EXISTS public.warehouse_locations (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  zone_code TEXT,
  aisle TEXT,
  rack TEXT,
  level TEXT,
  bin TEXT,
  temperature_class TEXT,
  usage_type TEXT DEFAULT 'RESERVE',
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_branch ON public.warehouse_locations(branch_id);

-- 2. warehouse_lpns (yoksa oluştur)
CREATE TABLE IF NOT EXISTS public.warehouse_lpns (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  lpn_code TEXT NOT NULL,
  branch_id UUID NOT NULL,
  status TEXT DEFAULT 'active' NOT NULL,
  location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT warehouse_lpns_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_lpns_lpn_code_key UNIQUE (lpn_code)
);
CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_branch   ON public.warehouse_lpns(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_location ON public.warehouse_lpns(location_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_status   ON public.warehouse_lpns(status);

-- 3. stock_item_warehouse_settings (yoksa oluştur)
CREATE TABLE IF NOT EXISTS public.stock_item_warehouse_settings (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  order_unit TEXT DEFAULT 'ana',
  min_order NUMERIC(10,3),
  max_order NUMERIC(10,3),
  min_stock NUMERIC(10,3),
  safety_stock NUMERIC(10,3),
  default_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_item_warehouse_settings_pkey PRIMARY KEY (id),
  CONSTRAINT stock_item_warehouse_settings_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE,
  CONSTRAINT stock_item_warehouse_settings_unique_stock_branch UNIQUE (stock_item_id, branch_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_item_wh_settings_item   ON public.stock_item_warehouse_settings(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_item_wh_settings_branch ON public.stock_item_warehouse_settings(branch_id);

-- 4. product_external_barcodes (yoksa oluştur)
CREATE TABLE IF NOT EXISTS public.product_external_barcodes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  gtin_barcode TEXT NOT NULL,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  is_approved BOOLEAN DEFAULT false NOT NULL,
  created_by_terminal TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT product_external_barcodes_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_gtin ON public.product_external_barcodes(gtin_barcode);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_item        ON public.product_external_barcodes(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_approved    ON public.product_external_barcodes(is_approved);

-- 5. Mevcut tablolara eksik kolon eklemeleri (idempotent)
ALTER TABLE public.warehouse_locations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.warehouse_lpns
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.stock_item_warehouse_settings
  ADD COLUMN IF NOT EXISTS default_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS location_id     UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lpn_id          UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_number      TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE;

CREATE INDEX IF NOT EXISTS idx_inv_movements_location ON public.inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_lpn      ON public.inventory_movements(lpn_id);

ALTER TABLE public.product_external_barcodes
  ADD COLUMN IF NOT EXISTS notes      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 6. Phase 1 Tedarikçi ve Kanal Eklemeleri
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplier_kind TEXT DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS source_workspace_scope TEXT,
  ADD COLUMN IF NOT EXISTS source_branch_id UUID,
  ADD COLUMN IF NOT EXISTS is_system_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_key TEXT;

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_sync_key_key;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_sync_key_key UNIQUE (sync_key);

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_kind_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_supplier_kind_check CHECK (supplier_kind IN ('external', 'internal_warehouse', 'internal_kitchen'));

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS flow_channel TEXT DEFAULT 'external_purchase';

ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_flow_channel_check;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_flow_channel_check CHECK (flow_channel IN ('external_purchase', 'warehouse_replenishment', 'kitchen_replenishment'));

ALTER TABLE public.order_flows
  ADD COLUMN IF NOT EXISTS flow_channel TEXT DEFAULT 'external_purchase';

ALTER TABLE public.order_flows DROP CONSTRAINT IF EXISTS order_flows_flow_channel_check;
ALTER TABLE public.order_flows ADD CONSTRAINT order_flows_flow_channel_check CHECK (flow_channel IN ('external_purchase', 'warehouse_replenishment', 'kitchen_replenishment'));

