-- Create warehouse_tasks and warehouse_task_events tables and their indexes
CREATE TABLE IF NOT EXISTS public.warehouse_tasks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.company_nodes(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  priority TEXT DEFAULT 'normal' NOT NULL,
  assigned_personnel_id TEXT,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  source_doc_type TEXT,
  source_doc_id UUID,
  source_line_id UUID,
  description TEXT,
  meta JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT warehouse_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_tasks_status_check CHECK (status IN ('pending', 'assigned', 'in_progress', 'done', 'exception', 'cancelled')),
  CONSTRAINT warehouse_tasks_type_check CHECK (task_type IN ('putaway', 'pick', 'pack', 'load', 'count', 'move', 'quality')),
  CONSTRAINT warehouse_tasks_priority_check CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_branch ON public.warehouse_tasks(branch_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_status ON public.warehouse_tasks(status);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_type ON public.warehouse_tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_assigned ON public.warehouse_tasks(assigned_personnel_id) WHERE assigned_personnel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_tasks_source ON public.warehouse_tasks(source_doc_type, source_doc_id) WHERE source_doc_type IS NOT NULL AND source_doc_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_task_events (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL REFERENCES public.warehouse_tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  personnel_id TEXT,
  terminal_id TEXT,
  barcode_scanned TEXT,
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_task_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_task_events_task ON public.warehouse_task_events(task_id);
