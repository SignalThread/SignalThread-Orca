-- Server-owned lead delete for authenticated clients (e.g. mobile) without relying on exhibitor JWT DELETE RLS.
-- Returns structured JSON; SECURITY DEFINER with explicit authz.

create or replace function public.delete_lead(lead_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_role text;
  v_company_id uuid;
  v_lead_company uuid;
  v_deleted int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select company_id into v_lead_company
  from public.leads
  where id = lead_id;

  if v_lead_company is null then
    return jsonb_build_object('ok', true, 'missing', true);
  end if;

  select lower(trim(role::text)), company_id
    into v_role, v_company_id
  from public.users
  where id = uid;

  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Exhibitor admin: lead must belong to caller's company (matches app API scope).
  if v_role = 'exhibitor_admin'
     and v_company_id is not null
     and v_company_id = v_lead_company then
    delete from public.leads
    where id = lead_id
      and company_id = v_company_id;
    get diagnostics v_deleted = row_count;
    if v_deleted = 1 then
      return jsonb_build_object('ok', true, 'id', lead_id::text);
    end if;
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  -- Organizer: caller owns the lead's company (organizer_id), independent of users.role spelling.
  if exists (
    select 1
    from public.companies c
    where c.id = v_lead_company
      and c.organizer_id = uid
  ) then
    delete from public.leads
    where id = lead_id
      and company_id = v_lead_company;
    get diagnostics v_deleted = row_count;
    if v_deleted = 1 then
      return jsonb_build_object('ok', true, 'id', lead_id::text);
    end if;
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object('ok', false, 'error', 'forbidden');
end;
$$;

comment on function public.delete_lead(uuid) is
  'Deletes a lead when the caller is exhibitor_admin for that company or owns the company as organizer; returns JSON outcome.';

revoke all on function public.delete_lead(uuid) from public;
grant execute on function public.delete_lead(uuid) to authenticated;
