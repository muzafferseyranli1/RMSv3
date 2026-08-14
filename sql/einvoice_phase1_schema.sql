-- SuitableRMS E-Fatura & E-Dönüşüm FAZ 1 Şeması
-- UBL-TR 2.1 Standardı & Entegratör Yönetimi

CREATE TABLE IF NOT EXISTS public.e_integrator_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  branch_id UUID,
  provider VARCHAR(50) NOT NULL DEFAULT 'mock', -- 'mock', 'qnb', 'nes', 'foriba', 'innova', 'uyumsoft'
  username VARCHAR(255),
  password VARCHAR(255),
  api_key VARCHAR(255),
  api_secret VARCHAR(255),
  api_url VARCHAR(255),
  alias_pk VARCHAR(255) DEFAULT 'urn:mail:defaultpk@gib.gov.tr',
  alias_gb VARCHAR(255) DEFAULT 'urn:mail:defaultgb@gib.gov.tr',
  sender_vkn_tckn VARCHAR(20) NOT NULL DEFAULT '1234567890',
  sender_title VARCHAR(255) NOT NULL DEFAULT 'SuitableRMS Restoran Grubu A.Ş.',
  sender_tax_office VARCHAR(100) DEFAULT 'Beşiktaş',
  sender_address TEXT DEFAULT 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_test_mode BOOLEAN NOT NULL DEFAULT true,
  auto_fetch_interval_min INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.e_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction VARCHAR(10) NOT NULL, -- 'INBOUND', 'OUTBOUND'
  ettn UUID NOT NULL UNIQUE,
  invoice_number VARCHAR(32) NOT NULL,
  invoice_type VARCHAR(30) NOT NULL DEFAULT 'SATIS', -- 'SATIS', 'IADE', 'TEVKIFAT', 'ISTISNA', 'OZELMATRAH', 'IHRACAT'
  profile_id VARCHAR(30) NOT NULL DEFAULT 'TICARIFATURA', -- 'TICARIFATURA', 'TEMELFATURA', 'EARSIVFATURA', 'KAMU', 'IHRACAT'
  issue_date DATE NOT NULL,
  issue_time TIME WITHOUT TIME ZONE DEFAULT '00:00:00',
  status_code INTEGER NOT NULL DEFAULT 1000, -- 1000: Kuyrukta/Taslak, 1100: Entegratöre Gönderildi, 1120: GİB'e İletildi, 1163: GİB'de İşlendi, 1200: Alıcıya Ulaştı/Başarılı, 1300: Onaylandı/Kabul Edildi, 1301: Reddedildi, 9999: Hata
  status_description VARCHAR(255) DEFAULT 'Kuyrukta / Taslak',
  currency_code VARCHAR(5) NOT NULL DEFAULT 'TRY',
  currency_rate NUMERIC(12, 4) DEFAULT 1.0000,
  sender_vkn_tckn VARCHAR(20) NOT NULL,
  sender_title VARCHAR(255) NOT NULL,
  sender_tax_office VARCHAR(100),
  sender_address TEXT,
  sender_alias VARCHAR(255),
  receiver_vkn_tckn VARCHAR(20) NOT NULL,
  receiver_title VARCHAR(255) NOT NULL,
  receiver_tax_office VARCHAR(100),
  receiver_address TEXT,
  receiver_alias VARCHAR(255),
  line_extension_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_exclusive_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_inclusive_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  allowance_total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  charge_total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  payable_rounding_amount NUMERIC(15, 2) DEFAULT 0,
  notes TEXT,
  ubl_xml TEXT,
  raw_json JSONB DEFAULT '{}',
  response_code VARCHAR(50), -- 'KABUL', 'RED'
  response_reason TEXT,
  response_date TIMESTAMPTZ,
  is_archived BOOLEAN DEFAULT false,
  is_matched BOOLEAN DEFAULT false,
  matched_purchase_order_id UUID,
  matched_inventory_movement_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_e_invoices_direction ON public.e_invoices(direction);
CREATE INDEX IF NOT EXISTS idx_e_invoices_status_code ON public.e_invoices(status_code);
CREATE INDEX IF NOT EXISTS idx_e_invoices_issue_date ON public.e_invoices(issue_date);
CREATE INDEX IF NOT EXISTS idx_e_invoices_invoice_number ON public.e_invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_e_invoices_ettn ON public.e_invoices(ettn);

CREATE TABLE IF NOT EXISTS public.e_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.e_invoices(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_code VARCHAR(100),
  item_description TEXT,
  invoiced_quantity NUMERIC(12, 3) NOT NULL DEFAULT 1,
  unit_code VARCHAR(20) NOT NULL DEFAULT 'C62',
  unit_price NUMERIC(15, 4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15, 2) NOT NULL DEFAULT 0,
  discount_rate NUMERIC(5, 2) DEFAULT 0,
  discount_amount NUMERIC(15, 2) DEFAULT 0,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 20,
  tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  tax_exemption_reason_code VARCHAR(20),
  total_line_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  matched_stock_item_id UUID,
  matched_stock_item_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_e_invoice_lines_invoice_id ON public.e_invoice_lines(invoice_id);

CREATE TABLE IF NOT EXISTS public.e_document_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.e_invoices(id) ON DELETE CASCADE,
  ettn UUID NOT NULL,
  reference_ettn UUID NOT NULL,
  reference_invoice_number VARCHAR(32) NOT NULL,
  response_type VARCHAR(20) NOT NULL, -- 'KABUL', 'RED', 'IADE'
  response_code VARCHAR(50), -- 'ACCEPT', 'REJECT'
  reason TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  integrator_response_code VARCHAR(50),
  integrator_response_message TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_e_doc_responses_invoice_id ON public.e_document_responses(invoice_id);

CREATE TABLE IF NOT EXISTS public.e_invoice_matching_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.e_invoices(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES public.e_invoice_lines(id) ON DELETE CASCADE,
  matching_type VARCHAR(50) NOT NULL, -- 'PURCHASE_ORDER', 'DELIVERY_NOTE', 'STOCK_ITEM', 'PRICE_TOLERANCE', 'AUTO_MATCH', 'MANUAL_MATCH'
  matched_entity_id UUID,
  matched_entity_type VARCHAR(50),
  discrepancy_type VARCHAR(50), -- 'NONE', 'PRICE_DIFF', 'QUANTITY_SHORTAGE', 'TAX_DIFF', 'UNMATCHED_ITEM'
  discrepancy_amount NUMERIC(15, 2) DEFAULT 0,
  notes TEXT,
  performed_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_e_invoice_match_invoice_id ON public.e_invoice_matching_logs(invoice_id);
