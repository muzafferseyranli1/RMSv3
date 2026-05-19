ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_source TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_application_mode TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_action_type TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_offer_label TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_source_rule_id TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_selected_coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_applied_actions_json JSONB,
  ADD COLUMN IF NOT EXISTS loyalty_decision_context_json JSONB;

ALTER TABLE public.sale_lines
  ADD COLUMN IF NOT EXISTS discount_source TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_application_mode TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_action_type TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_offer_label TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_source_rule_id TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_selected_coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS loyalty_applied_actions_json JSONB,
  ADD COLUMN IF NOT EXISTS loyalty_decision_context_json JSONB,
  ADD COLUMN IF NOT EXISTS loyalty_discount_allocated_amount NUMERIC(14,2) DEFAULT 0 NOT NULL;
