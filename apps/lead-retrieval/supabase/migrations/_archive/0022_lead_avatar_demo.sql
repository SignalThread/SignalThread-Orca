-- Demo / profile headshots: optional URL (served from /public or external CDN).
-- is_demo: marks leads that belong to demo datasets; assignment scripts only update avatar_url when is_demo is true.

alter table public.leads
  add column if not exists avatar_url text null;

alter table public.leads
  add column if not exists is_demo boolean not null default false;

comment on column public.leads.avatar_url is 'Optional square headshot URL; when null UI uses deterministic placeholder or initials.';
comment on column public.leads.is_demo is 'True for demo/seed leads; demo avatar scripts must only touch rows with is_demo = true.';

create index if not exists idx_leads_is_demo on public.leads (is_demo) where is_demo = true;
