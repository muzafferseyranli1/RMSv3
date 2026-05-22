-- ============================================================
-- 015: Referans Programları v2 — Bağımsız CRUD + Takip Tablosu
-- ============================================================

-- 1. Referans Programları Tablosu
CREATE TABLE IF NOT EXISTS public.loyalty_referral_programs (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT 'Yeni Referans Programı',
  mode text NOT NULL DEFAULT 'unique_multiple'
    CHECK (mode IN ('unique_multiple', 'single_reusable_date', 'single_reusable_limit')),
  config_json jsonb NOT NULL DEFAULT '{}',
  allowed_referrer_categories jsonb NOT NULL DEFAULT '[]',
  success_criteria text NOT NULL DEFAULT 'registration'
    CHECK (success_criteria IN ('registration', 'nth_purchase')),
  success_purchase_count integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  branch_id text,
  scope text NOT NULL DEFAULT 'global'
);

CREATE INDEX IF NOT EXISTS idx_loyalty_referral_programs_active
  ON loyalty_referral_programs(active) WHERE deleted_at IS NULL;

-- 2. loyalty_referral_codes: program_id sütunu ekle
ALTER TABLE loyalty_referral_codes
  ADD COLUMN IF NOT EXISTS program_id text REFERENCES loyalty_referral_programs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_loyalty_referral_codes_program
  ON loyalty_referral_codes(program_id);

-- 3. Referans Takip Tablosu
CREATE TABLE IF NOT EXISTS public.loyalty_referral_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id text NOT NULL REFERENCES loyalty_referral_programs(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
  referee_customer_id uuid NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
  referral_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'successful', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  success_at timestamptz,
  UNIQUE (program_id, referee_customer_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_tracking_referrer
  ON loyalty_referral_tracking(referrer_customer_id, program_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_referee
  ON loyalty_referral_tracking(referee_customer_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_status
  ON loyalty_referral_tracking(program_id, referrer_customer_id, status);
