ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT,
  ADD COLUMN IF NOT EXISTS promised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kds_release_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'sales'
      AND constraint_name = 'sales_fulfillment_type_check'
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_fulfillment_type_check
      CHECK (fulfillment_type IS NULL OR fulfillment_type = ANY (ARRAY['delivery'::text, 'pickup'::text]));
  END IF;
END $$;

UPDATE public.sales
SET
  fulfillment_type = COALESCE(
    fulfillment_type,
    CASE
      WHEN lower(COALESCE(kiosk_table_number, '')) IN ('gel-al', 'gel al', 'pickup') THEN 'pickup'
      ELSE 'delivery'
    END
  ),
  promised_at = COALESCE(promised_at, sale_datetime),
  kds_release_at = COALESCE(kds_release_at, sale_datetime)
WHERE source_channel_type = 'call_center';

CREATE INDEX IF NOT EXISTS idx_sales_call_center_open
  ON public.sales USING btree (branch_id, status, kds_status, kds_release_at, promised_at)
  WHERE deleted_at IS NULL AND source_channel_type = 'call_center';

CREATE INDEX IF NOT EXISTS idx_sales_kds_release
  ON public.sales USING btree (branch_id, kds_status, kds_release_at)
  WHERE deleted_at IS NULL AND status = 'completed';
