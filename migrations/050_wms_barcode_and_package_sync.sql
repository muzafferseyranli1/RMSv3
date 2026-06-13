-- 1. Redefine idx_product_barcodes_gtin as a partial unique index where active = true
DROP INDEX IF EXISTS public.idx_product_barcodes_gtin;
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcodes_gtin
ON public.product_external_barcodes(gtin_barcode)
WHERE (active = true);

-- 2. Create trigger function to automatically sync stock_items.packaging_units JSONB with stock_item_package_units table
CREATE OR REPLACE FUNCTION public.sync_stock_item_package_units()
RETURNS TRIGGER AS $$
DECLARE
  v_item RECORD;
  v_barcode_item RECORD;
  v_unit_id UUID;
  v_prev_qty NUMERIC := 1.0;
  v_curr_qty NUMERIC;
  v_level INT := 0;
  v_processed_names TEXT[] := ARRAY[]::TEXT[];
  v_processed_barcodes TEXT[] := ARRAY[]::TEXT[];
  v_unit_name TEXT;
  v_qty NUMERIC;

  -- Dimensions & Weights
  v_length_cm NUMERIC;
  v_width_cm NUMERIC;
  v_height_cm NUMERIC;
  v_gross_weight_kg NUMERIC;
  v_net_weight_kg NUMERIC;
  v_is_base BOOLEAN;

  -- Barcodes
  v_barcodes JSONB;
  v_barcode TEXT;
  v_barcode_type TEXT;
  v_is_primary BOOLEAN;
BEGIN
  -- Process packaging_units from JSONB array
  IF NEW.packaging_units IS NOT NULL AND jsonb_typeof(NEW.packaging_units) = 'array' THEN
    FOR v_item IN
      SELECT
        (value->>'unit') AS unit_name,
        COALESCE((value->>'qty')::NUMERIC, 1.0) AS qty,
        COALESCE((value->>'is_base_unit')::BOOLEAN, false) AS is_base_unit,
        (value->>'length_cm')::NUMERIC AS length_cm,
        (value->>'width_cm')::NUMERIC AS width_cm,
        (value->>'height_cm')::NUMERIC AS height_cm,
        (value->>'gross_weight_kg')::NUMERIC AS gross_weight_kg,
        (value->>'net_weight_kg')::NUMERIC AS net_weight_kg,
        (value->'barcodes') AS barcodes,
        (value->>'barcode') AS single_barcode,
        (value->>'barcode_type') AS single_barcode_type
      FROM jsonb_array_elements(NEW.packaging_units)
    LOOP
      v_unit_name := trim(v_item.unit_name);
      v_is_base := v_item.is_base_unit;

      IF v_unit_name IS NOT NULL AND v_unit_name <> '' THEN
        v_qty := v_item.qty;

        -- Dimensions & weights extraction
        v_length_cm := v_item.length_cm;
        v_width_cm := v_item.width_cm;
        v_height_cm := v_item.height_cm;
        v_gross_weight_kg := v_item.gross_weight_kg;
        v_net_weight_kg := v_item.net_weight_kg;

        -- Validation rules: if measurements are partially entered, they must be valid and complete
        IF v_length_cm IS NOT NULL OR v_width_cm IS NOT NULL OR v_height_cm IS NOT NULL OR v_gross_weight_kg IS NOT NULL OR v_net_weight_kg IS NOT NULL THEN
          IF COALESCE(v_length_cm, 0) <= 0 OR COALESCE(v_width_cm, 0) <= 0 OR COALESCE(v_height_cm, 0) <= 0 THEN
            RAISE EXCEPTION 'Boyutlar (en, boy, yukseklik) 0 veya negatif olamaz. Birim: %', v_unit_name;
          END IF;
          IF COALESCE(v_gross_weight_kg, 0) <= 0 OR COALESCE(v_net_weight_kg, 0) <= 0 THEN
            RAISE EXCEPTION 'Agirliklar (brut, net) 0 veya negatif olamaz. Birim: %', v_unit_name;
          END IF;
          IF v_net_weight_kg > v_gross_weight_kg THEN
            RAISE EXCEPTION 'Net agirlik brut agirliktan buyuk olamaz. Birim: %', v_unit_name;
          END IF;
        END IF;

        IF v_is_base THEN
          v_curr_qty := 1.0;
          v_level := 0;

          -- Upsert the base package unit
          UPDATE public.stock_item_package_units
          SET unit_name = NEW.unit,
              unit_symbol = NEW.unit,
              base_unit_name = NEW.unit,
              base_quantity = 1.0,
              level_no = 0,
              length_cm = v_length_cm,
              width_cm = v_width_cm,
              height_cm = v_height_cm,
              gross_weight_kg = v_gross_weight_kg,
              net_weight_kg = v_net_weight_kg,
              updated_at = now(),
              active = true
          WHERE stock_item_id = NEW.id AND is_base_unit = true
          RETURNING id INTO v_unit_id;

          IF NOT FOUND THEN
            INSERT INTO public.stock_item_package_units (
              stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
              level_no, is_base_unit, length_cm, width_cm, height_cm, gross_weight_kg, net_weight_kg, active
            ) VALUES (
              NEW.id, NEW.unit, NEW.unit, NEW.unit, 1.0,
              0, true, v_length_cm, v_width_cm, v_height_cm, v_gross_weight_kg, v_net_weight_kg, true
            ) RETURNING id INTO v_unit_id;
          END IF;

          v_processed_names := array_append(v_processed_names, NEW.unit);
          v_prev_qty := 1.0;
        ELSE
          v_level := v_level + 1;
          v_curr_qty := v_qty * v_prev_qty;

          -- Upsert the package unit
          UPDATE public.stock_item_package_units
          SET base_unit_name = NEW.unit,
              base_quantity = v_curr_qty,
              level_no = v_level,
              length_cm = v_length_cm,
              width_cm = v_width_cm,
              height_cm = v_height_cm,
              gross_weight_kg = v_gross_weight_kg,
              net_weight_kg = v_net_weight_kg,
              updated_at = now(),
              active = true
          WHERE stock_item_id = NEW.id AND unit_name = v_unit_name AND is_base_unit = false
          RETURNING id INTO v_unit_id;

          IF NOT FOUND THEN
            INSERT INTO public.stock_item_package_units (
              stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
              level_no, is_base_unit, length_cm, width_cm, height_cm, gross_weight_kg, net_weight_kg, active
            ) VALUES (
              NEW.id, v_unit_name, v_unit_name, NEW.unit, v_curr_qty,
              v_level, false, v_length_cm, v_width_cm, v_height_cm, v_gross_weight_kg, v_net_weight_kg, true
            ) RETURNING id INTO v_unit_id;
          END IF;

          v_processed_names := array_append(v_processed_names, v_unit_name);
          v_prev_qty := v_curr_qty;
        END IF;

        -- Process unit barcodes
        v_barcodes := v_item.barcodes;
        IF v_barcodes IS NOT NULL AND jsonb_typeof(v_barcodes) = 'array' THEN
          FOR v_barcode_item IN
            SELECT
              (value->>'barcode') AS barcode,
              COALESCE(value->>'barcode_type', 'EAN13') AS barcode_type,
              COALESCE((value->>'is_primary')::BOOLEAN, false) AS is_primary
            FROM jsonb_array_elements(v_barcodes)
          LOOP
            v_barcode := trim(v_barcode_item.barcode);
            v_barcode_type := v_barcode_item.barcode_type;
            v_is_primary := v_barcode_item.is_primary;

            IF v_barcode IS NOT NULL AND v_barcode <> '' THEN
              UPDATE public.product_external_barcodes
              SET package_unit_id = v_unit_id,
                  barcode_type = v_barcode_type,
                  is_primary = v_is_primary,
                  active = true,
                  is_approved = true,
                  updated_at = now()
              WHERE stock_item_id = NEW.id AND gtin_barcode = v_barcode;

              IF NOT FOUND THEN
                INSERT INTO public.product_external_barcodes (
                  gtin_barcode, stock_item_id, package_unit_id, barcode_type, is_primary, active, is_approved
                ) VALUES (
                  v_barcode, NEW.id, v_unit_id, v_barcode_type, v_is_primary, true, true
                );
              END IF;

              v_processed_barcodes := array_append(v_processed_barcodes, v_barcode);
            END IF;
          END LOOP;
        ELSIF v_item.single_barcode IS NOT NULL AND trim(v_item.single_barcode) <> '' THEN
          v_barcode := trim(v_item.single_barcode);
          v_barcode_type := COALESCE(v_item.single_barcode_type, 'EAN13');
          v_is_primary := true;

          UPDATE public.product_external_barcodes
          SET package_unit_id = v_unit_id,
              barcode_type = v_barcode_type,
              is_primary = v_is_primary,
              active = true,
              is_approved = true,
              updated_at = now()
          WHERE stock_item_id = NEW.id AND gtin_barcode = v_barcode;

          IF NOT FOUND THEN
            INSERT INTO public.product_external_barcodes (
              gtin_barcode, stock_item_id, package_unit_id, barcode_type, is_primary, active, is_approved
            ) VALUES (
              v_barcode, NEW.id, v_unit_id, v_barcode_type, v_is_primary, true, true
            );
          END IF;

          v_processed_barcodes := array_append(v_processed_barcodes, v_barcode);
        END IF;

      END IF;
    END LOOP;
  END IF;

  -- Ensure base unit row is active even if it was not in NEW.packaging_units (for fallback/default)
  IF NOT (NEW.unit = ANY(v_processed_names)) AND NEW.unit IS NOT NULL AND NEW.unit <> '' THEN
    SELECT id INTO v_unit_id
    FROM public.stock_item_package_units
    WHERE stock_item_id = NEW.id AND is_base_unit = true;

    IF FOUND THEN
      UPDATE public.stock_item_package_units
      SET unit_name = NEW.unit,
          unit_symbol = NEW.unit,
          base_unit_name = NEW.unit,
          base_quantity = 1.0,
          updated_at = now(),
          active = true
      WHERE id = v_unit_id;
    ELSE
      INSERT INTO public.stock_item_package_units (
        stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
        level_no, is_base_unit, is_default_receiving_unit, is_default_picking_unit,
        is_default_shipping_unit, active
      ) VALUES (
        NEW.id, NEW.unit, NEW.unit, NEW.unit, 1.0,
        0, true, true, true, true, true
      ) RETURNING id INTO v_unit_id;
    END IF;
    v_processed_names := array_append(v_processed_names, NEW.unit);
  END IF;

  -- 3. Deactivate or delete package units that are no longer active/present
  UPDATE public.stock_item_package_units
  SET active = false, updated_at = now()
  WHERE stock_item_id = NEW.id AND NOT (unit_name = ANY(v_processed_names));

  DELETE FROM public.stock_item_package_units
  WHERE stock_item_id = NEW.id
    AND NOT (unit_name = ANY(v_processed_names))
    AND id NOT IN (
      SELECT DISTINCT package_unit_id FROM public.product_external_barcodes WHERE package_unit_id IS NOT NULL
      UNION
      SELECT DISTINCT package_unit_id FROM public.warehouse_shipment_lines WHERE package_unit_id IS NOT NULL
    );

  -- 4. Deactivate or delete barcodes that are no longer associated
  UPDATE public.product_external_barcodes
  SET active = false, updated_at = now()
  WHERE stock_item_id = NEW.id AND NOT (gtin_barcode = ANY(v_processed_barcodes));

  DELETE FROM public.product_external_barcodes
  WHERE stock_item_id = NEW.id
    AND NOT (gtin_barcode = ANY(v_processed_barcodes))
    AND id NOT IN (
      SELECT DISTINCT (payload->>'barcode_id')::UUID FROM public.warehouse_task_events WHERE (payload->>'barcode_id') IS NOT NULL
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Bind the trigger to stock_items
DROP TRIGGER IF EXISTS trigger_sync_stock_item_package_units ON public.stock_items;
CREATE TRIGGER trigger_sync_stock_item_package_units
AFTER INSERT OR UPDATE ON public.stock_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_item_package_units();
