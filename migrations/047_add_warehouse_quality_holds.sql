-- Migration: WMS Phase 4 - Quality hold schema and resolution (WMS-04A)

CREATE TABLE IF NOT EXISTS public.warehouse_quality_holds (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.company_nodes(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  movement_id UUID REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  lot_number TEXT,
  expiration_date DATE,
  hold_qty NUMERIC(18,4) NOT NULL,
  status TEXT DEFAULT 'hold' NOT NULL,
  reason TEXT,
  source_task_id UUID REFERENCES public.warehouse_tasks(id) ON DELETE SET NULL,
  source_event_id UUID REFERENCES public.warehouse_task_events(id) ON DELETE SET NULL,
  evidence_photo_url TEXT,
  released_by TEXT,
  released_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_quality_holds_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_quality_holds_status_check CHECK (status IN ('hold', 'released', 'rejected', 'scrapped'))
);

CREATE INDEX IF NOT EXISTS idx_warehouse_quality_holds_branch ON public.warehouse_quality_holds(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_quality_holds_stock_item ON public.warehouse_quality_holds(stock_item_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_quality_holds_status ON public.warehouse_quality_holds(status);

-- Trigger function to automatically create a quality hold on quarantine movements
CREATE OR REPLACE FUNCTION public.trg_create_quality_hold_on_quarantine_movement()
RETURNS TRIGGER AS $$
DECLARE
  v_task_id UUID;
  v_event_id UUID;
  v_evidence_photo_url TEXT;
  v_reason TEXT;
BEGIN
  -- We only create a hold for 'in' direction quarantine movements
  IF NEW.direction = 'in' AND COALESCE(NEW.meta->>'availability_status', '') = 'quarantine' THEN
    -- Check if source doc is a warehouse task
    IF NEW.source_doc_type = 'warehouse_task' OR NEW.source_doc_type = 'transfer' THEN
      v_task_id := NEW.source_doc_id;
    END IF;

    -- Validate that the task actually exists
    IF v_task_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.warehouse_tasks WHERE id = v_task_id) THEN
        v_task_id := NULL;
      END IF;
    END IF;

    -- Fallback to meta warehouse_task_id if available
    IF v_task_id IS NULL AND NEW.meta ? 'warehouse_task_id' THEN
      v_task_id := (NEW.meta->>'warehouse_task_id')::UUID;
    END IF;

    -- If we have a valid task, look up the latest event for evidence photo and notes
    IF v_task_id IS NOT NULL THEN
      SELECT id, payload->>'evidence_photo_url', payload->>'note'
      INTO v_event_id, v_evidence_photo_url, v_reason
      FROM public.warehouse_task_events
      WHERE task_id = v_task_id
      ORDER BY created_at DESC
      LIMIT 1;
    END IF;

    -- Create quality hold record
    INSERT INTO public.warehouse_quality_holds (
      branch_id,
      stock_item_id,
      movement_id,
      location_id,
      lpn_id,
      lot_number,
      expiration_date,
      hold_qty,
      status,
      reason,
      source_task_id,
      source_event_id,
      evidence_photo_url,
      meta
    ) VALUES (
      NEW.branch_id,
      NEW.stock_item_id,
      NEW.id,
      NEW.location_id,
      NEW.lpn_id,
      NEW.lot_number,
      NEW.expiration_date,
      NEW.quantity,
      'hold',
      COALESCE(v_reason, NEW.meta->>'reason', 'Mal Kabul Karantina Girişi'),
      v_task_id,
      v_event_id,
      v_evidence_photo_url,
      COALESCE(NEW.meta, '{}'::jsonb)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Bind trigger to inventory_movements table
DROP TRIGGER IF EXISTS after_inventory_movement_quarantine ON public.inventory_movements;
CREATE TRIGGER after_inventory_movement_quarantine
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_create_quality_hold_on_quarantine_movement();


-- RPC to resolve quality holds (release/reject/scrap)
CREATE OR REPLACE FUNCTION public.resolve_warehouse_quality_hold(
  p_hold_id UUID,
  p_action TEXT,
  p_reason TEXT,
  p_personnel_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hold public.warehouse_quality_holds%ROWTYPE;
  v_out_movement_id UUID;
  v_in_movement_id UUID;
  v_movement public.inventory_movements%ROWTYPE;
  v_target_status TEXT;
  v_movement_type_out TEXT;
  v_movement_type_in TEXT;
  v_dir_out TEXT := 'out';
  v_dir_in TEXT := 'in';
BEGIN
  -- 1. Lock and retrieve quality hold record
  SELECT * INTO v_hold
  FROM public.warehouse_quality_holds
  WHERE id = p_hold_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kalite hold kaydı bulunamadı (ID: %)', p_hold_id;
  END IF;

  IF v_hold.status <> 'hold' THEN
    RAISE EXCEPTION 'Bu işlem sadece beklemede (hold) olan kayıtlar için geçerlidir. Mevcut durum: %', v_hold.status;
  END IF;

  IF p_action NOT IN ('release', 'reject', 'scrap') THEN
    RAISE EXCEPTION 'Geçersiz aksiyon: %. Sadece release, reject veya scrap kabul edilir.', p_action;
  END IF;

  -- Get source inventory movement to copy attributes
  SELECT * INTO v_movement
  FROM public.inventory_movements
  WHERE id = v_hold.movement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kaynak stok hareketi bulunamadı.';
  END IF;

  -- 2. Determine target status and movement types
  IF p_action = 'release' THEN
    v_target_status := 'released';
    v_movement_type_out := 'transfer_out';
    v_movement_type_in := 'transfer_in';
  ELSIF p_action = 'reject' THEN
    v_target_status := 'rejected';
    v_movement_type_out := 'supplier_return';
  ELSE
    v_target_status := 'scrapped';
    v_movement_type_out := 'waste_consumption';
  END IF;

  -- Generate UUIDs for movements
  v_out_movement_id := gen_random_uuid();
  v_in_movement_id := gen_random_uuid();

  -- 3. Create OUT movement to reduce quarantine stock
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
    v_movement.company_id,
    v_movement.legal_entity_id,
    v_movement.org_unit_id,
    v_movement.branch_id,
    v_movement.branch_name,
    v_movement.warehouse_id,
    v_movement.warehouse_name,
    v_movement.item_type,
    v_movement.stock_item_id,
    v_movement.semi_item_id,
    v_movement.item_name,
    v_movement.item_sku,
    v_movement.unit,
    v_movement.unit_factor,
    v_movement_type_out,
    'manual_adjustment',
    v_dir_out,
    now(),
    v_hold.hold_qty,
    v_hold.id,
    NULL,
    NULL,
    NULL,
    CASE WHEN p_action = 'release' THEN v_in_movement_id ELSE NULL END,
    v_movement.unit_cost,
    v_hold.hold_qty * v_movement.unit_cost,
    v_movement.currency_code,
    v_hold.location_id,
    v_hold.lpn_id,
    v_hold.lot_number,
    v_hold.expiration_date,
    jsonb_build_object(
      'quality_hold_id', v_hold.id,
      'availability_status', 'quarantine',
      'resolution_reason', p_reason
    ),
    CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
  );

  -- 4. If release, create IN movement to increase available stock
  IF p_action = 'release' THEN
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
      v_movement.company_id,
      v_movement.legal_entity_id,
      v_movement.org_unit_id,
      v_movement.branch_id,
      v_movement.branch_name,
      v_movement.warehouse_id,
      v_movement.warehouse_name,
      v_movement.item_type,
      v_movement.stock_item_id,
      v_movement.semi_item_id,
      v_movement.item_name,
      v_movement.item_sku,
      v_movement.unit,
      v_movement.unit_factor,
      v_movement_type_in,
      'manual_adjustment',
      v_dir_in,
      now(),
      v_hold.hold_qty,
      v_hold.id,
      NULL,
      NULL,
      NULL,
      v_out_movement_id,
      v_movement.unit_cost,
      v_hold.hold_qty * v_movement.unit_cost,
      v_movement.currency_code,
      v_hold.location_id,
      v_hold.lpn_id,
      v_hold.lot_number,
      v_hold.expiration_date,
      jsonb_build_object(
        'quality_hold_id', v_hold.id,
        'availability_status', 'available',
        'resolution_reason', p_reason
      ),
      CASE WHEN p_personnel_id IS NOT NULL AND p_personnel_id ~ '^[0-9a-fA-F-]{36}$' THEN p_personnel_id::UUID ELSE NULL END
    );
  END IF;

  -- 5. Update hold record status
  UPDATE public.warehouse_quality_holds
  SET status = v_target_status,
      released_by = p_personnel_id,
      released_at = now(),
      updated_at = now(),
      meta = meta || jsonb_build_object(
        'resolution_note', p_reason,
        'out_movement_id', v_out_movement_id,
        'in_movement_id', CASE WHEN p_action = 'release' THEN v_in_movement_id ELSE NULL END
      )
  WHERE id = p_hold_id;

  RETURN jsonb_build_object(
    'success', true,
    'hold_id', p_hold_id,
    'status', v_target_status,
    'out_movement_id', v_out_movement_id,
    'in_movement_id', CASE WHEN p_action = 'release' THEN v_in_movement_id ELSE NULL END
  );
END;
$$;
