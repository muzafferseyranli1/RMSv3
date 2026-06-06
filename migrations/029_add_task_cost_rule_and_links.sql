-- Add columns to tasks table for cost entry rules and linked entities
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS requires_cost_input BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_entity_table TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS linked_entity_id UUID DEFAULT NULL;

-- Create indexes for task links
CREATE INDEX IF NOT EXISTS idx_tasks_linked_entity ON public.tasks (linked_entity_table, linked_entity_id);
