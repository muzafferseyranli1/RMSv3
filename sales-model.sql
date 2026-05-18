-- Suitable RMS - Sales data model
-- Safe additive migration for POS sales normalization
-- Creates: sales, sale_lines, sale_payments

create extension if not exists pgcrypto;

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  local_id text unique,
  sale_no text,
  sale_datetime timestamptz not null default now(),

  source text not null default 'pos',
  source_channel_type text not null default 'hizli_satis',

  sales_channel_id uuid null,
  sales_channel_name text null,

  company_id uuid null,
  company_name text null,

  legal_entity_id uuid null,
  legal_entity_name text null,

  org_unit_id uuid null,
  org_unit_name text null,

  branch_id uuid null,
  branch_name text null,

  table_no text null,

  customer_id uuid null,
  customer_name text null,

  cashier_id uuid null,
  cashier_name text null,

  order_note text null,

  currency_code text not null default 'TRY',

  gross_total_before_discount numeric(14,2) not null default 0,
  discount_type text null,
  discount_source text null,
  discount_value numeric(14,6) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  gross_total_after_discount numeric(14,2) not null default 0,
  net_total_after_discount numeric(14,2) not null default 0,
  cost_total numeric(14,2) not null default 0,

  loyalty_campaign_id text null,
  loyalty_campaign_name text null,
  loyalty_application_mode text null,
  loyalty_action_type text null,
  loyalty_offer_label text null,
  loyalty_source_rule_id text null,

  payment_total numeric(14,2) not null default 0,
  change_amount numeric(14,2) not null default 0,

  status text not null default 'completed',
  integration_ref text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  constraint sales_discount_type_check
    check (discount_type is null or discount_type in ('percent', 'amount')),
  constraint sales_discount_source_check
    check (discount_source is null or discount_source in ('manual', 'loyalty')),
  constraint sales_loyalty_application_mode_check
    check (loyalty_application_mode is null or loyalty_application_mode in ('prompt', 'auto')),
  constraint sales_status_check
    check (status in ('completed', 'cancelled', 'refunded', 'partially_refunded'))
);

create table if not exists sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,

  line_no int not null,

  product_id uuid null,
  product_name text not null,
  product_sku text null,

  top_category_id uuid null,
  top_category_name text null,

  sub_category_id uuid null,
  sub_category_name text null,

  portion_id text null,
  portion_name text null,

  options_json jsonb not null default '[]'::jsonb,
  options_summary text null,

  line_note text null,

  qty numeric(12,3) not null default 1,

  unit_gross_before_discount numeric(14,2) not null default 0,
  line_gross_before_discount numeric(14,2) not null default 0,

  discount_allocated_amount numeric(14,2) not null default 0,
  loyalty_discount_allocated_amount numeric(14,2) not null default 0,

  unit_gross_after_discount numeric(14,2) not null default 0,
  line_gross_after_discount numeric(14,2) not null default 0,

  tax_id uuid null,
  tax_name text null,
  tax_rate numeric(8,4) not null default 0,

  line_net_after_discount numeric(14,2) not null default 0,

  unit_cost_snapshot numeric(14,4) not null default 0,
  line_cost_total numeric(14,2) not null default 0,

  sales_channel_id uuid null,
  sales_channel_name text null,

  branch_id uuid null,
  branch_name text null,

  personnel_id text null,
  personnel_name text null,

  discount_source text null,
  loyalty_campaign_id text null,
  loyalty_campaign_name text null,
  loyalty_application_mode text null,
  loyalty_action_type text null,
  loyalty_offer_label text null,
  loyalty_source_rule_id text null,

  sale_datetime timestamptz not null,
  created_at timestamptz not null default now(),

  constraint sale_lines_discount_source_check
    check (discount_source is null or discount_source in ('manual', 'loyalty')),
  constraint sale_lines_loyalty_application_mode_check
    check (loyalty_application_mode is null or loyalty_application_mode in ('prompt', 'auto'))
);

create table if not exists sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,

  payment_method text not null,
  payment_method_label text null,
  amount numeric(14,2) not null default 0,

  reference_no text null,
  payment_datetime timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_sale_datetime on sales(sale_datetime desc);
create index if not exists idx_sales_branch_id on sales(branch_id);
create index if not exists idx_sales_branch_name_status_datetime
  on sales(branch_name, status, sale_datetime desc);
create index if not exists idx_sales_legal_entity_id on sales(legal_entity_id);
create index if not exists idx_sales_sales_channel_id on sales(sales_channel_id);
create index if not exists idx_sales_status on sales(status);
create index if not exists idx_sales_loyalty_campaign_id on sales(loyalty_campaign_id);

create index if not exists idx_sale_lines_sale_id on sale_lines(sale_id);
create index if not exists idx_sale_lines_product_id on sale_lines(product_id);
create index if not exists idx_sale_lines_branch_id on sale_lines(branch_id);
create index if not exists idx_sale_lines_branch_name_sale_datetime
  on sale_lines(branch_name, sale_datetime desc);
create index if not exists idx_sale_lines_personnel_id on sale_lines(personnel_id);
create index if not exists idx_sale_lines_personnel_name on sale_lines(personnel_name);
create index if not exists idx_sale_lines_sale_datetime on sale_lines(sale_datetime desc);
create index if not exists idx_sale_lines_top_category_id on sale_lines(top_category_id);
create index if not exists idx_sale_lines_sub_category_id on sale_lines(sub_category_id);
create index if not exists idx_sale_lines_loyalty_campaign_id on sale_lines(loyalty_campaign_id);

create index if not exists idx_sale_payments_sale_id on sale_payments(sale_id);
create index if not exists idx_sale_payments_method on sale_payments(payment_method);
create index if not exists idx_sale_payments_payment_datetime on sale_payments(payment_datetime desc);
