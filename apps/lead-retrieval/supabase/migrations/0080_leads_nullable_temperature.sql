BEGIN;

alter table if exists public.leads
  alter column temperature drop default;

alter table if exists public.leads
  alter column temperature drop not null;

notify pgrst, 'reload schema';

COMMIT;
