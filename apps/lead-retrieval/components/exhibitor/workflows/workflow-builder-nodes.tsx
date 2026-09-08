"use client";

import { memo, type KeyboardEvent, type ReactNode } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps
} from "@xyflow/react";
import {
  Brain,
  Layers,
  Plus,
  Send,
  Trash2,
  Zap
} from "lucide-react";

import type { WorkflowComposeOutputActionKind } from "@/lib/exhibitor/workflows/workflow-compose-output-action";
import { composeOutputActionKindLabel } from "@/lib/exhibitor/workflows/workflow-compose-output-action";
import type {
  WorkflowCrmProviderKey,
  WorkflowCrmSyncContentOptions
} from "@/lib/workflows/step-handlers/crm-sync-types";

import { WF_NODE_WIDTH } from "./workflow-builder-graph";

const responsiveNodeWidth = { width: `min(${WF_NODE_WIDTH}px, calc(100cqw - 3rem))` };

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const SELECTED_RING = "ring-2 ring-indigo-500/40 border-indigo-400/80 shadow-[0_16px_42px_rgba(79,70,229,0.18)]";

function WorkflowNodeCard({
  children,
  className,
  onSelect
}: {
  children: ReactNode;
  className: string;
  onSelect: () => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn("cursor-pointer", className)}
    >
      {children}
    </div>
  );
}

type TriggerNodeData = Record<string, unknown> & {
  selected: boolean;
  workflowName: string;
  isEnabled: boolean;
  showTerminalInsert: boolean;
  triggerRuleSummary: string;
  onSelect: () => void;
  onInsert: () => void;
};

type WfTriggerRfNode = Node<TriggerNodeData, "wfTrigger">;

export const WfTriggerNode = memo(function WfTriggerNode({ data }: NodeProps<WfTriggerRfNode>) {
  return (
    <div style={responsiveNodeWidth}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
      <WorkflowNodeCard
        onSelect={data.onSelect}
        className={cn(
          "w-full rounded-2xl border border-amber-200/90 bg-white text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none ring-1 ring-slate-900/5 transition duration-200",
          "hover:border-amber-300 hover:shadow-md",
          data.selected && SELECTED_RING
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/80">
              <Zap className="h-5 w-5 text-amber-800" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">Trigger</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-slate-950">Lead captured</p>
              <p className="mt-1 text-xs text-slate-600">Starts when a lead is saved</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Live
          </span>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {data.triggerRuleSummary}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {data.isEnabled ? "Active workflow" : "Paused"}
          </span>
        </div>
      </WorkflowNodeCard>

      {data.showTerminalInsert ? (
        <div className="mt-3 flex justify-center">
          <InsertOrb onClick={data.onInsert} label="Add step" />
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
    </div>
  );
});

function InsertOrb({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition duration-200",
        "hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
      )}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white transition group-hover:border-indigo-300 group-hover:bg-white">
        <Plus className="h-4 w-4 text-slate-600 transition group-hover:text-indigo-700" aria-hidden />
      </span>
      {label}
    </button>
  );
}

type EnrichNodeData = Record<string, unknown> & {
  selected: boolean;
  showTerminalInsert: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onInsert: () => void;
  enrichmentConfigured: boolean;
  enrichmentProviderLabel: string | null;
};

type WfEnrichRfNode = Node<EnrichNodeData, "wfEnrich">;

export const WfEnrichNode = memo(function WfEnrichNode({ data }: NodeProps<WfEnrichRfNode>) {
  return (
    <div style={responsiveNodeWidth}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
      <WorkflowNodeCard
        onSelect={data.onSelect}
        className={cn(
          "w-full rounded-2xl border border-indigo-200/90 bg-white text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none ring-1 ring-slate-900/5 transition duration-200",
          "hover:border-indigo-300 hover:shadow-md",
          data.selected && SELECTED_RING
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-indigo-200/80 bg-indigo-100/70">
              <Brain className="h-5 w-5 text-indigo-800" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700">Enrichment</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-slate-950">Enrichment</p>
              <p className="mt-1 text-xs text-slate-600">Enhance lead data with verified company and contact details</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
            aria-label="Remove enrichment step"
            onClick={(ev) => {
              ev.stopPropagation();
              data.onRemove();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-2 border-t border-slate-100 px-5 py-3">
          {data.enrichmentConfigured && data.enrichmentProviderLabel ? (
            <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              Provider: {data.enrichmentProviderLabel}
            </span>
          ) : (
            <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Setup required
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-4">
          {data.enrichmentConfigured && data.enrichmentProviderLabel ? (
            <>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-900">
                Activated integration
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                Lead facts
              </span>
            </>
          ) : (
            <span className="rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              Setup required
            </span>
          )}
        </div>
      </WorkflowNodeCard>

      {data.showTerminalInsert ? (
        <div className="mt-3 flex justify-center">
          <InsertOrb onClick={data.onInsert} label="Add step" />
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
    </div>
  );
});

type SignalsNodeData = Record<string, unknown> & {
  selected: boolean;
  signals: { id: string; name: string; rank: number }[];
  onSelect: () => void;
  onRemove: () => void;
};

type WfSignalsRfNode = Node<SignalsNodeData, "wfSignals">;

export const WfSignalsNode = memo(function WfSignalsNode({ data }: NodeProps<WfSignalsRfNode>) {
  const total = data.signals.length;

  return (
    <div style={responsiveNodeWidth}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
      <WorkflowNodeCard
        onSelect={data.onSelect}
        className={cn(
          "w-full rounded-2xl border border-emerald-200/90 bg-white text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none ring-1 ring-slate-900/5 transition duration-200",
          "hover:border-violet-300 hover:shadow-md",
          data.selected && SELECTED_RING
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-100/70">
              <Layers className="h-5 w-5 text-emerald-800" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">Campaign Agents</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-slate-950">Campaign Agents</p>
              <p className="mt-1 text-xs text-slate-600">Select the agents that shape drafting and personalization</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
            aria-label="Remove Campaign Agents step"
            onClick={(ev) => {
              ev.stopPropagation();
              data.onRemove();
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          {total === 0 ? (
            <p className="text-sm font-medium text-slate-700">No Campaign Agents selected.</p>
          ) : (
            <div className="space-y-1.5">
              {data.signals.slice(0, 3).map((sig) => (
                <div
                  key={sig.id}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5"
                >
                  <span className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-600">
                    {sig.rank}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium leading-snug text-slate-900">{sig.name}</p>
                </div>
              ))}
              {total > 3 ? (
                <p className="text-xs font-semibold text-slate-500">+{total - 3} more selected</p>
              ) : null}
            </div>
          )}
        </div>
      </WorkflowNodeCard>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
    </div>
  );
});

type ComposeNodeData = Record<string, unknown> & {
  selected: boolean;
  subjectTemplate: string;
  templateName: string;
  outputActionKind: WorkflowComposeOutputActionKind;
  enrichLeadEnabled: boolean;
  enrichmentProviderLabel: string | null;
  mergeTokens: readonly string[];
  signalCount: number;
  signals: { id: string; name: string; rank: number }[];
  /** When true, an edge continues to a downstream CRM step (legacy / API-authored templates). */
  showContinuationHandle?: boolean;
  approvalRequired: boolean;
  onSelect: () => void;
  onRemove: () => void;
};

type WfComposeRfNode = Node<ComposeNodeData, "wfCompose">;

export const WfComposeNode = memo(function WfComposeNode({ data }: NodeProps<WfComposeRfNode>) {
  const actionLabel = composeOutputActionKindLabel(data.outputActionKind);
  const enrichSummary = data.enrichLeadEnabled
    ? data.enrichmentProviderLabel
      ? `Enrichment: ${data.enrichmentProviderLabel}`
      : "Enrichment: workspace provider"
    : "Captured fields only";

  return (
    <div style={responsiveNodeWidth}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
      <WorkflowNodeCard
        onSelect={data.onSelect}
        className={cn(
          "relative w-full rounded-2xl border border-sky-200/90 bg-white text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none ring-1 ring-slate-900/5 transition duration-200",
          "hover:border-purple-300 hover:shadow-md",
          data.selected && SELECTED_RING
        )}
      >
        <div className="relative flex items-start justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-sky-200/80 bg-sky-100/70">
              <Send className="h-5 w-5 text-sky-800" aria-hidden />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">Action</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-slate-950">Campaign – Follow up</p>
              <p className="mt-1 text-xs text-slate-600">Generate and send a personalized follow-up draft</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data.approvalRequired ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Approval required
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Automatic
              </span>
            )}
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
              aria-label="Remove action step"
              onClick={(ev) => {
                ev.stopPropagation();
                data.onRemove();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            Subject: {data.subjectTemplate.trim() || actionLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {data.signalCount} Campaign Agent{data.signalCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {enrichSummary}
          </span>
        </div>
      </WorkflowNodeCard>
      {data.showContinuationHandle ? (
        <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
      ) : null}
    </div>
  );
});

type CrmActionNodeData = Record<string, unknown> & {
  selected: boolean;
  providerId: WorkflowCrmProviderKey;
  providerLabel: string;
  logoSrc: string;
  operationLabel: string;
  operationDescription: string;
  behaviorSummary: readonly string[];
  contentOptions: WorkflowCrmSyncContentOptions;
  composeUpstream: boolean;
  signalCount: number;
  signalsPreview: { rank: number; name: string }[];
  enrichUpstream: boolean;
  enrichmentProviderLabel: string | null;
  approvalRequired: boolean;
  onSelect: () => void;
  onRemove: () => void;
};

type WfCrmRfNode = Node<CrmActionNodeData, "wfCrmAction">;

export const WfCrmActionNode = memo(function WfCrmActionNode({ data }: NodeProps<WfCrmRfNode>) {
  const mappedFieldsHint =
    data.providerId === "hubspot"
      ? "Contact properties: email, first name, last name, company, job title"
      : "Lead fields: FirstName, LastName, Email, Company, Title";

  return (
    <div style={responsiveNodeWidth}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-transparent !opacity-0" />
      <WorkflowNodeCard
        onSelect={data.onSelect}
        className={cn(
          "w-full rounded-2xl border border-sky-200/90 bg-white text-left shadow-[0_12px_30px_rgba(15,23,42,0.08)] outline-none ring-1 ring-slate-900/5 transition duration-200",
          "hover:border-sky-300 hover:shadow-md",
          data.selected && SELECTED_RING
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-200/80 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.logoSrc} alt="" className="h-8 w-8 object-contain" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700">CRM</p>
              <p className="mt-1 text-base font-semibold tracking-tight text-slate-950">{data.providerLabel}</p>
              <p className="mt-1 text-xs text-slate-600">{data.operationLabel}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data.approvalRequired ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                Approval required
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-950">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                Automatic
              </span>
            )}
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-rose-600"
              aria-label="Remove CRM step"
              onClick={(ev) => {
                ev.stopPropagation();
                data.onRemove();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {data.operationDescription}
          </span>
          {data.behaviorSummary.map((summary) => (
            <span
              key={summary}
              className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-900"
            >
              {summary}
            </span>
          ))}
          {data.contentOptions.includeLeadDetails ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              Lead details
            </span>
          ) : null}
          {data.contentOptions.includeAiNotes ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
              AI notes
            </span>
          ) : null}
          {data.contentOptions.includeSuggestedEmailDraftInCrmNote ? (
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
              Suggested email draft
            </span>
          ) : null}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
            {mappedFieldsHint}
          </span>
          {data.enrichUpstream ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              {data.enrichmentProviderLabel ? `Enrichment: ${data.enrichmentProviderLabel}` : "Enrichment upstream"}
            </span>
          ) : null}
        </div>
      </WorkflowNodeCard>
    </div>
  );
});

type InsertEdgeData = Record<string, unknown> & {
  showInsert?: boolean;
  glow?: boolean;
  onInsert?: () => void;
};

type WfInsertRfEdge = Edge<InsertEdgeData, "wfInsert">;

export const WfInsertEdge = memo(function WfInsertEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
  data
}: EdgeProps<WfInsertRfEdge>) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });

  const glow = Boolean(data?.glow);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          ...(glow
            ? {
                filter: "drop-shadow(0 1px 2px rgba(15, 23, 42, 0.06))"
              }
            : {})
        }}
      />
      {data?.showInsert && data.onInsert ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto opacity-40 transition-opacity duration-200 hover:opacity-100"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`
            }}
          >
            <InsertOrb onClick={data.onInsert} label="Add step" />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});

export const workflowBuilderNodeTypes = {
  wfTrigger: WfTriggerNode,
  wfEnrich: WfEnrichNode,
  wfSignals: WfSignalsNode,
  wfCompose: WfComposeNode,
  wfCrmAction: WfCrmActionNode
};

export const workflowBuilderEdgeTypes = {
  wfInsert: WfInsertEdge
};
