-- Trigger for automatic pick task creation, complete shipment task RPC, and updated confirm/cancel shipment RPCs
-- 1. Trigger function to create pick tasks upon shipment line creation
CREATE OR REPLACE FUNCTION public.wms_create_pick_tasks_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pick RECORD;
  v_item_name TEXT;
  v_unit TEXT;
  v_shipment_no TEXT;
  v_branch_id UUID;
BEGIN
  -- Select shipment info
  SELECT shipment_no, source_branch_id INTO v_shipment_no, v_branch_id
  FROM public.warehouse_shipments
  WHERE id = NEW.shipment_id;

  SELECT name, unit INTO v_item_name, v_unit
  FROM public.stock_items
  WHERE id = NEW.stock_item_id;

  -- Loop over picks array in meta and insert a pick task for each entry
  IF NEW.meta IS NOT NULL AND NEW.meta ? 'picks' AND jsonb_typeof(NEW.meta->'picks') = 'array' THEN
    FOR v_pick IN 
      SELECT * FROM jsonb_to_recordset(NEW.meta->'picks') 
      AS x(reservation_id UUID, location_id UUID, lpn_id UUID, lot_number TEXT, expiration_date DATE, qty NUMERIC) 
    LOOP
      IF v_pick.qty > 0 THEN
        INSERT INTO public.warehouse_tasks (
          branch_id,
          task_type,
          status,
          priority,
          source_doc_type,
          source_doc_id,
          source_line_id,
          description,
          meta
        ) VALUES (
          v_branch_id,
          'pick',
          'pending',
          'normal',
          'warehouse_shipment',
          NEW.shipment_id,
          NEW.id,
          COALESCE(v_item_name, 'Bilinmeyen Ürün') || ' (' || v_pick.qty::TEXT || ' ' || COALESCE(v_unit, 'Adet') || ') Toplama Görevi - Sevk: ' || COALESCE(v_shipment_no, ''),
          jsonb_build_object(
            'reservation_id', v_pick.reservation_id,
            'location_id', v_pick.location_id,
            'lpn_id', v_pick.lpn_id,
            'lot_number', v_pick.lot_number,
            'expiration_date', v_pick.expiration_date,
            'quantity', v_pick.qty,
            'stock_item_id', NEW.stock_item_id
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wms_create_pick_tasks ON public.warehouse_shipment_lines;
CREATE TRIGGER trg_wms_create_pick_tasks
  AFTER INSERT ON public.warehouse_shipment_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.wms_create_pick_tasks_trigger();

-- 2. Complete warehouse shipment task (pick/pack/load) RPC
CREATE OR REPLACE FUNCTION public.complete_warehouse_shipment_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_picked_qty NUMERIC
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

    -- Add event record
    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id, payload)
    VALUES (p_task_id, 'completed', v_task.status, v_next_status, p_personnel_id, jsonb_build_object('picked_qty', v_picked_qty, 'requested_qty', v_req_qty));

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

    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id)
    VALUES (p_task_id, 'completed', v_task.status, 'done', p_personnel_id);

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

    INSERT INTO public.warehouse_task_events (task_id, event_type, from_status, to_status, personnel_id)
    VALUES (p_task_id, 'completed', v_task.status, 'done', p_personnel_id);

  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'next_task_id', v_next_task_id,
    'status', COALESCE(v_next_status, 'done')
  );
END;
$$;

-- 3. Updated confirm_warehouse_shipment RPC with tasks guard check
CREATE OR REPLACE FUNCTION public.confirm_warehouse_shipment(
  p_shipment_id UUID,
  p_branch_id UUID,
  p_branch_name TEXT
) RETURNS VOID AS $$
DECLARE
  v_shipment_no TEXT;
  v_source_branch_id UUID;
  v_plate_number TEXT;
  v_driver_info TEXT;
  v_notes TEXT;
  v_status TEXT;
  v_line RECORD;
  v_pick RECORD;
  v_order RECORD;
  v_meta JSONB;
  v_next_meta JSONB;

  -- locked reservation fields
  v_res_id UUID;
  v_res_location_id UUID;
  v_res_lpn_id UUID;
  v_res_lot_number TEXT;
  v_res_expiration_date DATE;
  v_res_qty NUMERIC;
  v_res_status TEXT;
BEGIN
  -- 1. Select and lock the shipment row to enforce idempotency
  SELECT shipment_no, source_branch_id, plate_number, driver_info, notes, status
  INTO v_shipment_no, v_source_branch_id, v_plate_number, v_driver_info, v_notes, v_status
  FROM public.warehouse_shipments
  WHERE id = p_shipment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sevkiyat bulunamadı.';
  END IF;

  IF v_source_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'Yetkisiz depo işlemi: Sevkiyat deposu ile aktif depo uyuşmuyor.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Sevkiyat taslak durumunda değil (Mevcut durum: %).', v_status;
  END IF;

  -- WMS-02C Guard: Verify all warehouse tasks related to this shipment are completed
  IF EXISTS (
    SELECT 1
    FROM public.warehouse_tasks
    WHERE source_doc_type = 'warehouse_shipment'
      AND source_doc_id = p_shipment_id
      AND status NOT IN ('done', 'cancelled', 'exception')
  ) THEN
    RAISE EXCEPTION 'Bu sevkiyata bağlı tamamlanmamış depo görevleri (toplama, paketleme vb.) bulunmaktadır. Lütfen önce görevleri tamamlayın.';
  END IF;

  -- 2. Update status to 'in_transit'
  UPDATE public.warehouse_shipments
  SET status = 'in_transit',
      shipped_at = now(),
      updated_at = now()
  WHERE id = p_shipment_id;

  -- 3. Loop over shipment lines and generate stock exits
  FOR v_line IN
    SELECT wsl.*, si.name AS item_name
    FROM public.warehouse_shipment_lines wsl
    LEFT JOIN public.stock_items si ON si.id = wsl.stock_item_id
    WHERE wsl.shipment_id = p_shipment_id AND wsl.deleted_at IS NULL
  LOOP
    IF v_line.shipped_qty > 0 THEN
      -- Check if meta has 'picks' array
      IF v_line.meta ? 'picks' AND jsonb_typeof(v_line.meta->'picks') = 'array' THEN
        -- Loop over picks
        FOR v_pick IN
          SELECT * FROM jsonb_to_recordset(v_line.meta->'picks')
          AS x(location_id UUID, lpn_id UUID, lot_number TEXT, expiration_date DATE, qty NUMERIC, reservation_id UUID)
        LOOP
          IF v_pick.qty > 0 THEN
            -- Check reservation existence
            IF v_pick.reservation_id IS NULL THEN
              RAISE EXCEPTION 'Sevkiyat satırında rezervasyon ID bilgisi bulunmamaktadır.';
            END IF;

            -- Select and lock the reservation row
            SELECT id, location_id, lpn_id, lot_number, expiration_date, reserved_qty, status
            INTO v_res_id, v_res_location_id, v_res_lpn_id, v_res_lot_number, v_res_expiration_date, v_res_qty, v_res_status
            FROM public.warehouse_reservations
            WHERE id = v_pick.reservation_id
            FOR UPDATE;

            IF NOT FOUND THEN
              RAISE EXCEPTION 'İlgili rezervasyon bulunamadı (ID: %).', v_pick.reservation_id;
            END IF;

            IF v_res_status <> 'active' THEN
              RAISE EXCEPTION 'Rezervasyon aktif değil (ID: %, Durum: %).', v_pick.reservation_id, v_res_status;
            END IF;

            IF v_res_qty <> v_pick.qty THEN
              RAISE EXCEPTION 'Rezervasyon miktarı ile sevk miktarı uyuşmuyor (Rezervasyon: %, Sevk: %).', v_res_qty, v_pick.qty;
            END IF;

            -- Insert inventory movement (without generated quantity_signed and total_cost_signed columns)
            INSERT INTO public.inventory_movements (
              item_type,
              stock_item_id,
              item_name,
              branch_id,
              branch_name,
              movement_type,
              source_doc_type,
              direction,
              movement_at,
              quantity,
              unit_cost,
              total_cost,
              location_id,
              lpn_id,
              lot_number,
              expiration_date,
              meta
            ) VALUES (
              'stock_item',
              v_line.stock_item_id,
              COALESCE(v_line.item_name, 'Bilinmeyen Ürün'),
              p_branch_id,
              p_branch_name,
              'transfer_out',
              'transfer',
              'out',
              now(),
              v_pick.qty,
              v_line.unit_price,
              v_pick.qty * v_line.unit_price,
              v_pick.location_id,
              v_pick.lpn_id,
              v_pick.lot_number,
              v_pick.expiration_date,
              jsonb_build_object(
                'shipment_id', p_shipment_id,
                'shipment_no', v_shipment_no,
                'availability_status', 'available'
              )
            );

            -- Consume reservation
            UPDATE public.warehouse_reservations
            SET status = 'consumed',
                consumed_at = now(),
                updated_at = now()
            WHERE id = v_res_id;
          END IF;
        END LOOP;
      ELSE
        -- Fallback if no picks array
        INSERT INTO public.inventory_movements (
          item_type,
          stock_item_id,
          item_name,
          branch_id,
          branch_name,
          movement_type,
          source_doc_type,
          direction,
          movement_at,
          quantity,
          unit_cost,
          total_cost,
          meta
        ) VALUES (
          'stock_item',
          v_line.stock_item_id,
          COALESCE(v_line.item_name, 'Bilinmeyen Ürün'),
          p_branch_id,
          p_branch_name,
          'transfer_out',
          'transfer',
          'out',
          now(),
          v_line.shipped_qty,
          v_line.unit_price,
          v_line.shipped_qty * v_line.unit_price,
          jsonb_build_object(
            'shipment_id', p_shipment_id,
            'shipment_no', v_shipment_no,
            'availability_status', 'available'
          )
        );
      END IF;
    END IF;
  END LOOP;

  -- 4. Update associated Purchase Order meta
  FOR v_order IN
    SELECT po.*
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND wso.deleted_at IS NULL
  LOOP
    -- Build new metadata
    v_meta := COALESCE(v_order.meta, '{}'::jsonb);
    v_next_meta := v_meta || jsonb_build_object(
      'supplier_marked_sent', true,
      'supplier_sent_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'shipment_id', p_shipment_id,
      'shipment_no', v_shipment_no,
      'shipped_at', now(),
      'plate_number', v_plate_number,
      'driver_info', v_driver_info,
      'supplier_dispatch', jsonb_build_object(
        'delivered_on', to_char(now(), 'YYYY-MM-DD'),
        'delivered_at', to_char(now(), 'HH24:MI'),
        'doc_kind', 'irsaliye',
        'doc_date', to_char(now(), 'YYYY-MM-DD'),
        'doc_no', v_shipment_no,
        'plate_number', v_plate_number,
        'driver_info', v_driver_info,
        'note', COALESCE(v_notes, 'Araç ile sevk edildi.')
      )
    );

    UPDATE public.purchase_orders
    SET meta = v_next_meta,
        updated_at = now()
    WHERE id = v_order.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. Updated cancel_warehouse_shipment RPC with tasks cancellation logic
CREATE OR REPLACE FUNCTION public.cancel_warehouse_shipment(
  p_shipment_id UUID,
  p_branch_id UUID
) RETURNS VOID AS $$
DECLARE
  v_source_branch_id UUID;
  v_status TEXT;
  v_line RECORD;
  v_po_line RECORD;
  v_order RECORD;
  v_meta JSONB;
  v_orig_qty NUMERIC;
BEGIN
  -- 1. Select and lock the shipment row
  SELECT source_branch_id, status
  INTO v_source_branch_id, v_status
  FROM public.warehouse_shipments
  WHERE id = p_shipment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sevkiyat bulunamadı.';
  END IF;

  IF v_source_branch_id <> p_branch_id THEN
    RAISE EXCEPTION 'Yetkisiz depo işlemi: Sevkiyat deposu ile aktif depo uyuşmuyor.';
  END IF;

  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'Yalnızca taslak durumundaki sevkiyatlar iptal edilebilir (Mevcut durum: %).', v_status;
  END IF;

  -- 2. Update shipment status to 'cancelled'
  UPDATE public.warehouse_shipments
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_shipment_id;

  -- 2b. Cancel all associated active WMS tasks
  UPDATE public.warehouse_tasks
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status NOT IN ('done', 'cancelled', 'exception');

  -- 3. Release/cancel all associated active reservations
  UPDATE public.warehouse_reservations
  SET status = 'cancelled',
      released_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status = 'active';

  -- 4. Restore original quantities to purchase order lines
  FOR v_line IN
    SELECT * FROM public.warehouse_shipment_lines
    WHERE shipment_id = p_shipment_id AND deleted_at IS NULL
  LOOP
    SELECT * INTO v_po_line
    FROM public.purchase_order_lines
    WHERE id = v_line.purchase_order_line_id AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND THEN
      v_meta := COALESCE(v_po_line.meta, '{}'::jsonb);
      IF v_meta ? 'original_ordered_qty' THEN
        v_orig_qty := (v_meta->>'original_ordered_qty')::NUMERIC;

        -- Delete the original_ordered_qty property from the metadata object
        v_meta := v_meta - 'original_ordered_qty';

        UPDATE public.purchase_order_lines
        SET ordered_qty = v_orig_qty,
            line_total = v_orig_qty * unit_price,
            meta = v_meta,
            updated_at = now()
        WHERE id = v_po_line.id;
      END IF;
    END IF;
  END LOOP;

  -- 5. Recalculate purchase order totals for associated orders
  FOR v_order IN
    SELECT po.*
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND wso.deleted_at IS NULL
  LOOP
    UPDATE public.purchase_orders
    SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order.id AND deleted_at IS NULL), 0),
        updated_at = now()
    WHERE id = v_order.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5. Shipment Status Guard Trigger
CREATE OR REPLACE FUNCTION public.wms_shipment_status_guard_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status transitions to ready_to_load or in_transit, all pick tasks must be completed/cancelled
  IF NEW.status IN ('ready_to_load', 'in_transit') THEN
    IF EXISTS (
      SELECT 1
      FROM public.warehouse_tasks
      WHERE source_doc_type = 'warehouse_shipment'
        AND source_doc_id = NEW.id
        AND task_type = 'pick'
        AND status NOT IN ('done', 'cancelled', 'exception')
    ) THEN
      RAISE EXCEPTION 'Bu sevkiyata bağlı tamamlanmamış toplama (pick) görevleri bulunmaktadır. Sevkiyat durumu % yapılamaz.', NEW.status;
    END IF;
  END IF;

  -- If status transitions to in_transit (confirm_warehouse_shipment), all warehouse tasks (pick, pack, load) must be completed/cancelled
  IF NEW.status = 'in_transit' THEN
    IF EXISTS (
      SELECT 1
      FROM public.warehouse_tasks
      WHERE source_doc_type = 'warehouse_shipment'
        AND source_doc_id = NEW.id
        AND status NOT IN ('done', 'cancelled', 'exception')
    ) THEN
      RAISE EXCEPTION 'Bu sevkiyata bağlı tamamlanmamış depo görevleri (toplama, paketleme, yükleme vb.) bulunmaktadır. Lütfen önce görevleri tamamlayın.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wms_shipment_status_guard ON public.warehouse_shipments;
CREATE TRIGGER trg_wms_shipment_status_guard
  BEFORE UPDATE OF status ON public.warehouse_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.wms_shipment_status_guard_trigger();
