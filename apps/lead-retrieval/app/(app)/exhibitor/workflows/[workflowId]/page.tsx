import Link from "next/link";
import { notFound } from "next/navigation";
import { requireExhibitorScope } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import {
  isLikelyWorkflowId,
  loadWorkflowDetailPage,
  parseWorkflowDetailRunFilter
} from "@/lib/exhibitor/workflows/load-workflow-detail";
import { loadWorkflowBuilderCrmBundle } from "@/lib/exhibitor/workflows/load-workflow-builder-crm";
import { loadWorkflowBuilderEnrichmentBundle } from "@/lib/exhibitor/workflows/load-workflow-builder-enrichment";
import { loadWorkflowBuilderSignalsForUser } from "@/lib/exhibitor/workflows/load-workflow-builder-signals";
import { workflowBuilderInitialStateFromDetail } from "@/lib/exhibitor/workflows/workflow-builder-state";
import { resolveWorkflowAuthoringEventContext } from "@/lib/exhibitor/workflows/workflow-authoring-event-context";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";
import { WorkflowDetailView } from "@/components/exhibitor/workflows/workflow-detail-view";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  eventId?: string | string[];
  runId?: string | string[];
  runStatus?: string | string[];
  runCursor?: string | string[];
  approvalId?: string | string[];
  scope?: string | string[];
};

/**
 * Workflow detail — template metadata, recent runs, step runs + drafts for the selected run.
 * Read-only data loads via RLS-scoped server client; draft approve/reject uses existing APIs.
 */
export default async function ExhibitorWorkflowDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ workflowId: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  if (!isWorkflowsEnabled()) {
    redirect("/exhibitor/dashboard");
  }

  const sessionUser = await requireExhibitorScope();
  const companyId = String(sessionUser.company_id ?? "").trim();

  const { workflowId: rawId } = await params;
  const workflowId = String(rawId ?? "").trim();

  const resolved = (await searchParams) ?? {};
  const urlEventRaw = Array.isArray(resolved.eventId) ? resolved.eventId[0] : resolved.eventId;
  const urlEventStr = String(urlEventRaw ?? "").trim();
  const scopeRaw = Array.isArray(resolved.scope) ? resolved.scope[0] : resolved.scope;
  const runIdRaw = Array.isArray(resolved.runId) ? resolved.runId[0] : resolved.runId;
  const preferredRunId = String(runIdRaw ?? "").trim() || null;
  const runStatusRaw = Array.isArray(resolved.runStatus) ? resolved.runStatus[0] : resolved.runStatus;
  const runCursorRaw = Array.isArray(resolved.runCursor) ? resolved.runCursor[0] : resolved.runCursor;
  const approvalIdRaw = Array.isArray(resolved.approvalId) ? resolved.approvalId[0] : resolved.approvalId;
  const runFilter = parseWorkflowDetailRunFilter(runStatusRaw);
  const runCursor = String(runCursorRaw ?? "").trim() || null;
  const preferredApprovalId = String(approvalIdRaw ?? "").trim() || null;

  if (!companyId) {
    return (
      <section className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 md:px-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Workflow</h1>
          <p className="mt-1 text-slate-600">Your account is not assigned to a company yet.</p>
        </header>
      </section>
    );
  }

  if (!isLikelyWorkflowId(workflowId)) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const detail = await loadWorkflowDetailPage({
    supabase,
    workflowId,
    preferredRunId,
    runFilter,
    runCursor,
    preferredApprovalId
  });

  if (!detail.template) {
    notFound();
  }

  const canManageWorkflow =
    sessionUser.role === "exhibitor_admin" &&
    (await getUserHasExhibitorWebAdminAccess(sessionUser.id, companyId));

  const eventContext = await resolveWorkflowAuthoringEventContext({
    userId: sessionUser.id,
    urlEventId: urlEventStr.length > 0 ? urlEventStr : null,
    scope: scopeRaw
  });
  const eventIdForNav = detail.template.event_id || eventContext.eventId;
  const eventIdForSignalInventory = detail.template.event_id || null;

  const [signals, enrichment, crm] = canManageWorkflow
    ? await Promise.all([
        loadWorkflowBuilderSignalsForUser(sessionUser, { eventId: eventIdForSignalInventory }),
        loadWorkflowBuilderEnrichmentBundle(companyId),
        loadWorkflowBuilderCrmBundle(companyId)
      ])
    : [
        [],
        { providers: [], workspaceDefaultAdapterKey: null },
        { providers: [] }
      ];

  const listHref =
    eventIdForNav
      ? `/exhibitor/workflows?eventId=${encodeURIComponent(eventIdForNav)}`
      : "/exhibitor/workflows";

  return (
    <div className="mx-auto w-full px-4 py-8 md:px-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={listHref}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Workflows
          </Link>
        </div>
        <WorkflowDetailView
          workflowId={workflowId}
          template={detail.template}
          steps={detail.steps}
          composeSignals={detail.composeSignals}
          runs={detail.runs}
          runFilter={detail.runFilter}
          runPagination={detail.runPagination}
          leads={detail.leads}
          selectedRunId={detail.selectedRunId}
          stepRuns={detail.stepRuns}
          drafts={detail.drafts}
          pendingApprovals={detail.pendingApprovals}
          selectedApprovalId={detail.selectedApprovalId}
          eventIdForNav={eventIdForNav}
          eventIdForBuilder={eventIdForSignalInventory}
          canManageWorkflow={canManageWorkflow}
          builderInitialState={
            canManageWorkflow
              ? workflowBuilderInitialStateFromDetail({
                  template: detail.template,
                  steps: detail.steps
                })
              : null
          }
          signals={signals}
          enrichmentProviders={enrichment.providers}
          workspaceDefaultAdapterKey={enrichment.workspaceDefaultAdapterKey}
          crmProviders={crm.providers}
        />
      </div>
    </div>
  );
}
