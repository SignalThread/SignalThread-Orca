# 02 — Platform Core Schema

The canonical registry Housing integrates with. **Housing never queries this database directly** — this document exists so you understand what the ids you receive *mean*, and what Platform is authoritative for versus what Housing owns.

- **Project:** `wtbnpeluwhjjqccdofxd` (`signalthread-platform-core`), Supabase / Postgres
- **Migrations:** `apps/platform/supabase/migrations/`
- **Verified live:** 2026-09-10

---

## 1. What Platform Core owns vs what Housing owns

| Platform Core is authoritative for | Housing is authoritative for |
|---|---|
| User identity (who a person is) | Housing's local user records and roles |
| Organizations (the customer) | Housing companies/hotels/suppliers |
| Events (the canonical event record) | Housing's event-scoped operational data |
| Organization ↔ user membership | Housing's per-event permissions (RBAC) |
| Product catalog | — |
| Product entitlements (has this org bought Housing?) | Whether *this user* may open *this* housing workspace |
| Platform admin roster | — |

The division in one line: **Platform Core answers "may this account open Housing for this event at all?" Housing answers "and what may they do once inside?"**

---

## 2. Enums

```sql
org_role            OWNER | ADMIN | MEMBER
membership_status   ACTIVE | INVITED | SUSPENDED
org_status          ACTIVE | SUSPENDED
event_status        DRAFT | ACTIVE | ARCHIVED
event_role          ORGANIZER | CONTRIBUTOR | VIEWER
product_status      AVAILABLE | HIDDEN
entitlement_status  ACTIVE | SUSPENDED
```

⚠️ **`event_status` here is `DRAFT|ACTIVE|ARCHIVED`.** Products use their own, different event lifecycles (Lead Retrieval's local `events.status` is `ACTIVE|UPCOMING|COMPLETED`). Do not assume they line up. Platform's only launch-relevant rule is that `ARCHIVED` is not launchable.

---

## 3. Tables

### `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `slug` | text UNIQUE | `^[a-z0-9][a-z0-9-]{1,62}$` |
| `name` | text NOT NULL | non-blank |
| `status` | `org_status` | default `ACTIVE` |
| `created_at` / `updated_at` | timestamptz | `updated_at` maintained by trigger |

The customer account. One organization may hold many events and many product entitlements.

### `organization_memberships`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid → `organizations` | ON DELETE CASCADE |
| `user_id` | uuid → `auth.users` | ON DELETE CASCADE |
| `role` | `org_role` | default `MEMBER` |
| `status` | `membership_status` | default `ACTIVE` |

UNIQUE `(organization_id, user_id)` — one row per user per org; role changes update in place. Indexed on both `user_id` and `organization_id`.

### `events`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | **this is the `event_id` you receive on launch** |
| `organization_id` | uuid → `organizations` | ON DELETE CASCADE |
| `slug` | text | UNIQUE per organization |
| `name` | text NOT NULL | non-blank |
| `status` | `event_status` | default `DRAFT` |
| `starts_at` / `ends_at` | timestamptz NULL | may be open-ended; `ends_at >= starts_at` enforced |
| `venue` / `timezone` | text NULL | **see warning below** |

> ⚠️ **`venue` and `timezone` are defined in migration `20260907120000_platform_core_event_venue_timezone.sql` but that migration is NOT APPLIED to the live project.** Verified 2026-09-10: the live `events` relation exposes only `id, organization_id, slug, name, status, starts_at, ends_at, created_at, updated_at`. Platform reads them with a fallback so the overview still works. **Housing must not depend on `events.timezone`** — derive your own, or get the migration applied first (Ali's call).

> ⚠️ **`starts_at` / `ends_at` are frequently NULL in practice.** The live pilot event "Acme Annual 2026" has both null. If Housing needs event dates — and a housing product almost certainly does, for room-block date ranges — Housing must own them, prompt for them, or treat their absence as a first-class state. Do not assume they are populated.

### `event_memberships`

| Column | Type | Notes |
|---|---|---|
| `event_id` | uuid → `events` | ON DELETE CASCADE |
| `user_id` | uuid → `auth.users` | ON DELETE CASCADE |
| `role` | `event_role` | default `VIEWER` |

UNIQUE `(event_id, user_id)`. **Platform-level** access to an event — explicitly *not* product RBAC. Note that it is **not** consulted by the launch decision (see file 04 §3): launch authorization is org-membership + entitlement only. `event_memberships` is used by provisioning tooling and by Orca; treat it as informational unless you deliberately decide otherwise.

### `products`

| Column | Type | Notes |
|---|---|---|
| `key` | text PK | `^[a-z0-9][a-z0-9-]{1,30}$` — appears in JWT claims and product code, so it is a natural key, not a surrogate |
| `name` | text NOT NULL | |
| `status` | `product_status` | default `AVAILABLE` |

**Live contents (verified 2026-09-10):**

```
orca            Orca            AVAILABLE
registration    Registration    AVAILABLE
housing         Housing         AVAILABLE   ← already present
pulse           Pulse           AVAILABLE
lead-retrieval  Lead Retrieval  AVAILABLE
```

Your product key is the literal string **`housing`**. Nothing to add here.

### `organization_product_entitlements`

| Column | Type | Notes |
|---|---|---|
| `organization_id` | uuid → `organizations` | ON DELETE CASCADE |
| `product_key` | text → `products.key` | ON DELETE **RESTRICT** |
| `status` | `entitlement_status` | default `ACTIVE` |
| `granted_at` | timestamptz | |

UNIQUE `(organization_id, product_key)`.

**Entitlement is granted at the organization level, never per user.** Per-user access *is* organization membership. If an org holds an ACTIVE `housing` entitlement, every ACTIVE member of that org can launch Housing for that org's events — and Housing's own RBAC decides what they see.

Granting an entitlement is a provisioning action performed by Platform-owned server code with the service role. There is no self-serve path, and no RLS policy permits a user to write it.

### `platform_admins`

| Column | Type |
|---|---|
| `user_id` | uuid PK → `auth.users` |
| `granted_at` | timestamptz |
| `granted_by` | uuid → `auth.users` NULL |

SignalThread staff authority, distinct from org roles. Surfaces in the claim as `platform_admin: true`.

---

## 4. Row Level Security posture

Every table has RLS **enabled and forced** (so even the table owner is subject to it; only `service_role`, which has BYPASSRLS, is exempt).

**Reads:** granted to members of the owning organization, via two `SECURITY DEFINER` helpers with `search_path` pinned empty:

```sql
public.is_platform_admin()        -- is the caller in platform_admins?
public.is_org_member(uuid)        -- does the caller hold an ACTIVE membership of this org?
```

**Writes:** there is **no** insert/update/delete policy on *any* registry table. A user therefore cannot mutate their own membership, grant themselves an entitlement, or become a platform admin — not because a policy detects the attempt, but because no policy permits it. All provisioning goes through service-role server code.

**`anon` gets nothing.** All privileges revoked; Platform Core data requires a session.

This is a posture worth copying in Housing: *deny by default, and make privileged operations impossible through the data API rather than merely guarded.*

---

## 5. The three ids Housing will receive

When a launch is claimed (file 04), Platform returns exactly this:

```json
{
  "platform_user_id": "<uuid>",
  "organization_id":  "<uuid>",
  "event_id":         "<uuid>",
  "product":          "housing"
}
```

Housing stores these as **opaque UUID columns on its own rows** — never as foreign keys, because they live in a different database. The required column shape is in file 06 §2.

---

## 6. Live data sanity (as of 2026-09-10)

Useful context, not a spec. Platform Core currently holds 7 organizations, 9 events, 11 organization memberships, 9 event memberships and 10 entitlements. Two are hand-made pilots (`Acme Events` / "Acme Annual 2026", `Globex Summits`); the other five organizations are `st-demo-*` slugs generated by the demo-seeding framework in `scripts/demo-seeding/`.

If you want realistic multi-org data to build against, that framework is the supported way to get it — it provisions canonical Platform Core records and the matching product-side rows deterministically. Read `scripts/demo-seeding/README.md` before running anything; it writes to real projects and has explicit allowlists and ownership journals.
