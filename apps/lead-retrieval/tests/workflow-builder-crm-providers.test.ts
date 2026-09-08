import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildWorkflowBuilderCrmProviders } from "../lib/exhibitor/workflows/workflow-builder-crm-resolver";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("buildWorkflowBuilderCrmProviders: returns both HubSpot and Salesforce when both are connected", () => {
  const providers = buildWorkflowBuilderCrmProviders({
    statuses: [
      { provider: "hubspot", connected: true },
      { provider: "salesforce", connected: true }
    ]
  });

  assert.deepEqual(
    providers.map((provider) => provider.id),
    ["hubspot", "salesforce"]
  );
});

test("buildWorkflowBuilderCrmProviders: returns Salesforce only for Salesforce-only account", () => {
  const providers = buildWorkflowBuilderCrmProviders({
    statuses: [{ provider: "salesforce", connected: true }],
    syncConfigs: {
      salesforce: {
        recordType: "lead",
        matchBehavior: "update_existing",
        sourceLabel: "BioTech Expo"
      }
    }
  });

  assert.deepEqual(
    providers.map((provider) => provider.id),
    ["salesforce"]
  );
  assert.deepEqual(providers[0]!.defaultSyncConfig, {
    recordType: "lead",
    matchBehavior: "update_existing",
    sourceLabel: "BioTech Expo"
  });
});

test("buildWorkflowBuilderCrmProviders: returns empty list when no CRM integrations are connected", () => {
  const providers = buildWorkflowBuilderCrmProviders({
    statuses: []
  });

  assert.deepEqual(providers, []);
});

test("workflow CRM inspector shows one shared AI notes option across CRM providers", () => {
  const inspectorSource = readFileSync(
    join(repoRoot, "components/exhibitor/workflows/workflow-orchestration-inspector.tsx"),
    "utf8"
  );
  const tabsSource = readFileSync(
    join(repoRoot, "components/exhibitor/workflows/workflow-inspector-tabs.ts"),
    "utf8"
  );

  assert.match(inspectorSource, /AI conversation notes/);
  assert.match(inspectorSource, /Include campaign context in CRM note/);
  assert.match(inspectorSource, /Include recommended follow-up in CRM note/);
  assert.match(inspectorSource, /Include suggested email draft in CRM note/);
  assert.match(inspectorSource, /Email draft instructions/);
  assert.match(inspectorSource, /No email is sent automatically\./);
  assert.match(inspectorSource, /Effective CRM behavior/);
  assert.match(inspectorSource, /Use integration defaults/);
  assert.match(inspectorSource, /Override for this workflow/);
  assert.match(inspectorSource, /Campaign or source label/);
  assert.match(
    inspectorSource,
    /Includes the conversation summary and objections when available\./
  );
  assert.doesNotMatch(inspectorSource, /HubSpot note sync is coming soon\./);
  assert.doesNotMatch(inspectorSource, /AI conversation summary/);
  assert.doesNotMatch(inspectorSource, /Objections and concerns/);
  assert.doesNotMatch(inspectorSource, /Recommended next steps/);
  assert.doesNotMatch(inspectorSource, /Follow-up email draft/);
  assert.match(tabsSource, /case "crmFuture":\s+return \[\{ id: "destination", label: "Destination" \}\];/);
});
