create table if not exists sale_templates (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  sale_ids    jsonb default '[]',
  created_at  timestamptz default now()
);

alter table sale_templates enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sale_templates'
      and policyname = 'allow_all'
  ) then
    create policy "allow_all" on sale_templates for all using (true) with check (true);
  end if;
end $$;
