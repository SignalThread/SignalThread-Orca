import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd());

test("main workflows page keeps workflow list primary and always exposes Review approvals", () => {
  const listSource = readFileSync(join(root, "components/exhibitor/workflows/workflows-list-view.tsx"), "utf8");
  const pageSource = readFileSync(join(root, "app/(app)/exhibitor/workflows/page.tsx"), "utf8");
  const mainView = listSource.slice(
    listSource.indexOf("export function WorkflowsListView"),
    listSource.indexOf("export function WorkflowActivityReviewView")
  );

  assert.match(mainView, /<ReviewApprovalsButton href=\{approvalsHref\} count=\{pendingApprovalCount\} \/>/);
  assert.match(mainView, /<CreateWorkflowButton href=\{createWorkflowHref\} \/>/);
  assert.match(mainView, /<WorkflowsTable/);
  assert.match(listSource, /Review approvals/);
  assert.match(listSource, /count > 0/);
  assert.match(pageSource, /loadPendingWorkflowApprovalCount/);
  assert.match(pageSource, /\/exhibitor\/workflows\/approvals/);
  assert.doesNotMatch(mainView, /WorkflowActivitySection/);
  assert.doesNotMatch(mainView, /PendingApprovalsAlert/);
  assert.doesNotMatch(pageSource, /loadWorkflowActivityRecords/);
});

test("workflow approval review page defaults to pending approvals and can clear status filters", () => {
  const source = readFileSync(join(root, "components/exhibitor/workflows/workflows-list-view.tsx"), "utf8");
  const approvalsPageSource = readFileSync(join(root, "app/(app)/exhibitor/workflows/approvals/page.tsx"), "utf8");
  assert.match(source, /All activity/);
  assert.match(source, /activityFilter = \{ workflowStatus: "pending_approval", leadId: null \}/);
  assert.match(source, /const tabHref = \(status: LeadWorkflowStatusFilter \| null\)/);
  assert.match(source, /if \(status\) params\.set\("workflowStatus", status\)/);
  assert.match(source, /else params\.set\("workflowStatus", "all"\)/);
  assert.match(source, /return query \? `\/exhibitor\/workflows\/approvals\?\$\{query\}` : "\/exhibitor\/workflows\/approvals"/);
  assert.match(approvalsPageSource, /parseLeadWorkflowStatusFilter\(workflowStatusRaw\) \?\? "pending_approval"/);
  assert.match(approvalsPageSource, /loadWorkflowActivityRecords/);
  assert.match(source, /No pending approvals\./);
  assert.match(source, /No approved workflow records\./);
  assert.match(source, /No synced\/completed workflow records\./);
});

test("workflow approval page uses marketer-facing approval request copy", () => {
  const source = readFileSync(join(root, "components/exhibitor/workflows/workflows-list-view.tsx"), "utf8");
  const cardSource = source.slice(
    source.indexOf("function WorkflowApprovalCard"),
    source.indexOf("function ReviewApprovalsButton")
  );
  assert.match(source, /function WorkflowApprovalCard/);
  assert.match(cardSource, /Campaign draft waiting for approval/);
  assert.match(cardSource, /Review request/);
  assert.match(cardSource, /What will happen/);
  assert.match(cardSource, /Subject template/);
  assert.match(cardSource, /Tone \/ positioning/);
  assert.match(cardSource, /Input scope/);
  assert.match(cardSource, /Agents used/);
  assert.match(cardSource, /Selected campaign agents/);
  assert.match(cardSource, /Approve draft creation/);
  assert.doesNotMatch(cardSource, /Review proposed payload/);
  assert.doesNotMatch(cardSource, /Proposed output/);
  assert.doesNotMatch(cardSource, /Technical details/);
  assert.doesNotMatch(cardSource, />Payload</);
  assert.doesNotMatch(cardSource, /payload/i);
  assert.doesNotMatch(cardSource, /JSON\.stringify\(record\.content/);
  assert.doesNotMatch(cardSource, /lead_id|step_id|workflow_id|event_id|step_index/);
  assert.doesNotMatch(cardSource, /Approval required:/);
  assert.doesNotMatch(cardSource, /This workflow action is waiting for approval/);
  assert.match(source, /record\.lead_company/);
  assert.match(source, /record\.lead_email/);
  assert.match(source, /approvalStepLabel/);
  assert.match(source, /type ApprovalDisplayModel =/);
  assert.match(source, /approvalTitle/);
  assert.match(source, /approvalDescription/);
  assert.match(source, /subjectTemplate/);
  assert.match(source, /realDraftBody/);
  assert.match(source, /Action/);
  assert.match(source, /buildApprovalDisplayModel/);
  assert.match(source, /callDraftAction\(record\.draft_id, nextAction\)/);
  assert.match(source, /\/api\/exhibitor\/generated-drafts\/\$\{encodeURIComponent\(draftId\)\}\/approve/);
  assert.match(source, /\/api\/exhibitor\/generated-drafts\/\$\{encodeURIComponent\(draftId\)\}\/reject/);
  assert.match(source, /Approving\.\.\." : display\.approvalActionLabel/);
  assert.match(source, /Rejecting\.\.\." : "Reject"/);
});

test("workflow detail approval card does not expose payload copy or fake draft body", () => {
  const source = readFileSync(join(root, "components/exhibitor/workflows/workflow-detail-view.tsx"), "utf8");
  const cardSource = source.slice(
    source.indexOf("function ApprovalNeededCard"),
    source.indexOf("function SummaryCard")
  );
  assert.match(cardSource, /Approval needed/);
  assert.match(cardSource, /Review before this workflow continues/);
  assert.match(cardSource, /What will happen/);
  assert.match(cardSource, /Subject template/);
  assert.match(cardSource, /Tone \/ positioning/);
  assert.match(cardSource, /Campaign agents used/);
  assert.match(cardSource, /Input scope/);
  assert.match(cardSource, /Review approval request/);
  assert.match(cardSource, /Approve draft creation/);
  assert.doesNotMatch(cardSource, /Review payload/);
  assert.doesNotMatch(cardSource, /Proposed output/);
  assert.doesNotMatch(cardSource, /Technical details/);
  assert.doesNotMatch(cardSource, /payload/i);
  assert.doesNotMatch(cardSource, /JSON\.stringify/);
  assert.doesNotMatch(cardSource, /lead_id|step_id|workflow_id|event_id|step_index/);
  assert.doesNotMatch(cardSource, /Approval required:/);
  assert.doesNotMatch(cardSource, /This workflow action is waiting for approval/);
  assert.doesNotMatch(source, />Technical details</);
});

test("workflow compose output action shows Send Email as coming soon and keeps workflows draft-only for now", () => {
  const inspectorSource = readFileSync(
    join(root, "components/exhibitor/workflows/workflow-orchestration-inspector.tsx"),
    "utf8"
  );
  const outputActionSource = readFileSync(
    join(root, "lib/exhibitor/workflows/workflow-compose-output-action.ts"),
    "utf8"
  );
  const validatorSource = readFileSync(
    join(root, "lib/exhibitor/workflows/create-workflow-core.ts"),
    "utf8"
  );

  assert.match(inspectorSource, /<option value="campaign_draft">Campaign Draft<\/option>/);
  assert.match(inspectorSource, /<option value="ai_email_draft">Email Draft<\/option>/);
  assert.match(inspectorSource, /<option disabled value="send_email">/);
  assert.match(inspectorSource, /Send Email \(coming soon\)/);
  assert.match(inspectorSource, /Send Email is coming soon and cannot be saved or run yet\./);
  assert.match(outputActionSource, /"send_email"/);
  assert.match(outputActionSource, /return "Send Email";/);
  assert.match(validatorSource, /workflowComposeOutputActionUnavailableMessage\(input\.outputActionKind\)/);
  assert.match(outputActionSource, /return "Email Draft";/);
});
