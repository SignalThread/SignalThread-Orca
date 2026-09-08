import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("E2E artifact cleanup contracts", () => {
  it("local cleanup script is guarded, dry-run by default, and scoped to E2E PW rows", () => {
    const script = read("scripts/cleanup-e2e-artifacts.ts");

    assert.match(script, /--confirm-local/);
    assert.match(script, /E2E_ARTIFACT_CLEANUP_CONFIRM/);
    assert.match(script, /NODE_ENV[\s\S]{0,120}production/);
    assert.match(script, /VERCEL_ENV[\s\S]{0,120}production/);
    assert.match(script, /E2E_ARTIFACT_CLEANUP_ALLOW_REMOTE_TEST/);
    assert.match(script, /name=like\.\$\{postgrestValue\("E2E PW"\)\}\*/);
    assert.match(script, /full_name=like\.\$\{postgrestValue\("E2E PW"\)\}\*/);
    assert.match(script, /source_last_filename=like\.\$\{postgrestValue\("E2E PW"\)\}\*/);
    assert.doesNotMatch(script, /name=like\.E2E PW%/);
    assert.doesNotMatch(script, /full_name=like\.E2E PW%/);
  });

  it("cleanup deletes workflow templates and dependent rows before parents", () => {
    const script = read("scripts/cleanup-e2e-artifacts.ts");
    const campaignOrder = [
      'deleteRows("email_events"',
      'deleteRows("campaign_messages"',
      'deleteRows("campaign_recipients"',
      'deleteRows("campaigns"'
    ].map((needle) => script.indexOf(needle));
    const importBatchOrder = [
      'deleteRows("import_wizard_enrichment_runs"',
      'deleteRows("import_batch_row_briefings"',
      'deleteRows("import_batch_rows"',
      'deleteRows("import_batch_field_mapping_state"',
      'deleteRows("import_batches"'
    ].map((needle) => script.indexOf(needle));
    const leadOrder = [
      'deleteRows("generated_drafts", `run_id=in.',
      'deleteRows("workflow_step_runs"',
      'deleteRows("workflow_runs"',
      'deleteRows("generated_drafts", `lead_id=in.',
      'deleteRows("campaign_recipients", `lead_id=in.',
      'deleteRows("import_batch_row_briefings", `lead_id=in.',
      'deleteRows("lead_cumulative_insights"',
      'deleteRows("lead_voice_notes"',
      'deleteRows("lead_briefings"',
      'deleteRows("lead_enrichments"',
      'deleteRows("lead_conversations"',
      'deleteRows("leads"'
    ].map((needle) => script.indexOf(needle));

    assert.match(script, /deleteRows\("generated_drafts", `run_id=in\./);
    assert.match(script, /deleteRows\("workflow_step_runs", `run_id=in\./);
    assert.match(script, /deleteRows\("workflow_runs", `id=in\./);
    assert.match(script, /deleteRows\("workflow_steps", `template_id=in\./);
    assert.match(script, /deleteRows\("workflow_templates", `id=in\./);
    assert.doesNotMatch(script, /patchRows\(\s*"workflow_templates"/);
    assert.doesNotMatch(script, /archived_at/);
    assert.equal(campaignOrder.every((index) => index >= 0), true);
    assert.deepEqual([...campaignOrder].sort((a, b) => a - b), campaignOrder);
    assert.equal(importBatchOrder.every((index) => index >= 0), true);
    assert.deepEqual([...importBatchOrder].sort((a, b) => a - b), importBatchOrder);
    assert.equal(leadOrder.every((index) => index >= 0), true);
    assert.deepEqual([...leadOrder].sort((a, b) => a - b), leadOrder);
  });

  it("Playwright cleanup paths use the shared persistent artifact cleanup helper", () => {
    const spec = read("e2e/signals.spec.ts");
    const commandSurfaceSpec = read("e2e/exhibitor-leads-command-surface.spec.ts");
    const helper = read("e2e/helpers/supabase.ts");
    const workflowDeleteHelper = read("lib/exhibitor/workflows/delete-workflow-template.ts");

    assert.match(spec, /randomUUID\(\)/);
    assert.match(spec, /e2eWorkflowArtifactNamePrefix\(testRunId\)/);
    assert.match(spec, /cleanupE2EWorkflowArtifactsForRun\(cleanupScope\)/);
    assert.match(spec, /findE2EWorkflowArtifactIdsForRun\(cleanupScope\)/);
    assert.match(spec, /expect\(remaining\.signalIds\)\.toEqual\(\[\]\)/);
    assert.match(spec, /expect\(remaining\.workflowIds\)\.toEqual\(\[\]\)/);
    assert.match(spec, /expect\(remaining\.campaignIds\)\.toEqual\(\[\]\)/);
    assert.match(commandSurfaceSpec, /randomUUID\(\)/);
    assert.match(commandSurfaceSpec, /cleanupPersistentTestArtifactsForRun/);
    assert.match(commandSurfaceSpec, /leadIds:\s*input\.leadIds/);
    assert.match(commandSurfaceSpec, /campaignIds:\s*input\.campaignIds/);
    assert.match(commandSurfaceSpec, /importBatchIds:\s*input\.importBatchIds/);

    assert.match(helper, /cleanupPersistentTestArtifactsForRun/);
    assert.match(helper, /findPersistentTestArtifactIdsForRun/);
    assert.match(helper, /deleteWorkflowTemplateForScope/);
    assert.match(helper, /findLeadIdsForE2ERun/);
    assert.match(helper, /findImportBatchIdsForE2ERun/);
    assert.match(helper, /findCampaignIdsForE2ERun/);
    assert.match(helper, /deleteWorkflowTemplatesById/);
    assert.match(workflowDeleteHelper, /\.from\("workflow_templates"\)[\s\S]{0,260}\.delete\(\)/);
    assert.match(workflowDeleteHelper, /Workflow delete did not persist/);
    assert.match(helper, /deleteCampaignsById/);
    assert.match(helper, /campaign_messages/);
    assert.match(helper, /campaign_recipients/);
    assert.match(helper, /email_events/);
    assert.match(helper, /deleteLeadsById/);
    assert.match(helper, /deleteImportBatchesById/);
    assert.match(helper, /workflow_step_runs/);
    assert.match(helper, /workflow_runs/);
    assert.match(helper, /lead_conversations/);
  });
});
