# Project Context

## Current Product

Planner OS / Planner Dash is an event planning operating system for multi-client, multi-event operations. The current app is a Next.js App Router application backed by Prisma/PostgreSQL with event-scoped modules for Run of Show, budgets, documents, speakers, F&B catalog, timeline, room set, and seating.

## Current Architecture

- Frontend shell: `web/app/(shell)/*`
- Event workspace: `web/app/(shell)/events/[eventId]/*`
- API routes: `web/app/api/**/route.ts`
- Primary ORM/schema: Prisma with schema copies at `prisma/schema.prisma` and `web/prisma/schema.prisma`
- Core server/service code lives under `web/lib/*` and `web/src/server/services/*`
- Binary storage for documents and speaker files uses Cloudflare R2 through S3-compatible APIs

The global shell navigation is intentionally small: Dashboard, Events, Reports, Settings. Event-specific modules live inside the event workspace navigation.

## Current Tenancy And Access

Tenancy follows Organization -> optional Client -> Event.

Current implemented access behavior:

- `User.orgId` and `Membership` establish organization context.
- `EventMember(eventId, userId, eventRole)` controls event visibility for normal MEMBER/VIEWER users.
- `SUPER_ADMIN` is platform-wide and can use Platform Admin account context switching.
- `OWNER` and `ADMIN` can list and edit events in their active organization.
- `MEMBER` and `VIEWER` need EventMember rows to see events.
- `EVENT_VIEWER` is read-only when guarded routes/services call `assertEventAccessForUser(..., "write")`.

Important limitation: server-side access enforcement is broadening but not universal across every historical event-scoped route. Matrix 2 snapshot reads, Matrix speaker assignment writes, seating read/assign/unassign, speakers services, budget services, docs review flows, timeline services, and Platform Admin routes have server-side access checks. Some Matrix 2 session, requirement, and F&B assignment routes are not yet uniformly wrapped.

## Current Modules

### Events

Events are organization-scoped and can optionally belong to a client. Creating an event creates the creator's EventMember record and initializes event timeline/session requirement defaults.

### Run Of Show / Matrix 2

Matrix 2 is the active Run of Show command center.

Implemented behavior:

- Board/List views are backed by MatrixRow sessions.
- Board cards support drag/drop scheduling and expose a compact quick action launcher.
- Quick launcher actions include Basics, Speakers, AV, F&B, Staffing, Room Set, Seating, Conflicts, and full workspace.
- Session Quick Change drawer is status-first and fast.
- Basic drawer fields: title, session type, room, start, end.
- Status cards: Speakers, AV, F&B, Staffing, Room Set, Seating.
- Speakers, AV, F&B, and Staffing cards open one compact bottom quick-edit panel at a time.
- Quick panels provide search, selected/assigned items, available canonical items, add/remove controls, and empty states.
- Speakers use event Speaker records and SessionSpeakerAssignment.
- AV/F&B/Staffing requirement choices use SessionRequirementTemplate/Section/Item/Selection.
- F&B catalog/menu assignment uses EventFnbCatalogItem and SessionFnbCatalogAssignment.
- Staffing can use EventPerson and SessionStaffAssignment.
- Room Set and Seating cards are workflow links, not inline quick editors.

Compatibility behavior:

- Legacy Matrix row routes and exports still exist.
- Full session workspace route remains available at `/events/:eventId/matrix/sessions/:sessionId`.

### Room Set And Seating

Room Set is the rich workspace for session-level layout work.

Implemented behavior:

- Route: `/events/:eventId/matrix/sessions/:sessionId/room-set?mode=layout|seating`
- Layout mode supports room layout planning/editing workflows.
- Seating mode is embedded in the Room Set workspace and is session-scoped.
- Seating can load/create a SeatingPlan for a MatrixRow.
- Seating assignment can be scoped by `matrixRowId` / `seatingPlanId` and supports exact chair assignment through `seatIndex`.

### Budget

Implemented behavior includes budget line items, submissions, approval/rejection/revision, reporting, import/export, budget files, and activity-oriented service code. F&B catalog assignments can sync to budget line items.

### Docs Hub

Implemented behavior includes document create/list/update, presign/finalize upload, versioning, review submit/pull-back, approve/reject/reopen, categories, download, and link options. Local document upload is disabled; R2-backed upload is the active path.

### Speakers

Implemented behavior includes:

- Event-scoped speaker directory
- Speaker create/edit/delete APIs
- Matrix session speaker assignment
- Speaker conflicts/readiness/onsite data
- Speaker files and document requests
- Speaker-facing messages and internal notes
- Speaker email history/reminders
- Speaker intake and speaker portal flows
- Read-only planner portal preview

Speaker portal routes are token-scoped and should not use planner session auth as their authorization source.

### F&B Catalog

Implemented behavior includes event-scoped source menus, parsed catalog items, parser feedback, catalog item CRUD, session catalog assignments, and budget sync for assigned items.

### Timeline

Timeline item and dependency services are implemented and event-scoped. Timeline status values are NOT_STARTED, IN_PROGRESS, AT_RISK, COMPLETE.

The Timeline module is an event roadmap with four views — Dashboard (default), Timeline (Gantt), Board, and List — all reading the same canonical event-scoped `TimelineItem`/`TimelineDependency` data. The internal add/edit flow creates `TimelineItem` records only and is independent of the separate Task system. Workstreams (VENUE, HOUSING, REGISTRATION, SPEAKERS, SPONSORS, FNB, PRODUCTION, MARKETING) are the top-level categories and planning stages (PRE_PLANNING, PLANNING, BUILD, SHOW_WEEK, CLOSE) are the subcategories; the Dashboard rollups, blockers, and a simple explainable health score are derived server-side in `web/src/server/services/timeline-dashboard.ts` and served at `GET /api/events/:eventId/timeline-dashboard`. User-facing "Task" copy in this module is now "Timeline Item"/"Item."

Schema note (in-code, migration pending apply): `TimelineItem` gained additive `workstream` (`TimelineWorkstream?`), `planningStage` (`TimelinePlanningStage?`), and `isCriticalPath` (`Boolean @default(false)`) fields, plus the two new enums. Migration `web/prisma/migrations/20260617120000_add_timeline_dashboard_taxonomy` is created but not yet applied to the database.

## Current Canonical Models

- Account/access: Organization, Membership, User, EventMember
- Events: Event, EventActivity
- Run of Show: Room, MatrixRow
- Session requirements: SessionRequirementTemplate, SessionRequirementSection, SessionRequirementItem, SessionRequirementSelection
- Session assignments: SessionSpeakerAssignment, SessionAVRequirement, SessionFoodService, SessionFnbCatalogAssignment, SessionStaffAssignment, EventPerson
- Speakers: Speaker plus portal, file, document, message, note, email, readiness, onsite, and submission models
- F&B catalog: EventFnbCatalogItem, EventFnbSourceMenu, FnbParserFeedback
- Room Set / Seating: SeatingPlan, SeatingTable, SeatingAttendee, SeatingAssignment
- Budget: Budget, BudgetVersion, BudgetLineItem, BudgetApproval, BudgetActivity, BudgetSubmission, BudgetSubmissionRecipient, BudgetSubmissionLineItem
- Docs: Document, DocumentVersion, DocumentApproval, DocumentApprovalRecipient, DocumentCategory, DocumentTag, DocumentTagOnDocument, DocumentLink
- Timeline: TimelineItem, TimelineDependency

## Schema Guardrail

The schema is controlled. Do not change Prisma schema files, migrations, generated client expectations, or relational model semantics without a proposal and migration review.

Every schema change requires:

- Clear rationale
- Migration plan
- Data/backfill review
- Rollback/remediation notes
- Tests
- Generated Prisma client updates

This guardrail applies even when a UI change appears small. If the requested behavior cannot be implemented with existing models, stop and explain the required schema change first.

## Current Roadmap / Not Current State

These are not to be documented as current implementation:

- Universal event-access guard coverage for every historical route
- Full retirement of legacy Matrix surfaces
- New schema-backed module concepts without reviewed migrations
- External queue/worker infrastructure not present in the repository
- Hosted Supabase/RLS policy details not verified from source

## Documentation Maintenance Rule

When updating project docs, separate implemented behavior from planned behavior. Prefer concrete source-backed statements over aspirational architecture. Do not describe future workflow proposals as shipped features.
