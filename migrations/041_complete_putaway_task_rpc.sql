-- Complete warehouse putaway task RPC
CREATE OR REPLACE FUNCTION public.complete_warehouse_putaway_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_target_location_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_source_movement_id UUID;
  v_source_movement public.inventory_movements%ROWTYPE;
  v_out_movement_id UUID;
  v_in_movement_id UUID;
  v_qty NUMERIC(18,6);
  v_target_location_id UUID := p_target_location_id;
BEGIN
  -- 1. Görevi kilitle ve kontrol et
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.task_type <> 'putaway' THEN
    RAISE EXCEPTION 'Bu işlem sadece putaway görevleri için geçerlidir. Görev tipi: %', v_task.task_type;
  END IF;

  IF v_task.status = 'done' THEN
    RAISE EXCEPTION 'Görev zaten tamamlanmış.';
  END IF;

  IF v_task.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş bir görev tamamlanamaz.';
  END IF;

  -- 2. Meta verileri oku
  v_source_movement_id := (v_task.meta->>'source_movement_id')::UUID;
  IF v_source_movement_id IS NULL THEN
    RAISE EXCEPTION 'Görevin meta verisinde kaynak hareket ID''si (source_movement_id) bulunamadı.';
  END IF;

  -- Kaynak hareketi kilitle
  SELECT * INTO v_source_movement
  FROM public.inventory_movements
  WHERE id = v_source_movement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kaynak stok hareketi bulunamadı (ID: %)', v_source_movement_id;
  END IF;

  -- Görevdeki veya metadaki miktar
  v_qty := COALESCE(
    (v_task.meta->>'quantity')::NUMERIC(18,6),
    v_source_movement.quantity
  );

  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Görev miktarı sıfır veya negatif olamaz: %', v_qty;
  END IF;

  -- Hedef lokasyon belirlenmesi
  IF v_target_location_id IS NULL THEN
    v_target_location_id := (v_task.meta->>'target_location_id')::UUID;
  END IF;

  IF v_target_location_id IS NULL THEN
    RAISE EXCEPTION 'Hedef lokasyon belirtilmedi veya görev metasında bulunamadı.';
  END IF;

  -- 3. transfer_out hareketini ekle (putaway_pending durumunu azaltır)
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
    source_doc_line_id,
    source_doc_no,
    source_doc_ref,
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
    v_source_movement.stock_item_id,
    v_source_movement.semi_item_id,
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
    NULL,
    NULL,
    NULL,
    v_in_movement_id,
    v_source_movement.unit_cost,
    v_qty * v_source_movement.unit_cost,
    v_source_movement.currency_code,
    v_source_movement.location_id,
    v_source_movement.lpn_id,
    v_source_movement.lot_number,
    v_source_movement.expiration_date,
    jsonb_build_object(
      'warehouse_task_id', p_task_id,
      'availability_status', 'putaway_pending',
      'source_movement_id', v_source_movement_id
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 4. transfer_in hareketini ekle (available durumunu artırır)
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
    source_doc_line_id,
    source_doc_no,
    source_doc_ref,
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
    v_source_movement.stock_item_id,
    v_source_movement.semi_item_id,
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
    NULL,
    NULL,
    NULL,
    v_out_movement_id,
    v_source_movement.unit_cost,
    v_qty * v_source_movement.unit_cost,
    v_source_movement.currency_code,
    v_target_location_id,
    v_source_movement.lpn_id,
    v_source_movement.lot_number,
    v_source_movement.expiration_date,
    jsonb_build_object(
      'warehouse_task_id', p_task_id,
      'availability_status', 'available',
      'source_movement_id', v_source_movement_id
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 5. Görevi güncelle
  UPDATE public.warehouse_tasks
  SET status = 'done',
      completed_at = now(),
      updated_at = now(),
      meta = jsonb_set(
        jsonb_set(meta, '{target_location_id}', to_jsonb(v_target_location_id::text)),
        '{completed_by}', to_jsonb(COALESCE(p_personnel_id, ''))
      )
  WHERE id = p_task_id;

  -- 6. Olay kaydı ekle
  INSERT INTO public.warehouse_task_events (
    task_id,
    event_type,
    from_status,
    to_status,
    personnel_id,
    payload
  ) VALUES (
    p_task_id,
    'completed',
    v_task.status,
    'done',
    p_personnel_id,
    jsonb_build_object(
      'target_location_id', v_target_location_id,
      'out_movement_id', v_out_movement_id,
      'in_movement_id', v_in_movement_id,
      'quantity', v_qty
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'out_movement_id', v_out_movement_id,
    'in_movement_id', v_in_movement_id
  );
END;
$$;
