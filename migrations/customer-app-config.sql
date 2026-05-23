-- customer-app-config.sql
-- Müşteri mobil uygulaması branding ve buton konfigürasyonu
-- Tüm config verileri DB-First kuralına uygun olarak burada saklanır.

CREATE TABLE IF NOT EXISTS customer_app_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE DEFAULT 'default',
  branding JSONB NOT NULL DEFAULT '{
    "companyName": "",
    "logoUrl": "",
    "backgroundImageUrl": "",
    "primaryColor": "#be185d",
    "headerGradient": ["#111827", "#312e81", "#f97316"],
    "welcomeText": "Hoş Geldiniz"
  }'::jsonb,
  home_buttons JSONB NOT NULL DEFAULT '[
    {
      "id": "btn1",
      "type": "order",
      "label": "Sipariş Ver",
      "icon": "fa-utensils",
      "config": { "deliveryUrl": "", "enableTableOrder": true }
    },
    {
      "id": "btn2",
      "type": "app_page",
      "label": "Kampanyalar",
      "icon": "fa-bullhorn",
      "config": { "pageKey": "campaigns" }
    },
    {
      "id": "btn3",
      "type": "phone",
      "label": "Bizi Arayın",
      "icon": "fa-phone",
      "config": { "phoneNumber": "" }
    },
    {
      "id": "btn4",
      "type": "app_page",
      "label": "Geri Bildirim",
      "icon": "fa-comment-dots",
      "config": { "pageKey": "account" }
    }
  ]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Varsayılan satır
INSERT INTO customer_app_config (config_key)
VALUES ('default')
ON CONFLICT (config_key) DO NOTHING;
