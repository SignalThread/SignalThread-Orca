import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  buildSelectedLeadBriefWorkspaceRows,
  validateSelectedLeadRowsForBriefWorkspace,
  type SelectedLeadBriefWorkspaceLead,
} from "../lib/briefings/selected-lead-brief-workspace";
import { formatBriefingsWorkspaceSourceLine } from "../lib/exhibitor/briefings-ui-copy";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function lead(id: string, overrides: Partial<SelectedLeadBriefWorkspaceLead> = {}): SelectedLeadBriefWorkspaceLead {
  return {
    id,
    company_id: "company-a",
    event_id: "event-a",
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    job_title: "Director",
    company_text: "Analytical Engines",
    temperature: "warm",
    rating: 4,
    status: "new",
    follow_up_date: null,
    ...overrides,
  };
}

describe("selected-lead AI brief workspaces", () => {
  it("builds staged rows from existing lead fields without fake import filenames", () => {
    const rows = buildSelectedLeadBriefWorkspaceRows([
      lead("lead-1", { full_name: "Grace Hopper", email: "grace@example.com", rating: 5 }),
    ]);
    assert.deepEqual(rows, [
      ["lead-1", "Grace Hopper", "grace@example.com", "Director", "Analytical Engines", "warm", "5", "new", ""],
    ]);
  });

  it("rejects missing or unauthorized lead ids before workspace creation", () => {
    assert.throws(
      () =>
        validateSelectedLeadRowsForBriefWorkspace({
          requestedLeadIds: ["lead-1", "lead-2"],
          rows: [lead("lead-1")],
          companyId: "company-a",
          eventId: "event-a",
        }),
      /lead_selection_unauthorized/
    );

    assert.throws(
      () =>
        validateSelectedLeadRowsForBriefWorkspace({
          requestedLeadIds: ["lead-1"],
          rows: [lead("lead-1", { event_id: "event-b" })],
          companyId: "company-a",
          eventId: "event-a",
        }),
      /lead_selection_unauthorized/
    );
  });

  it("formats selected-lead workspace source text distinctly from import files", () => {
    assert.equal(
      formatBriefingsWorkspaceSourceLine({
        sourceKind: "selected_leads",
        selectedLeadCount: 3,
      }),
      "Created from selected leads · 3 selected leads"
    );
    assert.equal(
      formatBriefingsWorkspaceSourceLine({
        sourceKind: "import_file",
        sourceLastFilename: "/tmp/leads.csv",
      }),
      "Import file: leads.csv"
    );
  });

  it("Leads selected action bar includes Create brief and sends only selected ids", () => {
    const source = read("components/leads/exhibitor-leads-table.tsx");
    assert.match(source, /data-testid="bulk-create-brief"/);
    assert.match(source, /\/api\/exhibitor\/briefings\/from-leads/);
    assert.match(source, /JSON\.stringify\(\{\s*leadIds,\s*eventId:/s);
    assert.match(source, /router\.push\(json\.workspaceUrl \?\? `\/exhibitor\/briefings\/\$\{encodeURIComponent\(json\.batchId\)\}`\)/);
    assert.doesNotMatch(source, /router\.push\(json\.workspaceUrl \?\? `\/exhibitor\/briefings\/\$\{encodeURIComponent\(json\.batchId\)\}\/review`\)/);
    assert.match(source, /canEdit && scopeMode === "manual"/);
  });

  it("AI Briefings hub exposes a lead picker entry point and selected-lead source metadata", () => {
    const section = read("components/exhibitor/briefings-workspaces-section.tsx");
    const picker = read("components/exhibitor/briefings-lead-picker-launcher.tsx");
    assert.match(section, /BriefingsLeadPickerLauncher/);
    assert.match(section, /source_selected_lead_ids/);
    assert.match(section, /formatBriefingsWorkspaceSourceLine/);
    assert.match(picker, /data-testid="briefings-create-from-leads"/);
    assert.match(picker, /data-testid="briefings-lead-picker-modal"/);
    assert.match(picker, /placeholder="Search by name, email, or company"/);
    assert.match(picker, /\/api\/exhibitor\/briefings\/lead-picker/);
    assert.match(picker, /\/api\/exhibitor\/briefings\/from-leads/);
    assert.match(picker, /router\.push\(json\.workspaceUrl \?\? `\/exhibitor\/briefings\/\$\{encodeURIComponent\(json\.batchId\)\}`\)/);
    assert.doesNotMatch(picker, /router\.push\(json\.workspaceUrl \?\? `\/exhibitor\/briefings\/\$\{encodeURIComponent\(json\.batchId\)\}\/review`\)/);
  });

  it("shared API route uses the canonical selected-lead workspace service", () => {
    const route = read("app/api/exhibitor/briefings/from-leads/route.ts");
    const service = read("lib/server/briefings/create-brief-workspace-from-leads.ts");
    const migration = read("supabase/migrations/0077_import_batches_selected_lead_source.sql");
    assert.match(route, /createBriefWorkspaceFromLeadSelection/);
    assert.match(route, /import \{ batchBriefingsPath \} from "@\/lib\/import-wizard\/paths"/);
    assert.match(route, /workspaceUrl:\s*batchBriefingsPath\(result\.batchId\)/);
    assert.doesNotMatch(route, /workspaceUrl:\s*batchBriefingsReviewPath\(result\.batchId\)/);
    assert.match(service, /resolveValidatedActiveEventIdForUser/);
    assert.match(service, /source_kind:\s*"selected_leads"/);
    assert.match(service, /published_lead_id:\s*selectedLeads\[index\]!\.id/);
    assert.match(migration, /source_kind/);
    assert.match(migration, /source_selected_lead_ids/);
    assert.match(migration, /import_batches_one_import_file_draft_per_company/);
  });

  it("selected-lead prepare workspace exposes a cancel action only for draft selected-lead runs", () => {
    const page = read("app/(app)/exhibitor/briefings/[batchId]/page.tsx");
    const client = read("components/exhibitor/brief-readiness-client.tsx");
    const shell = read("components/exhibitor/briefing-batch-workspace-shell.tsx");
    assert.match(page, /canCancelSelectedLeadDraft=\{batch\.status === "draft" && batch\.sourceKind === "selected_leads"\}/);
    assert.match(client, /BriefingWorkspaceCancelAction/);
    assert.match(client, /canCancelSelectedLeadDraft \? <BriefingWorkspaceCancelAction batchId=\{batchId\} \/> : undefined/);
    assert.match(shell, /headerActions\?: ReactNode/);
    assert.match(shell, /\{headerActions\}/);
    assert.doesNotMatch(page, /batch\.status === "published"[\s\S]*canCancelSelectedLeadDraft/);
  });

  it("workspace header groups cancel and status with aligned sizing", () => {
    const shell = read("components/exhibitor/briefing-batch-workspace-shell.tsx");
    const action = read("components/exhibitor/briefing-workspace-cancel-action.tsx");
    assert.match(shell, /data-testid="briefing-workspace-header-actions"/);
    assert.match(shell, /data-testid="briefing-workspace-status-badge"/);
    assert.match(shell, /inline-flex h-8 shrink-0 items-center justify-center rounded-md/);
    assert.match(action, /inline-flex h-8 items-center justify-center rounded-md/);
    assert.match(action, /data-testid="selected-lead-brief-cancel-trigger"/);
  });

  it("new selected-lead workspaces land on Prepare unless Review is explicitly opened", () => {
    const preparePage = read("app/(app)/exhibitor/briefings/[batchId]/page.tsx");
    const reviewPage = read("app/(app)/exhibitor/briefings/[batchId]/review/page.tsx");
    const readinessClient = read("components/exhibitor/brief-readiness-client.tsx");
    const shell = read("components/exhibitor/briefing-batch-workspace-shell.tsx");

    assert.match(preparePage, /BatchBriefReadinessClient/);
    assert.match(reviewPage, /BatchReviewBriefClient/);
    assert.match(readinessClient, /href=\{batchBriefingsReviewPath\(batchId\)\}/);
    assert.match(readinessClient, /data-testid="readiness-continue-review"/);
    assert.match(shell, /const isReview = pathname === reviewPath \|\| pathname\.endsWith\("\/review"\)/);
    assert.match(shell, /className=\{stepTabClass\(!isReview\)\}/);
    assert.match(shell, /aria-current=\{!isReview \? "page" : undefined\}/);
    assert.match(shell, /className=\{stepTabClass\(isReview\)\}/);
    assert.match(shell, /aria-current=\{isReview \? "page" : undefined\}/);
  });

  it("selected-lead cancel confirmation uses safe copy and returns to the workspace list", () => {
    const action = read("components/exhibitor/briefing-workspace-cancel-action.tsx");
    assert.match(action, /data-testid="selected-lead-brief-cancel-trigger"/);
    assert.match(action, /Cancel brief/);
    assert.match(action, /Cancel this brief\?/);
    assert.match(
      action,
      /This will delete the in-progress brief workspace for these selected leads\. Your leads will not be deleted\./
    );
    assert.match(action, /Keep brief/);
    assert.match(action, /data-testid="selected-lead-brief-cancel-confirm"/);
    assert.match(action, /cancel-selected-lead-draft/);
    assert.match(action, /router\.push\(`\$\{EXHIBITOR_BRIEFINGS_PATH\}#briefings-workspaces`\)/);
  });

  it("selected-lead cancel API is draft-only and does not delete underlying leads", () => {
    const route = read("app/api/exhibitor/briefings/batches/[batchId]/cancel-selected-lead-draft/route.ts");
    const service = read("lib/server/briefings/cancel-selected-lead-brief-workspace.ts");
    assert.match(route, /cancelSelectedLeadBriefWorkspace/);
    assert.match(route, /exhibitor_admin/);
    assert.match(route, /batch_not_draft/);
    assert.match(route, /Only in-progress brief drafts can be canceled\./);
    assert.match(service, /\.from\("import_batches"\)\s*\n\s*\.select\("id, company_id, status, source_kind, source_selected_lead_ids"\)/);
    assert.match(service, /batchRow\.source_kind !== "selected_leads"/);
    assert.match(service, /batchRow\.status !== "draft"/);
    assert.match(service, /assertEventIdAccessibleForUser/);
    assert.match(service, /\.from\("leads"\)\s*\n\s*\.select\("id, company_id, event_id"\)/);
    assert.match(service, /\.from\("import_batches"\)\s*\n\s*\.update\(\{ status: "discarded"/);
    assert.doesNotMatch(service, /\.from\("leads"\)[\s\S]*\.delete\(/);
  });
});
