"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AddExhibitorModal } from "@/components/admin/add-exhibitor-modal";
import {
  formatCurrency,
  formatLicenseStatus,
  getSeatUsagePercent
} from "@/lib/client/admin-formatters";
import {
  AdminExhibitorEventOption,
  AdminExhibitorRow,
  AdminHostCompanyOption
} from "@/lib/data/admin-exhibitors";
import {
  OrganizerFilterBar,
  OrganizerFilterField,
  OrganizerFilterSelect,
  OrganizerSearchField
} from "@/components/organizer/organizer-filter-bar";

type ExhibitorsIndexClientProps = {
  events: AdminExhibitorEventOption[];
  exhibitors: AdminExhibitorRow[];
  hostCompanies: AdminHostCompanyOption[];
  defaultEventId: string;
  detailBasePath?: string;
  allowCreate?: boolean;
  eventStorageKey?: string;
  currencyMaximumFractionDigits?: number;
  showEventFilter?: boolean;
  eventContextLabel?: string;
  /** Organizer-style table toolbar: filters, sort, prominent search; lighter event context. */
  toolbarVariant?: "default" | "explorer";
  /** Route event changes through the server loader instead of filtering a platform-wide payload. */
  serverEventFiltering?: boolean;
};

const PAGE_SIZE = 10;

export function ExhibitorsIndexClient({
  events,
  exhibitors,
  hostCompanies,
  defaultEventId,
  detailBasePath = "/admin/exhibitors",
  allowCreate = true,
  eventStorageKey,
  currencyMaximumFractionDigits,
  showEventFilter = true,
  eventContextLabel,
  toolbarVariant = "default",
  serverEventFiltering = false
}: ExhibitorsIndexClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const routeSearchParams = useSearchParams();
  const [eventId, setEventId] = useState(defaultEventId);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [utilizationFilter, setUtilizationFilter] = useState<"all" | "low" | "medium" | "high">("all");
  const [sortOption, setSortOption] = useState<"name" | "revenue" | "seatsUsed" | "seatsPurchased">("name");

  useEffect(() => {
    if (!events.length) return;

    if (!eventStorageKey) {
      setEventId(defaultEventId || events[0]?.id || "");
      return;
    }

    try {
      const stored = window.localStorage.getItem(eventStorageKey) ?? "";
      if (stored && events.some((event) => event.id === stored)) {
        setEventId(stored);
        return;
      }
    } catch {
      // Ignore localStorage read errors.
    }

    setEventId(defaultEventId || events[0]?.id || "");
  }, [defaultEventId, eventStorageKey, events]);

  function selectEvent(nextEventId: string) {
    setEventId(nextEventId);
    if (!serverEventFiltering) return;

    const params = new URLSearchParams(routeSearchParams.toString());
    params.set("eventId", nextEventId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    if (!eventStorageKey || !eventId) return;
    try {
      window.localStorage.setItem(eventStorageKey, eventId);
    } catch {
      // Ignore localStorage write errors.
    }
  }, [eventId, eventStorageKey]);

  const selectedEventName = useMemo(() => {
    if (!eventId) return "No event selected";
    return events.find((row) => row.id === eventId)?.name ?? "Unknown event";
  }, [eventId, events]);

  const searchFiltered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return exhibitors.filter((exhibitor) => {
      if (eventId && exhibitor.eventId !== eventId) return false;
      if (!normalizedSearch) return true;
      return exhibitor.name.toLowerCase().includes(normalizedSearch);
    });
  }, [exhibitors, eventId, search]);

  const filteredExhibitors = useMemo(() => {
    if (toolbarVariant !== "explorer") {
      return searchFiltered;
    }
    let rows = [...searchFiltered];
    if (statusFilter === "active") {
      rows = rows.filter((e) => e.licenseStatus === "active");
    } else if (statusFilter === "inactive") {
      rows = rows.filter((e) => e.licenseStatus !== "active");
    }
    if (utilizationFilter !== "all") {
      rows = rows.filter((e) => utilizationTier(e) === utilizationFilter);
    }
    rows.sort((a, b) => compareExhibitorsForSort(a, b, sortOption));
    return rows;
  }, [searchFiltered, toolbarVariant, statusFilter, utilizationFilter, sortOption]);

  useEffect(() => {
    setCurrentPage(1);
  }, [eventId, search, statusFilter, utilizationFilter, sortOption, toolbarVariant]);

  const totalPages = Math.max(1, Math.ceil(filteredExhibitors.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const paginatedExhibitors = filteredExhibitors.slice(pageStart, pageStart + PAGE_SIZE);

  const kpis = useMemo(() => {
    const seatTotal = filteredExhibitors.reduce((sum, row) => sum + row.seatsPurchased, 0);
    const seatsUsed = filteredExhibitors.reduce((sum, row) => sum + row.seatsUsed, 0);
    const totalRevenue = filteredExhibitors.reduce((sum, row) => sum + row.revenue, 0);
    return {
      totalExhibitors: filteredExhibitors.length,
      totalSeatsPurchased: seatTotal,
      totalRevenue,
      avgSeatUtilization: seatTotal ? Math.round((seatsUsed / seatTotal) * 100) : 0
    };
  }, [filteredExhibitors]);

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Exhibitors</h1>
          {allowCreate ? (
            <button
              type="button"
              onClick={() => setOpenCreateModal(true)}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!events.length && !hostCompanies.length}
            >
              + Add exhibitor company
            </button>
          ) : null}
        </div>
        <p className="text-sm text-slate-600">
          Monitor exhibitor companies and event participation — seat metrics are per event link
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Exhibitors" value={kpis.totalExhibitors} />
        <Metric label="Total Seats Purchased" value={kpis.totalSeatsPurchased} />
        <Metric
          label="Total Revenue"
          value={formatCurrency(kpis.totalRevenue, "USD", {
            maximumFractionDigits: currencyMaximumFractionDigits
          })}
          tone="positive"
        />
        <Metric label="Avg Seat Utilization" value={`${kpis.avgSeatUtilization}%`} />
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
        {toolbarVariant === "explorer" ? (
          <OrganizerFilterBar
            filters={
              <>
                <OrganizerFilterField label="Status">
                  <OrganizerFilterSelect
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                    aria-label="Filter by status"
                  >
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </OrganizerFilterSelect>
                </OrganizerFilterField>
                <OrganizerFilterField label="Utilization">
                  <OrganizerFilterSelect
                    value={utilizationFilter}
                    onChange={(e) =>
                      setUtilizationFilter(e.target.value as "all" | "low" | "medium" | "high")
                    }
                    aria-label="Filter by utilization"
                  >
                    <option value="all">All</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </OrganizerFilterSelect>
                </OrganizerFilterField>
                <OrganizerFilterField label="Sort">
                  <OrganizerFilterSelect
                    value={sortOption}
                    onChange={(e) =>
                      setSortOption(e.target.value as "name" | "revenue" | "seatsUsed" | "seatsPurchased")
                    }
                    aria-label="Sort exhibitors"
                  >
                    <option value="name">Name</option>
                    <option value="revenue">Revenue</option>
                    <option value="seatsUsed">Seats used</option>
                    <option value="seatsPurchased">Seats purchased</option>
                  </OrganizerFilterSelect>
                </OrganizerFilterField>
              </>
            }
            search={
              <OrganizerFilterField label="Search" className="w-full">
                <OrganizerSearchField
                  value={search}
                  onChange={setSearch}
                  placeholder="Search exhibitors…"
                  aria-label="Search exhibitors"
                />
              </OrganizerFilterField>
            }
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {showEventFilter ? (
              <>
                <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Filter By Event</span>
                <select
                  value={eventId}
                  onChange={(event) => selectEvent(event.target.value)}
                  className="h-9 min-w-[220px] rounded-lg border border-border bg-white px-3 text-sm font-medium"
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="rounded-md bg-accentSoft px-2.5 py-1 text-xs font-semibold text-accent md:text-sm">
                {eventContextLabel ?? selectedEventName}
              </span>
            )}
            <span className="rounded-md bg-accentSoft px-2.5 py-1 text-xs font-semibold text-accent md:text-sm">
              {filteredExhibitors.length} exhibitors in {selectedEventName}
            </span>
            <div className="relative ml-auto w-full min-w-[240px] flex-1 md:max-w-sm">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search exhibitors..."
                className="h-9 w-full rounded-lg border border-border bg-white pl-10 pr-3 text-sm placeholder:text-slate-400"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <SearchIcon />
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
        <div className="mt-4">
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[38%] px-3 py-2.5 text-[11px]">Exhibitor Name</th>
                <th className="w-[14%] px-3 py-2.5 text-[11px]">Seats Purchased</th>
                <th className="w-[20%] px-3 py-2.5 text-[11px]">Seats Used</th>
                <th className="w-[16%] px-3 py-2.5 text-[11px]">License Status</th>
                <th className="hidden w-[10%] px-3 py-2.5 text-[11px] lg:table-cell">Revenue</th>
                <th className="w-[18%] px-3 py-2.5 text-[11px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedExhibitors.map((exhibitor) => {
                const usagePct = getSeatUsagePercent(exhibitor.seatsUsed, exhibitor.seatsPurchased);
                const detailHref = exhibitor.participationId
                  ? `${detailBasePath}/${exhibitor.participationId}?eventId=${exhibitor.eventId}`
                  : null;
                return (
                  <tr
                    key={exhibitor.id}
                    className={`${detailHref ? "cursor-pointer" : ""} border-b border-border/70 text-sm text-slate-700 transition hover:bg-slate-50/80 last:border-none`}
                    onClick={() => {
                      if (detailHref) router.push(detailHref);
                    }}
                  >
                    <td className="px-3 py-3 text-sm font-semibold text-slate-900">
                      <span className="block truncate">{exhibitor.name}</span>
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">{exhibitor.seatsPurchased}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-700">{exhibitor.seatsUsed}</span>
                        <div className="h-2.5 w-20 rounded-full bg-slate-100">
                          <div className="h-2.5 rounded-full bg-accent" style={{ width: `${usagePct}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          exhibitor.licenseStatus === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : exhibitor.licenseStatus === "none"
                              ? "bg-slate-200 text-slate-600"
                              : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {formatLicenseStatus(exhibitor.licenseStatus)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-sm font-semibold text-emerald-600 lg:table-cell">
                      {formatCurrency(exhibitor.revenue, "USD", {
                        maximumFractionDigits: currencyMaximumFractionDigits
                      })}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <form
                          action="/api/admin/account-context"
                          method="post"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input type="hidden" name="companyId" value={exhibitor.companyId} />
                          <button
                            type="submit"
                            className="text-sm font-semibold text-violet-700 hover:underline"
                            aria-label={`Jump into ${exhibitor.name}`}
                          >
                            Jump in
                          </button>
                        </form>
                        {detailHref ? (
                          <Link
                            href={detailHref}
                            onClick={(event) => event.stopPropagation()}
                            className="text-sm font-semibold text-accent hover:underline"
                          >
                            View Details
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedExhibitors.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                    No exhibitors found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-slate-500">
            Showing {filteredExhibitors.length === 0 ? 0 : pageStart + 1}-
            {Math.min(pageStart + PAGE_SIZE, filteredExhibitors.length)} of {filteredExhibitors.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-xs font-medium text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {allowCreate ? (
        <AddExhibitorModal
          open={openCreateModal}
          events={events}
          hostCompanies={hostCompanies}
          pageEventId={eventId}
          onClose={() => setOpenCreateModal(false)}
          onCreated={() => {
            setOpenCreateModal(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: number | string;
  tone?: "default" | "positive";
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-4">
      <p className={`text-2xl font-bold sm:text-3xl ${tone === "positive" ? "text-emerald-600" : "text-slate-950"}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-600">{label}</p>
    </article>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Seat usage buckets for filter: low 0–33%, medium 34–66%, high 67–100%. */
function utilizationTier(exhibitor: AdminExhibitorRow): "low" | "medium" | "high" {
  const pct = getSeatUsagePercent(exhibitor.seatsUsed, exhibitor.seatsPurchased);
  if (pct <= 33) return "low";
  if (pct <= 66) return "medium";
  return "high";
}

function compareExhibitorsForSort(
  a: AdminExhibitorRow,
  b: AdminExhibitorRow,
  sortOption: "name" | "revenue" | "seatsUsed" | "seatsPurchased"
): number {
  switch (sortOption) {
    case "name":
      return a.name.localeCompare(b.name);
    case "revenue":
      return b.revenue - a.revenue;
    case "seatsUsed":
      return b.seatsUsed - a.seatsUsed;
    case "seatsPurchased":
      return b.seatsPurchased - a.seatsPurchased;
    default:
      return 0;
  }
}
