alter table if exists public.leads
  add column if not exists quick_tags text[] not null default '{}'::text[];

alter table if exists public.leads
  add column if not exists is_hot boolean not null default false;

update public.leads
set is_hot = true
where is_hot = false
  and lower(coalesce(status, '')) = 'hot';
