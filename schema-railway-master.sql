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
  location_id UUID,
  lpn_id UUID,
  lot_number TEXT,
  expiration_date DATE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by UUID,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by_terminal UUID,
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
  is_b2b BOOLEAN DEFAULT false NOT NULL,
  tax_office TEXT,
  b2b_price_list JSONB DEFAULT '{}'::jsonb NOT NULL,
  CONSTRAINT musteriler_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.b2b_sales_orders (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  order_no TEXT NOT NULL,
  seller_branch_id UUID NOT NULL,
  seller_branch_name TEXT,
  seller_scope TEXT NOT NULL,
  customer_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_tax_no TEXT,
  customer_tax_office TEXT,
  order_date TIMESTAMPTZ DEFAULT now() NOT NULL,
  delivery_date DATE,
  status TEXT DEFAULT 'pending' NOT NULL,
  doc_kind TEXT DEFAULT 'İrsaliye',
  doc_no TEXT,
  plate_number TEXT,
  notes TEXT,
  subtotal NUMERIC(14,4) DEFAULT 0 NOT NULL,
  vat_total NUMERIC(14,4) DEFAULT 0 NOT NULL,
  total_amount NUMERIC(14,4) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT b2b_sales_orders_pkey PRIMARY KEY (id),
  CONSTRAINT b2b_sales_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.musteriler(id)
);

CREATE TABLE IF NOT EXISTS public.b2b_sales_order_lines (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  order_id UUID NOT NULL,
  line_no INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  stock_item_id UUID,
  semi_item_id UUID,
  item_name TEXT NOT NULL,
  item_sku TEXT,
  unit TEXT,
  unit_price NUMERIC(14,4) DEFAULT 0 NOT NULL,
  vat_rate NUMERIC(6,4) DEFAULT 0 NOT NULL,
  ordered_qty NUMERIC(14,4) NOT NULL,
  shipped_qty NUMERIC(14,4) DEFAULT 0 NOT NULL,
  line_total NUMERIC(14,4) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT b2b_sales_order_lines_pkey PRIMARY KEY (id),
  CONSTRAINT b2b_sales_order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.b2b_sales_orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.customer_app_config (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  config_key TEXT DEFAULT 'default'::text NOT NULL,
  branding JSONB DEFAULT '{
    "companyName": "",
    "logoUrl": "",
    "backgroundImageUrl": "",
    "primaryColor": "#be185d",
    "headerGradient": ["#111827", "#312e81", "#f97316"],
    "welcomeText": "Hos Geldiniz"
  }'::jsonb NOT NULL,
  home_buttons JSONB DEFAULT '[
    {
      "id": "btn1",
      "type": "order",
      "label": "Siparis Ver",
      "icon": "fa-utensils",
      "config": { "deliveryUrl": "", "enableTableOrder": true }
    },
    {
      "id": "btn2",
      "type": "app_page",
      "label": "Kampanyalar",
      "icon": "fa-bullhorn",
      "config": { "pageKey": "campaigns" }
    },
    {
      "id": "btn3",
      "type": "phone",
      "label": "Bizi Arayin",
      "icon": "fa-phone",
      "config": { "phoneNumber": "" }
    },
    {
      "id": "btn4",
      "type": "app_page",
      "label": "Geri Bildirim",
      "icon": "fa-comment-dots",
      "config": { "pageKey": "account" }
    }
  ]'::jsonb NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT customer_app_config_pkey PRIMARY KEY (id),
  CONSTRAINT customer_app_config_config_key_key UNIQUE (config_key)
);

INSERT INTO public.customer_app_config (config_key)
VALUES ('default')
ON CONFLICT (config_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.loyalty_referral_programs (
  id TEXT NOT NULL,
  name TEXT DEFAULT 'Yeni Referans Programi'::text NOT NULL,
  mode TEXT DEFAULT 'unique_multiple'::text NOT NULL,
  config_json JSONB DEFAULT '{}'::jsonb NOT NULL,
  allowed_referrer_categories JSONB DEFAULT '[]'::jsonb NOT NULL,
  success_criteria TEXT DEFAULT 'registration'::text NOT NULL,
  success_purchase_count INTEGER DEFAULT 1 NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  branch_id TEXT,
  scope TEXT DEFAULT 'global'::text NOT NULL,
  CONSTRAINT loyalty_referral_programs_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_referral_programs_mode_check CHECK (mode = ANY (ARRAY['unique_multiple'::text, 'single_reusable_date'::text, 'single_reusable_limit'::text])),
  CONSTRAINT loyalty_referral_programs_success_criteria_check CHECK (success_criteria = ANY (ARRAY['registration'::text, 'nth_purchase'::text]))
);

CREATE TABLE IF NOT EXISTS public.loyalty_referral_codes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  campaign_id TEXT NOT NULL,
  program_id TEXT,
  referrer_customer_id UUID NOT NULL,
  referral_code TEXT NOT NULL,
  referee_customer_id UUID,
  is_used BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  used_at TIMESTAMPTZ,
  CONSTRAINT loyalty_referral_codes_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_referral_codes_referral_code_key UNIQUE (referral_code),
  CONSTRAINT loyalty_referral_codes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES loyalty_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_referral_codes_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_referral_programs(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_referral_codes_referrer_customer_id_fkey FOREIGN KEY (referrer_customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_referral_codes_referee_customer_id_fkey FOREIGN KEY (referee_customer_id) REFERENCES musteriler(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.loyalty_referral_tracking (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  program_id TEXT NOT NULL,
  referrer_customer_id UUID NOT NULL,
  referee_customer_id UUID NOT NULL,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  success_at TIMESTAMPTZ,
  CONSTRAINT loyalty_referral_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT loyalty_referral_tracking_program_referee_key UNIQUE (program_id, referee_customer_id),
  CONSTRAINT loyalty_referral_tracking_status_check CHECK (status = ANY (ARRAY['pending'::text, 'successful'::text, 'expired'::text])),
  CONSTRAINT loyalty_referral_tracking_program_id_fkey FOREIGN KEY (program_id) REFERENCES loyalty_referral_programs(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_referral_tracking_referrer_customer_id_fkey FOREIGN KEY (referrer_customer_id) REFERENCES musteriler(id) ON DELETE CASCADE,
  CONSTRAINT loyalty_referral_tracking_referee_customer_id_fkey FOREIGN KEY (referee_customer_id) REFERENCES musteriler(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loyalty_referral_programs_active
  ON public.loyalty_referral_programs(active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_referral_codes_lookup
  ON public.loyalty_referral_codes(referral_code);
CREATE INDEX IF NOT EXISTS idx_loyalty_referral_codes_referrer
  ON public.loyalty_referral_codes(referrer_customer_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_referral_codes_program
  ON public.loyalty_referral_codes(program_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_referrer
  ON public.loyalty_referral_tracking(referrer_customer_id, program_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_referee
  ON public.loyalty_referral_tracking(referee_customer_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_status
  ON public.loyalty_referral_tracking(program_id, referrer_customer_id, status);
CREATE INDEX IF NOT EXISTS idx_musteriler_referral_code
  ON public.musteriler(referral_code);
CREATE INDEX IF NOT EXISTS idx_musteriler_referred_by
  ON public.musteriler(referred_by_customer_id);

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
  flow_channel TEXT DEFAULT 'external_purchase'::text,
  receiver_scope TEXT DEFAULT 'branch'::text NOT NULL,
  CONSTRAINT order_flows_pkey PRIMARY KEY (id),
  CONSTRAINT order_flows_flow_channel_check CHECK (flow_channel = ANY (ARRAY['external_purchase'::text, 'warehouse_replenishment'::text, 'kitchen_replenishment'::text])),
  CONSTRAINT order_flows_receiver_scope_check CHECK (receiver_scope = ANY (ARRAY['branch'::text, 'warehouse'::text, 'kitchen'::text]))
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

CREATE TABLE IF NOT EXISTS public.pos_terminals (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  terminal_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  activation_code TEXT NOT NULL,
  device_type TEXT DEFAULT 'pos',
  screen_mode TEXT DEFAULT 'pos'::text NOT NULL,
  is_master BOOLEAN DEFAULT false NOT NULL,
  terminal_role TEXT DEFAULT 'slave'::text NOT NULL,
  config_data JSONB DEFAULT '{}'::jsonb NOT NULL,
  terminal_name TEXT,
  last_seen_at TIMESTAMPTZ,
  app_version TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_used BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT pos_terminals_pkey PRIMARY KEY (id),
  CONSTRAINT pos_terminals_terminal_id_key UNIQUE (terminal_id),
  CONSTRAINT pos_terminals_activation_code_key UNIQUE (activation_code),
  CONSTRAINT pos_terminals_terminal_role_check CHECK (terminal_role = ANY (ARRAY['master'::text, 'slave'::text])),
  CONSTRAINT pos_terminals_screen_mode_check CHECK (screen_mode = ANY (ARRAY['pos'::text, 'garson'::text, 'pos-masa'::text, 'pos-masalar'::text, 'kds'::text, 'pickup'::text]))
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
  flow_channel TEXT DEFAULT 'external_purchase'::text,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_manager_approval_check CHECK (manager_approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text])),
  CONSTRAINT purchase_orders_source_check CHECK (order_source = ANY (ARRAY['flow'::text, 'manual'::text])),
  CONSTRAINT purchase_orders_status_check CHECK (status = ANY (ARRAY['draft'::text, 'pending_action'::text, 'awaiting_approval'::text, 'submitted'::text, 'partially_received'::text, 'received'::text, 'cancelled'::text])),
  CONSTRAINT purchase_orders_order_no_key UNIQUE (order_no),
  CONSTRAINT purchase_orders_flow_channel_check CHECK (flow_channel = ANY (ARRAY['external_purchase'::text, 'warehouse_replenishment'::text, 'kitchen_replenishment'::text]))
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
  image_url TEXT,
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
  fulfillment_type TEXT,
  promised_at TIMESTAMPTZ,
  kds_release_at TIMESTAMPTZ,
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
  created_by_terminal UUID,
  created_by_terminal_name TEXT,
  CONSTRAINT sales_pkey PRIMARY KEY (id),
  CONSTRAINT sales_discount_type_check CHECK (discount_type IS NULL OR (discount_type = ANY (ARRAY['percent'::text, 'amount'::text]))),
  CONSTRAINT sales_fulfillment_type_check CHECK (fulfillment_type IS NULL OR (fulfillment_type = ANY (ARRAY['delivery'::text, 'pickup'::text]))),
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
  image_url TEXT,
  temperature_class TEXT,
  is_central_warehouse_good BOOLEAN DEFAULT false NOT NULL,
  central_warehouses JSONB DEFAULT '[]'::jsonb NOT NULL,
  is_central_kitchen_good BOOLEAN DEFAULT false NOT NULL,
  central_kitchens JSONB DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT stock_items_pkey PRIMARY KEY (id),
  CONSTRAINT stock_items_cat_l1_fkey FOREIGN KEY (cat_l1) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l2_fkey FOREIGN KEY (cat_l2) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l3_fkey FOREIGN KEY (cat_l3) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l4_fkey FOREIGN KEY (cat_l4) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_cat_l5_fkey FOREIGN KEY (cat_l5) REFERENCES categories(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_supp_id_fkey FOREIGN KEY (supp_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  CONSTRAINT stock_items_temperature_class_check CHECK (temperature_class IN ('dry', 'cold', 'frozen'))
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
  supplier_kind TEXT DEFAULT 'external'::text,
  source_workspace_scope TEXT,
  source_branch_id UUID,
  is_system_generated BOOLEAN DEFAULT false,
  sync_key TEXT,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT suppliers_sync_key_key UNIQUE (sync_key),
  CONSTRAINT suppliers_supplier_kind_check CHECK (supplier_kind = ANY (ARRAY['external'::text, 'internal_warehouse'::text, 'internal_kitchen'::text]))
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

CREATE TABLE IF NOT EXISTS public.warehouse_locations (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  zone_code TEXT,
  aisle TEXT,
  rack TEXT,
  level TEXT,
  bin TEXT,
  temperature_class TEXT,
  usage_type TEXT DEFAULT 'RESERVE'::text,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_locations_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.warehouse_lpns (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  lpn_code TEXT NOT NULL,
  branch_id UUID NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_lpns_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_lpns_lpn_code_key UNIQUE (lpn_code)
);

CREATE TABLE IF NOT EXISTS public.product_external_barcodes (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  gtin_barcode TEXT NOT NULL,
  stock_item_id UUID NOT NULL,
  is_approved BOOLEAN DEFAULT false NOT NULL,
  created_by_terminal TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT product_external_barcodes_pkey PRIMARY KEY (id),
  CONSTRAINT product_external_barcodes_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.stock_item_warehouse_settings (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  stock_item_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  order_unit TEXT DEFAULT 'ana'::text,
  min_order NUMERIC(10,3),
  max_order NUMERIC(10,3),
  min_stock NUMERIC(10,3),
  safety_stock NUMERIC(10,3),
  transfer_price_adjustment_type TEXT DEFAULT 'none',
  transfer_price_adjustment_value NUMERIC(18,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT stock_item_warehouse_settings_pkey PRIMARY KEY (id),
  CONSTRAINT stock_item_warehouse_settings_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE,
  CONSTRAINT stock_item_warehouse_settings_unique_stock_branch UNIQUE (stock_item_id, branch_id)
);

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

CREATE TABLE IF NOT EXISTS public.kiosk_terminal_operating_rules (
  terminal_id UUID NOT NULL REFERENCES public.pos_terminals(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.kiosk_operating_hours_rules(id) ON DELETE CASCADE,
  PRIMARY KEY (terminal_id, rule_id)
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

CREATE INDEX idx_activity_logs_action_type_created_at ON public.activity_logs USING btree (action_type, created_at DESC);
CREATE INDEX idx_kiosk_operating_hours_rules_branch ON public.kiosk_operating_hours_rules USING btree (branch_id);
CREATE INDEX idx_kiosk_terminal_operating_rules_terminal ON public.kiosk_terminal_operating_rules USING btree (terminal_id);
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
CREATE INDEX idx_pos_terminals_branch ON public.pos_terminals USING btree (branch_id);
CREATE INDEX idx_pos_terminals_code ON public.pos_terminals USING btree (activation_code);
CREATE INDEX idx_sales_terminal ON public.sales USING btree (created_by_terminal) WHERE (created_by_terminal IS NOT NULL);
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

CREATE OR REPLACE FUNCTION public.get_sales_count_by_branch_day(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(branch_id uuid, branch_name text, sale_day date, sale_count bigint)
 LANGUAGE sql
 STABLE
AS $function$
  select
    s.branch_id,
    s.branch_name,
    date(timezone('Europe/Istanbul', s.sale_datetime)) as sale_day,
    count(s.id) as sale_count
  from sales s
  where s.sale_datetime >= p_start
    and s.sale_datetime <= p_end
  group by
    s.branch_id,
    s.branch_name,
    date(timezone('Europe/Istanbul', s.sale_datetime))
  order by sale_day, branch_name;
$function$;


CREATE OR REPLACE FUNCTION public.generate_terminal_activation_code(p_branch_id uuid)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
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

CREATE OR REPLACE FUNCTION public.normalize_sales_channel_key(channel_name text)
RETURNS text AS $$
DECLARE
  v_normalized text;
BEGIN
  v_normalized := lower(trim(channel_name));
  IF v_normalized IS NULL OR v_normalized = '' THEN
    RETURN 'pos';
  END IF;

  IF v_normalized IN ('call_center', 'call center', 'cagri_merkezi', 'cagri merkezi', 'cagri merkezi') THEN
    RETURN 'call_center';
  ELSIF v_normalized IN ('masa', 'garson', 'waiter', 'table_service', 'table') THEN
    RETURN 'masa';
  ELSIF v_normalized IN ('kiosk') THEN
    RETURN 'kiosk';
  ELSIF v_normalized IN ('mobile', 'mobil') THEN
    RETURN 'mobile';
  ELSIF v_normalized IN ('online', 'web') THEN
    RETURN 'online';
  ELSIF v_normalized IN ('hizli_satis', 'hizli satis', 'quick', 'quick_service', 'quick service', 'pos') THEN
    RETURN 'pos';
  ELSE
    RETURN v_normalized;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP FUNCTION IF EXISTS public.get_customer_period_stats(uuid, text, integer, jsonb, boolean, boolean, uuid[]);

CREATE OR REPLACE FUNCTION public.get_customer_period_stats(
  p_customer_id uuid,
  p_period text,
  p_period_days integer DEFAULT 30,
  p_product_masks jsonb DEFAULT '[]'::jsonb,
  p_exclude_free_items boolean DEFAULT false,
  p_allow_same_item_repeat boolean DEFAULT true,
  p_current_product_ids uuid[] DEFAULT '{}'::uuid[],
  p_sales_channel text DEFAULT NULL
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
              WHERE (p_customer_id IS NULL OR s2.customer_id = p_customer_id)
                AND s2.status = 'completed'
                AND s2.deleted_at IS NULL
                AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s2.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
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
                WHERE (p_customer_id IS NULL OR s2.customer_id = p_customer_id)
                  AND s2.status = 'completed'
                  AND s2.deleted_at IS NULL
                  AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                  AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s2.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
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
    WHERE (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date)
      AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel));
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
              WHERE (p_customer_id IS NULL OR s2.customer_id = p_customer_id)
                AND s2.status = 'completed'
                AND s2.deleted_at IS NULL
                AND (v_start_date IS NULL OR s2.sale_datetime >= v_start_date)
                AND (NOT p_exclude_free_items OR l2.line_gross_after_discount > 0)
                AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s2.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
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
    WHERE (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND s.status = 'completed'
      AND s.deleted_at IS NULL
      AND (v_start_date IS NULL OR s.sale_datetime >= v_start_date)
      AND (NOT p_exclude_free_items OR l.line_gross_after_discount > 0)
      AND (p_sales_channel IS NULL OR public.normalize_sales_channel_key(s.sales_channel_name) = public.normalize_sales_channel_key(p_sales_channel))
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

CREATE TRIGGER trg_kiosk_operating_hours_rules_updated_at
  BEFORE UPDATE ON public.kiosk_operating_hours_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

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
  form_template_id uuid,
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

ALTER TABLE ONLY public.tasks
  DROP CONSTRAINT IF EXISTS tasks_form_template_id_fkey;
ALTER TABLE ONLY public.tasks
  ADD CONSTRAINT tasks_form_template_id_fkey FOREIGN KEY (form_template_id) REFERENCES public.form_templates(id) ON DELETE SET NULL;

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
-- FEEDBACK & TICKET MODULE: table_feedback extensions
-- ============================================================

ALTER TABLE public.table_feedback
  ADD COLUMN IF NOT EXISTS order_id      UUID,
  ADD COLUMN IF NOT EXISTS item_ratings  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_info  JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS staff_id      TEXT,
  ADD COLUMN IF NOT EXISTS ticket_id     UUID,
  ADD COLUMN IF NOT EXISTS metadata      JSONB DEFAULT '{}'::jsonb;

-- ============================================================
-- TICKET CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id          UUID DEFAULT gen_random_uuid() NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  icon        TEXT DEFAULT 'fa-tag',
  color       TEXT DEFAULT '#64748b',
  sort_order  INTEGER DEFAULT 0 NOT NULL,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ticket_categories_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_categories_slug_key UNIQUE (slug)
);

-- ============================================================
-- SLA POLICIES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sla_policies (
  id                UUID DEFAULT gen_random_uuid() NOT NULL,
  name              TEXT NOT NULL,
  sla_level         TEXT NOT NULL,
  deadline_minutes  INTEGER NOT NULL,
  escalation_to     TEXT,
  auto_create_task  BOOLEAN DEFAULT true,
  active            BOOLEAN DEFAULT true,
  metadata          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT sla_policies_pkey PRIMARY KEY (id),
  CONSTRAINT sla_policies_level_unique UNIQUE (sla_level)
);

-- ============================================================
-- TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id                  UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id           TEXT,
  feedback_id         UUID,
  form_submission_id  UUID,
  task_id             UUID,
  origin_type         TEXT NOT NULL,
  category_id         UUID,
  priority            TEXT DEFAULT 'normal',
  status              TEXT DEFAULT 'open',
  assigned_to         TEXT,
  sla_level           TEXT DEFAULT 'standard_24h',
  sla_deadline_at     TIMESTAMPTZ,
  sla_breached        BOOLEAN DEFAULT false,
  resolution_note     TEXT,
  winback_coupon_id   TEXT,
  resolved_at         TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT tickets_pkey PRIMARY KEY (id),
  CONSTRAINT tickets_origin_check CHECK (origin_type = ANY (ARRAY['feedback','inspection','manual'])),
  CONSTRAINT tickets_status_check CHECK (status = ANY (ARRAY['open','assigned','in_progress','waiting','resolved','closed'])),
  CONSTRAINT tickets_priority_check CHECK (priority = ANY (ARRAY['low','normal','high','critical'])),
  CONSTRAINT tickets_feedback_fkey FOREIGN KEY (feedback_id) REFERENCES table_feedback(id) ON DELETE SET NULL,
  CONSTRAINT tickets_category_fkey FOREIGN KEY (category_id) REFERENCES ticket_categories(id) ON DELETE SET NULL,
  CONSTRAINT tickets_task_fkey FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline ON public.tickets (sla_deadline_at) WHERE sla_breached = false AND status NOT IN ('resolved','closed');
CREATE INDEX IF NOT EXISTS idx_tickets_branch ON public.tickets (branch_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets (status);

-- ============================================================
-- TICKET COMMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id          UUID DEFAULT gen_random_uuid() NOT NULL,
  ticket_id   UUID NOT NULL,
  author_id   TEXT NOT NULL,
  body        TEXT NOT NULL,
  visibility  TEXT DEFAULT 'internal',
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ticket_comments_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_comments_visibility_check CHECK (visibility = ANY (ARRAY['internal','external'])),
  CONSTRAINT ticket_comments_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON public.ticket_comments (ticket_id);

-- ============================================================
-- TICKET AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ticket_audit_log (
  id            UUID DEFAULT gen_random_uuid() NOT NULL,
  ticket_id     UUID NOT NULL,
  action        TEXT NOT NULL,
  performed_by  TEXT,
  old_value     TEXT,
  new_value     TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT ticket_audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT ticket_audit_log_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_log_ticket ON public.ticket_audit_log (ticket_id);

-- ============================================================
-- FORM TEMPLATES (Merkez-Only)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_templates (
  id                       UUID DEFAULT gen_random_uuid() NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,
  form_type                TEXT DEFAULT 'inspection',
  schema_json              JSONB NOT NULL,
  target_branches          JSONB DEFAULT '[]'::jsonb,
  allowed_contexts         JSONB DEFAULT '["center", "branch", "warehouse"]'::jsonb,
  scoring                  JSONB DEFAULT '{}'::jsonb,
  requires_cost_input      BOOLEAN DEFAULT false,
  linked_entity_table      TEXT DEFAULT NULL,
  recurrence               JSONB,
  min_completion_seconds   INTEGER,
  require_geo              BOOLEAN DEFAULT false,
  active                   BOOLEAN DEFAULT true,
  created_by               TEXT,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT form_templates_pkey PRIMARY KEY (id),
  CONSTRAINT form_templates_type_check CHECK (
    form_type = ANY (ARRAY['inspection','customer_survey','personnel_survey','checklist','notification_form'])
  )
);

-- ============================================================
-- FORM SUBMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_submissions (
  id                        UUID DEFAULT gen_random_uuid() NOT NULL,
  template_id               UUID NOT NULL,
  branch_id                 TEXT NOT NULL,
  submitted_by              TEXT NOT NULL,
  status                    TEXT DEFAULT 'draft',
  answers_json              JSONB NOT NULL,
  total_score               NUMERIC(8,2),
  max_possible_score        NUMERIC(8,2),
  score_percentage          NUMERIC(5,2),
  geo_latitude              NUMERIC(10,7),
  geo_longitude             NUMERIC(10,7),
  device_timestamp          TIMESTAMPTZ,
  completion_time_seconds   INTEGER,
  is_offline_submission     BOOLEAN DEFAULT false,
  synced_at                 TIMESTAMPTZ,
  linked_entity_id          UUID DEFAULT NULL,
  repair_cost               NUMERIC(12,2),
  repair_currency           VARCHAR(3),
  repair_exchange_rate      NUMERIC(12,4),
  metadata                  JSONB DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT form_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT form_submissions_status_check CHECK (
    status = ANY (ARRAY['draft','syncing','completed','anomaly'])
  ),
  CONSTRAINT form_submissions_template_fkey FOREIGN KEY (template_id) REFERENCES form_templates(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_branch ON public.form_submissions (branch_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_template ON public.form_submissions (template_id);

-- ============================================================
-- FORM SUBMISSION PHOTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.form_submission_photos (
  id              UUID DEFAULT gen_random_uuid() NOT NULL,
  submission_id   UUID NOT NULL,
  field_id        TEXT NOT NULL,
  file_url        TEXT NOT NULL,
  file_name       TEXT,
  captured_at     TIMESTAMPTZ,
  is_live_capture BOOLEAN DEFAULT false,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT form_submission_photos_pkey PRIMARY KEY (id),
  CONSTRAINT form_submission_photos_submission_fkey FOREIGN KEY (submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_submission_photos_submission ON public.form_submission_photos (submission_id);

-- ============================================================
-- ANNOUNCEMENTS MODULE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(255),
  priority VARCHAR(20) DEFAULT 'normal'::character varying NOT NULL,
  request_read_receipt BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_by_personnel_id TEXT NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  personnel_id TEXT NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_created_by ON public.announcements (created_by_personnel_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_lookup ON public.announcement_reads (announcement_id, personnel_id);

-- ============================================================
-- EQUIPMENTS & MAINTENANCE TICKETS MODULE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.equipments (
  id          UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id   TEXT,
  name        TEXT NOT NULL,
  code        TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT equipments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.maintenance_tickets (
  id                    UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id             TEXT,
  equipment_id          UUID,                          -- legacy FK → public.equipments(id)
  equipment_instance_id UUID,                          -- yeni FK → public.equipment_instances(id)
  description           TEXT,
  issue_description     TEXT,
  reported_by_pin       TEXT,
  status                TEXT DEFAULT 'open' NOT NULL,
  repair_cost           NUMERIC(12,2),
  repair_currency       VARCHAR(3),
  repair_exchange_rate  NUMERIC(12,4),
  form_submission_id    UUID,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT maintenance_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT maintenance_tickets_equipment_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipments(id) ON DELETE SET NULL,
  CONSTRAINT maintenance_tickets_instance_fkey FOREIGN KEY (equipment_instance_id) REFERENCES public.equipment_instances(id) ON DELETE SET NULL,
  CONSTRAINT maintenance_tickets_status_check CHECK (status = ANY (ARRAY['open', 'in_progress', 'resolved', 'closed']))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_instance ON public.maintenance_tickets (equipment_instance_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_status   ON public.maintenance_tickets (status);

-- ============================================================
-- OPERASYON EL KİTABI (OPERATION MANUAL) MODULE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.equipment_definitions (
  id                       UUID DEFAULT gen_random_uuid() NOT NULL,
  name                     TEXT NOT NULL,
  description              TEXT,
  purpose                  TEXT,
  image_url                TEXT,
  maintenance_period_days  INTEGER,
  useful_life_months       INTEGER,
  active                   BOOLEAN DEFAULT true NOT NULL,
  created_at               TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT equipment_definitions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.equipment_instances (
  id                              UUID DEFAULT gen_random_uuid() NOT NULL,
  definition_id                   UUID NOT NULL,
  current_location_id             TEXT NOT NULL,
  serial_number                   TEXT,
  status                          TEXT DEFAULT 'active' NOT NULL,
  installed_at                    DATE,
  purchase_date                   DATE,
  purchase_price                  NUMERIC(14,2),
  currency                        VARCHAR(10) DEFAULT 'TRY' NOT NULL,
  purchase_exchange_rate          NUMERIC(12,4) DEFAULT 1.0,
  legacy_accumulated_depreciation NUMERIC(14,2) DEFAULT 0,
  warranty_end_date               DATE,
  notes                           TEXT,
  image_url                       TEXT,
  file_url                        TEXT,
  external_url                    TEXT,
  qr_code                         TEXT UNIQUE,
  name                            TEXT,
  created_at                      TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at                      TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT equipment_instances_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_instances_definition_fkey
    FOREIGN KEY (definition_id) REFERENCES public.equipment_definitions(id) ON DELETE RESTRICT,
  CONSTRAINT equipment_instances_status_check
    CHECK (status = ANY (ARRAY['active', 'in_repair', 'transferred', 'decommissioned']))
);

CREATE INDEX IF NOT EXISTS idx_equipment_instances_definition ON public.equipment_instances (definition_id);
CREATE INDEX IF NOT EXISTS idx_equipment_instances_location   ON public.equipment_instances (current_location_id);
CREATE INDEX IF NOT EXISTS idx_equipment_instances_status     ON public.equipment_instances (status);

CREATE TABLE IF NOT EXISTS public.equipment_transfers (
  id                    UUID DEFAULT gen_random_uuid() NOT NULL,
  equipment_instance_id UUID NOT NULL,
  from_location_id      TEXT NOT NULL,
  to_location_id        TEXT NOT NULL,
  status                TEXT DEFAULT 'pending' NOT NULL,
  notes                 TEXT,
  transferred_at        TIMESTAMPTZ,
  transferred_by_pin    TEXT,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT equipment_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT equipment_transfers_instance_fkey
    FOREIGN KEY (equipment_instance_id) REFERENCES public.equipment_instances(id) ON DELETE CASCADE,
  CONSTRAINT equipment_transfers_status_check
    CHECK (status = ANY (ARRAY['pending', 'completed', 'rejected']))
);

CREATE INDEX IF NOT EXISTS idx_equipment_transfers_instance ON public.equipment_transfers (equipment_instance_id);
CREATE INDEX IF NOT EXISTS idx_equipment_transfers_status   ON public.equipment_transfers (status);

CREATE TABLE IF NOT EXISTS public.manual_categories (
  id             UUID DEFAULT gen_random_uuid() NOT NULL,
  name           TEXT NOT NULL,
  description    TEXT,
  display_order  INTEGER DEFAULT 0 NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT manual_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.manual_pages (
  id                    UUID DEFAULT gen_random_uuid() NOT NULL,
  category_id           UUID NOT NULL,
  title                 TEXT NOT NULL,
  content               TEXT,
  version               INTEGER DEFAULT 1 NOT NULL,
  last_updated_by_pin   TEXT,
  linked_item_id        UUID,
  linked_item_type      VARCHAR(50),
  metadata              JSONB,
  is_draft              BOOLEAN DEFAULT false,
  updated_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT manual_pages_pkey PRIMARY KEY (id),
  CONSTRAINT manual_pages_category_fkey FOREIGN KEY (category_id) REFERENCES public.manual_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.manual_page_equipments (
  page_id                  UUID NOT NULL,
  equipment_definition_id  UUID NOT NULL,
  CONSTRAINT manual_page_equipments_pkey PRIMARY KEY (page_id, equipment_definition_id),
  CONSTRAINT manual_page_equipments_page_fkey FOREIGN KEY (page_id) REFERENCES public.manual_pages(id) ON DELETE CASCADE,
  CONSTRAINT manual_page_equipments_eq_def_fkey FOREIGN KEY (equipment_definition_id) REFERENCES public.equipment_definitions(id) ON DELETE CASCADE
);

-- Seed Data for manual_categories
INSERT INTO public.manual_categories (name, display_order)
SELECT name, display_order FROM (VALUES
  ('Ürünler', 1),
  ('Hammaddeler', 2),
  ('Ekipmanlar', 3),
  ('Hizmet Standartları', 4)
) AS v(name, display_order)
WHERE NOT EXISTS (SELECT 1 FROM public.manual_categories LIMIT 1);

-- ============================================================
-- SURVEY QR/LINK TOKENS MODULE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.survey_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.form_templates(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  mode        TEXT NOT NULL DEFAULT 'anonymous' CHECK (mode IN ('anonymous','branch','multi_branch')),
  branch_id   TEXT,
  branch_ids  JSONB,
  label       TEXT,
  qr_config   JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_tokens_template ON public.survey_tokens(template_id);
CREATE INDEX IF NOT EXISTS idx_survey_tokens_token    ON public.survey_tokens(token);
CREATE INDEX IF NOT EXISTS idx_survey_tokens_active   ON public.survey_tokens(active) WHERE active = TRUE;

-- ============================================================
-- END OF SCHEMA
-- ============================================================

-- ============================================================
-- WMS TAMAMLAMA: Eksik kolonlar ve index'ler
-- ============================================================

-- warehouse_locations: updated_at kolonu
ALTER TABLE public.warehouse_locations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_branch ON public.warehouse_locations(branch_id);

-- warehouse_lpns: lokasyon, notlar ve zaman damgaları
ALTER TABLE public.warehouse_lpns
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_branch   ON public.warehouse_lpns(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_location ON public.warehouse_lpns(location_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_lpns_status   ON public.warehouse_lpns(status);

-- stock_item_warehouse_settings: varsayılan lokasyon bağlantısı ve updated_at
ALTER TABLE public.stock_item_warehouse_settings
  ADD COLUMN IF NOT EXISTS default_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_price_adjustment_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS transfer_price_adjustment_value NUMERIC(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_stock_item_wh_settings_item   ON public.stock_item_warehouse_settings(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_item_wh_settings_branch ON public.stock_item_warehouse_settings(branch_id);

-- inventory_movements: WMS lokasyon, LPN, lot ve son kullanma tarihi
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS location_id     UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lpn_id          UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_number      TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE;
CREATE INDEX IF NOT EXISTS idx_inv_movements_location ON public.inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS idx_inv_movements_lpn      ON public.inventory_movements(lpn_id);

-- product_external_barcodes: ek indeksler ve updated_at
ALTER TABLE public.product_external_barcodes
  ADD COLUMN IF NOT EXISTS notes      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_gtin ON public.product_external_barcodes(gtin_barcode) WHERE (active = true);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_item        ON public.product_external_barcodes(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_product_barcodes_approved    ON public.product_external_barcodes(is_approved);

-- WMS Phase 6: shipments, vehicles, and lines
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  plate_number TEXT NOT NULL,
  vehicle_code TEXT,
  display_name TEXT,
  vehicle_type TEXT,
  temperature_class TEXT,
  max_volume_m3 NUMERIC,
  max_weight_kg NUMERIC,
  inner_length_cm NUMERIC,
  inner_width_cm NUMERIC,
  inner_height_cm NUMERIC,
  driver_name TEXT,
  driver_phone TEXT,
  active BOOLEAN DEFAULT true NOT NULL,
  branch_id UUID,
  capacity_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_plate_number_key UNIQUE (plate_number),
  CONSTRAINT vehicles_vehicle_code_key UNIQUE (vehicle_code),
  CONSTRAINT vehicles_vehicle_type_check CHECK (vehicle_type IN ('truck', 'van', 'pickup', 'container', 'other')),
  CONSTRAINT vehicles_temperature_class_check CHECK (temperature_class IN ('dry', 'cold', 'frozen', 'multi_temp')),
  CONSTRAINT vehicles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.company_nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.warehouse_shipments (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  shipment_no TEXT NOT NULL,
  source_branch_id UUID NOT NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  plate_number TEXT,
  driver_info TEXT,
  status TEXT DEFAULT 'draft'::text NOT NULL,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  notes TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_shipments_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_shipments_shipment_no_key UNIQUE (shipment_no),
  CONSTRAINT warehouse_shipments_status_check CHECK (status = ANY (ARRAY['draft'::text, 'ready_to_load'::text, 'in_transit'::text, 'delivered'::text, 'cancelled'::text]))
);

CREATE TABLE IF NOT EXISTS public.warehouse_shipment_orders (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  shipment_id UUID NOT NULL REFERENCES public.warehouse_shipments(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_shipment_orders_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_shipment_orders_uq UNIQUE (shipment_id, purchase_order_id)
);

CREATE TABLE IF NOT EXISTS public.warehouse_shipment_lines (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  shipment_id UUID NOT NULL REFERENCES public.warehouse_shipments(id) ON DELETE CASCADE,
  purchase_order_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  shipped_qty NUMERIC(18,4) NOT NULL,
  unit_price NUMERIC(18,4) DEFAULT 0 NOT NULL,
  line_total NUMERIC(18,4) DEFAULT 0 NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_shipment_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.warehouse_reservations (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  lot_number TEXT,
  expiration_date DATE,
  source_doc_type TEXT NOT NULL,
  source_doc_id UUID NOT NULL,
  source_line_id UUID,
  reserved_qty NUMERIC(18,4) NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  reserved_by TEXT,
  reserved_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_reservations_status_check CHECK (status = ANY (ARRAY['active'::text, 'consumed'::text, 'released'::text, 'cancelled'::text, 'expired'::text])),
  CONSTRAINT warehouse_reservations_qty_check CHECK (reserved_qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_branch ON public.warehouse_reservations(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_stock_item ON public.warehouse_reservations(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_location ON public.warehouse_reservations(location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_lpn ON public.warehouse_reservations(lpn_id) WHERE lpn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_status ON public.warehouse_reservations(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_reservations_source ON public.warehouse_reservations(source_doc_type, source_doc_id);


CREATE INDEX IF NOT EXISTS vehicles_active_idx ON public.vehicles(active);
CREATE INDEX IF NOT EXISTS warehouse_shipments_source_branch_idx ON public.warehouse_shipments(source_branch_id);
CREATE INDEX IF NOT EXISTS warehouse_shipments_vehicle_idx ON public.warehouse_shipments(vehicle_id);
CREATE INDEX IF NOT EXISTS warehouse_shipments_status_idx ON public.warehouse_shipments(status);

-- RPC Function for Atomic and Idempotent WMS Shipment Dispatch & Stock Out
-- RPC Function for Atomic and Idempotent WMS Shipment Dispatch & Stock Out
CREATE OR REPLACE FUNCTION public.confirm_warehouse_shipment(
  p_shipment_id UUID,
  p_branch_id UUID,
  p_branch_name TEXT
) RETURNS VOID AS $$
DECLARE
  v_shipment_no TEXT;
  v_source_branch_id UUID;
  v_plate_number TEXT;
  v_driver_info TEXT;
  v_notes TEXT;
  v_status TEXT;
  v_line RECORD;
  v_pick RECORD;
  v_order RECORD;
  v_meta JSONB;
  v_next_meta JSONB;

  -- locked reservation fields
  v_res_id UUID;
  v_res_location_id UUID;
  v_res_lpn_id UUID;
  v_res_lot_number TEXT;
  v_res_expiration_date DATE;
  v_res_qty NUMERIC;
  v_res_status TEXT;
BEGIN
  -- 1. Select and lock the shipment row to enforce idempotency
  SELECT shipment_no, source_branch_id, plate_number, driver_info, notes, status
  INTO v_shipment_no, v_source_branch_id, v_plate_number, v_driver_info, v_notes, v_status
  FROM public.warehouse_shipments
  WHERE id = p_shipment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sevkiyat bulunamadı.';
  END IF;

  IF v_source_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'Yetkisiz depo işlemi: Sevkiyat deposu ile aktif depo uyuşmuyor.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Sevkiyat taslak durumunda değil (Mevcut durum: %).', v_status;
  END IF;

  -- 2. Update status to 'in_transit'
  UPDATE public.warehouse_shipments
  SET status = 'in_transit',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_shipment_id;

  -- 3. Loop over shipment lines and generate stock exits
  FOR v_line IN
    SELECT wsl.*, si.name AS item_name
    FROM public.warehouse_shipment_lines wsl
    LEFT JOIN public.stock_items si ON si.id = wsl.stock_item_id
    WHERE wsl.shipment_id = p_shipment_id AND wsl.deleted_at IS NULL
  LOOP
    IF v_line.shipped_qty > 0 THEN
      -- Check if meta has 'picks' array
      IF v_line.meta ? 'picks' AND jsonb_typeof(v_line.meta->'picks') = 'array' THEN
        -- Loop over picks
        FOR v_pick IN
          SELECT * FROM jsonb_to_recordset(v_line.meta->'picks')
          AS x(location_id UUID, lpn_id UUID, lot_number TEXT, expiration_date DATE, qty NUMERIC, reservation_id UUID)
        LOOP
          IF v_pick.qty > 0 THEN
            -- Check reservation existence
            IF v_pick.reservation_id IS NULL THEN
              RAISE EXCEPTION 'Sevkiyat satırında rezervasyon ID bilgisi bulunmamaktadır.';
            END IF;

            -- Select and lock the reservation row
            SELECT id, location_id, lpn_id, lot_number, expiration_date, reserved_qty, status
            INTO v_res_id, v_res_location_id, v_res_lpn_id, v_res_lot_number, v_res_expiration_date, v_res_qty, v_res_status
            FROM public.warehouse_reservations
            WHERE id = v_pick.reservation_id
            FOR UPDATE;

            IF NOT FOUND THEN
              RAISE EXCEPTION 'İlgili rezervasyon bulunamadı (ID: %).', v_pick.reservation_id;
            END IF;

            IF v_res_status <> 'active' THEN
              RAISE EXCEPTION 'Rezervasyon aktif değil (ID: %, Durum: %).', v_pick.reservation_id, v_res_status;
            END IF;

            IF v_res_qty <> v_pick.qty THEN
              RAISE EXCEPTION 'Rezervasyon miktarı ile sevk miktarı uyuşmuyor (Rezervasyon: %, Sevk: %).', v_res_qty, v_pick.qty;
            END IF;

            -- Insert inventory movement using fields from the locked reservation row
            INSERT INTO public.inventory_movements (
              item_type,
              stock_item_id,
              item_name,
              branch_id,
              branch_name,
              movement_type,
              source_doc_type,
              direction,
              movement_at,
              quantity,
              unit_cost,
              total_cost,
              location_id,
              lpn_id,
              lot_number,
              expiration_date,
              meta
            ) VALUES (
              'stock_item',
              v_line.stock_item_id,
              COALESCE(v_line.item_name, 'Bilinmeyen Ürün'),
              p_branch_id,
              p_branch_name,
              'transfer_out',
              'transfer',
              'out',
              now(),
              v_res_qty,
              v_line.unit_price,
              v_res_qty * v_line.unit_price,
              v_res_location_id,
              v_res_lpn_id,
              v_res_lot_number,
              v_res_expiration_date,
              jsonb_build_object(
                'shipment_id', p_shipment_id,
                'shipment_no', v_shipment_no,
                'reservation_id', v_res_id,
                'availability_status', 'available'
              )
            );

            -- Mark reservation as consumed
            UPDATE public.warehouse_reservations
            SET status = 'consumed',
                consumed_at = now(),
                updated_at = now()
            WHERE id = v_res_id;
          END IF;
        END LOOP;
      ELSE
        -- Fallback if no picks array (e.g. manual DB inserts)
        RAISE EXCEPTION 'Picks array bulunmayan sevkiyat onaylanamaz.';
      END IF;
    END IF;
  END LOOP;

  -- 4. Update associated Purchase Order meta
  FOR v_order IN
    SELECT po.*
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND wso.deleted_at IS NULL
  LOOP
    -- Build new metadata
    v_meta := COALESCE(v_order.meta, '{}'::jsonb);
    v_next_meta := v_meta || jsonb_build_object(
      'supplier_marked_sent', true,
      'supplier_sent_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'supplier_dispatch', jsonb_build_object(
        'delivered_on', to_char(now(), 'YYYY-MM-DD'),
        'delivered_at', to_char(now(), 'HH24:MI'),
        'doc_kind', 'irsaliye',
        'doc_date', to_char(now(), 'YYYY-MM-DD'),
        'doc_no', v_shipment_no,
        'plate_number', v_plate_number,
        'driver_info', v_driver_info,
        'note', COALESCE(v_notes, 'Araç ile sevk edildi.')
      )
    );

    UPDATE public.purchase_orders
    SET meta = v_next_meta,
        updated_at = now()
    WHERE id = v_order.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.cancel_warehouse_shipment(
  p_shipment_id UUID,
  p_branch_id UUID
) RETURNS VOID AS $$
DECLARE
  v_source_branch_id UUID;
  v_status TEXT;
  v_line RECORD;
  v_po_line RECORD;
  v_order RECORD;
  v_meta JSONB;
  v_orig_qty NUMERIC;
BEGIN
  -- 1. Select and lock the shipment row
  SELECT source_branch_id, status
  INTO v_source_branch_id, v_status
  FROM public.warehouse_shipments
  WHERE id = p_shipment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sevkiyat bulunamadı.';
  END IF;

  IF v_source_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'Yetkisiz depo işlemi: Sevkiyat deposu ile aktif depo uyuşmuyor.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Yalnızca taslak durumundaki sevkiyatlar iptal edilebilir (Mevcut durum: %).', v_status;
  END IF;

  -- 2. Update shipment status to 'cancelled'
  UPDATE public.warehouse_shipments
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_shipment_id;

  -- 3. Release/cancel all associated active reservations
  UPDATE public.warehouse_reservations
  SET status = 'cancelled',
      released_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status = 'active';

  -- 4. Restore original quantities to purchase order lines
  FOR v_line IN
    SELECT * FROM public.warehouse_shipment_lines
    WHERE shipment_id = p_shipment_id AND deleted_at IS NULL
  LOOP
    SELECT * INTO v_po_line
    FROM public.purchase_order_lines
    WHERE id = v_line.purchase_order_line_id AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      v_meta := COALESCE(v_po_line.meta, '{}'::jsonb);
      IF v_meta ? 'original_ordered_qty' THEN
        v_orig_qty := (v_meta->>'original_ordered_qty')::NUMERIC;

        -- Delete the original_ordered_qty property from the metadata object
        v_meta := v_meta - 'original_ordered_qty';

        UPDATE public.purchase_order_lines
        SET ordered_qty = v_orig_qty,
            line_total = v_orig_qty * unit_price,
            meta = v_meta,
            updated_at = now()
        WHERE id = v_po_line.id;
      END IF;
    END IF;
  END LOOP;

  -- 5. Recalculate purchase order totals for associated orders
  FOR v_order IN
    SELECT po.*
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND wso.deleted_at IS NULL
  LOOP
    UPDATE public.purchase_orders
    SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        updated_at = now()
    WHERE id = v_order.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- RPC Function for atomic WMS Shipment Draft Creation with Reservations
CREATE OR REPLACE FUNCTION public.create_warehouse_shipment_with_reservations(
  p_branch_id UUID,
  p_purchase_order_ids UUID[],
  p_shipment_draft JSONB,
  p_plate_number TEXT,
  p_driver_info TEXT,
  p_notes TEXT,
  p_vehicle_id UUID
) RETURNS UUID AS $$
DECLARE
  v_supplier_id UUID;
  v_shipment_no TEXT;
  v_shipment_id UUID;
  v_order_id UUID;
  v_draft_item RECORD;
  v_po_line RECORD;
  v_pkg RECORD;

  -- variables for cursor / stock picking
  v_cursor_opened BOOLEAN := false;
  v_stock_fetched BOOLEAN;
  v_curr_location_id UUID;
  v_curr_lpn_id UUID;
  v_curr_lot_number TEXT;
  v_curr_expiration_date DATE;
  v_curr_stock_qty NUMERIC;
  v_curr_stock_remaining NUMERIC;

  v_remaining_for_po_lines NUMERIC;
  v_line_shipped_qty NUMERIC;
  v_initial_line_shipped_qty NUMERIC;
  v_take_qty NUMERIC;
  v_reservation_id UUID;
  v_line_picks JSONB;
  v_shipment_line_id UUID;
  v_item_name TEXT;

  -- cursor definition
  c_stock CURSOR (cp_stock_item_id UUID) FOR
    SELECT location_id, lpn_id, lot_number, expiration_date, pickable_qty
    FROM public.v_wms_pickable_stock
    WHERE branch_id = p_branch_id
      AND stock_item_id = cp_stock_item_id
      AND pickable_qty > 0
    ORDER BY expiration_date ASC NULLS LAST, location_id, lpn_id;
BEGIN
  -- 1. Check active depot authority
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE source_branch_id = p_branch_id
    AND supplier_kind = 'internal_warehouse'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Depo yetkilendirmesi bulunamadı veya aktif depo geçersiz.';
  END IF;

  -- 2. Validate and lock purchase orders
  PERFORM id
  FROM public.purchase_orders
  WHERE id = ANY(p_purchase_order_ids)
    AND deleted_at IS NULL
  FOR UPDATE;

  -- Verify all orders belong to the branch's supplier
  IF EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = ANY(p_purchase_order_ids)
      AND po.supplier_id <> v_supplier_id
      AND po.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Seçili siparişlerden biri veya birkaçı bu depoya ait değil.';
  END IF;

  -- Lock all order lines
  PERFORM id
  FROM public.purchase_order_lines
  WHERE order_id = ANY(p_purchase_order_ids)
    AND deleted_at IS NULL
  FOR UPDATE;

  -- 3. Generate unique shipment number
  LOOP
    v_shipment_no := 'SH-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.warehouse_shipments WHERE shipment_no = v_shipment_no
    );
  END LOOP;

  -- 4. Create warehouse_shipment
  INSERT INTO public.warehouse_shipments (
    shipment_no,
    source_branch_id,
    vehicle_id,
    plate_number,
    driver_info,
    status,
    notes,
    meta
  ) VALUES (
    v_shipment_no,
    p_branch_id,
    p_vehicle_id,
    p_plate_number,
    p_driver_info,
    'draft',
    p_notes,
    '{}'::jsonb
  ) RETURNING id INTO v_shipment_id;

  -- 5. Create warehouse_shipment_orders
  FOREACH v_order_id IN ARRAY p_purchase_order_ids LOOP
    INSERT INTO public.warehouse_shipment_orders (
      shipment_id,
      purchase_order_id
    ) VALUES (
      v_shipment_id,
      v_order_id
    );
  END LOOP;

  -- 6. Allocate stock and create shipment lines & reservations
  FOR v_draft_item IN
    SELECT key::UUID AS stock_item_id, value::NUMERIC AS shipped_qty
    FROM jsonb_each(p_shipment_draft)
  LOOP
    IF v_draft_item.shipped_qty > 0 THEN
      -- Initialize cursor tracking
      v_cursor_opened := false;
      v_stock_fetched := false;
      v_curr_stock_remaining := 0;

      v_remaining_for_po_lines := v_draft_item.shipped_qty;

      -- Loop over purchase order lines for this stock item across selected POs
      FOR v_po_line IN
        SELECT pol.id AS line_id, pol.ordered_qty, pol.unit_price, pol.meta
        FROM public.purchase_order_lines pol
        WHERE pol.order_id = ANY(p_purchase_order_ids)
          AND pol.stock_item_id = v_draft_item.stock_item_id
          AND pol.deleted_at IS NULL
        ORDER BY pol.created_at ASC
      LOOP
        v_line_shipped_qty := LEAST(v_po_line.ordered_qty, v_remaining_for_po_lines);
        v_initial_line_shipped_qty := v_line_shipped_qty;
        v_remaining_for_po_lines := v_remaining_for_po_lines - v_line_shipped_qty;

        IF v_line_shipped_qty > 0 THEN
          v_line_picks := '[]'::jsonb;
          v_shipment_line_id := gen_random_uuid();

          -- Allocate from physical pickable stock
          WHILE v_line_shipped_qty > 0 LOOP
            IF NOT v_stock_fetched OR v_curr_stock_remaining <= 0 THEN
              -- Open cursor if not already done
              IF NOT v_cursor_opened THEN
                OPEN c_stock(v_draft_item.stock_item_id);
                v_cursor_opened := true;
              END IF;

              FETCH c_stock INTO v_curr_location_id, v_curr_lpn_id, v_curr_lot_number, v_curr_expiration_date, v_curr_stock_qty;

              IF NOT FOUND THEN
                -- Close cursor and raise error
                CLOSE c_stock;
                v_cursor_opened := false;

                SELECT name INTO v_item_name FROM public.stock_items WHERE id = v_draft_item.stock_item_id;
                RAISE EXCEPTION 'Stok yetersiz! "%" ürünü için depoda yeterli pickable stok bulunmamaktadır.', COALESCE(v_item_name, 'Bilinmeyen Ürün');
              END IF;

              v_curr_stock_remaining := v_curr_stock_qty;
              v_stock_fetched := true;
            END IF;

            v_take_qty := LEAST(v_curr_stock_remaining, v_line_shipped_qty);
            v_curr_stock_remaining := v_curr_stock_remaining - v_take_qty;
            v_line_shipped_qty := v_line_shipped_qty - v_take_qty;

            -- Insert reservation
            INSERT INTO public.warehouse_reservations (
              branch_id,
              stock_item_id,
              location_id,
              lpn_id,
              lot_number,
              expiration_date,
              source_doc_type,
              source_doc_id,
              source_line_id,
              reserved_qty,
              status,
              reserved_by,
              reserved_at
            ) VALUES (
              p_branch_id,
              v_draft_item.stock_item_id,
              v_curr_location_id,
              v_curr_lpn_id,
              v_curr_lot_number,
              v_curr_expiration_date,
              'warehouse_shipment',
              v_shipment_id,
              v_shipment_line_id,
              v_take_qty,
              'active',
              'System (WMS RPC)',
              now()
            ) RETURNING id INTO v_reservation_id;

            -- Append pick info
            v_line_picks := v_line_picks || jsonb_build_array(
              jsonb_build_object(
                'reservation_id', v_reservation_id,
                'location_id', v_curr_location_id,
                'lpn_id', v_curr_lpn_id,
                'lot_number', v_curr_lot_number,
                'expiration_date', v_curr_expiration_date,
                'qty', v_take_qty
              )
            );
          END LOOP;

          -- Fetch packaging unit details
          SELECT id, base_quantity, volume_m3, gross_weight_kg
          INTO v_pkg
          FROM public.stock_item_package_units
          WHERE stock_item_id = v_draft_item.stock_item_id AND active = true
          ORDER BY is_default_shipping_unit DESC, is_base_unit DESC, created_at ASC
          LIMIT 1;

          -- Create shipment line
          INSERT INTO public.warehouse_shipment_lines (
            id,
            shipment_id,
            purchase_order_line_id,
            stock_item_id,
            shipped_qty,
            unit_price,
            line_total,
            meta,
            package_unit_id,
            package_qty,
            base_qty,
            line_volume_m3,
            line_gross_weight_kg
          ) VALUES (
            v_shipment_line_id,
            v_shipment_id,
            v_po_line.line_id,
            v_draft_item.stock_item_id,
            v_initial_line_shipped_qty,
            v_po_line.unit_price,
            v_initial_line_shipped_qty * v_po_line.unit_price,
            jsonb_build_object('picks', v_line_picks),
            v_pkg.id,
            v_initial_line_shipped_qty / COALESCE(NULLIF(v_pkg.base_quantity, 0), 1.0),
            v_initial_line_shipped_qty,
            COALESCE(v_pkg.volume_m3, 0) * (v_initial_line_shipped_qty / COALESCE(NULLIF(v_pkg.base_quantity, 0), 1.0)),
            COALESCE(v_pkg.gross_weight_kg, 0) * (v_initial_line_shipped_qty / COALESCE(NULLIF(v_pkg.base_quantity, 0), 1.0))
          );

          -- Update purchase order line
          DECLARE
            v_next_meta JSONB;
          BEGIN
            v_next_meta := COALESCE(v_po_line.meta, '{}'::jsonb);
            IF NOT (v_next_meta ? 'original_ordered_qty') THEN
              v_next_meta := v_next_meta || jsonb_build_object('original_ordered_qty', v_po_line.ordered_qty);
            END IF;

            UPDATE public.purchase_order_lines
            SET ordered_qty = v_initial_line_shipped_qty,
                line_total = v_initial_line_shipped_qty * unit_price,
                meta = v_next_meta,
                updated_at = now()
            WHERE id = v_po_line.line_id;
          END;
        END IF;
      END LOOP;

      -- Close cursor if open
      IF v_cursor_opened THEN
        CLOSE c_stock;
        v_cursor_opened := false;
      END IF;
    END IF;
  END LOOP;

  -- 7. Recalculate purchase order totals
  FOREACH v_order_id IN ARRAY p_purchase_order_ids LOOP
    UPDATE public.purchase_orders
    SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
        total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
        subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
        updated_at = now()
    WHERE id = v_order_id;
  END LOOP;

  RETURN v_shipment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE VIEW public.v_wms_pickable_stock AS
WITH physical_stock AS (
  SELECT
    branch_id,
    stock_item_id,
    location_id,
    lpn_id,
    lot_number,
    expiration_date,
    SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END) AS physical_qty
  FROM public.inventory_movements
  WHERE deleted_at IS NULL
    AND is_cancelled = false
    AND COALESCE(meta->>'availability_status', 'available') NOT IN ('quarantine', 'putaway_pending')
  GROUP BY
    branch_id,
    stock_item_id,
    location_id,
    lpn_id,
    lot_number,
    expiration_date
),
reserved_stock AS (
  SELECT
    branch_id,
    stock_item_id,
    location_id,
    lpn_id,
    lot_number,
    expiration_date,
    SUM(reserved_qty) AS reserved_qty
  FROM public.warehouse_reservations
  WHERE status = 'active'
  GROUP BY
    branch_id,
    stock_item_id,
    location_id,
    lpn_id,
    lot_number,
    expiration_date
)
SELECT
  p.branch_id,
  p.stock_item_id,
  p.location_id,
  p.lpn_id,
  p.lot_number,
  p.expiration_date,
  p.physical_qty,
  COALESCE(r.reserved_qty, 0::numeric) AS reserved_qty,
  GREATEST(p.physical_qty - COALESCE(r.reserved_qty, 0::numeric), 0::numeric) AS pickable_qty
FROM physical_stock p
LEFT JOIN reserved_stock r ON
  p.branch_id = r.branch_id AND
  p.stock_item_id = r.stock_item_id AND
  (p.location_id = r.location_id OR (p.location_id IS NULL AND r.location_id IS NULL)) AND
  (p.lpn_id = r.lpn_id OR (p.lpn_id IS NULL AND r.lpn_id IS NULL)) AND
  (p.lot_number = r.lot_number OR (p.lot_number IS NULL AND r.lot_number IS NULL)) AND
  (p.expiration_date = r.expiration_date OR (p.expiration_date IS NULL AND r.expiration_date IS NULL))
WHERE p.physical_qty > 0;
-- Create warehouse_tasks and warehouse_task_events tables and their indexes
CREATE TABLE IF NOT EXISTS public.warehouse_tasks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.company_nodes(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  priority TEXT DEFAULT 'normal' NOT NULL,
  assigned_personnel_id TEXT,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  source_doc_type TEXT,
  source_doc_id UUID,
  source_line_id UUID,
  description TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_tasks_status_check CHECK (status IN ('pending', 'assigned', 'in_progress', 'done', 'exception', 'cancelled')),
  CONSTRAINT warehouse_tasks_type_check CHECK (task_type IN ('putaway', 'pick', 'pack', 'load', 'count', 'move', 'quality')),
  CONSTRAINT warehouse_tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_branch ON public.warehouse_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_status ON public.warehouse_tasks(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_type ON public.warehouse_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_assigned ON public.warehouse_tasks(assigned_personnel_id) WHERE assigned_personnel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_source ON public.warehouse_tasks(source_doc_type, source_doc_id) WHERE source_doc_type IS NOT NULL AND source_doc_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_task_events (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL REFERENCES public.warehouse_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  personnel_id TEXT,
  terminal_id TEXT,
  barcode_scanned TEXT,
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_task_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_task_events_task ON public.warehouse_task_events(task_id);

-- Complete warehouse putaway task RPC
CREATE OR REPLACE FUNCTION public.complete_warehouse_putaway_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_target_location_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_source_movement_id UUID;
  v_source_movement public.inventory_movements%ROWTYPE;
  v_out_movement_id UUID;
  v_in_movement_id UUID;
  v_qty NUMERIC(18,6);
  v_target_location_id UUID := p_target_location_id;
BEGIN
  -- 1. Görevi kilitle ve kontrol et
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.task_type <> 'putaway' THEN
    RAISE EXCEPTION 'Bu işlem sadece putaway görevleri için geçerlidir. Görev tipi: %', v_task.task_type;
  END IF;

  IF v_task.status = 'done' THEN
    RAISE EXCEPTION 'Görev zaten tamamlanmış.';
  END IF;

  IF v_task.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş bir görev tamamlanamaz.';
  END IF;

  -- 2. Meta verileri oku
  v_source_movement_id := (v_task.meta->>'source_movement_id')::UUID;
  IF v_source_movement_id IS NULL THEN
    RAISE EXCEPTION 'Görevin meta verisinde kaynak hareket ID''si (source_movement_id) bulunamadı.';
  END IF;

  -- Kaynak hareketi kilitle
  SELECT * INTO v_source_movement
  FROM public.inventory_movements
  WHERE id = v_source_movement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kaynak stok hareketi bulunamadı (ID: %)', v_source_movement_id;
  END IF;

  -- Görevdeki veya metadaki miktar
  v_qty := COALESCE(
    (v_task.meta->>'quantity')::NUMERIC(18,6),
    v_source_movement.quantity
  );

  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Görev miktarı sıfır veya negatif olamaz: %', v_qty;
  END IF;

  -- Hedef lokasyon belirlenmesi
  IF v_target_location_id IS NULL THEN
    v_target_location_id := (v_task.meta->>'target_location_id')::UUID;
  END IF;

  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'Hedef lokasyon belirtilmedi veya görev metasında bulunamadı.';
  END IF;

  -- 3. transfer_out hareketini ekle (putaway_pending durumunu azaltır)
  v_out_movement_id := gen_random_uuid();
  v_in_movement_id := gen_random_uuid();

  INSERT INTO public.inventory_movements (
    id,
    company_id,
    legal_entity_id,
    org_unit_id,
    branch_id,
    branch_name,
    warehouse_id,
    warehouse_name,
    item_type,
    stock_item_id,
    semi_item_id,
    item_name,
    item_sku,
    unit,
    unit_factor,
    movement_type,
    source_doc_type,
    direction,
    movement_at,
    quantity,
    source_doc_id,
    source_doc_line_id,
    source_doc_no,
    source_doc_ref,
    transfer_pair_id,
    unit_cost,
    total_cost,
    currency_code,
    location_id,
    lpn_id,
    lot_number,
    expiration_date,
    meta,
    created_by
  ) VALUES (
    v_out_movement_id,
    v_source_movement.company_id,
    v_source_movement.legal_entity_id,
    v_source_movement.org_unit_id,
    v_source_movement.branch_id,
    v_source_movement.branch_name,
    v_source_movement.warehouse_id,
    v_source_movement.warehouse_name,
    v_source_movement.item_type,
    v_source_movement.stock_item_id,
    v_source_movement.semi_item_id,
    v_source_movement.item_name,
    v_source_movement.item_sku,
    v_source_movement.unit,
    v_source_movement.unit_factor,
    'transfer_out',
    'transfer',
    'out',
    now(),
    v_qty,
    v_task.id,
    NULL,
    NULL,
    NULL,
    v_in_movement_id,
    v_source_movement.unit_cost,
    v_qty * v_source_movement.unit_cost,
    v_source_movement.currency_code,
    v_source_movement.location_id,
    v_source_movement.lpn_id,
    v_source_movement.lot_number,
    v_source_movement.expiration_date,
    jsonb_build_object(
      'warehouse_task_id', p_task_id,
      'availability_status', 'putaway_pending',
      'source_movement_id', v_source_movement_id
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 4. transfer_in hareketini ekle (available durumunu artırır)
  INSERT INTO public.inventory_movements (
    id,
    company_id,
    legal_entity_id,
    org_unit_id,
    branch_id,
    branch_name,
    warehouse_id,
    warehouse_name,
    item_type,
    stock_item_id,
    semi_item_id,
    item_name,
    item_sku,
    unit,
    unit_factor,
    movement_type,
    source_doc_type,
    direction,
    movement_at,
    quantity,
    source_doc_id,
    source_doc_line_id,
    source_doc_no,
    source_doc_ref,
    transfer_pair_id,
    unit_cost,
    total_cost,
    currency_code,
    location_id,
    lpn_id,
    lot_number,
    expiration_date,
    meta,
    created_by
  ) VALUES (
    v_in_movement_id,
    v_source_movement.company_id,
    v_source_movement.legal_entity_id,
    v_source_movement.org_unit_id,
    v_source_movement.branch_id,
    v_source_movement.branch_name,
    v_source_movement.warehouse_id,
    v_source_movement.warehouse_name,
    v_source_movement.item_type,
    v_source_movement.stock_item_id,
    v_source_movement.semi_item_id,
    v_source_movement.item_name,
    v_source_movement.item_sku,
    v_source_movement.unit,
    v_source_movement.unit_factor,
    'transfer_in',
    'transfer',
    'in',
    now(),
    v_qty,
    v_task.id,
    NULL,
    NULL,
    NULL,
    v_out_movement_id,
    v_source_movement.unit_cost,
    v_qty * v_source_movement.unit_cost,
    v_source_movement.currency_code,
    v_target_location_id,
    v_source_movement.lpn_id,
    v_source_movement.lot_number,
    v_source_movement.expiration_date,
    jsonb_build_object(
      'warehouse_task_id', p_task_id,
      'availability_status', 'available',
      'source_movement_id', v_source_movement_id
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 5. Görevi güncelle
  UPDATE public.warehouse_tasks
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      meta = jsonb_set(
        jsonb_set(meta, '{target_location_id}', to_jsonb(v_target_location_id::text)),
        '{completed_by}', to_jsonb(COALESCE(p_personnel_id, ''))
      )
  WHERE id = p_task_id;

  -- 6. Olay kaydı ekle
  INSERT INTO public.warehouse_task_events (
    task_id,
    event_type,
    from_status,
    to_status,
    personnel_id,
    payload
  ) VALUES (
    p_task_id,
    'completed',
    v_task.status,
    'done',
    p_personnel_id,
    jsonb_build_object(
      'target_location_id', v_target_location_id,
      'out_movement_id', v_out_movement_id,
      'in_movement_id', v_in_movement_id,
      'quantity', v_qty
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'out_movement_id', v_out_movement_id,
    'in_movement_id', v_in_movement_id
  );
END;
$$;

-- Trigger and trigger function for automatic putaway task creation on inventory_movements insert
CREATE OR REPLACE FUNCTION public.inventory_movements_create_putaway_task_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_default_location_id UUID;
  v_item_name TEXT;
  v_unit TEXT;
BEGIN
  -- 1. availability_status 'putaway_pending' kontrolü yap
  IF NEW.meta IS NOT NULL AND NEW.meta->>'availability_status' = 'putaway_pending' THEN

    -- 2. Varsayılan lokasyonu stock_item_warehouse_settings tablosundan sorgula
    SELECT default_location_id INTO v_default_location_id
    FROM public.stock_item_warehouse_settings
    WHERE stock_item_id = NEW.stock_item_id AND branch_id = NEW.branch_id;

    -- 3. Ürün adını ve birimini al
    v_item_name := NEW.item_name;
    v_unit := NEW.unit;

    -- 4. warehouse_tasks tablosuna putaway görevini insert et
    INSERT INTO public.warehouse_tasks (
      branch_id,
      task_type,
      status,
      priority,
      source_doc_type,
      source_doc_id,
      source_line_id,
      description,
      meta
    ) VALUES (
      NEW.branch_id,
      'putaway',
      'pending',
      'normal',
      'purchase_receipt',
      NEW.source_doc_id,
      NEW.source_doc_line_id,
      v_item_name || ' (' || NEW.quantity::TEXT || ' ' || COALESCE(v_unit, 'Adet') || ') Putaway Görevi',
      jsonb_build_object(
        'source_movement_id', NEW.id,
        'stock_item_id', NEW.stock_item_id,
        'quantity', NEW.quantity,
        'from_location_id', NEW.location_id,
        'target_location_id', v_default_location_id,
        'lot_number', NEW.lot_number,
        'expiration_date', NEW.expiration_date,
        'lpn_id', NEW.lpn_id
      )
    );

  END IF;

  RETURN NEW;
END;
$$;

-- Trigger'ı oluştur
DROP TRIGGER IF EXISTS trg_wms_create_putaway_task ON public.inventory_movements;
CREATE TRIGGER trg_wms_create_putaway_task
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.inventory_movements_create_putaway_task_trigger();

-- Trigger for automatic pick task creation, complete shipment task RPC, and updated confirm/cancel shipment RPCs
-- 1. Trigger function to create pick tasks upon shipment line creation
CREATE OR REPLACE FUNCTION public.wms_create_pick_tasks_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pick RECORD;
  v_item_name TEXT;
  v_unit TEXT;
  v_shipment_no TEXT;
  v_branch_id UUID;
BEGIN
  -- Select shipment info
  SELECT shipment_no, source_branch_id INTO v_shipment_no, v_branch_id
  FROM public.warehouse_shipments
  WHERE id = NEW.shipment_id;

  SELECT name, unit INTO v_item_name, v_unit
  FROM public.stock_items
  WHERE id = NEW.stock_item_id;

  -- Loop over picks array in meta and insert a pick task for each entry
  IF NEW.meta IS NOT NULL AND NEW.meta ? 'picks' AND jsonb_typeof(NEW.meta->'picks') = 'array' THEN
    FOR v_pick IN
      SELECT * FROM jsonb_to_recordset(NEW.meta->'picks')
      AS x(reservation_id UUID, location_id UUID, lpn_id UUID, lot_number TEXT, expiration_date DATE, qty NUMERIC)
    LOOP
      IF v_pick.qty > 0 THEN
        INSERT INTO public.warehouse_tasks (
          branch_id,
          task_type,
          status,
          priority,
          source_doc_type,
          source_doc_id,
          source_line_id,
          description,
          meta
        ) VALUES (
          v_branch_id,
          'pick',
          'pending',
          'normal',
          'warehouse_shipment',
          NEW.shipment_id,
          NEW.id,
          COALESCE(v_item_name, 'Bilinmeyen Ürün') || ' (' || v_pick.qty::TEXT || ' ' || COALESCE(v_unit, 'Adet') || ') Toplama Görevi - Sevk: ' || COALESCE(v_shipment_no, ''),
          jsonb_build_object(
            'reservation_id', v_pick.reservation_id,
            'location_id', v_pick.location_id,
            'lpn_id', v_pick.lpn_id,
            'lot_number', v_pick.lot_number,
            'expiration_date', v_pick.expiration_date,
            'quantity', v_pick.qty,
            'stock_item_id', NEW.stock_item_id
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wms_create_pick_tasks ON public.warehouse_shipment_lines;
CREATE TRIGGER trg_wms_create_pick_tasks
  AFTER INSERT ON public.warehouse_shipment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.wms_create_pick_tasks_trigger();

-- 2. Complete warehouse shipment task (pick/pack/load) RPC
CREATE OR REPLACE FUNCTION public.complete_warehouse_shipment_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_picked_qty NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_shipment public.warehouse_shipments%ROWTYPE;
  v_res_id UUID;
  v_shipment_line_id UUID;
  v_diff_qty NUMERIC;
  v_picked_qty NUMERIC := p_picked_qty;
  v_req_qty NUMERIC;
  v_next_status TEXT;
  v_next_task_id UUID;
  v_pack_required BOOLEAN := false;
  v_load_required BOOLEAN := false;
BEGIN
  -- 1. Lock and retrieve task
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Görev zaten tamamlanmış veya iptal edilmiş.';
  END IF;

  -- 2. Lock and retrieve shipment to check pipeline options
  SELECT * INTO v_shipment
  FROM public.warehouse_shipments
  WHERE id = v_task.source_doc_id
  FOR UPDATE;

  v_pack_required := COALESCE((v_shipment.meta->>'pack_required')::BOOLEAN, false);
  v_load_required := COALESCE((v_shipment.meta->>'load_required')::BOOLEAN, false);

  -- 3. Handle task type execution
  IF v_task.task_type = 'pick' THEN
    v_res_id := (v_task.meta->>'reservation_id')::UUID;
    v_shipment_line_id := v_task.source_line_id;
    v_req_qty := (v_task.meta->>'quantity')::NUMERIC;

    IF v_picked_qty IS NULL THEN
      v_picked_qty := v_req_qty;
    END IF;

    IF v_picked_qty < 0 OR v_picked_qty > v_req_qty THEN
      RAISE EXCEPTION 'Geçersiz toplama miktarı: %. İstenen miktar: %', v_picked_qty, v_req_qty;
    END IF;

    -- If picking was incomplete, update reservations, PO lines, and shipment line quantity
    IF v_picked_qty < v_req_qty THEN
      v_diff_qty := v_req_qty - v_picked_qty;

      -- A) Update reservation
      IF v_picked_qty = 0 THEN
        UPDATE public.warehouse_reservations
        SET status = 'cancelled', reserved_qty = 0, updated_at = now()
        WHERE id = v_res_id;
      ELSE
        UPDATE public.warehouse_reservations
        SET reserved_qty = v_picked_qty, updated_at = now()
        WHERE id = v_res_id;
      END IF;

      -- B) Update shipment line shipped_qty and meta.picks
      UPDATE public.warehouse_shipment_lines
      SET shipped_qty = shipped_qty - v_diff_qty,
          line_total = (shipped_qty - v_diff_qty) * unit_price,
          meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
            'picks',
            COALESCE(
              (
                SELECT jsonb_agg(
                  CASE
                    WHEN (x->>'reservation_id')::UUID = v_res_id THEN
                      CASE WHEN v_picked_qty = 0 THEN NULL ELSE x || jsonb_build_object('qty', v_picked_qty) END
                    ELSE x
                  END
                )
                FROM jsonb_array_elements(meta->'picks') AS x
                WHERE x IS NOT NULL AND (CASE WHEN (x->>'reservation_id')::UUID = v_res_id AND v_picked_qty = 0 THEN false ELSE true END)
              ),
              '[]'::jsonb
            )
          )
      WHERE id = v_shipment_line_id;

      -- C) Update purchase order line and recalculate PO totals
      DECLARE
        v_po_line_id UUID;
        v_order_id UUID;
        v_po_line_meta JSONB;
        v_po_line_ordered_qty NUMERIC;
      BEGIN
        SELECT purchase_order_line_id INTO v_po_line_id
        FROM public.warehouse_shipment_lines
        WHERE id = v_shipment_line_id;

        SELECT order_id, meta, ordered_qty INTO v_order_id, v_po_line_meta, v_po_line_ordered_qty
        FROM public.purchase_order_lines
        WHERE id = v_po_line_id;

        IF v_po_line_meta IS NULL THEN
          v_po_line_meta := '{}'::jsonb;
        END IF;

        IF NOT (v_po_line_meta ? 'original_ordered_qty') THEN
          v_po_line_meta := v_po_line_meta || jsonb_build_object('original_ordered_qty', v_po_line_ordered_qty);
        END IF;

        UPDATE public.purchase_order_lines
        SET ordered_qty = ordered_qty - v_diff_qty,
            line_total = (ordered_qty - v_diff_qty) * unit_price,
            meta = v_po_line_meta,
            updated_at = now()
        WHERE id = v_po_line_id;

        UPDATE public.purchase_orders
        SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
            total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
            subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
            updated_at = now()
        WHERE id = v_order_id;
      END;

      v_next_status := 'exception';
    ELSE
      v_next_status := 'done';
    END IF;

    -- Update pick task status
    UPDATE public.warehouse_tasks
    SET status = v_next_status,
        completed_at = now(),
        updated_at = now(),
        meta = meta || jsonb_build_object('picked_qty', v_picked_qty, 'completed_by', p_personnel_id)
    WHERE id = p_task_id;

    -- Add event record
    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id, payload)
    VALUES (p_task_id, 'completed', v_task.status, v_next_status, p_personnel_id, jsonb_build_object('picked_qty', v_picked_qty, 'requested_qty', v_req_qty));

    -- D) Trigger Pack/Load pipelines if picked quantity > 0
    IF v_picked_qty > 0 THEN
      IF v_pack_required THEN
        INSERT INTO public.warehouse_tasks (
          branch_id, task_type, status, priority, source_doc_type, source_doc_id, source_line_id, description, meta
        ) VALUES (
          v_task.branch_id, 'pack', 'pending', 'normal', 'warehouse_shipment', v_task.source_doc_id, v_task.source_line_id,
          'Paketleme/Kontrol Görevi - Line: ' || v_task.source_line_id::TEXT,
          jsonb_build_object('parent_task_id', p_task_id, 'quantity', v_picked_qty, 'stock_item_id', v_task.meta->'stock_item_id')
        ) RETURNING id INTO v_next_task_id;
      ELSIF v_load_required THEN
        INSERT INTO public.warehouse_tasks (
          branch_id, task_type, status, priority, source_doc_type, source_doc_id, source_line_id, description, meta
        ) VALUES (
          v_task.branch_id, 'load', 'pending', 'normal', 'warehouse_shipment', v_task.source_doc_id, v_task.source_line_id,
          'Yükleme Görevi - Line: ' || v_task.source_line_id::TEXT,
          jsonb_build_object('parent_task_id', p_task_id, 'quantity', v_picked_qty, 'stock_item_id', v_task.meta->'stock_item_id')
        ) RETURNING id INTO v_next_task_id;
      END IF;
    END IF;

  ELSIF v_task.task_type = 'pack' THEN
    UPDATE public.warehouse_tasks
    SET status = 'done', completed_at = now(), updated_at = now(), meta = meta || jsonb_build_object('completed_by', p_personnel_id)
    WHERE id = p_task_id;

    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id)
    VALUES (p_task_id, 'completed', v_task.status, 'done', p_personnel_id);

    IF v_load_required THEN
      INSERT INTO public.warehouse_tasks (
        branch_id, task_type, status, priority, source_doc_type, source_doc_id, source_line_id, description, meta
      ) VALUES (
        v_task.branch_id, 'load', 'pending', 'normal', 'warehouse_shipment', v_task.source_doc_id, v_task.source_line_id,
        'Yükleme Görevi - Line: ' || v_task.source_line_id::TEXT,
        jsonb_build_object('parent_task_id', p_task_id, 'quantity', v_task.meta->'quantity', 'stock_item_id', v_task.meta->'stock_item_id')
      ) RETURNING id INTO v_next_task_id;
    END IF;

  ELSIF v_task.task_type = 'load' THEN
    UPDATE public.warehouse_tasks
    SET status = 'done', completed_at = now(), updated_at = now(), meta = meta || jsonb_build_object('completed_by', p_personnel_id)
    WHERE id = p_task_id;

    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id)
    VALUES (p_task_id, 'completed', v_task.status, 'done', p_personnel_id);

  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'next_task_id', v_next_task_id,
    'status', COALESCE(v_next_status, 'done')
  );
END;
$$;

-- 3. Define or replace the shipment capacity calculation RPC
CREATE OR REPLACE FUNCTION public.get_warehouse_shipment_capacity(p_shipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment public.warehouse_shipments%ROWTYPE;
  v_vehicle public.vehicles%ROWTYPE;
  v_total_vol NUMERIC;
  v_total_weight NUMERIC;
  v_mismatched_items JSONB := '[]'::jsonb;
  v_is_temp_mismatched BOOLEAN := false;
  v_is_volume_exceeded BOOLEAN := false;
  v_is_weight_exceeded BOOLEAN := false;
  v_is_exceeded BOOLEAN := false;
  v_is_override_active BOOLEAN := false;
  v_vehicle_temp TEXT;
BEGIN
  -- Get shipment
  SELECT * INTO v_shipment FROM public.warehouse_shipments WHERE id = p_shipment_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sevkiyat bulunamadı');
  END IF;

  -- Get vehicle if exists
  IF v_shipment.vehicle_id IS NOT NULL THEN
    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_shipment.vehicle_id;
  END IF;

  -- Sum shipment lines metrics
  SELECT
    COALESCE(SUM(line_volume_m3), 0),
    COALESCE(SUM(line_gross_weight_kg), 0)
  INTO v_total_vol, v_total_weight
  FROM public.warehouse_shipment_lines
  WHERE shipment_id = p_shipment_id AND deleted_at IS NULL;

  -- Check override state
  IF COALESCE(v_shipment.meta->>'capacity_override', 'false') = 'true' THEN
    v_is_override_active := true;
  END IF;

  -- Temperature checks
  IF v_vehicle.id IS NOT NULL THEN
    v_vehicle_temp := COALESCE(v_vehicle.temperature_class, 'dry');

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stock_item_id', m.stock_item_id,
      'item_name', m.item_name,
      'item_temp', m.item_temp,
      'vehicle_temp', m.vehicle_temp
    )), '[]'::jsonb)
    INTO v_mismatched_items
    FROM (
      SELECT
        wsl.stock_item_id,
        si.name AS item_name,
        COALESCE(si.temperature_class, 'dry') AS item_temp,
        v_vehicle_temp AS vehicle_temp
      FROM public.warehouse_shipment_lines wsl
      JOIN public.stock_items si ON si.id = wsl.stock_item_id
      WHERE wsl.shipment_id = p_shipment_id
        AND wsl.deleted_at IS NULL
        AND (
          (v_vehicle_temp = 'dry' AND COALESCE(si.temperature_class, 'dry') NOT IN ('dry'))
          OR
          (v_vehicle_temp = 'cold' AND COALESCE(si.temperature_class, 'dry') NOT IN ('cold', 'dry'))
          OR
          (v_vehicle_temp = 'frozen' AND COALESCE(si.temperature_class, 'dry') NOT IN ('frozen'))
          -- 'multi_temp' allows everything
        )
    ) m;

    IF jsonb_array_length(v_mismatched_items) > 0 THEN
      v_is_temp_mismatched := true;
    END IF;

    -- Volume limit check
    IF v_vehicle.max_volume_m3 IS NOT NULL AND v_vehicle.max_volume_m3 > 0 AND v_total_vol > v_vehicle.max_volume_m3 THEN
      v_is_volume_exceeded := true;
    END IF;

    -- Weight limit check
    IF v_vehicle.max_weight_kg IS NOT NULL AND v_vehicle.max_weight_kg > 0 AND v_total_weight > v_vehicle.max_weight_kg THEN
      v_is_weight_exceeded := true;
    END IF;

    IF v_is_volume_exceeded OR v_is_weight_exceeded THEN
      v_is_exceeded := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'shipment_id', p_shipment_id,
    'vehicle_id', v_shipment.vehicle_id,
    'plate_number', COALESCE(v_vehicle.plate_number, v_shipment.plate_number),
    'total_volume_m3', round(v_total_vol::numeric, 4),
    'total_weight_kg', round(v_total_weight::numeric, 2),
    'vehicle_max_volume_m3', COALESCE(v_vehicle.max_volume_m3, 0),
    'vehicle_max_weight_kg', COALESCE(v_vehicle.max_weight_kg, 0),
    'remaining_volume_m3', round((COALESCE(v_vehicle.max_volume_m3, 0) - v_total_vol)::numeric, 4),
    'remaining_weight_kg', round((COALESCE(v_vehicle.max_weight_kg, 0) - v_total_weight)::numeric, 2),
    'is_volume_exceeded', v_is_volume_exceeded,
    'is_weight_exceeded', v_is_weight_exceeded,
    'is_exceeded', v_is_exceeded,
    'is_temperature_mismatched', v_is_temp_mismatched,
    'mismatched_items', v_mismatched_items,
    'is_override_active', v_is_override_active,
    'override_details', CASE WHEN v_is_override_active THEN v_shipment.meta ELSE NULL END
  );
END;
$$;

-- 4. Redefine confirm_warehouse_shipment to enforce capacity and temperature limits
CREATE OR REPLACE FUNCTION public.confirm_warehouse_shipment(
  p_shipment_id UUID,
  p_branch_id UUID,
  p_branch_name TEXT
) RETURNS VOID AS $$
DECLARE
  v_shipment_no TEXT;
  v_source_branch_id UUID;
  v_plate_number TEXT;
  v_driver_info TEXT;
  v_notes TEXT;
  v_status TEXT;
  v_line RECORD;
  v_pick RECORD;
  v_order RECORD;
  v_meta JSONB;
  v_next_meta JSONB;

  -- locked reservation fields
  v_res_id UUID;
  v_res_location_id UUID;
  v_res_lpn_id UUID;
  v_res_lot_number TEXT;
  v_res_expiration_date DATE;
  v_res_qty NUMERIC;
  v_res_status TEXT;
BEGIN
  -- 1. Select and lock the shipment row to enforce idempotency
  SELECT shipment_no, source_branch_id, plate_number, driver_info, notes, status, meta
  INTO v_shipment_no, v_source_branch_id, v_plate_number, v_driver_info, v_notes, v_status, v_meta
  FROM public.warehouse_shipments
  WHERE id = p_shipment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sevkiyat bulunamadı.';
  END IF;

  IF v_source_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'Yetkisiz depo işlemi: Sevkiyat deposu ile aktif depo uyuşmuyor.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Sevkiyat taslak durumunda değil (Mevcut durum: %).', v_status;
  END IF;

  -- WMS-02C Guard: Verify all warehouse tasks related to this shipment are completed
  IF EXISTS (
    SELECT 1
    FROM public.warehouse_tasks
    WHERE source_doc_type = 'warehouse_shipment'
      AND source_doc_id = p_shipment_id
      AND status NOT IN ('done', 'cancelled', 'exception')
  ) THEN
    RAISE EXCEPTION 'Bu sevkiyata bağlı tamamlanmamış depo görevleri (toplama, paketleme vb.) bulunmaktadır. Lütfen önce görevleri tamamlayın.';
  END IF;

  -- WMS-04G Capacity & Temperature Check
  DECLARE
    v_capacity_check JSONB;
  BEGIN
    v_capacity_check := public.get_warehouse_shipment_capacity(p_shipment_id);
    IF (v_capacity_check->>'is_exceeded')::BOOLEAN OR (v_capacity_check->>'is_temperature_mismatched')::BOOLEAN THEN
      IF COALESCE(v_meta->>'capacity_override', 'false') <> 'true' THEN
        IF (v_capacity_check->>'is_temperature_mismatched')::BOOLEAN THEN
          RAISE EXCEPTION 'Araç sıcaklık sınıfı ile sevk edilecek ürünlerin sıcaklık gereksinimleri uyuşmuyor. Onay için yönetici yetkilendirmesi (override) gerekmektedir.';
        ELSE
          RAISE EXCEPTION 'Araç taşıma kapasitesi (hacim veya ağırlık) aşılmıştır. Onay için yönetici yetkilendirmesi (override) gerekmektedir.';
        END IF;
      END IF;
    END IF;
  END;

  -- 2. Update status to 'in_transit'
  UPDATE public.warehouse_shipments
  SET status = 'in_transit',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_shipment_id;

  -- 3. Loop over shipment lines and generate stock exits
  FOR v_line IN
    SELECT wsl.*, si.name AS item_name
    FROM public.warehouse_shipment_lines wsl
    LEFT JOIN public.stock_items si ON si.id = wsl.stock_item_id
    WHERE wsl.shipment_id = p_shipment_id AND wsl.deleted_at IS NULL
  LOOP
    IF v_line.shipped_qty > 0 THEN
      -- Check if meta has 'picks' array
      IF v_line.meta ? 'picks' AND jsonb_typeof(v_line.meta->'picks') = 'array' THEN
        -- Loop over picks
        FOR v_pick IN
          SELECT * FROM jsonb_to_recordset(v_line.meta->'picks')
          AS x(location_id UUID, lpn_id UUID, lot_number TEXT, expiration_date DATE, qty NUMERIC, reservation_id UUID)
        LOOP
          IF v_pick.qty > 0 THEN
            -- Check reservation existence
            IF v_pick.reservation_id IS NULL THEN
              RAISE EXCEPTION 'Sevkiyat satırında rezervasyon ID bilgisi bulunmamaktadır.';
            END IF;

            -- Select and lock the reservation row
            SELECT id, location_id, lpn_id, lot_number, expiration_date, reserved_qty, status
            INTO v_res_id, v_res_location_id, v_res_lpn_id, v_res_lot_number, v_res_expiration_date, v_res_qty, v_res_status
            FROM public.warehouse_reservations
            WHERE id = v_pick.reservation_id
            FOR UPDATE;

            IF NOT FOUND THEN
              RAISE EXCEPTION 'İlgili rezervasyon bulunamadı (ID: %).', v_pick.reservation_id;
            END IF;

            IF v_res_status <> 'active' THEN
              RAISE EXCEPTION 'Rezervasyon aktif değil (ID: %, Durum: %).', v_pick.reservation_id, v_res_status;
            END IF;

            IF v_res_qty <> v_pick.qty THEN
              RAISE EXCEPTION 'Rezervasyon miktarı ile sevk miktarı uyuşmuyor (Rezervasyon: %, Sevk: %).', v_res_qty, v_pick.qty;
            END IF;

            -- Insert inventory movement (without generated quantity_signed and total_cost_signed columns)
            INSERT INTO public.inventory_movements (
              item_type,
              stock_item_id,
              item_name,
              branch_id,
              branch_name,
              movement_type,
              source_doc_type,
              direction,
              movement_at,
              quantity,
              unit_cost,
              total_cost,
              location_id,
              lpn_id,
              lot_number,
              expiration_date,
              meta
            ) VALUES (
              'stock_item',
              v_line.stock_item_id,
              COALESCE(v_line.item_name, 'Bilinmeyen Ürün'),
              p_branch_id,
              p_branch_name,
              'transfer_out',
              'transfer',
              'out',
              now(),
              v_pick.qty,
              v_line.unit_price,
              v_pick.qty * v_line.unit_price,
              v_pick.location_id,
              v_pick.lpn_id,
              v_pick.lot_number,
              v_pick.expiration_date,
              jsonb_build_object(
                'shipment_id', p_shipment_id,
                'shipment_no', v_shipment_no,
                'availability_status', 'available'
              )
            );

            -- Consume reservation
            UPDATE public.warehouse_reservations
            SET status = 'consumed',
                consumed_at = now(),
                updated_at = now()
            WHERE id = v_res_id;
          END IF;
        END LOOP;
      ELSE
        -- Fallback if no picks array
        INSERT INTO public.inventory_movements (
          item_type,
          stock_item_id,
          item_name,
          branch_id,
          branch_name,
          movement_type,
          source_doc_type,
          direction,
          movement_at,
          quantity,
          unit_cost,
          total_cost,
          meta
        ) VALUES (
          'stock_item',
          v_line.stock_item_id,
          COALESCE(v_line.item_name, 'Bilinmeyen Ürün'),
          p_branch_id,
          p_branch_name,
          'transfer_out',
          'transfer',
          'out',
          now(),
          v_line.shipped_qty,
          v_line.unit_price,
          v_line.shipped_qty * v_line.unit_price,
          jsonb_build_object(
            'shipment_id', p_shipment_id,
            'shipment_no', v_shipment_no,
            'availability_status', 'available'
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- 4. Complete associated purchase orders if fully shipped
  FOR v_order IN
    SELECT po.id, po.status
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND po.deleted_at IS NULL
  LOOP
    -- check if all lines of this purchase order are shipped/satisfied
    UPDATE public.purchase_orders
    SET updated_at = now()
    WHERE id = v_order.id;
  END LOOP;

  -- 5. Complete all finished WMS tasks related to this shipment (if any are still 'doing')
  UPDATE public.warehouse_tasks
  SET status = 'done',
      completed_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status IN ('doing', 'todo');
END;
$$ LANGUAGE plpgsql;

-- 4. Updated cancel_warehouse_shipment RPC with tasks cancellation logic
CREATE OR REPLACE FUNCTION public.cancel_warehouse_shipment(
  p_shipment_id UUID,
  p_branch_id UUID
) RETURNS VOID AS $$
DECLARE
  v_source_branch_id UUID;
  v_status TEXT;
  v_line RECORD;
  v_po_line RECORD;
  v_order RECORD;
  v_meta JSONB;
  v_orig_qty NUMERIC;
BEGIN
  -- 1. Select and lock the shipment row
  SELECT source_branch_id, status
  INTO v_source_branch_id, v_status
  FROM public.warehouse_shipments
  WHERE id = p_shipment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sevkiyat bulunamadı.';
  END IF;

  IF v_source_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'Yetkisiz depo işlemi: Sevkiyat deposu ile aktif depo uyuşmuyor.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Yalnızca taslak durumundaki sevkiyatlar iptal edilebilir (Mevcut durum: %).', v_status;
  END IF;

  -- 2. Update shipment status to 'cancelled'
  UPDATE public.warehouse_shipments
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_shipment_id;

  -- 2b. Cancel all associated active WMS tasks
  UPDATE public.warehouse_tasks
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status NOT IN ('done', 'cancelled', 'exception');

  -- 3. Release/cancel all associated active reservations
  UPDATE public.warehouse_reservations
  SET status = 'cancelled',
      released_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status = 'active';

  -- 4. Restore original quantities to purchase order lines
  FOR v_line IN
    SELECT * FROM public.warehouse_shipment_lines
    WHERE shipment_id = p_shipment_id AND deleted_at IS NULL
  LOOP
    SELECT * INTO v_po_line
    FROM public.purchase_order_lines
    WHERE id = v_line.purchase_order_line_id AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      v_meta := COALESCE(v_po_line.meta, '{}'::jsonb);
      IF v_meta ? 'original_ordered_qty' THEN
        v_orig_qty := (v_meta->>'original_ordered_qty')::NUMERIC;

        -- Delete the original_ordered_qty property from the metadata object
        v_meta := v_meta - 'original_ordered_qty';

        UPDATE public.purchase_order_lines
        SET ordered_qty = v_orig_qty,
            line_total = v_orig_qty * unit_price,
            meta = v_meta,
            updated_at = now()
        WHERE id = v_po_line.id;
      END IF;
    END IF;
  END LOOP;

  -- 5. Recalculate purchase order totals for associated orders
  FOR v_order IN
    SELECT po.*
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND wso.deleted_at IS NULL
  LOOP
    UPDATE public.purchase_orders
    SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        updated_at = now()
    WHERE id = v_order.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5. Shipment Status Guard Trigger
CREATE OR REPLACE FUNCTION public.wms_shipment_status_guard_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status transitions to ready_to_load or in_transit, all pick tasks must be completed/cancelled
  IF NEW.status IN ('ready_to_load', 'in_transit') THEN
    IF EXISTS (
      SELECT 1
      FROM public.warehouse_tasks
      WHERE source_doc_type = 'warehouse_shipment'
        AND source_doc_id = NEW.id
        AND task_type = 'pick'
        AND status NOT IN ('done', 'cancelled', 'exception')
    ) THEN
      RAISE EXCEPTION 'Bu sevkiyata bağlı tamamlanmamış toplama (pick) görevleri bulunmaktadır. Sevkiyat durumu % yapılamaz.', NEW.status;
    END IF;
  END IF;

  -- If status transitions to in_transit (confirm_warehouse_shipment), all warehouse tasks (pick, pack, load) must be completed/cancelled
  IF NEW.status = 'in_transit' THEN
    IF EXISTS (
      SELECT 1
      FROM public.warehouse_tasks
      WHERE source_doc_type = 'warehouse_shipment'
        AND source_doc_id = NEW.id
        AND status NOT IN ('done', 'cancelled', 'exception')
    ) THEN
      RAISE EXCEPTION 'Bu sevkiyata bağlı tamamlanmamış depo görevleri (toplama, paketleme, yükleme vb.) bulunmaktadır. Lütfen önce görevleri tamamlayın.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wms_shipment_status_guard ON public.warehouse_shipments;
CREATE TRIGGER trg_wms_shipment_status_guard
  BEFORE UPDATE OF status ON public.warehouse_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.wms_shipment_status_guard_trigger();

-- RPC for resolving warehouse task exceptions atomically
CREATE OR REPLACE FUNCTION public.resolve_warehouse_task_exception(
  p_task_id UUID,
  p_action TEXT,
  p_note TEXT,
  p_personnel_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_next_status TEXT;
  v_res_id UUID;
  v_meta JSONB;
  v_event_type TEXT;
BEGIN
  -- 1. Select and lock the task row
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.status <> 'exception' THEN
    RAISE EXCEPTION 'Bu işlem sadece sorunlu (exception) durumundaki görevler için geçerlidir. Görev durumu: %', v_task.status;
  END IF;

  IF p_action NOT IN ('retry', 'cancel') THEN
    RAISE EXCEPTION 'Geçersiz aksiyon: %. Sadece retry veya cancel kabul edilir.', p_action;
  END IF;

  IF p_note IS NULL OR trim(p_note) = '' THEN
    RAISE EXCEPTION 'Çözüm notu zorunludur.';
  END IF;

  -- 2. Determine next status and event type
  IF p_action = 'retry' THEN
    v_next_status := 'pending';
    v_event_type := 'exception_resolved_retry';
  ELSE
    v_next_status := 'cancelled';
    v_event_type := 'exception_resolved_cancel';
  END IF;

  -- 3. If action is cancel and task type is pick, cancel the reservation
  IF p_action = 'cancel' AND v_task.task_type = 'pick' THEN
    v_res_id := (v_task.meta->>'reservation_id')::UUID;
    IF v_res_id IS NOT NULL THEN
      UPDATE public.warehouse_reservations
      SET status = 'cancelled',
          released_at = now(),
          updated_at = now()
      WHERE id = v_res_id;
    END IF;
  END IF;

  -- 4. Update task status and meta
  v_meta := COALESCE(v_task.meta, '{}'::jsonb) || jsonb_build_object(
    'exception_resolved', true,
    'resolution_note', p_note,
    'resolved_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'resolved_by', p_personnel_id
  );

  UPDATE public.warehouse_tasks
  SET status = v_next_status,
      meta = v_meta,
      updated_at = now()
  WHERE id = p_task_id;

  -- 5. Insert audit event record
  INSERT INTO public.warehouse_task_events (
    task_id,
    event_type,
    from_status,
    to_status,
    personnel_id,
    payload
  ) VALUES (
    p_task_id,
    v_event_type,
    'exception',
    v_next_status,
    p_personnel_id,
    jsonb_build_object('note', p_note)
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'status', v_next_status
  );
END;
$$;


-- Migration: WMS Phase 4 - Quality hold schema and resolution (WMS-04A)

CREATE TABLE IF NOT EXISTS public.warehouse_quality_holds (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.company_nodes(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  movement_id UUID REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  lot_number TEXT,
  expiration_date DATE,
  hold_qty NUMERIC(18,4) NOT NULL,
  status TEXT DEFAULT 'hold' NOT NULL,
  reason TEXT,
  source_task_id UUID REFERENCES public.warehouse_tasks(id) ON DELETE SET NULL,
  source_event_id UUID REFERENCES public.warehouse_task_events(id) ON DELETE SET NULL,
  evidence_photo_url TEXT,
  released_by TEXT,
  released_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_quality_holds_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_quality_holds_status_check CHECK (status IN ('hold', 'released', 'rejected', 'scrapped'))
);

CREATE INDEX IF NOT EXISTS idx_warehouse_quality_holds_branch ON public.warehouse_quality_holds(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_quality_holds_stock_item ON public.warehouse_quality_holds(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_quality_holds_status ON public.warehouse_quality_holds(status);

-- Trigger function to automatically create a quality hold on quarantine movements
CREATE OR REPLACE FUNCTION public.trg_create_quality_hold_on_quarantine_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_task_id UUID;
  v_event_id UUID;
  v_evidence_photo_url TEXT;
  v_reason TEXT;
BEGIN
  -- We only create a hold for 'in' direction quarantine movements
  IF NEW.direction = 'in' AND COALESCE(NEW.meta->>'availability_status', '') = 'quarantine' THEN
    -- Check if source doc is a warehouse task
    IF NEW.source_doc_type = 'warehouse_task' OR NEW.source_doc_type = 'transfer' THEN
      v_task_id := NEW.source_doc_id;
    END IF;

    -- Validate that the task actually exists
    IF v_task_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.warehouse_tasks WHERE id = v_task_id) THEN
        v_task_id := NULL;
      END IF;
    END IF;

    -- Fallback to meta warehouse_task_id if available
    IF v_task_id IS NULL AND NEW.meta ? 'warehouse_task_id' THEN
      v_task_id := (NEW.meta->>'warehouse_task_id')::UUID;
    END IF;

    -- If we have a valid task, look up the latest event for evidence photo and notes
    IF v_task_id IS NOT NULL THEN
      SELECT id, payload->>'evidence_photo_url', payload->>'note'
      INTO v_event_id, v_evidence_photo_url, v_reason
      FROM public.warehouse_task_events
      WHERE task_id = v_task_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    -- Create quality hold record
    INSERT INTO public.warehouse_quality_holds (
      branch_id,
      stock_item_id,
      movement_id,
      location_id,
      lpn_id,
      lot_number,
      expiration_date,
      hold_qty,
      status,
      reason,
      source_task_id,
      source_event_id,
      evidence_photo_url,
      meta
    ) VALUES (
      NEW.branch_id,
      NEW.stock_item_id,
      NEW.id,
      NEW.location_id,
      NEW.lpn_id,
      NEW.lot_number,
      NEW.expiration_date,
      NEW.quantity,
      'hold',
      COALESCE(v_reason, NEW.meta->>'reason', 'Mal Kabul Karantina Girişi'),
      v_task_id,
      v_event_id,
      v_evidence_photo_url,
      COALESCE(NEW.meta, '{}'::jsonb)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind trigger to inventory_movements table
DROP TRIGGER IF EXISTS after_inventory_movement_quarantine ON public.inventory_movements;
CREATE TRIGGER after_inventory_movement_quarantine
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_quality_hold_on_quarantine_movement();


-- RPC to resolve quality holds (release/reject/scrap)
CREATE OR REPLACE FUNCTION public.resolve_warehouse_quality_hold(
  p_hold_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_personnel_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hold public.warehouse_quality_holds%ROWTYPE;
  v_out_movement_id UUID;
  v_in_movement_id UUID;
  v_movement public.inventory_movements%ROWTYPE;
  v_target_status TEXT;
  v_movement_type_out TEXT;
  v_movement_type_in TEXT;
  v_dir_out TEXT := 'out';
  v_dir_in TEXT := 'in';
BEGIN
  -- 1. Lock and retrieve quality hold record
  SELECT * INTO v_hold
  FROM public.warehouse_quality_holds
  WHERE id = p_hold_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kalite hold kaydı bulunamadı (ID: %)', p_hold_id;
  END IF;

  IF v_hold.status <> 'hold' THEN
    RAISE EXCEPTION 'Bu işlem sadece beklemede (hold) olan kayıtlar için geçerlidir. Mevcut durum: %', v_hold.status;
  END IF;

  IF p_action NOT IN ('release', 'reject', 'scrap') THEN
    RAISE EXCEPTION 'Geçersiz aksiyon: %. Sadece release, reject veya scrap kabul edilir.', p_action;
  END IF;

  -- Get source inventory movement to copy attributes
  SELECT * INTO v_movement
  FROM public.inventory_movements
  WHERE id = v_hold.movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kaynak stok hareketi bulunamadı.';
  END IF;

  -- 2. Determine target status and movement types
  IF p_action = 'release' THEN
    v_target_status := 'released';
    v_movement_type_out := 'transfer_out';
    v_movement_type_in := 'transfer_in';
  ELSIF p_action = 'reject' THEN
    v_target_status := 'rejected';
    v_movement_type_out := 'supplier_return';
  ELSE
    v_target_status := 'scrapped';
    v_movement_type_out := 'waste_consumption';
  END IF;

  -- Generate UUIDs for movements
  v_out_movement_id := gen_random_uuid();
  v_in_movement_id := gen_random_uuid();

  -- 3. Create OUT movement to reduce quarantine stock
  INSERT INTO public.inventory_movements (
    id,
    company_id,
    legal_entity_id,
    org_unit_id,
    branch_id,
    branch_name,
    warehouse_id,
    warehouse_name,
    item_type,
    stock_item_id,
    semi_item_id,
    item_name,
    item_sku,
    unit,
    unit_factor,
    movement_type,
    source_doc_type,
    direction,
    movement_at,
    quantity,
    source_doc_id,
    source_doc_line_id,
    source_doc_no,
    source_doc_ref,
    transfer_pair_id,
    unit_cost,
    total_cost,
    currency_code,
    location_id,
    lpn_id,
    lot_number,
    expiration_date,
    meta,
    created_by
  ) VALUES (
    v_out_movement_id,
    v_movement.company_id,
    v_movement.legal_entity_id,
    v_movement.org_unit_id,
    v_movement.branch_id,
    v_movement.branch_name,
    v_movement.warehouse_id,
    v_movement.warehouse_name,
    v_movement.item_type,
    v_movement.stock_item_id,
    v_movement.semi_item_id,
    v_movement.item_name,
    v_movement.item_sku,
    v_movement.unit,
    v_movement.unit_factor,
    v_movement_type_out,
    'manual_adjustment',
    v_dir_out,
    now(),
    v_hold.hold_qty,
    v_hold.id,
    NULL,
    NULL,
    NULL,
    CASE WHEN p_action = 'release' THEN v_in_movement_id ELSE NULL END,
    v_movement.unit_cost,
    v_hold.hold_qty * v_movement.unit_cost,
    v_movement.currency_code,
    v_hold.location_id,
    v_hold.lpn_id,
    v_hold.lot_number,
    v_hold.expiration_date,
    jsonb_build_object(
      'quality_hold_id', v_hold.id,
      'availability_status', 'quarantine',
      'resolution_reason', p_reason
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 4. If release, create IN movement to increase available stock
  IF p_action = 'release' THEN
    INSERT INTO public.inventory_movements (
      id,
      company_id,
      legal_entity_id,
      org_unit_id,
      branch_id,
      branch_name,
      warehouse_id,
      warehouse_name,
      item_type,
      stock_item_id,
      semi_item_id,
      item_name,
      item_sku,
      unit,
      unit_factor,
      movement_type,
      source_doc_type,
      direction,
      movement_at,
      quantity,
      source_doc_id,
      source_doc_line_id,
      source_doc_no,
      source_doc_ref,
      transfer_pair_id,
      unit_cost,
      total_cost,
      currency_code,
      location_id,
      lpn_id,
      lot_number,
      expiration_date,
      meta,
      created_by
    ) VALUES (
      v_in_movement_id,
      v_movement.company_id,
      v_movement.legal_entity_id,
      v_movement.org_unit_id,
      v_movement.branch_id,
      v_movement.branch_name,
      v_movement.warehouse_id,
      v_movement.warehouse_name,
      v_movement.item_type,
      v_movement.stock_item_id,
      v_movement.semi_item_id,
      v_movement.item_name,
      v_movement.item_sku,
      v_movement.unit,
      v_movement.unit_factor,
      v_movement_type_in,
      'manual_adjustment',
      v_dir_in,
      now(),
      v_hold.hold_qty,
      v_hold.id,
      NULL,
      NULL,
      NULL,
      v_out_movement_id,
      v_movement.unit_cost,
      v_hold.hold_qty * v_movement.unit_cost,
      v_movement.currency_code,
      v_hold.location_id,
      v_hold.lpn_id,
      v_hold.lot_number,
      v_hold.expiration_date,
      jsonb_build_object(
        'quality_hold_id', v_hold.id,
        'availability_status', 'available',
        'resolution_reason', p_reason
      ),
      CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
    );
  END IF;

  -- 5. Update hold record status
  UPDATE public.warehouse_quality_holds
  SET status = v_target_status,
      released_by = p_personnel_id,
      released_at = now(),
      updated_at = now(),
      meta = meta || jsonb_build_object(
        'resolution_note', p_reason,
        'out_movement_id', v_out_movement_id,
        'in_movement_id', CASE WHEN p_action = 'release' THEN v_in_movement_id ELSE NULL END
      )
  WHERE id = p_hold_id;

  RETURN jsonb_build_object(
    'success', true,
    'hold_id', p_hold_id,
    'status', v_target_status,
    'out_movement_id', v_out_movement_id,
    'in_movement_id', CASE WHEN p_action = 'release' THEN v_in_movement_id ELSE NULL END
  );
END;
$$;


-- Migration: WMS Phase 4 - Quality view for frontend (WMS-04B)

CREATE OR REPLACE VIEW public.v_warehouse_quality_holds AS
SELECT
  q.*,
  s.name AS stock_item_name,
  s.sku AS stock_item_sku,
  s.unit AS stock_item_unit,
  c.name AS branch_name,
  CASE
    WHEN l.id IS NULL THEN '—'
    ELSE COALESCE(l.zone_code, '') ||
      CASE WHEN l.aisle IS NOT NULL AND l.aisle <> '' THEN '-K' || l.aisle ELSE '' END ||
      CASE WHEN l.rack IS NOT NULL AND l.rack <> '' THEN '-R' || l.rack ELSE '' END ||
      CASE WHEN l.level IS NOT NULL AND l.level <> '' THEN '-S' || l.level ELSE '' END ||
      CASE WHEN l.bin IS NOT NULL AND l.bin <> '' THEN '-G' || l.bin ELSE '' END
  END AS location_address,
  p.lpn_code AS lpn_code
FROM public.warehouse_quality_holds q
LEFT JOIN public.stock_items s ON q.stock_item_id = s.id
LEFT JOIN public.company_nodes c ON q.branch_id = c.id
LEFT JOIN public.warehouse_locations l ON q.location_id = l.id
LEFT JOIN public.warehouse_lpns p ON q.lpn_id = p.id;


-- Migration: WMS Phase 4 - Lot traceability RPCs (WMS-04C)

-- RPC for getting lot movement history with WMS details
CREATE OR REPLACE FUNCTION public.get_lot_movements_report(p_lot_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT jsonb_agg(t) INTO v_res
  FROM (
    SELECT
      m.id,
      m.item_name,
      m.item_sku,
      m.unit,
      m.branch_id,
      m.branch_name,
      m.warehouse_name,
      m.movement_type,
      m.direction,
      m.movement_at,
      m.quantity,
      m.source_doc_type,
      m.source_doc_id,
      m.source_doc_no,
      m.lot_number,
      m.expiration_date,
      CASE
        WHEN l.id IS NULL THEN '—'
        ELSE COALESCE(l.zone_code, '') ||
          CASE WHEN l.aisle IS NOT NULL AND l.aisle <> '' THEN '-K' || l.aisle ELSE '' END ||
          CASE WHEN l.rack IS NOT NULL AND l.rack <> '' THEN '-R' || l.rack ELSE '' END ||
          CASE WHEN l.level IS NOT NULL AND l.level <> '' THEN '-S' || l.level ELSE '' END ||
          CASE WHEN l.bin IS NOT NULL AND l.bin <> '' THEN '-G' || l.bin ELSE '' END
      END AS location_address,
      p.lpn_code AS lpn_code
    FROM public.inventory_movements m
    LEFT JOIN public.warehouse_locations l ON m.location_id = l.id
    LEFT JOIN public.warehouse_lpns p ON m.lpn_id = p.id
    WHERE m.lot_number = p_lot_number AND m.deleted_at IS NULL AND m.is_cancelled = false
    ORDER BY m.movement_at ASC, m.id ASC
  ) t;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;


-- RPC for getting Android execution/scan events timeline for a lot
CREATE OR REPLACE FUNCTION public.get_lot_android_events(p_lot_number TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res JSONB;
BEGIN
  SELECT jsonb_agg(t) INTO v_res
  FROM (
    SELECT
      e.id AS event_id,
      e.event_type,
      e.from_status,
      e.to_status,
      e.personnel_id,
      e.terminal_id,
      e.barcode_scanned,
      e.payload,
      e.created_at,
      t.id AS task_id,
      t.task_type,
      t.description AS task_description,
      t.source_doc_type,
      t.source_doc_id
    FROM public.warehouse_task_events e
    JOIN public.warehouse_tasks t ON e.task_id = t.id
    WHERE
      -- Putaway task matches via source movement lot number
      (t.task_type = 'putaway' AND (t.meta->>'source_movement_id')::UUID IN (
        SELECT id FROM public.inventory_movements WHERE lot_number = p_lot_number
      ))
      OR
      -- Pick task matches via reservation lot number
      (t.task_type = 'pick' AND (t.meta->>'reservation_id')::UUID IN (
        SELECT id FROM public.warehouse_reservations WHERE lot_number = p_lot_number
      ))
    ORDER BY e.created_at ASC
  ) t;

  RETURN COALESCE(v_res, '[]'::jsonb);
END;
$$;

-- Migration: WMS Phase 4 - Package and barcode sync trigger (WMS-04D)

CREATE OR REPLACE FUNCTION public.sync_stock_item_package_units()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_barcode_item RECORD;
  v_unit_id UUID;
  v_prev_qty NUMERIC := 1.0;
  v_curr_qty NUMERIC;
  v_level INT := 0;
  v_processed_names TEXT[] := ARRAY[]::TEXT[];
  v_processed_barcodes TEXT[] := ARRAY[]::TEXT[];
  v_unit_name TEXT;
  v_qty NUMERIC;

  -- Dimensions & Weights
  v_length_cm NUMERIC;
  v_width_cm NUMERIC;
  v_height_cm NUMERIC;
  v_gross_weight_kg NUMERIC;
  v_net_weight_kg NUMERIC;
  v_is_base BOOLEAN;

  -- Barcodes
  v_barcodes JSONB;
  v_barcode TEXT;
  v_barcode_type TEXT;
  v_is_primary BOOLEAN;
BEGIN
  -- Process packaging_units from JSONB array
  IF NEW.packaging_units IS NOT NULL AND jsonb_typeof(NEW.packaging_units) = 'array' THEN
    FOR v_item IN
      SELECT
        (value->>'unit') AS unit_name,
        COALESCE((value->>'qty')::NUMERIC, 1.0) AS qty,
        COALESCE((value->>'is_base_unit')::BOOLEAN, false) AS is_base_unit,
        (value->>'length_cm')::NUMERIC AS length_cm,
        (value->>'width_cm')::NUMERIC AS width_cm,
        (value->>'height_cm')::NUMERIC AS height_cm,
        (value->>'gross_weight_kg')::NUMERIC AS gross_weight_kg,
        (value->>'net_weight_kg')::NUMERIC AS net_weight_kg,
        (value->'barcodes') AS barcodes,
        (value->>'barcode') AS single_barcode,
        (value->>'single_barcode_type') AS single_barcode_type
      FROM jsonb_array_elements(NEW.packaging_units)
    LOOP
      v_unit_name := trim(v_item.unit_name);
      v_is_base := v_item.is_base_unit;

      IF v_unit_name IS NOT NULL AND v_unit_name <> '' THEN
        v_qty := v_item.qty;

        -- Dimensions & weights extraction
        v_length_cm := v_item.length_cm;
        v_width_cm := v_item.width_cm;
        v_height_cm := v_item.height_cm;
        v_gross_weight_kg := v_item.gross_weight_kg;
        v_net_weight_kg := v_item.net_weight_kg;

        -- Validation rules: if measurements are partially entered, they must be valid and complete
        IF v_length_cm IS NOT NULL OR v_width_cm IS NOT NULL OR v_height_cm IS NOT NULL OR v_gross_weight_kg IS NOT NULL OR v_net_weight_kg IS NOT NULL THEN
          IF COALESCE(v_length_cm, 0) <= 0 OR COALESCE(v_width_cm, 0) <= 0 OR COALESCE(v_height_cm, 0) <= 0 THEN
            RAISE EXCEPTION 'Boyutlar (en, boy, yukseklik) 0 veya negatif olamaz. Birim: %', v_unit_name;
          END IF;
          IF COALESCE(v_gross_weight_kg, 0) <= 0 OR COALESCE(v_net_weight_kg, 0) <= 0 THEN
            RAISE EXCEPTION 'Agirliklar (brut, net) 0 veya negatif olamaz. Birim: %', v_unit_name;
          END IF;
          IF v_net_weight_kg > v_gross_weight_kg THEN
            RAISE EXCEPTION 'Net agirlik brut agirliktan buyuk olamaz. Birim: %', v_unit_name;
          END IF;
        END IF;

        IF v_is_base THEN
          v_curr_qty := 1.0;
          v_level := 0;

          -- Upsert the base package unit
          UPDATE public.stock_item_package_units
          SET unit_name = NEW.unit,
              unit_symbol = NEW.unit,
              base_unit_name = NEW.unit,
              base_quantity = 1.0,
              level_no = 0,
              length_cm = v_length_cm,
              width_cm = v_width_cm,
              height_cm = v_height_cm,
              gross_weight_kg = v_gross_weight_kg,
              net_weight_kg = v_net_weight_kg,
              updated_at = now(),
              active = true
          WHERE stock_item_id = NEW.id AND is_base_unit = true
          RETURNING id INTO v_unit_id;

          IF NOT FOUND THEN
            INSERT INTO public.stock_item_package_units (
              stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
              level_no, is_base_unit, length_cm, width_cm, height_cm, gross_weight_kg, net_weight_kg, active
            ) VALUES (
              NEW.id, NEW.unit, NEW.unit, NEW.unit, 1.0,
              0, true, v_length_cm, v_width_cm, v_height_cm, v_gross_weight_kg, v_net_weight_kg, true
            ) RETURNING id INTO v_unit_id;
          END IF;

          v_processed_names := array_append(v_processed_names, NEW.unit);
          v_prev_qty := 1.0;
        ELSE
          v_level := v_level + 1;
          v_curr_qty := v_qty * v_prev_qty;

          -- Upsert the package unit
          UPDATE public.stock_item_package_units
          SET base_unit_name = NEW.unit,
              base_quantity = v_curr_qty,
              level_no = v_level,
              length_cm = v_length_cm,
              width_cm = v_width_cm,
              height_cm = v_height_cm,
              gross_weight_kg = v_gross_weight_kg,
              net_weight_kg = v_net_weight_kg,
              updated_at = now(),
              active = true
          WHERE stock_item_id = NEW.id AND unit_name = v_unit_name AND is_base_unit = false
          RETURNING id INTO v_unit_id;

          IF NOT FOUND THEN
            INSERT INTO public.stock_item_package_units (
              stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
              level_no, is_base_unit, length_cm, width_cm, height_cm, gross_weight_kg, net_weight_kg, active
            ) VALUES (
              NEW.id, v_unit_name, v_unit_name, NEW.unit, v_curr_qty,
              v_level, false, v_length_cm, v_width_cm, v_height_cm, v_gross_weight_kg, v_net_weight_kg, true
            ) RETURNING id INTO v_unit_id;
          END IF;

          v_processed_names := array_append(v_processed_names, v_unit_name);
          v_prev_qty := v_curr_qty;
        END IF;

        -- Process unit barcodes
        v_barcodes := v_item.barcodes;
        IF v_barcodes IS NOT NULL AND jsonb_typeof(v_barcodes) = 'array' THEN
          FOR v_barcode_item IN
            SELECT
              (value->>'barcode') AS barcode,
              COALESCE(value->>'barcode_type', 'EAN13') AS barcode_type,
              COALESCE((value->>'is_primary')::BOOLEAN, false) AS is_primary
            FROM jsonb_array_elements(v_barcodes)
          LOOP
            v_barcode := trim(v_barcode_item.barcode);
            v_barcode_type := v_barcode_item.barcode_type;
            v_is_primary := v_barcode_item.is_primary;

            IF v_barcode IS NOT NULL AND v_barcode <> '' THEN
              UPDATE public.product_external_barcodes
              SET package_unit_id = v_unit_id,
                  barcode_type = v_barcode_type,
                  is_primary = v_is_primary,
                  active = true,
                  is_approved = true,
                  updated_at = now()
              WHERE stock_item_id = NEW.id AND gtin_barcode = v_barcode;

              IF NOT FOUND THEN
                INSERT INTO public.product_external_barcodes (
                  gtin_barcode, stock_item_id, package_unit_id, barcode_type, is_primary, active, is_approved
                ) VALUES (
                  v_barcode, NEW.id, v_unit_id, v_barcode_type, v_is_primary, true, true
                );
              END IF;

              v_processed_barcodes := array_append(v_processed_barcodes, v_barcode);
            END IF;
          END LOOP;
        ELSIF v_item.single_barcode IS NOT NULL AND trim(v_item.single_barcode) <> '' THEN
          v_barcode := trim(v_item.single_barcode);
          v_barcode_type := COALESCE(v_item.single_barcode_type, 'EAN13');
          v_is_primary := true;

          UPDATE public.product_external_barcodes
          SET package_unit_id = v_unit_id,
              barcode_type = v_barcode_type,
              is_primary = v_is_primary,
              active = true,
              is_approved = true,
              updated_at = now()
              WHERE stock_item_id = NEW.id AND gtin_barcode = v_barcode;

          IF NOT FOUND THEN
            INSERT INTO public.product_external_barcodes (
              gtin_barcode, stock_item_id, package_unit_id, barcode_type, is_primary, active, is_approved
            ) VALUES (
              v_barcode, NEW.id, v_unit_id, v_barcode_type, v_is_primary, true, true
            );
          END IF;

          v_processed_barcodes := array_append(v_processed_barcodes, v_barcode);
        END IF;

      END IF;
    END LOOP;
  END IF;

  -- Ensure base unit row is active even if it was not in NEW.packaging_units (for fallback/default)
  IF NOT (NEW.unit = ANY(v_processed_names)) AND NEW.unit IS NOT NULL AND NEW.unit <> '' THEN
    SELECT id INTO v_unit_id
    FROM public.stock_item_package_units
    WHERE stock_item_id = NEW.id AND is_base_unit = true;

    IF FOUND THEN
      UPDATE public.stock_item_package_units
      SET unit_name = NEW.unit,
          unit_symbol = NEW.unit,
          base_unit_name = NEW.unit,
          base_quantity = 1.0,
          updated_at = now(),
          active = true
      WHERE id = v_unit_id;
    ELSE
      INSERT INTO public.stock_item_package_units (
        stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
        level_no, is_base_unit, is_default_receiving_unit, is_default_picking_unit,
        is_default_shipping_unit, active
      ) VALUES (
        NEW.id, NEW.unit, NEW.unit, NEW.unit, 1.0,
        0, true, true, true, true, true
      ) RETURNING id INTO v_unit_id;
    END IF;
    v_processed_names := array_append(v_processed_names, NEW.unit);
  END IF;

  -- 3. Deactivate or delete package units that are no longer active/present
  UPDATE public.stock_item_package_units
  SET active = false, updated_at = now()
  WHERE stock_item_id = NEW.id AND NOT (unit_name = ANY(v_processed_names));

  DELETE FROM public.stock_item_package_units
  WHERE stock_item_id = NEW.id
    AND NOT (unit_name = ANY(v_processed_names))
    AND id NOT IN (
      SELECT DISTINCT package_unit_id FROM public.product_external_barcodes WHERE package_unit_id IS NOT NULL
      UNION
      SELECT DISTINCT package_unit_id FROM public.warehouse_shipment_lines WHERE package_unit_id IS NOT NULL
    );

  -- 4. Deactivate or delete barcodes that are no longer associated
  UPDATE public.product_external_barcodes
  SET active = false, updated_at = now()
  WHERE stock_item_id = NEW.id AND NOT (gtin_barcode = ANY(v_processed_barcodes));

  DELETE FROM public.product_external_barcodes
  WHERE stock_item_id = NEW.id
    AND NOT (gtin_barcode = ANY(v_processed_barcodes))
    AND id NOT IN (
      SELECT DISTINCT (payload->>'barcode_id')::UUID FROM public.warehouse_task_events WHERE (payload->>'barcode_id') IS NOT NULL
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_stock_item_package_units ON public.stock_items;
CREATE TRIGGER trigger_sync_stock_item_package_units
AFTER INSERT OR UPDATE ON public.stock_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_item_package_units();

CREATE TABLE IF NOT EXISTS public.qa_questions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  author_name TEXT NOT NULL,
  question_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT qa_questions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.qa_answers (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  question_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT qa_answers_pkey PRIMARY KEY (id),
  CONSTRAINT fk_qa_questions FOREIGN KEY (question_id) REFERENCES public.qa_questions (id) ON DELETE CASCADE
);

-- Servis Sirasi (Courses) ve Hold/Fire Yonetimi Migrations
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_status_check CHECK (status = ANY (ARRAY['completed'::text, 'cancelled'::text, 'refunded'::text, 'partially_refunded'::text, 'active'::text]));

ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS default_course TEXT DEFAULT 'main_dish';

ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS course_type TEXT DEFAULT 'main_dish';
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS course_status TEXT DEFAULT 'fire';
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ DEFAULT now();


