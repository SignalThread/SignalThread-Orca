# Tasking Phase 2 Schema Proposal

Proposal only. Do not change Prisma from this document.

This document locks the Phase 2A schema plan for schema review before implementation. Phase 2A is limited to manual event tasks, object-linked manual tasks, assignment, comments, task activity, passive watchers, Event > Work list support, later object task strip/drawer support, and server-side access enforcement.

Phase 2A explicitly excludes approval-generated tasks, deadline-generated tasks, timeline at-risk reconciliation, Matrix/Seating/Speaker system-generated tasks, client-facing or speaker-facing tasks, reminder delivery infrastructure, notification engine work, templates, and task dependencies.

## 1. Source-Of-Truth Boundary

Task records own only task-layer state:
- Task title and description.
- Independent task status.
- Priority.
- Due date.
- Internal visibility.
- Task assignment.
- Passive watchers.
- Task comments.
- Task activity.
- Typed object links.

Module records remain authoritative for module truth:
- Budget approval/submission status.
- Document review/version status.
- Deadline status.
- Timeline status, progress, and dependencies.
- Matrix session details and requirement state.
- Seating plan/table/assignment state.
- Speaker profile, readiness, file review, document request, message, note, reminder, and email-log state.
- Notification unread/read and delivery state.

Task completion must not approve budgets, approve documents, mark deadlines done, mutate timeline status, change Matrix/session readiness, seat attendees, finalize speaker files, approve speaker submissions, send reminders, or mark notifications read. Any future source action must call the owning module service directly.

## 2. Locked Phase 2A Decisions

| Decision | Phase 2A lock |
| --- | --- |
| `TaskStatus` | `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELED` |
| `TaskPriority` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `TaskType` | `EVENT`, `OBJECT_LINKED` |
| `TaskSource` | `MANUAL` only |
| `TaskVisibility` | `INTERNAL` only |
| `TaskWatcher` | Included in Phase 2A as passive watcher rows for core UX. No delivery engine. |
| `TaskReminder` | Deferred. No Phase 2A table, enum values, service, route, or delivery work. |
| `TaskDependency` | Explicitly deferred. No Phase 2A table. |
| `TaskTemplate` | Deferred. No Phase 2A table. |
| Object linking | Use `TaskLink(objectType, objectId)` with strict service validation. No JSON blobs for core links. |
| Generated/reconciled tasks | Deferred to Phase 2B. No `sourceKey`, generated unique key, generated activity type, reconciliation job, or backfill in Phase 2A. |

## 3. Final Phase 2A Models

```prisma
model Task {
  id                String         @id @default(uuid()) @db.Uuid
  orgId             String         @db.Uuid
  eventId           String         @db.Uuid
  clientId          String?        @db.Uuid
  title             String         @db.Text
  description       String?        @db.Text
  status            TaskStatus     @default(OPEN)
  priority          TaskPriority   @default(MEDIUM)
  type              TaskType       @default(EVENT)
  source            TaskSource     @default(MANUAL)
  visibility        TaskVisibility @default(INTERNAL)
  dueAt             DateTime?
  createdByUserId   String         @db.Uuid
  completedAt       DateTime?
  completedByUserId String?        @db.Uuid
  canceledAt        DateTime?
  canceledByUserId  String?        @db.Uuid
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt

  assignments       TaskAssignment[]
  links             TaskLink[]
  comments          TaskComment[]
  activity          TaskActivity[]
  watchers          TaskWatcher[]

  @@index([orgId, eventId, status, dueAt])
  @@index([orgId, eventId, type, status])
  @@index([orgId, eventId, updatedAt])
  @@index([orgId, clientId, status, dueAt])
  @@index([createdByUserId])
  @@index([completedByUserId])
}

model TaskAssignment {
  taskId           String             @db.Uuid
  userId           String             @db.Uuid
  role             TaskAssignmentRole @default(OWNER)
  assignedByUserId String?            @db.Uuid
  createdAt        DateTime           @default(now())

  @@id([taskId, userId])
  @@index([userId, createdAt])
  @@index([taskId, role])
}

model TaskLink {
  id            String             @id @default(uuid()) @db.Uuid
  taskId        String             @db.Uuid
  objectType    TaskLinkObjectType
  objectId      String             @db.Uuid
  labelSnapshot String?            @db.Text
  createdAt     DateTime           @default(now())

  @@unique([taskId, objectType, objectId])
  @@index([objectType, objectId])
  @@index([taskId])
}

model TaskComment {
  id           String    @id @default(uuid()) @db.Uuid
  taskId       String    @db.Uuid
  authorUserId String    @db.Uuid
  body         String    @db.Text
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  @@index([taskId, createdAt])
  @@index([authorUserId, createdAt])
}

model TaskActivity {
  id          String           @id @default(uuid()) @db.Uuid
  taskId      String           @db.Uuid
  actorUserId String?          @db.Uuid
  type        TaskActivityType
  message     String           @db.Text
  createdAt   DateTime         @default(now())

  @@index([taskId, createdAt])
  @@index([actorUserId, createdAt])
}

model TaskWatcher {
  taskId    String   @db.Uuid
  userId    String   @db.Uuid
  createdAt DateTime @default(now())

  @@id([taskId, userId])
  @@index([userId, createdAt])
}
```

Implementation should add normal Prisma relations from task child models to `Task`, and from task actor/user fields to `User` where consistent with the active schema style. `Task.orgId`, `Task.eventId`, and optional `Task.clientId` should relate to `Organization`, `Event`, and optional `Client` if those relations match the active Prisma schema conventions.

## 4. Final Phase 2A Enums

```prisma
enum TaskStatus {
  OPEN
  IN_PROGRESS
  BLOCKED
  DONE
  CANCELED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum TaskType {
  EVENT
  OBJECT_LINKED
}

enum TaskSource {
  MANUAL
}

enum TaskVisibility {
  INTERNAL
}

enum TaskAssignmentRole {
  OWNER
  CONTRIBUTOR
}

enum TaskLinkObjectType {
  EVENT
  BUDGET
  BUDGET_LINE_ITEM
  BUDGET_SUBMISSION
  DOCUMENT
  DOCUMENT_VERSION
  DEADLINE
  TIMELINE_ITEM
  MATRIX_ROW
  SESSION_REQUIREMENT_SELECTION
  SESSION_FNB_CATALOG_ASSIGNMENT
  SEATING_PLAN
  SEATING_TABLE
  SEATING_ASSIGNMENT
  SPEAKER
  SPEAKER_PROFILE_SUBMISSION
  SPEAKER_DOCUMENT_REQUEST
  SPEAKER_FILE
}

enum TaskActivityType {
  CREATED
  UPDATED
  STATUS_CHANGED
  ASSIGNED
  UNASSIGNED
  COMMENTED
  LINKED
  UNLINKED
  WATCHED
  UNWATCHED
}
```

Phase 2A intentionally does not define `GENERATED`, `RECONCILED`, `CLIENT`, `SPEAKER`, `REMINDER_SET`, `REMINDER_SENT`, or dependency enum values.

## 5. Required Indexes And Constraints

Required task indexes:
- `Task(orgId, eventId, status, dueAt)` for Event > Work filtering and due-date queues.
- `Task(orgId, eventId, type, status)` for event tasks versus object-linked tasks.
- `Task(orgId, eventId, updatedAt)` for recent work/activity ordering.
- `Task(orgId, clientId, status, dueAt)` for scoped event/client access and future client-aware work surfaces.
- `Task(createdByUserId)` for creator audits.
- `Task(completedByUserId)` for completion audits.

Required child indexes and constraints:
- `TaskAssignment` primary key on `(taskId, userId)`.
- `TaskAssignment(userId, createdAt)` for assignee queues.
- `TaskAssignment(taskId, role)` for owner lookup.
- `TaskLink` unique constraint on `(taskId, objectType, objectId)`.
- `TaskLink(objectType, objectId)` for object task strips/drawers.
- `TaskLink(taskId)` for task detail loading.
- `TaskComment(taskId, createdAt)` for ordered comments.
- `TaskComment(authorUserId, createdAt)` for audits.
- `TaskActivity(taskId, createdAt)` for ordered activity.
- `TaskActivity(actorUserId, createdAt)` for audits.
- `TaskWatcher` primary key on `(taskId, userId)`.
- `TaskWatcher(userId, createdAt)` for watched-task lists.

No Phase 2A unique constraint is required for generated idempotency because Phase 2A has no generated or reconciled tasks. Phase 2B should add a generated source key and a uniqueness strategy after reconciliation behavior is reviewed.

Service-level invariants required because Prisma cannot express them cleanly:
- `Task.type = EVENT` must not require a `TaskLink`.
- `Task.type = OBJECT_LINKED` must be created with at least one valid `TaskLink`.
- `Task.source` must remain `MANUAL` in Phase 2A.
- `Task.visibility` must remain `INTERNAL` in Phase 2A.
- `TaskLink.objectId` must resolve to an object in the same `orgId`, `eventId`, and optional `clientId` scope as the task.

## 6. Object Linking Design

Use `TaskLink(objectType, objectId)` plus strict server-side validation. Do not use JSON blobs for core links.

Validation registry contract:
- Input: `{ objectType, objectId, orgId, eventId, clientId? }`.
- Output: `{ objectType, objectId, eventId, orgId, clientId?, labelSnapshot }`.
- Behavior: throw if the object does not exist, is outside the task event, is outside the task org, or conflicts with the task client scope.

Required Phase 2A validators:
- `EVENT`: validate `Event.id`, `Event.orgId`, and optional client scope.
- `BUDGET`, `BUDGET_LINE_ITEM`, `BUDGET_SUBMISSION`: validate through budget ownership for the same event.
- `DOCUMENT`, `DOCUMENT_VERSION`: validate through document event/org ownership.
- `DEADLINE`: validate deadline event ownership.
- `TIMELINE_ITEM`: validate timeline item event ownership.
- `MATRIX_ROW`, `SESSION_REQUIREMENT_SELECTION`, `SESSION_FNB_CATALOG_ASSIGNMENT`: validate through Matrix row/event ownership.
- `SEATING_PLAN`, `SEATING_TABLE`, `SEATING_ASSIGNMENT`: validate seating plan/table/assignment ownership for the same event.
- `SPEAKER`, `SPEAKER_PROFILE_SUBMISSION`, `SPEAKER_DOCUMENT_REQUEST`, `SPEAKER_FILE`: validate speaker object event ownership and nested speaker ownership where applicable.

Validation should live in a task service registry and may call module-owned lookup helpers. It must not mutate linked module records.

## 7. Required Access Rules

Reads:
- Require authenticated user context.
- Require event read access through the existing event access pattern.
- Filter every task query by `orgId` and `eventId`; include `clientId` where available.
- Return only `Task.visibility = INTERNAL` records in Phase 2A.

Writes:
- Require authenticated user context.
- Require event edit access unless a future permission matrix creates narrower task capabilities.
- Create/update/delete comments, assignments, watchers, and links only after resolving the parent task by `orgId`, `eventId`, and access scope.
- Validate assignees and watchers as users who belong to the org and can view the event.
- Validate every `TaskLink` through the object-link registry before write.
- Reject client-facing or speaker-facing visibility values; Phase 2A is internal only.

Non-mutation rules:
- Updating task status to `DONE` or `CANCELED` must not mutate any linked module record.
- Comments and task activity are task-layer records only.
- Watchers are passive rows only and must not create notifications in Phase 2A.

## 8. Required Tests Before Merge

Schema/migration checks:
- Migration applies cleanly to the active app schema.
- Prisma client generation succeeds.
- No root schema parity change unless maintainers explicitly confirm it is required.

Service tests:
- Manual event task CRUD.
- Object-linked manual task creation with at least one valid link.
- Assignment validation and duplicate-assignment prevention.
- Passive watcher validation and duplicate-watcher prevention.
- Comment create/update/soft-delete behavior.
- Activity rows for create, update, status change, assignment, comment, link, and watcher events.
- Object-link validation for every Phase 2A `TaskLinkObjectType`.

Access tests:
- Event read/write scoping for owner/admin/member/viewer roles.
- Cross-org and cross-event task reads are rejected.
- Cross-org and cross-event `TaskLink` writes are rejected.
- Actor spoofing is rejected; actor ids come from authenticated user context.
- Assignee and watcher users outside the org/event scope are rejected.

Non-mutation regression tests:
- Completing a linked task does not call or alter `decideBudgetSubmission`.
- Completing a linked task does not call or alter `approveDocument`/`rejectDocument`.
- Completing a linked task does not call or alter `updateTimelineItem`.
- Completing a linked task does not call or alter `updateMatrixRow`.
- Completing a linked task does not call or alter `assignAttendeeToTable`.
- Completing a linked task does not call or alter `reviewSpeakerFile`.
- Completing a linked task does not call or alter `approveSpeakerSubmission`.

UI tests for Phase 2A implementation:
- Event > Work list loads internal tasks for the current event only.
- Event > Work filters by status, priority, assignee, due date, and object-linked/event task type.
- Task drawer supports assignment, comments, activity, and passive watchers.
- Object task strip/drawer support may be implemented after the Event > Work list but must use `TaskLink(objectType, objectId)`.

Deferred test suites:
- Generated reconciliation idempotency tests.
- Reminder delivery tests.
- Notification engine tests.
- Client-facing and speaker-facing task visibility tests.
- Dependency ordering tests.

## 9. Tables Intentionally Deferred

Do not add these in Phase 2A:
- `TaskReminder`.
- `TaskDependency`.
- `TaskTemplate`.
- Generated task source tables or reconciliation state tables.
- Notification delivery tables for task events.
- Client-facing or speaker-facing task tables.

Do not add these Phase 2B fields in Phase 2A:
- `Task.sourceKey`.
- Generated/reconciled source enums.
- Generated idempotency unique constraints.
- Generated/reconciled task activity enum values.
- Reminder scheduling/delivery fields.

## 10. Phase 2B Notes, Not Phase 2A

Generated task candidates must each define an idempotency key before implementation:
- Budget approval review: `source=BUDGET_SUBMISSION_REVIEW:budgetSubmissionId:userId`.
- Budget revision after rejection: `source=BUDGET_SUBMISSION_REVISION:budgetSubmissionId:submittedByUserId`.
- Legacy budget approval event: `source=BUDGET_APPROVAL:budgetApprovalId` if generated from `BudgetApproval`.
- Budget support missing: `source=BUDGET_LINE_SUPPORT_MISSING:budgetLineItemId`.
- Budget variance: `source=BUDGET_LINE_VARIANCE:budgetLineItemId:varianceBand`.
- Document review recipient: `source=DOCUMENT_REVIEW:documentApprovalId:userId`.
- Document version review: `source=DOCUMENT_VERSION_REVIEW:documentId:versionNumber:userId`.
- Deadline overdue/blocked: `source=DEADLINE_ISSUE:deadlineId:OVERDUE|BLOCKED`.
- Timeline at risk: `source=TIMELINE_ISSUE:timelineItemId:AT_RISK|OVERDUE|BLOCKED_DEPENDENCY`.
- Matrix missing room/setup: `source=MATRIX_SESSION_ISSUE:matrixRowId:MISSING_ROOM|MISSING_SETUP|CAPACITY`.
- Matrix requirement missing: `source=MATRIX_REQUIREMENT_ISSUE:matrixRowId:requirementItemId`.
- Matrix conflict: `source=MATRIX_CONFLICT:matrixRowId:conflictType:conflictHash`.
- Seating missing/incomplete: `source=SEATING_ISSUE:seatingPlanId|matrixRowId:MISSING_PLAN|INCOMPLETE_ASSIGNMENTS|CAPACITY`.
- Speaker profile submission review: `source=SPEAKER_PROFILE_SUBMISSION:submissionId`.
- Speaker readiness flag: `source=SPEAKER_READINESS:speakerId:flag`.
- Speaker document request: `source=SPEAKER_DOCUMENT_REQUEST:requestId`.
- Speaker file review: `source=SPEAKER_FILE_REVIEW:fileId:reviewStatus`.
- Speaker reminder candidate: do not create a task from email delivery alone; if needed, `source=SPEAKER_REMINDER:speakerId:kind:reasonHash`.

Phase 2B must decide whether resolved generated tasks close as `DONE` or `CANCELED`, and whether recurring source conditions reopen the same task or create a sequenced task. Recommended default: reopen the same generated task for deterministic queues.

## 11. Migration Plan

Phase 2A schema/migration implementation:
- Modify only the active Prisma app schema after approval.
- Add the Phase 2A enums and six Phase 2A task tables.
- Add the required indexes and constraints in this document.
- Generate Prisma client.
- Do not add generated task fields.
- Do not add reminder, dependency, template, notification, client-facing, or speaker-facing task tables.
- Do not backfill tasks.

Phase 2B migration:
- Add generated/reconciled source enum values.
- Add `Task.sourceKey` or equivalent generated source identity.
- Add generated idempotency uniqueness.
- Add reconciliation metadata only after generated behavior is reviewed.

## 12. Risk Review

Biggest product risk: users may think completing a task completes the underlying approval/review/session/seating work. Mitigate with service non-mutation tests and UX copy that keeps module authority explicit.

Biggest data risk: unsafe polymorphic links. Mitigate with `TaskLink(objectType, objectId)`, a strict validation registry, unique link constraints, and object-type coverage tests. Do not use JSON for core links.

Biggest migration risk: editing the wrong Prisma schema or adding Phase 2B fields too early. Mitigate by confirming the active schema target before migration and keeping Phase 2A to the six locked tables.

Biggest access risk: copying older unguarded route/service patterns. Mitigate by requiring user context in task service methods, filtering by `orgId` and `eventId`, and validating every link server-side.

Biggest test risk: shipping task status updates without proving they do not mutate module-owned records. Mitigate with explicit non-mutation regression tests before merge.

## 13. Schema Review Checklist Before Implementation

Reviewers should approve these decisions before any Prisma or migration work:
- Confirm `web/prisma/schema.prisma` is the implementation target and whether root `prisma/schema.prisma` needs parity or is legacy.
- Confirm the six Phase 2A models: `Task`, `TaskAssignment`, `TaskLink`, `TaskComment`, `TaskActivity`, `TaskWatcher`.
- Confirm Phase 2A includes passive `TaskWatcher` rows but excludes `TaskReminder`.
- Confirm `TaskDependency` and `TaskTemplate` are explicitly later.
- Confirm `TaskLink(objectType, objectId)` plus service validation is acceptable instead of nullable FK columns.
- Confirm no JSON blobs are used for core task links.
- Confirm Phase 2A has no generated/reconciled automation, source keys, unique generated keys, or backfill.
- Confirm task status is independent of module status.
- Confirm access validation will use the existing event access pattern and will not copy older unguarded route/service patterns from Matrix or Seating.
- Confirm tests will prove task completion cannot mutate Budget, Document, Timeline, Matrix, Seating, or Speaker canonical records.

## 14. Documentation-Only Compliance

This schema plan is documentation only. This pass changed no Prisma schema, migration, API route, service, or UI file.
