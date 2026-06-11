-- Create v_wms_pickable_stock view
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
