CREATE TABLE IF NOT EXISTS public.pos_table_halls (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pos_table_halls_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.pos_table_sections (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  hall_id UUID NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pos_table_sections_pkey PRIMARY KEY (id),
  CONSTRAINT pos_table_sections_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES public.pos_table_halls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.pos_tables (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  branch_id TEXT NOT NULL,
  hall_id UUID NOT NULL,
  section_id UUID NOT NULL,
  table_code TEXT,
  table_name TEXT NOT NULL,
  table_number TEXT NOT NULL,
  table_type TEXT DEFAULT 'round'::text NOT NULL,
  capacity INTEGER,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  status TEXT DEFAULT 'active'::text NOT NULL,
  qr_token TEXT NOT NULL,
  qr_payload_version INTEGER DEFAULT 1 NOT NULL,
  last_qr_generated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT pos_tables_pkey PRIMARY KEY (id),
  CONSTRAINT pos_tables_hall_id_fkey FOREIGN KEY (hall_id) REFERENCES public.pos_table_halls(id) ON DELETE CASCADE,
  CONSTRAINT pos_tables_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.pos_table_sections(id) ON DELETE CASCADE,
  CONSTRAINT pos_tables_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
  CONSTRAINT pos_tables_table_type_check CHECK ((table_type = ANY (ARRAY['round'::text, 'square'::text])))
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_table_halls_branch_name_active_uidx
  ON public.pos_table_halls USING btree (branch_id, lower(name))
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_table_halls_branch_sort_idx
  ON public.pos_table_halls USING btree (branch_id, sort_order, name)
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS pos_table_sections_hall_name_active_uidx
  ON public.pos_table_sections USING btree (hall_id, lower(name))
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_table_sections_branch_hall_sort_idx
  ON public.pos_table_sections USING btree (branch_id, hall_id, sort_order, name)
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS pos_tables_branch_number_active_uidx
  ON public.pos_tables USING btree (branch_id, table_number)
  WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS pos_tables_branch_qr_token_active_uidx
  ON public.pos_tables USING btree (branch_id, qr_token)
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_tables_branch_sort_idx
  ON public.pos_tables USING btree (branch_id, sort_order, table_number)
  WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS pos_tables_hall_idx
  ON public.pos_tables USING btree (hall_id);
CREATE INDEX IF NOT EXISTS pos_tables_section_idx
  ON public.pos_tables USING btree (section_id);
