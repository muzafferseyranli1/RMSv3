-- ============================================================
-- Migration: Bilet/Şikayet Yönetim Sistemi İyileştirmeleri
-- Tarih: 2026-05-27
-- Açıklama: Bildirim sistemi, kalite raporları ve yeni bilet alanları
-- ============================================================

BEGIN;

-- 1. Bildirimler Tablosu (notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id TEXT NOT NULL,           -- Personel ID
  type TEXT NOT NULL,                   -- 'ticket_assigned', 'ticket_comment', 'sla_warning', 'sla_breach', 'status_changed', 'quality_report', 'ticket_escalated'
  title TEXT NOT NULL,
  body TEXT,
  reference_type TEXT,                  -- 'ticket', 'task', 'quality_report'
  reference_id UUID,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);

-- 2. Standart Dışı Ürün Bildirimleri Tablosu (quality_reports)
CREATE TABLE IF NOT EXISTS public.quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id TEXT NOT NULL,              -- Bildirimi yapan şube ID (TEXT)
  reported_by TEXT NOT NULL,            -- Personel ID
  report_type TEXT DEFAULT 'non_standard_product', -- 'non_standard_product', 'supplier_issue', 'equipment_issue'
  product_name TEXT,                    -- Ürün adı
  stock_item_id UUID,                   -- Varsa stok kalem ID'si
  supplier_name TEXT,                   -- Varsa tedarikçi adı
  description TEXT NOT NULL,            -- Açıklama
  severity TEXT DEFAULT 'normal',       -- 'low', 'normal', 'high', 'critical'
  photo_urls JSONB DEFAULT '[]'::jsonb, -- Fotoğraf URL'leri
  status TEXT DEFAULT 'open',           -- 'open', 'under_review', 'resolved', 'closed'
  assigned_to TEXT,                     -- Kalite/satınalma personel ID
  resolution_note TEXT,                 -- Çözüm notu
  ticket_id UUID,                       -- Oluşturulan bilet ID
  skt DATE,                             -- Son kullanma tarihi
  parti_no TEXT,                        -- Parti numarası
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tickets Tablosu Genişletme
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS escalated BOOLEAN DEFAULT false;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS escalation_reason TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS quality_report_id UUID;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS source_detail JSONB DEFAULT '{}'::jsonb;

-- Origin type check constraint güncellemesi
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_origin_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_origin_check CHECK (
  origin_type = ANY (ARRAY['feedback','inspection','manual','quality','social_media','google_review'])
);

-- Foreign Key'lerin kurulması
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_quality_report_fkey;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_quality_report_fkey FOREIGN KEY (quality_report_id) REFERENCES public.quality_reports(id) ON DELETE SET NULL;

ALTER TABLE public.quality_reports DROP CONSTRAINT IF EXISTS quality_reports_ticket_fkey;
ALTER TABLE public.quality_reports ADD CONSTRAINT quality_reports_ticket_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

-- 4. Bilet Kategorileri Genişletme (ticket_categories)
ALTER TABLE public.ticket_categories ADD COLUMN IF NOT EXISTS default_sla_level TEXT DEFAULT 'standard_24h';
ALTER TABLE public.ticket_categories ADD COLUMN IF NOT EXISTS auto_assign_position TEXT;

-- Örnek kategorilere varsayılan SLA'ler ve otomatik atama pozisyonları set edelim
UPDATE public.ticket_categories SET default_sla_level = 'standard_24h', auto_assign_position = 'SBM' WHERE slug = 'service';
UPDATE public.ticket_categories SET default_sla_level = 'urgent_1h', auto_assign_position = 'SBM' WHERE slug = 'hygiene';
UPDATE public.ticket_categories SET default_sla_level = 'standard_24h', auto_assign_position = 'SBM' WHERE slug = 'food_quality';
UPDATE public.ticket_categories SET default_sla_level = 'low_48h', auto_assign_position = 'SBM' WHERE slug = 'equipment';

COMMIT;
