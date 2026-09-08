"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, type Dispatch, type SetStateAction } from "react";

import type {
  LeadCapturedTriggerRuleConfig,
  LeadRatingValue,
  LeadTemperatureValue
} from "@/lib/exhibitor/workflows/lead-captured-trigger-rule-config";
import {
  LEAD_RATING_VALUES,
  LEAD_TEMPERATURE_VALUES,
  triggerRuleConfigPreview
} from "@/lib/exhibitor/workflows/lead-captured-trigger-rule-config";

import type { WorkflowCanvasStep } from "./workflow-builder-graph";
import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentProviderOption
} from "@/lib/exhibitor/workflows/workflow-builder-enrichment-types";
import type { WorkflowBuilderCrmProviderOption } from "@/lib/exhibitor/workflows/workflow-builder-crm-types";
import type { WorkflowComposeOutputActionKind } from "@/lib/exhibitor/workflows/workflow-compose-output-action";
import { WORKFLOW_DRAFT_TONE_PRESETS } from "@/lib/exhibitor/workflows/draft-tone-presets";
import type { WorkflowBuilderSignalOption } from "@/lib/exhibitor/workflows/workflow-builder-signal-types";
import type {
  WorkflowCrmSyncContentOptions,
  WorkflowCrmOperationId,
  WorkflowCrmProviderKey
} from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  crmMatchBehaviorLabel,
  crmRecordTypeLabel,
  defaultCrmSyncConfigForProvider,
  type WorkflowCrmResolvedSyncConfig,
  type WorkflowCrmSyncConfig,
  type WorkflowCrmSyncConfigMode,
  type WorkflowCrmSyncMatchBehavior,
  type WorkflowCrmSyncRecordType
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";
import {
  workflowComposeOutputActionIsAvailable,
  workflowComposeOutputActionUnavailableMessage
} from "@/lib/exhibitor/workflows/workflow-compose-output-action";

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

type CrmOperationChoice = { id: WorkflowCrmOperationId; label: string; description: string };

export type WorkflowOrchestrationInspectorProps = {
  inspectorTabs: readonly { id: string; label: string }[];
  inspectorTab: string;
  setInspectorTab: (id: string) => void;
  selectedStep: WorkflowCanvasStep;
  selectStep: (step: WorkflowCanvasStep) => void;
  eventIdQs: string;
  integrationsHref: string;
  signalsHref: string;
  name: string;
  setName: (v: string) => void;
  isEnabled: boolean;
  setIsEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  enrichLead: boolean;
  enrichmentConfigured: boolean;
  enrichmentProviders: readonly WorkflowBuilderEnrichmentProviderOption[];
  enrichmentAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  setEnrichmentAdapterKey: (v: WorkflowBuilderEnrichmentAdapterKey) => void;
  workspaceDefaultAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  enrichmentFocusIds: readonly string[];
  toggleEnrichmentFocus: (id: string) => void;
  enrichmentFocusChangeMessage: string | null;
  signalsByCategory: Map<string, WorkflowBuilderSignalOption[]>;
  signalCategoryOrder: readonly string[];
  categoryAccent: Record<string, string>;
  orderedSignalIds: readonly string[];
  signalById: Map<string, string>;
  addSignal: (id: string) => void;
  removeSignal: (id: string) => void;
  moveSignal: (index: number, delta: number) => void;
  signalsTotalCount: number;
  composeDraft: boolean;
  outputActionKind: WorkflowComposeOutputActionKind;
  setOutputActionKind: (v: WorkflowComposeOutputActionKind) => void;
  subjectTemplate: string;
  setSubjectTemplate: (v: string) => void;
  authoringToneHint: string;
  setAuthoringToneHint: (v: string) => void;
  crmProviders: readonly WorkflowBuilderCrmProviderOption[];
  crmPushEnabled: boolean;
  crmProvider: WorkflowCrmProviderKey | null;
  setCrmProvider: (v: WorkflowCrmProviderKey) => void;
  crmOperation: WorkflowCrmOperationId;
  setCrmOperation: (v: WorkflowCrmOperationId) => void;
  crmContentOptions: WorkflowCrmSyncContentOptions;
  setCrmContentOptions: Dispatch<SetStateAction<WorkflowCrmSyncContentOptions>>;
  crmOperationChoices: readonly CrmOperationChoice[];
  crmProviderMeta: WorkflowBuilderCrmProviderOption | null;
  crmSyncConfigMode: WorkflowCrmSyncConfigMode;
  setCrmSyncConfigMode: (v: WorkflowCrmSyncConfigMode) => void;
  crmSyncConfigOverride: Partial<WorkflowCrmSyncConfig> | null;
  setCrmSyncConfigOverride: Dispatch<SetStateAction<Partial<WorkflowCrmSyncConfig> | null>>;
  effectiveCrmSyncConfig: WorkflowCrmResolvedSyncConfig;
  crmBehaviorSummary: readonly string[];
  mergeTokens: readonly string[];
  terminalRequiresApproval: boolean;
  setTerminalRequiresApproval: (v: boolean) => void;
  composeAllowsAutomaticTerminal: boolean;
  /** When a draft step precedes CRM, persisted CRM row is automatic-only today — hide conflicting controls. */
  crmDeliveryModeLockedToAutomatic?: boolean;
  triggerRuleConfig: LeadCapturedTriggerRuleConfig;
  setTriggerRuleConfig: (v: LeadCapturedTriggerRuleConfig) => void;
};

function historyEmptyShell(step: WorkflowCanvasStep): { title: string; body: string; foot: string } {
  switch (step) {
    case "trigger":
      return {
        title: "Workflow activation ledger",
        body: "When this automation fires for a lead capture, you’ll see correlation IDs, dedupe decisions, and evaluation latency — including why a lead matched this workflow versus siblings.",
        foot: "No captures recorded while authoring from this canvas."
      };
    case "enrich":
    case "signals":
      return {
        title: "Campaign Agent assembly log",
        body: "Shows which Campaign Agents hydrated, ordering overrides, missing prompts, and composer hand-off checksums so replay stays deterministic.",
        foot: "Campaign Agent execution traces attach once runs exist."
      };
    case "compose":
      return {
        title: "Draft generation & approval",
        body: "Tracks LLM attempts, token usage summaries, reviewer decisions, pause/resume timestamps, and linkage to generated draft artifacts.",
        foot: "Awaiting first execution — drafts stay paused until a reviewer approves."
      };
    case "crmFuture":
      return {
        title: "CRM push audit",
        body: "Captures OAuth credential scope, object IDs touched, payload fingerprints, partial successes (e.g., missing email skips), and Salesforce/HubSpot API diagnostics.",
        foot: "CRM writes appear here after downstream draft milestones complete."
      };
    default:
      return {
        title: "History",
        body: "Execution telemetry will appear for this step.",
        foot: "No runs yet."
      };
  }
}

export function WorkflowOrchestrationInspector(props: WorkflowOrchestrationInspectorProps) {
  const {
    inspectorTabs,
    inspectorTab,
    setInspectorTab,
    selectedStep,
    selectStep,
    eventIdQs,
    integrationsHref,
    signalsHref,
    name,
    setName,
    isEnabled,
    setIsEnabled,
    enrichLead,
    enrichmentConfigured,
    enrichmentProviders,
    enrichmentAdapterKey,
    setEnrichmentAdapterKey,
    workspaceDefaultAdapterKey,
    enrichmentFocusIds,
    toggleEnrichmentFocus,
    enrichmentFocusChangeMessage,
    signalsByCategory,
    signalCategoryOrder,
    categoryAccent,
    orderedSignalIds,
    signalById,
    addSignal,
    removeSignal,
    moveSignal,
    signalsTotalCount,
    composeDraft,
    outputActionKind,
    setOutputActionKind,
    subjectTemplate,
    setSubjectTemplate,
    authoringToneHint,
    setAuthoringToneHint,
    crmProviders,
    crmPushEnabled,
    crmProvider,
    setCrmProvider,
    crmOperation,
    setCrmOperation,
    crmContentOptions,
    setCrmContentOptions,
    crmOperationChoices,
    crmProviderMeta,
    crmSyncConfigMode,
    setCrmSyncConfigMode,
    crmSyncConfigOverride,
    setCrmSyncConfigOverride,
    effectiveCrmSyncConfig,
    crmBehaviorSummary,
    mergeTokens,
    terminalRequiresApproval,
    setTerminalRequiresApproval,
    composeAllowsAutomaticTerminal,
    crmDeliveryModeLockedToAutomatic = false,
    triggerRuleConfig,
    setTriggerRuleConfig
  } = props;

  const hist = historyEmptyShell(selectedStep);

  const categoryRows = [...signalCategoryOrder, "Other"] as const;

  const selectedEnrichmentProvider = useMemo(
    () => enrichmentProviders.find((provider) => provider.id === enrichmentAdapterKey) ?? null,
    [enrichmentAdapterKey, enrichmentProviders]
  );
  const providerFocusAreas = useMemo(
    () => selectedEnrichmentProvider?.categories ?? [],
    [selectedEnrichmentProvider]
  );
  const crmOverrideDefaults = useMemo(
    () =>
      crmProvider
        ? crmProviderMeta?.defaultSyncConfig ?? defaultCrmSyncConfigForProvider(crmProvider)
        : defaultCrmSyncConfigForProvider("hubspot"),
    [crmProvider, crmProviderMeta?.defaultSyncConfig]
  );
  const outputActionAvailable = workflowComposeOutputActionIsAvailable(outputActionKind);
  const outputActionUnavailableMessage = workflowComposeOutputActionUnavailableMessage(outputActionKind);

  return (
    <div className="flex h-full min-h-[760px] flex-col bg-white">
      <div className="border-b border-slate-200/80 px-5 py-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Inspector</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">
          {selectedStep === "trigger"
            ? "Workflow settings"
            : selectedStep === "enrich"
              ? "Enrichment"
              : selectedStep === "signals"
                ? "Campaign Agents"
                : selectedStep === "compose"
                  ? "Campaign follow-up"
                  : "CRM sync"}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Configure the selected step. Changes are saved when you save the workflow.
        </p>
      </div>

      <div className="flex gap-1 border-b border-slate-200/80 bg-slate-50/90 px-3 py-2">
        {inspectorTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setInspectorTab(tab.id)}
            className={cn(
              "flex-1 rounded-lg px-1.5 py-2.5 text-center text-[11px] font-semibold leading-tight transition sm:px-2 sm:text-xs",
              inspectorTab === tab.id
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/90"
                : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {selectedStep === "trigger" ? (
          <>
            {inspectorTab === "workflow" ? (
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow identity</p>
                <div>
                  <label
                    htmlFor="wf-name-canvas"
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Workflow name
                  </label>
                  <input
                    id="wf-name-canvas"
                    required
                    maxLength={200}
                    value={name}
                    onChange={(ev) => setName(ev.target.value)}
                    placeholder="e.g. Enterprise nurture lane"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <p className="text-xs leading-relaxed text-slate-600">
                  Naming here drives operator clarity in runbooks and audit exports — keep it specific enough that teams know the lane,
                  segment, or motion this automation guards.
                </p>
                <div className="border-t border-slate-200/80 pt-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">
                        {isEnabled ? "Active" : "Paused"}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {isEnabled ? "Eligible when leads are captured" : "Workflow will not run until reactivated"}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      onClick={() => setIsEnabled((prev) => !prev)}
                      className={cn(
                        "relative h-8 w-14 shrink-0 rounded-full transition",
                        isEnabled ? "bg-emerald-500" : "bg-slate-300"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition",
                          isEnabled && "translate-x-6"
                        )}
                      />
                    </button>
                  </div>
                  <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-3 text-xs leading-relaxed text-indigo-950">
                    When active, this workflow can run for new leads that match the trigger conditions.
                  </div>
                </div>
              </div>
            ) : null}

            {inspectorTab === "trigger_detail" ? (
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trigger conditions</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Filter which captured leads start this workflow. Leave all fields empty to run for every lead.
                  Select multiple values within a field — they match with OR; different fields are AND.
                </p>

                <div className="space-y-4">
                  {/* Rating */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rating</span>
                      {triggerRuleConfig.ratings.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setTriggerRuleConfig({ ...triggerRuleConfig, ratings: [] })}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {LEAD_RATING_VALUES.map((opt) => {
                        const active = triggerRuleConfig.ratings.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setTriggerRuleConfig({
                                ...triggerRuleConfig,
                                ratings: active
                                  ? triggerRuleConfig.ratings.filter((r) => r !== opt.value)
                                  : ([...triggerRuleConfig.ratings, opt.value] as LeadRatingValue[])
                              })
                            }
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                              active
                                ? "border-indigo-400 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-300/80"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {triggerRuleConfig.ratings.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-slate-400">Any rating</p>
                    )}
                  </div>

                  {/* Temperature */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Temperature</span>
                      {triggerRuleConfig.temperatures.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setTriggerRuleConfig({ ...triggerRuleConfig, temperatures: [] })}
                          className="text-[11px] font-semibold text-slate-400 hover:text-slate-700"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {LEAD_TEMPERATURE_VALUES.map((opt) => {
                        const active = triggerRuleConfig.temperatures.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setTriggerRuleConfig({
                                ...triggerRuleConfig,
                                temperatures: active
                                  ? triggerRuleConfig.temperatures.filter((t) => t !== opt.value)
                                  : ([...triggerRuleConfig.temperatures, opt.value] as LeadTemperatureValue[])
                              })
                            }
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                              active
                                ? "border-indigo-400 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-300/80"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    {triggerRuleConfig.temperatures.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-slate-400">Any temperature</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-3 text-xs leading-relaxed text-indigo-950">
                  <p className="font-semibold text-indigo-900">Preview</p>
                  <p className="mt-1 text-indigo-800">{triggerRuleConfigPreview(triggerRuleConfig)}</p>
                </div>
              </div>
            ) : null}

            {inspectorTab === "history" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">{hist.title}</p>
                <p className="text-xs leading-relaxed text-slate-600">{hist.body}</p>
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-xs text-slate-500">
                  {hist.foot}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {selectedStep === "enrich" ? (
          <>
            {inspectorTab === "providers" ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activated integrations</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Only providers with live credentials appear here — pulled from the same Integrations surface your admins manage.
                </p>
                {!enrichmentConfigured ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-4 text-sm text-amber-950">
                    <p className="font-semibold">No enrichment providers activated yet.</p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-900/95">
                      Connect Apollo, ZoomInfo, Clearbit/PDL, or another supported vendor.
                    </p>
                    <Link
                      href={integrationsHref}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-950 underline decoration-amber-700/60 underline-offset-2 hover:text-amber-900"
                    >
                      Open Integrations
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                ) : (
                  <>
                    <div>
                      <label
                        htmlFor="wf-enrichment-provider"
                        className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Provider for this workflow
                      </label>
                      <select
                        id="wf-enrichment-provider"
                        value={enrichmentAdapterKey ?? ""}
                        onChange={(e) => setEnrichmentAdapterKey(e.target.value as WorkflowBuilderEnrichmentAdapterKey)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                      >
                        {enrichmentProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                            {workspaceDefaultAdapterKey === p.id ? " (workspace default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Link
                      href={integrationsHref}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                    >
                      Manage integrations
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </>
                )}
              </div>
            ) : null}

            {inspectorTab === "fields" ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Enrichment categories</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Available enrichment categories are based on the selected provider's enabled integration settings.
                </p>
                {enrichmentFocusChangeMessage ? (
                  <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
                    {enrichmentFocusChangeMessage}
                  </div>
                ) : null}
                {!enrichmentConfigured ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-4 text-sm text-amber-950">
                    Connect an enrichment provider on the Providers tab to choose categories.
                  </div>
                ) : !enrichmentAdapterKey ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-700">
                    Choose a provider on the Providers tab to view available categories.
                  </div>
                ) : providerFocusAreas.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-4 text-sm text-amber-950">
                    <p className="font-medium">
                      {selectedEnrichmentProvider?.label ?? "This provider"} has no enabled enrichment categories.
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-amber-900">
                      Update the provider's integration settings, then return here to choose categories for this workflow.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {providerFocusAreas.map((area) => {
                      return (
                        <li key={area.id}>
                          <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm transition hover:bg-white">
                            <input
                              type="checkbox"
                              className="mt-1 shrink-0"
                              checked={enrichmentFocusIds.includes(area.id)}
                              onChange={() => toggleEnrichmentFocus(area.id)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium text-slate-900">{area.label}</span>
                              <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-600">{area.description}</span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}

          </>
        ) : null}

        {selectedStep === "signals" ? (
          <>
            {inspectorTab === "signals" ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-violet-200/90 bg-violet-50/90 px-3 py-3 text-xs leading-relaxed text-violet-950">
                  Pull from your Campaign Agents — grouped by taxonomy so teams curate narrative proof, CTAs, and AI summaries deliberately.
                </div>
                <div className="space-y-5">
                  {categoryRows.map((cat) => {
                    const items = signalsByCategory.get(cat) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <div key={cat}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cat}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {items.map((s) => {
                            const active = orderedSignalIds.includes(s.id);
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  if (!active) addSignal(s.id);
                                }}
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition",
                                  categoryAccent[cat] ?? categoryAccent.Other,
                                  active ? "opacity-45 ring-1 ring-slate-300/80" : "hover:brightness-95"
                                )}
                              >
                                {active ? <span aria-hidden>✓</span> : <Plus className="h-3 w-3" aria-hidden />}
                                {s.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {signalsTotalCount === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950">
                    <p className="font-semibold">No active Campaign Agents</p>
                    <p className="mt-2 leading-relaxed text-amber-900/95">Author Campaign Agents, then return to wire them into this lane.</p>
                    <Link
                      href={signalsHref}
                      className="mt-2 inline-flex items-center gap-1 font-semibold underline decoration-amber-700/60 underline-offset-2"
                    >
                      Open Campaign Agents
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}

            {inspectorTab === "priority" ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Execution precedence</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Higher rows steer the composer first — treat position one as strategic thesis, with supporting proof stacking downward.
                  Numeric weighting knobs hook into this ordering on the roadmap.
                </p>
                {orderedSignalIds.length === 0 ? (
                  <p className="text-sm text-amber-800">Select at least one Campaign Agent on the Campaign Agents tab.</p>
                ) : (
                  <ul className="space-y-2">
                    {orderedSignalIds.map((id, i) => (
                      <li
                        key={id}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm"
                      >
                        <GripVertical className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                        <span className="w-6 tabular-nums text-xs text-slate-500">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-800">{signalById.get(id) ?? id}</span>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-500 hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-30"
                          aria-label="Move up"
                          disabled={i === 0}
                          onClick={() => moveSignal(i, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-500 hover:bg-slate-200/80 hover:text-slate-900 disabled:opacity-30"
                          aria-label="Move down"
                          disabled={i === orderedSignalIds.length - 1}
                          onClick={() => moveSignal(i, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-rose-400/90 hover:bg-rose-500/10"
                          aria-label="Remove"
                          onClick={() => removeSignal(id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {inspectorTab === "output" ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {composeDraft ? "Composer hand-off" : "Operator context"}
                </p>
                <p className="text-xs leading-relaxed text-slate-600">
                  {composeDraft
                    ? "These artifacts enter the AI draft step as ordered prompt blocks — enrichment facts prepend automatically when the enrich node is live upstream."
                    : "Signal ordering captures narrative intent for your team; the CRM terminal syncs lead + enrichment fields from the platform."}
                </p>
                {orderedSignalIds.length === 0 ? (
                  <p className="text-sm text-slate-600">No Campaign Agents selected yet.</p>
                ) : (
                  <ol className="list-decimal space-y-2 pl-4 text-xs text-slate-800">
                    {orderedSignalIds.map((id, idx) => (
                      <li key={id}>
                        <span className="font-medium">{signalById.get(id) ?? id}</span>
                        <span className="text-slate-500"> — priority slot {idx + 1}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            {inspectorTab === "history" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">{hist.title}</p>
                <p className="text-xs leading-relaxed text-slate-600">{hist.body}</p>
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-xs text-slate-500">
                  {hist.foot}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {selectedStep === "compose" ? (
          <>
            {inspectorTab === "draft" ? (
              <div className="space-y-4">
                <div>
                  <label htmlFor="wf-output-action" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Output action
                  </label>
                  <select
                    id="wf-output-action"
                    value={outputActionKind}
                    onChange={(e) => setOutputActionKind(e.target.value as WorkflowComposeOutputActionKind)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  >
                    <option value="campaign_draft">Campaign Draft</option>
                    <option value="ai_email_draft">Email Draft</option>
                    <option disabled value="send_email">
                      Send Email (coming soon)
                    </option>
                    <option disabled value="downloadable_brief">
                      Downloadable Brief (coming soon)
                    </option>
                    <option disabled value="slack_alert">
                      Slack / Teams alert (coming soon)
                    </option>
                    <option disabled value="lead_summary">
                      Lead Summary (coming soon)
                    </option>
                    <option disabled value="follow_up_task">
                      Follow-up Task (coming soon)
                    </option>
                  </select>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {terminalRequiresApproval && outputActionAvailable
                      ? "Workflow generates a proposed draft for review. The draft is not saved until approved."
                      : outputActionAvailable
                      ? "Draft outputs are available now. Send Email is coming soon and cannot be saved or run yet."
                      : outputActionUnavailableMessage ??
                        "Draft outputs are available now. Send Email is coming soon and cannot be saved or run yet."}
                  </p>
                </div>

                <div>
                  <label htmlFor="wf-terminal-approval-compose" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Delivery mode
                  </label>
                  <select
                    id="wf-terminal-approval-compose"
                    value={terminalRequiresApproval ? "approval" : "automatic"}
                    onChange={(e) => setTerminalRequiresApproval(e.target.value === "approval")}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  >
                    <option value="approval">Approval required</option>
                    <option value="automatic" disabled={!composeAllowsAutomaticTerminal}>
                      Automatic
                    </option>
                  </select>
                  {!terminalRequiresApproval ? (
                    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-950">
                      Automatic mode can create customer-visible output without manual review.
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Workflow generates a proposed draft for review. The draft is not saved until approved.
                    </p>
                  )}
                  {crmPushEnabled ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      A CRM sync follows this draft — the draft step always pauses for approval before sync runs.
                    </p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="wf-tone-hint" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tone & positioning
                  </label>
                  <select
                    id="wf-tone-hint"
                    value={authoringToneHint}
                    onChange={(e) => setAuthoringToneHint(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  >
                    {WORKFLOW_DRAFT_TONE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                    {WORKFLOW_DRAFT_TONE_PRESETS.find((p) => p.id === authoringToneHint)?.description}
                  </p>
                </div>

                <div>
                  <label htmlFor="wf-subject-canvas" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Subject template
                  </label>
                  <input
                    id="wf-subject-canvas"
                    value={subjectTemplate}
                    onChange={(ev) => setSubjectTemplate(ev.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-xs text-slate-800 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Merge tokens listed under the Variables tab hydrate from lead + enrichment rows.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-3 text-xs leading-relaxed text-slate-600">
                  Need HubSpot or Salesforce instead of a draft? Use{" "}
                  <span className="font-semibold text-slate-800">Insert orchestration step → CRM sync</span> — each workflow has one
                  terminal output at a time.
                  {crmProviders.length === 0 ? (
                    <>
                      {" "}
                      <Link
                        href={integrationsHref}
                        className="font-semibold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                      >
                        Connect CRM integration
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {inspectorTab === "inputs" ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What feeds the draft</p>
                <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-3 text-xs leading-relaxed text-slate-700">
                  {enrichLead ? (
                    <p>
                      <span className="font-semibold text-slate-900">Enrichment lane</span> — firmographics and intelligence facts hydrate before signals are interpreted.
                    </p>
                  ) : (
                    <p>
                      <span className="font-semibold text-slate-900">Enrichment lane off</span> — composer relies on captured lead fields only unless upstream steps change.
                    </p>
                  )}
                  <p className="mt-2">
                      <span className="font-semibold text-slate-900">Campaign Agents ({orderedSignalIds.length})</span> — ordered exactly as configured on the Campaign Agents node.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => selectStep("signals")}
                  className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-950 transition hover:bg-violet-100/90"
                >
                  Edit Campaign Agents & ordering →
                </button>
              </div>
            ) : null}

            {inspectorTab === "variables" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">Merge tokens</p>
                <p className="text-xs leading-relaxed text-slate-600">
                  Tokens hydrate from captured lead rows plus enrichment outputs before the LLM call — custom objects join here as we widen composer contracts.
                </p>
                <div className="flex flex-wrap gap-2">
                  {mergeTokens.map((t) => (
                    <code
                      key={t}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-800"
                    >
                      {t}
                    </code>
                  ))}
                </div>
              </div>
            ) : null}

            {inspectorTab === "history" ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">{hist.title}</p>
                <p className="text-xs leading-relaxed text-slate-600">{hist.body}</p>
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-xs text-slate-500">
                  {hist.foot}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {selectedStep === "crmFuture" ? (
          <>
            {inspectorTab === "destination" ? (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-slate-600">
                  Choose the CRM destination and whether this workflow should attach AI conversation notes alongside the lead or contact sync.
                </p>

                <div>
                  <label htmlFor="wf-terminal-approval-crm" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Delivery mode
                  </label>
                  {crmDeliveryModeLockedToAutomatic ? (
                    <>
                      <div
                        id="wf-terminal-approval-crm"
                        className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-800"
                      >
                        Automatic
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        A draft step runs before this CRM sync. The draft pauses for approval; this CRM step is stored without an extra approval gate.
                      </p>
                    </>
                  ) : (
                    <>
                      <select
                        id="wf-terminal-approval-crm"
                        value="automatic"
                        onChange={() => setTerminalRequiresApproval(false)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                      >
                        <option value="automatic">Automatic</option>
                        <option disabled value="approval">Approval required (coming soon)</option>
                      </select>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                        CRM sync approval is coming soon. Add an approval-required draft step before CRM sync when review is needed.
                      </p>
                    </>
                  )}
                </div>

                {crmProviders.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                    <p className="font-semibold">No CRM connected yet</p>
                    <p className="mt-2 text-xs leading-relaxed text-amber-900/95">
                      Connect HubSpot or Salesforce under Integrations before this step can run.
                    </p>
                    <Link
                      href={integrationsHref}
                      className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-950 underline decoration-amber-800/50 underline-offset-2 hover:text-amber-900"
                    >
                      Go to Integrations
                      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  </div>
                ) : null}

                <div>
                  <label htmlFor="wf-crm-provider-inspector" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Destination
                  </label>
                  <select
                    id="wf-crm-provider-inspector"
                    value={crmProvider ?? "hubspot"}
                    onChange={(e) => setCrmProvider(e.target.value as WorkflowCrmProviderKey)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                  >
                    {crmProviders.length > 0
                      ? crmProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))
                      : (
                          <>
                            <option value="hubspot">HubSpot</option>
                            <option value="salesforce">Salesforce</option>
                          </>
                        )}
                  </select>
                </div>
                <div>
                  <label htmlFor="wf-crm-operation-inspector" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    CRM action
                  </label>
                  <select
                    id="wf-crm-operation-inspector"
                    value={crmOperation}
                    onChange={(e) => setCrmOperation(e.target.value as WorkflowCrmOperationId)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                  >
                    {crmOperationChoices.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    {crmOperationChoices.find((o) => o.id === crmOperation)?.description}
                  </p>
                </div>
                <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/55 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Effective CRM behavior</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      These settings are used by this workflow run and match what the CRM sync handler executes.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {crmBehaviorSummary.map((summary) => (
                      <div
                        key={summary}
                        className="rounded-xl border border-white/80 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
                      >
                        {summary}
                      </div>
                    ))}
                  </div>
                  <div>
                    <label htmlFor="wf-crm-config-mode" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Behavior source
                    </label>
                    <select
                      id="wf-crm-config-mode"
                      value={crmSyncConfigMode}
                      onChange={(e) => {
                        const mode = e.target.value as WorkflowCrmSyncConfigMode;
                        setCrmSyncConfigMode(mode);
                        if (mode === "override") {
                          setCrmSyncConfigOverride((prev) => ({
                            recordType: prev?.recordType ?? crmOverrideDefaults.recordType,
                            matchBehavior: prev?.matchBehavior ?? crmOverrideDefaults.matchBehavior,
                            sourceLabel: prev?.sourceLabel ?? crmOverrideDefaults.sourceLabel
                          }));
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                    >
                      <option value="integration_default">Use integration defaults</option>
                      <option value="override">Override for this workflow</option>
                    </select>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Defaults come from the connected CRM integration. Overrides apply only to this workflow step.
                    </p>
                  </div>

                  {crmSyncConfigMode === "override" ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                      <div>
                        <label htmlFor="wf-crm-record-type" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Record type
                        </label>
                        <select
                          id="wf-crm-record-type"
                          value={crmSyncConfigOverride?.recordType ?? crmOverrideDefaults.recordType}
                          onChange={(e) =>
                            setCrmSyncConfigOverride((prev) => ({
                              ...crmOverrideDefaults,
                              ...prev,
                              recordType: e.target.value as WorkflowCrmSyncRecordType
                            }))
                          }
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                        >
                          {crmProvider === "salesforce" ? (
                            <option value="lead">Salesforce Lead</option>
                          ) : (
                            <option value="contact">HubSpot contact</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="wf-crm-match-behavior" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Matching behavior
                        </label>
                        <select
                          id="wf-crm-match-behavior"
                          value={crmSyncConfigOverride?.matchBehavior ?? crmOverrideDefaults.matchBehavior}
                          onChange={(e) =>
                            setCrmSyncConfigOverride((prev) => ({
                              ...crmOverrideDefaults,
                              ...prev,
                              matchBehavior: e.target.value as WorkflowCrmSyncMatchBehavior
                            }))
                          }
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                        >
                          <option value="create_only">{crmMatchBehaviorLabel("create_only")}</option>
                          <option value="update_existing">{crmMatchBehaviorLabel("update_existing")}</option>
                          <option value="upsert_by_email">{crmMatchBehaviorLabel("upsert_by_email")}</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="wf-crm-source-label" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Campaign or source label
                        </label>
                        <input
                          id="wf-crm-source-label"
                          value={crmSyncConfigOverride?.sourceLabel ?? ""}
                          onChange={(e) =>
                            setCrmSyncConfigOverride((prev) => ({
                              ...crmOverrideDefaults,
                              ...prev,
                              sourceLabel: e.target.value
                            }))
                          }
                          placeholder="Optional"
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                      Inherited defaults: {crmRecordTypeLabel(effectiveCrmSyncConfig)} ·{" "}
                      {crmMatchBehaviorLabel(effectiveCrmSyncConfig.matchBehavior)}
                      {effectiveCrmSyncConfig.sourceLabel ? ` · ${effectiveCrmSyncConfig.sourceLabel}` : ""}
                    </div>
                  )}
                </div>
                <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Send to CRM</p>
                    <label className="mt-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <input
                        type="checkbox"
                        checked={crmContentOptions.includeLeadDetails}
                        readOnly
                        disabled
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>
                        <span className="block text-sm font-medium text-slate-900">Lead details</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          {crmProvider === "salesforce"
                            ? "Creates or updates the Salesforce Lead."
                            : "Creates or updates the HubSpot contact."}
                        </span>
                      </span>
                    </label>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">CRM note sections</p>
                    <label className="mt-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={crmContentOptions.includeCampaignContextInCrmNote}
                        onChange={(e) =>
                          setCrmContentOptions((prev) => ({
                            ...prev,
                            includeCampaignContextInCrmNote: e.target.checked
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>
                        <span className="block">Include campaign context in CRM note</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          Adds the campaign/source label and a short write-up of the CRM behavior used by this workflow.
                        </span>
                      </span>
                    </label>
                    <label className="mt-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={crmContentOptions.includeAiNotes}
                        onChange={(e) =>
                          setCrmContentOptions((prev) => ({
                            ...prev,
                            includeAiNotes: e.target.checked
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>
                        <span className="block">AI conversation notes</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          Includes the conversation summary and objections when available.
                        </span>
                      </span>
                    </label>
                    <label className="mt-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={crmContentOptions.includeRecommendedFollowUpInCrmNote}
                        onChange={(e) =>
                          setCrmContentOptions((prev) => ({
                            ...prev,
                            includeRecommendedFollowUpInCrmNote: e.target.checked
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>
                        <span className="block">Include recommended follow-up in CRM note</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          Adds internal rep guidance and next-best-action notes. This is separate from email copy.
                        </span>
                      </span>
                    </label>
                    <label className="mt-2 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={crmContentOptions.includeSuggestedEmailDraftInCrmNote}
                        onChange={(e) =>
                          setCrmContentOptions((prev) => ({
                            ...prev,
                            includeSuggestedEmailDraftInCrmNote: e.target.checked
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                      />
                      <span>
                        <span className="block">Include suggested email draft in CRM note</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          Adds actual follow-up email copy the rep can send. No email is sent automatically.
                        </span>
                      </span>
                    </label>
                    {crmContentOptions.includeSuggestedEmailDraftInCrmNote ? (
                      <div className="mt-2">
                        <label
                          htmlFor="wf-crm-email-draft-instructions"
                          className="text-xs font-semibold uppercase tracking-wide text-slate-500"
                        >
                          Email draft instructions
                        </label>
                        <textarea
                          id="wf-crm-email-draft-instructions"
                          value={crmContentOptions.suggestedEmailInstructions ?? ""}
                          onChange={(e) =>
                            setCrmContentOptions((prev) => ({
                              ...prev,
                              suggestedEmailInstructions: e.target.value
                            }))
                          }
                          placeholder="Keep it short, reference the booth conversation, and ask for a 15-minute demo."
                          rows={3}
                          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                {crmProviderMeta ? (
                  <Link
                    href={`${crmProviderMeta.manageHref}${eventIdQs}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 underline decoration-sky-400 underline-offset-2 hover:text-sky-950"
                  >
                    Manage {crmProviderMeta.label} connection
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="border-t border-slate-200/80 p-5">
        <Link
          href={`/exhibitor/workflows${eventIdQs}`}
          className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
