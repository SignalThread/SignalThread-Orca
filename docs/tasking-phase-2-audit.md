# Planner Dash Phase 2 Tasking Audit

## 1. Executive Summary

Planner Dash already contains a large amount of real, module-native work state. Budget approvals, document reviews, timeline items, deadlines, Run of Show sessions, seating assignments, speaker readiness, speaker document requests, speaker files, comments/messages/notes, activity logs, notifications, and dashboard work signals all exist today. The right Phase 2 tasking layer should link to those records and expose shared work queues without replacing the module records that own status, approval, review, and operational truth.

Recommendation: build Phase 2A as manual event tasks plus object-linked manual tasks with comments, activity, passive watchers, and server-side event/org scoping. Do not generate tasks, add reminder delivery, or build notification engine work yet. Build Phase 2B as reconciliation jobs that create and resolve generated tasks from approval, deadline, timeline, Matrix, Seating, and Speaker signals using stable idempotency keys.

Hard boundary: task completion must not approve budgets, approve documents, finalize speaker files, mutate timeline status, seat attendees, or update Matrix/session readiness unless a future service explicitly routes that action through the owning module's canonical service.

Documentation-only compliance: this pass creates documentation only. It does not modify `web/prisma/schema.prisma`, root `prisma/schema.prisma`, any `web/prisma/migrations/*` migration, any `web/app/api/*` route, any `web/src/server/services/*` or `web/lib/*` service/helper, or any `web/app/*` or `web/components/*` UI file.

## 2. Existing Actionable Records By Module

| Module | Existing actionable source | Classification | Exact inspected paths and names |
| --- | --- | --- | --- |
| Budget approvals/submissions | `BudgetSubmission`, `BudgetSubmissionRecipient`, `BudgetLineItem.approval`, `BudgetApproval`, `BudgetActivity` | Generated/reconciled task support for submissions; derived signal only for line variance/missing docs | `web/prisma/schema.prisma` models `Budget`, `BudgetLineItem`, `BudgetSubmission`, `BudgetSubmissionRecipient`, `BudgetActivity`, `BudgetVersion`, `BudgetApproval`; `web/src/server/services/budget.ts` functions `createBudgetSubmission`, `decideBudgetSubmission`, `pullBackBudgetSubmission`, `transitionBudget`, `buildBudgetDashboardModel`, `getBudgetDashboard`; routes under `web/app/api/events/[eventId]/budget/*`; auth helper `requireBudgetRouteAccess` |
| Document review/versioning | `Document.status`, `DocumentVersion`, `DocumentApproval`, `DocumentApprovalRecipient`, `DocumentLink` | Generated/reconciled task support for review recipients; object-linked support for links | `web/prisma/schema.prisma` models `Document`, `DocumentVersion`, `DocumentApproval`, `DocumentApprovalRecipient`, `DocumentLink`; `web/src/server/services/documents.ts` functions `submitDocumentForReview`, `approveDocument`, `rejectDocument`, `pullBackDocumentReview`, `reopenDocument`, `updateDocumentStatus`, `replaceDocumentLinks`, `resolveLinkTargets`, `listDocumentLinkOptions`, `createSubmitReviewNotifications`; routes under `web/app/api/events/[eventId]/documents/*` |
| Deadlines | `Deadline.status`, `Deadline.ownerUserId`, `Deadline.dueAt`, dependency to another deadline | Object-linked manual support now; generated/reconciled support later for overdue/blocked | `web/prisma/schema.prisma` model `Deadline`; `web/src/server/services/command-center-dashboard.ts` function `getCommandCenterDashboardData`; `web/app/(shell)/dashboard/action-center/page.tsx` deadline queue construction; `web/src/server/services/documents.ts` `listDocumentLinkOptions` and `resolveLinkTargets` |
| Timeline | `TimelineItem.status`, `priority`, `ownerUserId`, `startDate`, `endDate`, `TimelineDependency` | Manual task support today; generated/reconciled support later for at-risk/blocker projections | `web/prisma/schema.prisma` models `TimelineItem`, `TimelineDependency`; `web/src/server/services/timeline.ts` functions `listTimelineItems`, `createTimelineItem`, `updateTimelineItem`, `deleteTimelineItem`, `createTimelineDependency`, `deleteTimelineDependency`, `assertTimelineEventAccess`; routes `web/app/api/events/[eventId]/timeline-items/*`, `web/app/api/events/[eventId]/timeline-dependencies/route.ts`; UI `web/app/(shell)/timeline/_components/TimelineListView.tsx` |
| Run of Show / Matrix | `MatrixRow` session record, rooms, speakers/staff, requirements, F&B assignments, budget links, readiness derivatives | Object-linked manual support; derived signal only for readiness/conflicts until reconciled in Phase 2B | `web/prisma/schema.prisma` models `MatrixRow`, `SessionRequirementSelection`, `SessionFnbCatalogAssignment`, `SessionSpeakerAssignment`, `SessionStaffAssignment`; `web/lib/matrix.ts` functions `listMatrixRows`, `createMatrixRow`, `updateMatrixRow`, `duplicateMatrixRow`, `deleteMatrixRow`; `web/lib/matrix2.ts` functions `getMatrix2Snapshot`, `listMatrix2People`, `createMatrix2Person`; `web/lib/session-readiness.ts` functions `deriveSessionModuleReadiness`, `deriveRoomSetReadiness`, `deriveSeatingReadiness`, `deriveConflictsReadiness`; Matrix 2 routes under `web/app/api/events/[eventId]/matrix-2/*` |
| Seating | `SeatingPlan`, `SeatingTable`, `SeatingAttendee`, `SeatingAssignment` | Object-linked manual support; generated/reconciled support later for capacity/unassigned conflicts | `web/prisma/schema.prisma` models `SeatingPlan`, `SeatingTable`, `SeatingAttendee`, `SeatingAssignment`; `web/lib/seating.ts` functions `getSeatingSnapshot`, `createSeatingTable`, `createSeatingAttendee`, `updateSeatingTable`, `deleteSeatingTable`, `assignAttendeeToTable`, `unassignAttendee`, `ensureSeatingPlanForMatrixRow`; routes under `web/app/api/events/[eventId]/seating/*` |
| Speakers | `Speaker.status`, `SpeakerReadinessItem`, `SpeakerProfileSubmission`, `SpeakerDocumentRequest`, `SpeakerFile`, `SpeakerMessage`, `SpeakerInternalNote`, `SpeakerEmailLog` | Generated/reconciled support for readiness/doc/file issues; object-linked manual support for speaker/file/request/session; derived signal only for readiness rollups | `web/prisma/schema.prisma` speaker models; `web/src/server/services/speaker-readiness.ts` `computeSpeakerReadinessFlags`, `getSpeakerReadinessOverview`; `web/src/server/services/speaker-submissions.ts` `listPendingSpeakerSubmissions`, `approveSpeakerSubmission`, `rejectSpeakerSubmission`; `web/src/server/services/speaker-documents.ts` `createSpeakerDocumentRequest`, `submitPortalSpeakerDocument`, `linkSpeakerDocumentToDocsHub`; `web/src/server/services/speaker-files.ts` `finalizeAdminSpeakerFile`, `reviewSpeakerFile`; `web/src/server/services/speaker-comms.ts` `createSpeakerMessage`, `createSpeakerInternalNote`, `markSpeakerReminderSent`; `web/src/server/services/speaker-reminders.ts` `previewSpeakerReminders`, `sendSpeakerReminders`, `listSpeakerEmailLogs`; speaker routes under `web/app/api/events/[eventId]/speakers/*`, `speaker-readiness`, `speaker-reminders`, `speaker-submissions` |
| Activity | `BudgetActivity`, `EventActivity`, speaker derived activity timeline | Derived signal only | `web/prisma/schema.prisma` models `BudgetActivity`, `EventActivity`; `web/src/server/services/budget.ts` writes `BudgetActivity`; `web/src/server/services/speaker-comms.ts` `logSpeakerActivity`; `web/src/server/services/speaker-activity.ts` `getSpeakerActivityTimeline` |
| Notifications | `Notification` delivery records | Derived/delivery only | `web/prisma/schema.prisma` model `Notification`; `web/src/server/services/notifications.ts` `createNotification`, `listNotificationsForUser`, `getUnreadCount`, `markRead`; `web/app/(shell)/_components/notifications-bell.tsx` `NotificationsBell`; document/budget notification dispatchers |
| Dashboard / Command Center | Derived queues for deadlines, timeline risks, budget approvals/variance | Derived signal only | `web/src/server/services/command-center-dashboard.ts` `getCommandCenterDashboardData`; `web/app/(shell)/dashboard/page.tsx`; `web/app/(shell)/dashboard/action-center/page.tsx` |

## 3. Source Of Truth Per Module

- Budget approval truth remains `Budget.status`, `BudgetSubmission.status`, `BudgetApproval.status`, and `BudgetLineItem.approval`.
- Document review truth remains `Document.status`, `DocumentApproval.status`, `DocumentApprovalRecipient`, and `DocumentVersion`.
- Deadline truth remains `Deadline.status`, `dueAt`, `ownerUserId`, and `dependsOnDeadlineId`.
- Timeline truth remains `TimelineItem.status`, `priority`, `ownerUserId`, date fields, and `TimelineDependency`.
- Run of Show truth remains `MatrixRow` plus related requirement, speaker, staff, F&B, and room records.
- Seating truth remains `SeatingPlan`, `SeatingTable`, `SeatingAttendee`, and `SeatingAssignment`.
- Speaker truth remains `Speaker`, `SpeakerProfileSubmission`, `SpeakerReadinessItem`, `SpeakerDocumentRequest`, `SpeakerFile`, `SpeakerMessage`, `SpeakerInternalNote`, and `SpeakerEmailLog`.
- Activity and notifications are not task truth. They can display history and delivery state only.

## 4. Fields Already Present For Owner, Status, Due, Comment, Activity

Budget has status fields on `Budget`, `BudgetSubmission`, `BudgetApproval`, line-item approval, actor fields, submitted/approved/rejected timestamps, comments/reasons/messages, and `BudgetActivity`. It lacks a durable task assignee beyond submission recipients.

Docs has `Document.status`, `DocumentApproval.status`, `actedByUserId`, `actedAt`, `note`, `DocumentApprovalRecipient`, versions, tags, and typed links. It lacks task due dates and durable task comments.

Deadlines have `ownerUserId`, `status`, `dueAt`, description, category, and dependency. They are the closest current native work object but are date milestones, not a shared task/comment/watch surface.

Timeline items have `ownerUserId`, `status`, `priority`, `startDate`, `endDate`, `progress`, parent/child, and dependencies. The UI labels these as tasks in `TimelineListView`, but they remain timeline authority, not global task authority.

Matrix rows have session metadata, room, time, attendance, notes, requirements, speakers/staff, F&B assignments, and seating links. No owner/due/comment status fields exist on `MatrixRow`.

Seating has table capacity, attendee assignment, seat index, scoped seating plans, and session link through `matrixRowId`. It has no owner/status/comment fields.

Speakers have status, readiness items, submissions, document requests, file review status/feedback, messages, internal notes, reminders, email logs, and activity summaries. These are rich work sources but split by object type.

## 5. Routes, Services, Components, Functions Inspected

Budget:
- `web/src/server/services/budget.ts`: `assertBudgetAccessForEvent`, `getBudgetDashboard`, `buildBudgetDashboardModel`, `createBudgetSubmission`, `pullBackBudgetSubmission`, `decideBudgetSubmission`, `transitionBudget`, `submitBudget`, `approveBudget`, `rejectBudget`, `reviseBudget`, `dispatchBudgetSubmissionNotifications`.
- `web/app/api/events/[eventId]/budget/_lib/route-auth.ts`: `requireBudgetRouteAccess`.
- `web/app/api/events/[eventId]/budget/*`: approve/reject/revise/submit/submissions/dashboard/files/import/export/line-item routes.
- `web/app/(shell)/events/[eventId]/budget/page.tsx`; `web/app/(shell)/events/[eventId]/budget/_components/budget-dashboard.tsx`; `budget-view-switch.tsx`.

Documents:
- `web/src/server/services/documents.ts`: `getEventContextOrThrow`, `listEventReviewRecipients`, `resolveValidReviewRecipientIds`, `replaceDocumentLinks`, `resolveLinkTargets`, `createSubmitReviewNotifications`, `updateDocumentStatus`, `submitDocumentForReview`, `pullBackDocumentReview`, `approveDocument`, `rejectDocument`, `reopenDocument`, `listDocumentLinkOptions`.
- `web/app/api/events/[eventId]/documents/*`: document CRUD, upload, presign, finalize, download, review submit/pull-back, approve/reject/reopen, link options.
- `web/app/(shell)/events/[eventId]/docs/_components/event-docs-page.tsx`.

Timeline/deadlines:
- `web/src/server/services/timeline.ts`: `assertTimelineEventAccess`, `assertOwnerUserBelongsToEventContext`, `assertParentItemBelongsToEventContext`, `listTimelineItems`, `createTimelineItem`, `updateTimelineItem`, `deleteTimelineItem`, `createTimelineDependency`, `deleteTimelineDependency`.
- `web/app/api/events/[eventId]/timeline-items/route.ts`, `[itemId]/route.ts`, `timeline-dependencies/route.ts`.
- `web/app/(shell)/timeline/_components/TimelineListView.tsx`, `TimelineBoardView.tsx`, `TimelineGanttView.tsx`.
- `web/src/server/services/command-center-dashboard.ts` and `web/app/(shell)/dashboard/action-center/page.tsx` for deadline projections.

Matrix / Run of Show:
- `web/lib/matrix.ts`: `listMatrixRows`, `createMatrixRow`, `updateMatrixRow`, `duplicateMatrixRow`, `deleteMatrixRow`, `exportMatrixRowsCsv`.
- `web/lib/matrix2.ts`: `getMatrix2Snapshot`, `listMatrix2People`, `createMatrix2Person`.
- `web/lib/matrix2-session.ts`, `web/lib/session-requirements.ts`, `web/lib/session-readiness.ts`.
- `web/app/api/events/[eventId]/matrix-rows/*`; `web/app/api/events/[eventId]/matrix-2/*`.
- `web/app/(shell)/matrix-2/_components/Matrix2Board.tsx`, `Matrix2DetailsDrawer.tsx`, `MatrixConflictBadgeWithTooltip.tsx`, `operational-budget-requirement-rows.tsx`.

Seating / room setup:
- `web/lib/seating.ts`: `ensureSeatingPlanForMatrixRow`, `getSeatingSnapshot`, `createSeatingTable`, `createSeatingAttendee`, `updateSeatingTable`, `deleteSeatingTable`, `assignAttendeeToTable`, `unassignAttendee`.
- `web/app/api/events/[eventId]/seating/*`.
- Room set references in `web/lib/room-set/*` and session readiness `deriveRoomSetReadiness`.

Speakers:
- `web/src/server/services/speakers.ts`: `listSpeakers`, `createSpeaker`, `getSpeaker`, `updateSpeaker`, `deleteSpeaker`, `submitSpeakerPublicIntake`.
- `web/src/server/services/speaker-readiness.ts`: `computeSpeakerReadinessFlags`, `getSpeakerReadinessOverview`.
- `web/src/server/services/speaker-submissions.ts`: `listPendingSpeakerSubmissions`, `getSpeakerPendingSubmission`, `approveSpeakerSubmission`, `rejectSpeakerSubmission`.
- `web/src/server/services/speaker-documents.ts`: `listSpeakerDocumentRequests`, `createSpeakerDocumentRequest`, `linkSpeakerDocumentToDocsHub`, `listPortalSpeakerDocumentRequests`, `submitPortalSpeakerDocument`.
- `web/src/server/services/speaker-files.ts`: `listSpeakerFiles`, `finalizeAdminSpeakerFile`, `reviewSpeakerFile`, portal file functions.
- `web/src/server/services/speaker-comms.ts`: `logSpeakerActivity`, `markSpeakerReminderSent`, `listSpeakerMessages`, `createSpeakerMessage`, `listSpeakerInternalNotes`, `createSpeakerInternalNote`.
- `web/src/server/services/speaker-reminders.ts`: `previewSpeakerReminders`, `sendSpeakerReminders`, `listSpeakerEmailLogs`.
- `web/src/server/services/speaker-activity.ts`: `getSpeakerActivityTimeline`.
- Speaker admin and public routes under `web/app/api/events/[eventId]/speakers/*`, `web/app/api/events/[eventId]/speaker-*`, `web/app/api/public/speaker-portal/[token]/*`, and `web/app/speaker-portal/[token]/*`.

Navigation/shell:
- `web/components/event/event-nav.tsx`: `EventNav`, `TABS`; current event nav has no Work tab and includes Timeline, Budget, Run of Show, Speakers, Docs, Activity.
- `web/app/(shell)/events/[eventId]/layout.tsx`: `EventLayout`.
- `web/app/(shell)/_components/sidebar-nav.tsx`: `SidebarNav`, `NAV_SECTIONS`; no standalone Tasking nav.

## 6. Current Access Checks And Gaps

Good patterns:
- Global event access is centralized in `web/lib/event-access.ts` via `resolveEventAccessForUser` and `assertEventAccessForUser`.
- Budget has a canonical wrapper in `web/src/server/services/budget.ts` `assertBudgetAccessForEvent` plus route helper `requireBudgetRouteAccess`.
- Timeline, Matrix 2 snapshot, Seating assignment, Speaker services, Speaker reminders, Speaker files, Speaker docs, and Speaker comms call `assertEventAccessForUser`.
- Dashboard and Action Center scope queries by org and event membership (`getCommandCenterDashboardData`, `web/app/(shell)/dashboard/action-center/page.tsx`).

Gaps to address before task implementation:
- `web/lib/events.ts` `getEventById`, `updateEvent`, and `deleteEvent` do not accept a user context; some event routes compensate, but future task object validation must not copy this unscoped pattern.
- Older Matrix routes in `web/app/api/events/[eventId]/matrix-rows/route.ts` call `listMatrixRows`/`createMatrixRow` without `resolveRequestUser` or `assertEventAccessForUser`.
- Matrix 2 session mutation route `web/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/route.ts` calls `updateMatrix2Session` without visible route-level auth in the inspected file.
- Seating table/attendee routes `web/app/api/events/[eventId]/seating/tables/route.ts` and `seating/attendees/route.ts` call create services without route-level auth; `seating/assign/route.ts` does enforce write access.
- `web/src/server/services/documents.ts` validates event/document ownership but does not itself accept user context for most service methods; routes provide `actedByUserId`. Future task services should require authenticated user context directly.

Tasking must enforce server-side access on every read/write using event/org/client scope: `Task.eventId`, `Task.orgId`, optional `clientId`, and validated `TaskLink` records must all resolve through owned event context.

## 7. Current Test Coverage And Gaps

Existing useful patterns:
- Budget access and spoofing: `web/lib/budget-access-hardening-regression.test.ts`.
- Budget dashboard derived work queue and activity: `web/lib/budget-dashboard-regression.test.ts`, `web/lib/budget-dashboard-ui-regression.test.ts`.
- Command Center / Action Center source assertions: `web/lib/dashboard-command-center-regression.test.ts`.
- Event access: `web/lib/event-access-regression.test.ts`, `web/lib/events-visibility-regression.test.ts`.
- Timeline/Matrix/Run of Show: `web/lib/matrix2-event-routing-regression.test.ts`, `web/lib/matrix2-board-layout.test.ts`, `web/lib/session-readiness.test.ts`, `web/lib/session-requirement-selection-persistence.test.ts`, `web/lib/run-of-show-room-set-linkage-regression.test.ts`.
- Seating scoping: `web/lib/seating-plan-scoping-regression.test.ts`, `web/lib/seating-chair-scope-regression.test.ts`, `web/lib/room-set/source-component-regression.test.ts`.
- Speaker hardening: `web/lib/speaker-module-hardening-regression.test.ts`, `web/lib/speakers-access-regression.test.ts`, `web/lib/speaker-readiness-regression.test.ts`, `web/lib/speaker-documents-regression.test.ts`, `web/lib/speaker-files-regression.test.ts`, `web/lib/speaker-comms-regression.test.ts`, `web/lib/speaker-reminders-regression.test.ts`, `web/lib/speaker-portal-security-regression.test.ts`.

Tasking test gaps:
- No `Task` service tests yet for org/event/client scoping, assignment validation, passive watcher validation, object-link validation, comments, activity, or cross-module permissions.
- No tests proving task completion cannot mutate Budget/Document/Speaker/Timeline/Matrix/Seating state.
- No Phase 2B generated task reconciliation tests yet for duplicate prevention or close/reopen behavior.
- No UI tests for Event > Work list, object-level task strips, or task drawer.

## 8. How Each Module Should Link To Tasks Later

- Budget: link tasks to `BudgetSubmission`, `BudgetSubmissionRecipient`, `BudgetApproval`, and optionally `BudgetLineItem`. Approval/rejection must call budget service methods, not task status updates.
- Documents: link tasks to `DocumentApprovalRecipient`, `DocumentApproval`, `Document`, and `DocumentVersion`. Approve/reject must call document service methods.
- Deadlines: link manual tasks to `Deadline`; generated overdue/blocked tasks can reconcile from `Deadline.status` and `dueAt`.
- Timeline: link tasks to `TimelineItem` and possibly `TimelineDependency`. Timeline status remains authoritative; task status can be independent unless generated from at-risk/overdue state.
- Matrix: link tasks to `MatrixRow`, `SessionRequirementSelection`, `SessionFnbCatalogAssignment`, `SessionSpeakerAssignment`, or conflict/readiness issue records if later modeled. Do not create fake session status in tasking.
- Seating: link tasks to `SeatingPlan`, `SeatingTable`, `SeatingAssignment`, or `MatrixRow` with issue reason. Do not use tasks as seating assignment truth.
- Speakers: link tasks to `Speaker`, `SpeakerProfileSubmission`, `SpeakerReadinessItem`, `SpeakerDocumentRequest`, `SpeakerFile`, `SpeakerMessage`, or `SpeakerEmailLog`.
- Activity and notifications: link from task activity to module object and task, but do not treat notifications as task state.

## 9. What Should Remain Derived Only

- Dashboard and Action Center queues from `web/src/server/services/command-center-dashboard.ts` and `web/app/(shell)/dashboard/action-center/page.tsx`.
- Budget variance, missing vendor/supporting docs, and session-linked budget intelligence signals.
- Speaker readiness flags from `computeSpeakerReadinessFlags`.
- Session readiness from `deriveSessionModuleReadiness`.
- Speaker activity timeline from `getSpeakerActivityTimeline`.
- Notifications unread/read state.
- Event activity and budget activity history.

## 10. Where Tasking Must Not Replace Module Truth

Tasking must not replace: budget submission approval, document review approval, timeline item status, deadline status, Matrix row/session details, room set layouts, seating assignments, speaker file review, speaker profile submission review, speaker document request submission/linking, speaker messages/notes, or notification delivery.

The task layer can own in Phase 2A: task title, description, assignment, passive watchers, independent due date, manual status, comments, task activity, source links, and Event > Work queue visibility. Reminder rows, generated-source metadata, and reconciliation state are deferred.

## 11. Lifecycle Mapping Per Module

| Module | Module status -> task status | Owner/recipient -> task assignment | Activity/comment mapping | Completion effect |
| --- | --- | --- | --- | --- |
| Budget submission | `SUBMITTED` -> generated task `open`; `APPROVED`/`PULLED_BACK` -> `done/closed`; `REJECTED` -> close reviewer task and optionally create revision task | `BudgetSubmissionRecipient.userId` for review; `submittedByUserId` for revision | `BudgetActivity.note`, `BudgetSubmission.message`, notifications become task activity references | Completing task alone should not approve/reject. Approval action must call `decideBudgetSubmission` or `approveBudget`/`rejectBudget` |
| Budget line item signals | `approval=PENDING`, variance, missing support -> derived or generated issue | Usually budget owner/planner or manual assignee | Budget dashboard signal only unless generated task is created | Completion should remove task from queue only if independent/manual; generated issues close when source condition resolves |
| Document review | `IN_REVIEW` -> generated recipient task open; `APPROVED`/`REJECTED`/pull-back -> closed | `DocumentApprovalRecipient.userId` | `DocumentApproval.note`, notifications, document activity equivalent | Completion alone must not approve/reject; review action calls `approveDocument`/`rejectDocument` |
| Deadline | `OPEN/BLOCKED` plus due window -> task open; `DONE/CANCELED` -> closed | `ownerUserId` | No native comments; task comments are independent | Manual completion may optionally update only task. Future explicit "mark deadline done" action must call deadline service |
| Timeline | `NOT_STARTED/IN_PROGRESS/AT_RISK` -> task visible; `COMPLETE` -> closed if generated from timeline | `ownerUserId` | No native comments; task comments independent | Timeline status remains owned by Timeline service |
| Matrix/session | Missing room/setup/requirements/conflicts -> generated issue task open | Manual assignee; session staff/speaker may inform assignment later | Matrix notes are source context, task comments independent | Completion closes task only; canonical session changes must call Matrix services |
| Seating | Missing plan/incomplete assignment/capacity conflict -> generated task open | Manual owner/event ops | Seating has no comments; task comments independent | Completion must not assign seats or alter tables |
| Speaker readiness | Missing profile/deck/docs/submission review -> generated tasks open | Speaker-facing tasks can be represented later; planner tasks assigned to event team or reviewer | Messages/notes/files/email logs can be linked as context | Completing task does not approve file/submission/document unless routed through speaker/doc service |
| Activity/notifications | Never primary task status | Notification `userId` may be watcher/recipient only | Activity can be mirrored as immutable task activity | Read/seen does not complete task |

Lifecycle source anchors:
- Budget mapping is grounded in `web/src/server/services/budget.ts` functions `createBudgetSubmission`, `decideBudgetSubmission`, `pullBackBudgetSubmission`, `transitionBudget`, `buildBudgetDashboardModel`, fields `BudgetSubmission.status`, `BudgetSubmissionRecipient.userId`, `BudgetSubmission.submittedByUserId`, `BudgetActivity.note`, and notifications from `dispatchBudgetSubmissionNotifications`.
- Document mapping is grounded in `web/src/server/services/documents.ts` functions `updateDocumentStatus`, `submitDocumentForReview`, `approveDocument`, `rejectDocument`, fields `Document.status`, `DocumentApproval.status`, `DocumentApprovalRecipient.userId`, `DocumentApproval.note`, and notifications from `createSubmitReviewNotifications`.
- Deadline mapping is grounded in `web/prisma/schema.prisma` model `Deadline` fields `status`, `ownerUserId`, `dueAt`, `dependsOnDeadlineId`, plus dashboard projections in `web/src/server/services/command-center-dashboard.ts` `getCommandCenterDashboardData` and `web/app/(shell)/dashboard/action-center/page.tsx`.
- Timeline mapping is grounded in `web/src/server/services/timeline.ts` functions `listTimelineItems`, `createTimelineItem`, `updateTimelineItem`, `createTimelineDependency`, fields `TimelineItem.status`, `TimelineItem.ownerUserId`, `TimelineItem.endDate`, and `TimelineDependency`.
- Matrix/session mapping is grounded in `web/lib/matrix.ts` `updateMatrixRow`, `web/lib/matrix2.ts` `getMatrix2Snapshot`, and `web/lib/session-readiness.ts` `deriveSessionModuleReadiness`; tasks should link to `MatrixRow` or requirement/assignment rows, not invent a separate session status.
- Seating mapping is grounded in `web/lib/seating.ts` `getSeatingSnapshot`, `assignAttendeeToTable`, `unassignAttendee`, `ensureSeatingPlanForMatrixRow`, and fields `SeatingPlan.matrixRowId`, `SeatingTable.capacity`, `SeatingAssignment.seatIndex`.
- Speaker mapping is grounded in `web/src/server/services/speaker-readiness.ts` `computeSpeakerReadinessFlags`, `speaker-submissions.ts` `approveSpeakerSubmission`/`rejectSpeakerSubmission`, `speaker-documents.ts` `createSpeakerDocumentRequest`/`linkSpeakerDocumentToDocsHub`, `speaker-files.ts` `reviewSpeakerFile`, `speaker-comms.ts` `createSpeakerMessage`/`createSpeakerInternalNote`, and `speaker-reminders.ts` `sendSpeakerReminders`.

## 12. Idempotency Rule Per Generated Task Candidate

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

## 13. Access And Permission Requirements

- All task queries must filter by `orgId`, `eventId`, and optional `clientId` where available.
- `TaskLink` creation must validate linked object belongs to the same event/org/client as the task.
- Assignments/watchers must validate users belong to org and can view the event.
- Writes require event edit permission unless a future permission matrix adds narrower task-specific capabilities.
- Reads require event read permission.
- Generated task reconciliation jobs must run as system actions but still validate source object scope.
- Public speaker portal must not read internal tasks unless a future portal-task model explicitly scopes speaker visibility.

## 14. Schema Risks

- Unsafe polymorphism: `TaskLink(objectType, objectId)` can drift unless validation is strict and covered by tests.
- Nullable FK explosion: one nullable column per module object is safer at DB level but may become wide and slow as Planner Dash adds link targets.
- Duplicate generated tasks without a unique generated key.
- Mirroring module status into `Task.status` can drift unless task status is clearly independent or reconciled.
- Using JSON for core links would make scoping and referential checks weak.
- Cross-client/org leaks if linked objects are not validated consistently.

## 15. Migration Risks

- `web/prisma/schema.prisma` is the active app schema used by `web/package.json` `postinstall`; adding many task indexes there should be staged and reviewed before any `web/prisma/migrations/*` file is created.
- Root `prisma/schema.prisma` also exists; implementation must decide whether it is legacy or needs parity before editing either schema. This audit did not edit either schema.
- Backfilling generated tasks before reconciliation is mature can create noise and duplicates in existing derived queues from `web/src/server/services/command-center-dashboard.ts` and `web/app/(shell)/dashboard/action-center/page.tsx`.
- Generated Prisma client changes must be coordinated with `web/prisma.config.ts`, `web/package.json` scripts, and route/service imports that use `@prisma/client`.
- If `TaskLink` starts with free-form object types instead of an enum and validation registry, cleanup will be expensive because link targets span `web/src/server/services/budget.ts`, `documents.ts`, `timeline.ts`, speaker services, `web/lib/matrix.ts`, `web/lib/matrix2.ts`, and `web/lib/seating.ts`.
- Existing UI labels in `web/app/(shell)/timeline/_components/TimelineListView.tsx` call timeline items "task"; UX copy must distinguish Timeline-native tasks from Event > Work tasks.

## 16. Recommended Build Phases

Phase 2A:
- Manual event tasks.
- Object-linked manual tasks.
- Event > Work list in event nav, not a global standalone Tasking nav.
- Task drawer with comments, activity, and passive watchers.
- Server-side access enforcement and object-link validation.
- No reminders, notification engine work, generated/reconciled automation, task templates, or task dependencies.

Phase 2B:
- Budget/document approval-generated tasks.
- Deadline overdue/blocked reconciliation.
- Timeline at-risk/overdue/dependency reconciliation.
- Idempotent generated task rules.
- Dashboard and object-level projections from tasks plus existing derived signals.
- Later Matrix/Seating/Speaker generated task candidates after issue taxonomy is reviewed.

Phase 2C:
- My Work / Command Center global work queue.
- Object-level task strips inside Budget, Docs, Timeline, Run of Show, Seating, Speakers.
- Optional task reminders, templates, dependency support, and notification delivery.

## 17. Test Plan

- Service tests for task CRUD, assignment validation, passive watcher validation, comments, activity, and object links.
- Access tests mirroring `event-access-regression` and `budget-access-hardening-regression`.
- Object-link validation tests for every supported `TaskLink.objectType`.
- Regression tests proving completing tasks does not mutate module status.
- Phase 2B generated reconciliation tests for idempotency, source resolution, auto-close, reopen, and user reassignment.
- Route tests for read/write scoping and actor spoofing prevention.
- UI regression tests for Event > Work list and task drawer.
- Dashboard tests proving task projections do not replace current derived signal logic in Phase 2A.

Repo-specific test gaps to close during implementation:
- Add task access tests alongside `web/lib/event-access-regression.test.ts`, `web/lib/events-visibility-regression.test.ts`, and `web/lib/budget-access-hardening-regression.test.ts`.
- Add task/dashboard regression tests alongside `web/lib/dashboard-command-center-regression.test.ts` and `web/lib/budget-dashboard-regression.test.ts` to prove existing derived queues keep working.
- Add object-link validation coverage using source-specific patterns from `web/lib/seating-plan-scoping-regression.test.ts`, `web/lib/run-of-show-room-set-linkage-regression.test.ts`, `web/lib/speaker-documents-regression.test.ts`, and `web/lib/speaker-files-regression.test.ts`.
- Add non-mutation regression tests proving task completion does not call `decideBudgetSubmission`, `approveDocument`, `updateTimelineItem`, `updateMatrixRow`, `assignAttendeeToTable`, `reviewSpeakerFile`, or `approveSpeakerSubmission`.

## 18. Decisions Locked By Schema Proposal

The final Phase 2A schema decisions are locked in `docs/schema-proposals/tasking-phase-2.md`:
- `TaskStatus`: `OPEN`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELED`.
- `TaskPriority`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
- `TaskType`: `EVENT`, `OBJECT_LINKED`.
- `TaskSource`: `MANUAL` only.
- `TaskVisibility`: `INTERNAL` only.
- `TaskAssignmentRole`: `OWNER`, `CONTRIBUTOR`.
- Passive `TaskWatcher` rows are included in Phase 2A for core UX.
- `TaskReminder`, `TaskDependency`, and `TaskTemplate` are deferred.
- Object links use `TaskLink(objectType, objectId)` with strict service validation and no JSON blobs for core links.
- Phase 2A has no generated/reconciled source keys, idempotency unique constraint, backfill, or reconciliation jobs.

Open implementation decisions before schema/migration work:
- Confirm whether `web/prisma/schema.prisma` is the only active Prisma schema target or whether root `prisma/schema.prisma` needs parity.
- Confirm the service registry file location for `TaskLink` validation.
- Confirm nullable `clientId` behavior: recommended default is to require event/org scope always and enforce client scope only when the task and linked object both have client context.
