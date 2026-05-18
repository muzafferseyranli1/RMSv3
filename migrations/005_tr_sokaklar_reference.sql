CREATE TABLE IF NOT EXISTS public.tr_sokaklar (
  id BIGSERIAL PRIMARY KEY,
  mahalle_id INTEGER NOT NULL REFERENCES public.tr_mahalleler(id) ON DELETE CASCADE,
  ad TEXT NOT NULL,
  tur TEXT,
  source TEXT DEFAULT 'openstreetmap'::text NOT NULL,
  source_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tr_sokaklar_mahalle_ad_key
  ON public.tr_sokaklar USING btree (mahalle_id, ad);

CREATE INDEX IF NOT EXISTS tr_sokaklar_mahalle_idx
  ON public.tr_sokaklar USING btree (mahalle_id, ad);

ALTER TABLE public.tr_sokaklar ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all_tr_sokaklar
  ON public.tr_sokaklar
  AS PERMISSIVE
  FOR ALL
  USING (true)
  WITH CHECK (true);
