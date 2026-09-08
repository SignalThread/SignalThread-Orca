# Lead Intel Admin: Schema and System Model

**Platform context:** Admin and **Lead Intel Scan (mobile)** share the same Supabase project and lead model. Mobile does **not** use a separate backend. **Planned** offline-first capture (SQLite + outbox + sync) is **not** implemented in this repo; see [`APP_SCHEMA.md`](./APP_SCHEMA.md) and [`DB_SCHEMA_LOCKED.json`](./DB_SCHEMA_LOCKED.json) (`mobile_local_sqlite_planned`).

**Canonical manifest:** [`ADMIN_PROJECT_SUMMARY.md`](./ADMIN_PROJECT_SUMMARY.md) (JSON block) and [`SYSTEM_ARCHITECTURE.json`](./SYSTEM_ARCHITECTURE.json).

---

This document is grounded in live code artifacts in this repository, in this priority order:
1. `types/database.ts` (generated Supabase types; runtime app contract)
2. `supabase/migrations/*.sql` (tracked DDL history)
3. API/data-layer usage in `app/api/**` and `lib/data/**`

If sources disagree, sections are explicitly marked **Needs verification**.

## Schema Source of Truth Status
- Prisma schema: **not present in this repository**
- Primary runtime schema contract: `types/database.ts`
- Tracked SQL migrations: `supabase/migrations/*.sql`

## Core Tables (Implemented in Runtime Types)

## `public.companies`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `name` | text | no |
| `organizer_id` | uuid | no |
| `created_at` | timestamptz | no |

Relationships:
- Referenced by `users.company_id`
- Referenced by `events.company_id`
- Referenced by `exhibitors.company_id`
- Referenced by `licenses.company_id`
- Referenced by `licenses.exhibitor_company_id`
- Referenced by `event_users.exhibitor_company_id`
- Referenced by `leads.company_id`

## `public.users`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `role` | text | no |
| `company_id` | uuid | yes |
| `full_name` | text | yes |
| `email` | text | yes |
| `license_id` | uuid | yes |
| `created_at` | timestamptz | no |

Relationships:
- `users.company_id -> companies.id`
- `users.license_id -> licenses.id`
- `event_users.user_id -> users.id`
- `leads.owner_user_id -> users.id`

Auth linkage:
- Migration intent: `users.id` references `auth.users(id)`.

## `public.event_users`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `user_id` | uuid | no |
| `event_id` | uuid | no |
| `exhibitor_company_id` | uuid | yes |
| `status` | text | no |
| `permissions` | json/jsonb | no |
| `created_at` | timestamptz | no |

Relationships:
- `event_id -> events.id`
- `exhibitor_company_id -> companies.id`
- `user_id -> users.id`

Operational role:
- Event-scoped membership and permission record.

## `public.events`
`types/database.ts` columns:
- `id uuid`
- `company_id uuid`
- `name text`
- `city text | null`
- `state text | null`
- `location text | null`
- `start_date date | null`
- `end_date date | null`
- `status text`
- `is_active boolean | null`
- `created_at timestamptz | null`
- `updated_at timestamptz`

Relationship:
- `events.company_id -> companies.id`

**Needs verification**:
- Migration `0009_admin_events.sql` defines a different table shape (no `company_id`, `location`, `is_active`; non-null start/end dates).

## `public.exhibitors`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `event_id` | uuid | no |
| `company_id` | uuid | no |
| `status` | text | no |
| `created_at` | timestamptz | no |
| `updated_at` | timestamptz | no |

Relationships:
- `event_id -> events.id`
- `company_id -> companies.id`

Tracked index:
- Unique index `(event_id, company_id)` from migration `0010_exhibitors_event_company_unique.sql`.

## `public.license_plans`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `code` | text | no |
| `name` | text | no |
| `default_term_months` | int | no |
| `created_at` | timestamptz | no |

**Needs verification**:
- Table is in generated types and used in code, but creation migration is not present in tracked SQL files.

## `public.licenses`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `company_id` | uuid | no |
| `event_id` | uuid | yes |
| `exhibitor_company_id` | uuid | yes in types |
| `license_plan_id` | uuid | yes |
| `term_months` | int | yes |
| `price_cents` | int | yes |
| `currency` | text | no |
| `starts_at` | timestamptz | yes |
| `expires_at` | date/timestamptz string | no |
| `seats_total` | int | no |
| `seats_used` | int | no |
| `status` | text | no |
| `created_at` | timestamptz | no |

Relationships:
- `company_id -> companies.id`
- `event_id -> events.id`
- `exhibitor_company_id -> companies.id`
- `license_plan_id -> license_plans.id`

**Needs verification**:
- Migration `0011_licenses_exhibitor_company_not_null.sql` sets `exhibitor_company_id` NOT NULL, but generated types still show nullable.

## `public.leads`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `company_id` | uuid | no |
| `event_id` | uuid | yes |
| `owner_user_id` | uuid | yes |
| `full_name` | text | no |
| `email` | text | yes |
| `job_title` | text | yes |
| `priority_score` | int | no |
| `rating` | int | no |
| `status` | text | no |
| `temperature` | text | no |
| `follow_up_date` | date | yes |
| `company_text` | text | yes |
| `is_hot` | bool | no |
| enrichment columns | mixed | mostly yes |
| `created_at` | timestamptz | no |
| `updated_at` | timestamptz | no |

Relationships:
- `company_id -> companies.id`
- `event_id -> events.id`
- `owner_user_id -> users.id`

## `public.lead_enrichments`
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | no |
| `lead_id` | uuid | no |
| `provider` | text | no |
| `raw_response` | json/jsonb | no |
| `created_at` | timestamptz | no |

Relationship:
- `lead_id -> leads.id`

## Campaign Messaging Tables
### `public.campaigns`
Important columns:
- `id`, `company_id`, `created_by`, `name`, `mode`, `status`, `scheduled_at`, `selected_signals`, draft fields, timestamps.

Relationship:
- `company_id -> companies.id`

### `public.campaign_recipients`
Important columns:
- `id`, `campaign_id`, `lead_id`, `created_at`

Relationships:
- `campaign_id -> campaigns.id`
- `lead_id -> leads.id`

### `public.campaign_messages`
Important columns:
- `id`, `campaign_id`, `recipient_id`, `subject`, `body_text`, `body_html`, `status`, provider fields, timestamps

Relationships:
- `campaign_id -> campaigns.id`
- `recipient_id -> campaign_recipients.id`

### `public.email_events`
Important columns:
- `id`, `campaign_message_id`, `event_type`, `metadata`, `created_at`

Relationship:
- `campaign_message_id -> campaign_messages.id`

## `public.signals`
Important columns in generated types:
- `id`, `name`, `category`, `default_prompt`, `admin_override_prompt`
- `visibility`, `role_scope`, `template_scope`
- `is_active`, `available_in_pattern_mode`
- `tones text[]`
- `created_by uuid | null`
- `created_at`, `updated_at`

**Needs verification**:
- Migration `0008_signal_library.sql` defines `created_by NOT NULL` and does not define `tones`; generated types differ.

## Enums and Value Sets

## Explicit DB enum from migrations
- `public.signal_visibility`: `global`, `role`, `template`

## Status and role values used in code
- `users.role`: `platform_admin`, `organizer_admin`, `event_organizer`, `organizer`, `exhibitor_admin`, `viewer`
- `event_users.status`: `invited`, `active` (UI also references `inactive`)
- `licenses.status`: `active`, `trial`, `expired`
- `events.status`: `ACTIVE`, `UPCOMING`, `COMPLETED`
- `campaigns.status` and `campaign_messages.status`: `draft`, `scheduled`, `sending`, `sent`, `failed`

**Needs verification**:
- Tracked migration checks for `users.role` and `licenses.status` are older and may not match runtime usage.

## Relationships and Cardinality
- `auth.users (1) -> (0..1) public.users`
- `companies (1) -> (N) users`
- `events (1) -> (N) exhibitors`
- `companies (1) -> (N) exhibitors`
- `users (1) -> (N) event_users`
- `events (1) -> (N) event_users`
- `companies (0..1) -> (N) event_users` via `exhibitor_company_id`
- `events (1) -> (N) leads`
- `companies (1) -> (N) leads`
- `users (0..1) -> (N) leads` via owner
- `licenses` ties commercial + seat context to event/company/exhibitor scope

## Important Constraints and Indexes (Tracked Migrations)

### Constraints
- `users.role` check in `0001` (`organizer`, `exhibitor`) (likely stale)
- `licenses.seats_total >= 1`
- `licenses.seats_used >= 0`
- `licenses.status` check in `0001` (`active`, `expired`) (likely stale)
- `leads.priority_score between 0 and 100`
- `leads.status in ('new','follow_up','closed')`
- `campaigns.mode` check
- `campaigns.status` check
- `campaign_messages.status` check
- `email_events.event_type` check
- `signals.category` check

### Indexes / uniqueness
- `idx_users_company_id`
- `idx_companies_organizer_id`
- `idx_licenses_company_id`
- `idx_leads_company_id`
- `idx_leads_priority`
- `idx_events_start_date`, `idx_events_status`
- `idx_signals_*` set for visibility/category/is_active/created_by/updated_at
- Unique `campaign_recipients(campaign_id, lead_id)`
- Unique `campaign_messages(campaign_id, recipient_id)`
- Unique `exhibitors(event_id, company_id)`

## Access-Critical Fields
These fields must be correct for app visibility and access to work:
- `users.id`, `users.role`, `users.company_id`
- `event_users.user_id`, `event_users.event_id`, `event_users.status`
- `event_users.exhibitor_company_id` for exhibitor-scoped memberships
- `exhibitors.event_id`, `exhibitors.company_id`
- `licenses.event_id`, `licenses.exhibitor_company_id`, `licenses.seats_total`, `licenses.seats_used`
- `leads.event_id`, `leads.company_id`

## Nullable but Operationally Dangerous Fields
- `users.company_id` nullable: exhibitor pages fail scope if missing.
- `event_users.exhibitor_company_id` nullable in types: can break exhibitor-scoped features.
- `licenses.event_id` nullable in types: many UIs assume event-scoped license.
- `licenses.exhibitor_company_id` nullable in types despite migration enforcing NOT NULL.
- `events.start_date`/`end_date` nullable in types: date displays rely on fallback handling.

## Migration Gotchas and Drift
1. Tracked migration history does not fully represent runtime schema used in generated types.
2. Some tables in generated types have no corresponding create migration in repo.
3. Role/status constraints in old migrations conflict with current app role/status usage.
4. `events` definition in types and migrations materially differs.

## Implemented Now vs Needs Verification

### Implemented now (code + runtime types)
- App uses all tables listed in `types/database.ts` for reads/writes.
- Core access model relies on `users`, `event_users`, `events`, `exhibitors`, `licenses`, `leads`.

### Needs verification (DDL/policy deployment)
- Exact production DDL and constraints currently deployed.
- Exact RLS policies currently deployed for `event_users`, `exhibitors`, and role-dependent tables.
- Whether repository migrations are complete or partial snapshots.

## Plain-English End-to-End Model
- Supabase Auth identifies the user (`auth.users`).
- `public.users` stores app role and primary company linkage.
- `event_users` adds event membership and exhibitor scope context.
- `exhibitors` links companies to events.
- `licenses` define seats/commercial terms for exhibitor access in event scope.
- `leads` are event + company scoped records consumed by organizer and exhibitor surfaces.
- Campaign and signal tables power outbound messaging and content generation.
