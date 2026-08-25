import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { summarizeTasks, type TaskRecord } from "@/components/tasks/task-api";

function readSource(path: string): string {
  assert.ok(existsSync(path), `${path} should exist`);
  return readFileSync(path, "utf8");
}

const taskApiSource = readSource("components/tasks/task-api.ts");
const taskCreateModalSource = readSource("components/tasks/task-create-modal.tsx");
const stripSource = readSource("components/tasks/object-task-strip.tsx");
const drawerSource = readSource("components/tasks/task-drawer.tsx");
const featureConfigSource = readSource("src/config/features.ts");
const matrix2BoardSource = readSource("app/(shell)/matrix-2/_components/Matrix2Board.tsx");
const matrix2PageSource = readSource("app/(shell)/matrix-2/page.tsx");
const budgetDashboardSource = readSource("app/(shell)/events/[eventId]/budget/_components/budget-dashboard.tsx");
const timelinePageSource = readSource("app/(shell)/timeline/page.tsx");
const speakerDetailPageSource = readSource("app/(shell)/events/[eventId]/speakers/_components/speaker-detail-page.tsx");
const speakerDetailHeaderSource = readSource("app/(shell)/events/[eventId]/speakers/_components/speaker-detail-header.tsx");
const sessionWorkspaceSource = readSource(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
);

function task(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: overrides.id ?? "task-id",
    orgId: "org-id",
    eventId: "event-id",
    clientId: null,
    title: "Task",
    description: null,
    status: "OPEN",
    priority: "MEDIUM",
    type: "OBJECT_LINKED",
    source: "MANUAL",
    visibility: "INTERNAL",
    dueAt: null,
    createdByUserId: "user-id",
    completedAt: null,
    completedByUserId: null,
    canceledAt: null,
    canceledByUserId: null,
    createdAt: "2026-06-14T12:00:00.000Z",
    updatedAt: "2026-06-14T12:00:00.000Z",
    assignments: [],
    links: [],
    comments: [],
    activity: [],
    watchers: [],
    ...overrides,
  };
}

test("task strip summary counts blocked, open, and done tasks", () => {
  const summary = summarizeTasks([
    task({ id: "blocked", status: "BLOCKED" }),
    task({ id: "open", status: "OPEN" }),
    task({ id: "progress", status: "IN_PROGRESS" }),
    task({ id: "done", status: "DONE" }),
  ]);

  assert.deepEqual(summary, { total: 4, blocked: 1, open: 2, done: 1 });
});

test("object task strip exposes empty, loading, count, and read-only UI states", () => {
  assert.match(stripSource, /No tasks yet/);
  assert.match(stripSource, /Tasks \{summary\.total\}/);
  assert.match(stripSource, /Session-linked/);
  assert.match(stripSource, /summary\.blocked\} blocked/);
  assert.match(stripSource, /summary\.open\} open/);
  assert.match(stripSource, /isLoading \? \(/);
  assert.match(stripSource, /readOnly \?/);
  assert.match(stripSource, /setReadOnly\(true\)/);
});

test("task UI uses internal authenticated task API routes", () => {
  assert.match(taskApiSource, /\/api\/events\/\$\{encodeURIComponent\(eventId\)\}\/tasks/);
  assert.match(taskApiSource, /\/object\?\$\{params\.toString\(\)\}/);
  assert.match(taskApiSource, /\/assignees/);
  assert.match(taskApiSource, /method: "POST"/);
  assert.match(taskApiSource, /method: "PATCH"/);
  assert.match(taskApiSource, /\/complete/);
  assert.match(taskApiSource, /\/block/);
  assert.match(taskApiSource, /\/reopen/);
  assert.match(taskApiSource, /\/assign/);
  assert.match(taskApiSource, /\/comments/);
  assert.match(taskApiSource, /\/watchers/);
  assert.match(taskApiSource, /credentials: "include"/);
});

test("add task creates a manual linked task through the event task API", () => {
  assert.match(taskApiSource, /createLinkedManualTask/);
  assert.match(taskApiSource, /links: \[\{ objectType: input\.objectType, objectId: input\.objectId \}\]/);
  assert.doesNotMatch(taskApiSource, /sourceKey|GENERATED|RECONCILED|TaskReminder|TaskDependency|TaskTemplate/);
});

test("drawer exposes Phase 2A edit, status, block, and comment actions", () => {
  for (const expected of [
    "completeTask",
    "blockTask",
    "reopenTask",
    "addTaskComment",
    "updateTask",
  ]) {
    assert.match(drawerSource, new RegExp(expected));
  }
  assert.match(drawerSource, /Read-only access/);
  assert.match(drawerSource, /Event editor access is required/);
});

test("drawer renders an explicit status section with manual task helper copy", () => {
  assert.match(drawerSource, />Status</);
  assert.match(drawerSource, /statusLabel\(selectedTask\.status\)/);
  assert.match(drawerSource, /These are manual tasks linked to this session/);
  assert.match(drawerSource, /They do not change module readiness automatically/);
});

test("OPEN tasks show Complete and Block controls", () => {
  assert.match(drawerSource, /selectedTask\.status !== "DONE" && selectedTask\.status !== "CANCELED"/);
  assert.match(drawerSource, /completeTask\(eventId, selectedTask\.id\)/);
  assert.match(drawerSource, /Block reason/);
  assert.match(drawerSource, /Enter a reason to block this task/);
});

test("BLOCKED tasks show Reopen, Complete, and blocked context", () => {
  assert.match(drawerSource, /selectedTask\.status === "BLOCKED"/);
  assert.match(drawerSource, /blockedContextForTask\(selectedTask\)/);
  assert.match(drawerSource, /reopenTask\(eventId, selectedTask\.id\)/);
  assert.match(drawerSource, /completeTask\(eventId, selectedTask\.id\)/);
});

test("COMPLETE tasks show Reopen without primary Block controls", () => {
  assert.match(drawerSource, /selectedTask\.status === "DONE"/);
  assert.match(drawerSource, /Task reopened\. Status changed to OPEN\./);
  assert.match(drawerSource, /selectedTask\.status !== "DONE" && selectedTask\.status !== "CANCELED" \? \(/);
});

test("status actions refresh drawer state and show clear success messages", () => {
  assert.match(drawerSource, /replaceTask\(task\)/);
  assert.match(drawerSource, /Task completed\. Status changed to COMPLETE\./);
  assert.match(drawerSource, /Task blocked\. Status changed to BLOCKED\./);
  assert.match(drawerSource, /Task reopened\. Status changed to OPEN\./);
});

test("drawer renders a real assignee picker with human-readable event users", () => {
  assert.match(drawerSource, /listTaskAssignees\(eventId/);
  assert.match(drawerSource, /function assigneeLabel\(user: TaskAssignableUser\): string/);
  assert.match(drawerSource, /user\.name/);
  assert.match(drawerSource, /user\.email/);
  assert.match(drawerSource, /Assign to\.\.\./);
  assert.match(drawerSource, /selectedTask\.assignments\.map/);
  assert.match(drawerSource, /assigneeLabel\(user\)/);
  assert.match(drawerSource, /Tasks can have multiple assignees/);
});

test("selecting an assignee calls the assignment API with the selected event user id", () => {
  assert.match(drawerSource, /selectedAssigneeUserId/);
  assert.match(drawerSource, /assignTask\(eventId, selectedTask\.id, userId\)/);
  assert.match(taskApiSource, /body: JSON\.stringify\(\{ assigneeUserId \}\)/);
});

test("shared add task modal renders event-scoped assignee selection", () => {
  assert.match(taskCreateModalSource, /listTaskAssignees\(eventId/);
  assert.match(taskCreateModalSource, /Assign to/);
  assert.match(taskCreateModalSource, /role="combobox"/);
  assert.match(taskCreateModalSource, /Loading team\.\.\./);
  assert.match(taskCreateModalSource, /No team members available/);
  assert.match(taskCreateModalSource, /assigneeLabel\(user\)/);
});

test("creating from the shared add task modal persists selected assignee", () => {
  assert.match(taskCreateModalSource, /selectedAssigneeUserId/);
  assert.match(taskCreateModalSource, /assigneeUserIds: selectedAssigneeUserId \? \[selectedAssigneeUserId\] : \[\]/);
  assert.match(taskApiSource, /assigneeUserIds: input\.assigneeUserIds \?\? \[\]/);
});

test("object task drawer create flow can assign an owner in the same canonical create call", () => {
  assert.match(drawerSource, /id="task-create-assignee"/);
  assert.match(drawerSource, />\s*Owner\s*</);
  assert.match(drawerSource, /assigneeUserIds: selectedAssigneeUserId \? \[selectedAssigneeUserId\] : \[\]/);
  assert.match(drawerSource, /onAssigneeChange=\{setSelectedAssigneeUserId\}/);
  assert.match(drawerSource, /assignableUsers=\{assignableUsers\}/);
});

test("object task drawer keeps create mode open when canonical create fails", () => {
  assert.match(drawerSource, /Promise<boolean>/);
  assert.match(drawerSource, /return true;/);
  assert.match(drawerSource, /return false;/);
  assert.match(drawerSource, /const created = await runTaskAction\(/);
  assert.match(drawerSource, /if \(created\) setIsCreating\(false\);/);
});

test("shared add task modal uses custom date and 15-minute time controls", () => {
  assert.doesNotMatch(taskCreateModalSource, /type="datetime-local"/);
  assert.doesNotMatch(taskCreateModalSource, /type="date"/);
  assert.match(taskCreateModalSource, /TIME_OPTIONS = Array\.from\(\{ length: 24 \* 4 \}/);
  assert.match(taskCreateModalSource, /15/);
  assert.match(taskCreateModalSource, /Clear due date/);
  assert.match(taskCreateModalSource, /formatDueLabel/);
  assert.match(taskCreateModalSource, /dueAt: hasDueAt \? toIsoFromParts/);
});

test("drawer does not render raw User UUID assignment or watcher controls", () => {
  for (const forbidden of [
    "Assign by user id",
    "Watch by user id",
    "User UUID",
    "watcherUserId",
    "task-assignee-user",
    "task-watcher-user",
    "Assignment editing is hidden",
  ]) {
    assert.equal(drawerSource.includes(forbidden), false, `drawer should not render ${forbidden}`);
  }

  assert.match(drawerSource, /Watcher editing is secondary for Phase 2A/);
});

test("block action explains disabled state and shows explicit status feedback", () => {
  assert.match(drawerSource, /Enter a reason to block this task/);
  assert.match(drawerSource, /disabled=\{!blockReason\.trim\(\)\}/);
  assert.match(drawerSource, /Task blocked\. Status changed to BLOCKED\./);
});

test("failed task API actions show user-visible safe errors", () => {
  assert.match(drawerSource, /setErrorMessage\(normalizeError\(error, fallback\)\)/);
  assert.match(drawerSource, /setAssigneeError\(normalizeError\(error, "Failed to assign task"\)\)/);
  assert.match(drawerSource, /assigneeError \?/);
  assert.match(drawerSource, /editing requires event editor access/);
  assert.match(drawerSource, /errorMessage \?/);
});

test("read-only drawer path does not expose assignment mutation controls", () => {
  assert.match(drawerSource, /readOnly \? \(/);
  assert.match(drawerSource, /Event editor access is required to assign tasks/);
  assert.match(drawerSource, /<form className="mt-3 space-y-2" onSubmit=\{\(event\) => void submitAssignment\(event\)\}>/);
});

test("task due date edits are converted to API-safe ISO strings", () => {
  assert.match(drawerSource, /function toIsoOrNull\(value: string\): string \| null/);
  assert.match(drawerSource, /date\.toISOString\(\)/);
  assert.match(drawerSource, /dueAt: toIsoOrNull\(dueAt\)/);
});

test("generic embedded object task strips are disabled by the central UI flag", () => {
  assert.match(featureConfigSource, /ENABLE_GENERIC_TASKING_UI: false/);
  assert.match(stripSource, /FEATURES\.ENABLE_GENERIC_TASKING_UI/);
  assert.match(stripSource, /if \(!genericTaskingUiEnabled\) return;/);
  assert.match(stripSource, /if \(!genericTaskingUiEnabled\) \{\s+return null;\s+\}/);
});

test("Run of Show board cards and overview rows do not render per-session task controls", () => {
  assert.doesNotMatch(matrix2BoardSource, /<ObjectTaskStrip/);
  assert.doesNotMatch(matrix2BoardSource, /<TaskDrawer/);
  assert.match(matrix2BoardSource, /data-matrix2-session-card-id=\{session\.id\}/);

  const overviewTableSource = matrix2PageSource.slice(
    matrix2PageSource.indexOf("function MatrixOverviewTable"),
    matrix2PageSource.indexOf("export default function Matrix2Page"),
  );
  assert.doesNotMatch(overviewTableSource, /<ObjectTaskStrip/);
  assert.doesNotMatch(overviewTableSource, /Tasks 0|Tasks \{/);
});

test("Run of Show toolbar generic task launcher is feature-gated", () => {
  assert.match(matrix2PageSource, /FEATURES\.ENABLE_GENERIC_TASKING_UI \? \(/);
  assert.match(matrix2PageSource, /<TaskCreateLauncher/);
  assert.match(matrix2PageSource, /source="run-of-show"/);
  assert.match(matrix2PageSource, /buttonLabel="Task"/);
  assert.doesNotMatch(matrix2PageSource, /<TaskDrawer/);
  assert.doesNotMatch(matrix2PageSource, /setIsRunOfShowTaskDrawerOpen\(true\)/);
  assert.doesNotMatch(matrix2PageSource, /openWithoutSelectionInCreateMode/);
});

test("shared task modal supports Run of Show no-attachment and MatrixRow session attachment creation", () => {
  assert.match(matrix2PageSource, /runOfShowTaskSessionOptions/);
  assert.match(matrix2PageSource, /objectType: "MATRIX_ROW"/);
  assert.match(matrix2PageSource, /objectId: session\.rowId/);
  assert.match(matrix2PageSource, /label: session\.title/);
  assert.match(matrix2PageSource, /matrixSessionTimeLabel\(session\)/);
  assert.match(taskCreateModalSource, /Add Run of Show Task/);
  assert.match(taskCreateModalSource, /Create a task for this event\. Attach it to a session when it is session-specific\./);
  assert.match(taskCreateModalSource, /No session attachment/);
  assert.match(taskCreateModalSource, /links: selectedAttachment/);
  assert.match(taskCreateModalSource, /objectType: selectedAttachment\.objectType/);
  assert.match(taskCreateModalSource, /: \[\]/);
});

test("shared task modal validates title and renders as a centered fixed overlay", () => {
  assert.match(taskCreateModalSource, /role="dialog"/);
  assert.match(taskCreateModalSource, /aria-modal="true"/);
  assert.match(taskCreateModalSource, /fixed inset-0 z-\[80\] flex items-center justify-center/);
  assert.match(taskCreateModalSource, /disabled=\{titleIsEmpty \|\| isSubmitting\}/);
  assert.match(taskCreateModalSource, /Enter a title to add this task\./);
  assert.match(taskCreateModalSource, /onClose/);
  assert.match(taskCreateModalSource, /Cancel/);
});

test("task drawer remains available for object task detail panels", () => {
  assert.match(drawerSource, /fixed inset-0 z-\[80\]/);
  assert.match(matrix2BoardSource, /data-matrix2-action-launcher/);
  assert.match(matrix2BoardSource, /if \(isTaskDrawerOpen\) \{/);
  assert.match(matrix2BoardSource, /closeActionLauncher\(\)/);
  assert.match(matrix2PageSource, /isTaskDrawerOpen=\{FEATURES\.ENABLE_GENERIC_TASKING_UI && isRunOfShowTaskModalOpen\}/);
  assert.doesNotMatch(matrix2BoardSource, /<TaskDrawer/);
});

test("Budget generic task launcher is feature-gated while Roadmap uses native Add item flow", () => {
  assert.match(budgetDashboardSource, /FEATURES\.ENABLE_GENERIC_TASKING_UI \? \(/);
  assert.match(budgetDashboardSource, /<TaskCreateLauncher/);
  assert.match(budgetDashboardSource, /source="budget"/);
  assert.match(budgetDashboardSource, /objectType: "BUDGET_LINE_ITEM"/);
  assert.match(budgetDashboardSource, /fetch\(`\/api\/events\/\$\{eventId\}\/budget`/);
  assert.match(taskCreateModalSource, /Add Budget Task/);
  assert.match(taskCreateModalSource, /No budget item attachment/);

  assert.doesNotMatch(timelinePageSource, /<TaskCreateLauncher/);
  assert.doesNotMatch(timelinePageSource, /source="roadmap"/);
  assert.doesNotMatch(timelinePageSource, /\+\s*Task/);
  assert.doesNotMatch(timelinePageSource, /buttonLabel="Task"/);
  assert.match(timelinePageSource, /aria-label="Roadmap add menu"/);
  assert.match(timelinePageSource, /Add workstream/);
  assert.match(timelinePageSource, /Add item/);
  assert.match(timelinePageSource, /onClick=\{\(\) => openCreateItemModal\(\)\}/);
});

test("Run of Show task entry points use task UI without Matrix source-of-truth mutation", () => {
  const runOfShowTaskUiSource = [taskApiSource, stripSource, drawerSource].join("\n");
  for (const forbidden of [
    "/api/events/${eventId}/matrix-rows",
    "/api/events/${selectedEventId}/matrix-rows",
    "/api/events/${eventId}/matrix-2/sessions",
    "/api/events/${selectedEventId}/matrix-2/sessions",
    "attentionItems.push",
    "/speaker-readiness",
    "/seating",
  ]) {
    assert.equal(runOfShowTaskUiSource.includes(forbidden), false, `Run of Show task UI should not include ${forbidden}`);
  }
});

test("speaker detail page owns vertical scroll within the event workspace", () => {
  assert.match(speakerDetailPageSource, /h-full min-h-0 overflow-y-auto overflow-x-hidden/);
  assert.doesNotMatch(speakerDetailPageSource, /overflow-x-auto/);
});

test("speaker detail header only wires the shared generic strip, which is flag-disabled", () => {
  assert.match(speakerDetailHeaderSource, /<ObjectTaskStrip/);
  assert.match(speakerDetailHeaderSource, /eventId=\{eventId\}/);
  assert.match(speakerDetailHeaderSource, /objectType="SPEAKER"/);
  assert.match(speakerDetailHeaderSource, /objectId=\{speaker\.id\}/);
  assert.match(speakerDetailHeaderSource, /objectLabel=\{speaker\.name\}/);
  assert.match(speakerDetailPageSource, /<SpeakerDetailHeader eventId=\{eventId\}/);
});

test("speaker task UI does not mutate speaker readiness or source-of-truth APIs", () => {
  const speakerTaskUiSource = [speakerDetailHeaderSource, stripSource, drawerSource, taskApiSource].join("\n");
  for (const forbidden of [
    "/speaker-readiness",
    "/speaker-conflicts",
    "/portal-link",
    "/submission",
    "/reminder",
    "/api/events/${eventId}/speakers",
  ]) {
    assert.equal(speakerTaskUiSource.includes(forbidden), false, `speaker task UI should not include ${forbidden}`);
  }
});

test("manual session tasks do not feed Needs your attention or module cards", () => {
  const stripIndex = sessionWorkspaceSource.indexOf("<ObjectTaskStrip");
  const overviewIndex = sessionWorkspaceSource.indexOf('{activeTab === "overview"');
  const modulesIndex = sessionWorkspaceSource.indexOf("readiness · key facts · one action each");

  assert.notEqual(stripIndex, -1);
  assert.ok(stripIndex < overviewIndex, "task strip should stay in the session header");
  assert.ok(stripIndex < modulesIndex, "task strip should not be inside module cards");
  assert.equal(sessionWorkspaceSource.includes("attentionItems.push") && stripIndex > overviewIndex, false);
  assert.match(stripSource, /return null/);
});

test("task UI does not call Prisma, migrations, dashboards, or module mutation APIs", () => {
  const combinedTaskUiSource = [taskApiSource, stripSource, drawerSource].join("\n");
  for (const forbidden of [
    "getPrisma",
    "@prisma/client",
    "prisma/schema",
    "migrations",
    "dashboard",
    "budget.",
    "document.update",
    "document.create",
    "document.delete",
    "/timeline",
    "matrix-2/sessions/${session.id}",
    "/seating",
    "/speakers",
    "/deadlines",
    "/api/public",
  ]) {
    assert.equal(combinedTaskUiSource.includes(forbidden), false, `task UI should not include ${forbidden}`);
  }
});
