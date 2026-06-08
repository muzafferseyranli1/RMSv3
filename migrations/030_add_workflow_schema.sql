-- ============================================================
-- Migration 030: Add Workflow Schema and Alter Form Templates Type Constraint
-- Tarih: 2026-06-07
-- Açıklama:
--   1. workflow_definitions tablosunu oluşturur (tasarımlar)
--   2. workflow_instances tablosunu oluşturur (talepler)
--   3. workflow_history tablosunu oluşturur (geçmiş)
--   4. form_templates tablosundaki form_type kısıtını 'request' ve 'notification_form' tiplerini destekleyecek şekilde günceller
-- ============================================================

BEGIN;

-- 1. form_templates kısıtını güncelleme
ALTER TABLE public.form_templates
  DROP CONSTRAINT IF EXISTS form_templates_type_check;

ALTER TABLE public.form_templates
  ADD CONSTRAINT form_templates_type_check CHECK (
    form_type = ANY (ARRAY['inspection', 'customer_survey', 'personnel_survey', 'checklist', 'notification_form', 'request'])
  );

-- 2. workflow_definitions tablosu
CREATE TABLE IF NOT EXISTS public.workflow_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version INT DEFAULT 1 NOT NULL,
    status VARCHAR(20) DEFAULT 'published' NOT NULL, -- draft, published, archived
    workflow_type VARCHAR(50) NOT NULL, -- leave, advance, expense, purchase, custom
    blueprint JSONB NOT NULL, -- Düğümler ve geçiş ayarları
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    company_id UUID
);

-- 3. workflow_instances tablosu (çalışan talepler)
CREATE TABLE IF NOT EXISTS public.workflow_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    definition_id UUID REFERENCES public.workflow_definitions(id) ON DELETE RESTRICT NOT NULL,
    definition_version INT NOT NULL,
    current_node_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) DEFAULT 'running' NOT NULL, -- running, completed, rejected, cancelled
    context_data JSONB DEFAULT '{}'::jsonb NOT NULL, -- form yanıtları, dosya ve görsel URL'leri
    started_by VARCHAR(255) NOT NULL, -- personel ID
    started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMPTZ,
    company_id UUID
);

-- 4. workflow_history tablosu (denetim izi)
CREATE TABLE IF NOT EXISTS public.workflow_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    instance_id UUID REFERENCES public.workflow_instances(id) ON DELETE CASCADE NOT NULL,
    from_node_id VARCHAR(100),
    to_node_id VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL, -- submit, approve, reject, cancel, return_to_start
    actor_id VARCHAR(255) NOT NULL, -- personel ID
    notes TEXT,
    delta_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON public.workflow_instances(status);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_started_by ON public.workflow_instances(started_by);
CREATE INDEX IF NOT EXISTS idx_workflow_history_instance_id ON public.workflow_history(instance_id);

COMMIT;
