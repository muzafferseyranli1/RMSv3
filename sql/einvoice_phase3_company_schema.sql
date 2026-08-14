-- SuitableRMS E-Fatura & E-Dönüşüm FAZ 3 Şeması
-- Şirket Ağacı Tüzel Kişilikler & Şirketler Arası Transfer (Inter-Company Invoicing)

-- 1. company_nodes tablosuna Tüzel Kişilik ve E-Fatura alanları eklenmesi
ALTER TABLE public.company_nodes
  ADD COLUMN IF NOT EXISTS tax_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS legal_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS tax_office VARCHAR(100),
  ADD COLUMN IF NOT EXISTS legal_address TEXT,
  ADD COLUMN IF NOT EXISTS is_legal_entity BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_legal_entity_id UUID REFERENCES public.company_nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_nodes_tax_number ON public.company_nodes(tax_number);
CREATE INDEX IF NOT EXISTS idx_company_nodes_parent_legal_entity_id ON public.company_nodes(parent_legal_entity_id);
CREATE INDEX IF NOT EXISTS idx_company_nodes_is_legal_entity ON public.company_nodes(is_legal_entity);

-- 2. e_invoices tablosuna Inter-Company & Transfer takip alanlarının eklenmesi
ALTER TABLE public.e_invoices
  ADD COLUMN IF NOT EXISTS is_inter_company BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_transfer_doc_no VARCHAR(64),
  ADD COLUMN IF NOT EXISTS origin_node_id UUID,
  ADD COLUMN IF NOT EXISTS destination_node_id UUID;

CREATE INDEX IF NOT EXISTS idx_e_invoices_is_inter_company ON public.e_invoices(is_inter_company);
CREATE INDEX IF NOT EXISTS idx_e_invoices_source_transfer_doc_no ON public.e_invoices(source_transfer_doc_no);

-- 3. Mevcut 'tuzel' veya 'sirket' tipindeki düğümler için is_legal_entity otomatik güncellemesi
UPDATE public.company_nodes
SET is_legal_entity = true
WHERE type IN ('tuzel', 'sirket') AND (is_legal_entity IS NULL OR is_legal_entity = false);
