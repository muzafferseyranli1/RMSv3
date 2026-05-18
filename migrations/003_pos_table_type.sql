ALTER TABLE public.pos_tables
  ADD COLUMN IF NOT EXISTS table_type TEXT DEFAULT 'round'::text NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_tables_table_type_check'
      AND conrelid = 'public.pos_tables'::regclass
  ) THEN
    ALTER TABLE public.pos_tables
      ADD CONSTRAINT pos_tables_table_type_check
      CHECK ((table_type = ANY (ARRAY['round'::text, 'square'::text])));
  END IF;
END $$;
