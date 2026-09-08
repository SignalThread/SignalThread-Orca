# Lead Intel — Platform summary (Admin + Mobile)

**Single source of truth for product narrative:** combine this file with the machine-readable manifest in [`Admin_Project_Summary.md`](./Admin_Project_Summary.md) and the architecture record in [`SYSTEM_ARCHITECTURE.json`](./SYSTEM_ARCHITECTURE.json).

---

## Product capability / feature set

This section describes the **target capability set** for Lead Intel as a product (Admin web app + Lead Intel Scan mobile + shared Supabase backend). It is **not** a guarantee that every bullet is fully implemented in every client; see [Code-verified behavior in this repository](#code-verified-behavior-in-this-repository) and [`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md) for what this repo actually ships.

### Capture & sync

- **Show-floor lead capture** — Fast capture of prospects at the booth with identity and context tied to the event and exhibitor scope.
- **Offline capture with later sync** — Capture succeeds on-device first; mutations reconcile to the cloud when connectivity returns (mobile direction; see schema/architecture docs for status).
- **Faster lead workflow from scan to pipeline** — Reduce friction from first touch to CRM-ready or sales-ready records.

### Conversation intelligence

- **Full conversation recording** — Audio capture associated with leads for review and compliance-sensitive workflows.
- **AI conversation summaries** — Structured summaries of recorded or transcribed conversations.
- **AI briefings before meetings** — Pre-meeting context so reps open with the right narrative.

### Prioritization & signals

- **Real-time lead prioritization / hot lead scoring** — Rank and surface leads that merit immediate follow-up.
- **AI Signals / behavioral insights** — Signals library and configurable prompts tied to lead and campaign workflows.

### Engagement & follow-up

- **AI-written follow-up campaigns** — Draft outbound email content aligned to campaigns and recipients.
- **Immediate follow-up scheduling** — Schedule next steps from the lead record.
- **Send documents/content from the app** — Attach or link collateral in outbound or in-app flows.

### Visibility & reporting

- **Booth performance visibility** — Operational visibility into how the booth and team are performing during the event.
- **Sponsor engagement visibility** — Where applicable, visibility into sponsor-related engagement (scope depends on event packaging).
- **Post-event reporting** — Summaries and exports after the show.
- **ROI measurement / proving exhibitor value** — Reporting that helps exhibitors justify spend and outcomes.
- **Renewal-supporting reporting** — Narrative and metrics that support renewals and upsell conversations.

---

## Code-verified behavior in this repository

The **Lead Retrieval Admin** Next.js app in this repo is the authoritative place to verify **what is implemented today** (routes, API handlers, RLS-backed tables). Non-exhaustive examples:

- **Web:** Exhibitor dashboards, lead list/detail, campaigns (create, draft generation, recipients, messages), Signal Library (platform/admin), organizer/platform admin flows (events, exhibitors, licenses, invites), **exhibitor import wizard** (CSV staging, field mapping, batch enrichment, validation, briefing, publish) — see migrations under `supabase/migrations/` and `app/api/`.
- **Not implemented in this repo:** The **Lead Intel Scan** mobile app (Expo), **local SQLite + sync outbox** for offline-first capture, and **mobile-specific** audio upload pipelines.

Treat UI-only or placeholder surfaces in the Admin app as **not shipped** until backed by API + schema + tests; see [`Admin_Project_Summary.md`](./Admin_Project_Summary.md) for route-level manifests where maintained.

---

## Platform / product capabilities (cross-client)

Capabilities below are **product intent** realized across **Admin + Mobile + Supabase**, not a single-repo checklist:

- Shared **Supabase Postgres** contract for `public.leads` and related tables (`types/database.ts`).
- **Campaigns** and **signals** as first-class admin/backend features in this repo.
- **Import wizard** for pre-event batch ingest (this repo), distinct from on-floor mobile capture.

---

## Shared-system dependencies

- **Supabase:** Postgres, Auth, RLS; optional Storage for assets; same project for Admin and mobile.
- **Email:** Outbound campaign email where integrated (e.g. SendGrid — verify deployment config).
- **Object storage / large assets:** Audio and files; upload patterns vary by feature and client.
- **External enrichment APIs:** Where configured (e.g. Apollo, PDL, ZoomInfo) for lead enrichment flows.

---

## Future / extended capabilities

- **Offline-first mobile** — SQLite canonical store, `sync_outbox`, background sync engine (documented as planned in [`APP_SCHEMA.md`](./APP_SCHEMA.md) and archived detail in [`docs/old/DB_SCHEMA_LOCKED.json`](./old/DB_SCHEMA_LOCKED.json) → `mobile_local_sqlite_planned`; verify `types/database.ts` for cloud contract).
- **Deeper ROI and renewal analytics** — May combine reporting surfaces, exports, and integrations; not implied by a single table in the schema index.

---

## What ships in this repository

- **Lead Retrieval Admin** — Next.js App Router web app: platform, organizer, and exhibitor surfaces; campaigns; Signal Library API; shared Supabase contract; exhibitor import wizard (batch ingest).

## What does not ship here

- **Lead Intel Scan (mobile)** — Expo app lives in a separate repo. It uses the **same** Supabase backend and `public.leads` (and related) contract; it is **not** a separate backend.

## Current vs planned (mobile capture)

| Topic | Current state | Planned (not in this repo yet) |
|--------|----------------|--------------------------------|
| Capture | Network-dependent for persisting to Supabase | Offline-first: SQLite canonical store, sync outbox, background sync |
| Audio | Recorded and uploaded subject to connectivity | Local-first capture; upload queued as **secondary** work after lead sync |
| System of record (cloud) | Supabase Postgres | Unchanged after sync |

## Where to read more

| Doc | Purpose |
|-----|---------|
| [`Admin_Project_Summary.md`](./Admin_Project_Summary.md) | Admin-focused manifest + surfaces summary |
| [`APP_ARCHITECTURE.md`](./APP_ARCHITECTURE.md) | Architecture contract: verified vs platform vs dependencies, integrations summary |
| [`SYSTEM_ARCHITECTURE.json`](./SYSTEM_ARCHITECTURE.json) | Machine-readable system map + external services |
| [`APP_SCHEMA.md`](./APP_SCHEMA.md) | Schema index (cloud vs local) + capability alignment |
| [`docs/old/README.md`](./old/README.md) | Index of **non-canonical** archived docs (API inventory, schema tables, audits, handoffs) |
