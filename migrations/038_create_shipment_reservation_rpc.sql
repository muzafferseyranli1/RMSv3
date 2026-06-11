-- Create shipment with reservations RPC and update confirm shipment RPC
CREATE OR REPLACE FUNCTION public.create_warehouse_shipment_with_reservations(
  p_branch_id UUID,
  p_purchase_order_ids UUID[],
  p_shipment_draft JSONB,
  p_plate_number TEXT,
  p_driver_info TEXT,
  p_notes TEXT,
  p_vehicle_id UUID
) RETURNS UUID AS $$
DECLARE
  v_supplier_id UUID;
  v_shipment_no TEXT;
  v_shipment_id UUID;
  v_order_id UUID;
  v_draft_item RECORD;
  v_po_line RECORD;

  -- variables for cursor / stock picking
  v_cursor_opened BOOLEAN := false;
  v_stock_fetched BOOLEAN;
  v_curr_location_id UUID;
  v_curr_lpn_id UUID;
  v_curr_lot_number TEXT;
  v_curr_expiration_date DATE;
  v_curr_stock_qty NUMERIC;
  v_curr_stock_remaining NUMERIC;

  v_remaining_for_po_lines NUMERIC;
  v_line_shipped_qty NUMERIC;
  v_initial_line_shipped_qty NUMERIC;
  v_take_qty NUMERIC;
  v_reservation_id UUID;
  v_line_picks JSONB;
  v_shipment_line_id UUID;
  v_item_name TEXT;

  -- cursor definition
  c_stock CURSOR (cp_stock_item_id UUID) FOR
    SELECT location_id, lpn_id, lot_number, expiration_date, pickable_qty
    FROM public.v_wms_pickable_stock
    WHERE branch_id = p_branch_id
      AND stock_item_id = cp_stock_item_id
      AND pickable_qty > 0
    ORDER BY expiration_date ASC NULLS LAST, location_id, lpn_id;
BEGIN
  -- 1. Check active depot authority
  SELECT id INTO v_supplier_id
  FROM public.suppliers
  WHERE source_branch_id = p_branch_id
    AND supplier_kind = 'internal_warehouse'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Depo yetkilendirmesi bulunamadı veya aktif depo geçersiz.';
  END IF;

  -- 2. Validate and lock purchase orders
  PERFORM id
  FROM public.purchase_orders
  WHERE id = ANY(p_purchase_order_ids)
    AND deleted_at IS NULL
  FOR UPDATE;

  -- Verify all orders belong to the branch's supplier
  IF EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.id = ANY(p_purchase_order_ids)
      AND po.supplier_id <> v_supplier_id
      AND po.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Seçili siparişlerden biri veya birkaçı bu depoya ait değil.';
  END IF;

  -- Lock all order lines
  PERFORM id
  FROM public.purchase_order_lines
  WHERE order_id = ANY(p_purchase_order_ids)
    AND deleted_at IS NULL
  FOR UPDATE;

  -- 3. Generate unique shipment number
  LOOP
    v_shipment_no := 'SH-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.warehouse_shipments WHERE shipment_no = v_shipment_no
    );
  END LOOP;

  -- 4. Create warehouse_shipment
  INSERT INTO public.warehouse_shipments (
    shipment_no,
    source_branch_id,
    vehicle_id,
    plate_number,
    driver_info,
    status,
    notes,
    meta
  ) VALUES (
    v_shipment_no,
    p_branch_id,
    p_vehicle_id,
    p_plate_number,
    p_driver_info,
    'draft',
    p_notes,
    '{}'::jsonb
  ) RETURNING id INTO v_shipment_id;

  -- 5. Create warehouse_shipment_orders
  FOREACH v_order_id IN ARRAY p_purchase_order_ids LOOP
    INSERT INTO public.warehouse_shipment_orders (
      shipment_id,
      purchase_order_id
    ) VALUES (
      v_shipment_id,
      v_order_id
    );
  END LOOP;

  -- 6. Allocate stock and create shipment lines & reservations
  FOR v_draft_item IN
    SELECT key::UUID AS stock_item_id, value::NUMERIC AS shipped_qty
    FROM jsonb_each(p_shipment_draft)
  LOOP
    IF v_draft_item.shipped_qty > 0 THEN
      -- Initialize cursor tracking
      v_cursor_opened := false;
      v_stock_fetched := false;
      v_curr_stock_remaining := 0;

      v_remaining_for_po_lines := v_draft_item.shipped_qty;

      -- Loop over purchase order lines for this stock item across selected POs
      FOR v_po_line IN
        SELECT pol.id AS line_id, pol.ordered_qty, pol.unit_price, pol.meta
        FROM public.purchase_order_lines pol
        WHERE pol.order_id = ANY(p_purchase_order_ids)
          AND pol.stock_item_id = v_draft_item.stock_item_id
          AND pol.deleted_at IS NULL
        ORDER BY pol.created_at ASC
      LOOP
        v_line_shipped_qty := LEAST(v_po_line.ordered_qty, v_remaining_for_po_lines);
        v_initial_line_shipped_qty := v_line_shipped_qty;
        v_remaining_for_po_lines := v_remaining_for_po_lines - v_line_shipped_qty;

        IF v_line_shipped_qty > 0 THEN
          v_line_picks := '[]'::jsonb;
          v_shipment_line_id := gen_random_uuid();

          -- Allocate from physical pickable stock
          WHILE v_line_shipped_qty > 0 LOOP
            IF NOT v_stock_fetched OR v_curr_stock_remaining <= 0 THEN
              -- Open cursor if not already done
              IF NOT v_cursor_opened THEN
                OPEN c_stock(v_draft_item.stock_item_id);
                v_cursor_opened := true;
              END IF;

              FETCH c_stock INTO v_curr_location_id, v_curr_lpn_id, v_curr_lot_number, v_curr_expiration_date, v_curr_stock_qty;

              IF NOT FOUND THEN
                -- Close cursor and raise error
                CLOSE c_stock;
                v_cursor_opened := false;

                SELECT name INTO v_item_name FROM public.stock_items WHERE id = v_draft_item.stock_item_id;
                RAISE EXCEPTION 'Stok yetersiz! "%" ürünü için depoda yeterli pickable stok bulunmamaktadır.', COALESCE(v_item_name, 'Bilinmeyen Ürün');
              END IF;

              v_curr_stock_remaining := v_curr_stock_qty;
              v_stock_fetched := true;
            END IF;

            v_take_qty := LEAST(v_curr_stock_remaining, v_line_shipped_qty);
            v_curr_stock_remaining := v_curr_stock_remaining - v_take_qty;
            v_line_shipped_qty := v_line_shipped_qty - v_take_qty;

            -- Insert reservation
            INSERT INTO public.warehouse_reservations (
              branch_id,
              stock_item_id,
              location_id,
              lpn_id,
              lot_number,
              expiration_date,
              source_doc_type,
              source_doc_id,
              source_line_id,
              reserved_qty,
              status,
              reserved_by,
              reserved_at
            ) VALUES (
              p_branch_id,
              v_draft_item.stock_item_id,
              v_curr_location_id,
              v_curr_lpn_id,
              v_curr_lot_number,
              v_curr_expiration_date,
              'warehouse_shipment',
              v_shipment_id,
              v_shipment_line_id,
              v_take_qty,
              'active',
              'System (WMS RPC)',
              now()
            ) RETURNING id INTO v_reservation_id;

            -- Append pick info
            v_line_picks := v_line_picks || jsonb_build_array(
              jsonb_build_object(
                'reservation_id', v_reservation_id,
                'location_id', v_curr_location_id,
                'lpn_id', v_curr_lpn_id,
                'lot_number', v_curr_lot_number,
                'expiration_date', v_curr_expiration_date,
                'qty', v_take_qty
              )
            );
          END LOOP;

          -- Create shipment line
          INSERT INTO public.warehouse_shipment_lines (
            id,
            shipment_id,
            purchase_order_line_id,
            stock_item_id,
            shipped_qty,
            unit_price,
            line_total,
            meta
          ) VALUES (
            v_shipment_line_id,
            v_shipment_id,
            v_po_line.line_id,
            v_draft_item.stock_item_id,
            v_initial_line_shipped_qty,
            v_po_line.unit_price,
            v_initial_line_shipped_qty * v_po_line.unit_price,
            jsonb_build_object('picks', v_line_picks)
          );

          -- Update purchase order line
          DECLARE
            v_next_meta JSONB;
          BEGIN
            v_next_meta := COALESCE(v_po_line.meta, '{}'::jsonb);
            IF NOT (v_next_meta ? 'original_ordered_qty') THEN
              v_next_meta := v_next_meta || jsonb_build_object('original_ordered_qty', v_po_line.ordered_qty);
            END IF;

            UPDATE public.purchase_order_lines
            SET ordered_qty = v_initial_line_shipped_qty,
                line_total = v_initial_line_shipped_qty * unit_price,
                meta = v_next_meta,
                updated_at = now()
            WHERE id = v_po_line.line_id;
          END;
        END IF;
      END LOOP;

      -- Close cursor if open
      IF v_cursor_opened THEN
        CLOSE c_stock;
        v_cursor_opened := false;
      END IF;
    END IF;
  END LOOP;

  -- 7. Recalculate purchase order totals
  FOREACH v_order_id IN ARRAY p_purchase_order_ids LOOP
    UPDATE public.purchase_orders
    SET total_qty = COALESCE((SELECT SUM(ordered_qty) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
        total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
        subtotal = COALESCE((SELECT SUM(line_total) FROM public.purchase_order_lines WHERE order_id = v_order_id AND deleted_at IS NULL), 0),
        updated_at = now()
    WHERE id = v_order_id;
  END LOOP;

  RETURN v_shipment_id;
END;
$$ LANGUAGE plpgsql;

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

            -- Consume associated reservation if present
            IF v_pick.reservation_id IS NOT NULL THEN
              UPDATE public.warehouse_reservations
              SET status = 'consumed',
                  consumed_at = now(),
                  updated_at = now()
              WHERE id = v_pick.reservation_id;
            END IF;
          END IF;
        END LOOP;
      ELSE
        -- Fallback if no picks array (e.g. manual DB inserts)
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
