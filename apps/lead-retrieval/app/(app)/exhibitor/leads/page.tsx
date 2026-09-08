import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ExhibitorLeadsContextNav } from "@/components/leads/exhibitor-leads-context-nav";
import { ExhibitorLeadsSearchForm } from "@/components/leads/exhibitor-leads-search-form";
import { ExhibitorLeadsTable } from "@/components/leads/exhibitor-leads-table";
import { ExhibitorAddLeadButton } from "@/components/leads/exhibitor-add-lead-button";
import { hasActivePlatformAdminAccountContext, requireExhibitorScope } from "@/lib/auth/session";
import { isExhibitorAdminRole } from "@/lib/auth/role-scope";
import { getUserHasExhibitorWebAdminAccess } from "@/lib/server/exhibitor-permission-aggregates";
import { getPipedriveConnectionStatus } from "@/lib/integrations/pipedrive/connection-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getCachedExhibitorAccessibleEventResolution,
  getCachedExhibitorAccessibleEventSummaries
} from "@/lib/server/exhibitor-app-access";
import { exhibitorShouldPromptEventChoice } from "@/lib/server/exhibitor-event-choice";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";
import { exhibitorAdminMayUseAppEventManagementRoutes } from "@/lib/exhibitor/exhibitor-event-management-access";
import { ExhibitorMultiEventBreadcrumb } from "@/components/layout/exhibitor-multi-event-breadcrumb";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { NoActiveEventEntry } from "@/components/app/no-active-event-entry";
import { exhibitorLeadBriefingJsonHasRenderableAiBrief } from "@/lib/leads/exhibitorLeadAiBriefRenderable";
import { parseLeadTemperature } from "@/lib/leads/temperature";
import {
  activeLeadFilterLabels,
  parseLeadListFilters,
  type LeadListFilters
} from "@/lib/leads/exhibitor-lead-list-filters";
import { getEventCalendarDay } from "@/lib/events/event-calendar";
import {
  applyCanonicalActionableFollowUpConstraints,
  buildEventFollowUpCalendarOr
} from "@/lib/leads/lead-business-rules";
import {
  emptyLeadWorkflowSummary,
  loadLeadIdsForWorkflowStatus,
  loadWorkflowSummariesForLeads,
  type LeadWorkflowSummary
} from "@/lib/exhibitor/workflows/workflow-lead-activity";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  company_text: string | null;
  temperature: "hot" | "warm" | "cold" | null;
  priority_score: number;
  rating: number;
  status: "new" | "follow_up" | "closed";
  follow_up_date: string | null;
  updated_at: string;
  created_at: string;
  /** Canonical: `lead_briefings` exists for this lead + company with renderable AI Brief sections (same rule as lead detail tab). */
  aiBriefRenderable: boolean;
  workflowSummary?: LeadWorkflowSummary;
};

const LEAD_BRIEFING_LOOKUP_CHUNK = 150;

function parseSearchQuery(value?: string) {
  const next = value?.trim();
  if (!next) {
    return null;
  }
  return next;
}

export default async function ExhibitorLeadsPage({
  searchParams
}: {
  searchParams?: Promise<{
    eventId?: string;
    q?: string;
    companyId?: string;
    view?: string;
    minPriority?: string;
    followUpDue?: string;
    /** Set by the import wizard when redirecting after a successful publish. */
    importSuccess?: string;
    importBatchId?: string;
    imported?: string;
    rating?: string;
    temperature?: string;
    followUp?: string;
    /** Existing Leads Intelligence route across the caller's accessible event portfolio. */
    accountScope?: string;
    workflowStatus?: string;
  }>;
}) {
  const sessionUser = await requireExhibitorScope();
  const sessionCompanyId = String(sessionUser.company_id ?? "").trim();
  const platformAdminAccountContextActive = hasActivePlatformAdminAccountContext(sessionUser);
  const hasWeb = platformAdminAccountContextActive ||
    (sessionCompanyId.length > 0
      ? await getUserHasExhibitorWebAdminAccess(sessionUser.id, sessionCompanyId)
      : false);
  const canEdit = (isExhibitorAdminRole(sessionUser.role) || platformAdminAccountContextActive) && hasWeb;
  const canDelete = sessionCompanyId.length > 0;
  const supabase = await createSupabaseServerClient();

  const resolvedParams = searchParams ? await searchParams : {};
  const requestedAccountScope = resolvedParams?.accountScope === "1";
  const searchQuery = parseSearchQuery(resolvedParams?.q);
  const filters = parseLeadListFilters({
    rating: resolvedParams?.rating,
    temperature: resolvedParams?.temperature,
    followUp: resolvedParams?.followUp,
    workflowStatus: resolvedParams?.workflowStatus
  });
  const access = await getCachedExhibitorAccessibleEventResolution(sessionUser.id);
  const showEventsPortfolioChrome =
    exhibitorAdminMayUseAppEventManagementRoutes({
      role: access.role,
      resolution: access.resolution
    }) && access.eventIds.length >= 2;
  const accountScope = requestedAccountScope && showEventsPortfolioChrome;
  const { events: accessibleEventSummaries } = await getCachedExhibitorAccessibleEventSummaries(
    sessionUser.id
  );
  const urlEventParam = resolvedParams?.eventId ?? null;
  const urlEventStr = typeof urlEventParam === "string" ? urlEventParam.trim() : "";

  if (
    !accountScope && access.eventIds.length > 0 &&
    (await exhibitorShouldPromptEventChoice({
      accessibleEventIds: access.eventIds,
      urlEventId: urlEventStr.length > 0 ? urlEventStr : null
    }))
  ) {
    return (
      <PageShell>
        <ExhibitorMultiEventBreadcrumb show={showEventsPortfolioChrome} />
        <NoActiveEventEntry
          mode="choose"
          createEventHref={null}
          events={accessibleEventSummaries.map((e) => ({
            id: e.id,
            name: e.name,
            subtitle:
              e.container_kind === "continuous_capture" ? "Continuous capture" : undefined
          }))}
          buildOpenHref={(id) => `/exhibitor/leads?eventId=${encodeURIComponent(id)}`}
        />
      </PageShell>
    );
  }

  const eventId = accountScope
    ? null
    : access.eventIds.length > 0
      ? await resolveExhibitorAppActiveEventId(sessionUser.id, urlEventParam)
      : null;

  const importSuccess = resolvedParams?.importSuccess === "1";
  const importedRaw = resolvedParams?.imported?.trim();
  const importedCount = importedRaw ? Number.parseInt(importedRaw, 10) : NaN;
  const showImportBanner = importSuccess && Number.isFinite(importedCount) && importedCount >= 0;

  const companyId = sessionUser.company_id ?? null;
  const requestedCompanyId = resolvedParams?.companyId ?? null;
  const scopedCompanyId = requestedCompanyId && requestedCompanyId === companyId ? requestedCompanyId : companyId;

  const rawViewParam = resolvedParams?.view?.trim() ?? null;
  const legacyTemperature = parseLeadTemperature(rawViewParam);
  const hasLegacyDrilldown = resolvedParams?.minPriority != null || resolvedParams?.followUpDue != null;
  if (hasLegacyDrilldown || rawViewParam !== null) {
    const params = new URLSearchParams();
    if (eventId) params.set("eventId", eventId);
    if (accountScope) params.set("accountScope", "1");
    if (scopedCompanyId) params.set("companyId", scopedCompanyId);
    if (searchQuery) params.set("q", searchQuery);
    if (resolvedParams?.rating) params.set("rating", resolvedParams.rating);
    if (resolvedParams?.followUp) params.set("followUp", resolvedParams.followUp);
    else if (resolvedParams?.followUpDue === "1" || rawViewParam === "follow_up_due") params.set("followUp", "due");
    else if (rawViewParam === "follow_up_scheduled") params.set("followUp", "open");
    if (resolvedParams?.workflowStatus) params.set("workflowStatus", resolvedParams.workflowStatus);
    if (resolvedParams?.temperature) params.set("temperature", resolvedParams.temperature);
    else if (legacyTemperature) params.set("temperature", legacyTemperature);
    const query = params.toString();
    redirect(query ? `/exhibitor/leads?${query}` : "/exhibitor/leads");
  }

  if (
    urlEventStr.length > 0 &&
    access.eventIds.length > 0 &&
    !access.eventIds.includes(urlEventStr) &&
    eventId
  ) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(resolvedParams)) {
      if (k === "eventId" || v === undefined) continue;
      if (Array.isArray(v)) {
        for (const item of v) p.append(k, String(item));
      } else {
        p.set(k, String(v));
      }
    }
    p.set("eventId", eventId);
    redirect(`/exhibitor/leads?${p.toString()}`);
  }

  return (
    <PageShell>
      <header className="space-y-4">
        <PageHeader
          topSlot={
            <div className="space-y-2">
              <ExhibitorMultiEventBreadcrumb show={showEventsPortfolioChrome} />
              <ExhibitorLeadsContextNav variant="list" eventId={eventId} />
            </div>
          }
          title="Leads Intelligence"
          subtitle="Filter and act on leads—open a row for full details, or edit rating, temperature, and follow-up inline."
          actions={
            canEdit && scopedCompanyId ? (
              <ExhibitorAddLeadButton eventId={eventId} companyId={scopedCompanyId} />
            ) : null
          }
        />

        {showImportBanner ? (
          <div
            className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50/95 to-white px-4 py-4 text-sm text-emerald-950 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            role="status"
          >
            <p className="font-semibold">
              {importedCount.toLocaleString()} lead{importedCount === 1 ? "" : "s"} imported successfully.
            </p>
            <p className="mt-1 text-emerald-900/95">
              Your leads are now available in Leads Intelligence. Use search and filters below to find them quickly.
            </p>
          </div>
        ) : null}
        <Suspense
          fallback={
            <div className="h-11 w-full max-w-xl rounded-xl border border-slate-200 bg-slate-50" />
          }
        >
          <ExhibitorLeadsSearchForm eventId={eventId} companyId={scopedCompanyId} accountScope={accountScope} />
        </Suspense>
      </header>

      {!scopedCompanyId ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-slate-600">
          Your account is not assigned to a company yet.
        </div>
      ) : (
        <LeadsTable
          companyId={scopedCompanyId}
          eventId={eventId}
          accessibleEventIds={access.eventIds}
          searchQuery={searchQuery}
          filters={filters}
          canEdit={canEdit}
          canDelete={canDelete}
        />
      )}
    </PageShell>
  );
}

async function LeadsTable({
  companyId,
  eventId,
  accessibleEventIds,
  searchQuery,
  filters,
  canEdit,
  canDelete
}: {
  companyId: string;
  eventId: string | null;
  accessibleEventIds: readonly string[];
  searchQuery: string | null;
  filters: LeadListFilters;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const workflowFilteredLeadIds = filters.workflowStatus
    ? await loadLeadIdsForWorkflowStatus({
        supabase,
        companyId,
        eventId,
        status: filters.workflowStatus
      })
    : null;
  const pipedriveConnected = await getPipedriveConnectionStatus(companyId)
    .then((status) => status.connected)
    .catch(() => false);

  if (workflowFilteredLeadIds && workflowFilteredLeadIds.length === 0) {
    return (
      <ExhibitorLeadsTable
        leads={[]}
        eventId={eventId}
        searchQuery={searchQuery}
        filters={filters}
        activeFilterSummary={activeLeadFilterLabels(filters)}
        canEdit={canEdit}
        canDelete={canDelete}
        pipedriveConnected={pipedriveConnected}
      />
    );
  }

  let query = supabase
    .from("leads")
    .select(
      "id, full_name, email, job_title, company_text, temperature, priority_score, rating, status, follow_up_date, follow_up_at, follow_up_completed_at, updated_at, created_at"
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (eventId) {
    query = query.eq("event_id", eventId);
  } else if (accessibleEventIds.length > 0) {
    query = query.in("event_id", accessibleEventIds);
  } else {
    // No active event means there are no event-scoped leads to expose.
    query = query.in("event_id", []);
  }

  if (workflowFilteredLeadIds) {
    query = query.in("id", workflowFilteredLeadIds);
  }

  if (filters.rating === "5") {
    query = query.eq("rating", 5);
  } else if (filters.rating === "4_plus") {
    query = query.gte("rating", 4);
  } else if (filters.rating === "3_or_below") {
    query = query.lte("rating", 3).gt("rating", 0);
  } else if (filters.rating === "unrated") {
    query = query.eq("rating", 0);
  }

  if (filters.temperature) {
    query = query.eq("temperature", filters.temperature);
  }

  if (filters.followUp) {
    query = applyCanonicalActionableFollowUpConstraints(query);
    if (filters.followUp === "open") {
      query = query.or("follow_up_date.not.is.null,follow_up_at.not.is.null");
    } else if (filters.followUp === "none") {
      query = query.is("follow_up_date", null).is("follow_up_at", null);
    } else {
      const targetEventIds = eventId ? [eventId] : [...accessibleEventIds];
      const { data: timezoneRows } = await supabase
        .from("events")
        .select("id, timezone")
        .in("id", targetEventIds);
      const now = new Date();
      const eventDays = new Map(
        (timezoneRows ?? []).flatMap((row: any) => {
          const day = getEventCalendarDay(now, row.timezone);
          return day ? [[String(row.id), day.ymd] as const] : [];
        })
      );
      if (eventDays.size !== targetEventIds.length) {
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            Follow-up filters are unavailable until every event in this view has a valid timezone.
          </div>
        );
      }
      query = query.or(buildEventFollowUpCalendarOr(filters.followUp, eventDays));
    }
  }

  if (searchQuery) {
    const normalized = searchQuery.replace(/,/g, " ");
    query = query.or(`full_name.ilike.%${normalized}%,email.ilike.%${normalized}%,company_text.ilike.%${normalized}%`);
  }

  const { data: rawData, error } = await query;
  if (error) {
    console.error("[exhibitor/leads] Leads fetch failed:", error.message, error.code);
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-red-600">
        Failed to load leads. Please refresh and try again.
      </div>
    );
  }

  const normalized = ((rawData ?? []) as Omit<LeadRow, "aiBriefRenderable">[]).map((row) => ({
    ...row,
    temperature: parseLeadTemperature(row.temperature),
    rating: Number(row.rating ?? 0),
    status: row.status ?? "new"
  }));

  const aiBriefRenderableByLeadId: Record<string, boolean> = {};
  const leadIds = normalized.map((r) => r.id);
  for (let i = 0; i < leadIds.length; i += LEAD_BRIEFING_LOOKUP_CHUNK) {
    const chunk = leadIds.slice(i, i + LEAD_BRIEFING_LOOKUP_CHUNK);
    const { data: briefingRows, error: briefingErr } = await supabase
      .from("lead_briefings")
      .select("lead_id, content")
      .eq("company_id", companyId)
      .in("lead_id", chunk);
    if (briefingErr) {
      console.error("[exhibitor/leads] lead_briefings batch fetch failed:", briefingErr.message, briefingErr.code);
      continue;
    }
    for (const br of briefingRows ?? []) {
      const row = br as { lead_id: string; content: Json };
      aiBriefRenderableByLeadId[row.lead_id] = exhibitorLeadBriefingJsonHasRenderableAiBrief(row.content);
    }
  }

  const workflowSummaryByLeadId = await loadWorkflowSummariesForLeads({
    supabase,
    companyId,
    eventId,
    leadIds
  });

  const data: LeadRow[] = normalized.map((row) => ({
    ...row,
    aiBriefRenderable: aiBriefRenderableByLeadId[row.id] === true,
    workflowSummary: workflowSummaryByLeadId[row.id] ?? emptyLeadWorkflowSummary(row.id)
  }));

  return (
    <ExhibitorLeadsTable
      leads={data}
      eventId={eventId}
      searchQuery={searchQuery}
      filters={filters}
      activeFilterSummary={activeLeadFilterLabels(filters)}
      canEdit={canEdit}
      canDelete={canDelete}
      pipedriveConnected={pipedriveConnected}
    />
  );
}
