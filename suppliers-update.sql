-- Suppliers tablosunu yeni alanlara göre güncelle
alter table suppliers
  add column if not exists cari_kodu        text,
  add column if not exists muhasebe_kodu    text,
  add column if not exists karsi_taraf_kodu text,
  add column if not exists marka_kisa_adi   text,
  add column if not exists yetkililer       jsonb default '[]',  -- [{ad, mail, telefon}]
  add column if not exists sirket_tipi      text default 'tuzel', -- 'tuzel' | 'sahis'
  add column if not exists vergi_dairesi    text,
  add column if not exists vergi_no         text,
  add column if not exists tc_no            text,
  add column if not exists fatura_tipi      text default 'e-arsiv', -- 'e-fatura'|'e-arsiv'|'kagit'|'fis'
  add column if not exists banka            text,
  add column if not exists iban             text,
  add column if not exists siparis_yontemi  text default 'email', -- 'email'|'telefon'|'whatsapp'|'entegrasyon'|'portal'
  add column if not exists siparis_mailleri jsonb default '[]',
  add column if not exists siparis_telefonlari jsonb default '[]',
  add column if not exists siparis_wa_no    text,
  add column if not exists logo_url         text;
