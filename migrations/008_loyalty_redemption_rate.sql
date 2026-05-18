-- Phase 5 readiness: program-level points-to-money redemption model.
-- Unit: 1 loyalty point = redemption_rate TL discount value.
-- A value of 0 means redemption is not configured and burn executors must stay disabled.

ALTER TABLE public.loyalty_programs
  ADD COLUMN IF NOT EXISTS redemption_rate NUMERIC(14,6) DEFAULT 0 NOT NULL;

ALTER TABLE public.loyalty_programs
  DROP CONSTRAINT IF EXISTS loyalty_programs_redemption_rate_check;

ALTER TABLE public.loyalty_programs
  ADD CONSTRAINT loyalty_programs_redemption_rate_check CHECK (redemption_rate >= 0);

COMMENT ON COLUMN public.loyalty_programs.redemption_rate
  IS 'Points redemption conversion. Unit: 1 loyalty point = redemption_rate TL discount value. 0 means redemption is not configured.';
