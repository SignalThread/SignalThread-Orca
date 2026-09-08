import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("data integrity contracts for high-risk mutations", () => {
  it("cancel selected-lead brief cancels only the workspace and never deletes leads", () => {
    const service = read("lib/server/briefings/cancel-selected-lead-brief-workspace.ts");
    const route = read("app/api/exhibitor/briefings/batches/[batchId]/cancel-selected-lead-draft/route.ts");

    assert.match(route, /cancelSelectedLeadBriefWorkspace/);
    assert.match(service, /batchRow\.source_kind !== "selected_leads"/);
    assert.match(service, /batchRow\.status !== "draft"/);
    assert.match(service, /assertEventIdAccessibleForUser/);
    assert.match(service, /\.from\("leads"\)[\s\S]*\.select\("id, company_id, event_id"\)/);
    assert.match(service, /\.from\("import_batches"\)[\s\S]*\.update\(\{ status: "discarded"/);
    assert.doesNotMatch(service, /\.from\("leads"\)[\s\S]{0,400}\.delete\(/);
    assert.doesNotMatch(service, /\.from\("lead_briefings"\)[\s\S]{0,400}\.delete\(/);
  });

  it("import discard soft-deletes draft/published batch state without deleting materialized leads", () => {
    const service = read("lib/server/import-wizard/import-batch-service.ts");
    const route = read("app/api/exhibitor/briefings/batches/[batchId]/discard/route.ts");

    assert.match(route, /discardImportBatchForCompany/);
    assert.match(service, /Allowed from `draft` or `published`/);
    assert.match(service, /Does not delete materialized leads or `lead_briefings`/);
    assert.match(service, /current\.status !== "draft" && current\.status !== "published"/);
    assert.match(service, /\.from\("import_batches"\)[\s\S]*\.update\(patch as never\)[\s\S]*\.eq\("id",\s*batchId\)[\s\S]*\.eq\("company_id",\s*companyId\)/);
    assert.doesNotMatch(service, /\.from\("leads"\)[\s\S]{0,400}\.delete\(/);
    assert.doesNotMatch(service, /\.from\("lead_briefings"\)[\s\S]{0,400}\.delete\(/);
  });

  it("approve brief sync writes lead_briefings content without overwriting unrelated lead fields", () => {
    const service = read("lib/server/import-wizard/import-batch-briefing-service.ts");

    assert.match(service, /export async function syncApprovedBriefingRowToLeadBriefing/);
    assert.match(service, /finalContentFromDetail/);
    assert.match(service, /polished\?\.whyHere/);
    assert.match(service, /\.from\("lead_briefings"\)[\s\S]*\.upsert\(/);
    assert.match(service, /onConflict:\s*"lead_id"/);
    assert.doesNotMatch(service, /\.from\("leads"\)[\s\S]{0,500}\.update\(/);
  });

  it("user-edited brief fields and re-polish overwrite protection are preserved", () => {
    const route = read("app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/route.ts");
    const polishRoute = read("app/api/exhibitor/import-wizard/batches/[batchId]/briefing-rows/[rowId]/ai-polish/route.ts");
    const service = read("lib/server/import-wizard/import-batch-briefing-service.ts");
    const client = read("components/exhibitor/review-brief-client.tsx");

    assert.match(route, /action === "save_brief_edits"/);
    assert.match(service, /saveEditedBriefingForBatchRow/);
    assert.match(service, /manuallyEditedAt:\s*new Date\(\)\.toISOString\(\)/);
    assert.match(client, /hasManualBriefEdits/);
    assert.match(polishRoute, /manual_edits_present/);
    assert.match(polishRoute, /forceOverwriteManualEdits/);
    assert.match(client, /Re-polishing may rewrite text you edited\. Continue\?/);
  });

  it("team user delete/revoke removes scoped event access and verifies auth/public cleanup", () => {
    const route = read("app/api/exhibitor/users/[userId]/route.ts");
    const verifier = read("lib/exhibitor/company-team-delete-verify.ts");
    const existingTests = read("tests/company-team-delete-user.test.ts");

    assert.match(route, /export async function DELETE/);
    assert.match(route, /\.from\("event_users"\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("user_id",\s*userId\)/);
    assert.match(route, /\.eq\("exhibitor_company_id",\s*exhibitorCompanyId\)/);
    assert.match(route, /reconcileLicenseSeatsUsed/);
    assert.match(route, /verifyCompanyTeamUserFullyDeleted/);
    assert.match(verifier, /User profile still exists after delete/);
    assert.match(verifier, /Event memberships still exist for this user/);
    assert.match(verifier, /Pending invite codes still exist for this user/);
    assert.match(verifier, /Auth user still exists after delete/);
    assert.match(existingTests, /fails when users row still exists/);
    assert.match(existingTests, /fails when event_users remain/);
    assert.match(existingTests, /succeeds when user, memberships, invites, and auth are gone/);
  });

  it("reconciliation repairs derived access and seat state from authoritative rows", () => {
    const usersRoute = read("app/api/exhibitor/users/[userId]/route.ts");
    const eventUserAccess = read("lib/server/event-user-access.ts");
    const adminActions = read("app/admin/users/actions.ts");
    const existingTests = read("tests/company-scoped-user-actions.test.ts");

    assert.match(usersRoute, /reconcileLicenseSeatsUsed/);
    assert.match(eventUserAccess, /export async function reconcileLicenseSeatsUsed/);
    assert.match(eventUserAccess, /\.from\("event_users"\)[\s\S]*\.eq\("status",\s*"active"\)/);
    assert.match(adminActions, /reconcileLicenseSeatsUsed/);
    assert.match(existingTests, /company-scoped admin update action does not mutate emails/);
  });
});
