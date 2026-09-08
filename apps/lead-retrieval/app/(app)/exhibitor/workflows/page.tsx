import { hasActivePlatformAdminAccountContext, normalizeSessionRole, requireExhibitorScope } from "@/lib/auth/session";
import { isExhibitorAdminRole } from "@/lib/auth/role-scope";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { resolveWorkflowAuthoringEventContext } from "@/lib/exhibitor/workflows/workflow-authoring-event-context";
import { loadWorkflowTemplatesForList } from "@/lib/exhibitor/workflows/load-workflow-templates";
import { loadPendingWorkflowApprovalCount } from "@/lib/exhibitor/workflows/workflow-lead-activity";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";
import { WorkflowsListView } from "@/components/exhibitor/workflows/workflows-list-view";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = {
  eventId?: string | string[];
  scope?: string | string[];
};

/**
 * Workflows list page (Phase 5 UI shell).
 *
 * Server-rendered list of `workflow_templates` scoped to the caller's company. When an
 * active event is resolved (via existing cookie-or-url plumbing), the list is
 * additionally filtered to templates that are either unpinned (`event_id IS NULL`) or
 * pinned to that event id — matching the same filter the trigger resolver uses at run
 * time, so the UI reflects what would actually fire for the chosen container.
 *
 * Authorization is enforced by `requireExhibitorScope` plus the RLS policies installed
 * in migration 0071 (`workflow_templates_select_scope`, `workflow_steps_select_scope`).
 * Create/edit flows use admin-backed API routes; this page only reads via the server client.
 */
export default async function ExhibitorWorkflowsPage({
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
    // Mirror the dashboard's company-less rendering rather than redirecting; the
    // session+role guards above already kept this to authenticated exhibitor users.
    return (
      <PageShell>
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              <span>Workflows</span>
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.12em] text-indigo-700">
                Beta
              </span>
            </span>
          }
          subtitle="Your account is not assigned to a company yet."
        />
      </PageShell>
    );
  }

  const supabase = await createSupabaseServerClient();

  const resolved = (await searchParams) ?? {};
  const urlEventRaw = Array.isArray(resolved.eventId) ? resolved.eventId[0] : resolved.eventId;
  const urlEventStr = String(urlEventRaw ?? "").trim();
  const scopeRaw = Array.isArray(resolved.scope) ? resolved.scope[0] : resolved.scope;

  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);

  // Resolve the active event id when the user has at least one accessible event. We do
  // NOT force "choose an event" gating here: workflows can be company-wide and should
  // remain visible without an event context. If no event resolves, we just don't apply
  // the event-pin filter and show all company-scoped templates.
  const eventContext =
    access.eventIds.length > 0
      ? await resolveWorkflowAuthoringEventContext({
          userId: sessionUser.id,
          urlEventId: urlEventStr.length > 0 ? urlEventStr : null,
          scope: scopeRaw
        })
      : { eventId: null, scopeMode: "event" as const };
  const activeEventId = eventContext.eventId;

  const workflows = await loadWorkflowTemplatesForList(supabase, {
    companyId,
    activeEventId
  });
  const pendingApprovalCount = await loadPendingWorkflowApprovalCount({
    supabase,
    companyId,
    eventId: activeEventId
  });

  const normalizedRole = normalizeSessionRole(sessionUser.role);
  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  const canCreateWorkflows =
    (isExhibitorAdminRole(normalizedRole) || platformAdminAccountContextActive) &&
    companyId.length > 0 &&
    (platformAdminAccountContextActive ||
      (await getUserHasExhibitorWebAdminAccess(sessionUser.id, companyId)));

  const createWorkflowHref = canCreateWorkflows
    ? activeEventId
      ? `/exhibitor/workflows/new?eventId=${encodeURIComponent(activeEventId)}`
      : eventContext.scopeMode === "company"
        ? "/exhibitor/workflows/new?scope=company"
        : "/exhibitor/workflows/new"
    : null;

  const navigationSearchSuffix =
    activeEventId
      ? `?eventId=${encodeURIComponent(activeEventId)}`
      : eventContext.scopeMode === "company"
        ? "?scope=company"
        : "";
  const approvalsSearchParams = new URLSearchParams(
    navigationSearchSuffix.startsWith("?") ? navigationSearchSuffix.slice(1) : navigationSearchSuffix
  );
  approvalsSearchParams.set("workflowStatus", "pending_approval");
  const approvalsQuery = approvalsSearchParams.toString();
  const approvalsHref = approvalsQuery
    ? `/exhibitor/workflows/approvals?${approvalsQuery}`
    : "/exhibitor/workflows/approvals";

  return (
    <WorkflowsListView
      workflows={workflows}
      pendingApprovalCount={pendingApprovalCount}
      approvalsHref={approvalsHref}
      createWorkflowHref={createWorkflowHref}
      navigationSearchSuffix={navigationSearchSuffix}
    />
  );
}
