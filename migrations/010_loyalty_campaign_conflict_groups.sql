create table if not exists loyalty_campaign_conflict_groups (
  id text primary key,
  scope_type text not null default 'global',
  scope_branch_id uuid,
  scope_branch_name text,
  name text not null,
  code text,
  description text,
  active boolean not null default true,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint loyalty_campaign_conflict_groups_scope_type_check check (scope_type in ('global', 'branch'))
);

create index if not exists idx_loyalty_campaign_conflict_groups_scope on loyalty_campaign_conflict_groups(scope_type, scope_branch_id);
create index if not exists idx_loyalty_campaign_conflict_groups_active on loyalty_campaign_conflict_groups(active, sort_order);
create unique index if not exists uq_loyalty_campaign_conflict_groups_code_scope
  on loyalty_campaign_conflict_groups(scope_type, coalesce(scope_branch_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(coalesce(code, name)))
  where deleted_at is null;

alter table loyalty_campaign_conflict_groups enable row level security;

drop policy if exists allow_all_loyalty_campaign_conflict_groups on loyalty_campaign_conflict_groups;
create policy allow_all_loyalty_campaign_conflict_groups on loyalty_campaign_conflict_groups for all using (true) with check (true);
