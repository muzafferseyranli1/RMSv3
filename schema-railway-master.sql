-- ============================================================
-- schema-railway-master.sql
-- Railway Postgres · tam schema export
-- Üretilme tarihi: 2026-05-10
-- Bu dosya projenin tek kaynak schema dosyasıdır.
-- Tablo değişikliği yapılınca bu dosyayı güncelle.
-- ============================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public._backup_sale_items_portions (
  id UUID,
  name TEXT,
  portions JSONB,
  recipe_rows JSONB
);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  action_type TEXT NOT NULL,
  route TEXT,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT activity_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.allowed_users (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user'::text NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT allowed_users_pkey PRIMARY KEY (id),
  CONSTRAINT allowed_users_email_lowercase CHECK (email = lower(email)),
  CONSTRAINT allowed_users_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.branch_period_locks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  type TEXT NOT NULL,
  close_date DATE NOT NULL,
  created_by TEXT,
  active BOOLEAN DEFAULT true,
  CONSTRAINT branch_period_locks_pkey PRIMARY KEY (id),
  CONSTRAINT branch_period_locks_type_check CHECK (type = ANY (ARRAY['period_close'::text, 'pre_lock'::text]))
);

CREATE TABLE IF NOT EXISTS public.branch_shift_presets (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  short_code TEXT NOT NULL,
  kind TEXT DEFAULT 'working'::text NOT NULL,
  start_time TIME,
  end_time TIME,
  break_minutes INTEGER DEFAULT 0 NOT NULL,
  color_hex TEXT DEFAULT '#f59e0b'::text NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT branch_shift_presets_pkey PRIMARY KEY (id),
  CONSTRAINT branch_shift_presets_break_minutes_check CHECK (break_minutes >= 0 AND break_minutes < 1440),
  CONSTRAINT branch_shift_presets_kind_check CHECK (kind = ANY (ARRAY['working'::text, 'off'::text, 'report'::text, 'other'::text])),
  CONSTRAINT branch_shift_presets_working_times_chk CHECK (kind = 'working'::text AND start_time IS NOT NULL AND end_time IS NOT NULL OR kind <> 'working'::text AND start_time IS NULL AND end_time IS NULL)
);

CREATE TABLE IF NOT EXISTS public.branch_shift_schedule_days (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  schedule_date DATE NOT NULL,
  day_start_time TIME DEFAULT '08:00:00'::time without time zone NOT NULL,
  day_end_time TIME DEFAULT '19:00:00'::time without time zone NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT branch_shift_schedule_days_pkey PRIMARY KEY (id),
  CONSTRAINT branch_shift_schedule_days_branch_date_uidx UNIQUE (branch_id, schedule_date)
);

CREATE TABLE IF NOT EXISTS public.branch_shift_schedule_entries (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  schedule_date DATE NOT NULL,
  personnel_id TEXT NOT NULL,
  personnel_name TEXT NOT NULL,
  source_shift_preset_id UUID,
  shift_name TEXT NOT NULL,
  shift_short_code TEXT NOT NULL,
  shift_kind TEXT NOT NULL,
  shift_start_time TIME,
  shift_end_time TIME,
  break_start_time TIME,
  break_end_time TIME,
  break_minutes INTEGER DEFAULT 0 NOT NULL,
  color_hex TEXT DEFAULT '#94a3b8'::text NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT branch_shift_schedule_entries_pkey PRIMARY KEY (id),
  CONSTRAINT branch_shift_schedule_entries_break_minutes_check CHECK (break_minutes >= 0 AND break_minutes < 1440),
  CONSTRAINT branch_shift_schedule_entries_break_pair_chk CHECK (break_start_time IS NULL AND break_end_time IS NULL OR break_start_time IS NOT NULL AND break_end_time IS NOT NULL),
  CONSTRAINT branch_shift_schedule_entries_shift_kind_check CHECK (shift_kind = ANY (ARRAY['working'::text, 'off'::text, 'report'::text, 'other'::text])),
  CONSTRAINT branch_shift_schedule_entries_working_times_chk CHECK (shift_kind = 'working'::text AND shift_start_time IS NOT NULL AND shift_end_time IS NOT NULL OR shift_kind <> 'working'::text AND shift_start_time IS NULL AND shift_end_time IS NULL),
  CONSTRAINT branch_shift_schedule_entries_source_shift_preset_id_fkey FOREIGN KEY (source_shift_preset_id) REFERENCES branch_shift_presets(id) ON DELETE SET NULL,
  CONSTRAINT branch_shift_schedule_entries_branch_date_personnel_uidx UNIQUE (branch_id, schedule_date, personnel_id)
);

CREATE TABLE IF NOT EXISTS public.branch_templates (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  branch_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT branch_templates_pkey PRIMARY KEY (id),
  CONSTRAINT branch_templates_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.cari_hareketler (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  musteri_id UUID,
  tur TEXT NOT NULL,
  tutar NUMERIC(12,2) NOT NULL,
  aciklama TEXT,
  tarih DATE DEFAULT CURRENT_DATE NOT NULL,
  neden TEXT,
  personel_adi TEXT,
  paket_no TEXT,
  siparis_id UUID,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT cari_hareketler_pkey PRIMARY KEY (id),
  CONSTRAINT cari_hareketler_musteri_id_fkey FOREIGN KEY (musteri_id) REFERENCES musteriler(id)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID,
  bg TEXT DEFAULT '#fef3c7'::text NOT NULL,
  text_color TEXT DEFAULT '#92400e'::text NOT NULL,
  sku_mask TEXT,
  append_type TEXT,
  append_len INTEGER DEFAULT 4 NOT NULL,
  description TEXT,
  acc_cat TEXT,
  acc_code TEXT,
  expense_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.company_nodes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  can_sell BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT company_nodes_pkey PRIMARY KEY (id),
  CONSTRAINT company_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.company_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.branch_addresses (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  branch_name TEXT NOT NULL,
  city_id TEXT,
  city_name TEXT,
  district_id TEXT,
  district_name TEXT,
  neighborhood_id TEXT,
  neighborhood_name TEXT,
  street TEXT,
  line_1 TEXT,
  is_primary BOOLEAN DEFAULT true NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT branch_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT branch_addresses_branch_id_key UNIQUE (branch_id)
);

CREATE TABLE IF NOT EXISTS public.branch_service_coverage (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  branch_name TEXT NOT NULL,
  city_id TEXT,
  city_name TEXT,
  district_id TEXT,
  district_name TEXT,
  neighborhood_id TEXT,
  neighborhood_name TEXT,
  priority INTEGER DEFAULT 100 NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT branch_service_coverage_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  contract_no TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  warning_days INTEGER DEFAULT 15 NOT NULL,
  total_quota_active BOOLEAN DEFAULT false NOT NULL,
  total_quota_warning_ratio NUMERIC(4,2) DEFAULT 0.8 NOT NULL,
  total_quota_overrun_ratio NUMERIC(4,2) DEFAULT 0.2 NOT NULL,
  end_grace_days INTEGER DEFAULT 15 NOT NULL,
  price_tolerance NUMERIC(4,2) DEFAULT 0.05 NOT NULL,
  block_on_exceed BOOLEAN DEFAULT true NOT NULL,
  warn_only_on_exceed BOOLEAN DEFAULT false NOT NULL,
  supplier_id UUID,
  branches JSONB DEFAULT '[]'::jsonb NOT NULL,
  rows JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT contracts_pkey PRIMARY KEY (id),
  CONSTRAINT contracts_contract_no_key UNIQUE (contract_no)
);

CREATE TABLE IF NOT EXISTS public.count_flows (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  branches JSONB DEFAULT '{"selections": [], "allBranches": false}'::jsonb NOT NULL,
  schedule JSONB DEFAULT '{"weekdays": [], "frequency": "daily", "startTime": "13:00", "monthlyDays": [1], "monthlyMode": "days", "monthlyWeekdayRules": [{"ordinal": "1", "weekday": "Pazartesi"}]}'::jsonb NOT NULL,
  products JSONB DEFAULT '{"mode": "moving", "movementDays": 30, "selectedStocks": [], "selectedTemplates": [], "selectedCategories": []}'::jsonb NOT NULL,
  notes JSONB DEFAULT '{"mobileEntry": true, "printableForm": true}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT count_flows_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  customer_id UUID NOT NULL,
  label TEXT DEFAULT 'Adres'::text NOT NULL,
  address_type TEXT DEFAULT 'other'::text NOT NULL,
  city_id TEXT,
  city_name TEXT,
  district_id TEXT,
  district_name TEXT,
  neighborhood_id TEXT,
  neighborhood_name TEXT,
  street TEXT,
  building_no TEXT,
  apartment_no TEXT,
  floor_no TEXT,
  door_no TEXT,
  line_1 TEXT,
  line_2 TEXT,
  directions TEXT,
  postal_code TEXT,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  is_primary BOOLEAN DEFAULT false NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  source_channel TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT customer_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.customer_consent_events (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  customer_id UUID NOT NULL,
  consent_channel TEXT NOT NULL,
  consent_value BOOLEAN DEFAULT false NOT NULL,
  source_channel TEXT,
  captured_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT customer_consent_events_pkey PRIMARY KEY (id),
  CONSTRAINT customer_consent_events_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.customer_devices (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  customer_id UUID NOT NULL,
  device_platform TEXT DEFAULT 'unknown'::text NOT NULL,
  device_name TEXT,
  app_version TEXT,
  push_token TEXT,
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT customer_devices_pkey PRIMARY KEY (id),
  CONSTRAINT customer_devices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.daily_sales (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  sale_date DATE NOT NULL,
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  total_sales NUMERIC DEFAULT 0 NOT NULL,
  receipt_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT daily_sales_pkey PRIMARY KEY (id),
  CONSTRAINT daily_sales_sale_date_branch_id_key UNIQUE (sale_date, branch_id)
);

CREATE TABLE IF NOT EXISTS public.expense_documents (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  document_group_id UUID,
  document_no TEXT NOT NULL,
  document_type TEXT NOT NULL,
  supplier_id UUID,
  supplier_name TEXT,
  expense_account_id TEXT NOT NULL,
  expense_account_name TEXT,
  accounting_code TEXT,
  accounting_category TEXT,
  account_group TEXT,
  account_section TEXT,
  account_type TEXT,
  account_scope TEXT,
  branch_id TEXT NOT NULL,
  branch_name TEXT,
  document_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  distribute_by_day BOOLEAN DEFAULT true,
  distribution_mode TEXT DEFAULT 'equal'::text,
  allocation_share NUMERIC(12,6) DEFAULT 1,
  amount NUMERIC(12,2) DEFAULT 0 NOT NULL,
  source_amount NUMERIC(12,2) DEFAULT 0 NOT NULL,
  note TEXT,
  unregistered_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT expense_documents_pkey PRIMARY KEY (id),
  CONSTRAINT expense_documents_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_movement_recalc_jobs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  item_type TEXT NOT NULL,
  stock_item_id UUID,
  semi_item_id UUID,
  branch_id UUID,
  recalc_from TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  source_movement_id UUID,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT inventory_movement_recalc_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movement_recalc_jobs_item_ref_check CHECK (item_type = 'stock_item'::text AND stock_item_id IS NOT NULL AND semi_item_id IS NULL OR item_type = 'semi_item'::text AND semi_item_id IS NOT NULL AND stock_item_id IS NULL),
  CONSTRAINT inventory_movement_recalc_jobs_item_type_check CHECK (item_type = ANY (ARRAY['stock_item'::text, 'semi_item'::text])),
  CONSTRAINT inventory_movement_recalc_jobs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'error'::text])),
  CONSTRAINT inventory_movement_recalc_jobs_source_movement_id_fkey FOREIGN KEY (source_movement_id) REFERENCES inventory_movements(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  ledger_seq BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  company_id UUID,
  legal_entity_id UUID,
  org_unit_id UUID,
  branch_id UUID,
  branch_name TEXT,
  warehouse_id UUID,
  warehouse_name TEXT,
  item_type TEXT NOT NULL,
  stock_item_id UUID,
  semi_item_id UUID,
  item_name TEXT NOT NULL,
  item_sku TEXT,
  unit TEXT,
  unit_factor NUMERIC(18,6) DEFAULT 1 NOT NULL,
  movement_type TEXT NOT NULL,
  source_doc_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  movement_at TIMESTAMPTZ NOT NULL,
  quantity NUMERIC(18,6) NOT NULL,
  quantity_signed NUMERIC(18,6),
  source_doc_id UUID,
  source_doc_line_id UUID,
  source_doc_no TEXT,
  source_doc_ref TEXT,
  sale_id UUID,
  sale_line_id UUID,
  sale_item_id UUID,
  sales_channel_id UUID,
  sales_channel_name TEXT,
  portion_id TEXT,
  portion_name TEXT,
  recipe_row_id TEXT,
  production_record_id UUID,
  semi_recipe_row_id TEXT,
  supplier_id UUID,
  counterparty_branch_id UUID,
  counterparty_branch_name TEXT,
  transfer_pair_id UUID,
  unit_cost NUMERIC(18,6) DEFAULT 0 NOT NULL,
  total_cost NUMERIC(18,6) DEFAULT 0 NOT NULL,
  total_cost_signed NUMERIC(18,6),
  currency_code TEXT DEFAULT 'TRY'::text NOT NULL,
  avg_unit_cost_after NUMERIC(18,6) DEFAULT 0 NOT NULL,
  balance_qty_after NUMERIC(18,6) DEFAULT 0 NOT NULL,
  balance_total_cost_after NUMERIC(18,6) DEFAULT 0 NOT NULL,
  calc_status TEXT DEFAULT 'pending'::text NOT NULL,
  calc_version INTEGER DEFAULT 1 NOT NULL,
  recalc_required_from TIMESTAMPTZ,
  notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  is_cancelled BOOLEAN DEFAULT false NOT NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  reversal_of_movement_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movements_calc_status_check CHECK (calc_status = ANY (ARRAY['pending'::text, 'calculated'::text, 'recalculate'::text, 'locked'::text])),
  CONSTRAINT inventory_movements_cancelled_check CHECK (is_cancelled = false AND cancelled_at IS NULL OR is_cancelled = true AND cancelled_at IS NOT NULL),
  CONSTRAINT inventory_movements_direction_check CHECK (direction = ANY (ARRAY['in'::text, 'out'::text])),
  CONSTRAINT inventory_movements_item_ref_check CHECK (item_type = 'stock_item'::text AND stock_item_id IS NOT NULL AND semi_item_id IS NULL OR item_type = 'semi_item'::text AND semi_item_id IS NOT NULL AND stock_item_id IS NULL),
  CONSTRAINT inventory_movements_item_type_check CHECK (item_type = ANY (ARRAY['stock_item'::text, 'semi_item'::text])),
  CONSTRAINT inventory_movements_movement_type_check CHECK (movement_type = ANY (ARRAY['opening_balance'::text, 'purchase_receipt'::text, 'sale_consumption'::text, 'waste_consumption'::text, 'transfer_in'::text, 'transfer_out'::text, 'supplier_return'::text, 'production_consumption'::text, 'production_output'::text, 'stock_count_gain'::text, 'stock_count_loss'::text, 'manual_adjustment_in'::text, 'manual_adjustment_out'::text])),
  CONSTRAINT inventory_movements_quantity_check CHECK (quantity > 0::numeric AND unit_factor > 0::numeric),
  CONSTRAINT inventory_movements_source_doc_type_check CHECK (source_doc_type = ANY (ARRAY['opening_balance'::text, 'purchase_receipt'::text, 'sale'::text, 'waste'::text, 'transfer'::text, 'supplier_return'::text, 'production'::text, 'stock_count'::text, 'manual_adjustment'::text])),
  CONSTRAINT inventory_movements_reversal_of_movement_id_fkey FOREIGN KEY (reversal_of_movement_id) REFERENCES inventory_movements(id) ON DELETE SET NULL,
  CONSTRAINT inventory_movements_ledger_seq_key UNIQUE (ledger_seq)
);

CREATE TABLE IF NOT EXISTS public.loyalty_campaign_redemptions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  campaign_id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  wallet_id UUID,
  transaction_id UUID,
  redemption_status TEXT DEFAULT 'applied'::text NOT NULL,
  source_channel TEXT,
  source_ref_id TEXT,
  redeemed_value NUMERIC(14,2) DEFAULT 0 NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT loyalty_campaign_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_campaign_redemptions_status_check CHECK (redemption_status = ANY (ARRAY['reserved'::text, 'applied'::text, 'cancelled'::text, 'reversed'::text])),
  CONSTRAINT loyalty_campaign_redemptions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_campaign_redemptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_campaign_redemptions_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES loyalty_transactions(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_campaign_redemptions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES loyalty_wallets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_campaign_rules (
  id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  rule_scope TEXT DEFAULT 'applicable'::text NOT NULL,
  condition_key TEXT NOT NULL,
  operator TEXT DEFAULT 'gte'::text NOT NULL,
  threshold_value NUMERIC(14,2) DEFAULT 0 NOT NULL,
  period_window TEXT DEFAULT 'all_time'::text NOT NULL,
  action_type TEXT DEFAULT 'bonus_points'::text NOT NULL,
  action_summary TEXT,
  condition_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  action_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  stop_processing BOOLEAN DEFAULT false NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  sort_order INTEGER DEFAULT 100 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_campaign_rules_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_campaign_rules_scope_check CHECK (rule_scope = ANY (ARRAY['applicable'::text, 'periodic'::text])),
  CONSTRAINT loyalty_campaign_rules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.loyalty_campaigns (
  id TEXT NOT NULL,
  program_id TEXT,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  campaign_type TEXT DEFAULT 'bonus_points'::text NOT NULL,
  trigger_type TEXT DEFAULT 'manual'::text NOT NULL,
  reward_type TEXT DEFAULT 'points'::text NOT NULL,
  reward_value NUMERIC(14,2) DEFAULT 0 NOT NULL,
  priority INTEGER DEFAULT 100 NOT NULL,
  stackable BOOLEAN DEFAULT false NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  status TEXT DEFAULT 'draft'::text NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  channel_targets JSONB DEFAULT '[]'::jsonb NOT NULL,
  audience_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  conditions_json JSONB DEFAULT '[]'::jsonb NOT NULL,
  actions_json JSONB DEFAULT '[]'::jsonb NOT NULL,
  budget_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  limits_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_campaigns_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text])),
  CONSTRAINT loyalty_campaigns_status_check CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'active'::text, 'paused'::text, 'completed'::text, 'archived'::text])),
  CONSTRAINT loyalty_campaigns_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_campaign_conflict_groups (
  id TEXT NOT NULL,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  active BOOLEAN DEFAULT true NOT NULL,
  sort_order INTEGER DEFAULT 100 NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_campaign_conflict_groups_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_campaign_conflict_groups_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text]))
);

CREATE TABLE IF NOT EXISTS public.loyalty_card_transactions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  card_id UUID NOT NULL,
  customer_id UUID,
  program_id TEXT,
  campaign_id TEXT,
  transaction_type TEXT NOT NULL,
  status TEXT DEFAULT 'posted'::text NOT NULL,
  source_channel TEXT,
  source_ref_id TEXT,
  amount_delta NUMERIC(14,2) DEFAULT 0 NOT NULL,
  points_delta NUMERIC(14,2) DEFAULT 0 NOT NULL,
  frequency_delta INTEGER DEFAULT 0 NOT NULL,
  balance_before NUMERIC(14,2) DEFAULT 0 NOT NULL,
  balance_after NUMERIC(14,2) DEFAULT 0 NOT NULL,
  occurred_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT loyalty_card_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_card_transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'posted'::text, 'cancelled'::text, 'reversed'::text])),
  CONSTRAINT loyalty_card_transactions_type_check CHECK (transaction_type = ANY (ARRAY['issue'::text, 'load'::text, 'spend'::text, 'refund'::text, 'adjustment'::text, 'stamp_earn'::text, 'stamp_redeem'::text, 'points_sync'::text])),
  CONSTRAINT loyalty_card_transactions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_card_transactions_card_id_fkey FOREIGN KEY (card_id) REFERENCES loyalty_cards(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_card_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_card_transactions_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_cards (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  program_id TEXT,
  customer_id UUID,
  card_no TEXT NOT NULL,
  card_type TEXT DEFAULT 'membership'::text NOT NULL,
  card_status TEXT DEFAULT 'active'::text NOT NULL,
  card_label TEXT,
  qr_code TEXT,
  barcode TEXT,
  stored_value_balance NUMERIC(14,2) DEFAULT 0 NOT NULL,
  points_balance NUMERIC(14,2) DEFAULT 0 NOT NULL,
  frequency_balance INTEGER DEFAULT 0 NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_cards_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_cards_status_check CHECK (card_status = ANY (ARRAY['draft'::text, 'active'::text, 'blocked'::text, 'expired'::text, 'cancelled'::text])),
  CONSTRAINT loyalty_cards_type_check CHECK (card_type = ANY (ARRAY['membership'::text, 'gift'::text, 'prepaid'::text, 'stamp'::text, 'reward'::text])),
  CONSTRAINT loyalty_cards_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_cards_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_coupon_series (
  id TEXT NOT NULL,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  single_coupon BOOLEAN DEFAULT false NOT NULL,
  coupon_count INTEGER DEFAULT 1 NOT NULL,
  random_length INTEGER DEFAULT 6 NOT NULL,
  charset TEXT DEFAULT 'numeric'::text NOT NULL,
  use_after_checkout BOOLEAN DEFAULT false NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  expires_in_days INTEGER,
  auto_deactivate_on_expiry BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT loyalty_coupon_series_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_coupon_series_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text]))
);

CREATE TABLE IF NOT EXISTS public.loyalty_coupons (
  id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  customer_id UUID,
  code TEXT NOT NULL,
  is_used BOOLEAN DEFAULT false NOT NULL,
  used_at TIMESTAMPTZ,
  source_ref_id TEXT,
  use_after_checkout BOOLEAN DEFAULT false NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ,
  redeemed_by_customer_id UUID,
  redeemed_channel TEXT,
  redeemed_source_ref_id TEXT,
  redemption_status TEXT DEFAULT 'available'::text NOT NULL,
  note TEXT,
  CONSTRAINT loyalty_coupons_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_coupons_redemption_status_check CHECK (redemption_status = ANY (ARRAY['available'::text, 'reserved'::text, 'used'::text, 'expired'::text, 'cancelled'::text])),
  CONSTRAINT loyalty_coupons_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_coupons_redeemed_by_customer_id_fkey FOREIGN KEY (redeemed_by_customer_id) REFERENCES musteriler(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_coupons_series_id_fkey FOREIGN KEY (series_id) REFERENCES loyalty_coupon_series(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.loyalty_customer_categories (
  id TEXT NOT NULL,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  color TEXT DEFAULT '#2563eb'::text,
  active BOOLEAN DEFAULT true NOT NULL,
  sort_order INTEGER DEFAULT 100 NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_customer_categories_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_customer_categories_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text]))
);

CREATE TABLE IF NOT EXISTS public.loyalty_customer_category_members (
  id TEXT NOT NULL,
  customer_id UUID NOT NULL,
  category_id TEXT NOT NULL,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_customer_category_members_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_customer_category_members_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text])),
  CONSTRAINT loyalty_customer_category_members_category_id_fkey FOREIGN KEY (category_id) REFERENCES loyalty_customer_categories(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_customer_category_members_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.loyalty_frequency_progress (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  customer_id UUID NOT NULL,
  program_id TEXT NOT NULL,
  campaign_id TEXT,
  progress_type TEXT DEFAULT 'visits'::text NOT NULL,
  current_count INTEGER DEFAULT 0 NOT NULL,
  target_count INTEGER DEFAULT 0 NOT NULL,
  completed_cycles INTEGER DEFAULT 0 NOT NULL,
  last_qualified_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_frequency_progress_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_frequency_progress_type_check CHECK (progress_type = ANY (ARRAY['visits'::text, 'stamps'::text, 'orders'::text, 'products'::text])),
  CONSTRAINT loyalty_frequency_progress_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_frequency_progress_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_frequency_progress_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id TEXT NOT NULL,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  name TEXT NOT NULL,
  description TEXT,
  program_type TEXT DEFAULT 'mixed'::text NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true NOT NULL,
  chain_wide_active BOOLEAN DEFAULT false NOT NULL,
  notify_balance_change BOOLEAN DEFAULT true NOT NULL,
  notification_channel TEXT DEFAULT 'push_or_sms'::text NOT NULL,
  webhook_enabled BOOLEAN DEFAULT false NOT NULL,
  webhook_template TEXT,
  redemption_rate NUMERIC(14,6) DEFAULT 0 NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  program_family TEXT DEFAULT 'points'::text,
  earn_model TEXT DEFAULT 'points_per_amount'::text,
  redemption_model TEXT DEFAULT 'points_to_discount'::text,
  card_mode TEXT DEFAULT 'none'::text,
  frequency_goal INTEGER DEFAULT 0,
  frequency_reset_period TEXT DEFAULT 'never'::text,
  frequency_reward_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT loyalty_programs_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_programs_frequency_reset_period_check CHECK (frequency_reset_period = ANY (ARRAY['never'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text])),
  CONSTRAINT loyalty_programs_program_family_check CHECK (program_family = ANY (ARRAY['points'::text, 'frequency'::text, 'reward'::text, 'gift_card'::text, 'stored_value_card'::text, 'membership_card'::text, 'mixed'::text])),
  CONSTRAINT loyalty_programs_redemption_rate_check CHECK (redemption_rate >= 0),
  CONSTRAINT loyalty_programs_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text]))
);

ALTER TABLE public.loyalty_programs
  ADD COLUMN IF NOT EXISTS redemption_rate NUMERIC(14,6) DEFAULT 0 NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'loyalty_programs_redemption_rate_check'
      AND conrelid = 'public.loyalty_programs'::regclass
  ) THEN
    ALTER TABLE public.loyalty_programs
      ADD CONSTRAINT loyalty_programs_redemption_rate_check CHECK (redemption_rate >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.loyalty_programs.redemption_rate IS
  'Puan harcama donusum orani. Semantik: 1 puan = redemption_rate TL. 0 degeri puan harcama/redemption executor kapali anlamina gelir.';

CREATE TABLE IF NOT EXISTS public.loyalty_reward_entitlements (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  customer_id UUID NOT NULL,
  program_id TEXT,
  campaign_id TEXT,
  wallet_id UUID,
  entitlement_type TEXT DEFAULT 'free_product'::text NOT NULL,
  entitlement_status TEXT DEFAULT 'available'::text NOT NULL,
  title TEXT,
  description TEXT,
  source_channel TEXT,
  source_ref_id TEXT,
  source_ref_no TEXT,
  target_scope_type TEXT DEFAULT 'product'::text NOT NULL,
  target_scope_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  reward_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  quantity NUMERIC(14,2) DEFAULT 1 NOT NULL,
  priority INTEGER DEFAULT 0 NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  available_from TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  consumed_ref_id TEXT,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_reward_entitlements_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_reward_entitlements_scope_check CHECK (target_scope_type = ANY (ARRAY['product'::text, 'category'::text, 'mask'::text, 'any'::text])),
  CONSTRAINT loyalty_reward_entitlements_status_check CHECK (entitlement_status = ANY (ARRAY['available'::text, 'reserved'::text, 'consumed'::text, 'expired'::text, 'cancelled'::text])),
  CONSTRAINT loyalty_reward_entitlements_type_check CHECK (entitlement_type = ANY (ARRAY['free_product'::text, 'discount_amount'::text, 'discount_percent'::text, 'coupon'::text, 'bonus_points'::text, 'stored_value'::text, 'custom'::text])),
  CONSTRAINT loyalty_reward_entitlements_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_reward_entitlements_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_reward_entitlements_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_reward_entitlements_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES loyalty_wallets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_tiers (
  id TEXT NOT NULL,
  scope_type TEXT DEFAULT 'global'::text NOT NULL,
  scope_branch_id UUID,
  scope_branch_name TEXT,
  code TEXT,
  name TEXT NOT NULL,
  min_spend_total NUMERIC(14,2) DEFAULT 0 NOT NULL,
  min_order_count INTEGER DEFAULT 0 NOT NULL,
  points_multiplier NUMERIC(10,4) DEFAULT 1 NOT NULL,
  birthday_bonus_points NUMERIC(14,2) DEFAULT 0 NOT NULL,
  benefits_summary TEXT,
  qualification_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  benefits_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  color TEXT DEFAULT '#2563eb'::text,
  sort_order INTEGER DEFAULT 100 NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT loyalty_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_tiers_scope_type_check CHECK (scope_type = ANY (ARRAY['global'::text, 'branch'::text]))
);

CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  wallet_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  program_id TEXT,
  campaign_id TEXT,
  tier_id TEXT,
  wallet_type TEXT DEFAULT 'points'::text NOT NULL,
  transaction_type TEXT NOT NULL,
  status TEXT DEFAULT 'posted'::text NOT NULL,
  source_channel TEXT DEFAULT 'manual'::text NOT NULL,
  source_type TEXT,
  source_ref_id TEXT,
  source_ref_no TEXT,
  branch_id UUID,
  branch_name TEXT,
  points_delta NUMERIC(14,2) DEFAULT 0 NOT NULL,
  points_before NUMERIC(14,2) DEFAULT 0 NOT NULL,
  points_after NUMERIC(14,2) DEFAULT 0 NOT NULL,
  monetary_amount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  expires_at TIMESTAMPTZ,
  occurred_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT loyalty_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_transactions_status_check CHECK (status = ANY (ARRAY['pending'::text, 'posted'::text, 'cancelled'::text, 'expired'::text, 'reversed'::text])),
  CONSTRAINT loyalty_transactions_type_check CHECK (transaction_type = ANY (ARRAY['earn'::text, 'burn'::text, 'adjustment'::text, 'expire'::text, 'refund'::text, 'campaign_bonus'::text, 'welcome_bonus'::text, 'birthday_bonus'::text, 'frequency_step'::text, 'frequency_reward'::text, 'card_load'::text, 'card_spend'::text, 'card_refund'::text, 'card_adjustment'::text])),
  CONSTRAINT loyalty_transactions_wallet_type_check CHECK (wallet_type = ANY (ARRAY['points'::text, 'reward'::text, 'frequency'::text, 'stored_value'::text])),
  CONSTRAINT loyalty_transactions_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_transactions_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_transactions_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES loyalty_wallets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.loyalty_wallets (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  customer_id UUID NOT NULL,
  program_id TEXT,
  tier_id TEXT,
  wallet_type TEXT DEFAULT 'points'::text NOT NULL,
  current_points_balance NUMERIC(14,2) DEFAULT 0 NOT NULL,
  lifetime_earned_points NUMERIC(14,2) DEFAULT 0 NOT NULL,
  lifetime_burned_points NUMERIC(14,2) DEFAULT 0 NOT NULL,
  lifetime_expired_points NUMERIC(14,2) DEFAULT 0 NOT NULL,
  last_transaction_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT loyalty_wallets_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_wallets_wallet_type_check CHECK (wallet_type = ANY (ARRAY['points'::text, 'reward'::text, 'frequency'::text, 'stored_value'::text])),
  CONSTRAINT loyalty_wallets_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_wallets_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_programs(id) ON DELETE SET NULL,
  CONSTRAINT loyalty_wallets_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES loyalty_tiers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.musteriler (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  ad_soyad TEXT NOT NULL,
  cari BOOLEAN DEFAULT false NOT NULL,
  musteri_tipi TEXT DEFAULT 'gercek'::text NOT NULL,
  sirket_adi TEXT,
  vergi_no TEXT,
  email TEXT,
  notlar TEXT,
  telefon TEXT,
  telefon_ulke TEXT DEFAULT '+90'::text,
  adresler JSONB DEFAULT '[]'::jsonb NOT NULL,
  toplam_borc NUMERIC(12,2) DEFAULT 0 NOT NULL,
  toplam_alacak NUMERIC(12,2) DEFAULT 0 NOT NULL,
  siparis_sayisi INTEGER DEFAULT 0 NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  normalized_phone TEXT,
  normalized_email TEXT,
  birth_date DATE,
  gender TEXT,
  preferred_language TEXT DEFAULT 'tr'::text,
  loyalty_member_no TEXT,
  loyalty_status TEXT DEFAULT 'prospect'::text,
  loyalty_enrolled_at TIMESTAMPTZ,
  sms_opt_in BOOLEAN DEFAULT false,
  email_opt_in BOOLEAN DEFAULT false,
  push_opt_in BOOLEAN DEFAULT false,
  kvkk_consent_at TIMESTAMPTZ,
  marketing_consent_at TIMESTAMPTZ,
  acquisition_source TEXT,
  signup_channel TEXT,
  home_branch_id UUID,
  home_branch_name TEXT,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,
  last_visit_at TIMESTAMPTZ,
  total_order_count INTEGER DEFAULT 0,
  total_order_amount NUMERIC(14,2) DEFAULT 0,
  avg_ticket_amount NUMERIC(14,2) DEFAULT 0,
  tags JSONB DEFAULT '[]'::jsonb NOT NULL,
  external_customer_ref TEXT,
  mobile_app_user_id TEXT,
  referral_code TEXT,
  referred_by_customer_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT musteriler_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.option_groups (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  category_id UUID,
  options JSONB DEFAULT '[]'::jsonb,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  CONSTRAINT option_groups_pkey PRIMARY KEY (id),
  CONSTRAINT option_groups_category_id_fkey FOREIGN KEY (category_id) REFERENCES sale_categories(id)
);

CREATE TABLE IF NOT EXISTS public.order_flows (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  flow_type TEXT DEFAULT 'otomatik'::text NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  supplier_id UUID,
  branches JSONB DEFAULT '[]'::jsonb NOT NULL,
  no_calendar BOOLEAN DEFAULT false NOT NULL,
  order_days JSONB DEFAULT '[]'::jsonb NOT NULL,
  delivery_hour TEXT DEFAULT '17:00'::text NOT NULL,
  lead_days INTEGER DEFAULT 1 NOT NULL,
  cutoff_hour TEXT DEFAULT '13:00'::text NOT NULL,
  auto_cancel BOOLEAN DEFAULT false NOT NULL,
  auto_send BOOLEAN DEFAULT false NOT NULL,
  all_products BOOLEAN DEFAULT true NOT NULL,
  qty_mode TEXT DEFAULT 'tahmin'::text NOT NULL,
  forecast_ratio NUMERIC(5,2) DEFAULT 1.0 NOT NULL,
  round_min_qty BOOLEAN DEFAULT false NOT NULL,
  round_box_qty BOOLEAN DEFAULT false NOT NULL,
  round_box_threshold NUMERIC(4,2) DEFAULT 0.25 NOT NULL,
  allow_edit BOOLEAN DEFAULT false NOT NULL,
  edit_cutoff_hour TEXT DEFAULT '16:00'::text NOT NULL,
  allow_cancel BOOLEAN DEFAULT false NOT NULL,
  cancel_cutoff_hour TEXT DEFAULT '17:00'::text NOT NULL,
  allow_extra_product BOOLEAN DEFAULT false NOT NULL,
  branch_approval BOOLEAN DEFAULT false NOT NULL,
  hq_approval BOOLEAN DEFAULT false NOT NULL,
  hq_approval_threshold NUMERIC(12,2),
  allow_date_change BOOLEAN DEFAULT false NOT NULL,
  check_credit_limit BOOLEAN DEFAULT false NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  siparis_sikligi TEXT DEFAULT 'haftalik'::text NOT NULL,
  aylik_mod TEXT DEFAULT 'gun'::text NOT NULL,
  aylik_gunler JSONB DEFAULT '[]'::jsonb NOT NULL,
  aylik_haftagun_sira TEXT,
  aylik_haftagun_gun TEXT,
  urun_tipi TEXT DEFAULT 'all'::text NOT NULL,
  selected_stocks JSONB DEFAULT '[]'::jsonb NOT NULL,
  stock_template_id UUID,
  CONSTRAINT order_flows_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  local_id TEXT NOT NULL,
  masa_no TEXT,
  channel_id UUID,
  odeme TEXT DEFAULT 'nakit'::text NOT NULL,
  alinan NUMERIC(12,2),
  toplam NUMERIC(12,2) NOT NULL,
  items JSONB DEFAULT '[]'::jsonb NOT NULL,
  tarih TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  personnel_id TEXT,
  personnel_name TEXT,
  cover_count INTEGER DEFAULT 0 NOT NULL,
  female_guest_count INTEGER DEFAULT 0 NOT NULL,
  male_guest_count INTEGER DEFAULT 0 NOT NULL,
  child_guest_count INTEGER DEFAULT 0 NOT NULL,
  CONSTRAINT pos_sales_pkey PRIMARY KEY (id),
  CONSTRAINT pos_sales_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES sales_channels(id),
  CONSTRAINT pos_sales_local_id_key UNIQUE (local_id)
);

CREATE TABLE IF NOT EXISTS public.price_changes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  sale_item_id UUID,
  sale_item_name TEXT,
  sale_item_sku TEXT,
  effective_date DATE,
  applied_at TIMESTAMPTZ,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT price_changes_pkey PRIMARY KEY (id),
  CONSTRAINT price_changes_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.production_records (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  produced_at TIMESTAMPTZ DEFAULT now(),
  semi_item_id UUID,
  produce_qty NUMERIC NOT NULL,
  unit_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  sale_price NUMERIC,
  notes TEXT,
  status TEXT DEFAULT 'completed'::text,
  CONSTRAINT production_records_pkey PRIMARY KEY (id),
  CONSTRAINT production_records_semi_item_id_fkey FOREIGN KEY (semi_item_id) REFERENCES semi_items(id)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  order_id UUID NOT NULL,
  line_no INTEGER DEFAULT 1 NOT NULL,
  stock_item_id UUID,
  item_name TEXT NOT NULL,
  item_sku TEXT,
  unit TEXT,
  current_stock NUMERIC(18,4) DEFAULT 0 NOT NULL,
  planned_delivery_date DATE,
  next_order_date DATE,
  next_delivery_date DATE,
  calculated_need NUMERIC(18,4) DEFAULT 0 NOT NULL,
  suggested_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  ordered_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  price_source TEXT,
  unit_price NUMERIC(18,4) DEFAULT 0 NOT NULL,
  line_total NUMERIC(18,4) DEFAULT 0 NOT NULL,
  contract_id UUID,
  notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT purchase_order_lines_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  order_no TEXT NOT NULL,
  branch_id UUID,
  branch_name TEXT,
  flow_id UUID,
  flow_name TEXT,
  supplier_id UUID,
  supplier_name TEXT,
  description TEXT,
  order_source TEXT DEFAULT 'flow'::text NOT NULL,
  status TEXT DEFAULT 'pending_action'::text NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE NOT NULL,
  cutoff_at TIMESTAMPTZ,
  delivery_date DATE,
  delivery_time TIME,
  next_order_date DATE,
  next_delivery_date DATE,
  qty_mode TEXT,
  auto_send_mode TEXT,
  branch_approval BOOLEAN DEFAULT false NOT NULL,
  hq_approval BOOLEAN DEFAULT false NOT NULL,
  needs_manager_approval BOOLEAN DEFAULT false NOT NULL,
  manager_approval_status TEXT DEFAULT 'not_required'::text NOT NULL,
  total_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  subtotal NUMERIC(18,4) DEFAULT 0 NOT NULL,
  total_amount NUMERIC(18,4) DEFAULT 0 NOT NULL,
  suggestion_refreshed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_manager_approval_check CHECK (manager_approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text])),
  CONSTRAINT purchase_orders_source_check CHECK (order_source = ANY (ARRAY['flow'::text, 'manual'::text])),
  CONSTRAINT purchase_orders_status_check CHECK (status = ANY (ARRAY['draft'::text, 'pending_action'::text, 'awaiting_approval'::text, 'submitted'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text])),
  CONSTRAINT purchase_orders_order_no_key UNIQUE (order_no)
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  receipt_id UUID NOT NULL,
  order_id UUID,
  order_line_id UUID,
  line_no INTEGER DEFAULT 1 NOT NULL,
  stock_item_id UUID,
  item_name TEXT NOT NULL,
  item_sku TEXT,
  unit TEXT,
  suggested_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  ordered_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  calculated_need NUMERIC(18,4) DEFAULT 0 NOT NULL,
  received_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  unit_price NUMERIC(18,4) DEFAULT 0 NOT NULL,
  vat_rate NUMERIC(10,4) DEFAULT 0.1 NOT NULL,
  line_total NUMERIC(18,4) DEFAULT 0 NOT NULL,
  line_total_vat_inc NUMERIC(18,4) DEFAULT 0 NOT NULL,
  inventory_movement_id UUID,
  notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT purchase_receipt_lines_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_receipt_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  CONSTRAINT purchase_receipt_lines_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
  CONSTRAINT purchase_receipt_lines_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  receipt_no TEXT NOT NULL,
  order_id UUID,
  order_no TEXT,
  branch_id UUID,
  branch_name TEXT,
  supplier_id UUID,
  supplier_name TEXT,
  flow_name TEXT,
  description TEXT,
  planned_delivery_date DATE,
  delivered_on DATE DEFAULT CURRENT_DATE NOT NULL,
  delivered_at TIME,
  doc_kind TEXT DEFAULT 'irsaliye'::text NOT NULL,
  doc_date DATE,
  doc_no TEXT,
  note TEXT,
  explanation TEXT,
  status TEXT DEFAULT 'completed'::text NOT NULL,
  total_qty NUMERIC(18,4) DEFAULT 0 NOT NULL,
  subtotal NUMERIC(18,4) DEFAULT 0 NOT NULL,
  total_amount NUMERIC(18,4) DEFAULT 0 NOT NULL,
  total_amount_vat_inc NUMERIC(18,4) DEFAULT 0 NOT NULL,
  inventory_posted_at TIMESTAMPTZ,
  inventory_post_error TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT purchase_receipts_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_receipts_doc_kind_check CHECK (doc_kind = ANY (ARRAY['irsaliye'::text, 'irsaliyeli_fatura'::text, 'belgesiz'::text])),
  CONSTRAINT purchase_receipts_status_check CHECK (status = ANY (ARRAY['draft'::text, 'completed'::text, 'cancelled'::text])),
  CONSTRAINT purchase_receipts_order_id_fkey FOREIGN KEY (order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
  CONSTRAINT purchase_receipts_receipt_no_key UNIQUE (receipt_no)
);

CREATE TABLE IF NOT EXISTS public.sale_categories (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID,
  bg TEXT DEFAULT '#fef3c7'::text,
  text_color TEXT DEFAULT '#92400e'::text,
  sku_mask TEXT,
  append_type TEXT,
  append_len INTEGER DEFAULT 4,
  description TEXT,
  acc_cat TEXT,
  acc_code TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  revenue_account_id TEXT,
  CONSTRAINT sale_categories_pkey PRIMARY KEY (id),
  CONSTRAINT sale_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES sale_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  sku TEXT,
  auto_sku BOOLEAN DEFAULT false,
  name TEXT NOT NULL,
  short_name TEXT,
  description TEXT,
  location JSONB DEFAULT '[]'::jsonb,
  cat_l1 UUID,
  cat_l2 UUID,
  cat_l3 UUID,
  cat_l4 UUID,
  cat_l5 UUID,
  acc_cat TEXT,
  acc_code TEXT,
  unit TEXT,
  sale_price NUMERIC(12,2),
  cost_price NUMERIC(12,2),
  tax_id UUID,
  stock_item_id UUID,
  recipe_linked BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  channel_prices JSONB DEFAULT '[]'::jsonb,
  same_price BOOLEAN DEFAULT false,
  pos_image TEXT,
  pos_color TEXT DEFAULT '#1e293b'::text,
  pos_text_color TEXT DEFAULT '#ffffff'::text,
  channel_image TEXT,
  channel_description TEXT,
  setting_active BOOLEAN DEFAULT true,
  sale_status BOOLEAN DEFAULT true,
  is_favorite BOOLEAN DEFAULT false,
  split_payment BOOLEAN DEFAULT false,
  print_note BOOLEAN DEFAULT false,
  hide_kitchen BOOLEAN DEFAULT false,
  substitute_id UUID,
  portions JSONB DEFAULT '[]'::jsonb,
  option_groups JSONB DEFAULT '[]'::jsonb,
  sale_cat_l1 UUID,
  sale_cat_l2 UUID,
  sale_cat_l3 UUID,
  sale_cat_l4 UUID,
  sale_cat_l5 UUID,
  recipe_rows JSONB DEFAULT '[]'::jsonb,
  recipe_output_qty NUMERIC(12,4) DEFAULT 1,
  recipe_output_unit TEXT,
  recipe_is_template BOOLEAN DEFAULT false,
  standard_price NUMERIC(12,4),
  prep_time_minutes INTEGER DEFAULT 0 NOT NULL,
  CONSTRAINT sale_items_pkey PRIMARY KEY (id),
  CONSTRAINT sale_items_sale_cat_l1_fkey FOREIGN KEY (sale_cat_l1) REFERENCES sale_categories(id) ON DELETE SET NULL,
  CONSTRAINT sale_items_sale_cat_l2_fkey FOREIGN KEY (sale_cat_l2) REFERENCES sale_categories(id) ON DELETE SET NULL,
  CONSTRAINT sale_items_sale_cat_l3_fkey FOREIGN KEY (sale_cat_l3) REFERENCES sale_categories(id) ON DELETE SET NULL,
  CONSTRAINT sale_items_sale_cat_l4_fkey FOREIGN KEY (sale_cat_l4) REFERENCES sale_categories(id) ON DELETE SET NULL,
  CONSTRAINT sale_items_sale_cat_l5_fkey FOREIGN KEY (sale_cat_l5) REFERENCES sale_categories(id) ON DELETE SET NULL,
  CONSTRAINT sale_items_substitute_id_fkey FOREIGN KEY (substitute_id) REFERENCES sale_items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.sale_lines (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  sale_id UUID NOT NULL,
  line_no INTEGER NOT NULL,
  product_id UUID,
  product_name TEXT NOT NULL,
  product_sku TEXT,
  top_category_id UUID,
  top_category_name TEXT,
  sub_category_id UUID,
  sub_category_name TEXT,
  portion_id TEXT,
  portion_name TEXT,
  options_json JSONB DEFAULT '[]'::jsonb NOT NULL,
  options_summary TEXT,
  line_note TEXT,
  qty NUMERIC(12,3) DEFAULT 1 NOT NULL,
  unit_gross_before_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  line_gross_before_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  discount_allocated_amount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  unit_gross_after_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  line_gross_after_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  tax_id UUID,
  tax_name TEXT,
  tax_rate NUMERIC(8,4) DEFAULT 0 NOT NULL,
  line_net_after_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  unit_cost_snapshot NUMERIC(14,4) DEFAULT 0 NOT NULL,
  line_cost_total NUMERIC(14,2) DEFAULT 0 NOT NULL,
  sales_channel_id UUID,
  sales_channel_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  sale_datetime TIMESTAMPTZ NOT NULL,
  discount_source TEXT,
  loyalty_campaign_id TEXT,
  loyalty_campaign_name TEXT,
  loyalty_application_mode TEXT,
  loyalty_action_type TEXT,
  loyalty_offer_label TEXT,
  loyalty_source_rule_id TEXT,
  loyalty_selected_coupon_code TEXT,
  loyalty_applied_actions_json JSONB,
  loyalty_decision_context_json JSONB,
  loyalty_discount_allocated_amount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  kds_completed BOOLEAN DEFAULT false NOT NULL,
  prep_time_minutes INTEGER DEFAULT 0 NOT NULL,
  CONSTRAINT sale_lines_pkey PRIMARY KEY (id),
  CONSTRAINT sale_lines_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.sale_options (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  short_name TEXT,
  sku TEXT,
  channel_prices JSONB DEFAULT '[]'::jsonb,
  portions JSONB DEFAULT '[]'::jsonb,
  same_price BOOLEAN DEFAULT false,
  recipe_rows JSONB DEFAULT '[]'::jsonb,
  sale_status BOOLEAN DEFAULT true,
  CONSTRAINT sale_options_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sale_payments (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  sale_id UUID NOT NULL,
  payment_method TEXT NOT NULL,
  payment_method_label TEXT,
  amount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  reference_no TEXT,
  payment_datetime TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT sale_payments_pkey PRIMARY KEY (id),
  CONSTRAINT sale_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.sale_templates (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sale_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT sale_templates_pkey PRIMARY KEY (id),
  CONSTRAINT sale_templates_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  local_id TEXT,
  sale_no TEXT,
  sale_datetime TIMESTAMPTZ DEFAULT now() NOT NULL,
  source TEXT DEFAULT 'pos'::text NOT NULL,
  source_channel_type TEXT DEFAULT 'hizli_satis'::text NOT NULL,
  sales_channel_id UUID,
  sales_channel_name TEXT,
  company_id UUID,
  company_name TEXT,
  legal_entity_id UUID,
  legal_entity_name TEXT,
  org_unit_id UUID,
  org_unit_name TEXT,
  branch_id UUID,
  branch_name TEXT,
  table_no TEXT,
  customer_id UUID,
  customer_address_id UUID,
  customer_name TEXT,
  cashier_id UUID,
  cashier_name TEXT,
  order_note TEXT,
  currency_code TEXT DEFAULT 'TRY'::text NOT NULL,
  gross_total_before_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  discount_type TEXT,
  discount_value NUMERIC(14,6) DEFAULT 0 NOT NULL,
  discount_amount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  gross_total_after_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  net_total_after_discount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  cost_total NUMERIC(14,2) DEFAULT 0 NOT NULL,
  payment_total NUMERIC(14,2) DEFAULT 0 NOT NULL,
  change_amount NUMERIC(14,2) DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'completed'::text NOT NULL,
  integration_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  personnel_id TEXT,
  personnel_name TEXT,
  cover_count INTEGER DEFAULT 0 NOT NULL,
  female_guest_count INTEGER DEFAULT 0 NOT NULL,
  male_guest_count INTEGER DEFAULT 0 NOT NULL,
  child_guest_count INTEGER DEFAULT 0 NOT NULL,
  kds_status TEXT DEFAULT 'pending'::text,
  kiosk_service_type TEXT,
  kiosk_table_number TEXT,
  kiosk_display_no INTEGER,
  pickup_called BOOLEAN DEFAULT false NOT NULL,
  delivery_address_snapshot JSONB,
  discount_source TEXT,
  loyalty_campaign_id TEXT,
  loyalty_campaign_name TEXT,
  loyalty_application_mode TEXT,
  loyalty_action_type TEXT,
  loyalty_offer_label TEXT,
  loyalty_source_rule_id TEXT,
  loyalty_selected_coupon_code TEXT,
  loyalty_applied_actions_json JSONB,
  loyalty_decision_context_json JSONB,
  CONSTRAINT sales_pkey PRIMARY KEY (id),
  CONSTRAINT sales_discount_type_check CHECK (discount_type IS NULL OR (discount_type = ANY (ARRAY['percent'::text, 'amount'::text]))),
  CONSTRAINT sales_kds_status_check CHECK (kds_status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'ready'::text, 'delivered'::text])),
  CONSTRAINT sales_kiosk_service_type_check CHECK (kiosk_service_type = ANY (ARRAY['takeaway'::text, 'table_service'::text])),
  CONSTRAINT sales_status_check CHECK (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'refunded'::text, 'partially_refunded'::text])),
  CONSTRAINT sales_local_id_key UNIQUE (local_id),
  CONSTRAINT sales_customer_address_id_fkey FOREIGN KEY (customer_address_id) REFERENCES public.customer_addresses(id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS public.sales_channels (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  show_in_kds BOOLEAN DEFAULT true NOT NULL,
  show_in_queue BOOLEAN DEFAULT true NOT NULL,
  CONSTRAINT sales_channels_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.sales_forecasts (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  forecast_date DATE NOT NULL,
  branch_id TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  lookback_weeks INTEGER DEFAULT 4 NOT NULL,
  calc_receipt_count NUMERIC,
  adj_receipt_count NUMERIC,
  calc_total_sales NUMERIC,
  adj_total_sales NUMERIC,
  actual_total_sales NUMERIC,
  actual_receipt_count INTEGER,
  system_version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,
  initial_receipt_count NUMERIC,
  initial_total_sales NUMERIC,
  CONSTRAINT sales_forecasts_pkey PRIMARY KEY (id),
  CONSTRAINT sales_forecasts_forecast_date_branch_id_system_version_key UNIQUE (forecast_date, branch_id, system_version)
);

CREATE TABLE IF NOT EXISTS public.semi_categories (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID,
  bg TEXT DEFAULT '#fef3c7'::text,
  text_color TEXT DEFAULT '#92400e'::text,
  sku_mask TEXT,
  append_type TEXT,
  append_len INTEGER DEFAULT 4,
  description TEXT,
  acc_cat TEXT,
  acc_code TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  semi_cost_account_id TEXT,
  CONSTRAINT semi_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.semi_items (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  name TEXT NOT NULL,
  short_name TEXT,
  sku TEXT,
  auto_sku BOOLEAN DEFAULT true,
  sale_cat_l1 UUID,
  sale_cat_l2 UUID,
  sale_cat_l3 UUID,
  sale_cat_l4 UUID,
  sale_cat_l5 UUID,
  acc_cat TEXT,
  acc_code TEXT,
  location JSONB DEFAULT '[]'::jsonb,
  channel_prices JSONB DEFAULT '[]'::jsonb,
  portions JSONB DEFAULT '[]'::jsonb,
  option_groups JSONB DEFAULT '[]'::jsonb,
  same_price BOOLEAN DEFAULT false,
  standard_price NUMERIC,
  pos_image TEXT,
  pos_color TEXT DEFAULT '#1e293b'::text,
  pos_text_color TEXT DEFAULT '#ffffff'::text,
  channel_image TEXT,
  channel_description TEXT,
  setting_active BOOLEAN DEFAULT true,
  sale_status BOOLEAN DEFAULT true,
  is_favorite BOOLEAN DEFAULT false,
  split_payment BOOLEAN DEFAULT false,
  print_note BOOLEAN DEFAULT false,
  hide_kitchen BOOLEAN DEFAULT false,
  substitute_id UUID,
  recipe_rows JSONB DEFAULT '[]'::jsonb,
  recipe_output_qty NUMERIC DEFAULT 1,
  recipe_output_unit TEXT,
  recipe_is_template BOOLEAN DEFAULT false,
  CONSTRAINT semi_items_pkey PRIMARY KEY (id),
  CONSTRAINT semi_items_sale_cat_l1_fkey FOREIGN KEY (sale_cat_l1) REFERENCES semi_categories(id),
  CONSTRAINT semi_items_sale_cat_l2_fkey FOREIGN KEY (sale_cat_l2) REFERENCES semi_categories(id),
  CONSTRAINT semi_items_sale_cat_l3_fkey FOREIGN KEY (sale_cat_l3) REFERENCES semi_categories(id),
  CONSTRAINT semi_items_sale_cat_l4_fkey FOREIGN KEY (sale_cat_l4) REFERENCES semi_categories(id),
  CONSTRAINT semi_items_sale_cat_l5_fkey FOREIGN KEY (sale_cat_l5) REFERENCES semi_categories(id)
);

CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT NOT NULL,
  value JSONB,
  CONSTRAINT settings_pkey PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS public.stock_items (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  sku TEXT,
  auto_sku BOOLEAN DEFAULT false NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  location JSONB DEFAULT '[]'::jsonb NOT NULL,
  acc_cat TEXT,
  acc_code TEXT,
  cat_l1 UUID,
  cat_l2 UUID,
  cat_l3 UUID,
  cat_l4 UUID,
  cat_l5 UUID,
  unit TEXT,
  packaging_units JSONB DEFAULT '[]'::jsonb NOT NULL,
  min_stock NUMERIC(10,3) DEFAULT 0 NOT NULL,
  max_stock NUMERIC(10,3) DEFAULT 1000 NOT NULL,
  reorder NUMERIC(10,3),
  order_unit TEXT DEFAULT 'ana'::text NOT NULL,
  min_order NUMERIC(10,3),
  max_order NUMERIC(10,3),
  recipe_linked BOOLEAN DEFAULT false NOT NULL,
  daily_usage NUMERIC(10,3),
  auto_usage BOOLEAN DEFAULT false NOT NULL,
  supp_id UUID,
  purchase_price NUMERIC(10,4),
  suppliers_list JSONB DEFAULT '[]'::jsonb NOT NULL,
  saleable BOOLEAN DEFAULT false NOT NULL,
  sale_name TEXT,
  sale_group TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT stock_items_pkey PRIMARY KEY (id),
  CONSTRAINT stock_items_cat_l1_fkey FOREIGN KEY (cat_l1) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l2_fkey FOREIGN KEY (cat_l2) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l3_fkey FOREIGN KEY (cat_l3) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l4_fkey FOREIGN KEY (cat_l4) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l5_fkey FOREIGN KEY (cat_l5) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_supp_id_fkey FOREIGN KEY (supp_id) REFERENCES suppliers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.stock_templates (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  stock_ids JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT stock_templates_pkey PRIMARY KEY (id),
  CONSTRAINT stock_templates_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  cari_kodu TEXT,
  muhasebe_kodu TEXT,
  karsi_taraf_kodu TEXT,
  name TEXT NOT NULL,
  marka_kisa_adi TEXT,
  yetkililer JSONB DEFAULT '[]'::jsonb NOT NULL,
  sirket_tipi TEXT DEFAULT 'tuzel'::text NOT NULL,
  vergi_dairesi TEXT,
  vergi_no TEXT,
  tc_no TEXT,
  fatura_tipi TEXT DEFAULT 'e_fatura'::text NOT NULL,
  pay_term INTEGER DEFAULT 30 NOT NULL,
  banka TEXT,
  iban TEXT,
  siparis_yontemi TEXT DEFAULT 'email'::text NOT NULL,
  siparis_mailleri JSONB DEFAULT '[]'::jsonb NOT NULL,
  siparis_telefonlari JSONB DEFAULT '[]'::jsonb NOT NULL,
  siparis_wa_no TEXT,
  logo_url TEXT,
  cat TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.taxes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  rate NUMERIC(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT taxes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.time_tracking_defs (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  row_type TEXT NOT NULL,
  sale_item_id UUID,
  stock_item_id UUID,
  bakim_name TEXT,
  times JSONB DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT time_tracking_defs_pkey PRIMARY KEY (id),
  CONSTRAINT time_tracking_defs_row_type_check CHECK (row_type = ANY (ARRAY['sale_item'::text, 'stock_item'::text, 'bakim'::text])),
  CONSTRAINT time_tracking_defs_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.time_tracking_timers (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  row_type TEXT,
  sale_item_id UUID,
  stock_item_id UUID,
  bakim_name TEXT,
  type_id UUID,
  duration_minutes BIGINT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  note TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT time_tracking_timers_pkey PRIMARY KEY (id),
  CONSTRAINT time_tracking_timers_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
  CONSTRAINT time_tracking_timers_type_id_fkey FOREIGN KEY (type_id) REFERENCES time_tracking_types(id)
);

CREATE TABLE IF NOT EXISTS public.time_tracking_types (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT time_tracking_types_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.tr_ilceler (
  id INTEGER DEFAULT nextval('tr_ilceler_id_seq'::regclass) NOT NULL,
  il_id INTEGER,
  ad TEXT NOT NULL,
  CONSTRAINT tr_ilceler_pkey PRIMARY KEY (id),
  CONSTRAINT tr_ilceler_il_id_fkey FOREIGN KEY (il_id) REFERENCES tr_iller(id)
);

CREATE TABLE IF NOT EXISTS public.tr_iller (
  id INTEGER DEFAULT nextval('tr_iller_id_seq'::regclass) NOT NULL,
  ad TEXT NOT NULL,
  CONSTRAINT tr_iller_pkey PRIMARY KEY (id),
  CONSTRAINT tr_iller_ad_key UNIQUE (ad)
);

CREATE TABLE IF NOT EXISTS public.tr_mahalleler (
  id INTEGER DEFAULT nextval('tr_mahalleler_id_seq'::regclass) NOT NULL,
  ilce_id INTEGER,
  ad TEXT NOT NULL,
  CONSTRAINT tr_mahalleler_pkey PRIMARY KEY (id),
  CONSTRAINT tr_mahalleler_ilce_id_fkey FOREIGN KEY (ilce_id) REFERENCES tr_ilceler(id)
);

CREATE TABLE IF NOT EXISTS public.tr_sokaklar (
  id BIGSERIAL NOT NULL,
  mahalle_id INTEGER NOT NULL,
  ad TEXT NOT NULL,
  tur TEXT,
  source TEXT DEFAULT 'openstreetmap'::text NOT NULL,
  source_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT tr_sokaklar_pkey PRIMARY KEY (id),
  CONSTRAINT tr_sokaklar_mahalle_id_fkey FOREIGN KEY (mahalle_id) REFERENCES tr_mahalleler(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.units (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  symbol TEXT,
  is_system BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  CONSTRAINT units_pkey PRIMARY KEY (id),
  CONSTRAINT units_name_key UNIQUE (name)
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

CREATE INDEX idx_activity_logs_action_type_created_at ON public.activity_logs USING btree (action_type, created_at DESC);
CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at DESC);
CREATE INDEX idx_activity_logs_user_id_created_at ON public.activity_logs USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX allowed_users_email_key ON public.allowed_users USING btree (email);
CREATE INDEX idx_allowed_users_email ON public.allowed_users USING btree (email);
CREATE INDEX branch_period_locks_active_idx ON public.branch_period_locks USING btree (active);
CREATE INDEX branch_period_locks_branch_idx ON public.branch_period_locks USING btree (branch_id);
CREATE INDEX branch_period_locks_date_idx ON public.branch_period_locks USING btree (close_date DESC);
CREATE INDEX branch_period_locks_type_idx ON public.branch_period_locks USING btree (type);
CREATE UNIQUE INDEX branch_shift_presets_branch_short_code_uidx ON public.branch_shift_presets USING btree (branch_id, lower(short_code)) WHERE (deleted_at IS NULL);
CREATE INDEX branch_shift_presets_branch_sort_idx ON public.branch_shift_presets USING btree (branch_id, sort_order, name) WHERE (deleted_at IS NULL);
CREATE INDEX branch_shift_schedule_days_branch_date_idx ON public.branch_shift_schedule_days USING btree (branch_id, schedule_date);
CREATE UNIQUE INDEX branch_shift_schedule_days_branch_date_uidx ON public.branch_shift_schedule_days USING btree (branch_id, schedule_date);
CREATE INDEX branch_shift_schedule_entries_branch_date_idx ON public.branch_shift_schedule_entries USING btree (branch_id, schedule_date, sort_order, personnel_name);
CREATE UNIQUE INDEX branch_shift_schedule_entries_branch_date_personnel_uidx ON public.branch_shift_schedule_entries USING btree (branch_id, schedule_date, personnel_id);
CREATE INDEX branch_shift_schedule_entries_preset_idx ON public.branch_shift_schedule_entries USING btree (source_shift_preset_id);
CREATE INDEX idx_branch_addresses_active_branch ON public.branch_addresses USING btree (branch_id) WHERE (deleted_at IS NULL);
CREATE INDEX idx_branch_addresses_city_district_neighborhood ON public.branch_addresses USING btree (city_id, district_id, neighborhood_id) WHERE ((deleted_at IS NULL) AND (active = true));
CREATE INDEX idx_branch_service_coverage_active_branch ON public.branch_service_coverage USING btree (branch_id, priority) WHERE (deleted_at IS NULL);
CREATE INDEX idx_branch_service_coverage_city_district_neighborhood ON public.branch_service_coverage USING btree (city_id, district_id, neighborhood_id, priority) WHERE ((deleted_at IS NULL) AND (active = true));
CREATE UNIQUE INDEX branch_templates_name_key ON public.branch_templates USING btree (name);
CREATE UNIQUE INDEX contracts_contract_no_key ON public.contracts USING btree (contract_no);
CREATE INDEX contracts_deleted_at_idx ON public.contracts USING btree (deleted_at);
CREATE INDEX contracts_supplier_id_idx ON public.contracts USING btree (supplier_id);
CREATE INDEX idx_count_flows_name ON public.count_flows USING btree (name);
CREATE INDEX idx_count_flows_updated_at ON public.count_flows USING btree (updated_at DESC);
CREATE INDEX idx_customer_addresses_customer_id ON public.customer_addresses USING btree (customer_id);
CREATE INDEX idx_customer_addresses_primary ON public.customer_addresses USING btree (customer_id, is_primary);
CREATE INDEX idx_customer_consent_events_customer_id ON public.customer_consent_events USING btree (customer_id, captured_at DESC);
CREATE INDEX idx_customer_devices_customer_id ON public.customer_devices USING btree (customer_id);
CREATE INDEX idx_customer_devices_push_token ON public.customer_devices USING btree (push_token);
CREATE INDEX daily_sales_branch_idx ON public.daily_sales USING btree (branch_id);
CREATE INDEX daily_sales_date_idx ON public.daily_sales USING btree (sale_date DESC);
CREATE UNIQUE INDEX daily_sales_sale_date_branch_id_key ON public.daily_sales USING btree (sale_date, branch_id);
CREATE INDEX expense_documents_account_idx ON public.expense_documents USING btree (expense_account_id, period_start, period_end);
CREATE INDEX expense_documents_branch_period_idx ON public.expense_documents USING btree (branch_name, period_start, period_end);
CREATE INDEX idx_inventory_movement_recalc_jobs_pending ON public.inventory_movement_recalc_jobs USING btree (status, recalc_from, created_at);
CREATE INDEX idx_inventory_movements_active_branch_name_date ON public.inventory_movements USING btree (branch_name, movement_at DESC, ledger_seq DESC) WHERE ((deleted_at IS NULL) AND (is_cancelled = false));
CREATE INDEX idx_inventory_movements_active_branch_uuid_date ON public.inventory_movements USING btree (branch_id, movement_at DESC, ledger_seq DESC) WHERE ((deleted_at IS NULL) AND (is_cancelled = false));
CREATE INDEX idx_inventory_movements_active_date ON public.inventory_movements USING btree (movement_at DESC, ledger_seq DESC) WHERE ((deleted_at IS NULL) AND (is_cancelled = false));
CREATE INDEX idx_inventory_movements_active_type_date ON public.inventory_movements USING btree (item_type, movement_type, source_doc_type, movement_at DESC, ledger_seq DESC) WHERE ((deleted_at IS NULL) AND (is_cancelled = false));
CREATE INDEX idx_inventory_movements_branch_date ON public.inventory_movements USING btree (branch_id, movement_at DESC);
CREATE INDEX idx_inventory_movements_calc_status ON public.inventory_movements USING btree (calc_status, movement_at);
CREATE INDEX idx_inventory_movements_doc ON public.inventory_movements USING btree (source_doc_type, source_doc_id, source_doc_line_id);
CREATE INDEX idx_inventory_movements_item_branch_date ON public.inventory_movements USING btree (item_type, stock_item_id, semi_item_id, branch_id, movement_at, ledger_seq);
CREATE INDEX idx_inventory_movements_production ON public.inventory_movements USING btree (production_record_id);
CREATE INDEX idx_inventory_movements_reversal_of_movement_id ON public.inventory_movements USING btree (reversal_of_movement_id) WHERE (reversal_of_movement_id IS NOT NULL);
CREATE INDEX idx_inventory_movements_sale_line ON public.inventory_movements USING btree (sale_line_id);
CREATE INDEX idx_inventory_movements_transfer_pair ON public.inventory_movements USING btree (transfer_pair_id);
CREATE UNIQUE INDEX inventory_movements_ledger_seq_key ON public.inventory_movements USING btree (ledger_seq);
CREATE INDEX idx_loyalty_campaign_redemptions_campaign_id ON public.loyalty_campaign_redemptions USING btree (campaign_id, redeemed_at DESC);
CREATE INDEX idx_loyalty_campaign_redemptions_customer_id ON public.loyalty_campaign_redemptions USING btree (customer_id, redeemed_at DESC);
CREATE INDEX idx_loyalty_campaign_rules_campaign_id ON public.loyalty_campaign_rules USING btree (campaign_id, sort_order);
CREATE INDEX idx_loyalty_campaign_rules_scope ON public.loyalty_campaign_rules USING btree (rule_scope, active);
CREATE INDEX idx_loyalty_campaigns_active ON public.loyalty_campaigns USING btree (active, status, starts_at, ends_at);
CREATE INDEX idx_loyalty_campaigns_code ON public.loyalty_campaigns USING btree (code);
CREATE INDEX idx_loyalty_campaigns_program_id ON public.loyalty_campaigns USING btree (program_id);
CREATE INDEX idx_loyalty_campaigns_scope ON public.loyalty_campaigns USING btree (scope_type, scope_branch_id);
CREATE INDEX idx_loyalty_campaign_conflict_groups_active ON public.loyalty_campaign_conflict_groups USING btree (active, sort_order);
CREATE INDEX idx_loyalty_campaign_conflict_groups_scope ON public.loyalty_campaign_conflict_groups USING btree (scope_type, scope_branch_id);
CREATE UNIQUE INDEX uq_loyalty_campaign_conflict_groups_code_scope ON public.loyalty_campaign_conflict_groups USING btree (scope_type, COALESCE(scope_branch_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(COALESCE(code, name))) WHERE (deleted_at IS NULL);
CREATE INDEX idx_loyalty_card_transactions_card_id ON public.loyalty_card_transactions USING btree (card_id, occurred_at DESC);
CREATE INDEX idx_loyalty_card_transactions_customer_id ON public.loyalty_card_transactions USING btree (customer_id, occurred_at DESC);
CREATE INDEX idx_loyalty_cards_customer_id ON public.loyalty_cards USING btree (customer_id, card_status);
CREATE INDEX idx_loyalty_cards_program_id ON public.loyalty_cards USING btree (program_id, card_type, card_status);
CREATE UNIQUE INDEX uq_loyalty_cards_card_no ON public.loyalty_cards USING btree (card_no);
CREATE INDEX idx_loyalty_coupon_series_active ON public.loyalty_coupon_series USING btree (active, created_at);
CREATE INDEX idx_loyalty_coupon_series_scope ON public.loyalty_coupon_series USING btree (scope_type, scope_branch_id);
CREATE INDEX idx_loyalty_coupons_customer_id ON public.loyalty_coupons USING btree (customer_id, used_at DESC);
CREATE INDEX idx_loyalty_coupons_redeemed_customer ON public.loyalty_coupons USING btree (redeemed_by_customer_id, used_at DESC);
CREATE INDEX idx_loyalty_coupons_redemption_status ON public.loyalty_coupons USING btree (redemption_status, expires_at, used_at DESC);
CREATE INDEX idx_loyalty_coupons_series_id ON public.loyalty_coupons USING btree (series_id, is_used);
CREATE UNIQUE INDEX uq_loyalty_coupons_code ON public.loyalty_coupons USING btree (code);
CREATE INDEX idx_loyalty_customer_categories_active ON public.loyalty_customer_categories USING btree (active, sort_order);
CREATE INDEX idx_loyalty_customer_categories_scope ON public.loyalty_customer_categories USING btree (scope_type, scope_branch_id);
CREATE UNIQUE INDEX uq_loyalty_customer_categories_scope_code ON public.loyalty_customer_categories USING btree (scope_type, COALESCE(scope_branch_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(code, ''::text));
CREATE INDEX idx_loyalty_customer_category_members_category ON public.loyalty_customer_category_members USING btree (category_id, active);
CREATE INDEX idx_loyalty_customer_category_members_customer ON public.loyalty_customer_category_members USING btree (customer_id, active);
CREATE INDEX idx_loyalty_customer_category_members_scope ON public.loyalty_customer_category_members USING btree (scope_type, scope_branch_id, customer_id);
CREATE UNIQUE INDEX uq_loyalty_customer_category_members_active ON public.loyalty_customer_category_members USING btree (customer_id, category_id, scope_type, COALESCE(scope_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (deleted_at IS NULL);
CREATE INDEX idx_loyalty_frequency_progress_program ON public.loyalty_frequency_progress USING btree (program_id, progress_type, updated_at DESC);
CREATE UNIQUE INDEX uq_loyalty_frequency_progress_customer_program ON public.loyalty_frequency_progress USING btree (customer_id, program_id, progress_type);
CREATE INDEX idx_loyalty_programs_active ON public.loyalty_programs USING btree (active, starts_at, ends_at);
CREATE INDEX idx_loyalty_programs_scope ON public.loyalty_programs USING btree (scope_type, scope_branch_id);
CREATE INDEX idx_loyalty_reward_entitlements_campaign ON public.loyalty_reward_entitlements USING btree (campaign_id, entitlement_status, earned_at DESC);
CREATE INDEX idx_loyalty_reward_entitlements_customer_status ON public.loyalty_reward_entitlements USING btree (customer_id, entitlement_status, earned_at DESC);
CREATE INDEX idx_loyalty_reward_entitlements_expires ON public.loyalty_reward_entitlements USING btree (expires_at, entitlement_status);
CREATE INDEX idx_loyalty_reward_entitlements_source_ref ON public.loyalty_reward_entitlements USING btree (source_ref_id);
CREATE INDEX idx_loyalty_tiers_active ON public.loyalty_tiers USING btree (active, sort_order);
CREATE INDEX idx_loyalty_tiers_scope ON public.loyalty_tiers USING btree (scope_type, scope_branch_id);
CREATE INDEX idx_loyalty_transactions_campaign_id ON public.loyalty_transactions USING btree (campaign_id);
CREATE INDEX idx_loyalty_transactions_customer_id ON public.loyalty_transactions USING btree (customer_id, occurred_at DESC);
CREATE INDEX idx_loyalty_transactions_program_id ON public.loyalty_transactions USING btree (program_id, wallet_type, occurred_at DESC);
CREATE INDEX idx_loyalty_transactions_source_ref_id ON public.loyalty_transactions USING btree (source_ref_id);
CREATE INDEX idx_loyalty_transactions_wallet_id ON public.loyalty_transactions USING btree (wallet_id, occurred_at DESC);
CREATE INDEX idx_loyalty_wallets_program_id ON public.loyalty_wallets USING btree (program_id, wallet_type);
CREATE INDEX idx_loyalty_wallets_tier_id ON public.loyalty_wallets USING btree (tier_id);
CREATE UNIQUE INDEX uq_loyalty_wallets_program_wallet ON public.loyalty_wallets USING btree (customer_id, COALESCE(program_id, ''::text), wallet_type);
CREATE INDEX idx_musteriler_external_customer_ref ON public.musteriler USING btree (external_customer_ref);
CREATE INDEX idx_musteriler_home_branch_id ON public.musteriler USING btree (home_branch_id);
CREATE INDEX idx_musteriler_loyalty_enrolled_at ON public.musteriler USING btree (loyalty_enrolled_at DESC);
CREATE INDEX idx_musteriler_loyalty_status ON public.musteriler USING btree (loyalty_status);
CREATE INDEX idx_musteriler_mobile_app_user_id ON public.musteriler USING btree (mobile_app_user_id);
CREATE INDEX idx_musteriler_normalized_email ON public.musteriler USING btree (normalized_email);
CREATE INDEX idx_musteriler_normalized_phone ON public.musteriler USING btree (normalized_phone);
CREATE INDEX idx_musteriler_referral_code ON public.musteriler USING btree (referral_code);
CREATE INDEX idx_pos_sales_personnel_id ON public.pos_sales USING btree (personnel_id);
CREATE INDEX idx_pos_sales_personnel_name ON public.pos_sales USING btree (personnel_name);
CREATE UNIQUE INDEX pos_sales_local_id_key ON public.pos_sales USING btree (local_id);
CREATE INDEX production_records_produced_at_idx ON public.production_records USING btree (produced_at DESC);
CREATE INDEX production_records_semi_item_idx ON public.production_records USING btree (semi_item_id);
CREATE INDEX idx_purchase_order_lines_item ON public.purchase_order_lines USING btree (stock_item_id);
CREATE UNIQUE INDEX idx_purchase_order_lines_order_line ON public.purchase_order_lines USING btree (order_id, line_no);
CREATE INDEX idx_purchase_orders_branch_status_date ON public.purchase_orders USING btree (branch_id, status, order_date DESC);
CREATE INDEX idx_purchase_orders_flow_branch_day ON public.purchase_orders USING btree (flow_id, branch_id, order_date);
CREATE UNIQUE INDEX purchase_orders_order_no_key ON public.purchase_orders USING btree (order_no);
CREATE INDEX idx_purchase_receipt_lines_order ON public.purchase_receipt_lines USING btree (order_id, stock_item_id);
CREATE INDEX idx_purchase_receipt_lines_receipt ON public.purchase_receipt_lines USING btree (receipt_id, order_line_id);
CREATE INDEX idx_purchase_receipts_branch_date ON public.purchase_receipts USING btree (branch_id, delivered_on DESC);
CREATE INDEX idx_purchase_receipts_order ON public.purchase_receipts USING btree (order_id, delivered_on DESC);
CREATE UNIQUE INDEX purchase_receipts_receipt_no_key ON public.purchase_receipts USING btree (receipt_no);
CREATE INDEX idx_sale_categories_deleted ON public.sale_categories USING btree (deleted_at);
CREATE INDEX idx_sale_categories_parent ON public.sale_categories USING btree (parent_id);
CREATE INDEX idx_sale_items_deleted_at ON public.sale_items USING btree (deleted_at);
CREATE INDEX idx_sale_items_name ON public.sale_items USING btree (name);
CREATE INDEX idx_sale_items_sku ON public.sale_items USING btree (sku);
CREATE INDEX idx_sale_lines_branch_id ON public.sale_lines USING btree (branch_id);
CREATE INDEX idx_sale_lines_branch_name_sale_datetime ON public.sale_lines USING btree (branch_name, sale_datetime DESC);
CREATE INDEX idx_sale_lines_product_id ON public.sale_lines USING btree (product_id);
CREATE INDEX idx_sale_lines_sale_datetime ON public.sale_lines USING btree (sale_datetime DESC);
CREATE INDEX idx_sale_lines_sale_id ON public.sale_lines USING btree (sale_id);
CREATE INDEX idx_sale_lines_sub_category_id ON public.sale_lines USING btree (sub_category_id);
CREATE INDEX idx_sale_lines_top_category_id ON public.sale_lines USING btree (top_category_id);
CREATE INDEX idx_sale_payments_method ON public.sale_payments USING btree (payment_method);
CREATE INDEX idx_sale_payments_payment_datetime ON public.sale_payments USING btree (payment_datetime DESC);
CREATE INDEX idx_sale_payments_sale_id ON public.sale_payments USING btree (sale_id);
CREATE UNIQUE INDEX sale_templates_name_key ON public.sale_templates USING btree (name);
CREATE INDEX idx_sales_branch_id ON public.sales USING btree (branch_id);
CREATE INDEX idx_sales_branch_name_status_datetime ON public.sales USING btree (branch_name, status, sale_datetime DESC);
CREATE INDEX idx_sales_customer_address_id ON public.sales USING btree (customer_address_id);
CREATE INDEX idx_sales_kds_branch ON public.sales USING btree (branch_id, kds_status, sale_datetime) WHERE (deleted_at IS NULL);
CREATE INDEX idx_sales_kds_status ON public.sales USING btree (kds_status) WHERE (deleted_at IS NULL);
CREATE INDEX idx_sales_kiosk_branch_date ON public.sales USING btree (branch_id, sale_datetime) WHERE ((source_channel_type = 'kiosk'::text) AND (deleted_at IS NULL));
CREATE INDEX idx_sales_legal_entity_id ON public.sales USING btree (legal_entity_id);
CREATE INDEX idx_sales_personnel_id ON public.sales USING btree (personnel_id);
CREATE INDEX idx_sales_personnel_name ON public.sales USING btree (personnel_name);
CREATE INDEX idx_sales_sale_datetime ON public.sales USING btree (sale_datetime DESC);
CREATE INDEX idx_sales_sales_channel_id ON public.sales USING btree (sales_channel_id);
CREATE INDEX idx_sales_status ON public.sales USING btree (status);
CREATE UNIQUE INDEX sales_local_id_key ON public.sales USING btree (local_id);
CREATE INDEX sales_forecasts_branch_idx ON public.sales_forecasts USING btree (branch_id);
CREATE INDEX sales_forecasts_date_idx ON public.sales_forecasts USING btree (forecast_date DESC);
CREATE UNIQUE INDEX sales_forecasts_forecast_date_branch_id_system_version_key ON public.sales_forecasts USING btree (forecast_date, branch_id, system_version);
CREATE INDEX semi_categories_deleted_at_idx ON public.semi_categories USING btree (deleted_at);
CREATE INDEX semi_categories_parent_id_idx ON public.semi_categories USING btree (parent_id);
CREATE INDEX semi_items_deleted_at_idx ON public.semi_items USING btree (deleted_at);
CREATE INDEX semi_items_sku_idx ON public.semi_items USING btree (sku);
CREATE UNIQUE INDEX stock_items_sku_unique_idx ON public.stock_items USING btree (sku) WHERE (sku IS NOT NULL);
CREATE UNIQUE INDEX stock_templates_name_key ON public.stock_templates USING btree (name);
CREATE UNIQUE INDEX tr_iller_ad_key ON public.tr_iller USING btree (ad);
CREATE UNIQUE INDEX tr_sokaklar_mahalle_ad_key ON public.tr_sokaklar USING btree (mahalle_id, ad);
CREATE INDEX tr_sokaklar_mahalle_idx ON public.tr_sokaklar USING btree (mahalle_id, ad);
CREATE UNIQUE INDEX units_name_key ON public.units USING btree (name);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------

ALTER TABLE public.branch_period_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_service_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cari_hareketler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.count_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movement_recalc_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_campaign_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_campaign_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_campaign_conflict_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_coupon_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_customer_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_customer_category_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_frequency_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_reward_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semi_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semi_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_tracking_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_tracking_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_ilceler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_iller ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_mahalleler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tr_sokaklar ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow all ON public.branch_period_locks AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow_all_branch_addresses ON public.branch_addresses AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_branch_service_coverage ON public.branch_service_coverage AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.cari_hareketler AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.count_flows AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_customer_addresses ON public.customer_addresses AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_customer_consent_events ON public.customer_consent_events AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_customer_devices ON public.customer_devices AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.daily_sales AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow_all ON public.expense_documents AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.inventory_movement_recalc_jobs AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.inventory_movements AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_campaign_redemptions ON public.loyalty_campaign_redemptions AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_campaign_rules ON public.loyalty_campaign_rules AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_campaigns ON public.loyalty_campaigns AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_campaign_conflict_groups ON public.loyalty_campaign_conflict_groups AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_card_transactions ON public.loyalty_card_transactions AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_cards ON public.loyalty_cards AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_coupon_series ON public.loyalty_coupon_series AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_coupons ON public.loyalty_coupons AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_customer_categories ON public.loyalty_customer_categories AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_customer_category_members ON public.loyalty_customer_category_members AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_frequency_progress ON public.loyalty_frequency_progress AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_programs ON public.loyalty_programs AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_reward_entitlements ON public.loyalty_reward_entitlements AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_tiers ON public.loyalty_tiers AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_transactions ON public.loyalty_transactions AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_loyalty_wallets ON public.loyalty_wallets AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.musteriler AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.order_flows AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.pos_sales AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.price_changes AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_pc ON public.price_changes AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.production_records AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow_all ON public.purchase_order_lines AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.purchase_orders AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.purchase_receipt_lines AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.purchase_receipts AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY sale_categories_all ON public.sale_categories AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY sale_items_all ON public.sale_items AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.sale_options AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow_all ON public.sales_channels AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_sc ON public.sales_channels AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.sales_forecasts AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow all ON public.semi_categories AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY Allow all ON public.semi_items AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow_all ON public.settings AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.time_tracking_defs AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_ttd ON public.time_tracking_defs AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.time_tracking_types AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_ttt ON public.time_tracking_types AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow all ON public.tr_ilceler AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow all ON public.tr_iller AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow all ON public.tr_mahalleler AS PERMISSIVE FOR ALL USING (true);
CREATE POLICY allow_all_tr_sokaklar ON public.tr_sokaklar AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- FUNCTIONS
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.armor(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$;

CREATE OR REPLACE FUNCTION public.armor(bytea, text[], text[])
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$;

CREATE OR REPLACE FUNCTION public.crypt(text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_crypt$function$;

CREATE OR REPLACE FUNCTION public.dearmor(text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_dearmor$function$;

CREATE OR REPLACE FUNCTION public.decrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt$function$;

CREATE OR REPLACE FUNCTION public.decrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt_iv$function$;

CREATE OR REPLACE FUNCTION public.digest(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$;

CREATE OR REPLACE FUNCTION public.digest(text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$;

CREATE OR REPLACE FUNCTION public.encrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt$function$;

CREATE OR REPLACE FUNCTION public.encrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt_iv$function$;

CREATE OR REPLACE FUNCTION public.fips_mode()
 RETURNS boolean
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_check_fipsmode$function$;

CREATE OR REPLACE FUNCTION public.gen_random_bytes(integer)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_random_bytes$function$;

CREATE OR REPLACE FUNCTION public.gen_random_uuid()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/pgcrypto', $function$pg_random_uuid$function$;

CREATE OR REPLACE FUNCTION public.gen_salt(text)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt$function$;

CREATE OR REPLACE FUNCTION public.gen_salt(text, integer)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt_rounds$function$;

CREATE OR REPLACE FUNCTION public.get_demo_sales_movement_status_by_branch_day(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(branch_id uuid, branch_name text, sale_day date, sale_count bigint, movement_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select
    s.branch_id,
    s.branch_name,
    date(timezone('Europe/Istanbul', s.sale_datetime)) as sale_day,
    count(distinct s.id) as sale_count,
    count(m.id) as movement_count
  from sales s
  left join inventory_movements m
    on m.sale_id = s.id
   and m.source_doc_type = 'sale'
   and m.deleted_at is null
   and m.is_cancelled = false
  where s.integration_ref = 'demo-sales-tool'
    and s.sale_datetime >= p_start
    and s.sale_datetime <= p_end
  group by
    s.branch_id,
    s.branch_name,
    date(timezone('Europe/Istanbul', s.sale_datetime))
  order by sale_day, branch_name;
$function$;

CREATE OR REPLACE FUNCTION public.get_inventory_movements_window(p_branch_uuid uuid DEFAULT NULL::uuid, p_branch_name text DEFAULT NULL::text, p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_item_type text DEFAULT NULL::text, p_movement_type text DEFAULT NULL::text, p_source_doc_type text DEFAULT NULL::text, p_limit integer DEFAULT 401, p_branch_key text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, movement_at timestamp with time zone, ledger_seq bigint, branch_id uuid, branch_name text, item_name text, item_sku text, item_type text, movement_type text, direction text, source_doc_type text, source_doc_no text, source_doc_ref text, quantity_signed numeric, total_cost_signed numeric, unit_cost numeric, balance_qty_after numeric, avg_unit_cost_after numeric, sales_channel_name text, portion_name text, notes text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 401), 1000));
  v_branch_name text := nullif(btrim(p_branch_name), '');
begin
  if p_branch_uuid is null and nullif(btrim(p_branch_key), '') is not null then
    with recursive branch_nodes(node) as (
      select jsonb_array_elements(value::jsonb)
      from public.settings
      where key = 'company_tree'

      union all

      select child
      from branch_nodes parent
      cross join lateral jsonb_array_elements(coalesce(parent.node->'children', '[]'::jsonb)) child
    )
    select nullif(btrim(node->>'name'), '')
    into v_branch_name
    from branch_nodes
    where node->>'type' = 'sube'
      and node->>'id' = btrim(p_branch_key)
    limit 1;
  end if;

  if v_branch_name is null then
    v_branch_name := nullif(btrim(p_branch_name), '');
  end if;

  if p_branch_uuid is not null then
    return query
    select
      m.id,
      m.movement_at,
      m.ledger_seq,
      m.branch_id,
      m.branch_name,
      m.item_name,
      m.item_sku,
      m.item_type,
      m.movement_type,
      m.direction,
      m.source_doc_type,
      m.source_doc_no,
      m.source_doc_ref,
      m.quantity_signed,
      m.total_cost_signed,
      m.unit_cost,
      m.balance_qty_after,
      m.avg_unit_cost_after,
      m.sales_channel_name,
      m.portion_name,
      m.notes
    from public.inventory_movements m
    where m.deleted_at is null
      and m.is_cancelled = false
      and m.branch_id = p_branch_uuid
      and (p_date_from is null or m.movement_at >= p_date_from)
      and (p_date_to is null or m.movement_at <= p_date_to)
      and (coalesce(p_item_type, '') = '' or m.item_type = p_item_type)
      and (coalesce(p_movement_type, '') = '' or m.movement_type = p_movement_type)
      and (coalesce(p_source_doc_type, '') = '' or m.source_doc_type = p_source_doc_type)
    order by m.movement_at desc, m.ledger_seq desc
    limit v_limit;
    return;
  end if;

  if v_branch_name is not null then
    return query
    select
      m.id,
      m.movement_at,
      m.ledger_seq,
      m.branch_id,
      m.branch_name,
      m.item_name,
      m.item_sku,
      m.item_type,
      m.movement_type,
      m.direction,
      m.source_doc_type,
      m.source_doc_no,
      m.source_doc_ref,
      m.quantity_signed,
      m.total_cost_signed,
      m.unit_cost,
      m.balance_qty_after,
      m.avg_unit_cost_after,
      m.sales_channel_name,
      m.portion_name,
      m.notes
    from public.inventory_movements m
    where m.deleted_at is null
      and m.is_cancelled = false
      and m.branch_name = v_branch_name
      and (p_date_from is null or m.movement_at >= p_date_from)
      and (p_date_to is null or m.movement_at <= p_date_to)
      and (coalesce(p_item_type, '') = '' or m.item_type = p_item_type)
      and (coalesce(p_movement_type, '') = '' or m.movement_type = p_movement_type)
      and (coalesce(p_source_doc_type, '') = '' or m.source_doc_type = p_source_doc_type)
    order by m.movement_at desc, m.ledger_seq desc
    limit v_limit;
    return;
  end if;

  return query
  select
    m.id,
    m.movement_at,
    m.ledger_seq,
    m.branch_id,
    m.branch_name,
    m.item_name,
    m.item_sku,
    m.item_type,
    m.movement_type,
    m.direction,
    m.source_doc_type,
    m.source_doc_no,
    m.source_doc_ref,
    m.quantity_signed,
    m.total_cost_signed,
    m.unit_cost,
    m.balance_qty_after,
    m.avg_unit_cost_after,
    m.sales_channel_name,
    m.portion_name,
    m.notes
  from public.inventory_movements m
  where m.deleted_at is null
    and m.is_cancelled = false
    and (p_date_from is null or m.movement_at >= p_date_from)
    and (p_date_to is null or m.movement_at <= p_date_to)
    and (coalesce(p_item_type, '') = '' or m.item_type = p_item_type)
    and (coalesce(p_movement_type, '') = '' or m.movement_type = p_movement_type)
    and (coalesce(p_source_doc_type, '') = '' or m.source_doc_type = p_source_doc_type)
  order by m.movement_at desc, m.ledger_seq desc
  limit v_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_presence_by_branch_day(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(branch_id uuid, branch_name text, sale_day date)
 LANGUAGE sql
 STABLE
AS $function$
  select
    s.branch_id,
    s.branch_name,
    date(timezone('Europe/Istanbul', s.sale_datetime)) as sale_day
  from sales s
  where s.sale_datetime >= p_start
    and s.sale_datetime <= p_end
  group by
    s.branch_id,
    s.branch_name,
    date(timezone('Europe/Istanbul', s.sale_datetime))
  order by sale_day, branch_name;
$function$;

CREATE OR REPLACE FUNCTION public.hmac(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$;

CREATE OR REPLACE FUNCTION public.hmac(text, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$;

CREATE OR REPLACE FUNCTION public.inventory_movements_queue_recalc_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null and new.is_cancelled = false then
      perform queue_inventory_recalc_job(
        new.item_type,
        new.stock_item_id,
        new.semi_item_id,
        new.branch_id,
        new.movement_at,
        'movement_insert',
        new.id
      );
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if
      old.item_type is distinct from new.item_type
      or old.stock_item_id is distinct from new.stock_item_id
      or old.semi_item_id is distinct from new.semi_item_id
      or old.branch_id is distinct from new.branch_id
      or old.movement_at is distinct from new.movement_at
      or old.quantity is distinct from new.quantity
      or old.unit_cost is distinct from new.unit_cost
      or old.total_cost is distinct from new.total_cost
      or old.deleted_at is distinct from new.deleted_at
      or old.is_cancelled is distinct from new.is_cancelled
    then
      perform queue_inventory_recalc_job(
        old.item_type,
        old.stock_item_id,
        old.semi_item_id,
        old.branch_id,
        old.movement_at,
        'movement_update_old',
        old.id
      );

      perform queue_inventory_recalc_job(
        new.item_type,
        new.stock_item_id,
        new.semi_item_id,
        new.branch_id,
        new.movement_at,
        'movement_update_new',
        new.id
      );
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform queue_inventory_recalc_job(
      old.item_type,
      old.stock_item_id,
      old.semi_item_id,
      old.branch_id,
      old.movement_at,
      'movement_delete',
      old.id
    );
    return old;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pgp_armor_headers(text, OUT key text, OUT value text)
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_armor_headers$function$;

CREATE OR REPLACE FUNCTION public.pgp_key_id(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_key_id_w$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt(bytea, bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_decrypt_bytea(bytea, bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt(text, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt(text, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_pub_encrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt(bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt(bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_decrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt(text, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt(text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.pgp_sym_encrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$;

CREATE OR REPLACE FUNCTION public.process_inventory_recalc_jobs(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_job record;
  v_processed integer := 0;
begin
  loop
    exit when v_processed >= greatest(coalesce(p_limit, 0), 0);

    select *
      into v_job
    from inventory_movement_recalc_jobs
    where status = 'pending'
    order by recalc_from asc, created_at asc
    limit 1
    for update skip locked;

    exit when not found;

    update inventory_movement_recalc_jobs
       set status = 'running',
           started_at = now(),
           attempts = attempts + 1
     where id = v_job.id;

    begin
      perform recalculate_inventory_item_costs(
        v_job.item_type,
        v_job.stock_item_id,
        v_job.semi_item_id,
        v_job.branch_id,
        v_job.recalc_from
      );

      update inventory_movement_recalc_jobs
         set status = 'done',
             finished_at = now(),
             last_error = null
       where id = v_job.id;
    exception
      when others then
      update inventory_movement_recalc_jobs
         set status = 'error',
             finished_at = now(),
             last_error = sqlerrm
         where id = v_job.id;
    end;

    v_processed := v_processed + 1;
  end loop;

  return v_processed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.queue_inventory_recalc_job(p_item_type text, p_stock_item_id uuid, p_semi_item_id uuid, p_branch_id uuid, p_recalc_from timestamp with time zone, p_reason text, p_source_movement_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_job_id uuid;
begin
  if p_recalc_from is null then
    return;
  end if;

  select id
    into v_job_id
  from inventory_movement_recalc_jobs
  where item_type = p_item_type
    and stock_item_id is not distinct from p_stock_item_id
    and semi_item_id is not distinct from p_semi_item_id
    and branch_id is not distinct from p_branch_id
    and status in ('pending', 'running')
  order by created_at
  limit 1
  for update;

  if v_job_id is null then
    insert into inventory_movement_recalc_jobs (
      item_type,
      stock_item_id,
      semi_item_id,
      branch_id,
      recalc_from,
      reason,
      source_movement_id,
      status
    ) values (
      p_item_type,
      p_stock_item_id,
      p_semi_item_id,
      p_branch_id,
      p_recalc_from,
      p_reason,
      p_source_movement_id,
      'pending'
    );
  else
    update inventory_movement_recalc_jobs
       set recalc_from = least(recalc_from, p_recalc_from),
           reason = p_reason,
           source_movement_id = coalesce(source_movement_id, p_source_movement_id),
           status = 'pending',
           started_at = null,
           finished_at = null
     where id = v_job_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_inventory_item_costs(p_item_type text, p_stock_item_id uuid DEFAULT NULL::uuid, p_semi_item_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid, p_recalc_from timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  v_prev_qty numeric(18,6) := 0;
  v_prev_total_cost numeric(18,6) := 0;
  v_prev_avg_cost numeric(18,6) := 0;
  v_new_qty numeric(18,6);
  v_new_total_cost numeric(18,6);
  v_new_avg_cost numeric(18,6);
  v_new_unit_cost numeric(18,6);
  v_new_line_total numeric(18,6);
  v_updated_count integer := 0;
  v_seed record;
  v_row record;
  v_dep record;
begin
  select
    balance_qty_after,
    balance_total_cost_after,
    avg_unit_cost_after
  into v_seed
  from inventory_movements
  where item_type = p_item_type
    and stock_item_id is not distinct from p_stock_item_id
    and semi_item_id is not distinct from p_semi_item_id
    and branch_id is not distinct from p_branch_id
    and deleted_at is null
    and is_cancelled = false
    and (p_recalc_from is null or movement_at < p_recalc_from)
  order by movement_at desc, ledger_seq desc
  limit 1;

  if found then
    v_prev_qty := coalesce(v_seed.balance_qty_after, 0);
    v_prev_total_cost := coalesce(v_seed.balance_total_cost_after, 0);
    v_prev_avg_cost := coalesce(v_seed.avg_unit_cost_after, 0);
  end if;

  for v_row in
    select *
    from inventory_movements
    where item_type = p_item_type
      and stock_item_id is not distinct from p_stock_item_id
      and semi_item_id is not distinct from p_semi_item_id
      and branch_id is not distinct from p_branch_id
      and deleted_at is null
      and is_cancelled = false
      and (p_recalc_from is null or movement_at >= p_recalc_from)
    order by movement_at asc, ledger_seq asc
  loop
    if v_row.direction = 'out' then
      v_new_unit_cost := case
        when coalesce(v_prev_avg_cost, 0) <> 0 then v_prev_avg_cost
        else coalesce(v_row.unit_cost, 0)
      end;
      v_new_line_total := v_new_unit_cost * v_row.quantity;
    else
      if v_row.movement_type = 'production_output' and v_row.production_record_id is not null then
        select coalesce(sum(total_cost), v_row.total_cost)
          into v_new_line_total
        from inventory_movements
        where production_record_id = v_row.production_record_id
          and movement_type = 'production_consumption'
          and deleted_at is null
          and is_cancelled = false;

        v_new_unit_cost := case
          when v_row.quantity > 0 then v_new_line_total / v_row.quantity
          else coalesce(v_row.unit_cost, 0)
        end;
      elsif v_row.movement_type = 'transfer_in' and v_row.transfer_pair_id is not null then
        select coalesce(abs(total_cost), v_row.total_cost)
          into v_new_line_total
        from inventory_movements
        where transfer_pair_id = v_row.transfer_pair_id
          and movement_type = 'transfer_out'
          and deleted_at is null
          and is_cancelled = false
        order by movement_at desc, ledger_seq desc
        limit 1;

        v_new_unit_cost := case
          when v_row.quantity > 0 then v_new_line_total / v_row.quantity
          else coalesce(v_row.unit_cost, 0)
        end;
      else
        v_new_unit_cost := coalesce(v_row.unit_cost, 0);
        v_new_line_total := coalesce(v_row.total_cost, v_new_unit_cost * v_row.quantity);
      end if;
    end if;

    v_new_qty := v_prev_qty + case when v_row.direction = 'in' then v_row.quantity else v_row.quantity * -1 end;
    v_new_total_cost := v_prev_total_cost + case when v_row.direction = 'in' then v_new_line_total else v_new_line_total * -1 end;

    if v_new_qty <> 0 then
      v_new_avg_cost := v_new_total_cost / v_new_qty;
    elsif v_row.direction = 'in' then
      v_new_avg_cost := v_new_unit_cost;
    else
      v_new_avg_cost := v_prev_avg_cost;
    end if;

    update inventory_movements
       set unit_cost = v_new_unit_cost,
           total_cost = v_new_line_total,
           avg_unit_cost_after = v_new_avg_cost,
           balance_qty_after = v_new_qty,
           balance_total_cost_after = v_new_total_cost,
           calc_status = 'calculated',
           calc_version = calc_version + 1,
           recalc_required_from = null,
           updated_at = now()
     where id = v_row.id;

    v_prev_qty := v_new_qty;
    v_prev_total_cost := v_new_total_cost;
    v_prev_avg_cost := v_new_avg_cost;
    v_updated_count := v_updated_count + 1;
  end loop;

  for v_dep in
    select distinct
      dep.item_type,
      dep.stock_item_id,
      dep.semi_item_id,
      dep.branch_id,
      dep.movement_at
    from inventory_movements src
    join inventory_movements dep
      on dep.production_record_id = src.production_record_id
     and dep.movement_type = 'production_output'
     and dep.deleted_at is null
     and dep.is_cancelled = false
    where src.item_type = p_item_type
      and src.stock_item_id is not distinct from p_stock_item_id
      and src.semi_item_id is not distinct from p_semi_item_id
      and src.branch_id is not distinct from p_branch_id
      and src.movement_type = 'production_consumption'
      and src.production_record_id is not null
      and src.deleted_at is null
      and src.is_cancelled = false
      and (p_recalc_from is null or src.movement_at >= p_recalc_from)
  loop
    perform queue_inventory_recalc_job(
      v_dep.item_type,
      v_dep.stock_item_id,
      v_dep.semi_item_id,
      v_dep.branch_id,
      v_dep.movement_at,
      'dependent_production_output',
      null
    );
  end loop;

  for v_dep in
    select distinct
      dep.item_type,
      dep.stock_item_id,
      dep.semi_item_id,
      dep.branch_id,
      dep.movement_at
    from inventory_movements src
    join inventory_movements dep
      on dep.transfer_pair_id = src.transfer_pair_id
     and dep.movement_type = 'transfer_in'
     and dep.deleted_at is null
     and dep.is_cancelled = false
    where src.item_type = p_item_type
      and src.stock_item_id is not distinct from p_stock_item_id
      and src.semi_item_id is not distinct from p_semi_item_id
      and src.branch_id is not distinct from p_branch_id
      and src.movement_type = 'transfer_out'
      and src.transfer_pair_id is not null
      and src.deleted_at is null
      and src.is_cancelled = false
      and (p_recalc_from is null or src.movement_at >= p_recalc_from)
  loop
    perform queue_inventory_recalc_job(
      v_dep.item_type,
      v_dep.stock_item_id,
      v_dep.semi_item_id,
      v_dep.branch_id,
      v_dep.movement_at,
      'dependent_transfer_in',
      null
    );
  end loop;

  return v_updated_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end; $function$;

CREATE OR REPLACE FUNCTION public.touch_branch_shift_presets_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_branch_shift_schedule_days_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_branch_shift_schedule_entries_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$;

CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$;

CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$;

CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$;

CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$;

CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$;

CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$;

CREATE OR REPLACE FUNCTION public.get_customer_period_stats(
  p_customer_id uuid,
  p_period text,
  p_period_days integer DEFAULT 30,
  p_product_masks jsonb DEFAULT '[]'::jsonb,
  p_exclude_free_items boolean DEFAULT false,
  p_allow_same_item_repeat boolean DEFAULT true,
  p_current_product_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  total_amount numeric,
  order_count bigint,
  product_quantity numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
BEGIN
  -- Determine the start date of the period
  IF p_period = 'day' THEN
    v_start_date := date_trunc('day', now());
  ELSIF p_period = 'week' THEN
    v_start_date := date_trunc('week', now());
  ELSIF p_period = 'month' OR p_period = 'current_month_start' THEN
    v_start_date := date_trunc('month', now());
  ELSIF p_period = 'quarter' THEN
    v_start_date := date_trunc('quarter', now());
  ELSIF p_period = 'year' THEN
    v_start_date := date_trunc('year', now());
  ELSIF p_period = 'rolling_days' THEN
    v_start_date := now() - (coalesce(p_period_days, 30) || ' days')::interval;
  ELSE
    v_start_date := NULL; -- 'all_time' or default fallback
  END IF;

  -- Optimize: If no product masks are provided, run faster header-only queries
  IF p_product_masks IS NULL OR jsonb_array_length(p_product_masks) = 0 THEN
    RETURN QUERY
    SELECT
      coalesce(sum(s.net_total_after_discount), 0)::numeric AS total_amount,
      count(s.id)::bigint AS order_count,
      coalesce(
        CASE 
          WHEN p_allow_same_item_repeat THEN (
            SELECT sum(l.qty)
            FROM sale_lines l
            WHERE l.sale_id IN (
              SELECT s2.id FROM sales s2
              WHERE s2.customer_id = p_customer_id
                AND s2.status = 'completed'
                AND s2.deleted_at IS NULL
                AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
            )
            AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
          )
          ELSE (
            SELECT count(distinct unioned.product_id)
            FROM (
              SELECT l.product_id
              FROM sale_lines l
              WHERE l.sale_id IN (
                SELECT s2.id FROM sales s2
                WHERE s2.customer_id = p_customer_id
                  AND s2.status = 'completed'
                  AND s2.deleted_at IS NULL
                  AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
              )
              AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
              UNION
              SELECT unnest(p_current_product_ids) AS product_id
            ) unioned
          )
        END,
        0
      )::numeric AS product_quantity
    FROM sales s
    WHERE s.customer_id = p_customer_id
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date);
  ELSE
    RETURN QUERY
    SELECT
      coalesce(sum(l.line_gross_after_discount), 0)::numeric AS total_amount,
      count(distinct s.id)::bigint AS order_count,
      coalesce(
        CASE 
          WHEN p_allow_same_item_repeat THEN sum(l.qty)
          ELSE (
            SELECT count(distinct unioned.product_id)
            FROM (
              SELECT l2.product_id
              FROM sales s2
              JOIN sale_lines l2 ON l2.sale_id = s2.id
              WHERE s2.customer_id = p_customer_id
                AND s2.status = 'completed'
                AND s2.deleted_at IS NULL
                AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                AND (NOT p_exclude_free_items OR l2.line_gross_after_discount > 0)
                AND EXISTS (
                  SELECT 1
                  FROM jsonb_to_recordset(p_product_masks) AS x2("itemId" text, "type" text)
                  WHERE (
                    x2.type = 'product' AND l2.product_id::text = x2."itemId"
                  ) OR (
                    x2.type = 'category' AND (l2.top_category_id::text = x2."itemId" OR l2.sub_category_id::text = x2."itemId")
                  ) OR (
                    x2.type = 'sale_template' AND EXISTS (
                      SELECT 1 FROM sale_templates st
                      WHERE st.id::text = x2."itemId"
                        AND st.sale_ids ? l2.product_id::text
                    )
                  )
                )
              UNION
              SELECT unnest(p_current_product_ids) AS product_id
            ) unioned
          )
        END,
        0
      )::numeric AS product_quantity
    FROM sales s
    JOIN sale_lines l ON l.sale_id = s.id
    WHERE s.customer_id = p_customer_id
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date)
      AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
      AND EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(p_product_masks) AS x("itemId" text, "type" text)
        WHERE (
          x.type = 'product' AND l.product_id::text = x."itemId"
        ) OR (
          x.type = 'category' AND (l.top_category_id::text = x."itemId" OR l.sub_category_id::text = x."itemId")
        ) OR (
          x.type = 'sale_template' AND EXISTS (
            SELECT 1 FROM sale_templates st
            WHERE st.id::text = x."itemId"
              AND st.sale_ids ? l.product_id::text
          )
        )
      );
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------

CREATE TRIGGER trg_branch_shift_presets_updated_at
  BEFORE UPDATE ON public.branch_shift_presets
  FOR EACH ROW
  EXECUTE FUNCTION touch_branch_shift_presets_updated_at();

CREATE TRIGGER trg_branch_shift_schedule_days_updated_at
  BEFORE UPDATE ON public.branch_shift_schedule_days
  FOR EACH ROW
  EXECUTE FUNCTION touch_branch_shift_schedule_days_updated_at();

CREATE TRIGGER trg_branch_shift_schedule_entries_updated_at
  BEFORE UPDATE ON public.branch_shift_schedule_entries
  FOR EACH ROW
  EXECUTE FUNCTION touch_branch_shift_schedule_entries_updated_at();

CREATE TRIGGER trg_inventory_movements_queue_recalc
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION inventory_movements_queue_recalc_trigger();

CREATE TRIGGER order_flows_updated_at
  BEFORE UPDATE ON public.order_flows
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- TASK DOMAIN
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_node_id uuid,
  branch_node_id uuid,
  created_by_personnel_id text NOT NULL,
  created_by_position_id text,
  title text NOT NULL,
  description text,
  status text DEFAULT 'open'::text NOT NULL,
  priority text DEFAULT 'normal'::text,
  due_at timestamp with time zone,
  start_at timestamp with time zone,
  has_specific_time boolean DEFAULT false NOT NULL,
  timezone text DEFAULT 'Europe/Istanbul'::text NOT NULL,
  is_recurring boolean DEFAULT false NOT NULL,
  recurrence_rule_id uuid,
  delegation_allowed boolean DEFAULT false NOT NULL,
  approval_required boolean DEFAULT false NOT NULL,
  closure_summary_required boolean DEFAULT false NOT NULL,
  closure_file_required boolean DEFAULT false NOT NULL,
  closure_image_required boolean DEFAULT false NOT NULL,
  edit_due_date_allowed boolean DEFAULT false NOT NULL,
  edit_schedule_allowed boolean DEFAULT false NOT NULL,
  incomplete_if_late boolean DEFAULT false NOT NULL,
  closure_summary text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
  CONSTRAINT tasks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'in_progress'::text, 'pending_approval'::text, 'pending_completion_approval'::text, 'completed'::text, 'rejected'::text, 'overdue'::text, 'cancelled'::text, 'soft_deleted'::text, 'not_completed'::text])))
);

CREATE TABLE IF NOT EXISTS public.task_recurrence_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  frequency text NOT NULL,
  interval_value integer DEFAULT 1 NOT NULL,
  weekdays text[],
  month_day integer,
  month_nth integer,
  month_weekday text,
  specific_dates text[],
  time_of_day time without time zone,
  ends_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_recurrence_rules_pkey PRIMARY KEY (id),
  CONSTRAINT task_recurrence_rules_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'yearly'::text, 'interval'::text])))
);

ALTER TABLE ONLY public.tasks
  DROP CONSTRAINT IF EXISTS tasks_recurrence_rule_id_fkey;
ALTER TABLE ONLY public.tasks
  ADD CONSTRAINT tasks_recurrence_rule_id_fkey FOREIGN KEY (recurrence_rule_id) REFERENCES public.task_recurrence_rules(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.task_participants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  participant_type text NOT NULL,
  personnel_id text NOT NULL,
  position_id text,
  node_id uuid,
  is_delegate boolean DEFAULT false NOT NULL,
  delegated_from text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_participants_pkey PRIMARY KEY (id),
  CONSTRAINT task_participants_type_check CHECK ((participant_type = ANY (ARRAY['assignee'::text, 'watcher'::text]))),
  CONSTRAINT task_participants_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  text text NOT NULL,
  is_done boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_checklist_items_pkey PRIMARY KEY (id),
  CONSTRAINT task_checklist_items_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  attachment_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_size integer,
  mime_type text,
  uploaded_by text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT task_attachments_type_check CHECK ((attachment_type = ANY (ARRAY['file'::text, 'image'::text, 'closure_file'::text, 'closure_image'::text, 'chat'::text]))),
  CONSTRAINT task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_approval_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  request_type text NOT NULL,
  from_personnel text NOT NULL,
  to_personnel text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  reason text,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_approval_requests_pkey PRIMARY KEY (id),
  CONSTRAINT task_approval_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text]))),
  CONSTRAINT task_approval_requests_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_approval_requests_type_check CHECK ((request_type = ANY (ARRAY['assignment'::text, 'upward_assignment'::text, 'closure_approval'::text, 'delegation'::text, 'rejection'::text])))
);

CREATE TABLE IF NOT EXISTS public.task_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  action text NOT NULL,
  performed_by text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_history_pkey PRIMARY KEY (id),
  CONSTRAINT task_history_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_chat_threads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  task_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_chat_threads_pkey PRIMARY KEY (id),
  CONSTRAINT task_chat_threads_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE,
  CONSTRAINT task_chat_threads_task_id_key UNIQUE (task_id)
);

CREATE TABLE IF NOT EXISTS public.task_chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  thread_id uuid NOT NULL,
  task_id uuid NOT NULL,
  message_type text DEFAULT 'user'::text NOT NULL,
  sender_id text,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT task_chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT task_chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.task_chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT task_chat_messages_type_check CHECK ((message_type = ANY (ARRAY['user'::text, 'system'::text])))
);

CREATE INDEX IF NOT EXISTS idx_tasks_created_by_personnel_id ON public.tasks USING btree (created_by_personnel_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks USING btree (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks USING btree (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks USING btree (deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_participants_task_type ON public.task_participants USING btree (task_id, participant_type);
CREATE INDEX IF NOT EXISTS idx_task_participants_personnel_id ON public.task_participants USING btree (personnel_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id ON public.task_checklist_items USING btree (task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON public.task_history USING btree (task_id);
CREATE INDEX IF NOT EXISTS idx_task_chat_messages_thread_id ON public.task_chat_messages USING btree (thread_id);
CREATE INDEX IF NOT EXISTS idx_task_approval_requests_task_status ON public.task_approval_requests USING btree (task_id, status);

CREATE TABLE IF NOT EXISTS public.pos_table_halls (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pos_table_halls_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pos_table_sections (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  hall_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pos_table_sections_pkey PRIMARY KEY (id),
  CONSTRAINT pos_table_sections_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES public.pos_table_halls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.pos_tables (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  hall_id UUID NOT NULL,
  section_id UUID NOT NULL,
  table_code TEXT,
  table_name TEXT NOT NULL,
  table_number TEXT NOT NULL,
  table_type TEXT DEFAULT 'round'::text NOT NULL,
  capacity INTEGER,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  qr_token TEXT NOT NULL,
  qr_payload_version INTEGER DEFAULT 1 NOT NULL,
  last_qr_generated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pos_tables_pkey PRIMARY KEY (id),
  CONSTRAINT pos_tables_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES public.pos_table_halls(id) ON DELETE CASCADE,
  CONSTRAINT pos_tables_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.pos_table_sections(id) ON DELETE CASCADE,
  CONSTRAINT pos_tables_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT pos_tables_table_type_check CHECK ((table_type = ANY (ARRAY['round'::text, 'square'::text])))
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_table_halls_branch_name_active_uidx
  ON public.pos_table_halls USING btree (branch_id, lower(name))
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_table_halls_branch_sort_idx
  ON public.pos_table_halls USING btree (branch_id, sort_order, name)
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS pos_table_sections_hall_name_active_uidx
  ON public.pos_table_sections USING btree (hall_id, lower(name))
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_table_sections_branch_hall_sort_idx
  ON public.pos_table_sections USING btree (branch_id, hall_id, sort_order, name)
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS pos_tables_branch_number_active_uidx
  ON public.pos_tables USING btree (branch_id, table_number)
  WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS pos_tables_branch_qr_token_active_uidx
  ON public.pos_tables USING btree (branch_id, qr_token)
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_tables_branch_sort_idx
  ON public.pos_tables USING btree (branch_id, sort_order, table_number)
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_tables_hall_idx
  ON public.pos_tables USING btree (hall_id);
CREATE INDEX IF NOT EXISTS pos_tables_section_idx
  ON public.pos_tables USING btree (section_id);

CREATE TABLE IF NOT EXISTS public.table_service_requests (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  table_id UUID NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  requested_phone TEXT,
  customer_id UUID,
  requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_staff_id TEXT,
  acknowledged_by_staff_name TEXT,
  resolved_at TIMESTAMPTZ,
  source TEXT DEFAULT 'qr_menu'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT table_service_requests_pkey PRIMARY KEY (id),
  CONSTRAINT table_service_requests_request_type_check CHECK ((request_type = ANY (ARRAY['call_waiter'::text, 'bill_request'::text, 'online_payment_interest'::text]))),
  CONSTRAINT table_service_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'acknowledged'::text, 'resolved'::text, 'cancelled'::text]))),
  CONSTRAINT table_service_requests_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.pos_tables(id) ON DELETE CASCADE,
  CONSTRAINT table_service_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.musteriler(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS table_service_requests_branch_status_idx
  ON public.table_service_requests USING btree (branch_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS table_service_requests_table_status_idx
  ON public.table_service_requests USING btree (table_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.table_feedback (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  table_id UUID NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  customer_phone TEXT,
  customer_id UUID,
  source TEXT DEFAULT 'qr_menu'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT table_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT table_feedback_rating_check CHECK ((rating >= 1 AND rating <= 5)),
  CONSTRAINT table_feedback_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.pos_tables(id) ON DELETE CASCADE,
  CONSTRAINT table_feedback_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.musteriler(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS table_feedback_branch_created_idx
  ON public.table_feedback USING btree (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS table_feedback_table_created_idx
  ON public.table_feedback USING btree (table_id, created_at DESC);

-- ============================================================
-- END OF SCHEMA
-- ============================================================
