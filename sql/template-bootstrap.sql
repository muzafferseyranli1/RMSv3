create extension if not exists pgcrypto;

create table if not exists branch_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text null,
  branch_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists stock_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text null,
  stock_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create table if not exists sale_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text null,
  sale_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz null
);
