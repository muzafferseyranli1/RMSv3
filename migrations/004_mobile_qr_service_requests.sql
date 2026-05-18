CREATE TABLE IF NOT EXISTS public.table_service_requests (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  table_id UUID NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  requested_phone TEXT,
  customer_id UUID,
  requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_staff_id TEXT,
  acknowledged_by_staff_name TEXT,
  resolved_at TIMESTAMPTZ,
  source TEXT DEFAULT 'qr_menu'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT table_service_requests_pkey PRIMARY KEY (id),
  CONSTRAINT table_service_requests_request_type_check CHECK ((request_type = ANY (ARRAY['call_waiter'::text, 'bill_request'::text, 'online_payment_interest'::text]))),
  CONSTRAINT table_service_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'acknowledged'::text, 'resolved'::text, 'cancelled'::text]))),
  CONSTRAINT table_service_requests_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.pos_tables(id) ON DELETE CASCADE,
  CONSTRAINT table_service_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.musteriler(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS table_service_requests_branch_status_idx
  ON public.table_service_requests USING btree (branch_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS table_service_requests_table_status_idx
  ON public.table_service_requests USING btree (table_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.table_feedback (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  table_id UUID NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  customer_phone TEXT,
  customer_id UUID,
  source TEXT DEFAULT 'qr_menu'::text NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT table_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT table_feedback_rating_check CHECK ((rating >= 1 AND rating <= 5)),
  CONSTRAINT table_feedback_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.pos_tables(id) ON DELETE CASCADE,
  CONSTRAINT table_feedback_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.musteriler(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS table_feedback_branch_created_idx
  ON public.table_feedback USING btree (branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS table_feedback_table_created_idx
  ON public.table_feedback USING btree (table_id, created_at DESC);
