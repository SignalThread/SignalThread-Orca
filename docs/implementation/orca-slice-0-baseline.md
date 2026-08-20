# OrcaOS Immediate Implementation — Slice 0A Baseline

**Audit date:** 2026-07-28
**Repository:** `/Users/sarahmeister/Developer/planner-os`
**Scope:** repository baseline only. No product, Prisma, migration, route, auth, RBAC, dependency, or configuration changes were made.

## Executive baseline

Planner OS is a Next.js 16 App Router application with Prisma/PostgreSQL, event-scoped planning modules, and a shared shell. The active Run of Show surface is Matrix 2; older Matrix routes remain for compatibility. Budget, Docs, Speakers, F&B Catalog, Timeline/Roadmap, Directory, Attendees, seating, tasks, marketing, and event command-center surfaces are present in source.

AI Workspace is not implemented in source. The latest commit adds AI Workspace product documentation, and `docs/product/ai-workspace-technical-discovery.md` proposes a future deterministic attention API and read-only workspace. There is no AI Workspace page or route under `web/app`, no AI Workspace service, and no AI Workspace-specific persisted model. Existing Copilot routes and services are a separate proposal/action system and must not be described as an AI Workspace implementation.

The repository has a usable production build and a substantial test suite, but the checked-in/current generated `.next` type validators reference missing AI Workspace source paths. That makes `npm --prefix web run typecheck` fail before application-source type errors are reported. `npm --prefix web run lint` also fails on existing lint errors. A focused, read-only unit selection passed when run from `web/`.

## 1. Branch and working-tree state

- Branch: `feature-updates-initial-demos`.
- Tracking: `origin/feature-updates-initial-demos`.
- HEAD: `9c907143 Add AI Workspace product documentation`.
- Recent comparison: `origin/main` is `74756265 Polish event workspace and import workflows`, one commit behind this branch.
- Working tree at audit start: clean; no modified or untracked files.
- No commit was created for this baseline.

## 2. Documentation and source-of-truth observations

Inspected engineering and architecture guidance:

- `ENGINEERING_STANDARDS.md` — server-side enforcement, canonical services, deterministic tests, event/org scoping, production-safe migrations, thin routes, and product-grade responsive UI are non-negotiable.
- `docs/PROJECT_CONTEXT.md` — current architecture, tenancy/access, modules, canonical models, known route-guard gaps, and schema guardrail.
- `docs/SYSTEM_ARCHITECTURE.json` — source-audit architecture summary, service boundaries, API families, access model, and roadmap-not-current-state warnings.
- `docs/SCHEMA_GUARDRAILS.md` and `docs/SCHEMA_GUARDRAILS.json` — current schema-control equivalent.
- `docs/RBAC_MATRIX.json` — current route-level auth/RBAC audit; it is older than some hardening work and must be checked against route source before relying on a row.
- `docs/local-dev.md` and `web/README.md` — one Next.js app serves UI and API; local development runs from `web/` with npm.

Requested locked-schema files are absent:

- `docs/DB_SCHEMA_LOCKED.md` — not present.
- `docs/DB_SCHEMA_LOCKED.*` — no matching file present.

The current equivalent is the controlled-schema policy in `docs/PROJECT_CONTEXT.md` and `docs/SCHEMA_GUARDRAILS.md`. This absence is a documentation debt, not permission to create or change schema files in Slice 0A.

No repository document named an “Immediate Implementation Plan,” “Immediate Codex Prompt Pack,” or “planner feedback roadmap” was found under `docs/` during this audit. Existing product/roadmap evidence is in `docs/product/ai-workspace-technical-discovery.md`, `docs/product/ai-workspace-data-domain-inventory.md`, `docs/help/*`, `docs/testing/*`, and the historical `docs/loop/Old/*` plans. Those documents are not treated as current implementation unless confirmed by source.

## 3. Architecture summary

### Runtime and boundaries

- Frontend: Next.js App Router, React 19, Tailwind CSS 4.
- Backend: Next.js Node route handlers under `web/app/api/**/route.ts`.
- ORM/database: Prisma/PostgreSQL; Prisma configuration is in `prisma.config.ts` and `web/prisma.config.ts`.
- Schema copies: `prisma/schema.prisma` and `web/prisma/schema.prisma`; they are **not byte-identical** (`cmp` exit 1), so schema parity is a known risk.
- Core server code: `web/lib/*` and `web/src/server/services/*`.
- Binary storage: Cloudflare R2 through S3-compatible APIs for documents and speaker files.
- Global shell: Dashboard, Events, Reports, Settings. Event shell contains planning/operations modules.
- Account hierarchy: Organization → optional Client → Event.
- Primary event boundary: `eventId`; organization boundary: `orgId`.

### Access and authorization

The main helpers are `web/lib/request-user.ts` (`resolveRequestUser`, provisioning/context resolution) and `web/lib/event-access.ts` (`assertEventAccessForUser`). `SUPER_ADMIN` has platform-wide context switching; `OWNER`/`ADMIN` operate in their organization; normal `MEMBER`/`VIEWER` access is event-membership dependent; `EVENT_VIEWER` is read-only where the guarded path asks for write access.

Coverage is partial. The project context specifically identifies historical Matrix 2 session/requirements/F&B assignment paths as not uniformly guarded; route source must be inspected before any Immediate change. Public speaker intake/portal routes are token-scoped and must not use planner session auth as their authorization source. Marketing unsubscribe is another public token boundary. No hosted RLS/policy source was found in the repository.

## 4. Routes relevant to the Immediate roadmap

### Shell and event workspace

- Global: `/dashboard`, `/dashboard/action-center`, `/dashboard/financials`, `/events`, `/events/new`, `/events/:eventId`, `/reports`, `/settings`.
- Event modules: `/events/:eventId/matrix-2`, `/events/:eventId/matrix`, `/events/:eventId/matrix/sessions/:sessionId`, `/events/:eventId/matrix/sessions/:sessionId/room-set`, `/events/:eventId/timeline`, `/events/:eventId/budget`, `/events/:eventId/docs`, `/events/:eventId/directory`, `/events/:eventId/attendees`, `/events/:eventId/speakers`, `/events/:eventId/fnb-catalog`, `/events/:eventId/seating`, `/events/:eventId/staffing`, `/events/:eventId/activity`, `/events/:eventId/settings`, and `/events/:eventId/reports`.
- No `/events/:eventId/ai-workspace` route exists in source.

### API families

- Events/import: `/api/events`, `/api/events/:eventId`, `/api/events/import/create`.
- Command center: `/api/events/:eventId/command-center`, `/command-center/layout`.
- Run of Show: `/matrix-2`, `/matrix-2/people`, `/matrix-2/sessions/:sessionId`, session speaker/requirement/F&B-plan/catalog-assignment/attendee routes; compatibility `/matrix-rows`, duplicate, import, and CSV export routes.
- Roadmap/tasks: `/timeline-items`, `/timeline-dashboard`, `/timeline-dependencies`, timeline bulk/import routes; `/tasks` and task assignment/block/comment/link/watch/complete/reopen routes.
- Budget: snapshot/dashboard/blocks, line-item CRUD, groups/category targets, import, sessions, submissions and approval/rejection/revision, files, reporting, and CSV exports.
- F&B: catalog CRUD, source-menu parse/presign/feedback, and Matrix session F&B plan/catalog assignment routes.
- Directory/people: directory snapshot, people/roles/merge, imports and import rows, email; attendees/imports/enrollments; speakers/import/export and the speaker detail/portal/file/document/message/note/readiness/conflict families.
- Copilot: `/api/copilot/chat` and `/api/copilot/execute`; these are not AI Workspace routes.
- Public boundaries: `/api/public/speaker-intake/:token/*`, `/api/public/speaker-portal/:token/*`, `/api/public/marketing/unsubscribe/:token`.

## 5. Canonical models and persisted data

The inspected root schema declares 90 models and 70 enums across the following relevant domains:

- Access: `Organization`, `Client`, `User`, `Membership`, `Event`, `EventMember`.
- Sessions/Run of Show: `Room`, `MatrixRow`, `SessionRequirementTemplate`, `SessionRequirementSection`, `SessionRequirementItem`, `SessionRequirementSelection`, `SessionAVRequirement`, `SessionFoodService`, `SessionSpeakerAssignment`, `SessionFnbCatalogAssignment`, `SessionFnbCatalogAssignmentTax`, `EventPerson`, `SessionStaffAssignment`.
- Roadmap/tasks: `TimelineItem`, `TimelineDependency`, `Deadline`, `Task`, `TaskAssignment`, `TaskLink`, `TaskComment`, `TaskActivity`, `TaskWatcher`.
- Budget: `Budget`, `BudgetVersion`, `BudgetLineItem`, `BudgetGroup`, `BudgetCategoryTarget`, `BudgetSubmission`, `BudgetSubmissionRecipient`, `BudgetSubmissionLineItem`, `BudgetApproval`, `BudgetActivity`; legacy `BudgetItem` also remains.
- F&B: `EventFnbCatalogItem`, `EventFnbSourceMenu`, `FnbParserFeedback`.
- People: `Speaker` and its intake/submission/readiness/file/document/message/note/email/onsite models; `EventDirectoryPerson`, directory role/source/import/link/external-identity models; attendee and registration models.
- Docs/activity/AI-adjacent: `Document`, versions/approvals/categories/tags/links, `EventActivity`, `CopilotAuditLog`, notifications, integration metrics.

No `AIRun`, finding, evidence/source, or action-proposal model was found in `prisma/schema.prisma`. AI Workspace persistence described in the product discovery is future work and would require Sarah’s schema review before implementation.

The schema contains additive timeline taxonomy fields/enums with a migration described as pending apply in project context. It also contains both root and web schema copies plus 56 migration directories. Any future schema work must first reconcile source/migration authority and inspect live parity; no such change is proposed here.

## 6. Existing implementation by Immediate-relevant area

| Area | Current source-backed implementation | Incomplete/missing behavior or risk | Reusable pattern |
|---|---|---|---|
| Dashboard/command center | Dashboard pages and `event-command-center.ts`, `command-center-dashboard.ts`; event health, blockers, dates, readiness, F&B/staffing signals, layout persistence, account/action surfaces | Widget semantics are distributed; access coverage and data freshness must be checked per route; no AI Workspace retrieval boundary exists | Server-derived summaries, event-scoped selectors, persisted command-center layout |
| Event import | Event builder components, `event-import-builder.ts`, `event-import-create` route, agenda/templates/types, matrix and budget import helpers | Preview/mapping/import contracts are split by module; approval/review semantics are not a universal persisted import state | Parse → normalize → map → validate → create; row caps and deterministic mapping tests |
| Session/Run of Show | Matrix 2 Board/List, quick launcher/drawer, session workspace; `matrix2.ts`, `matrix2-session.ts`, requirement/catalog helpers | Legacy Matrix remains; not every historical session mutation route has uniform auth/access guards; import and assignment semantics span multiple paths | MatrixRow as session authority; thin route + service validation; targeted reload/persistence tests |
| Roadmap/tasks | Timeline Dashboard/Gantt/Board/List, `timeline.ts`, `timeline-dashboard.ts`; separate transactional Task system and task APIs | Timeline Item and Task are intentionally separate; do not merge them without product decision; historical audit coverage is partial | Event-scoped canonical service, explicit status enums, dependency cycle tests |
| Budget | Budget grid/dashboard/reporting/import/export, line items, groups, sessions, submissions, approvals/revise/reject, file flows; `budget.ts` and budget services | Legacy `BudgetItem` coexists with `BudgetLineItem`; approval and edit authorization varies by route; approved-baseline/materiality policy is not universal | Canonical budget service, immutable/versioned submission records, activity/audit writes, numeric money helpers |
| F&B Planner | Catalog/source menus/parser feedback, session F&B plan, catalog assignment, tax configuration and budget sync; `fnb-catalog.ts`, `fnb-cost-calculation.ts`, `fnb-tax-planner` tests | Menu parser confidence/verification and dietary/accessibility semantics are not a single universal requirement model; inspect route guards | Tax calculations are deterministic and tested; catalog assignment is canonical and budget-linked |
| Directory/attendees | Event directory CRUD, roles, merge, import batches/rows, module links, attendees/imports/session enrollment | Aggregation across Speaker/EventPerson/attendee/directory records can duplicate people; merge and cross-event isolation require careful source-of-truth rules | Import batch/row provenance, event-scoped people, explicit merge service |
| Speakers/public portal | Planner speaker directory, readiness/conflicts, files/docs/comms, intake and token portal; dedicated public routes | Public/internal field boundaries are sensitive; token routes must remain separate from planner auth; speaker import/export needs field review | Token hash/revocation, R2 presign/finalize, event-scoped service guards, reload E2E coverage |
| Contracts/catering | No first-class `Contract` model or `/contracts` route found. Document Hub can store/link documents; budget/F&B contain related operational data | “Contracts” and “catering” must not be presented as shipped modules. Any contract lifecycle or catering-specific persistence needs source/product/schema decision | Reuse Docs Hub and budget/F&B only after confirming intended workflow |
| AI Workspace | Product discovery and data-domain inventory define deterministic attention/evidence direction; Copilot has chat/execute and audit/proposal primitives | No page, API, service, persisted AI run/finding/evidence model, retrieval policy, or source citation UI exists | Start with read-only event-scoped deterministic retrieval; never send private notes, tokens, keys, email/document bodies, or provider payloads |

## 7. Tests and coverage baseline

The repository contains 252 `*.test.ts` files and 14 Playwright `*.spec.ts` files under `web`. Relevant coverage includes:

- Dashboard/command center: `dashboard-command-center-regression.test.ts`, `event-command-center-*.test.ts`, account command-center tests.
- Imports: `event-import-*`, `matrix-import.test.ts`, `budget-import-*`, `event-directory-import.test.ts`, `attendee-import.test.ts`, `import-row-cap.test.ts`.
- Matrix/session: `matrix2-*`, `session-*`, `matrix-rows-*`, `planner-core-journeys.test.ts`, plus P0/quick-drawer browser journeys.
- Roadmap/tasks: `timeline-*`, `timeline-dependency-cycle.test.ts`, `tasks-*`, roadmap bulk and timeline browser journeys.
- Budget: `budget-*`, `planner-budget-browser-journey.spec.ts`.
- F&B: `fnb-*`, `matrix2-fnb-picker.test.ts`, F&B portions of quick-drawer browser coverage.
- Directory/speakers: `event-directory-*`, `speaker-*`, `planner-speakers-browser-journey.spec.ts`, speaker portal/security tests.
- Auth/isolation: `event-access-regression.test.ts`, `wave2-route-auth-hardening-regression.test.ts`, `matrix-rows-auth-regression.test.ts`, budget/speakers access tests, and access browser journey.

The testing matrix documents important gaps: full role matrix coverage, AV quick-drawer browser coverage, broad F&B/Room Set/Seating/Docs/Budget/Speakers workflows, Timeline dependency UI coverage, real Supabase/OTP login, and broader public portal workflows.

## 8. Validation baseline

Package manager is npm, evidenced by `package-lock.json`, `web/package-lock.json`, npm scripts, and local-dev documentation.

| Check | Exact command | Result |
|---|---|---|
| Focused read-only unit tests | `cd web && npx tsx --test lib/budget-money.test.ts lib/fnb-cost-calculation.test.ts lib/fnb-tax-planner-regression.test.ts lib/matrix2-fnb-picker.test.ts lib/timeline-taxonomy.test.ts lib/import-row-cap.test.ts` | PASS — 46/46 |
| Full unit/integration-style suite command | `npm --prefix web run test:summary` | Not run: repository test harness includes DB-backed fixture setup/cleanup and would violate this Slice 0A read-only constraint |
| Typecheck | `npm --prefix web run typecheck` | FAIL (exit 2): generated `.next` validators reference missing `app/(shell)/events/[eventId]/ai-workspace/page`, `api/.../ai-workspace/attention/route`, and `api/.../question-context/route` source paths |
| Lint | `npm --prefix web run lint` | FAIL (exit 1): 68 errors and 83 warnings, including existing React effect/ref/compiler rules, `no-explicit-any`, `no-assign-module-variable`, and unused symbols |
| Production build | `npm --prefix web run build` | PASS (exit 0); Next compiled, typechecked for build, generated 108 static pages, and emitted route manifest |
| Prisma validation (root) | `npx prisma validate --config prisma.config.ts --schema ./prisma/schema.prisma` | BLOCKED (exit 1): config requires `DATABASE_URL` |
| Prisma validation (web invocation) | `npm --prefix web exec prisma validate --config prisma.config.ts --schema ./prisma/schema.prisma` | BLOCKED (exit 1): same missing `DATABASE_URL`; npm also warned the forwarded flags are parsed as arguments |
| Diff whitespace | `git diff --check` | PASS (exit 0) at audit time |

The typecheck and lint failures predate this documentation work: the working tree was clean before validation, and no application file was edited. The generated `.next` references are suspicious stale/abandoned build artifacts because matching source files do not exist under `web/app`.

## 9. Technical debt affecting next slices

1. Missing `DB_SCHEMA_LOCKED.md` naming expected by the Slice 0 instructions; current guardrails exist under different names.
2. Root and web Prisma schema copies are not byte-identical; live DB parity was not verifiable without `DATABASE_URL`.
3. Route-level event authorization is partial, especially in historical Matrix 2 session/requirements/F&B assignment paths and other legacy routes.
4. `BudgetItem` and `BudgetLineItem` coexist; mixing them would create query/report drift.
5. Timeline taxonomy migration is documented as pending apply; generated client/live DB status needs confirmation before relying on those fields.
6. Event activity/audit coverage is partial across Roadmap, Budget, Run of Show, Directory, and imports.
7. Import workflows are module-specific rather than a single universal approval/mapping state machine.
8. Directory, Speaker, EventPerson, and attendee records can represent overlapping people; aggregation/merge semantics must remain event-scoped and explicit.
9. Public speaker/marketing token routes expose different data boundaries from internal planner routes; exports and AI retrieval must whitelist fields.
10. `.next` generated validators currently reference absent AI Workspace source and should be treated as generated-state drift, not as implementation evidence.

## 10. Reusable patterns to preserve

- Server-side authorization using `resolveRequestUser` plus `assertEventAccessForUser`; UI visibility is not a security boundary.
- Thin route handlers: authenticate, authorize, validate, call a canonical service, return explicit errors.
- Event/org-scoped Prisma queries with explicit cross-event checks.
- Deterministic normalized import pipeline and row-cap validation.
- MatrixRow as canonical session data; compatibility routes remain until an intentional retirement decision.
- Versioned/approval-aware Budget and Document workflows with activity records.
- R2 presign/finalize for binary assets; local document upload is intentionally disabled.
- Deterministic F&B money/tax calculations and tests; do not duplicate tax math in UI.
- Token-hash/revocation patterns for public speaker flows.
- Responsive behavior and reload/persisted-state assertions in browser journeys.
- Schema guardrail: proposal, migration/backfill/rollback plan, tests, and generated-client update before any database change.

## 11. Related files and suspicious duplicates

Files containing directly related work include:

- `docs/product/ai-workspace-technical-discovery.md`
- `docs/product/ai-workspace-data-domain-inventory.md`
- `web/lib/copilot/*`
- `web/app/api/copilot/chat/route.ts`
- `web/app/api/copilot/execute/route.ts`
- `web/src/server/services/event-command-center.ts`
- `web/src/server/services/command-center-dashboard.ts`
- `web/src/server/services/budget.ts`
- `web/src/server/services/timeline.ts`
- `web/src/server/services/timeline-dashboard.ts`
- `web/src/server/services/tasks.ts`
- `web/src/server/services/event-import-builder.ts`
- `web/src/server/services/event-directory.ts`
- `web/lib/fnb-catalog.ts`
- `web/lib/fnb-cost-calculation.ts`
- `web/lib/matrix2.ts`
- `web/lib/matrix2-session.ts`
- `web/lib/event-access.ts`
- `prisma/schema.prisma` and `web/prisma/schema.prisma`

Suspicious or compatibility duplicates:

- Two non-identical Prisma schemas and two migration/config locations.
- Legacy Matrix routes alongside Matrix 2.
- `BudgetItem` alongside `BudgetLineItem`.
- `Task` alongside `TimelineItem`; documentation says these are separate systems.
- Stale `.next` validators referencing absent AI Workspace routes/pages.
- Historical `docs/loop/Old/*` plans that are not current implementation evidence.

## 12. Exact files inspected

Top-level/docs/config:

`ENGINEERING_STANDARDS.md`, `package.json`, `package-lock.json`, `docs/PROJECT_CONTEXT.md`, `docs/SYSTEM_ARCHITECTURE.json`, `docs/RBAC_MATRIX.json`, `docs/SCHEMA_GUARDRAILS.md`, `docs/SCHEMA_GUARDRAILS.json`, `docs/local-dev.md`, `web/README.md`, `web/package.json`, `web/package-lock.json`, `web/prisma.config.ts`, `prisma.config.ts`, `web/next.config.ts`, `web/eslint.config.mjs`, `web/tsconfig.json`, `web/playwright.config.ts`.

Schema:

`prisma/schema.prisma`, `web/prisma/schema.prisma`, `prisma/migrations/` directory listing, `prisma/migrations/migration_lock.toml`.

Access/services:

`web/lib/event-access.ts`, `web/lib/request-user.ts`, `web/lib/matrix2.ts`, `web/lib/matrix2-session.ts`, `web/lib/session-requirements.ts`, `web/lib/fnb-catalog.ts`, `web/lib/fnb-cost-calculation.ts`, `web/src/server/services/event-command-center.ts`, `web/src/server/services/command-center-dashboard.ts`, `web/src/server/services/budget.ts`, `web/src/server/services/documents.ts`, `web/src/server/services/speakers.ts`, `web/src/server/services/timeline.ts`, `web/src/server/services/timeline-dashboard.ts`, `web/src/server/services/tasks.ts`, `web/src/server/services/event-import-builder.ts`, `web/src/server/services/event-directory.ts`, `web/lib/copilot/`, and `web/src/server/services/event-activity.ts`.

Route/component/test inventories:

`web/app/` route inventory from `find web/app -type f \( -name page.tsx -o -name route.ts \)`, relevant event shell and module component directories, `web/e2e/`, and all relevant `web/lib/*test.ts` files listed in the test inventory above.

## 13. Database questions only — no changes proposed

1. Which Prisma schema copy and migration directory is authoritative (`prisma/` versus `web/prisma/`), and what is the approved reconciliation process?
2. Is the timeline taxonomy migration applied in each environment, and does generated Prisma client state match the live database?
3. Should AI Workspace remain read-only/deterministic first, and if persistence is later approved, what retention, evidence, privacy, and event-scope policy should govern new run/finding/source/proposal models?
4. Are `BudgetItem` and `BudgetLineItem` both intentionally supported, or is a reviewed retirement/migration plan required?
5. Is a universal import approval/mapping record required, or should existing event-import, budget-import, matrix-import, directory-import, and speaker-import records remain separate?
6. What are the canonical records and merge rules for directory, attendee, speaker, and EventPerson aggregation?

These are questions for review only. Slice 0A makes no schema or migration change.

## 14. Recommended next prompt

“Using `docs/implementation/orca-slice-0-baseline.md`, select one smallest Slice 1 vertical slice that uses existing models and canonical services. Before editing, verify route-level event authorization and persisted data ownership for that slice; do not add schema fields or migrations without a written Sarah review question and migration proposal.”
