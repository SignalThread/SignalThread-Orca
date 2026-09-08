"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Eye, Trash2, X } from "lucide-react";
import type {
  WorkflowBuilderEnrichmentAdapterKey,
  WorkflowBuilderEnrichmentProviderOption
} from "@/lib/exhibitor/workflows/workflow-builder-enrichment-types";
import type { WorkflowBuilderCrmProviderOption } from "@/lib/exhibitor/workflows/workflow-builder-crm-types";
import type { WorkflowBuilderSignalOption } from "@/lib/exhibitor/workflows/workflow-builder-signal-types";
import type { WorkflowOrchestrationBuilderInitialState } from "@/lib/exhibitor/workflows/workflow-builder-state";
import { WorkflowOrchestrationBuilder } from "./workflow-orchestration-builder";
import { WORKFLOW_DRAFT_TONE_PRESETS } from "@/lib/exhibitor/workflows/draft-tone-presets";
import type {
  LeadSummaryMini,
  WorkflowDetailComposeSignal,
  WorkflowDetailRunFilter,
  WorkflowDetailRunPagination,
  WorkflowDetailStepRow,
  WorkflowDetailTemplate,
  WorkflowDraftDetailRow,
  WorkflowPendingApprovalDetail,
  WorkflowRunSummaryRow,
  WorkflowStepRunDetailRow
} from "@/lib/exhibitor/workflows/workflow-detail-types";
import {
  triggerRuleConfigCardSummary,
  triggerRuleConfigFromJson
} from "@/lib/exhibitor/workflows/lead-captured-trigger-rule-config";
import {
  composeOutputActionKindLabel,
  normalizeComposeOutputActionKind
} from "@/lib/exhibitor/workflows/workflow-compose-output-action";
import { labelForCrmOperation } from "@/lib/exhibitor/workflows/workflow-crm-inspector-options";
import { COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE } from "@/lib/workflows/step-handlers/compose-campaign-draft-pure";
import {
  CRM_SYNC_HUBSPOT_STEP_TYPE,
  CRM_SYNC_SALESFORCE_STEP_TYPE,
  type WorkflowCrmProviderKey,
  normalizeCrmOperation
} from "@/lib/workflows/step-handlers/crm-sync-types";
import {
  defaultCrmSyncConfigForProvider,
  parseWorkflowCrmSyncConfigOverride,
  resolveWorkflowCrmSyncConfig,
  workflowCrmSyncConfigSummary
} from "@/lib/workflows/step-handlers/crm-sync-effective-config";
import { formatRunTerminalTimestamp } from "@/lib/exhibitor/workflows/workflow-detail-display";

function buildDetailHref(
  workflowId: string,
  input: {
    runId?: string | null;
    eventId?: string | null;
    runStatus?: WorkflowDetailRunFilter | null;
    runCursor?: string | null;
    approvalId?: string | null;
    hash?: string | null;
  }
): string {
  const p = new URLSearchParams();
  if (input.eventId) p.set("eventId", input.eventId);
  if (input.runId) p.set("runId", input.runId);
  if (input.runStatus && input.runStatus !== "all") p.set("runStatus", input.runStatus);
  if (input.runCursor) p.set("runCursor", input.runCursor);
  if (input.approvalId) p.set("approvalId", input.approvalId);
  const q = p.toString();
  const base = q ? `/exhibitor/workflows/${workflowId}?${q}` : `/exhibitor/workflows/${workflowId}`;
  return input.hash ? `${base}#${input.hash}` : base;
}

function crmStepBehaviorSuffix(
  step: WorkflowDetailStepRow,
  provider: WorkflowCrmProviderKey,
  crmProviders: readonly WorkflowBuilderCrmProviderOption[]
): string {
  const parsed = parseWorkflowCrmSyncConfigOverride(step.params_jsonb, provider);
  const providerDefault =
    crmProviders.find((crmProvider) => crmProvider.id === provider)?.defaultSyncConfig ??
    defaultCrmSyncConfigForProvider(provider);
  const resolved = resolveWorkflowCrmSyncConfig({
    provider,
    workflowMode: parsed.mode,
    workflowOverride: parsed.override,
    integrationDefault: providerDefault
  });
  return workflowCrmSyncConfigSummary(resolved).join(" · ");
}

function stepDisplayLabel(
  step: WorkflowDetailStepRow,
  crmProviders: readonly WorkflowBuilderCrmProviderOption[] = []
): string {
  if (step.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) {
    const kind = normalizeComposeOutputActionKind(step.params_jsonb["outputActionKind"]);
    return `Action · ${composeOutputActionKindLabel(kind)}`;
  }
  if (step.step_type === CRM_SYNC_HUBSPOT_STEP_TYPE) {
    const op = normalizeCrmOperation(step.params_jsonb["operation"], "hubspot");
    return `CRM · HubSpot · ${labelForCrmOperation("hubspot", op)} · ${crmStepBehaviorSuffix(step, "hubspot", crmProviders)}`;
  }
  if (step.step_type === CRM_SYNC_SALESFORCE_STEP_TYPE) {
    const op = normalizeCrmOperation(step.params_jsonb["operation"], "salesforce");
    return `CRM · Salesforce · ${labelForCrmOperation("salesforce", op)} · ${crmStepBehaviorSuffix(step, "salesforce", crmProviders)}`;
  }
  switch (step.step_type) {
    case "enrich_lead":
      return "Enrichment";
    default:
      return step.step_type;
  }
}

function marketerStepLabel(
  step: WorkflowDetailStepRow | null | undefined,
  crmProviders: readonly WorkflowBuilderCrmProviderOption[] = []
): string {
  if (!step) return "Workflow step";
  if (step.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) {
    const kind = normalizeComposeOutputActionKind(step.params_jsonb["outputActionKind"]);
    if (kind === "campaign_draft") return "Campaign draft";
    return composeOutputActionKindLabel(kind);
  }
  if (step.step_type === CRM_SYNC_HUBSPOT_STEP_TYPE) return "HubSpot sync";
  if (step.step_type === CRM_SYNC_SALESFORCE_STEP_TYPE) return "Salesforce sync";
  if (step.step_type === "enrich_lead") return "Lead enrichment";
  return stepDisplayLabel(step, crmProviders);
}

function stepLabelFromType(stepType: string | null, steps: readonly WorkflowDetailStepRow[]): string {
  const step = stepType ? steps.find((s) => s.step_type === stepType) : null;
  if (step) return marketerStepLabel(step);
  if (stepType === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) return "Campaign draft";
  if (stepType === CRM_SYNC_HUBSPOT_STEP_TYPE) return "HubSpot sync";
  if (stepType === CRM_SYNC_SALESFORCE_STEP_TYPE) return "Salesforce sync";
  if (stepType === "enrich_lead") return "Lead enrichment";
  return "Workflow step";
}

function stepRunDisplayLabel(
  sr: WorkflowStepRunDetailRow,
  definitionSteps: readonly WorkflowDetailStepRow[],
  crmProviders: readonly WorkflowBuilderCrmProviderOption[] = []
): string {
  const def = definitionSteps.find((s) => s.step_index === sr.step_index && s.step_type === sr.step_type);
  if (def) return stepDisplayLabel(def, crmProviders);
  if (sr.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) return "Action · Campaign Draft";
  if (sr.step_type === CRM_SYNC_HUBSPOT_STEP_TYPE) return "CRM · HubSpot";
  if (sr.step_type === CRM_SYNC_SALESFORCE_STEP_TYPE) return "CRM · Salesforce";
  if (sr.step_type === "enrich_lead") return "Enrichment";
  return sr.step_type;
}

function crmNoteSectionsSummary(sr: WorkflowStepRunDetailRow): string | null {
  if (sr.step_type !== CRM_SYNC_HUBSPOT_STEP_TYPE && sr.step_type !== CRM_SYNC_SALESFORCE_STEP_TYPE) {
    return null;
  }
  const sections = sr.output_jsonb?.crmNoteSections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return null;
  const record = sections as Record<string, unknown>;
  const labels = [
    record.campaignContext === true ? "Campaign context" : null,
    record.aiConversationInsights === true ? "AI conversation insights" : null,
    record.recommendedFollowUp === true ? "Recommended follow-up" : null,
    record.suggestedEmailDraft === true ? "Suggested email draft" : null
  ].filter(Boolean);
  return labels.length > 0 ? `CRM note included: ${labels.join(" · ")}` : null;
}

function waitDebugSummary(sr: WorkflowStepRunDetailRow): string | null {
  if (!sr.status.startsWith("waiting_for_") && !sr.waiting_reason) return null;
  const parts = [
    sr.required_conversation_version != null ? `Required conversation v${sr.required_conversation_version}` : null,
    sr.current_transcript_version != null ? `Transcript v${sr.current_transcript_version}` : "Transcript not ready",
    sr.current_insights_version != null ? `Insights v${sr.current_insights_version}` : "Insights not ready",
    sr.wait_expires_at ? `Wait expires ${formatTs(sr.wait_expires_at)}` : null
  ].filter(Boolean);
  return parts.join(" · ");
}

function RunStatusBadge({ status }: { status: string }) {
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status === "failed" || status === "cancelled"
      ? "bg-rose-50 text-rose-800 ring-rose-200"
      : status === "awaiting_approval" || status.startsWith("waiting_for_")
      ? "bg-amber-50 text-amber-900 ring-amber-200"
      : status === "running" || status === "queued"
      ? "bg-sky-50 text-sky-800 ring-sky-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tone}`}>{status}</span>
  );
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildMatchingRuleSummary(raw: Record<string, unknown> | null): { title: string; detail: string } {
  const config = triggerRuleConfigFromJson(raw);
  const card = triggerRuleConfigCardSummary(config);
  if (card === "All captured leads") {
    return {
      title: "All captured leads",
      detail: "Runs for every lead captured in this workflow's scope."
    };
  }
  const title = `Only ${card.replace(/\//g, " or ").replace(" · ", " ")} leads`;
  return {
    title,
    detail: "Only applies to captured leads that match this audience rule."
  };
}

function runOutcomeLabel(status: string): string {
  switch (status) {
    case "awaiting_approval":
      return "Waiting for approval";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "queued":
      return "Queued";
    case "running":
      return "Running";
    case "waiting_for_audio_transcript":
      return "Waiting for transcript";
    case "waiting_for_conversation_insights":
      return "Waiting for insights";
    default:
      return status;
  }
}

function draftKindLabel(kind: string): string {
  if (kind === "email") return "Email";
  if (kind === "briefing_block") return "Briefing block";
  return kind || "Draft";
}

function draftApprovalLabel(status: string): string {
  if (status === "pending") return "Pending approval";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "sent") return "Sent";
  return status || "Unknown status";
}

export function WorkflowDetailView({
  workflowId,
  template,
  steps,
  composeSignals,
  runs,
  runFilter,
  runPagination,
  leads,
  selectedRunId,
  stepRuns,
  drafts,
  pendingApprovals,
  selectedApprovalId,
  eventIdForNav,
  eventIdForBuilder,
  canManageWorkflow,
  builderInitialState,
  signals,
  enrichmentProviders,
  workspaceDefaultAdapterKey,
  crmProviders
}: {
  workflowId: string;
  template: WorkflowDetailTemplate;
  steps: readonly WorkflowDetailStepRow[];
  composeSignals: readonly WorkflowDetailComposeSignal[];
  runs: readonly WorkflowRunSummaryRow[];
  runFilter: WorkflowDetailRunFilter;
  runPagination: WorkflowDetailRunPagination;
  leads: readonly LeadSummaryMini[];
  selectedRunId: string | null;
  stepRuns: readonly WorkflowStepRunDetailRow[];
  drafts: readonly WorkflowDraftDetailRow[];
  pendingApprovals: readonly WorkflowPendingApprovalDetail[];
  selectedApprovalId: string | null;
  eventIdForNav: string | null;
  eventIdForBuilder: string | null;
  canManageWorkflow: boolean;
  builderInitialState: WorkflowOrchestrationBuilderInitialState | null;
  signals: readonly WorkflowBuilderSignalOption[];
  enrichmentProviders: readonly WorkflowBuilderEnrichmentProviderOption[];
  workspaceDefaultAdapterKey: WorkflowBuilderEnrichmentAdapterKey | null;
  crmProviders: readonly WorkflowBuilderCrmProviderOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draftActionId, setDraftActionId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; tone: "success" | "error"; message: string }>>([]);

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);
  const pendingApprovalByRunId = useMemo(
    () => new Map(pendingApprovals.map((approval) => [approval.run.id, approval])),
    [pendingApprovals]
  );
  const selectedApproval =
    pendingApprovals.find((approval) => approval.draft.id === selectedApprovalId) ?? pendingApprovals[0] ?? null;
  const primaryActionStep = steps.find((step) => step.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) ?? steps[0] ?? null;
  const approvalStep = steps.find((step) => step.requires_approval) ?? primaryActionStep;
  const matchingRuleSummary = buildMatchingRuleSummary(template.trigger_conditions_jsonb);
  const actionSummary = primaryActionStep
    ? primaryActionStep.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE
      ? "Creates a campaign draft."
      : `${marketerStepLabel(primaryActionStep, crmProviders)}.`
    : "No workflow action has been configured yet.";
  const approvalSummary = approvalStep?.requires_approval
    ? `Pauses before ${marketerStepLabel(approvalStep, crmProviders).toLowerCase()} until approved.`
    : "Runs without a manual approval step.";

  if (editing && builderInitialState) {
    return (
      <WorkflowOrchestrationBuilder
        signals={signals}
        enrichmentProviders={enrichmentProviders}
        workspaceDefaultAdapterKey={workspaceDefaultAdapterKey}
        crmProviders={crmProviders}
        initialState={builderInitialState}
        mode="edit"
        workflowId={workflowId}
        eventId={eventIdForBuilder}
        scopeMode={eventIdForBuilder ? "event" : "company"}
        onCancel={() => setEditing(false)}
        onSaved={() => setEditing(false)}
      />
    );
  }

  async function callDraftAction(draftId: string, action: "approve" | "reject") {
    setDraftActionId(draftId);
    try {
      const url =
        action === "approve"
          ? `/api/exhibitor/generated-drafts/${encodeURIComponent(draftId)}/approve`
          : `/api/exhibitor/generated-drafts/${encodeURIComponent(draftId)}/reject`;
      const res = await fetch(url, {
        method: "POST",
        ...(action === "reject"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: "Rejected from workflow detail" })
            }
          : {})
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        pushToast("error", j?.error ?? `Request failed (${res.status}).`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setDraftActionId(null);
    }
  }

  function pushToast(tone: "success" | "error", message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

  function requestDeleteWorkflow() {
    if (!template.created_by) {
      pushToast("error", "System workflows cannot be deleted.");
      return;
    }
    setDeleteDialogOpen(true);
  }

  async function deleteWorkflow() {
    if (deleting) return;
    setDeleting(true);
    try {
      const deleteUrl = eventIdForNav
        ? `/api/exhibitor/workflows/${encodeURIComponent(workflowId)}?eventId=${encodeURIComponent(eventIdForNav)}`
        : `/api/exhibitor/workflows/${encodeURIComponent(workflowId)}`;
      const res = await fetch(deleteUrl, {
        method: "DELETE"
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to delete workflow");
      }
      setDeleteDialogOpen(false);
      pushToast("success", "Workflow deleted.");
      router.push(eventIdForNav ? `/exhibitor/workflows?eventId=${encodeURIComponent(eventIdForNav)}` : "/exhibitor/workflows");
      startTransition(() => router.refresh());
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to delete workflow");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3 border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{template.name}</h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {template.description?.trim() ||
                `${template.trigger_event === "lead_captured" ? "Runs when a lead is captured" : "Runs from its configured trigger"} and ${actionSummary.charAt(0).toLowerCase()}${actionSummary.slice(1)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canManageWorkflow && builderInitialState ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Edit
              </button>
            ) : null}
            {canManageWorkflow && template.created_by ? (
              <button
                type="button"
                onClick={requestDeleteWorkflow}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-600 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            ) : null}
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                template.is_enabled
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : "bg-slate-100 text-slate-700 ring-slate-200"
              }`}
            >
              {template.is_enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-500">Updated {formatTs(template.updated_at)}</p>
      </header>
      <WorkflowToastStack toasts={toasts} />
      <DeleteWorkflowDialog
        open={deleteDialogOpen}
        isDeleting={deleting}
        onCancel={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        onConfirm={() => void deleteWorkflow()}
      />

      {selectedApproval ? (
        <ApprovalNeededCard
          approval={selectedApproval}
          steps={steps}
          composeSignals={composeSignals}
          pending={draftActionId === selectedApproval.draft.id}
          onApprove={() => void callDraftAction(selectedApproval.draft.id, "approve")}
          onReject={() => void callDraftAction(selectedApproval.draft.id, "reject")}
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Workflow summary</h2>
        <div className="grid gap-3 lg:grid-cols-5">
          <SummaryCard
            label="Status"
            value={template.is_enabled ? "Enabled" : "Disabled"}
            detail={
              template.is_enabled
                ? "This workflow can run when matching leads are captured."
                : "This workflow is turned off and will not run."
            }
          />
          <SummaryCard
            label="Trigger"
            value="Lead captured"
            detail={template.trigger_event === "lead_captured" ? "Runs when a lead is captured." : "Runs from its configured trigger."}
          />
          <SummaryCard label="Audience" value={matchingRuleSummary.title} detail={matchingRuleSummary.detail} />
          <SummaryCard label="Action" value={marketerStepLabel(primaryActionStep, crmProviders)} detail={actionSummary} />
          <SummaryCard label="Approval" value={approvalStep?.requires_approval ? "Required" : "Not required"} detail={approvalSummary} />
        </div>
        {composeSignals.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign agents used</p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {composeSignals.map((signal) => signal.name).join(", ")}
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent runs</h2>
            <p className="mt-1 text-sm text-slate-500">Review what happened most recently and jump to approvals that need attention.</p>
          </div>
          <RunFilterChips workflowId={workflowId} eventId={eventIdForNav} activeFilter={runFilter} />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Step</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      No workflow runs match this view.
                    </td>
                  </tr>
                ) : runs.map((r) => {
                  const lead = leadById.get(r.lead_id);
                  const term = formatRunTerminalTimestamp({
                    status: r.status,
                    completed_at: r.completed_at,
                    updated_at: r.updated_at
                  });
                  const isSelected = r.id === selectedRunId;
                  const step = steps.find((s) => s.step_index === r.current_step_index) ?? null;
                  const pendingApproval = pendingApprovalByRunId.get(r.id);
                  return (
                    <tr key={r.id} className={isSelected ? "bg-sky-50/50" : undefined}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatTs(r.created_at)}</td>
                      <td className="px-4 py-3">
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3">
                        {lead ? (
                          <Link
                            href={`/exhibitor/leads/${encodeURIComponent(lead.id)}`}
                            className="font-medium text-sky-700 hover:underline"
                          >
                            {lead.full_name}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-slate-700">Unknown lead</span>
                        )}
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {[lead?.company_text, lead?.email].filter(Boolean).join(" · ") || "No company or email"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.status === "awaiting_approval" ? "Waiting for approval" : marketerStepLabel(step, crmProviders)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">
                        <span className="font-medium text-slate-700">{runOutcomeLabel(r.status)}</span>
                        {term.iso ? <span className="mt-0.5 block">{formatTs(term.iso)}</span> : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {pendingApproval ? (
                          <Link
                            href={buildDetailHref(workflowId, {
                              eventId: eventIdForNav,
                              runId: r.id,
                              runStatus: runFilter,
                              approvalId: pendingApproval.draft.id,
                              hash: "approval-needed"
                            })}
                            className="inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            Review approval
                          </Link>
                        ) : (
                          <Link
                            href={buildDetailHref(workflowId, {
                              eventId: eventIdForNav,
                              runId: r.id,
                              runStatus: runFilter,
                              hash: "run-diagnostics"
                            })}
                            className="inline-flex rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            View details
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {runPagination.hasMore && runPagination.nextCursor ? (
          <div className="flex justify-center">
            <Link
              href={buildDetailHref(workflowId, {
                eventId: eventIdForNav,
                runStatus: runFilter,
                runCursor: runPagination.nextCursor
              })}
              className="inline-flex rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Load more
            </Link>
          </div>
        ) : null}
      </section>

      <details id="run-diagnostics" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-base font-semibold text-slate-900">Run diagnostics</summary>
        <div className="mt-4 space-y-5">
          <label className="flex max-w-md flex-col gap-1 text-xs font-medium text-slate-600">
            Selected run
            <select
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm"
              value={selectedRunId ?? ""}
              disabled={runs.length === 0 || pending}
              onChange={(e) => {
                const next = e.target.value.trim() || null;
                startTransition(() => {
                  router.push(buildDetailHref(workflowId, { runId: next, eventId: eventIdForNav, runStatus: runFilter, hash: "run-diagnostics" }));
                });
              }}
            >
              {runs.length === 0 ? (
                <option value="">No runs in this view</option>
              ) : (
                runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatTs(r.created_at)} · {runOutcomeLabel(r.status)} ·{" "}
                    {leadById.get(r.lead_id)?.full_name ?? "Unknown lead"}
                  </option>
                ))
              )}
            </select>
          </label>

          {stepRuns.length > 0 ? (
            <StepRunsTable stepRuns={stepRuns} steps={steps} crmProviders={crmProviders} />
          ) : (
            <p className="text-sm text-slate-500">No diagnostic step records are available for this run.</p>
          )}

          {drafts.length > 0 ? <GeneratedDraftsList drafts={drafts} /> : null}
        </div>
      </details>

    </div>
  );
}

function ApprovalNeededCard({
  approval,
  steps,
  composeSignals,
  pending,
  onApprove,
  onReject
}: {
  approval: WorkflowPendingApprovalDetail;
  steps: readonly WorkflowDetailStepRow[];
  composeSignals: readonly WorkflowDetailComposeSignal[];
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const leadName = approval.lead?.full_name ?? "this lead";
  const stepLabel = stepLabelFromType(approval.step_label, steps);
  const composeStep = steps.find((step) => step.step_type === COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE) ?? null;
  const subjectTemplate =
    cleanString(composeStep?.params_jsonb.subjectTemplate) ?? approval.draft.subject_preview ?? "Configured subject template";
  const toneLabel = tonePresetLabel(cleanString(composeStep?.params_jsonb.authoringToneHint));
  const campaignAgents = composeSignals.length > 0 ? composeSignals.map((signal) => signal.name).join(", ") : "No campaign agents selected";
  const draftBody = approval.draft.body_preview;

  return (
    <section
      id="approval-needed"
      className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Approval needed</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Review before this workflow continues</h2>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              This workflow paused before creating the campaign draft for {leadName}.
            </p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">Lead</dt>
              <dd className="mt-1 font-semibold text-slate-950">{leadName}</dd>
              <dd className="text-xs text-slate-600">
                {[approval.lead?.company_text, approval.lead?.email].filter(Boolean).join(" · ") || "No company or email"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">Waiting step</dt>
              <dd className="mt-1 font-semibold text-slate-950">{stepLabel}</dd>
              <dd className="text-xs text-slate-600">Pauses until approved</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">What will happen</dt>
              <dd className="mt-1 font-semibold text-slate-950">Create a campaign draft</dd>
              <dd className="text-xs text-slate-600">No message is sent by this approval.</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-amber-700">Created</dt>
              <dd className="mt-1 font-semibold text-slate-950">{formatTs(approval.draft.created_at)}</dd>
            </div>
          </dl>
          <div className="grid gap-3 rounded-lg border border-amber-200 bg-white/70 p-3 text-sm sm:grid-cols-4">
            <ApprovalRequestDetail label="Subject template" value={subjectTemplate} />
            <ApprovalRequestDetail label="Tone / positioning" value={toneLabel} />
            <ApprovalRequestDetail label="Campaign agents used" value={campaignAgents} />
            <ApprovalRequestDetail label="Input scope" value="Captured fields and selected campaign agents" />
            {draftBody ? <ApprovalRequestDetail label="Draft body" value={draftBody} /> : null}
          </div>
          <details className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Review approval request</summary>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Action:</span> Approve draft creation
              </p>
              <p>
                <span className="font-semibold">Subject template:</span> {subjectTemplate}
              </p>
              {approval.draft.campaign_id ? (
                <Link
                  href={`/campaigns/${encodeURIComponent(approval.draft.campaign_id)}`}
                  className="inline-flex font-semibold text-sky-700 hover:underline"
                >
                  Open campaign draft
                </Link>
              ) : null}
            </div>
          </details>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:flex-col">
          <button
            type="button"
            disabled={pending}
            onClick={onApprove}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-4 w-4" aria-hidden />
            Approve draft creation
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onReject}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" aria-hidden />
            Reject
          </button>
        </div>
      </div>
    </section>
  );
}

function ApprovalRequestDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{label}</p>
      <p className="mt-1 font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function tonePresetLabel(toneId: string | null): string {
  if (!toneId) return "Workflow default";
  return WORKFLOW_DRAFT_TONE_PRESETS.find((preset) => preset.id === toneId)?.label ?? toneId;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function RunFilterChips({
  workflowId,
  eventId,
  activeFilter
}: {
  workflowId: string;
  eventId: string | null;
  activeFilter: WorkflowDetailRunFilter;
}) {
  const filters: Array<{ value: WorkflowDetailRunFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "awaiting_approval", label: "Awaiting approval" },
    { value: "completed", label: "Completed" },
    { value: "failed", label: "Failed" },
    { value: "active", label: "Queued/running" }
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {filters.map((filter) => (
        <Link
          key={filter.value}
          href={buildDetailHref(workflowId, { eventId, runStatus: filter.value })}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
            activeFilter === filter.value
              ? "border-slate-900 bg-slate-900 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          {filter.label}
        </Link>
      ))}
    </div>
  );
}

function StepRunsTable({
  stepRuns,
  steps,
  crmProviders
}: {
  stepRuns: readonly WorkflowStepRunDetailRow[];
  steps: readonly WorkflowDetailStepRow[];
  crmProviders: readonly WorkflowBuilderCrmProviderOption[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Step</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Diagnostic note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {stepRuns.map((sr) => (
              <tr key={sr.id}>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {stepRunDisplayLabel(sr, steps, crmProviders)}
                  {crmNoteSectionsSummary(sr) ? (
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {crmNoteSectionsSummary(sr)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <RunStatusBadge status={sr.status} />
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-700">{sr.attempt_count}</td>
                <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                  {sr.error_code ? <span className="font-semibold text-rose-700">{sr.error_code}</span> : null}
                  {sr.error_text ? <span className="mt-1 block whitespace-pre-wrap">{sr.error_text}</span> : null}
                  {waitDebugSummary(sr) ? <span className="mt-1 block">{waitDebugSummary(sr)}</span> : null}
                  {!sr.error_code && !sr.error_text && !waitDebugSummary(sr) ? "No diagnostic notes." : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GeneratedDraftsList({ drafts }: { drafts: readonly WorkflowDraftDetailRow[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">Generated outputs for selected run</h3>
      <ul className="space-y-3">
        {drafts.map((d) => (
          <li key={d.id} id={`draft-${d.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {draftKindLabel(d.kind)} · {draftApprovalLabel(d.approval_status)}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {d.subject_preview ?? "No subject preview"}
                </p>
                {d.body_preview ? <p className="mt-1 text-xs text-slate-500">{d.body_preview}</p> : null}
                <p className="mt-1 text-xs text-slate-500">Created {formatTs(d.created_at)}</p>
              </div>
              {d.campaign_id ? (
                <Link
                  href={`/campaigns/${encodeURIComponent(d.campaign_id)}`}
                  className="inline-flex shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Open campaign
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeleteWorkflowDialog({
  open,
  isDeleting,
  onCancel,
  onConfirm
}: {
  open: boolean;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-workflow-title" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 id="delete-workflow-title" className="text-lg font-semibold text-slate-950">
          Delete workflow?
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This permanently deletes this workflow and its related workflow runs/step runs/drafts. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex h-9 items-center rounded-md bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeleting ? "Deleting..." : "Delete workflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkflowToastStack({
  toasts
}: {
  toasts: Array<{ id: number; tone: "success" | "error"; message: string }>;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed right-4 top-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
