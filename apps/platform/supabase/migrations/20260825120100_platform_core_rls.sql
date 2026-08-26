-- SignalThread Platform Core — Row Level Security (Phase 1, LOOP 2)
--
-- Target project: wtbnpeluwhjjqccdofxd ONLY.
--
-- Posture: every table denies by default. Reads are granted to members of the
-- owning organization. All writes to membership, entitlement, and admin tables
-- are withheld from ordinary users entirely -- those are provisioning actions
-- performed by Platform-owned server code holding the service role, which
-- bypasses RLS. A user therefore cannot mutate their own membership, grant an
-- entitlement, or promote themselves to Platform admin, because no policy
-- permits it rather than because a policy tries to detect the attempt.

-- ---------------------------------------------------------------------------
-- Helpers
--
-- SECURITY DEFINER so that reading organization_memberships inside a policy on
-- organization_memberships does not recurse. `search_path` is pinned empty and
-- every reference schema-qualified: a SECURITY DEFINER function with a mutable
-- search_path is a privilege-escalation vector.
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins pa where pa.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
      and m.status = 'ACTIVE'
  );
$$;

revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. A table with RLS enabled and no matching policy
-- denies, which is the intended default for every write path below.
-- ---------------------------------------------------------------------------

alter table public.organizations                      enable row level security;
alter table public.organization_memberships           enable row level security;
alter table public.events                             enable row level security;
alter table public.event_memberships                  enable row level security;
alter table public.products                           enable row level security;
alter table public.organization_product_entitlements  enable row level security;
alter table public.platform_admins                    enable row level security;

-- Force RLS so that even a table owner is subject to it; only the service role
-- (which has BYPASSRLS) is exempt.
alter table public.organizations                      force row level security;
alter table public.organization_memberships           force row level security;
alter table public.events                             force row level security;
alter table public.event_memberships                  force row level security;
alter table public.products                           force row level security;
alter table public.organization_product_entitlements  force row level security;
alter table public.platform_admins                    force row level security;

-- ---------------------------------------------------------------------------
-- organizations — a member reads their own org; nobody else sees it.
-- ---------------------------------------------------------------------------

create policy organizations_select_own on public.organizations
  for select to authenticated
  using (public.is_org_member(id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- organization_memberships — a user sees their own rows, and co-members of an
-- org they belong to. No insert/update/delete policy exists, so a member cannot
-- mutate membership or self-promote.
-- ---------------------------------------------------------------------------

create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- events — readable by members of the owning organization.
-- ---------------------------------------------------------------------------

create policy events_select_org on public.events
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- event_memberships — visible to the holder and to members of the owning org.
-- ---------------------------------------------------------------------------

create policy event_memberships_select on public.event_memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.events e
      where e.id = event_id and public.is_org_member(e.organization_id)
    )
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- products — the catalog is not secret; any signed-in user may read it so the
-- launcher can label products. Writes are service-role only.
-- ---------------------------------------------------------------------------

create policy products_select_all on public.products
  for select to authenticated
  using (status = 'AVAILABLE' or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- organization_product_entitlements — readable by org members so the launcher
-- can show enabled products. No write policy: granting is provisioning.
-- ---------------------------------------------------------------------------

create policy org_product_entitlements_select on public.organization_product_entitlements
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- platform_admins — only Platform admins can see the roster. No write policy,
-- so self-promotion is impossible through the data API.
-- ---------------------------------------------------------------------------

create policy platform_admins_select on public.platform_admins
  for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Table privileges. RLS filters rows; grants decide whether a role may attempt
-- the verb at all. anon gets nothing: Platform Core data requires a session.
-- ---------------------------------------------------------------------------

revoke all on public.organizations, public.organization_memberships, public.events,
  public.event_memberships, public.products, public.organization_product_entitlements,
  public.platform_admins from anon;

grant select on public.organizations, public.organization_memberships, public.events,
  public.event_memberships, public.products, public.organization_product_entitlements,
  public.platform_admins to authenticated;
