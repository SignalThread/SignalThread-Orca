import { AdminPageHeader } from "@/components/admin/admin-ui";
import { CompanyScopedCreateCompanyAction } from "@/components/admin/company-scoped-create-company-action";
import {
  getAdminCompanyScopedOverviewData,
  summarizeCompanyScopedCompaniesDirectory,
  type CompanyScopedLicenseStatus,
  type CompanyScopedOverviewRow,
  type CompanyScopedUsageHealth
} from "@/lib/data/admin-company-licenses-overview";
import { getAdminLicensesPageData } from "@/lib/data/admin-licenses";

function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

function formatSeats(used: number, allocated: number) {
  return `${formatCount(used)} / ${formatCount(allocated)}`;
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

function CompanyDirectoryRow({ row }: { row: CompanyScopedOverviewRow }) {
  return (
    <tr className="cursor-pointer border-b border-border/70 text-sm text-slate-700 last:border-none transition-colors hover:bg-violet-50/70">
      <td className="px-4 py-3 align-middle">
        <div className="min-w-0">
          <form action="/api/admin/account-context" method="post" className="inline">
            <input type="hidden" name="companyId" value={row.companyId} />
            <button
              type="submit"
              className="max-w-full truncate text-left font-semibold text-violet-800 underline-offset-4 transition hover:text-violet-950 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
              title={`Enter ${row.companyName}`}
              aria-label={`Enter ${row.companyName}`}
            >
              {row.companyName}
            </button>
          </form>
        </div>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${licenseStatusClasses(row.licenseStatus)}`}>
          {licenseStatusLabel(row.licenseStatus)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{row.licenseTier}</td>
      <td className="px-4 py-3 align-middle font-semibold text-slate-900">{formatSeats(row.seatsUsed, row.seatsAllocated)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.activeUsers)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.pendingInvites)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.activeEvents)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.eventsThisMonth)}</td>
      <td className="px-4 py-3 align-middle font-medium text-slate-700">{formatCount(row.leadsCaptured)}</td>
      <td className="px-4 py-3 align-middle text-sm text-slate-600">
        <span className="whitespace-nowrap">{formatDateTime(row.lastActivityAt)}</span>
      </td>
      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${usageHealthClasses(row.usageHealth)}`}>
          {usageHealthLabel(row.usageHealth)}
        </span>
      </td>
      <td className="px-4 py-3 align-middle">
        <form action="/api/admin/account-context" method="post">
          <input type="hidden" name="companyId" value={row.companyId} />
          <button
            type="submit"
            className="inline-flex items-center rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
            aria-label={`Enter ${row.companyName} company account`}
          >
            Enter company <span aria-hidden="true">→</span>
          </button>
        </form>
      </td>
    </tr>
  );
}

export default async function CompanyScopedCompaniesPage() {
  const [data, licenseProvisioningData] = await Promise.all([
    getAdminCompanyScopedOverviewData(),
    getAdminLicensesPageData()
  ]);
  const summary = summarizeCompanyScopedCompaniesDirectory(data.companies);

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Companies"
        subtitle="Manage company-scoped license accounts, access, seats, and usage."
        tag="Company-Scoped License Dashboard"
        action={<CompanyScopedCreateCompanyAction hostCompanies={licenseProvisioningData.hostCompanies} />}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total licensed companies"
          value={formatCount(summary.totalLicensedCompanies)}
        />
        <SummaryCard label="Active companies" value={formatCount(summary.activeCompanies)} />
        <SummaryCard
          label="Companies with pending invites"
          value={formatCount(summary.companiesWithPendingInvites)}
        />
        <SummaryCard
          label="Companies near/over limits"
          value={formatCount(summary.companiesNearOrOverLimits)}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1520px] table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[17%] px-4 py-3.5">Company</th>
                <th className="w-[9%] px-4 py-3.5">License Status</th>
                <th className="w-[10%] px-4 py-3.5">License Tier</th>
                <th className="w-[11%] px-4 py-3.5">Seats Used / Allocated</th>
                <th className="w-[7%] px-4 py-3.5">Active Users</th>
                <th className="w-[8%] px-4 py-3.5">Pending Invites</th>
                <th className="w-[7%] px-4 py-3.5">Active Events</th>
                <th className="w-[8%] px-4 py-3.5">Events This Month</th>
                <th className="w-[8%] px-4 py-3.5">Leads Captured</th>
                <th className="w-[11%] px-4 py-3.5">Last Activity</th>
                <th className="w-[8%] px-4 py-3.5">Usage Health</th>
                <th className="w-[12%] px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((row) => (
                <CompanyDirectoryRow key={row.companyId} row={row} />
              ))}
              {data.companies.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-500">
                    No company-scoped licenses found.
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
