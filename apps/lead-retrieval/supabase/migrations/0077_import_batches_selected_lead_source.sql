-- AI brief workspaces can now be created from selected existing leads, not only import files.
-- Keep import-wizard's one-active-draft invariant scoped to import-file workspaces only.

alter table public.import_batches
  add column if not exists source_kind text not null default 'import_file'
    constraint import_batches_source_kind_chk check (source_kind in ('import_file', 'selected_leads')),
  add column if not exists source_selected_lead_ids uuid[] not null default '{}'::uuid[];

comment on column public.import_batches.source_kind is
  'Workspace source: import_file for import wizard runs, selected_leads for AI brief runs created from existing leads.';

comment on column public.import_batches.source_selected_lead_ids is
  'Ordered public.leads ids used when source_kind = selected_leads. Empty for import-file workspaces.';

drop index if exists import_batches_one_draft_per_company;

create unique index if not exists import_batches_one_import_file_draft_per_company
  on public.import_batches (company_id)
  where status = 'draft' and source_kind = 'import_file';
