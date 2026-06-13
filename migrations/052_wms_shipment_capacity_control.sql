-- WMS Phase 4.5: shipment lines capacity control, temperature compliance checks, and overrides

-- 1. Ensure columns exist on warehouse_shipment_lines
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS package_unit_id UUID REFERENCES public.stock_item_package_units(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS package_qty NUMERIC(18,4);
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS base_qty NUMERIC(18,4);
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS line_volume_m3 NUMERIC(18,6);
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS line_gross_weight_kg NUMERIC(18,4);

-- 2. Retrofit existing null columns for shipment lines
UPDATE public.warehouse_shipment_lines wsl
SET package_unit_id = pkg.id,
    package_qty = wsl.shipped_qty / COALESCE(NULLIF(pkg.base_quantity, 0), 1.0),
    base_qty = wsl.shipped_qty,
    line_volume_m3 = COALESCE(pkg.volume_m3, 0) * (wsl.shipped_qty / COALESCE(NULLIF(pkg.base_quantity, 0), 1.0)),
    line_gross_weight_kg = COALESCE(pkg.gross_weight_kg, 0) * (wsl.shipped_qty / COALESCE(NULLIF(pkg.base_quantity, 0), 1.0))
FROM (
  SELECT DISTINCT ON (stock_item_id) id, stock_item_id, base_quantity, volume_m3, gross_weight_kg
  FROM public.stock_item_package_units
  WHERE active = true
  ORDER BY stock_item_id, is_default_shipping_unit DESC, is_base_unit DESC, created_at ASC
) pkg
WHERE wsl.stock_item_id = pkg.stock_item_id AND wsl.package_unit_id IS NULL;

-- 3. Define or replace the shipment capacity calculation RPC
CREATE OR REPLACE FUNCTION public.get_warehouse_shipment_capacity(p_shipment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment public.warehouse_shipments%ROWTYPE;
  v_vehicle public.vehicles%ROWTYPE;
  v_total_vol NUMERIC;
  v_total_weight NUMERIC;
  v_mismatched_items JSONB := '[]'::jsonb;
  v_is_temp_mismatched BOOLEAN := false;
  v_is_volume_exceeded BOOLEAN := false;
  v_is_weight_exceeded BOOLEAN := false;
  v_is_exceeded BOOLEAN := false;
  v_is_override_active BOOLEAN := false;
  v_vehicle_temp TEXT;
BEGIN
  -- Get shipment
  SELECT * INTO v_shipment FROM public.warehouse_shipments WHERE id = p_shipment_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sevkiyat bulunamadı');
  END IF;

  -- Get vehicle if exists
  IF v_shipment.vehicle_id IS NOT NULL THEN
    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_shipment.vehicle_id;
  END IF;

  -- Sum shipment lines metrics
  SELECT 
    COALESCE(SUM(line_volume_m3), 0),
    COALESCE(SUM(line_gross_weight_kg), 0)
  INTO v_total_vol, v_total_weight
  FROM public.warehouse_shipment_lines
  WHERE shipment_id = p_shipment_id AND deleted_at IS NULL;

  -- Check override state
  IF COALESCE(v_shipment.meta->>'capacity_override', 'false') = 'true' THEN
    v_is_override_active := true;
  END IF;

  -- Temperature checks
  IF v_vehicle.id IS NOT NULL THEN
    v_vehicle_temp := COALESCE(v_vehicle.temperature_class, 'dry');
    
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stock_item_id', m.stock_item_id,
      'item_name', m.item_name,
      'item_temp', m.item_temp,
      'vehicle_temp', m.vehicle_temp
    )), '[]'::jsonb)
    INTO v_mismatched_items
    FROM (
      SELECT 
        wsl.stock_item_id,
        si.name AS item_name,
        COALESCE(si.temperature_class, 'dry') AS item_temp,
        v_vehicle_temp AS vehicle_temp
      FROM public.warehouse_shipment_lines wsl
      JOIN public.stock_items si ON si.id = wsl.stock_item_id
      WHERE wsl.shipment_id = p_shipment_id 
        AND wsl.deleted_at IS NULL
        AND (
          (v_vehicle_temp = 'dry' AND COALESCE(si.temperature_class, 'dry') NOT IN ('dry'))
          OR
          (v_vehicle_temp = 'cold' AND COALESCE(si.temperature_class, 'dry') NOT IN ('cold', 'dry'))
          OR
          (v_vehicle_temp = 'frozen' AND COALESCE(si.temperature_class, 'dry') NOT IN ('frozen'))
          -- 'multi_temp' allows everything
        )
    ) m;

    IF jsonb_array_length(v_mismatched_items) > 0 THEN
      v_is_temp_mismatched := true;
    END IF;

    -- Volume limit check
    IF v_vehicle.max_volume_m3 IS NOT NULL AND v_vehicle.max_volume_m3 > 0 AND v_total_vol > v_vehicle.max_volume_m3 THEN
      v_is_volume_exceeded := true;
    END IF;

    -- Weight limit check
    IF v_vehicle.max_weight_kg IS NOT NULL AND v_vehicle.max_weight_kg > 0 AND v_total_weight > v_vehicle.max_weight_kg THEN
      v_is_weight_exceeded := true;
    END IF;

    IF v_is_volume_exceeded OR v_is_weight_exceeded THEN
      v_is_exceeded := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'shipment_id', p_shipment_id,
    'vehicle_id', v_shipment.vehicle_id,
    'plate_number', COALESCE(v_vehicle.plate_number, v_shipment.plate_number),
    'total_volume_m3', round(v_total_vol::numeric, 4),
    'total_weight_kg', round(v_total_weight::numeric, 2),
    'vehicle_max_volume_m3', COALESCE(v_vehicle.max_volume_m3, 0),
    'vehicle_max_weight_kg', COALESCE(v_vehicle.max_weight_kg, 0),
    'remaining_volume_m3', round((COALESCE(v_vehicle.max_volume_m3, 0) - v_total_vol)::numeric, 4),
    'remaining_weight_kg', round((COALESCE(v_vehicle.max_weight_kg, 0) - v_total_weight)::numeric, 2),
    'is_volume_exceeded', v_is_volume_exceeded,
    'is_weight_exceeded', v_is_weight_exceeded,
    'is_exceeded', v_is_exceeded,
    'is_temperature_mismatched', v_is_temp_mismatched,
    'mismatched_items', v_mismatched_items,
    'is_override_active', v_is_override_active,
    'override_details', CASE WHEN v_is_override_active THEN v_shipment.meta ELSE NULL END
  );
END;
$$;

-- 4. Redefine create_warehouse_shipment_with_reservations to populate dimensions and weight
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
  v_pkg RECORD;

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

          -- Fetch packaging unit details
          SELECT id, base_quantity, volume_m3, gross_weight_kg
          INTO v_pkg
          FROM public.stock_item_package_units
          WHERE stock_item_id = v_draft_item.stock_item_id AND active = true
          ORDER BY is_default_shipping_unit DESC, is_base_unit DESC, created_at ASC
          LIMIT 1;

          -- Create shipment line
          INSERT INTO public.warehouse_shipment_lines (
            id,
            shipment_id,
            purchase_order_line_id,
            stock_item_id,
            shipped_qty,
            unit_price,
            line_total,
            meta,
            package_unit_id,
            package_qty,
            base_qty,
            line_volume_m3,
            line_gross_weight_kg
          ) VALUES (
            v_shipment_line_id,
            v_shipment_id,
            v_po_line.line_id,
            v_draft_item.stock_item_id,
            v_initial_line_shipped_qty,
            v_po_line.unit_price,
            v_initial_line_shipped_qty * v_po_line.unit_price,
            jsonb_build_object('picks', v_line_picks),
            v_pkg.id,
            v_initial_line_shipped_qty / COALESCE(NULLIF(v_pkg.base_quantity, 0), 1.0),
            v_initial_line_shipped_qty,
            COALESCE(v_pkg.volume_m3, 0) * (v_initial_line_shipped_qty / COALESCE(NULLIF(v_pkg.base_quantity, 0), 1.0)),
            COALESCE(v_pkg.gross_weight_kg, 0) * (v_initial_line_shipped_qty / COALESCE(NULLIF(v_pkg.base_quantity, 0), 1.0))
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

-- 5. Redefine confirm_warehouse_shipment to enforce capacity and temperature limits
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
  SELECT shipment_no, source_branch_id, plate_number, driver_info, notes, status, meta
  INTO v_shipment_no, v_source_branch_id, v_plate_number, v_driver_info, v_notes, v_status, v_meta
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

  -- WMS-04G Capacity & Temperature Check
  DECLARE
    v_capacity_check JSONB;
  BEGIN
    v_capacity_check := public.get_warehouse_shipment_capacity(p_shipment_id);
    IF (v_capacity_check->>'is_exceeded')::BOOLEAN OR (v_capacity_check->>'is_temperature_mismatched')::BOOLEAN THEN
      IF COALESCE(v_meta->>'capacity_override', 'false') <> 'true' THEN
        IF (v_capacity_check->>'is_temperature_mismatched')::BOOLEAN THEN
          RAISE EXCEPTION 'Araç sıcaklık sınıfı ile sevk edilecek ürünlerin sıcaklık gereksinimleri uyuşmuyor. Onay için yönetici yetkilendirmesi (override) gerekmektedir.';
        ELSE
          RAISE EXCEPTION 'Araç taşıma kapasitesi (hacim veya ağırlık) aşılmıştır. Onay için yönetici yetkilendirmesi (override) gerekmektedir.';
        END IF;
      END IF;
    END IF;
  END;

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

  -- 4. Complete associated purchase orders if fully shipped
  FOR v_order IN
    SELECT po.id, po.status
    FROM public.purchase_orders po
    JOIN public.warehouse_shipment_orders wso ON wso.purchase_order_id = po.id
    WHERE wso.shipment_id = p_shipment_id AND po.deleted_at IS NULL
  LOOP
    -- check if all lines of this purchase order are shipped/satisfied
    UPDATE public.purchase_orders
    SET updated_at = now()
    WHERE id = v_order.id;
  END LOOP;

  -- 5. Complete all finished WMS tasks related to this shipment (if any are still 'doing')
  UPDATE public.warehouse_tasks
  SET status = 'done',
      completed_at = now(),
      updated_at = now()
  WHERE source_doc_type = 'warehouse_shipment'
    AND source_doc_id = p_shipment_id
    AND status IN ('doing', 'todo');
END;
$$ LANGUAGE plpgsql;
