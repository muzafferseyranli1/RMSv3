-- Migration: Kiosk Cihaz Bazlı Çalışma Saatleri Kuralları (055)

-- 1. Create kiosk_operating_hours_rules table
CREATE TABLE IF NOT EXISTS public.kiosk_operating_hours_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.company_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days TEXT[] NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. Create kiosk_terminal_operating_rules junction table
CREATE TABLE IF NOT EXISTS public.kiosk_terminal_operating_rules (
  terminal_id UUID NOT NULL REFERENCES public.pos_terminals(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.kiosk_operating_hours_rules(id) ON DELETE CASCADE,
  PRIMARY KEY (terminal_id, rule_id)
);

-- 3. Create updated_at trigger for rules table
CREATE OR REPLACE TRIGGER trg_kiosk_operating_hours_rules_updated_at
  BEFORE UPDATE ON public.kiosk_operating_hours_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- 4. Create indexes for lookup speed
CREATE INDEX IF NOT EXISTS idx_kiosk_operating_hours_rules_branch ON public.kiosk_operating_hours_rules(branch_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_terminal_operating_rules_terminal ON public.kiosk_terminal_operating_rules(terminal_id);
