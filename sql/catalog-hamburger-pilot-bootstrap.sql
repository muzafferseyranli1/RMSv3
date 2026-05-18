create extension if not exists pgcrypto;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references categories(id) on delete cascade,
  bg text not null default '#fef3c7',
  text_color text not null default '#92400e',
  sku_mask text,
  append_type text,
  append_len integer not null default 4,
  description text,
  acc_cat text,
  acc_code text,
  expense_account_id text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table if exists categories add column if not exists bg text not null default '#fef3c7';
alter table if exists categories add column if not exists text_color text not null default '#92400e';
alter table if exists categories add column if not exists sku_mask text;
alter table if exists categories add column if not exists append_type text;
alter table if exists categories add column if not exists append_len integer not null default 4;
alter table if exists categories add column if not exists description text;
alter table if exists categories add column if not exists acc_cat text;
alter table if exists categories add column if not exists acc_code text;
alter table if exists categories add column if not exists expense_account_id text;
alter table if exists categories add column if not exists created_at timestamptz not null default now();
alter table if exists categories add column if not exists deleted_at timestamptz;

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  cari_kodu text,
  muhasebe_kodu text,
  karsi_taraf_kodu text,
  name text not null,
  marka_kisa_adi text,
  yetkililer jsonb not null default '[]'::jsonb,
  sirket_tipi text not null default 'tuzel',
  vergi_dairesi text,
  vergi_no text,
  tc_no text,
  fatura_tipi text not null default 'e_fatura',
  pay_term integer not null default 30,
  banka text,
  iban text,
  siparis_yontemi text not null default 'email',
  siparis_mailleri jsonb not null default '[]'::jsonb,
  siparis_telefonlari jsonb not null default '[]'::jsonb,
  siparis_wa_no text,
  logo_url text,
  cat text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table if exists suppliers add column if not exists cari_kodu text;
alter table if exists suppliers add column if not exists muhasebe_kodu text;
alter table if exists suppliers add column if not exists karsi_taraf_kodu text;
alter table if exists suppliers add column if not exists marka_kisa_adi text;
alter table if exists suppliers add column if not exists yetkililer jsonb not null default '[]'::jsonb;
alter table if exists suppliers add column if not exists sirket_tipi text not null default 'tuzel';
alter table if exists suppliers add column if not exists vergi_dairesi text;
alter table if exists suppliers add column if not exists vergi_no text;
alter table if exists suppliers add column if not exists tc_no text;
alter table if exists suppliers add column if not exists fatura_tipi text not null default 'e_fatura';
alter table if exists suppliers add column if not exists pay_term integer not null default 30;
alter table if exists suppliers add column if not exists banka text;
alter table if exists suppliers add column if not exists iban text;
alter table if exists suppliers add column if not exists siparis_yontemi text not null default 'email';
alter table if exists suppliers add column if not exists siparis_mailleri jsonb not null default '[]'::jsonb;
alter table if exists suppliers add column if not exists siparis_telefonlari jsonb not null default '[]'::jsonb;
alter table if exists suppliers add column if not exists siparis_wa_no text;
alter table if exists suppliers add column if not exists logo_url text;
alter table if exists suppliers add column if not exists cat text;
alter table if exists suppliers add column if not exists address text;
alter table if exists suppliers add column if not exists notes text;
alter table if exists suppliers add column if not exists active boolean not null default true;
alter table if exists suppliers add column if not exists created_at timestamptz not null default now();
alter table if exists suppliers add column if not exists deleted_at timestamptz;

create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  sku text,
  auto_sku boolean not null default false,
  name text not null,
  short_name text,
  location jsonb not null default '[]'::jsonb,
  acc_cat text,
  acc_code text,
  cat_l1 uuid references categories(id) on delete set null,
  cat_l2 uuid references categories(id) on delete set null,
  cat_l3 uuid references categories(id) on delete set null,
  cat_l4 uuid references categories(id) on delete set null,
  cat_l5 uuid references categories(id) on delete set null,
  unit text,
  packaging_units jsonb not null default '[]'::jsonb,
  min_stock numeric(10,3) not null default 0,
  max_stock numeric(10,3) not null default 1000,
  reorder numeric(10,3),
  order_unit text not null default 'ana',
  min_order numeric(10,3),
  max_order numeric(10,3),
  recipe_linked boolean not null default false,
  daily_usage numeric(10,3),
  auto_usage boolean not null default false,
  supp_id uuid references suppliers(id) on delete set null,
  purchase_price numeric(10,4),
  suppliers_list jsonb not null default '[]'::jsonb,
  saleable boolean not null default false,
  sale_name text,
  sale_group text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table if exists stock_items add column if not exists sku text;
alter table if exists stock_items add column if not exists auto_sku boolean not null default false;
alter table if exists stock_items add column if not exists short_name text;
alter table if exists stock_items add column if not exists location jsonb not null default '[]'::jsonb;
alter table if exists stock_items add column if not exists acc_cat text;
alter table if exists stock_items add column if not exists acc_code text;
alter table if exists stock_items add column if not exists cat_l1 uuid references categories(id) on delete set null;
alter table if exists stock_items add column if not exists cat_l2 uuid references categories(id) on delete set null;
alter table if exists stock_items add column if not exists cat_l3 uuid references categories(id) on delete set null;
alter table if exists stock_items add column if not exists cat_l4 uuid references categories(id) on delete set null;
alter table if exists stock_items add column if not exists cat_l5 uuid references categories(id) on delete set null;
alter table if exists stock_items add column if not exists unit text;
alter table if exists stock_items add column if not exists packaging_units jsonb not null default '[]'::jsonb;
alter table if exists stock_items add column if not exists min_stock numeric(10,3) not null default 0;
alter table if exists stock_items add column if not exists max_stock numeric(10,3) not null default 1000;
alter table if exists stock_items add column if not exists reorder numeric(10,3);
alter table if exists stock_items add column if not exists order_unit text not null default 'ana';
alter table if exists stock_items add column if not exists min_order numeric(10,3);
alter table if exists stock_items add column if not exists max_order numeric(10,3);
alter table if exists stock_items add column if not exists recipe_linked boolean not null default false;
alter table if exists stock_items add column if not exists daily_usage numeric(10,3);
alter table if exists stock_items add column if not exists auto_usage boolean not null default false;
alter table if exists stock_items add column if not exists supp_id uuid references suppliers(id) on delete set null;
alter table if exists stock_items add column if not exists purchase_price numeric(10,4);
alter table if exists stock_items add column if not exists suppliers_list jsonb not null default '[]'::jsonb;
alter table if exists stock_items add column if not exists saleable boolean not null default false;
alter table if exists stock_items add column if not exists sale_name text;
alter table if exists stock_items add column if not exists sale_group text;
alter table if exists stock_items add column if not exists created_at timestamptz not null default now();
alter table if exists stock_items add column if not exists deleted_at timestamptz;

create unique index if not exists stock_items_sku_unique_idx
  on stock_items (sku)
  where sku is not null;
