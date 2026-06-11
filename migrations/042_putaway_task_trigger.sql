-- Trigger and trigger function for automatic putaway task creation on inventory_movements insert
CREATE OR REPLACE FUNCTION public.inventory_movements_create_putaway_task_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_default_location_id UUID;
  v_item_name TEXT;
  v_unit TEXT;
BEGIN
  -- 1. availability_status 'putaway_pending' kontrolü yap
  IF NEW.meta IS NOT NULL AND NEW.meta->>'availability_status' = 'putaway_pending' THEN

    -- 2. Varsayılan lokasyonu stock_item_warehouse_settings tablosundan sorgula
    SELECT default_location_id INTO v_default_location_id
    FROM public.stock_item_warehouse_settings
    WHERE stock_item_id = NEW.stock_item_id AND branch_id = NEW.branch_id;

    -- 3. Ürün adını ve birimini al
    v_item_name := NEW.item_name;
    v_unit := NEW.unit;

    -- 4. warehouse_tasks tablosuna putaway görevini insert et
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
      NEW.branch_id,
      'putaway',
      'pending',
      'normal',
      'purchase_receipt',
      NEW.source_doc_id,
      NEW.source_doc_line_id,
      v_item_name || ' (' || NEW.quantity::TEXT || ' ' || COALESCE(v_unit, 'Adet') || ') Putaway Görevi',
      jsonb_build_object(
        'source_movement_id', NEW.id,
        'stock_item_id', NEW.stock_item_id,
        'quantity', NEW.quantity,
        'from_location_id', NEW.location_id,
        'target_location_id', v_default_location_id,
        'lot_number', NEW.lot_number,
        'expiration_date', NEW.expiration_date,
        'lpn_id', NEW.lpn_id
      )
    );

  END IF;

  RETURN NEW;
END;
$$;

-- Trigger'ı oluştur
DROP TRIGGER IF EXISTS trg_wms_create_putaway_task ON public.inventory_movements;
CREATE TRIGGER trg_wms_create_putaway_task
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.inventory_movements_create_putaway_task_trigger();
