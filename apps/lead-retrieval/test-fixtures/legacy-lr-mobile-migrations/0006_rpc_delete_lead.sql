-- Canonical lead delete for mobile + admin: SECURITY DEFINER with explicit authz checks.
-- PostgREST client DELETE on public.leads can return 0 rows under RLS while SELECT still works
-- (policy / evaluation quirks). This RPC deletes with the same rules as RLS, without relying on
-- per-row DELETE policies for the anon/authenticated role chain.

begin;

create or replace function public.delete_lead(lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_user_company uuid;
  v_lead_company uuid;
  v_deleted uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select u.role::text, u.company_id
  into v_role, v_user_company
  from public.users u
  where u.id = v_uid;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'user_not_registered');
  end if;

  select l.company_id
  into v_lead_company
  from public.leads l
  where l.id = lead_id;

  if not found then
    -- Idempotent: already removed (e.g. admin deleted first).
    return jsonb_build_object('ok', true, 'missing', true);
  end if;

  if v_lead_company is null then
    return jsonb_build_object('ok', false, 'error', 'lead_missing_company');
  end if;

  if v_role = 'platform_admin' then
    delete from public.leads where id = lead_id returning id into v_deleted;
    return jsonb_build_object('ok', true, 'id', v_deleted);
  end if;

  if v_role in ('company_admin', 'exhibitor')
     and v_user_company is not null
     and v_user_company = v_lead_company then
    delete from public.leads where id = lead_id returning id into v_deleted;
    return jsonb_build_object('ok', true, 'id', v_deleted);
  end if;

  return jsonb_build_object('ok', false, 'error', 'forbidden');
end;
$$;

comment on function public.delete_lead(uuid) is
  'Authorized delete for public.leads; use from mobile/admin instead of raw table DELETE.';

grant execute on function public.delete_lead(uuid) to authenticated;

commit;
