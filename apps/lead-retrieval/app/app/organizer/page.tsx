import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AttentionIssue, AttentionIssueKind } from "@/lib/data/organizer-event-dashboard";
import {
  buildExhibitorsNeedingAttention,
  countLicensedExhibitors,
  countSentCampaignsForExhibitorCompanies
} from "@/lib/data/organizer-event-dashboard";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { OrganizerEventSwitcher } from "@/components/organizer/event-switcher";
import { formatEventEntrySubtitle, NoActiveEventEntry } from "@/components/app/no-active-event-entry";
import { resolveEventLocation } from "@/lib/data/admin-events";

type ExhibitorRow = {
  id: string;
  company_id: string;
  status: string;
};

type LicenseRow = {
  id: string;
  exhibitor_company_id: string | null;
  seats_total: number;
  seats_used: number;
  status: string;
  price_cents: number | null;
};

type EventUserRow = {
  id: string;
  status: string;
  exhibitor_company_id: string | null;
};

type LeadRow = {
  id: string;
  company_id: string;
  priority_score: number;
};

type CampaignStatusRow = {
  company_id: string | null;
  status: string;
};

type OrganizerDashboardPageProps = {
  searchParams?: Promise<{ eventId?: string }> | { eventId?: string };
};

function eventLocation(event: { city: string | null; state: string | null; location: string | null }) {
  return resolveEventLocation(event.city, event.state, event.location) ?? "";
}

function organizerEventStatus(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active" || normalized === "live") return "bg-emerald-50 text-emerald-700 ring-emerald-600/15";
  if (normalized === "completed" || normalized === "complete") return "bg-slate-100 text-slate-600 ring-slate-500/15";
  return "bg-indigo-50 text-indigo-700 ring-indigo-600/15";
}

function OrganizerOverviewPortfolio({ events }: { events: Awaited<ReturnType<typeof getOrganizerScope>>["events"] }) {
  const activeEvents = events.filter((event) => ["active", "live"].includes(event.status.trim().toLowerCase())).length;

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 pb-10 pt-1">
      <header className="max-w-2xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700">Organizer workspace</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Organizer Overview</h1>
        <p className="text-sm leading-6 text-slate-600">Choose an event to review exhibitor operations, licensing, and performance.</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Your events</h2>
            <p className="mt-1 text-sm text-slate-600">
              {events.length} {events.length === 1 ? "event" : "events"} in your organizer scope{activeEvents ? ` · ${activeEvents} active` : ""}.
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {events.map((event) => {
            const location = eventLocation(event);
            const subtitle = formatEventEntrySubtitle(event.startDate, event.status);
            return (
              <li key={event.id} className="flex flex-col gap-4 px-5 py-4 transition-colors hover:bg-slate-50/70 md:flex-row md:items-center md:justify-between md:px-6">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-900">{event.name}</h3>
                    {event.status ? (
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ring-inset ${organizerEventStatus(event.status)}`}>
                        {event.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-slate-500">{[subtitle, location].filter(Boolean).join(" · ") || "Event details unavailable"}</p>
                </div>
                <Link
                  href={`/app/organizer?eventId=${encodeURIComponent(event.id)}`}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  Open workspace
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}

function usd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function mergeLicensesByCompany(licenses: LicenseRow[]): Map<string, { seats_total: number; seats_used: number; status: string }> {
  const map = new Map<string, { seats_total: number; seats_used: number; status: string }>();
  for (const row of licenses) {
    const cid = row.exhibitor_company_id;
    if (!cid) continue;
    const prev = map.get(cid);
    const seatsTotal = Math.max(0, Number(row.seats_total ?? 0));
    const seatsUsed = Math.max(0, Number(row.seats_used ?? 0));
    if (!prev) {
      map.set(cid, {
        seats_total: seatsTotal,
        seats_used: seatsUsed,
        status: String(row.status ?? "")
      });
    } else {
      map.set(cid, {
        seats_total: prev.seats_total + seatsTotal,
        seats_used: prev.seats_used + seatsUsed,
        status: prev.status
      });
    }
  }
  return map;
}

export default async function OrganizerDashboardPage({ searchParams }: OrganizerDashboardPageProps) {
  const sessionUser = await requireRole("organizer_admin");

  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ eventId?: string }>).then === "function"
      ? await (searchParams as Promise<{ eventId?: string }>)
      : ((searchParams ?? {}) as { eventId?: string });

  const scope = await getOrganizerScope(sessionUser.id);
  const rawEventId = String(resolvedSearchParams.eventId ?? "").trim();
  const hasValidEventId = rawEventId.length > 0 && scope.events.some((e) => e.id === rawEventId);

  if (scope.events.length === 0) {
    return (
      <NoActiveEventEntry
        mode="empty"
        createEventHref={null}
        events={[]}
        buildOpenHref={(id) => `/app/organizer?eventId=${encodeURIComponent(id)}`}
      />
    );
  }

  if (!hasValidEventId) {
    return <OrganizerOverviewPortfolio events={scope.events} />;
  }

  const selectedEventId = rawEventId;
  const selectedEvent = scope.events.find((e) => e.id === selectedEventId) ?? null;
  if (!selectedEvent) {
    return (
      <NoActiveEventEntry
        mode="choose"
        createEventHref={null}
        events={scope.events.map((e) => ({
          id: e.id,
          name: e.name,
          subtitle: formatEventEntrySubtitle(e.startDate, e.status)
        }))}
        buildOpenHref={(id) => `/app/organizer?eventId=${encodeURIComponent(id)}`}
      />
    );
  }

  const supabase = createAdminClient();

  const [exhibitorsResponse, licensesResponse, eventUsersResponse, leadsResponse] = await Promise.all([
    (supabase as any)
      .from("exhibitors")
      .select("id, company_id, status")
      .eq("event_id", selectedEventId),
    (supabase as any)
      .from("licenses")
      .select("id, exhibitor_company_id, seats_total, seats_used, status, price_cents")
      .eq("event_id", selectedEventId),
    (supabase as any)
      .from("event_users")
      .select("id, status, exhibitor_company_id")
      .eq("event_id", selectedEventId),
    (supabase as any)
      .from("leads")
      .select("id, company_id, priority_score")
      .eq("event_id", selectedEventId)
  ]);

  if (exhibitorsResponse.error || licensesResponse.error || eventUsersResponse.error || leadsResponse.error) {
    if (exhibitorsResponse.error) console.error("[organizer dashboard] exhibitors fetch failed:", exhibitorsResponse.error.message, exhibitorsResponse.error.code);
    if (licensesResponse.error) console.error("[organizer dashboard] licenses fetch failed:", licensesResponse.error.message, licensesResponse.error.code);
    if (eventUsersResponse.error) console.error("[organizer dashboard] event_users fetch failed:", eventUsersResponse.error.message, eventUsersResponse.error.code);
    if (leadsResponse.error) console.error("[organizer dashboard] leads fetch failed:", leadsResponse.error.message, leadsResponse.error.code);
    const message =
      exhibitorsResponse.error?.message ??
      licensesResponse.error?.message ??
      eventUsersResponse.error?.message ??
      leadsResponse.error?.message ??
      "Failed loading organizer dashboard.";

    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Organizer Dashboard</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{message}</p>
      </section>
    );
  }

  const exhibitors = (exhibitorsResponse.data ?? []) as ExhibitorRow[];
  const licenses = (licensesResponse.data ?? []) as LicenseRow[];
  const eventUsers = (eventUsersResponse.data ?? []) as EventUserRow[];
  const leads = (leadsResponse.data ?? []) as LeadRow[];

  const companyIds = Array.from(new Set(exhibitors.map((row) => row.company_id)));
  const exhibitorCompanyIdSet = new Set(companyIds);

  const campaignsResponse =
    companyIds.length > 0
      ? await (supabase as any)
          .from("campaigns")
          .select("company_id, status")
          .in("company_id", companyIds)
      : { data: [], error: null };

  if (campaignsResponse.error) {
    console.error("[organizer dashboard] campaigns fetch failed:", campaignsResponse.error.message, campaignsResponse.error.code);
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Organizer Dashboard</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {campaignsResponse.error.message ?? "Failed loading campaign stats."}
        </p>
      </section>
    );
  }

  const campaignRows = (campaignsResponse.data ?? []) as CampaignStatusRow[];
  const campaignsSentCount = countSentCampaignsForExhibitorCompanies(campaignRows, exhibitorCompanyIdSet);

  const { data: companiesData, error: companiesError } = companyIds.length
    ? await (supabase as any)
        .from("companies")
        .select("id, name")
        .in("id", companyIds)
    : { data: [], error: null };

  if (companiesError) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Organizer Dashboard</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {companiesError.message ?? "Failed loading company names."}
        </p>
      </section>
    );
  }

  const companyNameById = new Map(
    ((companiesData ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  );

  const totalLeads = leads.length;
  const activeLicenses = licenses.filter((license) => String(license.status).toLowerCase() === "active").length;

  const storedSeatsTotal = licenses.reduce((sum, row) => sum + Math.max(0, Number(row.seats_total ?? 0)), 0);
  const storedSeatsUsed = licenses.reduce((sum, row) => sum + Math.max(0, Number(row.seats_used ?? 0)), 0);
  const pendingInvitesTotal = eventUsers.filter((row) => {
    const normalized = String(row.status ?? "").toLowerCase();
    return normalized === "invited" && Boolean(row.exhibitor_company_id);
  }).length;

  const totalRevenue = licenses.reduce((sum, row) => sum + Math.max(0, Number(row.price_cents ?? 0)) / 100, 0);
  const seatsActivatedPercent =
    storedSeatsTotal > 0 ? Math.min(100, Math.round((storedSeatsUsed / storedSeatsTotal) * 100)) : null;

  const leadsByCompany = new Map<string, number>();
  for (const row of leads) {
    leadsByCompany.set(row.company_id, (leadsByCompany.get(row.company_id) ?? 0) + 1);
  }

  const activeUsersByCompany = new Map<string, number>();
  const pendingInvitesByCompany = new Map<string, number>();
  for (const row of eventUsers) {
    if (!row.exhibitor_company_id) continue;
    const normalized = String(row.status ?? "").toLowerCase();
    if (normalized === "active") {
      activeUsersByCompany.set(row.exhibitor_company_id, (activeUsersByCompany.get(row.exhibitor_company_id) ?? 0) + 1);
    }
    if (normalized === "invited") {
      pendingInvitesByCompany.set(row.exhibitor_company_id, (pendingInvitesByCompany.get(row.exhibitor_company_id) ?? 0) + 1);
    }
  }

  const licenseByCompany = mergeLicensesByCompany(licenses);
  const licensedExhibitorsCount = countLicensedExhibitors(companyIds, new Set(licenseByCompany.keys()));

  const exhibitorRows = exhibitors.map((row) => {
    const leadCount = leadsByCompany.get(row.company_id) ?? 0;
    const activeUsers = activeUsersByCompany.get(row.company_id) ?? 0;
    const pendingInvites = pendingInvitesByCompany.get(row.company_id) ?? 0;
    const lic = licenseByCompany.get(row.company_id);
    const engagement = totalLeads ? Math.round((leadCount / totalLeads) * 100) : 0;
    return {
      id: row.id,
      companyId: row.company_id,
      name: companyNameById.get(row.company_id) ?? "Unknown Exhibitor",
      leadCount,
      activeUsers,
      pendingInvites,
      engagement,
      seatsTotal: lic?.seats_total ?? 0,
      seatsUsed: lic?.seats_used ?? 0
    };
  });

  const sortedByLeads = [...exhibitorRows].sort((a, b) => b.leadCount - a.leadCount);
  const topExhibitors = sortedByLeads.slice(0, 5);

  const attentionRows = buildExhibitorsNeedingAttention(
    exhibitorRows.map((row) => ({
      exhibitorId: row.id,
      companyId: row.companyId,
      name: row.name,
      leadCount: row.leadCount,
      activeUserCount: row.activeUsers,
      pendingInviteCount: row.pendingInvites,
      seatsTotal: row.seatsTotal,
      seatsUsed: row.seatsUsed
    }))
  );

  const snapshotUpdated = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  const eventQuery = `eventId=${encodeURIComponent(selectedEventId)}`;

  return (
    <section className="space-y-8 bg-slate-50/80 pb-10 pt-1">
      <header>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="min-w-0 space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Operational overview</h1>
            <p className="text-sm text-slate-600">
              Global performance and license posture for <span className="font-medium text-slate-800">{selectedEvent.name}</span>
            </p>
          </div>
          <div className="flex w-full flex-shrink-0 flex-col gap-3 sm:w-auto lg:max-w-none lg:flex-row lg:flex-wrap lg:items-center lg:justify-end lg:gap-x-3 lg:gap-y-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 sm:gap-x-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Last updated</span>
              <span className="text-xs font-medium text-slate-600">{snapshotUpdated}</span>
              <OrganizerEventSwitcher
                events={scope.events.map((event) => ({ id: event.id, name: event.name }))}
                value={selectedEventId}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 sm:gap-2.5 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <Link
                href={`/app/organizer/licenses?${eventQuery}`}
                className="inline-flex h-11 min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/60 transition hover:bg-slate-50"
              >
                Manage licenses
              </Link>
              <Link
                href={`/app/organizer/users?${eventQuery}`}
                className="inline-flex h-11 min-h-[2.75rem] shrink-0 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-md transition hover:opacity-95"
              >
                Invite users
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Layer 1: unified executive summary band */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-5 py-4 md:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Event snapshot</p>
        </div>
        <SummaryBandGrid>
          <SummaryBandCell emphasize="primary">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-[2rem]">{exhibitors.length}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Total exhibitors</p>
            <p className="mt-1 text-[11px] font-semibold text-accent">
              Licensed {licensedExhibitorsCount}/{exhibitors.length}
            </p>
          </SummaryBandCell>
          <SummaryBandCell>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-[2rem]">{activeLicenses}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Active licenses</p>
          </SummaryBandCell>
          <SummaryBandCell>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-[2rem]">
              {totalLeads.toLocaleString("en-US")}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Total leads</p>
          </SummaryBandCell>
          <SummaryBandCell>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-[2rem]">{pendingInvitesTotal}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Pending invites</p>
          </SummaryBandCell>
          <SummaryBandCell emphasize="revenue">
            <p className="text-2xl font-bold tabular-nums text-accent sm:text-[1.65rem]">{usd(totalRevenue)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">License revenue</p>
          </SummaryBandCell>
          <SummaryBandCell>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-[2rem]">
              {seatsActivatedPercent !== null ? `${seatsActivatedPercent}%` : "—"}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Seats activated</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {storedSeatsTotal > 0
                ? `${storedSeatsUsed.toLocaleString("en-US")} / ${storedSeatsTotal.toLocaleString("en-US")} seats`
                : "No seats on record"}
            </p>
          </SummaryBandCell>
          <SummaryBandCell>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-slate-950 sm:text-[2rem]">{campaignsSentCount}</p>
            <p className="mt-1 text-xs font-semibold text-slate-600">Campaigns sent</p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">Completed sends</p>
          </SummaryBandCell>
        </SummaryBandGrid>
      </section>

      {/* Layer 2: operational interventions — multi-factor health preserved */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-amber-50/30 px-5 py-4 md:px-6">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800" aria-hidden>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="stroke-current">
                <path strokeWidth="2" strokeLinecap="round" d="M12 9v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
              </svg>
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-950 md:text-xl">Critical operational interventions</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                Sorted by urgency. Multiple cues can apply per exhibitor — address pipeline, seats, and invites.
              </p>
            </div>
          </div>
          <Link
            href={`/app/organizer/exhibitors?${eventQuery}`}
            className="shrink-0 text-sm font-semibold text-accent hover:underline"
          >
            All exhibitors →
          </Link>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 md:px-5">Exhibitor</th>
                <th className="w-[28%] min-w-[200px] whitespace-nowrap px-4 py-3 md:px-5">Health / issues</th>
                <th className="whitespace-nowrap px-4 py-3 text-right md:px-5">Leads</th>
                <th className="whitespace-nowrap px-4 py-3 text-right md:px-5">Active users</th>
                <th className="whitespace-nowrap px-4 py-3 text-right md:px-5">Pending invites</th>
                <th className="whitespace-nowrap px-4 py-3 text-right md:px-5">Seat activation</th>
                <th className="whitespace-nowrap px-4 py-3 text-right md:px-5"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {attentionRows.map((row) => (
                <tr key={row.exhibitorId} className="transition-colors hover:bg-slate-50/80">
                  <td className="max-w-[220px] px-4 py-3.5 align-top md:px-5">
                    <span className="block truncate font-semibold text-slate-900" title={row.name}>
                      {row.name}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 align-top md:px-5">
                    <AttentionIssueBadges issues={row.issues} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-medium tabular-nums text-slate-800 md:px-5">
                    {row.leadCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-medium tabular-nums text-slate-800 md:px-5">
                    {row.activeUserCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-medium tabular-nums text-slate-800 md:px-5">
                    {row.pendingInviteCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right text-sm font-medium tabular-nums text-slate-800 md:px-5">
                    {row.seatsTotal > 0 ? `${Math.round((row.seatsUsed / row.seatsTotal) * 100)}%` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right align-top md:px-5">
                    <Link
                      href={`/app/organizer/exhibitors/${row.companyId}?${eventQuery}`}
                      className="text-sm font-semibold text-accent hover:underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {attentionRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500 md:px-5">
                    <span className="font-medium text-slate-700">All clear.</span> No exhibitors match intervention rules right now.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Layer 3: lead generation performance */}
      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950 md:text-xl">Lead generation performance</h2>
            <p className="mt-0.5 text-sm text-slate-600">Top exhibitors by lead share for this event.</p>
          </div>
          <Link href={`/app/organizer/exhibitors?${eventQuery}`} className="text-sm font-semibold text-accent hover:underline">
            View all →
          </Link>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3 md:px-5">Exhibitor</th>
                <th className="whitespace-nowrap px-4 py-3 md:px-5">Leads</th>
                <th className="hidden whitespace-nowrap px-4 py-3 md:table-cell md:px-5">Active users</th>
                <th className="hidden w-[28%] px-4 py-3 lg:table-cell lg:px-5">Share / contribution</th>
                <th className="whitespace-nowrap px-4 py-3 text-right md:px-5"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topExhibitors.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="max-w-[240px] px-4 py-3.5 font-semibold text-slate-900 md:px-5">
                    <span className="block truncate" title={row.name}>
                      {row.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-slate-800 md:px-5">{row.leadCount}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-slate-700 md:table-cell md:px-5">
                    {row.activeUsers}
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell lg:px-5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 min-w-[4rem] flex-1 max-w-[140px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-accent"
                          style={{ width: `${Math.min(100, row.engagement)}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums text-slate-700">{row.engagement}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right md:px-5">
                    <Link
                      href={`/app/organizer/exhibitors/${row.companyId}?${eventQuery}`}
                      className="text-sm font-semibold text-accent hover:underline"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
              {topExhibitors.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500 md:px-5">
                    No exhibitor activity for this event yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

/** Single summary band: hairline dividers, one surface (mockup-aligned). */
function SummaryBandGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-slate-200/50 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {children}
    </div>
  );
}

function SummaryBandCell({
  children,
  emphasize
}: {
  children: ReactNode;
  emphasize?: "primary" | "revenue";
}) {
  const surface =
    emphasize === "revenue" ? "bg-accentSoft/50" : emphasize === "primary" ? "bg-slate-50/40" : "bg-white";
  return <div className={`min-h-[5.5rem] px-4 py-4 sm:min-h-[5.75rem] sm:px-5 sm:py-5 ${surface}`}>{children}</div>;
}

function AttentionIssueBadges({ issues }: { issues: AttentionIssue[] }) {
  return (
    <div className="flex max-w-[min(100%,280px)] flex-wrap gap-1.5">
      {issues.map((issue, i) => (
        <span
          key={`${issue.kind}-${i}`}
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight ${attentionBadgeClass(issue.kind)}`}
        >
          {attentionBadgeLabel(issue)}
        </span>
      ))}
    </div>
  );
}

function attentionBadgeLabel(issue: AttentionIssue): string {
  switch (issue.kind) {
    case "no_leads":
      return "No leads";
    case "no_active_users":
      return "No active users";
    case "pending_invites": {
      const n = issue.inviteCount ?? 1;
      return n === 1 ? "1 pending invite" : `${n} pending invites`;
    }
    case "low_activation":
      return "Low activation";
    default:
      return "";
  }
}

function attentionBadgeClass(kind: AttentionIssueKind): string {
  switch (kind) {
    case "no_leads":
      return "border-amber-200/80 bg-amber-50/90 text-amber-950";
    case "no_active_users":
      return "border-rose-200/80 bg-rose-50/90 text-rose-900";
    case "pending_invites":
      return "border-indigo-200/80 bg-indigo-50/90 text-indigo-900";
    case "low_activation":
      return "border-slate-200 bg-slate-100 text-slate-800";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
