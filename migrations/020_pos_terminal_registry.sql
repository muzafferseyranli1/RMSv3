-- ============================================================
-- 020_pos_terminal_registry.sql
-- POS terminal aktivasyon ve kayıt sistemi
-- ============================================================

-- Terminal kayıt tablosu
CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  terminal_id     UUID NOT NULL UNIQUE,
  branch_id       UUID NOT NULL,
  activation_code TEXT NOT NULL UNIQUE,
  terminal_role   TEXT NOT NULL DEFAULT 'slave'
                  CHECK (terminal_role IN ('master', 'slave')),
  screen_mode     TEXT NOT NULL DEFAULT 'pos'
                  CHECK (screen_mode IN ('pos', 'garson', 'pos-masa', 'pos-masalar')),
  terminal_name   TEXT,
  last_seen_at    TIMESTAMPTZ,
  app_version     TEXT,
  is_active       BOOLEAN DEFAULT true NOT NULL,
  is_used         BOOLEAN DEFAULT false NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- sales tablosuna terminal izlenebilirliği
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS created_by_terminal UUID,
  ADD COLUMN IF NOT EXISTS created_by_terminal_name TEXT;

ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS created_by_terminal UUID;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_pos_terminals_branch ON public.pos_terminals(branch_id);
CREATE INDEX IF NOT EXISTS idx_pos_terminals_code ON public.pos_terminals(activation_code);
CREATE INDEX IF NOT EXISTS idx_sales_terminal ON public.sales(created_by_terminal)
  WHERE created_by_terminal IS NOT NULL;

-- Aktivasyon kodu üretme fonksiyonu
CREATE OR REPLACE FUNCTION public.generate_terminal_activation_code(p_branch_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'SUT-' ||
      upper(substring(md5(random()::text), 1, 4)) || '-' ||
      upper(substring(md5(random()::text), 1, 3));
    SELECT EXISTS(
      SELECT 1 FROM public.pos_terminals WHERE activation_code = v_code
    ) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;
