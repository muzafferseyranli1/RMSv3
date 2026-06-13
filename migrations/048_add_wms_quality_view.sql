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
