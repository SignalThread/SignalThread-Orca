import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { CompanyScopedCreateLicenseAction } from "@/components/admin/company-scoped-create-license-action";
import {
  applyCompanyScopedLicensesFilters,
  licenseTierFilterOptions,
  type CompanyScopedLicensesFilterState
} from "@/lib/client/admin-company-licenses-filters";
import {
  getAdminCompanyScopedOverviewData,
  summarizeCompanyScopedLicenses,
  type CompanyScopedLicenseStatus,
  type CompanyScopedOverviewRow,
  type CompanyScopedUsageHealth
} from "@/lib/data/admin-company-licenses-overview";
import { getAdminLicensesPageData } from "@/lib/data/admin-licenses";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function normalizeLicenseFilters(params: Record<string, string | string[] | undefined>): CompanyScopedLicensesFilterState {
  const status = readParam(params, "status");
  const limit = readParam(params, "limit");
  const expiring = readParam(params, "expiring");
  const activeEvents = readParam(params, "activeEvents");
  return {
    search: readParam(params, "q").trim(),
    status: status === "active" || status === "trial" || status === "expired" ? status : "all",
    tier: readParam(params, "tier") || "all",
    limit: limit === "near_or_over" ? "near_or_over" : "all",
    expiring: expiring === "soon" ? "soon" : "all",
    activeEvents: activeEvents === "yes" || activeEvents === "no" ? activeEvents : "all"
  };
}

function licenseFiltersActive(filters: CompanyScopedLicensesFilterState) {
  return Boolean(filters.search) ||
    filters.status !== "all" ||
    filters.tier !== "all" ||
    filters.limit !== "all" ||
    filters.expiring !== "all" ||
    filters.activeEvents !== "all";
}

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatSeats(used: number, allocated: number) {
  return `${formatCount(used)} / ${formatCount(allocated)}`;
}

function formatOptionalCount(value: number | null) {
  if (value == null) return "Not tracked";
  return formatCount(value);
}

function formatExpiry(value: string | null) {
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

function licenseStatusLabel(status: CompanyScopedLicenseStatus) {
  if (status === "active") return "Active";
  if (status === "trial") return "Trial";
  return "Expired";
}

function usageHealthLabel(health: CompanyScopedUsageHealth) {
  if (health === "over_limit") return "Over limit";
  if (health === "expiring") return "Expiring";
  if (health === "inactive") return "Inactive";
  if (health === "watch") return "Watch";
  return "Healthy";
}

function licenseStatusClasses(status: CompanyScopedLicenseStatus) {
  if (status === "active") return "bg-emerald-100 text-emerald-800";
  if (status === "trial") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-700";
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

function LicenseDirectoryRow({ row }: { row: CompanyScopedOverviewRow }) {
  return (
    <tr className="border-b border-border/70 text-sm text-slate-700 last:border-none hover:bg-slate-50/80">
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900" title={row.companyName}>
            {row.companyName}
          </p>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${licenseStatusClasses(row.licenseStatus)}`}>
          {licenseStatusLabel(row.licenseStatus)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">
        <span className="block truncate" title={row.licenseTier}>{row.licenseTier}</span>
      </td>
      <td className="px-4 py-3 align-middle font-semibold text-slate-900">{formatSeats(row.seatsUsed, row.seatsAllocated)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatOptionalCount(row.maxEvents)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.activeEvents)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.eventsThisMonth)}</td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="whitespace-nowrap">{formatExpiry(row.expiresAt)}</span>
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
        <span
          aria-disabled="true"
          className="inline-flex cursor-not-allowed items-center whitespace-nowrap rounded-lg border border-border bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-400"
          title="License detail or edit route is not available yet."
        >
          Details
        </span>
      </td>
    </tr>
  );
}

export default async function CompanyScopedLicensesPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const filters = normalizeLicenseFilters(resolvedSearchParams);
  const [data, licenseProvisioningData] = await Promise.all([
    getAdminCompanyScopedOverviewData(),
    getAdminLicensesPageData()
  ]);
  const summary = summarizeCompanyScopedLicenses(data.companies);
  const filteredLicenses = applyCompanyScopedLicensesFilters(data.companies, filters);
  const hasActiveFilters = licenseFiltersActive(filters);
  const tierOptions = licenseTierFilterOptions(data.companies);
  const companyOptions = Array.from(
    new Map(
      licenseProvisioningData.exhibitors.map((row) => [row.companyId, { id: row.companyId, name: row.name }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Licenses"
        subtitle="Track company-scoped license status, seats, event usage, and renewal risk."
        tag="Company-Scoped License Dashboard"
        action={
          <CompanyScopedCreateLicenseAction
            events={licenseProvisioningData.events}
            exhibitors={licenseProvisioningData.exhibitors}
            companies={companyOptions}
            hostCompanies={licenseProvisioningData.hostCompanies}
            licensePlans={licenseProvisioningData.licensePlans}
          />
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total company licenses"
          value={formatCount(summary.totalCompanyLicenses)}
        />
        <SummaryCard label="Active licenses" value={formatCount(summary.activeLicenses)} />
        <SummaryCard
          label="Expiring licenses"
          value={formatCount(summary.expiringLicenses)}
        />
        <SummaryCard
          label="Near/over limit licenses"
          value={formatCount(summary.nearOrOverLimitLicenses)}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <form action="/admin/company-licenses/licenses" className="border-b border-border bg-slate-50/70 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5 xl:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Search</span>
              <input
                name="q"
                defaultValue={filters.search}
                placeholder="Company"
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              />
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
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Tier</span>
              <select
                name="tier"
                defaultValue={filters.tier}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All tiers</option>
                {tierOptions.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Seat limit</span>
              <select
                name="limit"
                defaultValue={filters.limit}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All usage</option>
                <option value="near_or_over">Near / over limit</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Events</span>
              <select
                name="activeEvents"
                defaultValue={filters.activeEvents}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">Any event state</option>
                <option value="yes">Has active events</option>
                <option value="no">No active events</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Renewal</span>
              <select
                name="expiring"
                defaultValue={filters.expiring}
                className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-slate-800"
              >
                <option value="all">All renewals</option>
                <option value="soon">Expiring soon</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              Showing {formatCount(filteredLicenses.length)} of {formatCount(data.companies.length)} licenses
            </span>
            <span className="flex gap-2">
              <Link
                href="/admin/company-licenses/licenses"
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
                <th className="w-[17%] px-4 py-3.5">Company</th>
                <th className="w-[9%] px-4 py-3.5">License Status</th>
                <th className="w-[10%] px-4 py-3.5">License Tier</th>
                <th className="w-[11%] px-4 py-3.5">Seats Used / Allocated</th>
                <th className="w-[7%] px-4 py-3.5">Max Events</th>
                <th className="w-[7%] px-4 py-3.5">Active Events</th>
                <th className="w-[7%] px-4 py-3.5">Events This Month</th>
                <th className="w-[10%] px-4 py-3.5">Expires / Renews</th>
                <th className="w-[8%] px-4 py-3.5">Usage Health</th>
                <th className="w-[9%] px-4 py-3.5">Last Activity</th>
                <th className="w-[5%] px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLicenses.map((row) => (
                <LicenseDirectoryRow key={row.companyId} row={row} />
              ))}
              {filteredLicenses.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
                    {hasActiveFilters ? "No results match these filters." : "No company-scoped licenses found."}
                    {hasActiveFilters ? (
                      <Link href="/admin/company-licenses/licenses" className="ml-2 font-semibold text-slate-900 underline">
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
