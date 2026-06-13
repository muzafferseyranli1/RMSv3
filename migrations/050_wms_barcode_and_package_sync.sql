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
  v_base_unit_id UUID;
  v_prev_unit TEXT;
  v_prev_qty NUMERIC := 1.0;
  v_curr_qty NUMERIC;
  v_level INT := 1;
  v_processed_names TEXT[] := ARRAY[]::TEXT[];
  v_unit_name TEXT;
  v_qty NUMERIC;
BEGIN
  -- 1. Ensure the base unit exists in stock_item_package_units
  IF NEW.unit IS NOT NULL AND NEW.unit <> '' THEN
    SELECT id INTO v_base_unit_id 
    FROM public.stock_item_package_units 
    WHERE stock_item_id = NEW.id AND is_base_unit = true;

    IF FOUND THEN
      UPDATE public.stock_item_package_units
      SET unit_name = NEW.unit,
          unit_symbol = NEW.unit,
          base_unit_name = NEW.unit,
          base_quantity = 1.0,
          updated_at = now()
      WHERE id = v_base_unit_id;
    ELSE
      INSERT INTO public.stock_item_package_units (
        stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
        level_no, is_base_unit, is_default_receiving_unit, is_default_picking_unit,
        is_default_shipping_unit, active
      ) VALUES (
        NEW.id, NEW.unit, NEW.unit, NEW.unit, 1.0,
        0, true, true, true, true, true
      ) RETURNING id INTO v_base_unit_id;
    END IF;

    v_processed_names := array_append(v_processed_names, NEW.unit);
    v_prev_unit := NEW.unit;
  END IF;

  -- 2. Process packaging_units from JSONB array
  IF NEW.packaging_units IS NOT NULL AND jsonb_typeof(NEW.packaging_units) = 'array' THEN
    FOR v_item IN 
      SELECT 
        (value->>'unit') AS unit_name, 
        COALESCE((value->>'qty')::NUMERIC, 1.0) AS qty
      FROM jsonb_array_elements(NEW.packaging_units)
    LOOP
      v_unit_name := trim(v_item.unit_name);
      IF v_unit_name IS NOT NULL AND v_unit_name <> '' THEN
        v_qty := v_item.qty;
        v_curr_qty := v_qty * v_prev_qty;

        -- Upsert the package unit
        UPDATE public.stock_item_package_units
        SET base_unit_name = NEW.unit,
            base_quantity = v_curr_qty,
            level_no = v_level,
            updated_at = now(),
            active = true
        WHERE stock_item_id = NEW.id AND unit_name = v_unit_name AND is_base_unit = false;

        IF NOT FOUND THEN
          INSERT INTO public.stock_item_package_units (
            stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
            level_no, is_base_unit, active
          ) VALUES (
            NEW.id, v_unit_name, v_unit_name, NEW.unit, v_curr_qty,
            v_level, false, true
          );
        END IF;

        v_processed_names := array_append(v_processed_names, v_unit_name);
        v_prev_qty := v_curr_qty;
        v_prev_unit := v_unit_name;
        v_level := v_level + 1;
      END IF;
    END LOOP;
  END IF;

  -- 3. Delete or deactivate package units that are no longer in packaging_units
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Bind the trigger to stock_items
DROP TRIGGER IF EXISTS trigger_sync_stock_item_package_units ON public.stock_items;
CREATE TRIGGER trigger_sync_stock_item_package_units
AFTER INSERT OR UPDATE ON public.stock_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_stock_item_package_units();

-- 4. Migrate existing stock items' packaging units to stock_item_package_units
DO $$
DECLARE
  v_rec RECORD;
  v_item RECORD;
  v_base_unit_id UUID;
  v_prev_qty NUMERIC;
  v_curr_qty NUMERIC;
  v_level INT;
  v_unit_name TEXT;
  v_qty NUMERIC;
BEGIN
  FOR v_rec IN SELECT id, unit, packaging_units FROM public.stock_items LOOP
    -- A. Base unit
    IF v_rec.unit IS NOT NULL AND v_rec.unit <> '' THEN
      SELECT id INTO v_base_unit_id 
      FROM public.stock_item_package_units 
      WHERE stock_item_id = v_rec.id AND is_base_unit = true;

      IF NOT FOUND THEN
        INSERT INTO public.stock_item_package_units (
          stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
          level_no, is_base_unit, is_default_receiving_unit, is_default_picking_unit,
          is_default_shipping_unit, active
        ) VALUES (
          v_rec.id, v_rec.unit, v_rec.unit, v_rec.unit, 1.0,
          0, true, true, true, true, true
        );
      END IF;
    END IF;

    -- B. Packaging units list
    IF v_rec.packaging_units IS NOT NULL AND jsonb_typeof(v_rec.packaging_units) = 'array' THEN
      v_prev_qty := 1.0;
      v_level := 1;
      FOR v_item IN 
        SELECT 
          (value->>'unit') AS unit_name, 
          COALESCE((value->>'qty')::NUMERIC, 1.0) AS qty
        FROM jsonb_array_elements(v_rec.packaging_units)
      LOOP
        v_unit_name := trim(v_item.unit_name);
        IF v_unit_name IS NOT NULL AND v_unit_name <> '' THEN
          v_qty := v_item.qty;
          v_curr_qty := v_qty * v_prev_qty;

          SELECT id FROM public.stock_item_package_units 
          WHERE stock_item_id = v_rec.id AND unit_name = v_unit_name AND is_base_unit = false
          INTO v_base_unit_id;

          IF NOT FOUND THEN
            INSERT INTO public.stock_item_package_units (
              stock_item_id, unit_name, unit_symbol, base_unit_name, base_quantity,
              level_no, is_base_unit, active
            ) VALUES (
              v_rec.id, v_unit_name, v_unit_name, v_rec.unit, v_curr_qty,
              v_level, false, true
            );
          END IF;

          v_prev_qty := v_curr_qty;
          v_level := v_level + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;
