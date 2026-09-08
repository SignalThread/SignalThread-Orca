import Link from "next/link";
import { AdminPageHeader, MetricCard } from "@/components/admin/admin-ui";
import { getAdminDashboardData } from "@/lib/data/admin-dashboard";

function formatDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export default async function PlatformAdminDashboardPage() {
  const data = await getAdminDashboardData();
  const maxRevenue = Math.max(1, ...data.revenueByEvent.map((row) => row.revenue));
  const maxDistribution = Math.max(
    1,
    ...data.licenseDistributionByEvent.map((row) => row.active + row.trial + row.expired)
  );

  return (
    <section className="admin-dashboard-page space-y-7">
      <AdminPageHeader
        title="Platform Dashboard"
        subtitle="Business oversight and platform governance metrics"
        tag="Revenue & License Management"
      />

      <section className="admin-dashboard-metrics grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => (
          <Link
            key={metric.label}
            href={metric.href}
            className="admin-dashboard-metric-link block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <MetricCard metric={metric} compact />
          </Link>
        ))}
      </section>

      <section className="admin-dashboard-charts grid grid-cols-1 gap-6 xl:grid-cols-2">
        <article className="admin-panel admin-chart-panel rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
          <h2 className="admin-panel-title text-2xl font-semibold text-slate-950 md:text-3xl">Revenue by Event</h2>
          <div className="mt-5 grid gap-3">
            {data.revenueByEvent.map((row) => (
              <div key={row.eventId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <Link href={`/admin/events/${row.eventId}`} className="font-semibold text-slate-700 hover:text-accent">
                    {row.eventName}
                  </Link>
                  <span className="font-semibold text-slate-600">{formatDollars(row.revenue)}</span>
                </div>
                <div className="admin-chart-track h-3 rounded-full bg-slate-100">
                  <div
                    className="admin-chart-fill h-3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-600"
                    style={{ width: `${Math.max(8, Math.round((row.revenue / maxRevenue) * 100))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="admin-panel admin-chart-panel rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
          <h2 className="admin-panel-title text-2xl font-semibold text-slate-950 md:text-3xl">License Distribution by Event</h2>
          <div className="mt-5 grid gap-4">
            {data.licenseDistributionByEvent.map((row) => {
              const total = row.active + row.trial + row.expired;
              const activePct = (row.active / maxDistribution) * 100;
              const trialPct = (row.trial / maxDistribution) * 100;
              const expiredPct = (row.expired / maxDistribution) * 100;

              return (
                <div key={row.eventId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <Link href={`/admin/events/${row.eventId}`} className="font-semibold text-slate-700 hover:text-accent">
                      {row.eventName}
                    </Link>
                    <span className="font-semibold text-slate-600">{total} licenses</span>
                  </div>
                  <div className="admin-chart-track flex h-4 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-500" style={{ width: `${activePct}%` }} title={`Active ${row.active}`} />
                    <div className="bg-amber-400" style={{ width: `${trialPct}%` }} title={`Trial ${row.trial}`} />
                    <div className="bg-rose-500" style={{ width: `${expiredPct}%` }} title={`Expired ${row.expired}`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex items-center gap-5 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500" /> Active
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-400" /> Trial
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500" /> Expired
            </span>
          </div>
        </article>
      </section>

      <article className="admin-panel rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-6">
        <h2 className="admin-panel-title text-2xl font-semibold text-slate-950 md:text-3xl">Seat Utilization Overview</h2>
        <div className="mt-5 w-full overflow-hidden">
          <table className="admin-table w-full table-fixed text-left text-sm">
            <thead className="admin-table-head">
              <tr className="border-b border-border text-xs uppercase tracking-[0.08em] text-slate-500">
                <th className="w-[44%] py-3 pr-4 font-semibold">Event</th>
                <th className="w-[16%] py-3 pr-4 font-semibold">Purchased</th>
                <th className="w-[16%] py-3 pr-4 font-semibold">Used</th>
                <th className="w-[24%] py-3 pr-4 font-semibold">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {data.seatUtilization.map((row) => (
                <tr key={row.eventId} className="border-b border-border/60 transition hover:bg-slate-50/80 last:border-none">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/events/${row.eventId}`} className="font-semibold text-slate-700 hover:text-accent">
                      {row.eventName}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 font-medium text-slate-700">{row.seatsPurchased}</td>
                  <td className="py-3 pr-4 font-medium text-slate-700">{row.seatsUsed}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="admin-chart-track h-2.5 w-full rounded-full bg-slate-100">
                        <div className="admin-chart-fill h-2.5 rounded-full bg-accent" style={{ width: `${row.utilizationRate}%` }} />
                      </div>
                      <span className="w-12 text-right font-semibold text-slate-700">{row.utilizationRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
