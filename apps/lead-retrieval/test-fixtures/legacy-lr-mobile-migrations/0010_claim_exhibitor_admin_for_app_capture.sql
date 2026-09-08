-- Mobile capture users provisioned as exhibitor_viewer must gain tenant-wide exhibitor_admin when they have
-- event_users.permissions granting app access (aligned with public.event_app_permission_enabled / mobile gate).
-- Viewer-only remains exhibitor_viewer with no qualifying membership row.

begin;

create or replace function public.claim_exhibitor_admin_for_app_capture()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated int;
begin
  if uid is null then
    return false;
  end if;

  update public.users u
  set role = 'exhibitor_admin'
  where u.id = uid
    and u.role = 'exhibitor_viewer'
    and u.company_id is not null
    and exists (
      select 1
      from public.event_users eu
      inner join public.events ev on ev.id = eu.event_id
      where eu.user_id = uid
        and ev.company_id = u.company_id
        and public.event_app_permission_enabled(eu.permissions)
    );

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

comment on function public.claim_exhibitor_admin_for_app_capture() is
  'Elevates exhibitor_viewer to exhibitor_admin when event_users grants app capture for same-company events;'
  ' keeps intentional viewers without app membership read-only at tenant policy layer.';

grant execute on function public.claim_exhibitor_admin_for_app_capture() to authenticated;

commit;
