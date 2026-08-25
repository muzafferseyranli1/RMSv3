-- SuitableRMS E-Dönüşüm Gelişmiş Kolonlar ve İndeksler Migration (056)
ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS matched_receipt_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS parsed_metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS is_service_invoice BOOLEAN DEFAULT false;
ALTER TABLE public.e_invoices ADD COLUMN IF NOT EXISTS matched_expense_id UUID;

ALTER TABLE public.e_integrator_configs ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0;
ALTER TABLE public.e_integrator_configs ADD COLUMN IF NOT EXISTS last_credit_check_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_e_invoices_matched_expense_id ON public.e_invoices(matched_expense_id);
CREATE INDEX IF NOT EXISTS idx_e_invoices_is_service_invoice ON public.e_invoices(is_service_invoice);
