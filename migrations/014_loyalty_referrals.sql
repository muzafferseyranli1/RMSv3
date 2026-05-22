-- Çoklu tekil kodların (Mode 1) saklanacağı tablo
CREATE TABLE IF NOT EXISTS public.loyalty_referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL REFERENCES loyalty_campaigns(id) ON DELETE CASCADE,
  referrer_customer_id uuid NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
  referral_code text NOT NULL UNIQUE,
  referee_customer_id uuid REFERENCES musteriler(id) ON DELETE SET NULL,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);

-- Hızlı kod eşleşmesi için indeksler
CREATE INDEX IF NOT EXISTS idx_loyalty_referral_codes_lookup ON loyalty_referral_codes(referral_code);
CREATE INDEX IF NOT EXISTS idx_loyalty_referral_codes_referrer ON loyalty_referral_codes(referrer_customer_id);

-- Mevcut musteriler tablosu indeks kontrolü (varsa atlanır)
CREATE INDEX IF NOT EXISTS idx_musteriler_referral_code ON musteriler(referral_code);
CREATE INDEX IF NOT EXISTS idx_musteriler_referred_by ON musteriler(referred_by_customer_id);
