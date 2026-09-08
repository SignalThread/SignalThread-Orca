import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { formatEventDateRange, formatEventLocation } from "@/lib/data/admin-events";

export default async function OrganizerEventsPage() {
  const sessionUser = await requireRole("organizer_admin");
  const scope = await getOrganizerScope(sessionUser.id);

  if (!scope.events.length) {
    return (
      <section className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Events</h1>
        <p className="text-slate-600">No events are currently assigned to your organizer account.</p>
      </section>
    );
  }

  const supabase = createAdminClient();
  const eventMetrics = await Promise.all(
    scope.events.map(async (event) => {
      const [exhibitors, licenses, leads] = await Promise.all([
        (supabase as any)
          .from("exhibitors")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id),
        (supabase as any)
          .from("licenses")
          .select("id, price_cents")
          .eq("event_id", event.id),
        (supabase as any)
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("event_id", event.id)
      ]);

      if (exhibitors.error) console.error("[organizer events] exhibitors fetch failed:", exhibitors.error.message, exhibitors.error.code);
      if (licenses.error) console.error("[organizer events] licenses fetch failed:", licenses.error.message, licenses.error.code);
      if (leads.error) console.error("[organizer events] leads fetch failed:", leads.error.message, leads.error.code);

      const revenue = ((licenses.data ?? []) as Array<{ price_cents: number | null }>).reduce(
        (sum, row) => sum + Math.max(0, Number(row.price_cents ?? 0)) / 100,
        0
      );

      return {
        ...event,
        exhibitors: exhibitors.count ?? 0,
        licenses: (licenses.data ?? []).length,
        leads: leads.count ?? 0,
        revenue
      };
    })
  );

  return (
    <section className="space-y-7">
      <header className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-slate-950">Events</h1>
        <p className="text-slate-600">Organizer-scoped event list and rollups.</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <table className="w-full table-auto text-left text-sm">
          <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Dates</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Exhibitors</th>
              <th className="px-4 py-3">Licenses</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {eventMetrics.map((event) => (
              <tr key={event.id} className="border-b border-border/70 last:border-none hover:bg-slate-50/70">
                <td className="px-4 py-3.5 align-top">
                  <p className="text-base font-semibold text-slate-900">{event.name}</p>
                  <p className="text-xs text-slate-500">{formatEventLocation(event.city, event.state, event.location)}</p>
                </td>
                <td className="px-4 py-3.5 align-top font-medium text-slate-700">
                  {formatEventDateRange(event.startDate, event.endDate)}
                </td>
                <td className="px-4 py-3.5 align-top">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {String(event.status ?? "").toLowerCase() || "unknown"}
                  </span>
                </td>
                <td className="px-4 py-3.5 align-top font-semibold">{event.exhibitors}</td>
                <td className="px-4 py-3.5 align-top font-semibold">{event.licenses}</td>
                <td className="px-4 py-3.5 align-top font-semibold">{event.leads}</td>
                <td className="px-4 py-3.5 align-top font-semibold">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0
                  }).format(event.revenue)}
                </td>
                <td className="px-4 py-3.5 align-top">
                  <Link href={`/app/organizer?eventId=${encodeURIComponent(event.id)}`} className="font-semibold text-accent hover:underline">
                    Open dashboard
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}
