-- SuitableRMS E-Fatura & E-Dönüşüm FAZ 4 Şeması
-- E-Adisyon (VUK 509/526) & Entegratör Bağlantıları

CREATE TABLE IF NOT EXISTS public.e_adisyons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID,
  table_key VARCHAR(100),
  table_name VARCHAR(100),
  order_id UUID,
  ettn UUID NOT NULL UNIQUE,
  adisyon_number VARCHAR(32) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'INVOICED', 'CLOSED', 'CANCELLED'
  opened_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  waiter_id UUID,
  waiter_name VARCHAR(100) DEFAULT 'Garson',
  guest_count INTEGER DEFAULT 1,
  currency_code VARCHAR(5) NOT NULL DEFAULT 'TRY',
  subtotal_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  linked_invoice_id UUID REFERENCES public.e_invoices(id) ON DELETE SET NULL,
  linked_invoice_ettn UUID,
  linked_invoice_number VARCHAR(32),
  notes TEXT,
  gib_status_code INTEGER DEFAULT 1200,
  gib_status_description VARCHAR(255) DEFAULT 'E-Adisyon Başarıyla Kaydedildi (1200)',
  integrator_reference_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_e_adisyons_table_key ON public.e_adisyons(table_key);
CREATE INDEX IF NOT EXISTS idx_e_adisyons_status ON public.e_adisyons(status);
CREATE INDEX IF NOT EXISTS idx_e_adisyons_ettn ON public.e_adisyons(ettn);
CREATE INDEX IF NOT EXISTS idx_e_adisyons_linked_invoice_id ON public.e_adisyons(linked_invoice_id);
CREATE INDEX IF NOT EXISTS idx_e_adisyons_opened_at ON public.e_adisyons(opened_at);

CREATE TABLE IF NOT EXISTS public.e_adisyon_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adisyon_id UUID NOT NULL REFERENCES public.e_adisyons(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  item_code VARCHAR(100),
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit_code VARCHAR(20) NOT NULL DEFAULT 'C62',
  unit_price NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 10,
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'SERVED', -- 'ORDERED', 'SERVED', 'CANCELLED'
  cancel_reason TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_e_adisyon_items_adisyon_id ON public.e_adisyon_items(adisyon_id);

-- Add E-Adisyon reference to e_invoices
ALTER TABLE public.e_invoices
  ADD COLUMN IF NOT EXISTS linked_adisyon_id UUID REFERENCES public.e_adisyons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_adisyon_ettn UUID,
  ADD COLUMN IF NOT EXISTS linked_adisyon_number VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_e_invoices_linked_adisyon_id ON public.e_invoices(linked_adisyon_id);
CREATE INDEX IF NOT EXISTS idx_e_invoices_linked_adisyon_ettn ON public.e_invoices(linked_adisyon_ettn);
