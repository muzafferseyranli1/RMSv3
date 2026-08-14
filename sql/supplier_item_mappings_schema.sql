-- SuitableRMS Tedarikçi Ürün Eşleme (Supplier Item Cross-Reference & Aliases)
-- Faturadaki tedarikçi ürün isimlerini ve kodlarını RMS stok kartlarına bağlama hafızası

CREATE TABLE IF NOT EXISTS public.supplier_item_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_item_name VARCHAR(255) NOT NULL,
  supplier_item_code VARCHAR(100),
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_code VARCHAR(20),
  mapping_source VARCHAR(50) DEFAULT 'MANUAL', -- 'MANUAL', 'AUTO_QTY_PRICE', 'PHONETIC', 'PRESET'
  confidence_score NUMERIC(5, 2) DEFAULT 100.00,
  match_count INTEGER DEFAULT 1,
  last_matched_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_supplier_item_mapping UNIQUE (supplier_id, supplier_item_name)
);

CREATE INDEX IF NOT EXISTS idx_supplier_item_mappings_supplier ON public.supplier_item_mappings(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_item_mappings_stock ON public.supplier_item_mappings(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_item_mappings_name ON public.supplier_item_mappings(supplier_item_name);
