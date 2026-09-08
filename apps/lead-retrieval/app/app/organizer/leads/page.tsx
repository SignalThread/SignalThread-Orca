import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizerScope, pickScopedEventId } from "@/lib/data/organizer-scope";
import { OrganizerLeadsExportLink } from "@/components/leads/leads-export-csv-link";
import { OrganizerEventSwitcher } from "@/components/organizer/event-switcher";
import { isHotLead } from "@/lib/leads/lead-business-rules";

type OrganizerLeadsPageProps = {
  searchParams?:
    | Promise<{ eventId?: string; q?: string }>
    | { eventId?: string; q?: string };
};

type LeadRow = {
  id: string;
  full_name: string;
  company_id: string;
  priority_score: number;
  temperature: string | null;
  rating: number;
  follow_up_date: string | null;
  owner_user_id: string | null;
  status: string;
};

export default async function OrganizerLeadsPage({ searchParams }: OrganizerLeadsPageProps) {
  const sessionUser = await requireRole("organizer_admin");
  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ eventId?: string; q?: string }>).then === "function"
      ? await (searchParams as Promise<{ eventId?: string; q?: string }>)
      : ((searchParams ?? {}) as { eventId?: string; q?: string });

  const scope = await getOrganizerScope(sessionUser.id);
  const eventId = pickScopedEventId(resolvedSearchParams.eventId, scope.events);
  const q = String(resolvedSearchParams.q ?? "").trim().toLowerCase();

  if (!scope.events.length || !eventId) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Leads</h1>
        <p className="text-slate-600">No events are scoped to your organizer account yet.</p>
      </section>
    );
  }

  const supabase = createAdminClient();
  const { data: leadRows, error } = await (supabase as any)
    .from("leads")
    .select("id, full_name, company_id, priority_score, temperature, rating, follow_up_date, owner_user_id, status")
    .eq("event_id", eventId)
    .order("priority_score", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[organizer leads] leads fetch failed:", error.message, error.code);
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Leads</h1>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error.message ?? "Failed loading leads."}
        </p>
      </section>
    );
  }

  const leads = (leadRows ?? []) as LeadRow[];

  const companyIds = Array.from(new Set(leads.map((row) => row.company_id)));
  const ownerIds = Array.from(
    new Set(leads.map((row) => row.owner_user_id).filter((value): value is string => Boolean(value)))
  );

  const [companiesResponse, ownersResponse] = await Promise.all([
    companyIds.length
      ? (supabase as any)
          .from("companies")
          .select("id, name")
          .in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
    ownerIds.length
      ? (supabase as any)
          .from("users")
          .select("id, full_name")
          .in("id", ownerIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const companyById = new Map(
    (((companiesResponse.data ?? []) as Array<{ id: string; name: string }>) ?? []).map((row) => [row.id, row.name])
  );
  const ownerById = new Map(
    (((ownersResponse.data ?? []) as Array<{ id: string; full_name: string | null }>) ?? []).map((row) => [row.id, row.full_name ?? "-"])
  );

  const filteredLeads = leads.filter((row) => {
    if (!q) return true;
    const companyName = companyById.get(row.company_id) ?? "";
    return row.full_name.toLowerCase().includes(q) || companyName.toLowerCase().includes(q);
  });

  const hotLeads = filteredLeads.filter(isHotLead).length;
  const followUps = filteredLeads.filter((row) => Boolean(row.follow_up_date)).length;

  return (
    <section className="space-y-7">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-950">Leads</h1>
            <p className="mt-1 text-slate-600">Global lead management across all exhibitors in this event.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OrganizerLeadsExportLink eventId={eventId} q={resolvedSearchParams.q ?? null} />
            <OrganizerEventSwitcher
              events={scope.events.map((event) => ({ id: event.id, name: event.name }))}
              value={eventId}
            />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Leads" value={filteredLeads.length} />
        <Metric label="Hot Leads" value={hotLeads} />
        <Metric label="Follow-ups Scheduled" value={followUps} />
        <Metric label="Synced" value="No data yet" />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
        <form method="get" className="relative">
          <input type="hidden" name="eventId" value={eventId} />
          <input
            name="q"
            defaultValue={resolvedSearchParams.q ?? ""}
            placeholder="Search leads by name or company..."
            className="h-12 w-full rounded-xl border border-border bg-white pl-4 pr-4 text-base placeholder:text-slate-400"
          />
        </form>

        <div className="mt-5 w-full overflow-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[30%] px-3 py-3 sm:px-4">Name</th>
                <th className="w-[24%] px-3 py-3 sm:px-4">Company</th>
                <th className="w-[12%] px-3 py-3 sm:px-4">Priority</th>
                <th className="hidden w-[10%] px-3 py-3 lg:table-cell sm:px-4">Rating</th>
                <th className="hidden w-[14%] px-3 py-3 xl:table-cell sm:px-4">Follow-up</th>
                <th className="hidden w-[14%] px-3 py-3 xl:table-cell sm:px-4">Owner</th>
                <th className="w-[16%] px-3 py-3 sm:px-4">Status</th>
                <th className="hidden w-[10%] px-3 py-3 lg:table-cell sm:px-4">Sync</th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-border/70 text-slate-700 last:border-none hover:bg-slate-50/70">
                  <td className="px-3 py-3.5 font-semibold text-slate-900 sm:px-4">
                    <span className="block truncate" title={lead.full_name}>
                      {lead.full_name}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 font-medium sm:px-4">
                    <span className="block truncate" title={companyById.get(lead.company_id) ?? "Unknown Company"}>
                      {companyById.get(lead.company_id) ?? "Unknown Company"}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 font-semibold sm:px-4">{lead.priority_score}</td>
                  <td className="hidden px-3 py-3.5 lg:table-cell sm:px-4">{lead.rating}</td>
                  <td className="hidden px-3 py-3.5 xl:table-cell sm:px-4">
                    {lead.follow_up_date ? new Date(lead.follow_up_date).toLocaleDateString() : "Not set"}
                  </td>
                  <td className="hidden px-3 py-3.5 xl:table-cell sm:px-4">{lead.owner_user_id ? ownerById.get(lead.owner_user_id) ?? "-" : "-"}</td>
                  <td className="px-3 py-3.5 sm:px-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {String(lead.status ?? "unknown")}
                    </span>
                  </td>
                  <td className="hidden px-3 py-3.5 lg:table-cell sm:px-4">-</td>
                </tr>
              ))}
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    No leads found for this event.
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <p className="text-4xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600">{label}</p>
    </article>
  );
}
