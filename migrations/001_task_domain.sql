CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  organization_node_id UUID,
  branch_node_id UUID,
  created_by_personnel_id TEXT NOT NULL,
  created_by_position_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT DEFAULT 'normal',
  due_at TIMESTAMPTZ,
  start_at TIMESTAMPTZ,
  has_specific_time BOOLEAN DEFAULT false NOT NULL,
  timezone TEXT DEFAULT 'Europe/Istanbul' NOT NULL,
  is_recurring BOOLEAN DEFAULT false NOT NULL,
  recurrence_rule_id UUID,
  delegation_allowed BOOLEAN DEFAULT false NOT NULL,
  approval_required BOOLEAN DEFAULT false NOT NULL,
  closure_summary_required BOOLEAN DEFAULT false NOT NULL,
  closure_file_required BOOLEAN DEFAULT false NOT NULL,
  closure_image_required BOOLEAN DEFAULT false NOT NULL,
  edit_due_date_allowed BOOLEAN DEFAULT false NOT NULL,
  edit_schedule_allowed BOOLEAN DEFAULT false NOT NULL,
  incomplete_if_late BOOLEAN DEFAULT false NOT NULL,
  closure_summary TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY[
    'draft','open','in_progress','pending_approval',
    'pending_completion_approval','completed','rejected',
    'overdue','cancelled','soft_deleted','not_completed'
  ])),
  CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY[
    'low','normal','high','urgent'
  ]))
);

CREATE TABLE IF NOT EXISTS public.task_participants (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL,
  participant_type TEXT NOT NULL,
  personnel_id TEXT NOT NULL,
  position_id TEXT,
  node_id UUID,
  is_delegate BOOLEAN DEFAULT false NOT NULL,
  delegated_from TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_participants_pkey PRIMARY KEY (id),
  CONSTRAINT task_participants_type_check CHECK (
    participant_type = ANY (ARRAY['assignee','watcher'])
  ),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL,
  text TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_checklist_items_pkey PRIMARY KEY (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL,
  attachment_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT task_attachments_type_check CHECK (
    attachment_type = ANY (ARRAY['file','image','closure_file','closure_image','chat'])
  ),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_recurrence_rules (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  frequency TEXT NOT NULL,
  interval_value INTEGER DEFAULT 1 NOT NULL,
  weekdays TEXT[],
  month_day INTEGER,
  month_nth INTEGER,
  month_weekday TEXT,
  specific_dates TEXT[],
  time_of_day TIME,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_recurrence_rules_pkey PRIMARY KEY (id),
  CONSTRAINT task_recurrence_rules_frequency_check CHECK (
    frequency = ANY (ARRAY['daily','weekly','monthly','yearly','interval'])
  )
);

CREATE TABLE IF NOT EXISTS public.task_approval_requests (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL,
  request_type TEXT NOT NULL,
  from_personnel TEXT NOT NULL,
  to_personnel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_approval_requests_pkey PRIMARY KEY (id),
  CONSTRAINT task_approval_requests_type_check CHECK (
    request_type = ANY (ARRAY[
      'assignment','upward_assignment','closure_approval',
      'delegation','rejection'
    ])
  ),
  CONSTRAINT task_approval_requests_status_check CHECK (
    status = ANY (ARRAY['pending','accepted','rejected'])
  ),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_history (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_history_pkey PRIMARY KEY (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_chat_threads (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  task_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_chat_threads_pkey PRIMARY KEY (id),
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_chat_messages (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  thread_id UUID NOT NULL,
  task_id UUID NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'user',
  sender_id TEXT,
  body TEXT,
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT task_chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT task_chat_messages_type_check CHECK (
    message_type = ANY (ARRAY['user','system'])
  ),
  FOREIGN KEY (thread_id) REFERENCES public.task_chat_threads(id) ON DELETE CASCADE
);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_recurrence_rule_id_fkey
  FOREIGN KEY (recurrence_rule_id) REFERENCES public.task_recurrence_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by_personnel_id ON public.tasks (created_by_personnel_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON public.tasks (due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_deleted_at ON public.tasks (deleted_at);
CREATE INDEX IF NOT EXISTS idx_task_participants_task_type ON public.task_participants (task_id, participant_type);
CREATE INDEX IF NOT EXISTS idx_task_participants_personnel_id ON public.task_participants (personnel_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_items_task_id ON public.task_checklist_items (task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task_id ON public.task_history (task_id);
CREATE INDEX IF NOT EXISTS idx_task_chat_messages_thread_id ON public.task_chat_messages (thread_id);
CREATE INDEX IF NOT EXISTS idx_task_approval_requests_task_status ON public.task_approval_requests (task_id, status);
