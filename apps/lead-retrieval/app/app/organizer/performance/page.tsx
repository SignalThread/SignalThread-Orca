import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import {
  OrganizerPerformanceClient,
  type OrganizerPerformanceRow,
  type OrganizerPerformanceSummary
} from "./performance-client";

type ExhibitorRow = {
  id: string;
  company_id: string;
};

type LeadRow = {
  company_id: string;
  created_at: string;
};

type EventUserRow = {
  exhibitor_company_id: string | null;
  created_at: string;
};

type LicenseRow = {
  company_id: string;
  exhibitor_company_id: string | null;
  seats_total: number | null;
  seats_used: number | null;
};

function recencyScore(lastActivityAt: string | null) {
  if (!lastActivityAt) return 10;
  const timestamp = new Date(lastActivityAt).getTime();
  if (Number.isNaN(timestamp)) return 10;

  const days = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (days <= 1) return 100;
  if (days <= 3) return 70;
  if (days <= 7) return 40;
  return 10;
}

export default async function OrganizerPerformancePage() {
  const sessionUser = await requireRole("organizer_admin");

  const scope = await getOrganizerScope(sessionUser.id);
  const selectedEvent = scope.events[0] ?? null;
  const selectedEventId = selectedEvent?.id ?? "";

  if (!scope.events.length || !selectedEventId) {
    return (
      <section className="w-full max-w-full min-w-0 space-y-4 overflow-x-hidden">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Exhibitor Lead Performance</h1>
        <p className="text-slate-600">No events are scoped to your organizer account yet.</p>
      </section>
    );
  }

  const supabase = createAdminClient();
  const [exhibitorsResponse, leadsResponse, usersResponse, licensesResponse] = await Promise.all([
    (supabase as any)
      .from("exhibitors")
      .select("id, company_id")
      .eq("event_id", selectedEventId),
    (supabase as any)
      .from("leads")
      .select("company_id, created_at")
      .eq("event_id", selectedEventId),
    (supabase as any)
      .from("event_users")
      .select("exhibitor_company_id, created_at")
      .eq("event_id", selectedEventId)
      .eq("status", "active"),
    (supabase as any)
      .from("licenses")
      .select("company_id, exhibitor_company_id, seats_total, seats_used")
      .eq("event_id", selectedEventId)
  ]);

  const loadError =
    exhibitorsResponse.error?.message ??
    leadsResponse.error?.message ??
    usersResponse.error?.message ??
    licensesResponse.error?.message ??
    null;

  if (loadError) {
    return (
      <section className="w-full max-w-full min-w-0 space-y-4 overflow-x-hidden">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Exhibitor Lead Performance</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {loadError}
        </p>
      </section>
    );
  }

  const exhibitors = (exhibitorsResponse.data ?? []) as ExhibitorRow[];
  const leads = (leadsResponse.data ?? []) as LeadRow[];
  const activeUsers = (usersResponse.data ?? []) as EventUserRow[];
  const licenses = (licensesResponse.data ?? []) as LicenseRow[];

  const exhibitorCompanyIds = Array.from(new Set(exhibitors.map((row) => row.company_id)));
  const { data: companyRows, error: companyError } = exhibitorCompanyIds.length
    ? await (supabase as any)
        .from("companies")
        .select("id, name")
        .in("id", exhibitorCompanyIds)
    : { data: [], error: null };

  if (companyError) {
    return (
      <section className="w-full max-w-full min-w-0 space-y-4 overflow-x-hidden">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Exhibitor Lead Performance</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {companyError.message ?? "Failed loading exhibitor companies."}
        </p>
      </section>
    );
  }

  const companyNameById = new Map(
    ((companyRows ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  );

  const leadStatsByCompany = new Map<string, { count: number; lastActivityAt: string | null }>();
  for (const row of leads) {
    const key = row.company_id;
    const existing = leadStatsByCompany.get(key) ?? { count: 0, lastActivityAt: null };
    existing.count += 1;
    if (!existing.lastActivityAt || new Date(row.created_at).getTime() > new Date(existing.lastActivityAt).getTime()) {
      existing.lastActivityAt = row.created_at;
    }
    leadStatsByCompany.set(key, existing);
  }

  const userStatsByCompany = new Map<string, { count: number; lastActivityAt: string | null }>();
  for (const row of activeUsers) {
    if (!row.exhibitor_company_id) continue;
    const key = row.exhibitor_company_id;
    const existing = userStatsByCompany.get(key) ?? { count: 0, lastActivityAt: null };
    existing.count += 1;
    if (!existing.lastActivityAt || new Date(row.created_at).getTime() > new Date(existing.lastActivityAt).getTime()) {
      existing.lastActivityAt = row.created_at;
    }
    userStatsByCompany.set(key, existing);
  }

  const licenseStatsByCompany = new Map<string, { seatsTotal: number; seatsUsed: number }>();
  for (const row of licenses) {
    const key = row.exhibitor_company_id ?? row.company_id;
    const existing = licenseStatsByCompany.get(key) ?? { seatsTotal: 0, seatsUsed: 0 };
    existing.seatsTotal += Math.max(0, Number(row.seats_total ?? 0));
    existing.seatsUsed += Math.max(0, Number(row.seats_used ?? 0));
    licenseStatsByCompany.set(key, existing);
  }

  const totalEventLeads = leads.length;

  const baseRows = exhibitors.map((exhibitor): Omit<OrganizerPerformanceRow, "engagement"> => {
    const leadStats = leadStatsByCompany.get(exhibitor.company_id) ?? { count: 0, lastActivityAt: null };
    const activeStats = userStatsByCompany.get(exhibitor.company_id) ?? { count: 0, lastActivityAt: null };
    const seatStats = licenseStatsByCompany.get(exhibitor.company_id) ?? { seatsTotal: 0, seatsUsed: 0 };

    const utilizationPct =
      seatStats.seatsTotal > 0 ? Math.round((seatStats.seatsUsed / seatStats.seatsTotal) * 100) : 0;

    return {
      exhibitorId: exhibitor.id,
      companyId: exhibitor.company_id,
      exhibitorName: companyNameById.get(exhibitor.company_id) ?? "Unknown Exhibitor",
      leadCount: leadStats.count,
      percentOfEvent: totalEventLeads > 0 ? (leadStats.count / totalEventLeads) * 100 : 0,
      activeUsers: activeStats.count,
      seatsUsed: seatStats.seatsUsed,
      seatsTotal: seatStats.seatsTotal,
      utilizationPct,
      lastActivityAt: leadStats.lastActivityAt ?? activeStats.lastActivityAt ?? null
    };
  });

  const maxLeadCount = Math.max(0, ...baseRows.map((row) => row.leadCount));
  const maxActiveUsers = Math.max(0, ...baseRows.map((row) => row.activeUsers));

  const rows: OrganizerPerformanceRow[] = baseRows
    .map((row) => {
      const leadScore = maxLeadCount > 0 ? (row.leadCount / maxLeadCount) * 100 : 0;
      const activityScore = maxActiveUsers > 0 ? (row.activeUsers / maxActiveUsers) * 100 : 0;
      const utilizationScore = row.seatsTotal > 0 ? (row.seatsUsed / row.seatsTotal) * 100 : 0;
      const score = recencyScore(row.lastActivityAt);

      const engagement = Math.round(
        leadScore * 0.4 + activityScore * 0.25 + utilizationScore * 0.25 + score * 0.1
      );

      return {
        ...row,
        engagement
      };
    })
    .sort((a, b) => {
      if (b.leadCount !== a.leadCount) return b.leadCount - a.leadCount;
      return a.exhibitorName.localeCompare(b.exhibitorName);
    });

  const totalExhibitors = rows.length;
  const withLeadsCount = rows.filter((row) => row.leadCount > 0).length;
  const zeroLeads = rows.filter((row) => row.leadCount === 0).length;
  const withLeadsPct = totalExhibitors > 0 ? Math.round((withLeadsCount / totalExhibitors) * 100) : 0;
  const avgPerExhibitor = totalExhibitors > 0 ? totalEventLeads / totalExhibitors : 0;
  const mostActive = rows[0] && rows[0].leadCount > 0 ? rows[0].exhibitorName : "None";

  const summary: OrganizerPerformanceSummary = {
    totalExhibitors,
    withLeadsPct,
    totalLeads: totalEventLeads,
    avgPerExhibitor,
    zeroLeads,
    mostActiveName: mostActive
  };

  return (
    <section className="w-full max-w-full min-w-0 space-y-7 overflow-x-hidden">
      <header className="w-full max-w-full min-w-0 space-y-3 overflow-x-hidden">
        <div className="flex max-w-full min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-4xl font-bold tracking-tight text-slate-950">Exhibitor Lead Performance</h1>
            <p className="mt-1 text-slate-600">Company-level performance across the event</p>
          </div>
          <span className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            {selectedEvent?.name ?? "Unknown Event"}
          </span>
        </div>
      </header>

      <OrganizerPerformanceClient rows={rows} summary={summary} />
    </section>
  );
}
