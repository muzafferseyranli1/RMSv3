-- Migration: WMS Phase 5 - Pick-Face Replenishment Columns and RPC (WMS-05B)

-- 1. Add pick_face_min_qty and pick_face_max_qty to stock_item_warehouse_settings
ALTER TABLE public.stock_item_warehouse_settings
  ADD COLUMN IF NOT EXISTS pick_face_min_qty NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS pick_face_max_qty NUMERIC(10,3);

-- 2. Create complete_warehouse_move_task function
CREATE OR REPLACE FUNCTION public.complete_warehouse_move_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_source_location_id UUID,
  p_target_location_id UUID,
  p_evidence_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_source_movement public.inventory_movements%ROWTYPE;
  v_out_movement_id UUID;
  v_in_movement_id UUID;
  v_qty NUMERIC(18,6);
  v_stock_item_id UUID;
  v_lpn_id UUID;
  v_lot_number TEXT;
  v_expiration_date DATE;
BEGIN
  -- 1. Lock and retrieve task
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.task_type <> 'move' THEN
    RAISE EXCEPTION 'Bu işlem sadece move/transfer görevleri için geçerlidir. Görev tipi: %', v_task.task_type;
  END IF;

  IF v_task.status = 'done' THEN
    RAISE EXCEPTION 'Görev zaten tamamlanmış.';
  END IF;

  IF v_task.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş bir görev tamamlanamaz.';
  END IF;

  -- Read task metadata
  v_stock_item_id := (v_task.meta->>'stock_item_id')::UUID;
  v_qty := (v_task.meta->>'quantity')::NUMERIC(18,6);
  v_lpn_id := (v_task.meta->>'lpn_id')::UUID;
  v_lot_number := v_task.meta->>'lot_number';
  v_expiration_date := (v_task.meta->>'expiration_date')::DATE;

  IF v_stock_item_id IS NULL THEN
    RAISE EXCEPTION 'Görevin meta verisinde stock_item_id bulunamadı.';
  END IF;

  IF v_qty IS NULL OR v_qty <= 0 THEN
    RAISE EXCEPTION 'Görev miktarı geçersiz: %', v_qty;
  END IF;

  -- 2. Check source location match
  IF p_source_location_id IS NULL OR p_source_location_id <> (v_task.meta->>'source_location_id')::UUID THEN
    RAISE EXCEPTION 'Kaynak lokasyon doğrulaması başarısız.';
  END IF;

  -- 3. Check target location match
  IF p_target_location_id IS NULL OR p_target_location_id <> (v_task.meta->>'target_location_id')::UUID THEN
    RAISE EXCEPTION 'Hedef lokasyon doğrulaması başarısız.';
  END IF;

  -- 4. Find source movement to extract cost and legal entities
  SELECT * INTO v_source_movement
  FROM public.inventory_movements
  WHERE branch_id = v_task.branch_id
    AND stock_item_id = v_stock_item_id
    AND location_id = p_source_location_id
    AND (v_lpn_id IS NULL OR lpn_id = v_lpn_id)
    AND (v_lot_number IS NULL OR lot_number = v_lot_number)
    AND deleted_at IS NULL
    AND is_cancelled = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback: any movement for the item in the branch to copy basic metadata
    SELECT * INTO v_source_movement
    FROM public.inventory_movements
    WHERE branch_id = v_task.branch_id
      AND stock_item_id = v_stock_item_id
      AND deleted_at IS NULL
      AND is_cancelled = false
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kaynak lokasyonda veya şubede ürün hareketi bulunamadı.';
    END IF;
  END IF;

  -- 5. Consume active reservation
  UPDATE public.warehouse_reservations
  SET status = 'consumed',
      consumed_at = now(),
      updated_at = now()
  WHERE status = 'active'
    AND source_doc_type = 'warehouse_task'
    AND source_doc_id = p_task_id;

  -- 6. Insert transfer_out movement
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
    v_stock_item_id,
    NULL,
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
    v_in_movement_id,
    v_source_movement.unit_cost,
    v_qty * v_source_movement.unit_cost,
    v_source_movement.currency_code,
    p_source_location_id,
    v_lpn_id,
    v_lot_number,
    v_expiration_date,
    jsonb_build_object(
      'warehouse_task_id', p_task_id,
      'availability_status', 'available'
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 7. Insert transfer_in movement
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
    v_stock_item_id,
    NULL,
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
    v_out_movement_id,
    v_source_movement.unit_cost,
    v_qty * v_source_movement.unit_cost,
    v_source_movement.currency_code,
    p_target_location_id,
    v_lpn_id,
    v_lot_number,
    v_expiration_date,
    jsonb_build_object(
      'warehouse_task_id', p_task_id,
      'availability_status', 'available'
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 8. Update task status to done
  UPDATE public.warehouse_tasks
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      meta = jsonb_set(meta, '{completed_by}', to_jsonb(COALESCE(p_personnel_id, '')))
  WHERE id = p_task_id;

  -- 9. Log scan success and task completed event
  INSERT INTO public.warehouse_task_events (
    task_id,
    event_type,
    from_status,
    to_status,
    personnel_id,
    payload
  ) VALUES (
    p_task_id,
    'task_completed',
    v_task.status,
    'done',
    p_personnel_id,
    jsonb_build_object(
      'evidence_photo_url', p_evidence_photo_url,
      'source_location_id', p_source_location_id,
      'target_location_id', p_target_location_id
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
