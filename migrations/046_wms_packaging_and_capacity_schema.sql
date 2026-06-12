-- 1. Create stock_item_package_units table
CREATE TABLE IF NOT EXISTS public.stock_item_package_units (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  unit_symbol TEXT,
  base_unit_name TEXT,
  base_quantity NUMERIC(18,4) NOT NULL DEFAULT 1.0,
  level_no INTEGER,
  is_base_unit BOOLEAN DEFAULT false NOT NULL,
  is_default_receiving_unit BOOLEAN DEFAULT false NOT NULL,
  is_default_picking_unit BOOLEAN DEFAULT false NOT NULL,
  is_default_shipping_unit BOOLEAN DEFAULT false NOT NULL,
  length_cm NUMERIC,
  width_cm NUMERIC,
  height_cm NUMERIC,
  gross_weight_kg NUMERIC,
  net_weight_kg NUMERIC,
  volume_m3 NUMERIC GENERATED ALWAYS AS ((length_cm * width_cm * height_cm) / 1000000.0) STORED,
  active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT stock_item_package_units_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_stock_item_pkg_units_item ON public.stock_item_package_units(stock_item_id);

-- 2. Add capacity & dimensions columns to vehicles
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_code TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT 'truck';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS temperature_class TEXT DEFAULT 'dry';
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS max_volume_m3 NUMERIC;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS max_weight_kg NUMERIC;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS inner_length_cm NUMERIC;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS inner_width_cm NUMERIC;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS inner_height_cm NUMERIC;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.company_nodes(id) ON DELETE SET NULL;
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS capacity_notes TEXT;

-- 3. Add packaging & weight/volume tracking columns to warehouse_shipment_lines
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS package_unit_id UUID REFERENCES public.stock_item_package_units(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS package_qty NUMERIC;
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS base_qty NUMERIC;
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS line_volume_m3 NUMERIC;
ALTER TABLE public.warehouse_shipment_lines ADD COLUMN IF NOT EXISTS line_gross_weight_kg NUMERIC;

-- 4. Add package relations to product_external_barcodes
ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS package_unit_id UUID REFERENCES public.stock_item_package_units(id) ON DELETE SET NULL;
ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS barcode_type TEXT DEFAULT 'EAN13';
ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS unit_type TEXT;
ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS unit_multiplier NUMERIC DEFAULT 1.0;
ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;
ALTER TABLE public.product_external_barcodes ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- 5. Create shipment capacity view / calculation function
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
  v_res JSONB;
BEGIN
  -- Get shipment
  SELECT * INTO v_shipment FROM public.warehouse_shipments WHERE id = p_shipment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sevkiyat bulunamadı');
  END IF;

  -- Get vehicle
  IF v_shipment.vehicle_id IS NOT NULL THEN
    SELECT * INTO v_vehicle FROM public.vehicles WHERE id = v_shipment.vehicle_id;
  END IF;

  -- Sum shipment lines metrics
  SELECT 
    COALESCE(SUM(line_volume_m3), 0),
    COALESCE(SUM(line_gross_weight_kg), 0)
  INTO v_total_vol, v_total_weight
  FROM public.warehouse_shipment_lines
  WHERE shipment_id = p_shipment_id;

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
    'is_volume_exceeded', (v_vehicle.max_volume_m3 IS NOT NULL AND v_vehicle.max_volume_m3 > 0 AND v_total_vol > v_vehicle.max_volume_m3),
    'is_weight_exceeded', (v_vehicle.max_weight_kg IS NOT NULL AND v_vehicle.max_weight_kg > 0 AND v_total_weight > v_vehicle.max_weight_kg),
    'is_exceeded', (
      (v_vehicle.max_volume_m3 IS NOT NULL AND v_vehicle.max_volume_m3 > 0 AND v_total_vol > v_vehicle.max_volume_m3) OR 
      (v_vehicle.max_weight_kg IS NOT NULL AND v_vehicle.max_weight_kg > 0 AND v_total_weight > v_vehicle.max_weight_kg)
    )
  );
END;
$$;

-- 6. Redefine complete_warehouse_shipment_task with package parameters and capacity checks
DROP FUNCTION IF EXISTS public.complete_warehouse_shipment_task(UUID, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.complete_warehouse_shipment_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_picked_qty NUMERIC,
  p_evidence_photo_url TEXT DEFAULT NULL,
  p_package_unit_id UUID DEFAULT NULL,
  p_package_qty NUMERIC DEFAULT NULL
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
  
  -- Package metrics variables
  v_conv_factor NUMERIC;
  v_unit_vol NUMERIC;
  v_unit_weight NUMERIC;
  v_pack_qty NUMERIC;

  -- Capacity check variables
  v_capacity_check JSONB;
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
  v_shipment_line_id := v_task.source_line_id;

  -- 3. Handle task type execution
  IF v_task.task_type = 'pick' THEN
    v_res_id := (v_task.meta->>'reservation_id')::UUID;
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

  -- 4. Update shipment line with packaging details if provided
  IF p_package_unit_id IS NOT NULL AND v_shipment_line_id IS NOT NULL THEN
    SELECT base_quantity, volume_m3, gross_weight_kg 
    INTO v_conv_factor, v_unit_vol, v_unit_weight
    FROM public.stock_item_package_units
    WHERE id = p_package_unit_id;

    IF FOUND THEN
      v_pack_qty := COALESCE(p_package_qty, v_picked_qty / NULLIF(v_conv_factor, 0));
      
      UPDATE public.warehouse_shipment_lines
      SET package_unit_id = p_package_unit_id,
          package_qty = v_pack_qty,
          base_qty = v_picked_qty,
          line_volume_m3 = v_pack_qty * COALESCE(v_unit_vol, 0),
          line_gross_weight_kg = v_pack_qty * COALESCE(v_unit_weight, 0),
          updated_at = now()
      WHERE id = v_shipment_line_id;
    END IF;
  END IF;

  -- 5. If task type is load, check vehicle capacity (fail-closed)
  IF v_task.task_type = 'load' THEN
    v_capacity_check := public.get_warehouse_shipment_capacity(v_task.source_doc_id);
    IF (v_capacity_check->>'is_exceeded')::BOOLEAN THEN
      RAISE EXCEPTION 'Kapasite aşımı! Hacim veya Ağırlık araç kapasitesini aşıyor. Araç: %', v_capacity_check->>'plate_number';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'next_task_id', v_next_task_id,
    'status', COALESCE(v_next_status, 'done')
  );
END;
$$;
