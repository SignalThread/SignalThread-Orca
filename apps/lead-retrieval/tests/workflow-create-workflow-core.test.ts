import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanupE2EWorkflowArtifactsForRun,
  cleanupPersistentTestArtifactsForRun,
  e2eWorkflowArtifactNameLikeQuery,
  e2eWorkflowArtifactNamePrefix
} from "../e2e/helpers/supabase";
import {
  buildComposeParams,
  buildEnrichParams,
  buildWorkflowStepInsertRows,
  parseCreateWorkflowInput,
  resolveWorkflowPinFromActiveEvent,
  validateCreateWorkflowInput
} from "../lib/exhibitor/workflows/create-workflow-core";
import {
  persistWorkflowTemplateAndSteps,
  replaceWorkflowTemplateConfigAndSteps
} from "../lib/exhibitor/workflows/create-workflow-persistence";
import { workflowBuilderInitialStateFromDetail } from "../lib/exhibitor/workflows/workflow-builder-state";
import { loadWorkflowTemplatesForList } from "../lib/exhibitor/workflows/load-workflow-templates";
import { COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE } from "../lib/workflows/step-handlers/compose-campaign-draft-pure";
import {
  CRM_SYNC_HUBSPOT_STEP_TYPE,
  CRM_SYNC_SALESFORCE_STEP_TYPE
} from "../lib/workflows/step-handlers/crm-sync-types";
import { ENRICH_LEAD_STEP_TYPE } from "../lib/workflows/step-handlers/enrich-lead-pure";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const SIG_A = "aaaaaaaa-bbbb-4ccc-bbbb-cccccccccccc";
const SIG_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const COMPANY_ID = "company-1";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(repoRoot, "test-fixtures", "legacy-lr-migrations");
const PROVIDER_CATEGORY_IDS = {
  apollo: ["company", "contact"],
  pdl: ["company", "contact"],
  zoominfo: ["company", "contact", "intent"]
} as const;

function workflowTemplateColumnsFromMigrations(): Set<string> {
  const columns = new Set<string>();
  const migrationFiles = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const fileName of migrationFiles) {
    const sql = readFileSync(join(migrationsDir, fileName), "utf8");
    const createMatch = sql.match(/create table if not exists public\.workflow_templates\s*\(([\s\S]*?)\n\);/i);
    if (createMatch) {
      for (const rawLine of createMatch[1]!.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("--") || line.startsWith("constraint")) continue;
        const match = line.match(/^([a-z][a-z0-9_]*)\s/i);
        if (match) columns.add(match[1]!);
      }
    }

    const alterRe =
      /alter table public\.workflow_templates\s+add column if not exists\s+([a-z][a-z0-9_]*)/gi;
    for (const match of sql.matchAll(alterRe)) {
      columns.add(match[1]!);
    }
  }

  return columns;
}

test("resolveWorkflowPinFromActiveEvent: no active event → company-wide any scope", () => {
  assert.deepEqual(resolveWorkflowPinFromActiveEvent({ activeEventId: null, containerKind: null }), {
    scope: "any",
    event_id: null
  });
  assert.deepEqual(
    resolveWorkflowPinFromActiveEvent({ activeEventId: "ev-1", containerKind: null }),
    { scope: "any", event_id: null }
  );
});

test("resolveWorkflowPinFromActiveEvent: pinned event + container kind", () => {
  assert.deepEqual(
    resolveWorkflowPinFromActiveEvent({
      activeEventId: "ev-1",
      containerKind: "event"
    }),
    { scope: "event", event_id: "ev-1" }
  );
  assert.deepEqual(
    resolveWorkflowPinFromActiveEvent({
      activeEventId: "cc-1",
      containerKind: "continuous_capture"
    }),
    { scope: "continuous_capture", event_id: "cc-1" }
  );
});

test("validateCreateWorkflowInput: enrich requires adapter key", () => {
  const missingKey = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: ""
  });
  const err = validateCreateWorkflowInput(missingKey);
  assert.ok(err);
  assert.match(err!.message, /enrichment provider/i);

  const ok = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "apollo"
  });
  assert.equal(validateCreateWorkflowInput(ok), null);
});

test("validateCreateWorkflowInput: incomplete workflow is allowed while builder authoring remains flexible", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false
  });
  assert.equal(validateCreateWorkflowInput(input), null);
});

test("validateCreateWorkflowInput: signals-only workflow is allowed without a terminal step", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    selected_signal_ids: [SIG_A]
  });
  assert.equal(input.signalsStageEnabled, true);
  assert.equal(validateCreateWorkflowInput(input), null);
});

test("parseCreateWorkflowInput: CRM enabled defaults hubspot when provider omitted", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true
  });
  assert.equal(input.crmProvider, "hubspot");
  assert.equal(validateCreateWorkflowInput(input), null);
});

test("parseCreateWorkflowInput: infers Salesforce provider from Salesforce operation when provider omitted", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true,
    crm_operation: "salesforce_upsert_lead"
  });
  assert.equal(input.crmProvider, "salesforce");
  assert.equal(input.crmOperation, "salesforce_upsert_lead");
});

test("validateCreateWorkflowInput: CRM-only template allowed", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true,
    crm_provider: "hubspot"
  });
  assert.equal(validateCreateWorkflowInput(input), null);
});

test("validateCreateWorkflowInput: compose allows empty selected_signal_ids with subject", () => {
  const emptySignals = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [],
    subject_template: "Hello {{first_name}}"
  });
  assert.equal(validateCreateWorkflowInput(emptySignals), null);
});

test("parseCreateWorkflowInput: signals_stage_enabled defaults true", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [],
    subject_template: "Hi"
  });
  assert.equal(input.signalsStageEnabled, true);
});

test("parseCreateWorkflowInput: persists signals_stage_enabled false", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true,
    crm_provider: "hubspot",
    signals_stage_enabled: false
  });
  assert.equal(input.signalsStageEnabled, false);
});

test("persistWorkflowTemplateAndSteps: saving a workflow creates a workflow_templates row", async () => {
  const fake = createFakeSupabase({
    workflow_templates: [],
    workflow_steps: [],
    workflow_runs: []
  });

  const result = await persistWorkflowTemplateAndSteps(asAdminClient(fake), {
    templateRow: {
      company_id: COMPANY_ID,
      name: "Signals only draft",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      created_by: "user-1"
    },
    stepBodies: []
  });

  assert.deepEqual(result.ok, true);
  assert.equal(fake._tables.workflow_templates.length, 1);
  assert.equal(fake._tables.workflow_steps.length, 0);
  assert.equal(fake._tables.workflow_templates[0]!.company_id, COMPANY_ID);
  assert.equal(fake._tables.workflow_templates[0]!.name, "Signals only draft");
});

test("persisted workflow appears on the workflows list for the same exhibitor company scope", async () => {
  const fake = createFakeSupabase({
    workflow_templates: [],
    workflow_steps: [],
    workflow_runs: []
  });

  await persistWorkflowTemplateAndSteps(asAdminClient(fake), {
    templateRow: {
      company_id: COMPANY_ID,
      name: "Saved workflow",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: false,
      version: 1,
      created_by: "user-1"
    },
    stepBodies: []
  });

  const sameCompanyRows = await loadWorkflowTemplatesForList(asAdminClient(fake), {
    companyId: COMPANY_ID,
    activeEventId: null
  });
  assert.equal(sameCompanyRows.length, 1);
  assert.equal(sameCompanyRows[0]!.name, "Saved workflow");
  assert.equal(sameCompanyRows[0]!.is_enabled, false);
  assert.deepEqual(sameCompanyRows[0]!.steps, []);

  const otherCompanyRows = await loadWorkflowTemplatesForList(asAdminClient(fake), {
    companyId: "company-2",
    activeEventId: null
  });
  assert.deepEqual(otherCompanyRows, []);
});

test("fake Supabase rejects unknown workflow_templates columns like PostgREST", async () => {
  const fake = createFakeSupabase({
    workflow_templates: [
      {
        id: "workflow-1",
        company_id: COMPANY_ID,
        name: "Saved workflow",
        trigger_event: "lead_captured",
        scope: "any",
        event_id: null,
        is_enabled: true,
        version: 1,
        created_by: "user-1",
        trigger_conditions_jsonb: null
      }
    ]
  });

  const insertResult = await (fake as any)
    .from("workflow_templates")
    .insert({
      company_id: COMPANY_ID,
      name: "Bad workflow",
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      created_by: "user-1",
      trigger_conditions_jsonb_typo: null
    })
    .select("id")
    .maybeSingle();
  assert.match(insertResult.error?.message ?? "", /trigger_conditions_jsonb_typo/);

  const updateResult = await (fake as any)
    .from("workflow_templates")
    .update({ trigger_conditions_jsonb_typo: null })
    .eq("id", "workflow-1");
  assert.match(updateResult.error?.message ?? "", /trigger_conditions_jsonb_typo/);

  const selectResult = await (fake as any)
    .from("workflow_templates")
    .select("id, trigger_conditions_jsonb_typo")
    .eq("id", "workflow-1")
    .maybeSingle();
  assert.match(selectResult.error?.message ?? "", /trigger_conditions_jsonb_typo/);
});

test("workflow template persistence writes only columns declared by migrations", async () => {
  const migrationColumns = workflowTemplateColumnsFromMigrations();
  assert.ok(
    migrationColumns.has("trigger_conditions_jsonb"),
    "workflow_templates.trigger_conditions_jsonb must be declared in migrations"
  );

  const fake = createFakeSupabase({
    workflow_templates: [
      {
        id: "workflow-1",
        company_id: COMPANY_ID,
        name: "Old name",
        trigger_event: "lead_captured",
        scope: "any",
        event_id: null,
        is_enabled: false,
        version: 1,
        created_by: "user-1",
        trigger_conditions_jsonb: null
      }
    ],
    workflow_steps: []
  });

  const createResult = await persistWorkflowTemplateAndSteps(asAdminClient(fake), {
    templateRow: {
      company_id: COMPANY_ID,
      name: "Schema checked workflow",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      created_by: "user-1",
      trigger_conditions_jsonb: { lead_captured: { rating: { in: [4, 5] } } }
    },
    stepBodies: []
  });
  assert.equal(createResult.ok, true);

  const updateResult = await replaceWorkflowTemplateConfigAndSteps(asAdminClient(fake), {
    workflowId: "workflow-1",
    companyId: COMPANY_ID,
    templatePatch: {
      name: "Schema checked edit",
      is_enabled: true,
      trigger_conditions_jsonb: { lead_captured: { temperature: { in: ["hot"] } } }
    },
    stepBodies: []
  });
  assert.equal(updateResult.ok, true);

  const writtenWorkflowTemplateColumns = new Set(
    fake._calls
      .filter((call) => call.table === "workflow_templates" && call.patch)
      .flatMap((call) => Object.keys(call.patch ?? {}))
  );

  assert.ok(writtenWorkflowTemplateColumns.has("trigger_conditions_jsonb"));
  for (const col of writtenWorkflowTemplateColumns) {
    assert.ok(
      migrationColumns.has(col),
      `workflow_templates persistence wrote '${col}', but migrations do not declare it`
    );
  }
});

test("replaceWorkflowTemplateConfigAndSteps: edits existing workflow config in company scope", async () => {
  const fake = createFakeSupabase({
    workflow_templates: [
      {
        id: "workflow-1",
        company_id: COMPANY_ID,
        name: "Old name",
        is_enabled: false,
        trigger_conditions_jsonb: null
      }
    ],
    workflow_steps: [
      {
        id: "step-old",
        template_id: "workflow-1",
        step_index: 0,
        step_type: ENRICH_LEAD_STEP_TYPE,
        step_key: "enrich",
        params_jsonb: { enrichmentAdapterKey: "apollo" },
        requires_approval: false
      }
    ]
  });

  const result = await replaceWorkflowTemplateConfigAndSteps(asAdminClient(fake), {
    workflowId: "workflow-1",
    companyId: COMPANY_ID,
    templatePatch: {
      name: "Edited workflow",
      is_enabled: true,
      trigger_conditions_jsonb: { lead_captured: { rating: { in: [4, 5] } } }
    },
    stepBodies: [
      {
        step_index: 0,
        step_type: COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE,
        step_key: "compose_draft",
        params_jsonb: {
          selectedSignalIds: [SIG_A],
          subjectTemplate: "Hello",
          templateName: "Lead Intel",
          outputActionKind: "campaign_draft"
        },
        requires_approval: true
      }
    ]
  });

  assert.deepEqual(result, { ok: true, templateId: "workflow-1" });
  assert.equal(fake._tables.workflow_templates[0]!.name, "Edited workflow");
  assert.equal(fake._tables.workflow_templates[0]!.is_enabled, true);
  assert.equal(fake._tables.workflow_steps.length, 1);
  assert.equal(fake._tables.workflow_steps[0]!.template_id, "workflow-1");
  assert.equal(fake._tables.workflow_steps[0]!.step_type, COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE);
  assert.deepEqual(fake._tables.workflow_steps[0]!.params_jsonb, {
    selectedSignalIds: [SIG_A],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft"
  });
});

test("replaceWorkflowTemplateConfigAndSteps: rejects edits outside company scope", async () => {
  const fake = createFakeSupabase({
    workflow_templates: [
      {
        id: "workflow-1",
        company_id: "company-2",
        name: "Other company",
        is_enabled: false
      }
    ],
    workflow_steps: []
  });

  const result = await replaceWorkflowTemplateConfigAndSteps(asAdminClient(fake), {
    workflowId: "workflow-1",
    companyId: COMPANY_ID,
    templatePatch: {
      name: "Should not save",
      is_enabled: true,
      trigger_conditions_jsonb: null
    },
    stepBodies: []
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected workflow update to be rejected");
  }
  assert.equal(result.stage, "template_lookup");
  assert.equal(fake._tables.workflow_templates[0]!.name, "Other company");
});

test("workflowBuilderInitialStateFromDetail: existing workflow detail starts from saved view config", () => {
  const initial = workflowBuilderInitialStateFromDetail({
    template: {
      id: "workflow-1",
      name: "Saved workflow",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      trigger_conditions_jsonb: {
        lead_captured: {
          rating: { in: [4, 5] },
          temperature: { in: ["hot"] }
        }
      },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    },
    steps: [
      {
        id: "step-1",
        step_index: 0,
        step_type: ENRICH_LEAD_STEP_TYPE,
        step_key: "enrich",
        params_jsonb: { enrichmentAdapterKey: "zoominfo", focusAreas: ["company", "intent"] },
        requires_approval: false
      },
      {
        id: "step-2",
        step_index: 1,
        step_type: COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE,
        step_key: "compose_draft",
        params_jsonb: {
          selectedSignalIds: [SIG_B, SIG_A],
          subjectTemplate: "Hi {{first_name}}",
          templateName: "Lead Intel",
          outputActionKind: "ai_email_draft",
          authoringToneHint: "concise"
        },
        requires_approval: true
      }
    ]
  });

  assert.equal(initial.name, "Saved workflow");
  assert.equal(initial.isEnabled, true);
  assert.equal(initial.enrichLead, true);
  assert.equal(initial.enrichmentAdapterKey, "zoominfo");
  assert.deepEqual(initial.enrichmentFocusIds, ["company", "intent"]);
  assert.equal(initial.composeDraft, true);
  assert.equal(initial.outputActionKind, "ai_email_draft");
  assert.deepEqual(initial.orderedSignalIds, [SIG_B, SIG_A]);
  assert.equal(initial.subjectTemplate, "Hi {{first_name}}");
  assert.equal(initial.terminalApprovalRequired, true);
  assert.deepEqual(initial.triggerRuleConfig, {
    ratings: ["4", "5"],
    temperatures: ["hot"],
    statuses: []
  });
});

test("workflowBuilderInitialStateFromDetail: legacy status-only trigger config loads safely", () => {
  const initial = workflowBuilderInitialStateFromDetail({
    template: {
      id: "workflow-legacy-status",
      name: "Legacy status workflow",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      trigger_conditions_jsonb: {
        lead_captured: {
          ruleId: "ui-status-new",
          status: { in: ["new"] }
        }
      },
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    },
    steps: []
  });

  assert.deepEqual(initial.triggerRuleConfig, {
    ratings: [],
    temperatures: [],
    statuses: ["new"]
  });
});

test("workflowBuilderInitialStateFromDetail: Salesforce CRM step restores note selections", () => {
  const initial = workflowBuilderInitialStateFromDetail({
    template: {
      id: "workflow-salesforce",
      name: "Salesforce workflow",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      trigger_conditions_jsonb: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    },
    steps: [
      {
        id: "step-1",
        step_index: 0,
        step_type: CRM_SYNC_SALESFORCE_STEP_TYPE,
        step_key: "crm_salesforce_sync",
        params_jsonb: {
          provider: "salesforce",
          operation: "salesforce_upsert_lead",
          includeLeadDetails: true,
          includeAiNotes: true
        },
        requires_approval: false
      }
    ]
  });

  assert.equal(initial.crmPushEnabled, true);
  assert.equal(initial.crmProvider, "salesforce");
  assert.deepEqual(initial.crmContentOptions, {
    includeLeadDetails: true,
    includeAiNotes: true,
    includeCampaignContextInCrmNote: false,
    includeRecommendedFollowUpInCrmNote: true,
    includeSuggestedEmailDraftInCrmNote: true,
    suggestedEmailInstructions: null
  });
});

test("workflowBuilderInitialStateFromDetail: legacy granular note flags map to includeAiNotes", () => {
  const initial = workflowBuilderInitialStateFromDetail({
    template: {
      id: "workflow-salesforce-legacy",
      name: "Salesforce legacy workflow",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      trigger_conditions_jsonb: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    },
    steps: [
      {
        id: "step-1",
        step_index: 0,
        step_type: CRM_SYNC_SALESFORCE_STEP_TYPE,
        step_key: "crm_salesforce_sync",
        params_jsonb: {
          operation: "salesforce_upsert_lead",
          includeObjections: true
        },
        requires_approval: false
      }
    ]
  });

  assert.deepEqual(initial.crmContentOptions, {
    includeLeadDetails: true,
    includeAiNotes: true,
    includeCampaignContextInCrmNote: false,
    includeRecommendedFollowUpInCrmNote: true,
    includeSuggestedEmailDraftInCrmNote: true,
    suggestedEmailInstructions: null
  });
});

test("WorkflowDetailView edit UI is gated and starts in view mode", () => {
  const source = readFileSync(
    join(repoRoot, "components/exhibitor/workflows/workflow-detail-view.tsx"),
    "utf8"
  );
  assert.match(source, /useState\(false\)/, "detail page should default to view mode");
  assert.match(source, /canManageWorkflow && builderInitialState/, "Edit action should be role-gated");
  assert.match(source, />\s*Edit\s*</, "authorized users should see an explicit Edit action");
  assert.match(source, /mode="edit"/, "edit action should reuse the orchestration builder in edit mode");
  assert.match(source, /onCancel=\{\(\) => setEditing\(false\)\}/, "Cancel should return to view mode");
});

test("WorkflowOrchestrationBuilder edit save requires explicit warning confirmation", () => {
  const source = readFileSync(
    join(repoRoot, "components/exhibitor/workflows/workflow-orchestration-builder.tsx"),
    "utf8"
  );
  assert.match(
    source,
    /window\.confirm\(\s*"Editing this workflow may affect future leads that match this trigger\. Existing completed runs will not be changed\."/,
    "edit save should show the required warning before persisting"
  );
  assert.match(source, /method: mode === "edit" \? "PATCH" : "POST"/);
  assert.match(source, /Save Changes/);
});

test("E2E workflow artifact cleanup filter is scoped to the current test run id", () => {
  const testRunId = "cleanup-scope-123";
  assert.equal(e2eWorkflowArtifactNamePrefix(testRunId), "E2E PW cleanup-scope-123");

  const query = e2eWorkflowArtifactNameLikeQuery(testRunId);
  assert.equal(query, "name=like.E2E%20PW%20cleanup-scope-123*");
  assert.notEqual(query, "name=like.E2E%20PW*");
  assert.match(query, /cleanup-scope-123/);
});

test("E2E workflow artifact cleanup deletes only workflow ids discovered for the current run", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string; body?: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });

    if (method === "GET" && url.includes("/workflow_templates?")) {
      if (url.includes("id=eq.workflow-run-a")) {
        assert.match(url, /company_id=eq\.company-1/);
        if (url.includes("select=id") && !url.includes("select=id,company_id,event_id,created_by")) {
          return Response.json([]);
        }
        return Response.json([
          {
            id: "workflow-run-a",
            company_id: "company-1",
            event_id: "event-1",
            created_by: "user-1"
          }
        ]);
      }
      assert.match(url, /name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      assert.doesNotMatch(url, /archived_at/);
      return Response.json([{ id: "workflow-run-a" }]);
    }
    if (method === "GET" && url.includes("/signals?")) {
      assert.match(url, /name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      assert.match(url, /event_id=eq\.event-1/);
      return Response.json([{ id: "signal-run-a" }]);
    }
    if (method === "GET" && url.includes("/campaigns?")) {
      assert.match(url, /name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      return Response.json([]);
    }
    if (method === "GET" && url.includes("/leads?")) {
      assert.match(url, /full_name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      assert.match(url, /event_id=eq\.event-1/);
      return Response.json([]);
    }
    if (method === "GET" && url.includes("/import_batches?")) {
      assert.match(url, /source_last_filename=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      return Response.json([]);
    }
    if (method === "GET" && url.includes("/workflow_runs?")) {
      assert.match(url, /template_id=eq\.workflow-run-a/);
      return Response.json([{ id: "workflow-cleanup-run-a" }]);
    }
    if (method === "GET") {
      return Response.json([]);
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const cleaned = await cleanupE2EWorkflowArtifactsForRun({
      testRunId: "run-a",
      companyId: "company-1",
      eventId: "event-1",
      baseUrl: "http://localhost:3000"
    });

    assert.deepEqual(cleaned, {
      workflowIds: ["workflow-run-a"],
      signalIds: ["signal-run-a"],
      campaignIds: []
    });
    const deletes = requests.filter((request) => request.method === "DELETE");
    assert.ok(deletes.every((request) => !request.url.includes("E2E%20PW")));
    assert.ok(deletes.some((request) => request.url.includes("generated_drafts?run_id=in.(workflow-cleanup-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_step_runs?run_id=in.(workflow-cleanup-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_runs?id=in.(workflow-cleanup-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_steps?template_id=eq.workflow-run-a")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_templates?id=eq.workflow-run-a")));
    assert.ok(deletes.some((request) => request.url.includes("company_id=eq.company-1")));
    assert.ok(deletes.some((request) => request.url.includes("event_id=eq.event-1")));
    assert.ok(deletes.some((request) => request.url.includes("signals?id=in.(signal-run-a)")));
    assert.ok(deletes.every((request) => !request.url.includes("run-b")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("persistent E2E cleanup deletes only current-run test artifacts and their child rows", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string; body?: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });

    if (method === "GET" && url.includes("/leads?")) {
      assert.match(url, /full_name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      assert.match(url, /event_id=eq\.event-1/);
      return Response.json([{ id: "lead-run-a" }]);
    }
    if (method === "GET" && url.includes("/workflow_templates?")) {
      if (url.includes("id=eq.workflow-direct")) {
        assert.match(url, /company_id=eq\.company-1/);
        if (url.includes("select=id") && !url.includes("select=id,company_id,event_id,created_by")) {
          return Response.json([]);
        }
        return Response.json([
          {
            id: "workflow-direct",
            company_id: "company-1",
            event_id: "event-1",
            created_by: "user-1"
          }
        ]);
      }
      if (url.includes("id=eq.workflow-run-a")) {
        assert.match(url, /company_id=eq\.company-1/);
        if (url.includes("select=id") && !url.includes("select=id,company_id,event_id,created_by")) {
          return Response.json([]);
        }
        return Response.json([
          {
            id: "workflow-run-a",
            company_id: "company-1",
            event_id: "event-1",
            created_by: "user-1"
          }
        ]);
      }
      assert.match(url, /name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      assert.doesNotMatch(url, /archived_at/);
      return Response.json([{ id: "workflow-run-a" }]);
    }
    if (method === "GET" && url.includes("/signals?")) {
      assert.match(url, /name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      assert.match(url, /event_id=eq\.event-1/);
      return Response.json([{ id: "signal-run-a" }]);
    }
    if (method === "GET" && url.includes("/campaigns?")) {
      assert.match(url, /name=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      return Response.json([{ id: "campaign-run-a" }]);
    }
    if (method === "GET" && url.includes("/import_batches?")) {
      assert.match(url, /source_last_filename=like\.E2E%20PW%20run-a\*/);
      assert.match(url, /company_id=eq\.company-1/);
      return Response.json([{ id: "batch-run-a" }]);
    }
    if (method === "GET" && url.includes("/campaign_messages?")) {
      return Response.json([{ id: "message-run-a" }]);
    }
    if (method === "GET" && url.includes("/workflow_runs?")) {
      if (url.includes("template_id=eq.workflow-direct")) {
        return Response.json([{ id: "workflow-direct-run" }]);
      }
      if (url.includes("template_id=eq.workflow-run-a")) {
        return Response.json([{ id: "workflow-run-a-run" }]);
      }
      assert.match(url, /lead_id=in\.\(lead-direct,lead-run-a\)/);
      return Response.json([{ id: "run-run-a" }]);
    }
    if (method === "GET") {
      return Response.json([]);
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const cleaned = await cleanupPersistentTestArtifactsForRun({
      testRunId: "run-a",
      companyId: "company-1",
      eventId: "event-1",
      baseUrl: "http://localhost:3000",
      leadIds: ["lead-direct"],
      workflowIds: ["workflow-direct"],
      signalIds: ["signal-direct"],
      campaignIds: ["campaign-direct"],
      importBatchIds: ["batch-direct"]
    });

    assert.deepEqual(cleaned, {
      leadIds: ["lead-direct", "lead-run-a"],
      workflowIds: ["workflow-direct", "workflow-run-a"],
      signalIds: ["signal-direct", "signal-run-a"],
      campaignIds: ["campaign-direct", "campaign-run-a"],
      importBatchIds: ["batch-direct", "batch-run-a"]
    });

    const deletes = requests.filter((request) => request.method === "DELETE");
    assert.equal(requests.some((request) => request.method === "PATCH"), false);
    assert.ok(deletes.some((request) => request.url.includes("workflow_templates?id=eq.workflow-direct")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_templates?id=eq.workflow-run-a")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_runs?id=in.(workflow-direct-run)")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_runs?id=in.(workflow-run-a-run)")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_steps?template_id=eq.workflow-direct")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_steps?template_id=eq.workflow-run-a")));
    assert.ok(deletes.some((request) => request.url.includes("company_id=eq.company-1")));
    assert.ok(deletes.some((request) => request.url.includes("event_id=eq.event-1")));
    assert.ok(deletes.some((request) => request.url.includes("signals?id=in.(signal-direct,signal-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("campaigns?id=in.(campaign-direct,campaign-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("import_batches?id=in.(batch-direct,batch-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("leads?id=in.(lead-direct,lead-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("workflow_step_runs?run_id=in.(run-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("generated_drafts?lead_id=in.(lead-direct,lead-run-a)")));
    assert.ok(deletes.some((request) => request.url.includes("campaign_recipients?lead_id=in.(lead-direct,lead-run-a)")));
    assert.ok(deletes.every((request) => !request.url.includes("run-b")));
    assert.ok(deletes.every((request) => !request.url.includes("E2E%20PW")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workflows list is empty only when no workflows exist for the company scope", async () => {
  const fake = createFakeSupabase({
    workflow_templates: [],
    workflow_steps: [],
    workflow_runs: []
  });

  const beforeSave = await loadWorkflowTemplatesForList(asAdminClient(fake), {
    companyId: COMPANY_ID,
    activeEventId: null
  });
  assert.deepEqual(beforeSave, []);

  await persistWorkflowTemplateAndSteps(asAdminClient(fake), {
    templateRow: {
      company_id: COMPANY_ID,
      name: "Now visible",
      description: null,
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: true,
      version: 1,
      created_by: "user-1"
    },
    stepBodies: []
  });

  const afterSave = await loadWorkflowTemplatesForList(asAdminClient(fake), {
    companyId: COMPANY_ID,
    activeEventId: null
  });
  assert.equal(afterSave.length, 1);
});

test("buildComposeParams: embeds signalsStageEnabled false", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [],
    subject_template: "Hello",
    signals_stage_enabled: false
  });
  const params = buildComposeParams(input);
  assert.deepEqual(params?.signalsStageEnabled, false);
});

test("buildWorkflowStepInsertRows: enrich then compose with approval on compose only", () => {
  const composeParams = {
    selectedSignalIds: [SIG_A],
    subjectTemplate: "Hi",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft"
  };
  const rows = buildWorkflowStepInsertRows({
    enrichLead: true,
    enrichParams: { enrichmentAdapterKey: "apollo" },
    composeCampaignDraft: true,
    composeParams,
    terminalRequiresApproval: true
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0]!.params_jsonb, { enrichmentAdapterKey: "apollo" });
  assert.deepEqual(
    rows.map((r) => ({
      step_index: r.step_index,
      step_type: r.step_type,
      requires_approval: r.requires_approval
    })),
    [
      { step_index: 0, step_type: ENRICH_LEAD_STEP_TYPE, requires_approval: false },
      { step_index: 1, step_type: COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE, requires_approval: true }
    ]
  );
  assert.equal(rows[1]!.step_key, "compose_draft");
});

test("buildWorkflowStepInsertRows: CRM hubspot embeds signalsStageEnabled false when disabled", () => {
  const rows = buildWorkflowStepInsertRows({
    enrichLead: false,
    enrichParams: null,
    composeCampaignDraft: false,
    composeParams: null,
    crmPushEnabled: true,
    crmProvider: "hubspot",
    crmOperation: "hubspot_upsert_contact",
    signalsStageEnabled: false,
    terminalRequiresApproval: false
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.params_jsonb, {
    provider: "hubspot",
    operation: "hubspot_upsert_contact",
    includeLeadDetails: true,
    includeAiNotes: false,
    includeCampaignContextInCrmNote: false,
    includeRecommendedFollowUpInCrmNote: false,
    includeSuggestedEmailDraftInCrmNote: false,
    suggestedEmailInstructions: null,
    crmSyncConfigMode: "integration_default",
    signalsStageEnabled: false
  });
});

test("buildWorkflowStepInsertRows: optional CRM hubspot step after compose can own approval", () => {
  const composeParams = {
    selectedSignalIds: [SIG_A],
    subjectTemplate: "Hi",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft"
  };
  const rows = buildWorkflowStepInsertRows({
    enrichLead: false,
    enrichParams: null,
    composeCampaignDraft: true,
    composeParams,
    crmPushEnabled: true,
    crmProvider: "hubspot",
    crmOperation: "hubspot_upsert_contact",
    terminalRequiresApproval: true
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.requires_approval, false);
  assert.equal(rows[1]!.step_type, CRM_SYNC_HUBSPOT_STEP_TYPE);
  assert.equal(rows[1]!.step_key, "crm_hubspot_sync");
  assert.deepEqual(rows[1]!.params_jsonb, {
    provider: "hubspot",
    operation: "hubspot_upsert_contact",
    includeLeadDetails: true,
    includeAiNotes: false,
    includeCampaignContextInCrmNote: false,
    includeRecommendedFollowUpInCrmNote: false,
    includeSuggestedEmailDraftInCrmNote: false,
    suggestedEmailInstructions: null,
    crmSyncConfigMode: "integration_default"
  });
  assert.equal(rows[1]!.requires_approval, true);
});

test("buildWorkflowStepInsertRows: Salesforce step persists note selections in params_jsonb", () => {
  const rows = buildWorkflowStepInsertRows({
    enrichLead: false,
    enrichParams: null,
    composeCampaignDraft: false,
    composeParams: null,
    crmPushEnabled: true,
    crmProvider: "salesforce",
    crmOperation: "salesforce_upsert_lead",
    crmContentOptions: {
      includeLeadDetails: true,
      includeAiNotes: true,
      includeCampaignContextInCrmNote: true,
      includeRecommendedFollowUpInCrmNote: true,
      includeSuggestedEmailDraftInCrmNote: true,
      suggestedEmailInstructions: "Ask for a 15-minute demo."
    },
    terminalRequiresApproval: false
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.step_type, CRM_SYNC_SALESFORCE_STEP_TYPE);
  assert.deepEqual(rows[0]!.params_jsonb, {
    provider: "salesforce",
    operation: "salesforce_upsert_lead",
    includeLeadDetails: true,
    includeAiNotes: true,
    includeCampaignContextInCrmNote: true,
    includeRecommendedFollowUpInCrmNote: true,
    includeSuggestedEmailDraftInCrmNote: true,
    suggestedEmailInstructions: "Ask for a 15-minute demo.",
    crmSyncConfigMode: "integration_default"
  });
});

test("buildWorkflowStepInsertRows: CRM override behavior is persisted in params_jsonb", () => {
  const input = parseCreateWorkflowInput({
    name: "Override CRM behavior",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true,
    crm_provider: "hubspot",
    crm_sync_config_mode: "override",
    crm_record_type: "contact",
    crm_match_behavior: "create_only",
    crm_source_label: "Workflow-specific source"
  });

  assert.equal(validateCreateWorkflowInput(input), null);

  const rows = buildWorkflowStepInsertRows({
    enrichLead: input.enrichLead,
    enrichParams: null,
    composeCampaignDraft: input.composeCampaignDraft,
    composeParams: null,
    crmPushEnabled: input.crmPushEnabled,
    crmProvider: input.crmProvider,
    crmOperation: input.crmOperation,
    crmContentOptions: input.crmContentOptions,
    crmSyncConfigMode: input.crmSyncConfigMode,
    crmSyncConfigOverride: input.crmSyncConfigOverride,
    terminalRequiresApproval: input.terminalRequiresApproval
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0]!.params_jsonb, {
    provider: "hubspot",
    operation: "hubspot_upsert_contact",
    includeLeadDetails: true,
    includeAiNotes: false,
    includeCampaignContextInCrmNote: false,
    includeRecommendedFollowUpInCrmNote: false,
    includeSuggestedEmailDraftInCrmNote: false,
    suggestedEmailInstructions: null,
    crmSyncConfigMode: "override",
    crmRecordType: "contact",
    crmMatchBehavior: "create_only",
    crmSourceLabel: "Workflow-specific source"
  });
});

test("parseCreateWorkflowInput: defaults output_action_kind for compose", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello"
  });
  assert.equal(input.outputActionKind, "campaign_draft");
});

test("parseCreateWorkflowInput + buildComposeParams: persist ai_email_draft label", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello",
    output_action_kind: "ai_email_draft"
  });
  assert.equal(input.outputActionKind, "ai_email_draft");
  const params = buildComposeParams(input);
  assert.deepEqual(params, {
    selectedSignalIds: [SIG_A],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "ai_email_draft"
  });
});

test("parseCreateWorkflowInput: preserves send_email for validation", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello",
    output_action_kind: "send_email"
  });
  assert.equal(input.outputActionKind, "send_email");
});

test("parseCreateWorkflowInput: unknown output_action_kind falls back", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello",
    output_action_kind: "crm_push"
  });
  assert.equal(input.outputActionKind, "campaign_draft");
});

test("validateCreateWorkflowInput: rejects send_email until workflow sending exists", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello",
    output_action_kind: "send_email"
  });
  const err = validateCreateWorkflowInput(input);
  assert.deepEqual(err, {
    field: "output_action_kind",
    message: "Send Email is not available yet. Use Email Draft or Campaign Draft."
  });
});

test("parseCreateWorkflowInput: defaults subject when compose enabled via API shape", () => {
  const input = parseCreateWorkflowInput({
    name: "Named",
    enrich_lead: true,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    enrichment_adapter_key: "pdl"
  });
  assert.ok(input.subjectTemplate.length > 0);
  assert.equal(validateCreateWorkflowInput(input), null);
});

test("validateCreateWorkflowInput: enrich rejects empty enrichment_focus_areas when provided", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "apollo",
    enrichment_focus_areas: []
  });
  const err = validateCreateWorkflowInput(input);
  assert.ok(err);
  assert.match(err!.message, /enrichment category/i);
});

test("validateCreateWorkflowInput: rejects enrichment_focus_areas that are invalid for the selected provider", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "pdl",
    enrichment_focus_areas: ["intent"]
  });
  const err = validateCreateWorkflowInput(input);
  assert.ok(err);
  assert.match(err!.message, /enrichment category/i);
});

test("validateCreateWorkflowInput: respects actual enabled ZoomInfo integration settings", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "zoominfo",
    enrichment_focus_areas: ["contact"]
  });
  const err = validateCreateWorkflowInput(input, {
    ...PROVIDER_CATEGORY_IDS,
    zoominfo: ["company", "intent"]
  });
  assert.ok(err);
  assert.match(err!.message, /enrichment category/i);
});

test("buildEnrichParams: persists focusAreas when enrichment_focus_areas sent", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "apollo",
    enrichment_focus_areas: ["company", "contact"]
  });
  assert.equal(validateCreateWorkflowInput(input), null);
  assert.deepEqual(buildEnrichParams(input), {
    enrichmentAdapterKey: "apollo",
    focusAreas: ["company", "contact"]
  });
});

test("buildEnrichParams: omits focusAreas when enrichment_focus_areas omitted (legacy)", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "apollo"
  });
  assert.equal(validateCreateWorkflowInput(input), null);
  assert.deepEqual(buildEnrichParams(input), { enrichmentAdapterKey: "apollo" });
});

test("buildEnrichParams: output keeps the selected provider and only its valid categories", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "zoominfo",
    enrichment_focus_areas: ["company", "intent", "contact"]
  });
  assert.equal(validateCreateWorkflowInput(input), null);
  assert.deepEqual(
    buildEnrichParams(input, {
      ...PROVIDER_CATEGORY_IDS,
      zoominfo: ["company", "intent"]
    }),
    {
      enrichmentAdapterKey: "zoominfo",
      focusAreas: ["company", "intent"]
    }
  );
});

test("buildEnrichParams: omits disabled ZoomInfo categories even if the client submits them", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: true,
    compose_campaign_draft: false,
    enrichment_adapter_key: "zoominfo",
    enrichment_focus_areas: ["company", "contact", "intent"]
  });
  assert.deepEqual(buildEnrichParams(input, {
    ...PROVIDER_CATEGORY_IDS,
    zoominfo: ["company", "contact"]
  }), {
    enrichmentAdapterKey: "zoominfo",
    focusAreas: ["company", "contact"]
  });
});

test("parseCreateWorkflowInput + buildComposeParams: persists authoringToneHint", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello",
    authoring_tone_hint: "direct_brevity"
  });
  const params = buildComposeParams(input);
  assert.ok(params);
  assert.equal(params!.authoringToneHint, "direct_brevity");
});

test("parseCreateWorkflowInput: compose defaults terminalRequiresApproval true", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello"
  });
  assert.equal(input.terminalRequiresApproval, true);
});

test("parseCreateWorkflowInput: compose honors terminal_requires_approval false", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: true,
    selected_signal_ids: [SIG_A],
    subject_template: "Hello",
    terminal_requires_approval: false
  });
  assert.equal(input.terminalRequiresApproval, false);
});

test("parseCreateWorkflowInput: CRM defaults terminalRequiresApproval false", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true,
    crm_provider: "hubspot"
  });
  assert.equal(input.terminalRequiresApproval, false);
});

test("validateCreateWorkflowInput: CRM-only approval is allowed as an execution gate", () => {
  const input = parseCreateWorkflowInput({
    name: "Test",
    enrich_lead: false,
    compose_campaign_draft: false,
    crm_push_enabled: true,
    crm_provider: "hubspot",
    terminal_requires_approval: true
  });
  assert.equal(input.terminalRequiresApproval, true);
  assert.equal(validateCreateWorkflowInput(input), null);
});

test("buildWorkflowStepInsertRows: compose-only respects terminalRequiresApproval false", () => {
  const composeParams = {
    selectedSignalIds: [SIG_A],
    subjectTemplate: "Hi",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft"
  };
  const rows = buildWorkflowStepInsertRows({
    enrichLead: false,
    enrichParams: null,
    composeCampaignDraft: true,
    composeParams,
    terminalRequiresApproval: false
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.requires_approval, false);
});

test("buildWorkflowStepInsertRows: CRM-only respects terminalRequiresApproval true", () => {
  const rows = buildWorkflowStepInsertRows({
    enrichLead: false,
    enrichParams: null,
    composeCampaignDraft: false,
    composeParams: null,
    crmPushEnabled: true,
    crmProvider: "hubspot",
    crmOperation: "hubspot_upsert_contact",
    terminalRequiresApproval: true
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.step_type, "crm_sync_hubspot");
  assert.equal(rows[0]!.requires_approval, true);
});

test("buildWorkflowStepInsertRows: compose before CRM keeps approval on the selected terminal CRM step", () => {
  const composeParams = {
    selectedSignalIds: [SIG_A],
    subjectTemplate: "Hi",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft"
  };
  const rows = buildWorkflowStepInsertRows({
    enrichLead: false,
    enrichParams: null,
    composeCampaignDraft: true,
    composeParams,
    crmPushEnabled: true,
    crmProvider: "hubspot",
    crmOperation: "hubspot_upsert_contact",
    terminalRequiresApproval: true
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.step_type, "compose_campaign_draft");
  assert.equal(rows[0]!.requires_approval, false);
  assert.equal(rows[1]!.step_type, "crm_sync_hubspot");
  assert.equal(rows[1]!.requires_approval, true);
});
