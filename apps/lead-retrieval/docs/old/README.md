# Archived documentation (`docs/old/`)

## Why these files are here

These documents were **moved from `docs/`** during a documentation cleanup so the repository has a **small canonical set** at the docs root. Nothing was deleted; content was **merged** (where still current) into the canonical files, then originals were preserved here for history, audits, handoffs, and detailed tables.

## Canonical truth (do not treat this folder as authoritative)

Use the **docs root** as the live narrative and machine-readable contracts:

- `PROJECT_SUMMARY_APP.md` — product overview, capabilities, what ships in-repo vs mobile
- `APP_ARCHITECTURE.md` — app architecture, surfaces, flows, integrations summary
- `APP_SCHEMA.md` — schema index, capability ↔ storage alignment
- `SYSTEM_ARCHITECTURE.json` — high-level system map, surfaces, backend, external services
- `RBAC_MATRIX.json` — roles, route/API permission summary
- `ENGINEERING_STANDARDS.md` — engineering bar (no project status)
- `Admin_Project_Summary.md` — admin-focused manifest (JSON block + narrative)

**Rule of thumb:** If this archive disagrees with `types/database.ts`, `supabase/migrations/`, or current code, **code wins**.

## Files in this archive

| File | Notes |
|------|--------|
| `ADMIN_SURFACES_AND_READINESS.md` | Admin routes/surfaces; facts merged into `Admin_Project_Summary.md` / `APP_ARCHITECTURE.md` |
| `Auth_Visibility_and_Access_Model.md` | Auth/RBAC narrative; `exhibitor_viewer` / `event_users.permissions` merged into `RBAC_MATRIX.json` |
| `basic-ai-briefing-flow-audit.md` | Historical import/briefing audit |
| `briefing-wizard-rollback-handoff.md` | Handoff / rollback notes |
| `briefings-entry-point-handoff.md` | Handoff |
| `DB_SCHEMA_LOCKED.json` | Archived curated schema + planned mobile SQLite (verify against current `types/database.ts`) |
| `import-briefing-flow-concise-handoff.md` | Import wizard handoff |
| `import-publish-v1-handoff.md` | Publish handoff |
| `import-view-brief-v1-handoff.md` | View/brief handoff |
| `load-testing-cleanup.md` | Load-test instrumentation checklist |
| `LOAD_TEST_CLEANUP.md` | Dev bypass / upload debug checklist |
| `PRODUCTION_FIX_PLAN.md` | Historical production plan |
| `PRODUCTION_READINESS_AUDIT.md` | Point-in-time readiness audit |
| `PRODUCTION_VERIFICATION_APPENDIX.md` | Verification appendix |
| `SCHEMA_TABLE_REFERENCE.md` | Table-by-table column reference (may drift from generated types) |
| `SECURITY_AUDIT.md` | Dated security findings — **verify fixes in code** before relying on severity |
| `STREAMPOINT_INTEGRATION_V1.md` | Streampoint V1 product/integration spec |
| `System_Architecture_Map.md` | Long-form architecture + **API route inventory** |

## Moved file list (18)

`ADMIN_SURFACES_AND_READINESS.md`, `Auth_Visibility_and_Access_Model.md`, `basic-ai-briefing-flow-audit.md`, `briefing-wizard-rollback-handoff.md`, `briefings-entry-point-handoff.md`, `DB_SCHEMA_LOCKED.json`, `import-briefing-flow-concise-handoff.md`, `import-publish-v1-handoff.md`, `import-view-brief-v1-handoff.md`, `load-testing-cleanup.md`, `LOAD_TEST_CLEANUP.md`, `PRODUCTION_FIX_PLAN.md`, `PRODUCTION_READINESS_AUDIT.md`, `PRODUCTION_VERIFICATION_APPENDIX.md`, `SCHEMA_TABLE_REFERENCE.md`, `SECURITY_AUDIT.md`, `STREAMPOINT_INTEGRATION_V1.md`, `System_Architecture_Map.md`
