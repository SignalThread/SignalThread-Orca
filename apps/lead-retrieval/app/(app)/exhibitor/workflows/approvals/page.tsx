import { requireExhibitorScope } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { resolveWorkflowAuthoringEventContext } from "@/lib/exhibitor/workflows/workflow-authoring-event-context";
import {
  loadWorkflowActivityRecords,
  parseLeadWorkflowStatusFilter
} from "@/lib/exhibitor/workflows/workflow-lead-activity";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";
import { WorkflowActivityReviewView } from "@/components/exhibitor/workflows/workflows-list-view";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  eventId?: string | string[];
  scope?: string | string[];
  workflowStatus?: string | string[];
  leadId?: string | string[];
};

export default async function ExhibitorWorkflowApprovalsPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  if (!isWorkflowsEnabled()) {
    redirect("/exhibitor/dashboard");
  }

  const sessionUser = await requireExhibitorScope();
  const companyId = String(sessionUser.company_id ?? "").trim();

  if (!companyId) {
    return (
      <PageShell>
        <PageHeader title="Workflow approvals" subtitle="Your account is not assigned to a company yet." />
      </PageShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  const resolved = (await searchParams) ?? {};
  const urlEventRaw = Array.isArray(resolved.eventId) ? resolved.eventId[0] : resolved.eventId;
  const urlEventStr = String(urlEventRaw ?? "").trim();
  const scopeRaw = Array.isArray(resolved.scope) ? resolved.scope[0] : resolved.scope;
  const workflowStatusRaw = Array.isArray(resolved.workflowStatus)
    ? resolved.workflowStatus[0]
    : resolved.workflowStatus;
  const leadIdRaw = Array.isArray(resolved.leadId) ? resolved.leadId[0] : resolved.leadId;
  const workflowStatus =
    String(workflowStatusRaw ?? "").trim().toLowerCase() === "all"
      ? null
      : parseLeadWorkflowStatusFilter(workflowStatusRaw) ?? "pending_approval";
  const leadId = String(leadIdRaw ?? "").trim() || null;

  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  const eventContext =
    access.eventIds.length > 0
      ? await resolveWorkflowAuthoringEventContext({
          userId: sessionUser.id,
          urlEventId: urlEventStr.length > 0 ? urlEventStr : null,
          scope: scopeRaw
        })
      : { eventId: null, scopeMode: "event" as const };
  const activeEventId = eventContext.eventId;

  const records = await loadWorkflowActivityRecords({
    supabase,
    companyId,
    eventId: activeEventId,
    leadId,
    status: workflowStatus,
    limit: 100
  });

  const navigationSearchSuffix =
    activeEventId
      ? `?eventId=${encodeURIComponent(activeEventId)}`
      : eventContext.scopeMode === "company"
        ? "?scope=company"
        : "";

  return (
    <WorkflowActivityReviewView
      records={records}
      activityFilter={{ workflowStatus, leadId }}
      navigationSearchSuffix={navigationSearchSuffix}
    />
  );
}
