-- Suitable RMS - sale_lines personnel tracking
-- Additive migration for item-level personnel reporting

alter table if exists sale_lines
  add column if not exists personnel_id text null,
  add column if not exists personnel_name text null;

create index if not exists idx_sale_lines_personnel_id on sale_lines(personnel_id);
create index if not exists idx_sale_lines_personnel_name on sale_lines(personnel_name);
