-- Migration: WMS Phase 3 - Add evidence photo url to warehouse_task_events (WMS-03F)

-- Drop older 3-parameter function signatures to avoid overloading ambiguity
DROP FUNCTION IF EXISTS public.complete_warehouse_putaway_task(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.complete_warehouse_shipment_task(UUID, TEXT, NUMERIC);

-- 1. Update complete_warehouse_putaway_task function
CREATE OR REPLACE FUNCTION public.complete_warehouse_putaway_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_target_location_id UUID,
  p_evidence_photo_url TEXT DEFAULT NULL
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
    ) || CASE WHEN p_evidence_photo_url IS NOT NULL THEN jsonb_build_object('evidence_photo_url', p_evidence_photo_url) ELSE '{}'::jsonb END
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'out_movement_id', v_out_movement_id,
    'in_movement_id', v_in_movement_id
  );
END;
$$;


-- 2. Update complete_warehouse_shipment_task function
CREATE OR REPLACE FUNCTION public.complete_warehouse_shipment_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_picked_qty NUMERIC,
  p_evidence_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_shipment public.warehouse_shipments%ROWTYPE;
  v_res_id UUID;
  v_shipment_line_id UUID;
  v_diff_qty NUMERIC;
  v_picked_qty NUMERIC := p_picked_qty;
  v_req_qty NUMERIC;
  v_next_status TEXT;
  v_next_task_id UUID;
  v_pack_required BOOLEAN := false;
  v_load_required BOOLEAN := false;
BEGIN
  -- 1. Lock and retrieve task
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Görev zaten tamamlanmış veya iptal edilmiş.';
  END IF;

  -- 2. Lock and retrieve shipment to check pipeline options
  SELECT * INTO v_shipment
  FROM public.warehouse_shipments
  WHERE id = v_task.source_doc_id
  FOR UPDATE;

  v_pack_required := COALESCE((v_shipment.meta->>'pack_required')::BOOLEAN, false);
  v_load_required := COALESCE((v_shipment.meta->>'load_required')::BOOLEAN, false);

  -- 3. Handle task type execution
  IF v_task.task_type = 'pick' THEN
    v_res_id := (v_task.meta->>'reservation_id')::UUID;
    v_shipment_line_id := v_task.source_line_id;
    v_req_qty := (v_task.meta->>'quantity')::NUMERIC;

    IF v_picked_qty IS NULL THEN
      v_picked_qty := v_req_qty;
    END IF;

    IF v_picked_qty < 0 OR v_picked_qty > v_req_qty THEN
      RAISE EXCEPTION 'Geçersiz toplama miktarı: %. İstenen miktar: %', v_picked_qty, v_req_qty;
    END IF;

    -- If picking was incomplete, update reservations, PO lines, and shipment line quantity
    IF v_picked_qty < v_req_qty THEN
      v_diff_qty := v_req_qty - v_picked_qty;

      -- A) Update reservation
      IF v_picked_qty = 0 THEN
        UPDATE public.warehouse_reservations
        SET status = 'cancelled', reserved_qty = 0, updated_at = now()
        WHERE id = v_res_id;
      ELSE
        UPDATE public.warehouse_reservations
        SET reserved_qty = v_picked_qty, updated_at = now()
        WHERE id = v_res_id;
      END IF;

      -- B) Update shipment line shipped_qty and meta.picks
      UPDATE public.warehouse_shipment_lines
      SET shipped_qty = shipped_qty - v_diff_qty,
          line_total = (shipped_qty - v_diff_qty) * unit_price,
          meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
            'picks',
            COALESCE(
              (
                SELECT jsonb_agg(
                  CASE 
                    WHEN (x->>'reservation_id')::UUID = v_res_id THEN
                      CASE WHEN v_picked_qty = 0 THEN NULL ELSE x || jsonb_build_object('qty', v_picked_qty) END
                    ELSE x 
                  END
                )
                FROM jsonb_array_elements(meta->'picks') AS x
                WHERE x IS NOT NULL AND (CASE WHEN (x->>'reservation_id')::UUID = v_res_id AND v_picked_qty = 0 THEN false ELSE true END)
              ),
              '[]'::jsonb
            )
          )
      WHERE id = v_shipment_line_id;

      -- C) Update purchase order line and recalculate PO totals
      DECLARE
        v_po_line_id UUID;
        v_order_id UUID;
        v_po_line_meta JSONB;
        v_po_line_ordered_qty NUMERIC;
      BEGIN
        SELECT purchase_order_line_id INTO v_po_line_id
        FROM public.warehouse_shipment_lines
        WHERE id = v_shipment_line_id;

        SELECT order_id, meta, ordered_qty INTO v_order_id, v_po_line_meta, v_po_line_ordered_qty
        FROM public.purchase_order_lines
        WHERE id = v_po_line_id;

        IF v_po_line_meta IS NULL THEN
          v_po_line_meta := '{}'::jsonb;
        END IF;

        IF NOT (v_po_line_meta ? 'original_ordered_qty') THEN
          v_po_line_meta := v_po_line_meta || jsonb_build_object('original_ordered_qty', v_po_line_ordered_qty);
        END IF;

        UPDATE public.purchase_order_lines
        SET ordered_qty = ordered_qty - v_diff_qty,
            line_total = (ordered_qty - v_diff_qty) * unit_price,
            meta = v_po_line_meta,
            updated_at = now()
        WHERE id = v_po_line_id;

        UPDATE public.purchase_orders
        SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
            total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
            subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
            updated_at = now()
        WHERE id = v_order_id;
      END;

      v_next_status := 'exception';
    ELSE
      v_next_status := 'done';
    END IF;

    -- Update pick task status
    UPDATE public.warehouse_tasks
    SET status = v_next_status,
        completed_at = now(),
        updated_at = now(),
        meta = meta || jsonb_build_object('picked_qty', v_picked_qty, 'completed_by', p_personnel_id)
    WHERE id = p_task_id;

    -- Add event record with optional evidence photo URL
    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id, payload)
    VALUES (
      p_task_id,
      'completed',
      v_task.status,
      v_next_status,
      p_personnel_id,
      jsonb_build_object('picked_qty', v_picked_qty, 'requested_qty', v_req_qty) ||
      CASE WHEN p_evidence_photo_url IS NOT NULL THEN jsonb_build_object('evidence_photo_url', p_evidence_photo_url) ELSE '{}'::jsonb END
    );

    -- D) Trigger Pack/Load pipelines if picked quantity > 0
    IF v_picked_qty > 0 THEN
      IF v_pack_required THEN
        INSERT INTO public.warehouse_tasks (
          branch_id, task_type, status, priority, source_doc_type, source_doc_id, source_line_id, description, meta
        ) VALUES (
          v_task.branch_id, 'pack', 'pending', 'normal', 'warehouse_shipment', v_task.source_doc_id, v_task.source_line_id,
          'Paketleme/Kontrol Görevi - Line: ' || v_task.source_line_id::TEXT,
          jsonb_build_object('parent_task_id', p_task_id, 'quantity', v_picked_qty, 'stock_item_id', v_task.meta->'stock_item_id')
        ) RETURNING id INTO v_next_task_id;
      ELSIF v_load_required THEN
        INSERT INTO public.warehouse_tasks (
          branch_id, task_type, status, priority, source_doc_type, source_doc_id, source_line_id, description, meta
        ) VALUES (
          v_task.branch_id, 'load', 'pending', 'normal', 'warehouse_shipment', v_task.source_doc_id, v_task.source_line_id,
          'Yükleme Görevi - Line: ' || v_task.source_line_id::TEXT,
          jsonb_build_object('parent_task_id', p_task_id, 'quantity', v_picked_qty, 'stock_item_id', v_task.meta->'stock_item_id')
        ) RETURNING id INTO v_next_task_id;
      END IF;
    END IF;

  ELSIF v_task.task_type = 'pack' THEN
    UPDATE public.warehouse_tasks
    SET status = 'done', completed_at = now(), updated_at = now(), meta = meta || jsonb_build_object('completed_by', p_personnel_id)
    WHERE id = p_task_id;

    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id, payload)
    VALUES (
      p_task_id,
      'completed',
      v_task.status,
      'done',
      p_personnel_id,
      CASE WHEN p_evidence_photo_url IS NOT NULL THEN jsonb_build_object('evidence_photo_url', p_evidence_photo_url) ELSE '{}'::jsonb END
    );

    IF v_load_required THEN
      INSERT INTO public.warehouse_tasks (
        branch_id, task_type, status, priority, source_doc_type, source_doc_id, source_line_id, description, meta
      ) VALUES (
        v_task.branch_id, 'load', 'pending', 'normal', 'warehouse_shipment', v_task.source_doc_id, v_task.source_line_id,
        'Yükleme Görevi - Line: ' || v_task.source_line_id::TEXT,
        jsonb_build_object('parent_task_id', p_task_id, 'quantity', v_task.meta->'quantity', 'stock_item_id', v_task.meta->'stock_item_id')
      ) RETURNING id INTO v_next_task_id;
    END IF;

  ELSIF v_task.task_type = 'load' THEN
    UPDATE public.warehouse_tasks
    SET status = 'done', completed_at = now(), updated_at = now(), meta = meta || jsonb_build_object('completed_by', p_personnel_id)
    WHERE id = p_task_id;

    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id, payload)
    VALUES (
      p_task_id,
      'completed',
      v_task.status,
      'done',
      p_personnel_id,
      CASE WHEN p_evidence_photo_url IS NOT NULL THEN jsonb_build_object('evidence_photo_url', p_evidence_photo_url) ELSE '{}'::jsonb END
    );

  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'next_task_id', v_next_task_id,
    'status', COALESCE(v_next_status, 'done')
  );
END;
$$;
