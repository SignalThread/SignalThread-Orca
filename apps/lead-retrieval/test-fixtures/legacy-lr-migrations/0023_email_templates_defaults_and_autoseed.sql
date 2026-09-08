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

create unique index if not exists email_templates_account_name_idx
  on public.email_templates (account_id, name);

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

create or replace function public.seed_default_email_templates(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_account_id is null then
    return;
  end if;

  insert into public.email_templates (account_id, name, subject, body, is_default)
  values
    (
      p_account_id,
      'Follow up resources',
      'Resources from {{company_name}}',
      E'Hi {{lead_name}},\n\nThanks for your time today. Sharing resources below:\n\n{{documents_list}}\n\nBest,\n{{rep_name}}',
      true
    ),
    (
      p_account_id,
      'Nice meeting you',
      'Great meeting you at {{event_name}}',
      E'Hi {{lead_name}},\n\nIt was great meeting you at {{event_name}}. Sharing a few resources that may be helpful:\n\n{{documents_list}}\n\nLet me know if you\'d like to continue the conversation.\n\nBest,\n{{rep_name}}',
      false
    ),
    (
      p_account_id,
      'Product overview',
      'Product overview',
      E'Hi {{lead_name}},\n\nHere is the product overview we discussed:\n\n{{documents_list}}\n\nLet me know if any questions come up.\n\nBest,\n{{rep_name}}',
      false
    )
  on conflict (account_id, name) do nothing;

  if not exists (
    select 1
    from public.email_templates
    where account_id = p_account_id
      and is_default = true
  ) then
    update public.email_templates
    set is_default = true,
        updated_at = now()
    where account_id = p_account_id
      and name = 'Follow up resources';
  end if;
end;
$$;

select public.seed_default_email_templates(c.id)
from public.companies c;

create or replace function public.seed_default_email_templates_on_company_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_email_templates(new.id);
  return new;
end;
$$;

drop trigger if exists companies_seed_default_email_templates on public.companies;
create trigger companies_seed_default_email_templates
after insert on public.companies
for each row execute function public.seed_default_email_templates_on_company_insert();
