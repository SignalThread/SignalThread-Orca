import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { updateWorkflowTemplateStatusForScope } from "../lib/exhibitor/workflows/update-workflow-template-status";
import { createFakeSupabase } from "./helpers/fake-supabase";

const WORKFLOW_ID = "workflow-1";
const COMPANY_ID = "company-1";
const EVENT_ID = "event-1";

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    company_id: COMPANY_ID,
    name: "User workflow",
    description: null,
    trigger_event: "lead_captured",
    scope: "event",
    event_id: EVENT_ID,
    is_enabled: true,
    version: 1,
    created_by: "user-1",
    created_at: "2026-06-22T10:00:00.000Z",
    updated_at: "2026-06-22T10:00:00.000Z",
    ...overrides
  };
}

describe("updateWorkflowTemplateStatusForScope", () => {
  it("toggles active workflow inactive in company and event scope", async () => {
    const fake = createFakeSupabase({ workflow_templates: [template()] });

    const result = await updateWorkflowTemplateStatusForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: COMPANY_ID,
      eventIdForScope: EVENT_ID,
      isEnabled: false
    });

    assert.deepEqual(result, { ok: true, workflowId: WORKFLOW_ID, isEnabled: false });
    assert.equal(fake._tables.workflow_templates[0]!.is_enabled, false);
    assert.equal(fake._tables.workflow_templates[0]!.created_at, "2026-06-22T10:00:00.000Z");
  });

  it("toggles inactive workflow active", async () => {
    const fake = createFakeSupabase({ workflow_templates: [template({ is_enabled: false })] });

    const result = await updateWorkflowTemplateStatusForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: COMPANY_ID,
      eventIdForScope: EVENT_ID,
      isEnabled: true
    });

    assert.deepEqual(result, { ok: true, workflowId: WORKFLOW_ID, isEnabled: true });
    assert.equal(fake._tables.workflow_templates[0]!.is_enabled, true);
  });

  it("rejects status changes outside company or event scope", async () => {
    const fake = createFakeSupabase({ workflow_templates: [template()] });

    const wrongCompany = await updateWorkflowTemplateStatusForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: "company-2",
      eventIdForScope: EVENT_ID,
      isEnabled: false
    });
    const wrongEvent = await updateWorkflowTemplateStatusForScope(fake, {
      workflowId: WORKFLOW_ID,
      companyId: COMPANY_ID,
      eventIdForScope: "event-2",
      isEnabled: false
    });

    assert.equal(wrongCompany.ok, false);
    assert.equal(wrongCompany.status, 404);
    assert.equal(wrongEvent.ok, false);
    assert.equal(wrongEvent.status, 404);
    assert.equal(fake._tables.workflow_templates[0]!.is_enabled, true);
  });
});

describe("workflow status toggle UI and route contract", () => {
  it("renders an interactive table toggle and rolls back failed saves", () => {
    const source = readFileSync(
      join(process.cwd(), "components/exhibitor/workflows/workflows-list-view.tsx"),
      "utf8"
    );

    assert.match(source, /function WorkflowStatusToggle/);
    assert.match(source, /role="switch"/);
    assert.match(source, /aria-checked=\{isEnabled\}/);
    assert.match(source, /data-testid="workflow-status-toggle"/);
    assert.match(source, /\/api\/exhibitor\/workflows\/\$\{encodeURIComponent\(workflow\.id\)\}\/status/);
    assert.match(source, /body: JSON\.stringify\(\{ is_enabled: nextEnabled \}\)/);
    assert.match(source, /setIsEnabled\(nextEnabled\)/);
    assert.match(source, /setIsEnabled\(!nextEnabled\)/);
    assert.match(source, /onToast\("error"/);
    assert.doesNotMatch(source, /<StatusBadge/);
  });

  it("status endpoint enforces admin role, web access, company scope, and event scope", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/exhibitor/workflows/[workflowId]/status/route.ts"),
      "utf8"
    );

    assert.match(source, /resolveApiSession\(request\)/);
    assert.match(source, /role !== "exhibitor_admin" && !isPlatformAdmin/);
    assert.match(source, /getUserHasExhibitorWebAdminAccess\(userId, companyId\)/);
    assert.match(source, /assertEventIdAccessibleForUser\(userId, eventIdForScope\)/);
    assert.match(source, /typeof body\.is_enabled !== "boolean"/);
    assert.match(source, /updateWorkflowTemplateStatusForScope/);
  });

  it("lead capture runner only selects enabled workflow templates", () => {
    const source = readFileSync(join(process.cwd(), "lib/workflows/emit/lead-captured-emit.ts"), "utf8");
    assert.match(source, /\.eq\("is_enabled", true\)/);
  });
});
