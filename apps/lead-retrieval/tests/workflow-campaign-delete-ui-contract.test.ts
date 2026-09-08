import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("workflow and campaign delete UI contracts", () => {
  it("workflow delete API is scoped, role-gated, protects system workflows, and deletes workflow records", () => {
    const source = read("app/api/exhibitor/workflows/[workflowId]/route.ts");
    const helper = read("lib/exhibitor/workflows/delete-workflow-template.ts");

    assert.match(source, /export async function DELETE/);
    assert.match(source, /role !== "exhibitor_admin" && !isPlatformAdmin/);
    assert.match(source, /deleteWorkflowTemplateForScope/);
    assert.match(source, /eventIdForScope/);
    assert.match(source, /assertEventIdAccessibleForUser/);
    assert.match(helper, /\.eq\("company_id",\s*companyId\)/);
    assert.match(helper, /!existing\.created_by/);
    assert.match(helper, /System workflows cannot be deleted/);
    assert.match(helper, /\.from\("generated_drafts"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.in\("run_id"/);
    assert.match(helper, /\.from\("workflow_step_runs"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.in\("run_id"/);
    assert.match(helper, /\.from\("workflow_runs"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.in\("id"/);
    assert.match(helper, /\.from\("workflow_steps"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.eq\("template_id"/);
    assert.match(helper, /\.from\("workflow_templates"\)[\s\S]{0,260}\.delete\(\)[\s\S]{0,120}\.eq\("id"/);
  });

  it("workflow list exposes Delete only to workflow managers and removes rows after delete", () => {
    const source = read("components/exhibitor/workflows/workflows-list-view.tsx");

    assert.match(source, /canManageWorkflows=\{createWorkflowHref !== null\}/);
    assert.match(source, /deleteUrl/);
    assert.match(source, /eventIdForScope/);
    assert.match(source, /method:\s*"DELETE"/);
    assert.match(source, /setDeletedIds/);
    assert.match(source, /visibleWorkflows/);
    assert.match(source, /Boolean\(workflow\.created_by\)/);
    assert.match(source, /System workflows cannot be deleted/);
    assert.match(source, /Delete workflow\?/);
    assert.match(source, /This permanently deletes this workflow and its related workflow runs\/step runs\/drafts\. This cannot be undone\./);
    assert.match(source, /Delete workflow/);
    assert.match(source, /Workflow deleted\./);
    assert.match(source, /router\.refresh\(\)/);
    assert.match(source, /data-testid=\{`delete-workflow-\$\{workflow\.id\}`\}/);
    assert.doesNotMatch(source, /Archive/);
  });

  it("workflow detail exposes Delete for user-created workflows and navigates back after delete", () => {
    const source = read("components/exhibitor/workflows/workflow-detail-view.tsx");

    assert.match(source, /template\.created_by/);
    assert.match(source, /eventIdForNav/);
    assert.match(source, /deleteUrl/);
    assert.match(source, /method:\s*"DELETE"/);
    assert.match(source, /Delete workflow\?/);
    assert.match(source, /This permanently deletes this workflow and its related workflow runs\/step runs\/drafts\. This cannot be undone\./);
    assert.match(source, /Delete workflow/);
    assert.match(source, /Workflow deleted\./);
    assert.match(source, /router\.push\([^)]*\/exhibitor\/workflows/);
    assert.match(source, /System workflows cannot be deleted/);
    assert.doesNotMatch(source, /Archive/);
  });

  it("campaign list exposes draft delete actions and hides rows after delete", () => {
    const source = read("components/campaigns/campaigns-list.tsx");

    assert.match(source, /fetch\(`\/api\/campaigns\/\$\{encodeURIComponent\(campaign\.id\)\}`,[\s\S]{0,120}method:\s*"DELETE"/);
    assert.match(source, /setCampaigns\(\(current\) => current\.filter\(\(item\) => item\.id !== campaign\.id\)\)/);
    assert.match(source, /router\.refresh\(\)/);
    assert.match(source, /c\.status === "draft"/);
    assert.match(source, /data-testid=\{`delete-campaign-\$\{c\.id\}`\}/);
  });
});
