-- Bulut Mutfak (Cloud Kitchen) Sanal Markalar Tablosu
CREATE TABLE IF NOT EXISTS public.cloud_kitchen_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  logo_url TEXT,
  kitchen_station VARCHAR(100) DEFAULT 'Ana Mutfak',
  platforms JSONB DEFAULT '["Yemeksepeti", "Getir", "Trendyol Yemek", "Migros Yemek"]'::jsonb,
  active BOOLEAN DEFAULT true,
  min_order_amount NUMERIC(10,2) DEFAULT 0.00,
  avg_prep_time_mins INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bulut Mutfak Ayarları Tablosu
CREATE TABLE IF NOT EXISTS public.cloud_kitchen_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  separate_warehouses BOOLEAN DEFAULT false,
  separate_profitability BOOLEAN DEFAULT false,
  separate_personnel BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

