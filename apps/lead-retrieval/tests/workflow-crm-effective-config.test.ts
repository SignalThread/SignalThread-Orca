import assert from "node:assert/strict";
import test from "node:test";
import {
  parseWorkflowCrmSyncConfigOverride,
  resolveWorkflowCrmSyncConfig,
  validateResolvedWorkflowCrmSyncConfig,
  workflowCrmSyncConfigSummary
} from "../lib/workflows/step-handlers/crm-sync-effective-config";

test("workflow CRM step using integration defaults resolves expected config", () => {
  const parsed = parseWorkflowCrmSyncConfigOverride(
    {
      crmSyncConfigMode: "integration_default",
      crmRecordType: "contact",
      crmMatchBehavior: "create_only"
    },
    "salesforce"
  );

  const resolved = resolveWorkflowCrmSyncConfig({
    provider: "salesforce",
    workflowMode: parsed.mode,
    workflowOverride: parsed.override,
    integrationDefault: {
      recordType: "lead",
      matchBehavior: "update_existing",
      sourceLabel: "Trade show"
    }
  });

  assert.deepEqual(resolved, {
    provider: "salesforce",
    mode: "integration_default",
    recordType: "lead",
    matchBehavior: "update_existing",
    sourceLabel: "Trade show"
  });
  assert.deepEqual(workflowCrmSyncConfigSummary(resolved), [
    "Object: Salesforce Lead",
    "Match: Update existing only",
    "Source: Trade show"
  ]);
});

test("workflow CRM step override takes precedence over integration defaults", () => {
  const parsed = parseWorkflowCrmSyncConfigOverride(
    {
      crm_sync_config_mode: "override",
      crm_record_type: "contact",
      crm_match_behavior: "create_only",
      crm_source_label: "Workflow source"
    },
    "hubspot"
  );

  const resolved = resolveWorkflowCrmSyncConfig({
    provider: "hubspot",
    workflowMode: parsed.mode,
    workflowOverride: parsed.override,
    integrationDefault: {
      recordType: "contact",
      matchBehavior: "upsert_by_email",
      sourceLabel: "Integration source"
    }
  });

  assert.deepEqual(resolved, {
    provider: "hubspot",
    mode: "override",
    recordType: "contact",
    matchBehavior: "create_only",
    sourceLabel: "Workflow source"
  });
});

test("workflow CRM config validation rejects impossible provider/object combinations", () => {
  assert.deepEqual(
    validateResolvedWorkflowCrmSyncConfig({
      provider: "salesforce",
      mode: "override",
      recordType: "contact",
      matchBehavior: "upsert_by_email",
      sourceLabel: null
    }),
    {
      ok: false,
      error: "Salesforce workflow sync currently supports Salesforce Lead records only."
    }
  );

  assert.deepEqual(
    validateResolvedWorkflowCrmSyncConfig({
      provider: "hubspot",
      mode: "override",
      recordType: "lead",
      matchBehavior: "upsert_by_email",
      sourceLabel: null
    }),
    {
      ok: false,
      error: "HubSpot workflow sync currently supports HubSpot contact records only."
    }
  );
});
