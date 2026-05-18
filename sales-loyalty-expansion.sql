-- Suitable RMS - Loyalty Sale Snapshot Expansion
-- Adds audit/readback columns for stronger post-sale traceability
-- These columns are nullable for backward compatibility with existing records

-- Expand sales table with loyalty audit/readback columns
alter table if exists sales
  add column if not exists loyalty_selected_coupon_code text null,
  add column if not exists loyalty_applied_actions_json text null,
  add column if not exists loyalty_decision_context_json text null;

-- Expand sale_lines table with loyalty audit/readback columns
alter table if exists sale_lines
  add column if not exists loyalty_selected_coupon_code text null,
  add column if not exists loyalty_applied_actions_json text null,
  add column if not exists loyalty_decision_context_json text null;

-- Expand pos_sales table with loyalty audit/readback columns
alter table if exists pos_sales
  add column if not exists loyalty_selected_coupon_code text null,
  add column if not exists loyalty_applied_actions_json text null,
  add column if not exists loyalty_decision_context_json text null;

-- Create indexes for new audit/readback columns
create index if not exists idx_sales_loyalty_selected_coupon on sales(loyalty_selected_coupon_code);
create index if not exists idx_sales_loyalty_applied_actions on sales using gin(loyalty_applied_actions_json::jsonb);
create index if not exists idx_sales_loyalty_decision_context on sales using gin(loyalty_decision_context_json::jsonb);

create index if not exists idx_sale_lines_loyalty_selected_coupon on sale_lines(loyalty_selected_coupon_code);
create index if not exists idx_sale_lines_loyalty_applied_actions on sale_lines using gin(loyalty_applied_actions_json::jsonb);
create index if not exists idx_sale_lines_loyalty_decision_context on sale_lines using gin(loyalty_decision_context_json::jsonb);
