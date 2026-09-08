import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminPageHeader, EventStatusBadge } from "@/components/admin/admin-ui";
import {
  formatCurrency,
  formatEventDateRange,
  formatEventLocation,
  getAdminEventsSummaries,
  getAdminEventSummariesForCompanyId,
  getAdminEventSummariesForEventIds
} from "@/lib/data/admin-events";
import { hasActivePlatformAdminAccountContext, requireAuth } from "@/lib/auth/session";
import { resolveAdminAppEventScopeForUser } from "@/lib/server/admin-app-event-scope";

export default async function AdminEventsIndexPage() {
  const sessionUser = await requireAuth();

  let subtitle = "Manage all events across the platform";
  let events;

  if (hasActivePlatformAdminAccountContext(sessionUser)) {
    subtitle = `Events for ${sessionUser.active_company_name ?? "this company"}`;
    events = await getAdminEventSummariesForCompanyId(String(sessionUser.company_id ?? ""));
  } else if (sessionUser.role === "exhibitor_admin") {
    const scope = await resolveAdminAppEventScopeForUser(sessionUser);
    if (scope.kind !== "exhibitor" || !scope.multiEventLicensed) {
      notFound();
    }
    subtitle = "Events for your company";
    events = await getAdminEventSummariesForEventIds(scope.accessibleEvents.map((e) => e.id));
  } else {
    events = await getAdminEventsSummaries();
  }

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Events"
        subtitle={subtitle}
        tag={`${events.length} Total`}
        action={
          <Link
            href="/admin/events/new"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-base font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
          >
            + Create Event
          </Link>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="w-full overflow-x-auto">
          <table className="min-w-[1080px] w-full table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[24%] px-4 py-3">Event</th><th className="w-[16%] px-4 py-3">Dates</th>
                <th className="w-[11%] px-4 py-3">Status</th><th className="w-[9%] px-4 py-3">Exhibitors</th>
                <th className="w-[7%] px-4 py-3">Users</th><th className="w-[8%] px-4 py-3">Licenses</th>
                <th className="w-[7%] px-4 py-3">Leads</th><th className="w-[8%] px-4 py-3">Revenue</th>
                <th className="w-[10%] px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border/70 text-sm text-slate-700 last:border-none hover:bg-slate-50/80">
                  <td className="px-4 py-3 align-middle"><p className="truncate text-base font-semibold leading-5 text-slate-900" title={event.name}>
                      {event.name}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-slate-500" title={formatEventLocation(event.city, event.state, event.location)}>
                      {formatEventLocation(event.city, event.state, event.location)}
                    </p>
                  </td>
                  <td className="px-4 py-3 align-middle text-sm font-medium text-slate-700">
                    {formatEventDateRange(event.start_date, event.end_date)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <EventStatusBadge status={event.status.toLowerCase() as "active" | "upcoming" | "completed"} />
                  </td>
                  <td className="px-4 py-3 align-middle text-sm font-semibold">{event.metrics.exhibitors}</td><td className="px-4 py-3 align-middle text-sm font-semibold">{event.metrics.users}</td><td className="px-4 py-3 align-middle text-sm font-semibold">{event.metrics.licenses}</td><td className="px-4 py-3 align-middle text-sm font-semibold">{event.metrics.leads.toLocaleString("en-US")}</td><td className="px-4 py-3 align-middle text-sm font-semibold">{formatCurrency(event.metrics.revenue)}</td>
                  <td className="px-4 py-3 align-middle"><Link href={`/admin/events/${event.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                      View Detail
                      <span aria-hidden="true">›</span>
                    </Link>
                  </td>
                </tr>
              ))}
              {events.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                    No events yet. Create your first event to get started.
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
