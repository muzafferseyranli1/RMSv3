-- Forecast page performance support for branch-name based sales history reads.
-- Required because historical sales/sale_lines rows currently carry branch_name
-- while branch_id may be null on older production data.

create index concurrently if not exists idx_sales_branch_name_status_datetime
  on public.sales (branch_name, status, sale_datetime desc);

create index concurrently if not exists idx_sale_lines_branch_name_sale_datetime
  on public.sale_lines (branch_name, sale_datetime desc);
