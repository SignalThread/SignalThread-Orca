import Link from "next/link";
import { redirect } from "next/navigation";
import { buildExhibitorLeadsIntelligenceHref } from "@/lib/leads/exhibitorLeadsDrilldown";
import { hasActivePlatformAdminAccountContext, requireExhibitorScope } from "@/lib/auth/session";
import { isExhibitorAdminRole } from "@/lib/auth/role-scope";
import { isExhibitorEventLevelTenantUiResolution } from "@/lib/access/event-access-mode";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildEventQuickActions,
  deriveEventIdentity
} from "@/lib/exhibitor/event-command-center";
import {
  describeEventTiming,
  resolveEventLifecycle,
  type EventWorkspaceLifecycle
} from "@/lib/events/event-lifecycle";
import { getEventCalendarDay } from "@/lib/events/event-calendar";
import { deriveEventReadiness } from "@/lib/events/event-workspace-readiness-core";
import { deriveLiveWorkspace } from "@/lib/events/event-workspace-live-core";
import { deriveCompletedWorkspace } from "@/lib/events/event-workspace-completed-core";
import {
  loadEventWorkspaceEventRow,
  loadEventWorkspaceReadinessData
} from "@/lib/server/event-workspace-data";
import { loadEventWorkspaceLiveData } from "@/lib/server/event-workspace-live-data";
import { loadEventWorkspaceCompletedData } from "@/lib/server/event-workspace-completed-data";
import { isWorkflowsEnabled } from "@/lib/workflows/is-workflows-enabled";
import {
  getCachedExhibitorAccessibleEventResolution,
  getCachedExhibitorAccessibleEventSummaries
} from "@/lib/server/exhibitor-app-access";
import { exhibitorShouldPromptEventChoice } from "@/lib/server/exhibitor-event-choice";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { isContinuousCaptureContainerKind } from "@/lib/events/event-container-kind";
import { NoActiveEventEntry } from "@/components/app/no-active-event-entry";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { EventWorkspaceShell } from "./event-workspace-shell";
import { UpcomingEventReadinessBody } from "./upcoming-state";
import { LiveEventBody } from "./live-state";
import { CompletedEventBody } from "./completed-state";

/**
 * Canonical Event Workspace — the single event home at /exhibitor/dashboard.
 *
 * Opening a selected event authenticates, resolves company + event access,
 * resolves the event's real lifecycle (lib/events/event-lifecycle.ts), and
 * renders the matching workspace state on this same route:
 *
 *   Upcoming  → Event Readiness
 *   Live      → Live Event Workspace
 *   Completed → Post-Event Workspace
 *
 * There is no generic dashboard before the lifecycle state, no lifecycle
 * selector, and no deeper intelligence-dashboard navigation.
 */

type SearchParams = {
  eventId?: string | string[];
};

export default async function ExhibitorDashboardPage({
  searchParams
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sessionUser = await requireExhibitorScope();
  const sessionCompanyId = String(sessionUser.company_id ?? "").trim();
  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  const hasWeb = platformAdminAccountContextActive ||
    (sessionCompanyId.length > 0
      ? await getUserHasExhibitorWebAdminAccess(sessionUser.id, sessionCompanyId)
      : false);
  const resolvedSearchParams = (await searchParams) ?? {};

  const companyId = sessionUser.company_id ?? null;
  const now = new Date();
  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  const allowsManagementSurfaces = exhibitorAdminMayUseAppEventManagementRoutes({
    role: access.role,
    resolution: access.resolution
  });
  // First-event portfolio admins have no event_users row yet, so their web
  // access is proven by the same server-side resolver that enables /app/events.
  const canManage =
    ((isExhibitorAdminRole(sessionUser.role) || platformAdminAccountContextActive) && hasWeb) ||
    allowsManagementSurfaces;
  const { events: accessibleEventSummaries } = await getCachedExhibitorAccessibleEventSummaries(
    sessionUser.id
  );
  const requestedRaw = Array.isArray(resolvedSearchParams.eventId)
    ? resolvedSearchParams.eventId[0]
    : resolvedSearchParams.eventId;
  const requestedNorm = String(requestedRaw ?? "").trim();
  const createEventHref =
    canManage &&
    (access.role === "exhibitor_admin" || access.role === "platform_admin") &&
    exhibitorAdminMayUseAppEventManagementRoutes({ role: access.role, resolution: access.resolution })
      ? "/app/events/new"
      : null;

  if (!companyId) {
    return (
      <PageShell>
        <PageHeader title="Dashboard" subtitle="Your account is not assigned to a company yet." />
      </PageShell>
    );
  }

  if (access.eventIds.length === 0) {
    return (
      <NoActiveEventEntry
        mode="empty"
        createEventHref={createEventHref}
        events={[]}
        buildOpenHref={(id) => `/exhibitor/dashboard?eventId=${encodeURIComponent(id)}`}
        variant="exhibitor-onboarding"
      />
    );
  }

  if (
    access.eventIds.length > 0 &&
    (await exhibitorShouldPromptEventChoice({
      accessibleEventIds: access.eventIds,
      urlEventId: requestedNorm.length > 0 ? requestedNorm : null
    }))
  ) {
    return (
      <NoActiveEventEntry
        mode="choose"
        createEventHref={createEventHref}
        events={accessibleEventSummaries.map((e) => ({
          id: e.id,
          name: e.name,
          subtitle: isContinuousCaptureContainerKind(e.container_kind) ? "Continuous capture" : undefined
        }))}
        buildOpenHref={(id) => `/exhibitor/dashboard?eventId=${encodeURIComponent(id)}`}
      />
    );
  }

  const resolvedEventId = await resolveExhibitorAppActiveEventId(
    sessionUser.id,
    requestedNorm.length > 0 ? requestedNorm : null
  );

  if (!resolvedEventId) {
    return (
      <PageShell>
        <PageHeader title="Dashboard" />
        <div className="rounded-2xl border bg-card p-4 text-sm text-rose-600">
          Could not resolve an active event. Open the app from the event menu in the top bar, or pick an
          event from your dashboard.
        </div>
      </PageShell>
    );
  }

  if (requestedNorm.length > 0 && !access.eventIds.includes(requestedNorm)) {
    redirect(`/exhibitor/dashboard?eventId=${encodeURIComponent(resolvedEventId)}`);
  }

  const eventId: string = resolvedEventId;
  const activeEventSummary = accessibleEventSummaries.find((e) => e.id === eventId) ?? null;

  const eventLevelTenantUi = isExhibitorEventLevelTenantUiResolution(access.resolution);

  // Canonical events row (identity + lifecycle + readiness). Failure
  // degrades the header and falls back to the compatibility body.
  const eventRow = await loadEventWorkspaceEventRow(eventId);
  const today = getEventCalendarDay(now, eventRow?.timezone);
  const todayYmd = today?.ymd ?? null;

  const identity = deriveEventIdentity({
    fallbackName: activeEventSummary?.name ?? "Event",
    fallbackContainerKind: activeEventSummary?.container_kind ?? null,
    row: eventRow,
    todayYmd
  });
  const quickActions = buildEventQuickActions({
    eventId,
    canManage,
    allowsAppEventsManagementSurfaces: allowsManagementSurfaces,
    eventLevelTenantUi
  });

  const lifecycle: EventWorkspaceLifecycle | null = eventRow && todayYmd
    ? resolveEventLifecycle(eventRow, todayYmd).state
    : null;
  const timingText = eventRow && lifecycle && todayYmd ? describeEventTiming(eventRow, todayYmd, lifecycle) : null;
  const backHref = allowsManagementSurfaces ? "/app/events" : null;

  const settingsAction = quickActions.find((action) => action.key === "settings") ?? null;

  if (eventRow && !today) {
    return (
      <EventWorkspaceShell identity={identity} timingText={null} backHref={backHref}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          Event calendar metrics are unavailable until a valid event timezone is configured.
          {settingsAction ? <Link href={settingsAction.href} className="ml-1 font-semibold underline">Open event settings</Link> : null}
        </div>
      </EventWorkspaceShell>
    );
  }

  /* ---------------- Upcoming → Event Readiness (full state) ---------------- */

  if (lifecycle === "upcoming") {
    const readinessData = await loadEventWorkspaceReadinessData({ companyId, eventId });
    const readiness = deriveEventReadiness({
      event: eventRow,
      teamMembers: readinessData.teamMembers,
      pendingInviteCount: readinessData.pendingInviteCount,
      licenses: readinessData.licenses,
      leadCount: readinessData.leadCount,
      briefingCounts: readinessData.briefingCounts,
      knowledgeItemCount: readinessData.knowledgeItemCount,
      hrefs: {
        settings: settingsAction?.href ?? null,
        team: "/exhibitor/users",
        strategy: "/exhibitor/briefings/setup",
        importWizard: "/exhibitor/import/wizard"
      },
      canManage
    });

    return (
      <EventWorkspaceShell
        identity={identity}
        timingText={timingText}
        backHref={backHref}
        actions={
          canManage && settingsAction ? (
            <Link
              href={settingsAction.href}
              className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              Event settings
            </Link>
          ) : null
        }
      >
        <UpcomingEventReadinessBody readiness={readiness} canManage={canManage} />
      </EventWorkspaceShell>
    );
  }

  /* ---------------- Live → Live Event Workspace (full state) ---------------- */

  if (lifecycle === "live") {
    const hotLeadsHref = buildExhibitorLeadsIntelligenceHref({ eventId, temperature: "hot", followUp: "awaiting" });
    const followUpQueueHref = buildExhibitorLeadsIntelligenceHref({ eventId, followUp: "due" });
    const liveData = await loadEventWorkspaceLiveData({ companyId, eventId, today: today! });
    const live = deriveLiveWorkspace({
      conversations: liveData.conversations,
      totalConversationCount: liveData.totalConversationCount,
      conversationsTodayCount: liveData.conversationsTodayCount,
      leadsTodayCount: liveData.leadsTodayCount,
      hotNeedingFollowUpCount: liveData.hotNeedingFollowUpCount,
      followUpsDueCount: liveData.followUpsDueCount,
      followUpsDueTodayCount: liveData.followUpsDueTodayCount,
      followUpsOverdueCount: liveData.followUpsOverdueCount,
      briefingCounts: liveData.briefingCounts,
      todayYmd: todayYmd!,
      hrefs: {
        hotLeads: hotLeadsHref,
        followUpsDue: followUpQueueHref,
        leads: buildExhibitorLeadsIntelligenceHref({ eventId })
      }
    });

    return (
      <EventWorkspaceShell
        identity={identity}
        timingText={timingText}
        backHref={backHref}
      >
        <LiveEventBody live={live} eventId={eventId} followUpQueueHref={followUpQueueHref} />
      </EventWorkspaceShell>
    );
  }

  /* ------------- Completed → Post-Event Workspace (full state) ------------- */

  if (lifecycle === "completed") {
    const hotLeadsHref = buildExhibitorLeadsIntelligenceHref({ eventId, view: "hot" });
    const hotNoFollowUpHref = buildExhibitorLeadsIntelligenceHref({ eventId, temperature: "hot", followUp: "none" });
    const campaignsHref = canManage ? "/exhibitor/campaigns" : null;
    const draftsReviewHref =
      canManage && isWorkflowsEnabled()
        ? `/exhibitor/workflows/approvals?eventId=${encodeURIComponent(eventId)}`
        : null;
    const completedData = await loadEventWorkspaceCompletedData({ companyId, eventId, todayYmd: todayYmd!, now });
    const completed = deriveCompletedWorkspace({
      conversations: completedData.conversations,
      totalConversationCount: completedData.totalConversationCount,
      totalLeadCount: completedData.totalLeadCount,
      hotLeadCount: completedData.hotLeadCount,
      warmLeadCount: completedData.warmLeadCount,
      coldLeadCount: completedData.coldLeadCount,
      hotNoFollowUpCount: completedData.hotNoFollowUpCount,
      openFollowUpCount: completedData.openFollowUpCount,
      dueTodayFollowUpCount: completedData.dueTodayFollowUpCount,
      overdueFollowUpCount: completedData.overdueFollowUpCount,
      scheduledFollowUpCount: completedData.scheduledFollowUpCount,
      stillNewCount: completedData.stillNewCount,
      briefingCounts: completedData.briefingCounts,
      draftsPendingCount: completedData.draftsPendingCount,
      hrefs: {
        hotLeads: hotLeadsHref,
        hotNoFollowUp: hotNoFollowUpHref,
        followUpsDue: buildExhibitorLeadsIntelligenceHref({ eventId, followUp: "open" }),
        leads: buildExhibitorLeadsIntelligenceHref({ eventId }),
        campaigns: campaignsHref,
        draftsReview: draftsReviewHref
      }
    });

    return (
      <EventWorkspaceShell
        identity={identity}
        timingText={timingText}
        backHref={backHref}
        actions={
          campaignsHref ? (
            <Link
              href={campaignsHref}
              className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              Launch follow-up campaign
            </Link>
          ) : null
        }
      >
        <CompletedEventBody completed={completed} eventId={eventId} />
      </EventWorkspaceShell>
    );
  }

  /* ------------- Event details unavailable → honest degraded state ------------- */
  // Reaching here means the events row failed to load, so no lifecycle could
  // be resolved. Say so — never guess a state or invent data.

  return (
    <EventWorkspaceShell
      identity={identity}
      timingText={timingText}
      backHref={backHref}
      actions={
        <Link
          href={buildExhibitorLeadsIntelligenceHref({ eventId })}
          className="inline-flex h-10 w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 active:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          Open Leads Intelligence
        </Link>
      }
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Event details could not be loaded, so the workspace state can't be resolved right now. Refresh to
        try again — your leads remain available in Leads Intelligence.
      </div>
    </EventWorkspaceShell>
  );
}
