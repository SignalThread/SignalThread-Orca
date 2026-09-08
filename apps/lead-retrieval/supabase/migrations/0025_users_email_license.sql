alter table public.users
add column if not exists email text;

update public.users u
set email = au.email
from auth.users au
where au.id = u.id
  and u.email is null;

alter table public.users
add column if not exists license_id uuid references public.licenses(id);
