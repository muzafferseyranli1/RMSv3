create table if not exists public.branch_shift_schedule_days (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null,
  schedule_date date not null,
  day_start_time time not null default '08:00',
  day_end_time time not null default '19:00',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_shift_schedule_days_branch_date_uidx unique (branch_id, schedule_date)
);

create index if not exists branch_shift_schedule_days_branch_date_idx
  on public.branch_shift_schedule_days (branch_id, schedule_date);

create table if not exists public.branch_shift_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id text not null,
  schedule_date date not null,
  personnel_id text not null,
  personnel_name text not null,
  source_shift_preset_id uuid references public.branch_shift_presets(id) on delete set null,
  shift_name text not null,
  shift_short_code text not null,
  shift_kind text not null check (shift_kind in ('working', 'off', 'report', 'other')),
  shift_start_time time,
  shift_end_time time,
  break_start_time time,
  break_end_time time,
  break_minutes integer not null default 0 check (break_minutes >= 0 and break_minutes < 1440),
  color_hex text not null default '#94a3b8',
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_shift_schedule_entries_branch_date_personnel_uidx unique (branch_id, schedule_date, personnel_id),
  constraint branch_shift_schedule_entries_break_pair_chk check (
    (break_start_time is null and break_end_time is null)
    or
    (break_start_time is not null and break_end_time is not null)
  ),
  constraint branch_shift_schedule_entries_working_times_chk check (
    (shift_kind = 'working' and shift_start_time is not null and shift_end_time is not null)
    or
    (shift_kind <> 'working' and shift_start_time is null and shift_end_time is null)
  )
);

create index if not exists branch_shift_schedule_entries_branch_date_idx
  on public.branch_shift_schedule_entries (branch_id, schedule_date, sort_order, personnel_name);

create index if not exists branch_shift_schedule_entries_preset_idx
  on public.branch_shift_schedule_entries (source_shift_preset_id);

create or replace function public.touch_branch_shift_schedule_days_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_branch_shift_schedule_days_updated_at on public.branch_shift_schedule_days;

create trigger trg_branch_shift_schedule_days_updated_at
before update on public.branch_shift_schedule_days
for each row
execute function public.touch_branch_shift_schedule_days_updated_at();

create or replace function public.touch_branch_shift_schedule_entries_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_branch_shift_schedule_entries_updated_at on public.branch_shift_schedule_entries;

create trigger trg_branch_shift_schedule_entries_updated_at
before update on public.branch_shift_schedule_entries
for each row
execute function public.touch_branch_shift_schedule_entries_updated_at();
