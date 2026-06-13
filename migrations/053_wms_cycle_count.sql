-- Migration: WMS Cycle Count Görevleri ve Onay Mekanizması
-- Tarih: 2026-06-13
-- Açıklama: Sayım fark onay kuyruğu tablosu ve transactional RPC fonksiyonlarının eklenmesi.

BEGIN;

-- 1. Sayım Fark Onay Kuyruğu Tablosu
CREATE TABLE IF NOT EXISTS public.warehouse_count_approvals (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.company_nodes(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.warehouse_tasks(id) ON DELETE SET NULL,
  location_id UUID NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  expected_qty NUMERIC(18,6) NOT NULL,
  counted_qty NUMERIC(18,6) NOT NULL,
  difference_qty NUMERIC(18,6) NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  reason TEXT,
  created_by TEXT, -- Sayımı yapan personel ID'si veya adı
  approved_by TEXT, -- Onaylayan/reddeden yönetici
  approved_at TIMESTAMPTZ,
  inventory_movement_id UUID,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_count_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_count_approvals_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_wh_count_approvals_branch ON public.warehouse_count_approvals(branch_id);
CREATE INDEX IF NOT EXISTS idx_wh_count_approvals_task ON public.warehouse_count_approvals(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wh_count_approvals_status ON public.warehouse_count_approvals(status);

-- 2. Sayım Sonucunu Gönderme RPC Fonksiyonu
CREATE OR REPLACE FUNCTION public.submit_warehouse_count_task(
  p_task_id UUID,
  p_personnel_id TEXT,
  p_counted_qty NUMERIC(18,6),
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_location_id UUID;
  v_lpn_id UUID;
  v_stock_item_id UUID;
  v_expected_qty NUMERIC(18,6);
  v_difference_qty NUMERIC(18,6);
  v_approval_id UUID := gen_random_uuid();
  v_meta JSONB;
BEGIN
  -- Görevi kilitle ve kontrol et
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sayım görevi bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.task_type <> 'count' THEN
    RAISE EXCEPTION 'Bu işlem sadece sayım (count) görevleri için geçerlidir. Görev tipi: %', v_task.task_type;
  END IF;

  IF v_task.status = 'done' THEN
    RAISE EXCEPTION 'Görev zaten tamamlanmış.';
  END IF;

  IF v_task.status = 'cancelled' THEN
    RAISE EXCEPTION 'İptal edilmiş bir görev tamamlanamaz.';
  END IF;

  -- Metadan detayları oku
  v_location_id := COALESCE(
    (v_task.meta->>'location_id')::UUID,
    (v_task.meta->>'from_location_id')::UUID,
    (v_task.meta->>'target_location_id')::UUID
  );
  v_lpn_id := (v_task.meta->>'lpn_id')::UUID;
  v_stock_item_id := COALESCE(
    (v_task.meta->>'stock_item_id')::UUID,
    (v_task.meta->>'product_id')::UUID
  );

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Görevin meta verisinde lokasyon (location_id) bulunamadı.';
  END IF;

  IF v_stock_item_id IS NULL THEN
    RAISE EXCEPTION 'Görevin meta verisinde ürün (stock_item_id) bulunamadı.';
  END IF;

  -- Sistemdeki mevcut kullanılabilir stok bakiyesini (beklenen miktarı) hesapla
  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN quantity ELSE -quantity END), 0) INTO v_expected_qty
  FROM public.inventory_movements
  WHERE branch_id = v_task.branch_id
    AND location_id = v_location_id
    AND (lpn_id = v_lpn_id OR (v_lpn_id IS NULL AND lpn_id IS NULL))
    AND stock_item_id = v_stock_item_id
    AND item_type = 'stock_item'
    AND is_cancelled = false
    AND deleted_at IS NULL
    AND COALESCE(meta->>'availability_status', 'available') NOT IN ('quarantine', 'putaway_pending');

  -- Farkı hesapla
  v_difference_qty := p_counted_qty - v_expected_qty;

  -- Görev metasını güncelle
  v_meta := jsonb_set(v_task.meta, '{scanned_quantity}', to_jsonb(p_counted_qty));
  v_meta := jsonb_set(v_meta, '{expected_quantity}', to_jsonb(v_expected_qty));
  v_meta := jsonb_set(v_meta, '{difference_qty}', to_jsonb(v_difference_qty));
  v_meta := jsonb_set(v_meta, '{completed_by}', to_jsonb(COALESCE(p_personnel_id, '')));

  IF v_difference_qty = 0 THEN
    -- Fark yoksa: Görevi doğrudan tamamla, stok hareketi veya onay gerekmez
    UPDATE public.warehouse_tasks
    SET status = 'done',
        completed_at = now(),
        updated_at = now(),
        meta = v_meta
    WHERE id = p_task_id;

    -- Olay kaydı ekle
    INSERT INTO public.warehouse_task_events (
      task_id,
      event_type,
      from_status,
      to_status,
      personnel_id,
      payload
    ) VALUES (
      p_task_id,
      'completed',
      v_task.status,
      'done',
      p_personnel_id,
      jsonb_build_object(
        'counted_qty', p_counted_qty,
        'expected_qty', v_expected_qty,
        'difference_qty', 0
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'has_discrepancy', false,
      'task_id', p_task_id
    );
  ELSE
    -- Fark varsa: Onay kaydı ekle
    INSERT INTO public.warehouse_count_approvals (
      id,
      branch_id,
      task_id,
      location_id,
      lpn_id,
      stock_item_id,
      expected_qty,
      counted_qty,
      difference_qty,
      status,
      reason,
      created_by
    ) VALUES (
      v_approval_id,
      v_task.branch_id,
      p_task_id,
      v_location_id,
      v_lpn_id,
      v_stock_item_id,
      v_expected_qty,
      p_counted_qty,
      v_difference_qty,
      'pending',
      p_reason,
      p_personnel_id
    );

    v_meta := jsonb_set(v_meta, '{has_discrepancy}', to_jsonb(true));
    v_meta := jsonb_set(v_meta, '{count_approval_id}', to_jsonb(v_approval_id::text));

    -- Görevi tamamlandı olarak işaretle (fark onay kuyruğunda bekleyecek)
    UPDATE public.warehouse_tasks
    SET status = 'done',
        completed_at = now(),
        updated_at = now(),
        meta = v_meta
    WHERE id = p_task_id;

    -- Olay kaydı ekle
    INSERT INTO public.warehouse_task_events (
      task_id,
      event_type,
      from_status,
      to_status,
      personnel_id,
      payload
    ) VALUES (
      p_task_id,
      'discrepancy_reported',
      v_task.status,
      'done',
      p_personnel_id,
      jsonb_build_object(
        'counted_qty', p_counted_qty,
        'expected_qty', v_expected_qty,
        'difference_qty', v_difference_qty,
        'reason', p_reason,
        'approval_id', v_approval_id
      )
    );

    RETURN jsonb_build_object(
      'success', true,
      'has_discrepancy', true,
      'task_id', p_task_id,
      'approval_id', v_approval_id
    );
  END IF;
END;
$$;

-- 3. Sayım Onaylama RPC Fonksiyonu
CREATE OR REPLACE FUNCTION public.approve_warehouse_count_approval(
  p_approval_id UUID,
  p_manager_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_approval public.warehouse_count_approvals%ROWTYPE;
  v_latest RECORD;
  v_unit_cost NUMERIC(18,6);
  v_movement_id UUID := gen_random_uuid();
  v_direction TEXT;
  v_movement_type TEXT;
  v_created_by_uuid UUID;
BEGIN
  -- Onay kaydını kilitle
  SELECT * INTO v_approval
  FROM public.warehouse_count_approvals
  WHERE id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sayım onay kaydı bulunamadı (ID: %)', p_approval_id;
  END IF;

  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Bu sayım onay kaydı zaten işlenmiş. Durum: %', v_approval.status;
  END IF;

  -- Son maliyeti al
  SELECT COALESCE(avg_unit_cost_after, 0) INTO v_unit_cost
  FROM public.inventory_movements
  WHERE branch_id = v_approval.branch_id
    AND stock_item_id = v_approval.stock_item_id
    AND item_type = 'stock_item'
    AND is_cancelled = false
    AND deleted_at IS NULL
  ORDER BY movement_at DESC, ledger_seq DESC
  LIMIT 1;

  -- Son hareketi alıp şirket bilgilerini kopyalayalım
  SELECT company_id, legal_entity_id, org_unit_id, branch_name, warehouse_id, warehouse_name, item_name, item_sku, unit, unit_factor, currency_code
  INTO v_latest
  FROM public.inventory_movements
  WHERE branch_id = v_approval.branch_id
    AND stock_item_id = v_approval.stock_item_id
    AND item_type = 'stock_item'
    AND is_cancelled = false
    AND deleted_at IS NULL
  ORDER BY movement_at DESC, ledger_seq DESC
  LIMIT 1;

  IF v_latest.company_id IS NULL THEN
    -- Eğer hiç hareket yoksa fallback olarak stock_items'dan alalım
    SELECT 
      NULL::UUID AS company_id, 
      NULL::UUID AS legal_entity_id, 
      NULL::UUID AS org_unit_id, 
      'Merkez Depo' AS branch_name,
      NULL::UUID AS warehouse_id,
      'WMS Depo' AS warehouse_name,
      name AS item_name,
      sku AS item_sku,
      unit,
      1.000000 AS unit_factor,
      'TRY' AS currency_code
    INTO v_latest
    FROM public.stock_items
    WHERE id = v_approval.stock_item_id;
  END IF;

  -- Hareket yönü ve tipi
  IF v_approval.difference_qty > 0 THEN
    v_direction := 'in';
    v_movement_type := 'stock_count_gain';
  ELSE
    v_direction := 'out';
    v_movement_type := 'stock_count_loss';
  END IF;

  IF p_manager_id ~ '^[0-9a-fA-F-]{36}$' THEN
    v_created_by_uuid := p_manager_id::UUID;
  END IF;

  -- Stok hareketini yaz
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
    source_doc_no,
    unit_cost,
    total_cost,
    currency_code,
    location_id,
    lpn_id,
    meta,
    created_by
  ) VALUES (
    v_movement_id,
    v_latest.company_id,
    v_latest.legal_entity_id,
    v_latest.org_unit_id,
    v_approval.branch_id,
    v_latest.branch_name,
    v_latest.warehouse_id,
    v_latest.warehouse_name,
    'stock_item',
    v_approval.stock_item_id,
    v_latest.item_name,
    v_latest.item_sku,
    v_latest.unit,
    v_latest.unit_factor,
    v_movement_type,
    'stock_count',
    v_direction,
    now(),
    ABS(v_approval.difference_qty),
    v_approval.task_id,
    'COUNT-TASK-' || COALESCE(v_approval.task_id::text, p_approval_id::text),
    v_unit_cost,
    ABS(v_approval.difference_qty) * v_unit_cost,
    v_latest.currency_code,
    v_approval.location_id,
    v_approval.lpn_id,
    jsonb_build_object(
      'count_approval_id', p_approval_id,
      'reason', v_approval.reason,
      'availability_status', 'available'
    ),
    v_created_by_uuid
  );

  -- Ortalama maliyet ve bakiyeleri yeniden hesapla
  PERFORM public.recalculate_inventory_item_costs('stock_item', v_approval.stock_item_id, NULL, v_approval.branch_id, now());

  -- Onay kaydını güncelle
  UPDATE public.warehouse_count_approvals
  SET status = 'approved',
      approved_by = p_manager_id,
      approved_at = now(),
      inventory_movement_id = v_movement_id,
      updated_at = now()
  WHERE id = p_approval_id;

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id
  );
END;
$$;

-- 4. Sayım Reddetme RPC Fonksiyonu
CREATE OR REPLACE FUNCTION public.reject_warehouse_count_approval(
  p_approval_id UUID,
  p_manager_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Onay kaydını güncelle
  UPDATE public.warehouse_count_approvals
  SET status = 'rejected',
      approved_by = p_manager_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_approval_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sayım onay kaydı bulunamadı veya zaten işlenmiş (ID: %)', p_approval_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMIT;
