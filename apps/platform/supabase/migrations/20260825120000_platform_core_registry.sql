-- SignalThread Platform Core — canonical registry (Phase 1, LOOP 2)
--
-- Target project: wtbnpeluwhjjqccdofxd (signalthread-platform-core) ONLY.
-- This SQL must never be applied to qgxvtgnzptepimuawnku (signalthread-orca)
-- or to the legacy Orca database.
--
-- Platform Core owns identity, organizations, events, product catalog, and
-- entitlements. Product apps own their own operational data and RBAC; Orca's
-- EventMemberRole is deliberately NOT mirrored here. There are no cross-database
-- foreign keys: Orca references Platform ids as opaque UUIDs.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.org_role as enum ('OWNER', 'ADMIN', 'MEMBER');
create type public.membership_status as enum ('ACTIVE', 'INVITED', 'SUSPENDED');
create type public.org_status as enum ('ACTIVE', 'SUSPENDED');
create type public.event_status as enum ('DRAFT', 'ACTIVE', 'ARCHIVED');
create type public.event_role as enum ('ORGANIZER', 'CONTRIBUTOR', 'VIEWER');
create type public.product_status as enum ('AVAILABLE', 'HIDDEN');
create type public.entitlement_status as enum ('ACTIVE', 'SUSPENDED');

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null,
  name        text not null,
  status      public.org_status not null default 'ACTIVE',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint organizations_slug_key unique (slug),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint organizations_name_not_blank check (length(btrim(name)) > 0)
);

-- ---------------------------------------------------------------------------
-- Organization memberships — links Platform Core auth users to organizations.
-- ---------------------------------------------------------------------------

create table public.organization_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.org_role not null default 'MEMBER',
  status          public.membership_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One membership row per user per organization; role changes update in place.
  constraint organization_memberships_org_user_key unique (organization_id, user_id)
);

create index organization_memberships_user_idx on public.organization_memberships (user_id);
create index organization_memberships_org_idx on public.organization_memberships (organization_id);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table public.events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug            text not null,
  name            text not null,
  status          public.event_status not null default 'DRAFT',
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint events_org_slug_key unique (organization_id, slug),
  constraint events_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  constraint events_name_not_blank check (length(btrim(name)) > 0),
  -- An event may be open-ended, but it may not end before it starts.
  constraint events_dates_ordered check (starts_at is null or ends_at is null or ends_at >= starts_at)
);

create index events_org_idx on public.events (organization_id);

-- ---------------------------------------------------------------------------
-- Event memberships — Platform-level access to an event, not product RBAC.
-- ---------------------------------------------------------------------------

create table public.event_memberships (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.event_role not null default 'VIEWER',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint event_memberships_event_user_key unique (event_id, user_id)
);

create index event_memberships_user_idx on public.event_memberships (user_id);
create index event_memberships_event_idx on public.event_memberships (event_id);

-- ---------------------------------------------------------------------------
-- Product catalog — stable string keys, because these appear in JWT claims and
-- in product code. A surrogate uuid would add indirection with no benefit.
-- ---------------------------------------------------------------------------

create table public.products (
  key         text primary key,
  name        text not null,
  status      public.product_status not null default 'AVAILABLE',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint products_key_format check (key ~ '^[a-z0-9][a-z0-9-]{1,30}$')
);

-- ---------------------------------------------------------------------------
-- Organization product entitlements — entitlement is granted at the
-- organization level, never per user. Per-user access is org membership.
-- ---------------------------------------------------------------------------

create table public.organization_product_entitlements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_key     text not null references public.products (key) on delete restrict,
  status          public.entitlement_status not null default 'ACTIVE',
  granted_at      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint org_product_entitlements_org_product_key unique (organization_id, product_key)
);

create index org_product_entitlements_org_idx on public.organization_product_entitlements (organization_id);

-- ---------------------------------------------------------------------------
-- Platform admins — SignalThread staff authority, distinct from org roles.
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  granted_at  timestamptz not null default now(),
  granted_by  uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
  for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger event_memberships_set_updated_at before update on public.event_memberships
  for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger org_product_entitlements_set_updated_at before update on public.organization_product_entitlements
  for each row execute function public.set_updated_at();
