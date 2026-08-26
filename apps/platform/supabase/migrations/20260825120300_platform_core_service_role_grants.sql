-- Grant the provisioning role its table privileges.
--
-- The RLS migration granted SELECT to `authenticated` and revoked everything
-- from `anon`, but never granted anything to `service_role`. That role has
-- BYPASSRLS, which exempts it from *row* filtering, but privileges are a
-- separate mechanism: without a GRANT it cannot touch the table at all, and
-- every read returned `42501 permission denied`.
--
-- service_role is the Platform provisioning identity. The registry has no
-- insert/update/delete policies by design, so provisioning is exactly the
-- service-role path: creating organizations, memberships, events, entitlements,
-- and admin grants. It therefore needs full DML here.
--
-- Additive only: no object is dropped, altered, or rewritten.

grant select, insert, update, delete on
  public.organizations,
  public.organization_memberships,
  public.events,
  public.event_memberships,
  public.products,
  public.organization_product_entitlements,
  public.platform_admins
to service_role;

grant usage on schema public to service_role;

-- Keep the anon posture explicit: no session, no Platform Core data.
revoke all on
  public.organizations,
  public.organization_memberships,
  public.events,
  public.event_memberships,
  public.products,
  public.organization_product_entitlements,
  public.platform_admins
from anon;
