-- Suitable RMS - Loyalty foundation
-- Customer master-data hardening + loyalty/campaign base tables

create extension if not exists pgcrypto;

alter table if exists musteriler
  add column if not exists normalized_phone text,
  add column if not exists normalized_email text,
  add column if not exists birth_date date,
  add column if not exists gender text,
  add column if not exists preferred_language text default 'tr',
  add column if not exists loyalty_member_no text,
  add column if not exists loyalty_status text default 'prospect',
  add column if not exists loyalty_enrolled_at timestamptz,
  add column if not exists sms_opt_in boolean default false,
  add column if not exists email_opt_in boolean default false,
  add column if not exists push_opt_in boolean default false,
  add column if not exists kvkk_consent_at timestamptz,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists acquisition_source text,
  add column if not exists signup_channel text,
  add column if not exists home_branch_id uuid,
  add column if not exists home_branch_name text,
  add column if not exists first_order_at timestamptz,
  add column if not exists last_order_at timestamptz,
  add column if not exists last_visit_at timestamptz,
  add column if not exists total_order_count integer default 0,
  add column if not exists total_order_amount numeric(14,2) default 0,
  add column if not exists avg_ticket_amount numeric(14,2) default 0,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists external_customer_ref text,
  add column if not exists mobile_app_user_id text,
  add column if not exists referral_code text,
  add column if not exists referred_by_customer_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_musteriler_normalized_phone on musteriler(normalized_phone);
create index if not exists idx_musteriler_normalized_email on musteriler(normalized_email);
create index if not exists idx_musteriler_loyalty_status on musteriler(loyalty_status);
create index if not exists idx_musteriler_loyalty_enrolled_at on musteriler(loyalty_enrolled_at desc);
create index if not exists idx_musteriler_home_branch_id on musteriler(home_branch_id);
create index if not exists idx_musteriler_mobile_app_user_id on musteriler(mobile_app_user_id);
create index if not exists idx_musteriler_external_customer_ref on musteriler(external_customer_ref);
create index if not exists idx_musteriler_referral_code on musteriler(referral_code);

create table if not exists customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references musteriler(id) on delete cascade,
  label text not null default 'Adres',
  address_type text not null default 'other',
  city_id text,
  city_name text,
  district_id text,
  district_name text,
  neighborhood_id text,
  neighborhood_name text,
  street text,
  building_no text,
  apartment_no text,
  floor_no text,
  door_no text,
  line_1 text,
  line_2 text,
  directions text,
  postal_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  source_channel text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_customer_addresses_customer_id on customer_addresses(customer_id);
create index if not exists idx_customer_addresses_primary on customer_addresses(customer_id, is_primary);

create table if not exists customer_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references musteriler(id) on delete cascade,
  device_platform text not null default 'unknown',
  device_name text,
  app_version text,
  push_token text,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_devices_customer_id on customer_devices(customer_id);
create index if not exists idx_customer_devices_push_token on customer_devices(push_token);

create table if not exists customer_consent_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references musteriler(id) on delete cascade,
  consent_channel text not null,
  consent_value boolean not null default false,
  source_channel text,
  captured_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_customer_consent_events_customer_id on customer_consent_events(customer_id, captured_at desc);

create table if not exists loyalty_tiers (
  id text primary key,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  code text,
  name text not null,
  min_spend_total numeric(14,2) not null default 0,
  min_order_count integer not null default 0,
  points_multiplier numeric(10,4) not null default 1,
  birthday_bonus_points numeric(14,2) not null default 0,
  benefits_summary text,
  qualification_json jsonb not null default '{}'::jsonb,
  benefits_json jsonb not null default '{}'::jsonb,
  color text default '#2563eb',
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_tiers_scope_type_check check (scope_type in ('global', 'branch'))
);

create index if not exists idx_loyalty_tiers_scope on loyalty_tiers(scope_type, scope_branch_id);
create index if not exists idx_loyalty_tiers_active on loyalty_tiers(active, sort_order);

create table if not exists loyalty_programs (
  id text primary key,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  name text not null,
  description text,
  program_type text not null default 'mixed',
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  chain_wide_active boolean not null default false,
  notify_balance_change boolean not null default true,
  notification_channel text not null default 'push_or_sms',
  webhook_enabled boolean not null default false,
  webhook_template text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_programs_scope_type_check check (scope_type in ('global', 'branch'))
);

create index if not exists idx_loyalty_programs_scope on loyalty_programs(scope_type, scope_branch_id);
create index if not exists idx_loyalty_programs_active on loyalty_programs(active, starts_at, ends_at);

alter table if exists loyalty_programs
  add column if not exists program_family text default 'points',
  add column if not exists earn_model text default 'points_per_amount',
  add column if not exists redemption_model text default 'points_to_discount',
  add column if not exists card_mode text default 'none',
  add column if not exists frequency_goal integer default 0,
  add column if not exists frequency_reset_period text default 'never',
  add column if not exists frequency_reward_json jsonb not null default '{}'::jsonb;

alter table if exists loyalty_programs
  drop constraint if exists loyalty_programs_program_family_check;

alter table if exists loyalty_programs
  add constraint loyalty_programs_program_family_check
  check (program_family in ('points', 'frequency', 'reward', 'gift_card', 'stored_value_card', 'membership_card', 'mixed'));

alter table if exists loyalty_programs
  drop constraint if exists loyalty_programs_frequency_reset_period_check;

alter table if exists loyalty_programs
  add constraint loyalty_programs_frequency_reset_period_check
  check (frequency_reset_period in ('never', 'daily', 'weekly', 'monthly', 'yearly'));

create table if not exists loyalty_customer_categories (
  id text primary key,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  name text not null,
  code text,
  description text,
  color text default '#2563eb',
  active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_customer_categories_scope_type_check check (scope_type in ('global', 'branch'))
);

create index if not exists idx_loyalty_customer_categories_scope on loyalty_customer_categories(scope_type, scope_branch_id);
create index if not exists idx_loyalty_customer_categories_active on loyalty_customer_categories(active, sort_order);
create unique index if not exists uq_loyalty_customer_categories_scope_code on loyalty_customer_categories(scope_type, coalesce(scope_branch_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(code, ''));

create table if not exists loyalty_customer_category_members (
  id text primary key,
  customer_id uuid not null references musteriler(id) on delete cascade,
  category_id text not null references loyalty_customer_categories(id) on delete cascade,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_customer_category_members_scope_type_check check (scope_type in ('global', 'branch'))
);

create index if not exists idx_loyalty_customer_category_members_customer on loyalty_customer_category_members(customer_id, active);
create index if not exists idx_loyalty_customer_category_members_category on loyalty_customer_category_members(category_id, active);
create index if not exists idx_loyalty_customer_category_members_scope on loyalty_customer_category_members(scope_type, scope_branch_id, customer_id);
create unique index if not exists uq_loyalty_customer_category_members_active
  on loyalty_customer_category_members(customer_id, category_id, scope_type, coalesce(scope_branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;

create table if not exists loyalty_campaigns (
  id text primary key,
  program_id text,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  name text not null,
  code text,
  description text,
  campaign_type text not null default 'bonus_points',
  trigger_type text not null default 'manual',
  reward_type text not null default 'points',
  reward_value numeric(14,2) not null default 0,
  priority integer not null default 100,
  stackable boolean not null default false,
  active boolean not null default true,
  status text not null default 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  channel_targets jsonb not null default '[]'::jsonb,
  audience_json jsonb not null default '{}'::jsonb,
  conditions_json jsonb not null default '[]'::jsonb,
  actions_json jsonb not null default '[]'::jsonb,
  budget_json jsonb not null default '{}'::jsonb,
  limits_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_campaigns_scope_type_check check (scope_type in ('global', 'branch')),
  constraint loyalty_campaigns_status_check check (status in ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived'))
);

alter table if exists loyalty_campaigns
  add column if not exists program_id text;

alter table if exists loyalty_campaigns
  drop constraint if exists loyalty_campaigns_program_id_fkey;

alter table if exists loyalty_campaigns
  add constraint loyalty_campaigns_program_id_fkey
  foreign key (program_id) references loyalty_programs(id) on delete set null;

create index if not exists idx_loyalty_campaigns_scope on loyalty_campaigns(scope_type, scope_branch_id);
create index if not exists idx_loyalty_campaigns_active on loyalty_campaigns(active, status, starts_at, ends_at);
create index if not exists idx_loyalty_campaigns_code on loyalty_campaigns(code);
create index if not exists idx_loyalty_campaigns_program_id on loyalty_campaigns(program_id);

create table if not exists loyalty_campaign_rules (
  id text primary key,
  campaign_id text not null references loyalty_campaigns(id) on delete cascade,
  rule_scope text not null default 'applicable',
  condition_key text not null,
  operator text not null default 'gte',
  threshold_value numeric(14,2) not null default 0,
  period_window text not null default 'all_time',
  action_type text not null default 'bonus_points',
  action_summary text,
  condition_json jsonb not null default '{}'::jsonb,
  action_json jsonb not null default '{}'::jsonb,
  stop_processing boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_campaign_rules_scope_check check (rule_scope in ('applicable', 'periodic'))
);

create index if not exists idx_loyalty_campaign_rules_campaign_id on loyalty_campaign_rules(campaign_id, sort_order);
create index if not exists idx_loyalty_campaign_rules_scope on loyalty_campaign_rules(rule_scope, active);

create table if not exists loyalty_coupon_series (
  id text primary key,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  name text not null,
  prefix text not null,
  single_coupon boolean not null default false,
  coupon_count integer not null default 1,
  random_length integer not null default 6,
  charset text not null default 'numeric',
  use_after_checkout boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_coupon_series_scope_type_check check (scope_type in ('global', 'branch'))
);

create index if not exists idx_loyalty_coupon_series_scope on loyalty_coupon_series(scope_type, scope_branch_id);
create index if not exists idx_loyalty_coupon_series_active on loyalty_coupon_series(active, created_at);

alter table if exists loyalty_coupon_series
  add column if not exists valid_from timestamptz;

alter table if exists loyalty_coupon_series
  add column if not exists valid_until timestamptz;

alter table if exists loyalty_coupon_series
  add column if not exists expires_in_days integer;

alter table if exists loyalty_coupon_series
  add column if not exists auto_deactivate_on_expiry boolean not null default true;

create table if not exists loyalty_coupons (
  id text primary key,
  series_id text not null references loyalty_coupon_series(id) on delete cascade,
  customer_id uuid references musteriler(id) on delete set null,
  code text not null,
  is_used boolean not null default false,
  used_at timestamptz,
  source_ref_id text,
  use_after_checkout boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_loyalty_coupons_code on loyalty_coupons(code);
create index if not exists idx_loyalty_coupons_series_id on loyalty_coupons(series_id, is_used);
create index if not exists idx_loyalty_coupons_customer_id on loyalty_coupons(customer_id, used_at desc);

alter table if exists loyalty_coupons
  add column if not exists issued_at timestamptz not null default now();

alter table if exists loyalty_coupons
  add column if not exists expires_at timestamptz;

alter table if exists loyalty_coupons
  add column if not exists redeemed_by_customer_id uuid references musteriler(id) on delete set null;

alter table if exists loyalty_coupons
  add column if not exists redeemed_channel text;

alter table if exists loyalty_coupons
  add column if not exists redeemed_source_ref_id text;

alter table if exists loyalty_coupons
  add column if not exists redemption_status text not null default 'available';

alter table if exists loyalty_coupons
  add column if not exists note text;

alter table if exists loyalty_coupons
  drop constraint if exists loyalty_coupons_redemption_status_check;

alter table if exists loyalty_coupons
  add constraint loyalty_coupons_redemption_status_check check (
    redemption_status in ('available', 'reserved', 'used', 'expired', 'cancelled')
  );

create index if not exists idx_loyalty_coupons_redemption_status on loyalty_coupons(redemption_status, expires_at, used_at desc);
create index if not exists idx_loyalty_coupons_redeemed_customer on loyalty_coupons(redeemed_by_customer_id, used_at desc);

create table if not exists loyalty_wallets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references musteriler(id) on delete cascade,
  program_id text references loyalty_programs(id) on delete set null,
  tier_id text references loyalty_tiers(id) on delete set null,
  wallet_type text not null default 'points',
  current_points_balance numeric(14,2) not null default 0,
  lifetime_earned_points numeric(14,2) not null default 0,
  lifetime_burned_points numeric(14,2) not null default 0,
  lifetime_expired_points numeric(14,2) not null default 0,
  last_transaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

drop index if exists uq_loyalty_wallets_customer_id;
create unique index if not exists uq_loyalty_wallets_program_wallet on loyalty_wallets(customer_id, coalesce(program_id, ''), wallet_type);
create index if not exists idx_loyalty_wallets_tier_id on loyalty_wallets(tier_id);
create index if not exists idx_loyalty_wallets_program_id on loyalty_wallets(program_id, wallet_type);

alter table if exists loyalty_wallets
  drop constraint if exists loyalty_wallets_wallet_type_check;

alter table if exists loyalty_wallets
  add constraint loyalty_wallets_wallet_type_check
  check (wallet_type in ('points', 'reward', 'frequency', 'stored_value'));

create table if not exists loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references loyalty_wallets(id) on delete cascade,
  customer_id uuid not null references musteriler(id) on delete cascade,
  program_id text references loyalty_programs(id) on delete set null,
  campaign_id text references loyalty_campaigns(id) on delete set null,
  tier_id text references loyalty_tiers(id) on delete set null,
  wallet_type text not null default 'points',
  transaction_type text not null,
  status text not null default 'posted',
  source_channel text not null default 'manual',
  source_type text,
  source_ref_id text,
  source_ref_no text,
  branch_id uuid,
  branch_name text,
  points_delta numeric(14,2) not null default 0,
  points_before numeric(14,2) not null default 0,
  points_after numeric(14,2) not null default 0,
  monetary_amount numeric(14,2) not null default 0,
  expires_at timestamptz,
  occurred_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loyalty_transactions_status_check check (
    status in ('pending', 'posted', 'cancelled', 'expired', 'reversed')
  )
);

alter table if exists loyalty_transactions
  drop constraint if exists loyalty_transactions_type_check;

alter table if exists loyalty_transactions
  add constraint loyalty_transactions_type_check check (
    transaction_type in (
      'earn', 'burn', 'adjustment', 'expire', 'refund', 'campaign_bonus', 'welcome_bonus', 'birthday_bonus',
      'frequency_step', 'frequency_reward',
      'card_load', 'card_spend', 'card_refund', 'card_adjustment'
    )
  );

alter table if exists loyalty_transactions
  drop constraint if exists loyalty_transactions_wallet_type_check;

alter table if exists loyalty_transactions
  add constraint loyalty_transactions_wallet_type_check
  check (wallet_type in ('points', 'reward', 'frequency', 'stored_value'));

create index if not exists idx_loyalty_transactions_wallet_id on loyalty_transactions(wallet_id, occurred_at desc);
create index if not exists idx_loyalty_transactions_customer_id on loyalty_transactions(customer_id, occurred_at desc);
create index if not exists idx_loyalty_transactions_campaign_id on loyalty_transactions(campaign_id);
create index if not exists idx_loyalty_transactions_source_ref_id on loyalty_transactions(source_ref_id);
create index if not exists idx_loyalty_transactions_program_id on loyalty_transactions(program_id, wallet_type, occurred_at desc);

create table if not exists loyalty_frequency_progress (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references musteriler(id) on delete cascade,
  program_id text not null references loyalty_programs(id) on delete cascade,
  campaign_id text references loyalty_campaigns(id) on delete set null,
  progress_type text not null default 'visits',
  current_count integer not null default 0,
  target_count integer not null default 0,
  completed_cycles integer not null default 0,
  last_qualified_at timestamptz,
  reset_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_frequency_progress_type_check
    check (progress_type in ('visits', 'stamps', 'orders', 'products'))
);

create unique index if not exists uq_loyalty_frequency_progress_customer_program on loyalty_frequency_progress(customer_id, program_id, progress_type);
create index if not exists idx_loyalty_frequency_progress_program on loyalty_frequency_progress(program_id, progress_type, updated_at desc);

create table if not exists loyalty_reward_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references musteriler(id) on delete cascade,
  program_id text references loyalty_programs(id) on delete set null,
  campaign_id text references loyalty_campaigns(id) on delete set null,
  wallet_id uuid references loyalty_wallets(id) on delete set null,
  entitlement_type text not null default 'free_product',
  entitlement_status text not null default 'available',
  title text,
  description text,
  source_channel text,
  source_ref_id text,
  source_ref_no text,
  target_scope_type text not null default 'product',
  target_scope_json jsonb not null default '{}'::jsonb,
  reward_payload jsonb not null default '{}'::jsonb,
  quantity numeric(14,2) not null default 1,
  priority integer not null default 0,
  earned_at timestamptz not null default now(),
  available_from timestamptz,
  reserved_at timestamptz,
  expires_at timestamptz,
  consumed_at timestamptz,
  consumed_ref_id text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_reward_entitlements_type_check check (
    entitlement_type in ('free_product', 'discount_amount', 'discount_percent', 'coupon', 'bonus_points', 'stored_value', 'custom')
  ),
  constraint loyalty_reward_entitlements_status_check check (
    entitlement_status in ('available', 'reserved', 'consumed', 'expired', 'cancelled')
  ),
  constraint loyalty_reward_entitlements_scope_check check (
    target_scope_type in ('product', 'category', 'mask', 'any')
  )
);

create index if not exists idx_loyalty_reward_entitlements_customer_status on loyalty_reward_entitlements(customer_id, entitlement_status, earned_at desc);
create index if not exists idx_loyalty_reward_entitlements_campaign on loyalty_reward_entitlements(campaign_id, entitlement_status, earned_at desc);
create index if not exists idx_loyalty_reward_entitlements_expires on loyalty_reward_entitlements(expires_at, entitlement_status);
create index if not exists idx_loyalty_reward_entitlements_source_ref on loyalty_reward_entitlements(source_ref_id);

create table if not exists loyalty_cards (
  id uuid primary key default gen_random_uuid(),
  program_id text references loyalty_programs(id) on delete set null,
  customer_id uuid references musteriler(id) on delete set null,
  card_no text not null,
  card_type text not null default 'membership',
  card_status text not null default 'active',
  card_label text,
  qr_code text,
  barcode text,
  stored_value_balance numeric(14,2) not null default 0,
  points_balance numeric(14,2) not null default 0,
  frequency_balance integer not null default 0,
  issued_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_cards_type_check
    check (card_type in ('membership', 'gift', 'prepaid', 'stamp', 'reward')),
  constraint loyalty_cards_status_check
    check (card_status in ('draft', 'active', 'blocked', 'expired', 'cancelled'))
);

create unique index if not exists uq_loyalty_cards_card_no on loyalty_cards(card_no);
create index if not exists idx_loyalty_cards_customer_id on loyalty_cards(customer_id, card_status);
create index if not exists idx_loyalty_cards_program_id on loyalty_cards(program_id, card_type, card_status);

create table if not exists loyalty_card_transactions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references loyalty_cards(id) on delete cascade,
  customer_id uuid references musteriler(id) on delete set null,
  program_id text references loyalty_programs(id) on delete set null,
  campaign_id text references loyalty_campaigns(id) on delete set null,
  transaction_type text not null,
  status text not null default 'posted',
  source_channel text,
  source_ref_id text,
  amount_delta numeric(14,2) not null default 0,
  points_delta numeric(14,2) not null default 0,
  frequency_delta integer not null default 0,
  balance_before numeric(14,2) not null default 0,
  balance_after numeric(14,2) not null default 0,
  occurred_at timestamptz not null default now(),
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint loyalty_card_transactions_type_check
    check (transaction_type in ('issue', 'load', 'spend', 'refund', 'adjustment', 'stamp_earn', 'stamp_redeem', 'points_sync')),
  constraint loyalty_card_transactions_status_check
    check (status in ('pending', 'posted', 'cancelled', 'reversed'))
);

create index if not exists idx_loyalty_card_transactions_card_id on loyalty_card_transactions(card_id, occurred_at desc);
create index if not exists idx_loyalty_card_transactions_customer_id on loyalty_card_transactions(customer_id, occurred_at desc);

create table if not exists loyalty_campaign_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references loyalty_campaigns(id) on delete cascade,
  customer_id uuid not null references musteriler(id) on delete cascade,
  wallet_id uuid references loyalty_wallets(id) on delete set null,
  transaction_id uuid references loyalty_transactions(id) on delete set null,
  redemption_status text not null default 'applied',
  source_channel text,
  source_ref_id text,
  redeemed_value numeric(14,2) not null default 0,
  redeemed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint loyalty_campaign_redemptions_status_check check (
    redemption_status in ('reserved', 'applied', 'cancelled', 'reversed')
  )
);

create index if not exists idx_loyalty_campaign_redemptions_campaign_id on loyalty_campaign_redemptions(campaign_id, redeemed_at desc);
create index if not exists idx_loyalty_campaign_redemptions_customer_id on loyalty_campaign_redemptions(customer_id, redeemed_at desc);

alter table customer_addresses enable row level security;
alter table customer_devices enable row level security;
alter table customer_consent_events enable row level security;
alter table loyalty_tiers enable row level security;
alter table loyalty_programs enable row level security;
alter table loyalty_customer_categories enable row level security;
alter table loyalty_customer_category_members enable row level security;
alter table loyalty_campaigns enable row level security;
alter table loyalty_campaign_rules enable row level security;
alter table loyalty_coupon_series enable row level security;
alter table loyalty_coupons enable row level security;
alter table loyalty_wallets enable row level security;
alter table loyalty_transactions enable row level security;
alter table loyalty_campaign_redemptions enable row level security;
alter table loyalty_frequency_progress enable row level security;
alter table loyalty_reward_entitlements enable row level security;
alter table loyalty_cards enable row level security;
alter table loyalty_card_transactions enable row level security;

drop policy if exists allow_all_customer_addresses on customer_addresses;
create policy allow_all_customer_addresses on customer_addresses for all using (true) with check (true);

drop policy if exists allow_all_customer_devices on customer_devices;
create policy allow_all_customer_devices on customer_devices for all using (true) with check (true);

drop policy if exists allow_all_customer_consent_events on customer_consent_events;
create policy allow_all_customer_consent_events on customer_consent_events for all using (true) with check (true);

drop policy if exists allow_all_loyalty_tiers on loyalty_tiers;
create policy allow_all_loyalty_tiers on loyalty_tiers for all using (true) with check (true);

drop policy if exists allow_all_loyalty_programs on loyalty_programs;
create policy allow_all_loyalty_programs on loyalty_programs for all using (true) with check (true);

drop policy if exists allow_all_loyalty_customer_categories on loyalty_customer_categories;
create policy allow_all_loyalty_customer_categories on loyalty_customer_categories for all using (true) with check (true);

drop policy if exists allow_all_loyalty_customer_category_members on loyalty_customer_category_members;
create policy allow_all_loyalty_customer_category_members on loyalty_customer_category_members for all using (true) with check (true);

drop policy if exists allow_all_loyalty_campaigns on loyalty_campaigns;
create policy allow_all_loyalty_campaigns on loyalty_campaigns for all using (true) with check (true);

drop policy if exists allow_all_loyalty_campaign_rules on loyalty_campaign_rules;
create policy allow_all_loyalty_campaign_rules on loyalty_campaign_rules for all using (true) with check (true);

drop policy if exists allow_all_loyalty_coupon_series on loyalty_coupon_series;
create policy allow_all_loyalty_coupon_series on loyalty_coupon_series for all using (true) with check (true);

drop policy if exists allow_all_loyalty_coupons on loyalty_coupons;
create policy allow_all_loyalty_coupons on loyalty_coupons for all using (true) with check (true);

drop policy if exists allow_all_loyalty_wallets on loyalty_wallets;
create policy allow_all_loyalty_wallets on loyalty_wallets for all using (true) with check (true);

drop policy if exists allow_all_loyalty_transactions on loyalty_transactions;
create policy allow_all_loyalty_transactions on loyalty_transactions for all using (true) with check (true);

drop policy if exists allow_all_loyalty_campaign_redemptions on loyalty_campaign_redemptions;
create policy allow_all_loyalty_campaign_redemptions on loyalty_campaign_redemptions for all using (true) with check (true);

drop policy if exists allow_all_loyalty_frequency_progress on loyalty_frequency_progress;
create policy allow_all_loyalty_frequency_progress on loyalty_frequency_progress for all using (true) with check (true);

drop policy if exists allow_all_loyalty_reward_entitlements on loyalty_reward_entitlements;
create policy allow_all_loyalty_reward_entitlements on loyalty_reward_entitlements for all using (true) with check (true);

drop policy if exists allow_all_loyalty_cards on loyalty_cards;
create policy allow_all_loyalty_cards on loyalty_cards for all using (true) with check (true);

drop policy if exists allow_all_loyalty_card_transactions on loyalty_card_transactions;
create policy allow_all_loyalty_card_transactions on loyalty_card_transactions for all using (true) with check (true);
