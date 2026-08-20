# Schema Guardrails

The database schema is **controlled**. Schema changes are allowed only when they are intentional, reviewed, migration-safe, and tested. Unreviewed or ad-hoc schema changes are not permitted.

## Locked-Schema Policy

No schema change may be made without:

- **Clear rationale**: why the change is needed and what current limitation it solves
- **Migration plan**: Prisma migration path, apply order, and environment considerations
- **Data / backfill review**: existing rows, nullability, defaults, cleanup, and backfill scripts
- **Rollback / remediation notes**: what to do if staging or production migration fails
- **Tests**: migration path, affected queries, API/service contracts, and UI paths where applicable
- **Generated Prisma client updates**: `prisma generate` run and committed with the migration

Documentation updates do not authorize schema changes. If a feature requires new tables, columns, enums, indexes, or relations, stop and write the proposal first.

## Tenancy And Access Scope

| Level | Scope Key | Current Use |
|---|---|---|
| Organization | `orgId` | Account/customer boundary; OWNER and ADMIN can list org events |
| Client | `clientId` | Optional event association |
| Event | `eventId` | Primary planning boundary for budgets, docs, Run of Show, speakers, F&B, seating, and timeline |
| Event membership | `EventMember(eventId, userId)` | Event visibility for MEMBER/VIEWER users |

Current event access behavior:

- `SUPER_ADMIN` can access events across organizations and can use Platform Admin account context switching.
- `OWNER` and `ADMIN` can list and edit events in their active organization.
- `MEMBER` and `VIEWER` require `EventMember` rows to see events.
- `EventMemberRole.EVENT_VIEWER` is read-only when a route/service uses `assertEventAccessForUser(..., "write")`.
- Route/service guard coverage is not yet universal across all historical event-scoped routes; do not document unguarded behavior as fully enforced.

## Core Models

**Account / access:** Organization, Membership, User, EventMember

**Events:** Event, EventActivity

**Budget:** Budget, BudgetVersion, BudgetLineItem, BudgetApproval, BudgetActivity, BudgetSubmission, BudgetSubmissionRecipient, BudgetSubmissionLineItem

**Documents:** Document, DocumentVersion, DocumentApproval, DocumentApprovalRecipient, DocumentCategory, DocumentTag, DocumentTagOnDocument, DocumentLink

**Timeline:** TimelineItem, TimelineDependency

**Run of Show / Matrix Operations:** Room, MatrixRow, SessionRequirementTemplate, SessionRequirementSection, SessionRequirementItem, SessionRequirementSelection

**Session module assignments:** SessionSpeakerAssignment, SessionAVRequirement, SessionFoodService, SessionFnbCatalogAssignment, SessionStaffAssignment, EventPerson

**Speakers:** Speaker, SpeakerIntakeToken, SpeakerProfileSubmission, SpeakerReadinessItem, SpeakerFile, SpeakerMessage, SpeakerInternalNote, SpeakerOnsiteInfo, SpeakerEmailLog, SpeakerDocumentRequest

**F&B catalog:** EventFnbCatalogItem, EventFnbSourceMenu, FnbParserFeedback

**Room Set / Seating:** SeatingPlan, SeatingTable, SeatingAttendee, SeatingAssignment

**Legacy / compatibility:** Some legacy session and Matrix models remain present. Do not remove, repurpose, or backfill them without migration review.

## Current Implemented Relationships

- `MatrixRow` is the canonical Run of Show session row for Matrix 2.
- `Room` is event-scoped and links to `MatrixRow.roomId`.
- `SessionSpeakerAssignment` links canonical `Speaker` records to `MatrixRow` sessions.
- `EventPerson` and `SessionStaffAssignment` support event-scoped staffing/person assignment.
- `SessionRequirementTemplate`, sections, items, and selections represent canonical AV, F&B, Staffing, setup, and status requirement selections.
- `EventFnbCatalogItem` and `SessionFnbCatalogAssignment` represent canonical F&B/menu assignment and can link to budget line items.
- `SeatingPlan.matrixRowId` scopes seating plans to individual Run of Show sessions when used from Room Set / Seating mode.
- `SeatingAssignment` stores `eventId`, `tableId`, `attendeeId`, optional `seatingPlanId`, and optional `seatIndex` for session-scoped chair assignment.

## State Machines

State transitions must stay aligned with Prisma enum definitions and service code. Changing a state or transition is a schema-change proposal.

**Budget review:** Draft / submitted review / approved / rejected / revised flows are implemented through Budget, BudgetSubmission, BudgetApproval, and BudgetActivity service code.

**Document review:** Draft / review submitted / approved / rejected / reopened flows are implemented through Document, DocumentVersion, DocumentApproval, and DocumentApprovalRecipient service code.

**Timeline item:** NOT_STARTED, IN_PROGRESS, AT_RISK, COMPLETE.

**Speaker status:** NEEDS_INFO, INVITED, CONFIRMED, CANCELLED.

## Engineering Rules

- No JSON blobs for core relational entities when a normalized model exists or is warranted.
- Do not duplicate canonical module data into local UI-only state that can drift from persisted records.
- All approval actions must create activity/audit records where the domain supports them.
- Event-scoped writes must validate event access server-side.
- All foreign keys must reference UUID columns.
- Keep both Prisma schema copies in sync when schema changes are intentionally reviewed.
- Schema migrations must include tests and generated Prisma client updates.

## Current Roadmap / Not Current State

- Universal event-access wrapping for every historical event-scoped route is still a hardening task.
- Further Run of Show consolidation may retire older Matrix surfaces later, but current docs must describe both active Matrix 2 behavior and compatibility routes accurately.
- Any new workflow requiring schema support must start with a proposal, not an implementation patch.
