import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import {
  applyCompanyScopedEventsFilters,
  companyFilterOptions,
  type CompanyScopedEventsFilterState
} from "@/lib/client/admin-company-licenses-filters";
import {
  getAdminCompanyScopedEventsDirectoryData,
  summarizeCompanyScopedEventsDirectory,
  type CompanyScopedEventsDirectoryRow,
  type CompanyScopedUsageHealth
} from "@/lib/data/admin-company-licenses-overview";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeEventFilters(params: Record<string, string | string[] | undefined>): CompanyScopedEventsFilterState {
  const status = readParam(params, "status");
  const date = readParam(params, "date");
  const leads = readParam(params, "leads");
  return {
    search: readParam(params, "q").trim(),
    companyId: readParam(params, "company") || "all",
    status: status === "active" || status === "upcoming" || status === "past" ? status : "all",
    date: date === "this_month" || date === "upcoming" || date === "past" ? date : "all",
    leads: leads === "yes" || leads === "no" ? leads : "all"
  };
}

function eventFiltersActive(filters: CompanyScopedEventsFilterState) {
  return Boolean(filters.search) ||
    filters.companyId !== "all" ||
    filters.status !== "all" ||
    filters.date !== "all" ||
    filters.leads !== "all";
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatDate(value: string | null) {
  if (!value) return "Not tracked";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "Not tracked";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(ms));
}

function formatDateTime(value: string | null) {
  if (!value) return "Not tracked";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "Not tracked";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(ms));
}

function statusLabel(status: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active") return "Active";
  if (normalized === "completed") return "Completed";
  if (normalized === "upcoming") return "Upcoming";
  return normalized ? normalized.replace(/_/g, " ") : "Not tracked";
}

function statusClasses(status: string | null) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "active") return "bg-emerald-100 text-emerald-800";
  if (normalized === "completed") return "bg-slate-100 text-slate-700";
  if (normalized === "upcoming") return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function usageHealthLabel(health: CompanyScopedUsageHealth) {
  if (health === "over_limit") return "Over limit";
  if (health === "expiring") return "Expiring";
  if (health === "inactive") return "Inactive";
  if (health === "watch") return "Watch";
  return "Healthy";
}

function usageHealthClasses(health: CompanyScopedUsageHealth) {
  if (health === "healthy") return "bg-emerald-100 text-emerald-800";
  if (health === "watch") return "bg-amber-100 text-amber-800";
  if (health === "inactive") return "bg-slate-100 text-slate-700";
  if (health === "over_limit") return "bg-rose-100 text-rose-700";
  return "bg-orange-100 text-orange-800";
}

function SummaryCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
      <p className="text-3xl font-bold text-slate-950 md:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{label}</p>
    </article>
  );
}

function EventDirectoryRow({ row }: { row: CompanyScopedEventsDirectoryRow }) {
  return (
    <tr className="border-b border-border/70 text-sm text-slate-700 last:border-none hover:bg-slate-50/80">
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900" title={row.eventName}>
            {row.eventName}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900" title={row.companyName}>
            {row.companyName}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(row.status)}`}>
          {statusLabel(row.status)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="whitespace-nowrap">{formatDate(row.startDate)}</span>
      </td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="whitespace-nowrap">{formatDate(row.endDate)}</span>
      </td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.usersAssigned)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.leadsCaptured)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">
        <span className="block truncate" title={row.licenseTier}>{row.licenseTier}</span>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${usageHealthClasses(row.usageHealth)}`}>
          {usageHealthLabel(row.usageHealth)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="whitespace-nowrap">{formatDateTime(row.lastActivityAt)}</span>
      </td>
      <td className="px-4 py-3 align-middle">
        <Link
          href={`/admin/events/${row.eventId}`}
          className="inline-flex items-center whitespace-nowrap rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

export default async function CompanyScopedEventsPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = normalizeEventFilters(resolvedSearchParams);
  const events = await getAdminCompanyScopedEventsDirectoryData();
  const summary = summarizeCompanyScopedEventsDirectory(events);
  const filteredEvents = applyCompanyScopedEventsFilters(events, filters);
  const hasActiveFilters = eventFiltersActive(filters);
  const companyOptions = companyFilterOptions(events);

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Events"
        subtitle="Track company-scoped event usage, activity, and license utilization."
        tag="Company-Scoped License Dashboard"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total events" value={formatCount(summary.totalEvents)} />
        <SummaryCard label="Active events" value={formatCount(summary.activeEvents)} />
        <SummaryCard label="Events this month" value={formatCount(summary.eventsThisMonth)} />
        <SummaryCard
          label="Companies running events"
          value={formatCount(summary.companiesRunningEvents)}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <form action="/admin/company-licenses/events" className="border-b border-border bg-slate-50/70 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Search</span>
              <input
                name="q"
                defaultValue={filters.search}
                placeholder="Event or company"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Company</span>
              <select
                name="company"
                defaultValue={filters.companyId}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All companies</option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Status</span>
              <select
                name="status"
                defaultValue={filters.status}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Date</span>
              <select
                name="date"
                defaultValue={filters.date}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All dates</option>
                <option value="this_month">This month</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Leads</span>
              <select
                name="leads"
                defaultValue={filters.leads}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All lead states</option>
                <option value="yes">Leads captured</option>
                <option value="no">No leads</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              Showing {formatCount(filteredEvents.length)} of {formatCount(events.length)} events
            </span>
            <span className="flex gap-2">
              <Link
                href="/admin/company-licenses/events"
                className="inline-flex h-9 items-center rounded-lg border border-border bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </Link>
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Apply filters
              </button>
            </span>
          </div>
        </form>
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1500px] table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[16%] px-4 py-3.5">Event</th>
                <th className="w-[14%] px-4 py-3.5">Company</th>
                <th className="w-[8%] px-4 py-3.5">Status</th>
                <th className="w-[9%] px-4 py-3.5">Start Date</th>
                <th className="w-[9%] px-4 py-3.5">End Date</th>
                <th className="w-[7%] px-4 py-3.5">Users Assigned</th>
                <th className="w-[9%] px-4 py-3.5">Leads Captured</th>
                <th className="w-[10%] px-4 py-3.5">License Tier</th>
                <th className="w-[8%] px-4 py-3.5">Usage Health</th>
                <th className="w-[6%] px-4 py-3.5">Last Activity</th>
                <th className="w-[4%] px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((row) => (
                <EventDirectoryRow key={row.eventId} row={row} />
              ))}
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
                    {hasActiveFilters ? "No results match these filters." : "No company-scoped events found."}
                    {hasActiveFilters ? (
                      <Link href="/admin/company-licenses/events" className="ml-2 font-semibold text-slate-900 underline">
                        Clear filters.
                      </Link>
                    ) : null}
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
