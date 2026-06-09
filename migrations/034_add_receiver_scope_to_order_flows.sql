-- WMS Faz 8: order_flows tablosuna receiver_scope eklenmesi
ALTER TABLE public.order_flows ADD COLUMN IF NOT EXISTS receiver_scope TEXT DEFAULT 'branch' NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_flows_receiver_scope_check'
  ) THEN
    ALTER TABLE public.order_flows ADD CONSTRAINT order_flows_receiver_scope_check CHECK (receiver_scope = ANY (ARRAY['branch'::text, 'warehouse'::text, 'kitchen'::text]));
  END IF;
END $$;
