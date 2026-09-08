# Lead Intel Admin

Next.js App Router web app for the Lead Intel platform (shared Supabase backend with **Lead Intel Scan** mobile — same Postgres contract; mobile repo is separate).

## Documentation index

Canonical documentation lives under **`docs/`** (see **`docs/old/README.md`** for archived audits, handoffs, and detailed schema/API tables).

| Doc | Purpose |
|-----|---------|
| [`docs/Admin_Project_Summary.md`](./docs/Admin_Project_Summary.md) | Admin manifest (JSON) + stack cross-refs |
| [`docs/PROJECT_SUMMARY_APP.md`](./docs/PROJECT_SUMMARY_APP.md) | Platform/product summary + product capability set |
| [`docs/APP_ARCHITECTURE.md`](./docs/APP_ARCHITECTURE.md) | Architecture: verified behavior, integrations, API pointers |
| [`docs/APP_SCHEMA.md`](./docs/APP_SCHEMA.md) | Schema index: cloud vs planned mobile + capability alignment |
| [`docs/SYSTEM_ARCHITECTURE.json`](./docs/SYSTEM_ARCHITECTURE.json) | Machine-readable architecture |
| [`docs/RBAC_MATRIX.json`](./docs/RBAC_MATRIX.json) | RBAC / route summary |
| [`docs/ENGINEERING_STANDARDS.md`](./docs/ENGINEERING_STANDARDS.md) | Engineering bar |

**Archived (non-canonical):** [`docs/old/`](./docs/old/README.md) — e.g. `System_Architecture_Map.md` (API table), `SCHEMA_TABLE_REFERENCE.md`, `SECURITY_AUDIT.md`, import wizard handoffs, production audit snapshots, `DB_SCHEMA_LOCKED.json`.

## Stack
- Next.js 16.x (App Router)
- TypeScript
- Tailwind
- Supabase (Auth + Postgres)

## Setup
1. Install dependencies:
   - `npm install`
2. Create `.env.local` with:
   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
3. Run SQL migration in Supabase SQL editor:
   - `supabase/migrations/0001_phase1.sql`
4. Ensure authenticated users exist in `public.users` with role:
   - `organizer` for organizer routes
   - `exhibitor` for exhibitor routes
5. Start app:
   - `npm run dev`

## Troubleshooting
- Config is `next.config.mjs` (project standard).

## Phase 1 included
- Multi-tenant schema tables: `companies`, `users`, `licenses`, `leads`
- RLS policies for organizer/exhibitor access control
- Auth flow + protected routes
- Role-based routing for organizer and exhibitor dashboards
- Shared layout shell with persona toggle and responsive structure
