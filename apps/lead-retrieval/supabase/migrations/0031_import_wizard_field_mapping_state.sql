-- Draft field-mapping state for Import Wizard (one active draft per exhibitor company)

create table if not exists public.import_wizard_field_mapping_state (
  company_id uuid primary key references public.companies(id) on delete cascade,
  csv_headers text[] not null default '{}',
  preview_rows jsonb not null default '[]'::jsonb,
  selections jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.import_wizard_field_mapping_state is
  'CSV headers, preview sample cells, and canonical field selections for the import wizard field-mapping step.';

create trigger import_wizard_field_mapping_state_set_updated_at
before update on public.import_wizard_field_mapping_state
for each row execute function public.set_updated_at();

alter table public.import_wizard_field_mapping_state enable row level security;

drop policy if exists "import_wizard_field_mapping_state_select_exhibitor"
  on public.import_wizard_field_mapping_state;
create policy "import_wizard_field_mapping_state_select_exhibitor"
on public.import_wizard_field_mapping_state
for select
using (
  company_id in (
    select id from public.companies where organizer_id = auth.uid()
  )
  or (
    public.current_role() = 'exhibitor'
    and company_id = public.current_company_id()
  )
);

drop policy if exists "import_wizard_field_mapping_state_upsert_exhibitor"
  on public.import_wizard_field_mapping_state;
create policy "import_wizard_field_mapping_state_upsert_exhibitor"
on public.import_wizard_field_mapping_state
for insert
with check (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
);

drop policy if exists "import_wizard_field_mapping_state_update_exhibitor"
  on public.import_wizard_field_mapping_state;
create policy "import_wizard_field_mapping_state_update_exhibitor"
on public.import_wizard_field_mapping_state
for update
using (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
)
with check (
  public.current_role() = 'exhibitor'
  and company_id = public.current_company_id()
);

drop policy if exists "import_wizard_field_mapping_state_delete_organizer"
  on public.import_wizard_field_mapping_state;
create policy "import_wizard_field_mapping_state_delete_organizer"
on public.import_wizard_field_mapping_state
for delete
using (
  public.current_role() = 'organizer'
  and company_id in (select id from public.companies where organizer_id = auth.uid())
);
