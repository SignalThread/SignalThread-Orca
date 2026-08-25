import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const notificationsSource = readFileSync("src/server/services/notifications.ts", "utf8");
const timelineSource = readFileSync("src/server/services/timeline.ts", "utf8");
const tasksSource = readFileSync("src/server/services/tasks.ts", "utf8");
const marketingSource = readFileSync("src/server/services/marketing.ts", "utf8");
const documentsSource = readFileSync("src/server/services/documents.ts", "utf8");
const budgetSource = readFileSync("src/server/services/budget.ts", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return source.slice(startIndex, endIndex);
}

test("assignment notifications use the existing persisted notification service", () => {
  assert.match(notificationsSource, /export async function createAssignmentNotifications/);
  assert.match(notificationsSource, /createNotification\(assignment, prisma\)/);
  assert.match(notificationsSource, /isRead/);
  assert.match(notificationsSource, /orderBy: \[\{ createdAt: "desc" \}\]/);
});

test("Roadmap create, edit, and bulk owner assignment notify only new owners", () => {
  const create = sourceBetween(timelineSource, "export async function createTimelineItem", "/** One already-validated import row");
  const update = sourceBetween(timelineSource, "export async function updateTimelineItem", "export async function bulkUpdateTimelineItems");
  const bulk = sourceBetween(timelineSource, "export async function bulkUpdateTimelineItems", "export async function deleteTimelineItem");

  assert.match(create, /if \(created\.ownerUserId\)/);
  assert.match(create, /createAssignmentNotifications/);
  assert.match(update, /updated\.ownerUserId !== existing\.ownerUserId/);
  assert.match(update, /createAssignmentNotifications/);
  assert.match(bulk, /item\.ownerUserId !== normalized\.ownerUserId/);
  assert.match(bulk, /newlyAssignedItems\.length > 0/);
  assert.match(bulk, /Roadmap items assigned/);
  assert.match(bulk, /createAssignmentNotifications/);
  assert.match(timelineSource, /timeline\?focus=/);
});

test("task assignments cover create, self-assignment, reassignment, and unchanged assignments", () => {
  const create = sourceBetween(tasksSource, "async createManualTask", "async updateTask");
  const assign = sourceBetween(tasksSource, "async assignTask", "async addTaskComment");

  assert.match(create, /assigneeUserIds\.length > 0/);
  assert.match(create, /createAssignmentNotifications/);
  assert.match(assign, /if \(existing\) return loadTask/);
  assert.match(assign, /createAssignmentNotifications/);
  assert.match(tasksSource, /TASK_ASSIGNED/);
});

test("selected Marketing owners notify after successful create or changed owner update", () => {
  const campaign = sourceBetween(marketingSource, "async createCampaign", "async getCampaign");
  const createSend = sourceBetween(marketingSource, "async createEmailSend", "async updateEmailSend");
  const updateSend = sourceBetween(marketingSource, "async updateEmailSend", "async submitEmailSendForApproval");

  assert.match(campaign, /selectedOwnerUserId/);
  assert.match(campaign, /createAssignmentNotifications/);
  assert.match(createSend, /selectedOwnerUserId/);
  assert.match(createSend, /createAssignmentNotifications/);
  assert.match(updateSend, /nextOwnerUserId && nextOwnerUserId !== send\.ownerUserId/);
  assert.match(updateSend, /createAssignmentNotifications/);
  assert.match(marketingSource, /submitEmailSendForApproval[\s\S]*assigneeUserIds: \[approverUserId\]/);
  assert.match(marketingSource, /assignmentNotificationLinkUrl: `\/events\/\$\{send\.eventId\}\/marketing\?emailSendId=\$\{send\.id\}`/);
});

test("document reviewers and budget approvers retain their persisted notification paths", () => {
  const documentSubmit = sourceBetween(documentsSource, "async function createSubmitReviewNotifications", "async function resolveLinkTargets");
  const budgetSubmit = sourceBetween(budgetSource, "async function dispatchBudgetSubmissionNotifications", "export async function listBudgetSubmissions");

  assert.match(documentSubmit, /DOCUMENT_REVIEW_REQUESTED_NOTIFICATION_TYPE/);
  assert.match(documentSubmit, /existingUnreadSet/);
  assert.match(documentSubmit, /\/docs\?docId=/);
  assert.match(budgetSubmit, /BUDGET_SUBMISSION_REQUESTED_NOTIFICATION_TYPE/);
  assert.match(budgetSubmit, /\/budget/);
});
