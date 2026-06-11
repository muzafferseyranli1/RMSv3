-- WMS stock-item settings: branch-facing transfer price adjustment.
-- Ana Depo may ship to branches at cost, cost + percent margin, or cost + amount margin.

ALTER TABLE public.stock_item_warehouse_settings
  ADD COLUMN IF NOT EXISTS transfer_price_adjustment_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS transfer_price_adjustment_value NUMERIC(18,4) DEFAULT 0;

UPDATE public.stock_item_warehouse_settings
SET
  transfer_price_adjustment_type = COALESCE(transfer_price_adjustment_type, 'none'),
  transfer_price_adjustment_value = COALESCE(transfer_price_adjustment_value, 0);
