import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import path from "node:path";
import { buildWorkflowGraph } from "../components/exhibitor/workflows/workflow-builder-graph";
import { deriveWorkflowBuilderAddStepState } from "../lib/exhibitor/workflows/workflow-builder-step-rules";

const noop = () => {};

test("signals node source does not contain fake categories or demo titles", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "components/exhibitor/workflows/workflow-builder-nodes.tsx"),
    "utf8"
  );

  assert.match(source, /No Campaign Agents selected\./);
  assert.equal(source.includes("Priority lane"), false);
  assert.equal(source.includes("Supporting intelligence"), false);
  assert.equal(source.includes("AI Summary"), false);
  assert.equal(source.includes("Company Context"), false);
  assert.equal(source.includes("Suggested Next Step"), false);
  assert.equal(source.includes("Strategic Angle"), false);
  assert.equal(source.includes("Conversation Brief Agent"), false);
  assert.equal(source.includes("Company Intel Agent"), false);
  assert.equal(source.includes("Follow-Up Agent"), false);
  assert.equal(source.includes("Positioning Agent"), false);
});

test("workflow builder node cards do not nest remove buttons inside card buttons", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "components/exhibitor/workflows/workflow-builder-nodes.tsx"),
    "utf8"
  );

  assert.match(source, /function WorkflowNodeCard/);
  assert.doesNotMatch(source, /<button[\s\S]{0,120}onClick=\{data\.onSelect\}/);
  assert.match(source, /aria-label="Remove Campaign Agents step"/);
  assert.match(source, /aria-label="Remove action step"/);
});

test("buildWorkflowGraph signals node renders only real selected signals", () => {
  const { nodes } = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: false,
    crmProviderId: null,
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "",
    crmOperationDescription: "",
    selectedStep: "signals",
    orderedSignalsMeta: [],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: true,
    terminalRequiresApproval: true
  });

  const signalNode = nodes.find((node) => node.id === "signals");
  assert.ok(signalNode);
  const signalData = signalNode!.data as { signals?: { name: string }[] };
  assert.deepEqual(signalData.signals ?? [], []);
  assert.equal((signalData.signals ?? []).some((signal) =>
    [
      "AI Summary",
      "Company Context",
      "Suggested Next Step",
      "Strategic Angle",
      "Conversation Brief Agent",
      "Company Intel Agent",
      "Follow-Up Agent",
      "Positioning Agent"
    ].includes(signal.name)
  ), false);
});

test("buildWorkflowGraph preserves only real selected signal names", () => {
  const { nodes } = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: false,
    crmProviderId: null,
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "",
    crmOperationDescription: "",
    selectedStep: "signals",
    orderedSignalsMeta: [
      { id: "sig-1", name: "Real signal one", rank: 1 },
      { id: "sig-2", name: "Real signal two", rank: 2 }
    ],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: true,
    terminalRequiresApproval: true
  });

  const signalNode = nodes.find((node) => node.id === "signals");
  assert.ok(signalNode);
  const signalData = signalNode!.data as { signals?: { name: string }[] };
  assert.deepEqual(
    (signalData.signals ?? []).map((signal) => signal.name),
    ["Real signal one", "Real signal two"]
  );
});

test("prioritized signals is selectable after enrichment when missing and disabled only when already present", () => {
  const enabledState = deriveWorkflowBuilderAddStepState({
    addAfter: "enrich",
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: false,
    signalsStageEnabled: false
  });
  assert.equal(enabledState.canAddSignalsStage, true);

  const disabledState = deriveWorkflowBuilderAddStepState({
    addAfter: "enrich",
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: false,
    signalsStageEnabled: true
  });
  assert.equal(disabledState.canAddSignalsStage, false);
});

test("prioritized signals can exist as an independent workflow step without any terminal step", () => {
  const state = deriveWorkflowBuilderAddStepState({
    addAfter: "trigger",
    enrichLead: false,
    composeDraft: false,
    crmPushEnabled: false,
    signalsStageEnabled: false
  });
  assert.equal(state.canAddSignalsStage, true);

  const graph = buildWorkflowGraph({
    enrichLead: false,
    composeDraft: false,
    crmPushEnabled: false,
    crmProviderId: null,
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "",
    crmOperationDescription: "",
    selectedStep: "signals",
    orderedSignalsMeta: [],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: true,
    terminalRequiresApproval: true
  });

  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["trigger", "signals"]
  );
});

test("prioritized signals inserts between enrichment and campaign draft", () => {
  const withoutSignals = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: false,
    crmProviderId: null,
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "",
    crmOperationDescription: "",
    selectedStep: "compose",
    orderedSignalsMeta: [],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: false,
    terminalRequiresApproval: true
  });

  const enrichToComposeEdge = withoutSignals.edges.find((edge) => edge.id === "e-enrich-compose");
  assert.ok(enrichToComposeEdge);
  assert.equal((enrichToComposeEdge!.data as { showInsert?: boolean }).showInsert, true);

  const withSignals = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: true,
    crmPushEnabled: false,
    crmProviderId: null,
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "",
    crmOperationDescription: "",
    selectedStep: "signals",
    orderedSignalsMeta: [],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: true,
    terminalRequiresApproval: true
  });

  assert.deepEqual(
    withSignals.nodes.map((node) => node.id),
    ["trigger", "enrich", "signals", "compose"]
  );
});

test("prioritized signals inserts before CRM sync", () => {
  const withoutSignals = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: false,
    crmPushEnabled: true,
    crmProviderId: "hubspot",
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "Upsert contact",
    crmOperationDescription: "",
    selectedStep: "crmFuture",
    orderedSignalsMeta: [],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: false,
    terminalRequiresApproval: false
  });

  const enrichToCrmEdge = withoutSignals.edges.find((edge) => edge.id === "e-enrich-crmFuture");
  assert.ok(enrichToCrmEdge);
  assert.equal((enrichToCrmEdge!.data as { showInsert?: boolean }).showInsert, true);

  const withSignals = buildWorkflowGraph({
    enrichLead: true,
    composeDraft: false,
    crmPushEnabled: true,
    crmProviderId: "hubspot",
    crmProviderLabel: "HubSpot",
    crmLogoSrc: "/integrations/hubspot-logo.svg",
    crmOperationLabel: "Upsert contact",
    crmOperationDescription: "",
    selectedStep: "signals",
    orderedSignalsMeta: [],
    subjectTemplate: "Hello",
    templateName: "Lead Intel",
    outputActionKind: "campaign_draft",
    mergeTokens: [],
    workflowName: "Test",
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
      removeCrm: noop
    },
    enrichmentConfigured: true,
    enrichmentProviderLabel: "ZoomInfo",
    signalsStageEnabled: true,
    terminalRequiresApproval: false
  });

  assert.deepEqual(
    withSignals.nodes.map((node) => node.id),
    ["trigger", "enrich", "signals", "crmFuture"]
  );
});
