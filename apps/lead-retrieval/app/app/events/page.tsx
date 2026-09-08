import { redirect } from "next/navigation";
import { hasActivePlatformAdminAccountContext, requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCachedExhibitorAccessibleEventResolution } from "@/lib/server/exhibitor-app-access";
import { redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked } from "@/lib/server/exhibitor-app-events-management-redirect";
import { NoActiveEventEntry } from "@/components/app/no-active-event-entry";
import { EXHIBITOR_EVENTS_CREATE_HREF } from "@/lib/exhibitor/exhibitor-app-nav";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { exhibitorOpenEventHref, groupEventsForPortfolio } from "@/lib/events/event-portfolio";
import { resolveEventLifecycle } from "@/lib/events/event-lifecycle";
import { getEventCalendarDay } from "@/lib/events/event-calendar";
import { loadDashboardEventLeadMetrics } from "@/lib/server/dashboard-event-lead-metrics";
import { deriveEventReadiness, deriveEventReadinessPercent } from "@/lib/events/event-workspace-readiness-core";
import { loadEventWorkspaceReadinessData } from "@/lib/server/event-workspace-data";
import {
  buildRecommendedNextSteps,
  computeAccountKpis,
  deriveAccountFollowUpStatus,
  deriveLifecycleEventCards,
  deriveAccountSetupItems,
  deriveLeadThemes,
  deriveRecentActivity,
  PORTFOLIO_THEME_SAMPLE_LIMIT,
  selectWhatMattersNow,
  summarizeTeamReadiness,
  type AccountLicenseRow,
  type AccountPendingInviteRow,
  type AccountUserRow,
  type ThemeLeadRow,
  type AccountEventsFilter
} from "@/lib/events/account-command-center-core";
import { AccountCommandCenterView, type PortfolioEventRow } from "./portfolio-view";

export const dynamic = "force-dynamic";

/** Company-scoped secondary query; failure degrades its section to null, never zeros. */
async function tryRows<T>(query: PromiseLike<{ data: T[] | null; error: unknown | null }>): Promise<T[] | null> {
  try {
    const { data, error } = await query;
    if (error) return null;
    return data ?? [];
  } catch {
    return null;
  }
}

type EventsSearchParams = {
  view?: string | string[];
  lifecycle?: string | string[];
  q?: string | string[];
};

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ExhibitorEventsIndexPage({
  searchParams
}: {
  searchParams?: Promise<EventsSearchParams>;
}) {
  const sessionUser = await requireAuth();
  const resolvedSearchParams = (await searchParams) ?? {};
  const lifecycleInput = firstSearchValue(resolvedSearchParams.lifecycle);
  const allEventsLifecycle: AccountEventsFilter = ["all", "live", "upcoming", "wrapped"].includes(lifecycleInput)
    ? lifecycleInput as AccountEventsFilter
    : "all";
  const allEventsView = firstSearchValue(resolvedSearchParams.view) === "all"
    ? { lifecycle: allEventsLifecycle, search: firstSearchValue(resolvedSearchParams.q).slice(0, 120) }
    : null;

  if (
    sessionUser.role !== "exhibitor_admin" &&
    !hasActivePlatformAdminAccountContext(sessionUser)
  ) {
    if (sessionUser.role === "platform_admin") redirect("/admin/events");
    if (sessionUser.role === "organizer_admin") redirect("/app/organizer");
    redirect("/app");
  }

  await redirectExhibitorAdminFromAppEventsManagementRoutesIfBlocked(sessionUser);

  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  const createEventHref = exhibitorAdminMayUseAppEventManagementRoutes({
    role: access.role,
    resolution: access.resolution
  })
    ? EXHIBITOR_EVENTS_CREATE_HREF
    : null;

  if (access.eventIds.length === 0) {
    return (
      <section className="mx-auto w-full max-w-[920px] space-y-4 pb-12">
        <NoActiveEventEntry
          mode="empty"
          createEventHref={createEventHref}
          events={[]}
          buildOpenHref={(id) => exhibitorOpenEventHref(id)}
          variant="exhibitor-onboarding"
        />
      </section>
    );
  }

  const supabase = createAdminClient();
  const companyId = String(access.companyId ?? "").trim();
  const hasCompany = companyId.length > 0;
  const now = new Date();
  const todayYmd = now.toISOString().slice(0, 10); // ordering fallback only; configured events use todayByEvent.

  const [
    eventsResult,
    companyResult,
    licenses,
    pendingInvites,
    users,
    portfolioLeads
  ] =
    await Promise.all([
      (supabase as any)
        .from("events")
        .select("id, name, start_date, end_date, status, container_kind, city, state, location, timezone, created_at, briefing_strategy")
        .in("id", access.eventIds) as Promise<{
        data: PortfolioEventRow[] | null;
        error: { message: string } | null;
      }>,
      hasCompany
        ? ((supabase as any)
            .from("companies")
            .select("name")
            .eq("id", companyId)
            .maybeSingle() as Promise<{ data: { name: string | null } | null }>)
        : Promise.resolve({ data: null }),
      hasCompany
        ? tryRows<AccountLicenseRow>(
            (supabase as any)
              .from("licenses")
              .select("id, seats_total, seats_used")
              .eq("exhibitor_company_id", companyId)
              .eq("status", "active")
          )
        : Promise.resolve(null),
      hasCompany
        ? tryRows<AccountPendingInviteRow>(
            (supabase as any)
              .from("invite_codes")
              .select("email, created_at")
              .eq("exhibitor_company_id", companyId)
              .is("used_at", null)
          )
        : Promise.resolve(null),
      hasCompany
        ? tryRows<AccountUserRow>(
            (supabase as any)
              .from("users")
              .select("id, full_name, email, created_at")
              .eq("company_id", companyId)
          )
        : Promise.resolve(null),
      hasCompany
        ? tryRows<ThemeLeadRow & { id: string; created_at: string | null }>(
            (supabase as any)
              .from("leads")
              .select(
                "id, event_id, created_at, company_text, job_title, enriched_job_title, industry, enriched_industry, seniority, enriched_seniority, intent_signals"
              )
              .eq("company_id", companyId)
              .in("event_id", access.eventIds)
              .order("created_at", { ascending: false })
              // Bounded sample: themes and the activity feed both derive from
              // at most this many of the newest accessible-event leads.
              .limit(PORTFOLIO_THEME_SAMPLE_LIMIT)
          )
        : Promise.resolve(null)
    ]);

  if (eventsResult.error) {
    return (
      <section className="mx-auto max-w-[920px] space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Command Center</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Failed to load your events. Please refresh, or try again shortly.
        </div>
      </section>
    );
  }

  const byId = new Map((eventsResult.data ?? []).map((row) => [row.id, row] as const));
  const events = access.eventIds
    .map((id) => byId.get(id))
    .filter((row): row is PortfolioEventRow => Boolean(row));
  const todayByEvent = new Map(
    events.flatMap((event) => {
      const day = getEventCalendarDay(now, event.timezone);
      return day ? [[event.id, day.ymd] as const] : [];
    })
  );
  const metricsByEvent = hasCompany
    ? await loadDashboardEventLeadMetrics({ companyId, eventIds: access.eventIds, now })
    : null;
  const metricRows = metricsByEvent ? access.eventIds.map((id) => metricsByEvent.get(id) ?? null) : null;
  const sumKnown = (read: (row: NonNullable<NonNullable<typeof metricRows>[number]>) => number | null): number | null => {
    if (!metricRows || metricRows.some((row) => row === null)) return null;
    const values = metricRows.map((row) => read(row!));
    if (values.some((value) => value === null)) return null;
    return values.reduce<number>((sum, value) => sum + Number(value), 0);
  };
  const dueToday = sumKnown((row) => row.dueToday);
  const overdue = sumKnown((row) => row.overdue);
  const outstandingFollowUps = dueToday === null || overdue === null ? null : dueToday + overdue;
  const hotAwaitingFollowUp = sumKnown((row) => row.hotAwaitingFollowUp);

  const setupItems = deriveAccountSetupItems({
    events,
    todayYmd,
    todayByEvent,
    pendingInviteCount: pendingInvites === null ? null : pendingInvites.length,
    licenses
  });
  const kpis = computeAccountKpis({ events, setupItems, licenses });
  const whatMattersNow = selectWhatMattersNow({
    groups: groupEventsForPortfolio(events, todayYmd, todayByEvent),
    setupItems,
    todayYmd,
    todayByEvent,
    createEventHref
  });
  const recommendedSteps = buildRecommendedNextSteps(setupItems);
  const teamReadiness = summarizeTeamReadiness({ users, pendingInvites, licenses });
  const themes = deriveLeadThemes(portfolioLeads);
  // Upcoming lane readiness uses the exact checklist derivation from the
  // individual Event Workspace. It is intentionally unavailable when any
  // required source cannot be read rather than being guessed at account level.
  const readinessPairs = await Promise.all(
    events
      .filter((event) => todayByEvent.has(event.id) && resolveEventLifecycle(event, todayByEvent.get(event.id)!).state === "upcoming")
      .map(async (event) => {
        const readinessData = await loadEventWorkspaceReadinessData({ companyId, eventId: event.id });
        const readiness = deriveEventReadiness({
          event,
          ...readinessData,
          hrefs: {
            settings: `/app/events/${encodeURIComponent(event.id)}/settings`,
            team: "/exhibitor/users",
            strategy: "/exhibitor/briefings/setup",
            importWizard: "/exhibitor/import/wizard"
          },
          canManage: Boolean(createEventHref)
        });
        return [event.id, deriveEventReadinessPercent(readiness)] as const;
      })
  );
  const lifecycleEvents = deriveLifecycleEventCards({
    events,
    metricsByEvent,
    setupItems,
    todayYmd,
    todayByEvent,
    readinessByEvent: new Map(readinessPairs)
  });
  const followUpStatus = deriveAccountFollowUpStatus({
    outstanding: outstandingFollowUps,
    hotAwaitingFollowUp,
    dueToday,
    overdue
  });
  const activity = deriveRecentActivity({
    events,
    invites: pendingInvites,
    users,
    // Full bounded sample: captures aggregate per event/day in the core, so
    // group counts stay accurate within the sample.
    leads: portfolioLeads
  });

  return (
    <AccountCommandCenterView
      companyName={String(companyResult.data?.name ?? "")}
      createEventHref={createEventHref}
      events={events}
      lifecycleEvents={lifecycleEvents}
      todayYmd={todayYmd}
      setupItems={setupItems}
      kpis={kpis}
      whatMattersNow={whatMattersNow}
      themes={themes}
      recommendedSteps={recommendedSteps}
      teamReadiness={teamReadiness}
      activity={activity}
      followUpStatus={followUpStatus}
      allEventsView={allEventsView}
    />
  );
}
