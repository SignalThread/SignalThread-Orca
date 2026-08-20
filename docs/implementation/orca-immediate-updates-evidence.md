# Orca Immediate Updates — Evidence Matrix

## Prompt 0 baseline

- Repository: `planner-os` / Orca OS, remote `akamyab12/planner-os`; no unrelated project was inspected or changed.
- Branch: `wip/prompt-6-migration-blocked`. Pre-existing unrelated change preserved: `web/lib/matrix2-live-defect-regression.test.ts`.
- Model routing: unavailable; active Codex/GPT-5 host context retained.
- Schema mode: additive allowed. Canonical session data is `MatrixRow` and its session relations; F&B catalog/source-menu records and session catalog assignments are canonical; task/roadmap data is `TimelineItem`; event access is enforced through existing event access helpers.

## Verified current implementation

| Immediate requirement | Evidence | Classification |
| --- | --- | --- |
| Event-scoped Matrix/session operations | Matrix 2 routes, `matrix2.ts`, `matrix2-session.ts`, `MatrixRow` | implemented/partial |
| Session room, AV, F&B, staffing and requirements | Session workspace, canonical relations and routes | implemented/partial |
| Session show flow/public projection | `SessionShowFlowItem`, show-flow API, role export route | partial; needs Prompt 6 QA/UI completion |
| Menu source ingestion/catalog | `EventFnbSourceMenu`, `EventFnbCatalogItem`, parse-job migrations, F&B routes | partial/undiscoverable pending Prompt 3 audit |
| Dietary/allergen structured safety | no canonical verified taxonomy/compatibility service found in current inspected surfaces | missing; Prompt 2–4 |
| Exact-money F&B calculation | cents-based budget/catalog values and tax configuration exist; complete provenance/discount engine not verified | partial; Prompt 2/7 |
| Roadmap hierarchy/progress | `TimelineItem` parent/progress and task services | implemented/partial |
| Event Command Center/AI | canonical read-model services, attention/question context routes | implemented/partial |

## Baseline checks

- `npx prisma validate --schema prisma/schema.prisma`: pass.
- `npx prisma generate --schema prisma/schema.prisma`: pass.
- `npm run typecheck`: pass.
- `npm run lint`: pre-existing baseline failure, 55 errors / 79 warnings. Errors are in unrelated activity, marketing, room-set, timeline, speaker portal, shared column-order, and legacy test/helper files. Prompt 0 does not weaken or suppress them.
- Prompt 1 focused tests: 37 passed and 1 environment-only failure. The database-backed Command Center journey reached the configured Supabase database, but fixture organization creation failed because the configured database lacks a column expected by the generated client. The 37 repository-only F&B picker/autosave and readiness tests passed; this database drift predates Set 1 and is not treated as a product regression.

## Canonical data-flow map

`Event` scopes rooms, Matrix sessions, people, speakers, F&B catalog/source menus, budgets, timeline, documents, and command-center/AI projections. Route handlers use event access helpers and delegate to lib/server services; UI reads those projections. Exports and readiness must remain derived from those records rather than becoming editable duplicate state. Public/vendor projections must exclude internal notes and sensitive dietary/person data by server-side allowlists.

## Consolidated schema direction

Prompts 2–5 require additive event-scoped taxonomy, verification/provenance, requirement disposition/audit, menu lifecycle/item safety, and session-to-menu compatibility records. Existing session, catalog, budget, and event access records must be extended rather than replaced. The dedicated dashboard/F&B parse parity work remains recorded in the prior baseline-recovery commits; legacy `MatrixRowSpeaker` and `MatrixRowStaffAssignment` remain unmanaged.

## Prompt 1 evidence audit

### Representative populated state

`web/scripts/help-screenshot-seed.ts` is the canonical deterministic non-production fixture. It creates an isolated organization and event with rooms and sessions, session requirements, roadmap tasks, deadlines, budget lines, F&B catalog assignments, speakers and documents, directory/attendees, seating, marketing, notifications, and a second portfolio event. The existing test harness additionally creates isolated organizations and supports cleanup through `npm run cleanup:test-fixtures`. This is sufficient to inspect populated manager surfaces without inserting deceptive UI-only data. Restricted behavior is exercised by route/service authorization regression tests and the seeded demo users rather than by weakening production access checks.

### Acceptance-criterion gap matrix

| Requirement | User surface | Canonical implementation and persistence | Authorization/tests | Classification and required action |
| --- | --- | --- | --- | --- |
| Command Center and portfolio briefing | Event Command Center, portfolio dashboard, AI Workspace | command-center and AI read models derive from `Event`, sessions, tasks, approvals, speakers, staffing and F&B | event/organization access helpers; command-center and AI isolation regressions | Implemented/partial. Keep derived; extend evidence links and safety signals only from canonical data. |
| Complete session CRUD/import and empty states | Matrix 2, session drawer/workspace, import review | Matrix routes/services, `MatrixRow`, import intent/result ledger | matrix routing, import, persistence, isolation tests | Implemented and discoverable. Preserve during later integration. |
| Minute-by-minute show flow and projections | session operations workspace; role/public exports | `SessionShowFlowItem`, show-flow service/API, role export allowlists | event/session validation and export regressions | Implemented/partial. Prompt 6 work exists; Set 1 only consumes safe session context. |
| Permanent supplies/signage requirements | session requirement workspace | `SessionRequirementTemplate`, sections/items/selections | event-scoped requirement service/tests | Implemented/partial; extend taxonomy later, do not duplicate. |
| Dietary/accessibility surfacing | F&B catalog and session F&B plan | free-text notes and assignments only | event-scoped F&B routes | Missing structured safety model. Prompts 2, 4 and 5. |
| Internal/public agenda separation | role exports and public projections | server-side projection allowlists; public show-flow visibility | role-export regressions | Implemented/partial. Public output must exclude internal notes and safety/person details. |
| Terminology customization | organization/event settings and session labels | organization terminology fields plus canonical fallbacks | organization access boundary | Implemented/partial. Reuse nullable terminology with fallback. |
| Menu intake and lifecycle | `/events/[eventId]/fnb-catalog` | source-menu routes/service, `EventFnbSourceMenu`, parse jobs/targets | `requireEventRouteAccess`; F&B source-menu tests | Partial/undiscoverable. Prompt 3 adds operational lifecycle, ownership and review states. |
| Structured dietary/allergen claims | F&B catalog | no canonical structured claims | no applicable tests | Missing. Prompt 2 shared taxonomy; Prompt 4 verified claims and safe filtering. |
| Custom/off-menu items | F&B catalog item creation | `EventFnbCatalogItem`, catalog service/API | event access and cross-event validation | Implemented/partial. Mark provenance explicitly and retain custom values safely. |
| Original/negotiated pricing, discounts and fees | catalog, session plan, Budget Grid | string catalog price, assignment cents, tax configuration, budget line links | price/tax/budget sync tests | Partial. Prompt 2 establishes exact-money provenance; later financial prompt completes reconciliation. |
| Hotel/caterer/AV/internal/public exports | session role exports and reports | server projections from canonical session relations | event access and allowlist tests | Partial. Set 1 only adds menu/session safety projection; broader exports remain later-pack work. |
| Approval, speaker and staffing widgets | Command Center/session workspace | canonical approval, event-person/speaker and staffing services | scoped route tests | Implemented/partial. No duplicate widget status. |
| Nested tasks, dependencies, rollups, Not Needed | roadmap/task workspace | `TimelineItem` hierarchy/dependency/progress paths | event access/task regressions | Implemented/partial; shared disposition contract must require audited reason for safety/operational Not Needed. |
| API/service separation and concurrency | all audited routes | route access helpers delegate to `web/lib` services; Prisma remains server-only | route/service regressions and typecheck | Implemented/partial. New mutations must validate version/idempotency and relation scope in services. |

### Canonical architecture and ownership

- Sessions: Matrix/session routes → session services → `MatrixRow` and scoped relations. Imports use persisted intent/result records and do not bypass event ownership.
- Menus/F&B: catalog routes → `web/lib/fnb-catalog.ts` → `EventFnbSourceMenu`, parse jobs/targets, `EventFnbCatalogItem`, session assignments, tax rows and budget links. The service is the mutation boundary.
- Roadmap and approvals: event routes/services → canonical `TimelineItem` and approval records. Dashboard state is derived, not independently editable.
- People: directory/event-person, speaker and staffing services remain authoritative. Legacy matrix speaker/staff tables are intentionally unmanaged.
- AI and dashboards: read models retrieve authorized event records; they may summarize but cannot become authoritative safety or verification records.
- Exports: server-side projections select a recipient profile and explicit fields. Public/vendor projections exclude internal notes, person-level dietary/medical data and unverified safety assertions.

No evidence supports client-side database access. The principal duplication risk is parallel status vocabulary across ingestion, operational menu readiness and verification; Prompt 2 separates those concerns with canonical enums. Cross-event risk is concentrated in relation IDs accepted by mutations, so every new service validates both the parent event and referenced record event inside the same transaction.

### Agent-reviewed schema proposal for Prompt 2 validation

The smallest coherent design extends the existing source-menu and catalog-item models and adds event-scoped claim, verification, requirement and compatibility records. It does not replace sessions, menus, assignments, tasks or budgets.

- Source menus gain an operational lifecycle distinct from parser status, ownership, received/effective/version metadata, verification provenance and optimistic versioning.
- Catalog items gain exact integer-cent published/negotiated prices, pricing unit/minimum, custom-item provenance, operational/internal notes, verification provenance and optimistic versioning. Existing `price` remains readable during staged compatibility.
- Structured item claims store a controlled claim kind and code plus optional custom label. `CONTAINS` and `FREE_OF` are explicit independent claims; absence never implies either. Verification changes are audited and source changes make prior verification stale.
- Session requirements store aggregate event/session-scoped dietary, allergen or accessibility needs with disposition, audited Not Needed reason/actor/time and no attendee identity.
- Session compatibility links requirements to assigned menu items with deterministic blocker/warning/complete/not-needed outcomes and evidence identifiers. These are derived or versioned from canonical facts, never a manually editable dashboard status.
- Exact money uses integer minor units plus ISO currency; discounts remain separate values. Relations cascade only for event-owned dependent evidence, use restrictive/nulling behavior for user provenance, and index event, parent, status and lifecycle query paths.

Migration order is additive enums/tables, nullable columns, indexes/constraints, deterministic compatibility backfill only where facts exist, then application adoption. Recovery is forward-only: leave old columns readable, remove no data, and revert application reads if needed. No attendance/check-in/no-show, marketplace, or speculative integration fields are included.

### Measured snapshot

Across the 13 grouped immediate acceptance areas above: 3 are implemented/discoverable, 8 are partial or implemented-but-undiscoverable, and 2 are missing. Counting full credit only for implemented/discoverable and half credit for partial yields **54% (7/13 equivalent criteria)**. This is an evidence-weighted engineering snapshot, not a visual-completeness estimate.

## Prompt 2 shared foundations

The final design is **agent-reviewed and agent-approved**. It extends the canonical source-menu, catalog-item and Matrix session records; separates parser status, operational lifecycle and fact verification; uses integer minor units for new monetary provenance; keeps Contains and Free Of as explicit independent claims; requires audited reasons for Not Needed; and stores export generation metadata without making readiness editable. All new ownership is event scoped, dependent evidence cascades with its event/item/session, user provenance uses nullable references where represented, and legacy matrix speaker/staff tables remain unmanaged.

Migration `20260806170000_add_fnb_shared_foundations` is additive and contains no destructive statements. It passed a full 65-migration clean initialization in disposable PostgreSQL `orca_prompt2_clean` and an upgrade rehearsal on the production-shaped disposable `orca_rehearsal`; both finished with `Database schema is up to date!`. Forward recovery is to revert application adoption while retaining nullable/defaulted columns and tables; no unsafe down migration is claimed.

Validation: Prisma validate/generate passed, eight focused domain/migration tests passed, typecheck passed, targeted ESLint passed, production build passed, and `git diff --check` passed. The configured Supabase fixture drift and repository-wide pre-existing lint debt recorded above remain outside this prompt; no configured production database was mutated.

## Prompt 3 menu lifecycle and intake

The event F&B catalog is now a real Menu workspace backed by persisted source-menu records rather than local prototype rows. It provides an expected-menu manual path, lifecycle summary, accessible textual states, search and status filtering, venue/context/date metadata, item coding and verification counts, responsive cards, validation/error feedback, and the existing presigned PDF/parser intake. Lifecycle transitions are service validated: received/coded/confirmed require source and progressively stronger item evidence, confirmation requires every item verified plus vendor/hotel evidence, source changes invalidate verification, and optimistic `version` conflicts return a refresh-required response.

Migration `20260806173000_enable_manual_menu_intake` only relaxes source-file nullability so Outstanding records do not require fake storage keys. Both the clean disposable and production-shaped disposable upgrades passed and reported an up-to-date 66-migration chain. Twenty-nine focused lifecycle, source persistence, picker, autosave and budget-link regression tests passed; typecheck, targeted lint and diff check passed. Actual object-storage upload was not exercised because it depends on configured storage credentials; the repository-presigned upload and parser paths are reused unchanged.

## Prompt 4 structured menu safety

Catalog items now expose structured suitability, Contains and explicit Free Of claims; separate published, negotiated and discount cents; custom-item provenance; cross-contact, preparation, service, vendor and internal notes; verification evidence; optimistic versioning; and an immutable safety-revision snapshot before each edit. The authorized safety API validates the item against the route event, requires complete evidence for Verified status, treats imported/proposed claims as unverified unless a human verification mutation supplies evidence, and rejects stale versions.

The shared compatibility engine returns VERIFIED_MATCH, POSSIBLE_MATCH, CONFLICT or INSUFFICIENT_INFORMATION with reason codes and evidence. Missing Contains never produces Free Of; contradictory claims are conflicts; stale/proposed facts cannot become verified matches. The workspace provides keyboard-native structured checkboxes, visible verification states, combined dietary filters for vegetarian, vegan, gluten-free and dairy-free, an explicit opt-in for possible matches, and separated vendor/internal notes. External projections remove internal notes, audit history and unverified claims.

Migration `20260806180000_add_fnb_item_safety_audit` passed clean and production-shaped disposable upgrades; the 67-migration chain is current. Thirty-four focused safety/lifecycle/source/picker/autosave tests passed, typecheck and targeted lint passed, production build passed, and `git diff --check` passed.

## Prompt 5 session integration and Set 1 release audit

Session F&B assignments continue to reference the canonical catalog item and now snapshot its `version` for stale-evidence detection. Aggregate `SessionFnbRequirement` records are created only through an authorized, event/session-validating service; Not Needed remains governed by the shared audited-reason rule. The session F&B plan consumes the reusable compatibility engine and displays verified coverage, possible/unverified coverage, conflicts, insufficient information and stale versions with requirement/item drill-through. It explicitly warns planners to enter aggregate operational needs only and never returns attendee identity or medical detail.

Migration `20260806183000_add_session_fnb_safety_resolution` adds the assignment-version snapshot and the canonical audited modification/resolution bridge. It is additive and passed both disposable database upgrade paths; `prisma migrate status` reports the 68-migration chain current. The highest-fidelity Set 1 integration test exercises Outstanding → Received → Coded, verified/proposed/conflicting claims, combined filtering, session compatibility, stale invalidation, authorization source guards, event isolation, privacy projection and nondestructive migration rules.

Release validation:

- Focused Set 1/session/readiness/budget regression battery: 67/67 passed. The dashboard empty-state regression exposed by the broad suite was fixed; its F&B checks now pass (the one remaining failure in that file is an unrelated Command Center snapshot).
- Full repository suite on disposable PostgreSQL: 2,312 tests; 2,219 passed, 7 skipped, 86 failed. Failures are pre-existing account/dashboard/Run-of-Show source snapshots and database-backed fixture concurrency/legacy behavior outside Set 1; no Set 1 safety/lifecycle/integration test failed.
- Prisma validate/generate, clean initialization, production-shaped upgrade, typecheck, targeted lint, production build and diff check: passed.
- Repository-wide lint remains the Prompt 0 baseline: 55 errors and 79 warnings, all outside Set 1 files. No lint rule was suppressed.
- `npm audit --omit=dev --audit-level=high` reports 20 existing dependency advisories (14 high, 6 moderate), including Next/Prisma transitive packages, AWS XML parsing, `ws`, and `xlsx` with no available fix. Resolving them requires a dependency-upgrade workstream and was not folded into this product prompt.
- Live browser: persisted Menu workspace rendered under the authenticated local app; lifecycle controls, manual intake, search/filter semantics and accessible labels were present. Phone 390px and tablet 768px had no horizontal document overflow. The session F&B plan rendered the no-requirements safety state, aggregate-privacy warning and requirement controls; phone width also had no overflow. Object-storage upload remained unexecuted because live storage credentials were not used.

Set 1 menu lifecycle, structured safety, verification/filtering and session integration criteria are complete. The broader immediate-roadmap snapshot is now **65% (8.5/13 equivalent grouped criteria)**: 5 implemented/discoverable, 7 partial, 1 outside/later scope. This remains an evidence-weighted snapshot rather than a visual estimate.

## Prompts 8–15 continuation — August 2026

### Newly completed work

- **Exact F&B calculation engine:** `calculateFnbOrder` now provides a single integer-minor-unit calculation path for published versus negotiated prices, explicit item/order discounts, deterministic order-discount allocation, taxable and non-taxable lines, taxable service charge, fixed/percentage fees, half-up rounding, overflow/mixed-currency rejection, and an auditable calculation trace. Negotiated-price savings are never collapsed into discounts.
- **Operational handoff exports:** the event export route now uses recipient-specific allowlisted projections for hotel/venue, caterer, AV/production, internal, and public consumers. Every exported column is intentional; non-internal outputs exclude internal notes, financial data, private contacts, and person-level dietary/medical data. Generation records recipient, filters, excluded fields, actor, and data-as-of version in `EventFnbExportRecord`.
- **Terminology boundary:** the existing additive organization terminology columns are now discoverable in Settings. Owner/admin-only API mutations validate display labels (safe text, 60-character limit), while routes, database IDs, permissions, and analytics contracts remain unchanged. The browser component imports only a pure terminology contract; Prisma remains server-side.

### Verified pre-existing work

- Command Center already renders source-derived Session Readiness, Approval Center, Speaker Readiness, Staffing Coverage, and a deterministic Executive Briefing. Its readiness and speaker suites pass, including isolation, unavailable-source, drill-through, and conservative status checks.
- Roadmap already persists nested `TimelineItem` hierarchy, completion/progress behavior, dependency graph validation, cycle prevention, role isolation, and blocked-state derivation. Both high-fidelity dependency and hierarchy journeys passed against the disposable rehearsal database.

### Prompt 15 validation record

- `npx tsx --test lib/fnb-cost-calculation.test.ts lib/fnb-safety-domain.test.ts lib/fnb-menu-safety-regression.test.ts`: **19 passed / 0 failed**.
- `npx tsx --test lib/operational-export.test.ts`: **2 passed / 0 failed**.
- `npx tsx --test lib/orca-terminology.test.ts`: **2 passed / 0 failed**.
- Command Center/readiness/task regression selection: **84 passed / 3 failed** initially. The stale Event Portfolio source marker was repaired and its standalone regression then passed **21/21**. The two remaining failures were database-schema dependent, and passed **2/2** against `orca_release_rehearsal` after a non-destructive local migration status rehearsal.
- `npm run typecheck`: passed after each new slice.
- Targeted ESLint and `git diff --check`: passed for every changed slice.
- `npm run build`: passed.
- Disposable PostgreSQL rehearsal (`orca_release_rehearsal` cloned from local `orca_rehearsal`): `prisma migrate deploy` applied no unreviewed work and `prisma migrate status` reported **Database schema is up to date**.
- Full suite command completed with a partial TAP log containing **1,883 passing and 78 failing subtests**. The configured remote database reports five unapplied additive migrations (`20260806150000` through `20260806183000`); database-backed failures are therefore not release evidence against that remote. The remaining failures are pre-existing source-contract regressions across dashboard/budget/Matrix/platform-admin snapshots and were not masked or weakened.

### External limitation

The configured Supabase database remains five checked-in additive migrations behind the repository. It was not mutated. The matching local rehearsal database validates the migration chain and the timeline persistence journeys; remote DB-backed full-suite validation remains blocked until the normal deployment process applies the existing migration chain.

## Prompt 15 final reconciliation — supersedes the partial record above

The earlier Prompt 15 record was an in-progress snapshot, not the final release result. All repository-controlled failures and dependency advisories were subsequently repaired.

- Full unit/integration/API/component suite: **2,382 tests; 2,375 passed, 0 failed, 7 skipped**. All seven skips are assertions that require three optional absent reference workbooks: `Detailed_Budget.xlsx`, `Program_Matrix_Detailed.xlsx`, and `Detailed_Timeline.xlsx`.
- Required eight-scenario service/database bundle: **53 passed, 0 failed, 0 skipped**.
- Supported browser suite: **16 passed, 0 failed**, plus one intentional dedicated-gate skip; the dedicated production-availability run passed **1/1**.
- TypeScript, Prisma validate/client consistency, production build, root/web schema and migration parity, diff check, client/server boundary tests, permission/isolation/privacy/concurrency/idempotency regressions, and fresh/current migration status all pass.
- Full ESLint: **0 errors, 75 warnings**. The 54 blocking errors present at the start of Prompt 15 were fixed without disabling the repository lint configuration.
- Dependency audit: **0 vulnerabilities** for the full and production dependency trees after supported Next.js, Prisma, AWS SDK, and SheetJS upgrades.
- Clean migration rehearsal: **79/79**. Supported representative upgrade: **78→79**. The configured remote database was not mutated.

The authoritative final evidence is [orca-release-audit.md](./orca-release-audit.md) and the Prompt 0–15 completion ledger. There are no remaining repository-controlled blockers and no feature deferrals.
