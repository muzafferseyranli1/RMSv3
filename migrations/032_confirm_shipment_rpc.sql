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
          AS x(location_id UUID, lpn_id UUID, lot_number TEXT, expiration_date DATE, qty NUMERIC) 
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
