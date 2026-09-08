# Lead Intel — project manifest (Admin repo)

Engineering bar for this codebase: production-quality, scalable, low-breakage, tested before merge, minimal duplicated logic, safe data handling. See [`ENGINEERING_STANDARDS.md`](./ENGINEERING_STANDARDS.md) for extended guidance.

The JSON block below is the **canonical machine-readable summary** for this repository (Lead Retrieval Admin + shared backend contract). It is updated when architecture or product direction changes.

## What Admin does today (vs mobile)

- **Platform Admin** (`/admin/*`): organizer accounts, events, companies, licenses, exhibitors, **global Signal Library**, integration surfaces (e.g. Salesforce, Zapier admin pages), and support-style paths. Middleware allows only `platform_admin` (with narrow exceptions for `exhibitor_admin` on multi-event company licenses and selected integration routes).
- **Organizer Admin** (`/app/organizer/*` and `/organizer/*`): event-scoped operations for organizers (events, licenses, exhibitors, related data). Middleware requires `organizer_admin`; `platform_admin` is redirected away from organizer URLs to `/admin`.
- **Exhibitor / company web** (`/exhibitor/*`, `/app/exhibitor/*`): **Lead Intelligence** (leads list/detail, inline edits for admins), **per-lead AI Brief** backed by `public.lead_briefings` (approved import rows and publish sync), **briefing knowledge** (`briefing_event_knowledge` + upload/API routes), **import wizard** (CSV → `import_batch_*` → enrichment → briefing rows → publish), **campaigns** and **signals** UIs (APIs gate writes/list to `exhibitor_admin` / `platform_admin` as implemented), team/invites, documents hub, enrichment provider settings. After sign-in, `/api/auth/exhibitor-web-entry` resolves the first exhibitor path (dashboard vs leads vs app-access readiness) from `event_users` and license state.
- **Lead Intel Scan (mobile)** is a separate Expo app: same Supabase project; capture- and action-oriented. **Online persistence** to `public.leads` is the norm today; offline-first SQLite is still **planned** in the mobile repo (not implemented here). Some **bearer** API routes enforce extra rules (e.g. `exhibitor_viewer` lead list requires `eventId`).

This doc does **not** certify production readiness. Live behavior depends on Supabase configuration, RLS, secrets, and provider integrations—verify per deployment.

## Manifest

```json
{
  "meta": {
    "repo": "lead-intel-admin",
    "stack_admin": "Next.js 16.x App Router, TypeScript, Tailwind, Supabase (Auth + Postgres) — see package.json for exact Next semver",
    "orm_note": "No Prisma. Runtime contract: `types/database.ts` (regenerate from Supabase) plus `supabase/migrations/*.sql`. Some tables used in code (e.g. `invite_codes`) may be missing from generated types until regen — migrations remain authoritative.",
    "mobile_app_repo": "separate (Lead Intel Scan / Expo); not vendored here"
  },
  "mobile_app": {
    "name": "Lead Intel Scan",
    "type": "Expo Router (external repo)",
    "backend": "Supabase — same project and shared tables as Admin (not a separate backend)",
    "current_state": {
      "capture_persistence": "Online-dependent for writing captured leads to Supabase today",
      "shared_lead_model": "Uses `public.leads` and related tables per `types/database.ts`"
    },
    "planned_offline_first": {
      "status": "Not implemented in this repository; mobile repo will own runtime",
      "local_store": "SQLite as canonical on-device capture store",
      "tables_planned": ["local_leads", "sync_outbox"],
      "sync_engine": "Background worker: retry with backoff, idempotent server handling where applicable",
      "audio": "Captured/stored locally first; upload is a secondary queued job after lead payload sync (preserves optimization work behind sync layer)",
      "cloud_system_of_record": "Supabase Postgres remains SoR after successful sync"
    },
    "features_observed_in_manifest_history": {
      "capture": ["qr_scanning", "audio_recording", "flash_toggle", "permissions_handling"],
      "leads_ui": ["search", "priority", "rating", "follow_up_date"]
    }
  },
  "admin_app": {
    "name": "Lead Retrieval Admin",
    "roles": ["platform_admin", "organizer_admin", "exhibitor_admin", "exhibitor_viewer", "viewer"],
    "surfaces": {
      "platform": "/admin",
      "organizer": "/app/organizer and /organizer (both organizer middleware prefixes)",
      "exhibitor": "/exhibitor/* and /app/exhibitor/* — post-login resolver /api/auth/exhibitor-web-entry",
      "shared_campaigns_ui": "/campaigns/* (AppShell; APIs restrict by role — see RBAC_MATRIX.json)"
    },
    "key_modules": [
      "Lead Intelligence — leads list/detail, Lead Intel columns, per-lead AI Brief tab from lead_briefings",
      "Import wizard — CSV batch ingest, enrichment, per-row briefings, approve/publish sync to leads + lead_briefings",
      "Briefing knowledge — event-scoped context for briefings (briefing_event_knowledge + API/upload)",
      "Campaigns — draft generation, recipients, send pipeline (API: exhibitor_admin + platform_admin for core list/write)",
      "Signal Library — global signals (API read/write: platform_admin + exhibitor_admin in route handlers)",
      "Licenses & seats — event vs company scope; canonical seat math in lib/server/event-user-access.ts (evaluateAppAccessGrant)",
      "Invites & claims — invite_codes + app/api/invites/claim; event_access_mode on invites and users",
      "Integrations — enrichment (Apollo, PDL, ZoomInfo), email/campaign providers, Salesforce/Zapier admin pages"
    ],
    "lead_intel": {
      "lead_briefings": "One row per lead per company; jsonb content + approval_status; synced from approved import_batch_row_briefings on publish; drives exhibitor AI Brief UI and list badges",
      "exhibitor_lead_briefing_api": "GET /api/exhibitor/leads/[leadId]/briefing — exhibitor_admin only in handler",
      "mobile_note": "exhibitor_viewer bearer lead list requires eventId query param; mobile uses same leads table under RLS where applicable"
    }
  },
  "data_layer": {
    "database": "Supabase PostgreSQL",
    "schema_authority": "types/database.ts + supabase/migrations/*.sql",
    "auth": "Supabase Auth; app roles in public.users.role; event membership in event_users",
    "rbac": ["Middleware route guards", "API role checks", "RLS on Postgres"]
  },
  "integrations_in_repo": {
    "supabase": true,
    "openai": "campaign draft generation",
    "sendgrid": "@sendgrid/mail (verify feature wiring per deployment)",
    "aws_s3": "@aws-sdk (voice / upload tooling — see scripts and API usage)"
  },
  "documentation_cross_refs": {
    "architecture_json": "docs/SYSTEM_ARCHITECTURE.json",
    "app_architecture": "docs/APP_ARCHITECTURE.md",
    "archived_architecture_map": "docs/old/System_Architecture_Map.md",
    "archived_schema_locked": "docs/old/DB_SCHEMA_LOCKED.json",
    "archived_schema_tables": "docs/old/SCHEMA_TABLE_REFERENCE.md",
    "archived_index": "docs/old/README.md",
    "platform_summary": "docs/PROJECT_SUMMARY_APP.md",
    "schema_index": "docs/APP_SCHEMA.md",
    "rbac_matrix": "docs/RBAC_MATRIX.json",
    "engineering_standards": "docs/ENGINEERING_STANDARDS.md"
  }
}
```
