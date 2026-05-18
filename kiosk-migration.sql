-- ============================================================
-- KIOSK MODULE MIGRATION
-- Apply via Supabase Studio SQL editor
-- Date: 2026-04-01
-- ============================================================

-- 1. KDS status tracking on sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS kds_status text DEFAULT 'pending'
    CHECK (kds_status IN ('pending', 'in_progress', 'ready', 'delivered'));

-- 2. Kiosk-specific fields on sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS kiosk_service_type text
    CHECK (kiosk_service_type IN ('takeaway', 'table_service')),
  ADD COLUMN IF NOT EXISTS kiosk_table_number text,
  ADD COLUMN IF NOT EXISTS kiosk_display_no integer,
  ADD COLUMN IF NOT EXISTS pickup_called boolean NOT NULL DEFAULT false;

-- 3. Prep time on sale_items (minutes per item)
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer NOT NULL DEFAULT 0;

-- 4. KDS item-level completion on sale_lines
ALTER TABLE sale_lines
  ADD COLUMN IF NOT EXISTS kds_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer NOT NULL DEFAULT 0;

-- 5. Indexes for KDS queries
CREATE INDEX IF NOT EXISTS idx_sales_kds_status
  ON sales(kds_status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_kiosk_branch_date
  ON sales(branch_id, sale_datetime) WHERE source_channel_type = 'kiosk' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_kds_branch
  ON sales(branch_id, kds_status, sale_datetime) WHERE deleted_at IS NULL;

-- 6. Insert 'Kiosk' sales channel if not exists
INSERT INTO sales_channels (name, active, sort_order)
SELECT 'Kiosk', true, 100
WHERE NOT EXISTS (
  SELECT 1 FROM sales_channels
  WHERE lower(name) = 'kiosk' AND deleted_at IS NULL
);

-- 7. Channel-based screen visibility controls
ALTER TABLE sales_channels
  ADD COLUMN IF NOT EXISTS show_in_kds boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_in_queue boolean NOT NULL DEFAULT true;
