# AI Workspace event-data domain inventory

## Purpose and safety boundary

This is a read-only repository audit for deterministic event-level question retrieval. It describes what can be retrieved from verified, event-scoped records today; it is not a promise that the current question-context API already supports every item below.

The safe retrieval boundary is:

- Authenticate the request with `resolveRequestUser` and enforce `assertEventAccessForUser(eventId, user, "read")` (or the equivalent service access helper). Organization scope and event membership are both required.
- Put `eventId` in every query predicate, including nested relations. A session, room, speaker, document, budget, or timeline record found by an unrelated global ID is not sufficient.
- Return a deliberately selected projection: identifiers, display labels, dates, statuses, numeric totals, and verified source references. Never return raw Prisma objects, upload object keys, signed URLs, private document contents, internal errors, or secrets.
- Use the event's `timezone` with `getEventDateBoundaries` for “today,” “overdue,” and “this week.” Invalid or missing timezones use the documented application/UTC fallback and must be disclosed as a limitation.
- Treat a nullable field as unknown unless an existing service establishes that the field is required for the specific record. `null` is not proof that a room, speaker, AV, F&B, owner, or approval is missing.
- Preserve deterministic ordering and stable source links. The existing question-context service delegates attention finding calculation to `getEventAttention` and applies bounded, intent-specific selection.

The repository contains two Prisma schema copies (`prisma/schema.prisma` and `web/prisma/schema.prisma`) and a long migration history. They are not fully reliable representations of the deployed database. In particular, the live database used by the route integration test does not contain the legacy `SessionSpeaker` table even though that relation remains in the schema; canonical retrieval must use `SessionSpeakerAssignment` instead. No migration repair is implied by this document.

## Capability vocabulary

For each domain, “ready” means a deterministic service can safely retrieve the stated projection after event authorization. “Partial” means some records or operations are reliable but requirements, coverage, or route support is incomplete. “Not ready” means the repository has no verified event-level source suitable for an answer.

The operation labels below mean:

- **List**: return event-scoped records in stable order.
- **Count**: aggregate records or statuses from a verified projection.
- **Lookup**: resolve an explicitly named record without guessing across ambiguous matches.
- **Compare**: compare dates, statuses, or numeric values using defined semantics.
- **Summarize**: produce a bounded factual rollup; this is not model-generated prose.
- **Filter**: select records by an explicit stored status/category/date or a deterministic service rule.

## Domain inventory

### 1. Sessions and agendas

**Confirmed models and relations**

- `Event` → `matrixRows` (`MatrixRow`).
- `MatrixRow` stores `sessionName`, `dayDate`, `startTime`, `endTime`, `roomId`, legacy `roomName`, `setupType`, `attendance`, `mealPeriod`, `avNeeds`, `avNotes`, `fnbNotes`, and `notes`.
- Relations include `Room`, `SessionAVRequirement`, `SessionFoodService`, `SessionFnbCatalogAssignment`, `SessionSpeakerAssignment`, `SessionStaffAssignment`, requirement selections, seating, and budget line items.
- `SessionSpeaker`/`EventPerson` are legacy relations and must not be assumed available in the deployed database; the canonical speaker bridge is `SessionSpeakerAssignment` → `Speaker`.

**Existing access**

- `web/lib/matrix2.ts:getMatrix2Snapshot` and `web/app/api/events/[eventId]/matrix-2/route.ts` provide a rich session projection. The snapshot helper also ensures requirement-template data and therefore is not a safe read-only dependency for a future AI service without separating that behavior.
- `event-attention.ts` performs a direct, read-oriented `matrixRow.findMany` projection for times, rooms, speakers, and meal-period F&B checks.
- `web/app/api/events/[eventId]/matrix-rows/route.ts` exposes legacy matrix rows; `/matrix-2` is the richer operational surface.

**Verified fields and source routes**

Session ID/name, event ID, calendar date, start/end times, valid event room, attendance, stored AV text/requirements, canonical speaker assignments, staff assignments, F&B records, and requirement selections can be exposed when selected explicitly. Safe UI routes are `/events/{eventId}/matrix`, `/events/{eventId}/matrix-2`, and `/events/{eventId}/matrix/sessions/{sessionId}`. API routes are event-scoped and are not themselves user-facing source links.

**Question capability**

Ready for list, count, lookup, compare (date/time), summarize, and filter by explicit stored fields. Direct lookup must exact-match normalized names first and report no-match or multiple-match ambiguity. Agenda semantics beyond stored rows (for example, inferred “what should be scheduled”) are unsupported.

**Gaps**

Some legacy structured values are encoded in `notes`; title-based session-type inference is not a canonical requirement source. Owner fields are not present on `MatrixRow`. Nullable room/time/speaker fields do not prove a requirement. Readiness can only use the categories covered by `event-attention` or the pure `session-readiness` helpers.

**Readiness**: **Ready for bounded deterministic retrieval; partial for requirements/readiness.**

### 2. Run of Show

**Confirmed models and relations**

- The operational run of show is represented by `MatrixRow` date/time/order fields, rooms, speakers, AV, F&B, staffing, and notes.
- There is no separate `RunOfShow` Prisma model.

**Existing access**

- Matrix-2 snapshot and matrix-row APIs provide the rows.
- `event-attention.ts` supplies deterministic session readiness findings and stable finding IDs.
- `event-command-center.ts` exposes a `RunOfShowReadinessOverview` rollup through `/api/events/{eventId}/command-center`.

**Safe questions and operations**

List, count, lookup, filter by date/room/readiness, and summarize verified gaps are safe. Compare only stored times and dates using event-local boundaries. “Is the run of show operationally ready?” is a partial rollup because not every operational module has a canonical requirement.

**Source route**: `/events/{eventId}/matrix-2` or session detail; command-center summaries use `/events/{eventId}/command-center` internally and `/events/{eventId}`/dashboard UI context.

**Readiness**: **Partial**—the rows are ready; completeness is not universal.

### 3. Roadmaps and milestones

**Confirmed models and relations**

- `Event` → `timelineItems` (`TimelineItem`) and `timelineDependencies` (`TimelineDependency`).
- `TimelineItem` contains title/description, status, priority, workstream/planning-stage taxonomy, owner relation where configured, start/due dates, and parent/dependency relationships. The exact projection is defined in `timeline.ts` and `timeline-dashboard.ts`.

**Existing access**

- `web/src/server/services/timeline.ts:listTimelineItems`, dependency helpers, and event-scoped create/update/delete operations.
- `web/src/server/services/timeline-dashboard.ts:getEventTimelineDashboard` and `/api/events/{eventId}/timeline-dashboard` calculate stage, workstream, owner, blocker, and upcoming-date rollups.
- `/api/events/{eventId}/timeline-items` and `/timeline-dependencies` provide event-scoped APIs.

**Safe questions and operations**

Ready for list, count, lookup, filter by status/priority/workstream/stage/owner, compare dates, summarize progress, and identify dashboard-defined blockers. Dependency-chain or “critical path” answers are safe only when using the dashboard’s explicit dependency logic; causal or priority recommendations are not deterministic.

**Source route**: `/events/{eventId}/timeline`; individual timeline item routes are API endpoints, not confirmed planner-facing source links.

**Gaps**: owner completeness and dates can be nullable; do not call them missing unless the relevant workflow marks them required. Imported records may have incomplete taxonomy.

**Readiness**: **Ready for the dashboard-defined deterministic subset.**

### 4. Tasks and deadlines

**Confirmed models and relations**

- `Event` → `tasks` (`Task`), with `TaskAssignment`, `TaskLink`, `TaskComment`, `TaskActivity`, and `TaskWatcher`.
- `TaskStatus`, `TaskPriority`, `TaskType`, visibility, assignment roles, and link object types are explicit enums.
- `Event` → `deadlines` (`Deadline`) with `DeadlineCategory` and `DeadlineStatus`.

**Existing access**

- `web/src/server/services/tasks.ts:listTasksForEvent` and task detail/list helpers enforce task/event access patterns.
- `event-attention.ts:getEventAttention` queries active tasks, owner assignments, due dates, and active deadlines with a bounded lookahead.

**Safe questions and operations**

Ready for list, count, lookup, filter by status/priority/type/owner, compare due dates, summarize overdue/open work, and deterministic “today/this week/upcoming” queries using event-local boundaries. A task is ownerless only when the existing assignment projection has no `OWNER` role; a nullable optional assignee is not enough evidence.

**Source route**: `/events/{eventId}/timeline` is the established planner surface; event task API routes are `/api/events/{eventId}/tasks` and `/tasks/{taskId}`. A future source link should use an existing UI route only after confirming the task-detail route.

**Gaps**: task visibility and role-specific access must be preserved; not every task activity is a reliable before/after audit trail.

**Readiness**: **Ready for deterministic retrieval through existing task service/attention projections.**

### 5. Budgets and financials

**Confirmed models and relations**

- `Event` → optional `Budget` → `BudgetGroup`, `BudgetCategoryTarget`, `BudgetLineItem`, `BudgetSubmission`, submission recipients/line items, `BudgetActivity`, `BudgetVersion`, `BudgetApproval`, and `BudgetItem`.
- `BudgetLineItem` links to documents, sessions, groups, categories, and F&B assignments where configured.
- Explicit status and approval enums exist for budgets, submissions, approvals, items, line items, and activities.

**Existing access**

- `web/src/server/services/budget.ts` contains access resolution, snapshots, dashboards, financial reports, line-item projections, submissions, files, and approval workflows.
- `budget-sessions-groups.ts` provides session/group/category totals.
- Event APIs include `/budget`, `/budget/dashboard`, `/budget/reporting`, `/budget/line-items`, `/budget/submissions`, `/budget/blocks`, and exports.

**Safe questions and operations**

Ready for list, count, lookup, filter by category/status/approval/session/group, compare forecast vs actual where both numeric values are present, and summarize totals using `computeTotals`/financial report projections. Pending submission/approval counts are deterministic. Material variance requires a defined threshold and currency semantics; the current attention service explicitly marks this as unsupported. Never expose raw upload metadata or unrestricted financial documents.

**Source route**: `/events/{eventId}/budget`; line-item and submission UI routes should be used only where established by the budget page.

**Gaps**: optional budget, nullable actuals/forecasts, status semantics, and schema/migration divergence require field-by-field handling. Approval state can differ between budget submissions, line items, and document approvals.

**Readiness**: **Partial for general retrieval; ready for service-defined totals and statuses.**

### 6. F&B

**Confirmed models and relations**

- `MatrixRow.mealPeriod`, `fnbNotes`, and tax/service-charge fields.
- `SessionFoodService` (one-to-one) stores service type/style/headcount.
- `EventFnbCatalogItem` → optional `EventFnbSourceMenu`; `SessionFnbCatalogAssignment` links catalog items to sessions, with optional budget line and taxes.
- `EventFnbSourceMenu` and parser feedback/status models describe uploaded menu processing.

**Existing access**

- `web/lib/fnb-catalog.ts` lists catalog items, source menus, session assignments, and F&B plans.
- Event APIs cover `/fnb-catalog`, source menus, parser endpoints, and `/matrix-2/sessions/{sessionId}/fnb-catalog-assignments` and `/fnb-plan`.
- `event-attention.ts` checks meal-demand periods with no food-service record or catalog assignment.
- Current question-context retrieval directly selects event rows, food service, non-archived catalog assignments, source-menu names, and meal period.

**Safe questions and operations**

Ready for list, count, lookup, filter by selected/not-selected/unavailable/not-required, menu assignment, service type, and explicit meal period; summarize selected sessions and recorded headcounts. Compare costs only through budget service projections. The current deterministic intents are `session_fnb_selected`, `session_fnb_not_selected`, `session_fnb_unavailable`, `session_fnb_not_required`, and `session_fnb_status`.

**Source route**: `/events/{eventId}/fnb-catalog` and `/events/{eventId}/matrix/sessions/{sessionId}`. Links must use non-archived, event-scoped records.

**Gaps**: a null meal period is not proof that food is required; `MealPeriod.NONE` is the explicit not-required signal. Legacy notes are evidence only when explicitly returned, not an inferred menu. Archived catalog assignments/items must be excluded. The deployed database lacks legacy `SessionSpeaker`, a separate known divergence unrelated to F&B.

**Readiness**: **Ready for the explicit recorded-data states; partial for F&B “completion” and requirement inference.**

### 7. Room sets

**Confirmed models and relations**

- `Room` belongs to `Event` and relates to `MatrixRow`.
- `MatrixRow` stores room ID/name and setup type.
- `SeatingPlan`, `SeatingTable`, `SeatingAttendee`, and `SeatingAssignment` cover seating, not necessarily room-set layout completeness.
- Room-set layout details are represented by the room-set planner’s persisted structures/helpers rather than a single obvious event-level readiness model.

**Existing access**

- Event room APIs: `/api/events/{eventId}/rooms`.
- Session room-set UI: `/events/{eventId}/matrix/sessions/{sessionId}/room-set`.
- `event-attention.ts` safely checks valid room assignment only.
- `web/lib/session-readiness.ts` has pure room-set readiness functions when supplied an already verified session projection.

**Safe questions and operations**

Ready to list/count/look up rooms and session room assignments, filter sessions by assigned/unassigned room, and compare room capacity to recorded attendance where the room relation is valid. Room-set layout completeness, furniture quantities, and setup feasibility are not safe event-wide answers without a canonical persisted projection.

**Readiness**: **Partial**—room assignments are ready; layout completeness is not.

### 8. Speakers

**Confirmed models and relations**

- `Event` → `speakers` (`Speaker`) and speaker profile/submission/readiness/file/message/note/email/document-request/onsite relations.
- Canonical session bridge: `SessionSpeakerAssignment` → `Speaker`.
- `SpeakerStatus`, submission, file, review, and communication enums are explicit.

**Existing access**

- `speakers.ts:listSpeakers/getSpeaker`, speaker conflict, readiness, files, submissions, communications, and onsite services.
- Event APIs cover `/speakers`, speaker detail, `/speaker-readiness`, `/speaker-conflicts`, files, submissions, and onsite routes.
- `event-attention.ts` detects missing session speaker assignments and scheduling conflicts.

**Safe questions and operations**

Ready for list/count/lookup speakers, filter by event/session/status/readiness flag, compare scheduled session times for conflicts, and summarize verified speaker readiness. Direct session speaker lookup is safe from `SessionSpeakerAssignment`; speaker profile completeness is safe only via the explicit `speaker-readiness` service.

**Source routes**: `/events/{eventId}/speakers`, `/events/{eventId}/speakers/{speakerId}`, and `/events/{eventId}/matrix/sessions/{sessionId}`.

**Gaps**: legacy `SessionSpeaker` is not present in the deployed database; do not query it. A missing assignment does not prove a speaker is required unless the service/applicability policy says so. Uploaded file contents and private notes are not general question evidence.

**Readiness**: **Ready for canonical assignment and service-defined readiness; partial for requirement inference.**

### 9. AV and production

**Confirmed models and relations**

- `MatrixRow.avNotes` and `avNeeds` are legacy text fields.
- `SessionAVRequirement` stores explicit `avType` and optional quantity per session.
- Requirement selections can contain linked budget line items whose categories may mention AV.

**Existing access**

- Matrix-2 snapshot and session detail routes expose structured AV requirements and legacy AV text.
- `web/lib/session-readiness.ts` has pure AV readiness functions when a verified projection supplies requirements/applicability.
- No standalone event-level AV service or authoritative production checklist route was confirmed.

**Safe questions and operations**

Ready to list/count/filter recorded AV requirements and look up a session’s AV records. Compare quantities only when numeric quantities are explicit. “Which sessions are missing AV?” is only partial: absence is not a requirement unless the session applicability/requirement policy is explicitly present.

**Source route**: session detail `/events/{eventId}/matrix/sessions/{sessionId}`; no confirmed standalone AV route.

**Readiness**: **Partial.**

### 10. Staffing

**Confirmed models and relations**

- `EventPerson` with role enum including `STAFF`/vendor-like roles as defined by schema.
- `SessionStaffAssignment` joins sessions to event people with optional role.
- `EventMember` covers application/event membership, not operational staffing assignments.

**Existing access**

- Matrix-2 snapshot assembles staff assignments.
- `event-assignable-users.ts` lists users eligible for event assignments, which is not the same as session staffing.
- No dedicated event staffing service/API with a canonical readiness contract was confirmed.

**Safe questions and operations**

Ready to list/count/look up explicit session staff assignments and filter by stored role/person. Assignment gaps are not safely “missing staffing” without an explicit staffing requirement or expected count.

**Source route**: session detail/matrix-2; no confirmed standalone staffing source route.

**Readiness**: **Partial.**

### 11. Signage

**Confirmed database support**

No dedicated `Signage`, signage item, signage task, or signage requirement model was found in the Prisma schema or migration history. Documents/tasks may mention signage textually, but that is not a canonical signage dataset.

**Safe questions and operations**

Unsupported for deterministic event-level list/count/lookup/compare/summarize/filter unless a specific task or document is explicitly queried as that record. Do not classify the absence of a signage record as a missing signage requirement.

**Readiness**: **Not ready.**

### 12. Partners and vendors

**Confirmed models and relations**

- `EventPerson` has event-scoped people and `EventPersonRole` values including vendor/partner-like roles.
- `EventDirectoryPerson`, roles, sources, external identities, and module links provide a separate directory domain.
- `EventIntegrationConnection`/external identity models represent integrations, not a canonical partner contract record.

**Existing access**

- `event-directory.ts` and event directory APIs list event-scoped directory data.
- Matrix/session staffing can reference event people.
- No dedicated partner/vendor service or normalized vendor contract model was confirmed.

**Safe questions and operations**

Ready to list/count/lookup/filter directory people by stored role/status/source and list explicit session staff/vendor assignments. Contract status, spend, deliverables, or partner health are unsupported unless represented by a task, budget line, document, or explicit integration record.

**Source route**: `/events/{eventId}/directory`; session detail for assignments.

**Readiness**: **Partial.**

### 13. Approvals

**Confirmed models and relations**

- `DocumentApproval`/recipients and `DocumentStatus`.
- `BudgetSubmission`, `BudgetApproval`, and related recipient/line-item models.
- Speaker submissions have explicit approval/rejection workflows and statuses.
- `EventActivity`/budget activity can record approval events, but should not be treated as the current state unless the owning service says so.

**Existing access**

- `documents.ts` approval service and document routes.
- `budget.ts` submission/approval services and budget routes.
- `speaker-submissions.ts` and speaker submission approval routes.
- `event-attention.ts` currently reports documents in review and submitted budget changes; it does not cover every approval workflow.

**Safe questions and operations**

Ready to list/count/filter current pending/approved/rejected states per workflow and lookup a specific approval subject. Cross-workflow “all approvals” is partial and must label which workflows are included. Approval history can be summarized only from explicit activity/version records; before/after completeness is not universal.

**Source routes**: `/events/{eventId}/docs`, `/events/{eventId}/budget`, `/events/{eventId}/speakers`, and their workflow-specific screens.

**Readiness**: **Partial across the event; ready per owning workflow.**

### 14. Conflicts

**Confirmed database/models**

There is no general `Conflict` Prisma model. Speaker scheduling conflicts are derived from canonical speaker-session assignments and times by `speaker-conflicts.ts`; other conflict-like conditions are derived by session-readiness/command-center logic.

**Existing access**

- `speaker-conflicts.ts` computes speaker overlap/transition conflicts.
- `event-attention.ts:getEventAttention` converts conflicts and readiness gaps into stable findings with source references.
- `event-command-center.ts` provides conflict/readiness rollups.

**Safe questions and operations**

Ready to list/count/filter/summarize conflicts produced by the existing deterministic calculators and lookup affected sessions. Compare only the calculator’s defined time/room/speaker rules. Do not infer a conflict from arbitrary text collisions.

**Source route**: `/events/{eventId}/ai-workspace` for findings, `/events/{eventId}/matrix/sessions/{sessionId}` for affected records, and `/events/{eventId}/speakers` for speaker context.

**Readiness**: **Ready for existing calculators; partial for unmodeled conflict types.**

### 15. Documents and uploaded files

**Confirmed models and relations**

- `Document`, `DocumentVersion`, `DocumentApproval`, `DocumentTag`, `DocumentLink`, `DocumentCategory`, and event-scoped document relations.
- Budget files are represented through budget file records/links in `budget.ts`; uploaded objects are stored behind object keys/presigned downloads.

**Existing access**

- `documents.ts:listDocumentsForEvent`, details, categories, tags, link options, review/approval, and download services.
- Event document APIs include `/documents`, `/docs`, categories, review, download, and presign/finalize routes.

**Safe questions and operations**

Ready to list/count/lookup/filter documents by event, category, status, visibility, tags, linked record, and version metadata. Summarize review/approval state. Do not answer from raw file contents in the deterministic context builder; a future document-specific extractor would need separate authorization, redaction, size, and citation rules. Never expose object keys or signed URLs as generic evidence.

**Source route**: `/events/{eventId}/docs` and document detail/review screens where confirmed.

**Readiness**: **Ready for metadata/status; not ready for unrestricted content retrieval.**

### 16. Onsite operations

**Confirmed models and relations**

- `SpeakerOnsiteInfo` and speaker onsite services.
- Seating models (`SeatingPlan`, `SeatingTable`, `SeatingAttendee`, `SeatingAssignment`).
- Attendee/registration/session-enrollment models and event activity.
- Event directory and speaker communication/file models support operational context but are not a single onsite state machine.

**Existing access**

- `speaker-onsite.ts`, seating APIs, attendee/session enrollment services, `event-activity.ts`, and command-center dashboards.
- Routes include event seating, attendees, speaker onsite, activity, and command center.

**Safe questions and operations**

Ready for list/count/lookup/filter explicit onsite records (seating assignments, attendance/enrollment status, speaker onsite info, activity entries) and deterministic summaries by status. “Who is onsite?” is only answerable from a current explicit status/check-in source; a speaker or attendee record alone does not prove presence.

**Source routes**: `/events/{eventId}/seating`, `/events/{eventId}/attendees`, `/events/{eventId}/activity`, speaker detail/onsite routes, and command center.

**Gaps**: activity history may not contain complete before/after values; current status and historical activity must be separated.

**Readiness**: **Partial; ready per explicit operational record.**

### 17. Event summaries and readiness

**Confirmed models and relations**

- `Event` stores identity, dates, timezone, venue/location, status, organization/client, and membership relations.
- Readiness is derived, not stored in one event summary model. `event-attention.ts`, `session-readiness.ts`, `timeline-dashboard.ts`, and `event-command-center.ts` calculate bounded summaries.

**Existing access**

- Event header/page and `/api/events/{eventId}` provide event metadata.
- `/api/events/{eventId}/ai-workspace/attention` returns deterministic findings, severity summary, support coverage, and temporal context.
- `/api/events/{eventId}/command-center` returns event phase, financial/registration/speaker/session/run-of-show/approval/readiness rollups.
- Current question-context API is `POST /api/events/{eventId}/ai-workspace/question-context`; it reuses attention and adds supported session retrieval.

**Safe questions and operations**

Ready for event metadata lookup, counts, deterministic health/readiness summaries, supported finding filters, and event-local date summaries. “What should I do?” or causal/narrative health explanations require explicit deterministic policies or future model reasoning and must not be fabricated.

**Source route**: `/events/{eventId}`, `/events/{eventId}/ai-workspace`, and `/events/{eventId}/command-center`.

**Readiness**: **Ready for the existing deterministic checks; partial for overall event health.**

## Cross-cutting authorization and source-link rules

The canonical authorization helper is `resolveEventAccessForUser`/`assertEventAccessForUser` in `web/lib/event-access.ts`. It verifies UUID shape, event existence, active organization, membership, and role. API routes generally resolve the request user first and convert access/service errors to safe 401/403/404 responses. A future question retrieval route must authorize before querying any event child records and must pass the same authorized user through the service boundary.

The current attention source reference is `{ entityType, entityId, label, field?, value? }`; the question-context projection adds a route only when it matches an established event-scoped destination. Current safe examples are matrix session routes, speaker routes, budget/docs/timeline UI surfaces, and event-level AI Workspace/command-center surfaces. If no established route exists, return a label without a guessed link.

## Current deterministic question-context coverage

`event-question-context.ts` currently supports the original focus/risk/missing/deadline/warning intents plus session F&B, session readiness, and direct session lookup. It returns bounded `attentionFindings`, `sessions`, selected `sources`, factual counts, limitations, `insufficientData`, and event-local temporal context. It performs no writes, model calls, or external requests.

The service must remain a retrieval/context builder. Classification should remain an explicit deterministic pattern map, not a general NLP classifier. Each new domain should add a typed projection and pure selection tests before it is exposed through the API or UI.

## Recommended deterministic expansion order

1. Timeline/roadmap and task/deadline projections, reusing `timeline-dashboard.ts`, `tasks.ts`, and event-local date boundaries.
2. Workflow-specific approvals and budget totals, keeping document, budget, and speaker approval states separate.
3. Speaker readiness/conflicts and explicit session AV/room assignment data.
4. Directory/vendor/staff assignment summaries and explicit onsite statuses.
5. Room-set, signage, partner-contract, and unrestricted document-content capabilities only after a canonical persisted source and safe route exist.

