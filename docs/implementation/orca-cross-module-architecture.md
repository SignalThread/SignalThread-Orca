# Orca OS Cross-Module Architecture and Persistence Design

Status: **ready for autonomous implementation review**  
Scope: Prompt 1 baseline for Prompts 2–15  
Evidence date: 2026-08-11

This document is the smallest consolidated design that matches the audited repository. It separates shipped source-backed behavior from later prompt acceptance work. It does not authorize a second source of truth, destructive migration, client-side database access, or attendance/check-in/no-show functionality.

## System boundary

```text
Browser / Next.js server component
  -> authenticated App Router route or server service
  -> canonical organization/event access decision
  -> event-scoped domain service and transaction
  -> Prisma client
  -> PostgreSQL canonical records

Canonical records
  -> deterministic readiness / command-center / AI evidence read models
  -> recipient-specific server projection
  -> UI, CSV, spreadsheet, printable/PDF, or briefing output
```

- `Organization -> Client? -> Event` is the tenancy spine. Normal members need `EventMember`; organization owners/admins and platform super-admins follow the centralized access policy.
- Route handlers resolve the request user, enforce read/write access before parsing or mutation where applicable, validate every referenced child against the route event, and delegate business rules to `web/lib` or `web/src/server/services`.
- Prisma is server-only. Both `prisma/schema.prisma` and `web/prisma/schema.prisma`, plus their mirrored migration directories, must remain byte-equivalent for schema work.
- PostgreSQL is authoritative. Dashboards, readiness, compatibility summaries, AI evidence, and exports are projections; they never become editable shadow status.
- Binary document and speaker-file bytes use the existing R2-compatible storage seam. Database records remain authoritative for metadata, version, access, and lifecycle.

## Canonical ownership and data flow

| Domain | Canonical owner | Mutation path | Derived consumers | Boundary rules |
|---|---|---|---|---|
| Organization terminology | nullable typed fields on `Organization` with canonical fallbacks | owner/admin organization terminology API | navigation, headings, help, exports, public views, AI | labels only; IDs, routes, enums, permissions and analytics remain stable |
| Sessions / Run of Show | `MatrixRow`, `Room`, and scoped session relations | event routes -> Matrix/session services -> transaction | board/list/workspace, readiness, budget links, exports, AI evidence | session and every related record must share `eventId`; partial updates preserve omitted fields |
| Session requirements | one `SessionRequirementTemplate` per event, sections/items, session selections | explicit write-time initialization and requirement services | quick panels, readiness and budget links | reads are pure; unused categories remain visible; selection key is `(sessionId,itemId)` |
| Show flow | ordered `SessionShowFlowItem` rows | authorized session show-flow service | internal/public projections, exports and briefing evidence | event/session match, unique order, deterministic timing and explicit visibility |
| Menus / F&B | `EventFnbSourceMenu`, parse records, `EventFnbCatalogItem`, structured claims | authorized F&B catalog/source-menu services | session assignment picker, compatibility, readiness, budget and exports | parser status, operational lifecycle and verification are distinct; source changes can stale verification |
| Session F&B safety | aggregate `SessionFnbRequirement`, canonical assignment plus item-version snapshot, safety resolutions | authorized session/F&B services | planner alerts, readiness, vendor-safe exports and AI evidence | aggregate operational needs only; never attendee identity or medical detail; Contains and Free Of are independent evidence |
| Money | integer minor-unit catalog/assignment/budget fields plus explicit taxes, fees and discounts | exact-money service inside transaction | F&B estimate, Budget Grid, dashboard and exports | ISO currency required; calculation order/rounding explicit; no float arithmetic or silent mixed-currency merge |
| People | `EventDirectoryPerson`, `EventPerson`, `Speaker` and their normalized links | directory, staffing and speaker services | assignments, readiness, communications and exports | no email-similarity auto-merge; portal identity derives from hashed scoped token, not client input |
| Budget / approvals | `Budget`, versions, line items, submissions, approvals and activity | budget service transaction | grid, command center, readiness, exports | integer cents; concurrent terminal transitions guarded; linked session/item must belong to the same event |
| Documents / approvals | `Document`, immutable versions and approval records | document services plus R2 presign/finalize | Docs Hub, command center, exports | metadata access is event-scoped; object keys are validated; public projections do not expose storage internals |
| Roadmap | `TimelineItem` hierarchy and `TimelineDependency` | timeline services | Dashboard/Matrix/Workstream/Board, readiness and AI evidence | same-event parent/dependency validation, no self/cycles, deterministic rollups, stable flat-list behavior |
| Audit | append-only `EventActivity` with whitelisted changes and event-scoped source dedup | same transaction as business mutation where required | Activity UI, investigation and release evidence | never full-record dumps, secrets, tokens, person medical detail, or private notes |
| Command Center / AI | authorized read models over canonical domains | read-only service queries | portfolio/event widgets, AI Workspace and Executive Briefing | may summarize/explain/suggest; cannot invent facts, write readiness, or override source records |
| Exports | server-side recipient allowlist over canonical records; generation metadata in export records | authorized export service | role CSV/spreadsheet/print/PDF/public projection | explicit data-as-of/version/filter/recipient; public/vendor outputs exclude unnecessary internal and person-level sensitive data |

## Cross-module invariants

1. Every new mutable operational row is event-scoped directly or through a parent that is revalidated inside the mutation transaction.
2. Client-supplied `eventId`, relation IDs, actor IDs, prices, status, version, and evidence never establish trust by themselves.
3. New schema work is additive: nullable columns or safe defaults first, new tables/enums/indexes second, deterministic backfill only when source facts exist, application adoption last.
4. Optimistic `version` or transaction-time locking guards concurrent writes where overwrite or terminal-transition risk exists. Replayed intent keys return the original terminal result.
5. Exact-money values use integer minor units and ISO currency. Original, negotiated, discount, service charge, tax, fee, estimate, actual and variance remain distinct.
6. `CONTAINS` and `FREE_OF` are explicit independent claims. Missing evidence means insufficient information, never implicit safety.
7. Verification carries status, verifier, timestamp, evidence source and notes. Source changes invalidate dependent evidence conservatively.
8. `NOT_NEEDED` requires a reason, actor and timestamp and remains auditable. It removes an item from readiness denominators only through the shared disposition rule.
9. Public/vendor/export/AI projections are constructed by allowlist. They do not serialize records and delete fields afterward.
10. No Prompt 2–15 work adds attendance tracking, check-in, or no-show behavior.

## Persistence relationships needed through Prompt 15

The checked-in schema already contains part of this foundation. Each later prompt must revalidate its full acceptance criteria before the corresponding ledger row becomes `PASS`.

- Menu lifecycle and evidence: extend/reuse `EventFnbSourceMenu` lifecycle, owner, source/version, verification and optimistic-version fields.
- Item safety and price facts: extend/reuse `EventFnbCatalogItem`, `EventFnbCatalogItemClaim` and immutable safety revisions. Custom/off-menu items use the same model with explicit provenance.
- Aggregate session needs: reuse `SessionFnbRequirement` with kind/code/quantity, source/notes and audited disposition. Do not introduce person-level need rows.
- Assignment evidence: reuse `SessionFnbCatalogAssignment.catalogItemVersion` and `SessionFnbAssignmentSafetyResolution`; recompute deterministic outcomes from current facts and retain verified modification evidence separately.
- Export generation: reuse `EventFnbExportRecord` for recipient/filter/data-version generation metadata, and add only the smallest generalized artifact/version relation if Prompt 10 proves F&B-scoped metadata cannot meet every output requirement.
- Show flow: reuse `SessionShowFlowItem`; add timing/publication/version structures only if required after the Prompt 6 service audit. Do not duplicate `MatrixRow` schedule authority.
- Roadmap disposition: reuse `TimelineItem` hierarchy/dependencies. Add audited disposition history only if existing Event Activity plus item fields cannot meet Prompt 13 history and restore requirements.
- Executive Briefing: persist no generated truth. If durable briefing snapshots are required, store generation metadata, evidence identifiers and rendered output as an immutable artifact, never editable readiness facts.

## Migration and recovery plan

1. Validate both Prisma schemas and assert parity.
2. Rehearse the complete existing migration chain against a fresh disposable database.
3. Rehearse forward upgrade against the representative disposable database.
4. For each prompt, add mirrored forward-only migration SQL, generate Prisma clients, validate constraints/indexes and run representative backfill assertions.
5. Deploy application reads compatible with old nullable state, then enable new writes. Backfill only deterministic values; mark ambiguous evidence unverified/needs review.
6. Recovery is forward-only: roll application reads/writes back to the prior compatible path while retaining additive data. Never claim destructive down migration safety.

The current repository migration chain includes the additive shared F&B foundation, manual menu intake, item safety audit, session safety resolution, session operations handoff and timeline enum reconciliation. Their presence is implementation evidence, not automatic acceptance evidence; Prompts 2–15 still require focused schema, behavior, migration, permission, UI and reconciliation validation.

## Prompt 1 acceptance matrix

| Requirement | User route/state | Implementation evidence | Persistence evidence | Tests | Status | Action | Dependency | Priority |
|---|---|---|---|---|---|---|---|---|
| Portfolio/Event Command Centers | portfolio dashboard; event dashboard; populated/empty/edit layouts | command-center pages and read services | canonical events, sessions, roadmap, approvals, speakers, staffing and F&B | 74/74 focused after migration repair; DB journeys 18/18 | audited | extend only from canonical readiness | Prompt 11 | P1 |
| Sessions/Run of Show | board/list/drawer/full workspace/import/public/internal | Matrix/session routes and services | `MatrixRow` plus scoped relations and import ledger | 373/373, 1 optional fixture skip | audited | complete show-flow conflict/version acceptance | Prompts 5–6 | P0 |
| F&B/Menu/Budget | planner, source menus, catalog, grid, approvals | F&B and budget service families | source menus/items/assignments/tax/budget/approval records | 369/369, 4 optional workbook skips | audited | add primary nav; validate remaining lifecycle/financial criteria | Prompts 2–4, 7–9 | P0 |
| People and operational needs | Speakers, staffing quick panel, safety/readiness | speaker/directory/staffing/requirement services | normalized speaker/person/assignment/requirement records | 181/181 and 22/22 speaker-focused | audited | add permanent Supplies/Signage defaults | Prompt 5 | P0 |
| Exports | role export API and downloads | server allowlist projections | export audit/generation metadata plus canonical sources | 1066/1066, 2 optional workbook skips | audited | build versioned preview and printable/PDF center | Prompt 10 | P0 |
| Roadmap | Dashboard/Matrix/Workstream/Board | timeline/task/dependency services | `TimelineItem`, `TimelineDependency`, activity | 302/302, 1 optional workbook skip | audited | complete audited Not Needed/history criteria | Prompt 13 | P1 |
| Terminology and AI | organization settings; AI Workspace | terminology API/contract; attention/question-context read models | organization labels; canonical event evidence only | 683/683 broad boundary tests, 1 optional skip | audited | apply terminology consistently; build grounded briefing | Prompts 12 and 14 | P1 |
| Auth, isolation, concurrency, logging, privacy | authorized, denied, retry and conflict states | centralized access, service transactions, Activity and safe projections | event/org foreign keys, unique/version constraints and whitelisted audit changes | 683/683 broad boundary tests, 1 optional skip | audited | re-audit every new Prompt 2–15 mutation/output | every later prompt | P0 |

## Autonomous review decision

Approved for continued implementation. The design reuses current canonical entities, keeps derived surfaces non-authoritative, permits only additive/backward-compatible persistence, identifies the narrow conditions for any later table, and preserves the explicit exclusion of attendance/check-in/no-show scope. Prompt 2 begins by challenging this design against the live schema and migrations and may revise it only with equal or stronger tenancy, privacy, audit, concurrency and recovery guarantees.
