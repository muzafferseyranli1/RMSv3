-- 017_form_templates_allowed_contexts.sql
-- Adds allowed_contexts column to form_templates table to support selecting usage contexts (Merkez, Şube, MerkezMutfak/depo).

ALTER TABLE public.form_templates ADD COLUMN IF NOT EXISTS allowed_contexts JSONB DEFAULT '["center", "branch", "warehouse"]'::jsonb;
