-- RPC for resolving warehouse task exceptions atomically
CREATE OR REPLACE FUNCTION public.resolve_warehouse_task_exception(
  p_task_id UUID,
  p_action TEXT,
  p_note TEXT,
  p_personnel_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task public.warehouse_tasks%ROWTYPE;
  v_next_status TEXT;
  v_res_id UUID;
  v_meta JSONB;
  v_event_type TEXT;
BEGIN
  -- 1. Select and lock the task row
  SELECT * INTO v_task
  FROM public.warehouse_tasks
  WHERE id = p_task_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Görev bulunamadı (ID: %)', p_task_id;
  END IF;

  IF v_task.status <> 'exception' THEN
    RAISE EXCEPTION 'Bu işlem sadece sorunlu (exception) durumundaki görevler için geçerlidir. Görev durumu: %', v_task.status;
  END IF;

  IF p_action NOT IN ('retry', 'cancel') THEN
    RAISE EXCEPTION 'Geçersiz aksiyon: %. Sadece retry veya cancel kabul edilir.', p_action;
  END IF;

  IF p_note IS NULL OR trim(p_note) = '' THEN
    RAISE EXCEPTION 'Çözüm notu zorunludur.';
  END IF;

  -- 2. Determine next status and event type
  IF p_action = 'retry' THEN
    v_next_status := 'pending';
    v_event_type := 'exception_resolved_retry';
  ELSE
    v_next_status := 'cancelled';
    v_event_type := 'exception_resolved_cancel';
  END IF;

  -- 3. If action is cancel and task type is pick, cancel the reservation
  IF p_action = 'cancel' AND v_task.task_type = 'pick' THEN
    v_res_id := (v_task.meta->>'reservation_id')::UUID;
    IF v_res_id IS NOT NULL THEN
      UPDATE public.warehouse_reservations
      SET status = 'cancelled',
          released_at = now(),
          updated_at = now()
      WHERE id = v_res_id;
    END IF;
  END IF;

  -- 4. Update task status and meta
  v_meta := COALESCE(v_task.meta, '{}'::jsonb) || jsonb_build_object(
    'exception_resolved', true,
    'resolution_note', p_note,
    'resolved_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'resolved_by', p_personnel_id
  );

  UPDATE public.warehouse_tasks
  SET status = v_next_status,
      meta = v_meta,
      updated_at = now()
  WHERE id = p_task_id;

  -- 5. Insert audit event record
  INSERT INTO public.warehouse_task_events (
    task_id,
    event_type,
    from_status,
    to_status,
    personnel_id,
    payload
  ) VALUES (
    p_task_id,
    v_event_type,
    'exception',
    v_next_status,
    p_personnel_id,
    jsonb_build_object('note', p_note)
  );

  RETURN jsonb_build_object(
    'success', true,
    'task_id', p_task_id,
    'status', v_next_status
  );
END;
$$;
