import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildWorkflowGraph } from "@/components/exhibitor/workflows/workflow-builder-graph";

const read = (path: string) => readFileSync(path, "utf8");
const noop = () => {};

test("Leads uses one intrinsic card composition with auto-fit filters", () => {
  const search = read("components/leads/exhibitor-leads-search-form.tsx");
  const table = read("components/leads/exhibitor-leads-table.tsx");

  assert.match(search, /w-full max-w-xl/);
  assert.doesNotMatch(search, /lg:w-\[400px\]/);
  assert.match(table, /grid-cols-\[repeat\(auto-fit,minmax\(min\(100%,11rem\),1fr\)\)\]/);
  assert.match(table, /className="h-9 w-full/);
  assert.match(table, /flex min-w-0 flex-wrap items-stretch overflow-hidden/);
  assert.match(table, /flex-\[1_1_19rem\]/);
  assert.match(table, /flex-\[0_1_auto\] flex-wrap items-end/);
  assert.doesNotMatch(table, /(?:md|lg|xl):(?:flex-row|grid-cols|flex-\[1_1_(?:38|62)%\])/);
  assert.doesNotMatch(table, /flex-\[1_1_38%\]|flex-\[1_1_62%\]/);
  assert.match(table, /break-words text-\[13px\]/);
});

test("workflow canvas responds to its available width and keeps every node on one center axis", () => {
  const canvas = read("components/exhibitor/workflows/workflow-orchestration-builder-canvas.tsx");
  const builder = read("components/exhibitor/workflows/workflow-orchestration-builder.tsx");
  const nodeSource = read("components/exhibitor/workflows/workflow-builder-nodes.tsx");

  assert.match(canvas, /ResizeObserver/);
  assert.match(canvas, /centerWorkflow/);
  assert.match(canvas, /\[container-type:inline-size\]/);
  assert.match(builder, /flex min-h-\[34rem\] min-w-0 flex-wrap items-stretch/);
  assert.match(builder, /flex-\[2_1_40rem\]/);
  assert.match(builder, /flex-\[1_1_24rem\]/);
  assert.doesNotMatch(builder, /2xl:grid-cols|basis-full|sm:ml-auto sm:basis-auto/);
  assert.match(nodeSource, /min\(\$\{WF_NODE_WIDTH\}px, calc\(100cqw - 3rem\)\)/);

  const { nodes } = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: true,
    crmProviderId: "hubspot",
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "Create contact",
    crmOperationDescription: "Create a contact",
    selectedStep: "trigger",
    orderedSignalsMeta: [{ id: "signal-1", name: "Signal", rank: 1 }],
    subjectTemplate: "Hello",
    templateName: "Template",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Workflow",
    isEnabled: true,
    afterTriggerTerminal: false,
    afterEnrichTerminal: false,
    callbacks: {
      select: noop,
      openInsertAfterTrigger: noop,
      openInsertAfterEnrich: noop,
      removeEnrich: noop,
      removeSignals: noop,
      removeCompose: noop,
      removeCrm: noop,
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "Provider",
    signalsStageEnabled: true,
    terminalRequiresApproval: true,
  });

  assert.equal(new Set(nodes.map((node) => node.position.x)).size, 1);
});
