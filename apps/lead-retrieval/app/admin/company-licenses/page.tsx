import { AdminPageHeader } from "@/components/admin/admin-ui";
import {
  getAdminCompanyScopedOverviewData,
  type CompanyScopedLicenseStatus,
  type CompanyScopedOverviewRow,
  type CompanyScopedUsageHealth
} from "@/lib/data/admin-company-licenses-overview";

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

function KpiCard({
  label,
  value,
  hint
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
      <p className="text-3xl font-bold text-slate-950 md:text-4xl">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-600 md:text-base">{label}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500 md:text-sm">{hint}</p> : null}
    </article>
  );
}

function CompanyUsageRow({ row }: { row: CompanyScopedOverviewRow }) {
  return (
    <tr className="border-b border-border/70 text-sm text-slate-700 last:border-none hover:bg-slate-50/80">
      <td className="px-4 py-4 align-top">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{row.companyName}</p>
          <p className="truncate text-xs text-slate-500">{row.companyId}</p>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${licenseStatusClasses(row.licenseStatus)}`}>
          {licenseStatusLabel(row.licenseStatus)}
        </span>
      </td>
      <td className="px-4 py-4 align-top font-medium text-slate-700">{row.licenseTier}</td>
      <td className="px-4 py-4 align-top font-semibold text-slate-900">{formatSeats(row.seatsUsed, row.seatsAllocated)}</td>
      <td className="px-4 py-4 align-top font-medium text-slate-700">{formatCount(row.activeUsers)}</td>
      <td className="px-4 py-4 align-top font-medium text-slate-700">{formatCount(row.pendingInvites)}</td>
      <td className="px-4 py-4 align-top font-medium text-slate-700">{formatCount(row.activeEvents)}</td>
      <td className="px-4 py-4 align-top font-medium text-slate-700">{formatCount(row.eventsThisMonth)}</td>
      <td className="px-4 py-4 align-top font-medium text-slate-700">{formatCount(row.leadsCaptured)}</td>
      <td className="px-4 py-4 align-top text-sm text-slate-600">{formatDateTime(row.lastActivityAt)}</td>
      <td className="px-4 py-4 align-top">
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${usageHealthClasses(row.usageHealth)}`}>
          {usageHealthLabel(row.usageHealth)}
        </span>
      </td>
    </tr>
  );
}

export default async function CompanyScopedDashboardOverviewPage() {
  const data = await getAdminCompanyScopedOverviewData();

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Overview"
        subtitle="Access and license operations across company-scoped customers, seats, users, events, and usage."
        tag="Company-Scoped License Dashboard"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Licensed Companies" value={formatCount(data.kpis.licensedCompanies)} />
        <KpiCard label="Active Licenses" value={formatCount(data.kpis.activeLicenses)} />
        <KpiCard
          label="Seats Used / Allocated"
          value={formatSeats(data.kpis.seatsUsed, data.kpis.seatsAllocated)}
          hint="Display uses current license cache."
        />
        <KpiCard label="Active Users" value={formatCount(data.kpis.activeUsers)} />
        <KpiCard
          label="Pending Invites"
          value={formatCount(data.kpis.pendingInvites)}
          hint="Invited memberships only."
        />
        <KpiCard label="Active Events" value={formatCount(data.kpis.activeEvents)} />
        <KpiCard
          label="Events This Month"
          value={formatCount(data.kpis.eventsThisMonth)}
          hint="Events with a start date this month."
        />
        <KpiCard
          label="Leads Captured"
          value={formatCount(data.kpis.leadsCaptured)}
          hint="Total captured leads only."
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="border-b border-border bg-slate-50 px-4 py-4">
          <h2 className="text-xl font-semibold text-slate-950 md:text-2xl">Company Usage</h2>
          <p className="mt-1 text-sm text-slate-600">
            Latest company-scoped license per company with seat, user, event, and usage rollups.
          </p>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1380px] table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[17%] px-4 py-3.5">Company</th>
                <th className="w-[10%] px-4 py-3.5">License Status</th>
                <th className="w-[11%] px-4 py-3.5">License Tier</th>
                <th className="w-[11%] px-4 py-3.5">Seats Used / Allocated</th>
                <th className="w-[7%] px-4 py-3.5">Active Users</th>
                <th className="w-[8%] px-4 py-3.5">Pending Invites</th>
                <th className="w-[7%] px-4 py-3.5">Active Events</th>
                <th className="w-[8%] px-4 py-3.5">Events This Month</th>
                <th className="w-[8%] px-4 py-3.5">Leads Captured</th>
                <th className="w-[13%] px-4 py-3.5">Last Activity</th>
                <th className="w-[10%] px-4 py-3.5">Usage Health</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((row) => (
                <CompanyUsageRow key={row.companyId} row={row} />
              ))}
              {data.companies.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-500">
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
