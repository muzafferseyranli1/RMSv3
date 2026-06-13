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
