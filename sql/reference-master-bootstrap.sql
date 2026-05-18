create extension if not exists pgcrypto;

create table if not exists taxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(5,2) not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  symbol text null,
  sort_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

alter table units
  add column if not exists sort_order integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'sales_channels'
  ) then
    raise exception 'sales_channels table is required before running reference bootstrap';
  end if;
end $$;

alter table sales_channels
  add column if not exists show_in_kds boolean not null default true,
  add column if not exists show_in_queue boolean not null default true;
