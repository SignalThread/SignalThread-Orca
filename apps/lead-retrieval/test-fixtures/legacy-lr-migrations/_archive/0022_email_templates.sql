create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_templates_account_id_idx
  on public.email_templates (account_id);

create index if not exists email_templates_updated_at_idx
  on public.email_templates (updated_at desc);

create unique index if not exists email_templates_one_default_per_account_idx
  on public.email_templates (account_id)
  where is_default = true;

drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;

drop policy if exists "email_templates_select_scope" on public.email_templates;
create policy "email_templates_select_scope"
on public.email_templates
for select
using (
  account_id = public.current_company_id()
  and public.current_role() in ('exhibitor_admin', 'viewer', 'exhibitor')
);

drop policy if exists "email_templates_insert_exhibitor_admin" on public.email_templates;
create policy "email_templates_insert_exhibitor_admin"
on public.email_templates
for insert
with check (
  public.current_role() = 'exhibitor_admin'
  and account_id = public.current_company_id()
);

drop policy if exists "email_templates_update_exhibitor_admin" on public.email_templates;
create policy "email_templates_update_exhibitor_admin"
on public.email_templates
for update
using (
  public.current_role() = 'exhibitor_admin'
  and account_id = public.current_company_id()
)
with check (
  public.current_role() = 'exhibitor_admin'
  and account_id = public.current_company_id()
);

drop policy if exists "email_templates_delete_exhibitor_admin" on public.email_templates;
create policy "email_templates_delete_exhibitor_admin"
on public.email_templates
for delete
using (
  public.current_role() = 'exhibitor_admin'
  and account_id = public.current_company_id()
);
