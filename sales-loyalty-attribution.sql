-- Suitable RMS - sales loyalty attribution
-- Additive migration for campaign-level discount traceability

alter table if exists sales
  add column if not exists discount_source text null,
  add column if not exists loyalty_campaign_id text null,
  add column if not exists loyalty_campaign_name text null,
  add column if not exists loyalty_application_mode text null,
  add column if not exists loyalty_action_type text null,
  add column if not exists loyalty_offer_label text null,
  add column if not exists loyalty_source_rule_id text null;

alter table if exists sales
  drop constraint if exists sales_discount_source_check;

alter table if exists sales
  add constraint sales_discount_source_check
  check (discount_source is null or discount_source in ('manual', 'loyalty'));

alter table if exists sales
  drop constraint if exists sales_loyalty_application_mode_check;

alter table if exists sales
  add constraint sales_loyalty_application_mode_check
  check (loyalty_application_mode is null or loyalty_application_mode in ('prompt', 'auto'));

alter table if exists sale_lines
  add column if not exists loyalty_discount_allocated_amount numeric(14,2) not null default 0,
  add column if not exists discount_source text null,
  add column if not exists loyalty_campaign_id text null,
  add column if not exists loyalty_campaign_name text null,
  add column if not exists loyalty_application_mode text null,
  add column if not exists loyalty_action_type text null,
  add column if not exists loyalty_offer_label text null,
  add column if not exists loyalty_source_rule_id text null;

alter table if exists sale_lines
  drop constraint if exists sale_lines_discount_source_check;

alter table if exists sale_lines
  add constraint sale_lines_discount_source_check
  check (discount_source is null or discount_source in ('manual', 'loyalty'));

alter table if exists sale_lines
  drop constraint if exists sale_lines_loyalty_application_mode_check;

alter table if exists sale_lines
  add constraint sale_lines_loyalty_application_mode_check
  check (loyalty_application_mode is null or loyalty_application_mode in ('prompt', 'auto'));

alter table if exists pos_sales
  add column if not exists discount_source text null,
  add column if not exists loyalty_campaign_id text null,
  add column if not exists loyalty_campaign_name text null,
  add column if not exists loyalty_application_mode text null,
  add column if not exists loyalty_action_type text null,
  add column if not exists loyalty_offer_label text null,
  add column if not exists loyalty_source_rule_id text null;

create index if not exists idx_sales_loyalty_campaign_id on sales(loyalty_campaign_id);
create index if not exists idx_sale_lines_loyalty_campaign_id on sale_lines(loyalty_campaign_id);
create index if not exists idx_pos_sales_loyalty_campaign_id on pos_sales(loyalty_campaign_id);
