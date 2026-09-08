"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Trash2, Workflow } from "lucide-react";
import { WORKFLOW_DRAFT_TONE_PRESETS } from "@/lib/exhibitor/workflows/draft-tone-presets";
import type { WorkflowTemplateListRow } from "@/lib/exhibitor/workflows/workflow-list-types";
import {
  workflowStatusLabel,
  type LeadWorkflowStatusFilter,
  type WorkflowActivityRecord
} from "@/lib/exhibitor/workflows/workflow-lead-activity";
import {
  extractDraftBodyPreview,
  stripApprovalRequiredSubjectPrefix
} from "@/lib/exhibitor/workflows/workflow-detail-display";
import { PageHeader, PageShell } from "@/components/layout/page-header";

/**
 * Workflows list — table + empty state. Create navigates to `/exhibitor/workflows/new`
 * when `createWorkflowHref` is set (exhibitor admin + web admin only).
 */
export function WorkflowsListView({
  workflows,
  pendingApprovalCount = 0,
  approvalsHref = "/exhibitor/workflows/approvals",
  createWorkflowHref,
  navigationSearchSuffix = ""
}: {
  workflows: ReadonlyArray<WorkflowTemplateListRow>;
  pendingApprovalCount?: number;
  approvalsHref?: string;
  /** When null, hide primary Create CTAs (e.g. exhibitor viewer). */
  createWorkflowHref: string | null;
  /** Optional query string starting with `?` (e.g. `?eventId=…`) for workflow links. */
  navigationSearchSuffix?: string;
}) {
  return (
    <PageShell>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <span>Workflows</span>
            <WorkflowBetaBadge />
          </span>
        }
        subtitle="Automate enrichment, draft creation, and follow-up actions when leads are captured."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReviewApprovalsButton href={approvalsHref} count={pendingApprovalCount} />
            <CreateWorkflowButton href={createWorkflowHref} />
          </div>
        }
      />

      {workflows.length === 0 ? (
        <EmptyState createWorkflowHref={createWorkflowHref} />
      ) : (
        <WorkflowsTable
          workflows={workflows}
          navigationSearchSuffix={navigationSearchSuffix}
          canManageWorkflows={createWorkflowHref !== null}
        />
      )}
    </PageShell>
  );
}

export function WorkflowActivityReviewView({
  records,
  activityFilter = { workflowStatus: "pending_approval", leadId: null },
  navigationSearchSuffix = ""
}: {
  records: ReadonlyArray<WorkflowActivityRecord>;
  activityFilter?: { workflowStatus: LeadWorkflowStatusFilter | null; leadId: string | null };
  navigationSearchSuffix?: string;
}) {
  return (
    <PageShell>
      <PageHeader
        title="Workflow approvals"
        subtitle="Review pending approvals and inspect workflow activity without crowding the workflow builder."
        actions={
          <Link
            href={`/exhibitor/workflows${navigationSearchSuffix}`}
            className="inline-flex shrink-0 items-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Back to workflows
          </Link>
        }
      />
      <WorkflowActivitySection records={records} filter={activityFilter} navigationSearchSuffix={navigationSearchSuffix} />
    </PageShell>
  );
}

async function callDraftAction(draftId: string, action: "approve" | "reject") {
  const url =
    action === "approve"
      ? `/api/exhibitor/generated-drafts/${encodeURIComponent(draftId)}/approve`
      : `/api/exhibitor/generated-drafts/${encodeURIComponent(draftId)}/reject`;
  const res = await fetch(url, {
    method: "POST",
    ...(action === "reject"
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Rejected from workflow approvals" })
        }
      : {})
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed (${res.status}).`);
  }
}

function WorkflowActivitySection({
  records,
  filter,
  navigationSearchSuffix
}: {
  records: ReadonlyArray<WorkflowActivityRecord>;
  filter: { workflowStatus: LeadWorkflowStatusFilter | null; leadId: string | null };
  navigationSearchSuffix: string;
}) {
  const title = filter.workflowStatus ? workflowStatusLabel(filter.workflowStatus) : "Workflow approvals and runs";
  const subtitle = filter.leadId
    ? "Filtered to the selected lead from Leads."
    : "Review approvals and inspect completed, rejected, or failed workflow activity.";
  const tabHref = (status: LeadWorkflowStatusFilter | null) => {
    const params = new URLSearchParams(
      navigationSearchSuffix.startsWith("?") ? navigationSearchSuffix.slice(1) : navigationSearchSuffix
    );
    if (status) params.set("workflowStatus", status);
    else params.set("workflowStatus", "all");
    if (filter.leadId) params.set("leadId", filter.leadId);
    const query = params.toString();
    return query ? `/exhibitor/workflows/approvals?${query}` : "/exhibitor/workflows/approvals";
  };
  const emptyState =
    filter.workflowStatus === "pending_approval"
      ? "No pending approvals."
      : filter.workflowStatus === "approved"
        ? "No approved workflow records."
        : filter.workflowStatus === "rejected"
          ? "No rejected workflow records."
          : filter.workflowStatus === "completed"
            ? "No synced/completed workflow records."
            : filter.workflowStatus === "failed"
              ? "No failed workflow records."
              : "No workflow records match this view.";

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={tabHref(null)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter.workflowStatus === null
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            All activity
          </Link>
          {(["pending_approval", "approved", "rejected", "completed", "failed"] as const).map((status) => (
            <Link
              key={status}
              href={tabHref(status)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                filter.workflowStatus === status
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {workflowStatusLabel(status)}
            </Link>
          ))}
        </div>
      </div>

      {records.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
          {emptyState}
        </p>
      ) : (
        <ul className="space-y-3">
          {records.map((record) => (
            <WorkflowApprovalCard key={`${record.kind}-${record.id}`} record={record} />
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkflowApprovalCard({ record }: { record: WorkflowActivityRecord }) {
  const router = useRouter();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isPendingDraft = record.kind === "draft" && record.status === "pending" && record.draft_id;
  const display = buildApprovalDisplayModel(record);

  async function review(nextAction: "approve" | "reject") {
    if (!record.draft_id) return;
    setAction(nextAction);
    setError(null);
    try {
      await callDraftAction(record.draft_id, nextAction);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed.");
    } finally {
      setAction(null);
    }
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {display.approvalTitle}
            </p>
            <h3 className="mt-1 text-base font-bold text-slate-900">{display.leadName}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {[display.leadCompany, display.leadEmail].filter(Boolean).join(" · ") || "No lead company or email"}
            </p>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Workflow</dt>
              <dd className="font-medium text-slate-800">{display.workflowName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Created</dt>
              <dd className="font-medium text-slate-800">{display.createdAt}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">What will happen</dt>
              <dd className="font-medium text-slate-800">{display.approvalDescription}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Action</dt>
              <dd className="font-medium text-slate-800">{display.approvalActionLabel}</dd>
            </div>
          </dl>
          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-bold text-slate-800">Review request</summary>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <ApprovalRequestField label="Waiting step" value={display.waitingStepLabel} />
              <ApprovalRequestField label="Subject template" value={display.subjectTemplate} />
              <ApprovalRequestField label="Tone / positioning" value={display.toneLabel} />
              <ApprovalRequestField label="Input scope" value={display.inputSummary} />
              <ApprovalRequestField label="Agents used" value={display.agentNames.join(", ") || "Selected campaign agents"} />
              {display.realDraftBody ? (
                <div className="sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Draft body</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm text-slate-900">
                    {display.realDraftBody}
                  </p>
                </div>
              ) : null}
            </div>
          </details>
          {error ? <p className="text-sm font-semibold text-rose-600">{error}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          {isPendingDraft ? (
            <>
              <button
                type="button"
                disabled={action !== null}
                onClick={() => review("approve")}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {action === "approve" ? "Approving..." : display.approvalActionLabel}
              </button>
              <button
                type="button"
                disabled={action !== null}
                onClick={() => review("reject")}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {action === "reject" ? "Rejecting..." : "Reject"}
              </button>
            </>
          ) : null}
          <Link href={record.href} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50">
            Open run
          </Link>
        </div>
      </div>
    </li>
  );
}

function ApprovalRequestField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 rounded-lg bg-white p-3 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}

type ApprovalDisplayModel = {
  approvalTitle: string;
  approvalDescription: string;
  leadName: string;
  leadEmail: string | null;
  leadCompany: string | null;
  workflowName: string;
  waitingStepLabel: string;
  approvalActionLabel: string;
  subjectTemplate: string;
  toneLabel: string;
  inputSummary: string;
  agentNames: string[];
  createdAt: string;
  realDraftBody: string | null;
};

function buildApprovalDisplayModel(record: WorkflowActivityRecord): ApprovalDisplayModel {
  const waitingStepLabel = approvalStepLabel(record);
  const subjectTemplate =
    stringValue(record.content?.subject_template) ??
    (stringValue(record.content?.subject) ? stripApprovalRequiredSubjectPrefix(stringValue(record.content?.subject)!) : null) ??
    "Configured subject template";
  const draftBody = extractDraftBodyPreview(record.content);
  const toneId = stringValue(record.content?.authoringToneHint) ?? stringValue(nestedValue(record.content?.params_jsonb, "authoringToneHint"));
  const toneLabel = toneId
    ? WORKFLOW_DRAFT_TONE_PRESETS.find((preset) => preset.id === toneId)?.label ?? toneId
    : "Workflow default";
  const isCampaignDraft = waitingStepLabel.toLowerCase().includes("campaign draft");
  return {
    approvalTitle: isCampaignDraft ? "Campaign draft waiting for approval" : `${waitingStepLabel} waiting for approval`,
    approvalDescription: isCampaignDraft ? "Create a campaign draft" : `Continue the ${waitingStepLabel} step`,
    leadName: record.lead_name ?? "Unknown lead",
    leadEmail: record.lead_email,
    leadCompany: record.lead_company,
    workflowName: record.template_name ?? "Workflow",
    waitingStepLabel,
    approvalActionLabel: isCampaignDraft ? "Approve draft creation" : `Approve ${waitingStepLabel.toLowerCase()}`,
    subjectTemplate,
    toneLabel,
    inputSummary: isCampaignDraft ? "Captured fields and selected campaign agents" : "Workflow inputs for this step",
    agentNames: stringArrayValue(record.content?.agent_names ?? record.content?.campaign_agents),
    createdAt: formatRelativeDate(record.created_at) ?? "—",
    realDraftBody: draftBody
  };
}

function nestedValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return (value as Record<string, unknown>)[key];
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : null))
    .filter((item): item is string => Boolean(item));
}

function ReviewApprovalsButton({ href, count }: { href: string; count: number }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100"
    >
      <span>Review approvals</span>
      {count > 0 ? (
        <span className="rounded-full bg-amber-900 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

function WorkflowBetaBadge() {
  return (
    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">
      Beta
    </span>
  );
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function approvalStepLabel(record: WorkflowActivityRecord): string {
  const explicit = stringValue(record.content?.action_label);
  if (explicit) return explicit;
  const stepType = stringValue(record.content?.step_type) ?? record.step_key ?? record.draft_kind ?? record.kind;
  switch (stepType) {
    case "compose_campaign_draft":
    case "compose_draft":
      return "Campaign Draft";
    case "crm_sync_hubspot":
    case "crm_hubspot_sync":
      return "HubSpot CRM Sync";
    case "crm_sync_salesforce":
    case "crm_salesforce_sync":
      return "Salesforce CRM Sync";
    default:
      return stepType
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function CreateWorkflowButton({ href }: { href: string | null }) {
  if (!href) return null;
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
    >
      <Workflow className="h-4 w-4" aria-hidden />
      Create workflow
    </Link>
  );
}

function EmptyState({ createWorkflowHref }: { createWorkflowHref: string | null }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
        <Workflow className="h-6 w-6 text-slate-500" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-slate-900">Create your first workflow</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Workflows fire when leads are captured — enrich them, draft a follow-up email, and route
        approvals to your team. We&apos;ll surface results here as they run.
      </p>
      <div className="mt-6">
        <CreateWorkflowButton href={createWorkflowHref} />
      </div>
    </div>
  );
}

function WorkflowsTable({
  workflows,
  navigationSearchSuffix,
  canManageWorkflows
}: {
  workflows: ReadonlyArray<WorkflowTemplateListRow>;
  navigationSearchSuffix: string;
  canManageWorkflows: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplateListRow | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; tone: "success" | "error"; message: string }>>([]);
  const visibleWorkflows = workflows.filter((workflow) => !deletedIds.has(workflow.id));
  const eventIdForScope = new URLSearchParams(
    navigationSearchSuffix.startsWith("?") ? navigationSearchSuffix.slice(1) : navigationSearchSuffix
  ).get("eventId");

  function pushToast(tone: "success" | "error", message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }

  function requestDeleteWorkflow(workflow: WorkflowTemplateListRow) {
    if (!workflow.created_by) {
      pushToast("error", "System workflows cannot be deleted.");
      return;
    }
    setDeleteTarget(workflow);
  }

  async function deleteWorkflow() {
    if (!deleteTarget || deletingId) return;
    const workflow = deleteTarget;
    setDeletingId(workflow.id);
    try {
      const deleteUrl = eventIdForScope
        ? `/api/exhibitor/workflows/${encodeURIComponent(workflow.id)}?eventId=${encodeURIComponent(eventIdForScope)}`
        : `/api/exhibitor/workflows/${encodeURIComponent(workflow.id)}`;
      const response = await fetch(deleteUrl, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to delete workflow");
      }
      setDeletedIds((current) => new Set([...current, workflow.id]));
      setDeleteTarget(null);
      pushToast("success", "Workflow deleted.");
      router.refresh();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Failed to delete workflow");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      <WorkflowToastStack toasts={toasts} />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Trigger
                </th>
                <th scope="col" className="px-4 py-3">
                  Steps
                </th>
                <th scope="col" className="px-4 py-3">
                  Last run
                </th>
                <th scope="col" className="px-4 py-3">
                  Created
                </th>
                {canManageWorkflows ? (
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {visibleWorkflows.map((wf) => (
                <WorkflowRow
                  key={wf.id}
                  workflow={wf}
                  navigationSearchSuffix={navigationSearchSuffix}
                  canManageWorkflows={canManageWorkflows}
                  eventIdForScope={eventIdForScope}
                  isDeleting={deletingId === wf.id}
                  onToast={pushToast}
                  onDelete={() => requestDeleteWorkflow(wf)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <DeleteWorkflowDialog
        open={deleteTarget !== null}
        isDeleting={deleteTarget !== null && deletingId === deleteTarget.id}
        onCancel={() => {
          if (!deletingId) setDeleteTarget(null);
        }}
        onConfirm={() => void deleteWorkflow()}
      />
    </div>
  );
}

function WorkflowRow({
  workflow,
  navigationSearchSuffix,
  canManageWorkflows,
  eventIdForScope,
  isDeleting,
  onToast,
  onDelete
}: {
  workflow: WorkflowTemplateListRow;
  navigationSearchSuffix: string;
  canManageWorkflows: boolean;
  eventIdForScope: string | null;
  isDeleting: boolean;
  onToast: (tone: "success" | "error", message: string) => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const detailHref = `/exhibitor/workflows/${encodeURIComponent(workflow.id)}${navigationSearchSuffix}`;
  const canDeleteWorkflow = canManageWorkflows && Boolean(workflow.created_by);
  const [isEnabled, setIsEnabled] = useState(workflow.is_enabled);
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  useEffect(() => {
    setIsEnabled(workflow.is_enabled);
  }, [workflow.is_enabled]);

  async function toggleWorkflowStatus() {
    if (!canManageWorkflows || isSavingStatus) return;
    const nextEnabled = !isEnabled;
    setIsEnabled(nextEnabled);
    setIsSavingStatus(true);
    try {
      const statusUrl = eventIdForScope
        ? `/api/exhibitor/workflows/${encodeURIComponent(workflow.id)}/status?eventId=${encodeURIComponent(eventIdForScope)}`
        : `/api/exhibitor/workflows/${encodeURIComponent(workflow.id)}/status`;
      const response = await fetch(statusUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: nextEnabled })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update workflow status");
      }
      onToast("success", nextEnabled ? "Workflow activated." : "Workflow deactivated.");
      router.refresh();
    } catch (err) {
      setIsEnabled(!nextEnabled);
      onToast("error", err instanceof Error ? err.message : "Failed to update workflow status");
    } finally {
      setIsSavingStatus(false);
    }
  }

  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-4 py-3 align-top">
        <Link href={detailHref} className="font-semibold text-slate-900 hover:text-sky-700 hover:underline">
          {workflow.name}
        </Link>
        {workflow.description ? (
          <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{workflow.description}</div>
        ) : null}
      </td>
      <td className="px-4 py-3 align-top">
        <WorkflowStatusToggle
          isEnabled={isEnabled}
          isSaving={isSavingStatus}
          canToggle={canManageWorkflows}
          onToggle={() => void toggleWorkflowStatus()}
        />
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        <TriggerLabel
          triggerEvent={workflow.trigger_event}
          scope={workflow.scope}
          eventId={workflow.event_id}
        />
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        <StepsSummary
          steps={workflow.steps}
        />
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        {formatRelativeDate(workflow.last_run_at) ?? <span className="text-slate-400">Never</span>}
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        {formatRelativeDate(workflow.created_at) ?? "—"}
      </td>
      {canManageWorkflows ? (
        <td className="px-4 py-3 text-right align-top">
          {canDeleteWorkflow ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              data-testid={`delete-workflow-${workflow.id}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Delete workflow"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          ) : (
            <span
              className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-500"
              title="System workflows cannot be deleted"
            >
              System
            </span>
          )}
        </td>
      ) : null}
    </tr>
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

function WorkflowStatusToggle({
  isEnabled,
  isSaving,
  canToggle,
  onToggle
}: {
  isEnabled: boolean;
  isSaving: boolean;
  canToggle: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isEnabled}
      aria-label={isEnabled ? "Deactivate workflow" : "Activate workflow"}
      disabled={!canToggle || isSaving}
      onClick={onToggle}
      data-testid="workflow-status-toggle"
      className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        isEnabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
          : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
      title={canToggle ? "Toggle workflow active state" : "Only workflow admins can change status"}
    >
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition ${
          isEnabled ? "bg-emerald-500" : "bg-slate-300"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition ${
            isEnabled ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
      <span>{isSaving ? "Saving..." : isEnabled ? "Active" : "Inactive"}</span>
    </button>
  );
}

function TriggerLabel({
  triggerEvent,
  scope,
  eventId
}: {
  triggerEvent: WorkflowTemplateListRow["trigger_event"];
  scope: WorkflowTemplateListRow["scope"];
  eventId: WorkflowTemplateListRow["event_id"];
}) {
  const triggerLabel = triggerEvent === "lead_captured" ? "Lead captured" : triggerEvent;
  const scopeLabel =
    scope === "event"
      ? eventId
        ? "this event"
        : "events"
      : scope === "continuous_capture"
      ? eventId
        ? "this event"
        : "continuous capture"
      : "any event";
  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-slate-800">{triggerLabel}</span>
      <span className="text-xs text-slate-500">Scope: {scopeLabel}</span>
    </div>
  );
}

function StepsSummary({ steps }: { steps: WorkflowTemplateListRow["steps"] }) {
  if (steps.length === 0) {
    return <span className="text-xs text-slate-400">No steps</span>;
  }
  const labels = steps.map((s) => stepTypeLabel(s.step_type));
  return (
    <div className="flex flex-col">
      <span className="text-sm text-slate-700">{labels.join(" → ")}</span>
      <span className="text-xs text-slate-500">
        {steps.length} step{steps.length === 1 ? "" : "s"}
        {steps.some((s) => s.requires_approval) ? " · review required" : ""}
      </span>
    </div>
  );
}

function stepTypeLabel(stepType: string): string {
  switch (stepType) {
    case "enrich_lead":
      return "Enrich";
    case "compose_campaign_draft":
      return "Compose draft";
    default:
      return stepType;
  }
}

function formatRelativeDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
