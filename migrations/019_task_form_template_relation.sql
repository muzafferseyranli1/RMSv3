-- Migration 019: Add form_template_id to tasks table
ALTER TABLE public.tasks ADD COLUMN form_template_id UUID REFERENCES public.form_templates(id) ON DELETE SET NULL;
