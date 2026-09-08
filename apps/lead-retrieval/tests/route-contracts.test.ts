import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function assertAuth(source: string, label: string) {
  assert.match(
    source,
    /resolveApiSession|getCurrentSessionUser|requireRole/,
    `${label} should authenticate at the server layer`
  );
}

function assertCompanyScopedQuery(source: string, label: string) {
  assert.match(
    source,
    /\.eq\(["']company_id["'],\s*(companyId|accountId|sessionUser\.companyId|sessionUser\.company_id)|company_id:\s*(companyId|accountId|sessionUser\.companyId|sessionUser\.company_id)|companyId:\s*(companyId|accountId|sessionUser\.companyId|sessionUser\.company_id)|existing\.company_id|companyScopedRows/,
    `${label} should scope by company_id`
  );
}

function assertEventGuard(source: string, label: string) {
  assert.match(
    source,
    /assertEventIdAccessibleForUser|resolveValidatedActiveEventIdForUser|resolveAccessibleEventIdsForUser|getCachedExhibitorAccessibleEventResolution/,
    `${label} should use canonical event access`
  );
}

describe("route contracts: exhibitor leads", () => {
  it("supports phone through canonical create, list, detail, and update contracts", () => {
    const create = read("app/api/exhibitor/leads/create/route.ts");
    const list = read("app/api/exhibitor/leads/list/route.ts");
    const detail = read("app/api/exhibitor/leads/[leadId]/route.ts");
    const patchNormalizer = read("lib/leads/exhibitorLeadPatch.ts");

    assert.match(create, /const phone =[\s\S]*jsonPayload\.phone/);
    assert.match(create, /email: email \|\| null,[\s\S]*phone,/);
    assert.match(create, /full_name, email, phone, job_title/);
    assert.match(list, /full_name, email, phone, job_title/);
    assert.match(detail, /full_name, email, phone, job_title/);
    assert.match(patchNormalizer, /if \("phone" in payload\)[\s\S]*patch\.phone/);
  });

  it("lead reads and writes authenticate, enforce company scope, and guard event-specific access", () => {
    const create = read("app/api/exhibitor/leads/create/route.ts");
    const list = read("app/api/exhibitor/leads/list/route.ts");
    const detail = read("app/api/exhibitor/leads/[leadId]/route.ts");
    const bulkDelete = read("app/api/exhibitor/leads/bulk-delete/route.ts");

    for (const [label, source] of [
      ["create", create],
      ["list", list],
      ["detail", detail],
      ["bulk delete", bulkDelete],
    ] as const) {
      assertAuth(source, `leads ${label}`);
      assert.match(source, /can(Read|Mutate)ExhibitorLeadsInContext/, `leads ${label} should enforce role/app aggregate`);
      assertCompanyScopedQuery(source, `leads ${label}`);
    }

    assertEventGuard(create, "lead create");
    assertEventGuard(list, "lead list when eventId is present");
    assertEventGuard(detail, "lead detail/update for viewer/event access");
    assert.match(bulkDelete, /role === "exhibitor_viewer" \|\| role === "viewer"/, "bulk delete should block viewer mutations");
    assert.match(bulkDelete, /deleteExhibitorLeadsBulkForCompany/, "bulk delete should call scoped delete helper");
  });

  it("lead picker/search routes remain server-enforced instead of UI-only", () => {
    const search = read("app/api/exhibitor/leads/search/route.ts");
    const picker = read("app/api/exhibitor/briefings/lead-picker/route.ts");

    assertAuth(search, "lead search");
    assert.match(search, /canReadExhibitorLeadsInContext/);
    assertCompanyScopedQuery(search, "lead search");

    assertAuth(picker, "briefing lead picker");
    assert.match(picker, /role[\s\S]*exhibitor_admin/);
    assertEventGuard(picker, "briefing lead picker");
    assert.match(picker, /\.eq\("event_id",\s*eventId\)/);
    assertCompanyScopedQuery(picker, "briefing lead picker");
  });
});

describe("route contracts: import wizard and AI briefings", () => {
  it("import wizard routes authenticate and use company-scoped batch services", () => {
    const activeDraft = read("app/api/exhibitor/import-wizard/active-draft/route.ts");
    const fieldMapping = read("app/api/exhibitor/import-wizard/batches/[batchId]/field-mapping/route.ts");
    const complete = read("app/api/exhibitor/import-wizard/batches/[batchId]/complete/route.ts");
    const batchService = read("lib/server/import-wizard/import-batch-service.ts");

    for (const [label, source] of [
      ["active draft", activeDraft],
      ["field mapping", fieldMapping],
      ["complete", complete],
    ] as const) {
      assertAuth(source, `import wizard ${label}`);
      assert.match(source, /exhibitor_admin|companyId/, `import wizard ${label} should enforce exhibitor company scope`);
    }

    assert.match(activeDraft, /ensureActiveDraftBatch\(companyId\)/);
    assert.match(fieldMapping, /assertDraftBatchWritable|batchId/);
    assert.match(complete, /completeImportBatch|companyId/);
    assert.match(batchService, /getBatchByIdForCompany/);
    assert.match(batchService, /\.eq\("id",\s*batchId\)[\s\S]*\.eq\("company_id",\s*companyId\)/);
    assert.match(batchService, /\.eq\("source_kind",\s*"import_file"\)/);
  });

  it("selected-lead briefing routes use canonical event resolution and scoped lead validation", () => {
    const createRoute = read("app/api/exhibitor/briefings/from-leads/route.ts");
    const createService = read("lib/server/briefings/create-brief-workspace-from-leads.ts");
    const cancelRoute = read("app/api/exhibitor/briefings/batches/[batchId]/cancel-selected-lead-draft/route.ts");
    const cancelService = read("lib/server/briefings/cancel-selected-lead-brief-workspace.ts");

    assertAuth(createRoute, "selected-lead brief create route");
    assert.match(createRoute, /createBriefWorkspaceFromLeadSelection/);
    assert.match(createService, /role !== "exhibitor_admin"/);
    assertEventGuard(createService, "selected-lead brief create service");
    assert.match(createService, /\.eq\("company_id",\s*companyId\)[\s\S]*\.eq\("event_id",\s*eventId\)/);
    assert.match(createService, /validateSelectedLeadRowsForBriefWorkspace/);
    assert.match(createService, /source_kind:\s*"selected_leads"/);

    assertAuth(cancelRoute, "selected-lead brief cancel route");
    assert.match(cancelRoute, /cancelSelectedLeadBriefWorkspace/);
    assertEventGuard(cancelService, "selected-lead brief cancel service");
    assert.match(cancelService, /batchRow\.source_kind !== "selected_leads"/);
    assert.match(cancelService, /batchRow\.status !== "draft"/);
    assert.doesNotMatch(cancelService, /\.from\("leads"\)[\s\S]{0,240}\.delete\(/);
  });
});

describe("route contracts: campaigns, signals, users, settings, workflows, mobile", () => {
  it("campaign routes are authenticated, company-scoped, and block viewer writes", () => {
    const campaigns = read("app/api/campaigns/route.ts");
    const campaignDetail = read("app/api/campaigns/[campaignId]/route.ts");
    const recipients = read("app/api/campaigns/[campaignId]/recipients/route.ts");
    const messages = read("app/api/campaigns/[campaignId]/messages/route.ts");
    const generateDraft = read("app/api/campaigns/[campaignId]/generate-draft/route.ts");

    for (const [label, source] of [
      ["campaigns", campaigns],
      ["recipients", recipients],
      ["messages", messages],
      ["generate draft", generateDraft],
    ] as const) {
      assertAuth(source, label);
      assert.match(source, /company_id/, `${label} should scope to company-owned rows`);
      assert.match(source, /role !== "exhibitor_admin"|sessionUser\.company_id|sessionUser\.companyId/, `${label} should reject unsupported roles or missing company`);
    }
    assert.match(campaigns, /role !== "exhibitor_admin" && role !== "platform_admin"/);
    assert.match(campaigns, /created_by:\s*sessionUser\.userId/, "campaign create should persist the creator");

    assert.match(campaignDetail, /export async function DELETE/, "campaign detail should expose a delete route");
    assertAuth(campaignDetail, "campaign delete");
    assert.match(campaignDetail, /role !== "exhibitor_admin" && role !== "platform_admin"/);
    assertCompanyScopedQuery(campaignDetail, "campaign delete");
    assert.match(campaignDetail, /existing\.status !== "draft"/, "campaign delete should protect non-draft campaigns");
    for (const table of ["email_events", "campaign_messages", "campaign_recipients", "campaigns"] as const) {
      assert.match(campaignDetail, new RegExp(`\\.from\\("${table}"\\)[\\s\\S]{0,180}\\.delete\\(`));
    }
  });

  it("signals and workflows guard event-scoped mutations canonically", () => {
    const signals = read("app/api/signals/route.ts");
    const signalDetail = read("app/api/signals/[signalId]/route.ts");
    const workflows = read("app/api/exhibitor/workflows/create/route.ts");
    const workflowUpdate = read("app/api/exhibitor/workflows/[workflowId]/route.ts");
    const workflowDelete = read("lib/exhibitor/workflows/delete-workflow-template.ts");

    assertAuth(signals, "signals");
    assert.match(signals, /can(Create|Read)Signals/);
    assertEventGuard(signals, "signals create");
    assertEventGuard(signalDetail, "signals update/delete");
    assert.match(signalDetail, /authorizeSignalDelete/);

    assertAuth(workflows, "workflow create");
    assert.match(workflows, /role !== "exhibitor_admin"/);
    assert.match(workflows, /getUserHasExhibitorWebAdminAccess/);
    assertEventGuard(workflows, "workflow create active event");
    assert.match(workflows, /company_id:\s*companyId/);
    assert.match(workflows, /persistWorkflowTemplateAndSteps/);
    assert.match(workflows, /trigger_conditions_jsonb:\s*input\.triggerConditionsJsonb \?\? null/);

    assertAuth(workflowUpdate, "workflow update");
    assert.match(workflowUpdate, /role !== "exhibitor_admin"/);
    assert.match(workflowUpdate, /getUserHasExhibitorWebAdminAccess/);
    assert.match(workflowUpdate, /companyId/);
    assert.match(workflowUpdate, /replaceWorkflowTemplateConfigAndSteps/);
    assert.match(workflowUpdate, /trigger_conditions_jsonb:\s*input\.triggerConditionsJsonb \?\? null/);
    assert.match(workflowUpdate, /export async function DELETE/, "workflow detail should expose a delete route");
    assert.match(workflowUpdate, /role !== "exhibitor_admin" && !isPlatformAdmin/);
    assert.match(workflowUpdate, /deleteWorkflowTemplateForScope/);
    assert.match(workflowUpdate, /eventIdForScope/);
    assert.match(workflowUpdate, /assertEventIdAccessibleForUser/);
    assert.match(workflowDelete, /\.eq\("company_id",\s*existing\.company_id\)/, "workflow delete should be company scoped");
    assert.match(workflowDelete, /existing\.event_id !== eventIdForScope/, "workflow delete should enforce event scope when provided");
    assert.match(workflowDelete, /!existing\.created_by/, "workflow delete should protect system workflows");
    assert.match(workflowDelete, /System workflows cannot be deleted/);
    assert.match(workflowDelete, /\.from\("generated_drafts"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.in\("run_id"/);
    assert.match(workflowDelete, /\.from\("workflow_step_runs"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.in\("run_id"/);
    assert.match(workflowDelete, /\.from\("workflow_runs"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.in\("id"/);
    assert.match(workflowDelete, /\.from\("workflow_steps"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.eq\("template_id"/);
    assert.match(workflowDelete, /\.from\("workflow_templates"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.eq\("id"/);
    assert.match(workflowDelete, /Workflow delete did not persist/);
  });

  it("team/users and settings routes are server-enforced", () => {
    const usersRoute = read("app/api/exhibitor/users/[userId]/route.ts");
    const eventSettings = read("lib/server/events/update-event-settings.ts");
    const appSettingsPage = read("app/app/events/[eventId]/settings/page.tsx");

    assertAuth(usersRoute, "exhibitor users mutation");
    assert.match(usersRoute, /sessionUser\.role !== "exhibitor_admin"/);
    assert.match(usersRoute, /getUserHasExhibitorWebAdminAccess/);
    assert.match(usersRoute, /exhibitorCompanyId/);

    assertEventGuard(eventSettings, "event settings mutation");
    assertEventGuard(appSettingsPage, "event settings page");
  });

  it("mobile events endpoint delegates to canonical backend resolver instead of raw event_users-only access", () => {
    const route = read("app/api/mobile/events/route.ts");
    const service = read("lib/server/mobile-accessible-events.ts");
    const core = read("lib/mobile/mobile-events-core.ts");

    assertAuth(route, "mobile events");
    assert.match(route, /enforceMobileAppAccess:\s*false/);
    assert.match(route, /getMobileAccessibleEventsForSession/);
    assert.match(service, /resolveAccessibleEventIdsForUser/);
    assert.match(service, /roleNeedsAppEnabledAssignments/);
    assert.match(core, /roleUsesViewerMobileAppPermission/);
    assert.match(core, /requiresAppEnabledAssignment && !appEnabledEventIds\.has\(id\)/);
  });
});
