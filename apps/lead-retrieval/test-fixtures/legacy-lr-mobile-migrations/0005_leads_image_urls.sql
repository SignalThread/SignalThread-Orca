-- Nullable image URLs on leads (shared with admin; mobile reads same fields).
alter table if exists public.leads
  add column if not exists photo_url text;

alter table if exists public.leads
  add column if not exists avatar_url text;
