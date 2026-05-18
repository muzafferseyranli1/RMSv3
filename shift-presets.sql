create table if not exists public.branch_shift_presets (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null,
  name text not null,
  short_code text not null,
  kind text not null default 'working' check (kind in ('working', 'off', 'report', 'other')),
  start_time time,
  end_time time,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes < 1440),
  color_hex text not null default '#f59e0b',
  sort_order integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint branch_shift_presets_working_times_chk check (
    (kind = 'working' and start_time is not null and end_time is not null)
    or
    (kind <> 'working' and start_time is null and end_time is null)
  )
);

create unique index if not exists branch_shift_presets_branch_short_code_uidx
  on public.branch_shift_presets (branch_id, lower(short_code))
  where deleted_at is null;

create index if not exists branch_shift_presets_branch_sort_idx
  on public.branch_shift_presets (branch_id, sort_order, name)
  where deleted_at is null;

create or replace function public.touch_branch_shift_presets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_branch_shift_presets_updated_at on public.branch_shift_presets;

create trigger trg_branch_shift_presets_updated_at
before update on public.branch_shift_presets
for each row
execute function public.touch_branch_shift_presets_updated_at();
