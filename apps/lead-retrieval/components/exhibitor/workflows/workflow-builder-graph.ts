import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import { Position } from "@xyflow/react";

import type { WorkflowComposeOutputActionKind } from "@/lib/exhibitor/workflows/workflow-compose-output-action";
import type {
  WorkflowCrmProviderKey,
  WorkflowCrmSyncContentOptions
} from "@/lib/workflows/step-handlers/crm-sync-types";

export type WorkflowCanvasStep =
  | "trigger"
  | "enrich"
  | "signals"
  | "compose"
  | "crmFuture";

export const WF_NODE_WIDTH = 420;
/** All graph nodes share the origin axis; React Flow owns viewport centering. */
export const WF_CENTER_X = 0;

type SignalMeta = { id: string; name: string; rank: number };

export type WorkflowGraphCallbacks = {
  select: (step: WorkflowCanvasStep) => void;
  openInsertAfterTrigger: () => void;
  openInsertAfterEnrich: () => void;
  removeEnrich: () => void;
  removeSignals: () => void;
  removeCompose: () => void;
  removeCrm: () => void;
};

const INTER_NODE_GAP = 34;

function estimateTriggerHeight(): number {
  return 182;
}

function estimateEnrichHeight(configured: boolean): number {
  return configured ? 190 : 202;
}

/** Approximate rendered height for the signals node based on a simple selected-signal list. */
function estimateSignalsHeight(signalCount: number): number {
  if (signalCount === 0) return 174;
  const visibleRows = Math.min(signalCount, 3);
  return 166 + visibleRows * 34 + (signalCount > 3 ? 18 : 0);
}

/** Compose / action node scales with visible signal chips (+ overflow pill) and input summary rows. */
function estimateComposeHeight(signalCount: number, enrichFeedsAction: boolean): number {
  const base = enrichFeedsAction ? 214 : 196;
  return base + (signalCount > 0 ? 18 : 0);
}

function estimateCrmHeight(composeUpstream: boolean, signalCount: number): number {
  return 218 + (composeUpstream && signalCount > 0 ? 18 : 0);
}

function heightForNodeId(
  id: string,
  ctx: {
    signalCount: number;
    enrichConfigured: boolean;
    enrichFeedsAction: boolean;
    composeUpstreamForCrm: boolean;
    crmSignalCount: number;
  }
): number {
  switch (id) {
    case "trigger":
      return estimateTriggerHeight();
    case "enrich":
      return estimateEnrichHeight(ctx.enrichConfigured);
    case "signals":
      return estimateSignalsHeight(ctx.signalCount);
    case "compose":
      return estimateComposeHeight(ctx.signalCount, ctx.enrichFeedsAction);
    case "crmFuture":
      return estimateCrmHeight(ctx.composeUpstreamForCrm, ctx.crmSignalCount);
    default:
      return 260;
  }
}

/** Builds React Flow nodes/edges from authoring state. Execution semantics unchanged — UI projection only. */
export function buildWorkflowGraph(params: {
  enrichLead: boolean;
  composeDraft: boolean;
  crmPushEnabled: boolean;
  crmProviderId: WorkflowCrmProviderKey | null;
  crmProviderLabel: string;
  crmLogoSrc: string;
  crmOperationLabel: string;
  crmOperationDescription: string;
  crmBehaviorSummary?: readonly string[];
  crmContentOptions?: WorkflowCrmSyncContentOptions;
  selectedStep: WorkflowCanvasStep | null;
  orderedSignalsMeta: SignalMeta[];
  subjectTemplate: string;
  templateName: string;
  outputActionKind: WorkflowComposeOutputActionKind;
  mergeTokens: readonly string[];
  workflowName: string;
  isEnabled: boolean;
  /** Summary text shown on the trigger card chip. Defaults to "All captured leads". */
  triggerRuleSummary?: string;
  afterTriggerTerminal: boolean;
  afterEnrichTerminal: boolean;
  callbacks: WorkflowGraphCallbacks;
  enrichmentConfigured: boolean;
  enrichmentProviderLabel: string | null;
  /** When false, workflow connects intelligence stages directly to the terminal action. */
  signalsStageEnabled: boolean;
  /** Mirrors `workflow_steps.requires_approval` for the terminal row (compose or CRM). */
  terminalRequiresApproval: boolean;
}): { nodes: Node[]; edges: Edge[] } {
  const {
    enrichLead,
    composeDraft,
    crmPushEnabled,
    crmProviderId,
    crmProviderLabel,
    crmLogoSrc,
    crmOperationLabel,
    crmOperationDescription,
    crmBehaviorSummary = [],
    crmContentOptions = {
      includeLeadDetails: true,
      includeAiNotes: false,
      includeCampaignContextInCrmNote: false,
      includeRecommendedFollowUpInCrmNote: false,
      includeSuggestedEmailDraftInCrmNote: false,
      suggestedEmailInstructions: null
    },
    selectedStep,
    orderedSignalsMeta,
    subjectTemplate,
    templateName,
    outputActionKind,
    mergeTokens,
    workflowName,
    isEnabled,
    triggerRuleSummary,
    afterTriggerTerminal,
    afterEnrichTerminal,
    callbacks,
    enrichmentConfigured,
    enrichmentProviderLabel,
    signalsStageEnabled,
    terminalRequiresApproval
  } = params;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  /** CRM terminal is authoring intent — OAuth readiness is enforced at runtime, not on this canvas. */
  const hasCrmTerminal = crmPushEnabled;
  const hasCompose = composeDraft;
  const hasTerminalLane = hasCompose || hasCrmTerminal;
  /** Campaign Agents is an independent builder step and may exist before any terminal action is chosen. */
  const hasSignalsStage = signalsStageEnabled;

  const chain: string[] = ["trigger"];
  if (enrichLead) chain.push("enrich");
  if (hasSignalsStage) chain.push("signals");
  if (hasCompose) chain.push("compose");
  if (hasCrmTerminal) chain.push("crmFuture");

  const signalCount = orderedSignalsMeta.length;
  const enrichFeedsAction = enrichLead && hasTerminalLane;
  const layoutCtx = {
    signalCount,
    enrichConfigured: enrichmentConfigured,
    enrichFeedsAction,
    composeUpstreamForCrm: hasCompose && hasCrmTerminal,
    crmSignalCount: signalCount
  };

  let yCursor = 40;
  const yForId = new Map<string, number>();

  for (const id of chain) {
    yForId.set(id, yCursor);
    yCursor += heightForNodeId(id, layoutCtx) + INTER_NODE_GAP;
  }

  nodes.push({
    id: "trigger",
    type: "wfTrigger",
    position: { x: WF_CENTER_X - WF_NODE_WIDTH / 2, y: yForId.get("trigger")! },
    draggable: false,
    selectable: true,
    data: {
      selected: selectedStep === "trigger",
      workflowName,
      isEnabled,
      triggerRuleSummary: triggerRuleSummary ?? "All captured leads",
      showTerminalInsert: afterTriggerTerminal,
      onSelect: () => callbacks.select("trigger"),
      onInsert: callbacks.openInsertAfterTrigger
    },
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top
  });

  if (enrichLead) {
    nodes.push({
      id: "enrich",
      type: "wfEnrich",
      position: { x: WF_CENTER_X - WF_NODE_WIDTH / 2, y: yForId.get("enrich")! },
      draggable: false,
      selectable: true,
      data: {
        selected: selectedStep === "enrich",
        showTerminalInsert: afterEnrichTerminal,
        onSelect: () => callbacks.select("enrich"),
        onRemove: callbacks.removeEnrich,
        onInsert: callbacks.openInsertAfterEnrich,
        enrichmentConfigured,
        enrichmentProviderLabel
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    });
  }

  if (hasSignalsStage) {
    nodes.push({
      id: "signals",
      type: "wfSignals",
      position: { x: WF_CENTER_X - WF_NODE_WIDTH / 2, y: yForId.get("signals")! },
      draggable: false,
      selectable: true,
      data: {
        selected: selectedStep === "signals",
        signals: orderedSignalsMeta,
        onSelect: () => callbacks.select("signals"),
        onRemove: callbacks.removeSignals
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    });
  }

  if (hasCompose) {
    nodes.push({
      id: "compose",
      type: "wfCompose",
      position: { x: WF_CENTER_X - WF_NODE_WIDTH / 2, y: yForId.get("compose")! },
      draggable: false,
      selectable: true,
      data: {
        selected: selectedStep === "compose",
        subjectTemplate,
        templateName,
        outputActionKind,
        enrichLeadEnabled: enrichLead,
        enrichmentProviderLabel,
        mergeTokens,
        signalCount: orderedSignalsMeta.length,
        signals: orderedSignalsMeta,
        /** Bottom handle only when a CRM step follows compose (legacy / API-authored chains). */
        showContinuationHandle: hasCompose && hasCrmTerminal,
        /** Draft always gates before CRM when both exist — matches persisted compose row. */
        approvalRequired: hasCompose && hasCrmTerminal ? true : terminalRequiresApproval,
        onSelect: () => callbacks.select("compose"),
        onRemove: callbacks.removeCompose
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    });
  }

  if (crmPushEnabled) {
    const crmRenderId = crmProviderId ?? "hubspot";
    nodes.push({
      id: "crmFuture",
      type: "wfCrmAction",
      position: { x: WF_CENTER_X - WF_NODE_WIDTH / 2, y: yForId.get("crmFuture")! },
      draggable: false,
      selectable: true,
      data: {
        selected: selectedStep === "crmFuture",
        providerId: crmRenderId,
        providerLabel: crmProviderLabel,
        logoSrc: crmLogoSrc,
        operationLabel: crmOperationLabel,
        operationDescription: crmOperationDescription,
        behaviorSummary: crmBehaviorSummary,
        contentOptions: crmContentOptions,
        composeUpstream: hasCompose && hasCrmTerminal,
        signalCount: orderedSignalsMeta.length,
        signalsPreview: orderedSignalsMeta.slice(0, 4).map((s) => ({ rank: s.rank, name: s.name })),
        enrichUpstream: enrichLead,
        enrichmentProviderLabel,
        /** CRM row stays non-approving when a compose step precedes it (draft gate only). */
        approvalRequired: hasCompose && hasCrmTerminal ? false : terminalRequiresApproval,
        onSelect: () => callbacks.select("crmFuture"),
        onRemove: callbacks.removeCrm
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top
    });
  }

  const edgeStyle = {
    stroke: "rgba(148, 163, 184, 0.55)",
    strokeWidth: 1.75
  };

  const highlightedStroke = "rgba(99, 102, 241, 0.45)";

  for (let i = 0; i < chain.length - 1; i++) {
    const src = chain[i]!;
    const tgt = chain[i + 1]!;
    const terminalBridge = tgt === "compose" || tgt === "crmFuture";
    const showInsertAfterTrigger = src === "trigger";
    const showInsertAfterEnrich =
      src === "enrich" && ((!composeDraft && !crmPushEnabled) || (!hasSignalsStage && terminalBridge) || hasSignalsStage);

    const intelHighlight =
      terminalBridge &&
      ((hasSignalsStage && src === "signals") || (!hasSignalsStage && (src === "enrich" || src === "trigger")));

    edges.push({
      id: `e-${src}-${tgt}`,
      source: src,
      target: tgt,
      type: "wfInsert",
      animated: intelHighlight,
      style: {
        ...edgeStyle,
        ...(intelHighlight ? { stroke: highlightedStroke, strokeWidth: 2 } : {})
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: intelHighlight ? "rgba(79, 70, 229, 0.5)" : "rgba(148, 163, 184, 0.55)"
      },
      data: {
        showInsert: showInsertAfterTrigger || showInsertAfterEnrich,
        glow: intelHighlight,
        onInsert: showInsertAfterTrigger
          ? callbacks.openInsertAfterTrigger
          : showInsertAfterEnrich
            ? callbacks.openInsertAfterEnrich
            : undefined
      }
    });
  }

  return { nodes, edges };
}
