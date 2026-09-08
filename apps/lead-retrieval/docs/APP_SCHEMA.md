# Schema index — Lead Intel

**Authoritative cloud contract:** `types/database.ts` (regenerate from Supabase; column-level human reference archived in [`docs/old/SCHEMA_TABLE_REFERENCE.md`](./old/SCHEMA_TABLE_REFERENCE.md), may drift — prefer generated types).

This file **indexes** sources and **aligns product capabilities** to schema areas without duplicating column lists. Do not treat it as a second copy of DDL.

---

## Code-verified current behavior (cloud)

- **Runtime types:** `types/database.ts`
- **DDL history:** `supabase/migrations/*.sql`
- **Human tables doc (archived):** [`docs/old/SCHEMA_TABLE_REFERENCE.md`](./old/SCHEMA_TABLE_REFERENCE.md)
- **Curated JSON summary (archived):** [`docs/old/DB_SCHEMA_LOCKED.json`](./old/DB_SCHEMA_LOCKED.json) → section `cloud`

**Lead row (`public.leads`):** align all clients to `types/database.ts` (e.g. `full_name`, `company_id`, `event_id`, `email`, `job_title`, `company_text`, `rating`, `priority_score`, `status`, `follow_up_date`, `owner_user_id`, enrichment fields, `updated_at`, etc.). Older docs that omit columns are **stale**.

**Import wizard (exhibitor batch ingest):** `import_batches`, `import_batch_rows`, `import_batch_field_mapping_state`, `import_batch_row_briefings`, `import_wizard_enrichment_runs`, and related migrations — see `supabase/migrations/` and `types/database.ts` for the exact set present in your branch.

---

## Tables Admin and mobile both depend on (field-level, code-used)

Authority: **`types/database.ts`** Row shapes; gaps filled from **`supabase/migrations/*.sql`** where generated types lag (notably **`invite_codes`** exists in DB and invite code paths but may be absent until types are regenerated).

| Table | Fields / notes (app-facing) |
|-------|-----------------------------|
| **`users`** | `id`, `email`, `full_name`, `role` (`platform_admin`, `organizer_admin`, `exhibitor_admin`, `exhibitor_viewer`, `viewer`), `company_id`, `event_access_mode` (`all_company_events` \| `assigned_events_only`), `license_id` (**legacy / non-authoritative for seats** — do not use for entitlements), `created_at`. |
| **`companies`** | `id`, `name`, `organizer_id`, `default_enrichment_provider`, `created_at`. |
| **`events`** | `id`, `company_id`, `name`, `status`, dates/location fields, `briefing_strategy` (jsonb — event-level briefing config), `is_active`, timestamps. |
| **`event_users`** | `id`, `user_id`, `event_id`, `exhibitor_company_id`, `status` (`active` / `invited` / …), `permissions` jsonb with **`admin`** and **`app`** booleans (also accepts legacy array-shaped values — normalized in `normalizeEventUserPermissions`). Seat consumption for app uses **`permissions.app`** on **active** rows. |
| **`invite_codes`** | `event_id`, `exhibitor_company_id`, `email`, `permissions` jsonb, `code_hash`, `expires_at`, `used_at`, `used_by_user_id`, **`event_access_mode`** (per migration `0063_*`), timestamps — see `lib/server/invites/createInviteCode.ts` and `app/api/invites/claim/route.ts`. |
| **`leads`** | Identity: `id`, `company_id`, `event_id`, `full_name`, `email`, `job_title`, `company_text`, `owner_user_id`. Workflow: `status`, `rating`, `priority_score`, `follow_up_date`, `temperature`, `is_hot`. Capture/meta: `metadata` jsonb, `intent_signals` jsonb. Enrichment (mirror + raw-ish): `enriched_*` columns, `company_domain`, `company_size`, `industry`, `seniority`, `linkedin_url`. Timestamps: `created_at`, `updated_at`. |
| **`lead_enrichments`** | `lead_id`, `provider`, `raw_response` jsonb, `created_at` — audit/history of enrichment calls. |
| **`lead_briefings`** | `lead_id` (unique), `company_id`, `content` jsonb (structured briefing: headline, signals, questions, etc.), `approval_status` (`pending` \| `approved`), `reviewed_at`, `reviewed_by`, timestamps. **System of record** for exhibitor **AI Brief** UI after import approval/publish sync. |
| **`briefing_event_knowledge`** | Event-scoped knowledge items for briefing context (see migrations `0042_*` and `types/database.ts`). Used by import/briefing flows and exhibitor briefing-knowledge APIs. |
| **`licenses`** | `id`, `company_id`, **`exhibitor_company_id`**, **`event_id`** (nullable by scope), **`scope`** (`event` \| `company`), `status`, `starts_at`, `expires_at`, `seats_total`, **`seats_used`** (derived cache — **not** authoritative for grants), `can_create_events`, `max_events`, billing/metadata fields, `license_key`, `license_plan_id`. |
| **`campaigns`** | `id`, `company_id`, `name`, `mode`, `status`, draft fields, `selected_signals` jsonb, scheduling fields, `created_by`, timestamps. |
| **`campaign_recipients` / `campaign_messages` / `email_events`** | Campaign send pipeline; message status, provider ids, engagement events. |
| **`signals`** | Library rows: prompts, visibility, category, `created_by`, etc. — see `0008_signal_library.sql` and `types/database.ts`. |
| **`import_batch_*` / `import_wizard_*`** | Wizard state: batches, staged rows, field mapping state, row-level briefings, enrichment runs — see migrations `0032`–`0053` et al. |

**Not present in this repo:** **`badge_templates`** (no table in migrations here). If product references badge templates, they are out-of-repo or not yet migrated.

---

## Platform / product capabilities — schema alignment (no fake columns)

The table below maps **product capabilities** (from [`PROJECT_SUMMARY_APP.md`](./PROJECT_SUMMARY_APP.md)) to **supporting data areas** that exist or are planned. It does **not** assert that every capability has a dedicated table or a finished UI.

| Capability area | Supporting schema / storage (high level) | Notes |
|-------------------|-------------------------------------------|--------|
| Show-floor capture & pipeline | `public.leads`, events/exhibitors/licenses, `event_users` | Mobile client; cloud is system of record. |
| Offline capture + sync | Planned: local SQLite + outbox (mobile repo) → `public.leads` | See **Mobile — local SQLite** below. |
| Conversation recording | Storage + lead association (patterns vary by client) | Not a single generic “recordings” table name in this index; verify `types/database.ts` + migrations for audio/attachment columns in your branch. |
| AI summaries / briefings | LLM + stored text on lead or batch briefing tables | **Import wizard:** `import_batch_row_briefings` → approval sync → **`lead_briefings`** (Per-lead AI Brief in exhibitor UI). Conversation summaries may also use `lead_conversations` — verify branch. |
| Prioritization / hot scoring | `priority_score`, `rating`, `status`, signals usage | Campaigns/signals link to leads and company scope. |
| AI Signals / behavioral insights | `signals`, campaign `selected_signals`, lead enrichment | Signal Library + campaign wiring in this repo. |
| AI follow-up campaigns | `campaigns`, `campaign_recipients`, `campaign_messages`, draft fields | Route handlers under `app/api/campaigns/`. |
| Follow-up scheduling | `follow_up_date` on leads (and related UX) | Field exists on lead model; product completeness depends on client. |
| Send documents/content | Attachments / storage patterns | **Verify** Storage usage and any attachment tables in migrations — not assumed here. |
| Booth / sponsor / post-event / ROI / renewal reporting | Aggregates over `leads`, events, campaigns, `email_events` | **Reporting product surfaces** may be partial; ROI-specific fact tables are **not** claimed here without migration proof. |

If a capability is **not** represented in `types/database.ts` for your branch, treat it as **product direction** or **integration-layer**, not as shipped schema.

---

## Shared-system dependencies

- **RLS:** Tenant-scoped access for exhibitor/organizer/platform roles; see `supabase/migrations/*.sql`.
- **Service role:** Used only where documented for server-only operations (e.g. some enrichment or admin paths).
- **External providers:** Enrichment API keys (company/workspace config); email provider for campaigns.

---

## Future / extended capabilities (schema)

- **Mobile local SQLite (planned; not implemented in this repo):** canonical on-device store, `sync_outbox`, sync engine — see [`docs/old/DB_SCHEMA_LOCKED.json`](./old/DB_SCHEMA_LOCKED.json) → `mobile_local_sqlite_planned`.
- **Additional analytics / ROI tables:** Introduce only via migrations + `types/database.ts` updates; do not document here as existing until merged.

---

## Mobile — local SQLite (planned; not implemented in this repo)

**Status:** *Planned architecture for Lead Intel Scan; not shipped in this codebase.*

- Canonical on-device store (SQLite), e.g. **`local_leads`** — holds capture payloads until synced.
- **`sync_outbox`** — durable queue of mutations (create/update lead) with retry/backoff; processing must be **idempotent** server-side where possible.
- **Sync engine** — drains outbox → Supabase; success means rows appear in `public.leads` under the same contract as web.
- **Audio** — stored locally first; upload to object storage / Supabase Storage is a **follow-on job**, not on the critical path for “lead saved.”

Details: [`docs/old/DB_SCHEMA_LOCKED.json`](./old/DB_SCHEMA_LOCKED.json) → section `mobile_local_sqlite_planned`.

---

## Engineering expectations

- **Single source of truth:** cloud schema = generated types + migrations.
- **Deterministic sync:** ordered outbox, safe retries, explicit conflict strategy (document in mobile repo when built).
- **Do not merge** local and cloud DDL in one table definition — keep sections separate (as in archived [`docs/old/DB_SCHEMA_LOCKED.json`](./old/DB_SCHEMA_LOCKED.json)).
