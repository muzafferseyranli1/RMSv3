-- Update confirm_warehouse_shipment RPC to strictly validate/consume reservations and add cancel_warehouse_shipment RPC
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

            -- Insert inventory movement using fields from the locked reservation row
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
              v_res_qty,
              v_line.unit_price,
              v_res_qty * v_line.unit_price,
              v_res_location_id,
              v_res_lpn_id,
              v_res_lot_number,
              v_res_expiration_date,
              jsonb_build_object(
                'shipment_id', p_shipment_id,
                'shipment_no', v_shipment_no,
                'reservation_id', v_res_id,
                'availability_status', 'available'
              )
            );

            -- Mark reservation as consumed
            UPDATE public.warehouse_reservations
            SET status = 'consumed',
                consumed_at = now(),
                updated_at = now()
            WHERE id = v_res_id;
          END IF;
        END LOOP;
      ELSE
        -- Fallback if no picks array (e.g. manual DB inserts)
        RAISE EXCEPTION 'Picks array bulunmayan sevkiyat onaylanamaz.';
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
