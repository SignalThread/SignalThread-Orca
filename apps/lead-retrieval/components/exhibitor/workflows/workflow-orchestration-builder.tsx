"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  GitBranch,
  Layers,
  Lock,
  MessageSquare,
  Plus,
  Send,
  Share2
} from "lucide-react";

import { WorkflowFlowCanvas } from "./workflow-orchestration-builder-canvas";
import {
  buildWorkflowGraph,
  type WorkflowCanvasStep,
  type WorkflowGraphCallbacks
} from "./workflow-builder-graph";
import { WorkflowOrchestrationInspector } from "./workflow-orchestration-inspector";
import {
  defaultInspectorTabForStep,
  inspectorTabSpecsForStep
} from "./workflow-inspector-tabs";
import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentProviderOption
} from "@/lib/exhibitor/workflows/workflow-builder-enrichment-types";
import type { WorkflowBuilderCrmProviderOption } from "@/lib/exhibitor/workflows/workflow-builder-crm-types";
import type { WorkflowBuilderSignalOption } from "@/lib/exhibitor/workflows/workflow-builder-signal-types";
import {
  composeTerminalSupportsAutomaticDraft,
  type WorkflowComposeOutputActionKind
} from "@/lib/exhibitor/workflows/workflow-compose-output-action";
import {
  labelForCrmOperation,
  workflowCrmOperationOptions
} from "@/lib/exhibitor/workflows/workflow-crm-inspector-options";
import { WORKFLOW_DRAFT_TONE_PRESETS } from "@/lib/exhibitor/workflows/draft-tone-presets";
import { WORKFLOW_ENRICHMENT_FOCUS_AREAS } from "@/lib/exhibitor/workflows/enrichment-focus-options";
import {
  availableFocusAreaIdsForProviderOption,
  filterAvailableFocusAreaIdsForProviderOption
} from "@/lib/exhibitor/workflows/enrichment-provider-capabilities";
import { deriveWorkflowBuilderAddStepState } from "@/lib/exhibitor/workflows/workflow-builder-step-rules";
import type {
  WorkflowCrmSyncContentOptions,
  WorkflowCrmOperationId,
  WorkflowCrmProviderKey
} from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  defaultCrmSyncConfigForProvider,
  resolveWorkflowCrmSyncConfig,
  workflowCrmSyncConfigSummary,
  type WorkflowCrmSyncConfig,
  type WorkflowCrmSyncConfigMode
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";
import {
  DEFAULT_TRIGGER_RULE_CONFIG,
  triggerRuleConfigCardSummary,
  triggerRuleConfigToJson,
  type LeadCapturedTriggerRuleConfig
} from "@/lib/exhibitor/workflows/lead-captured-trigger-rule-config";
import type { WorkflowOrchestrationBuilderInitialState } from "@/lib/exhibitor/workflows/workflow-builder-state";

export type { WorkflowBuilderSignalOption };

type AddStepCategory = {
  id: string;
  label: string;
  description: string;
  items: {
    id: string;
    title: string;
    subtitle: string;
    icon: ReactNode;
    accent: string;
    enabled: boolean;
    onSelect?: () => void;
  }[];
};

function cn(...parts: (string | false | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

function sameIdOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function defaultCrmProviderFromConnectedProviders(
  providers: readonly WorkflowBuilderCrmProviderOption[]
): WorkflowCrmProviderKey | null {
  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0]!.id;
  return providers[0]!.id;
}

export function WorkflowOrchestrationBuilder({
  signals,
  enrichmentProviders,
  workspaceDefaultAdapterKey,
  crmProviders,
  initialState,
  mode = "create",
  workflowId,
  eventId,
  scopeMode = "event",
  onCancel,
  onSaved
}: {
  signals: readonly WorkflowBuilderSignalOption[];
  enrichmentProviders: readonly WorkflowBuilderEnrichmentProviderOption[];
  workspaceDefaultAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  crmProviders: readonly WorkflowBuilderCrmProviderOption[];
  initialState?: WorkflowOrchestrationBuilderInitialState;
  mode?: "create" | "edit";
  workflowId?: string;
  eventId?: string | null;
  scopeMode?: "event" | "company";
  onCancel?: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const effectiveEventId = useMemo(() => {
    const explicit = String(eventId ?? "").trim();
    if (explicit) return explicit;
    return searchParams.get("eventId")?.trim() ?? "";
  }, [eventId, searchParams]);

  const eventIdQs = useMemo(() => {
    if (effectiveEventId) return `?eventId=${encodeURIComponent(effectiveEventId)}`;
    return scopeMode === "company" ? "?scope=company" : "";
  }, [effectiveEventId, scopeMode]);

  const [name, setName] = useState(initialState?.name ?? "");
  const [isEnabled, setIsEnabled] = useState(initialState?.isEnabled ?? true);
  const [enrichLead, setEnrichLead] = useState(initialState?.enrichLead ?? true);
  const [composeDraft, setComposeDraft] = useState(initialState?.composeDraft ?? true);
  const [subjectTemplate, setSubjectTemplate] = useState(
    initialState?.subjectTemplate ?? "Hi {{first_name}}, quick follow-up"
  );
  const [outputActionKind, setOutputActionKind] = useState<WorkflowComposeOutputActionKind>(
    initialState?.outputActionKind ?? "campaign_draft"
  );
  const [orderedSignalIds, setOrderedSignalIds] = useState<string[]>(initialState?.orderedSignalIds ?? []);
  const [signalsStageEnabled, setSignalsStageEnabled] = useState(initialState?.signalsStageEnabled ?? true);
  const [crmPushEnabled, setCrmPushEnabled] = useState(initialState?.crmPushEnabled ?? false);
  const [crmProvider, setCrmProvider] = useState<WorkflowCrmProviderKey | null>(initialState?.crmProvider ?? null);
  const [crmOperation, setCrmOperation] = useState<WorkflowCrmOperationId>(
    initialState?.crmOperation ?? "hubspot_upsert_contact"
  );
  const [crmContentOptions, setCrmContentOptions] = useState<WorkflowCrmSyncContentOptions>(
    initialState?.crmContentOptions ?? {
      includeLeadDetails: true,
      includeAiNotes: false,
      includeCampaignContextInCrmNote: false,
      includeRecommendedFollowUpInCrmNote: false,
      includeSuggestedEmailDraftInCrmNote: false,
      suggestedEmailInstructions: null
    }
  );
  const [crmSyncConfigMode, setCrmSyncConfigMode] = useState<WorkflowCrmSyncConfigMode>(
    initialState?.crmSyncConfigMode ?? "integration_default"
  );
  const [crmSyncConfigOverride, setCrmSyncConfigOverride] = useState<Partial<WorkflowCrmSyncConfig> | null>(
    initialState?.crmSyncConfigOverride ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [enrichmentAdapterKey, setEnrichmentAdapterKey] = useState<WorkflowBuilderEnrichmentAdapterKey | null>(
    initialState?.enrichmentAdapterKey ?? null
  );
  const [enrichmentFocusIds, setEnrichmentFocusIds] = useState<string[]>(
    () => initialState?.enrichmentFocusIds ?? WORKFLOW_ENRICHMENT_FOCUS_AREAS.map((a) => a.id)
  );
  const [enrichmentFocusChangeMessage, setEnrichmentFocusChangeMessage] = useState<string | null>(null);
  const [authoringToneHint, setAuthoringToneHint] = useState<string>(
    initialState?.authoringToneHint ?? WORKFLOW_DRAFT_TONE_PRESETS[0]!.id
  );
  const [terminalApprovalRequired, setTerminalApprovalRequired] = useState(
    initialState?.terminalApprovalRequired ?? true
  );
  const [triggerRuleConfig, setTriggerRuleConfig] = useState<LeadCapturedTriggerRuleConfig>(
    initialState?.triggerRuleConfig ?? DEFAULT_TRIGGER_RULE_CONFIG
  );

  const [selectedStep, setSelectedStep] = useState<WorkflowCanvasStep>("trigger");
  const [inspectorTab, setInspectorTab] = useState<string>(() => defaultInspectorTabForStep("trigger"));

  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addAfter, setAddAfter] = useState<"trigger" | "enrich">("trigger");
  const hasInitializedEnrichmentFocusRef = useRef(Boolean(initialState?.enrichmentFocusIds.length));

  const signalById = useMemo(() => new Map(signals.map((s) => [s.id, s.name])), [signals]);
  const enrichmentProviderById = useMemo(
    () => new Map(enrichmentProviders.map((provider) => [provider.id, provider])),
    [enrichmentProviders]
  );
  const enrichmentProviderLabelById = useMemo(
    () => new Map(enrichmentProviders.map((provider) => [provider.id, provider.label])),
    [enrichmentProviders]
  );

  const composeAllowsAutomaticTerminal = useMemo(
    () =>
      composeDraft &&
      composeTerminalSupportsAutomaticDraft(outputActionKind) &&
      !crmPushEnabled,
    [composeDraft, outputActionKind, crmPushEnabled]
  );

  useEffect(() => {
    if (!composeDraft) return;
    if (!composeTerminalSupportsAutomaticDraft(outputActionKind)) {
      setTerminalApprovalRequired(true);
    }
  }, [composeDraft, outputActionKind]);

  useEffect(() => {
    if (composeDraft && crmPushEnabled) {
      setTerminalApprovalRequired(true);
    }
  }, [composeDraft, crmPushEnabled]);

  useEffect(() => {
    if (!composeDraft && crmPushEnabled) {
      setTerminalApprovalRequired(false);
    }
  }, [composeDraft, crmPushEnabled]);

  useEffect(() => {
    if (enrichmentProviders.length === 0) {
      setEnrichmentAdapterKey(null);
      setEnrichmentFocusIds([]);
      setEnrichmentFocusChangeMessage(null);
      hasInitializedEnrichmentFocusRef.current = false;
      return;
    }
    setEnrichmentAdapterKey((prev) => {
      if (prev && enrichmentProviders.some((p) => p.id === prev)) return prev;
      const fallback =
        workspaceDefaultAdapterKey && enrichmentProviders.some((p) => p.id === workspaceDefaultAdapterKey)
          ? workspaceDefaultAdapterKey
          : enrichmentProviders[0]!.id;
      return fallback;
    });
  }, [enrichmentProviders, workspaceDefaultAdapterKey]);

  useEffect(() => {
    if (!enrichLead || !enrichmentAdapterKey) return;
    const selectedProvider = enrichmentProviderById.get(enrichmentAdapterKey);
    if (!selectedProvider) return;
    setEnrichmentFocusIds((prev) => {
      const filtered = filterAvailableFocusAreaIdsForProviderOption(selectedProvider, prev);
      const next = !hasInitializedEnrichmentFocusRef.current
        ? filtered.length > 0
          ? filtered
          : [...availableFocusAreaIdsForProviderOption(selectedProvider)]
        : filtered;

      hasInitializedEnrichmentFocusRef.current = true;
      return sameIdOrder(prev, next) ? prev : next;
    });
  }, [enrichLead, enrichmentAdapterKey, enrichmentProviderById]);

  useEffect(() => {
    if (!crmPushEnabled) return;
    setCrmProvider((prev) => {
      if (prev && crmProviders.some((p) => p.id === prev)) return prev;
      return defaultCrmProviderFromConnectedProviders(crmProviders);
    });
  }, [crmPushEnabled, crmProviders]);

  useEffect(() => {
    setInspectorTab(defaultInspectorTabForStep(selectedStep));
  }, [selectedStep]);

  useEffect(() => {
    if (!crmProvider) return;
    setCrmOperation((prev) => {
      const opts = workflowCrmOperationOptions(crmProvider);
      if (opts.some((o) => o.id === prev)) return prev;
      return opts[0]!.id;
    });
  }, [crmProvider]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addMenuOpen]);

  const openInsertAfterTrigger = useCallback(() => {
    setAddAfter("trigger");
    setAddMenuOpen(true);
  }, []);

  const openInsertAfterEnrich = useCallback(() => {
    setAddAfter("enrich");
    setAddMenuOpen(true);
  }, []);

  const selectStep = useCallback((step: WorkflowCanvasStep) => {
    setSelectedStep(step);
  }, []);

  const handleEnrichmentAdapterKeyChange = useCallback(
    (nextKey: WorkflowBuilderEnrichmentAdapterKey) => {
      if (nextKey === enrichmentAdapterKey) return;
      const nextProvider = enrichmentProviderById.get(nextKey);
      if (!nextProvider) return;

      const filtered = filterAvailableFocusAreaIdsForProviderOption(nextProvider, enrichmentFocusIds);
      const removedCount = enrichmentFocusIds.length - filtered.length;
      const providerLabel = enrichmentProviderLabelById.get(nextKey) ?? "this provider";

      hasInitializedEnrichmentFocusRef.current = true;
      setEnrichmentAdapterKey(nextKey);
      setEnrichmentFocusIds(filtered);
      setEnrichmentFocusChangeMessage(
        removedCount > 0
          ? `${removedCount === 1 ? "1 selected category is" : `${removedCount} selected categories are`} not available for ${providerLabel}. ${removedCount === 1 ? "It was" : "They were"} removed.`
          : null
      );
    },
    [enrichmentAdapterKey, enrichmentFocusIds, enrichmentProviderById, enrichmentProviderLabelById]
  );

  const removeEnrich = useCallback(() => {
    setEnrichLead(false);
    setSelectedStep("trigger");
  }, []);

  const removeCompose = useCallback(() => {
    setComposeDraft(false);
    setSelectedStep((prev) => {
      if (prev === "crmFuture") return prev;
      if (prev === "compose") {
        return signalsStageEnabled ? "signals" : enrichLead ? "enrich" : "trigger";
      }
      if (prev === "signals") {
        return enrichLead ? "enrich" : "trigger";
      }
      return prev;
    });
  }, [enrichLead, signalsStageEnabled]);

  const removeSignalsStage = useCallback(() => {
    if (orderedSignalIds.length > 0) {
      const ok = window.confirm(
        "Remove the Campaign Agents step? Selected Campaign Agents stay saved if you add this step again."
      );
      if (!ok) return;
    }
    setSignalsStageEnabled(false);
    setSelectedStep((prev) => {
      if (prev !== "signals") return prev;
      if (composeDraft) return "compose";
      if (crmPushEnabled) return "crmFuture";
      return enrichLead ? "enrich" : "trigger";
    });
  }, [orderedSignalIds.length, composeDraft, crmPushEnabled, enrichLead]);

  const removeCrm = useCallback(() => {
    setCrmPushEnabled(false);
    setCrmProvider(null);
    setSelectedStep((prev) => {
      if (prev !== "crmFuture") return prev;
      if (composeDraft) return "compose";
      if (signalsStageEnabled) return "signals";
      return enrichLead ? "enrich" : "trigger";
    });
  }, [composeDraft, signalsStageEnabled, enrichLead]);

  const callbacks: WorkflowGraphCallbacks = useMemo(
    () => ({
      select: selectStep,
      openInsertAfterTrigger,
      openInsertAfterEnrich,
      removeEnrich,
      removeSignals: removeSignalsStage,
      removeCompose,
      removeCrm
    }),
    [
      selectStep,
      openInsertAfterTrigger,
      openInsertAfterEnrich,
      removeEnrich,
      removeSignalsStage,
      removeCompose,
      removeCrm
    ]
  );

  const hasConfiguredTerminal = composeDraft || crmPushEnabled;

  const afterTriggerTerminal = !enrichLead && !hasConfiguredTerminal;
  const afterEnrichTerminal = enrichLead && !hasConfiguredTerminal;

  const orderedSignalsMeta = orderedSignalIds.map((id, idx) => ({
    id,
    name: signalById.get(id) ?? id,
    rank: idx + 1
  }));

  const enrichmentConfigured = enrichmentProviders.length > 0;
  const enrichmentProviderLabel =
    enrichmentAdapterKey && enrichLead
      ? enrichmentProviders.find((p) => p.id === enrichmentAdapterKey)?.label ?? null
      : null;

  const effectiveCrmProvider = crmPushEnabled ? (crmProvider ?? defaultCrmProviderFromConnectedProviders(crmProviders)) : null;

  const crmProviderMeta = useMemo(() => {
    if (!effectiveCrmProvider) return null;
    return crmProviders.find((p) => p.id === effectiveCrmProvider) ?? null;
  }, [effectiveCrmProvider, crmProviders]);

  const effectiveCrmSyncConfig = useMemo(() => {
    const provider = effectiveCrmProvider ?? "hubspot";
    return resolveWorkflowCrmSyncConfig({
      provider,
      workflowMode: crmSyncConfigMode,
      workflowOverride: crmSyncConfigOverride,
      integrationDefault: crmProviderMeta?.defaultSyncConfig ?? defaultCrmSyncConfigForProvider(provider)
    });
  }, [crmProviderMeta?.defaultSyncConfig, crmSyncConfigMode, crmSyncConfigOverride, effectiveCrmProvider]);

  const crmBehaviorSummary = useMemo(
    () => workflowCrmSyncConfigSummary(effectiveCrmSyncConfig),
    [effectiveCrmSyncConfig]
  );

  const crmOperationChoices = useMemo(
    () => (effectiveCrmProvider ? workflowCrmOperationOptions(effectiveCrmProvider) : []),
    [effectiveCrmProvider]
  );

  const mergeTokens = ["{{first_name}}", "{{Company_Name}}", "{{event_name}}"];

  const inspectorTabs = useMemo(() => inspectorTabSpecsForStep(selectedStep), [selectedStep]);

  const triggerRuleSummary = triggerRuleConfigCardSummary(triggerRuleConfig);

  const { nodes, edges } = buildWorkflowGraph({
    enrichLead,
    composeDraft,
    crmPushEnabled,
    crmProviderId: effectiveCrmProvider,
    crmProviderLabel:
      crmProviderMeta?.label ?? (effectiveCrmProvider === "salesforce" ? "Salesforce" : "HubSpot"),
    crmLogoSrc:
      crmProviderMeta?.logoSrc ??
      (effectiveCrmProvider === "salesforce"
        ? "/integrations/salesforce-logo.svg"
        : "/integrations/hubspot-logo.svg"),
    crmOperationLabel: effectiveCrmProvider ? labelForCrmOperation(effectiveCrmProvider, crmOperation) : "",
    crmOperationDescription:
      crmOperationChoices.find((o) => o.id === crmOperation)?.description ??
      "Uses your live CRM integration when this step runs.",
    crmBehaviorSummary,
    crmContentOptions,
    selectedStep,
    orderedSignalsMeta,
    subjectTemplate,
    templateName: "Lead Intel",
    outputActionKind,
    mergeTokens,
    workflowName: name,
    isEnabled,
    triggerRuleSummary,
    afterTriggerTerminal,
    afterEnrichTerminal,
    callbacks,
    enrichmentConfigured,
    enrichmentProviderLabel,
    signalsStageEnabled,
    terminalRequiresApproval: terminalApprovalRequired
  });

  const addSignal = useCallback((id: string) => {
    setOrderedSignalIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const removeSignal = useCallback((id: string) => {
    setOrderedSignalIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const moveSignal = useCallback((index: number, delta: number) => {
    setOrderedSignalIds((prev) => {
      const next = prev.slice();
      const j = index + delta;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[j]!;
      next[j] = tmp!;
      return next;
    });
  }, []);

  const signalCategoryOrder = useMemo(
    () => ["AI-Powered", "Contextual", "Custom", "Call-to-Action"] as const,
    []
  );

  const signalsByCategory = useMemo(() => {
    const map = new Map<string, WorkflowBuilderSignalOption[]>();
    for (const c of signalCategoryOrder) map.set(c, []);
    map.set("Other", []);
    for (const s of signals) {
      const bucket = signalCategoryOrder.includes(s.category as (typeof signalCategoryOrder)[number])
        ? s.category
        : "Other";
      map.get(bucket)!.push(s);
    }
    return map;
  }, [signals, signalCategoryOrder]);

  const categoryAccent = useMemo(
    () =>
      ({
        "AI-Powered": "border-fuchsia-200/90 bg-fuchsia-50/90 text-fuchsia-950",
        Contextual: "border-sky-200/90 bg-sky-50/90 text-sky-950",
        Custom: "border-amber-200/90 bg-amber-50/90 text-amber-950",
        "Call-to-Action": "border-emerald-200/90 bg-emerald-50/90 text-emerald-950",
        Other: "border-slate-200/90 bg-slate-50/90 text-slate-800"
      }) as Record<string, string>,
    []
  );

  function toggleEnrichmentFocus(id: string) {
    setEnrichmentFocusChangeMessage(null);
    setEnrichmentFocusIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "edit") {
      if (!workflowId) {
        setError("Missing workflow id for edit.");
        return;
      }
      const ok = window.confirm(
        "Editing this workflow may affect future leads that match this trigger. Existing completed runs will not be changed."
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const triggerConditions = triggerRuleConfigToJson(triggerRuleConfig);
      const payload: Record<string, unknown> = {
        name: name.trim(),
        is_enabled: isEnabled,
        enrich_lead: enrichLead,
        compose_campaign_draft: composeDraft,
        selected_signal_ids: orderedSignalIds,
        subject_template: subjectTemplate.trim(),
        template_name: "Lead Intel"
      };
      if (triggerConditions !== null) {
        payload.trigger_conditions_jsonb = triggerConditions;
      }
      if (composeDraft) {
        payload.output_action_kind = outputActionKind;
      }
      if (effectiveEventId) payload.event_id = effectiveEventId;
      if (scopeMode === "company") payload.workflow_scope = "company";
      if (enrichLead && enrichmentAdapterKey) {
        payload.enrichment_adapter_key = enrichmentAdapterKey;
        payload.enrichment_focus_areas = enrichmentFocusIds;
      }
      if (composeDraft) {
        payload.authoring_tone_hint = authoringToneHint;
      }
      if (crmPushEnabled) {
        payload.crm_push_enabled = true;
        payload.crm_provider = crmProvider ?? defaultCrmProviderFromConnectedProviders(crmProviders);
        payload.crm_operation = crmOperation;
        payload.includeLeadDetails = crmContentOptions.includeLeadDetails;
        payload.includeAiNotes = crmContentOptions.includeAiNotes;
        payload.includeCampaignContextInCrmNote = crmContentOptions.includeCampaignContextInCrmNote;
        payload.includeRecommendedFollowUpInCrmNote = crmContentOptions.includeRecommendedFollowUpInCrmNote;
        payload.includeSuggestedEmailDraftInCrmNote = crmContentOptions.includeSuggestedEmailDraftInCrmNote;
        payload.suggestedEmailInstructions = crmContentOptions.suggestedEmailInstructions ?? "";
        payload.crm_sync_config_mode = crmSyncConfigMode;
        if (crmSyncConfigMode === "override") {
          payload.crm_record_type = crmSyncConfigOverride?.recordType ?? effectiveCrmSyncConfig.recordType;
          payload.crm_match_behavior = crmSyncConfigOverride?.matchBehavior ?? effectiveCrmSyncConfig.matchBehavior;
          payload.crm_source_label = crmSyncConfigOverride?.sourceLabel ?? "";
        }
      }
      if (!signalsStageEnabled) {
        payload.signals_stage_enabled = false;
      }
      if (composeDraft || crmPushEnabled) {
        payload.terminal_requires_approval = terminalApprovalRequired;
      }

      const res = await fetch(
        mode === "edit" && workflowId
          ? `/api/exhibitor/workflows/${encodeURIComponent(workflowId)}`
          : "/api/exhibitor/workflows/create",
        {
          method: mode === "edit" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(json?.error ?? `Save failed (${res.status}).`);
        return;
      }

      if (mode === "edit") {
        router.refresh();
        onSaved?.();
      } else {
        router.push(`/exhibitor/workflows${eventIdQs}`);
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const addCategories = useMemo((): AddStepCategory[] => {
    const {
      canEnrich,
      canComposeAfterTrigger,
      canComposeAfterEnrich,
      canAddCrmFromModal,
      canAddSignalsStage
    } = deriveWorkflowBuilderAddStepState({
      addAfter,
      enrichLead,
      composeDraft,
      crmPushEnabled,
      signalsStageEnabled
    });
    const crmAlreadyTerminal = crmPushEnabled && !composeDraft;

    const crmSubtitle = crmAlreadyTerminal
      ? "CRM sync is already in this workflow."
      : composeDraft
        ? "Add CRM after draft approval so downstream teams still get the final workflow output."
        : crmProviders.length > 0
          ? `Uses connected CRM · ${crmProviders.map((p) => p.label).join(" · ")}`
          : "Push/update lead in HubSpot or Salesforce after intelligence stages.";

    return [
      {
        id: "intelligence",
        label: "Intelligence",
        description: "Gather context before downstream actions.",
        items: [
          {
            id: "enrich",
            title: "Lead enrichment",
            subtitle: "Firmographics & intelligence synthesis",
            icon: <Brain className="h-5 w-5" />,
            accent: "from-indigo-50 to-violet-50 ring-indigo-200/80 text-indigo-700",
            enabled: canEnrich,
            onSelect: () => {
              setEnrichLead(true);
              setAddMenuOpen(false);
              setSelectedStep("enrich");
            }
          },
          {
            id: "signals-stage",
            title: "Prioritized Campaign Agents",
            subtitle: "Rank Campaign Agents before your terminal action",
            icon: <Layers className="h-5 w-5" aria-hidden />,
            accent: "from-violet-50 to-fuchsia-50 ring-violet-200/85 text-violet-900",
            enabled: canAddSignalsStage,
            onSelect: () => {
              setSignalsStageEnabled(true);
              setAddMenuOpen(false);
              setSelectedStep("signals");
            }
          },
          {
            id: "score",
            title: "Lead scoring",
            subtitle: "Coming soon",
            icon: <Activity className="h-5 w-5" />,
            accent: "from-slate-100 to-slate-50 ring-slate-200/90 text-slate-600",
            enabled: false
          }
        ]
      },
      {
        id: "outputs",
        label: "Outputs",
        description: "Add draft generation, CRM sync, or both depending on the workflow outcome you want.",
        items: [
          {
            id: "compose",
            title: "Campaign / email draft",
            subtitle: "Produces a reviewable artifact from Campaign Agents + enrichment",
            icon: <Send className="h-5 w-5" />,
            accent: "from-purple-50 to-slate-50 ring-purple-200/80 text-purple-800",
            enabled: canComposeAfterTrigger || canComposeAfterEnrich,
            onSelect: () => {
              setComposeDraft(true);
              setTerminalApprovalRequired(true);
              setAddMenuOpen(false);
              setSelectedStep("compose");
            }
          }
        ]
      },
      {
        id: "crm",
        label: "CRM",
        description: "Uses OAuth connections from Integrations — same workspace ecosystem.",
        items: [
          {
            id: "crm",
            title: "CRM sync",
            subtitle: crmSubtitle,
            icon: <Share2 className="h-5 w-5" />,
            accent: canAddCrmFromModal
              ? "from-sky-50 to-white ring-sky-200/90 text-sky-900"
              : "from-slate-100 to-slate-50 ring-slate-200/90 text-slate-600",
            enabled: canAddCrmFromModal,
            onSelect: () => {
              setCrmPushEnabled(true);
              setCrmProvider(defaultCrmProviderFromConnectedProviders(crmProviders));
              setTerminalApprovalRequired(false);
              setAddMenuOpen(false);
              setSelectedStep("crmFuture");
            }
          }
        ]
      },
      {
        id: "messaging",
        label: "Messaging",
        description: "SMS & alternate channels — roadmap.",
        items: [
          {
            id: "sms",
            title: "SMS follow-up",
            subtitle: "Coming soon",
            icon: <MessageSquare className="h-5 w-5" />,
            accent: "from-slate-100 to-slate-50 ring-slate-200/90 text-slate-600",
            enabled: false
          }
        ]
      },
      {
        id: "timing",
        label: "Timing",
        description: "Cadence & quiet hours.",
        items: [
          {
            id: "delay",
            title: "Delay / wait",
            subtitle: "Coming soon",
            icon: <Clock className="h-5 w-5" />,
            accent: "from-slate-100 to-slate-50 ring-slate-200/90 text-slate-600",
            enabled: false
          }
        ]
      },
      {
        id: "conditions",
        label: "Conditions",
        description: "Logic gates & prerequisites.",
        items: [
          {
            id: "branch",
            title: "Branch / conditions",
            subtitle: "Coming soon",
            icon: <GitBranch className="h-5 w-5" />,
            accent: "from-slate-100 to-slate-50 ring-slate-200/90 text-slate-600",
            enabled: false
          }
        ]
      },
      {
        id: "routing",
        label: "Routing",
        description: "Queues, SLAs, account hierarchies.",
        items: [
          {
            id: "queues",
            title: "Owner routing",
            subtitle: "Coming soon",
            icon: <Share2 className="h-5 w-5" />,
            accent: "from-slate-100 to-slate-50 ring-slate-200/90 text-slate-600",
            enabled: false
          }
        ]
      }
    ];
  }, [addAfter, enrichLead, composeDraft, crmProviders, crmPushEnabled, signalsStageEnabled]);

  const integrationsHref = `/exhibitor/integrations${eventIdQs}`;
  const signalsHref = `/exhibitor/signals${eventIdQs}`;
  const saveBlockedByEnrichment =
    enrichLead &&
    (!enrichmentConfigured || enrichmentAdapterKey === null || enrichmentFocusIds.length === 0);
  return (
    <div className="min-h-[calc(100vh-7rem)] text-slate-800">
      <form onSubmit={onSubmit} className="min-w-0 overflow-hidden rounded-[1.35rem] border border-slate-200/90 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-5 py-4 lg:px-7">
          <div className="min-w-0 flex-[1_1_24rem]">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Link
                href={`/exhibitor/workflows${eventIdQs}`}
                className="inline-flex items-center gap-2 font-medium text-slate-600 transition hover:text-slate-950"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {mode === "edit" ? "Workflow detail" : "Workflows"}
              </Link>
              <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
              <span className="font-semibold text-slate-950">
                {mode === "edit" ? "Edit workflow" : "Workflow builder"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {mode === "edit" ? "Editing existing workflow" : "Draft ready to save"}
              </span>
              {saveBlockedByEnrichment ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                  Enrichment needs configuration
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Eye className="h-4 w-4" aria-hidden />
              {mode === "edit" ? "Cancel" : "Preview workflow"}
            </button>
            <button
              type="submit"
              disabled={submitting || saveBlockedByEnrichment}
              title={
                saveBlockedByEnrichment
                  ? "Choose an enrichment provider, select at least one enrichment category, or turn off enrichment."
                  : undefined
              }
              className="inline-flex h-10 items-center rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Saving…" : mode === "edit" ? "Save Changes" : "Save workflow"}
            </button>
          </div>
        </div>

        <div className="flex min-h-[34rem] min-w-0 flex-wrap items-stretch">
          <div className="min-w-[min(100%,34rem)] flex-[2_1_40rem]">
            <div className="flex flex-col gap-5 border-b border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 px-5 py-6 lg:px-7">
              <div className="flex flex-wrap items-center justify-between gap-5">
                <div className="min-w-0 flex-[1_1_28rem]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-600">
                    Orchestration canvas
                  </p>
                  <h1 className="mt-2 flex flex-wrap items-center gap-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                    <span>{mode === "edit" ? "Edit workflow" : "Workflow builder"}</span>
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">
                      Beta
                    </span>
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                    {mode === "edit"
                      ? "Update the lead journey from capture to campaign. Changes apply to future matching leads after you save."
                      : "Design the lead journey from capture to campaign. Configure each step, choose Campaign Agents, and turn on the workflow when you are ready."}
                  </p>
                </div>
                <label className="flex min-w-[min(100%,16rem)] flex-[0_1_16rem] cursor-pointer items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Active</p>
                    <p className="text-xs text-slate-500">Eligible when leads are captured</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isEnabled}
                    onClick={() => setIsEnabled((v) => !v)}
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
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddAfter(enrichLead ? "enrich" : "trigger");
                    setAddMenuOpen(true);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add step
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Templates
                </button>
                <div className="ml-auto inline-flex h-10 flex-[0_1_auto] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                  Validate workflow
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">No issues</span>
                </div>
              </div>
            </div>

            <div className="h-[clamp(34rem,72vh,60rem)] min-w-0 w-full bg-slate-50">
              <WorkflowFlowCanvas nodes={nodes} edges={edges} onStepSelected={selectStep} />
            </div>

          {error ? (
            <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
          </div>

        <aside className="min-w-[min(100%,24rem)] flex-[1_1_24rem] border-t border-slate-200/80 bg-white">
          <WorkflowOrchestrationInspector
            inspectorTabs={inspectorTabs}
            inspectorTab={inspectorTab}
            setInspectorTab={setInspectorTab}
            selectedStep={selectedStep}
            selectStep={selectStep}
            eventIdQs={eventIdQs}
            integrationsHref={integrationsHref}
            signalsHref={signalsHref}
            name={name}
            setName={setName}
            isEnabled={isEnabled}
            setIsEnabled={setIsEnabled}
            enrichLead={enrichLead}
            enrichmentConfigured={enrichmentConfigured}
            enrichmentProviders={enrichmentProviders}
            enrichmentAdapterKey={enrichmentAdapterKey}
            setEnrichmentAdapterKey={handleEnrichmentAdapterKeyChange}
            workspaceDefaultAdapterKey={workspaceDefaultAdapterKey}
            enrichmentFocusIds={enrichmentFocusIds}
            toggleEnrichmentFocus={toggleEnrichmentFocus}
            enrichmentFocusChangeMessage={enrichmentFocusChangeMessage}
            signalsByCategory={signalsByCategory}
            signalCategoryOrder={signalCategoryOrder}
            categoryAccent={categoryAccent}
            orderedSignalIds={orderedSignalIds}
            signalById={signalById}
            addSignal={addSignal}
            removeSignal={removeSignal}
            moveSignal={moveSignal}
            signalsTotalCount={signals.length}
            composeDraft={composeDraft}
            outputActionKind={outputActionKind}
            setOutputActionKind={setOutputActionKind}
            subjectTemplate={subjectTemplate}
            setSubjectTemplate={setSubjectTemplate}
            authoringToneHint={authoringToneHint}
            setAuthoringToneHint={setAuthoringToneHint}
            crmProviders={crmProviders}
            crmPushEnabled={crmPushEnabled}
            crmProvider={crmProvider}
            setCrmProvider={setCrmProvider}
            crmOperation={crmOperation}
            setCrmOperation={setCrmOperation}
            crmContentOptions={crmContentOptions}
            setCrmContentOptions={setCrmContentOptions}
            crmOperationChoices={crmOperationChoices}
            crmProviderMeta={crmProviderMeta}
            crmSyncConfigMode={crmSyncConfigMode}
            setCrmSyncConfigMode={setCrmSyncConfigMode}
            crmSyncConfigOverride={crmSyncConfigOverride}
            setCrmSyncConfigOverride={setCrmSyncConfigOverride}
            effectiveCrmSyncConfig={effectiveCrmSyncConfig}
            crmBehaviorSummary={crmBehaviorSummary}
            mergeTokens={mergeTokens}
            terminalRequiresApproval={terminalApprovalRequired}
            setTerminalRequiresApproval={setTerminalApprovalRequired}
            composeAllowsAutomaticTerminal={composeAllowsAutomaticTerminal}
            crmDeliveryModeLockedToAutomatic={composeDraft && crmPushEnabled}
            triggerRuleConfig={triggerRuleConfig}
            setTriggerRuleConfig={setTriggerRuleConfig}
          />
        </aside>
        </div>
      </form>

      {addMenuOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-step-title"
          onClick={() => setAddMenuOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p id="add-step-title" className="text-lg font-semibold text-slate-900">
                  Insert orchestration step
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {addAfter === "trigger"
                    ? "After trigger — grow your intelligence pipeline."
                    : "After enrichment — add outreach."}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close"
                onClick={() => setAddMenuOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-8">
              {addCategories.map((cat) => (
                <div key={cat.id}>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{cat.label}</p>
                  <p className="mt-1 text-xs text-slate-500">{cat.description}</p>
                  <ul className="mt-4 space-y-3">
                    {cat.items.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={!item.enabled}
                          onClick={item.enabled ? item.onSelect : undefined}
                          className={cn(
                            "flex w-full items-start gap-4 rounded-xl border px-4 py-3 text-left transition",
                            item.enabled
                              ? "border-slate-200 bg-white shadow-sm hover:border-indigo-300 hover:shadow-md"
                              : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1",
                              item.accent
                            )}
                          >
                            {item.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{item.title}</span>
                              {!item.enabled ? <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden /> : null}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-600">{item.subtitle}</span>
                          </span>
                          {item.enabled ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-500" /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
