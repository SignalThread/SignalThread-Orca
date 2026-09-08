"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CreateEventModal } from "@/components/admin/create-event-modal";
import {
  EventStatusBadge,
  AdminPageHeader
} from "@/components/admin/admin-ui";
import {
  PlatformEvent,
  formatCurrency,
  formatEventStatus
} from "@/lib/data/platform-admin";

type EventsIndexClientProps = {
  events: PlatformEvent[];
};

function formatEventTableDateRange(event: Pick<PlatformEvent, "startDate" | "endDate">) {
  const start = new Date(`${event.startDate}T12:00:00Z`);
  const end = new Date(`${event.endDate}T12:00:00Z`);

  const formatOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric"
  };

  return `${start.toLocaleDateString("en-US", formatOptions)} - ${end.toLocaleDateString("en-US", formatOptions)}`;
}

export function EventsIndexClient({ events }: EventsIndexClientProps) {
  const router = useRouter();
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const totalEvents = useMemo(() => events.length, [events]);

  return (
    <section className="space-y-7">
      <AdminPageHeader
        title="Events"
        subtitle="Manage all events across the platform"
        tag={`${totalEvents} Total`}
        action={
          <button
            type="button"
            onClick={() => setOpenCreateModal(true)}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-3 text-base font-semibold text-white shadow-sm hover:from-indigo-600 hover:to-violet-700"
          >
            + Create Event
          </button>
        }
      />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div>
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[28%] px-5 py-4">Event</th>
                <th className="w-[18%] px-5 py-4">Dates</th>
                <th className="w-[10%] px-5 py-4">Status</th>
                <th className="w-[8%] px-5 py-4"># Exhibitors</th>
                <th className="hidden w-[8%] px-5 py-4 xl:table-cell"># Users</th>
                <th className="hidden w-[8%] px-5 py-4 2xl:table-cell"># Licenses</th>
                <th className="hidden w-[8%] px-5 py-4 2xl:table-cell"># Leads</th>
                <th className="w-[10%] px-5 py-4">Revenue</th>
                <th className="w-[8%] px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="cursor-pointer border-b border-border/70 text-sm text-slate-700 transition hover:bg-slate-50/80 last:border-none"
                  onClick={() => router.push(`/admin/events/${event.id}`)}
                >
                  <td className="px-5 py-4 align-top">
                    <div className="min-w-0 max-w-[360px]">
                      <p className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900">
                        {event.name}
                      </p>
                      <p className="mt-0.5 truncate text-sm leading-5 text-slate-500">{event.location}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top text-sm font-medium text-slate-700">
                    <span className="whitespace-nowrap">{formatEventTableDateRange(event)}</span>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <EventStatusBadge status={event.status} />
                    <span className="sr-only">{formatEventStatus(event.status)}</span>
                  </td>
                  <td className="px-5 py-4 align-top text-base font-semibold">{event.exhibitors}</td>
                  <td className="hidden px-5 py-4 align-top text-base font-semibold xl:table-cell">{event.users}</td>
                  <td className="hidden px-5 py-4 align-top text-base font-semibold 2xl:table-cell">{event.licenses}</td>
                  <td className="hidden px-5 py-4 align-top text-base font-semibold 2xl:table-cell">{event.leads.toLocaleString("en-US")}</td>
                  <td className="px-5 py-4 align-top text-base font-semibold">{formatCurrency(event.revenue)}</td>
                  <td className="px-5 py-4 align-top">
                    <Link
                      href={`/admin/events/${event.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
                    >
                      View Detail
                      <span aria-hidden="true">›</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <CreateEventModal open={openCreateModal} onClose={() => setOpenCreateModal(false)} />
    </section>
  );
}
