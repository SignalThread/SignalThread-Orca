"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddExhibitorModal } from "@/components/admin/add-exhibitor-modal";
import { LicenseStatusBadge } from "@/components/admin/admin-ui";
import type { ExhibitorOverview } from "@/lib/data/platform-admin";

type EventExhibitorsTabProps = {
  eventId: string;
  eventName: string;
  exhibitors: ExhibitorOverview[];
};

export function EventExhibitorsTab({ eventId, eventName, exhibitors }: EventExhibitorsTabProps) {
  const router = useRouter();
  const [openAddModal, setOpenAddModal] = useState(false);

  return (
    <div className="space-y-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold text-slate-950 md:text-4xl">Exhibitors in this Event</h2>
          <p className="text-base text-slate-600 md:text-lg">{exhibitors.length} exhibitors total</p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAddModal(true)}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-base font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
        >
          + Add exhibitor company
        </button>
      </div>

      <div className="w-full overflow-hidden">
        <table className="w-full table-fixed text-left">
          <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="w-[38%] px-3 py-3 sm:px-4">Exhibitor Name</th>
              <th className="hidden w-[10%] px-3 py-3 md:table-cell sm:px-4">Users</th>
              <th className="hidden w-[10%] px-3 py-3 lg:table-cell sm:px-4">Licenses</th>
              <th className="hidden w-[12%] px-3 py-3 lg:table-cell sm:px-4">Leads</th>
              <th className="w-[18%] px-3 py-3 sm:px-4">Status</th>
              <th className="w-[22%] px-3 py-3 sm:px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {exhibitors.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-border/70 text-sm text-slate-700 transition hover:bg-slate-50/80 last:border-none"
                onClick={() => router.push(`/admin/exhibitors/${row.id}?eventId=${eventId}`)}
              >
                <td className="px-3 py-4 text-base font-semibold text-slate-900 sm:px-4 md:text-xl">
                  <span className="block truncate" title={row.name}>
                    {row.name}
                  </span>
                </td>
                <td className="hidden px-3 py-4 font-semibold md:table-cell sm:px-4">{row.userCount}</td>
                <td className="hidden px-3 py-4 font-semibold lg:table-cell sm:px-4">{row.licenseCount}</td>
                <td className="hidden px-3 py-4 font-semibold lg:table-cell sm:px-4">{row.leadCount.toLocaleString("en-US")}</td>
                <td className="px-3 py-4 sm:px-4">
                  <LicenseStatusBadge status={row.licenseStatus} />
                </td>
                <td className="px-3 py-4 sm:px-4">
                  <Link
                    href={`/admin/exhibitors/${row.id}?eventId=${eventId}`}
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-accent hover:underline"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddExhibitorModal
        open={openAddModal}
        events={[{ id: eventId, name: eventName }]}
        hostCompanies={[]}
        pageEventId={eventId}
        onClose={() => setOpenAddModal(false)}
        onCreated={() => {
          setOpenAddModal(false);
          router.refresh();
        }}
      />
    </div>
  );
}
