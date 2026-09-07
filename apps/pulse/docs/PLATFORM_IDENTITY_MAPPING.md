# Pulse ↔ Platform Core identity mapping (phase 1)

Scope: the canonical identity **mapping layer inside Pulse** only. No handoff, no
Platform code, no login change, no backfill. Platform Core authenticates and routes;
Pulse authorizes and operates on its own database.

## 1. Decision: nullable columns on the existing models, not mapping tables

| Local model | Column added | Type | Null | Unique | Index |
|---|---|---|---|---|---|
| `User` | `platformUserId` | `uuid` | yes | **yes** | yes |
| `Account` | `platformOrganizationId` | `uuid` | yes | **no** | yes |
| `Event` | `platformEventId` | `uuid` | yes | **yes** | yes |

**Why columns.** The mapping is an *attribute of the local row*: a Pulse row has at most
one canonical counterpart. A mapping table would permit several canonical ids per local
row, which is precisely the ambiguity this layer exists to forbid, and it would add a join
to `requireAccountMembership` / `requireEventsEventAccess` — paths that already load the
`Account` and `Event` rows, where a column is free. Orca already ships
`User.platformUserId String? @unique @db.Uuid`, so columns also keep one canonical shape
across products.

**Why `@db.Uuid`.** Platform Core mints uuids for `user_id`, `organization_id` and
`event_id`. A uuid column makes it impossible to store a slug, an email or a Pulse cuid in
a mapping field — the database rejects it. Pulse's own primary keys are untouched: they
stay cuid/uuid text, and every public URL, QR code, storage key, survey id and response id
keeps its current value.

## 2. Uniqueness, decided from production data (read-only inspection)

- **`User.platformUserId` — UNIQUE.** Production holds 29 users with 29 distinct emails,
  and `User.id` is already the Supabase Auth uuid, so a canonical Platform user must
  resolve to exactly one Pulse user. Duplicate identity rows do not exist to accommodate.

- **`Account.platformOrganizationId` — indexed, deliberately NOT unique.** One Pulse
  Account maps to at most one organization (a single column guarantees that direction).
  The reverse is *not* safely enforceable: production has one contact email spread across
  **12 RETAIL accounts**, four further emails across 2 accounts each, and `Account.accountType`
  separates RETAIL from EVENTS, so a single organization plausibly owns several Pulse
  accounts. A `UNIQUE` constraint here would permanently prevent linking a genuine
  multi-account operator. Because 1:N is allowed, the resolver returns an explicit
  `AMBIGUOUS_MAPPING` failure instead of silently picking a row.

- **`Event.platformEventId` — UNIQUE.** A canonical Platform event has one Pulse workspace;
  two Pulse rows claiming the same canonical event would make resolution nondeterministic.
  Every value is null today, so the constraint cannot fail on existing rows, and Postgres
  permits unlimited NULLs. If a real one-to-many need appears, dropping the constraint is a
  purely additive follow-up.

## 3. Pulse `Event` is overloaded — Retail rows stay unmapped

`Event` backs both Events-product workspaces and Retail feedback campaigns (production:
33 events under EVENTS accounts, 32 under RETAIL). `platformEventId` is therefore nullable
and **explicitly assigned only**. Nothing infers a mapping from name, slug, email, contact
email, domain, similar ids or demo data, and there is no backfill. A Retail campaign simply
never receives a value, which is why the column can never be made `NOT NULL`.

## 4. Legacy identity behaviour is untouched

Still authoritative during the transition, unchanged by this phase:
`User.email` uniqueness and the email bridge in `linkAuthenticatedUser`, `User.id` as the
Pulse Supabase Auth uuid, `PendingProvision.email`, legacy `Admin.email`,
`SUPER_ADMIN_EMAILS`, the `Account.email` contact-match path in
`requireAccountMembership`, `AccountUserMembership` as the canonical access source,
`User.accountId` as the primary/landing account, and `/api/provision/start`. The mapping
columns are additive metadata; no current login or provisioning path reads them yet.

## 5. Resolution contract (`lib/platform/identity-mapping.ts`)

Local-only lookups. They never query Platform Core, and there is **no fallback to email,
name, slug, contact email or domain** — a caller-supplied identifier never becomes
authority merely because it resembles a local value.

```
resolvePulseUserByPlatformUserId(id)          -> User
resolvePulseAccountByPlatformOrganizationId(id) -> Account
resolvePulseEventByPlatformEventId(id)        -> Event (+ owning account context)
```

Every function returns a discriminated result, never a bare row or `null`:

| reason | meaning |
|---|---|
| `INVALID_PLATFORM_ID` | not a uuid — rejected before touching the database |
| `NOT_MAPPED` | no Pulse row carries that canonical id |
| `AMBIGUOUS_MAPPING` | more than one Pulse row carries it (reachable only for organizations) |
| `INACTIVE` | the mapped row exists but is deactivated |

## 6. The seam the handoff uses

The Platform → Pulse launch/handoff (`docs/PLATFORM_PULSE_HANDOFF.md`) consumes exactly
these resolvers: Platform verifies the one-time token and returns the canonical
`platform_user_id` / `organization_id` / `event_id`; `lib/platform/handoff-entry.ts`
resolves all three to local rows, proves the mapped Event belongs to the mapped Account,
and only then applies Pulse's own access model (`canUserAccessAccount`, the same source
`requireAccountMembership` uses). Nothing in the mapping layer grants access by itself.
