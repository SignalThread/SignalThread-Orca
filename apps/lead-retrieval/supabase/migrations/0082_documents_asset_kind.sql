alter table public.documents
  add column if not exists asset_kind text not null default 'file';

alter table public.documents
  drop constraint if exists documents_asset_kind_check;

alter table public.documents
  add constraint documents_asset_kind_check
  check (asset_kind in ('file', 'link'));

create index if not exists documents_asset_kind_idx
  on public.documents (asset_kind);

notify pgrst, 'reload schema';
