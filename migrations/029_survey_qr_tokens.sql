-- Migration 029: Müşteri Anketi QR/Link Token Tablosu
-- Tarih: 2026-06-07
-- Not: template_id=UUID, branch_id=TEXT (şema ile uyumlu, FK yok)

CREATE TABLE IF NOT EXISTS survey_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES form_templates(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  -- mod: 'anonymous' = şube bilinmez | 'branch' = tek şube | 'multi_branch' = çoklu şube
  mode        TEXT NOT NULL DEFAULT 'anonymous' CHECK (mode IN ('anonymous','branch','multi_branch')),
  branch_id   TEXT,            -- tek şube ID'si (TEXT, company_nodes vb. ile uyumlu)
  branch_ids  JSONB,           -- çoklu şube için ["id1","id2"] JSON array
  label       TEXT,            -- "Masa QR - Kadıköy" gibi açıklayıcı etiket
  qr_config   JSONB NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_tokens_template ON survey_tokens(template_id);
CREATE INDEX IF NOT EXISTS idx_survey_tokens_token    ON survey_tokens(token);
CREATE INDEX IF NOT EXISTS idx_survey_tokens_active   ON survey_tokens(active) WHERE active = TRUE;
