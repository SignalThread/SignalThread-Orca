# OrcaOS Immediate Dependency Map

**Audit date:** 2026-07-28
**Scope:** Slice 0 documentation only. No application, API, authentication, RBAC, Prisma, migration, seed, dependency, or configuration changes were made.

## Source-integrity warning

The repository does not contain a file named “OrcaOS Immediate Implementation Plan,” “Immediate Codex Prompt Pack,” or “planner feedback roadmap,” and no 49-item Immediate recommendation list was found in the current tree or reachable branch history. `docs/implementation/orca-slice-0-baseline.md` records that absence. The only current Orca-specific planning source found is:

- `docs/product/ai-workspace-technical-discovery.md`
- `docs/product/ai-workspace-data-domain-inventory.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/SYSTEM_ARCHITECTURE.json`
- `docs/SCHEMA_GUARDRAILS.md`
- relevant help/testing/loop documents

Accordingly, the 49 rows below are a **provisional evidence map**, reconstructed from the user-specified Immediate focus areas and repository-backed product gaps. They are not presented as the missing plan’s authoritative wording. Before Slice 1, Sarah should provide or approve the canonical 49-item source list and map its IDs/titles onto these rows. “Database classification” uses the requested vocabulary:

1. **No database change required**
2. **Existing model can safely support it**
3. **Additive schema change may be required**
4. **Existing data or migration risk requires Sarah’s review**

## Current dependency rules

- Every event-scoped read/write must resolve the request user and enforce `assertEventAccessForUser(eventId, user, "read" | "write")` at the server boundary. Existing route coverage is partial; “current service exists” does not mean “authorization is complete.”
- `MatrixRow` is the current canonical session record for Matrix 2. `TimelineItem` and `Task` are separate persisted systems. `BudgetLineItem` is the active budget line model, but legacy `BudgetItem` remains.
- Public speaker intake/portal and marketing unsubscribe are token-scoped surfaces. Planner-only notes, email bodies, document contents, tokens, keys, and provider payloads must not cross those boundaries or enter AI evidence by default.
- The event is the primary isolation boundary. Organization and optional Client are additional scopes. Cross-event joins, imports, directory merges, exports, and cached retrieval must carry `eventId`/`orgId` explicitly.
- A recommendation that sounds like a field/table need is not approval for a schema change. The smallest vertical slice should first use existing records or return a documented insufficiency.

## Provisional 49-recommendation register

The compact records use this format: **current evidence; status; tests; DB class; smallest vertical slice; order/dependencies**. UI, authorization, event-isolation, and public/internal boundary implications are called out per row where material. Common UI impact is “responsive event-shell surface with loading, empty, error, and mobile/tablet states”; rows note exceptions.

### Slice 1 — Import foundation, mapping, approval, and provenance

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R01 | Establish one import intake contract | `web/lib/import/{types,workbook,csv,normalize}.ts`, event builder; module-specific parsers already exist, no universal contract | `import/import-foundation.test.ts`, `event-import-types.test.ts`; parse one workbook into normalized sheets without persistence | **4** — multiple import domains and migration/provenance semantics need review; first in S1 |
| R02 | Show workbook/sheet preview before mapping | `event-import-preview.tsx`, `new-event-builder.tsx`; preview exists for event creation | `event-import-builder-ui-regression.test.ts`; one sheet preview with row cap, empty/error/mobile states | **1**; depends on R01; UI-heavy, no event write until approval |
| R03 | Add deterministic column mapping | `event-import-builder.ts`, `event-import-mapping` helpers, `matrix-import-mapping.ts`, `budget-import-mapping.ts`; mapping is split by module | `event-import-builder.test.ts`, `matrix-import.test.ts`, `budget-import-mapping.test.ts`; map one supported session sheet | **1** if existing mapping contracts are reused; depends R01–R02 |
| R04 | Surface row-level validation and mapping errors | `event-import-preview.tsx`, import summary/limits; validation exists in separate paths | `event-import-types.test.ts`, `import-row-cap.test.ts`; one invalid required session row stays unpersisted | **1**; no schema change; server must revalidate, not trust UI |
| R05 | Require explicit import approval before writes | Event create route and import routes exist, but no universal approval state across imports | New service/route test around an existing event import path; preview → approve → create one session | **3** — an approval record/status may be needed; Sarah must choose universal versus module-specific provenance; depends R01–R04 |
| R06 | Preserve import provenance and idempotent retry | `EventDirectoryImportBatch/Row`, event import helpers, budget/matrix imports; provenance differs by domain | `event-import-create-regression.test.ts`, directory import tests; retry same approved input without duplicate session | **4** — existing batches and duplicates require review; depends R05 |
| R07 | Add import result/export summary | Import summaries and CSV routes exist, but no common result contract | `event-import-templates.test.ts`, budget/matrix import tests; return created/skipped/error counts for one import | **1** for response-only summary; export must remain internal/event-scoped; depends R04–R06 |

### Slice 2 — Session and Run of Show persistence

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R08 | Make session create/edit persistence explicit | Matrix 2 UI, `matrix2-session.ts`, `/matrix-2/sessions/:sessionId`, legacy matrix routes; works for core fields | `matrix2-add-session-regression.test.ts`, `matrix2-session-type-persistence.test.ts`; edit title/time/room and reload | **2** (`MatrixRow`, `Room`); S2 after approved import contract |
| R09 | Persist session status and readiness fields | Matrix status cards/readiness helpers and `MatrixRow`; status display and partial edits exist | `session-status.test.ts`, `session-readiness.test.ts`; status change survives reload | **2**; enforce write access on every mutation path; depends R08 |
| R10 | Preserve Run of Show board/list parity | `matrix2.ts`, Matrix2 Board/List components, parity tests; implemented | `matrix2-snapshot-parity.test.ts`, operational-list/board tests; one edit reflected in both views | **1**; event snapshot must not leak another event; depends R08 |
| R11 | Persist session assignments for speakers/staff/AV/F&B | Session assignment models/routes exist; guard coverage is uneven for some requirement/F&B paths | `matrix2-quick-drawer-resources-browser-journey.spec.ts`, requirement persistence, speaker access tests; assign one item and reload | **2** using existing models; route-level authorization review required; depends R08–R10 |
| R12 | Support session import to canonical MatrixRow | `/matrix-rows/import`, `matrix-import.ts`, event builder; exists but import semantics are separate | `matrix-import.test.ts`, import-create regression; import one row and reread MatrixRow | **4** due duplicate/legacy Matrix semantics; depends S1 and R08 |
| R13 | Keep session workspace and Room Set/Seating linked | Session page and `/room-set?mode=layout|seating`; session-scoped seating exists | `run-of-show-room-set-linkage`, seating chair-scope tests/browser journey; open one session’s layout and assign one chair | **2** (`SeatingPlan` and existing links); verify event and matrixRow scope; depends R08 |

### Slice 3 — Roadmap and task persistence

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R14 | Keep Roadmap as TimelineItem, not generic Task | Timeline UI/services and docs explicitly separate them; both are implemented | `timeline-taxonomy.test.ts`, hierarchy/view tests; create one TimelineItem and verify no Task row | **2**; product decision is to preserve separation; first in S3 |
| R15 | Persist roadmap item create/edit/delete | `/timeline-items`, `timeline.ts`, Timeline views; implemented | `timeline-create-edit-regression.test.ts`, inline edit tests; update one status/date and reload | **2**; guard event scope; depends R14 |
| R16 | Persist roadmap hierarchy/dependencies | `/timeline-dependencies`, dependency cycle service/tests; implemented | `timeline-dependency-cycle.test.ts`, hierarchy tests; add one non-cyclic dependency | **2**; no new model; reject cross-event IDs; depends R15 |
| R17 | Persist roadmap import and bulk operations | timeline import/bulk routes and mapping helpers exist | `timeline-import.test.ts`, `roadmap-bulk-regression.test.ts`; approve one bulk status update with bounded rows | **2** unless common import approval from R05 is selected; depends S1/R15 |
| R18 | Persist manual task lifecycle, assignment, comments, links, watchers | `tasks.ts`, `/tasks/*`, Task models; transactional task workflow exists | `tasks-service-regression.test.ts`, tasks API/UI tests; create, assign, comment, complete one task | **2** (`Task*` models); event/org and object-link validation required; depends R14 only for clear product copy |
| R19 | Define task generation/idempotency boundaries | `Task.source`, `TaskLink`, tasking audit docs; generated tasks are not universal | `task` service tests; prove one manual task is not auto-generated by dashboard/AI | **3** — new generation keys/semantics may be needed; Sarah review before automation; depends R18 and S7/S8 |

### Slice 4 — Budget approval/editing and session-linked costs

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R20 | Keep BudgetLineItem as active line authority | `budget.ts`, budget grid, `BudgetLineItem`; legacy `BudgetItem` remains | `budget-snapshot-lean-payload.test.ts`, budget domain tests; read one line through canonical service | **4** due duplicate models; Sarah must approve authority before broadening budget work |
| R21 | Persist budget line editing with server validation | line-item routes/service and money helpers exist | `budget-money.test.ts`, line-item/grid regression; edit forecast/actual and reload | **2**; enforce write guard and event-scoped line lookup; depends R20 |
| R22 | Preserve budget submit/approve/reject/revise workflow | submission/approval routes and models exist | `budget-submission-create.test.ts`, approval workflow/browser tests; submit then approve one budget | **2**; actor must come from authorized request, not arbitrary body; depends R20 |
| R23 | Make approval/edit conflict semantics explicit | version/submission/line approval records exist, but policies differ | budget approval regression tests; reject edit after submission or revise through canonical path | **3** — baseline/locking semantics may require additive fields; Sarah review; depends R22 |
| R24 | Keep session-linked cost assignments canonical | budget sessions route, requirement budget links, F&B budget sync exist | `budget-ops-link-fnb-sync-regression.test.ts`, budget sessions tests; link one session cost and reread | **2** with existing links; cross-event link checks required; depends R08/R20 |
| R25 | Show budget dashboard/reporting from persisted aggregates | budget dashboard/reporting routes and dashboard components exist | budget dashboard/blocks/reporting tests; one forecast/actual total matches line items | **1/2**; preserve event scope and export boundaries; depends R21/R24 |

### Slice 5 — F&B pricing, tax, dietary/accessibility, menu catalog verification

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R26 | Preserve deterministic F&B price calculation | `fnb-cost-calculation.ts`, F&B Planner components; tax/total logic is implemented | `fnb-cost-calculation.test.ts`; calculate one assignment with quantity and subtotal | **2**; no duplicate client math; first in S5 |
| R27 | Persist F&B tax configuration and assignment taxes | existing tax models/routes and migration; tests explicitly cover normalized structure | `fnb-tax-planner-regression.test.ts`; save one rate and reload total | **2** for current behavior; migration parity still needs verification; depends R26 |
| R28 | Keep F&B catalog/source menus event-scoped | catalog/source-menu routes, `EventFnbCatalogItem`, `EventFnbSourceMenu`; implemented | F&B source-menu/parser tests; create one catalog item and ensure another event cannot read it | **2**; every route must enforce event access; depends S2/R26 |
| R29 | Add menu-item verification/review state | parser feedback exists; no universal verified/approved item workflow found | parser feedback tests; review one parsed item without changing canonical price | **3** — additive status/reviewer fields may be needed; Sarah review; depends R28 |
| R30 | Preserve parser provenance and feedback | `FnbParserFeedback`, parse menu routes, source menu parse jobs; partial but present | `fnb-parser-feedback.test.ts`, source-menu tests; mark one parser issue and retain source link | **2** with existing models; public exports must omit parser internals; depends R28 |
| R31 | Represent dietary/allergen requirements safely | `Speaker.dietaryRestrictions`, session food-service/F&B data exist; no normalized universal dietary model found | F&B/session readiness tests; display one dietary note without inventing a hard requirement | **4** — existing free text and event/session semantics require Sarah review; depends R26/R28 |
| R32 | Represent accessibility/service requirements | room/seating and session requirement structures exist; no universal accessibility model found | room-set/seating and requirement tests; record/display one existing structured requirement | **3** — additive model may be required; do not infer compliance from absent data; depends R31 and R13 |

### Slice 6 — Directory aggregation and people boundaries

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R33 | Use EventDirectoryPerson as aggregation layer | directory models/service/routes exist; legacy Speaker/EventPerson/attendee records remain | `event-directory-service-regression.test.ts`; list one event person and source/link metadata | **2** for reads; merge authority remains a decision; first in S6 |
| R34 | Preserve import batch/row provenance for directory | directory import models/routes and tests exist | `event-directory-import.test.ts`; import one row, inspect batch/row/result | **2**; event-scoped batch authorization required; depends R05/R33 |
| R35 | Make directory merge explicit and reversible enough | merge route/service exists; irreversible/data-impact semantics need review | `event-directory-backfill-regression.test.ts`, route tests; merge two records with audit/result | **4** — existing records and module links may be affected; Sarah review; depends R33/R34 |
| R36 | Define speaker/attendee/EventPerson linking rules | module-link and external-identity models exist, but overlaps remain | directory UI/service tests; link one existing speaker to one directory person without cross-event link | **3** — may need additive unique/link semantics; Sarah review; depends R35 |
| R37 | Keep internal/public people exports separate | speaker export and directory routes exist; public portal is token-scoped | speaker/browser and access tests; export one internal CSV with allowlisted fields | **1** for allowlist/route behavior; no token/notes/email leakage; depends R33–R36 |

### Slice 7 — Command-center widgets and operational rollups

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R38 | Reuse event command-center health selectors | `event-command-center.ts`, `command-center-dashboard.ts`, command-center route; implemented | `event-command-center-qa-regression.test.ts`, load/query-dedupe tests; render one persisted fact | **1**; first in S7, after source data slices |
| R39 | Add widget for roadmap/deadline risk | Timeline dashboard and `Deadline`/`TimelineItem` exist | roadmap progress/deadline tests; show one overdue item with event-local time | **1/2**; event scope and timezone correctness; depends R15/R16 |
| R40 | Add widget for budget variance/approval state | budget dashboard/blocks/reporting and submission models exist | budget aggregation/approval tests; show one pending approval and one variance | **2** using existing aggregates; policy thresholds not universal; depends R22/R25 |
| R41 | Add widget for session readiness/conflicts | Matrix readiness and speaker-conflict services exist | command-center conflict/readiness tests; show one missing room or overlap with evidence link | **1/2**; absent requirement must be uncertainty, not failure; depends R09/R11/R31 |
| R42 | Add widget for directory/speaker readiness | speaker readiness and directory records exist | speaker readiness/access tests; show one incomplete speaker with internal link | **1/2**; never expose internal notes in public view; depends R33/R36 |
| R43 | Persist widget layout without persisting derived facts | command-center layout route/model already exists; current layout persistence works | layout regression tests; move one widget and reload | **2**; do not create dashboard-only source tables; depends R38 |

### Slice 8 — AI Workspace retrieval and evidence

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R44 | Build deterministic read-only attention retrieval | AI discovery specifies checks; current branch has no AI Workspace source route/service. Earlier abandoned commits `b43735b2`/`40978f75` contain unmerged implementations | New pure service test over existing fixtures; return one event-scoped finding, no model call/write | **1** if response-only; depends S2–S7 and must not use abandoned branch code without review |
| R45 | Add source-linked evidence and field allowlist | AI data inventory defines evidence/source-link rules; no current evidence API/UI | pure serializer/allowlist test; cite one MatrixRow/BudgetLineItem by internal link and selected fields | **1** for transient response; public/internal boundary is central; depends R44 |
| R46 | Add question-context retrieval separate from action execution | Copilot `ask`, orchestrator, permissions, chat/execute routes exist; no current AI Workspace question-context route | pure context selection test; answer one factual event question from allowlisted records | **1** response-only; `CopilotAuditLog` may audit actions, not evidence provenance; depends R44/R45 |
| R47 | Persist AI runs/findings/proposals only after policy approval | AI docs explicitly list proposed `AIRun`/finding/source/proposal persistence as missing; no current models | no implementation in S0; future migration contract test before write | **3** additive schema may be required; retention/privacy/idempotency/rollback require Sarah review; depends R44–R46 |

### Slice 9 — Exports, public/internal data boundaries, and hardening

| ID | Provisional recommendation | Current evidence / status | Tests and smallest vertical slice | DB class; order |
|---|---|---|---|---|
| R48 | Standardize event-scoped internal exports | Matrix CSV, budget CSV, speaker export, timeline/import surfaces exist; allowlists vary | existing CSV/security tests plus one export reread; export one event’s budget/session rows only | **1** if route/service allowlists are sufficient; depends S1–S7 and access audit |
| R49 | Enforce public/internal boundary in portals, exports, and AI evidence | token routes and internal services exist; AI source absent, public field contract not centralized | public portal/security tests plus allowlist test; prove internal note/token/document body never appears | **1** for filtering; dependencies are cross-cutting, must be final S9 gate |

## Cross-cutting impact matrix

| Concern | Repository evidence | Dependency implication |
|---|---|---|
| Import approval/mapping | Event builder, budget/matrix/directory importers, row caps, batch/row models are separate | R01–R07 must decide whether approval is a response-only gate or a persisted universal import state. Do not create a generic table without Sarah’s review. |
| Roadmap/task persistence | `TimelineItem`/`TimelineDependency` and `Task*` are both real, separately documented systems | R14–R19 must preserve separation; AI/widget work must link to canonical rows, not create shadow facts. |
| Budget approval/editing/session cost | Budget submissions/approvals/versions and session-linked F&B/requirement budget links exist | R20–R25 must resolve `BudgetItem` versus `BudgetLineItem` and approved-baseline semantics before automation. |
| F&B pricing/tax | Deterministic calculations and normalized tax assignment tests pass | R26–R30 can mostly reuse existing data; migration parity and parser verification remain review points. |
| Dietary/accessibility | Speaker dietary free text and structured session/room/seating data exist, but no universal requirement semantics | R31–R32 must distinguish “missing data” from “requirement not applicable”; likely schema work is not safe to infer. |
| Menu verification | Parser feedback/source menu provenance exists, but no universal verified state found | R29 should begin as review metadata/response if possible; new persisted status requires Sarah decision. |
| Directory aggregation | `EventDirectoryPerson` plus legacy Speaker/EventPerson/attendee records and module links | R33–R37 need merge/link authority, duplicate handling, and event-isolation tests before cross-module aggregation. |
| Command-center widgets | Existing server-derived health/readiness and layout persistence | R38–R43 should compose existing selectors and persist layout only; no dashboard-only canonical data. |
| AI retrieval/evidence | Current branch has documentation only; abandoned AI branch commits contain unmerged page/service/routes | R44–R47 require source review, field allowlists, evidence links, event auth, and explicit approval before persistence/model calls. |
| Exports/public boundaries | CSV routes and token portals exist in separate route families | R48–R49 are a hardening gate; test event scope and sensitive-field exclusion rather than relying on UI hiding. |
| Mobile/tablet | Engineering standards require responsive acceptance; existing browser tests cover some responsive/event surfaces, not every module | Every UI slice must include narrow-width layout, drawer overflow, table/list behavior, and touch-safe actions in its smallest vertical test. |

## Proposed implementation sequence for Slices 1–9

1. **Slice 1 — Import foundation:** approve the canonical import vocabulary; implement/verify preview, deterministic mapping, server validation, explicit approval, provenance, and bounded results using existing import paths. No universal persistence until Sarah decides.
2. **Slice 2 — Session persistence:** make MatrixRow create/edit/status/assignment persistence and board/list/session workspace reload behavior authoritative; close route-level event-access gaps encountered in scope.
3. **Slice 3 — Roadmap and tasks:** preserve TimelineItem/Task separation; harden CRUD, dependency, bulk/import, and manual task lifecycle before any generated-task or AI action behavior.
4. **Slice 4 — Budget:** resolve active line authority, then verify editing, submissions, approvals/revision, session-linked costs, and derived reporting with server-side authorization.
5. **Slice 5 — F&B:** preserve deterministic price/tax math, source-menu/parser provenance, catalog assignment, and explicit review semantics; settle dietary/accessibility insufficiency before adding alerts.
6. **Slice 6 — Directory:** establish aggregation/link/merge rules and provenance across directory, speakers, attendees, and EventPerson; add safe internal exports.
7. **Slice 7 — Command center:** compose persisted canonical facts into widgets and layout; use event-local dates/timezones and evidence links; do not persist derived widget facts.
8. **Slice 8 — AI Workspace:** first read-only deterministic attention and question-context responses with allowlisted evidence and event authorization. Do not call a model or persist AI data in the first vertical slice.
9. **Slice 9 — Exports and boundary hardening:** standardize internal exports, public portal field allowlists, AI evidence filtering, security regression coverage, and release checks.

## Files likely to change by slice

These are planning candidates only, not an implementation authorization.

| Slice | Likely existing/new files |
|---|---|
| 1 | `web/app/(shell)/events/_components/new-event-builder.tsx`, `event-import-preview.tsx`, `web/src/server/services/event-import-builder.ts`, `web/lib/import/*`, `web/app/api/events/import/create/route.ts`, module import routes/tests |
| 2 | `web/app/(shell)/events/[eventId]/matrix-2/page.tsx`, `matrix-2/_components/*`, session workspace components, `web/lib/matrix2*.ts`, `web/lib/session*.ts`, Matrix 2/legacy route tests |
| 3 | `web/app/(shell)/timeline/_components/*`, timeline/task services, timeline/task routes, import/bulk tests |
| 4 | budget grid/dashboard components, `web/src/server/services/budget*.ts`, budget route auth helpers/routes, budget import/approval/session-link tests |
| 5 | F&B catalog/planner components, `web/lib/fnb-*.ts`, F&B routes/services/tests, help docs if behavior changes |
| 6 | directory page/components, `web/src/server/services/event-directory*.ts`, directory/attendee/speaker link routes/tests, export helpers |
| 7 | event command-center page/components, `web/src/server/services/event-command-center*.ts`, `command-center` routes, widget/layout tests |
| 8 | only after approval: new `web/src/server/services/event-attention.ts`, `web/src/server/services/event-question-context.ts`, `/api/events/[eventId]/ai-workspace/*`, event workspace component, pure/route auth tests. Earlier branch versions are reference evidence, not current code. |
| 9 | export route helpers, public portal serializers/routes, AI evidence serializers, security/access regression tests |

## Decisions requiring Sarah’s approval

- Provide/approve the canonical Immediate Plan, Prompt Pack, feedback roadmap, and 49 recommendation IDs/titles.
- Choose the authoritative Prisma schema/migration location and reconcile the non-identical root/web copies.
- Decide whether import approval is universal persisted state or remains module-specific/response-level.
- Confirm `BudgetLineItem` as active authority and define treatment of legacy `BudgetItem`.
- Define approved-budget baseline/materiality policy and edit/approval conflict semantics.
- Decide whether directory aggregation should link existing records, merge them, or introduce a new canonical person authority.
- Define dietary/allergen/accessibility semantics and whether absent data means unknown, not required, or incomplete.
- Define menu-item verification status, reviewer, provenance, and whether parser feedback is sufficient.
- Approve the AI Workspace first increment as deterministic/read-only with no model call, writes, or schema changes.
- If AI persistence is desired later, approve retention, evidence snapshot, privacy filtering, model metadata, idempotency, and action execution policy.
- Approve which exports are internal-only and which fields are allowed through public token routes.
- Decide whether the abandoned AI Workspace implementation commits (`b43735b2`, `40978f75`) are to be discarded, cherry-picked conceptually, or re-audited before any work.

## Database questions requiring consultation before implementation

1. **Schema authority:** Which copy is canonical, and what live database/migration history should be used to verify parity?
2. **Import approval:** Does approval require a new `ImportBatch`/status model, or can existing event/directory/budget/matrix import records safely carry the workflow?
3. **Budget authority:** Can `BudgetLineItem` safely replace all active `BudgetItem` reads, or are historical records/workflows still dependent on both?
4. **Budget baseline:** Is an approved snapshot/version sufficient, or is an additive baseline/change-set model required?
5. **Requirements:** Are dietary, allergen, accessibility, AV, staffing, and F&B requirements universally applicable, and what explicit waiver/requiredness semantics are needed?
6. **Menu verification:** Is `FnbParserFeedback` sufficient, or is a reviewed/verified state with actor/timestamp needed?
7. **Directory identity:** What is the durable identity/merge key across `EventDirectoryPerson`, `Speaker`, `EventPerson`, and attendee records, and how are existing links/backfills handled?
8. **AI persistence:** Are run/finding/evidence/proposal records approved? If yes, define fields, retention, event/org keys, indexes, redaction, migration/backfill, rollback, and cleanup.
9. **Timeline taxonomy:** Is the additive taxonomy migration applied everywhere and represented by the generated client before using those fields in new selectors?

No database changes are proposed or implemented by this document.

## Read-only checks and results

Checks run for this dependency map:

- `git status --short --branch` — baseline documentation directory was already untracked from the prior Slice 0A report; no application changes present.
- `git ls-tree -r --name-only feature/orca-ai-workspace` and equivalent remote branch inspection — found prior abandoned AI Workspace implementation files, but no Immediate plan/prompt pack/feedback roadmap.
- `git log --all --name-only` search — no canonical 49-item Immediate list found.
- `rg --files docs .` search — no `DB_SCHEMA_LOCKED.*` or Immediate plan/prompt pack found.
- `git show --stat b43735b2` and `git show --stat 40978f75` — confirmed earlier AI Workspace page/service/route/test implementation exists only in branch history, not current source.
- No product or database validation command was run for this documentation-only map; the baseline’s recorded validation remains authoritative for the current checkout.

## Recommended next prompt

“Sarah, please provide or approve the canonical 49-item Immediate Plan/Prompt Pack and choose the schema authority (`prisma/` versus `web/prisma/`). Then start Slice 1 with only the approved import vertical slice: preview one supported workbook, map deterministic columns, show server-validated row errors, require explicit approval, and persist one event-scoped result using existing models. Do not add an import table or migration until the approval/provenance decision is confirmed.”
